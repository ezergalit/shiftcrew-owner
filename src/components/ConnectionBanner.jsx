import { useEffect, useState, useCallback } from "react";
import { WifiOff, RefreshCw, LogIn } from "lucide-react";
import { supabase } from "../lib/supabase";
import { onLoadError } from "../lib/loadError";

const db = supabase.schema("menu_app");

// Says out loud what used to be silent.
//
// ⚠️ Three different failures used to render as the SAME screen — an empty one:
//   1. the device is offline               → nothing loads
//   2. a query failed                      → `data` undefined, state set to []
//   3. the app-session token expired       → RLS resolves it to nothing, returns []
// with no error at all
// A waiter seeing an empty menu could not tell any of these from "the restaurant hasn't
// added dishes yet", and neither could the manager looking at their dashboard. Every one
// of them needs a different action, so every one of them needs to say which it is.
//
// Case 3 is the sneaky one: it is not an error anywhere in the stack. The only way to
// tell is to ask the server who we are — menu_app.session_restaurant() returns the
// restaurant id for a live token and NULL for a missing or expired one.

export default function ConnectionBanner({ restaurant, onSignOut }) {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [checking, setChecking] = useState(false);

  // Is our token still valid? Only meaningful when we believe we're signed in and online.
  const checkSession = useCallback(async () => {
    if (!restaurant?.id) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const { data, error } = await db.rpc("session_restaurant");
    if (error) return;              // a network blip is not an expiry — leave it to `failed`
    if (data == null) setExpired(true);
  }, [restaurant]);

  useEffect(() => {
    const goOnline = () => { setOffline(false); setFailed(false); };
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    // A failed read is the trigger to ask whether the token is still good — that is the
    // one moment we know something is wrong without knowing what.
    return onLoadError(() => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) { setOffline(true); return; }
      setFailed(true);
      checkSession();
    });
  }, [checkSession]);

  // Also check once on entry, because an expired token produces no error to react to.
  useEffect(() => { checkSession(); }, [checkSession]);

  const retry = async () => {
    setChecking(true);
    setFailed(false);
    await checkSession();
    setChecking(false);
    window.location.reload();
  };

  if (!offline && !failed && !expired) return null;

  // Expiry outranks the rest: reloading will not fix it, only signing in again will.
  const state = expired
    ? {
        icon: <LogIn size={15} />,
        text: "פג תוקף החיבור. התחברו שוב כדי להמשיך.",
        cta: "התחברות מחדש",
        onClick: onSignOut,
        bg: "#33291f", border: "#f3a712", fg: "#f3a712",
      }
    : offline
      ? {
          icon: <WifiOff size={15} />,
          text: "אין חיבור לאינטרנט. שינויים שתעשו כעת לא יישמרו.",
          cta: null,
          bg: "#2a2020", border: "#c85f5f", fg: "#e88a8a",
        }
      : {
          icon: <RefreshCw size={15} className={checking ? "animate-spin" : ""} />,
          text: "לא הצלחנו לטעון חלק מהנתונים. מה שריק כאן — לא בהכרח באמת ריק.",
          cta: checking ? "טוען…" : "נסו שוב",
          onClick: retry,
          bg: "#2a2020", border: "#c85f5f", fg: "#e88a8a",
        };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0"
      style={{ background: state.bg, borderColor: state.border }}
    >
      <span style={{ color: state.fg }} className="flex-shrink-0">{state.icon}</span>
      <span className="text-[11.5px] font-bold leading-snug flex-1" style={{ color: state.fg }}>
        {state.text}
      </span>
      {state.cta && (
        <button
          onClick={state.onClick}
          disabled={checking}
          className="text-[11.5px] font-black rounded-lg px-2.5 min-h-[32px] flex-shrink-0 active:scale-95 transition-transform"
          style={{ background: state.fg, color: state.bg }}
        >
          {state.cta}
        </button>
      )}
    </div>
  );
}
