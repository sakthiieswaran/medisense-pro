import React, { useState, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from "recharts";
import {
  HeartPulse, Activity as ActivityIcon, Moon, Apple, Ruler, Wind, Footprints, Smile,
  ChevronLeft, Plus, Droplets, Gauge, Thermometer, Clock, History as HistoryIcon, TrendingUp,
  Pencil, Trash2, ArrowUp, ArrowDown, Minus,
} from "lucide-react";
import {
  COLORS, Card, Heading, EmptyState, Field, Select, SegmentedControl, TrendPill, StatChip,
  IconBadge, RingProgress, uid, todayISO, addDays, toast, round1, computeBMI, bmiCategory,
} from "../shared.jsx";
import {
  VITAL_METRICS, metricSeries, seriesStats, metricStatus, computeTrend, CATEGORIES,
  timelineEvents, healthTrendSummaries,
} from "../data/healthRecords.js";

/* =========================================================================
   Health module
   Categories: Vitals · Activity · Sleep · Body · Nutrition · Hydration ·
   Mobility · Mental Wellbeing, plus a unified Timeline and a Trends page.
   ========================================================================= */

const RANGE_OPTIONS = [
  { value: 7, label: "7D" }, { value: 30, label: "30D" }, { value: 90, label: "3M" },
  { value: 180, label: "6M" }, { value: 365, label: "1Y" },
];

const CATEGORY_TABS = [
  { id: "vitals", label: "Vitals", icon: HeartPulse },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "sleep", label: "Sleep", icon: Moon },
  { id: "body", label: "Body", icon: Ruler },
  { id: "nutrition", label: "Nutrition", icon: Apple },
  { id: "hydration", label: "Hydration", icon: Droplets },
  { id: "mobility", label: "Mobility", icon: Footprints },
  { id: "mental", label: "Mental Wellbeing", icon: Smile },
  { id: "trends", label: "Trends", icon: TrendingUp },
  { id: "timeline", label: "Timeline", icon: HistoryIcon },
];

/* ---- Custom Tooltip ---- */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: "var(--color-card)",
      border: `1px solid var(--color-hair)`,
      borderRadius: 12,
      boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
      padding: "8px 12px",
      fontSize: 12,
    }}>
      <div style={{ color: COLORS.inkSoft, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || COLORS.ink, fontWeight: 600 }}>
          {p.name ? `${p.name}: ` : ""}{p.value}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- reusable metric detail -------------------------------- */

export function MetricDetail({ patient, metricKey, updatePatient, onBack }) {
  const [range, setRange] = useState(30);
  const [showAdd, setShowAdd] = useState(false);
  const [val, setVal] = useState("");
  const [val2, setVal2] = useState("");
  const [editingDate, setEditingDate] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [editVal2, setEditVal2] = useState("");
  const def = VITAL_METRICS[metricKey];
  const series = useMemo(() => metricSeries(patient, metricKey, range), [patient, metricKey, range]);
  const stats = seriesStats(series);
  const status = metricStatus(def, stats.latest);
  const trend = computeTrend(series);

  const chartData = series.map((s) => ({ date: s.date.slice(5), value: s.value, secondary: s.secondary }));

  const addReading = async () => {
    if (!val) return;
    await updatePatient(patient.id, (p) => {
      const today = todayISO();
      const existing = p.healthRecords.find((r) => r.date === today);
      const patch = metricKey === "bloodPressure"
        ? { systolic: Number(val), diastolic: Number(val2 || 0), source: "MediSense manual entry" }
        : { [metricKey]: Number(val), source: "MediSense manual entry" };
      const healthRecords = existing
        ? p.healthRecords.map((r) => (r.date === today ? { ...r, ...patch } : r))
        : [...p.healthRecords, { id: uid(), date: today, ...patch }];
      return { ...p, healthRecords };
    });
    setVal(""); setVal2(""); setShowAdd(false);
    toast(`${def.label} reading added`);
  };

  const saveEditReading = async (date) => {
    if (!editVal || !updatePatient) return;
    await updatePatient(patient.id, (p) => ({
      ...p,
      healthRecords: p.healthRecords.map((r) => {
        if (r.date !== date) return r;
        return metricKey === "bloodPressure"
          ? { ...r, systolic: Number(editVal), diastolic: Number(editVal2 || r.diastolic || 0), source: "MediSense manual entry" }
          : { ...r, [metricKey]: Number(editVal), source: "MediSense manual entry" };
      }),
    }));
    setEditingDate(null);
    toast("Reading updated");
  };

  const deleteReading = async (date) => {
    if (!updatePatient) return;
    await updatePatient(patient.id, (p) => ({
      ...p,
      healthRecords: p.healthRecords.map((r) => {
        if (r.date !== date) return r;
        const copy = { ...r };
        if (metricKey === "bloodPressure") {
          delete copy.systolic;
          delete copy.diastolic;
        } else {
          delete copy[metricKey];
        }
        return copy;
      }),
    }));
    toast("Reading deleted");
  };

  const chartHeight = typeof window !== "undefined" && window.innerWidth < 640 ? 200 : 280;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-8 h-8 rounded-full"
          style={{ background: COLORS.surface2, color: COLORS.inkSoft }}
          aria-label="Back to Health"
        >
          <ChevronLeft size={16} />
        </button>
        <div>
          <div className="text-[13px]" style={{ color: COLORS.inkSoft }}>{def.unit}</div>
          <Heading size={22}>{def.label}</Heading>
        </div>
      </div>

      {/* Stats row: Latest | Min | Max | Avg */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Latest", value: stats.latest ?? "—" },
          { label: "Minimum", value: stats.min ?? "—" },
          { label: "Maximum", value: stats.max ?? "—" },
          { label: "Average", value: stats.avg ?? "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-[14px] p-3 text-center" style={{ background: COLORS.surface2 }}>
            <div className="text-[11.5px] font-medium mb-1" style={{ color: COLORS.inkSoft }}>{s.label}</div>
            <div className="text-[18px] font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Chart card */}
      <Card className="p-5 mt-2">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
          <div className="flex items-center gap-2">
            {Array.isArray(def.normal) && (
              <span className="text-[11.5px] px-2.5 py-0.5 rounded-full" style={{ background: COLORS.successSoft, color: COLORS.success }}>
                Target: {def.normal[0]}–{def.normal[1]} {def.unit}
              </span>
            )}
            <TrendPill direction={trend.direction} label={trend.direction === "stable" ? "Stable" : `${trend.changePct > 0 ? "+" : ""}${trend.changePct}%`} />
          </div>
        </div>
        {chartData.length === 0 ? (
          <EmptyState icon={HeartPulse} title="No readings yet" body="Add a reading to start tracking this metric." />
        ) : (
          <div style={{ width: "100%", height: chartHeight }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={COLORS.hair} vertical={false} strokeDasharray="0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-ink-soft)" }} axisLine={{ stroke: COLORS.hair, strokeWidth: 1 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                <Tooltip content={<CustomTooltip />} />
                {Array.isArray(def.normal) && def.normal.length === 2 && (
                  <ReferenceArea y1={def.normal[0]} y2={def.normal[1]} fill={COLORS.successSoft} fillOpacity={0.35} />
                )}
                <Line type="monotone" dataKey="value" stroke={COLORS.primary} strokeWidth={2.5} dot={false} />
                {metricKey === "bloodPressure" && <Line type="monotone" dataKey="secondary" stroke={COLORS.lavender} strokeWidth={2} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Add reading */}
      {updatePatient && (
        <Card className="p-5 mt-4">
          <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Add Reading</div>
          {!showAdd ? (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 text-[13.5px] font-medium" style={{ color: COLORS.primary }}>
              <Plus size={15} /> Add a reading
            </button>
          ) : (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-32"><Field label={metricKey === "bloodPressure" ? "Systolic" : def.label} value={val} onChange={(e) => setVal(e.target.value)} type="number" /></div>
              {metricKey === "bloodPressure" && <div className="w-32"><Field label="Diastolic" value={val2} onChange={(e) => setVal2(e.target.value)} type="number" /></div>}
              <button onClick={addReading} className="text-[13.5px] font-medium px-4 py-2.5 rounded-[10px] text-white" style={{ background: COLORS.primary }}>Save</button>
              <button onClick={() => setShowAdd(false)} className="text-[13.5px] font-medium px-4 py-2.5 rounded-[10px] border" style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>Cancel</button>
            </div>
          )}
        </Card>
      )}

      {/* History */}
      <Card className="p-5 mt-4">
        <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>History</div>
        <div className="space-y-1 max-h-[320px] overflow-y-auto">
          {[...series].reverse().map((s, i) => (
            <div key={s.date + i} className="py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              {editingDate === s.date ? (
                <div className="flex items-end gap-2 flex-wrap">
                  <span className="text-[12.5px] mr-1" style={{ color: COLORS.inkSoft }}>{s.date}</span>
                  <div className="w-24"><Field label={metricKey === "bloodPressure" ? "Sys" : "Value"} type="number" value={editVal} onChange={(e) => setEditVal(e.target.value)} /></div>
                  {metricKey === "bloodPressure" && <div className="w-24"><Field label="Dia" type="number" value={editVal2} onChange={(e) => setEditVal2(e.target.value)} /></div>}
                  <button onClick={() => saveEditReading(s.date)} className="text-[12.5px] font-medium px-3 py-1.5 rounded-[8px] text-white" style={{ background: COLORS.primary }}>Save</button>
                  <button onClick={() => setEditingDate(null)} className="text-[12.5px] px-2.5 py-1.5" style={{ color: COLORS.inkSoft }}>Cancel</button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 text-[13.5px]">
                  <span style={{ color: COLORS.inkSoft }}>{s.date}</span>
                  <span className="font-semibold tabular-nums">{s.value}{metricKey === "bloodPressure" ? `/${s.secondary}` : ""} <span className="text-[12px] font-normal" style={{ color: COLORS.inkSoft }}>{def.unit}</span></span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] hidden sm:inline" style={{ color: COLORS.inkFaint }}>{s.source || "manual"}</span>
                    {updatePatient && (
                      <>
                        <button
                          onClick={() => { setEditingDate(s.date); setEditVal(String(s.value)); setEditVal2(s.secondary != null ? String(s.secondary) : ""); }}
                          aria-label={`Edit reading from ${s.date}`}
                          className="p-1.5 rounded-full hover:bg-black/5"
                          style={{ color: COLORS.inkSoft }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => deleteReading(s.date)}
                          aria-label={`Delete reading from ${s.date}`}
                          className="p-1.5 rounded-full hover:bg-black/5"
                          style={{ color: COLORS.danger }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {series.length === 0 && <EmptyState icon={HeartPulse} title="No history" body="Add readings to see history here." />}
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------- vitals -------------------------------- */

function TrendArrow({ direction }) {
  if (direction === "up") return <ArrowUp size={12} style={{ color: COLORS.success }} />;
  if (direction === "down") return <ArrowDown size={12} style={{ color: COLORS.danger }} />;
  return <Minus size={12} style={{ color: COLORS.inkFaint }} />;
}

function VitalsGrid({ patient, goToMetric }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Object.values(VITAL_METRICS).filter((d) => d.category === CATEGORIES.VITALS).map((def) => {
        const series = metricSeries(patient, def.key, 7);
        const stats = seriesStats(series);
        const trend = computeTrend(series);
        const status = metricStatus(def, stats.latest);
        return (
          <button
            key={def.key}
            onClick={() => goToMetric(def.key)}
            className="text-left group"
          >
            <Card className="p-4 h-full transition-shadow duration-150 group-hover:shadow-md" style={{ cursor: "pointer" }}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[12px] font-medium" style={{ color: COLORS.inkSoft }}>{def.label}</div>
                <TrendArrow direction={trend.direction} />
              </div>
              <div className="text-[22px] font-bold mt-1 tabular-nums" style={{ letterSpacing: "-0.02em" }}>
                {stats.latest != null ? stats.latest : "—"}
                <span className="text-[12px] font-normal ml-1" style={{ color: COLORS.inkSoft }}>{def.unit}</span>
              </div>
              {status && (
                <div className="mt-2">
                  <TrendPill direction={status.tone} label={status.label} />
                </div>
              )}
            </Card>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------- activity -------------------------------- */

const WORKOUT_TYPES = ["Walking", "Running", "Cycling", "Swimming", "Strength training", "Yoga", "HIIT", "Other"];

function ActivitySection({ patient, updatePatient }) {
  const [range, setRange] = useState(30);
  const [showForm, setShowForm] = useState(false);
  const [showStepsForm, setShowStepsForm] = useState(false);
  const [form, setForm] = useState({ type: "Walking", durationMin: "", distanceKm: "", calories: "", avgHeartRate: "", notes: "" });
  const [stepForm, setStepForm] = useState({ steps: "", distanceKm: "", activeEnergyKcal: "", exerciseMinutes: "" });
  const cutoff = addDays(todayISO(), -range);
  const activity = (patient.activity || []).filter((a) => a.date >= cutoff);
  const todayAct = (patient.activity || []).find((a) => a.date === todayISO());
  const stepGoal = patient.goals?.steps || 8000;
  const chartData = activity.map((a) => ({ date: a.date.slice(5), steps: a.steps }));
  const totals = activity.reduce((acc, a) => ({ steps: acc.steps + a.steps, distance: acc.distance + a.distanceKm, energy: acc.energy + a.activeEnergyKcal, exercise: acc.exercise + a.exerciseMinutes }), { steps: 0, distance: 0, energy: 0, exercise: 0 });
  const workouts = (patient.workouts || []).filter((w) => w.date >= cutoff);

  const saveDailySteps = async () => {
    if (!stepForm.steps) return;
    const today = todayISO();
    const steps = Number(stepForm.steps);
    const entry = {
      id: uid(),
      date: today,
      steps,
      distanceKm: stepForm.distanceKm ? Number(stepForm.distanceKm) : round1((steps * 0.75) / 1000),
      activeEnergyKcal: stepForm.activeEnergyKcal ? Number(stepForm.activeEnergyKcal) : Math.round(steps * 0.04),
      exerciseMinutes: stepForm.exerciseMinutes ? Number(stepForm.exerciseMinutes) : Math.round(steps / 100),
    };
    await updatePatient(patient.id, (p) => {
      const exists = (p.activity || []).some((a) => a.date === today);
      const next = exists
        ? p.activity.map((a) => (a.date === today ? { ...a, ...entry } : a))
        : [...(p.activity || []), entry];
      return { ...p, activity: next };
    });
    setStepForm({ steps: "", distanceKm: "", activeEnergyKcal: "", exerciseMinutes: "" });
    setShowStepsForm(false);
    toast("Daily activity saved");
  };

  const saveWorkout = async () => {
    if (!form.durationMin) return;
    await updatePatient(patient.id, (p) => ({
      ...p,
      workouts: [{ id: uid(), date: todayISO(), type: form.type, durationMin: Number(form.durationMin), distanceKm: form.distanceKm ? Number(form.distanceKm) : null, calories: Number(form.calories) || 0, avgHeartRate: Number(form.avgHeartRate) || null, notes: form.notes }, ...(p.workouts || [])],
    }));
    setForm({ type: "Walking", durationMin: "", distanceKm: "", calories: "", avgHeartRate: "", notes: "" });
    setShowForm(false);
    toast("Workout logged");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SegmentedControl options={RANGE_OPTIONS.slice(0, 3)} value={range} onChange={setRange} />
        <button onClick={() => setShowStepsForm((s) => !s)} className="flex items-center gap-1 text-[13px] font-medium px-3 py-1.5 rounded-[10px] border" style={{ borderColor: COLORS.hair, color: COLORS.primary }}>
          <Plus size={14} /> Log today's steps
        </button>
      </div>

      {showStepsForm && (
        <Card className="p-4 mb-4">
          <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Today's Steps</div>
          <div className="grid sm:grid-cols-4 gap-3">
            <Field label="Steps" type="number" value={stepForm.steps} onChange={(e) => setStepForm((f) => ({ ...f, steps: e.target.value }))} />
            <Field label="Distance (km)" type="number" value={stepForm.distanceKm} onChange={(e) => setStepForm((f) => ({ ...f, distanceKm: e.target.value }))} />
            <Field label="Energy (kcal)" type="number" value={stepForm.activeEnergyKcal} onChange={(e) => setStepForm((f) => ({ ...f, activeEnergyKcal: e.target.value }))} />
            <Field label="Exercise (min)" type="number" value={stepForm.exerciseMinutes} onChange={(e) => setStepForm((f) => ({ ...f, exerciseMinutes: e.target.value }))} />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={saveDailySteps} className="text-[13px] font-medium px-4 py-2 rounded-[10px] text-white" style={{ background: COLORS.primary }}>Save activity</button>
            <button onClick={() => setShowStepsForm(false)} className="text-[13px] px-3 py-2" style={{ color: COLORS.inkSoft }}>Cancel</button>
          </div>
        </Card>
      )}

      <Card className="p-4 mb-4 flex items-center gap-4">
        <RingProgress value={todayAct?.steps || 0} max={stepGoal} color={COLORS.success} size={64} />
        <div>
          <div className="text-[13px] font-medium" style={{ color: COLORS.inkSoft }}>Today's step goal</div>
          <div className="text-[20px] font-semibold tabular-nums">{(todayAct?.steps || 0).toLocaleString()} <span className="text-[13px] font-normal" style={{ color: COLORS.inkSoft }}>/ {stepGoal.toLocaleString()} steps</span></div>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatChip icon={Footprints} tint={COLORS.successSoft} fg={COLORS.success} label="Steps" value={totals.steps.toLocaleString()} />
        <StatChip icon={ActivityIcon} tint={COLORS.infoSoft} fg={COLORS.info} label="Distance" value={`${round1(totals.distance)} km`} />
        <StatChip icon={Gauge} tint={COLORS.warningSoft} fg={COLORS.amber} label="Active Energy" value={`${totals.energy} kcal`} />
        <StatChip icon={Clock} tint={COLORS.lavenderSoft} fg={COLORS.lavender} label="Exercise" value={`${totals.exercise} min`} />
      </div>
      <Card className="p-5 mb-4">
        <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Steps</div>
        {chartData.length === 0 ? (
          <EmptyState icon={Footprints} title="No step data recorded" body="Log today's steps to start viewing your daily activity chart." />
        ) : (
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid stroke={COLORS.hair} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="steps" fill={COLORS.success} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold" style={{ color: COLORS.inkSoft }}>Workouts</div>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-[13px] font-medium" style={{ color: COLORS.primary }}><Plus size={14} /> Log workout</button>
        </div>
        {showForm && (
          <div className="grid sm:grid-cols-2 gap-3 mb-4 p-4 rounded-[16px]" style={{ background: COLORS.surface2 }}>
            <Select label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} options={WORKOUT_TYPES} />
            <Field label="Duration (min)" type="number" value={form.durationMin} onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))} />
            <Field label="Distance (km)" type="number" value={form.distanceKm} onChange={(e) => setForm((f) => ({ ...f, distanceKm: e.target.value }))} />
            <Field label="Calories" type="number" value={form.calories} onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))} />
            <Field label="Avg heart rate" type="number" value={form.avgHeartRate} onChange={(e) => setForm((f) => ({ ...f, avgHeartRate: e.target.value }))} />
            <div className="sm:col-span-2 flex gap-2">
              <button onClick={saveWorkout} className="text-[13.5px] font-medium px-4 py-2.5 rounded-[10px] text-white" style={{ background: COLORS.primary }}>Save workout</button>
              <button onClick={() => setShowForm(false)} className="text-[13.5px] px-4 py-2.5" style={{ color: COLORS.inkSoft }}>Cancel</button>
            </div>
          </div>
        )}
        {workouts.length === 0 ? <EmptyState icon={ActivityIcon} title="No workouts logged" body="Log a workout to see it here." /> : (
          <div className="space-y-2">
            {workouts.map((w) => (
              <div key={w.id} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
                <IconBadge icon={ActivityIcon} tint={COLORS.successSoft} fg={COLORS.success} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium">{w.type} · {w.durationMin} min</div>
                  <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{w.date} {w.distanceKm ? `· ${w.distanceKm} km` : ""} {w.calories ? `· ${w.calories} kcal` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------- sleep -------------------------------- */

function SleepSection({ patient, updatePatient }) {
  const [range, setRange] = useState(14);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: todayISO(), durationHours: "7.5", bedtime: "23:00", wake: "06:30", score: "82" });
  const cutoff = addDays(todayISO(), -range);
  const sleep = (patient.sleep || []).filter((s) => s.date >= cutoff);
  const chartData = sleep.map((s) => ({ date: s.date.slice(5), hours: round1(s.durationMin / 60) }));
  const avgHours = sleep.length ? round1(sleep.reduce((a, s) => a + s.durationMin, 0) / sleep.length / 60) : 0;
  const avgScore = sleep.length ? Math.round(sleep.reduce((a, s) => a + s.score, 0) / sleep.length) : 0;
  const last = sleep[sleep.length - 1];
  const sleepGoalH = patient.goals?.sleepHours || 8;

  const saveSleep = async () => {
    const mins = Math.round(Number(form.durationHours) * 60);
    if (!mins || mins <= 0) return;
    const entry = {
      id: uid(),
      date: form.date || todayISO(),
      durationMin: mins,
      bedtime: form.bedtime || "23:00",
      wake: form.wake || "06:30",
      score: Math.min(100, Math.max(0, Number(form.score) || 80)),
      stages: {
        deep: Math.round(mins * 0.2),
        rem: Math.round(mins * 0.22),
        core: Math.round(mins * 0.52),
        awake: Math.round(mins * 0.06),
      },
    };
    await updatePatient(patient.id, (p) => {
      const exists = (p.sleep || []).some((s) => s.date === entry.date);
      const next = exists
        ? p.sleep.map((s) => (s.date === entry.date ? { ...s, ...entry } : s))
        : [...(p.sleep || []), entry];
      return { ...p, sleep: next };
    });
    setShowForm(false);
    toast("Sleep entry saved");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SegmentedControl options={[{ value: 7, label: "7D" }, { value: 14, label: "14D" }, { value: 30, label: "30D" }]} value={range} onChange={setRange} />
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-[13px] font-medium px-3 py-1.5 rounded-[10px] border" style={{ borderColor: COLORS.hair, color: COLORS.primary }}>
          <Plus size={14} /> Log sleep
        </button>
      </div>

      {showForm && (
        <Card className="p-4 mb-4">
          <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Log Sleep</div>
          <div className="grid sm:grid-cols-5 gap-3">
            <Field label="Date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            <Field label="Duration (hrs)" type="number" step="0.5" value={form.durationHours} onChange={(e) => setForm((f) => ({ ...f, durationHours: e.target.value }))} />
            <Field label="Bedtime" type="time" value={form.bedtime} onChange={(e) => setForm((f) => ({ ...f, bedtime: e.target.value }))} />
            <Field label="Wake" type="time" value={form.wake} onChange={(e) => setForm((f) => ({ ...f, wake: e.target.value }))} />
            <Field label="Score (0–100)" type="number" value={form.score} onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={saveSleep} className="text-[13px] font-medium px-4 py-2 rounded-[10px] text-white" style={{ background: COLORS.primary }}>Save sleep</button>
            <button onClick={() => setShowForm(false)} className="text-[13px] px-3 py-2" style={{ color: COLORS.inkSoft }}>Cancel</button>
          </div>
        </Card>
      )}

      {last && (
        <Card className="p-4 mb-4 flex items-center gap-4">
          <RingProgress value={round1(last.durationMin / 60)} max={sleepGoalH} color={COLORS.lavender} size={64} />
          <div>
            <div className="text-[13px] font-medium" style={{ color: COLORS.inkSoft }}>Last night vs {sleepGoalH}h target</div>
            <div className="text-[20px] font-semibold tabular-nums">{round1(last.durationMin / 60)}h <span className="text-[13px] font-normal" style={{ color: COLORS.inkSoft }}>· score {last.score}</span></div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatChip icon={Moon} tint={COLORS.lavenderSoft} fg={COLORS.lavender} label="Avg duration" value={`${avgHours}h`} />
        <StatChip icon={TrendingUp} tint={COLORS.infoSoft} fg={COLORS.info} label="Avg score" value={avgScore} />
        {last && <StatChip icon={Clock} tint={COLORS.warningSoft} fg={COLORS.amber} label="Last bedtime" value={last.bedtime} />}
        {last && <StatChip icon={Clock} tint={COLORS.successSoft} fg={COLORS.success} label="Last wake" value={last.wake} />}
      </div>
      <Card className="p-5 mb-4">
        <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Sleep duration</div>
        {chartData.length === 0 ? (
          <EmptyState icon={Moon} title="No sleep logged" body="Log your sleep duration and schedule to track rest consistency." />
        ) : (
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid stroke={COLORS.hair} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="hours" fill={COLORS.lavender} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      {last && (
        <Card className="p-5">
          <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Last night's stages</div>
          <div className="flex gap-2 h-3 rounded-full overflow-hidden mb-3">
            {["deep", "rem", "core", "awake"].map((k) => (
              <div key={k} style={{ width: `${(last.stages[k] / last.durationMin) * 100}%`, background: k === "deep" ? COLORS.lavender : k === "rem" ? COLORS.info : k === "core" ? COLORS.cyanSoft : COLORS.hair }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-[12.5px]" style={{ color: COLORS.inkSoft }}>
            <span>Deep {last.stages.deep}m</span><span>REM {last.stages.rem}m</span><span>Core {last.stages.core}m</span><span>Awake {last.stages.awake}m</span>
          </div>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------- body -------------------------------- */

function BMIGauge({ bmi, bmiInfo }) {
  if (bmi == null) return null;
  // Clamp BMI between 15–40 for display
  const pct = Math.min(100, Math.max(0, ((bmi - 15) / (40 - 15)) * 100));
  const color = bmiInfo?.tone === "good" ? COLORS.success : bmiInfo?.tone === "monitor" ? COLORS.amber : COLORS.danger;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11.5px] mb-1" style={{ color: COLORS.inkSoft }}>
        <span>Underweight</span><span>Normal</span><span>Overweight</span><span>Obese</span>
      </div>
      <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: COLORS.surface2 }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 999, transition: "width 0.4s" }} />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[20px] font-bold tabular-nums">{bmi}</span>
        {bmiInfo && <TrendPill direction={bmiInfo.tone} label={bmiInfo.label} />}
      </div>
    </div>
  );
}

function BodySection({ patient, updatePatient }) {
  const body = patient.body || {};
  const weightRecords = (patient.healthRecords || []).filter((r) => r.weight != null);
  const latestWeight = weightRecords[weightRecords.length - 1]?.weight ?? body.history?.[body.history.length - 1]?.weightKg;
  const bmi = computeBMI(latestWeight, body.heightCm);
  const bmiInfo = bmiCategory(bmi);
  const [weight, setWeight] = useState("");
  const [editingMetrics, setEditingMetrics] = useState(false);
  const [bodyForm, setBodyForm] = useState({
    heightCm: body.heightCm ?? "",
    bodyFatPct: body.bodyFatPct ?? "",
    leanMassKg: body.leanMassKg ?? "",
    waistCm: body.waistCm ?? "",
  });

  const logWeight = async () => {
    if (!weight) return;
    await updatePatient(patient.id, (p) => {
      const today = todayISO();
      const existing = p.healthRecords.find((r) => r.date === today);
      const healthRecords = existing
        ? p.healthRecords.map((r) => (r.date === today ? { ...r, weight: Number(weight) } : r))
        : [...p.healthRecords, { id: uid(), date: today, weight: Number(weight) }];
      return { ...p, healthRecords, body: { ...p.body, history: [...(p.body?.history || []), { id: uid(), date: today, weightKg: Number(weight) }] } };
    });
    setWeight("");
    toast("Weight logged");
  };

  const saveBodyProfile = async () => {
    await updatePatient(patient.id, (p) => ({
      ...p,
      body: {
        ...(p.body || {}),
        heightCm: bodyForm.heightCm ? Number(bodyForm.heightCm) : null,
        bodyFatPct: bodyForm.bodyFatPct ? Number(bodyForm.bodyFatPct) : null,
        leanMassKg: bodyForm.leanMassKg ? Number(bodyForm.leanMassKg) : null,
        waistCm: bodyForm.waistCm ? Number(bodyForm.waistCm) : null,
      },
    }));
    setEditingMetrics(false);
    toast("Body measurements updated");
  };

  const deleteWeightEntry = async (idxFromStart) => {
    await updatePatient(patient.id, (p) => ({
      ...p,
      body: {
        ...(p.body || {}),
        history: (p.body?.history || []).filter((_, i) => i !== idxFromStart),
      },
    }));
    toast("Weight history entry removed");
  };

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Card className="p-4"><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Weight</div><div className="text-[20px] font-semibold mt-1">{latestWeight ?? "—"} kg</div></Card>
        <Card className="p-4"><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Height</div><div className="text-[20px] font-semibold mt-1">{body.heightCm ?? "—"} cm</div></Card>
        <Card className="p-4 sm:col-span-1 col-span-2">
          <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>BMI</div>
          <BMIGauge bmi={bmi} bmiInfo={bmiInfo} />
        </Card>
        <Card className="p-4"><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Body fat</div><div className="text-[20px] font-semibold mt-1">{body.bodyFatPct ?? "—"}%</div></Card>
        <Card className="p-4"><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Lean mass</div><div className="text-[20px] font-semibold mt-1">{body.leanMassKg ?? "—"} kg</div></Card>
        <Card className="p-4"><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Waist</div><div className="text-[20px] font-semibold mt-1">{body.waistCm ?? "—"} cm</div></Card>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Log weight</div>
          <div className="flex items-end gap-3">
            <div className="w-40"><Field label="Weight (kg)" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
            <button onClick={logWeight} className="text-[13.5px] font-medium px-4 py-2.5 rounded-[10px] text-white" style={{ background: COLORS.primary }}>Save</button>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-semibold" style={{ color: COLORS.inkSoft }}>Edit body profile</div>
            <button onClick={() => setEditingMetrics((v) => !v)} className="text-[12.5px] font-medium" style={{ color: COLORS.primary }}>
              {editingMetrics ? "Close" : "Edit"}
            </button>
          </div>
          {editingMetrics ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Height (cm)" type="number" value={bodyForm.heightCm} onChange={(e) => setBodyForm((f) => ({ ...f, heightCm: e.target.value }))} />
              <Field label="Body fat (%)" type="number" step="0.1" value={bodyForm.bodyFatPct} onChange={(e) => setBodyForm((f) => ({ ...f, bodyFatPct: e.target.value }))} />
              <Field label="Lean mass (kg)" type="number" step="0.1" value={bodyForm.leanMassKg} onChange={(e) => setBodyForm((f) => ({ ...f, leanMassKg: e.target.value }))} />
              <Field label="Waist (cm)" type="number" step="0.1" value={bodyForm.waistCm} onChange={(e) => setBodyForm((f) => ({ ...f, waistCm: e.target.value }))} />
              <div className="col-span-2">
                <button onClick={saveBodyProfile} className="text-[13px] font-medium px-4 py-2 rounded-[10px] text-white" style={{ background: COLORS.primary }}>Save profile</button>
              </div>
            </div>
          ) : (
            <p className="text-[13px]" style={{ color: COLORS.inkSoft }}>Keep height up to date for automatic BMI calculation.</p>
          )}
        </Card>
      </div>
      {(body.history || []).length > 0 && (
        <Card className="p-5 mt-4">
          <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Weight history</div>
          <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
            {[...(body.history || [])].map((entry, idx) => ({ entry, idx })).reverse().map(({ entry, idx }) => (
              <div key={entry.id || `${entry.date}-${idx}`} className="flex items-center justify-between text-[13.5px] py-1.5 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
                <span style={{ color: COLORS.inkSoft }}>{entry.date}</span>
                <span className="font-medium">{entry.weightKg} kg</span>
                <button onClick={() => deleteWeightEntry(idx)} aria-label="Delete weight entry" className="p-1 rounded-full hover:bg-black/5" style={{ color: COLORS.danger }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------- nutrition + hydration -------------------------------- */

function NutritionSection({ patient, updatePatient }) {
  const today = todayISO();
  const meals = (patient.nutrition || []).filter((n) => n.date === today);
  const totals = meals.reduce((a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.proteinG, carbs: a.carbs + m.carbsG, fat: a.fat + m.fatG }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const activeBurned = (patient.activity || []).find((a) => a.date === today)?.activeEnergyKcal || 0;
  const netCalories = totals.calories - activeBurned;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", calories: "", proteinG: "", carbsG: "", fatG: "" });

  const saveMeal = async () => {
    if (!form.name || !form.calories) return;
    await updatePatient(patient.id, (p) => ({
      ...p, nutrition: [...(p.nutrition || []), { id: uid(), date: today, time: new Date().toTimeString().slice(0, 5), name: form.name, calories: Number(form.calories), proteinG: Number(form.proteinG) || 0, carbsG: Number(form.carbsG) || 0, fatG: Number(form.fatG) || 0, fiberG: 0, sodiumMg: 0, caffeineMg: 0 }],
    }));
    setForm({ name: "", calories: "", proteinG: "", carbsG: "", fatG: "" });
    setShowForm(false);
    toast("Meal logged");
  };

  const deleteMeal = async (mealId) => {
    await updatePatient(patient.id, (p) => ({
      ...p,
      nutrition: (p.nutrition || []).filter((m) => m.id !== mealId),
    }));
    toast("Meal deleted");
  };

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatChip icon={Apple} tint={COLORS.warningSoft} fg={COLORS.amber} label="Calories in" value={totals.calories} />
        <StatChip icon={Apple} tint={COLORS.successSoft} fg={COLORS.success} label="Protein" value={`${totals.protein}g`} />
        <StatChip icon={Apple} tint={COLORS.infoSoft} fg={COLORS.info} label="Carbs" value={`${totals.carbs}g`} />
        <StatChip icon={Apple} tint={COLORS.lavenderSoft} fg={COLORS.lavender} label="Fat" value={`${totals.fat}g`} />
      </div>
      <Card className="p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Today's calorie balance</div>
          <div className="text-[15px] font-semibold">Intake {totals.calories} kcal − Active burn {activeBurned} kcal = {netCalories} net kcal</div>
        </div>
        <TrendPill direction={netCalories > 2400 ? "monitor" : "stable"} label={netCalories > 2400 ? "Surplus" : "Balanced"} />
      </Card>
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold" style={{ color: COLORS.inkSoft }}>Today's meals</div>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-[13px] font-medium" style={{ color: COLORS.primary }}><Plus size={14} /> Log meal</button>
        </div>
        {showForm && (
          <div className="grid sm:grid-cols-2 gap-3 mb-4 p-4 rounded-[16px]" style={{ background: COLORS.surface2 }}>
            <Field label="Meal / food" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Field label="Calories" type="number" value={form.calories} onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))} />
            <Field label="Protein (g)" type="number" value={form.proteinG} onChange={(e) => setForm((f) => ({ ...f, proteinG: e.target.value }))} />
            <Field label="Carbs (g)" type="number" value={form.carbsG} onChange={(e) => setForm((f) => ({ ...f, carbsG: e.target.value }))} />
            <Field label="Fat (g)" type="number" value={form.fatG} onChange={(e) => setForm((f) => ({ ...f, fatG: e.target.value }))} />
            <div className="flex gap-2 mt-1">
              <button onClick={saveMeal} className="text-[13.5px] font-medium px-4 py-2.5 rounded-[10px] text-white" style={{ background: COLORS.primary }}>Save</button>
              <button onClick={() => setShowForm(false)} className="text-[13.5px] px-4 py-2.5" style={{ color: COLORS.inkSoft }}>Cancel</button>
            </div>
          </div>
        )}
        {meals.length === 0 ? <EmptyState icon={Apple} title="No meals logged today" body="Log a meal to track your nutrition." /> : (
          <div className="space-y-2">
            {meals.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-[13.5px] py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
                <span className="font-medium">{m.name}</span>
                <div className="flex items-center gap-3">
                  <span style={{ color: COLORS.inkSoft }}>{m.calories} kcal · {m.time}</span>
                  <button onClick={() => deleteMeal(m.id)} aria-label={`Delete ${m.name}`} className="p-1 rounded-full hover:bg-black/5" style={{ color: COLORS.danger }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function HydrationSection({ patient, updatePatient }) {
  const today = todayISO();
  const list = patient.hydration || [];
  const rec = list.find((h) => h.date === today) || { ml: 0, targetMl: 2000 };
  const [targetInput, setTargetInput] = useState(String(rec.targetMl || 2000));
  const last7 = list.filter((h) => h.date >= addDays(today, -6)).map((h) => ({ date: h.date.slice(5), ml: h.ml }));

  const addWater = async (delta) => {
    await updatePatient(patient.id, (p) => {
      const existing = p.hydration?.find((h) => h.date === today);
      const hydration = existing
        ? p.hydration.map((h) => (h.date === today ? { ...h, ml: Math.max(0, h.ml + delta) } : h))
        : [...(p.hydration || []), { id: uid(), date: today, ml: Math.max(0, delta), targetMl: Number(targetInput) || 2000 }];
      return { ...p, hydration };
    });
  };

  const updateTarget = async () => {
    const t = Math.max(500, Number(targetInput) || 2000);
    await updatePatient(patient.id, (p) => {
      const existing = p.hydration?.find((h) => h.date === today);
      const hydration = existing
        ? p.hydration.map((h) => (h.date === today ? { ...h, targetMl: t } : h))
        : [...(p.hydration || []), { id: uid(), date: today, ml: 0, targetMl: t }];
      return { ...p, hydration };
    });
    toast(`Daily hydration goal set to ${t} ml`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-4">
            <RingProgress value={rec.ml} max={rec.targetMl} color={COLORS.info} size={64} />
            <div>
              <div className="text-[13px] font-semibold" style={{ color: COLORS.inkSoft }}>Hydration — today</div>
              <div className="text-[22px] font-semibold mt-0.5 tabular-nums">{rec.ml} ml <span className="text-[13px] font-normal" style={{ color: COLORS.inkSoft }}>/ {rec.targetMl} ml</span></div>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-28"><Field label="Goal (ml)" type="number" step="100" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} /></div>
            <button onClick={updateTarget} className="text-[12.5px] font-medium px-3 py-2 rounded-[10px] border" style={{ borderColor: COLORS.hair, color: COLORS.primary }}>Set</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[250, 500, 750].map((ml) => (
            <button key={ml} onClick={() => addWater(ml)} className="text-[13px] font-medium px-3.5 py-2 rounded-[10px] border" style={{ borderColor: COLORS.hair, color: COLORS.info }}>+{ml} ml</button>
          ))}
          {rec.ml > 0 && (
            <button onClick={() => addWater(-250)} className="text-[13px] font-medium px-3.5 py-2 rounded-[10px] border" style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>-250 ml</button>
          )}
        </div>
      </Card>
      {last7.length > 0 && (
        <Card className="p-5">
          <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>7-day intake</div>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer>
              <BarChart data={last7}>
                <CartesianGrid stroke={COLORS.hair} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-ink-soft)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ml" fill={COLORS.info} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------- mobility + mental wellbeing -------------------------------- */

function MobilitySection({ patient }) {
  const latest = (patient.mobility || [])[patient.mobility.length - 1];
  return (
    <div>
      <p className="text-[13px] mb-4" style={{ color: COLORS.inkSoft }}>Mobility metrics are shown from manual/demo data today; device-based measurement will use the same data model once a supported sensor is connected.</p>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4"><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Walking speed</div><div className="text-[20px] font-semibold mt-1">{latest?.walkingSpeedKmh ?? "—"} km/h</div></Card>
        <Card className="p-4"><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Walking steadiness</div><div className="text-[20px] font-semibold mt-1">{latest?.stepsSteadinessPct ?? "—"}%</div></Card>
        <Card className="p-4"><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Step length</div><div className="text-[20px] font-semibold mt-1">{latest?.stepLengthCm ?? "—"} cm</div></Card>
        <Card className="p-4"><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>Stair speed</div><div className="text-[20px] font-semibold mt-1">{latest?.stairSpeedStepsPerSec ?? "—"} steps/s</div></Card>
      </div>
    </div>
  );
}

function MentalWellbeingSection({ patient, updatePatient }) {
  const [journal, setJournal] = useState("");
  const recent = (patient.mentalWellbeing || []).slice(-7).reverse();
  const logMood = async (mood) => {
    await updatePatient(patient.id, (p) => ({ ...p, mentalWellbeing: [...(p.mentalWellbeing || []), { id: uid(), date: todayISO(), mood, stressLevel: null, mindfulMinutes: 0, journal: "" }] }));
    toast("Mood logged");
  };
  const saveJournal = async () => {
    if (!journal.trim()) return;
    await updatePatient(patient.id, (p) => ({ ...p, mentalWellbeing: [...(p.mentalWellbeing || []), { id: uid(), date: todayISO(), mood: null, stressLevel: null, mindfulMinutes: 0, journal } ]}));
    setJournal("");
    toast("Journal entry saved");
  };
  return (
    <div>
      <p className="text-[12.5px] mb-4 p-3 rounded-[14px]" style={{ background: COLORS.mint, color: COLORS.inkSoft }}>
        This section is for personal reflection only and is not a diagnostic or clinical tool. If you're struggling, please reach out to a mental health professional.
      </p>
      <Card className="p-5 mb-4">
        <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>How are you feeling today?</div>
        <div className="flex flex-wrap gap-2">
          {["Very good", "Good", "Neutral", "Low", "Very low"].map((m) => (
            <button key={m} onClick={() => logMood(m)} className="text-[13px] font-medium px-3.5 py-2 rounded-full border" style={{ borderColor: COLORS.hair, color: COLORS.ink }}>{m}</button>
          ))}
        </div>
      </Card>
      <Card className="p-5 mb-4">
        <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Journal</div>
        <textarea value={journal} onChange={(e) => setJournal(e.target.value)} rows={3} placeholder="What's on your mind?"
          className="w-full px-3 py-2.5 rounded-[14px] text-[14px] border outline-none focus:ring-2 focus:ring-offset-1"
          style={{ borderColor: COLORS.hair, "--tw-ring-color": COLORS.primary }} />
        <button onClick={saveJournal} className="text-[13.5px] font-medium px-4 py-2.5 rounded-[10px] text-white mt-3" style={{ background: COLORS.primary }}>Save entry</button>
      </Card>
      <Card className="p-5">
        <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Recent entries</div>
        {recent.length === 0 ? <EmptyState icon={Smile} title="No entries yet" body="Log your mood or write a journal entry to see it here." /> : (
          <div className="space-y-2">
            {recent.map((r) => (
              <div key={r.id} className="text-[13.5px] py-1.5 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
                <span style={{ color: COLORS.inkSoft }}>{r.date}</span> — {r.mood || r.journal || "Mindful session"}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------- trends -------------------------------- */

export function HealthTrends({ patient }) {
  const trends = healthTrendSummaries(patient);
  return (
    <div>
      <Heading size={22} className="mb-1">Health Trends</Heading>
      <p className="text-[13px] mb-5" style={{ color: COLORS.inkSoft }}>Based on your recorded data over the last 30 days. This is an observation, not a diagnosis.</p>
      {trends.length === 0 ? <EmptyState icon={TrendingUp} title="Not enough data yet" body="Trends appear once you have a few weeks of readings." /> : (
        <div className="grid sm:grid-cols-2 gap-3">
          {trends.map((t) => (
            <Card key={t.key} className="p-4 flex items-center justify-between">
              <span className="text-[14px] font-medium">{t.label}</span>
              <TrendPill direction={t.direction} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- timeline -------------------------------- */

const TIMELINE_CATEGORIES = [
  { id: "all", label: "All" },
  { id: CATEGORIES.MEDICATION, label: "Medications" },
  { id: CATEGORIES.VITALS, label: "Vitals" },
  { id: CATEGORIES.ACTIVITY, label: "Activity" },
  { id: CATEGORIES.SLEEP, label: "Sleep" },
  { id: CATEGORIES.NUTRITION, label: "Nutrition" },
  { id: CATEGORIES.APPOINTMENT, label: "Appointments" },
];

export function HealthTimeline({ patient }) {
  const [filter, setFilter] = useState("all");
  const [days, setDays] = useState(1);
  const events = timelineEvents(patient, { days }).filter((e) => filter === "all" || e.category === filter);
  const grouped = events.reduce((acc, e) => { (acc[e.date] = acc[e.date] || []).push(e); return acc; }, {});

  return (
    <div>
      <Heading size={22} className="mb-1">Health Timeline</Heading>
      <p className="text-[13px] mb-4" style={{ color: COLORS.inkSoft }}>Every recorded event, in one place.</p>
      <div className="flex flex-wrap gap-2 mb-5">
        <SegmentedControl options={[{ value: 1, label: "Today" }, { value: 7, label: "7D" }, { value: 30, label: "30D" }]} value={days} onChange={setDays} />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-1.5 rounded-full text-[12.5px] font-medium border" style={{ borderColor: COLORS.hair }}>
          {TIMELINE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      {Object.keys(grouped).length === 0 ? <EmptyState icon={HistoryIcon} title="Nothing recorded" body="Events will appear here as you log data." /> : (
        Object.entries(grouped).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, evs]) => (
          <div key={date} className="mb-5">
            <div className="text-[13px] font-semibold mb-2" style={{ color: COLORS.inkSoft }}>{date === todayISO() ? "Today" : date}</div>
            <Card className="p-4">
              {evs.map((e, i) => (
                <div key={e.id} className={`flex items-center gap-3 py-2 ${i < evs.length - 1 ? "border-b" : ""}`} style={{ borderColor: COLORS.hair }}>
                  <span className="text-[12.5px] font-medium w-14 flex-shrink-0" style={{ color: COLORS.inkSoft }}>{e.time}</span>
                  <span className="text-[13.5px]">{e.title}</span>
                </div>
              ))}
            </Card>
          </div>
        ))
      )}
    </div>
  );
}

/* -------------------------------- health hub -------------------------------- */

export default function HealthHub({ patient, updatePatient, initialSection, initialMetric, onConsumeParams }) {
  const [section, setSection] = useState(initialSection || "vitals");
  const [metric, setMetric] = useState(initialMetric || null);

  React.useEffect(() => {
    if (initialSection) setSection(initialSection);
    if (initialMetric) { setSection("vitals"); setMetric(initialMetric); }
    if ((initialSection || initialMetric) && onConsumeParams) onConsumeParams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection, initialMetric]);

  if (metric) return <MetricDetail patient={patient} metricKey={metric} updatePatient={updatePatient} onBack={() => setMetric(null)} />;

  return (
    <div>
      <Heading size={26} className="mb-4">Health</Heading>
      {/* Horizontally scrollable pill tab bar */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-1 mb-5 -mx-1 px-1"
        style={{ scrollbarWidth: "none" }}
      >
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full whitespace-nowrap text-[13px] font-medium flex-shrink-0 focus:outline-none"
            style={{
              background: section === tab.id ? COLORS.primary : COLORS.surface2,
              color: section === tab.id ? "white" : COLORS.inkSoft,
            }}
          >
            <tab.icon size={14} strokeWidth={2.2} />
            {tab.label}
          </button>
        ))}
      </div>
      {section === "vitals" && <VitalsGrid patient={patient} goToMetric={setMetric} />}
      {section === "activity" && <ActivitySection patient={patient} updatePatient={updatePatient} />}
      {section === "sleep" && <SleepSection patient={patient} updatePatient={updatePatient} />}
      {section === "body" && <BodySection patient={patient} updatePatient={updatePatient} />}
      {section === "nutrition" && <NutritionSection patient={patient} updatePatient={updatePatient} />}
      {section === "hydration" && <HydrationSection patient={patient} updatePatient={updatePatient} />}
      {section === "mobility" && <MobilitySection patient={patient} />}
      {section === "mental" && <MentalWellbeingSection patient={patient} updatePatient={updatePatient} />}
      {section === "trends" && <HealthTrends patient={patient} />}
      {section === "timeline" && <HealthTimeline patient={patient} />}
    </div>
  );
}
