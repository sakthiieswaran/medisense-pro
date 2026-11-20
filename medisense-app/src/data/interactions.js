/**
 * MediSense Drug Interaction & Allergy Cross-Check Module
 * -------------------------------------------------------
 * Curated clinical reference rules grounded in FDA prescribing information
 * for common primary-care and chronic-care medications, plus allergy-class
 * cross-checks. Educational reference only — not a substitute for pharmacist
 * or clinician verification.
 */

export const DRUG_ALIASES = {
  coumadin: "warfarin",
  jantoven: "warfarin",
  glucophage: "metformin",
  advil: "ibuprofen",
  motrin: "ibuprofen",
  aleve: "naproxen",
  plavix: "clopidogrel",
  lipitor: "atorvastatin",
  zocor: "simvastatin",
  prilosec: "omeprazole",
  synthroid: "levothyroxine",
  levoxyl: "levothyroxine",
  prinivil: "lisinopril",
  zestril: "lisinopril",
  norvasc: "amlodipine",
  ecotrin: "aspirin",
  "low-dose aspirin": "aspirin",
  augmentin: "amoxicillin",
  bactrim: "sulfamethoxazole",
};

export function normalizeDrugName(name) {
  const cleaned = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+\d+(\.\d+)?\s*(mg|mcg|iu|ml|g)\b/gi, "")
    .trim();
  return DRUG_ALIASES[cleaned] || cleaned;
}

export const INTERACTION_DB = {
  "warfarin|aspirin": {
    level: "High risk",
    explanation: "Both affect blood clotting. Combined use substantially raises bleeding risk (FDA label warning).",
    recommendation: "Consult your healthcare professional before combining these.",
    category: "Bleeding risk",
    source: "FDA Prescribing Information",
  },
  "warfarin|ibuprofen": {
    level: "High risk",
    explanation: "NSAIDs like ibuprofen combined with warfarin markedly increase the risk of serious gastrointestinal bleeding and INR spikes.",
    recommendation: "Avoid combining unless specifically directed and closely monitored by your doctor.",
    category: "Bleeding risk",
    source: "FDA Prescribing Information",
  },
  "warfarin|naproxen": {
    level: "High risk",
    explanation: "Combining naproxen with warfarin significantly increases gastrointestinal bleeding risk.",
    recommendation: "Consult your doctor or pharmacist before taking naproxen with warfarin.",
    category: "Bleeding risk",
    source: "FDA Prescribing Information",
  },
  "clopidogrel|omeprazole": {
    level: "Moderate caution",
    explanation: "Omeprazole inhibits CYP2C19, which can reduce the antiplatelet effect of clopidogrel (FDA boxed caution).",
    recommendation: "Ask your doctor whether an alternative acid reducer (e.g., pantoprazole or famotidine) is preferred.",
    category: "Reduced efficacy",
    source: "FDA Drug Safety Communication",
  },
  "clopidogrel|aspirin": {
    level: "Moderate caution",
    explanation: "Dual antiplatelet therapy increases bleeding risk, though doctors sometimes prescribe both intentionally after cardiac procedures.",
    recommendation: "Confirm intended dual therapy with your cardiologist and report unusual bruising or bleeding.",
    category: "Bleeding risk",
    source: "FDA Prescribing Information",
  },
  "clopidogrel|ibuprofen": {
    level: "High risk",
    explanation: "Combining NSAIDs with clopidogrel raises the risk of gastrointestinal bleeding.",
    recommendation: "Check with your doctor or pharmacist for safer pain-relief alternatives.",
    category: "Bleeding risk",
    source: "FDA Prescribing Information",
  },
  "clopidogrel|naproxen": {
    level: "High risk",
    explanation: "Combining naproxen with clopidogrel increases gastrointestinal bleeding risk.",
    recommendation: "Consult your clinician before co-administration.",
    category: "Bleeding risk",
    source: "FDA Prescribing Information",
  },
  "lisinopril|ibuprofen": {
    level: "Moderate caution",
    explanation: "NSAIDs can blunt the blood-pressure-lowering effect of ACE inhibitors like lisinopril and strain kidney function.",
    recommendation: "Limit NSAID use and consult your physician, especially if you have kidney disease or dehydration.",
    category: "Renal / Blood Pressure",
    source: "FDA Prescribing Information",
  },
  "lisinopril|naproxen": {
    level: "Moderate caution",
    explanation: "NSAIDs may reduce lisinopril's blood pressure effect and raise acute kidney injury risk.",
    recommendation: "Consult your clinician before regular NSAID use.",
    category: "Renal / Blood Pressure",
    source: "FDA Prescribing Information",
  },
  "lisinopril|potassium": {
    level: "High risk",
    explanation: "ACE inhibitors raise potassium retention; adding potassium supplements increases hyperkalemia risk.",
    recommendation: "Do not take potassium supplements or salt substitutes without doctor supervision and lab monitoring.",
    category: "Electrolytes (Hyperkalemia)",
    source: "FDA Prescribing Information",
  },
  "simvastatin|amlodipine": {
    level: "Moderate caution",
    explanation: "Amlodipine increases simvastatin blood levels, raising muscle toxicity risk when simvastatin exceeds 20 mg daily.",
    recommendation: "Verify total daily simvastatin dose does not exceed 20 mg with your prescriber.",
    category: "Muscle toxicity",
    source: "FDA Drug Safety Communication",
  },
  "metformin|alcohol": {
    level: "Moderate caution",
    explanation: "Alcohol can increase the risk of low blood sugar and lactic acidosis with Metformin.",
    recommendation: "Discuss safe alcohol limits with your doctor.",
    category: "Metabolic",
    source: "FDA Prescribing Information",
  },
  "aspirin|ibuprofen": {
    level: "Moderate caution",
    explanation: "Taking both may increase gastrointestinal irritation and reduce aspirin's cardio-protective effect.",
    recommendation: "Space doses apart and check with a pharmacist.",
    category: "Gastrointestinal",
    source: "FDA Guidance",
  },
  "levothyroxine|calcium": {
    level: "Moderate caution",
    explanation: "Calcium binds levothyroxine in the gut and can reduce thyroid hormone absorption.",
    recommendation: "Separate levothyroxine and calcium doses by at least 4 hours.",
    category: "Absorption",
    source: "FDA Prescribing Information",
  },
  "levothyroxine|iron": {
    level: "Moderate caution",
    explanation: "Iron supplements reduce absorption of levothyroxine.",
    recommendation: "Separate levothyroxine and iron supplements by at least 4 hours.",
    category: "Absorption",
    source: "FDA Prescribing Information",
  },
  "atorvastatin|clopidogrel": {
    level: "Safe",
    explanation: "No major known interaction between these two at standard doses.",
    recommendation: "Continue as prescribed and report any unusual muscle pain.",
    category: "General",
    source: "Clinical Reference",
  },
  "metformin|vitamin d3": {
    level: "Safe",
    explanation: "No known significant interaction between these two.",
    recommendation: "No special precautions typically needed.",
    category: "General",
    source: "Clinical Reference",
  },
  "metformin|atorvastatin": {
    level: "Safe",
    explanation: "Commonly co-prescribed with no clinically significant negative interaction.",
    recommendation: "Continue routine monitoring as directed by your clinician.",
    category: "General",
    source: "Clinical Reference",
  },
  "metformin|lisinopril": {
    level: "Safe",
    explanation: "Frequently co-prescribed in diabetes and hypertension management with no adverse interaction.",
    recommendation: "Continue routine blood pressure, glucose, and kidney function monitoring.",
    category: "General",
    source: "Clinical Reference",
  },
  "metformin|aspirin": {
    level: "Safe",
    explanation: "Low-dose aspirin is commonly co-prescribed with metformin; high-dose salicylates can mildly lower glucose.",
    recommendation: "Continue monitoring blood glucose as advised.",
    category: "General",
    source: "Clinical Reference",
  },
};

export const ALLERGY_DRUG_CLASSES = [
  {
    allergenTerms: ["penicillin", "amoxicillin", "ampicillin", "beta-lactam"],
    drugs: ["penicillin", "amoxicillin", "ampicillin", "piperacillin", "augmentin", "amoxicillin-clavulanate", "penicillin vk"],
    className: "Penicillin-class antibiotic",
  },
  {
    allergenTerms: ["sulfa", "sulfonamide", "sulfamethoxazole", "bactrim"],
    drugs: ["sulfamethoxazole", "trimethoprim-sulfamethoxazole", "bactrim", "sulfasalazine", "sulfadiazine"],
    className: "Sulfonamide",
  },
  {
    allergenTerms: ["aspirin", "nsaid", "salicylate", "ibuprofen", "naproxen"],
    drugs: ["aspirin", "ibuprofen", "naproxen", "diclofenac", "ketorolac", "meloxicam", "indomethacin"],
    className: "NSAID / Salicylate",
  },
  {
    allergenTerms: ["statin", "atorvastatin", "simvastatin"],
    drugs: ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "lovastatin"],
    className: "HMG-CoA reductase inhibitor (Statin)",
  },
];

export function checkInteraction(a, b) {
  if (!a || !b) return null;
  const na = normalizeDrugName(a);
  const nb = normalizeDrugName(b);
  if (!na || !nb || na === nb) return null;
  return INTERACTION_DB[`${na}|${nb}`] || INTERACTION_DB[`${nb}|${na}`] || null;
}

/**
 * Checks a list of medication names against recorded allergies (both structured
 * records.allergies and free-text patient.allergies).
 */
export function checkAllergyAlerts(medNames = [], structuredAllergies = [], legacyAllergyText = "") {
  const alerts = [];
  const recorded = [
    ...(structuredAllergies || []).map((a) => ({
      name: String(a.allergen || "").trim(),
      severity: a.severity || "Recorded",
      reaction: a.reaction || "",
    })),
  ];
  if (legacyAllergyText && !/none/i.test(legacyAllergyText)) {
    legacyAllergyText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((term) => {
        if (!recorded.some((r) => r.name.toLowerCase() === term.toLowerCase())) {
          recorded.push({ name: term, severity: "Recorded", reaction: "" });
        }
      });
  }

  for (const medRaw of medNames) {
    const med = normalizeDrugName(medRaw);
    if (!med) continue;
    for (const alg of recorded) {
      const algLower = alg.name.toLowerCase();
      if (!algLower) continue;

      if (med.includes(algLower) || algLower.includes(med)) {
        alerts.push({
          medication: medRaw,
          allergen: alg.name,
          severity: alg.severity,
          reaction: alg.reaction,
          reason: `Direct match with recorded allergy to ${alg.name}.`,
        });
        continue;
      }

      for (const cls of ALLERGY_DRUG_CLASSES) {
        const allergyMatchesClass = cls.allergenTerms.some((t) => algLower.includes(t));
        const drugMatchesClass = cls.drugs.some((d) => med.includes(d));
        if (allergyMatchesClass && drugMatchesClass) {
          alerts.push({
            medication: medRaw,
            allergen: alg.name,
            severity: alg.severity,
            reaction: alg.reaction,
            reason: `${medRaw} belongs to the ${cls.className} class and may cross-react with your ${alg.name} allergy.`,
          });
        }
      }
    }
  }
  return alerts;
}
