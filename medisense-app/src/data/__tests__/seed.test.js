import { describe, it, expect } from "vitest";
import { computeAdherence, missedDaysCount, checkInteraction, todaysSchedule, buildSeedData } from "../seed.js";
import { todayISO, addDays } from "../../shared.jsx";

describe("computeAdherence", () => {
  it("returns 0 when there are no relevant logs", () => {
    expect(computeAdherence([], 7)).toBe(0);
  });

  it("counts Taken and Late as adherent, Missed as not", () => {
    const logs = [
      { date: addDays(todayISO(), -1), status: "Taken" },
      { date: addDays(todayISO(), -1), status: "Late" },
      { date: addDays(todayISO(), -1), status: "Missed" },
      { date: addDays(todayISO(), -1), status: "Missed" },
    ];
    // 2 of 4 doses were taken/late => 50%
    expect(computeAdherence(logs, 7)).toBe(50);
  });

  it("ignores logs outside the requested window", () => {
    const logs = [
      { date: addDays(todayISO(), -1), status: "Taken" },
      { date: addDays(todayISO(), -60), status: "Missed" }, // outside a 7-day window
    ];
    expect(computeAdherence(logs, 7)).toBe(100);
  });

  it("ignores Upcoming doses (not yet due)", () => {
    const logs = [{ date: todayISO(), status: "Upcoming" }];
    expect(computeAdherence(logs, 7)).toBe(0);
  });
});

describe("missedDaysCount", () => {
  it("counts distinct days with at least one missed dose, not total missed doses", () => {
    const day = addDays(todayISO(), -1);
    const logs = [
      { date: day, status: "Missed" },
      { date: day, status: "Missed" }, // same day, second missed dose
      { date: addDays(todayISO(), -2), status: "Missed" },
    ];
    expect(missedDaysCount(logs, 30)).toBe(2);
  });
});

describe("checkInteraction", () => {
  it("finds a known interaction regardless of argument order", () => {
    const a = checkInteraction("Warfarin", "Aspirin");
    const b = checkInteraction("Aspirin", "Warfarin");
    expect(a).not.toBeNull();
    expect(a.level).toBe("High risk");
    expect(b).toEqual(a);
  });

  it("is case-insensitive", () => {
    expect(checkInteraction("METFORMIN", "alcohol")).not.toBeNull();
  });

  it("returns null for an unknown pair", () => {
    expect(checkInteraction("Ibuprofen", "Vitamin D3")).toBeNull();
  });
});

describe("todaysSchedule", () => {
  it("only includes active medications, sorted by time", () => {
    const patient = {
      medications: [
        { id: "m1", name: "B", active: true, dosage: "10", unit: "mg", times: ["14:00"], instructions: "" },
        { id: "m2", name: "A", active: true, dosage: "5", unit: "mg", times: ["08:00"], instructions: "" },
        { id: "m3", name: "Inactive", active: false, dosage: "1", unit: "mg", times: ["09:00"], instructions: "" },
      ],
      logs: [],
    };
    const rows = todaysSchedule(patient);
    expect(rows.map((r) => r.name)).toEqual(["A", "B"]);
    expect(rows.every((r) => r.status === "Upcoming")).toBe(true);
  });
});

describe("buildSeedData", () => {
  it("produces a consistent, non-empty demo dataset", () => {
    const data = buildSeedData();
    expect(data.patients.length).toBeGreaterThan(0);
    expect(data.doctor.id).toBeTruthy();
    data.patients.forEach((p) => {
      // Every patient should have every "central data model" category present,
      // even if empty, so every feature module can read it safely.
      expect(Array.isArray(p.medications)).toBe(true);
      expect(Array.isArray(p.healthRecords)).toBe(true);
      expect(Array.isArray(p.activity)).toBe(true);
      expect(Array.isArray(p.sleep)).toBe(true);
      expect(Array.isArray(p.messages)).toBe(true);
      expect(p.records).toBeTruthy();
      expect(p.dashboardPrefs).toBeTruthy();
    });
    // Booked availability slots should reference a real patient.
    const booked = data.availability.filter((s) => s.booked);
    booked.forEach((s) => {
      expect(data.patients.some((p) => p.id === s.patientId)).toBe(true);
    });
  });
});
