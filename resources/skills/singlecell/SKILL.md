---
name: openscience-singlecell
description: Router for single-cell, spatial omics, AnnData, Scanpy, scVI/scGPT, CellxGene, Vitessce, RNA-seq, gene programs, and omics artifact workflows in Science Mode.
---

# OpenScience Single-Cell Router

Use this skill for scRNA-seq, spatial omics, AnnData/H5AD, Scanpy, scVI,
scGPT, CellxGene, gene programs, UMAPs, markers, differential expression,
trajectory/velocity, and Vitessce-style exploration.

## Merge Map

- AnnData/Scanpy/scVI/scGPT: `kdense-anndata`, `kdense-scanpy`,
  `kdense-scvi-tools`, `kdense-scvelo`, JimLiu `scvi-tools`, `scgpt`.
- Public datasets/registries: `kdense-cellxgene-census`,
  `kdense-database-lookup`, `kdense-gget`, `kdense-bioservices`.
- Genomics support: `kdense-pysam`, `kdense-gtars`, `kdense-tiledbvcf`,
  `kdense-polars-bio`, `kdense-pydeseq2`.
- Visualization and reports: `ds-nature-figure`, `ds-figure-polish`,
  `kdense-scientific-visualization`, Vitessce viewer metadata.

## SOP

1. Identify raw inputs, processed matrices, metadata, batch/sample fields,
   annotations, and expected deliverables.
2. Run analysis through real Python/R/project code; do not summarize imagined
   Scanpy/scVI outputs.
3. Register evidence for input dataset, preprocessing, QC, model commands,
   logs, parameters, package versions, and generated tables/figures.
4. For H5AD or spatial workspaces, create dataset/run-bundle artifacts.
5. Use Vitessce only after preparing compatible config/data. Record conversion
   commands, validation, config paths, and warnings.
6. Snapshot scripts, notebooks, logs, figures, marker tables, model config, and
   viewer config.

## Boundaries

Large raw matrices should usually be pointers with hash/size/location, while
derived figures, metadata summaries, configs, and logs can be copied into the
artifact ledger.
