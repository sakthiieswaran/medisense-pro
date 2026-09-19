import React, { useState } from "react";
import { Sparkles, MessageCircle, Download, TrendingUp, Bell, Printer } from "lucide-react";
import { COLORS, Card, Heading, EmptyState, StatTile, SegmentedControl, SeverityDot, fmtDate, toast, todayISO, addDays } from "../shared.jsx";
import { todaysSchedule, computeAdherence } from "../data/seed.js";
import { generateInsights, healthTrendSummaries } from "../data/healthRecords.js";
import { to12h } from "../shared.jsx";

/* =========================================================================
   Insights module — AI chat + auto-generated, non-diagnostic observations
   drawn entirely from the central health data layer, plus Reports.
   ========================================================================= */

function buildAIContext(patient, doctor) {
  const schedule = todaysSchedule(patient);
  const d7 = computeAdherence(patient.logs, 7);
  const recentMissed = patient.logs.filter((l) => l.status === "Missed" && l.date >= addDays(todayISO(), -14)).map((l) => `${l.medName} on ${l.date} at ${l.scheduledTime}`);
  const trends = healthTrendSummaries(patient).map((t) => `${t.label}: ${t.direction}`).join("; ");
  return `Patient: ${patient.name}, age ${patient.age}. Conditions: ${patient.conditions}. Allergies: ${patient.allergies}.
Doctor: ${doctor.name} (${doctor.specialty}). Next visit: ${patient.nextVisit ? `${patient.nextVisit.date} ${patient.nextVisit.time}` : "not scheduled"}.
Today's schedule: ${schedule.map((s) => `${s.name} ${s.dosage} at ${to12h(s.time)} (${s.status})`).join("; ") || "none"}.
7-day adherence: ${d7}%.
Recent missed doses (last 14 days): ${recentMissed.join("; ") || "none"}.
Active medications: ${patient.medications.filter((m) => m.active).map((m) => `${m.name} ${m.dosage}${m.unit}, ${m.frequency}`).join("; ")}.
Recent health trends (30 days): ${trends || "not enough data"}.`;
}

function AIChat({ data, patient, updatePatient }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messages = patient.aiMessages || [];
  const suggestions = ["What medicines do I need to take today?", "How is my adherence trending?", "Summarize my recent health trends", "When is my next doctor visit?"];

  const send = async (text) => {
    if (!text.trim() || sending) return;
    setSending(true);
    const newMessages = [...messages, { role: "user", content: text }];
    await updatePatient(patient.id, (p) => ({ ...p, aiMessages: newMessages }));
    setInput("");
    try {
      const system = `You are MediSense AI Insights, a health-observation assistant inside a patient's health app. Use ONLY the patient context below to answer questions — never invent data that isn't given.
You are NOT a doctor. Never diagnose conditions, never prescribe or change medication or dosages, never tell the patient to stop a medication. Distinguish clearly between a data observation and a medical diagnosis — you only do the former. For any medical judgment question, give general educational information and end with a reminder to consult their doctor.
Keep responses concise and friendly.

Patient context:
${buildAIContext(patient, data.doctor)}`;
      const res = await fetch("http://localhost:3001/api/ai-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system, messages: newMessages.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI proxy request failed");
      const reply = json.text || "I couldn't generate a response just now. Please try again.";
      await updatePatient(patient.id, (p) => ({ ...p, aiMessages: [...newMessages, { role: "assistant", content: reply }] }));
    } catch (e) {
      const message = e.message?.includes("ANTHROPIC_API_KEY")
        ? "MediSense AI isn't set up yet — add your Anthropic API key to ai-proxy/.env and restart the proxy server."
        : "I ran into a problem reaching the assistant service. Make sure the AI proxy server is running (see README), then try again.";
      await updatePatient(patient.id, (p) => ({ ...p, aiMessages: [...newMessages, { role: "assistant", content: message }] }));
    }
    setSending(false);
  };

  return (
    <Card className="p-5">
      <div className="min-h-[280px] max-h-[420px] overflow-y-auto space-y-3 mb-4">
        {messages.length === 0 && <EmptyState icon={MessageCircle} title="Ask MediSense AI" body="Try one of the suggestions below, or ask your own question." />}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] px-3.5 py-2.5 rounded-[20px] text-[14px] leading-relaxed" style={m.role === "user" ? { background: COLORS.primary, color: "white" } : { background: COLORS.mint, color: COLORS.ink }}>{m.content}</div>
          </div>
        ))}
        {sending && <div className="text-[13px]" style={{ color: COLORS.inkSoft }}>MediSense AI is thinking…</div>}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {suggestions.map((s) => <button key={s} onClick={() => send(s)} className="text-[12.5px] px-3 py-1.5 rounded-full border hover:bg-black/5" style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>{s}</button>)}
      </div>
      <div className="flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Ask about your health…" className="flex-1 px-3.5 py-2.5 rounded-[14px] border text-[14px] outline-none" style={{ borderColor: COLORS.hair }} />
        <button onClick={() => send(input)} disabled={sending} className="text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white disabled:opacity-40" style={{ background: COLORS.primary }}>Send</button>
      </div>
    </Card>
  );
}

function InsightCards({ patient }) {
  const insights = generateInsights(patient);
  if (insights.length === 0) return <Card className="p-5"><EmptyState icon={Sparkles} title="Not enough data yet" body="Keep logging medications and readings to unlock insights." /></Card>;
  return (
    <div className="space-y-3">
      {insights.map((ins) => (
        <Card key={ins.id} className="p-4 flex items-start gap-3">
          <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: ins.type === "recommendation" ? COLORS.warningSoft : COLORS.lavenderSoft }}>
            {ins.type === "recommendation" ? <TrendingUp size={14} color={COLORS.amber} /> : <Sparkles size={14} color={COLORS.lavender} />}
          </span>
          <div>
            <span className="text-[14px]">{ins.text}</span>
            <div className="text-[11px] mt-1 font-medium uppercase tracking-wide" style={{ color: COLORS.inkFaint }}>{ins.type === "recommendation" ? "Recommendation" : "Data observation"}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Notifications({ patient, updatePatient }) {
  const markRead = async (id) => { await updatePatient(patient.id, (p) => ({ ...p, notifications: p.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })); };
  const markAllRead = async () => { await updatePatient(patient.id, (p) => ({ ...p, notifications: p.notifications.map((n) => ({ ...n, read: true })) })); toast("All notifications marked as read"); };
  const sorted = [...(patient.notifications || [])].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px]" style={{ color: COLORS.inkSoft }}>Missed doses, adherence changes, and appointment reminders.</p>
        <button onClick={markAllRead} className="text-[13px] font-medium flex-shrink-0" style={{ color: COLORS.primary }}>Mark all as read</button>
      </div>
      <Card>
        {sorted.length === 0 ? <EmptyState icon={Bell} title="No notifications" body="You're all caught up." /> : sorted.map((n, i) => (
          <div key={n.id} onClick={() => markRead(n.id)} className="flex items-start gap-3 px-5 py-4 cursor-pointer" style={{ borderTop: i ? `1px solid ${COLORS.hair}` : "none", background: n.read ? "transparent" : COLORS.mint }}>
            <SeverityDot severity={n.severity} />
            <div className="flex-1">
              <div className="text-[13.5px]" style={{ fontWeight: n.read ? 400 : 600 }}>{n.message}</div>
              <div className="text-[12px] mt-0.5" style={{ color: COLORS.inkSoft }}>{fmtDate(n.date)} · {n.category || "medication"}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function buildReportHtml({ patient, doctor, range, sections, stats, trends }) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const rows = (items) => items.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  let body = "";

  if (sections.has("Medications")) {
    body += `<h2>Medications</h2><table><thead><tr><th>Name</th><th>Dosage</th><th>Frequency</th><th>Status</th></tr></thead><tbody>${rows(patient.medications.map((m) => [m.name, `${m.dosage}${m.unit}`, m.frequency, m.active ? "Active" : "Paused"]))}</tbody></table>`;
  }
  if (sections.has("Adherence")) {
    body += `<h2>Adherence — last ${range} days</h2><table><tbody>${rows([
      ["Scheduled doses", stats.total], ["Taken", stats.taken], ["Late", stats.late], ["Missed", stats.missed], ["Adherence rate", `${stats.adherencePct}%`],
    ])}</tbody></table>`;
  }
  const trendRows = ["Heart Rate", "Blood Pressure", "Glucose", "Weight"].filter((l) => sections.has(l)).map((label) => {
    const t = trends.find((tr) => tr.label === label);
    return [label, t ? `${t.direction}${t.changePct ? ` (${t.changePct > 0 ? "+" : ""}${t.changePct}%)` : ""}` : "Not enough data"];
  });
  if (trendRows.length) body += `<h2>Health Trends</h2><table><tbody>${rows(trendRows)}</tbody></table>`;

  if (sections.has("Activity") && patient.activity?.length) {
    const totalSteps = patient.activity.slice(-range).reduce((a, d) => a + d.steps, 0);
    body += `<h2>Activity</h2><p>${totalSteps.toLocaleString()} total steps over the period.</p>`;
  }
  if (sections.has("Sleep") && patient.sleep?.length) {
    const recentSleep = patient.sleep.slice(-range);
    const avgH = (recentSleep.reduce((a, s) => a + s.durationMin, 0) / recentSleep.length / 60).toFixed(1);
    body += `<h2>Sleep</h2><p>Average ${avgH}h per night over the period.</p>`;
  }
  if (sections.has("Lab Results") && patient.records?.labResults?.length) {
    body += `<h2>Lab Results</h2><table><thead><tr><th>Test</th><th>Result</th><th>Reference Range</th><th>Date</th></tr></thead><tbody>${rows(patient.records.labResults.map((l) => [l.test, `${l.result} ${l.unit}`, l.referenceRange, l.date]))}</tbody></table>`;
  }
  if (sections.has("Medical Records") && (patient.records?.conditions?.length || patient.records?.allergies?.length)) {
    body += `<h2>Medical Records</h2>`;
    if (patient.records.conditions?.length) body += `<p><strong>Conditions:</strong> ${esc(patient.records.conditions.map((c) => `${c.name} (${c.status})`).join(", "))}</p>`;
    if (patient.records.allergies?.length) body += `<p><strong>Allergies:</strong> ${esc(patient.records.allergies.map((a) => `${a.allergen} (${a.severity})`).join(", "))}</p>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MediSense Health Summary — ${esc(patient.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1C1C1E; margin: 0; padding: 40px 48px; }
  .brand { font-size: 13px; font-weight: 700; color: #0A84FF; letter-spacing: 0.02em; text-transform: uppercase; }
  h1 { font-size: 22px; margin: 4px 0 2px; }
  .meta { color: #6E6E73; font-size: 13px; margin-bottom: 24px; }
  h2 { font-size: 15px; margin: 22px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #E5E5EA; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #F0F0F2; }
  th { color: #6E6E73; font-weight: 600; }
  p { font-size: 13.5px; line-height: 1.5; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E5EA; font-size: 11px; color: #9A9AA0; }
  @media print { body { padding: 24px; } }
</style></head><body>
  <div class="brand">MediSense</div>
  <h1>Health Summary — ${esc(patient.name)}</h1>
  <div class="meta">Reporting period: last ${range} days · Generated ${todayISO()}${doctor ? ` · Care team: ${esc(doctor.name)}, ${esc(doctor.specialty)}` : ""}</div>
  ${body || "<p>No sections selected.</p>"}
  <div class="footer">This report is generated by a software prototype and does not constitute medical advice. Review with a qualified healthcare professional.</div>
</body></html>`;
}

const REPORT_SECTIONS = ["Medications", "Adherence", "Heart Rate", "Blood Pressure", "Glucose", "Weight", "Activity", "Sleep", "Lab Results", "Medical Records"];
const RANGE_OPTIONS = [{ value: 7, label: "7D" }, { value: 30, label: "30D" }, { value: 90, label: "3M" }];

export function Reports({ patient, doctor }) {
  const [range, setRange] = useState(30);
  const [sections, setSections] = useState(new Set(["Medications", "Adherence"]));
  const toggle = (s) => setSections((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const relevant = patient.logs.filter((l) => l.date >= addDays(todayISO(), -range) && l.status !== "Upcoming");
  const taken = relevant.filter((l) => l.status === "Taken").length;
  const late = relevant.filter((l) => l.status === "Late").length;
  const missed = relevant.filter((l) => l.status === "Missed").length;
  const total = relevant.length;
  const adherencePct = total ? Math.round(((taken + late) / total) * 100) : 0;
  const trends = healthTrendSummaries(patient);
  const stats = { total, taken, late, missed, adherencePct };

  const printReport = () => {
    const html = buildReportHtml({ patient, doctor, range, sections, stats, trends });
    const win = window.open("", "_blank");
    if (!win) { toast("Allow pop-ups to print or save this report as a PDF", "warning"); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => win.print();
    toast("Opening printable report — choose \"Save as PDF\" in the print dialog");
  };

  const download = () => {
    const lines = [`MediSense Health Summary`, `Patient: ${patient.name}`, `Reporting period: last ${range} days`, ``];
    if (sections.has("Medications")) lines.push(`Medications:`, ...patient.medications.map((m) => `- ${m.name} ${m.dosage}${m.unit}, ${m.frequency}`), ``);
    if (sections.has("Adherence")) lines.push(`Adherence:`, `Total scheduled doses: ${total}`, `Taken: ${taken}`, `Late: ${late}`, `Missed: ${missed}`, `Adherence: ${adherencePct}%`, ``);
    ["Heart Rate", "Blood Pressure", "Glucose", "Weight"].forEach((label) => {
      if (!sections.has(label)) return;
      const t = trends.find((tr) => tr.label === label);
      lines.push(`${label}: ${t ? `${t.direction} (${t.changePct > 0 ? "+" : ""}${t.changePct}%)` : "not enough data"}`);
    });
    if (sections.has("Activity") && patient.activity?.length) {
      const totalSteps = patient.activity.slice(-range).reduce((a, d) => a + d.steps, 0);
      lines.push(``, `Activity: ${totalSteps.toLocaleString()} total steps over the period.`);
    }
    if (sections.has("Sleep") && patient.sleep?.length) {
      const avgH = (patient.sleep.slice(-range).reduce((a, s) => a + s.durationMin, 0) / patient.sleep.slice(-range).length / 60).toFixed(1);
      lines.push(`Sleep: average ${avgH}h per night over the period.`);
    }
    if (sections.has("Lab Results") && patient.records?.labResults?.length) {
      lines.push(``, `Lab Results:`, ...patient.records.labResults.map((l) => `- ${l.test}: ${l.result} ${l.unit} (ref ${l.referenceRange}), ${l.date}`));
    }
    if (sections.has("Medical Records") && patient.records?.conditions?.length) {
      lines.push(``, `Conditions:`, ...patient.records.conditions.map((c) => `- ${c.name} (${c.status})`));
    }
    lines.push(``, `This report is generated by a software prototype and does not constitute medical advice.`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `MediSense_Report_${todayISO()}.txt`; a.click();
    URL.revokeObjectURL(url);
    toast("Report downloaded");
  };

  return (
    <div>
      <p className="text-[13px] mb-4" style={{ color: COLORS.inkSoft }}>Select what to include, then generate a summary suitable for reviewing with a healthcare professional.</p>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
      </div>
      <Card className="p-5 mb-4">
        <div className="text-[13px] font-semibold mb-3" style={{ color: COLORS.inkSoft }}>Include</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REPORT_SECTIONS.map((s) => (
            <label key={s} className="flex items-center gap-2 px-3 py-2 rounded-[12px]" style={{ background: COLORS.surface2 }}>
              <input type="checkbox" checked={sections.has(s)} onChange={() => toggle(s)} className="w-4 h-4" style={{ accentColor: COLORS.primary }} />
              <span className="text-[13px]">{s}</span>
            </label>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-[17px]">{patient.name}</div>
            <div className="text-[13px]" style={{ color: COLORS.inkSoft }}>Reporting period: last {range} days</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={printReport} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium px-4 py-2.5 rounded-full text-white" style={{ background: COLORS.primary }}><Printer size={15} /> Print / Save as PDF</button>
            <button onClick={download} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium px-4 py-2.5 rounded-full border" style={{ borderColor: COLORS.hair, color: COLORS.primaryDark }}><Download size={15} /> Download as text</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <StatTile label="Scheduled doses" value={total} />
          <StatTile label="Taken" value={taken} />
          <StatTile label="Late" value={late} />
          <StatTile label="Missed" value={missed} />
          <StatTile label="Adherence" value={`${adherencePct}%`} />
        </div>
        <div className="text-[12px] mt-5" style={{ color: COLORS.inkSoft }}>This report is generated by a software prototype and does not constitute medical advice.</div>
      </Card>
    </div>
  );
}

export default function InsightsHub({ data, patient, updatePatient, initialSection, onConsumeParams }) {
  const [tab, setTab] = useState(initialSection === "reports" ? "reports" : "insights");
  React.useEffect(() => {
    if (initialSection) { setTab(initialSection); onConsumeParams?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);

  return (
    <div>
      <Heading size={26} className="mb-1">Insights</Heading>
      <p className="text-[13px] mb-5" style={{ color: COLORS.inkSoft }}>Data observations, not medical diagnoses. Always consult your doctor for medical decisions.</p>
      <div className="flex gap-2 mb-5 flex-wrap">
        {[{ id: "insights", label: "Insights" }, { id: "chat", label: "Ask AI" }, { id: "notifications", label: "Notifications" }, { id: "reports", label: "Reports" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-3.5 py-2 rounded-full text-[13px] font-medium flex-shrink-0 focus:outline-none"
            style={{ background: tab === t.id ? COLORS.primary : COLORS.surface2, color: tab === t.id ? "white" : COLORS.inkSoft }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "insights" && <InsightCards patient={patient} />}
      {tab === "chat" && <AIChat data={data} patient={patient} updatePatient={updatePatient} />}
      {tab === "notifications" && <Notifications patient={patient} updatePatient={updatePatient} />}
      {tab === "reports" && <Reports patient={patient} doctor={data.doctor} />}
    </div>
  );
}
