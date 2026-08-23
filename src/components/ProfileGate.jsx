import { useState } from "react";
import { UserRound, Check, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { nameProblem } from "../lib/gender";

const db = supabase.schema("menu_app");

// The first thing a new owner meets: who are YOU — not the restaurant, the person.
// Hebrew conjugates nearly everything the app says to its user, so without a gender the
// copy is stuck in slash forms and plurals; with it, the app can simply talk right
// (user, 2026-08-22: "we need name and gender, and from that thats how you treat them").
//
// One screen, two answers, done. A small "אחר כך" exists because a gate with no exit is
// where first sessions die — skipping falls back to the neutral phrasing used until now.
export default function ProfileGate({ restaurant, onDone, onSkip }) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const problem = nameProblem(name);
    if (problem) { setErr(problem); return; }
    if (!gender) { setErr("בחרו איך לפנות אליכם — זה משנה את כל הניסוחים באפליקציה."); return; }
    setBusy(true);
    setErr("");
    const patch = { owner_name: name.trim(), owner_gender: gender };
    const { error } = await db.from("restaurants").update(patch).eq("id", restaurant.id);
    setBusy(false);
    if (error) {
      console.error("owner profile save failed:", error.message, error.code);
      setErr("השמירה נכשלה — נסו שוב.");
      return;
    }
    onDone(patch);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center px-6" dir="rtl">
      <div className="w-full max-w-sm bg-[#16181c] border border-[#6d5efc]/60 rounded-2xl p-6 shadow-2xl shadow-black/60 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#6d5efc]/15 flex items-center justify-center mx-auto">
            <UserRound size={26} className="text-[#a79bff]" />
          </div>
          <p className="text-lg font-black text-[#eef0f6]">נעים להכיר!</p>
          <p className="text-[12px] text-[#8a8aa0] leading-relaxed">
            עוד לפני המסעדה — מי אתם? האפליקציה תשתמש בזה כדי לפנות אליכם נכון.
          </p>
        </div>

        <div>
          <p className="text-[11px] font-bold text-[#8a8aa0] mb-1.5">השם הפרטי שלכם</p>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setErr(""); }}
            placeholder="למשל: דנה"
            dir="rtl"
            autoFocus
            className="w-full bg-[#0c0d10] border border-[#22252b] rounded-xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#6d5efc]"
          />
        </div>

        <div>
          <p className="text-[11px] font-bold text-[#8a8aa0] mb-1.5">איך לפנות אליכם?</p>
          <div className="flex gap-2">
            {[["male", "בלשון זכר"], ["female", "בלשון נקבה"]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => { setGender(v); setErr(""); }}
                className={`flex-1 py-3 min-h-[44px] rounded-xl text-[13px] font-black border transition ${
                  gender === v
                    ? "bg-[#6d5efc]/15 border-[#6d5efc] text-[#a79bff]"
                    : "bg-[#0c0d10] border-[#22252b] text-[#8a8aa0]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <p className="text-[11px] font-bold text-[#e0315a] flex items-start gap-1.5 leading-relaxed">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {err}
          </p>
        )}

        <button
          onClick={save}
          disabled={busy}
          className="w-full bg-[#6d5efc] text-white font-black py-3.5 min-h-[44px] rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Check size={15} /> {busy ? "שומר…" : "זה אני — ממשיכים"}
        </button>
        <button onClick={onSkip} className="w-full text-[11px] font-bold text-[#5a5a6e] py-1">
          אחר כך
        </button>
      </div>
    </div>
  );
}
