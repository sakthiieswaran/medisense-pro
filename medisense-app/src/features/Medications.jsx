import React, { useState, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Pill, TrendingUp, ShieldAlert, ShieldCheck, AlertTriangle, Info, History as HistoryIcon, Sparkles, Clock, CalendarClock } from "lucide-react";
import {
  COLORS, Card, Heading, EmptyState, StatTile, StatusPill, ScheduleTimeline, PinnedCardHeader,
  fmtDate, to12h, addDays, todayISO, dayOfWeek, toast,
} from "../shared.jsx";
import { todaysSchedule, computeAdherence, checkInteraction } from "../data/seed.js";
import { adherenceBreakdown, adherenceTimePattern } from "../data/healthRecords.js";
import { generateInsights, CATEGORIES } from "../data/healthRecords.js";

/* =========================================================================
   Medications hub — Today's Schedule · History · Adherence · Interactions ·
   Insights. All logic here already existed in the app; this module just
   reorganizes it under the new information architecture and pulls
   adherence numbers from the central data layer.
   ========================================================================= */

const TABS = [
  { id: "today", label: "Today's Schedule", icon: Clock },
  { id: "list", label: "Medications", icon: Pill },
  { id: "history", label: "History", icon: HistoryIcon },
  { id: "adherence", label: "Adherence", icon: TrendingUp },
  { id: "interactions", label: "Interactions", icon: ShieldAlert },
  { id: "insights", label: "Insights", icon: Sparkles },
];

function TodaySchedule({ patient, updatePatient }) {
  const schedule = todaysSchedule(patient);
  const logDose = async (row, status) => {
    const t = todayISO();
    const now = new Date();
    const actualTime = status === "Taken" ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : null;
    await updatePatient(patient.id, (p) => {
      const existing = p.logs.find((l) => l.medId === row.medId && l.date === t && l.scheduledTime === row.time);
      let logs;
      if (existing) logs = p.logs.map((l) => (l.id === existing.id ? { ...l, status, actualTime } : l));
      else logs = [...p.logs, { id: row.medId + t + row.time, medId: row.medId, medName: row.name, dosage: row.dosage, date: t, scheduledTime: row.time, actualTime, status }];
      let notifications = p.notifications;
      if (status === "Missed") {
        notifications = [{ id: row.medId + t + row.time + "-n", type: "missed", category: "medication", severity: "warning", message: `${row.name} ${row.dosage} dose at ${to12h(row.time)} was marked Missed.`, date: t, read: false }, ...notifications];
      }
      return { ...p, logs, notifications };
    });
    toast(status === "Taken" ? `${row.name} marked as taken` : `${row.name} marked as missed`, status === "Taken" ? "success" : "warning");
  };

  return (
    <Card className="p-5">
      <PinnedCardHeader icon={Clock} label="Today's Schedule" tint={COLORS.warningSoft} fg={COLORS.amber} meta={`${schedule.length} ${schedule.length === 1 ? "dose" : "doses"}`} />
      {schedule.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nothing scheduled today" body="Your doctor hasn't prescribed any active medications yet." />
      ) : (
        <ScheduleTimeline rows={schedule} onMark={logDose} />
      )}
    </Card>
  );
}

function MedicationsList({ patient }) {
  return patient.medications.length === 0 ? (
    <Card className="p-5"><EmptyState icon={Pill} title="No medicines prescribed yet" body="Your doctor will add medications here after your visit." /></Card>
  ) : (
    <div className="grid md:grid-cols-2 gap-4">
      {patient.medications.map((med) => (
        <Card key={med.id} className="p-5" style={!med.active ? { opacity: 0.55 } : {}}>
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold text-[16px]">{med.name}</div>
              <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{med.genericName}</div>
            </div>
            {!med.active && <span className="text-[11px] font-medium px-2 py-1 rounded-full" style={{ background: COLORS.mint, color: COLORS.primaryDark }}>Paused by doctor</span>}
          </div>
          <div className="text-[14px] mt-3 font-medium">{med.dosage}{med.unit} · {med.frequency}</div>
          <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>Times: {med.times.map(to12h).join(", ")}</div>
          <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>{med.withFood ? "With food" : "Without food"} · {med.instructions}</div>
          {med.notes && <div className="text-[12.5px] mt-1 italic" style={{ color: COLORS.inkFaint }}>{med.notes}</div>}
          <div className="text-[12px] mt-3 pt-3" style={{ borderTop: `1px solid ${COLORS.hair}`, color: COLORS.inkSoft }}>
            Duration: {fmtDate(med.startDate)} {med.endDate ? `→ ${fmtDate(med.endDate)}` : "→ ongoing"}
          </div>
        </Card>
      ))}
    </div>
  );
}

function MedicationHistory({ patient }) {
  const [filterMed, setFilterMed] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const rows = patient.logs
    .filter((l) => l.status !== "Upcoming")
    .filter((l) => (filterMed === "all" ? true : l.medId === filterMed))
    .filter((l) => (filterStatus === "all" ? true : l.status === filterStatus))
    .filter((l) => l.medName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.date + a.scheduledTime < b.date + b.scheduledTime ? 1 : -1));

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicine…" className="px-3 py-2 rounded-[14px] text-[13.5px] border outline-none" style={{ borderColor: COLORS.hair }} />
        <select value={filterMed} onChange={(e) => setFilterMed(e.target.value)} className="px-3 py-2 rounded-[14px] text-[13.5px] border outline-none" style={{ borderColor: COLORS.hair }}>
          <option value="all">All medicines</option>
          {patient.medications.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-[14px] text-[13.5px] border outline-none" style={{ borderColor: COLORS.hair }}>
          <option value="all">All statuses</option>
          {["Taken", "Missed", "Late"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead><tr style={{ background: COLORS.mint }}>{["Date", "Medicine", "Scheduled", "Actual", "Dosage", "Status"].map((h) => <th key={h} className="text-left px-4 py-2.5 font-medium" style={{ color: COLORS.primaryDark }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.hair}` }}>
                  <td className="px-4 py-2.5">{fmtDate(r.date)}</td>
                  <td className="px-4 py-2.5 font-medium">{r.medName}</td>
                  <td className="px-4 py-2.5">{to12h(r.scheduledTime)}</td>
                  <td className="px-4 py-2.5">{r.actualTime ? to12h(r.actualTime) : "—"}</td>
                  <td className="px-4 py-2.5">{r.dosage}</td>
                  <td className="px-4 py-2.5"><StatusPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState icon={HistoryIcon} title="No matching records" body="Try changing your filters or search." />}
      </Card>
    </div>
  );
}

function Adherence({ patient }) {
  const weekly = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const date = addDays(todayISO(), -i);
      const dayLogs = patient.logs.filter((l) => l.date === date && l.status !== "Upcoming");
      const taken = dayLogs.filter((l) => l.status === "Taken" || l.status === "Late").length;
      out.push({ day: dayOfWeek(date), pct: dayLogs.length ? Math.round((taken / dayLogs.length) * 100) : 0 });
    }
    return out;
  }, [patient.logs]);

  const donut = useMemo(() => {
    const last30 = patient.logs.filter((l) => l.date >= addDays(todayISO(), -30) && l.status !== "Upcoming");
    return [
      { name: "Taken", value: last30.filter((l) => l.status === "Taken").length, color: COLORS.success },
      { name: "Late", value: last30.filter((l) => l.status === "Late").length, color: COLORS.amber },
      { name: "Missed", value: last30.filter((l) => l.status === "Missed").length, color: COLORS.coral },
    ];
  }, [patient.logs]);

  const perMed = useMemo(() => patient.medications.map((med) => {
    const logs = patient.logs.filter((l) => l.medId === med.id && l.date >= addDays(todayISO(), -30) && l.status !== "Upcoming");
    const taken = logs.filter((l) => l.status === "Taken" || l.status === "Late").length;
    return { name: med.name, pct: logs.length ? Math.round((taken / logs.length) * 100) : 0 };
  }), [patient.logs, patient.medications]);

  const adh = adherenceBreakdown(patient);
  const today = todaysSchedule(patient);
  const dToday = today.filter((r) => r.status !== "Upcoming").length ? Math.round((today.filter((r) => r.status === "Taken").length / today.filter((r) => r.status !== "Upcoming").length) * 100) : 0;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatTile label="Today" value={`${dToday}%`} />
        <StatTile label="7 days" value={`${adh.d7}%`} />
        <StatTile label="30 days" value={`${adh.d30}%`} />
        <StatTile label="90 days" value={`${adh.d90}%`} />
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="font-semibold text-[14.5px] mb-4">Weekly adherence</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={weekly}>
              <CartesianGrid stroke={COLORS.hair} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} />
              <Tooltip /><Line type="monotone" dataKey="pct" stroke={COLORS.primary} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <div className="font-semibold text-[14.5px] mb-4">Taken vs. late vs. missed (30 days)</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}
                label={({ name, percent }) => (percent > 0 ? `${name} ${Math.round(percent * 100)}%` : "")} labelLine={false}>
                {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Legend /><Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5 md:col-span-2">
          <div className="font-semibold text-[14.5px] mb-4">Adherence by medicine (30 days)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={perMed}>
              <CartesianGrid stroke={COLORS.hair} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} />
              <Tooltip /><Bar dataKey="pct" fill={COLORS.lavender} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function Interactions({ patient }) {
  const meds = patient.medications.map((m) => m.name);
  const [a, setA] = useState(meds[0] || "");
  const [b, setB] = useState(meds[1] || meds[0] || "");
  const [result, setResult] = useState(null);
  const [checked, setChecked] = useState(false);

  const run = () => { setResult(checkInteraction(a, b)); setChecked(true); };
  const levelStyle = (level) => {
    if (level === "High risk") return { bg: COLORS.dangerSoft, fg: COLORS.coral, icon: AlertTriangle };
    if (level === "Moderate caution") return { bg: COLORS.warningSoft, fg: COLORS.amber, icon: ShieldAlert };
    return { bg: COLORS.successSoft, fg: COLORS.success, icon: ShieldCheck };
  };

  if (meds.length < 2) {
    return <Card className="p-5"><EmptyState icon={ShieldAlert} title="Not enough medicines yet" body="You need at least two active medications to check interactions." /></Card>;
  }

  return (
    <div>
      <div className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full mb-5" style={{ background: COLORS.warningSoft, color: COLORS.amber }}>
        <Info size={12} /> Prototype interaction analysis — not connected to a live medical database
      </div>
      <Card className="p-5">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <div className="text-[13px] font-medium mb-1">Medicine A</div>
            <select value={a} onChange={(e) => setA(e.target.value)} className="w-full px-3 py-2.5 rounded-[14px] text-[14px] border outline-none" style={{ borderColor: COLORS.hair }}>
              {meds.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-[13px] font-medium mb-1">Medicine B</div>
            <select value={b} onChange={(e) => setB(e.target.value)} className="w-full px-3 py-2.5 rounded-[14px] text-[14px] border outline-none" style={{ borderColor: COLORS.hair }}>
              {meds.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
        </div>
        <button onClick={run} disabled={!a || !b || a === b} className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white mt-4 disabled:opacity-40" style={{ background: COLORS.primary }}>Check interactions</button>
        {checked && (
          result ? (
            <div className="mt-5 p-4 rounded-[16px]" style={{ background: levelStyle(result.level).bg }}>
              <div className="flex items-center gap-2 font-semibold text-[14.5px]" style={{ color: levelStyle(result.level).fg }}>
                {React.createElement(levelStyle(result.level).icon, { size: 16 })} {result.level} <span className="text-[12px] font-normal opacity-80">· {result.category}</span>
              </div>
              <div className="text-[13.5px] mt-2" style={{ color: levelStyle(result.level).fg }}>{result.explanation}</div>
              <div className="text-[13px] mt-2 font-medium" style={{ color: levelStyle(result.level).fg }}>Recommended action: {result.recommendation}</div>
            </div>
          ) : (
            <div className="mt-5 p-4 rounded-[16px]" style={{ background: COLORS.mint }}>
              <div className="text-[13.5px]" style={{ color: COLORS.primaryDark }}>No interaction data found for this pair in the prototype database. This does not confirm safety — always confirm with a pharmacist or doctor.</div>
            </div>
          )
        )}
      </Card>
      <p className="text-[12.5px] mt-4" style={{ color: COLORS.inkSoft }}>This tool is for educational purposes only and does not replace advice from a qualified healthcare professional. Never stop, start, or change a prescription medication without appropriate professional guidance.</p>
    </div>
  );
}

function MedicationInsights({ patient }) {
  const insights = generateInsights(patient).filter((i) => i.category === CATEGORIES.MEDICATION);
  const pattern = adherenceTimePattern(patient);
  return (
    <div>
      {insights.length === 0 ? (
        <Card className="p-5"><EmptyState icon={Sparkles} title="Not enough data yet" body="Keep logging doses to unlock adherence insights." /></Card>
      ) : (
        <div className="space-y-3">
          {insights.map((ins) => (
            <Card key={ins.id} className="p-4 flex items-start gap-3">
              <Sparkles size={16} color={COLORS.lavender} className="flex-shrink-0 mt-0.5" />
              <span className="text-[14px]">{ins.text}</span>
            </Card>
          ))}
        </div>
      )}
      <div className="text-[11.5px] mt-4" style={{ color: COLORS.inkFaint }}>Rule-based analysis of your logged doses — an observation, not medical advice.</div>
    </div>
  );
}

export default function MedicationsHub({ patient, updatePatient }) {
  const [tab, setTab] = useState("today");
  return (
    <div>
      <Heading size={26} className="mb-4">Medications</Heading>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium flex-shrink-0 focus:outline-none"
              style={{ background: active ? COLORS.primary : COLORS.surface2, color: active ? "white" : COLORS.inkSoft }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "today" && <TodaySchedule patient={patient} updatePatient={updatePatient} />}
      {tab === "list" && <MedicationsList patient={patient} />}
      {tab === "history" && <MedicationHistory patient={patient} />}
      {tab === "adherence" && <Adherence patient={patient} />}
      {tab === "interactions" && <Interactions patient={patient} />}
      {tab === "insights" && <MedicationInsights patient={patient} />}
    </div>
  );
}
