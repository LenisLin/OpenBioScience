#!/usr/bin/env python3

from __future__ import annotations

import csv
from pathlib import Path

from runner_utils import output_layout, parse_args, read_config, resolve_config_path, workflow_config, write_json, write_manifest


def detect_format(path: Path) -> str:
    if path.is_dir():
        names = {item.name.lower() for item in path.iterdir()}
        if {"matrix.mtx", "barcodes.tsv", "features.tsv"}.issubset(names) or {
            "matrix.mtx.gz",
            "barcodes.tsv.gz",
            "features.tsv.gz",
        }.issubset(names):
            return "10x_mtx"
        return "directory"
    suffix = path.suffix.lower()
    if suffix == ".h5ad":
        return "h5ad"
    if suffix == ".h5":
        return "10x_h5_or_hdf5"
    if suffix == ".rds":
        return "seurat_or_sce_rds"
    if suffix == ".mtx":
        return "matrix_market"
    if suffix in {".csv", ".tsv"}:
        return "table"
    if suffix == ".fcs":
        return "fcs"
    return "unknown"


def inspect_table(path: Path) -> dict[str, object]:
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        rows = list(reader)
    if not rows:
        return {"rows": 0, "columns": 0}
    return {"rows": max(len(rows) - 1, 0), "columns": len(rows[0]), "header": rows[0]}


def main() -> int:
    args = parse_args("Inspect a local single-cell input path.")
    config, config_path = read_config(args.config)
    config = workflow_config(config, "inspect_input")
    input_path = resolve_config_path(config.get("input_path") or config.get("counts_path"), config_path)
    if input_path is None:
        raise ValueError("inspect_input requires input_path or counts_path in config.")

    paths = output_layout(args.output_dir)
    input_format = detect_format(input_path)
    summary = {
        "schema": "openbioscience.singlecell_import.summary.v1",
        "inputPath": str(input_path),
        "inputFormat": input_format,
        "species": config.get("species", "unknown"),
        "matrixSemantics": "unknown",
        "warnings": [],
    }
    if input_format == "table":
        summary["table"] = inspect_table(input_path)

    report_path = paths["reports"] / "import_summary.json"
    write_json(report_path, summary)
    write_manifest(paths, "inspect_input", config, [str(report_path)], [])
    (paths["logs"] / "inspect_input.log").write_text("inspect_input completed\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
