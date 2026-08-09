import { useState } from "react";
import { ChefHat, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";

const SESSION_KEY = "menu-app-owner-session";

export default function OwnerLogin({ onGranted }) {
  const [mode, setMode] = useState("enter"); // enter | create
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setErr("");

    if (mode === "enter") {
      try {
        const { data, error } = await supabase.schema("menu_app")
          .from("restaurants").select("id, name, owner_code").eq("owner_code", code.trim()).single();
        if (error || !data) {
          setErr("קוד לא נמצא. בדוק/י ונסה/י שוב.");
          setBusy(false);
          return;
        }
        const session = { restaurantId: data.id, restaurantName: data.name, ownerCode: data.owner_code };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        onGranted(data);
      } catch (e2) {
        console.error(e2);
        setErr("משהו השתבש. נסה/י שוב.");
      } finally { setBusy(false); }
    } else {
      // Create new restaurant
      try {
        const ownerCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        const teamCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        const { data, error } = await supabase.schema("menu_app")
          .from("restaurants").insert({ name: name.trim(), owner_code: ownerCode, team_code: teamCode })
          .select("id, name, owner_code").single();
        if (error) throw error;
        const session = { restaurantId: data.id, restaurantName: data.name, ownerCode: data.owner_code };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        onGranted(data);
      } catch (e2) {
        console.error(e2);
        setErr("יצירה נכשלה. נסה/י שוב.");
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
              {err && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} /> {err}</p>}
              <button type="submit" disabled={!code.trim() || busy}
                className={`w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 transition-colors ${
                  code.trim() && !busy ? "bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]" : "bg-[#22252b] text-[#b4b4c4] cursor-not-allowed"
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
              {err && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} /> {err}</p>}
              <button type="submit" disabled={!name.trim() || busy}
                className={`w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 transition-colors ${
                  name.trim() && !busy ? "bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]" : "bg-[#22252b] text-[#b4b4c4] cursor-not-allowed"
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
