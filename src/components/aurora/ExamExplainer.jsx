// "על מה הצוות נבחן" — the manager's window into the quiz (user, 31.8: "צריך להוסיף
// בהגדרות דרך לראות על מה בעצם בוחנים אותם מבחינת שאלות").
//
// Every example is built from THIS restaurant's own menu — a real dish name, a real
// allergen, a real drink — so the manager reads the actual questions their team will
// meet, not a generic promise. The wording mirrors the waiter app's question engine;
// if a question type has no data here (no drinks, no cocktails), its card simply
// doesn't render.

const drinkKind = (cat) =>
  /יין|יינ/.test(cat || "") ? "יין" : /סאקה/.test(cat || "") ? "סאקה" : /ביר(ה|ות)/.test(cat || "") ? "בירה" : null;
const isGuide = (i) => (i.category || "").startsWith("הדרכת") || (i.name || "").startsWith("מה חשוב לדעת");

function Example({ q }) {
  return (
    <p className="text-[13px] text-[#eef0f6] leading-relaxed bg-[#0c0d10] border border-[#22252b] rounded-xl px-3 py-2.5 mt-1.5">
      {q}
    </p>
  );
}

function Kind({ emoji, title, children }) {
  return (
    <div className="border-b border-[#22252b] pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
      <p className="text-[13.5px] font-black text-[#eef0f6]">
        <span aria-hidden className="ml-1">{emoji}</span> {title}
      </p>
      {children}
    </div>
  );
}

export default function ExamExplainer({ items }) {
  const all = (items || []).filter((i) => !isGuide(i));
  const foods = all.filter((i) => !drinkKind(i.category) && !/קוקטייל/.test(i.category || ""));

  const exDish = foods.find((i) => (i.ingredients || []).length >= 3);
  const exAllergy = foods.find((i) => (i.allergens || []).length >= 2) || foods.find((i) => (i.allergens || []).length >= 1);
  const exDrink = all.find((i) => drinkKind(i.category));
  const exCocktail = all.find((i) => /קוקטייל/.test(i.category || ""));
  const exTrait = exDrink?.ingredients?.[1] || exDrink?.ingredients?.[0];
  const exRecAllergen = exAllergy?.allergens?.[0];
  const exPitfall = foods.find((i) => (i.pitfalls || []).length)?.pitfalls?.[0];
  // הרכב הבוחן (יותם, 6.9): 60-70% מהמנות בקטגוריה, כל אחת «תמליץ ותאר», ועוד 1-2
  // שאלות-סט בלי תיאור. הדוגמה נבנית מהקטגוריה הגדולה ביותר של המסעדה עצמה.
  const byCat = foods.reduce((m, i) => { (m[i.category] ||= []).push(i); return m; }, {});
  const bigCat = Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)[0];
  const quizSize = (n) => (n <= 4 ? n : n <= 8 ? Math.ceil(n * 0.7) : Math.round(n * 0.6));
  const catForm = (c) => (/[A-Za-z]/.test(c || "") || (c || "").split(/\s+/).length >= 3 ? `המנות ב״${c}״` : `ה${c}`);

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-[#8a919e] leading-relaxed">
        כל שאלה נבנית אוטומטית מהתפריט שלכם — עדכון מנה מעדכן את הבוחן מעצמו. המלצר
        עונה <b>בכתיבה חופשית</b>, והבדיקה סולחת על טעויות כתיב והטיות (מתקתק =
        מתוק, ישראלי = ישראלית) — אבל לא על עובדה שגויה. אלו סוגי השאלות:
      </p>

      {bigCat && (
        <Kind emoji="🎲" title="הרכב הבוחן — 60-70% מהמנות, בכל פעם אחרות">
          <p className="text-[11.5px] text-[#8a919e] mt-1 leading-relaxed">
            בכל בוחן נבחרות באקראי כ-60-70% מהמנות בקטגוריה (ב{catForm(bigCat[0])}:{" "}
            {quizSize(bigCat[1].length)} מתוך {bigCat[1].length}; קטגוריה של 4 מנות ומטה נבחנת כולה).
            כל מנה = «תמליץ ותאר» — מה יש בה ואילו אלרגיות. ועוד 1-2 שאלות בלי תיאור בכלל:
          </p>
          <Example q={`אילו מנות מ${catForm(bigCat[0]).replace(/^ה/, "")} אורח טבעוני יכול להזמין? ציין את כולן.`} />
          <Example q={`אורח מבקש המלצה מ${catForm(bigCat[0]).replace(/^ה/, "")} — משהו עם ${bigCat[1].find((i) => (i.ingredients || []).length)?.ingredients?.[0] || "אבוקדו"}. על מה תמליץ?`} />
          <p className="text-[11.5px] text-[#8a919e] mt-1 leading-relaxed">
            מה שנשאל נרשם, ומלצר שנכשל מקבל בפעם הבאה בוחן אחר — עד שכל המאגר מוצה.
            <b> המבחן המלא</b> הוא כל הבחנים יחד: כל קטגוריה מקבלת מקום לפי מספר המנות
            שבה (12 ראשונות ו-6 עיקריות ⇒ פי 2 שאלות על ראשונות), הכל ב-40 שאלות.
          </p>
        </Kind>
      )}

      {exDish && (
        <Kind emoji="🍽️" title="תיאור ומרכיבים — הבסיס">
          <Example q={`אורח שואל מה יש ב״${exDish.name}״ — מלבד מה שבשם המנה. מה תגיד לו?`} />
          <p className="text-[11.5px] text-[#8a919e] mt-1 leading-relaxed">
            נבדק מול המרכיבים שבכרטיסיית המנה. מרכיב שהומצא מוריד ניקוד.
          </p>
        </Kind>
      )}

      {exAllergy && (
        <Kind emoji="🚨" title="אלרגיות — שדה בטיחות">
          <Example q={`אורח שואל אילו אלרגיות יש ב״${exAllergy.name}״. מה תגיד לו?`} />
          <p className="text-[11.5px] text-[#8a919e] mt-1 leading-relaxed">
            כאן הבדיקה הקשוחה ביותר: צריך את כל האלרגיות, בלי להמציא אף אחת.
          </p>
        </Kind>
      )}

      {(exRecAllergen || exPitfall) && (
        <Kind emoji="⭐" title="המלצה לפי סיטואציה — לפחות שאלה אחת בכל בוחן">
          {exRecAllergen && exAllergy && (
            <Example q={`אורח אלרגי ל${exRecAllergen} מבקש המלצה מ${exAllergy.category}. על איזו מנה תמליץ?`} />
          )}
          {exPitfall && (
            <Example q={`אורח שאוהב ${exPitfall} מבקש המלצה. על איזו מנה תמליץ?`} />
          )}
          <p className="text-[11.5px] text-[#8a919e] mt-1 leading-relaxed">
            השאלות שהכי דומות לשולחן אמיתי: אלרגיה, הריון, העדפות וטעמים. כל מנה
            מתאימה נחשבת תשובה נכונה — והמלצה על מנה שנושאת את האלרגן נכשלת.
            עד מחצית מכל בוחן מורכבת מהשאלות האלה, והן לא חוזרות על עצמן עד
            שכל המאגר מוצה.
          </p>
        </Kind>
      )}

      {exDrink && (
        <Kind emoji="🍷" title="משקאות — בעיקר המלצות">
          {drinkKind(exDrink.category) === "יין" && (
            <Example q={`אורח מבקש המלצה על 3 יינות לבנים. על אילו תמליץ?`} />
          )}
          {drinkKind(exDrink.category) === "יין"
            ? <Example q={`אורח מבקש שתתאר לו את היין ״${exDrink.name}״. מה תגיד לו?`} />
            : exTrait && <Example q={`אורח אוהב ${drinkKind(exDrink.category)} ${exTrait} ומבקש המלצה. על מה תמליץ לו?`} />}
          <p className="text-[11.5px] text-[#8a919e] mt-1 leading-relaxed">
            רוב שאלות המשקאות הן המלצות — לבן/אדום, יבש/מתוק, כשר, ישראלי, מהחבית —
            והמלצת יין בצבע הלא-נכון מורידה נקודות גם אם תוארה יפה. שאלת «תתאר לי
            את היין» מופיעה פעם-פעמיים בבוחן; בירה וסאקה נבחנות בהמלצות בלבד.
          </p>
        </Kind>
      )}

      {exCocktail && (
        <Kind emoji="🍸" title="קוקטיילים — מרכיבים וגם טעם">
          <Example q={`אורח שואל מה יש ב״${exCocktail.name}״. מה תגיד לו?`} />
          <Example q={`אורח שואל איך ״${exCocktail.name}״ בטעם. איך תתאר לו את הקוקטייל?`} />
        </Kind>
      )}

      <p className="text-[11.5px] text-[#6b7280] leading-relaxed">
        לפני כל בוחן נדרש תרגול כרטיסיות — הזמן נגזר מגודל הקטגוריה (עד 5 דקות),
        וכך גם ההמתנה אחרי כישלון.
      </p>
    </div>
  );
}
