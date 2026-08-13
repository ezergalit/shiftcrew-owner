// ⚠️ STALE — the deployed function is v12 and this file is not it.
// v12 added: mode:"transcribe" (photos -> plain marked-up text, fixing the
// "model returned invalid JSON" failure), "## "/"?? " line markers for heading
// detection, and the four separate warning groups (allergens / pregnancy /
// pitfalls / kashrut).
//
// Refresh this file from what is actually running before editing it:
//   the Supabase MCP tool `get_edge_function` returns files[0].content verbatim.
// Then edit here and redeploy with `deploy_edge_function`.

// AI menu parser for the owner app's menu-import tutorial.
//
// TWO SEPARATE CALLS, on purpose (v9). Photos used to go through a single call that had
// to return the transcript *inside* a JSON string alongside the structured menu. Every
// newline needed escaping, the output ran long, and it came back truncated — the owner
// just saw "model returned invalid JSON". Now:
//
//   mode:"transcribe"  photo(s) -> PLAIN TEXT. No JSON, so nothing can be malformed.
//                      The owner proofreads this before anything else happens.
//   mode:"structure"   verified text -> JSON (categories, dishes, questions).
//
// Splitting also matches how the work actually divides: reading a picture correctly and
// deciding what is a dish are different jobs, and the owner belongs in between them.
//
// Provider: an Anthropic key (native Messages API) or an OpenRouter key (OpenAI-compatible
// chat/completions). Both run Claude Haiku; a whole menu costs a few agorot even at two
// calls. Keys are read per-request so rotating a secret needs no redeploy, and the lookup
// is case- and typo-tolerant (the secret was once saved as "operrouter_api_key").

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function findKey(patterns: RegExp[]): string | undefined {
  const env = Deno.env.toObject();
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (patterns.some((p) => p.test(name))) return value;
  }
  return undefined;
}

const TRANSCRIBE_PROMPT = `אתה מתמלל תפריטי מסעדות. תקבל צילום אחד או יותר של תפריט. החזר **טקסט בלבד** — לא JSON, לא הסברים, לא גדרות קוד. רק התפריט כפי שהוא כתוב.

עבוד בשני מעברים:
**מעבר 1 — תמלול.** קרא את כל הטקסט בתמונות מההתחלה ועד הסוף והעתק אותו כלשונו: כותרות, שמות מנות, תיאורים, מחירים והערות בשוליים.
**מעבר 2 — הגהה.** חזור לתמונות ועבור על התמלול שורה מול שורה. תקן שגיאות קריאה, השלם שורות שדילגת עליהן, ובדוק במיוחד מספרים (מחירים, כמויות, משקלים) ושמות לועזיים בתעתיק.

⚠️ שני המעברים הם **תהליך פנימי שלך**. הפלט מכיל **אך ורק את תוכן התפריט** — אל תכתוב "מעבר 1", "מעבר 2", "תמלול", "הגהה", כותרות ביניים, הערות על העבודה שלך, או כל טקסט שאינו כתוב בתפריט עצמו.

סדר קריאה: תפריט בעברית נקרא מימין לשמאל ומלמעלה למטה. תפריט בכמה עמודות — סיים עמודה שלמה לפני שאתה עובר לבאה, מהעמודה הימנית לשמאלית. תפריט באנגלית — משמאל לימין. אם צורפו כמה תמונות — תמלל אותן לפי הסדר שבו נשלחו, והפרד ביניהן בשורה "--- תמונה 2 ---" וכן הלאה.

סימון (חשוב מאוד לשלב הבא):
- שורה שהיא **כותרת של קבוצת מנות** (מודגשת, גדולה יותר, בצבע אחר, ממורכזת, או שאין מתחתיה מחיר אבל יש מחירים בשורות שאחריה) — סמן אותה בתחילת השורה ב-"## ". לדוגמה: "## דגים".
- שורה שהיא **מנה** — כתוב אותה כמו שהיא, עם המחיר בסוף אם יש.
- טקסט שלא הצלחת לקרוא בוודאות — כתוב את מה שקראת ואחריו [?].
- אל תמציא שום דבר שלא כתוב בתמונה. אל תשלים מחירים חסרים.`;

const STRUCTURE_PROMPT = `אתה מנוע לפענוח תפריטי מסעדות עבור אפליקציית הדרכת מלצרים. תקבל את הטקסט של התפריט. החזר JSON תקין בלבד, ללא שום טקסט נוסף וללא גדרות קוד, בסכימה הבאה:
{"categories":[{"name":"שם קטגוריה","dishes":[{"name":"שם מנה","price":מספר או null,"description":"תיאור","ingredients":["מרכיב"],"allergens":["אלרגן"],"pitfalls":["מוקש"]}]}],"generalNotes":["הערה כללית"],"questions":[{"id":"q1","question":"שאלה","options":["אפשרות א","אפשרות ב"]}]}

## מה מנה ומה כותרת — הכלל הכי חשוב

**כותרת קבוצה איננה מנה.** בתפריט
  דגים
  בס 45
  סלמון 50
יש **קטגוריה אחת בשם "דגים" ושתי מנות** — "דגים" הוא לא מנה שלישית.

איך מזהים:
- שורה שסומנה ב-"## " היא **תמיד** כותרת קטגוריה. הסר את ה-"## " מהשם.
- שורה **בלי מחיר ובלי תיאור**, שאחריה באות שורות **עם** מחיר או תיאור — היא כותרת קטגוריה.
- שורה **עם מחיר** היא כמעט תמיד מנה.
- שורה בלי מחיר שיש לה תיאור משלה, בתוך קבוצה שגם שאר המנות בה בלי מחירים — היא מנה.
- שם קצר וכללי של סוג אוכל ("דגים", "פסטות", "קינוחים", "מהגריל", "סושי") הוא כמעט תמיד כותרת. שם ספציפי ("בס ים בתנור", "פסטה ארביאטה") הוא מנה.

**אם אתה לא בטוח לגבי שורה — אל תנחש.** הוסף שאלה ב-questions ששואלת את הבעלים במפורש, למשל: "הכותרות 'דגים' ו'מהגריל' — אלה שמות של קבוצות בתפריט או שמות של מנות?" עם options ["אלה שמות קבוצות", "אלה מנות"]. עדיף לשאול מאשר להכניס כותרת כמנה — מלצר שיתאמן על מנה שלא קיימת ילמד שטות.

## כללים מחייבים

1. **סדר**: החזר את הקטגוריות **בסדר שבו הן מופיעות בתפריט**, ואת המנות **בסדר שבו הן מופיעות בתוך כל קטגוריה**. אל תמיין לפי אלפבית או מחיר. הסדר של התפריט הוא מידע — הצוות ילמד לפיו.
2. **קטגוריות מהתפריט עצמו**: השתמש בכותרות שכתובות בתפריט ("ראשונות", "מנות פתיחה", "מהגריל", "מאקי") **כלשונן**. אל תמציא שמות ואל תתרגם. אם אין שום כותרת בתפריט — קבץ בעצמך והוסף שאלה שמאשרת את החלוקה. כותרת מפוצלת ("ראשונות קרות" / "ראשונות חמות") — שמור על הפיצול.
3. אל תמציא מנות, מחירים או פרטים שלא מופיעים בקלט. מחיר שלא צוין = null. טקסט שסומן ב-[?] — אל תשלים אותו בניחוש; אם הוא קריטי, שאל.
4. description: משפט שמלצר **חדש** מבין מיד — נסח מחדש לבהירות במקום להעתיק קיצורים טלגרפיים. לדוגמה: "צמחוני - ירק לבחירה עד 3 מרכיבים" ⇒ "רול במילוי ירקות לבחירת הסועד — עד 3 ירקות". מותר לנסח מחדש; אסור להוסיף עובדות. אם צוינו שינויים אפשריים — כלול אותם בסוף התיאור בפורמט "שינויים: ...".
5. ingredients: המרכיבים כפי שצוינו בקלט. לא צוינו — רשימה ריקה.
6. allergens: אך ורק מתוך: גלוטן, חלב, ביצים, אגוזים, בוטנים, דגים, רכיכות, סויה, שומשום.
   זהו שדה בטיחותי שמלצרים מוסרים לפיו מידע לסועדים — עדיף להשאיר ריק מאשר לסמן אלרגן שגוי.
   סמן אלרגן רק אם אתה יכול להצביע על מרכיב או מילה מפורשת **במנה הזו עצמה** שגורמת לו
   (טמפורה/פנקו/רוטב סויה ⇒ גלוטן; גבינת שמנת/חמאה ⇒ חלב; שרימפס/סרטן ⇒ רכיכות;
   שומשום/טחינה ⇒ שומשום). מרכיב שלא מוכר לך — אל תנחש מה יש בו, אל תסמן.
   אסור להסיק אלרגן משם המנה, מהקטגוריה, או ממנות דומות. ירקות וכבושים (אושינקו, קנפיו, אבוקדו, מלפפון, גזר) אינם אגוזים.
   **עקביות בתוך התפריט**: אלרגן שנכון למנה אחת חייב להיות מסומן בכל המנות שיש בהן אותו מרכיב. אלרגן שמסומן רק בחלק מהמנות גרוע מאלרגן שלא מסומן בכלל — הצוות לומד ממנו שהמנות האחרות בטוחות.
   **חריג "דגים" בתפריט דגים/סושי**: אם רוב מוחלט של המנות בתפריט מכילות דג, הסימון לא מוסר מידע. סמן "דגים" רק במנות שבהן יש דג, ורק אם יש בתפריט גם מנות משמעותיות בלי דג. אם כמעט הכל דג — אל תסמן "דגים" בכלל, וציין זאת ב-generalNotes.
7. pitfalls (מוקשים): **לא אלרגיות** — העדפות נפוצות שסועד עשוי לבקש להימנע מהן, בלי סכנה רפואית.
   אך ורק מתוך: כוסברה, חריף, דג נא, שום, בצל, ג'ינג'ר, וסאבי, מיונז, אלכוהול, טחינה.
   **"דג נא" הוא מוקש ולא אלרגן** — הוא רלוונטי להריון ולסועדים שלא אוכלים דג נא, ולכן הוא לא שייך לרשימת האלרגנים.
   סמן "דג נא" רק כשהדג במנה מוגש נא: סשימי, ניגירי עם דג, ורולים עם דג שלא צוין בהם בישול/טיגון. מנה שהדג בה מטוגן, מבושל, מעושן או "חם" — לא מקבלת "דג נא".
   כמו באלרגנים: רק ממידע מפורש במנה עצמה, ובעקביות על פני כל התפריט. אין מוקשים — רשימה ריקה.
8. generalNotes: הערות כלליות שאינן מנה ספציפית (דגשים לצוות, מדיניות הגשה) — העתק כלשונן.
9. questions: מקסימום 3, תמיד ברמת קבוצות/מבנה — לעולם לא על מנה בודדת. שאל כשיש אי-ודאות אמיתית: מה כותרת ומה מנה, לאיזו קטגוריה שייכת קבוצה, אם עמודה היא מחיר, או כשקבוצת שורות לא מובנת מספיק לתיאור ברור. אין אי-ודאות — החזר [].
10. צורפו תשובות של המנהל — החזר פענוח סופי לפיהן, עם questions: [].
11. שמור על השפה המקורית של התפריט.`;

const ALLOWED_ALLERGENS = new Set([
  "גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום",
]);

// Pitfalls are preferences (coriander, spicy, raw fish), not safety. Kept as a closed list
// for the same reason as allergens — a free-text pitfall can't be questioned about or
// filtered on — and mirrored in the owner app's PITFALLS constant.
const ALLOWED_PITFALLS = new Set([
  "כוסברה", "חריף", "דג נא", "שום", "בצל", "ג'ינג'ר", "וסאבי", "מיונז", "אלכוהול", "טחינה",
]);

// Heading lines the transcription pass marked with "## " must never become dishes, no
// matter what the structure pass decided. The prompt says so too; this makes it true.
const HEADING_RE = /^\s*#{1,3}\s*/;
const isHeadingLine = (s: string) => HEADING_RE.test(String(s || ""));
const stripHeading = (s: string) => String(s || "").replace(HEADING_RE, "").trim();

const onlyAllowed = (v: unknown, allowed: Set<string>) =>
  Array.isArray(v) ? v.filter((x: unknown) => typeof x === "string" && allowed.has(x)) : [];

// Stamps source order (`order` per category, flat `position` per dish) and drops both
// hallucinated allergens/pitfalls and any "dish" that is really a heading.
function sanitizeCategories(categories: unknown): { categories: unknown[]; droppedHeadings: string[] } {
  if (!Array.isArray(categories)) return { categories: [], droppedHeadings: [] };
  const droppedHeadings: string[] = [];
  let position = 0;
  const out = categories.map((cat: Record<string, unknown>, order: number) => {
    const dishes = Array.isArray(cat?.dishes) ? cat.dishes : [];
    return {
      ...cat,
      name: stripHeading(cat?.name as string) || "כללי",
      order,
      dishes: dishes
        .filter((d: Record<string, unknown>) => {
          if (isHeadingLine(d?.name as string)) {
            droppedHeadings.push(stripHeading(d?.name as string));
            return false;
          }
          return String(d?.name || "").trim().length > 0;
        })
        .map((d: Record<string, unknown>) => ({
          ...d,
          position: position++,
          allergens: onlyAllowed(d?.allergens, ALLOWED_ALLERGENS),
          pitfalls: onlyAllowed(d?.pitfalls, ALLOWED_PITFALLS),
        })),
    };
  });
  return { categories: out, droppedHeadings };
}

type Img = { media_type: string; data: string };

async function callAnthropic(key: string, system: string, userText: string, images: Img[], maxTokens: number) {
  const content: unknown[] = images.map((im) => ({
    type: "image",
    source: { type: "base64", media_type: im.media_type, data: im.data },
  }));
  content.push({ type: "text", text: userText });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  // stop_reason "max_tokens" means the answer is cut off — surfacing it beats handing the
  // caller a half-parsed menu.
  if (data.stop_reason === "max_tokens") throw new Error("התפריט ארוך מדי לפענוח בבת אחת — נסו לצלם אותו בכמה חלקים.");
  return (data.content?.[0]?.text || "").trim();
}

async function callOpenRouter(key: string, system: string, userText: string, images: Img[], maxTokens: number) {
  const content: unknown[] = images.map((im) => ({
    type: "image_url",
    image_url: { url: `data:${im.media_type};base64,${im.data}` },
  }));
  content.push({ type: "text", text: userText });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://shiftcrew-owner.vercel.app",
      "X-Title": "Menu Trainer",
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4.5",
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: "system", content: system }, { role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (data.choices?.[0]?.finish_reason === "length") throw new Error("התפריט ארוך מדי לפענוח בבת אחת — נסו לצלם אותו בכמה חלקים.");
  return (data.choices?.[0]?.message?.content || "").trim();
}

// Models occasionally wrap JSON in prose or a code fence, or leave a trailing comma.
// Recovering costs nothing; failing sends the owner back to the start of the import.
function parseLooseJson(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* keep trying */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try { return JSON.parse(slice); } catch { /* keep trying */ }
    try { return JSON.parse(slice.replace(/,(\s*[}\]])/g, "$1")); } catch { /* give up */ }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const anthropicKey = findKey([/anthropic/i]);
    const openrouterKey = findKey([/open.?router/i, /oper.?router/i]);

    const url = new URL(req.url);
    if (url.searchParams.get("diag") === "1") {
      return json({
        anthropic: anthropicKey ? `set (${anthropicKey.length} chars)` : "missing",
        openrouter: openrouterKey ? `set (${openrouterKey.length} chars)` : "missing",
        envNames: Object.keys(Deno.env.toObject()).filter((k) => /KEY|TOKEN|ANTHROPIC|ROUTER/i.test(k)),
      });
    }
    if (!anthropicKey && !openrouterKey) return json({ error: "no AI key configured", code: "missing_key" }, 500);

    const body = await req.json();
    const { mode, text, image, images, qa } = body;
    const imgs: Img[] = (Array.isArray(images) ? images : image ? [image] : [])
      .filter((im: Img) => im?.data && im?.media_type);

    const run = (system: string, userText: string, ims: Img[], maxTokens: number) =>
      anthropicKey
        ? callAnthropic(anthropicKey, system, userText, ims, maxTokens)
        : callOpenRouter(openrouterKey!, system, userText, ims, maxTokens);

    // ---- pass 1: photos -> plain text -------------------------------------------------
    if (mode === "transcribe") {
      if (!imgs.length) return json({ error: "images required" }, 400);
      const transcript = await run(
        TRANSCRIBE_PROMPT,
        imgs.length > 1
          ? `תמלל את ${imgs.length} התמונות של התפריט, לפי הסדר.`
          : "תמלל את התפריט שבתמונה.",
        imgs,
        8000,
      );
      return json({ transcript });
    }

    // ---- pass 2: text -> structure -----------------------------------------------------
    if (!text && !imgs.length) return json({ error: "text or image required" }, 400);

    let userText = text ? `התפריט:\n${text}` : "פענח את התפריט שבצילום.";
    if (Array.isArray(qa) && qa.length > 0) {
      userText += "\n\nתשובות המנהל לשאלות ההבהרה:\n" +
        qa.map((x: { question: string; answer: string }) => `- ${x.question} ⇒ ${x.answer}`).join("\n");
    }

    const raw = await run(STRUCTURE_PROMPT, userText, text ? [] : imgs, 16000);
    const parsed = parseLooseJson(raw);
    if (!parsed) return json({ error: "model returned invalid JSON", raw: raw.slice(0, 800) }, 502);

    const { categories, droppedHeadings } = sanitizeCategories(parsed.categories);
    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3) : [];

    // A heading that slipped through as a dish is a signal the model was unsure about the
    // menu's structure. Dropping it silently would hide that from the owner.
    if (droppedHeadings.length && questions.length < 3) {
      questions.push({
        id: "headings",
        question: `השורות ${droppedHeadings.slice(0, 4).map((h) => `"${h}"`).join(", ")} — אלה שמות של קבוצות בתפריט או מנות?`,
        options: ["אלה שמות של קבוצות", "אלה מנות בפני עצמן"],
      });
    }

    return json({
      categories,
      generalNotes: Array.isArray(parsed.generalNotes) ? parsed.generalNotes : [],
      questions,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
