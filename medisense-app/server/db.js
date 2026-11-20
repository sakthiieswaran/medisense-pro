/**
 * MediSense SQLite Database Layer (using Node's built-in node:sqlite)
 * -------------------------------------------------------------------
 * Provides ACID transactions, foreign key enforcement, indexed queries,
 * versioned schema migrations, automatic legacy JSON migration (users.json +
 * store.json), relational domain projection, consent & audit logging, and
 * native SQLite online backup support.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.join(__dirname, "data");

export function toPlain(row) {
  if (!row) return null;
  return { ...row };
}

export function runTransaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const res = fn();
    db.exec("COMMIT");
    return res;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw err;
  }
}

const MIGRATIONS = [
  {
    version: 1,
    name: "initial_relational_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'doctor', 'caregiver')),
        email_verified INTEGER NOT NULL DEFAULT 0,
        verification_token_hash TEXT,
        reset_token_hash TEXT,
        reset_token_expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS revoked_tokens (
        jti TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_revoked_user ON revoked_tokens(user_id);

      CREATE TABLE IF NOT EXISTS patient_profiles (
        user_id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        name TEXT NOT NULL,
        dob TEXT,
        sex TEXT,
        phone TEXT,
        emergency_contact TEXT,
        conditions TEXT,
        allergies TEXT,
        height_cm REAL,
        goals_json TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS doctor_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE,
        name TEXT NOT NULL,
        specialty TEXT,
        email TEXT,
        phone TEXT,
        clinic TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS caregiver_relationships (
        id TEXT PRIMARY KEY,
        patient_user_id TEXT NOT NULL,
        caregiver_email TEXT NOT NULL,
        caregiver_user_id TEXT,
        caregiver_name TEXT,
        relationship_role TEXT NOT NULL DEFAULT 'Caregiver',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
        permissions_json TEXT NOT NULL,
        invite_token_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (caregiver_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_caregiver_patient ON caregiver_relationships(patient_user_id);
      CREATE INDEX IF NOT EXISTS idx_caregiver_user ON caregiver_relationships(caregiver_user_id);
      CREATE INDEX IF NOT EXISTS idx_caregiver_email ON caregiver_relationships(caregiver_email);

      CREATE TABLE IF NOT EXISTS medications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        med_id TEXT NOT NULL,
        name TEXT NOT NULL,
        generic_name TEXT,
        dosage TEXT,
        unit TEXT,
        frequency TEXT,
        times_per_day INTEGER,
        times_json TEXT,
        start_date TEXT,
        end_date TEXT,
        with_food INTEGER NOT NULL DEFAULT 1,
        instructions TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'doctor',
        current_stock INTEGER,
        refill_threshold INTEGER,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_medications_user ON medications(user_id);

      CREATE TABLE IF NOT EXISTS medication_schedules (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        med_id TEXT NOT NULL,
        scheduled_time TEXT NOT NULL,
        recurrence TEXT NOT NULL DEFAULT 'daily',
        days_of_week TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_schedules_user ON medication_schedules(user_id);

      CREATE TABLE IF NOT EXISTS dose_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        med_id TEXT NOT NULL,
        med_name TEXT NOT NULL,
        dosage TEXT,
        dose_date TEXT NOT NULL,
        scheduled_time TEXT NOT NULL,
        actual_time TEXT,
        status TEXT NOT NULL CHECK (status IN ('Taken', 'Late', 'Missed', 'Skipped', 'Upcoming')),
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_dose_user_date ON dose_history(user_id, dose_date);

      CREATE TABLE IF NOT EXISTS health_measurements (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        record_date TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        value_num REAL,
        secondary_num REAL,
        payload_json TEXT,
        source TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_health_user_date ON health_measurements(user_id, record_date);

      CREATE TABLE IF NOT EXISTS medical_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        record_type TEXT NOT NULL,
        title TEXT NOT NULL,
        details_json TEXT NOT NULL,
        record_date TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_records_user ON medical_records(user_id, record_type);

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        category TEXT NOT NULL,
        storage_provider TEXT NOT NULL DEFAULT 'local',
        storage_path TEXT NOT NULL,
        sha256 TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);

      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        doctor_id TEXT,
        doctor_name TEXT,
        visit_date TEXT NOT NULL,
        visit_time TEXT NOT NULL,
        visit_type TEXT,
        location TEXT,
        status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
        consultation_notes TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id, visit_date);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        thread_patient_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        body TEXT NOT NULL,
        sent_date TEXT NOT NULL,
        sent_time TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        notif_type TEXT,
        category TEXT,
        severity TEXT,
        message TEXT NOT NULL,
        notif_date TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

      CREATE TABLE IF NOT EXISTS consent_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        consent_type TEXT NOT NULL,
        policy_version TEXT NOT NULL DEFAULT '1.0',
        granted INTEGER NOT NULL,
        ip_address TEXT,
        granted_at TEXT NOT NULL,
        revoked_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_records(user_id);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        ip_address TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at);

      CREATE TABLE IF NOT EXISTS user_kv_store (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `,
  },
  {
    version: 2,
    name: "doctor_patient_relationships",
    sql: `
      CREATE TABLE IF NOT EXISTS doctor_patient_relationships (
        id TEXT PRIMARY KEY,
        doctor_user_id TEXT NOT NULL,
        patient_user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
        permissions_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_doc_rel_doctor ON doctor_patient_relationships(doctor_user_id);
      CREATE INDEX IF NOT EXISTS idx_doc_rel_patient ON doctor_patient_relationships(patient_user_id);
    `,
  },
];

function applyMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version)
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    runTransaction(db, () => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        m.version,
        m.name,
        new Date().toISOString()
      );
    });
  }
}

function migrateLegacyJsonIfNeeded(db, dataDir) {
  const usersFile = path.join(dataDir, "users.json");
  const storeFile = path.join(dataDir, "store.json");
  if (!fs.existsSync(usersFile) && !fs.existsSync(storeFile)) return;

  let usersObj = {};
  let storeObj = {};
  try {
    if (fs.existsSync(usersFile)) usersObj = JSON.parse(fs.readFileSync(usersFile, "utf8") || "{}");
  } catch {
    usersObj = {};
  }
  try {
    if (fs.existsSync(storeFile)) storeObj = JSON.parse(fs.readFileSync(storeFile, "utf8") || "{}");
  } catch {
    storeObj = {};
  }

  const userEntries = Object.values(usersObj);
  if (!userEntries.length) return;

  runTransaction(db, () => {
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertKv = db.prepare(`
      INSERT OR IGNORE INTO user_kv_store (user_id, key, value, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const u of userEntries) {
      if (!u || !u.id || !u.email || !u.passwordHash) continue;
      insertUser.run(
        String(u.id),
        String(u.name || "MediSense User"),
        String(u.email).trim().toLowerCase(),
        String(u.passwordHash),
        ["patient", "doctor", "caregiver"].includes(u.role) ? u.role : "patient",
        1,
        u.createdAt || now,
        now
      );
      const userStore = storeObj[u.id] || {};
      for (const [k, v] of Object.entries(userStore)) {
        if (typeof v === "string") {
          insertKv.run(String(u.id), String(k), v, now);
        }
      }
    }
  });
}

/**
 * Syncs the JSON state blob (`medisense_state_v2`) into normalized relational
 * tables inside an ACID transaction so SQL queries, caregiver permission checks,
 * audit reporting, and analytics work natively against SQLite tables.
 */
export function syncStateToRelationalTables(db, userId, stateJson) {
  let state;
  try {
    state = typeof stateJson === "string" ? JSON.parse(stateJson) : stateJson;
  } catch {
    return;
  }
  if (!state || typeof state !== "object") return;
  const now = new Date().toISOString();
  const patients = Array.isArray(state.patients) ? state.patients : [];
  const primaryPatient = patients[0];
  if (!primaryPatient) return;

  runTransaction(db, () => {
    db.prepare(`
      INSERT INTO patient_profiles (user_id, patient_id, name, dob, sex, phone, emergency_contact, conditions, allergies, height_cm, goals_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        patient_id=excluded.patient_id, name=excluded.name, dob=excluded.dob, sex=excluded.sex,
        phone=excluded.phone, emergency_contact=excluded.emergency_contact, conditions=excluded.conditions,
        allergies=excluded.allergies, height_cm=excluded.height_cm, goals_json=excluded.goals_json,
        updated_at=excluded.updated_at
    `).run(
      userId,
      String(primaryPatient.id || "p1"),
      String(primaryPatient.name || "Patient"),
      primaryPatient.dob || null,
      primaryPatient.sex || null,
      primaryPatient.phone || null,
      primaryPatient.emergencyContact || null,
      primaryPatient.conditions || null,
      primaryPatient.allergies || null,
      primaryPatient.body?.heightCm != null ? Number(primaryPatient.body.heightCm) : null,
      JSON.stringify(primaryPatient.goals || {}),
      now
    );

    if (state.doctor?.id) {
      db.prepare(`
        INSERT INTO doctor_profiles (id, user_id, name, specialty, email, phone, clinic, created_at)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, specialty=excluded.specialty, email=excluded.email, phone=excluded.phone
      `).run(
        String(state.doctor.id),
        String(state.doctor.name || "Doctor"),
        state.doctor.specialty || null,
        state.doctor.email || null,
        state.doctor.phone || null,
        state.doctor.clinic || null,
        now
      );
    }

    db.prepare("DELETE FROM medications WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM medication_schedules WHERE user_id = ?").run(userId);
    const insMed = db.prepare(`
      INSERT INTO medications (id, user_id, med_id, name, generic_name, dosage, unit, frequency, times_per_day, times_json, start_date, end_date, with_food, instructions, notes, active, source, current_stock, refill_threshold, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insSched = db.prepare(`
      INSERT INTO medication_schedules (id, user_id, med_id, scheduled_time, recurrence, days_of_week, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of primaryPatient.medications || []) {
      const medId = String(m.id || crypto.randomUUID());
      insMed.run(
        `${userId}:${medId}`,
        userId,
        medId,
        String(m.name || "Medication"),
        m.genericName || null,
        m.dosage != null ? String(m.dosage) : null,
        m.unit || null,
        m.frequency || null,
        m.timesPerDay != null ? Number(m.timesPerDay) : (m.times?.length || 1),
        JSON.stringify(m.times || []),
        m.startDate || null,
        m.endDate || null,
        m.withFood ? 1 : 0,
        m.instructions || null,
        m.notes || null,
        m.active !== false ? 1 : 0,
        m.source || "doctor",
        m.currentStock != null && m.currentStock !== "" ? Number(m.currentStock) : null,
        m.refillThreshold != null && m.refillThreshold !== "" ? Number(m.refillThreshold) : null,
        now
      );
      for (const time of m.times || []) {
        insSched.run(
          crypto.randomUUID(),
          userId,
          medId,
          String(time),
          m.recurrence || "daily",
          m.daysOfWeek ? JSON.stringify(m.daysOfWeek) : null,
          m.active !== false ? 1 : 0
        );
      }
    }

    const insDose = db.prepare(`
      INSERT INTO dose_history (id, user_id, med_id, med_name, dosage, dose_date, scheduled_time, actual_time, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        med_id=excluded.med_id, med_name=excluded.med_name, dosage=excluded.dosage,
        dose_date=excluded.dose_date, scheduled_time=excluded.scheduled_time,
        actual_time=excluded.actual_time, status=excluded.status, updated_at=excluded.updated_at
    `);
    for (const l of (primaryPatient.logs || []).slice(-500)) {
      const status = ["Taken", "Late", "Missed", "Skipped", "Upcoming"].includes(l.status) ? l.status : "Upcoming";
      insDose.run(
        `${userId}:${l.id || crypto.randomUUID()}`,
        userId,
        String(l.medId || ""),
        String(l.medName || ""),
        l.dosage || null,
        String(l.date || ""),
        String(l.scheduledTime || "08:00"),
        l.actualTime || null,
        status,
        now
      );
    }

    const insHealth = db.prepare(`
      INSERT INTO health_measurements (id, user_id, record_date, metric_type, value_num, secondary_num, payload_json, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        value_num=excluded.value_num, secondary_num=excluded.secondary_num,
        payload_json=excluded.payload_json, source=excluded.source
    `);
    for (const r of (primaryPatient.healthRecords || []).slice(-450)) {
      const rowId = r.id || crypto.randomUUID();
      if (r.heartRate != null) insHealth.run(`${userId}:${rowId}:hr`, userId, r.date, "heartRate", Number(r.heartRate), null, null, r.source || "manual", now);
      if (r.systolic != null) insHealth.run(`${userId}:${rowId}:bp`, userId, r.date, "bloodPressure", Number(r.systolic), r.diastolic != null ? Number(r.diastolic) : null, null, r.source || "manual", now);
      if (r.glucose != null) insHealth.run(`${userId}:${rowId}:glu`, userId, r.date, "glucose", Number(r.glucose), null, null, r.source || "manual", now);
      if (r.weight != null) insHealth.run(`${userId}:${rowId}:wt`, userId, r.date, "weight", Number(r.weight), null, null, r.source || "manual", now);
      if (r.temperature != null) insHealth.run(`${userId}:${rowId}:tmp`, userId, r.date, "temperature", Number(r.temperature), null, null, r.source || "manual", now);
      if (r.bloodOxygen != null) insHealth.run(`${userId}:${rowId}:spo2`, userId, r.date, "bloodOxygen", Number(r.bloodOxygen), null, null, r.source || "manual", now);
    }

    db.prepare("DELETE FROM medical_records WHERE user_id = ?").run(userId);
    const insRec = db.prepare(`
      INSERT INTO medical_records (id, user_id, record_type, title, details_json, record_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const rec = primaryPatient.records || {};
    for (const c of rec.conditions || []) insRec.run(`${userId}:cond:${c.id || crypto.randomUUID()}`, userId, "condition", String(c.name || "Condition"), JSON.stringify(c), c.dateAdded || null, now);
    for (const a of rec.allergies || []) insRec.run(`${userId}:alg:${a.id || crypto.randomUUID()}`, userId, "allergy", String(a.allergen || "Allergy"), JSON.stringify(a), null, now);
    for (const l of rec.labResults || []) insRec.run(`${userId}:lab:${l.id || crypto.randomUUID()}`, userId, "lab", String(l.test || "Lab"), JSON.stringify(l), l.date || null, now);
    for (const v of rec.immunizations || []) insRec.run(`${userId}:imm:${v.id || crypto.randomUUID()}`, userId, "immunization", String(v.vaccine || "Vaccine"), JSON.stringify(v), v.date || null, now);
    for (const pr of rec.procedures || []) insRec.run(`${userId}:proc:${pr.id || crypto.randomUUID()}`, userId, "procedure", String(pr.name || "Procedure"), JSON.stringify(pr), pr.date || null, now);
    for (const h of rec.hospitalizations || []) insRec.run(`${userId}:hosp:${h.id || crypto.randomUUID()}`, userId, "hospitalization", String(h.reason || h.facility || "Hospitalization"), JSON.stringify(h), h.admitDate || null, now);

    const insAppt = db.prepare(`
      INSERT INTO appointments (id, user_id, doctor_id, doctor_name, visit_date, visit_time, visit_type, location, status, consultation_notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        doctor_id=excluded.doctor_id, doctor_name=excluded.doctor_name,
        visit_date=excluded.visit_date, visit_time=excluded.visit_time,
        visit_type=excluded.visit_type, location=excluded.location,
        status=excluded.status, consultation_notes=excluded.consultation_notes,
        updated_at=excluded.updated_at
    `);
    if (primaryPatient.nextVisit) {
      const nv = primaryPatient.nextVisit;
      insAppt.run(
        `${userId}:next`,
        userId,
        nv.doctorId || state.doctor?.id || null,
        state.doctor?.name || null,
        String(nv.date || ""),
        String(nv.time || ""),
        nv.type || "Follow-up",
        nv.location || null,
        ["pending", "confirmed", "completed", "cancelled"].includes(nv.status) ? nv.status : "confirmed",
        nv.notes || null,
        now
      );
    }
    for (const ap of primaryPatient.appointmentHistory || []) {
      insAppt.run(
        `${userId}:${ap.id || crypto.randomUUID()}`,
        userId,
        ap.doctorId || null,
        ap.doctorName || state.doctor?.name || null,
        String(ap.date || ""),
        String(ap.time || ""),
        ap.type || "Visit",
        ap.location || null,
        ["pending", "confirmed", "completed", "cancelled"].includes(ap.status) ? ap.status : "completed",
        ap.notes || null,
        now
      );
    }

    const insMsg = db.prepare(`
      INSERT INTO messages (id, user_id, thread_patient_id, sender, body, sent_date, sent_time, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        is_read=excluded.is_read
    `);
    for (const msg of (primaryPatient.messages || []).slice(-200)) {
      insMsg.run(
        `${userId}:${msg.id || crypto.randomUUID()}`,
        userId,
        String(primaryPatient.id || "p1"),
        String(msg.sender || "patient"),
        String(msg.text || ""),
        String(msg.date || ""),
        String(msg.time || ""),
        msg.read ? 1 : 0
      );
    }

    const insNotif = db.prepare(`
      INSERT INTO notifications (id, user_id, notif_type, category, severity, message, notif_date, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        is_read=excluded.is_read
    `);
    for (const n of (primaryPatient.notifications || []).slice(-100)) {
      insNotif.run(
        `${userId}:${n.id || crypto.randomUUID()}`,
        userId,
        n.type || "general",
        n.category || "medication",
        n.severity || "info",
        String(n.message || ""),
        String(n.date || ""),
        n.read ? 1 : 0
      );
    }

    // Synchronize health shares granting doctor access
    const docShares = primaryPatient.healthShares || [];
    for (const s of docShares) {
      if (s.granteeType === "doctor" && s.doctorId) {
        const docProf = toPlain(
          db.prepare("SELECT user_id FROM doctor_profiles WHERE id = ? OR user_id = ?").get(s.doctorId, s.doctorId)
        );
        const docUserId = docProf?.user_id || db.prepare("SELECT id FROM users WHERE id = ? AND role = 'doctor'").get(s.doctorId)?.id;
        if (docUserId) {
          const relId = `doc-rel-${docUserId}-${userId}`;
          db.prepare(`
            INSERT INTO doctor_patient_relationships (id, doctor_user_id, patient_user_id, status, permissions_json, created_at, updated_at)
            VALUES (?, ?, ?, 'active', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              permissions_json=excluded.permissions_json, status='active', updated_at=excluded.updated_at
          `).run(
            relId,
            docUserId,
            userId,
            JSON.stringify(s.categories || { medications: true, vitals: true, records: true }),
            now,
            now
          );
        }
      }
    }
  });
}

export function logAudit(db, { userId = null, action, resourceType, resourceId = null, ip = null, metadata = null }) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip_address, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      userId,
      action,
      resourceType,
      resourceId,
      ip,
      metadata ? JSON.stringify(metadata) : null,
      new Date().toISOString()
    );
  } catch (err) {
    console.error("[medisense-audit] failed to write audit log:", err.message);
  }
}

export function initDatabase(dbPath) {
  const targetPath = dbPath || path.join(DEFAULT_DATA_DIR, "medisense.sqlite");
  if (targetPath !== ":memory:") {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }
  const db = new DatabaseSync(targetPath);
  if (targetPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
  }
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");

  applyMigrations(db);
  if (targetPath !== ":memory:") {
    migrateLegacyJsonIfNeeded(db, path.dirname(targetPath));
  }
  return db;
}
