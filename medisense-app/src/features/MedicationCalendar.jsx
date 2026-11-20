import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { COLORS, Card, StatusPill, to12h, todayISO } from "../shared.jsx";

function monthMatrix(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, iso });
  }
  return cells;
}

export default function MedicationCalendar({ patient }) {
  const today = todayISO();
  const initDate = new Date(today + "T00:00:00");
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);

  const cells = useMemo(() => monthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const logsByDate = useMemo(() => {
    const map = {};
    for (const l of patient.logs || []) {
      (map[l.date] = map[l.date] || []).push(l);
    }
    return map;
  }, [patient.logs]);

  const activeMeds = useMemo(() => (patient.medications || []).filter((m) => m.active !== false), [patient.medications]);

  const selectedEntries = useMemo(() => {
    const existing = logsByDate[selectedDate] || [];
    if (existing.length > 0 && selectedDate !== today) {
      return [...existing].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
    }
    if (selectedDate >= today) {
      const rows = [];
      for (const m of activeMeds) {
        if (m.startDate && selectedDate < m.startDate) continue;
        if (m.endDate && selectedDate > m.endDate) continue;
        for (const t of m.times || []) {
          const match = existing.find((l) => l.medId === m.id && l.scheduledTime === t);
          rows.push({
            id: match?.id || `${m.id}-${selectedDate}-${t}`,
            medName: m.name,
            dosage: `${m.dosage}${m.unit}`,
            scheduledTime: t,
            status: match?.status || "Upcoming",
          });
        }
      }
      return rows.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
    }
    return [];
  }, [selectedDate, logsByDate, activeMeds, today]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <Card className="p-5 lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-[16px] flex items-center gap-2">
            <CalendarDays size={17} color={COLORS.primary} /> {monthLabel}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} aria-label="Previous month" className="p-2 rounded-full hover:bg-black/5">
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                setViewYear(initDate.getFullYear());
                setViewMonth(initDate.getMonth());
                setSelectedDate(today);
              }}
              className="text-[12px] font-medium px-2.5 py-1 rounded-full"
              style={{ background: COLORS.surface2, color: COLORS.inkSoft }}
            >
              Today
            </button>
            <button onClick={nextMonth} aria-label="Next month" className="p-2 rounded-full hover:bg-black/5">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] font-semibold mb-2" style={{ color: COLORS.inkFaint }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((cell, idx) => {
            if (!cell) return <div key={`empty-${idx}`} />;
            const dayLogs = (logsByDate[cell.iso] || []).filter((l) => l.status !== "Upcoming");
            const missed = dayLogs.filter((l) => l.status === "Missed" || l.status === "Skipped").length;
            const taken = dayLogs.filter((l) => l.status === "Taken" || l.status === "Late").length;
            const hasActivePlan = cell.iso >= today && activeMeds.some((m) => (!m.startDate || cell.iso >= m.startDate) && (!m.endDate || cell.iso <= m.endDate));
            const isSelected = cell.iso === selectedDate;
            const isToday = cell.iso === today;

            let dotColor = null;
            if (dayLogs.length > 0) {
              dotColor = missed > 0 && taken === 0 ? COLORS.coral : missed > 0 ? COLORS.amber : COLORS.success;
            } else if (hasActivePlan) {
              dotColor = COLORS.primary;
            }

            return (
              <button
                key={cell.iso}
                onClick={() => setSelectedDate(cell.iso)}
                className="flex flex-col items-center justify-center py-2 rounded-[14px] text-[13px] transition-colors focus:outline-none focus:ring-2"
                style={{
                  background: isSelected ? COLORS.primary : isToday ? COLORS.mint : "transparent",
                  color: isSelected ? "white" : COLORS.ink,
                  fontWeight: isToday || isSelected ? 600 : 400,
                  "--tw-ring-color": COLORS.primary,
                }}
              >
                <span>{cell.day}</span>
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1"
                  style={{ background: dotColor ? (isSelected ? "white" : dotColor) : "transparent" }}
                />
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t text-[11.5px]" style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: COLORS.success }} /> All taken</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: COLORS.amber }} /> Partial</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: COLORS.coral }} /> Missed / Skipped</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: COLORS.primary }} /> Upcoming scheduled</span>
        </div>
      </Card>

      <Card className="p-5 lg:col-span-2">
        <div className="text-[13px] font-semibold mb-1" style={{ color: COLORS.inkSoft }}>
          {selectedDate === today ? "Today" : selectedDate}
        </div>
        <div className="font-semibold text-[16px] mb-4">Scheduled & logged doses</div>
        {selectedEntries.length === 0 ? (
          <div className="text-[13.5px] py-8 text-center" style={{ color: COLORS.inkSoft }}>
            No doses recorded or scheduled for this date.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 pb-2.5 border-b last:border-0"
                style={{ borderColor: COLORS.hair }}
              >
                <div>
                  <div className="text-[14px] font-medium">{entry.medName} · {entry.dosage}</div>
                  <div className="text-[12px]" style={{ color: COLORS.inkSoft }}>{to12h(entry.scheduledTime)}</div>
                </div>
                <StatusPill status={entry.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
