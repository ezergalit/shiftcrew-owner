import { ChevronLeft, RotateCcw, Check, X } from "lucide-react";

// The manager's home, as a task list — the same shape the waiters get (user, 2026-08-20:
// "בדיוק כמו במלצרים... ממש משימות").
//
// The rules are lifted from the waiter's TasksTab on purpose, because they are the reason
// that screen reads well:
//   • Every row OPENS something. Tapping takes the manager to the brief editor, the
//     opening checklist, the menu — never just ticks a box.
//   • A task with no content does not exist. No dishes missing a description ⇒ no row.
//   • Two groups, because "write today's update" and "fill in the menu" are different
//     kinds of work: one is tied to this shift, the other is not tied to a day at all.
//   • The number is the CURRENT place in the queue, recomputed every render, so finishing
//     #2 makes the old #3 the new #2 rather than leaving a hole.
//
// ⚠️ Done rows leave their group entirely and collect at the FOOT of the screen, small
// and faded (user, 2026-08-21, with a screenshot: four big green ticks sat on top and
// pushed the still-open menu tasks below the fold — "like its completed and they need to
// continue the next one"). A finished task is a receipt, not a headline. Each carries a
// ↺ so a task can be reopened for the same day ("turn a mission grey again").
const GROUPS = [
  { key: "daily", title: "משימות היום", hint: "העדכון לצוות ומשימות המשמרת" },
  { key: "menu", title: "משימות התפריט", hint: "מה חסר בתפריט כדי שהצוות ילמד ממנו" },
];

export default function OwnerTasksList({ tasks }) {
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  // One "הבא בתור" on the whole screen: the first open task of the first group that
  // still has one.
  const firstOpenGroup = GROUPS.find((g) => open.some((t) => (t.group || "daily") === g.key));

  // A row and, when the task is dismissible, a small ✕ beside it — a separate element,
  // because a button inside a button is invalid HTML and a mis-tap magnet.
  const OpenRow = (t, isNext) => (
    <div key={t.id} className="flex items-center gap-1.5">
    <button
      onClick={t.onOpen}
      className={`flex-1 min-w-0 text-right rounded-2xl flex items-center gap-3 transition-all active:scale-[0.99] ${
        isNext
          ? "bg-[#16181c] border border-[#6d5efc] p-3 shadow-[0_0_0_1px_rgba(109,94,252,0.3)]"
          : "bg-[#16181c] border border-[#22252b] p-3"
      }`}
    >
      <span
        className={`flex-shrink-0 w-[30px] h-[30px] rounded-[9px] flex items-center justify-center font-black tabular-nums text-[15px] ${
          isNext ? "bg-[#6d5efc] text-white" : "bg-[#20232b] text-[#eef0f6]"
        }`}
      >
        {t.rank}
      </span>
      <span className="flex-1 min-w-0">
        {isNext && <span className="block text-[9.5px] font-black text-[#a79bff] tracking-wide mb-0.5">הבא בתור</span>}
        <span className="block font-black leading-snug text-sm text-[#eef0f6]">{t.title}</span>
        {t.subtitle && <span className="block text-[11px] text-[#8a8aa0] mt-0.5 leading-snug">{t.subtitle}</span>}
      </span>
      <span className="flex-shrink-0 font-black flex items-center gap-0.5 text-[11px] text-[#a79bff]">
        {t.cta || "לפתיחה"} <ChevronLeft size={13} />
      </span>
    </button>
    {/* "בסדר לי שזה ככה בינתיים" — waves a menu gap off the list for two weeks without
        pretending it was fixed. The health screen keeps showing it the whole time. */}
    {t.onDismiss && (
      <button
        onClick={t.onDismiss}
        title="בסדר לי כרגע — להסתיר מהרשימה לשבועיים"
        aria-label={`דחיית ${t.title}`}
        className="w-7 h-7 rounded-lg bg-[#20232b] text-[#5a5a6e] hover:text-[#8a8aa0] flex items-center justify-center flex-shrink-0"
      >
        <X size={12} />
      </button>
    )}
    </div>
  );

  if (!tasks.length) {
    return (
      <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-5 text-center space-y-1.5">
        <p className="text-sm font-black text-[#eef0f6]">הכל מסודר להיום ✨</p>
        <p className="text-[11px] text-[#8a8aa0] leading-relaxed">
          העדכון נשלח, המשמרת מוגדרת והתפריט מלא. אפשר לעבור לראות איך הצוות מתקדם.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {GROUPS.map((g, gi) => {
        const mine = tasks.filter((t) => (t.group || "daily") === g.key);
        if (!mine.length) return null;
        const groupOpen = mine.filter((t) => !t.done);
        const shutCount = mine.length - groupOpen.length;
        const ranked = groupOpen.map((t, i) => ({ ...t, rank: i + 1 }));
        return (
          <div key={g.key} className={`space-y-2 ${gi ? "pt-1" : ""}`}>
            <div className="flex items-baseline justify-between px-1">
              <p className="text-[15px] font-black text-[#eef0f6]">{g.title}</p>
              <p className="text-xs font-black text-[#22c08c] tabular-nums">
                {shutCount}/{mine.length}{shutCount === mine.length ? " ✓" : ""}
              </p>
            </div>
            <p className="text-[10.5px] text-[#5a5a6e] px-1 -mt-1">{g.hint}</p>
            <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mx-1">
              <div className="h-full bg-[#22c08c] transition-all" style={{ width: `${(shutCount / mine.length) * 100}%` }} />
            </div>
            {ranked.length > 0 && (
              <div className="flex flex-col gap-2">
                {ranked.map((t, i) => OpenRow(t, i === 0 && firstOpenGroup?.key === g.key))}
              </div>
            )}
          </div>
        );
      })}

      {/* Everything finished, across both groups, in one quiet pile at the very bottom. */}
      {done.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-2 text-[10px] font-black text-[#5a5a6e] tracking-wide">
            <span className="flex-1 h-px bg-[#22252b]" />
            בוצע · {done.length}
            <span className="flex-1 h-px bg-[#22252b]" />
          </div>
          {done.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 opacity-60">
              <button
                onClick={t.onOpen}
                className="flex-1 min-w-0 text-right rounded-xl flex items-center gap-2.5 bg-[#22c08c]/[0.06] border border-[#22c08c]/25 px-3 py-1.5"
              >
                <span className="flex-shrink-0 w-[18px] h-[18px] rounded-md bg-[#22c08c] text-[#06231a] flex items-center justify-center">
                  <Check size={11} />
                </span>
                <span className="flex-1 min-w-0 text-[11px] font-bold text-[#22c08c] line-through truncate">{t.title}</span>
                <span className="flex-shrink-0 text-[9.5px] font-black text-[#22c08c]">בוצע</span>
              </button>
              {t.onRedo && (
                <button
                  onClick={t.onRedo}
                  title="להחזיר לרשימה — לביצוע שוב היום"
                  aria-label={`ביצוע חוזר של ${t.title}`}
                  className="w-7 h-7 rounded-lg bg-[#20232b] text-[#8a8aa0] hover:text-[#eef0f6] flex items-center justify-center flex-shrink-0"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
