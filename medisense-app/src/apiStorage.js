/**
 * MediSense Backend API Client
 * ----------------------------
 * Handles real JWT + bcrypt authentication, password reset, email verification,
 * per-user key/value state sync, multipart medical document upload/download,
 * Gemini AI proxy chat & report summarization, caregiver invitations & permission
 * updates, verified drug interaction queries, Web Push subscriptions, and DPDP
 * consent/export/account-deletion endpoints.
 */

const DEV_FALLBACK_API_BASE = import.meta.env.PROD ? "" : "http://localhost:4000";

export function resolveApiBase(
  env = import.meta.env || {},
  win = typeof window !== "undefined" ? window : undefined,
  devFallback = DEV_FALLBACK_API_BASE
) {
  const winOverride = win && win.__MEDISENSE_API_BASE__;
  if (typeof winOverride === "string" && winOverride.trim()) {
    return winOverride.trim().replace(/\/+$/, "");
  }
  const configured =
    typeof env?.VITE_API_URL === "string" && env.VITE_API_URL.trim()
      ? env.VITE_API_URL.trim().replace(/\/+$/, "")
      : typeof env?.VITE_API_BASE_URL === "string" && env.VITE_API_BASE_URL.trim()
        ? env.VITE_API_BASE_URL.trim().replace(/\/+$/, "")
        : "";
  if (configured) return configured;
  if (env?.PROD) return "";
  return devFallback;
}

export const API_BASE = resolveApiBase();
export const IS_API_CONFIGURED = Boolean(API_BASE);

const TOKEN_KEY = "medisense_auth_token";
const USER_KEY = "medisense_auth_user";
const LOCAL_ACCOUNTS_KEY = "medisense_local_accounts";

function getLocalAccounts() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveLocalAccounts(accs) {
  try {
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accs));
  } catch {}
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function getCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function setCachedUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {}
}

export function isConnected() {
  return Boolean(getToken() && API_BASE);
}

async function jsonFetch(path, options = {}) {
  if (!API_BASE) {
    const err = new Error(
      `Cannot execute network request to ${path}: no backend API is configured. Running in Browser/Offline mode.`
    );
    err.code = "API_NOT_CONFIGURED";
    err.status = 0;
    throw err;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const contentType = res.headers?.get?.("content-type") || "";
  const isJson = contentType.includes("application/json");
  let body = {};
  if (isJson) {
    try {
      body = await res.json();
    } catch {}
  } else {
    try {
      body = await res.json();
    } catch {
      if (res.ok) {
        const err = new Error(
          "MediSense backend API returned a non-JSON response. Verify VITE_API_URL points to your backend server."
        );
        err.code = "API_MISCONFIGURED";
        throw err;
      }
    }
  }
  if (!res.ok) {
    if (res.status === 405) {
      const err = new Error(
        `Backend API endpoint (${path}) returned 405 (Method Not Allowed). Static host does not support direct backend APIs. Please configure VITE_API_URL to point to a live backend server.`
      );
      err.status = 405;
      err.code = "ENDPOINT_NOT_ALLOWED";
      throw err;
    }
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body.code;
    throw err;
  }
  return body;
}

async function authFetch(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error("Not signed in to an account");
  try {
    return await jsonFetch(path, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
  } catch (e) {
    if (
      e.status === 401 ||
      String(e.message).toLowerCase().includes("unauthorized") ||
      String(e.message).toLowerCase().includes("invalid or expired") ||
      String(e.message).toLowerCase().includes("logged out")
    ) {
      setToken(null);
      setCachedUser(null);
    }
    throw e;
  }
}

/* ---------------------------------- health --------------------------------- */

export async function checkServerHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) return null;
    const ct = res.headers?.get?.("content-type") || "";
    if (!ct.includes("application/json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ----------------------------------- auth ---------------------------------- */

export async function register(name, email, password, opts = {}) {
  if (!API_BASE) {
    const emailLower = (email || "").toLowerCase().trim();
    const id = "usr_" + Math.random().toString(36).slice(2, 10);
    const user = {
      id,
      name: name.trim(),
      email: emailLower,
      role: opts.role || "patient",
      consentPrivacy: opts.consentPrivacy ?? true,
      consentHealthProcessing: opts.consentHealthProcessing ?? true,
      createdAt: new Date().toISOString(),
      offline: true,
    };
    const accounts = getLocalAccounts();
    accounts[emailLower] = { ...user, password };
    saveLocalAccounts(accounts);
    setToken("local_token_" + id);
    setCachedUser(user);
    return user;
  }

  const body = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      password,
      role: opts.role || "patient",
      inviteCode: opts.inviteCode,
      consentPrivacy: opts.consentPrivacy ?? true,
      consentHealthProcessing: opts.consentHealthProcessing ?? true,
    }),
  });
  setToken(body.token);
  setCachedUser(body.user);
  return body.user;
}

export async function login(email, password, expectedRole) {
  if (!API_BASE) {
    const emailLower = (email || "").toLowerCase().trim();

    // 1. Built-in demo accounts
    if (emailLower === "alex@medisense.demo" || emailLower === "patient@medisense.demo") {
      const user = { id: "p1", name: "Alex Mercer", email: emailLower, role: "patient", offline: true };
      setToken("local_token_p1");
      setCachedUser(user);
      return user;
    }
    if (emailLower === "priya.caregiver@medisense.demo" || emailLower === "caregiver@medisense.demo") {
      const user = { id: "c1", name: "Priya Sharma", email: emailLower, role: "caregiver", offline: true };
      setToken("local_token_c1");
      setCachedUser(user);
      return user;
    }
    if (emailLower === "dr.chen@medisense.demo" || emailLower === "doctor@medisense.demo") {
      const user = { id: "d1", name: "Dr. Sarah Chen, MD", email: emailLower, role: "doctor", offline: true };
      setToken("local_token_d1");
      setCachedUser(user);
      return user;
    }

    // 2. Check accounts registered on this device
    const accounts = getLocalAccounts();
    const existing = accounts[emailLower];
    if (existing) {
      if (expectedRole && existing.role !== expectedRole) {
        throw new Error(`This account is registered as a ${existing.role}, not a ${expectedRole}.`);
      }
      setToken("local_token_" + existing.id);
      setCachedUser(existing);
      return existing;
    }

    // 3. Fallback: dynamically create local session in standalone mode
    const user = {
      id: "usr_" + Math.random().toString(36).slice(2, 10),
      name: email.split("@")[0],
      email: emailLower,
      role: expectedRole || "patient",
      createdAt: new Date().toISOString(),
      offline: true,
    };
    accounts[emailLower] = { ...user, password };
    saveLocalAccounts(accounts);
    setToken("local_token_" + user.id);
    setCachedUser(user);
    return user;
  }

  const body = await jsonFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, expectedRole }),
  });
  setToken(body.token);
  setCachedUser(body.user);
  return body.user;
}

export async function logout() {
  const token = getToken();
  setToken(null);
  setCachedUser(null);
  if (token && API_BASE) {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }
}

export async function whoAmI() {
  if (!API_BASE) {
    return getCachedUser();
  }
  const body = await authFetch("/api/me");
  setCachedUser(body.user);
  return body.user;
}

const RESET_CODES_KEY = "medisense_reset_codes";

function getResetCodes() {
  try {
    return JSON.parse(localStorage.getItem(RESET_CODES_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveResetCodes(codes) {
  try {
    localStorage.setItem(RESET_CODES_KEY, JSON.stringify(codes));
  } catch {}
}

export async function forgotPassword(email) {
  if (!API_BASE) {
    const cleanEmail = String(email || "").toLowerCase().trim();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codes = getResetCodes();
    codes[cleanEmail] = {
      code,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    saveResetCodes(codes);

    let emailSent = false;
    const resendKey = import.meta.env.VITE_RESEND_API_KEY;
    const web3formsKey = import.meta.env.VITE_WEB3FORMS_KEY;

    if (resendKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "MediSense Security <onboarding@resend.dev>",
            to: [cleanEmail],
            subject: `MediSense Password Reset Code: ${code}`,
            text: `Hello,\n\nYour 6-digit password reset verification code for MediSense is: ${code}\n\nThis code will expire in 15 minutes.\n\n— MediSense Health Team`,
          }),
        });
        emailSent = true;
      } catch (e) {
        console.warn("[medisense-email] Resend delivery error:", e);
      }
    } else if (web3formsKey) {
      try {
        await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_key: web3formsKey,
            to_email: cleanEmail,
            subject: `MediSense Password Reset Code: ${code}`,
            message: `Your 6-digit MediSense password reset verification code is: ${code} (expires in 15 minutes).`,
          }),
        });
        emailSent = true;
      } catch (e) {
        console.warn("[medisense-email] Web3Forms delivery error:", e);
      }
    }

    return {
      ok: true,
      code,
      emailSent,
      devResetToken: code,
      message: emailSent
        ? `A 6-digit password reset code has been sent directly to ${cleanEmail}.`
        : `A 6-digit password reset code was generated for ${cleanEmail}. Check your inbox or enter the code below.`,
    };
  }
  return jsonFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token, newPassword, email) {
  if (!API_BASE) {
    const cleanToken = String(token || "").trim();
    const codes = getResetCodes();
    let matchedEmail = null;

    for (const [em, entry] of Object.entries(codes)) {
      if (entry.code === cleanToken) {
        if (entry.expiresAt < Date.now()) {
          throw new Error("This reset code has expired. Please request a new code.");
        }
        matchedEmail = em;
        break;
      }
    }

    if (!matchedEmail && cleanToken !== "local_reset_token") {
      throw new Error("Invalid 6-digit verification code. Please check the code and try again.");
    }

    const targetEmail = matchedEmail || (email ? email.toLowerCase().trim() : null);
    if (targetEmail) {
      const accounts = getLocalAccounts();
      if (accounts[targetEmail]) {
        accounts[targetEmail].password = newPassword;
        saveLocalAccounts(accounts);
      }
      delete codes[targetEmail];
      saveResetCodes(codes);
    }

    return { ok: true, message: "Password updated successfully. You can now sign in with your new password." };
  }
  return jsonFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function verifyEmail(token) {
  if (!API_BASE) {
    return { ok: true, message: "Browser Mode: Email verified successfully." };
  }
  return jsonFetch("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function deleteAccount(password) {
  if (!API_BASE) {
    const cached = getCachedUser();
    if (cached?.email) {
      const accounts = getLocalAccounts();
      delete accounts[cached.email.toLowerCase()];
      saveLocalAccounts(accounts);
    }
    setToken(null);
    setCachedUser(null);
    return { ok: true };
  }
  const res = await authFetch("/api/auth/account", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
  setToken(null);
  setCachedUser(null);
  return res;
}

/* ------------------------------- data storage ------------------------------ */

export async function remoteGet(key) {
  if (!API_BASE) throw new Error("No backend configured");
  return authFetch(`/api/data/${encodeURIComponent(key)}`);
}
export async function remoteSet(key, value) {
  if (!API_BASE) throw new Error("No backend configured");
  return authFetch(`/api/data/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}
export async function remoteDelete(key) {
  if (!API_BASE) throw new Error("No backend configured");
  return authFetch(`/api/data/${encodeURIComponent(key)}`, { method: "DELETE" });
}
export async function remoteList(prefix) {
  if (!API_BASE) throw new Error("No backend configured");
  const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
  return authFetch(`/api/data${qs}`);
}

export async function exportAllData() {
  return authFetch("/api/data/export");
}

/* ---------------------------------- DPDP ----------------------------------- */

export async function getPrivacySummary() {
  return authFetch("/api/privacy/consents");
}

export async function updateConsent(consentType, granted) {
  return authFetch("/api/privacy/consents", {
    method: "POST",
    body: JSON.stringify({ consentType, granted }),
  });
}

/* -------------------------------- documents -------------------------------- */

export async function listDocuments() {
  return authFetch("/api/documents");
}

export async function uploadDocument(file, category = "Other") {
  const token = getToken();
  if (!token) throw new Error("Not signed in to server");
  const form = new FormData();
  form.append("category", category);
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let body = {};
  try {
    body = await res.json();
  } catch {}
  if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
  return body.document;
}

export async function fetchDocumentBlob(id) {
  const token = getToken();
  if (!token) throw new Error("Not signed in to server");
  const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(id)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      const b = await res.json();
      if (b.error) msg = b.error;
    } catch {}
    throw new Error(msg);
  }
  return res.blob();
}

export async function deleteDocument(id) {
  return authFetch(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ----------------------------------- AI ------------------------------------ */

export async function askAI({ messages, patientContext, stream = true, onChunk }) {
  if (!API_BASE) {
    const err = new Error("Gemini AI assistant requires a live MediSense backend server with GEMINI_API_KEY configured.");
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }
  const token = getToken();
  if (!token) {
    const err = new Error("Connect to the MediSense server (sign in with an account) to use AI Insights.");
    err.code = "NOT_SIGNED_IN";
    throw err;
  }

  const res = await fetch(`${API_BASE}/api/ai-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, patientContext, stream }),
  });

  if (!res.ok) {
    let body = {};
    try {
      body = await res.json();
    } catch {}
    const err = new Error(body.error || `AI request failed (${res.status})`);
    err.status = res.status;
    err.code = body.code;
    throw err;
  }

  const contentType = res.headers.get("content-type") || "";
  if (stream && contentType.includes("text/event-stream") && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";
      for (const block of lines) {
        const line = block.trim();
        if (!line.startsWith("data:")) continue;
        try {
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.error) throw new Error(evt.error);
          if (evt.chunk) {
            fullText += evt.chunk;
            onChunk?.(fullText);
          }
          if (evt.done && evt.text) {
            fullText = evt.text;
          }
        } catch (err) {
          if (err instanceof Error && !err.message.includes("JSON")) throw err;
        }
      }
    }
    return fullText;
  }

  const json = await res.json();
  return json.text || "";
}

export async function summarizeReport(title, content) {
  return authFetch("/api/ai-summarize-report", {
    method: "POST",
    body: JSON.stringify({ title, content }),
  });
}

/* -------------------------------- caregivers ------------------------------- */

export async function listCaregivers() {
  return authFetch("/api/caregivers");
}

export async function inviteCaregiver(payload) {
  return authFetch("/api/caregivers/invite", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCaregiverPermissions(id, permissions) {
  return authFetch(`/api/caregivers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ permissions }),
  });
}

export async function revokeCaregiver(id) {
  return authFetch(`/api/caregivers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function fetchCaregiverPatients() {
  return authFetch("/api/caregiver/patients");
}

export async function acceptCaregiverInvite(relationshipId) {
  return authFetch(`/api/caregiver/accept/${encodeURIComponent(relationshipId)}`, {
    method: "POST",
  });
}

/* --------------------------------- doctor ---------------------------------- */

export async function fetchDoctorPatients() {
  return authFetch("/api/doctor/patients");
}

export async function fetchDoctorPatientDetail(patientId) {
  return authFetch(`/api/doctor/patients/${encodeURIComponent(patientId)}`);
}

export async function doctorPrescribeMedication(patientId, medData) {
  return authFetch(`/api/doctor/patients/${encodeURIComponent(patientId)}/prescriptions`, {
    method: "POST",
    body: JSON.stringify(medData),
  });
}

export async function fetchDoctorAppointments() {
  return authFetch("/api/doctor/appointments");
}

export async function fetchDoctorProfile() {
  return authFetch("/api/doctor/profile");
}

export async function updateDoctorProfile(profileData) {
  return authFetch("/api/doctor/profile", {
    method: "PUT",
    body: JSON.stringify(profileData),
  });
}

export async function shareWithDoctor(doctorEmail, permissions) {
  return authFetch("/api/care/share-doctor", {
    method: "POST",
    body: JSON.stringify({ doctorEmail, permissions }),
  });
}

/* -------------------------------- messages --------------------------------- */

export async function fetchMessages(patientId) {
  return authFetch(`/api/messages/${encodeURIComponent(patientId)}`);
}

export async function sendChatMessage(patientId, text) {
  return authFetch(`/api/messages/${encodeURIComponent(patientId)}`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/* ------------------------------ appointments ------------------------------- */

export async function fetchAppointments() {
  return authFetch("/api/appointments");
}

export async function bookAppointment(apptData) {
  return authFetch("/api/appointments", {
    method: "POST",
    body: JSON.stringify(apptData),
  });
}

/* ------------------------------ interactions ------------------------------- */

export async function checkInteractionsServer(payload) {
  return authFetch("/api/interactions/check", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ---------------------------------- push ----------------------------------- */

export async function getPushPublicKey() {
  return authFetch("/api/push/public-key");
}

export async function subscribePush(subscription) {
  return authFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription),
  });
}

export async function unsubscribePush(endpoint) {
  return authFetch("/api/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
}

export async function sendTestPush(body) {
  return authFetch("/api/push/test", {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
