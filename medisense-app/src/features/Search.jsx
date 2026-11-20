import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import { COLORS, SPRING_UI, FADE } from "../shared.jsx";
import { searchAll, searchDoctorPatients } from "../data/search.js";

/* =========================================================================
   Global search — finds medications, health metrics, records, doctors,
   appointments, insights, and reports (patient role), or patients and open
   slots (doctor role), from the same data every other screen reads, then
   routes to that screen via goTo().
   ========================================================================= */

export default function SearchOverlay({ open, onClose, data, patient, role = "patient", goTo }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const results = role === "doctor" ? searchDoctorPatients(data, query) : searchAll(data, patient, query);
  const grouped = results.reduce((acc, r) => { (acc[r.group] = acc[r.group] || []).push(r); return acc; }, {});

  useEffect(() => {
    if (open) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 60); }
  }, [open]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const select = (r) => { goTo(r.nav.tab, r.nav.params); onClose(); };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 bg-black/40 z-[60]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label="Search MediSense"
            initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.98 }} transition={SPRING_UI}
            className="fixed z-[61] left-1/2 top-[8vh] -translate-x-1/2 w-[92vw] max-w-lg rounded-[20px] overflow-hidden border"
            style={{ background: COLORS.card, borderColor: COLORS.hair, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: COLORS.hair }}>
              <Search size={18} color={COLORS.inkSoft} />
              <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={role === "doctor" ? "Search patients by name or condition…" : "Search medications, health metrics, records, doctors…"}
                className="flex-1 text-[15px] outline-none bg-transparent" style={{ color: COLORS.ink }} />
              <button onClick={onClose} aria-label="Close search" className="p-1 rounded-full hover:bg-black/5"><X size={16} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {query.trim() === "" ? (
                <div className="px-5 py-8 text-center text-[13.5px]" style={{ color: COLORS.inkSoft }}>{role === "doctor" ? "Start typing to find a patient." : "Start typing to search across MediSense."}</div>
              ) : results.length === 0 ? (
                <div className="px-5 py-8 text-center text-[13.5px]" style={{ color: COLORS.inkSoft }}>No results for "{query}"</div>
              ) : (
                Object.entries(grouped).map(([group, items]) => (
                  <div key={group} className="mb-1">
                    <div className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: COLORS.inkFaint }}>{group}</div>
                    {items.map((r) => (
                      <button key={r.id} onClick={() => select(r)}
                        className="w-full text-left px-5 py-2.5 hover:bg-black/5 focus:outline-none focus:bg-black/5">
                        <div className="text-[14px] font-medium truncate">{r.title}</div>
                        <div className="text-[12px] truncate" style={{ color: COLORS.inkSoft }}>{r.subtitle}</div>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
