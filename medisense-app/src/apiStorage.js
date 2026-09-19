/**
 * Thin client for MediSense's real backend (see /server). Handles account
 * registration/login (credentials are hashed server-side with bcrypt, never
 * stored or sent in plain text after the initial request) and a per-user
 * key-value data store that mirrors the shape of window.storage, so the
 * rest of the app never needs to know whether a given read/write ended up
 * on the server or in localStorage.
 *
 * The backend is optional: if it isn't running, every call here rejects and
 * storagePolyfill.js falls back to localStorage automatically. Nothing in
 * the app breaks if you never start the server.
 */

const DEFAULT_API_BASE = "http://localhost:4000";
export const API_BASE =
  (typeof window !== "undefined" && window.__MEDISENSE_API_BASE__) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) ||
  DEFAULT_API_BASE;

const TOKEN_KEY = "medisense_auth_token";
const USER_KEY = "medisense_auth_user";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}
export function getCachedUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
}
function setCachedUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {}
}
export function isConnected() {
  return !!getToken();
}

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let body = {};
  try { body = await res.json(); } catch {}
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

async function authFetch(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error("Not signed in to an account");
  try {
    return await jsonFetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  } catch (e) {
    if (String(e.message).includes("401") || String(e.message).toLowerCase().includes("unauthorized") || String(e.message).toLowerCase().includes("invalid or expired")) {
      setToken(null);
      setCachedUser(null);
    }
    throw e;
  }
}

/* ---------------------------------- auth ---------------------------------- */

export async function register(name, email, password) {
  const body = await jsonFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
  setToken(body.token);
  setCachedUser(body.user);
  return body.user;
}

export async function login(email, password) {
  const body = await jsonFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  setToken(body.token);
  setCachedUser(body.user);
  return body.user;
}

export function logout() {
  setToken(null);
  setCachedUser(null);
}

export async function whoAmI() {
  const body = await authFetch("/api/me");
  setCachedUser(body.user);
  return body.user;
}

/* ------------------------------ data storage ------------------------------ */
/* Mirrors window.storage's get/set/delete/list contract exactly, scoped to
   the signed-in account on the server. */

export async function remoteGet(key) {
  return authFetch(`/api/data/${encodeURIComponent(key)}`);
}
export async function remoteSet(key, value) {
  return authFetch(`/api/data/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value }) });
}
export async function remoteDelete(key) {
  return authFetch(`/api/data/${encodeURIComponent(key)}`, { method: "DELETE" });
}
export async function remoteList(prefix) {
  const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
  return authFetch(`/api/data${qs}`);
}
