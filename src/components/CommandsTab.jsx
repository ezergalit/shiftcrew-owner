import { useMemo, useState } from "react";
import { Terminal, Wine, AlertTriangle, Check, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/menu-ai-parse`;

// The owner's plain-language remote control for the menu ("תוריד את כל סימני השאלה",
// "תוסיף מוקש כוסברה לסביצ'ה"). The model only ever PROPOSES a patch list; nothing is
// written until the owner approves the preview — same contract as everywhere else in
// the app: the system suggests, the owner decides.
const EXAMPLES = [
  "תוריד את כל סימני השאלה [?] מהתפריט",
  "תוסיף מוקש חריף לכל המנות שכתוב בהן צ'ילי",
  "תוסיף מנה: פסטה פומודורו 58",
  "אילו מנות חסר להן תיאור?",
];

const FIELD_LABELS = { name: "שם", price: "מחיר", description: "תיאור", category: "קטגוריה", allergens: "אלרגנים", pregnancy: "רגישות בהריון", pitfalls: "מוקשים", kashrut: "כשרות" };
const fmt = (v) => (Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v ?? "—"));

// Wine-ish dishes are recognised by their category or by a vintage year in the name.
const WINE_CAT = /יין|יינות|wine|קוקטייל|cocktail|אלכוהול|בקבוק|שתיה|שתייה|drinks|בירה|beer/i;
const looksLikeWine = (d) => WINE_CAT.test(d.category || "") || /\b(19|20)\d{2}\b/.test(d.name || "");
const normWine = (s) => String(s || "").replace(/\b(19|20)\d{2}\b/g, "").replace(/[׳״'".,]/g, "").replace(/\s+/g, " ").trim();

export default function CommandsTab({ restaurant, items, onApplied }) {
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);   // {summary, warnings, patches, additions, answer}
  const [winePreview, setWinePreview] = useState(null); // [{item, facts, fromMemory}]
  const [applied, setApplied] = useState("");

  const byId = useMemo(() => new Map(items.map((i) => [String(i.id), i])), [items]);
  const wineCandidates = useMemo(
    () => items.filter((d) => looksLikeWine(d) && !(d.description || "").trim()),
    [items],
  );

  const runCommand = async () => {
    if (!command.trim()) return;
    setBusy(true); setErr(""); setPreview(null); setApplied("");
    try {
      const menu = items.map(({ id, name, price, description, category, allergens, pregnancy, pitfalls, kashrut }) =>
        ({ id, name, price, description, category, allergens, pregnancy, pitfalls, kashrut }));
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "menu_command", command: command.trim(), menu }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "שגיאה בהרצת הפקודה");
      setPreview(data);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const applyPatches = async () => {
    const patches = preview?.patches || [];
    const additions = preview?.additions || [];
    if (!patches.length && !additions.length) return;
    setBusy(true); setErr("");
    try {
      for (const p of patches) {
        const { error } = await db.from("menu_items").update(p.set).eq("id", p.id);
        if (error) throw new Error(`עדכון "${byId.get(p.id)?.name || p.id}" נכשל: ${error.message}`);
      }
      if (additions.length) {
        let pos = items.reduce((m, i) => Math.max(m, i.menu_position ?? 0), 0) + 1;
        const rows = additions.map((d) => ({
          restaurant_id: restaurant.id,
          name: d.name, price: d.price ?? 0, description: d.description || "",
          category: d.category || "כללי", ingredients: d.ingredients || [],
          allergens: d.allergens || [], pregnancy: d.pregnancy || [],
          pitfalls: d.pitfalls || [], kashrut: d.kashrut || [],
          menu_position: pos++, is_special: false,
        }));
        const { error } = await db.from("menu_items").insert(rows);
        if (error) throw new Error(`הוספת המנות נכשלה: ${error.message}`);
      }
      const parts = [];
      if (patches.length) parts.push(`${patches.length} מנות עודכנו`);
      if (additions.length) parts.push(`${additions.length} מנות נוספו`);
      setApplied(`בוצע — ${parts.join(", ")}.`);
      setPreview(null); setCommand("");
      onApplied?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const runWineEnrichment = async () => {
    setBusy(true); setErr(""); setWinePreview(null); setApplied("");
    try {
      const names = wineCandidates.map((d) => d.name);
      // Memory first — a wine any restaurant already approved costs nothing.
      const norms = [...new Set(names.map(normWine))];
      const { data: known } = await db.from("wine_knowledge").select("*").in("norm_name", norms);
      const memory = new Map((known || []).map((k) => [k.norm_name, k]));
      const missing = wineCandidates.filter((d) => !memory.has(normWine(d.name)));
      let aiByName = new Map();
      if (missing.length) {
        const res = await fetch(FN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "enrich_wines", wines: missing.map((d) => d.name) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "שגיאה בהעשרת היינות");
        aiByName = new Map((data.wines || []).map((w) => [w.name, w]));
      }
      const rows = wineCandidates.map((item) => {
        const mem = memory.get(normWine(item.name));
        if (mem) return { item, facts: mem, fromMemory: true };
        const ai = aiByName.get(item.name);
        if (ai && (ai.known || ai.color || ai.sweetness || ai.grapes?.length)) return { item, facts: ai, fromMemory: false };
        return { item, facts: null, fromMemory: false };
      });
      setWinePreview(rows);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const wineSentence = (f) => {
    const parts = [];
    const head = ["יין", f.color, f.sweetness].filter(Boolean).join(" ");
    if (head !== "יין") parts.push(head);
    if (f.grapes?.length) parts.push(`מזני ${f.grapes.join(", ")}`);
    if (f.winery || f.region) parts.push([f.winery, f.region].filter(Boolean).join(", "));
    if (f.notes) parts.push(f.notes);
    if (f.serving) parts.push(f.serving);
    return parts.join(" · ");
  };

  const applyWines = async () => {
    const rows = (winePreview || []).filter((r) => r.facts);
    if (!rows.length) return;
    setBusy(true); setErr("");
    try {
      for (const r of rows) {
        const desc = wineSentence(r.facts);
        if (!desc) continue;
        const { error } = await db.from("menu_items").update({ description: desc }).eq("id", r.item.id);
        if (error) throw new Error(`עדכון "${r.item.name}" נכשל: ${error.message}`);
        if (!r.fromMemory) {
          await db.from("wine_knowledge").upsert({
            norm_name: normWine(r.item.name),
            display_name: r.item.name,
            color: r.facts.color, sweetness: r.facts.sweetness,
            grapes: r.facts.grapes || [], region: r.facts.region,
            winery: r.facts.winery, notes: r.facts.notes, serving: r.facts.serving,
            source: "ai", updated_at: new Date().toISOString(),
          }, { onConflict: "norm_name" });
        }
      }
      setApplied(`בוצע — ${rows.length} תיאורי יינות נוספו. עברו עליהם בטאב התפריט ותקנו מה שצריך.`);
      setWinePreview(null);
      onApplied?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#16181c] rounded-2xl p-4 border border-[#22252b] space-y-3">
        <p className="font-bold text-[#eef0f6] flex items-center gap-2"><Terminal size={16} className="text-[#6d5efc]" /> עוזר התפריט</p>
        <p className="text-xs text-[#8a8aa0] leading-relaxed">
          רוצים לשנות משהו בתפריט — או בכמה מנות בבת אחת? כתבו פקודה במילים שלכם, בדקו שהיא נכונה בתצוגה המקדימה, והתפריט יתוקן. אפשר גם להוסיף מנות חדשות פשוט בהדבקת טקסט במקום להקליד, ולשאול שאלות בסיסיות על התפריט. שום דבר לא משתנה בלי אישור שלכם.
        </p>
        <textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={'למשל: "תוריד את כל סימני השאלה מהתפריט"'}
          rows={2}
          dir="rtl"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2.5 text-[#eef0f6] text-sm placeholder:text-[#6a6a7e] focus:outline-none focus:border-[#6d5efc] resize-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setCommand(ex)} className="text-[10px] text-[#8a8aa0] bg-[#0c0d10] border border-[#22252b] rounded-full px-2.5 py-1 hover:border-[#6d5efc]/50 transition">
              {ex}
            </button>
          ))}
        </div>
        <button
          onClick={runCommand}
          disabled={busy || !command.trim() || !items.length}
          className="w-full bg-[#6d5efc] text-white font-bold py-2.5 rounded-lg text-sm hover:bg-[#5b4ef0] transition disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy && !winePreview ? <><Loader2 size={15} className="animate-spin" /> חושב…</> : "הצג לי מה ישתנה"}
        </button>
      </div>

      {preview?.answer && (
        <div className="bg-[#16181c] rounded-2xl p-4 border border-[#6d5efc]/50 space-y-2">
          <p className="text-[11px] font-bold text-[#a79bff]">תשובה מעוזר התפריט</p>
          <p className="text-sm text-[#eef0f6] leading-relaxed">{preview.answer}</p>
          <button onClick={() => setPreview(null)} className="w-full bg-[#22252b] text-[#8a8aa0] font-bold py-2 rounded-lg text-xs">סגור</button>
        </div>
      )}

      {preview && !preview.answer && (
        <div className="bg-[#16181c] rounded-2xl p-4 border border-[#6d5efc]/50 space-y-3">
          <p className="text-sm font-bold text-[#eef0f6]">{preview.summary}</p>
          {preview.warnings?.map((w, i) => (
            <p key={i} className="text-[11px] text-[#f3c98b] flex items-start gap-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5" /> {w}</p>
          ))}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {preview.patches.slice(0, 30).map((p) => {
              const before = byId.get(p.id);
              if (!before) return null;
              return (
                <div key={p.id} className="bg-[#0c0d10] rounded-lg p-2.5 border border-[#22252b]">
                  <p className="text-xs font-bold text-[#c4c4d4] mb-1">{before.name}</p>
                  {Object.entries(p.set).map(([k, v]) => (
                    <p key={k} className="text-[11px] leading-relaxed">
                      <span className="text-[#8a8aa0]">{FIELD_LABELS[k] || k}: </span>
                      <span className="text-[#e0315a] line-through">{fmt(before[k])}</span>
                      <ArrowLeft size={10} className="inline mx-1 text-[#6a6a7e]" />
                      <span className="text-[#22c08c]">{fmt(v)}</span>
                    </p>
                  ))}
                </div>
              );
            })}
            {preview.patches.length > 30 && <p className="text-[11px] text-[#8a8aa0]">…ועוד {preview.patches.length - 30} מנות</p>}
            {(preview.additions || []).map((d, i) => (
              <div key={`add-${i}`} className="bg-[#0c0d10] rounded-lg p-2.5 border border-[#22c08c]/40">
                <p className="text-xs font-bold text-[#22c08c] mb-0.5">מנה חדשה · {d.category}</p>
                <p className="text-xs font-bold text-[#eef0f6]">{d.name} {d.price != null && <span className="text-[#6d5efc]">₪{d.price}</span>}</p>
                {d.description && <p className="text-[11px] text-[#8a8aa0] leading-relaxed mt-0.5">{d.description}</p>}
              </div>
            ))}
          </div>
          {(preview.patches.length > 0 || (preview.additions || []).length > 0) ? (
            <div className="flex gap-2">
              <button onClick={applyPatches} disabled={busy} className="flex-1 bg-[#22c08c] text-black font-bold py-2.5 rounded-lg text-sm hover:bg-[#1da97a] transition disabled:opacity-40 flex items-center justify-center gap-1.5">
                <Check size={15} /> {busy ? "מעדכן…" : [
                  preview.patches.length ? `עדכן ${preview.patches.length}` : "",
                  (preview.additions || []).length ? `הוסף ${preview.additions.length}` : "",
                ].filter(Boolean).join(" · ") + " — אשר"}
              </button>
              <button onClick={() => setPreview(null)} disabled={busy} className="flex-1 bg-[#22252b] text-[#8a8aa0] font-bold py-2.5 rounded-lg text-sm hover:bg-[#2c2e35] transition">
                בטל
              </button>
            </div>
          ) : (
            <button onClick={() => setPreview(null)} className="w-full bg-[#22252b] text-[#8a8aa0] font-bold py-2.5 rounded-lg text-sm">סגור</button>
          )}
        </div>
      )}

      {wineCandidates.length > 0 && !winePreview && (
        <div className="bg-[#16181c] rounded-2xl p-4 border border-[#22252b] space-y-2">
          <p className="font-bold text-[#eef0f6] flex items-center gap-2"><Wine size={15} className="text-[#a06af0]" /> {wineCandidates.length} משקאות בלי תיאור</p>
          <p className="text-xs text-[#8a8aa0] leading-relaxed">
            נזהה מהשם מה אפשר לדעת — צבע, יובש, זן, אזור וטעמים — כדי שהצוות יוכל להגיד משפט חכם ליד השולחן. יין שלא נזהה בוודאות נשאיר לכם. <span className="font-bold">כשרות תמיד נבדקת מול הספק — לא נקבע אותה.</span>
          </p>
          <button onClick={runWineEnrichment} disabled={busy} className="w-full bg-[#a06af0]/20 border border-[#a06af0]/50 text-[#c9a7f7] font-bold py-2.5 rounded-lg text-sm hover:bg-[#a06af0]/30 transition disabled:opacity-40 flex items-center justify-center gap-2">
            {busy && !preview ? <><Loader2 size={15} className="animate-spin" /> מזהה יינות…</> : "השלם תיאורי יינות"}
          </button>
        </div>
      )}

      {winePreview && (
        <div className="bg-[#16181c] rounded-2xl p-4 border border-[#a06af0]/50 space-y-3">
          <p className="text-sm font-bold text-[#eef0f6]">
            זוהו {winePreview.filter((r) => r.facts).length} מתוך {winePreview.length} — <span className="text-[#c9a7f7]">הצעות AI, עברו ואשרו</span>
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {winePreview.map((r) => (
              <div key={r.item.id} className="bg-[#0c0d10] rounded-lg p-2.5 border border-[#22252b]">
                <p className="text-xs font-bold text-[#c4c4d4]">{r.item.name}
                  {r.fromMemory && <span className="text-[9px] text-[#22c08c] mr-2">מהזיכרון ✓</span>}
                </p>
                {r.facts
                  ? <p className="text-[11px] text-[#8a8aa0] leading-relaxed mt-0.5">{wineSentence(r.facts)}</p>
                  : <p className="text-[11px] text-[#f3c98b] mt-0.5">לא זוהה בוודאות — השארנו לכם למילוי ידני.</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={applyWines} disabled={busy || !winePreview.some((r) => r.facts)} className="flex-1 bg-[#22c08c] text-black font-bold py-2.5 rounded-lg text-sm hover:bg-[#1da97a] transition disabled:opacity-40 flex items-center justify-center gap-1.5">
              <Check size={15} /> {busy ? "שומר…" : "אשר את התיאורים"}
            </button>
            <button onClick={() => setWinePreview(null)} disabled={busy} className="flex-1 bg-[#22252b] text-[#8a8aa0] font-bold py-2.5 rounded-lg text-sm hover:bg-[#2c2e35] transition">בטל</button>
          </div>
        </div>
      )}

      {applied && <p className="text-xs font-bold text-[#22c08c] flex items-center gap-1.5"><Check size={14} /> {applied}</p>}
      {err && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" /> {err}</p>}
    </div>
  );
}
