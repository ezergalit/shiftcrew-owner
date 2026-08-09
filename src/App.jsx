import { useEffect, useState } from "react";
import { ChefHat, Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import OwnerLogin from "./auth/OwnerLogin";
import MainApp from "./screens/MainApp";

const SESSION_KEY = "menu-app-owner-session";

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | login | app
  const [restaurant, setRestaurant] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = localStorage.getItem(SESSION_KEY);
      if (!cached) { if (alive) setPhase("login"); return; }
      let session;
      try { session = JSON.parse(cached); } catch { session = null; }
      if (!session?.restaurantId) { localStorage.removeItem(SESSION_KEY); if (alive) setPhase("login"); return; }

      try {
        const { data, error } = await supabase.schema("menu_app")
          .from("restaurants").select("id, name, owner_code")
          .eq("id", session.restaurantId).single();
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

  return <MainApp restaurant={restaurant} onSignOut={() => { localStorage.removeItem(SESSION_KEY); setPhase("login"); }} />;
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
