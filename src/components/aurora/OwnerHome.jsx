import { useMemo, useState } from "react";
import LearningStatus from "../LearningStatus";
import WaiterPreview from "../WaiterPreview";
import { greetingFor } from "../Greeting";
import { Tile, isKnowledge } from "./bits";

// The manager's home screen under the «אורורה» skin.
//
// There is nothing to tick off here. `features.tasks === false` means this product is the
// menu and the service, so the home screen answers the only two questions the job actually
// has: is the menu ready to be taught, and is the team learning it. Both are derived —
// the owner is never asked to fill anything in (partner ledger #8, "automation before work").

// A row of the two derived cards. `tone` carries the meaning; the label is the lead-in and
// the sentence follows it inline, so the two read as one line.
function HealthRow({ tone, label, text, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`brow2 ${tone} ${onClick ? "" : "flat"}`}
      onClick={onClick}
    >
      <span className="blabel2">{label}</span>
      <span className="bval2">{text}</span>
    </Tag>
  );
}

// Two names read as a sentence; more than two do not. Past that, the count is the message
// and the bulk-fix screen is the answer.
const dishCount = (n) => (n === 1 ? "מנה אחת" : `${n} מנות`);

const nameList = (arr) =>
  arr.length <= 2 ? arr.map((d) => d.name).join(" · ") : dishCount(arr.length);

export default function OwnerHome({
  restaurant,
  items,
  needsAllergens,
  progressByMember,
  teamMembers,
  onOpenDish,
  onToggleStar,
  onBroadcast,
  onGoSettings,
  onGoHealth,
  onSelectMember,
  onRows,
  onMessage,
  messagedToday,
}) {
  // LearningStatus owns the query; home borrows the result rather than running it again.
  // Two screens counting the same team from two queries is how they end up disagreeing.
  const [rows, setRows] = useState(null);

  const dishes = useMemo(() => items.filter((i) => !isKnowledge(i)), [items]);

  const health = useMemo(() => {
    const noDesc = dishes.filter((i) => !i.description);
    const noAllergens = dishes.filter(
      (i) => i.description && needsAllergens(i) && !(i.allergens?.length > 0)
    );
    const ready = dishes.filter(
      (i) => i.description && (!needsAllergens(i) || i.allergens?.length > 0)
    );
    return { noDesc, noAllergens, ready };
  }, [dishes, needsAllergens]);

  // Which dishes the team gets wrong, straight out of menu_progress. A dish nobody has
  // practised yet is not "hard" — it is unseen, and saying otherwise would send the owner
  // to star dishes at random.
  const struggles = useMemo(() => {
    const byDish = new Map();
    for (const list of Object.values(progressByMember || {})) {
      for (const p of list || []) {
        const e = byDish.get(p.source_item_id) || { tried: 0, weak: 0 };
        e.tried++;
        // ⚠️ "Struggling" is 2 and below, not "anything under mastered". A 3 is a waiter
        // who mostly knows the dish and is still climbing; calling that a mistake would
        // fill this card with everything the team is currently in the middle of learning.
        if ((p.mastery || 0) <= 2) e.weak++;
        byDish.set(p.source_item_id, e);
      }
    }
    const named = [];
    for (const [id, e] of byDish) {
      if (!e.weak) continue;
      // `dishes`, not `items`: the helper text says "the dish", and a service-training
      // card is not one. The health card above already draws that line.
      const dish = dishes.find((i) => i.id === id);
      if (dish) named.push({ ...e, dish });
    }
    // Share first, then count: 2-of-2 is a dish nobody has got right, and it outranks
    // 3-of-12 even though the raw number is smaller.
    named.sort((a, b) =>
      (b.weak / b.tried) - (a.weak / a.tried) ||
      b.weak - a.weak ||
      a.dish.name.localeCompare(b.dish.name, "he"));
    return { any: byDish.size > 0, top: named.slice(0, 3) };
  }, [progressByMember, dishes]);

  const studied = rows ? rows.filter((r) => r.studiedToday).length : null;
  const avgPct = rows?.length ? rows.reduce((a, r) => a + r.pct, 0) / rows.length : null;
  const today = new Date().toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
  });
  const who = restaurant?.owner_name || restaurant?.logged_in_as_name || "";

  return (
    <div className="space-y-3.5">
      <div className="au-head">
        <div className="flex-1 min-w-0">
          <h1>{greetingFor()}{who ? `, ${who}` : ""}</h1>
          <p className="sub truncate">
            {restaurant?.name}
            {restaurant?.name ? " · " : ""}
            {today}
          </p>
        </div>
        <WaiterPreview teamCode={restaurant?.team_code} variant="aurora" />
      </div>

      {/* The three numbers that describe the day. Not links: three tiles that all navigate
          turn a summary into a menu. */}
      <div className="au-tiles">
        <div className="glass">
          <b style={avgPct == null ? undefined : { color: "var(--em)" }}>
            {avgPct == null ? "—" : `${Math.round(avgPct)}%`}
          </b>
          <span>שליטה בתפריט</span>
        </div>
        <Tile value={dishes.length} label="מנות בתפריט" />
        <Tile
          value={studied == null ? "—" : studied}
          sub={studied == null ? "" : `/${rows.length}`}
          label="למדו היום"
        />
      </div>

      {/* What is missing before a dish can be taught at all. Every row is a real query
          against the menu, and tapping it opens that dish — the owner fixes, never fills
          in a form we could have filled in ourselves. */}
      <div className="glass">
        <div className="au-cardhead">
          <b>בריאות התפריט</b>
          <span>מה חסר כדי שאפשר יהיה ללמד</span>
        </div>
        <div className="bgrid">
          {health.noDesc.length > 0 && (
            <HealthRow
              tone="amber"
              label="חסר תיאור"
              text={`${nameList(health.noDesc)} — בלי תיאור אי אפשר לבנות שאלות`}
              /* One dish opens that dish. Several open the bulk-fix screen, which is
                 exactly what it is for — tapping through twenty dishes one by one is
                 the work we are supposed to be removing. */
              onClick={health.noDesc.length === 1
                ? () => onOpenDish(health.noDesc[0])
                : () => onGoHealth("no-desc")}
            />
          )}
          {health.noAllergens.length > 0 && (
            <HealthRow
              tone="red"
              label="חסרות אלרגיות"
              text={`${nameList(health.noAllergens)} — שדה בטיחות, חובה לסמן`}
              onClick={health.noAllergens.length === 1
                ? () => onOpenDish(health.noAllergens[0])
                : () => onGoHealth("no-allergens")}
            />
          )}
          {health.ready.length === 0 && dishes.length === 0 ? (
            <HealthRow
              tone="amber"
              label="אין עדיין תפריט"
              text="ברגע שנעלה לכם את התפריט הוא יופיע כאן, ואפשר יהיה להתחיל ללמד"
            />
          ) : (
          <HealthRow
            tone="em"
            label="מוכן ללימוד"
            text={
              health.ready.length === dishes.length
                ? `כל התפריט מלא — הצוות יכול להיבחן על ${dishCount(dishes.length)}`
                : `${dishCount(health.ready.length)} מלאות — הצוות יכול להיבחן עליהן`
            }
          />
          )}
        </div>
      </div>

      {/* Derived from practice, not from an opinion. Starring a dish here is the one
          lever the owner has over what the team drills first. */}
      {struggles.any && (
        <div className="glass">
          <div className="au-cardhead">
            <b>מה הצוות מתקשה בו</b>
            <span>נגזר מהתרגול</span>
          </div>
          {struggles.top.length > 0 && (
            <p className="text-[12px] text-[#8a919e] -mt-2 mb-2 leading-relaxed">
              הקשה מדגישה ⭐ את המנה — היא תקפוץ ראשונה בתרגול של הצוות
            </p>
          )}
          <div className="bgrid">
            {struggles.top.length === 0 ? (
              <HealthRow
                tone="em"
                label="הכל בשליטה"
                text="אף מנה לא בולטת לרעה במה שהצוות תרגל עד עכשיו"
              />
            ) : (
              struggles.top.map((s) => (
                <HealthRow
                  key={s.dish.id}
                  tone={s.weak >= 2 ? "red" : "amber"}
                  /* A fraction needs at least two people to mean anything. With one
                     waiter "1 מתוך 1 טועים" is technically true and rhetorically absurd —
                     it is one person who has not learned the dish yet. */
                  label={s.tried >= 2 ? `${s.weak} מתוך ${s.tried} ${s.weak === 1 ? "טועה" : "טועים"}` : "עדיין לא יודעים"}
                  text={s.dish.name + (s.dish.starred ? " · מודגשת ⭐" : "")}
                  onClick={() => onToggleStar(s.dish)}
                />
              ))
            )}
          </div>
        </div>
      )}

      <div className="glass">
        <LearningStatus
          variant="aurora"
          restaurant={restaurant}
          onSelectMember={onSelectMember}
          onRows={(r) => { setRows(r); onRows?.(r); }}
          onMessage={onMessage}
          messagedToday={messagedToday}
          onInvite={onGoSettings}
        />
        {/* The per-waiter nudge sits on each row; this is the "everyone" megaphone. It is
            the only thing from the old 📊 team screen worth keeping here — the rest of
            that screen was the brief read-board and the shift tasks, neither of which
            exists under this skin. */}
        {teamMembers.length > 0 && onBroadcast && (
          <button type="button" className="au-wide mt-3" onClick={onBroadcast}>
            ✉️ הודעה לכל הצוות
          </button>
        )}
      </div>

      {teamMembers.length === 0 && (
        <button type="button" onClick={onGoSettings} className="glass w-full text-right">
          <p className="text-[14px] font-black text-[#eef0f6]">לצרף את הצוות</p>
          <p className="text-[12px] text-[#8a919e] mt-1 leading-relaxed">
            שתפו את קוד ההצטרפות — כל מלצר נכנס עם הקוד והשם שלו, וזהו
          </p>
        </button>
      )}

    </div>
  );
}
