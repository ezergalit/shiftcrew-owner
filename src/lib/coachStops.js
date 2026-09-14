// ══ צ׳קפוינטים: כל מסך מסביר את עצמו בפעם הראשונה שמגיעים אליו (יותם, 14.9) ══
//
// הגרסה הקודמת הייתה רצף: ארבעה משפטים בסדר שקבענו, שרץ פעם אחת בכניסה הראשונה.
// הוא לימד את ארבעת המסכים שבמסלול, ומסך שהמנהל גילה בעצמו נשאר בלי הסבר.
//
// עכשיו לכל מסך יש שורה משלו, והיא מופיעה ברגע שמגיעים אליו — בכל סדר, ולאורך זמן.
// ⚠️ המסך נגזר מ**מצב האפליקציה** (`screenOf`) ולא מה-DOM, בדיוק כמו הפס עצמו: אין
// מדידה, אין עוגנים, ומסך שזז משנה טקסט ולא מנגנון. זה מה שסוגר את הדריפט שהפיל את
// `GuidedTour` חמש פעמים.

const KEY = "menu-app-coach-seen";

export const STOPS = {
  home: "זה מסך הבית — מי מהצוות למד היום. ✉ שולח תזכורת בהקשה אחת.",
  "menu-door": "התפריטים של המסעדה. בוחרים תפריט, ואז קטגוריה שבתוכו.",
  "menu-group": "הקטגוריות של התפריט הזה.",
  "menu-cat": "המנות של הקטגוריה. הקשה על מנה פותחת אותה לעיון.",
  "menu-dish": "עיון במנה — רק מה שמסומן בה. ״עריכת המנה״ פותח את השדות, וכל שינוי מגיע לצוות מיד.",
  "menu-end": "סיימתם לעבור על הקטגוריה. מכאן ממשיכים לבאה או חוזרים לתפריטים.",
  settings: "כאן קוד ההצטרפות של הצוות, ו״תצוגת מלצר״ שמראה בדיוק מה הם רואים.",
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
