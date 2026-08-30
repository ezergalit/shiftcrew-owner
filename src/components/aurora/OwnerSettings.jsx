import { useEffect, useState } from "react";
import { Section, initials, pctColor, membersLabel, lastSeenNote } from "./bits";


// The manager's settings tab under the «אורורה» skin.
//
// The joining code is the first thing on the screen because it is the only action a
// manager genuinely performs here: adding a waiter. Everything under it is set to our
// recommendation already and exists so it CAN be adjusted, not so it must be.

const WAITER_URL = "https://shiftcrew-waiter.vercel.app";



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
  const [copied, setCopied] = useState(false);

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

      {/* ── one accordion, one open at a time ────────────────────────────────
          פרטי המסעדה used to sit in a glass card of its own above this group — same
          Section component, same behaviour, but the separate container read as a
          different kind of thing (user, 30.8: "צריך להיות חלק משאר הטאבים"). */}
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
