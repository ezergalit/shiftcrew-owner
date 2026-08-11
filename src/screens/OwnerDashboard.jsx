import { useState, useEffect } from "react";
import { Home, BookOpen, FileText, Users, Settings, LogOut, Plus, Edit2, Trash2, Check, AlertTriangle, ChefHat } from "lucide-react";
import CuisineSelector from "../components/CuisineSelector";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");
export const RESTAURANT_COLUMNS = "id, name, owner_code, team_code, created_at, phone, address, description, cuisine_types, important_allergens, service_style, service_notes";

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

const CATEGORIES = {
  starters: "ראשונות",
  mains: "עיקריות",
  desserts: "קינוחים",
  drinks: "קוקטיילים"
};

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

export default function OwnerDashboard({ restaurant, onSignOut, onRestaurantUpdated }) {
  const [tab, setTab] = useState("home"); // home | menu | details | team | settings
  const [onboarding, setOnboarding] = useState(false); // true if first time setup needed

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

  // Onboarding form
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: restaurant info, 2: allergens, 3: done
  const [onboardingForm, setOnboardingForm] = useState({
    name: restaurant?.name || "",
    phone: "",
    address: "",
    cuisineTypes: [],
    description: "",
    importantAllergens: [],
    serviceStyle: "",
    serviceNotes: ""
  });

  // Check if first time setup + keep `details` in sync with the canonical restaurant object
  useEffect(() => {
    if (!restaurant) return;
    setDetails(fromDbRestaurant(restaurant));
    if (!restaurant.description) {
      setOnboarding(true);
    }
  }, [restaurant]);

  // Load menu items + team members from Supabase whenever the restaurant changes
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
    })();
    return () => { alive = false; };
  }, [restaurant?.id]);

  // Handle new dish form
  const handleAddDish = () => {
    setShowAddForm(true);
    setEditingItem({
      name: "",
      category: "mains",
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
      category: editingItem.category,
      price: editingItem.price,
      description: editingItem.description || "",
      allergens: editingItem.allergens || [],
      is_special: !!editingItem.isSpecial
    };

    if (editingItem.id) {
      const { data, error } = await db.from("menu_items")
        .update(payload).eq("id", editingItem.id).select().single();
      if (error) { alert("שמירה נכשלה: " + error.message); return; }
      setItems(items.map((i) => (i.id === editingItem.id ? dishFromDb(data) : i)));
    } else {
      const { data, error } = await db.from("menu_items")
        .insert(payload).select().single();
      if (error) { alert("שמירה נכשלה: " + error.message); return; }
      setItems([...items, dishFromDb(data)]);
    }
    setEditingItem(null);
    setShowAddForm(false);
  };

  const handleDeleteDish = async (id) => {
    const { error } = await db.from("menu_items").delete().eq("id", id);
    if (error) { alert("מחיקה נכשלה: " + error.message); return; }
    setItems(items.filter((item) => item.id !== id));
  };

  const handleSaveDetails = async () => {
    const patch = toDbRestaurantPatch(detailsForm);
    const { data, error } = await db.from("restaurants")
      .update(patch).eq("id", restaurant.id).select(RESTAURANT_COLUMNS).single();
    if (error) { alert("שמירה נכשלה: " + error.message); return; }
    setDetails(fromDbRestaurant(data));
    setEditingDetails(false);
    onRestaurantUpdated?.(data);
  };

  const handleCompleteOnboarding = async () => {
    const patch = toDbRestaurantPatch(onboardingForm);
    const { data, error } = await db.from("restaurants")
      .update(patch).eq("id", restaurant.id).select(RESTAURANT_COLUMNS).single();
    if (error) { alert("שמירה נכשלה: " + error.message); return; }
    setDetails(fromDbRestaurant(data));
    setOnboarding(false);
    setTab("home");
    onRestaurantUpdated?.(data);
  };

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
                <label className="text-xs font-bold text-[#8a8aa0] block mb-2">טלפון</label>
                <input
                  type="tel"
                  value={onboardingForm.phone}
                  onChange={(e) => setOnboardingForm({ ...onboardingForm, phone: e.target.value })}
                  placeholder="טלפון"
                  className="w-full bg-[#16181c] border border-[#22252b] rounded-xl px-3 py-3 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc]"
                  dir="rtl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#8a8aa0] block mb-2">כתובת</label>
                <input
                  type="text"
                  value={onboardingForm.address}
                  onChange={(e) => setOnboardingForm({ ...onboardingForm, address: e.target.value })}
                  placeholder="כתובת"
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

              <div>
                <label className="text-xs font-bold text-[#8a8aa0] block mb-2">אלרגנים חשובים לתשומת לב הצוות</label>
                <div className="flex flex-wrap gap-2">
                  {ALLERGENS.map((allergen) => {
                    const active = onboardingForm.importantAllergens.includes(allergen);
                    return (
                      <button
                        key={allergen}
                        type="button"
                        onClick={() => {
                          setOnboardingForm({
                            ...onboardingForm,
                            importantAllergens: active
                              ? onboardingForm.importantAllergens.filter(a => a !== allergen)
                              : [...onboardingForm.importantAllergens, allergen]
                          });
                        }}
                        className={`text-xs font-bold px-3 py-2 rounded-full border transition ${
                          active
                            ? "bg-[#e0315a]/15 border-[#e0315a]/50 text-[#ff6b8f]"
                            : "bg-[#16181c] border-[#22252b] text-[#8a8aa0] hover:border-[#3a3d45]"
                        }`}
                      >
                        {allergen}
                      </button>
                    );
                  })}
                </div>
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
        <p className="text-xs text-[#8a8aa0]">קוד בעלים: {restaurant?.owner_code}</p>
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
                הוסף מנות
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
          </div>
        )}

        {tab === "menu" && (
          <div className="space-y-3">
            <button
              onClick={handleAddDish}
              className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-[#5b4ef0] transition"
            >
              <Plus size={18} /> הוסף מנה
            </button>

            {showAddForm && (
              <DishForm
                item={editingItem}
                onChange={setEditingItem}
                onSave={handleSaveDish}
                onCancel={() => { setShowAddForm(false); setEditingItem(null); }}
              />
            )}

            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="bg-[#16181c] rounded-lg p-3 border border-[#22252b]">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <p className="font-bold text-[#eef0f6]">{item.name}</p>
                      <p className="text-xs text-[#8a8aa0]">{CATEGORIES[item.category] || item.category}</p>
                    </div>
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
                  <p className="text-xs font-bold text-[#8a8aa0]">טלפון</p>
                  <p className="text-[#eef0f6]">{details?.phone || "לא מוגדר"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#8a8aa0]">כתובת</p>
                  <p className="text-[#eef0f6]">{details?.address || "לא מוגדר"}</p>
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
                  <p className="text-[#eef0f6]">{SERVICE_STYLES.find(s => s.id === details?.serviceStyle)?.title || "לא מוגדר"}</p>
                </div>
                {details?.importantAllergens?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-[#8a8aa0] mb-1.5">אלרגנים חשובים</p>
                    <div className="flex flex-wrap gap-1.5">
                      {details.importantAllergens.map((a) => (
                        <span key={a} className="bg-[#e0315a]/15 border border-[#e0315a]/50 text-[#ff6b8f] text-xs font-bold px-2.5 py-1 rounded-full">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
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
              <p className="text-xs font-bold text-[#8a8aa0] mb-3">חברי צוות ({teamMembers.length})</p>
              <div className="space-y-2">
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-[#8a8aa0]">עדיין אין חברי צוות. שתפו את הקוד לעליות!</p>
                ) : (
                  teamMembers.map((member) => (
                    <div key={member.id} className="bg-[#16181c] rounded-lg p-3 border border-[#22252b]">
                      <p className="font-bold text-[#eef0f6]">{member.name}</p>
                      <p className="text-xs text-[#8a8aa0]">הצטרף: {new Date(member.created_at).toLocaleDateString("he-IL")}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-3">
            <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b]">
              <p className="font-bold text-[#eef0f6] mb-1">הגדרות נוספות</p>
              <p className="text-sm text-[#8a8aa0]">יגיעו בעקרוב...</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="border-t border-[#22252b] bg-[#16181c]">
        <div className="grid grid-cols-5 gap-1 p-2">
          <NavButton
            icon={<Home size={20} />}
            label="בית"
            active={tab === "home"}
            onClick={() => setTab("home")}
          />
          <NavButton
            icon={<BookOpen size={20} />}
            label="תפריט"
            active={tab === "menu"}
            onClick={() => setTab("menu")}
          />
          <NavButton
            icon={<FileText size={20} />}
            label="פרטים"
            active={tab === "details"}
            onClick={() => setTab("details")}
          />
          <NavButton
            icon={<Users size={20} />}
            label="צוות"
            active={tab === "team"}
            onClick={() => setTab("team")}
          />
          <NavButton
            icon={<LogOut size={20} />}
            label="יציאה"
            onClick={onSignOut}
          />
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
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

function DishForm({ item, onChange, onSave, onCancel }) {
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

      <select
        value={item.category}
        onChange={(e) => onChange({ ...item, category: e.target.value })}
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] focus:outline-none focus:border-[#6d5efc] text-sm"
      >
        {Object.entries(CATEGORIES).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>

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
                  onChange({ ...item, allergens: current.filter(a => a !== allergen) });
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

      <input
        type="tel"
        value={form.phone || ""}
        onChange={(e) => onChange({ ...form, phone: e.target.value })}
        placeholder="טלפון"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
      />

      <input
        type="text"
        value={form.address || ""}
        onChange={(e) => onChange({ ...form, address: e.target.value })}
        placeholder="כתובת"
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
        <p className="text-xs font-bold text-[#8a8aa0] mb-1.5">אלרגנים חשובים לתשומת לב הצוות</p>
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((allergen) => {
            const active = (form.importantAllergens || []).includes(allergen);
            return (
              <button
                key={allergen}
                type="button"
                onClick={() => {
                  const current = form.importantAllergens || [];
                  onChange({
                    ...form,
                    importantAllergens: active
                      ? current.filter(a => a !== allergen)
                      : [...current, allergen]
                  });
                }}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${
                  active
                    ? "bg-[#e0315a]/15 border-[#e0315a]/50 text-[#ff6b8f]"
                    : "bg-[#0c0d10] border-[#22252b] text-[#8a8aa0] hover:border-[#3a3d45]"
                }`}
              >
                {allergen}
              </button>
            );
          })}
        </div>
      </div>

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
