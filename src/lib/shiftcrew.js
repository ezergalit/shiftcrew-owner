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
