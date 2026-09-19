import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, HeartPulse, Pill, FileText, Users, Sparkles, Settings, User,
  ShieldCheck, X, LogOut, Search, Menu,
} from "lucide-react";
import { COLORS, SPRING_UI, SPRING_MOMENTUM, FADE, IconThemeToggle } from "../shared.jsx";

/* =========================================================================
   Navigation — new information architecture
   Patient primary: Today · Health · Medications · Records · Care · Insights
   Patient secondary: Profile · Settings · Privacy
   Mobile bottom bar: Today · Health · Meds · Care · More
   More sheet: Records · Insights · Reports · Profile · Settings · Privacy
   ========================================================================= */

export const NAV_PATIENT_PRIMARY = [
  { id: "today", label: "Today", icon: Home },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "medications", label: "Medications", icon: Pill },
  { id: "records", label: "Records", icon: FileText },
  { id: "care", label: "Care", icon: Users },
  { id: "insights", label: "Insights", icon: Sparkles },
];
export const NAV_PATIENT_SECONDARY = [
  { id: "profile", label: "Profile", icon: User },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "privacy", label: "Privacy", icon: ShieldCheck },
];

export const NAV_DOCTOR_PRIMARY = [
  { id: "patients", label: "Patients", icon: Users },
  { id: "availability", label: "Availability", icon: FileText },
];
export const NAV_DOCTOR_SECONDARY = [
  { id: "profile", label: "Profile", icon: User },
  { id: "settings", label: "Settings", icon: Settings },
];

export const MOBILE_PRIMARY_PATIENT = [
  { id: "today", label: "Today", icon: Home },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "medications", label: "Meds", icon: Pill },
  { id: "care", label: "Care", icon: Users },
];
export const MOBILE_PRIMARY_DOCTOR = [
  { id: "patients", label: "Patients", icon: Users },
  { id: "availability", label: "Slots", icon: FileText },
];
export const MORE_ITEMS_PATIENT = [
  { id: "records", label: "Records", icon: FileText },
  { id: "insights", label: "Insights", icon: Sparkles },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "profile", label: "Profile", icon: User },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "privacy", label: "Privacy", icon: ShieldCheck },
];
export const MORE_ITEMS_DOCTOR = [
  { id: "profile", label: "Profile", icon: User },
  { id: "settings", label: "Settings", icon: Settings },
];

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined}
      className="relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-[14px] text-[13.5px] font-medium text-left transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1"
      style={{ color: active ? COLORS.primaryDark : COLORS.inkSoft, "--tw-ring-color": COLORS.primary }}>
      {active && (
        <motion.span layoutId="sidebar-active-pill" transition={SPRING_UI}
          className="absolute inset-0 rounded-[14px] -z-10" style={{ background: COLORS.mint }} />
      )}
      <Icon size={17} strokeWidth={2.2} />
      {item.label}
    </button>
  );
}

export function Sidebar({ role, activeId, onSelect, onLogout, onSearch }) {
  const primary = role === "doctor" ? NAV_DOCTOR_PRIMARY : NAV_PATIENT_PRIMARY;
  const secondary = role === "doctor" ? NAV_DOCTOR_SECONDARY : NAV_PATIENT_SECONDARY;
  return (
    <aside className="hidden md:flex flex-col w-[248px] flex-shrink-0 h-screen sticky top-0 px-4 py-5 border-r"
      style={{ borderColor: COLORS.hair, background: COLORS.card }}>
      <div className="flex items-center gap-2.5 px-2 mb-1">
        <div className="w-8 h-8 rounded-[12px] flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.lavender})` }}>
          <Pill size={15} color="white" />
        </div>
        <span className="font-semibold text-[16px] tracking-tight">MediSense</span>
      </div>
      {onSearch && (
        <button onClick={onSearch}
          className="flex items-center gap-2 mx-2 mt-3 mb-2 px-3 py-2 rounded-[12px] text-[12.5px] text-left focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ background: COLORS.surface2, color: COLORS.inkFaint, "--tw-ring-color": COLORS.primary }}>
          <Search size={14} /> Search MediSense…
        </button>
      )}
      <nav className="flex-1 flex flex-col gap-0.5 mt-3 overflow-y-auto">
        {primary.map((item) => (
          <NavItem key={item.id} item={item} active={activeId === item.id} onClick={() => onSelect(item.id)} />
        ))}
      </nav>
      <div className="flex flex-col gap-0.5 pt-3 mt-3 border-t" style={{ borderColor: COLORS.hair }}>
        {secondary.map((item) => (
          <NavItem key={item.id} item={item} active={activeId === item.id} onClick={() => onSelect(item.id)} />
        ))}
        <div className="flex items-center justify-between px-3.5 pt-2">
          <button onClick={onLogout} className="flex items-center gap-2 text-[13px] font-medium py-2 focus:outline-none" style={{ color: COLORS.coral }}>
            <LogOut size={15} /> Log out
          </button>
          <IconThemeToggle />
        </div>
      </div>
    </aside>
  );
}

export function MobileTabBar({ role, activeId, onSelect, moreActive, onMoreClick, unread }) {
  const items = role === "doctor" ? MOBILE_PRIMARY_DOCTOR : MOBILE_PRIMARY_PATIENT;
  return (
    <nav aria-label="Primary" className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t"
      style={{ background: COLORS.glass, backdropFilter: "blur(20px) saturate(180%)", borderColor: COLORS.hair, paddingBottom: "env(safe-area-inset-bottom)" }}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeId === item.id && !moreActive;
        return (
          <button key={item.id} onClick={() => onSelect(item.id)} aria-current={active ? "page" : undefined}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 focus:outline-none">
            <Icon size={20} strokeWidth={active ? 2.4 : 2} color={active ? COLORS.primary : COLORS.inkFaint} />
            <span className="text-[10.5px] font-medium" style={{ color: active ? COLORS.primary : COLORS.inkFaint }}>{item.label}</span>
          </button>
        );
      })}
      <button onClick={onMoreClick} aria-current={moreActive ? "page" : undefined} className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 focus:outline-none">
        <Menu size={20} strokeWidth={moreActive ? 2.4 : 2} color={moreActive ? COLORS.primary : COLORS.inkFaint} />
        {unread > 0 && <span className="absolute top-1.5 right-[28%] w-2 h-2 rounded-full" style={{ background: COLORS.coral }} />}
        <span className="text-[10.5px] font-medium" style={{ color: moreActive ? COLORS.primary : COLORS.inkFaint }}>More</span>
      </button>
    </nav>
  );
}

export function MoreSheet({ open, onClose, role, activeId, onSelect, onLogout }) {
  const items = role === "doctor" ? MORE_ITEMS_DOCTOR : MORE_ITEMS_PATIENT;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="md:hidden fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} onClick={onClose} />
          <motion.div role="dialog" aria-label="More" className="md:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] p-5 pb-8"
            style={{ background: COLORS.card }}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={SPRING_MOMENTUM}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-[16px]">More</span>
              <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-black/5"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {items.map((item) => {
                const Icon = item.icon;
                const active = activeId === item.id;
                return (
                  <button key={item.id} onClick={() => onSelect(item.id)}
                    className="flex flex-col items-center gap-2 py-4 rounded-[18px] focus:outline-none"
                    style={{ background: active ? COLORS.mint : COLORS.surface2 }}>
                    <Icon size={20} color={active ? COLORS.primary : COLORS.inkSoft} />
                    <span className="text-[12px] font-medium" style={{ color: active ? COLORS.primaryDark : COLORS.inkSoft }}>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-[14px] font-medium mt-5 py-3 rounded-full border" style={{ borderColor: COLORS.hair, color: COLORS.coral }}>
              <LogOut size={16} /> Log out
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
