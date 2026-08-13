import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, ChevronDown, ChevronLeft, Wand2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { FACET_META, RECOMMENDED_FACETS } from "../lib/examFacets";

const db = supabase.schema("menu_app");
const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום"];
// "מוקשים" — what a guest often asks to avoid by preference, not by safety. Separate from
// ALLERGENS on purpose: folding a preference into the allergen list makes the allergen
// list less trustworthy, and a waiter reads the two for different reasons. Free text, so
// these are only a starting palette — any restaurant adds its own.
const PITFALLS = ["כוסברה", "חריף", "דג נא", "שום", "בצל", "ג'ינג'ר", "וסאבי", "מיונז", "אלכוהול", "טחינה"];

// Reviewing a menu one dish at a time is how a 38-dish import never gets reviewed. This
// groups dishes by what is actually missing and lets the owner fix a whole group in one
// action: tag eight dishes with an allergen, move a batch to another category, clear a
// wrong tag off everything at once.
//
// The issue list is derived from what the training actually needs — the same predicates
// the exam-config screen uses to decide which facets a menu can support — so fixing what
// this screen reports is exactly what unlocks better questions.

const ISSUES = [
  {
    id: "no_ingredients",
    title: "מנות בלי מרכיבים",
    why: "בלי מרכיבים אי אפשר לשאול עליהן כמעט כלום",
    match: (d) => !(d.ingredients || []).length,
    severity: "high",
  },
  {
    id: "thin_ingredients",
    title: "מנות עם פחות מ-3 מרכיבים",
    why: "צריך לפחות 3 כדי לבנות שאלה הוגנת",
    match: (d) => (d.ingredients || []).length > 0 && (d.ingredients || []).length < 3,
    severity: "low",
  },
  {
    id: "no_description",
    title: "מנות בלי תיאור",
    why: "התיאור הוא מה שמלצר אומר לשולחן",
    match: (d) => !String(d.description || "").split("שינויים:")[0].trim(),
    severity: "high",
  },
  {
    id: "no_allergens",
    title: "מנות בלי סימון אלרגנים",
    why: "יכול להיות תקין — אבל כדאי לוודא שבאמת אין",
    match: (d) => !(d.allergens || []).length,
    severity: "medium",
  },
  {
    id: "no_price",
    title: "מנות בלי מחיר",
    why: "לא חובה לאימון, אבל חוסם בחינה על מחירים",
    match: (d) => !(Number(d.price) > 0),
    severity: "low",
  },
  {
    id: "price_in_name",
    title: "מנות שהמחיר כתוב בשם",
    why: 'כמו "Sea Bass 165" — שאלה על המחיר הופכת לקריאה בלבד',
    match: (d) => Number(d.price) > 0 && String(d.name).includes(String(Number(d.price))),
    severity: "low",
  },
];

const SEVERITY = {
  high: { color: "#e0315a", bg: "#3a1d22" },
  medium: { color: "#f3a712", bg: "#3a2a0f" },
  low: { color: "#8a8aa0", bg: "#1c1e22" },
};

export default function MenuHealthReview({ items, categories, onChanged }) {
  const [openIssue, setOpenIssue] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const found = useMemo(
    () => ISSUES.map((iss) => ({ ...iss, dishes: (items || []).filter(iss.match) })).filter((iss) => iss.dishes.length),
    [items]
  );

  // Which kinds of question this menu currently supports — the payoff for fixing things
  // above, stated in terms of what the team will actually be asked.
  const facetStatus = useMemo(
    () => RECOMMENDED_FACETS.map((k) => ({ key: k, ...FACET_META[k], ok: FACET_META[k].requires(items || []) })),
    [items]
  );

  const openDishes = found.find((iss) => iss.id === openIssue)?.dishes;

  // A fix removes dishes from the group they were listed under, so the selection has to
  // shrink with it — otherwise the counter reads "3 selected out of 1" and the next bulk
  // action would target dishes that are no longer on screen.
  useEffect(() => {
    if (!openDishes) return;
    const live = new Set(openDishes.map((d) => d.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [openDishes]);

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const openGroup = (iss) => {
    if (openIssue === iss.id) { setOpenIssue(null); setSelected(new Set()); return; }
    setOpenIssue(iss.id);
    setSelected(new Set(iss.dishes.map((d) => d.id))); // whole group pre-selected: bulk is the point
    setDone("");
  };

  const applyToSelected = async (patch, label) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true); setDone("");
    const { error } = await db.from("menu_items").update(patch).in("id", ids);
    setBusy(false);
    if (error) { setDone("שגיאה: " + error.message); return; }
    setDone(`${label} — ${ids.length} מנות עודכנו`);
    onChanged?.();
  };

  const applyAllergenToSelected = async (allergen, mode) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true); setDone("");
    // One row at a time: each dish keeps its own existing tags, so this adds to or
    // removes from a list rather than overwriting everyone with the same one.
    const byId = Object.fromEntries((items || []).map((d) => [d.id, d]));
    let failed = 0;
    for (const id of ids) {
      const current = byId[id]?.allergens || [];
      const next = mode === "add"
        ? (current.includes(allergen) ? current : [...current, allergen])
        : current.filter((a) => a !== allergen);
      const { error } = await db.from("menu_items").update({ allergens: next }).eq("id", id);
      if (error) failed++;
    }
    setBusy(false);
    setDone(failed ? `${ids.length - failed} עודכנו, ${failed} נכשלו` : `${mode === "add" ? "נוסף" : "הוסר"} "${allergen}" ל-${ids.length} מנות`);
    onChanged?.();
  };

  if (!items?.length) return null;

  return (
    <div className="space-y-3">
      <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b]">
        <p className="font-bold text-[#eef0f6] mb-1">בדיקת תפריט</p>
        <p className="text-xs text-[#8a8aa0] mb-3">
          {found.length === 0
            ? "התפריט מלא — כל המנות מוכנות לאימון."
            : "לחצו על שורה כדי לראות את המנות ולתקן את כולן יחד, בלי לעבור מנה־מנה."}
        </p>

        {found.length === 0 ? (
          <div className="bg-[#15302b] border border-[#22c08c]/30 rounded-lg p-3 flex items-center gap-2">
            <Check size={16} className="text-[#22c08c]" />
            <p className="text-xs font-bold text-[#22c08c]">אין מה לתקן</p>
          </div>
        ) : (
          <div className="space-y-2">
            {found.map((iss) => {
              const sev = SEVERITY[iss.severity];
              const isOpen = openIssue === iss.id;
              return (
                <div key={iss.id} className="rounded-lg overflow-hidden border" style={{ borderColor: `${sev.color}40` }}>
                  <button onClick={() => openGroup(iss)} className="w-full text-right p-2.5 flex items-center gap-2"
                    style={{ background: sev.bg }}>
                    <AlertTriangle size={14} style={{ color: sev.color }} className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-[#eef0f6]">{iss.title} ({iss.dishes.length})</p>
                      <p className="text-[10px] text-[#8a8aa0] leading-snug">{iss.why}</p>
                    </div>
                    {isOpen ? <ChevronDown size={14} className="text-[#8a8aa0] flex-shrink-0" />
                            : <ChevronLeft size={14} className="text-[#8a8aa0] flex-shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="bg-[#0c0d10] p-2.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-[#8a8aa0]">נבחרו {selected.size} מתוך {iss.dishes.length}</p>
                        <div className="flex gap-1.5">
                          <button onClick={() => setSelected(new Set(iss.dishes.map((d) => d.id)))}
                            className="text-[10px] font-bold text-[#6d5efc]">בחרו הכל</button>
                          <button onClick={() => setSelected(new Set())}
                            className="text-[10px] font-bold text-[#8a8aa0]">נקו</button>
                        </div>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {iss.dishes.map((d) => (
                          <button key={d.id} onClick={() => toggle(d.id)}
                            className={`w-full text-right px-2 py-1.5 rounded flex items-center gap-2 ${
                              selected.has(d.id) ? "bg-[#6d5efc]/20 border border-[#6d5efc]/50" : "bg-[#16181c] border border-transparent"}`}>
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                              selected.has(d.id) ? "bg-[#6d5efc] border-[#6d5efc]" : "border-[#444650]"}`}>
                              {selected.has(d.id) && <Check size={9} className="text-white" />}
                            </span>
                            <span className="text-[11px] text-[#eef0f6] truncate">{d.name}</span>
                          </button>
                        ))}
                      </div>

                      <BulkActions
                        issueId={iss.id}
                        categories={categories}
                        disabled={busy || !selected.size}
                        onCategory={(c) => applyToSelected({ category: c }, `הועברו ל"${c}"`)}
                        onAllergen={applyAllergenToSelected}
                      />

                      {busy && <p className="text-[10px] text-[#8a8aa0] flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> מעדכן…</p>}
                      {done && <p className="text-[10px] font-bold text-[#22c08c]">{done}</p>}
                      <p className="text-[10px] text-[#6a6a7e]">
                        לעריכת תיאור או מרכיבים של מנה מסוימת — פתחו אותה בטאב "תפריט".
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b]">
        <p className="font-bold text-[#eef0f6] mb-1 flex items-center gap-1.5"><Wand2 size={14} className="text-[#6d5efc]" /> מה אפשר לבחון עכשיו</p>
        <p className="text-xs text-[#8a8aa0] mb-3">לפי מה שקיים בתפריט ברגע זה.</p>
        <div className="space-y-1.5">
          {facetStatus.map((f) => (
            <div key={f.key} className="flex items-start gap-2">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${f.ok ? "bg-[#15302b]" : "bg-[#2a2c33]"}`}>
                {f.ok ? <Check size={10} className="text-[#22c08c]" /> : <span className="w-1.5 h-1.5 rounded-full bg-[#6a6a7e]" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold ${f.ok ? "text-[#eef0f6]" : "text-[#6a6a7e]"}`}>{f.label}</p>
                {!f.ok && <p className="text-[10px] text-[#6a6a7e] leading-snug">{f.missing}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Bulk actions worth offering per issue. Category moves apply everywhere; allergen
// add/remove is offered on the allergen group, where "these eight all contain sesame"
// is the whole job.
function BulkActions({ issueId, categories, disabled, onCategory, onAllergen }) {
  const [cat, setCat] = useState("");
  const [allergen, setAllergen] = useState("");

  return (
    <div className="space-y-2 pt-2 border-t border-[#22252b]">
      {issueId === "no_allergens" && (
        <div>
          <p className="text-[10px] font-bold text-[#8a8aa0] mb-1">סמנו אלרגן לכל הנבחרות</p>
          <div className="flex flex-wrap gap-1">
            {ALLERGENS.map((a) => (
              <button key={a} disabled={disabled} onClick={() => onAllergen(a, "add")}
                className="text-[10px] px-2 py-1 rounded bg-[#22252b] text-[#c4c4d4] disabled:opacity-40">
                +{a}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold text-[#8a8aa0] mb-1">העבירו את הנבחרות לקטגוריה</p>
        <div className="flex gap-1.5">
          <select value={cat} onChange={(e) => setCat(e.target.value)}
            className="flex-1 bg-[#16181c] border border-[#22252b] rounded px-2 py-1.5 text-[11px] text-[#eef0f6]">
            <option value="">בחרו קטגוריה…</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button disabled={disabled || !cat} onClick={() => onCategory(cat)}
            className="px-3 py-1.5 rounded bg-[#6d5efc] text-white text-[11px] font-bold disabled:opacity-40">העבר</button>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold text-[#8a8aa0] mb-1">הסירו אלרגן שסומן בטעות</p>
        <div className="flex gap-1.5">
          <select value={allergen} onChange={(e) => setAllergen(e.target.value)}
            className="flex-1 bg-[#16181c] border border-[#22252b] rounded px-2 py-1.5 text-[11px] text-[#eef0f6]">
            <option value="">בחרו אלרגן…</option>
            {ALLERGENS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button disabled={disabled || !allergen} onClick={() => onAllergen(allergen, "remove")}
            className="px-3 py-1.5 rounded bg-[#22252b] text-[#c4c4d4] text-[11px] font-bold disabled:opacity-40">הסר</button>
        </div>
      </div>
    </div>
  );
}
