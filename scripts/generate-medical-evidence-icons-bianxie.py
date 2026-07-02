#!/usr/bin/env python3
"""
Generate medical evidence UI icon sheets with Bianxie gpt-image-2, then cut
each 2x2 sheet into transparent 128x128 PNG assets.

Raw sheets and prompts are kept under output/imagegen/medical-evidence-icons.
Final light/dark PNG assets are written to renderer/assets/icons/generated.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import textwrap
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO_ROOT / "output" / "imagegen" / "medical-evidence-icons"
RAW_DIR = OUT_ROOT / "raw"
CUT_DIR = OUT_ROOT / "cut"
FINAL_DIR = REPO_ROOT / "packages" / "desktop" / "src" / "renderer" / "assets" / "icons" / "generated"

BIANXIE_BASE_URL = "https://api.bianxie.ai/v1"
MODEL = "gpt-image-2"
SHEET_SIZE = "1024x1024"
FINAL_SIZE = 128


@dataclass(frozen=True)
class IconSpec:
    filename: str
    title: str
    concept: str
    detail: str
    allow_text: str = ""
    avoid: str = ""


@dataclass(frozen=True)
class SheetSpec:
    slug: str
    theme: str
    icons: tuple[IconSpec, ...]


def icon(filename: str, title: str, concept: str, detail: str, allow_text: str = "", avoid: str = "") -> IconSpec:
    return IconSpec(filename=filename, title=title, concept=concept, detail=detail, allow_text=allow_text, avoid=avoid)


SHEETS: tuple[SheetSpec, ...] = (
    SheetSpec(
        "medical-evidence-flow",
        "medical evidence collection and retrieval states",
        (
            icon(
                "medical-evidence-basket",
                "evidence basket",
                "main evidence collection basket",
                "one shallow tray with one single paper page standing inside it, plus one tiny gold dot on the tray lip",
            ),
            icon(
                "medical-evidence-search",
                "evidence search",
                "retrieval-augmented literature search",
                "one magnifying glass over one blank paper page, with only one short line on the page",
            ),
            icon(
                "medical-evidence-scan",
                "evidence scan",
                "reading the full text",
                "one paper page crossed by one clean horizontal scan line, with a tiny gold dot at the line end",
            ),
            icon(
                "medical-evidence-complete",
                "evidence complete",
                "completed evidence result",
                "one shallow tray with one paper page and one simple check mark in the upper right",
            ),
        ),
    ),
    SheetSpec(
        "medical-evidence-sources",
        "medical evidence source types",
        (
            icon(
                "medical-evidence-paper",
                "paper result",
                "ordinary research paper result",
                "one paper page with a folded corner, one short top line, and one gold citation underline",
            ),
            icon(
                "medical-evidence-guideline",
                "guideline",
                "clinical guideline booklet",
                "one simple closed handbook with a bookmark tab, no page clutter",
            ),
            icon(
                "medical-evidence-drug-label",
                "drug label",
                "medication prescribing information leaflet",
                "one folded leaflet with a small capsule accent, only two fold lines",
            ),
            icon(
                "medical-evidence-regulatory",
                "regulatory file",
                "FDA or regulatory document",
                "one document page with one simple round stamp mark in the lower corner",
                avoid="real FDA logos or readable agency text",
            ),
        ),
    ),
    SheetSpec(
        "medical-evidence-study-designs",
        "clinical evidence study designs and planning",
        (
            icon(
                "medical-evidence-rct",
                "RCT evidence",
                "randomized controlled trial evidence",
                "one center dot splitting into two short curved arrows, ending at two small participant dots",
            ),
            icon(
                "medical-evidence-review",
                "systematic review",
                "systematic review or meta-analysis",
                "one summary table sheet with three simple rows and one gold header cell",
            ),
            icon(
                "medical-evidence-trial",
                "clinical trial",
                "clinical trial registration card",
                "one rounded registration card with four blank square cells and one gold dot",
                avoid="numbers, IDs, or readable registry text",
            ),
            icon(
                "medical-evidence-pico",
                "PICO plan",
                "PICO search plan",
                "four plain rounded boxes in a 2x2 grid, each box containing exactly one simple uppercase letter",
                allow_text="P I C O",
                avoid="extra letters or words beyond P, I, C, O",
            ),
        ),
    ),
    SheetSpec(
        "medical-evidence-grade",
        "evidence grading and decision balance",
        (
            icon(
                "medical-evidence-grade-high",
                "high grade evidence",
                "high certainty evidence grade",
                "three rounded vertical bars, all three filled with muted gold",
            ),
            icon(
                "medical-evidence-grade-mid",
                "moderate grade evidence",
                "moderate certainty evidence grade",
                "three rounded vertical bars, exactly two filled with muted gold and one left open",
            ),
            icon(
                "medical-evidence-grade-low",
                "low grade evidence",
                "low certainty evidence grade",
                "three rounded vertical bars, exactly one filled with muted gold and two left open",
            ),
            icon(
                "medical-evidence-weigh",
                "evidence weigh",
                "evidence tradeoff balance",
                "one very simple balance scale with two small pans and a gold dot on one pan",
            ),
        ),
    ),
    SheetSpec(
        "medical-evidence-trace",
        "evidence adoption, downgrading, and traceability",
        (
            icon(
                "medical-evidence-adopt",
                "adopted evidence",
                "adopted evidence",
                "one paper page with one bold check mark beside it",
            ),
            icon(
                "medical-evidence-downgrade",
                "downgraded evidence",
                "downgraded evidence",
                "one paper page with one simple dashed downward arrow beside it",
            ),
            icon(
                "medical-evidence-anchor",
                "evidence anchor",
                "line-level evidence anchoring",
                "one location pin touching one short paragraph line",
            ),
            icon(
                "medical-evidence-citation",
                "traceable citation",
                "traceable citation label",
                "one small rounded citation tag reading exactly [E1], with one tiny link loop",
                allow_text="[E1]",
                avoid="extra citation labels, extra numbers, or bibliography text",
            ),
        ),
    ),
)


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def chunked(items: list[Path], size: int) -> Iterable[list[Path]]:
    for idx in range(0, len(items), size):
        yield items[idx : idx + size]


def icon_prompt(sheet: SheetSpec, dark: bool) -> str:
    positions = ("top-left", "top-right", "bottom-left", "bottom-right")
    palette = (
        "dark-mode variant: warm off-white thick outline (#f4f0e6), transparent or very subtle empty interiors, muted gold accents (#c4a33f); no black fill, no charcoal fill, no dark solid body"
        if dark
        else "light-mode variant: thick charcoal-black outline (#171717), white interiors or open interiors, muted gold accents (#c4a33f)"
    )
    icon_lines: list[str] = []
    for position, spec in zip(positions, sheet.icons):
        text_rule = f" Allowed visible text for this icon only: {spec.allow_text}." if spec.allow_text else " No visible text."
        avoid = f" Avoid {spec.avoid}." if spec.avoid else ""
        icon_lines.append(f"- {position}: {spec.concept}; draw {spec.detail}.{text_rule}{avoid}")

    return textwrap.dedent(
        f"""
        Use case: medical-evidence-ui-icons
        Asset type: 2x2 UI icon sprite sheet for a desktop app
        Primary request: Create four separate hand-drawn cartoon line icons in one 2x2 grid for {sheet.theme}.
        Style/medium: extremely simple hand-drawn line-art icon set matching the handmade DeepScientist icon style in the user's references; thick rounded marker strokes; slightly imperfect but polished; simple open interiors; cute, clear, and professional; medical research UI tone, not hospital clip art.
        Simplicity rule: each icon should have one main object and at most one small helper symbol. Use very few lines. Prefer a bold, direct silhouette over a scene. No stacked scenes, no complex interiors, no decorative spark bursts.
        Composition/framing: square 1024x1024 sheet split into four equal quadrants; one large centered icon per quadrant; generous padding around every icon; no overlap between quadrants; each silhouette must be distinct at 16px and polished at 128px.
        Scene/backdrop: perfectly flat pure white background (#ffffff), no shadows, no gradients, no texture, no paper grain, no border lines between quadrants.
        Palette: {palette}; use gold only for one small accent dot, one underline, or filled evidence bars. Keep the overall icon mostly monochrome.
        Icon assignments:
        {chr(10).join(icon_lines)}
        Global constraints: no watermarks, no UI screenshot, no brand logos, no caduceus, no real hospital or regulatory agency marks, no gradients, no drop shadows, no transparent background in the generated source, no colored square app-icon background. Do not add any text except the explicitly allowed short tokens for PICO and [E1]. Keep every icon visually distinct, centered, simple, and recognizable at small UI sizes. For dark-mode sheets, use off-white strokes instead of black strokes and do not fill icon bodies with dark colors.
        Avoid: thin strokes, photorealism, emoji style, generic stock medical icons, overly complex details, tiny unreadable paragraphs, repeated identical document shapes, multiple overlapping papers unless explicitly requested, spark decorations, busy table grids.
        """
    ).strip() + "\n"


def call_bianxie(prompt: str, api_key: str) -> Image.Image:
    payload = {"model": MODEL, "prompt": prompt, "size": SHEET_SIZE, "n": 1}
    req = urllib.request.Request(
        f"{BIANXIE_BASE_URL}/images/generations",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as resp:
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
        raise RuntimeError(f"Unexpected image response keys: {list(data.keys())}, item: {list(item.keys())}")
    return Image.open(BytesIO(raw)).convert("RGBA")


def remove_white_background(icon_image: Image.Image) -> Image.Image:
    rgba = icon_image.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out_pixels = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            low = min(r, g, b)
            high = max(r, g, b)
            chroma = high - low
            if low >= 247 and chroma <= 8:
                alpha = 0
            elif low >= 238 and chroma <= 14:
                alpha = int(max(0, min(255, (247 - low) * 28)))
            else:
                alpha = a
            out_pixels[x, y] = (r, g, b, min(a, alpha))

    alpha = out.getchannel("A").filter(ImageFilter.GaussianBlur(0.12))
    out.putalpha(alpha)
    return out


def crop_to_content(icon_image: Image.Image) -> Image.Image:
    bbox = icon_image.getchannel("A").getbbox()
    if not bbox:
        return icon_image
    x0, y0, x1, y1 = bbox
    pad = max(10, int(max(x1 - x0, y1 - y0) * 0.12))
    return icon_image.crop(
        (max(0, x0 - pad), max(0, y0 - pad), min(icon_image.width, x1 + pad), min(icon_image.height, y1 + pad))
    )


def fit_to_final(icon_image: Image.Image) -> Image.Image:
    cropped = crop_to_content(icon_image)
    cropped.thumbnail((112, 112), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (FINAL_SIZE, FINAL_SIZE), (0, 0, 0, 0))
    out.alpha_composite(cropped, ((FINAL_SIZE - cropped.width) // 2, (FINAL_SIZE - cropped.height) // 2))
    return out


def quadrant_boxes(size: tuple[int, int]) -> list[tuple[int, int, int, int]]:
    w, h = size
    return [(0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2), (0, h // 2, w // 2, h), (w // 2, h // 2, w, h)]


def process_sheet(sheet: SheetSpec, source: Image.Image, dark: bool) -> list[Path]:
    suffix = "-dark" if dark else ""
    paths: list[Path] = []
    for spec, box in zip(sheet.icons, quadrant_boxes(source.size)):
        quad = source.crop(box)
        transparent = remove_white_background(quad)
        final = fit_to_final(transparent)
        cut_path = CUT_DIR / f"{spec.filename}{suffix}.png"
        final_path = FINAL_DIR / f"{spec.filename}{suffix}.png"
        cut_path.parent.mkdir(parents=True, exist_ok=True)
        FINAL_DIR.mkdir(parents=True, exist_ok=True)
        final.save(cut_path)
        final.save(final_path)
        paths.append(final_path)
    return paths


def make_overview(files: list[Path], name: str, dark: bool = False) -> Path:
    cols = 5
    cell_w, cell_h = 188, 146
    rows = (len(files) + cols - 1) // cols
    bg_color = (28, 31, 36, 255) if dark else (255, 255, 255, 255)
    label_color = (245, 241, 230, 255) if dark else (31, 41, 55, 255)
    tile_color = (42, 46, 54, 255) if dark else (246, 247, 249, 255)
    out = Image.new("RGBA", (cols * cell_w, rows * cell_h), bg_color)
    draw = ImageDraw.Draw(out)
    for i, path in enumerate(files):
        icon_image = Image.open(path).convert("RGBA").resize((96, 96), Image.Resampling.LANCZOS)
        x = (i % cols) * cell_w
        y = (i // cols) * cell_h
        tile = Image.new("RGBA", (112, 112), tile_color)
        tile.alpha_composite(icon_image, (8, 8))
        out.alpha_composite(tile, (x + 38, y + 4))
        draw.text((x + 6, y + 120), path.name[:30], fill=label_color)
    overview = OUT_ROOT / name
    overview.parent.mkdir(parents=True, exist_ok=True)
    out.save(overview)
    return overview


def parse_sheet_filter(value: str | None) -> set[str]:
    known = {sheet.slug for sheet in SHEETS}
    if not value or value == "all":
        return known
    wanted = {item.strip() for item in value.split(",") if item.strip()}
    unknown = wanted - known
    if unknown:
        raise SystemExit(f"Unknown sheet(s): {', '.join(sorted(unknown))}. Known: {', '.join(sorted(known))}")
    return wanted


def parse_themes(value: str) -> tuple[bool, ...]:
    if value == "both":
        return (False, True)
    if value == "light":
        return (False,)
    if value == "dark":
        return (True,)
    raise SystemExit("--themes must be one of: light, dark, both")


def verify_assets(files: list[Path]) -> None:
    failures: list[str] = []
    for path in files:
        image = Image.open(path).convert("RGBA")
        if image.size != (FINAL_SIZE, FINAL_SIZE):
            failures.append(f"{path.name}: expected {FINAL_SIZE}x{FINAL_SIZE}, got {image.size}")
        alpha = image.getchannel("A")
        bbox = alpha.getbbox()
        if bbox is None:
            failures.append(f"{path.name}: transparent/empty image")
            continue
        opaque_pixels = sum(1 for value in alpha.getdata() if value > 12)
        if opaque_pixels < 650:
            failures.append(f"{path.name}: too little visible content ({opaque_pixels} pixels)")
        if opaque_pixels > 13800:
            failures.append(f"{path.name}: too much visible content ({opaque_pixels} pixels), likely background not removed")
    if failures:
        raise RuntimeError("Asset verification failed:\n" + "\n".join(failures))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default="/Users/yixuan/files/safe_deepscientist/.env")
    parser.add_argument("--sheets", default="all", help="Comma-separated sheet slugs or all")
    parser.add_argument("--themes", default="both", choices=("light", "dark", "both"))
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--skip-generate", action="store_true", help="Process existing raw sheets instead of calling the image API")
    args = parser.parse_args()

    load_env(Path(args.env))
    api_key = os.environ.get("BIANXIE_API_KEY")
    if not api_key and not args.skip_generate:
        raise SystemExit("BIANXIE_API_KEY is not set")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    CUT_DIR.mkdir(parents=True, exist_ok=True)
    FINAL_DIR.mkdir(parents=True, exist_ok=True)

    wanted_sheets = parse_sheet_filter(args.sheets)
    themes = parse_themes(args.themes)
    written: list[Path] = []

    for sheet in SHEETS:
        if sheet.slug not in wanted_sheets:
            continue
        for dark in themes:
            theme_name = "dark" if dark else "light"
            prompt = icon_prompt(sheet, dark=dark)
            prompt_path = RAW_DIR / f"{sheet.slug}-{theme_name}.prompt.txt"
            raw_path = RAW_DIR / f"{sheet.slug}-{theme_name}.png"
            prompt_path.write_text(prompt)
            if args.skip_generate:
                if not raw_path.exists():
                    raise FileNotFoundError(f"Missing raw sheet for --skip-generate: {raw_path}")
                source = Image.open(raw_path).convert("RGBA")
                print(f"Processing existing {raw_path.name}", flush=True)
            else:
                print(f"Generating {raw_path.name}", flush=True)
                source = call_bianxie(prompt, api_key or "")
                source.save(raw_path)
                time.sleep(args.sleep)
            written.extend(process_sheet(sheet, source, dark=dark))

    verify_assets(written)
    light_files = sorted(
        path for path in FINAL_DIR.glob("medical-evidence-*.png") if not path.name.endswith("-dark.png") and "logo" not in path.name
    )
    dark_files = sorted(path for path in FINAL_DIR.glob("medical-evidence-*-dark.png") if "logo" not in path.name)
    if light_files:
        print("overview", make_overview(light_files, "medical-evidence-icons-light-overview.png"))
    if dark_files:
        print("overview", make_overview(dark_files, "medical-evidence-icons-dark-overview.png", dark=True))
    print("generated", len(written), "assets")
    for path in sorted(written):
        print("asset", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
