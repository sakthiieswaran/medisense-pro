import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, HeartPulse, Pill, FileText, Users, Sparkles, Settings, User,
  ShieldCheck, X, LogOut, Search, Menu, HeartHandshake, ChevronRight, Activity,
} from "lucide-react";
import { COLORS, SPRING_UI, SPRING_MOMENTUM, FADE, IconThemeToggle } from "../shared.jsx";

/* =========================================================================
   Navigation — unified information architecture
   Patient primary: Today · Health · Medications · Records · Care · Insights
   Patient secondary: Profile · Settings · Privacy
   Mobile bottom bar (5 items): Today · Health · Meds · Records · More
   More sheet: Care · Insights · Profile · Settings · Privacy
   Doctor primary: Patients · Availability
   Caregiver primary: Care Dashboard · Settings
   ========================================================================= */

export const NAV_PATIENT_PRIMARY = [
  { id: "today", label: "Today", icon: Home },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "medications", label: "Medications", icon: Pill },
  { id: "records", label: "Records", icon: FileText },
  { id: "care", label: "Care Team", icon: Users },
  { id: "insights", label: "AI Insights", icon: Sparkles },
];
export const NAV_PATIENT_SECONDARY = [
  { id: "profile", label: "Profile", icon: User },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "privacy", label: "Privacy & Data", icon: ShieldCheck },
];

export const NAV_DOCTOR_PRIMARY = [
  { id: "patients", label: "Patients", icon: Users },
  { id: "availability", label: "Availability", icon: FileText },
];
export const NAV_DOCTOR_SECONDARY = [
  { id: "profile", label: "Doctor Profile", icon: User },
  { id: "settings", label: "Settings", icon: Settings },
];

export const NAV_CAREGIVER_PRIMARY = [
  { id: "caregiver", label: "Caregiving Hub", icon: HeartHandshake },
];
export const NAV_CAREGIVER_SECONDARY = [
  { id: "settings", label: "Settings", icon: Settings },
];

export const MOBILE_PRIMARY_PATIENT = [
  { id: "today", label: "Today", icon: Home },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "medications", label: "Meds", icon: Pill },
  { id: "records", label: "Records", icon: FileText },
];
export const MOBILE_PRIMARY_DOCTOR = [
  { id: "patients", label: "Patients", icon: Users },
  { id: "availability", label: "Slots", icon: FileText },
];
export const MOBILE_PRIMARY_CAREGIVER = [
  { id: "caregiver", label: "Caregiving", icon: HeartHandshake },
  { id: "settings", label: "Settings", icon: Settings },
];

export const MORE_ITEMS_PATIENT = [
  { id: "care", label: "Care Team", icon: Users, desc: "Doctors, appointments & messages" },
  { id: "insights", label: "AI Insights", icon: Sparkles, desc: "Health trends & AI assistant" },
  { id: "profile", label: "Profile", icon: User, desc: "Personal info & emergency contacts" },
  { id: "settings", label: "Settings", icon: Settings, desc: "Theme, accessibility & alerts" },
  { id: "privacy", label: "Privacy Center", icon: ShieldCheck, desc: "DPDP compliance & data control" },
];
export const MORE_ITEMS_DOCTOR = [
  { id: "profile", label: "Doctor Profile", icon: User, desc: "Credentials & specialty info" },
  { id: "settings", label: "Settings", icon: Settings, desc: "Preferences & security" },
];
export const MORE_ITEMS_CAREGIVER = [
  { id: "settings", label: "Settings", icon: Settings, desc: "Preferences & security" },
];

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-[13.5px] font-medium text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1"
      style={{
        color: active ? COLORS.primary : COLORS.inkSoft,
        background: active ? "var(--color-accent-soft)" : "transparent",
        borderLeft: active ? `3px solid ${COLORS.primary}` : "3px solid transparent",
        fontWeight: active ? 600 : 500,
        "--tw-ring-color": COLORS.primary,
      }}
    >
      <Icon
        size={17}
        strokeWidth={active ? 2.4 : 2}
        style={{ color: active ? COLORS.primary : COLORS.inkFaint }}
      />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

export function Sidebar({ role, user, activeId, onSelect, onLogout, onSearch }) {
  const primary = role === "doctor" ? NAV_DOCTOR_PRIMARY : role === "caregiver" ? NAV_CAREGIVER_PRIMARY : NAV_PATIENT_PRIMARY;
  const secondary = role === "doctor" ? NAV_DOCTOR_SECONDARY : role === "caregiver" ? NAV_CAREGIVER_SECONDARY : NAV_PATIENT_SECONDARY;

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : role === "doctor" ? "DR" : "PT";

  return (
    <aside
      className="hidden md:flex flex-col w-[252px] flex-shrink-0 h-screen sticky top-0 px-4 py-5 border-r select-none"
      style={{ borderColor: COLORS.hair, background: COLORS.card }}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 px-2 mb-2">
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white flex-shrink-0 shadow-sm"
          style={{ background: COLORS.primary }}
        >
          <Activity size={17} strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <span className="font-bold text-[16px] tracking-tight block leading-none" style={{ color: COLORS.ink }}>
            MediSense
          </span>
          <span
            className="text-[10px] uppercase font-bold tracking-wider mt-0.5 block leading-none"
            style={{ color: COLORS.primary }}
          >
            {role === "doctor" ? "Clinical Portal" : role === "caregiver" ? "Caregiver Portal" : "Health Platform"}
          </span>
        </div>
      </div>

      {/* Global Search Button */}
      {onSearch && role !== "caregiver" && (
        <button
          onClick={onSearch}
          className="flex items-center justify-between mx-1 mt-3 mb-2 px-3 py-2 rounded-[10px] text-[12.5px] text-left transition-colors border focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.hair,
            color: COLORS.inkSoft,
            "--tw-ring-color": COLORS.primary,
          }}
        >
          <span className="flex items-center gap-2">
            <Search size={14} style={{ color: COLORS.inkFaint }} />
            Search records, meds…
          </span>
          <kbd
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded border"
            style={{ background: COLORS.card, borderColor: COLORS.hair, color: COLORS.inkFaint }}
          >
            ⌘K
          </kbd>
        </button>
      )}

      {/* Primary Navigation */}
      <div className="px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: COLORS.inkFaint }}>
        Menu
      </div>
      <nav aria-label="Main navigation" className="flex-1 flex flex-col gap-0.5 overflow-y-auto pr-1">
        {primary.map((item) => (
          <NavItem key={item.id} item={item} active={activeId === item.id} onClick={() => onSelect(item.id)} />
        ))}
      </nav>

      {/* Secondary & User Profile Section */}
      <div className="flex flex-col gap-0.5 pt-3 mt-2 border-t" style={{ borderColor: COLORS.hair }}>
        <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: COLORS.inkFaint }}>
          Account
        </div>
        {secondary.map((item) => (
          <NavItem key={item.id} item={item} active={activeId === item.id} onClick={() => onSelect(item.id)} />
        ))}

        {/* User Badge */}
        {user && (
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 mt-2 rounded-[12px] border"
            style={{ background: COLORS.surface2, borderColor: COLORS.hair }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[12px] text-white flex-shrink-0"
              style={{ background: COLORS.primary }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold truncate leading-tight" style={{ color: COLORS.ink }}>
                {user.name || "MediSense User"}
              </div>
              <div className="text-[11px] capitalize truncate leading-tight" style={{ color: COLORS.inkSoft }}>
                {user.role || role}
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions: Logout & Theme */}
        <div className="flex items-center justify-between px-2 pt-2">
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold py-1.5 px-2 rounded-[8px] hover:bg-red-500/10 transition-colors focus:outline-none"
            style={{ color: COLORS.coral }}
          >
            <LogOut size={14} /> Log out
          </button>
          <IconThemeToggle />
        </div>
      </div>
    </aside>
  );
}

export function MobileTabBar({ role, activeId, onSelect, moreActive, onMoreClick, unread }) {
  const items = role === "doctor" ? MOBILE_PRIMARY_DOCTOR : role === "caregiver" ? MOBILE_PRIMARY_CAREGIVER : MOBILE_PRIMARY_PATIENT;
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t"
      style={{
        background: "var(--color-glass)",
        backdropFilter: "blur(20px) saturate(180%)",
        borderColor: COLORS.hair,
        paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeId === item.id && !moreActive;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            aria-current={active ? "page" : undefined}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[52px] focus:outline-none transition-colors"
          >
            <div className="relative">
              <Icon size={20} strokeWidth={active ? 2.5 : 2} color={active ? COLORS.primary : COLORS.inkFaint} />
              {active && (
                <span
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: COLORS.primary }}
                />
              )}
            </div>
            <span
              className="text-[10.5px] font-semibold tracking-tight leading-tight"
              style={{ color: active ? COLORS.primary : COLORS.inkFaint }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
      <button
        onClick={onMoreClick}
        aria-current={moreActive ? "page" : undefined}
        className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[52px] focus:outline-none transition-colors"
      >
        <div className="relative">
          <Menu size={20} strokeWidth={moreActive ? 2.5 : 2} color={moreActive ? COLORS.primary : COLORS.inkFaint} />
          {unread > 0 && (
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white"
              style={{ background: COLORS.coral }}
            />
          )}
          {moreActive && (
            <span
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
              style={{ background: COLORS.primary }}
            />
          )}
        </div>
        <span
          className="text-[10.5px] font-semibold tracking-tight leading-tight"
          style={{ color: moreActive ? COLORS.primary : COLORS.inkFaint }}
        >
          More
        </span>
      </button>
    </nav>
  );
}

export function MoreSheet({ open, onClose, role, activeId, onSelect, onLogout }) {
  const items = role === "doctor" ? MORE_ITEMS_DOCTOR : role === "caregiver" ? MORE_ITEMS_CAREGIVER : MORE_ITEMS_PATIENT;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label="More options"
            className="md:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-[24px] p-5 pb-8 border-t"
            style={{
              background: COLORS.card,
              borderColor: COLORS.hair,
              boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
              paddingBottom: "max(env(safe-area-inset-bottom), 24px)",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING_MOMENTUM}
          >
            {/* Sheet Handle */}
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-4" />

            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-bold text-[17px] tracking-tight" style={{ color: COLORS.ink }}>
                All Sections
              </span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 rounded-full hover:bg-black/5 transition-colors"
                style={{ color: COLORS.inkSoft }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
              {items.map((item) => {
                const Icon = item.icon;
                const active = activeId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelect(item.id);
                      onClose();
                    }}
                    className="flex items-center justify-between p-3 rounded-[14px] text-left transition-colors border"
                    style={{
                      background: active ? "var(--color-accent-soft)" : COLORS.surface2,
                      borderColor: active ? "var(--color-accent-border)" : "transparent",
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                        style={{
                          background: active ? COLORS.primary : COLORS.card,
                          color: active ? "white" : COLORS.primary,
                        }}
                      >
                        <Icon size={18} strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0">
                        <div
                          className="text-[13.5px] font-semibold truncate leading-tight"
                          style={{ color: active ? COLORS.primaryDark : COLORS.ink }}
                        >
                          {item.label}
                        </div>
                        {item.desc && (
                          <div className="text-[11.5px] truncate mt-0.5" style={{ color: COLORS.inkSoft }}>
                            {item.desc}
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: COLORS.inkFaint }} />
                  </button>
                );
              })}
            </div>

            <div className="pt-4 mt-3 border-t flex items-center justify-between" style={{ borderColor: COLORS.hair }}>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 text-[13.5px] font-semibold px-4 py-2.5 rounded-[10px] border transition-colors"
                style={{ borderColor: "rgba(220, 38, 38, 0.2)", color: COLORS.coral, background: COLORS.dangerSoft }}
              >
                <LogOut size={15} /> Log out
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium" style={{ color: COLORS.inkSoft }}>Theme</span>
                <IconThemeToggle />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
