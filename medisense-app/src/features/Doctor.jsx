import React, { useState, useMemo } from "react";
import { Users, AlertTriangle, ChevronRight, ChevronLeft, Plus, Pencil, Trash2, CalendarDays, ShieldCheck, Lock, Sparkles, TrendingUp } from "lucide-react";
import { COLORS, Card, MotionCard, Heading, EmptyState, StatTile, Field, ConfirmButton, ThemeToggle, SegmentedControl, useTheme, TrendPill,
  fmtDate, to12h, todayISO, toast, uid,
} from "../shared.jsx";
import { computeAdherence, missedDaysCount } from "../data/seed.js";
import { VITAL_METRICS, metricSeries, seriesStats, healthTrendSummaries, generateInsights, CATEGORIES } from "../data/healthRecords.js";
import { MessageThread, unreadCount } from "./Messaging.jsx";
import { AccountSyncCard } from "./Profile.jsx";

/* =========================================================================
   Doctor side — Patients · Availability · Profile
   Unchanged behavior from the original app, reorganized into this module.
   ========================================================================= */

export function DoctorPatientsList({ data, onSelect }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("attention");

  const visible = useMemo(() => {
    let list = data.patients.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.conditions.toLowerCase().includes(search.toLowerCase()));
    if (sortBy === "attention") list = [...list].sort((a, b) => computeAdherence(a.logs, 7) - computeAdherence(b.logs, 7));
    else if (sortBy === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "visit") list = [...list].sort((a, b) => {
      if (!a.nextVisit && !b.nextVisit) return 0;
      if (!a.nextVisit) return 1;
      if (!b.nextVisit) return -1;
      return (a.nextVisit.date + a.nextVisit.time).localeCompare(b.nextVisit.date + b.nextVisit.time);
    });
    return list;
  }, [data.patients, search, sortBy]);

  return (
    <div>
      <Heading size={26} className="mb-1">Patients</Heading>
      <p className="text-[14px] mb-5" style={{ color: COLORS.inkSoft }}>{data.patients.length} patients under your care.</p>

      <div className="flex flex-wrap gap-3 mb-5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or condition…"
          className="flex-1 min-w-[200px] px-3 py-2.5 rounded-[14px] text-[13.5px] border outline-none focus:ring-2 focus:ring-offset-1"
          style={{ borderColor: COLORS.hair, "--tw-ring-color": COLORS.primary }} />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2.5 rounded-[14px] text-[13.5px] border outline-none focus:ring-2 focus:ring-offset-1"
          style={{ borderColor: COLORS.hair, "--tw-ring-color": COLORS.primary }}>
          <option value="attention">Sort: Needs attention first</option>
          <option value="name">Sort: Name (A–Z)</option>
          <option value="visit">Sort: Next visit</option>
        </select>
      </div>

      {visible.length === 0 && <Card className="p-5"><EmptyState icon={Users} title="No patients match" body="Try a different search term." /></Card>}

      <div className="grid md:grid-cols-2 gap-4">
        {visible.map((p) => {
          const adherence = computeAdherence(p.logs, 7);
          const activeMeds = p.medications.filter((m) => m.active).length;
          const missedDays = missedDaysCount(p.logs, 30);
          const unreadMsgs = unreadCount(p.messages, "doctor");
          return (
            <MotionCard key={p.id} onClick={() => onSelect(p.id)} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-[16px]">{p.name}</div>
                  <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Age {p.age} · {p.conditions}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {missedDays >= 3 && <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1" style={{ background: COLORS.dangerSoft, color: COLORS.coral }}><AlertTriangle size={11} /> Needs attention</span>}
                  {unreadMsgs > 0 && <span className="text-[11px] font-medium px-2 py-1 rounded-full" style={{ background: COLORS.infoSoft, color: COLORS.info }}>{unreadMsgs} new message{unreadMsgs > 1 ? "s" : ""}</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div><div className="text-[11.5px]" style={{ color: COLORS.inkSoft }}>Adherence (7d)</div><div className="text-[16px] font-semibold" style={{ color: adherence < 75 ? COLORS.coral : COLORS.ink }}>{adherence}%</div></div>
                <div><div className="text-[11.5px]" style={{ color: COLORS.inkSoft }}>Active meds</div><div className="text-[16px] font-semibold">{activeMeds}</div></div>
                <div><div className="text-[11.5px]" style={{ color: COLORS.inkSoft }}>Next visit</div><div className="text-[13px] font-medium mt-0.5">{p.nextVisit ? fmtDate(p.nextVisit.date) : "—"}</div></div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onSelect(p.id); }}
                className="w-full mt-4 text-[13px] font-medium px-3.5 py-2.5 rounded-full border inline-flex items-center justify-center gap-1.5 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-1"
                style={{ borderColor: COLORS.hair, color: COLORS.primaryDark, "--tw-ring-color": COLORS.primary }}>
                View patient <ChevronRight size={14} />
              </button>
            </MotionCard>
          );
        })}
      </div>
    </div>
  );
}

function emptyMed() {
  return { name: "", genericName: "", dosage: "", unit: "mg", frequency: "Once daily", timesPerDay: 1, times: ["08:00"], startDate: todayISO(), endDate: "", instructions: "", withFood: true, notes: "", active: true };
}

function DoctorMedForm({ med, onCancel, onSave }) {
  const [f, setF] = useState(med);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setTimesPerDay = (n) => {
    n = Math.max(1, Math.min(4, n));
    const times = Array.from({ length: n }, (_, i) => f.times[i] || "08:00");
    setF((x) => ({ ...x, timesPerDay: n, times }));
  };
  const setTime = (i, v) => setF((x) => { const times = [...x.times]; times[i] = v; return { ...x, times }; });

  return (
    <Card className="p-5 mb-6">
      <div className="font-semibold text-[15px] mb-4">{f.id ? "Edit prescription" : "Prescribe new medicine"}</div>
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Medicine name" value={f.name} onChange={set("name")} placeholder="Metformin" />
        <Field label="Generic name" value={f.genericName} onChange={set("genericName")} placeholder="Metformin HCl" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dosage" value={f.dosage} onChange={set("dosage")} placeholder="500" />
          <label className="block">
            <div className="text-[13px] font-medium mb-1">Unit</div>
            <select value={f.unit} onChange={set("unit")} className="w-full px-3 py-2.5 rounded-[14px] text-[14px] border outline-none" style={{ borderColor: COLORS.hair }}>
              {["mg", "mcg", "IU", "ml", "tablet(s)"].map((u) => <option key={u}>{u}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <div className="text-[13px] font-medium mb-1">Frequency</div>
          <select value={f.frequency} onChange={set("frequency")} className="w-full px-3 py-2.5 rounded-[14px] text-[14px] border outline-none" style={{ borderColor: COLORS.hair }}>
            {["Once daily", "Twice daily", "Three times daily", "As needed"].map((u) => <option key={u}>{u}</option>)}
          </select>
        </label>
        <div>
          <div className="text-[13px] font-medium mb-1">Times per day</div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="number" min={1} max={4} value={f.timesPerDay} onChange={(e) => setTimesPerDay(Number(e.target.value))} className="w-20 px-3 py-2.5 rounded-[14px] text-[14px] border outline-none" style={{ borderColor: COLORS.hair }} />
            {f.times.map((t, i) => <input key={i} type="time" value={t} onChange={(e) => setTime(i, e.target.value)} className="px-2 py-2.5 rounded-[14px] text-[14px] border outline-none" style={{ borderColor: COLORS.hair }} />)}
          </div>
        </div>
        <Field label="Start date" value={f.startDate} onChange={set("startDate")} type="date" />
        <Field label="End date (optional)" value={f.endDate} onChange={set("endDate")} type="date" />
        <div className="md:col-span-2"><Field label="Instructions" value={f.instructions} onChange={set("instructions")} placeholder="Take after meals" /></div>
        <div className="md:col-span-2"><Field label="Notes" value={f.notes} onChange={set("notes")} placeholder="Clinical notes (optional)" /></div>
        <label className="flex items-center gap-2 text-[13.5px] font-medium mt-1">
          <input type="checkbox" checked={f.withFood} onChange={(e) => setF((x) => ({ ...x, withFood: e.target.checked }))} /> Take with food
        </label>
      </div>
      <div className="flex items-center gap-2 mt-5">
        <button onClick={() => onSave(f)} disabled={!f.name || !f.dosage}
          className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white disabled:opacity-40" style={{ background: COLORS.primary }}>Save prescription</button>
        <button onClick={onCancel} className="text-[13.5px] font-medium px-4 py-2.5 rounded-full border" style={{ borderColor: COLORS.hair }}>Cancel</button>
      </div>
    </Card>
  );
}

function SharedAccessPanel({ patient, doctorId }) {
  const share = (patient.healthShares || []).find((s) => s.doctorId === doctorId);
  if (!share) {
    return (
      <Card className="p-5 mb-6" style={{ background: COLORS.surface2 }}>
        <div className="flex items-center gap-2 mb-1"><Lock size={15} color={COLORS.inkSoft} /><span className="font-semibold text-[14.5px]">No additional data shared</span></div>
        <p className="text-[13px]" style={{ color: COLORS.inkSoft }}>This patient hasn't granted you access to vitals, activity, or other health categories yet. You can still manage their prescriptions below.</p>
      </Card>
    );
  }
  const granted = Object.entries(share.categories).filter(([, v]) => v).map(([k]) => k);
  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center gap-2 mb-2"><ShieldCheck size={15} color={COLORS.primary} /><span className="font-semibold text-[14.5px]">Shared with you</span></div>
      <div className="flex flex-wrap gap-2 mb-1">
        {granted.length === 0 ? <span className="text-[13px]" style={{ color: COLORS.inkSoft }}>No categories currently granted.</span> :
          granted.map((k) => <span key={k} className="text-[12px] font-medium px-2.5 py-1 rounded-full capitalize" style={{ background: COLORS.mint, color: COLORS.primaryDark }}>{k}</span>)}
      </div>
      <div className="text-[12px] mt-1" style={{ color: COLORS.inkFaint }}>{share.ongoing ? "Ongoing access" : `Access until ${share.until}`} · set by the patient under Care → Shared Health Data.</div>
    </Card>
  );
}

function AuthorizedVitalsPanel({ patient, doctorId }) {
  const share = (patient.healthShares || []).find((s) => s.doctorId === doctorId);
  if (!share) return null;
  const keys = [];
  if (share.categories.vitals) keys.push("heartRate", "bloodPressure", "bloodOxygen");
  if (share.categories.glucose) keys.push("glucose");
  if (keys.length === 0) return null;
  return (
    <Card className="p-5 mb-6">
      <div className="font-semibold text-[14.5px] mb-3">Patient vitals (authorized)</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {keys.map((k) => {
          const def = VITAL_METRICS[k];
          const stats = seriesStats(metricSeries(patient, k, 14));
          return (
            <div key={k} className="p-3 rounded-[14px]" style={{ background: COLORS.surface2 }}>
              <div className="text-[12px]" style={{ color: COLORS.inkSoft }}>{def.label}</div>
              <div className="text-[17px] font-semibold mt-0.5">{stats.latest ?? "—"} <span className="text-[11px] font-normal" style={{ color: COLORS.inkSoft }}>{def.unit}</span></div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AuthorizedTrendsPanel({ patient, doctorId }) {
  const share = (patient.healthShares || []).find((s) => s.doctorId === doctorId);
  if (!share) return null;
  const allowedLabels = new Set();
  if (share.categories.vitals) { allowedLabels.add("Heart Rate"); allowedLabels.add("Blood Pressure"); allowedLabels.add("Blood Oxygen"); }
  if (share.categories.glucose) allowedLabels.add("Glucose");
  if (share.categories.medications) allowedLabels.add("Medication Adherence");
  const trends = healthTrendSummaries(patient).filter((t) => allowedLabels.has(t.label));
  if (trends.length === 0) return null;
  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center gap-2 mb-3"><TrendingUp size={15} color={COLORS.cyan} /><span className="font-semibold text-[14.5px]">Patient health trends (authorized)</span></div>
      <div className="flex flex-wrap gap-2">
        {trends.map((t) => (
          <div key={t.key} className="flex items-center gap-2 px-3 py-2 rounded-[14px]" style={{ background: COLORS.surface2 }}>
            <span className="text-[13px] font-medium">{t.label}</span>
            <TrendPill direction={t.direction} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function AuthorizedInsightsPanel({ patient, doctorId }) {
  const share = (patient.healthShares || []).find((s) => s.doctorId === doctorId);
  if (!share) return null;
  const allowedCategories = new Set();
  if (share.categories.medications) allowedCategories.add(CATEGORIES.MEDICATION);
  if (share.categories.vitals || share.categories.glucose) allowedCategories.add(CATEGORIES.VITALS);
  if (share.categories.sleep) allowedCategories.add(CATEGORIES.SLEEP);
  const insights = generateInsights(patient).filter((i) => allowedCategories.has(i.category));
  if (insights.length === 0) return null;
  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center gap-2 mb-3"><Sparkles size={15} color={COLORS.lavender} /><span className="font-semibold text-[14.5px]">Patient insights (authorized)</span></div>
      <div className="space-y-2.5">
        {insights.map((ins) => (
          <div key={ins.id} className="text-[13.5px]" style={{ color: COLORS.ink }}>{ins.text}</div>
        ))}
      </div>
      <div className="text-[11px] mt-3" style={{ color: COLORS.inkFaint }}>Rule-based observation of the patient's logged data — not a diagnosis.</div>
    </Card>
  );
}

export function DoctorPatientDetail({ data, setData, patient, onBack }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [visitDate, setVisitDate] = useState(patient.nextVisit?.date || "");
  const [visitTime, setVisitTime] = useState(patient.nextVisit?.time || "");

  const updatePatient = async (pid, updater) => { const patients = data.patients.map((p) => (p.id === pid ? updater(p) : p)); await setData({ ...data, patients }); };

  const saveMed = async (med) => {
    const isNew = !med.id;
    await updatePatient(patient.id, (p) => {
      let medications;
      if (med.id) medications = p.medications.map((m) => (m.id === med.id ? med : m));
      else medications = [...p.medications, { ...med, id: uid() }];
      return { ...p, medications };
    });
    setShowForm(false); setEditing(null);
    toast(isNew ? `${med.name} prescribed for ${patient.name}` : `${med.name} updated`);
  };
  const removeMed = async (med) => { await updatePatient(patient.id, (p) => ({ ...p, medications: p.medications.filter((m) => m.id !== med.id) })); toast(`${med.name} removed from prescriptions`, "warning"); };
  const toggleActive = async (med) => { await updatePatient(patient.id, (p) => ({ ...p, medications: p.medications.map((m) => (m.id === med.id ? { ...m, active: !m.active } : m)) })); toast(med.active ? `${med.name} paused` : `${med.name} resumed`); };
  const saveVisit = async () => { await updatePatient(patient.id, (p) => ({ ...p, nextVisit: visitDate && visitTime ? { date: visitDate, time: visitTime, doctorId: data.doctor.id, type: "Follow-up" } : null })); toast(visitDate && visitTime ? `Next visit set for ${fmtDate(visitDate)}` : "Visit date cleared"); };

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-4" style={{ color: COLORS.inkSoft }}>
        <ChevronLeft size={15} /> Back to patients
      </button>

      <Heading size={28}>{patient.name}</Heading>
      <p className="text-[14px] mt-1 mb-6" style={{ color: COLORS.inkSoft }}>Age {patient.age} · {patient.conditions} · Allergies: {patient.allergies}</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatTile label="Adherence (7d)" value={`${computeAdherence(patient.logs, 7)}%`} />
        <StatTile label="Active meds" value={patient.medications.filter((m) => m.active).length} />
        <StatTile label="Missed days (30d)" value={missedDaysCount(patient.logs, 30)} accent={missedDaysCount(patient.logs, 30) ? COLORS.amber : undefined} />
      </div>

      <SharedAccessPanel patient={patient} doctorId={data.doctor.id} />
      <AuthorizedVitalsPanel patient={patient} doctorId={data.doctor.id} />
      <AuthorizedTrendsPanel patient={patient} doctorId={data.doctor.id} />
      <AuthorizedInsightsPanel patient={patient} doctorId={data.doctor.id} />

      <div className="mb-6">
        <MessageThread patient={patient} updatePatient={updatePatient} viewerSender="doctor" otherName={patient.name} otherSubtitle={`Age ${patient.age} · ${patient.conditions}`} />
      </div>

      <Card className="p-5 mb-6">
        <div className="font-semibold text-[15px] mb-3">Next visit</div>
        <p className="text-[13px] mb-3" style={{ color: COLORS.inkSoft }}>Set or change the date the patient needs to come in.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Visit date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} type="date" />
          <Field label="Visit time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} type="time" />
          <button onClick={saveVisit} disabled={!visitDate || !visitTime}
            className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white disabled:opacity-40" style={{ background: COLORS.primary }}>Save visit date</button>
          {patient.nextVisit && <ConfirmButton variant="text" label="Clear" confirmLabel="Yes, clear" onConfirm={() => { setVisitDate(""); setVisitTime(""); updatePatient(patient.id, (p) => ({ ...p, nextVisit: null })); toast("Visit date cleared", "warning"); }} />}
        </div>
      </Card>

      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-[15px]">Prescribed medications</div>
        <button onClick={() => { setEditing(emptyMed()); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-2 rounded-full text-white" style={{ background: COLORS.primary }}>
          <Plus size={14} /> Prescribe new medicine
        </button>
      </div>

      {showForm && <DoctorMedForm med={editing} onCancel={() => { setShowForm(false); setEditing(null); }} onSave={saveMed} />}

      {patient.medications.length === 0 ? (
        <Card className="p-5"><EmptyState icon={Users} title="No medications prescribed" body="Use “Prescribe new medicine” to add one." /></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {patient.medications.map((med) => (
            <Card key={med.id} className="p-5" style={!med.active ? { opacity: 0.55 } : {}}>
              <div className="flex items-start justify-between">
                <div><div className="font-semibold text-[16px]">{med.name}</div><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{med.genericName}</div></div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditing(med); setShowForm(true); }} aria-label={`Edit ${med.name}`} className="p-2 rounded-[14px] hover:bg-black/5"><Pencil size={14} /></button>
                  <ConfirmButton onConfirm={() => removeMed(med)} icon={Trash2} label={`Remove ${med.name}`} confirmLabel="Remove" />
                </div>
              </div>
              <div className="text-[14px] mt-3 font-medium">{med.dosage}{med.unit} · {med.frequency}</div>
              <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>Times: {med.times.map(to12h).join(", ")}</div>
              <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>Duration: {fmtDate(med.startDate)} {med.endDate ? `→ ${fmtDate(med.endDate)}` : "→ ongoing"}</div>
              <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${COLORS.hair}` }}>
                <span className="text-[12px]" style={{ color: COLORS.inkSoft }}>{med.withFood ? "With food" : "Without food"}</span>
                <button onClick={() => toggleActive(med)} className="text-[12.5px] font-medium" style={{ color: med.active ? COLORS.coral : COLORS.primary }}>{med.active ? "Pause" : "Resume"}</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function DoctorAvailability({ data, setData }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const slots = [...data.availability].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const duplicate = date && time && data.availability.some((s) => s.date === date && s.time === time);
  const isPast = date && date < todayISO();

  const addSlot = async () => {
    if (!date || !time || duplicate || isPast) return;
    await setData({ ...data, availability: [...data.availability, { id: uid(), date, time, booked: false, patientId: null }] });
    toast(`Open slot added for ${fmtDate(date)} at ${to12h(time)}`);
    setDate(""); setTime("");
  };
  const removeSlot = async (id) => {
    const slot = data.availability.find((s) => s.id === id);
    await setData({ ...data, availability: data.availability.filter((s) => s.id !== id) });
    toast(`Slot removed (${fmtDate(slot.date)} ${to12h(slot.time)})`, "warning");
  };
  const patientName = (pid) => data.patients.find((p) => p.id === pid)?.name || "—";

  return (
    <div>
      <Heading size={26} className="mb-1">Availability</Heading>
      <p className="text-[14px] mb-6" style={{ color: COLORS.inkSoft }}>Publish open times patients can book, and see who's booked what.</p>

      <Card className="p-5 mb-6">
        <div className="font-semibold text-[14.5px] mb-3">Add an open slot</div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Date" value={date} onChange={(e) => setDate(e.target.value)} type="date" />
          <Field label="Time" value={time} onChange={(e) => setTime(e.target.value)} type="time" />
          <button onClick={addSlot} disabled={!date || !time || duplicate || isPast}
            className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white disabled:opacity-40" style={{ background: COLORS.primary }}>Add slot</button>
        </div>
        {duplicate && <div className="text-[12.5px] mt-2" style={{ color: COLORS.coral }}>That slot already exists.</div>}
        {isPast && <div className="text-[12.5px] mt-2" style={{ color: COLORS.coral }}>Pick a date that hasn't passed yet.</div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead><tr style={{ background: COLORS.mint }}>{["Date", "Time", "Status", "Patient", ""].map((h) => <th key={h} className="text-left px-4 py-2.5 font-medium" style={{ color: COLORS.primaryDark }}>{h}</th>)}</tr></thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id} style={{ borderTop: `1px solid ${COLORS.hair}` }}>
                  <td className="px-4 py-2.5">{fmtDate(s.date)}</td>
                  <td className="px-4 py-2.5">{to12h(s.time)}</td>
                  <td className="px-4 py-2.5"><span className="text-[12px] font-medium px-2 py-1 rounded-full" style={s.booked ? { background: COLORS.warningSoft, color: COLORS.amber } : { background: COLORS.successSoft, color: COLORS.success }}>{s.booked ? "Booked" : "Free"}</span></td>
                  <td className="px-4 py-2.5">{s.booked ? patientName(s.patientId) : "—"}</td>
                  <td className="px-4 py-2.5">{!s.booked && <ConfirmButton onConfirm={() => removeSlot(s.id)} icon={Trash2} label={`Remove ${fmtDate(s.date)} ${to12h(s.time)} slot`} confirmLabel="Remove" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {slots.length === 0 && <EmptyState icon={CalendarDays} title="No slots yet" body="Add your first open time above." />}
      </Card>
    </div>
  );
}

export function DoctorProfile({ data, setData }) {
  const [form, setForm] = useState(data.doctor);
  const { textSize, setTextSize, contrast, setContrast } = useTheme();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => { await setData({ ...data, doctor: form }); toast("Profile updated"); };

  return (
    <div>
      <Heading size={26} className="mb-1">Profile</Heading>
      <p className="text-[14px] mb-6" style={{ color: COLORS.inkSoft }}>Your details as shown to patients.</p>
      <Card className="p-5 max-w-2xl mb-5">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Name" value={form.name} onChange={set("name")} />
          <Field label="Specialty" value={form.specialty} onChange={set("specialty")} />
          <Field label="Email" value={form.email} onChange={set("email")} />
          <Field label="Phone" value={form.phone} onChange={set("phone")} />
        </div>
      </Card>
      <Card className="p-5 max-w-2xl mb-5">
        <div className="font-semibold text-[15px] mb-4">Appearance</div>
        <div className="flex items-center justify-between mb-5">
          <div><div className="text-[14px] font-medium">Dark mode</div><div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>Switches the whole app, including charts and cards.</div></div>
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div><div className="text-[14px] font-medium">Text size</div><div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>Scales text throughout MediSense.</div></div>
          <SegmentedControl options={[{ value: "normal", label: "Default" }, { value: "large", label: "Large" }, { value: "larger", label: "Larger" }]} value={textSize} onChange={setTextSize} />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><div className="text-[14px] font-medium">High contrast</div><div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>Stronger borders and text.</div></div>
          <SegmentedControl options={[{ value: "normal", label: "Off" }, { value: "high", label: "On" }]} value={contrast} onChange={setContrast} />
        </div>
      </Card>
      <AccountSyncCard data={data} setData={setData} />
      <button onClick={save} className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white" style={{ background: COLORS.primary }}>Save changes</button>
    </div>
  );
}
