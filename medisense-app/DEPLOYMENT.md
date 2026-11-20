# MediSense — Environment & Production Deployment Guide

This guide covers configuring, validating, building, and deploying the MediSense frontend (React + Vite on Vercel) and backend (Node.js 24+ Express + SQLite API on a Node.js host such as Render, Railway, or Fly.io).

> **Important:** MediSense stores sensitive health and medication records. Never commit `.env` files, cryptographic keys, SQLite databases, or service-role tokens to version control, and never declare a deployment ready without configuring every required secret for your target environment.

---

## 1. Environment Variables Reference

### Frontend (`medisense-app/.env.example`)

| Variable | Scope | Required in Prod | Default | Description |
|---|---|---|---|---|
| `VITE_API_URL` | Public browser bundle | **Yes** (unless same-origin reverse proxy) | `http://localhost:4000` in dev only; `""` in prod | Base URL of your deployed backend API without trailing slash (e.g., `https://api.medisense-app.example.com`). |

> **Security rule:** Never create `VITE_*` variables for `GEMINI_API_KEY`, `JWT_SECRET`, `SUPABASE_SERVICE_KEY`, `VAPID_PRIVATE_KEY`, or `SMTP_PASSWORD`. Anything prefixed with `VITE_` is bundled into public JavaScript downloaded by browsers.

### Backend (`medisense-app/server/.env.example`)

| Variable | Required in Prod | Default | Validation / Notes |
|---|---|---|---|
| `NODE_ENV` | **Yes** (`production`) | `development` | Must be `development`, `production`, or `test`. |
| `JWT_SECRET` | **Yes** | Dev-only fallback in dev | Min **32 chars**, 10+ unique chars, non-placeholder. Refuses startup in production if weak/missing. |
| `JWT_EXPIRY` | Recommended | `24h` | Valid duration (`12h`, `24h`, `7d`) or positive integer seconds. |
| `PORT` | Platform-supplied / `4000` | `4000` | Valid TCP port integer (`1–65535`). |
| `CORS_ORIGIN` | **Yes** | Localhost Vite origins in dev | Comma-separated exact `http(s)://origin` allowlist (e.g. `https://medisense.vercel.app`). Wildcards (`*`) or paths are rejected in production. |
| `DOCTOR_INVITE_CODE` | Recommended (**required** to register doctor accounts) | Unset | Min 8 chars in production. If unset in production, doctor registration returns HTTP `403`. |
| `ENABLE_DEMO_ACCOUNTS` | **Must not be `true`** | `true` in dev, `false` in prod | Setting `ENABLE_DEMO_ACCOUNTS=true` when `NODE_ENV=production` refuses server startup. |
| `ENABLE_OPENFDA_LOOKUP` | Optional | `true` | Enables live OpenFDA Drug Labeling API fallback when curated rules have no hit. |
| `GEMINI_API_KEY` | Needed for AI Insights & Report Summarizer | Unset | Read strictly server-side. Without it, AI endpoints return HTTP `503` (`AI_NOT_CONFIGURED`). |
| `GEMINI_MODEL` | Optional | `gemini-2.5-flash` | Gemini model ID used by `@google/generative-ai`. |
| `SUPABASE_URL` | Needed if using cloud file storage | Unset | `https://<project-ref>.supabase.co`. Must be set together with `SUPABASE_SERVICE_KEY`. |
| `SUPABASE_SERVICE_KEY` | Needed if using cloud file storage | Unset | Supabase `service_role` secret key (server-side only). |
| `SUPABASE_BUCKET` | Optional | `medisense-documents` | Private Supabase Storage bucket name. |
| `VAPID_PUBLIC_KEY` | Needed for Web Push in prod | Auto-generated in dev `data/vapid.json` | Generate via `npx web-push generate-vapid-keys`. Must be paired with `VAPID_PRIVATE_KEY`. |
| `VAPID_PRIVATE_KEY` | Needed for Web Push in prod | Auto-generated in dev `data/vapid.json` | Server-side private key for `web-push`. |
| `VAPID_SUBJECT` | Required if VAPID keys set | `mailto:support@medisense.local` (dev) | Must begin with `mailto:` (e.g., `mailto:ops@yourdomain.com`) or `https://`. |
| `SMTP_HOST` | Needed for email verification & password reset emails | Unset | SMTP server hostname (e.g., `smtp.resend.com`, `smtp-relay.brevo.com`). |
| `SMTP_PORT` | Required if SMTP enabled | Unset | Integer (`587` STARTTLS or `465` implicit TLS). |
| `SMTP_USER` | Required if SMTP auth used | Unset | Must be paired with `SMTP_PASSWORD`. |
| `SMTP_PASSWORD` | Required if SMTP auth used | Unset | Provider SMTP password / API token. |
| `SMTP_FROM` | Required if SMTP enabled | Unset | Valid sender email (e.g., `MediSense <no-reply@yourdomain.com>`). |

---

## 2. Local Development Setup

Prerequisites: **Node.js 24+** (`node -v` >= 24.0.0; required for built-in `node:sqlite`).

1. **Install dependencies:**
   ```bash
   cd medisense-app
   npm install

   cd server
   npm install
   ```

2. **Create `server/.env`** (if not already created):
   ```bash
   cp server/.env.example server/.env
   ```
   Generate a secure local `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Paste the output into `JWT_SECRET=` in `server/.env`.

3. **Start the backend (`http://localhost:4000`):**
   ```bash
   cd medisense-app/server
   npm run dev
   ```

4. **Start the frontend (`http://localhost:5173`):**
   ```bash
   cd medisense-app
   npm run dev
   ```
   Notice `VITE_API_URL` defaults automatically to `http://localhost:4000` during `vite dev` when unset.

---

## 3. Production Configuration Checklist Rules

When `NODE_ENV=production`:
- `JWT_SECRET` must be at least 32 characters with high entropy (no placeholder strings or repeated characters).
- `CORS_ORIGIN` must explicitly list your deployed frontend origin(s), e.g. `https://medisense.vercel.app` (no `*` wildcards).
- Demo account seeding (`ENABLE_DEMO_ACCOUNTS=true`), `RETURN_DEV_TOKENS=true`, and frontend offline demo login buttons are strictly disabled.
- `DOCTOR_INVITE_CODE` is enforced for every `POST /api/auth/register` call requesting `"role": "doctor"`.
- Uploaded medical documents are validated via MIME allowlist (`PDF`, `PNG`, `JPEG`, `WEBP`) + magic bytes verification; when Supabase Storage is configured in production, cloud failures fail closed with HTTP `502` instead of writing PHI to ephemeral container disk.

---

## 4. Frontend Deployment Configuration (Vercel)

`medisense-app/vercel.json` is preconfigured with SPA history rewrites (so refreshing deep routes like `/medications`, `/records`, or `/doctor` serves `index.html`), strict security headers (`nosniff`, `DENY`, `strict-origin-when-cross-origin`), and non-cached `/sw.js`.

1. Connect the repository in **Vercel** (`Add New... -> Project`).
2. Set **Root Directory** to `medisense-app`.
3. Set **Framework Preset** to `Vite`:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Add **Environment Variable** (for Production & Preview):
   - `VITE_API_URL` = `https://your-backend-api-domain.com` (no trailing slash).
5. Deploy, then copy your Vercel domain (e.g. `https://your-app.vercel.app`) into your backend's `CORS_ORIGIN` environment variable.

---

## 5. Backend Deployment Configuration (Node.js Hosting: Render / Railway / Fly.io)

Your backend platform must provide **Node.js >= 24** (`node:sqlite` is built into Node 24+).

### Deployment Settings
- **Root / Working Directory:** `medisense-app/server`
- **Install Command:** `npm ci` (or `npm install`)
- **Start Command:** `npm start` (`node index.js`)
- **Health Check Path:** `GET /api/health` (returns HTTP `200` JSON `{ ok: true, storage: "sqlite", ... }`)

### Platform Notes
- **Render (Web Service):**
  - Choose Node 24+ (via Render Node version env `NODE_VERSION=24` or `.nvmrc` / `engines` if supported by host).
  - **CRITICAL:** Render's filesystem is ephemeral by default. Attach a **Render Persistent Disk** mounted at `/opt/render/project/src/medisense-app/server/data` (or matching your repo mount path so `server/data/medisense.sqlite` persists across restarts and deploys), **and** configure Supabase Storage for medical document uploads (`server/uploads/` is otherwise ephemeral).
- **Railway / Fly.io / VPS (systemd + Nginx/Caddy TLS):**
  - Mount a persistent volume to `medisense-app/server/data` for `medisense.sqlite` and configure HTTPS termination at the reverse proxy (`trust proxy` is enabled in `server/index.js`).

### Required Backend Environment Variables in Production
```env
NODE_ENV=production
JWT_SECRET=<output of node crypto.randomBytes(48).toString('hex')>
JWT_EXPIRY=24h
PORT=4000
CORS_ORIGIN=https://your-app.vercel.app
DOCTOR_INVITE_CODE=<strong-random-clinic-code>
ENABLE_OPENFDA_LOOKUP=true
```
(Add `GEMINI_API_KEY`, `SUPABASE_*`, `VAPID_*`, and `SMTP_*` as needed below.)

---

## 6. Database & Document Storage Configuration

### SQLite Database (`server/data/medisense.sqlite`)
- Uses Node 24 `node:sqlite` with `PRAGMA journal_mode = WAL;` and `PRAGMA foreign_keys = ON;`.
- Tables and indexes are created idempotently on startup via versioned migrations in `server/db.js`.
- **Backups:** Run scheduled backups via:
  ```bash
  cd medisense-app/server
  npm run backup
  ```
  Backups write consistent snapshots to `server/backups/medisense-backup-<timestamp>.sqlite`. Copy backups off-host (e.g., encrypted S3/GCS bucket) before upgrades.

### Supabase Storage (Recommended for Production Documents)
1. Create a **Private** storage bucket named `medisense-documents` in your Supabase project (disable public access!).
2. From **Project Settings -> API**, copy:
   - `SUPABASE_URL` (`https://<project-ref>.supabase.co`)
   - `SUPABASE_SERVICE_KEY` (the **service_role** key — keep backend-only!)
   - `SUPABASE_BUCKET=medisense-documents`
3. MediSense proxies uploads (`POST /api/documents`), authenticated downloads (`GET /api/documents/:id/content`), deletions (`DELETE /api/documents/:id`), and DPDP account erasure (`DELETE /api/auth/account`) through the Express API after verifying ownership or active caregiver `records` permission. Direct browser access to the bucket stays blocked.

---

## 7. Google Gemini AI Configuration

1. Create an API key in Google AI Studio.
2. Set in your backend environment (`server/.env` or host dashboard):
   ```env
   GEMINI_API_KEY=<your-google-ai-studio-key>
   GEMINI_MODEL=gemini-2.5-flash
   ```
3. Keep `GEMINI_API_KEY` out of `medisense-app/.env*` and never prefix it with `VITE_`.
4. When unconfigured, `/api/health` reports `aiConfigured: false` and `/api/ai-chat` / `/api/ai-summarize-report` return HTTP `503` (`AI_NOT_CONFIGURED`).

---

## 8. Web Push (VAPID) Configuration

1. Generate a persistent VAPID keypair once:
   ```bash
   cd medisense-app/server
   npx web-push generate-vapid-keys
   ```
2. Set in production backend environment:
   ```env
   VAPID_PUBLIC_KEY=<generated-public-key>
   VAPID_PRIVATE_KEY=<generated-private-key>
   VAPID_SUBJECT=mailto:support@your-domain.com
   ```
3. In production, `server/index.js` does not auto-generate `data/vapid.json`. Keep `VAPID_PRIVATE_KEY` backend-only; the frontend fetches only the public key from `GET /api/push/public-key`.

---

## 9. SMTP Email Delivery Configuration

Verification and password-reset emails require an SMTP provider in production (Resend SMTP, Brevo, Postmark, Amazon SES, etc.).
```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=MediSense <no-reply@your-domain.com>
```
- If `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, or `SMTP_FROM` are partially configured, startup validation rejects the incomplete configuration immediately.
- When SMTP is unconfigured in production, `POST /api/auth/forgot-password` returns HTTP `503` (`SMTP_NOT_CONFIGURED`) rather than falsely claiming an email was sent.

---

## 10. Pre-Deployment Security Checklist

- [ ] `NODE_ENV=production` is set on the backend host.
- [ ] `JWT_SECRET` is a unique, 32+ character high-entropy string generated specifically for production.
- [ ] `CORS_ORIGIN` contains only your exact HTTPS frontend URL(s) (no `*`, no dev URLs).
- [ ] `ENABLE_DEMO_ACCOUNTS` is unset or `false` (`server/.env` is NOT deployed or committed).
- [ ] `DOCTOR_INVITE_CODE` is set to a strong private code distributed only to verified clinicians.
- [ ] `VITE_API_URL` is configured in Vercel and points to your HTTPS backend origin.
- [ ] Backend has HTTPS enabled in front of Node.js (`Strict-Transport-Security` enforced).
- [ ] Persistent storage (mounted disk for `server/data` + Supabase Storage for medical files) is attached before accepting real user data.
- [ ] `SMTP_*` variables are configured and tested for password reset and email verification.
- [ ] Built frontend bundle (`dist/`) inspected to confirm zero secrets or localhost defaults.

---

## 11. Build, Test & Startup Commands

```bash
# Run frontend unit tests (from medisense-app/)
npm test -- --run

# Build production frontend bundle (from medisense-app/)
VITE_API_URL=https://api.your-domain.com npm run build

# Run backend configuration, security & API tests (from medisense-app/server/)
npm test

# Create SQLite online backup (from medisense-app/server/)
npm run backup

# Start backend API server (from medisense-app/server/)
npm start
```

---

## 12. Troubleshooting

- **Backend refuses to start with `FATAL: JWT_SECRET must be at least 32 high-entropy characters`**:
  Generate a new 96-char hex secret (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) and update `JWT_SECRET`.
- **Browser shows CORS error calling `/api/auth/login`**:
  Check that `CORS_ORIGIN` on the backend matches the exact scheme + hostname + port in your browser address bar (no wildcard `*`). Trailing slashes in `CORS_ORIGIN` or `VITE_API_URL` are automatically normalized.
- **Production login says `returned a non-JSON response`**:
  Verify `VITE_API_URL` is configured in Vercel and redeploy the frontend (Vite bakes `VITE_*` variables at build time, not runtime).
- **Doctor registration returns HTTP `403`**:
  In production, `DOCTOR_INVITE_CODE` must be set on the backend and entered accurately during doctor sign-up.
- **Password reset returns HTTP `503` (`SMTP_NOT_CONFIGURED`)**:
  Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` on the backend host and restart the server.
- **Uploaded medical documents disappear after container redeploy**:
  Configure `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `SUPABASE_BUCKET` (recommended), or mount persistent disk storage on `server/data/` and `server/uploads/`.
