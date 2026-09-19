/**
 * MediSense backend
 * ------------------
 * A small, self-contained Express API that gives the MediSense frontend a
 * real place to store user credentials and app data, instead of only
 * localStorage.
 *
 *   - Passwords are hashed with bcrypt before they ever touch disk. The
 *     plaintext password only exists in memory for the duration of the
 *     request that sent it.
 *   - Sessions are signed JWTs (7-day expiry). The frontend sends them back
 *     as `Authorization: Bearer <token>`.
 *   - App data is stored per-user as arbitrary key/value pairs (mirroring
 *     the shape the frontend already speaks: get/set/delete/list), in a
 *     JSON file on disk. That's enough for a personal or small-class
 *     deployment; swap `readJSON`/`writeJSON` for a real database
 *     (Postgres, SQLite, Mongo…) before running this for many concurrent
 *     users — see README.md.
 *
 * Run it with:
 *   cd server
 *   npm install
 *   npm start
 *
 * It listens on PORT (default 4000) and expects the frontend's
 * VITE_API_URL to point at it (defaults to http://localhost:4000).
 */
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const STORE_FILE = path.join(DATA_DIR, "store.json");

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
const JWT_EXPIRY = "7d";
const SALT_ROUNDS = 10;

if (!process.env.JWT_SECRET) {
  console.warn(
    "\n[medisense-server] WARNING: JWT_SECRET is not set — using an insecure default.\n" +
    "Set a real secret in server/.env before deploying anywhere but your own machine.\n"
  );
}

/* ------------------------------- tiny JSON "database" ------------------------------- */

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}", "utf8");
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, "{}", "utf8");
}
ensureDataFiles();

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || "{}");
  } catch {
    return {};
  }
}

// Writes go through a temp file + rename so a crash mid-write can never
// corrupt the "database". Also serialized per-file so two fast requests
// don't clobber each other.
const writeQueues = new Map();
function writeJSON(file, data) {
  const prev = writeQueues.get(file) || Promise.resolve();
  const next = prev.then(
    () =>
      new Promise((resolve, reject) => {
        const tmp = `${file}.${crypto.randomBytes(4).toString("hex")}.tmp`;
        fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8", (err) => {
          if (err) return reject(err);
          fs.rename(tmp, file, (err2) => (err2 ? reject(err2) : resolve()));
        });
      })
  );
  writeQueues.set(file, next.catch(() => {}));
  return next;
}

function findUserByEmail(email) {
  const users = readJSON(USERS_FILE);
  const normalized = email.trim().toLowerCase();
  return Object.values(users).find((u) => u.email === normalized) || null;
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

/* ---------------------------------- middleware ---------------------------------- */

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing or invalid Authorization header" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const users = readJSON(USERS_FILE);
    const user = users[payload.sub];
    if (!user) return res.status(401).json({ error: "Invalid or expired session" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

/* ------------------------------------- app ------------------------------------- */

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true, service: "medisense-server", time: new Date().toISOString() }));

/* ---- auth ---- */

app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email, and password are all required." });
  if (String(password).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "That doesn't look like a valid email address." });

  if (findUserByEmail(email)) return res.status(409).json({ error: "An account with that email already exists." });

  const users = readJSON(USERS_FILE);
  const id = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const user = { id, name: String(name).trim(), email: email.trim().toLowerCase(), passwordHash, createdAt: new Date().toISOString() };
  users[id] = user;
  writeJSON(USERS_FILE, users);

  const store = readJSON(STORE_FILE);
  store[id] = store[id] || {};
  writeJSON(STORE_FILE, store);

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const user = findUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* ---- per-user data store (mirrors the frontend's window.storage shape) ---- */

app.get("/api/data", requireAuth, (req, res) => {
  const store = readJSON(STORE_FILE);
  const userStore = store[req.user.id] || {};
  const prefix = req.query.prefix || "";
  const keys = Object.keys(userStore).filter((k) => !prefix || k.startsWith(prefix));
  res.json({ keys, prefix: prefix || undefined, shared: false });
});

app.get("/api/data/:key", requireAuth, (req, res) => {
  const store = readJSON(STORE_FILE);
  const userStore = store[req.user.id] || {};
  const value = userStore[req.params.key];
  if (value === undefined) return res.status(404).json({ error: `Key not found: ${req.params.key}` });
  res.json({ key: req.params.key, value, shared: false });
});

app.put("/api/data/:key", requireAuth, async (req, res) => {
  const { value } = req.body || {};
  if (typeof value !== "string") return res.status(400).json({ error: "`value` must be a string (the app JSON.stringifies before sending)." });
  if (Buffer.byteLength(value, "utf8") > 5 * 1024 * 1024) return res.status(413).json({ error: "Value exceeds 5MB limit." });

  const store = readJSON(STORE_FILE);
  store[req.user.id] = store[req.user.id] || {};
  store[req.user.id][req.params.key] = value;
  await writeJSON(STORE_FILE, store);

  res.json({ key: req.params.key, value, shared: false });
});

app.delete("/api/data/:key", requireAuth, async (req, res) => {
  const store = readJSON(STORE_FILE);
  const userStore = store[req.user.id] || {};
  const existed = userStore[req.params.key] !== undefined;
  delete userStore[req.params.key];
  store[req.user.id] = userStore;
  await writeJSON(STORE_FILE, store);

  res.json({ key: req.params.key, deleted: existed, shared: false });
});

/* ---- fallback ---- */

app.use((req, res) => res.status(404).json({ error: "Not found" }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`MediSense server listening on http://localhost:${PORT}`);
});
