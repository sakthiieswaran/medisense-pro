import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
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

describe("MediSense Security, SQLite, Caregiver & DPDP API", () => {
  let tmpDir;
  let dbPath;
  let uploadsDir;
  let server;
  let baseUrl;
  let db;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "medisense-test-"));
    dbPath = path.join(tmpDir, "test.sqlite");
    uploadsDir = path.join(tmpDir, "uploads");
    const app = createApp({
      dbPath,
      uploadsDir,
      nodeEnv: "test",
      jwtSecret: "test-secret-key-with-more-than-32-characters-001",
      corsOrigin: "http://localhost:5173",
      disableRateLimit: true,
      seedDemo: false,
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

  it("initializes cleanly with live rate limiters enabled and serves /api/health", async () => {
    const rateTmp = fs.mkdtempSync(path.join(os.tmpdir(), "medisense-rl-"));
    const liveApp = createApp({
      dbPath: path.join(rateTmp, "rl.sqlite"),
      uploadsDir: path.join(rateTmp, "uploads"),
      nodeEnv: "development",
      jwtSecret: "dev-rate-limit-verification-secret-over-32-chars",
      corsOrigin: "http://localhost:5173",
      disableRateLimit: false,
      seedDemo: true,
    });
    const started = await startTestServer(liveApp);
    try {
      const res = await fetch(`${started.baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.storage, "sqlite");
      assert.equal("aiConfigured" in body, true);
    } finally {
      await new Promise((resolve) => started.server.close(resolve));
      liveApp.locals.db.close();
      fs.rmSync(rateTmp, { recursive: true, force: true });
    }
  });

  it("refuses production startup without strong JWT_SECRET or explicit CORS_ORIGIN", () => {
    assert.throws(
      () => createApp({ dbPath: ":memory:", nodeEnv: "production", jwtSecret: "short", corsOrigin: "https://app.example.com" }),
      /JWT_SECRET/
    );
    assert.throws(
      () =>
        createApp({
          dbPath: ":memory:",
          nodeEnv: "production",
          jwtSecret: "ProdSecret-9xK2mQ8vR4wL7pN2zT5bY1cF-01",
          corsOrigin: "*",
        }),
      /CORS_ORIGIN/
    );
  });

  it("registers, verifies email, logs in, checks role mismatch, and revokes token on logout", async () => {
    // Weak password rejected
    const weakRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", email: "weak@test.com", password: "short", consentPrivacy: true, consentHealthProcessing: true }),
    });
    assert.equal(weakRes.status, 400);

    // Valid patient registration
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice Patient",
        email: "alice@test.com",
        password: "Password123",
        role: "patient",
        consentPrivacy: true,
        consentHealthProcessing: true,
      }),
    });
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    assert.ok(regBody.token);
    assert.equal(regBody.user.role, "patient");
    assert.equal(regBody.user.emailVerified, false);

    // Verify email token
    const verRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: regBody.devVerificationToken }),
    });
    assert.equal(verRes.status, 200);

    // Wrong password rejected
    const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@test.com", password: "WrongPassword1" }),
    });
    assert.equal(badLogin.status, 401);

    // Role mismatch rejected (cannot log in as doctor with patient account)
    const mismatchRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@test.com", password: "Password123", expectedRole: "doctor" }),
    });
    assert.equal(mismatchRes.status, 403);

    // Valid login succeeds
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@test.com", password: "Password123", expectedRole: "patient" }),
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    assert.equal(loginBody.user.emailVerified, true);

    // Logout revokes token immediately
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    assert.equal(logoutRes.status, 200);

    const meAfterLogout = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    assert.equal(meAfterLogout.status, 401);
  });

  it("supports forgot-password and reset-password flow", async () => {
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@test.com" }),
    });
    assert.equal(forgotRes.status, 200);
    const { devResetToken } = await forgotRes.json();
    assert.ok(devResetToken);

    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: devResetToken, newPassword: "NewPassword99" }),
    });
    assert.equal(resetRes.status, 200);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@test.com", password: "NewPassword99" }),
    });
    assert.equal(loginRes.status, 200);
  });

  it("persists state into SQLite relational tables, validates documents, enforces caregiver permissions, and handles DPDP export/delete", async () => {
    // Sign in as Alice
    const aliceLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@test.com", password: "NewPassword99" }),
    }).then((r) => r.json());

    // Save Alice state -> checks relational projection in SQLite
    const sampleState = {
      doctor: { id: "doc1", name: "Dr. Chen", specialty: "Internal Medicine" },
      availability: [],
      patients: [
        {
          id: "p-alice",
          name: "Alice Patient",
          emergencyContact: "Bob — 555-1234",
          conditions: "Type 2 Diabetes",
          allergies: "Penicillin",
          medications: [
            { id: "m1", name: "Metformin", dosage: "500", unit: "mg", frequency: "Twice daily", times: ["08:00", "20:00"], active: true },
          ],
          logs: [{ id: "l1", medId: "m1", medName: "Metformin", dosage: "500mg", date: "2026-11-10", scheduledTime: "08:00", actualTime: "08:05", status: "Taken" }],
          healthRecords: [{ id: "hr1", date: "2026-11-10", heartRate: 72, systolic: 118, diastolic: 76, glucose: 105 }],
          records: { conditions: [{ id: "c1", name: "Type 2 Diabetes", status: "Ongoing" }], allergies: [], labResults: [], immunizations: [], procedures: [] },
        },
      ],
    };

    const putRes = await fetch(`${baseUrl}/api/data/medisense_state_v2`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceLogin.token}` },
      body: JSON.stringify({ value: JSON.stringify(sampleState) }),
    });
    assert.equal(putRes.status, 200);

    const medCount = db.prepare("SELECT COUNT(*) AS c FROM medications WHERE user_id = ?").get(aliceLogin.user.id);
    assert.equal(medCount.c, 1);

    // Reject spoofed file masquerading as PDF
    const fakeForm = new FormData();
    fakeForm.append("category", "Lab Report");
    fakeForm.append("file", new Blob(["not a real pdf"], { type: "application/pdf" }), "spoof.pdf");
    const badDocRes = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${aliceLogin.token}` },
      body: fakeForm,
    });
    assert.equal(badDocRes.status, 400);

    // Accept real PDF signature
    const realPdfForm = new FormData();
    realPdfForm.append("category", "Lab Report");
    realPdfForm.append("file", new Blob(["%PDF-1.4\n%sample\n"], { type: "application/pdf" }), "lab.pdf");
    const goodDocRes = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${aliceLogin.token}` },
      body: realPdfForm,
    });
    assert.equal(goodDocRes.status, 201);
    const { document: uploadedDoc } = await goodDocRes.json();

    // Register Caregiver Bob
    const bobReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bob Caregiver",
        email: "bob.caregiver@test.com",
        password: "Password123",
        role: "caregiver",
        consentPrivacy: true,
        consentHealthProcessing: true,
      }),
    }).then((r) => r.json());

    // Bob cannot read Alice's document (403)
    const crossDocRes = await fetch(`${baseUrl}/api/documents/${uploadedDoc.id}/content`, {
      headers: { Authorization: `Bearer ${bobReg.token}` },
    });
    assert.equal(crossDocRes.status, 403);

    // Alice invites Bob with ONLY medications: true (vitals/records false)
    const invRes = await fetch(`${baseUrl}/api/caregivers/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceLogin.token}` },
      body: JSON.stringify({
        email: "bob.caregiver@test.com",
        name: "Bob",
        role: "Family",
        permissions: { medications: true, vitals: false, glucose: false, records: false },
      }),
    });
    assert.equal(invRes.status, 201);

    // Bob fetches caregiver patients -> receives medications, NOT healthRecords or records!
    const cgRes = await fetch(`${baseUrl}/api/caregiver/patients`, {
      headers: { Authorization: `Bearer ${bobReg.token}` },
    });
    assert.equal(cgRes.status, 200);
    const cgBody = await cgRes.json();
    assert.equal(cgBody.patients.length, 1);
    assert.equal(cgBody.patients[0].data.medications.length, 1);
    assert.equal(cgBody.patients[0].data.healthRecords, undefined);
    assert.equal(cgBody.patients[0].data.records, undefined);

    // Drug interaction & allergy check
    const intRes = await fetch(`${baseUrl}/api/interactions/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceLogin.token}` },
      body: JSON.stringify({
        drugA: "Warfarin",
        drugB: "Aspirin",
        medications: ["Amoxicillin", "Warfarin", "Aspirin"],
        legacyAllergyText: "Penicillin",
      }),
    }).then((r) => r.json());
    assert.equal(intRes.pairResult.level, "High risk");
    assert.ok(intRes.allergyAlerts.some((a) => /penicillin/i.test(a.allergen)));

    // DPDP export
    const expRes = await fetch(`${baseUrl}/api/data/export`, {
      headers: { Authorization: `Bearer ${aliceLogin.token}` },
    });
    assert.equal(expRes.status, 200);
    const expBody = await expRes.json();
    assert.equal(expBody.medications.length, 1);
    assert.equal(expBody.documents.length, 1);

    // DPDP account deletion requires right password
    const badDel = await fetch(`${baseUrl}/api/auth/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceLogin.token}` },
      body: JSON.stringify({ password: "WrongPassword1" }),
    });
    assert.equal(badDel.status, 401);

    const goodDel = await fetch(`${baseUrl}/api/auth/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceLogin.token}` },
      body: JSON.stringify({ password: "NewPassword99" }),
    });
    assert.equal(goodDel.status, 200);

    const meAfterDel = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${aliceLogin.token}` },
    });
    assert.equal(meAfterDel.status, 401);
  });
});
