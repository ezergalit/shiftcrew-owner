import { ChevronLeft } from "lucide-react";

// The manager's home, as a task list — the same shape the waiters get (user, 2026-08-20:
// "בדיוק כמו במלצרים... ממש משימות").
//
// It replaces a home screen that had become a pile of panels: two suggestion cards, a
// brief builder, four collapsible trackers and a "handled today" footer, all competing.
// The rules are lifted from the waiter's TasksTab on purpose, because they are the reason
// that screen reads well:
//   • Every row OPENS something. Tapping takes the manager to the brief editor, the
//     opening checklist, the menu — never just ticks a box.
//   • A task with no content does not exist. No dishes missing a description ⇒ no row.
//     An empty day is a short list, not a wall of green ticks.
//   • Two groups, because "write today's update" and "fill in the menu" are different
//     kinds of work: one is tied to this shift, the other is not tied to a day at all.
//   • The number is the CURRENT place in the queue, recomputed every render, so finishing
//     #2 makes the old #3 the new #2 rather than leaving a hole.
const GROUPS = [
  { key: "daily", title: "משימות היום", hint: "העדכון לצוות ומשימות המשמרת" },
  { key: "menu", title: "משימות התפריט", hint: "מה חסר בתפריט כדי שהצוות ילמד ממנו" },
];

export default function OwnerTasksList({ tasks }) {
  const Row = (t, isNext) => (
    <button
      key={t.id}
      onClick={t.onOpen}
      className={`w-full text-right rounded-2xl flex items-center gap-3 transition-all active:scale-[0.99] ${
        t.done
          ? "bg-[#22c08c]/[0.07] border border-[#22c08c]/30 px-3 py-2"
          : isNext
            ? "bg-[#16181c] border border-[#6d5efc] p-3 shadow-[0_0_0_1px_rgba(109,94,252,0.3)]"
            : "bg-[#16181c] border border-[#22252b] p-3"
      }`}
    >
      <span
        className={`flex-shrink-0 rounded-[9px] flex items-center justify-center font-black tabular-nums ${
          t.done
            ? "w-[22px] h-[22px] text-[12px] bg-[#22c08c] text-[#06231a]"
            : isNext
              ? "w-[30px] h-[30px] text-[15px] bg-[#6d5efc] text-white"
              : "w-[30px] h-[30px] text-[15px] bg-[#20232b] text-[#eef0f6]"
        }`}
      >
        {t.done ? "✓" : t.rank}
      </span>
      <span className="flex-1 min-w-0">
        {isNext && <span className="block text-[9.5px] font-black text-[#a79bff] tracking-wide mb-0.5">הבא בתור</span>}
        <span className={`block font-black leading-snug ${t.done ? "text-[12px] text-[#22c08c] line-through truncate" : "text-sm text-[#eef0f6]"}`}>
          {t.title}
        </span>
        {!t.done && t.subtitle && (
          <span className="block text-[11px] text-[#8a8aa0] mt-0.5 leading-snug">{t.subtitle}</span>
        )}
      </span>
      <span className={`flex-shrink-0 font-black flex items-center gap-0.5 ${t.done ? "text-[10px] text-[#22c08c]" : "text-[11px] text-[#a79bff]"}`}>
        {t.done ? "בוצע ✓" : <>{t.cta || "לפתיחה"} <ChevronLeft size={13} /></>}
      </span>
    </button>
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
        const open = mine.filter((t) => !t.done);
        const shut = mine.filter((t) => t.done);
        const ranked = open.map((t, i) => ({ ...t, rank: i + 1 }));
        // One "הבא בתור" on the whole screen: the first open task of the first group that
        // still has one.
        const firstOpenGroup = GROUPS.find((x) => tasks.some((t) => (t.group || "daily") === x.key && !t.done));
        return (
          <div key={g.key} className={`space-y-2 ${gi ? "pt-1" : ""}`}>
            <div className="flex items-baseline justify-between px-1">
              <p className="text-[15px] font-black text-[#eef0f6]">{g.title}</p>
              <p className="text-xs font-black text-[#22c08c] tabular-nums">{shut.length}/{mine.length}</p>
            </div>
            <p className="text-[10.5px] text-[#5a5a6e] px-1 -mt-1">{g.hint}</p>
            <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mx-1">
              <div className="h-full bg-[#22c08c] transition-all" style={{ width: `${(shut.length / mine.length) * 100}%` }} />
            </div>

            <div className="flex flex-col gap-2">
              {ranked.map((t, i) => Row(t, i === 0 && firstOpenGroup?.key === g.key))}
              {shut.length > 0 && (
                <div className="flex items-center gap-2 text-[10px] font-black text-[#5a5a6e] tracking-wide mt-1 mb-0.5">
                  <span className="flex-1 h-px bg-[#22252b]" />
                  בוצע · {shut.length}
                  <span className="flex-1 h-px bg-[#22252b]" />
                </div>
              )}
              {shut.map((t) => Row(t, false))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
