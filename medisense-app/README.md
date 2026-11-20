# MediSense

MediSense is a unified personal healthcare management platform built with React 18, Vite, Tailwind CSS, React Router, and an Express + SQLite backend.

It provides tailored experiences for **Patients** (Today, Health, Medications, Records, Care, Insights, Profile/Settings/Privacy), **Caregivers** (permission-filtered medication monitoring, missed-dose alerts, and shared vitals), and **Doctors** (patient roster, prescribing with live allergy & drug-interaction alerts, availability management, consultation notes, and sharing-aware patient views).

## Quick start (full-stack local development)

Prerequisites: **Node.js 24+** (uses built-in `node:sqlite`).

```bash
# Terminal 1 — backend API + SQLite
cd server
npm install
cp .env.example .env      # add GEMINI_API_KEY if using Gemini AI features
npm start                 # listens on http://localhost:4000

# Terminal 2 — frontend web app
npm install
cp .env.example .env      # sets VITE_API_URL=http://localhost:4000
npm run dev               # listens on http://localhost:5173
```

### Development test accounts
When running in non-production (`NODE_ENV !== "production"` / Vite dev), the backend seeds three test accounts with password `demo1234` and offers one-click autofill + explicit **Offline Patient/Doctor Demo** buttons on the Sign In page (permanently disabled in `NODE_ENV=production` and production builds):
- Patient: `alex@medisense.demo`
- Caregiver: `priya.caregiver@medisense.demo`
- Doctor: `dr.chen@medisense.demo`

For production deployment and environment setup instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Tests & build verification

```bash
# Frontend Vitest suite (45 unit tests across data, interactions, search, & calculations)
npm test -- --run

# Production bundle build
npm run build

# Backend API & SQLite integration suite
cd server && npm test
```

## Project structure

```
├── public/sw.js, manifest.webmanifest
├── vite.config.js               # Vite + Vitest configuration
├── src/
│   ├── main.jsx                 # BrowserRouter mount & service worker setup
│   ├── index.css                # Light/dark/high-contrast CSS design tokens
│   ├── shared.jsx               # Design system, BMI/refill utils, UUID generation
│   ├── MediSenseApp.jsx         # URL routes, JWT session verification, reminder loop
│   ├── apiStorage.js            # Authenticated REST + SSE client for server APIs
│   ├── storagePolyfill.js       # Offline cache + backend state sync bridge
│   ├── lib/
│   │   ├── localDocStore.js     # IndexedDB binary fallback for offline documents
│   │   └── pushNotifications.js # Web Push VAPID + foreground reminder scheduler
│   ├── components/
│   │   ├── ErrorBoundary.jsx
│   │   └── nav.jsx              # Role-aware Sidebar, 5-item Mobile Bar, More sheet
│   ├── data/
│   │   ├── interactions.js      # Curated FDA drug interaction & allergy-class DB
│   │   ├── healthRecords.js     # Vital trends, anomalies, stats & timeline layer
│   │   ├── search.js            # Global Ctrl/Cmd+K search index
│   │   └── seed.js              # Initial domain model & sample dataset helpers
│   └── features/                # Auth, Today, Health, Medications (+ Calendar),
│                                # Records, Care, Caregiver, Insights, Profile, Doctor
└── server/                      # Express + SQLite + Gemini AI + Web Push backend
```

## Core capabilities

- **Authentication & Security**: bcrypt password hashing, JWT tokens with `jti` revocation on logout, role separation (`patient | caregiver | doctor`), `helmet` security headers, explicit CORS allowlist, `express-rate-limit` on auth & AI routes, `express-validator`, password reset + email verification tokens, and immutable `audit_logs`.
- **SQLite Persistence**: `node:sqlite` (`DatabaseSync` with WAL mode & foreign keys) across normalized relational tables (`users`, `patient_profiles`, `doctor_profiles`, `caregiver_relationships`, `medications`, `medication_logs`, `health_measurements`, `medical_records`, `appointments`, `notifications`, `consent_records`, `audit_logs`, `documents`, `push_subscriptions`), plus online backup (`npm run backup` in `server/`).
- **Medications**: Patient add/edit/delete, custom daily schedules, **Taken / Skipped / Late / Missed** dose logging, 90-day adherence heatmap, monthly Calendar view, medicine stock countdown & low-stock refill alerts, curated FDA drug-interaction & allergy checker (with optional server-side OpenFDA label lookup), and foreground/Web Push reminders.
- **Health Monitoring**: Vitals with 7D–1Y charts & normal reference range shading, editable/deletable history entries, BMI calculation & category classification, calorie balance, 7-day hydration tracking, sleep & activity goals via progress rings.
- **Medical Records**: Conditions, Allergies, Lab Results (with AI plain-language explainer), Immunizations, Procedures, Hospitalizations, and real multipart PDF/PNG/JPEG/WebP document upload (`multer` + magic-bytes check) with live modal preview and download.
- **AI Health Assistant**: Built into the Express backend at `/api/ai-chat` (SSE streaming) and `/api/ai-summarize-report` powered by `@google/generative-ai` (`GEMINI_API_KEY`) under strict non-diagnostic safety guidelines.
- **DPDP Privacy & Controls**: Granular consent recording & withdrawal, audit history viewer, full JSON data export (`/api/data/export`), and password-confirmed permanent account erasure (`DELETE /api/auth/account`).
- **Caregiver Sharing**: Invite caregivers by email with server-filtered category permissions (`medications`, `vitals`, `glucose`, `activity`, `sleep`, `nutrition`, `records`). Unauthorized fields are stripped server-side before crossing the network.
