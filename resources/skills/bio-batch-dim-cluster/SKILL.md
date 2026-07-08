---
name: bio-batch-dim-cluster
description: >
  Use when a scRNA-seq workflow needs PCA, batch correction or integration, neighbor graph construction, UMAP/t-SNE, Leiden/Louvain clustering, clustering sensitivity review, or object preparation for markers and annotation. Applies after QC/preprocessing. Route marker ranking to bio-marker-optimization and annotation to bio-cell-annotation.
---

# Bio Batch Dimensionality Clustering

This skill specifies reproducible batch handling, dimensionality reduction, and clustering for scRNA-seq objects. It defines decision points and artifacts; execution is deferred to an approved runner when available; the current bio MCP layer only validates and plans contracts.

## OpenBioScience Adapter

- Use `bio_runtime.validate_workflow` for contract checks; execute only through an approved runner in an official `environmentRef` when that runner is available.
- Register integration parameters, seeds, embeddings, cluster assignments, diagnostics, and logs through `science_artifact`.
- Treat batch correction as a claim-affecting intervention, not a cosmetic default.
- Do not overwrite previous objects without artifact lineage.

## Scope

Use this skill for:

- PCA and component selection.
- Batch correction/integration decisions.
- Neighbor graph construction.
- UMAP/t-SNE embedding generation.
- Leiden/Louvain clustering and resolution sweeps.
- Cluster stability and batch mixing diagnostics.

Route elsewhere for:

- QC/preprocessing -> `bio-qc-preprocess`.
- Marker optimization -> `bio-marker-optimization`.
- Cell type annotation -> `bio-cell-annotation`.
- Plot assembly -> `bio-scrna-plotting`.

## Inputs

Required:

- preprocessed object path/artifact ID
- `sample_key` or explicit missing status
- `batch_key` or explicit no-batch status
- selected `environmentRef`

Recommended:

- `condition_key`
- `n_pcs` or PC selection rule
- integration method
- cluster resolution grid
- random seed

## Workflow

1. Verify object lineage and preprocessing summary.
2. Decide whether batch correction is required by design, diagnostics, and confounding status.
3. Run PCA and document PC selection.
4. Apply integration only when justified; preserve unintegrated diagnostics.
5. Build neighbor graph, embeddings, and clustering over a resolution grid.
6. Summarize cluster counts, sample/batch mixing, condition balance, and stability.
7. Save clustered object and register outputs through `science_artifact`.

## Output Contract

Every clustering run should produce:

- `reports/batch_dim_cluster_summary.json`
- `tables/cluster_assignments.tsv`
- `tables/embedding_coordinates.tsv`
- `tables/cluster_composition_by_sample.tsv`
- diagnostics figures
- clustered object path
- `logs/batch_dim_cluster.log`

Summary schema:

```json
{
  "schema": "openbioscience.batch_dim_cluster.summary.v1",
  "inputObject": "...",
  "environmentRef": "...",
  "batchCorrection": "none|applied|blocked",
  "method": "...",
  "nPcs": 0,
  "clusterKey": "...",
  "resolution": 0,
  "warnings": []
}
```

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Batch correction erases condition signal | batch and condition are confounded | Preserve uncorrected analysis and flag interpretation limits |
| Many tiny clusters | overly high resolution or QC artifact | Run resolution sweep and marker review |
| UMAP changes between runs | seed or package differences | Register seed and environment versions |
| Good mixing but poor biology | over-integration | Compare marker preservation and sample composition |

## Validation

- Cluster assignments align with cell barcodes in the object.
- Embedding and clustering are reproducible from saved config and seed.
- Batch/condition confounding status is stated.
- Diagnostics include composition by sample/batch when keys exist.

## Next

- Clusters finalized -> `bio-marker-optimization`.
- Annotation objective -> `bio-cell-annotation` after marker review.
- Figure objective -> `bio-scrna-plotting`.
