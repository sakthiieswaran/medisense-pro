import { todayISO, addDays, round1 } from "../shared.jsx";
import { computeAdherence, missedDaysCount } from "./seed.js";

/* =========================================================================
   Central health-data query layer
   -------------------------------------------------------------------------
   The patient object (see data/seed.js) is the single source of truth.
   Every screen — Today, Health, Trends, Insights, Reports, the Doctor
   view, the Timeline — reads through the functions below instead of
   re-deriving or duplicating values, so "one record → many experiences"
   holds throughout the app.
   ========================================================================= */

export const CATEGORIES = {
  VITALS: "vitals",
  ACTIVITY: "activity",
  SLEEP: "sleep",
  NUTRITION: "nutrition",
  BODY: "body",
  MOBILITY: "mobility",
  MENTAL: "mental_wellbeing",
  MEDICATION: "medication",
  LAB: "lab",
  APPOINTMENT: "appointment",
};

/* Registry of every vital-sign / body metric with a reusable detail page.
   `get` pulls the raw {date, value} series straight from the patient's
   healthRecords/body arrays — the one place this data lives. */
export const VITAL_METRICS = {
  heartRate: { key: "heartRate", label: "Heart Rate", unit: "BPM", category: CATEGORIES.VITALS,
    normal: [60, 100], get: (p) => p.healthRecords.map((r) => ({ date: r.date, value: r.heartRate, source: r.source })) },
  restingHeartRate: { key: "restingHeartRate", label: "Resting Heart Rate", unit: "BPM", category: CATEGORIES.VITALS,
    normal: [50, 80], get: (p) => p.healthRecords.map((r) => ({ date: r.date, value: r.restingHeartRate, source: r.source })).filter((r) => r.value != null) },
  bloodPressure: { key: "bloodPressure", label: "Blood Pressure", unit: "mmHg", category: CATEGORIES.VITALS,
    normal: [90, 120], get: (p) => p.healthRecords.map((r) => ({ date: r.date, value: r.systolic, secondary: r.diastolic, source: r.source })) },
  glucose: { key: "glucose", label: "Blood Glucose", unit: "mg/dL", category: CATEGORIES.VITALS,
    normal: [70, 140], get: (p) => p.healthRecords.map((r) => ({ date: r.date, value: r.glucose, source: r.source })) },
  temperature: { key: "temperature", label: "Body Temperature", unit: "°F", category: CATEGORIES.VITALS,
    normal: [97, 99], get: (p) => p.healthRecords.map((r) => ({ date: r.date, value: r.temperature, source: r.source })) },
  bloodOxygen: { key: "bloodOxygen", label: "Blood Oxygen", unit: "% SpO₂", category: CATEGORIES.VITALS,
    normal: [95, 100], get: (p) => p.healthRecords.map((r) => ({ date: r.date, value: r.bloodOxygen, source: r.source })).filter((r) => r.value != null) },
  respiratoryRate: { key: "respiratoryRate", label: "Respiratory Rate", unit: "breaths/min", category: CATEGORIES.VITALS,
    normal: [12, 20], get: (p) => p.healthRecords.map((r) => ({ date: r.date, value: r.respiratoryRate, source: r.source })).filter((r) => r.value != null) },
  weight: { key: "weight", label: "Weight", unit: "kg", category: CATEGORIES.BODY,
    normal: null, get: (p) => p.healthRecords.map((r) => ({ date: r.date, value: r.weight, source: r.source })) },
};

export function metricSeries(patient, key, days = 30) {
  const def = VITAL_METRICS[key];
  if (!def) return [];
  const cutoff = addDays(todayISO(), -days);
  return def.get(patient).filter((r) => r.date >= cutoff && r.value != null).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function seriesStats(series) {
  const values = series.map((s) => s.value).filter((v) => typeof v === "number");
  if (!values.length) return { avg: null, min: null, max: null, latest: null };
  const avg = round1(values.reduce((a, b) => a + b, 0) / values.length);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const latest = series[series.length - 1]?.value ?? null;
  return { avg, min, max, latest };
}

export function metricStatus(def, value) {
  if (value == null || !def.normal) return { label: "No range set", tone: "stable" };
  const [lo, hi] = def.normal;
  if (value < lo) return { label: "Below typical range", tone: "monitor" };
  if (value > hi) return { label: "Above typical range", tone: "monitor" };
  return { label: "Within typical range", tone: "stable" };
}

/* Simple, transparent slope-based trend classifier — compares the mean of
   the first half of a series to the second half. Never a diagnosis, just a
   description of the recorded numbers. */
export function computeTrend(series, { higherIsBetter = null } = {}) {
  const values = series.map((s) => s.value).filter((v) => typeof v === "number");
  if (values.length < 4) return { direction: "stable", changePct: 0 };
  const mid = Math.floor(values.length / 2);
  const firstAvg = values.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const secondAvg = values.slice(mid).reduce((a, b) => a + b, 0) / (values.length - mid);
  if (firstAvg === 0) return { direction: "stable", changePct: 0 };
  const changePct = round1(((secondAvg - firstAvg) / firstAvg) * 100);
  if (Math.abs(changePct) < 3) return { direction: "stable", changePct };
  const goingUp = changePct > 0;
  if (higherIsBetter === null) return { direction: goingUp ? "increasing" : "decreasing", changePct };
  const good = higherIsBetter ? goingUp : !goingUp;
  return { direction: good ? "improving" : "monitor", changePct };
}

/* -------------------------------- adherence -------------------------------- */

export function adherenceBreakdown(patient) {
  return {
    today: computeAdherence(patient.logs, 1),
    d7: computeAdherence(patient.logs, 7),
    d30: computeAdherence(patient.logs, 30),
    d90: computeAdherence(patient.logs, 90),
    missed30: missedDaysCount(patient.logs, 30),
  };
}

/* Looks for the scheduled hour with the highest miss rate, to surface a
   pattern like "Most missed doses occur between 7 PM and 9 PM." */
export function adherenceTimePattern(patient) {
  const buckets = {};
  patient.logs.forEach((l) => {
    if (l.status !== "Missed" && l.status !== "Taken" && l.status !== "Late") return;
    const hour = parseInt(l.scheduledTime.split(":")[0], 10);
    buckets[hour] = buckets[hour] || { missed: 0, total: 0 };
    buckets[hour].total += 1;
    if (l.status === "Missed") buckets[hour].missed += 1;
  });
  let worst = null;
  Object.entries(buckets).forEach(([hour, b]) => {
    if (b.total < 3) return;
    const rate = b.missed / b.total;
    if (rate > 0.15 && (!worst || rate > worst.rate)) worst = { hour: Number(hour), rate };
  });
  if (!worst) return null;
  const fmtHour = (h) => { const ap = h >= 12 ? "PM" : "AM"; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh} ${ap}`; };
  return `Most missed doses occur around ${fmtHour(worst.hour)} (${Math.round(worst.rate * 100)}% of scheduled doses in that hour).`;
}

/* -------------------------------- trends page -------------------------------- */

export function healthTrendSummaries(patient) {
  const out = [];
  const push = (key, label, higherIsBetter) => {
    const s = metricSeries(patient, key, 30);
    if (s.length < 4) return;
    const t = computeTrend(s, { higherIsBetter });
    out.push({ key, label, ...t });
  };
  push("heartRate", "Heart Rate", null);
  push("bloodPressure", "Blood Pressure", false);
  push("glucose", "Glucose", false);
  push("weight", "Weight", null);
  push("bloodOxygen", "Blood Oxygen", true);

  const adh = adherenceBreakdown(patient);
  const adhTrend = adh.d30 > adh.d7 ? { direction: "monitor", changePct: adh.d7 - adh.d30 }
    : adh.d7 >= adh.d30 ? { direction: "improving", changePct: adh.d7 - adh.d30 }
    : { direction: "stable", changePct: 0 };
  out.push({ key: "adherence", label: "Medication Adherence", ...adhTrend });
  return out;
}

/* -------------------------------- timeline -------------------------------- */

export function timelineEvents(patient, { date = todayISO(), days = 1 } = {}) {
  const cutoff = addDays(date, -(days - 1));
  const events = [];

  patient.logs.filter((l) => l.date >= cutoff && l.date <= date && l.status !== "Upcoming").forEach((l) => {
    events.push({ id: l.id, date: l.date, time: l.actualTime || l.scheduledTime, category: CATEGORIES.MEDICATION,
      title: `${l.medName} ${l.status === "Missed" ? "missed" : l.status === "Late" ? "taken (late)" : "taken"}`,
      status: l.status });
  });

  patient.healthRecords.filter((r) => r.date >= cutoff && r.date <= date).forEach((r) => {
    events.push({ id: r.id + "-hr", date: r.date, time: "09:00", category: CATEGORIES.VITALS, title: `Heart rate recorded — ${r.heartRate} BPM` });
    events.push({ id: r.id + "-bp", date: r.date, time: "09:05", category: CATEGORIES.VITALS, title: `Blood pressure recorded — ${r.systolic}/${r.diastolic} mmHg` });
  });

  (patient.nutrition || []).filter((n) => n.date >= cutoff && n.date <= date).forEach((n) => {
    events.push({ id: n.id, date: n.date, time: n.time, category: CATEGORIES.NUTRITION, title: `${n.name} logged — ${n.calories} kcal` });
  });

  (patient.workouts || []).filter((w) => w.date >= cutoff && w.date <= date).forEach((w) => {
    events.push({ id: w.id, date: w.date, time: "18:00", category: CATEGORIES.ACTIVITY, title: `${w.type} workout completed — ${w.durationMin} min` });
  });

  (patient.sleep || []).filter((s) => s.date >= cutoff && s.date <= date).forEach((s) => {
    events.push({ id: s.id, date: s.date, time: s.wake, category: CATEGORIES.SLEEP, title: `Slept ${(s.durationMin / 60).toFixed(1)}h — score ${s.score}` });
  });

  if (patient.nextVisit && patient.nextVisit.date >= cutoff && patient.nextVisit.date <= date) {
    events.push({ id: "appt", date: patient.nextVisit.date, time: patient.nextVisit.time, category: CATEGORIES.APPOINTMENT, title: `Appointment: ${patient.nextVisit.type || "Visit"}` });
  }

  return events.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date < b.date ? -1 : 1));
}

/* -------------------------------- insights -------------------------------- */

/* Every string here is a plain observation about data already in the app —
   never a diagnosis. Each function documents which fields it reads. */
export function generateInsights(patient) {
  const insights = [];
  const adh = adherenceBreakdown(patient);

  if (adh.d30 && adh.d7 !== adh.d30) {
    insights.push({
      id: "adh-trend", type: "observation", category: CATEGORIES.MEDICATION,
      text: adh.d7 >= adh.d30
        ? `Your medication adherence is ${adh.d7}% over the last 7 days, compared with ${adh.d30}% over the last 30 days.`
        : `Your medication adherence dropped to ${adh.d7}% over the last 7 days, compared with ${adh.d30}% over the last 30 days.`,
    });
  }
  const pattern = adherenceTimePattern(patient);
  if (pattern) insights.push({ id: "adh-pattern", type: "observation", category: CATEGORIES.MEDICATION, text: pattern });

  const missed30 = adh.missed30;
  if (missed30 > 0) {
    insights.push({ id: "adh-missed", type: "observation", category: CATEGORIES.MEDICATION, text: `You had at least one missed dose on ${missed30} day${missed30 === 1 ? "" : "s"} in the last 30 days.` });
  }

  healthTrendSummaries(patient).forEach((t) => {
    if (t.direction === "stable" || t.key === "adherence") return;
    const dirWord = t.direction === "improving" ? "trending toward your typical range"
      : t.direction === "monitor" ? "moved outside your recent typical range"
      : t.direction === "increasing" ? "trending upward" : "trending downward";
    insights.push({ id: `trend-${t.key}`, type: "observation", category: CATEGORIES.VITALS, text: `Your ${t.label.toLowerCase()} has been ${dirWord} over the last 30 days (${t.changePct > 0 ? "+" : ""}${t.changePct}%).` });
  });

  const sleep = (patient.sleep || []).slice(-14);
  const priorSleep = (patient.sleep || []).slice(-28, -14);
  if (sleep.length >= 5 && priorSleep.length >= 5) {
    const avg = (arr) => arr.reduce((a, b) => a + b.durationMin, 0) / arr.length / 60;
    const recent = round1(avg(sleep)), prior = round1(avg(priorSleep));
    if (Math.abs(recent - prior) >= 0.3) {
      insights.push({ id: "sleep-trend", type: "observation", category: CATEGORIES.SLEEP, text: `Your average sleep duration ${recent > prior ? "increased" : "decreased"} to ${recent}h, compared with ${prior}h in the previous period.` });
    }
  }

  const anyAttention = healthTrendSummaries(patient).some((t) => t.direction === "monitor");
  if (anyAttention || adh.d7 < 80) {
    insights.push({ id: "consult", type: "recommendation", category: CATEGORIES.VITALS, text: "Consider discussing these patterns with your doctor at your next visit. MediSense AI does not diagnose conditions." });
  }

  return insights;
}

/* -------------------------------- alerts -------------------------------- */

export function importantAlerts(patient) {
  const alerts = (patient.notifications || []).filter((n) => !n.read || n.severity === "critical").map((n) => ({
    id: n.id, severity: n.severity, category: n.category || "medication", message: n.message, date: n.date,
  }));
  if (patient.nextVisit) {
    const daysAway = (new Date(patient.nextVisit.date) - new Date(todayISO())) / 86400000;
    if (daysAway >= 0 && daysAway <= 2) {
      alerts.push({ id: "appt-soon", severity: "warning", category: "appointment", message: `Upcoming appointment on ${patient.nextVisit.date} at ${patient.nextVisit.time}.`, date: todayISO() });
    }
  }
  return alerts.sort((a, b) => (a.severity === "critical" ? -1 : 1));
}
