// Hebrew conjugates almost everything said TO a person. The stored gender (male/female,
// or null = not stated) picks the right form; the fallback is what the app used before
// profiles existed — usually the slash form ("מחובר/ת") or plural-neutral phrasing.
//
// Usage: genderWord(gender, "מחובר", "מחוברת") → "מחובר" | "מחוברת" | "מחובר/ת"
export const genderWord = (gender, male, female, fallback) =>
  gender === "male" ? male : gender === "female" ? female : (fallback ?? `${male}/ת`);

// A name we can actually greet someone with — blocks the obvious fakes without playing
// police (user, 2026-08-22: "block fake names"). Returns null when the name passes, or a
// human explanation of what to fix.
//
// The rules are deliberately conservative: real but unusual names must pass, so this only
// rejects structure that no real name has — digits/symbols, one letter, the same letter
// mashed, keyboard rows, and the classic test words.
const FAKE_WORDS = new Set([
  "טסט", "בדיקה", "בדיקות", "ניסיון", "נסיון", "דמו", "אנונימי", "פלוני", "אאא",
  "test", "testing", "demo", "asdf", "qwerty", "admin", "user", "name", "aaa", "abc",
  "בעלים", "מנהל", "מסעדה",
]);
const KEYBOARD_ROWS = ["qwer", "wert", "asdf", "sdfg", "zxcv", "xcvb", "שדגכ", "דגכע", "קראט", "חלךף"];

export function nameProblem(raw) {
  const name = (raw || "").trim();
  if (name.length < 2) return "כתבו שם באורך שתי אותיות לפחות.";
  if (name.length > 30) return "השם ארוך מדי — עד 30 תווים.";
  if (!/^[א-תa-zA-Z][א-תa-zA-Z'׳\- ]*$/.test(name)) return "השם יכול להכיל רק אותיות (בלי מספרים או סימנים).";
  const lower = name.toLowerCase();
  const words = lower.split(/\s+/);
  if (words.some((w) => FAKE_WORDS.has(w))) return "זה לא נראה כמו שם אמיתי — כתבו את השם שלכם.";
  // The same letter three times in a row appears in no real name ("אאאא", "ffff").
  if (/(.)\1\1/.test(lower)) return "זה לא נראה כמו שם אמיתי — כתבו את השם שלכם.";
  if (KEYBOARD_ROWS.some((row) => lower.includes(row))) return "זה לא נראה כמו שם אמיתי — כתבו את השם שלכם.";
  return null;
}
