import { useEffect, useState } from "react";
import { MessageCircle, Check, Loader2, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");

// The AI menu assistant that used to live here is gone — the user's verdict was blunt
// ("זה לא עובד"). In its place: the direct line to the operator. Owners write what they
// want in their own words, it lands in operator_requests (the same queue the operator
// panel drains), and the menu updates for them without touching anything. The open
// requests are listed with their status so a sent request never feels swallowed.
const EXAMPLES = [
  "תעלו את מחיר הסלמון ל-84",
  "תוסיפו את מנות הספיישל החדשות",
  "תמחקו את הקינוחים של הקיץ",
  "משהו לא עובד לי במסך הצוות",
];

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
      <div className="bg-[#16181c] rounded-2xl p-4 border border-[#22252b] space-y-3">
        <p className="font-bold text-[#eef0f6] flex items-center gap-2">
          <MessageCircle size={16} className="text-[#6d5efc]" /> קו ישיר אלינו
        </p>
        <p className="text-xs text-[#8a8aa0] leading-relaxed">
          רוצים לשנות משהו בתפריט? נתקלתם בבעיה? יש רעיון? כתבו לנו במילים שלכם — אנחנו
          מטפלים בהכל בשבילכם, והאפליקציה מתעדכנת אצלכם ואצל הצוות אוטומטית.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'למשל: "תעלו את מחיר הסלמון ל-84"'}
          rows={2}
          dir="rtl"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2.5 text-[#eef0f6] text-sm placeholder:text-[#6a6a7e] focus:outline-none focus:border-[#6d5efc] resize-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setText(ex)} className="text-[10px] text-[#8a8aa0] bg-[#0c0d10] border border-[#22252b] rounded-full px-2.5 py-1 hover:border-[#6d5efc]/50 transition">
              {ex}
            </button>
          ))}
        </div>
        <button
          onClick={send}
          disabled={busy || !text.trim()}
          className="w-full bg-[#6d5efc] text-white font-bold py-2.5 rounded-lg text-sm hover:bg-[#5b4ef0] transition disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy ? <><Loader2 size={15} className="animate-spin" /> שולח…</> : "שלחו לנו — נטפל בזה"}
        </button>
        {sent && (
          <p className="text-xs font-bold text-[#22c08c] flex items-center gap-1.5">
            <Check size={14} /> הבקשה התקבלה! נטפל בה בהקדם ונעדכן אתכם.
          </p>
        )}
        {err && (
          <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5">
            <AlertTriangle size={14} className="shrink-0" /> {err}
          </p>
        )}
      </div>

      {requests.length > 0 && (
        <div className="bg-[#16181c] rounded-2xl p-4 border border-[#22252b] space-y-2">
          <p className="text-[11px] font-bold text-[#8a8aa0]">הבקשות האחרונות שלכם</p>
          {requests.map((r) => (
            <div key={r.id} className="bg-[#0c0d10] rounded-lg p-2.5 border border-[#22252b] flex items-start justify-between gap-2">
              <p className="text-xs text-[#c4c4d4] leading-relaxed min-w-0">{r.request}</p>
              {r.status === "done" ? (
                <span className="text-[10px] font-bold text-[#22c08c] bg-[#1aa376]/15 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"><Check size={10} /> טופל</span>
              ) : (
                <span className="text-[10px] font-bold text-[#f3c98b] bg-[#f3a712]/10 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"><Clock size={10} /> בטיפול</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
