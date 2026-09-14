import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  // A new stamp on every open and every refresh tap. The iframe URL must change or a
  // WebView shell happily serves yesterday's cached index.html — which is exactly how
  // the preview drifted behind the real waiter app (user, 30.8: "כרגע זה לא מעודכן").
  const stamp = useMemo(() => Date.now(), [nonce, open]);

  // The waiter app's own exit button, inside the frame, asks to be let out. It cannot
  // close this overlay itself — different origin — so it posts and we close.
  // ⚠️ The origin is checked: `*` on the sender is fine (it is asking to be dismissed and
  // leaks nothing), but accepting any message here would let any framed page close it.
  useEffect(() => {
    if (!open) return;
    const onMsg = (e) => {
      // Exact origin, not startsWith — "http://localhost:517" would pass a prefix test.
      if (e.origin !== new URL(WAITER_URL).origin) return;
      if (e.data?.type === "crewmenu:close-preview") setOpen(false);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open]);

  if (!open) {
    // Under the «אורורה» skin the trigger is the ghost pill next to the greeting, where
    // the approved design puts it; everywhere else it stays the header chip it has been.
    if (variant === "aurora")
      return (
        <button onClick={() => setOpen(true)} title="איך זה נראה אצל הצוות" data-tour="waiter-view" className="au-pill ghost flex-none">
          <span aria-hidden>📱</span> תצוגת מלצר
        </button>
      );
    return (
      <button
        onClick={() => setOpen(true)}
        title="איך זה נראה אצל הצוות"
        data-tour="waiter-view"
        className="flex items-center gap-1.5 bg-[#16181c] border border-[#22252b] rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[#8a8aa0] hover:text-[#eef0f6] transition"
      >
        <Smartphone size={13} />
        תצוגת מלצר
      </button>
    );
  }

  // 🔴 Portalled to <body>. Under the «אורורה» skin this overlay used to render inside
  // `.aurora-skin`, whose `isolation:isolate` seals it into that stacking context — so
  // the bottom nav's backdrop-filter layer painted OVER the preview (user, 30.8:
  // "השורה של הבית תפריט והגדרות מסתיר את התצוגה"). Same trap as every other
  // full-screen layer in this app; the portal is the fix, not a higher z-index.
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col" dir="rtl">
      {/* ⚠️ `min-w-0` + truncate על הטקסט: בלעדיו הכותרת דוחפת את שלושת הכפתורים
          ונשברת לשתי שורות בטלפון (נמדד: כותרת 78px, כותרת משנה בשתי שורות).
          ⚠️ 44px ולא 32 — רצפת מטרות ההקשה של הפרויקט, שהמסך הזה הפר. */}
      <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5 bg-[#16181c] border-b border-[#22252b]">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-[#eef0f6] truncate">תצוגת מלצר</p>
          <p className="text-[11px] text-[#8a8aa0] truncate">כך הצוות רואה את האפליקציה, חי</p>
        </div>
        <div className="flex items-center gap-1 flex-none">
          <button onClick={() => setNonce((n) => n + 1)} title="רענון" aria-label="רענון"
            className="w-11 h-11 rounded-xl bg-[#191b1f] flex items-center justify-center text-[#8a8aa0] active:scale-95 transition-transform">
            <RotateCw size={16} />
          </button>
          <a href={WAITER_URL} target="_blank" rel="noreferrer" title="פתיחה בחלון מלא" aria-label="פתיחה בחלון מלא"
            className="w-11 h-11 rounded-xl bg-[#191b1f] flex items-center justify-center text-[#8a8aa0] active:scale-95 transition-transform">
            <ExternalLink size={16} />
          </a>
          <button onClick={() => setOpen(false)} title="סגירה" aria-label="סגירה"
            className="w-11 h-11 rounded-xl bg-[#e0315a] flex items-center justify-center text-white active:scale-95 transition-transform">
            <X size={18} />
          </button>
        </div>
      </div>
      {/* Tapping anywhere OUTSIDE the phone bounces back to the owner app (user,
          2026-08-22) — the backdrop is the exit, the frame swallows its own clicks. */}
      <div
        className="flex-1 flex items-center justify-center p-0 sm:p-4 overflow-hidden"
        onClick={() => setOpen(false)}
      >
        {/* 🔴 טלפון בתוך טלפון. המנהל פותח את זה **מהטלפון שלו**, ואז מסגרת עם גבול
            של 6px וריפוד 16 גזלה 54px מהרוחב — האפליקציה קיבלה 321px מתוך 375 והכל
            נראה דחוס (נמדד). מהרוחב שבו יש באמת מקום למסגרת (sm) ומעלה היא חוזרת;
            בטלפון התצוגה היא מלוא המסך, וזה גם מה שהמלצר באמת רואה.
            ⚠️ בלי מסגרת אין «מחוץ לטלפון» להקיש עליו — ולכן ה-X חייב להיות 44px. */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full h-full bg-[#0c0d10] overflow-hidden sm:w-auto sm:max-h-[760px] sm:aspect-[9/19] sm:max-w-full sm:rounded-[28px] sm:border-[6px] sm:border-[#22252b] sm:shadow-2xl"
        >
          {/* ?preview=<team_code> opens the waiter app in read-only view mode (live since
              2026-08-23): a `role='preview'` session with no team member, so every write
              is refused by RLS. It overrides any waiter session stored in the iframe's
              localStorage and skips the profile/shift/brief gates. */}
          <iframe
            key={nonce}
            src={teamCode ? `${WAITER_URL}/?preview=${encodeURIComponent(teamCode)}&t=${stamp}` : `${WAITER_URL}/?t=${stamp}`}
            title="תצוגת אפליקציית הצוות"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
