// Small shared pieces of the «אורורה» manager screens.
//
// ⚠️ Everything here renders only when `restaurants.features.design === "aurora"`.
// A restaurant without the flag — CREWDEMO, which Apple's reviewer opens, and the
// accounts the Play testers are on — never mounts any of it.

// Two initials for the avatar disc. Hebrew has no case, so the first letter of each
// word is all there is; a single-word name gives one letter rather than a padded pair.
export const initials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

// The same three bands the waiter app and the team tab use. Two screens disagreeing
// about one waiter's colour is worse than either threshold being slightly off.
export const pctColor = (p) => (p >= 75 ? "#22c08c" : p >= 45 ? "#f3c14b" : "#e0315a");

// Hebrew disagrees with "1 חברי צוות" the way English disagrees with "1 members".
export const membersLabel = (n) =>
  n === 0 ? "אין עדיין חברי צוות" : n === 1 ? "חבר צוות אחד" : `${n} חברי צוות`;

// One phrasing for "when were they last here", used by the settings roster and by the
// learning-status card. Noun phrases, because team_members stores no gender.
export const lastSeenNote = (iso) => {
  if (!iso) return "עדיין לא נכנסו";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "הכניסה האחרונה: היום";
  if (days === 1) return "הכניסה האחרונה: אתמול";
  if (days === 2) return "הכניסה האחרונה: לפני יומיים";
  return `הכניסה האחרונה: לפני ${days} ימים`;
};

export const fmtMins = (secs) => {
  if (!secs) return "0 דק׳";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${(m / 60).toFixed(1)} ש׳` : `${m} דק׳`;
};

// A number and what it counts. Deliberately not a link: three tiles that all navigate
// somewhere turn a summary into a menu.
export function Tile({ value, sub, label, tone }) {
  return (
    <div className="glass">
      <b style={tone ? { color: tone } : undefined}>
        {value}
        {sub ? <i>{sub}</i> : null}
      </b>
      <span>{label}</span>
    </div>
  );
}

// A collapsible settings row. Same contract as the unskinned SettingsSection — one open
// at a time, and the header states what is set inside so the owner can scan without
// opening anything.
export function Section({ emoji, title, summary, open, onToggle, children }) {
  return (
    <>
      <button type="button" className="au-sec" onClick={onToggle} aria-expanded={open}>
        <span className="ic" aria-hidden>{emoji}</span>
        <span className="flex-1 min-w-0">
          <span className="tt block">{title}</span>
          {summary ? <span className="sm block truncate">{summary}</span> : null}
        </span>
        <span className="chev" aria-hidden>{open ? "⌃" : "‹"}</span>
      </button>
      {open && <div className="au-secbody">{children}</div>}
    </>
  );
}

// The value pickers on the learning-path card. Ascending right to left, which is the
// direction Hebrew reads — the recommended value carries its own label rather than a
// separate legend.
export function Choice({ options, value, onChange, recommended }) {
  // Wraps rather than scrolls. There are three or four options and they nearly fill the
  // width — a horizontally clipped option reads as a rendering bug, not as "scroll me".
  return (
    <div className="au-filter wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`au-fchip ${value === o.value ? "on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.value === recommended ? " · מומלץ" : ""}
        </button>
      ))}
    </div>
  );
}
