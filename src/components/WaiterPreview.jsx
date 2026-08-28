import { useState } from "react";
import { Smartphone, X, RotateCw, ExternalLink } from "lucide-react";

// Live preview of the team (waiter) app inside the owner app (user request, 2026-08-20):
// the owner should always be able to see exactly what their waiters see. The real app is
// embedded in an iframe framed as a phone — no copy of the waiter UI is maintained here,
// so the preview can never drift from what the team actually gets. The owner signs into
// it with their own team_code, exactly like a waiter would; that session lives inside the
// iframe and does not touch the owner session.
const WAITER_URL = import.meta.env.DEV
  ? "http://localhost:5176"
  : "https://shiftcrew-waiter.vercel.app";

export default function WaiterPreview({ teamCode, variant }) {
  const [open, setOpen] = useState(false);
  // Bumping the key remounts the iframe — the only reliable cross-origin "refresh".
  const [nonce, setNonce] = useState(0);

  if (!open) {
    // Under the «אורורה» skin the trigger is the ghost pill next to the greeting, where
    // the approved design puts it; everywhere else it stays the header chip it has been.
    if (variant === "aurora")
      return (
        <button onClick={() => setOpen(true)} title="איך זה נראה אצל הצוות" className="au-pill ghost flex-none">
          <span aria-hidden>📱</span> תצוגת מלצר
        </button>
      );
    return (
      <button
        onClick={() => setOpen(true)}
        title="איך זה נראה אצל הצוות"
        className="flex items-center gap-1.5 bg-[#16181c] border border-[#22252b] rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[#8a8aa0] hover:text-[#eef0f6] transition"
      >
        <Smartphone size={13} />
        תצוגת מלצר
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" dir="rtl">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-[#16181c] border-b border-[#22252b]">
        <div>
          <p className="text-sm font-black text-[#eef0f6]">כך נראית האפליקציה אצל הצוות</p>
          <p className="text-[11px] text-[#8a8aa0]">
            זו האפליקציה האמיתית, חיה. לחיצה מחוץ לטלפון חוזרת לניהול
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setNonce((n) => n + 1)} title="רענון"
            className="w-8 h-8 rounded-lg bg-[#191b1f] flex items-center justify-center text-[#8a8aa0]">
            <RotateCw size={14} />
          </button>
          <a href={WAITER_URL} target="_blank" rel="noreferrer" title="פתיחה בחלון מלא"
            className="w-8 h-8 rounded-lg bg-[#191b1f] flex items-center justify-center text-[#8a8aa0]">
            <ExternalLink size={14} />
          </a>
          <button onClick={() => setOpen(false)} title="סגירה"
            className="w-8 h-8 rounded-lg bg-[#e0315a] flex items-center justify-center text-white">
            <X size={15} />
          </button>
        </div>
      </div>
      {/* Tapping anywhere OUTSIDE the phone bounces back to the owner app (user,
          2026-08-22) — the backdrop is the exit, the frame swallows its own clicks. */}
      <div
        className="flex-1 flex items-center justify-center p-4 overflow-hidden"
        onClick={() => setOpen(false)}
      >
        {/* A phone-shaped frame so it reads as "the waiter's phone", not a broken page. */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="h-full max-h-[760px] aspect-[9/19] max-w-full rounded-[28px] border-[6px] border-[#22252b] bg-[#0c0d10] overflow-hidden shadow-2xl"
        >
          {/* ?preview=<team_code> opens the waiter app in read-only view mode (live since
              2026-08-23): a `role='preview'` session with no team member, so every write
              is refused by RLS. It overrides any waiter session stored in the iframe's
              localStorage and skips the profile/shift/brief gates. */}
          <iframe
            key={nonce}
            src={teamCode ? `${WAITER_URL}/?preview=${encodeURIComponent(teamCode)}` : WAITER_URL}
            title="תצוגת אפליקציית הצוות"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
