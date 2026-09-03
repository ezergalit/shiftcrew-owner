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
// 2026-09-03: the original Supabase project (huwcyedlbcrugpbdcsdo) vanished and was
// rebuilt as a new project under our own org. Hardcoded on purpose: the Vercel
// projects still carry the OLD VITE_SUPABASE_* env vars in an org we can't edit,
// so env values must not win here. The anon key is public by design (RLS is the gate).
const url = "https://qwgbyeapzzeybmndrszw.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3Z2J5ZWFwenpleWJtbmRyc3p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzE4OTAsImV4cCI6MjEwNDAwNzg5MH0.cmVR44V98ZWtbovrCB530I97sZD6kNVG7HgkadLeuM8";

// Every request carries the app-session token (see lib/appSession.js) in an
// x-app-session header. RLS policies resolve it server-side to a restaurant —
// that lookup is the real access control; the .eq() filters in app code are
// just ergonomics. Read from localStorage on each call (not captured once) so
// login/logout take effect without recreating the client.
const sessionFetch = (input, init = {}) => {
  const token = (() => {
    try { return localStorage.getItem("menu-app-session-token"); } catch { return null; }
  })();
  if (token) {
    const headers = new Headers(init.headers || {});
    headers.set("x-app-session", token);
    init = { ...init, headers };
  }
  return fetch(input, init);
};

export const supabase = createClient(url, key, {
  global: { fetch: sessionFetch },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    // Nothing should be reading a token out of the URL either — this app never does an
    // OAuth redirect.
    detectSessionInUrl: false,
  },
});
