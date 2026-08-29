import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, ChevronDown, Check, Info, Loader2, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { FACET_META, RECOMMENDED_FACETS, facetsForMenu, DEFAULT_PATH } from "../lib/examFacets";

const catCount = (cat, n) => {
  const card = (cat || "").startsWith("הדרכת");
  if (n === 1) return card ? "כרטיס אחד" : "מנה אחת";
  return `${n} ${card ? "כרטיסים" : "מנות"}`;
};

const db = supabase.schema("menu_app");

// Where the owner decides what their team is tested on and how the path is paced.
//
// Two rules shape this screen:
//  1. Only offer what THIS menu can support. A restaurant with no prices never sees a
//     "price" row to rank — ranking it would just produce questions that never appear.
//  2. Everything starts on our recommendation, clearly labelled as ours. An owner who
//     changes nothing still gets a sensible path; an owner who disagrees can see exactly
//     what they are overriding.

const shortCat = (c) => String(c || "").split(/\s*[—–]\s*/)[0].trim();
const snapshot = (ranked, catOrder, path) => JSON.stringify({ ranked, catOrder, path });

export default function LearningPathSettings({ restaurant, items, onSaved , bottomOffset = 74 }) {
  const menuCategories = useMemo(() => {
    const seen = [];
    for (const d of items || []) if (d.category && !seen.includes(d.category)) seen.push(d.category);
    return seen;
  }, [items]);

  const supported = useMemo(() => facetsForMenu(items), [items]);
  const unsupported = RECOMMENDED_FACETS.filter((k) => !supported.includes(k));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");
  // A snapshot of what is actually in the database, so "unsaved changes" is a fact rather
  // than a flag someone forgot to clear. Toggling a setting off and back on correctly
  // reports nothing to save.
  const [persisted, setPersisted] = useState("");
  // The scariest screen in the app, folded to one sentence for the common case: when the
  // config matches our recommendation there is nothing to decide, so show that — the
  // ranking and reorder tools open only on request. A CUSTOMIZED config always shows in
  // full; hiding an owner's own choices behind a button would misreport their setup.
  const [advanced, setAdvanced] = useState(false);
  const [ranked, setRanked] = useState([]);     // ordered facet keys the owner tests on
  const [disabled, setDisabled] = useState([]); // supported but deliberately switched off
  const [catOrder, setCatOrder] = useState([]);
  const [path, setPath] = useState(DEFAULT_PATH);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await db.from("exam_config").select("*").eq("restaurant_id", restaurant.id).maybeSingle();
      if (!alive) return;
      const savedFacets = (data?.facets || []).filter((f) => supported.includes(f));
      setRanked(savedFacets.length ? savedFacets : supported);
      setDisabled(savedFacets.length ? supported.filter((f) => !savedFacets.includes(f)) : []);
      const savedCats = (data?.category_order || []).filter((c) => menuCategories.includes(c));
      setCatOrder([...savedCats, ...menuCategories.filter((c) => !savedCats.includes(c))]);
      const loadedRanked = savedFacets.length ? savedFacets : supported;
      const loadedCats = [...savedCats, ...menuCategories.filter((c) => !savedCats.includes(c))];
      const loadedPath = {
        pass_threshold: data?.pass_threshold ?? DEFAULT_PATH.pass_threshold,
        gate_games: data?.gate_games ?? DEFAULT_PATH.gate_games,
        daily_goal_minutes: data?.daily_goal_minutes ?? DEFAULT_PATH.daily_goal_minutes,
        general_exam_questions: data?.general_exam_questions ?? DEFAULT_PATH.general_exam_questions,
        baseline_enabled: data?.baseline_enabled ?? DEFAULT_PATH.baseline_enabled,
        baseline_minutes: data?.baseline_minutes ?? DEFAULT_PATH.baseline_minutes,
      };
      setPath(loadedPath);
      setPersisted(snapshot(loadedRanked, loadedCats, loadedPath));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [restaurant.id, supported.join(","), menuCategories.join("|")]);

  const move = (list, setList) => (idx, dir) => {
    const next = [...list];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    setList(next);
    setSavedAt(null);
  };
  const moveFacet = move(ranked, setRanked);
  const moveCat = move(catOrder, setCatOrder);

  const toggleFacet = (key) => {
    setSavedAt(null);
    if (ranked.includes(key)) {
      // Never leave the team with nothing to be tested on.
      if (ranked.length === 1) return;
      setRanked(ranked.filter((k) => k !== key));
      setDisabled([...disabled, key]);
    } else {
      setDisabled(disabled.filter((k) => k !== key));
      setRanked([...ranked, key]);
    }
  };

  const resetToRecommended = () => {
    setRanked(supported);
    setDisabled([]);
    setPath(DEFAULT_PATH);
    setSavedAt(null);
  };

  const isRecommended =
    JSON.stringify(ranked) === JSON.stringify(supported) &&
    path.pass_threshold === DEFAULT_PATH.pass_threshold &&
    path.gate_games === DEFAULT_PATH.gate_games &&
    path.daily_goal_minutes === DEFAULT_PATH.daily_goal_minutes &&
    path.general_exam_questions === DEFAULT_PATH.general_exam_questions &&
    path.baseline_enabled === DEFAULT_PATH.baseline_enabled &&
    path.baseline_minutes === DEFAULT_PATH.baseline_minutes;

  const dirty = !loading && snapshot(ranked, catOrder, path) !== persisted;

  // The confirmation is news for a moment, then it is clutter sitting over the screen.
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 3000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const save = async () => {
    setSaving(true); setError("");
    const { error: err } = await db.from("exam_config").upsert({
      restaurant_id: restaurant.id,
      facets: ranked,
      category_order: catOrder,
      ...path,
      updated_at: new Date().toISOString(),
    }, { onConflict: "restaurant_id" });
    setSaving(false);
    if (err) { setError(err.message); return; }
    // Only now is it true that the screen matches the database.
    setPersisted(snapshot(ranked, catOrder, path));
    setSavedAt(Date.now());
    onSaved?.();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-[#8a8aa0]" /></div>;

  if (!items?.length) {
    return (
      <Card>
        <p className="font-bold text-[#eef0f6] mb-1">מסלול הלמידה של הצוות</p>
        <p className="text-xs text-[#8a8aa0]">קודם צריך תפריט. הוסיפו מנות בטאב "תפריט" ואז אפשר להגדיר על מה לבחון.</p>
      </Card>
    );
  }

  const showFull = advanced || !isRecommended;

  if (!showFull) {
    return (
      <div className="space-y-3">
        <div className="bg-[#0d1f19] border border-[#22c08c]/40 rounded-xl p-4 space-y-2">
          <p className="text-sm font-black text-[#22c08c] flex items-center gap-1.5">
            <Check size={15} /> הכל מוגדר לפי ההמלצה שלנו
          </p>
          <p className="text-xs text-[#c4c4d4] leading-relaxed">
            הצוות נבחן על: {ranked.map((k) => FACET_META[k].label).join(" · ")}.
          </p>
          <p className="text-[11px] text-[#8a8aa0] leading-relaxed">
            סף מעבר {path.pass_threshold}% · יעד יומי {path.daily_goal_minutes} דק׳ ·
            מבחן התפריט המלא {path.general_exam_questions} שאלות.
          </p>
        </div>
        <button
          onClick={() => setAdvanced(true)}
          className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#16181c] border border-[#22252b] text-[#a79bff] text-xs font-black"
        >
          שינוי מתקדם — דירוג נושאים, סדר לימוד וספים
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-bold text-[#eef0f6]">על מה לבחון את הצוות?</p>
          {!isRecommended && (
            <button onClick={resetToRecommended} className="text-[11px] text-[#6d5efc] font-bold flex-shrink-0">
              חזרה להמלצה
            </button>
          )}
        </div>
        <p className="text-xs text-[#8a8aa0] mb-3">
          סדרו לפי חשיבות — מה שלמעלה ייבחן הכי הרבה. אפשר גם לכבות מה שלא רלוונטי לכם.
          {isRecommended && <span className="text-[#22c08c] font-bold"> זו ההמלצה שלנו.</span>}
        </p>

        <div className="space-y-1.5">
          {ranked.map((key, idx) => (
            <div key={key} className="bg-[#1c1e22] rounded-lg p-2.5 flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-[#6d5efc] text-white text-[11px] font-black flex items-center justify-center flex-shrink-0">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#eef0f6]">{FACET_META[key].label}</p>
                <p className="text-[10px] text-[#8a8aa0] leading-snug">{FACET_META[key].hint}</p>
              </div>
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button onClick={() => moveFacet(idx, -1)} disabled={idx === 0}
                  className="w-6 h-5 rounded bg-[#22252b] text-[#8a8aa0] disabled:opacity-30 flex items-center justify-center">
                  <ChevronUp size={12} />
                </button>
                <button onClick={() => moveFacet(idx, 1)} disabled={idx === ranked.length - 1}
                  className="w-6 h-5 rounded bg-[#22252b] text-[#8a8aa0] disabled:opacity-30 flex items-center justify-center">
                  <ChevronDown size={12} />
                </button>
              </div>
              <button onClick={() => toggleFacet(key)}
                className="text-[10px] font-bold text-[#8a8aa0] px-2 py-1 rounded bg-[#22252b] flex-shrink-0">כבה</button>
            </div>
          ))}
        </div>

        {disabled.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-bold text-[#8a8aa0]">כבוי — לא ייבחן</p>
            {disabled.map((key) => (
              <div key={key} className="bg-[#141619] rounded-lg p-2.5 flex items-center gap-2 opacity-70">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#8a8aa0]">{FACET_META[key].label}</p>
                </div>
                <button onClick={() => toggleFacet(key)}
                  className="text-[10px] font-bold text-[#6d5efc] px-2 py-1 rounded bg-[#22252b] flex-shrink-0">הפעל</button>
              </div>
            ))}
          </div>
        )}

        {unsupported.length > 0 && (
          <div className="mt-3 bg-[#141619] rounded-lg p-2.5">
            <p className="text-[10px] font-bold text-[#8a8aa0] mb-1.5 flex items-center gap-1">
              <Info size={11} /> לא זמין בתפריט הנוכחי
            </p>
            {unsupported.map((key) => (
              <p key={key} className="text-[10px] text-[#6a6a7e] leading-relaxed">
                <span className="font-bold">{FACET_META[key].label}</span> — {FACET_META[key].missing}
              </p>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <p className="font-bold text-[#eef0f6] mb-1">סדר הלימוד</p>
        <p className="text-xs text-[#8a8aa0] mb-3">
          המלצרים לומדים חלק אחד בכל פעם, לפי הסדר הזה. כדאי להתחיל במה שהכי מזמינים.
        </p>
        <div className="space-y-1.5">
          {catOrder.map((c, idx) => (
            <div key={c} className="bg-[#1c1e22] rounded-lg p-2.5 flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-[#22252b] text-[#8a8aa0] text-[11px] font-black flex items-center justify-center flex-shrink-0">
                {idx + 1}
              </span>
              <p className="text-xs font-bold text-[#eef0f6] flex-1 min-w-0 truncate" title={c}>{shortCat(c)}</p>
              <span className="text-[10px] text-[#8a8aa0] flex-shrink-0">
                {catCount(c, (items || []).filter((d) => d.category === c).length)}
              </span>
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button onClick={() => moveCat(idx, -1)} disabled={idx === 0}
                  className="w-6 h-5 rounded bg-[#22252b] text-[#8a8aa0] disabled:opacity-30 flex items-center justify-center">
                  <ChevronUp size={12} />
                </button>
                <button onClick={() => moveCat(idx, 1)} disabled={idx === catOrder.length - 1}
                  className="w-6 h-5 rounded bg-[#22252b] text-[#8a8aa0] disabled:opacity-30 flex items-center justify-center">
                  <ChevronDown size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="font-bold text-[#eef0f6] mb-3">איך המסלול מתקדם</p>

        {/* The daily goal the waiter sees as a ring on their home screen. Minutes, not
            dishes: time is the thing a waiter can actually commit to before a shift, and
            it is the restaurant's call — a busy kitchen wants 10, a new opening more. */}
        <Setting
          title="יעד לימוד יומי"
          desc={`הצוות רואה טבעת התקדמות בבית — ${path.daily_goal_minutes} דקות לימוד ביום. מומלץ 10-15.`}
        >
          <div className="flex gap-1.5">
            {[5, 10, 15, 20].map((v) => (
              <button key={v} onClick={() => { setPath({ ...path, daily_goal_minutes: v }); setSavedAt(null); }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${
                  path.daily_goal_minutes === v ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#8a8aa0]"}`}>
                {v}{v === 10 && " ★"}
              </button>
            ))}
          </div>
        </Setting>

        {/* The whole-menu final exam: how many timed questions it asks. This is the goal
            the team's tutorial points at — everything else is training for it. */}
        <Setting
          title="מבחן התפריט המלא"
          desc={`המבחן המסכם על כל התפריט — ${path.general_exam_questions} שאלות עם שעון. זו המטרה שהצוות מתאמן לקראתה.`}
        >
          <div className="flex gap-1.5">
            {[20, 30, 40, 60].map((v) => (
              <button key={v} onClick={() => { setPath({ ...path, general_exam_questions: v }); setSavedAt(null); }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${
                  path.general_exam_questions === v ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#8a8aa0]"}`}>
                {v}{v === 40 && " ★"}
              </button>
            ))}
          </div>
        </Setting>

        {/* ⚠️ This toggle no longer gates ACCESS — the staged chain was removed (see the
            waiter app's learningPath.js). It controls SCOPE: whether practice draws only
            from categories the waiter has passed, or from the whole menu. The old copy
            promised locking that no longer happens. */}
        <Setting
          title="תרגול לפי מה שנלמד"
          desc={path.gate_games
            ? "התרגול נבנה רק מהחלקים שהמלצר כבר עבר עליהם מבחן. כל מבחן שעובר מרחיב את התרגול. זו ההמלצה שלנו."
            : "התרגול מושך מכל התפריט מההתחלה, גם מחלקים שהמלצר עוד לא נבחן עליהם."}
        >
          <Toggle on={path.gate_games} onClick={() => { setPath({ ...path, gate_games: !path.gate_games }); setSavedAt(null); }} />
        </Setting>

        {/* Applies whether or not practice is scoped: it is the only real gate left, and
            it just means "study a little before being examined". */}
        {(
          <Setting title="כמה צריך לדעת כדי להיבחן" desc={`מלצר נבחן על חלק בתפריט אחרי שהגיע ל-${path.pass_threshold}% ידע בו.`}>
            <div className="flex gap-1.5">
              {[30, 50, 70].map((v) => (
                <button key={v} onClick={() => { setPath({ ...path, pass_threshold: v }); setSavedAt(null); }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${
                    path.pass_threshold === v ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#8a8aa0]"}`}>
                  {v}%{v === 50 && " ★"}
                </button>
              ))}
            </div>
          </Setting>
        )}

        <Setting
          title="בוחן היכרות למלצר חדש"
          desc={path.baseline_enabled
            ? `מלצר חדש עונה על כמה שאלות על עצמו ואז נבחן ${path.baseline_minutes} דקות, כדי שתדעו איפה הוא מתחיל.`
            : "מלצרים חדשים נכנסים ישר ללימוד, בלי נקודת מדידה התחלתית."}
        >
          <Toggle on={path.baseline_enabled} onClick={() => { setPath({ ...path, baseline_enabled: !path.baseline_enabled }); setSavedAt(null); }} />
        </Setting>

        {path.baseline_enabled && (
          <Setting title="אורך בוחן ההיכרות" desc="">
            <div className="flex gap-1.5">
              {[5, 7, 10].map((v) => (
                <button key={v} onClick={() => { setPath({ ...path, baseline_minutes: v }); setSavedAt(null); }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${
                    path.baseline_minutes === v ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#8a8aa0]"}`}>
                  {v} דק'{v === 7 && " ★"}
                </button>
              ))}
            </div>
          </Setting>
        )}

        <p className="text-[10px] text-[#6a6a7e] mt-2 flex items-center gap-1"><Sparkles size={10} /> ★ = ההמלצה שלנו</p>
      </Card>

      {error && <p className="text-xs text-[#e0315a] px-1">{error}</p>}

      {/* ⚠️ The save button used to be a plain button at the very bottom of a very long
          panel — scrolled off-screen, so a change looked like it had simply not taken
          ("לא רואים את הכפתור שמירה"). It is sticky now: the moment anything changes, the
          bar rides the bottom of the screen until the change is saved or undone.
          `dirty` is computed by comparing against what's actually in the database, so
          flipping a switch and flipping it back correctly reports nothing to save. */}
      {/* ⚠️ `fixed`, not `sticky`. The settings sections are wrapped in a rounded card with
          `overflow-hidden`, and an overflow-hidden ancestor silently disables position:
          sticky — the bar simply never appeared. Fixed is immune to that, and sits just
          above the bottom nav. */}
      {/* 🔴 And portalled to <body>. `fixed` only escapes an overflow-hidden ancestor — it
          does NOT escape one with `backdrop-filter`, which makes that ancestor the
          containing block instead of the viewport. Under the «אורורה» skin every card
          surface carries it, so this bar was being laid out 3,712px down inside the panel:
          the manager changed a setting and the save button was three screens below the
          fold, so the change silently never saved. Measured, not guessed. Same trap as the
          bottom nav, the dish-photo zoom and the waiter's sign-out dialog. */}
      {/* ⚠️ The offset is a prop, not a literal: the «אורורה» tab strip is ~108px tall,
          not 74, so the hard-coded value put the bar 34px underneath it. Measured. */}
      {createPortal(
      <div className="fixed inset-x-0 z-40 max-w-md mx-auto px-4 pointer-events-none"
           style={{ bottom: `${bottomOffset}px` }}>
        {dirty ? (
          <div
            className="rounded-xl border border-[#6d5efc] p-2.5 flex items-center gap-2.5 shadow-xl shadow-black/70 pointer-events-auto"
            style={{ background: "linear-gradient(135deg,#241f4d,#1a1730)" }}
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-black text-[#eef0f6]">יש שינויים שלא נשמרו</span>
              <span className="block text-[10px] text-[#a79bff] mt-0.5">הצוות יראה אותם רק אחרי שמירה</span>
            </span>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2.5 min-h-[44px] rounded-lg font-black text-[13px] text-white flex items-center justify-center gap-1.5 flex-shrink-0 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {saving ? "שומר…" : "שמירה"}
            </button>
          </div>
        ) : savedAt ? (
          <div className="rounded-xl border border-[#22c08c]/40 bg-[#0d1f19] p-2.5 flex items-center gap-2 shadow-xl shadow-black/70 pointer-events-auto">
            <Check size={15} className="text-[#22c08c] flex-shrink-0" />
            <p className="text-[12px] font-black text-[#22c08c]">נשמר — הצוות מתעדכן מיד</p>
          </div>
        ) : null}
      </div>,
      document.body
      )}
    </div>
  );
}

const Card = ({ children }) => (
  <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b]">{children}</div>
);

const Setting = ({ title, desc, children }) => (
  <div className="py-2.5 border-b border-[#22252b] last:border-0">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-[#eef0f6]">{title}</p>
        {desc && <p className="text-[10px] text-[#8a8aa0] leading-relaxed mt-0.5">{desc}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  </div>
);

const Toggle = ({ on, onClick }) => (
  <button onClick={onClick} role="switch" aria-checked={on}
    className={`w-11 h-6 rounded-full transition-colors relative ${on ? "bg-[#6d5efc]" : "bg-[#33363d]"}`}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "right-0.5" : "right-[22px]"}`} />
  </button>
);
