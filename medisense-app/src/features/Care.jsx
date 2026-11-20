import React, { useEffect, useState, useMemo } from "react";
import { Users, CalendarDays, UserPlus, ShieldCheck, Clock, Stethoscope, Mail, Phone, MessageCircle, FileText } from "lucide-react";
import {
  COLORS, Card, MotionCard, Heading, EmptyState, Field, ConfirmButton, TrendPill,
  fmtDate, fmtDateLong, to12h, toast, uid, todayISO,
} from "../shared.jsx";
import { MessageThread, unreadCount } from "./Messaging.jsx";
import {
  isConnected, listCaregivers, inviteCaregiver, updateCaregiverPermissions, revokeCaregiver,
  bookAppointment, shareWithDoctor,
} from "../apiStorage.js";

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
  const docs = data.doctors?.length ? data.doctors : data.doctor ? [data.doctor] : [];
  if (docs.length === 0) {
    return <Card className="p-5"><EmptyState icon={Stethoscope} title="No clinicians linked" body="Doctors added to your care team will appear here." /></Card>;
  }
  return (
    <div className="space-y-3">
      {docs.map((doc) => (
        <Card key={doc.id || doc.email} className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.lavender})` }}>
              <Stethoscope size={22} color="white" />
            </div>
            <div>
              <div className="font-semibold text-[17px]">{doc.name}</div>
              <div className="text-[13.5px]" style={{ color: COLORS.inkSoft }}>{doc.specialty}{doc.clinic ? ` · ${doc.clinic}` : ""}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-[13px]" style={{ color: COLORS.inkSoft }}>
            {doc.email && <span className="flex items-center gap-1.5"><Mail size={13} /> {doc.email}</span>}
            {doc.phone && <span className="flex items-center gap-1.5"><Phone size={13} /> {doc.phone}</span>}
          </div>
        </Card>
      ))}
    </div>
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
    if (isConnected() && slot) {
      bookAppointment({
        visitDate: slot.date,
        visitTime: slot.time,
        doctorId: data.doctor?.id,
        doctorName: data.doctor?.name,
        visitType: "Follow-up",
      }).catch(() => {});
    }
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

      {(patient.appointmentHistory || []).length > 0 && (
        <div className="mt-7">
          <div className="font-semibold text-[15px] mb-3">Past Visits & Consultation Notes</div>
          <div className="space-y-3">
            {patient.appointmentHistory.map((h) => (
              <Card key={h.id} className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-[14.5px] font-semibold">{h.type || "Consultation"} · {h.doctorName || data.doctor?.name}</div>
                  <TrendPill direction={h.status === "Cancelled" ? "monitor" : "stable"} label={h.status || "Completed"} />
                </div>
                <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>{fmtDateLong(h.date)}{h.time ? ` at ${to12h(h.time)}` : ""}</div>
                {h.notes && (
                  <div className="mt-2.5 p-3 rounded-[12px] text-[13px] flex items-start gap-2" style={{ background: COLORS.surface2 }}>
                    <FileText size={14} color={COLORS.primary} className="flex-shrink-0 mt-0.5" />
                    <span>{h.notes}</span>
                  </div>
                )}
              </Card>
            ))}
          </div>
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
  const [remoteCaregivers, setRemoteCaregivers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("Family Caregiver");
  const [inviting, setInviting] = useState(false);

  const loadRemoteCaregivers = () => {
    if (!isConnected()) return;
    listCaregivers()
      .then((res) => setRemoteCaregivers(res.caregivers || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadRemoteCaregivers();
  }, []);

  const toggleCategory = async (shareId, key) => {
    await updatePatient(patient.id, (p) => ({
      ...p, healthShares: (p.healthShares || []).map((s) => (s.id === shareId ? { ...s, categories: { ...s.categories, [key]: !s.categories[key] } } : s)),
    }));
  };
  const revoke = async (shareId) => {
    await updatePatient(patient.id, (p) => ({ ...p, healthShares: (p.healthShares || []).filter((s) => s.id !== shareId) }));
    toast("Access revoked", "warning");
  };

  const toggleRemotePerm = async (cg, key) => {
    const next = { ...cg.permissions, [key]: !cg.permissions?.[key] };
    try {
      await updateCaregiverPermissions(cg.id, next);
      setRemoteCaregivers((prev) => prev.map((x) => (x.id === cg.id ? { ...x, permissions: next } : x)));
      toast("Caregiver permissions updated");
    } catch (err) {
      toast(err.message || "Could not update permissions");
    }
  };

  const revokeRemote = async (id) => {
    try {
      await revokeCaregiver(id);
      setRemoteCaregivers((prev) => prev.filter((x) => x.id !== id));
      toast("Caregiver access revoked", "warning");
    } catch (err) {
      toast(err.message || "Could not revoke caregiver");
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    if (isConnected()) {
      setInviting(true);
      try {
        await inviteCaregiver({
          email: inviteEmail.trim(),
          name: inviteName.trim() || undefined,
          role: inviteRole.trim() || "Family Caregiver",
          permissions: { medications: true, vitals: true, glucose: false, activity: false, sleep: false, nutrition: false, records: false },
        });
        setInviteEmail("");
        setInviteName("");
        loadRemoteCaregivers();
        toast("Caregiver invited with server-enforced permissions");
      } catch (err) {
        toast(err.message || "Invite failed");
      } finally {
        setInviting(false);
      }
      return;
    }

    await updatePatient(patient.id, (p) => ({
      ...p,
      healthShares: [
        ...(p.healthShares || []),
        {
          id: uid(),
          granteeName: inviteName.trim() || inviteEmail.trim(),
          granteeType: "caregiver",
          categories: { medications: true, vitals: false, glucose: false, activity: false, sleep: false, nutrition: false, records: false },
          until: null,
          ongoing: true,
          grantedDate: todayISO(),
        },
      ],
    }));
    setInviteEmail("");
    setInviteName("");
    toast("Caregiver share added locally");
  };

  return (
    <div>
      <p className="text-[13px] mb-5" style={{ color: COLORS.inkSoft }}>
        Choose exactly which data categories each doctor or caregiver can access. Server-enforced permissions ensure unauthorized categories are never exposed.
      </p>

      <Card className="p-5 mb-5">
        <div className="font-semibold text-[15px] mb-3">Invite a Family Member or Caregiver</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Caregiver email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="caregiver@example.com" />
          <Field label="Name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Priya Johnson" />
          <Field label="Relationship" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} placeholder="Spouse, Parent, Nurse" />
        </div>
        <button onClick={sendInvite} disabled={!inviteEmail.trim() || inviting}
          className="mt-3 flex items-center gap-1.5 text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white disabled:opacity-40" style={{ background: COLORS.primary }}>
          <UserPlus size={14} /> {inviting ? "Sending invite…" : "Invite caregiver"}
        </button>
      </Card>

      {remoteCaregivers.length > 0 && (
        <div className="mb-5 space-y-4">
          <div className="text-[13px] font-semibold" style={{ color: COLORS.inkSoft }}>Server-Synced Caregivers</div>
          {remoteCaregivers.map((cg) => (
            <Card key={cg.id} className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div>
                  <div className="font-semibold text-[15px] flex items-center gap-2">
                    {cg.caregiver_name || cg.caregiver_email}
                    <TrendPill direction={cg.status === "active" ? "stable" : "monitor"} label={cg.status} />
                  </div>
                  <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{cg.caregiver_email} · {cg.relationship_role}</div>
                </div>
                <ConfirmButton onConfirm={() => revokeRemote(cg.id)} label="Revoke access" confirmLabel="Revoke" variant="text" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SHARE_CATEGORIES.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-3 py-2 rounded-[12px]" style={{ background: COLORS.surface2 }}>
                    <input type="checkbox" checked={!!cg.permissions?.[c.key]} onChange={() => toggleRemotePerm(cg, c.key)} className="w-4 h-4" style={{ accentColor: COLORS.primary }} />
                    <span className="text-[13px]">{c.label}</span>
                  </label>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {shares.length === 0 && remoteCaregivers.length === 0 ? (
        <Card className="p-5"><EmptyState icon={ShieldCheck} title="No shared access yet" body="Invite a caregiver above or grant access to your doctor." /></Card>
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
      <Heading size={26} className="mb-4">Care Coordination</Heading>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          const badge = t.id === "messages" ? unreadCount(patient.messages, "patient") : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[13px] font-medium flex-shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{
                background: active ? COLORS.primary : COLORS.surface2,
                color: active ? "white" : COLORS.inkSoft,
                "--tw-ring-color": COLORS.primary,
              }}
            >
              <Icon size={14} strokeWidth={2.2} /> {t.label}
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
