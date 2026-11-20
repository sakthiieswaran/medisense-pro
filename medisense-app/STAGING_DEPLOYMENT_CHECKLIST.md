# MEDISENSE — STAGING DEPLOYMENT CHECKLIST

**Target Environment:** Staging  
**Frontend Platform:** Vercel (SPA)  
**Backend Platform:** Node.js (Render / Railway / Fly.io / Self-hosted VM)  
**Database:** Persistent SQLite (WAL mode) with automated backup schedule  
**Medical Document Storage:** Private Supabase Storage (or encrypted persistent disk)  
**Security Baseline:** Production-grade security, DPDP Act 2023 compliance, synthetic test accounts only

---

## 1. PRE-DEPLOYMENT PREREQUISITES

- [ ] **1.1 Branch & Code Readiness**
  - [ ] Branch `production-readiness-audit` merged into `main` after verification.
  - [ ] All 45 backend tests and 50 frontend tests passing (`npm test`).
  - [ ] Production build succeeds cleanly (`npm run build`).
  - [ ] Zero uncommitted debug logs or temporary files in working tree.

- [ ] **1.2 Cryptographic Secrets Generation**
  - [ ] Generate 64-character high-entropy JWT secret:
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```
  - [ ] Generate Web Push VAPID keypair:
    ```bash
    npx web-push generate-vapid-keys
    ```
  - [ ] Choose a secure Doctor Registration Invite Code (e.g., `STAGING-CLINIC-2026`).

- [ ] **1.3 External Service Accounts (Optional / Staging Mode)**
  - [ ] Google AI Studio API key for Gemini (`GEMINI_API_KEY`).
  - [ ] Supabase project credentials with private bucket `medisense-documents`.
  - [ ] Staging SMTP credentials (e.g., Mailgun, SendGrid, or Mailtrap).

---

## 2. BACKEND DEPLOYMENT CHECKLIST (Node.js)

- [ ] **2.1 Host Environment & Architecture Assumptions**
  - [ ] **Single Backend Instance:** Backend runs as a single instance (vertical scaling). No multi-instance clustering over shared SQLite.
  - [ ] **Node.js LTS:** Node.js version **22.x or 24.x LTS** (`node:sqlite` built-in).
  - [ ] **Persistent Volume:** Persistent disk volume mounted at `/app/medisense-app/server/data` (minimum 5GB).
  - [ ] **WAL-Compatible Filesystem:** Underlying volume filesystem supports POSIX locks and `mmap` (no raw NFS/SMB).
  - [ ] **Backup Volume:** Persistent disk volume mounted at `/app/medisense-app/server/backups` (minimum 10GB).
  - [ ] Start command configured: `npm run start` (or `node index.js`).

- [ ] **2.2 Environment Variables (Backend)**
  Configure the following variables in your staging backend dashboard:
  ```env
  NODE_ENV=production
  PORT=4000
  CORS_ORIGIN=https://staging.medisense.health
  JWT_SECRET=<64-char-hex-generated-secret>
  JWT_EXPIRY=24h
  ENABLE_DEMO_ACCOUNTS=false
  ENABLE_OPENFDA_LOOKUP=true
  DOCTOR_INVITE_CODE=STAGING-CLINIC-2026

  # Web Push Notifications
  VAPID_PUBLIC_KEY=<generated-vapid-public-key>
  VAPID_PRIVATE_KEY=<generated-vapid-private-key>
  VAPID_SUBJECT=mailto:admin@medisense.health

  # Gemini AI Integration (Optional in staging; fallback returns 503 AI_NOT_CONFIGURED)
  GEMINI_API_KEY=<gemini-api-key>
  GEMINI_MODEL=gemini-2.5-flash

  # Supabase Private Document Storage (Optional in staging; fallback stores locally)
  SUPABASE_URL=https://<project-ref>.supabase.co
  SUPABASE_SERVICE_KEY=<service-role-secret-key>
  SUPABASE_BUCKET=medisense-documents

  # Safe Staging Email Delivery (Mailtrap, Mailgun, or SendGrid sandbox)
  # When unconfigured, tokens are NEVER logged to stdout or application logs.
  SMTP_HOST=smtp.mailtrap.io
  SMTP_PORT=587
  SMTP_USER=<mailtrap-user>
  SMTP_PASSWORD=<mailtrap-password>
  SMTP_FROM="MediSense Staging <noreply@medisense.health>"
  ```

- [ ] **2.3 Database Initialization & Migrations**
  - [ ] Verify database initialization on boot: check that `medisense.sqlite` is created in persistent volume.
  - [ ] Verify migrations table: `SELECT * FROM schema_migrations` must show version 1 (`initial_relational_schema`) and version 2 (`doctor_patient_relationships`).
  - [ ] Verify WAL mode enabled (`PRAGMA journal_mode;` returns `wal`).
  - [ ] Verify busy timeout active (`PRAGMA busy_timeout;` returns `5000`).

---

## 3. FRONTEND DEPLOYMENT CHECKLIST (Vercel)

- [ ] **3.1 Vercel Project Configuration**
  - [ ] Root Directory set to: `medisense-app`
  - [ ] Framework Preset: `Vite`
  - [ ] Build Command: `npm run build`
  - [ ] Output Directory: `dist`
  - [ ] Install Command: `npm install`

- [ ] **3.2 Vercel SPA Routing Configuration**
  - [ ] Ensure `vercel.json` exists in `medisense-app/` with rewrite rules:
    ```json
    {
      "rewrites": [
        {
          "source": "/(.*)",
          "destination": "/index.html"
        }
      ]
    }
    ```

- [ ] **3.3 Frontend Environment Variables**
  Configure in Vercel project settings:
  ```env
  # Standard frontend API URL (primary)
  VITE_API_URL=https://api-staging.medisense.health

  # (Note: VITE_API_BASE_URL is also accepted as a backwards-compatible alias)

  # Optional: Data Protection Grievance Officer contact (overrides staging placeholder)
  VITE_DPO_EMAIL=grievance-compliance@medisense.health
  ```

- [ ] **3.4 PWA & Service Worker**
  - [ ] Verify `dist/sw.js` is served with `Service-Worker-Allowed: /`.
  - [ ] Verify web app manifest loads cleanly at `/manifest.json`.

---

## 4. PERSISTENT STORAGE, BACKUPS & DATA PROTECTION

- [ ] **4.1 SQLite Database Persistence**
  - [ ] Confirm database path is on a persistent mount: restarts must NOT reset database.
  - [ ] Test restart: restart the container/service, query user count, confirm zero data loss.

- [ ] **4.2 Private Medical Document Storage**
  - [ ] If using Supabase Storage:
    - [ ] Create bucket `medisense-documents`.
    - [ ] Set bucket privacy to **Private** (Public read: OFF).
    - [ ] Configure RLS policy: only backend service-role key can access objects.
  - [ ] If using local storage:
    - [ ] Ensure `server/uploads/` is on a persistent volume with permissions `0700`.

- [ ] **4.3 Automated Online Backup Schedule & Off-Site Replication**
  - [ ] Add cron job for daily SQLite online backup (using `--` argument separator for npm):
    ```bash
    0 2 * * * cd /app/medisense-app/server && npm run backup -- /app/medisense-app/server/backups >> /var/log/medisense-backup.log 2>&1
    # Alternatively: node scripts/backup.js /app/medisense-app/server/backups
    ```
  - [ ] Schedule off-site replication to cloud storage (e.g. AWS S3, Google Cloud Storage, or Cloudflare R2):
    ```bash
    15 2 * * * aws s3 sync /app/medisense-app/server/backups s3://medisense-staging-backups/sqlite/ --delete
    ```
  - [ ] Verify backup script executes cleanly without interrupting live requests.
  - [ ] Test restoration: verify backup database opens in separate environment without modifying live data.

---

## 5. HTTPS, NETWORKING & SECURITY HEADERS

- [ ] **5.1 TLS & Domain Verification**
  - [ ] Custom domain configured: `https://staging.medisense.health` (frontend) and `https://api-staging.medisense.health` (backend).
  - [ ] Automated TLS certificate active (Let's Encrypt / Vercel SSL / Cloudflare).
  - [ ] HTTP-to-HTTPS redirect enforced.

- [ ] **5.2 Security Headers (Helmet Verified)**
  - [ ] `Strict-Transport-Security: max-age=15552000; includeSubDomains`
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] `X-Frame-Options: SAMEORIGIN`
  - [ ] `Referrer-Policy: strict-origin-when-cross-origin`

- [ ] **5.3 CORS Enforcement**
  - [ ] Verify `Origin: https://staging.medisense.health` receives `Access-Control-Allow-Origin: https://staging.medisense.health`.
  - [ ] Verify unauthorized origins (e.g. `https://attacker.com`) do NOT receive CORS headers.

---

## 6. HEALTH CHECKS, LOGGING & MONITORING

- [ ] **6.1 Uptime & Health Check Monitoring**
  - [ ] Configure monitoring ping to `GET https://api-staging.medisense.health/api/health` every 60 seconds.
  - [ ] Expected response:
    ```json
    {
      "ok": true,
      "storage": "sqlite",
      "aiConfigured": true
    }
    ```

- [ ] **6.2 Logging & Credential Protection**
  - [ ] Verify log aggregation (Datadog, Better Stack, Papertrail, or cloud log stream).
  - [ ] Confirm that `password_hash`, reset tokens, verification tokens, and `JWT_SECRET` are NEVER emitted in stdout/stderr logs.
  - [ ] Set up alerts on repeated 5xx errors or persistent database busy timeouts.

---

## 7. POST-DEPLOYMENT SMOKE TESTING (Synthetic Data Only)

Perform the following smoke tests immediately after staging deployment:

1. **Patient Registration & Login:**
   - Register new test patient `staging.test.patient@example.com`.
   - Log in and verify session token issuance.
2. **Medication & Adherence:**
   - Add a test medication (e.g. `Metformin 500mg`).
   - Log a dose as "Taken".
   - Reload page and confirm persistence.
3. **Doctor Verification:**
   - Attempt doctor registration with an invalid invite code (must be rejected with HTTP 403).
   - Register doctor with `STAGING-CLINIC-2026` (must succeed).
   - Share patient records with doctor; verify patient appears in doctor portal.
   - Doctor prescribes medication; verify medication appears in patient schedule.
4. **Caregiver & DPDP Consent:**
   - Invite a caregiver; verify caregiver sees medications.
   - Revoke caregiver consent in Privacy Center; verify caregiver view immediately shows `consent_revoked`.
5. **Document Upload:**
   - Upload a test PDF document; download and verify binary integrity.
6. **DPDP Compliance & Contact Display:**
   - Inspect Privacy Center: confirm DPDP statutory rights and Grievance Officer details display correctly.
7. **Logout:**
   - Log out; verify old token is rejected upon next API call.

---

## 8. STAGING SIGN-OFF

| Role | Name / Identifier | Sign-Off Date | Status |
|---|---|---|---|
| **Full-Stack Architect** | Lead Architect | 2026-11-15 | **APPROVED** |
| **Security Engineer** | AppSec Lead | 2026-11-15 | **APPROVED** |
| **QA Lead** | QA Automation Lead | 2026-11-15 | **APPROVED** |
| **DevOps / SRE** | DevOps Engineer | Pending Staging Setup | **READY TO PROVISION** |
