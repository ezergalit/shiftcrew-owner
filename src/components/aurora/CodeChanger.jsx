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

export default function CodeChanger({ kind = "team", current = "", others = 0, onChanged }) {
  const t = COPY[kind] || COPY.team;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
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
      <button type="button" className="au-pill ghost" onClick={() => setOpen(true)}>
        {done ? t.done : t.open}
      </button>
    );
  }

  const blocked = busy || !code.trim() || (kind === "owner" && !password);

  return (
    <div className="w-full text-right space-y-2.5 mt-1">
      <p className="text-[13px] font-black text-[#eef0f6]">{t.title}</p>
      <input
        value={code}
        onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(""); }}
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
      <p className="text-[12px] text-[#8a919e] leading-relaxed">{t.note}</p>
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
