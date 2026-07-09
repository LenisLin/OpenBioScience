#!/usr/bin/env python3

from __future__ import annotations

import pandas as pd

from runner_utils import output_layout, parse_args, read_config, resolve_config_path, workflow_config, write_json, write_manifest


def main() -> int:
    args = parse_args("Run a minimal Scanpy QC/PCA/cluster smoke workflow.")
    config, config_path = read_config(args.config)
    config = workflow_config(config, "run_scanpy_core")
    counts_path = resolve_config_path(config.get("counts_path"), config_path)
    metadata_path = resolve_config_path(config.get("metadata_path"), config_path)
    if counts_path is None:
        raise ValueError("run_scanpy_core requires counts_path.")

    import anndata as ad
    import matplotlib.pyplot as plt
    import scanpy as sc

    paths = output_layout(args.output_dir)
    counts = pd.read_csv(counts_path, index_col=0)
    adata = ad.AnnData(X=counts.transpose().values)
    adata.obs_names = counts.columns.astype(str)
    adata.var_names = counts.index.astype(str)

    if metadata_path:
        metadata = pd.read_csv(metadata_path, index_col=0)
        adata.obs = adata.obs.join(metadata, how="left")

    sc.pp.calculate_qc_metrics(adata, percent_top=None, inplace=True)
    adata.obs.to_csv(paths["tables"] / "qc_metrics.tsv", sep="\t")
    sc.pp.normalize_total(adata, target_sum=1e4)
    sc.pp.log1p(adata)
    sc.pp.pca(adata, n_comps=min(2, adata.n_obs - 1, adata.n_vars - 1))
    sc.pp.neighbors(adata, n_neighbors=min(3, max(2, adata.n_obs - 1)), n_pcs=min(2, adata.obsm["X_pca"].shape[1]))
    sc.tl.umap(adata, random_state=0)
    sc.tl.leiden(adata, resolution=float(config.get("cluster_resolution", 0.4)), key_added="cluster")

    markers_path = paths["tables"] / "cluster_markers.tsv"
    if adata.obs["cluster"].nunique() > 1:
        sc.tl.rank_genes_groups(adata, "cluster", method="wilcoxon")
        marker_rows = []
        names = adata.uns["rank_genes_groups"]["names"]
        for cluster in names.dtype.names or []:
            for gene in list(names[cluster])[:5]:
                marker_rows.append({"cluster": cluster, "gene": gene})
        pd.DataFrame(marker_rows).to_csv(markers_path, sep="\t", index=False)
    else:
        pd.DataFrame(columns=["cluster", "gene"]).to_csv(markers_path, sep="\t", index=False)

    embedding = pd.DataFrame(adata.obsm["X_umap"], index=adata.obs_names, columns=["UMAP_1", "UMAP_2"])
    embedding["cluster"] = adata.obs["cluster"].astype(str).values
    embedding.to_csv(paths["tables"] / "umap.tsv", sep="\t")

    figure_path = paths["figures"] / "umap_clusters.png"
    fig, ax = plt.subplots(figsize=(4, 3))
    for cluster, group in embedding.groupby("cluster"):
        ax.scatter(group["UMAP_1"], group["UMAP_2"], label=cluster, s=36)
    ax.set_xlabel("UMAP_1")
    ax.set_ylabel("UMAP_2")
    ax.legend(title="cluster", frameon=False)
    fig.tight_layout()
    fig.savefig(figure_path, dpi=150)
    plt.close(fig)

    summary_path = paths["reports"] / "scanpy_core_summary.json"
    summary = {
        "schema": "openbioscience.scanpy_core.summary.v1",
        "nCells": int(adata.n_obs),
        "nGenes": int(adata.n_vars),
        "clusters": sorted(adata.obs["cluster"].astype(str).unique().tolist()),
    }
    write_json(summary_path, summary)
    artifacts = [str(summary_path), str(markers_path), str(figure_path), str(paths["tables"] / "umap.tsv")]
    write_manifest(paths, "run_scanpy_core", config, artifacts, [])
    (paths["logs"] / "scanpy_core.log").write_text("run_scanpy_core completed\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
