import { TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";

// Per-waiter improvement over time, read the way a stock chart is read: where they
// started, where they are, and how far the line moved.
//
// The baseline is the dashed floor — a waiter's score means something different depending
// on whether they walked in at 15% or 60%, and averaging that away is how you end up
// praising the wrong person. Hand-drawn SVG rather than a chart library: one series, a
// few dozen points, and the bundle stays small.

const fmtDuration = (seconds) => {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} שע' ${m} דק'`;
  if (m > 0) return `${m} דק'`;
  return "פחות מדקה";
};

export default function ProgressChart({ baseline, current, seconds, snapshots }) {
  const points = (snapshots || [])
    .map((s) => ({ t: new Date(s.taken_at).getTime(), pct: Number(s.pct) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.pct))
    .sort((a, b) => a.t - b.t);

  // The live figure is always the last point, so the chart can't disagree with the big
  // number on the card above it.
  const series = points.length ? [...points, { t: Date.now(), pct: current }] : [];
  const hasBaseline = Number.isFinite(Number(baseline));
  const start = hasBaseline ? Number(baseline) : series[0]?.pct;
  const delta = Number.isFinite(start) ? Math.round(current - start) : null;

  const W = 300, H = 64, PAD = 4;
  const path = (() => {
    if (series.length < 2) return null;
    const t0 = series[0].t, t1 = series[series.length - 1].t;
    const span = Math.max(1, t1 - t0);
    const x = (t) => PAD + ((t - t0) / span) * (W - PAD * 2);
    const y = (p) => H - PAD - (Math.max(0, Math.min(100, p)) / 100) * (H - PAD * 2);
    const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
    const area = `${line} L${x(t1).toFixed(1)},${H - PAD} L${x(t0).toFixed(1)},${H - PAD} Z`;
    return { line, area, endX: x(t1), endY: y(series[series.length - 1].pct), baselineY: hasBaseline ? y(Number(baseline)) : null };
  })();

  const up = delta != null && delta > 0;
  const flat = delta != null && delta === 0;
  const trendColor = delta == null ? "#8a8aa0" : up ? "#22c08c" : flat ? "#8a8aa0" : "#e0315a";
  const TrendIcon = delta == null ? Minus : up ? TrendingUp : flat ? Minus : TrendingDown;

  return (
    <div className="bg-[#101216] border border-[#22252b] rounded-lg p-2.5 mb-2">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold text-[#8a8aa0]">מסלול השיפור</p>
        {delta != null && (
          <span className="text-[11px] font-black flex items-center gap-1" style={{ color: trendColor }}>
            <TrendIcon size={12} />
            {delta > 0 ? `+${delta}` : delta} נק'
          </span>
        )}
      </div>

      {path ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 64 }} preserveAspectRatio="none" role="img"
          aria-label={`התקדמות מ-${start}% ל-${current}%`}>
          <defs>
            <linearGradient id={`grad-${baseline}-${current}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trendColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {path.baselineY != null && (
            <line x1={PAD} y1={path.baselineY} x2={W - PAD} y2={path.baselineY}
              stroke="#8a8aa0" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
          )}
          <path d={path.area} fill={`url(#grad-${baseline}-${current})`} />
          <path d={path.line} fill="none" stroke={trendColor} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <circle cx={path.endX} cy={path.endY} r="3" fill={trendColor} />
        </svg>
      ) : (
        <p className="text-[10px] text-[#6a6a7e] py-3 text-center">
          {hasBaseline ? "עוד אין מספיק נקודות מדידה לגרף — יופיע אחרי כמה סבבי לימוד" : "אין עדיין מבחן היכרות"}
        </p>
      )}

      <div className="flex items-center justify-between mt-1.5 text-[10px]">
        <span className="text-[#8a8aa0]">
          {hasBaseline ? <>התחיל/ה ב-<span className="font-bold text-[#c4c4d4]">{Math.round(start)}%</span></> : "ללא נקודת פתיחה"}
        </span>
        <span className="text-[#8a8aa0] flex items-center gap-1">
          <Clock size={10} /> {fmtDuration(seconds)}
        </span>
      </div>
    </div>
  );
}
