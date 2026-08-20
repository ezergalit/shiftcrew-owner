import { useEffect, useMemo, useState } from "react";
import {
  Sunrise, Utensils, Moon, GraduationCap, ListChecks, Plus, Trash2, X, Check,
  ChevronUp, ChevronDown, Eye, EyeOff, Sparkles, Loader2, AlertTriangle,
  CalendarDays, CalendarRange, Repeat,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");
const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => dateStr(new Date());
// Sunday, matching the weekly score reset on the waiter side — one week boundary for the
// whole product, or the two halves would disagree about what "this week" means.
const startOfWeekStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return dateStr(d);
};
const startOfMonthStr = () => {
  const d = new Date();
  return dateStr(new Date(d.getFullYear(), d.getMonth(), 1));
};

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
  // Standing checklists. Same table, same editing — only the period they reset over is
  // different, which is why they are kinds here and not a separate feature.
  {
    kind: "weekly", label: "צ׳קליסט שבועי", icon: CalendarDays, color: "#e0a3ff",
    hint: "חוזר כל שבוע — קבוע, לא צריך להיזכר בו", period: "השבוע",
  },
  {
    kind: "monthly", label: "צ׳קליסט חודשי", icon: CalendarRange, color: "#5eead4",
    hint: "חוזר כל חודש — מלאי, בטיחות, רישיונות", period: "החודש",
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
  // ⚠️ Core-first ordering matters: CORE_COUNT below takes the first N of each list as
  // "the short checklist that already works". Adding a niche item at the top quietly
  // promotes it into every restaurant's starter set.
  opening: [
    ["לנגב ולסדר את כל השולחנות", "כולל הכיסאות, לא רק המשטח"],
    ["לפרוס סטים: סכו״ם, מפיות וכוסות", ""],
    ["למלא מלח, פלפל ושמן זית", ""],
    ["לסדר ולמלא את עמדת המלצרים", "מפיות, קשים, תחתיות, פנקסים"],
    ["לקבל מהמטבח את החוסרים והמנות המיוחדות", "זה מה שנכנס לעדכון היומי"],
    ["לבדוק שהמסופון והקופה עובדים", "כולל נייר לקבלות ועודף בקופה"],
    ["להדליק אורות, מוזיקה ומיזוג", "לוודא שהאזור נעים לסועדים לפני הפתיחה"],
    ["לבדוק את התפריטים", "נקיים, שלמים, בלי דפים חסרים או קרועים"],
    ["להכין קנקני מים וקרח", ""],
    ["לבדוק מלאי כוסות וכלים", "להביא מהמחסן מה שחסר לפני שמתמלאים"],
    ["לעבור על עמדת הבר", "לימונים, קרח, קשיות, בקבוקים פתוחים"],
    ["לוודא ששירותי האורחים נקיים ומצוידים", ""],
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
    ["לרוקן ולנקות את עמדת המלצרים", ""],
    ["להחזיר כלים, מגשים וכוסות למטבח", ""],
    ["לספור קופה ולסגור משמרת במסופון", ""],
    ["לרוקן פחים ולהוציא אשפה", ""],
    ["לכבות ציוד, אורות ומיזוג, ולנעול", "דלתות, חלונות, מקררים סגורים"],
    ["לאסוף מפות ומפיות לכביסה", ""],
    ["לנגב ולמלא מלח, פלפל ושמן זית לקראת מחר", ""],
    ["לנגב את הבר ולסדר בקבוקים", ""],
    ["לרשום למנהל חוסרים ותקלות מהערב", ""],
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
  weekly: [
    ["ניקיון עומק של עמדת הבר", "מתחת למכונות, מגירות, ברזי שטיפה"],
    ["ספירת מלאי אלכוהול", ""],
    ["לעבור על מלאי כלים וכוסות ולהזמין חוסרים", ""],
    ["לבדוק תוקף מוצרים במקררים", "מה שקרוב לתפוגה — להוציא או לשלב במנות היום"],
    ["ניקוי מסננים ומאווררים במטבח", ""],
    ["לעבור על ציוני המבחנים של הצוות", "מי נתקע באיזו קטגוריה — ולתת פידבק אישי"],
    ["לרענן את המנות המודגשות ⭐ בתפריט", "מה שרוצים לדחוף השבוע"],
    ["לבדוק תקינות ריהוט", "כיסאות מתנדנדים, שולחנות, שמשיות"],
    ["לעבור על ביקורות אונליין ולהגיב", ""],
    ["שיחת צוות קצרה לסיכום השבוע", ""],
  ],
  monthly: [
    ["ספירת מלאי מלאה", ""],
    ["לעבור על התפריט ולעדכן מחירים", "מול עליות במחירי ספקים"],
    ["לבדוק מחירי ספקים וחוזים", ""],
    ["תחזוקה למקררים, מזגנים ומנדפים", ""],
    ["לבדוק תוקף רישיון עסק ותעודת כשרות", ""],
    ["בדיקת בטיחות", "מטפים, יציאות חירום, ערכת עזרה ראשונה"],
    ["מבחן תפריט מלא לכל הצוות", "התעודה האמיתית — לא רק תרגול"],
    ["לעבור על שעות ומשמרות של הצוות", ""],
    ["צילומי מנות חדשים לרשתות", ""],
    ["לסכם הכנסות והוצאות של החודש", ""],
  ],
  other: [],
};

// How many of each list make up the short version — "the checklist that already works".
// Six lines a waiter actually reads beats fourteen they scroll past, and the rest stay one
// tap away behind "עוד אפשרויות".
const CORE_COUNT = { opening: 6, shift: 5, closing: 6, training: 4, weekly: 5, monthly: 5, other: 0 };

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
  // task_id -> members who ticked it, per period. Which one a row reads depends on how
  // often that checklist repeats.
  const [doneBy, setDoneBy] = useState({ day: {}, week: {}, month: {} });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [openGroup, setOpenGroup] = useState("opening");
  const [picker, setPicker] = useState(null);    // kind whose library sheet is open
  const [picked, setPicked] = useState(new Set());
  const [showAllLibrary, setShowAllLibrary] = useState(false);
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
        // One query back to the start of the month covers all three periods. A weekly task
        // ticked on Monday is still "done this week" on Thursday, which is the whole point
        // of a weekly checklist — counting only today would show it as undone for six days.
        const since = [startOfMonthStr(), startOfWeekStr()].sort()[0];
        const { data: done } = await db.from("shift_task_done")
          .select("task_id, team_member_id, done_date").in("task_id", ids).gte("done_date", since);
        if (!alive) return;
        const today = todayStr(), week = startOfWeekStr(), month = startOfMonthStr();
        // Distinct members per task per period — one waiter ticking a task twice in a week
        // is one waiter.
        const buckets = { day: {}, week: {}, month: {} };
        const seen = { day: new Set(), week: new Set(), month: new Set() };
        (done || []).forEach((d) => {
          const add = (p) => {
            const key = `${d.task_id}|${d.team_member_id}`;
            if (seen[p].has(key)) return;
            seen[p].add(key);
            buckets[p][d.task_id] = (buckets[p][d.task_id] || 0) + 1;
          };
          if (d.done_date === today) add("day");
          if (d.done_date >= week) add("week");
          if (d.done_date >= month) add("month");
        });
        setDoneBy(buckets);
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
  const PERIOD_OF = { weekly: "week", monthly: "month" };
  const doneCount = (kind, taskId) => doneBy[PERIOD_OF[kind] || "day"][taskId] || 0;

  // Library sheet: the short list by default, the rest behind one tap.
  const pickerGroup = GROUPS.find((g) => g.kind === picker);
  const fullLibrary = picker ? LIBRARY[picker] : [];
  const visibleLibrary = showAllLibrary ? fullLibrary : fullLibrary.slice(0, CORE_COUNT[picker] || 0);
  const hiddenCount = fullLibrary.length - visibleLibrary.length;
  const coreLeft = fullLibrary
    .slice(0, CORE_COUNT[picker] || 0)
    .filter(([t]) => !(rows || []).some((r) => r.title === t)).length;

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
            {activeCount === 1 ? "משימה פעילה אחת" : `${activeCount} משימות פעילות`}
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
                    {on === 0 ? g.hint : on === 1 ? `משימה אחת · ${g.hint}` : `${on} משימות · ${g.hint}`}
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

                  {/* The promise the manager is buying: set it once and stop remembering
                      it. Said out loud, because a checklist you have to re-create every
                      week is just a note. */}
                  {g.period && (
                    <div className="bg-[#0c0d10] border rounded-xl p-2.5 flex items-start gap-2" style={{ borderColor: `${g.color}40` }}>
                      <Repeat size={12} className="shrink-0 mt-0.5" style={{ color: g.color }} />
                      <p className="text-[10.5px] leading-relaxed text-[#8a8aa0]">
                        המשימות האלה <span className="font-black" style={{ color: g.color }}>קבועות</span> — מגדירים פעם אחת והן
                        חוזרות {g.kind === "weekly" ? "כל שבוע (מיום ראשון)" : "כל חודש (מה-1 בחודש)"} מעצמן.
                        הסימון מתאפס בתחילת {g.kind === "weekly" ? "השבוע" : "החודש"} הבא.
                      </p>
                    </div>
                  )}

                  {list.length === 0 && g.kind !== "other" && (
                    <p className="text-[11.5px] text-[#8a8aa0] text-center py-3 leading-relaxed">
                      אין כאן עדיין משימות. הוסיפו מהספרייה למטה — זה לוקח חצי דקה.
                    </p>
                  )}

                  {/* One line per task: a number and the text, the way a checklist looks
                      on paper. Every row used to carry four controls (↑ ↓ 👁 🗑) plus its
                      subtitle, so a fourteen-line opening routine read as a control panel
                      rather than a list ("נראה ארוך ומסובך"). The controls moved inside the
                      row — tap a task to edit, reorder, hide or delete it. */}
                  <div className={`rounded-xl overflow-hidden ${list.length ? "border border-[#22252b]" : ""}`}>
                  {list.map((r, i) => (
                    <div
                      key={r.id}
                      className={`border-b border-[#1e2128] last:border-b-0 ${
                        editing?.id === r.id ? "bg-[#1a1d23]" : r.active ? "bg-[#16181c]" : "bg-[#131519]"
                      }`}
                    >
                      <button
                        onClick={() => setEditing(editing?.id === r.id ? null : { id: r.id, title: r.title, subtitle: r.subtitle || "" })}
                        className="w-full text-right flex items-center gap-2.5 px-2.5 py-2 min-h-[40px]"
                      >
                        <span
                          className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black flex-shrink-0 tabular-nums"
                          style={{ background: r.active ? `${g.color}22` : "#20232b", color: r.active ? g.color : "#5a5a6e" }}
                        >
                          {i + 1}
                        </span>
                        <span className={`flex-1 min-w-0 text-[12.5px] font-bold leading-snug truncate ${r.active ? "text-[#eef0f6]" : "text-[#5a5a6e] line-through"}`}>
                          {r.title}
                        </span>
                        {r.active && doneCount(g.kind, r.id) > 0 && (
                          <span className="text-[10px] font-black text-[#22c08c] flex-shrink-0">
                            ✓{doneCount(g.kind, r.id)}{teamCount ? `/${teamCount}` : ""}
                          </span>
                        )}
                        <ChevronDown
                          size={13}
                          className={`flex-shrink-0 transition-transform ${editing?.id === r.id ? "rotate-180 text-[#a79bff]" : "text-[#3a3d46]"}`}
                        />
                      </button>

                      {editing?.id === r.id && (
                        <div className="px-2.5 pb-2.5 space-y-2">
                          <input
                            value={editing.title}
                            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-2.5 py-2 text-[12.5px] text-[#eef0f6] focus:outline-none focus:border-[#6d5efc]"
                            dir="rtl"
                          />
                          <input
                            value={editing.subtitle}
                            onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                            placeholder="פירוט (לא חובה) — מה שהמלצר יראה כשיפתח את המשימה"
                            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-2.5 py-2 text-[11px] text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#6d5efc]"
                            dir="rtl"
                          />
                          {r.active && doneCount(g.kind, r.id) > 0 && (
                            <p className="text-[10px] font-black text-[#22c08c]">
                              ✓ {doneCount(g.kind, r.id)}{teamCount ? ` מתוך ${teamCount}` : ""} סימנו {g.period || "היום"}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5">
                            <button onClick={saveEdit} className="flex-1 bg-[#6d5efc] text-white text-[11px] font-black py-2 min-h-[34px] rounded-lg">
                              שמירה
                            </button>
                            <button
                              onClick={() => move(g.kind, i, -1)}
                              disabled={i === 0}
                              aria-label="הזזה למעלה"
                              className="w-8 h-[34px] rounded-lg bg-[#20232b] text-[#8a8aa0] flex items-center justify-center disabled:opacity-25"
                            >
                              <ChevronUp size={13} />
                            </button>
                            <button
                              onClick={() => move(g.kind, i, 1)}
                              disabled={i === list.length - 1}
                              aria-label="הזזה למטה"
                              className="w-8 h-[34px] rounded-lg bg-[#20232b] text-[#8a8aa0] flex items-center justify-center disabled:opacity-25"
                            >
                              <ChevronDown size={13} />
                            </button>
                            <button
                              onClick={() => toggleActive(r)}
                              title={r.active ? "להסתיר מהצוות" : "להציג לצוות"}
                              aria-label={r.active ? "להסתיר מהצוות" : "להציג לצוות"}
                              className="w-8 h-[34px] rounded-lg bg-[#20232b] text-[#8a8aa0] flex items-center justify-center"
                            >
                              {r.active ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                            <button
                              onClick={() => removeTask(r.id)}
                              title="מחיקה"
                              aria-label="מחיקת המשימה"
                              className="w-8 h-[34px] rounded-lg bg-[#20232b] text-[#e0315a] flex items-center justify-center"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  </div>

                  {g.kind !== "other" && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setPicker(g.kind); setPicked(new Set()); setShowAllLibrary(false); }}
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
            {/* One tap to a working checklist. Ticking fourteen boxes to set up an opening
                routine is the kind of chore a manager starts once and abandons ("זה נראה
                ארוך ומסובך"), so the short version is a button and the full list is opt-in. */}
            <div className="p-3 pb-0 flex-shrink-0">
              <button
                onClick={async () => {
                  const core = LIBRARY[picker]
                    .slice(0, CORE_COUNT[picker] || 0)
                    .filter(([t]) => !(rows || []).some((r) => r.title === t));
                  const kind = picker;
                  setPicker(null);
                  await addTasks(kind, core);
                }}
                disabled={busy || coreLeft === 0}
                className="w-full rounded-xl py-3 min-h-[44px] text-[12.5px] font-black border disabled:opacity-40"
                style={{ color: pickerGroup?.color, borderColor: `${pickerGroup?.color}66`, background: `${pickerGroup?.color}14` }}
              >
                {coreLeft === 0
                  ? "הצ׳קליסט המומלץ כבר אצלכם ✓"
                  : `הוספת הצ׳קליסט המומלץ (${coreLeft}) — לחיצה אחת`}
              </button>
              <p className="text-[10px] text-[#5a5a6e] text-center mt-1.5 leading-relaxed">
                מספיק כדי להתחיל. אפשר להוסיף, לערוך או למחוק בכל רגע.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              <p className="text-[10.5px] font-black text-[#5a5a6e] px-1 pt-1">או בחרו בעצמכם</p>
              {visibleLibrary.map(([title, sub]) => {
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
              {hiddenCount > 0 && (
                <button
                  onClick={() => setShowAllLibrary(true)}
                  className="w-full text-[11px] font-black text-[#a79bff] py-2.5 rounded-xl bg-[#0c0d10] border border-[#22252b]"
                >
                  עוד {hiddenCount} אפשרויות ↓
                </button>
              )}
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
                {/* Hebrew counts one thing in the singular — "הוספת 1 משימות" reads as a
                    string-concatenation bug, because it is one. */}
                {picked.size === 0 ? "בחרו משימות להוספה"
                  : picked.size === 1 ? "הוספת משימה אחת"
                    : `הוספת ${picked.size} משימות`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
