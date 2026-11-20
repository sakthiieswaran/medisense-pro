import React, { useState } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";
import {
  HeartPulse, Pill, Activity as ActivityIcon, Moon, TrendingUp, AlertTriangle,
  CalendarDays, Sliders, Droplets, Gauge, Thermometer,
  ArrowRight, X, Footprints, Wind, GripVertical, Target, PhoneCall, ShieldAlert, RotateCcw,
  CheckCircle2, Clock, ExternalLink,
} from "lucide-react";
import {
  COLORS, SPRING_UI, Card, MotionCard, Heading, StatChip, IconBadge, PinnedCardHeader,
  RingProgress, TripleStat, EmptyState, fmtDateLong, todayISO, toast, TrendPill, round1,
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
  goals: { label: "Health Goals" },
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
  const savedOrder = p.cardOrder?.length ? p.cardOrder.filter((id) => ALL_CARD_IDS.includes(id)) : ALL_CARD_IDS;
  const missingInOrder = ALL_CARD_IDS.filter((id) => !savedOrder.includes(id));
  const enabledBase = p.enabledCards?.length ? p.enabledCards : ALL_CARD_IDS;
  const enabled = p.enabledCards?.length
    ? [...enabledBase, ...(["goals"].filter((id) => !savedOrder.includes(id) && !enabledBase.includes(id)))]
    : ALL_CARD_IDS;
  return {
    favoriteMetrics: p.favoriteMetrics?.length ? p.favoriteMetrics : ["heartRate", "bloodPressure", "glucose"],
    enabledCards: enabled,
    cardOrder: [...savedOrder, ...missingInOrder],
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
      <div className="flex items-center justify-between mb-4">
        <PinnedCardHeader icon={HeartPulse} label="Health Snapshot" tint={COLORS.dangerSoft} fg={COLORS.coral} meta="Today" />
        <button
          onClick={() => goTo("health")}
          className="flex items-center gap-1 text-[12px] font-medium hover:underline focus:outline-none"
          style={{ color: COLORS.primary }}
        >
          View all <ExternalLink size={11} />
        </button>
      </div>
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
              <button
                key={key}
                onClick={() => goTo("health", { metric: key })}
                className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 rounded-[14px] transition-transform active:scale-95"
                style={{ "--tw-ring-color": COLORS.primary }}
              >
                <StatChip
                  icon={meta.icon}
                  tint={meta.tint}
                  fg={meta.fg}
                  label={def.label}
                  value={stats.latest != null ? `${stats.latest}${key === "bloodPressure" ? `/${series[series.length - 1]?.secondary ?? ""}` : ""} ${def.unit}` : "No data"}
                />
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

  const statusBadgeStyle = {
    Taken: { bg: COLORS.successSoft, color: COLORS.success },
    Upcoming: { bg: COLORS.infoSoft, color: COLORS.info },
    Late: { bg: COLORS.warningSoft, color: COLORS.amber },
    Missed: { bg: COLORS.dangerSoft, color: COLORS.coral },
  };

  return (
    <Card className="p-5">
      <PinnedCardHeader icon={Pill} label="Today's Medications" tint={COLORS.mint} fg={COLORS.primaryDark} meta={`${adherence}% · 7d adherence`} />

      {rows.length === 0 ? (
        <EmptyState icon={Pill} title="No medications scheduled" body="Add a medication to start tracking doses." />
      ) : (
        <>
          {/* Prominent count badges */}
          <div className="flex flex-wrap gap-2 my-4">
            {["Taken", "Upcoming", "Late", "Missed"].map((s) =>
              counts[s] ? (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full"
                  style={{ background: statusBadgeStyle[s].bg, color: statusBadgeStyle[s].color }}
                >
                  {s === "Taken" && <CheckCircle2 size={12} />}
                  {s === "Upcoming" && <Clock size={12} />}
                  {counts[s]} {s}
                </span>
              ) : null
            )}
          </div>

          {/* Medication list — timeline style */}
          <div className="space-y-0">
            {rows.slice(0, 5).map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 py-3"
                style={{
                  borderBottom: i < Math.min(rows.length, 5) - 1 ? `1px solid ${COLORS.hair}` : "none",
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        background:
                          row.status === "Taken" ? COLORS.success
                          : row.status === "Missed" ? COLORS.coral
                          : row.status === "Late" ? COLORS.amber
                          : COLORS.info,
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">{row.name}</div>
                    <div className="text-[12px]" style={{ color: COLORS.inkSoft }}>
                      {row.dosage} · {row.time}
                    </div>
                  </div>
                </div>
                {row.status === "Upcoming" ? (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => mark(row, "Taken")}
                      className="text-[12px] font-semibold px-3 py-1.5 rounded-[8px] text-white"
                      style={{ background: COLORS.primary }}
                    >
                      Taken
                    </button>
                    <button
                      onClick={() => mark(row, "Missed")}
                      className="text-[12px] font-medium px-3 py-1.5 rounded-[8px] border"
                      style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}
                    >
                      Missed
                    </button>
                  </div>
                ) : (
                  <span
                    className="text-[12px] font-semibold flex-shrink-0 px-2.5 py-1 rounded-full"
                    style={statusBadgeStyle[row.status] || { color: COLORS.inkSoft }}
                  >
                    {row.status}
                  </span>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => goTo("medications")}
            className="flex items-center gap-1 text-[13px] font-medium mt-4 focus:outline-none"
            style={{ color: COLORS.primary }}
          >
            View all medications <ArrowRight size={14} />
          </button>
        </>
      )}
    </Card>
  );
}

function GoalsCard({ patient, goTo }) {
  const today = todayISO();
  const act = (patient.activity || []).find((a) => a.date === today) || (patient.activity || [])[(patient.activity || []).length - 1];
  const lastSleep = (patient.sleep || [])[(patient.sleep || []).length - 1];
  const hydration = (patient.hydration || []).find((h) => h.date === today) || { ml: 0, targetMl: 2000 };
  const adherence = computeAdherence(patient.logs, 7);

  const stepGoal = patient.goals?.steps || 8000;
  const sleepGoalH = patient.goals?.sleepHours || 8;
  const sleepHrs = lastSleep ? round1(lastSleep.durationMin / 60) : 0;

  const goals = [
    {
      label: "Steps",
      value: act?.steps || 0,
      max: stepGoal,
      display: `${(act?.steps || 0).toLocaleString()} / ${stepGoal.toLocaleString()}`,
      color: COLORS.success,
      onClick: () => goTo("health", { section: "activity" }),
      ring: { value: act?.steps || 0, max: stepGoal, color: COLORS.success },
    },
    {
      label: "Sleep",
      value: sleepHrs,
      max: sleepGoalH,
      display: `${sleepHrs}h / ${sleepGoalH}h`,
      color: COLORS.lavender,
      onClick: () => goTo("health", { section: "sleep" }),
      ring: { value: sleepHrs, max: sleepGoalH, color: COLORS.lavender },
    },
    {
      label: "Hydration",
      value: hydration.ml,
      max: hydration.targetMl,
      display: `${hydration.ml} / ${hydration.targetMl} ml`,
      color: COLORS.info,
      onClick: () => goTo("health", { section: "hydration" }),
      ring: { value: hydration.ml, max: hydration.targetMl, color: COLORS.info },
    },
    {
      label: "Adherence",
      value: adherence,
      max: 100,
      display: `${adherence}%`,
      color: COLORS.primary,
      onClick: () => goTo("medications"),
      ring: { value: adherence, max: 100, color: COLORS.primary },
    },
  ];

  return (
    <Card className="p-5">
      <PinnedCardHeader icon={Target} label="Health Goals" tint={COLORS.infoSoft} fg={COLORS.info} meta="Daily targets" />

      {/* Desktop: ring grid. Mobile: horizontal progress bars */}
      <div className="hidden sm:grid sm:grid-cols-4 gap-3 mt-3">
        {goals.map((g) => (
          <button
            key={g.label}
            onClick={g.onClick}
            className="flex flex-col items-center p-3 rounded-[16px] transition-opacity hover:opacity-80 focus:outline-none"
            style={{ background: COLORS.surface2 }}
          >
            <RingProgress value={g.ring.value} max={g.ring.max} color={g.ring.color} size={52} />
            <div className="text-[12.5px] font-semibold mt-2">{g.display}</div>
            <div className="text-[11px]" style={{ color: COLORS.inkSoft }}>{g.label}</div>
          </button>
        ))}
      </div>

      {/* Mobile: clean progress bars */}
      <div className="sm:hidden space-y-3 mt-3">
        {goals.map((g) => {
          const pct = Math.min(100, g.max > 0 ? Math.round((g.value / g.max) * 100) : 0);
          return (
            <button
              key={g.label}
              onClick={g.onClick}
              className="w-full text-left focus:outline-none"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-medium">{g.label}</span>
                <span className="text-[12.5px] font-semibold" style={{ color: g.color }}>{pct}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: COLORS.surface2 }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: g.color }}
                />
              </div>
              <div className="text-[11.5px] mt-1" style={{ color: COLORS.inkSoft }}>{g.display}</div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ActivityCard({ patient, goTo }) {
  const today = (patient.activity || []).find((a) => a.date === todayISO()) || (patient.activity || [])[(patient.activity || []).length - 1];
  if (!today) {
    return (
      <MotionCard className="p-5" onClick={() => goTo("health", { section: "activity" })}>
        <PinnedCardHeader icon={ActivityIcon} label="Activity" tint={COLORS.successSoft} fg={COLORS.success} />
        <EmptyState icon={ActivityIcon} title="No activity logged yet" body="Tap to log steps or record a workout." />
      </MotionCard>
    );
  }
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
  const last = (patient.sleep || [])[(patient.sleep || []).length - 1];
  if (!last) {
    return (
      <MotionCard className="p-5" onClick={() => goTo("health", { section: "sleep" })}>
        <PinnedCardHeader icon={Moon} label="Sleep" tint={COLORS.lavenderSoft} fg={COLORS.lavender} />
        <EmptyState icon={Moon} title="No sleep data yet" body="Tap to log your sleep schedule and duration." />
      </MotionCard>
    );
  }
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
        <div className="flex flex-wrap gap-2 mt-3">
          {trends.map((t) => (
            <div key={t.key} className="flex items-center gap-2 px-3 py-2 rounded-[12px]" style={{ background: COLORS.surface2 }}>
              <span className="text-[13px] font-medium">{t.label}</span>
              <TrendPill direction={t.direction} />
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => goTo("insights")}
        className="flex items-center gap-1 text-[13px] font-medium mt-4 focus:outline-none"
        style={{ color: COLORS.primary }}
      >
        See AI insights <ArrowRight size={14} />
      </button>
    </Card>
  );
}

function AlertsCard({ patient, goTo }) {
  const alerts = importantAlerts(patient);
  if (alerts.length === 0) return null;
  return (
    <div
      className="rounded-[20px] p-5"
      style={{
        background: "var(--color-card)",
        // Left colored border instead of full background color
        borderLeft: `4px solid ${COLORS.coral}`,
        border: `1px solid var(--color-hair)`,
        borderLeftWidth: "4px",
        borderLeftColor: COLORS.coral,
        boxShadow: COLORS.cardShadow,
      }}
    >
      <PinnedCardHeader icon={AlertTriangle} label="Important Alerts" tint={COLORS.dangerSoft} fg={COLORS.coral} />
      <div className="space-y-3 mt-3">
        {alerts.slice(0, 3).map((a) => (
          <div key={a.id} className="flex items-start gap-3">
            <span
              className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
              style={{ background: a.severity === "critical" ? COLORS.coral : COLORS.amber }}
            />
            <div className="text-[13.5px] leading-snug" style={{ color: COLORS.ink }}>{a.message}</div>
          </div>
        ))}
      </div>
      <button
        onClick={() => goTo("insights", { section: "notifications" })}
        className="flex items-center gap-1 text-[13px] font-medium mt-4 focus:outline-none"
        style={{ color: COLORS.primary }}
      >
        View all notifications <ArrowRight size={14} />
      </button>
    </div>
  );
}

function AppointmentCard({ data, patient, goTo }) {
  if (!patient.nextVisit) return null;
  const doctor = data.doctor || data.doctors?.[0];
  return (
    <MotionCard className="p-5" onClick={() => goTo("care", { section: "appointments" })}>
      <PinnedCardHeader icon={CalendarDays} label="Upcoming Appointment" tint={COLORS.infoSoft} fg={COLORS.info} />
      <div className="text-[16px] font-semibold mt-2">{patient.nextVisit.type || "Visit"}{doctor ? ` with ${doctor.name}` : ""}</div>
      <div className="text-[13.5px] mt-1" style={{ color: COLORS.inkSoft }}>
        {patient.nextVisit.date} at {patient.nextVisit.time}{patient.nextVisit.location ? ` · ${patient.nextVisit.location}` : ""}
      </div>
    </MotionCard>
  );
}

const CARD_RENDER = {
  snapshot: HealthSnapshotCard,
  medications: MedicationsTodayCard,
  goals: GoalsCard,
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
        className="w-full sm:max-w-lg sm:rounded-[20px] rounded-t-[20px] max-h-[88vh] overflow-y-auto p-6 border" style={{ background: COLORS.card, borderColor: COLORS.hair, boxShadow: COLORS.cardShadow }}>
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

        <div className="flex gap-2.5">
          <button onClick={() => { setOrder(ALL_CARD_IDS); setEnabled(new Set(ALL_CARD_IDS)); setFavorites(new Set(["heartRate", "bloodPressure", "glucose"])); }}
            className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-full border text-[13.5px] font-medium"
            style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>
            <RotateCcw size={14} /> Reset
          </button>
          <button onClick={save} className="flex-1 text-[14.5px] font-medium py-3 rounded-full text-white" style={{ background: COLORS.primary }}>Save changes</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EmergencySosModal({ patient, doctor, onClose }) {
  const allergies = patient.records?.allergies || [];
  const conditions = patient.records?.conditions || [];
  const activeMeds = (patient.medications || []).filter((m) => m.active);
  const contact = patient.emergencyContact || {};

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card role="dialog" aria-modal="true" aria-label="Emergency Medical Summary" className="w-full max-w-lg max-h-[88vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: COLORS.dangerSoft, color: COLORS.coral }}>
              <ShieldAlert size={18} />
            </span>
            <div>
              <Heading size={19}>Emergency Medical Card</Heading>
              <div className="text-[12px]" style={{ color: COLORS.inkSoft }}>{patient.name}{patient.age ? ` · Age ${patient.age}` : ""}{patient.bloodGroup ? ` · Blood ${patient.bloodGroup}` : ""}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close SOS modal" className="p-1.5 rounded-full hover:bg-black/5"><X size={18} /></button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <a href="tel:112" className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-white text-[13.5px] font-medium" style={{ background: COLORS.danger }}>
            <PhoneCall size={14} /> Call 112
          </a>
          <a href="tel:911" className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-white text-[13.5px] font-medium" style={{ background: COLORS.coral }}>
            <PhoneCall size={14} /> Call 911
          </a>
        </div>

        <div className="space-y-3 text-[13.5px]">
          <div className="p-3.5 rounded-[14px]" style={{ background: COLORS.surface2 }}>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: COLORS.inkSoft }}>Emergency Contact</div>
            {contact.name ? (
              <div className="flex items-center justify-between gap-2">
                <span><strong>{contact.name}</strong>{contact.relation ? ` (${contact.relation})` : ""}</span>
                {contact.phone && <a href={`tel:${contact.phone}`} className="font-medium underline" style={{ color: COLORS.primary }}>{contact.phone}</a>}
              </div>
            ) : (
              <div style={{ color: COLORS.inkSoft }}>Not specified — add an emergency contact in Care → Care Team.</div>
            )}
          </div>

          <div className="p-3.5 rounded-[14px]" style={{ background: COLORS.surface2 }}>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: COLORS.danger }}>Allergies</div>
            {allergies.length > 0 ? allergies.map((a) => `${a.allergen} (${a.severity})`).join(", ") : (patient.allergies || "No known allergies recorded")}
          </div>

          <div className="p-3.5 rounded-[14px]" style={{ background: COLORS.surface2 }}>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: COLORS.inkSoft }}>Ongoing Conditions</div>
            {conditions.length > 0 ? conditions.map((c) => c.name).join(", ") : (patient.conditions || "None recorded")}
          </div>

          <div className="p-3.5 rounded-[14px]" style={{ background: COLORS.surface2 }}>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: COLORS.inkSoft }}>Active Medications</div>
            {activeMeds.length > 0 ? activeMeds.map((m) => `${m.name} ${m.dosage}${m.unit} (${m.frequency})`).join("; ") : "None"}
          </div>

          {doctor && (
            <div className="p-3.5 rounded-[14px]" style={{ background: COLORS.surface2 }}>
              <div className="text-[11.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: COLORS.inkSoft }}>Primary Clinician</div>
              <div>{doctor.name} ({doctor.specialty}) {doctor.clinic ? `· ${doctor.clinic}` : ""}</div>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

/* -------------------------------- main dashboard -------------------------------- */

export default function TodayDashboard({ data, patient, updatePatient, goTo }) {
  const [customizing, setCustomizing] = useState(false);
  const [showSos, setShowSos] = useState(false);
  const prefs = prefsOf(patient);
  const adherence7 = computeAdherence(patient.logs, 7);
  const alerts = importantAlerts(patient);
  const primaryDoctor = data.doctor || data.doctors?.[0];

  const overview = alerts.length > 0
    ? `You have ${alerts.length} alert${alerts.length === 1 ? "" : "s"} to review today.`
    : `${adherence7}% medication adherence this week. Everything looks on track.`;

  const CARD_PROPS = { data, patient, updatePatient, goTo };

  return (
    <div>
      {/* Page header */}
      <div
        className="rounded-[20px] p-5 mb-5 flex items-start justify-between gap-4"
        style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-hair)",
          boxShadow: COLORS.cardShadow,
        }}
      >
        <div>
          <div className="text-[12.5px] font-medium tracking-wide uppercase" style={{ color: COLORS.inkFaint }}>
            {fmtDateLong(todayISO())}
          </div>
          <Heading size={26} className="mt-1 tracking-tight">
            {greeting()}, {patient.name.split(" ")[0]}
          </Heading>
          <p className="text-[13.5px] mt-1.5" style={{ color: COLORS.inkSoft }}>{overview}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowSos(true)}
            aria-label="Emergency SOS card"
            className="px-3.5 h-9 rounded-full flex items-center gap-1.5 text-[12px] font-semibold flex-shrink-0 focus:outline-none"
            style={{ background: COLORS.dangerSoft, color: COLORS.coral }}
          >
            <ShieldAlert size={14} /> SOS
          </button>
          <button
            onClick={() => setCustomizing(true)}
            aria-label="Customize Today"
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 focus:outline-none"
            style={{ background: COLORS.surface2 }}
          >
            <Sliders size={15} color={COLORS.inkSoft} />
          </button>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {prefs.cardOrder.filter((id) => prefs.enabledCards.includes(id)).map((id) => {
          const Comp = CARD_RENDER[id];
          if (!Comp) return null;
          const extra = id === "snapshot" ? { favoriteMetrics: prefs.favoriteMetrics } : {};
          return (
            <div key={id} className={id === "medications" || id === "snapshot" ? "lg:col-span-2" : ""}>
              <Comp {...CARD_PROPS} {...extra} />
            </div>
          );
        })}
      </div>

      {customizing && <CustomizeToday patient={patient} updatePatient={updatePatient} onClose={() => setCustomizing(false)} />}
      {showSos && <EmergencySosModal patient={patient} doctor={primaryDoctor} onClose={() => setShowSos(false)} />}
    </div>
  );
}
