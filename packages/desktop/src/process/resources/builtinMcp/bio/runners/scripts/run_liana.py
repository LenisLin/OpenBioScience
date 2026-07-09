#!/usr/bin/env python3

from __future__ import annotations

import importlib

import pandas as pd

from runner_utils import output_layout, parse_args, read_config, resolve_config_path, workflow_config, write_json, write_manifest


def main() -> int:
    args = parse_args("Run a minimal ligand-receptor scoring smoke workflow.")
    config, config_path = read_config(args.config)
    config = workflow_config(config, "run_liana")
    counts_path = resolve_config_path(config.get("counts_path"), config_path)
    metadata_path = resolve_config_path(config.get("metadata_path"), config_path)
    lr_pairs_path = resolve_config_path(config.get("lr_pairs_path"), config_path)
    if counts_path is None or metadata_path is None or lr_pairs_path is None:
        raise ValueError("run_liana requires counts_path, metadata_path, and lr_pairs_path.")

    liana_status = "available"
    try:
        importlib.import_module("liana")
    except Exception as exc:
        liana_status = f"unavailable: {type(exc).__name__}: {exc}"

    paths = output_layout(args.output_dir)
    counts = pd.read_csv(counts_path, index_col=0)
    metadata = pd.read_csv(metadata_path, index_col=0)
    lr_pairs = pd.read_csv(lr_pairs_path, sep="\t")
    cell_type_key = str(config.get("cell_type_key", "cell_type"))

    expr = counts.transpose().join(metadata[[cell_type_key]])
    means = expr.groupby(cell_type_key).mean(numeric_only=True)
    rows = []
    for _, pair in lr_pairs.iterrows():
        ligand = pair["ligand"]
        receptor = pair["receptor"]
        for source_cell, source_values in means.iterrows():
            for target_cell, target_values in means.iterrows():
                ligand_expr = float(source_values.get(ligand, 0.0))
                receptor_expr = float(target_values.get(receptor, 0.0))
                rows.append(
                    {
                        "source_cell": source_cell,
                        "target_cell": target_cell,
                        "ligand": ligand,
                        "receptor": receptor,
                        "pathway": pair.get("pathway", ""),
                        "score": ligand_expr * receptor_expr,
                    }
                )

    interactions = pd.DataFrame(rows).sort_values("score", ascending=False)
    table_path = paths["tables"] / "liana_lr_scores.tsv"
    interactions.to_csv(table_path, sep="\t", index=False)
    summary_path = paths["reports"] / "liana_summary.json"
    write_json(
        summary_path,
        {
            "schema": "openbioscience.cci_liana.summary.v1",
            "lianaStatus": liana_status,
            "nInteractions": int(len(interactions)),
            "topScore": float(interactions["score"].max()) if len(interactions) else 0.0,
        },
    )
    write_manifest(paths, "run_liana", config, [str(summary_path), str(table_path)], [])
    (paths["logs"] / "liana.log").write_text("run_liana completed\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
