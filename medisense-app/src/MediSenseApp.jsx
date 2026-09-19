import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Search as SearchIcon } from "lucide-react";
import {
  COLORS, FONT_STACK, FONT_IMPORT, ThemeProvider, ToastHost, toast, uid,
  STORAGE_KEY, SESSION_KEY, IconThemeToggle as IconThemeToggleBtn,
} from "./shared.jsx";
import { buildSeedData } from "./data/seed.js";

import { Sidebar, MobileTabBar, MoreSheet } from "./components/nav.jsx";
import LoginPage from "./features/Auth.jsx";

/* Every feature module below is code-split into its own chunk and fetched
   only when its tab is opened, instead of shipping the entire app (charts,
   every health category, doctor screens, etc.) in the first payload. */
const SearchOverlay = lazy(() => import("./features/Search.jsx"));
const TodayDashboard = lazy(() => import("./features/Today.jsx"));
const HealthHub = lazy(() => import("./features/Health.jsx"));
const MedicationsHub = lazy(() => import("./features/Medications.jsx"));
const RecordsHub = lazy(() => import("./features/Records.jsx"));
const CareHub = lazy(() => import("./features/Care.jsx"));
const InsightsHub = lazy(() => import("./features/Insights.jsx"));
const ProfileHub = lazy(() => import("./features/Profile.jsx").then((m) => ({ default: m.ProfileHub })));
const SettingsPage = lazy(() => import("./features/Profile.jsx").then((m) => ({ default: m.SettingsPage })));
const PrivacyCenter = lazy(() => import("./features/Profile.jsx").then((m) => ({ default: m.PrivacyCenter })));
const DoctorPatientsList = lazy(() => import("./features/Doctor.jsx").then((m) => ({ default: m.DoctorPatientsList })));
const DoctorPatientDetail = lazy(() => import("./features/Doctor.jsx").then((m) => ({ default: m.DoctorPatientDetail })));
const DoctorAvailability = lazy(() => import("./features/Doctor.jsx").then((m) => ({ default: m.DoctorAvailability })));
const DoctorProfile = lazy(() => import("./features/Doctor.jsx").then((m) => ({ default: m.DoctorProfile })));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        className="w-8 h-8 rounded-full" style={{ background: COLORS.mint }} />
    </div>
  );
}

/* =========================================================================
   MediSense — root app
   -------------------------------------------------------------------------
   Owns storage load/persist, the login-gated session, and the app shell
   that wires the new information architecture (Today / Health /
   Medications / Records / Care / Insights, + Profile / Settings / Privacy)
   to each feature module. All business logic lives in src/features/* and
   src/data/*; this file is intentionally thin.
   ========================================================================= */

function useMediSenseData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        setData(JSON.parse(res.value));
      } catch {
        const seed = buildSeedData();
        try { await window.storage.set(STORAGE_KEY, JSON.stringify(seed), false); } catch {}
        setData(seed);
      }
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(next), false); } catch {}
  }, []);

  return { data, setData: persist, loading };
}

function emptyPatient(name) {
  return {
    id: uid(), name, age: "", dob: "", sex: "", email: "", phone: "", emergencyContact: "", conditions: "", allergies: "",
    medications: [], logs: [], healthRecords: [], notifications: [], aiMessages: [], nextVisit: null, messages: [],
    activity: [], sleep: [], nutrition: [], hydration: [], mobility: [], mentalWellbeing: [], workouts: [],
    body: { heightCm: null, bodyFatPct: null, leanMassKg: null, waistCm: null, history: [] },
    records: { conditions: [], allergies: [], labResults: [], immunizations: [], procedures: [], documents: [] },
    careTeam: [], healthShares: [], dataSources: [{ id: uid(), name: "MediSense manual entry", type: "manual", connected: true, lastSync: new Date().toISOString().slice(0, 10) }],
    goals: { dailySteps: 7000, sleepHours: 8, adherencePct: 90, weightTargetKg: null },
    dashboardPrefs: { favoriteMetrics: ["heartRate", "bloodPressure"], enabledCards: ["snapshot", "medications", "activity", "sleep", "trends", "alerts", "appointment"], cardOrder: ["snapshot", "medications", "activity", "sleep", "trends", "alerts", "appointment"] },
  };
}

/* -------------------------------- app shell -------------------------------- */

function AppShell({ data, setData, role, patientId, onLogout }) {
  const [tab, setTab] = useState(role === "doctor" ? "patients" : "today");
  const [navParams, setNavParams] = useState({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const patient = role === "patient" ? data.patients.find((p) => p.id === patientId) : null;
  const unread = patient ? patient.notifications.filter((n) => !n.read).length : 0;

  const updatePatient = useCallback(async (pid, updater) => {
    const patients = data.patients.map((p) => (p.id === pid ? updater(p) : p));
    await setData({ ...data, patients });
  }, [data, setData]);

  const goTo = (id, params = {}) => {
    setTab(id);
    setNavParams(params);
    setMoreOpen(false);
    if (id === "patients") setSelectedPatientId(params.patientId || null);
  };
  const clearParams = () => setNavParams({});

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [role]);

  const morePatientIds = ["records", "insights", "reports", "profile", "settings", "privacy"];
  const moreDoctorIds = ["profile", "settings"];
  const moreActive = role === "doctor" ? moreDoctorIds.includes(tab) : morePatientIds.includes(tab);

  return (
    <div style={{ background: COLORS.bg, minHeight: "100%", fontFamily: FONT_STACK, color: COLORS.ink }}>
      <style>{FONT_IMPORT}</style>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="flex">
        <Sidebar role={role} activeId={tab} onSelect={(id) => goTo(id)} onLogout={onLogout} onSearch={() => setSearchOpen(true)} />

        <div className="flex-1 min-w-0">
          <div className="md:hidden flex items-center justify-between px-5 py-4 sticky top-0 z-10"
            style={{ background: "var(--color-glass)", backdropFilter: "blur(20px) saturate(180%)", borderBottom: `1px solid ${COLORS.hair}` }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-[10px] flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.lavender})` }}>
                <Pill size={13} color="white" />
              </div>
              <span className="font-semibold text-[16px] tracking-tight">MediSense</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setSearchOpen(true)} aria-label="Search MediSense" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: COLORS.card, boxShadow: COLORS.cardShadow }}>
                <SearchIcon size={15} color={COLORS.inkSoft} />
              </button>
              <IconThemeToggleBtn />
            </div>
          </div>

          <main id="main-content" className="p-5 md:p-8 pb-28 md:pb-8 max-w-5xl mx-auto">
            <Suspense fallback={<RouteFallback />}>
            <AnimatePresence mode="wait">
              <motion.div key={tab + (selectedPatientId || "")}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}>
                {role === "patient" && patient && (
                  <>
                    {tab === "today" && <TodayDashboard data={data} patient={patient} updatePatient={updatePatient} goTo={goTo} />}
                    {tab === "health" && <HealthHub patient={patient} updatePatient={updatePatient} initialSection={navParams.section} initialMetric={navParams.metric} onConsumeParams={clearParams} />}
                    {tab === "medications" && <MedicationsHub patient={patient} updatePatient={updatePatient} />}
                    {tab === "records" && <RecordsHub patient={patient} updatePatient={updatePatient} />}
                    {tab === "care" && <CareHub data={data} setData={setData} patient={patient} updatePatient={updatePatient} initialSection={navParams.section} onConsumeParams={clearParams} />}
                    {tab === "insights" && <InsightsHub data={data} patient={patient} updatePatient={updatePatient} initialSection={navParams.section} onConsumeParams={clearParams} />}
                    {tab === "reports" && <InsightsHub data={data} patient={patient} updatePatient={updatePatient} initialSection="reports" onConsumeParams={clearParams} />}
                    {tab === "profile" && <ProfileHub data={data} setData={setData} patient={patient} updatePatient={updatePatient} />}
                    {tab === "settings" && <SettingsPage data={data} setData={setData} patient={patient} updatePatient={updatePatient} />}
                    {tab === "privacy" && <PrivacyCenter data={data} patient={patient} updatePatient={updatePatient} />}
                  </>
                )}
                {role === "doctor" && (
                  <>
                    {tab === "patients" && (
                      selectedPatientId ? (
                        <DoctorPatientDetail data={data} setData={setData} patient={data.patients.find((p) => p.id === selectedPatientId)} onBack={() => setSelectedPatientId(null)} />
                      ) : (
                        <DoctorPatientsList data={data} onSelect={setSelectedPatientId} />
                      )
                    )}
                    {tab === "availability" && <DoctorAvailability data={data} setData={setData} />}
                    {tab === "profile" && <DoctorProfile data={data} setData={setData} />}
                    {tab === "settings" && <DoctorProfile data={data} setData={setData} />}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
            </Suspense>
          </main>
        </div>
      </div>

      <MobileTabBar role={role} activeId={tab} onSelect={(id) => goTo(id)} moreActive={moreActive} onMoreClick={() => setMoreOpen(true)} unread={unread} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} role={role} activeId={tab} onSelect={(id) => goTo(id)} onLogout={onLogout} />
      <Suspense fallback={null}>
        {role === "patient" && patient && <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} data={data} patient={patient} role="patient" goTo={goTo} />}
        {role === "doctor" && <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} data={data} role="doctor" goTo={goTo} />}
      </Suspense>
    </div>
  );
}

/* ------------------------------------ root app ----------------------------------- */

export default function MediSenseApp() {
  const { data, setData, loading } = useMediSenseData();
  const [session, setSession] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await window.storage.get(SESSION_KEY, false);
        setSession(JSON.parse(s.value));
      } catch {}
    })();
  }, []);

  const handleLogin = async (role, opts) => {
    let sess;
    if (role === "patient" && opts.registerName) {
      const newPatient = emptyPatient(opts.registerName);
      const next = { ...data, patients: [...data.patients, newPatient] };
      await setData(next);
      sess = { loggedIn: true, role: "patient", patientId: newPatient.id };
    } else if (role === "patient") {
      sess = { loggedIn: true, role: "patient", patientId: data.patients[0].id };
    } else {
      sess = { loggedIn: true, role: "doctor" };
    }
    setSession(sess);
    try { await window.storage.set(SESSION_KEY, JSON.stringify(sess), false); } catch {}
    toast(role === "doctor" ? `Welcome back, ${data.doctor.name}` : "Welcome back");
  };

  const handleLogout = async () => {
    setSession(null);
    try { await window.storage.set(SESSION_KEY, JSON.stringify(null), false); } catch {}
  };

  if (loading || !data) {
    return (
      <ThemeProvider>
        <div style={{ background: COLORS.bg, height: "100vh", fontFamily: FONT_STACK }} className="flex flex-col items-center justify-center gap-3">
          <style>{FONT_IMPORT}</style>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: [0.9, 1.05, 0.9], opacity: 1 }}
            transition={{ opacity: { duration: 0.3 }, scale: { duration: 1.4, repeat: Infinity, ease: "easeInOut" } }}
            className="w-10 h-10 rounded-[11px] flex items-center justify-center" style={{ background: COLORS.primary }}>
            <Pill size={20} color="white" />
          </motion.div>
          <div className="text-[14px]" style={{ color: COLORS.inkSoft }}>Loading MediSense…</div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="medisense-scroll-root" style={{ height: "100vh", overflow: "auto", background: COLORS.bg }}>
        <ToastHost />
        {!session?.loggedIn ? (
          <LoginPage onLogin={handleLogin} />
        ) : (
          <AppShell data={data} setData={setData} role={session.role} patientId={session.patientId} onLogout={handleLogout} />
        )}
      </div>
    </ThemeProvider>
  );
}
