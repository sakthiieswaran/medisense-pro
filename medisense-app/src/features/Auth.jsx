import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Pill, User, Stethoscope, HeartHandshake, ShieldCheck, KeyRound,
  AlertCircle, CheckCircle2, Heart, Shield, Bell, Activity, Loader2,
} from "lucide-react";
import { COLORS, FONT_STACK, FONT_IMPORT, SPRING_UI, Field } from "../shared.jsx";
import {
  API_BASE,
  login as apiLogin,
  register as apiRegister,
  forgotPassword as apiForgotPassword,
  resetPassword as apiResetPassword,
  verifyEmail as apiVerifyEmail,
} from "../apiStorage.js";

const ALLOW_DEMO = !import.meta.env.PROD || !API_BASE;

const ROLES = [
  { id: "patient", label: "Patient", icon: User },
  { id: "caregiver", label: "Caregiver", icon: HeartHandshake },
  { id: "doctor", label: "Doctor", icon: Stethoscope },
];

const FEATURES = [
  { icon: Shield, text: "Secure, encrypted health records" },
  { icon: Bell, text: "Smart medication reminders" },
  { icon: Activity, text: "Real-time vitals & trends" },
];

export default function LoginPage({ onAuthenticated, onOfflineDemo }) {
  const [role, setRole] = useState("patient");
  const [mode, setMode] = useState("login"); // login | register | forgot | reset | verify
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentHealth, setConsentHealth] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");

  // Check URL query params for verification / reset links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vToken = params.get("verifyToken");
    const rToken = params.get("resetToken");
    if (rToken) {
      setResetToken(rToken);
      setMode("reset");
    } else if (vToken) {
      setBusy(true);
      apiVerifyEmail(vToken)
        .then(() => setNotice("Email verified! You can now sign in."))
        .catch((e) => setError(e.message || "Email verification failed."))
        .finally(() => setBusy(false));
    }
  }, []);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setGeneratedCode("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (mode === "forgot") {
      if (!email.trim()) return setError("Please enter your email address.");
      setBusy(true);
      try {
        const res = await apiForgotPassword(email.trim());
        setNotice(res.message || "A verification code has been dispatched to your email.");
        setGeneratedCode(res.code || res.devResetToken || "");
        setResetToken("");
        setMode("reset");
      } catch (err) {
        setError(err.message || "Could not request password reset.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === "reset") {
      if (!resetToken.trim() || newPassword.length < 8) {
        return setError("Enter your verification code and a new password (8+ chars with letters and numbers).");
      }
      setBusy(true);
      try {
        const res = await apiResetPassword(resetToken.trim(), newPassword, email.trim());
        setNotice(res.message || "Password updated. Sign in with your new password.");
        setPassword("");
        setNewPassword("");
        setResetToken("");
        setGeneratedCode("");
        setMode("login");
      } catch (err) {
        setError(err.message || "Password reset failed.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      return setError("Please enter both your email and password.");
    }

    if (mode === "register") {
      if (!newName.trim() || newName.trim().length < 2) {
        return setError("Please enter your full name.");
      }
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return setError("Password must be at least 8 characters and include both letters and numbers.");
      }
      if (!consentPrivacy || !consentHealth) {
        return setError("Please review and accept both consent checkboxes to create your account.");
      }
    }

    setBusy(true);
    try {
      const user =
        mode === "register"
          ? await apiRegister(newName.trim(), email.trim(), password, {
              role,
              inviteCode: role === "doctor" ? inviteCode.trim() : undefined,
              consentPrivacy,
              consentHealthProcessing: consentHealth,
            })
          : await apiLogin(email.trim(), password, role);

      await onAuthenticated(user, { isNewRegistration: mode === "register" });
    } catch (err) {
      if (err.status === 405 || err.code === "ENDPOINT_NOT_ALLOWED" || err.code === "API_NOT_CONFIGURED") {
        setError("Backend API is not deployed on this domain. You can continue in Browser Standalone Mode below.");
        return;
      }
      const isNetwork =
        err.message?.includes("fetch") ||
        err.message?.includes("NetworkError") ||
        err.message?.includes("Failed to fetch");
      setError(
        isNetwork
          ? API_BASE
            ? `Cannot reach the MediSense server (${API_BASE}).${ALLOW_DEMO ? " Start the backend or use Offline Demo mode." : " Please check your connection or try again shortly."}`
            : "MediSense backend API URL is not configured (VITE_API_URL)."
          : err.message || "Authentication failed."
      );
    } finally {
      setBusy(false);
    }
  };

  const titleMap = {
    login: `Sign in to MediSense`,
    register: `Create your account`,
    forgot: "Reset your password",
    reset: "Enter reset code",
  };

  const subtitleMap = {
    login:
      role === "patient"
        ? "Manage medications, vitals, and medical records securely."
        : role === "caregiver"
        ? "Monitor shared medication schedules and alerts for family members."
        : "Review consenting patients, manage prescriptions, and publish clinic slots.",
    register:
      "Join MediSense to take control of your health journey.",
    forgot: "Enter your account email and we'll issue a time-limited reset code.",
    reset: ALLOW_DEMO
      ? "Paste your reset code (check server logs in dev mode) and choose a new password."
      : "Enter the password reset code sent to your email and choose a new password.",
  };

  return (
    <div
      style={{ minHeight: "100vh", fontFamily: FONT_STACK, background: "var(--color-bg)" }}
      className="flex"
    >
      <style>{FONT_IMPORT}</style>

      {/* ── Left branding panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between p-10 w-[42%] flex-shrink-0"
        style={{ background: "var(--color-primary)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[14px] flex items-center justify-center bg-white/20 backdrop-blur"
          >
            <Heart size={20} color="white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-[20px] tracking-tight text-white">MediSense</span>
        </div>

        {/* Center content */}
        <div>
          <div className="mb-8">
            <div
              className="w-20 h-20 rounded-[24px] flex items-center justify-center mb-6"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <Activity size={40} color="white" strokeWidth={1.8} />
            </div>
            <h1 className="text-[32px] font-bold text-white leading-tight tracking-tight mb-3">
              Your personal<br />healthcare companion
            </h1>
            <p className="text-[15px] text-white/75 leading-relaxed">
              Everything you need to manage your health, medications, and medical records — all in one place.
            </p>
          </div>

          <div className="space-y-3.5">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.text} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.18)" }}
                  >
                    <Icon size={15} color="white" strokeWidth={2.2} />
                  </div>
                  <span className="text-[14px] text-white/90 font-medium">{f.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer text */}
        <div className="flex items-center gap-2">
          <Shield size={13} color="rgba(255,255,255,0.6)" />
          <span className="text-[12.5px] text-white/60">Trusted healthcare management · HIPAA & DPDP compliant</span>
        </div>
      </div>

      {/* ── Mobile top bar ── */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-10 flex items-center gap-2.5 px-5 py-4"
        style={{ background: "var(--color-primary)" }}
      >
        <div className="w-7 h-7 rounded-[10px] flex items-center justify-center bg-white/20">
          <Heart size={14} color="white" strokeWidth={2.5} />
        </div>
        <span className="font-bold text-[17px] text-white tracking-tight">MediSense</span>
      </div>

      {/* ── Right form panel ── */}
      <div
        className="flex-1 flex items-center justify-center px-5 py-10 lg:py-12 pt-24 lg:pt-12"
        style={{ background: "var(--color-bg)" }}
      >
        <div className="w-full max-w-[420px]">

          {/* Form card */}
          <div
            className="rounded-[20px] p-7"
            style={{
              background: "var(--color-card)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)",
              border: "1px solid var(--color-hair)",
            }}
          >
            {!API_BASE && (
              <div
                className="flex items-center justify-between px-3.5 py-1.5 rounded-[10px] mb-4 text-[12px]"
                style={{
                  background: "rgba(0, 210, 184, 0.08)",
                  color: "var(--color-primary)",
                  border: "1px solid rgba(0, 210, 184, 0.2)",
                }}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck size={13} /> Browser Mode (Standalone)
                </span>
                <span className="text-[11px] opacity-75">Saved locally</span>
              </div>
            )}
            <h2 className="text-[22px] font-bold tracking-tight mb-1" style={{ color: "var(--color-ink)" }}>
              {titleMap[mode]}
            </h2>
            <p className="text-[13.5px] mb-5" style={{ color: "var(--color-ink-soft)" }}>
              {subtitleMap[mode]}
            </p>

            {/* Role selector (login/register only) */}
            {(mode === "login" || mode === "register") && (
              <fieldset className="mb-5 border-0 p-0">
                <legend className="sr-only">Account role</legend>
                <div
                  className="relative flex rounded-[14px] p-1 gap-1"
                  style={{ background: "var(--color-surface-2)" }}
                >
                  {ROLES.map((r) => {
                    const Icon = r.icon;
                    const active = role === r.id;
                    return (
                      <motion.button
                        key={r.id}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setRole(r.id);
                          setError("");
                        }}
                        className="relative flex-1 text-[12.5px] font-medium py-2.5 rounded-[10px] inline-flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 z-10"
                        style={{
                          color: active ? "var(--color-primary)" : "var(--color-ink-soft)",
                          "--tw-ring-color": "var(--color-primary)",
                        }}
                      >
                        {active && (
                          <motion.div
                            layoutId="login-role-pill"
                            transition={SPRING_UI}
                            className="absolute inset-0 rounded-[10px] -z-10"
                            style={{
                              background: "var(--color-card)",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                            }}
                          />
                        )}
                        <Icon size={13} strokeWidth={2.2} /> {r.label}
                      </motion.button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="flex flex-col gap-2 text-[12.5px] p-3.5 rounded-[12px] mb-4"
                style={{ background: "var(--color-danger-soft)", color: "var(--color-coral, #DC2626)" }}
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
                {onOfflineDemo && (
                  <button
                    type="button"
                    onClick={() => onOfflineDemo(role)}
                    className="self-start text-[11.5px] font-semibold underline hover:opacity-85 transition-opacity pl-6"
                  >
                    Continue as {role === "doctor" ? "Doctor" : role === "caregiver" ? "Caregiver" : "Patient"} in Browser Mode →
                  </button>
                )}
              </div>
            )}

            {/* Notice message */}
            {notice && (
              <div
                role="status"
                className="flex items-start gap-2.5 text-[12.5px] p-3.5 rounded-[12px] mb-4"
                style={{ background: "var(--color-success-soft, rgba(22,163,74,0.10))", color: "var(--color-success, #16A34A)" }}
              >
                <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
                <span>{notice}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
              {mode === "register" && (
                <Field
                  label="Full name"
                  name="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Alex Johnson"
                  autoComplete="name"
                  required
                />
              )}

              {(mode === "login" || mode === "register" || mode === "forgot") && (
                <Field
                  label="Email address"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={
                    ALLOW_DEMO
                      ? role === "doctor"
                        ? "dr.chen@medisense.demo"
                        : role === "caregiver"
                        ? "priya.caregiver@medisense.demo"
                        : "alex@medisense.demo"
                      : role === "doctor"
                      ? "doctor@clinic.org"
                      : role === "caregiver"
                      ? "caregiver@example.com"
                      : "you@example.com"
                  }
                  type="email"
                  autoComplete="email"
                  required
                />
              )}

              {(mode === "login" || mode === "register") && (
                <Field
                  label="Password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "8+ chars, letters & numbers" : "Enter your password"}
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                />
              )}

              {mode === "register" && role === "doctor" && (
                <Field
                  label={ALLOW_DEMO ? "Clinic Invite Code (if required by deployment)" : "Clinic Invite Code"}
                  name="inviteCode"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder={ALLOW_DEMO ? "Optional in local dev" : "Required for doctor accounts"}
                  required={!ALLOW_DEMO}
                />
              )}

              {mode === "reset" && (
                <>
                  {generatedCode && (
                    <div
                      className="rounded-[14px] p-3.5 mb-3 border text-[12.5px]"
                      style={{
                        background: "rgba(0, 210, 184, 0.08)",
                        borderColor: "rgba(0, 210, 184, 0.25)",
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-teal-400">Verification Code for {email}:</span>
                        <button
                          type="button"
                          onClick={() => setResetToken(generatedCode)}
                          className="text-[11px] font-semibold underline hover:opacity-85"
                          style={{ color: "var(--color-primary)" }}
                        >
                          Auto-fill
                        </button>
                      </div>
                      <div
                        className="font-mono text-[18px] tracking-widest text-center py-1.5 rounded-[8px] font-bold"
                        style={{ background: "var(--color-surface-2)", color: "var(--color-ink)" }}
                      >
                        {generatedCode}
                      </div>
                      <div className="text-[11px] mt-1.5 opacity-80" style={{ color: "var(--color-ink-soft)" }}>
                        Enter this 6-digit code below to set your new password.
                      </div>
                    </div>
                  )}
                  <Field
                    label="6-digit verification code"
                    name="resetToken"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Enter 6-digit code"
                    required
                  />
                  <Field
                    label="New password"
                    name="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8+ chars, letters & numbers"
                    autoComplete="new-password"
                    required
                  />
                </>
              )}

              {mode === "register" && (
                <div className="space-y-2.5 pt-1 text-[12.5px]" style={{ color: "var(--color-ink-soft)" }}>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentPrivacy}
                      onChange={(e) => setConsentPrivacy(e.target.checked)}
                      className="mt-0.5 w-4 h-4 flex-shrink-0 rounded"
                      style={{ accentColor: "var(--color-primary)" }}
                    />
                    <span>I agree to the MediSense Privacy Notice & Terms of Service.</span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentHealth}
                      onChange={(e) => setConsentHealth(e.target.checked)}
                      className="mt-0.5 w-4 h-4 flex-shrink-0 rounded"
                      style={{ accentColor: "var(--color-primary)" }}
                    />
                    <span>I consent to processing my personal health and medication records (DPDP Act).</span>
                  </label>
                </div>
              )}

              {/* Forgot password link (login mode only) */}
              {mode === "login" && (
                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    className="text-[12.5px] font-medium hover:underline focus:outline-none"
                    style={{ color: "var(--color-primary)" }}
                    onClick={() => switchMode("forgot")}
                  >
                    <KeyRound size={11} className="inline mr-1" />
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Submit button */}
              <motion.button
                type="submit"
                disabled={busy}
                whileTap={{ scale: 0.97 }}
                transition={SPRING_UI}
                className="w-full text-[14.5px] font-semibold py-3.5 rounded-[12px] text-white mt-2 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 flex items-center justify-center gap-2"
                style={{
                  background: "var(--color-primary)",
                  "--tw-ring-color": "var(--color-primary)",
                }}
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy
                  ? "Please wait…"
                  : mode === "register"
                  ? `Create account`
                  : mode === "forgot"
                  ? "Send reset code"
                  : mode === "reset"
                  ? "Update password"
                  : `Sign in`}
              </motion.button>
            </form>

            {/* Mode switcher */}
            <div className="text-center text-[13px] mt-4" style={{ color: "var(--color-ink-soft)" }}>
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    className="font-semibold hover:underline focus:outline-none"
                    style={{ color: "var(--color-primary)" }}
                    onClick={() => switchMode("register")}
                  >
                    Create one
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="font-semibold hover:underline focus:outline-none"
                  style={{ color: "var(--color-primary)" }}
                  onClick={() => switchMode("login")}
                >
                  ← Back to sign in
                </button>
              )}
            </div>
          </div>

          {/* Demo accounts section */}
          {ALLOW_DEMO && (
            <div
              className="mt-4 rounded-[16px] p-4"
              style={{
                background: "var(--color-card)",
                border: "1px solid var(--color-hair)",
              }}
            >
              <div
                className="flex items-center gap-1.5 text-[12px] font-semibold mb-3"
                style={{ color: "var(--color-ink-soft)" }}
              >
                <ShieldCheck size={12} />
                Quick access — dev accounts (password: <code className="font-mono text-[11px] px-1 py-0.5 rounded" style={{ background: "var(--color-surface-2)" }}>demo1234</code>)
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => { setRole("patient"); setMode("login"); setEmail("alex@medisense.demo"); setPassword("demo1234"); }}
                  className="px-3 py-1.5 rounded-[10px] text-[12px] font-medium border hover:opacity-80 transition-opacity"
                  style={{
                    background: "transparent",
                    borderColor: "var(--color-primary)",
                    color: "var(--color-primary)",
                  }}
                >
                  <User size={11} className="inline mr-1" />
                  Alex (Patient)
                </button>
                <button
                  type="button"
                  onClick={() => { setRole("caregiver"); setMode("login"); setEmail("priya.caregiver@medisense.demo"); setPassword("demo1234"); }}
                  className="px-3 py-1.5 rounded-[10px] text-[12px] font-medium border hover:opacity-80 transition-opacity"
                  style={{
                    background: "transparent",
                    borderColor: "var(--color-primary)",
                    color: "var(--color-primary)",
                  }}
                >
                  <HeartHandshake size={11} className="inline mr-1" />
                  Priya (Caregiver)
                </button>
                <button
                  type="button"
                  onClick={() => { setRole("doctor"); setMode("login"); setEmail("dr.chen@medisense.demo"); setPassword("demo1234"); }}
                  className="px-3 py-1.5 rounded-[10px] text-[12px] font-medium border hover:opacity-80 transition-opacity"
                  style={{
                    background: "transparent",
                    borderColor: "var(--color-primary)",
                    color: "var(--color-primary)",
                  }}
                >
                  <Stethoscope size={11} className="inline mr-1" />
                  Dr. Chen (Doctor)
                </button>
              </div>
              {onOfflineDemo && (
                <div
                  className="pt-3 border-t flex items-center justify-between gap-2"
                  style={{ borderColor: "var(--color-hair)" }}
                >
                  <span className="text-[11.5px]" style={{ color: "var(--color-ink-soft)" }}>
                    1-Click Instant Access:
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOfflineDemo("patient")}
                      className="px-2.5 py-1 rounded-[8px] text-[11.5px] font-medium text-white"
                      style={{ background: "var(--color-primary)" }}
                    >
                      Patient Demo
                    </button>
                    <button
                      type="button"
                      onClick={() => onOfflineDemo("doctor")}
                      className="px-2.5 py-1 rounded-[8px] text-[11.5px] font-medium border"
                      style={{ borderColor: "var(--color-hair)", color: "var(--color-ink-soft)" }}
                    >
                      Doctor Demo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
