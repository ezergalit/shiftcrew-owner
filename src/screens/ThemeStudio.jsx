import { useState, useEffect, useMemo } from "react";
import { Loader2, Check, RotateCcw, Palette } from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");

// סטודיו הצבעים של המפעיל — `?operator=1`, לשונית «עיצוב».
//
// עד היום כל צבע באפליקציית המלצר היה קשיח בקוד, ולכן «מסעדה בצבע אחר» הייתה
// עדכון אפליקציה. כאן בוחרים את הפלטה מול האפליקציה **האמיתית** ושומרים אותה
// ל-`features.theme`; המלצר מקבל אותה בפתיחה הבאה, בלי build ובלי חנות.
//
// ⚠️ הסטודיו לא מחזיק שום לוגיקת צבע משלו — הוא עורך שבעה ערכי הקס ומציג את
// התוצאה ב-iframe של אפליקציית המלצר, ששם `src/lib/theme.js` גוזר את הנגזרות
// (הטקסט על המותג, המשטח הרך) ואוכף את צבעי הבטיחות. אחרת היה נוצר כאן העתק
// שני של אותה לוגיקה, וזו בדיוק המחלקה שמכאיבה כבר ב-`dishFlags.js`.
const WAITER_URL = import.meta.env.DEV
  ? "http://localhost:5176"
  : "https://shiftcrew-waiter.vercel.app";

// הבסיס = מה שהיה קשיח בקוד. שדה ריק בטופס פירושו «כמו ברירת המחדל».
const FIELDS = [
  { key: "brand", label: "צבע המותג", base: "#22c08c", hint: "כפתורים, טבעות, הדגשות" },
  { key: "bg", label: "רקע", base: "#0c0d10", hint: "רקע האפליקציה" },
  { key: "surface", label: "משטח", base: "#16181c", hint: "כרטיסים" },
  { key: "line", label: "קו", base: "#22252b", hint: "מסגרות ומפרידים" },
  { key: "ink", label: "טקסט ראשי", base: "#eef0f6", hint: "" },
  { key: "dim", label: "טקסט משני", base: "#8a8aa0", hint: "" },
  { key: "faint", label: "טקסט חלש", base: "#5a5a6e", hint: "" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const b64 = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));

export default function ThemeStudio() {
  const [rest, setRest] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(true);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setBusy(true); setErr("");
      // ‏RLS על `restaurants` מחזירה את המסעדה של הסשן בלבד — ולכן הסטודיו עובד
      // על המסעדה שאני מחובר אליה בדפדפן הזה. זו גם הסיבה שאין כאן נתיב כתיבה
      // ל-anon: `owner_update` דורשת סשן בעלים, ופתיחת הרשאה רחבה יותר הייתה
      // מאפשרת לכל מי שמחזיק את ה-anon key לצבוע מחדש כל מסעדה.
      const { data, error } = await db.from("restaurants")
        .select("id, name, team_code, features").limit(1).maybeSingle();
      if (error) setErr("טעינה נכשלה: " + error.message);
      else if (!data) setErr("אין סשן בעלים בדפדפן הזה — היכנסו למסעדה ואז פתחו שוב.");
      else { setRest(data); setDraft(data.features?.theme || {}); }
      setBusy(false);
    })();
  }, []);

  // רק ערכים תקינים נשלחים לתצוגה, אחרת כל הקלדה באמצע («#2» ) מרצדת.
  const clean = useMemo(() => {
    const out = {};
    for (const { key } of FIELDS) if (HEX.test(draft[key] || "")) out[key] = draft[key].toLowerCase();
    return out;
  }, [draft]);

  const previewSrc = rest
    ? `${WAITER_URL}/?preview=${encodeURIComponent(rest.team_code)}` +
      (Object.keys(clean).length ? `&theme=${encodeURIComponent(b64(clean))}` : "")
    : "";

  const save = async () => {
    setBusy(true); setErr(""); setSaved(false);
    try {
      // כתיבה ממוזגת: `features` מחזיקה 11 דגלי התנהגות, ודריסה שלה בשדה theme
      // בלבד הייתה מכבה את כולם בבת אחת.
      const features = { ...(rest.features || {}) };
      if (Object.keys(clean).length) features.theme = clean; else delete features.theme;
      const { error } = await db.from("restaurants").update({ features }).eq("id", rest.id);
      if (error) throw new Error(error.message);
      // אימות בקריאה נפרדת — כתיבה שמחזירה בלי שגיאה אינה הוכחה שהשורה השתנתה.
      const { data: after } = await db.from("restaurants")
        .select("features").eq("id", rest.id).maybeSingle();
      const got = JSON.stringify(after?.features?.theme || {});
      if (got !== JSON.stringify(clean)) throw new Error("נשמר אך לא אומת — בדקו הרשאות");
      setRest({ ...rest, features });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr("שמירה נכשלה: " + e.message); }
    finally { setBusy(false); }
  };

  if (busy && !rest) return <div className="p-6 text-[#8a8aa0] flex items-center gap-2">
    <Loader2 size={16} className="animate-spin" /> טוען…</div>;
  if (err && !rest) return <div className="p-6 text-[#e0315a] text-sm">{err}</div>;

  const dirty = JSON.stringify(clean) !== JSON.stringify(rest.features?.theme || {});

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4" dir="rtl">
      <div className="lg:w-[320px] shrink-0">
        <h2 className="text-lg font-bold text-[#eef0f6] flex items-center gap-2 mb-1">
          <Palette size={18} /> עיצוב · {rest.name}
        </h2>
        <p className="text-xs text-[#8a8aa0] mb-4">
          הצבעים נשמרים ל-features.theme ומגיעים למלצר בפתיחה הבאה — בלי עדכון אפליקציה.
        </p>

        {FIELDS.map(({ key, label, base, hint }) => {
          const val = draft[key] || "";
          const bad = val && !HEX.test(val);
          return (
            <div key={key} className="flex items-center gap-3 mb-3">
              <input type="color" value={HEX.test(val) ? val : base} aria-label={label}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                className="w-11 h-11 rounded-lg bg-transparent cursor-pointer shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-[#eef0f6]">{label}</div>
                {hint && <div className="text-[11px] text-[#5a5a6e]">{hint}</div>}
              </div>
              <input value={val} placeholder={base} spellCheck={false}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value.trim() })}
                className={`w-[92px] px-2 py-1.5 rounded-lg bg-[#16181c] border text-xs font-mono
                  ${bad ? "border-[#e0315a] text-[#e0315a]" : "border-[#22252b] text-[#c4c4d4]"}`} />
            </div>
          );
        })}

        <div className="flex gap-2 mt-5">
          <button onClick={save} disabled={busy || !dirty}
            className="flex-1 min-h-[44px] rounded-xl bg-[#22c08c] text-[#06231a] font-bold text-sm
              disabled:opacity-40 flex items-center justify-center gap-2">
            {busy ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
            {saved ? "נשמר ואומת" : "שמירה למסעדה"}
          </button>
          <button onClick={() => setDraft({})} disabled={busy || !Object.keys(draft).length}
            title="חזרה לפלטת ברירת המחדל"
            className="min-h-[44px] px-3 rounded-xl bg-[#16181c] border border-[#22252b]
              text-[#8a8aa0] disabled:opacity-40">
            <RotateCcw size={15} />
          </button>
        </div>
        {err && <p className="text-xs text-[#e0315a] mt-3">{err}</p>}
        <p className="text-[11px] text-[#5a5a6e] mt-4 leading-relaxed">
          שדה ריק = ברירת המחדל. צבעי האזהרות (אלרגיות · הריון · מוקשים) קבועים בכוונה —
          המלצר נבחן על המשמעות שלהם.
        </p>
      </div>

      <div className="flex-1 min-w-0">
        <div className="mx-auto w-full max-w-[390px] h-[780px] rounded-[28px] overflow-hidden
          border border-[#22252b] bg-[#0c0d10]">
          {/* ה-iframe הוא האימות: זו האפליקציה האמיתית, לא ציור שני שצריך לתחזק. */}
          <iframe key={previewSrc} src={previewSrc} title="תצוגת מלצר"
            className="w-full h-full border-0" />
        </div>
      </div>
    </div>
  );
}
