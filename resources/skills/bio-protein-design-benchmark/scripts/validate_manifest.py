#!/usr/bin/env python3
"""Validate a protein design benchmark run manifest using only the standard library."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


RUN_STATUSES = {"planned", "running", "completed", "failed"}
STAGE_STATUSES = {"not_run", "planned", "running", "completed", "failed", "skipped"}


def is_sha256(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(character in "0123456789abcdefABCDEF" for character in value)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def add_issue(issues: list[dict[str, str]], level: str, code: str, message: str) -> None:
    issues.append({"level": level, "code": code, "message": message})


def validate_file_record(
    record: Any,
    label: str,
    base_dir: Path,
    check_files: bool,
    issues: list[dict[str, str]],
    require_hash: bool,
) -> None:
    if not isinstance(record, dict) or not isinstance(record.get("path"), str):
        add_issue(issues, "error", "invalid_file_record", f"{label} must contain a string path")
        return
    checksum = record.get("sha256")
    if require_hash and not is_sha256(checksum):
        add_issue(issues, "error", "missing_checksum", f"{label} requires a SHA-256 checksum")
    if not check_files:
        return
    path = Path(record["path"])
    if not path.is_absolute():
        path = base_dir / path
    if not path.is_file():
        add_issue(issues, "error", "missing_file", f"{label} does not exist: {path}")
        return
    if is_sha256(checksum):
        actual = sha256_file(path)
        if actual.lower() != checksum.lower():
            add_issue(issues, "error", "checksum_mismatch", f"{label} checksum does not match: {path}")


def validate_path(path_value: Any, label: str, base_dir: Path, check_files: bool, issues: list[dict[str, str]]) -> None:
    if not isinstance(path_value, str) or not path_value:
        add_issue(issues, "error", "invalid_path", f"{label} must be a non-empty path string")
        return
    if check_files:
        path = Path(path_value)
        if not path.is_absolute():
            path = base_dir / path
        if not path.is_file():
            add_issue(issues, "error", "missing_file", f"{label} does not exist: {path}")


def validate_manifest(data: Any, manifest_path: Path, check_files: bool) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    if not isinstance(data, dict):
        return [{"level": "error", "code": "invalid_root", "message": "manifest root must be an object"}]

    for key in ("schema_version", "benchmark_id", "benchmark_kind", "run", "inputs", "design_protocol", "stages", "outputs"):
        if key not in data:
            add_issue(issues, "error", "missing_field", f"missing required field: {key}")
    if data.get("schema_version") != "1.0":
        add_issue(issues, "error", "unsupported_schema", "schema_version must be 1.0")
    if data.get("benchmark_kind") != "backbone_sequence_recovery":
        add_issue(issues, "error", "unsupported_kind", "benchmark_kind must be backbone_sequence_recovery")

    run = data.get("run") if isinstance(data.get("run"), dict) else {}
    mode = run.get("mode")
    status = run.get("status")
    if mode not in {"model_benchmark", "smoke_fixture"}:
        add_issue(issues, "error", "invalid_mode", "run.mode must be model_benchmark or smoke_fixture")
    if status not in RUN_STATUSES:
        add_issue(issues, "error", "invalid_run_status", f"run.status must be one of {sorted(RUN_STATUSES)}")
    if status == "completed":
        for field in ("started_at", "completed_at", "command_log", "environment"):
            if not run.get(field):
                add_issue(issues, "error", "incomplete_provenance", f"completed run requires run.{field}")
        validate_path(run.get("command_log"), "run.command_log", manifest_path.parent, check_files, issues)
        validate_path(run.get("environment"), "run.environment", manifest_path.parent, check_files, issues)

    protocol = data.get("design_protocol") if isinstance(data.get("design_protocol"), dict) else {}
    if protocol.get("indexing") != "sequence_1_based":
        add_issue(issues, "error", "invalid_indexing", "design_protocol.indexing must be sequence_1_based")
    positions = protocol.get("design_positions")
    if not isinstance(positions, list) or not positions or any(not isinstance(value, int) or value < 1 for value in positions):
        add_issue(issues, "error", "invalid_design_positions", "design_positions must be a non-empty list of positive integers")
    elif len(positions) != len(set(positions)):
        add_issue(issues, "error", "duplicate_design_positions", "design_positions must be unique")

    inputs = data.get("inputs") if isinstance(data.get("inputs"), dict) else {}
    outputs = data.get("outputs") if isinstance(data.get("outputs"), dict) else {}
    require_hash = mode == "model_benchmark" and status == "completed"
    validate_file_record(inputs.get("native_fasta"), "inputs.native_fasta", manifest_path.parent, check_files, issues, require_hash)
    if mode == "model_benchmark":
        validate_file_record(inputs.get("backbone_structure"), "inputs.backbone_structure", manifest_path.parent, check_files, issues, require_hash)
    validate_file_record(outputs.get("design_fasta"), "outputs.design_fasta", manifest_path.parent, check_files, issues, require_hash)
    if "structure_metrics_table" in outputs:
        validate_file_record(outputs["structure_metrics_table"], "outputs.structure_metrics_table", manifest_path.parent, check_files, issues, require_hash)

    stages = data.get("stages") if isinstance(data.get("stages"), dict) else {}
    for stage_name in ("proteinmpnn", "sequence_scoring", "folding"):
        stage = stages.get(stage_name)
        if not isinstance(stage, dict):
            add_issue(issues, "error", "missing_stage", f"stages.{stage_name} must be an object")
            continue
        stage_status = stage.get("status")
        if stage_status not in STAGE_STATUSES:
            add_issue(issues, "error", "invalid_stage_status", f"stages.{stage_name}.status is invalid")
            continue
        if stage_status == "skipped" and not stage.get("reason"):
            add_issue(issues, "error", "missing_skip_reason", f"skipped stage {stage_name} requires a reason")
        if stage_status == "completed":
            for field in ("tool", "model_id", "model_revision", "checkpoint_sha256", "seeds", "parameters", "outputs"):
                value = stage.get(field)
                if value in (None, "", [], {}):
                    add_issue(issues, "error", "incomplete_stage_provenance", f"completed stage {stage_name} requires {field}")
            checkpoint_sha256 = stage.get("checkpoint_sha256")
            if not is_sha256(checkpoint_sha256):
                add_issue(issues, "error", "invalid_checkpoint_checksum", f"completed stage {stage_name} requires a 64-character checkpoint SHA-256")
            model_revision = str(stage.get("model_revision", "")).strip().lower()
            if model_revision in {"latest", "main", "master", "head"}:
                add_issue(issues, "error", "mutable_model_revision", f"completed stage {stage_name} requires an immutable model revision")
            stage_outputs = stage.get("outputs")
            if isinstance(stage_outputs, list):
                for index, output_path in enumerate(stage_outputs):
                    validate_path(output_path, f"stages.{stage_name}.outputs[{index}]", manifest_path.parent, check_files, issues)
        if mode == "model_benchmark" and status == "completed" and stage_status != "completed":
            add_issue(issues, "error", "incomplete_model_stage", f"completed model benchmark requires completed {stage_name} stage")

    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--check-files", action="store_true", help="Check referenced files and declared checksums")
    parser.add_argument("--output-json", type=Path, help="Optional validation report path")
    args = parser.parse_args()

    try:
        data = json.loads(args.manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "issues": [{"level": "error", "code": "read_error", "message": str(exc)}]}, indent=2))
        return 1

    issues = validate_manifest(data, args.manifest.resolve(), args.check_files)
    report = {"valid": not any(item["level"] == "error" for item in issues), "issues": issues}
    rendered = json.dumps(report, indent=2, sort_keys=True)
    print(rendered)
    if args.output_json:
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(rendered + "\n", encoding="utf-8")
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
