import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const db = supabase.schema("menu_app");

// «מבחני תפריט לבדיקה» (יותם, 6.9): מופיע בבית **רק** כשמלצר סיים מבחן תפריט מלא שטרם נבדק.
// המנהל רואה סיכום עם ציון + כל התשובות, ובוחר «להעביר» / «לא להעביר». אין מבחנים ⇒ לא מוצג בכלל.
const fmtWhen = (iso) => new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const LVL = { 2: ["✓", "#22c08c"], 1: ["◐", "#f3c14b"], 0: ["✗", "#e0315a"] };
const answerText = (a) => {
  if (!a) return "";
  if (a.desc !== undefined) return [a.desc, (a.ings || []).join(", "), (a.alls || []).length ? "אלרגיות: " + a.alls.join(", ") : ""].filter(Boolean).join(" · ");
  if (a.typed) return a.typed.join(", ");
  if (a.rec) return a.rec.join(", ");
  if (a.simple) return a.simple.join(" · ");
  return JSON.stringify(a);
};

export default function ExamReview({ restaurantId, teamMembers = [] }) {
  const [pending, setPending] = useState([]);
  const [open, setOpen] = useState(null);      // exam_results.id
  const [answers, setAnswers] = useState({});  // id -> rows
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!restaurantId) return;
    const { data } = await db.from("exam_results").select("id, team_member_id, score, passed, dish_count, taken_at, sitting_id")
      .eq("restaurant_id", restaurantId).eq("category", "general").eq("review_status", "pending").order("taken_at", { ascending: false });
    setPending(data || []);
  };
  useEffect(() => { load(); }, [restaurantId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const openExam = async (r) => {
    if (open === r.id) { setOpen(null); return; }
    setOpen(r.id);
    if (answers[r.id]) return;
    // לפי מזהה הישיבה כשיש (מדויק); חלון הזמן נשאר רק לשורות ישנות מלפני sitting_id.
    let q = db.from("exam_answers").select("dish, question, answer, lvl, created_at").order("created_at");
    if (r.sitting_id) q = q.eq("sitting_id", r.sitting_id);
    else {
      const from = new Date(new Date(r.taken_at).getTime() - 3 * 3600e3).toISOString();
      q = q.eq("team_member_id", r.team_member_id).gte("created_at", from).lte("created_at", r.taken_at);
    }
    const { data } = await q;
    setAnswers((a) => ({ ...a, [r.id]: data || [] }));
  };

  const decide = async (r, status) => {
    setBusy(true);
    // «לא להעביר» חייב לשנות משהו: `passed` נכתב false בהגשה, והאישור כאן הוא שקובע.
    const { error } = await db.from("exam_results").update({ review_status: status, reviewed_at: new Date().toISOString(), passed: status === "passed" }).eq("id", r.id);
    setBusy(false);
    if (error) { console.error("exam review:", error.message); return; }
    setPending((p) => p.filter((x) => x.id !== r.id));
    setOpen(null);
  };

  if (!pending.length) return null;
  const nameOf = (id) => teamMembers.find((m) => m.id === id)?.name || "מלצר";
  return (
    <section className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-black text-[#eef0f6]">🎓 מבחני תפריט לבדיקה</p>
        <span className="text-[12px] font-bold text-[#22c08c]">{pending.length}</span>
      </div>
      {pending.map((r) => (
        <div key={r.id} className="rounded-xl border border-[#22252b] bg-[#101216]/70">
          <button type="button" onClick={() => openExam(r)} className="w-full text-right p-3 flex items-center justify-between">
            <span className="text-[13.5px] font-black text-[#eef0f6]">{nameOf(r.team_member_id)}</span>
            <span className="text-[12px] font-bold text-[#8a8aa0]">{fmtWhen(r.taken_at)} · <b style={{ color: r.score >= 70 ? "#22c08c" : "#f3c14b" }}>{r.score}%</b></span>
          </button>
          {open === r.id && (
            <div className="px-3 pb-3 space-y-2">
              {!answers[r.id] ? <p className="text-[12px] text-[#8a8aa0]">טוען תשובות…</p>
                : !answers[r.id].length ? <p className="text-[12px] text-[#8a8aa0]">אין פירוט תשובות למבחן הזה</p>
                : answers[r.id].map((a, k) => (
                  <p key={k} className="text-[12px] leading-snug text-[#c4c4d4]">
                    <span style={{ color: (LVL[a.lvl] || LVL[0])[1] }}>{(LVL[a.lvl] || LVL[0])[0]}</span> <b className="text-[#eef0f6]">{a.dish || a.question}</b>
                    {answerText(a.answer) ? <span className="text-[#8a8aa0]"> — {answerText(a.answer)}</span> : null}
                  </p>
                ))}
              <div className="flex gap-2 pt-1">
                <button disabled={busy} onClick={() => decide(r, "passed")} className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-[#22c08c] text-[#06231a] font-black text-[13px]">להעביר ✓</button>
                <button disabled={busy} onClick={() => decide(r, "failed")} className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-[#3a1d22] text-[#ff8098] font-black text-[13px]">לא להעביר</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
