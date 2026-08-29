import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Camera, Trash2, Check, ChevronDown } from "lucide-react";
import { FLAG_GROUPS, FLAG_GROUP_BY_KEY, effectiveTrackedFlags } from "../../lib/dishFlags";

// The manager's dish editor.
//
// The old form was every field at once with almost no labels: a bare name box, nine
// category chips of which one was selected, a bare "32", a bare paragraph. A manager could
// not tell at a glance which box was the price and which was the description (user, 29.8:
// "צריך לחשוב על חווית המשתמש של המנהלים שתהיה כמה שיותר פשוטה ונוחה").
//
// Two rules fix most of it:
//   1. **Every field says what it is.** "מחיר", "תיאור המנה", "אלרגיות ורגישות".
//   2. **Closed lists collapse to the choice.** The category shows the one that is
//      selected; the other eight appear only when you go to change it.

const Field = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <p className="text-[12px] font-black text-[#8a919e]">
      {label}
      {hint && <span className="font-normal text-[#6b7280]"> · {hint}</span>}
    </p>
    {children}
  </div>
);

const INPUT =
  "w-full bg-[#0c0d10] border border-[#22252b] rounded-xl px-3.5 py-3 text-[16px] " +
  "text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#22c08c]/60";

/** A closed list shown as the current choice; the rest open on demand. */
function PickOne({ value, options, onChange, placeholder }) {
  const [open, setOpen] = useState(!value);
  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 bg-[#0c0d10] border border-[#22252b] rounded-xl px-3.5 py-3 text-right"
      >
        <span className="flex-1 min-w-0 text-[15px] font-bold text-[#eef0f6] truncate">{value}</span>
        <span className="text-[12px] text-[#22c08c] font-bold flex-none">שינוי</span>
        <ChevronDown size={15} className="text-[#5a5a6e] flex-none" />
      </button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((c) => (
        <button
          key={c} type="button"
          onClick={() => { onChange(c); setOpen(false); }}
          className={`text-[13px] py-2 px-3 rounded-lg transition ${
            value === c ? "bg-[#22c08c] text-[#06231a] font-black" : "bg-[#22252b] text-[#8a919e]"
          }`}
        >
          {c}
        </button>
      ))}
      {!options.length && <p className="text-[12px] text-[#6b7280]">{placeholder}</p>}
    </div>
  );
}

/** Multi-select over a closed list of values, coloured by its group. */
function PickMany({ values, options, selected, tone, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((v) => {
        const on = selected.includes(v);
        return (
          <button
            key={v} type="button"
            onClick={() => onChange(on ? selected.filter((x) => x !== v) : [...selected, v])}
            className={`chip ${on ? tone : ""} ${on ? "" : "opacity-45"}`}
            style={on ? undefined : { background: "rgba(238,240,246,.05)" }}
          >
            <i className="dot" />{v}
          </button>
        );
      })}
    </div>
  );
}

/** Free-text tags (ingredients) — add with Enter, remove with ✕. */
function Tags({ values, onChange, placeholder }) {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setText("");
  };
  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 bg-[#22252b] text-[#eef0f6] text-[13px] font-bold px-2.5 py-1.5 rounded-lg">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`הסרת ${v}`} className="text-[#8a8aa0] p-1 -m-1"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} dir="rtl" className={INPUT}
        />
        <button type="button" onClick={add} disabled={!text.trim()}
          className="px-4 min-h-[44px] rounded-xl bg-[#22252b] text-[#eef0f6] font-black text-[13px] disabled:opacity-30">
          הוסף
        </button>
      </div>
    </div>
  );
}

export default function DishEditor({
  item, onChange, onSave, onCancel, onDelete,
  existingCategories, restaurant, uploadPhoto, menuOf,
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const isNew = !item.id;

  const merged = restaurant?.features?.warnings === "merged";
  const tracked = effectiveTrackedFlags(restaurant?.tracked_flags);
  const groups = FLAG_GROUPS.filter((g) => tracked.includes(g.key));
  const TONE = { allergens: "red", pregnancy: merged ? "amber" : "purple", pitfalls: "amber", kashrut: "amber" };

  const pickPhoto = async (file) => {
    if (!file) return;
    setPhotoErr(""); setUploading(true);
    try { onChange({ ...item, image_url: await uploadPhoto(file) }); }
    catch (e) { setPhotoErr(e.message); }
    finally { setUploading(false); }
  };

  return (
    <div id="dish-form" className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[17px] font-black text-[#eef0f6]">{isNew ? "מנה חדשה" : "עריכת מנה"}</p>
        <button
          onClick={onCancel} aria-label="סגירה בלי לשמור" title="סגירה בלי לשמור"
          className="w-10 h-10 rounded-xl bg-[#22252b] flex items-center justify-center text-[#8a8aa0] flex-none"
        ><X size={17} /></button>
      </div>

      <div className="glass space-y-4">
        <Field label="תמונת המנה" hint="כך הצוות מזהה אותה ברשימה">
          <div className="flex items-center gap-3">
            {item.image_url ? (
              <button type="button" onClick={() => setZoom(true)} title="הגדלת התמונה" className="flex-none">
                <img src={item.image_url} alt="" className="w-16 h-16 rounded-xl object-cover border border-[#22252b]" />
              </button>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-[#0c0d10] border border-dashed border-[#3a3d46] grid place-items-center text-[#5a5a6e] flex-none">
                <Camera size={20} />
              </div>
            )}
            <label className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#22c08c] cursor-pointer py-2">
              <Camera size={14} />
              {uploading ? "מעלה…" : item.image_url ? "החלפת התמונה" : "הוספת תמונה"}
              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          {photoErr && <p className="text-[11px] text-[#ff8098] mt-1">{photoErr}</p>}
        </Field>

        <Field label="שם המנה">
          <input value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })}
            placeholder="למשל: סלט יווני" dir="rtl" className={INPUT} />
        </Field>

        <Field label="קטגוריה" hint={menuOf?.(item.category) ? `יופיע ב${menuOf(item.category)}` : undefined}>
          {existingCategories.length > 0 ? (
            <PickOne value={item.category} options={existingCategories}
              onChange={(c) => onChange({ ...item, category: c })}
              placeholder="עדיין אין קטגוריות בתפריט" />
          ) : (
            <input value={item.category || ""} onChange={(e) => onChange({ ...item, category: e.target.value })}
              placeholder="למשל: ראשונות" dir="rtl" className={INPUT} />
          )}
        </Field>

        <Field label="מחיר" hint="בשקלים · 0 = מחיר נקבע במקום">
          <input type="number" inputMode="numeric" value={item.price ?? ""}
            onChange={(e) => onChange({ ...item, price: Number(e.target.value) || 0 })}
            placeholder="0" dir="ltr" className={`${INPUT} text-right`} />
        </Field>

        <Field label="תיאור המנה" hint="מה שהמלצר אומר לשולחן">
          <textarea value={item.description} rows={3}
            onChange={(e) => onChange({ ...item, description: e.target.value })}
            placeholder="במשפט אחד — ממה היא עשויה ואיך היא מוגשת" dir="rtl"
            className={`${INPUT} resize-none leading-relaxed`} />
        </Field>
      </div>

      <div className="glass space-y-4">
        <Field label="מרכיבים" hint="מהם נבנות שאלות התרגול">
          <Tags values={item.ingredients || []} onChange={(v) => onChange({ ...item, ingredients: v })}
            placeholder="מרכיב אחד, ואנטר" />
        </Field>

        {/* ⚠️ Salon folds pregnancy into pitfalls (features.warnings === "merged", user
            29.8: "דג נא במסעדה הזאת נחשב מוקש להריון ולא רגישות"). The two DB columns
            stay separate — each chip still writes to its own — but the manager sees ONE
            heading, because two headings is exactly the split they asked us to remove.
            Studio keeps all three groups apart. */}
        {groups.map((g) => {
          if (merged && g.key === "pregnancy") return null;   // folded into pitfalls below
          const folded = merged && g.key === "pitfalls"
            ? [{ key: "pregnancy" }, { key: "pitfalls" }] : [{ key: g.key }];
          return (
            <Field
              key={g.key}
              label={g.key === "allergens" ? "אלרגיות"
                : merged && g.key === "pitfalls" ? "מוקשים ורגישות"
                : g.key === "pregnancy" ? "רגישות בהריון" : g.label}
              hint={g.key === "allergens" ? "שדה בטיחות — חובה לדייק" : undefined}
            >
              <div className="space-y-1.5">
                {folded.map((f) => (
                  <PickMany
                    key={f.key}
                    options={FLAG_GROUP_BY_KEY[f.key].values}
                    selected={item[f.key] || []}
                    tone={TONE[f.key]}
                    onChange={(v) => onChange({ ...item, [f.key]: v })}
                  />
                ))}
              </div>
            </Field>
          );
        })}
      </div>

      <div className="glass">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={!!item.starred}
            onChange={(e) => onChange({ ...item, starred: e.target.checked })} className="w-5 h-5" />
          <span className="flex-1">
            <span className="block text-[14px] font-black text-[#eef0f6]">⭐ מנה מודגשת</span>
            <span className="block text-[11.5px] text-[#8a919e] mt-0.5">תקפוץ ראשונה בתרגול של הצוות</span>
          </span>
        </label>
      </div>

      <button onClick={onSave} className="au-pill w-full justify-center py-3.5 text-[14px]">
        <Check size={16} /> שמירה
      </button>

      {onDelete && (!confirmingDelete ? (
        <button onClick={() => setConfirmingDelete(true)}
          className="w-full text-[12px] font-bold text-[#8a919e] py-2.5 hover:text-[#ff8098] transition">
          <Trash2 size={12} className="inline ml-1" /> מחיקת המנה מהתפריט
        </button>
      ) : (
        <div className="bg-[#3a1d22] border border-[#e0315a]/40 rounded-xl p-3 space-y-2">
          <p className="text-[12px] text-[#eef0f6] leading-relaxed">
            למחוק את ״{item.name}״? המנה תוסר גם מאפליקציית הצוות, וההתקדמות עליה תימחק.
          </p>
          <div className="flex gap-2">
            <button onClick={onDelete} className="flex-1 bg-[#e0315a] text-white text-[12px] font-black py-2.5 rounded-lg">כן, למחוק</button>
            <button onClick={() => setConfirmingDelete(false)} className="px-4 bg-[#22252b] text-[#8a919e] text-[12px] font-black py-2.5 rounded-lg">ביטול</button>
          </div>
        </div>
      ))}

      {/* Portalled: every card surface here carries backdrop-filter, which would otherwise
          size this overlay to the card instead of the screen. */}
      {zoom && item.image_url && createPortal(
        <button onClick={() => setZoom(false)} aria-label="סגירת התמונה"
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-6">
          <img src={item.image_url} alt="" className="max-w-[86%] max-h-[70vh] rounded-2xl object-contain shadow-2xl" />
        </button>, document.body)}
    </div>
  );
}
