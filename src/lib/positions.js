import { scOwner, DAY_ORDER } from "./shiftcrew";

// ─────────────────────────────────────────────────────────────────────────────
// positions — the staffing model that replaced the rigid "morning/evening shift"
// assumption. The owner defines EVERY position themselves (waiters, bartenders,
// shift managers, cooks, host, …) and for each picks a STAFFING STYLE:
//
//   • "blocks"  — fixed time windows + a headcount per day (the classic model).
//                 Fits shift managers, cooks, hosts: "2 in the morning, 3 evening".
//   • "stagger" — people clock in at different times across the day. The owner
//                 lists arrival/departure EVENTS (10:00 +2, 13:00 +1, 22:00 −2)
//                 and we expand them into real staggered seats. Fits waiters/bar,
//                 who trickle in as the place fills up — never a single block.
//
// Both styles expand to the SAME unit the schedule builder consumes: a "seat" =
// one person to assign, carrying a start/end time. The weekly schedule, coverage
// counts, hours and labour cost are all derived from these seats.
// Persisted as one row per position in shiftcrew_owner.positions (JSONB config).
// ─────────────────────────────────────────────────────────────────────────────

export const MODEL_BLOCKS = "blocks";
export const MODEL_STAGGER = "stagger";

// A spread of distinct avatar/accent colours for newly added positions.
export const POSITION_COLORS = [
  "#2f9e8f", "#7c5cff", "#db2777", "#ea7317", "#2563eb", "#0d9488", "#e11d48", "#d97706",
];

let _seq = 0;
const uid = (p = "id") => `${p}${Date.now().toString(36)}${(_seq++).toString(36)}`;

// Weekend (Thu/Fri/Sat in the Israeli week) tends to need more hands.
const defaultBlockCounts = () => ({ sun: 2, mon: 2, tue: 2, wed: 2, thu: 3, fri: 3, sat: 3, hol: 2 });

// Build a fresh position pre-filled with a sensible config for its style, so the
// owner edits rather than starts from a blank slate.
export function newPosition(name, model, colorIdx = 0) {
  const color = POSITION_COLORS[colorIdx % POSITION_COLORS.length];
  if (model === MODEL_STAGGER) {
    return {
      id: uid("pos"), name: name || "מלצרים", model: MODEL_STAGGER, color,
      config: {
        open: "10:00", close: "23:00",
        arrivals: [
          { id: uid("a"), time: "10:00", delta: 2 },
          { id: uid("a"), time: "13:00", delta: 1 },
          { id: uid("a"), time: "18:00", delta: 2 },
          { id: uid("a"), time: "22:00", delta: -2 },
        ],
      },
    };
  }
  return {
    id: uid("pos"), name: name || "תפקיד", model: MODEL_BLOCKS, color,
    config: {
      blocks: [
        { id: uid("b"), label: "בוקר", from: "08:00", to: "16:00", counts: defaultBlockCounts() },
        { id: uid("b"), label: "ערב", from: "16:00", to: "23:00", counts: defaultBlockCounts() },
      ],
    },
  };
}

// Hours between two "HH:MM" times, wrapping past midnight (e.g. 22:00→02:00 = 4).
export function spanHours(from, to) {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  let mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

// Expand staggered arrival/departure events into concrete seats. Each positive
// delta opens that many seats starting now; each negative delta closes the
// earliest-opened ones (FIFO — first in, first out). Anything still open at the
// end runs until close. Returns [{ from, to }] sorted by start time.
export function expandStagger(config) {
  const arrivals = [...(config?.arrivals || [])].sort((a, b) => a.time.localeCompare(b.time));
  const close = config?.close || "23:00";
  const open = [];
  const done = [];
  for (const e of arrivals) {
    const d = Number(e.delta) || 0;
    if (d > 0) {
      for (let i = 0; i < d; i++) open.push({ from: e.time, to: null });
    } else if (d < 0) {
      for (let i = 0; i < -d; i++) {
        const seat = open.shift();
        if (seat) { seat.to = e.time; done.push(seat); }
      }
    }
  }
  open.forEach((seat) => { seat.to = close; done.push(seat); });
  return done.sort((a, b) => a.from.localeCompare(b.from));
}

// The unified contract the schedule builder consumes: every position+day yields a
// flat list of seats (one assignable person each). Seat keys are stable across
// renders so in-progress assignments survive re-renders.
//   seat = { key, label, from, to, hours }
export function seatsForDay(position, dayIdx) {
  if (!position) return [];
  const dayKey = DAY_ORDER[dayIdx];
  const seats = [];
  if (position.model === MODEL_STAGGER) {
    expandStagger(position.config).forEach((s, i) => {
      seats.push({
        key: `${position.id}|${dayIdx}|s${i}`,
        label: `כניסה ${s.from}`, from: s.from, to: s.to, hours: spanHours(s.from, s.to),
      });
    });
  } else {
    (position.config?.blocks || []).forEach((b, bi) => {
      const n = Math.max(0, b.counts?.[dayKey] ?? 1);
      for (let i = 0; i < n; i++) {
        seats.push({
          key: `${position.id}|${dayIdx}|b${bi}|${i}`,
          label: b.label, from: b.from, to: b.to, hours: spanHours(b.from, b.to),
        });
      }
    });
  }
  return seats;
}

// Total seats a position needs on a given day (its coverage target).
export const seatCountForDay = (position, dayIdx) => seatsForDay(position, dayIdx).length;

// One-line human summary of a position's pattern, for cards.
export function describePosition(position) {
  if (position.model === MODEL_STAGGER) {
    const c = position.config || {};
    const peak = (() => {
      let cur = 0, max = 0;
      [...(c.arrivals || [])].sort((a, b) => a.time.localeCompare(b.time)).forEach((e) => {
        cur += Number(e.delta) || 0; if (cur > max) max = cur;
      });
      return max;
    })();
    return `כניסה מדורגת · ${c.open}–${c.close} · שיא ${peak}`;
  }
  const blocks = position.config?.blocks || [];
  return `${blocks.length} משמרות · ${blocks.map((b) => b.label).join(" · ")}`;
}

// ── persistence (shiftcrew_owner.positions) ──────────────────────────────────
const rowToPosition = (r) => ({
  id: r.id, name: r.name, model: r.model, color: r.color || POSITION_COLORS[0],
  config: r.config || {},
});

export async function loadPositions(restId) {
  if (!restId) return [];
  const { data, error } = await scOwner
    .from("positions").select("*").eq("restaurant_id", restId).order("sort_order");
  if (error) throw error;
  return (data || []).map(rowToPosition);
}

// Simple replace-all: clear the restaurant's positions, then insert the new set
// in order. Keeps the editor logic trivial (no per-row diffing).
export async function savePositions(restId, positions) {
  if (!restId) throw new Error("missing restaurant id");
  const { error: delErr } = await scOwner.from("positions").delete().eq("restaurant_id", restId);
  if (delErr) throw delErr;
  if (!positions.length) return;
  const rows = positions.map((p, i) => ({
    restaurant_id: restId, name: p.name, model: p.model, color: p.color, config: p.config, sort_order: i,
  }));
  const { error } = await scOwner.from("positions").insert(rows);
  if (error) throw error;
}

export { uid as newId };
