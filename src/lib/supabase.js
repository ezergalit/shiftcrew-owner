import { createClient } from "@supabase/supabase-js";

// ONE Supabase client for the whole ShiftCrew Owner app. It points at the shared
// ShiftMatch project and is used for:
//   • Auth — owners sign in with their existing ShiftMatch account.
//   • Reading ShiftMatch `public` tables (restaurant_owners, restaurants) to
//     verify the account is an owner and to auto-link their restaurant. READ ONLY.
//   • ShiftCrew's own data via `.schema("shiftcrew_owner")` (see shiftcrew.js).
// Sessions persist so a logged-in owner stays logged in across reloads.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "shiftcrew-owner-auth", // distinct from ShiftMatch's own apps
  },
});
