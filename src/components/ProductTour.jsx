import { useState } from "react";
import {
  Home, CalendarDays, CalendarCheck, Users, Utensils, Smartphone,
  Sparkles, ArrowLeft, ArrowRight, X, Check, ChefHat,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// ProductTour — a one-time guided walk-through shown the first time a returning
// owner lands in the main app (first-run owners get the SetupWizard instead, so
// they skip this). It's a step-through card stack explaining each tab. Purely
// presentational; closing it persists a flag in App.jsx so it never nags again.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: ChefHat,
    title: "ברוך הבא ל-ShiftCrew 👋",
    body: "סיור קצר בן רגע — נראה לך איפה כל דבר. אפשר לדלג בכל שלב.",
    tag: "סיור מהיר",
  },
  {
    icon: Home,
    title: "בית",
    body: "מבט-על על השבוע: שיבוצים, עלות שכר, ותובנות חכמות מה-AI שמנטר את הסידור שלך ומציע פעולות רק כשבאמת צריך.",
    tag: "בית",
  },
  {
    icon: CalendarDays,
    title: "סידור עבודה",
    body: "בנה/י את הסידור השבועי לפי יום ומשמרת. הקש/י על משמרת כדי לשבץ עובדים — מסודרים לפי הזמינות שהגישו — ופרסם/י לצוות.",
    tag: "סידור",
  },
  {
    icon: CalendarCheck,
    title: "זמינות",
    body: "כאן רואים מי מהצוות הגיש זמינות לשבוע הבא, כמה משמרות ביקש/ה ולמה זמין/ה — לפני שמתחילים לשבץ.",
    tag: "זמינות",
  },
  {
    icon: Smartphone,
    title: "צוות — גישה בלי הרשמה",
    body: "מוסיף/ה מלצר/ית עם מספר טלפון, וזהו. הוא/היא פותח/ת את אפליקציית המלצרים ומקליד/ה את אותו מספר — בלי סיסמה. רק מי שהוספת נכנס/ת.",
    tag: "צוות",
  },
  {
    icon: Utensils,
    title: "תפריט + מאמן AI",
    body: "ערוך/י את התפריט, סמן/י מנת היום ובחר/י מה הכי חשוב שהצוות יידע. ה-AI הופך את זה לתרגול יומי — ואתה פותר 'פרסם' כדי לשלוח למלצרים.",
    tag: "תפריט",
  },
];

export default function ProductTour({ onClose }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-50 max-w-md mx-auto flex flex-col justify-end" dir="rtl">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#16181c] rounded-t-3xl border-t border-[#22252b] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Close */}
        <button onClick={onClose} className="absolute top-4 left-4 text-gray-500 active:text-gray-300">
          <X size={22} />
        </button>

        {/* Icon */}
        <div className="w-16 h-16 rounded-3xl bg-[#15302b] flex items-center justify-center mb-4">
          <Icon size={32} className="text-[#2f9e8f]" />
        </div>

        <span className="text-[11px] font-black text-[#3fd0bc] bg-[#15302b] px-2.5 py-1 rounded-full inline-flex items-center gap-1">
          <Sparkles size={12} /> {step.tag}
        </span>

        <h2 className="text-xl font-black text-gray-100 mt-3">{step.title}</h2>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">{step.body}</p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-5">
          {STEPS.map((_, idx) => (
            <span key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? "w-5 bg-[#2f9e8f]" : "w-1.5 bg-[#33363d]"}`} />
          ))}
        </div>

        {/* Nav */}
        <div className="flex items-center gap-2 mt-5">
          {i > 0 && (
            <button onClick={() => setI((n) => n - 1)}
              className="rounded-2xl py-3.5 px-5 font-bold text-sm bg-[#191b1f] text-gray-300 active:bg-[#20232a] flex items-center gap-1.5">
              <ArrowRight size={16} /> הקודם
            </button>
          )}
          <button
            onClick={() => (last ? onClose() : setI((n) => n + 1))}
            className="flex-1 rounded-2xl py-3.5 font-black text-base bg-[#2a8576] text-white active:bg-[#247567] flex items-center justify-center gap-2">
            {last ? <><Check size={18} /> מתחילים</> : <>הבא <ArrowLeft size={18} /></>}
          </button>
        </div>

        {!last && (
          <button onClick={onClose} className="w-full text-center text-[13px] font-bold text-gray-500 mt-3 active:text-gray-300">
            דלג/י על הסיור
          </button>
        )}
      </div>
    </div>
  );
}
