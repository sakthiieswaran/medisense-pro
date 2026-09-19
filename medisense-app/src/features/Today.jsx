import React, { useState } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";
import {
  HeartPulse, Pill, Activity as ActivityIcon, Moon, TrendingUp, AlertTriangle,
  CalendarDays, Sliders, Droplets, Gauge, Thermometer,
  ArrowRight, X, Footprints, Wind, GripVertical,
} from "lucide-react";
import {
  COLORS, SPRING_UI, Card, MotionCard, Heading, StatChip, IconBadge, PinnedCardHeader,
  RingProgress, TripleStat, EmptyState, fmtDateLong, todayISO, toast, TrendPill,
} from "../shared.jsx";
import { todaysSchedule, computeAdherence } from "../data/seed.js";
import { VITAL_METRICS, metricSeries, seriesStats, healthTrendSummaries, importantAlerts } from "../data/healthRecords.js";

/* =========================================================================
   Today — personalized health summary
   Cards render only if enabled in patient.dashboardPrefs, in the order the
   person chose via "Customize Today". Every card reads from the central
   data layer (src/data/healthRecords.js) rather than holding its own copy.
   ========================================================================= */

const METRIC_META = {
  heartRate: { icon: HeartPulse, tint: COLORS.dangerSoft, fg: COLORS.coral },
  restingHeartRate: { icon: HeartPulse, tint: COLORS.dangerSoft, fg: COLORS.coral },
  bloodPressure: { icon: Gauge, tint: COLORS.infoSoft, fg: COLORS.info },
  glucose: { icon: Droplets, tint: COLORS.warningSoft, fg: COLORS.amber },
  weight: { icon: TrendingUp, tint: COLORS.lavenderSoft, fg: COLORS.lavender },
  temperature: { icon: Thermometer, tint: COLORS.warningSoft, fg: COLORS.amber },
  bloodOxygen: { icon: Wind, tint: COLORS.cyanSoft, fg: COLORS.cyan },
  respiratoryRate: { icon: Wind, tint: COLORS.cyanSoft, fg: COLORS.cyan },
};

const CARD_LIBRARY = {
  snapshot: { label: "Health Snapshot" },
  medications: { label: "Today's Medications" },
  activity: { label: "Activity" },
  sleep: { label: "Sleep" },
  trends: { label: "Health Trends" },
  alerts: { label: "Important Alerts" },
  appointment: { label: "Upcoming Appointment" },
};
const ALL_CARD_IDS = Object.keys(CARD_LIBRARY);
const ALL_FAVORITE_METRICS = Object.keys(VITAL_METRICS);

function prefsOf(patient) {
  const p = patient.dashboardPrefs || {};
  return {
    favoriteMetrics: p.favoriteMetrics?.length ? p.favoriteMetrics : ["heartRate", "bloodPressure", "glucose"],
    enabledCards: p.enabledCards?.length ? p.enabledCards : ALL_CARD_IDS,
    cardOrder: p.cardOrder?.length ? p.cardOrder : ALL_CARD_IDS,
  };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------- individual cards ------------------------------- */

function HealthSnapshotCard({ patient, favoriteMetrics, goTo }) {
  return (
    <Card className="p-5">
      <PinnedCardHeader icon={HeartPulse} label="Health Snapshot" tint={COLORS.dangerSoft} fg={COLORS.coral} meta="Today" />
      {favoriteMetrics.length === 0 ? (
        <EmptyState icon={HeartPulse} title="No metrics selected" body="Choose favorite metrics in Customize Today to see them here." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {favoriteMetrics.map((key) => {
            const def = VITAL_METRICS[key];
            if (!def) return null;
            const series = metricSeries(patient, key, 7);
            const stats = seriesStats(series);
            const meta = METRIC_META[key] || METRIC_META.heartRate;
            return (
              <button key={key} onClick={() => goTo("health", { metric: key })} className="text-left focus:outline-none">
                <StatChip icon={meta.icon} tint={meta.tint} fg={meta.fg} label={def.label}
                  value={stats.latest != null ? `${stats.latest}${key === "bloodPressure" ? `/${series[series.length - 1]?.secondary ?? ""}` : ""} ${def.unit}` : "No data"} />
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function MedicationsTodayCard({ patient, updatePatient, goTo }) {
  const rows = todaysSchedule(patient);
  const adherence = computeAdherence(patient.logs, 7);
  const mark = async (row, status) => {
    await updatePatient(patient.id, (p) => {
      const t = todayISO();
      const existing = p.logs.find((l) => l.medId === row.medId && l.date === t && l.scheduledTime === row.time);
      const logs = existing
        ? p.logs.map((l) => (l.id === existing.id ? { ...l, status, actualTime: status === "Missed" ? null : row.time } : l))
        : [...p.logs, { id: row.medId + t + row.time, medId: row.medId, medName: row.name, dosage: row.dosage, date: t, scheduledTime: row.time, actualTime: status === "Missed" ? null : row.time, status }];
      return { ...p, logs };
    });
    toast(status === "Taken" ? "Marked as taken" : "Marked as missed", status === "Taken" ? "success" : "warning");
  };
  const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  return (
    <Card className="p-5">
      <PinnedCardHeader icon={Pill} label="Today's Medications" tint={COLORS.mint} fg={COLORS.primaryDark} meta={`${adherence}% · 7d adherence`} />
      {rows.length === 0 ? (
        <EmptyState icon={Pill} title="No medications scheduled" body="Add a medication to start tracking doses." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {["Taken", "Upcoming", "Late", "Missed"].map((s) => counts[s] ? (
              <span key={s} className="text-[12px] font-medium px-2.5 py-1 rounded-full" style={{ background: COLORS.surface2, color: COLORS.inkSoft }}>{counts[s]} {s}</span>
            ) : null)}
          </div>
          <div className="space-y-3">
            {rows.slice(0, 5).map((row, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium truncate">{row.name} · {row.dosage}</div>
                  <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{row.time}</div>
                </div>
                {row.status === "Upcoming" ? (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => mark(row, "Taken")} className="text-[12px] font-medium px-3 py-1.5 rounded-full text-white" style={{ background: COLORS.primary }}>Taken</button>
                    <button onClick={() => mark(row, "Missed")} className="text-[12px] font-medium px-3 py-1.5 rounded-full border" style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>Missed</button>
                  </div>
                ) : (
                  <span className="text-[12px] font-medium flex-shrink-0" style={{ color: row.status === "Missed" ? COLORS.coral : row.status === "Late" ? COLORS.amber : COLORS.success }}>{row.status}</span>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => goTo("medications")} className="flex items-center gap-1 text-[13px] font-medium mt-4" style={{ color: COLORS.primary }}>
            View all medications <ArrowRight size={14} />
          </button>
        </>
      )}
    </Card>
  );
}

function ActivityCard({ patient, goTo }) {
  const today = (patient.activity || []).find((a) => a.date === todayISO()) || (patient.activity || [])[patient.activity.length - 1];
  if (!today) return null;
  return (
    <MotionCard className="p-5" onClick={() => goTo("health", { section: "activity" })}>
      <PinnedCardHeader icon={ActivityIcon} label="Activity" tint={COLORS.successSoft} fg={COLORS.success} meta="Today" />
      <TripleStat items={[
        { label: "Steps", value: today.steps.toLocaleString(), unit: "", color: COLORS.success },
        { label: "Distance", value: today.distanceKm, unit: "km", color: COLORS.info },
        { label: "Active Energy", value: today.activeEnergyKcal, unit: "kcal", color: COLORS.amber },
        { label: "Exercise", value: today.exerciseMinutes, unit: "min", color: COLORS.lavender },
      ]} />
    </MotionCard>
  );
}

function SleepCard({ patient, goTo }) {
  const last = (patient.sleep || [])[patient.sleep.length - 1];
  if (!last) return null;
  const hours = Math.floor(last.durationMin / 60), mins = last.durationMin % 60;
  return (
    <MotionCard className="p-5" onClick={() => goTo("health", { section: "sleep" })}>
      <PinnedCardHeader icon={Moon} label="Sleep" tint={COLORS.lavenderSoft} fg={COLORS.lavender} meta={last.date === todayISO() ? "Last night" : last.date} />
      <TripleStat items={[
        { label: "Duration", value: `${hours}h ${mins}m`, unit: "", color: COLORS.lavender },
        { label: "Score", value: last.score, unit: "/100", color: COLORS.info },
        { label: "Bedtime", value: last.bedtime, unit: "", color: COLORS.inkSoft },
        { label: "Wake", value: last.wake, unit: "", color: COLORS.inkSoft },
      ]} />
    </MotionCard>
  );
}

function TrendsCard({ patient, goTo }) {
  const trends = healthTrendSummaries(patient);
  return (
    <Card className="p-5">
      <PinnedCardHeader icon={TrendingUp} label="Health Trends" tint={COLORS.cyanSoft} fg={COLORS.cyan} />
      {trends.length === 0 ? (
        <EmptyState icon={TrendingUp} title="Not enough data yet" body="Trends appear once you have a few weeks of readings." />
      ) : (
        <div className="flex flex-wrap gap-2">
          {trends.map((t) => (
            <div key={t.key} className="flex items-center gap-2 px-3 py-2 rounded-[14px]" style={{ background: COLORS.surface2 }}>
              <span className="text-[13px] font-medium">{t.label}</span>
              <TrendPill direction={t.direction} />
            </div>
          ))}
        </div>
      )}
      <button onClick={() => goTo("insights")} className="flex items-center gap-1 text-[13px] font-medium mt-4" style={{ color: COLORS.primary }}>
        See AI insights <ArrowRight size={14} />
      </button>
    </Card>
  );
}

function AlertsCard({ patient, goTo }) {
  const alerts = importantAlerts(patient);
  if (alerts.length === 0) return null;
  return (
    <Card className="p-5" style={{ borderColor: "var(--color-danger-soft)" }}>
      <PinnedCardHeader icon={AlertTriangle} label="Important Alerts" tint={COLORS.dangerSoft} fg={COLORS.coral} />
      <div className="space-y-2.5">
        {alerts.slice(0, 3).map((a) => (
          <div key={a.id} className="flex items-start gap-2.5">
            <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: a.severity === "critical" ? COLORS.coral : COLORS.amber }} />
            <div className="text-[13.5px]" style={{ color: COLORS.ink }}>{a.message}</div>
          </div>
        ))}
      </div>
      <button onClick={() => goTo("insights", { section: "notifications" })} className="flex items-center gap-1 text-[13px] font-medium mt-4" style={{ color: COLORS.primary }}>
        View all notifications <ArrowRight size={14} />
      </button>
    </Card>
  );
}

function AppointmentCard({ data, patient, goTo }) {
  if (!patient.nextVisit) return null;
  const doctor = data.doctor;
  return (
    <MotionCard className="p-5" onClick={() => goTo("care", { section: "appointments" })}>
      <PinnedCardHeader icon={CalendarDays} label="Upcoming Appointment" tint={COLORS.infoSoft} fg={COLORS.info} />
      <div className="text-[16px] font-semibold">{patient.nextVisit.type || "Visit"} with {doctor.name}</div>
      <div className="text-[13.5px] mt-1" style={{ color: COLORS.inkSoft }}>{patient.nextVisit.date} at {patient.nextVisit.time}{patient.nextVisit.location ? ` · ${patient.nextVisit.location}` : ""}</div>
    </MotionCard>
  );
}

const CARD_RENDER = {
  snapshot: HealthSnapshotCard,
  medications: MedicationsTodayCard,
  activity: ActivityCard,
  sleep: SleepCard,
  trends: TrendsCard,
  alerts: AlertsCard,
  appointment: AppointmentCard,
};

/* -------------------------------- customize today -------------------------------- */

function CustomizeCardRow({ id, enabled, onToggle }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={id} dragListener={false} dragControls={controls}
      className="flex items-center gap-2 px-3 py-2.5 rounded-[14px]" style={{ background: COLORS.surface2 }}>
      <button onPointerDown={(e) => controls.start(e)} aria-label={`Drag to reorder ${CARD_LIBRARY[id].label}`}
        className="p-1 -ml-1 cursor-grab active:cursor-grabbing touch-none flex-shrink-0" style={{ color: COLORS.inkFaint }}>
        <GripVertical size={16} />
      </button>
      <label className="flex items-center gap-2.5 flex-1 min-w-0">
        <input type="checkbox" checked={enabled} onChange={onToggle} className="w-4 h-4 flex-shrink-0" style={{ accentColor: COLORS.primary }} />
        <span className="text-[13.5px] font-medium truncate">{CARD_LIBRARY[id].label}</span>
      </label>
    </Reorder.Item>
  );
}

export function CustomizeToday({ patient, updatePatient, onClose }) {
  const prefs = prefsOf(patient);
  const [order, setOrder] = useState(prefs.cardOrder);
  const [enabled, setEnabled] = useState(new Set(prefs.enabledCards));
  const [favorites, setFavorites] = useState(new Set(prefs.favoriteMetrics));

  const toggleCard = (id) => setEnabled((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleFavorite = (key) => setFavorites((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const save = async () => {
    await updatePatient(patient.id, (p) => ({
      ...p,
      dashboardPrefs: { cardOrder: order, enabledCards: Array.from(enabled), favoriteMetrics: Array.from(favorites) },
    }));
    toast("Today dashboard updated");
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING_UI}
        className="w-full sm:max-w-lg sm:rounded-[28px] rounded-t-[28px] max-h-[88vh] overflow-y-auto p-6" style={{ background: COLORS.card }}>
        <div className="flex items-center justify-between mb-1">
          <Heading size={19}>Customize Today</Heading>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-black/5"><X size={18} /></button>
        </div>
        <p className="text-[13px] mb-5" style={{ color: COLORS.inkSoft }}>Choose which cards appear, their order, and your favorite health metrics.</p>

        <div className="mb-6">
          <div className="text-[13px] font-semibold mb-2" style={{ color: COLORS.inkSoft }}>Dashboard cards <span className="font-normal" style={{ color: COLORS.inkFaint }}>— drag to reorder</span></div>
          <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-1.5">
            {order.map((id) => (
              <CustomizeCardRow key={id} id={id} enabled={enabled.has(id)} onToggle={() => toggleCard(id)} />
            ))}
          </Reorder.Group>
        </div>

        <div className="mb-6">
          <div className="text-[13px] font-semibold mb-2" style={{ color: COLORS.inkSoft }}>Favorite metrics (Health Snapshot)</div>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_FAVORITE_METRICS.map((key) => (
              <label key={key} className="flex items-center gap-2 px-3 py-2 rounded-[12px]" style={{ background: COLORS.surface2 }}>
                <input type="checkbox" checked={favorites.has(key)} onChange={() => toggleFavorite(key)} className="w-4 h-4" style={{ accentColor: COLORS.primary }} />
                <span className="text-[13px]">{VITAL_METRICS[key].label}</span>
              </label>
            ))}
          </div>
        </div>

        <button onClick={save} className="w-full text-[14.5px] font-medium py-3 rounded-full text-white" style={{ background: COLORS.primary }}>Save changes</button>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------- main dashboard -------------------------------- */

export default function TodayDashboard({ data, patient, updatePatient, goTo }) {
  const [customizing, setCustomizing] = useState(false);
  const prefs = prefsOf(patient);
  const adherence7 = computeAdherence(patient.logs, 7);
  const alerts = importantAlerts(patient);

  const overview = alerts.length > 0
    ? `You have ${alerts.length} alert${alerts.length === 1 ? "" : "s"} to review today.`
    : `${adherence7}% medication adherence this week. Everything looks on track.`;

  const CARD_PROPS = { data, patient, updatePatient, goTo };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[13px] font-medium" style={{ color: COLORS.inkSoft }}>{fmtDateLong(todayISO())}</div>
          <Heading size={28} className="mt-0.5">{greeting()}, {patient.name.split(" ")[0]}</Heading>
          <p className="text-[14px] mt-1.5" style={{ color: COLORS.inkSoft }}>{overview}</p>
        </div>
        <button onClick={() => setCustomizing(true)} aria-label="Customize Today"
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: COLORS.card, boxShadow: COLORS.cardShadow }}>
          <Sliders size={16} color={COLORS.inkSoft} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {prefs.cardOrder.filter((id) => prefs.enabledCards.includes(id)).map((id) => {
          const Comp = CARD_RENDER[id];
          if (!Comp) return null;
          const extra = id === "snapshot" ? { favoriteMetrics: prefs.favoriteMetrics } : {};
          return <div key={id} className={id === "medications" || id === "snapshot" ? "lg:col-span-2" : ""}><Comp {...CARD_PROPS} {...extra} /></div>;
        })}
      </div>

      {customizing && <CustomizeToday patient={patient} updatePatient={updatePatient} onClose={() => setCustomizing(false)} />}
    </div>
  );
}
