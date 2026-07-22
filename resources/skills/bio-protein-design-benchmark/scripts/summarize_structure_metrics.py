#!/usr/bin/env python3
"""Validate and summarize externally computed structure self-consistency metrics."""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path


NUMERIC_RANGES: dict[str, tuple[float, float | None]] = {
    "mean_plddt": (0.0, 100.0),
    "ptm": (0.0, 1.0),
    "iptm": (0.0, 1.0),
    "pae_mean": (0.0, None),
    "aligned_ca_rmsd": (0.0, None),
    "tm_score": (0.0, 1.0),
    "coverage": (0.0, 1.0),
}
LOWER_IS_BETTER = {"pae_mean", "aligned_ca_rmsd"}


def parse_metric(row: dict[str, str], name: str, row_number: int) -> float | None:
    raw = (row.get(name) or "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
    except ValueError as exc:
        raise ValueError(f"row {row_number}: {name} is not numeric") from exc
    minimum, maximum = NUMERIC_RANGES[name]
    if value < minimum or (maximum is not None and value > maximum):
        raise ValueError(f"row {row_number}: {name} outside [{minimum}, {maximum if maximum is not None else 'inf'}]")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-csv", required=True, type=Path)
    parser.add_argument("--mode", required=True, choices=("monomer", "complex"))
    parser.add_argument("--selection-metric", choices=tuple(NUMERIC_RANGES))
    parser.add_argument("--output-json", required=True, type=Path)
    parser.add_argument("--output-csv", required=True, type=Path)
    args = parser.parse_args()
    selection_metric = args.selection_metric or ("mean_plddt" if args.mode == "monomer" else "iptm")
    if args.mode == "complex" and selection_metric == "mean_plddt":
        print("error: complexes must not be selected by mean_plddt alone", file=sys.stderr)
        return 1

    try:
        with args.input_csv.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            required = {"candidate_id", "model_id", "status"}
            if reader.fieldnames is None or not required.issubset(reader.fieldnames):
                raise ValueError(f"input requires columns: {sorted(required)}")
            parsed_rows: list[dict[str, object]] = []
            for row_number, row in enumerate(reader, start=2):
                candidate_id = (row.get("candidate_id") or "").strip()
                model_id = (row.get("model_id") or "").strip()
                status = (row.get("status") or "").strip().lower()
                if not candidate_id or not model_id:
                    raise ValueError(f"row {row_number}: candidate_id and model_id are required")
                if status not in {"completed", "failed"}:
                    raise ValueError(f"row {row_number}: status must be completed or failed")
                parsed: dict[str, object] = {"candidate_id": candidate_id, "model_id": model_id, "status": status}
                for metric in NUMERIC_RANGES:
                    parsed[metric] = parse_metric(row, metric, row_number)
                parsed_rows.append(parsed)
        if not parsed_rows:
            raise ValueError("input table has no data rows")
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    by_candidate: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in parsed_rows:
        by_candidate[str(row["candidate_id"])].append(row)

    selected: list[dict[str, object]] = []
    unselected: list[dict[str, object]] = []
    for candidate_id, candidate_rows in sorted(by_candidate.items()):
        eligible = [row for row in candidate_rows if row["status"] == "completed" and row[selection_metric] is not None]
        if not eligible:
            unselected.append({"candidate_id": candidate_id, "reason": f"no completed model with {selection_metric}"})
            continue
        reverse = selection_metric not in LOWER_IS_BETTER
        best = sorted(eligible, key=lambda row: float(row[selection_metric]), reverse=reverse)[0]
        selected.append(best)

    aggregate: dict[str, float | None] = {}
    for metric in NUMERIC_RANGES:
        values = [float(row[metric]) for row in selected if row[metric] is not None]
        aggregate[f"mean_selected_{metric}"] = statistics.fmean(values) if values else None

    summary = {
        "mode": args.mode,
        "selection_metric": selection_metric,
        "interpretation_scope": "predicted-structure self-consistency only",
        "candidate_count": len(by_candidate),
        "model_count": len(parsed_rows),
        "completed_model_count": sum(row["status"] == "completed" for row in parsed_rows),
        "failed_model_count": sum(row["status"] == "failed" for row in parsed_rows),
        "selected_candidate_count": len(selected),
        "unselected_candidates": unselected,
        "aggregate": aggregate,
        "selected_models": selected,
        "limitations": [
            "Predictor confidence and geometric agreement do not establish experimental folding or biological performance.",
            "Comparisons are valid only when candidates use the same declared prediction and alignment protocol.",
        ],
    }

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    fieldnames = ["candidate_id", "model_id", "status", *NUMERIC_RANGES]
    with args.output_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows({key: row.get(key) for key in fieldnames} for row in selected)
    print(json.dumps({"selected_candidate_count": len(selected), "failed_model_count": summary["failed_model_count"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())

