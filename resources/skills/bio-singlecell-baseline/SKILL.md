---
name: bio-singlecell-baseline
description: scRNA-seq baseline for private or local data analysis: QC, preprocessing, global clustering, markers, major assisted annotation, and descriptive summaries only.
---

# Bio Single-Cell Baseline

Use after the accepted intake checkpoint for a single selected scRNA-seq dataset unit.

## Included

- data description and import semantics;
- adaptive QC and preprocessing, including sample-level retention, doublet, normalization, HVG, and batch/confounding diagnostics;
- global dimensional reduction, clustering, embeddings, and cluster markers;
- major `assisted_prior` annotation with prior labels, marker evidence, final labels, confidence, and unresolved state;
- sample, condition, cluster, and major-label descriptive summaries plus QC, UMAP, marker, and composition figures.

## Excluded

Do not automatically run minor subtyping, condition DE, composition testing, trajectory, CCI, CNV, GRN, NMF, clinical association, or any other deep analysis. Each belongs to a separately planned and confirmed `episode`.

After baseline acceptance, recommend three to five data-supported candidate episodes. Do not execute a candidate without `bio_analysis(action="prepare_episode")` and a user-confirmed plan.

## Contracts

Use `bio_analysis(action="prepare_qc"|"complete_qc")` and `prepare_baseline|complete_baseline`. Baseline outputs must include clustered object, cluster assignments, embedding coordinates, marker table, major annotation/evidence table, descriptive statistics, figures, logs, and `openbioscience.analysis_script.outputs.v2` manifest.

For annotation, preserve the supplied prior separately from marker/atlas evidence and final label. Prior is assistance, not a truth label. Use `bio-cell-annotation` in `assisted_prior` mode.
