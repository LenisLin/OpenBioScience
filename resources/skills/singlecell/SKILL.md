---
name: openscience-singlecell
description: Router for single-cell, spatial omics, AnnData, Scanpy, scVI/scGPT, CellxGene, Vitessce, RNA-seq, gene programs, and omics artifact workflows in Science Mode.
---

# OpenScience Single-Cell Router

Use this skill for scRNA-seq, spatial omics, AnnData/H5AD, Scanpy, scVI,
scGPT, CellxGene, gene programs, UMAPs, markers, differential expression,
trajectory/velocity, and Vitessce-style exploration.

## Merge Map

- Handwritten OpenBioScience scRNA-seq runbooks are not owned by generated
  manifests or `scienceSkills.generated.ts`; route to them explicitly here.
- Full paper/demo reproduction planning: `bio-omics-reproduction-planning`.
- Scoped scRNA-seq reproduction modules after planning:
  `bio-scrna-reproduction`.
- Runtime choice and reproducibility routing: `bio-environment-routing`.
- Dataset/accession/source-file resolution: `bio-data-resolution`.
- Input import and raw/processed matrix semantics: `bio-singlecell-import`.
- QC and preprocessing: `bio-qc-preprocess`.
- Batch correction, dimensionality reduction, and clustering:
  `bio-batch-dim-cluster`.
- Marker ranking and threshold tuning: `bio-marker-optimization`.
- Cell type annotation and confidence grading: `bio-cell-annotation`.
- Data-backed scRNA-seq figures: `bio-scrna-plotting`.
- Claim-boundary review and final interpretation: `bio-result-interpretation`.
- AnnData/Scanpy/scVI/scGPT: `kdense-anndata`, `kdense-scanpy`,
  `kdense-scvi-tools`, `kdense-scvelo`, `cs-scgpt`.
- Public datasets/registries: `kdense-cellxgene-census`,
  `kdense-database-lookup`, `kdense-gget`, `kdense-bioservices`.
- Genomics support: `kdense-pysam`, `kdense-gtars`, `kdense-tiledbvcf`,
  `kdense-polars-bio`, `kdense-pydeseq2`, `cs-borzoi`, `cs-evo2`.
- Visualization and reports: `ds-nature-figure`, `ds-figure-polish`,
  `kdense-scientific-visualization`, Vitessce viewer metadata.

## SOP

1. If the user asks for full paper/demo reproduction, source/data/code audit,
   or figure/panel feasibility, start with
   `bio-omics-reproduction-planning`; if a Planning Package already scopes a
   scRNA-seq module, route that module to `bio-scrna-reproduction`. Otherwise
   route to the narrowest matching `bio-*` runbook.
2. Resolve accessions, repository files, local pointers, metadata availability,
   and raw-versus-processed status with `bio-data-resolution`.
3. Select or probe official execution environments with
   `bio-environment-routing`; refer to runtimes by `environmentRef`, not host
   paths.
4. Import local objects and classify matrix semantics with
   `bio-singlecell-import`.
5. Run analysis only through real Python/R/project code via MCP/runner; skills
   are runbooks, not executors. Do not summarize imagined Scanpy/Seurat outputs.
6. Follow the step skills in order when applicable: `bio-qc-preprocess` ->
   `bio-batch-dim-cluster` -> `bio-marker-optimization` ->
   `bio-cell-annotation` -> `bio-scrna-plotting` ->
   `bio-result-interpretation`.
7. Register evidence for input dataset, preprocessing, QC, model commands,
   logs, parameters, package versions, generated tables/figures, warnings, and
   claim boundaries through `science_artifact`.
8. For H5AD, spatial workspaces, or viewer outputs, create dataset/run-bundle
   artifacts before visualization. Use Vitessce only after preparing compatible
   config/data and recording validation, config paths, and warnings.
9. Snapshot scripts, notebooks, logs, figures, marker tables, annotation tables,
   model config, viewer config, and interpretation reports.

## Boundaries

Large raw matrices should usually be pointers with hash/size/location, while
derived figures, metadata summaries, configs, and logs can be copied into the
artifact ledger.
