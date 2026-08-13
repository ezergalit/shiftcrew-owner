import { createClient } from "@supabase/supabase-js";

// ONE Supabase client for the whole Menu Trainer owner app.
//
// This app has NO Supabase Auth of its own — owners sign in with an owner_code and a
// password checked by a SECURITY DEFINER function, and every request is meant to run as
// the `anon` role. The comment that used to sit here described the old ShiftMatch owner
// app (sign in with a ShiftMatch account, read the `public` schema); none of that is
// true anymore, and the auth config it left behind caused a real bug.
//
// ⚠️ persistSession must stay false. This project shares its Supabase instance with
// ShiftMatch, so a Supabase Auth session could end up in storage; with persistSession on,
// supabase-js sends that token instead of the anon key and PostgREST runs the request as
// `authenticated`. Owners in that state hit "permission denied for table restaurants" on
// any column granted to `anon` alone, while a browser with clean storage worked fine —
// which made it look like it wasn't reproducible. Grants were levelled across both roles
// as well, but the real fix is not to send someone else's token in the first place.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    // Nothing should be reading a token out of the URL either — this app never does an
    // OAuth redirect.
    detectSessionInUrl: false,
  },
});
