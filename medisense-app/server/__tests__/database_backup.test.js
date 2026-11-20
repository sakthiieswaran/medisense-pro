import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { initDatabase, runTransaction } from "../db.js";

describe("Database Architecture, Integrity & Backup Verification", () => {
  let tmpDir;
  let liveDbPath;
  let backupDbPath;
  let restoreDbPath;
  let db;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "medisense-db-test-"));
    liveDbPath = path.join(tmpDir, "live_medisense.sqlite");
    backupDbPath = path.join(tmpDir, "backup_medisense.sqlite");
    restoreDbPath = path.join(tmpDir, "restored_medisense.sqlite");
    db = initDatabase(liveDbPath);
  });

  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it("1. Migrations inspection: executes all migrations and validates schema versioning", () => {
    const migrations = db.prepare("SELECT * FROM schema_migrations ORDER BY version ASC").all();
    assert.equal(migrations.length, 2, "Both Migration 1 and Migration 2 must be applied");
    assert.equal(migrations[0].version, 1);
    assert.equal(migrations[0].name, "initial_relational_schema");
    assert.equal(migrations[1].version, 2);
    assert.equal(migrations[1].name, "doctor_patient_relationships");

    // Verify key tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((t) => t.name);

    const requiredTables = [
      "users",
      "revoked_tokens",
      "patient_profiles",
      "doctor_profiles",
      "caregiver_relationships",
      "doctor_patient_relationships",
      "medications",
      "dose_history",
      "health_measurements",
      "medical_records",
      "documents",
      "appointments",
      "messages",
      "notifications",
      "push_subscriptions",
      "consent_records",
      "audit_logs",
      "user_kv_store",
    ];

    for (const reqTable of requiredTables) {
      assert.ok(tables.includes(reqTable), `Table '${reqTable}' must exist in schema`);
    }
  });

  it("2. Foreign key enforcement and cascade integrity", () => {
    // 2a. Attempting to insert a child record with non-existent user_id must fail
    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO patient_profiles (user_id, patient_id, name, updated_at)
          VALUES ('non-existent-user-id', 'p-invalid', 'Ghost', datetime('now'))
        `).run();
      },
      (err) => {
        return /FOREIGN KEY constraint failed/i.test(err.message);
      },
      "Foreign key constraint must reject orphaned records"
    );

    // 2b. Inserting valid parent and child
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES ('u-parent-test', 'Parent User', 'parent@db.test', 'hash123', 'patient', 1, ?, ?)
    `).run(now, now);

    db.prepare(`
      INSERT INTO patient_profiles (user_id, patient_id, name, updated_at)
      VALUES ('u-parent-test', 'p-test', 'Parent User', ?)
    `).run(now);

    db.prepare(`
      INSERT INTO medications (id, user_id, med_id, name, dosage, frequency, updated_at)
      VALUES ('m-test-1', 'u-parent-test', 'med-1', 'Metformin', '500mg', 'Daily', ?)
    `).run(now);

    // Verify insertion
    const medBefore = db.prepare("SELECT * FROM medications WHERE user_id = 'u-parent-test'").all();
    assert.equal(medBefore.length, 1);

    // 2c. Deleting parent user cascades to child tables
    db.prepare("DELETE FROM users WHERE id = 'u-parent-test'").run();

    const profileAfter = db.prepare("SELECT * FROM patient_profiles WHERE user_id = 'u-parent-test'").all();
    assert.equal(profileAfter.length, 0, "Patient profile must be cascaded on user delete");

    const medAfter = db.prepare("SELECT * FROM medications WHERE user_id = 'u-parent-test'").all();
    assert.equal(medAfter.length, 0, "Medications must be cascaded on user delete");
  });

  it("3. Transaction handling and automatic rollback on failure", () => {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES ('u-tx-test', 'TX User', 'tx@db.test', 'hash123', 'patient', 1, ?, ?)
    `).run(now, now);

    // Execute transaction that fails halfway through
    assert.throws(
      () => {
        runTransaction(db, () => {
          db.prepare(`
            INSERT INTO medications (id, user_id, med_id, name, dosage, frequency, updated_at)
            VALUES ('m-tx-1', 'u-tx-test', 'med-tx', 'Atorvastatin', '20mg', 'Nightly', ?)
          `).run(now);

          // Force failure
          throw new Error("Simulated transaction fault");
        });
      },
      /Simulated transaction fault/
    );

    // Verify medication was rolled back
    const medRow = db.prepare("SELECT * FROM medications WHERE id = 'm-tx-1'").get();
    assert.equal(medRow, undefined, "Rolled-back transaction must leave no traces");
  });

  it("4. Concurrent write simulation with busy timeout", () => {
    // Open second connection to the same SQLite WAL database
    const db2 = new DatabaseSync(liveDbPath, { open: true });
    db2.exec("PRAGMA busy_timeout = 5000;");

    const now = new Date().toISOString();
    // Connection 1 writes a user
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES ('u-concurrent-1', 'User 1', 'user1@concurrent.test', 'h', 'patient', 1, ?, ?)
    `).run(now, now);

    // Connection 2 immediately writes another user
    db2.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES ('u-concurrent-2', 'User 2', 'user2@concurrent.test', 'h', 'patient', 1, ?, ?)
    `).run(now, now);

    // Connection 1 reads connection 2's write
    const u2 = db.prepare("SELECT * FROM users WHERE id = 'u-concurrent-2'").get();
    assert.ok(u2, "Connection 1 must immediately see committed writes from Connection 2 in WAL mode");

    db2.close();
  });

  it("5. Database persistence across simulated backend restart", () => {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES ('u-restart-test', 'Persistent Patient', 'persist@db.test', 'hash', 'patient', 1, ?, ?)
    `).run(now, now);

    db.prepare(`
      INSERT INTO dose_history (id, user_id, med_id, med_name, dose_date, scheduled_time, status, updated_at)
      VALUES ('dose-persist-1', 'u-restart-test', 'med-1', 'Aspirin', '2026-11-15', '08:00', 'Taken', ?)
    `).run(now);

    // Simulate backend shutdown: close database connection
    db.close();

    // Simulate backend startup: reopen using initDatabase
    db = initDatabase(liveDbPath);

    // Verify records survived restart intact
    const userRow = db.prepare("SELECT * FROM users WHERE id = 'u-restart-test'").get();
    assert.ok(userRow, "User record must persist across database restarts");
    assert.equal(userRow.email, "persist@db.test");

    const doseRow = db.prepare("SELECT * FROM dose_history WHERE id = 'dose-persist-1'").get();
    assert.ok(doseRow, "Dose history must persist across database restarts");
    assert.equal(doseRow.status, "Taken");
  });

  it("6. SQLite online backup creation and integrity verification", async () => {
    // Live database is open and active
    // Execute online backup using node:sqlite backup API
    await backup(db, backupDbPath);

    assert.ok(fs.existsSync(backupDbPath), "Backup file must be written to disk");
    const stat = fs.statSync(backupDbPath);
    assert.ok(stat.size > 0, "Backup file size must be non-zero");

    // Open backup file in read-only mode to verify contents
    const backupDb = new DatabaseSync(backupDbPath, { open: true, readOnly: true });
    const userInBackup = backupDb.prepare("SELECT * FROM users WHERE id = 'u-restart-test'").get();
    assert.ok(userInBackup, "Backup database must contain all committed user records");
    assert.equal(userInBackup.name, "Persistent Patient");

    const doseInBackup = backupDb.prepare("SELECT * FROM dose_history WHERE id = 'dose-persist-1'").get();
    assert.ok(doseInBackup, "Backup database must contain dose history");
    backupDb.close();
  });

  it("7. Test restoration into isolated database and confirm source database isolation", () => {
    // Copy the backup to restore destination
    fs.copyFileSync(backupDbPath, restoreDbPath);

    // Open restored database
    const restoredDb = initDatabase(restoreDbPath);

    // Verify restored database contains data
    const restoredUser = restoredDb.prepare("SELECT * FROM users WHERE id = 'u-restart-test'").get();
    assert.ok(restoredUser, "Restored database must contain original records");

    // Mutate the restored database: insert a restored-only record and delete the original
    const now = new Date().toISOString();
    restoredDb.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, email_verified, created_at, updated_at)
      VALUES ('u-restored-only', 'Restored Only', 'restored@test.local', 'h', 'patient', 1, ?, ?)
    `).run(now, now);
    restoredDb.prepare("DELETE FROM users WHERE id = 'u-restart-test'").run();

    // Verify modification took effect in restored database
    assert.equal(restoredDb.prepare("SELECT * FROM users WHERE id = 'u-restart-test'").get(), undefined);
    assert.ok(restoredDb.prepare("SELECT * FROM users WHERE id = 'u-restored-only'").get());

    // CRITICAL ISOLATION CHECK: Live database MUST NOT have been modified
    const liveUser = db.prepare("SELECT * FROM users WHERE id = 'u-restart-test'").get();
    assert.ok(liveUser, "Live production database must still have original user");
    assert.equal(liveUser.name, "Persistent Patient");

    const restoredOnlyInLive = db.prepare("SELECT * FROM users WHERE id = 'u-restored-only'").get();
    assert.equal(restoredOnlyInLive, undefined, "Restored modifications must NOT leak into live database");

    restoredDb.close();
  });
});
