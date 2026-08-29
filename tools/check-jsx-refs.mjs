// Every JSX identifier must be defined or imported in its own file.
//
// A bare <Foo> that is neither is, to the bundler, a reference to a global — so
// `vite build` is green and the screen throws ReferenceError the moment it renders.
// That has shipped five times in this project (countLabel, TagField, an unimported
// icon, ChevronLeft, and DishPreview, which crashed every dish tap in production).
// The build cannot catch it. This does, in about 40ms.
//
//   node tools/check-jsx-refs.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.jsx?$/.test(p)) files.push(p);
  }
})("src");

// Anything React resolves itself, plus the handful of real globals in JSX position.
const BUILTIN = new Set(["Fragment", "React", "Suspense", "StrictMode", "Profiler"]);
let bad = 0;

for (const f of files) {
  const src = readFileSync(f, "utf8");

  // Usages are read from comment-stripped source, so a <Foo> written inside a comment
  // is not treated as a real reference.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const used = new Set();
  for (const m of code.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) used.add(m[1]);

  // Definitions are read from the RAW source and matched anywhere on the line, never
  // anchored. Over-approximating what counts as "defined" only costs a missed warning;
  // under-approximating produces false alarms, and a checker that cries wolf gets
  // ignored — which is worse than not having one.
  const defined = new Set(BUILTIN);
  const add = (re) => { for (const m of src.matchAll(re)) defined.add(m[1]); };
  add(/\b(?:function|class)\s+([A-Za-z0-9_]+)/g);          // function Foo / class Foo
  add(/\b(?:const|let|var)\s+([A-Za-z0-9_]+)/g);           // const Foo = …
  // ⚠️ Lookbehind, not a consumed delimiter. `{ Eye, EyeOff, Alert }` with a plain
  // `[{,]…` pattern eats the comma that would have started the next match, so every
  // second name in a list goes unseen — which is how a first pass at this check
  // reported 59 imported lucide icons as undefined.
  add(/(?<=[{,])\s*([A-Za-z0-9_$]+)\s*(?=[,}=:\n])/g);      // { Foo }  destructured
  add(/(?<=:)\s*([A-Z][A-Za-z0-9_]*)\s*(?=[,}=\n])/g);      // { icon: Icon }  renamed
  add(/\bas\s+([A-Za-z0-9_]+)/g);                          // import { a as Foo }
  add(/import\s+([A-Za-z0-9_]+)/g);                        // import Foo from …
  // Whole import statements, including multi-line ones: every word in the clause counts.
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s/g))
    for (const w of m[1].match(/[A-Za-z_$][\w$]*/g) || []) defined.add(w);

  for (const name of used) {
    if (defined.has(name)) continue;
    const line = src.split("\n").findIndex((l) => l.includes(`<${name}`)) + 1;
    console.error(`${f}:${line}  <${name}> is used but never defined or imported`);
    bad++;
  }
}

console.log(bad ? `\n✗ ${bad} undefined JSX identifier(s)` : `✓ ${files.length} files — every JSX identifier resolves`);
process.exit(bad ? 1 : 0);
