#!/usr/bin/env python3
"""Generate OpenScience onboarding four-panel comic assets with Bianxie GPT-Image-2."""

from __future__ import annotations

import base64
import argparse
import json
import os
import urllib.error
import urllib.request
from collections import deque
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "packages" / "desktop" / "src" / "renderer" / "assets" / "onboarding"
RAW_DIR = REPO_ROOT / "tmp" / "imagegen" / "openscience-onboarding"

BIANXIE_BASE_URL = "https://api.bianxie.ai/v1"
MODEL = "gpt-image-2"
SIZE = "1536x1024"
QUALITY = "medium"
KEY = (0, 255, 0)

FONT_CANDIDATES = {
    "zh": [
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ],
    "en": [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ],
}

PANEL_RECTS = [
    (36, 25, 753, 502),
    (782, 25, 1500, 502),
    (36, 522, 753, 994),
    (782, 522, 1500, 994),
]

CAPTION_TEXT = {
    "zh": [
        ("科学研究模式", "数据 · 代码 · 图表 · Artifact"),
        ("医学循证模式", "指南 · 试验 · 原文锚点"),
        ("目标模式", "目标 · 里程碑 · 任务"),
        ("知识沉淀模式", "SOP · 经验 · 技能"),
    ],
    "en": [
        ("Scientific Research", "Data · Code · Figure · Artifact"),
        ("Medical Evidence", "Guidelines · Trials · Anchors"),
        ("Goal Mode", "Goals · Milestones · Tasks"),
        ("Knowledge Deposition", "SOPs · Notes · Skills"),
    ],
}


PROMPT = """
Use case: illustration-story.
Asset type: OpenScience onboarding four-panel comic base art.
Primary request: Create a polished four-panel comic illustration explaining four OpenScience work modes, with NO readable text, NO letters, NO numbers, NO speech bubble text, and NO watermark.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background outside the panels for later background removal; do not use #00ff00 anywhere inside the artwork.
Composition: a 2x2 grid of rounded rectangular white paper panels with subtle ink outlines and generous margins. Leave a clean empty lower band inside each panel for deterministic UI captions to be overlaid by React.
Panel 1: scientific research mode, a scientist at a desk connects local data, code, a chart, and a research artifact board.
Panel 2: medical evidence mode, a clinician compares guideline papers, trial evidence, and source anchors.
Panel 3: goal mode, a researcher turns a large target into smaller checkmarked milestones on a calm planning board.
Panel 4: knowledge deposition mode, a lab team turns notes and SOP pages into reusable skill cards.
Style/medium: warm hand-drawn editorial comic, black and gray linework with restrained amber, sage, and blue-gray accents, sophisticated and friendly, transparent-ready cutout.
Constraints: no text, no logos, no brand marks, no watermark; crisp panel boundaries; no cast shadow outside the panels; outer background must be one uniform #00ff00 color.
Avoid: fake letters, tiny unreadable labels, UI screenshots, neon sci-fi, purple gradients, mascot characters.
""".strip()


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def call_bianxie(prompt: str, api_key: str) -> Image.Image:
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "size": SIZE,
        "quality": QUALITY,
        "n": 1,
    }
    req = urllib.request.Request(
        f"{BIANXIE_BASE_URL}/images/generations",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:1600]
        raise RuntimeError(f"Bianxie image generation failed: HTTP {exc.code}: {detail}") from exc

    item = data.get("data", [{}])[0]
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
    elif item.get("url"):
        with urllib.request.urlopen(item["url"], timeout=180) as resp:
            raw = resp.read()
    else:
        raise RuntimeError(f"Unexpected image response: {data}")
    return Image.open(BytesIO(raw)).convert("RGBA")


def remove_green_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    background = Image.new("L", rgba.size, 0)
    background_pixels = background.load()

    def is_chroma_green(x: int, y: int) -> bool:
        r, g, b, _a = pixels[x, y]
        return g > 120 and g > r + 38 and g > b + 38 and (g > 168 or (r < 112 and b < 112))

    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        if is_chroma_green(x, 0):
            queue.append((x, 0))
        if is_chroma_green(x, height - 1):
            queue.append((x, height - 1))
    for y in range(height):
        if is_chroma_green(0, y):
            queue.append((0, y))
        if is_chroma_green(width - 1, y):
            queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if background_pixels[x, y] or not is_chroma_green(x, y):
            continue
        background_pixels[x, y] = 255
        if x > 0:
            queue.append((x - 1, y))
        if x < width - 1:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y < height - 1:
            queue.append((x, y + 1))

    expanded = background.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.45))
    original_alpha = rgba.getchannel("A")
    rgba.putalpha(Image.composite(Image.new("L", rgba.size, 0), original_alpha, expanded))
    cleaned = rgba.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = cleaned[x, y]
            if a < 8 or (a < 160 and g > 120 and g > r + 38 and g > b + 38):
                cleaned[x, y] = (255, 255, 255, 0)
    return rgba


def load_font(locale: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES[locale]:
        path = Path(candidate)
        if not path.exists():
            continue
        try:
            return ImageFont.truetype(str(path), size)
        except OSError:
            continue
    return ImageFont.load_default()


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    left, _top, right, _bottom = draw.textbbox((0, 0), text, font=font)
    return right - left


def draw_locale_text(image: Image.Image, locale: str) -> Image.Image:
    canvas = image.convert("RGBA")
    overlay = Image.new("RGBA", canvas.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)
    title_font = load_font(locale, 34 if locale == "zh" else 32)
    subtitle_font = load_font(locale, 20 if locale == "zh" else 19)

    for (x0, y0, x1, y1), (title, subtitle) in zip(PANEL_RECTS, CAPTION_TEXT[locale]):
        band_top = y1 - 88
        title_x = x0 + 48
        title_y = band_top + 12
        subtitle_y = title_y + 38
        highlight_width = min(text_width(draw, title, title_font) + 18, x1 - title_x - 48)
        draw.rounded_rectangle(
            (title_x - 5, title_y + 20, title_x + highlight_width, title_y + 37),
            radius=8,
            fill=(244, 214, 126, 120),
        )
        draw.text((title_x, title_y), title, fill=(23, 25, 29, 255), font=title_font)
        draw.text((title_x, subtitle_y), subtitle, fill=(86, 94, 106, 255), font=subtitle_font)

    return Image.alpha_composite(canvas, overlay)


def build_asset(source: Image.Image, locale: str) -> Image.Image:
    cleaned = remove_green_background(source)
    return draw_locale_text(cleaned, locale)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reuse-source",
        action="store_true",
        help="Reuse existing GPT-Image-2 source PNGs from tmp/imagegen instead of calling the image API.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_env_file(Path("/Users/yixuan/files/safe_deepscientist/.env"))
    api_key = os.environ.get("BIANXIE_API_KEY")
    if not api_key and not args.reuse_source:
        raise SystemExit("BIANXIE_API_KEY is not set")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    jobs = {
        "zh": "Chinese OpenScience onboarding comic base art; keep visual symbols culturally neutral and leave caption bands empty.",
        "en": "English OpenScience onboarding comic base art; keep visual symbols culturally neutral and leave caption bands empty.",
    }
    for locale, suffix in jobs.items():
        raw_path = RAW_DIR / f"onboarding-modes-comic-{locale}-source.png"
        final_path = OUT_DIR / f"onboarding-modes-comic-{locale}.png"
        if args.reuse_source:
            print(f"Reusing {raw_path}...")
            source = Image.open(raw_path).convert("RGBA")
        else:
            print(f"Generating {locale} onboarding comic with {MODEL}...")
            source = call_bianxie(f"{PROMPT}\nLocale variant note: {suffix}", api_key or "")
            source.save(raw_path)
        build_asset(source, locale).save(final_path)
        print(f"Wrote {final_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
