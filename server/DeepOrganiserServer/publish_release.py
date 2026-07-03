#!/usr/bin/env python3
"""Publish electron-builder artifacts into the OpenScience update directory."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
UPDATES_DIR = ROOT / "data" / "updates"
MANIFEST_PATH = UPDATES_DIR / "manifest.json"
PRODUCT_NAME = os.environ.get("DEEPORGANISER_PRODUCT_NAME", "OpenScience")
BASE_URL = os.environ.get("DEEPORGANISER_BASE_URL", "https://openscience.cc").rstrip("/")
CHANNEL_PATTERNS = ("latest*.yml",)
ARTIFACT_EXTENSIONS = {".dmg", ".zip", ".exe", ".msi", ".deb", ".rpm", ".appimage", ".blockmap"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        return {
            "product": PRODUCT_NAME,
            "baseUrl": BASE_URL,
            "createdAt": now_iso(),
            "releases": [],
        }
    manifest = json.loads(MANIFEST_PATH.read_text("utf-8"))
    manifest["product"] = PRODUCT_NAME
    manifest["baseUrl"] = BASE_URL
    return manifest


def save_manifest(manifest: dict) -> None:
    manifest["updatedAt"] = now_iso()
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")


def copy_if_file(src: Path, dst: Path) -> bool:
    if not src.is_file():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish OpenScience desktop release artifacts.")
    parser.add_argument("--version", required=True, help="Release version, for example 0.0.2")
    parser.add_argument("--from", dest="source", required=True, help="Directory containing electron-builder outputs")
    parser.add_argument("--notes", default="", help="Release notes shown on the download page")
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    if not source.exists():
        raise SystemExit(f"Source directory does not exist: {source}")

    UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    version_dir = UPDATES_DIR / args.version
    version_dir.mkdir(parents=True, exist_ok=True)

    copied = []
    for item in source.iterdir():
        if item.is_file() and item.suffix.lower() in ARTIFACT_EXTENSIONS:
            target = version_dir / item.name
            copy_if_file(item, target)
            copied.append({"name": item.name, "size": target.stat().st_size, "sha256": sha256(target)})

    for pattern in CHANNEL_PATTERNS:
        for item in source.glob(pattern):
            if copy_if_file(item, UPDATES_DIR / item.name):
                copied.append({"name": item.name, "size": item.stat().st_size, "channel": True})

    manifest = load_manifest()
    releases = [item for item in manifest.get("releases", []) if item.get("version") != args.version]
    releases.append({"version": args.version, "publishedAt": now_iso(), "notes": args.notes, "files": copied})
    manifest["releases"] = sorted(releases, key=lambda item: item["version"], reverse=True)
    if args.notes:
        manifest["notes"] = args.notes
    save_manifest(manifest)

    print(json.dumps({"ok": True, "version": args.version, "files": copied}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
