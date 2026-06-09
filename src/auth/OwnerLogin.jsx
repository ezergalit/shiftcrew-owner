import { useState } from "react";
import {
  ChefHat, Mail, Lock, Eye, EyeOff, ArrowLeft, Loader2, AlertTriangle,
  Sparkles, CalendarDays, Utensils, Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// OwnerLogin — the entry screen. Owners sign in with their EXISTING ShiftMatch
// account (same email + password). There is intentionally NO sign-up here:
//   • Creating an auth user would fire ShiftMatch's handle_new_user trigger and
//     pollute its production `public` tables — ShiftCrew must never do that.
//   • Only people who are already ShiftMatch restaurant owners may use ShiftCrew
//     owner. The owner-gate check (in App.jsx) enforces that AFTER sign-in.
// So this screen only ever calls signInWithPassword (a read, not an insert).
// ─────────────────────────────────────────────────────────────────────────────

export default function OwnerLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setErr(
        error.message?.toLowerCase().includes("invalid")
          ? "אימייל או סיסמה שגויים"
          : "ההתחברות נכשלה — נסה/י שוב"
      );
      setBusy(false);
    }
    // On success the auth state listener in App.jsx takes over (no setBusy needed).
  };

  return (
    <div className="min-h-screen bg-[#0c0d10] text-gray-100 max-w-md mx-auto flex flex-col" dir="rtl">
      {/* Brand hero */}
      <div className="px-7 pt-[max(3rem,env(safe-area-inset-top))] pb-2 text-center">
        <div className="w-16 h-16 rounded-3xl bg-[#15302b] flex items-center justify-center mx-auto mb-4">
          <ChefHat size={34} className="text-[#2f9e8f]" />
        </div>
        <h1 className="text-3xl font-black leading-tight">ShiftCrew</h1>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          ניהול צוות, סידור עבודה ותפריט חכם — למסעדות.
        </p>
      </div>

      {/* Login card */}
      <form onSubmit={submit} className="flex-1 px-6 pt-4 flex flex-col">
        <div className="bg-[#191b1f] rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#3fd0bc] bg-[#15302b] rounded-2xl px-3.5 py-2.5">
            <Sparkles size={15} />
            התחבר/י עם חשבון ShiftMatch הקיים שלך
          </div>

          <div>
            <p className="text-[12px] font-bold text-gray-500 mb-1.5 px-1">אימייל</p>
            <div className="flex items-center gap-2 bg-[#1c1e22] border border-[#22252b] rounded-2xl px-3.5 focus-within:border-[#2f9e8f]">
              <Mail size={17} className="text-gray-500 flex-shrink-0" />
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com" dir="ltr" autoComplete="email"
                className="w-full bg-transparent py-3.5 text-sm font-bold text-gray-100 text-left placeholder:text-gray-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <p className="text-[12px] font-bold text-gray-500 mb-1.5 px-1">סיסמה</p>
            <div className="flex items-center gap-2 bg-[#1c1e22] border border-[#22252b] rounded-2xl px-3.5 focus-within:border-[#2f9e8f]">
              <Lock size={17} className="text-gray-500 flex-shrink-0" />
              <input
                type={showPw ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" dir="ltr" autoComplete="current-password"
                className="w-full bg-transparent py-3.5 text-sm font-bold text-gray-100 text-left placeholder:text-gray-600 focus:outline-none"
              />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="text-gray-500 active:text-gray-300">
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {err && (
            <p className="text-[13px] font-bold text-[#f0788e] flex items-center gap-1.5">
              <AlertTriangle size={14} /> {err}
            </p>
          )}

          <button type="submit" disabled={!canSubmit}
            className={`w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 transition-colors ${
              canSubmit ? "bg-[#2a8576] text-white active:bg-[#247567]" : "bg-[#1c1e22] text-gray-600 cursor-not-allowed"}`}>
            {busy ? <><Loader2 size={18} className="animate-spin" /> מתחבר…</> : <>כניסה <ArrowLeft size={18} /></>}
          </button>
        </div>

        {/* What you get */}
        <div className="mt-5 space-y-2">
          {[
            [CalendarDays, "סידור עבודה שבועי לפי זמינות הצוות"],
            [Utensils, "תפריט חכם שה-AI הופך לתרגול יומי"],
            [Users, "גישה למלצרים לפי מספר טלפון — בלי הרשמה"],
          ].map(([Icon, t]) => (
            <div key={t} className="flex items-center gap-3 bg-[#14161a] border border-[#16181c] rounded-2xl px-4 py-3">
              <span className="flex-1 text-[13px] font-bold text-gray-300">{t}</span>
              <Icon size={17} className="text-[#2f9e8f] flex-shrink-0" />
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-gray-600 mt-auto pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] leading-relaxed">
          אין לך חשבון? פתח/י מסעדה דרך אפליקציית ShiftMatch.<br />
          רק בעלי מסעדות ב-ShiftMatch יכולים להיכנס לכאן.
        </p>
      </form>
    </div>
  );
}
