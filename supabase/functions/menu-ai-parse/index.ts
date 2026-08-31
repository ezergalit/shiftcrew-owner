// AI menu parser for the owner app's menu-import tutorial.
//
// A FIXED PROCEDURE, not ad-hoc judgement. Every import runs the same four steps in the
// same order, because the failures were never random: they were the model deciding for
// itself what to look at first. The steps are written into the prompt as a checklist and
// the model reports what it changed.
//
//   mode:"transcribe"  photo(s) -> marked-up text + the list of corrections it made
//   mode:"structure"   verified text -> JSON
//
// MODEL CHOICE. Reading Hebrew off a photo and structuring already-correct text are very
// different jobs. On a clean, high-contrast test menu Haiku misread legible words
// ("בחמאה"->"במחבת", "קרפצ'ו דניס"->"קרפצ'ו דגים") — not a fixture problem, a capability
// one. So transcription defaults to Sonnet and structuring stays on Haiku; the caller can
// override per request. One import is one Sonnet call, which is still cents.
//
// Splitting transcription from the JSON call also fixed an earlier failure: they used to
// share one response and the escaping made it come back truncated.
//
// COPY, DON'T TRANSLATE. Menus are routinely bilingual ("Inside Out", "Spicy Tuna",
// "Happy Hour", brand names, kitchen terms). The model was rendering those into Hebrew —
// badly — and the culprit was step 3: it tells the model that a word which isn't a
// recognizable food term is a misreading to be fixed. An English or unfamiliar foreign
// term trips exactly that rule. Both prompts now open on a verbatim rule, and step 3 is
// explicitly scoped to Hebrew only: a correction means a letter was read wrong, never
// that a language was swapped.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

// `legacySampling` marks models that still accept `temperature`. Opus 5 and Sonnet 5
// reject it outright (400), so it must not be sent for them.
//
// `sonnet45` is kept only so the measurement harness can reproduce the old behaviour and
// show the difference; nothing in the app selects it.
const MODELS = {
  opus:     { anthropic: "claude-opus-5", openrouter: "anthropic/claude-opus-5", legacySampling: false },
  sonnet:   { anthropic: "claude-sonnet-5", openrouter: "anthropic/claude-sonnet-5", legacySampling: false },
  sonnet45: { anthropic: "claude-sonnet-4-5", openrouter: "anthropic/claude-sonnet-4.5", legacySampling: true },
  haiku:    { anthropic: "claude-haiku-4-5-20251001", openrouter: "anthropic/claude-haiku-4.5", legacySampling: true },
};
type Tier = keyof typeof MODELS;
const asTier = (v: unknown, fallback: Tier): Tier =>
  typeof v === "string" && v in MODELS ? (v as Tier) : fallback;


function findKey(patterns: RegExp[]): string | undefined {
  const env = Deno.env.toObject();
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (patterns.some((p) => p.test(name))) return value;
  }
  return undefined;
}

// The operating procedure. Same four steps every time, in this order, because "look at
// the layout first, read second" is what stops a description being filed as a dish.
const TRANSCRIBE_PROMPT = `אתה מתמלל תפריטי מסעדות. עבוד **תמיד באותו נוהל, באותו סדר**.

## כלל על — אתה מעתיק, לא מתרגם

מעל כל השלבים: **כל מילה נכתבת בדיוק בשפה ובכתב שבהם היא מופיעה בתפריט.**
- מילה באנגלית נשארת באנגלית, באותיות אנגליות: \`Inside Out\`, \`Spicy Tuna\`, \`Happy Hour\`, \`Ponzu\`. אל תתרגם אותה לעברית ואל תכתוב אותה בתעתיק עברי.
- מילה בעברית נשארת בעברית. אל תתרגם אותה לאנגלית.
- שמות מותגים, קוקטיילים, יינות ומונחי מטבח לועזיים — כלשונם בדיוק.
- תפריט מעורב נשאר מעורב, שורה-שורה, בדיוק כפי שהוא. אל תאחיד שפה.
- אל תוסיף תרגום בסוגריים ואל תוסיף הסבר משלך.

## כלל על 2 — מותר לך להגיד "אני לא מצליח לקרוא"

**אתה לא חייב להחזיר תפריט.** אם התמונה מטושטשת, קטנה מדי, מוארת גרוע, מצולמת בזווית או שהטקסט פשוט לא נקרא — **אמור זאת**. אל תשלים מהידע הכללי שלך על תפריטים.

**זו הטעות המסוכנת ביותר במערכת הזו**, כי תפריט מומצא נראה בדיוק כמו תפריט אמיתי, ובעל המסעדה לא יזהה אותו. הצוות ילמד מנות שלא קיימות וימכור אותן לאורחים.

סימנים שאתה ממציא ולא קורא — עצור מיד אם אתה מזהה אותם אצלך:
- **אותו מחיר חוזר על מנות רבות** (למשל הכל 88). מחירים אמיתיים משתנים.
- שמות שנשמעים "כמו תפריט" אבל אתה לא באמת רואה את האותיות שלהם על הדף.
- מנות שאתה משלים כי הן "מתבקשות" בסוג התפריט הזה.

מחיר שאינך קורא בוודאות ⇒ **כתוב [?] במקום המספר.** לעולם אל תמציא מספר.
תמונה שאינה קריאה ⇒ הוסף את מספרה ל-\`unreadable\` והשאר אותה מחוץ ל-transcript. מוטב שהבעלים יצלם שוב.

## שלב 1 — מבנה לפני מילים

לפני שאתה קורא מילה אחת — הסתכל על העיצוב והחלט מה כל שורה:

**כותרת קבוצה** — מודגשת, גדולה יותר, בצבע אחר, ממורכזת, קו מפריד מעליה/מתחתיה, או רווח גדול מסביבה. **הסימן החזק ביותר: אין לידה מחיר ואין מתחתיה תיאור, אבל בשורות שאחריה יש מחירים.** למשל "דגים" מעל שלוש שורות עם מחירים. סמן ב-"## ".
⚠ גם כותרת יכולה לשאת מחיר: "סלמון 50-200" הוא טווח, כלומר כותרת.

**כותרת משנה של הקבוצה** — שורה **מיד מתחת לכותרת קבוצה**, בלי מחיר משלה, שמתארת את הקבוצה כולה ולא מנה אחת: "לחמים יווניים להתחלה טובה.", "ככה מתחילים ארוחה יוונית!", "ראשונות חמות בניחוח יווני". סמן ב-"~ ".
**זה מלכוד נפוץ מאוד** — בלי הסימון היא נקראת כמנה בלי מחיר, וכל קבוצה בתפריט מוסיפה מנה מזויפת אחת.
מבחן ההבחנה: היא מדברת על **סוג האוכל בקבוצה** ובלשון כללית/שיווקית, ואין לה מחיר — בעוד שמנה בלי מחיר היא שם של פריט מסוים.

**מנה** — יש לידה מחיר בודד, או שהשם ספציפי ויש מתחתיו תיאור. בלי סימון.

**תיאור של המנה שמעליה** — גופן קטן יותר, מוזח פנימה, נטוי, או באפור בהיר יותר, ומונה מרכיבים או אופן הכנה. סמן ב-"> ".
**זה הסימון החשוב ביותר** — בלעדיו השלב הבא יחשוב שהתיאור הוא מנה נוספת והתפריט יוכפל.

**לא בטוח** — סמן ב-"?? ".

## שלב 2 — קריאה

עכשיו קרא את הטקסט. עברית — מימין לשמאל, מלמעלה למטה. כמה עמודות — עמודה שלמה לפני הבאה, מימין לשמאל. אנגלית — משמאל לימין, **ומועתקת כמות שהיא** (ר' כלל העל).

**כמה תמונות — אל תניח שהן בסדר של התפריט.** בעלים מצלמים עמודים בסדר אקראי, ומצלמים שוב עמוד שיצא מטושטש. תמלל כל תמונה **בנפרד ובדיוק כפי שהיא**, עם שורת הפרדה \`--- תמונה 2 ---\`. אל תמזג תמונות ואל תסדר מחדש בשלב הזה — הסידור קורה בשלב הבא, ומידע על סדר שגוי גרוע מחוסר מידע.

## שלב 3 — אימות, לא עריכה

⚠ **אתה לא מחליף מילים.** התמלול הוא מה שכתוב על הדף — גם אם זה נראה לך מוזר, לא מוכר או לא הגיוני.

**מילה שאתה מחליף בניחוש היא הנזק הגדול ביותר כאן**, כי היא נראית בדיוק כמו תמלול נכון: בעל המסעדה לא יידע שהמצאת אותה, והצוות ילמד אותה. מילה לא מוכרת היא כמעט תמיד מונח מקצועי, שם מותג, או הניסוח של המסעדה עצמה — **לא טעות**.

**חל על מילים בעברית בלבד.** מילה באנגלית או בשפה זרה — העתק ואל תבדוק אותה מול מונחי אוכל בעברית. \`Kanpyo\`, \`Ponzu\`, "קנפיו" — אינם קריאה שגויה.

עבור על כל מילה בעברית ושאל: **האם היא מתיישבת עם הצורה שרואים בתמונה?**
- מתיישבת ⇒ **השאר אותה בדיוק כפי שהיא.**
- לא בטוח ⇒ חזור לתמונה וקרא אות-אחרי-אות. **תקן רק אם הקריאה השנייה מראה אותיות אחרות בפועל** — ואז רשום ב-corrections.
- עדיין לא בטוח ⇒ **כתוב את מה שאתה רואה** והוסף [?] אחריו. בעל המסעדה יכריע. **[?] עדיף על ניחוש, תמיד.**

אותיות שמתבלבלות, לעזרה בקריאה השנייה: נ/ט · מ/ו · ו/ז · ו/י · ר/ד · ב/כ · ה/ח · ם/ס · י/ן · ג/נ

בדוק גם: מילה משוכפלת ברצף · כל מספר (מחיר, משקל, כמות) · שורות שדילגת.

**corrections = רק אותיות שקראת מחדש בתמונה.** אסור לרשום שם מילה שהחלפת כי נשמעה לך הגיונית יותר, ואסור לרשום תרגום — אם רשמת \`from: "Spicy Tuna", to: "טונה חריפה"\`, טעית: החזר את המקור.

## שלב 4 — פלט

החזר JSON תקין בלבד, בלי גדרות קוד:
{"transcript":"התפריט המלא עם סימוני השורות","corrections":[{"from":"מה קראת בהתחלה","to":"מה תיקנת לו","why":"סיבה קצרה"}],"unreadable":[]}

\`unreadable\` = מספרי התמונות שלא הצלחת לקרוא (1 היא הראשונה שנשלחה). הצלחת לקרוא הכל — [].

ה-transcript מכיל **אך ורק את תוכן התפריט** — אל תכתוב בו "שלב 1", "תמלול" או הערות על העבודה שלך.
לא תיקנת כלום — corrections: [].

דוגמה ל-transcript:
## דגים
בס ים בתנור 145
> שלם, עם לימון ועשבי תיבול
סלמון 120
## Rolls
Spicy Tuna Roll 52
> טונה, מלפפון, מיונז חריף

מבצעים (עסקית, תפריט בוקר, אירועים) — תמלל במלואם כולל כל התנאים. אל תמציא דבר ואל תשלים מחירים חסרים.`;

// Wine enrichment is the ONE place this system derives facts that are not printed on the
// menu — so it lives behind its own rules: structured fields only, per-field confidence,
// "unknown" is a first-class answer, kosher status is never stated, and nothing reaches
// the team without the owner approving it in the UI.
const WINE_PROMPT = `אתה סומלייה שמלמד מלצרים. תקבל רשימת שמות של יינות/משקאות כפי שהם מופיעים בתפריט, ותחזיר מה שאפשר לדעת **מהשם בלבד** — בשביל שמלצר יוכל להגיד משפט חכם ליד השולחן.

## כלל הברזל — אסור להמציא יין

יין שאינך מזהה בביטחון ⇒ \`known: false\` ועצור. **אל תמציא יקב, אזור או טעמים ליין שאתה לא באמת מכיר.** תיאור שגוי שמלצר אומר לאורח גרוע בהרבה מ"אין תיאור". אם רק חלק מהשם מזוהה — מלא רק את השדות שנגזרים מהחלק המזוהה.

מה כן מותר גם בלי לזהות את היקב:
- **זן ענב בשם** ("קברנה סוביניון", "שרדונה", "Sauvignon Blanc") ⇒ צבע, יובש טיפוסי ופרופיל טעם של הזן — בביטחון medium.
- **מילים מפורשות בשם**: "רוזה", "מבעבע", "חצי יבש", "לבן", "אדום" ⇒ השדה המתאים בביטחון high.
- **יקב/אפלסיון מוכרים באמת** (ירדן, דלתון, רקנאטי, Chablis, Sancerre, Pauillac...) ⇒ אזור ומדינה.

## אסור בשום מצב
- **כשרות** — לעולם אל תקבע כשר/לא כשר. זה נבדק מול הספק בלבד.
- טענות על בציר ספציפי ("2019 היה בציר מצוין").
- מחיר, זמינות, או השוואות ("הכי טוב ב...").

## פלט — JSON בלבד, מערך:
[{"name":"השם כפי שנשלח","known":true,"color":"אדום|לבן|רוזה|מבעבע","sweetness":"יבש|חצי יבש|חצי מתוק|מתוק","grapes":["זן"],"region":"אזור, מדינה","winery":"שם היקב","notes":"משפט טעמים שמלצר אומר לאורח","serving":"טמפ' הגשה","confidence":"high|medium"}]
יין לא מזוהה: {"name":"...","known":false}
שדה שאין לגביו ידיעה אמיתית — השמט אותו. אל תמלא "סתם".
notes: משפט אחד טבעי בעברית, בלי סופרלטיבים ("פירות אדומים בשלים עם נגיעת וניל" — לא "יין מדהים").`;

// Free-text menu commands from the owner ("תוריד את כל סימני השאלה"). The model NEVER
// touches the data — it returns a patch list the owner previews and approves in the UI.
const COMMAND_PROMPT = `אתה עוזר עריכה לתפריט מסעדה. תקבל פקודה חופשית מהמנהל ואת התפריט כ-JSON, ותחזיר **רשימת תיקונים בלבד** — אתה לא מבצע כלום, המנהל יראה תצוגה מקדימה ויאשר.

## כללים
1. **בצע רק את מה שהפקודה מבקשת.** אל תתקן דברים אחרים שנראים לך שגויים, אל תשפר ניסוחים שלא התבקשת, אל תוסיף מידע.
2. החזר patch רק למנות שמשתנות, ורק את השדות שמשתנים. מנה שלא משתנה — לא מופיעה. שדה מערך (מוקשים וכו') מוחזר **בשלמותו אחרי השינוי** — הרשימה החדשה המלאה, לא רק התוספת.
3. שדות מותרים לשינוי: name, price, description, category, וארבע קבוצות האזהרה: allergens, pregnancy, pitfalls, kashrut. **מחיקת מנות אינה נתמכת** — אם הפקודה מבקשת למחוק, החזר patches ריק והסבר ב-warning.
4. ערכי קבוצות האזהרה הם רשימות סגורות:
   allergens: גלוטן, לקטוז, ביצים, אגוזים, בוטנים, רכיכות, סויה, שומשום
   pregnancy: דג נא, בשר נא, ביצה חיה, גבינה לא מפוסטרת, דגים עתירי כספית, נבטים חיים, כבד, אלכוהול
   pitfalls: כוסברה, חריף, שום, בצל, ג'ינג'ר, וסאבי, מיונז, גבינה כחולה
   kashrut: בשרי, חלבי, פרווה, לא כשר, חזיר, פירות ים, בשר וחלב יחד
   "מוקש" = pitfalls. "אלרגיה/אלרגן" = allergens. ערך שביקשו ואינו ברשימה ⇒ אל תוסיף אותו, וציין ב-warning.
5. פקודה דו-משמעית ⇒ בצע את הפירוש הסביר וציין ב-warning מה הנחת. ("סימני קריאה" כשבתפריט יש רק [?] ⇒ כנראה הכוונה לסימוני [?]).
6. הפקודה מזהה מנות לפי שם/קטגוריה/תיאור — התאם בגמישות סבירה (שם חלקי מספיק), אבל אם שם שביקשו לא נמצא בכלל ⇒ warning, לא ניחוש.
7. שנה מחירים רק אם הפקודה נוקבת מספרים/אחוזים מפורשים.
8. שמור על השפה המקורית של כל טקסט. אל תתרגם.
9. **הוספת מנות חדשות**: אם הפקודה מדביקה טקסט של מנות חדשות או מבקשת להוסיף מנות — החזר אותן ב-\`additions\` (לא ב-patches). קרא את הטקסט המודבק כמו תפריט: שורה עם מחיר = מנה, שורה מתחתיה בלי מחיר = תיאור. אם צוינה קטגוריה — השתמש בה; אחרת התאם לקטגוריה קיימת מתאימה מהתפריט; אין מתאימה ⇒ הצע שם קטגוריה חדש. אל תמציא תיאור, מרכיבים או אזהרות שלא נכתבו.
10. **שאלות**: אם הפקודה היא שאלה ולא הוראת שינוי ("כמה מנות בלי תיאור יש?", "אילו מנות מכילות אגוזים?") — ענה בשדה \`answer\` בעברית קצרה ומדויקת, **על סמך התפריט שקיבלת בלבד**, עם patches ריק. אל תמציא מידע שאינו בתפריט, ואל תענה על שאלות שאינן על התפריט — הסבר בנימוס שאתה עוזר תפריט בלבד.

## דוגמה
פקודה: "תוסיף מוקש כוסברה לסביצ'ה ולטרטר"
⇒ {"summary":"הוספת המוקש כוסברה ל-2 מנות","warnings":[],"patches":[{"id":"...","set":{"pitfalls":["חריף","כוסברה"]}},{"id":"...","set":{"pitfalls":["כוסברה"]}}]}
(שימו לב: הרשימה המלאה אחרי ההוספה, כולל ערכים שכבר היו.)

## פלט — JSON בלבד:
{"summary":"משפט שמסביר מה הולך לקרות ולכמה מנות","warnings":["הנחות/אזהרות"],"patches":[{"id":"id של המנה","set":{"name":"...","description":"...","pitfalls":["..."]}}],"additions":[{"name":"מנה חדשה","price":48,"description":"","category":"ראשונות","ingredients":[],"allergens":[],"pregnancy":[],"pitfalls":[],"kashrut":[]}],"answer":null}
אין מנות חדשות ⇒ additions: []. הפקודה אינה שאלה ⇒ answer: null.
אין מה לשנות ⇒ patches: [] עם summary שמסביר למה.`;

const STRUCTURE_PROMPT = `אתה מנוע לפענוח תפריטי מסעדות עבור אפליקציית הדרכת מלצרים. תקבל את הטקסט של התפריט. החזר JSON תקין בלבד, ללא טקסט נוסף וללא גדרות קוד:
{"categories":[{"name":"שם קטגוריה","course":"starters","subtitle":"כותרת המשנה של הקבוצה או null","dishes":[{"name":"שם מנה","price":מספר או null,"description":"תיאור","ingredients":["מרכיב"],"allergens":[],"pregnancy":[],"pitfalls":[],"kashrut":[]}]}],"offers":[{"name":"עסקית צהריים","kind":"business_lunch","price":89,"description":"","includes":["ראשונה"],"rules":["עד 17:00"]}],"generalNotes":["הערה"],"questions":[{"id":"q1","question":"שאלה","options":["א","ב"]}]}

## כלל על — אין תרגום, לשום כיוון

**כל שדה טקסט נשמר בשפה ובכתב של התפריט המקורי** — שמות קטגוריות, שמות מנות, תיאורים, מרכיבים, שמות מבצעים, כללים, generalNotes.
- \`Spicy Tuna Roll\` נשאר \`Spicy Tuna Roll\` — לא "רול טונה חריפה" ולא "ספייסי טונה רול".
- מנה בעברית נשארת בעברית.
- תפריט דו-לשוני נשאר דו-לשוני. אל תאחיד שפה ואל תוסיף תרגום בסוגריים.
- מונח לועזי שאינך מכיר — העתק אותו כמות שהוא. אל "תתקן" אותו למילה עברית דומה.

## חלק א' — שלושה סוגי שורות

הטקסט מסומן:
- "## " — **כותרת קטגוריה, תמיד.** הסר את הסימון.
- "> " — **תיאור של המנה שלפניה, תמיד.** ל-description של אותה מנה. **לעולם לא מנה בפני עצמו.**
- "~ " — **כותרת משנה של הקטגוריה שלפניה.** ל-\`subtitle\` של אותה קטגוריה. **לעולם לא מנה.**
- "?? " — לא הוכרעה. אתה מכריע.
- שורה רגילה — מנה.

**אם הטקסט לא מסומן** (הבעלים הדביק טקסט) — הסק לפי הדפוסים:

**הדפוס הנפוץ ביותר — והטעות הנפוצה ביותר:**
מנה 45
תיאור המנה
אלה **מנה אחת**, לא שתיים. בדוק: אם מספר המנות גדול פי שתיים ממספר המחירים — הפכת תיאורים למנות.

**מחיר הוא סימן טוב — אבל לא חותך:**
- מחיר בודד ("בס 145") ⇒ מנה.
- **טווח על שם כללי** ("סלמון 50-200") ⇒ **כותרת**. שמור את הטווח בשם.
- **כמה מחירים על שם ספציפי** ("כוס 32 / בקבוק 120") ⇒ **מנה אחת** עם גדלים.

**לא ברור — אל תנחש. שאל.**

⚠**מילה עם [?]** — לא נקראה בוודאות. **השאר את ה-[?]** — אל תשלים בניחוש ואל תמחק. אם זו מנה או מחיר — הוסף שאלה.

## חלק ב' — אלכוהול ושתייה

קטגוריה = סוג המשקה, מנה = שם המותג/הקוקטייל (כלשונו, בשפת המקור).
- משקה אלכוהולי: "אלכוהול" ב-pregnancy **בלבד** — לא ב-pitfalls (יותם, 31.8: הוא הופיע פעמיים). בירה ⇒ גם גלוטן.

## חלק ג' — מבצעים (offers)

עסקית, תפריט בוקר, אירועים, Happy Hour — **לא קטגוריות ולא מנות**. ל-offers.
kind: business_lunch | breakfast | event | happy_hour | tasting | other
rules: **כל תנאי והגבלה** כלשונם — שעות, ימים, מינימום סועדים, מה **אסור**.

## חלק ד' — אזהרות, בארבע קבוצות נפרדות

"לקטוז" אלרגיה; "דג נא" אזהרת הריון; "כוסברה" העדפה. אל תערבב.
⚠ ערכי ארבע הקבוצות האלה הם **רשימה סגורה בעברית** — הם היחידים בכל ה-JSON שאינם בשפת התפריט. מנה בשם \`Spicy Tuna Roll\` עם סימן גלמיות מקבלת \`pregnancy: ["דג נא"]\`, לא \`["raw fish"]\`.

**allergens** — אך ורק: גלוטן, לקטוז, ביצים, אגוזים, בוטנים, רכיכות, סויה, שומשום.
⚠ "דגים" ו-"בשר" אינם ערכי אלרגיה במערכת הזו (החלטת מוצר): דג/בשר נא שייכים ל-pregnancy בלבד, ומרכיב חלבי מסומן "לקטוז".
שדה בטיחותי — עדיף ריק מאשר שגוי. סמן רק על סמך מרכיב מפורש **במנה הזו**. ירקות וכבושים אינם אגוזים.

**pregnancy** — אך ורק: דג נא, בשר נא, ביצה חיה, גבינה לא מפוסטרת, דגים עתירי כספית, נבטים חיים, כבד, אלכוהול.
שדה בטיחותי — עדיף ריק מאשר שגוי. סמן רק על סמך מרכיב או ניסוח מפורש **במנה הזו**.
⚠ **\`דג נא\` ו-\`בשר נא\` דורשים סימן גלמיות מפורש** — סשימי, ניגירי, טרטר, קרפצ'ו, טאטאקי, "נא", "מדיום רייר".
המילה "דג" או "בשר" לבדה **אינה** סימן גלמיות. אל תסיק גלמיות משם המנה, משם הקטגוריה או ממנות דומות.
**סימן בישול שולל את הדגל**: מטוגן, אפוי, מבושל, בגריל, בתנור, מאודה, חם, טמפורה ⇒ אין \`בשר נא\`/\`דג נא\`. לדוגמה: "כיסוני בשר מטוגנים" ⇒ \`pregnancy: []\`.
⚠ אבל סימן הבישול חייב לחול על **הרכיב שנדגל עצמו**. מנה שיש בה דג נא לצד רכיב מטוגן — למשל רול עם סלמון נא ושבבי טמפורה — **שומרת** על \`דג נא\`. הטיגון של השבבים, לא של הדג.
סשימי/ניגירי/טרטר דג ⇒ דג נא; קרפצ'ו בשר ⇒ בשר נא; מיונז ביתי/קיסר ⇒ ביצה חיה; טונה אדומה ⇒ עתירי כספית.

**pitfalls** — אך ורק: כוסברה, חריף, שום, בצל, ג'ינג'ר, וסאבי, מיונז, גבינה כחולה.
**kashrut** — אך ורק: בשרי, חלבי, פרווה, לא כשר, חזיר, פירות ים, בשר וחלב יחד.

## חלק ה' — כללים

1. **סדר**: טקסט אחד רציף ⇒ שמור על הסדר שבו הוא כתוב, אל תמיין. הצוות ילמד לפיו.
   ⚠ **הגיע מכמה תמונות** (יש שורות \`--- תמונה N ---\`) ⇒ **אל תסמוך על סדר התמונות.** הבעלים צילם עמודים בסדר אקראי. סדר את הקטגוריות לפי סדר הגשה מקובל — ראשונות ⇒ עיקריות ⇒ תוספות ⇒ קינוחים ⇒ שתייה ⇒ אלכוהול. **בתוך** כל קטגוריה שמור על הסדר שבתמונה. אותה קטגוריה שהופיעה בשתי תמונות — אחד בשתי תמונות של אותו עמוד, או צילום חוזר — **אחד אותן לקטגוריה אחת ואל תשכפל מנות**.
   \`course\` לכל קטגוריה, אחד מ: \`starters\` | \`mains\` | \`sides\` | \`desserts\` | \`drinks\` | \`alcohol\` | \`other\`. זה מה שמאפשר לאפליקציה להציע סדר לבעלים. **לא ברור מהשם ומהתוכן ⇒ \`other\`, והוסף שאלה** לבעלים איפה הקטגוריה יושבת בתפריט.
2. **קטגוריות בלשון התפריט** — כלשונן, בלי להמציא ובלי לתרגם (ר' כלל העל).
3. אל תמציא פרטים. מחיר שלא צוין = null.
4. description: משפט שמלצר **חדש** מבין מיד, **בשפה שבה כתובה המנה**. מותר לנסח מחדש קיצורים באותה שפה; אסור להוסיף עובדות ואסור להחליף שפה. שינויים — בסוף, "שינויים: ...".
5. ingredients: כפי שצוינו, בשפת המקור. לא צוינו — ריק.
6. generalNotes: הערות שאינן מנה ואינן מבצע — כלשונן.
7. questions: מקסימום 3, ברמת קבוצות/מבנה. אין אי-ודאות — [].
8. צורפו תשובות המנהל — פענוח סופי לפיהן, questions: [].`;

const FLAG_VALUES: Record<string, Set<string>> = {
  allergens: new Set(["גלוטן", "לקטוז", "ביצים", "אגוזים", "בוטנים", "רכיכות", "סויה", "שומשום"]),
  pregnancy: new Set(["דג נא", "בשר נא", "ביצה חיה", "גבינה לא מפוסטרת", "דגים עתירי כספית", "נבטים חיים", "כבד", "אלכוהול"]),
  pitfalls:  new Set(["כוסברה", "חריף", "שום", "בצל", "ג'ינג'ר", "וסאבי", "מיונז", "גבינה כחולה"]),
  kashrut:   new Set(["בשרי", "חלבי", "פרווה", "לא כשר", "חזיר", "פירות ים", "בשר וחלב יחד"]),
};

const OFFER_KINDS = new Set(["business_lunch", "breakfast", "event", "happy_hour", "tasting", "other"]);

// Which part of the meal a category belongs to. Photos arrive in whatever order the owner
// shot them, so image order is not menu order — this is what lets the review screen offer
// a sensible default sequence for the owner to drag around.
const COURSES = new Set(["starters", "mains", "sides", "desserts", "drinks", "alcohol", "other"]);

const cleanFlags = (v: unknown, group: string) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && FLAG_VALUES[group].has(x)) : [];
const cleanStrings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim()) : [];

const MARKER_RE = /^\s*(?:#{1,3}|\?\?|~|>)\s*/;
const isMarked = (s: string) => MARKER_RE.test(String(s || ""));
const stripMarker = (s: string) => String(s || "").replace(MARKER_RE, "").trim();

function sanitizeCategories(categories: unknown): { categories: unknown[]; dropped: string[] } {
  if (!Array.isArray(categories)) return { categories: [], dropped: [] };
  const dropped: string[] = [];
  let position = 0;
  const out = categories.map((cat: Record<string, unknown>, order: number) => {
    const dishes = Array.isArray(cat?.dishes) ? cat.dishes : [];
    return {
      ...cat,
      name: stripMarker(cat?.name as string) || "כללי",
      course: COURSES.has(String(cat?.course)) ? String(cat.course) : "other",
      subtitle: typeof cat?.subtitle === "string" && cat.subtitle.trim() ? stripMarker(cat.subtitle as string) : null,
      order,
      dishes: dishes
        .filter((d: Record<string, unknown>) => {
          if (isMarked(d?.name as string)) { dropped.push(stripMarker(d?.name as string)); return false; }
          return String(d?.name || "").trim().length > 0;
        })
        .map((d: Record<string, unknown>) => ({
          ...d,
          position: position++,
          allergens: cleanFlags(d?.allergens, "allergens"),
          pregnancy: cleanFlags(d?.pregnancy, "pregnancy"),
          pitfalls:  cleanFlags(d?.pitfalls,  "pitfalls"),
          kashrut:   cleanFlags(d?.kashrut,   "kashrut"),
        })),
    };
  });
  return { categories: out, dropped };
}

function sanitizeOffers(offers: unknown): unknown[] {
  if (!Array.isArray(offers)) return [];
  return offers
    .filter((o: Record<string, unknown>) => String(o?.name || "").trim())
    .map((o: Record<string, unknown>, i: number) => ({
      name: stripMarker(o.name as string),
      kind: OFFER_KINDS.has(String(o.kind)) ? String(o.kind) : "other",
      price: typeof o.price === "number" ? o.price : null,
      description: typeof o.description === "string" ? o.description : "",
      includes: cleanStrings(o.includes),
      rules: cleanStrings(o.rules),
      position: i,
    }));
}

type Img = { media_type: string; data: string };

async function callAnthropic(key: string, model: string, system: string, userText: string, images: Img[], maxTokens: number, legacySampling: boolean) {
  const content: unknown[] = images.map((im) => ({
    type: "image", source: { type: "base64", media_type: im.media_type, data: im.data },
  }));
  content.push({ type: "text", text: userText });
  const payload: Record<string, unknown> = {
    model, max_tokens: maxTokens, system, messages: [{ role: "user", content }],
  };
  // Opus 5 / Sonnet 5 removed the sampling parameters; sending temperature is a 400.
  if (legacySampling) payload.temperature = 0;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (data.stop_reason === "max_tokens") throw new Error("התפריט ארוך מדי לפענוח בבת אחת — נסו לצלם אותו בכמה חלקים.");
  // ⚠️ Not content[0]. Thinking is on by default on Opus 5 / Sonnet 5, so the first block
  // is a thinking block and indexing [0] silently yields an empty transcript.
  const block = (data.content || []).find((b: { type?: string }) => b?.type === "text");
  return String(block?.text || "").trim();
}

async function callOpenRouter(key: string, model: string, system: string, userText: string, images: Img[], maxTokens: number) {
  const content: unknown[] = images.map((im) => ({
    type: "image_url", image_url: { url: `data:${im.media_type};base64,${im.data}` },
  }));
  content.push({ type: "text", text: userText });
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`, "Content-Type": "application/json",
      "HTTP-Referer": "https://shiftcrew-owner.vercel.app", "X-Title": "Menu Trainer",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, messages: [{ role: "system", content: system }, { role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (data.choices?.[0]?.finish_reason === "length") throw new Error("התפריט ארוך מדי לפענוח בבת אחת — נסו לצלם אותו בכמה חלקים.");
  return (data.choices?.[0]?.message?.content || "").trim();
}

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

// Anything the model wrote about its own process. One run opened with "## מעבר 1 — תמלול",
// which then read as a menu category; another signed off with "התמלול נבדק מול התמונה".
const PROCESS_LINE =
  /^\s*(?:#{0,3}\s*)?[הבו]?(?:שלב\s*\d|מעבר\s*\d|תמלול\b|הגהה\b|step\s*\d|transcription\b|proofread\b)|נבדק מול הת|כל המילים והמספרים/i;
const stripProcessLines = (t: string) =>
  t.split("\n").filter((l) => !PROCESS_LINE.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();

// A "correction" that swaps scripts is a translation, not a fix. The prompt forbids it;
// this drops any that slip through, so the owner's correction list can't quietly show a
// translated menu word as if it were a proofreading catch.
const hasLatin = (s: string) => /[A-Za-z]/.test(s);
const hasHebrew = (s: string) => /[֐-׿]/.test(s);
const isScriptSwap = (from: string, to: string) =>
  (hasLatin(from) && !hasLatin(to) && hasHebrew(to)) || (hasHebrew(from) && !hasHebrew(to) && hasLatin(to));

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

    const run = (tier: Tier, system: string, userText: string, ims: Img[], maxTokens: number) => {
      const m = MODELS[tier] ?? MODELS.haiku;
      return anthropicKey
        ? callAnthropic(anthropicKey, m.anthropic, system, userText, ims, maxTokens, m.legacySampling)
        : callOpenRouter(openrouterKey!, m.openrouter, system, userText, ims, maxTokens);
    };

    // ---- photos -> text + the corrections it made -------------------------------------
    if (mode === "transcribe") {
      if (!imgs.length) return json({ error: "images required" }, 400);
      const tier: Tier = asTier(body.model, "opus");
      const ask = imgs.length > 1
        ? `תמלל את ${imgs.length} התמונות של התפריט, לפי הסדר. עבוד לפי ארבעת השלבים. העתק כל מילה בשפה שבה היא כתובה — אל תתרגם.`
        : "תמלל את התפריט שבתמונה. עבוד לפי ארבעת השלבים. העתק כל מילה בשפה שבה היא כתובה — אל תתרגם.";

      const raw = await run(tier, TRANSCRIBE_PROMPT, ask, imgs, 24000);
      const parsed = parseLooseJson(raw);
      // Falling back to the raw text keeps a malformed wrapper from costing the import;
      // the owner proofreads either way.
      const transcript = stripProcessLines(
        typeof parsed?.transcript === "string" && parsed.transcript.trim() ? parsed.transcript : raw,
      );
      const corrections = Array.isArray(parsed?.corrections)
        ? parsed.corrections
            .filter((c: Record<string, unknown>) => c?.from && c?.to && String(c.from) !== String(c.to))
            .filter((c: Record<string, unknown>) => !isScriptSwap(String(c.from), String(c.to)))
            .slice(0, 30)
            .map((c: Record<string, unknown>) => ({
              from: String(c.from), to: String(c.to), why: String(c.why || ""),
            }))
        : [];
      const unreadable = Array.isArray(parsed?.unreadable)
        ? parsed.unreadable
            .map((n: unknown) => Number(n))
            .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= imgs.length)
        : [];
      return json({
        transcript,
        corrections,
        unreadable,
        uncertain: (transcript.match(/\[\?\]/g) || []).length,
        model: tier,
      });
    }

    // ---- wine names -> teachable facts (owner approves before anything is saved) ------
    if (mode === "enrich_wines") {
      const wines = Array.isArray(body.wines)
        ? body.wines.map((w: unknown) => String(w || "").trim()).filter(Boolean).slice(0, 80)
        : [];
      if (!wines.length) return json({ error: "wines required" }, 400);
      // Opus by default — the user's explicit call: better to pay than to teach a waiter
      // a wrong fact. Still one call per whole list, and the client's memory table makes
      // repeats free.
      const tier: Tier = asTier(body.model, "opus");
      const raw = await run(tier, WINE_PROMPT, "היינות:\n" + wines.map((w, i) => `${i + 1}. ${w}`).join("\n"), [], 8000);
      // The reply is an ARRAY, sometimes wrapped in fences or a leading sentence —
      // parseLooseJson only hunts for {...}, so slice the outermost [...] explicitly.
      let arr: unknown[] | null = null;
      const cleanedW = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const sW = cleanedW.indexOf("["), eW = cleanedW.lastIndexOf("]");
      if (sW !== -1 && eW > sW) {
        const slice = cleanedW.slice(sW, eW + 1);
        try { arr = JSON.parse(slice); } catch {
          try { arr = JSON.parse(slice.replace(/,(\s*[\]}])/g, "$1")); } catch { /* fall through */ }
        }
      }
      if (!arr) {
        const parsed = parseLooseJson(raw);
        arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.wines) ? parsed.wines : null;
      }
      if (!arr) return json({ error: "model returned invalid JSON", raw: raw.slice(0, 500) }, 502);
      const COLORS = new Set(["אדום", "לבן", "רוזה", "מבעבע"]);
      const SWEET = new Set(["יבש", "חצי יבש", "חצי מתוק", "מתוק"]);
      const out = arr
        .filter((w: Record<string, unknown>) => typeof w?.name === "string")
        .map((w: Record<string, unknown>) => ({
          name: String(w.name),
          known: w.known === true,
          color: COLORS.has(String(w.color)) ? String(w.color) : null,
          sweetness: SWEET.has(String(w.sweetness)) ? String(w.sweetness) : null,
          grapes: cleanStrings(w.grapes),
          region: typeof w.region === "string" && w.region.trim() ? w.region.trim() : null,
          winery: typeof w.winery === "string" && w.winery.trim() ? w.winery.trim() : null,
          // Kosher never passes through, whatever the model said.
          notes: typeof w.notes === "string" ? w.notes.replace(/כשר[ה]?\s*(למהדרין)?/g, "").trim() : null,
          serving: typeof w.serving === "string" && w.serving.trim() ? w.serving.trim() : null,
          confidence: w.confidence === "high" ? "high" : "medium",
        }));
      return json({ wines: out, model: tier });
    }

    // ---- free-text owner command -> patch list (preview only, never executed here) ----
    if (mode === "menu_command") {
      const command = String(body.command || "").trim();
      const menu = Array.isArray(body.menu) ? body.menu.slice(0, 400) : [];
      if (!command || !menu.length) return json({ error: "command and menu required" }, 400);
      const ids = new Set(menu.map((d: Record<string, unknown>) => String(d.id)));
      const tier: Tier = asTier(body.model, "haiku");
      const userText = `הפקודה של המנהל: ${command}\n\nהתפריט:\n${JSON.stringify(menu)}`;
      const raw = await run(tier, COMMAND_PROMPT, userText, [], 16000);
      const parsed = parseLooseJson(raw);
      if (!parsed) return json({ error: "model returned invalid JSON", raw: raw.slice(0, 500) }, 502);
      const TEXT_FIELDS = new Set(["name", "description", "category"]);
      const patches = (Array.isArray(parsed.patches) ? parsed.patches : [])
        .filter((p: Record<string, unknown>) => ids.has(String(p?.id)) && p?.set && typeof p.set === "object")
        .map((p: Record<string, unknown>) => {
          const set: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(p.set as Record<string, unknown>)) {
            if (k === "price") { const n = Number(v); if (Number.isFinite(n) && n >= 0) set[k] = n; }
            else if (TEXT_FIELDS.has(k) && typeof v === "string") set[k] = v;
            // The four warning groups are closed Hebrew lists — anything else is dropped,
            // so a model slip can't write a value the waiter app doesn't understand.
            else if (k in FLAG_VALUES) set[k] = cleanFlags(v, k);
          }
          return { id: String(p.id), set };
        })
        .filter((p: { set: Record<string, unknown> }) => Object.keys(p.set).length > 0)
        .slice(0, 400);
      // New dishes pasted into the command box. Same closed-list cleaning as patches —
      // an addition is still only a PROPOSAL until the owner approves it in the preview.
      const additions = (Array.isArray(parsed.additions) ? parsed.additions : [])
        .filter((d: Record<string, unknown>) => typeof d?.name === "string" && String(d.name).trim())
        .slice(0, 100)
        .map((d: Record<string, unknown>) => ({
          name: String(d.name).trim(),
          price: Number.isFinite(Number(d.price)) && Number(d.price) >= 0 ? Number(d.price) : null,
          description: typeof d.description === "string" ? d.description : "",
          category: typeof d.category === "string" && d.category.trim() ? d.category.trim() : "כללי",
          ingredients: cleanStrings(d.ingredients),
          allergens: cleanFlags(d.allergens, "allergens"),
          pregnancy: cleanFlags(d.pregnancy, "pregnancy"),
          pitfalls: cleanFlags(d.pitfalls, "pitfalls"),
          kashrut: cleanFlags(d.kashrut, "kashrut"),
        }));
      return json({
        summary: typeof parsed.summary === "string" ? parsed.summary : `${patches.length} מנות ישתנו`,
        warnings: cleanStrings(parsed.warnings),
        patches,
        additions,
        answer: typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : null,
        model: tier,
      });
    }

    // ---- text -> structure -------------------------------------------------------------
    if (!text && !imgs.length) return json({ error: "text or image required" }, 400);

    let userText = text ? `התפריט:\n${text}` : "פענח את התפריט שבצילום.";
    if (Array.isArray(qa) && qa.length > 0) {
      userText += "\n\nתשובות המנהל לשאלות ההבהרה:\n" +
        qa.map((x: { question: string; answer: string }) => `- ${x.question} ⇒ ${x.answer}`).join("\n");
    }

    const structureTier: Tier = asTier(body.model, "haiku");
    const raw = await run(structureTier, STRUCTURE_PROMPT, userText, text ? [] : imgs, 16000);
    const parsed = parseLooseJson(raw);
    if (!parsed) return json({ error: "model returned invalid JSON", raw: raw.slice(0, 800) }, 502);

    const { categories, dropped } = sanitizeCategories(parsed.categories);
    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3) : [];

    if (dropped.length && questions.length < 3) {
      questions.push({
        id: "headings",
        question: `השורות ${dropped.slice(0, 4).map((h) => `"${h}"`).join(", ")} — אלה שמות של קבוצות בתפריט או מנות?`,
        options: ["אלה שמות של קבוצות", "אלה מנות בפני עצמן"],
      });
    }

    return json({
      categories,
      offers: sanitizeOffers(parsed.offers),
      generalNotes: Array.isArray(parsed.generalNotes) ? parsed.generalNotes : [],
      questions,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
