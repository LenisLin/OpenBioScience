#!/usr/bin/env python3
"""
Generate OpenScience marketing-site PNG icons with Bianxie gpt-image-2.

Raw 2x2 sheets and prompts are saved under:
  output/imagegen/openscience-site-icons

Final transparent 256x256 PNG icons are saved under:
  server/DeepOrganiserServer/public/icons/openscience-site
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

from PIL import Image, ImageDraw, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO_ROOT / "output" / "imagegen" / "openscience-site-icons"
RAW_DIR = OUT_ROOT / "raw"
CUT_DIR = OUT_ROOT / "cut"
FINAL_DIR = REPO_ROOT / "server" / "DeepOrganiserServer" / "public" / "icons" / "openscience-site"

BIANXIE_BASE_URL = "https://api.bianxie.ai/v1"
MODEL = "gpt-image-2"
SHEET_SIZE = "1024x1024"
FINAL_SIZE = 256


@dataclass(frozen=True)
class IconSpec:
    filename: str
    purpose: str
    concept: str
    detail: str
    accent: str = ""
    avoid: str = ""
    allow_symbol: str = ""


@dataclass(frozen=True)
class SheetSpec:
    slug: str
    theme: str
    icons: tuple[IconSpec, ...]


def icon(
    filename: str,
    purpose: str,
    concept: str,
    detail: str,
    accent: str = "",
    avoid: str = "",
    allow_symbol: str = "",
) -> IconSpec:
    return IconSpec(filename, purpose, concept, detail, accent, avoid, allow_symbol)


ICONS: tuple[IconSpec, ...] = (
    icon(
        "github-star.png",
        "top GitHub star count",
        "open-source star badge",
        "a rounded repository badge with one branch node and one prominent amber star badge",
        avoid="exact GitHub Octocat logo, readable 10K text, brand wordmarks",
        allow_symbol="one star",
    ),
    icon(
        "language-globe.png",
        "language switch",
        "language globe selector",
        "a clean globe with two latitude arcs and a tiny downward chevron hint",
        accent="small graphite-blue globe node is allowed",
        allow_symbol="one tiny downward chevron",
    ),
    icon(
        "download-macos.png",
        "macOS download",
        "macOS installer download",
        "a slim laptop with a command-key-like loop mark on the screen and a small download tray below",
        accent="one amber sparkle near the tray",
        avoid="Apple logo",
        allow_symbol="one downward arrow and simple command-like loop mark",
    ),
    icon(
        "download-windows.png",
        "Windows download",
        "Windows installer download",
        "a desktop window made of four rounded panes with a downward arrow landing into a tray",
        accent="one tiny muted blue pane accent",
        avoid="Microsoft logo",
        allow_symbol="one downward arrow",
    ),
    icon(
        "download-linux.png",
        "Linux download",
        "Linux installer download",
        "a compact terminal tile beside a small package box with a downward arrow",
        accent="one muted sage status dot",
        avoid="penguin mascot or command text",
        allow_symbol="one downward arrow",
    ),
    icon(
        "update-feed.png",
        "auto update feed",
        "automatic update metadata",
        "two circular arrows orbiting a small package/file card",
        accent="two small amber checkpoint dots",
        allow_symbol="two circular arrows",
    ),
    icon(
        "evidence-papers.png",
        "paper evidence",
        "indexed paper evidence",
        "a small stack of paper pages with citation tabs and one tiny magnifier",
        accent="one amber citation tab",
        avoid="readable text",
    ),
    icon(
        "evidence-regulatory.png",
        "regulatory evidence",
        "formal regulatory documents",
        "a formal document stack with one restrained seal and a small check mark",
        accent="muted graphite-blue seal accent",
        avoid="FDA logo, agency marks, readable labels",
        allow_symbol="one check mark",
    ),
    icon(
        "evidence-trials.png",
        "clinical trial evidence",
        "clinical trial registry evidence",
        "a clipboard with two branching trial nodes and one tiny medical plus tucked in a corner",
        accent="very small muted red-orange plus",
        avoid="red cross logo, hospital scene, readable registry numbers",
        allow_symbol="one tiny plus",
    ),
    icon(
        "evidence-abstracts.png",
        "research abstracts",
        "abstract cards indexed at scale",
        "many small abstract cards flowing into one larger index card",
        accent="one amber index dot",
        avoid="readable text or numbers",
    ),
    icon(
        "source-search.png",
        "evidence search",
        "source search over a paper network",
        "a magnifier over three connected paper nodes",
        accent="one amber source node",
    ),
    icon(
        "local-data.png",
        "local data",
        "local files and datasets",
        "a folder containing a tiny CSV-like grid card and a small drive disk",
        accent="one muted sage data dot",
        avoid="letters CSV",
    ),
    icon(
        "code-run.png",
        "code execution",
        "real analysis execution",
        "a code bracket card with a play button and a tiny chart line rising out",
        accent="one amber run dot",
        allow_symbol="one play triangle and simple bracket marks",
        avoid="readable code",
    ),
    icon(
        "figure-output.png",
        "figure output",
        "scientific figure export",
        "a scatter plot panel with three dots and a small exported image corner",
        accent="one amber plotted point",
    ),
    icon(
        "project-record.png",
        "project record",
        "project memory record",
        "a notebook with two file tabs and a thin timeline thread across the bottom",
        accent="one amber timeline dot",
    ),
    icon(
        "artifact-history.png",
        "artifact history",
        "artifact provenance history",
        "three layered artifact cards connected by a thin history line",
        accent="one amber provenance node",
    ),
    icon(
        "team-handoff.png",
        "team handoff",
        "collaboration handoff",
        "two simple researcher cards passing one report card between them",
        accent="one amber handoff dot",
        avoid="faces, detailed people, company logos",
    ),
    icon(
        "review-check.png",
        "review check",
        "review before shipping",
        "a shield with a check mark hovering over two small citation cards",
        accent="one amber verified dot",
        allow_symbol="one check mark",
    ),
    icon(
        "citation-anchor.png",
        "citation anchor",
        "traceable citation anchor",
        "an anchor pin linking a quote-corner card to a source document",
        accent="one amber link point",
        avoid="readable quote text",
    ),
    icon(
        "claim-boundary.png",
        "claim boundary",
        "safe claim boundary",
        "a conclusion card bracketed by two margin boundary lines",
        accent="one muted amber boundary tick",
        allow_symbol="simple bracket marks only",
        avoid="readable conclusion text",
    ),
    icon(
        "medical-evidence-report.png",
        "medical evidence report",
        "medical evidence report output",
        "a medical evidence report page with four small ladder blocks, citation chips, and a cautious check mark",
        accent="tiny muted red-orange medical dot and amber citation chips",
        avoid="red cross logo, readable PICO text, hospital scene",
        allow_symbol="one check mark",
    ),
    icon(
        "pico-framework.png",
        "PICO framework",
        "PICO structure",
        "four linked rounded blocks arranged as a compact framework grid",
        accent="one amber connector dot",
        avoid="letters P I C O or readable labels",
    ),
    icon(
        "scientific-research-mode.png",
        "scientific research mode",
        "scientific research mode card",
        "an open research eye-ring containing a tiny data plot and manuscript page",
        accent="one amber discovery ray",
        avoid="complex microscope scene",
    ),
    icon(
        "medical-evidence-mode.png",
        "medical evidence mode",
        "medical evidence mode card",
        "a medical report page resting on a small evidence stack with a cautious check badge",
        accent="tiny muted red-orange medical dot and amber evidence line",
        avoid="red cross logo or caduceus",
        allow_symbol="one check mark",
    ),
    icon(
        "goal-mode.png",
        "goal mode",
        "goal mode card",
        "a target board with three milestone dots connected by one progress thread",
        accent="center amber target dot",
    ),
    icon(
        "knowledge-deposition-mode.png",
        "knowledge deposition mode",
        "knowledge deposition mode card",
        "layered notebook pages with SOP cards tucked inside and one descending amber dot",
        accent="warm brown layer accent is allowed",
        avoid="brain icon, complex bookshelf",
    ),
    icon(
        "literature-synthesis.png",
        "literature synthesis project",
        "literature synthesis",
        "several papers merging into one clean review manuscript",
        accent="one amber merge point",
        avoid="readable text",
    ),
    icon(
        "data-analysis-project.png",
        "data analysis project",
        "data analysis workflow",
        "a dataset grid feeding one code cell and a small chart panel",
        accent="one muted blue data point and one amber chart point",
        avoid="readable code",
    ),
    icon(
        "reviewer-response.png",
        "reviewer response project",
        "reviewer response workflow",
        "a comment bubble beside revision marks and an accepted check badge",
        accent="one amber approval dot",
        allow_symbol="one check mark",
        avoid="readable comment text",
    ),
    icon(
        "status-ready.png",
        "available status",
        "ready release status",
        "a small package card with a clean check badge inside a soft ready ring",
        accent="muted sage-green ready dot",
        allow_symbol="one check mark",
    ),
    icon(
        "status-pending.png",
        "pending status",
        "pending release status",
        "a soft clock hovering over a small package card",
        accent="neutral gray and tiny amber clock dot",
        allow_symbol="simple clock hands",
    ),
    icon(
        "external-link.png",
        "external link",
        "open external page",
        "a small rounded square with an arrow leaving the upper-right corner",
        accent="one amber arrow tip",
        allow_symbol="one arrow",
    ),
    icon(
        "close-small.png",
        "close button",
        "small close affordance",
        "a simple light circular close mark with balanced strokes",
        avoid="heavy warning style or red color",
        allow_symbol="one x mark",
    ),
)


def build_sheets() -> tuple[SheetSpec, ...]:
    themes = (
        "top bar and platform download controls",
        "evidence source metrics",
        "research workflow inputs and outputs",
        "project memory, provenance, handoff, and review",
        "citation, claim boundary, and medical evidence report",
        "mode cards",
        "project example cards",
        "status and utility controls",
        "utility close control",
    )
    sheets: list[SheetSpec] = []
    for index in range(0, len(ICONS), 4):
        sheet_icons = ICONS[index : index + 4]
        sheet_no = index // 4
        sheets.append(SheetSpec(f"openscience-site-{sheet_no + 1:02d}", themes[sheet_no], sheet_icons))
    return tuple(sheets)


SHEETS = build_sheets()


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def icon_prompt(sheet: SheetSpec) -> str:
    positions = ("top-left", "top-right", "bottom-left", "bottom-right")
    assignments: list[str] = []
    for position, spec in zip(positions, sheet.icons):
        symbol = f" Allowed symbol: {spec.allow_symbol}." if spec.allow_symbol else " No visible text, letters, or numbers."
        accent = f" Accent guidance: {spec.accent}." if spec.accent else ""
        avoid = f" Avoid {spec.avoid}." if spec.avoid else ""
        assignments.append(f"- {position}: {spec.concept}; draw {spec.detail}.{symbol}{accent}{avoid}")
    for position in positions[len(sheet.icons) :]:
        assignments.append(f"- {position}: leave blank except for one tiny neutral graphite dot; no detailed icon.")

    return textwrap.dedent(
        f"""
        Use case: logo-brand
        Asset type: 2x2 UI icon sprite sheet for the OpenScience public website
        Primary request: Create four separate distinctive OpenScience website icons in one 2x2 grid for {sheet.theme}.
        Style/medium: handmade OpenScience icon style; thick rounded marker strokes; simple cartoon line-art with premium scientific software polish; black/graphite linework as the main visual language; tiny amber-gold brand accents; optional muted sage, muted graphite-blue, or restrained red-orange only when requested. The icons should feel like the OpenScience logo: chunky rounded black line, warm gold rays, calm research identity.
        Simplicity rule: each icon uses one main object and at most one helper symbol. Prefer a clear silhouette over detail. Keep it interesting through object choice and composition, not by adding clutter.
        Composition/framing: square 1024x1024 sheet split into four equal quadrants; one large centered icon per quadrant; generous padding; no overlap; no divider lines; every icon must remain clear at 24px and attractive at 256px.
        Scene/backdrop: perfectly flat pure white background (#ffffff), no shadows, no gradients, no texture, no paper grain.
        Palette: charcoal black (#171717), soft graphite gray, ivory/open interiors, amber-gold (#c4a33f) as small dots, short rays, seals, tabs, or arrow tips. Avoid green-dominant styling; sage may appear only as a tiny status/data accent.
        Icon assignments:
        {chr(10).join(assignments)}
        Global constraints: no watermarks, no UI screenshots, no app-icon square backgrounds, no readable text, no fake paragraphs, no brand wordmarks, no real OS/vendor logos, no medical red cross logo, no caduceus, no QR codes, no photorealism, no 3D render, no gradients, no drop shadows. Use white source background only; final transparency will be handled after generation.
        Avoid: thin strokes, emoji style, generic stock icons, cluttered dashboards, excessive tiny cards, exact GitHub/Microsoft/Apple/Linux marks, repeated identical document shapes.
        """
    ).strip() + "\n"


def call_bianxie(prompt: str, api_key: str, retries: int = 2) -> Image.Image:
    payload = {"model": MODEL, "prompt": prompt, "size": SHEET_SIZE, "n": 1}
    body = json.dumps(payload).encode("utf-8")
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            f"{BIANXIE_BASE_URL}/images/generations",
            data=body,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=240) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            item = data.get("data", [{}])[0]
            if item.get("b64_json"):
                raw = base64.b64decode(item["b64_json"])
            elif item.get("url"):
                with urllib.request.urlopen(item["url"], timeout=180) as resp:
                    raw = resp.read()
            else:
                raise RuntimeError(f"Unexpected image response keys: {list(data.keys())}, item: {list(item.keys())}")
            return Image.open(BytesIO(raw)).convert("RGBA")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")[:1600]
            last_error = RuntimeError(f"Bianxie image generation failed: HTTP {exc.code}: {detail}")
        except Exception as exc:  # noqa: BLE001 - network/API/image decode retry.
            last_error = exc
        if attempt < retries:
            time.sleep(2 + attempt * 3)
    raise RuntimeError(f"Image generation failed after {retries + 1} attempts: {last_error}") from last_error


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
    pad = max(12, int(max(x1 - x0, y1 - y0) * 0.13))
    return icon_image.crop(
        (max(0, x0 - pad), max(0, y0 - pad), min(icon_image.width, x1 + pad), min(icon_image.height, y1 + pad))
    )


def fit_to_final(icon_image: Image.Image) -> Image.Image:
    cropped = crop_to_content(icon_image)
    cropped.thumbnail((224, 224), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (FINAL_SIZE, FINAL_SIZE), (0, 0, 0, 0))
    out.alpha_composite(cropped, ((FINAL_SIZE - cropped.width) // 2, (FINAL_SIZE - cropped.height) // 2))
    return out


def quadrant_boxes(size: tuple[int, int]) -> list[tuple[int, int, int, int]]:
    w, h = size
    return [(0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2), (0, h // 2, w // 2, h), (w // 2, h // 2, w, h)]


def process_sheet(sheet: SheetSpec, source: Image.Image) -> list[Path]:
    paths: list[Path] = []
    for spec, box in zip(sheet.icons, quadrant_boxes(source.size)):
        quad = source.crop(box)
        transparent = remove_white_background(quad)
        final = fit_to_final(transparent)
        cut_path = CUT_DIR / spec.filename
        final_path = FINAL_DIR / spec.filename
        cut_path.parent.mkdir(parents=True, exist_ok=True)
        FINAL_DIR.mkdir(parents=True, exist_ok=True)
        final.save(cut_path)
        final.save(final_path)
        paths.append(final_path)
    return paths


def make_overview(files: list[Path], name: str) -> Path:
    cols = 6
    cell_w, cell_h = 190, 174
    rows = (len(files) + cols - 1) // cols
    out = Image.new("RGBA", (cols * cell_w, rows * cell_h), (255, 255, 255, 255))
    draw = ImageDraw.Draw(out)
    for i, path in enumerate(files):
        icon_image = Image.open(path).convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS)
        x = (i % cols) * cell_w
        y = (i // cols) * cell_h
        tile = Image.new("RGBA", (148, 148), (246, 247, 249, 255))
        tile.alpha_composite(icon_image, (10, 10))
        out.alpha_composite(tile, (x + 21, y + 4))
        draw.text((x + 6, y + 154), path.name[:29], fill=(31, 41, 55, 255))
    overview = OUT_ROOT / name
    overview.parent.mkdir(parents=True, exist_ok=True)
    out.save(overview)
    return overview


def write_prompt_docs() -> tuple[Path, Path]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for sheet in SHEETS:
        prompt = icon_prompt(sheet)
        prompt_path = RAW_DIR / f"{sheet.slug}.prompt.txt"
        prompt_path.write_text(prompt)
        manifest.append(
            {
                "sheet": sheet.slug,
                "theme": sheet.theme,
                "prompt_path": str(prompt_path),
                "icons": [spec.filename for spec in sheet.icons],
            }
        )

    json_path = OUT_ROOT / "openscience-site-icon-prompts.json"
    json_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))

    lines = [
        "# OpenScience Site Icon Prompts",
        "",
        f"- API: `{BIANXIE_BASE_URL}/images/generations`",
        f"- Model: `{MODEL}`",
        f"- Source sheet size: `{SHEET_SIZE}`",
        f"- Final asset size: `{FINAL_SIZE}x{FINAL_SIZE}` transparent PNG",
        f"- Final asset directory: `{FINAL_DIR}`",
        "",
        "## Design Contract",
        "",
        "- Handmade OpenScience line-art: chunky graphite strokes, ivory/open interiors, tiny amber-gold accents.",
        "- One main object and at most one helper symbol per icon.",
        "- Avoid exact OS/vendor logos, red cross logo, caduceus, readable text, gradients, shadows, and complex scenes.",
        "- Website-facing icons should be more polished and slightly richer than toolbar icons, while staying readable at small sizes.",
        "",
        "## Icons",
        "",
    ]
    for spec in ICONS:
        lines.append(f"- `{spec.filename}`: {spec.detail}")
    md_path = OUT_ROOT / "openscience-site-icon-prompts.md"
    md_path.write_text("\n".join(lines))
    return json_path, md_path


def write_asset_manifest(files: list[Path]) -> tuple[Path, Path]:
    entries = [{"filename": path.name, "path": str(path)} for path in sorted(files)]
    json_path = OUT_ROOT / "openscience-site-icon-assets.json"
    json_path.write_text(json.dumps(entries, indent=2, ensure_ascii=False))

    lines = [
        "# OpenScience Site Icon Asset Addresses",
        "",
        f"- Final asset directory: `{FINAL_DIR}`",
        f"- Icons: `{len(entries)}`",
        "",
        "| File | Path |",
        "|---|---|",
    ]
    for entry in entries:
        lines.append(f"| `{entry['filename']}` | `{entry['path']}` |")
    md_path = OUT_ROOT / "openscience-site-icon-assets.md"
    md_path.write_text("\n".join(lines))
    return json_path, md_path


def parse_sheet_filter(value: str | None) -> set[str]:
    known = {sheet.slug for sheet in SHEETS}
    if not value or value == "all":
        return known
    wanted = {item.strip() for item in value.split(",") if item.strip()}
    unknown = wanted - known
    if unknown:
        raise SystemExit(f"Unknown sheet(s): {', '.join(sorted(unknown))}. Known: {', '.join(sorted(known))}")
    return wanted


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
        if opaque_pixels < 1500:
            failures.append(f"{path.name}: too little visible content ({opaque_pixels} pixels)")
        if opaque_pixels > 56000:
            failures.append(f"{path.name}: too much visible content ({opaque_pixels} pixels), likely background not removed")
    if failures:
        raise RuntimeError("Asset verification failed:\n" + "\n".join(failures))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default="/Users/yixuan/files/safe_deepscientist/.env")
    parser.add_argument("--sheets", default="all", help="Comma-separated sheet slugs or all")
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--skip-generate", action="store_true", help="Process existing raw sheets instead of calling the image API")
    parser.add_argument("--write-prompts-only", action="store_true", help="Write prompt docs and exit before calling the image API")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    CUT_DIR.mkdir(parents=True, exist_ok=True)
    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    prompt_json, prompt_md = write_prompt_docs()
    print("prompt-manifest", prompt_json)
    print("prompt-doc", prompt_md)
    if args.write_prompts_only:
        return 0

    load_env(Path(args.env))
    api_key = os.environ.get("BIANXIE_API_KEY")
    if not api_key and not args.skip_generate:
        raise SystemExit("BIANXIE_API_KEY is not set")

    wanted_sheets = parse_sheet_filter(args.sheets)
    written: list[Path] = []
    for sheet in SHEETS:
        if sheet.slug not in wanted_sheets:
            continue
        prompt = icon_prompt(sheet)
        raw_path = RAW_DIR / f"{sheet.slug}.png"
        if args.skip_generate:
            if not raw_path.exists():
                raise FileNotFoundError(f"Missing raw sheet for --skip-generate: {raw_path}")
            print(f"Processing existing {raw_path.name}", flush=True)
            source = Image.open(raw_path).convert("RGBA")
        else:
            print(f"Generating {raw_path.name}", flush=True)
            source = call_bianxie(prompt, api_key or "")
            source.save(raw_path)
            time.sleep(args.sleep)
        written.extend(process_sheet(sheet, source))

    verify_assets(written)
    overview = make_overview(sorted(written), "openscience-site-icons-overview.png")
    asset_json, asset_md = write_asset_manifest(written)
    print("overview", overview)
    print("asset-manifest", asset_json)
    print("asset-doc", asset_md)
    print("generated", len(written), "assets")
    for path in sorted(written):
        print("asset", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
