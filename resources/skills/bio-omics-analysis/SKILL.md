---
name: bio-omics-analysis
description: Human-in-the-loop workflow for user-authorized local or private omics data. Use for data-driven analysis without a paper reproduction objective.
---

# Bio Omics Analysis

Use this workflow for user-provided local/private omics data. Do not invoke `bio_reproduction` unless the user has an explicit paper, figure, panel, or reproduction target.

## Lifecycle

`intake -> qc -> baseline -> episode* -> closing`

Start with `bio_analysis(action="start_analysis")`. The user must specify an input root inside the authorized workspace. Keep each dataset unit separate; multiple units are not merged automatically.

## Human Gates

Call `bio_analysis(action="request_checkpoint")` after `complete_intake`, `complete_qc`, `complete_baseline`, and every `complete_episode` result. Only an `accepted` checkpoint allows the next stage. `accepted_with_changes` and `needs_revision` require a revised plan/result; `deferred`, timeout, and cancellation remain `awaiting_user`.

The mandatory gates are intake, QC, and major assisted annotation in baseline. Do not use a self-authored receipt, a text confirmation, or a previous conversation response as a replacement.

## Scope

- `intake`: inventory, dataset units, matrix/metadata profile, privacy/egress boundary, and staging object or block.
- `qc`: data-adaptive thresholds, sample retention, doublet/normalization/HVG/batch diagnostics, and a candidate preprocessed object.
- `baseline`: global clustering, markers, major assisted annotation, confidence/unresolved labels, descriptive counts, and standard figures.
- `exploration`: automated discovery package for private data when the user asks for free/automatic exploration without staged checkpoints. It must be more than an intake audit when data are readable.
- `episode`: one confirmed question at a time. Declare the parent receipt, subset, comparison, covariates, repeat unit, method, outputs, and stopping conditions. Inference requires a current `bio_statistics` receipt.
- `closing`: generate a coverage contract then a final report. Include only user-accepted results in the narrative; list failed or abandoned work in a concise audit table.

## Free Exploration Minimum Deliverables

For scRNA-seq `prepare_exploration` / `complete_exploration`, produce a useful discovery package unless the input matrix or required metadata are unreadable. The minimum package is:

- input inventory, matrix semantics, metadata key audit, and explicit raw-count/processed-expression decision;
- QC metrics and retained cell/gene/sample summaries;
- dimensional reduction and global clustering, or a blocker explaining why a supplied embedding/clustering must be reused or why clustering is impossible;
- major cell-class annotation with marker evidence and unresolved/ambiguous labels preserved;
- marker ranking table plus marker heatmap and dotplot;
- sample/patient-level cell fraction table and response/condition fraction comparison when group metadata such as R/NR exist;
- processed-expression differential feature screening when raw integer counts are unavailable, with effect sizes, detection fractions, multiplicity adjustment, and non-confirmatory status;
- pathway enrichment from ranked exploratory features when enough ranked genes are available, with gene-set source, universe, and failure/blocker rows. Prefer localized MSigDB resources under `OPENBIOSCIENCE_MSIGDB_ROOT`; if only the shipped compact fallback is available, label it as exploratory and include its filename and resource id in the report/manifest;
- blocked/limited contrast table, final report, output manifest, script, logs, and package/session information.

Do not complete `exploration` with only file inventory, metadata auditing, or "raw counts unavailable" unless the report and manifest show that clustering, annotation, feature screening, and enrichment were impossible for concrete data reasons.

## Free Exploration Step Template

Use this ordered template for local/private exploration and public dataset discovery:

1. Classify the task as `omics_analysis/free_exploration` and create or update the Science artifact.
2. For public tumor scRNA-seq requests, search curated cancer single-cell sources such as TISCH2 before broad GEO/ArrayExpress archive search. Use online database MCPs for live registry search; record only the database page, accession, and candidate evidence needed for provenance.
3. Use `bio_source(action="rank_dataset_candidates")` to compare candidates, `prepare_public_download` to write a selected-file download plan, and `complete_public_download` / `complete_localization` after selected files are available under `data/public/<source>/<accession>/`. Request user confirmation before raw matrix or unusually large downloads.
4. Start the analysis with `bio_analysis(action="start_analysis")`, then call `prepare_exploration`.
5. Bind each module from `prepare_exploration.minimumAnalysisPlan` to `skillIds`, `mcpTools`, `environmentRef`, implementation files, and expected outputs.
6. Probe selected environments with `bio_runtime`; use `sc-py-singlecell` as the default and module-specific R environments when the module contract selects them.
7. Read data and write intake summary, matrix semantics, metadata key audit, and raw-count/processed-expression decision.
8. Run the standard single-cell sequence: import -> QC -> normalization/HVG -> PCA -> neighbors -> UMAP -> Leiden/resolution sweep -> markers.
9. Annotate major cell classes with prior labels when present plus localized marker/atlas evidence. First call `bio_knowledge.search_atlas` to confirm the local `scrna_atlas_markers.v1` package, then call `bio_knowledge.search_marker` for cluster marker panels; record marker resource id, version/status, source path, source papers, evidence type, and confidence.
10. Generate marker heatmap/dotplot, response or condition fraction summaries, processed-expression feature screening, pathway enrichment through `bio_knowledge.resolve_gene_set`, and result-strength labels.
11. Write `scripts/script_manifest.json.workflowModules`, output manifest, report, logs, warnings table, and session/package information.
12. Complete `bio_analysis(action="complete_exploration")` and publish through `science_artifact`.

## Privacy

Never copy raw matrices or complete metadata into artifact snapshots. External calls may use only allowlisted species, tissue, and gene-symbol fields. Local outputs retain sample/patient identifiers; external export requires a visible risk decision.

## Output Rules

Use `omics_analysis/<analysisId>/` with fixed `intake/`, `qc/`, `baseline/`, `episodes/<episodeId>/`, and `reports/` locations. Executable stages contain `scripts/`, `configs/`, `results/objects/`, `results/tables/`, `results/figures/`, and `logs/`. Submit receipt IDs, never receipt objects, to `science_artifact`.

Free exploration writes only under `omics_analysis/<analysisId>/exploration/`. Its required tables include `input_inventory`, `qc_metrics`, `cluster_assignments`, `embedding_coordinates`, `cluster_markers`, `major_annotation`, `fraction_by_sample`, `fraction_group_comparison`, `processed_expression_feature_screening`, `pathway_enrichment`, and `blocked_or_limited_contrasts`. Its required figure groups include `embedding`, `markers`, `composition`, `differential_features`, and `pathway_enrichment`.

## Routing

- scRNA-seq baseline -> `bio-singlecell-baseline`.
- User data ingestion -> `bio-data-resolution`, then `bio-singlecell-import`.
- Script authoring -> `bio-analysis-script-authoring` with `workflowKind: omics_analysis`.
- Paper-driven work -> `bio-omics-reproduction-planning`, not this workflow.
