import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Search as SearchIcon } from "lucide-react";
import {
  COLORS, FONT_STACK, FONT_IMPORT, ThemeProvider, ToastHost, toast, uid,
  STORAGE_KEY, SESSION_KEY, IconThemeToggle as IconThemeToggleBtn,
} from "./shared.jsx";
import { buildSeedData } from "./data/seed.js";
import {
  whoAmI, logout as apiLogout, getToken, getCachedUser, remoteGet, remoteSet,
} from "./apiStorage.js";
import { startForegroundReminderLoop } from "./lib/pushNotifications.js";

import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { Sidebar, MobileTabBar, MoreSheet } from "./components/nav.jsx";
import LoginPage from "./features/Auth.jsx";

/* Code-split feature modules */
const SearchOverlay = lazy(() => import("./features/Search.jsx"));
const TodayDashboard = lazy(() => import("./features/Today.jsx"));
const HealthHub = lazy(() => import("./features/Health.jsx"));
const MedicationsHub = lazy(() => import("./features/Medications.jsx"));
const RecordsHub = lazy(() => import("./features/Records.jsx"));
const CareHub = lazy(() => import("./features/Care.jsx"));
const CaregiverHub = lazy(() => import("./features/Caregiver.jsx"));
const InsightsHub = lazy(() => import("./features/Insights.jsx"));
const ProfileHub = lazy(() => import("./features/Profile.jsx").then((m) => ({ default: m.ProfileHub })));
const SettingsPage = lazy(() => import("./features/Profile.jsx").then((m) => ({ default: m.SettingsPage })));
const PrivacyCenter = lazy(() => import("./features/Profile.jsx").then((m) => ({ default: m.PrivacyCenter })));
const DoctorPatientsList = lazy(() => import("./features/Doctor.jsx").then((m) => ({ default: m.DoctorPatientsList })));
const DoctorPatientDetail = lazy(() => import("./features/Doctor.jsx").then((m) => ({ default: m.DoctorPatientDetail })));
const DoctorAvailability = lazy(() => import("./features/Doctor.jsx").then((m) => ({ default: m.DoctorAvailability })));
const DoctorProfile = lazy(() => import("./features/Doctor.jsx").then((m) => ({ default: m.DoctorProfile })));

const ALLOW_DEMO = !import.meta.env.PROD;

function RouteFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: "var(--color-primary-soft, rgba(13, 115, 119, 0.2))", borderTopColor: COLORS.primary }}
      />
      <span className="text-[13px] font-medium" style={{ color: COLORS.inkSoft }}>Loading view…</span>
    </div>
  );
}

/* =========================================================================
   MediSense — root app with URL routing, server auth hydration, & ErrorBoundary
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

function emptyPatient(name, customId = null, email = "") {
  return {
    id: customId || uid(),
    name,
    age: "",
    dob: "",
    sex: "",
    bloodGroup: "",
    email,
    phone: "",
    emergencyContact: "",
    conditions: "",
    allergies: "",
    medications: [],
    logs: [],
    healthRecords: [],
    notifications: [],
    aiMessages: [],
    nextVisit: null,
    appointmentHistory: [],
    messages: [],
    activity: [],
    sleep: [],
    nutrition: [],
    hydration: [],
    mobility: [],
    mentalWellbeing: [],
    workouts: [],
    body: { heightCm: null, bodyFatPct: null, leanMassKg: null, waistCm: null, history: [] },
    records: { conditions: [], allergies: [], labResults: [], immunizations: [], procedures: [], hospitalizations: [], documents: [] },
    careTeam: [],
    healthShares: [],
    dataSources: [{ id: uid(), name: "MediSense manual entry", type: "manual", connected: true, lastSync: new Date().toISOString().slice(0, 10) }],
    goals: { dailySteps: 8000, steps: 8000, sleepHours: 8, adherencePct: 90, weightTargetKg: null },
    dashboardPrefs: {
      favoriteMetrics: ["heartRate", "bloodPressure", "glucose"],
      enabledCards: ["snapshot", "medications", "goals", "activity", "sleep", "trends", "alerts", "appointment"],
      cardOrder: ["snapshot", "medications", "goals", "activity", "sleep", "trends", "alerts", "appointment"],
    },
  };
}

function HealthMetricRoute({ patient, updatePatient, navParams, clearParams }) {
  const { metric } = useParams();
  return (
    <HealthHub
      patient={patient}
      updatePatient={updatePatient}
      initialSection={navParams.section}
      initialMetric={metric || navParams.metric}
      onConsumeParams={clearParams}
    />
  );
}

function DoctorDetailRoute({ data, setData, onBack }) {
  const { patientId } = useParams();
  const target = data.patients.find((p) => p.id === patientId);
  return <DoctorPatientDetail data={data} setData={setData} patient={target} onBack={onBack} />;
}

/* -------------------------------- app shell -------------------------------- */

function AppShell({ data, setData, session, onLogout }) {
  const { role, patientId, offlineDemo } = session;
  const [navParams, setNavParams] = useState({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const patient = role === "patient"
    ? (data.patients.find((p) => p.id === patientId) || data.patients[0] || emptyPatient("Patient"))
    : null;
  const unread = patient ? (patient.notifications || []).filter((n) => !n.read).length : 0;

  const latestPatientRef = useRef(patient);
  latestPatientRef.current = patient;

  useEffect(() => {
    if (role !== "patient") return undefined;
    return startForegroundReminderLoop(
      () => latestPatientRef.current,
      ({ body }) => toast(body, "warning")
    );
  }, [role]);

  const updatePatient = useCallback(async (pid, updater) => {
    const patients = data.patients.map((p) => (p.id === pid ? updater(p) : p));
    await setData({ ...data, patients });
  }, [data, setData]);

  const goTo = useCallback((id, params = {}) => {
    setNavParams(params);
    setMoreOpen(false);
    if (role === "doctor") {
      if (id === "patients") {
        navigate(params.patientId ? `/doctor/patients/${encodeURIComponent(params.patientId)}` : "/doctor");
      } else if (id === "availability") {
        navigate("/doctor/availability");
      } else if (id === "profile") {
        navigate("/doctor/profile");
      } else if (id === "settings") {
        navigate("/doctor/settings");
      } else {
        navigate("/doctor");
      }
      return;
    }

    if (role === "caregiver") {
      if (id === "settings") navigate("/settings");
      else navigate("/caregiver");
      return;
    }

    // Patient routes
    if (id === "today") navigate("/");
    else if (id === "health") navigate(params.metric ? `/health/${encodeURIComponent(params.metric)}` : "/health");
    else if (id === "medications") navigate("/medications");
    else if (id === "records") navigate("/records");
    else if (id === "care") navigate("/care");
    else if (id === "insights") navigate("/insights");
    else if (id === "reports") navigate("/reports");
    else if (id === "profile") navigate("/profile");
    else if (id === "settings") navigate("/settings");
    else if (id === "privacy") navigate("/privacy");
    else navigate("/");
  }, [navigate, role]);

  const clearParams = useCallback(() => setNavParams({}), []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeId = (() => {
    const p = location.pathname;
    if (role === "doctor") {
      if (p.startsWith("/doctor/availability")) return "availability";
      if (p.startsWith("/doctor/profile")) return "profile";
      if (p.startsWith("/doctor/settings")) return "settings";
      return "patients";
    }
    if (role === "caregiver") {
      return p.startsWith("/settings") ? "settings" : "caregiver";
    }
    if (p.startsWith("/health")) return "health";
    if (p.startsWith("/medications")) return "medications";
    if (p.startsWith("/records")) return "records";
    if (p.startsWith("/care")) return "care";
    if (p.startsWith("/insights")) return "insights";
    if (p.startsWith("/reports")) return "insights";
    if (p.startsWith("/profile")) return "profile";
    if (p.startsWith("/settings")) return "settings";
    if (p.startsWith("/privacy")) return "privacy";
    return "today";
  })();

  const morePatientIds = ["care", "insights", "reports", "profile", "settings", "privacy"];
  const moreDoctorIds = ["profile", "settings"];
  const moreCaregiverIds = ["settings"];
  const moreActive = role === "doctor"
    ? moreDoctorIds.includes(activeId)
    : role === "caregiver"
    ? moreCaregiverIds.includes(activeId)
    : morePatientIds.includes(activeId);

  const settingsPatientFallback = patient || data.patients?.[0] || emptyPatient(session.name || "Caregiver");

  return (
    <div style={{ background: COLORS.bg, minHeight: "100%", fontFamily: FONT_STACK, color: COLORS.ink }}>
      <style>{FONT_IMPORT}</style>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="flex">
        <Sidebar role={role} user={session} activeId={activeId} onSelect={(id) => goTo(id)} onLogout={onLogout} onSearch={() => setSearchOpen(true)} />

        <div className="flex-1 min-w-0">
          <div className="md:hidden flex items-center justify-between px-5 py-4 sticky top-0 z-10"
            style={{ background: "var(--color-glass)", backdropFilter: "blur(20px) saturate(180%)", borderBottom: `1px solid ${COLORS.hair}` }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white font-bold" style={{ background: COLORS.primary }}>
                <Pill size={16} color="white" />
              </div>
              <div>
                <span className="font-bold text-[16px] tracking-tight block leading-tight" style={{ color: COLORS.ink }}>MediSense</span>
                <span className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: COLORS.primary }}>
                  {role === "doctor" ? "Clinical Portal" : role === "caregiver" ? "Caregiver Portal" : "Health Portal"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {role !== "caregiver" && (
                <button onClick={() => setSearchOpen(true)} aria-label="Search MediSense" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: COLORS.card, boxShadow: COLORS.cardShadow }}>
                  <SearchIcon size={15} color={COLORS.inkSoft} />
                </button>
              )}
              <IconThemeToggleBtn />
            </div>
          </div>

          <main id="main-content" className="p-4 sm:p-6 md:p-8 pb-28 md:pb-8 max-w-5xl mx-auto">
            <ErrorBoundary onReset={() => goTo(role === "doctor" ? "patients" : role === "caregiver" ? "caregiver" : "today")}>
              <Suspense fallback={<RouteFallback />}>
                <div key={location.pathname} style={{ animation: "fadeIn 0.18s ease-out" }}>
                  {role === "patient" && (
                    <Routes>
                      <Route path="/" element={<TodayDashboard data={data} patient={patient} updatePatient={updatePatient} goTo={goTo} />} />
                      <Route path="/health" element={<HealthHub patient={patient} updatePatient={updatePatient} initialSection={navParams.section} initialMetric={navParams.metric} onConsumeParams={clearParams} />} />
                      <Route path="/health/:metric" element={<HealthMetricRoute patient={patient} updatePatient={updatePatient} navParams={navParams} clearParams={clearParams} />} />
                      <Route path="/medications" element={<MedicationsHub patient={patient} updatePatient={updatePatient} />} />
                      <Route path="/records" element={<RecordsHub patient={patient} updatePatient={updatePatient} />} />
                      <Route path="/care" element={<CareHub data={data} setData={setData} patient={patient} updatePatient={updatePatient} initialSection={navParams.section} onConsumeParams={clearParams} />} />
                      <Route path="/insights" element={<InsightsHub data={data} patient={patient} updatePatient={updatePatient} initialSection={navParams.section} onConsumeParams={clearParams} />} />
                      <Route path="/reports" element={<InsightsHub data={data} patient={patient} updatePatient={updatePatient} initialSection="reports" onConsumeParams={clearParams} />} />
                      <Route path="/profile" element={<ProfileHub data={data} setData={setData} patient={patient} updatePatient={updatePatient} />} />
                      <Route path="/settings" element={<SettingsPage data={data} setData={setData} patient={patient} updatePatient={updatePatient} />} />
                      <Route path="/privacy" element={<PrivacyCenter data={data} patient={patient} updatePatient={updatePatient} onAccountDeleted={onLogout} />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  )}

                  {role === "doctor" && (
                    <Routes>
                      <Route path="/doctor" element={<DoctorPatientsList data={data} onSelect={(pid) => goTo("patients", { patientId: pid })} />} />
                      <Route path="/doctor/patients/:patientId" element={<DoctorDetailRoute data={data} setData={setData} onBack={() => navigate("/doctor")} />} />
                      <Route path="/doctor/availability" element={<DoctorAvailability data={data} setData={setData} />} />
                      <Route path="/doctor/profile" element={<DoctorProfile data={data} setData={setData} />} />
                      <Route path="/doctor/settings" element={<DoctorProfile data={data} setData={setData} />} />
                      <Route path="*" element={<Navigate to="/doctor" replace />} />
                    </Routes>
                  )}

                  {role === "caregiver" && (
                    <Routes>
                      <Route path="/caregiver" element={<CaregiverHub data={data} offlineDemo={offlineDemo} />} />
                      <Route path="/settings" element={<SettingsPage data={data} setData={setData} patient={settingsPatientFallback} updatePatient={updatePatient} />} />
                      <Route path="*" element={<Navigate to="/caregiver" replace />} />
                    </Routes>
                  )}
                </div>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <MobileTabBar role={role} activeId={activeId} onSelect={(id) => goTo(id)} moreActive={moreActive} onMoreClick={() => setMoreOpen(true)} unread={unread} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} role={role} activeId={activeId} onSelect={(id) => goTo(id)} onLogout={onLogout} />
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
  const [authChecking, setAuthChecking] = useState(true);
  const navigate = useNavigate();

  // Verify existing server JWT or explicit dev offline demo session on startup
  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        if (token) {
          try {
            const user = await whoAmI();
            if (user) {
              const savedRaw = await window.storage.get(SESSION_KEY, false).catch(() => null);
              const saved = savedRaw ? JSON.parse(savedRaw.value) : null;
              setSession({
                loggedIn: true,
                role: user.role,
                name: user.name,
                userId: user.id,
                patientId: saved?.patientId,
                offlineDemo: false,
              });
              setAuthChecking(false);
              return;
            }
          } catch {
            // Token rejected or server offline
            if (getToken()) {
              const cached = getCachedUser();
              if (cached) {
                const savedRaw = await window.storage.get(SESSION_KEY, false).catch(() => null);
                const saved = savedRaw ? JSON.parse(savedRaw.value) : null;
                setSession({
                  loggedIn: true,
                  role: cached.role,
                  name: cached.name,
                  userId: cached.id,
                  patientId: saved?.patientId,
                  offlineDemo: false,
                });
                setAuthChecking(false);
                return;
              }
            }
          }
        }

        if (ALLOW_DEMO) {
          const s = await window.storage.get(SESSION_KEY, false).catch(() => null);
          const parsed = s ? JSON.parse(s.value) : null;
          if (parsed?.loggedIn && parsed?.offlineDemo) {
            setSession(parsed);
          }
        }
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  const handleAuthenticated = async (user, { isNewRegistration } = {}) => {
    let workingData = data;
    try {
      const remote = await remoteGet(STORAGE_KEY);
      if (remote?.value) {
        workingData = JSON.parse(remote.value);
      }
    } catch {
      // No server state saved yet for this user
    }

    let resolvedPatientId;
    if (user.role === "patient") {
      const isAlexDemo = ALLOW_DEMO && user.email?.toLowerCase() === "alex@medisense.demo";
      if (!workingData || (isNewRegistration && !isAlexDemo)) {
        const seed = buildSeedData();
        const fresh = emptyPatient(user.name, user.id, user.email);
        workingData = { ...seed, patients: [fresh] };
        resolvedPatientId = fresh.id;
      } else {
        const matched = workingData.patients?.find((p) => p.id === user.id || p.email?.toLowerCase() === user.email?.toLowerCase());
        if (matched) {
          resolvedPatientId = matched.id;
        } else if (isAlexDemo && workingData.patients?.[0]) {
          resolvedPatientId = workingData.patients[0].id;
        } else {
          const fresh = emptyPatient(user.name, user.id, user.email);
          workingData = { ...workingData, patients: [fresh, ...(workingData.patients || [])] };
          resolvedPatientId = fresh.id;
        }
      }
      await setData(workingData);
      try { await remoteSet(STORAGE_KEY, JSON.stringify(workingData)); } catch {}
    } else if (workingData !== data && workingData) {
      await setData(workingData);
    }

    const sess = {
      loggedIn: true,
      role: user.role,
      name: user.name,
      userId: user.id,
      patientId: resolvedPatientId,
      offlineDemo: false,
    };
    setSession(sess);
    try { await window.storage.set(SESSION_KEY, JSON.stringify(sess), false); } catch {}
    navigate(user.role === "doctor" ? "/doctor" : user.role === "caregiver" ? "/caregiver" : "/");
    toast(`Welcome, ${user.name}`);
  };

  const handleOfflineDemo = async (role) => {
    if (!ALLOW_DEMO) return;
    const sess = role === "patient"
      ? { loggedIn: true, role: "patient", patientId: data.patients[0].id, offlineDemo: true }
      : { loggedIn: true, role: "doctor", offlineDemo: true };
    setSession(sess);
    try { await window.storage.set(SESSION_KEY, JSON.stringify(sess), false); } catch {}
    navigate(role === "doctor" ? "/doctor" : "/");
    toast(role === "doctor" ? `Offline demo: ${data.doctor.name}` : "Offline patient demo enabled");
  };

  const handleLogout = async () => {
    await apiLogout();
    setSession(null);
    try { await window.storage.set(SESSION_KEY, JSON.stringify(null), false); } catch {}
    navigate("/");
  };

  if (loading || authChecking || !data) {
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
          <LoginPage onAuthenticated={handleAuthenticated} onOfflineDemo={ALLOW_DEMO ? handleOfflineDemo : undefined} />
        ) : (
          <AppShell data={data} setData={setData} session={session} onLogout={handleLogout} />
        )}
      </div>
    </ThemeProvider>
  );
}
