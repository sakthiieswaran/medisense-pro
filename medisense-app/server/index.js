/**
 * MediSense Backend API
 * ---------------------
 * Production-oriented Express API with:
 *   - SQLite persistence (node:sqlite) with ACID transactions & migrations
 *   - bcrypt credential hashing & JWT authentication with server-side revocation
 *   - Strict role isolation (patient, doctor, caregiver) & cross-user guards
 *   - Helmet security headers, explicit CORS allowlist, express-rate-limit, express-validator
 *   - Real medical document upload & storage (private disk or Supabase Storage)
 *   - Server-enforced caregiver permissions & audit logging
 *   - Gemini AI health-assistant proxy (no external localhost:3001 needed)
 *   - Web Push VAPID notifications & DPDP compliance (consent, export, erasure)
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { body, param, validationResult } from "express-validator";
import multer from "multer";
import * as webpush from "web-push";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";

import {
  initDatabase,
  syncStateToRelationalTables,
  logAudit,
  runTransaction,
  toPlain,
} from "./db.js";
import { validateConfig, publicHealthConfig } from "./config.js";
import { createMailer } from "./mailer.js";
import { registerAIRoutes } from "./aiProxy.js";
import { analyzeMedications } from "./interactions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
const SALT_ROUNDS = 12;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function encodeStoragePath(objectPath) {
  return String(objectPath)
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

async function deleteSupabaseObject(supabaseConfig, objectPath) {
  if (!supabaseConfig?.configured || !objectPath) return false;
  try {
    const res = await fetch(
      `${supabaseConfig.url}/storage/v1/object/${encodeURIComponent(supabaseConfig.bucket)}/${encodeStoragePath(objectPath)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${supabaseConfig.serviceKey}`,
          apikey: supabaseConfig.serviceKey,
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

function validateFileSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (mimeType === "application/pdf") {
    return buffer.subarray(0, 4).toString("ascii") === "%PDF";
  }
  if (mimeType === "image/png") {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

function extForMime(mime) {
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  return ".bin";
}

function sanitizeFilename(name) {
  return String(name || "document")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function loadOrCreateVapidKeys(dataDir, config) {
  if (config.vapid?.configured) {
    return {
      publicKey: config.vapid.publicKey,
      privateKey: config.vapid.privateKey,
      subject: config.vapid.subject,
    };
  }
  if (config.isProd) return null;

  const vapidFile = path.join(dataDir, "vapid.json");
  try {
    if (fs.existsSync(vapidFile)) {
      const existing = JSON.parse(fs.readFileSync(vapidFile, "utf8"));
      if (existing.publicKey && existing.privateKey) return existing;
    }
    const keys = webpush.generateVAPIDKeys();
    const bundle = {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: config.vapid?.subject || "mailto:dev@medisense.local",
    };
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(vapidFile, JSON.stringify(bundle, null, 2), "utf8");
    return bundle;
  } catch {
    return null;
  }
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at,
  };
}

function seedDevDemoAccounts(db) {
  const now = new Date().toISOString();
  const demoUsers = [
    {
      id: "demo-patient-alex",
      name: "Alex Johnson",
      email: "alex@medisense.demo",
      role: "patient",
    },
    {
      id: "demo-doctor-chen",
      name: "Dr. Sarah Chen",
      email: "dr.chen@medisense.demo",
      role: "doctor",
    },
    {
      id: "demo-caregiver-priya",
      name: "Priya Johnson",
      email: "priya.caregiver@medisense.demo",
      role: "caregiver",
    },
  ];

  const passwordHash = bcrypt.hashSync("demo1234", 10);
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password_hash, role, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const insertConsent = db.prepare(`
    INSERT OR IGNORE INTO consent_records (id, user_id, consent_type, policy_version, granted, granted_at)
    VALUES (?, ?, 'privacy_and_health_processing', '1.0', 1, ?)
  `);

  runTransaction(db, () => {
    for (const u of demoUsers) {
      insertUser.run(u.id, u.name, u.email, passwordHash, u.role, now, now);
      insertConsent.run(`consent-seed-${u.id}`, u.id, now);
    }
    db.prepare(`
      INSERT OR IGNORE INTO caregiver_relationships
        (id, patient_user_id, caregiver_email, caregiver_user_id, caregiver_name, relationship_role, status, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      "demo-caregiver-rel-1",
      "demo-patient-alex",
      "priya.caregiver@medisense.demo",
      "demo-caregiver-priya",
      "Priya Johnson",
      "Family Caregiver (Spouse)",
      JSON.stringify({
        medications: true,
        vitals: true,
        glucose: true,
        activity: false,
        sleep: false,
        nutrition: false,
        records: false,
      }),
      now,
      now
    );
    db.prepare(`
      INSERT OR IGNORE INTO doctor_profiles
        (id, user_id, name, specialty, email, phone, clinic, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "doc1",
      "demo-doctor-chen",
      "Dr. Sarah Chen",
      "Primary care / Endocrinology",
      "dr.chen@medisense.demo",
      "+1 555-0188",
      "MediSense Clinic — Suite 4B",
      now
    );
    db.prepare(`
      INSERT OR IGNORE INTO doctor_patient_relationships
        (id, doctor_user_id, patient_user_id, status, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).run(
      "demo-doc-rel-1",
      "demo-doctor-chen",
      "demo-patient-alex",
      JSON.stringify({
        medications: true,
        vitals: true,
        glucose: true,
        activity: true,
        sleep: true,
        nutrition: true,
        records: true,
      }),
      now,
      now
    );
  });
}

/**
 * Filters a patient state object strictly on the server according to caregiver
 * or doctor permissions so unauthorized health categories never cross the wire.
 */
export function filterPatientForPermissions(patientObj, permissions = {}) {
  if (!patientObj) return null;
  const out = {
    id: patientObj.id,
    name: patientObj.name,
    age: patientObj.age,
    emergencyContact: patientObj.emergencyContact,
  };

  if (permissions.medications) {
    out.medications = (patientObj.medications || []).map((m) => ({
      id: m.id,
      name: m.name,
      genericName: m.genericName,
      dosage: m.dosage,
      unit: m.unit,
      frequency: m.frequency,
      times: m.times,
      instructions: m.instructions,
      active: m.active,
      currentStock: m.currentStock,
    }));
    out.logs = patientObj.logs || [];
    out.notifications = (patientObj.notifications || []).filter(
      (n) => n.category === "medication" || n.type === "missed"
    );
  }

  if (permissions.vitals || permissions.glucose) {
    out.healthRecords = (patientObj.healthRecords || []).map((r) => {
      const filtered = { id: r.id, date: r.date, source: r.source };
      if (permissions.vitals) {
        filtered.heartRate = r.heartRate;
        filtered.restingHeartRate = r.restingHeartRate;
        filtered.systolic = r.systolic;
        filtered.diastolic = r.diastolic;
        filtered.temperature = r.temperature;
        filtered.bloodOxygen = r.bloodOxygen;
        filtered.respiratoryRate = r.respiratoryRate;
        filtered.weight = r.weight;
      }
      if (permissions.glucose) {
        filtered.glucose = r.glucose;
      }
      return filtered;
    });
  }

  if (permissions.activity) {
    out.activity = patientObj.activity || [];
    out.workouts = patientObj.workouts || [];
  }
  if (permissions.sleep) {
    out.sleep = patientObj.sleep || [];
  }
  if (permissions.nutrition) {
    out.nutrition = patientObj.nutrition || [];
    out.hydration = patientObj.hydration || [];
  }
  if (permissions.records) {
    out.records = patientObj.records || {};
    out.conditions = patientObj.conditions;
    out.allergies = patientObj.allergies;
  }

  return out;
}

export function createApp(options = {}) {
  const config = validateConfig(options.env || process.env, options);
  const { nodeEnv, jwtSecret, jwtExpiry, allowedOrigins } = config;

  const dbPath = options.dbPath || path.join(__dirname, "data", "medisense.sqlite");
  const dataDir = dbPath === ":memory:" ? path.join(__dirname, "data") : path.dirname(dbPath);
  const uploadsDir = options.uploadsDir || path.join(__dirname, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });

  const db = initDatabase(dbPath);
  const mailer = options.mailer || createMailer(config.smtp);

  if (config.enableDemoAccounts) {
    seedDevDemoAccounts(db);
  }

  const vapid = loadOrCreateVapidKeys(dataDir, config);
  if (vapid) {
    try {
      webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    } catch (e) {
      console.warn("[medisense-push] Could not initialize web-push VAPID:", e.message);
    }
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin not allowed by CORS"));
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    })
  );

  app.use(express.json({ limit: "6mb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  const disableRateLimit = options.disableRateLimit === true;
  const authLimiter = disableRateLimit
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: nodeEnv === "production" ? 10 : 40,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Too many authentication attempts. Please wait 15 minutes and try again." },
      });

  const aiLimiter = disableRateLimit
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 60 * 1000,
        max: 12,
        keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip || "127.0.0.1"),
        message: { error: "AI request limit reached (12 per minute). Please wait briefly." },
      });

  const apiLimiter = disableRateLimit
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 400,
      });

  app.use("/api/", apiLimiter);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });

  function signToken(user) {
    const jti = crypto.randomUUID();
    return jwt.sign(
      { sub: user.id, role: user.role, jti },
      jwtSecret,
      { expiresIn: jwtExpiry, algorithm: "HS256" }
    );
  }

  function validateRequest(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
    }
    next();
  }

  function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing or invalid Authorization header" });
    try {
      const payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
      if (payload.jti) {
        const revoked = db.prepare("SELECT jti FROM revoked_tokens WHERE jti = ?").get(payload.jti);
        if (revoked) return res.status(401).json({ error: "Session has been logged out" });
      }
      const user = toPlain(db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub));
      if (!user) return res.status(401).json({ error: "Invalid or expired session" });
      req.user = user;
      req.tokenPayload = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
  }

  function requireRole(...roles) {
    return (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        logAudit(db, {
          userId: req.user?.id || null,
          action: "ROLE_ACCESS_DENIED",
          resourceType: "auth",
          ip: req.ip,
          metadata: { required: roles, actual: req.user?.role },
        });
        return res.status(403).json({ error: "Forbidden for your account role" });
      }
      next();
    };
  }

  /* -------------------------------- health -------------------------------- */

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      service: "medisense-server",
      ...publicHealthConfig(config),
      pushConfigured: Boolean(vapid?.publicKey),
      time: new Date().toISOString(),
    });
  });

  /* --------------------------------- auth --------------------------------- */

  app.post(
    "/api/auth/register",
    authLimiter,
    [
      body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Name must be 2–120 characters."),
      body("email").trim().isEmail().normalizeEmail().withMessage("Please enter a valid email address."),
      body("password")
        .isString()
        .isLength({ min: 8, max: 128 })
        .withMessage("Password must be at least 8 characters.")
        .matches(/[A-Za-z]/)
        .withMessage("Password must include at least one letter.")
        .matches(/[0-9]/)
        .withMessage("Password must include at least one number."),
      body("role").optional().isIn(["patient", "caregiver", "doctor"]).withMessage("Invalid role."),
    ],
    validateRequest,
    async (req, res) => {
      const { name, email, password, role = "patient", inviteCode, consentPrivacy, consentHealthProcessing } = req.body;

      // In production require explicit DPDP consent flags; allow legacy API callers if omitted only in non-strict dev or require true when provided
      if (consentPrivacy === false || consentHealthProcessing === false || (config.isProd && (!consentPrivacy || !consentHealthProcessing))) {
        return res.status(400).json({ error: "Consent to Privacy Notice and health data processing is required." });
      }

      if (role === "doctor") {
        const expectedCode = config.doctorInviteCode;
        const code = inviteCode || req.body.doctorInviteCode;
        if (config.isProd) {
          if (!expectedCode || !safeEqual(String(code || ""), expectedCode)) {
            return res.status(403).json({ error: "Doctor accounts require a valid clinic provisioning code." });
          }
        } else if (expectedCode && !safeEqual(String(code || ""), expectedCode)) {
          return res.status(403).json({ error: "Invalid clinic invite code for doctor account." });
        }
      }

      const normalizedEmail = email.toLowerCase();
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
      if (existing) {
        return res.status(409).json({ error: "An account with that email already exists." });
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
      const rawVerifyToken = crypto.randomBytes(24).toString("hex");
      const verifyHash = sha256Hex(rawVerifyToken);

      runTransaction(db, () => {
        db.prepare(`
          INSERT INTO users (id, name, email, password_hash, role, email_verified, verification_token_hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
        `).run(id, name.trim(), normalizedEmail, passwordHash, role, verifyHash, now, now);

        db.prepare(`
          INSERT INTO consent_records (id, user_id, consent_type, policy_version, granted, ip_address, granted_at)
          VALUES (?, ?, 'privacy_and_health_processing', '1.0', 1, ?, ?)
        `).run(crypto.randomUUID(), id, req.ip || null, now);

        // Auto-link any pending caregiver invitations sent to this email
        if (role === "caregiver") {
          db.prepare(`
            UPDATE caregiver_relationships
            SET caregiver_user_id = ?, caregiver_name = COALESCE(caregiver_name, ?), status = 'active', updated_at = ?
            WHERE caregiver_email = ? AND status = 'pending'
          `).run(id, name.trim(), now, normalizedEmail);
        }

        // Provision doctor profile on doctor registration
        if (role === "doctor") {
          db.prepare(`
            INSERT INTO doctor_profiles (id, user_id, name, specialty, email, phone, clinic, created_at)
            VALUES (?, ?, ?, 'General Medicine', ?, NULL, 'MediSense Clinic', ?)
          `).run(crypto.randomUUID(), id, name.trim(), normalizedEmail, now);
        }
      });

      logAudit(db, { userId: id, action: "USER_REGISTER", resourceType: "auth", resourceId: id, ip: req.ip, metadata: { role } });

      let verificationEmailSent = false;
      if (mailer.isConfigured) {
        const mailResult = await mailer.sendVerificationEmail({
          to: normalizedEmail,
          name: name.trim(),
          token: rawVerifyToken,
        });
        verificationEmailSent = Boolean(mailResult?.sent);
      } else if (!config.isProd) {
        console.log(`[medisense-mail] Verification token generated for ${normalizedEmail} (delivery skipped: SMTP not configured; tokens are never logged)`);
      }

      const user = toPlain(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
      const payload = { token: signToken(user), user: publicUser(user), verificationEmailSent };
      if (!config.isProd && config.returnDevTokens) {
        payload.devVerificationToken = rawVerifyToken;
      }
      return res.status(201).json(payload);
    }
  );

  app.post(
    "/api/auth/login",
    authLimiter,
    [
      body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required."),
      body("password").isString().notEmpty().withMessage("Password is required."),
      body("expectedRole").optional().isIn(["patient", "doctor", "caregiver"]),
    ],
    validateRequest,
    (req, res) => {
      const { email, password, expectedRole } = req.body;
      const user = toPlain(db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()));
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        logAudit(db, { userId: user?.id || null, action: "LOGIN_FAILED", resourceType: "auth", ip: req.ip, metadata: { email: email.toLowerCase() } });
        return res.status(401).json({ error: "Incorrect email or password." });
      }
      if (expectedRole && user.role !== expectedRole) {
        logAudit(db, { userId: user.id, action: "ROLE_MISMATCH_LOGIN", resourceType: "auth", ip: req.ip, metadata: { expectedRole, actualRole: user.role } });
        return res.status(403).json({
          error: `This account is registered as "${user.role}", not "${expectedRole}". Switch to the ${user.role} tab to sign in.`,
        });
      }

      logAudit(db, { userId: user.id, action: "LOGIN_SUCCESS", resourceType: "auth", resourceId: user.id, ip: req.ip });
      return res.json({ token: signToken(user), user: publicUser(user) });
    }
  );

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    const jti = req.tokenPayload?.jti;
    const expIso = req.tokenPayload?.exp
      ? new Date(req.tokenPayload.exp * 1000).toISOString()
      : new Date(Date.now() + 86400000).toISOString();
    if (jti) {
      db.prepare(`
        INSERT OR IGNORE INTO revoked_tokens (jti, user_id, expires_at, revoked_at)
        VALUES (?, ?, ?, ?)
      `).run(jti, req.user.id, expIso, new Date().toISOString());
    }
    logAudit(db, { userId: req.user.id, action: "LOGOUT", resourceType: "auth", ip: req.ip });
    res.json({ ok: true });
  });

  app.post(
    "/api/auth/verify-email",
    authLimiter,
    [body("token").isString().isLength({ min: 10 }).withMessage("Valid verification token is required.")],
    validateRequest,
    (req, res) => {
      const hash = sha256Hex(req.body.token);
      const user = toPlain(db.prepare("SELECT * FROM users WHERE verification_token_hash = ?").get(hash));
      if (!user) return res.status(400).json({ error: "Invalid or expired verification token." });
      db.prepare("UPDATE users SET email_verified = 1, verification_token_hash = NULL, updated_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        user.id
      );
      logAudit(db, { userId: user.id, action: "EMAIL_VERIFIED", resourceType: "auth", ip: req.ip });
      res.json({ ok: true, emailVerified: true });
    }
  );

  app.post(
    "/api/auth/forgot-password",
    authLimiter,
    [body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required.")],
    validateRequest,
    async (req, res) => {
      if (config.isProd && !mailer.isConfigured) {
        return res.status(503).json({
          error: "Password reset email delivery is unavailable because SMTP is not configured on this server.",
          emailSent: false,
          code: "SMTP_NOT_CONFIGURED",
        });
      }

      const normalized = req.body.email.toLowerCase();
      const user = toPlain(db.prepare("SELECT * FROM users WHERE email = ?").get(normalized));
      let devToken;
      let deliveryFailed = false;

      if (user) {
        devToken = crypto.randomBytes(24).toString("hex");
        const hash = sha256Hex(devToken);
        const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        db.prepare("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ?, updated_at = ? WHERE id = ?").run(
          hash,
          expires,
          new Date().toISOString(),
          user.id
        );
        logAudit(db, { userId: user.id, action: "PASSWORD_RESET_REQUESTED", resourceType: "auth", ip: req.ip });

        if (mailer.isConfigured) {
          const mailResult = await mailer.sendPasswordResetEmail({
            to: normalized,
            name: user.name,
            token: devToken,
          });
          if (!mailResult?.sent) {
            deliveryFailed = true;
          }
        } else if (!config.isProd) {
          console.log(`[medisense-mail] Password reset token generated for ${normalized} (delivery skipped: SMTP not configured; tokens are never logged)`);
        }
      }

      if (deliveryFailed) {
        return res.status(502).json({
          error: "Unable to send password reset email right now. Please try again later.",
          emailSent: false,
          code: "SMTP_DELIVERY_FAILED",
        });
      }

      const resp = mailer.isConfigured
        ? {
            ok: true,
            emailSent: true,
            message: "If an account exists for that email, a password reset code has been sent.",
          }
        : {
            ok: true,
            emailSent: false,
            message:
              "SMTP is not configured on this server. In development, check the server console for the reset code.",
          };

      if (devToken && !config.isProd && config.returnDevTokens) {
        resp.devResetToken = devToken;
      }
      return res.json(resp);
    }
  );

  app.post(
    "/api/auth/reset-password",
    authLimiter,
    [
      body("token").isString().isLength({ min: 10 }).withMessage("Valid reset token is required."),
      body("newPassword")
        .isString()
        .isLength({ min: 8, max: 128 })
        .withMessage("New password must be at least 8 characters.")
        .matches(/[A-Za-z]/)
        .withMessage("Password must include a letter.")
        .matches(/[0-9]/)
        .withMessage("Password must include a number."),
    ],
    validateRequest,
    (req, res) => {
      const hash = sha256Hex(req.body.token);
      const user = toPlain(db.prepare("SELECT * FROM users WHERE reset_token_hash = ?").get(hash));
      if (!user || !user.reset_token_expires_at || user.reset_token_expires_at < new Date().toISOString()) {
        return res.status(400).json({ error: "Reset code is invalid or has expired." });
      }
      const newHash = bcrypt.hashSync(req.body.newPassword, SALT_ROUNDS);
      const now = new Date().toISOString();
      runTransaction(db, () => {
        db.prepare("UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires_at = NULL, updated_at = ? WHERE id = ?").run(
          newHash,
          now,
          user.id
        );
      });
      logAudit(db, { userId: user.id, action: "PASSWORD_RESET_COMPLETED", resourceType: "auth", ip: req.ip });
      res.json({ ok: true, message: "Password updated. You can now sign in with your new password." });
    }
  );

  app.get("/api/me", requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  app.delete(
    "/api/auth/account",
    requireAuth,
    [body("password").isString().notEmpty().withMessage("Password confirmation is required to delete your account.")],
    validateRequest,
    async (req, res) => {
      if (!bcrypt.compareSync(req.body.password, req.user.password_hash)) {
        return res.status(401).json({ error: "Password confirmation does not match." });
      }
      const userId = req.user.id;
      const userDocs = db.prepare("SELECT storage_path, storage_provider FROM documents WHERE user_id = ?").all(userId);
      for (const doc of userDocs) {
        if (doc.storage_provider === "local" && doc.storage_path && fs.existsSync(doc.storage_path)) {
          try { fs.unlinkSync(doc.storage_path); } catch {}
        } else if (doc.storage_provider === "supabase" && config.supabase.configured) {
          await deleteSupabaseObject(config.supabase, doc.storage_path);
        }
      }
      const userUploadDir = path.join(uploadsDir, userId);
      if (fs.existsSync(userUploadDir)) {
        try { fs.rmSync(userUploadDir, { recursive: true, force: true }); } catch {}
      }

      runTransaction(db, () => {
        logAudit(db, { userId: null, action: "ACCOUNT_ERASED_DPDP", resourceType: "user", resourceId: sha256Hex(userId), ip: req.ip });
        db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      });
      res.json({ ok: true, deleted: true });
    }
  );

  /* -------------------------- per-user kv data store -------------------------- */

  app.get("/api/data", requireAuth, (req, res) => {
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : "";
    const rows = db.prepare("SELECT key FROM user_kv_store WHERE user_id = ?").all(req.user.id);
    const keys = rows.map((r) => r.key).filter((k) => !prefix || k.startsWith(prefix));
    res.json({ keys, prefix: prefix || undefined, shared: false });
  });

  /* ----------------------- DPDP export & consent endpoints ---------------------- */
  // Defined BEFORE /api/data/:key so /api/data/export is matched explicitly.

  app.get("/api/data/export", requireAuth, (req, res) => {
    const uid = req.user.id;
    const kvRows = db.prepare("SELECT key, value, updated_at FROM user_kv_store WHERE user_id = ?").all(uid);
    const parsedKv = {};
    for (const r of kvRows) {
      try { parsedKv[r.key] = JSON.parse(r.value); } catch { parsedKv[r.key] = r.value; }
    }
    const exportBundle = {
      schemaVersion: "1.0",
      exportedAt: new Date().toISOString(),
      regulation: "DPDP Act Data Portability Export",
      user: publicUser(req.user),
      profile: toPlain(db.prepare("SELECT * FROM patient_profiles WHERE user_id = ?").get(uid)),
      medications: db.prepare("SELECT * FROM medications WHERE user_id = ?").all(uid).map(toPlain),
      doseHistory: db.prepare("SELECT * FROM dose_history WHERE user_id = ?").all(uid).map(toPlain),
      healthMeasurements: db.prepare("SELECT * FROM health_measurements WHERE user_id = ?").all(uid).map(toPlain),
      medicalRecords: db.prepare("SELECT * FROM medical_records WHERE user_id = ?").all(uid).map(toPlain),
      documents: db.prepare("SELECT id, original_name, mime_type, size_bytes, category, sha256, created_at FROM documents WHERE user_id = ?").all(uid).map(toPlain),
      appointments: db.prepare("SELECT * FROM appointments WHERE user_id = ?").all(uid).map(toPlain),
      caregiverRelationships: db.prepare("SELECT id, caregiver_email, caregiver_name, relationship_role, status, permissions_json, created_at FROM caregiver_relationships WHERE patient_user_id = ?").all(uid).map(toPlain),
      consents: db.prepare("SELECT id, consent_type, policy_version, granted, granted_at, revoked_at FROM consent_records WHERE user_id = ?").all(uid).map(toPlain),
      auditLogs: db.prepare("SELECT id, action, resource_type, created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").all(uid).map(toPlain),
      appState: parsedKv,
    };
    logAudit(db, { userId: uid, action: "DATA_EXPORT_DPDP", resourceType: "data", ip: req.ip });
    res.json(exportBundle);
  });

  app.get(
    "/api/data/:key",
    requireAuth,
    [param("key").matches(/^[a-zA-Z0-9_.-]{1,64}$/).withMessage("Invalid storage key.")],
    validateRequest,
    (req, res) => {
      const row = db
        .prepare("SELECT value FROM user_kv_store WHERE user_id = ? AND key = ?")
        .get(req.user.id, req.params.key);
      if (!row) return res.status(404).json({ error: `Key not found: ${req.params.key}` });
      res.json({ key: req.params.key, value: row.value, shared: false });
    }
  );

  app.put(
    "/api/data/:key",
    requireAuth,
    [
      param("key").matches(/^[a-zA-Z0-9_.-]{1,64}$/).withMessage("Invalid storage key."),
      body("value").isString().withMessage("`value` must be a string (JSON stringified)."),
    ],
    validateRequest,
    (req, res) => {
      const { value } = req.body;
      if (Buffer.byteLength(value, "utf8") > 5 * 1024 * 1024) {
        return res.status(413).json({ error: "Value exceeds 5MB limit." });
      }
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO user_kv_store (user_id, key, value, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
      `).run(req.user.id, req.params.key, value, now);

      if (req.params.key === "medisense_state_v2") {
        syncStateToRelationalTables(db, req.user.id, value);
      }
      res.json({ key: req.params.key, value, shared: false });
    }
  );

  app.delete(
    "/api/data/:key",
    requireAuth,
    [param("key").matches(/^[a-zA-Z0-9_.-]{1,64}$/).withMessage("Invalid storage key.")],
    validateRequest,
    (req, res) => {
      const info = db
        .prepare("DELETE FROM user_kv_store WHERE user_id = ? AND key = ?")
        .run(req.user.id, req.params.key);
      res.json({ key: req.params.key, deleted: info.changes > 0, shared: false });
    }
  );

  app.get("/api/privacy/consents", requireAuth, (req, res) => {
    const consents = db
      .prepare("SELECT id, consent_type, policy_version, granted, granted_at, revoked_at FROM consent_records WHERE user_id = ? ORDER BY granted_at DESC")
      .all(req.user.id)
      .map(toPlain);
    const auditLogs = db
      .prepare("SELECT id, action, resource_type, resource_id, created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
      .all(req.user.id)
      .map(toPlain);
    res.json({ consents, auditLogs });
  });

  app.post(
    "/api/privacy/consents",
    requireAuth,
    [
      body("consentType").isIn(["privacy_and_health_processing", "ai_insights", "push_reminders", "caregiver_sharing"]),
      body("granted").isBoolean(),
    ],
    validateRequest,
    (req, res) => {
      const now = new Date().toISOString();
      const { consentType, granted } = req.body;
      db.prepare(`
        INSERT INTO consent_records (id, user_id, consent_type, policy_version, granted, ip_address, granted_at, revoked_at)
        VALUES (?, ?, ?, '1.0', ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        req.user.id,
        consentType,
        granted ? 1 : 0,
        req.ip || null,
        now,
        granted ? null : now
      );
      logAudit(db, {
        userId: req.user.id,
        action: granted ? "CONSENT_GRANTED" : "CONSENT_REVOKED",
        resourceType: "consent",
        resourceId: consentType,
        ip: req.ip,
      });
      res.json({ ok: true });
    }
  );

  /* -------------------------- medical documents upload -------------------------- */

  app.get("/api/documents", requireAuth, (req, res) => {
    const rows = db
      .prepare("SELECT id, original_name, mime_type, size_bytes, category, storage_provider, sha256, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC")
      .all(req.user.id)
      .map(toPlain);
    res.json({ documents: rows });
  });

  app.post("/api/documents", requireAuth, upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded." });
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: "Unsupported file format. Only PDF, PNG, JPG, and WEBP are allowed." });
    }
    if (!validateFileSignature(file.buffer, file.mimetype)) {
      return res.status(400).json({ error: "File contents do not match the declared file type." });
    }

    const docId = crypto.randomUUID();
    const category = String(req.body?.category || "Other").slice(0, 60);
    const storedName = `${docId}${extForMime(file.mimetype)}`;
    const sha256 = sha256Hex(file.buffer);
    const now = new Date().toISOString();

    let storageProvider = "local";
    let storagePath = "";

    if (config.supabase.configured) {
      try {
        const objectPath = `${req.user.id}/${storedName}`;
        const upRes = await fetch(
          `${config.supabase.url}/storage/v1/object/${encodeURIComponent(config.supabase.bucket)}/${encodeStoragePath(objectPath)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.supabase.serviceKey}`,
              apikey: config.supabase.serviceKey,
              "Content-Type": file.mimetype,
              "x-upsert": "true",
            },
            body: file.buffer,
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!upRes.ok) throw new Error(`Supabase upload HTTP ${upRes.status}`);
        storageProvider = "supabase";
        storagePath = objectPath;
      } catch (err) {
        console.warn("[medisense-docs] Supabase upload failed:", err?.message || "unknown error");
        if (config.isProd) {
          return res.status(502).json({
            error: "Cloud document storage upload failed. Please try again shortly.",
          });
        }
      }
    }

    if (storageProvider === "local") {
      const userDir = path.join(uploadsDir, req.user.id);
      fs.mkdirSync(userDir, { recursive: true });
      storagePath = path.join(userDir, storedName);
      fs.writeFileSync(storagePath, file.buffer);
    }

    db.prepare(`
      INSERT INTO documents (id, user_id, original_name, stored_name, mime_type, size_bytes, category, storage_provider, storage_path, sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId,
      req.user.id,
      sanitizeFilename(file.originalname),
      storedName,
      file.mimetype,
      file.size,
      category,
      storageProvider,
      storagePath,
      sha256,
      now
    );

    logAudit(db, {
      userId: req.user.id,
      action: "DOCUMENT_UPLOADED",
      resourceType: "document",
      resourceId: docId,
      ip: req.ip,
      metadata: { mimeType: file.mimetype, sizeBytes: file.size, category },
    });

    res.status(201).json({
      document: {
        id: docId,
        original_name: sanitizeFilename(file.originalname),
        mime_type: file.mimetype,
        size_bytes: file.size,
        category,
        storage_provider: storageProvider,
        sha256,
        created_at: now,
      },
    });
  });

  app.get("/api/documents/:id/content", requireAuth, async (req, res) => {
    const doc = toPlain(db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id));
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Strict ownership check (or active caregiver/doctor with records permission)
    let authorized = doc.user_id === req.user.id;
    const checkRecordsPerm = (permsJson) => {
      try {
        const parsed = JSON.parse(permsJson || "[]");
        if (Array.isArray(parsed)) return parsed.includes("records");
        if (parsed && typeof parsed === "object") return Boolean(parsed.records);
        return false;
      } catch {
        return false;
      }
    };

    if (!authorized && req.user.role === "caregiver") {
      const rel = toPlain(
        db.prepare(`
          SELECT permissions_json FROM caregiver_relationships
          WHERE patient_user_id = ? AND caregiver_user_id = ? AND status = 'active'
        `).get(doc.user_id, req.user.id)
      );
      if (rel && checkRecordsPerm(rel.permissions_json)) {
        authorized = true;
      }
    }
    if (!authorized && req.user.role === "doctor") {
      const docRel = toPlain(
        db.prepare(`
          SELECT permissions_json FROM doctor_patient_relationships
          WHERE patient_user_id = ? AND doctor_user_id = ? AND status = 'active'
        `).get(doc.user_id, req.user.id)
      );
      if (docRel && checkRecordsPerm(docRel.permissions_json)) {
        authorized = true;
      }
    }

    if (!authorized) {
      logAudit(db, {
        userId: req.user.id,
        action: "DOCUMENT_ACCESS_DENIED",
        resourceType: "document",
        resourceId: doc.id,
        ip: req.ip,
      });
      return res.status(403).json({ error: "Access denied to this document" });
    }

    logAudit(db, {
      userId: req.user.id,
      action: "DOCUMENT_ACCESSED",
      resourceType: "document",
      resourceId: doc.id,
      ip: req.ip,
      metadata: { originalName: doc.original_name, mimeType: doc.mime_type },
    });

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", doc.mime_type);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${sanitizeFilename(doc.original_name)}"`
    );

    if (doc.storage_provider === "supabase" && config.supabase.configured) {
      try {
        const dlRes = await fetch(
          `${config.supabase.url}/storage/v1/object/${encodeURIComponent(config.supabase.bucket)}/${encodeStoragePath(doc.storage_path)}`,
          {
            headers: {
              Authorization: `Bearer ${config.supabase.serviceKey}`,
              apikey: config.supabase.serviceKey,
            },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!dlRes.ok) return res.status(502).json({ error: "Failed to retrieve document from cloud storage" });
        const arrBuf = await dlRes.arrayBuffer();
        return res.send(Buffer.from(arrBuf));
      } catch {
        return res.status(502).json({ error: "Failed to retrieve document from cloud storage" });
      }
    }

    if (!doc.storage_path || !fs.existsSync(doc.storage_path)) {
      return res.status(404).json({ error: "Document file not found" });
    }
    return res.sendFile(path.resolve(doc.storage_path));
  });

  app.delete("/api/documents/:id", requireAuth, async (req, res) => {
    const doc = toPlain(db.prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id));
    if (!doc) return res.status(404).json({ error: "Document not found" });

    if (doc.storage_provider === "local" && doc.storage_path && fs.existsSync(doc.storage_path)) {
      try { fs.unlinkSync(doc.storage_path); } catch {}
    } else if (doc.storage_provider === "supabase" && config.supabase.configured) {
      await deleteSupabaseObject(config.supabase, doc.storage_path);
    }
    db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
    logAudit(db, { userId: req.user.id, action: "DOCUMENT_DELETED", resourceType: "document", resourceId: req.params.id, ip: req.ip });
    res.json({ ok: true, deleted: true });
  });

  /* --------------------- caregiver invitations & enforcement --------------------- */

  app.get("/api/caregivers", requireAuth, requireRole("patient"), (req, res) => {
    const rows = db
      .prepare(`
        SELECT id, caregiver_email, caregiver_name, relationship_role, status, permissions_json, created_at, updated_at
        FROM caregiver_relationships
        WHERE patient_user_id = ? AND status != 'revoked'
        ORDER BY created_at DESC
      `)
      .all(req.user.id)
      .map((r) => ({
        ...toPlain(r),
        permissions: JSON.parse(r.permissions_json || "{}"),
      }));
    res.json({ caregivers: rows });
  });

  app.post(
    "/api/caregivers/invite",
    requireAuth,
    requireRole("patient"),
    [
      body("email").trim().isEmail().normalizeEmail().withMessage("Valid caregiver email is required."),
      body("name").optional().trim().isLength({ max: 120 }),
      body("role").optional().trim().isLength({ max: 80 }),
      body("permissions").optional().isObject(),
    ],
    validateRequest,
    (req, res) => {
      const caregiverEmail = req.body.email.toLowerCase();
      if (caregiverEmail === req.user.email) {
        return res.status(400).json({ error: "You cannot invite yourself as a caregiver." });
      }
      const existingCaregiverUser = toPlain(
        db.prepare("SELECT id, name, role FROM users WHERE email = ?").get(caregiverEmail)
      );
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const perms = {
        medications: true,
        vitals: false,
        glucose: false,
        activity: false,
        sleep: false,
        nutrition: false,
        records: false,
        ...(req.body.permissions || {}),
      };
      const status = existingCaregiverUser && existingCaregiverUser.role === "caregiver" ? "active" : "pending";

      db.prepare(`
        INSERT INTO caregiver_relationships
          (id, patient_user_id, caregiver_email, caregiver_user_id, caregiver_name, relationship_role, status, permissions_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        req.user.id,
        caregiverEmail,
        existingCaregiverUser?.role === "caregiver" ? existingCaregiverUser.id : null,
        req.body.name || existingCaregiverUser?.name || caregiverEmail.split("@")[0],
        req.body.role || "Caregiver",
        status,
        JSON.stringify(perms),
        now,
        now
      );

      logAudit(db, {
        userId: req.user.id,
        action: "CAREGIVER_INVITED",
        resourceType: "caregiver",
        resourceId: id,
        ip: req.ip,
        metadata: { caregiverEmail, permissions: perms },
      });

      res.status(201).json({
        caregiver: {
          id,
          caregiver_email: caregiverEmail,
          caregiver_name: req.body.name || existingCaregiverUser?.name || caregiverEmail.split("@")[0],
          relationship_role: req.body.role || "Caregiver",
          status,
          permissions: perms,
          created_at: now,
        },
      });
    }
  );

  app.patch(
    "/api/caregivers/:id",
    requireAuth,
    requireRole("patient"),
    [body("permissions").isObject()],
    validateRequest,
    (req, res) => {
      const rel = toPlain(
        db.prepare("SELECT * FROM caregiver_relationships WHERE id = ? AND patient_user_id = ?").get(
          req.params.id,
          req.user.id
        )
      );
      if (!rel) return res.status(404).json({ error: "Caregiver relationship not found" });
      const nextPerms = {
        ...JSON.parse(rel.permissions_json || "{}"),
        ...req.body.permissions,
      };
      db.prepare("UPDATE caregiver_relationships SET permissions_json = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(nextPerms),
        new Date().toISOString(),
        rel.id
      );
      logAudit(db, { userId: req.user.id, action: "CAREGIVER_PERMISSIONS_UPDATED", resourceType: "caregiver", resourceId: rel.id, ip: req.ip, metadata: nextPerms });
      res.json({ ok: true, permissions: nextPerms });
    }
  );

  app.delete("/api/caregivers/:id", requireAuth, requireRole("patient"), (req, res) => {
    const info = db
      .prepare("UPDATE caregiver_relationships SET status = 'revoked', updated_at = ? WHERE id = ? AND patient_user_id = ?")
      .run(new Date().toISOString(), req.params.id, req.user.id);
    if (info.changes === 0) return res.status(404).json({ error: "Caregiver relationship not found" });
    logAudit(db, { userId: req.user.id, action: "CAREGIVER_REVOKED", resourceType: "caregiver", resourceId: req.params.id, ip: req.ip });
    res.json({ ok: true, revoked: true });
  });

  app.get("/api/caregiver/patients", requireAuth, requireRole("caregiver"), (req, res) => {
    const rels = db
      .prepare(`
        SELECT cr.*, u.name AS owner_name, u.email AS owner_email
        FROM caregiver_relationships cr
        JOIN users u ON u.id = cr.patient_user_id
        WHERE (cr.caregiver_user_id = ? OR cr.caregiver_email = ?) AND cr.status != 'revoked'
      `)
      .all(req.user.id, req.user.email)
      .map(toPlain);

    const patients = [];
    for (const rel of rels) {
      if (rel.status === "pending") {
        patients.push({
          relationshipId: rel.id,
          status: "pending",
          patientName: rel.owner_name,
          patientEmail: rel.owner_email,
          permissions: JSON.parse(rel.permissions_json || "{}"),
          data: null,
        });
        continue;
      }

      const sharingConsent = toPlain(
        db.prepare(`
          SELECT granted FROM consent_records
          WHERE user_id = ? AND consent_type = 'caregiver_sharing'
          ORDER BY granted_at DESC LIMIT 1
        `).get(rel.patient_user_id)
      );
      if (sharingConsent && sharingConsent.granted === 0) {
        patients.push({
          relationshipId: rel.id,
          status: "consent_revoked",
          patientUserId: rel.patient_user_id,
          patientName: rel.owner_name,
          permissions: {},
          data: null,
          message: "Patient has paused caregiver data sharing in their Privacy Center.",
        });
        continue;
      }

      const kv = db
        .prepare("SELECT value FROM user_kv_store WHERE user_id = ? AND key = 'medisense_state_v2'")
        .get(rel.patient_user_id);
      let primaryPatient = null;
      if (kv?.value) {
        try {
          const parsed = JSON.parse(kv.value);
          primaryPatient = parsed?.patients?.[0] || null;
        } catch {}
      }
      if (!primaryPatient) {
        const prof = toPlain(
          db.prepare("SELECT * FROM patient_profiles WHERE user_id = ?").get(rel.patient_user_id)
        );
        primaryPatient = prof
          ? { id: prof.patient_id, name: prof.name, emergencyContact: prof.emergency_contact, medications: [], logs: [], healthRecords: [] }
          : { id: rel.patient_user_id, name: rel.owner_name, medications: [], logs: [], healthRecords: [] };
      }

      const permissions = JSON.parse(rel.permissions_json || "{}");
      patients.push({
        relationshipId: rel.id,
        status: "active",
        patientUserId: rel.patient_user_id,
        patientName: primaryPatient.name || rel.owner_name,
        permissions,
        data: filterPatientForPermissions(primaryPatient, permissions),
      });
    }

    res.json({ patients });
  });

  app.post("/api/caregiver/accept/:relationshipId", requireAuth, requireRole("caregiver"), (req, res) => {
    const rel = toPlain(
      db.prepare(`
        SELECT * FROM caregiver_relationships
        WHERE id = ? AND (caregiver_user_id = ? OR caregiver_email = ?) AND status = 'pending'
      `).get(req.params.relationshipId, req.user.id, req.user.email)
    );
    if (!rel) return res.status(404).json({ error: "Pending invitation not found" });

    db.prepare(`
      UPDATE caregiver_relationships
      SET caregiver_user_id = ?, caregiver_name = ?, status = 'active', updated_at = ?
      WHERE id = ?
    `).run(req.user.id, req.user.name, new Date().toISOString(), rel.id);

    logAudit(db, { userId: req.user.id, action: "CAREGIVER_INVITE_ACCEPTED", resourceType: "caregiver", resourceId: rel.id, ip: req.ip });
    res.json({ ok: true });
  });

  /* --------------------------- doctor ecosystem API --------------------------- */

  app.get("/api/doctor/patients", requireAuth, requireRole("doctor"), (req, res) => {
    const rels = db
      .prepare(`
        SELECT dpr.*, u.name AS patient_name, u.email AS patient_email
        FROM doctor_patient_relationships dpr
        JOIN users u ON u.id = dpr.patient_user_id
        WHERE dpr.doctor_user_id = ? AND dpr.status != 'revoked'
        ORDER BY dpr.updated_at DESC
      `)
      .all(req.user.id)
      .map(toPlain);

    const patients = [];
    for (const rel of rels) {
      const kv = db
        .prepare("SELECT value FROM user_kv_store WHERE user_id = ? AND key = 'medisense_state_v2'")
        .get(rel.patient_user_id);
      let primaryPatient = null;
      if (kv?.value) {
        try {
          const parsed = JSON.parse(kv.value);
          primaryPatient = parsed?.patients?.[0] || null;
        } catch {}
      }
      if (!primaryPatient) {
        const prof = toPlain(
          db.prepare("SELECT * FROM patient_profiles WHERE user_id = ?").get(rel.patient_user_id)
        );
        primaryPatient = prof
          ? { id: prof.patient_id, name: prof.name, emergencyContact: prof.emergency_contact, conditions: prof.conditions || "", medications: [], logs: [], healthRecords: [] }
          : { id: rel.patient_user_id, name: rel.patient_name, conditions: "", medications: [], logs: [], healthRecords: [] };
      }

      const permissions = JSON.parse(rel.permissions_json || "{}");
      patients.push({
        relationshipId: rel.id,
        patientUserId: rel.patient_user_id,
        patientName: primaryPatient.name || rel.patient_name,
        patientEmail: rel.patient_email,
        conditions: primaryPatient.conditions || "",
        permissions,
        data: filterPatientForPermissions(primaryPatient, permissions),
      });
    }

    res.json({ patients });
  });

  app.get("/api/doctor/patients/:patientId", requireAuth, requireRole("doctor"), (req, res) => {
    const rel = toPlain(
      db.prepare(`
        SELECT * FROM doctor_patient_relationships
        WHERE doctor_user_id = ? AND patient_user_id = ? AND status = 'active'
      `).get(req.user.id, req.params.patientId)
    );
    if (!rel) return res.status(403).json({ error: "Access denied: patient has not granted access to your clinic account." });

    const kv = db
      .prepare("SELECT value FROM user_kv_store WHERE user_id = ? AND key = 'medisense_state_v2'")
      .get(req.params.patientId);
    let primaryPatient = null;
    if (kv?.value) {
      try {
        const parsed = JSON.parse(kv.value);
        primaryPatient = parsed?.patients?.[0] || null;
      } catch {}
    }
    if (!primaryPatient) {
      const prof = toPlain(db.prepare("SELECT * FROM patient_profiles WHERE user_id = ?").get(req.params.patientId));
      if (!prof) return res.status(404).json({ error: "Patient record not found" });
      primaryPatient = { id: prof.patient_id, name: prof.name, medications: [], logs: [], healthRecords: [] };
    }

    const permissions = JSON.parse(rel.permissions_json || "{}");
    logAudit(db, {
      userId: req.user.id,
      action: "DOCTOR_PATIENT_ACCESSED",
      resourceType: "patient",
      resourceId: req.params.patientId,
      ip: req.ip,
    });
    res.json({ patient: filterPatientForPermissions(primaryPatient, permissions), permissions });
  });

  app.post(
    "/api/doctor/patients/:patientId/prescriptions",
    requireAuth,
    requireRole("doctor"),
    [
      body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Medication name is required."),
      body("dosage").trim().notEmpty().withMessage("Dosage is required."),
      body("unit").optional().trim(),
      body("frequency").optional().trim(),
      body("times").optional().isArray(),
    ],
    validateRequest,
    (req, res) => {
      const rel = toPlain(
        db.prepare(`
          SELECT * FROM doctor_patient_relationships
          WHERE doctor_user_id = ? AND patient_user_id = ? AND status = 'active'
        `).get(req.user.id, req.params.patientId)
      );
      if (!rel) return res.status(403).json({ error: "Access denied to prescribe for this patient" });
      const perms = JSON.parse(rel.permissions_json || "{}");
      if (perms.medications === false) {
        return res.status(403).json({ error: "Patient has restricted medication management permissions." });
      }

      const medId = crypto.randomUUID();
      const now = new Date().toISOString();
      const {
        name, genericName, dosage, unit = "mg", frequency = "Once daily",
        timesPerDay = 1, times = ["08:00"], startDate = now.slice(0, 10),
        endDate = "", withFood = true, instructions = "", notes = "",
      } = req.body;

      const newMed = {
        id: medId,
        name: name.trim(),
        genericName: genericName?.trim() || null,
        dosage: String(dosage).trim(),
        unit: unit || "mg",
        frequency: frequency || "Once daily",
        timesPerDay: Number(timesPerDay) || times.length || 1,
        times: Array.isArray(times) ? times : ["08:00"],
        startDate,
        endDate: endDate || "",
        withFood: Boolean(withFood),
        instructions: instructions || "",
        notes: notes || "",
        active: true,
        source: "doctor",
      };

      runTransaction(db, () => {
        db.prepare(`
          INSERT INTO medications (id, user_id, med_id, name, generic_name, dosage, unit, frequency, times_per_day, times_json, start_date, end_date, with_food, instructions, notes, active, source, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'doctor', ?)
        `).run(
          `${req.params.patientId}:${medId}`,
          req.params.patientId,
          medId,
          newMed.name,
          newMed.genericName,
          newMed.dosage,
          newMed.unit,
          newMed.frequency,
          newMed.timesPerDay,
          JSON.stringify(newMed.times),
          newMed.startDate,
          newMed.endDate || null,
          newMed.withFood ? 1 : 0,
          newMed.instructions,
          newMed.notes,
          now
        );

        const kv = db.prepare("SELECT value FROM user_kv_store WHERE user_id = ? AND key = 'medisense_state_v2'").get(req.params.patientId);
        if (kv?.value) {
          try {
            const state = JSON.parse(kv.value);
            if (state?.patients?.[0]) {
              state.patients[0].medications = [...(state.patients[0].medications || []), newMed];
              state.patients[0].notifications = [
                {
                  id: `doc-rx-${medId}`,
                  type: "prescription",
                  category: "medication",
                  severity: "info",
                  message: `New prescription added by ${req.user.name}: ${newMed.name} ${newMed.dosage}${newMed.unit}`,
                  date: now.slice(0, 10),
                  read: false,
                },
                ...(state.patients[0].notifications || []),
              ];
              db.prepare("UPDATE user_kv_store SET value = ?, updated_at = ? WHERE user_id = ? AND key = 'medisense_state_v2'").run(
                JSON.stringify(state),
                now,
                req.params.patientId
              );
            }
          } catch {}
        }
      });

      logAudit(db, {
        userId: req.user.id,
        action: "PRESCRIPTION_PRESCRIBED",
        resourceType: "medication",
        resourceId: medId,
        ip: req.ip,
        metadata: { patientUserId: req.params.patientId, medicationName: newMed.name, dosage: newMed.dosage },
      });

      res.status(201).json({ ok: true, medication: newMed });
    }
  );

  app.get("/api/doctor/appointments", requireAuth, requireRole("doctor"), (req, res) => {
    const docProf = toPlain(db.prepare("SELECT id FROM doctor_profiles WHERE user_id = ?").get(req.user.id));
    const docId = docProf?.id || req.user.id;
    const appts = db
      .prepare(`
        SELECT a.*, u.name AS patient_name, u.email AS patient_email
        FROM appointments a
        JOIN users u ON u.id = a.user_id
        WHERE a.doctor_id = ? OR a.doctor_id = ?
        ORDER BY a.visit_date DESC, a.visit_time ASC
      `)
      .all(docId, req.user.id)
      .map(toPlain);
    res.json({ appointments: appts });
  });

  app.get("/api/doctor/profile", requireAuth, requireRole("doctor"), (req, res) => {
    let profile = toPlain(db.prepare("SELECT * FROM doctor_profiles WHERE user_id = ?").get(req.user.id));
    if (!profile) {
      profile = {
        id: crypto.randomUUID(),
        user_id: req.user.id,
        name: req.user.name,
        specialty: "Primary care / Endocrinology",
        email: req.user.email,
        phone: null,
        clinic: "MediSense Clinic",
        created_at: new Date().toISOString(),
      };
      db.prepare(`
        INSERT INTO doctor_profiles (id, user_id, name, specialty, email, phone, clinic, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(profile.id, profile.user_id, profile.name, profile.specialty, profile.email, profile.phone, profile.clinic, profile.created_at);
    }
    res.json({ profile });
  });

  app.put("/api/doctor/profile", requireAuth, requireRole("doctor"), (req, res) => {
    const { name, specialty, phone, clinic } = req.body || {};
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO doctor_profiles (id, user_id, name, specialty, email, phone, clinic, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        name=COALESCE(excluded.name, name),
        specialty=COALESCE(excluded.specialty, specialty),
        phone=COALESCE(excluded.phone, phone),
        clinic=COALESCE(excluded.clinic, clinic)
    `).run(
      crypto.randomUUID(),
      req.user.id,
      name || req.user.name,
      specialty || "Primary Care",
      req.user.email,
      phone || null,
      clinic || "MediSense Clinic",
      now
    );
    const updated = toPlain(db.prepare("SELECT * FROM doctor_profiles WHERE user_id = ?").get(req.user.id));
    res.json({ profile: updated });
  });

  app.post(
    "/api/care/share-doctor",
    requireAuth,
    requireRole("patient"),
    [body("doctorEmail").trim().isEmail().normalizeEmail().withMessage("Doctor email is required.")],
    validateRequest,
    (req, res) => {
      const email = req.body.doctorEmail.toLowerCase();
      const doctorUser = toPlain(db.prepare("SELECT id, name, role FROM users WHERE email = ? AND role = 'doctor'").get(email));
      if (!doctorUser) {
        return res.status(404).json({ error: "No registered doctor found with that email address." });
      }
      const permissions = {
        medications: true,
        vitals: true,
        glucose: true,
        activity: false,
        sleep: false,
        nutrition: false,
        records: true,
        ...(req.body.permissions || {}),
      };
      const now = new Date().toISOString();
      const relId = `doc-rel-${doctorUser.id}-${req.user.id}`;
      db.prepare(`
        INSERT INTO doctor_patient_relationships (id, doctor_user_id, patient_user_id, status, permissions_json, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          permissions_json=excluded.permissions_json, status='active', updated_at=excluded.updated_at
      `).run(relId, doctorUser.id, req.user.id, JSON.stringify(permissions), now, now);

      logAudit(db, {
        userId: req.user.id,
        action: "DOCTOR_SHARE_GRANTED",
        resourceType: "doctor_relationship",
        resourceId: relId,
        ip: req.ip,
        metadata: { doctorEmail: email, permissions },
      });
      res.json({ ok: true, doctorName: doctorUser.name, permissions });
    }
  );

  /* ---------------------- cross-account messaging API ---------------------- */

  app.get("/api/messages/:patientId", requireAuth, (req, res) => {
    const targetPatientId = req.params.patientId;
    if (req.user.role === "patient" && req.user.id !== targetPatientId) {
      return res.status(403).json({ error: "Cannot access messages for another patient" });
    }
    if (req.user.role === "doctor") {
      const rel = db.prepare("SELECT id FROM doctor_patient_relationships WHERE doctor_user_id = ? AND patient_user_id = ? AND status = 'active'").get(req.user.id, targetPatientId);
      if (!rel) return res.status(403).json({ error: "Not authorized to view messages with this patient" });
    }

    const rows = db
      .prepare(`
        SELECT id, sender, body AS text, sent_date AS date, sent_time AS time, is_read AS read
        FROM messages
        WHERE thread_patient_id = ? OR user_id = ?
        ORDER BY sent_date ASC, sent_time ASC
      `)
      .all(targetPatientId, targetPatientId)
      .map(toPlain);

    res.json({ messages: rows });
  });

  app.post(
    "/api/messages/:patientId",
    requireAuth,
    [body("text").trim().isLength({ min: 1, max: 2000 }).withMessage("Message body is required.")],
    validateRequest,
    (req, res) => {
      const targetPatientId = req.params.patientId;
      if (req.user.role === "patient" && req.user.id !== targetPatientId) {
        return res.status(403).json({ error: "Cannot send message as another patient" });
      }
      if (req.user.role === "doctor") {
        const rel = db.prepare("SELECT id FROM doctor_patient_relationships WHERE doctor_user_id = ? AND patient_user_id = ? AND status = 'active'").get(req.user.id, targetPatientId);
        if (!rel) return res.status(403).json({ error: "Not authorized to message this patient" });
      }

      const now = new Date();
      const msgId = crypto.randomUUID();
      const date = now.toISOString().slice(0, 10);
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const sender = req.user.role === "doctor" ? "doctor" : "patient";
      const text = req.body.text.trim();

      db.prepare(`
        INSERT INTO messages (id, user_id, thread_patient_id, sender, body, sent_date, sent_time, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run(msgId, targetPatientId, targetPatientId, sender, text, date, time);

      const kv = db.prepare("SELECT value FROM user_kv_store WHERE user_id = ? AND key = 'medisense_state_v2'").get(targetPatientId);
      if (kv?.value) {
        try {
          const state = JSON.parse(kv.value);
          if (state?.patients?.[0]) {
            state.patients[0].messages = [...(state.patients[0].messages || []), { id: msgId, sender, text, date, time, read: false }];
            db.prepare("UPDATE user_kv_store SET value = ?, updated_at = ? WHERE user_id = ? AND key = 'medisense_state_v2'").run(
              JSON.stringify(state),
              now.toISOString(),
              targetPatientId
            );
          }
        } catch {}
      }

      logAudit(db, {
        userId: req.user.id,
        action: "MESSAGE_SENT",
        resourceType: "message",
        resourceId: msgId,
        ip: req.ip,
        metadata: { targetPatientId, sender },
      });

      res.status(201).json({ message: { id: msgId, sender, text, date, time, read: false } });
    }
  );

  /* ---------------------------- appointments API ---------------------------- */

  app.get("/api/appointments", requireAuth, (req, res) => {
    let appts;
    if (req.user.role === "doctor") {
      const docProf = toPlain(db.prepare("SELECT id FROM doctor_profiles WHERE user_id = ?").get(req.user.id));
      const docId = docProf?.id || req.user.id;
      appts = db.prepare(`
        SELECT a.*, u.name AS patient_name, u.email AS patient_email
        FROM appointments a
        JOIN users u ON u.id = a.user_id
        WHERE a.doctor_id = ? OR a.doctor_id = ?
        ORDER BY a.visit_date DESC, a.visit_time ASC
      `).all(docId, req.user.id).map(toPlain);
    } else {
      appts = db.prepare("SELECT * FROM appointments WHERE user_id = ? ORDER BY visit_date DESC, visit_time ASC").all(req.user.id).map(toPlain);
    }
    res.json({ appointments: appts });
  });

  app.post(
    "/api/appointments",
    requireAuth,
    requireRole("patient"),
    [
      body("visitDate").isISO8601().withMessage("Valid visit date is required (YYYY-MM-DD)."),
      body("visitTime").matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage("Valid visit time is required (HH:MM)."),
      body("doctorId").optional().isString(),
      body("doctorName").optional().isString(),
      body("visitType").optional().isString(),
      body("location").optional().isString(),
      body("notes").optional().isString(),
    ],
    validateRequest,
    (req, res) => {
      const apptId = crypto.randomUUID();
      const now = new Date().toISOString();
      const { visitDate, visitTime, doctorId, doctorName, visitType = "Follow-up", location = "MediSense Clinic", notes } = req.body;

      db.prepare(`
        INSERT INTO appointments (id, user_id, doctor_id, doctor_name, visit_date, visit_time, visit_type, location, status, consultation_notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
      `).run(
        apptId,
        req.user.id,
        doctorId || null,
        doctorName || "Dr. Sarah Chen",
        visitDate,
        visitTime,
        visitType,
        location,
        notes || null,
        now
      );

      if (doctorId) {
        const docUser = toPlain(db.prepare("SELECT user_id FROM doctor_profiles WHERE id = ?").get(doctorId))
          || toPlain(db.prepare("SELECT id FROM users WHERE id = ? AND role = 'doctor'").get(doctorId));
        if (docUser) {
          const docUserId = docUser.user_id || docUser.id;
          const relId = `doc-rel-${docUserId}-${req.user.id}`;
          db.prepare(`
            INSERT OR IGNORE INTO doctor_patient_relationships (id, doctor_user_id, patient_user_id, status, permissions_json, created_at, updated_at)
            VALUES (?, ?, ?, 'active', ?, ?, ?)
          `).run(relId, docUserId, req.user.id, JSON.stringify({ medications: true, vitals: true, records: true }), now, now);
        }
      }

      logAudit(db, {
        userId: req.user.id,
        action: "APPOINTMENT_BOOKED",
        resourceType: "appointment",
        resourceId: apptId,
        ip: req.ip,
        metadata: { visitDate, visitTime, doctorName },
      });

      res.status(201).json({
        appointment: {
          id: apptId,
          user_id: req.user.id,
          doctor_id: doctorId,
          doctor_name: doctorName,
          visit_date: visitDate,
          visit_time: visitTime,
          visit_type: visitType,
          location,
          status: "confirmed",
          consultation_notes: notes,
          updated_at: now,
        },
      });
    }
  );

  /* --------------------------- drug interaction API --------------------------- */

  app.post("/api/interactions/check", requireAuth, async (req, res) => {
    const { drugA, drugB, medications = [], allergies = [], legacyAllergyText = "" } = req.body || {};
    const report = await analyzeMedications({
      drugA,
      drugB,
      medications: Array.isArray(medications) ? medications.slice(0, 60) : [],
      allergies: Array.isArray(allergies) ? allergies.slice(0, 60) : [],
      legacyAllergyText: String(legacyAllergyText || "").slice(0, 500),
      enableOpenFdaLookup: config.enableOpenFdaLookup,
    });
    res.json(report);
  });

  /* ------------------------- web push notifications API ------------------------ */

  app.get("/api/push/public-key", requireAuth, (req, res) => {
    if (!vapid?.publicKey) {
      return res.status(503).json({ error: "Web Push VAPID keys are not configured on the server." });
    }
    res.json({ publicKey: vapid.publicKey });
  });

  app.post(
    "/api/push/subscribe",
    requireAuth,
    [
      body("endpoint").isURL().withMessage("Valid push endpoint URL is required."),
      body("keys.p256dh").isString().notEmpty(),
      body("keys.auth").isString().notEmpty(),
    ],
    validateRequest,
    (req, res) => {
      const { endpoint, keys } = req.body;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth
      `).run(crypto.randomUUID(), req.user.id, endpoint, keys.p256dh, keys.auth, now);
      res.status(201).json({ ok: true });
    }
  );

  app.post("/api/push/unsubscribe", requireAuth, (req, res) => {
    const { endpoint } = req.body || {};
    if (endpoint) {
      db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(req.user.id, endpoint);
    } else {
      db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(req.user.id);
    }
    res.json({ ok: true });
  });

  app.post("/api/push/test", requireAuth, async (req, res) => {
    if (!vapid) {
      return res.status(503).json({ error: "Web Push VAPID keys are not configured." });
    }
    const subs = db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ?").all(req.user.id).map(toPlain);
    if (!subs.length) {
      return res.status(400).json({ error: "No active push subscriptions found for this device." });
    }
    const payload = JSON.stringify({
      title: "MediSense Medication Reminder",
      body: req.body?.body || "Push notifications are active on this device.",
      url: "/medications",
    });
    let delivered = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        delivered += 1;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(s.id);
        }
      }
    }
    res.json({ ok: true, delivered });
  });

  /* ------------------------------ AI routes ------------------------------ */

  registerAIRoutes(app, { requireAuth, aiLimiter, logAudit, db, geminiConfig: config.gemini });

  /* ------------------------------ fallback ------------------------------ */

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.message === "Origin not allowed by CORS") {
      return res.status(403).json({ error: "Origin not allowed by CORS" });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON payload." });
    }
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File exceeds maximum 10MB upload limit." });
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message || "Invalid file upload." });
    }
    if (config.isProd) {
      console.error("[medisense-server] unhandled error:", err?.message || "Unknown internal error");
    } else {
      console.error("[medisense-server] unhandled error:", err);
    }
    return res.status(500).json({ error: "Internal server error" });
  });

  app.locals.db = db;
  app.locals.config = config;
  return app;
}

const isEntrypoint =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  const app = createApp();
  const { port, nodeEnv } = app.locals.config;
  app.listen(port, () => {
    const label = nodeEnv === "production" ? `port ${port}` : `http://localhost:${port}`;
    console.log(`MediSense server listening on ${label} (${nodeEnv})`);
  });
}
