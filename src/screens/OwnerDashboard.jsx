import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Home, BookOpen, Users, Settings, ListChecks, Plus, Edit2, Trash2, Check, AlertTriangle, ChefHat, ClipboardPaste, X, UserPlus, Camera, Star, Target, Stethoscope, Store, ShieldCheck, Compass, ChevronLeft, ChevronRight, Flame, TrendingUp, Megaphone, BarChart3, Lightbulb } from "lucide-react";
import LearningStatus from "../components/LearningStatus";
import SignOutButton from "../components/SignOutButton";
import TasksManager from "../components/TasksManager";
import TeamRoster from "../components/TeamRoster";
import MemberSheet, { MemberRow } from "../components/MemberSheet";
import TeamMessageDialog from "../components/TeamMessageDialog";
import OwnerTasksList from "../components/OwnerTasksList";
import TeamScreen from "../components/TeamScreen";
import Greeting from "../components/Greeting";
import ProfileGate from "../components/ProfileGate";
import { genderWord } from "../lib/gender";
import OperatorLine from "../components/OperatorLine";
import SmartSuggestions from "../components/SmartSuggestions";
import { categoryVisual } from "../lib/categoryVisual";
import GuidedTour from "../components/GuidedTour";
import OwnerWelcomeVideo from "./OwnerWelcomeVideo";
import BriefAssistant, { TagField, BriefCarryOver } from "../components/BriefAssistant";
import BriefReadBoard from "../components/BriefReadBoard";
import CuisineSelector from "../components/CuisineSelector";
import LearningPathSettings from "../components/LearningPathSettings";
import ProgressChart from "../components/ProgressChart";
import MenuHealthReview from "../components/MenuHealthReview";
import AccountSecurity from "../components/AccountSecurity";
import SettingsSection from "../components/SettingsSection";
import WaiterPreview from "../components/WaiterPreview";
import { FLAG_GROUPS, FLAG_GROUP_BY_KEY, effectiveTrackedFlags } from "../lib/dishFlags";
import { supabase } from "../lib/supabase";
import { getSessionToken } from "../lib/appSession";
import { membersLabel, isKnowledge } from "../components/aurora/bits";
import DishEditor from "../components/aurora/DishEditor";
import { isGuide } from "../components/aurora/OwnerMenu";
import OwnerHome from "../components/aurora/OwnerHome";
import OwnerMenu from "../components/aurora/OwnerMenu";
import OwnerSettings from "../components/aurora/OwnerSettings";
import "../aurora.css";

const db = supabase.schema("menu_app");

// Hebrew counts one thing in the singular. "1 משימות" reads as a string-concatenation
// bug, because it is one.
const countLabel = (n, one, many) => (n === 1 ? `${one} אחת` : `${n} ${many}`);

// Coca-Cola has no allergens, and that is not a gap (user, 2026-08-21). Plain drinks are
// exempt from the "missing allergens" task; beer and cocktails are NOT — gluten in beer
// and half a bar in a cocktail are exactly what a guest asks about.
const DRINK_CAT_RE = /(שתי|משקא|יין|יינות|קפה|מיץ|מיצים|שייק|קולה|סודה|אלכוהול|וויסקי|וודקה|טקילה|ליקר|drink|wine|coffee|juice)/i;
const BREW_CAT_RE = /(בירה|בירות|קוקטייל|beer|cocktail)/i;
const needsAllergens = (d) => {
  const c = d.category || "";
  return !DRINK_CAT_RE.test(c) || BREW_CAT_RE.test(c);
};
export const RESTAURANT_COLUMNS = "id, name, owner_code, team_code, created_at, phone, address, description, cuisine_types, important_allergens, service_style, service_notes, onboarding_completed, onboarding_step, tracked_flags, dismissed_menu_tasks, owner_name, owner_gender, trainee_code, features, owner_welcome_video_url";

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

// Onboarding asks for a strict subset of the profile — no phone, no address. Reusing the
// full patch builder here sends `phone: null` and `address: null` for fields the form
// never had, wiping them for any restaurant that fills in its profile after the fact.
// A local mirror of the onboarding answers, keyed per restaurant. The DB is still the
// real store; this only covers the gap when a write fails or the tab closes mid-save, so
// the owner never retypes a form they already filled in. Cleared once onboarding completes.
const ONBOARDING_DRAFT_KEY = (id) => `menu-app-onboarding-draft-${id}`;

function saveOnboardingDraft(id, draft) {
  try { localStorage.setItem(ONBOARDING_DRAFT_KEY(id), JSON.stringify(draft)); } catch { /* private mode */ }
}
function readOnboardingDraft(id) {
  try { return JSON.parse(localStorage.getItem(ONBOARDING_DRAFT_KEY(id)) || "null"); } catch { return null; }
}
function clearOnboardingDraft(id) {
  try { localStorage.removeItem(ONBOARDING_DRAFT_KEY(id)); } catch { /* private mode */ }
}

function toDbOnboardingPatch(form) {
  return {
    name: form.name,
    description: form.description || null,
    cuisine_types: form.cuisineTypes || [],
    service_style: form.serviceStyle || null,
    service_notes: form.serviceNotes || null
  };
}

function dishFromDb(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    menuGroup: row.menu_group || null,
    price: row.price,
    description: row.description || "",
    // Ingredients used to be dropped here. The AI import writes them and the waiter app
    // builds questions from them, but the owner could neither see nor fix them, and the
    // exam-config screen concluded the menu had none.
    ingredients: row.ingredients || [],
    allergens: row.allergens || [],
    pregnancy: row.pregnancy || [],
    pitfalls: row.pitfalls || [],
    kashrut: row.kashrut || [],
    menuPosition: row.menu_position,
    // Needed by the brief assistant to spot recently-added dishes.
    createdAt: row.created_at,
    isSpecial: !!row.is_special,
    // "חשוב לי שהצוות ידע את המנה הזו" — drives learning priority in the waiter app.
    // Distinct from isSpecial, which is the daily-service "מנת היום" flag.
    starred: !!row.starred,
    // ⚠️ image_url was missing from this mapper, so the dish cards that read
    // `item.image_url` always got undefined and every restaurant looked photo-less —
    // even SALON26, which has 64 real photos. The row carried it; the mapper dropped it.
    image_url: row.image_url || null
  };
}

// A dish inserted on its own — not as part of a bulk import or a rapid editing session —
// is genuinely NEW to the team, so it gets a star (and learning priority) automatically.
// "On its own" = at least this long since the previous dish was added; a menu import
// writes dozens of rows in one moment and must not star the whole menu.
const NEW_DISH_QUIET_HOURS = 48;

// Difficulty profiles offered during onboarding (feature 7). "recommended" mirrors
// DEFAULT_PATH in src/lib/examFacets.js — keep the two in sync. The choice only seeds
// exam_config; everything stays adjustable later in LearningPathSettings.
const DIFFICULTY_PROFILES = {
  easy:        { label: "קליל",  desc: "סף מעבר 40% — התרגול מושך מכל התפריט",           pass_threshold: 40, gate_games: false },
  recommended: { label: "מומלץ", desc: "סף מעבר 50% — התרגול מתמקד במה שכבר נבחן",            pass_threshold: 50, gate_games: true },
  strict:      { label: "קפדני", desc: "סף מעבר 70% — לצוות שרוצים לדייק בו",             pass_threshold: 70, gate_games: true },
};
function isStandaloneNewDish(existingItems) {
  const newest = existingItems.reduce((m, i) => {
    const t = i.createdAt ? new Date(i.createdAt).getTime() : 0;
    return t > m ? t : m;
  }, 0);
  return newest > 0 && Date.now() - newest > NEW_DISH_QUIET_HOURS * 3600 * 1000;
}

const ALLERGENS = ["גלוטן", "לקטוז", "ביצים", "אגוזים", "בוטנים", "רכיכות", "סויה", "שומשום"];
// "מוקשים" — what a guest often asks to avoid by preference, not by safety. Separate from
// ALLERGENS on purpose: folding a preference into the allergen list makes the allergen
// list less trustworthy, and a waiter reads the two for different reasons. Free text, so
// these are only a starting palette — any restaurant adds its own.
// Single source of truth: src/lib/dishFlags.js. "דג נא" used to sit in this list, but a
// raw-fish warning is for pregnancy, not for someone who dislikes coriander — it lives in
// the `pregnancy` group now and reaches the dish through that column.
const PITFALLS = FLAG_GROUP_BY_KEY.pitfalls.values;
const PREGNANCY = FLAG_GROUP_BY_KEY.pregnancy.values;
const KASHRUT = FLAG_GROUP_BY_KEY.kashrut.values;

// exam_results.category stores whatever the menu uses. Older seeded menus use these fixed
// English keys; menus built through the paste/AI import use free-text Hebrew names, which
// need no translation and fall through unchanged.
const CAT_LABELS = { starters: "ראשונות", mains: "עיקריות", desserts: "קינוחים", drinks: "שתייה", general: "מבחן התפריט המלא" };

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

// Downscale a menu photo client-side before sending it to the AI parser — phone photos
// are huge and slow to upload.
//
// ⚠️ 2576, not 1568. The old cap was 1568px at quality 0.85, on the theory that the model
// reads a small image as well as a big one. That is true for a photo of a dish and false
// for a page of dense Hebrew menu text: at 1568px on the long edge, body text on a full
// page lands around 8–10px tall, which is below what the model can resolve. It does not
// report that it cannot read the page — it invents plausible menu text instead. The
// giveaway in the field was every dish coming back priced 88, with names like
// "סלמוני פיסטיה" that are phonetically menu-ish and absent from the page.
//
// 2576px on the long edge is the current high-resolution vision limit, and quality 0.92
// keeps JPEG artifacts off the letter strokes. Both numbers are load-bearing for OCR
// accuracy — do not lower them to save upload bytes.
// Uploading a dish photo goes through an Edge Function, not straight to Storage: the app
// is `anon` plus an `x-app-session` header, and Storage cannot see that header, so its
// policies only admit `authenticated`. The function validates the session server-side and
// writes under a path derived from it — a manager can only ever write to their own
// restaurant's prefix, whatever the client sends.
async function uploadDishPhoto(file) {
  const { media_type, data } = await downscaleImage(file, 1400);
  const { data: res, error } = await supabase.functions.invoke("dish-photo", {
    body: { token: getSessionToken(), data, media_type },
  });
  if (error) {
    // functions.invoke hides the body on a non-2xx; read it so the owner gets a reason.
    let detail = "";
    try { detail = (await error.context?.json())?.error || ""; } catch { /* keep generic */ }
    throw new Error(
      detail === "too_large" ? "התמונה גדולה מדי — נסו תמונה קטנה יותר."
      : detail === "bad_type" ? "אפשר להעלות תמונה בלבד (JPG, PNG או WEBP)."
      : detail === "not_owner" || detail === "bad_session" ? "ההתחברות פגה — היכנסו מחדש ונסו שוב."
      : "העלאת התמונה נכשלה. נסו שוב."
    );
  }
  if (!res?.url) throw new Error("העלאת התמונה נכשלה. נסו שוב.");
  return res.url;
}

async function downscaleImage(file, maxDim = 2576) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("קריאת הקובץ נכשלה"));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("פענוח התמונה נכשל"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return { media_type: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.92).split(",")[1] };
}

export default function OwnerDashboard({ restaurant, onSignOut, onRestaurantUpdated }) {
  const [tab, setTab] = useState("home"); // home | menu | settings
  // ⚠️ The «אורורה» skin is opt-in per restaurant (restaurants.features.design),
  // exactly like the waiter app. A restaurant without the flag — CREWDEMO, which
  // Apple's reviewer and the Play testers open — renders the old screens byte for byte.
  const aurora = restaurant?.features?.design === "aurora";
  // features.tasks === false — the same per-restaurant switch the waiter app reads.
  // The product focuses on the menu and the service; the shift checklists and the daily
  // brief are not part of it, and the owner should have nothing to tick off. Home turns
  // into the one thing that IS their job here: is the team actually learning.
  const tasksOff = restaurant?.features?.tasks === false;
  // ⚠️ One scroller serves all three tabs, so switching tabs used to keep the previous
  // tab's offset — settings opened halfway down. Fixed, but ONLY under the skin: the
  // unskinned app is what Apple's reviewer and the Play testers have open right now, and
  // during a review round even an improvement is a change. It can be lifted later.
  const scrollRef = useRef(null);
  useEffect(() => {
    if (aurora && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [tab, aurora]);
  // The team tab is gone (user, 2026-08-20). It held two unrelated things: the numbers the
  // owner checks daily, and the joining code they touch once. The numbers moved to the home
  // screen, the code and roster into settings — so the nav carries four destinations that
  // are each opened for a different reason, instead of one tab that was two.
  const [openSetting, setOpenSetting] = useState(null); // one settings section at a time
  // Home is collapsed by the same rule as settings: every card states what's inside on its
  // own header, and only one opens at a time. Before this the home screen was a single
  // scroll of six full-height panels ("עמוד הבית ארוך מדי").
  //
  // Which card starts open follows the time of day rather than a fixed choice: until
  // today's update is written that is the job, and once it's out the question becomes who
  // is actually learning. Set once on mount — it must not snap shut under the owner the
  // moment they save the brief.
  const [openHome, setOpenHome] = useState("today");
  const homeDefaulted = useRef(false);
  // Home is a task list; a row opens a view over it. null = the list itself.
  const [homeView, setHomeView] = useState(null);      // null | "brief" | "checklist:<kind>"
  const [showTeam, setShowTeam] = useState(false);     // the 📊 team screen
  const [loadDone, setLoadDone] = useState(false); // every dashboard query has returned
  // Which waiter's full detail sheet is open. Holds the LearningStatus row when the tap
  // came from there (it knows today's minutes and the weekly bars), or just an id.
  const [sheetFor, setSheetFor] = useState(null);
  // Today's study rows, computed by LearningStatus and shared so the detail sheet is
  // identical no matter which home list opened it.
  const [liveByMember, setLiveByMember] = useState({});
  // The personal-profile gate (name + gender). Skipping is remembered per device; the
  // secondary-manager identity already carries a name, so the gate is primary-owner only.
  const profileSkipKey = `menu-app-owner-profile-skip-${restaurant?.id}`;
  const [profileSkipped, setProfileSkipped] = useState(() => !!localStorage.getItem(profileSkipKey));
  const [messageFor, setMessageFor] = useState(null);          // waiter being nudged
  const [messagedToday, setMessagedToday] = useState({});      // id -> { body, readAt }
  const [broadcastOpen, setBroadcastOpen] = useState(false);   // one message to the whole team
  const [menuGroupView, setMenuGroupView] = useState(null); // open menu (menu_group) or null
  const [editingBrief, setEditingBrief] = useState(false);
  const [onboarding, setOnboarding] = useState(false); // true if first time setup needed
  // The paste-a-menu import wizard is an OPERATOR tool now — owners never build their own
  // menu (decision 2026-08-17: "החלטנו שאנחנו עושים את זה"). Reachable only by knowing the
  // URL (?import=1), same gate as ?operator=1 and ?signup=1.
  const [menuSetupActive, setMenuSetupActive] = useState(
    () => new URLSearchParams(window.location.search).get("import") === "1"
  );
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
  const [progressByMember, setProgressByMember] = useState({}); // id -> [{source_item_id, mastery}]
  const [examsByMember, setExamsByMember] = useState({}); // id -> [{category, score, passed, taken_at}]
  const [snapshotsByMember, setSnapshotsByMember] = useState({}); // id -> [{taken_at, pct}]
  const [briefReadsToday, setBriefReadsToday] = useState(new Set());
  const [activeTaskCount, setActiveTaskCount] = useState(null);
  const [taskDoneByMember, setTaskDoneByMember] = useState({}); // id -> tasks ticked today
  const [taskCountByKind, setTaskCountByKind] = useState({});   // kind -> active task count

  // Daily brief
  const [dailyBrief, setDailyBrief] = useState({ missing_items: [], new_items: [], oven_items: [], notes: "" });
  const [briefDraft, setBriefDraft] = useState({ missing: "", newItems: "", oven: "", notes: "" });
  // The most recent past brief, offered for one-tap approval on a fresh day ("they just
  // approve", user 2026-08-23). carryOff falls back to the assistant for this session.
  const [prevBrief, setPrevBrief] = useState(null);
  const [carryOff, setCarryOff] = useState(false);
  // The guided builder only appears while today's brief is still empty; dismissing it
  // hands the owner the plain form for the rest of the session.
  const [briefAssistantOff, setBriefAssistantOff] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  // True only for the automatic first-login run: it opens with the welcome modal, and on
  // an empty menu it hands off to the import wizard when it closes. The settings-button
  // rerun does neither.
  const [tourAutoRun, setTourAutoRun] = useState(false);
  // First-load gate: the wizard/tour decision must not run against the initial
  // empty items state (see the effect below).
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);

  // Additional manager users
  const [ownerUsers, setOwnerUsers] = useState([]);
  const [newManagerName, setNewManagerName] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("");
  const [addingManager, setAddingManager] = useState(false);
  const [managerErr, setManagerErr] = useState("");

  // Onboarding form (trimmed: only fields relevant to the menu itself — no address, no phone).
  // Seeded from the restaurant row rather than from blanks: every step is saved as it is
  // completed, so a refresh mid-signup resumes instead of starting over.
  // Resume point: whichever is further along, the saved row or a local draft left behind
  // by a write that didn't land. Taking the max means a failed save costs nothing.
  // Feature 7: difficulty is chosen during onboarding — not in a settings screen the
  // owner may never open. Maps to exam_config; "מומלץ" matches DEFAULT_PATH exactly.
  const [onboardingDifficulty, setOnboardingDifficulty] = useState("recommended");
  const [onboardingStep, setOnboardingStep] = useState(() => {
    const draft = readOnboardingDraft(restaurant?.id);
    return Math.max(restaurant?.onboarding_step || 1, draft?.step || 1);
  }); // 1: profile, 2: service style, 3: done
  const [onboardingForm, setOnboardingForm] = useState(() => {
    const draft = readOnboardingDraft(restaurant?.id)?.form;
    return {
      name: draft?.name ?? restaurant?.name ?? "",
      cuisineTypes: draft?.cuisineTypes ?? restaurant?.cuisine_types ?? [],
      description: draft?.description ?? restaurant?.description ?? "",
      serviceStyle: draft?.serviceStyle ?? restaurant?.service_style ?? "",
      serviceNotes: draft?.serviceNotes ?? restaurant?.service_notes ?? ""
    };
  });
  const [savingStep, setSavingStep] = useState(false);
  const [onboardingErr, setOnboardingErr] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  // "Turn a mission grey again" (user, 2026-08-21): a done home task can be reopened for
  // the SAME day. done is a derived fact (brief exists, checklist configured), so the
  // reopening lives as an override set, day-scoped so tomorrow starts clean. localStorage
  // because it is a personal "I want another pass" marker, not restaurant data.
  const redoKey = `menu-app-owner-redo-${restaurant?.id}-${today}`;
  const [redoIds, setRedoIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(redoKey) || "[]")); } catch { return new Set(); }
  });
  const setRedo = (id, on) =>
    setRedoIds((prev) => {
      const s = new Set(prev);
      on ? s.add(id) : s.delete(id);
      try { localStorage.setItem(redoKey, JSON.stringify([...s])); } catch {}
      return s;
    });

  // "Never an empty page" (user, 2026-08-23): once every task is done, checking the
  // team's progress becomes the day's next task. Its "done" is the owner having opened
  // it today — day-scoped in localStorage, same shape as the redo override.
  const progressKey = `menu-app-owner-progress-${restaurant?.id}-${today}`;
  const [progressChecked, setProgressChecked] = useState(() => {
    try { return localStorage.getItem(progressKey) === "1"; } catch { return false; }
  });
  const markProgressChecked = () => {
    setProgressChecked(true);
    try { localStorage.setItem(progressKey, "1"); } catch {}
  };

  // "בסדר לי שזה ככה בינתיים" — a menu task the owner waved off. Snoozed for 14 days
  // (it resurfaces later rather than disappearing forever), stored on the restaurant row
  // so it survives restarts and devices. MenuHealthReview keeps showing the gap always.
  const dismissedTasks = restaurant?.dismissed_menu_tasks || {};
  const isDismissed = (id) => dismissedTasks[id] && dismissedTasks[id] >= today;
  const dismissMenuTask = async (id) => {
    const until = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const next = { ...dismissedTasks, [id]: until };
    onRestaurantUpdated?.({ ...restaurant, dismissed_menu_tasks: next });
    const { error } = await db.from("restaurants").update({ dismissed_menu_tasks: next }).eq("id", restaurant.id);
    if (error) console.error("dismiss menu task failed:", error.message);
  };

  // Keep `details` in sync with the canonical restaurant object.
  //
  // Operator model (2026-08-13): the operator opens the account and hands over the code,
  // so the owner's first login must NOT land on a 3-step profile questionnaire — it lands
  // straight in the menu tutorial. The old onboarding screens are retired from the entry
  // path (details stay editable in the פרטים tab, difficulty in הגדרות); the flag is
  // completed silently in the background so nothing re-triggers it.
  useEffect(() => {
    if (!restaurant) return;
    setDetails(fromDbRestaurant(restaurant));
    if (!restaurant.onboarding_completed) {
      db.from("restaurants")
        .update({ onboarding_completed: true, onboarding_step: 3 })
        .eq("id", restaurant.id)
        .then(({ error }) => { if (error) console.error("onboarding auto-complete failed:", error); });
      onRestaurantUpdated?.({ ...restaurant, onboarding_completed: true, onboarding_step: 3 });
    }
  }, [restaurant]);

  // First login on this device = the welcome modal + guided tour, for every restaurant —
  // empty or operator-built alike (the user's 2026-08-17 feedback: the tour must announce
  // itself up front with a skip, not hide behind the settings button). An empty menu opens
  // the import wizard only AFTER the tour closes (see handleTourClose), so the welcome is
  // always the first thing a new owner sees. Waits for menuLoaded — deciding on the initial
  // empty `items` state opened the import wizard over a full menu (race caught live on the
  // DEMO26 restaurant, 2026-08-16).
  // ⚠️ A restaurant with its own video shows that instead of the step-by-step tour
  // (user, 2026-08-29). Same one-time flag, same slot — so the rest of the first-run
  // flow, including the import wizard that opens after it, is untouched. The tour has
  // gone stale three times because it describes screens; a video is the restaurant's
  // own and does not silently rot when a tab moves.
  const [welcomeVideo, setWelcomeVideo] = useState(false);
  useEffect(() => {
    if (!menuLoaded || !restaurant) return;
    if (!localStorage.getItem(`menu-app-tour-done:${restaurant.id}`)) {
      localStorage.setItem(`menu-app-tour-done:${restaurant.id}`, "1");
      if (restaurant.owner_welcome_video_url) {
        setWelcomeVideo(true);
      } else {
        setTourAutoRun(true);
        setTourActive(true);
      }
      setTab("home");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuLoaded, restaurant?.id]);

  // Open the card that matches where the day is, once the first load has told us whether
  // today's brief already went out. Guarded by a ref so it happens exactly once — without
  // it, saving the brief would flip the open card out from under the owner mid-edit.
  // ⚠️ Keyed on `loadDone`, not `menuLoaded`: the menu flag flips right after the FIRST
  // query in the load effect, while today's brief is fetched several queries later. Reading
  // briefSent at that point always says "no brief yet" and opens the wrong card.
  useEffect(() => {
    if (homeDefaulted.current || !loadDone) return;
    homeDefaulted.current = true;
    setOpenHome(briefSent ? "today" : "brief");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDone]);

  // The checklist editor writes straight to shift_tasks; the task list reads counts the
  // dashboard loaded once. Re-read them when the editor closes, or the row still says
  // "להגדרה" over a checklist that now exists.
  const reloadTaskCounts = async () => {
    if (!restaurant?.id) return;
    const { data } = await db.from("shift_tasks")
      .select("id, kind, expires_on").eq("restaurant_id", restaurant.id).eq("active", true);
    const live = (data || []).filter((t) => !t.expires_on || t.expires_on >= today);
    setActiveTaskCount(live.length);
    const byKind = {};
    live.forEach((t) => { byKind[t.kind] = (byKind[t.kind] || 0) + 1; });
    setTaskCountByKind(byKind);
  };

  const handleTourClose = () => {
    setTourActive(false);
    setTourAutoRun(false);
  };

  // The tour's "הגדירו עכשיו" exit: close, land on settings, and scroll the learning-path
  // panel into view — the owner should be looking at the thing they were promised.
  const handleTourSetupNow = () => {
    handleTourClose();
    setTab("settings");
    // ⚠️ Under the skin the learning-path panel lives inside a COLLAPSED section, so the
    // element the scroll is aiming at is not in the DOM yet. Open the section first, or
    // the tour's closing call to action silently does nothing.
    if (aurora) setOpenSetting("path");
    setTimeout(() => {
      document.getElementById("learning-path-settings")?.scrollIntoView({ behavior: "smooth" });
    }, aurora ? 250 : 100);
  };

  // Re-fetch just the menu (used after the paste-a-menu tutorial bulk-inserts dishes
  // directly via Supabase, bypassing the `items` state entirely — without this, the
  // Menu tab would show "no dishes yet" right after a successful import).
  const loadMenuItems = async () => {
    if (!restaurant?.id) return;
    const { data, error } = await db.from("menu_items")
      // The printed menu's own order, with created_at only as a tiebreaker for dishes
      // added later by hand. This is the order the team learns in.
      .select("*").eq("restaurant_id", restaurant.id)
      .order("menu_position", { ascending: true, nullsFirst: false })
      .order("created_at");
    if (!error) setItems((data || []).map(dishFromDb));
  };

  // Load menu items + team members + leaderboard + today's brief-reads + brief + managers
  useEffect(() => {
    if (!restaurant?.id) return;
    let alive = true;
    (async () => {
      const { data: menuData, error: menuErr } = await db.from("menu_items")
        .select("*").eq("restaurant_id", restaurant.id)
        .order("menu_position", { ascending: true, nullsFirst: false })
        .order("created_at");
      if (alive && !menuErr) setItems((menuData || []).map(dishFromDb));
      if (alive && !menuErr) setMenuLoaded(true);

      // Team members have no menu_position — they are people, not dishes. Ordering them
      // by it made this request 400 on every dashboard load, which silently emptied the
      // team tab.
      const { data: teamData, error: teamErr } = await db.from("team_members")
        .select("*").eq("restaurant_id", restaurant.id)
        .order("created_at");
      if (teamErr) console.error("could not load team members:", teamErr.message, teamErr.code);
      if (alive && !teamErr) setTeamMembers(teamData || []);

      const { data: lbData } = await db.from("leaderboard")
        .select("team_member_id, points, mastered_count, today_count, last_study_date")
        .eq("restaurant_id", restaurant.id);
      if (alive && lbData) {
        const map = {};
        lbData.forEach((r) => { map[r.team_member_id] = r; });
        setLeaderboardByMember(map);
      }

      // Per-dish scores, straight from menu_progress. leaderboard only stores a COUNT of
      // dishes past the 4/5 pass mark, which misreads how much someone actually knows:
      // nine dishes at exactly 4 (56%) outranks eight dishes at 5 (75%). It also can't say
      // *which* dishes they're getting wrong. Both of those are what the owner needs.
      const memberIds = (teamData || []).map((m) => m.id);
      if (memberIds.length) {
        const { data: progData } = await db.from("menu_progress")
          .select("team_member_id, source_item_id, mastery")
          .in("team_member_id", memberIds);
        if (alive && progData) {
          const map = {};
          progData.forEach((r) => {
            (map[r.team_member_id] ||= []).push(r);
          });
          setProgressByMember(map);
        }

        // Measurement points over time, for the improvement chart. Ordered oldest-first so
        // the chart can plot them without sorting again.
        const { data: snapData } = await db.from("progress_snapshots")
          .select("team_member_id, taken_at, pct")
          .in("team_member_id", memberIds)
          .order("taken_at", { ascending: true });
        if (alive && snapData) {
          const map = {};
          snapData.forEach((r) => { (map[r.team_member_id] ||= []).push(r); });
          setSnapshotsByMember(map);
        }
      }

      // Exam history — one row per completed attempt. Separate from menu_progress because
      // that only holds the current per-dish score; this is what shows whether someone
      // passed, when, and whether they keep failing the same category.
      const { data: examData } = await db.from("exam_results")
        .select("team_member_id, category, score, passed, taken_at")
        .eq("restaurant_id", restaurant.id)
        .order("taken_at", { ascending: false });
      if (alive && examData) {
        const map = {};
        examData.forEach((r) => { (map[r.team_member_id] ||= []).push(r); });
        setExamsByMember(map);
      }

      // Which waiters were already nudged today — so the button can say so instead of the
      // manager sending the same reminder three times before lunch.
      //
      // `read_at` is filled by the waiter app when they tap "קראתי" on the message, so the
      // manager sees whether the nudge actually landed rather than only that it was sent.
      const { data: msgData } = await db.from("team_messages")
        .select("team_member_id, body, created_at, read_at")
        .eq("restaurant_id", restaurant.id)
        .gte("created_at", `${today}T00:00:00`)
        .order("created_at", { ascending: true });
      if (alive && msgData) {
        const map = {};
        msgData.forEach((m) => { map[m.team_member_id] = { body: m.body, readAt: m.read_at }; }); // last one wins
        setMessagedToday(map);
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

      const { data: prevData } = await db.from("daily_brief")
        .select("date, missing_items, new_items, oven_items, notes")
        .eq("restaurant_id", restaurant.id).lt("date", today)
        .order("date", { ascending: false }).limit(1).maybeSingle();
      if (alive && prevData) setPrevBrief(prevData);

      const { data: usersData } = await db.from("owner_users")
        .select("id, name, created_at").eq("restaurant_id", restaurant.id).order("created_at");
      if (alive && usersData) setOwnerUsers(usersData);

      // Shift tasks feed two places on the home screen: the count tile, and each waiter's
      // "משימות משמרת 3/7" line in their detail sheet. TasksManager still loads the full
      // rows itself when its panel opens — this is only what the summaries need.
      const { data: taskRows } = await db.from("shift_tasks")
        .select("id, kind, expires_on").eq("restaurant_id", restaurant.id).eq("active", true);
      // A one-day task that expired yesterday is history, not workload.
      const liveTasks = (taskRows || []).filter((t) => !t.expires_on || t.expires_on >= today);
      if (alive) {
        setActiveTaskCount(liveTasks.length);
        const byKind = {};
        liveTasks.forEach((t) => { byKind[t.kind] = (byKind[t.kind] || 0) + 1; });
        setTaskCountByKind(byKind);
      }
      if (alive && taskRows?.length) {
        const { data: doneRows } = await db.from("shift_task_done")
          .select("team_member_id").in("task_id", taskRows.map((t) => t.id)).eq("done_date", today);
        if (alive && doneRows) {
          const map = {};
          doneRows.forEach((r) => { map[r.team_member_id] = (map[r.team_member_id] || 0) + 1; });
          setTaskDoneByMember(map);
        }
      }

      if (alive) setLoadDone(true);
    })();
    return () => { alive = false; };
  }, [restaurant?.id]);

  const existingCategories = [...new Set(items.map((i) => i.category).filter(Boolean))];
  // Today's brief, as the home screen needs it: whether one is already out, and a
  // one-line version of it for the collapsed row.
  const briefSent = !!(dailyBrief?.missing_items?.length || dailyBrief?.new_items?.length ||
                       dailyBrief?.oven_items?.length || dailyBrief?.notes);
  const briefSummary = [
    dailyBrief?.missing_items?.length ? `חסר: ${dailyBrief.missing_items.join(", ")}` : null,
    dailyBrief?.new_items?.length ? `חדש: ${dailyBrief.new_items.join(", ")}` : null,
    dailyBrief?.notes || null,
  ].filter(Boolean).join(" · ") || "נשלח";

  // How much of the menu a given waiter actually knows: earned score over available score.
  // The same formula as the waiter app and LearningStatus — three screens that disagreed
  // about one person would be worse than a rough number.
  const memberPct = (memberId) => {
    if (!items.length) return 0;
    const rows = progressByMember[memberId] || [];
    const byItem = Object.fromEntries(rows.map((r) => [r.source_item_id, r.mastery ?? 0]));
    return Math.round((items.reduce((s, it) => s + (byItem[it.id] || 0), 0) / (items.length * 5)) * 100);
  };
  // The headline numbers, so each collapsed card answers its own question without opening.
  const teamAvgPct = teamMembers.length
    ? Math.round(teamMembers.reduce((s, m) => s + memberPct(m.id), 0) / teamMembers.length)
    : 0;
  // Prefer LearningStatus's rows once they exist — it derives "studied today" from
  // progress_snapshots, and the header disagreeing with the card below it (0/17 vs 12/17,
  // caught live 2026-08-23) is exactly the two-screens-one-number trap. The leaderboard
  // date is only the pre-load fallback.
  const studiedToday = Object.keys(liveByMember).length
    ? Object.values(liveByMember).filter((r) => r.studiedToday).length
    : teamMembers.filter((m) => leaderboardByMember[m.id]?.last_study_date === today).length;
  // The guided brief builder replaces the plain editor while it's up, rather than sitting
  // on top of it.
  const showBriefAssistant = !briefAssistantOff && !briefSent;
  const prevBriefReady = !briefSent && !carryOff && !!(
    prevBrief?.missing_items?.length || prevBrief?.new_items?.length ||
    prevBrief?.oven_items?.length || prevBrief?.notes
  );
  const prevBriefLabel = prevBrief
    ? (prevBrief.date === new Date(Date.now() - 86400000).toLocaleDateString("en-CA") ? "אתמול" : prevBrief.date)
    : "";
  const prevToDraft = () => ({
    missing: (prevBrief?.missing_items || []).join(", "),
    newItems: (prevBrief?.new_items || []).join(", "),
    oven: (prevBrief?.oven_items || []).join(", "),
    notes: prevBrief?.notes || "",
  });
  // The manager's day, as a list. Built the way the waiter's is: a row exists only when
  // there is something behind it, and every row opens the thing rather than ticking a box.
  const missingDesc = items.filter((d) => !String(d.description || "").trim()).length;
  const missingAllergens = items.filter((d) => needsAllergens(d) && !(d.allergens || []).length).length;
  const missingIngredients = items.filter((d) => (d.ingredients || []).length < 3).length;

  const openingCount = taskCountByKind.opening || 0;
  const closingCount = taskCountByKind.closing || 0;
  const shiftCount = taskCountByKind.shift || 0;

  const ownerTasks = [];
  // A brand-new restaurant's single most important task: get the team in. Without this
  // row, the path from "menu imported" to "waiters learning" ran through settings — a
  // place a first-time owner has no reason to open. Disappears the moment someone joins.
  if (loadDone && teamMembers.length === 0) ownerTasks.push({
    id: "invite", group: "daily",
    title: "לצרף את הצוות",
    subtitle: "שתפו את קוד ההצטרפות — כל מלצר נכנס עם הקוד והשם שלו, בלי סיסמאות",
    done: false, cta: "לקוד",
    onOpen: () => { setTab("settings"); setOpenSetting("team"); },
  });
  ownerTasks.push({
    id: "brief", group: "daily",
    title: "לכתוב את העדכון היומי",
    subtitle: prevBriefReady
      ? `העדכון של ${prevBriefLabel} כבר מוכן — נשאר רק לאשר`
      : "מה חסר, מה חדש ומה להמליץ — הצוות רואה את זה לפני המשמרת",
    done: briefSent && !redoIds.has("brief"), cta: briefSent ? "עריכה" : "לכתיבה",
    onOpen: () => { setHomeView("brief"); if (briefSent) setEditingBrief(true); },
    onRedo: briefSent ? () => setRedo("brief", true) : undefined,
  });
  ownerTasks.push({
    id: "opening", group: "daily",
    title: "משימות פתיחת משמרת",
    subtitle: openingCount ? `${countLabel(openingCount, "משימה", "משימות")} · לעריכה` : "צ׳קליסט פתיחה — בוחרים מספרייה מוכנה, לוקח דקה",
    done: openingCount > 0 && !redoIds.has("opening"), cta: openingCount ? "עריכה" : "להגדרה",
    onOpen: () => setHomeView("checklist:opening"),
    onRedo: openingCount > 0 ? () => setRedo("opening", true) : undefined,
  });
  ownerTasks.push({
    id: "closing", group: "daily",
    title: "משימות סגירת משמרת",
    subtitle: closingCount ? `${countLabel(closingCount, "משימה", "משימות")} · לעריכה` : "צ׳קליסט סגירה — בוחרים מספרייה מוכנה",
    done: closingCount > 0 && !redoIds.has("closing"), cta: closingCount ? "עריכה" : "להגדרה",
    onOpen: () => setHomeView("checklist:closing"),
    onRedo: closingCount > 0 ? () => setRedo("closing", true) : undefined,
  });
  ownerTasks.push({
    id: "shift", group: "daily",
    title: "כללי השירות במשמרת",
    subtitle: shiftCount ? `${countLabel(shiftCount, "משימה", "משימות")} · לעריכה` : "מה חוזר על עצמו בכל שולחן",
    done: shiftCount > 0 && !redoIds.has("shift"), cta: shiftCount ? "עריכה" : "להגדרה",
    onOpen: () => setHomeView("checklist:shift"),
    onRedo: shiftCount > 0 ? () => setRedo("shift", true) : undefined,
  });

  // Menu group: only what is actually missing. Nothing missing ⇒ no rows ⇒ no group.
  if (missingDesc > 0 && !isDismissed("desc")) ownerTasks.push({
    id: "desc", group: "menu",
    onDismiss: () => dismissMenuTask("desc"),
    title: `${countLabel(missingDesc, "מנה", "מנות")} בלי תיאור`,
    subtitle: "בלי תיאור הצוות לומד רק שם ומחיר, ואי אפשר לשאול עליה",
    done: false, cta: "לתפריט",
    onOpen: () => { setTab("settings"); setOpenSetting("health"); },
  });
  if (missingAllergens > 0 && !isDismissed("allerg")) ownerTasks.push({
    id: "allerg", group: "menu",
    onDismiss: () => dismissMenuTask("allerg"),
    title: `${countLabel(missingAllergens, "מנה", "מנות")} בלי אלרגנים`,
    subtitle: "השדה היחיד בתפריט שיכול לשלוח אורח לבית חולים",
    done: false, cta: "להשלמה",
    onOpen: () => { setTab("settings"); setOpenSetting("health"); },
  });
  if (missingIngredients > 0 && !isDismissed("ingr")) ownerTasks.push({
    id: "ingr", group: "menu",
    onDismiss: () => dismissMenuTask("ingr"),
    title: `${countLabel(missingIngredients, "מנה", "מנות")} בלי מספיק מרכיבים`,
    subtitle: "צריך 3 ומעלה כדי לבנות מהן שאלות",
    done: false, cta: "להשלמה",
    onOpen: () => { setTab("settings"); setOpenSetting("health"); },
  });
  // The reward task: when everything above is done the day isn't over — the page offers
  // "check the team's progress" instead of going blank (user, 2026-08-23: "שלא יהיה לו
  // דף ריק תמיד"). Appears only once the rest is done, stays visible (as done) for the
  // rest of the day once opened.
  const baseAllDone = ownerTasks.length > 0 && ownerTasks.every((t) => t.done);
  if (loadDone && (baseAllDone || progressChecked)) ownerTasks.push({
    id: "progress", group: "daily",
    title: "לבדוק את התקדמות הצוות",
    subtitle: studiedToday
      ? `${studiedToday} מהצוות כבר למדו היום — שווה הצצה`
      : "מי למד היום, מי מתקדם ומי צריך תזכורת",
    done: progressChecked && !redoIds.has("progress"),
    cta: "לצפייה",
    onOpen: () => { markProgressChecked(); setRedo("progress", false); setShowTeam(true); },
    onRedo: progressChecked && !redoIds.has("progress") ? () => setRedo("progress", true) : undefined,
  });

  const weakestMember = teamMembers.length
    ? [...teamMembers].sort((a, b) => memberPct(a.id) - memberPct(b.id))[0]
    : null;

  // Everything known about one waiter, assembled in one place for the detail sheet. Both
  // home lists hand their tap here, so the two of them can stay one line per person.
  // `live` is the LearningStatus row when the tap came from that list — it carries today's
  // study minutes and the weekly bars, which the dashboard's own queries don't compute.
  const buildMemberDetail = (sel) => {
    if (!sel) return null;
    const m = teamMembers.find((x) => x.id === sel.id);
    if (!m) return null;
    const rows = progressByMember[m.id] || [];
    const byItem = Object.fromEntries(rows.map((r) => [r.source_item_id, r.mastery ?? 0]));
    const pct = memberPct(m.id);
    const lb = leaderboardByMember[m.id];
    return {
      id: m.id,
      name: m.name,
      pct,
      pctColor: pct >= 80 ? "#22c08c" : pct >= 50 ? "#f3a712" : "#e0315a",
      mastered: lb?.mastered_count || 0,
      dishCount: items.length,
      weak: items.filter((it) => byItem[it.id] > 0 && byItem[it.id] <= 2).map((it) => it.name),
      untouched: items.filter((it) => !byItem[it.id]).length,
      baseline: m.baseline_pct,
      totalSeconds: m.total_seconds,
      snapshots: snapshotsByMember[m.id],
      // Latest attempt per category — earlier ones stay in the table for history, but the
      // owner cares about where they stand now.
      exams: Object.values(
        (examsByMember[m.id] || []).reduce((acc, e) => {
          if (!acc[e.category]) acc[e.category] = e; // list is newest-first
          return acc;
        }, {})
      ).map((e) => ({ ...e, label: CAT_LABELS[e.category] || e.category })),
      readBrief: briefReadsToday.has(m.id),
      didChallenge: lb?.last_study_date === today && (lb?.today_count || 0) >= 3,
      tasksDone: taskDoneByMember[m.id] || 0,
      tasksTotal: activeTaskCount || 0,
      live: sel.studiedToday !== undefined ? sel : liveByMember[m.id] || null,
    };
  };

  // Menus are the level above categories (menu_group, 2026-08-20): a restaurant has a food
  // menu, a bar menu, and seasonal ones. Finding one dish is two taps instead of scrolling
  // the whole list. A menu with no group set keeps the old flat behaviour.
  const menuGroups = [...new Set(items.map((i) => i.menuGroup).filter(Boolean))];
  // Which menu a category belongs to. Every category in both live restaurants sits in
  // exactly one menu, so the manager never has to answer this question themselves.
  const menuGroupForCategory = (cat) =>
    items.find((i) => i.category === cat && i.menuGroup)?.menuGroup ?? null;
  const shownCategories = menuGroupView
    ? [...new Set(items.filter((i) => i.menuGroup === menuGroupView).map((i) => i.category).filter(Boolean))]
    : existingCategories;

  // Handle new dish form
  // The dish form renders at the top of the menu tab, but the tapped card can be a full
  // screen below it — without scrolling up, the tap looks like it did nothing ("אני מנסה
  // להיכנס לתוך המנה ולא מצליח"). The scroll is explicit, not left to layout accidents.
  const openDishEditor = (item) => {
    setEditingItem(item);
    setShowAddForm(true);
  };

  // The dish form renders at the top of the menu tab while the tapped card can be a full
  // screen below it — without scrolling, the tap reads as "clicked and nothing happened".
  // An effect, not a rAF after setState: the rAF fired before React committed the form to
  // the DOM and silently scrolled nothing. Keyed on the dish too, so tapping a second
  // dish while the form is already open still snaps up.
  // ⚠️ Stays ABOVE the onboarding early-return — hooks after early returns crash.
  useEffect(() => {
    // Exact container math instead of scrollIntoView: "start" overshot under the sticky
    // header and "center" put a taller-than-viewport form's top off-screen entirely.
    if (!showAddForm) return;
    const form = document.getElementById("dish-form");
    const scroller = form?.closest(".overflow-y-auto");
    if (!form || !scroller) return;
    scroller.scrollTop += form.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12;
    // On a desktop-sized window the PAGE can be scrolled too (h-screen only pins the
    // app's own container) — reset it or the form still sits above the viewport. On a
    // phone, where the app fills the screen, this is a no-op.
    window.scrollTo({ top: 0 });
  }, [showAddForm, editingItem?.id]);

  const handleAddDish = (fromCategory) => {
    setShowAddForm(true);
    setEditingItem({
      name: "",
      // ⚠️ Not simply existingCategories[0]. In STUDIO26 the first category is
      // "הדרכת שירות" — a knowledge-card section — so every new dish silently landed
      // among the service-training cards. Prefer whatever the manager is currently
      // filtered to, then the first category that actually holds dishes.
      category:
        (typeof fromCategory === "string" && fromCategory) ||
        existingCategories.find((c) => !isKnowledge({ category: c })) ||
        existingCategories[0] ||
        "",
      price: 0,
      description: "",
      ingredients: [],
      allergens: [],
      pregnancy: [],
      pitfalls: [],
      kashrut: [],
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
      ingredients: editingItem.ingredients || [],
      allergens: editingItem.allergens || [],
      pregnancy: editingItem.pregnancy || [],
      pitfalls: editingItem.pitfalls || [],
      kashrut: editingItem.kashrut || [],
      is_special: !!editingItem.isSpecial,
      // ⚠️ Without this the photo uploads fine and then vanishes: the file lands in
      // Storage, the form shows it, and the save writes every other column but this one.
      // The trigger copies it on to published_menu, which is where the team reads it.
      image_url: editingItem.image_url || null,
      // 🔴 menu_group was never written, so every dish a manager added to a restaurant
      // with more than one menu got NULL — and the waiter app filters by menu
      // (`inMenu: c.menuGroup === menu`), so the dish was invisible to the entire team
      // while looking perfectly fine in the manager's own list. Derived from the chosen
      // category, which maps to exactly one menu in both live restaurants (verified).
      menu_group: menuGroupForCategory(editingItem.category) ?? editingItem.menuGroup ?? null,
      // Inserts only — editing an existing dish must never re-star it ("לוודא שזו אכן
      // מנה חדשה ולא מנה קיימת ששונתה"). A manual star from the form wins either way.
      starred: !!editingItem.starred || (!editingItem.id && isStandaloneNewDish(items))
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

  // One tap on the card — no form round-trip. Optimistic, rolled back on failure.
  const toggleStar = async (item) => {
    const next = !item.starred;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, starred: next } : i)));
    const { error } = await db.from("menu_items").update({ starred: next }).eq("id", item.id);
    if (error) {
      console.error("star toggle failed:", error);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, starred: !next } : i)));
    }
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

  // Saves what's been filled so far and records the step, so closing the tab or pulling
  // to refresh resumes here instead of dropping the owner back to an empty step 1.
  //
  // The draft is also mirrored to localStorage, and that is not belt-and-braces: this
  // exact screen once failed its write for days (a missing column grant) while still
  // advancing the owner to the next step, so every refresh silently threw the answers
  // away. A save that fails must not look like a save that worked — the owner is told,
  // and the draft survives locally so the next attempt starts from their answers rather
  // than from a blank form.
  const goToOnboardingStep = async (next) => {
    setSavingStep(true);
    saveOnboardingDraft(restaurant.id, { form: onboardingForm, step: next });
    const patch = { ...toDbOnboardingPatch(onboardingForm), onboarding_step: next };
    const { error } = await db.from("restaurants").update(patch).eq("id", restaurant.id);
    if (error) {
      console.error("could not save onboarding progress:", error);
      setOnboardingErr("לא הצלחנו לשמור כרגע — התשובות שלכם נשמרו במכשיר וננסה שוב בשלב הבא.");
    } else {
      setOnboardingErr("");
      onRestaurantUpdated?.({ ...restaurant, ...patch });
    }
    setOnboardingStep(next);
    setSavingStep(false);
  };

  const handleCompleteOnboarding = async () => {
    // Feature 7: the difficulty the owner picked on the last onboarding screen becomes
    // the exam-config starting point. Written only when no config exists yet — an owner
    // who already tuned LearningPathSettings must never be silently overridden by a
    // re-run of onboarding.
    const profile = DIFFICULTY_PROFILES[onboardingDifficulty];
    if (profile) {
      const { data: existingCfg } = await db.from("exam_config")
        .select("restaurant_id").eq("restaurant_id", restaurant.id).maybeSingle();
      if (!existingCfg) {
        const { error: cfgErr } = await db.from("exam_config").insert({
          restaurant_id: restaurant.id,
          pass_threshold: profile.pass_threshold,
          gate_games: profile.gate_games,
          updated_at: new Date().toISOString(),
        });
        if (cfgErr) console.error("could not save difficulty profile:", cfgErr);
      }
    }
    const patch = { ...toDbOnboardingPatch(onboardingForm), onboarding_completed: true, onboarding_step: 3 };
    const { error } = await db.from("restaurants").update(patch).eq("id", restaurant.id);
    if (error) {
      // The answers are already mirrored locally, so say so — "שמירה נכשלה" on its own
      // reads like the form has to be filled in again.
      saveOnboardingDraft(restaurant.id, { form: onboardingForm, step: 3 });
      alert("שמירה נכשלה: " + error.message + "\n\nהתשובות שלכם נשמרו במכשיר — נסו שוב עוד רגע.");
      return;
    }
    clearOnboardingDraft(restaurant.id);
    const updated = { ...restaurant, ...patch };
    setDetails(fromDbRestaurant(updated));
    onRestaurantUpdated?.(updated);
    setOnboarding(false);
    setTab("menu");
  };

  const handleMenuSetupDone = async (count) => {
    if (count > 0) await loadMenuItems();
    setMenuSetupActive(false);
    setTab("menu");
    if (count > 0) setShowMenuTip(true);
  };

  // `draftOverride` lets the editor hand over a draft with mid-typed text already
  // flushed in — reading state right after a setState would save the pre-flush draft.
  const handleSaveBrief = async (draftOverride) => {
    const d = draftOverride ?? briefDraft;
    if (draftOverride) setBriefDraft(draftOverride);
    setSavingBrief(true);
    const toArr = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
    const patch = {
      restaurant_id: restaurant.id,
      date: today,
      missing_items: toArr(d.missing),
      new_items: toArr(d.newItems),
      oven_items: toArr(d.oven),
      notes: d.notes,
      updated_at: new Date().toISOString()
    };
    const { error } = await db.from("daily_brief")
      .upsert(patch, { onConflict: "restaurant_id,date" });
    setSavingBrief(false);
    if (error) { alert("שמירה נכשלה: " + error.message); return; }
    setDailyBrief(patch);
    // Saving closes the loop by itself (user, 2026-08-21): back to the task list, where
    // the brief row is now green at the bottom. A fresh save also clears any redo flag.
    setRedo("brief", false);
    setHomeView(null);
  };

  const handleAddManager = async () => {
    setManagerErr("");
    if (!newManagerName.trim() || !newManagerPassword.trim()) {
      setManagerErr("חובה למלא שם וסיסמה.");
      return;
    }
    if (newManagerPassword.length < 4) {
      setManagerErr("הסיסמה חייבת להיות באורך 4 תווים לפחות.");
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
        <div className="px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-4 text-center border-b border-[#22252b]">
          <div className="w-12 h-12 rounded-2xl bg-[#15302b] flex items-center justify-center mx-auto mb-3">
            <ChefHat size={24} className="text-[#2f9e8f]" />
          </div>
          <h1 className="text-2xl font-black">בואו נגדיר את המסעדה שלך</h1>
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
                  placeholder="ספרו לנו על המסעדה שלכם…"
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
                  placeholder="לדוגמה: לפנות ללקוחות בשמם הפרטי, להציע יין מומלץ, לוודא שהילדים מקבלים תשומת לב מיוחדת…"
                  className="w-full bg-[#16181c] border border-[#22252b] rounded-xl px-3 py-3 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] resize-none"
                  rows="3"
                  dir="rtl"
                />
              </div>
            </div>
          )}

          {onboardingStep === 3 && (
            <div className="py-6 space-y-5">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-[#6d5efc]/20 flex items-center justify-center mx-auto">
                  <Check size={32} className="text-[#6d5efc]" />
                </div>
                <h2 className="text-xl font-bold">כמעט מוכן — דבר אחרון</h2>
                <p className="text-[#8a8aa0] text-sm">באיזו רמת קושי הצוות שלך ילמד את התפריט?</p>
              </div>
              <div className="space-y-2">
                {Object.entries(DIFFICULTY_PROFILES).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={() => setOnboardingDifficulty(key)}
                    className={`w-full text-right rounded-xl border p-3 transition ${
                      onboardingDifficulty === key
                        ? "bg-[#6d5efc]/15 border-[#6d5efc]"
                        : "bg-[#16181c] border-[#22252b] hover:border-[#3a3d46]"
                    }`}
                  >
                    <span className={`text-sm font-bold ${onboardingDifficulty === key ? "text-[#a79bff]" : "text-[#eef0f6]"}`}>
                      {p.label}{key === "recommended" && <span className="text-[10px] font-bold text-[#22c08c] mr-2">ההמלצה שלנו</span>}
                    </span>
                    <span className="block text-[11px] text-[#8a8aa0] mt-0.5">{p.desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#6a6a7e] text-center leading-relaxed">
                אפשר לשנות את זה בכל רגע בטאב ההגדרות.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 space-y-3 border-t border-[#22252b] pt-4">
          {onboardingStep < 3 && (
            <>
              {onboardingErr && (
                <p className="text-[11px] font-bold text-[#f3a712] flex items-start gap-1.5 leading-relaxed">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {onboardingErr}
                </p>
              )}
              <button
                onClick={() => goToOnboardingStep(onboardingStep + 1)}
                disabled={savingStep}
                className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition disabled:opacity-40"
              >
                {savingStep ? "שומר…" : "הבא"}
              </button>
              {onboardingStep > 1 && (
                <button
                  onClick={() => goToOnboardingStep(onboardingStep - 1)}
                  disabled={savingStep}
                  className="w-full bg-[#22252b] text-[#8a8aa0] font-bold py-3 rounded-lg hover:bg-[#2c2e35] transition disabled:opacity-40"
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
  // Ahead of the dashboard: the restaurant's own tour video, once.
  if (welcomeVideo && restaurant?.owner_welcome_video_url) {
    return (
      <OwnerWelcomeVideo
        restaurant={restaurant}
        onDone={() => setWelcomeVideo(false)}
      />
    );
  }

  return (
    <div className={`h-screen mx-auto text-[#eef0f6] flex flex-col ${aurora ? "aurora-skin" : "max-w-md bg-[#0c0d10]"}`} dir="rtl">
      {aurora && (<><div className="aurora" aria-hidden><i /><i /><i /><i /></div><div className="grain" aria-hidden /></>)}
      {/* Header */}
      {/* ⚠️ No header bar under the skin. Every screen states its own name — "הגדרות",
          "התפריט", the greeting — so a permanent strip carrying the restaurant name and
          three icon buttons was repeating what the screen already said and eating the
          top 90px of a phone. Sign-out moved to the bottom of settings, the team screen
          opens from the home list, and "תצוגת מלצר" sits beside the greeting. */}
      {!aurora && (
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 border-b border-[#22252b] flex items-center justify-between gap-2">
        {/* Sign-out sits in the top-right corner (first in RTL flow) instead of the bottom
            nav — far from the tabs the owner taps all day.
            ⚠️ The owner code is GONE from the header: it is login trivia, not daily work,
            and it sat there permanently while the restaurant name got truncated. It lives
            in settings → פרטי המסעדה now. And every icon button carries a caption — a
            first-time visitor should never have to guess what 📊 opens. */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          <SignOutButton onSignOut={onSignOut} />
          <span className="text-[8.5px] font-bold text-[#5a5a6e]">יציאה</span>
        </div>
        <div className="flex-1 min-w-0 text-center">
          <h1 className="text-lg font-black truncate">{restaurant?.name || "המסעדה שלי"}</h1>
          {restaurant?.logged_in_as_name ? (
            <p className="text-[11px] text-[#8a8aa0] truncate">מחובר/ת כ{restaurant.logged_in_as_name}</p>
          ) : restaurant?.owner_name ? (
            <p className="text-[11px] text-[#8a8aa0] truncate">
              {genderWord(restaurant.owner_gender, "מחובר", "מחוברת")} כ{restaurant.owner_name}
            </p>
          ) : null}
        </div>
        <div className="flex items-start gap-1.5 flex-shrink-0">
          {/* The team's numbers live behind this button now that home is a task list —
              the same move the waiter app makes with its own 📊 screen. */}
          <div className="flex flex-col items-center gap-0.5">
            <button
              onClick={() => setShowTeam(true)}
              title="איך הצוות מתקדם"
              aria-label="איך הצוות מתקדם"
              className="w-9 h-9 rounded-lg bg-[#191b1f] border border-[#22252b] flex items-center justify-center text-[#8a8aa0] hover:text-[#eef0f6] transition"
            >
              <BarChart3 size={16} />
            </button>
            <span className="text-[8.5px] font-bold text-[#5a5a6e]">הצוות</span>
          </div>
          {/* Always within reach, on every tab — the owner should never wonder what the
              team is actually seeing. */}
          <WaiterPreview teamCode={restaurant?.team_code} />
        </div>
      </div>
      )}

      {/* Content */}
      {/* ⚠️ One scroller for all three tabs, so switching tabs kept the previous tab's
          offset — settings opened halfway down, showing whatever happened to be there.
          The tab is a destination; a destination starts at its top. */}
      <div ref={scrollRef} className={`flex-1 overflow-y-auto ${aurora ? "au-screen" : "px-4 py-4"}`}>
        {tab === "home" && homeView === null && aurora && (
          <OwnerHome
            restaurant={restaurant}
            items={items}
            teamMembers={teamMembers}
            onBroadcast={() => setBroadcastOpen(true)}
            onGoSettings={() => { setTab("settings"); setOpenSetting(null); }}
            onSelectMember={setSheetFor}
            onRows={(rows) => setLiveByMember(Object.fromEntries(rows.map((r) => [r.id, r])))}
            onMessage={setMessageFor}
            messagedToday={messagedToday}
          />
        )}

        {tab === "home" && homeView === null && !aurora && (
          <div className="space-y-3">
            <Greeting name={restaurant?.owner_name || restaurant?.logged_in_as_name || restaurant?.name} />
            {tasksOff ? (
              <>
                {/* LearningStatus already carries the day's numbers; a second row of
                    tiles repeated them. What it does NOT know is the menu size, so that
                    is the one tile left — and it doubles as the way into the menu. */}
                <button onClick={() => setTab("menu")} className="glass w-full flex items-center gap-3 text-right">
                  <span className="text-[19px]" aria-hidden>📖</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-black text-[#eef0f6]">{items.length} מנות בתפריט</span>
                    <span className="block text-[12px] text-[#8a8aa0] mt-0.5">זה מה שהצוות לומד · לחצו לעריכה</span>
                  </span>
                  <span className="chev">‹</span>
                </button>
                <LearningStatus
                  restaurant={restaurant}
                  onSelectMember={setSheetFor}
                  onRows={(rows) => setLiveByMember(Object.fromEntries(rows.map((r) => [r.id, r])))}
                  onMessage={setMessageFor}
                  messagedToday={messagedToday}
                />
                {teamMembers.length === 0 && (
                  <button
                    onClick={() => { setTab("settings"); setOpenSetting("team"); }}
                    className="w-full glass rounded-2xl p-4 text-right"
                  >
                    <p className="text-sm font-black text-[#eef0f6]">לצרף את הצוות</p>
                    <p className="text-[12px] text-[#8a8aa0] mt-1">שתפו את קוד ההצטרפות — כל מלצר נכנס עם הקוד והשם שלו</p>
                  </button>
                )}
              </>
            ) : (
              <OwnerTasksList tasks={ownerTasks} />
            )}
          </div>
        )}

        {/* Each task row opens a real screen rather than expanding a panel in place —
            same rule as the waiter's list. The back arrow returns to the list. */}
        {tab === "home" && homeView === "brief" && (
          <div className="space-y-3">
            <ViewHeader title="העדכון היומי" subtitle="מה חסר, מה חדש ומה להמליץ" onBack={() => setHomeView(null)} />
            {showBriefAssistant ? (
              prevBriefReady ? (
                <BriefCarryOver
                  prev={prevBrief}
                  prevLabel={prevBriefLabel}
                  saving={savingBrief}
                  onApprove={() => handleSaveBrief(prevToDraft())}
                  onEdit={() => { setBriefDraft(prevToDraft()); setBriefAssistantOff(true); }}
                  onDismiss={() => setCarryOff(true)}
                />
              ) : (
              <BriefAssistant
                items={items}
                draft={briefDraft}
                setDraft={setBriefDraft}
                onSave={async () => { await handleSaveBrief(); setBriefAssistantOff(true); }}
                saving={savingBrief}
                onDismiss={() => setBriefAssistantOff(true)}
              />
              )
            ) : (
              <DailyBriefEditor
                items={items}
                draft={briefDraft}
                onChange={setBriefDraft}
                onSave={async (final) => { await handleSaveBrief(final); setEditingBrief(false); }}
                saving={savingBrief}
              />
            )}
            <BriefReadBoard restaurant={restaurant} brief={dailyBrief} />
          </div>
        )}

        {tab === "home" && String(homeView).startsWith("checklist") && (
          <TasksManager
            restaurant={restaurant}
            teamCount={teamMembers.length}
            initialGroup={homeView.split(":")[1] || null}
            onExit={(completed) => {
              const kind = homeView.split(":")[1];
              // Only the explicit "שמירה וסגירה" completes the task — leaving with the
              // back arrow keeps it open, so a glance can't silently mark it done.
              if (kind && completed) setRedo(kind, false);
              setHomeView(null);
              reloadTaskCounts();
            }}
          />
        )}

        {tab === "menu" && aurora && (
          <OwnerMenu
            restaurant={restaurant}
            items={items}
            onAdd={handleAddDish}
            /* ⚠️ These two went out with the home-screen cleanup, which also owned a
               `focus` filter fed from the health card. The filter was right to go; these
               were not — they are the menu tab's own edit and star, and without them the
               "עריכת המנה" button and every ⭐ silently did nothing. */
            onOpenDish={openDishEditor}
            onToggleStar={toggleStar}
            scrollRef={scrollRef}
            dishForm={showAddForm ? (
              /* The skinned editor: labelled fields, and closed lists collapsed to the
                 choice. The unskinned DishForm is untouched and still serves everyone else. */
              <DishEditor
                /* A service card edits as a guide: no price, no allergens, no ⭐, and
                   every label says "הדרכה" instead of "מנה". */
                guide={isGuide(editingItem || {})}
                item={editingItem}
                onChange={setEditingItem}
                onSave={handleSaveDish}
                onCancel={() => { setShowAddForm(false); setEditingItem(null); }}
                onDelete={editingItem?.id ? async () => {
                  await handleDeleteDish(editingItem.id);
                  setShowAddForm(false);
                  setEditingItem(null);
                } : undefined}
                existingCategories={existingCategories}
                restaurant={restaurant}
                uploadPhoto={uploadDishPhoto}
                menuOf={menuGroups.length > 1 ? menuGroupForCategory : undefined}
              />
            ) : null}
            operatorLine={<OperatorLine restaurant={restaurant} />}
            emptyNote={
              <p className="text-[13px] text-[#8a919e] text-center py-6 leading-relaxed">
                התפריט שלכם בהכנה אצלנו ויופיע כאן בקרוב.
                <br />אפשר גם להוסיף מנות ידנית בכל רגע.
              </p>
            }
          />
        )}

        {tab === "menu" && !aurora && (
          <div className="space-y-3">
            {/* The direct line to the operator lives at the top of the menu tab — the
                owner writes what they want changed, we do it for them. */}
            <OperatorLine restaurant={restaurant} />
            {showMenuTip && (
              <div className="bg-[#6d5efc]/10 border border-[#6d5efc]/40 rounded-lg p-3 flex items-start justify-between gap-2">
                <p className="text-xs text-[#a79bff] leading-relaxed">התפריט יובא בהצלחה! מכאן תוכלו תמיד להוסיף, לערוך או למחוק מנות עם הכפתור "הוסף מנה".</p>
                <button onClick={() => setShowMenuTip(false)} className="text-[#8a8aa0] shrink-0"><X size={14} /></button>
              </div>
            )}
            <button
              onClick={handleAddDish}
              className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-[#5b4ef0] transition text-sm"
            >
              <Plus size={18} /> הוסף מנה
            </button>

            {showAddForm && (
              <DishForm
                item={editingItem}
                onChange={setEditingItem}
                onSave={handleSaveDish}
                onCancel={() => { setShowAddForm(false); setEditingItem(null); }}
                onDelete={editingItem?.id ? async () => {
                  await handleDeleteDish(editingItem.id);
                  setShowAddForm(false);
                  setEditingItem(null);
                } : undefined}
                existingCategories={existingCategories}
              />
            )}

            {/* The owner fixes and asks; the operator builds. Structural work — a new
                menu, moving a category — goes out as a request rather than living as a
                button they would rarely use correctly. */}
            {menuGroups.length > 1 && !menuGroupView && (
              <div className="space-y-2">
                {menuGroups.map((g) => {
                  const inGroup = items.filter((i) => i.menuGroup === g);
                  const catCount = new Set(inGroup.map((i) => i.category)).size;
                  return (
                    <button
                      key={g}
                      onClick={() => setMenuGroupView(g)}
                      className="w-full text-right bg-[#16181c] border border-[#22252b] rounded-xl p-3.5 hover:border-[#6d5efc]/50 transition flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-[#eef0f6]">{g}</span>
                        <span className="block text-[11px] text-[#8a8aa0] mt-0.5">{catCount} קטגוריות · {inGroup.length} פריטים</span>
                      </span>
                      <ChevronLeft size={18} className="text-[#8a8aa0] flex-shrink-0" />
                    </button>
                  );
                })}
                <p className="text-[11px] text-[#5a5a6e] text-center leading-relaxed pt-1">
                  מבנה התפריטים מוגדר מראש. לשינוי — שלחו לנו בקשה מהתיבה למעלה.
                </p>
              </div>
            )}

            {menuGroupView && (
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setMenuGroupView(null)}
                  title="חזרה לכל התפריטים"
                  className="w-10 h-10 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#eef0f6] flex-shrink-0"
                >
                  <ChevronRight size={19} />
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-[#5a5a6e]">התפריטים</p>
                  <p className="text-sm font-black text-[#eef0f6] line-clamp-1">{menuGroupView}</p>
                </div>
              </div>
            )}

            {existingCategories.length === 0 && items.length === 0 && (
              <p className="text-sm text-[#8a8aa0] text-center py-6">התפריט שלכם בהכנה אצלנו ויופיע כאן בקרוב. אפשר גם להוסיף מנות ידנית בכל רגע.</p>
            )}

            {(menuGroups.length > 1 && !menuGroupView ? [] : shownCategories).map((cat) => {
              const vis = categoryVisual(cat);
              return (
              <div key={cat} className="space-y-2">
                {aurora ? (
                  <div className="au-cathead">
                    <span className="ic" aria-hidden>{vis.emoji}</span>
                    <b>{cat}</b>
                    <span>{items.filter((i) => i.category === cat).length} מנות</span>
                  </div>
                ) : (
                <div className="flex items-center gap-2 px-1">
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[13px] shrink-0"
                    style={{ background: `linear-gradient(135deg, ${vis.from}, ${vis.to}55)` }}
                    aria-hidden
                  >
                    {vis.emoji}
                  </span>
                  <p className="text-xs font-bold text-[#8a8aa0]">{cat}</p>
                </div>
                )}
                {items.filter((i) => i.category === cat).map((item) => (
                  aurora ? (
                  /* Under the skin the photo leads: a 78px tile instead of a 36px
                     thumbnail, because the picture is how an owner recognises the dish
                     at a glance. No photo ⇒ the category visual stands in, same as before. */
                  <div
                    key={item.id}
                    onClick={() => openDishEditor(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") openDishEditor(item); }}
                    className={`glass au-dish ${item.starred ? "starred" : ""} ${!item.description ? "warn" : ""}`}
                  >
                    <span className="ph" aria-hidden>
                      {item.image_url
                        ? <img src={item.image_url} alt="" loading="lazy" />
                        : vis.emoji}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-start gap-2">
                        <h3 className="flex-1 min-w-0">{item.name}</h3>
                        {item.price ? <span className="price">{item.price} ₪</span> : null}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleStar(item); }}
                          title={item.starred ? "מנה מודגשת — הצוות מתרגל אותה בעדיפות. לחצו להסרת ההדגשה." : "הדגישו מנה שחשוב במיוחד שהצוות ידע — היא תקבל עדיפות בלימוד."}
                          aria-label={item.starred ? "הסרת הדגשה מהמנה" : "הדגשת המנה"}
                          className={`au-star ${item.starred ? "on" : ""}`}
                        >
                          <Star size={15} fill={item.starred ? "currentColor" : "none"} />
                        </button>
                      </span>
                      {item.description
                        ? <span className="desc line-clamp-2">{item.description}</span>
                        : <span className="desc" style={{ color: "var(--amber)" }}>אין תיאור — לחצו להוספה</span>}
                      {item.allergens?.length > 0 && (
                        <span className="flex flex-wrap gap-1.5 mt-1.5">
                          {item.allergens.map((a) => (
                            <span key={a} className="chip red"><i className="dot" />{a}</span>
                          ))}
                        </span>
                      )}
                    </span>
                  </div>
                  ) : (
                  <div
                    key={item.id}
                    /* One tap target: the card IS the edit button. The star is the only
                       other control (stopPropagation keeps it from opening the editor), and
                       delete moved INTO the editor behind a confirmation — an unconfirmed
                       delete on every card was an accident waiting to happen. */
                    onClick={() => openDishEditor(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") openDishEditor(item); }}
                    className={`bg-[#16181c] rounded-lg p-3 border cursor-pointer hover:border-[#6d5efc]/40 transition ${item.starred ? "border-[#f3a712]/50" : "border-[#22252b]"}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Real photo wins; until one exists, the category visual stands in. */}
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        ) : (
                          <span
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                            style={{ background: `linear-gradient(135deg, ${vis.from}, ${vis.to}44)` }}
                            aria-hidden
                          >
                            {vis.emoji}
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleStar(item); }}
                          title={item.starred ? "מנה מודגשת — הצוות מתרגל אותה בעדיפות. לחצו להסרת ההדגשה." : "הדגישו מנה שחשוב במיוחד שהצוות ידע — היא תקבל עדיפות בלימוד."}
                          aria-label={item.starred ? "הסרת הדגשה מהמנה" : "הדגשת המנה"}
                          className={`shrink-0 p-1 -m-1 transition ${item.starred ? "text-[#f3a712]" : "text-[#3a3d46] hover:text-[#8a8aa0]"}`}
                        >
                          <Star size={16} fill={item.starred ? "currentColor" : "none"} />
                        </button>
                        <p className="font-bold text-[#eef0f6] truncate">{item.name}</p>
                      </div>
                      <p className="font-bold text-[#6d5efc] shrink-0">₪{item.price}</p>
                    </div>
                    {/* The description is what the team learns; a missing one is called out
                        instead of silently blank. */}
                    {item.description ? (
                      <p className="text-xs text-[#8a8aa0] leading-relaxed mb-1.5">{item.description}</p>
                    ) : (
                      <p className="text-xs text-[#6a6a7e] italic mb-1.5">אין תיאור — לחצו להוספה. בלי תיאור, הצוות לומד רק שם ומחיר.</p>
                    )}
                    {item.allergens?.length > 0 && (
                      <p className="text-xs text-[#ff7a59] mb-1.5">אלרגנים: {item.allergens.join(", ")}</p>
                    )}
                    <p className="text-[10px] font-bold text-[#5a5a6e] flex items-center gap-1">
                      <Edit2 size={10} /> לחצו לעריכה
                    </p>
                  </div>
                  )
                ))}
              </div>
            );})}
          </div>
        )}

        {tab === "settings" && aurora && (
          <OwnerSettings
            restaurant={restaurant}
            teamMembers={teamMembers}
            memberPct={memberPct}
            itemCount={items.filter((i) => !(i.category || "").startsWith("הדרכת") && !(i.name || "").startsWith("מה חשוב לדעת")).length}
            openSetting={openSetting}
            setOpenSetting={setOpenSetting}
            onSelectMember={setSheetFor}
            onSignOut={onSignOut}
            sections={[
              {
                key: "team",
                emoji: "👥",
                title: "ניהול הצוות",
                summary: `${membersLabel(teamMembers.length)} · הסרת עובד שעזב`,
                node: (
                  <TeamRoster
                    restaurant={restaurant}
                    members={teamMembers}
                    tasksOff={tasksOff}
                    onRemoved={(id) => setTeamMembers((prev) => prev.filter((m) => m.id !== id))}
                  />
                ),
              },
              /* 🚫 REMOVED (user, 30.8): «בדיקת בריאות התפריט» ו«שינוי מתקדם
                 במסלול הלמידה». שניהם עבודה שהמנהל היה צריך לעשות בעצמו,
                 והכיוון הוא ההפוך — «המטרה שנעשה הכל עבורם». המסלול מוגדר
                 להמלצה שלנו והתפריט מתוקן אצלנו; הרכיבים עצמם נשארו בקוד
                 (וחיים בעור הישן) למי שירצה להחזיר אותם. */
              /* ⚠️ A restaurant with its own video never sees the step-by-step tour —
                 not on first run and not here (user, 29.8: "כנ״ל כשרוצים לראות אותו
                 מחדש בהגדרות תשים אותו ולא את ההסבר"). Two different explanations of
                 the same app is one too many, and the tour is the one that keeps going
                 stale every time a tab moves. */
              restaurant?.owner_welcome_video_url
                ? {
                    key: "tour",
                    emoji: "🎬",
                    title: "סרטון ההדרכה",
                    summary: "לצפות שוב — איך עובדים עם האפליקציה",
                    node: (
                      <button onClick={() => setWelcomeVideo(true)} className="au-wide">
                        🎬 לצפות בסרטון
                      </button>
                    ),
                  }
                : {
                    key: "tour",
                    emoji: "🧭",
                    title: "סיור מודרך באפליקציה",
                    summary: "לעבור שוב על מה שיש בכל טאב",
                    node: (
                      <button
                        onClick={() => { setTourActive(true); setTab("home"); }}
                        className="au-wide"
                      >
                        🧭 להתחיל את הסיור
                      </button>
                    ),
                  },
              {
                key: "feedback",
                emoji: "💡",
                title: "תרצו להוסיף משהו באפליקציה?",
                summary: "רעיון, בקשה או שיפור — כתבו לנו ונחזור אליכם",
                node: (
                  <OperatorLine
                    restaurant={restaurant}
                    title="תרצו להוסיף משהו באפליקציה? ספרו לנו"
                    placeholder="למשל: היה עוזר לי לקבל סיכום שבועי של הלמידה"
                    prefix="[הצעה לאפליקציה] "
                    showPending={false}
                  />
                ),
              },
              {
                key: "security",
                emoji: "🔐",
                title: "חשבון ואבטחה",
                summary: "החלפת סיסמה ומחיקת החשבון",
                node: (
                  <AccountSecurity
                    ownerCode={restaurant?.owner_code}
                    secondaryName={restaurant?.logged_in_as_name || null}
                    onDeleted={onSignOut}
                  />
                ),
              },
            ]}
          />
        )}

        {tab === "settings" && !aurora && (
          <div className="space-y-3">
            <p className="text-[11px] text-[#8a8aa0] px-1 leading-relaxed">
              כל כותרת מראה מה מוגדר שם עכשיו — אפשר לסרוק את הכל בלי לפתוח כלום.
            </p>
            {/* One grouped surface with hairline separators rather than eight floating
                cards: scanning stays vertical and uninterrupted. */}
            <div className="bg-[#16181c] border border-[#22252b] rounded-2xl overflow-hidden">
              <SettingsSection
                icon={<Target size={15} className="text-[#a79bff]" />}
                title="מה הצוות נבחן עליו ואיך לומדים"
                summary="דירוג הנושאים, סדר הקטגוריות, סף המעבר, יעד יומי ואורך המבחן"
                open={openSetting === "path"}
                onToggle={() => setOpenSetting(openSetting === "path" ? null : "path")}
              >
                <div id="learning-path-settings">
              <LearningPathSettings restaurant={restaurant} items={items} />
            </div>
              </SettingsSection>

              {/* Joining code + roster. Used when someone is hired or leaves — not daily,
                  which is why it stopped being a tab of its own. */}
              <SettingsSection
                icon={<Users size={15} className="text-[#6d5efc]" />}
                title="הצוות שלי"
                summary={`קוד הצטרפות ${restaurant?.team_code || "???"} · ${teamMembers.length} חברי צוות`}
                open={openSetting === "team"}
                onToggle={() => setOpenSetting(openSetting === "team" ? null : "team")}
              >
                <TeamRoster
                  restaurant={restaurant}
                  members={teamMembers}
                  onRemoved={(id) => setTeamMembers((prev) => prev.filter((m) => m.id !== id))}
                />
              </SettingsSection>

              <SettingsSection
                icon={<Stethoscope size={15} className="text-[#f3a712]" />}
                title="בדיקת בריאות התפריט"
                summary="מנות עם מידע חסר — תיקון קבוצות שלמות במכה"
                open={openSetting === "health"}
                onToggle={() => setOpenSetting(openSetting === "health" ? null : "health")}
              >
                <MenuHealthReview items={items} categories={existingCategories} onChanged={loadMenuItems} />
              </SettingsSection>

              <SettingsSection
                icon={<Store size={15} className="text-[#22c08c]" />}
                title="פרטי המסעדה"
                summary={[details?.name, ...(details?.cuisineTypes || [])].filter(Boolean).join(" · ") || "לא מוגדר"}
                open={openSetting === "details"}
                onToggle={() => setOpenSetting(openSetting === "details" ? null : "details")}
              >
                {!editingDetails ? (
              <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b] space-y-3">
                <p className="font-bold text-[#eef0f6]">פרטי המסעדה</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#8a8aa0]">שם</p>
                    <p className="text-sm text-[#eef0f6] font-bold">{details?.name || "לא מוגדר"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#8a8aa0]">סגנון האירוח</p>
                    <p className="text-sm text-[#eef0f6]">{SERVICE_STYLES.find((s) => s.id === details?.serviceStyle)?.title || "לא מוגדר"}</p>
                  </div>
                  {/* Moved here from the header — it is needed at login, not all day. */}
                  <div>
                    <p className="text-xs font-bold text-[#8a8aa0]">קוד בעלים (לכניסה)</p>
                    <p className="text-sm text-[#a79bff] font-black tracking-wide">{restaurant?.owner_code}</p>
                  </div>
                </div>
                {details?.cuisineTypes?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {details.cuisineTypes.map((c) => (
                      <span key={c} className="bg-[#6d5efc]/15 border border-[#6d5efc]/40 text-[#a79bff] text-xs font-bold px-2.5 py-1 rounded-full">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {details?.description && <p className="text-xs text-[#8a8aa0] leading-relaxed">{details.description}</p>}
                <button
                  onClick={() => { setEditingDetails(true); setDetailsForm(details || {}); }}
                  className="w-full bg-[#22252b] text-[#a79bff] font-bold py-2 rounded-lg text-sm hover:bg-[#2c2e35] transition"
                >
                  <Edit2 size={14} className="inline mr-1" /> עריכת הפרטים
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
              </SettingsSection>

              <SettingsSection
                icon={<UserPlus size={15} className="text-[#a79bff]" />}
                title="משתמשי ניהול נוספים"
                summary={ownerUsers.length ? `${ownerUsers.length} משתמשים נוספים` : "רק אתם"}
                open={openSetting === "managers"}
                onToggle={() => setOpenSetting(openSetting === "managers" ? null : "managers")}
              >
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
                  {addingManager ? "מוסיף…" : "הוספת משתמש"}
                </button>
              </div>
            </div>
              </SettingsSection>

              <SettingsSection
                icon={<ShieldCheck size={15} className="text-[#e0315a]" />}
                title="חשבון ואבטחה"
                summary="החלפת סיסמה ומחיקת החשבון"
                open={openSetting === "security"}
                onToggle={() => setOpenSetting(openSetting === "security" ? null : "security")}
              >
                <AccountSecurity ownerCode={restaurant?.owner_code} secondaryName={restaurant?.logged_in_as_name || null} onDeleted={onSignOut} />
              </SettingsSection>

              <SettingsSection
                icon={<Compass size={15} className="text-[#38bdf8]" />}
                title="סיור מודרך באפליקציה"
                summary="לעבור שוב על מה שיש בכל טאב"
                open={openSetting === "tour"}
                onToggle={() => setOpenSetting(openSetting === "tour" ? null : "tour")}
              >
                <button
              onClick={() => { setTourActive(true); setTab("home"); }}
              className="w-full bg-[#16181c] border border-[#22252b] text-[#a79bff] font-bold py-2.5 rounded-lg text-xs hover:border-[#6d5efc]/50 transition"
            >
              🧭 סיור מודרך באפליקציה — מה יש בכל טאב
            </button>
              </SettingsSection>

              {/* Feature requests, straight into the operator queue (user, 2026-08-23). */}
              <SettingsSection
                icon={<Lightbulb size={15} className="text-[#f3c98b]" />}
                title="תרצו להוסיף משהו באפליקציה?"
                summary="רעיון, בקשה או שיפור — כתבו לנו ונחזור אליכם"
                open={openSetting === "feedback"}
                onToggle={() => setOpenSetting(openSetting === "feedback" ? null : "feedback")}
              >
                <OperatorLine
                  restaurant={restaurant}
                  title="תרצו להוסיף משהו באפליקציה? ספרו לנו"
                  placeholder="למשל: היה עוזר לי לקבל סיכום שבועי של הלמידה"
                  prefix="[הצעה לאפליקציה] "
                  showPending={false}
                />
              </SettingsSection>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className={aurora ? "au-nav" : "border-t border-[#22252b] bg-[#16181c]"}>
        {/* 🔴 The inset belongs to exactly one element. `.au-nav` above already pads by
            `4px + safe-area-inset-bottom`, so leaving it here too paid for the home
            indicator TWICE — ~72px of black under the labels on a real iPhone, and
            nothing at all in a desktop browser where the inset is 0. That is the gap
            the user kept reporting. The legacy skin has no `.au-nav`, so it keeps it. */}
        <div className={`grid grid-cols-3 gap-1 p-2 ${aurora ? "au-tabs" : "pb-[max(0.5rem,env(safe-area-inset-bottom))]"}`}>
          <NavButton aurora={aurora} emoji="🏠" icon={<Home size={18} />} label="בית" active={tab === "home"} onClick={() => setTab("home")} />
          <NavButton aurora={aurora} emoji="📖" icon={<BookOpen size={18} />} label="תפריט" active={tab === "menu"} onClick={() => setTab("menu")} />
          <NavButton aurora={aurora} emoji="⚙️" icon={<Settings size={18} />} label="הגדרות" active={tab === "settings"} onClick={() => setTab("settings")} />
        </div>
      </div>

      {/* 🔴 These overlays are siblings of the nav, never children of it.
          They used to sit inside that <div>, which was invisible while it was a plain
          bar — but `.au-nav` carries `backdrop-filter`, and any value other than `none`
          makes an element the containing block for its `position:fixed` descendants.
          Every one of these is `fixed inset-0`, so they were being sized against the
          108px tab bar: the member sheet, the nudge dialog, the profile gate and the
          tour welcome all rendered as a sliver behind the tabs. Measured, not guessed —
          the sheet came back 375×108 instead of 375×812. Keep them out here. */}
      {showTeam && (
        <TeamScreen
          restaurant={restaurant}
          teamMembers={teamMembers}
          dailyBrief={dailyBrief}
          briefSent={briefSent}
          briefReadsToday={briefReadsToday}
          studiedToday={studiedToday}
          teamAvgPct={teamAvgPct}
          weakestMember={weakestMember}
          open={openHome}
          onToggle={setOpenHome}
          onSelectMember={setSheetFor}
          onRows={(rows) => setLiveByMember(Object.fromEntries(rows.map((r) => [r.id, r])))}
          onMessage={setMessageFor}
          onBroadcast={() => setBroadcastOpen(true)}
          messagedToday={messagedToday}
          onClose={() => setShowTeam(false)}
        >
          <>
            <SmartSuggestions
              restaurant={restaurant}
              items={items}
              onStarred={(ids) => setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, starred: true } : i)))}
            />
            <TeamProgressList
              teamMembers={teamMembers}
              memberPct={memberPct}
              taskDoneByMember={taskDoneByMember}
              activeTaskCount={activeTaskCount}
              onSelectMember={setSheetFor}
            />
          </>
        </TeamScreen>
      )}

      {loadDone && !restaurant?.owner_name && !restaurant?.logged_in_as_name &&
        !profileSkipped && !menuSetupActive && (
        <ProfileGate
          restaurant={restaurant}
          onDone={(patch) => onRestaurantUpdated?.({ ...restaurant, ...patch })}
          onSkip={() => { localStorage.setItem(profileSkipKey, "1"); setProfileSkipped(true); }}
        />
      )}

      {/* One waiter's full detail, opened from either home list. */}
      {sheetFor && (
        <MemberSheet
          detail={buildMemberDetail(sheetFor)}
          onClose={() => setSheetFor(null)}
          onMessage={() => setMessageFor(sheetFor)}
          tasksOff={tasksOff}
        />
      )}
      {messageFor && (
        <TeamMessageDialog
          tasksOff={tasksOff}
          member={teamMembers.find((m) => m.id === messageFor.id) || messageFor}
          restaurantId={restaurant?.id}
          lastSent={messagedToday[messageFor.id]}
          onClose={() => setMessageFor(null)}
          onSent={(id, body) => setMessagedToday((prev) => ({ ...prev, [id]: { body, readAt: null } }))}
        />
      )}
      {broadcastOpen && (
        <TeamMessageDialog
          tasksOff={tasksOff}
          members={teamMembers}
          restaurantId={restaurant?.id}
          onClose={() => setBroadcastOpen(false)}
          onSent={(id, body) => setMessagedToday((prev) => ({ ...prev, [id]: { body, readAt: null } }))}
        />
      )}
      {tourActive && (
        <GuidedTour
          onNavigate={setTab}
          onClose={handleTourClose}
          onSetupNow={handleTourSetupNow}
          teamCode={restaurant?.team_code}
          withWelcome={tourAutoRun}
          aurora={aurora}
          tasksOff={tasksOff}
        />
      )}
    </div>
  );
}

// The back row every home sub-view opens with, so "where am I and how do I get out"
// is answered the same way each time.
function ViewHeader({ title, subtitle, onBack }) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={onBack}
        aria-label="חזרה למשימות"
        className="w-9 h-9 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#eef0f6] flex-shrink-0"
      >
        <ChevronRight size={18} />
      </button>
      <div className="min-w-0">
        <p className="text-[13.5px] font-black text-[#eef0f6]">{title}</p>
        {subtitle && <p className="text-[10.5px] text-[#5a5a6e] leading-snug">{subtitle}</p>}
      </div>
    </div>
  );
}

function NavButton({ icon, emoji, label, active, onClick, aurora }) {
  // Under the skin the tab is an emoji over a glowing emerald line (user pick, 27.8);
  // without it, the original lucide icon in a purple pill. Same button, two wallpapers.
  if (aurora) {
    return (
      <button onClick={onClick} className={active ? "on" : ""}>
        <span className="ic" aria-hidden>{emoji}</span>
        <span>{label}</span>
      </button>
    );
  }
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

// Where every waiter stands — one line each, weakest first.
//
// This started as a full card per person: progress chart, the dishes they get wrong, exam
// chips and two status pills. That is a reasonable amount of detail and a hopeless amount
// of screen — at fifty waiters the owner scrolls past forty-nine people to find one (user,
// 2026-08-20: "אני בחיים לא אצליח לעקוב"). All of it still exists, one tap away, in
// MemberSheet; the list itself is now scannable.
//
// Sorted weakest-first because this list is a to-do, not a leaderboard.
function TeamProgressList({ teamMembers, memberPct, taskDoneByMember, activeTaskCount, onSelectMember }) {
  if (teamMembers.length === 0) {
    return (
      <p className="text-sm text-[#8a8aa0] text-center py-3 leading-relaxed">
        עדיין אין חברי צוות. קוד ההצטרפות מחכה בהגדרות → הצוות שלי.
      </p>
    );
  }
  const ranked = [...teamMembers]
    .map((m) => ({ m, pct: memberPct(m.id) }))
    .sort((a, b) => a.pct - b.pct);

  return (
    <div>
      {ranked.map(({ m, pct }) => {
        const done = taskDoneByMember[m.id] || 0;
        return (
          <MemberRow
            key={m.id}
            name={m.name}
            pct={pct}
            color={pct >= 80 ? "#22c08c" : pct >= 50 ? "#f3a712" : pct > 0 ? "#e0315a" : "#5a5a6e"}
            // The shift tasks they ticked off today, so the list carries both halves of
            // the job — what they know, and what they did.
            note={activeTaskCount ? `משימות ${done}/${activeTaskCount}` : null}
            onClick={() => onSelectMember({ id: m.id })}
          />
        );
      })}
      <p className="text-[10px] text-[#5a5a6e] text-center pt-2">לחצו על עובד לפרטים מלאים</p>
    </div>
  );
}

// The manual brief editor — the same typeahead fields as the assistant (user, 2026-08-21:
// "same for the rest of the daily brief"). Draft list fields stay comma-joined strings
// (that is the contract with handleSaveBrief); this component parses them into tags at
// the edge and joins them back on every change.
function DailyBriefEditor({ items, draft, onChange, onSave, saving }) {
  // Text mid-typing per field. Flushed into the draft when save is pressed, so "typed
  // but never confirmed" — the most common path — loses nothing.
  const [typing, setTyping] = useState({ missing: "", newItems: "", oven: "" });

  const parse = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
  const setField = (field) => (arr) => onChange({ ...draft, [field]: [...new Set(arr)].join(", ") });

  const saveAll = () => {
    // Compute the final draft HERE and hand it up — flushing via setState and then
    // reading state in the same tick would save the pre-flush draft.
    const final = { ...draft };
    for (const f of ["missing", "newItems", "oven"]) {
      const t = typing[f].trim();
      if (t) final[f] = [...new Set([...parse(draft[f]), t])].join(", ");
    }
    setTyping({ missing: "", newItems: "", oven: "" });
    onSave(final);
  };

  const Field = (field, label, placeholder, tone) => (
    <div>
      <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">{label}</p>
      <TagField
        items={items}
        picked={parse(draft[field])}
        onPicked={setField(field)}
        text={typing[field]}
        onText={(v) => setTyping((t) => ({ ...t, [field]: v }))}
        placeholder={placeholder}
        tone={tone}
      />
    </div>
  );

  return (
    <div className="bg-[#16181c] rounded-lg p-4 border border-[#22252b] space-y-3">
      <p className="font-bold text-[#eef0f6]">העדכון היומי לצוות</p>
      <p className="text-xs text-[#8a8aa0]">
        הקלידו — מנה מהתפריט תושלם אוטומטית, וכל דבר אחר יישמר כמו שכתבתם.
      </p>

      {Field("missing", "מה חסר היום", "למשל: סלמון…", "red")}
      {Field("newItems", "חדש / ממליצים היום", "למשל: קינוח היום…", "green")}
      {Field("oven", "בתנור / בהכנה", "למשל: לחם בייתי…", "green")}

      <div>
        <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">הערות נוספות</p>
        <textarea
          value={draft.notes}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          placeholder="כל דבר נוסף שהצוות צריך לדעת היום…"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm resize-none"
          rows="2"
          dir="rtl"
        />
      </div>

      <button
        onClick={saveAll}
        disabled={saving}
        className="w-full bg-[#6d5efc] text-white font-bold py-2.5 min-h-[44px] rounded-lg text-sm hover:bg-[#5b4ef0] transition disabled:opacity-60"
      >
        {saving ? "שומר…" : "שמירת העדכון היומי"}
      </button>
    </div>
  );
}

function MenuSetupTutorial({ restaurant, onDone }) {
  // Which warning groups matter is asked before the menu arrives — the parser needs to
  // know what to look for, and a group added afterwards means re-reading every dish.
  const [phase, setPhase] = useState(
    restaurant?.tracked_flags?.length ? "paste" : "flags"
  ); // flags | paste | photos | transcript | questions | review
  const [trackedFlags, setTrackedFlags] = useState(() => effectiveTrackedFlags(restaurant?.tracked_flags));
  const [rawText, setRawText] = useState("");
  const [categories, setCategories] = useState([]);
  const [generalNotes, setGeneralNotes] = useState([]);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  // Menus rarely fit in one photo — a folded card is two sides, a big menu is several
  // pages. They are collected and sent together so the parser sees one whole menu, in
  // order, instead of guessing how disconnected fragments relate.
  const [photos, setPhotos] = useState([]);
  // What the model read off the photos. Shown for the owner to proofread before anything
  // is saved — they are the only one who can tell a misread price from a real one.
  const [transcript, setTranscript] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Order is data: `position` (flat, across the whole menu) and category order both come
  // from the parser, which is told to preserve the printed menu's own sequence. The team
  // then learns the menu in the order the restaurant actually wrote it.
  const normalizeAiCategories = (cats) =>
    (cats || [])
      .map((c) => ({
        id: crypto.randomUUID(),
        name: c.name || "כללי",
        dishes: (c.dishes || []).map((d, i) => ({
          id: crypto.randomUUID(),
          position: Number.isFinite(d.position) ? d.position : i,
          name: d.name || "",
          price: d.price ?? "",
          description: d.description || "",
          ingredients: Array.isArray(d.ingredients) ? d.ingredients : [],
          allergens: Array.isArray(d.allergens) ? d.allergens : [],
          pregnancy: Array.isArray(d.pregnancy) ? d.pregnancy : [],
          pitfalls: Array.isArray(d.pitfalls) ? d.pitfalls : [],
          kashrut: Array.isArray(d.kashrut) ? d.kashrut : []
        }))
      }))
      .filter((c) => c.dishes.length > 0);

  const callParse = async (payload) => {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/menu-ai-parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data?.code === "missing_key") throw new Error("הפענוח החכם עוד לא הופעל — יש להגדיר מפתח AI ב-Supabase (Edge Functions → Secrets): ANTHROPIC_API_KEY או OPENROUTER_API_KEY.");
      throw new Error(data?.error === "model returned invalid JSON" ? "הפענוח החזיר תשובה שבורה — נסו שוב." : data?.error || "שגיאה בפענוח");
    }
    return data;
  };

  // Split a proofread transcript into chunks of WHOLE categories (never mid-category).
  //
  // ⚠️ Why chunking exists: structuring an entire 4-page menu in one call means one
  // giant JSON response, and on a real import that response came back malformed — a 502
  // after 67s, which read as "stuck" in the UI. Small outputs are reliably valid, run in
  // parallel, and a single broken chunk retries alone. Same finding, same fix, as the
  // per-photo transcription split.
  const splitTranscriptChunks = (text, maxLen = 2600) => {
    const blocks = [];
    let cur = [];
    for (const ln of text.split("\n")) {
      if (/^\s*##\s/.test(ln) && cur.length) { blocks.push(cur.join("\n")); cur = [ln]; }
      else cur.push(ln);
    }
    if (cur.length) blocks.push(cur.join("\n"));
    const chunks = [];
    let acc = "";
    for (const b of blocks) {
      if (acc && acc.length + b.length > maxLen) { chunks.push(acc); acc = b; }
      else acc = acc ? `${acc}\n${b}` : b;
    }
    if (acc.trim()) chunks.push(acc);
    return chunks.length ? chunks : [text];
  };

  // Cross-chunk ordering: each chunk is internally ordered by the parser, but only the
  // client sees all chunks, so the serving-order sort lives here. Stable sort — ties keep
  // transcript order. Applied only when there was more than one chunk; a single-chunk
  // paste keeps the parser's order untouched (which preserves the menu's own order).
  const COURSE_RANK = { starters: 0, mains: 1, sides: 2, desserts: 3, drinks: 4, alcohol: 5, other: 6 };
  const mergeParseResults = (results, sortByCourse) => {
    const byName = new Map();
    const order = [];
    for (const r of results) {
      for (const c of r.categories || []) {
        const key = String(c.name || "").replace(/[׳״'"]/g, "").trim();
        if (byName.has(key)) {
          // The same category split across two photos/chunks — one category, no dupes.
          const seen = byName.get(key);
          const have = new Set(seen.dishes.map((d) => String(d.name || "").trim()));
          seen.dishes = [...seen.dishes, ...(c.dishes || []).filter((d) => !have.has(String(d.name || "").trim()))];
        } else {
          byName.set(key, { ...c, dishes: [...(c.dishes || [])] });
          order.push(key);
        }
      }
    }
    let categories = order.map((k) => byName.get(k));
    if (sortByCourse) {
      categories = categories
        .map((c, i) => ({ c, i }))
        .sort((a, b) => ((COURSE_RANK[a.c.course] ?? 6) - (COURSE_RANK[b.c.course] ?? 6)) || (a.i - b.i))
        .map((x) => x.c);
    }
    return {
      categories,
      generalNotes: results.flatMap((r) => (Array.isArray(r.generalNotes) ? r.generalNotes : [])),
      offers: results.flatMap((r) => (Array.isArray(r.offers) ? r.offers : [])),
      questions: results.flatMap((r) => (Array.isArray(r.questions) ? r.questions : [])).slice(0, 3),
    };
  };

  // Deterministic fallback for a marked transcript. The transcription pass writes a
  // format WE designed — "## " heading, "~ " subtitle, "> " description, "name price"
  // dish lines — so when the AI structuring call fails, the client can still split the
  // text into categories and dishes by the markers alone and move on to review.
  //
  // ⚠️ This exists because the photo flow used to dead-end: transcription succeeded, the
  // structure call 502'd, and the owner was stuck on the confirm button (a refresh +
  // paste "worked" only because the paste path never used the AI). The AI pass is still
  // preferred — it fills allergen/pregnancy/pitfall flags; this fallback leaves them
  // empty and says so, which MenuHealthReview then surfaces as gaps to fix.
  const parseMarkedTranscript = (text) => {
    const cats = [];
    let cur = null;
    let lastDish = null;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || /^---/.test(line)) continue;
      if (/^#{1,3}\s/.test(line)) {
        cur = { name: line.replace(/^#{1,3}\s*/, ""), course: "other", subtitle: null, dishes: [] };
        cats.push(cur);
        lastDish = null;
        continue;
      }
      if (/^~\s?/.test(line)) {
        if (cur && !cur.subtitle) cur.subtitle = line.replace(/^~\s*/, "");
        continue;
      }
      if (/^>\s?/.test(line)) {
        if (lastDish) lastDish.description = lastDish.description ? `${lastDish.description} ${line.replace(/^>\s*/, "")}` : line.replace(/^>\s*/, "");
        continue;
      }
      const bare = line.replace(/^\?\?\s*/, "");
      const m = bare.match(/^(.*?)[\s.]*(\d{1,4})\s*$/);
      const name = (m ? m[1] : bare).trim();
      if (!name) continue;
      if (!cur) {
        cur = { name: "כללי", course: "other", subtitle: null, dishes: [] };
        cats.push(cur);
      }
      lastDish = { name, price: m ? Number(m[2]) : null, description: "", ingredients: [], allergens: [], pregnancy: [], pitfalls: [], kashrut: [] };
      cur.dishes.push(lastDish);
    }
    return cats.filter((c) => c.dishes.length);
  };

  // Structuring runs on Claude Haiku — a whole menu costs about an agora. Text payloads
  // go through the chunker above; a second round happens only when the model had a
  // genuine structural doubt and asked (group-level questions, never dish-by-dish).
  const runAi = async (payload) => {
    setAiBusy(true);
    setAiErr("");
    try {
      let data;
      if (payload.text) {
        const chunks = splitTranscriptChunks(payload.text);
        const results = await Promise.all(
          chunks.map(async (chunk) => {
            const body = { ...payload, text: chunk };
            try {
              return await callParse(body);
            } catch {
              // JSON breakage is stochastic — one retry recovers almost all of it.
              return await callParse(body);
            }
          }),
        );
        data = mergeParseResults(results, chunks.length > 1);
      } else {
        data = await callParse(payload);
      }
      const cats = normalizeAiCategories(data.categories);
      setGeneralNotes(Array.isArray(data.generalNotes) ? data.generalNotes : []);
      setCategories(cats.length ? cats : [{ id: crypto.randomUUID(), name: "עיקריות", dishes: [] }]);
      if (data.questions?.length > 0 && !payload.qa) {
        setAiQuestions(data.questions);
        setAnswers({});
        setPhase("questions");
      } else {
        setPhase("review");
      }
    } catch (e) {
      // The confirm button must never be a dead end: if the transcript carries our own
      // structure markers, split by them and continue to review instead of stopping.
      const fallback = payload.text ? parseMarkedTranscript(payload.text) : [];
      if (fallback.length) {
        setCategories(normalizeAiCategories(fallback));
        setGeneralNotes([]);
        setAiQuestions([]);
        setAiErr("");
        setPhase("review");
        // The owner still needs to know the smart pass didn't run.
        setTimeout(() => setAiErr("⚠️ הזיהוי החכם של אלרגנים ורגישויות לא הצליח הפעם — התפריט חולק לפי המבנה בלבד. סמנו אלרגנים ידנית, או נסו לייבא שוב מאוחר יותר."), 0);
      } else {
        setAiErr(e.message);
      }
    } finally {
      setAiBusy(false);
    }
  };

  // Cheap-first: the free price-based parser handles classic menus; the AI only runs
  // when it comes back thin (e.g. a menu with no prices at all, like a sushi spec sheet).
  //
  // ⚠️ Except marked transcripts. A pasted text that carries our transcription markers
  // (## heading, ~ subtitle, > description) is a photo transcript being re-imported —
  // the price parser doesn't know the markers, so a "~ ניחוחות של פסטה…" subtitle
  // line leaked into the menu as a dish. Marked text goes down the smart path, which
  // understands the markers and falls back to parseMarkedTranscript if the AI fails.
  const handleParse = async () => {
    if (/^\s*(?:#{1,3}|~|>)\s/m.test(rawText)) {
      await runAi({ text: rawText });
      return;
    }
    const parsed = parseMenuText(rawText);
    const dishCount = parsed.reduce((n, c) => n + c.dishes.length, 0);
    if (dishCount >= 3) {
      setCategories(parsed.map((c) => ({ ...c, dishes: c.dishes.map((d) => ({ ingredients: [], allergens: [], pitfalls: [], ...d })) })));
      setPhase("review");
      return;
    }
    await runAi({ text: rawText });
  };

  const saveTrackedFlags = async () => {
    setAiBusy(true);
    const { error } = await db.from("restaurants")
      .update({ tracked_flags: trackedFlags }).eq("id", restaurant.id);
    if (error) console.error("could not save tracked flags:", error);
    setAiBusy(false);
    setPhase("paste");
  };

  // Picking photos only stages them. Nothing is sent until the owner confirms the set is
  // the whole menu — sending on selection made a two-page menu impossible to import.
  const addPhotos = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setAiErr("");
    try {
      const added = await Promise.all(files.map((f) => downscaleImage(f)));
      setPhotos((prev) => [...prev, ...added.map((img, i) => ({ ...img, id: crypto.randomUUID(), label: files[i].name }))]);
      setPhase("photos");
    } catch (err) {
      setAiErr(err.message);
    }
  };

  // Photos go through their own pass first: picture -> plain text. Reading a menu off a
  // photo is where the mistakes are, so the owner proofreads that text before it becomes
  // dishes. (Text pasted directly skips straight to structuring — nothing to misread.)
  //
  // ⚠️ One request PER PHOTO, in parallel — not one request with every photo. Measured on
  // the real Salon Yevani menu: the whole menu in one call runs ~150s of generation and
  // hits the edge-function gateway timeout (504); per-page calls each finish in ~60-80s,
  // run concurrently, and a single bad page fails alone instead of sinking the import.
  // Page order doesn't matter here — the structure step re-orders categories by course.
  const transcribePhotos = async () => {
    if (!photos.length) return;
    setAiBusy(true);
    setAiErr("");
    try {
      const results = await Promise.all(
        photos.map(async ({ media_type, data }) => {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/menu-ai-parse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "transcribe", images: [{ media_type, data }] }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (body?.code === "missing_key") throw new Error("הפענוח החכם עוד לא הופעל — יש להגדיר מפתח AI ב-Supabase (Edge Functions → Secrets): ANTHROPIC_API_KEY או OPENROUTER_API_KEY.");
            return { failed: true };
          }
          return body;
        }),
      );

      // A page the model says it could not read must stop the import, not pass through.
      // Its alternative to admitting that is inventing a menu that looks entirely real,
      // and the owner has no way to tell the difference from the transcript alone.
      const badPages = results
        .map((r, i) => (r.failed || r.unreadable?.length || !(r.transcript || "").trim() ? i + 1 : null))
        .filter(Boolean);
      if (badPages.length) {
        throw new Error(
          photos.length > 1
            ? `לא הצלחנו לקרוא את התמונות ${badPages.join(", ")}. צלמו אותן שוב — קרוב יותר, ישר מלמעלה ובתאורה טובה. עדיף לצלם חצי עמוד בכל פעם מאשר עמוד שלם.`
            : "התמונה לא ברורה מספיק לקריאה. צלמו שוב קרוב יותר, ישר מלמעלה ובתאורה טובה — ואם התפריט צפוף, צלמו אותו בחלקים.",
        );
      }

      const t = stripProcessArtifacts(
        results
          .map((r, i) => (results.length > 1 ? `--- תמונה ${i + 1} ---\n${r.transcript}` : r.transcript))
          .join("\n"),
      );
      if (!t) throw new Error("לא הצלחנו לקרוא טקסט מהתמונות. נסו לצלם מקרוב יותר ובתאורה טובה.");
      setTranscript(t);
      setPhase("transcript");
    } catch (err) {
      setAiErr(err.message);
    } finally {
      setAiBusy(false);
    }
  };

  // The approved transcript is the source of truth from here on — the owner has read it,
  // so it beats the photo. Structuring always runs on this text, edited or not.
  const confirmTranscript = async (edited) => {
    const finalText = (edited || transcript).trim();
    setRawText(finalText);
    await runAi({ text: finalText });
  };

  const handleAnswers = async () => {
    const qa = aiQuestions
      .map((q) => ({ question: q.question, answer: (answers[q.id] || "").trim() }))
      .filter((x) => x.answer);
    await runAi({ text: rawText.trim() || undefined, qa });
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
    setCategories(categories.map((c) => (c.id === catId ? { ...c, dishes: [...c.dishes, { id: crypto.randomUUID(), name: "", price: 0, description: "", ingredients: [], allergens: [], pitfalls: [] }] } : c)));

  const totalDishes = categories.reduce((n, c) => n + c.dishes.length, 0);

  const handleSaveAll = async () => {
    setSaving(true);
    // menu_position is the dish's place in the printed menu, counted straight through
    // every category. A bulk insert gives all 38 dishes the same created_at, so without
    // this the menu's own order is lost and the learning path falls back to arbitrary.
    let position = 0;
    const tracked = effectiveTrackedFlags(restaurant?.tracked_flags);
    const rows = categories.flatMap((cat) =>
      cat.dishes
        .filter((d) => d.name.trim())
        .map((d) => ({
          restaurant_id: restaurant.id,
          category: (cat.name || "כללי").trim(),
          name: d.name.trim(),
          price: Number(d.price) || 0,
          description: d.description || "",
          ingredients: d.ingredients || [],
          // Four separate warning groups — an allergy, a pregnancy risk and a "no
          // coriander please" are different facts and a waiter must be able to tell
          // them apart. Only the groups this restaurant tracks are written.
          allergens: tracked.includes("allergens") ? d.allergens || [] : [],
          pregnancy: tracked.includes("pregnancy") ? d.pregnancy || [] : [],
          pitfalls: tracked.includes("pitfalls") ? d.pitfalls || [] : [],
          kashrut: tracked.includes("kashrut") ? d.kashrut || [] : [],
          menu_position: position++,
          is_special: false,
          // A whole-menu import is the team's baseline, not "new dishes" — nothing gets
          // the automatic new-dish star here. Only stars the owner approved on the
          // emphasis card (or toggled by hand in review) are written.
          starred: !!d.starred
        }))
    );
    if (rows.length > 0) {
      const { error } = await db.from("menu_items").insert(rows);
      if (error) { alert("שמירה נכשלה: " + error.message); setSaving(false); return; }

      // Seed the learning order from the menu's own order. Only written when the owner
      // hasn't arranged it themselves — their arrangement always outranks the import.
      const catOrder = categories.map((c) => (c.name || "כללי").trim()).filter(Boolean);
      const { data: cfg } = await db.from("exam_config")
        .select("category_order").eq("restaurant_id", restaurant.id).maybeSingle();
      if (!cfg?.category_order?.length) {
        const { error: cfgErr } = await db.from("exam_config").upsert(
          { restaurant_id: restaurant.id, category_order: catOrder, updated_at: new Date().toISOString() },
          { onConflict: "restaurant_id" }
        );
        if (cfgErr) console.error("could not seed learning order:", cfgErr);
      }
    }
    // Menu-wide notes the parser found (e.g. "טריאקי וסויה — גלוטן") belong in the
    // service notes the waiter app already shows in its welcome briefing.
    if (generalNotes.length > 0) {
      const merged = [restaurant.service_notes, ...generalNotes].filter(Boolean).join("\n");
      await db.from("restaurants").update({ service_notes: merged }).eq("id", restaurant.id);
    }
    setSaving(false);
    onDone(rows.length);
  };

  return (
    <div className="h-screen max-w-md mx-auto bg-[#0c0d10] text-[#eef0f6] flex flex-col" dir="rtl">
      <div className="px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-4 text-center border-b border-[#22252b]">
        <div className="w-12 h-12 rounded-2xl bg-[#15302b] flex items-center justify-center mx-auto mb-3">
          <ClipboardPaste size={22} className="text-[#2f9e8f]" />
        </div>
        <h1 className="text-2xl font-black">בואו נייבא את התפריט שלכם</h1>
        <p className="text-sm text-[#8a8aa0] mt-1">
          {phase === "paste" ? "שלב 1 מתוך 2"
            : phase === "photos" ? "התמונות של התפריט"
            : phase === "transcript" ? "בדיקת הקריאה"
            : phase === "questions" ? "רגע של הבהרה"
            : "שלב 2 מתוך 2"}
        </p>
      </div>

      {phase === "flags" ? (
        <FlagGroupPicker
          value={trackedFlags}
          onChange={setTrackedFlags}
          busy={aiBusy}
          onContinue={saveTrackedFlags}
        />
      ) : phase === "paste" ? (
        <>
          <div className="flex-1 px-6 py-6 overflow-y-auto space-y-4">
            <p className="text-sm text-[#8a8aa0] leading-relaxed">
              הדביקו את התפריט שלכם כמו שהוא — בכל פורמט — או צלמו אותו. נזהה קטגוריות, מנות, מרכיבים ואלרגנים אוטומטית, ואם משהו לא יהיה ברור נשאל אתכם שאלה קצרה במקום לנחש. הכל ניתן לתיקון במסך הבא לפני שמירה.
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={"ראשונות\nחומוס 32\nסלט יווני 38\n\nעיקריות\nפילה סלמון 78\nאנטריקוט 120"}
              className="w-full bg-[#16181c] border border-[#22252b] rounded-xl px-3 py-3 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] resize-none font-mono text-sm"
              rows="10"
              dir="rtl"
            />
            {aiErr && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" /> {aiErr}</p>}
            {aiBusy && <p className="text-xs font-bold text-[#a79bff]">מפענח את התפריט... זה לוקח כמה שניות</p>}
          </div>
          <div className="px-6 pb-6 space-y-3 border-t border-[#22252b] pt-4">
            <button
              onClick={handleParse}
              disabled={!rawText.trim() || aiBusy}
              className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition disabled:opacity-40"
            >
              {aiBusy ? "מפענח…" : "פענוח אוטומטי"}
            </button>
            <label className={`w-full bg-[#22252b] text-[#eef0f6] font-bold py-3 rounded-lg hover:bg-[#2c2e35] transition flex items-center justify-center gap-2 cursor-pointer ${aiBusy ? "opacity-40 pointer-events-none" : ""}`}>
              <Camera size={16} /> צילום של התפריט
              <input type="file" accept="image/*" multiple onChange={addPhotos} className="hidden" />
            </label>
            <button onClick={handleSkip} disabled={aiBusy} className="w-full bg-[#22252b] text-[#8a8aa0] font-bold py-3 rounded-lg hover:bg-[#2c2e35] transition disabled:opacity-40">
              אמלא ידנית בעצמי
            </button>
          </div>
        </>
      ) : phase === "photos" ? (
        <PhotoTray
          photos={photos}
          onAdd={addPhotos}
          onRemove={(id) => setPhotos((prev) => prev.filter((p) => p.id !== id))}
          onBack={() => { setPhotos([]); setPhase("paste"); }}
          onSend={transcribePhotos}
          busy={aiBusy}
          error={aiErr}
        />
      ) : phase === "transcript" ? (
        <TranscriptReview
          value={transcript}
          onChange={setTranscript}
          busy={aiBusy}
          error={aiErr}
          onConfirm={confirmTranscript}
        />
      ) : phase === "questions" ? (
        <>
          <div className="flex-1 px-6 py-6 overflow-y-auto space-y-4">
            <p className="text-sm text-[#8a8aa0] leading-relaxed">
              כמעט סיימנו — כדי לא לנחש, יש לנו {aiQuestions.length === 1 ? "שאלה קצרה אחת" : `${aiQuestions.length} שאלות קצרות`}:
            </p>
            {aiQuestions.map((q) => (
              <div key={q.id} className="bg-[#16181c] border border-[#22252b] rounded-xl p-3 space-y-2">
                <p className="text-sm font-bold text-[#eef0f6] leading-relaxed">{q.question}</p>
                <div className="flex flex-wrap gap-2">
                  {(q.options || []).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                      className={`text-xs font-bold px-3 py-2 rounded-full border transition ${
                        answers[q.id] === opt
                          ? "bg-[#6d5efc]/15 border-[#6d5efc] text-[#a79bff]"
                          : "bg-[#0c0d10] border-[#22252b] text-[#8a8aa0] hover:border-[#3a3d45]"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={(q.options || []).includes(answers[q.id]) ? "" : answers[q.id] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder="או כתבו תשובה משלכם…"
                  className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-xs"
                  dir="rtl"
                />
              </div>
            ))}
            {aiErr && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" /> {aiErr}</p>}
          </div>
          <div className="px-6 pb-6 space-y-3 border-t border-[#22252b] pt-4">
            <button
              onClick={handleAnswers}
              disabled={aiBusy || !aiQuestions.every((q) => (answers[q.id] || "").trim())}
              className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition disabled:opacity-40"
            >
              {aiBusy ? "מפענח…" : "המשך לפענוח סופי"}
            </button>
            <button onClick={() => setPhase("review")} disabled={aiBusy} className="w-full bg-[#22252b] text-[#8a8aa0] font-bold py-3 rounded-lg hover:bg-[#2c2e35] transition disabled:opacity-40">
              דלגו — אסדר בעצמי במסך הבא
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4">
            <p className="text-xs text-[#8a8aa0]">בדקו שהכל נכון — אפשר לשנות שמות קטגוריה, למחוק, להוסיף, ולתקן כל מנה. זה לוקח רק רגע.</p>
            <CategoryComposer
              categories={categories}
              onMerge={(ids, mergedName) => {
                setCategories((prev) => {
                  const selected = prev.filter((c) => ids.includes(c.id));
                  if (selected.length < 2) return prev;
                  const merged = {
                    id: selected[0].id,
                    name: mergedName || selected[0].name || "כללי",
                    dishes: selected.flatMap((c) => c.dishes),
                  };
                  let placed = false;
                  return prev.flatMap((c) => {
                    if (!ids.includes(c.id)) return [c];
                    if (!placed) { placed = true; return [merged]; }
                    return [];
                  });
                });
              }}
            />
            <EmphasisSuggestion categories={categories} onApprove={(ids) => {
              setCategories((prev) => prev.map((c) => ({ ...c, dishes: c.dishes.map((d) => (ids.includes(d.id) ? { ...d, starred: true } : d)) })));
            }} />
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
                    <div key={d.id} className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
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
                      {(d.description || d.ingredients?.length > 0 || d.allergens?.length > 0) && (
                        <p className="text-[10px] text-[#8a8aa0] px-1 leading-relaxed">
                          {d.description}
                          {d.ingredients?.length > 0 && (d.description ? " · " : "") + "מרכיבים: " + d.ingredients.join(", ")}
                          {d.allergens?.length > 0 && <span className="text-[#ff6b8f]"> · אלרגנים: {d.allergens.join(", ")}</span>}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => addDish(cat.id)} className="text-[11px] font-bold text-[#6d5efc]">+ הוסף מנה לקטגוריה</button>
              </div>
            ))}
            <button onClick={addCategory} className="w-full text-xs font-bold text-[#8a8aa0] border border-dashed border-[#22252b] rounded-lg py-2 hover:border-[#3a3d45] transition">
              + הוסף קטגוריה
            </button>
            {generalNotes.length > 0 && (
              <div className="bg-[#6d5efc]/10 border border-[#6d5efc]/40 rounded-xl p-3 space-y-1">
                <p className="text-xs font-bold text-[#a79bff]">דגשים כלליים שנמצאו בתפריט (יתווספו להערות השירות לצוות):</p>
                {generalNotes.map((n, i) => (
                  <p key={i} className="text-[11px] text-[#8a8aa0] leading-relaxed">• {n}</p>
                ))}
              </div>
            )}
          </div>
          <div className="px-6 pb-6 space-y-2 border-t border-[#22252b] pt-4">
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition disabled:opacity-60"
            >
              {saving ? "שומר…" : `שמירה — ${totalDishes} מנות`}
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

// "Like Lego" — the owner's words. Drink-heavy menus import as many tiny categories
// (every wine style its own heading); other owners want exactly that split. So neither is
// forced: select 2+ chips, name the result, merge. Splitting is the reverse — rename a
// category below or move dishes between them. Merging keeps the dishes' original order.
function CategoryComposer({ categories, onMerge }) {
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState("");
  if (categories.length < 2) return null;
  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const first = categories.find((c) => c.id === selected[0]);
  return (
    <div className="bg-[#16181c] border border-[#6d5efc]/30 rounded-xl p-3 space-y-2">
      <p className="text-xs font-bold text-[#eef0f6]">איך לחלק את התפריט? אתם קובעים — כמו לגו.</p>
      <p className="text-[11px] text-[#8a8aa0] leading-relaxed">
        התפריט התפצל ליותר מדי קטגוריות — למשל כל סוג יין בנפרד? סמנו כמה קטגוריות ואחדו אותן לאחת. מעדיפים פיצול? השאירו כמו שזה, או שנו שמות למטה.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full border transition ${
              selected.includes(c.id)
                ? "bg-[#6d5efc]/20 border-[#6d5efc] text-[#a79bff]"
                : "bg-[#0c0d10] border-[#22252b] text-[#8a8aa0] hover:border-[#3a3d45]"
            }`}
          >
            {c.name || "ללא שם"} · {c.dishes.length}
          </button>
        ))}
      </div>
      {selected.length >= 2 && (
        <div className="flex gap-2 items-center pt-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`שם לקטגוריה המאוחדת (ברירת מחדל: ${first?.name || "כללי"})`}
            dir="rtl"
            className="flex-1 bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-xs text-[#eef0f6] placeholder:text-[#6a6a7e] focus:outline-none focus:border-[#6d5efc]"
          />
          <button
            type="button"
            onClick={() => { onMerge(selected, name.trim()); setSelected([]); setName(""); }}
            className="bg-[#6d5efc] text-white text-xs font-bold px-3 py-2 rounded-lg shrink-0"
          >
            איחוד {selected.length} קטגוריות
          </button>
        </div>
      )}
    </div>
  );
}

function DishForm({ item, onChange, onSave, onCancel, onDelete, existingCategories, aurora, menuOf }) {
  // Two taps to delete, both inside the editor — the card itself no longer carries a
  // delete button at all.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const isNew = !item.id;

  const pickPhoto = async (file) => {
    if (!file) return;
    setPhotoErr(""); setUploading(true);
    try {
      onChange({ ...item, image_url: await uploadDishPhoto(file) });
    } catch (e) {
      setPhotoErr(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div id="dish-form" className="bg-[#16181c] rounded-lg p-4 border border-[#22252b] space-y-3">
      {/* ⚠️ The only way out used to be a "ביטול" button below a long form — off-screen on
          a phone the moment the editor opened. A form that fills the screen needs its exit
          where the eye starts, not where the form happens to end (user, 29.8).
          ⚠️ Skinned restaurants only, for now: the unskinned form is what Apple's reviewer
          and the Play testers have open, and during a review round even an improvement is
          a change. Lift the guard when the rounds are over. */}
      {aurora && (
      <div className="flex items-center gap-2 -mt-1">
        <p className="flex-1 text-sm font-black text-[#eef0f6]">
          {isNew ? "מנה חדשה" : "עריכת מנה"}
        </p>
        <button
          onClick={onCancel}
          aria-label={isNew ? "ביטול והסרת המנה החדשה" : "סגירה בלי לשמור"}
          title={isNew ? "ביטול" : "סגירה בלי לשמור"}
          className="w-9 h-9 rounded-lg bg-[#22252b] flex items-center justify-center text-[#8a8aa0] hover:text-[#eef0f6] transition flex-shrink-0"
        >
          <X size={16} />
        </button>
      </div>
      )}

      {/* The photo: the owner recognised the dish by it in the list, so it leads here too.
          Tapping it opens it full size — a 56px thumbnail cannot show whether the picture
          is the right one. */}
      {aurora && (
        <div className="flex items-center gap-3">
          {item.image_url ? (
            <button
              type="button"
              onClick={() => setZoom(true)}
              title="הגדלת התמונה"
              className="flex-shrink-0 rounded-xl active:scale-95 transition-transform"
            >
              <img
                src={item.image_url}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border border-[#22252b]"
              />
            </button>
          ) : (
            <div className="w-16 h-16 rounded-xl bg-[#0c0d10] border border-dashed border-[#3a3d46] flex items-center justify-center text-[#5a5a6e] flex-shrink-0">
              <Camera size={20} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <label className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--em,#22c08c)] cursor-pointer py-2">
              <Camera size={13} />
              {uploading ? "מעלה…" : item.image_url ? "החלפת התמונה" : "הוספת תמונה"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }}
              />
            </label>
            <p className="text-[11px] text-[#8a8aa0] leading-relaxed">
              {item.image_url ? "הקישו על התמונה כדי להגדיל" : "כך הצוות יזהה את המנה ברשימה"}
            </p>
          </div>
        </div>
      )}
      {photoErr && (
        <p className="text-[11px] text-[#ff8098] bg-[#3a1d22] border border-[#e0315a]/40 rounded-lg px-3 py-2">
          {photoErr}
        </p>
      )}
      {/* 🔴 Portalled to <body> on purpose. Under the skin every card surface carries
          `backdrop-filter` (aurora.css §14), and ANY value other than `none` makes an
          element the containing block for its `position:fixed` descendants — so this
          overlay, rendered inside the form, came out 333×1322 (the form's box) instead of
          filling the screen. Measured, not guessed. Same trap as the bottom nav. */}
      {zoom && item.image_url && createPortal(
        <button
          onClick={() => setZoom(false)}
          aria-label="סגירת התמונה"
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-6"
        >
          <img src={item.image_url} alt="" className="max-w-[86%] max-h-[70vh] rounded-2xl object-contain shadow-2xl" />
        </button>,
        document.body
      )}
      <input
        type="text"
        value={item.name}
        onChange={(e) => onChange({ ...item, name: e.target.value })}
        placeholder="שם המנה"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
        dir="rtl"
      />

      {/* The category is a CHOICE from this restaurant's own menu structure, not free
          text — we split their menu into ראשונות/עיקריות/קינוחים etc. when we build it,
          and a typo'd category would orphan the dish outside that structure. Free text
          only as a fallback for a menu that has no categories yet. */}
      {existingCategories.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-bold text-[#8a8aa0]">
            קטגוריה:
            {/* Which menu this lands in. The manager never picks it — it follows the
                category — but a dish quietly joining "תפריט הסושי" should say so. */}
            {menuOf?.(item.category) ? (
              <span className="font-normal text-[#5a5a6e]"> · יופיע ב{menuOf(item.category)}</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {existingCategories.map((c) => (
              <button
                key={c}
                onClick={() => onChange({ ...item, category: c })}
                className={`text-xs py-1.5 px-3 rounded-lg transition ${
                  item.category === c
                    ? "bg-[#6d5efc] text-white font-bold"
                    : "bg-[#22252b] text-[#8a8aa0] hover:bg-[#2c2e35]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <input
          type="text"
          value={item.category}
          onChange={(e) => onChange({ ...item, category: e.target.value })}
          placeholder="קטגוריה (לדוגמה: ראשונות, עיקריות...)"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
          dir="rtl"
        />
      )}

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

      {/* Ingredients drive most of the training questions, so they need to be editable
          here — not just whatever the AI import happened to extract. */}
      <IngredientEditor
        value={item.ingredients || []}
        onChange={(ingredients) => onChange({ ...item, ingredients })}
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

      <div className="space-y-2">
        <p className="text-xs font-bold text-[#8a8aa0]">רגישות בהריון <span className="font-normal">(לא אלרגיה — סיכון אחר)</span>:</p>
        <div className="grid grid-cols-3 gap-2">
          {PREGNANCY.map((flag) => (
            <button
              key={flag}
              onClick={() => {
                const current = item.pregnancy || [];
                onChange({
                  ...item,
                  pregnancy: current.includes(flag)
                    ? current.filter((p) => p !== flag)
                    : [...current, flag],
                });
              }}
              className={`text-xs py-1 rounded transition ${
                (item.pregnancy || []).includes(flag)
                  ? "bg-[#a06af0] text-white"
                  : "bg-[#22252b] text-[#8a8aa0] hover:bg-[#2c2e35]"
              }`}
            >
              {flag}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-[#8a8aa0]">מוקשים <span className="font-normal">(מה שאורחים מבקשים בלי — לא אלרגיה)</span>:</p>
        <div className="grid grid-cols-3 gap-2">
          {PITFALLS.map((pitfall) => (
            <button
              key={pitfall}
              onClick={() => {
                const current = item.pitfalls || [];
                onChange({
                  ...item,
                  pitfalls: current.includes(pitfall)
                    ? current.filter((p) => p !== pitfall)
                    : [...current, pitfall],
                });
              }}
              className={`text-xs py-1 rounded transition ${
                (item.pitfalls || []).includes(pitfall)
                  ? "bg-[#f3a712] text-[#0c0d10]"
                  : "bg-[#22252b] text-[#8a8aa0] hover:bg-[#2c2e35]"
              }`}
            >
              {pitfall}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-[#8a8aa0]">כשרות <span className="font-normal">(רק אם רלוונטי למסעדה שלכם)</span>:</p>
        <div className="grid grid-cols-3 gap-2">
          {KASHRUT.map((flag) => (
            <button
              key={flag}
              onClick={() => {
                const current = item.kashrut || [];
                onChange({
                  ...item,
                  kashrut: current.includes(flag)
                    ? current.filter((k) => k !== flag)
                    : [...current, flag],
                });
              }}
              className={`text-xs py-1 rounded transition ${
                (item.kashrut || []).includes(flag)
                  ? "bg-[#3b82f6] text-white"
                  : "bg-[#22252b] text-[#8a8aa0] hover:bg-[#2c2e35]"
              }`}
            >
              {flag}
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
          className="flex-1 bg-[#6d5efc] text-white font-bold py-2.5 min-h-[44px] rounded-lg text-sm hover:bg-[#5b4ef0] transition"
        >
          <Check size={14} className="inline mr-1" /> שמירה
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-[#22252b] text-[#8a8aa0] font-bold py-2.5 min-h-[44px] rounded-lg text-sm hover:bg-[#2c2e35] transition"
        >
          ביטול
        </button>
      </div>

      {onDelete && (
        !confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="w-full text-[11px] font-bold text-[#8a8aa0] py-1.5 hover:text-[#e0315a] transition"
          >
            <Trash2 size={11} className="inline ml-1" /> מחיקת המנה מהתפריט
          </button>
        ) : (
          <div className="bg-[#3a1d22] border border-[#e0315a]/40 rounded-lg p-3 space-y-2">
            <p className="text-[11px] text-[#eef0f6] leading-relaxed">
              למחוק את ״{item.name}״? המנה תוסר גם מאפליקציית הצוות, וההתקדמות עליה תימחק.
            </p>
            <div className="flex gap-2">
              <button onClick={onDelete} className="flex-1 bg-[#e0315a] text-white text-[11px] font-black py-2 rounded-lg">
                כן, למחוק
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="px-4 bg-[#22252b] text-[#8a8aa0] text-[11px] font-black py-2 rounded-lg">
                ביטול
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// The transcription prompt walks the model through two passes (read, then proofread
// against the image). Occasionally it writes those step names into the output — a real
// run came back with "## מעבר 1 — תמלול" as the first line, which then read as a menu
// category called "Pass 1". The prompt forbids it; this makes sure of it, because a
// stray heading here silently becomes a category the team is taught.
// Also catches an attached Hebrew prefix ("התמלול", "בתמלול") and the proofreader's
// sign-off — a review run came back with "התמלול נבדק מול התמונה. כל המילים תקינים."
// as a line of its own, which would read as a menu category.
const PROCESS_ARTIFACT_RE =
  /^\s*#{0,3}\s*[הבו]?(מעבר\s*\d|תמלול|הגהה|pass\s*\d|transcription|proofread)\b.*$|נבדק מול הת|כל המילים והמספרים/i;
function stripProcessArtifacts(text) {
  return String(text)
    .split("\n")
    .filter((line) => !PROCESS_ARTIFACT_RE.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Asked once, before the menu is imported: which kinds of warning does this restaurant
// need its team to know? A kosher restaurant tracks kashrut; a bar probably doesn't; a
// place with no raw dishes has nothing to say about pregnancy. Asking beats assuming —
// tracking a group that doesn't apply just fills the menu with empty fields, and missing
// one that does leaves a waiter unable to answer a real question at the table.
function FlagGroupPicker({ value, onChange, onContinue, busy }) {
  const toggle = (key) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <>
      <div className="flex-1 px-6 py-6 overflow-y-auto space-y-4">
        <div>
          <p className="text-sm font-bold text-[#eef0f6] mb-1">על מה הצוות צריך לדעת לענות?</p>
          <p className="text-xs text-[#8a8aa0] leading-relaxed">
            נסמן את זה על כל מנה בזמן הייבוא. אפשר לשנות אחר כך בהגדרות.
          </p>
        </div>

        <div className="space-y-2">
          {FLAG_GROUPS.map((g) => {
            const on = value.includes(g.key);
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => toggle(g.key)}
                className={`w-full text-right p-3 rounded-lg border transition ${
                  on ? "bg-[#1a1735] border-[#6d5efc]" : "bg-[#16181c] border-[#22252b] hover:border-[#3a3d46]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center text-[10px] font-black ${
                    on ? "bg-[#6d5efc] text-white" : "border border-[#3a3d46] text-transparent"
                  }`}>✓</span>
                  <span className="flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#eef0f6]">{g.label}</span>
                      {g.severity === "critical" && (
                        <span className="text-[9px] font-bold bg-[#3a1620] text-[#ff8fa6] px-1.5 py-0.5 rounded">בטיחות</span>
                      )}
                      {g.recommended && (
                        <span className="text-[9px] font-bold text-[#a79bff]">מומלץ</span>
                      )}
                    </span>
                    <span className="block text-[11px] text-[#8a8aa0] mt-0.5 leading-relaxed">{g.description}</span>
                    <span className="block text-[10px] text-[#6a6a7e] mt-1">
                      {g.values.slice(0, 5).join(" · ")}{g.values.length > 5 ? " ·  ועוד" : ""}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-6 pb-6 border-t border-[#22252b] pt-4">
        <button
          onClick={onContinue}
          disabled={busy || value.length === 0}
          className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition disabled:opacity-40"
        >
          {busy ? "שומר…" : value.length ? "המשך לייבוא התפריט" : "בחרו לפחות אחד"}
        </button>
      </div>
    </>
  );
}

// Staging area for menu photos. A menu is usually more than one picture — a folded card
// has two sides, a large menu runs several pages — and they have to arrive together so
// the parser reads one menu in order rather than guessing how fragments relate. Nothing
// is sent until the owner says the set is complete.
function PhotoTray({ photos, onAdd, onRemove, onBack, onSend, busy, error }) {
  return (
    <>
      <div className="flex-1 px-6 py-6 overflow-y-auto space-y-4">
        <div>
          <p className="text-sm font-bold text-[#eef0f6] mb-1">זה כל התפריט?</p>
          <p className="text-xs text-[#8a8aa0] leading-relaxed">
            אם התפריט מתפרס על כמה עמודים או שני צדדים — הוסיפו את כל התמונות לפני השליחה,
            לפי הסדר שבו הן מופיעות בתפריט. ככה נדע גם באיזה סדר ללמד.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div key={p.id} className="relative rounded-lg overflow-hidden border border-[#22252b] bg-[#0c0d10]">
              <img src={`data:${p.media_type};base64,${p.data}`} alt={`עמוד ${i + 1}`} className="w-full h-28 object-cover" />
              <span className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                {i + 1}
              </span>
              <button
                onClick={() => onRemove(p.id)}
                disabled={busy}
                aria-label={`הסרת עמוד ${i + 1}`}
                className="absolute top-1 left-1 bg-black/70 text-white w-5 h-5 rounded flex items-center justify-center text-xs font-bold hover:bg-[#e0315a] disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
          <label className={`h-28 rounded-lg border border-dashed border-[#3a3d46] flex flex-col items-center justify-center gap-1 cursor-pointer text-[#8a8aa0] hover:border-[#6d5efc] hover:text-[#a79bff] transition ${busy ? "opacity-40 pointer-events-none" : ""}`}>
            <Camera size={18} />
            <span className="text-[10px] font-bold">הוספת תמונה</span>
            <input type="file" accept="image/*" multiple onChange={onAdd} className="hidden" />
          </label>
        </div>

        {error && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" /> {error}</p>}
        {busy && <p className="text-xs font-bold text-[#a79bff]">קורא את התפריט מהתמונות… זה לוקח כמה שניות</p>}
      </div>

      <div className="px-6 pb-6 space-y-3 border-t border-[#22252b] pt-4">
        <button
          onClick={onSend}
          disabled={busy || photos.length === 0}
          className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition disabled:opacity-40"
        >
          {busy ? "קורא…" : `שליחה — ${photos.length} ${photos.length === 1 ? "תמונה" : "תמונות"}`}
        </button>
        <button onClick={onBack} disabled={busy} className="w-full bg-[#22252b] text-[#8a8aa0] font-bold py-3 rounded-lg hover:bg-[#2c2e35] transition disabled:opacity-40">
          ביטול
        </button>
      </div>
    </>
  );
}

// Feature 2 of the optimization round: the import already knows which dishes are the
// complex ones — many ingredients, several warning flags — so instead of a settings
// screen, the review step OFFERS to emphasise them and the owner approves with one tap.
// Nothing is starred without that approval. Also where the star is explained for the
// first time, per the user's decision ("חובה להסביר למנהל קודם מה המשמעות").
function EmphasisSuggestion({ categories, onApprove }) {
  const [state, setState] = useState("open"); // open | approved | dismissed
  const scored = categories
    .flatMap((c) => c.dishes)
    .filter((d) => d.name?.trim() && !d.starred)
    .map((d) => ({
      d,
      score:
        (d.allergens?.length || 0) * 2 +
        (d.pregnancy?.length || 0) * 2 +
        (d.kashrut?.length || 0) +
        ((d.ingredients?.length || 0) >= 5 ? 1 : 0),
    }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (!scored.length || state === "dismissed") return null;
  if (state === "approved") {
    return (
      <div className="bg-[#15302b] border border-[#2f9e8f]/40 rounded-lg p-3">
        <p className="text-xs text-[#7ee0c0] font-bold flex items-center gap-1.5">
          <Star size={13} className="shrink-0" fill="currentColor" /> המנות סומנו בכוכב — הצוות יתרגל אותן בעדיפות.
        </p>
      </div>
    );
  }
  const names = scored.map((x) => x.d.name.trim());
  return (
    <div className="bg-[#2a2410] border border-[#7a5a1f] rounded-lg p-3 space-y-2">
      <p className="text-xs text-[#f3c98b] leading-relaxed">
        <Star size={13} className="inline ml-1 text-[#f3a712]" fill="currentColor" />
        ראינו ש{names.length === 1 ? `המנה "${names[0]}" מורכבת יותר` : `המנות ${names.map((n) => `"${n}"`).join(", ")} מורכבות יותר`} — יותר
        מרכיבים ואזהרות רגישות. <span className="font-bold">להדגיש אותן בלימוד?</span>
      </p>
      <p className="text-[10px] text-[#b09668] leading-relaxed">
        מנה עם כוכב ⭐ היא מנה שחשוב במיוחד שהצוות ידע — היא מקבלת עדיפות בתרגול. אפשר תמיד להוסיף
        ולהסיר כוכבים בטאב התפריט.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => { onApprove(scored.map((x) => x.d.id)); setState("approved"); }}
          className="flex-1 bg-[#f3a712] text-black font-bold py-2 rounded-lg text-xs hover:bg-[#e09a0e] transition"
        >
          כן — הדגישו אותן
        </button>
        <button
          onClick={() => setState("dismissed")}
          className="flex-1 bg-[#22252b] text-[#8a8aa0] font-bold py-2 rounded-lg text-xs hover:bg-[#2c2e35] transition"
        >
          לא תודה
        </button>
      </div>
    </div>
  );
}

// The proofreading step for photo imports. Reading a menu off a picture is where the
// mistakes happen — a price read as 32 instead of 82, a line skipped in a second column —
// and the owner is the only one who can catch them. Confirming an unchanged transcript
// is free; editing it re-parses from the corrected text.
function TranscriptReview({ value, onChange, busy, error, onConfirm }) {
  const [draft, setDraft] = useState(value);
  const edited = draft.trim() !== value.trim();
  // Counted from the live draft, so it drops as the owner clears the markers rather than
  // reporting whatever the API said when the screen opened.
  const uncertainCount = (draft.match(/\[\?\]/g) || []).length;
  // Summarised from the text in front of the owner, not from a later parse — at this
  // point nothing has been structured yet, and a count from elsewhere would be a lie.
  // "## " is how the transcription pass marks a group heading.
  const categoryNames = draft
    .split("\n")
    .filter((l) => /^\s*#{1,3}\s+\S/.test(l))
    .map((l) => l.replace(/^\s*#{1,3}\s*/, "").trim());
  return (
    <>
      <div className="flex-1 px-6 py-6 overflow-y-auto space-y-4">
        <div>
          <p className="text-sm font-bold text-[#eef0f6] mb-1">זה מה שקראנו מהתפריט</p>
          <p className="text-xs text-[#8a8aa0] leading-relaxed">
            <span className="text-[#a79bff] font-bold">הטקסט למטה ניתן לעריכה</span> — לחצו עליו
            ותקנו כל מה שנקרא לא נכון. מה שכתוב כאן הוא מה שהצוות ילמד.
          </p>
        </div>

        {/* Reading a menu off a photo goes wrong in a specific way: it produces real
            Hebrew words that aren't the ones on the page ("דגים טאים" for "דגים נאים").
            A second AI pass hunts for those and marks whatever it still can't read, so
            the owner's eye goes to the right places instead of re-reading everything. */}
        {uncertainCount > 0 && (
          <div className="bg-[#3a2a12] border border-[#7a5a1f] rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle size={15} className="text-[#f3a712] shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#f3c98b] leading-relaxed">
              <span className="font-bold">{uncertainCount} מקומות לא נקראו בוודאות</span> ומסומנים
              ב-<span className="font-mono bg-black/30 px-1 rounded">[?]</span>. חפשו אותם בטקסט
              ותקנו — ומחקו את הסימן אחרי שתיקנתם.
            </p>
          </div>
        )}

        {categoryNames.length > 0 && (
          <div className="bg-[#0c0d10] border border-[#22252b] rounded-lg p-3">
            <p className="text-[11px] text-[#8a8aa0] leading-relaxed">
              זוהו {categoryNames.length} קבוצות בתפריט, בסדר הזה:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {categoryNames.map((c, i) => (
                <span key={c + i} className="bg-[#22252b] text-[#c4c4d4] text-[10px] font-bold px-2 py-1 rounded">
                  {i + 1}. {c}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-[#6a6a7e] mt-2">
              שורה שמתחילה ב-<span className="font-mono">##</span> היא כותרת של קבוצה, לא מנה. זה גם
              הסדר שבו הצוות ילמד — אפשר לשנות אותו אחר כך בהגדרות.
            </p>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="menu-transcript" className="text-[11px] font-bold text-[#c4c4d4] flex items-center gap-1.5">
              <Edit2 size={12} /> הטקסט של התפריט — ערכו כאן
            </label>
            {edited && <span className="text-[10px] font-bold text-[#22c08c]">נערך</span>}
          </div>
          {/* [?] markers get a yellow highlight so the owner's eye lands on them without
              re-reading the whole menu. A textarea can't color part of its own text, so a
              backdrop renders the same text (transparent) with only the [?] tokens as
              visible yellow boxes, and the textarea scroll is mirrored onto it. Metrics
              (font, size, leading, padding, border width) must match the textarea exactly
              or the highlights drift off the markers. */}
          <div className="relative rounded-lg bg-[#16181c]">
            <div
              aria-hidden="true"
              id="menu-transcript-backdrop"
              dir="rtl"
              className="absolute inset-0 overflow-hidden rounded-lg border-2 border-transparent px-3 py-2.5 text-sm leading-relaxed font-mono whitespace-pre-wrap break-words text-transparent pointer-events-none select-none"
            >
              {draft.split(/(\[\?\])/g).map((part, i) =>
                part === "[?]" ? (
                  <mark key={i} className="bg-[#f3a712]/45 text-transparent rounded-sm">[?]</mark>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
              {"\n"}
            </div>
            <textarea
              id="menu-transcript"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }}
              onScroll={(e) => {
                const b = document.getElementById("menu-transcript-backdrop");
                if (b) b.scrollTop = e.target.scrollTop;
              }}
              rows={14}
              dir="rtl"
              spellCheck={false}
              className="relative w-full bg-transparent border-2 border-[#3a3d46] rounded-lg px-3 py-2.5 text-[#eef0f6] text-sm leading-relaxed focus:outline-none focus:border-[#6d5efc] resize-y font-mono cursor-text hover:border-[#4a4d57] transition-colors"
            />
          </div>
        </div>
        {error && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} className="shrink-0" /> {error}</p>}
        {busy && <p className="text-xs font-bold text-[#a79bff]">מפענח מחדש לפי התיקונים שלך…</p>}
      </div>
      <div className="px-6 pb-6 border-t border-[#22252b] pt-4 space-y-2">
        <button
          onClick={() => onConfirm(draft)}
          disabled={busy || !draft.trim()}
          className="w-full bg-[#6d5efc] text-white font-bold py-3 rounded-lg hover:bg-[#5b4ef0] transition disabled:opacity-40"
        >
          {busy ? "מפענח…" : edited ? "שמרו את התיקונים והמשיכו" : "הכל נכון — המשך"}
        </button>
        {!edited && (
          <p className="text-[10px] text-[#6a6a7e] text-center leading-relaxed">
            משהו לא נכון? לחצו על הטקסט למעלה, תקנו, והכפתור ישתנה.
          </p>
        )}
      </div>
    </>
  );
}

// Chip editor for a dish's ingredient list. Comma or Enter commits, so pasting
// "סלמון, אבוקדו, מלפפון" from a menu works in one go.
function IngredientEditor({ value, onChange }) {
  const [draft, setDraft] = useState("");
  const commit = (raw) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-[#8a8aa0]">מרכיבים:</p>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((ing) => (
            <button key={ing} onClick={() => onChange(value.filter((x) => x !== ing))}
              className="bg-[#22252b] text-[#eef0f6] text-xs px-2 py-1 rounded-lg flex items-center gap-1">
              {ing} <X size={11} className="text-[#8a8aa0]" />
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        onChange={(e) => { const v = e.target.value; if (v.endsWith(",")) commit(v); else setDraft(v); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(draft); } }}
        onBlur={() => commit(draft)}
        placeholder="הוסיפו מרכיב ואנטר (או הדביקו רשימה מופרדת בפסיקים)"
        className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc] text-sm"
        dir="rtl"
      />
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
          className="flex-1 bg-[#6d5efc] text-white font-bold py-2.5 min-h-[44px] rounded-lg text-sm hover:bg-[#5b4ef0] transition"
        >
          <Check size={14} className="inline mr-1" /> שמירה
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-[#22252b] text-[#8a8aa0] font-bold py-2.5 min-h-[44px] rounded-lg text-sm hover:bg-[#2c2e35] transition"
        >
          ביטול
        </button>
      </div>

      {onDelete && (
        !confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="w-full text-[11px] font-bold text-[#8a8aa0] py-1.5 hover:text-[#e0315a] transition"
          >
            <Trash2 size={11} className="inline ml-1" /> מחיקת המנה מהתפריט
          </button>
        ) : (
          <div className="bg-[#3a1d22] border border-[#e0315a]/40 rounded-lg p-3 space-y-2">
            <p className="text-[11px] text-[#eef0f6] leading-relaxed">
              למחוק את ״{item.name}״? המנה תוסר גם מאפליקציית הצוות, וההתקדמות עליה תימחק.
            </p>
            <div className="flex gap-2">
              <button onClick={onDelete} className="flex-1 bg-[#e0315a] text-white text-[11px] font-black py-2 rounded-lg">
                כן, למחוק
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="px-4 bg-[#22252b] text-[#8a8aa0] text-[11px] font-black py-2 rounded-lg">
                ביטול
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
