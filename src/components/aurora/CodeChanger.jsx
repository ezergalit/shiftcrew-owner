import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

// שינוי קוד גישה קיים — קוד ההצטרפות של הצוות, או קוד הכניסה של הבעלים.
//
// עד עכשיו קוד נקבע פעם אחת ביצירת החשבון, וכל שינוי עבר דרכנו ב-SQL. הקוד הוא הדבר
// שהמנהל מוסר הלאה, ולכן הוא גם הדבר שהוא רוצה לקצר, להחליף כשהוא דולף, או להתאים לשם
// המסעדה — זו פעולה שלו, לא שלנו.
//
// כל הבדיקות יושבות בשרת (`menu_app.change_access_code`): סשן בעלים, פורמט, ייחודיות מול
// כל עמודות הקודים **ומול קודים שכבר הוחלפו**, ולקוד הכניסה גם הסיסמה. כאן רק הטופס וההסבר.
// ⚠️ תצוגת המלצר של המנהל היא סשן `preview` — השרת מחזיר לה `not_owner`.
// ⚠️ קוד הבעלים מוחלף רק ע"י בעל החשבון הראשי — מנהל משני לא רואה את הטופס הזה
//    (OwnerSettings מגדיר את זה), כי השרת בודק את סיסמת החשבון הראשית.

const db = supabase.schema("menu_app");

const ERRORS = {
  not_owner: "צריך להיכנס מחדש כדי לשנות את הקוד",
  bad_kind: "לא הצלחנו לשנות את הקוד",
  bad_format: "קוד באותיות באנגלית ובספרות, בין 4 ל-12 תווים",
  taken: "הקוד הזה כבר תפוס — נסו קוד אחר",
  bad_password: "הסיסמה לא נכונה",
  not_found: "לא הצלחנו לשנות את הקוד",
};

const COPY = {
  team: {
    open: "שינוי הקוד",
    title: "קוד הצטרפות חדש",
    note: "הקוד הישן יפסיק לעבוד. מלצרים שכבר נכנסו נשארים מחוברים — הקוד נדרש רק בכניסה הראשונה.",
    done: "הקוד עודכן ✓",
  },
  owner: {
    open: "שינוי קוד הבעלים",
    title: "קוד בעלים חדש",
    note: "בכניסה הבאה תצטרכו את הקוד החדש ואת אותה סיסמה.",
    done: "קוד הבעלים עודכן ✓",
  },
};

// ── קוד שקל לנחש (יותם, 14.9: «עדיף לכתוב לו מומלץ לא לכתוב קוד שיהיה קל לנחש») ──
// הקוד הוא כל מה שעומד בין האינטרנט הפתוח לבין ההצטרפות לצוות, ו-`1234` הוא בדיוק
// מה שמנהל ממהר בוחר. זו **אזהרה ולא חסימה** — הבחירה שלו, אבל מודעת.
const WEAK_WORDS = ["ADMIN", "TEST", "DEMO", "CODE", "PASS", "LOGIN", "MENU", "CREW", "OWNER", "TEAM"];
const isSequential = (c) =>
  c.length >= 4 && [...c].every((ch, i, a) => i === 0 || ch.charCodeAt(0) === a[i - 1].charCodeAt(0) + 1);
export function weakCode(code) {
  const c = String(code || "").toUpperCase();
  if (c.length < 5) return "קוד קצר קל לנחש — עדיף 5 תווים ומעלה";
  if (/^\d+$/.test(c)) return "קוד שכולו ספרות קל לנחש — כדאי לשלב אותיות";
  if (new Set(c).size <= 2) return "קוד שחוזר על אותו תו קל לנחש";
  if (isSequential(c)) return "רצף כמו 1234 או ABCD קל לנחש";
  if (WEAK_WORDS.includes(c) || WEAK_WORDS.some((w) => c === w + "1" || c === w + "123")) return "זו אחת המילים הראשונות שמנחשים";
  return "";
}

// ── הצעות מהשם של המסעדה (יותם: «כמו salon26») ─────────────────────────────────
// תעתיק פשוט ומלא-תנועות — לא שלד העיצורים של `lib/translit.js`, שמפיל בדיוק את
// התנועות שהופכות קוד לקריא (סלון ⇒ "sln"). המנהל ממילא עורך; המטרה היא התחלה
// שאפשר להקריא בטלפון.
const HEB_LAT = {
  א: "A", ב: "B", ג: "G", ד: "D", ה: "H", ו: "O", ז: "Z", ח: "H", ט: "T", י: "I",
  כ: "K", ך: "K", ל: "L", מ: "M", ם: "M", נ: "N", ן: "N", ס: "S", ע: "A", פ: "P",
  ף: "P", צ: "Z", ץ: "Z", ק: "K", ר: "R", ש: "S", ת: "T",
};
const romanize = (word) => [...String(word || "")].map((ch) => HEB_LAT[ch] || (/[A-Za-z0-9]/.test(ch) ? ch.toUpperCase() : "")).join("");

export function codeIdeas(name, current = "") {
  const words = String(name || "").split(/[\s־-]+/).map(romanize).filter((w) => w.length >= 2);
  if (!words.length) return [];
  const yy = String(new Date().getFullYear()).slice(-2);
  const rnd = () => String(Math.floor(Math.random() * 900) + 100);
  const initials = words.slice(0, 3).map((w) => w[0]).join("");
  const out = [
    words[0].slice(0, 4) + yy,
    words[0].slice(0, 3) + rnd(),
    (initials.length >= 2 ? initials : words[0].slice(0, 2)) + rnd(),
  ];
  // ייחודי, 5-6 תווים, ולא הקוד שכבר בשימוש
  return [...new Set(out)]
    .filter((c) => c.length >= 5 && c.length <= 6 && c !== String(current || "").toUpperCase() && !weakCode(c))
    .slice(0, 3);
}

export default function CodeChanger({ kind = "team", current = "", others = 0, restaurantName = "", onChanged }) {
  const t = COPY[kind] || COPY.team;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  // ההצעות נגזרות פעם אחת לפתיחת הטופס — אחרת כל הקשה בשדה מגרילה ספרות חדשות
  // והמנהל רודף אחרי הצעה שראה לפני רגע.
  const [ideas, setIdeas] = useState([]);
  // ⚠️ «ביטול» באמצע הקריאה השאיר שגיאה שצפה בפתיחה הבאה, על טופס ריק. כל ניסיון נושא
  //    מספר, ותשובה של ניסיון שכבר נסגר נזרקת.
  const attempt = useRef(0);

  const close = () => {
    attempt.current += 1;
    setOpen(false); setCode(""); setPassword(""); setErr(""); setBusy(false);
  };

  const save = async () => {
    const next = code.trim().toUpperCase();
    if (!next) return;
    // אותו קוד בדיוק — אין מה לשמור, ואין טעם להחזיר «נשמר» על לא-כלום
    if (next === String(current || "").toUpperCase()) { setErr("זה הקוד הנוכחי"); return; }
    const mine = ++attempt.current;
    setBusy(true); setErr("");
    const { data, error } = await db.rpc("change_access_code", {
      p_kind: kind,
      p_code: next,
      p_password: kind === "owner" ? password : null,
    });
    if (mine !== attempt.current) return;   // בוטל או הוחלף בניסיון חדש
    setBusy(false);
    if (error || !data?.ok) {
      setErr(ERRORS[data?.error] || "לא הצלחנו לשנות את הקוד. נסו שוב");
      return;
    }
    onChanged?.(data.code);
    close();
    setDone(true);
    setTimeout(() => setDone(false), 2200);
  };

  if (!open) {
    return (
      <button type="button" className="au-pill ghost"
        onClick={() => { setIdeas(codeIdeas(restaurantName, current)); setOpen(true); }}>
        {done ? t.done : t.open}
      </button>
    );
  }

  const blocked = busy || !code.trim() || (kind === "owner" && !password);
  const weak = code.trim() ? weakCode(code) : "";

  return (
    <div className="w-full text-right space-y-2.5 mt-1">
      <p className="text-[13px] font-black text-[#eef0f6]">{t.title}</p>
      <input
        value={code}
        onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setErr(""); }}
        // 16px — מתחת לזה ספארי מזגזג ל-zoom בכל פוקוס
        className="w-full rounded-xl bg-[rgba(238,240,246,.06)] border border-[rgba(238,240,246,.14)] px-3 py-2.5 text-[16px] font-black tracking-[.12em] text-[#eef0f6] outline-none focus:border-[#22c08c]"
        dir="ltr"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={12}
        placeholder={String(current || "")}
        aria-label={t.title}
      />
      {kind === "owner" && (
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErr(""); }}
          className="w-full rounded-xl bg-[rgba(238,240,246,.06)] border border-[rgba(238,240,246,.14)] px-3 py-2.5 text-[16px] text-[#eef0f6] outline-none focus:border-[#22c08c]"
          placeholder="הסיסמה שלכם"
          aria-label="הסיסמה שלכם"
        />
      )}
      {ideas.length > 0 && !code && (
        <div className="space-y-1.5">
          <p className="text-[12px] text-[#8a919e]">רעיונות מהשם של המסעדה:</p>
          <div className="flex flex-wrap gap-1.5">
            {ideas.map((c) => (
              <button key={c} type="button" className="au-pill ghost" dir="ltr"
                onClick={() => { setCode(c); setErr(""); }}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      {weak && <p className="text-[12px] text-[#f3c14b] leading-relaxed">{weak}</p>}
      <p className="text-[12px] text-[#8a919e] leading-relaxed">
        מומלץ לא לבחור קוד שקל לנחש — 5-6 תווים שמשלבים אותיות וספרות. {t.note}
      </p>
      {/* מנהל נוסף נכנס עם אותו קוד בעלים — שינוי שלו נוגע גם בו, וזה חייב להיאמר לפני השמירה */}
      {kind === "owner" && others > 0 && (
        <p className="text-[12px] text-[#f3c14b] leading-relaxed">
          {others === 1 ? "יש עוד מנהל שנכנס עם הקוד הזה" : `יש עוד ${others} מנהלים שנכנסים עם הקוד הזה`} — עדכנו אותם.
        </p>
      )}
      {err && <p className="text-[12.5px] font-bold text-[#F27D8D]">{err}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="au-pill"
          onClick={save}
          disabled={blocked}
          style={blocked ? { opacity: 0.5 } : undefined}
        >
          {busy ? "שומר…" : "שמירת הקוד"}
        </button>
        <button type="button" className="au-pill ghost" onClick={close}>ביטול</button>
      </div>
    </div>
  );
}
