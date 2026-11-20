import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import jwt from "jsonwebtoken";
import { createApp } from "../index.js";

function startTestServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe("Independent Security Verification Suite", () => {
  let tmpDir;
  let dbPath;
  let uploadsDir;
  let server;
  let baseUrl;
  let db;
  const JWT_SECRET = "independent-security-audit-secret-with-64-characters-long-entropy-001";

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "medisense-sec-test-"));
    dbPath = path.join(tmpDir, "sec_test.sqlite");
    uploadsDir = path.join(tmpDir, "uploads");
    const app = createApp({
      dbPath,
      uploadsDir,
      nodeEnv: "test",
      jwtSecret: JWT_SECRET,
      corsOrigin: "http://localhost:5173",
      disableRateLimit: true,
      seedDemo: false,
      doctorInviteCode: "CLINIC-SECURE-2026",
    });
    db = app.locals.db;
    const started = await startTestServer(app);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1. Cross-user data access prevention: Patient A cannot access Patient B's storage", async () => {
    // Register Patient A
    const resA = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Patient A", email: "patient.a@sec.test", password: "Password123!" }),
    });
    const dataA = await resA.json();

    // Register Patient B
    const resB = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Patient B", email: "patient.b@sec.test", password: "Password123!" }),
    });
    const dataB = await resB.json();

    // Patient A writes data into KV store
    const setResA = await fetch(`${baseUrl}/api/data/medisense_state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${dataA.token}` },
      body: JSON.stringify({ value: JSON.stringify({ secret: "Patient A Private Health Record" }) }),
    });
    assert.equal(setResA.status, 200);

    // Patient B reads their own storage
    const getResB = await fetch(`${baseUrl}/api/data/medisense_state`, {
      headers: { Authorization: `Bearer ${dataB.token}` },
    });
    const stateB = await getResB.json();
    // Patient B must not see Patient A's private record
    assert.ok(!stateB.value || stateB.value === null, "Patient B cannot see Patient A data");
  });

  it("2. Unauthorized doctor access: Doctor without relationship cannot view patient data, prescriptions, or documents", async () => {
    // Register Doctor Stranger
    const docRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dr. Stranger",
        email: "stranger@hospital.test",
        password: "Password123!",
        role: "doctor",
        doctorInviteCode: "CLINIC-SECURE-2026",
      }),
    });
    const docData = await docRes.json();

    // Register Victim Patient
    const victimRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Victim Patient", email: "victim@sec.test", password: "Password123!" }),
    });
    const victimData = await victimRes.json();

    // Doctor Stranger attempts to query victim patient details
    const unauthPatient = await fetch(`${baseUrl}/api/doctor/patients/${victimData.user.id}`, {
      headers: { Authorization: `Bearer ${docData.token}` },
    });
    assert.equal(unauthPatient.status, 403, "Doctor without relationship must receive 403");

    // Doctor Stranger attempts to prescribe medication for victim patient
    const unauthPrescribe = await fetch(`${baseUrl}/api/doctor/patients/${victimData.user.id}/prescriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${docData.token}` },
      body: JSON.stringify({ name: "Unauthorized Statin", dosage: "20mg" }),
    });
    assert.equal(unauthPrescribe.status, 403, "Unauthorized prescription must receive 403");

    // Doctor Stranger attempts to read victim's messages
    const unauthMessages = await fetch(`${baseUrl}/api/messages/${victimData.user.id}`, {
      headers: { Authorization: `Bearer ${docData.token}` },
    });
    assert.equal(unauthMessages.status, 403, "Doctor without relationship cannot access messages");
  });

  it("3. Unauthorized caregiver access: Caregiver not invited by patient cannot access patient records", async () => {
    // Register Caregiver Uninvited
    const cgRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Caregiver Uninvited",
        email: "uninvited.cg@sec.test",
        password: "Password123!",
        role: "caregiver",
      }),
    });
    const cgData = await cgRes.json();

    // Caregiver requests /api/caregiver/patients
    const patientsRes = await fetch(`${baseUrl}/api/caregiver/patients`, {
      headers: { Authorization: `Bearer ${cgData.token}` },
    });
    assert.equal(patientsRes.status, 200);
    const body = await patientsRes.json();
    assert.deepEqual(body.patients, [], "Uninvited caregiver must see 0 patients");
  });

  it("4. Document access after doctor permission revocation", async () => {
    // Register Patient C
    const patRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Patient C", email: "pat.c@sec.test", password: "Password123!" }),
    });
    const patData = await patRes.json();

    // Register Doctor Friendly
    const docRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dr. Friendly",
        email: "friendly@clinic.test",
        password: "Password123!",
        role: "doctor",
        doctorInviteCode: "CLINIC-SECURE-2026",
      }),
    });
    const docData = await docRes.json();

    // Patient C uploads a test PDF document
    const pdfHeader = Buffer.from("%PDF-1.5 test document content for security testing\n%%EOF");
    const formData = new FormData();
    formData.append("file", new Blob([pdfHeader], { type: "application/pdf" }), "confidential_lab.pdf");
    formData.append("category", "lab_result");

    const uploadRes = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patData.token}` },
      body: formData,
    });
    assert.equal(uploadRes.status, 201);
    const uploadedDoc = await uploadRes.json();

    // Patient C establishes relationship granting only vitals, NOT records
    db.prepare(`
      INSERT INTO doctor_patient_relationships (id, doctor_user_id, patient_user_id, status, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).run(
      "rel-limited-perm",
      docData.user.id,
      patData.user.id,
      JSON.stringify(["vitals"]), // NO records permission
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Doctor Friendly attempts to read the document content
    const docContentRes = await fetch(`${baseUrl}/api/documents/${uploadedDoc.document.id}/content`, {
      headers: { Authorization: `Bearer ${docData.token}` },
    });
    assert.equal(docContentRes.status, 403, "Doctor lacking records permission must receive 403");
  });

  it("5. Revoked consent enforcement: Revoking ai_insights blocks AI endpoints", async () => {
    // Register Patient D
    const patRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Patient D", email: "pat.d@sec.test", password: "Password123!" }),
    });
    const patData = await patRes.json();

    // Patient D grants AI consent
    await fetch(`${baseUrl}/api/privacy/consents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patData.token}` },
      body: JSON.stringify({ consentType: "ai_insights", granted: true }),
    });

    // Patient D revokes AI consent
    const revokeRes = await fetch(`${baseUrl}/api/privacy/consents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patData.token}` },
      body: JSON.stringify({ consentType: "ai_insights", granted: false }),
    });
    assert.equal(revokeRes.status, 200);

    // Attempt AI chat with revoked consent
    const aiChat = await fetch(`${baseUrl}/api/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patData.token}` },
      body: JSON.stringify({ messages: [{ role: "user", content: "What are common side effects of lisinopril?" }] }),
    });
    assert.equal(aiChat.status, 403, "AI request with revoked consent must return 403");
    const aiErr = await aiChat.json();
    assert.equal(aiErr.code, "CONSENT_REVOKED");
  });

  it("6. Invalid, tampered, expired, and revoked JWT rejection", async () => {
    // 6a. Malformed token
    const malformedRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: "Bearer this.is.not.a.valid.jwt" },
    });
    assert.equal(malformedRes.status, 401);

    // 6b. Tampered token signature
    const patRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Patient JWT", email: "pat.jwt@sec.test", password: "Password123!" }),
    });
    const patData = await patRes.json();
    const tampered = patData.token.slice(0, -6) + "xxxxxx";
    const tamperedRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${tampered}` },
    });
    assert.equal(tamperedRes.status, 401);

    // 6c. Expired token
    const expiredToken = jwt.sign(
      { sub: patData.user.id, email: patData.user.email, role: "patient" },
      JWT_SECRET,
      { expiresIn: "1ms" }
    );
    await new Promise((r) => setTimeout(r, 20)); // wait for expiration
    const expiredRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(expiredRes.status, 401);

    // 6d. Revoked token via logout
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patData.token}` },
    });
    assert.equal(logoutRes.status, 200);

    const postLogoutRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${patData.token}` },
    });
    assert.equal(postLogoutRes.status, 401);
  });

  it("7. Sensitive information protection in API responses", async () => {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Patient Sanitize", email: "pat.san@sec.test", password: "Password123!" }),
    });
    const regBody = await regRes.json();
    assert.equal(regBody.user.password_hash, undefined, "password_hash must never be exposed");
    assert.equal(regBody.user.verification_token_hash, undefined);
    assert.equal(regBody.user.reset_token_hash, undefined);

    const meRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${regBody.token}` },
    });
    const meBody = await meRes.json();
    assert.equal(meBody.user.password_hash, undefined);

    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthBody = await healthRes.json();
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.jwt_secret, undefined);
    assert.equal(healthBody.dbPath, undefined);
  });

  it("8. File upload validation: rejects executable extensions and invalid magic numbers", async () => {
    const patRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Patient Upload", email: "pat.up@sec.test", password: "Password123!" }),
    });
    const patData = await patRes.json();

    // 8a. Disallowed mime type (text/html)
    const badForm = new FormData();
    badForm.append("file", new Blob(["<script>alert(1)</script>"], { type: "text/html" }), "exploit.html");
    const badRes = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patData.token}` },
      body: badForm,
    });
    assert.equal(badRes.status, 400);

    // 8b. Mismatched magic numbers (declared image/png but containing text)
    const spoofForm = new FormData();
    spoofForm.append("file", new Blob(["not a real png header at all"], { type: "image/png" }), "fake.png");
    const spoofRes = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patData.token}` },
      body: spoofForm,
    });
    assert.equal(spoofRes.status, 400);
    const spoofBody = await spoofRes.json();
    assert.match(spoofBody.error, /do not match/i);
  });

  it("9. DPDP Account erasure purges user data, documents, and credentials", async () => {
    // Register user to erase
    const patRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Patient Erase", email: "pat.erase@sec.test", password: "Password123!" }),
    });
    const patData = await patRes.json();

    // Upload a document
    const pdfHeader = Buffer.from("%PDF-1.5 to be erased\n%%EOF");
    const form = new FormData();
    form.append("file", new Blob([pdfHeader], { type: "application/pdf" }), "erase_doc.pdf");
    await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patData.token}` },
      body: form,
    });

    // Request account erasure under DPDP
    const delRes = await fetch(`${baseUrl}/api/auth/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patData.token}` },
      body: JSON.stringify({ password: "Password123!" }),
    });
    assert.equal(delRes.status, 200);

    // Subsequent login must fail
    const loginAttempt = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "pat.erase@sec.test", password: "Password123!" }),
    });
    assert.equal(loginAttempt.status, 401);

    // Database record check
    const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(patData.user.id);
    assert.equal(userRow, undefined, "User record must be removed");

    const docCount = db.prepare("SELECT count(*) as c FROM documents WHERE user_id = ?").get(patData.user.id);
    assert.equal(docCount.c, 0, "All associated documents must be removed");
  });
});

describe("Login Rate Limiting & Production CORS Restriction Verification", () => {
  let tmpDir;
  let dbPath;
  let server;
  let baseUrl;
  let db;

  let origEnv;

  before(async () => {
    origEnv = process.env.ENABLE_DEMO_ACCOUNTS;
    process.env.ENABLE_DEMO_ACCOUNTS = "false";
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "medisense-rate-test-"));
    dbPath = path.join(tmpDir, "rate_test.sqlite");
    const app = createApp({
      dbPath,
      uploadsDir: path.join(tmpDir, "uploads"),
      nodeEnv: "production",
      jwtSecret: "production-rate-limit-and-cors-test-secret-with-64-characters-001",
      corsOrigin: "https://app.medisense.health",
      disableRateLimit: false, // Rate limiting ENABLED
      enableDemoAccounts: false,
      seedDemo: false,
    });
    db = app.locals.db;
    const started = await startTestServer(app);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  after(async () => {
    if (origEnv !== undefined) process.env.ENABLE_DEMO_ACCOUNTS = origEnv;
    else delete process.env.ENABLE_DEMO_ACCOUNTS;
    await new Promise((r) => server.close(r));
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("enforces strict rate limiting on repeated failed logins (HTTP 429)", async () => {
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://app.medisense.health",
        },
        body: JSON.stringify({ email: "invalid@rate.test", password: "WrongPassword!" }),
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.equal(got429, true, "Must receive HTTP 429 after exceeding login rate limit");
  });

  it("blocks requests with unauthorized CORS origin in production", async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      headers: { Origin: "https://evil-unauthorized-site.com" },
    });
    const allowOrigin = res.headers.get("access-control-allow-origin");
    assert.notEqual(allowOrigin, "https://evil-unauthorized-site.com");
  });
});
