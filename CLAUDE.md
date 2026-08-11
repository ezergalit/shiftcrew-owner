# shiftcrew-owner-rebuild — Owner App (שכפול עבודה של shiftcrew-owner)

> ר' גם `/Users/homestation/Desktop/CLAUDE.md` להקשר הכללי (Supabase, deploy, סטטוס).

## ⚠️ מה זו התיקייה הזו, בדיוק

זו **לא** אפליקציה נפרדת. זה clone מקומי של **אותו repo** כמו `shiftcrew-owner/`
(`origin` = `github.com/ezergalit/shiftcrew-owner.git`, אותה היסטוריית commits) — פשוט
עם שינויים לא-committed שנצברו כאן במהלך שיחזור מלא של אפליקציית הבעלים. `shiftcrew-owner/`
(המקור) עדיין מכיל את הקוד הישן/פגום (`MainApp.jsx`, ללא אונבורדינג, שער SALON).

**כדי לדפלוי את מה שנמצא כאן**: `git push` מתוך התיקייה הזו — זה מעדכן ישירות את ה-repo
שממנו Vercel בונה. אין צורך להעתיק קבצים או לשנות הגדרות Vercel. **אל תעשה commit/push
בלי אישור מפורש מהמשתמש** (כלל כללי של הפרויקט).

## ארכיטקטורה נוכחית (2026-08-10)

```
main.jsx → App.jsx
              │
              ├─ VITE_DEV_BYPASS_AUTH=true (.env.local, gitignored) → דמו מקומי, מדלג login
              ├─ session ב-localStorage ("menu-app-owner-session") + restaurant מלא
              │   מ-DB (RESTAURANT_COLUMNS מיוצא מ-OwnerDashboard.jsx — לא כולל
              │   owner_password/owner_password_hash, חסומים ב-DB ברמת עמודה)
              │   ├─ אין/לא תקף → OwnerLogin
              │   └─ תקף → OwnerDashboard
              │
OwnerLogin.jsx:
  הרשמה פתוחה לגמרי (שם+סיסמה, ללא שער admin) + כניסה (קוד+סיסמה), שתיהן דרך
  RPC ב-DB (`supabase.schema("menu_app").rpc("create_restaurant_account"/"verify_owner_login")`).
  ר' CLAUDE.md הראשי, סעיף "רב-דיירות", לפרטי ה-RPCs עצמם.

OwnerDashboard.jsx (763+ שורות):
  - אונבורדינג תלת-שלבי בכניסה ראשונה (מוגדר לפי `!restaurant.description`):
    1. פרטי מסעדה + CuisineSelector (חיפוש/autocomplete/תגיות, `lib/cuisineTypes.js` +
       `components/CuisineSelector.jsx`, ~90 סוגי מטבח + אופציה להוסיף מותאם אישית) +
       אלרגנים חשובים (תגיות, מתוך `ALLERGENS` הקבועה)
    2. "סגנון האירוח" — שאלה מנוסחת בעדינות (לא "יקר מול זול") עם 3 אופציות: אירוח מהודר
       ומוקפד / חם ומשפחתי / אנרגטי וקליל, + הערות חופשיות
    3. מסך סיום
  - Bottom nav (5 טאבים): בית | תפריט | פרטים | צוות | יציאה
  - תפריט: CRUD מלא למנות (`menu_items`), טופס עם קטגוריה/מחיר/תיאור/אלרגנים/"מנת היום"
  - פרטים: תצוגה+עריכה של כל שדות המסעדה (משתמש ב-CuisineSelector ובאותה רשימת סגנונות
    אירוח כמו האונבורדינג)
  - צוות: קוד הצוות לשיתוף + רשימת חברים (`team_members`, נטען אבל read-only כרגע)
  - **אין יותר "פרסום" ידני** — trigger ב-DB (`trg_sync_published_menu`) משקף כל שינוי
    ב-`menu_items` ל-`published_menu` אוטומטית ומיידית

CuisineSelector.jsx: קומפוננטה עצמאית לשימוש חוזר (אונבורדינג + פרטים), חיפוש+autocomplete+
  תגיות ניתנות להסרה + "הוסף כסוג מותאם אישית" אם לא נמצא match.
```

## ⚠️ TEMP DEV BYPASS — עוקף התחברות (Supabase עדיין תקוע)

`App.jsx` בודק `import.meta.env.VITE_DEV_BYPASS_AUTH === "true"` — אם כן, מדלג לגמרי על
login/session ומציג דשבורד עם מסעדת-דמו (`Demo Restaurant`, `DEMO01`). כבוי כברירת מחדל.
מופעל דרך `.env.local` (**gitignored**, לא ב-repo) — קיים כרגע בתיקייה הזו כי PostgREST
עדיין תקוע (PGRST002), כדי לאפשר עבודה על ה-UI. **אל תסמוך על ה-.env.local הזה בסביבה
אחרת** — אם משכפלים את התיקייה מחדש הוא לא יהיה קיים ותקבלו את מסך ה-login האמיתי.

## סטטוס

- ✅ קוד מלא, כל הלוגיקה מאומתת ישירות מול ה-DB (`execute_sql` דרך MCP) — ר' תוכנית העבודה
  ב-`/Users/homestation/.claude/plans/enumerated-crunching-creek.md` לפרטי האימות המלא.
- ⏳ מעבר חי (browser → PostgREST → DB) עדיין לא נבדק — PostgREST עדיין ב-PGRST002.
- ⏳ שום דבר מזה **לא committed/pushed** עדיין.

## הרצה מקומית

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5178
```
`.env` קיים עם `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. הוסף `.env.local` עם
`VITE_DEV_BYPASS_AUTH=true` אם רוצים לראות את הדשבורד בלי להתחבר (רלוונטי כל עוד
PostgREST תקוע).
