import { useEffect, useMemo, useState } from "react";
import { Check, X, Clock, HelpCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");

// Who actually read today's brief — and whether they understood it.
//
// The old signal was worthless: the waiter app wrote a "read" row automatically on load,
// so this board showed a ✓ for anyone who merely opened the app. Now the waiter answers
// one question generated from the brief's own content ("what is missing today?"), and both
// the answer and whether it was right land here. A ✗ is the useful case: they clicked
// through without reading, and the owner can say something before the shift.
//
// Read-only, and it never blocks the editor above it.

export default function BriefReadBoard({ restaurant, brief }) {
  const [members, setMembers] = useState(null);
  const [reads, setReads] = useState([]);

  const today = new Date().toISOString().slice(0, 10);
  const hasBrief =
    (brief?.missing_items || []).length ||
    (brief?.new_items || []).length ||
    (brief?.oven_items || []).length ||
    brief?.notes;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!restaurant?.id) return;
      const [m, r] = await Promise.all([
        db.from("team_members").select("id, name, first_name, last_name").eq("restaurant_id", restaurant.id),
        db.from("daily_brief_reads")
          .select("team_member_id, read_at, question, answer, correct")
          .eq("restaurant_id", restaurant.id).eq("date", today),
      ]);
      if (!alive) return;
      setMembers(m.data || []);
      setReads(r.data || []);
    })();
    return () => { alive = false; };
  }, [restaurant?.id, today, brief?.updated_at]);

  const rows = useMemo(() => {
    const byId = new Map(reads.map((x) => [x.team_member_id, x]));
    return (members || [])
      .map((m) => ({
        id: m.id,
        name: m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim(),
        read: byId.get(m.id) || null,
      }))
      .sort((a, b) => (a.read ? 1 : 0) - (b.read ? 1 : 0)); // unread first — that's the to-do
  }, [members, reads]);

  if (!hasBrief) return null;
  if (members === null) return <p className="text-[11px] text-[#8a8aa0] py-3 text-center">טוען…</p>;
  if (!rows.length) return null;

  const readCount = rows.filter((r) => r.read).length;
  const wrongCount = rows.filter((r) => r.read?.correct === false).length;

  return (
    <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b]">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-black text-[#eef0f6]">מי קרא את הבריף</p>
        <span className="text-[11px] font-black text-[#6d5efc]">{readCount}/{rows.length}</span>
      </div>
      <p className="text-[10px] text-[#8a8aa0] font-bold mb-3">
        אישור נרשם רק אחרי שהמלצר ענה על שאלה מתוך הבריף — לא בכניסה לאפליקציה
        {wrongCount > 0 && ` · ${wrongCount} ענו לא נכון`}
      </p>

      <div className="space-y-1.5">
        {rows.map((r) => {
          const state = !r.read ? "none" : r.read.correct === false ? "wrong" : "ok";
          return (
            <div
              key={r.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                state === "ok" ? "bg-[#15302b] border-[#0d8066]/50"
                  : state === "wrong" ? "bg-[#3a1d22] border-[#e0315a]/50"
                  : "bg-[#191b1f] border-[#22252b]"
              }`}
            >
              {state === "ok" && <Check size={13} className="text-[#22c08c] flex-shrink-0" />}
              {state === "wrong" && <X size={13} className="text-[#e0315a] flex-shrink-0" />}
              {state === "none" && <Clock size={13} className="text-[#5a5a6e] flex-shrink-0" />}

              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-[#eef0f6] truncate">{r.name}</p>
                {r.read?.question && (
                  <p className="text-[9px] text-[#8a8aa0] truncate">
                    {r.read.question} ⇐ {r.read.answer || "—"}
                  </p>
                )}
              </div>

              <span className={`text-[10px] font-black flex-shrink-0 ${
                state === "ok" ? "text-[#22c08c]" : state === "wrong" ? "text-[#e0315a]" : "text-[#5a5a6e]"
              }`}>
                {state === "none"
                  ? "טרם קרא/ה"
                  : new Date(r.read.read_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>

      {rows.some((r) => r.read?.correct === false) && (
        <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-[#22252b]">
          <HelpCircle size={11} className="text-[#f3c14b] flex-shrink-0 mt-[1px]" />
          <p className="text-[10px] text-[#8a8aa0] leading-relaxed">
            תשובה שגויה = אישרו קריאה בלי לקרוא. שווה לוודא איתם לפני המשמרת.
          </p>
        </div>
      )}
    </div>
  );
}
