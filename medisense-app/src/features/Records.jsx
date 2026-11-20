import React, { useEffect, useState } from "react";
import {
  FileText, Stethoscope, AlertTriangle, FlaskConical, Syringe, ClipboardList,
  Upload, Plus, Trash2, Building2, Eye, Download, Sparkles, X,
} from "lucide-react";
import { COLORS, Card, Heading, EmptyState, Field, Select, ConfirmButton, uid, todayISO, toast } from "../shared.jsx";
import {
  isConnected, listDocuments, uploadDocument, fetchDocumentBlob, deleteDocument, summarizeReport,
} from "../apiStorage.js";
import { saveLocalDocBlob, getLocalDocBlob, deleteLocalDocBlob } from "../lib/localDocStore.js";

/* =========================================================================
   Records module
   ========================================================================= */

const TABS = [
  { id: "conditions", label: "Conditions", icon: Stethoscope },
  { id: "allergies", label: "Allergies", icon: AlertTriangle },
  { id: "labs", label: "Lab Results", icon: FlaskConical },
  { id: "immunizations", label: "Immunizations", icon: Syringe },
  { id: "procedures", label: "Procedures", icon: ClipboardList },
  { id: "hospitalizations", label: "Hospitalizations", icon: Building2 },
  { id: "documents", label: "Documents", icon: FileText },
];

const DOC_CATEGORIES = ["Prescription", "Lab Report", "Consultation Report", "Discharge Summary", "Other"];
const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

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
  const remove = async (id) => {
    await updatePatient(patient.id, (p) => ({ ...p, records: { ...p.records, allergies: (p.records?.allergies || []).filter((a) => a.id !== id) } }));
    toast("Allergy removed");
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
            <div key={a.id} className="flex items-start justify-between py-2.5 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              <div>
                <div className="text-[14px] font-medium">{a.allergen} <span className="text-[12px] font-normal ml-1 px-2 py-0.5 rounded-full" style={{ background: a.severity === "Severe" ? COLORS.dangerSoft : COLORS.warningSoft, color: a.severity === "Severe" ? COLORS.coral : COLORS.amber }}>{a.severity}</span></div>
                <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>{a.reaction} {a.notes && `· ${a.notes}`}</div>
              </div>
              <ConfirmButton onConfirm={() => remove(a.id)} icon={Trash2} label={`Remove ${a.allergen}`} confirmLabel="Remove" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LabResults({ patient, updatePatient }) {
  const items = patient.records?.labResults || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ test: "", result: "", unit: "", referenceRange: "", date: todayISO(), notes: "" });
  const [aiSummary, setAiSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);

  const add = async () => {
    if (!form.test || !form.result) return;
    await updatePatient(patient.id, (p) => ({
      ...p,
      records: { ...p.records, labResults: [{ id: uid(), ...form }, ...(p.records?.labResults || [])] },
    }));
    setForm({ test: "", result: "", unit: "", referenceRange: "", date: todayISO(), notes: "" });
    setShowForm(false);
    toast("Lab result added");
  };

  const remove = async (id) => {
    await updatePatient(patient.id, (p) => ({
      ...p,
      records: { ...p.records, labResults: (p.records?.labResults || []).filter((l) => l.id !== id) },
    }));
  };

  const explainLabs = async () => {
    if (items.length === 0) return;
    setSummarizing(true);
    try {
      const content = items
        .map((l) => `- ${l.test}: ${l.result} ${l.unit || ""} (ref: ${l.referenceRange || "n/a"}, date: ${l.date}) ${l.notes || ""}`)
        .join("\n");
      const res = await summarizeReport("Patient Lab Results", content);
      setAiSummary(res.summary || "");
    } catch (err) {
      toast(err.message || "AI explanation unavailable");
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-5 pb-3 flex items-center justify-between flex-wrap gap-2">
        <span className="font-semibold text-[15px]">Lab Results</span>
        <div className="flex items-center gap-3">
          {items.length > 0 && isConnected() && (
            <button onClick={explainLabs} disabled={summarizing} className="flex items-center gap-1 text-[12.5px] font-medium px-3 py-1 rounded-full" style={{ background: COLORS.mint, color: COLORS.primaryDark }}>
              <Sparkles size={13} /> {summarizing ? "Explaining…" : "Explain with AI"}
            </button>
          )}
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-[13px] font-medium" style={{ color: COLORS.primary }}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
      {aiSummary && (
        <div className="mx-5 mb-4 p-3.5 rounded-[14px] text-[13px] whitespace-pre-wrap" style={{ background: COLORS.surface2 }}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold flex items-center gap-1.5" style={{ color: COLORS.primaryDark }}><Sparkles size={13} /> Plain-language Lab Summary</span>
            <button onClick={() => setAiSummary("")} aria-label="Close summary" style={{ color: COLORS.inkSoft }}><X size={14} /></button>
          </div>
          {aiSummary}
        </div>
      )}
      {showForm && (
        <div className="grid sm:grid-cols-3 gap-3 mx-5 mb-4 p-3 rounded-[16px]" style={{ background: COLORS.surface2 }}>
          <Field label="Test name" value={form.test} onChange={(e) => setForm((f) => ({ ...f, test: e.target.value }))} />
          <Field label="Result" value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))} />
          <Field label="Unit" placeholder="e.g. mg/dL, %" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
          <Field label="Reference range" value={form.referenceRange} onChange={(e) => setForm((f) => ({ ...f, referenceRange: e.target.value }))} />
          <Field label="Date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <Field label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          <div className="sm:col-span-3"><button onClick={add} className="text-[13.5px] font-medium px-4 py-2 rounded-full text-white" style={{ background: COLORS.primary }}>Save lab result</button></div>
        </div>
      )}
      {items.length === 0 ? <div className="px-5 pb-5"><EmptyState icon={FlaskConical} title="No lab results yet" body="Add lab reports or view results added by your doctor." /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead><tr style={{ background: COLORS.mint }}>{["Test", "Result", "Reference Range", "Date", "Notes", ""].map((h, idx) => <th key={idx} className="text-left px-4 py-2.5 font-medium" style={{ color: COLORS.primaryDark }}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} style={{ borderTop: `1px solid ${COLORS.hair}` }}>
                  <td className="px-4 py-2.5 font-medium">{l.test}</td>
                  <td className="px-4 py-2.5">{l.result} {l.unit}</td>
                  <td className="px-4 py-2.5" style={{ color: COLORS.inkSoft }}>{l.referenceRange}</td>
                  <td className="px-4 py-2.5">{l.date}</td>
                  <td className="px-4 py-2.5" style={{ color: COLORS.inkSoft }}>{l.notes}</td>
                  <td className="px-3 py-2 text-right">
                    <ConfirmButton onConfirm={() => remove(l.id)} icon={Trash2} label={`Remove ${l.test}`} confirmLabel="Remove" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Immunizations({ patient, updatePatient }) {
  const items = patient.records?.immunizations || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ vaccine: "", dose: "", date: todayISO() });

  const add = async () => {
    if (!form.vaccine) return;
    await updatePatient(patient.id, (p) => ({
      ...p,
      records: { ...p.records, immunizations: [{ id: uid(), ...form }, ...(p.records?.immunizations || [])] },
    }));
    setForm({ vaccine: "", dose: "", date: todayISO() });
    setShowForm(false);
    toast("Immunization added");
  };

  const remove = async (id) => {
    await updatePatient(patient.id, (p) => ({
      ...p,
      records: { ...p.records, immunizations: (p.records?.immunizations || []).filter((v) => v.id !== id) },
    }));
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold text-[15px]">Immunizations</div>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-[13px] font-medium" style={{ color: COLORS.primary }}><Plus size={14} /> Add</button>
      </div>
      {showForm && (
        <div className="grid sm:grid-cols-3 gap-3 mb-4 p-3 rounded-[16px]" style={{ background: COLORS.surface2 }}>
          <Field label="Vaccine" value={form.vaccine} onChange={(e) => setForm((f) => ({ ...f, vaccine: e.target.value }))} />
          <Field label="Dose / booster" value={form.dose} onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))} />
          <Field label="Date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <div className="sm:col-span-3"><button onClick={add} className="text-[13.5px] font-medium px-4 py-2 rounded-full text-white" style={{ background: COLORS.primary }}>Save</button></div>
        </div>
      )}
      {items.length === 0 ? <EmptyState icon={Syringe} title="No immunizations recorded" body="Your immunization history will appear here." /> : (
        <div className="space-y-3">
          {items.map((v) => (
            <div key={v.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              <div><div className="text-[14px] font-medium">{v.vaccine}</div><div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{v.dose}</div></div>
              <div className="flex items-center gap-3">
                <div className="text-[13px]" style={{ color: COLORS.inkSoft }}>{v.date}</div>
                <ConfirmButton onConfirm={() => remove(v.id)} icon={Trash2} label={`Remove ${v.vaccine}`} confirmLabel="Remove" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Procedures({ patient, updatePatient }) {
  const items = patient.records?.procedures || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", provider: "", date: todayISO(), notes: "" });

  const add = async () => {
    if (!form.name) return;
    await updatePatient(patient.id, (p) => ({
      ...p,
      records: { ...p.records, procedures: [{ id: uid(), ...form }, ...(p.records?.procedures || [])] },
    }));
    setForm({ name: "", provider: "", date: todayISO(), notes: "" });
    setShowForm(false);
    toast("Procedure added");
  };

  const remove = async (id) => {
    await updatePatient(patient.id, (p) => ({
      ...p,
      records: { ...p.records, procedures: (p.records?.procedures || []).filter((v) => v.id !== id) },
    }));
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold text-[15px]">Procedures</div>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-[13px] font-medium" style={{ color: COLORS.primary }}><Plus size={14} /> Add</button>
      </div>
      {showForm && (
        <div className="grid sm:grid-cols-2 gap-3 mb-4 p-3 rounded-[16px]" style={{ background: COLORS.surface2 }}>
          <Field label="Procedure name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Field label="Provider / facility" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} />
          <Field label="Date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <Field label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          <div className="sm:col-span-2"><button onClick={add} className="text-[13.5px] font-medium px-4 py-2 rounded-full text-white" style={{ background: COLORS.primary }}>Save</button></div>
        </div>
      )}
      {items.length === 0 ? <EmptyState icon={ClipboardList} title="No procedures recorded" body="Procedures performed will appear here." /> : (
        <div className="space-y-3">
          {items.map((v) => (
            <div key={v.id} className="flex items-start justify-between py-2 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              <div>
                <div className="text-[14px] font-medium">{v.name}</div>
                <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{v.date}{v.provider ? ` · ${v.provider}` : ""}{v.notes ? ` · ${v.notes}` : ""}</div>
              </div>
              <ConfirmButton onConfirm={() => remove(v.id)} icon={Trash2} label={`Remove ${v.name}`} confirmLabel="Remove" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Hospitalizations({ patient, updatePatient }) {
  const items = patient.records?.hospitalizations || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ reason: "", hospital: "", admissionDate: todayISO(), dischargeDate: "", notes: "" });

  const add = async () => {
    if (!form.reason || !form.hospital) return;
    await updatePatient(patient.id, (p) => ({
      ...p,
      records: { ...p.records, hospitalizations: [{ id: uid(), ...form }, ...(p.records?.hospitalizations || [])] },
    }));
    setForm({ reason: "", hospital: "", admissionDate: todayISO(), dischargeDate: "", notes: "" });
    setShowForm(false);
    toast("Hospitalization added");
  };

  const remove = async (id) => {
    await updatePatient(patient.id, (p) => ({
      ...p,
      records: { ...p.records, hospitalizations: (p.records?.hospitalizations || []).filter((h) => h.id !== id) },
    }));
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold text-[15px]">Hospitalization History</div>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-[13px] font-medium" style={{ color: COLORS.primary }}><Plus size={14} /> Add</button>
      </div>
      {showForm && (
        <div className="grid sm:grid-cols-2 gap-3 mb-4 p-3 rounded-[16px]" style={{ background: COLORS.surface2 }}>
          <Field label="Reason / diagnosis" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          <Field label="Hospital / facility" value={form.hospital} onChange={(e) => setForm((f) => ({ ...f, hospital: e.target.value }))} />
          <Field label="Admission date" type="date" value={form.admissionDate} onChange={(e) => setForm((f) => ({ ...f, admissionDate: e.target.value }))} />
          <Field label="Discharge date" type="date" value={form.dischargeDate} onChange={(e) => setForm((f) => ({ ...f, dischargeDate: e.target.value }))} />
          <div className="sm:col-span-2"><Field label="Discharge notes / summary" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          <div className="sm:col-span-2"><button onClick={add} className="text-[13.5px] font-medium px-4 py-2 rounded-full text-white" style={{ background: COLORS.primary }}>Save</button></div>
        </div>
      )}
      {items.length === 0 ? <EmptyState icon={Building2} title="No hospitalizations recorded" body="Track past hospital admissions and discharge summaries here." /> : (
        <div className="space-y-3">
          {items.map((h) => (
            <div key={h.id} className="flex items-start justify-between py-2.5 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              <div>
                <div className="text-[14px] font-medium">{h.reason} <span className="text-[12.5px] font-normal" style={{ color: COLORS.inkSoft }}>· {h.hospital}</span></div>
                <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>
                  Admitted {h.admissionDate}{h.dischargeDate ? ` · Discharged ${h.dischargeDate}` : " · Ongoing"}{h.notes ? ` · ${h.notes}` : ""}
                </div>
              </div>
              <ConfirmButton onConfirm={() => remove(h.id)} icon={Trash2} label={`Remove ${h.reason}`} confirmLabel="Remove" />
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
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null); // { doc, url, mimeType }
  const [docNoteMap, setDocNoteMap] = useState({});
  const [summaries, setSummaries] = useState({});
  const [summarizingId, setSummarizingId] = useState(null);
  const fileRef = React.useRef(null);

  useEffect(() => {
    if (!isConnected()) return;
    let active = true;
    listDocuments()
      .then((res) => {
        if (!active || !Array.isArray(res.documents)) return;
        const serverDocs = res.documents.map((d) => ({
          id: d.id,
          name: d.originalName || "Document",
          category: d.category || "Other",
          mimeType: d.mimeType,
          sizeKb: Math.max(1, Math.round((d.sizeBytes || 0) / 1024)),
          date: (d.createdAt || todayISO()).slice(0, 10),
          remote: true,
        }));
        if (serverDocs.length > 0) {
          updatePatient(patient.id, (p) => {
            const localOnly = (p.records?.documents || []).filter((x) => !x.remote && !serverDocs.some((s) => s.id === x.id));
            return { ...p, records: { ...p.records, documents: [...serverDocs, ...localOnly] } };
          });
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [patient.id]);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIME.has(file.type)) {
      toast("Only PDF, PNG, JPEG, or WebP files are supported");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast("File must be 10 MB or smaller");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      let docMeta;
      if (isConnected()) {
        const uploaded = await uploadDocument(file, category);
        docMeta = {
          id: uploaded.id,
          name: uploaded.originalName || file.name,
          category: uploaded.category || category,
          mimeType: uploaded.mimeType || file.type,
          sizeKb: Math.max(1, Math.round((uploaded.sizeBytes || file.size) / 1024)),
          date: todayISO(),
          remote: true,
        };
      } else {
        const id = uid();
        await saveLocalDocBlob(id, file);
        docMeta = {
          id,
          name: file.name,
          category,
          mimeType: file.type,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
          date: todayISO(),
          remote: false,
        };
      }

      await updatePatient(patient.id, (p) => ({
        ...p,
        records: { ...p.records, documents: [docMeta, ...(p.records?.documents || [])] },
      }));
      toast(isConnected() ? "Document uploaded & stored" : "Document saved locally");
    } catch (err) {
      toast(err.message || "Document upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const resolveBlob = async (doc) => {
    if (doc.remote && isConnected()) {
      return fetchDocumentBlob(doc.id);
    }
    const local = await getLocalDocBlob(doc.id);
    if (!local) throw new Error("Document binary not found locally. Upload the file to view contents.");
    return local.blob;
  };

  const openPreview = async (doc) => {
    try {
      const blob = await resolveBlob(doc);
      if (preview?.url) URL.revokeObjectURL(preview.url);
      const url = URL.createObjectURL(blob);
      setPreview({ doc, url, mimeType: doc.mimeType || blob.type });
    } catch (err) {
      toast(err.message || "Preview unavailable");
    }
  };

  const downloadDoc = async (doc) => {
    try {
      const blob = await resolveBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name || "document";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message || "Download failed");
    }
  };

  const removeDoc = async (doc) => {
    try {
      if (doc.remote && isConnected()) {
        await deleteDocument(doc.id);
      }
      await deleteLocalDocBlob(doc.id);
      await updatePatient(patient.id, (p) => ({
        ...p,
        records: { ...p.records, documents: (p.records?.documents || []).filter((x) => x.id !== doc.id) },
      }));
      if (preview?.doc?.id === doc.id) setPreview(null);
      toast("Document deleted");
    } catch (err) {
      toast(err.message || "Could not delete document");
    }
  };

  const summarizeDoc = async (doc) => {
    setSummarizingId(doc.id);
    try {
      const notes = docNoteMap[doc.id] || "";
      const content = `Document Name: ${doc.name}\nCategory: ${doc.category}\nDate: ${doc.date}\nPatient Notes / Excerpt:\n${notes || "Summarize what a typical " + doc.category + " covers and what questions the patient should ask their clinician based on this document metadata."}`;
      const res = await summarizeReport(doc.name, content);
      setSummaries((prev) => ({ ...prev, [doc.id]: res.summary || "" }));
    } catch (err) {
      toast(err.message || "AI summarization unavailable");
    } finally {
      setSummarizingId(null);
    }
  };

  return (
    <Card className="p-5">
      <div className="font-semibold text-[15px] mb-1">Medical Documents</div>
      <p className="text-[12.5px] mb-4" style={{ color: COLORS.inkSoft }}>
        Accepted formats: PDF, PNG, JPEG, WebP up to 10 MB. {isConnected() ? "Encrypted upload synced with server." : "Offline mode stores files locally in IndexedDB."}
      </p>
      <div className="flex flex-wrap items-end gap-3 mb-5 p-3 rounded-[16px]" style={{ background: COLORS.surface2 }}>
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={DOC_CATEGORIES} />
        <label className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white cursor-pointer flex items-center gap-2" style={{ background: COLORS.primary }}>
          <Upload size={14} /> {uploading ? "Uploading…" : "Upload document"}
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
      </div>
      {items.length === 0 ? <EmptyState icon={FileText} title="No documents uploaded" body="Upload prescriptions, lab reports, and other files here." /> : (
        <div className="space-y-3">
          {items.map((d) => (
            <div key={d.id} className="py-2.5 border-b last:border-0" style={{ borderColor: COLORS.hair }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={16} color={COLORS.primary} className="flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium truncate">{d.name}</div>
                    <div className="text-[12px]" style={{ color: COLORS.inkSoft }}>
                      {d.category} · {d.date}{d.sizeKb ? ` · ${d.sizeKb} KB` : ""}{d.remote ? " · Cloud synced" : " · Local"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => openPreview(d)} className="text-[12px] font-medium px-2.5 py-1 rounded-full border flex items-center gap-1" style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>
                    <Eye size={12} /> View
                  </button>
                  <button onClick={() => downloadDoc(d)} className="text-[12px] font-medium px-2.5 py-1 rounded-full border flex items-center gap-1" style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>
                    <Download size={12} /> Download
                  </button>
                  {isConnected() && (
                    <button onClick={() => summarizeDoc(d)} disabled={summarizingId === d.id} className="text-[12px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: COLORS.mint, color: COLORS.primaryDark }}>
                      <Sparkles size={12} /> {summarizingId === d.id ? "…" : "Summarize"}
                    </button>
                  )}
                  <ConfirmButton onConfirm={() => removeDoc(d)} icon={Trash2} label={`Delete ${d.name}`} confirmLabel="Delete" />
                </div>
              </div>
              {isConnected() && (
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Optional report notes/text for AI summary…"
                    value={docNoteMap[d.id] || ""}
                    onChange={(e) => setDocNoteMap((m) => ({ ...m, [d.id]: e.target.value }))}
                    className="w-full text-[12px] px-3 py-1.5 rounded-[10px] border bg-transparent"
                    style={{ borderColor: COLORS.hair }}
                  />
                </div>
              )}
              {summaries[d.id] && (
                <div className="mt-2 p-3 rounded-[12px] text-[12.5px] whitespace-pre-wrap" style={{ background: COLORS.surface2 }}>
                  <div className="font-semibold mb-1" style={{ color: COLORS.primaryDark }}>AI Summary</div>
                  {summaries[d.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div role="dialog" aria-modal="true" aria-label={`Preview ${preview.doc.name}`} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
          <Card className="w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: COLORS.hair }}>
              <div className="font-semibold text-[14.5px] truncate">{preview.doc.name}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadDoc(preview.doc)} className="text-[12.5px] font-medium px-3 py-1.5 rounded-full border" style={{ borderColor: COLORS.hair }}>Download</button>
                <button onClick={() => setPreview(null)} aria-label="Close preview" className="p-1.5 rounded-full hover:bg-black/5"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/5 min-h-[420px]">
              {preview.mimeType === "application/pdf" ? (
                <iframe title={preview.doc.name} src={preview.url} className="w-full h-[65vh] rounded-[12px] border-0 bg-white" />
              ) : (
                <img src={preview.url} alt={preview.doc.name} className="max-w-full max-h-[65vh] object-contain rounded-[12px]" />
              )}
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}

export default function RecordsHub({ patient, updatePatient }) {
  const [tab, setTab] = useState("conditions");
  return (
    <div>
      <Heading size={26} className="mb-4">Medical Records</Heading>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[13px] font-medium flex-shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{
                background: active ? COLORS.primary : COLORS.surface2,
                color: active ? "white" : COLORS.inkSoft,
                "--tw-ring-color": COLORS.primary,
              }}
            >
              <Icon size={14} strokeWidth={2.2} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "conditions" && <Conditions patient={patient} updatePatient={updatePatient} />}
      {tab === "allergies" && <Allergies patient={patient} updatePatient={updatePatient} />}
      {tab === "labs" && <LabResults patient={patient} updatePatient={updatePatient} />}
      {tab === "immunizations" && <Immunizations patient={patient} updatePatient={updatePatient} />}
      {tab === "procedures" && <Procedures patient={patient} updatePatient={updatePatient} />}
      {tab === "hospitalizations" && <Hospitalizations patient={patient} updatePatient={updatePatient} />}
      {tab === "documents" && <Documents patient={patient} updatePatient={updatePatient} />}
    </div>
  );
}
