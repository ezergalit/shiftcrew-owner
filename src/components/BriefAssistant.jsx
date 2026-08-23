import { useMemo, useState } from "react";
import { Sparkles, ArrowLeft, Check, X, Plus } from "lucide-react";
import { crossScriptMatches } from "../lib/translit";

// Guided daily-brief builder, shown when today's brief is still empty.
//
// The blank four-field form assumed the owner arrives knowing what to write. In practice
// the brief is the last thing before a shift and the fields stay empty — so the team's
// home screen says "no updates" on a day when three dishes were actually 86'd. This walks
// the owner through the questions a manager answers out loud anyway, one at a time.
//
// It never writes on its own: every step ends in the same `briefDraft` the manual form
// uses, and the owner still presses save.

const DAY_MS = 86400000;

// Type, don't scan. The first version showed the WHOLE menu as toggle chips — twenty
// buttons before the owner did anything (user, 2026-08-21: "its too long and confusing").
// A manager already knows what ran out; the field's job is to catch the name, not to
// quiz them on their own menu:
//   • typing filters the menu — tapping a match autocompletes the exact dish name
//   • anything that isn't a dish ("לחם", "עגבניות") is added exactly as typed
//   • text still sitting in the box when the step advances is committed anyway, so
//     "typed but never pressed Enter" — the most common path — loses nothing
export function TagField({ items, picked, onPicked, text, onText, placeholder, tone }) {
  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    // Each suggestion carries its category — "הרי גליל אלון לבן · יינות" answers "is
    // that even on my menu?" on sight (user, 2026-08-23: typed "הר", got wines from the
    // imported wine list, and reasonably asked what they were). Word-start matches rank
    // before mid-word ones.
    const matches = (items || [])
      .filter((d) => d.name.toLowerCase().includes(q) && !picked.includes(d.name))
      .map((d) => ({
        name: d.name,
        category: (d.category || "").split(/\s*[—–]\s*/)[0].trim(),
        atWordStart: d.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)),
      }));
    matches.sort((a, b) => (b.atWordStart ? 1 : 0) - (a.atWordStart ? 1 : 0));
    return matches.slice(0, 6);
  }, [text, items, picked]);

  // The owner types "לילי" and the menu says "Lilly Flower" — phonetic matching across
  // scripts (src/lib/translit.js, deterministic consonant skeletons, no AI). Shown as
  // "האם התכוונתם?" so a near-miss is clearly a guess, not a plain-text match.
  const soundsLike = useMemo(
    () =>
      crossScriptMatches(text.trim(), items || []).filter((d) => !picked.includes(d.name))
        .map((d) => ({ name: d.name, category: (d.category || "").split(/\s*[—–]\s*/)[0].trim() })),
    [text, items, picked]
  );

  const add = (name) => {
    const v = (name || "").trim();
    if (!v) return;
    if (!picked.includes(v)) onPicked([...picked, v]);
    onText("");
  };

  const exact = suggestions.some((sg) => sg.name.toLowerCase() === text.trim().toLowerCase());
  const tagCls =
    tone === "red"
      ? "bg-[#e0315a]/10 border-[#e0315a]/40 text-[#ff8aa5]"
      : "bg-[#22c08c]/10 border-[#22c08c]/40 text-[#5fdcb2]";

  return (
    <div className="space-y-2">
      <input
        value={text}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          }
        }}
        placeholder={placeholder}
        dir="rtl"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2.5 text-[13px] text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#6d5efc]"
      />

      {/* Suggestions exist only while typing — the empty state is an empty box, not a
          wall of the whole menu. */}
      {(suggestions.length > 0 || soundsLike.length > 0 || (text.trim() && !exact)) && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((sg) => (
            <button
              key={sg.name}
              onClick={() => add(sg.name)}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border bg-[#16181c] text-[#c4c4d4] border-[#3a3d46] flex items-center gap-1.5"
            >
              {sg.name}
              {sg.category && <span className="text-[9px] font-black text-[#8a8aa0]">· {sg.category}</span>}
            </button>
          ))}
          {soundsLike.map((sg) => (
            <button
              key={`sl-${sg.name}`}
              onClick={() => add(sg.name)}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-dashed bg-[#16181c] text-[#7fc8ff] border-[#3d6a8f] flex items-center gap-1.5"
            >
              <span className="text-[9px] font-black text-[#8a8aa0]">התכוונתם?</span>
              {sg.name}
              {sg.category && <span className="text-[9px] font-black text-[#8a8aa0]">· {sg.category}</span>}
            </button>
          ))}
          {text.trim() && !exact && (
            <button
              onClick={() => add(text)}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-dashed border-[#6d5efc]/60 text-[#a79bff] flex items-center gap-1"
            >
              <Plus size={11} /> הוספת ״{text.trim()}״
            </button>
          )}
        </div>
      )}

      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((n) => (
            <span
              key={n}
              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${tagCls}`}
            >
              {n}
              <button onClick={() => onPicked(picked.filter((x) => x !== n))} aria-label={`הסרת ${n}`}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BriefAssistant({ items, draft, setDraft, onSave, saving, onDismiss }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState({ missing: [], recommend: [] });
  const [typing, setTyping] = useState({ missing: "", recommend: "" });

  // Dishes added in the last three weeks — the ones worth pushing, and the ones the team
  // most likely hasn't learned yet.
  const recentlyAdded = useMemo(() => {
    const cutoff = Date.now() - 21 * DAY_MS;
    return (items || []).filter((d) => d.createdAt && new Date(d.createdAt).getTime() >= cutoff);
  }, [items]);

  // A whole new section reads better as "the new cocktail menu" than as nine dish names.
  const newCategories = useMemo(() => {
    const byCat = {};
    for (const d of recentlyAdded) {
      const c = (d.category || "").split(/\s*[—–]\s*/)[0].trim();
      if (c) (byCat[c] = byCat[c] || []).push(d);
    }
    return Object.entries(byCat).filter(([, ds]) => ds.length >= 3);
  }, [recentlyAdded]);

  const toggleRecommendCat = (cat) =>
    setPicked((p) => ({
      ...p,
      recommend: p.recommend.includes(cat) ? p.recommend.filter((x) => x !== cat) : [...p.recommend, cat],
    }));

  const appendTo = (field, values) => {
    if (!values.length) return;
    const existing = (draft[field] || "").split(",").map((x) => x.trim()).filter(Boolean);
    const merged = [...new Set([...existing, ...values])];
    setDraft({ ...draft, [field]: merged.join(", ") });
  };

  // What the step actually hands over: the tags, plus whatever is still in the input.
  // The user's rule verbatim — "when they press save it saves what they typed anyway".
  const flush = (group) => [...new Set([...picked[group], typing[group].trim()].filter(Boolean))];

  const steps = [
    {
      key: "missing",
      question: "מה חסר היום?",
      hint: "הקלידו — מנה מהתפריט תושלם אוטומטית, וכל דבר אחר יישמר כמו שכתבתם",
      body: (
        <TagField
          items={items}
          picked={picked.missing}
          onPicked={(v) => setPicked((p) => ({ ...p, missing: v }))}
          text={typing.missing}
          onText={(v) => setTyping((t) => ({ ...t, missing: v }))}
          placeholder="למשל: סלמון…"
          tone="red"
        />
      ),
      commit: () => appendTo("missing", flush("missing")),
    },
    {
      key: "recommend",
      question: newCategories.length
        ? `תרצו שימליצו על תפריט ${newCategories[0][0]} החדש?`
        : "על מה להמליץ היום?",
      hint: "מה שתוסיפו יופיע לצוות כ״חדש היום״",
      body: (
        <div className="space-y-2">
          {newCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {newCategories.map(([cat, ds]) => (
                <button
                  key={cat}
                  onClick={() => toggleRecommendCat(cat)}
                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                    picked.recommend.includes(cat)
                      ? "bg-[#6d5efc] text-white border-[#6d5efc]"
                      : "bg-[#16181c] text-[#c4c4d4] border-[#22252b]"
                  }`}
                >
                  כל תפריט {cat} ({ds.length})
                </button>
              ))}
            </div>
          )}
          <TagField
            items={items}
            picked={picked.recommend.filter((x) => !newCategories.some(([cat]) => cat === x))}
            onPicked={(v) =>
              setPicked((p) => ({
                ...p,
                recommend: [...p.recommend.filter((x) => newCategories.some(([cat]) => cat === x)), ...v],
              }))
            }
            text={typing.recommend}
            onText={(v) => setTyping((t) => ({ ...t, recommend: v }))}
            placeholder="למשל: קינוח היום…"
            tone="green"
          />
        </div>
      ),
      commit: () => appendTo("newItems", flush("recommend")),
    },
    {
      key: "notes",
      question: "משהו נוסף שהצוות צריך לדעת?",
      hint: "אורח חשוב, שינוי בשעות, דגש שירות — או דלגו",
      body: (
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          rows={3}
          placeholder="לדוגמה: היום יש אירוע ב-20:00, לשים לב לזמני הגשה"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-xs text-[#eef0f6] resize-none"
        />
      ),
      commit: () => {},
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const next = () => {
    current.commit();
    if (isLast) onSave();
    else setStep((x) => x + 1);
  };

  return (
    <div className="bg-gradient-to-l from-[#1b1740] to-[#16181c] border border-[#6d5efc] rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles size={14} className="text-[#a79bff]" />
        <p className="text-xs font-black text-[#a79bff]">העדכון היומי לצוות</p>
        <span className="flex-1" />
        <button onClick={onDismiss} className="text-[#5a5a6e]" title="אכתוב לבד">
          <X size={14} />
        </button>
      </div>

      <div className="flex gap-1 mb-3">
        {steps.map((s, i) => (
          <span
            key={s.key}
            className="h-1 flex-1 rounded-full"
            style={{ background: i <= step ? "#6d5efc" : "#22252b" }}
          />
        ))}
      </div>

      <p className="text-sm font-black text-[#eef0f6] mb-1">{current.question}</p>
      <p className="text-[10px] text-[#8a8aa0] font-bold mb-2.5">{current.hint}</p>

      <div className="mb-3">{current.body}</div>

      <div className="flex gap-2">
        <button
          onClick={next}
          disabled={saving}
          className="flex-1 py-2.5 rounded-lg bg-[#6d5efc] text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {isLast ? <><Check size={13} /> {saving ? "שומר…" : "שליחה לצוות"}</> : <>הבא <ArrowLeft size={13} /></>}
        </button>
        {!isLast && (
          <button onClick={() => setStep((x) => x + 1)} className="px-4 py-2.5 rounded-lg bg-[#22252b] text-[#8a8aa0] text-xs font-bold">
            דלג
          </button>
        )}
      </div>
    </div>
  );
}
