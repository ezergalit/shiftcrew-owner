import { Check } from "lucide-react";

// ══ מדריך ההפעלה של המנהל: פס הנחיה מעל הסרגל, על החשבון האמיתי ══
//
// שלוש גרסאות, ושתי דרכים להיכשל:
//   1. **`GuidedTour`** — שכבה עם זרקור שמדדה אלמנטים חיים וחיכתה שההקשה תנחת במקום
//      מסוים. משם הדיליי; והיא **התיישנה חמש פעמים**, כי היא מתארת מסכים בשם.
//   2. **`OwnerTutorial`** — רינדר עותק של המסעדה. ברח מהמדידה אבל צייר UI משלו,
//      ולכן נראה כמו גרסה זולה של האפליקציה.
//
// כאן לא מצויר שום מסך ולא נמדד שום אלמנט. המנהל עובד בחשבון האמיתי — התפריט שלו,
// הצוות שלו, התצלומים שלו — והפס מסביר את המסך שהוא עומד בו, בפעם הראשונה שהוא מגיע
// אליו (`lib/coachStops.js`). הטריגר הוא **מצב האפליקציה**: מסך שזז משנה טקסט ולא
// מנגנון, ומסך חדש מקבל שורה משלו.
//
// ⚠️ הפס יושב **בזרימה הרגילה**, כאח של הסרגל התחתון — לא `position: fixed`. לכן
// «הכלא של backdrop-filter» לא רלוונטי כאן, והוא לעולם לא מכסה תוכן.
export default function CoachBar({ text, onOk }) {
  return (
    <div className="flex-shrink-0 px-3 pt-2.5 pb-1.5" dir="rtl">
      <div
        className="rounded-2xl px-3.5 py-2.5 flex items-center gap-3 border"
        style={{
          borderColor: "rgba(34,192,140,0.35)",
          background: "linear-gradient(150deg,rgba(34,192,140,0.14),rgba(15,92,70,0.20))",
        }}
      >
        <span className="flex-1 min-w-0 text-[13.5px] font-black text-[#eef0f6] leading-snug">{text}</span>
        <button
          onClick={onOk}
          className="flex-shrink-0 h-10 px-3.5 rounded-xl bg-[#22c08c] text-[#06231a] text-[12.5px] font-black flex items-center gap-1.5"
        >
          <Check size={15} /> הבנתי
        </button>
      </div>
    </div>
  );
}
