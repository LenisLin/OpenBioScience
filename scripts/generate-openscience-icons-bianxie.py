#!/usr/bin/env python3
"""
Generate the full OpenScience UI icon family with Bianxie gpt-image-2.

The script writes auditable prompts first, then optionally generates 2x2 icon
sheets, cuts them into transparent 128x128 PNGs, and saves the final assets in:

packages/desktop/src/renderer/assets/icons/generated/openscience
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
OUT_ROOT = REPO_ROOT / "output" / "imagegen" / "openscience-icons"
RAW_DIR = OUT_ROOT / "raw"
CUT_DIR = OUT_ROOT / "cut"
FINAL_DIR = REPO_ROOT / "packages" / "desktop" / "src" / "renderer" / "assets" / "icons" / "generated" / "openscience"

BIANXIE_BASE_URL = "https://api.bianxie.ai/v1"
MODEL = "gpt-image-2"
SHEET_SIZE = "1024x1024"
FINAL_SIZE = 128


@dataclass(frozen=True)
class IconSpec:
    filename: str
    title: str
    family: str
    concept: str
    detail: str
    accent: str = ""
    allow_symbols: str = ""
    avoid: str = ""


@dataclass(frozen=True)
class SheetSpec:
    slug: str
    family: str
    icons: tuple[IconSpec, ...]


def icon(
    filename: str,
    title: str,
    family: str,
    concept: str,
    detail: str,
    accent: str = "",
    allow_symbols: str = "",
    avoid: str = "",
) -> IconSpec:
    return IconSpec(
        filename=filename,
        title=title,
        family=family,
        concept=concept,
        detail=detail,
        accent=accent,
        allow_symbols=allow_symbols,
        avoid=avoid,
    )


GROUPS: tuple[tuple[str, str, tuple[IconSpec, ...]], ...] = (
    (
        "mode",
        "core mode and project entry icons",
        (
            icon(
                "mode-science",
                "Science research mode",
                "mode",
                "scientific research workspace",
                "one open eye-shaped research ring with two small orbit nodes and one gold discovery dot",
                accent="small graphite-blue node accent is allowed",
                avoid="microscope clutter or laboratory scene",
            ),
            icon(
                "mode-medical-evidence",
                "Medical evidence mode",
                "mode",
                "evidence-based medicine mode",
                "one evidence document with a short gold evidence line and a tiny protective shield tucked beside it",
                accent="a very small muted red-orange medical mark is allowed",
                avoid="red cross logo, caduceus, hospital building, or complex medical scene",
            ),
            icon(
                "mode-goal",
                "Goal mode",
                "mode",
                "long-running goal loop",
                "one clean bullseye target wrapped by a single circular arrow",
                allow_symbols="one simple arrow",
            ),
            icon(
                "mode-deposition",
                "Knowledge deposition mode",
                "mode",
                "knowledge being deposited into durable layers",
                "three thin layered pages with one descending gold dot settling into the bottom layer",
                accent="warm brown layer accent is allowed",
                avoid="database cylinder or file cabinet",
            ),
            icon(
                "research-project",
                "Research project",
                "mode",
                "research project container",
                "one project folder with a small open ring and two connected nodes on the cover",
                accent="one gold project node",
            ),
            icon(
                "new-project",
                "New research project",
                "mode",
                "create a new research project",
                "one light project folder with a small gold plus badge on the upper corner",
                allow_symbols="one plus sign",
            ),
        ),
    ),
    (
        "artifact-nav",
        "science artifact navigation and provenance icons",
        (
            icon(
                "artifact",
                "Science artifact",
                "artifact-nav",
                "reproducible science object",
                "one tilted artifact card shaped like a shallow cube with one tiny provenance node attached",
            ),
            icon(
                "artifact-version",
                "Artifact version",
                "artifact-nav",
                "artifact version switching",
                "two stacked artifact cards with a tiny corner version tab and one gold dot",
                avoid="letters or numbers",
            ),
            icon(
                "artifact-provenance",
                "Artifact provenance",
                "artifact-nav",
                "source chain and traceability",
                "three connected nodes leading into one tiny document card",
                accent="one gold node at the final verified source",
            ),
            icon(
                "artifact-inputs",
                "Artifact inputs",
                "artifact-nav",
                "inputs entering an artifact",
                "one short arrow entering a shallow data tray with two small data slips",
                allow_symbols="one arrow",
            ),
            icon(
                "artifact-code",
                "Artifact source code",
                "artifact-nav",
                "source code behind the artifact",
                "one code page with two bracket-like chevrons and one gold run dot",
                allow_symbols="simple bracket marks only",
                avoid="readable code text",
            ),
            icon(
                "artifact-log",
                "Artifact execution log",
                "artifact-nav",
                "execution log timeline",
                "one terminal scroll strip with a small clock dot on its lower edge",
                avoid="large terminal window",
            ),
            icon(
                "artifact-messages",
                "Artifact messages",
                "artifact-nav",
                "agent conversation history linked to an artifact",
                "two small speech bubbles connected by a single provenance node",
            ),
            icon(
                "artifact-environment",
                "Artifact environment",
                "artifact-nav",
                "reproducible runtime environment",
                "one small package box with a compact gear dot stamped on the side",
                avoid="large settings gear alone",
            ),
            icon(
                "artifact-review",
                "Artifact review",
                "artifact-nav",
                "review and audit of the artifact",
                "one checklist card with a magnifying glass crossing the lower corner",
            ),
            icon(
                "artifact-export",
                "Artifact export",
                "artifact-nav",
                "export artifact to a shareable file",
                "one arrow leaving a tilted artifact card into a small output tray",
                allow_symbols="one arrow",
            ),
        ),
    ),
    (
        "artifact-type",
        "science artifact type icons",
        (
            icon(
                "artifact-figure",
                "Figure artifact",
                "artifact-type",
                "scientific figure",
                "one compact axis frame with three plotted dots and one gold highlighted point",
                avoid="full chart dashboard",
            ),
            icon(
                "artifact-table",
                "Table artifact",
                "artifact-type",
                "scientific table",
                "one simple grid sheet with one gold highlighted cell",
                avoid="spreadsheet app logo",
            ),
            icon(
                "artifact-dataset",
                "Dataset artifact",
                "artifact-type",
                "dataset object",
                "one database cylinder with a tiny table tile leaning against it",
            ),
            icon(
                "artifact-notebook",
                "Notebook artifact",
                "artifact-type",
                "computational notebook",
                "one divided notebook page with two clean cells and a single gold run dot",
                avoid="spiral-bound school notebook clutter",
            ),
            icon(
                "artifact-manuscript",
                "Manuscript artifact",
                "artifact-type",
                "scientific manuscript draft",
                "one manuscript page with a strong title bar, a short abstract line, and a small margin note",
                avoid="PDF folded seal",
            ),
            icon(
                "artifact-pdf",
                "PDF artifact",
                "artifact-type",
                "PDF paper artifact",
                "one folded-corner page with a small round gold seal mark",
                avoid="letters PDF",
            ),
            icon(
                "artifact-latex",
                "LaTeX artifact",
                "artifact-type",
                "LaTeX source compiling to paper",
                "one source page with two curly brace-like marks and a small paper shadow behind it",
                allow_symbols="curly brace marks only",
                avoid="readable TeX text",
            ),
            icon(
                "artifact-html",
                "HTML report artifact",
                "artifact-type",
                "browser-based report",
                "one browser window outline containing a small document block and gold status dot",
                avoid="HTML letters",
            ),
            icon(
                "artifact-molecule",
                "Molecule artifact",
                "artifact-type",
                "chemical molecule",
                "one six-node molecular ring with a tiny attached side node",
                avoid="DNA helix",
            ),
            icon(
                "artifact-protein",
                "Protein artifact",
                "artifact-type",
                "protein structure",
                "one simple ribbon helix curve with two small anchor nodes",
                accent="one muted graphite-blue ribbon segment is allowed",
                avoid="DNA double helix or complex ball-and-stick model",
            ),
            icon(
                "artifact-genome-track",
                "Genome track artifact",
                "artifact-type",
                "genome browser track",
                "one horizontal genome track line with three rounded gene blocks and one gold locus marker",
                avoid="DNA helix",
            ),
            icon(
                "artifact-alignment",
                "Alignment artifact",
                "artifact-type",
                "sequence alignment",
                "four stacked short alignment bars with small gaps, no letters",
                avoid="readable sequence text",
            ),
            icon(
                "artifact-run-bundle",
                "Run bundle artifact",
                "artifact-type",
                "reproducible run bundle",
                "one open box containing three tiny cards for code, data, and log, shown as simple shapes",
                avoid="crowded archive box",
            ),
        ),
    ),
    (
        "science-report",
        "science report and evidence chain icons",
        (
            icon(
                "science-report",
                "Science report",
                "science-report",
                "main scientific report",
                "one report page with a gold OpenScience light ray along the top edge",
            ),
            icon(
                "science-summary",
                "Science summary",
                "science-report",
                "summary section",
                "three calm summary lines with one gold highlighter stroke under the middle line",
            ),
            icon(
                "science-methods",
                "Science methods",
                "science-report",
                "method workflow",
                "three stepping nodes connected by a simple path line",
            ),
            icon(
                "science-claim",
                "Science claim",
                "science-report",
                "traceable conclusion claim",
                "one conclusion card with a quote-corner shape and one attached evidence node",
                avoid="readable quote marks if they become text-heavy",
            ),
            icon(
                "science-evidence",
                "Science evidence",
                "science-report",
                "evidence object",
                "one small evidence tag attached to two linked document nodes",
                avoid="letters or citation numbers",
            ),
            icon(
                "science-warning",
                "Science warning",
                "science-report",
                "warning about evidence graph gap",
                "one warning triangle beside a broken two-node chain",
                accent="muted amber warning accent is allowed",
                allow_symbols="one exclamation mark",
            ),
            icon(
                "science-validation",
                "Science validation",
                "science-report",
                "validation result",
                "one checklist card with two data dots and a clean check mark",
                allow_symbols="one check mark",
            ),
            icon(
                "science-computed",
                "Computed evidence",
                "science-report",
                "evidence produced by a real computation",
                "one compact terminal card with one output dot leaving into a tiny result tray",
                avoid="large code window",
            ),
            icon(
                "science-parsed",
                "Parsed evidence",
                "science-report",
                "evidence parsed from a source document",
                "one document page crossed by a short cursor scan line and one gold extraction dot",
            ),
            icon(
                "science-digitized",
                "Digitized evidence",
                "science-report",
                "evidence digitized from a figure",
                "one image frame with a small selected rectangle and a point being lifted out",
                avoid="camera or photo app logo",
            ),
            icon(
                "science-hypothesis",
                "Science hypothesis",
                "science-report",
                "uncertain hypothesis",
                "one lightbulb outline with a dotted orbit node around it",
                accent="gold bulb dot is allowed",
                avoid="solid filled bulb",
            ),
        ),
    ),
    (
        "deposition",
        "knowledge deposition mode icons",
        (
            icon(
                "deposition-report",
                "Deposition report",
                "deposition",
                "knowledge deposition report",
                "one layered report page with a gold deposition dot settling between layers",
                accent="warm brown layer accent is allowed",
            ),
            icon(
                "deposition-sop",
                "SOP",
                "deposition",
                "standard operating procedure",
                "one compact flow checklist with a path line connecting three steps",
                avoid="long text checklist",
            ),
            icon(
                "deposition-protocol",
                "Protocol",
                "deposition",
                "saved research protocol",
                "one folder with a small protocol bookmark tab and one gold dot",
                avoid="readable label text",
            ),
            icon(
                "deposition-skill",
                "Installable capability",
                "deposition",
                "installable reusable skill",
                "one capability card with a small plug shape and puzzle notch",
                avoid="calling it MeOS or using text",
            ),
            icon(
                "deposition-enable",
                "Enable deposition",
                "deposition",
                "enable action",
                "one toggle switch with a small check mark resting on the active side",
                allow_symbols="one check mark",
            ),
            icon(
                "deposition-revise",
                "Revise deposition",
                "deposition",
                "request another revision",
                "one pencil crossing a small speech bubble",
            ),
            icon(
                "deposition-source-map",
                "Source map",
                "deposition",
                "source mapping from conversation and files",
                "one document node tree branching into three small source dots",
            ),
            icon(
                "deposition-update",
                "Self-updating protocol",
                "deposition",
                "add a new update to deposited protocol",
                "two layered documents with a small gold plus badge",
                allow_symbols="one plus sign",
            ),
        ),
    ),
    (
        "settings",
        "OpenScience settings page icons",
        (
            icon(
                "settings-science",
                "Science settings",
                "settings",
                "science research settings",
                "one open research ring with two small setting slider ticks",
                avoid="full gear icon",
            ),
            icon(
                "settings-medical",
                "Medical evidence settings",
                "settings",
                "medical evidence settings",
                "one evidence document with a tiny shield and one slider dot",
                accent="very small muted red-orange medical accent is allowed",
                avoid="red cross logo",
            ),
            icon(
                "settings-paperclip-api",
                "Paperclip API settings",
                "settings",
                "API key for Paperclip",
                "one simple key hooked through a paperclip loop",
                avoid="readable API text",
            ),
            icon(
                "settings-artifact",
                "Artifact settings",
                "settings",
                "artifact behavior settings",
                "one artifact cube beside two small slider rails",
            ),
            icon(
                "settings-permission",
                "Permission settings",
                "settings",
                "workspace permission defaults",
                "one protective shield in front of a small folder",
            ),
            icon(
                "settings-datasource",
                "Datasource settings",
                "settings",
                "databases and search sources",
                "one database cylinder with a tiny globe orbit line",
                avoid="real database provider logos",
            ),
            icon(
                "settings-skills",
                "Skills settings",
                "settings",
                "skills and deposition hub",
                "one compact toolbox with a small capability card sticking out",
                avoid="large generic gear",
            ),
            icon(
                "settings-mcp",
                "MCP settings",
                "settings",
                "MCP tool server configuration",
                "one small server block connected to a plug by a short cable",
                avoid="readable MCP letters",
            ),
            icon(
                "settings-appearance",
                "Appearance settings",
                "settings",
                "theme, font, and scale",
                "three overlapping theme swatches with one gold corner dot",
            ),
            icon(
                "settings-motion",
                "Motion settings",
                "settings",
                "animation and motion preference",
                "one short timeline curve with a toggle dot at the end",
            ),
        ),
    ),
    (
        "advanced",
        "phase two connector, compute, and reviewer icons",
        (
            icon(
                "connector-literature",
                "Literature connector",
                "advanced",
                "literature database connector",
                "one small paper stack with a magnifying glass over the top page",
            ),
            icon(
                "connector-protein-db",
                "Protein database connector",
                "advanced",
                "protein database connector",
                "one database cylinder with a tiny ribbon helix mark on its side",
                accent="muted graphite-blue ribbon accent is allowed",
                avoid="DNA helix",
            ),
            icon(
                "connector-genomics-db",
                "Genomics database connector",
                "advanced",
                "genomics database connector",
                "one database cylinder with a horizontal genome track band across it",
                avoid="DNA helix",
            ),
            icon(
                "connector-chem-db",
                "Chemistry database connector",
                "advanced",
                "chemistry database connector",
                "one database cylinder with a small molecular ring badge",
            ),
            icon(
                "remote-job",
                "Remote job",
                "advanced",
                "remote compute job",
                "one server block sending a small gold lightning task dot outward",
                allow_symbols="one lightning bolt",
            ),
            icon(
                "hpc-queue",
                "HPC queue",
                "advanced",
                "HPC queue",
                "three stacked queue cards entering a small server block",
                avoid="crowded rack",
            ),
            icon(
                "gpu-run",
                "GPU run",
                "advanced",
                "GPU-accelerated run",
                "one simple chip with a gold run spark in the upper corner",
                allow_symbols="one simple spark",
            ),
            icon(
                "reviewer-agent",
                "Reviewer agent",
                "advanced",
                "reviewer audit agent",
                "one shield-shaped review badge with two checklist ticks inside",
                avoid="human face, mascot, or judge character",
            ),
            icon(
                "review-passed",
                "Review passed",
                "advanced",
                "review passed",
                "one shield with a clean check mark and one gold status dot",
                allow_symbols="one check mark",
            ),
            icon(
                "review-warning",
                "Review warning",
                "advanced",
                "review warning",
                "one shield with a small warning triangle inside",
                accent="muted amber warning accent is allowed",
                allow_symbols="one exclamation mark",
            ),
            icon(
                "review-failed",
                "Review failed",
                "advanced",
                "review failed",
                "one shield with a small x mark inside",
                accent="muted red-orange failure accent is allowed",
                allow_symbols="one x mark",
            ),
        ),
    ),
)


def chunked(items: tuple[IconSpec, ...], size: int) -> Iterable[tuple[IconSpec, ...]]:
    for idx in range(0, len(items), size):
        yield items[idx : idx + size]


def build_sheets() -> tuple[SheetSpec, ...]:
    sheets: list[SheetSpec] = []
    for family, title, icons in GROUPS:
        for idx, chunk in enumerate(chunked(icons, 4), start=1):
            sheets.append(SheetSpec(f"openscience-{family}-{idx:02d}", title, chunk))
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


def icon_prompt(sheet: SheetSpec, dark: bool) -> str:
    positions = ("top-left", "top-right", "bottom-left", "bottom-right")
    palette = (
        "dark-mode variant: warm off-white thick outline (#f4f0e6), transparent or very subtle empty interiors, "
        "muted gold accents (#c4a33f); optional tiny muted graphite-blue, warm brown, amber, or red-orange accents only when the icon assignment asks for them; "
        "no black fill, no charcoal fill, no dark solid body"
        if dark
        else "light-mode variant: thick charcoal-black outline (#171717), white interiors or open interiors, muted gold accents (#c4a33f); "
        "optional tiny muted graphite-blue, warm brown, amber, or red-orange accents only when the icon assignment asks for them"
    )
    lines: list[str] = []
    for position, spec in zip(positions, sheet.icons):
        symbol_rule = (
            f" Allowed visible symbol for this icon only: {spec.allow_symbols}."
            if spec.allow_symbols
            else " No visible text, letters, or numbers."
        )
        accent = f" Accent guidance: {spec.accent}." if spec.accent else ""
        avoid = f" Avoid {spec.avoid}." if spec.avoid else ""
        lines.append(f"- {position}: {spec.concept}; draw {spec.detail}.{symbol_rule}{accent}{avoid}")
    for position in positions[len(sheet.icons) :]:
        lines.append(f"- {position}: leave the quadrant empty except for one tiny neutral dot; no detailed icon.")

    return textwrap.dedent(
        f"""
        Use case: logo-brand
        Asset type: 2x2 UI icon sprite sheet for the OpenScience desktop app
        Primary request: Create four separate, distinctive, very simple hand-drawn line icons in one 2x2 grid for {sheet.family}.
        Style/medium: handmade OpenScience icon style; thick rounded marker-like strokes; slightly imperfect but polished; black/white/gray linework as the main visual language; tiny OpenScience gold dots or short lines for identity; scientific software tone, calm and rigorous, not playful emoji.
        Simplicity rule: each icon must use one main object and at most one helper symbol. Use a bold silhouette and very few interior details. Make icons distinctive by changing the core shape, not by adding decoration.
        Composition/framing: square 1024x1024 sheet split into four equal quadrants; one large centered icon per quadrant; generous padding; no overlap between quadrants; every icon must remain recognizable at 16px and polished at 128px.
        Scene/backdrop: perfectly flat pure white background (#ffffff), no shadows, no gradients, no texture, no paper grain, no border lines between quadrants.
        Palette: {palette}. Keep every icon mostly monochrome; gold should be a small dot, short underline, tiny badge, or one filled micro-area, never a large fill.
        Icon assignments:
        {chr(10).join(lines)}
        Global constraints: no watermarks, no UI screenshot, no app-logo square background, no real provider/database/company logos, no Microsoft-style document logos, no medical red cross logo, no caduceus, no fake readable paragraphs, no decorative spark bursts unless explicitly assigned, no complex scenes. For dark-mode sheets, use off-white strokes instead of black strokes and do not fill icon bodies with dark colors.
        Avoid: thin strokes, photorealism, 3D rendering, emoji style, heavy gradients, neon sci-fi, green-dominant palette, overly complex laboratory equipment, repeated identical document shapes, tiny unreadable labels.
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
        except Exception as exc:  # noqa: BLE001 - retry network/image failures with context.
            last_error = exc
        if attempt < retries:
            time.sleep(2 + attempt * 3)
    raise RuntimeError(f"Image generation failed after {retries + 1} attempts: {last_error}") from last_error


def remove_sheet_background(icon_image: Image.Image, dark: bool) -> Image.Image:
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
            elif dark and high <= 34 and chroma <= 14:
                alpha = 0
            elif dark and high <= 54 and chroma <= 20:
                alpha = int(max(0, min(255, (high - 34) * 12)))
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
        transparent = remove_sheet_background(quad, dark=dark)
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
    cols = 6
    cell_w, cell_h = 174, 144
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
        out.alpha_composite(tile, (x + 31, y + 4))
        draw.text((x + 6, y + 120), path.name[:26], fill=label_color)
    overview = OUT_ROOT / name
    overview.parent.mkdir(parents=True, exist_ok=True)
    out.save(overview)
    return overview


def write_asset_manifest() -> tuple[Path, Path]:
    entries: list[dict[str, str]] = []
    light_files = sorted(path for path in FINAL_DIR.glob("*.png") if not path.name.endswith("-dark.png"))
    for light_path in light_files:
        icon_id = light_path.stem
        dark_path = FINAL_DIR / f"{icon_id}-dark.png"
        entries.append(
            {
                "id": icon_id,
                "light": str(light_path),
                "dark": str(dark_path) if dark_path.exists() else "",
            }
        )

    json_path = OUT_ROOT / "openscience-icon-assets.json"
    json_path.write_text(json.dumps(entries, indent=2, ensure_ascii=False))

    lines = [
        "# OpenScience Generated Icon Asset Addresses",
        "",
        f"- Final asset directory: `{FINAL_DIR}`",
        f"- Icons: `{len(entries)}` light/dark pairs",
        "",
        "| Icon id | Light PNG | Dark PNG |",
        "|---|---|---|",
    ]
    for entry in entries:
        lines.append(f"| `{entry['id']}` | `{entry['light']}` | `{entry['dark']}` |")
    md_path = OUT_ROOT / "openscience-icon-assets.md"
    md_path.write_text("\n".join(lines))
    return json_path, md_path


def write_prompt_manifest() -> tuple[Path, Path]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for sheet in SHEETS:
        for dark in (False, True):
            theme = "dark" if dark else "light"
            prompt = icon_prompt(sheet, dark=dark)
            prompt_path = RAW_DIR / f"{sheet.slug}-{theme}.prompt.txt"
            prompt_path.write_text(prompt)
            manifest.append(
                {
                    "sheet": sheet.slug,
                    "theme": theme,
                    "prompt_path": str(prompt_path),
                    "icons": [spec.filename for spec in sheet.icons],
                }
            )

    json_path = OUT_ROOT / "openscience-icon-prompts.json"
    json_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))

    lines = [
        "# OpenScience Generated Icon Prompts",
        "",
        f"- API: `{BIANXIE_BASE_URL}/images/generations`",
        f"- Model: `{MODEL}`",
        f"- Source sheet size: `{SHEET_SIZE}`",
        f"- Final asset size: `{FINAL_SIZE}x{FINAL_SIZE}` transparent PNG",
        f"- Final asset directory: `{FINAL_DIR}`",
        "",
        "## Design Contract",
        "",
        "- One main object and at most one helper symbol per icon.",
        "- Mostly black/white/gray linework, tiny OpenScience gold accents.",
        "- Optional muted graphite-blue, warm brown, amber, or red-orange only where semantically useful.",
        "- No real provider logos, no Microsoft-style document logos, no red cross logo, no caduceus, no complex scenes.",
        "",
        "## Sheets",
        "",
    ]
    for sheet in SHEETS:
        lines.append(f"### {sheet.slug}")
        for spec in sheet.icons:
            lines.append(f"- `{spec.filename}`: {spec.detail}")
        lines.append("")

    md_path = OUT_ROOT / "openscience-icon-prompts.md"
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
        if opaque_pixels < 500:
            failures.append(f"{path.name}: too little visible content ({opaque_pixels} pixels)")
        if opaque_pixels > 14200:
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
    parser.add_argument("--write-prompts-only", action="store_true", help="Write prompt manifest and exit before calling the image API")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    CUT_DIR.mkdir(parents=True, exist_ok=True)
    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    json_path, md_path = write_prompt_manifest()
    print("prompt-manifest", json_path)
    print("prompt-doc", md_path)
    if args.write_prompts_only:
        return 0

    load_env(Path(args.env))
    api_key = os.environ.get("BIANXIE_API_KEY")
    if not api_key and not args.skip_generate:
        raise SystemExit("BIANXIE_API_KEY is not set")

    wanted_sheets = parse_sheet_filter(args.sheets)
    themes = parse_themes(args.themes)
    written: list[Path] = []

    for sheet in SHEETS:
        if sheet.slug not in wanted_sheets:
            continue
        for dark in themes:
            theme_name = "dark" if dark else "light"
            prompt = icon_prompt(sheet, dark=dark)
            raw_path = RAW_DIR / f"{sheet.slug}-{theme_name}.png"
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
    light_files = sorted(path for path in FINAL_DIR.glob("*.png") if not path.name.endswith("-dark.png"))
    dark_files = sorted(path for path in FINAL_DIR.glob("*-dark.png"))
    if light_files:
        print("overview", make_overview(light_files, "openscience-icons-light-overview.png"))
    if dark_files:
        print("overview", make_overview(dark_files, "openscience-icons-dark-overview.png", dark=True))
    asset_json, asset_md = write_asset_manifest()
    print("asset-manifest", asset_json)
    print("asset-doc", asset_md)
    print("generated", len(written), "assets")
    for path in sorted(written):
        print("asset", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
