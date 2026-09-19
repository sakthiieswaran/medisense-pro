import React, { useState } from "react";
import { FileText, Stethoscope, AlertTriangle, FlaskConical, Syringe, ClipboardList, Upload, Plus, Trash2 } from "lucide-react";
import { COLORS, Card, Heading, EmptyState, Field, Select, ConfirmButton, uid, todayISO, toast } from "../shared.jsx";

/* =========================================================================
   Records module
   ========================================================================= */

const TABS = [
  { id: "conditions", label: "Conditions", icon: Stethoscope },
  { id: "allergies", label: "Allergies", icon: AlertTriangle },
  { id: "labs", label: "Lab Results", icon: FlaskConical },
  { id: "immunizations", label: "Immunizations", icon: Syringe },
  { id: "procedures", label: "Procedures", icon: ClipboardList },
  { id: "documents", label: "Documents", icon: FileText },
];

const DOC_CATEGORIES = ["Prescription", "Lab Report", "Consultation Report", "Discharge Summary", "Other"];

function Section({ icon: Icon, title, empty, children }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} color={COLORS.primary} />
        <span className="font-semibold text-[15px]">{title}</span>
      </div>
      {children.length === 0 ? <EmptyState icon={Icon} title={empty.title} body={empty.body} /> : null}
      {children}
    </Card>
  );
}

function Conditions({ patient, updatePatient }) {
  const [form, setForm] = useState({ name: "", status: "Ongoing", notes: "" });
  const [showForm, setShowForm] = useState(false);
  const items = patient.records?.conditions || [];
  const add = async () => {
    if (!form.name) return;
    await updatePatient(patient.id, (p) => ({ ...p, records: { ...p.records, conditions: [{ id: uid(), name: form.name, dateAdded: todayISO(), status: form.status, notes: form.notes }, ...(p.records?.conditions || [])] } }));
    setForm({ name: "", status: "Ongoing", notes: "" }); setShowForm(false); toast("Condition added");
  };
  const remove = async (id) => { await updatePatient(patient.id, (p) => ({ ...p, records: { ...p.records, conditions: p.records.conditions.filter((c) => c.id !== id) } })); };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold text-[15px]">Conditions</div>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-[13px] font-medium" style={{ color: COLORS.primary }}><Plus size={14} /> Add</button>
      </div>
      {showForm && (
        <div className="grid sm:grid-cols-2 gap-3 mb-4 p-3 rounded-[16px]" style={{ background: COLORS.surface2 }}>
          <Field label="Condition" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Select label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} options={["Ongoing", "Resolved", "Monitoring"]} />
          <div className="sm:col-span-2"><Field label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          <div><button onClick={add} className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white" style={{ background: COLORS.primary }}>Save</button></div>
        </div>
      )}
      {items.length === 0 ? <EmptyState icon={Stethoscope} title="No conditions recorded" body="Add a condition to keep your records complete." /> : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className="flex items-start justify-between py-2.5 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              <div>
                <div className="text-[14px] font-medium">{c.name} <span className="text-[12px] font-normal ml-1 px-2 py-0.5 rounded-full" style={{ background: COLORS.mint, color: COLORS.primaryDark }}>{c.status}</span></div>
                <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>Added {c.dateAdded} {c.notes && `· ${c.notes}`}</div>
              </div>
              <ConfirmButton onConfirm={() => remove(c.id)} icon={Trash2} label={`Remove ${c.name}`} confirmLabel="Remove" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Allergies({ patient, updatePatient }) {
  const [form, setForm] = useState({ allergen: "", reaction: "", severity: "Mild", notes: "" });
  const [showForm, setShowForm] = useState(false);
  const items = patient.records?.allergies || [];
  const add = async () => {
    if (!form.allergen) return;
    await updatePatient(patient.id, (p) => ({ ...p, records: { ...p.records, allergies: [{ id: uid(), ...form }, ...(p.records?.allergies || [])] } }));
    setForm({ allergen: "", reaction: "", severity: "Mild", notes: "" }); setShowForm(false); toast("Allergy added");
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold text-[15px]">Allergies</div>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-[13px] font-medium" style={{ color: COLORS.primary }}><Plus size={14} /> Add</button>
      </div>
      {showForm && (
        <div className="grid sm:grid-cols-2 gap-3 mb-4 p-3 rounded-[16px]" style={{ background: COLORS.surface2 }}>
          <Field label="Allergen" value={form.allergen} onChange={(e) => setForm((f) => ({ ...f, allergen: e.target.value }))} />
          <Field label="Reaction" value={form.reaction} onChange={(e) => setForm((f) => ({ ...f, reaction: e.target.value }))} />
          <Select label="Severity" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))} options={["Mild", "Moderate", "Severe"]} />
          <Field label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          <div><button onClick={add} className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white" style={{ background: COLORS.primary }}>Save</button></div>
        </div>
      )}
      {items.length === 0 ? <EmptyState icon={AlertTriangle} title="No allergies recorded" body="Add known allergies so your care team can see them." /> : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="py-2.5 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              <div className="text-[14px] font-medium">{a.allergen} <span className="text-[12px] font-normal ml-1 px-2 py-0.5 rounded-full" style={{ background: a.severity === "Severe" ? COLORS.dangerSoft : COLORS.warningSoft, color: a.severity === "Severe" ? COLORS.coral : COLORS.amber }}>{a.severity}</span></div>
              <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>{a.reaction} {a.notes && `· ${a.notes}`}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LabResults({ patient }) {
  const items = patient.records?.labResults || [];
  return (
    <Card className="overflow-hidden">
      <div className="p-5 pb-3 font-semibold text-[15px]">Lab Results</div>
      {items.length === 0 ? <div className="px-5 pb-5"><EmptyState icon={FlaskConical} title="No lab results yet" body="Results your doctor adds will appear here." /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead><tr style={{ background: COLORS.mint }}>{["Test", "Result", "Reference Range", "Date", "Notes"].map((h) => <th key={h} className="text-left px-4 py-2.5 font-medium" style={{ color: COLORS.primaryDark }}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} style={{ borderTop: `1px solid ${COLORS.hair}` }}>
                  <td className="px-4 py-2.5 font-medium">{l.test}</td>
                  <td className="px-4 py-2.5">{l.result} {l.unit}</td>
                  <td className="px-4 py-2.5" style={{ color: COLORS.inkSoft }}>{l.referenceRange}</td>
                  <td className="px-4 py-2.5">{l.date}</td>
                  <td className="px-4 py-2.5" style={{ color: COLORS.inkSoft }}>{l.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Immunizations({ patient }) {
  const items = patient.records?.immunizations || [];
  return (
    <Card className="p-5">
      <div className="font-semibold text-[15px] mb-4">Immunizations</div>
      {items.length === 0 ? <EmptyState icon={Syringe} title="No immunizations recorded" body="Your immunization history will appear here." /> : (
        <div className="space-y-3">
          {items.map((v) => (
            <div key={v.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              <div><div className="text-[14px] font-medium">{v.vaccine}</div><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{v.dose}</div></div>
              <div className="text-[13px]" style={{ color: COLORS.inkSoft }}>{v.date}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Procedures({ patient }) {
  const items = patient.records?.procedures || [];
  return (
    <Card className="p-5">
      <div className="font-semibold text-[15px] mb-4">Procedures</div>
      {items.length === 0 ? <EmptyState icon={ClipboardList} title="No procedures recorded" body="Procedures performed will appear here." /> : (
        <div className="space-y-3">
          {items.map((v) => (
            <div key={v.id} className="py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              <div className="text-[14px] font-medium">{v.name}</div>
              <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{v.date} · {v.provider} {v.notes && `· ${v.notes}`}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Documents({ patient, updatePatient }) {
  const items = patient.records?.documents || [];
  const [category, setCategory] = useState("Prescription");
  const fileRef = React.useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await updatePatient(patient.id, (p) => ({ ...p, records: { ...p.records, documents: [{ id: uid(), name: file.name, category, date: todayISO(), sizeKb: Math.round(file.size / 1024) }, ...(p.records?.documents || [])] } }));
    toast("Document added");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card className="p-5">
      <div className="font-semibold text-[15px] mb-4">Medical Documents</div>
      <div className="flex flex-wrap items-end gap-3 mb-5 p-3 rounded-[16px]" style={{ background: COLORS.surface2 }}>
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={DOC_CATEGORIES} />
        <label className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white cursor-pointer flex items-center gap-2" style={{ background: COLORS.primary }}>
          <Upload size={14} /> Upload document
          <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
        </label>
      </div>
      {items.length === 0 ? <EmptyState icon={FileText} title="No documents uploaded" body="Upload prescriptions, lab reports, and other files here." /> : (
        <div className="space-y-2">
          {items.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={16} color={COLORS.primary} className="flex-shrink-0" />
                <div className="min-w-0"><div className="text-[13.5px] font-medium truncate">{d.name}</div><div className="text-[12px]" style={{ color: COLORS.inkSoft }}>{d.category} · {d.date}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function RecordsHub({ patient, updatePatient }) {
  const [tab, setTab] = useState("conditions");
  return (
    <div>
      <Heading size={26} className="mb-4">Records</Heading>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon; const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium flex-shrink-0 focus:outline-none"
              style={{ background: active ? COLORS.primary : COLORS.surface2, color: active ? "white" : COLORS.inkSoft }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "conditions" && <Conditions patient={patient} updatePatient={updatePatient} />}
      {tab === "allergies" && <Allergies patient={patient} updatePatient={updatePatient} />}
      {tab === "labs" && <LabResults patient={patient} />}
      {tab === "immunizations" && <Immunizations patient={patient} />}
      {tab === "procedures" && <Procedures patient={patient} />}
      {tab === "documents" && <Documents patient={patient} updatePatient={updatePatient} />}
    </div>
  );
}
