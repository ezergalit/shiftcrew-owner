
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
// Service training is a destination, not a menu_group — the sentinel keeps it in the
// same `group` state so back behaves identically.
const SERVICE = "\u0000service";

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
  // 🔴 `tone[g.key]`, not the constant TONE — the prop is the per-restaurant map, and
  // under merged warnings pregnancy is amber. Reading the constant here is why Salon's
  // dish LIST still showed purple while the dish screen didn't (user, 30.8: "עדיין יש
  // את הצבע הסגול ורק כשאתה נכנס לתוך המנה עצמה זה נעלם").
  const flags = flagGroups.flatMap((g) =>
    (item[g.key] || []).map((v) => ({
      key: `${g.key}:${v}`,
      tone: tone[g.key] || "amber",
      v: (g.key === "pregnancy" && merged ? "🤰 " : "") + (FLAG_PREFIX[g.key] || "") + v,
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
function DishPreview({ item, flagGroups, tone, merged, onBack, onEdit, onToggleStar, onPrev, onNext, pos, lastInCat }) {
  const [zoom, setZoom] = useState(false);
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
  // 🔴 Portalled, and it covers the tab bar — the same trap the waiter's dish screen
  // fell into (user, 30.8: "there is still no next dish button", said three times).
  // `.aurora-skin` sets `isolation:isolate`, so anything rendered inside it is sealed
  // into that stacking context, and the bottom nav — which paints a backdrop-filter
  // layer later in the very same context — covers the overlay's lower edge. That edge
  // is exactly where the pager lives. A 16px spacer never had a chance: the nav is
  // `24px + safe-area-inset-bottom` tall, i.e. ~58px on a phone and 24px in a desktop
  // browser, which is why measuring here kept saying it was fine.
  // The skin class stays on the wrapper so the scoped aurora CSS still applies.
  const paged = pos && pos.total > 1;
  return createPortal(
    <div className="aurora-skin fixed inset-0 z-[70] bg-[#0c0d10] flex flex-col" dir="rtl">
     <div className={`flex-1 min-h-0 overflow-y-auto au-preview space-y-3 ${paged ? "paged" : ""}`}>
      <div className="flex items-center gap-2.5">
        <button
          type="button" onClick={onBack} aria-label="חזרה לתפריט"
          className="w-10 h-10 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#eef0f6] flex-none"
        >
          <ChevronRight size={19} />
        </button>
        {/* The one category it is in — not a row of the ones it is not. */}
        <p className="flex-1 min-w-0 text-[11px] font-black text-[#8a919e] truncate">
          {item.category}{paged ? ` · ${pos.i}/${pos.total}` : ""}
        </p>
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

      {/* ⚠️ `object-contain`, not `object-cover`. A fixed 176px box cropped every wide
          plate — the manager was checking a dish and seeing the middle of it (user, 29.8:
          "התמונה של המנה חתוכה"). The whole photo, on its own surface, at whatever
          shape it actually is. Same treatment the waiter's dish screen uses.
          Tapping it opens it full-screen. */}
      {item.image_url && (
        <button type="button" onClick={() => setZoom(true)} className="block w-full" aria-label="הגדלת התמונה">
          <img src={item.image_url} alt={item.name}
            className="w-full max-h-64 object-contain rounded-2xl bg-[#16181c] border border-[#22252b]" />
        </button>
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
          <p className="text-[11px] font-black text-[#8a919e] mb-2">{guide ? "נקודות מפתח" : item.wine ? "תיאור" : "מרכיבים"}</p>
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

      {/* ⚠️ z-[80]: above the preview overlay itself (z-70), or the zoomed photo opens
          behind the screen that launched it. */}
      {zoom && createPortal(
        <button onClick={() => setZoom(false)} aria-label="סגירת התמונה"
          className="fixed inset-0 z-[80] bg-black/95 flex items-center justify-center p-5">
          <img src={item.image_url} alt={item.name} className="max-w-full max-h-full rounded-2xl object-contain" />
        </button>, document.body)}
     </div>

      {/* The pager is a bar of its own, outside the scroll — identical to the waiter's
          (user, 30.8: "כפתור המנה הבאה צריך להיות בדיוק כמו אפליקציית המלצרים… נשאר
          איתך בזמן שאתה מגולל במנה ארוכה"). Big, green, and pinned: walking the menu
          is the main control of this screen, and on a long dish the inline version
          lived below the fold — invisible exactly when the dish had the most to read.
          ⚠️ In RTL the NEXT item sits on the LEFT — DOM order: prev first (right). */}
      {paged && (
        <div className="flex-shrink-0 border-t border-[#22252b] bg-[#16181c] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2">
          <button
            type="button" onClick={onPrev} disabled={!onPrev}
            className="flex-1 py-3 min-h-[48px] rounded-xl font-black text-sm bg-[#20232b] text-[#eef0f6] disabled:opacity-30 flex items-center justify-center gap-1.5"
          >
            <ChevronRight size={17} /> הקודמת
          </button>
          <button
            type="button" onClick={onNext} disabled={!onNext}
            className="flex-1 py-3 min-h-[48px] rounded-xl font-black text-sm text-white disabled:opacity-30 flex items-center justify-center gap-1.5"
            style={{ background: "linear-gradient(135deg,#22c08c,#17805d)" }}
          >
            {lastInCat ? "סיימתי את הקטגוריה" : <>{guide ? "ההדרכה הבאה" : "המנה הבאה"} <ChevronLeft size={17} /></>}
          </button>
        </div>
      )}
    </div>,
    document.body,
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
  const [endOfCat, setEndOfCat] = useState(null); // the category just finished, if any
  // "menu" | "guides" — service training is not the menu (user, 29.8), so it is a
  // section of its own rather than a category chip sitting among the courses.

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

  const dishes = useMemo(() => (items || []).filter((i) => !isGuide(i)), [items]);
  // The service box holds only the guide categories whose menu_group serves no food —
  // the standalone "הדרכות שירות" group. הדרכת סושי sits inside תפריט סושי and הדרכת
  // בר inside the bar menu (user, 30.8), and a food category's "מה חשוב לדעת" card
  // stays with its dishes. Same data-driven rule as the waiter's MenuBrowser: move a
  // guide's menu_group in the DB and it changes box with no code change.
  const guides = useMemo(() => {
    const dishGroups = new Set(dishes.map((i) => i.menuGroup).filter(Boolean));
    const byCat = new Map();
    for (const i of items || []) {
      if (!i.category) continue;
      if (!byCat.has(i.category)) byCat.set(i.category, []);
      byCat.get(i.category).push(i);
    }
    const svcCats = [...byCat.entries()]
      .filter(([, v]) => v.every(isGuide) && v.every((x) => !x.menuGroup || !dishGroups.has(x.menuGroup)))
      .map(([k]) => k);
    return (items || []).filter((i) => svcCats.includes(i.category));
  }, [items, dishes]);

  // Menu groups describe the food menus only. A guide carries a menu_group for
  // bookkeeping, and letting it raise a chip would offer the owner a menu filter that
  // selects no dishes.
  const menuGroups = useMemo(
    () => [...new Set(dishes.map((i) => i.menuGroup).filter(Boolean))],
    [dishes]
  );
  // Everything that is not in the service box — dishes, each category's "מה חשוב
  // לדעת" card, and the guide categories that live inside a menu.
  const pool = useMemo(() => {
    const svc = new Set(guides.map((i) => i.id));
    return (items || []).filter((i) => !svc.has(i.id));
  }, [items, guides]);
  // The pool the prev/next walk moves through: whichever menu (or the guides) is open.
  const inGroupPoolForWalk = group === SERVICE ? guides
    : group ? pool.filter((i) => i.menuGroup === group) : pool;
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

  // ---- end of a category: read it again, or walk on to the next one ----
  // The waiter gets this screen; the manager reviewing the menu should too. The one
  // difference is the third choice — there is no practice mode on this side, so the
  // screen offers only "again" and "next category" (user, 30.8).
  if (endOfCat) {
    const order = [...new Set(inGroupPoolForWalk.map((i) => i.category).filter(Boolean))];
    const at = order.indexOf(endOfCat);
    const nextCat = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
    const n = inGroupPoolForWalk.filter((i) => i.category === endOfCat).length;
    // The last category of a box chains into the NEXT box — same door order the tiles
    // use (service first, then the menus), so "המשך" always has somewhere to go until
    // the very last category of the very last menu (user, 30.8: "צריך להוסיף כפתור
    // מעבר לקטגוריה הבאה — (שם הקטגוריה)").
    const boxes = [...(guides.length ? [SERVICE] : []), ...menuGroups];
    const boxAt = boxes.indexOf(group ?? menuGroups[0]);
    const nextBox = !nextCat && boxAt >= 0 && boxAt < boxes.length - 1 ? boxes[boxAt + 1] : null;
    const nextBoxPool = nextBox === SERVICE ? guides
      : nextBox ? pool.filter((i) => i.menuGroup === nextBox) : [];
    const nextBoxCat = nextBoxPool.map((i) => i.category).filter(Boolean)[0] || null;
    const goTo = (g, c, poolOf) => {
      setEndOfCat(null); setGroup(g); setCat(c);
      setViewing(poolOf.filter((i) => i.category === c)[0] || null);
    };
    // 🔴 Portalled, full screen — this is a stop on the dish walk, and the walk covers
    // the tab bar. Rendered inline it sat above a visible בית/תפריט/הגדרות row (user's
    // screenshot, 30.8), which broke the "you are inside the reading flow" frame.
    return createPortal(
      <div className="aurora-skin fixed inset-0 z-[70] bg-[#0c0d10] overflow-y-auto au-preview" dir="rtl">
        {/* Vertically centred (user, 31.8, with screenshot): the card and its buttons sat
            at the top with a dead half-screen below. min-h-full keeps the centring while
            still scrolling on short phones. */}
        <div className="space-y-3 max-w-md mx-auto min-h-full flex flex-col justify-center">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setEndOfCat(null)} aria-label="חזרה"
              className="w-10 h-10 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#eef0f6] flex-none">
              <ChevronRight size={19} />
            </button>
            <p className="flex-1 min-w-0 text-[11px] font-black text-[#8a919e] truncate">{endOfCat} · הושלם</p>
          </div>
          <div className="glass text-center space-y-3 py-7">
            <span className="w-16 h-16 rounded-full bg-[#15302b] border border-[#22c08c]/40 flex items-center justify-center text-3xl mx-auto">✓</span>
            <h2 className="text-[21px] font-black text-[#eef0f6] leading-tight">עברת על כל {endOfCat}</h2>
            <p className="text-[13px] text-[#8a919e] leading-relaxed px-3">
              {countLabel(endOfCat, n)}. לעבור עליהן שוב, או להמשיך הלאה?
            </p>
          </div>
          <button type="button" className="au-pill w-full justify-center py-3"
            onClick={() => goTo(group, endOfCat, inGroupPoolForWalk)}>
            לעבור שוב על {endOfCat}
          </button>
          {nextCat && (
            <button type="button" className="au-wide"
              onClick={() => goTo(group, nextCat, inGroupPoolForWalk)}>
              להמשיך ל{nextCat}
            </button>
          )}
          {!nextCat && nextBoxCat && (
            <button type="button" className="au-wide"
              onClick={() => goTo(nextBox, nextBoxCat, nextBoxPool)}>
              להמשיך ל{nextBoxCat}
            </button>
          )}
          {/* Back to the DOOR — group cleared too. Clearing only the category left the
              service box's own single-category list on screen, which read as the button
              doing nothing (user, 30.8: "זה לא שולח אותי לקטגוריות"). */}
          <button type="button" className={nextCat || nextBoxCat ? "w-full py-2.5 text-[12px] font-bold text-[#8a8aa0]" : "au-wide"}
            onClick={() => { setEndOfCat(null); setGroup(null); setCat(null); }}>
            {group === SERVICE ? "סיימת את ההדרכות" : `סיימת את ${group || "התפריט"}`} — לכל התפריטים
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  if (viewing) {
    const fresh = items.find((i) => i.id === viewing.id) || viewing;
    // Siblings = the same category, in menu order. The category is the unit an owner
    // reviews; walking across categories would silently cross from starters into wine.
    const sibs = (viewing.category ? inGroupPoolForWalk.filter((i) => i.category === viewing.category) : inGroupPoolForWalk)
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
        onNext={at >= 0 && at < sibs.length - 1
          ? () => go(at + 1)
          : () => { setEndOfCat(fresh.category); setViewing(null); }}
        lastInCat={at >= 0 && at === sibs.length - 1}
        onBack={() => setViewing(null)}
        /* ⚠️ `viewing` is NOT cleared: closing the editor must land back on the dish
           you were reading, not on the list you came from three taps ago (user, 30.8). */
        onEdit={(d) => onOpenDish(d)}
        onToggleStar={onToggleStar}
      />
    );
  }
  // ---- level 1: the menus, as boxes ----
  // ⚠️ Same shape as the waiter's menu, deliberately (user, 30.8: "תעשה את המערכת בול
  // כמו המלצרים"). Two chip rows above one long list meant the manager read every
  // category of every menu at once; now it is menu → category → dish, and service
  // training is a box of its own rather than a switch at the top.
  const menuTile = (m2) => {
    const inG = pool.filter((i) => i.menuGroup === m2);
    const nCats = new Set(inG.map((i) => i.category)).size;
    // Count and dress the tile by its FOOD: a guide sits first in the group by
    // position, and letting it pick the label turns "40 מנות" into "כרטיסים".
    const food = inG.filter((i) => !isGuide(i));
    const photo = food.find((i) => i.image_url)?.image_url || inG.find((i) => i.image_url)?.image_url;
    const vis = categoryVisual(food[0]?.category || m2);
    return (
      <button key={m2} type="button" className="glass cat" onClick={() => { setGroup(m2); setCat(null); }}>
        <span className="icon" aria-hidden>{photo ? <img src={photo} alt="" loading="lazy" /> : vis.emoji}</span>
        <span className="flex-1 min-w-0">
          <h3 className="line-clamp-1">{m2}</h3>
          <p>{nCats === 1 ? "קטגוריה אחת" : `${nCats} קטגוריות`} · {countLabel(food[0]?.category, food.length)}</p>
        </span>
        <ChevronLeft size={16} className="chev" />
      </button>
    );
  };
  const catTile = (c, list) => {
    const photo = list.find((i) => i.image_url)?.image_url;
    return (
      <button key={c} type="button" className="glass cat" onClick={() => setCat(c)}>
        <span className="icon" aria-hidden>{photo ? <img src={photo} alt="" loading="lazy" /> : categoryVisual(c).emoji}</span>
        <span className="flex-1 min-w-0"><h3 className="line-clamp-1">{c}</h3><p>{countLabel(c, list.length)}</p></span>
        <ChevronLeft size={16} className="chev" />
      </button>
    );
  };

  const inGroupPool = group === SERVICE ? guides : pool.filter((i) => i.menuGroup === group);
  const groupCats = [...new Set(inGroupPool.map((i) => i.category).filter(Boolean))];
  const title = group === SERVICE ? "הדרכות שירות" : group || "התפריט";

  return (
    <div className="space-y-3">
      <div className="au-head">
        <h1 className="flex-1 min-w-0">{cat || title}</h1>
        <button type="button" className="au-pill flex-none" onClick={() => onAdd(cat)}>
          + {group === SERVICE ? "הדרכה חדשה" : "מנה חדשה"}
        </button>
      </div>

      {(group || cat) && (
        <button type="button" className="au-back" onClick={() => (cat ? setCat(null) : setGroup(null))}>
          <ChevronRight size={15} /> {cat ? title : "כל התפריטים"}
        </button>
      )}

      {!group && !cat && (
        <>
          <p className="au-hint">בוחרים תפריט, ואז קטגוריה — לחיצה על מנה פותחת אותה לעיון</p>
          {items.length === 0 && emptyNote}
          <div className="flex flex-col gap-3">
            {/* ⚠️ Service training comes FIRST (user, 30.8), before the food menus. It is
                how the house works — the thing a manager checks before they check a
                dish — so it opens the list rather than trailing it. */}
            {guides.length > 0 && (
              <button type="button" className="glass cat" onClick={() => { setGroup(SERVICE); setCat(null); }}>
                <span className="icon" aria-hidden>🎓</span>
                <span className="flex-1 min-w-0">
                  <h3 className="line-clamp-1">הדרכות שירות</h3>
                  <p>{guides.length === 1 ? "נושא אחד" : `${guides.length} נושאים`} · הצוות קורא, לא נבחן</p>
                </span>
                <ChevronLeft size={16} className="chev" />
              </button>
            )}
            {menuGroups.map(menuTile)}
          </div>
        </>
      )}

      {group && !cat && (
        <div className="flex flex-col gap-3">
          {groupCats.map((c) => catTile(c, inGroupPool.filter((i) => i.category === c)))}
        </div>
      )}

      {cat && (
        <div className="space-y-2">
          {/* The colour key, where the colours actually appear. keyGroups already folds
              merged restaurants down to two colours (red אלרגיות · amber מוקשים). */}
          <div className="flex flex-wrap gap-1.5 px-0.5">
            {keyGroups.filter((g) => g.key !== "kashrut").map((g) => (
              <span key={g.key} className={`chip ${tone[g.key] || "amber"}`}>
                <i className="dot" />{merged && g.key === "pitfalls" ? "מוקשים ורגישות" : KEY_LABEL[g.key] || g.label}
              </span>
            ))}
          </div>
          {inGroupPool.filter((i) => i.category === cat).map((item) => (
            <Dish
              key={item.id}
              item={item}
              flagGroups={flagGroups}
              tone={tone}
              merged={merged}
              onOpen={(d) => { listScroll.current = scrollRef?.current?.scrollTop || 0; setViewing(d); }}
              onToggleStar={onToggleStar}
            />
          ))}
        </div>
      )}

      {/* The owner fixes and asks; we build. Structural work — a whole new menu, moving a
          category — goes out as a request rather than as a button they would rarely use
          correctly. It sits at the bottom because the menu itself is what this tab is for. */}
      <div className="pt-1">{operatorLine}</div>
    </div>
  );
}
