#!/usr/bin/env python3
"""
Generate DeepScientist UI icon sheets with Bianxie gpt-image-2, then cut each
2x2 sheet into transparent 128x128 PNG assets.

This is intentionally project-local and deterministic in post-processing. The
AI output is only used for the drawn icon artwork; naming, slicing, alpha, and
final asset sizes are controlled here.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO_ROOT / "output" / "imagegen" / "new-icons"
RAW_DIR = OUT_ROOT / "raw"
CUT_DIR = OUT_ROOT / "cut"
FINAL_DIR = REPO_ROOT / "packages" / "desktop" / "src" / "renderer" / "assets" / "icons" / "generated"

BIANXIE_BASE_URL = "https://api.bianxie.ai/v1"
MODEL = "gpt-image-2"
SHEET_SIZE = "1024x1024"
FINAL_SIZE = 128


@dataclass(frozen=True)
class IconSpec:
    key: str
    filename: str
    family: str
    concept: str
    detail: str


@dataclass(frozen=True)
class SheetSpec:
    slug: str
    icons: tuple[IconSpec, ...]


STATUS_ICONS = [
    IconSpec("test", "agent-status-test", "status", "test run", "a clipboard with a checkmark and a tiny test tube accent"),
    IconSpec("build", "agent-status-build", "status", "build/package", "a small stack of blocks with a compact gear"),
    IconSpec("install", "agent-status-install", "status", "install dependencies", "a package box with a downward arrow tucked into it"),
    IconSpec("server", "agent-status-server", "status", "local server", "a tiny server rack with a small signal dot"),
    IconSpec("permission", "agent-status-permission", "status", "permission request", "a shield with a small approval check"),
    IconSpec("inspect", "agent-status-inspect", "status", "inspect changes", "a magnifying glass over two diff-like lines"),
]

OUTPUT_ICONS = [
    IconSpec("database", "agent-output-database", "output", "database file", "stacked database disks with one gold data dot"),
    IconSpec("notebook", "agent-output-notebook", "output", "notebook file", "an open notebook with two code cells and a side spiral"),
    IconSpec("text", "agent-output-text", "output", "plain text or log", "a simple paper sheet with three horizontal text lines"),
    IconSpec("config", "agent-output-config", "output", "configuration file", "a document with small sliders and a gear dot"),
    IconSpec("archive", "agent-output-archive", "output", "archive file", "a zippered folder or compressed box"),
    IconSpec("audio", "agent-output-audio", "output", "audio file", "a waveform strip with a small music note"),
    IconSpec("video", "agent-output-video", "output", "video file", "a rounded video frame with a play triangle"),
    IconSpec("table", "agent-output-table", "output", "csv or tsv table", "a grid table sheet, distinct from Excel, with simple rows and columns"),
    IconSpec("download", "agent-output-download", "output", "download action", "a downward arrow landing into a tray"),
]

SENDBOX_ICONS = [
    IconSpec("send", "sendbox-send", "sendbox", "send message", "a paper plane or arrow leaving a rounded input line"),
    IconSpec("stop", "sendbox-stop", "sendbox", "stop running", "a rounded square stop symbol inside a soft control circle"),
    IconSpec("attach", "sendbox-attach", "sendbox", "attach file", "a paperclip hugging a small document"),
    IconSpec("slashCommand", "sendbox-slash-command", "sendbox", "slash command", "a forward slash with a tiny command menu card"),
    IconSpec("mentionFile", "sendbox-mention-file", "sendbox", "mention file", "an @ symbol next to a small document"),
    IconSpec("microphone", "sendbox-microphone", "sendbox", "microphone", "a compact studio microphone with a small base"),
    IconSpec("voiceTranscribe", "sendbox-voice-transcribe", "sendbox", "voice transcription", "a microphone with three waveform bars flowing into text lines"),
    IconSpec("workspace", "sendbox-workspace", "sendbox", "workspace project", "a small project folder with connected nodes"),
    IconSpec("quote", "sendbox-quote", "sendbox", "reply quote", "two quotation marks inside a small speech bubble"),
    IconSpec("domSnippet", "sendbox-dom-snippet", "sendbox", "DOM snippet", "a browser element outline with a tiny cursor tag"),
]

SETTINGS_ICONS = [
    IconSpec("theme", "settings-theme", "settings", "theme appearance", "three overlapping theme swatches with a small sparkle"),
    IconSpec("fontSize", "settings-font-size", "settings", "font size", "a large A and small A with a ruler tick"),
    IconSpec("scale", "settings-scale", "settings", "interface scale", "a zoom slider with plus and minus dots"),
    IconSpec("motion", "settings-motion", "settings", "motion preference", "a small timeline curve with a pause mark"),
]


def chunked(items: list[IconSpec], size: int) -> Iterable[list[IconSpec]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def build_sheets() -> list[SheetSpec]:
    sheets: list[SheetSpec] = []
    groups = [
        ("status", STATUS_ICONS),
        ("output", OUTPUT_ICONS),
        ("sendbox", SENDBOX_ICONS),
        ("settings", SETTINGS_ICONS),
    ]
    for group_name, icons in groups:
        for idx, group in enumerate(chunked(icons, 4), start=1):
            sheets.append(SheetSpec(f"{group_name}-{idx:02d}", tuple(group)))
    return sheets


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def icon_prompt(sheet: SheetSpec, dark: bool) -> str:
    positions = ["top-left", "top-right", "bottom-left", "bottom-right"]
    palette = (
        "dark-mode variant: warm off-white thick outline (#f4f0e6), transparent or very subtle empty interiors, "
        "muted gold accents (#c4a33f), no black fill, no charcoal fill, no dark solid body"
        if dark
        else "light-mode variant: thick charcoal-black outline (#171717), white interior fills, muted gold accents (#c4a33f)"
    )
    icon_lines = []
    for pos, icon in zip(positions, sheet.icons):
        icon_lines.append(f"- {pos}: {icon.concept}; draw {icon.detail}.")
    unused = positions[len(sheet.icons) :]
    for pos in unused:
        icon_lines.append(f"- {pos}: leave a simple harmless placeholder dot only, no detailed icon.")

    return f"""Use case: logo-brand
Asset type: 2x2 UI icon sprite sheet for a desktop app
Primary request: Create four separate hand-drawn cartoon line icons in one 2x2 grid.
Style/medium: playful minimal line-art icon set, matching a handmade DeepScientist UI icon style; thick rounded marker strokes; slightly imperfect but polished; simple open interiors; no realistic rendering.
Composition/framing: square 1024x1024 sheet split into four equal quadrants; one centered icon per quadrant; generous padding around each icon; no overlap between quadrants.
Scene/backdrop: perfectly flat pure white background (#ffffff), no shadows, no gradients, no texture, no paper grain.
Palette: {palette}; use gold only as small accent dots, small sparkles, or tiny highlights.
Icon assignments:
{chr(10).join(icon_lines)}
Constraints: no text, no letters, no numbers, no labels, no watermark, no UI screenshot, no gradients, no drop shadows, no transparent background in the generated source, no colored square app-icon background, keep every icon visually distinct and recognizable at 16px. For dark-mode sheets, use off-white strokes instead of black strokes and do not fill the icon bodies with dark colors.
Avoid: thin strokes, photorealism, emoji style, Microsoft logo marks, brand logos, overly complex details, identical document shapes for all icons.
"""


def call_bianxie(prompt: str, api_key: str) -> Image.Image:
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "size": SHEET_SIZE,
        "n": 1,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BIANXIE_BASE_URL}/images/generations",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:1200]
        raise RuntimeError(f"Bianxie image generation failed: HTTP {exc.code}: {detail}") from exc

    item = data.get("data", [{}])[0]
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
    elif item.get("url"):
        with urllib.request.urlopen(item["url"], timeout=120) as resp:
            raw = resp.read()
    else:
        raise RuntimeError(f"Unexpected image response: {data.keys()} / item keys {item.keys()}")
    return Image.open(BytesIO(raw)).convert("RGBA")


def remove_white_background(icon: Image.Image, dark: bool) -> Image.Image:
    rgba = icon.convert("RGBA")
    # Whiteness distance. Keep intentional interior whites only if they are
    # enclosed by dark/off-white strokes; this simple pass is best for icons
    # generated on flat white with generous padding.
    pix = rgba.load()
    w, h = rgba.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out_pix = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if a == 0:
                continue
            # Pure/near-white sheet background goes transparent. In dark icons,
            # off-white strokes are below this threshold and remain visible.
            whiteness = min(r, g, b)
            chroma = max(r, g, b) - min(r, g, b)
            if whiteness >= 246 and chroma <= 8:
                alpha = 0
            elif whiteness >= 238 and chroma <= 12:
                alpha = int(max(0, min(255, (246 - whiteness) * 32)))
            else:
                alpha = a
            out_pix[x, y] = (r, g, b, min(a, alpha))

    # Light cleanup for antialiased white fringe.
    alpha = out.getchannel("A").filter(ImageFilter.GaussianBlur(0.15))
    out.putalpha(alpha)
    return out


def crop_to_content(icon: Image.Image) -> Image.Image:
    alpha = icon.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return icon
    x0, y0, x1, y1 = bbox
    pad = max(10, int(max(x1 - x0, y1 - y0) * 0.12))
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(icon.width, x1 + pad)
    y1 = min(icon.height, y1 + pad)
    return icon.crop((x0, y0, x1, y1))


def fit_to_128(icon: Image.Image) -> Image.Image:
    icon = crop_to_content(icon)
    icon.thumbnail((112, 112), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (FINAL_SIZE, FINAL_SIZE), (0, 0, 0, 0))
    x = (FINAL_SIZE - icon.width) // 2
    y = (FINAL_SIZE - icon.height) // 2
    out.alpha_composite(icon, (x, y))
    return out


def quadrant_boxes(size: tuple[int, int]) -> list[tuple[int, int, int, int]]:
    w, h = size
    return [
        (0, 0, w // 2, h // 2),
        (w // 2, 0, w, h // 2),
        (0, h // 2, w // 2, h),
        (w // 2, h // 2, w, h),
    ]


def process_sheet(sheet: SheetSpec, source: Image.Image, dark: bool) -> list[Path]:
    suffix = "-dark" if dark else ""
    paths: list[Path] = []
    boxes = quadrant_boxes(source.size)
    for icon, box in zip(sheet.icons, boxes):
        quad = source.crop(box)
        transparent = remove_white_background(quad, dark=dark)
        final = fit_to_128(transparent)
        cut_path = CUT_DIR / f"{icon.filename}{suffix}.png"
        final_path = FINAL_DIR / f"{icon.filename}{suffix}.png"
        cut_path.parent.mkdir(parents=True, exist_ok=True)
        FINAL_DIR.mkdir(parents=True, exist_ok=True)
        final.save(cut_path)
        final.save(final_path)
        paths.append(final_path)
    return paths


def make_overview(files: list[Path], name: str) -> Path:
    thumbs = []
    for p in files:
        im = Image.open(p).convert("RGBA").resize((96, 96), Image.Resampling.LANCZOS)
        bg = Image.new("RGBA", im.size, (246, 246, 246, 255))
        bg.alpha_composite(im)
        thumbs.append((p.name, bg))
    cols = 6
    cell_w, cell_h = 170, 128
    rows = (len(thumbs) + cols - 1) // cols
    out = Image.new("RGBA", (cols * cell_w, rows * cell_h), (255, 255, 255, 255))
    try:
        from PIL import ImageDraw
        draw = ImageDraw.Draw(out)
    except Exception:
        draw = None
    for i, (label, im) in enumerate(thumbs):
        x = (i % cols) * cell_w
        y = (i // cols) * cell_h
        out.alpha_composite(im, (x + 37, y + 4))
        if draw:
            draw.text((x + 6, y + 104), label[:26], fill=(0, 0, 0, 255))
    path = OUT_ROOT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path)
    return path


def parse_sheet_filter(value: str | None, sheets: list[SheetSpec]) -> set[str]:
    if not value or value == "all":
        return {s.slug for s in sheets}
    wanted = {x.strip() for x in value.split(",") if x.strip()}
    known = {s.slug for s in sheets}
    unknown = wanted - known
    if unknown:
        raise SystemExit(f"Unknown sheet(s): {', '.join(sorted(unknown))}. Known: {', '.join(sorted(known))}")
    return wanted


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default="/Users/yixuan/files/safe_deepscientist/.env")
    parser.add_argument("--sheets", default="all", help="Comma-separated sheet slugs, or all")
    parser.add_argument("--variants", default="light,dark", help="light,dark")
    parser.add_argument("--skip-existing-raw", action="store_true")
    parser.add_argument("--process-only", action="store_true")
    parser.add_argument("--sleep", type=float, default=1.0)
    args = parser.parse_args()

    load_env(Path(args.env))
    api_key = os.environ.get("BIANXIE_API_KEY")
    if not api_key and not args.process_only:
        raise SystemExit("BIANXIE_API_KEY is not set")

    sheets = build_sheets()
    wanted_sheets = parse_sheet_filter(args.sheets, sheets)
    variants = [v.strip() for v in args.variants.split(",") if v.strip()]
    for v in variants:
        if v not in {"light", "dark"}:
            raise SystemExit("--variants must contain only light,dark")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    generated_files: list[Path] = []

    for sheet in sheets:
        if sheet.slug not in wanted_sheets:
            continue
        for variant in variants:
            dark = variant == "dark"
            raw_path = RAW_DIR / f"{sheet.slug}-{variant}.png"
            prompt_path = RAW_DIR / f"{sheet.slug}-{variant}.prompt.txt"
            prompt = icon_prompt(sheet, dark)
            prompt_path.write_text(prompt)
            if args.process_only or (args.skip_existing_raw and raw_path.exists()):
                if not raw_path.exists():
                    raise SystemExit(f"Missing raw sheet for process-only: {raw_path}")
                source = Image.open(raw_path).convert("RGBA")
            else:
                print(f"Generating {sheet.slug} {variant}...", flush=True)
                source = call_bianxie(prompt, api_key or "")
                source.save(raw_path)
                time.sleep(args.sleep)
            generated_files.extend(process_sheet(sheet, source, dark))

    light_files = [p for p in generated_files if not p.name.endswith("-dark.png")]
    dark_files = [p for p in generated_files if p.name.endswith("-dark.png")]
    if light_files:
        print("overview", make_overview(light_files, "new-icons-light-overview.png"))
    if dark_files:
        print("overview", make_overview(dark_files, "new-icons-dark-overview.png"))
    print(f"wrote {len(generated_files)} final icons")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
