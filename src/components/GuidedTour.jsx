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
// ⚠️ These stops must describe the screens as they ARE. The tour drifted twice behind
// nav changes, and for a first-time owner a tour that describes screens that no longer
// exist is worse than no tour. Any change to the home views, the header buttons or the
// tabs ⇒ re-read every step here.
// ⚠️ Under the «אורורה» skin there are no tasks, no daily brief, no shift checklists and
// no 📊 button — `features.tasks === false` removed all of them. The original tour still
// described every one of those screens, which would have walked a new owner through an
// app that does not exist for them. Same trap as the two earlier navigation changes: a
// tour is content, and content goes stale the moment the screens move.
const buildAuroraSteps = (teamCode) => [
  {
    tab: "home",
    title: "הבית — מה מצב התפריט ומי לומד",
    body: "שלושה מספרים פותחים את היום: כמה מהתפריט הצוות כבר שולט בו, כמה מנות יש, וכמה אנשים למדו היום. אין כאן שום דבר למלא — הכל נגזר מעצמו ממה שקורה באפליקציה של הצוות.",
  },
  {
    tab: "home",
    title: "בריאות התפריט — מה חסר כדי ללמד",
    body: "מנה בלי תיאור אי אפשר לבנות עליה שאלות, ומנה בלי אלרגיות היא שדה בטיחות ריק. הכרטיס הזה מוצא אותן בשבילכם — לחיצה על שורה פותחת את המנה, ואם יש כמה, את מסך התיקון הקבוצתי. מתחתיו: המנות שהצוות הכי טועה בהן, והקשה מדגישה מנה ⭐ כדי שתקפוץ ראשונה בתרגול.",
  },
  {
    tab: "menu",
    title: "התפריט — לחיצה על מנה פותחת אותה",
    body: "את התפריט אנחנו מזינים בשבילכם, עם התמונות. לחיצה על מנה פותחת אותה לעריכה מלאה — שם, מחיר, תיאור, מרכיבים ואלרגיות — והשינוי מגיע לצוות מיד. אפשר לסנן לפי תפריט וקטגוריה או לחפש מנה בשם. רוצים שינוי גדול? כתבו לנו בתיבה שבתחתית ואנחנו נטפל.",
  },
  {
    tab: "settings",
    title: "ההגדרות — קוד ההצטרפות ומסלול הלמידה",
    body: `בראש המסך קוד ההצטרפות${teamCode ? ` (${teamCode})` : ""} — שיתוף בוואטסאפ בלחיצה, וכל מלצר נכנס עם הקוד והשם שלו, בלי סיסמאות. מתחתיו הצוות עם אחוז הידע של כל אחד, ומסלול הלמידה שכבר מוגדר להמלצה שלנו — אפשר לכוונן, ואפשר לא לגעת.`,
  },
  {
    tab: "home",
    title: "זהו! המטרה: שהצוות יעבור את המבחנים",
    body: "אתם מתקנים מה שחסר בתפריט ומדגישים מה שחשוב; הצוות מתרגל ונבחן. אתם רואים כאן מי מתקדם — כל השאר קורה מעצמו. אפשר לחזור לסיור הזה בכל רגע דרך ההגדרות.",
  },
];

const buildSteps = (teamCode) => [
  {
    tab: "home",
    title: "הבית — רשימת המשימות שלכם",
    body: "האפליקציה אומרת לכם בכל רגע מה הדבר הבא: ״משימות היום״ — העדכון לצוות והצ׳קליסטים של המשמרת, ו״משימות התפריט״ — מה שחסר בתפריט כדי שהצוות ילמד ממנו. כל שורה נפתחת בלחיצה, ומה שסיימתם יורד לתחתית המסך. סיימתם את הרשימה? היום מסודר.",
  },
  {
    tab: "home",
    title: "העדכון היומי — ההרגל של כל בוקר",
    body: "המשימה הראשונה בכל יום: מה חסר, על מה להמליץ ומה בהכנה. פשוט מקלידים — מנה מהתפריט תושלם אוטומטית, וכל דבר אחר יישמר כמו שכתבתם. הצוות רואה את העדכון באפליקציה שלו לפני המשמרת, ועונה על שאלת הבנה קצרה כדי שתדעו שבאמת קראו.",
  },
  {
    tab: "home",
    title: "הצ׳קליסטים של המשמרת",
    body: "פתיחה, כללי שירות וסגירה — מה שהצוות מסמן בכל יום. לא צריך לכתוב כלום: נכנסים לשורה, ״הוספה מהספרייה״, והצ׳קליסט המומלץ נכנס בלחיצה אחת. אפשר לערוך כל משימה למילים שלכם (✏️), להוסיף משימה קבועה או ״להיום בלבד״, ולראות כמה עובדים סימנו.",
  },
  {
    tab: "home",
    title: "📊 — איך הצוות מתקדם",
    body: "הכפתור למעלה פותח את המעקב: מי למד היום ומי רק נכנס בלי ללמוד, אחוז הידע של כל אחד, ציוני המבחנים ומי קרא את העדכון. לחיצה על עובד פותחת את כל הפרטים שלו, וליד מי שלא למד יש ✉ לשליחת תזכורת אישית. ו״תצוגת מלצר״ שליד מראה לכם בדיוק מה הצוות רואה.",
  },
  {
    tab: "menu",
    title: "התפריט — לחיצה על מנה פותחת אותה",
    body: "את התפריט אנחנו מזינים בשבילכם. לחיצה על מנה פותחת אותה לעריכה מלאה — שם, מחיר, תיאור, מרכיבים ואלרגנים — והכוכב ⭐ מסמן מנה שחשוב לכם שהצוות ידע; היא תקבל עדיפות בלימוד. רוצים שינוי גדול? כתבו לנו בתיבה שלמעלה ואנחנו נטפל.",
  },
  {
    tab: "settings",
    title: "ההגדרות — הצוות, המבחנים והחשבון",
    body: `ב״הצוות שלי״ מחכה קוד ההצטרפות${teamCode ? ` (${teamCode})` : ""} — שתפו אותו בקבוצת הוואטסאפ, וכל מלצר נכנס עם הקוד והשם שלו, בלי סיסמאות. ״מה הצוות נבחן עליו״ כבר מוגדר להמלצה שלנו ואפשר לדייק בכל רגע, ו״בדיקת בריאות התפריט״ מוצאת מנות עם מידע חסר ומתקנת קבוצות שלמות במכה.`,
  },
  {
    tab: "home",
    title: "זהו! המטרה: שהצוות יעבור את המבחנים",
    body: "חשוב לזכור — המשחקים הם רק האימון. המטרה היא שכל מלצר יעבור את בוחני הקטגוריות, ובסוף את מבחן התפריט המלא. אתם כותבים עדכון בבוקר ובודקים ב-📊 מי מתקדם; כל השאר קורה מעצמו. אפשר לחזור לסיור הזה בכל רגע דרך ההגדרות.",
  },
];

export default function GuidedTour({ onNavigate, onClose, onSetupNow, teamCode, withWelcome = false, aurora = false }) {
  const STEPS = aurora ? buildAuroraSteps(teamCode) : buildSteps(teamCode);
  const [welcome, setWelcome] = useState(withWelcome);
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  // One brand colour. The tour's sky-blue is the unskinned app's; under «אורורה» it is
  // the only thing on screen that is not emerald, and it reads as a foreign dialog.
  const accent = aurora
    ? { card: "border-[#22c08c]/50", pill: "text-[#22c08c] bg-[#22c08c]/12", cta: "bg-[#22c08c] text-[#06231A] hover:bg-[#1aa87a]", dot: "bg-[#22c08c]", icon: "text-[#22c08c]", iconBg: "bg-[#22c08c]/15" }
    : { card: "border-[#38bdf8]/60", pill: "text-[#7dd3fc] bg-[#38bdf8]/15", cta: "bg-[#0ea5e9] text-white hover:bg-[#0284c7]", dot: "bg-[#38bdf8]", icon: "text-[#7dd3fc]", iconBg: "bg-[#38bdf8]/15" };

  const go = (i) => {
    setStep(i);
    onNavigate(STEPS[i].tab);
  };

  // Up-front welcome: a centered, unmissable modal with an explicit skip — the tour must
  // introduce itself, not wait to be discovered in settings.
  if (welcome) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6" dir="rtl">
        <div className={`w-full max-w-sm bg-[#15202b] border ${accent.card} rounded-2xl p-6 shadow-2xl shadow-black/60 text-center space-y-4`}>
          <div className={`w-14 h-14 rounded-2xl ${accent.iconBg} flex items-center justify-center mx-auto`}>
            <Compass size={28} className={accent.icon} />
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
            className={`w-full ${accent.cta} font-bold py-3 rounded-xl text-sm transition`}
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
      <div className={`pointer-events-auto bg-[#15202b] border ${accent.card} rounded-2xl p-4 shadow-2xl shadow-black/60 space-y-3`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold ${accent.pill} px-2 py-0.5 rounded-full`}>
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
        {/* The tour's exit is a fork, not a dead end: the primary action hands the owner
            straight to the learning-path settings ("שיהיה להם אופציה לערוך הכל"), so
            configuring the restaurant is the tour's natural next step, not a discovery. */}
        {last ? (
          <div className="space-y-2">
            <button
              onClick={() => (onSetupNow || onClose)()}
              className={`w-full ${accent.cta} font-bold py-2.5 rounded-lg text-xs transition`}
            >
              הגדירו את המסעדה שלכם עכשיו ←
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => go(step - 1)}
                className="bg-[#22252b] text-[#8a8aa0] font-bold py-2 px-4 rounded-lg text-xs hover:bg-[#2c2e35] transition"
              >
                הקודם
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-[#22252b] text-[#8a8aa0] font-bold py-2 rounded-lg text-xs hover:bg-[#2c2e35] transition"
              >
                אחר כך — לעבודה!
              </button>
            </div>
          </div>
        ) : (
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
              onClick={() => go(step + 1)}
              className={`flex-1 ${accent.cta} font-bold py-2 rounded-lg text-xs transition flex items-center justify-center gap-1`}
            >
              הבא <ChevronLeft size={14} />
            </button>
          </div>
        )}
        <div className="flex justify-center gap-1">
          {STEPS.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === step ? accent.dot : "bg-[#3a3d46]"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
