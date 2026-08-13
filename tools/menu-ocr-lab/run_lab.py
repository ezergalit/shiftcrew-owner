#!/usr/bin/env python3
"""The measurement loop: rendered pages -> deployed edge function -> score vs ground truth.

Usage:
  python3 run_lab.py transcribe [--model opus|sonnet|sonnet45|haiku] [--density 1.0] [--maxdim 2576] [--shuffle]
  python3 run_lab.py full       [...same flags]   # transcribe -> structure -> score categories

Scoring is against ground_truth.json, which was read out of the restaurant's own site —
the model never sees it; it exists so "did this change help" is a number, not a feeling.
"""

import argparse, base64, difflib, io, json, os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
FN_URL = "https://huwcyedlbcrugpbdcsdo.supabase.co/functions/v1/menu-ai-parse"


def anon_key():
    envp = os.path.join(HERE, "..", "..", ".env")
    for line in open(envp):
        if line.startswith("VITE_SUPABASE_ANON_KEY"):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("anon key not found in .env")


def call_fn(payload, key, timeout=600):
    req = urllib.request.Request(
        FN_URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}"},
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        out = json.loads(r.read())
    out["_elapsed_s"] = round(time.time() - t0, 1)
    return out


def downscale(path, maxdim):
    """Reproduce the owner app's client-side downscale exactly (JPEG, quality by maxdim era)."""
    from PIL import Image
    img = Image.open(path)
    scale = min(1.0, maxdim / max(img.size))
    if scale < 1.0:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    quality = 92 if maxdim > 1600 else 85
    img.convert("RGB").save(buf, "JPEG", quality=quality)
    return {"media_type": "image/jpeg", "data": base64.b64encode(buf.getvalue()).decode()}


# ---------------- scoring --------------------------------------------------------------

def norm(s):
    s = str(s or "")
    s = re.sub(r"[׳״'’‘ְ-ׇ\"“”]", "", s)   # geresh/quotes/niqqud
    s = re.sub(r"[–—-]", " ", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def flat_dishes(gt):
    out = []
    for c in gt["categories"]:
        for d in c["dishes"]:
            out.append({"name": d["name"], "price": d["price"], "category": c["name"], "desc": d["description"]})
    return out


def sim(a, b):
    r = difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()
    # Mixed-direction names can be transcribed in either visual order; if the sorted token
    # multisets match, the reading is faithful regardless of order.
    if r < 1.0 and sorted(norm(a).split()) == sorted(norm(b).split()):
        return 1.0
    return r


def best_match(name, pool, cutoff=0.75):
    best, score = None, 0.0
    for cand in pool:
        r = sim(name, cand)
        if r > score:
            best, score = cand, r
    return (best, score) if score >= cutoff else (None, score)


def score_transcript(transcript, gt):
    """How much of the real menu made it into the text, and how much text is invented."""
    lines = [l.strip() for l in transcript.split("\n") if l.strip() and not l.startswith("---")]
    # Strip markers and the trailing price so name similarity measures the name alone.
    dish_lines = [re.sub(r"\s*\d{2,4}\s*$", "", re.sub(r"^\s*(?:##|~|>|\?\?)\s*", "", l)) for l in lines]
    raw_lines = [re.sub(r"^\s*(?:##|~|>|\?\?)\s*", "", l) for l in lines]
    truth = flat_dishes(gt)

    found, name_errors, price_errors = 0, [], []
    for d in truth:
        m, sc = best_match(d["name"], dish_lines, cutoff=0.7)
        if m is None:
            name_errors.append({"missing": d["name"], "closest": max(dish_lines, key=lambda l: difflib.SequenceMatcher(None, norm(d["name"]), norm(l)).ratio(), default="")[:60]})
            continue
        found += 1
        if sc < 0.98:
            name_errors.append({"expected": d["name"], "got": m[:80], "sim": round(sc, 3)})
        # price on the same line? (look it up in the unstripped copy of the matched line)
        raw = raw_lines[dish_lines.index(m)] if m in dish_lines else m
        prices = re.findall(r"\b(\d{2,4})\b", raw)
        if d["price"] is not None and str(d["price"]) not in prices:
            price_errors.append({"dish": d["name"], "expected": d["price"], "line": m[:80]})

    cat_found = sum(1 for c in gt["categories"] if best_match(c["name"], dish_lines, cutoff=0.8)[0])
    return {
        "dishes_total": len(truth),
        "dishes_found": found,
        "categories_total": len(gt["categories"]),
        "categories_found": cat_found,
        "name_mismatches": [e for e in name_errors if "got" in e],
        "missing": [e for e in name_errors if "missing" in e],
        "price_errors": price_errors,
    }


def score_structure(result, gt, manifest=None):
    truth = flat_dishes(gt)
    got = []
    for c in result.get("categories", []):
        for d in c.get("dishes", []):
            got.append({"name": d.get("name"), "price": d.get("price"), "category": c.get("name")})

    matched, name_errs, price_errs, cat_errs = 0, [], [], []
    got_names = [g["name"] for g in got]
    used = set()
    for d in truth:
        m, sc = best_match(d["name"], got_names, cutoff=0.7)
        if m is None:
            name_errs.append({"missing": d["name"]})
            continue
        used.add(norm(m))
        matched += 1
        g = next(x for x in got if x["name"] == m)
        if sc < 0.98:
            name_errs.append({"expected": d["name"], "got": m, "sim": round(sc, 3)})
        if g["price"] != d["price"]:
            price_errs.append({"dish": d["name"], "expected": d["price"], "got": g["price"]})
        gm, gsc = best_match(d["category"], [g["category"]], cutoff=0.75)
        if gm is None:
            cat_errs.append({"dish": d["name"], "expected": d["category"], "got": g["category"]})

    phantoms = [g["name"] for g in got if norm(g["name"]) not in used]
    # category order sanity: starters before mains before desserts
    order = [c.get("course") for c in result.get("categories", [])]
    rank = {"starters": 0, "mains": 1, "sides": 2, "desserts": 3, "drinks": 4, "alcohol": 5, "other": 9}
    ranks = [rank.get(c, 9) for c in order if c != "other"]
    order_ok = ranks == sorted(ranks)

    return {
        "dishes_total": len(truth), "dishes_matched": matched,
        "phantom_dishes": phantoms,
        "name_mismatches": [e for e in name_errs if "got" in e],
        "missing": [e for e in name_errs if "missing" in e],
        "price_errors": price_errs,
        "category_errors": cat_errs,
        "course_order": order, "course_order_ok": order_ok,
        "questions": result.get("questions", []),
    }


def summarize(tag, s):
    total = s["dishes_total"]
    found = s.get("dishes_found", s.get("dishes_matched", 0))
    print(f"\n===== {tag} =====")
    print(f"dishes: {found}/{total}  missing: {len(s['missing'])}  name-mismatch: {len(s['name_mismatches'])}  price-err: {len(s['price_errors'])}", end="")
    if "phantom_dishes" in s:
        print(f"  phantoms: {len(s['phantom_dishes'])}  cat-err: {len(s['category_errors'])}  order-ok: {s['course_order_ok']}")
    else:
        print(f"  categories: {s['categories_found']}/{s['categories_total']}")
    for e in s["missing"][:8]:
        print(f"  MISSING  {e['missing']}" + (f"   closest: {e['closest']}" if "closest" in e else ""))
    for e in s["name_mismatches"][:10]:
        print(f"  NAME     {e['expected']}  ->  {e['got']}  ({e['sim']})")
    for e in s["price_errors"][:10]:
        print(f"  PRICE    {e['dish']}: expected {e['expected']}, {e.get('got', e.get('line'))}")
    for p in s.get("phantom_dishes", [])[:8]:
        print(f"  PHANTOM  {p}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["transcribe", "full"])
    ap.add_argument("--model", default="opus")
    ap.add_argument("--density", type=float, default=1.0)
    ap.add_argument("--maxdim", type=int, default=2576)
    ap.add_argument("--shuffle", action="store_true")
    ap.add_argument("--system", help="path to a prompt file to override via devNonce")
    ap.add_argument("--save", help="save raw responses under this tag")
    args = ap.parse_args()

    sys.path.insert(0, HERE)
    from render import render
    gt = json.load(open(os.path.join(HERE, "ground_truth.json")))
    render(gt, density=args.density, shuffle=args.shuffle)

    pages_dir = os.path.join(HERE, "pages")
    files = sorted(f for f in os.listdir(pages_dir) if f.endswith(".png"))
    images = [downscale(os.path.join(pages_dir, f), args.maxdim) for f in files]
    kb = sum(len(im["data"]) for im in images) * 3 // 4 // 1024
    print(f"pages={len(images)} maxdim={args.maxdim} density={args.density} shuffled={args.shuffle} payload={kb}KB model={args.model}")

    key = anon_key()

    # One call per image, in parallel — the finding of iteration 3: a whole dense menu in
    # one call runs into the edge-function gateway timeout (504 at ~150s). Per-image calls
    # are each fast, run concurrently, and one bad page no longer sinks the import. The
    # structure step is where ordering/merging happens anyway.
    from concurrent.futures import ThreadPoolExecutor

    def one(i_im):
        i, im = i_im
        payload = {"mode": "transcribe", "images": [im], "model": args.model}
        if args.system:
            payload["devNonce"] = "lab-7f3c9a21-menu-ocr"
            payload["system"] = open(args.system).read()
        try:
            r = call_fn(payload, key)
        except Exception as e:
            return i, {"error": str(e)}
        return i, r

    with ThreadPoolExecutor(max_workers=4) as ex:
        results = dict(ex.map(one, enumerate(images)))

    parts, all_corr, all_unreadable, worst = [], [], [], 0.0
    for i in range(len(images)):
        r = results[i]
        if "error" in r:
            print(f"  page {i+1}: ERROR {r['error']}")
            all_unreadable.append(i + 1)
            continue
        worst = max(worst, r["_elapsed_s"])
        all_corr += r.get("corrections", [])
        if r.get("unreadable"):
            all_unreadable.append(i + 1)
            continue
        parts.append(f"--- \u05ea\u05de\u05d5\u05e0\u05d4 {i+1} ---\n" + r["transcript"])
    t = {"transcript": "\n".join(parts), "corrections": all_corr, "unreadable": all_unreadable,
         "uncertain": sum(p.count("[?]") for p in parts), "_elapsed_s": worst}
    print(f"transcribe: slowest page {t['_elapsed_s']}s  corrections={len(t['corrections'])}  uncertain={t['uncertain']}  unreadable={t['unreadable']}")
    ts = score_transcript(t["transcript"], gt)
    summarize(f"TRANSCRIBE model={args.model} maxdim={args.maxdim} density={args.density}", ts)

    tag = args.save or f"{args.model}-{args.maxdim}-{args.density}"
    out_dir = os.path.join(HERE, "runs")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{tag}.transcript.txt"), "w") as f:
        f.write(t["transcript"])

    if args.stage == "full":
        s = call_fn({"mode": "structure", "text": t["transcript"]}, key)
        if "error" in s:
            print("STRUCTURE ERROR:", s["error"])
            sys.exit(1)
        print(f"structure: {s['_elapsed_s']}s")
        ss = score_structure(s, gt)
        summarize("STRUCTURE (haiku)", ss)
        with open(os.path.join(out_dir, f"{tag}.structure.json"), "w") as f:
            json.dump(s, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
