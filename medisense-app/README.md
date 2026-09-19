# MediSense

A unified personal health platform — **Today**, **Health**, **Medications**,
**Records**, **Care**, and **Insights** for patients, plus a roster,
prescribing, availability, and sharing-aware patient views for doctors.
Apple Health–inspired information architecture and visual language, with
MediSense's own branding — light/dark mode, adjustable text size, a high
contrast mode, and an optional real backend for accounts and cross-device
sync.

This is a complete, standalone project — unzip it and run it, no other setup
required.

## Quick start (frontend only)

The app works fully offline with **zero backend setup** — all data lives in
your browser's localStorage, seeded with a realistic demo dataset (3
patients, ~13 months of vitals history, medications, activity, sleep,
nutrition, lab results, and more).

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Demo logins (any password works in this mode):
- Patient: `alex@medisense.demo`
- Doctor: `dr.chen@medisense.demo`

## Full setup (with real accounts + cross-device sync)

The `server/` folder is a small Express API with bcrypt-hashed passwords,
JWT sessions, and a persistent per-user data store. It's optional — the app
degrades gracefully to localStorage if it isn't running.

```bash
# Terminal 1 — backend
cd server
npm install
cp .env.example .env      # then edit JWT_SECRET to a real random value
npm start                 # listens on http://localhost:4000

# Terminal 2 — frontend
npm install
npm run dev                # listens on http://localhost:5173
```

Then in the running app: **Settings → Account Sync** → create an account.
From then on your data backs up to the server automatically and follows you
to any other browser/device where you sign into the same account.

See `server/README.md` for the full API reference and security notes.

## Tests

```bash
npm test
```

Runs the Vitest suite (31 tests) covering the central data layer: adherence
math, interaction lookups, trend classification, and global search — the
pure logic the rest of the app is built on.

## Project structure

```
├── index.html, manifest.webmanifest, sw.js (in public/)
├── vite.config.js          # includes the Vitest config
├── package.json
├── src/
│   ├── main.jsx             # mounts the app, registers the service worker
│   ├── index.css            # design tokens — theme, text size, high contrast
│   ├── shared.jsx           # design system: tokens, theme, toasts, UI primitives
│   ├── MediSenseApp.jsx     # root: session/auth + app shell + routing (code-split)
│   ├── storagePolyfill.js   # window.storage — localStorage + optional backend mirror
│   ├── apiStorage.js        # backend API client (auth + per-user data store)
│   ├── data/
│   │   ├── seed.js          # patient data model + demo dataset + adherence/interaction helpers
│   │   ├── healthRecords.js # central health-data query layer (trends, stats, insights, timeline)
│   │   ├── search.js        # global search index (patient + doctor modes)
│   │   └── __tests__/       # Vitest suite
│   ├── components/nav.jsx   # sidebar, mobile tab bar, "More" sheet
│   └── features/            # one file per module: Today, Health, Medications,
│                             # Records, Care, Insights, Profile, Doctor, Auth,
│                             # Search, Messaging
└── server/                  # Express API (optional)
```

## What's implemented

**Information architecture** — Today · Health · Medications · Records ·
Care · Insights, plus Profile / Settings / Privacy, mirrored in a desktop
sidebar and a mobile bottom bar + "More" sheet.

**Today** — a modular, drag-and-drop customizable dashboard (health
snapshot, medications, activity, sleep, trends, alerts, next appointment).

**Health** — Vitals (7D–1Y history with real charts), Activity & workouts,
Sleep & stages, Body measurements, Nutrition & Hydration, Mobility, Mental
Wellbeing, a unified Timeline, and a Trends page — all reading from one
central health-data model, so a single recorded value shows up everywhere
relevant (Today, Health, Trends, Insights, Reports, Doctor view, Timeline).

**Medications** — schedule, history, adherence (with day-of-week and
time-of-day pattern detection), an interaction checker, and rule-based
adherence insights.

**Records** — Conditions, Allergies, Lab Results, Immunizations,
Procedures, Documents.

**Care** — Doctors, Appointments (request/cancel against real availability),
secure Messages (shared thread with the doctor), Care Team, and granular
per-category data-sharing permissions.

**Insights** — an AI chat assistant (needs its own proxy — see below),
auto-generated non-diagnostic observations, notifications, and Reports
(select sections + date range, then **Print / Save as PDF** via the
browser's print dialog, or download a plain-text summary).

**Doctor experience** — patient roster with adherence/unread-message
flags, prescribing, availability management, and a sharing-aware patient
view: vitals, trends, and insights only appear for categories the patient
has actually authorized.

**Accessibility** — Large Text (2 levels) and High Contrast settings,
color-independent status indicators (icon + text + color, never color
alone), a skip-to-content link, semantic landmarks, and full support for
`prefers-reduced-motion`.

**Platform basics** — installable web app (manifest + icon), a lightweight
service worker for offline reloads of a previously visited session,
per-feature code splitting (each tab is its own lazy-loaded chunk), and a
data-source/ingestion architecture (manual entry + simulated device
connections, clearly labeled as simulated — never faked as a real device).

## Optional: MediSense AI chat proxy

The in-app AI assistant (Insights → Ask AI) calls
`http://localhost:3001/api/ai-chat`. That proxy isn't part of this project;
if you don't run one, the chat screen still works but shows a friendly
"couldn't reach the assistant service" message instead of a reply — nothing
else in the app depends on it.

## Known, intentional gaps

- **No real device/wearable SDK integration.** Data Sources shows the
  ingestion architecture and lets you simulate a reading through the real
  pipeline, but never pretends to connect to an actual device — that needs
  a real hardware/vendor partnership.
- **No video/audio telehealth.** Appointments are slot-booking + secure
  text messaging only; real-time video needs dedicated infrastructure
  (WebRTC/TURN servers, a signaling service) this project doesn't include.
- **The AI proxy is external**, as noted above.
