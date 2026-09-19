import React, { useState } from "react";
import { Wifi, WifiOff, ShieldCheck, Download, Trash2, Smartphone, Watch, Activity as ActivityIcon, Droplets, Gauge, ArrowRight } from "lucide-react";
import { register as apiRegister, login as apiLogin, logout as apiLogout, isConnected as isAccountConnected, getCachedUser, remoteGet, remoteSet } from "../apiStorage.js";
import { COLORS, Card, Heading, Field, ThemeToggle, SegmentedControl, useTheme, ConfirmButton, toast, STORAGE_KEY, uid, todayISO } from "../shared.jsx";

/* =========================================================================
   Profile · Settings · Privacy
   The original PatientProfile is split into three focused screens per the
   new secondary navigation, and Health Profile / Goals / Data Sources /
   Privacy controls are added on top of the existing fields.
   ========================================================================= */

async function syncAccountData(setData, currentData) {
  try {
    const remote = await remoteGet(STORAGE_KEY);
    const parsed = JSON.parse(remote.value);
    await setData(parsed);
    toast("Synced your data from your account");
  } catch {
    try {
      await remoteSet(STORAGE_KEY, JSON.stringify(currentData));
      toast("Your data is now backed up to your account");
    } catch {
      toast("Signed in, but couldn't reach the server to sync yet", "warning");
    }
  }
}

export function AccountSyncCard({ data, setData }) {
  const [connected, setConnected] = useState(isAccountConnected());
  const [user, setUser] = useState(getCachedUser());
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!email || !password || (mode === "register" && !name)) { setError("Please fill in every field."); return; }
    setBusy(true);
    try {
      const account = mode === "register" ? await apiRegister(name, email, password) : await apiLogin(email, password);
      setUser(account);
      setConnected(true);
      setEmail(""); setPassword(""); setName("");
      await syncAccountData(setData, data);
    } catch (e) {
      setError(e.message?.includes("fetch") || e.message?.includes("Failed") ? "Can't reach the MediSense server — is it running?" : e.message || "Something went wrong.");
    }
    setBusy(false);
  };

  const disconnect = () => {
    apiLogout();
    setConnected(false);
    setUser(null);
    toast("Disconnected from your account", "warning");
  };

  return (
    <Card className="p-5 max-w-2xl mb-5">
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold text-[15px]">Account Sync</div>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full" style={{ background: connected ? COLORS.successSoft : COLORS.warningSoft, color: connected ? COLORS.success : COLORS.amber }}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />} {connected ? "Connected" : "Local only"}
        </span>
      </div>
      <p className="text-[12.5px] mb-4" style={{ color: COLORS.inkSoft }}>
        {connected
          ? `Signed in as ${user?.email || "your account"}. Your data backs up to the MediSense server automatically.`
          : "Create a free account to back up your data and pick up where you left off on another phone or computer."}
      </p>
      {connected ? (
        <button onClick={disconnect} className="text-[13px] font-medium px-4 py-2.5 rounded-full border" style={{ borderColor: COLORS.hair, color: COLORS.coral }}>Disconnect this device</button>
      ) : (
        <div>
          <div className="flex mb-3 rounded-[14px] p-1 gap-1" style={{ background: COLORS.mint }}>
            {["login", "register"].map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                className="flex-1 text-[13px] font-medium py-2 rounded-[10px]"
                style={{ background: mode === m ? COLORS.card : "transparent", color: mode === m ? COLORS.primaryDark : COLORS.inkSoft }}>
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <div className="space-y-2.5">
            {mode === "register" && <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />}
            <Field label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" />
            <Field label="Password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" type="password" />
          </div>
          {error && <div className="text-[12.5px] mt-2" style={{ color: COLORS.coral }}>{error}</div>}
          <button onClick={submit} disabled={busy}
            className="text-[13px] font-medium px-4 py-2.5 rounded-full text-white mt-3 disabled:opacity-50"
            style={{ background: COLORS.primary }}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in & sync" : "Create account & sync"}
          </button>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------- profile -------------------------------- */

export function ProfileHub({ data, setData, patient, updatePatient }) {
  const [form, setForm] = useState(patient);
  const [goals, setGoals] = useState(patient.goals || {});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setGoal = (k) => (e) => setGoals((g) => ({ ...g, [k]: e.target.value }));
  const save = async () => { await updatePatient(patient.id, (p) => ({ ...p, ...form, goals })); toast("Profile updated"); };

  return (
    <div>
      <Heading size={26} className="mb-1">Profile</Heading>
      <p className="text-[13px] mb-6" style={{ color: COLORS.inkSoft }}>Your personal and health details.</p>

      <Card className="p-5 mb-5 max-w-2xl">
        <div className="font-semibold text-[15px] mb-4">Personal</div>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Name" value={form.name} onChange={set("name")} />
          <Field label="Date of birth" value={form.dob} onChange={set("dob")} type="date" />
          <Field label="Sex" value={form.sex} onChange={set("sex")} />
          <Field label="Age" value={form.age} onChange={set("age")} />
          <Field label="Email" value={form.email} onChange={set("email")} />
          <Field label="Phone" value={form.phone} onChange={set("phone")} />
          <div className="md:col-span-2"><Field label="Emergency contact" value={form.emergencyContact} onChange={set("emergencyContact")} /></div>
        </div>
      </Card>

      <Card className="p-5 mb-5 max-w-2xl">
        <div className="font-semibold text-[15px] mb-4">Health Profile</div>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Height (cm)" value={patient.body?.heightCm ?? ""} onChange={() => {}} type="number" />
          <Field label="Weight (kg)" value={patient.healthRecords[patient.healthRecords.length - 1]?.weight ?? ""} onChange={() => {}} type="number" />
          <Field label="Allergies" value={form.allergies} onChange={set("allergies")} />
          <Field label="Conditions" value={form.conditions} onChange={set("conditions")} />
        </div>
        <p className="text-[12px] mt-2" style={{ color: COLORS.inkFaint }}>Weight and height update from the Health module. Allergies and conditions here are a quick summary — manage the full list under Records.</p>
      </Card>

      <Card className="p-5 mb-5 max-w-2xl">
        <div className="font-semibold text-[15px] mb-4">Goals</div>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Daily steps" value={goals.dailySteps ?? ""} onChange={setGoal("dailySteps")} type="number" />
          <Field label="Sleep (hours)" value={goals.sleepHours ?? ""} onChange={setGoal("sleepHours")} type="number" />
          <Field label="Medication adherence (%)" value={goals.adherencePct ?? ""} onChange={setGoal("adherencePct")} type="number" />
          <Field label="Weight target (kg, optional)" value={goals.weightTargetKg ?? ""} onChange={setGoal("weightTargetKg")} type="number" />
        </div>
      </Card>

      <button onClick={save} className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white" style={{ background: COLORS.primary }}>Save changes</button>
    </div>
  );
}

/* -------------------------------- settings -------------------------------- */

export function SettingsPage({ data, setData, patient, updatePatient }) {
  const { textSize, setTextSize, contrast, setContrast } = useTheme();
  const prefs = patient.settings || data.settings?.notificationPrefs || { medication: true, health: true, appointments: true, system: true };
  const setPref = async (k) => {
    await updatePatient(patient.id, (p) => ({ ...p, notificationPrefs: { ...(p.notificationPrefs || prefs), [k]: !(p.notificationPrefs || prefs)[k] } }));
  };
  const current = patient.notificationPrefs || prefs;

  return (
    <div>
      <Heading size={26} className="mb-1">Settings</Heading>
      <p className="text-[13px] mb-6" style={{ color: COLORS.inkSoft }}>Appearance, notifications, and your account.</p>

      <Card className="p-5 max-w-2xl mb-5">
        <div className="font-semibold text-[15px] mb-4">Appearance</div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[14px] font-medium">Dark mode</div>
            <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>Switches the whole app, including charts and cards.</div>
          </div>
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <div className="text-[14px] font-medium">Text size</div>
            <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>Scales text throughout MediSense.</div>
          </div>
          <SegmentedControl options={[{ value: "normal", label: "Default" }, { value: "large", label: "Large" }, { value: "larger", label: "Larger" }]} value={textSize} onChange={setTextSize} />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[14px] font-medium">High contrast</div>
            <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>Stronger borders and text, without relying on color alone.</div>
          </div>
          <SegmentedControl options={[{ value: "normal", label: "Off" }, { value: "high", label: "On" }]} value={contrast} onChange={setContrast} />
        </div>
      </Card>

      <Card className="p-5 max-w-2xl mb-5">
        <div className="font-semibold text-[15px] mb-4">Notification preferences</div>
        <div className="space-y-3">
          {[{ k: "medication", label: "Medication reminders", body: "Upcoming, missed, and late doses" },
            { k: "health", label: "Health alerts", body: "Significant changes and trend alerts" },
            { k: "appointments", label: "Appointments", body: "Upcoming visits and follow-up reminders" },
            { k: "system", label: "System", body: "Account and app updates" }].map((n) => (
            <label key={n.k} className="flex items-center justify-between">
              <div><div className="text-[14px] font-medium">{n.label}</div><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{n.body}</div></div>
              <input type="checkbox" checked={current[n.k] !== false} onChange={() => setPref(n.k)} className="w-5 h-5" style={{ accentColor: COLORS.primary }} />
            </label>
          ))}
        </div>
      </Card>

      <AccountSyncCard data={data} setData={setData} />
      <Card className="p-5 max-w-2xl mb-5">
        <div className="font-semibold text-[15px] mb-2">Your doctor</div>
        <div className="text-[13.5px]">{data.doctor.name} · {data.doctor.specialty}</div>
        <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>{data.doctor.email}</div>
      </Card>
    </div>
  );
}

/* -------------------------------- privacy -------------------------------- */

const SOURCE_ICON = { manual: Smartphone, wearable: Watch, bp_monitor: Gauge, glucose_monitor: Droplets, pulse_ox: ActivityIcon };

export function PrivacyCenter({ patient, updatePatient, data }) {
  const shares = patient.healthShares || [];
  const sources = patient.dataSources || [];
  const revoke = async (id) => { await updatePatient(patient.id, (p) => ({ ...p, healthShares: p.healthShares.filter((s) => s.id !== id) })); toast("Access revoked", "warning"); };
  const SIMULATED_PATCH = {
    bp_monitor: { systolic: 118 + Math.round(Math.random() * 8), diastolic: 76 + Math.round(Math.random() * 6) },
    glucose_monitor: { glucose: 95 + Math.round(Math.random() * 20) },
    pulse_ox: { bloodOxygen: 96 + Math.round(Math.random() * 3) },
  };
  const toggleSource = async (id) => {
    const source = sources.find((s) => s.id === id);
    const willConnect = !source.connected;
    await updatePatient(patient.id, (p) => {
      const dataSources = p.dataSources.map((s) => (s.id === id ? { ...s, connected: willConnect, lastSync: willConnect ? todayISO() : s.lastSync } : s));
      if (!willConnect || !SIMULATED_PATCH[source.type]) return { ...p, dataSources };
      // Demonstrates the ingestion pipeline end-to-end: Data Source → central
      // health record, clearly tagged as simulated (never presented as real).
      const today = todayISO();
      const existing = p.healthRecords.find((r) => r.date === today);
      const patch = { ...SIMULATED_PATCH[source.type], source: `${source.name} (simulated)` };
      const healthRecords = existing
        ? p.healthRecords.map((r) => (r.date === today ? { ...r, ...patch } : r))
        : [...p.healthRecords, { id: uid(), date: today, ...patch }];
      return { ...p, dataSources, healthRecords };
    });
    if (willConnect && SIMULATED_PATCH[source.type]) toast(`${source.name} connected — added one simulated reading to demonstrate ingestion`);
    else toast(willConnect ? `${source.name} connected` : `${source.name} disconnected`, willConnect ? "success" : "warning");
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(patient, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `MediSense_${patient.name.replace(/\s+/g, "_")}_export.json`; a.click();
    URL.revokeObjectURL(url);
    toast("Health data exported");
  };
  const deleteAllData = async () => {
    await updatePatient(patient.id, (p) => ({ ...p, logs: [], healthRecords: [], activity: [], sleep: [], nutrition: [], hydration: [], mobility: [], mentalWellbeing: [], workouts: [] }));
    toast("Local health data cleared", "warning");
  };

  return (
    <div>
      <Heading size={26} className="mb-1">Privacy Center</Heading>
      <p className="text-[13px] mb-6" style={{ color: COLORS.inkSoft }}>Manage who can see your data, connected devices, and your own copy of your records.</p>

      <Card className="p-5 mb-5">
        <div className="flex items-center gap-2 mb-4"><ShieldCheck size={16} color={COLORS.primary} /><span className="font-semibold text-[15px]">Connected doctors & caregivers</span></div>
        {shares.length === 0 ? (
          <p className="text-[13.5px]" style={{ color: COLORS.inkSoft }}>No one has shared access beyond your care team's default view.</p>
        ) : shares.map((s) => (
          <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
            <div><div className="text-[14px] font-medium">{s.granteeName}</div><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{Object.entries(s.categories).filter(([, v]) => v).map(([k]) => k).join(", ") || "No categories shared"}</div></div>
            <ConfirmButton onConfirm={() => revoke(s.id)} label="Revoke" confirmLabel="Revoke" variant="text" />
          </div>
        ))}
        <p className="text-[12px] mt-3" style={{ color: COLORS.inkFaint }}>Manage detailed category permissions under Care → Shared Health Data.</p>
      </Card>

      <Card className="p-5 mb-5">
        <div className="font-semibold text-[15px] mb-3">Connected devices & data sources</div>
        <div className="flex items-center gap-1 flex-wrap mb-4 text-[11px] font-medium" style={{ color: COLORS.inkFaint }}>
          {["Data source", "Ingestion", "Normalization", "Central health record", "Dashboard, Trends & Insights"].map((stage, i, arr) => (
            <React.Fragment key={stage}>
              <span className="px-2.5 py-1 rounded-full" style={{ background: COLORS.surface2 }}>{stage}</span>
              {i < arr.length - 1 && <ArrowRight size={11} style={{ flexShrink: 0 }} />}
            </React.Fragment>
          ))}
        </div>
        <div className="space-y-2">
          {sources.map((s) => {
            const Icon = SOURCE_ICON[s.type] || Smartphone;
            return (
              <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
                <div className="flex items-center gap-3">
                  <Icon size={16} color={s.connected ? COLORS.primary : COLORS.inkFaint} />
                  <div><div className="text-[14px] font-medium">{s.name}</div><div className="text-[12px]" style={{ color: COLORS.inkSoft }}>{s.connected ? `Last synced ${s.lastSync}` : "Not connected"}</div></div>
                </div>
                {s.type === "manual" ? (
                  <span className="text-[12px] font-medium px-2.5 py-1 rounded-full" style={{ background: COLORS.successSoft, color: COLORS.success }}>Always on</span>
                ) : (
                  <button onClick={() => toggleSource(s.id)} className="text-[12.5px] font-medium px-3 py-1.5 rounded-full border" style={{ borderColor: COLORS.hair, color: s.connected ? COLORS.coral : COLORS.primary }}>{s.connected ? "Disconnect" : "Connect"}</button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[12px] mt-3" style={{ color: COLORS.inkFaint }}>MediSense does not simulate real device connectivity — connecting here marks a source as available for future data ingestion.</p>
      </Card>

      <Card className="p-5 mb-5">
        <div className="font-semibold text-[15px] mb-4">Your data</div>
        <div className="flex flex-wrap gap-3">
          <button onClick={exportData} className="flex items-center gap-1.5 text-[13.5px] font-medium px-4 py-2.5 rounded-full border" style={{ borderColor: COLORS.hair, color: COLORS.primaryDark }}><Download size={14} /> Export health data</button>
          <ConfirmButton variant="text" label="Delete local health data" confirmLabel="Yes, delete" onConfirm={deleteAllData} className="px-4 py-2.5" />
        </div>
      </Card>
    </div>
  );
}
