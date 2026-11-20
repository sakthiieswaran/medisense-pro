import React, { useState, useMemo, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import {
  Pill, TrendingUp, ShieldAlert, ShieldCheck, AlertTriangle, Info, History as HistoryIcon,
  Sparkles, Clock, CalendarClock, Plus, Pencil, Trash2, CalendarDays, Package,
} from "lucide-react";
import {
  COLORS, Card, Heading, EmptyState, StatTile, StatusPill, ScheduleTimeline, PinnedCardHeader,
  Field, Select, ConfirmButton, fmtDate, to12h, addDays, todayISO, dayOfWeek, toast, uid, computeRefillInfo,
} from "../shared.jsx";
import { todaysSchedule, computeAdherence } from "../data/seed.js";
import { checkInteraction, checkAllergyAlerts, INTERACTION_DB } from "../data/interactions.js";
import { adherenceBreakdown, adherenceTimePattern, generateInsights, CATEGORIES } from "../data/healthRecords.js";
import { isConnected, checkInteractionsServer } from "../apiStorage.js";
import MedicationCalendar from "./MedicationCalendar.jsx";

/* =========================================================================
   Medications hub — Today's Schedule · Medications (+ Patient Add/Stock) ·
   Calendar · History · Adherence (+ 90-day Heatmap) · Interactions · Insights
   ========================================================================= */

const TABS = [
  { id: "today", label: "Today's Schedule", icon: Clock },
  { id: "list", label: "Medications", icon: Pill },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
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
    const actualTime =
      status === "Taken"
        ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
        : null;

    let refillWarningMsg = null;

    await updatePatient(patient.id, (p) => {
      const existing = p.logs.find(
        (l) => l.medId === row.medId && l.date === t && l.scheduledTime === row.time
      );
      const wasTakenBefore = existing?.status === "Taken";
      let logs;
      if (existing) {
        logs = p.logs.map((l) => (l.id === existing.id ? { ...l, status, actualTime } : l));
      } else {
        logs = [
          ...p.logs,
          {
            id: `${row.medId}-${t}-${row.time}`,
            medId: row.medId,
            medName: row.name,
            dosage: row.dosage,
            date: t,
            scheduledTime: row.time,
            actualTime,
            status,
          },
        ];
      }

      // Update medication stock if tracked and newly taken
      let medications = p.medications;
      let notifications = p.notifications || [];
      if (status === "Taken" && !wasTakenBefore) {
        medications = p.medications.map((m) => {
          if (m.id !== row.medId || m.currentStock == null || m.currentStock === "") return m;
          const nextStock = Math.max(0, Number(m.currentStock) - 1);
          const updatedMed = { ...m, currentStock: nextStock };
          const info = computeRefillInfo(updatedMed);
          if (info && info.lowStock) {
            refillWarningMsg = `Low stock: ${m.name} has ${nextStock} dose(s) left (~${info.daysRemaining}d).`;
            notifications = [
              {
                id: `refill-${m.id}-${t}`,
                type: "refill",
                category: "medication",
                severity: info.criticalStock ? "critical" : "warning",
                message: refillWarningMsg,
                date: t,
                read: false,
              },
              ...notifications.filter((n) => n.id !== `refill-${m.id}-${t}`),
            ];
          }
          return updatedMed;
        });
      }

      if (status === "Missed" || status === "Skipped") {
        notifications = [
          {
            id: `${row.medId}-${t}-${row.time}-n`,
            type: status.toLowerCase(),
            category: "medication",
            severity: status === "Missed" ? "warning" : "info",
            message: `${row.name} ${row.dosage} dose at ${to12h(row.time)} was marked ${status}.`,
            date: t,
            read: false,
          },
          ...notifications,
        ];
      }
      return { ...p, logs, medications, notifications };
    });

    toast(
      status === "Taken"
        ? `${row.name} marked as taken`
        : `${row.name} marked as ${status.toLowerCase()}`,
      status === "Taken" ? "success" : "warning"
    );
    if (refillWarningMsg) toast(refillWarningMsg, "warning");
  };

  return (
    <Card className="p-5">
      <PinnedCardHeader
        icon={Clock}
        label="Today's Schedule"
        tint={COLORS.warningSoft}
        fg={COLORS.amber}
        meta={`${schedule.length} ${schedule.length === 1 ? "dose" : "doses"}`}
      />
      {schedule.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled today"
          body="Add a medication under the Medications tab or check with your doctor."
        />
      ) : (
        <ScheduleTimeline rows={schedule} onMark={logDose} />
      )}
    </Card>
  );
}

function emptyPatientMed() {
  return {
    name: "",
    genericName: "",
    dosage: "",
    unit: "mg",
    frequency: "Once daily",
    timesPerDay: 1,
    times: ["08:00"],
    startDate: todayISO(),
    endDate: "",
    withFood: true,
    instructions: "",
    notes: "",
    currentStock: "30",
    refillThreshold: "7",
    active: true,
    source: "patient",
  };
}

function MedicationsList({ patient, updatePatient }) {
  const [editing, setEditing] = useState(null);
  const [stockEditId, setStockEditId] = useState(null);
  const [stockDraft, setStockDraft] = useState("");

  const allergyAlerts = useMemo(
    () =>
      checkAllergyAlerts(
        patient.medications.filter((m) => m.active !== false).map((m) => m.name),
        patient.records?.allergies,
        patient.allergies
      ),
    [patient.medications, patient.records, patient.allergies]
  );

  const setField = (k) => (e) => setEditing((f) => ({ ...f, [k]: e.target.value }));
  const setTimesPerDay = (n) => {
    n = Math.max(1, Math.min(4, Number(n) || 1));
    const defaults = ["08:00", "20:00", "13:00", "17:00"];
    const times = Array.from({ length: n }, (_, i) => editing.times[i] || defaults[i]);
    setEditing((f) => ({ ...f, timesPerDay: n, times }));
  };

  const saveMedication = async () => {
    if (!editing.name.trim() || !editing.dosage.trim()) {
      toast("Enter both medication name and dosage", "warning");
      return;
    }
    const clean = {
      ...editing,
      name: editing.name.trim(),
      genericName: editing.genericName?.trim() || "",
      dosage: editing.dosage.trim(),
      currentStock: editing.currentStock === "" ? null : Math.max(0, Number(editing.currentStock)),
      refillThreshold: editing.refillThreshold === "" ? 7 : Math.max(1, Number(editing.refillThreshold)),
      id: editing.id || uid(),
      source: editing.source || "patient",
    };

    await updatePatient(patient.id, (p) => {
      const exists = p.medications.some((m) => m.id === clean.id);
      const medications = exists
        ? p.medications.map((m) => (m.id === clean.id ? clean : m))
        : [...p.medications, clean];
      return { ...p, medications };
    });
    setEditing(null);
    toast(editing.id ? `${clean.name} updated` : `${clean.name} added to your medications`);
  };

  const removeMedication = async (med) => {
    await updatePatient(patient.id, (p) => ({
      ...p,
      medications: p.medications.filter((m) => m.id !== med.id),
    }));
    toast(`${med.name} removed`, "warning");
  };

  const saveStockOnly = async (medId) => {
    const num = stockDraft === "" ? null : Math.max(0, Number(stockDraft));
    await updatePatient(patient.id, (p) => ({
      ...p,
      medications: p.medications.map((m) => (m.id === medId ? { ...m, currentStock: num } : m)),
    }));
    setStockEditId(null);
    toast("Stock count updated");
  };

  return (
    <div>
      {allergyAlerts.length > 0 && (
        <Card className="p-4 mb-4" style={{ background: COLORS.dangerSoft, borderColor: COLORS.coral }}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} color={COLORS.coral} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-[14px]" style={{ color: COLORS.coral }}>Allergy Alert</div>
              {allergyAlerts.map((a, idx) => (
                <div key={idx} className="text-[13px] mt-0.5" style={{ color: COLORS.coral }}>
                  {a.reason} Confirm immediately with your doctor or pharmacist.
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-[13px]" style={{ color: COLORS.inkSoft }}>
          Doctor-prescribed regimens are protected; you can add over-the-counter items, supplements, or refill counts.
        </p>
        <button
          onClick={() => setEditing(emptyPatientMed())}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-full text-white"
          style={{ background: COLORS.primary }}
        >
          <Plus size={14} /> Add Medication
        </button>
      </div>

      {editing && (
        <Card className="p-5 mb-5">
          <div className="font-semibold text-[15px] mb-1">
            {editing.id ? `Edit ${editing.name}` : "Add personal medication or supplement"}
          </div>
          <p className="text-[12px] mb-4" style={{ color: COLORS.inkSoft }}>
            Consult your doctor or pharmacist before starting or stopping any prescription medication.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Medication name" value={editing.name} onChange={setField("name")} placeholder="e.g. Vitamin D3, Ibuprofen" />
            <Field label="Generic name (optional)" value={editing.genericName} onChange={setField("genericName")} placeholder="Cholecalciferol" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dosage" value={editing.dosage} onChange={setField("dosage")} placeholder="500" />
              <Select label="Unit" value={editing.unit} onChange={setField("unit")} options={["mg", "mcg", "IU", "ml", "tablet(s)"]} />
            </div>
            <Select
              label="Frequency"
              value={editing.frequency}
              onChange={setField("frequency")}
              options={["Once daily", "Twice daily", "Three times daily", "Weekly", "As needed"]}
            />
            <div>
              <div className="text-[13px] font-medium mb-1">Times per day</div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={editing.timesPerDay}
                  onChange={(e) => setTimesPerDay(e.target.value)}
                  className="w-20 px-3 py-2.5 rounded-[14px] text-[14px] border outline-none"
                  style={{ borderColor: COLORS.hair }}
                />
                {editing.times.map((t, i) => (
                  <input
                    key={i}
                    type="time"
                    value={t}
                    onChange={(e) => {
                      const times = [...editing.times];
                      times[i] = e.target.value;
                      setEditing((f) => ({ ...f, times }));
                    }}
                    className="px-2.5 py-2.5 rounded-[14px] text-[14px] border outline-none"
                    style={{ borderColor: COLORS.hair }}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Current stock (doses)" type="number" value={editing.currentStock ?? ""} onChange={setField("currentStock")} placeholder="30" />
              <Field label="Refill alert (days left)" type="number" value={editing.refillThreshold ?? "7"} onChange={setField("refillThreshold")} placeholder="7" />
            </div>
            <Field label="Start date" type="date" value={editing.startDate} onChange={setField("startDate")} />
            <Field label="End date (optional)" type="date" value={editing.endDate} onChange={setField("endDate")} />
            <div className="md:col-span-2">
              <Field label="Instructions" value={editing.instructions} onChange={setField("instructions")} placeholder="Take with food" />
            </div>
            <label className="flex items-center gap-2 text-[13.5px] font-medium">
              <input
                type="checkbox"
                checked={editing.withFood}
                onChange={(e) => setEditing((f) => ({ ...f, withFood: e.target.checked }))}
                style={{ accentColor: COLORS.primary }}
              />
              Take with food
            </label>
          </div>
          <div className="flex items-center gap-2 mt-5">
            <button onClick={saveMedication} className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white" style={{ background: COLORS.primary }}>
              Save medication
            </button>
            <button onClick={() => setEditing(null)} className="text-[13.5px] font-medium px-4 py-2.5 rounded-full border" style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>
              Cancel
            </button>
          </div>
        </Card>
      )}

      {patient.medications.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon={Pill} title="No medications added yet" body="Add an existing medicine or wait for your doctor's prescription." />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {patient.medications.map((med) => {
            const refill = computeRefillInfo(med);
            const isPatientOwned = med.source === "patient";
            return (
              <Card key={med.id} className="p-5" style={!med.active ? { opacity: 0.6 } : {}}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[16px] flex items-center gap-2 flex-wrap">
                      {med.name}
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: isPatientOwned ? COLORS.surface2 : COLORS.mint,
                          color: isPatientOwned ? COLORS.inkSoft : COLORS.primaryDark,
                        }}
                      >
                        {isPatientOwned ? "Self-added" : "Prescribed"}
                      </span>
                    </div>
                    <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{med.genericName}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!med.active && (
                      <span className="text-[11px] font-medium px-2 py-1 rounded-full" style={{ background: COLORS.warningSoft, color: COLORS.amber }}>
                        Paused
                      </span>
                    )}
                    {isPatientOwned && (
                      <>
                        <button
                          onClick={() => setEditing({ ...med, timesPerDay: med.timesPerDay || med.times?.length || 1 })}
                          aria-label={`Edit ${med.name}`}
                          className="p-1.5 rounded-full hover:bg-black/5"
                        >
                          <Pencil size={14} color={COLORS.inkSoft} />
                        </button>
                        <ConfirmButton onConfirm={() => removeMedication(med)} icon={Trash2} label={`Delete ${med.name}`} confirmLabel="Delete" />
                      </>
                    )}
                  </div>
                </div>

                <div className="text-[14px] mt-3 font-medium">
                  {med.dosage}{med.unit} · {med.frequency}
                </div>
                <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>
                  Times: {(med.times || []).map(to12h).join(", ")}
                </div>
                <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>
                  {med.withFood ? "With food" : "Without food"} {med.instructions ? `· ${med.instructions}` : ""}
                </div>
                {med.notes && <div className="text-[12.5px] mt-1 italic" style={{ color: COLORS.inkFaint }}>{med.notes}</div>}

                {/* Refill & stock management */}
                <div className="mt-3 pt-3 flex items-center justify-between flex-wrap gap-2" style={{ borderTop: `1px solid ${COLORS.hair}` }}>
                  <div className="text-[12px]" style={{ color: COLORS.inkSoft }}>
                    {fmtDate(med.startDate)} {med.endDate ? `→ ${fmtDate(med.endDate)}` : "→ ongoing"}
                  </div>
                  {stockEditId === med.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={stockDraft}
                        onChange={(e) => setStockDraft(e.target.value)}
                        placeholder="Doses"
                        className="w-20 px-2 py-1 text-[12px] rounded-[10px] border outline-none"
                        style={{ borderColor: COLORS.hair }}
                      />
                      <button onClick={() => saveStockOnly(med.id)} className="text-[11.5px] font-medium px-2.5 py-1 rounded-full text-white" style={{ background: COLORS.primary }}>Save</button>
                      <button onClick={() => setStockEditId(null)} className="text-[11.5px]" style={{ color: COLORS.inkSoft }}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setStockEditId(med.id);
                        setStockDraft(med.currentStock ?? "");
                      }}
                      className="inline-flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1 rounded-full"
                      style={{
                        background: refill?.lowStock ? (refill.criticalStock ? COLORS.dangerSoft : COLORS.warningSoft) : COLORS.surface2,
                        color: refill?.lowStock ? (refill.criticalStock ? COLORS.coral : COLORS.amber) : COLORS.inkSoft,
                      }}
                    >
                      <Package size={12} />
                      {refill
                        ? refill.lowStock
                          ? `Refill soon · ${refill.stock} left (~${refill.daysRemaining}d)`
                          : `${refill.stock} left (~${refill.daysRemaining}d)`
                        : "Track stock"}
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
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
          {["Taken", "Skipped", "Missed", "Late"].map((s) => <option key={s}>{s}</option>)}
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

function AdherenceHeatmap({ logs }) {
  const days = useMemo(() => {
    const byDate = {};
    for (const l of logs || []) {
      if (l.status === "Upcoming") continue;
      (byDate[l.date] = byDate[l.date] || []).push(l);
    }
    const list = [];
    for (let i = 89; i >= 0; i--) {
      const iso = addDays(todayISO(), -i);
      const dayLogs = byDate[iso] || [];
      let pct = null;
      if (dayLogs.length > 0) {
        const good = dayLogs.filter((l) => l.status === "Taken" || l.status === "Late").length;
        pct = Math.round((good / dayLogs.length) * 100);
      }
      list.push({ date: iso, pct, total: dayLogs.length });
    }
    return list;
  }, [logs]);

  const cellStyle = (pct) => {
    if (pct === null) return { background: COLORS.surface2 };
    if (pct >= 85) return { background: COLORS.success };
    if (pct >= 50) return { background: COLORS.amber };
    return { background: COLORS.coral };
  };

  return (
    <Card className="p-5 md:col-span-2">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="font-semibold text-[14.5px]">90-day adherence heatmap</div>
        <div className="flex items-center gap-3 text-[11.5px]" style={{ color: COLORS.inkSoft }}>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.success }} /> &ge;85%</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.amber }} /> 50–84%</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.coral }} /> &lt;50%</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS.surface2 }} /> No data</span>
        </div>
      </div>
      <div className="grid grid-cols-15 sm:grid-cols-18 gap-1.5" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(14px, 1fr))" }}>
        {days.map((d) => (
          <div
            key={d.date}
            title={d.pct === null ? `${d.date}: No logged doses` : `${d.date}: ${d.pct}% (${d.total} doses)`}
            aria-label={d.pct === null ? `${d.date} no data` : `${d.date} ${d.pct} percent`}
            className="h-4 rounded-[4px]"
            style={cellStyle(d.pct)}
          />
        ))}
      </div>
    </Card>
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
      { name: "Missed", value: last30.filter((l) => l.status === "Missed" || l.status === "Skipped").length, color: COLORS.coral },
    ];
  }, [patient.logs]);

  const perMed = useMemo(
    () =>
      patient.medications.map((med) => {
        const logs = patient.logs.filter((l) => l.medId === med.id && l.date >= addDays(todayISO(), -30) && l.status !== "Upcoming");
        const taken = logs.filter((l) => l.status === "Taken" || l.status === "Late").length;
        return { name: med.name, pct: logs.length ? Math.round((taken / logs.length) * 100) : 0 };
      }),
    [patient.logs, patient.medications]
  );

  const adh = adherenceBreakdown(patient);
  const today = todaysSchedule(patient);
  const todayLogged = today.filter((r) => r.status !== "Upcoming");
  const dToday = todayLogged.length ? Math.round((todayLogged.filter((r) => r.status === "Taken").length / todayLogged.length) * 100) : 0;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatTile label="Today" value={`${dToday}%`} />
        <StatTile label="7 days" value={`${adh.d7}%`} />
        <StatTile label="30 days" value={`${adh.d30}%`} />
        <StatTile label="90 days" value={`${adh.d90}%`} />
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <AdherenceHeatmap logs={patient.logs} />
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

const KNOWN_REFERENCE_SUBSTANCES = Array.from(
  new Set(Object.keys(INTERACTION_DB).flatMap((k) => k.split("|")).map((s) => s.charAt(0).toUpperCase() + s.slice(1)))
).sort();

function Interactions({ patient }) {
  const [activeOnly, setActiveOnly] = useState(true);
  const patientMeds = useMemo(
    () => patient.medications.filter((m) => (activeOnly ? m.active !== false : true)).map((m) => m.name),
    [patient.medications, activeOnly]
  );
  const selectable = useMemo(
    () => Array.from(new Set([...patientMeds, ...KNOWN_REFERENCE_SUBSTANCES])),
    [patientMeds]
  );

  const [a, setA] = useState(patientMeds[0] || selectable[0] || "");
  const [b, setB] = useState(patientMeds[1] || selectable[1] || "");
  const [result, setResult] = useState(null);
  const [allergyAlerts, setAllergyAlerts] = useState([]);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (patientMeds.length >= 1 && !selectable.includes(a)) setA(patientMeds[0]);
    if (patientMeds.length >= 2 && !selectable.includes(b)) setB(patientMeds[1]);
  }, [patientMeds, selectable, a, b]);

  const run = async () => {
    setChecking(true);
    try {
      let pair = null;
      let allergies = checkAllergyAlerts([a, b], patient.records?.allergies, patient.allergies);
      if (isConnected()) {
        try {
          const srv = await checkInteractionsServer({
            drugA: a,
            drugB: b,
            medications: [a, b],
            allergies: patient.records?.allergies || [],
            legacyAllergyText: patient.allergies || "",
          });
          pair = srv.pairResult;
          allergies = srv.allergyAlerts || allergies;
        } catch {
          pair = checkInteraction(a, b);
        }
      } else {
        pair = checkInteraction(a, b);
      }
      setResult(pair);
      setAllergyAlerts(allergies);
      setChecked(true);
    } finally {
      setChecking(false);
    }
  };

  const levelStyle = (level) => {
    if (level === "High risk") return { bg: COLORS.dangerSoft, fg: COLORS.coral, icon: AlertTriangle };
    if (level === "Moderate caution") return { bg: COLORS.warningSoft, fg: COLORS.amber, icon: ShieldAlert };
    return { bg: COLORS.successSoft, fg: COLORS.success, icon: ShieldCheck };
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full" style={{ background: COLORS.mint, color: COLORS.primaryDark }}>
          <Info size={12} /> Curated FDA Drug Labeling reference {isConnected() ? "+ live openFDA fallback" : "(offline reference)"}
        </div>
        <label className="inline-flex items-center gap-2 text-[12.5px]" style={{ color: COLORS.inkSoft }}>
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} style={{ accentColor: COLORS.primary }} />
          Active medications only ({patientMeds.length})
        </label>
      </div>

      <Card className="p-5">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <div className="text-[13px] font-medium mb-1">Medicine / Substance A</div>
            <select value={a} onChange={(e) => setA(e.target.value)} className="w-full px-3 py-2.5 rounded-[14px] text-[14px] border outline-none" style={{ borderColor: COLORS.hair }}>
              {selectable.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-[13px] font-medium mb-1">Medicine / Substance B</div>
            <select value={b} onChange={(e) => setB(e.target.value)} className="w-full px-3 py-2.5 rounded-[14px] text-[14px] border outline-none" style={{ borderColor: COLORS.hair }}>
              {selectable.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
        </div>

        <button
          onClick={run}
          disabled={!a || !b || a === b || checking}
          className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white mt-4 disabled:opacity-40"
          style={{ background: COLORS.primary }}
        >
          {checking ? "Checking…" : "Check interactions"}
        </button>

        {checked && allergyAlerts.length > 0 && (
          <div className="mt-4 p-4 rounded-[16px]" style={{ background: COLORS.dangerSoft, color: COLORS.coral }}>
            <div className="font-semibold text-[14px] flex items-center gap-1.5">
              <AlertTriangle size={15} /> Allergy Cross-Reaction Alert
            </div>
            {allergyAlerts.map((al, i) => (
              <div key={i} className="text-[13px] mt-1">{al.reason}</div>
            ))}
          </div>
        )}

        {checked && (
          result ? (
            <div className="mt-4 p-4 rounded-[16px]" style={{ background: levelStyle(result.level).bg }}>
              <div className="flex items-center gap-2 font-semibold text-[14.5px]" style={{ color: levelStyle(result.level).fg }}>
                {React.createElement(levelStyle(result.level).icon, { size: 16 })} {result.level}
                <span className="text-[12px] font-normal opacity-80">· {result.category}{result.source ? ` · ${result.source}` : ""}</span>
              </div>
              <div className="text-[13.5px] mt-2" style={{ color: levelStyle(result.level).fg }}>{result.explanation}</div>
              <div className="text-[13px] mt-2 font-medium" style={{ color: levelStyle(result.level).fg }}>Recommended action: {result.recommendation}</div>
            </div>
          ) : (
            <div className="mt-4 p-4 rounded-[16px]" style={{ background: COLORS.mint }}>
              <div className="text-[13.5px]" style={{ color: COLORS.primaryDark }}>
                No known interaction found in MediSense's verified reference set for this pair. Absence of a listing does not guarantee safety — confirm with your pharmacist or doctor.
              </div>
            </div>
          )
        )}
      </Card>
      <p className="text-[12.5px] mt-4" style={{ color: COLORS.inkSoft }}>
        Educational tool only — does not replace professional advice. Never stop, start, or change a prescription without consulting your doctor or pharmacist.
      </p>
    </div>
  );
}

function MedicationInsights({ patient }) {
  const insights = generateInsights(patient).filter((i) => i.category === CATEGORIES.MEDICATION);
  adherenceTimePattern(patient);
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
      {tab === "list" && <MedicationsList patient={patient} updatePatient={updatePatient} />}
      {tab === "calendar" && <MedicationCalendar patient={patient} />}
      {tab === "history" && <MedicationHistory patient={patient} />}
      {tab === "adherence" && <Adherence patient={patient} />}
      {tab === "interactions" && <Interactions patient={patient} />}
      {tab === "insights" && <MedicationInsights patient={patient} />}
    </div>
  );
}
