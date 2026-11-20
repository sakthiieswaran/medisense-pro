/**
 * Online SQLite Backup Utility
 * ----------------------------
 * Safely creates an online, point-in-time snapshot of the active SQLite database
 * while the server is live and accepting queries, using node:sqlite native backup API.
 * 
 * Usage:
 *   node scripts/backup.js [output-dir]
 *   npm run backup -- [output-dir]
 */
import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, "..");

// Load server .env if present
dotenv.config({ path: path.join(serverDir, ".env") });

const sourceDbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(serverDir, "data", "medisense.sqlite");

const targetArg = process.argv[2];
const outDir = targetArg
  ? path.resolve(targetArg)
  : process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.join(serverDir, "backups");

if (!fs.existsSync(sourceDbPath)) {
  console.error(`[medisense-backup] Source database not found at ${sourceDbPath}`);
  process.exit(1);
}

try {
  fs.mkdirSync(outDir, { recursive: true });
} catch (err) {
  console.error(`[medisense-backup] Failed to create backup directory ${outDir}:`, err.message);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destPath = path.join(outDir, `medisense-backup-${stamp}.sqlite`);

console.log(`[medisense-backup] Starting online backup from: ${sourceDbPath}`);
console.log(`[medisense-backup] Target snapshot destination: ${destPath}`);

let db;
try {
  db = new DatabaseSync(sourceDbPath, { open: true, readOnly: true });
  await backup(db, destPath);
  const stat = fs.statSync(destPath);
  console.log(`[medisense-backup] Backup completed successfully (${stat.size} bytes): ${destPath}`);
} catch (err) {
  console.error("[medisense-backup] Backup failed:", err.message);
  if (fs.existsSync(destPath)) {
    try { fs.unlinkSync(destPath); } catch {}
  }
  process.exit(1);
} finally {
  if (db) {
    try { db.close(); } catch {}
  }
}
