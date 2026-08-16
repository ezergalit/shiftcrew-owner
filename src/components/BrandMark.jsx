// CrewMenu brand mark — the serving cloche from crewmenu-brand/mark.svg.
// The spark is NOT a colored shape: it's a hole cut out of the dome
// (fill-rule="evenodd"), so it shows whatever surface sits behind it.
// Keep it that way — a colored spark loses contrast at small sizes.
export default function BrandMark({ size = 32, color = "#EEF0F6" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="CrewMenu">
      <g fill={color}>
        <circle cx="48" cy="36" r="5" />
        <path fillRule="evenodd" d="M14 68 A34 29 0 0 1 82 68 Z M48 43 Q49.65 52.35 59 54 Q49.65 55.65 48 65 Q46.35 55.65 37 54 Q46.35 52.35 48 43 Z" />
        <rect x="4" y="68" width="88" height="7" rx="3.5" />
      </g>
    </svg>
  );
}
