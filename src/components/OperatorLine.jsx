import { useEffect, useState } from "react";
import { MessageCircle, Check, Loader2, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");

// The AI menu assistant that used to live here is gone — the user's verdict was blunt
// ("זה לא עובד"). In its place: the direct line to the operator. Owners write what they
// want in their own words, it lands in operator_requests (the same queue the operator
// panel drains), and the menu updates for them without touching anything. The open
// requests are listed with their status so a sent request never feels swallowed.
export default function OperatorLine({ restaurant }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [requests, setRequests] = useState([]);

  const loadRequests = async () => {
    const { data } = await db.from("operator_requests")
      .select("id, request, status, created_at")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(5);
    setRequests(data || []);
  };

  useEffect(() => { loadRequests(); }, [restaurant?.id]);

  const pending = requests.filter((r) => r.status !== "done");

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(""); setSent(false);
    const { error } = await db.from("operator_requests").insert({
      restaurant_id: restaurant.id,
      request: text.trim(),
    });
    setBusy(false);
    if (error) { setErr("השליחה נכשלה: " + error.message); return; }
    setSent(true); setText("");
    loadRequests();
  };

  return (
    <div className="space-y-3">
      {/* One line, one field, one button. The block used to open with a three-line pitch
           and four example chips — a paragraph of marketing sitting on top of the menu the
           owner actually came to look at (user, 2026-08-20: "כל הדוגמאות מיותרות לגמרי,
           פשוט וחלק"). The placeholder carries the one example that is still worth having. */}
      <div className="bg-[#16181c] rounded-2xl p-3 border border-[#22252b] space-y-2">
        <p className="text-[12px] font-bold text-[#eef0f6] flex items-center gap-1.5">
          <MessageCircle size={14} className="text-[#6d5efc]" /> רוצים לשנות משהו? כתבו לנו ונטפל
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="למשל: תעלו את מחיר הסלמון ל-84"
          rows={2}
          dir="rtl"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] text-[13px] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#6d5efc] resize-none"
        />
        {text.trim() && (
          <button
            onClick={send}
            disabled={busy}
            className="w-full bg-[#6d5efc] text-white font-bold py-2.5 min-h-[44px] rounded-lg text-[13px] hover:bg-[#5b4ef0] transition disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? <><Loader2 size={15} className="animate-spin" /> שולח…</> : "שליחה"}
          </button>
        )}
        {sent && (
          <p className="text-[11px] font-bold text-[#22c08c] flex items-center gap-1.5">
            <Check size={13} /> הבקשה התקבלה — נטפל ונעדכן אתכם.
          </p>
        )}
        {err && (
          <p className="text-[11px] font-bold text-[#e0315a] flex items-center gap-1.5">
            <AlertTriangle size={13} className="shrink-0" /> {err}
          </p>
        )}
      </div>

      {/* Open requests only. A closed request is a thing that already happened, and the
          owner is looking at the menu, not at an archive. */}
      {pending.length > 0 && (
        <div className="space-y-1.5">
          {pending.map((r) => (
            <div key={r.id} className="bg-[#16181c] rounded-xl px-3 py-2 border border-[#22252b] flex items-center gap-2">
              <Clock size={12} className="text-[#f3c98b] shrink-0" />
              <p className="text-[11.5px] text-[#c4c4d4] leading-snug flex-1 min-w-0 truncate">{r.request}</p>
              <span className="text-[10px] font-bold text-[#f3c98b] shrink-0">בטיפול</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
