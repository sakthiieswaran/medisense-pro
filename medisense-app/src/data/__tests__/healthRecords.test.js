import { describe, it, expect } from "vitest";
import {
  seriesStats, computeTrend, metricStatus, VITAL_METRICS, metricSeries,
  adherenceBreakdown, adherenceTimePattern,
} from "../healthRecords.js";
import { todayISO, addDays } from "../../shared.jsx";

describe("seriesStats", () => {
  it("computes avg/min/max/latest from a value series", () => {
    const series = [{ value: 10 }, { value: 20 }, { value: 30 }];
    expect(seriesStats(series)).toEqual({ avg: 20, min: 10, max: 30, latest: 30 });
  });

  it("returns nulls for an empty series instead of throwing", () => {
    expect(seriesStats([])).toEqual({ avg: null, min: null, max: null, latest: null });
  });
});

describe("metricStatus", () => {
  const def = VITAL_METRICS.heartRate; // normal range [60, 100]
  it("flags a value below the normal range", () => {
    expect(metricStatus(def, 50).tone).toBe("monitor");
  });
  it("flags a value above the normal range", () => {
    expect(metricStatus(def, 120).tone).toBe("monitor");
  });
  it("accepts a value inside the normal range", () => {
    expect(metricStatus(def, 72).tone).toBe("stable");
  });
});

describe("computeTrend", () => {
  it("reports stable for too little data", () => {
    const series = [{ value: 100 }, { value: 101 }];
    expect(computeTrend(series).direction).toBe("stable");
  });

  it("detects a rising trend as 'increasing' with no higherIsBetter hint", () => {
    const series = [{ value: 100 }, { value: 100 }, { value: 130 }, { value: 130 }];
    expect(computeTrend(series).direction).toBe("increasing");
  });

  it("classifies a rising trend as 'improving' when higher is better", () => {
    const series = [{ value: 90 }, { value: 90 }, { value: 98 }, { value: 98 }];
    expect(computeTrend(series, { higherIsBetter: true }).direction).toBe("improving");
  });

  it("classifies a rising trend as 'monitor' when lower is better (e.g. blood pressure)", () => {
    const series = [{ value: 110 }, { value: 110 }, { value: 130 }, { value: 130 }];
    expect(computeTrend(series, { higherIsBetter: false }).direction).toBe("monitor");
  });

  it("treats small fluctuation (<3%) as stable", () => {
    const series = [{ value: 100 }, { value: 100 }, { value: 101 }, { value: 101 }];
    expect(computeTrend(series).direction).toBe("stable");
  });
});

describe("metricSeries", () => {
  it("filters by the requested day range and drops nulls", () => {
    const patient = {
      healthRecords: [
        { date: addDays(todayISO(), -1), heartRate: 70 },
        { date: addDays(todayISO(), -100), heartRate: 65 }, // outside a 30-day window
        { date: todayISO(), heartRate: null }, // no reading yet
      ],
    };
    const series = metricSeries(patient, "heartRate", 30);
    expect(series).toHaveLength(1);
    expect(series[0].value).toBe(70);
  });
});

describe("adherenceBreakdown", () => {
  it("returns 0s for a patient with no logs, rather than NaN", () => {
    const result = adherenceBreakdown({ logs: [] });
    expect(result).toEqual({ today: 0, d7: 0, d30: 0, d90: 0, missed30: 0 });
  });
});

describe("adherenceTimePattern", () => {
  it("returns null when no hour has a clear miss pattern", () => {
    expect(adherenceTimePattern({ logs: [] })).toBeNull();
  });

  it("surfaces the worst hour when a clear pattern exists", () => {
    const logs = [];
    for (let i = 0; i < 5; i++) {
      logs.push({ scheduledTime: "20:00", status: i < 3 ? "Missed" : "Taken" });
    }
    const msg = adherenceTimePattern({ logs });
    expect(msg).toContain("8 PM");
  });
});
