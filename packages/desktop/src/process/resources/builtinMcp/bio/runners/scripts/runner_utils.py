#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any


RUNNER_SCHEMA = "openbioscience.runner_manifest.v1"


def repo_root() -> Path:
    for candidate in [Path.cwd(), *Path(__file__).resolve().parents]:
        if (candidate / ".git").exists():
            return candidate.resolve()
    return Path.cwd().resolve()


def read_config(path: str | None) -> tuple[dict[str, Any], Path | None]:
    if not path:
        return {}, None
    config_path = Path(path).expanduser().resolve()
    text = config_path.read_text(encoding="utf-8")
    if config_path.suffix.lower() == ".json":
        return json.loads(text), config_path

    import yaml

    value = yaml.safe_load(text) or {}
    if not isinstance(value, dict):
        raise ValueError("Runner config must be a JSON/YAML object.")
    return value, config_path


def workflow_config(config: dict[str, Any], workflow_id: str) -> dict[str, Any]:
    workflows = config.get("workflows")
    if not isinstance(workflows, dict) or workflow_id not in workflows:
        return config
    base = {key: value for key, value in config.items() if key != "workflows"}
    selected = workflows[workflow_id]
    if not isinstance(selected, dict):
        raise ValueError(f"Workflow config for {workflow_id} must be an object.")
    return {**base, **selected}


def parse_args(description: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--config", help="JSON or YAML runner config.")
    parser.add_argument("--output-dir", required=True, help="Output directory for manifest, logs, tables, and figures.")
    return parser.parse_args()


def approved_roots() -> list[Path]:
    values = [
        os.environ.get("OPENBIOSCIENCE_WORKSPACE_ROOT"),
        os.environ.get("OPENBIOSCIENCE_RUNTIME_ROOT"),
        os.environ.get("OPENSCIENCE_RUNTIME_ROOT"),
        os.environ.get("DEEPORGANISER_WORK_DIR"),
    ]
    roots = [Path(value).expanduser().resolve() for value in values if value]
    roots.append(repo_root())
    return sorted(set(roots))


def is_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def require_approved_path(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not any(is_under(resolved, root) for root in approved_roots()):
        roots = ", ".join(str(root) for root in approved_roots())
        raise ValueError(f"Path is outside approved OpenBioScience roots: {resolved}. Approved roots: {roots}")
    return resolved


def resolve_config_path(value: str | None, config_path: Path | None) -> Path | None:
    if not value:
        return None
    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        return require_approved_path(candidate)
    if config_path:
        by_config = (config_path.parent / candidate).resolve()
        if by_config.exists():
            return require_approved_path(by_config)
    return require_approved_path(repo_root() / candidate)


def output_layout(output_dir: str) -> dict[str, Path]:
    root = require_approved_path(Path(output_dir))
    paths = {
        "root": root,
        "reports": root / "reports",
        "tables": root / "tables",
        "figures": root / "figures",
        "logs": root / "logs",
    }
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_manifest(paths: dict[str, Path], workflow_id: str, config: dict[str, Any], artifacts: list[str], warnings: list[str]) -> None:
    manifest = {
        "schema": RUNNER_SCHEMA,
        "workflowId": workflow_id,
        "status": "completed",
        "config": config,
        "artifacts": artifacts,
        "warnings": warnings,
    }
    write_json(paths["root"] / "run_manifest.json", manifest)
