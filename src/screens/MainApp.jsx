import { useMemo, useState, useEffect, useRef } from "react";
import {
  Home, CalendarDays, CalendarCheck, ListChecks, Menu as MenuIcon,
  Bell, ChevronRight, ChevronLeft, X, Check, Plus,
  Send, AlertTriangle, Sparkles, Users, Clock, Wallet, MapPin, User,
  FileText, BarChart3, Umbrella, Copy, Smartphone, Utensils, Soup,
  IceCream, Wine, GraduationCap, Star, Flame, Trophy, Pencil,
  ShieldCheck, TrendingUp, Replace, Carrot, Loader2, LogOut, Phone,
  UserPlus, Trash2,
} from "lucide-react";
import { scOwner, rowToItem } from "../lib/shiftcrew";
import { loadPositions, savePositions, seatsForDay, describePosition } from "../lib/positions";
import PositionsEditor from "../components/PositionsEditor";

// ─────────────────────────────────────────────────────────────────────────────
// MainApp — the RESTAURANT-OWNER / manager side of ShiftCrew. Dark UI with teal
// accents and a 6-tab bottom nav (בית · סידור עבודה · זמינות · צוות · משימות ·
// תפריט). From the manager's angle: build the weekly schedule, review the team's
// availability, manage the waiter roster (phone access), track tasks, and publish
// the menu. The MenuTab + StaffTab write to the owner's REAL restaurant in the
// isolated shiftcrew_owner schema; the scheduling/availability views are still
// illustrative sample data. Receives the authed owner + linked restaurant as props.
// ─────────────────────────────────────────────────────────────────────────────

const DAYS = [
  { key: 0, full: "ראשון",  short: "א'" },
  { key: 1, full: "שני",    short: "ב'" },
  { key: 2, full: "שלישי",  short: "ג'" },
  { key: 3, full: "רביעי",  short: "ד'" },
  { key: 4, full: "חמישי",  short: "ה'" },
  { key: 5, full: "שישי",   short: "ו'" },
  { key: 6, full: "שבת",    short: "ש'" },
];

// Roster — each carries an avatar color (TabitShift gives everyone a distinct
// initials circle), role, hourly rate, and the availability they submitted for
// next week, keyed `${dayKey}-${shiftKey}`: "want" = ביקש/ה, "ok" = יכול/ה.
const EMPLOYEES = [
  { id: "e1", name: "אביה אוחיון",  role: "מנהל/ת מסעדה",   color: "#14b8a6", rate: 75,
    avail: { "1-morning": "want", "3-morning": "want", "4-evening": "want", "5-evening": "ok" } },
  { id: "e2", name: "טל אנגלנדר",   role: "מנהל/ת משמרת",   color: "#7c5cff", rate: 62,
    avail: { "0-morning": "want", "1-morning": "ok", "2-morning": "want", "5-evening": "want", "6-evening": "want" } },
  { id: "e3", name: "יאיר יהל",     role: "מלצר/ית פתיחה",  color: "#db2777", rate: 50,
    avail: { "1-morning": "want", "3-evening": "want", "4-evening": "want", "5-evening": "want", "6-morning": "ok" } },
  { id: "e4", name: "נויה ישראל",   role: "מלצר/ית פתיחה",  color: "#65a30d", rate: 48,
    avail: { "0-evening": "want", "1-morning": "ok", "2-evening": "want", "4-evening": "want", "6-evening": "want" } },
  { id: "e5", name: "מיכל יעקובי",  role: "מלצר/ית",        color: "#ea7317", rate: 46,
    avail: { "1-morning": "ok", "3-evening": "want", "5-evening": "want", "6-evening": "want" } },
  { id: "e6", name: "נועה לוי",     role: "מלצר/ית",        color: "#0d9488", rate: 52,
    avail: { "0-morning": "want", "1-evening": "want", "4-evening": "ok", "5-evening": "want" } },
  { id: "e7", name: "עומר טל",      role: "מלצר/ית",        color: "#2563eb", rate: 50,
    avail: { "1-morning": "want", "2-morning": "ok", "5-morning": "want", "6-morning": "want" } },
  { id: "e8", name: "שירה אבני",    role: "ברמן/ית",        color: "#e11d48", rate: 56,
    avail: { "1-evening": "want", "4-night": "want", "5-night": "want", "6-evening": "want" } },
  { id: "e9", name: "דניאל מור",    role: "מארח/ת",         color: "#d97706", rate: 46,
    avail: { "4-evening": "want", "5-evening": "want", "6-evening": "want" } },
];

const EMP = Object.fromEntries(EMPLOYEES.map((e) => [e.id, e]));
const SUBMITTED = new Set(["e1", "e2", "e3", "e4", "e6", "e7", "e8"]); // who handed in availability

const TODAY_KEY = 1; // Monday 8 June (per demo anchor)

// Strongest availability an employee submitted for a given weekday (across any of
// the demo morning/evening/night slots). Drives the assignment-sheet ranking now
// that staffing is position/seat-based rather than fixed morning/evening shifts.
function availForDay(e, dayKey) {
  let best = 0;
  Object.entries(e.avail || {}).forEach(([k, v]) => {
    if (k.startsWith(dayKey + "-")) {
      const r = v === "want" ? 2 : v === "ok" ? 1 : 0;
      if (r > best) best = r;
    }
  });
  return best === 2 ? "want" : best === 1 ? "ok" : null;
}

const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Which demo availability bucket a seat falls into, by its start time.
function timeBucket(from) {
  const h = parseInt((from || "0").split(":")[0], 10) || 0;
  if (h < 16) return "morning";
  if (h < 22) return "evening";
  return "night";
}

// Auto-fill the whole week from submitted availability: for each seat, pick the
// best-matching person who's free that day and hasn't been placed yet. Exact
// time-bucket "want" wins, then bucket "ok", then any-time want/ok. The owner
// then drags people around to finalize. Returns { seatKey → empId }.
function buildAutoAssign(positions) {
  const map = {};
  for (let day = 0; day < 7; day++) {
    const dayCode = DAY_CODES[day];
    const takenToday = new Set();
    const seats = [];
    positions.forEach((p) => seatsForDay(p, day).forEach((seat) => seats.push(seat)));
    seats.forEach((seat) => {
      const bucket = timeBucket(seat.from);
      const scored = EMPLOYEES
        .filter((e) => !takenToday.has(e.id) && SUBMITTED.has(e.id) && availForDay(e, dayCode))
        .map((e) => {
          const exact = e.avail[`${day}-${bucket}`];
          const any = availForDay(e, dayCode);
          let score = 0;
          if (exact === "want") score = 4;
          else if (exact === "ok") score = 3;
          else if (any === "want") score = 2;
          else if (any === "ok") score = 1;
          return { e, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      if (scored.length) {
        map[seat.key] = scored[0].e.id;
        takenToday.add(scored[0].e.id);
      }
    });
  }
  return map;
}

// ── The restaurant's FULL menu — the SAME content the waiter app trains on.
// The manager owns this content here: edit items, set "מנת היום", and watch the
// AI turn it into the team's daily practice. `learnedBy` = how many of the team
// have mastered the item (drives the progress bars). Mirrors waiter-app menu.
const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום", "סולפיטים"];
const CATS = {
  starters: { label: "ראשונות",        icon: Soup },
  mains:    { label: "עיקריות",         icon: Utensils },
  desserts: { label: "קינוחים",          icon: IceCream },
  drinks:   { label: "קוקטיילים ויין",  icon: Wine },
};
const MENU0 = [
  { id: "m1", cat: "starters", name: "קרפצ'יו בקר", price: 62, desc: "פרוסות אנטריקוט דקות, רוקט, שבבי פרמזן ושמן זית כמהין.", ingredients: ["בקר", "פרמזן", "רוקט", "שמן כמהין"], allergens: ["חלב"], learnedBy: 6 },
  { id: "m2", cat: "starters", name: "קלמרי צרוב", price: 58, desc: "קלמרי על הגריל עם איולי לימון ועשבי תיבול.", ingredients: ["קלמרי", "איולי", "לימון"], allergens: ["ביצים", "רכיכות"], learnedBy: 4 },
  { id: "m3", cat: "starters", name: "סלט עגבניות הקיץ", price: 48, desc: "עגבניות שרי, בצל סגול, בזיליקום וויניגרט הדרים.", ingredients: ["עגבניות", "בצל", "בזיליקום"], allergens: [], learnedBy: 8 },
  { id: "m4", cat: "starters", name: "פוקצ'ה הבית", price: 34, desc: "לחם שמרים אפוי בתנור עם שמן זית ורוזמרין.", ingredients: ["קמח", "שמרים", "רוזמרין"], allergens: ["גלוטן"], learnedBy: 7 },

  { id: "m5", cat: "mains", name: "אנטריקוט 300 גרם", price: 168, desc: "סטייק אנטריקוט מיושן, צ'יפס בטטה ורוטב פלפלת.", ingredients: ["אנטריקוט", "בטטה"], allergens: [], learnedBy: 9 },
  { id: "m6", cat: "mains", name: "סלמון בגריל", price: 124, desc: "פילה סלמון, פירה אפונה וחמאת לימון צרוב.", ingredients: ["סלמון", "אפונה", "חמאה"], allergens: ["דגים", "חלב"], learnedBy: 5 },
  { id: "m7", cat: "mains", name: "רביולי ריקוטה", price: 92, desc: "רביולי במילוי ריקוטה ותרד ברוטב חמאת מרווה.", ingredients: ["קמח", "ריקוטה", "תרד", "חמאה"], allergens: ["גלוטן", "חלב", "ביצים"], learnedBy: 3 },
  { id: "m8", cat: "mains", name: "המבורגר הבית", price: 78, desc: "קציצת בקר 220 גרם, צ'דר ובצל מקורמל בלחמנייה.", ingredients: ["בקר", "צ'דר", "לחמנייה"], allergens: ["גלוטן", "חלב", "שומשום"], learnedBy: 8 },
  { id: "m9", cat: "mains", name: "קארי ירקות", price: 74, desc: "ירקות שורש בקארי קוקוס חריף עם אורז יסמין.", ingredients: ["קוקוס", "אורז", "ירקות שורש"], allergens: [], learnedBy: 4 },

  { id: "m10", cat: "desserts", name: "סופלה שוקולד", price: 46, desc: "סופלה שוקולד חם עם גלידת וניל.", ingredients: ["שוקולד", "חמאה", "ביצים"], allergens: ["גלוטן", "חלב", "ביצים"], learnedBy: 6 },
  { id: "m11", cat: "desserts", name: "קרם ברולה", price: 42, desc: "קרם וניל קלאסי עם קרמל קשה.", ingredients: ["שמנת", "וניל", "ביצים"], allergens: ["חלב", "ביצים"], learnedBy: 5 },
  { id: "m12", cat: "desserts", name: "סורבה פירות", price: 38, desc: "סורבה תות ומנגו, ללא מוצרים מן החי.", ingredients: ["תות", "מנגו"], allergens: [], learnedBy: 7 },

  { id: "m13", cat: "drinks", name: "נגרוני", price: 52, desc: "ג'ין, קמפרי וורמוט אדום, מוגש עם קליפת תפוז.", ingredients: ["ג'ין", "קמפרי", "ורמוט"], allergens: ["סולפיטים"], learnedBy: 3 },
  { id: "m14", cat: "drinks", name: "אספרסו מרטיני", price: 54, desc: "וודקה, ליקר קפה ואספרסו טרי.", ingredients: ["וודקה", "ליקר קפה", "אספרסו"], allergens: [], learnedBy: 2 },
  { id: "m15", cat: "drinks", name: "יין הבית לבן", price: 38, desc: "סוביניון בלאן צונן, כוס.", ingredients: ["ענבים"], allergens: ["סולפיטים"], learnedBy: 6 },
];
const TEAM_SIZE = EMPLOYEES.length; // mastery is measured against the whole team
const DEFAULT_SPECIALS = ["m6", "m10"]; // מנת היום set by the manager

// What the OWNER decides matters most — drives what the AI drills the team on.
const PRIORITIES = [
  { key: "allergens",   label: "אלרגנים",        icon: AlertTriangle },
  { key: "kosher",      label: "כשרות",          icon: ShieldCheck },
  { key: "ingredients", label: "מרכיבים",        icon: Carrot },
  { key: "mods",        label: "שינויים והתאמות", icon: Replace },
  { key: "specials",    label: "מנות היום",       icon: Star },
  { key: "upsell",      label: "אפסייל והמלצות",  icon: TrendingUp },
];
const DEFAULT_PRIORITIES = ["allergens", "specials"];

function fmtDay(weekStart, dayKey) {
  const d = new Date(weekStart); d.setDate(d.getDate() + dayKey); return d;
}
function fmtRange(start) {
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const months = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
  return `${start.getDate()} – ${end.getDate()} ב${months[end.getMonth()]} ${end.getFullYear()}`;
}

export default function MainApp({ restaurant, ownerName, onSignOut }) {
  const restId = restaurant?.id || null;
  const weekStart = useMemo(() => new Date(2026, 5, 7), []); // Sun 7.6.2026

  // Owner-defined positions (each with its own staffing style) loaded from the
  // isolated shiftcrew_owner schema. The whole weekly schedule is derived from the
  // SEATS these positions expand into — one assignable person per seat per day.
  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(true);

  // assign: seat.key → employee id (a single person per seat).
  const [assign, setAssign] = useState({});
  const [published, setPublished] = useState(false);
  const [tab, setTab] = useState("home");

  useEffect(() => {
    if (!restId) { setPositionsLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const ps = await loadPositions(restId);
        if (alive) {
          setPositions(ps);
          setAssign(buildAutoAssign(ps)); // pre-fill from availability; owner tweaks
        }
      } catch (err) {
        console.error("[shiftcrew] positions load failed:", err);
      } finally {
        if (alive) setPositionsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [restId]);

  const stats = useMemo(() => {
    let shiftsCount = 0, hours = 0, cost = 0, openSlots = 0;
    for (let day = 0; day < 7; day++) {
      positions.forEach((p) => {
        seatsForDay(p, day).forEach((seat) => {
          const empId = assign[seat.key];
          if (empId) {
            shiftsCount += 1;
            hours += seat.hours;
            cost += seat.hours * (EMP[empId]?.rate || 0);
          } else {
            openSlots += 1;
          }
        });
      });
    }
    return { shiftsCount, hours: Math.round(hours), cost: Math.round(cost), openSlots };
  }, [positions, assign]);

  // Assign (or clear) the single person on a seat. Passing empId=null clears it.
  const assignSeat = (seatKey, empId) => {
    setPublished(false);
    setAssign((prev) => {
      const next = { ...prev };
      if (empId == null) delete next[seatKey];
      else next[seatKey] = empId;
      return next;
    });
  };

  // Drag-and-drop move: drop onto an empty seat = move; onto a filled seat = swap.
  const moveSeat = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    setPublished(false);
    setAssign((prev) => {
      const next = { ...prev };
      const a = next[fromKey], b = next[toKey];
      if (b == null) { delete next[fromKey]; next[toKey] = a; }
      else { next[toKey] = a; next[fromKey] = b; }
      return next;
    });
  };

  // Re-run the availability auto-fill (owner can reset after manual edits).
  const autoFill = () => { setPublished(false); setAssign(buildAutoAssign(positions)); };

  const TABS = [
    { key: "home",  label: "בית",          icon: Home },
    { key: "sched", label: "סידור",         icon: CalendarDays },
    { key: "avail", label: "זמינות",        icon: CalendarCheck },
    { key: "staff", label: "צוות",          icon: Users },
    { key: "tasks", label: "משימות",        icon: ListChecks },
    { key: "menu",  label: "תפריט",         icon: Utensils },
  ];

  return (
    <div className="min-h-screen bg-[#0c0d10] text-gray-100 max-w-md mx-auto flex flex-col" dir="rtl">
      {/* Top bar */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <button onClick={onSignOut} className="flex items-center gap-1 text-gray-500 active:text-gray-300" title="התנתקות">
          <LogOut size={20} />
        </button>
        <h1 className="text-lg font-black text-gray-100 truncate px-2">{restaurant?.name || "המסעדה שלי"}</h1>
        <button className="relative">
          <Bell size={22} className="text-gray-300" />
          {stats.openSlots > 0 && (
            <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-[#e34d6c] text-white text-[10px] font-black flex items-center justify-center">!</span>
          )}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-28">
        {tab === "home"  && <HomeTab weekStart={weekStart} stats={stats} published={published} go={setTab} ownerName={ownerName} />}
        {tab === "sched" && <ScheduleTab weekStart={weekStart} positions={positions} positionsLoading={positionsLoading} restId={restId} setPositions={setPositions} assign={assign} assignSeat={assignSeat} moveSeat={moveSeat} autoFill={autoFill} published={published} setPublished={setPublished} />}
        {tab === "avail" && <AvailabilityTab weekStart={weekStart} />}
        {tab === "staff" && <StaffTab restId={restId} />}
        {tab === "tasks" && <TasksTab />}
        {tab === "menu"  && <MenuTab restId={restId} />}
      </div>

      {/* Bottom nav */}
      <nav className="bg-[#101216] border-t border-[#22252b] grid grid-cols-6 fixed bottom-0 inset-x-0 max-w-md mx-auto z-20">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex flex-col items-center justify-center gap-1 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
              <t.icon size={21} className={active ? "text-[#2f9e8f]" : "text-gray-500"} />
              <span className={`text-[10px] font-bold ${active ? "text-[#2f9e8f]" : "text-gray-500"}`}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ── Home (manager dashboard) ──────────────────────────────────────────────────

function HomeTab({ weekStart, stats, published, go, ownerName }) {
  const dateStr = `יום שני, 8 ביוני 2026`;
  const submitted = SUBMITTED.size;
  const greet = ownerName ? `שלום ${ownerName},` : "שלום,";
  return (
    <div className="px-4 space-y-4">
      {/* Greeting */}
      <div className="bg-[#191b1f] rounded-2xl p-5">
        <p className="text-xl font-black text-gray-100">{greet}</p>
        <p className="text-sm text-gray-400 mt-0.5">{dateStr}</p>
        <div className="flex items-center gap-2 mt-3 text-gray-200">
          <CalendarDays size={18} className="text-[#2f9e8f]" />
          <span className="text-sm font-semibold">{stats.shiftsCount} שיבוצים השבוע · {stats.openSlots} משבצות פתוחות</span>
        </div>
      </div>

      {/* Proactive AI insight — the ShiftMatch differentiator */}
      <AiInsightCard />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        <HomeStat label="שעות שבועיות" value={stats.hours} />
        <HomeStat label="עלות שכר שבועית" value={`₪${stats.cost.toLocaleString()}`} />
      </div>

      {/* Publish CTA */}
      <button onClick={() => go("sched")}
        className={`w-full rounded-2xl p-4 flex items-center justify-between ${
          published ? "bg-[#15302b] border border-[#1f7d6e]" : "bg-[#2a1721] border border-[#e34d6c]/40"}`}>
        <ChevronLeft size={20} className={published ? "text-[#2f9e8f]" : "text-[#e34d6c]"} />
        <span className={`font-black ${published ? "text-[#2f9e8f]" : "text-[#e34d6c]"}`}>
          {published ? "הסידור פורסם ✓" : "הסידור טרם פורסם — לפרסום"}
        </span>
        {published
          ? <Check size={20} className="text-[#2f9e8f]" />
          : <Send size={18} className="text-[#e34d6c]" />}
      </button>

      {/* Availability review shortcut */}
      <button onClick={() => go("avail")}
        className="w-full bg-[#191b1f] rounded-2xl p-4 flex items-center justify-between text-right">
        <ChevronLeft size={20} className="text-gray-500" />
        <div>
          <p className="font-black text-gray-100">זמינות לשבוע הבא</p>
          <p className="text-xs text-gray-400 mt-0.5">{submitted} מתוך {EMPLOYEES.length} עובדים הגישו</p>
        </div>
        <CalendarCheck size={22} className="text-[#2f9e8f]" />
      </button>

      <p className="text-center text-[11px] text-gray-600 pt-2">
        ShiftCrew · ניהול צוות ותפריט
      </p>
    </div>
  );
}

function HomeStat({ label, value }) {
  return (
    <div className="bg-[#191b1f] rounded-2xl p-4">
      <p className="text-2xl font-black text-gray-100 leading-none">{value}</p>
      <p className="text-xs text-gray-400 mt-1.5">{label}</p>
    </div>
  );
}

// Candidates the AI surfaces from the ShiftMatch network when it offers to recruit.
const CANDIDATES = [
  { id: "c1", name: "רותם בר",    role: "מלצר/ית · 3 שנות ניסיון", color: "#7c5cff", dist: "1.8 ק״מ", rating: 4.9 },
  { id: "c2", name: "ליאור גל",    role: "ברמן/ית · 2 שנות ניסיון", color: "#0d9488", dist: "3.1 ק״מ", rating: 4.8 },
  { id: "c3", name: "עדן כהן",     role: "מלצר/ית · 4 שנות ניסיון", color: "#db2777", dist: "4.0 ק״מ", rating: 4.7 },
  { id: "c4", name: "נטע אברהם",   role: "מלצר/ית · שנה ניסיון",    color: "#ea7317", dist: "4.6 ק״מ", rating: 4.6 },
];

// ── Proactive AI insight card ─────────────────────────────────────────────────
// ShiftMatch watches the published schedule over time and proactively flags
// recurring gaps — then offers to ACT on them (recruit from its network). This
// "AI that comes to you" loop is what sets ShiftMatch apart from a passive
// rota tool. The card walks through idle → searching → candidates → sent.
function AiInsightCard() {
  const [stage, setStage] = useState("idle"); // idle | searching | found | sent | dismissed
  const [open, setOpen] = useState(false);

  if (stage === "dismissed") return null;

  const startRecruit = () => {
    setStage("searching");
    setTimeout(() => setStage("found"), 1600);
  };

  return (
    <div className="rounded-3xl p-[1.5px] bg-gradient-to-bl from-[#2f9e8f] via-[#1c4f48] to-[#e34d6c]">
      <div className="bg-[#14161a] rounded-[22px] p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          {stage === "idle" && (
            <button onClick={() => setStage("dismissed")} className="text-gray-600 active:text-gray-400">
              <X size={18} />
            </button>
          )}
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-[10px] font-black text-[#f0788e] bg-[#3a1d22] px-2 py-1 rounded-full">תובנה חדשה</span>
            <span className="flex items-center gap-1.5 text-sm font-black text-gray-100">
              ShiftCrew AI <Sparkles size={16} className="text-[#2f9e8f]" />
            </span>
          </div>
        </div>

        {stage === "idle" && (
          <>
            <p className="text-[15px] font-black text-gray-100 leading-snug text-right">
              כבר חודש שאני עוקב אחרי הסידור שלך 👀
            </p>
            <p className="text-sm text-gray-400 mt-2 text-right leading-relaxed">
              בכל <span className="text-[#f0788e] font-bold">יום שישי בערב</span> חסרים בממוצע
              <span className="text-gray-100 font-bold"> 1.5 מלצרים</span> מהיעד שהגדרת (4).
              זה גורם לזמני המתנה ארוכים יותר בשעות השיא.
            </p>
            <div className="bg-[#191b1f] rounded-2xl p-3 mt-3 text-right">
              <p className="text-sm font-bold text-gray-100">שאגייס מלצרים לסופי שבוע בלבד? 🎯</p>
              <p className="text-[12px] text-gray-500 mt-0.5">אחפש ברשת ShiftMatch מועמדים מתאימים באזור שלך.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={startRecruit}
                className="bg-[#2a8576] text-white font-black text-sm py-3 rounded-2xl flex items-center justify-center gap-1.5 active:bg-[#247567]">
                <Sparkles size={15} /> כן, גייס/י
              </button>
              <button onClick={() => setOpen((o) => !o)}
                className="bg-[#191b1f] text-gray-300 font-bold text-sm py-3 rounded-2xl active:bg-[#20232a]">
                הצג ניתוח
              </button>
            </div>
            {open && (
              <div className="mt-3 space-y-2">
                {[
                  ["שישי ערב", "3 מתוך 4 שבועות מתחת ליעד", "#f0788e"],
                  ["שבת ערב", "תקין · 100% איוש", "#3fd0bc"],
                  ["עלות שכר שבת", "גבוהה ב-18% מהממוצע", "#f3c14b"],
                ].map(([k, v, c]) => (
                  <div key={k} className="flex items-center justify-between bg-[#191b1f] rounded-xl px-3 py-2.5">
                    <span className="text-[12px] font-bold" style={{ color: c }}>{v}</span>
                    <span className="text-[12px] font-bold text-gray-300">{k}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {stage === "searching" && (
          <div className="flex flex-col items-center py-6">
            <div className="w-9 h-9 rounded-full border-[3px] border-[#22252b] border-t-[#2f9e8f] animate-spin" />
            <p className="text-sm font-bold text-gray-200 mt-3">מחפש מועמדים ברשת ShiftMatch…</p>
            <p className="text-[12px] text-gray-500 mt-0.5">מסנן לפי זמינות לשישי ערב ומרחק</p>
          </div>
        )}

        {(stage === "found" || stage === "sent") && (
          <>
            <div className="flex items-center gap-2 text-[13px] font-bold text-[#3fd0bc] mb-3">
              <Check size={16} /> נמצאו {CANDIDATES.length} מלצרים מתאימים · זמינים לשישי ערב
            </div>
            <div className="space-y-2">
              {CANDIDATES.map((c) => (
                <div key={c.id} className="flex items-center gap-3 bg-[#191b1f] rounded-2xl px-3 py-2.5">
                  <Avatar emp={c} size={38} />
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-sm font-bold text-gray-100 truncate">{c.name}</p>
                    <p className="text-[11px] text-gray-400">{c.role}</p>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <p className="text-[11px] font-bold text-gray-300 flex items-center gap-1 justify-end"><Star size={11} className="text-[#f3c14b] fill-[#f3c14b]" /> {c.rating}</p>
                    <p className="text-[10px] text-gray-500 flex items-center gap-1 justify-end"><MapPin size={10} /> {c.dist}</p>
                  </div>
                </div>
              ))}
            </div>
            {stage === "found" ? (
              <button onClick={() => setStage("sent")}
                className="w-full mt-3 bg-[#2a8576] text-white font-black text-sm py-3 rounded-2xl flex items-center justify-center gap-1.5 active:bg-[#247567]">
                <Send size={15} /> שליחת הצעות גיוס לכולם
              </button>
            ) : (
              <div className="mt-3 bg-[#15302b] rounded-2xl px-4 py-3 text-center">
                <p className="text-sm font-black text-[#3fd0bc] flex items-center justify-center gap-1.5">
                  <Check size={16} /> נשלחו {CANDIDATES.length} הצעות גיוס
                </p>
                <p className="text-[12px] text-gray-400 mt-1">אעדכן אותך ברגע שמישהו יאשר. אמשיך לנטר את הסידור.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Schedule builder ──────────────────────────────────────────────────────────

function ScheduleTab({ weekStart, positions, positionsLoading, restId, setPositions, assign, assignSeat, moveSeat, autoFill, published, setPublished }) {
  const [day, setDay] = useState(TODAY_KEY);
  const [sheet, setSheet] = useState(null); // { position, seat } or null
  const [managing, setManaging] = useState(false);

  // ── Drag & drop: grab an avatar and drop it on another seat to move/swap. ──
  // Pointer-events (not HTML5 draggable) so it works on touch. We track the
  // drag in a ref for the window listeners and mirror it to state for rendering
  // the floating ghost + drop highlight.
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [drag, setDrag] = useState(null); // { empId, fromKey, x, y, overKey, moved }

  const startDrag = (e, fromKey, empId) => {
    if (!empId) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { empId, fromKey, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, overKey: null, moved: false };
    dragRef.current = start;
    setDrag(start);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const moved = d.moved || Math.abs(e.clientX - d.sx) > 5 || Math.abs(e.clientY - d.sy) > 5;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const overKey = el?.closest("[data-seatkey]")?.getAttribute("data-seatkey") || null;
    const next = { ...d, x: e.clientX, y: e.clientY, overKey, moved };
    dragRef.current = next;
    setDrag(next);
  };

  const onUp = () => {
    const d = dragRef.current;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    dragRef.current = null;
    setDrag(null);
    if (d && d.moved && d.overKey && d.overKey !== d.fromKey) {
      moveSeat(d.fromKey, d.overKey);
      suppressClickRef.current = true; // swallow the click that follows the release
    }
  };

  // Employees already on another seat THIS day — hidden from the picker so one
  // person isn't double-booked on the same date.
  const takenThisDay = useMemo(() => {
    const taken = new Set();
    positions.forEach((p) => seatsForDay(p, day).forEach((seat) => {
      if (seat.key !== sheet?.seat.key && assign[seat.key]) taken.add(assign[seat.key]);
    }));
    return taken;
  }, [positions, day, assign, sheet]);

  // Loading / empty states.
  if (positionsLoading) {
    return (
      <div className="px-4 py-20 text-center text-gray-600">
        <Loader2 size={28} className="mx-auto animate-spin" />
      </div>
    );
  }
  if (!positions.length) {
    return (
      <div className="px-4">
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-3xl bg-[#15302b] flex items-center justify-center mx-auto mb-4">
            <Users size={30} className="text-[#2f9e8f]" />
          </div>
          <p className="text-base font-black text-gray-100">עוד אין תפקידים מוגדרים</p>
          <p className="text-sm text-gray-400 mt-1.5 leading-relaxed max-w-xs mx-auto">
            כדי לבנות סידור, הגדר/י קודם את התפקידים שלך — מלצרים, ברמנים, מנהלי משמרת, מטבח — וכל אחד עם אופן האיוש שלו.
          </p>
          <button onClick={() => setManaging(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-black text-sm bg-[#2a8576] text-white active:bg-[#247567]">
            <Plus size={16} /> הגדרת תפקידים
          </button>
        </div>
        {managing && (
          <ManagePositionsSheet restId={restId} positions={positions} setPositions={setPositions} onClose={() => setManaging(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="px-4">
      {/* Week nav */}
      <div className="flex items-center justify-between py-2 mb-1">
        <button className="w-8 h-8 flex items-center justify-center text-gray-500"><ChevronRight size={20} /></button>
        <p className="text-sm font-bold text-gray-200">{fmtRange(weekStart)}</p>
        <button className="w-8 h-8 flex items-center justify-center text-gray-500"><ChevronLeft size={20} /></button>
      </div>

      {/* Day pills */}
      <div className="flex justify-between mb-4">
        {DAYS.map((d) => {
          const dd = fmtDay(weekStart, d.key);
          const active = d.key === day;
          return (
            <button key={d.key} onClick={() => setDay(d.key)} className="flex flex-col items-center gap-1.5 flex-1">
              <span className={`text-[11px] font-bold ${active ? "text-[#2f9e8f]" : "text-gray-500"}`}>{d.short}</span>
              <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black ${
                active ? "bg-[#1c4f48] text-[#3fd0bc] ring-1 ring-[#2f9e8f]" : "text-gray-300"}`}>
                {dd.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Coverage summary chip + actions */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setManaging(true)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-[#3fd0bc] bg-[#15302b] border border-[#2f9e8f] rounded-full px-3 py-1.5 active:bg-[#1c4f48]">
            <Pencil size={12} /> תפקידים
          </button>
          <button onClick={autoFill}
            className="flex items-center gap-1.5 text-[11px] font-bold text-[#c9b6ff] bg-[#241f3a] border border-[#7c5cff] rounded-full px-3 py-1.5 active:bg-[#2e2748]">
            <Sparkles size={12} /> סידור אוטומטי
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{DAYS[day].full}, {fmtDay(weekStart, day).getDate()} ביוני</span>
          <Users size={14} className="text-gray-500" />
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mb-3 text-right">גרור/י עובד למקום אחר כדי להחליף משמרת · הקש/י על מקום ריק לשיבוץ</p>

      {/* One card per position, listing its seats for the selected day */}
      <div className="space-y-3">
        {positions.map((p) => {
          const seats = seatsForDay(p, day);
          if (!seats.length) return null;
          const filled = seats.filter((s) => assign[s.key]).length;
          const full = filled >= seats.length;
          return (
            <div key={p.id} className="bg-[#191b1f] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${
                  filled === 0 ? "bg-[#3a1d22] text-[#f0788e]"
                  : full ? "bg-[#15302b] text-[#3fd0bc]" : "bg-[#33290f] text-[#f3c14b]"}`}>
                  {filled}/{seats.length} מאוישים
                </span>
                <div className="flex items-center gap-2 text-right">
                  <div>
                    <p className="font-black text-gray-100">{p.name}</p>
                    <p className="text-[11px] text-gray-500">{describePosition(p)}</p>
                  </div>
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color }} />
                </div>
              </div>
              <div className="space-y-1.5">
                {seats.map((seat) => {
                  const eid = assign[seat.key];
                  const emp = eid ? EMP[eid] : null;
                  const isOver = drag?.moved && drag.overKey === seat.key && drag.fromKey !== seat.key;
                  const isSource = drag?.moved && drag.fromKey === seat.key;
                  return (
                    <div
                      key={seat.key}
                      data-seatkey={seat.key}
                      onClick={() => {
                        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                        setSheet({ position: p, seat });
                      }}
                      className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-right transition-all cursor-pointer ${
                        emp ? "bg-[#1d3a35] active:bg-[#224640]" : "bg-[#1c1e22] active:bg-[#22252b]"} ${
                        isOver ? "ring-2 ring-[#3fd0bc] scale-[1.01]" : ""} ${isSource ? "opacity-40" : ""}`}>
                      {emp ? (
                        <span
                          onPointerDown={(e) => startDrag(e, seat.key, eid)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ touchAction: "none" }}
                          className="cursor-grab active:cursor-grabbing flex-shrink-0">
                          <Avatar emp={emp} size={30} />
                        </span>
                      ) : (
                        <span className="w-[30px] h-[30px] rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center flex-shrink-0">
                          <Plus size={14} className="text-gray-500" />
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        {emp ? (
                          <p className="text-sm font-bold text-gray-100 truncate">{emp.name}</p>
                        ) : (
                          <p className="text-sm font-bold text-gray-500">לשיבוץ</p>
                        )}
                        <p className="text-[11px] text-gray-500" dir="ltr">{seat.from}–{seat.to}</p>
                      </div>
                      <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">{seat.hours} ש׳</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Publish */}
      <button onClick={() => setPublished(true)} disabled={published}
        className={`w-full mt-5 rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 ${
          published ? "bg-[#15302b] text-[#2f9e8f]" : "bg-[#2a8576] text-white active:bg-[#247567]"}`}>
        {published ? <><Check size={18} /> הסידור פורסם</> : <><Send size={17} /> פרסום הסידור</>}
      </button>
      {published && (
        <div className="flex items-center gap-2 mt-3 text-[12px] text-[#2f9e8f] font-semibold">
          <Sparkles size={14} /> כל העובדים קיבלו התראה — המשמרות מופיעות באפליקציה שלהם.
        </div>
      )}

      {/* Floating drag ghost — follows the pointer while dragging an avatar. */}
      {drag?.moved && drag.empId && (
        <div className="fixed z-50 pointer-events-none"
          style={{ left: drag.x, top: drag.y, transform: "translate(-50%, -50%)" }}>
          <div className="rounded-full shadow-2xl shadow-black/50 ring-2 ring-[#3fd0bc]">
            <Avatar emp={EMP[drag.empId]} size={44} />
          </div>
        </div>
      )}

      {/* Assignment bottom sheet */}
      {sheet && (
        <AssignSheet
          position={sheet.position}
          seat={sheet.seat}
          dayKey={day}
          weekStart={weekStart}
          current={assign[sheet.seat.key]}
          takenIds={takenThisDay}
          assignSeat={assignSeat}
          onClose={() => setSheet(null)}
        />
      )}

      {managing && (
        <ManagePositionsSheet restId={restId} positions={positions} setPositions={setPositions} onClose={() => setManaging(false)} />
      )}
    </div>
  );
}

function AssignSheet({ position, seat, dayKey, weekStart, current, takenIds, assignSeat, onClose }) {
  const dd = fmtDay(weekStart, dayKey);
  const dayCode = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayKey];
  const curEmp = current ? EMP[current] : null;
  const roster = [...EMPLOYEES]
    .filter((e) => e.id !== current && !takenIds.has(e.id))
    .sort((a, b) => {
      const ra = availForDay(a, dayCode) === "want" ? 2 : availForDay(a, dayCode) === "ok" ? 1 : 0;
      const rb = availForDay(b, dayCode) === "want" ? 2 : availForDay(b, dayCode) === "ok" ? 1 : 0;
      return rb - ra;
    });

  return (
    <div className="fixed inset-0 z-30 max-w-md mx-auto flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#16181c] rounded-t-3xl max-h-[80vh] flex flex-col">
        {/* Sheet header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#22252b]">
          <button onClick={onClose}><X size={22} className="text-gray-400" /></button>
          <div className="text-left flex items-center gap-2">
            <div>
              <p className="font-black text-gray-100">{DAYS[dayKey].full}, {dd.getDate()} ביוני · {position.name}</p>
              <p className="text-[11px] text-gray-500" dir="ltr">{seat.from}–{seat.to} · {seat.hours}h</p>
            </div>
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: position.color }} />
          </div>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 py-3">
          {/* Currently assigned */}
          {curEmp && (
            <>
              <p className="text-[11px] font-bold text-gray-500 mb-2 px-1">משובץ/ת למקום הזה</p>
              <div className="flex items-center gap-3 bg-[#1d3a35] rounded-2xl px-3 py-2.5 mb-4">
                <Avatar emp={curEmp} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-100 truncate">{curEmp.name}</p>
                  <p className="text-[11px] text-gray-400">{curEmp.role}</p>
                </div>
                <button onClick={() => { assignSeat(seat.key, null); onClose(); }}
                  className="w-8 h-8 rounded-full bg-[#22252b] flex items-center justify-center">
                  <X size={15} className="text-[#f0788e]" />
                </button>
              </div>
            </>
          )}

          {/* Roster to pick from */}
          <p className="text-[11px] font-bold text-gray-500 mb-2 px-1 flex items-center gap-1">
            <Plus size={12} /> {curEmp ? "החלפה לעובד/ת אחר/ת" : "שיבוץ עובד/ת"} (לפי הזמינות שהוגשה)
          </p>
          <div className="space-y-1.5">
            {roster.map((e) => (
              <button key={e.id} onClick={() => { assignSeat(seat.key, e.id); onClose(); }}
                className="w-full flex items-center gap-3 bg-[#1c1e22] rounded-2xl px-3 py-2.5 text-right active:bg-[#22252b]">
                <Avatar emp={e} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-100 truncate">{e.name}</p>
                  <p className="text-[11px] text-gray-400">{e.role} · ₪{e.rate}/שעה</p>
                </div>
                <AvailBadge state={availForDay(e, dayCode)} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Manage Positions bottom-sheet — lets the owner add/edit/remove positions and
// their staffing styles AFTER onboarding (e.g. existing restaurants that signed
// up before positions existed). Edits a local draft, then replace-all saves to
// shiftcrew_owner on confirm.
function ManagePositionsSheet({ restId, positions, setPositions, onClose }) {
  const [draft, setDraft] = useState(positions);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  const save = async () => {
    setSaving(true); setErr(false);
    try {
      await savePositions(restId, draft);
      setPositions(draft);
      onClose();
    } catch (e) {
      console.error("[shiftcrew] save positions failed:", e);
      setErr(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 max-w-md mx-auto flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#16181c] rounded-t-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#22252b]">
          <button onClick={onClose}><X size={22} className="text-gray-400" /></button>
          <p className="font-black text-gray-100">ניהול תפקידים</p>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 py-4 flex-1" dir="rtl">
          <PositionsEditor positions={draft} setPositions={setDraft} />
        </div>
        <div className="px-5 py-4 border-t border-[#22252b]">
          {err && (
            <p className="text-[12px] font-bold text-[#f0788e] flex items-center gap-1.5 mb-2 justify-center">
              <AlertTriangle size={13} /> השמירה נכשלה — נסה/י שוב
            </p>
          )}
          <button onClick={save} disabled={saving}
            className={`w-full rounded-2xl py-3.5 font-black text-base flex items-center justify-center gap-2 ${
              saving ? "bg-[#1c1e22] text-gray-600" : "bg-[#2a8576] text-white active:bg-[#247567]"}`}>
            {saving ? <><Loader2 size={18} className="animate-spin" /> שומר…</> : <><Check size={18} /> שמירת התפקידים</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Availability review (team submissions) ────────────────────────────────────

function AvailabilityTab({ weekStart }) {
  const nextWeek = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d; }, [weekStart]);
  return (
    <div className="px-4">
      <div className="flex items-center justify-between py-2 mb-1">
        <button className="w-8 h-8 flex items-center justify-center text-gray-500"><ChevronRight size={20} /></button>
        <p className="text-sm font-bold text-gray-200">{fmtRange(nextWeek)}</p>
        <button className="w-8 h-8 flex items-center justify-center text-gray-500"><ChevronLeft size={20} /></button>
      </div>
      <p className="text-xs text-gray-400 mb-3">{SUBMITTED.size} מתוך {EMPLOYEES.length} עובדים הגישו זמינות</p>

      <div className="space-y-2.5">
        {EMPLOYEES.map((e) => {
          const submitted = SUBMITTED.has(e.id);
          const wants = Object.values(e.avail).filter((v) => v === "want").length;
          const oks = Object.values(e.avail).filter((v) => v === "ok").length;
          return (
            <div key={e.id} className="bg-[#191b1f] rounded-2xl p-3.5">
              <div className="flex items-center gap-3">
                <Avatar emp={e} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-100 truncate">{e.name}</p>
                  <p className="text-[11px] text-gray-400">{e.role}</p>
                </div>
                {submitted
                  ? <span className="text-[11px] font-black text-[#3fd0bc] bg-[#15302b] px-2.5 py-1 rounded-full">הגיש/ה ✓</span>
                  : <span className="text-[11px] font-bold text-[#f0788e] bg-[#3a1d22] px-2.5 py-1 rounded-full">טרם הגיש/ה</span>}
              </div>
              {submitted && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#22252b] text-[11px]">
                  <span className="text-[#3fd0bc] font-bold">ביקש/ה {wants} משמרות</span>
                  <span className="text-gray-600">·</span>
                  <span className="text-gray-400 font-semibold">זמין/ה ל-{oks} נוספות</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

const TASKS = [
  { id: 1, title: "אישור בקשות חופשה", note: "2 בקשות ממתינות · יאיר, נועה", done: false },
  { id: 2, title: "הזמנת סחורה — ירקן", note: "עד היום 14:00", done: false },
  { id: 3, title: "פרסום סידור לשבוע הבא", note: "מומלץ עד חמישי", done: false },
  { id: 4, title: "בריף צוות ערב", note: "הושלם", done: true },
  { id: 5, title: "עדכון מחירון משקאות", note: "הושלם", done: true },
];

function TasksTab() {
  const [view, setView] = useState("active");
  const [done, setDone] = useState(() => new Set(TASKS.filter((t) => t.done).map((t) => t.id)));
  const toggle = (id) => setDone((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const list = TASKS.filter((t) => view === "active" ? !done.has(t.id) : done.has(t.id));

  return (
    <div className="px-4">
      <div className="flex gap-6 border-b border-[#22252b] mb-4">
        {[["active", "פעילות"], ["done", "הושלמו"]].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            className={`pb-2.5 text-sm font-bold relative ${view === k ? "text-[#2f9e8f]" : "text-gray-500"}`}>
            {label}
            {view === k && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#2f9e8f] rounded-full" />}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <FileText size={34} className="mx-auto mb-2 text-gray-600" />
          <p className="text-sm">אין משימות {view === "active" ? "פעילות" : "שהושלמו"}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map((t) => {
            const isDone = done.has(t.id);
            return (
              <button key={t.id} onClick={() => toggle(t.id)}
                className="w-full bg-[#191b1f] rounded-2xl p-4 flex items-center gap-3 text-right">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                  isDone ? "bg-[#2a8576] border-[#2a8576]" : "border-gray-600"}`}>
                  {isDone && <Check size={14} className="text-white" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${isDone ? "text-gray-500 line-through" : "text-gray-100"}`}>{t.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{t.note}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Staff roster — phone-based access control ─────────────────────────────────
// This is how a waiter gets INTO the ShiftCrew waiter app: there is no waiter
// signup. The owner adds the waiter's phone number here, and that single act
// grants access — the waiter just opens the waiter app and types that same
// number. Rows live in shiftcrew_owner.staff (isolated schema); the waiter app
// reads them through the waiter_access() RPC. Phone is normalized server-side,
// so any of 054-1234567 / 0541234567 / +972541234567 match the same person.

function StaffTab({ restId }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("מלצר/ית");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    if (!restId) { setLoading(false); return; }
    const { data, error } = await scOwner
      .from("staff").select("*").eq("restaurant_id", restId)
      .order("created_at", { ascending: false });
    if (error) console.error("[shiftcrew] staff load failed:", error);
    else setStaff(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [restId]);

  const add = async () => {
    const p = phone.trim();
    if (!p || !restId) return;
    setSaving(true); setErr("");
    const { data, error } = await scOwner.from("staff")
      .insert({ restaurant_id: restId, phone: p, name: name.trim(), role })
      .select("*").single();
    setSaving(false);
    if (error) {
      setErr(error.code === "23505" ? "המספר כבר קיים ברשימת הצוות" : "ההוספה נכשלה — נסה/י שוב");
      return;
    }
    setStaff((prev) => [data, ...prev]);
    setPhone(""); setName(""); setRole("מלצר/ית");
  };

  const toggleActive = async (s) => {
    const next = !s.active;
    setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: next } : x)));
    const { error } = await scOwner.from("staff").update({ active: next }).eq("id", s.id);
    if (error) { console.error(error); load(); }
  };

  const remove = async (s) => {
    setStaff((prev) => prev.filter((x) => x.id !== s.id));
    const { error } = await scOwner.from("staff").delete().eq("id", s.id);
    if (error) { console.error(error); load(); }
  };

  const ROLES = ["מלצר/ית", "ברמן/ית", "מנהל/ת משמרת", "מארח/ת", "טבח/ית"];
  const colorFor = (str) => {
    const palette = ["#14b8a6", "#7c5cff", "#db2777", "#65a30d", "#ea7317", "#0d9488", "#2563eb", "#e11d48", "#d97706"];
    let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  };

  return (
    <div className="px-4 space-y-4">
      {/* How it works */}
      <div className="bg-[#2a8576] rounded-3xl p-5 text-white">
        <div className="flex items-center gap-1.5 text-xs font-bold mb-2">
          <Smartphone size={14} /> גישה למלצרים — בלי הרשמה
        </div>
        <p className="text-[15px] font-black leading-snug">
          מוסיף/ה את מספר הטלפון של המלצר/ית — וזהו.
        </p>
        <p className="text-sm text-white/80 font-semibold mt-1 leading-relaxed">
          המלצר/ית פותח/ת את אפליקציית ShiftCrew ומקליד/ה את אותו מספר — בלי סיסמה, בלי משתמש. רק מי שהוספת כאן יכול/ה להיכנס.
        </p>
      </div>

      {/* Add a waiter */}
      <div className="bg-[#191b1f] rounded-2xl p-4 space-y-3">
        <p className="text-sm font-black text-gray-100 flex items-center gap-1.5">
          <UserPlus size={16} className="text-[#2f9e8f]" /> הוספת איש/אשת צוות
        </p>
        <div>
          <p className="text-[11px] font-bold text-gray-500 mb-1.5 px-1">מספר טלפון</p>
          <div className="flex items-center gap-2 bg-[#1c1e22] border border-[#22252b] rounded-xl px-3 focus-within:border-[#2f9e8f]">
            <Phone size={15} className="text-gray-500 flex-shrink-0" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel"
              placeholder="050-1234567" dir="ltr"
              className="w-full bg-transparent py-2.5 text-sm font-bold text-gray-100 text-left placeholder:text-gray-600 focus:outline-none" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold text-gray-500 mb-1.5 px-1">שם (לא חובה)</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: נועה לוי"
            className="w-full bg-[#1c1e22] border border-[#22252b] rounded-xl px-3 py-2.5 text-sm font-bold text-gray-100 text-right placeholder:text-gray-600 focus:outline-none focus:border-[#2f9e8f]" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-gray-500 mb-1.5 px-1">תפקיד</p>
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((r) => {
              const on = role === r;
              return (
                <button key={r} onClick={() => setRole(r)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                    on ? "bg-[#15302b] border-[#2f9e8f] text-[#3fd0bc]" : "bg-[#1c1e22] border-[#22252b] text-gray-500"}`}>
                  {r}
                </button>
              );
            })}
          </div>
        </div>
        {err && (
          <p className="text-[12px] font-bold text-[#f0788e] flex items-center gap-1.5">
            <AlertTriangle size={13} /> {err}
          </p>
        )}
        <button onClick={add} disabled={!phone.trim() || saving || !restId}
          className={`w-full rounded-2xl py-3 font-black text-sm flex items-center justify-center gap-2 transition-colors ${
            phone.trim() && !saving ? "bg-[#2a8576] text-white active:bg-[#247567]" : "bg-[#1c1e22] text-gray-600 cursor-not-allowed"}`}>
          {saving ? <><Loader2 size={16} className="animate-spin" /> מוסיף…</> : <><Plus size={16} /> הוספה לצוות</>}
        </button>
      </div>

      {/* Roster */}
      <div>
        <p className="text-xs font-bold text-gray-500 mb-2 px-1">
          הצוות שלך · {staff.length} {staff.length === 1 ? "איש/אשת צוות" : "אנשי צוות"}
        </p>
        {loading ? (
          <div className="text-center py-10 text-gray-600">
            <Loader2 size={26} className="mx-auto animate-spin" />
          </div>
        ) : staff.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users size={34} className="mx-auto mb-2 text-gray-600" />
            <p className="text-sm">עדיין לא הוספת אף אחד/ת</p>
            <p className="text-[12px] text-gray-600 mt-1">הוסף/י מספר טלפון כדי לתת גישה</p>
          </div>
        ) : (
          <div className="space-y-2">
            {staff.map((s) => {
              const display = s.name?.trim() || s.phone;
              const initials = (s.name?.trim() || "?").split(" ").map((w) => w[0]).slice(0, 2).join("");
              return (
                <div key={s.id} className={`bg-[#191b1f] rounded-2xl p-3.5 flex items-center gap-3 ${!s.active ? "opacity-50" : ""}`}>
                  <span className="inline-flex items-center justify-center rounded-full text-white font-black flex-shrink-0"
                    style={{ width: 40, height: 40, fontSize: 15, background: colorFor(s.phone) }}>
                    {s.name?.trim() ? initials : <Phone size={16} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-100 truncate">{display}</p>
                    <p className="text-[11px] text-gray-400" dir="ltr">{s.phone} · {s.role}</p>
                  </div>
                  <button onClick={() => toggleActive(s)}
                    className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                      s.active ? "bg-[#15302b] text-[#3fd0bc]" : "bg-[#22252b] text-gray-400"}`}>
                    {s.active ? "פעיל/ה" : "מושהה"}
                  </button>
                  <button onClick={() => remove(s)} className="w-8 h-8 rounded-full bg-[#1c1e22] flex items-center justify-center flex-shrink-0 active:bg-[#22252b]">
                    <Trash2 size={15} className="text-[#f0788e]" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-gray-600 pt-1 pb-2">
        ShiftCrew · גישה מבוססת טלפון לצוות
      </p>
    </div>
  );
}

// ── Menu management + AI training oversight ───────────────────────────────────
// The manager counterpart of the waiter "לימוד" tab. Here the owner OWNS the
// content: edit menu items, pick "מנת היום", and watch the AI turn the menu into
// the team's daily practice — with live mastery across the whole team.

function MenuTab({ restId }) {
  const [menu, setMenu] = useState(MENU0);
  const [specials, setSpecials] = useState(() => new Set(DEFAULT_SPECIALS));
  const [priorities, setPriorities] = useState(() => new Set(DEFAULT_PRIORITIES));
  const [editId, setEditId] = useState(null);  // open item sheet (edit)
  const [creating, setCreating] = useState(false); // open item sheet (new dish)

  // Live binding to the owner's REAL restaurant in shiftcrew_owner. If restId is
  // missing (shouldn't happen post-auth) we fall back to the in-memory sample.
  const [publishState, setPublishState] = useState("idle"); // idle|publishing|done|error

  useEffect(() => {
    if (!restId) return;
    let alive = true;
    (async () => {
      try {
        let { data: items, error } = await scOwner
          .from("menu_items").select("*").eq("restaurant_id", restId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (!items || !items.length) {
          // First run for this restaurant — seed a starter menu into the schema.
          const rows = MENU0.map((m) => ({
            restaurant_id: restId, category: m.cat, name: m.name, price: m.price,
            description: m.desc, ingredients: m.ingredients, allergens: m.allergens,
            is_special: DEFAULT_SPECIALS.includes(m.id), learned_by: m.learnedBy,
          }));
          const { data: seeded, error: e2 } = await scOwner
            .from("menu_items").insert(rows).select("*");
          if (e2) throw e2;
          items = seeded;
        }
        if (!alive) return;
        const mapped = items.map(rowToItem);
        setMenu(mapped);
        setSpecials(new Set(mapped.filter((m) => m.isSpecial).map((m) => m.id)));
      } catch (err) {
        console.error("[shiftcrew] menu load failed:", err);
      }
    })();
    return () => { alive = false; };
  }, [restId]);

  const toggleSpecial = (id) =>
    setSpecials((prev) => {
      const n = new Set(prev);
      const willBe = !n.has(id);
      willBe ? n.add(id) : n.delete(id);
      if (restId)
        scOwner.from("menu_items").update({ is_special: willBe }).eq("id", id)
          .then(({ error }) => { if (error) console.error("[shiftcrew] special toggle failed:", error); });
      return n;
    });

  const togglePriority = (key) =>
    setPriorities((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const saveItem = async (updated) => {
    setMenu((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    if (restId) {
      const { error } = await scOwner.from("menu_items").update({
        category: updated.cat, name: updated.name, price: updated.price,
        description: updated.desc, ingredients: updated.ingredients, allergens: updated.allergens,
      }).eq("id", updated.id);
      if (error) console.error("[shiftcrew] menu save failed:", error);
    }
  };

  const addItem = async (created) => {
    if (restId) {
      const { data, error } = await scOwner.from("menu_items").insert({
        restaurant_id: restId, category: created.cat, name: created.name, price: created.price,
        description: created.desc, ingredients: created.ingredients, allergens: created.allergens,
        is_special: false, learned_by: 0,
      }).select("*").single();
      if (error) { console.error("[shiftcrew] add dish failed:", error); return; }
      setMenu((prev) => [...prev, rowToItem(data)]);
    } else {
      setMenu((prev) => [...prev, { ...created, id: "c" + Date.now(), learnedBy: 0 }]);
    }
  };

  // Publish the menu to the waiter app via the cross-schema sync function.
  const publish = async () => {
    if (!restId) return;
    setPublishState("publishing");
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await scOwner.rpc("publish_week", { p_restaurant_id: restId, p_week_start: today });
    if (error) { console.error("[shiftcrew] publish failed:", error); setPublishState("error"); }
    else setPublishState("done");
    setTimeout(() => setPublishState("idle"), 2800);
  };

  // Team-wide mastery: average of learnedBy/team across all items.
  const mastery = useMemo(() => {
    const totalPairs = menu.length * TEAM_SIZE;
    const learned = menu.reduce((s, m) => s + m.learnedBy, 0);
    return Math.round((learned / totalPairs) * 100);
  }, [menu]);

  const specialItems = menu.filter((m) => specials.has(m.id));
  const editItem = menu.find((m) => m.id === editId) || null;

  return (
    <div className="px-4 space-y-4">
      {/* AI training overview (teal hero, mirrors the waiter brief) */}
      <div className="bg-[#2a8576] rounded-3xl p-5 text-white">
        <div className="flex items-center gap-1.5 text-xs font-bold mb-2">
          <Sparkles size={14} /> מאמן התפריט החכם
        </div>
        <p className="text-lg font-black leading-snug">
          ה-AI הפך את {menu.length} פריטי התפריט לתרגול יומי לצוות
        </p>
        <p className="text-sm text-white/80 font-semibold mt-1">
          {priorities.size
            ? `מדגיש עבורך: ${PRIORITIES.filter((p) => priorities.has(p.key)).map((p) => p.label).join(" · ")}`
            : "בחר/י מה הכי חשוב שהצוות יידע"}
        </p>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <HeroStat value={`${mastery}%`} label="שליטת הצוות" />
          <HeroStat value={`${SUBMITTED.size}/${TEAM_SIZE}`} label="תרגלו היום" />
          <HeroStat value={menu.length} label="פריטים" />
        </div>
      </div>

      {/* Publish the live menu to the waiter app (cross-schema sync) */}
      <button
        onClick={publish}
        disabled={!restId || publishState === "publishing"}
        className={`w-full rounded-2xl py-3.5 flex items-center justify-center gap-2 text-sm font-black transition-colors ${
          publishState === "done"
            ? "bg-[#15302b] border border-[#2f9e8f] text-[#3fd0bc]"
            : publishState === "error"
            ? "bg-[#3a1d22] border border-[#e34d6c] text-[#f0788e]"
            : "bg-[#2a8576] text-white active:bg-[#247567] disabled:opacity-40"
        }`}>
        {publishState === "publishing" ? (
          <><Loader2 size={16} className="animate-spin" /> מפרסם לצוות…</>
        ) : publishState === "done" ? (
          <><Check size={16} /> פורסם! התפריט נשלח למלצרים</>
        ) : publishState === "error" ? (
          <><AlertTriangle size={16} /> הפרסום נכשל — נסה/י שוב</>
        ) : (
          <><Send size={16} /> פרסם את התפריט לצוות</>
        )}
      </button>

      {/* Owner-set learning priorities — what the AI drills hardest */}
      <div>
        <p className="text-xs font-bold text-gray-500 mb-1 flex items-center gap-1.5">
          <Sparkles size={13} className="text-[#2f9e8f]" /> מה הכי חשוב שהצוות יידע?
        </p>
        <p className="text-[11px] text-gray-600 mb-2">ה-AI ייתן משקל גבוה יותר לנושאים שתבחר/י</p>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => {
            const on = priorities.has(p.key);
            return (
              <button key={p.key} onClick={() => togglePriority(p.key)}
                className={`flex items-center gap-1.5 rounded-full pr-2.5 pl-3 py-2 text-xs font-bold border transition-colors ${
                  on ? "bg-[#15302b] border-[#2f9e8f] text-[#3fd0bc]" : "bg-[#191b1f] border-[#22252b] text-gray-400"}`}>
                <p.icon size={13} className={on ? "text-[#3fd0bc]" : "text-gray-600"} />
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Daily special picker */}
      <div>
        <p className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
          <Star size={13} className="text-[#f3c14b]" /> מנת היום — נשלח לתדריך של המלצרים
        </p>
        <div className="flex flex-wrap gap-2">
          {menu.map((m) => {
            const on = specials.has(m.id);
            return (
              <button key={m.id} onClick={() => toggleSpecial(m.id)}
                className={`flex items-center gap-1.5 rounded-full pr-2.5 pl-3 py-2 text-xs font-bold border transition-colors ${
                  on ? "bg-[#15302b] border-[#2f9e8f] text-[#3fd0bc]" : "bg-[#191b1f] border-[#22252b] text-gray-400"}`}>
                <Star size={13} className={on ? "text-[#f3c14b] fill-[#f3c14b]" : "text-gray-600"} />
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu by category — each item editable, with team mastery bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-[#15302b] border border-[#2f9e8f] text-[#3fd0bc] active:bg-[#1c4f48]">
            <Plus size={14} /> הוסף מנה
          </button>
          <p className="text-xs font-bold text-gray-500">ניהול תוכן התפריט</p>
        </div>
        <div className="space-y-4">
          {Object.entries(CATS).map(([key, c]) => {
            const items = menu.filter((m) => m.cat === key);
            if (!items.length) return null;
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <c.icon size={16} className="text-[#2f9e8f]" />
                  <span className="text-sm font-black text-gray-200">{c.label}</span>
                  <span className="text-[11px] text-gray-600">· {items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((m) => {
                    const pct = Math.round((m.learnedBy / TEAM_SIZE) * 100);
                    return (
                      <button key={m.id} onClick={() => setEditId(m.id)}
                        className="w-full bg-[#191b1f] rounded-2xl p-3.5 text-right active:bg-[#20232a] transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            {specials.has(m.id) && <Star size={13} className="text-[#f3c14b] fill-[#f3c14b]" />}
                            <span className="text-sm font-bold text-gray-300">₪{m.price}</span>
                            <Pencil size={13} className="text-gray-600" />
                          </span>
                          <span className="flex items-center gap-2">
                            <p className="text-sm font-black text-gray-100">{m.name}</p>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2.5">
                          <span className="text-[10px] font-bold text-gray-500 w-12 text-left">{m.learnedBy}/{TEAM_SIZE}</span>
                          <div className="flex-1 h-1.5 bg-[#1c1e22] rounded-full overflow-hidden">
                            <div className="h-full bg-[#2f9e8f] rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-[#3fd0bc] w-9">{pct}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-center text-[11px] text-gray-600 pt-1 pb-2">
        ShiftCrew · ניהול תפריט + מאמן AI
      </p>

      {editItem && (
        <ItemSheet
          item={editItem}
          isSpecial={specials.has(editItem.id)}
          onToggleSpecial={() => toggleSpecial(editItem.id)}
          onSave={(u) => { saveItem(u); setEditId(null); }}
          onClose={() => setEditId(null)}
        />
      )}

      {creating && (
        <ItemSheet
          isNew
          item={{ id: "new", cat: "mains", name: "", price: 0, desc: "", ingredients: [], allergens: [], learnedBy: 0 }}
          isSpecial={false}
          onToggleSpecial={() => {}}
          onSave={(u) => { addItem(u); setCreating(false); }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function HeroStat({ value, label }) {
  return (
    <div className="bg-white/10 rounded-2xl py-2.5 text-center">
      <p className="text-lg font-black leading-none">{value}</p>
      <p className="text-[10px] text-white/70 mt-1">{label}</p>
    </div>
  );
}

// Item editor bottom-sheet — name / price / desc / allergens are all editable
// in-memory, plus a "מנת היום" toggle. Demonstrates owning the menu content.
function ItemSheet({ item, isSpecial, onToggleSpecial, onSave, onClose, isNew = false }) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price || ""));
  const [desc, setDesc] = useState(item.desc);
  const [cat, setCat] = useState(item.cat);
  const [allergens, setAllergens] = useState(new Set(item.allergens));
  const pct = Math.round((item.learnedBy / TEAM_SIZE) * 100);
  const canSave = name.trim().length > 0;

  const toggleAllergen = (a) =>
    setAllergens((prev) => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; });

  const save = () => {
    if (!canSave) return;
    onSave({ ...item, cat, name: name.trim(), price: Number(price) || 0, desc, allergens: [...allergens] });
  };

  return (
    <div className="fixed inset-0 z-30 max-w-md mx-auto flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#16181c] rounded-t-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#22252b]">
          <button onClick={onClose}><X size={22} className="text-gray-400" /></button>
          <p className="font-black text-gray-100">{isNew ? "מנה חדשה" : "עריכת פריט"}</p>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          {/* Team mastery (existing) / new-dish note */}
          {isNew ? (
            <div className="flex items-center gap-2 bg-[#15302b] rounded-2xl px-3 py-2.5">
              <Sparkles size={16} className="text-[#2f9e8f]" />
              <span className="text-xs text-[#3fd0bc] font-semibold">ה-AI יבנה כרטיסיות ושאלות מהמנה אוטומטית</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-[#191b1f] rounded-2xl px-3 py-2.5">
              <GraduationCap size={16} className="text-[#2f9e8f]" />
              <span className="text-xs text-gray-300 font-semibold">{item.learnedBy} מתוך {TEAM_SIZE} מהצוות שולטים בפריט</span>
              <span className="mr-auto text-xs font-black text-[#3fd0bc]">{pct}%</span>
            </div>
          )}

          <SheetField label="שם הפריט">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: ניוקי תרד"
              className="w-full bg-[#1c1e22] border border-[#22252b] rounded-xl px-3 py-2.5 text-sm font-bold text-gray-100 text-right placeholder:text-gray-600 focus:outline-none focus:border-[#2f9e8f]" />
          </SheetField>

          <SheetField label="קטגוריה">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CATS).map(([key, c]) => {
                const on = cat === key;
                return (
                  <button key={key} onClick={() => setCat(key)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                      on ? "bg-[#15302b] border-[#2f9e8f] text-[#3fd0bc]" : "bg-[#1c1e22] border-[#22252b] text-gray-500"}`}>
                    <c.icon size={13} className={on ? "text-[#3fd0bc]" : "text-gray-600"} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </SheetField>

          <SheetField label="מחיר (₪)">
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
              className="w-full bg-[#1c1e22] border border-[#22252b] rounded-xl px-3 py-2.5 text-sm font-bold text-gray-100 text-right focus:outline-none focus:border-[#2f9e8f]" />
          </SheetField>

          <SheetField label="תיאור">
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3}
              className="w-full bg-[#1c1e22] border border-[#22252b] rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-200 text-right leading-relaxed resize-none focus:outline-none focus:border-[#2f9e8f]" />
          </SheetField>

          <SheetField label="אלרגנים">
            <div className="flex flex-wrap gap-1.5">
              {ALLERGENS.map((a) => {
                const on = allergens.has(a);
                return (
                  <button key={a} onClick={() => toggleAllergen(a)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                      on ? "bg-[#3a1d22] border-[#e34d6c] text-[#f0788e]" : "bg-[#1c1e22] border-[#22252b] text-gray-500"}`}>
                    {a}
                  </button>
                );
              })}
            </div>
          </SheetField>

          {/* Daily special toggle (existing items only) */}
          {!isNew && (
            <button onClick={onToggleSpecial}
              className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 border transition-colors ${
                isSpecial ? "bg-[#15302b] border-[#2f9e8f]" : "bg-[#191b1f] border-[#22252b]"}`}>
              <span className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors ${isSpecial ? "bg-[#2f9e8f] justify-end" : "bg-[#33363d] justify-start"}`}>
                <span className="w-5 h-5 rounded-full bg-white" />
              </span>
              <span className="flex items-center gap-2 text-sm font-bold text-gray-100">
                סימון כמנת היום
                <Star size={15} className={isSpecial ? "text-[#f3c14b] fill-[#f3c14b]" : "text-gray-600"} />
              </span>
            </button>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[#22252b]">
          <button onClick={save} disabled={!canSave}
            className={`w-full rounded-2xl py-3.5 font-black text-base flex items-center justify-center gap-2 ${
              canSave ? "bg-[#2a8576] text-white active:bg-[#247567]" : "bg-[#1c1e22] text-gray-600 cursor-not-allowed"}`}>
            <Check size={18} /> {isNew ? "הוספת המנה" : "שמירת שינויים"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetField({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-gray-500 mb-1.5 px-1">{label}</p>
      {children}
    </div>
  );
}

// ── shared ─────────────────────────────────────────────────────────────────────

function Avatar({ emp, size = 28 }) {
  if (!emp) return null;
  const initials = emp.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <span className="inline-flex items-center justify-center rounded-full text-white font-black flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, background: emp.color }}
      title={`${emp.name} · ${emp.role}`}>
      {initials}
    </span>
  );
}

function AvailBadge({ state }) {
  if (state === "want") return <span className="text-[10px] font-black text-[#3fd0bc] bg-[#15302b] px-2 py-1 rounded-lg whitespace-nowrap">ביקש/ה ✓</span>;
  if (state === "ok")   return <span className="text-[10px] font-black text-gray-300 bg-[#22252b] px-2 py-1 rounded-lg whitespace-nowrap">זמין/ה</span>;
  return <span className="text-[10px] font-bold text-gray-500 bg-[#1c1e22] px-2 py-1 rounded-lg whitespace-nowrap">לא הגיש/ה</span>;
}
