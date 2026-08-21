import { X, Flame, TrendingUp, Eye } from "lucide-react";
import LearningStatus from "./LearningStatus";
import BriefReadBoard from "./BriefReadBoard";
import SettingsSection from "./SettingsSection";

// Where the team's numbers live now that the home screen is a task list.
//
// The waiter app puts its own stats behind a 📊 button in the header rather than on the
// home screen, for the same reason: what you DO today and how you are DOING overall are
// different questions, and mixing them made the home screen a wall. This is the manager's
// version of that button — read-only, opened when they want it, never in the way.
export default function TeamScreen({
  restaurant, teamMembers, dailyBrief, briefSent, briefReadsToday,
  studiedToday, teamAvgPct, weakestMember, open, onToggle,
  onSelectMember, onRows, onMessage, messagedToday, children, onClose,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0c0d10] flex flex-col max-w-md mx-auto" dir="rtl">
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-[#22252b] flex items-center gap-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-[#eef0f6]">איך הצוות מתקדם</p>
          <p className="text-[11px] text-[#8a8aa0]">
            {teamMembers.length ? `${studiedToday} מתוך ${teamMembers.length} למדו היום · ידע ממוצע ${teamAvgPct}%` : "אין עדיין חברי צוות"}
          </p>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-lg bg-[#191b1f] border border-[#22252b] flex items-center justify-center text-[#8a8aa0] flex-shrink-0" aria-label="סגירה">
          <X size={17} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="bg-[#16181c] border border-[#22252b] rounded-2xl overflow-hidden">
          <SettingsSection
            icon={<Flame size={15} className="text-[#f3a712]" />}
            title="מי למד היום"
            summary={teamMembers.length ? `${studiedToday} מתוך ${teamMembers.length} למדו היום · ואחריהם מי שלא` : "אין עדיין חברי צוות"}
            open={open === "today"}
            onToggle={() => onToggle(open === "today" ? null : "today")}
          >
            <LearningStatus
              restaurant={restaurant}
              onSelectMember={onSelectMember}
              onRows={onRows}
              onMessage={onMessage}
              messagedToday={messagedToday}
            />
          </SettingsSection>

          <SettingsSection
            icon={<TrendingUp size={15} className="text-[#22c08c]" />}
            title="התקדמות ומבחנים"
            summary={
              teamMembers.length
                ? `ידע ממוצע ${teamAvgPct}%${weakestMember ? ` · הכי זקוק/ה לתרגול: ${weakestMember.name}` : ""}`
                : "אין עדיין חברי צוות — הקוד בהגדרות"
            }
            open={open === "progress"}
            onToggle={() => onToggle(open === "progress" ? null : "progress")}
          >
            {children}
          </SettingsSection>

          <SettingsSection
            icon={<Eye size={15} className="text-[#38bdf8]" />}
            title="מי קרא את העדכון היומי"
            summary={
              !briefSent ? "עוד לא נשלח עדכון היום"
                : teamMembers.length ? `${briefReadsToday.size} מתוך ${teamMembers.length} אישרו קריאה`
                  : "אין עדיין חברי צוות"
            }
            open={open === "reads"}
            onToggle={() => onToggle(open === "reads" ? null : "reads")}
          >
            <BriefReadBoard restaurant={restaurant} brief={dailyBrief} />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
