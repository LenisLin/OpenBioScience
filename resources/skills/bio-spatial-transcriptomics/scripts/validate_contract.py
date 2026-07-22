#!/usr/bin/env python3
"""Validate lightweight OpenBioScience spatial input and output manifests."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any

INPUT_SCHEMA = "openbioscience.spatial_input.v1"
OUTPUT_SCHEMA = "openbioscience.analysis_script.outputs.v2"
SOURCE_KINDS = {"tenx_visium", "squidpy_registry"}
SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
OUTPUT_GROUPS = {"objects", "tables", "figures", "reports", "logs", "scripts"}
REQUIRED_MODULES = {
    "spatial_source_localization",
    "spatial_input_validation",
    "spatial_spot_qc",
    "spatial_cluster_marker",
    "spatial_neighborhood",
    "spatial_morans_i",
    "spatial_figure_set",
    "spatial_report_package",
}


class ContractError(ValueError):
    """Represent one or more contract violations."""


def _object(value: Any, field: str, errors: list[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        errors.append(f"{field} must be an object")
        return {}
    return value


def _required_text(data: dict[str, Any], field: str, errors: list[str]) -> None:
    if not isinstance(data.get(field), str) or not data[field].strip():
        errors.append(f"{field} must be a non-empty string")


def _relative_path(value: Any, field: str, errors: list[str]) -> None:
    if not isinstance(value, str) or not value:
        errors.append(f"{field} must be a non-empty relative path")
        return
    normalized = value.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts or re.match(r"^[A-Za-z]:", normalized):
        errors.append(f"{field} must stay below the run root")


def _validate_file_entry(entry: Any, field: str, allow_embedded: bool, errors: list[str]) -> None:
    item = _object(entry, field, errors)
    if allow_embedded and item.get("embedded") is True:
        return
    _relative_path(item.get("path"), f"{field}.path", errors)
    if not SHA256_RE.fullmatch(str(item.get("sha256", ""))):
        errors.append(f"{field}.sha256 must be a 64-character hexadecimal digest")


def validate_input(data: dict[str, Any]) -> list[str]:
    """Validate a localized 10x Visium or Squidpy registry input declaration."""
    errors: list[str] = []
    if data.get("schema") != INPUT_SCHEMA:
        errors.append(f"schema must be {INPUT_SCHEMA}")
    for field in ("datasetId", "sampleId", "species"):
        _required_text(data, field, errors)
    if data.get("matrixSemantics") not in {"raw_counts", "processed_expression", "unknown"}:
        errors.append("matrixSemantics must be raw_counts, processed_expression, or unknown")

    source = _object(data.get("source"), "source", errors)
    kind = source.get("kind")
    if kind not in SOURCE_KINDS:
        errors.append("source.kind must be tenx_visium or squidpy_registry")
    for field in ("uri", "version"):
        if not isinstance(source.get(field), str) or not source[field].strip():
            errors.append(f"source.{field} must be a non-empty string")
    if source.get("localized") is not True:
        errors.append("source.localized must be true before analysis")
    if source.get("checksumAlgorithm") != "sha256":
        errors.append("source.checksumAlgorithm must be sha256")

    files = _object(data.get("files"), "files", errors)
    required = ("expression", "positions", "scalefactors", "image")
    for field in required:
        if field not in files:
            errors.append(f"files.{field} is required")
        else:
            _validate_file_entry(files[field], f"files.{field}", kind == "squidpy_registry", errors)
    return errors


def _collect_output_paths(outputs: dict[str, Any], errors: list[str]) -> set[str]:
    paths: set[str] = set()
    for group in OUTPUT_GROUPS:
        values = outputs.get(group)
        if not isinstance(values, list):
            errors.append(f"outputs.{group} must be an array")
            continue
        for index, value in enumerate(values):
            if isinstance(value, dict):
                value = value.get("path")
            _relative_path(value, f"outputs.{group}[{index}]", errors)
            if isinstance(value, str):
                paths.add(value.replace("\\", "/"))
    return paths


def validate_output(data: dict[str, Any]) -> list[str]:
    """Validate canonical spatial baseline output declarations."""
    errors: list[str] = []
    if data.get("schema") != OUTPUT_SCHEMA:
        errors.append(f"schema must be {OUTPUT_SCHEMA}")
    if data.get("workflowKind") != "omics_analysis":
        errors.append("workflowKind must be omics_analysis")
    if data.get("modality") != "spatial_transcriptomics":
        errors.append("modality must be spatial_transcriptomics")
    if data.get("environmentRef") != "sc-py-spatial":
        errors.append("environmentRef must be sc-py-spatial")
    if data.get("sourceKind") not in SOURCE_KINDS:
        errors.append("sourceKind must be tenx_visium or squidpy_registry")
    if data.get("matrixSemantics") not in {"raw_counts", "processed_expression", "unknown"}:
        errors.append("matrixSemantics is invalid")

    outputs = _object(data.get("outputs"), "outputs", errors)
    paths = _collect_output_paths(outputs, errors)
    required_paths = {
        "results/tables/coordinate_validation.tsv",
        "results/tables/qc_metrics.tsv",
        "results/tables/spot_filter_status.tsv",
        "results/tables/cluster_markers.tsv",
        "results/tables/spatial_neighbors_summary.tsv",
        "results/tables/morans_i.tsv",
        "reports/analysis_report.md",
        "logs/session_info.json",
        "logs/warnings.tsv",
    }
    missing_paths = sorted(required_paths - paths)
    if missing_paths:
        errors.append("missing canonical outputs: " + ", ".join(missing_paths))

    coordinate = _object(data.get("coordinateValidation"), "coordinateValidation", errors)
    if coordinate.get("status") not in {"passed", "coordinate_only", "blocked"}:
        errors.append("coordinateValidation.status must be passed, coordinate_only, or blocked")
    fraction = coordinate.get("barcodeMatchFraction")
    if not isinstance(fraction, (int, float)) or isinstance(fraction, bool) or not 0 <= fraction <= 1:
        errors.append("coordinateValidation.barcodeMatchFraction must be between 0 and 1")
    if coordinate.get("imageAvailable") is True:
        if coordinate.get("pixelBoundsPassed") is not True:
            errors.append("pixelBoundsPassed must be true when an image is available")
        _relative_path(coordinate.get("overlayPath"), "coordinateValidation.overlayPath", errors)

    statistics = _object(data.get("statistics"), "statistics", errors)
    if statistics.get("markerMultipleTesting") != "benjamini-hochberg":
        errors.append("statistics.markerMultipleTesting must be benjamini-hochberg")
    if statistics.get("moranMultipleTesting") != "benjamini-hochberg":
        errors.append("statistics.moranMultipleTesting must be benjamini-hochberg")
    tested = statistics.get("moranTestedFeatures")
    if not isinstance(tested, int) or isinstance(tested, bool) or tested < 1:
        errors.append("statistics.moranTestedFeatures must be a positive integer")

    modules = data.get("workflowModules")
    if not isinstance(modules, list):
        errors.append("workflowModules must be an array")
    else:
        module_ids = {item.get("moduleId") for item in modules if isinstance(item, dict)}
        missing_modules = sorted(REQUIRED_MODULES - module_ids)
        if missing_modules:
            errors.append("missing workflow modules: " + ", ".join(missing_modules))
        for index, item in enumerate(modules):
            if not isinstance(item, dict):
                errors.append(f"workflowModules[{index}] must be an object")
                continue
            if item.get("status") not in {"completed", "blocked", "not_applicable"}:
                errors.append(f"workflowModules[{index}].status is invalid")
            if item.get("environmentRef") != "sc-py-spatial":
                errors.append(f"workflowModules[{index}].environmentRef must be sc-py-spatial")
            if item.get("status") != "completed" and not str(item.get("reason", "")).strip():
                errors.append(f"workflowModules[{index}] requires a reason when not completed")
    return errors


def load_json(path: Path) -> dict[str, Any]:
    """Read a JSON object and reject invalid top-level values."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(str(exc)) from exc
    if not isinstance(data, dict):
        raise ContractError("manifest root must be an object")
    return data


def main() -> int:
    """Run input or output validation and return a shell-friendly status."""
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=("input", "output"))
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    try:
        data = load_json(args.manifest)
        errors = validate_input(data) if args.kind == "input" else validate_output(data)
    except ContractError as exc:
        errors = [str(exc)]
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: {args.kind} manifest satisfies the spatial baseline contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
