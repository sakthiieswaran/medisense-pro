import { describe, it, expect } from "vitest";
import { computeBMI, bmiCategory, computeRefillInfo, uid } from "../../shared.jsx";
import { buildSeedData } from "../seed.js";

describe("BMI utilities", () => {
  it("computes BMI rounded to 1 decimal place and classifies healthy/overweight/obesity", () => {
    expect(computeBMI(70, 175)).toBe(22.9);
    expect(bmiCategory(22.9)).toEqual({ label: "Healthy weight", tone: "stable" });
    expect(bmiCategory(17.2)).toEqual({ label: "Underweight", tone: "monitor" });
    expect(bmiCategory(27.5)).toEqual({ label: "Overweight", tone: "monitor" });
    expect(bmiCategory(32.1)).toEqual({ label: "Obesity range", tone: "attention" });
  });

  it("returns null for missing or non-positive measurements", () => {
    expect(computeBMI(0, 175)).toBeNull();
    expect(computeBMI(70, null)).toBeNull();
    expect(bmiCategory(null)).toBeNull();
  });
});

describe("computeRefillInfo", () => {
  it("calculates days remaining based on daily dose frequency and flags low stock", () => {
    const low = computeRefillInfo({ currentStock: 10, timesPerDay: 2, refillThreshold: 7 });
    expect(low).toEqual({
      stock: 10,
      daysRemaining: 5,
      lowStock: true,
      criticalStock: false,
    });

    const critical = computeRefillInfo({ currentStock: 2, times: ["08:00", "20:00"], refillThreshold: 7 });
    expect(critical.criticalStock).toBe(true);
    expect(critical.daysRemaining).toBe(1);

    const healthy = computeRefillInfo({ currentStock: 30, timesPerDay: 1, refillThreshold: 7 });
    expect(healthy.lowStock).toBe(false);
    expect(healthy.criticalStock).toBe(false);
    expect(healthy.daysRemaining).toBe(30);
  });

  it("returns null when stock is not configured", () => {
    expect(computeRefillInfo({ name: "Test" })).toBeNull();
    expect(computeRefillInfo({ currentStock: "" })).toBeNull();
  });
});

describe("uid & seed integrity", () => {
  it("generates unique non-empty identifiers using crypto.randomUUID", () => {
    const a = uid();
    const b = uid();
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(16);
    expect(a).not.toBe(b);
  });

  it("includes doctors array, refill stock fields, and appointment history in seed data", () => {
    const seed = buildSeedData();
    expect(Array.isArray(seed.doctors)).toBe(true);
    expect(seed.doctors.length).toBeGreaterThanOrEqual(2);
    const primary = seed.patients[0];
    expect(Array.isArray(primary.appointmentHistory)).toBe(true);
    expect(primary.medications.some((m) => typeof m.currentStock === "number")).toBe(true);
  });
});
