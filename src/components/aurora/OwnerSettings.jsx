import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { DEFAULT_PATH } from "../../lib/examFacets";
import { Section, Choice, initials, pctColor, membersLabel, lastSeenNote } from "./bits";

const db = supabase.schema("menu_app");

// The manager's settings tab under the «אורורה» skin.
//
// The joining code is the first thing on the screen because it is the only action a
// manager genuinely performs here: adding a waiter. Everything under it is set to our
// recommendation already and exists so it CAN be adjusted, not so it must be.

const WAITER_URL = "https://shiftcrew-waiter.vercel.app";

function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? "on" : ""}`}
      onClick={() => onChange(!on)}
    />
  );
}


// Signing out costs the owner their password to get back in, and the button sits at the
// end of a long scroll where a stray tap lands. Same two-step + 5-second wait the waiter
// app uses — two apps asking the same question should ask it the same way.
function SignOutConfirm({ onSignOut }) {
  const [asking, setAsking] = useState(false);
  const [left, setLeft] = useState(5);

  useEffect(() => {
    if (!asking) return;
    setLeft(5);
    const t = setInterval(() => setLeft((n) => (n <= 1 ? (clearInterval(t), 0) : n - 1)), 1000);
    return () => clearInterval(t);
  }, [asking]);

  if (!asking) {
    return (
      <button type="button" className="au-wide danger" onClick={() => setAsking(true)}>
        יציאה מהחשבון
      </button>
    );
  }
  return (
    <div className="glass space-y-2.5">
      <p className="text-[13px] font-black text-[#eef0f6]">לצאת מהחשבון?</p>
      <p className="text-[12px] text-[#8a919e] leading-relaxed">
        כדי להיכנס שוב תצטרכו את קוד הבעלים ואת הסיסמה.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAsking(false)}
          className="flex-1 py-2.5 rounded-xl bg-[#22252b] text-[#c4c4d4] text-[13px] font-black">
          להישאר
        </button>
        <button type="button" onClick={onSignOut} disabled={left > 0}
          className="flex-1 py-2.5 rounded-xl bg-[#e0315a] text-white text-[13px] font-black disabled:opacity-40">
          {left > 0 ? `${left}` : "יציאה"}
        </button>
      </div>
    </div>
  );
}

export default function OwnerSettings({
  restaurant,
  teamMembers,
  memberPct,
  itemCount,
  openSetting,
  setOpenSetting,
  onSelectMember,
  onSignOut,
  sections,           // the heavier panels, rendered by the dashboard: { key, emoji, title, summary, node }
}) {
  const [path, setPath] = useState(null);
  const [row, setRow] = useState(null);        // the whole exam_config row, so a partial
                                               // save can never blank facets / category_order
  const [saveState, setSaveState] = useState(""); // "" | "saving" | "saved" | "error"
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await db.from("exam_config").select("*")
        .eq("restaurant_id", restaurant.id).maybeSingle();
      if (!alive) return;
      setRow(data || null);
      setPath({
        pass_threshold: data?.pass_threshold ?? DEFAULT_PATH.pass_threshold,
        daily_goal_minutes: data?.daily_goal_minutes ?? DEFAULT_PATH.daily_goal_minutes,
        general_exam_questions: data?.general_exam_questions ?? DEFAULT_PATH.general_exam_questions,
        baseline_enabled: data?.baseline_enabled ?? DEFAULT_PATH.baseline_enabled,
        baseline_minutes: data?.baseline_minutes ?? DEFAULT_PATH.baseline_minutes,
        gate_games: data?.gate_games ?? DEFAULT_PATH.gate_games,
      });
    })();
    return () => { alive = false; };
  }, [restaurant.id]);

  // Saved on the tap. There is no save button because there is nothing to compose here —
  // every control is one value, and a button would only add a step where the owner can
  // walk away thinking they changed something.
  const patch = async (change) => {
    const prev = path;
    const next = { ...path, ...change };
    setPath(next);
    setSaveState("saving");
    // ⚠️ Re-read the row, do not reuse the one loaded at mount. `facets` and
    // `category_order` belong to the advanced panel — which sits in a section on THIS
    // screen — so a snapshot from mount would quietly put the pre-edit arrays back the
    // next time the owner taps a chip up here.
    const { data: fresh } = await db.from("exam_config").select("*")
      .eq("restaurant_id", restaurant.id).maybeSingle();
    const merged = { ...(fresh || row || {}), restaurant_id: restaurant.id, ...next,
                     updated_at: new Date().toISOString() };
    const { error } = await db.from("exam_config").upsert(merged, { onConflict: "restaurant_id" });
    if (error) {
      // Leaving the new value selected would tell the owner it saved. It did not.
      setPath(prev);
      setSaveState("error");
      return;
    }
    setRow(merged);
    setSaveState("saved");
  };

  useEffect(() => {
    if (saveState !== "saved" && saveState !== "error") return;
    const t = setTimeout(() => setSaveState(""), saveState === "error" ? 4000 : 2200);
    return () => clearTimeout(t);
  }, [saveState]);

  const code = restaurant?.team_code || "";
  const shareText =
    `הצטרפו לצוות של ${restaurant?.name || "המסעדה"} ב-CrewMenu 👋\n\n` +
    `1. פותחים: ${WAITER_URL}\n` +
    `2. מזינים את הקוד: ${code}\n` +
    `3. כותבים שם פרטי ומשפחה — וזהו.\n\n` +
    `כאן לומדים את התפריט ואת השירות של המסעדה.`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — the code is on screen anyway */ }
  };

  const isRecommended =
    path &&
    path.pass_threshold === DEFAULT_PATH.pass_threshold &&
    path.general_exam_questions === DEFAULT_PATH.general_exam_questions &&
    path.baseline_enabled === DEFAULT_PATH.baseline_enabled &&
    path.baseline_minutes === DEFAULT_PATH.baseline_minutes &&
    path.gate_games === DEFAULT_PATH.gate_games;

  return (
    <div className="space-y-3.5">
      <div className="au-head">
        <h1 className="flex-1 min-w-0">הגדרות</h1>
      </div>

      {/* ── the joining code ─────────────────────────────────────────────── */}
      <div className="glass au-join">
        <div className="lbl">קוד הצטרפות לצוות</div>
        <div className="code" dir="ltr">{code}</div>
        <p className="exp">עובד חדש מוריד את האפליקציה, מזין את הקוד ואת שמו — וזהו</p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <a
            className="au-pill"
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            שיתוף בוואטסאפ
          </a>
          <button type="button" className="au-pill ghost" onClick={copy}>
            {copied ? "הקוד הועתק ✓" : "העתקת הקוד"}
          </button>
        </div>
        {/* 🚫 The trainee code is hidden for now (user, 29.8: "cancel the code for waiters
            that are starting out"). The column and the server path are untouched — a code
            that was already shared still works — this is only the manager UI. */}
      </div>

      {/* ── the team ─────────────────────────────────────────────────────── */}
      <div className="glass">
        <div className="au-cardhead">
          <b>הצוות</b>
          <span>{membersLabel(teamMembers.length)}</span>
        </div>
        {teamMembers.length === 0 ? (
          <p className="text-[12.5px] text-[#8a919e] leading-relaxed">
            עדיין אין אף אחד. שתפו את הקוד שלמעלה — מלצר שנכנס איתו מופיע כאן מיד.
          </p>
        ) : (
          teamMembers.map((m) => {
            const pct = memberPct(m.id);
            return (
              <button key={m.id} type="button" className="au-member" onClick={() => onSelectMember?.({ id: m.id, name: m.name })}>
                <span className="av" aria-hidden>{initials(m.name)}</span>
                <span className="flex-1 min-w-0">
                  <span className="nm block truncate">{m.name}</span>
                  <span className="st block">{lastSeenNote(m.last_seen_at)}</span>
                </span>
                <span className="pc" style={{ color: pctColor(pct) }}>{Math.round(pct)}%</span>
              </button>
            );
          })
        )}
      </div>

      {/* ── the learning path ─────────────────────────────────────────────
          ⚠️ Collapsed by default (user, 29.8: "תשים את מסלול הלמידה בתור אופציה
          סגורה שלא תמיד פתוחה"). It is configured once and then almost never touched,
          so open it was four screens of controls standing between the owner and the
          things they actually come here for. */}
      <div className="glass">
        <Section
          emoji="🎓"
          title="מסלול הלמידה"
          summary={isRecommended ? "מוגדר לפי ההמלצה שלנו" : "כווננתם את המסלול"}
          open={openSetting === "path"}
          onToggle={() => setOpenSetting(openSetting === "path" ? null : "path")}
        >
        <div className="au-cardhead">
          <b>מסלול הלמידה</b>
          <span>
            {saveState === "saving" ? "שומר…" : saveState === "saved" ? "נשמר ✓"
              : saveState === "error" ? "השמירה נכשלה" : ""}
          </span>
        </div>
        <p className="text-[12px] text-[#8a919e] -mt-2 mb-1 leading-relaxed">
          {isRecommended
            ? "הכל מוגדר לפי ההמלצה שלנו · אפשר לכוונן"
            : "כוונתם את המסלול · אפשר לחזור להמלצה בכל רגע"}
        </p>

        {path && (
          <>
            <p className="au-opt">סף שליטה לפתיחת בוחן קטגוריה</p>
            <Choice
              /* ⚠️ Must match LearningPathSettings — both write exam_config.pass_threshold,
                 and both are reachable from this screen. Different option sets meant one
                 control could show a value the other could not represent. */
              options={[30, 50, 70].map((v) => ({ value: v, label: `${v}%` }))}
              value={path.pass_threshold}
              recommended={DEFAULT_PATH.pass_threshold}
              onChange={(v) => patch({ pass_threshold: v })}
            />

            {/* 🚧 "יעד לימוד יומי" is deliberately NOT offered here. The waiter only ever
                showed that goal as a ring on its home tab, and `features.tasks:false`
                removes that tab entirely (MainApp redirects away from "home"), so
                `exam_config.daily_goal_minutes` currently changes nothing for these
                restaurants. A control that saves a value nobody reads is worse than no
                control. The column is untouched, so restoring this is three lines once
                the goal has somewhere to appear. */}

            <p className="au-opt">אורך המבחן המסכם</p>
            <Choice
              options={[20, 30, 40, 60].map((v) => ({ value: v, label: `${v} שאלות` }))}
              value={path.general_exam_questions}
              recommended={DEFAULT_PATH.general_exam_questions}
              onChange={(v) => patch({ general_exam_questions: v })}
            />

            <div className="srow mt-2">
              <span>
                בוחן היכרות לעובד חדש
                <span className="block text-[11.5px] text-[#6b7280] mt-0.5">
                  נותן לכם "ידע התחלתי X%" לכל מלצר חדש
                </span>
              </span>
              <Toggle
                on={!!path.baseline_enabled}
                label="בוחן היכרות לעובד חדש"
                onChange={(v) => patch({ baseline_enabled: v })}
              />
            </div>

            {/* 🚫 The length picker is gone: the intake exam is a fixed 8 questions
                (user, 29.8), so a minutes control would set a number nothing reads —
                exactly the kind of dead switch we keep removing. `baseline_minutes`
                still exists in exam_config and is left untouched, in case the length
                ever becomes the owner's decision again. */}
            {path.baseline_enabled && (
              <p className="text-[12px] text-[#8a919e] leading-relaxed -mt-1 mb-2">
                בוחן ההיכרות הוא 8 שאלות — מספיק כדי למקם עובד חדש, בלי להתיש אותו ביום הראשון.
              </p>
            )}
            <div className="srow">
              <span>
                תרגול מוגבל למה שכבר נפתח
                <span className="block text-[11.5px] text-[#6b7280] mt-0.5">
                  כבוי = הצוות מתרגל את כל התפריט מהיום הראשון
                </span>
              </span>
              <Toggle
                on={!!path.gate_games}
                label="תרגול מוגבל למה שכבר נפתח"
                onChange={(v) => patch({ gate_games: v })}
              />
            </div>

            {!isRecommended && (
              <button
                type="button"
                className="au-wide mt-3"
                onClick={() => patch({
                  pass_threshold: DEFAULT_PATH.pass_threshold,
                  general_exam_questions: DEFAULT_PATH.general_exam_questions,
                  baseline_enabled: DEFAULT_PATH.baseline_enabled,
                  baseline_minutes: DEFAULT_PATH.baseline_minutes,
                  gate_games: DEFAULT_PATH.gate_games,
                })}
              >
                חזרה להמלצה שלנו
              </button>
            )}
          </>
        )}
        </Section>
      </div>

      {/* ── the restaurant ───────────────────────────────────────────────── */}
      <div className="glass">
        <Section
          emoji="🏛️"
          title="פרטי המסעדה"
          summary={restaurant?.name}
          open={openSetting === "restaurant"}
          onToggle={() => setOpenSetting(openSetting === "restaurant" ? null : "restaurant")}
        >
          <div className="srow"><span>שם המסעדה</span><span className="v truncate">{restaurant?.name}</span></div>
          {restaurant?.cuisine_types?.length > 0 && (
            <div className="srow"><span>סוג מטבח</span><span className="v truncate">{restaurant.cuisine_types.join(" · ")}</span></div>
          )}
          <div className="srow"><span>מנות בתפריט</span><span className="v">{itemCount}</span></div>
          <div className="srow"><span>קוד בעלים (לכניסה)</span><span className="v tracking-wider" dir="ltr">{restaurant?.owner_code}</span></div>
        </Section>
      </div>

      {/* ── everything heavier, one open at a time ───────────────────────── */}
      <div className="glass">
        {sections.map((s) => (
          <Section
            key={s.key}
            emoji={s.emoji}
            title={s.title}
            summary={s.summary}
            open={openSetting === s.key}
            onToggle={() => setOpenSetting(openSetting === s.key ? null : s.key)}
          >
            {s.node}
          </Section>
        ))}
      </div>

      {/* Rare, and the only destructive thing on the screen — so it sits at the very
          bottom rather than beside the tabs the owner taps all day.
          ⚠️ Behind a 5-second confirm (user, 29.8), the same shape the waiter app uses:
          signing out costs the owner their password to get back in, and it used to be
          one stray tap at the end of a long scroll. */}
      <SignOutConfirm onSignOut={onSignOut} />
      <div className="h-2" />
    </div>
  );
}
