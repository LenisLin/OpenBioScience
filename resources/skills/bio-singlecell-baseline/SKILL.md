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

## Free Exploration Boundary

This baseline restriction applies to checkpointed `baseline`. When the user asks for automated/free exploration, `bio_analysis(action="prepare_exploration")` uses its own module plan and may include response-aware composition comparison, processed-expression feature screening, and pathway enrichment in the same canonical exploration package. Label each result as `descriptive`, `exploratory_processed_expression`, or `replicate_aware_inference` according to its data and statistical contract.

## Contracts

Use `bio_analysis(action="prepare_qc"|"complete_qc")` and `prepare_baseline|complete_baseline`. Baseline outputs must include clustered object, cluster assignments, embedding coordinates, marker table, major annotation/evidence table, descriptive statistics, figures, logs, and `openbioscience.analysis_script.outputs.v2` manifest.

For annotation, preserve the supplied prior separately from marker/atlas evidence and final label. Prior is assistance, not a truth label. Use `bio-cell-annotation` in `assisted_prior` mode. Resolve marker evidence through `bio_knowledge.search_atlas` and `bio_knowledge.search_marker`; the default local package is `scrna_atlas_markers.v1`. The annotation evidence table must include resource id, source path, source paper, evidence type, confidence, marker hits, final label, and unresolved/ambiguous status.
