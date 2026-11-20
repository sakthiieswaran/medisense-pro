/**
 * Server-side drug interaction & allergy verification service.
 * Uses the shared curated FDA-grounded interaction rules and optionally queries
 * the official public OpenFDA Drug Label API when local lookup has no match.
 */
import {
  checkInteraction as checkCuratedInteraction,
  checkAllergyAlerts,
  normalizeDrugName,
} from "../src/data/interactions.js";

async function lookupOpenFdaPair(drugA, drugB) {
  const a = normalizeDrugName(drugA);
  const b = normalizeDrugName(drugB);
  if (!a || !b) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const query = encodeURIComponent(`openfda.generic_name:"${a}"+AND+drug_interactions:"${b}"`);
    const url = `https://api.fda.gov/drug/label.json?search=${query}&limit=1`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { result: null, status: "unavailable" };
    const body = await res.json();
    const label = body?.results?.[0];
    const section = Array.isArray(label?.drug_interactions) ? label.drug_interactions[0] : null;
    if (!section) return { result: null, status: "not_found" };

    // Extract the sentence mentioning drug B
    const sentences = String(section).split(/(?<=[.!?])\s+/);
    const match = sentences.find((s) => s.toLowerCase().includes(b)) || sentences[0] || "";
    return {
      status: "matched",
      result: {
        level: "Moderate caution",
        category: "FDA Drug Labeling",
        explanation: match.slice(0, 320),
        recommendation: "Review full prescribing information and consult your doctor or pharmacist.",
        source: "openFDA Drug Labeling API",
      },
    };
  } catch {
    return { result: null, status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeMedications({
  drugA,
  drugB,
  medications = [],
  allergies = [],
  legacyAllergyText = "",
  enableOpenFdaLookup,
}) {
  let pairResult = null;
  const openFdaEnabled =
    enableOpenFdaLookup !== undefined
      ? Boolean(enableOpenFdaLookup)
      : process.env.ENABLE_OPENFDA_LOOKUP !== "false";
  let openFdaStatus = openFdaEnabled ? "skipped" : "disabled";

  if (drugA && drugB) {
    pairResult = checkCuratedInteraction(drugA, drugB);
    if (!pairResult && openFdaEnabled) {
      const lookup = await lookupOpenFdaPair(drugA, drugB);
      openFdaStatus = lookup?.status || "unavailable";
      pairResult = lookup?.result || null;
    } else if (pairResult) {
      openFdaStatus = "curated_match";
    }
  }

  const allMedNames = medications.length ? medications : [drugA, drugB].filter(Boolean);
  const allergyAlerts = checkAllergyAlerts(allMedNames, allergies, legacyAllergyText);

  const pairWarnings = [];
  for (let i = 0; i < allMedNames.length; i++) {
    for (let j = i + 1; j < allMedNames.length; j++) {
      const hit = checkCuratedInteraction(allMedNames[i], allMedNames[j]);
      if (hit && hit.level !== "Safe") {
        pairWarnings.push({ a: allMedNames[i], b: allMedNames[j], ...hit });
      }
    }
  }

  return { pairResult, allergyAlerts, pairWarnings, openFdaStatus };
}
