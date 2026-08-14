import { useEffect, useState } from "react";
import { ChefHat, Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import OwnerLogin from "./auth/OwnerLogin";
import OwnerDashboard, { RESTAURANT_COLUMNS } from "./screens/OwnerDashboard";
import OperatorPanel from "./screens/OperatorPanel";
import { setSessionToken } from "./lib/appSession";

const SESSION_KEY = "menu-app-owner-session";
const db = supabase.schema("menu_app");

// Dev-only escape hatch to see the dashboard UI without a real login, for use while
// Supabase's Data API is down. Set VITE_DEV_BYPASS_AUTH=true in a gitignored .env.local
// to enable — never on by default, never committed enabled.
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

export default function App() {
  // Operator-only control board (?operator=1) — pending owner requests per restaurant,
  // each copyable as a ready-made Claude Code message. Never linked from the owner UI.
  if (new URLSearchParams(window.location.search).has("operator")) {
    return <OperatorPanel />;
  }
  return <OwnerApp />;
}

function OwnerApp() {
  const [phase, setPhase] = useState("loading"); // loading | login | app
  const [restaurant, setRestaurant] = useState(null);

  useEffect(() => {
    let alive = true;

    if (DEV_BYPASS_AUTH) {
      const demoRestaurant = {
        id: "demo-" + Math.random().toString(36).slice(2, 8),
        name: "Demo Restaurant",
        owner_code: "DEMO01"
      };
      if (alive) { setRestaurant(demoRestaurant); setPhase("app"); }
      return () => { alive = false; };
    }

    (async () => {
      const cached = localStorage.getItem(SESSION_KEY);
      if (!cached) { if (alive) setPhase("login"); return; }
      let session;
      try { session = JSON.parse(cached); } catch { session = null; }
      if (!session?.restaurantId) { localStorage.removeItem(SESSION_KEY); if (alive) setPhase("login"); return; }

      try {
        // maybeSingle, not single: a missing row here just means the saved session is
        // stale (restaurant deleted), which we handle by returning to login — it is not
        // an error worth throwing on.
        const { data, error } = await db.from("restaurants")
          .select(RESTAURANT_COLUMNS).eq("id", session.restaurantId).maybeSingle();
        if (error || !data) { localStorage.removeItem(SESSION_KEY); if (alive) setPhase("login"); return; }
        if (alive) { setRestaurant(data); setPhase("app"); }
      } catch {
        localStorage.removeItem(SESSION_KEY);
        if (alive) setPhase("login");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (phase === "loading") return <Splash />;
  if (phase === "login") return <OwnerLogin onGranted={(rest) => { setRestaurant(rest); setPhase("app"); }} />;

  return (
    <OwnerDashboard
      restaurant={restaurant}
      onRestaurantUpdated={(patch) => setRestaurant((prev) => ({ ...prev, ...patch }))}
      onSignOut={() => { localStorage.removeItem(SESSION_KEY); setSessionToken(null); setRestaurant(null); setPhase("login"); }}
    />
  );
}

function Splash() {
  return (
    <div className="min-h-screen bg-[#0c0d10] text-gray-100 max-w-md mx-auto flex flex-col items-center justify-center gap-4" dir="rtl">
      <div className="w-16 h-16 rounded-3xl bg-[#15302b] flex items-center justify-center">
        <ChefHat size={34} className="text-[#2f9e8f]" />
      </div>
      <Loader2 size={22} className="animate-spin text-gray-500" />
    </div>
  );
}
