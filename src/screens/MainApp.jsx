import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Send, Loader2, Check, AlertTriangle, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";

const CATS = {
  starters: { label: "ראשונות" },
  mains:    { label: "עיקריות" },
  desserts: { label: "קינוחים" },
  drinks:   { label: "קוקטיילים ויין" },
};
const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום", "סולפיטים"];

const db = supabase.schema("menu_app");

export default function MainApp({ restaurant, onSignOut }) {
  const [items, setItems] = useState(null);
  const [editId, setEditId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [publishState, setPublishState] = useState("idle"); // idle | publishing | done

  const reload = async () => {
    if (!restaurant?.id) return;
    const { data, error } = await db.from("menu_items")
      .select("*").eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: true });
    if (!error) setItems(data || []);
  };

  useEffect(() => { reload(); }, [restaurant?.id]);

  const saveItem = async (updated) => {
    if (!restaurant?.id) return;
    if (updated.id) {
      // Edit
      await db.from("menu_items").update({
        category: updated.cat,
        name: updated.name,
        price: updated.price,
        description: updated.desc,
        ingredients: updated.ingredients,
        allergens: updated.allergens,
        is_special: updated.isSpecial,
      }).eq("id", updated.id);
    } else {
      // Create
      await db.from("menu_items").insert({
        restaurant_id: restaurant.id,
        category: updated.cat,
        name: updated.name,
        price: updated.price,
        description: updated.desc,
        ingredients: updated.ingredients,
        allergens: updated.allergens,
        is_special: false,
      });
    }
    setEditId(null);
    setCreating(false);
    await reload();
  };

  const deleteItem = async (id) => {
    await db.from("menu_items").delete().eq("id", id);
    setItems((p) => p.filter((x) => x.id !== id));
  };

  const publish = async () => {
    if (!restaurant?.id) return;
    setPublishState("publishing");
    try {
      // Delete old published, insert new
      await db.from("published_menu").delete().neq("source_item_id", "00000000-0000-0000-0000-000000000000");
      if (items && items.length) {
        const pubRows = items.map((x) => ({
          source_item_id: x.id,
          category: x.category,
          name: x.name,
          price: x.price,
          description: x.description,
          ingredients: x.ingredients,
          allergens: x.allergens,
          is_special: x.is_special,
        }));
        await db.from("published_menu").insert(pubRows);
      }
      setPublishState("done");
      setTimeout(() => setPublishState("idle"), 2800);
    } catch (e) {
      console.error(e);
      setPublishState("idle");
    }
  };

  const editItem = items?.find((x) => x.id === editId) || null;
  const grouped = Object.keys(CATS).map((k) => ({
    key: k,
    label: CATS[k].label,
    items: (items || []).filter((x) => (x.category || "mains") === k),
  }));

  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      {/* Header */}
      <div className="bg-[#16181c] border-b border-[#22252b] px-5 py-4 flex items-center justify-between">
        <button onClick={onSignOut} className="w-9 h-9 rounded-lg bg-[#191b1f] flex items-center justify-center text-[#8a8aa0] active:bg-[#20232a]">
          <LogOut size={18} />
        </button>
        <div className="text-center">
          <p className="font-black text-base">{restaurant?.name}</p>
          <p className="text-xs text-[#8a8aa0]">ניהול תפריט</p>
        </div>
        <div className="w-9" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="flex gap-2">
          <button onClick={() => setCreating(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0]">
            <Plus size={18} /> מנה חדשה
          </button>
          <button onClick={publish} disabled={publishState === "publishing" || !items?.length}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm ${
              publishState === "done" ? "bg-[#15302b] text-[#22c08c]"
              : items?.length ? "bg-[#6d5efc] text-white active:bg-[#5b4ef0]"
              : "bg-[#22252b] text-[#b4b4c4] cursor-not-allowed"
            }`}>
            {publishState === "publishing" ? <Loader2 size={16} className="animate-spin" /> : publishState === "done" ? <Check size={16} /> : <Send size={16} />}
            {publishState === "done" ? "פורסם" : "פרסום"}
          </button>
        </div>

        {items === null ? (
          <div className="bg-[#16181c] rounded-2xl p-6 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-[#6d5efc]" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-[#16181c] rounded-2xl p-8 text-center">
            <p className="text-sm font-black text-[#c4c4d4]">התפריט ריק</p>
            <p className="text-xs text-[#8a8aa0] mt-1">הוסף/י מנה ראשונה כדי להתחיל</p>
          </div>
        ) : (
          grouped.map((g) => g.items.length === 0 ? null : (
            <div key={g.key}>
              <p className="text-xs font-bold text-[#8a8aa0] mb-2">{g.label} · {g.items.length}</p>
              <div className="space-y-2">
                {g.items.map((item) => (
                  <div key={item.id} className="bg-[#16181c] rounded-2xl p-3.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#eef0f6]">{item.name}</p>
                      {item.description && <p className="text-xs text-[#8a8aa0] mt-0.5 line-clamp-1">{item.description}</p>}
                    </div>
                    <span className="text-sm font-black text-[#ea7317] flex-shrink-0">₪{item.price}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Editor sheet */}
      {(editItem || creating) && (
        <DishEditor
          dish={editItem || { id: null, cat: "mains", name: "", price: "", desc: "", ingredients: [], allergens: [], isSpecial: false }}
          onSave={saveItem}
          onDelete={editItem ? () => { deleteItem(editItem.id); setEditId(null); } : null}
          onCancel={() => { setEditId(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function DishEditor({ dish, onSave, onDelete, onCancel }) {
  const [name, setName] = useState(dish.name || "");
  const [price, setPrice] = useState(String(dish.price || ""));
  const [desc, setDesc] = useState(dish.desc || "");
  const [cat, setCat] = useState(dish.cat || "mains");
  const [ingredients, setIngredients] = useState((dish.ingredients || []).join(", "));
  const [allergens, setAllergens] = useState(new Set(dish.allergens || []));
  const [isSpecial, setIsSpecial] = useState(!!dish.isSpecial);
  const [busy, setBusy] = useState(false);

  const canSave = name.trim().length > 0;
  const toggleAllergen = (a) => setAllergens((p) => { const n = new Set(p); n.has(a) ? n.delete(a) : n.add(a); return n; });

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    await onSave({
      id: dish.id,
      cat,
      name: name.trim(),
      price: Number(price) || 0,
      desc: desc.trim(),
      ingredients: ingredients.split(",").map((s) => s.trim()).filter(Boolean),
      allergens: Array.from(allergens),
      isSpecial,
    });
    setBusy(false);
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#0c0d10] flex flex-col">
      <div className="bg-[#16181c] border-b border-[#22252b] px-5 py-3 flex items-center justify-between">
        <button onClick={onCancel} className="text-[#8a8aa0] active:text-[#eef0f6]">
          ← בחזרה
        </button>
        <p className="font-bold">{dish.id ? "עריכה" : "מנה חדשה"}</p>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        <Field label="שם המנה">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: סלט קיסר"
            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="קטגוריה">
            <select value={cat} onChange={(e) => setCat(e.target.value)}
              className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right focus:outline-none focus:border-[#6d5efc]">
              {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="מחיר (₪)">
            <input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} dir="ltr"
              className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-left focus:outline-none focus:border-[#6d5efc]" />
          </Field>
        </div>

        <Field label="תיאור">
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="תיאור קצר"
            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] resize-none focus:outline-none focus:border-[#6d5efc]" />
        </Field>

        <Field label="מרכיבים (מופרדים בפסיק)">
          <input value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="עגבניות, חסה, גבינה"
            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
        </Field>

        <Field label="אלרגנים">
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => {
              const on = allergens.has(a);
              return (
                <button key={a} type="button" onClick={() => toggleAllergen(a)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl ${on ? "bg-[#e0315a] text-white" : "bg-[#16181c] border border-[#22252b] text-[#c4c4d4]"}`}>
                  {a}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="">
          <button type="button" onClick={() => setIsSpecial(!isSpecial)}
            className={`w-full py-3 rounded-2xl font-bold text-sm ${isSpecial ? "bg-[#f3c14b] text-[#0c0d10]" : "bg-[#16181c] border border-[#22252b] text-[#c4c4d4]"}`}>
            {isSpecial ? "✓ מנת היום" : "מנת היום?"}
          </button>
        </Field>

        <div className="flex gap-2 pt-4 pb-6">
          {onDelete && <button onClick={onDelete} className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-[#3a1d22] border border-[#e0315a] text-[#e0315a]"><Trash2 size={16} className="inline mr-2" /> מחיקה</button>}
          <button onClick={onCancel} className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-[#16181c] border border-[#22252b] text-[#c4c4d4]">ביטול</button>
          <button onClick={save} disabled={!canSave || busy} className={`flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-1.5 ${canSave && !busy ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#b4b4c4]"}`}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} שמירה
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      {label && <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">{label}</p>}
      {children}
    </div>
  );
}
