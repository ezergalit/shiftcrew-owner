import { useMemo, useState } from "react";
import { Sparkles, ArrowLeft, Check, X } from "lucide-react";

// Guided daily-brief builder, shown when today's brief is still empty.
//
// The blank four-field form assumed the owner arrives knowing what to write. In practice
// the brief is the last thing before a shift and the fields stay empty — so the team's
// home screen says "no updates" on a day when three dishes were actually 86'd. This walks
// the owner through the questions a manager answers out loud anyway, one at a time, with
// the answers pre-filled from the menu wherever possible.
//
// It never writes on its own: every step ends in the same `briefDraft` the manual form
// uses, and the owner still presses save.

const DAY_MS = 86400000;

export default function BriefAssistant({ items, draft, setDraft, onSave, saving, onDismiss }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState({ missing: new Set(), recommend: new Set() });

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

  const toggle = (group, value) =>
    setPicked((p) => {
      const next = new Set(p[group]);
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...p, [group]: next };
    });

  const appendTo = (field, values) => {
    if (!values.length) return;
    const existing = (draft[field] || "").split(",").map((x) => x.trim()).filter(Boolean);
    const merged = [...new Set([...existing, ...values])];
    setDraft({ ...draft, [field]: merged.join(", ") });
  };

  const Chip = ({ on, children, onClick }) => (
    <button
      onClick={onClick}
      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
        on ? "bg-[#6d5efc] text-white border-[#6d5efc]" : "bg-[#16181c] text-[#c4c4d4] border-[#22252b]"
      }`}
    >
      {children}
    </button>
  );

  const steps = [
    {
      key: "missing",
      question: "יש חוסרים במטבח היום?",
      hint: "בחרו מנות שאזלו — הצוות יראה אותן מסומנות באדום",
      body: (
        <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
          {(items || []).length === 0 ? (
            <p className="text-[11px] text-[#8a8aa0]">אין עדיין מנות בתפריט</p>
          ) : (
            (items || []).map((d) => (
              <Chip key={d.id} on={picked.missing.has(d.name)} onClick={() => toggle("missing", d.name)}>
                {d.name}
              </Chip>
            ))
          )}
        </div>
      ),
      commit: () => appendTo("missing", [...picked.missing]),
    },
    {
      key: "recommend",
      question: newCategories.length
        ? `תרצו שימליצו על תפריט ${newCategories[0][0]} החדש?`
        : "יש משהו שתרצו שימליצו עליו היום?",
      hint: "מה שתבחרו יופיע לצוות כ״חדש היום״",
      body: (
        <div className="space-y-2">
          {newCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {newCategories.map(([cat, ds]) => (
                <Chip key={cat} on={picked.recommend.has(cat)} onClick={() => toggle("recommend", cat)}>
                  כל תפריט {cat} ({ds.length})
                </Chip>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto">
            {(recentlyAdded.length ? recentlyAdded : items || []).slice(0, 40).map((d) => (
              <Chip key={d.id} on={picked.recommend.has(d.name)} onClick={() => toggle("recommend", d.name)}>
                {d.name}
              </Chip>
            ))}
          </div>
          {recentlyAdded.length > 0 && (
            <p className="text-[10px] text-[#8a8aa0]">מוצגות מנות שנוספו ב-3 השבועות האחרונים</p>
          )}
        </div>
      ),
      commit: () => appendTo("newItems", [...picked.recommend]),
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
        <p className="text-xs font-black text-[#a79bff]">בואו נכין את הבריף להיום</p>
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
