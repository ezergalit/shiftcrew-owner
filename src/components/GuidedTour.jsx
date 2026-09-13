import { useState, useLayoutEffect, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, Compass, Hand } from "lucide-react";

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
// Rewritten 2026-09-01 against today's screens (user: the welcome video is out —
// the tour is the in-app tutorial again, and the settings button opens IT, not the
// video). The 28.8 version described the menu-health card and the learning-path
// panel, both removed from aurora since — the tour's fourth staleness incident.
// ⚠️ Every nav/content change ⇒ re-read these steps against the real screens.
const buildAuroraSteps = (teamCode) => [
  {
    tab: "home",
    title: "המסך הראשי — מי לומד",
    body: "כאן רואים את הצוות: מי למד היום, מי נכנס ולא למד, ומי עוד לא נכנס. הקשה על שם פותחת את הפרטים שלו — כמה מהתפריט הוא כבר יודע וציוני המבחנים. וליד מי שלא למד יש כפתור ✉ ששולח לו תזכורת ללמוד.",
  },
  {
    tab: "home",
    title: "תצוגת מלצר — האפליקציה של הצוות",
    body: "הכפתור «📱 תצוגת מלצר» ליד הברכה פותח את האפליקציה של הצוות, חיה, בדיוק כמו שמלצר רואה אותה. בוא/י נפתח אותה.",
    target: '[data-tour="waiter-view"]', cue: "הקש/י על «תצוגת מלצר»",
  },
  {
    title: "זה מה שהמלצר רואה",
    body: "אפשר לגלול בתפריט, להיכנס למנה, ולנסות את התרגול והבוחן — בדיוק כמו מלצר. כדאי להציץ כאן אחרי כל שינוי שעשית בתפריט, כדי לראות איך זה נראה אצלו. סוגרים ב-X למעלה.",
  },
  {
    tab: "menu",
    title: "התפריט — הקשה לעיון, הקשה נוספת לעריכה",
    body: "את התפריט אנחנו מזינים בשבילך, עם התמונות. הקשה על מנה פותחת אותה לקריאה, ומשם «עריכת המנה» משנה כל שדה — והשינוי מגיע לצוות מיד. הכוכב ⭐ מסמן מנה חשובה: היא תופיע ראשונה בתרגול ובמבחן. צריך שינוי גדול? כתוב/כתבי לנו בתיבה למטה.",
  },
  {
    tab: "settings",
    title: "ההגדרות — קוד ההצטרפות",
    body: `הקוד${teamCode ? ` ${teamCode}` : ""} הוא מה ששולחים לצוות — כפתור אחד משתף אותו בוואטסאפ, וכל מלצר נכנס עם הקוד והשם שלו, בלי סיסמה. מתחת נמצאת רשימת הצוות, ואפשר להוסיף עוד משתמש ניהול.`,
  },
  {
    tab: "settings",
    title: "על מה הצוות נבחן",
    body: "הסקשן עם ❓ מראה בדיוק אילו שאלות האפליקציה בונה מהתפריט שלך, עם דוגמאות מהמנות שלך. מכאן אפשר גם להריץ את הסיור הזה שוב בכל רגע.",
  },
  {
    tab: "home",
    title: "זהו — זה כל מה שצריך",
    body: "את/ה מסמן/ת מה חשוב ומתקן/ת מה שחסר; הצוות קורא, מתרגל ונבחן. כאן במסך הראשי רואים בכל רגע מי מתקדם ולמי כדאי לשלוח תזכורת.",
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

// ── הזרקור ───────────────────────────────────────────────────────────────────
// 13.9 (יותם: «הסיור נראה זול»). עד היום הסיור של הניהול היה כרטיס תחתון עם «הבא» —
// המנהל קרא שבע פסקאות והגיע למסכים שמעולם לא נגע בהם. עכשיו אותו מנוע של אפליקציית
// המלצר: המסך מוחשך חוץ מהאלמנט האמיתי, והדרך היחידה להתקדם בצעד כזה היא להקיש עליו.
// ⚠️ Dim ברמת מודול (לא בתוך הרנדור) — קומפוננטה שנוצרת מחדש בכל רנדור מתמוטטת ונבנית
// מחדש, וה-transition לעולם לא רץ. זה היה השורש של «הדיליי» בסיור של המלצר.
const GLIDE_MS = 170;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const GLIDE = ["top", "left", "width", "height"].map((k) => `${k} ${GLIDE_MS}ms ${EASE}`).join(", ");

function Dim({ style }) {
  return (
    <div
      className="absolute pointer-events-auto"
      style={{ background: "rgba(0,0,0,0.72)", transition: `${GLIDE}, opacity 160ms`, touchAction: "none", overscrollBehavior: "contain", ...style }}
      onWheel={(e) => e.preventDefault()}
    />
  );
}

const near = (a, b) => Math.abs(a - b) < 0.5;
const sameRect = (a, b) => a === b || (!!a && !!b && near(a.top, b.top) && near(a.left, b.left) && near(a.width, b.width) && near(a.height, b.height));
let LAST_HOLE = null;

function useTargetRect(selector, step) {
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    if (!selector) { setRect(null); return; }
    let alive = true, raf = 0, ro = null, watched = null, scrolled = false;
    const schedule = () => { if (alive && !raf) raf = requestAnimationFrame(measure); };
    const measure = () => {
      raf = 0;
      if (!alive) return;
      const el = document.querySelector(selector);
      if (el && !scrolled) { scrolled = true; el.scrollIntoView({ block: "center", behavior: "auto" }); }
      if (el !== watched) {
        ro?.disconnect(); ro = null; watched = el;
        if (el && typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(schedule); ro.observe(el); }
      }
      const r = el ? el.getBoundingClientRect() : null;
      const next = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };
    measure();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-tour", "hidden"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    document.addEventListener("animationend", schedule, true);
    document.addEventListener("transitionend", schedule, true);
    const t = setInterval(schedule, 400);
    return () => {
      alive = false; mo.disconnect(); ro?.disconnect(); clearInterval(t);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      document.removeEventListener("animationend", schedule, true);
      document.removeEventListener("transitionend", schedule, true);
    };
  }, [selector, step]);
  return rect;
}

export default function GuidedTour({ onNavigate, onClose, onSetupNow, teamCode, withWelcome = false, aurora = false, tasksOff = aurora }) {
  // ⚠️ Two different flags. The CONTENT is chosen by `tasksOff`, because that is what
  // removes the daily update, the checklists and the owner's task list that the original
  // steps describe. The COLOUR is chosen by `aurora`. They happen to be on together today,
  // and defaulting tasksOff to aurora keeps that true, but a restaurant given one without
  // the other would otherwise be toured through screens it does not have.
  const STEPS = tasksOff ? buildAuroraSteps(teamCode) : buildSteps(teamCode);
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
    if (STEPS[i]?.tab) onNavigate(STEPS[i].tab);
  };
  const rect = useTargetRect(s.target, step);
  // צעד עם יעד: מקדם רק כשמקישים על האלמנט האמיתי (capture — גם ההנדלר של האפליקציה רץ).
  const firedRef = useRef(-1);
  useEffect(() => {
    if (!s.target) return;
    const onClick = (e) => {
      if (firedRef.current >= step) return;
      const el = document.querySelector(s.target);
      if (el && (el === e.target || el.contains(e.target))) { firedRef.current = step; go(step + 1); }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [s.target, step]);
  // «לא רואים את זה?» רק אחרי חסד — לא בפריים הראשון של הצעד
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setMissing(false);
    if (!s.target || rect) return;
    const t = setTimeout(() => setMissing(true), 700);
    return () => clearTimeout(t);
  }, [s.target, rect, step]);
  const pad = 6;
  const live = rect && { top: Math.max(0, rect.top - pad), left: Math.max(0, rect.left - pad), width: rect.width + pad * 2, height: rect.height + pad * 2 };
  if (live) LAST_HOLE = live;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 375;
  const hole = live;
  const geo = hole || LAST_HOLE || { top: vh / 2, left: vw / 2, width: 0, height: 0 };

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

  // הכרטיס יושב מעל היעד או מתחתיו, כדי לא לכסות בדיוק את מה שהוא מצביע עליו.
  const cardAtTop = hole ? hole.top + hole.height > vh * 0.55 : false;
  return createPortal(
    <div className="fixed inset-0 z-[80] pointer-events-none" dir="rtl">
      {s.target && (<>
        <Dim style={{ top: 0, left: 0, right: 0, height: geo.top }} />
        <Dim style={{ top: geo.top + geo.height, left: 0, right: 0, bottom: 0 }} />
        <Dim style={{ top: geo.top, left: 0, width: geo.left, height: geo.height }} />
        <Dim style={{ top: geo.top, left: geo.left + geo.width, right: 0, height: geo.height }} />
        <div className="absolute rounded-2xl pointer-events-none animate-tour-ring"
          style={{ ...geo, opacity: hole ? 1 : 0, transition: `${GLIDE}, opacity 160ms` }} />
      </>)}
      <div className={`absolute inset-x-0 mx-auto w-full max-w-md px-3 ${s.target ? (cardAtTop ? "top-0 pt-[max(0.75rem,env(safe-area-inset-top))]" : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]") : "bottom-0 pb-20"}`}>
      <div key={step} className={`animate-tour-step pointer-events-auto bg-[#15202b] border ${accent.card} rounded-2xl p-4 shadow-2xl shadow-black/60 space-y-3`}>
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
        ) : s.target ? (
          <div className="space-y-2">
            {/* אין «הבא» — הצעד נגמר כשמקישים על הדבר עצמו. לקרוא על מסך ולהשתמש בו אינם אותו שיעור. */}
            <div className="flex items-center gap-2 bg-[#22c08c]/10 border border-[#22c08c]/40 rounded-xl px-3 py-2.5">
              <Hand size={15} className="text-[#22c08c] flex-shrink-0" />
              <p className="text-[12px] font-black text-[#22c08c]">{s.cue}</p>
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button onClick={() => go(step - 1)} className="bg-[#22252b] text-[#8a8aa0] font-bold py-2 px-4 rounded-lg text-xs">הקודם</button>
              )}
              {missing && (
                <button onClick={() => go(step + 1)} className="flex-1 bg-[#22252b] text-[#c4c4d4] font-bold py-2 rounded-lg text-xs">לא רואים את זה? אפשר להמשיך ←</button>
              )}
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
    </div>
  , document.body);
}
