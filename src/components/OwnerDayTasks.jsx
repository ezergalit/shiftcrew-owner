import { ChevronLeft } from "lucide-react";

// The manager's own two jobs, as a checklist for them.
//
// The waiters open their app to a numbered list of what today needs from them. The manager
// opened theirs to a wall of other people's numbers — the two things only they can do
// (write today's update, set up the shift's tasks) were somewhere down the page, phrased as
// panels rather than as work. The user's ask (2026-08-20): "בתחילת היום זה ממש יופיע לו
// שני הדברים האלה למלא כמו משימות עבורו".
//
// ⚠️ A finished job does NOT stay here. The first version kept both rows in place and
// turned them green, which meant that by 10am the top of the screen was two ticks the
// manager had to scroll past every time they opened the app ("שזה לא יהיה תקוע למעלה
// בירוק"). Done rows move to `OwnerDayDone` at the very bottom — still editable, no longer
// in the way. When both are done this card renders nothing at all.

// Both components read the same two rows, built once so the top and bottom can never
// disagree about what is finished.
function buildRows({ briefSent, briefSummary, taskCount, onOpenBrief, onOpenTasks }) {
  return [
    {
      id: "brief",
      done: briefSent,
      title: "לכתוב את העדכון היומי",
      doneTitle: "העדכון היומי נשלח",
      subtitle: briefSent ? briefSummary : "מה חסר, מה חדש ומה להמליץ — הצוות רואה את זה לפני המשמרת",
      onOpen: onOpenBrief,
    },
    {
      id: "tasks",
      done: taskCount > 0,
      title: "להגדיר את משימות המשמרת",
      doneTitle: "משימות המשמרת מוגדרות",
      // ⚠️ Don't list the groups here. The line used to end "· פתיחה · משמרת · סגירה",
      // which became a lie the moment the only active task was a weekly one.
      subtitle: taskCount > 0
        ? `${taskCount === 1 ? "משימה אחת פעילה" : `${taskCount} משימות פעילות`} אצל הצוות`
        : "צ׳קליסט פתיחה וסגירה — בוחרים מספרייה מוכנה, לוקח דקה",
      onOpen: onOpenTasks,
    },
  ];
}

export default function OwnerDayTasks(props) {
  const rows = buildRows(props);
  const open = rows.filter((r) => !r.done);
  if (open.length === 0) return null;

  return (
    <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-3.5 space-y-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-black text-[#eef0f6]">מה לפתוח איתו את היום</p>
        <p className="text-[11px] font-black tabular-nums text-[#8a8aa0]">
          {rows.length - open.length}/{rows.length}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {open.map((r) => (
          <button
            key={r.id}
            onClick={r.onOpen}
            className="w-full text-right rounded-xl flex items-center gap-3 p-2.5 border bg-[#0c0d10] border-[#6d5efc]/50 transition active:scale-[0.99]"
          >
            <span className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-[13px] flex-shrink-0 bg-[#6d5efc] text-white">
              !
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12.5px] font-black leading-snug text-[#eef0f6]">{r.title}</span>
              <span className="block text-[10.5px] text-[#8a8aa0] mt-0.5 leading-snug truncate">{r.subtitle}</span>
            </span>
            <span className="flex items-center gap-0.5 text-[11px] font-black flex-shrink-0 text-[#a79bff]">
              לפתיחה <ChevronLeft size={13} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// What's already handled today, parked at the bottom of the home screen: one small line
// each, muted, with an edit link. Present enough to confirm it went out, quiet enough to
// scroll past.
export function OwnerDayDone(props) {
  const done = buildRows(props).filter((r) => r.done);
  if (done.length === 0) return null;

  return (
    <div className="pt-1 space-y-1.5">
      <p className="text-[10px] font-black text-[#5a5a6e] px-1">טופל היום</p>
      {done.map((r) => (
        <button
          key={r.id}
          onClick={r.onOpen}
          className="w-full text-right flex items-center gap-2 px-2.5 py-2 rounded-xl bg-[#131519] border border-[#1e2128] hover:border-[#22c08c]/30 transition"
        >
          <span className="text-[11px] font-black text-[#22c08c] flex-shrink-0">✓</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[11.5px] font-bold text-[#8a8aa0] leading-snug">{r.doneTitle}</span>
            <span className="block text-[10px] text-[#5a5a6e] leading-snug truncate">{r.subtitle}</span>
          </span>
          <span className="text-[10.5px] font-black text-[#5a5a6e] flex-shrink-0">עריכה</span>
        </button>
      ))}
    </div>
  );
}
