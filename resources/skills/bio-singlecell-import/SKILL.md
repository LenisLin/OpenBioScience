---
name: bio-singlecell-import
description: >
  Use when importing or inspecting scRNA-seq inputs for OpenBioScience: 10x mtx or h5, h5ad, Seurat RDS, SingleCellExperiment, expression tables, metadata tables, or sparse matrices with uncertain raw-count status. Applies before QC, clustering, marker detection, annotation, plotting, DE, or reproduction claims. Route data lookup to bio-data-resolution and environment choice to bio-environment-routing.
---

# Bio Single-cell Import

This skill decides whether local single-cell inputs can be safely imported and what downstream claims they can support.

## OpenBioScience Adapter

- Treat `openscience-science`, `openscience-singlecell`, `openscience-compute`, and `openscience-science-artifact` as controlling contracts.
- Use this skill as workflow guidance, not as evidence or an execution engine.
- Use `research_evidence` only for source lookup; use `bio_runtime.validate_workflow` for import contract checks and `bio_runtime.run_workflow` for allowlisted `inspect_input` smoke runs.
- Record concrete inputs, code/config, logs, environment, output objects, warnings, and decisions through `science_artifact`.
- Do not install packages into official environments during analysis.
- Use `environmentRef` candidates such as `sc-py-singlecell` and `sc-r-singlecell`.

## Scope

Use this skill for:

- 10x `matrix.mtx` / `features.tsv` / `barcodes.tsv`.
- 10x `.h5`.
- `.h5ad`.
- Seurat `.rds`.
- SingleCellExperiment objects.
- Expression matrix plus metadata tables.
- HDF5 or sparse matrices whose raw-count status is uncertain.

Route elsewhere for:

- Data/source resolution -> `bio-data-resolution`.
- Environment probing -> `bio-environment-routing`.
- QC/preprocessing -> `bio-qc-preprocess`.
- Clustering -> `bio-batch-dim-cluster`.
- Marker/annotation/plotting/interpretation -> the matching bio skill.

## Inputs

Required:

- `input_path`
- `input_format` or `format:auto`
- `species`

Recommended:

- `metadata_path`
- `sample_key`, `patient_key`, `condition_key`, `batch_key`, `response_key`
- `gene_id_type`
- `barcode_column`
- `target_environmentRef`

## Workflow

1. Identify file format, object type, axes, and expected runtime.
2. Inspect matrix dimensions, dtype, integer-like status, sparsity, gene identifiers, barcode conventions, and metadata keys.
3. Classify matrix semantics as `raw_counts`, `processed_expression`, `metadata_only`, or `unknown`.
4. Join metadata and report sample/patient/condition/batch/response key completeness.
5. Select minimal `environmentRef` and prepare an object or conversion plan only when a cataloged runner is available.
6. Emit an import summary before downstream analysis.
7. Register imported object, logs, warnings, and blocked claims through `science_artifact`.

## Output Contract

Every successful import should produce:

- `reports/import_summary.json`
- `tables/input_shape.tsv`
- `tables/metadata_key_completeness.tsv`
- imported object path or explicit blocked reason
- `logs/import.log`
- environment/probe summary

Summary schema:

```json
{
  "schema": "openbioscience.singlecell_import.summary.v1",
  "inputPath": "...",
  "inputFormat": "10x_mtx|10x_h5|h5ad|seurat_rds|sce|hdf5_sparse|table",
  "matrixSemantics": "raw_counts|processed_expression|metadata_only|unknown",
  "nCells": 0,
  "nGenes": 0,
  "metadataKeys": [],
  "supportedClaims": [],
  "conditionalClaims": [],
  "blockedClaims": [],
  "warnings": []
}
```

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Values are float and non-integer | processed expression, not UMI counts | Avoid strict counts-based QC/DE claims |
| Barcodes do not match metadata | suffix or sample-prefix mismatch | Normalize convention and report unmatched rate |
| Duplicated gene symbols | alias collapse or mixed ID types | Preserve stable IDs and emit mapping table |
| Metadata lacks sample/patient key | pseudo-replication risk | Block sample-level comparison until resolved |

## Validation

- Matrix dimensions match gene and barcode axes.
- Metadata join rate is reported.
- Integer-like status and raw-count classification are reported.
- Required biological keys are present or explicitly missing.
- Imported object can be read back in the selected `environmentRef`.

## Next

- Raw counts and metadata sufficient -> `bio-qc-preprocess`.
- Processed expression only -> `bio-cell-annotation` or `bio-scrna-plotting` with limited claims.
- Missing data/source -> `bio-data-resolution`.
