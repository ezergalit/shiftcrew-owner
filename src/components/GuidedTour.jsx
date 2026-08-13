import { useState } from "react";
import { X, ChevronLeft } from "lucide-react";

// A guided walk through the whole app — the user's ask was explicit: "tutorial שממש שולח
// אותו לכל חלק באפליקציה", especially settings, so the owner discovers every feature
// instead of living in the two tabs they found by themselves.
//
// Each step SWITCHES the app to the real tab (via onNavigate) and explains what's on it —
// the owner is looking at their own live data while reading, not at screenshots. The tour
// is a bottom card over the real screen; everything above it stays interactive on purpose,
// so "הגדירו את זה עכשיו" is literal.
const STEPS = [
  {
    tab: "home",
    title: "טאב הבית — הבריף היומי",
    body: "כאן כותבים לצוות מה חסר היום, מה חדש ומה בתנור — והלוח שמתחת מראה מי קרא ומי ענה נכון על שאלת ההבנה. כרטיסי הצעה חכמים יופיעו כאן כשנזהה מנות שהצוות מתקשה בהן.",
  },
  {
    tab: "menu",
    title: "טאב התפריט — המנות והכוכבים",
    body: "כל מנה מציגה את התיאור שלה — לחיצה עליו פותחת עריכה. הכוכב ⭐ ליד שם המנה מסמן ״חשוב לי שהצוות ידע את זו״ — מנה עם כוכב מקבלת עדיפות בלימוד. מנה חדשה שתוסיפו תקבל כוכב אוטומטית.",
  },
  {
    tab: "team",
    title: "טאב הצוות — מי יודע מה",
    body: "אחוז הידע האמיתי של כל מלצר, המנות שהוא טועה בהן, תוצאות המבחנים וגרף השיפור שלו — כמו גרף מניה: נקודת פתיחה, שיפור, וזמן שהושקע.",
  },
  {
    tab: "status",
    title: "טאב הסטטוס — מי למד היום",
    body: "שלוש קבוצות: מי למד היום, מי נכנס אבל לא למד (הקבוצה שהכי שווה לשים לב אליה), ומי צריך תזכורת. נוכחות נמדדת בנפרד מהתקדמות.",
  },
  {
    tab: "settings",
    title: "טאב ההגדרות — הלב של מסלול הלמידה",
    body: "כאן קובעים מה חשוב לבחון (אלרגנים? מחירים? מרכיבים?), את סדר הקטגוריות בלימוד, את סף המעבר למבחן, ואת בוחן ההיכרות למלצר חדש. יש גם ״בדיקת בריאות תפריט״ שמוצאת מנות עם מידע חסר ומתקנת קבוצות שלמות במכה. שווה לעבור על זה עכשיו — הכל מאותחל להמלצה שלנו.",
  },
];

export default function GuidedTour({ onNavigate, onClose }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const go = (i) => {
    setStep(i);
    onNavigate(STEPS[i].tab);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 max-w-md mx-auto px-3 pb-20 pointer-events-none">
      <div className="pointer-events-auto bg-[#1c1e24] border border-[#6d5efc]/60 rounded-2xl p-4 shadow-2xl shadow-black/60 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[#a79bff] bg-[#6d5efc]/15 px-2 py-0.5 rounded-full">
              סיור מודרך · {step + 1}/{STEPS.length}
            </span>
          </div>
          <button onClick={onClose} className="text-[#6a6a7e]" aria-label="סגירת הסיור"><X size={16} /></button>
        </div>
        <div>
          <p className="text-sm font-black text-[#eef0f6]">{s.title}</p>
          <p className="text-xs text-[#b9b9c9] leading-relaxed mt-1">{s.body}</p>
        </div>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              onClick={() => go(step - 1)}
              className="bg-[#22252b] text-[#8a8aa0] font-bold py-2 px-4 rounded-lg text-xs hover:bg-[#2c2e35] transition"
            >
              הקודם
            </button>
          )}
          <button
            onClick={() => (last ? onClose() : go(step + 1))}
            className="flex-1 bg-[#6d5efc] text-white font-bold py-2 rounded-lg text-xs hover:bg-[#5b4ef0] transition flex items-center justify-center gap-1"
          >
            {last ? "סיימנו — לעבודה!" : "הבא"} {!last && <ChevronLeft size={14} />}
          </button>
        </div>
        <div className="flex justify-center gap-1">
          {STEPS.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === step ? "bg-[#6d5efc]" : "bg-[#3a3d46]"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
