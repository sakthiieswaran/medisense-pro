import { describe, it, expect } from "vitest";
import {
  normalizeDrugName,
  checkInteraction,
  checkAllergyAlerts,
} from "../interactions.js";

describe("normalizeDrugName", () => {
  it("strips dosage units and normalizes common brand names to generic names", () => {
    expect(normalizeDrugName("Coumadin 5 mg")).toBe("warfarin");
    expect(normalizeDrugName("Glucophage 500mg")).toBe("metformin");
    expect(normalizeDrugName("Plavix")).toBe("clopidogrel");
    expect(normalizeDrugName("  Prilosec  ")).toBe("omeprazole");
    expect(normalizeDrugName("Advil 200 mg")).toBe("ibuprofen");
  });

  it("handles null or empty values safely", () => {
    expect(normalizeDrugName("")).toBe("");
    expect(normalizeDrugName(null)).toBe("");
  });
});

describe("checkInteraction", () => {
  it("detects FDA-grounded high risk interaction via brand names", () => {
    const res = checkInteraction("Coumadin 5mg", "Ecotrin");
    expect(res).not.toBeNull();
    expect(res.level).toBe("High risk");
    expect(res.source).toMatch(/FDA/);
  });

  it("detects CYP2C19 caution between clopidogrel and omeprazole", () => {
    const a = checkInteraction("Plavix", "Prilosec");
    const b = checkInteraction("omeprazole", "clopidogrel");
    expect(a).not.toBeNull();
    expect(a.level).toBe("Moderate caution");
    expect(a).toEqual(b);
  });

  it("returns null for identical or unlisted medications", () => {
    expect(checkInteraction("Metformin", "Glucophage")).toBeNull();
    expect(checkInteraction("Vitamin C", "Loratadine")).toBeNull();
  });
});

describe("checkAllergyAlerts", () => {
  it("detects penicillin-class cross-sensitivity for amoxicillin and Augmentin", () => {
    const alerts = checkAllergyAlerts(
      ["Amoxicillin 500mg", "Augmentin", "Metformin"],
      [{ allergen: "Penicillin", severity: "Severe", reaction: "Hives" }]
    );
    expect(alerts.length).toBe(2);
    expect(alerts[0].severity).toBe("Severe");
    expect(alerts[0].reason).toMatch(/Penicillin-class/i);
  });

  it("checks legacy allergy text alongside structured allergies and ignores 'None'", () => {
    const withAllergy = checkAllergyAlerts(["Ibuprofen 400mg", "Naproxen"], [], "Sulfa, NSAID");
    expect(withAllergy.length).toBe(2);

    const noAllergy = checkAllergyAlerts(["Aspirin", "Ibuprofen"], [], "None");
    expect(noAllergy).toEqual([]);
  });

  it("flags sulfonamide allergies against Bactrim", () => {
    const alerts = checkAllergyAlerts(["Bactrim"], [{ allergen: "Sulfonamide", severity: "Moderate" }]);
    expect(alerts.length).toBe(1);
    expect(alerts[0].allergen).toBe("Sulfonamide");
  });
});
