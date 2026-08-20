import { useEffect, useMemo, useState } from "react";
import {
  Sunrise, Utensils, Moon, GraduationCap, ListChecks, Plus, Trash2, X, Check,
  ChevronUp, ChevronDown, Eye, EyeOff, Sparkles, Loader2, AlertTriangle,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");
const todayStr = () => new Date().toISOString().slice(0, 10);

// The shift, as the manager hands it over — opening, service, closing, learning.
//
// Two rules shape this screen, both from the product line "the owner approves, the
// operator builds" (2026-08-14):
//   • The owner picks, they don't compose. Typing a fourteen-line opening checklist from
//     scratch is work nobody does twice, so the library below is the main path and the
//     free-text box is the exception. Everything is editable after it lands.
//   • Group order IS shift order. The waiter app sorts by `position` alone, so positions
//     are renumbered across the whole list on every change (opening → service → closing →
//     learning). Without that, a closing task added on Tuesday shows up above the opening
//     checklist on Wednesday.
//
// `kind` is the group key. The waiter skips `kind === "learning"` because it derives those
// rows from real progress — so this screen never writes that kind, and shows the automatic
// ones as a read-only block instead of letting the owner edit rows that would go nowhere.
const GROUPS = [
  {
    kind: "opening", label: "צ׳קליסט פתיחה", icon: Sunrise, color: "#f3a712",
    hint: "מה חייב לקרות לפני שהדלת נפתחת",
  },
  {
    kind: "shift", label: "במהלך המשמרת", icon: Utensils, color: "#6d5efc",
    hint: "כללי השירות שחוזרים על עצמם בכל שולחן",
  },
  {
    kind: "closing", label: "צ׳קליסט סגירה", icon: Moon, color: "#38bdf8",
    hint: "מה סוגר את הערב לפני שיוצאים",
  },
  {
    kind: "training", label: "לימוד ותפריט", icon: GraduationCap, color: "#22c08c",
    hint: "מה שהצוות מתרגל באפליקציה",
  },
  {
    kind: "other", label: "משימות נוספות", icon: ListChecks, color: "#8a8aa0",
    hint: "משימות ישנות שלא שויכו לאף קבוצה",
  },
];
const GROUP_KINDS = GROUPS.map((g) => g.kind);
const groupOf = (kind) => (GROUP_KINDS.includes(kind) ? kind : "other");

// The library. Deliberately long — an owner should find their own restaurant in here and
// tick boxes, not stare at an empty field and invent a checklist.
const LIBRARY = {
  opening: [
    ["להדליק אורות, מוזיקה ומיזוג", "לוודא שהאזור נעים לסועדים לפני הפתיחה"],
    ["לנגב ולסדר את כל השולחנות", "כולל הרגליים והכיסאות — לא רק המשטח"],
    ["לפרוס סטים: סכו״ם, מפיות וכוסות", ""],
    ["לבדוק את התפריטים", "נקיים, שלמים, בלי דפים חסרים או קרועים"],
    ["למלא מלח, פלפל ושמן זית", ""],
    ["להכין קנקני מים וקרח", ""],
    ["לסדר ולמלא את עמדת המלצרים", "מפיות, קשים, תחתיות, פנקסים"],
    ["לבדוק מלאי כוסות וכלים", "להביא מהמחסן מה שחסר לפני שמתמלאים"],
    ["לעבור על עמדת הבר", "לימונים, קרח, קשיות, בקבוקים פתוחים"],
    ["לוודא ששירותי האורחים נקיים ומצוידים", ""],
    ["לבדוק שהמסופון והקופה עובדים", "כולל נייר לקבלות ועודף בקופה"],
    ["לקבל מהמטבח את החוסרים והמנות המיוחדות", "זה מה שנכנס לעדכון היומי"],
    ["לסדר את הכניסה ואת שילוט החוץ", ""],
    ["לעבור על שיבוץ השולחנות וההזמנות של הערב", ""],
  ],
  shift: [
    ["לקבל כל אורח תוך 30 שניות מהכניסה", "גם אם עסוקים — קשר עין וברכה"],
    ["להגיש מים לשולחן מיד עם הישיבה", ""],
    ["לשאול על אלרגיות לפני קבלת ההזמנה", "שאלה קבועה, בכל שולחן, בלי יוצא מן הכלל"],
    ["להמליץ על מנה מודגשת אחת בכל שולחן", "המנות עם ⭐ בתפריט הן אלה שהמנהל סימן"],
    ["לבדוק שביעות רצון אחרי הביס הראשון", ""],
    ["לפנות צלחות ריקות תוך דקה", ""],
    ["להציע קינוח וקפה לפני החשבון", ""],
    ["לנגב ולסדר שולחן מיד אחרי פינוי", ""],
    ["לוודא שאין מנה שיושבת בחלון מעל 3 דקות", ""],
    ["לרשום חוסרים שהתגלו במהלך המשמרת", ""],
    ["לעדכן את המשמרת הבאה על שולחנות פתוחים", ""],
    ["להקפיד על מראה ייצוגי", "מדים נקיים, סינר מסודר, שיער אסוף"],
  ],
  closing: [
    ["לנקות ולסדר את כל השולחנות", ""],
    ["לאסוף מפות ומפיות לכביסה", ""],
    ["לנגב ולמלא מלח, פלפל ושמן זית לקראת מחר", ""],
    ["לרוקן ולנקות את עמדת המלצרים", ""],
    ["להחזיר כלים, מגשים וכוסות למטבח", ""],
    ["לספור קופה ולסגור משמרת במסופון", ""],
    ["לרוקן פחים ולהוציא אשפה", ""],
    ["לנגב את הבר ולסדר בקבוקים", ""],
    ["לבדוק שהמקררים סגורים", ""],
    ["לכבות ציוד, אורות ומיזוג", ""],
    ["לרשום למנהל חוסרים ותקלות מהערב", ""],
    ["לוודא שדלתות וחלונות נעולים", ""],
    ["לסדר כיסאות ולהכין את המקום למחר", ""],
  ],
  training: [
    ["לתרגל 10 דקות תפריט באפליקציה", "לפני המשמרת או אחריה — העיקר שזה יקרה"],
    ["לחזור על המנות שאתם הכי טועים בהן", "מופיעות באפליקציה במסך המדדים"],
    ["לעבור מבחן קטגוריה אחת השבוע", ""],
    ["לתרגל את לימוד האלרגיות", "השדה היחיד בתפריט שיכול לשלוח אורח לבית חולים"],
    ["ללמוד את הקינוחים ואת ההמלצות עליהם", ""],
    ["לעבור על היינות והמשקאות של הבית", ""],
    ["לדעת את המחירים של חמש המנות הנמכרות", ""],
    ["לעבור על המנות המודגשות ⭐ של המנהל", ""],
  ],
  other: [],
};

// What the waiter app closes on its own, from real progress. Listed here so the tasks
// screen tells the whole truth: the owner sees the full shift, not only the part they
// typed. Read-only on purpose — a tick the app awards for reaching a goal is worth more
// than a row the owner wrote asking for the same thing.
const AUTOMATIC = [
  ["לקרוא את העדכון היומי", "נסגר רק אחרי שהמלצר עונה נכון על שאלת ההבנה"],
  ["ללמוד את המנות החדשות בתפריט", "מופיע מעצמו כשמוסיפים מנות — ונעלם כשלמדו אותן"],
  ["להשלים את יעד הדקות היומי", "היעד נקבע בהגדרות → מה הצוות נבחן עליו"],
];

export default function TasksManager({ restaurant, teamCount = 0 }) {
  const [rows, setRows] = useState(null);        // null = still loading
  const [doneToday, setDoneToday] = useState({}); // task_id -> count of members
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [openGroup, setOpenGroup] = useState("opening");
  const [picker, setPicker] = useState(null);    // kind whose library sheet is open
  const [picked, setPicked] = useState(new Set());
  const [editing, setEditing] = useState(null);  // { id, title, subtitle }
  const [customFor, setCustomFor] = useState(null);
  const [custom, setCustom] = useState({ title: "", subtitle: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!restaurant?.id) return;
      const { data, error } = await db.from("shift_tasks")
        .select("id, title, subtitle, position, kind, active")
        .eq("restaurant_id", restaurant.id)
        .order("position", { ascending: true });
      if (!alive) return;
      // An empty list and a failed load look identical on screen — the team tab shipped
      // that bug for a week (see CLAUDE.md). Say which one it is.
      if (error) { console.error("shift_tasks load failed:", error); setErr("לא הצלחנו לטעון את המשימות. נסו לרענן."); setRows([]); return; }
      setRows(data || []);

      const ids = (data || []).map((r) => r.id);
      if (ids.length) {
        const { data: done } = await db.from("shift_task_done")
          .select("task_id").in("task_id", ids).eq("done_date", todayStr());
        if (!alive) return;
        const counts = {};
        (done || []).forEach((d) => { counts[d.task_id] = (counts[d.task_id] || 0) + 1; });
        setDoneToday(counts);
      }
    })();
    return () => { alive = false; };
  }, [restaurant?.id]);

  const byGroup = useMemo(() => {
    const map = Object.fromEntries(GROUPS.map((g) => [g.kind, []]));
    (rows || []).forEach((r) => map[groupOf(r.kind)].push(r));
    return map;
  }, [rows]);

  const byGroupOf = (list, kind) => list.filter((r) => groupOf(r.kind) === kind);

  // One write for the whole list. Positions are recomputed across every group so the
  // waiter's `order by position` reproduces the shift's real order.
  const persist = async (next) => {
    const ordered = [];
    GROUPS.forEach((g) => byGroupOf(next, g.kind).forEach((r) => ordered.push(r)));
    const renumbered = ordered.map((r, i) => ({ ...r, position: i + 1 }));
    setRows(renumbered);
    setBusy(true);
    setErr("");
    const { error } = await db.from("shift_tasks").upsert(
      renumbered.map((r) => ({
        id: r.id, restaurant_id: restaurant.id, title: r.title,
        subtitle: r.subtitle || null, position: r.position, kind: r.kind, active: r.active,
      }))
    );
    setBusy(false);
    if (error) { console.error("shift_tasks save failed:", error.message, error.details, error.hint, error.code); setErr("השמירה נכשלה. בדקו חיבור ונסו שוב."); }
    return !error;
  };

  const addTasks = async (kind, entries) => {
    if (!entries.length) return;
    const base = (rows || []).length;
    const payload = entries.map(([title, subtitle], i) => ({
      restaurant_id: restaurant.id, title, subtitle: subtitle || null,
      kind, position: base + i + 1, active: true,
    }));
    setBusy(true);
    setErr("");
    const { data, error } = await db.from("shift_tasks").insert(payload).select();
    setBusy(false);
    if (error) { console.error("shift_tasks insert failed:", error.message, error.details, error.hint, error.code); setErr("ההוספה נכשלה. נסו שוב."); return; }
    await persist([...(rows || []), ...(data || [])]);
  };

  const removeTask = async (id) => {
    setBusy(true);
    const { error } = await db.from("shift_tasks").delete().eq("id", id);
    setBusy(false);
    if (error) { console.error("shift_tasks delete failed:", error.message, error.details, error.hint, error.code); setErr("המחיקה נכשלה."); return; }
    await persist((rows || []).filter((r) => r.id !== id));
  };

  const move = async (kind, index, dir) => {
    const group = byGroup[kind];
    const target = index + dir;
    if (target < 0 || target >= group.length) return;
    const reordered = [...group];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const others = (rows || []).filter((r) => groupOf(r.kind) !== kind);
    await persist([...others, ...reordered]);
  };

  const toggleActive = async (row) => {
    await persist((rows || []).map((r) => (r.id === row.id ? { ...r, active: !r.active } : r)));
  };

  const saveEdit = async () => {
    const t = editing.title.trim();
    if (!t) return;
    await persist((rows || []).map((r) => (r.id === editing.id ? { ...r, title: t, subtitle: editing.subtitle.trim() } : r)));
    setEditing(null);
  };

  const activeCount = (rows || []).filter((r) => r.active).length;

  if (rows === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[#8a8aa0]">
        <Loader2 size={16} className="animate-spin" /> <span className="text-xs font-bold">טוען משימות…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
        <p className="text-sm font-black text-[#eef0f6]">המשימות שהצוות רואה</p>
        <p className="text-[11px] text-[#8a8aa0] leading-relaxed mt-1">
          כל משימה שתפעילו כאן מופיעה לכל חבר צוות באפליקציה שלו כרשימה מסומנת ליום הזה.
          בוחרים מהספרייה — ואפשר לערוך כל אחת אחר כך.
        </p>
        <div className="flex gap-2 mt-3">
          <span className="text-[11px] font-black text-[#22c08c] bg-[#22c08c]/10 border border-[#22c08c]/25 px-2.5 py-1 rounded-full">
            {activeCount} משימות פעילות
          </span>
          {teamCount > 0 && (
            <span className="text-[11px] font-black text-[#8a8aa0] bg-[#20232b] px-2.5 py-1 rounded-full">
              {teamCount} חברי צוות
            </span>
          )}
        </div>
      </div>

      {err && (
        <p className="text-[11px] font-bold text-[#e0315a] flex items-start gap-1.5 px-1 leading-relaxed">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {err}
        </p>
      )}

      <div className="bg-[#16181c] border border-[#22252b] rounded-2xl overflow-hidden">
        {GROUPS.map((g) => {
          const list = byGroup[g.kind];
          // The fallback group is a migration aid, not a feature — hide it when empty.
          if (g.kind === "other" && list.length === 0) return null;
          const open = openGroup === g.kind;
          const on = list.filter((r) => r.active).length;
          const Icon = g.icon;
          return (
            <div key={g.kind} className={`border-b border-[#1e2128] last:border-b-0 ${open ? "bg-[#1a1d23]" : ""}`}>
              <button
                onClick={() => setOpenGroup(open ? null : g.kind)}
                aria-expanded={open}
                className="w-full flex items-center gap-3 p-3.5 text-right hover:bg-[#1a1d23] transition"
              >
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${g.color}22` }}
                >
                  <Icon size={15} style={{ color: g.color }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-black text-[#eef0f6]">{g.label}</span>
                  <span className={`block text-[10.5px] mt-0.5 leading-snug ${open ? "text-[#a79bff]" : "text-[#5a5a6e] truncate"}`}>
                    {on > 0 ? `${on} משימות פעילות · ${g.hint}` : g.hint}
                  </span>
                </span>
                <ChevronDown size={15} className={`flex-shrink-0 transition-transform ${open ? "rotate-180 text-[#a79bff]" : "text-[#5a5a6e]"}`} />
              </button>

              {open && (
                <div className="px-3.5 pb-3.5 space-y-2">
                  {g.kind === "training" && (
                    <div className="bg-[#0c0d10] border border-[#22c08c]/25 rounded-xl p-3 space-y-2">
                      <p className="text-[11px] font-black text-[#22c08c] flex items-center gap-1.5">
                        <Sparkles size={12} /> האפליקציה סוגרת את אלה לבד
                      </p>
                      {AUTOMATIC.map(([t, s]) => (
                        <div key={t} className="flex items-start gap-2">
                          <Check size={12} className="text-[#22c08c] shrink-0 mt-[3px]" />
                          <span className="min-w-0">
                            <span className="block text-[11.5px] font-bold text-[#eef0f6] leading-snug">{t}</span>
                            {s && <span className="block text-[10px] text-[#5a5a6e] leading-snug mt-0.5">{s}</span>}
                          </span>
                        </div>
                      ))}
                      <p className="text-[10px] text-[#5a5a6e] leading-relaxed pt-0.5">
                        הן מופיעות אצל המלצר רק כשיש בהן תוכן, ונסגרות מהתקדמות אמיתית — לא מלחיצה על תיבה.
                      </p>
                    </div>
                  )}

                  {list.length === 0 && g.kind !== "other" && (
                    <p className="text-[11.5px] text-[#8a8aa0] text-center py-3 leading-relaxed">
                      אין כאן עדיין משימות. הוסיפו מהספרייה למטה — זה לוקח חצי דקה.
                    </p>
                  )}

                  {list.map((r, i) => (
                    <div
                      key={r.id}
                      className={`rounded-xl border p-2.5 ${r.active ? "bg-[#16181c] border-[#22252b]" : "bg-[#131519] border-[#1e2128]"}`}
                    >
                      {editing?.id === r.id ? (
                        <div className="space-y-2">
                          <input
                            value={editing.title}
                            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-2.5 py-2 text-[13px] text-[#eef0f6] focus:outline-none focus:border-[#6d5efc]"
                            dir="rtl"
                          />
                          <input
                            value={editing.subtitle}
                            onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                            placeholder="פירוט (לא חובה) — מה שהמלצר יראה כשיפתח את המשימה"
                            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-2.5 py-2 text-[11.5px] text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#6d5efc]"
                            dir="rtl"
                          />
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="flex-1 bg-[#6d5efc] text-white text-[11px] font-black py-2 rounded-lg">שמירה</button>
                            <button onClick={() => setEditing(null)} className="px-4 bg-[#22252b] text-[#8a8aa0] text-[11px] font-black py-2 rounded-lg">ביטול</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <span className="flex flex-col gap-0.5 flex-shrink-0 pt-0.5">
                            <button
                              onClick={() => move(g.kind, i, -1)}
                              disabled={i === 0}
                              aria-label="הזזה למעלה"
                              className="w-6 h-5 rounded bg-[#20232b] text-[#8a8aa0] flex items-center justify-center disabled:opacity-25"
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button
                              onClick={() => move(g.kind, i, 1)}
                              disabled={i === list.length - 1}
                              aria-label="הזזה למטה"
                              className="w-6 h-5 rounded bg-[#20232b] text-[#8a8aa0] flex items-center justify-center disabled:opacity-25"
                            >
                              <ChevronDown size={12} />
                            </button>
                          </span>
                          <button
                            onClick={() => setEditing({ id: r.id, title: r.title, subtitle: r.subtitle || "" })}
                            className="flex-1 min-w-0 text-right"
                          >
                            <span className={`block text-[12.5px] font-bold leading-snug ${r.active ? "text-[#eef0f6]" : "text-[#5a5a6e] line-through"}`}>
                              {r.title}
                            </span>
                            {r.subtitle && (
                              <span className="block text-[10.5px] text-[#8a8aa0] leading-snug mt-0.5">{r.subtitle}</span>
                            )}
                            {r.active && doneToday[r.id] > 0 && (
                              <span className="inline-block text-[10px] font-black text-[#22c08c] mt-1">
                                ✓ {doneToday[r.id]}{teamCount ? `/${teamCount}` : ""} סימנו היום
                              </span>
                            )}
                          </button>
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => toggleActive(r)}
                              title={r.active ? "להסתיר מהצוות" : "להציג לצוות"}
                              aria-label={r.active ? "להסתיר מהצוות" : "להציג לצוות"}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center ${r.active ? "bg-[#20232b] text-[#8a8aa0]" : "bg-[#20232b] text-[#5a5a6e]"}`}
                            >
                              {r.active ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                            <button
                              onClick={() => removeTask(r.id)}
                              title="מחיקה"
                              aria-label="מחיקת המשימה"
                              className="w-7 h-7 rounded-lg bg-[#20232b] text-[#e0315a] flex items-center justify-center"
                            >
                              <Trash2 size={13} />
                            </button>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}

                  {g.kind !== "other" && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setPicker(g.kind); setPicked(new Set()); }}
                        className="flex-1 text-[11.5px] font-black py-2.5 rounded-xl border transition"
                        style={{ color: g.color, borderColor: `${g.color}55`, background: `${g.color}12` }}
                      >
                        <Plus size={13} className="inline ml-1" /> הוספה מהספרייה
                      </button>
                      <button
                        onClick={() => { setCustomFor(g.kind); setCustom({ title: "", subtitle: "" }); }}
                        className="px-3 text-[11.5px] font-black py-2.5 rounded-xl bg-[#20232b] text-[#8a8aa0]"
                      >
                        משימה משלכם
                      </button>
                    </div>
                  )}

                  {customFor === g.kind && (
                    <div className="bg-[#0c0d10] border border-[#22252b] rounded-xl p-3 space-y-2">
                      <input
                        value={custom.title}
                        onChange={(e) => setCustom({ ...custom, title: e.target.value })}
                        placeholder="מה המשימה? למשל: לבדוק שהמקרר של הקינוחים מלא"
                        className="w-full bg-[#16181c] border border-[#22252b] rounded-lg px-2.5 py-2 text-[12.5px] text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#6d5efc]"
                        dir="rtl"
                        autoFocus
                      />
                      <input
                        value={custom.subtitle}
                        onChange={(e) => setCustom({ ...custom, subtitle: e.target.value })}
                        placeholder="פירוט (לא חובה)"
                        className="w-full bg-[#16181c] border border-[#22252b] rounded-lg px-2.5 py-2 text-[11.5px] text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#6d5efc]"
                        dir="rtl"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!custom.title.trim()) return;
                            await addTasks(g.kind, [[custom.title.trim(), custom.subtitle.trim()]]);
                            setCustomFor(null);
                          }}
                          disabled={busy || !custom.title.trim()}
                          className="flex-1 bg-[#6d5efc] text-white text-[11.5px] font-black py-2 rounded-lg disabled:opacity-40"
                        >
                          הוספה
                        </button>
                        <button onClick={() => setCustomFor(null)} className="px-4 bg-[#22252b] text-[#8a8aa0] text-[11.5px] font-black py-2 rounded-lg">
                          ביטול
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* The library sheet. Titles already on the list are shown as taken rather than
          hidden — an owner scanning for "did I already add this?" should find the answer
          in the same place they'd add it. */}
      {picker && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" dir="rtl">
          <div className="w-full max-w-md bg-[#16181c] border-t border-[#22252b] rounded-t-2xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-[#22252b] flex items-center gap-3 flex-shrink-0">
              <p className="flex-1 text-sm font-black text-[#eef0f6]">
                {GROUPS.find((g) => g.kind === picker)?.label} — מה להוסיף?
              </p>
              <button onClick={() => setPicker(null)} className="text-[#8a8aa0]" aria-label="סגירה"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {LIBRARY[picker].map(([title, sub]) => {
                const taken = (rows || []).some((r) => r.title === title);
                const on = picked.has(title);
                return (
                  <button
                    key={title}
                    disabled={taken}
                    onClick={() => {
                      const next = new Set(picked);
                      on ? next.delete(title) : next.add(title);
                      setPicked(next);
                    }}
                    className={`w-full text-right rounded-xl p-2.5 border flex items-start gap-2.5 transition ${
                      taken ? "bg-[#131519] border-[#1e2128] opacity-60"
                        : on ? "bg-[#6d5efc]/15 border-[#6d5efc]" : "bg-[#0c0d10] border-[#22252b]"
                    }`}
                  >
                    <span className={`w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      taken ? "bg-[#22252b] text-[#5a5a6e]" : on ? "bg-[#6d5efc] text-white" : "border border-[#3a3d46]"
                    }`}>
                      {(taken || on) && <Check size={12} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12.5px] font-bold text-[#eef0f6] leading-snug">{title}</span>
                      {sub && <span className="block text-[10.5px] text-[#8a8aa0] leading-snug mt-0.5">{sub}</span>}
                      {taken && <span className="block text-[10px] font-black text-[#5a5a6e] mt-0.5">כבר ברשימה</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-[#22252b] flex-shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                onClick={async () => {
                  const entries = LIBRARY[picker].filter(([t]) => picked.has(t));
                  const kind = picker;
                  setPicker(null);
                  await addTasks(kind, entries);
                }}
                disabled={picked.size === 0 || busy}
                className="w-full bg-[#6d5efc] text-white font-black py-3 min-h-[44px] rounded-xl text-sm disabled:opacity-40"
              >
                {picked.size === 0 ? "בחרו משימות להוספה" : `הוספת ${picked.size} משימות`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
