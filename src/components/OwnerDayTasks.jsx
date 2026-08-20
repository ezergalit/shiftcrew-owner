import { Check, ChevronLeft } from "lucide-react";

// The manager's own two jobs, as a checklist for them.
//
// The waiters open their app to a numbered list of what today needs from them. The manager
// opened theirs to a wall of other people's numbers — the two things only they can do
// (write today's update, set up the shift's tasks) were somewhere down the page, phrased as
// panels rather than as work. The user's ask (2026-08-20): "בתחילת היום זה ממש יופיע לו
// שני הדברים האלה למלא כמו משימות עבורו".
//
// Same shape as the waiter's task list on purpose — a manager who has seen one screen has
// seen both. And the same rule holds: every row opens the thing, it is never a bare tick.
export default function OwnerDayTasks({ briefSent, briefSummary, taskCount, onOpenBrief, onOpenTasks }) {
  const rows = [
    {
      id: "brief",
      done: briefSent,
      title: "לכתוב את העדכון היומי",
      subtitle: briefSent ? briefSummary : "מה חסר, מה חדש ומה להמליץ — הצוות רואה את זה לפני המשמרת",
      cta: briefSent ? "עריכה" : "לכתיבה",
      onOpen: onOpenBrief,
    },
    {
      id: "tasks",
      done: taskCount > 0,
      title: "להגדיר את משימות המשמרת",
      subtitle: taskCount > 0
        ? `${taskCount === 1 ? "משימה אחת פעילה" : `${taskCount} משימות פעילות`} · פתיחה · משמרת · סגירה`
        : "צ׳קליסט פתיחה וסגירה — בוחרים מספרייה מוכנה, לוקח דקה",
      cta: taskCount > 0 ? "עריכה" : "להגדרה",
      onOpen: onOpenTasks,
    },
  ];
  const done = rows.filter((r) => r.done).length;

  return (
    <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-3.5 space-y-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-black text-[#eef0f6]">מה לפתוח איתו את היום</p>
        <p className="text-[11px] font-black tabular-nums" style={{ color: done === rows.length ? "#22c08c" : "#8a8aa0" }}>
          {done}/{rows.length}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={r.onOpen}
            className={`w-full text-right rounded-xl flex items-center gap-3 p-2.5 border transition active:scale-[0.99] ${
              r.done ? "bg-[#22c08c]/[0.07] border-[#22c08c]/30" : "bg-[#0c0d10] border-[#6d5efc]/50"
            }`}
          >
            <span
              className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-[13px] flex-shrink-0 ${
                r.done ? "bg-[#22c08c] text-[#06231a]" : "bg-[#6d5efc] text-white"
              }`}
            >
              {r.done ? <Check size={15} /> : "!"}
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block text-[12.5px] font-black leading-snug ${r.done ? "text-[#22c08c]" : "text-[#eef0f6]"}`}>
                {r.title}
              </span>
              <span className="block text-[10.5px] text-[#8a8aa0] mt-0.5 leading-snug truncate">{r.subtitle}</span>
            </span>
            <span className="flex items-center gap-0.5 text-[11px] font-black flex-shrink-0 text-[#a79bff]">
              {r.cta} <ChevronLeft size={13} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
