// What a waiter might have to warn a guest about — split into groups, because they are
// different kinds of fact and get answered differently at the table.
//
// They used to share one `allergens` field, which made the field meaningless: "fish" (a
// real allergy) sat next to "raw fish" (a pregnancy warning) next to "coriander" (someone
// just doesn't like it). A waiter reading one list can't tell which one can send a guest
// to hospital.
//
// ⚠️ MIRRORED in shiftcrew-waiter/src/lib/dishFlags.js. Two repos, no shared package —
// a change here must be made there too, or the owner will track a group the waiter app
// can't teach. The `key` values are the contract; they are what's stored in the DB.

export const FLAG_GROUPS = [
  {
    key: "allergens",
    label: "אלרגנים",
    short: "אלרגיה",
    // The only group where being wrong is dangerous rather than annoying.
    description: "יכול לגרום לתגובה אלרגית — כולל אנפילקסיס. חובה לדעת בדיוק.",
    severity: "critical",
    column: "allergens",
    recommended: true,
    values: ["גלוטן", "לקטוז", "ביצים", "אגוזים", "בוטנים", "רכיכות", "סויה", "שומשום"],
  },
  {
    key: "pregnancy",
    label: "רגישות בהריון",
    short: "הריון",
    description: "מרכיבים שנשים בהריון נמנעות מהם. לא אלרגיה — סיכון אחר לגמרי.",
    severity: "high",
    column: "pregnancy",
    recommended: true,
    values: [
      "דג נא", "בשר נא", "ביצה חיה", "גבינה לא מפוסטרת", "חלב לא מפוסטר",
      "דגים עתירי כספית", "נבטים חיים", "כבד", "אלכוהול",
    ],
  },
  {
    key: "pitfalls",
    label: "מוקשים והעדפות",
    short: "מוקש",
    description: "מרכיבים שאנשים מבקשים להוריד — טעם, לא בטיחות.",
    severity: "normal",
    column: "pitfalls",
    recommended: true,
    values: [
      "כוסברה", "חריף", "שום", "בצל", "ג'ינג'ר", "וסאבי", "מיונז",
      "טחינה", "אלכוהול", "זיתים", "פטריות", "חמוצים", "גבינה כחולה",
    ],
  },
  {
    key: "kashrut",
    label: "כשרות",
    short: "כשרות",
    description: "בשרי / חלבי / פרווה, ומרכיבים שאינם כשרים.",
    severity: "high",
    column: "kashrut",
    recommended: false, // only relevant to some restaurants — ask, don't assume
    values: ["בשרי", "חלבי", "פרווה", "לא כשר", "חזיר", "פירות ים", "בשר וחלב יחד"],
  },
];

export const FLAG_GROUP_BY_KEY = Object.fromEntries(FLAG_GROUPS.map((g) => [g.key, g]));

// Values we accept for a group. Anything else is dropped rather than shown to a waiter
// as fact — the same rule the parser applies server-side.
export const isValidFlag = (groupKey, value) =>
  Boolean(FLAG_GROUP_BY_KEY[groupKey]?.values.includes(value));

// A restaurant that has never been asked gets the recommended set, so the app is useful
// before anyone opens settings. `tracked_flags` is [] until the owner answers.
export const effectiveTrackedFlags = (tracked) =>
  tracked?.length ? tracked : FLAG_GROUPS.filter((g) => g.recommended).map((g) => g.key);
