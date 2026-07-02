#!/usr/bin/env python3
"""
Generate DeepScientist collaboration/Lark UI icon sheets with Bianxie
gpt-image-2, then cut each 2x2 sheet into transparent 128x128 PNG assets.

The generation is intentionally separated from React integration:
- raw 1024 sheets and prompts live under output/imagegen/collab-icons
- final light/dark PNG assets live under renderer/assets/icons/generated
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
OUT_ROOT = REPO_ROOT / "output" / "imagegen" / "collab-icons"
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
    avoid: str = ""


@dataclass(frozen=True)
class SheetSpec:
    slug: str
    theme: str
    icons: tuple[IconSpec, ...]


def icon(filename: str, title: str, concept: str, detail: str, avoid: str = "") -> IconSpec:
    return IconSpec(filename=filename, title=title, concept=concept, detail=detail, avoid=avoid)


SHEETS: tuple[SheetSpec, ...] = (
    SheetSpec(
        "collab-nav-01",
        "collaboration sidebar entries",
        (
            icon("collab-message", "messages", "collaboration message page", "two friendly overlapping speech bubbles, one small gold signal dot near the upper corner"),
            icon("collab-calendar", "calendar", "collaboration calendar page", "a flip calendar page with two binder rings and a tiny gold tab, no written date or numerals", "date numbers"),
            icon("collab-docs", "cloud documents", "collaboration cloud document page", "three loose document sheets with one gold bookmark corner, visibly different from task cards"),
            icon("collab-task-page", "task page", "collaboration task page", "a rounded checklist board with two simple check rows and a gold status dot"),
        ),
    ),
    SheetSpec(
        "collab-project-01",
        "project tree and agent task structure",
        (
            icon("collab-project", "project", "project workspace package", "a soft folder holding several small task cards, with a gold spark beside it"),
            icon("collab-tasklist", "task list", "Lark tasklist project", "a fan of stacked horizontal task cards like ticket cards, no numbers, one gold seal dot"),
            icon("collab-agent-inbox", "agent inbox", "agent task inbox", "a small inbox tray receiving one task card with a gold arrival sparkle"),
            icon("collab-leader-agent", "leader agent", "project leader agent", "a cute simple robot head with a tiny flag or crown-like tab, still minimal and not mascot-like"),
        ),
    ),
    SheetSpec(
        "collab-project-02",
        "people and handoff graph",
        (
            icon("collab-sub-agent", "sub agent", "subordinate agent", "a compact robot head connected upward by one curved line to a small task card"),
            icon("collab-human-member", "human member", "human collaborator", "a round human profile silhouette with shoulders and a small gold badge dot"),
            icon("collab-plan-gate", "plan gate", "planning approval gate", "a half-open little gate with a task card waiting in front and a gold check spark"),
            icon("collab-handoff", "handoff", "task handoff and return flow", "two small task cards passing an arrow between them, one card slightly tilted"),
        ),
    ),
    SheetSpec(
        "collab-task-01",
        "task detail modal content areas",
        (
            icon("collab-task-detail", "task detail", "expanded task card", "one large open task card with a header bar and two simple content lines, no text"),
            icon("collab-attachment", "attachment", "file attachment", "a chunky hand-drawn paperclip wrapped around a small document card"),
            icon("collab-image-upload", "image upload", "image attachment upload", "a small rounded image frame with a mountain line and a gold sun dot"),
            icon("collab-comment", "comment thread", "comments and feedback", "a speech bubble with a small return arrow tucked underneath"),
        ),
    ),
    SheetSpec(
        "collab-task-02",
        "task editing properties and actions",
        (
            icon("collab-send-comment", "send comment", "send task comment", "a tiny paper plane leaving a speech bubble, with two gold motion dashes"),
            icon("collab-sync-feedback", "sync feedback", "comment sync loop", "two rounded circular arrows around a task card, one gold dot at the meeting point"),
            icon("collab-due-time", "due time", "task deadline", "a small clock leaning against a task card, no numerals on the clock face", "clock numerals"),
            icon("collab-created-time", "created time", "creation timestamp", "a small rubber-stamp mark above a task card, no readable label or date"),
        ),
    ),
    SheetSpec(
        "collab-task-03",
        "task ownership and secondary actions",
        (
            icon("collab-assignee", "assignee", "task owner and followers", "two profile nodes connected by a short line above a small task card"),
            icon("collab-complete", "complete task", "complete action", "a bold circular checkmark with tiny gold celebration marks"),
            icon("collab-reopen", "reopen task", "reopen action", "a circular arrow wrapping around a small task card"),
            icon("collab-open-original", "open original task", "open original task link", "a task card with a small arrow leaving its upper corner, no external brand mark"),
        ),
    ),
    SheetSpec(
        "collab-bind-01",
        "collaboration login and app setup wizard",
        (
            icon("collab-web-login", "web login", "web login by phone scan", "a phone beside a rounded QR-like square made of abstract blocks, no scannable QR code"),
            icon("collab-create-app", "create app", "create bound app", "a small app cube made from simple blocks with a gold sparkle on top"),
            icon("collab-auth", "authorize", "authorize automation app", "a small key entering a rounded permission card with one gold dot"),
            icon("collab-profile-select", "profile selection", "choose automation profile", "three identity cards fanned out, each with abstract avatar circles, no names"),
        ),
    ),
    SheetSpec(
        "collab-bind-02",
        "automation binding and local runtime",
        (
            icon("collab-channel-save", "save channel", "save to channel connection", "a plug line connecting a task card to a small rounded channel box"),
            icon("collab-connected", "connected", "successful connection", "two rounded nodes connected by a thick curved line with a gold dot in the center"),
            icon("collab-runtime", "local runtime", "local automation runtime", "a compact terminal window with a tiny gear tucked in the corner, no command text"),
            icon("collab-api-binding", "api binding", "API binding", "a cable plug docking into a small cloud-shaped port, with one gold verification dot"),
        ),
    ),
    SheetSpec(
        "collab-agent-01",
        "agent automation settings",
        (
            icon("collab-listener", "message listener", "event listener", "a small radar dish or listening bowl emitting two curved signal waves"),
            icon("collab-task-automation", "task automation", "automatic task flow", "a task card moving along a curved track with two gold motion dashes"),
            icon("collab-prompt-manager", "prompt manager", "project agent prompt editor", "a feather pen writing on a small scroll-like card, no text"),
            icon("collab-sop-skill", "SOP skill", "SOP and skills toolbox", "a small toolbox with a task card and a tiny star-shaped gold tool"),
        ),
    ),
    SheetSpec(
        "collab-memory-01",
        "memory and notification flow",
        (
            icon("collab-memory", "project memory", "project memory from comments", "a small brain-like loop made from simple strokes sitting on a task card, not realistic"),
            icon("collab-notification", "notification", "supervisor notification", "a round bell with a return-flow arrow and a gold alert dot"),
            icon("collab-refresh-sync", "refresh sync", "refresh and check status", "two refresh arrows around a tiny status dot, compact and circular"),
            icon("collab-secret-key", "secret key", "manual app secret entry", "a small key and hidden card with dotted cover marks, no actual dots forming text"),
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
        else "light-mode variant: thick charcoal-black outline (#171717), white interior fills or empty interiors, muted gold accents (#c4a33f)"
    )
    icon_lines = []
    for position, spec in zip(positions, sheet.icons):
        avoid = f" Avoid {spec.avoid}." if spec.avoid else ""
        icon_lines.append(f"- {position}: {spec.concept}; draw {spec.detail}.{avoid}")
    return textwrap.dedent(
        f"""
        Use case: logo-brand
        Asset type: 2x2 UI icon sprite sheet for a desktop app
        Primary request: Create four separate hand-drawn cartoon line icons in one 2x2 grid for {sheet.theme}.
        Style/medium: playful minimal line-art icon set matching the handmade DeepScientist UI icon style shown in the user's references; thick rounded marker strokes; slightly imperfect but polished; simple open interiors; cute, clear, and professional; no realistic rendering.
        Composition/framing: square 1024x1024 sheet split into four equal quadrants; one centered icon per quadrant; generous padding around each icon; no overlap between quadrants; each silhouette should feel distinct at 16px.
        Scene/backdrop: perfectly flat pure white background (#ffffff), no shadows, no gradients, no texture, no paper grain, no border lines between quadrants.
        Palette: {palette}; use gold only as small accent dots, small sparkles, seals, or tiny motion highlights.
        Icon assignments:
        {chr(10).join(icon_lines)}
        Constraints: no text, no letters, no numbers, no labels, no watermark, no UI screenshot, no brand logos, no QR code that can scan, no gradients, no drop shadows, no transparent background in the generated source, no colored square app-icon background. Keep every icon visually distinct, centered, simple, and recognizable at small UI sizes. For dark-mode sheets, use off-white strokes instead of black strokes and do not fill icon bodies with dark colors.
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
        "# Collaboration Icon Prompts",
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
    rows.extend(
        [
            "",
            "## Base Prompt Template",
            "",
            "```text",
            "Use case: logo-brand",
            "Asset type: 2x2 UI icon sprite sheet for a desktop app",
            "Primary request: Create four separate hand-drawn cartoon line icons in one 2x2 grid.",
            "Style/medium: playful minimal line-art icon set matching handmade DeepScientist UI icon style; thick rounded marker strokes; slightly imperfect but polished; simple open interiors; cute, clear, and professional.",
            "Scene/backdrop: perfectly flat pure white background (#ffffff), no shadows, no gradients, no texture.",
            "Palette: light-mode uses charcoal black #171717 plus muted gold #c4a33f; dark-mode uses warm off-white #f4f0e6 plus muted gold #c4a33f.",
            "Constraints: no text, no letters, no numbers, no labels, no watermark, no brand logos, no QR code that can scan.",
            "```",
        ]
    )
    path = OUT_ROOT / "collab-icon-prompts.md"
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
    parser.add_argument("--variants", default="light,dark")
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
        print("overview", make_overview(light_files, "collab-icons-light-overview.png", dark=False))
    if dark_files:
        print("overview", make_overview(dark_files, "collab-icons-dark-overview.png", dark=True))
    print("manifest", prompt_manifest)
    print(f"wrote {len(generated)} final icons")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
