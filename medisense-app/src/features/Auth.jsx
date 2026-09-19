import React, { useState } from "react";
import { motion } from "framer-motion";
import { Pill, User, Stethoscope } from "lucide-react";
import { COLORS, FONT_STACK, FONT_IMPORT, SPRING_UI, Card, Field } from "../shared.jsx";

export default function LoginPage({ onLogin }) {
  const [role, setRole] = useState("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [newName, setNewName] = useState("");

  const submit = () => {
    if (mode === "register" && role === "patient") {
      onLogin("patient", { registerName: newName || "New Patient" });
    } else {
      onLogin(role, {});
    }
  };

  return (
    <div style={{
      minHeight: "100%", fontFamily: FONT_STACK,
      background: "radial-gradient(120% 100% at 10% 0%, var(--color-accent-soft) 0%, var(--color-bg) 45%, var(--color-lavender-soft) 100%)",
    }} className="flex items-center justify-center px-5 py-10">
      <style>{FONT_IMPORT}</style>
      <Card className="w-full max-w-md p-7" style={{ boxShadow: "0 1px 2px rgba(20,21,31,0.03), 0 12px 32px rgba(20,21,31,0.06)" }}>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-[14px] flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.lavender})` }}>
            <Pill size={17} color="white" />
          </div>
          <span className="font-semibold text-[19px] tracking-tight">MediSense</span>
        </div>
        <p className="text-[13px] mt-1" style={{ color: COLORS.inkSoft }}>Your unified personal health platform.</p>

        <div className="relative flex mt-6 mb-5 rounded-[14px] p-1 gap-1" style={{ background: COLORS.mint }}>
          {["patient", "doctor"].map((r) => (
            <motion.button key={r} whileTap={{ scale: 0.97 }} onClick={() => { setRole(r); setMode("login"); }}
              className="relative flex-1 text-[13.5px] font-medium py-2.5 rounded-[10px] inline-flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-offset-1 z-10"
              style={{ color: role === r ? COLORS.primaryDark : COLORS.inkSoft, "--tw-ring-color": COLORS.primary }}>
              {role === r && (
                <motion.div layoutId="login-role-pill" transition={SPRING_UI}
                  className="absolute inset-0 rounded-[10px] -z-10" style={{ background: COLORS.card, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }} />
              )}
              {r === "patient" ? <User size={14} /> : <Stethoscope size={14} />} {r === "patient" ? "Patient" : "Doctor"}
            </motion.button>
          ))}
        </div>

        <h1 className="text-[19px] font-semibold">{role === "patient" ? "Patient login" : "Doctor login"}</h1>
        <p className="text-[13px] mt-1 mb-4" style={{ color: COLORS.inkSoft }}>
          {role === "patient" ? "Log in to view your health, medications, and appointments." : "Log in to manage your patients."}
        </p>

        <div className="space-y-3">
          <Field label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={role === "patient" ? "alex@medisense.demo" : "dr.chen@medisense.demo"} type="email" />
          <Field label="Password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="demo1234" type="password" />
          {mode === "register" && role === "patient" && (
            <Field label="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Your name" />
          )}
        </div>

        <motion.button whileTap={{ scale: 0.97 }} transition={SPRING_UI} onClick={submit}
          className="w-full text-[14.5px] font-medium py-3 rounded-full text-white mt-5 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ background: COLORS.primary, "--tw-ring-color": COLORS.primary }}>
          {mode === "register" ? "Create patient account" : `Log in as ${role === "patient" ? "patient" : "doctor"}`}
        </motion.button>

        {role === "patient" ? (
          <div className="text-center text-[13px] mt-4" style={{ color: COLORS.inkSoft }}>
            {mode === "login" ? (
              <>New patient? <button className="font-medium" style={{ color: COLORS.primary }} onClick={() => setMode("register")}>Create an account</button></>
            ) : (
              <>Already registered? <button className="font-medium" style={{ color: COLORS.primary }} onClick={() => setMode("login")}>Log in</button></>
            )}
          </div>
        ) : (
          <div className="text-center text-[12px] mt-4" style={{ color: COLORS.inkSoft }}>
            Doctor accounts are provisioned by the clinic. Use the demo login below.
          </div>
        )}

        <div className="text-center text-[12px] mt-4 p-3 rounded-[14px]" style={{ color: COLORS.inkSoft, background: COLORS.mint }}>
          Demo patient: alex@medisense.demo / demo1234<br />
          Demo doctor: dr.chen@medisense.demo / demo1234<br />
          <span className="opacity-80">(any password works in this prototype)</span>
        </div>
      </Card>
    </div>
  );
}
