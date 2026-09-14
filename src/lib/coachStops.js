// ══ צ׳קפוינטים: כל מסך מסביר את עצמו בפעם הראשונה שמגיעים אליו (יותם, 14.9) ══
//
// הגרסה הקודמת הייתה רצף: ארבעה משפטים בסדר שקבענו, שרץ פעם אחת בכניסה הראשונה.
// הוא לימד את ארבעת המסכים שבמסלול, ומסך שהמנהל גילה בעצמו נשאר בלי הסבר.
//
// עכשיו לכל מסך יש שורה משלו, והיא מופיעה ברגע שמגיעים אליו — בכל סדר, ולאורך זמן.
// ⚠️ המסך נגזר מ**מצב האפליקציה** (`screenOf`) ולא מה-DOM, בדיוק כמו הפס עצמו: אין
// מדידה, אין עוגנים, ומסך שזז משנה טקסט ולא מנגנון. זה מה שסוגר את הדריפט שהפיל את
// `GuidedTour` חמש פעמים.

// ⚠️ הגרסה הראשונה סימנה שורה כ«נראתה» ברגע שהוצגה — אז מקש «אחורה» העלים אותה
// לתמיד (יותם, 14.9). מעכשיו שורה ננעלת רק ב«הבנתי» או אחרי כמה צעדים קדימה —
// לכן מפתח אחסון חדש: מה שהסימון הישן «שרף» בטעות חוזר להופיע תחת הכללים הנכונים.
const KEY = "menu-app-coach-seen2";

// כמה צעדי «קדימה» מעלימים שורה שלא אושרה ב«הבנתי». חזרה אחורה ומעבר בין
// טאבים אינם קדימה — השורה תופיע שוב בביקור הבא באותו מסך.
export const FORWARD_DISMISS = 3;

// עומק לכל מסך — הציר שעליו «קדימה» נמדד. מסכי שורש = 0.
const DEPTH = { home: 0, settings: 0, "menu-door": 0, "menu-group": 1, "menu-cat": 2, "menu-dish": 3, "menu-end": 3 };

// prev ⇒ next הוא צעד קדימה? `null` הוא מסך בלי שורה (עורך המנה) — כניסה אליו
// היא קדימה, יציאה ממנו חזרה.
export function isForward(prev, next) {
  if (prev === next || prev == null) return false;
  if (next == null) return true;
  return (DEPTH[next] ?? 0) > (DEPTH[prev] ?? 0);
}

export const STOPS = {
  // 🔴 «תצוגת מלצר» יושבת כאן, ליד הברכה — לא בהגדרות (נבדק: OwnerHome, au-head).
  // השורה הישנה שלחה לחפש אותה בטאב הלא נכון.
  home: "כאן רואים מי מהצוות למד, ומי צריך תזכורת. «תצוגת מלצר» למעלה מראה בדיוק מה הם רואים.",
  // 🔴 המסך כבר מדפיס «בוחרים תפריט, ואז קטגוריה» בכותרת. שורה שחוזרת על מה
  // שכתוב מעליה היא רעש — אז היא אומרת את מה שאין שם.
  "menu-door": "כל מה שהצוות לומד יושב כאן — התפריטים וגם ההדרכות. החיפוש למעלה מוצא מנה או מרכיב.",
  "menu-group": "הקטגוריות של התפריט הזה, וכמה מנות בכל אחת.",
  "menu-cat": "המנות של הקטגוריה. הצבעים למעלה הם האזהרות שהצוות רואה על כל מנה.",
  "menu-dish": "כאן רואים את המנה כמו שהצוות רואה אותה. «עריכת המנה» פותח את השדות, וכל שינוי מגיע אליהם מיד.",
  "menu-end": "סיימתם לעבור על הקטגוריה. מכאן ממשיכים לבאה או חוזרים לתפריטים.",
  // 🔴 «תצוגת מלצר» הוסרה מכאן — היא במסך הבית.
  settings: "קוד ההצטרפות לצוות, ניהול העובדים, ועל מה הם נבחנים.",
};

// מצב האפליקציה ⇒ שם המסך. הסדר הוא סדר העומק: הפנימי ביותר מנצח.
export function screenOf({ tab, stage, showAddForm }) {
  // ⚠️ עורך המנה מחליף את מסך העיון שמארח את הפס, ולכן שורה משלו הייתה נצרכת בלי
  // להיראות (נמדד). מה שחשוב בו — «כל שינוי מגיע לצוות מיד» — נאמר בשורת מסך המנה.
  if (showAddForm) return null;
  if (tab === "menu") {
    if (stage?.viewing) return "menu-dish";
    if (stage?.deep) return "menu-end";      // מסך סוף-הקטגוריה — deep בלי viewing
    if (stage?.cat) return "menu-cat";
    if (stage?.group) return "menu-group";
    return "menu-door";
  }
  if (tab === "settings") return "settings";
  if (tab === "home") return "home";
  return null;
}

// ⚠️ פר-מסעדה ופר-מכשיר. מכשיר חדש מתחיל מחדש — זה הרגל, לא אבטחה, והחזרה עולה
// שורה אחת למסך. מנהל משני על מכשיר משלו מקבל את ההסברים כמו שצריך.
export function loadSeen(restaurantId) {
  if (!restaurantId) return new Set();
  try {
    const raw = localStorage.getItem(`${KEY}:${restaurantId}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

export function markSeen(restaurantId, screen, seen) {
  const next = new Set(seen);
  next.add(screen);
  if (restaurantId) {
    try { localStorage.setItem(`${KEY}:${restaurantId}`, JSON.stringify([...next])); } catch { /* private mode */ }
  }
  return next;
}

// «המדריך» בהגדרות: מנקה את מה שנראה, וכל שורה חוזרת בדרכה.
export function resetSeen(restaurantId) {
  if (restaurantId) {
    try { localStorage.removeItem(`${KEY}:${restaurantId}`); } catch { /* private mode */ }
  }
  return new Set();
}
