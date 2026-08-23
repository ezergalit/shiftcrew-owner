// Cross-script dish matching: the owner types "לילי" and the menu says "Lilly Flower".
//
// The algorithm is deterministic phonetics, not guessing: both scripts are reduced to a
// CONSONANT SKELETON in one shared alphabet, and a match means the query's skeleton is a
// prefix of some word's skeleton. Hebrew spelling is mostly consonants already, and
// dropping Latin vowels meets it in the middle:
//
//   לילי  → "ll"      Lilly  → "ll"      ✓
//   טונה  → "tn"      Tuna   → "tn"      ✓
//   סלמון → "slmn"    Salmon → "slmn"    ✓
//   בס    → "bs"      Bass   → "bs"      ✓
//
// Sound-alike letters collapse into one class (k/c/q ⇒ k, f/p ⇒ p, b/v/w ⇒ b, sh ⇒ s),
// and a match requires a skeleton of at least TWO consonants — a single letter matches
// half the menu and suggests nothing.
//
// ⚠️ Doubled letters collapse ONLY in the raw Latin spelling ("Lilly" ⇒ "Lily"), never
// in the finished skeleton: skeleton-level collapse turned לילי ("ll") into "l" (too
// short to match anything) and let גליל ("gll" ⇒ "gl") false-match Galaktoboureko.

const HEB_MAP = {
  ב: "b", ג: "g", ד: "d", ז: "z", ח: "h", ט: "t", כ: "k", ך: "k", ל: "l",
  מ: "m", ם: "m", נ: "n", ן: "n", ס: "s", פ: "p", ף: "p", צ: "c", ץ: "c",
  ק: "k", ר: "r", ש: "s", ת: "t",
  // י/ו/א/ע/ה act as vowel carriers in modern spelling — dropped, like Latin vowels.
};

function hebSkeleton(word) {
  let s = word
    // Doubled vav/yod denote the consonant (וודקה = Vodka), not a vowel.
    .replace(/וו/g, "ב")
    .replace(/יי/g, "י")
    // ה is a vowel carrier only at word END; at the start it's the consonant h (האפי = Happy).
    .replace(/^ה/, "ח");
  let out = "";
  for (const ch of s) out += HEB_MAP[ch] || "";
  return out;
}

function latSkeleton(word) {
  let s = word.toLowerCase()
    .replace(/(.)\1+/g, "$1") // spelling doubles: Lilly ⇒ Lily, Bass ⇒ Bas
    .replace(/sh/g, "s").replace(/th/g, "t").replace(/ph/g, "p").replace(/ck/g, "k")
    .replace(/c(?=[eiy])/g, "s") // soft c: Spicy ⇒ ספייסי
    .replace(/[cq]/g, "k").replace(/f/g, "p").replace(/[vw]/g, "b").replace(/x/g, "ks")
    .replace(/[aeiouy'’\-]/g, "")
    .replace(/[^a-z]/g, "");
  return s;
}

const isHebrew = (s) => /[א-ת]/.test(s);

function skeleton(word) {
  return isHebrew(word) ? hebSkeleton(word) : latSkeleton(word);
}

// Items whose name matches the query PHONETICALLY across scripts — Hebrew query against
// Latin names or the reverse. Plain same-script substring matches are the caller's job;
// this only returns what those would miss, so the UI can frame it as "האם התכוונתם?".
export function crossScriptMatches(query, items, limit = 3) {
  const q = (query || "").trim();
  if (!q) return [];
  const qSkel = skeleton(q);
  if (qSkel.length < 2) return [];
  const qHeb = isHebrew(q);

  const out = [];
  for (const d of items || []) {
    const name = d.name || "";
    // Only across scripts: a Hebrew query matches Latin-lettered names, and vice versa.
    if (isHebrew(name) === qHeb && !(qHeb && /[a-zA-Z]/.test(name))) continue;
    if (name.toLowerCase().includes(q.toLowerCase())) continue; // caller already has it
    const words = name.split(/\s+/).filter((w) => isHebrew(w) !== qHeb);
    if (words.some((w) => {
      const ws = skeleton(w);
      return ws.length >= 2 && ws.startsWith(qSkel);
    })) {
      out.push(d);
      if (out.length >= limit) break;
    }
  }
  return out;
}
