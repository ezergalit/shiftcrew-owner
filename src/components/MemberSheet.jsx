import { X, Flame, Clock, MessageSquare } from "lucide-react";
import ProgressChart from "./ProgressChart";

// Everything about one waiter, in one place.
//
// The home lists used to carry this per person — chart, wrong dishes, exam chips, two
// status pills — which reads fine for three waiters and is unusable at fifty (user,
// 2026-08-20: "אני בחיים לא אצליח לעקוב"). So the lists became one line each and the
// detail moved here, behind a tap on the person.
//
// One sheet serves both lists on purpose. Two detail views of the same waiter would drift,
// and the owner would have to learn which screen tells the truth.
const fmtMins = (secs) => {
  if (!secs) return "0 דק׳";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${(m / 60).toFixed(1)} ש׳` : `${m} דק׳`;
};

const Pill = ({ ok, children }) => (
  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${ok ? "bg-[#1aa376]/15 text-[#22c08c]" : "bg-[#22252b] text-[#8a8aa0]"}`}>
    {children}
  </span>
);

export default function MemberSheet({ detail, onClose, onMessage, tasksOff = false }) {
  if (!detail) return null;
  const {
    name, pct, pctColor, mastered, dishCount, weak, untouched, baseline, totalSeconds,
    snapshots, exams, readBrief, didChallenge, tasksDone, tasksTotal, live,
  } = detail;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" dir="rtl" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#16181c] border-t border-[#22252b] rounded-t-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#22252b] flex items-center gap-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-[#eef0f6] truncate">{name}</p>
            <p className="text-[11px] text-[#8a8aa0]">
              {mastered}/{dishCount} מנות נלמדו
              {live?.streak > 1 && <> · 🔥 {live.streak} ימים ברצף</>}
            </p>
          </div>
          <p className="text-2xl font-black tabular-nums flex-shrink-0" style={{ color: pctColor }}>{pct}%</p>
          <button onClick={onClose} className="text-[#8a8aa0] flex-shrink-0" aria-label="סגירה"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pctColor }} />
          </div>

          {/* Today, in the manager's terms: did they study, did they read the update, did
              they tick the shift off. */}
          <div className="bg-[#0c0d10] border border-[#22252b] rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-black text-[#8a8aa0]">היום</p>
            <div className="flex flex-wrap gap-1.5">
              {live && (
                <Pill ok={live.studiedToday}>
                  {live.studiedToday ? `✓ למד/ה ${fmtMins(live.studiedTodaySeconds)}` : live.seenToday ? "נכנס/ה ולא למד/ה" : "לא נכנס/ה"}
                </Pill>
              )}
              {/* ⚠️ A restaurant with `features.tasks === false` has no daily update and no
                  shift checklist, so "לא קרא/ה עדכון יומי" would be reporting a failure to
                  do something that does not exist. The study pill above is the whole story
                  there. */}
              {!tasksOff && (
                <>
                  <Pill ok={readBrief}>{readBrief ? "✓ קרא/ה עדכון יומי" : "לא קרא/ה עדכון יומי"}</Pill>
                  {tasksTotal > 0 && (
                    <Pill ok={tasksDone >= tasksTotal}>
                      משימות משמרת {tasksDone}/{tasksTotal}
                    </Pill>
                  )}
                  <Pill ok={didChallenge}>{didChallenge ? "✓ אתגר יומי" : "אתגר יומי לא הושלם"}</Pill>
                </>
              )}
            </div>
            {live?.weekMinutes > 0 && (
              <p className="text-[10px] text-[#8a8aa0] font-bold flex items-center gap-1">
                <Clock size={10} /> {live.weekMinutes} דק׳ השבוע · סה״כ {fmtMins(totalSeconds)}
              </p>
            )}
          </div>

          {/* Where they started vs where they are — a 55% who began at 15% is a different
              story from a 55% who began at 60%. */}
          <ProgressChart baseline={baseline} current={pct} seconds={totalSeconds} snapshots={snapshots} />

          {weak.length > 0 && (
            <div className="bg-[#3a1d22] border border-[#e0315a]/30 rounded-xl p-3">
              <p className="text-[10px] font-black text-[#e0315a] mb-1">טועה ב-{weak.length} מנות</p>
              <p className="text-[11.5px] text-[#eef0f6] leading-relaxed">{weak.join(", ")}</p>
            </div>
          )}
          {untouched > 0 && (
            <p className="text-[11px] text-[#8a8aa0]">עוד לא למד/ה {untouched} מנות</p>
          )}

          {exams.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[#8a8aa0] mb-1.5">בחנים ומבחנים</p>
              <div className="flex flex-wrap gap-1.5">
                {exams.map((e) => (
                  <span
                    key={e.category}
                    className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                      e.passed ? "bg-[#1aa376]/15 text-[#22c08c]" : "bg-[#e0315a]/15 text-[#e0315a]"
                    }`}
                  >
                    {e.label} {e.score}% {e.passed ? "✓" : "✗"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {live?.week && (
            <div>
              <p className="text-[10px] font-bold text-[#8a8aa0] mb-1.5 flex items-center gap-1">
                <Flame size={10} /> דקות לימוד — 7 ימים אחרונים
              </p>
              <div className="flex items-end gap-1 h-10">
                {live.week.map((v, i) => (
                  <div key={i} className="flex-1 rounded-sm" style={{
                    height: `${Math.max(8, (v / Math.max(1, ...live.week)) * 100)}%`,
                    background: v ? "#22c08c" : "#2a2d35",
                  }} title={`${v} דק׳`} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-[#22252b] flex-shrink-0 flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {onMessage && (
            <button
              onClick={onMessage}
              className="flex-1 py-3 min-h-[44px] rounded-xl bg-[#6d5efc] text-white text-sm font-black flex items-center justify-center gap-2"
            >
              <MessageSquare size={15} /> שליחת הודעה
            </button>
          )}
          <button onClick={onClose} className={`py-3 min-h-[44px] rounded-xl bg-[#22252b] text-[#eef0f6] text-sm font-black ${onMessage ? "px-5" : "w-full"}`}>
            סגירה
          </button>
        </div>
      </div>
    </div>
  );
}

// The one-line form both home lists use. Name, a percentage, a hairline bar and a status
// dot — enough to scan fifty people, and a tap away from everything else.
export function MemberRow({ name, pct, color, dot, note, onClick, onMessage, messaged }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-right flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-[#1c1e22] transition min-h-[38px]"
      >
        {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />}
        <span className="flex-1 min-w-0">
          <span className="flex items-baseline gap-2">
            <span className="text-[12px] font-bold text-[#eef0f6] truncate">{name}</span>
            {note && <span className="text-[10px] text-[#8a8aa0] flex-shrink-0 truncate">{note}</span>}
          </span>
          <span className="block h-[3px] bg-[#22252b] rounded-full overflow-hidden mt-1">
            <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
          </span>
        </span>
        <span className="text-[11px] font-black tabular-nums flex-shrink-0 w-9 text-left" style={{ color }}>
          {pct}%
        </span>
      </button>
      {/* Offered only where it makes sense — next to someone who hasn't studied. A nudge
          button on every row would just be another thing to ignore.
          Three states, because "sent" and "landed" are different facts: untouched, sent
          but unread (amber), and read by the waiter (green ✓). */}
      {onMessage && (
        <button
          onClick={onMessage}
          title={
            !messaged ? `שליחת הודעה ל${name}`
              : messaged.readAt ? "ההודעה של היום נקראה" : "נשלחה הודעה היום — טרם נקראה"
          }
          aria-label={`שליחת הודעה ל${name}`}
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition relative ${
            !messaged ? "bg-[#20232b] text-[#8a8aa0] hover:text-[#a79bff]"
              : messaged.readAt ? "bg-[#22c08c]/15 text-[#22c08c]" : "bg-[#f3a712]/15 text-[#f3a712]"
          }`}
        >
          <MessageSquare size={13} />
          {messaged?.readAt && (
            <span className="absolute -top-0.5 -left-0.5 text-[9px] font-black leading-none">✓</span>
          )}
        </button>
      )}
    </div>
  );
}
