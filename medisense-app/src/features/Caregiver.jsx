import React, { useEffect, useState } from "react";
import {
  Users, Pill, AlertTriangle, HeartPulse, PhoneCall, ShieldCheck, CheckCircle2,
  Activity as ActivityIcon, Moon, FileText, RefreshCw,
} from "lucide-react";
import {
  COLORS, Card, Heading, EmptyState, StatTile, StatusPill, PinnedCardHeader,
  fmtDate, to12h, todayISO, addDays, toast, round1,
} from "../shared.jsx";
import { todaysSchedule, computeAdherence } from "../data/seed.js";
import { VITAL_METRICS, metricSeries, seriesStats } from "../data/healthRecords.js";
import { fetchCaregiverPatients, acceptCaregiverInvite, isConnected } from "../apiStorage.js";

/* =========================================================================
   Caregiver Portal — Least-privilege shared view for family/caregivers
   Displays only health categories explicitly authorized by the patient.
   ========================================================================= */

function AuthorizedPatientView({ entry }) {
  const { patientName, permissions = {}, data: patient } = entry;
  if (!patient) {
    return (
      <Card className="p-5">
        <EmptyState icon={Users} title="Waiting for patient data" body="Ask the patient to open MediSense once to sync their latest records." />
      </Card>
    );
  }

  const grantedKeys = Object.entries(permissions).filter(([, v]) => Boolean(v)).map(([k]) => k);
  const schedule = permissions.medications ? todaysSchedule({ medications: patient.medications || [], logs: patient.logs || [] }) : [];
  const adherence7 = permissions.medications && (patient.logs || []).length ? computeAdherence(patient.logs, 7) : null;
  const missedRecent = permissions.medications
    ? (patient.logs || []).filter((l) => l.status === "Missed" && l.date >= addDays(todayISO(), -14))
    : [];

  const vitalKeys = [];
  if (permissions.vitals) vitalKeys.push("heartRate", "bloodPressure", "bloodOxygen", "temperature");
  if (permissions.glucose) vitalKeys.push("glucose");

  const latestAct = permissions.activity && patient.activity?.length ? patient.activity[patient.activity.length - 1] : null;
  const latestSleep = permissions.sleep && patient.sleep?.length ? patient.sleep[patient.sleep.length - 1] : null;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading size={22}>{patientName || patient.name}</Heading>
            <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>
              {patient.age ? `Age ${patient.age} · ` : ""}Authorized permissions
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {grantedKeys.length === 0 ? (
                <span className="text-[12px]" style={{ color: COLORS.inkSoft }}>No categories shared yet</span>
              ) : (
                grantedKeys.map((k) => (
                  <span key={k} className="text-[11.5px] font-medium px-2.5 py-0.5 rounded-full capitalize" style={{ background: COLORS.mint, color: COLORS.primaryDark }}>
                    {k}
                  </span>
                ))
              )}
            </div>
          </div>

          {patient.emergencyContact?.name && (
            <div className="p-3 rounded-[14px] text-[13px]" style={{ background: COLORS.surface2 }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: COLORS.inkSoft }}>Emergency Contact</div>
              <div className="font-medium mt-0.5">{patient.emergencyContact.name}{patient.emergencyContact.relation ? ` (${patient.emergencyContact.relation})` : ""}</div>
              {patient.emergencyContact.phone && (
                <a href={`tel:${patient.emergencyContact.phone}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium mt-1" style={{ color: COLORS.primary }}>
                  <PhoneCall size={12} /> {patient.emergencyContact.phone}
                </a>
              )}
            </div>
          )}
        </div>
      </Card>

      {permissions.medications && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile label="Active Medications" value={(patient.medications || []).filter((m) => m.active).length} />
            <StatTile label="7d Adherence" value={adherence7 != null ? `${adherence7}%` : "—"} />
            <StatTile label="Missed Doses (14d)" value={missedRecent.length} accent={missedRecent.length ? COLORS.coral : undefined} />
          </div>

          <Card className="p-5">
            <PinnedCardHeader icon={Pill} label="Today's Medication Schedule" tint={COLORS.mint} fg={COLORS.primaryDark} meta={todayISO()} />
            {schedule.length === 0 ? (
              <EmptyState icon={Pill} title="No medications scheduled today" body="No active scheduled doses for this patient today." />
            ) : (
              <div className="space-y-2.5">
                {schedule.map((s, idx) => (
                  <div key={`${s.medId}-${s.time}-${idx}`} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
                    <div>
                      <div className="text-[14px] font-medium">{s.name} · {s.dosage}</div>
                      <div className="text-[12px]" style={{ color: COLORS.inkSoft }}>{to12h(s.time)}</div>
                    </div>
                    <StatusPill status={s.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {missedRecent.length > 0 && (
            <Card className="p-5">
              <PinnedCardHeader icon={AlertTriangle} label="Recent Missed-Dose Alerts" tint={COLORS.dangerSoft} fg={COLORS.coral} />
              <div className="space-y-2">
                {missedRecent.slice(0, 6).map((l, i) => (
                  <div key={l.id || i} className="text-[13px] flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
                    <span className="font-medium">{l.medName} ({l.dosage})</span>
                    <span style={{ color: COLORS.coral }}>{fmtDate(l.date)} · {to12h(l.scheduledTime)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {vitalKeys.length > 0 && (
        <Card className="p-5">
          <PinnedCardHeader icon={HeartPulse} label="Authorized Health Vitals" tint={COLORS.dangerSoft} fg={COLORS.coral} meta="Latest readings" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {vitalKeys.map((key) => {
              const def = VITAL_METRICS[key];
              const series = metricSeries(patient, key, 30);
              const stats = seriesStats(series);
              const lastPoint = series[series.length - 1];
              return (
                <div key={key} className="p-3.5 rounded-[14px]" style={{ background: COLORS.surface2 }}>
                  <div className="text-[12px]" style={{ color: COLORS.inkSoft }}>{def.label}</div>
                  <div className="text-[18px] font-semibold mt-0.5 tabular-nums">
                    {stats.latest != null
                      ? `${stats.latest}${key === "bloodPressure" && lastPoint?.secondary != null ? `/${lastPoint.secondary}` : ""} ${def.unit}`
                      : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {(latestAct || latestSleep) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {latestAct && (
            <Card className="p-5">
              <PinnedCardHeader icon={ActivityIcon} label="Latest Activity" tint={COLORS.successSoft} fg={COLORS.success} meta={latestAct.date} />
              <div className="text-[20px] font-semibold">{latestAct.steps.toLocaleString()} steps</div>
              <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>{latestAct.distanceKm} km · {latestAct.activeEnergyKcal} kcal</div>
            </Card>
          )}
          {latestSleep && (
            <Card className="p-5">
              <PinnedCardHeader icon={Moon} label="Latest Sleep" tint={COLORS.lavenderSoft} fg={COLORS.lavender} meta={latestSleep.date} />
              <div className="text-[20px] font-semibold">{round1(latestSleep.durationMin / 60)} hours</div>
              <div className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>Score {latestSleep.score}/100 · {latestSleep.bedtime} → {latestSleep.wake}</div>
            </Card>
          )}
        </div>
      )}

      {permissions.records && patient.records && (
        <Card className="p-5">
          <PinnedCardHeader icon={FileText} label="Shared Medical Records" tint={COLORS.infoSoft} fg={COLORS.info} />
          <div className="grid sm:grid-cols-2 gap-4 text-[13px]">
            <div>
              <div className="font-semibold mb-1.5" style={{ color: COLORS.inkSoft }}>Conditions</div>
              {(patient.records.conditions || []).length === 0 ? <span style={{ color: COLORS.inkFaint }}>None listed</span> : (
                <ul className="space-y-1">{patient.records.conditions.map((c) => <li key={c.id}>{c.name} ({c.status})</li>)}</ul>
              )}
            </div>
            <div>
              <div className="font-semibold mb-1.5" style={{ color: COLORS.inkSoft }}>Allergies</div>
              {(patient.records.allergies || []).length === 0 ? <span style={{ color: COLORS.inkFaint }}>None listed</span> : (
                <ul className="space-y-1">{patient.records.allergies.map((a) => <li key={a.id}>{a.allergen} — {a.severity}</li>)}</ul>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function CaregiverHub({ data, offlineDemo }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      if (isConnected()) {
        const res = await fetchCaregiverPatients();
        const list = res.patients || [];
        setPatients(list);
        const firstActive = list.find((p) => p.status === "active");
        if (firstActive && !selectedId) setSelectedId(firstActive.relationshipId);
      } else if (offlineDemo && data?.patients?.[0]) {
        const p = data.patients[0];
        setPatients([{
          relationshipId: "offline-demo-caregiver",
          status: "active",
          patientName: p.name,
          permissions: { medications: true, vitals: true, glucose: true, activity: false, sleep: false, nutrition: false, records: false },
          data: p,
        }]);
        setSelectedId("offline-demo-caregiver");
      } else {
        setPatients([]);
      }
    } catch (err) {
      toast(err.message || "Failed to load shared patients");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptInvite = async (relId) => {
    try {
      await acceptCaregiverInvite(relId);
      toast("Caregiver invitation accepted");
      await load();
      setSelectedId(relId);
    } catch (err) {
      toast(err.message || "Could not accept invitation");
    }
  };

  const pending = patients.filter((p) => p.status === "pending");
  const active = patients.filter((p) => p.status === "active");
  const selected = active.find((p) => p.relationshipId === selectedId) || active[0] || null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <Heading size={26}>Caregiver Dashboard</Heading>
          <p className="text-[13.5px] mt-1" style={{ color: COLORS.inkSoft }}>
            Monitor shared schedules, missed-dose alerts, and authorized vitals for family members or care recipients.
          </p>
        </div>
        {isConnected() && (
          <button onClick={load} className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-2 rounded-full border" style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>
            <RefreshCw size={13} /> Refresh
          </button>
        )}
      </div>

      {pending.length > 0 && (
        <div className="space-y-3 mb-5">
          {pending.map((inv) => (
            <Card key={inv.relationshipId} className="p-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: COLORS.mint }}>
              <div className="flex items-center gap-3">
                <ShieldCheck size={20} color={COLORS.primaryDark} />
                <div>
                  <div className="text-[14.5px] font-semibold">Caregiver invitation from {inv.patientName}</div>
                  <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{inv.patientEmail}</div>
                </div>
              </div>
              <button onClick={() => acceptInvite(inv.relationshipId)} className="inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-full text-white" style={{ background: COLORS.primary }}>
                <CheckCircle2 size={14} /> Accept Access
              </button>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <Card className="p-6 text-[13.5px]" style={{ color: COLORS.inkSoft }}>Loading shared patient records…</Card>
      ) : active.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Users}
            title="No active shared patients yet"
            body="Ask a MediSense patient to invite your email under Care → Shared Health Data."
          />
        </Card>
      ) : (
        <>
          {active.length > 1 && (
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
              {active.map((p) => {
                const isSel = selected?.relationshipId === p.relationshipId;
                return (
                  <button
                    key={p.relationshipId}
                    onClick={() => setSelectedId(p.relationshipId)}
                    className="px-4 py-2 rounded-full text-[13px] font-medium flex-shrink-0"
                    style={{ background: isSel ? COLORS.primary : COLORS.surface2, color: isSel ? "white" : COLORS.inkSoft }}
                  >
                    {p.patientName}
                  </button>
                );
              })}
            </div>
          )}
          {selected && <AuthorizedPatientView entry={selected} />}
        </>
      )}
    </div>
  );
}
