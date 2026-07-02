#!/usr/bin/env python3
"""
Generate the Medical Evidence Mode logo with Bianxie gpt-image-2.

The raw image and prompt are kept under output/imagegen/medical-evidence-logo.
Final light/dark transparent PNG assets are written to renderer/assets/icons/generated.
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
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO_ROOT / "output" / "imagegen" / "medical-evidence-logo"
RAW_DIR = OUT_ROOT / "raw"
FINAL_DIR = REPO_ROOT / "packages" / "desktop" / "src" / "renderer" / "assets" / "icons" / "generated"

BIANXIE_BASE_URL = "https://api.bianxie.ai/v1"
MODEL = "gpt-image-2"
SIZE = "1024x1024"
FINAL_SIZE = 256


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def build_prompt(dark: bool) -> str:
    palette = (
        "dark-mode variant: warm off-white thick outlines (#f4f0e6), restrained warm clinical red accents (#d85a4a), muted DeepScientist gold highlights (#c4a33f), transparent/open interiors; no black fill, no charcoal fill, no dark solid body"
        if dark
        else "light-mode variant: thick charcoal-black outlines (#171717), warm white or open interiors, restrained warm clinical red accents (#d85a4a), muted DeepScientist gold highlights (#c4a33f)"
    )
    return textwrap.dedent(
        f"""
        Use case: medical-evidence-mode-logo
        Asset type: one standalone square product logo mark for a desktop app feature, not a sprite sheet.
        Primary request: Create a very simple, direct logo symbol for "Medical Evidence Mode" in DeepScientist. It should instantly read as medical evidence without looking busy.
        Concept: draw one rounded clinical document page with a warm red medical plus near the top and one small muted gold evidence dot or short underline near the bottom. Use only one page, one plus, and one evidence accent. The medical plus should be clearly visible but integrated into the document mark rather than a standalone official Red Cross emblem.
        Style/medium: extremely simple hand-drawn cartoon line-art logo, matching the handmade DeepScientist UI icon style; thick rounded marker strokes; slightly imperfect but polished; open interiors; cute but professional; product-grade symbol, not clip art.
        Simplicity rule: one main shape only. No hospital building, no multiple documents, no basket, no stairs, no table, no spark bursts, no scene. The logo must stay readable at 18px.
        Composition/framing: centered single logo on a square 1024x1024 canvas; generous whitespace; compact silhouette readable at 18px, attractive at 64px and 128px; no text, no wordmark, no badge border, no app icon square.
        Scene/backdrop: perfectly flat pure white background (#ffffff), no shadows, no gradients, no texture, no paper grain.
        Palette: {palette}. Use red only for the medical plus. Use gold only for one tiny evidence dot or one short underline. Keep the logo mostly monochrome.
        Hard constraints: no visible text, no letters, no numbers, no watermark, no UI screenshot, no real hospital logo, no caduceus, no snake staff, no official Red Cross organization mark, no pharmacy logo, no gradients, no drop shadows, no transparent background in the generated source, no colored square app-icon background.
        Avoid: generic shield-only icon, generic heart icon, hospital building, multiple overlapping papers, complex medical equipment, photorealism, emoji style, thin strokes, tiny unreadable document text, extra decorative marks.
        """
    ).strip() + "\n"


def call_bianxie(prompt: str, api_key: str) -> Image.Image:
    payload = {"model": MODEL, "prompt": prompt, "size": SIZE, "n": 1}
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


def remove_white_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
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
    alpha = out.getchannel("A").filter(ImageFilter.GaussianBlur(0.1))
    out.putalpha(alpha)
    return out


def crop_to_content(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        return image
    x0, y0, x1, y1 = bbox
    pad = max(24, int(max(x1 - x0, y1 - y0) * 0.12))
    return image.crop((max(0, x0 - pad), max(0, y0 - pad), min(image.width, x1 + pad), min(image.height, y1 + pad)))


def fit_logo(image: Image.Image) -> Image.Image:
    cropped = crop_to_content(remove_white_background(image))
    cropped.thumbnail((224, 224), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (FINAL_SIZE, FINAL_SIZE), (0, 0, 0, 0))
    out.alpha_composite(cropped, ((FINAL_SIZE - cropped.width) // 2, (FINAL_SIZE - cropped.height) // 2))
    return out


def make_overview(light_path: Path, dark_path: Path) -> Path:
    out = Image.new("RGBA", (640, 340), (255, 255, 255, 255))
    draw = ImageDraw.Draw(out)
    light = Image.open(light_path).convert("RGBA").resize((176, 176), Image.Resampling.LANCZOS)
    dark = Image.open(dark_path).convert("RGBA").resize((176, 176), Image.Resampling.LANCZOS)
    light_tile = Image.new("RGBA", (240, 240), (246, 247, 249, 255))
    dark_tile = Image.new("RGBA", (240, 240), (32, 36, 42, 255))
    light_tile.alpha_composite(light, (32, 32))
    dark_tile.alpha_composite(dark, (32, 32))
    out.alpha_composite(light_tile, (60, 36))
    out.alpha_composite(dark_tile, (340, 36))
    draw.text((60, 292), light_path.name, fill=(31, 41, 55, 255))
    draw.text((340, 292), dark_path.name, fill=(31, 41, 55, 255))
    overview = OUT_ROOT / "medical-evidence-logo-overview.png"
    out.save(overview)
    return overview


def verify(path: Path) -> None:
    image = Image.open(path).convert("RGBA")
    if image.size != (FINAL_SIZE, FINAL_SIZE):
        raise RuntimeError(f"{path.name}: expected {FINAL_SIZE}x{FINAL_SIZE}, got {image.size}")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError(f"{path.name}: transparent/empty image")
    opaque = sum(1 for value in alpha.getdata() if value > 12)
    if opaque < 2500:
        raise RuntimeError(f"{path.name}: too little visible content ({opaque} pixels)")
    if opaque > 52000:
        raise RuntimeError(f"{path.name}: too much visible content ({opaque} pixels), likely background not removed")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default="/Users/yixuan/files/safe_deepscientist/.env")
    parser.add_argument("--themes", choices=("light", "dark", "both"), default="both")
    parser.add_argument("--skip-generate", action="store_true")
    parser.add_argument("--sleep", type=float, default=1.0)
    args = parser.parse_args()

    load_env(Path(args.env))
    api_key = os.environ.get("BIANXIE_API_KEY")
    if not api_key and not args.skip_generate:
        raise SystemExit("BIANXIE_API_KEY is not set")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    FINAL_DIR.mkdir(parents=True, exist_ok=True)

    themes = (False, True) if args.themes == "both" else (args.themes == "dark",)
    written: list[Path] = []
    for dark in themes:
        theme = "dark" if dark else "light"
        prompt = build_prompt(dark)
        prompt_path = RAW_DIR / f"medical-evidence-logo-{theme}.prompt.txt"
        raw_path = RAW_DIR / f"medical-evidence-logo-{theme}.png"
        final_path = FINAL_DIR / f"medical-evidence-logo{'-dark' if dark else ''}.png"
        prompt_path.write_text(prompt)
        if args.skip_generate:
            if not raw_path.exists():
                raise FileNotFoundError(raw_path)
            raw = Image.open(raw_path).convert("RGBA")
            print(f"Processing existing {raw_path.name}", flush=True)
        else:
            print(f"Generating {raw_path.name}", flush=True)
            raw = call_bianxie(prompt, api_key or "")
            raw.save(raw_path)
            time.sleep(args.sleep)
        final = fit_logo(raw)
        final.save(final_path)
        verify(final_path)
        written.append(final_path)

    light_path = FINAL_DIR / "medical-evidence-logo.png"
    dark_path = FINAL_DIR / "medical-evidence-logo-dark.png"
    if light_path.exists() and dark_path.exists():
        print("overview", make_overview(light_path, dark_path))
    for path in written:
        print("asset", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
