#!/usr/bin/env python3
"""Render the ground-truth menu as page images, the way a printed menu actually looks.

Why synthesise pages instead of using the owner's photos: the photos are one sample with
one density, and the whole question is how accuracy moves with page density and pixel
size. Rendering lets me sweep that. The layout below copies the real menu's shape — bold
dish name on the right, grey description under it, price alone on the left, category
heading with an unpriced subtitle line — because those are the shapes the parser has to
tell apart.

Pages are rendered at print resolution and downscaled by the harness exactly the way the
owner app downscales a phone photo, so what reaches the model is what production sends.
"""

import json, os, random, sys
from PIL import Image, ImageDraw, ImageFont
from bidi.algorithm import get_display

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = "/System/Library/Fonts/Supplemental"
REG = os.path.join(FONT_DIR, "Arial Unicode.ttf")
BOLD = os.path.join(FONT_DIR, "Arial Bold.ttf")

# A4 at 300dpi — a printed menu page.
PAGE_W, PAGE_H = 2480, 3508
MARGIN = 180


def shape(text):
    """Apply the bidi algorithm so mixed Hebrew/English lines read correctly when drawn."""
    return get_display(text)


def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


class Page:
    def __init__(self, scale):
        self.scale = scale
        self.img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
        self.d = ImageDraw.Draw(self.img)
        self.y = MARGIN
        self.items = []

    def room(self, h):
        return self.y + h < PAGE_H - MARGIN


def render(gt, density=1.0, out_dir=None, shuffle=False, seed=7):
    """density scales the type down; 1.0 is a comfortable printed menu, 0.6 is a cramped
    one-page-fits-everything menu — the case that actually breaks OCR."""
    out_dir = out_dir or os.path.join(HERE, "pages")
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        if f.endswith((".png", ".json")):
            os.remove(os.path.join(out_dir, f))

    s = density
    f_cat = ImageFont.truetype(BOLD, int(64 * s))
    f_sub = ImageFont.truetype(REG, int(38 * s))
    f_name = ImageFont.truetype(BOLD, int(46 * s))
    f_desc = ImageFont.truetype(REG, int(34 * s))
    f_price = ImageFont.truetype(REG, int(44 * s))

    right = PAGE_W - MARGIN
    left = MARGIN
    price_col = left + int(140 * s)
    text_w = right - price_col - int(60 * s)

    pages, page = [], Page(s)
    manifest = []

    def newpage():
        nonlocal page
        pages.append(page)
        page = Page(s)

    for cat in gt["categories"]:
        # Keep a heading with at least its first dish; a heading orphaned at the bottom of
        # a page is a different (and rarer) problem than the one being measured.
        if not page.room(int(320 * s)):
            newpage()
        page.d.text((right, page.y), shape(cat["name"]), font=f_cat, fill="black", anchor="ra")
        page.y += int(90 * s)
        if cat.get("subtitle"):
            page.d.text((right, page.y), shape(cat["subtitle"]), font=f_sub, fill="#666", anchor="ra")
            page.y += int(64 * s)
        page.items.append({"type": "category", "name": cat["name"]})

        for dish in cat["dishes"]:
            desc_lines = wrap(page.d, dish["description"], f_desc, text_w)
            need = int(58 * s) + len(desc_lines) * int(46 * s) + int(34 * s)
            if not page.room(need):
                newpage()
                # Repeat the heading on the continuation page, as printed menus do.
                page.d.text((right, page.y), shape(cat["name"] + " (המשך)"), font=f_cat, fill="black", anchor="ra")
                page.y += int(90 * s)
                page.items.append({"type": "category", "name": cat["name"]})

            page.d.text((right, page.y), shape(dish["name"]), font=f_name, fill="black", anchor="ra")
            page.d.text((left, page.y + int(6 * s)), str(dish["price"]), font=f_price, fill="black", anchor="la")
            page.y += int(58 * s)
            for ln in desc_lines:
                page.d.text((right, page.y), shape(ln), font=f_desc, fill="#555", anchor="ra")
                page.y += int(46 * s)
            page.y += int(34 * s)
            page.items.append({"type": "dish", "name": dish["name"], "category": cat["name"]})

    pages.append(page)

    order = list(range(len(pages)))
    if shuffle:
        random.Random(seed).shuffle(order)

    for out_i, src_i in enumerate(order, 1):
        p = pages[src_i]
        path = os.path.join(out_dir, f"page{out_i:02d}.png")
        p.img.save(path)
        manifest.append({"file": os.path.basename(path), "true_page": src_i + 1, "items": p.items})

    meta = {"density": density, "shuffled": shuffle, "page_count": len(pages), "pages": manifest}
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    return meta


if __name__ == "__main__":
    gt = json.load(open(os.path.join(HERE, "ground_truth.json")))
    density = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
    shuffle = "--shuffle" in sys.argv
    m = render(gt, density=density, shuffle=shuffle)
    print(f"density={density} shuffled={shuffle} pages={m['page_count']}")
    for p in m["pages"]:
        n = sum(1 for i in p["items"] if i["type"] == "dish")
        print(f"  {p['file']}  (true page {p['true_page']}) — {n} dishes")
