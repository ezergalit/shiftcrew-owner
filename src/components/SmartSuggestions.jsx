import { useEffect, useState } from "react";
import { Star, X, Lightbulb } from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");

// Feature 1 of the optimization round: the app reads what the team data already says —
// which dishes most of the team keeps getting wrong, which exam categories keep failing —
// and turns it into a card the owner APPROVES, instead of a settings screen the owner has
// to operate. Same pattern as BriefAssistant: nothing changes without the tap.
//
// A suggestion's approve action is always the same primitive: star the dish(es), which
// gives them learning priority in the waiter app. Dismissals live in localStorage so a
// declined suggestion doesn't nag on every visit — but a NEW weak dish makes a new key.
const dismissKey = (rid, id) => `menu-app-suggestion-dismissed:${rid}:${id}`;

export default function SmartSuggestions({ restaurant, items, onStarred }) {
  const [suggestions, setSuggestions] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!restaurant?.id || !items?.length) return;

      const { data: members, error: mErr } = await db.from("team_members")
        .select("id").eq("restaurant_id", restaurant.id);
      if (mErr || !members || members.length < 2) return; // one waiter's struggles aren't a team signal

      const memberIds = members.map((m) => m.id);
      const { data: progress, error: pErr } = await db.from("menu_progress")
        .select("team_member_id, source_item_id, mastery")
        .in("team_member_id", memberIds);
      if (pErr) { console.error("suggestions: progress load failed:", pErr); return; }

      const found = [];

      // Weak dish: most of the team touched it and still isn't past mastery 2.
      const byDish = new Map();
      for (const row of progress || []) {
        const s = byDish.get(row.source_item_id) || { touched: 0, low: 0 };
        s.touched += 1;
        if (row.mastery <= 2) s.low += 1;
        byDish.set(row.source_item_id, s);
      }
      const weak = [...byDish.entries()]
        .map(([id, s]) => ({ id, ...s, item: items.find((i) => i.id === id) }))
        .filter((x) => x.item && !x.item.starred && x.touched >= Math.ceil(memberIds.length / 2) && x.low / x.touched >= 0.6)
        .sort((a, b) => b.low / b.touched - a.low / a.touched);
      if (weak[0]) {
        const w = weak[0];
        found.push({
          id: `weak-dish:${w.id}`,
          text: `${w.low} מתוך ${w.touched} בצוות עדיין מתקשים ב"${w.item.name}"`,
          action: "להדגיש אותה בלימוד?",
          dishIds: [w.id],
        });
      }

      // Failing exam category: the latest exam per member in a category mostly fails.
      const { data: exams, error: eErr } = await db.from("exam_results")
        .select("team_member_id, category, passed, taken_at")
        .in("team_member_id", memberIds)
        .order("taken_at", { ascending: false });
      if (!eErr && exams?.length) {
        const latest = new Map(); // `${member}:${category}` -> passed (first seen = latest)
        for (const e of exams) {
          const k = `${e.team_member_id}:${e.category}`;
          if (!latest.has(k)) latest.set(k, e);
        }
        const byCat = new Map();
        for (const e of latest.values()) {
          const s = byCat.get(e.category) || { total: 0, failed: 0 };
          s.total += 1;
          if (!e.passed) s.failed += 1;
          byCat.set(e.category, s);
        }
        const failing = [...byCat.entries()]
          .filter(([, s]) => s.total >= 2 && s.failed / s.total >= 0.6)
          .sort((a, b) => b[1].failed / b[1].total - a[1].failed / a[1].total)[0];
        if (failing) {
          const [cat, s] = failing;
          // Star the weakest unstarred dishes of that category, up to three.
          const catItems = items.filter((i) => i.category === cat && !i.starred);
          const weakest = catItems
            .map((i) => ({ i, stat: byDish.get(i.id) || { touched: 0, low: 0 } }))
            .sort((a, b) => (b.stat.low || 0) - (a.stat.low || 0))
            .slice(0, 3)
            .map((x) => x.i);
          if (weakest.length) {
            found.push({
              id: `weak-cat:${cat}`,
              text: `${s.failed} מתוך ${s.total} מבחנים אחרונים ב"${cat}" נכשלו`,
              action: `להדגיש את ${weakest.length === 1 ? `"${weakest[0].name}"` : `${weakest.length} המנות החלשות בקטגוריה`}?`,
              dishIds: weakest.map((i) => i.id),
            });
          }
        }
      }

      if (!alive) return;
      setSuggestions(found.filter((f) => !localStorage.getItem(dismissKey(restaurant.id, f.id))).slice(0, 2));
    })();
    return () => { alive = false; };
  }, [restaurant?.id, items]);

  const approve = async (s) => {
    setBusyId(s.id);
    const { error } = await db.from("menu_items").update({ starred: true }).in("id", s.dishIds);
    setBusyId(null);
    if (error) { console.error("suggestion approve failed:", error); return; }
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    onStarred?.(s.dishIds);
  };

  const dismiss = (s) => {
    localStorage.setItem(dismissKey(restaurant.id, s.id), "1");
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
  };

  if (!suggestions.length) return null;
  return (
    <div className="space-y-2">
      {suggestions.map((s) => (
        <div key={s.id} className="bg-[#16181c] border border-[#f3a712]/40 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <Lightbulb size={15} className="text-[#f3a712] shrink-0 mt-0.5" />
            <p className="flex-1 text-xs text-[#eef0f6] leading-relaxed">
              {s.text} — <span className="font-bold text-[#f3c98b]">{s.action}</span>
            </p>
            <button onClick={() => dismiss(s)} className="text-[#6a6a7e] shrink-0" aria-label="דחיית ההצעה"><X size={14} /></button>
          </div>
          <button
            onClick={() => approve(s)}
            disabled={busyId === s.id}
            className="mt-2 w-full bg-[#f3a712] text-black font-bold py-2 rounded-lg text-xs hover:bg-[#e09a0e] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Star size={13} fill="currentColor" /> {busyId === s.id ? "שומר..." : "כן — הדגישו"}
          </button>
        </div>
      ))}
    </div>
  );
}
