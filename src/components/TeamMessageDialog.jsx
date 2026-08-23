import { useState } from "react";
import { X, Send, Copy, Check, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");

// A nudge with a name on it. The daily brief speaks to the whole team; this is for the one
// waiter who hasn't opened the app all week, and it is sent from the row where the manager
// noticed (user, 2026-08-20).
//
// Suggested wordings first, free text second — the same rule as the tasks library. A
// manager staring at an empty box at 11am writes nothing, and the nudge that matters most
// is the one that actually gets sent.
// Formal register, no emojis (user, 2026-08-23: "בסוף זו הודעה מהבוס") — it's the manager
// writing, and a request that reads like a work instruction gets acted on.
// Written to work for anyone on the team — second-person past ("נכנסת") reads the same
// for every gender in Hebrew, so the notes stay personal without misgendering.
const SUGGESTIONS = [
  "נא לקרוא את העדכון היומי לפני תחילת המשמרת.",
  "נא להשלים את הלימוד היומי לפני תחילת המשמרת — 5 דקות מספיקות.",
  "נוספו מנות חדשות לתפריט. נא לעבור עליהן לפני המשמרת הקרובה.",
  "שמתי לב שלא נכנסת לאפליקציה בימים האחרונים. נא להשלים היום תרגול קצר.",
  "יש מספר מנות שחוזרות בהן טעויות. נא לחזור עליהן — נדבר על זה במשמרת.",
];

// Two modes, one dialog (user, 2026-08-23: "לשלוח הודעה כללית לכולם... או לבחור"):
// `member` = the original personal nudge; `members` = broadcast — everyone starts
// selected, tapping a name excludes them, and the same body is written once per
// recipient (separate team_messages rows, so per-waiter read receipts keep working).
export default function TeamMessageDialog({ member, members, restaurantId, lastSent, onClose, onSent }) {
  const broadcast = Array.isArray(members);
  const [selected, setSelected] = useState(() => new Set(broadcast ? members.map((m) => m.id) : []));
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  const toggle = (id) =>
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    const targets = broadcast ? members.filter((m) => selected.has(m.id)) : [member];
    if (!targets.length) return;
    setBusy(true);
    setErr("");
    const { error } = await db.from("team_messages").insert(
      targets.map((t) => ({ restaurant_id: restaurantId, team_member_id: t.id, body: text }))
    );
    setBusy(false);
    if (error) {
      console.error("team_messages insert failed:", error.message, error.details, error.hint, error.code);
      setErr("השליחה נכשלה. נסו שוב.");
      return;
    }
    for (const t of targets) onSent?.(t.id, text);
    onClose();
  };

  const copy = async () => {
    const text = body.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setErr("ההעתקה נחסמה בדפדפן — אפשר לסמן את הטקסט ולהעתיק ידנית.");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end justify-center" dir="rtl" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#16181c] border-t border-[#22252b] rounded-t-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#22252b] flex items-center gap-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-[#eef0f6] truncate">
              {broadcast ? "הודעה לצוות" : `הודעה ל${member.name}`}
            </p>
            <p className="text-[11px] text-[#8a8aa0]">
              {broadcast
                ? "אותה הודעה תישלח לכל מי שמסומן — הקשה על שם מסירה אותו"
                : "ההודעה מופיעה רק אצלו/ה, לא לכל הצוות"}
            </p>
          </div>
          <button onClick={onClose} className="text-[#8a8aa0] flex-shrink-0" aria-label="סגירה"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {broadcast && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-black text-[#8a8aa0]">
                נמענים · {selected.size} מתוך {members.length}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const on = selected.has(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition ${
                        on
                          ? "bg-[#6d5efc]/15 border-[#6d5efc] text-[#eef0f6]"
                          : "bg-[#0c0d10] border-[#22252b] text-[#5a5a6e] line-through"
                      }`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Sending the same reminder twice in one day reads as noise, so say it plainly
              rather than letting the manager find out from the waiter. */}
          {lastSent && (
            <div
              className={`rounded-lg p-2.5 border leading-relaxed ${
                lastSent.readAt
                  ? "text-[#22c08c] bg-[#22c08c]/10 border-[#22c08c]/25"
                  : "text-[#f3a712] bg-[#f3a712]/10 border-[#f3a712]/25"
              }`}
            >
              <p className="text-[11px] font-black">
                {lastSent.readAt ? "✓ ההודעה של היום נקראה" : "נשלחה הודעה היום — טרם נקראה"}
              </p>
              <p className="text-[11px] font-bold mt-0.5 opacity-80">"{lastSent.body}"</p>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-[11px] font-black text-[#8a8aa0]">נוסחים מוכנים — לחצו כדי למלא</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setBody(s)}
                className={`w-full text-right rounded-xl p-2.5 border text-[12px] leading-snug transition ${
                  body === s ? "bg-[#6d5efc]/15 border-[#6d5efc] text-[#eef0f6]" : "bg-[#0c0d10] border-[#22252b] text-[#c4c4d4]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="או כתבו הודעה משלכם…"
            rows="3"
            dir="rtl"
            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-xl px-3 py-2.5 text-[13px] text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#6d5efc] resize-none"
          />

          {err && (
            <p className="text-[11px] font-bold text-[#e0315a] flex items-start gap-1.5 leading-relaxed">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {err}
            </p>
          )}
        </div>

        <div className="p-3 border-t border-[#22252b] flex-shrink-0 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={send}
            disabled={!body.trim() || busy || (broadcast && selected.size === 0)}
            className="w-full bg-[#6d5efc] text-white font-black py-3 min-h-[44px] rounded-xl text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Send size={15} /> {busy ? "שולח…" : broadcast ? `שליחה ל-${selected.size} חברי צוות` : "שליחה באפליקציה"}
          </button>
          {/* The in-app message waits for the waiter to open the app. Copying it out means
              the manager can also drop it in the restaurant's WhatsApp right now — the
              channel these teams actually live on. */}
          <button
            onClick={copy}
            disabled={!body.trim()}
            className="w-full bg-[#22252b] text-[#a79bff] font-black py-2.5 min-h-[44px] rounded-xl text-xs disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {copied ? <><Check size={14} /> הועתק</> : <><Copy size={14} /> העתקה לשליחה בוואטסאפ</>}
          </button>
        </div>
      </div>
    </div>
  );
}
