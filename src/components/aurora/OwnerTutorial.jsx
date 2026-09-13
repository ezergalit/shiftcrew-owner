import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Mail, Check } from "lucide-react";

// ══ המדריך האינטראקטיבי של המנהל — עותק של המסעדה, לצורך הלימוד בלבד (יותם, 13.9) ══
//
// «תתאים מדריך אינטראקטיבי לכל מסעדה — שכשנכנסים בפעם הראשונה נכנסים לעותק מדויק של
//  המסעדה, רק לצורך המדריך… שיהיה אינטראקטיבי, עם המידע המדויק של המסעדה, ופשוט.»
//
// אותה החלטה כמו בצד המלצר: הסיור הישן היה שכבה מעל הדשבורד החי — זרקור שמחפש אלמנט,
// מודד אותו ומחשיך את השאר. כאן זה **מסך מלא** שמרנדר את המסעדה מהנתונים שכבר בזיכרון
// (`restaurant`, `items`, `teamMembers`), ולכן אין לו למה להיצמד ואין לו במה להיתקע.
//   · שום דבר לא נשמר: ה-✉ לא שולח הודעה, «עריכת המנה» לא כותבת ל-DB.
//   · כל צעד מתקדם מהקשה אמיתית על הדבר עצמו.
//
// ⚠️ השכבה עוברת ב-`createPortal` ל-`body`. היא `fixed inset-0`, ובצד הזה כל שכבה כזו
// שנולדת בתוך כרטיס זכוכית נמדדת מול הכרטיס ולא מול המסך («הכלא של backdrop-filter»,
// ארבע פעמים בפרויקט) — הפורטל הוא מה שמוציא אותה משם.

const STEPS = ["ברוכים הבאים", "מי לומד", "התפריט", "המנה", "תצוגת מלצר", "הקוד", "מוכנים"];

export default function OwnerTutorial({ restaurant, items, teamMembers, onDone }) {
  const [step, setStep] = useState(0);
  const [nudged, setNudged] = useState({});
  const [editing, setEditing] = useState(false);

  // מנה להדגמה: זו שיש בה הכי הרבה ללמד — תיאור, מרכיבים ואזהרות.
  const dish = useMemo(() => {
    const score = (d) =>
      (d.description ? 2 : 0) + (d.ingredients?.length ? 2 : 0) +
      ((d.allergens?.length || 0) + (d.pitfalls?.length || 0) + (d.pregnancy?.length || 0) ? 3 : 0) +
      (d.image_url ? 1 : 0);
    return (items || []).slice().sort((a, b) => score(b) - score(a))[0] || null;
  }, [items]);

  const sameCat = useMemo(
    () => (items || []).filter((d) => d.category === dish?.category).slice(0, 6),
    [items, dish],
  );

  const menus = useMemo(() => {
    const seen = new Map();
    for (const d of items || []) {
      const g = d.menuGroup || "התפריט";
      seen.set(g, (seen.get(g) || 0) + 1);
    }
    return [...seen.entries()].map(([name, count]) => ({ name, count }));
  }, [items]);

  const team = (teamMembers || []).slice(0, 5);

  const go = (n) => { setStep(n); setEditing(false); };

  const Coach = ({ children, hint }) => (
    <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
      <div className="flex items-center gap-1.5 mb-2.5">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1 rounded-full flex-1 ${i <= step ? "bg-[#22c08c]" : "bg-[#22252b]"}`} />
        ))}
      </div>
      <p className="text-[15px] font-black text-[#eef0f6] leading-snug">{children}</p>
      {hint && <p className="text-[12px] font-bold text-[#22c08c] mt-1">{hint}</p>}
    </div>
  );

  const Frame = ({ children }) => createPortal(
    <div className="fixed inset-0 z-[70] bg-[#0c0d10] flex flex-col" dir="rtl">
      <div className="flex-1 overflow-y-auto">{children}</div>
      <div className="px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t border-[#16181c] flex justify-between items-center">
        <button onClick={onDone} className="text-[11px] font-bold text-[#5a5a6e] min-h-[44px] px-1">דילוג על המדריך</button>
        {step > 0 && (
          <button onClick={() => go(step - 1)} className="text-[11px] font-bold text-[#5a5a6e] min-h-[44px] px-1">→ אחורה</button>
        )}
      </div>
    </div>,
    document.body,
  );

  const Next = ({ children, onClick }) => (
    <button
      onClick={onClick}
      className="w-full py-3.5 min-h-[48px] rounded-xl font-black text-[15px] bg-[#22c08c] text-[#06231a]"
    >
      {children}
    </button>
  );

  const warnings = dish
    ? [
        { t: "אלרגיות", v: dish.allergens || [], c: "text-[#e0315a] bg-[#3a1d22]" },
        { t: "רגישות בהריון", v: dish.pregnancy || [], c: "text-[#b48cff] bg-[#2a1d3a]" },
        { t: "מוקשים", v: dish.pitfalls || [], c: "text-[#f3c14b] bg-[#3a2f1d]" },
      ].filter((g) => g.v.length > 0)
    : [];

  // ── 0 · ברוכים הבאים ────────────────────────────────────────────────────────
  if (step === 0)
    return (
      <Frame>
        <Coach>המדריך רץ על החשבון האמיתי של {restaurant?.name || "המסעדה"}.</Coach>
        <div className="px-4 pb-6 space-y-4">
          <div className="rounded-3xl p-5 border border-[rgba(34,192,140,0.25)]"
            style={{ background: "linear-gradient(150deg,rgba(34,192,140,0.12),rgba(15,92,70,0.16))" }}>
            <p className="text-[22px] font-black text-[#eef0f6] leading-tight">{restaurant?.name || "המסעדה"}</p>
            <div className="flex gap-2 mt-4">
              <span className="flex-1 bg-[#0c0d10]/50 rounded-xl p-3 text-center">
                <span className="block text-[20px] font-black text-[#22c08c]">{items?.length || 0}</span>
                <span className="block text-[11px] text-[#8a919e]">פריטים בתפריט</span>
              </span>
              <span className="flex-1 bg-[#0c0d10]/50 rounded-xl p-3 text-center">
                <span className="block text-[20px] font-black text-[#22c08c]">{teamMembers?.length || 0}</span>
                <span className="block text-[11px] text-[#8a919e]">חברי צוות</span>
              </span>
            </div>
          </div>
          <p className="text-[14px] text-[#c4c4d4] leading-relaxed">
            שלושה מסכים, וזהו: מי לומד · התפריט · ההגדרות. נעבור על כולם עם הנתונים שלכם.
            <span className="font-black text-[#eef0f6]"> שום דבר כאן לא נשמר.</span>
          </p>
          <Next onClick={() => go(1)}>יאללה, מתחילים</Next>
        </div>
      </Frame>
    );

  // ── 1 · מי לומד + התזכורת ───────────────────────────────────────────────────
  if (step === 1)
    return (
      <Frame>
        <Coach hint={team.length ? "הקש/י על ✉ ליד אחד מהם" : undefined}>
          המסך הראשי הוא הצוות: מי למד היום, ומי צריך תזכורת.
        </Coach>
        <div className="px-4 pb-6 space-y-2">
          {team.length === 0 && (
            <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
              <p className="text-[14px] font-black text-[#eef0f6]">עוד אין צוות</p>
              <p className="text-[12px] text-[#8a919e] mt-1 leading-relaxed">
                ברגע שמלצר ייכנס עם קוד ההצטרפות הוא יופיע כאן, עם אחוז השליטה שלו בתפריט.
              </p>
            </div>
          )}
          {team.map((m) => (
            <div key={m.id} className="flex items-center gap-3 bg-[#16181c] border border-[#22252b] rounded-2xl p-3">
              <span className="w-9 h-9 rounded-full bg-[#0f2a22] text-[#22c08c] text-[12px] font-black flex items-center justify-center flex-shrink-0">
                {String(m.name || m.first_name || "?").slice(0, 2)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-black text-[#eef0f6] truncate">{m.name || m.first_name}</span>
                <span className="block text-[11px] text-[#8a919e]">{nudged[m.id] ? "נשלחה תזכורת" : "לא למד היום"}</span>
              </span>
              <button
                onClick={() => setNudged((p) => ({ ...p, [m.id]: true }))}
                aria-label="שליחת תזכורת"
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  nudged[m.id] ? "bg-[#0f2a22] border-[#22c08c] text-[#22c08c]" : "bg-[#0c0d10] border-[#22252b] text-[#8a919e]"
                }`}
              >
                {nudged[m.id] ? <Check size={17} /> : <Mail size={17} />}
              </button>
            </div>
          ))}
          {(Object.keys(nudged).length > 0 || team.length === 0) && (
            <div className="pt-2 space-y-3">
              <p className="text-[13px] text-[#c4c4d4] leading-relaxed">
                הקשה אחת שולחת ״תזכורת ללמוד תפריט באפליקציה 📖״ ישירות למלצר. אין מה לנסח.
              </p>
              <Next onClick={() => go(2)}>לתפריט</Next>
            </div>
          )}
        </div>
      </Frame>
    );

  // ── 2 · התפריט ──────────────────────────────────────────────────────────────
  if (step === 2)
    return (
      <Frame>
        <Coach hint={dish ? `הקש/י על ״${dish.name}״` : undefined}>
          כאן התפריט שהצוות לומד. הקשה על מנה פותחת אותה.
        </Coach>
        <div className="px-4 pb-6 space-y-2">
          <p className="text-[12px] font-bold text-[#5a5a6e] px-1">{dish?.category}</p>
          {sameCat.map((d) => (
            <button
              key={d.id}
              onClick={() => d.id === dish?.id ? go(3) : null}
              className="w-full text-right flex items-center gap-3 bg-[#16181c] border border-[#22252b] rounded-2xl p-3"
            >
              <span className="w-12 h-12 rounded-lg bg-[#0f2a22] overflow-hidden flex-shrink-0 flex items-center justify-center">
                {d.image_url ? <img src={d.image_url} alt="" className="w-full h-full object-cover" /> : "🍽️"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-black text-[#eef0f6] truncate">{d.name}</span>
                {d.description && <span className="block text-[11px] text-[#8a919e] truncate">{d.description}</span>}
              </span>
              <ChevronLeft size={18} className="text-[#5a5a6e] flex-shrink-0" />
            </button>
          ))}
        </div>
      </Frame>
    );

  // ── 3 · עיון ועריכה ─────────────────────────────────────────────────────────
  if (step === 3)
    return (
      <Frame>
        <Coach hint={editing ? undefined : "הקש/י על ״עריכת המנה״"}>
          {editing ? "כל שינוי כאן מגיע לצוות מיד — בלי לפרסם ובלי לשמור פעמיים." : "קודם רואים את המנה כמו שהיא, ורק אז עורכים."}
        </Coach>
        <div className="px-4 pb-6 space-y-3">
          {!editing ? (
            <>
              {dish?.image_url && <img src={dish.image_url} alt="" className="w-full h-40 object-cover rounded-2xl" />}
              <p className="text-[19px] font-black text-[#eef0f6] leading-tight">{dish?.name}</p>
              {dish?.description && <p className="text-[14px] text-[#c4c4d4] leading-relaxed">{dish.description}</p>}
              {dish?.ingredients?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {dish.ingredients.map((g) => (
                    <span key={g} className="text-[12px] bg-[#16181c] border border-[#22252b] text-[#c4c4d4] rounded-lg px-2 py-1">{g}</span>
                  ))}
                </div>
              )}
              {warnings.map((g) => (
                <div key={g.t} className={`${g.c.split(" ")[1]} rounded-xl p-3`}>
                  <p className={`text-[13px] font-black ${g.c.split(" ")[0]}`}>{g.t}: {g.v.join(", ")}</p>
                </div>
              ))}
              <Next onClick={() => setEditing(true)}>עריכת המנה</Next>
            </>
          ) : (
            <>
              {[["שם המנה", dish?.name], ["קטגוריה", dish?.category], ["מחיר", dish?.price ? `${dish.price} ₪` : "—"],
                ["תיאור המנה", dish?.description || "—"]].map(([label, val]) => (
                <div key={label}>
                  <p className="text-[11px] font-bold text-[#8a919e] mb-1">{label}</p>
                  <div className="bg-[#16181c] border border-[#22252b] rounded-xl px-3 py-2.5 text-[14px] text-[#eef0f6]">{val}</div>
                </div>
              ))}
              <p className="text-[12px] text-[#5a5a6e] leading-relaxed">
                האלרגיות והמוקשים נבחרים מרשימה סגורה — ככה הצוות נבחן על אותם מונחים בכל המנות.
              </p>
              <Next onClick={() => go(4)}>הבנתי</Next>
            </>
          )}
        </div>
      </Frame>
    );

  // ── 4 · תצוגת מלצר ──────────────────────────────────────────────────────────
  if (step === 4)
    return (
      <Frame>
        <Coach>״תצוגת מלצר״ פותחת את האפליקציה של הצוות — בדיוק מה שהם רואים.</Coach>
        <div className="px-4 pb-6 space-y-3">
          <div className="mx-auto w-[230px] rounded-[26px] border-[6px] border-[#22252b] bg-[#0c0d10] p-3 space-y-2">
            <p className="text-[11px] font-bold text-[#22c08c]">{restaurant?.name}</p>
            {menus.slice(0, 4).map((m) => (
              <div key={m.name} className="bg-[#16181c] border border-[#22252b] rounded-xl px-2.5 py-2">
                <p className="text-[12px] font-black text-[#eef0f6] truncate">{m.name}</p>
                <p className="text-[10px] text-[#8a919e]">{m.count} מנות</p>
              </div>
            ))}
          </div>
          <p className="text-[14px] text-[#c4c4d4] leading-relaxed">
            הכפתור נמצא בראש המסך הראשי, ליד הברכה. שווה להיכנס אחרי כל שינוי בתפריט —
            ככה רואים את השינוי בעיניים של המלצר.
          </p>
          <Next onClick={() => go(5)}>לקוד ההצטרפות</Next>
        </div>
      </Frame>
    );

  // ── 5 · קוד ההצטרפות ────────────────────────────────────────────────────────
  if (step === 5)
    return (
      <Frame>
        <Coach>ככה מצרפים מלצר: הקוד הזה, ושמו הפרטי ושם המשפחה. זהו.</Coach>
        <div className="px-4 pb-6 space-y-4">
          <div className="rounded-3xl p-6 text-center border border-[rgba(34,192,140,0.25)]"
            style={{ background: "linear-gradient(150deg,rgba(34,192,140,0.12),rgba(15,92,70,0.16))" }}>
            <p className="text-[11px] font-bold text-[#8a919e] mb-2">קוד ההצטרפות של הצוות</p>
            <p className="text-[34px] font-black text-[#22c08c] tracking-[0.18em]">{restaurant?.team_code || "——————"}</p>
          </div>
          <p className="text-[14px] text-[#c4c4d4] leading-relaxed">
            הקוד יושב בהגדרות, עם כפתור שיתוף בוואטסאפ. אין סיסמאות למלצרים ואין הרשמה —
            מי שיש לו את הקוד נכנס, ומי שעזב פשוט מוסר מהרשימה.
          </p>
          <Next onClick={() => go(6)}>סיימנו</Next>
        </div>
      </Frame>
    );

  // ── 6 · מוכנים ──────────────────────────────────────────────────────────────
  return (
    <Frame>
      <Coach>זהו — זה כל מה שצריך.</Coach>
      <div className="px-4 pb-6 space-y-4">
        <div className="rounded-3xl p-5 border border-[rgba(34,192,140,0.25)] space-y-2.5"
          style={{ background: "linear-gradient(150deg,rgba(34,192,140,0.12),rgba(15,92,70,0.16))" }}>
          {[
            ["🏠", "בית", "מי למד היום, ותזכורת בהקשה."],
            ["📖", "תפריט", "המנות שהצוות לומד — עריכה מגיעה אליהם מיד."],
            ["⚙️", "הגדרות", "קוד ההצטרפות, הצוות, והחשבון."],
          ].map(([e, t, d]) => (
            <div key={t} className="flex gap-3 items-start">
              <span className="text-[18px]">{e}</span>
              <span className="flex-1">
                <span className="block text-[14px] font-black text-[#eef0f6]">{t}</span>
                <span className="block text-[12px] text-[#c4c4d4]">{d}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[#5a5a6e] text-center">אפשר להריץ את המדריך שוב מההגדרות.</p>
        <Next onClick={onDone}>מתחילים</Next>
      </div>
    </Frame>
  );
}
