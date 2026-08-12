// What a restaurant can choose to test its team on.
//
// ⚠️ Mirrors FACETS in shiftcrew-waiter/src/lib/questionEngine.js. The two apps are
// separate repos with separate deploys, so there is no shared package to import from —
// if you add or rename a facet, change BOTH files or the owner will rank something the
// waiter app never asks. The keys are the contract; they are what gets stored in
// menu_app.exam_config.facets.
//
// `requires` is why the owner never sees an option their menu can't support: no prices on
// the menu means no "price" row to rank, so nobody ranks a category of question that
// would then silently produce nothing.

const hasChangesTail = (d) => String(d.description || "").includes("שינויים:");
const baseDescription = (d) => String(d.description || "").split("שינויים:")[0].trim();

// A category label carrying preparation detail ("מאקי — 6 יחידות, אצה בחוץ") is worth
// testing. A plain course name (ראשונות / עיקריות) is not: "is a sea bass a starter or a
// dessert" is answerable by anyone who has eaten in a restaurant before.
const isStructuralCategory = (c) => /[—–-]/.test(c || "") && /\d/.test(c || "");

export const FACET_META = {
  allergens: {
    label: "אלרגנים",
    hint: "מי לא יכול לאכול מה — השאלה שאורח שואל בפועל",
    why: "הטעות היחידה ברשימה שיכולה להזיק לאורח",
    requires: (items) => items.filter((d) => (d.allergens || []).length).length >= 2,
    missing: "אף מנה לא מסומנת עם אלרגנים",
  },
  ingredients: {
    label: "מרכיבים",
    hint: "ממה המנה עשויה",
    why: "הבסיס לכל שאלה אחרת",
    requires: (items) => items.filter((d) => (d.ingredients || []).length >= 3).length >= 2,
    missing: "צריך לפחות 2 מנות עם 3 מרכיבים ומעלה",
  },
  description: {
    label: "תיאור המנה",
    hint: "לזהות מנה לפי התיאור ולהפך",
    why: "מה שמלצר אומר לשולחן",
    requires: (items) => items.filter((d) => baseDescription(d)).length >= 4,
    missing: "צריך לפחות 4 מנות עם תיאור",
  },
  changes: {
    label: "שינויים אפשריים",
    hint: "מה מותר לשנות במנה",
    why: "מונע הבטחות שהמטבח לא יכול לקיים",
    requires: (items) => items.filter(hasChangesTail).length >= 3,
    missing: 'צריך לפחות 3 מנות עם "שינויים:" בתיאור',
  },
  serving: {
    label: "אופן ההגשה",
    hint: "כמות יחידות וצורת הגשה",
    why: "רלוונטי כשלקטגוריות יש משמעות מבנית",
    requires: (items) => {
      const cats = [...new Set(items.map((d) => d.category).filter(Boolean))];
      return cats.length >= 3 && cats.every(isStructuralCategory);
    },
    missing: "הקטגוריות כאן הן שמות מנה רגילים, לא צורות הגשה",
  },
  price: {
    label: "מחיר",
    hint: "רק מנות שהמחיר לא כתוב בשם שלהן",
    why: "הכי קל לבדוק תוך כדי משמרת, ולכן אחרון",
    requires: (items) =>
      items.filter((d) => Number(d.price) > 0 && !String(d.name).includes(String(Number(d.price)))).length >= 4,
    missing: "צריך לפחות 4 מנות עם מחיר שלא מופיע בשם המנה",
  },
};

// Our recommendation, in order. Allergens lead because getting them wrong is the only
// mistake here that can hurt someone; price trails because it is the easiest thing to
// look up mid-shift.
export const RECOMMENDED_FACETS = ["allergens", "ingredients", "description", "changes", "serving", "price"];

export const facetsForMenu = (items) =>
  RECOMMENDED_FACETS.filter((k) => FACET_META[k].requires(items || []));

export const DEFAULT_PATH = {
  pass_threshold: 50,
  gate_games: true,
  baseline_enabled: true,
  baseline_minutes: 7,
};
