import { useState } from "react";
import { KeyRound, Trash2, Loader2, AlertTriangle, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { passwordProblem } from "../auth/OwnerLogin";

const db = supabase.schema("menu_app");

// Change-password + delete-account, at the bottom of the settings tab.
// Account deletion in-app is a hard requirement of both stores (Google Play
// UserData policy, App Store 5.1.1(v)) — without it the apps cannot ship.
// Both actions re-check the owner password server-side; holding a session is
// deliberately not enough to destroy an account.
export default function AccountSecurity({ ownerCode, onDeleted }) {
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }

  const [delOpen, setDelOpen] = useState(false);
  const [delPassword, setDelPassword] = useState("");
  const [delConfirmText, setDelConfirmText] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

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

  const deleteAccount = async () => {
    setDelBusy(true);
    setDelErr("");
    try {
      const { data, error } = await db.rpc("delete_restaurant_account", {
        p_owner_code: ownerCode, p_password: delPassword,
      });
      if (error) throw error;
      if (data?.ok) { onDeleted(); return; }
      setDelErr("הסיסמה שגויה.");
    } catch (e) {
      console.error("delete account:", e);
      setDelErr("משהו השתבש. נסו שוב.");
    } finally { setDelBusy(false); }
  };

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
        {!delOpen ? (
          <>
            <p className="text-xs text-[#8a8aa0] leading-relaxed">
              מחיקה מסירה לצמיתות את המסעדה, התפריט, חברי הצוות וכל נתוני הלמידה. אין שחזור.
            </p>
            <button
              onClick={() => setDelOpen(true)}
              className="w-full bg-[#2a1418] text-[#e0315a] font-bold py-2 rounded-lg text-sm border border-[#3a1c22] hover:bg-[#33181e] transition"
            >
              אני רוצה למחוק את החשבון
            </button>
          </>
        ) : (
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
            {delErr && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} /> {delErr}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setDelOpen(false); setDelPassword(""); setDelConfirmText(""); setDelErr(""); }}
                className="flex-1 bg-[#22252b] text-[#c4c4d4] font-bold py-2 rounded-lg text-sm"
              >
                ביטול
              </button>
              <button
                onClick={deleteAccount}
                disabled={delBusy || delConfirmText.trim() !== "מחיקה" || !delPassword}
                className="flex-1 bg-[#e0315a] text-white font-black py-2 rounded-lg text-sm disabled:opacity-40"
              >
                {delBusy ? <Loader2 size={14} className="animate-spin inline" /> : "מחיקה לצמיתות"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
