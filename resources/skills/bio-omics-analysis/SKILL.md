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
- `episode`: one confirmed question at a time. Declare the parent receipt, subset, comparison, covariates, repeat unit, method, outputs, and stopping conditions. Inference requires a current `bio_statistics` receipt.
- `closing`: generate a coverage contract then a final report. Include only user-accepted results in the narrative; list failed or abandoned work in a concise audit table.

## Privacy

Never copy raw matrices or complete metadata into artifact snapshots. External calls may use only allowlisted species, tissue, and gene-symbol fields. Local outputs retain sample/patient identifiers; external export requires a visible risk decision.

## Output Rules

Use `omics_analysis/<analysisId>/` with fixed `intake/`, `qc/`, `baseline/`, `episodes/<episodeId>/`, and `reports/` locations. Executable stages contain `scripts/`, `configs/`, `results/objects/`, `results/tables/`, `results/figures/`, and `logs/`. Submit receipt IDs, never receipt objects, to `science_artifact`.

## Routing

- scRNA-seq baseline -> `bio-singlecell-baseline`.
- User data ingestion -> `bio-data-resolution`, then `bio-singlecell-import`.
- Script authoring -> `bio-analysis-script-authoring` with `workflowKind: omics_analysis`.
- Paper-driven work -> `bio-omics-reproduction-planning`, not this workflow.
