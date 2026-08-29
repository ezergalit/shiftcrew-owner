import { useEffect, useState } from "react";
import { KeyRound, Trash2, Loader2, AlertTriangle, Check, Clock } from "lucide-react";
import { supabase } from "../lib/supabase";
import { passwordProblem } from "../auth/OwnerLogin";

const db = supabase.schema("menu_app");

const COOLDOWN_S = 60;

// Change-password + delete-account, at the bottom of the settings tab.
// Account deletion in-app is a hard requirement of both stores (Google Play
// UserData policy, App Store 5.1.1(v)) — without it the apps cannot ship.
// Both actions re-check the owner password server-side; holding a session is
// deliberately not enough to destroy an account.
//
// ⚠️ Deleting no longer destroys anything (user, 29.8: "i want there to be a
// confirmation with me first… it can delete the app for him but it stays with me
// until i decide to delete it myself"). `request_account_deletion` locks the owner
// out on every device and files the request in the operator queue; the data waits.
// Store policy is still satisfied — the user can end their account from inside the
// app, and it is honoured — it just is not irreversible on a mis-tap.
//
// Three guards, because the button is one tap from a restaurant's whole history:
//   1. the owner password, checked on the server;
//   2. typing the word מחיקה;
//   3. a 60-second wait, then an explicit "are you sure".
// The wait is the one that catches the accident: 1 and 2 are things a determined
// finger does anyway.
export default function AccountSecurity({ ownerCode, secondaryName, onDeleted }) {
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }

  // "closed" → "form" (password + the word) → "sure" (60s, then confirm) → "sent"
  const [delStep, setDelStep] = useState("closed");
  const [delPassword, setDelPassword] = useState("");
  const [delConfirmText, setDelConfirmText] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");
  const [countdown, setCountdown] = useState(COOLDOWN_S);

  useEffect(() => {
    if (delStep !== "sure") return;
    setCountdown(COOLDOWN_S);
    const t = setInterval(() => setCountdown((n) => (n <= 1 ? (clearInterval(t), 0) : n - 1)), 1000);
    return () => clearInterval(t);
  }, [delStep]);

  const closeDelete = () => {
    setDelStep("closed"); setDelPassword(""); setDelConfirmText(""); setDelErr("");
  };

  const changePassword = async () => {
    const problem = passwordProblem(pwNew);
    if (problem) { setPwMsg({ ok: false, text: problem }); return; }
    setPwBusy(true);
    setPwMsg(null);
    try {
      const { data, error } = await db.rpc("change_owner_password", {
        p_owner_code: ownerCode, p_current: pwCurrent, p_new: pwNew,
      });
      if (error) throw error;
      if (data?.ok) {
        setPwMsg({ ok: true, text: "הסיסמה הוחלפה." });
        setPwCurrent(""); setPwNew("");
      } else {
        setPwMsg({ ok: false, text: data?.error === "bad_credentials" ? "הסיסמה הנוכחית שגויה." : "הסיסמה החדשה קצרה מדי." });
      }
    } catch (e) {
      console.error("change password:", e);
      setPwMsg({ ok: false, text: "משהו השתבש. נסו שוב." });
    } finally { setPwBusy(false); }
  };

  const requestDeletion = async () => {
    setDelBusy(true);
    setDelErr("");
    try {
      const { data, error } = await db.rpc("request_account_deletion", {
        p_owner_code: ownerCode, p_password: delPassword,
      });
      if (error) throw error;
      if (data?.ok) { setDelStep("sent"); return; }
      setDelErr(data?.error === "not_primary"
        ? "רק בעל/ת החשבון הראשי/ת יכול/ה לבקש מחיקה."
        : "הסיסמה שגויה.");
    } catch (e) {
      console.error("request account deletion:", e);
      setDelErr("משהו השתבש. נסו שוב.");
    } finally { setDelBusy(false); }
  };

  // A secondary manager (added via add_owner_user) gets an explanation instead of
  // the account controls: deletion is refused server-side anyway (not_primary in
  // delete_restaurant_account), and the password form only changes the primary
  // password, which they don't hold. Showing dead controls would just confuse.
  if (secondaryName) {
    return (
      <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b]">
        <p className="font-bold text-[#eef0f6] flex items-center gap-2"><KeyRound size={15} /> אבטחת חשבון</p>
        <p className="text-xs text-[#8a8aa0] leading-relaxed mt-2">
          מחובר/ת כמנהל/ת ({secondaryName}). החלפת סיסמת המסעדה ומחיקת החשבון שמורות
          לבעל/ת החשבון הראשי/ת בלבד.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ---- change password ---- */}
      <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b] space-y-2">
        <p className="font-bold text-[#eef0f6] flex items-center gap-2"><KeyRound size={15} /> החלפת סיסמה</p>
        <input
          type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
          placeholder="הסיסמה הנוכחית" autoComplete="current-password"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
        />
        <input
          type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
          placeholder="סיסמה חדשה (8 תווים לפחות)" autoComplete="new-password"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
        />
        {pwMsg && (
          <p className={`text-xs font-bold flex items-center gap-1.5 ${pwMsg.ok ? "text-[#22c08c]" : "text-[#e0315a]"}`}>
            {pwMsg.ok ? <Check size={14} /> : <AlertTriangle size={14} />} {pwMsg.text}
          </p>
        )}
        <button
          onClick={changePassword} disabled={pwBusy || !pwCurrent || !pwNew}
          className="w-full bg-[#22252b] text-[#a79bff] font-bold py-2 rounded-lg text-sm hover:bg-[#2c2e35] transition disabled:opacity-60"
        >
          {pwBusy ? <Loader2 size={14} className="animate-spin inline" /> : "החלפת סיסמה"}
        </button>
      </div>

      {/* ---- delete account ---- */}
      <div className="bg-[#16181c] rounded-lg p-4 border border-[#3a1c22] space-y-2">
        <p className="font-bold text-[#e0315a] flex items-center gap-2"><Trash2 size={15} /> מחיקת החשבון</p>

        {delStep === "closed" && (
          <>
            <p className="text-xs text-[#8a8aa0] leading-relaxed">
              מחיקה סוגרת את הגישה לחשבון בכל המכשירים — למסעדה, לתפריט ולנתוני הצוות.
              הבקשה מגיעה אלינו ואנחנו מוחקים בפועל, כדי שלא יימחק שום דבר בטעות.
            </p>
            <button
              onClick={() => setDelStep("form")}
              className="w-full bg-[#2a1418] text-[#e0315a] font-bold py-2 rounded-lg text-sm border border-[#3a1c22] hover:bg-[#33181e] transition"
            >
              אני רוצה למחוק את החשבון
            </button>
          </>
        )}

        {delStep === "form" && (
          <>
            <p className="text-xs text-[#8a8aa0] leading-relaxed">
              לאישור: הקלידו <span className="font-black text-[#eef0f6]">מחיקה</span> ואת סיסמת הבעלים.
            </p>
            <input
              type="text" value={delConfirmText} onChange={(e) => setDelConfirmText(e.target.value)}
              placeholder={"הקלידו: מחיקה"} dir="rtl"
              className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#e0315a] text-sm"
            />
            <input
              type="password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)}
              placeholder="סיסמת הבעלים" autoComplete="current-password"
              className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#e0315a] text-sm"
            />
            <div className="flex gap-2">
              <button onClick={closeDelete} className="flex-1 bg-[#22252b] text-[#c4c4d4] font-bold py-2 rounded-lg text-sm">
                ביטול
              </button>
              <button
                onClick={() => setDelStep("sure")}
                disabled={delConfirmText.trim() !== "מחיקה" || !delPassword}
                className="flex-1 bg-[#2a1418] text-[#e0315a] font-black py-2 rounded-lg text-sm border border-[#3a1c22] disabled:opacity-40"
              >
                המשך
              </button>
            </div>
          </>
        )}

        {delStep === "sure" && (
          <>
            <div className="bg-[#2a1418] border border-[#3a1c22] rounded-lg p-3 space-y-1.5">
              <p className="text-sm font-black text-[#eef0f6]">בטוחים?</p>
              <p className="text-xs text-[#c4c4d4] leading-relaxed">
                אחרי האישור תנותקו מהחשבון בכל המכשירים ולא תוכלו להיכנס אליו.
                הנתונים עצמם נשמרים אצלנו — אם זו טעות, אפשר לפנות אלינו והחשבון יוחזר.
              </p>
            </div>
            {delErr && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} /> {delErr}</p>}
            <div className="flex gap-2">
              <button onClick={closeDelete} className="flex-1 bg-[#22252b] text-[#c4c4d4] font-bold py-2 rounded-lg text-sm">
                לא, חזרה
              </button>
              {/* The 60-second wait. A destructive button that is live the instant the
                  screen appears is a button that gets pressed by the tap that opened it. */}
              <button
                onClick={requestDeletion}
                disabled={delBusy || countdown > 0}
                className="flex-1 bg-[#e0315a] text-white font-black py-2 rounded-lg text-sm disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {delBusy ? <Loader2 size={14} className="animate-spin" />
                  : countdown > 0 ? <><Clock size={13} /> {countdown} שניות</>
                  : "כן, למחוק את החשבון"}
              </button>
            </div>
            {countdown > 0 && (
              <p className="text-[11px] text-[#8a8aa0] text-center">
                השהיה של דקה לפני האישור, כדי שזה לא יקרה בלחיצה בטעות.
              </p>
            )}
          </>
        )}

        {delStep === "sent" && (
          <>
            <div className="bg-[#12241d] border border-[#22c08c]/30 rounded-lg p-3 space-y-1.5">
              <p className="text-sm font-black text-[#22c08c] flex items-center gap-1.5"><Check size={15} /> הבקשה נשלחה</p>
              <p className="text-xs text-[#c4c4d4] leading-relaxed">
                הגישה לחשבון נסגרה. הבקשה הגיעה אלינו ונטפל בה. אם זו הייתה טעות — פנו
                אלינו לפני שהמחיקה מבוצעת, והחשבון יוחזר בדיוק כמו שהיה.
              </p>
            </div>
            <button onClick={onDeleted} className="w-full bg-[#22252b] text-[#c4c4d4] font-bold py-2 rounded-lg text-sm">
              יציאה
            </button>
          </>
        )}
      </div>

    </>
  );
}
