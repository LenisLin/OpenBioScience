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
- Local/private data-driven analysis without a paper target: `bio-omics-analysis`.
- Scoped scRNA-seq reproduction modules after planning:
  `bio-scrna-reproduction`.
- Runtime choice and reproducibility routing: `bio-environment-routing`.
- User environment gap resolution and registration: `bio-environment-manager`.
- Human-readable R/Python analysis script authoring:
  `bio-analysis-script-authoring`.
- Dataset/accession/source-file resolution: `bio-data-resolution`.
- Input import and raw/processed matrix semantics: `bio-singlecell-import`.
- QC and preprocessing: `bio-qc-preprocess`.
- Batch correction, dimensionality reduction, and clustering:
  `bio-batch-dim-cluster`.
- Marker ranking and threshold tuning: `bio-marker-optimization`.
- Replicate-aware condition differential expression: `bio-scrna-differential-expression`.
- Cell type annotation and confidence grading: `bio-cell-annotation`.
- Data-backed scRNA-seq figures: `bio-scrna-plotting`.
- Claim-boundary review and final interpretation: `bio-result-interpretation`.
- AnnData/Scanpy/scVI/scGPT: `kdense-anndata`, `kdense-scanpy`,
  `kdense-scvi-tools`, `kdense-scvelo`, `cs-scgpt`.
- Public datasets/registries: `kdense-cellxgene-census`,
  `kdense-database-lookup`, `kdense-gget`, `kdense-bioservices`; for tumor
  scRNA-seq discovery, use curated cancer single-cell resources such as TISCH2
  before GEO-scale archive search.
- Genomics support: `kdense-pysam`, `kdense-gtars`, `kdense-tiledbvcf`,
  `kdense-polars-bio`, `kdense-pydeseq2`, `cs-borzoi`, `cs-evo2`.
- Visualization and reports: `ds-nature-figure`, `ds-figure-polish`,
  `kdense-scientific-visualization`, Vitessce viewer metadata.

## SOP

1. If the user asks for full paper/demo reproduction, source/data/code audit,
   or figure/panel feasibility, start with
   `bio-omics-reproduction-planning`; if a Planning Package already scopes a
   scRNA-seq module, route that module to `bio-scrna-reproduction`. If the user
   supplies local/private data without a paper target, start with
   `bio-omics-analysis` and use `bio-singlecell-baseline`; do not call
   `bio_reproduction`. Otherwise route to the narrowest matching `bio-*` runbook.
2. Resolve accessions, repository files, local pointers, metadata availability,
   and raw-versus-processed status with `bio-data-resolution`. For public data,
   keep database/accession evidence local, use `bio_source.prepare_public_download`
   before transfer, and register completed local files with
   `bio_source.complete_public_download` / `complete_localization`.
3. Select or probe official execution environments with
   `bio-environment-routing`; refer to runtimes by `environmentRef`, not host
   paths. If official environments do not satisfy the planned module, route the
   environment gap to `bio-environment-manager` before script work.
4. Import local objects and classify matrix semantics with
   `bio-singlecell-import`.
5. Before execution, write or review human-readable sequential R/Python scripts
   with `bio-analysis-script-authoring`. Run analysis only through real
   Python/R/project code via MCP/runner; skills are runbooks, not executors. Do
   not summarize imagined Scanpy/Seurat outputs.
6. Follow the step skills in order when applicable: `bio-qc-preprocess` ->
   `bio-batch-dim-cluster` -> `bio-marker-optimization` ->
   `bio-cell-annotation` -> `bio-scrna-differential-expression` -> `bio-scrna-plotting` ->
   `bio-result-interpretation`.
   For free exploration, map these steps to `bio_analysis.prepare_exploration`
   workflow module ids and record the mapping in `scripts/script_manifest.json.workflowModules`.
7. Use `bio_knowledge.search_atlas` to confirm the local
   `scrna_atlas_markers.v1` marker-atlas package, then use
   `bio_knowledge.search_marker` for cluster marker evidence and
   `bio_knowledge.resolve_gene_set` for enrichment resources. Record local
   marker/gene-set resource ids, versions/status, paths, source papers,
   evidence type, and confidence in the script manifest and report.
8. Register evidence for input dataset, preprocessing, QC, model commands,
   logs, parameters, package versions, generated tables/figures, warnings, and
   claim boundaries through `science_artifact`.
9. For H5AD, spatial workspaces, or viewer outputs, create dataset/run-bundle
   artifacts before visualization. Use Vitessce only after preparing compatible
   config/data and recording validation, config paths, and warnings.
10. Snapshot scripts, notebooks, logs, figures, marker tables, annotation tables,
   model config, viewer config, and interpretation reports.

## Boundaries

Large raw matrices should usually be pointers with size, location, and access
status, while derived figures, metadata summaries, configs, and logs can be
copied into the artifact ledger.
