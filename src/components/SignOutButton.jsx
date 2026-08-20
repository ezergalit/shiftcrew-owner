import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";

// Signing out lived in the bottom nav, one slot away from "הגדרות" — a mis-tap on a phone
// dropped the owner back to the login screen mid-work. It moved to the top-right corner
// (user, 2026-08-20), out of the thumb's way, and the confirm button stays disabled for
// five seconds so the second tap can't land by momentum either.
//
// Same component and same wording as the waiter app's sign-out, on purpose: two apps that
// ask the same question should ask it the same way.
export default function SignOutButton({ onSignOut }) {
  const [open, setOpen] = useState(false);
  const [secs, setSecs] = useState(5);

  useEffect(() => {
    if (!open || secs <= 0) return;
    const t = setTimeout(() => setSecs((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [open, secs]);

  return (
    <>
      <button
        onClick={() => { setSecs(5); setOpen(true); }}
        title="התנתקות"
        aria-label="התנתקות"
        className="w-9 h-9 rounded-lg bg-[#191b1f] border border-[#22252b] flex items-center justify-center text-[#8a8aa0] hover:text-[#eef0f6] transition flex-shrink-0"
      >
        <LogOut size={16} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6" dir="rtl">
          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-5 w-full max-w-xs text-center space-y-3">
            <p className="text-sm font-black text-[#eef0f6]">להתנתק מהחשבון?</p>
            <p className="text-[11px] text-[#8a8aa0] leading-relaxed">
              התפריט, הצוות וההגדרות נשמרים — בכניסה הבאה מזינים שוב את קוד הבעלים והסיסמה.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-[#22252b] text-[#eef0f6] text-xs font-black"
              >
                ביטול
              </button>
              <button
                onClick={onSignOut}
                disabled={secs > 0}
                className={`flex-1 py-2.5 min-h-[44px] rounded-xl text-xs font-black transition-colors ${
                  secs > 0 ? "bg-[#1c1e22] text-[#5a5a6e]" : "bg-[#e0315a] text-white"
                }`}
              >
                {secs > 0 ? `התנתקות (${secs})` : "התנתקות מהחשבון"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
