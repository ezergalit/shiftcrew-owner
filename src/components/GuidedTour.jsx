import { useState } from "react";
import { X, ChevronLeft, Compass } from "lucide-react";

// A guided walk through the whole app — the user's ask was explicit: "tutorial שממש שולח
// אותו לכל חלק באפליקציה", and later sharpened (2026-08-17): it must open as an up-front
// welcome message with a skip option — not live only as a button in settings — and it must
// teach HOW to do each thing (edit a dish, add team members), not just describe the tabs.
//
// Each step SWITCHES the app to the real tab (via onNavigate) and explains what's on it —
// the owner is looking at their own live data while reading, not at screenshots. The tour
// is a bottom card over the real screen; everything above it stays interactive on purpose,
// so "נסו את זה עכשיו" is literal.
const buildSteps = (teamCode) => [
  {
    tab: "home",
    title: "טאב הבית — העדכון היומי לצוות",
    body: "כאן מתחיל כל יום: כתבו מה חסר היום, מה חדש ומה בתנור — ולחצו שמירה. הצוות רואה את זה באפליקציה שלו לפני המשמרת, והלוח שמתחת מראה לכם מי קרא ומי ענה נכון על שאלת ההבנה.",
  },
  {
    tab: "menu",
    title: "טאב התפריט — המנות שלכם",
    body: "את התפריט אנחנו מזינים בשבילכם — הוא כבר כאן (או בדרך). רוצים להוסיף מנה בעצמכם? הכפתור ״הוסף מנה״ פותח טופס מלא: שם, מחיר, תיאור, מרכיבים, אלרגנים, רגישות בהריון, מוקשים וכשרות. כל שינוי מתפרסם לצוות אוטומטית.",
  },
  {
    tab: "menu",
    title: "כך נכנסים לכל מנה ועורכים אותה",
    body: "לחיצה על התיאור של מנה (או על כפתור ״עריכה״) פותחת אותה לעריכה מלאה: שם, מחיר, תיאור, מרכיבים ואלרגנים. הכוכב ⭐ ליד השם מסמן ״חשוב לי שהצוות ידע את זו״ — היא תקבל עדיפות בלימוד. ״מחיקה״ מסירה את המנה גם מאפליקציית הצוות.",
  },
  {
    tab: "menu",
    title: "קו ישיר אלינו — אנחנו עושים בשבילכם",
    body: "בראש הטאב: רוצים לשנות משהו? מחירים, מנות חדשות, מחיקות, או כל בעיה ורעיון — כתבו לנו במילים שלכם (״תעלו את מחיר הסלמון ל-84״) ואנחנו נטפל. תראו את הסטטוס של כל בקשה, והתפריט יתעדכן אצלכם ואצל הצוות אוטומטית.",
  },
  {
    tab: "team",
    title: "כך מוסיפים חברי צוות",
    body: `אין טפסים: שתפו עם המלצרים את קוד הצוות שמופיע כאן למעלה${teamCode ? ` (${teamCode})` : ""} — למשל בקבוצת הוואטסאפ. כל אחד מוריד את אפליקציית הצוות, מזין את הקוד ואת שמו — וזהו, הוא בפנים ומתחיל ללמוד. אתם תראו אותו מופיע כאן ברגע שנכנס.`,
  },
  {
    tab: "team",
    title: "מעקב — מי למד ומי צריך תזכורת",
    body: "שתי תצוגות: ״מי למד היום״ — מי למד, מי נכנס ולא למד (הקבוצה שהכי שווה לשים לב אליה) ומי צריך תזכורת. ו״התקדמות ומבחנים״ — אחוז הידע של כל מלצר, המנות שהוא טועה בהן, תוצאות המבחנים וגרף השיפור שלו כמו גרף מניה.",
  },
  {
    tab: "settings",
    title: "ההגדרות (1/2) — הלב של מסלול הלמידה",
    body: "העצירה הכי חשובה בסיור. כאן קובעים מה חשוב לבחון (אלרגנים? מחירים? מרכיבים?), את סדר הקטגוריות בלימוד, את סף המעבר למבחן, את היעד היומי בדקות ואת בוחן ההיכרות למלצר חדש. הכל מאותחל להמלצה שלנו — אבל המסעדה שלכם, הכללים שלכם.",
  },
  {
    tab: "settings",
    title: "ההגדרות (2/2) — תפריט בריא וניהול החשבון",
    body: "גללו מטה: ״בדיקת בריאות תפריט״ מוצאת מנות עם מידע חסר ומתקנת קבוצות שלמות במכה — הצוות לומד רק ממה שמלא. מתחת: פרטי המסעדה, הוספת מנהלים נוספים עם סיסמה משלהם (בלי למסור את שלכם), והחלפת סיסמה. ואם תרצו לחזור על הסיור — הוא מחכה לכם כאן למעלה.",
  },
];

export default function GuidedTour({ onNavigate, onClose, teamCode, withWelcome = false }) {
  const STEPS = buildSteps(teamCode);
  const [welcome, setWelcome] = useState(withWelcome);
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const go = (i) => {
    setStep(i);
    onNavigate(STEPS[i].tab);
  };

  // Up-front welcome: a centered, unmissable modal with an explicit skip — the tour must
  // introduce itself, not wait to be discovered in settings.
  if (welcome) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6" dir="rtl">
        <div className="w-full max-w-sm bg-[#1c1e24] border border-[#6d5efc]/60 rounded-2xl p-6 shadow-2xl shadow-black/60 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#6d5efc]/15 flex items-center justify-center mx-auto">
            <Compass size={28} className="text-[#a79bff]" />
          </div>
          <div>
            <p className="text-lg font-black text-[#eef0f6]">ברוכים הבאים!</p>
            <p className="text-sm text-[#b9b9c9] leading-relaxed mt-2">
              בסיור קצר של שתי דקות נעבור יחד על כל מה שחשוב: איך מוסיפים ועורכים מנות,
              איך מצרפים את הצוות, ואיפה עוקבים אחרי מי שלמד. האפליקציה נשארת חיה מתחת —
              אפשר לנסות כל דבר תוך כדי.
            </p>
          </div>
          <button
            onClick={() => { setWelcome(false); onNavigate(STEPS[0].tab); }}
            className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#5b4ef0] transition"
          >
            התחילו את הסיור המודרך
          </button>
          <button
            onClick={onClose}
            className="w-full text-[#8a8aa0] font-bold py-2 text-xs hover:text-[#b9b9c9] transition"
          >
            דלגו בינתיים — אפשר תמיד לחזור דרך ההגדרות
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 max-w-md mx-auto px-3 pb-20 pointer-events-none">
      <div className="pointer-events-auto bg-[#1c1e24] border border-[#6d5efc]/60 rounded-2xl p-4 shadow-2xl shadow-black/60 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[#a79bff] bg-[#6d5efc]/15 px-2 py-0.5 rounded-full">
              סיור מודרך · {step + 1}/{STEPS.length}
            </span>
          </div>
          <button onClick={onClose} className="text-[#6a6a7e] flex items-center gap-1 text-[10px] font-bold" aria-label="דילוג על הסיור">
            דלגו <X size={14} />
          </button>
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
