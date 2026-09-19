import { VITAL_METRICS } from "./healthRecords.js";
import { generateInsights } from "./healthRecords.js";

/* =========================================================================
   Global search
   -------------------------------------------------------------------------
   Builds a flat, categorized result list from data already in the app —
   no separate search index is persisted; everything is derived live from
   the same patient record the rest of the app reads.
   ========================================================================= */

function matches(q, ...fields) {
  const needle = q.toLowerCase();
  return fields.some((f) => f && String(f).toLowerCase().includes(needle));
}

export function searchDoctorPatients(data, query) {
  const q = query.trim();
  if (!q) return [];
  const results = [];
  data.patients.forEach((p) => {
    if (matches(q, p.name, p.conditions, p.allergies)) {
      results.push({ id: "patient-" + p.id, group: "Patients", title: p.name, subtitle: `Age ${p.age} · ${p.conditions}`, nav: { tab: "patients", params: { patientId: p.id } } });
    }
  });
  data.availability.forEach((s) => {
    if (!s.booked && matches(q, "open slot", "availability", s.date)) {
      results.push({ id: "slot-" + s.id, group: "Availability", title: `Open slot — ${s.date} ${s.time}`, subtitle: "Availability", nav: { tab: "availability", params: {} } });
    }
  });
  return results.slice(0, 30);
}

export function searchAll(data, patient, query) {
  const q = query.trim();
  if (!q) return [];
  const results = [];

  // Medications
  patient.medications.forEach((m) => {
    if (matches(q, m.name, m.genericName, m.notes)) {
      results.push({ id: "med-" + m.id, group: "Medications", title: m.name, subtitle: `${m.dosage}${m.unit} · ${m.frequency}`, nav: { tab: "medications", params: {} } });
    }
  });

  // Health metrics (vitals + weight)
  Object.values(VITAL_METRICS).forEach((def) => {
    if (matches(q, def.label, def.key)) {
      results.push({ id: "metric-" + def.key, group: "Health metrics", title: def.label, subtitle: `View history and trend`, nav: { tab: "health", params: { metric: def.key } } });
    }
  });
  ["Activity", "Sleep", "Nutrition", "Hydration", "Mobility", "Mental Wellbeing", "Body"].forEach((label) => {
    if (matches(q, label)) {
      const sectionId = label.toLowerCase().replace(" ", "").includes("mental") ? "mental" : label.toLowerCase();
      results.push({ id: "section-" + label, group: "Health metrics", title: label, subtitle: "Open in Health", nav: { tab: "health", params: { section: sectionId } } });
    }
  });

  // Records
  (patient.records?.conditions || []).forEach((c) => matches(q, c.name) && results.push({ id: "cond-" + c.id, group: "Records", title: c.name, subtitle: `Condition · ${c.status}`, nav: { tab: "records", params: {} } }));
  (patient.records?.allergies || []).forEach((a) => matches(q, a.allergen) && results.push({ id: "alg-" + a.id, group: "Records", title: a.allergen, subtitle: `Allergy · ${a.severity}`, nav: { tab: "records", params: {} } }));
  (patient.records?.labResults || []).forEach((l) => matches(q, l.test) && results.push({ id: "lab-" + l.id, group: "Records", title: l.test, subtitle: `Lab result · ${l.result} ${l.unit} on ${l.date}`, nav: { tab: "records", params: {} } }));
  (patient.records?.immunizations || []).forEach((v) => matches(q, v.vaccine) && results.push({ id: "imm-" + v.id, group: "Records", title: v.vaccine, subtitle: `Immunization · ${v.date}`, nav: { tab: "records", params: {} } }));
  (patient.records?.procedures || []).forEach((p) => matches(q, p.name) && results.push({ id: "proc-" + p.id, group: "Records", title: p.name, subtitle: `Procedure · ${p.date}`, nav: { tab: "records", params: {} } }));

  // Doctors / care team
  if (matches(q, data.doctor.name, data.doctor.specialty)) {
    results.push({ id: "doctor", group: "Care", title: data.doctor.name, subtitle: data.doctor.specialty, nav: { tab: "care", params: { section: "doctors" } } });
  }
  (patient.careTeam || []).forEach((m) => matches(q, m.name, m.role) && results.push({ id: "team-" + m.id, group: "Care", title: m.name, subtitle: m.role, nav: { tab: "care", params: { section: "team" } } }));

  // Appointments
  if (patient.nextVisit && matches(q, "appointment", "visit", patient.nextVisit.type)) {
    results.push({ id: "appt", group: "Care", title: `${patient.nextVisit.type || "Visit"} — ${patient.nextVisit.date}`, subtitle: `${patient.nextVisit.time} with ${data.doctor.name}`, nav: { tab: "care", params: { section: "appointments" } } });
  }

  // Insights
  generateInsights(patient).forEach((ins) => {
    if (matches(q, ins.text)) results.push({ id: "insight-" + ins.id, group: "Insights", title: ins.text, subtitle: ins.type === "recommendation" ? "Recommendation" : "Data observation", nav: { tab: "insights", params: {} } });
  });

  // Reports (static entry point)
  if (matches(q, "report", "reports", "summary")) {
    results.push({ id: "reports", group: "Reports", title: "Generate a health report", subtitle: "Reports", nav: { tab: "reports", params: {} } });
  }

  return results.slice(0, 30);
}
