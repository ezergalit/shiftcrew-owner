import { useState } from "react";
import { Copy, Check, UserMinus, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { membersLabel } from "./aurora/bits";

const db = supabase.schema("menu_app");

// Joining the team and leaving it — the two things an owner does to the roster, and
// neither is a daily job. They moved out of the main navigation into settings
// (user, 2026-08-20); what the owner looks at every day is progress, and that now lives
// on the home screen.
export default function TeamRoster({ restaurant, members, onRemoved , tasksOff = false }) {
  const [copied, setCopied] = useState(false);
  const [copiedTrainee, setCopiedTrainee] = useState(false);
  const [confirming, setConfirming] = useState(null); // member id awaiting confirmation
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(restaurant?.team_code || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setErr("ההעתקה נחסמה בדפדפן — אפשר לסמן את הקוד ולהעתיק ידנית.");
    }
  };

  const copyTraineeCode = async () => {
    try {
      await navigator.clipboard.writeText(restaurant?.trainee_code || "");
      setCopiedTrainee(true);
      setTimeout(() => setCopiedTrainee(false), 1800);
    } catch {
      setErr("ההעתקה נחסמה בדפדפן — אפשר לסמן את הקוד ולהעתיק ידנית.");
    }
  };

  const remove = async (id) => {
    setBusy(true);
    setErr("");
    // menu_progress and leaderboard only got ON DELETE CASCADE in 2026-08-12; before that
    // this delete always failed, which is why the app never had a remove button. The error
    // is surfaced rather than swallowed so a future missing cascade can't hide again.
    const { error } = await db.from("team_members").delete().eq("id", id);
    setBusy(false);
    if (error) {
      console.error("team member delete failed:", error);
      setErr("ההסרה נכשלה. נסו שוב, ואם זה חוזר — שלחו לנו בקשה מטאב התפריט.");
      return;
    }
    setConfirming(null);
    onRemoved?.(id);
  };

  return (
    <div className="space-y-3">
      <div className="bg-[#0c0d10] border border-[#22252b] rounded-xl p-3.5">
        <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">קוד הצוות</p>
        <div className="flex items-center gap-2">
          <p className="text-2xl font-black text-[#6d5efc] tracking-wide flex-1">{restaurant?.team_code || "???"}</p>
          <button
            onClick={copyCode}
            className={`px-3 py-2 rounded-lg text-[11px] font-black flex items-center gap-1.5 transition ${
              copied ? "bg-[#22c08c] text-[#06231a]" : "bg-[#22252b] text-[#a79bff]"
            }`}
          >
            {copied ? <><Check size={13} /> הועתק</> : <><Copy size={13} /> העתקה</>}
          </button>
        </div>
        <p className="text-[11px] text-[#8a8aa0] leading-relaxed mt-2">
          שלחו את הקוד לצוות — למשל בקבוצת הוואטסאפ. כל אחד מוריד את אפליקציית הצוות,
          מזין את הקוד ואת שמו, וזהו. הם יופיעו כאן ברגע שייכנסו.
        </p>
      </div>

      {/* A second entry code for brand-new hires: same app, learning-only — no shift
          tasks, no daily brief. The mode is decided by which code they typed. */}
      {restaurant?.trainee_code && (
        <div className="bg-[#0c0d10] border border-[#22252b] rounded-xl p-3.5">
          <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">קוד מלצרים מתחילים</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-black text-[#38bdf8] tracking-wide flex-1">{restaurant.trainee_code}</p>
            <button
              onClick={copyTraineeCode}
              className={`px-3 py-2 rounded-lg text-[11px] font-black flex items-center gap-1.5 transition ${
                copiedTrainee ? "bg-[#22c08c] text-[#06231a]" : "bg-[#22252b] text-[#a79bff]"
              }`}
            >
              {copiedTrainee ? <><Check size={13} /> הועתק</> : <><Copy size={13} /> העתקה</>}
            </button>
          </div>
          <p className="text-[11px] text-[#8a8aa0] leading-relaxed mt-2">
            {tasksOff
              ? "למי שעוד לא במשמרות: כניסה עם הקוד הזה פותחת גרסה ללימוד התפריט בלבד. כשמתחילים לעבוד, נכנסים עם קוד הצוות הרגיל."
              : "למי שעוד לא במשמרות: כניסה עם הקוד הזה פותחת גרסה ללימוד התפריט בלבד — בלי משימות משמרת ובלי העדכון היומי. כשמתחילים לעבוד, נכנסים עם קוד הצוות הרגיל."}
          </p>
        </div>
      )}

      {err && (
        <p className="text-[11px] font-bold text-[#e0315a] flex items-start gap-1.5 leading-relaxed">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {err}
        </p>
      )}

      {members.length === 0 ? (
        <p className="text-[12px] text-[#8a8aa0] text-center py-3 leading-relaxed">
          עדיין לא הצטרף אף אחד. שתפו את הקוד למעלה.
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-[#8a8aa0] px-1">{membersLabel(members.length)}</p>
          {members.map((m) => (
            <div key={m.id} className="bg-[#0c0d10] border border-[#22252b] rounded-xl p-2.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-bold text-[#eef0f6] truncate">{m.name}</span>
                  <span className="block text-[10px] text-[#5a5a6e]">
                    הצטרף/ה {new Date(m.created_at).toLocaleDateString("he-IL")}
                  </span>
                </span>
                <button
                  onClick={() => setConfirming(confirming === m.id ? null : m.id)}
                  title="הסרה מהצוות"
                  aria-label={`הסרת ${m.name} מהצוות`}
                  className="w-7 h-7 rounded-lg bg-[#20232b] text-[#8a8aa0] hover:text-[#e0315a] flex items-center justify-center flex-shrink-0 transition"
                >
                  <UserMinus size={13} />
                </button>
              </div>
              {confirming === m.id && (
                <div className="mt-2 pt-2 border-t border-[#22252b] space-y-2">
                  <p className="text-[11px] text-[#8a8aa0] leading-relaxed">
                    להסיר את {m.name}? כל ההתקדמות, הציונים והמבחנים שלו/ה יימחקו ולא ניתן לשחזר.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => remove(m.id)}
                      disabled={busy}
                      className="flex-1 bg-[#e0315a] text-white text-[11px] font-black py-2 rounded-lg disabled:opacity-50"
                    >
                      {busy ? "מסיר…" : "כן, להסיר"}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      className="px-4 bg-[#22252b] text-[#8a8aa0] text-[11px] font-black py-2 rounded-lg"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
