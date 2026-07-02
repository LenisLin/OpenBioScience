#!/usr/bin/env python3
"""
DeepOrganiser update and download server.

This service intentionally uses only Python's standard library so it can run on
a fresh Ubuntu server without a dependency bootstrap step.
"""

from __future__ import annotations

import html
import json
import mimetypes
import os
import posixpath
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
UPDATES_DIR = ROOT / "data" / "updates"
MANIFEST_PATH = UPDATES_DIR / "manifest.json"
HOST = os.environ.get("DEEPORGANISER_HOST", "127.0.0.1")
PORT = int(os.environ.get("DEEPORGANISER_PORT", "34424"))
PRODUCT_NAME = os.environ.get("DEEPORGANISER_PRODUCT_NAME", "DeepOrganiser")
BASE_URL = os.environ.get("DEEPORGANISER_BASE_URL", "https://deepscientist.cc/DeepOrganiser").rstrip("/")
PUBLIC_PATH_PREFIX = urlparse(BASE_URL).path.rstrip("/")

CHANNEL_FILES = {
    "latest.yml",
    "latest-mac.yml",
    "latest-arm64-mac.yml",
    "latest-linux.yml",
    "latest-linux-arm64.yml",
    "latest-win-arm64.yml",
}

INSTALLER_EXTENSIONS = {".dmg", ".zip", ".exe", ".msi", ".deb", ".rpm", ".AppImage"}
STATIC_CACHE_SECONDS = 3600
MUTABLE_STATIC_CACHE_SECONDS = 120
UPDATE_CACHE_SECONDS = 30


@dataclass
class ReleaseAsset:
    name: str
    url: str
    size: int
    sizeLabel: str
    platform: str
    arch: str
    kind: str
    version: str
    updatedAt: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def size_label(size: int) -> str:
    value = float(size)
    for unit in ["B", "KB", "MB", "GB"]:
        if value < 1024 or unit == "GB":
            if unit == "B":
                return f"{int(value)} {unit}"
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{size} B"


def safe_relative_path(raw_path: str) -> str | None:
    decoded = unquote(raw_path)
    normalized = posixpath.normpath(decoded).lstrip("/")
    if normalized in {"", "."}:
        return ""
    if normalized.startswith("../") or "/../" in normalized:
        return None
    return normalized


def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        return {
            "product": PRODUCT_NAME,
            "baseUrl": BASE_URL,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
            "releases": [],
            "notes": "No release has been published yet.",
        }
    try:
        data = json.loads(MANIFEST_PATH.read_text("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("manifest root must be an object")
        data["product"] = PRODUCT_NAME
        data["baseUrl"] = BASE_URL
        data.setdefault("releases", [])
        return data
    except Exception as exc:
        return {
            "product": PRODUCT_NAME,
            "baseUrl": BASE_URL,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
            "releases": [],
            "error": f"Failed to parse manifest: {exc}",
        }


def infer_platform(name: str) -> tuple[str, str, str]:
    lower = name.lower()
    platform = "Universal"
    if any(token in lower for token in ["mac", "darwin", "osx", ".dmg"]):
        platform = "macOS"
    elif any(token in lower for token in ["win", "windows", ".exe", ".msi"]):
        platform = "Windows"
    elif any(token in lower for token in ["linux", ".deb", ".rpm", ".appimage"]):
        platform = "Linux"

    arch = "Universal"
    if any(token in lower for token in ["arm64", "aarch64"]):
        arch = "Apple Silicon / ARM64" if platform == "macOS" else "ARM64"
    elif any(token in lower for token in ["x64", "x86_64", "amd64"]):
        arch = "Intel / x64" if platform == "macOS" else "x64"

    ext = Path(name).suffix.lower()
    kind = ext.lstrip(".").upper() or "Package"
    if ext == ".dmg":
        kind = "DMG"
    elif ext == ".exe":
        kind = "Installer"
    elif ext == ".zip":
        kind = "ZIP"
    elif ext == ".deb":
        kind = "DEB"
    return platform, arch, kind


def scan_assets() -> list[ReleaseAsset]:
    assets: list[ReleaseAsset] = []
    if not UPDATES_DIR.exists():
        return assets

    for item in sorted(UPDATES_DIR.glob("*/*")):
        if not item.is_file() or item.suffix not in INSTALLER_EXTENSIONS:
            continue
        version = item.parent.name
        platform, arch, kind = infer_platform(item.name)
        stat = item.stat()
        assets.append(
            ReleaseAsset(
                name=item.name,
                url=f"{BASE_URL}/{version}/{item.name}",
                size=stat.st_size,
                sizeLabel=size_label(stat.st_size),
                platform=platform,
                arch=arch,
                kind=kind,
                version=version,
                updatedAt=datetime.fromtimestamp(stat.st_mtime, timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
            )
        )
    return assets


def version_key(version: str) -> tuple[int, ...]:
    cleaned = version.lstrip("v")
    parts = []
    for token in re.split(r"[.-]", cleaned):
        if token.isdigit():
            parts.append(int(token))
        else:
            break
    return tuple(parts or [0])


def latest_version(assets: list[ReleaseAsset], manifest: dict[str, Any]) -> str | None:
    releases = manifest.get("releases")
    if isinstance(releases, list) and releases:
        versions = [str(item.get("version", "")) for item in releases if isinstance(item, dict) and item.get("version")]
        if versions:
            return sorted(versions, key=version_key, reverse=True)[0]
    if not assets:
        return None
    return sorted({asset.version for asset in assets}, key=version_key, reverse=True)[0]


def platform_downloads(assets: list[ReleaseAsset], version: str | None) -> dict[str, list[dict[str, Any]]]:
    buckets: dict[str, list[ReleaseAsset]] = {"macOS": [], "Windows": [], "Linux": []}
    for asset in assets:
        if version and asset.version != version:
            continue
        if asset.platform in buckets:
            buckets[asset.platform].append(asset)

    priority = {".dmg": 0, ".exe": 0, ".deb": 0, ".zip": 1, ".msi": 2, ".rpm": 2, ".AppImage": 3}
    result: dict[str, list[dict[str, Any]]] = {}
    for platform, items in buckets.items():
        result[platform] = [
            asdict(asset)
            for asset in sorted(items, key=lambda item: (priority.get(Path(item.name).suffix, 9), item.arch, item.name))
        ]
    return result


def status_payload() -> dict[str, Any]:
    manifest = load_manifest()
    assets = scan_assets()
    latest = latest_version(assets, manifest)
    channels = {}
    for name in sorted(CHANNEL_FILES):
        file_path = UPDATES_DIR / name
        channels[name] = {
            "present": file_path.exists(),
            "url": f"{BASE_URL}/{name}",
            "updatedAt": datetime.fromtimestamp(file_path.stat().st_mtime, timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z")
            if file_path.exists()
            else None,
        }

    return {
        "ok": True,
        "product": manifest.get("product", PRODUCT_NAME),
        "baseUrl": BASE_URL,
        "latestVersion": latest,
        "updatedAt": manifest.get("updatedAt"),
        "assets": [asdict(asset) for asset in assets],
        "downloads": platform_downloads(assets, latest),
        "channels": channels,
        "notes": manifest.get("notes", ""),
        "manifestError": manifest.get("error"),
      }


def read_index() -> str:
    index_path = PUBLIC_DIR / "index.html"
    if index_path.exists():
        return index_path.read_text("utf-8")
    return "<!doctype html><title>DeepOrganiser</title><h1>DeepOrganiser update server</h1>"


def strip_public_prefix(raw_path: str) -> str:
    if PUBLIC_PATH_PREFIX and (raw_path == PUBLIC_PATH_PREFIX or raw_path.startswith(f"{PUBLIC_PATH_PREFIX}/")):
        return raw_path[len(PUBLIC_PATH_PREFIX) :] or "/"
    return raw_path


class DeepOrganiserHandler(SimpleHTTPRequestHandler):
    server_version = "DeepOrganiserUpdateServer/0.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def send_json(self, data: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", f"public, max-age={UPDATE_CACHE_SECONDS}")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_text(self, text: str, content_type: str, cache_seconds: int = STATIC_CACHE_SECONDS) -> None:
        body = text.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", f"public, max-age={cache_seconds}")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        raw_path = strip_public_prefix(parsed.path)

        if raw_path in {"/", "/index.html"}:
            return self.send_text(read_index(), "text/html; charset=utf-8", cache_seconds=60)
        if raw_path == "/api/status":
            return self.send_json(status_payload())
        if raw_path == "/healthz":
            return self.send_json({"ok": True, "time": now_iso(), "service": "DeepOrganiserServer"})

        rel = safe_relative_path(raw_path)
        if rel is None:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid path")
            return

        public_file = PUBLIC_DIR / rel
        if public_file.exists() and public_file.is_file():
            return self.serve_file(public_file)

        update_file = UPDATES_DIR / rel
        if update_file.exists() and update_file.is_file():
            return self.serve_file(update_file, is_update=True)

        self.send_error(HTTPStatus.NOT_FOUND, f"{html.escape(raw_path)} not found")

    def do_HEAD(self) -> None:
        self.do_GET()

    def serve_file(self, file_path: Path, is_update: bool = False) -> None:
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        stat = file_path.stat()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(stat.st_size))
        if is_update and file_path.suffix in {".yml", ".yaml"}:
            cache_seconds = UPDATE_CACHE_SECONDS
        elif file_path.suffix in {".html", ".css", ".js"}:
            cache_seconds = MUTABLE_STATIC_CACHE_SECONDS
        else:
            cache_seconds = STATIC_CACHE_SECONDS
        self.send_header("Cache-Control", f"public, max-age={cache_seconds}")
        if file_path.suffix in INSTALLER_EXTENSIONS:
            self.send_header("Content-Disposition", f'attachment; filename="{file_path.name}"')
        self.end_headers()
        if self.command == "HEAD":
            return
        with file_path.open("rb") as f:
            while True:
                chunk = f.read(1024 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)


def ensure_layout() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    if not MANIFEST_PATH.exists():
        MANIFEST_PATH.write_text(
            json.dumps(
                {
                    "product": PRODUCT_NAME,
                    "baseUrl": BASE_URL,
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                    "releases": [],
                    "notes": "Release packages are not uploaded yet.",
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            "utf-8",
        )


def main() -> None:
    ensure_layout()
    httpd = ThreadingHTTPServer((HOST, PORT), DeepOrganiserHandler)
    print(f"DeepOrganiserServer listening on http://{HOST}:{PORT}")
    print(f"Public update base: {BASE_URL}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
