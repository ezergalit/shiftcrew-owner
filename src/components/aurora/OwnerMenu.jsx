
import { useEffect, useMemo, useRef, useState } from "react";
import { Star, ChevronRight, ChevronLeft } from "lucide-react";
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
//
// ⚠️ Same rule as `pubToCard` on the waiter side and `examFixed`. It is duplicated across
// two repos on purpose (no shared package); change it in all three or the two apps will
// disagree about what a dish is.
export const isGuide = (i) =>
  (i.category || "").startsWith("הדרכת") || (i.name || "").startsWith("מה חשוב לדעת");
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

// 🔴 This component was deleted by the home-screen cleanup (b5d8686) while its call site
// stayed — a bare `<DishPreview>` is just an undefined global to the bundler, so the build
// was green and every dish tap threw ReferenceError in production. Fifth time in this
// project. **A green build proves nothing about JSX identifiers.**
//
// Tapping a dish used to drop the manager straight into the full edit form — every field
// at once, when all they wanted was to check what is in it (user, 29.8: "it opens
// everything instead of a summary"). Reading and editing are different jobs: this is the
// reading one, the same shape the waiter sees, with one button into the other.
//
// ⚠️ **Only what is actually set appears** (user, 29.8: "כל מה שלא מסומן לא צריך להיות
// פה, שיהיה קצר ולעניין"). No empty ingredient block, no "no warnings recorded" card, no
// nine category chips — one line naming the category this dish is in. A preview that
// lists what a dish does *not* have is as long as the edit form and reads like a form.
function DishPreview({ item, flagGroups, tone, merged, onBack, onEdit, onToggleStar, onPrev, onNext, pos }) {
  // A guide is not a dish, so it must not be read like one — no price, no warning
  // groups, no ⭐, and the button says what it edits (user, 29.8: "it cant say edit
  // dish on a service").
  const guide = isGuide(item);
  // In merged mode pregnancy values are shown under the pitfalls heading, so the two
  // read as the one group the restaurant actually thinks in.
  const groups = flagGroups
    .map((g) => ({
      g,
      vals: merged && g.key === "pitfalls"
        ? [...(item.pregnancy || []), ...(item.pitfalls || [])]
        : item[g.key] || [],
    }))
    .filter((x) => x.vals.length > 0 && !(merged && x.g.key === "pregnancy"));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <button
          type="button" onClick={onBack} aria-label="חזרה לתפריט"
          className="w-10 h-10 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#eef0f6] flex-none"
        >
          <ChevronRight size={19} />
        </button>
        {/* The one category it is in — not a row of the ones it is not. */}
        <p className="flex-1 min-w-0 text-[11px] font-black text-[#8a919e] truncate">{item.category}</p>
        {!guide && (
          <button
            type="button"
            onClick={() => onToggleStar(item)}
            aria-label={item.starred ? `הסרת הדגשה מ${item.name}` : `הדגשת ${item.name}`}
            className={`au-star ${item.starred ? "on" : ""}`}
          >
            <Star size={18} fill={item.starred ? "currentColor" : "none"} />
          </button>
        )}
      </div>

      {item.image_url && (
        <img src={item.image_url} alt="" className="w-full h-44 object-cover rounded-2xl border border-[#22252b]" />
      )}

      <div className="glass">
        <div className="flex items-start gap-2">
          <h2 className="flex-1 min-w-0 text-[19px] font-black text-[#eef0f6] leading-snug">{item.name}</h2>
          {!guide && item.price ? <span className="text-[16px] font-black text-[#eef0f6] tabular-nums">{item.price} ₪</span> : null}
        </div>
        {item.description && (
          <p className="text-[13px] text-[#8a919e] leading-relaxed mt-2">{item.description}</p>
        )}
      </div>

      {item.ingredients?.length > 0 && (
        <div className="glass">
          <p className="text-[11px] font-black text-[#8a919e] mb-2">{guide ? "נקודות מפתח" : "מרכיבים"}</p>
          <div className="flex flex-wrap gap-1.5">
            {item.ingredients.map((v) => (
              <span key={v} className="text-[12.5px] font-bold px-2.5 py-1.5 rounded-lg bg-[#22252b] text-[#eef0f6]">{v}</span>
            ))}
          </div>
        </div>
      )}

      {/* The warning groups, in their own colours. Nothing marked ⇒ no card at all.
          A guide has none by definition. */}
      {!guide && groups.length > 0 && (
        <div className="glass space-y-2">
          {groups.map(({ g, vals }) => (
            <div key={g.key}>
              <p className="text-[11px] font-black text-[#8a919e] mb-1.5">
                {merged && g.key === "pitfalls" ? "מוקשים ורגישות" : KEY_LABEL[g.key] || g.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {vals.map((v) => (
                  <span key={v} className={`chip ${tone[g.key] || "amber"}`}><i className="dot" />{v}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The one thing missing that actually blocks teaching gets a line — a dish with no
          description cannot generate a single question. Everything else stays quiet. */}
      {!item.description && <p className="au-warn">חסר תיאור — בלי תיאור אי אפשר לבנות שאלות</p>}

      <button type="button" onClick={() => onEdit(item)} className="au-pill w-full justify-center py-3">
        {guide ? "עריכת ההדרכה" : "עריכת המנה"}
      </button>

      {/* Walk the category without going back to the list. Reviewing a menu means
          reading it in order (user, 29.8: "אין אופציה לגולל למנה הבאה"); bouncing out to
          a 152-row list between every two dishes is what made that impossible.
          ⚠️ In RTL the NEXT item sits on the LEFT — the arrows point the way the eye
          travels, not the way the array is indexed. */}
      {pos && pos.total > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button" onClick={onNext} disabled={!onNext}
            className="flex-1 py-3 rounded-xl bg-[#16181c] border border-[#22252b] text-[13px] font-black text-[#eef0f6] disabled:opacity-30 flex items-center justify-center gap-1.5"
          >
            <ChevronLeft size={16} /> {guide ? "ההדרכה הבאה" : "המנה הבאה"}
          </button>
          <span className="text-[11px] font-bold text-[#5a5a6e] tabular-nums flex-none px-1">
            {pos.i} / {pos.total}
          </span>
          <button
            type="button" onClick={onPrev} disabled={!onPrev}
            className="flex-1 py-3 rounded-xl bg-[#16181c] border border-[#22252b] text-[13px] font-black text-[#eef0f6] disabled:opacity-30 flex items-center justify-center gap-1.5"
          >
            הקודמת <ChevronRight size={16} />
          </button>
        </div>
      )}
      {/* The tab bar floats over the scroller, so the last control needs room or it sits
          half-under it — which is exactly where the pager landed. */}
      <div className="h-4" />
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
  // "menu" | "guides" — service training is not the menu (user, 29.8), so it is a
  // section of its own rather than a category chip sitting among the courses.
  const [view, setView] = useState("menu");
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

  const guides = useMemo(() => (items || []).filter(isGuide), [items]);
  const dishes = useMemo(() => (items || []).filter((i) => !isGuide(i)), [items]);

  // Menu groups describe the food menus only. A guide carries a menu_group for
  // bookkeeping, and letting it raise a chip would offer the owner a menu filter that
  // selects no dishes.
  const menuGroups = useMemo(
    () => [...new Set(dishes.map((i) => i.menuGroup).filter(Boolean))],
    [dishes]
  );
  const pool = view === "guides" ? guides : dishes;
  const inGroup = useMemo(
    () => (group ? pool.filter((i) => i.menuGroup === group) : pool),
    [pool, group]
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

  // Put the manager back exactly where they were reading.
  useEffect(() => {
    if (!viewing && listScroll.current && scrollRef?.current) {
      const y = listScroll.current;
      requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = y; });
    }
  }, [viewing, scrollRef]);

  // ⚠️ Every hook above every early return. This useEffect used to sit *below* the
  // `dishForm` return, so opening the editor rendered one hook fewer than the list did
  // and React threw "Rendered fewer hooks than expected" — editing a dish crashed the
  // app outright. Fourth time in this project, and the build was green every time.

  // Editing is a screen, not a panel. The form is long on a phone, and leaving the
  // search, the filters and 152 cards scrolling underneath it made it unclear whether
  // you were editing one dish or browsing the menu. While the editor is open it is the
  // only thing here — its own close button is the way out.
  if (dishForm) return <div className="space-y-3">{dishForm}</div>;

  if (viewing) {
    const fresh = items.find((i) => i.id === viewing.id) || viewing;
    // Siblings = the same category, in menu order. The category is the unit an owner
    // reviews; walking across categories would silently cross from starters into wine.
    const sibs = (viewing.category ? pool.filter((i) => i.category === viewing.category) : pool)
      .slice()
      .sort((a, b) => (a.menuPosition ?? 0) - (b.menuPosition ?? 0));
    const at = sibs.findIndex((i) => i.id === fresh.id);
    const go = (n) => { listScroll.current = listScroll.current; setViewing(sibs[n]); };
    return (
      <DishPreview
        item={fresh}
        flagGroups={flagGroups}
        tone={tone}
        merged={merged}
        pos={{ i: at + 1, total: sibs.length }}
        onPrev={at > 0 ? () => go(at - 1) : undefined}
        onNext={at >= 0 && at < sibs.length - 1 ? () => go(at + 1) : undefined}
        onBack={() => setViewing(null)}
        onEdit={(d) => { setViewing(null); onOpenDish(d); }}
        onToggleStar={onToggleStar}
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="au-head">
        <h1 className="flex-1 min-w-0">{view === "guides" ? "הדרכות שירות" : "התפריט"}</h1>
        <button type="button" className="au-pill flex-none" onClick={() => onAdd(cat)}>
          + {view === "guides" ? "הדרכה חדשה" : "מנה חדשה"}
        </button>
      </div>

      {/* ⚠️ Two sections, not one list with an extra category chip. Service training is
          not food (user, 29.8: "הדרכת שירות צריך להיות בsection שונה מתפריט המסעדה
          מכיוון שזה לא תפריט"), and while it sat among the courses every count, filter
          and label treated it as something a guest could order. Shown only when the
          restaurant actually has guides — one tab is not a choice. */}
      {guides.length > 0 && (
        <div className="au-filter">
          <button type="button" className={`au-fchip ${view === "menu" ? "on" : ""}`}
            onClick={() => { setView("menu"); setCat(null); setQ(""); }}>
            התפריט · {dishes.length}
          </button>
          <button type="button" className={`au-fchip ${view === "guides" ? "on" : ""}`}
            onClick={() => { setView("guides"); setCat(null); setGroup(null); setQ(""); }}>
            הדרכות שירות · {guides.length}
          </button>
        </div>
      )}

      <p className="au-hint">
        {view === "guides"
          ? "כרטיסי ידע שהצוות לומד ונבחן עליהם — לא מנות בתפריט"
          : "לחיצה על מנה פותחת אותה לעיון · משם אפשר לערוך"}
      </p>

      {pool.length > 6 && (
        <div className="search">
          <span aria-hidden>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={view === "guides" ? "חיפוש הדרכה" : "חיפוש מנה"}
            aria-label={view === "guides" ? "חיפוש הדרכה" : "חיפוש מנה בתפריט"}
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="ניקוי החיפוש" className="au-x">✕</button>
          )}
        </div>
      )}

      {/* Menu group first, category second — a restaurant with one menu never sees the
          first row at all. */}
      {view === "menu" && menuGroups.length > 1 && (
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

      {pool.length > 0 && shown.length === 0 && (
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
