#!/usr/bin/env python3
"""
DeepOrganiser update and download server.

This service intentionally uses only Python's standard library so it can run on
a fresh Ubuntu server without a dependency bootstrap step.
"""

from __future__ import annotations

import html
import hashlib
import hmac
import io
import json
import mimetypes
import os
import posixpath
import re
import secrets
import sqlite3
import sys
import threading
import time
import csv
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
UPDATES_DIR = ROOT / "data" / "updates"
DATA_DIR = ROOT / "data"
TELEMETRY_DB_PATH = DATA_DIR / "openscience.sqlite3"
MANIFEST_PATH = UPDATES_DIR / "manifest.json"
SYNC_STATE_PATH = UPDATES_DIR / "github-sync.json"
HOST = os.environ.get("DEEPORGANISER_HOST", "127.0.0.1")
PORT = int(os.environ.get("DEEPORGANISER_PORT", "34424"))
PRODUCT_NAME = os.environ.get("DEEPORGANISER_PRODUCT_NAME", "OpenScience")
BASE_URL = os.environ.get("DEEPORGANISER_BASE_URL", "https://deepscientist.cc/openscience").rstrip("/")
PUBLIC_PATH_PREFIX = urlparse(BASE_URL).path.rstrip("/")
GITHUB_REPO = os.environ.get("DEEPORGANISER_GITHUB_REPO", "ResearAI/OpenScience").strip()
GITHUB_TOKEN = os.environ.get("DEEPORGANISER_GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN")
GITHUB_API_BASE = os.environ.get("DEEPORGANISER_GITHUB_API_BASE", "https://api.github.com").rstrip("/")
GITHUB_SYNC_INTERVAL_SECONDS = int(os.environ.get("DEEPORGANISER_GITHUB_SYNC_INTERVAL_SECONDS", "600"))
GITHUB_SYNC_TIMEOUT_SECONDS = int(os.environ.get("DEEPORGANISER_GITHUB_SYNC_TIMEOUT_SECONDS", "60"))
GITHUB_SYNC_ON_STARTUP = os.environ.get("DEEPORGANISER_GITHUB_SYNC_ON_STARTUP", "1").lower() not in {"0", "false", "no"}
ENABLE_GITHUB_SYNC = os.environ.get("DEEPORGANISER_ENABLE_GITHUB_SYNC", "1").lower() not in {"0", "false", "no"}
INCLUDE_PRERELEASE = os.environ.get("DEEPORGANISER_INCLUDE_PRERELEASE", "0").lower() in {"1", "true", "yes"}
SYNC_ADMIN_TOKEN = os.environ.get("DEEPORGANISER_SYNC_TOKEN", "")
ALLOW_UNAUTHENTICATED_SYNC = os.environ.get("DEEPORGANISER_ALLOW_UNAUTHENTICATED_SYNC", "0").lower() in {
    "1",
    "true",
    "yes",
}
TELEMETRY_ADMIN_TOKEN = os.environ.get("DEEPORGANISER_TELEMETRY_ADMIN_TOKEN", "")
TELEMETRY_WRITE_TOKEN = os.environ.get("DEEPORGANISER_TELEMETRY_WRITE_TOKEN", "")
TELEMETRY_MAX_BODY_BYTES = int(os.environ.get("DEEPORGANISER_TELEMETRY_MAX_BODY_BYTES", str(256 * 1024)))
TELEMETRY_RATE_LIMIT_PER_MINUTE = int(os.environ.get("DEEPORGANISER_TELEMETRY_RATE_LIMIT_PER_MINUTE", "120"))
ADMIN_USERNAME = os.environ.get("DEEPORGANISER_ADMIN_USERNAME", "admin").strip() or "admin"
ADMIN_PASSWORD = os.environ.get("DEEPORGANISER_ADMIN_PASSWORD", "")
ADMIN_PASSWORD_HASH = os.environ.get("DEEPORGANISER_ADMIN_PASSWORD_HASH", "")
ADMIN_SESSION_SECONDS = int(os.environ.get("DEEPORGANISER_ADMIN_SESSION_SECONDS", str(8 * 60 * 60)))
ADMIN_COOKIE_NAME = "openscience_admin_session"

CHANNEL_FILES = {
    "latest.yml",
    "latest-mac.yml",
    "latest-arm64-mac.yml",
    "latest-linux.yml",
    "latest-linux-arm64.yml",
    "latest-win-arm64.yml",
}

INSTALLER_EXTENSIONS = {".dmg", ".zip", ".exe", ".msi", ".deb", ".rpm", ".appimage"}
SYNC_ASSET_EXTENSIONS = INSTALLER_EXTENSIONS | {".blockmap"}
STATIC_CACHE_SECONDS = 3600
MUTABLE_STATIC_CACHE_SECONDS = 120
UPDATE_CACHE_SECONDS = 30

SYNC_LOCK = threading.Lock()
SYNC_THREAD: threading.Thread | None = None
TELEMETRY_LOCK = threading.Lock()
TELEMETRY_RATE_LOCK = threading.Lock()
TELEMETRY_RATE_WINDOW: dict[str, list[float]] = {}
ADMIN_SESSION_LOCK = threading.Lock()
ADMIN_SESSIONS: dict[str, dict[str, Any]] = {}
ADMIN_LOGIN_RATE_LOCK = threading.Lock()
ADMIN_LOGIN_RATE_WINDOW: dict[str, list[float]] = {}


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


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


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


def save_manifest(manifest: dict[str, Any]) -> None:
    manifest["product"] = PRODUCT_NAME
    manifest["baseUrl"] = BASE_URL
    manifest["updatedAt"] = now_iso()
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")


def load_sync_state() -> dict[str, Any]:
    if not SYNC_STATE_PATH.exists():
        return {
            "enabled": ENABLE_GITHUB_SYNC,
            "repo": GITHUB_REPO,
            "status": "idle",
            "lastCheckedAt": None,
            "lastSuccessAt": None,
            "latestRelease": None,
            "message": "GitHub sync has not run yet.",
        }
    try:
        data = json.loads(SYNC_STATE_PATH.read_text("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("sync state root must be an object")
        data["enabled"] = ENABLE_GITHUB_SYNC
        data["repo"] = GITHUB_REPO
        return data
    except Exception as exc:
        return {
            "enabled": ENABLE_GITHUB_SYNC,
            "repo": GITHUB_REPO,
            "status": "error",
            "lastCheckedAt": None,
            "lastSuccessAt": None,
            "latestRelease": None,
            "message": f"Failed to parse sync state: {exc}",
        }


def save_sync_state(state: dict[str, Any]) -> None:
    state["enabled"] = ENABLE_GITHUB_SYNC
    state["repo"] = GITHUB_REPO
    state["updatedAt"] = now_iso()
    SYNC_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SYNC_STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", "utf-8")


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


def is_channel_asset_name(name: str) -> bool:
    return name in CHANNEL_FILES or bool(re.fullmatch(r"latest(?:[-_.][A-Za-z0-9]+)*\.ya?ml", name))


def normalize_tag_to_version(tag: str) -> str | None:
    value = tag.strip()
    if value.startswith("v"):
        value = value[1:]
    if not re.match(r"^\d+\.\d+\.\d+", value):
        return None
    match = re.match(r"^(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)", value)
    return match.group(1) if match else None


def github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": PRODUCT_NAME,
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return headers


def github_get_json(path: str) -> Any:
    url = f"{GITHUB_API_BASE}{path}"
    req = Request(url, headers=github_headers())
    with urlopen(req, timeout=GITHUB_SYNC_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def latest_github_release() -> dict[str, Any] | None:
    releases = github_get_json(f"/repos/{GITHUB_REPO}/releases")
    if not isinstance(releases, list):
        raise RuntimeError("GitHub API response is not a release list")

    candidates: list[dict[str, Any]] = []
    for release in releases:
        if not isinstance(release, dict) or release.get("draft"):
            continue
        if release.get("prerelease") and not INCLUDE_PRERELEASE:
            continue
        version = normalize_tag_to_version(str(release.get("tag_name", "")))
        if not version:
            continue
        release["_normalized_version"] = version
        candidates.append(release)

    if not candidates:
        return None

    return sorted(candidates, key=lambda item: version_key(str(item["_normalized_version"])), reverse=True)[0]


def should_download_asset(asset_name: str) -> bool:
    suffix = Path(asset_name).suffix.lower()
    return suffix in SYNC_ASSET_EXTENSIONS or is_channel_asset_name(asset_name)


def github_asset_download_headers() -> dict[str, str]:
    headers = github_headers()
    headers["Accept"] = "application/octet-stream"
    return headers


def download_url_to_file(
    url: str,
    target: Path,
    expected_size: int | None = None,
    headers: dict[str, str] | None = None,
) -> bool:
    if target.exists() and (expected_size is None or target.stat().st_size == expected_size):
        return False

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(f"{target.suffix}.tmp")
    req = Request(url, headers=headers or {"User-Agent": PRODUCT_NAME})
    with urlopen(req, timeout=GITHUB_SYNC_TIMEOUT_SECONDS) as response, tmp.open("wb") as out:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)

    if expected_size is not None and tmp.stat().st_size != expected_size:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"Downloaded size mismatch for {target.name}: expected {expected_size}, got {tmp.stat().st_size}")

    tmp.replace(target)
    return True


def sync_github_release_once(dry_run: bool = False) -> dict[str, Any]:
    started_at = now_iso()
    state: dict[str, Any] = {
        "enabled": ENABLE_GITHUB_SYNC,
        "repo": GITHUB_REPO,
        "status": "running",
        "lastCheckedAt": started_at,
        "lastSuccessAt": None,
        "latestRelease": None,
        "message": "Checking GitHub Releases.",
    }
    save_sync_state(state)

    release = latest_github_release()
    if not release:
        state.update(
            {
                "status": "idle",
                "lastCheckedAt": now_iso(),
                "message": "No published GitHub Release is available.",
            }
        )
        save_sync_state(state)
        return state

    version = str(release["_normalized_version"])
    assets = [asset for asset in release.get("assets", []) if isinstance(asset, dict)]
    downloadable = [
        asset
        for asset in assets
        if asset.get("name")
        and (asset.get("url") or asset.get("browser_download_url"))
        and should_download_asset(str(asset["name"]))
    ]

    files: list[dict[str, Any]] = []
    changed_files = 0
    if not dry_run:
        UPDATES_DIR.mkdir(parents=True, exist_ok=True)
        version_dir = UPDATES_DIR / version
        version_dir.mkdir(parents=True, exist_ok=True)

    for asset in downloadable:
        name = str(asset["name"])
        browser_url = str(asset.get("browser_download_url") or "")
        download_url = str(asset.get("url") or browser_url)
        size = int(asset.get("size") or 0) or None
        channel = is_channel_asset_name(name)
        target = (UPDATES_DIR / name) if channel else (UPDATES_DIR / version / name)
        changed = False
        if not dry_run:
            changed = download_url_to_file(download_url, target, size, github_asset_download_headers())
            if changed:
                changed_files += 1
        file_record: dict[str, Any] = {
            "name": name,
            "size": size or 0,
            "channel": channel,
            "githubUrl": browser_url or download_url,
        }
        if not dry_run and target.exists() and not channel:
            file_record["sha256"] = sha256(target)
        if not dry_run and target.exists():
            file_record["path"] = str(target.relative_to(UPDATES_DIR))
        if changed:
            file_record["changed"] = True
        files.append(file_record)

    if not dry_run:
        manifest = load_manifest()
        releases = [item for item in manifest.get("releases", []) if isinstance(item, dict) and item.get("version") != version]
        releases.append(
            {
                "version": version,
                "tagName": release.get("tag_name"),
                "name": release.get("name"),
                "publishedAt": release.get("published_at") or now_iso(),
                "htmlUrl": release.get("html_url"),
                "notes": release.get("body") or "",
                "source": "github",
                "files": files,
            }
        )
        manifest["releases"] = sorted(releases, key=lambda item: version_key(str(item.get("version", ""))), reverse=True)
        if release.get("body"):
            manifest["notes"] = release.get("body")
        save_manifest(manifest)

    state.update(
        {
            "status": "ok",
            "lastCheckedAt": now_iso(),
            "lastSuccessAt": now_iso(),
            "latestRelease": {
                "version": version,
                "tagName": release.get("tag_name"),
                "name": release.get("name"),
                "htmlUrl": release.get("html_url"),
                "publishedAt": release.get("published_at"),
                "assetCount": len(downloadable),
            },
            "changedFiles": changed_files,
            "dryRun": dry_run,
            "message": f"Synced GitHub Release {release.get('tag_name')} with {len(downloadable)} asset(s).",
        }
    )
    save_sync_state(state)
    return state


def maybe_start_github_sync(force: bool = False) -> None:
    global SYNC_THREAD
    if not ENABLE_GITHUB_SYNC or not GITHUB_REPO:
        return
    if SYNC_THREAD and SYNC_THREAD.is_alive():
        return

    state = load_sync_state()
    last_checked = state.get("lastCheckedAt") or state.get("updatedAt")
    if not force and last_checked:
        try:
            last = datetime.fromisoformat(str(last_checked).replace("Z", "+00:00")).timestamp()
            if time.time() - last < GITHUB_SYNC_INTERVAL_SECONDS:
                return
        except Exception:
            pass

    def run_sync() -> None:
        with SYNC_LOCK:
            try:
                sync_github_release_once()
            except Exception as exc:
                previous = load_sync_state()
                previous.update(
                    {
                        "status": "error",
                        "lastCheckedAt": now_iso(),
                        "message": str(exc),
                    }
                )
                save_sync_state(previous)
                sys.stderr.write(f"[github-sync] {exc}\n")

    SYNC_THREAD = threading.Thread(target=run_sync, name="github-release-sync", daemon=True)
    SYNC_THREAD.start()


def scan_assets() -> list[ReleaseAsset]:
    assets: list[ReleaseAsset] = []
    if not UPDATES_DIR.exists():
        return assets

    for item in sorted(UPDATES_DIR.glob("*/*")):
        if not item.is_file() or item.suffix.lower() not in INSTALLER_EXTENSIONS:
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

    priority = {".dmg": 0, ".exe": 0, ".deb": 0, ".zip": 1, ".msi": 2, ".rpm": 2, ".appimage": 3}
    result: dict[str, list[dict[str, Any]]] = {}
    for platform, items in buckets.items():
        result[platform] = [
            asdict(asset)
            for asset in sorted(
                items,
                key=lambda item: (priority.get(Path(item.name).suffix.lower(), 9), item.arch, item.name),
            )
        ]
    return result


def status_payload() -> dict[str, Any]:
    manifest = load_manifest()
    assets = scan_assets()
    latest = latest_version(assets, manifest)
    sync_state = load_sync_state()
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
        "githubSync": sync_state,
        "notes": manifest.get("notes", ""),
        "manifestError": manifest.get("error"),
      }


def telemetry_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(TELEMETRY_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_telemetry_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with TELEMETRY_LOCK:
        with telemetry_connection() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS installations (
                    installation_id TEXT PRIMARY KEY,
                    first_seen_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    app_version TEXT,
                    platform TEXT,
                    arch TEXT,
                    locale TEXT,
                    channel TEXT,
                    last_ip_hash TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS telemetry_events (
                    event_id TEXT PRIMARY KEY,
                    installation_id TEXT NOT NULL,
                    event_name TEXT NOT NULL,
                    event_category TEXT NOT NULL,
                    event_time TEXT NOT NULL,
                    received_at TEXT NOT NULL,
                    app_version TEXT,
                    platform TEXT,
                    arch TEXT,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS update_clients (
                    installation_id TEXT PRIMARY KEY,
                    current_version TEXT,
                    latest_version TEXT,
                    update_available INTEGER,
                    platform TEXT,
                    arch TEXT,
                    last_check_at TEXT,
                    last_status TEXT,
                    last_error TEXT,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS consent_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    installation_id TEXT NOT NULL,
                    consent_type TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    at TEXT NOT NULL,
                    app_version TEXT
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_telemetry_events_name_time ON telemetry_events(event_name, event_time)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_telemetry_events_installation ON telemetry_events(installation_id)"
            )
            conn.commit()


def sanitize_telemetry_string(value: str, limit: int = 240) -> str:
    return (
        value.replace("\x00", "")
        .replace("\r", " ")
        .replace("\n", " ")
        .strip()
        .replace("/Users/", "/Users/[redacted]/")
    )[:limit]


def sanitize_telemetry_properties(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    result: dict[str, Any] = {}
    for key, value in list(raw.items())[:80]:
        if not isinstance(key, str):
            continue
        safe_key = re.sub(r"[^A-Za-z0-9_.:-]+", "_", key.strip())[:64]
        if not safe_key:
            continue
        if re.search(r"(prompt|content|body|message|text|file|path|token|secret|password|email|username|displayName)", safe_key):
            continue
        if value is None or isinstance(value, bool):
            result[safe_key] = value
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            result[safe_key] = value
        elif isinstance(value, str):
            result[safe_key] = sanitize_telemetry_string(value)
    return result


def normalize_telemetry_event(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    event_id = raw.get("id")
    name = raw.get("name")
    category = raw.get("category")
    at = raw.get("at")
    if not all(isinstance(value, str) for value in [event_id, name, category, at]):
        return None
    if category not in {"update", "usage", "diagnostics"}:
        return None
    safe_name = re.sub(r"[^a-z0-9_.:-]+", "_", name.lower().strip())[:96]
    if not safe_name:
        return None
    safe_id = re.sub(r"[^A-Za-z0-9_.:-]+", "_", event_id.strip())[:96]
    if not safe_id:
        return None
    return {
        "id": safe_id,
        "name": safe_name,
        "category": category,
        "at": sanitize_telemetry_string(at, 40),
        "properties": sanitize_telemetry_properties(raw.get("properties")),
    }


def hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()[:24]


def client_ip(headers: Any, fallback: str) -> str:
    forwarded = headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return fallback


def telemetry_rate_limited(ip: str) -> bool:
    now = time.time()
    with TELEMETRY_RATE_LOCK:
        bucket = [t for t in TELEMETRY_RATE_WINDOW.get(ip, []) if now - t < 60]
        if len(bucket) >= TELEMETRY_RATE_LIMIT_PER_MINUTE:
            TELEMETRY_RATE_WINDOW[ip] = bucket
            return True
        bucket.append(now)
        TELEMETRY_RATE_WINDOW[ip] = bucket
    return False


def record_telemetry_batch(payload: Any, ip: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    installation_id = payload.get("installationId")
    if not isinstance(installation_id, str) or not installation_id.strip():
        raise ValueError("installationId is required")
    installation_id = re.sub(r"[^A-Za-z0-9_.:-]+", "_", installation_id.strip())[:96]

    events = [event for event in (normalize_telemetry_event(item) for item in payload.get("events", [])) if event]
    if len(events) > 50:
        events = events[:50]
    if not events:
        return {"accepted": 0}

    received_at = now_iso()
    app_version = sanitize_telemetry_string(str(payload.get("appVersion") or ""), 80)
    platform = sanitize_telemetry_string(str(payload.get("platform") or ""), 40)
    arch = sanitize_telemetry_string(str(payload.get("arch") or ""), 40)
    locale = sanitize_telemetry_string(str(payload.get("locale") or ""), 40)
    channel = sanitize_telemetry_string(str(payload.get("channel") or ""), 40)
    consent = payload.get("consent") if isinstance(payload.get("consent"), dict) else {}

    with TELEMETRY_LOCK:
      with telemetry_connection() as conn:
        conn.execute(
            """
            INSERT INTO installations (
                installation_id, first_seen_at, last_seen_at, app_version, platform, arch, locale, channel, last_ip_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(installation_id) DO UPDATE SET
                last_seen_at = excluded.last_seen_at,
                app_version = excluded.app_version,
                platform = excluded.platform,
                arch = excluded.arch,
                locale = excluded.locale,
                channel = excluded.channel,
                last_ip_hash = excluded.last_ip_hash
            """,
            (installation_id, received_at, received_at, app_version, platform, arch, locale, channel, hash_ip(ip)),
        )

        for consent_type in ["update", "usage", "diagnostics"]:
            if isinstance(consent.get(consent_type), bool):
                conn.execute(
                    """
                    INSERT INTO consent_records (installation_id, consent_type, enabled, at, app_version)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (installation_id, consent_type, 1 if consent[consent_type] else 0, received_at, app_version),
                )

        accepted = 0
        for event in events:
            payload_json = json.dumps(event.get("properties") or {}, ensure_ascii=False, separators=(",", ":"))
            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO telemetry_events (
                    event_id, installation_id, event_name, event_category, event_time, received_at,
                    app_version, platform, arch, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event["id"],
                    installation_id,
                    event["name"],
                    event["category"],
                    event["at"],
                    received_at,
                    app_version,
                    platform,
                    arch,
                    payload_json,
                ),
            )
            accepted += cursor.rowcount

            if event["category"] == "update":
                props = event.get("properties") or {}
                current_version = str(props.get("currentVersion") or "")
                latest_version = str(props.get("latestVersion") or props.get("targetVersion") or "")
                update_available = props.get("updateAvailable")
                status = str(props.get("status") or event["name"])
                error = str(props.get("error") or "")
                conn.execute(
                    """
                    INSERT INTO update_clients (
                        installation_id, current_version, latest_version, update_available, platform, arch,
                        last_check_at, last_status, last_error, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(installation_id) DO UPDATE SET
                        current_version = COALESCE(NULLIF(excluded.current_version, ''), update_clients.current_version),
                        latest_version = COALESCE(NULLIF(excluded.latest_version, ''), update_clients.latest_version),
                        update_available = COALESCE(excluded.update_available, update_clients.update_available),
                        platform = excluded.platform,
                        arch = excluded.arch,
                        last_check_at = excluded.last_check_at,
                        last_status = excluded.last_status,
                        last_error = excluded.last_error,
                        updated_at = excluded.updated_at
                    """,
                    (
                        installation_id,
                        sanitize_telemetry_string(current_version, 80),
                        sanitize_telemetry_string(latest_version, 80),
                        None if not isinstance(update_available, bool) else (1 if update_available else 0),
                        platform,
                        arch,
                        event["at"],
                        sanitize_telemetry_string(status, 96),
                        sanitize_telemetry_string(error, 240),
                        received_at,
                    ),
                )

        conn.commit()

    return {"accepted": accepted}


def telemetry_summary_payload() -> dict[str, Any]:
    with telemetry_connection() as conn:
        total_installations = conn.execute("SELECT COUNT(*) AS c FROM installations").fetchone()["c"]
        total_events = conn.execute("SELECT COUNT(*) AS c FROM telemetry_events").fetchone()["c"]
        platforms = [
            dict(row)
            for row in conn.execute(
                "SELECT platform, arch, COUNT(*) AS count FROM installations GROUP BY platform, arch ORDER BY count DESC"
            ).fetchall()
        ]
        events = [
            dict(row)
            for row in conn.execute(
                """
                SELECT event_name AS name, event_category AS category, COUNT(*) AS count
                FROM telemetry_events
                GROUP BY event_name, event_category
                ORDER BY count DESC
                LIMIT 30
                """
            ).fetchall()
        ]
        updates = [
            dict(row)
            for row in conn.execute(
                """
                SELECT current_version, latest_version, update_available, platform, arch, last_status, COUNT(*) AS count
                FROM update_clients
                GROUP BY current_version, latest_version, update_available, platform, arch, last_status
                ORDER BY count DESC
                LIMIT 30
                """
            ).fetchall()
        ]
        recent = [
            dict(row)
            for row in conn.execute(
                """
                SELECT event_name AS name, event_category AS category, event_time AS at, app_version, platform, arch
                FROM telemetry_events
                ORDER BY received_at DESC
                LIMIT 20
                """
            ).fetchall()
        ]

    return {
        "ok": True,
        "generatedAt": now_iso(),
        "totals": {
            "events": total_events,
            "installations": total_installations,
        },
        "events": events,
        "platforms": platforms,
        "recent": recent,
        "updates": updates,
    }


def admin_cookie_path() -> str:
    return PUBLIC_PATH_PREFIX or "/"


def admin_session_cookie(token: str, max_age: int = ADMIN_SESSION_SECONDS) -> str:
    parts = [
        f"{ADMIN_COOKIE_NAME}={token}",
        f"Max-Age={max_age}",
        f"Path={admin_cookie_path()}",
        "HttpOnly",
        "SameSite=Strict",
    ]
    if BASE_URL.startswith("https://"):
        parts.append("Secure")
    return "; ".join(parts)


def clear_admin_session_cookie() -> str:
    return admin_session_cookie("", max_age=0)


def parse_cookie_header(raw_cookie: str) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for item in raw_cookie.split(";"):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        cookies[key.strip()] = value.strip()
    return cookies


def admin_password_configured() -> bool:
    return bool(ADMIN_PASSWORD or ADMIN_PASSWORD_HASH)


def pbkdf2_password_hash(password: str, iterations: int = 240_000) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
    return f"pbkdf2_sha256${iterations}${salt}${digest.hex()}"


def verify_admin_password(password: str) -> bool:
    if not admin_password_configured():
        return False

    if ADMIN_PASSWORD_HASH:
        parts = ADMIN_PASSWORD_HASH.split("$")
        if len(parts) == 4 and parts[0] == "pbkdf2_sha256":
            try:
                iterations = int(parts[1])
                salt = parts[2]
                expected = parts[3]
                digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations).hex()
                return hmac.compare_digest(digest, expected)
            except Exception:
                return False

    return bool(ADMIN_PASSWORD) and hmac.compare_digest(password, ADMIN_PASSWORD)


def admin_login_rate_limited(ip: str) -> bool:
    now = time.time()
    with ADMIN_LOGIN_RATE_LOCK:
        bucket = [t for t in ADMIN_LOGIN_RATE_WINDOW.get(ip, []) if now - t < 600]
        if len(bucket) >= 20:
            ADMIN_LOGIN_RATE_WINDOW[ip] = bucket
            return True
        bucket.append(now)
        ADMIN_LOGIN_RATE_WINDOW[ip] = bucket
    return False


def create_admin_session(ip: str, user_agent: str) -> str:
    token = secrets.token_urlsafe(40)
    expires_at = time.time() + ADMIN_SESSION_SECONDS
    with ADMIN_SESSION_LOCK:
        ADMIN_SESSIONS[token] = {
            "created_at": now_iso(),
            "expires_at": expires_at,
            "ip_hash": hash_ip(ip),
            "user_agent_hash": hashlib.sha256(user_agent.encode("utf-8")).hexdigest()[:24],
            "username": ADMIN_USERNAME,
        }
    return token


def get_admin_session(raw_cookie: str) -> dict[str, Any] | None:
    token = parse_cookie_header(raw_cookie).get(ADMIN_COOKIE_NAME, "")
    if not token:
        return None
    now = time.time()
    with ADMIN_SESSION_LOCK:
        session = ADMIN_SESSIONS.get(token)
        if not session:
            return None
        if float(session.get("expires_at") or 0) < now:
            ADMIN_SESSIONS.pop(token, None)
            return None
        session["expires_at"] = now + ADMIN_SESSION_SECONDS
        session["last_seen_at"] = now_iso()
        return dict(session)


def revoke_admin_session(raw_cookie: str) -> None:
    token = parse_cookie_header(raw_cookie).get(ADMIN_COOKIE_NAME, "")
    if not token:
        return
    with ADMIN_SESSION_LOCK:
        ADMIN_SESSIONS.pop(token, None)


def telemetry_installations_payload(limit: int = 200, offset: int = 0) -> dict[str, Any]:
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)
    with telemetry_connection() as conn:
        rows = [
            dict(row)
            for row in conn.execute(
                """
                SELECT
                    i.installation_id,
                    i.first_seen_at,
                    i.last_seen_at,
                    i.app_version,
                    i.platform,
                    i.arch,
                    i.locale,
                    i.channel,
                    u.current_version,
                    u.latest_version,
                    u.update_available,
                    u.last_check_at,
                    u.last_status,
                    u.last_error,
                    (
                      SELECT enabled FROM consent_records c
                      WHERE c.installation_id = i.installation_id AND c.consent_type = 'update'
                      ORDER BY c.id DESC LIMIT 1
                    ) AS consent_update,
                    (
                      SELECT enabled FROM consent_records c
                      WHERE c.installation_id = i.installation_id AND c.consent_type = 'usage'
                      ORDER BY c.id DESC LIMIT 1
                    ) AS consent_usage,
                    (
                      SELECT enabled FROM consent_records c
                      WHERE c.installation_id = i.installation_id AND c.consent_type = 'diagnostics'
                      ORDER BY c.id DESC LIMIT 1
                    ) AS consent_diagnostics,
                    (
                      SELECT COUNT(*) FROM telemetry_events e
                      WHERE e.installation_id = i.installation_id
                    ) AS event_count
                FROM installations i
                LEFT JOIN update_clients u ON u.installation_id = i.installation_id
                ORDER BY i.last_seen_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        ]
        total = conn.execute("SELECT COUNT(*) AS c FROM installations").fetchone()["c"]

    for row in rows:
        row["installation_label"] = f"client-{str(row.get('installation_id', ''))[:8]}"
        for key in ["update_available", "consent_update", "consent_usage", "consent_diagnostics"]:
            if row.get(key) is not None:
                row[key] = bool(row[key])

    return {
        "ok": True,
        "generatedAt": now_iso(),
        "limit": limit,
        "offset": offset,
        "total": total,
        "installations": rows,
    }


def telemetry_events_payload(limit: int = 200, offset: int = 0) -> dict[str, Any]:
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)
    with telemetry_connection() as conn:
        rows = [
            dict(row)
            for row in conn.execute(
                """
                SELECT
                    event_id,
                    installation_id,
                    event_name,
                    event_category,
                    event_time,
                    received_at,
                    app_version,
                    platform,
                    arch,
                    payload_json
                FROM telemetry_events
                ORDER BY received_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        ]
        total = conn.execute("SELECT COUNT(*) AS c FROM telemetry_events").fetchone()["c"]

    for row in rows:
        row["installation_label"] = f"client-{str(row.get('installation_id', ''))[:8]}"
        try:
            row["properties"] = json.loads(row.pop("payload_json") or "{}")
        except Exception:
            row["properties"] = {}

    return {
        "ok": True,
        "generatedAt": now_iso(),
        "limit": limit,
        "offset": offset,
        "total": total,
        "events": rows,
    }


def rows_to_csv(rows: list[dict[str, Any]]) -> bytes:
    out = io.StringIO()
    fieldnames = sorted({key for row in rows for key in row.keys()})
    if not fieldnames:
        fieldnames = ["empty"]
    writer = csv.DictWriter(out, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        clean_row = {}
        for key in fieldnames:
            value = row.get(key, "")
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
            clean_row[key] = value
        writer.writerow(clean_row)
    return out.getvalue().encode("utf-8-sig")


def telemetry_export_payload(export_type: str) -> list[dict[str, Any]]:
    if export_type == "events":
        return telemetry_events_payload(limit=1000)["events"]
    return telemetry_installations_payload(limit=1000)["installations"]


def redact_log_text(text: str) -> str:
    text = re.sub(r"([?&]token=)[^&\s]+", r"\1[redacted]", text)
    text = re.sub(r"(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+/=-]+", r"\1[redacted]", text, flags=re.I)
    text = re.sub(r"(password[\"']?\s*[:=]\s*[\"']?)[^\"'\s,}]+", r"\1[redacted]", text, flags=re.I)
    text = re.sub(r"(X-OpenScience-Telemetry-Token:\s*)[A-Za-z0-9._~+/=-]+", r"\1[redacted]", text, flags=re.I)
    return text


def read_index() -> str:
    index_path = PUBLIC_DIR / "index.html"
    if index_path.exists():
        return index_path.read_text("utf-8")
    return "<!doctype html><title>OpenScience</title><h1>OpenScience update server</h1>"


def strip_public_prefix(raw_path: str) -> str:
    if PUBLIC_PATH_PREFIX and (raw_path == PUBLIC_PATH_PREFIX or raw_path.startswith(f"{PUBLIC_PATH_PREFIX}/")):
        return raw_path[len(PUBLIC_PATH_PREFIX) :] or "/"
    return raw_path


class DeepOrganiserHandler(SimpleHTTPRequestHandler):
    server_version = "DeepOrganiserUpdateServer/0.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), redact_log_text(fmt % args)))

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def send_json(
        self,
        data: dict[str, Any],
        status: HTTPStatus = HTTPStatus.OK,
        cache_seconds: int | None = UPDATE_CACHE_SECONDS,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if cache_seconds is None:
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header("Cache-Control", f"public, max-age={cache_seconds}")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_bytes(
        self,
        body: bytes,
        content_type: str,
        status: HTTPStatus = HTTPStatus.OK,
        cache_seconds: int | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if cache_seconds is None:
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header("Cache-Control", f"public, max-age={cache_seconds}")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def is_sync_authorized(self, parsed: Any) -> bool:
        if ALLOW_UNAUTHENTICATED_SYNC:
            return True
        if not SYNC_ADMIN_TOKEN:
            return False
        query_token = parse_qs(parsed.query).get("token", [""])[0]
        auth = self.headers.get("Authorization", "")
        bearer = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
        return query_token == SYNC_ADMIN_TOKEN or bearer == SYNC_ADMIN_TOKEN

    def is_telemetry_admin_authorized(self, parsed: Any) -> bool:
        if self.is_admin_session_authorized():
            return True
        if not TELEMETRY_ADMIN_TOKEN:
            return False
        query_token = parse_qs(parsed.query).get("token", [""])[0]
        auth = self.headers.get("Authorization", "")
        bearer = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
        return query_token == TELEMETRY_ADMIN_TOKEN or bearer == TELEMETRY_ADMIN_TOKEN

    def is_admin_session_authorized(self) -> bool:
        return get_admin_session(self.headers.get("Cookie", "")) is not None

    def require_admin(self) -> bool:
        if self.is_admin_session_authorized():
            return True
        self.send_json(
            {
                "ok": False,
                "error": "admin login required",
                "loginRequired": True,
            },
            HTTPStatus.UNAUTHORIZED,
            cache_seconds=None,
        )
        return False

    def is_telemetry_write_authorized(self) -> bool:
        if not TELEMETRY_WRITE_TOKEN:
            return True
        header_token = self.headers.get("X-OpenScience-Telemetry-Token", "")
        auth = self.headers.get("Authorization", "")
        bearer = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
        return header_token == TELEMETRY_WRITE_TOKEN or bearer == TELEMETRY_WRITE_TOKEN

    def read_json_body(self, max_bytes: int = TELEMETRY_MAX_BODY_BYTES) -> Any:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("invalid Content-Length")
        if length <= 0:
            raise ValueError("missing request body")
        if length > max_bytes:
            raise ValueError("request body is too large")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

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
        if raw_path in {"/admin", "/admin/", "/admin/index.html"}:
            admin_page = PUBLIC_DIR / "admin.html"
            if admin_page.exists():
                return self.send_text(admin_page.read_text("utf-8"), "text/html; charset=utf-8", cache_seconds=30)
            return self.send_error(HTTPStatus.NOT_FOUND, "admin page not found")
        if raw_path == "/api/status":
            maybe_start_github_sync()
            return self.send_json(status_payload())
        if raw_path == "/api/admin/session":
            session = get_admin_session(self.headers.get("Cookie", ""))
            return self.send_json(
                {
                    "ok": bool(session),
                    "authenticated": bool(session),
                    "configured": admin_password_configured(),
                    "username": session.get("username") if session else None,
                    "createdAt": session.get("created_at") if session else None,
                    "lastSeenAt": session.get("last_seen_at") if session else None,
                },
                cache_seconds=None,
            )
        if raw_path == "/api/github-sync":
            if not self.is_sync_authorized(parsed):
                return self.send_json(
                    {"ok": False, "error": "Force sync requires DEEPORGANISER_SYNC_TOKEN."},
                    HTTPStatus.FORBIDDEN,
                )
            maybe_start_github_sync(force=True)
            return self.send_json({"ok": True, "githubSync": load_sync_state()})
        if raw_path == "/api/admin/telemetry/summary":
            if not self.is_telemetry_admin_authorized(parsed):
                return self.send_json(
                    {"ok": False, "error": "Telemetry summary requires DEEPORGANISER_TELEMETRY_ADMIN_TOKEN."},
                    HTTPStatus.FORBIDDEN,
                    cache_seconds=None,
                )
            return self.send_json(telemetry_summary_payload(), cache_seconds=None)
        if raw_path == "/api/admin/telemetry/installations":
            if not self.require_admin():
                return
            query = parse_qs(parsed.query)
            limit = int(query.get("limit", ["200"])[0] or 200)
            offset = int(query.get("offset", ["0"])[0] or 0)
            return self.send_json(telemetry_installations_payload(limit, offset), cache_seconds=None)
        if raw_path == "/api/admin/telemetry/events":
            if not self.require_admin():
                return
            query = parse_qs(parsed.query)
            limit = int(query.get("limit", ["200"])[0] or 200)
            offset = int(query.get("offset", ["0"])[0] or 0)
            return self.send_json(telemetry_events_payload(limit, offset), cache_seconds=None)
        if raw_path == "/api/admin/telemetry/export":
            if not self.require_admin():
                return
            query = parse_qs(parsed.query)
            export_type = query.get("type", ["installations"])[0]
            export_format = query.get("format", ["csv"])[0]
            if export_type not in {"installations", "events"}:
                export_type = "installations"
            rows = telemetry_export_payload(export_type)
            filename = f"openscience-{export_type}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
            if export_format == "json":
                body = json.dumps(rows, ensure_ascii=False, indent=2).encode("utf-8")
                return self.send_bytes(
                    body,
                    "application/json; charset=utf-8",
                    extra_headers={"Content-Disposition": f'attachment; filename="{filename}.json"'},
                )
            return self.send_bytes(
                rows_to_csv(rows),
                "text/csv; charset=utf-8",
                extra_headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
            )
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

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-OpenScience-Telemetry-Token")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        raw_path = strip_public_prefix(parsed.path)

        if raw_path == "/api/admin/login":
            ip = client_ip(self.headers, self.client_address[0] if self.client_address else "unknown")
            if admin_login_rate_limited(ip):
                return self.send_json(
                    {"ok": False, "error": "Too many login attempts. Try again later."},
                    HTTPStatus.TOO_MANY_REQUESTS,
                    cache_seconds=None,
                )
            try:
                payload = self.read_json_body(max_bytes=8 * 1024)
                username = str(payload.get("username") or "")
                password = str(payload.get("password") or "")
            except Exception:
                return self.send_json({"ok": False, "error": "invalid login payload"}, HTTPStatus.BAD_REQUEST, cache_seconds=None)

            username_ok = hmac.compare_digest(username, ADMIN_USERNAME)
            password_ok = verify_admin_password(password)
            if not username_ok or not password_ok:
                return self.send_json({"ok": False, "error": "invalid username or password"}, HTTPStatus.UNAUTHORIZED, cache_seconds=None)

            token = create_admin_session(ip, self.headers.get("User-Agent", ""))
            return self.send_json(
                {"ok": True, "username": ADMIN_USERNAME},
                cache_seconds=None,
                extra_headers={"Set-Cookie": admin_session_cookie(token)},
            )

        if raw_path == "/api/admin/logout":
            revoke_admin_session(self.headers.get("Cookie", ""))
            return self.send_json(
                {"ok": True},
                cache_seconds=None,
                extra_headers={"Set-Cookie": clear_admin_session_cookie()},
            )

        if raw_path == "/api/telemetry/events":
            ip = client_ip(self.headers, self.client_address[0] if self.client_address else "unknown")
            if telemetry_rate_limited(ip):
                return self.send_json(
                    {"ok": False, "error": "rate limited"},
                    HTTPStatus.TOO_MANY_REQUESTS,
                    cache_seconds=None,
                )
            if not self.is_telemetry_write_authorized():
                return self.send_json(
                    {"ok": False, "error": "telemetry write token is invalid"},
                    HTTPStatus.FORBIDDEN,
                    cache_seconds=None,
                )
            try:
                payload = self.read_json_body()
                result = record_telemetry_batch(payload, ip)
                return self.send_json({"ok": True, **result}, cache_seconds=None)
            except ValueError as exc:
                return self.send_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST, cache_seconds=None)
            except Exception as exc:
                self.log_message("telemetry ingest failed: %s", exc)
                return self.send_json(
                    {"ok": False, "error": "telemetry ingest failed"},
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    cache_seconds=None,
                )

        self.send_error(HTTPStatus.NOT_FOUND, f"{html.escape(raw_path)} not found")

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
        if file_path.suffix.lower() in INSTALLER_EXTENSIONS:
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
    DATA_DIR.mkdir(parents=True, exist_ok=True)
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
    if not SYNC_STATE_PATH.exists():
        save_sync_state(
            {
                "enabled": ENABLE_GITHUB_SYNC,
                "repo": GITHUB_REPO,
                "status": "idle",
                "lastCheckedAt": None,
                "lastSuccessAt": None,
                "latestRelease": None,
                "message": "GitHub sync has not run yet.",
            }
        )
    init_telemetry_db()


def main() -> None:
    ensure_layout()
    if GITHUB_SYNC_ON_STARTUP:
        maybe_start_github_sync(force=True)
    httpd = ThreadingHTTPServer((HOST, PORT), DeepOrganiserHandler)
    print(f"DeepOrganiserServer listening on http://{HOST}:{PORT}")
    print(f"Public update base: {BASE_URL}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
