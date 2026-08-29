import { useEffect, useMemo, useRef, useState } from "react";
import { Star, ChevronRight } from "lucide-react";
import { categoryVisual } from "../../lib/categoryVisual";
import { FLAG_GROUPS, effectiveTrackedFlags } from "../../lib/dishFlags";

// The manager's menu tab under the «אורורה» skin.
//
// Two things the unskinned tab did not do:
//   1. The photo leads. SALON26 carries 64 real dish photos and STUDIO26 carries 117, and
//      the owner never saw a single one — a manager recognises a dish by its picture long
//      before they read its name (user, 28.8: "each item should have his photo in the
//      menu part (like the waiter apps)").
//   2. Filtering is flat. The old tab made a restaurant with several menus drill in and
//      back out; here the menu and the category are two chip rows above one list, so any
//      dish in a 152-item menu is two taps away instead of three screens.

// The four warning groups the waiter already sees, in the manager's card too. A single red
// list told the owner nothing about "דג נא" — that separation is the whole point of the
// four columns, and it was being flattened away here.
const TONE = { allergens: "red", pregnancy: "purple", pitfalls: "amber", kashrut: "amber" };
// ⚠️ Per restaurant, matching the waiter exactly. `features.warnings === "merged"` folds
// pregnancy into the amber list with a 🤰 — Salon treats raw fish as a pregnancy pitfall
// rather than its own group (user, 29.8). Studio keeps all three. The manager's key must
// say the same thing the team's does, or the two apps teach different colours.
const MERGED_TONE = { ...TONE, pregnancy: "amber" };
// ⚠️ Only three chip colours exist, and kashrut shares amber with pitfalls. Colour alone
// would make "בשרי" read as a preference like "חריף", so kashrut says what it is.
const FLAG_PREFIX = { kashrut: "כשרות: " };
// ⚠️ Not `g.short` — that is the singular used on a single chip ("מוקש"), and a legend
// names the group, not one item in it.
const KEY_LABEL = {
  allergens: "אלרגיות",
  pregnancy: "🤰 רגישות",
  pitfalls: "מוקשים",
  kashrut: "כשרות",
};

// A "הדרכת·" category holds knowledge cards, not dishes — calling six service-training
// cards "6 מנות" is the kind of small wrongness that makes an owner distrust the rest.
const countLabel = (cat, n) => {
  const card = (cat || "").startsWith("הדרכת");
  if (n === 1) return card ? "כרטיס אחד" : "מנה אחת";
  return `${n} ${card ? "כרטיסים" : "מנות"}`;
};

// ⚠️ Declared at module scope, NOT inside OwnerMenu. As a nested arrow function this was a
// brand-new component *type* on every render, so React threw away and rebuilt all 152
// cards — images included — on every keystroke in the search box.
function Dish({ item, flagGroups, tone, merged, onOpen, onToggleStar }) {
  const vis = categoryVisual(item.category);
  const flags = flagGroups.flatMap((g) =>
    (item[g.key] || []).map((v) => ({
      key: `${g.key}:${v}`,
      tone: TONE[g.key] || "amber",
      v: (FLAG_PREFIX[g.key] || "") + v,
    }))
  );
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item); }
      }}
      className={`glass au-dish ${item.starred ? "starred" : ""} ${!item.description ? "warn" : ""}`}
    >
      <span className="ph" aria-hidden>
        {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : vis.emoji}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-start gap-2">
          <h3 className="flex-1 min-w-0">{item.name}</h3>
          {item.price ? <span className="price">{item.price} ₪</span> : null}
          {/* The star is the one control on the card that is not "open the editor". */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleStar(item); }}
            title={item.starred
              ? "מנה מודגשת — הצוות מתרגל אותה בעדיפות. לחצו להסרת ההדגשה."
              : "הדגישו מנה שחשוב במיוחד שהצוות ידע — היא תקפוץ ראשונה בתרגול."}
            aria-label={item.starred ? `הסרת הדגשה מ${item.name}` : `הדגשת ${item.name}`}
            className={`au-star ${item.starred ? "on" : ""}`}
          >
            <Star size={16} fill={item.starred ? "currentColor" : "none"} />
          </button>
        </span>
        {item.description ? (
          <span className="desc line-clamp-2">{item.description}</span>
        ) : (
          <span className="au-warn block">חסר תיאור — לחצו להשלמה</span>
        )}
        {flags.length > 0 && (
          <span className="flags">
            {flags.map((f) => (
              <span key={f.key} className={`chip ${f.tone}`}><i className="dot" />{f.v}</span>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

export default function OwnerMenu({
  restaurant,
  items,
  onAdd,
  onOpenDish,
  onToggleStar,
  dishForm,
  operatorLine,
  emptyNote,
  scrollRef,
}) {
  const [group, setGroup] = useState(null);   // null = every menu
  const [cat, setCat] = useState(null);       // null = every category
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState(null);   // the dish being READ, not edited
  // ⚠️ Where the list was scrolled when a dish was opened. Coming back to the top of a
  // 152-dish menu after glancing at one dish is what makes "briefly go over the dishes"
  // impossible — you lose your place every single time.
  const listScroll = useRef(0);

  const merged = restaurant?.features?.warnings === "merged";
  const tone = merged ? MERGED_TONE : TONE;

  const flagGroups = useMemo(() => {
    const tracked = effectiveTrackedFlags(restaurant?.tracked_flags);
    return FLAG_GROUPS.filter((g) => tracked.includes(g.key));
  }, [restaurant?.tracked_flags]);

  // The key: two chips when merged, three otherwise.
  const keyGroups = useMemo(
    () => (merged ? flagGroups.filter((g) => g.key !== "pregnancy") : flagGroups),
    [flagGroups, merged],
  );

  const menuGroups = useMemo(
    () => [...new Set(items.map((i) => i.menuGroup).filter(Boolean))],
    [items]
  );

  const inGroup = useMemo(
    () => (group ? items.filter((i) => i.menuGroup === group) : items),
    [items, group]
  );

  const categories = useMemo(
    () => [...new Set(inGroup.map((i) => i.category).filter(Boolean))],
    [inGroup]
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inGroup.filter((i) => {
      if (cat && i.category !== cat) return false;
      if (!needle) return true;
      return (
        i.name?.toLowerCase().includes(needle) ||
        i.description?.toLowerCase().includes(needle) ||
        i.category?.toLowerCase().includes(needle)
      );
    });
  }, [inGroup, cat, q]);

  // Under "הכל" the list keeps its category headings: at 152 dishes an unbroken list is
  // unusable, and the heading is how the owner knows where they are while scrolling.
  const sections = useMemo(() => {
    if (cat || q.trim()) return [{ cat: null, list: shown }];
    const order = [...new Set(shown.map((i) => i.category).filter(Boolean))];
    const out = order.map((c) => ({ cat: c, list: shown.filter((i) => i.category === c) }));
    const loose = shown.filter((i) => !i.category);
    if (loose.length) out.push({ cat: "ללא קטגוריה", list: loose });
    return out;
  }, [shown, cat, q]);

  // Editing is a screen, not a panel. The form is long on a phone, and leaving the
  // search, the filters and 152 cards scrolling underneath it made it unclear whether
  // you were editing one dish or browsing the menu. While the editor is open it is the
  // only thing here — its own close button is the way out.
  if (dishForm) return <div className="space-y-3">{dishForm}</div>;

  // Put the manager back exactly where they were reading.
  useEffect(() => {
    if (!viewing && listScroll.current && scrollRef?.current) {
      const y = listScroll.current;
      requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = y; });
    }
  }, [viewing, scrollRef]);

  if (viewing) {
    const fresh = items.find((i) => i.id === viewing.id) || viewing;
    return (
      <DishPreview
        item={fresh}
        flagGroups={flagGroups}
        tone={tone}
        merged={merged}
        onBack={() => setViewing(null)}
        onEdit={(d) => { setViewing(null); onOpenDish(d); }}
        onToggleStar={onToggleStar}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="au-head">
        <h1 className="flex-1 min-w-0">התפריט</h1>
        <button type="button" className="au-pill flex-none" onClick={() => onAdd(cat)}>+ מנה חדשה</button>
      </div>
      <p className="au-hint">לחיצה על מנה פותחת אותה לעיון · משם אפשר לערוך</p>

      {items.length > 6 && (
        <div className="search">
          <span aria-hidden>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש מנה"
            aria-label="חיפוש מנה בתפריט"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="ניקוי החיפוש" className="au-x">✕</button>
          )}
        </div>
      )}

      {/* Menu group first, category second — a restaurant with one menu never sees the
          first row at all. */}
      {menuGroups.length > 1 && (
        <div className="au-filter">
          <button type="button" className={`au-fchip ${!group ? "on" : ""}`}
            onClick={() => { setGroup(null); setCat(null); }}>כל התפריטים</button>
          {menuGroups.map((g) => (
            <button key={g} type="button" className={`au-fchip ${group === g ? "on" : ""}`}
              onClick={() => { setGroup(g); setCat(null); }}>{g}</button>
          ))}
        </div>
      )}

      {categories.length > 1 && (
        <div className="au-filter">
          <button type="button" className={`au-fchip ${!cat ? "on" : ""}`} onClick={() => setCat(null)}>
            הכל
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className={`au-fchip ${cat === c ? "on" : ""}`}
              onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      )}

      {items.length === 0 && emptyNote}

      {items.length > 0 && shown.length === 0 && (
        <p className="text-[13px] text-[#8a919e] text-center py-6 leading-relaxed">
          אין מנה שמתאימה לחיפוש.
          <br />
          <button type="button" className="text-[var(--em)] font-bold mt-1 py-2 px-3"
            onClick={() => { setQ(""); setCat(null); setGroup(null); }}>
            ניקוי הסינון
          </button>
        </p>
      )}

      {sections.map((sec) => (
        <div key={sec.cat || "_"} className="space-y-2">
          {sec.cat && (
            <div className="au-cathead">
              <span className="ic" aria-hidden>{categoryVisual(sec.cat).emoji}</span>
              <b>{sec.cat}</b>
              <span>{countLabel(sec.cat, sec.list.length)}</span>
            </div>
          )}
          {sec.list.map((item) => (
            <Dish
              key={item.id}
              item={item}
              flagGroups={flagGroups}
              tone={tone}
              merged={merged}
              onOpen={(d) => {
                listScroll.current = scrollRef?.current?.scrollTop || 0;
                setViewing(d);
              }}
              onToggleStar={onToggleStar}
            />
          ))}
        </div>
      ))}

      {/* The owner fixes and asks; we build. Structural work — a whole new menu, moving a
          category — goes out as a request rather than as a button they would rarely use
          correctly. It sits at the bottom because the menu itself is what this tab is for. */}
      <div className="pt-1">{operatorLine}</div>
    </div>
  );
}
