import { useState, useEffect } from "react";
import { Home, BookOpen, FileText, Users, Settings, LogOut, Plus, Edit2, Trash2, Check, AlertTriangle, ChefHat, ClipboardPaste, X, UserPlus } from "lucide-react";
import CuisineSelector from "../components/CuisineSelector";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");
export const RESTAURANT_COLUMNS = "id, name, owner_code, team_code, created_at, phone, address, description, cuisine_types, important_allergens, service_style, service_notes, onboarding_completed";

function fromDbRestaurant(r) {
  return {
    name: r.name || "",
    phone: r.phone || "",
    address: r.address || "",
    description: r.description || "",
    cuisineTypes: r.cuisine_types || [],
    importantAllergens: r.important_allergens || [],
    serviceStyle: r.service_style || "",
    serviceNotes: r.service_notes || ""
  };
}

function toDbRestaurantPatch(form) {
  return {
    name: form.name,
    phone: form.phone || null,
    address: form.address || null,
    description: form.description || null,
    cuisine_types: form.cuisineTypes || [],
    important_allergens: form.importantAllergens || [],
    service_style: form.serviceStyle || null,
    service_notes: form.serviceNotes || null
  };
}

function dishFromDb(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    description: row.description || "",
    allergens: row.allergens || [],
    isSpecial: !!row.is_special
  };
}

const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום"];

// Service style / hospitality tone — phrased respectfully, no value judgment ("cheap" vs "expensive"),
// just how formal vs. relaxed the team's approach to guests should feel.
const SERVICE_STYLES = [
  {
    id: "elegant",
    title: "אירוח מהודר ומוקפד",
    desc: "שירות קשוב לפרטים הקטנים, טון מכובד ואווירה אלגנטית לאורך כל הביקור."
  },
  {
    id: "warm",
    title: "חם ומשפחתי",
    desc: "יחס אישי וקרוב, כמו אצל חברים — נעים, פשוט וללא רשמיות מיותרת."
  },
  {
    id: "lively",
    title: "אנרגטי וקליל",
    desc: "קצב מהיר וידידותי, אווירה תוססת ושירות זריז."
  }
];

// Heuristic menu parser: any line ending in a price becomes a dish under the current
// category; any line without a price starts a new category. Deliberately simple and
// predictable (not an LLM) — the review step right after is where the owner fixes
// whatever it gets wrong, fast.
const PRICE_RE = /(?:₪|ש"ח|שקל)?\s*(\d{2,4})\s*(?:₪|ש"ח)?\s*$/;

function parseMenuText(raw) {
  const lines = (raw || "").split("\n").map((l) => l.trim());
  const categories = [];
  let current = null;

  const ensureCurrent = (name) => {
    current = { id: crypto.randomUUID(), name: name || "כללי", dishes: [] };
    categories.push(current);
  };

  for (const line of lines) {
    if (!line) continue;
    const priceMatch = line.match(PRICE_RE);
    if (priceMatch) {
      const price = Number(priceMatch[1]);
      const name = line.slice(0, priceMatch.index).replace(/[-–—.:]+$/, "").trim();
      if (!current) ensureCurrent("כללי");
      if (name) current.dishes.push({ id: crypto.randomUUID(), name, price, description: "" });
      continue;
    }
    ensureCurrent(line);
  }

  return categories.filter((c) => c.dishes.length > 0);
}

export default function OwnerDashboard({ restaurant, onSignOut, onRestaurantUpdated }) {
  const [tab, setTab] = useState("home"); // home | menu | details | team | settings
  const [onboarding, setOnboarding] = useState(false); // true if first time setup needed
  const [menuSetupActive, setMenuSetupActive] = useState(false);
  const [showMenuTip, setShowMenuTip] = useState(false);

  // Menu state
  const [items, setItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Restaurant details
  const [details, setDetails] = useState(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({});

  // Team
  const [teamMembers, setTeamMembers] = useState([]);
  const [leaderboardByMember, setLeaderboardByMember] = useState({});
  const [briefReadsToday, setBriefReadsToday] = useState(new Set());

  // Daily brief
  const [dailyBrief, setDailyBrief] = useState({ missing_items: [], new_items: [], oven_items: [], notes: "" });
  const [briefDraft, setBriefDraft] = useState({ missing: "", newItems: "", oven: "", notes: "" });
  const [savingBrief, setSavingBrief] = useState(false);

  // Additional manager users
  const [ownerUsers, setOwnerUsers] = useState([]);
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("");
  const [addingManager, setAddingManager] = useState(false);
  const [managerErr, setManagerErr] = useState("");

  // Onboarding form (trimmed: only fields relevant to the menu itself — no address, no phone)
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: restaurant profile, 2: service style, 3: done
  const [onboardingForm, setOnboardingForm] = useState({
    name: restaurant?.name || "",
    cuisineTypes: [],
    description: "",
    serviceStyle: "",
    serviceNotes: ""
  });

  const today = new Date().toISOString().slice(0, 10);

  // Check if first time setup + keep `details` in sync with the canonical restaurant object
  useEffect(() => {
    if (!restaurant) return;
    setDetails(fromDbRestaurant(restaurant));
    if (!restaurant.onboarding_completed) {
      setOnboarding(true);
    }
  }, [restaurant]);

  // Re-fetch just the menu (used after the paste-a-menu tutorial bulk-inserts dishes
  // directly via Supabase, bypassing the `items` state entirely — without this, the
  // Menu tab would show "no dishes yet" right after a successful import).
  const loadMenuItems = async () => {
    if (!restaurant?.id) return;
    const { data, error } = await db.from("menu_items")
      .select("*").eq("restaurant_id", restaurant.id).order("created_at");
    if (!error) setItems((data || []).map(dishFromDb));
  };

  // Load menu items + team members + leaderboard + today's brief-reads + brief + managers
  useEffect(() => {
    if (!restaurant?.id) return;
    let alive = true;
    (async () => {
      const { data: menuData, error: menuErr } = await db.from("menu_items")
        .select("*").eq("restaurant_id", restaurant.id).order("created_at");
      if (alive && !menuErr) setItems((menuData || []).map(dishFromDb));

      const { data: teamData, error: teamErr } = await db.from("team_members")
        .select("*").eq("restaurant_id", restaurant.id).order("created_at");
      if (alive && !teamErr) setTeamMembers(teamData || []);

      const { data: lbData } = await db.from("leaderboard")
        .select("team_member_id, points, mastered_count, today_count, last_study_date")
        .eq("restaurant_id", restaurant.id);
      if (alive && lbData) {
        const map = {};
        lbData.forEach((r) => { map[r.team_member_id] = r; });
        setLeaderboardByMember(map);
      }

      const { data: readsData } = await db.from("daily_brief_reads")
        .select("team_member_id").eq("restaurant_id", restaurant.id).eq("date", today);
      if (alive && readsData) setBriefReadsToday(new Set(readsData.map((r) => r.team_member_id)));

      const { data: briefData } = await db.from("daily_brief")
        .select("*").eq("restaurant_id", restaurant.id).eq("date", today).maybeSingle();
      if (alive && briefData) {
        setDailyBrief(briefData);
        setBriefDraft({
          missing: (briefData.missing_items || []).join(", "),
          newItems: (briefData.new_items || []).join(", "),
          oven: (briefData.oven_items || []).join(", "),
          notes: briefData.notes || ""
        });
      }

      const { data: usersData } = await db.from("owner_users")
        .select("id, name, created_at").eq("restaurant_id", restaurant.id).order("created_at");
      if (alive && usersData) setOwnerUsers(usersData);
    })();
    return () => { alive = false; };
  }, [restaurant?.id]);

  const existingCategories = [...new Set(items.map((i) => i.category).filter(Boolean))];

  // Handle new dish form
  const handleAddDish = () => {
    setShowAddForm(true);
    setEditingItem({
      name: "",
      category: existingCategories[0] || "עיקריות",
      price: 0,
      description: "",
      allergens: [],
      isSpecial: false
    });
  };

  const handleSaveDish = async () => {
    if (!editingItem.name.trim()) {
      alert("שם המנה חובה");
      return;
    }
    const payload = {
      restaurant_id: restaurant.id,
      name: editingItem.name.trim(),
      category: (editingItem.category || "כללי").trim(),
      price: editingItem.price,
      description: editingItem.description || "",
      allergens: editingItem.allergens || [],
      is_special: !!editingItem.isSpecial
    };

    if (editingItem.id) {
      const { error } = await db.from("menu_items").update(payload).eq("id", editingItem.id);
      if (error) { alert("שמירה נכשלה: " + error.message); return; }
      setItems(items.map((i) => (i.id === editingItem.id ? { ...i, ...dishFromDb({ ...payload, id: editingItem.id }) } : i)));
    } else {
      // The insert genuinely needs the generated id back, but take the first row rather
      // than `.single()` so an unexpected empty response degrades into a refetch instead
      // of a cryptic coerce error.
      const { data, error } = await db.from("menu_items").insert(payload).select();
      if (error) { alert("שמירה נכשלה: " + error.message); return; }
      const row = data?.[0];
      if (row) setItems([...items, dishFromDb(row)]);
      else await loadMenuItems();
    }
    setEditingItem(null);
    setShowAddForm(false);
  };

  const handleDeleteDish = async (id) => {
    const { error } = await db.from("menu_items").delete().eq("id", id);
    if (error) { alert("מחיקה נכשלה: " + error.message); return; }
    setItems(items.filter((item) => item.id !== id));
  };

  // NOTE: these deliberately do NOT use `.select(...).single()` after the update.
  // `.single()` throws "Cannot coerce the result to a single JSON object" whenever the
  // UPDATE returns zero rows for *any* reason, which surfaced to owners as an opaque
  // "שמירה נכשלה" that stranded them mid-onboarding even though the write had gone
  // through. The patch is already known client-side, so merge it locally instead of
  // depending on a round-trip that can come back empty.
  const handleSaveDetails = async () => {
    const patch = toDbRestaurantPatch(detailsForm);
    const { error } = await db.from("restaurants").update(patch).eq("id", restaurant.id);
    if (error) { alert("שמירה נכשלה: " + error.message); return; }
    const updated = { ...restaurant, ...patch };
    setDetails(fromDbRestaurant(updated));
    setEditingDetails(false);
    onRestaurantUpdated?.(updated);
  };

  const handleCompleteOnboarding = async () => {
    const patch = { ...toDbRestaurantPatch(onboardingForm), onboarding_completed: true };
    const { error } = await db.from("restaurants").update(patch).eq("id", restaurant.id);
    if (error) { alert("שמירה נכשלה: " + error.message); return; }
    const updated = { ...restaurant, ...patch };
    setDetails(fromDbRestaurant(updated));
    onRestaurantUpdated?.(updated);
    setOnboarding(false);
    // Straight into the menu-setup tutorial for a brand-new restaurant with no dishes yet.
    setMenuSetupActive(true);
  };

  const handleMenuSetupDone = async (count) => {
    if (count > 0) await loadMenuItems();
    setMenuSetupActive(false);
    setTab("menu");
    if (count > 0) setShowMenuTip(true);
  };

  const handleSaveBrief = async () => {
    setSavingBrief(true);
    const toArr = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
    const patch = {
      restaurant_id: restaurant.id,
      date: today,
      missing_items: toArr(briefDraft.missing),
      new_items: toArr(briefDraft.newItems),
      oven_items: toArr(briefDraft.oven),
      notes: briefDraft.notes,
      updated_at: new Date().toISOString()
    };
    const { error } = await db.from("daily_brief")
      .upsert(patch, { onConflict: "restaurant_id,date" });
    setSavingBrief(false);
    if (error) { alert("שמירה נכשלה: " + error.message); return; }
    setDailyBrief(patch);
  };

  const handleAddManager = async () => {
    setManagerErr("");
    if (!newManagerName.trim() || !newManagerPassword.trim()) {
      setManagerErr("חובה למלא שם וסיסמא.");
      return;
    }
    if (newManagerPassword.length < 4) {
      setManagerErr("סיסמא חייבת להיות לפחות 4 תווים.");
      return;
    }
    setAddingManager(true);
    const { data, error } = await db.rpc("add_owner_user", {
      p_restaurant_id: restaurant.id,
      p_name: newManagerName.trim(),
      p_password: newManagerPassword
    });
    setAddingManager(false);
    if (error) { setManagerErr("הוספה נכשלה: " + error.message); return; }
    const user = data?.[0];
    if (user) setOwnerUsers([...ownerUsers, { ...user, created_at: new Date().toISOString() }]);
    setNewManagerName("");
    setNewManagerPassword("");
  };

  // Menu setup tutorial (paste-a-menu, auto-categorize, fast review) — shown once
  // right after onboarding for a brand-new restaurant with no dishes yet.
  if (menuSetupActive) {
    return <MenuSetupTutorial restaurant={restaurant} onDone={handleMenuSetupDone} />;
  }

  // Onboarding Tutorial
  if (onboarding) {
    return (
      <div className="h-screen max-w-md mx-auto bg-[#0c0d10] text-[#eef0f6] flex flex-col" dir="rtl">
        <div className="px-6 pt-8 pb-4 text-center border-b border-[#22252b]">
          <div className="w-12 h-12 rounded-2xl bg-[#15302b] flex items-center justify-center mx-auto mb-3">
            <ChefHat size={24} className="text-[#2f9e8f]" />
          </div>
          <h1 className="text-2xl font-black">בואו נהגדיר את המסעדה שלך</h1>
          <p className="text-sm text-[#8a8aa0] mt-1">שלב {onboardingStep} מתוך 3</p>
        </div>

        <div className="flex-1 px-6 py-8 overflow-y-auto">
          {onboardingStep === 1 && (
            <div className="space-y-5">
              <div>
                <label className="text-xs font-bold text-[#8a8aa0] block mb-2">שם המסעדה</label>
                <input
                  type="text"
                  value={onboardingForm.name}
                  onChange={(e) => setOnboardingForm({ ...onboardingForm, name: e.target.value })}
                  placeholder="שם המסעדה"
                  className="w-full bg-[#16181c] border border-[#22252b] rounded-xl px-3 py-3 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc]"
                  dir="rtl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#8a8aa0] block mb-2">סוג המטבח / קונספט</label>
                <CuisineSelector
                  selected={onboardingForm.cuisineTypes}
                  onChange={(cuisineTypes) => setOnboardingForm({ ...onboardingForm, cuisineTypes })}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#8a8aa0] block mb-2">תיאור המסעדה</label>
                <textarea
                  value={onboardingForm.description}
                  onChange={(e) => setOnboardingForm({ ...onboardingForm, description: e.target.value })}
                  placeholder="ספרו לנו על המסעדה שלכם..."
                  className="w-full bg-[#16181c] border border-[#22252b] rounded-xl px-3 py-3 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] resize-none"
                  rows="3"
                  dir="rtl"
                />
              </div>
            </div>
          )}

          {onboardingStep === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-[#eef0f6] mb-1">איך תרצו שהצוות יתייחס לאורחים?</h2>
                <p className="text-sm text-[#8a8aa0]">זה עוזר לצוות להבין את סגנון האירוח הנכון — אין תשובה נכונה או לא נכונה, רק מה שמתאים לכם.</p>
              </div>

              <div className="space-y-3">
                {SERVICE_STYLES.map((style) => {
                  const active = onboardingForm.serviceStyle === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setOnboardingForm({ ...onboardingForm, serviceStyle: style.id })}
                      className={`w-full text-right p-4 rounded-xl border transition ${
                        active
                          ? "bg-[#6d5efc]/10 border-[#6d5efc]"
                          : "bg-[#16181c] border-[#22252b] hover:border-[#3a3d45]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`font-bold mb-1 ${active ? "text-[#a79bff]" : "text-[#eef0f6]"}`}>{style.title}</p>
                          <p className="text-xs text-[#8a8aa0] leading-relaxed">{style.desc}</p>
                        </div>
                        <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                          active ? "border-[#6d5efc] bg-[#6d5efc]" : "border-[#3a3d45]"
                        }`}>
                          {active && <Check size={12} className="text-white" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="text-xs font-bold text-[#8a8aa0] block mb-2">משהו נוסף שחשוב שהצוות ידע על סגנון השירות? (לא חובה)</label>
                <textarea
                  value={onboardingForm.serviceNotes}
                  onChange={(e) => setOnboardingForm({ ...onboardingForm, serviceNotes: e.target.value })}
                  placeholder="לדוגמה: לפנות ללקוחות בשמם הפרטי, להציע יין מומלץ, לוודא שהילדים מקבלים תשומת לב מיוחדת..."
                  className="w-full bg-[#16181c] border border-[#22252b] rounded-xl px-3 py-3 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] resize-none"
                  rows="3"
                  dir="rtl"
                />
              </div>
            </div>
          )}

          {onboardingStep === 3 && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#6d5efc]/20 flex items-center justify-center mx-auto">
                <Check size={32} className="text-[#6d5efc]" />
              </div>
              <h2 className="text-xl font-bold">כל מוכן!</h2>
              <p className="text-[#8a8aa0] text-sm">המסעדה שלך מוכנה להתחיל. בואו נוסיף את התפריט שלך!</p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 space-y-3 border-t border-[#22252b] pt-4">
          {onboardingStep < 3 && (
            <>
              <button
                onClick={() => setOnboardingStep(onboardingStep + 1)}
                className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition"
              >
                הבא
              </button>
              {onboardingStep > 1 && (
                <button
                  onClick={() => setOnboardingStep(onboardingStep - 1)}
                  className="w-full bg-[#22252b] text-[#8a8aa0] font-bold py-3 rounded-lg hover:bg-[#2c2e35] transition"
                >
                  חזרה
                </button>
              )}
            </>
          )}
          {onboardingStep === 3 && (
            <button
              onClick={handleCompleteOnboarding}
              className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition"
            >
              בואו נתחיל!
            </button>
          )}
        </div>
      </div>
    );
  }

  // Main App
  return (
    <div className="h-screen max-w-md mx-auto bg-[#0c0d10] text-[#eef0f6] flex flex-col" dir="rtl">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[#22252b]">
        <h1 className="text-xl font-black">{restaurant?.name || "המסעדה שלי"}</h1>
        <p className="text-xs text-[#8a8aa0]">
          קוד בעלים: {restaurant?.owner_code}
          {restaurant?.logged_in_as_name && <> · מחובר/ת כ{restaurant.logged_in_as_name}</>}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tab === "home" && (
          <div className="space-y-4">
            <div className="bg-[#16181c] rounded-2xl p-4 border border-[#22252b]">
              <h2 className="font-bold text-lg mb-2">ברוכים הבאים!</h2>
              <p className="text-sm text-[#8a8aa0] mb-4">צוות של {teamMembers.length} מלצרים חכמים לומדים את התפריט שלך.</p>
              <button
                onClick={() => setTab("menu")}
                className="w-full bg-[#6d5efc] text-white font-bold py-2 rounded-lg text-sm hover:bg-[#5b4ef0] transition"
              >
                ניהול תפריט
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#16181c] rounded-lg p-3 border border-[#22252b]">
                <p className="text-2xl font-bold text-[#6d5efc]">{items.length}</p>
                <p className="text-xs text-[#8a8aa0]">מנות בתפריט</p>
              </div>
              <div className="bg-[#16181c] rounded-lg p-3 border border-[#22252b]">
                <p className="text-2xl font-bold text-[#6d5efc]">{teamMembers.length}</p>
                <p className="text-xs text-[#8a8aa0]">חברי צוות</p>
              </div>
            </div>

            <DailyBriefEditor draft={briefDraft} onChange={setBriefDraft} onSave={handleSaveBrief} saving={savingBrief} />
          </div>
        )}

        {tab === "menu" && (
          <div className="space-y-3">
            {showMenuTip && (
              <div className="bg-[#6d5efc]/10 border border-[#6d5efc]/40 rounded-lg p-3 flex items-start justify-between gap-2">
                <p className="text-xs text-[#a79bff] leading-relaxed">התפריט יובא בהצלחה! מכאן תוכלו תמיד להוסיף, לערוך או למחוק מנות עם הכפתור "הוסף מנה".</p>
                <button onClick={() => setShowMenuTip(false)} className="text-[#8a8aa0] shrink-0"><X size={14} /></button>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleAddDish}
                className="flex-1 bg-[#6d5efc] text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-[#5b4ef0] transition text-sm"
              >
                <Plus size={18} /> הוסף מנה
              </button>
              <button
                onClick={() => setMenuSetupActive(true)}
                className="bg-[#22252b] text-[#8a8aa0] font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-[#2c2e35] transition text-sm"
                title="ייבוא תפריט מהיר מהדבקת טקסט"
              >
                <ClipboardPaste size={16} />
              </button>
            </div>

            {showAddForm && (
              <DishForm
                item={editingItem}
                onChange={setEditingItem}
                onSave={handleSaveDish}
                onCancel={() => { setShowAddForm(false); setEditingItem(null); }}
                existingCategories={existingCategories}
              />
            )}

            {existingCategories.length === 0 && items.length === 0 && (
              <p className="text-sm text-[#8a8aa0] text-center py-6">עדיין אין מנות בתפריט. הוסיפו מנה או ייבאו את התפריט בבת אחת.</p>
            )}

            {existingCategories.map((cat) => (
              <div key={cat} className="space-y-2">
                <p className="text-xs font-bold text-[#8a8aa0] px-1">{cat}</p>
                {items.filter((i) => i.category === cat).map((item) => (
                  <div key={item.id} className="bg-[#16181c] rounded-lg p-3 border border-[#22252b]">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-[#eef0f6]">{item.name}</p>
                      <p className="font-bold text-[#6d5efc]">₪{item.price}</p>
                    </div>
                    {item.allergens?.length > 0 && (
                      <p className="text-xs text-[#ff7a59] mb-2">אלרגנים: {item.allergens.join(", ")}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingItem(item); setShowAddForm(true); }}
                        className="flex-1 bg-[#22252b] text-[#6d5efc] py-1 rounded text-xs hover:bg-[#2c2e35] transition"
                      >
                        <Edit2 size={14} className="inline mr-1" /> עריכה
                      </button>
                      <button
                        onClick={() => handleDeleteDish(item.id)}
                        className="flex-1 bg-[#22252b] text-[#e0315a] py-1 rounded text-xs hover:bg-[#2c2e35] transition"
                      >
                        <Trash2 size={14} className="inline mr-1" /> מחיקה
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === "details" && (
          <div className="space-y-4">
            {!editingDetails ? (
              <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b] space-y-3">
                <div>
                  <p className="text-xs font-bold text-[#8a8aa0]">שם המסעדה</p>
                  <p className="text-[#eef0f6] font-bold">{details?.name || "לא מוגדר"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#8a8aa0] mb-1.5">סוג המטבח</p>
                  {details?.cuisineTypes?.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {details.cuisineTypes.map((c) => (
                        <span key={c} className="bg-[#6d5efc]/15 border border-[#6d5efc]/40 text-[#a79bff] text-xs font-bold px-2.5 py-1 rounded-full">
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[#eef0f6]">לא מוגדר</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-[#8a8aa0]">תיאור</p>
                  <p className="text-[#eef0f6]">{details?.description || "לא מוגדר"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#8a8aa0]">סגנון האירוח</p>
                  <p className="text-[#eef0f6]">{SERVICE_STYLES.find((s) => s.id === details?.serviceStyle)?.title || "לא מוגדר"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#8a8aa0]">טלפון</p>
                  <p className="text-[#eef0f6]">{details?.phone || "לא מוגדר"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#8a8aa0]">כתובת</p>
                  <p className="text-[#eef0f6]">{details?.address || "לא מוגדר"}</p>
                </div>
                <button
                  onClick={() => { setEditingDetails(true); setDetailsForm(details || {}); }}
                  className="w-full bg-[#6d5efc] text-white font-bold py-2 rounded-lg text-sm hover:bg-[#5b4ef0] transition"
                >
                  <Edit2 size={14} className="inline mr-1" /> עריכה
                </button>
              </div>
            ) : (
              <DetailsForm
                form={detailsForm}
                onChange={setDetailsForm}
                onSave={handleSaveDetails}
                onCancel={() => setEditingDetails(false)}
              />
            )}
          </div>
        )}

        {tab === "team" && (
          <div className="space-y-3">
            <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b]">
              <p className="text-xs font-bold text-[#8a8aa0] mb-1">קוד הצוות</p>
              <p className="text-2xl font-black text-[#6d5efc] mb-3">{restaurant?.team_code || "???"}</p>
              <p className="text-xs text-[#8a8aa0]">שתפו את הקוד הזה עם הצוות שלכם להצטרפות</p>
            </div>

            <div>
              <p className="text-xs font-bold text-[#8a8aa0] mb-3">פעילות היום ({teamMembers.length} חברי צוות)</p>
              <div className="space-y-2">
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-[#8a8aa0]">עדיין אין חברי צוות. שתפו את הקוד להצטרפות!</p>
                ) : (
                  teamMembers.map((member) => {
                    const lb = leaderboardByMember[member.id];
                    const didChallenge = lb?.last_study_date === today && (lb?.today_count || 0) >= 3;
                    const readBrief = briefReadsToday.has(member.id);
                    return (
                      <div key={member.id} className="bg-[#16181c] rounded-lg p-3 border border-[#22252b]">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-bold text-[#eef0f6]">{member.name}</p>
                          <p className="text-xs text-[#8a8aa0]">{lb?.mastered_count || 0} מנות נלמדו</p>
                        </div>
                        <div className="flex gap-2">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${didChallenge ? "bg-[#1aa376]/15 text-[#22c08c]" : "bg-[#22252b] text-[#8a8aa0]"}`}>
                            {didChallenge ? "✓ אתגר יומי הושלם" : "אתגר יומי לא הושלם"}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${readBrief ? "bg-[#1aa376]/15 text-[#22c08c]" : "bg-[#22252b] text-[#8a8aa0]"}`}>
                            {readBrief ? "✓ קרא/ה עדכון יומי" : "לא קרא/ה עדכון יומי"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-4">
            <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b] space-y-3">
              <p className="font-bold text-[#eef0f6] mb-1">משתמשי ניהול נוספים</p>
              <p className="text-xs text-[#8a8aa0] mb-2">כל משתמש שתוסיפו כאן יוכל להתחבר עם קוד הבעלים + הסיסמה האישית שלו, ולקבל גישה מלאה לניהול המסעדה.</p>

              {ownerUsers.length > 0 && (
                <div className="space-y-2">
                  {ownerUsers.map((u) => (
                    <div key={u.id} className="bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 flex items-center gap-2">
                      <UserPlus size={14} className="text-[#8a8aa0]" />
                      <p className="text-sm text-[#eef0f6] font-bold">{u.name}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-[#22252b]">
                <input
                  type="text"
                  value={newManagerName}
                  onChange={(e) => setNewManagerName(e.target.value)}
                  placeholder="שם המשתמש"
                  className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
                  dir="rtl"
                />
                <input
                  type="password"
                  value={newManagerPassword}
                  onChange={(e) => setNewManagerPassword(e.target.value)}
                  placeholder="סיסמה אישית"
                  className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
                />
                {managerErr && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} /> {managerErr}</p>}
                <button
                  onClick={handleAddManager}
                  disabled={addingManager}
                  className="w-full bg-[#6d5efc] text-white font-bold py-2 rounded-lg text-sm hover:bg-[#5b4ef0] transition disabled:opacity-60"
                >
                  {addingManager ? "מוסיף..." : "הוספת משתמש"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="border-t border-[#22252b] bg-[#16181c]">
        <div className="grid grid-cols-6 gap-1 p-2">
          <NavButton icon={<Home size={18} />} label="בית" active={tab === "home"} onClick={() => setTab("home")} />
          <NavButton icon={<BookOpen size={18} />} label="תפריט" active={tab === "menu"} onClick={() => setTab("menu")} />
          <NavButton icon={<FileText size={18} />} label="פרטים" active={tab === "details"} onClick={() => setTab("details")} />
          <NavButton icon={<Users size={18} />} label="צוות" active={tab === "team"} onClick={() => setTab("team")} />
          <NavButton icon={<Settings size={18} />} label="הגדרות" active={tab === "settings"} onClick={() => setTab("settings")} />
          <NavButton icon={<LogOut size={18} />} label="יציאה" onClick={onSignOut} />
        </div>
      </div>
    </div>
  );
}

function NavButton({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg transition ${
        active
          ? "bg-[#6d5efc] text-white"
          : "text-[#8a8aa0] hover:text-[#eef0f6] hover:bg-[#1c1e22]"
      }`}
    >
      {icon}
      <span className="text-[9px] font-bold">{label}</span>
    </button>
  );
}

function DailyBriefEditor({ draft, onChange, onSave, saving }) {
  return (
    <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b] space-y-3">
      <p className="font-bold text-[#eef0f6]">עדכון יומי לצוות</p>
      <p className="text-xs text-[#8a8aa0]">מה שתעדכנו כאן יופיע מיד לצוות באפליקציה שלהם.</p>

      <div>
        <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">חוסרים היום (מופרדים בפסיקים)</p>
        <input
          type="text"
          value={draft.missing}
          onChange={(e) => onChange({ ...draft, missing: e.target.value })}
          placeholder="לדוגמה: סלמון, יין אדום בית"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
          dir="rtl"
        />
      </div>
      <div>
        <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">מנות חדשות היום</p>
        <input
          type="text"
          value={draft.newItems}
          onChange={(e) => onChange({ ...draft, newItems: e.target.value })}
          placeholder="לדוגמה: מרק פטריות עונתי"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
          dir="rtl"
        />
      </div>
      <div>
        <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">בתנור / בהכנה</p>
        <input
          type="text"
          value={draft.oven}
          onChange={(e) => onChange({ ...draft, oven: e.target.value })}
          placeholder="לדוגמה: לחם בייתי, עוגת שוקולד"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
          dir="rtl"
        />
      </div>
      <div>
        <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">הערות נוספות</p>
        <textarea
          value={draft.notes}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          placeholder="כל דבר נוסף שהצוות צריך לדעת היום..."
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm resize-none"
          rows="2"
          dir="rtl"
        />
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full bg-[#6d5efc] text-white font-bold py-2 rounded-lg text-sm hover:bg-[#5b4ef0] transition disabled:opacity-60"
      >
        {saving ? "שומר..." : "שמירת עדכון יומי"}
      </button>
    </div>
  );
}

function MenuSetupTutorial({ restaurant, onDone }) {
  const [phase, setPhase] = useState("paste"); // paste | review
  const [rawText, setRawText] = useState("");
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);

  const handleParse = () => {
    const parsed = parseMenuText(rawText);
    setCategories(parsed.length ? parsed : [{ id: crypto.randomUUID(), name: "עיקריות", dishes: [] }]);
    setPhase("review");
  };

  const handleSkip = () => {
    setCategories([{ id: crypto.randomUUID(), name: "עיקריות", dishes: [] }]);
    setPhase("review");
  };

  const updateCategory = (id, patch) => setCategories(categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCategory = (id) => setCategories(categories.filter((c) => c.id !== id));
  const addCategory = () => setCategories([...categories, { id: crypto.randomUUID(), name: "", dishes: [] }]);

  const updateDish = (catId, dishId, patch) =>
    setCategories(categories.map((c) => (c.id === catId ? { ...c, dishes: c.dishes.map((d) => (d.id === dishId ? { ...d, ...patch } : d)) } : c)));
  const removeDish = (catId, dishId) =>
    setCategories(categories.map((c) => (c.id === catId ? { ...c, dishes: c.dishes.filter((d) => d.id !== dishId) } : c)));
  const addDish = (catId) =>
    setCategories(categories.map((c) => (c.id === catId ? { ...c, dishes: [...c.dishes, { id: crypto.randomUUID(), name: "", price: 0, description: "" }] } : c)));

  const totalDishes = categories.reduce((n, c) => n + c.dishes.length, 0);

  const handleSaveAll = async () => {
    setSaving(true);
    const rows = categories.flatMap((cat) =>
      cat.dishes
        .filter((d) => d.name.trim())
        .map((d) => ({
          restaurant_id: restaurant.id,
          category: (cat.name || "כללי").trim(),
          name: d.name.trim(),
          price: Number(d.price) || 0,
          description: d.description || "",
          allergens: [],
          is_special: false
        }))
    );
    if (rows.length > 0) {
      const { error } = await db.from("menu_items").insert(rows);
      if (error) { alert("שמירה נכשלה: " + error.message); setSaving(false); return; }
    }
    setSaving(false);
    onDone(rows.length);
  };

  return (
    <div className="h-screen max-w-md mx-auto bg-[#0c0d10] text-[#eef0f6] flex flex-col" dir="rtl">
      <div className="px-6 pt-8 pb-4 text-center border-b border-[#22252b]">
        <div className="w-12 h-12 rounded-2xl bg-[#15302b] flex items-center justify-center mx-auto mb-3">
          <ClipboardPaste size={22} className="text-[#2f9e8f]" />
        </div>
        <h1 className="text-2xl font-black">בואו נייבא את התפריט שלכם</h1>
        <p className="text-sm text-[#8a8aa0] mt-1">{phase === "paste" ? "שלב 1 מתוך 2" : "שלב 2 מתוך 2"}</p>
      </div>

      {phase === "paste" ? (
        <>
          <div className="flex-1 px-6 py-6 overflow-y-auto space-y-4">
            <p className="text-sm text-[#8a8aa0] leading-relaxed">
              הדביקו כאן את התפריט שלכם כמו שהוא — שם מנה ומחיר בכל שורה, וכותרות קטגוריה (כמו "ראשונות" או "ראשונות קרות") בשורה נפרדת. נזהה את הקטגוריות והמנות אוטומטית, ותוכלו לתקן הכל במסך הבא לפני שנשמור.
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={"ראשונות\nחומוס 32\nסלט יווני 38\n\nעיקריות\nפילה סלמון 78\nאנטריקוט 120"}
              className="w-full bg-[#16181c] border border-[#22252b] rounded-xl px-3 py-3 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] resize-none font-mono text-sm"
              rows="12"
              dir="rtl"
            />
          </div>
          <div className="px-6 pb-6 space-y-3 border-t border-[#22252b] pt-4">
            <button
              onClick={handleParse}
              disabled={!rawText.trim()}
              className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition disabled:opacity-40"
            >
              פענוח אוטומטי
            </button>
            <button onClick={handleSkip} className="w-full bg-[#22252b] text-[#8a8aa0] font-bold py-3 rounded-lg hover:bg-[#2c2e35] transition">
              אמלא ידנית בעצמי
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4">
            <p className="text-xs text-[#8a8aa0]">בדקו שהכל נכון — אפשר לשנות שמות קטגוריה, למחוק, להוסיף, ולתקן כל מנה. זה לוקח רק רגע.</p>
            {categories.map((cat) => (
              <div key={cat.id} className="bg-[#16181c] rounded-lg p-3 border border-[#22252b] space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={cat.name}
                    onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                    placeholder="שם הקטגוריה"
                    className="flex-1 bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] font-bold placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
                    dir="rtl"
                  />
                  <button onClick={() => removeCategory(cat.id)} className="text-[#e0315a] p-2"><Trash2 size={16} /></button>
                </div>
                <div className="space-y-1.5">
                  {cat.dishes.map((d) => (
                    <div key={d.id} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={d.name}
                        onChange={(e) => updateDish(cat.id, d.id, { name: e.target.value })}
                        placeholder="שם המנה"
                        className="flex-1 bg-[#0c0d10] border border-[#22252b] rounded-lg px-2.5 py-1.5 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-xs"
                        dir="rtl"
                      />
                      <input
                        type="number"
                        value={d.price}
                        onChange={(e) => updateDish(cat.id, d.id, { price: e.target.value })}
                        className="w-16 bg-[#0c0d10] border border-[#22252b] rounded-lg px-2 py-1.5 text-[#eef0f6] focus:outline-none focus:border-[#6d5efc] text-xs"
                      />
                      <button onClick={() => removeDish(cat.id, d.id)} className="text-[#8a8aa0] p-1"><X size={14} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => addDish(cat.id)} className="text-[11px] font-bold text-[#6d5efc]">+ הוסף מנה לקטגוריה</button>
              </div>
            ))}
            <button onClick={addCategory} className="w-full text-xs font-bold text-[#8a8aa0] border border-dashed border-[#22252b] rounded-lg py-2 hover:border-[#3a3d45] transition">
              + הוסף קטגוריה
            </button>
          </div>
          <div className="px-6 pb-6 space-y-2 border-t border-[#22252b] pt-4">
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition disabled:opacity-60"
            >
              {saving ? "שומר..." : `שמירה — ${totalDishes} מנות`}
            </button>
            <button onClick={() => setPhase("paste")} className="w-full bg-[#22252b] text-[#8a8aa0] font-bold py-3 rounded-lg hover:bg-[#2c2e35] transition">
              חזרה להדבקה
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DishForm({ item, onChange, onSave, onCancel, existingCategories }) {
  return (
    <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b] space-y-3">
      <input
        type="text"
        value={item.name}
        onChange={(e) => onChange({ ...item, name: e.target.value })}
        placeholder="שם המנה"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
        dir="rtl"
      />

      <input
        type="text"
        list="dish-category-options"
        value={item.category}
        onChange={(e) => onChange({ ...item, category: e.target.value })}
        placeholder="קטגוריה (לדוגמה: ראשונות, עיקריות...)"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
        dir="rtl"
      />
      <datalist id="dish-category-options">
        {existingCategories.map((c) => <option key={c} value={c} />)}
      </datalist>

      <input
        type="number"
        value={item.price}
        onChange={(e) => onChange({ ...item, price: Number(e.target.value) })}
        placeholder="מחיר"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
      />

      <textarea
        value={item.description}
        onChange={(e) => onChange({ ...item, description: e.target.value })}
        placeholder="תיאור"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm resize-none"
        rows="2"
        dir="rtl"
      />

      <div className="space-y-2">
        <p className="text-xs font-bold text-[#8a8aa0]">אלרגנים:</p>
        <div className="grid grid-cols-3 gap-2">
          {ALLERGENS.map((allergen) => (
            <button
              key={allergen}
              onClick={() => {
                const current = item.allergens || [];
                if (current.includes(allergen)) {
                  onChange({ ...item, allergens: current.filter((a) => a !== allergen) });
                } else {
                  onChange({ ...item, allergens: [...current, allergen] });
                }
              }}
              className={`text-xs py-1 rounded transition ${
                (item.allergens || []).includes(allergen)
                  ? "bg-[#e0315a] text-white"
                  : "bg-[#22252b] text-[#8a8aa0] hover:bg-[#2c2e35]"
              }`}
            >
              {allergen}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={item.isSpecial}
          onChange={(e) => onChange({ ...item, isSpecial: e.target.checked })}
          className="w-4 h-4"
        />
        <span className="text-sm text-[#8a8aa0]">מנת היום</span>
      </label>

      <div className="flex gap-2">
        <button
          onClick={onSave}
          className="flex-1 bg-[#6d5efc] text-white font-bold py-2 rounded-lg text-sm hover:bg-[#5b4ef0] transition"
        >
          <Check size={14} className="inline mr-1" /> שמור
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-[#22252b] text-[#8a8aa0] font-bold py-2 rounded-lg text-sm hover:bg-[#2c2e35] transition"
        >
          בטל
        </button>
      </div>
    </div>
  );
}

function DetailsForm({ form, onChange, onSave, onCancel }) {
  return (
    <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b] space-y-3">
      <input
        type="text"
        value={form.name || ""}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        placeholder="שם המסעדה"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
        dir="rtl"
      />

      <div>
        <p className="text-xs font-bold text-[#8a8aa0] mb-1.5">סוג המטבח</p>
        <CuisineSelector
          selected={form.cuisineTypes || []}
          onChange={(cuisineTypes) => onChange({ ...form, cuisineTypes })}
        />
      </div>

      <textarea
        value={form.description || ""}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
        placeholder="תיאור המסעדה"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm resize-none"
        rows="3"
        dir="rtl"
      />

      <div>
        <p className="text-xs font-bold text-[#8a8aa0] mb-1.5">סגנון האירוח</p>
        <div className="space-y-2">
          {SERVICE_STYLES.map((style) => {
            const active = form.serviceStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onChange({ ...form, serviceStyle: style.id })}
                className={`w-full text-right p-3 rounded-lg border transition ${
                  active ? "bg-[#6d5efc]/10 border-[#6d5efc]" : "bg-[#0c0d10] border-[#22252b] hover:border-[#3a3d45]"
                }`}
              >
                <p className={`text-sm font-bold ${active ? "text-[#a79bff]" : "text-[#eef0f6]"}`}>{style.title}</p>
              </button>
            );
          })}
        </div>
      </div>

      <input
        type="tel"
        value={form.phone || ""}
        onChange={(e) => onChange({ ...form, phone: e.target.value })}
        placeholder="טלפון (לא חובה)"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
      />

      <input
        type="text"
        value={form.address || ""}
        onChange={(e) => onChange({ ...form, address: e.target.value })}
        placeholder="כתובת (לא חובה)"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
        dir="rtl"
      />

      <div className="flex gap-2">
        <button
          onClick={onSave}
          className="flex-1 bg-[#6d5efc] text-white font-bold py-2 rounded-lg text-sm hover:bg-[#5b4ef0] transition"
        >
          <Check size={14} className="inline mr-1" /> שמור
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-[#22252b] text-[#8a8aa0] font-bold py-2 rounded-lg text-sm hover:bg-[#2c2e35] transition"
        >
          בטל
        </button>
      </div>
    </div>
  );
}
