import { useState } from "react";
import { Loader2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import BrandMark from "../components/BrandMark";
import { supabase } from "../lib/supabase";
import { setSessionToken } from "../lib/appSession";
import { RESTAURANT_COLUMNS } from "../screens/OwnerDashboard";
import "../aurora.css";

const SESSION_KEY = "menu-app-owner-session";
const db = supabase.schema("menu_app");

// One rule, stated up front and enforced before submit: at least 8 characters, and not
// one of the handful of passwords everybody tries first. Browsers warn on those two
// things, and a warning that appears *after* the account exists is too late to act on.
// Deliberately no symbol/case requirements — they push people toward "Password1!" and a
// sticky note, and this guards a menu, not a bank.
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "qwertyui",
  "qwerty123", "11111111", "00000000", "abcd1234", "aa123456", "iloveyou",
  "sunshine", "princess", "football", "baseball", "welcome1", "admin123",
]);

export function passwordProblem(pw) {
  if (pw.length < 8) return "הסיסמה צריכה להיות באורך 8 תווים לפחות.";
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return "הסיסמה הזו נפוצה מדי — בחרו משהו אחר.";
  if (/^(.)\1+$/.test(pw)) return "הסיסמה לא יכולה להיות אותו תו שחוזר על עצמו.";
  return null;
}

function toSession(restaurant) {
  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    ownerCode: restaurant.owner_code,
    teamCode: restaurant.team_code,
    // NULL = the primary restaurant password matched; a name = a secondary
    // manager (owner_users). Account-destroying actions are primary-only,
    // so the session must remember which one this login was.
    loggedInAsName: restaurant.logged_in_as_name ?? null
  };
}

export default function OwnerLogin({ onGranted }) {
  const [mode, setMode] = useState("enter"); // enter | create
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Only gates account creation. Signing in never re-checks the rule — accounts made
  // before it exists must still be able to log in.
  const pwProblem = mode === "create" ? passwordProblem(password) : null;
  const [name, setName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // null | "ask" | "sent" — the tiny forgot-password flow under the login button.
  const [forgot, setForgot] = useState(null);

  const sendForgot = async () => {
    if (!code.trim()) { setErr("הקלידו את קוד הבעלים ואז לחצו שוב על \"שכחתי סיסמה\"."); return; }
    setBusy(true);
    try {
      // Always reports success server-side, so this screen can't be used to
      // probe which owner codes exist. The request lands in the operator queue.
      await db.rpc("forgot_password_request", { p_owner_code: code.trim() });
      setForgot("sent");
      setErr("");
    } catch (e2) {
      console.error("forgot password:", e2);
      setErr("משהו השתבש. נסו שוב.");
    } finally { setBusy(false); }
  };

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setErr("");

    if (mode === "enter") {
      try {
        if (!code.trim() || !password.trim()) {
          setErr("חובה למלא קוד וסיסמה.");
          setBusy(false);
          return;
        }
        // owner_login_v2 = the same credential checks as verify_owner_login,
        // plus a server-minted session token that RLS resolves on every request.
        const { data, error } = await db.rpc("owner_login_v2", {
          p_owner_code: code.trim(),
          p_password: password
        });
        if (error) {
          console.error("Login error:", error);
          setErr("משהו השתבש. נסו שוב.");
          setBusy(false);
          return;
        }
        // A pending deletion is not a wrong password, and saying so would send the
        // owner hunting for a typo instead of telling us they changed their mind.
        if (data?.error === "deletion_pending") {
          setErr("החשבון סומן למחיקה והגישה אליו סגורה. אם זו הייתה טעות — פנו אלינו והחשבון יוחזר.");
          setBusy(false);
          return;
        }
        const restaurant = data?.restaurant;
        if (!restaurant) {
          setErr("קוד או סיסמה שגויים.");
          setBusy(false);
          return;
        }
        setSessionToken(data.token);
        // The RPC returns a fixed profile that predates newer columns (owner_name,
        // trainee_code, tracked_flags…). Session restore always uses RESTAURANT_COLUMNS,
        // so a fresh login must too — otherwise the first day after every login runs on
        // a partial restaurant object. Token is set, so RLS lets this row through.
        const { data: full } = await db.from("restaurants")
          .select(RESTAURANT_COLUMNS).eq("id", restaurant.id).maybeSingle();
        // Merge, don't replace: logged_in_as_name exists only on the RPC result.
        const profile = full ? { ...restaurant, ...full } : restaurant;
        localStorage.setItem(SESSION_KEY, JSON.stringify(toSession(profile)));
        onGranted(profile);
      } catch (e2) {
        console.error("Login error:", e2);
        setErr("משהו השתבש. נסו שוב.");
      } finally { setBusy(false); }
    } else {
      // Create new restaurant — fully open self-serve, no admin gate.
      try {
        if (!name.trim() || !password.trim() || !newCode.trim()) {
          setErr("חובה למלא שם מסעדה, קוד כניסה וסיסמה.");
          setBusy(false);
          return;
        }
        if (!/^[A-Za-z0-9]{4,12}$/.test(newCode.trim())) {
          setErr("קוד הכניסה: 4-12 תווים, אותיות באנגלית וספרות בלבד.");
          setBusy(false);
          return;
        }
        const pwProblem = passwordProblem(password);
        if (pwProblem) {
          setErr(pwProblem);
          setBusy(false);
          return;
        }
        const { data, error } = await db.rpc("create_restaurant_account", {
          p_name: name.trim(),
          p_password: password,
          p_owner_code: newCode.trim().toUpperCase()
        });
        if (error) {
          console.error("Creation error:", error);
          throw new Error(error.message || "Failed to create restaurant");
        }
        const restaurant = data?.[0];
        if (!restaurant) {
          throw new Error("No data returned from create");
        }
        // The account exists but has no session yet — log in with the fresh
        // credentials to mint the token every subsequent request depends on.
        const { data: login } = await db.rpc("owner_login_v2", {
          p_owner_code: restaurant.owner_code,
          p_password: password
        });
        if (login?.token) setSessionToken(login.token);
        localStorage.setItem(SESSION_KEY, JSON.stringify(toSession(restaurant)));
        onGranted(restaurant);
      } catch (e2) {
        console.error("Creation error:", e2?.message || JSON.stringify(e2));
        setErr("יצירה נכשלה: " + (e2?.message || "שגיאה לא ידועה"));
      } finally { setBusy(false); }
    }
  };

  // The login screen used to be the last corner of the app still on the old purple look —
  // the first thing a manager saw was the design we had already retired (user, 16.9). It now
  // borrows the aurora backdrop and glass card from the screens right behind it.
  // 16px text in every input: below that iOS Safari zooms the page on focus.
  const field = "w-full h-[52px] rounded-2xl px-4 text-[16px] font-semibold text-[#eef0f6] bg-[rgba(238,240,246,0.05)] border border-[rgba(238,240,246,0.10)] placeholder:text-[rgba(238,240,246,0.28)] placeholder:font-normal outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-[rgba(34,192,140,0.6)] focus:bg-[rgba(34,192,140,0.05)] focus:shadow-[0_0_0_4px_rgba(34,192,140,0.12)]";
  const label = "block text-[13px] font-medium text-[#8a919e] mb-2 px-1";
  const primary = (ready) => `w-full h-[54px] rounded-2xl text-[16px] font-bold flex items-center justify-center gap-2 transition-[transform,background-color,box-shadow] duration-200 active:scale-[0.98] ${
    ready ? "bg-[#22c08c] text-[#06231a] shadow-[0_12px_30px_rgba(34,192,140,0.30)]" : "bg-[rgba(238,240,246,0.07)] text-[rgba(238,240,246,0.35)] cursor-not-allowed"
  }`;
  const errorBox = err && (
    <div role="alert" className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-[rgba(229,72,77,0.10)] border border-[rgba(229,72,77,0.30)] text-[13px] leading-relaxed text-[#f27d8d]">
      <AlertTriangle size={15} className="shrink-0 mt-0.5" />
      <span>{err}</span>
    </div>
  );
  // Operator model: restaurants don't sign themselves up — the operator opens the account
  // and hands over the code. The create tab stays for the operator (?signup=1); owners only
  // ever see the sign-in form, so a one-tab switcher no longer sits on top of it.
  const signup = new URLSearchParams(window.location.search).has("signup");
  const eye = (
    <button type="button" onClick={() => setShowPassword(!showPassword)}
      aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
      className="absolute left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-xl text-[#8a919e] active:bg-[rgba(238,240,246,0.06)]">
      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <div className="aurora-skin h-full flex flex-col text-[#eef0f6]" dir="rtl">
      <div className="aurora" aria-hidden><i></i><i></i><i></i><i></i></div>
      <div className="grain" aria-hidden></div>

      <form onSubmit={submit} className="flex-1 overflow-y-auto flex flex-col px-6 pt-[calc(env(safe-area-inset-top,0px)+4.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        <div className="text-center mb-8">
          <div className="relative w-[76px] h-[76px] mx-auto mb-5">
            <div className="absolute -inset-5 rounded-full bg-[radial-gradient(circle,rgba(34,192,140,0.28),transparent_68%)]" aria-hidden />
            <div className="relative w-full h-full rounded-[24px] bg-[#0F5C46] border border-[rgba(238,240,246,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.45)] flex items-center justify-center">
              <BrandMark size={46} />
            </div>
          </div>
          <h1 className="text-[32px] font-extrabold leading-none tracking-tight">CrewMenu</h1>
          <p className="text-[14px] text-[#8a919e] mt-3">ניהול תפריט והדרכת צוות</p>
        </div>

        <div className="glass">
          <div className="p-1 space-y-4">
            {signup && (
              <div className="flex gap-1 rounded-2xl p-1 bg-[rgba(238,240,246,0.05)] border border-[rgba(238,240,246,0.08)]">
                {[["enter", "כניסה"], ["create", "יצירה"]].map(([m, text]) => (
                  <button key={m} type="button" onClick={() => { setMode(m); setErr(""); }}
                    className={`flex-1 h-10 rounded-xl text-[14px] font-semibold transition-colors ${
                      mode === m ? "bg-[rgba(34,192,140,0.16)] text-[#22c08c]" : "text-[#8a919e]"
                    }`}>
                    {text}
                  </button>
                ))}
              </div>
            )}

            {mode === "enter" ? (
              <>
                <div>
                  <h2 className="text-[19px] font-bold">כניסה לניהול</h2>
                  <p className="text-[13px] text-[#8a919e] mt-1">עם קוד הבעלים והסיסמה של המסעדה</p>
                </div>
                <div>
                  <label htmlFor="owner-code" className={label}>קוד בעלים</label>
                  <input id="owner-code" value={code} onChange={(e) => setCode(e.target.value)}
                    placeholder="לדוגמה: ABC123" dir="ltr" autoComplete="off" autoCorrect="off" spellCheck={false}
                    className={`${field} text-center tracking-[0.12em] placeholder:tracking-normal`} />
                </div>
                <div>
                  <label htmlFor="owner-password" className={label}>סיסמה</label>
                  <div className="relative">
                    <input id="owner-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" autoComplete="off" dir="ltr"
                      className={`${field} text-center px-12`} />
                    {eye}
                  </div>
                </div>
                {errorBox}
                <button type="submit" disabled={!code.trim() || !password.trim() || busy}
                  className={primary(code.trim() && password.trim() && !busy)}>
                  {busy ? <><Loader2 size={18} className="animate-spin" /> מתחבר…</> : "כניסה"}
                </button>
                {forgot === "sent" ? (
                  <p className="text-[13px] text-[#22c08c] text-center leading-relaxed">
                    הבקשה נשלחה למפעיל — ניצור קשר עם סיסמה זמנית.
                  </p>
                ) : (
                  <button type="button" onClick={sendForgot} disabled={busy}
                    className="w-full text-center text-[13px] text-[#8a919e] py-1">
                    שכחתי סיסמה
                  </button>
                )}
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="new-name" className={label}>שם המסעדה</label>
                  <input id="new-name" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="המסעדה שלי" dir="rtl"
                    className={`${field} text-right`} />
                </div>
                <div>
                  <label htmlFor="new-code" className={label}>קוד כניסה — בחרו קוד שתזכרו</label>
                  <input id="new-code" value={newCode} onChange={(e) => setNewCode(e.target.value)}
                    placeholder="לדוגמה: SALON2026" dir="ltr" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                    className={`${field} text-center tracking-[0.12em] placeholder:tracking-normal`} />
                  <p className="text-[12px] text-[#8a919e] mt-2 px-1 leading-relaxed">
                    זה הקוד שתקלידו כדי להיכנס בפעם הבאה — 4-12 אותיות באנגלית וספרות.
                  </p>
                </div>
                <div>
                  <label htmlFor="new-password" className={label}>סיסמת בעלים</label>
                  <div className="relative">
                    <input id="new-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="לפחות 8 תווים" autoComplete="new-password" dir="ltr"
                      className={`${field} text-center px-12`} />
                    {eye}
                  </div>
                  {/* Stated before they type, and again the moment it's wrong — a rule you
                      only learn from a rejection is a rule you learn too late. */}
                  <p className={`text-[12px] mt-2 px-1 leading-relaxed ${password && pwProblem ? "text-[#f27d8d] font-semibold" : "text-[#8a919e]"}`}>
                    {password && pwProblem ? pwProblem : "8 תווים לפחות. אין דרישה לאותיות גדולות או סימנים."}
                  </p>
                </div>
                {errorBox}
                <button type="submit" disabled={!name.trim() || !!pwProblem || !newCode.trim() || busy}
                  className={primary(name.trim() && !pwProblem && newCode.trim() && !busy)}>
                  {busy ? <><Loader2 size={18} className="animate-spin" /> יוצר…</> : "יצירה"}
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-auto pt-10 text-center text-[12px] leading-relaxed text-[#6b7280]">
          הקוד והסיסמה מגיעים מאיתנו כשהחשבון נפתח.
        </p>
      </form>
    </div>
  );
}
