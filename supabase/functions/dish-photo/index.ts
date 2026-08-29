// dish-photo — lets a signed-in manager attach a photo to one of their own dishes.
//
// Why a function at all: the apps talk to Postgres as `anon` and prove who they are with
// an `x-app-session` header that our RLS helpers read. Storage is a separate service and
// cannot see that header, so its policies only allow the `authenticated` role — which this
// product never uses. Widening Storage to `anon` would let anyone holding the (public,
// bundled) anon key write into the bucket.
//
// So the session is validated here, server-side, and the upload runs with the service key.
// ⚠️ The destination path is derived from the SESSION, never from the request body: a
// manager can only ever write under their own restaurant's prefix, whatever they send.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // ⚠️ x-app-session must be listed. The apps inject that header into EVERY supabase
  // request (lib/supabase.js), so the browser preflights it here too — and a header the
  // preflight does not allow fails the whole call before it is ever sent. curl never
  // preflights, so this passed every command-line test and failed in the app.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 6 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { token?: string; data?: string; media_type?: string; dish_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const token = body.token || req.headers.get("x-app-session") || "";
  if (!token) return json({ error: "no_session" }, 401);
  if (!body.data) return json({ error: "no_file" }, 400);

  const mediaType = body.media_type || "image/jpeg";
  if (!ALLOWED.has(mediaType)) return json({ error: "bad_type" }, 415);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ⚠️ menu_app.app_sessions has NO grants beyond `postgres` — deliberately, since the raw
  // token is the only credential this product has. So the lookup goes through a
  // SECURITY DEFINER function granted to service_role alone, which answers exactly one
  // question and returns nothing else. Selecting the table directly fails with a bare
  // "bad_session", which is what it did before this comment existed.
  const { data: rows } = await admin
    .schema("menu_app")
    .rpc("session_owner_for_token", { p_token: token });
  const session = Array.isArray(rows) ? rows[0] : rows;

  if (!session) return json({ error: "bad_session" }, 401);
  // Only a manager session may write. A waiter's token reaches the same tables through
  // RLS but has no business changing what the menu looks like.
  if (session.role !== "owner") return json({ error: "not_owner" }, 403);

  let bytes: Uint8Array;
  try {
    const raw = atob(body.data);
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  } catch {
    return json({ error: "bad_base64" }, 400);
  }
  if (bytes.byteLength > MAX_BYTES) return json({ error: "too_large" }, 413);

  const ext = mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : "jpg";
  // ⚠️ Hebrew filenames break Storage uploads ("ascii codec can't encode"), and a name
  // taken from the dish would leak the menu into the URL. A random ASCII key avoids both.
  const key = `${session.restaurant_id}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await admin.storage
    .from("restaurant-photos")
    .upload(key, bytes, { contentType: mediaType, upsert: false });
  if (upErr) return json({ error: "upload_failed", detail: upErr.message }, 500);

  const { data: pub } = admin.storage.from("restaurant-photos").getPublicUrl(key);

  // ⚠️ The menu_items row is written by the CLIENT, through the same session-scoped
  // PostgREST path it already uses to save a dish. Doing it here would mean granting
  // service_role write access to the menu, and the whole point of the narrow
  // session_owner_for_token function is that service_role reaches nothing else.
  return json({ url: pub.publicUrl });
});
