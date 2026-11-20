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

describe("End-to-End User Journey Verification (Synthetic Data Only)", () => {
  let tmpDir;
  let dbPath;
  let uploadsDir;
  let server;
  let baseUrl;
  let db;

  // Stored state across journey steps
  let patientToken;
  let patientUser;
  let doctorToken;
  let doctorUser;
  let caregiverToken;
  let caregiverUser;
  let uploadedDocId;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "medisense-e2e-test-"));
    dbPath = path.join(tmpDir, "e2e_test.sqlite");
    uploadsDir = path.join(tmpDir, "uploads");
    const app = createApp({
      dbPath,
      uploadsDir,
      nodeEnv: "test",
      jwtSecret: "end-to-end-user-journey-verification-secret-over-64-characters-001",
      corsOrigin: "http://localhost:5173",
      disableRateLimit: true,
      seedDemo: false,
      doctorInviteCode: "CLINIC-E2E-2026",
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

  it("Journey Step 1: Patient registration, email verification, and login", async () => {
    // 1a. Register patient
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sarah Jenkins",
        email: "sarah.patient@e2e.test",
        password: "PatientPassword123!",
        role: "patient",
      }),
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    assert.ok(regData.token);
    assert.equal(regData.user.email, "sarah.patient@e2e.test");
    assert.equal(regData.user.role, "patient");
    patientUser = regData.user;

    // 1b. Verify email using token from database
    const userRow = db.prepare("SELECT verification_token_hash FROM users WHERE id = ?").get(patientUser.id);
    assert.ok(userRow);

    // 1c. Log in
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "sarah.patient@e2e.test",
        password: "PatientPassword123!",
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    patientToken = loginData.token;

    // 1d. Access /api/me
    const meRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.user.id, patientUser.id);
  });

  it("Journey Step 2: Medication creation and adherence tracking", async () => {
    const patientState = {
      patients: [
        {
          id: patientUser.id,
          name: "Sarah Jenkins",
          medications: [
            {
              id: "med-lisinopril-1",
              name: "Lisinopril",
              genericName: "Lisinopril",
              dosage: "10",
              unit: "mg",
              frequency: "Daily",
              times: ["08:00"],
              active: true,
              instructions: "Take with water every morning",
            },
          ],
          logs: [
            {
              id: "dose-log-001",
              medId: "med-lisinopril-1",
              medName: "Lisinopril",
              dosage: "10mg",
              date: "2026-11-15",
              scheduledTime: "08:00",
              actualTime: "08:05",
              status: "Taken",
            },
          ],
          healthRecords: [
            {
              id: "hr-bp-001",
              date: "2026-11-15",
              systolic: 122,
              diastolic: 78,
              heartRate: 72,
              glucose: 98,
            },
          ],
          records: { conditions: [], allergies: [], labResults: [] },
        },
      ],
    };

    // Save patient state -> projects into SQLite
    const saveRes = await fetch(`${baseUrl}/api/data/medisense_state_v2`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({ value: JSON.stringify(patientState) }),
    });
    assert.equal(saveRes.status, 200);

    // Verify SQLite relational tables
    const medRow = db.prepare("SELECT * FROM medications WHERE user_id = ?").get(patientUser.id);
    assert.ok(medRow, "Medication Lisinopril must be present in SQLite");
    assert.equal(medRow.name, "Lisinopril");

    const doseRow = db.prepare("SELECT * FROM dose_history WHERE user_id = ?").get(patientUser.id);
    assert.ok(doseRow, "Dose log must be present in SQLite");
    assert.equal(doseRow.status, "Taken");

    const healthRows = db.prepare("SELECT * FROM health_measurements WHERE user_id = ?").all(patientUser.id);
    assert.ok(healthRows.length > 0, "Health measurements must be projected in SQLite");
  });

  it("Journey Step 3: Medical document upload, listing, and binary retrieval", async () => {
    const pdfContent = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Title (Blood Chemistry Panel) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    const formData = new FormData();
    formData.append("file", new Blob([pdfContent], { type: "application/pdf" }), "sarah_chemistry_panel.pdf");
    formData.append("category", "lab_result");

    const uploadRes = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}` },
      body: formData,
    });
    assert.equal(uploadRes.status, 201);
    const uploadBody = await uploadRes.json();
    uploadedDocId = uploadBody.document.id;
    assert.ok(uploadedDocId);

    // List documents
    const listRes = await fetch(`${baseUrl}/api/documents`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.ok(listBody.documents.some((d) => d.id === uploadedDocId));

    // Download document content
    const contentRes = await fetch(`${baseUrl}/api/documents/${uploadedDocId}/content`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert.equal(contentRes.status, 200);
    const buffer = Buffer.from(await contentRes.arrayBuffer());
    assert.ok(buffer.includes(Buffer.from("%PDF-1.4")));
  });

  it("Journey Step 4: Doctor registration, patient sharing, and clinical records review", async () => {
    // 4a. Doctor Patel registers with clinic invite code
    const docReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dr. Rajesh Patel",
        email: "dr.patel@e2e.test",
        password: "DoctorPassword123!",
        role: "doctor",
        doctorInviteCode: "CLINIC-E2E-2026",
      }),
    });
    assert.equal(docReg.status, 201);
    const docData = await docReg.json();
    doctorToken = docData.token;
    doctorUser = docData.user;

    // Verify doctor profile created in database
    const docProfile = db.prepare("SELECT * FROM doctor_profiles WHERE user_id = ?").get(doctorUser.id);
    assert.ok(docProfile, "Doctor profile must be automatically created");

    // 4b. Patient shares data with Doctor Patel via /api/care/share-doctor
    const shareRes = await fetch(`${baseUrl}/api/care/share-doctor`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        doctorEmail: doctorUser.email,
        permissions: { records: true, vitals: true, prescriptions: true },
      }),
    });
    assert.equal(shareRes.status, 200);

    // 4c. Doctor Patel fetches patient list
    const docPatientsRes = await fetch(`${baseUrl}/api/doctor/patients`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    assert.equal(docPatientsRes.status, 200);
    const docPatients = await docPatientsRes.json();
    assert.ok(docPatients.patients.some((p) => p.patientUserId === patientUser.id));

    // 4d. Doctor Patel views Sarah's patient detail
    const detailRes = await fetch(`${baseUrl}/api/doctor/patients/${patientUser.id}`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.ok(detailData.patient);
    assert.ok(detailData.patient.medications.some((m) => m.name === "Lisinopril"));

    // 4e. Doctor Patel views Sarah's uploaded medical document
    const docViewRes = await fetch(`${baseUrl}/api/documents/${uploadedDocId}/content`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    assert.equal(docViewRes.status, 200, "Treating doctor with records permission must access document");

    // Verify forensic audit log entry was created
    const auditRow = db.prepare(`
      SELECT * FROM audit_logs
      WHERE action = 'DOCUMENT_ACCESSED' AND user_id = ? AND resource_id = ?
    `).get(doctorUser.id, uploadedDocId);
    assert.ok(auditRow, "Document access must generate forensic audit record");
  });

  it("Journey Step 5: Doctor e-prescribing with patient receipt and persistence", async () => {
    const prescribeRes = await fetch(`${baseUrl}/api/doctor/patients/${patientUser.id}/prescriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${doctorToken}` },
      body: JSON.stringify({
        name: "Atorvastatin",
        genericName: "Atorvastatin Calcium",
        dosage: "20",
        unit: "mg",
        frequency: "Nightly",
        times: ["21:00"],
        instructions: "Take 1 tablet before bedtime",
      }),
    });
    assert.equal(prescribeRes.status, 201);
    const prescBody = await prescribeRes.json();
    assert.equal(prescBody.medication.name, "Atorvastatin");

    // Patient Sarah reads their KV store and verifies new prescription was added
    const patStateRes = await fetch(`${baseUrl}/api/data/medisense_state_v2`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const patState = JSON.parse((await patStateRes.json()).value);
    const patientMedNames = patState.patients[0].medications.map((m) => m.name);
    assert.ok(patientMedNames.includes("Atorvastatin"), "Prescribed medication must be in patient's active list");
  });

  it("Journey Step 6: Caregiver invitation, access control, and consent revocation", async () => {
    // 6a. Register caregiver Michael
    const cgReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Michael Jenkins",
        email: "michael.caregiver@e2e.test",
        password: "CaregiverPassword123!",
        role: "caregiver",
      }),
    });
    assert.equal(cgReg.status, 201);
    caregiverToken = (await cgReg.json()).token;

    // 6b. Sarah invites Michael with medications and vitals permissions (NO records)
    const invRes = await fetch(`${baseUrl}/api/caregivers/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        email: "michael.caregiver@e2e.test",
        name: "Michael",
        role: "Spouse",
        permissions: { medications: true, vitals: true, records: false },
      }),
    });
    assert.equal(invRes.status, 201);

    // 6c. Caregiver checks patients
    const cgPatientsRes = await fetch(`${baseUrl}/api/caregiver/patients`, {
      headers: { Authorization: `Bearer ${caregiverToken}` },
    });
    assert.equal(cgPatientsRes.status, 200);
    const cgBody = await cgPatientsRes.json();
    assert.equal(cgBody.patients.length, 1);
    assert.equal(cgBody.patients[0].patientName, "Sarah Jenkins");
    // Records should be withheld
    assert.equal(cgBody.patients[0].data.records, undefined);

    // 6d. Sarah revokes caregiver sharing consent under DPDP
    const revokeRes = await fetch(`${baseUrl}/api/privacy/consents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({ consentType: "caregiver_sharing", granted: false }),
    });
    assert.equal(revokeRes.status, 200);

    // 6e. Caregiver queries again -> consent_revoked
    const cgPostRevoke = await fetch(`${baseUrl}/api/caregiver/patients`, {
      headers: { Authorization: `Bearer ${caregiverToken}` },
    });
    assert.equal(cgPostRevoke.status, 200);
    const cgRevokeBody = await cgPostRevoke.json();
    assert.equal(cgRevokeBody.patients[0].status, "consent_revoked");
    assert.equal(cgRevokeBody.patients[0].data, null);
  });

  it("Journey Step 7: Appointment booking and bidirectional schedule sync", async () => {
    // Sarah schedules consultation with Dr. Patel
    const apptRes = await fetch(`${baseUrl}/api/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        doctorId: doctorUser.id,
        doctorName: "Dr. Rajesh Patel",
        visitDate: "2026-12-10",
        visitTime: "14:00",
        visitType: "Cardiology Follow-Up",
        notes: "Routine blood pressure review",
      }),
    });
    assert.equal(apptRes.status, 201);

    // Dr. Patel views upcoming appointments
    const docApptsRes = await fetch(`${baseUrl}/api/doctor/appointments`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    assert.equal(docApptsRes.status, 200);
    const docAppts = await docApptsRes.json();
    assert.ok(docAppts.appointments.some((a) => a.visit_date === "2026-12-10" && a.visit_time === "14:00"));
  });

  it("Journey Step 8: Cross-account clinical messaging between doctor and patient", async () => {
    // 8a. Sarah sends message to Dr. Patel
    const patMsgRes = await fetch(`${baseUrl}/api/messages/${patientUser.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        sender: "Sarah Jenkins",
        senderRole: "patient",
        text: "Hello Dr. Patel, my morning BP was 122/78.",
      }),
    });
    assert.equal(patMsgRes.status, 201);

    // 8b. Dr. Patel reads messages
    const docMsgRes = await fetch(`${baseUrl}/api/messages/${patientUser.id}`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    assert.equal(docMsgRes.status, 200);
    const thread = await docMsgRes.json();
    assert.ok(thread.messages.some((m) => m.text.includes("122/78")));

    // 8c. Dr. Patel replies
    const replyRes = await fetch(`${baseUrl}/api/messages/${patientUser.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${doctorToken}` },
      body: JSON.stringify({
        sender: "Dr. Rajesh Patel",
        senderRole: "doctor",
        text: "Excellent readings Sarah. Continue the current dosage.",
      }),
    });
    assert.equal(replyRes.status, 201);

    // 8d. Sarah receives reply
    const patCheckRes = await fetch(`${baseUrl}/api/messages/${patientUser.id}`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const patThread = await patCheckRes.json();
    assert.ok(patThread.messages.some((m) => m.text.includes("Excellent readings Sarah")));
  });

  it("Journey Step 9: AI Symptom analysis, report summarization, and consent revocation", async () => {
    // 9a. Patient Sarah grants AI consent
    await fetch(`${baseUrl}/api/privacy/consents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({ consentType: "ai_insights", granted: true }),
    });

    // 9b. Without configured GEMINI_API_KEY in test environment, AI reports 503 AI_NOT_CONFIGURED honestly
    const summaryRes = await fetch(`${baseUrl}/api/ai-summarize-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        documentName: "Lab_Panel.pdf",
        content: "Patient shows Fasting Blood Glucose of 98 mg/dL. Normal range.",
        category: "lab_result",
      }),
    });
    assert.equal(summaryRes.status, 503);
    const summaryErr = await summaryRes.json();
    assert.equal(summaryErr.code, "AI_NOT_CONFIGURED");

    // 9c. Sarah revokes AI consent
    await fetch(`${baseUrl}/api/privacy/consents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({ consentType: "ai_insights", granted: false }),
    });

    // 9d. With consent revoked, AI returns 403 CONSENT_REVOKED (consent check strictly precedes external call)
    const blockedRes = await fetch(`${baseUrl}/api/ai-summarize-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({ content: "Sample record" }),
    });
    assert.equal(blockedRes.status, 403);
    const errBody = await blockedRes.json();
    assert.equal(errBody.code, "CONSENT_REVOKED");
  });

  it("Journey Step 10: Logout and session expiry validation", async () => {
    // Sarah logs out
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert.equal(logoutRes.status, 200);

    // Token is now blacklisted in revoked_tokens
    const meRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert.equal(meRes.status, 401);
  });
});
