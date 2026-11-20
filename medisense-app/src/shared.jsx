import React, { useState, useEffect, useCallback, useRef, useContext, createContext } from "react";
import { motion, AnimatePresence, useReducedMotion, animate as fmAnimate } from "framer-motion";
import { Check, X, AlertTriangle, Clock, CalendarClock, Sun, Moon } from "lucide-react";

/* =========================================================================
   MediSense shared layer
   Design tokens, small utilities, the theme system, toast host, and the
   reusable UI primitives every feature module is built from. Nothing here
   depends on feature code, so it can be imported anywhere without creating
   circular imports.
   ========================================================================= */

export const FONT_STACK = `"Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;

export const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
* { -webkit-font-smoothing: antialiased; }
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}`;

export const COLORS = {
  primary: "var(--color-primary)",
  primaryDark: "var(--color-primary-dark)",
  mint: "var(--color-accent-soft)",
  ink: "var(--color-ink)",
  inkSoft: "var(--color-ink-soft)",
  inkFaint: "var(--color-ink-faint)",
  coral: "var(--color-coral)",
  danger: "var(--color-coral)",
  amber: "var(--color-amber)",
  success: "var(--color-success)",
  cyan: "var(--color-cyan)",
  cyanSoft: "var(--color-cyan-soft)",
  lavender: "var(--color-lavender)",
  lavenderSoft: "var(--color-lavender-soft)",
  successSoft: "var(--color-success-soft)",
  warningSoft: "var(--color-warning-soft)",
  dangerSoft: "var(--color-danger-soft)",
  info: "var(--color-info)",
  infoSoft: "var(--color-info-soft)",
  bg: "var(--color-bg)",
  card: "var(--color-card)",
  surface2: "var(--color-surface-2)",
  hair: "var(--color-hair)",
  cardShadow: "var(--color-card-shadow)",
  glass: "var(--color-glass)",
};

export const STORAGE_KEY = "medisense_state_v2";
export const SESSION_KEY = "medisense_session_v2";
export const THEME_KEY = "medisense_theme_v1";
export const PREFS_KEY = "medisense_dashboard_prefs_v1";
export const TEXTSIZE_KEY = "medisense_textsize_v1";
export const CONTRAST_KEY = "medisense_contrast_v1";

export const SPRING_UI = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 };
export const SPRING_MOMENTUM = { type: "spring", stiffness: 300, damping: 24, mass: 0.9 };
export const FADE = { duration: 0.15, ease: "easeOut" };

/* ---------------------------------- utils --------------------------------- */

export const uid = () =>
  typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtDateLong = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
export const to12h = (t) => {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
};
export const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayOfWeek = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const round1 = (n) => Math.round(n * 10) / 10;

export function computeBMI(weightKg, heightCm) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  if (!w || !h || w <= 0 || h <= 0) return null;
  return round1(w / Math.pow(h / 100, 2));
}

export function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { label: "Underweight", tone: "monitor" };
  if (bmi < 25) return { label: "Healthy weight", tone: "stable" };
  if (bmi < 30) return { label: "Overweight", tone: "monitor" };
  return { label: "Obesity range", tone: "attention" };
}

export function computeRefillInfo(med) {
  if (!med || med.currentStock == null || med.currentStock === "") return null;
  const stock = Number(med.currentStock);
  if (Number.isNaN(stock) || stock < 0) return null;
  const perDay = Math.max(1, Number(med.timesPerDay || med.times?.length || 1));
  const daysRemaining = Math.floor(stock / perDay);
  const threshold = Number(med.refillThreshold ?? 7);
  return {
    stock,
    daysRemaining,
    lowStock: daysRemaining <= threshold,
    criticalStock: daysRemaining <= 2,
  };
}

/* ------------------------------- theme (light / dark) ------------------------------- */

export const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");
  const [textSize, setTextSizeState] = useState("normal");
  const [contrast, setContrastState] = useState("normal");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      let initial = null;
      try {
        const res = await window.storage.get(THEME_KEY, false);
        const stored = JSON.parse(res.value);
        if (stored === "dark" || stored === "light") initial = stored;
      } catch {}
      if (!initial && typeof window !== "undefined" && window.matchMedia) {
        initial = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      setTheme(initial || "light");
      try {
        const t = await window.storage.get(TEXTSIZE_KEY, false);
        const v = JSON.parse(t.value);
        if (["normal", "large", "larger"].includes(v)) setTextSizeState(v);
      } catch {}
      try {
        const c = await window.storage.get(CONTRAST_KEY, false);
        const v = JSON.parse(c.value);
        if (["normal", "high"].includes(v)) setContrastState(v);
      } catch {}
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (textSize === "normal") document.documentElement.removeAttribute("data-textsize");
    else document.documentElement.setAttribute("data-textsize", textSize);
  }, [textSize]);
  useEffect(() => {
    if (contrast === "normal") document.documentElement.removeAttribute("data-contrast");
    else document.documentElement.setAttribute("data-contrast", contrast);
  }, [contrast]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.storage.set(THEME_KEY, JSON.stringify(next), false).catch(() => {});
      return next;
    });
  }, []);
  const setTextSize = useCallback((v) => {
    setTextSizeState(v);
    window.storage.set(TEXTSIZE_KEY, JSON.stringify(v), false).catch(() => {});
  }, []);
  const setContrast = useCallback((v) => {
    setContrastState(v);
    window.storage.set(CONTRAST_KEY, JSON.stringify(v), false).catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, textSize, setTextSize, contrast, setContrast, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button onClick={toggleTheme} role="switch" aria-checked={isDark} aria-label="Dark mode"
      className="relative inline-flex items-center w-[52px] h-[30px] rounded-full flex-shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1"
      style={{ background: isDark ? COLORS.primary : COLORS.hair, "--tw-ring-color": COLORS.primary }}>
      <motion.span animate={{ x: isDark ? 22 : 2 }} transition={SPRING_UI}
        className="absolute top-[2px] w-[26px] h-[26px] rounded-full flex items-center justify-center"
        style={{ background: COLORS.card, boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
        {isDark ? <Moon size={12} color={COLORS.primary} /> : <Sun size={12} color={COLORS.amber} />}
      </motion.span>
    </button>
  );
}

export function IconThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <motion.button whileTap={{ scale: 0.9 }} onClick={toggleTheme} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-1 ${className}`}
      style={{ background: COLORS.card, boxShadow: COLORS.cardShadow, "--tw-ring-color": COLORS.primary }}>
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span key="moon" initial={{ opacity: 0, rotate: -60 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 60 }} transition={FADE}>
            <Moon size={16} color={COLORS.primary} />
          </motion.span>
        ) : (
          <motion.span key="sun" initial={{ opacity: 0, rotate: 60 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -60 }} transition={FADE}>
            <Sun size={16} color={COLORS.amber} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ------------------------------ toast notifications ------------------------------ */

let toastListeners = [];
export function toast(message, type = "success") {
  const t = { id: uid(), message, type };
  toastListeners.forEach((fn) => fn(t));
}
function useToastFeed() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const listener = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4000);
    };
    toastListeners.push(listener);
    return () => { toastListeners = toastListeners.filter((l) => l !== listener); };
  }, []);
  return toasts;
}
export function ToastHost() {
  const toasts = useToastFeed();
  const shouldReduceMotion = useReducedMotion();
  return (
    <div aria-live="polite" className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-[90vw] w-[320px] pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} role="status"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, transition: FADE }}
            transition={SPRING_UI}
            className="px-4 py-3 rounded-[16px] text-[13.5px] font-medium flex items-center gap-2 pointer-events-auto"
            style={{ background: "rgba(15, 20, 25, 0.90)", backdropFilter: "blur(20px) saturate(180%)", color: "white", boxShadow: "0 2px 6px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.16)" }}>
            {t.type === "warning" ? <AlertTriangle size={15} className="flex-shrink-0" color={COLORS.amber} /> : t.type === "error" ? <X size={15} className="flex-shrink-0" color={COLORS.coral} /> : <Check size={15} className="flex-shrink-0" color={COLORS.success} />}
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ small ui bits ------------------------------ */

export function ConfirmButton({ onConfirm, icon: Icon, label, confirmLabel = "Confirm", variant = "icon", className = "" }) {
  const [confirming, setConfirming] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  if (confirming) {
    return (
      <motion.span initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, x: -6 }}
        animate={{ opacity: 1, scale: 1, x: 0 }} transition={SPRING_UI}
        className="inline-flex items-center gap-1.5">
        <motion.button whileTap={{ scale: 0.94 }} onClick={() => { onConfirm(); setConfirming(false); }}
          className="text-[12px] font-medium px-2.5 py-1.5 rounded-full text-white focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ background: COLORS.coral, "--tw-ring-color": COLORS.coral }}>{confirmLabel}</motion.button>
        <motion.button whileTap={{ scale: 0.94 }} onClick={() => setConfirming(false)}
          className="text-[12px] font-medium px-2.5 py-1.5 rounded-full border focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ borderColor: COLORS.hair, color: COLORS.inkSoft }}>Keep</motion.button>
      </motion.span>
    );
  }
  if (variant === "text") {
    return (
      <motion.button whileTap={{ scale: 0.96 }} onClick={() => setConfirming(true)} className={`text-[12.5px] font-medium px-3.5 py-2 rounded-full border focus:outline-none focus:ring-2 focus:ring-offset-1 ${className}`}
        style={{ borderColor: COLORS.hair, color: COLORS.coral }}>{label}</motion.button>
    );
  }
  return (
    <motion.button whileTap={{ scale: 0.9 }} onClick={() => setConfirming(true)} aria-label={label} title={label}
      className="p-2 rounded-[10px] hover:bg-black/5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1">
      <Icon size={14} color={COLORS.coral} />
    </motion.button>
  );
}

export function StatusPill({ status }) {
  const map = {
    Taken: { bg: COLORS.successSoft, fg: COLORS.success, icon: Check },
    Missed: { bg: COLORS.dangerSoft, fg: COLORS.coral, icon: X },
    Skipped: { bg: COLORS.dangerSoft, fg: COLORS.coral, icon: X },
    Late: { bg: COLORS.warningSoft, fg: COLORS.amber, icon: Clock },
    Upcoming: { bg: COLORS.mint, fg: COLORS.primaryDark, icon: CalendarClock },
  };
  const s = map[status] || map.Upcoming;
  const Icon = s.icon;
  return (
    <motion.span key={status} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_UI}
      style={{ background: s.bg, color: s.fg }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-medium">
      <Icon size={13} strokeWidth={2.5} /> {status}
    </motion.span>
  );
}

/* Status expressed with icon + text + color together — never color alone,
   per accessibility requirements (color-independent status indicators). */
export function TrendPill({ direction, label }) {
  const map = {
    improving: { bg: COLORS.successSoft, fg: COLORS.success, glyph: "↑", text: label || "Improving" },
    increasing: { bg: COLORS.successSoft, fg: COLORS.success, glyph: "↑", text: label || "Increasing" },
    decreasing: { bg: COLORS.warningSoft, fg: COLORS.amber, glyph: "↓", text: label || "Decreasing" },
    monitor: { bg: COLORS.warningSoft, fg: COLORS.amber, glyph: "!", text: label || "Monitor" },
    attention: { bg: COLORS.dangerSoft, fg: COLORS.coral, glyph: "!", text: label || "Needs attention" },
    stable: { bg: COLORS.mint, fg: COLORS.primaryDark, glyph: "→", text: label || "Stable" },
  };
  const s = map[direction] || map.stable;
  return (
    <span style={{ background: s.bg, color: s.fg }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12.5px] font-semibold">
      <span aria-hidden="true">{s.glyph}</span> {s.text}
    </span>
  );
}

export function SeverityDot({ severity }) {
  const c = severity === "critical" ? COLORS.coral : severity === "warning" ? COLORS.amber : COLORS.primary;
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />;
}

export function Card({ children, className = "", style = {} }) {
  return (
    <div className={`rounded-[20px] border ${className}`}
      style={{ background: COLORS.card, borderColor: COLORS.hair, boxShadow: COLORS.cardShadow, ...style }}>
      {children}
    </div>
  );
}

export function MotionCard({ children, className = "", style = {}, onClick, whileTapScale = 0.98 }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
      whileHover={shouldReduceMotion ? {} : { y: -2, scale: 1.01, boxShadow: "var(--color-card-shadow-hover)" }}
      whileTap={onClick ? { scale: whileTapScale } : {}}
      transition={SPRING_UI}
      className={`rounded-[20px] border ${className}`}
      style={{ background: COLORS.card, borderColor: COLORS.hair, boxShadow: COLORS.cardShadow, cursor: onClick ? "pointer" : "default", ...style }}>
      {children}
    </motion.div>
  );
}

export function Heading({ children, size = 24, className = "" }) {
  const tracking = size >= 28 ? "-0.021em" : size >= 22 ? "-0.017em" : size >= 17 ? "-0.01em" : "0em";
  return (
    <h1 style={{ fontSize: size, letterSpacing: tracking, lineHeight: size >= 22 ? 1.15 : 1.4 }}
      className={`font-semibold ${className}`}>{children}</h1>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div>
        <h1 className="font-bold text-[24px] tracking-tight" style={{ color: COLORS.ink, letterSpacing: "-0.02em" }}>{title}</h1>
        {subtitle && <p className="text-[14px] mt-0.5" style={{ color: COLORS.inkSoft }}>{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", size = "md", icon: Icon, disabled, type = "button", className = "" }) {
  const sizes = { sm: "px-3 py-1.5 text-[12.5px]", md: "px-4 py-2.5 text-[13.5px]", lg: "px-5 py-3 text-[14.5px]" };
  const variants = {
    primary: { background: COLORS.primary, color: "white", border: "none" },
    secondary: { background: "transparent", color: COLORS.primary, border: `1.5px solid ${COLORS.primary}` },
    ghost: { background: "transparent", color: COLORS.inkSoft, border: `1px solid ${COLORS.hair}` },
    danger: { background: COLORS.dangerSoft, color: COLORS.coral, border: "none" },
  };
  return (
    <motion.button whileTap={{ scale: 0.97 }} type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 font-semibold rounded-[10px] focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]} ${className}`}
      style={{ ...variants[variant], "--tw-ring-color": COLORS.primary }}>
      {Icon && <Icon size={size === "sm" ? 13 : size === "lg" ? 17 : 15} strokeWidth={2.2} />}
      {children}
    </motion.button>
  );
}

export function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: COLORS.mint }}>
        <Icon size={20} color={COLORS.primary} />
      </div>
      <div className="font-semibold text-[15px]" style={{ color: COLORS.ink }}>{title}</div>
      <div className="text-[13px] mt-1 max-w-xs" style={{ color: COLORS.inkSoft }}>{body}</div>
    </div>
  );
}

export function StatTile({ label, value, accent }) {
  const shouldReduceMotion = useReducedMotion();
  const ref = useRef(null);
  const numeric = typeof value === "string" ? parseFloat(value) : value;
  const suffix = typeof value === "string" ? value.replace(/^-?[\d.]+/, "") : "";
  const isNumeric = !Number.isNaN(numeric);

  useEffect(() => {
    if (!isNumeric || !ref.current) return;
    if (shouldReduceMotion) { ref.current.textContent = `${numeric}${suffix}`; return; }
    const controls = fmAnimate(0, numeric, {
      duration: 0.6, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { if (ref.current) ref.current.textContent = `${Math.round(v)}${suffix}`; },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeric, suffix, isNumeric, shouldReduceMotion]);

  return (
    <Card className="p-4">
      <div className="text-[12.5px] font-medium" style={{ color: COLORS.inkSoft }}>{label}</div>
      <div ref={isNumeric ? ref : undefined} className="text-[24px] font-semibold mt-1 tabular-nums" style={{ color: accent || COLORS.ink }}>
        {isNumeric ? `0${suffix}` : value}
      </div>
    </Card>
  );
}

export function RingProgress({ pct, size = 128, stroke = 12, color, label, sublabel }) {
  const shouldReduceMotion = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = clamp(pct, 0, 100);
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={COLORS.hair} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || COLORS.primary} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: shouldReduceMotion ? offset : c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <div className="text-[26px] font-semibold tabular-nums" style={{ color: COLORS.ink, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{label}</div>
        {sublabel && <div className="text-[11px] font-medium mt-1" style={{ color: COLORS.inkSoft }}>{sublabel}</div>}
      </div>
    </div>
  );
}

export function StatChip({ icon: Icon, label, value, tint, fg }) {
  return (
    <div className="flex items-center gap-2.5 pl-2.5 pr-4 py-2.5 rounded-[16px] min-w-[148px]" style={{ background: tint }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--color-chip-icon-bg)" }}>
        <Icon size={14} color={fg} strokeWidth={2.25} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium truncate" style={{ color: fg, opacity: 0.82 }}>{label}</div>
        <div className="text-[15px] font-semibold tabular-nums" style={{ color: fg }}>{value}</div>
      </div>
    </div>
  );
}

export function IconBadge({ icon: Icon, tint, fg, size = 38 }) {
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, background: tint }}>
      <Icon size={Math.round(size * 0.44)} color={fg} strokeWidth={2.25} />
    </div>
  );
}

export function PinnedCardHeader({ icon: Icon, label, tint, fg, meta }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: tint }}>
          <Icon size={13} color={fg} strokeWidth={2.5} />
        </div>
        <span className="text-[14px] font-semibold" style={{ color: fg }}>{label}</span>
      </div>
      {meta && <span className="text-[12.5px]" style={{ color: COLORS.inkFaint }}>{meta}</span>}
    </div>
  );
}

export function TripleStat({ items }) {
  return (
    <div className="flex items-center gap-5 flex-wrap">
      {items.map((it, i) => (
        <React.Fragment key={it.label}>
          {i > 0 && <div className="w-px h-8 flex-shrink-0" style={{ background: COLORS.hair }} />}
          <div>
            <div className="text-[12.5px] font-semibold" style={{ color: it.color }}>{it.label}</div>
            <div className="text-[19px] font-bold mt-0.5" style={{ color: COLORS.ink }}>
              {it.value} <span className="text-[13px] font-medium" style={{ color: COLORS.inkSoft }}>{it.unit}</span>
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function ScheduleTimeline({ rows, onMark }) {
  return (
    <div>
      {rows.map((row, i) => {
        const tone = row.status === "Taken" ? { dot: COLORS.success, tint: COLORS.successSoft }
          : row.status === "Missed" ? { dot: COLORS.coral, tint: COLORS.dangerSoft }
          : row.status === "Late" ? { dot: COLORS.amber, tint: COLORS.warningSoft }
          : { dot: COLORS.primary, tint: COLORS.mint };
        const isLast = i === rows.length - 1;
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0 w-6">
              <span className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0" style={{ background: tone.dot }} />
              {!isLast && <span className="w-px flex-1 my-1" style={{ background: COLORS.hair }} />}
            </div>
            <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[12.5px] font-semibold" style={{ color: COLORS.inkSoft }}>{to12h(row.time)}</div>
                <StatusPill status={row.status} />
              </div>
              <div className="text-[15px] font-semibold mt-0.5">{row.name} · {row.dosage}</div>
              <div className="text-[12.5px] mt-0.5" style={{ color: COLORS.inkSoft }}>{row.instructions}</div>
              {row.status === "Upcoming" && onMark && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <motion.button whileTap={{ scale: 0.93 }} transition={SPRING_UI} onClick={() => onMark(row, "Taken")}
                    className="text-[12.5px] font-medium px-3.5 py-2 rounded-full text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1"
                    style={{ background: COLORS.primary, "--tw-ring-color": COLORS.primary }}>Taken</motion.button>
                  <motion.button whileTap={{ scale: 0.93 }} transition={SPRING_UI} onClick={() => onMark(row, "Skipped")}
                    className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-1"
                    style={{ borderColor: COLORS.hair, color: COLORS.inkSoft, "--tw-ring-color": COLORS.hair }}>Skipped</motion.button>
                  <motion.button whileTap={{ scale: 0.93 }} transition={SPRING_UI} onClick={() => onMark(row, "Missed")}
                    className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-1"
                    style={{ borderColor: COLORS.hair, color: COLORS.coral, "--tw-ring-color": COLORS.hair }}>Missed</motion.button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SkeletonLine({ width = "100%", height = 14, className = "" }) {
  return (
    <div
      className={`rounded-full animate-pulse ${className}`}
      style={{ width, height, background: COLORS.surface2 }}
    />
  );
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <Card className="p-5 space-y-3">
      <SkeletonLine width="38%" height={16} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? "64%" : "100%"} height={13} />
      ))}
    </Card>
  );
}

export function Field({ label, value, onChange, placeholder, type = "text", autoComplete, required = false, name, step, min, max }) {
  return (
    <label className="block">
      <div className="text-[13px] font-medium mb-1" style={{ color: COLORS.ink }}>{label}</div>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        step={step}
        min={min}
        max={max}
        className="w-full px-3 py-2.5 rounded-[10px] text-[14px] border outline-none focus:ring-2 focus:ring-offset-1 transition-shadow"
        style={{ borderColor: COLORS.hair, "--tw-ring-color": COLORS.primary, background: COLORS.card, color: COLORS.ink }}
      />
    </label>
  );
}

export function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <div className="text-[13px] font-medium mb-1" style={{ color: COLORS.ink }}>{label}</div>
      <select value={value} onChange={onChange}
        className="w-full px-3 py-2.5 rounded-[10px] text-[14px] border outline-none focus:ring-2 focus:ring-offset-1 transition-shadow"
        style={{ borderColor: COLORS.hair, "--tw-ring-color": COLORS.primary, background: COLORS.card, color: COLORS.ink }}>
        {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </label>
  );
}

/* Simple horizontal segmented control — used for time-range selectors
   (7D | 30D | 3M | 6M | 1Y) across every metric detail page. */
export function SegmentedControl({ options, value, onChange, size = "sm" }) {
  const pad = size === "sm" ? "px-3 py-1.5 text-[12.5px]" : "px-4 py-2 text-[13.5px]";
  return (
    <div className="inline-flex items-center rounded-full p-1 gap-0.5" style={{ background: COLORS.mint }} role="tablist">
      {options.map((opt) => {
        const val = opt.value ?? opt;
        const label = opt.label ?? opt;
        const active = val === value;
        return (
          <button key={val} role="tab" aria-selected={active} onClick={() => onChange(val)}
            className={`relative rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${pad}`}
            style={{ color: active ? COLORS.primaryDark : COLORS.inkSoft, "--tw-ring-color": COLORS.primary }}>
            {active && (
              <motion.span layoutId={`seg-${options.map((o) => o.value ?? o).join("-")}`} transition={SPRING_UI}
                className="absolute inset-0 rounded-full -z-10" style={{ background: COLORS.card, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }} />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
