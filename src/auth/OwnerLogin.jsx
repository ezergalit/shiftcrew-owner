import { useState } from "react";
import { ChefHat, Loader2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabase";

const SESSION_KEY = "menu-app-owner-session";
const db = supabase.schema("menu_app");

function toSession(restaurant) {
  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    ownerCode: restaurant.owner_code,
    teamCode: restaurant.team_code
  };
}

export default function OwnerLogin({ onGranted }) {
  const [mode, setMode] = useState("enter"); // enter | create
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setErr("");

    if (mode === "enter") {
      try {
        if (!code.trim() || !password.trim()) {
          setErr("חובה למלא קוד וסיסמא.");
          setBusy(false);
          return;
        }
        const { data, error } = await db.rpc("verify_owner_login", {
          p_owner_code: code.trim(),
          p_password: password
        });
        if (error) {
          console.error("Login error:", error);
          setErr("משהו השתבש. נסה/י שוב.");
          setBusy(false);
          return;
        }
        const restaurant = data?.[0];
        if (!restaurant) {
          setErr("קוד או סיסמא שגויים.");
          setBusy(false);
          return;
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify(toSession(restaurant)));
        onGranted(restaurant);
      } catch (e2) {
        console.error("Login error:", e2);
        setErr("משהו השתבש. נסה/י שוב.");
      } finally { setBusy(false); }
    } else {
      // Create new restaurant — fully open self-serve, no admin gate.
      try {
        if (!name.trim() || !password.trim() || !newCode.trim()) {
          setErr("חובה למלא שם מסעדה, קוד כניסה וסיסמא.");
          setBusy(false);
          return;
        }
        if (!/^[A-Za-z0-9]{4,12}$/.test(newCode.trim())) {
          setErr("קוד הכניסה: 4-12 תווים, אותיות באנגלית וספרות בלבד.");
          setBusy(false);
          return;
        }
        if (password.length < 4) {
          setErr("סיסמא חייבת להיות לפחות 4 תווים.");
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
        localStorage.setItem(SESSION_KEY, JSON.stringify(toSession(restaurant)));
        onGranted(restaurant);
      } catch (e2) {
        console.error("Creation error:", e2?.message || JSON.stringify(e2));
        setErr("יצירה נכשלה: " + (e2?.message || "שגיאה לא ידועה"));
      } finally { setBusy(false); }
    }
  };

  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="px-7 pt-[max(3.5rem,env(safe-area-inset-top))] pb-2 text-center">
        <div className="w-16 h-16 rounded-3xl text-white flex items-center justify-center mx-auto mb-4 bg-[#15302b]">
          <ChefHat size={32} />
        </div>
        <h1 className="text-3xl font-black leading-tight">Menu Trainer</h1>
        <p className="text-sm text-[#8a8aa0] font-semibold mt-2 leading-relaxed">
          מנהל תפריט + מאמן AI
        </p>
      </div>

      <form onSubmit={submit} className="flex-1 px-6 pt-4 flex flex-col">
        <div className="bg-[#16181c] border border-[#22252b] rounded-3xl shadow-[0_2px_14px_rgba(30,25,70,0.05)] p-5 space-y-4">
          <div className="flex gap-2 bg-[#1c1e22] rounded-2xl p-1">
            {[["enter", "הכנסה"], ["create", "יצירה"]].map(([m, label]) => (
              <button key={m} type="button" onClick={() => { setMode(m); setErr(""); }}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${
                  mode === m ? "bg-[#6d5efc] text-white shadow-sm" : "text-[#8a8aa0]"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {mode === "enter" ? (
            <>
              <div>
                <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">קוד בעלים</p>
                <input value={code} onChange={(e) => setCode(e.target.value)}
                  placeholder="לדוגמה: ABC123" dir="ltr" autoComplete="off"
                  className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-center placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
              </div>
              <div>
                <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">סיסמא</p>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••" autoComplete="off"
                    className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-center placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-3 text-[#8a8aa0]">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {err && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} /> {err}</p>}
              <button type="submit" disabled={!code.trim() || !password.trim() || busy}
                className={`w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 transition-colors ${
                  code.trim() && password.trim() && !busy ? "bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]" : "bg-[#22252b] text-[#b4b4c4] cursor-not-allowed"
                }`}>
                {busy ? <><Loader2 size={18} className="animate-spin" /> בדוק</> : "הכנסה"}
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">שם המסעדה</p>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="המסעדה שלי" dir="rtl"
                  className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
              </div>
              <div>
                <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">קוד כניסה — בחרו קוד שתזכרו</p>
                <input value={newCode} onChange={(e) => setNewCode(e.target.value)}
                  placeholder="לדוגמה: SALON2026" dir="ltr" autoComplete="off" autoCapitalize="characters"
                  className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-center placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
                <p className="text-[11px] text-[#8a8aa0] mt-1.5 px-1 leading-relaxed">
                  זה הקוד שתקלידו כדי להיכנס בפעם הבאה — 4-12 אותיות באנגלית וספרות.
                </p>
              </div>
              <div>
                <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">סיסמא של בעלים</p>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••" autoComplete="off"
                    className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-center placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-3 text-[#8a8aa0]">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {err && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} /> {err}</p>}
              <button type="submit" disabled={!name.trim() || !password.trim() || !newCode.trim() || busy}
                className={`w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 transition-colors ${
                  name.trim() && password.trim() && newCode.trim() && !busy ? "bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]" : "bg-[#22252b] text-[#b4b4c4] cursor-not-allowed"
                }`}>
                {busy ? <><Loader2 size={18} className="animate-spin" /> יוצר</> : "יצירה"}
              </button>
            </>
          )}
        </div>

        <p className="text-center text-[12px] text-[#8a8aa0] font-semibold mt-auto pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] leading-relaxed">
          Menu Trainer · ניהול תפריט + מאמן לימוד לצוות
        </p>
      </form>
    </div>
  );
}
