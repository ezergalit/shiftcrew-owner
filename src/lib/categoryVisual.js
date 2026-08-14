// Category-derived visuals — the "בינתיים" layer of dish images: every category gets a
// recognizable emoji on its own gradient, matched by keywords in the category's OWN name.
// That makes it unique per restaurant for free (a sushi bar and a steakhouse never look
// alike), and a real photo (menu_items.image_url) always wins over it.
//
// ⚠️ Duplicated in shiftcrew-waiter/src/lib/categoryVisual.js — change both together.
const RULES = [
  [/אלכוהול|קוקטייל|יין|wine|cocktail|בירה|beer|וודקה|vodka|ויסקי|whisk|ערק|גי'ן|ג'ין|gin|רום|טקילה/i, { emoji: "🍸", from: "#3b2b5e", to: "#6d5efc" }],
  [/סושי|sushi|רול|roll|ניגירי|סשימי/i, { emoji: "🍣", from: "#16324f", to: "#4f9cf9" }],
  [/דג|fish|ים\b|seafood|פירות ים/i, { emoji: "🐟", from: "#163a4f", to: "#38bdf8" }],
  [/עיקרי|main|בשר|meat|גריל|grill|סטייק|steak|המבורגר|burger/i, { emoji: "🥩", from: "#4a1d24", to: "#e0315a" }],
  [/ראשונ|פתיח|starter|appetizer|מתאבנ|לחמ|bread|טאפס/i, { emoji: "🍟", from: "#4a3419", to: "#f3a712" }],
  [/קינוח|dessert|מתוק|sweet|עוג|גלידה/i, { emoji: "🍰", from: "#43223d", to: "#e56bb8" }],
  [/סלט|salad|ירקות|טבעונ|צמחונ/i, { emoji: "🥗", from: "#173a2b", to: "#22c08c" }],
  [/פסט|pasta|פיצה|pizza|איטלק/i, { emoji: "🍝", from: "#4a2e19", to: "#f97316" }],
  [/מרק|soup/i, { emoji: "🍲", from: "#3d2c17", to: "#d9a441" }],
  [/תוספ|side/i, { emoji: "🍚", from: "#33351c", to: "#a3b34a" }],
  [/בוקר|breakfast|ביצ|שקשוקה|בראנץ|brunch/i, { emoji: "🍳", from: "#4a3f19", to: "#facc15" }],
  [/שתי|drink|קפה|coffee|תה\b|מיץ|juice|שייק|smoothie/i, { emoji: "🥤", from: "#173a45", to: "#2dd4bf" }],
  [/ילד|kids/i, { emoji: "🧸", from: "#39304a", to: "#a78bfa" }],
];

const FALLBACK = { emoji: "🍽️", from: "#25272e", to: "#8a8aa0" };

export function categoryVisual(name) {
  for (const [re, v] of RULES) if (re.test(name || "")) return v;
  return FALLBACK;
}
