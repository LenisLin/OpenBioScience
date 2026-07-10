---
name: bio-scrna-reproduction
description: >
  Use when a scoped scRNA-seq reproduction module is downstream of bio-omics-reproduction-planning, especially for single-cell modality routing across data access, environment selection, preprocessing, clustering, markers, annotation, plots, and result interpretation. For full article reproduction, demo case planning, source/data/code availability audit, or figure/panel claim feasibility, route first to bio-omics-reproduction-planning.
---

# Bio scRNA-seq Reproduction

This skill is the downstream scRNA-seq modality runbook after `bio-omics-reproduction-planning`.
It coordinates single-cell data, environments, controlled execution, artifacts, and claim boundaries for scoped modules; it does not perform the upstream paper/source audit or execute analysis itself.

## OpenBioScience Adapter

- Treat `openscience-science`, `openscience-singlecell`, `openscience-compute`, and `openscience-science-artifact` as the controlling contract.
- Use this skill as workflow guidance, not as evidence or an execution engine.
- For full article reproduction, demo case planning, source/data/code availability audit, or panel feasibility, route first to `bio-omics-reproduction-planning`.
- Use `research_evidence` for paper, accession, database, and methods lookup.
- Use `bio_runtime` for environment and workflow validation, `bio_source` for data-source contracts, `bio_knowledge` for marker/atlas contracts, and `bio_plot` for plot contracts. Controlled execution requires an approved runner.
- Register inputs, code, configs, logs, outputs, warnings, and decisions through `science_artifact`.
- Do not install packages into official environments during analysis.
- Use only `environmentRef` names when referring to execution environments.

## Scope

Use this skill for:

- Executing modality routing after a Planning Package has scoped scRNA-seq modules.
- Planning a single-cell figure, table, marker result, annotation, or demo workflow within an existing reproduction scope.
- Auditing whether scoped single-cell data can support QC, clustering, DE, annotation, response, or trajectory units.

Route elsewhere for:

- Full article reproduction planning -> `bio-omics-reproduction-planning`.
- Data/accession resolution -> `bio-data-resolution`.
- Environment choice/probing -> `bio-environment-routing`.
- Object import -> `bio-singlecell-import`.
- QC/preprocessing -> `bio-qc-preprocess`.
- Batch correction, dimensionality reduction, clustering -> `bio-batch-dim-cluster`.
- Marker tuning -> `bio-marker-optimization`.
- Annotation -> `bio-cell-annotation`.
- Figures -> `bio-scrna-plotting`.
- Interpretation and claim audit -> `bio-result-interpretation`.

## Inputs

Required:

- `objective`
- `planning_package` or scoped `paper_or_claim`
- `species`
- `data_source` or blocked reason
- `expected_outputs`

Recommended:

- `accessions`
- `figure_or_table_ids`
- `sample_key`, `patient_key`, `condition_key`, `batch_key`
- `target_environmentRef`
- `artifact_namespace`

## Workflow

1. Start from the scRNA-seq modules, statuses, warnings, and boundaries in the Planning Package when available.
2. Resolve remaining single-cell source or metadata gaps through `bio-data-resolution`.
3. Classify inputs and claim support through `bio-singlecell-import`.
4. Select execution route with `bio-environment-routing`; prefer the minimal official `environmentRef`.
5. Plan preprocessing, clustering, markers, annotation, and plotting via downstream skills; run them only when an approved runner is available.
6. Require each step to emit machine-readable summaries before interpretation.
7. Register every artifact, parameter file, environment probe, log, warning, and blocked claim through `science_artifact`.

## Output Contract

Every reproduction plan or run should produce:

- `reports/reproduction_plan.json`
- `reports/claim_boundary.json`
- step summaries from downstream skills
- `logs/reproduction.log`
- registered `science_artifact` entries for inputs, configs, code, logs, tables, figures, and decisions

The plan summary must include:

```json
{
  "schema": "openbioscience.scrna_reproduction.plan.v1",
  "objective": "...",
  "claims": [],
  "dataSources": [],
  "environmentRefs": [],
  "plannedSkills": [],
  "artifactNamespace": "...",
  "blockedClaims": [],
  "warnings": []
}
```

## Gotchas

| Symptom                                          | Likely cause                                             | Fix                                                                 |
| ------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Paper figure cannot be exactly matched           | unpublished filtering, random seeds, or missing raw data | State reproducible subset and register blocked details              |
| Only processed expression is available           | raw UMI counts unavailable                               | Block count-dependent QC/DE claims or downgrade scope               |
| Metadata lacks sample or patient keys            | pseudo-replication risk                                  | Block sample-level biological comparison until resolved             |
| Demo output looks plausible but lacks provenance | artifact registration skipped                            | Do not treat output as evidence until `science_artifact` records it |

## Validation

- Every source claim uses the Planning Package status vocabulary: `ready`, `partial_ready`,
  `conditional_continue`, `planned_only`, `blocked_for_localization`, `blocked_for_execution`,
  `unresolved`, or `fatal_block`.
- Every executed step has a config, log, environment probe, and output summary.
- Random seeds, package versions, input hashes or stable pointers, and warnings are registered.
- Final interpretation separates reproduced observations from unsupported paper claims.

## Next

- Full paper, source audit, demo case, or panel feasibility request -> `bio-omics-reproduction-planning`.
- Missing dataset or unclear accession -> `bio-data-resolution`.
- Ready data but unknown runtime -> `bio-environment-routing`.
- Ready input files -> `bio-singlecell-import`.
- Completed workflow outputs -> `bio-result-interpretation`.
