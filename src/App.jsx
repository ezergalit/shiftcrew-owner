import { useEffect, useState, useCallback } from "react";
import { ChefHat, Loader2, ShieldAlert, LogOut, ArrowLeft } from "lucide-react";
import { supabase } from "./lib/supabase";
import { getOwnerRestaurant } from "./lib/shiftcrew";
import OwnerLogin from "./auth/OwnerLogin";
import SetupWizard from "./screens/SetupWizard";
import MainApp from "./screens/MainApp";
import ProductTour from "./components/ProductTour";

// ─────────────────────────────────────────────────────────────────────────────
// App — the auth shell that gates everything. Flow:
//   loading → (no session) OwnerLogin
//           → (session) OWNER GATE: read the signed-in user's own
//             public.restaurant_owners row. RLS only returns it when
//             auth.uid() = id, so a waiter/non-owner simply gets nothing → denied.
//           → owner confirmed → getOwnerRestaurant (auto-links + creates the
//             ShiftCrew restaurant in the isolated shiftcrew_owner schema)
//           → first time (justCreated) → SetupWizard, then MainApp
//           → returning owner → MainApp (with a one-time guided ProductTour)
//
// We NEVER sign anyone up here and NEVER write to ShiftMatch's public tables —
// the gate is a pure read; all writes go to shiftcrew_owner.
// ─────────────────────────────────────────────────────────────────────────────

const TOUR_KEY = "shiftcrew-owner-tour-done";

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading|login|denied|setup|app
  const [owner, setOwner] = useState(null);       // { id, name, ... } from restaurant_owners
  const [restaurant, setRestaurant] = useState(null);
  const [showTour, setShowTour] = useState(false);

  // Resolve where a signed-in user should land (or deny them).
  const resolveSession = useCallback(async (session) => {
    if (!session?.user) { setPhase("login"); return; }
    const authId = session.user.id;
    try {
      // OWNER GATE — own restaurant_owners row (RLS: auth.uid() = id).
      const { data: ownerRow, error } = await supabase
        .from("restaurant_owners")
        .select("id, name, email")
        .eq("id", authId)
        .maybeSingle();
      if (error) throw error;
      if (!ownerRow) { setOwner(null); setPhase("denied"); return; }
      setOwner(ownerRow);

      // Auto-link / create the ShiftCrew restaurant.
      const rest = await getOwnerRestaurant(authId);
      setRestaurant(rest);

      if (rest.justCreated) {
        setPhase("setup");
      } else {
        setPhase("app");
        if (!localStorage.getItem(TOUR_KEY)) setShowTour(true);
      }
    } catch (err) {
      console.error("[shiftcrew] session resolve failed:", err);
      setPhase("denied");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) resolveSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (!session) { setOwner(null); setRestaurant(null); setShowTour(false); setPhase("login"); }
      else { setPhase("loading"); resolveSession(session); }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [resolveSession]);

  const signOut = async () => { await supabase.auth.signOut(); };

  const finishSetup = () => {
    setPhase("app");
    localStorage.setItem(TOUR_KEY, "1"); // wizard already taught them; skip the tour
  };

  const closeTour = () => {
    localStorage.setItem(TOUR_KEY, "1");
    setShowTour(false);
  };

  const ownerFirstName = owner?.name?.trim()?.split(/\s+/)[0] || "";

  if (phase === "loading") return <Splash />;
  if (phase === "login") return <OwnerLogin />;
  if (phase === "denied") return <Denied onSignOut={signOut} email={owner?.email} />;
  if (phase === "setup")
    return (
      <SetupWizard restaurant={restaurant} ownerName={ownerFirstName} onComplete={finishSetup} />
    );

  // phase === "app"
  return (
    <>
      <MainApp restaurant={restaurant} ownerName={ownerFirstName} onSignOut={signOut} />
      {showTour && <ProductTour onClose={closeTour} />}
    </>
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

// Shown when a signed-in user is NOT a ShiftMatch restaurant owner. They can sign
// out and try a different account. We never reveal anything beyond "not an owner".
function Denied({ onSignOut, email }) {
  return (
    <div className="min-h-screen bg-[#0c0d10] text-gray-100 max-w-md mx-auto flex flex-col items-center justify-center px-8 text-center" dir="rtl">
      <div className="w-20 h-20 rounded-3xl bg-[#3a1d22] flex items-center justify-center mb-6">
        <ShieldAlert size={38} className="text-[#f0788e]" />
      </div>
      <h1 className="text-2xl font-black">החשבון הזה אינו בעל מסעדה</h1>
      <p className="text-sm text-gray-400 mt-3 leading-relaxed max-w-xs">
        {email ? <span className="text-gray-300 font-bold" dir="ltr">{email}</span> : "החשבון"} אינו רשום
        כבעל/ת מסעדה ב-ShiftMatch. ShiftCrew למנהלים פתוח רק לבעלי מסעדות.
      </p>
      <p className="text-[13px] text-gray-500 mt-3 leading-relaxed max-w-xs">
        מלצר/ית? הכניסה למלצרים היא באפליקציה הנפרדת — עם מספר הטלפון שהמנהל/ת הוסיף/ה, בלי סיסמה.
      </p>
      <button onClick={onSignOut}
        className="mt-8 w-full max-w-xs rounded-2xl py-3.5 font-black text-base bg-[#191b1f] text-gray-200 active:bg-[#20232a] flex items-center justify-center gap-2">
        <LogOut size={18} /> התחברות עם חשבון אחר
      </button>
    </div>
  );
}
