#!/usr/bin/env python3
"""
Generate DeepOrganiser download-server page icons with Bianxie gpt-image-2.

Raw 2x2 sheets and prompts are saved under output/imagegen/deeporganiser-server-icons.
Final transparent 128x128 PNG icons are saved under
server/DeepOrganiserServer/public/icons/generated so the update/download site is
self-contained.
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
OUT_ROOT = REPO_ROOT / "output" / "imagegen" / "deeporganiser-server-icons"
RAW_DIR = OUT_ROOT / "raw"
CUT_DIR = OUT_ROOT / "cut"
FINAL_DIR = REPO_ROOT / "server" / "DeepOrganiserServer" / "public" / "icons" / "generated"

BIANXIE_BASE_URL = "https://api.bianxie.ai/v1"
MODEL = "gpt-image-2"
SHEET_SIZE = "1024x1024"
FINAL_SIZE = 128


@dataclass(frozen=True)
class IconSpec:
    filename: str
    concept: str
    detail: str
    avoid: str = ""


@dataclass(frozen=True)
class SheetSpec:
    slug: str
    theme: str
    icons: tuple[IconSpec, ...]


def icon(filename: str, concept: str, detail: str, avoid: str = "") -> IconSpec:
    return IconSpec(filename=filename, concept=concept, detail=detail, avoid=avoid)


SHEETS: tuple[SheetSpec, ...] = (
    SheetSpec(
        "origin-nav-status-01",
        "DeepOrganiser download page navigation and version status",
        (
            icon("origin-nav-download", "download area", "a chunky open tray receiving one rounded package card with a downward arrow shape, no text"),
            icon("origin-nav-workspace", "workspace area", "a simple workbench with three small task cards arranged neatly and a gold pin dot"),
            icon("origin-nav-update", "update feed area", "two rounded circular arrows around a tiny package card, one muted gold checkpoint dot"),
            icon("origin-version-status", "release status", "a small glowing status seed inside a circular ring with two gold spark dashes"),
        ),
    ),
    SheetSpec(
        "origin-downloads-01",
        "download buttons and platform cards",
        (
            icon("origin-primary-download", "primary download action", "a confident ticket-shaped installer card sliding into a download tray with gold motion dashes"),
            icon("origin-platform-macos", "macOS platform", "a slim laptop silhouette with a small round gold badge, no Apple logo or brand mark", "Apple logo"),
            icon("origin-platform-windows", "Windows platform", "four soft rounded window panes as an abstract desktop screen, no Microsoft logo"),
            icon("origin-platform-linux", "Linux platform", "a compact terminal workstation with a tiny gear tucked beside it, no mascot, no command text", "penguin mascot"),
        ),
    ),
    SheetSpec(
        "origin-panels-01",
        "right-side globe panels and update metadata",
        (
            icon("origin-collab-project", "collaboration project", "two connected task cards orbiting a small project folder, with one gold connector dot"),
            icon("origin-auto-update", "automatic update", "a package card inside a circular refresh path with two gold ticks"),
            icon("origin-update-url", "update URL", "a cable plug connecting a small globe dot to a rounded metadata card"),
            icon("origin-original-link", "open original page", "a task card with a small corner arrow leaving the upper right edge, no brand mark"),
        ),
    ),
    SheetSpec(
        "origin-workflow-01",
        "workflow cards and update channel list",
        (
            icon("origin-workflow-bind", "bind collaboration space", "a plug line connecting two rounded nodes with a gold confirmation dot"),
            icon("origin-workflow-organize", "organize project progress", "a folder holding a stack of task cards with one gold bookmark tab"),
            icon("origin-workflow-update", "continuous updates", "a small installer package riding around a circular arrow path"),
            icon("origin-channel-feed", "metadata update channel", "a tiny server stack sending a dotted feed line into a package card, no readable text"),
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
    icon_lines = []
    for position, spec in zip(positions, sheet.icons):
        avoid = f" Avoid {spec.avoid}." if spec.avoid else ""
        icon_lines.append(f"- {position}: {spec.concept}; draw {spec.detail}.{avoid}")
    return textwrap.dedent(
        f"""
        Use case: logo-brand
        Asset type: 2x2 UI icon sprite sheet for a DeepOrganiser desktop download website
        Primary request: Create four separate hand-drawn cartoon line icons in one 2x2 grid for {sheet.theme}.
        Style/medium: playful minimal line-art icon set matching handmade DeepScientist UI icons; thick rounded marker strokes; slightly imperfect but polished; simple open interiors; cute, clear, calm, and professional; no realistic rendering.
        Composition/framing: square 1024x1024 sheet split into four equal quadrants; one centered icon per quadrant; generous padding around each icon; no overlap between quadrants; every silhouette must feel distinct and readable at 16px.
        Scene/backdrop: perfectly flat pure white background (#ffffff), no shadows, no gradients, no texture, no paper grain, no separator lines between quadrants.
        Palette: {palette}; use gold only as small accent dots, tiny sparkles, seals, tabs, or motion highlights.
        Icon assignments:
        {chr(10).join(icon_lines)}
        Constraints: no text, no letters, no numbers, no labels, no watermark, no UI screenshot, no brand logos, no QR code, no gradients, no drop shadows, no transparent background in the generated source, no colored square app-icon background. Keep every icon centered, simple, and recognizable at small UI sizes. For dark-mode sheets, use off-white strokes instead of black strokes and do not fill icon bodies with dark colors.
        Avoid: thin strokes, photorealism, emoji style, generic stock icons, brand marks, overly complex details, identical card/document shapes across all icons.
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
    return icon_image.crop((max(0, x0 - pad), max(0, y0 - pad), min(icon_image.width, x1 + pad), min(icon_image.height, y1 + pad)))


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
    cols = 8
    cell_w, cell_h = 172, 136
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
        out.alpha_composite(tile, (x + 30, y + 4))
        draw.text((x + 6, y + 118), path.name[:28], fill=label_color)
    overview = OUT_ROOT / name
    overview.parent.mkdir(parents=True, exist_ok=True)
    out.save(overview)
    return overview


def write_manifest() -> Path:
    rows = [
        "# DeepOrganiser Server Icon Prompts",
        "",
        "Style anchor: thick rounded hand-drawn marker strokes, charcoal/light off-white line art, white or open interiors, muted gold accents, pure white generated source background, no text, no numbers, no logos.",
        "",
        "| Sheet | Position | File | Concept | Detail |",
        "|---|---|---|---|---|",
    ]
    positions = ("top-left", "top-right", "bottom-left", "bottom-right")
    for sheet in SHEETS:
        for position, spec in zip(positions, sheet.icons):
            rows.append(f"| `{sheet.slug}` | {position} | `{spec.filename}` | {spec.concept} | {spec.detail} |")
    path = OUT_ROOT / "deeporganiser-server-icon-prompts.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return path


def parse_sheets(value: str) -> set[str]:
    all_slugs = {sheet.slug for sheet in SHEETS}
    if value == "all":
        return all_slugs
    selected = {item.strip() for item in value.split(",") if item.strip()}
    unknown = selected - all_slugs
    if unknown:
        raise SystemExit(f"Unknown sheets: {', '.join(sorted(unknown))}")
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default="/Users/yixuan/files/safe_deepscientist/.env")
    parser.add_argument("--sheets", default="all")
    parser.add_argument("--variants", default="light")
    parser.add_argument("--skip-existing-raw", action="store_true")
    parser.add_argument("--process-only", action="store_true")
    parser.add_argument("--sleep", type=float, default=1.2)
    args = parser.parse_args()

    load_env(Path(args.env))
    api_key = os.environ.get("BIANXIE_API_KEY")
    if not api_key and not args.process_only:
        raise SystemExit("BIANXIE_API_KEY is not set")

    wanted_sheets = parse_sheets(args.sheets)
    variants = [item.strip() for item in args.variants.split(",") if item.strip()]
    if any(variant not in {"light", "dark"} for variant in variants):
        raise SystemExit("--variants must contain only light,dark")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    prompt_manifest = write_manifest()
    generated: list[Path] = []

    for sheet in SHEETS:
        if sheet.slug not in wanted_sheets:
            continue
        for variant in variants:
            dark = variant == "dark"
            raw_path = RAW_DIR / f"{sheet.slug}-{variant}.png"
            prompt_path = RAW_DIR / f"{sheet.slug}-{variant}.prompt.txt"
            prompt = icon_prompt(sheet, dark)
            prompt_path.write_text(prompt, encoding="utf-8")
            if args.process_only or (args.skip_existing_raw and raw_path.exists()):
                if not raw_path.exists():
                    raise SystemExit(f"Missing raw sheet: {raw_path}")
                source = Image.open(raw_path).convert("RGBA")
            else:
                print(f"Generating {sheet.slug} {variant}...", flush=True)
                source = call_bianxie(prompt, api_key or "")
                source.save(raw_path)
                time.sleep(args.sleep)
            generated.extend(process_sheet(sheet, source, dark))

    light_files = sorted([path for path in generated if not path.name.endswith("-dark.png")])
    dark_files = sorted([path for path in generated if path.name.endswith("-dark.png")])
    if light_files:
        print("overview", make_overview(light_files, "deeporganiser-server-icons-light-overview.png", dark=False))
    if dark_files:
        print("overview", make_overview(dark_files, "deeporganiser-server-icons-dark-overview.png", dark=True))
    print("manifest", prompt_manifest)
    print(f"wrote {len(generated)} final icons")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
