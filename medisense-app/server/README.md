# MediSense Server

Express + SQLite (`node:sqlite`) backend for MediSense providing authentication, ACID persistence, document storage, server-filtered caregiver sharing, Gemini AI insights, OpenFDA interaction lookups, DPDP privacy endpoints, and Web Push reminders.

## Requirements & Setup

Requires **Node.js 24+** (`node:sqlite` is built into Node 24 — no C++ build toolchain needed).

```bash
cd server
npm install
cp .env.example .env
npm start
```

Default port: `http://localhost:4000`.

### Environment Variables (`server/.env`)

Startup validation (`server/config.js`) validates all configuration at boot and refuses production startup if mandatory secrets are weak, wildcarded, or misconfigured:

- `NODE_ENV` — `development`, `test`, or `production`.
- `JWT_SECRET` — Strong random string (min 32 high-entropy characters, non-placeholder). Required in `NODE_ENV=production`.
- `JWT_EXPIRY` — Session token lifetime (e.g. `24h`, `7d`; defaults to `24h`).
- `PORT` — HTTP server port (`1–65535`; defaults to `4000`).
- `CORS_ORIGIN` — Comma-separated allowed origins (e.g. `https://app.example.com`). Wildcard `*` is rejected in `NODE_ENV=production`; defaults to localhost Vite origins in dev.
- `GEMINI_API_KEY` — Server-side Google Gemini API key for `/api/ai-chat` and `/api/ai-summarize-report` (never exposed to frontend).
- `GEMINI_MODEL` — Optional model ID override (defaults to `gemini-2.5-flash`).
- `DOCTOR_INVITE_CODE` — Required in production when registering a `doctor` account (checked in constant time).
- `ENABLE_DEMO_ACCOUNTS` — Enables dev seed accounts in development; strictly rejected if set to `true` in `NODE_ENV=production`.
- `ENABLE_OPENFDA_LOOKUP` — Set to `true` to augment curated interaction rules with live OpenFDA drug label queries.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — Required in production for Web Push reminders (`mailto:` or `https://` subject; auto-generated into `data/vapid.json` in development).
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_BUCKET` — Optional private Supabase Storage backend for uploaded medical documents; falls back to local `server/uploads/` in development when unset.
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` — Optional SMTP delivery for verification and password-reset emails (validated at startup; never claims email delivery when unconfigured).

See [../DEPLOYMENT.md](../DEPLOYMENT.md) for the full production configuration guide.

Generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Database & Backups

Data is stored in `server/data/medisense.sqlite` with WAL mode enabled and `foreign_keys = ON`. On first startup, any legacy `server/data/users.json` or `store.json` files are migrated automatically inside a transaction.

Create a point-in-time online SQLite backup:

```bash
npm run backup
```

Backups are written to `server/backups/medisense-<timestamp>.sqlite`.

## API Reference

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | No | Server health & SQLite migration status |
| POST | `/api/auth/register` | No | Registers `patient`, `caregiver`, or `doctor` with consent record |
| POST | `/api/auth/login` | No | Rate-limited bcrypt login + role check |
| POST | `/api/auth/logout` | Yes | Revokes current JWT `jti` in SQLite |
| POST | `/api/auth/forgot-password` | No | Generates 30-min SHA-256 hashed reset token |
| POST | `/api/auth/reset-password` | No | Resets password & clears token |
| POST | `/api/auth/verify-email` | No | Verifies email verification token |
| GET | `/api/me` | Yes | Returns current authenticated user |
| DELETE | `/api/auth/account` | Yes | Password-confirmed permanent account erasure |
| GET/PUT/DELETE | `/api/data/:key` | Yes | Per-user state sync + relational table projection |
| GET | `/api/data/export` | Yes | Full DPDP export bundle (profile, state, consents, audit, docs) |
| GET/POST | `/api/privacy/consents` | Yes | View & toggle timestamped DPDP consents + audit events |
| GET/POST/DELETE | `/api/documents` | Yes | Multipart upload (PDF/PNG/JPEG/WebP ≤10MB) + magic-bytes check |
| GET | `/api/documents/:id/content` | Yes | Authenticated binary stream for document preview/download |
| POST | `/api/ai-chat` | Yes | Rate-limited Gemini AI streaming (SSE) / JSON chat |
| POST | `/api/ai-summarize-report` | Yes | Rate-limited Gemini clinical report & lab explainer |
| GET/POST/PATCH/DELETE | `/api/caregivers` | Patient | Invite caregivers & manage category permissions |
| GET/POST | `/api/caregiver/patients` | Caregiver | Fetch server-filtered shared patient records & accept invites |
| POST | `/api/interactions/check` | Yes | Drug interaction & allergy cross-check (+ optional OpenFDA lookup) |
| GET/POST | `/api/push/*` | Yes | VAPID public key, subscribe/unsubscribe, & test push delivery |

## Tests

```bash
npm test
```
