import React, { useEffect, useState } from "react";
import {
  Wifi, WifiOff, ShieldCheck, Download, Smartphone, Watch, Activity as ActivityIcon,
  Droplets, Gauge, ArrowRight, Bell, History, AlertTriangle, User, ChevronRight,
  Lock, Eye, Database, Settings2,
} from "lucide-react";
import {
  register as apiRegister, login as apiLogin, logout as apiLogout, isConnected as isAccountConnected,
  getCachedUser, remoteGet, remoteSet, exportAllData, getPrivacySummary, updateConsent, deleteAccount,
} from "../apiStorage.js";
import {
  getNotificationPermission, enableNotificationsAndPush, disablePushNotifications, triggerTestNotification,
} from "../lib/pushNotifications.js";
import {
  COLORS, Card, Heading, Field, ThemeToggle, SegmentedControl, useTheme, ConfirmButton, TrendPill,
  toast, STORAGE_KEY, uid, todayISO, computeBMI, bmiCategory,
} from "../shared.jsx";

/* =========================================================================
   Profile · Settings · Privacy  —  MediSense Redesign
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

/* ------------ shared sub-components ------------- */

function SectionCard({ icon: Icon, title, action, onAction, children, className = "" }) {
  return (
    <div className={`rounded-[20px] border mb-4 ${className}`} style={{ background: COLORS.card, borderColor: COLORS.hair, boxShadow: COLORS.cardShadow }}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          {Icon && <span className="w-7 h-7 rounded-[10px] flex items-center justify-center" style={{ background: COLORS.mint }}><Icon size={15} color={COLORS.primaryDark} /></span>}
          <span className="font-semibold text-[15px]" style={{ color: COLORS.ink }}>{title}</span>
        </div>
        {onAction && (
          <button onClick={onAction} className="text-[12.5px] font-medium px-3 py-1.5 rounded-[10px]" style={{ color: COLORS.primary, background: COLORS.mint }}>
            {action || "Edit"}
          </button>
        )}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, control }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
      <div className="pr-4 min-w-0">
        <div className="text-[14px] font-medium" style={{ color: COLORS.ink }}>{label}</div>
        {description && <div className="text-[12px] mt-0.5 leading-snug" style={{ color: COLORS.inkSoft }}>{description}</div>}
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );
}

function AvatarCircle({ name, size = 80 }) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold select-none flex-shrink-0"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark || "#085A5E"})`,
        color: "white",
        fontSize: size * 0.32,
        boxShadow: "0 4px 14px rgba(13,115,119,0.30)",
      }}
    >
      {initials}
    </div>
  );
}

/* ------------ AccountSyncCard ------------- */

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
      const account = mode === "register"
        ? await apiRegister(name, email, password, { role: "patient", acceptConsent: true })
        : await apiLogin(email, password);
      setUser(account);
      setConnected(true);
      setEmail(""); setPassword(""); setName("");
      await syncAccountData(setData, data);
    } catch (e) {
      setError(e.message?.includes("fetch") || e.message?.includes("Failed") ? "Can't reach the MediSense server — is it running?" : e.message || "Something went wrong.");
    }
    setBusy(false);
  };

  const disconnect = async () => {
    await apiLogout();
    setConnected(false);
    setUser(null);
    toast("Disconnected from your account", "warning");
  };

  return (
    <SectionCard icon={Wifi} title="Account Sync" action={connected ? "Disconnect" : undefined} onAction={connected ? disconnect : undefined}>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full"
          style={{ background: connected ? COLORS.successSoft : COLORS.warningSoft, color: connected ? COLORS.success : COLORS.amber }}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />} {connected ? "Connected" : "Local only"}
        </span>
      </div>
      <p className="text-[12.5px] mb-4" style={{ color: COLORS.inkSoft }}>
        {connected
          ? `Signed in as ${user?.email || "your account"}. Your data backs up to the MediSense server automatically.`
          : "Create a free account to back up your data and pick up where you left off on another device."}
      </p>
      {!connected && (
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
    </SectionCard>
  );
}

/* ------------ ProfileHub ------------- */

export function ProfileHub({ data, setData, patient, updatePatient }) {
  const latestWeight = (patient.healthRecords || []).filter((r) => r.weight != null).slice(-1)[0]?.weight ?? "";
  const [form, setForm] = useState(patient);
  const [goals, setGoals] = useState(patient.goals || {});
  const [heightCm, setHeightCm] = useState(patient.body?.heightCm != null ? String(patient.body.heightCm) : "");
  const [weightKg, setWeightKg] = useState(latestWeight !== "" ? String(latestWeight) : "");
  const [editSection, setEditSection] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setGoal = (k) => (e) => setGoals((g) => ({ ...g, [k]: e.target.value }));

  const liveBmi = computeBMI(Number(weightKg), Number(heightCm));
  const liveBmiInfo = bmiCategory(liveBmi);

  const save = async () => {
    const h = heightCm ? Number(heightCm) : null;
    const w = weightKg ? Number(weightKg) : null;
    const stepsNum = goals.dailySteps ? Number(goals.dailySteps) : goals.steps ? Number(goals.steps) : undefined;
    const nextGoals = {
      ...goals,
      dailySteps: stepsNum ?? goals.dailySteps,
      steps: stepsNum ?? goals.steps,
      sleepHours: goals.sleepHours ? Number(goals.sleepHours) : goals.sleepHours,
    };

    await updatePatient(patient.id, (p) => {
      let healthRecords = p.healthRecords || [];
      let history = p.body?.history || [];
      if (w != null && !Number.isNaN(w) && w > 0 && w !== latestWeight) {
        const today = todayISO();
        const exists = healthRecords.some((r) => r.date === today);
        healthRecords = exists
          ? healthRecords.map((r) => (r.date === today ? { ...r, weight: w } : r))
          : [...healthRecords, { id: uid(), date: today, weight: w }];
        history = [...history, { id: uid(), date: today, weightKg: w }];
      }
      return {
        ...p,
        ...form,
        goals: nextGoals,
        healthRecords,
        body: { ...(p.body || {}), heightCm: h, history },
      };
    });
    toast("Profile updated");
    setEditSection(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-7 p-5 rounded-[20px]" style={{ background: `linear-gradient(135deg, ${COLORS.primary}10, ${COLORS.mint})` }}>
        <AvatarCircle name={patient.name} size={72} />
        <div>
          <div className="font-bold text-[22px]" style={{ color: COLORS.ink }}>{patient.name || "Your Name"}</div>
          <div className="text-[13px] mt-0.5" style={{ color: COLORS.inkSoft }}>
            {patient.age ? `Age ${patient.age}` : ""}{patient.bloodGroup ? ` · ${patient.bloodGroup}` : ""}{patient.sex ? ` · ${patient.sex}` : ""}
          </div>
          {liveBmi != null && liveBmiInfo && (
            <div className="mt-1.5"><TrendPill direction={liveBmiInfo.tone} label={`BMI ${liveBmi} · ${liveBmiInfo.label}`} /></div>
          )}
        </div>
      </div>

      {/* Personal Info */}
      <SectionCard icon={User} title="Personal Info" action={editSection === "personal" ? "Done" : "Edit"} onAction={() => setEditSection(editSection === "personal" ? null : "personal")}>
        {editSection === "personal" ? (
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Name" value={form.name || ""} onChange={set("name")} />
            <Field label="Date of birth" value={form.dob || ""} onChange={set("dob")} type="date" />
            <Field label="Sex" value={form.sex || ""} onChange={set("sex")} />
            <Field label="Age" value={form.age || ""} onChange={set("age")} />
            <Field label="Email" value={form.email || ""} onChange={set("email")} />
            <Field label="Phone" value={form.phone || ""} onChange={set("phone")} />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3 text-[13.5px]">
            {[["Name", patient.name], ["Date of birth", patient.dob], ["Sex", patient.sex], ["Age", patient.age], ["Email", patient.email], ["Phone", patient.phone]].map(([label, val]) => (
              val ? <div key={label}><span className="font-medium">{label}:</span> <span style={{ color: COLORS.inkSoft }}>{val}</span></div> : null
            ))}
          </div>
        )}
      </SectionCard>

      {/* Medical Profile */}
      <SectionCard icon={ActivityIcon} title="Medical Profile" action={editSection === "medical" ? "Done" : "Edit"} onAction={() => setEditSection(editSection === "medical" ? null : "medical")}>
        {editSection === "medical" ? (
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Blood group" value={form.bloodGroup || ""} onChange={set("bloodGroup")} placeholder="e.g. O+" />
            <Field label="Allergies" value={form.allergies || ""} onChange={set("allergies")} />
            <Field label="Conditions" value={form.conditions || ""} onChange={set("conditions")} />
            <Field label="Height (cm)" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} type="number" />
            <Field label="Weight (kg)" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} type="number" step="0.1" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3 text-[13.5px]">
            {[["Blood group", patient.bloodGroup], ["Allergies", patient.allergies], ["Conditions", patient.conditions], ["Height", patient.body?.heightCm ? `${patient.body.heightCm} cm` : null], ["Weight", latestWeight ? `${latestWeight} kg` : null]].map(([label, val]) => (
              val ? <div key={label}><span className="font-medium">{label}:</span> <span style={{ color: COLORS.inkSoft }}>{val}</span></div> : null
            ))}
          </div>
        )}
        <p className="text-[12px] mt-3" style={{ color: COLORS.inkFaint }}>Height and weight updates sync your BMI across the Health module.</p>
      </SectionCard>

      {/* Emergency Contact */}
      <SectionCard icon={Bell} title="Emergency Contact" action={editSection === "emergency" ? "Done" : "Edit"} onAction={() => setEditSection(editSection === "emergency" ? null : "emergency")}>
        {editSection === "emergency" ? (
          <Field label="Emergency contact" value={typeof form.emergencyContact === "string" ? form.emergencyContact : (form.emergencyContact?.name ? `${form.emergencyContact.name}${form.emergencyContact.phone ? ` (${form.emergencyContact.phone})` : ""}` : "")} onChange={set("emergencyContact")} />
        ) : (
          <div className="text-[13.5px]" style={{ color: COLORS.inkSoft }}>
            {typeof patient.emergencyContact === "string"
              ? patient.emergencyContact || "Not set"
              : patient.emergencyContact?.name
                ? `${patient.emergencyContact.name}${patient.emergencyContact.phone ? ` · ${patient.emergencyContact.phone}` : ""}`
                : "Not set"}
          </div>
        )}
      </SectionCard>

      {/* Goals */}
      <SectionCard icon={ChevronRight} title="Health Goals" action={editSection === "goals" ? "Done" : "Edit"} onAction={() => setEditSection(editSection === "goals" ? null : "goals")}>
        {editSection === "goals" ? (
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Daily steps" value={goals.dailySteps ?? goals.steps ?? ""} onChange={setGoal("dailySteps")} type="number" />
            <Field label="Sleep (hours)" value={goals.sleepHours ?? ""} onChange={setGoal("sleepHours")} type="number" />
            <Field label="Medication adherence (%)" value={goals.adherencePct ?? ""} onChange={setGoal("adherencePct")} type="number" />
            <Field label="Weight target (kg)" value={goals.weightTargetKg ?? ""} onChange={setGoal("weightTargetKg")} type="number" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3 text-[13.5px]">
            {[["Daily steps", patient.goals?.dailySteps ?? patient.goals?.steps], ["Sleep", patient.goals?.sleepHours ? `${patient.goals.sleepHours}h` : null], ["Adherence target", patient.goals?.adherencePct ? `${patient.goals.adherencePct}%` : null], ["Weight target", patient.goals?.weightTargetKg ? `${patient.goals.weightTargetKg} kg` : null]].map(([label, val]) => (
              val ? <div key={label}><span className="font-medium">{label}:</span> <span style={{ color: COLORS.inkSoft }}>{val}</span></div> : null
            ))}
          </div>
        )}
      </SectionCard>

      <button onClick={save} className="text-[13.5px] font-medium px-5 py-3 rounded-[12px] text-white" style={{ background: COLORS.primary }}>
        Save all changes
      </button>
    </div>
  );
}

/* ------------ SettingsPage ------------- */

export function SettingsPage({ data, setData, patient, updatePatient }) {
  const { textSize, setTextSize, contrast, setContrast } = useTheme();
  const prefs = patient.settings || data.settings?.notificationPrefs || { medication: true, health: true, appointments: true, system: true };
  const setPref = async (k) => {
    await updatePatient(patient.id, (p) => ({ ...p, notificationPrefs: { ...(p.notificationPrefs || prefs), [k]: !(p.notificationPrefs || prefs)[k] } }));
  };
  const current = patient.notificationPrefs || prefs;
  const primaryDoctor = data.doctor || data.doctors?.[0];

  const [perm, setPerm] = useState(() => getNotificationPermission());
  const [pushBusy, setPushBusy] = useState(false);

  const enablePush = async () => {
    setPushBusy(true);
    try {
      const res = await enableNotificationsAndPush();
      setPerm(getNotificationPermission());
      if (res.mode === "web-push") toast("Web Push reminders enabled on server");
      else toast("Browser notifications enabled for foreground reminders");
    } catch (err) {
      setPerm(getNotificationPermission());
      toast(err.message || "Could not enable notifications", "warning");
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      await disablePushNotifications();
      toast("Push subscription removed", "warning");
    } finally {
      setPushBusy(false);
    }
  };

  const testPush = async () => {
    try {
      await triggerTestNotification("MediSense test reminder: Time for your scheduled dose check.");
      toast("Test notification triggered");
    } catch (err) {
      toast(err.message || "Could not send test notification", "warning");
    }
  };

  const permColor = perm === "granted" ? COLORS.success : perm === "denied" ? COLORS.coral : COLORS.amber;
  const permBg = perm === "granted" ? COLORS.successSoft : perm === "denied" ? COLORS.dangerSoft : COLORS.warningSoft;
  const permLabel = perm === "granted" ? "Allowed" : perm === "denied" ? "Blocked" : perm === "unsupported" ? "Unsupported" : "Not yet enabled";

  return (
    <div>
      <Heading size={26} className="mb-1">Settings</Heading>
      <p className="text-[13px] mb-6" style={{ color: COLORS.inkSoft }}>Appearance, notifications, and your account.</p>

      {/* Appearance */}
      <SectionCard icon={Eye} title="Appearance">
        <SettingRow
          label="Dark mode"
          description="Switches the whole app, including charts and cards."
          control={<ThemeToggle />}
        />
        <SettingRow
          label="Text size"
          description="Scales text throughout MediSense."
          control={<SegmentedControl options={[{ value: "normal", label: "Default" }, { value: "large", label: "Large" }, { value: "larger", label: "Larger" }]} value={textSize} onChange={setTextSize} />}
        />
        <SettingRow
          label="High contrast"
          description="Stronger borders and text, without relying on color alone."
          control={<SegmentedControl options={[{ value: "normal", label: "Off" }, { value: "high", label: "On" }]} value={contrast} onChange={setContrast} />}
        />
      </SectionCard>

      {/* Notifications */}
      <SectionCard icon={Bell} title="Notifications">
        {[{ k: "medication", label: "Medication reminders", body: "Upcoming, missed, and late doses" },
          { k: "health", label: "Health alerts", body: "Significant changes and trend alerts" },
          { k: "appointments", label: "Appointments", body: "Upcoming visits and follow-up reminders" },
          { k: "system", label: "System", body: "Account and app updates" }].map((n) => (
          <SettingRow key={n.k} label={n.label} description={n.body} control={
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={current[n.k] !== false} onChange={() => setPref(n.k)} className="sr-only peer" />
              <div className="w-10 h-6 rounded-full peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:transition-all"
                style={{ background: current[n.k] !== false ? COLORS.primary : COLORS.hair, position: "relative" }}>
                <div className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: current[n.k] !== false ? "calc(100% - 20px)" : "4px" }} />
              </div>
            </label>
          } />
        ))}
      </SectionCard>

      {/* Push reminders */}
      <SectionCard icon={Bell} title="Browser & Push Reminders">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[12px] font-medium px-2.5 py-1 rounded-full" style={{ background: permBg, color: permColor }}>{permLabel}</span>
        </div>
        <p className="text-[12.5px] mb-4" style={{ color: COLORS.inkSoft }}>
          Receive dose-time browser reminders while MediSense is open, plus optional background Web Push notifications.
        </p>
        <div className="flex flex-wrap gap-2.5">
          {perm !== "granted" ? (
            <button onClick={enablePush} disabled={pushBusy || perm === "unsupported" || perm === "denied"}
              className="text-[13px] font-medium px-4 py-2 rounded-[10px] text-white disabled:opacity-45" style={{ background: COLORS.primary }}>
              {pushBusy ? "Enabling…" : "Enable notifications"}
            </button>
          ) : (
            <>
              <button onClick={enablePush} disabled={pushBusy} className="text-[13px] font-medium px-4 py-2 rounded-[10px] text-white" style={{ background: COLORS.primary }}>
                {pushBusy ? "Syncing…" : "Sync Web Push"}
              </button>
              <button onClick={testPush} className="text-[13px] font-medium px-4 py-2 rounded-[10px] border" style={{ borderColor: COLORS.hair, color: COLORS.primaryDark }}>
                Send test reminder
              </button>
              <button onClick={disablePush} disabled={pushBusy} className="text-[13px] font-medium px-4 py-2 rounded-[10px] border" style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>
                Disable push
              </button>
            </>
          )}
        </div>
      </SectionCard>

      {/* Account sync */}
      <AccountSyncCard data={data} setData={setData} />

      {primaryDoctor && (
        <SectionCard icon={User} title="Your Doctor">
          <div className="text-[13.5px]">{primaryDoctor.name} · {primaryDoctor.specialty}</div>
          <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>{primaryDoctor.email}</div>
        </SectionCard>
      )}
    </div>
  );
}

/* ------------ PrivacyCenter ------------- */

const SOURCE_ICON = { manual: Smartphone, wearable: Watch, bp_monitor: Gauge, glucose_monitor: Droplets, pulse_ox: ActivityIcon };

const DPDP_CONSENTS = [
  { key: "privacy_and_health_processing", label: "Core Health Data Storage", body: "Store and sync medications, vitals, and medical records on your MediSense account." },
  { key: "ai_insights_processing", label: "AI Insights Context", body: "Include summarized metrics when asking questions in Gemini AI Insights." },
  { key: "push_reminders", label: "Medication Push Notifications", body: "Deliver browser reminders for scheduled medication doses." },
];

export function PrivacyCenter({ patient, updatePatient, data, onAccountDeleted }) {
  const shares = patient.healthShares || [];
  const sources = patient.dataSources || [];
  const [privacySummary, setPrivacySummary] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAcc, setDeletingAcc] = useState(false);

  const loadPrivacy = () => {
    if (!isAccountConnected()) return;
    getPrivacySummary()
      .then((res) => setPrivacySummary(res))
      .catch(() => {});
  };

  useEffect(() => { loadPrivacy(); }, []);

  const revoke = async (id) => { await updatePatient(patient.id, (p) => ({ ...p, healthShares: p.healthShares.filter((s) => s.id !== id) })); toast("Access revoked", "warning"); };

  const toggleSource = async (id) => {
    const source = sources.find((s) => s.id === id);
    const willConnect = !source.connected;
    await updatePatient(patient.id, (p) => {
      const dataSources = p.dataSources.map((s) =>
        s.id === id ? { ...s, connected: willConnect, lastSync: willConnect ? todayISO() : s.lastSync } : s
      );
      return { ...p, dataSources };
    });
    toast(willConnect ? `${source.name} connected` : `${source.name} disconnected`, willConnect ? "success" : "warning");
  };

  const toggleConsent = async (consentType, currentlyGranted) => {
    try {
      await updateConsent(consentType, !currentlyGranted);
      toast("Consent preference recorded");
      loadPrivacy();
    } catch (err) {
      toast(err.message || "Could not update consent");
    }
  };

  const exportData = async () => {
    try {
      const payload = isAccountConnected() ? await exportAllData() : patient;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `MediSense_${patient.name.replace(/\s+/g, "_")}_export_${todayISO()}.json`; a.click();
      URL.revokeObjectURL(url);
      toast(isAccountConnected() ? "Full DPDP account export downloaded" : "Local health data exported");
    } catch (err) {
      toast(err.message || "Export failed");
    }
  };

  const deleteAllData = async () => {
    await updatePatient(patient.id, (p) => ({ ...p, logs: [], healthRecords: [], activity: [], sleep: [], nutrition: [], hydration: [], mobility: [], mentalWellbeing: [], workouts: [] }));
    toast("Local health data cleared", "warning");
  };

  const handleEraseAccount = async () => {
    if (!deletePassword) { toast("Enter your account password to confirm permanent deletion", "warning"); return; }
    setDeletingAcc(true);
    try {
      await deleteAccount(deletePassword);
      setDeletePassword("");
      toast("Account and server data permanently deleted", "warning");
      onAccountDeleted?.();
    } catch (err) {
      toast(err.message || "Could not delete account");
    } finally {
      setDeletingAcc(false);
    }
  };

  const latestConsentMap = {};
  (privacySummary?.consents || []).forEach((c) => {
    if (!latestConsentMap[c.consent_type]) latestConsentMap[c.consent_type] = Boolean(c.granted);
  });

  return (
    <div>
      {/* Header banner */}
      <div className="rounded-[20px] mb-6 p-5 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${COLORS.primary}15, ${COLORS.mint})` }}>
        <div className="w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0" style={{ background: COLORS.primary }}>
          <ShieldCheck size={24} color="white" />
        </div>
        <div>
          <div className="font-bold text-[18px]" style={{ color: COLORS.ink }}>Your Data Rights</div>
          <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>Manage shared access, DPDP consents, and data export or erasure rights.</div>
        </div>
      </div>

      {/* Connected doctors & caregivers */}
      <SectionCard icon={ShieldCheck} title="Connected Doctors & Caregivers">
        {shares.length === 0 ? (
          <p className="text-[13.5px]" style={{ color: COLORS.inkSoft }}>No one has shared access beyond your care team's default view.</p>
        ) : shares.map((s) => (
          <div key={s.id} className="flex items-center justify-between py-3 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
            <div>
              <div className="text-[14px] font-medium">{s.granteeName}</div>
              <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{Object.entries(s.categories).filter(([, v]) => v).map(([k]) => k).join(", ") || "No categories shared"}</div>
            </div>
            <ConfirmButton onConfirm={() => revoke(s.id)} label="Revoke" confirmLabel="Revoke" variant="text" />
          </div>
        ))}
        <p className="text-[12px] mt-3" style={{ color: COLORS.inkFaint }}>Manage detailed category permissions under Care → Shared Health Data.</p>
      </SectionCard>

      {/* DPDP Consents */}
      {isAccountConnected() && (
        <SectionCard icon={Lock} title="DPDP Data Consents">
          <p className="text-[12.5px] mb-4" style={{ color: COLORS.inkSoft }}>Every consent grant or withdrawal is timestamped and recorded in your privacy audit log.</p>
          <div className="space-y-3">
            {DPDP_CONSENTS.map((item) => {
              const granted = latestConsentMap[item.key] ?? (item.key === "privacy_and_health_processing");
              return (
                <div key={item.key} className="flex items-start gap-4 p-4 rounded-[14px]" style={{ background: COLORS.surface2 }}>
                  <div className="flex-1">
                    <div className="text-[14px] font-medium">{item.label}</div>
                    <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>{item.body}</div>
                  </div>
                  <label className="flex-shrink-0 cursor-pointer">
                    <input type="checkbox" checked={granted} onChange={() => toggleConsent(item.key, granted)} className="sr-only" />
                    <div className="w-10 h-6 rounded-full relative transition-colors" style={{ background: granted ? COLORS.primary : COLORS.hair }}>
                      <div className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: granted ? "calc(100% - 20px)" : "4px" }} />
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Connected devices */}
      <SectionCard icon={Database} title="Connected Devices & Data Sources">
        <div className="flex items-center gap-1 flex-wrap mb-4 text-[11px] font-medium" style={{ color: COLORS.inkFaint }}>
          {["Data source", "Ingestion", "Normalization", "Central record", "Dashboard"].map((stage, i, arr) => (
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
              <div key={s.id} className="flex items-center justify-between py-3 rounded-[12px] px-3" style={{ background: COLORS.surface2 }}>
                <div className="flex items-center gap-3">
                  <Icon size={16} color={s.connected ? COLORS.primary : COLORS.inkFaint} />
                  <div>
                    <div className="text-[14px] font-medium">{s.name}</div>
                    <div className="text-[12px]" style={{ color: COLORS.inkSoft }}>{s.connected ? `Last synced ${s.lastSync}` : "Not connected"}</div>
                  </div>
                </div>
                {s.type === "manual" ? (
                  <span className="text-[12px] font-medium px-2.5 py-1 rounded-full" style={{ background: COLORS.successSoft, color: COLORS.success }}>Always on</span>
                ) : (
                  <button onClick={() => toggleSource(s.id)} className="text-[12.5px] font-medium px-3 py-1.5 rounded-[10px] border" style={{ borderColor: COLORS.hair, color: s.connected ? COLORS.coral : COLORS.primary }}>
                    {s.connected ? "Disconnect" : "Connect"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Audit log */}
      {isAccountConnected() && (privacySummary?.recentAudit?.length > 0) && (
        <SectionCard icon={History} title="Recent Security & Audit Log">
          <div className="space-y-1.5 max-h-[220px] overflow-y-auto text-[12.5px]">
            {privacySummary.recentAudit.slice(0, 12).map((ev) => (
              <div key={ev.id} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
                <span className="font-medium">{ev.action}</span>
                <span style={{ color: COLORS.inkSoft }}>{ev.created_at?.slice(0, 19).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Data export */}
      <SectionCard icon={Download} title="Your Data">
        <div className="flex flex-wrap gap-3 mb-2">
          <button onClick={exportData} className="flex items-center gap-1.5 text-[13.5px] font-medium px-4 py-2.5 rounded-[12px] text-white" style={{ background: COLORS.primary }}>
            <Download size={14} /> {isAccountConnected() ? "Export full DPDP bundle (JSON)" : "Export health data (JSON)"}
          </button>
          <ConfirmButton variant="text" label="Delete local health data" confirmLabel="Yes, delete" onConfirm={deleteAllData} className="px-4 py-2.5" />
        </div>
        <p className="text-[12px]" style={{ color: COLORS.inkFaint }}>Data is exported as JSON format and downloaded to your device.</p>
      </SectionCard>

      {/* Danger zone */}
      {isAccountConnected() && (
        <div className="rounded-[20px] border-2 p-5 mb-5" style={{ borderColor: COLORS.coral + "40", background: COLORS.dangerSoft }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} color={COLORS.coral} />
            <span className="font-bold text-[15px]" style={{ color: COLORS.coral }}>Danger Zone — Permanent Account Erasure</span>
          </div>
          <p className="text-[12.5px] mb-4" style={{ color: COLORS.inkSoft }}>
            Permanently delete your MediSense account, synced health records, uploaded documents, and caregiver connections. This action cannot be undone under DPDP Right to Erasure.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Field label="Confirm password" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Enter account password" />
            </div>
            <button onClick={handleEraseAccount} disabled={deletingAcc || !deletePassword}
              className="text-[13px] font-medium px-4 py-2.5 rounded-[10px] text-white disabled:opacity-45" style={{ background: COLORS.coral }}>
              {deletingAcc ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </div>
      )}

      {/* DPDP Grievance Officer info card */}
      <div className="rounded-[20px] p-5 mb-5" style={{ background: COLORS.infoSoft, border: `1px solid ${COLORS.info}30` }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={18} color={COLORS.info} />
          <span className="font-semibold text-[14.5px]" style={{ color: COLORS.ink }}>DPDP Act, 2023 — Statutory Rights & Grievance Redressal</span>
        </div>
        <p className="text-[12.5px] mb-3 leading-relaxed" style={{ color: COLORS.inkSoft }}>
          Under the Digital Personal Data Protection Act, 2023, you hold the Right to Access, Right to Correction and Erasure, Right of Grievance Redressal, and Right to Nominate.
        </p>
        <div className="p-4 rounded-[14px]" style={{ background: COLORS.card, border: `1px solid ${COLORS.hair}` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-[13px]" style={{ color: COLORS.ink }}>Data Protection Grievance Officer</span>
            <span className="text-[10.5px] px-2 py-0.5 rounded-full font-medium" style={{ background: COLORS.warningSoft, color: COLORS.amber, border: `1px solid ${COLORS.hair}` }}>
              Pending Configuration
            </span>
          </div>
          <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Designated Desk: MediSense Privacy & Legal Compliance</div>
          <div className="text-[12.5px] mt-1" style={{ color: COLORS.inkSoft }}>
            Contact: <span className="font-mono text-[11.5px]" style={{ color: COLORS.primaryDark }}>{import.meta.env.VITE_DPO_EMAIL || "dpo-compliance@medisense.example"}</span>
          </div>
          <div className="text-[11px] mt-2" style={{ color: COLORS.inkFaint }}>* A confirmed Grievance Redressal Officer must be configured before onboarding live patient data (DPDP Act, 2023 §6).</div>
          <div className="text-[11px] mt-0.5" style={{ color: COLORS.inkFaint }}>Statutory Response SLA: Within 72 business hours for grievance escalations.</div>
        </div>
      </div>
    </div>
  );
}
