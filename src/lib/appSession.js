// App-session token — the "I am restaurant X" proof that RLS policies check
// server-side. Minted by menu_app.owner_login_v2 / menu_app.team_join, sent on
// every PostgREST request as an x-app-session header (see lib/supabase.js).
// This is NOT a Supabase Auth session; it lives in our own menu_app.app_sessions
// table and the raw value is stored nowhere but this device.
const TOKEN_KEY = "menu-app-session-token";

export const getSessionToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
};

export const setSessionToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable — requests will just run sessionless */ }
};
