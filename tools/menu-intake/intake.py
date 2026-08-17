#!/usr/bin/env python3
"""קליטת תפריט — מטקסט גולמי לתפריט מובנה מוכן להזנה.

    python3 intake.py menu.txt                # קריאה מקובץ
    pbpaste | python3 intake.py -             # הדבקה ישירה
    python3 intake.py menu.txt --json out.json

הקלט הוא הטקסט שהמסעדה מסרה (PDF/אתר משלה/תמלול צילום). הפלט:
  שם המנה — מחיר
    התיאור
    ⚠ אלרגנים אפשריים: ...

⚠️ האלרגנים הם **הצעה לבדיקה**, לא פסק דין. הם נגזרים ממה שכתוב בתיאור בלבד,
והמנוע מעדיף להשאיר ריק מאשר לנחש (מנה יכולה לשלוח סועד לבית חולים). לפני שהצוות
לומד אותם — הבעלים חייב לאשר. כשרות לעולם לא נקבעת אוטומטית.

הפענוח רץ מול אותה Edge Function שהאפליקציה משתמשת בה (menu-ai-parse), עם אותם
שערי בטיחות: רשימות ערכים סגורות, "סימן בישול שולל דג נא", ואיסור המצאת מחירים.
"""
import argparse, html, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BROWSER_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def page_to_text(url):
    """דף HTML פשוט ⇒ טקסט. עובד על אתרים סטטיים של מסעדות עצמאיות.

    ⚠️ לא עוקף שום הגנה: אתר שמוגן ב-WAF, דורש הסכמת עוגיות או מרנדר ב-JS יחזיר
    כאן דף ריק/שגיאה — וזה הסימן לעבור לצילום מסך במקום להתעקש.
    """
    req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA,
                                               "Accept-Language": "he,en;q=0.8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
    raw = re.sub(r"(?is)<(script|style|noscript|svg|head)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>", "\n", raw)
    raw = re.sub(r"(?i)</(p|div|li|tr|h[1-6]|section)>", "\n", raw)
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    text = re.sub(r"[ \t\xa0]+", " ", text)
    text = "\n".join(l.strip() for l in text.splitlines() if l.strip())
    return re.sub(r"\n{3,}", "\n\n", text)

FN_URL = "https://huwcyedlbcrugpbdcsdo.supabase.co/functions/v1/menu-ai-parse"


def anon_key():
    """המפתח הפומבי מ-.env של אפליקציית הבעלים (אותו אחד שה-bundle שולח)."""
    env = os.environ.get("VITE_SUPABASE_ANON_KEY")
    if env:
        return env
    for p in (Path(__file__).resolve().parents[2] / ".env",
              Path.home() / "Desktop/shiftcrew-owner/.env"):
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                if line.startswith("VITE_SUPABASE_ANON_KEY="):
                    return line.split("=", 1)[1].strip()
    sys.exit("לא נמצא VITE_SUPABASE_ANON_KEY (בדוק את .env של shiftcrew-owner).")


ANON = anon_key()
MAX_CHUNK = 2600  # אותו גודל כמו בקליינט — קריאה אחת ענקית מחזירה JSON שבור

# סדר ההגשה המקובל, לסידור קטגוריות שהגיעו מכמה מקורות
COURSE_RANK = {"starters": 0, "mains": 1, "sides": 2, "desserts": 3,
               "drinks": 4, "alcohol": 5, "other": 6}


def split_chunks(text, max_len=MAX_CHUNK):
    """פיצול על גבולות קטגוריה בלבד — מנה אף פעם לא נחתכת באמצע."""
    blocks, cur = [], []
    for line in text.splitlines():
        if line.startswith("## ") and cur:
            blocks.append("\n".join(cur)); cur = []
        cur.append(line)
    if cur:
        blocks.append("\n".join(cur))
    if len(blocks) == 1:  # טקסט בלי סימוני קטגוריה
        return [text] if len(text) <= max_len else [
            text[i:i + max_len] for i in range(0, len(text), max_len)]
    chunks, buf = [], ""
    for b in blocks:
        if buf and len(buf) + len(b) > max_len:
            chunks.append(buf); buf = b
        else:
            buf = f"{buf}\n{b}" if buf else b
    if buf:
        chunks.append(buf)
    return chunks


def call(text, model=None, timeout=180):
    body = {"text": text}
    if model:
        body["model"] = model
    req = urllib.request.Request(
        FN_URL, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json",
                 "apikey": ANON, "Authorization": f"Bearer {ANON}"},
        method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def call_retry(text, model=None):
    try:
        return call(text, model)
    except Exception:
        return call(text, model)  # ניסיון שני — כשל רשת בודד לא מפיל ייבוא


def merge(results):
    """מיזוג צ'אנקים: קטגוריה שנחצתה בין שניים מתאחדת, בלי לשכפל מנות."""
    cats, order = {}, []
    for res in results:
        for c in res.get("categories", []):
            name = (c.get("name") or "כללי").strip()
            if name not in cats:
                cats[name] = {"name": name, "course": c.get("course", "other"),
                              "subtitle": c.get("subtitle"), "dishes": []}
                order.append(name)
            seen = {d["name"] for d in cats[name]["dishes"]}
            for d in c.get("dishes", []):
                if d.get("name") and d["name"] not in seen:
                    cats[name]["dishes"].append(d); seen.add(d["name"])
    out = [cats[n] for n in order]
    # ממיינים לפי סדר הגשה רק כשהיו כמה צ'אנקים — טקסט אחד רציף שומר על סדר המקור
    if len(results) > 1:
        out.sort(key=lambda c: COURSE_RANK.get(c.get("course"), 6))
    return out


FLAG_LABEL = {"allergens": "אלרגנים", "pregnancy": "רגישות בהריון",
              "pitfalls": "מוקשים", "kashrut": "כשרות"}


def render(categories):
    lines, dishes, flagged = [], 0, 0
    for c in categories:
        lines.append(f"\n## {c['name']}")
        if c.get("subtitle"):
            lines.append(f"   {c['subtitle']}")
        for d in c.get("dishes", []):
            dishes += 1
            price = f"— ₪{d['price']}" if d.get("price") is not None else "— (אין מחיר)"
            lines.append(f"\n{d['name']} {price}")
            if d.get("description"):
                lines.append(f"   {d['description']}")
            if d.get("ingredients"):
                lines.append(f"   מרכיבים: {', '.join(d['ingredients'])}")
            parts = [f"{FLAG_LABEL[k]}: {', '.join(d[k])}"
                     for k in ("allergens", "pregnancy", "pitfalls", "kashrut")
                     if d.get(k)]
            if parts:
                flagged += 1
                lines.append("   ⚠ " + " · ".join(parts) + "   [הצעה — לאימות מול המסעדה]")
    return "\n".join(lines), dishes, flagged


def main():
    ap = argparse.ArgumentParser(description="קליטת תפריט מטקסט")
    ap.add_argument("input", help="נתיב לקובץ טקסט, כתובת URL, או - לקריאה מ-stdin")
    ap.add_argument("--json", help="שמירת התפריט המובנה ל-JSON")
    ap.add_argument("--model", help="haiku (ברירת מחדל) | sonnet | opus")
    args = ap.parse_args()

    if args.input == "-":
        text = sys.stdin.read()
    elif args.input.startswith(("http://", "https://")):
        try:
            text = page_to_text(args.input)
        except Exception as e:
            sys.exit(f"לא הצלחתי לקרוא את הדף ({e}).\n"
                     "אם האתר מוגן/מרונדר ב-JS — צלמו מסך והשתמשו במסלול התמונות.")
        print(f"נקראו {len(text)} תווים מהדף.", file=sys.stderr)
    else:
        text = open(args.input, encoding="utf-8").read()
    text = text.strip()
    if len(text) < 80:
        sys.exit("הדף חזר כמעט ריק — כנראה הגנת בוטים / באנר עוגיות / רינדור JS. "
                 "עברו לצילום מסך.")

    chunks = split_chunks(text)
    print(f"מפענח {len(text)} תווים ב-{len(chunks)} חלקים…", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=min(6, len(chunks))) as ex:
        results = list(ex.map(lambda c: call_retry(c, args.model), chunks))

    cats = merge(results)
    body, dishes, flagged = render(cats)
    questions = [q for r in results for q in r.get("questions", [])]
    notes = [n for r in results for n in r.get("generalNotes", [])]

    print(body)
    print(f"\n{'=' * 46}\nסה\"כ {dishes} מנות ב-{len(cats)} קטגוריות · "
          f"{flagged} מנות עם סימון אזהרה")
    if notes:
        print("\nדגשים כלליים מהתפריט:")
        for n in notes:
            print(f"  • {n}")
    if questions:
        print("\n❓ לא היה ברור — כדאי לשאול את המסעדה:")
        for q in questions:
            print(f"  • {q.get('question')}")
    print("\n⚠ האלרגנים הם הצעה שנגזרה מהטקסט בלבד. חובה לאמת מול המסעדה לפני "
          "שהצוות לומד אותם.")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump({"categories": cats, "generalNotes": notes,
                       "questions": questions}, f, ensure_ascii=False, indent=2)
        print(f"\nנשמר: {args.json}", file=sys.stderr)


if __name__ == "__main__":
    main()
