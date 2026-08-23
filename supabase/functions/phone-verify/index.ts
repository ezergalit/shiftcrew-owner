// phone-verify — CrewMenu phone verification via Twilio Verify.
//
// WhatsApp is the primary channel (the account has an approved Business sender)
// with automatic SMS fallback. Verify uses Meta's pre-defined Copy Code
// authentication templates, so no template of ours needs Meta approval.
//
// Two modes:
//   { mode: "send",  phone }        -> starts a verification, returns the channel used
//   { mode: "check", phone, code }  -> on success returns a single-use nonce
//
// The nonce is the only thing the client ever holds. menu_app.attach_verified_phone()
// consumes it server-side, so a client cannot claim a phone it did not verify.

const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const VERIFY_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID") ?? "";

// Store-review bypass. Apple and Google reviewers cannot receive our SMS, and a
// reviewer stuck on an OTP screen is a guideline 2.1 rejection. This number never
// reaches Twilio and always accepts TEST_CODE. Both are documented in the review notes.
const TEST_PHONE = Deno.env.get("VERIFY_TEST_PHONE") ?? "";
const TEST_CODE = Deno.env.get("VERIFY_TEST_CODE") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Quotas. Open signup plus paid SMS is the classic SMS-pumping target: an attacker
// floods premium-rate foreign numbers and takes a cut of the termination fee. Israel
// only, plus these ceilings, is what keeps the bill bounded.
const MAX_PER_PHONE_PER_DAY = 3;
const MAX_PER_IP_PER_DAY = 10;
const MAX_GLOBAL_PER_DAY = 200;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/** Israeli mobile -> E.164, or null. Phase 1 is +972 only, by design. */
function normalizeIL(raw: string): string | null {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  let d = digits.startsWith("+") ? digits.slice(1) : digits;

  if (d.startsWith("972")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  else return null;

  // Mobile only: 9 digits starting with 5. WhatsApp OTP cannot reach a landline.
  if (!/^5\d{8}$/.test(d)) return null;
  return `+972${d}`;
}

async function db(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Accept-Profile": "menu_app",
      "Content-Profile": "menu_app",
      Prefer: "count=exact",
      ...(init.headers || {}),
    },
  });
}

async function countSince(filter: string): Promise<number> {
  const since = new Date(Date.now() - 864e5).toISOString();
  const res = await db(`phone_otp_sends?select=id&created_at=gte.${since}&${filter}`, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const range = res.headers.get("content-range") || "";
  return Number(range.split("/")[1] || 0);
}

async function twilio(endpoint: string, form: Record<string, string>) {
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${VERIFY_SID}/${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form),
    },
  );
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!ACCOUNT_SID || !AUTH_TOKEN || !VERIFY_SID) {
    return json(
      { error: "לא הוגדרו פרטי Twilio. הוסיפו TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID ב-Edge Function Secrets." },
      500,
    );
  }

  const { mode = "send", phone: rawPhone, code, channel } = await req
    .json()
    .catch(() => ({} as Record<string, string>));

  const phone = normalizeIL(rawPhone);
  if (!phone) return json({ error: "מספר לא תקין. נדרש מספר נייד ישראלי, למשל 050-1234567." }, 400);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const isTest = !!TEST_PHONE && phone === normalizeIL(TEST_PHONE);

  // ---- send ---------------------------------------------------------------
  if (mode === "send") {
    if (isTest) return json({ ok: true, channel: "test" });

    const [perPhone, perIp, global] = await Promise.all([
      countSince(`phone=eq.${encodeURIComponent(phone)}`),
      countSince(`ip=eq.${encodeURIComponent(ip)}`),
      countSince("id=not.is.null"),
    ]);

    if (perPhone >= MAX_PER_PHONE_PER_DAY)
      return json({ error: "נשלחו כבר מספר קודים למספר הזה היום. נסו שוב מחר." }, 429);
    if (perIp >= MAX_PER_IP_PER_DAY)
      return json({ error: "יותר מדי בקשות. נסו שוב מאוחר יותר." }, 429);
    if (global >= MAX_GLOBAL_PER_DAY)
      return json({ error: "השירות עמוס כרגע. נסו שוב מאוחר יותר." }, 429);

    let used = channel === "sms" ? "sms" : "whatsapp";
    let out = await twilio("Verifications", { To: phone, Channel: used });

    // A number with no WhatsApp account cannot receive the template. Falling back
    // keeps a real waiter from being locked out of joining.
    if (!out.ok && used === "whatsapp") {
      used = "sms";
      out = await twilio("Verifications", { To: phone, Channel: used });
    }

    await db("phone_otp_sends", {
      method: "POST",
      body: JSON.stringify({ phone, ip, channel: used, ok: out.ok }),
    });

    if (!out.ok) {
      console.error("twilio send failed", out.status, out.body);
      return json({ error: "שליחת הקוד נכשלה. בדקו את המספר ונסו שוב." }, 502);
    }
    return json({ ok: true, channel: used });
  }

  // ---- check --------------------------------------------------------------
  if (mode === "check") {
    if (!code) return json({ error: "חסר קוד." }, 400);

    let approved: boolean;
    let usedChannel = "test";

    if (isTest) {
      approved = !!TEST_CODE && String(code) === TEST_CODE;
    } else {
      const out = await twilio("VerificationCheck", { To: phone, Code: String(code) });
      approved = out.ok && out.body?.status === "approved";
      usedChannel = out.body?.channel || "sms";
    }

    if (!approved) return json({ ok: false, error: "הקוד שגוי או פג תוקף." }, 400);

    const nonce = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const ins = await db("phone_verifications", {
      method: "POST",
      body: JSON.stringify({ phone, nonce, channel: usedChannel }),
    });
    if (!ins.ok) {
      console.error("nonce insert failed", ins.status, await ins.text());
      return json({ error: "שגיאה פנימית. נסו שוב." }, 500);
    }

    return json({ ok: true, nonce, phone });
  }

  return json({ error: `mode לא מוכר: ${mode}` }, 400);
});
