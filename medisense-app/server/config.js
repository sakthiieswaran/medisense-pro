/**
 * MediSense Backend Environment Configuration & Startup Validator
 * ----------------------------------------------------------------
 * Validates all required and optional environment variables on server startup,
 * enforces strict production security boundaries, rejects weak or placeholder
 * secrets, and never prints secret values to logs or error messages.
 */
import * as webpush from "web-push";

const VALID_NODE_ENVS = new Set(["development", "test", "production"]);
const DEFAULT_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
];
const INSECURE_SECRET_PATTERNS = [
  "replace-with",
  "dev-only",
  "change-me",
  "your-jwt-secret",
  "your-secret",
  "placeholder",
  "example",
];
const PLACEHOLDER_API_PATTERNS = [
  "your-gemini-api-key",
  "your-api-key",
  "replace-with",
  "your-project.supabase",
  "your-service-role-key",
];
const JWT_EXPIRY_RE =
  /^(\d+)\s*(ms|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks)?$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/;
const MODEL_RE = /^[a-zA-Z0-9._-]+$/;

function isPlaceholder(val, patterns = INSECURE_SECRET_PATTERNS) {
  const lower = String(val || "").trim().toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function parseBoolEnv(raw, name, defaultVal) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return defaultVal;
  }
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(
    `[medisense-config] FATAL: ${name} must be "true" or "false" when set.`
  );
}

function parsePort(rawPort) {
  if (rawPort === undefined || rawPort === null || String(rawPort).trim() === "") {
    return 4000;
  }
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `[medisense-config] FATAL: PORT must be an integer between 1 and 65535.`
    );
  }
  return parsed;
}

function parseJwtExpiry(rawExpiry) {
  const value = String(rawExpiry || "24h").trim();
  const match = value.match(JWT_EXPIRY_RE);
  if (!match || Number(match[1]) <= 0) {
    throw new Error(
      `[medisense-config] FATAL: JWT_EXPIRY must be a positive duration (e.g. "24h", "12h", "7d", or seconds).`
    );
  }
  return value;
}

function resolveJwtSecret(rawSecret, nodeEnv) {
  const secret = String(rawSecret || "").trim();
  const isProd = nodeEnv === "production";
  const tooWeak =
    !secret ||
    secret.length < 32 ||
    isPlaceholder(secret) ||
    new Set(secret).size < 10;

  if (tooWeak) {
    if (isProd) {
      throw new Error(
        "[medisense-config] FATAL: JWT_SECRET must be at least 32 high-entropy characters (non-placeholder, 10+ unique chars) in production."
      );
    }
    console.warn(
      "[medisense-server] WARNING: JWT_SECRET is missing or weak (<32 chars / low entropy). Using local development fallback — NEVER deploy with this default."
    );
    return secret || "medisense-local-dev-secret-do-not-use-in-production-0001";
  }
  return secret;
}

function parseCorsOrigins(rawOrigin, nodeEnv) {
  const isProd = nodeEnv === "production";
  const raw = String(rawOrigin ?? "").trim();

  if (!raw || raw === "*") {
    if (isProd) {
      throw new Error(
        '[medisense-config] FATAL: Explicit CORS_ORIGIN allowlist is required in production ("*" is forbidden).'
      );
    }
    return [...DEFAULT_DEV_ORIGINS];
  }

  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    if (isProd) {
      throw new Error(
        "[medisense-config] FATAL: CORS_ORIGIN cannot be empty in production."
      );
    }
    return [...DEFAULT_DEV_ORIGINS];
  }

  const normalized = [];
  for (const entry of entries) {
    if (entry.includes("*")) {
      if (isProd) {
        throw new Error(
          '[medisense-config] FATAL: Wildcard origins ("*") are rejected in CORS_ORIGIN in production.'
        );
      }
      return [...DEFAULT_DEV_ORIGINS];
    }
    let parsed;
    try {
      parsed = new URL(entry);
    } catch {
      throw new Error(
        `[medisense-config] FATAL: CORS_ORIGIN contains an invalid URL ("${entry}"). Use full origin like https://app.example.com.`
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(
        `[medisense-config] FATAL: CORS_ORIGIN entries must use http:// or https:// ("${entry}").`
      );
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error(
        `[medisense-config] FATAL: CORS_ORIGIN entries must be origins without paths or query strings ("${entry}").`
      );
    }
    normalized.push(parsed.origin);
  }
  return [...new Set(normalized)];
}

function resolveGeminiConfig(env, isProd) {
  const rawKey = String(env.GEMINI_API_KEY || "").trim();
  const model = String(env.GEMINI_MODEL || "gemini-2.5-flash").trim();

  if (!MODEL_RE.test(model)) {
    throw new Error(
      "[medisense-config] FATAL: GEMINI_MODEL contains invalid characters."
    );
  }

  if (!rawKey) {
    return { configured: false, apiKey: null, model };
  }

  if (isPlaceholder(rawKey, PLACEHOLDER_API_PATTERNS) || /\s/.test(rawKey) || rawKey.length < 20) {
    if (isProd) {
      throw new Error(
        "[medisense-config] FATAL: GEMINI_API_KEY appears invalid or still set to a placeholder."
      );
    }
    console.warn(
      "[medisense-config] WARNING: GEMINI_API_KEY appears incomplete/placeholder; AI endpoints will remain disabled until configured."
    );
    return { configured: false, apiKey: null, model };
  }

  return { configured: true, apiKey: rawKey, model };
}

function resolveSupabaseConfig(env, isProd) {
  const url = String(env.SUPABASE_URL || "").trim();
  const serviceKey = String(env.SUPABASE_SERVICE_KEY || "").trim();
  const bucket = String(env.SUPABASE_BUCKET || "medisense-documents").trim();

  if (!url && !serviceKey) {
    return { configured: false, url: null, serviceKey: null, bucket };
  }
  if (!url || !serviceKey) {
    throw new Error(
      "[medisense-config] FATAL: Incomplete Supabase Storage configuration — set both SUPABASE_URL and SUPABASE_SERVICE_KEY (or leave both blank to use private local disk storage)."
    );
  }
  if (isPlaceholder(url, PLACEHOLDER_API_PATTERNS) || isPlaceholder(serviceKey, PLACEHOLDER_API_PATTERNS)) {
    throw new Error(
      "[medisense-config] FATAL: Supabase Storage credentials still contain placeholder values."
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(
      "[medisense-config] FATAL: SUPABASE_URL must be a valid URL (e.g., https://<project-ref>.supabase.co)."
    );
  }
  if (isProd && parsedUrl.protocol !== "https:") {
    throw new Error(
      "[medisense-config] FATAL: SUPABASE_URL must use https:// in production."
    );
  }
  if (!isProd && parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(
      "[medisense-config] FATAL: SUPABASE_URL must use http:// or https://."
    );
  }
  if (serviceKey.length < 20 || /\s/.test(serviceKey)) {
    throw new Error(
      "[medisense-config] FATAL: SUPABASE_SERVICE_KEY appears malformed."
    );
  }
  if (!BUCKET_RE.test(bucket)) {
    throw new Error(
      "[medisense-config] FATAL: SUPABASE_BUCKET must be 3-63 lowercase letters, digits, dots, underscores, or hyphens."
    );
  }

  return {
    configured: true,
    url: parsedUrl.origin,
    serviceKey,
    bucket,
  };
}

function resolveVapidConfig(env, isProd) {
  const publicKey = String(env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || "").trim();
  const subjectRaw = String(env.VAPID_SUBJECT || "").trim();

  if (!publicKey && !privateKey) {
    if (subjectRaw && !subjectRaw.startsWith("mailto:") && !subjectRaw.startsWith("https://")) {
      throw new Error(
        '[medisense-config] FATAL: VAPID_SUBJECT must start with "mailto:" or "https://".'
      );
    }
    return {
      configured: false,
      publicKey: null,
      privateKey: null,
      subject: subjectRaw || (isProd ? "" : "mailto:dev@medisense.local"),
    };
  }

  if (!publicKey || !privateKey) {
    throw new Error(
      "[medisense-config] FATAL: Incomplete Web Push configuration — set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY."
    );
  }

  const subject = subjectRaw || (isProd ? "" : "mailto:support@medisense.local");
  if (!subject || (!subject.startsWith("mailto:") && !subject.startsWith("https://"))) {
    throw new Error(
      '[medisense-config] FATAL: VAPID_SUBJECT is required when VAPID keys are configured and must start with "mailto:" or "https://".'
    );
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (err) {
    throw new Error(
      `[medisense-config] FATAL: Invalid Web Push VAPID credentials (${err?.message || "check key format"}).`
    );
  }

  return { configured: true, publicKey, privateKey, subject };
}

function resolveSmtpConfig(env) {
  const host = String(env.SMTP_HOST || "").trim();
  const rawPort = String(env.SMTP_PORT || "").trim();
  const user = String(env.SMTP_USER || "").trim();
  const password = String(env.SMTP_PASSWORD || "").trim();
  const from = String(env.SMTP_FROM || "").trim();

  const anySet = Boolean(host || rawPort || user || password || from);
  if (!anySet) {
    return {
      configured: false,
      host: null,
      port: null,
      user: null,
      password: null,
      from: null,
    };
  }

  if (!host) {
    throw new Error(
      "[medisense-config] FATAL: Incomplete SMTP configuration — SMTP_HOST is required when other SMTP variables are set."
    );
  }
  if (!rawPort) {
    throw new Error(
      "[medisense-config] FATAL: Incomplete SMTP configuration — SMTP_PORT is required (e.g., 587 or 465)."
    );
  }
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      "[medisense-config] FATAL: SMTP_PORT must be an integer between 1 and 65535."
    );
  }
  if (!from || !EMAIL_RE.test(from.replace(/^.*<([^>]+)>$/, "$1").trim())) {
    throw new Error(
      "[medisense-config] FATAL: SMTP_FROM must be a valid sender email address when SMTP is configured."
    );
  }
  if ((user && !password) || (!user && password)) {
    throw new Error(
      "[medisense-config] FATAL: Both SMTP_USER and SMTP_PASSWORD must be provided together for SMTP authentication."
    );
  }

  return {
    configured: true,
    host,
    port,
    user: user || null,
    password: password || null,
    from,
  };
}

/**
 * Validates and normalizes all server environment configuration.
 * Throws descriptive errors (never containing secrets) when invalid.
 */
export function validateConfig(env = process.env, options = {}) {
  const nodeEnv = String(options.nodeEnv || env.NODE_ENV || "development").trim();
  if (!VALID_NODE_ENVS.has(nodeEnv)) {
    throw new Error(
      `[medisense-config] FATAL: NODE_ENV must be one of development, test, or production (received "${nodeEnv}").`
    );
  }
  const isProd = nodeEnv === "production";

  const port = parsePort(options.port !== undefined ? options.port : env.PORT);
  const jwtExpiry = parseJwtExpiry(options.jwtExpiry || env.JWT_EXPIRY);
  const jwtSecret = resolveJwtSecret(
    options.jwtSecret !== undefined ? options.jwtSecret : env.JWT_SECRET,
    nodeEnv
  );
  const allowedOrigins = parseCorsOrigins(
    options.corsOrigin !== undefined ? options.corsOrigin : env.CORS_ORIGIN,
    nodeEnv
  );

  // Demo accounts: strictly forbidden in production even if explicitly requested
  const rawDemoEnv = parseBoolEnv(env.ENABLE_DEMO_ACCOUNTS, "ENABLE_DEMO_ACCOUNTS", nodeEnv !== "production");
  if (isProd && (options.seedDemo === true || String(env.ENABLE_DEMO_ACCOUNTS || "").trim().toLowerCase() === "true")) {
    throw new Error(
      "[medisense-config] FATAL: Demo accounts (ENABLE_DEMO_ACCOUNTS) cannot be enabled in production."
    );
  }
  const enableDemoAccounts = isProd
    ? false
    : options.seedDemo !== undefined
    ? Boolean(options.seedDemo)
    : rawDemoEnv;

  const returnDevTokens = parseBoolEnv(env.RETURN_DEV_TOKENS, "RETURN_DEV_TOKENS", false);
  if (isProd && returnDevTokens) {
    throw new Error(
      "[medisense-config] FATAL: RETURN_DEV_TOKENS cannot be enabled in production."
    );
  }

  const enableOpenFdaLookup = parseBoolEnv(env.ENABLE_OPENFDA_LOOKUP, "ENABLE_OPENFDA_LOOKUP", true);

  const doctorInviteCode = String(options.doctorInviteCode ?? env.DOCTOR_INVITE_CODE ?? "").trim();
  if (isProd && doctorInviteCode) {
    if (doctorInviteCode.length < 8 || isPlaceholder(doctorInviteCode)) {
      throw new Error(
        "[medisense-config] FATAL: DOCTOR_INVITE_CODE in production must be at least 8 characters and not a placeholder."
      );
    }
  } else if (isProd && !doctorInviteCode) {
    console.warn(
      "[medisense-config] NOTICE: DOCTOR_INVITE_CODE is unset in production — new doctor registration will remain locked until configured."
    );
  }

  const gemini = resolveGeminiConfig(env, isProd);
  const supabase = resolveSupabaseConfig(env, isProd);
  const vapid = resolveVapidConfig(env, isProd);
  const smtp = resolveSmtpConfig(env);

  return {
    nodeEnv,
    isProd,
    port,
    jwtSecret,
    jwtExpiry,
    allowedOrigins,
    enableDemoAccounts,
    returnDevTokens: isProd ? false : nodeEnv === "test" || returnDevTokens,
    enableOpenFdaLookup,
    doctorInviteCode: doctorInviteCode || null,
    gemini,
    supabase,
    vapid,
    smtp,
  };
}

/**
 * Returns non-sensitive boolean/summary status for startup logs and /api/health.
 */
export function publicHealthConfig(config) {
  return {
    storage: "sqlite",
    aiConfigured: Boolean(config.gemini?.configured),
    supabaseConfigured: Boolean(config.supabase?.configured),
    pushConfigured: Boolean(config.vapid?.configured || !config.isProd),
    smtpConfigured: Boolean(config.smtp?.configured),
    openFdaEnabled: Boolean(config.enableOpenFdaLookup),
  };
}
