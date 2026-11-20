import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import * as webpush from "web-push";
import { validateConfig } from "../config.js";
import { createApp } from "../index.js";

const STRONG_PROD_SECRET = "ProdSecret-9xK2mQ8vR4wL7pN2zT5bY1cF-01";
const VALID_ORIGIN = "https://medisense.vercel.app";

function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe("Environment validation (server/config.js)", () => {
  it("refuses missing, short, placeholder, or low-entropy JWT_SECRET in production without leaking secret", () => {
    assert.throws(
      () => validateConfig({ NODE_ENV: "production", CORS_ORIGIN: VALID_ORIGIN }),
      /JWT_SECRET/
    );
    assert.throws(
      () => validateConfig({ NODE_ENV: "production", JWT_SECRET: "short", CORS_ORIGIN: VALID_ORIGIN }),
      /JWT_SECRET/
    );
    const lowEntropy = "x".repeat(48);
    assert.throws(
      () => validateConfig({ NODE_ENV: "production", JWT_SECRET: lowEntropy, CORS_ORIGIN: VALID_ORIGIN }),
      (err) => /JWT_SECRET/.test(err.message) && !err.message.includes(lowEntropy)
    );
    assert.throws(
      () =>
        validateConfig({
          NODE_ENV: "production",
          JWT_SECRET: "replace-with-a-long-random-string-right-now",
          CORS_ORIGIN: VALID_ORIGIN,
        }),
      /JWT_SECRET/
    );
  });

  it("rejects wildcard, missing, path-containing, or invalid CORS_ORIGIN in production and normalizes trailing slashes", () => {
    for (const badOrigin of ["", "*", "https://a.example.com,*", "https://*.example.com", "https://app.example.com/path", "not-a-url"]) {
      assert.throws(
        () =>
          validateConfig({
            NODE_ENV: "production",
            JWT_SECRET: STRONG_PROD_SECRET,
            CORS_ORIGIN: badOrigin,
          }),
        /CORS_ORIGIN/
      );
    }

    const cfg = validateConfig({
      NODE_ENV: "production",
      JWT_SECRET: STRONG_PROD_SECRET,
      CORS_ORIGIN: "https://app.example.com/, https://admin.example.com",
    });
    assert.deepEqual(cfg.allowedOrigins, ["https://app.example.com", "https://admin.example.com"]);
  });

  it("validates PORT, JWT_EXPIRY, NODE_ENV, and forbids demo/dev tokens in production", () => {
    assert.throws(
      () => validateConfig({ NODE_ENV: "prod", JWT_SECRET: STRONG_PROD_SECRET, CORS_ORIGIN: VALID_ORIGIN }),
      /NODE_ENV/
    );
    assert.throws(
      () => validateConfig({ NODE_ENV: "production", JWT_SECRET: STRONG_PROD_SECRET, CORS_ORIGIN: VALID_ORIGIN, PORT: "abc" }),
      /PORT/
    );
    assert.throws(
      () => validateConfig({ NODE_ENV: "production", JWT_SECRET: STRONG_PROD_SECRET, CORS_ORIGIN: VALID_ORIGIN, PORT: "70000" }),
      /PORT/
    );
    assert.throws(
      () => validateConfig({ NODE_ENV: "production", JWT_SECRET: STRONG_PROD_SECRET, CORS_ORIGIN: VALID_ORIGIN, JWT_EXPIRY: "0h" }),
      /JWT_EXPIRY/
    );
    assert.throws(
      () => validateConfig({ NODE_ENV: "production", JWT_SECRET: STRONG_PROD_SECRET, CORS_ORIGIN: VALID_ORIGIN, ENABLE_DEMO_ACCOUNTS: "true" }),
      /ENABLE_DEMO_ACCOUNTS/
    );
    assert.throws(
      () => validateConfig({ NODE_ENV: "production", JWT_SECRET: STRONG_PROD_SECRET, CORS_ORIGIN: VALID_ORIGIN, RETURN_DEV_TOKENS: "true" }),
      /RETURN_DEV_TOKENS/
    );

    const cfg = validateConfig({
      NODE_ENV: "production",
      JWT_SECRET: STRONG_PROD_SECRET,
      CORS_ORIGIN: VALID_ORIGIN,
      PORT: "8080",
      JWT_EXPIRY: "12h",
    });
    assert.equal(cfg.port, 8080);
    assert.equal(cfg.jwtExpiry, "12h");
    assert.equal(cfg.enableDemoAccounts, false);
    assert.equal(cfg.returnDevTokens, false);
  });

  it("validates optional integrations (Gemini, Supabase, Web Push VAPID, SMTP) without accepting partial configs", () => {
    // Partial Supabase
    assert.throws(
      () =>
        validateConfig({
          NODE_ENV: "production",
          JWT_SECRET: STRONG_PROD_SECRET,
          CORS_ORIGIN: VALID_ORIGIN,
          SUPABASE_URL: "https://abc.supabase.co",
        }),
      /Supabase/i
    );
    // HTTP Supabase in production
    assert.throws(
      () =>
        validateConfig({
          NODE_ENV: "production",
          JWT_SECRET: STRONG_PROD_SECRET,
          CORS_ORIGIN: VALID_ORIGIN,
          SUPABASE_URL: "http://abc.supabase.co",
          SUPABASE_SERVICE_KEY: "sb_secret_key_with_sufficient_length_123456",
        }),
      /https:\/\//
    );
    // Partial VAPID
    const vapidKeys = webpush.generateVAPIDKeys();
    assert.throws(
      () =>
        validateConfig({
          NODE_ENV: "production",
          JWT_SECRET: STRONG_PROD_SECRET,
          CORS_ORIGIN: VALID_ORIGIN,
          VAPID_PUBLIC_KEY: vapidKeys.publicKey,
        }),
      /VAPID/
    );
    assert.throws(
      () =>
        validateConfig({
          NODE_ENV: "production",
          JWT_SECRET: STRONG_PROD_SECRET,
          CORS_ORIGIN: VALID_ORIGIN,
          VAPID_PUBLIC_KEY: vapidKeys.publicKey,
          VAPID_PRIVATE_KEY: vapidKeys.privateKey,
          VAPID_SUBJECT: "invalid-subject",
        }),
      /VAPID_SUBJECT/
    );
    // Partial SMTP
    assert.throws(
      () =>
        validateConfig({
          NODE_ENV: "production",
          JWT_SECRET: STRONG_PROD_SECRET,
          CORS_ORIGIN: VALID_ORIGIN,
          SMTP_HOST: "smtp.example.com",
        }),
      /SMTP/
    );
    assert.throws(
      () =>
        validateConfig({
          NODE_ENV: "production",
          JWT_SECRET: STRONG_PROD_SECRET,
          CORS_ORIGIN: VALID_ORIGIN,
          SMTP_HOST: "smtp.example.com",
          SMTP_PORT: "587",
          SMTP_FROM: "no-reply@example.com",
          SMTP_USER: "apikey",
        }),
      /SMTP_USER.*SMTP_PASSWORD/
    );
    // Invalid Gemini model & placeholder key in production
    assert.throws(
      () =>
        validateConfig({
          NODE_ENV: "production",
          JWT_SECRET: STRONG_PROD_SECRET,
          CORS_ORIGIN: VALID_ORIGIN,
          GEMINI_API_KEY: "your-gemini-api-key-here",
        }),
      /GEMINI_API_KEY/
    );

    const fullValid = validateConfig({
      NODE_ENV: "production",
      JWT_SECRET: STRONG_PROD_SECRET,
      CORS_ORIGIN: VALID_ORIGIN,
      DOCTOR_INVITE_CODE: "CLINIC-PROD-2026",
      SUPABASE_URL: "https://medisense.supabase.co/",
      SUPABASE_SERVICE_KEY: "service_role_secret_token_example_123456",
      SUPABASE_BUCKET: "medisense-documents",
      VAPID_PUBLIC_KEY: vapidKeys.publicKey,
      VAPID_PRIVATE_KEY: vapidKeys.privateKey,
      VAPID_SUBJECT: "mailto:ops@medisense.app",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "user",
      SMTP_PASSWORD: "pass-value-123",
      SMTP_FROM: "MediSense <no-reply@medisense.app>",
    });
    assert.equal(fullValid.supabase.configured, true);
    assert.equal(fullValid.supabase.url, "https://medisense.supabase.co");
    assert.equal(fullValid.vapid.configured, true);
    assert.equal(fullValid.smtp.configured, true);
  });
});

describe("Production runtime enforcement (demo lock, doctor invite, SMTP, AI 503, Supabase delete)", () => {
  it("disables demo seeding, hides dev tokens, enforces doctor invite codes, returns AI 503 and honest SMTP responses in production", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "medisense-prod-"));
    const app = createApp({
      dbPath: path.join(tmpDir, "prod.sqlite"),
      uploadsDir: path.join(tmpDir, "uploads"),
      disableRateLimit: true,
      env: {
        NODE_ENV: "production",
        JWT_SECRET: STRONG_PROD_SECRET,
        CORS_ORIGIN: VALID_ORIGIN,
        DOCTOR_INVITE_CODE: "CLINIC-2026-PROD",
        ENABLE_OPENFDA_LOOKUP: "false",
      },
    });
    const { server, baseUrl } = await startServer(app);

    try {
      // Demo accounts are NOT seeded in production
      const demoLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alex@medisense.demo", password: "demo1234" }),
      });
      assert.equal(demoLogin.status, 401);

      // Forgot-password returns 503 when SMTP is unconfigured in production (never claims email sent)
      const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "someone@example.com" }),
      });
      assert.equal(forgotRes.status, 503);
      const forgotBody = await forgotRes.json();
      assert.equal(forgotBody.code, "SMTP_NOT_CONFIGURED");
      assert.equal(forgotBody.emailSent, false);

      // Doctor registration fails without valid invite code, succeeds with valid code
      const docFail = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Dr. Test",
          email: "dr@clinic.org",
          password: "Password123",
          role: "doctor",
          inviteCode: "WRONG-CODE",
          consentPrivacy: true,
          consentHealthProcessing: true,
        }),
      });
      assert.equal(docFail.status, 403);

      const docOk = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Dr. Test",
          email: "dr@clinic.org",
          password: "Password123",
          role: "doctor",
          inviteCode: "CLINIC-2026-PROD",
          consentPrivacy: true,
          consentHealthProcessing: true,
        }),
      });
      assert.equal(docOk.status, 201);
      const docBody = await docOk.json();
      assert.equal(docBody.devVerificationToken, undefined);
      assert.equal(docBody.verificationEmailSent, false);

      // Malformed JSON yields clean 400 with no stack trace
      const badJson = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad json",
      });
      assert.equal(badJson.status, 400);
      const badJsonBody = await badJson.json();
      assert.equal(badJsonBody.stack, undefined);

      // Unconfigured AI returns 503 AI_NOT_CONFIGURED cleanly
      const aiRes = await fetch(`${baseUrl}/api/ai-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${docBody.token}`,
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
      });
      assert.equal(aiRes.status, 503);
      const aiBody = await aiRes.json();
      assert.equal(aiBody.code, "AI_NOT_CONFIGURED");
    } finally {
      await new Promise((r) => server.close(r));
      app.locals.db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses injected SMTP mailer when configured and returns HTTP 502 if SMTP delivery fails", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "medisense-mail-"));
    const sentEmails = [];
    const mockMailer = {
      isConfigured: true,
      async sendVerificationEmail(payload) {
        sentEmails.push({ type: "verify", ...payload });
        return { sent: true };
      },
      async sendPasswordResetEmail(payload) {
        sentEmails.push({ type: "reset", ...payload });
        return { sent: true };
      },
    };
    const app = createApp({
      dbPath: path.join(tmpDir, "mail.sqlite"),
      uploadsDir: path.join(tmpDir, "uploads"),
      disableRateLimit: true,
      mailer: mockMailer,
      env: {
        NODE_ENV: "production",
        JWT_SECRET: STRONG_PROD_SECRET,
        CORS_ORIGIN: VALID_ORIGIN,
      },
    });
    const { server, baseUrl } = await startServer(app);

    try {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Mail User",
          email: "mail@example.com",
          password: "Password123",
          role: "patient",
          consentPrivacy: true,
          consentHealthProcessing: true,
        }),
      });
      assert.equal(regRes.status, 201);
      const regBody = await regRes.json();
      assert.equal(regBody.verificationEmailSent, true);
      assert.equal(regBody.devVerificationToken, undefined);
      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0].type, "verify");

      const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "mail@example.com" }),
      });
      assert.equal(forgotRes.status, 200);
      const forgotBody = await forgotRes.json();
      assert.equal(forgotBody.emailSent, true);
      assert.equal(sentEmails.length, 2);
      assert.equal(sentEmails[1].type, "reset");

      // Simulate SMTP provider error on next send -> must return 502 and emailSent: false
      mockMailer.sendPasswordResetEmail = async () => ({ sent: false, reason: "SMTP_DELIVERY_FAILED" });
      const failForgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "mail@example.com" }),
      });
      assert.equal(failForgotRes.status, 502);
      const failBody = await failForgotRes.json();
      assert.equal(failBody.emailSent, false);
      assert.equal(failBody.code, "SMTP_DELIVERY_FAILED");
    } finally {
      await new Promise((r) => server.close(r));
      app.locals.db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uploads, retrieves (with ownership enforcement), and deletes documents in Supabase Storage", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "medisense-supa-"));
    const objects = new Map();
    const supaServer = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const prefix = "/storage/v1/object/";
        const key = req.url?.startsWith(prefix) ? req.url.slice(prefix.length) : req.url;
        if (req.method === "POST") {
          objects.set(key, body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ Key: key }));
          return;
        }
        if (req.method === "GET") {
          const hit = objects.get(key);
          if (!hit) {
            res.writeHead(404);
            return res.end("Not found");
          }
          res.writeHead(200, { "Content-Type": "application/pdf" });
          return res.end(hit);
        }
        if (req.method === "DELETE") {
          objects.delete(key);
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: "Deleted" }));
        }
        res.writeHead(405).end();
      });
    });
    await new Promise((resolve) => supaServer.listen(0, "127.0.0.1", resolve));
    const supaUrl = `http://127.0.0.1:${supaServer.address().port}`;

    const app = createApp({
      dbPath: path.join(tmpDir, "supa.sqlite"),
      uploadsDir: path.join(tmpDir, "uploads"),
      disableRateLimit: true,
      seedDemo: false,
      env: {
        NODE_ENV: "development",
        JWT_SECRET: STRONG_PROD_SECRET,
        CORS_ORIGIN: "http://localhost:5173",
        SUPABASE_URL: supaUrl,
        SUPABASE_SERVICE_KEY: "service_role_test_key_with_sufficient_length",
        SUPABASE_BUCKET: "medisense-documents",
      },
    });
    const { server, baseUrl } = await startServer(app);

    try {
      const u1 = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Owner User", email: "owner@test.com", password: "Password123" }),
      }).then((r) => r.json());
      const u2 = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Other User", email: "other@test.com", password: "Password123" }),
      }).then((r) => r.json());

      const form = new FormData();
      form.append("category", "Prescription");
      form.append("file", new Blob(["%PDF-1.4\n%supa\n"], { type: "application/pdf" }), "rx.pdf");
      const up = await fetch(`${baseUrl}/api/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${u1.token}` },
        body: form,
      });
      assert.equal(up.status, 201);
      const { document } = await up.json();
      assert.equal(document.storage_provider, "supabase");
      assert.equal(objects.size, 1);

      const denied = await fetch(`${baseUrl}/api/documents/${document.id}/content`, {
        headers: { Authorization: `Bearer ${u2.token}` },
      });
      assert.equal(denied.status, 403);

      const allowed = await fetch(`${baseUrl}/api/documents/${document.id}/content`, {
        headers: { Authorization: `Bearer ${u1.token}` },
      });
      assert.equal(allowed.status, 200);

      const del = await fetch(`${baseUrl}/api/documents/${document.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${u1.token}` },
      });
      assert.equal(del.status, 200);
      assert.equal(objects.size, 0);
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => supaServer.close(r));
      app.locals.db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
