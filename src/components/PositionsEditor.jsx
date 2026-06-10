import { useState } from "react";
import {
  Plus, Trash2, Clock, ChevronDown, ChevronUp, Sun, TrendingUp,
  Sparkles, Users, Lightbulb, Check, ArrowUpFromLine,
} from "lucide-react";
import {
  MODEL_BLOCKS, MODEL_STAGGER, newPosition, newId,
} from "../lib/positions";

// ─────────────────────────────────────────────────────────────────────────────
// PositionsEditor — the ONE place positions are defined, shared by the onboarding
// wizard and the in-app "manage positions" sheet. It teaches the owner the two
// staffing styles, then lets them add a position, pick a style, and tune it:
//   • blocks  → named time windows + a headcount per weekday
//   • stagger → arrival/departure events that expand into staggered seats
// It's a controlled component: it owns no data, just renders `positions` and calls
// `setPositions` with the next array.
// ─────────────────────────────────────────────────────────────────────────────

const DAYS = [
  { key: "sun", letter: "א׳" }, { key: "mon", letter: "ב׳" }, { key: "tue", letter: "ג׳" },
  { key: "wed", letter: "ד׳" }, { key: "thu", letter: "ה׳" },
  { key: "fri", letter: "ו׳", weekend: true }, { key: "sat", letter: "ש׳", weekend: true },
];

const MODELS = {
  [MODEL_STAGGER]: {
    key: MODEL_STAGGER, icon: TrendingUp, label: "כניסה מדורגת לפי שעה",
    sub: "העובדים נכנסים בזה אחר זה ככל שמתמלא — לא במשמרת אחת.",
    fit: "מלצרים · ברמנים",
  },
  [MODEL_BLOCKS]: {
    key: MODEL_BLOCKS, icon: Sun, label: "משמרות קבועות",
    sub: "חלונות זמן קבועים (בוקר/ערב) עם כמות אנשים לכל יום.",
    fit: "מנהלי משמרת · טבחים · מארחים",
  },
};

// Quick-add templates so the first position isn't a blank slate.
const TEMPLATES = [
  { name: "מלצרים", model: MODEL_STAGGER },
  { name: "ברמנים", model: MODEL_STAGGER },
  { name: "מנהל/ת משמרת", model: MODEL_BLOCKS },
  { name: "מטבח", model: MODEL_BLOCKS },
  { name: "מארח/ת", model: MODEL_BLOCKS },
];

export default function PositionsEditor({ positions, setPositions }) {
  const [openId, setOpenId] = useState(positions[0]?.id || null);
  const [showTip, setShowTip] = useState(true);

  const update = (id, patch) =>
    setPositions((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const updateConfig = (id, patch) =>
    setPositions((p) => p.map((x) => (x.id === id ? { ...x, config: { ...x.config, ...patch } } : x)));
  const remove = (id) => setPositions((p) => p.filter((x) => x.id !== id));

  const add = (name, model) => {
    const pos = newPosition(name, model, positions.length);
    setPositions((p) => [...p, pos]);
    setOpenId(pos.id);
  };

  // Switching style rebuilds the config from that style's defaults, keeping name.
  const setModel = (id, model) =>
    setPositions((p) => p.map((x) => {
      if (x.id !== id) return x;
      const fresh = newPosition(x.name, model, 0);
      return { ...x, model, config: fresh.config };
    }));

  const usedTemplates = new Set(positions.map((p) => p.name));

  return (
    <div>
      {/* Tutorial */}
      {showTip && (
        <div className="rounded-3xl p-[1.5px] bg-gradient-to-bl from-[#2f9e8f] via-[#1c4f48] to-[#7c5cff] mb-4">
          <div className="bg-[#14161a] rounded-[22px] p-4 text-right">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setShowTip(false)} className="text-[11px] font-bold text-gray-500 active:text-gray-300">הבנתי, סגור</button>
              <span className="flex items-center gap-1.5 text-sm font-black text-gray-100">
                איך מגדירים תפקיד נכון? <Lightbulb size={16} className="text-[#f3c14b]" />
              </span>
            </div>
            <p className="text-[12px] text-gray-400 leading-relaxed mb-3">
              לכל תפקיד יש דרך אחרת לאייש. בחר/י לכל אחד את הסגנון שמתאר אותו הכי טוב:
            </p>
            <div className="space-y-2">
              {Object.values(MODELS).map((m) => (
                <div key={m.key} className="flex items-start gap-2.5 bg-[#191b1f] rounded-2xl p-3">
                  <m.icon size={18} className="text-[#2f9e8f] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-black text-gray-100">{m.label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{m.sub}</p>
                    <p className="text-[11px] text-[#3fd0bc] font-bold mt-1">מתאים ל: {m.fit}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Position cards */}
      <div className="space-y-2.5">
        {positions.map((pos) => (
          <PositionCard
            key={pos.id} pos={pos} open={openId === pos.id}
            onToggle={() => setOpenId((o) => (o === pos.id ? null : pos.id))}
            update={update} updateConfig={updateConfig} setModel={setModel} remove={remove}
            setPositions={setPositions}
          />
        ))}
      </div>

      {positions.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Users size={32} className="mx-auto mb-2 text-gray-600" />
          <p className="text-sm font-bold">עדיין לא הוגדרו תפקידים</p>
          <p className="text-[12px] mt-1">בחר/י תבנית מהירה למטה כדי להתחיל</p>
        </div>
      )}

      {/* Quick templates */}
      <p className="text-[11px] font-bold text-gray-500 mt-4 mb-2 px-1">הוספה מהירה</p>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.filter((t) => !usedTemplates.has(t.name)).map((t) => (
          <button key={t.name} onClick={() => add(t.name, t.model)}
            className="flex items-center gap-1.5 rounded-full bg-[#191b1f] border border-[#22252b] px-3 py-2 text-[12px] font-bold text-gray-200 active:bg-[#20232a]">
            <Plus size={13} className="text-[#2f9e8f]" /> {t.name}
          </button>
        ))}
      </div>
      <button onClick={() => add("תפקיד חדש", MODEL_BLOCKS)}
        className="w-full mt-3 flex items-center justify-center gap-2 rounded-2xl py-3.5 border border-dashed border-[#2f9e8f]/50 text-[#3fd0bc] font-bold text-sm active:bg-[#15302b]">
        <Plus size={18} /> תפקיד מותאם אישית
      </button>
    </div>
  );
}

function PositionCard({ pos, open, onToggle, update, updateConfig, setModel, remove, setPositions }) {
  return (
    <div className="rounded-2xl border border-[#22252b] bg-[#191b1f] overflow-hidden">
      {/* Header row — tap anywhere to expand/collapse (except the delete button).
          The name is a plain label here so a tap never lands in a text field by
          accident; renaming happens inside the expanded editor below. */}
      <div onClick={onToggle} className="flex items-center gap-2 p-3 cursor-pointer active:bg-[#1c1e22]">
        <button onClick={(e) => { e.stopPropagation(); remove(pos.id); }}
          className="w-8 h-8 rounded-xl bg-[#1c1e22] flex items-center justify-center text-gray-500 active:text-[#e34d6c] active:bg-[#3a1d22] flex-shrink-0">
          <Trash2 size={15} />
        </button>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: pos.color }} />
        <span className="flex-1 min-w-0 text-right font-black text-gray-100 truncate">
          {pos.name || "תפקיד חדש"}
        </span>
        <span className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 flex-shrink-0">
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </div>

      {/* Collapsed summary */}
      {!open && (
        <div className="px-3 pb-3 -mt-1 text-right">
          <span className="text-[11px] text-gray-500">
            {pos.model === MODEL_STAGGER ? "כניסה מדורגת" : "משמרות קבועות"}
          </span>
        </div>
      )}

      {/* Expanded editor */}
      {open && (
        <div className="px-3 pb-3.5 border-t border-[#22252b] pt-3">
          {/* Rename — deliberate, inside the editor (not the tappable header) */}
          <div className="mb-3">
            <p className="text-[10px] text-gray-500 mb-1 text-right">שם התפקיד</p>
            <input value={pos.name} onChange={(e) => update(pos.id, { name: e.target.value })}
              className="w-full bg-[#1c1e22] border border-[#22252b] rounded-xl px-3 py-2.5 text-right font-bold text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-[#2f9e8f]"
              placeholder="שם התפקיד" />
          </div>

          {/* Style picker */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {Object.values(MODELS).map((m) => {
              const on = pos.model === m.key;
              return (
                <button key={m.key} onClick={() => setModel(pos.id, m.key)}
                  className={`rounded-2xl px-3 py-2.5 border text-right transition-colors ${
                    on ? "bg-[#15302b] border-[#2f9e8f]" : "bg-[#1c1e22] border-[#22252b]"}`}>
                  <div className="flex items-center justify-between">
                    <m.icon size={16} className={on ? "text-[#3fd0bc]" : "text-gray-500"} />
                    {on && <Check size={14} className="text-[#3fd0bc]" />}
                  </div>
                  <p className={`text-[12px] font-black mt-1 ${on ? "text-[#3fd0bc]" : "text-gray-300"}`}>{m.label}</p>
                </button>
              );
            })}
          </div>

          {pos.model === MODEL_STAGGER
            ? <StaggerEditor pos={pos} updateConfig={updateConfig} setPositions={setPositions} />
            : <BlocksEditor pos={pos} setPositions={setPositions} />}
        </div>
      )}
    </div>
  );
}

// ── Blocks model: time windows + per-day headcount ──────────────────────────────
function BlocksEditor({ pos, setPositions }) {
  const mutateBlocks = (fn) =>
    setPositions((p) => p.map((x) => (x.id === pos.id ? { ...x, config: { ...x.config, blocks: fn(x.config.blocks || []) } } : x)));
  const updateBlock = (bid, patch) => mutateBlocks((bs) => bs.map((b) => (b.id === bid ? { ...b, ...patch } : b)));
  const setCount = (bid, dayKey, val) =>
    mutateBlocks((bs) => bs.map((b) => (b.id === bid ? { ...b, counts: { ...b.counts, [dayKey]: Math.max(0, val) } } : b)));
  const addBlock = () => mutateBlocks((bs) => [...bs, { id: newId("b"), label: "משמרת", from: "09:00", to: "17:00", counts: { sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, hol: 1 } }]);
  const removeBlock = (bid) => mutateBlocks((bs) => bs.filter((b) => b.id !== bid));

  return (
    <div className="space-y-2.5">
      {(pos.config.blocks || []).map((b) => (
        <div key={b.id} className="rounded-2xl bg-[#1c1e22] p-3">
          <div className="flex items-center gap-2">
            <button onClick={() => removeBlock(b.id)} className="w-7 h-7 rounded-lg bg-[#16181c] flex items-center justify-center text-gray-500 active:text-[#e34d6c]">
              <Trash2 size={14} />
            </button>
            <input value={b.label} onChange={(e) => updateBlock(b.id, { label: e.target.value })}
              className="flex-1 min-w-0 bg-transparent text-right font-bold text-gray-100 focus:outline-none" placeholder="שם המשמרת" />
            <Clock size={16} className="text-[#2f9e8f]" />
          </div>
          <div className="flex items-center gap-2 mt-2.5 justify-end">
            <TimeBox value={b.to} onChange={(v) => updateBlock(b.id, { to: v })} />
            <span className="text-gray-500 text-xs">עד</span>
            <TimeBox value={b.from} onChange={(v) => updateBlock(b.id, { from: v })} />
            <span className="text-gray-500 text-xs">מ-</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-3 mb-1 text-right">כמה אנשים לכל יום</p>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((d) => (
              <DayCount key={d.key} letter={d.letter} weekend={d.weekend}
                value={b.counts?.[d.key] ?? 1}
                onInc={() => setCount(b.id, d.key, (b.counts?.[d.key] ?? 1) + 1)}
                onDec={() => setCount(b.id, d.key, (b.counts?.[d.key] ?? 1) - 1)} />
            ))}
          </div>
        </div>
      ))}
      <button onClick={addBlock}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 border border-dashed border-[#2f9e8f]/40 text-[#3fd0bc] font-bold text-[12px] active:bg-[#15302b]">
        <Plus size={15} /> הוסף משמרת
      </button>
    </div>
  );
}

// ── Stagger model: open/close + staggered ARRIVALS, per weekday ──────────────────
// Waiters/bar trickle in as the place fills. They don't clock out on a schedule —
// the manager sends people home when it quiets down — so we only model arrivals.
// Each arrival has a headcount PER WEEKDAY (Fri/Sat run hotter than a Tuesday).
// Everyone who arrives works through to closing.
const ALL_DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat", "hol"];
const countsOf = (a) =>
  a.counts || Object.fromEntries(ALL_DAY_KEYS.map((d) => [d, Math.max(0, Number(a.delta) || 0)]));

function StaggerEditor({ pos, updateConfig, setPositions }) {
  const c = pos.config || {};
  const mutateArr = (fn) =>
    setPositions((p) => p.map((x) => (x.id === pos.id ? { ...x, config: { ...x.config, arrivals: fn(x.config.arrivals || []) } } : x)));
  const updateArrival = (aid, patch) => mutateArr((as) => as.map((a) => (a.id === aid ? { ...a, ...patch } : a)));
  const setCount = (aid, dayKey, val) =>
    mutateArr((as) => as.map((a) => {
      if (a.id !== aid) return a;
      const { delta, ...rest } = a; // drop any legacy single-delta
      return { ...rest, counts: { ...countsOf(a), [dayKey]: Math.max(0, val) } };
    }));
  const addArrival = () => mutateArr((as) => [...as, {
    id: newId("a"), time: "16:00",
    counts: { sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 2, sat: 2, hol: 1 },
  }]);
  const removeArrival = (aid) => mutateArr((as) => as.filter((a) => a.id !== aid));
  const sorted = [...(c.arrivals || [])].sort((a, b) => a.time.localeCompare(b.time));

  // Per-day totals across all arrivals — drives the preview that shows how
  // staffing differs between, say, a Tuesday and a Friday.
  const dayTotals = DAYS.map((d) => ({
    ...d, total: sorted.reduce((s, a) => s + (countsOf(a)[d.key] ?? 0), 0),
  }));

  return (
    <div>
      {/* Open / close */}
      <div className="flex items-center gap-2 justify-end mb-3">
        <TimeBox value={c.close || "23:00"} onChange={(v) => updateConfig(pos.id, { close: v })} />
        <span className="text-gray-500 text-xs">סגירה</span>
        <TimeBox value={c.open || "10:00"} onChange={(v) => updateConfig(pos.id, { open: v })} />
        <span className="text-gray-500 text-xs">פתיחה</span>
      </div>

      {/* Arrival events — each with a per-weekday headcount */}
      <div className="space-y-2.5">
        {sorted.map((a) => {
          const counts = countsOf(a);
          return (
            <div key={a.id} className="rounded-2xl bg-[#1c1e22] p-3">
              <div className="flex items-center gap-2">
                <button onClick={() => removeArrival(a.id)} className="w-7 h-7 rounded-lg bg-[#16181c] flex items-center justify-center text-gray-500 active:text-[#e34d6c] flex-shrink-0">
                  <Trash2 size={14} />
                </button>
                <span className="flex-1 text-right text-[12px] font-bold text-gray-300 flex items-center gap-1.5 justify-end">
                  כניסת עובדים בשעה <ArrowUpFromLine size={13} className="text-[#3fd0bc]" />
                </span>
                <TimeBox value={a.time} onChange={(v) => updateArrival(a.id, { time: v })} />
              </div>
              <p className="text-[10px] text-gray-500 mt-3 mb-1 text-right">כמה נכנסים בכל יום</p>
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d) => (
                  <DayCount key={d.key} letter={d.letter} weekend={d.weekend}
                    value={counts[d.key] ?? 0}
                    onInc={() => setCount(a.id, d.key, (counts[d.key] ?? 0) + 1)}
                    onDec={() => setCount(a.id, d.key, (counts[d.key] ?? 0) - 1)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={addArrival}
        className="w-full mt-2.5 flex items-center justify-center gap-1.5 rounded-xl py-2.5 border border-dashed border-[#2f9e8f]/40 text-[#3fd0bc] font-bold text-[12px] active:bg-[#15302b]">
        <ArrowUpFromLine size={14} /> הוספת כניסה
      </button>

      {/* Live preview — total people per day, so weekday vs weekend is obvious */}
      <div className="mt-3 bg-[#14161a] border border-[#22252b] rounded-2xl p-3 text-right">
        <div className="flex items-center gap-1.5 justify-end text-[11px] font-black text-[#2f9e8f] mb-2">
          תצוגה מקדימה · סה״כ עובדים ביום <Sparkles size={12} />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dayTotals.map((d) => (
            <div key={d.key} className={`flex flex-col items-center rounded-lg py-1.5 ${d.weekend ? "bg-[#15302b]" : "bg-[#1c1e22]"}`}>
              <span className={`text-[10px] font-bold ${d.weekend ? "text-[#3fd0bc]" : "text-gray-500"}`}>{d.letter}</span>
              <span className="text-sm font-black text-gray-100 leading-none mt-1">{d.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function TimeBox({ value, onChange }) {
  return (
    <input type="time" value={value} onChange={(e) => onChange(e.target.value)}
      className="bg-[#16181c] border border-[#22252b] rounded-lg px-2 py-1.5 text-[13px] font-bold text-gray-100 focus:outline-none focus:border-[#2f9e8f] [color-scheme:dark]" />
  );
}
function DayCount({ letter, value, weekend, onInc, onDec }) {
  return (
    <div className={`flex flex-col items-center rounded-lg py-1 ${weekend ? "bg-[#15302b]" : "bg-[#16181c]"}`}>
      <span className={`text-[10px] font-bold ${weekend ? "text-[#3fd0bc]" : "text-gray-500"}`}>{letter}</span>
      <button onClick={onInc} className="text-gray-500 active:text-[#3fd0bc]"><ChevronUp size={13} /></button>
      <span className="text-sm font-black text-gray-100 leading-none">{value}</span>
      <button onClick={onDec} className="text-gray-500 active:text-[#3fd0bc]"><ChevronDown size={13} /></button>
    </div>
  );
}
