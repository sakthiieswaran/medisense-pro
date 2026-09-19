import React, { useState, useMemo } from "react";
import { Users, CalendarDays, UserPlus, ShieldCheck, Clock, Stethoscope, Mail, Phone, MessageCircle } from "lucide-react";
import {
  COLORS, Card, MotionCard, Heading, EmptyState, Field, ConfirmButton,
  fmtDate, fmtDateLong, to12h, toast, uid, todayISO,
} from "../shared.jsx";
import { MessageThread, unreadCount } from "./Messaging.jsx";

/* =========================================================================
   Care module — Doctors · Appointments · Care Team · Health Data Sharing
   ========================================================================= */

const TABS = [
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: "doctors", label: "Doctors", icon: Stethoscope },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "team", label: "Care Team", icon: Users },
  { id: "sharing", label: "Shared Health Data", icon: ShieldCheck },
];

function Doctors({ data }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.lavender})` }}>
          <Stethoscope size={22} color="white" />
        </div>
        <div>
          <div className="font-semibold text-[17px]">{data.doctor.name}</div>
          <div className="text-[13.5px]" style={{ color: COLORS.inkSoft }}>{data.doctor.specialty}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 mt-4 text-[13px]" style={{ color: COLORS.inkSoft }}>
        <span className="flex items-center gap-1.5"><Mail size={13} /> {data.doctor.email}</span>
        <span className="flex items-center gap-1.5"><Phone size={13} /> {data.doctor.phone}</span>
      </div>
    </Card>
  );
}

function Appointments({ data, setData, patient }) {
  const [requesting, setRequesting] = useState(null);
  const freeSlots = data.availability.filter((s) => !s.booked).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const mySlot = data.availability.find((s) => s.booked && s.patientId === patient.id);

  const grouped = useMemo(() => {
    const byDate = {};
    freeSlots.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  }, [freeSlots]);

  const requestSlot = async (slotId) => {
    setRequesting(slotId);
    const availability = data.availability.map((s) => (s.id === slotId ? { ...s, booked: true, patientId: patient.id } : s));
    const patients = data.patients.map((p) => {
      if (p.id !== patient.id) return p;
      const slot = availability.find((s) => s.id === slotId);
      return { ...p, nextVisit: { date: slot.date, time: slot.time, doctorId: data.doctor.id, type: "Follow-up" } };
    });
    await setData({ ...data, availability, patients });
    const slot = availability.find((s) => s.id === slotId);
    toast(`Visit booked for ${fmtDate(slot.date)} at ${to12h(slot.time)}`);
    setRequesting(null);
  };

  const cancelSlot = async () => {
    if (!mySlot) return;
    const availability = data.availability.map((s) => (s.id === mySlot.id ? { ...s, booked: false, patientId: null } : s));
    const patients = data.patients.map((p) => (p.id === patient.id ? { ...p, nextVisit: null } : p));
    await setData({ ...data, availability, patients });
    toast("Appointment cancelled", "warning");
  };

  return (
    <div>
      <Card className="p-5 mb-6" style={patient.nextVisit ? { background: COLORS.mint } : {}}>
        <div className="text-[13px] font-medium" style={{ color: patient.nextVisit ? COLORS.primaryDark : COLORS.inkSoft }}>Your next visit</div>
        {patient.nextVisit ? (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-[14px] flex items-center justify-center flex-shrink-0" style={{ background: COLORS.card }}>
                <CalendarDays size={18} color={COLORS.primary} />
              </div>
              <div>
                <div className="text-[17px] font-semibold">{fmtDateLong(patient.nextVisit.date)}</div>
                <div className="text-[14px]" style={{ color: COLORS.inkSoft }}>{to12h(patient.nextVisit.time)} with {data.doctor.name} ({data.doctor.specialty}) {patient.nextVisit.location ? `· ${patient.nextVisit.location}` : ""}</div>
              </div>
            </div>
            <ConfirmButton onConfirm={cancelSlot} label="Cancel visit" confirmLabel="Yes, cancel" variant="text" />
          </div>
        ) : (
          <div className="text-[15px] mt-2" style={{ color: COLORS.inkSoft }}>Not scheduled yet — request an open time below.</div>
        )}
      </Card>

      <div className="font-semibold text-[15px] mb-3">{data.doctor.name}'s open times</div>
      {grouped.length === 0 ? (
        <Card className="p-5"><EmptyState icon={CalendarDays} title="No open times right now" body="Check back soon, or contact the clinic directly." /></Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([date, slots]) => (
            <div key={date}>
              <div className="text-[13px] font-semibold mb-2" style={{ color: COLORS.inkSoft }}>{fmtDateLong(date)}</div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {slots.map((slot) => (
                  <MotionCard key={slot.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock size={14} color={COLORS.inkSoft} />
                      <div className="text-[14px] font-medium">{to12h(slot.time)}</div>
                    </div>
                    <button onClick={() => requestSlot(slot.id)} disabled={requesting === slot.id}
                      className="text-[12.5px] font-medium px-3.5 py-2 rounded-full text-white transition-transform active:scale-95 hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-1"
                      style={{ background: COLORS.primary, "--tw-ring-color": COLORS.primary }}>
                      {requesting === slot.id ? "Booking…" : "Request"}
                    </button>
                  </MotionCard>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CareTeam({ patient, updatePatient }) {
  const [form, setForm] = useState({ name: "", role: "" });
  const team = patient.careTeam || [];
  const add = async () => {
    if (!form.name) return;
    await updatePatient(patient.id, (p) => ({ ...p, careTeam: [...(p.careTeam || []), { id: uid(), name: form.name, role: form.role || "Caregiver", type: "caregiver" }] }));
    setForm({ name: "", role: "" }); toast("Added to care team");
  };
  const remove = async (id) => { await updatePatient(patient.id, (p) => ({ ...p, careTeam: p.careTeam.filter((m) => m.id !== id) })); };

  return (
    <Card className="p-5">
      <div className="font-semibold text-[15px] mb-4">Care Team</div>
      <div className="space-y-3 mb-5">
        {team.map((m) => (
          <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
            <div><div className="text-[14px] font-medium">{m.name}</div><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{m.role}</div></div>
            {m.type !== "doctor" && <ConfirmButton onConfirm={() => remove(m.id)} label={`Remove ${m.name}`} confirmLabel="Remove" variant="text" />}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 p-3 rounded-[16px]" style={{ background: COLORS.surface2 }}>
        <Field label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Field label="Role (e.g. Specialist, Caregiver)" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
        <button onClick={add} className="flex items-center gap-1.5 text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white" style={{ background: COLORS.primary }}><UserPlus size={14} /> Add</button>
      </div>
    </Card>
  );
}

const SHARE_CATEGORIES = [
  { key: "medications", label: "Medications" },
  { key: "vitals", label: "Vitals" },
  { key: "glucose", label: "Glucose" },
  { key: "activity", label: "Activity" },
  { key: "sleep", label: "Sleep" },
  { key: "nutrition", label: "Nutrition" },
  { key: "records", label: "Medical Records" },
];

function Sharing({ patient, updatePatient }) {
  const shares = patient.healthShares || [];
  const toggleCategory = async (shareId, key) => {
    await updatePatient(patient.id, (p) => ({
      ...p, healthShares: p.healthShares.map((s) => (s.id === shareId ? { ...s, categories: { ...s.categories, [key]: !s.categories[key] } } : s)),
    }));
  };
  const revoke = async (shareId) => {
    await updatePatient(patient.id, (p) => ({ ...p, healthShares: p.healthShares.filter((s) => s.id !== shareId) }));
    toast("Access revoked", "warning");
  };
  const grant = async () => {
    await updatePatient(patient.id, (p) => ({
      ...p, healthShares: [...(p.healthShares || []), { id: uid(), granteeName: "New caregiver", granteeType: "caregiver",
        categories: { medications: true, vitals: false, glucose: false, activity: false, sleep: false, nutrition: false, records: false }, until: null, ongoing: true, grantedDate: todayISO() }],
    }));
  };

  return (
    <div>
      <p className="text-[13px] mb-5" style={{ color: COLORS.inkSoft }}>Choose exactly which data categories each doctor or caregiver can access. You can revoke access at any time.</p>
      {shares.length === 0 ? (
        <Card className="p-5"><EmptyState icon={ShieldCheck} title="No shared access yet" body="Grant a doctor or caregiver access below." /></Card>
      ) : shares.map((s) => (
        <Card key={s.id} className="p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-semibold text-[15px]">{s.granteeName}</div>
              <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{s.ongoing ? "Ongoing access" : `Until ${s.until}`} · granted {s.grantedDate}</div>
            </div>
            <ConfirmButton onConfirm={() => revoke(s.id)} label="Revoke access" confirmLabel="Revoke" variant="text" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SHARE_CATEGORIES.map((c) => (
              <label key={c.key} className="flex items-center gap-2 px-3 py-2 rounded-[12px]" style={{ background: COLORS.surface2 }}>
                <input type="checkbox" checked={!!s.categories[c.key]} onChange={() => toggleCategory(s.id, c.key)} className="w-4 h-4" style={{ accentColor: COLORS.primary }} />
                <span className="text-[13px]">{c.label}</span>
              </label>
            ))}
          </div>
        </Card>
      ))}
      <button onClick={grant} className="flex items-center gap-1.5 text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white" style={{ background: COLORS.primary }}><UserPlus size={14} /> Grant new access</button>
    </div>
  );
}

export default function CareHub({ data, setData, patient, updatePatient, initialSection, onConsumeParams }) {
  const [tab, setTab] = useState(initialSection || "appointments");
  React.useEffect(() => {
    if (initialSection) { setTab(initialSection); onConsumeParams?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);

  return (
    <div>
      <Heading size={26} className="mb-4">Care</Heading>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon; const active = tab === t.id;
          const badge = t.id === "messages" ? unreadCount(patient.messages, "patient") : 0;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium flex-shrink-0 focus:outline-none"
              style={{ background: active ? COLORS.primary : COLORS.surface2, color: active ? "white" : COLORS.inkSoft }}>
              <Icon size={14} /> {t.label}
              {badge > 0 && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? "white" : COLORS.coral }} />}
            </button>
          );
        })}
      </div>
      {tab === "appointments" && <Appointments data={data} setData={setData} patient={patient} />}
      {tab === "doctors" && <Doctors data={data} />}
      {tab === "messages" && <MessageThread patient={patient} updatePatient={updatePatient} viewerSender="patient" otherName={data.doctor.name} otherSubtitle={data.doctor.specialty} />}
      {tab === "team" && <CareTeam patient={patient} updatePatient={updatePatient} />}
      {tab === "sharing" && <Sharing patient={patient} updatePatient={updatePatient} />}
    </div>
  );
}
