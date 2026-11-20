import { uid, todayISO, addDays } from "../shared.jsx";

/* =========================================================================
   MediSense data layer
   -------------------------------------------------------------------------
   This file owns the seed/demo data and the shape of a "patient" record.
   The ORIGINAL fields (medications, logs, healthRecords, notifications,
   aiMessages, nextVisit) are unchanged so every existing screen keeps
   working untouched. Everything below "NEW in v3" is additive — new arrays
   on the same patient object — so the app has exactly one record per
   category, consumed everywhere via src/data/healthRecords.js instead of
   being re-fetched or duplicated per screen.
   ========================================================================= */

function makeMedLogs(medId, medName, dosageLabel, times, days, missedRate, lateRate) {
  const logs = [];
  for (let dback = days; dback >= 1; dback--) {
    const date = addDays(todayISO(), -dback);
    times.forEach((time) => {
      const r = Math.random();
      let status = "Taken";
      let actualTime = time;
      if (r < missedRate) status = "Missed";
      else if (r < missedRate + lateRate) { status = "Late"; actualTime = time; }
      logs.push({
        id: uid(), medId, medName, dosage: dosageLabel, date,
        scheduledTime: time, actualTime: status === "Missed" ? null : actualTime, status,
      });
    });
  }
  return logs;
}

function makeActivity(days) {
  const out = [];
  for (let dback = days; dback >= 0; dback--) {
    const date = addDays(todayISO(), -dback);
    const steps = 3200 + Math.round(Math.random() * 6800);
    out.push({
      id: uid(), date,
      steps,
      distanceKm: Math.round((steps * 0.00075) * 10) / 10,
      activeEnergyKcal: 180 + Math.round(Math.random() * 320),
      exerciseMinutes: Math.round(Math.random() * 45),
      standHours: 4 + Math.round(Math.random() * 8),
    });
  }
  return out;
}

function makeSleep(days) {
  const out = [];
  for (let dback = days; dback >= 0; dback--) {
    const date = addDays(todayISO(), -dback);
    const durationMin = 330 + Math.round(Math.random() * 150);
    const deep = Math.round(durationMin * (0.12 + Math.random() * 0.08));
    const rem = Math.round(durationMin * (0.18 + Math.random() * 0.08));
    const awake = Math.round(durationMin * 0.05);
    const core = durationMin - deep - rem - awake;
    out.push({
      id: uid(), date,
      bedtime: "22:" + String(30 + Math.round(Math.random() * 29)).padStart(2, "0").slice(-2),
      wake: "0" + (6 + Math.round(Math.random())) + ":" + String(Math.round(Math.random() * 59)).padStart(2, "0"),
      durationMin,
      score: Math.round(60 + Math.random() * 35),
      stages: { deep, rem, core, awake },
    });
  }
  return out;
}

function makeNutrition(days) {
  const meals = ["Breakfast", "Lunch", "Dinner", "Snack"];
  const out = [];
  for (let dback = days; dback >= 0; dback--) {
    const date = addDays(todayISO(), -dback);
    meals.forEach((name, i) => {
      if (name === "Snack" && Math.random() < 0.4) return;
      out.push({
        id: uid(), date, time: ["08:00", "12:30", "19:00", "16:00"][i], name,
        calories: 250 + Math.round(Math.random() * 450),
        proteinG: 8 + Math.round(Math.random() * 30),
        carbsG: 20 + Math.round(Math.random() * 60),
        fatG: 5 + Math.round(Math.random() * 25),
        fiberG: Math.round(Math.random() * 8),
        sodiumMg: 150 + Math.round(Math.random() * 700),
        caffeineMg: name === "Breakfast" ? Math.round(Math.random() * 95) : 0,
      });
    });
  }
  return out;
}

function makeHydration(days) {
  const out = [];
  for (let dback = days; dback >= 0; dback--) {
    const date = addDays(todayISO(), -dback);
    out.push({ id: uid(), date, ml: 900 + Math.round(Math.random() * 1400), targetMl: 2000 });
  }
  return out;
}

function makeMobility(days) {
  const out = [];
  for (let dback = days; dback >= 0; dback--) {
    const date = addDays(todayISO(), -dback);
    out.push({
      id: uid(), date,
      walkingSpeedKmh: Math.round((3.6 + Math.random() * 1.6) * 10) / 10,
      stepsSteadinessPct: Math.round(75 + Math.random() * 20),
      stepLengthCm: Math.round(58 + Math.random() * 12),
      stairSpeedStepsPerSec: Math.round((0.6 + Math.random() * 0.5) * 100) / 100,
    });
  }
  return out;
}

function makeMentalWellbeing(days) {
  const moods = ["Very good", "Good", "Neutral", "Low", "Very low"];
  const out = [];
  for (let dback = days; dback >= 0; dback--) {
    const date = addDays(todayISO(), -dback);
    out.push({
      id: uid(), date,
      mood: moods[Math.floor(Math.random() * 3)],
      stressLevel: Math.round(1 + Math.random() * 6),
      mindfulMinutes: Math.random() < 0.6 ? Math.round(Math.random() * 15) : 0,
      journal: "",
    });
  }
  return out;
}

function makeWorkouts(days) {
  const types = ["Walking", "Running", "Cycling", "Strength training", "Yoga"];
  const out = [];
  for (let i = 0; i < Math.round(days / 3); i++) {
    const dback = Math.round(Math.random() * days);
    const type = types[Math.floor(Math.random() * types.length)];
    const duration = 15 + Math.round(Math.random() * 45);
    out.push({
      id: uid(), type, date: addDays(todayISO(), -dback),
      durationMin: duration,
      distanceKm: ["Walking", "Running", "Cycling"].includes(type) ? Math.round(Math.random() * 8 * 10) / 10 : null,
      calories: Math.round(duration * (4 + Math.random() * 6)),
      avgHeartRate: 95 + Math.round(Math.random() * 45),
      notes: "",
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ------------------------------- seed data -------------------------------- */

export function buildSeedData() {
  const doctor = {
    id: "doc1", name: "Dr. Sarah Chen", specialty: "Internal Medicine & Endocrinology",
    email: "dr.chen@medisense.demo", phone: "+1 555-0177",
  };
  const doctors = [
    doctor,
    { id: "doc2", name: "Dr. Vikram Rao", specialty: "Cardiology", email: "dr.rao@medisense.demo", phone: "+1 555-0188" },
  ];

  // ---- Patient 1: Alex Johnson (the demo patient login) ----
  const p1Meds = [
    { id: "m1", name: "Metformin", genericName: "Metformin HCl", dosage: "500", unit: "mg",
      frequency: "Twice daily", timesPerDay: 2, times: ["08:00", "20:00"],
      startDate: addDays(todayISO(), -60), endDate: "", withFood: true,
      instructions: "Take after meals to reduce stomach upset.", notes: "For blood sugar management.", active: true,
      source: "doctor", currentStock: 10, refillThreshold: 7 },
    { id: "m2", name: "Aspirin", genericName: "Acetylsalicylic acid", dosage: "75", unit: "mg",
      frequency: "Once daily", timesPerDay: 1, times: ["08:00"],
      startDate: addDays(todayISO(), -60), endDate: "", withFood: true,
      instructions: "Low-dose, take with breakfast.", notes: "For cardiovascular protection.", active: true,
      source: "doctor", currentStock: 24, refillThreshold: 7 },
    { id: "m3", name: "Vitamin D3", genericName: "Cholecalciferol", dosage: "1000", unit: "IU",
      frequency: "Once daily", timesPerDay: 1, times: ["13:00"],
      startDate: addDays(todayISO(), -60), endDate: "", withFood: false,
      instructions: "Take with a glass of water.", notes: "", active: true,
      source: "patient", currentStock: 42, refillThreshold: 7 },
  ];
  let p1Logs = [];
  p1Meds.forEach((med) => {
    med.times.forEach((t) => {
      const flaky = med.id === "m1" && t === "20:00";
      p1Logs = p1Logs.concat(makeMedLogs(med.id, med.name, `${med.dosage}${med.unit}`, [t], 21, flaky ? 0.34 : 0.08, flaky ? 0.28 : 0.08));
    });
  });
  const p1Health = [];
  for (let dback = 400; dback >= 0; dback--) {
    // Daily density for the last 30 days (mirrors real day-to-day logging);
    // sparser weekly samples further back, like periodic manual check-ins.
    if (dback > 30 && dback % 7 !== 0) continue;
    const date = addDays(todayISO(), -dback);
    const seasonalDrift = Math.sin(dback / 60) * 3; // gentle long-range wobble so trends aren't perfectly flat
    p1Health.push({
      id: uid(), date,
      heartRate: 68 + Math.round(Math.random() * 10 + seasonalDrift),
      systolic: 118 + Math.round(Math.random() * 10 + seasonalDrift),
      diastolic: 76 + Math.round(Math.random() * 8),
      glucose: 95 + Math.round(Math.random() * 25 - seasonalDrift),
      weight: Math.round((63 + Math.random() * 2 - dback / 500) * 10) / 10,
      temperature: 98.2 + Math.round(Math.random() * 8) / 10,
      bloodOxygen: dback > 30 ? null : 96 + Math.round(Math.random() * 3),
      respiratoryRate: dback > 30 ? null : 12 + Math.round(Math.random() * 5),
      restingHeartRate: dback > 30 ? null : 60 + Math.round(Math.random() * 8),
    });
  }

  // ---- Patient 2: Meera Nair (good adherence, no visit scheduled yet) ----
  const p2Meds = [
    { id: "m4", name: "Levothyroxine", genericName: "Levothyroxine sodium", dosage: "75", unit: "mcg",
      frequency: "Once daily", timesPerDay: 1, times: ["07:00"],
      startDate: addDays(todayISO(), -90), endDate: "", withFood: false,
      instructions: "Take on an empty stomach, 30 minutes before breakfast.", notes: "For hypothyroidism.", active: true },
  ];
  let p2Logs = [];
  p2Meds.forEach((med) => { p2Logs = p2Logs.concat(makeMedLogs(med.id, med.name, `${med.dosage}${med.unit}`, med.times, 21, 0.04, 0.05)); });

  // ---- Patient 3: Robert Diaz (moderate adherence, visit scheduled) ----
  const p3Meds = [
    { id: "m5", name: "Atorvastatin", genericName: "Atorvastatin calcium", dosage: "20", unit: "mg",
      frequency: "Once daily", timesPerDay: 1, times: ["21:00"],
      startDate: addDays(todayISO(), -120), endDate: "", withFood: false,
      instructions: "Take in the evening.", notes: "Cholesterol management.", active: true },
    { id: "m6", name: "Clopidogrel", genericName: "Clopidogrel bisulfate", dosage: "75", unit: "mg",
      frequency: "Once daily", timesPerDay: 1, times: ["08:00"],
      startDate: addDays(todayISO(), -120), endDate: "", withFood: true,
      instructions: "Take with breakfast.", notes: "Prevents blood clots.", active: true },
  ];
  let p3Logs = [];
  p3Meds.forEach((med) => { p3Logs = p3Logs.concat(makeMedLogs(med.id, med.name, `${med.dosage}${med.unit}`, med.times, 21, 0.22, 0.15)); });

  const patients = [
    {
      id: "p1", name: "Alex Johnson", age: 68, dob: addDays(todayISO(), -68 * 365), sex: "Male",
      email: "alex@medisense.demo", phone: "+1 555-0142",
      emergencyContact: "Priya Johnson — +1 555-0198", conditions: "Type 2 Diabetes, Hypertension", allergies: "Penicillin",
      medications: p1Meds, logs: p1Logs, healthRecords: p1Health,
      notifications: [
        { id: uid(), type: "missed", category: "medication", severity: "warning", message: "Your 8:00 PM Metformin dose was marked Missed.", date: addDays(todayISO(), -1), read: false },
        { id: uid(), type: "pattern", category: "health", severity: "warning", message: "Your 8:00 PM dose has been missed several times recently. Consider an earlier reminder.", date: addDays(todayISO(), -2), read: true },
      ],
      aiMessages: [], nextVisit: null,
      messages: [
        { id: uid(), sender: "doctor", text: "Hi Alex, how have the evening Metformin doses been going? I noticed a few missed ones.", date: addDays(todayISO(), -2), time: "09:14", read: true },
        { id: uid(), sender: "patient", text: "Honestly I keep forgetting after dinner — I'll try setting an alarm.", date: addDays(todayISO(), -2), time: "18:40", read: true },
        { id: uid(), sender: "doctor", text: "That should help. Let's review it at your next visit.", date: addDays(todayISO(), -1), time: "10:02", read: false },
      ],

      /* ---- NEW in v3: additional health categories, additive only ---- */
      activity: makeActivity(30),
      sleep: makeSleep(30),
      nutrition: makeNutrition(14),
      hydration: makeHydration(14),
      mobility: makeMobility(30),
      mentalWellbeing: makeMentalWellbeing(14),
      workouts: makeWorkouts(30),
      body: {
        heightCm: 175, bodyFatPct: 24, leanMassKg: 48, waistCm: 96,
        history: p1Health.map((h) => ({ date: h.date, weightKg: h.weight })),
      },
      records: {
        conditions: [
          { id: uid(), name: "Type 2 Diabetes", dateAdded: addDays(todayISO(), -700), status: "Ongoing", notes: "Managed with Metformin and lifestyle changes." },
          { id: uid(), name: "Hypertension", dateAdded: addDays(todayISO(), -500), status: "Ongoing", notes: "Monitored at routine visits." },
        ],
        allergies: [
          { id: uid(), allergen: "Penicillin", reaction: "Rash, hives", severity: "Moderate", notes: "Confirmed by allergist in 2019." },
        ],
        labResults: [
          { id: uid(), test: "HbA1c", result: "6.8", unit: "%", referenceRange: "4.0–5.6 (non-diabetic)", date: addDays(todayISO(), -30), notes: "Improved from last quarter." },
          { id: uid(), test: "Fasting Glucose", result: "112", unit: "mg/dL", referenceRange: "70–99", date: addDays(todayISO(), -30), notes: "" },
          { id: uid(), test: "LDL Cholesterol", result: "118", unit: "mg/dL", referenceRange: "<100", date: addDays(todayISO(), -90), notes: "" },
          { id: uid(), test: "Creatinine", result: "0.9", unit: "mg/dL", referenceRange: "0.6–1.3", date: addDays(todayISO(), -90), notes: "" },
        ],
        immunizations: [
          { id: uid(), vaccine: "Influenza", date: addDays(todayISO(), -120), dose: "Annual", notes: "" },
          { id: uid(), vaccine: "Tdap", date: addDays(todayISO(), -900), dose: "Booster", notes: "" },
        ],
        procedures: [
          { id: uid(), name: "Retinal screening", date: addDays(todayISO(), -200), provider: "Dr. Sarah Chen", notes: "No diabetic retinopathy found." },
        ],
        hospitalizations: [],
        documents: [],
      },
      appointmentHistory: [
        { id: uid(), date: addDays(todayISO(), -60), time: "10:00", doctorId: "doc1", doctorName: "Dr. Sarah Chen", type: "Routine Endocrine Review", location: "MediSense Clinic — Room 4", status: "completed", notes: "HbA1c improved to 6.8%. Continue current Metformin 500mg BID." },
      ],
      careTeam: [
        { id: uid(), name: "Dr. Sarah Chen", role: "Primary care / Endocrinology", type: "doctor", doctorId: "doc1" },
      ],
      healthShares: [
        { id: uid(), granteeName: "Dr. Sarah Chen", granteeType: "doctor", doctorId: "doc1",
          categories: { medications: true, vitals: true, activity: false, sleep: false, nutrition: false, records: true },
          until: null, ongoing: true, grantedDate: addDays(todayISO(), -60) },
      ],
      dataSources: [
        { id: uid(), name: "MediSense manual entry", type: "manual", connected: true, lastSync: todayISO() },
        { id: uid(), name: "Wearable / smart watch", type: "wearable", connected: false, lastSync: null },
        { id: uid(), name: "Blood pressure monitor", type: "bp_monitor", connected: false, lastSync: null },
        { id: uid(), name: "Glucose monitor", type: "glucose_monitor", connected: false, lastSync: null },
        { id: uid(), name: "Pulse oximeter", type: "pulse_ox", connected: false, lastSync: null },
      ],
      goals: { dailySteps: 7000, sleepHours: 7.5, adherencePct: 95, weightTargetKg: null },
      dashboardPrefs: {
        favoriteMetrics: ["heartRate", "bloodPressure", "glucose"],
        enabledCards: ["snapshot", "medications", "activity", "sleep", "trends", "alerts", "appointment"],
        cardOrder: ["snapshot", "medications", "activity", "sleep", "trends", "alerts", "appointment"],
      },
    },
    {
      id: "p2", name: "Meera Nair", age: 54, dob: addDays(todayISO(), -54 * 365), sex: "Female",
      email: "meera@medisense.demo", phone: "+1 555-0233",
      emergencyContact: "Arjun Nair — +1 555-0234", conditions: "Hypothyroidism", allergies: "None known",
      medications: p2Meds, logs: p2Logs, healthRecords: [],
      notifications: [], aiMessages: [], nextVisit: null, messages: [],
      activity: makeActivity(30), sleep: makeSleep(30), nutrition: makeNutrition(14), hydration: makeHydration(14),
      mobility: makeMobility(30), mentalWellbeing: makeMentalWellbeing(14), workouts: makeWorkouts(30),
      body: { heightCm: 162, bodyFatPct: 29, leanMassKg: 41, waistCm: 84, history: [] },
      records: { conditions: [{ id: uid(), name: "Hypothyroidism", dateAdded: addDays(todayISO(), -900), status: "Ongoing", notes: "" }], allergies: [], labResults: [
        { id: uid(), test: "TSH", result: "2.1", unit: "mIU/L", referenceRange: "0.4–4.0", date: addDays(todayISO(), -45), notes: "" },
      ], immunizations: [], procedures: [], documents: [] },
      careTeam: [{ id: uid(), name: "Dr. Sarah Chen", role: "Primary care", type: "doctor", doctorId: "doc1" }],
      healthShares: [],
      dataSources: [{ id: uid(), name: "MediSense manual entry", type: "manual", connected: true, lastSync: todayISO() }],
      goals: { dailySteps: 8000, sleepHours: 8, adherencePct: 95, weightTargetKg: null },
      dashboardPrefs: {
        favoriteMetrics: ["heartRate", "weight"],
        enabledCards: ["snapshot", "medications", "activity", "sleep", "trends", "alerts", "appointment"],
        cardOrder: ["snapshot", "medications", "activity", "sleep", "trends", "alerts", "appointment"],
      },
    },
    {
      id: "p3", name: "Robert Diaz", age: 72, dob: addDays(todayISO(), -72 * 365), sex: "Male",
      email: "robert@medisense.demo", phone: "+1 555-0311",
      emergencyContact: "Elena Diaz — +1 555-0312", conditions: "Coronary Artery Disease", allergies: "Sulfa drugs",
      medications: p3Meds, logs: p3Logs, healthRecords: [],
      notifications: [
        { id: uid(), type: "missed", category: "medication", severity: "critical", message: "Clopidogrel 75mg dose was marked Missed.", date: addDays(todayISO(), -3), read: false },
      ], aiMessages: [], nextVisit: null, messages: [],
      activity: makeActivity(30), sleep: makeSleep(30), nutrition: makeNutrition(14), hydration: makeHydration(14),
      mobility: makeMobility(30), mentalWellbeing: makeMentalWellbeing(14), workouts: makeWorkouts(30),
      body: { heightCm: 178, bodyFatPct: 27, leanMassKg: 55, waistCm: 102, history: [] },
      records: { conditions: [{ id: uid(), name: "Coronary Artery Disease", dateAdded: addDays(todayISO(), -1200), status: "Ongoing", notes: "" }],
        allergies: [{ id: uid(), allergen: "Sulfa drugs", reaction: "Skin rash", severity: "Moderate", notes: "" }],
        labResults: [{ id: uid(), test: "LDL Cholesterol", result: "95", unit: "mg/dL", referenceRange: "<100", date: addDays(todayISO(), -60), notes: "" }],
        immunizations: [], procedures: [], documents: [] },
      careTeam: [{ id: uid(), name: "Dr. Sarah Chen", role: "Cardiology", type: "doctor", doctorId: "doc1" }],
      healthShares: [],
      dataSources: [{ id: uid(), name: "MediSense manual entry", type: "manual", connected: true, lastSync: todayISO() }],
      goals: { dailySteps: 5000, sleepHours: 7, adherencePct: 90, weightTargetKg: null },
      dashboardPrefs: {
        favoriteMetrics: ["heartRate", "bloodPressure"],
        enabledCards: ["snapshot", "medications", "activity", "sleep", "trends", "alerts", "appointment"],
        cardOrder: ["snapshot", "medications", "activity", "sleep", "trends", "alerts", "appointment"],
      },
    },
  ];

  // ---- doctor availability slots (next 10 weekdays, 3 slots/day) ----
  const availability = [];
  let dcount = 0, added = 0;
  while (added < 10) {
    dcount += 1;
    const date = addDays(todayISO(), dcount);
    const dow = new Date(date + "T00:00:00").getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    added += 1;
    ["10:00", "11:30", "15:00"].forEach((time) => {
      availability.push({ id: uid(), date, time, booked: false, patientId: null });
    });
  }
  availability[1].booked = true; availability[1].patientId = "p1";
  patients[0].nextVisit = { date: availability[1].date, time: availability[1].time, doctorId: "doc1", type: "Follow-up", location: "MediSense Clinic — Room 4" };
  availability[10].booked = true; availability[10].patientId = "p3";
  patients[2].nextVisit = { date: availability[10].date, time: availability[10].time, doctorId: "doc1", type: "Follow-up", location: "MediSense Clinic — Room 2" };

  return { doctor, doctors, availability, patients, settings: { reminders: true, doctorAlerts: true, notificationPrefs: { medication: true, health: true, appointments: true, system: true } } };
}

/* ------------------------------ derived data helpers ------------------------------ */

export function todaysSchedule(patient) {
  const t = todayISO();
  const rows = [];
  patient.medications.filter((m) => m.active).forEach((med) => {
    med.times.forEach((time) => {
      const log = patient.logs.find((l) => l.medId === med.id && l.date === t && l.scheduledTime === time);
      rows.push({ medId: med.id, name: med.name, dosage: `${med.dosage}${med.unit}`, time, instructions: med.instructions, status: log ? log.status : "Upcoming", logId: log?.id });
    });
  });
  return rows.sort((a, b) => a.time.localeCompare(b.time));
}

export function computeAdherence(logs, days = 7) {
  const cutoff = addDays(todayISO(), -days);
  const relevant = logs.filter((l) => l.date >= cutoff && l.date < todayISO() && l.status !== "Upcoming");
  if (!relevant.length) return 0;
  const taken = relevant.filter((l) => l.status === "Taken" || l.status === "Late").length;
  return Math.round((taken / relevant.length) * 100);
}

export function missedDaysCount(logs, days = 30) {
  const cutoff = addDays(todayISO(), -days);
  const missedDates = new Set(logs.filter((l) => l.status === "Missed" && l.date >= cutoff).map((l) => l.date));
  return missedDates.size;
}

export { INTERACTION_DB, checkInteraction, checkAllergyAlerts, normalizeDrugName } from "./interactions.js";
