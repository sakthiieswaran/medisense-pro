import { describe, it, expect } from "vitest";
import { searchAll, searchDoctorPatients } from "../search.js";

function makePatient(overrides = {}) {
  return {
    id: "p1", name: "Alex Johnson", conditions: "Type 2 Diabetes", allergies: "Penicillin",
    medications: [{ id: "m1", name: "Metformin", genericName: "Metformin HCl", dosage: "500", unit: "mg", frequency: "Twice daily", notes: "" }],
    records: { conditions: [], allergies: [], labResults: [{ id: "l1", test: "HbA1c", result: "6.8", unit: "%", date: "2026-01-01" }], immunizations: [], procedures: [] },
    careTeam: [], nextVisit: null, logs: [], healthRecords: [], sleep: [],
    ...overrides,
  };
}
function makeData(patient) {
  return { doctor: { id: "doc1", name: "Dr. Sarah Chen", specialty: "Endocrinology" }, patients: [patient], availability: [] };
}

describe("searchAll (patient mode)", () => {
  it("finds a medication by name", () => {
    const patient = makePatient();
    const results = searchAll(makeData(patient), patient, "metformin");
    expect(results.some((r) => r.group === "Medications" && r.title === "Metformin")).toBe(true);
  });

  it("finds a health metric by label and routes to its detail page", () => {
    const patient = makePatient();
    const results = searchAll(makeData(patient), patient, "glucose");
    const metricHit = results.find((r) => r.group === "Health metrics" && r.title === "Blood Glucose");
    expect(metricHit).toBeTruthy();
    expect(metricHit.nav).toEqual({ tab: "health", params: { metric: "glucose" } });
  });

  it("finds a lab result", () => {
    const patient = makePatient();
    const results = searchAll(makeData(patient), patient, "hba1c");
    expect(results.some((r) => r.group === "Records" && r.title === "HbA1c")).toBe(true);
  });

  it("returns nothing for an empty query", () => {
    const patient = makePatient();
    expect(searchAll(makeData(patient), patient, "")).toEqual([]);
  });

  it("is case-insensitive", () => {
    const patient = makePatient();
    const lower = searchAll(makeData(patient), patient, "metformin");
    const upper = searchAll(makeData(patient), patient, "METFORMIN");
    expect(upper.length).toBe(lower.length);
    expect(upper.length).toBeGreaterThan(0);
  });
});

describe("searchDoctorPatients (doctor mode)", () => {
  it("finds a patient by name", () => {
    const patient = makePatient();
    const results = searchDoctorPatients(makeData(patient), "alex");
    expect(results.some((r) => r.group === "Patients" && r.title === "Alex Johnson")).toBe(true);
  });

  it("finds a patient by condition and routes to their detail page", () => {
    const patient = makePatient();
    const results = searchDoctorPatients(makeData(patient), "diabetes");
    const hit = results.find((r) => r.title === "Alex Johnson");
    expect(hit).toBeTruthy();
    expect(hit.nav).toEqual({ tab: "patients", params: { patientId: "p1" } });
  });
});
