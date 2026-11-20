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

describe("Doctor Ecosystem, Messaging, Appointments & DPDP Consent Enforcement", () => {
  let tmpDir;
  let dbPath;
  let uploadsDir;
  let server;
  let baseUrl;
  let db;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "medisense-doc-test-"));
    dbPath = path.join(tmpDir, "doc_test.sqlite");
    uploadsDir = path.join(tmpDir, "uploads");
    const app = createApp({
      dbPath,
      uploadsDir,
      nodeEnv: "test",
      jwtSecret: "doctor-workflow-test-secret-with-more-than-32-chars-001",
      corsOrigin: "http://localhost:5173",
      disableRateLimit: true,
      seedDemo: true,
      doctorInviteCode: "CLINIC-TEST-2026",
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

  it("provisions doctor_profiles on doctor registration and rejects patient unauthorized access", async () => {
    const docReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dr. Gregory House",
        email: "house@princeton-plainsboro.test",
        password: "Diagnostician99",
        role: "doctor",
        inviteCode: "CLINIC-TEST-2026",
        consentPrivacy: true,
        consentHealthProcessing: true,
      }),
    }).then((r) => r.json());

    assert.ok(docReg.token);
    assert.equal(docReg.user.role, "doctor");

    // Verify doctor_profiles row exists
    const docProfile = db.prepare("SELECT * FROM doctor_profiles WHERE user_id = ?").get(docReg.user.id);
    assert.ok(docProfile);
    assert.equal(docProfile.name, "Dr. Gregory House");

    // Doctor with no relationships has 0 patients initially
    const patRes = await fetch(`${baseUrl}/api/doctor/patients`, {
      headers: { Authorization: `Bearer ${docReg.token}` },
    }).then((r) => r.json());
    assert.equal(patRes.patients.length, 0);

    // Patient cannot call doctor endpoints (403 Forbidden)
    const patReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Patient Chase",
        email: "chase.patient@test.com",
        password: "PatientPass123",
        role: "patient",
        consentPrivacy: true,
        consentHealthProcessing: true,
      }),
    }).then((r) => r.json());

    const forbiddenRes = await fetch(`${baseUrl}/api/doctor/patients`, {
      headers: { Authorization: `Bearer ${patReg.token}` },
    });
    assert.equal(forbiddenRes.status, 403);
  });

  it("handles patient sharing with doctor, doctor patient lookup, and prescribing", async () => {
    // 1. Sign in as demo doctor (Dr. Chen)
    const docLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "dr.chen@medisense.demo",
        password: "demo1234",
        expectedRole: "doctor",
      }),
    }).then((r) => r.json());
    assert.ok(docLogin.token);

    // Dr. Chen has demo-patient-alex pre-linked in seed
    const docPatients = await fetch(`${baseUrl}/api/doctor/patients`, {
      headers: { Authorization: `Bearer ${docLogin.token}` },
    }).then((r) => r.json());
    assert.ok(docPatients.patients.length >= 1);
    const alex = docPatients.patients.find((p) => p.patientUserId === "demo-patient-alex");
    assert.ok(alex);
    assert.equal(alex.patientName, "Alex Johnson");

    // 2. Doctor prescribes a new medication for Alex
    const rxRes = await fetch(`${baseUrl}/api/doctor/patients/demo-patient-alex/prescriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${docLogin.token}` },
      body: JSON.stringify({
        name: "Glipizide",
        genericName: "Glipizide XL",
        dosage: "5",
        unit: "mg",
        frequency: "Once daily",
        times: ["08:00"],
        instructions: "Take with breakfast",
      }),
    });
    assert.equal(rxRes.status, 201);
    const rxBody = await rxRes.json();
    assert.equal(rxBody.medication.name, "Glipizide");

    // Verify it landed in SQLite medications table
    const dbMed = db.prepare("SELECT * FROM medications WHERE user_id = 'demo-patient-alex' AND name = 'Glipizide'").get();
    assert.ok(dbMed);
    assert.equal(dbMed.dosage, "5");
  });

  it("allows authorized doctor to access patient documents with audit logging", async () => {
    // Sign in demo patient Alex
    const patLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alex@medisense.demo", password: "demo1234", expectedRole: "patient" }),
    }).then((r) => r.json());

    // Alex uploads a PDF document
    const pdfBuffer = Buffer.from("%PDF-1.4 sample clinical report content for doctor review\n%%EOF");
    const formBoundary = "----DocBoundary123";
    const formBody = Buffer.concat([
      Buffer.from(`--${formBoundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nLab Report\r\n`),
      Buffer.from(`--${formBoundary}\r\nContent-Disposition: form-data; name="file"; filename="blood_panel.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      pdfBuffer,
      Buffer.from(`\r\n--${formBoundary}--\r\n`),
    ]);

    const upRes = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${patLogin.token}`,
        "Content-Type": `multipart/form-data; boundary=${formBoundary}`,
      },
      body: formBody,
    }).then((r) => r.json());
    assert.ok(upRes.document.id);

    // Dr. Chen accesses the document (authorized via doctor_patient_relationships with records: true)
    const docLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dr.chen@medisense.demo", password: "demo1234", expectedRole: "doctor" }),
    }).then((r) => r.json());

    const docViewRes = await fetch(`${baseUrl}/api/documents/${upRes.document.id}/content`, {
      headers: { Authorization: `Bearer ${docLogin.token}` },
    });
    assert.equal(docViewRes.status, 200);
    const docPdf = await docViewRes.text();
    assert.ok(docPdf.includes("%PDF"));

    // Verify DOCUMENT_ACCESSED audit log was written
    const audit = db.prepare("SELECT * FROM audit_logs WHERE action = 'DOCUMENT_ACCESSED' AND resource_id = ?").get(upRes.document.id);
    assert.ok(audit);
    assert.equal(audit.user_id, "demo-doctor-chen");
  });

  it("supports cross-account messaging and appointment scheduling between doctor and patient", async () => {
    const docLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dr.chen@medisense.demo", password: "demo1234", expectedRole: "doctor" }),
    }).then((r) => r.json());

    const patLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alex@medisense.demo", password: "demo1234", expectedRole: "patient" }),
    }).then((r) => r.json());

    // 1. Doctor sends a message to Alex
    const sendRes = await fetch(`${baseUrl}/api/messages/demo-patient-alex`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${docLogin.token}` },
      body: JSON.stringify({ text: "Hello Alex, please review your new Glipizide dosage schedule." }),
    });
    assert.equal(sendRes.status, 201);

    // 2. Patient reads messages and sees the doctor's message
    const msgList = await fetch(`${baseUrl}/api/messages/demo-patient-alex`, {
      headers: { Authorization: `Bearer ${patLogin.token}` },
    }).then((r) => r.json());
    assert.ok(msgList.messages.some((m) => m.text.includes("Glipizide dosage")));

    // 3. Patient books an appointment
    const bookRes = await fetch(`${baseUrl}/api/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patLogin.token}` },
      body: JSON.stringify({
        visitDate: "2026-12-01",
        visitTime: "10:30",
        doctorId: "demo-doctor-chen",
        doctorName: "Dr. Sarah Chen",
        visitType: "Endocrine Follow-up",
      }),
    });
    assert.equal(bookRes.status, 201);

    // 4. Doctor fetches appointments and sees the booked consultation
    const docAppts = await fetch(`${baseUrl}/api/doctor/appointments`, {
      headers: { Authorization: `Bearer ${docLogin.token}` },
    }).then((r) => r.json());
    assert.ok(docAppts.appointments.some((a) => a.visit_date === "2026-12-01" && a.visit_time === "10:30"));
  });

  it("strictly enforces DPDP consent revocation on AI insights and caregiver sharing", async () => {
    const patLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alex@medisense.demo", password: "demo1234", expectedRole: "patient" }),
    }).then((r) => r.json());

    // Revoke AI Insights consent
    const revokeRes = await fetch(`${baseUrl}/api/privacy/consents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patLogin.token}` },
      body: JSON.stringify({ consentType: "ai_insights", granted: false }),
    });
    assert.equal(revokeRes.status, 200);

    // Calling /api/ai-chat is now blocked with 403 CONSENT_REVOKED
    const aiRes = await fetch(`${baseUrl}/api/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patLogin.token}` },
      body: JSON.stringify({ messages: [{ role: "user", content: "What is my adherence?" }] }),
    });
    assert.equal(aiRes.status, 403);
    const aiBody = await aiRes.json();
    assert.equal(aiBody.code, "CONSENT_REVOKED");

    // Revoke caregiver sharing consent
    await fetch(`${baseUrl}/api/privacy/consents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patLogin.token}` },
      body: JSON.stringify({ consentType: "caregiver_sharing", granted: false }),
    });

    // Caregiver query now reports consent_revoked and withholds health data
    const cgLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "priya.caregiver@medisense.demo", password: "demo1234", expectedRole: "caregiver" }),
    }).then((r) => r.json());

    const cgPat = await fetch(`${baseUrl}/api/caregiver/patients`, {
      headers: { Authorization: `Bearer ${cgLogin.token}` },
    }).then((r) => r.json());

    assert.ok(cgPat.patients.some((p) => p.status === "consent_revoked" && p.data === null));
  });
});
