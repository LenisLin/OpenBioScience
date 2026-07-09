---
name: bio-qc-preprocess
description: >
  Use when a scRNA-seq workflow needs QC, filtering, mitochondrial/ribosomal metrics, doublet handling, normalization, highly-variable gene selection, scaling, or preprocessing summaries before clustering, marker detection, annotation, or plotting. Applies after bio-singlecell-import and before bio-batch-dim-cluster. Route raw input issues back to bio-singlecell-import.
---

# Bio QC Preprocess

This skill defines auditable QC and preprocessing for imported single-cell objects. It specifies decisions and outputs; execution is deferred to an approved runner; the current MCP layer validates workflow contracts only.

## OpenBioScience Adapter

- Use `bio_runtime.validate_workflow` to check QC/preprocessing contracts; execute only through cataloged `bio_runtime.run_workflow` runners such as `run_scanpy_core` or `run_seurat_core`.
- Use `environmentRef` such as `sc-py-singlecell` or `sc-r-singlecell`; do not encode host paths.
- Register parameters, thresholds, object versions, QC plots/tables, logs, and warnings through `science_artifact`.
- Treat threshold choices as analysis decisions that require provenance.
- Do not infer biological success from visually attractive embeddings.

## Scope

Use this skill for:

- Cell/gene filtering.
- Mitochondrial, ribosomal, detected-gene, UMI/count, and complexity metrics.
- Doublet-score integration or documented deferral.
- Normalization/log transform.
- Highly variable gene selection and optional scaling/regression.

Route elsewhere for:

- Import/read failures -> `bio-singlecell-import`.
- Batch correction, PCA, UMAP, clustering -> `bio-batch-dim-cluster`.
- Marker tuning -> `bio-marker-optimization`.
- Interpretation -> `bio-result-interpretation`.

## Inputs

Required:

- imported object path/artifact ID
- `matrixSemantics`
- `species`
- selected `environmentRef`

Recommended:

- `sample_key`
- `batch_key`
- filtering thresholds or `thresholds:auto_with_report`
- doublet method/decision
- normalization method

## Workflow

1. Confirm raw-count suitability; block counts-dependent QC if semantics are processed/unknown.
2. Compute per-cell and per-gene QC metrics by sample and batch where available.
3. Propose thresholds from distributions and user/reproduction constraints; do not hide threshold choices.
4. Apply filtering and record retained/removed counts by sample/batch.
5. Normalize, transform, identify highly variable genes, and scale/regress only when justified.
6. Save preprocessed object and QC summary before clustering.
7. Register all artifacts and warnings through `science_artifact`.

## Output Contract

Every preprocessing run should produce:

- `reports/qc_preprocess_summary.json`
- `tables/qc_metrics_by_cell.tsv`
- `tables/qc_retention_by_sample.tsv`
- `tables/hvg_table.tsv`
- QC figures registered as artifacts
- preprocessed object path
- `logs/qc_preprocess.log`

Summary schema:

```json
{
  "schema": "openbioscience.qc_preprocess.summary.v1",
  "inputObject": "...",
  "environmentRef": "...",
  "matrixSemantics": "raw_counts|processed_expression|unknown",
  "thresholds": {},
  "nCellsBefore": 0,
  "nCellsAfter": 0,
  "nGenesBefore": 0,
  "nGenesAfter": 0,
  "warnings": []
}
```

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| One sample loses most cells | sample-specific quality or threshold mismatch | Report retention by sample and reconsider threshold |
| Regression removes biology | condition confounded with QC/batch covariate | Do not regress confounded covariates without explicit caveat |
| Doublet method unavailable | environment or species marker limitation | Record deferred doublet handling and downstream risk |
| Processed matrix passed to QC | raw counts unavailable | Limit to metadata/plot-level checks and block count QC claims |

## Validation

- QC metrics are stratified by available sample/batch keys.
- Filtering thresholds and retained counts are reproducible from saved config.
- Output object is readable in selected `environmentRef`.
- Warnings include confounding, missing metadata, and unsupported raw-count assumptions.

## Next

- QC complete -> `bio-batch-dim-cluster`.
- Filtering instability or unexpected retention -> revisit import/data resolution.
- Need publication figures -> `bio-scrna-plotting` after downstream analysis.
