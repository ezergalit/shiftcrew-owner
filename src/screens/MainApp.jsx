import { useEffect, useState } from "react";
import { Plus, Send, Loader2, Check, Trash2, Pencil, LogOut, Menu, Megaphone } from "lucide-react";
import { supabase } from "../lib/supabase";

const CATS = { starters: "ראשונות", mains: "עיקריות", desserts: "קינוחים", drinks: "קוקטיילים" };
const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום", "סולפיטים"];
const db = supabase.schema("menu_app");

export default function MainApp({ restaurant, onSignOut }) {
  const [tab, setTab] = useState("menu");
  const [items, setItems] = useState(null);
  const [brief, setBrief] = useState(null);
  const [editId, setEditId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [publishState, setPublishState] = useState("idle");
  const [savingBrief, setSavingBrief] = useState(false);

  const reload = async () => {
    if (!restaurant?.id) return;
    const { data } = await db.from("menu_items").select("*").eq("restaurant_id", restaurant.id).order("created_at");
    setItems(data || []);
    const today = new Date().toISOString().slice(0, 10);
    const { data: b } = await db.from("daily_brief").select("*").eq("restaurant_id", restaurant.id).eq("date", today).maybeSingle();
    setBrief(b || { missing_items: [], new_items: [], oven_items: [], notes: "" });
  };

  useEffect(() => { reload(); }, [restaurant?.id]);

  const saveItem = async (updated) => {
    if (!restaurant?.id) return;
    if (updated.id) {
      await db.from("menu_items").update({ category: updated.cat, name: updated.name, price: updated.price, description: updated.desc, ingredients: updated.ingredients, allergens: updated.allergens, is_special: updated.isSpecial }).eq("id", updated.id);
    } else {
      await db.from("menu_items").insert({ restaurant_id: restaurant.id, category: updated.cat, name: updated.name, price: updated.price, description: updated.desc, ingredients: updated.ingredients, allergens: updated.allergens });
    }
    setEditId(null); setCreating(false); await reload();
  };

  const deleteItem = async (id) => {
    await db.from("menu_items").delete().eq("id", id);
    setItems(p => p.filter(x => x.id !== id));
  };

  const publish = async () => {
    setPublishState("publishing");
    try {
      await db.from("published_menu").delete().neq("source_item_id", "00000000-0000-0000-0000-000000000000");
      if (items?.length) {
        await db.from("published_menu").insert(items.map(x => ({ source_item_id: x.id, category: x.category, name: x.name, price: x.price, description: x.description, ingredients: x.ingredients, allergens: x.allergens, is_special: x.is_special })));
      }
      setPublishState("done");
      setTimeout(() => setPublishState("idle"), 2800);
    } catch (e) { console.error(e); setPublishState("idle"); }
  };

  const saveBrief = async () => {
    setSavingBrief(true);
    const today = new Date().toISOString().slice(0, 10);
    try {
      await db.from("daily_brief").upsert({ restaurant_id: restaurant.id, date: today, ...brief }, { onConflict: "restaurant_id,date" });
      setSavingBrief(false);
    } catch (e) { console.error(e); setSavingBrief(false); }
  };

  const editItem = items?.find(x => x.id === editId);
  const grouped = Object.keys(CATS).map(k => ({ key: k, label: CATS[k], items: (items || []).filter(x => (x.category || "mains") === k) }));

  if (editItem || creating) {
    return <DishEditor dish={editItem || { id: null, cat: "mains", name: "", price: "", desc: "", ingredients: [], allergens: [], isSpecial: false }} onSave={saveItem} onDelete={editItem ? () => { deleteItem(editItem.id); setEditId(null); } : null} onCancel={() => { setEditId(null); setCreating(false); }} />;
  }

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      {/* Header */}
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onSignOut} className="w-8 h-8 rounded-lg bg-[#191b1f] flex items-center justify-center text-[#8a8aa0]">
          <LogOut size={16} />
        </button>
        <div className="text-center">
          <p className="font-black text-sm">{restaurant?.name}</p>
        </div>
        <div className="w-8" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "menu" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setCreating(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-xs bg-[#6d5efc] text-white">
                <Plus size={16} /> חדש
              </button>
              <button onClick={publish} disabled={publishState === "publishing" || !items?.length} className={`flex-1 py-2.5 rounded-xl font-black text-xs ${publishState === "done" ? "bg-[#15302b] text-[#22c08c]" : items?.length ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#b4b4c4]"}`}>
                {publishState === "publishing" ? <Loader2 size={12} className="animate-spin inline" /> : publishState === "done" ? <Check size={12} className="inline" /> : <Send size={12} className="inline" />} פרסום
              </button>
            </div>
            {items === null ? <Loader2 size={20} className="animate-spin text-[#6d5efc] mx-auto" /> : (
              grouped.map(g => g.items.length === 0 ? null : (
                <div key={g.key}>
                  <p className="text-xs font-bold text-[#8a8aa0] mb-1">{g.label}</p>
                  <div className="space-y-1">
                    {g.items.map(x => (
                      <div key={x.id} className="bg-[#16181c] rounded-lg p-2.5 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-[#eef0f6] truncate">{x.name}</p>
                        </div>
                        <button onClick={() => setEditId(x.id)} className="w-7 h-7 rounded-lg bg-[#6d5efc] flex items-center justify-center text-white flex-shrink-0"><Pencil size={12} /></button>
                        <span className="text-xs font-bold text-[#ea7317] flex-shrink-0">₪{x.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="bg-[#16181c] rounded-xl p-3 space-y-2.5">
            <p className="text-xs font-bold text-[#8a8aa0]">Daily Brief</p>
            {[["missing_items", "❌ חסרים", "#f3c14b"], ["new_items", "⭐ חדש", "#22c08c"], ["oven_items", "📦 מעלה", "#6d5efc"]].map(([key, label, color]) => (
              <div key={key}>
                <p className="text-[11px] font-bold mb-0.5" style={{ color }}>{label}</p>
                <div className="flex flex-wrap gap-1">
                  {(brief?.[key] || []).map((x, i) => (
                    <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: `${color}20`, color }}>
                      {x} <button onClick={() => setBrief({ ...brief, [key]: brief[key].filter((_, j) => j !== i) })} className="ml-1">×</button>
                    </span>
                  ))}
                </div>
                <input type="text" placeholder="הוסף" onKeyDown={e => { if (e.key === "Enter" && e.target.value) { setBrief({ ...brief, [key]: [...(brief?.[key] || []), e.target.value] }); e.target.value = ""; } }} className="text-[10px] bg-transparent text-gray-300 placeholder:text-gray-600 border-b border-gray-600 focus:outline-none mt-1 w-full" />
              </div>
            ))}
            <textarea value={brief?.notes || ""} onChange={e => setBrief({ ...brief, notes: e.target.value })} rows={2} className="w-full text-[10px] bg-[#0c0d10] border border-[#22252b] rounded-lg px-2 py-1.5 text-[#eef0f6] text-right focus:outline-none" />
            <button onClick={saveBrief} disabled={savingBrief} className="w-full py-2 rounded-lg font-bold text-xs bg-[#6d5efc] text-white">
              {savingBrief ? "שומר..." : "שמור"}
            </button>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="flex gap-0 bg-[#16181c] border-t border-[#22252b] flex-shrink-0">
        {[["menu", Menu], ["brief", Megaphone]].map(([t, Icon]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 flex items-center justify-center py-2.5 ${tab === t ? "bg-[#6d5efc] text-white" : "text-[#8a8aa0]"}`}>
            <Icon size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

function DishEditor({ dish, onSave, onDelete, onCancel }) {
  const [name, setName] = useState(dish.name || "");
  const [price, setPrice] = useState(String(dish.price || ""));
  const [desc, setDesc] = useState(dish.desc || "");
  const [cat, setCat] = useState(dish.cat || "mains");
  const [ing, setIng] = useState((dish.ingredients || []).join(", "));
  const [allergens, setAllergens] = useState(new Set(dish.allergens || []));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await onSave({ id: dish.id, cat, name: name.trim(), price: Number(price) || 0, desc: desc.trim(), ingredients: ing.split(",").map(s => s.trim()).filter(Boolean), allergens: Array.from(allergens) });
    setBusy(false);
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#0c0d10] flex flex-col" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onCancel} className="text-xs text-[#8a8aa0]">← חזרה</button>
        <p className="text-xs font-bold">{dish.id ? "עריכה" : "חדש"}</p>
        <div className="w-8" />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="שם" className="w-full text-xs bg-[#16181c] border border-[#22252b] rounded-lg px-2.5 py-2 text-[#eef0f6] text-right focus:outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={cat} onChange={e => setCat(e.target.value)} className="text-xs bg-[#16181c] border border-[#22252b] rounded-lg px-2 py-2 text-right">
            {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="₪" className="text-xs bg-[#16181c] border border-[#22252b] rounded-lg px-2 py-2 text-left" />
        </div>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="תיאור" className="w-full text-xs bg-[#16181c] border border-[#22252b] rounded-lg px-2.5 py-2 text-right text-[#eef0f6] focus:outline-none" />
        <input value={ing} onChange={e => setIng(e.target.value)} placeholder="מרכיבים" className="w-full text-xs bg-[#16181c] border border-[#22252b] rounded-lg px-2.5 py-2 text-right text-[#eef0f6] focus:outline-none" />
        <div className="flex flex-wrap gap-1">
          {ALLERGENS.map(a => {
            const on = allergens.has(a);
            return <button key={a} type="button" onClick={() => setAllergens(p => { const n = new Set(p); n.has(a) ? n.delete(a) : n.add(a); return n; })} className={`text-[9px] font-bold px-2 py-1 rounded-md ${on ? "bg-[#e0315a] text-white" : "bg-[#16181c] text-[#c4c4d4]"}`}>{a}</button>;
          })}
        </div>
        <div className="flex gap-2">
          {onDelete && <button onClick={onDelete} className="flex-1 py-2 rounded-lg font-bold text-xs bg-[#3a1d22] text-[#e0315a]"><Trash2 size={12} className="inline mr-1" /> מחק</button>}
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg font-bold text-xs bg-[#16181c] text-[#c4c4d4]">ביטול</button>
          <button onClick={save} disabled={!name.trim() || busy} className={`flex-1 py-2 rounded-lg font-bold text-xs ${name.trim() && !busy ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#b4b4c4]"}`}>שמור</button>
        </div>
      </div>
    </div>
  );
}
