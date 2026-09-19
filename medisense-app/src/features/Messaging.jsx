import React, { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { COLORS, Card, EmptyState, uid, todayISO, to12h } from "../shared.jsx";
import { MessageCircle } from "lucide-react";

/* =========================================================================
   Secure messaging — a single thread per patient, shared between the
   patient's Care → Messages tab and the doctor's patient detail view.
   Messages live on the patient record (patient.messages) so, like every
   other category in MediSense, there is one copy of the data, read from
   both sides rather than duplicated per role.
   ========================================================================= */

export function unreadCount(messages, forSender) {
  // "forSender" is who is currently viewing — unread means a message sent
  // by the *other* party that hasn't been marked read yet.
  return (messages || []).filter((m) => m.sender !== forSender && !m.read).length;
}

export function MessageThread({ patient, updatePatient, viewerSender, otherName, otherSubtitle }) {
  const [text, setText] = useState("");
  const messages = patient.messages || [];
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Mark the other party's messages read as soon as this thread is open.
  useEffect(() => {
    const hasUnread = messages.some((m) => m.sender !== viewerSender && !m.read);
    if (hasUnread) {
      updatePatient(patient.id, (p) => ({ ...p, messages: p.messages.map((m) => (m.sender !== viewerSender ? { ...m, read: true } : m)) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id, messages.length]);

  const send = async () => {
    if (!text.trim()) return;
    const now = new Date();
    const msg = { id: uid(), sender: viewerSender, text: text.trim(), date: todayISO(), time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, read: false };
    await updatePatient(patient.id, (p) => ({ ...p, messages: [...(p.messages || []), msg] }));
    setText("");
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b" style={{ borderColor: COLORS.hair }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: COLORS.mint }}>
          <MessageCircle size={17} color={COLORS.primaryDark} />
        </div>
        <div>
          <div className="font-semibold text-[15px]">{otherName}</div>
          {otherSubtitle && <div className="text-[12.5px]" style={{ color: COLORS.inkSoft }}>{otherSubtitle}</div>}
        </div>
      </div>

      <div className="min-h-[240px] max-h-[420px] overflow-y-auto space-y-3 mb-4 pr-1">
        {messages.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No messages yet" body={`Send a message to start the conversation with ${otherName}.`} />
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === viewerSender ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[78%]">
                <div className="px-3.5 py-2.5 rounded-[20px] text-[14px] leading-relaxed"
                  style={m.sender === viewerSender ? { background: COLORS.primary, color: "white" } : { background: COLORS.surface2, color: COLORS.ink }}>
                  {m.text}
                </div>
                <div className={`text-[11px] mt-1 ${m.sender === viewerSender ? "text-right" : ""}`} style={{ color: COLORS.inkFaint }}>{to12h(m.time)}</div>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Write a message…" className="flex-1 px-3.5 py-2.5 rounded-[14px] border text-[14px] outline-none focus:ring-2 focus:ring-offset-1"
          style={{ borderColor: COLORS.hair, "--tw-ring-color": COLORS.primary }} />
        <button onClick={send} aria-label="Send message" className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: COLORS.primary }}>
          <Send size={15} />
        </button>
      </div>
      <p className="text-[11.5px] mt-3" style={{ color: COLORS.inkFaint }}>Messages are for non-urgent questions only. For medical emergencies, call your local emergency number.</p>
    </Card>
  );
}
