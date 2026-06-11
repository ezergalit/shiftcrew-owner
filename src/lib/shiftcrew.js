import { supabase } from "./supabase";

// ShiftCrew lives in its OWN isolated Postgres schema (shiftcrew_owner) inside the
// shared ShiftMatch project — completely separate from ShiftMatch's production
// tables in `public`. We reuse the single authed client and just pin the schema,
// so the owner's login session carries through to every ShiftCrew query while the
// app can only ever read/write shiftcrew_owner.
export const scOwner = supabase.schema("shiftcrew_owner");

// Day index used by the DB: 0 = Sunday … 6 = Saturday (Israeli week, Sunday-first).
export const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// DB menu_items row -> the shape the MenuTab UI uses.
export const rowToItem = (r) => ({
  id: r.id, cat: r.category, name: r.name, price: Number(r.price),
  desc: r.description ?? "", ingredients: r.ingredients ?? [],
  allergens: r.allergens ?? [], learnedBy: r.learned_by ?? 0,
  isSpecial: !!r.is_special,
});

// Find this owner's ShiftCrew restaurant (linked by their ShiftMatch auth id),
// creating it the first time. We auto-link from their real ShiftMatch restaurant
// (public.restaurants, READ ONLY) so setup feels connected — name/type/address
// are pre-filled. Returns { id, name, type, address, justCreated }.
export async function getOwnerRestaurant(ownerAuthId) {
  // 1. Already have a ShiftCrew restaurant for this owner?
  const { data: existing, error } = await scOwner
    .from("restaurants")
    .select("id, name, type, address")
    .eq("owner_auth_id", ownerAuthId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  if (existing && existing.length) return { ...existing[0], justCreated: false };

  // 2. None yet — pull their real ShiftMatch restaurant to pre-fill (read only).
  const { data: smRests } = await supabase
    .from("restaurants")
    .select("id, name, type, address, city")
    .eq("owner_id", ownerAuthId)
    .order("created_at", { ascending: true })
    .limit(1);
  const sm = smRests && smRests[0];

  const seed = {
    owner_auth_id: ownerAuthId,
    shiftmatch_restaurant_id: sm?.id ?? null,
    name: sm?.name ?? "המסעדה שלי",
    type: sm?.type ?? "restaurant",
    address: sm?.address ?? sm?.city ?? "",
  };

  const { data: created, error: e2 } = await scOwner
    .from("restaurants").insert(seed).select("id, name, type, address").single();
  if (e2) throw e2;
  return { ...created, justCreated: true };
}

// ── Unified staff roster ──────────────────────────────────────────────────────
// The SAME phone roster powers BOTH waiter-app access and scheduling: everyone
// the owner adds here is schedulable and can log into the waiter app. Each row:
// { id, name, phone, role, active }. A stable per-person avatar colour is derived
// from the phone so the owner and waiter apps colour the same person identically.
const AVATAR_PALETTE = [
  "#14b8a6", "#7c5cff", "#db2777", "#65a30d", "#ea7317",
  "#0d9488", "#2563eb", "#e11d48", "#d97706",
];
export function avatarColor(seed) {
  let h = 0;
  for (const c of String(seed || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

// Active staff only — the people who can actually be put on the schedule.
export async function loadStaff(restId) {
  if (!restId) return [];
  const { data, error } = await scOwner
    .from("staff").select("*").eq("restaurant_id", restId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((s) => ({
    id: s.id,
    name: s.name?.trim() || s.phone,
    phone: s.phone,
    role: s.role || "מלצר/ית",
    active: s.active,
    color: avatarColor(s.phone),
  }));
}

// ── Availability (waiter → owner) ─────────────────────────────────────────────
// Rows in shiftcrew_owner.availability, written by the waiter app, read here so
// the owner's auto-fill uses REAL preferences. Each row: { staff_id, week_start,
// day_of_week (0..6), bucket ("morning"|"evening"|"night"), pref ("want"|"ok") }.
export async function loadAvailability(restId, weekStart) {
  if (!restId || !weekStart) return [];
  const { data, error } = await scOwner
    .from("availability").select("*")
    .eq("restaurant_id", restId).eq("week_start", weekStart);
  if (error) throw error;
  return data || [];
}

// ── Weekly schedule (draft + publish) ─────────────────────────────────────────
// The owner's in-progress schedule is a { seatKey -> staffId } map persisted on
// schedule_weeks.assignments. `saveDraft` upserts it; `publishSchedule` snapshots
// the expanded rows into the waiter app via the cross-schema RPC.
export async function loadSchedule(restId, weekStart) {
  if (!restId || !weekStart) return { assignments: {}, status: "draft" };
  const { data, error } = await scOwner
    .from("schedule_weeks").select("assignments,status")
    .eq("restaurant_id", restId).eq("week_start", weekStart).maybeSingle();
  if (error) throw error;
  return data || { assignments: {}, status: "draft" };
}

export async function saveDraft(restId, weekStart, assignments) {
  if (!restId) throw new Error("missing restaurant id");
  const { error } = await scOwner
    .from("schedule_weeks")
    .upsert(
      { restaurant_id: restId, week_start: weekStart, assignments, status: "draft" },
      { onConflict: "restaurant_id,week_start" }
    );
  if (error) throw error;
}

// rows: [{ day, label, name, from, to, position, color }] — expanded filled seats.
export async function publishSchedule(restId, weekStart, rows) {
  if (!restId) throw new Error("missing restaurant id");
  const { error } = await scOwner.rpc("publish_schedule", {
    p_restaurant_id: restId, p_week_start: weekStart, p_rows: rows,
  });
  if (error) throw error;
}

// Format a Date as the "YYYY-MM-DD" the schedule/availability tables key on.
export function isoDate(d) {
  const z = new Date(d);
  z.setMinutes(z.getMinutes() - z.getTimezoneOffset());
  return z.toISOString().slice(0, 10);
}
