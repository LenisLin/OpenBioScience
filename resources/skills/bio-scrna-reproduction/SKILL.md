---
name: bio-scrna-reproduction
description: >
  Use when a scoped scRNA-seq reproduction module is downstream of bio-omics-reproduction-planning, especially for single-cell modality routing across data access, environment selection, preprocessing, clustering, markers, annotation, plots, and result interpretation. For full article reproduction, demo case planning, source/data/code availability audit, or figure/panel claim feasibility, route first to bio-omics-reproduction-planning.
---

# Bio scRNA-seq Reproduction

## Method Parameter Gate

- Require a current validated `planning/paper_reproduction_map.json`, `PaperReproductionMapReceipt`, and `ReproductionScopeReceipt`; carry their target, cohort, and dependency IDs into every downstream module.
- Route through `bio-method-parameter-reconstruction` before script authoring.
- Consume the canonical method contract for QC, normalization, HVG, integration, dimensionality reduction, clustering, annotation, markers, condition DE, trajectory, gene programs, CCI, and plotting.
- Record unreported values as analysis choices and report the resulting alignment level.

## Execution Contract Gate

- After planning completes and before script authoring, call `bio_reproduction(action="prepare_execution_contract")` with the user's objective and current planning receipt.
- Follow its `nextActions` until the canonical `execution/execution_contract.json` and a current `ExecutionContractReceipt` are ready.
- Treat only modules marked `required` by that contract as execution completion requirements. Do not add disease programs, trajectory, CCI, or another optional analysis as a hidden hard gate.
- Retain every requested or paper-relevant map target in execution coverage even when it has no runnable module. Missing data or capability produces `external_data_block`, `capability_block`, or `unresolved`; only a recorded user decision may produce `excluded_by_user`.
- A current reusable object or validated output may satisfy a required module when its provenance, content hash, and contract semantics match; do not repeat data import or another expensive step solely because a new execution contract was created.
- Before execution, validate each applied Skill with `bio_reproduction(action="validate_skill_compliance")`, then call `bio_reproduction(action="preflight_execution_scripts")`. Do not execute scripts or populate `usedSkills` until the corresponding ready receipts exist.
- After all requested modules finish or reach a documented scientific limit, call `bio_reproduction(action="complete_execution")` and pass its `ReproductionExecutionReceipt` unchanged to Science publishing.

## Reproduction Modes

- `exact`: same paper panel or claim, cohort/data dependency, compatible data layer, reported method family and material parameters, comparison, and output semantics.
- `analogous`: same scientific question and comparable output with a declared different cohort, dataset, assay, contrast, or reference dependency.
- `scoped_reimplementation`: bounded subset or structural analogue using reduced cohorts, proxy outputs, modernized methods, or analysis-choice parameters.

Readiness does not upgrade mode. A successful modern Scanpy run on one local cohort remains scoped when the paper target used two cohorts, legacy CCA/Monocle, or additional clinical dependencies.

This skill is the downstream scRNA-seq modality runbook after `bio-omics-reproduction-planning`.
It coordinates single-cell data, environments, controlled execution, artifacts, and claim boundaries for scoped modules; it does not perform the upstream paper/source audit or execute analysis itself.

## OpenBioScience Adapter

- Treat `openscience-science`, `openscience-singlecell`, `openscience-compute`, and `openscience-science-artifact` as the controlling contract.
- Use this skill as workflow guidance, not as evidence or an execution engine.
- For full article reproduction, demo case planning, source/data/code availability audit, or panel feasibility, route first to `bio-omics-reproduction-planning`.
- Use `research_evidence` for paper, accession, database, and methods lookup.
- Use `bio_runtime` for environment and workflow validation, `bio_source` for data-source contracts, `bio_knowledge` for marker/atlas contracts, `bio_statistics` for expression and replicate-aware DE contracts, and `bio_plot` for plot contracts. Controlled execution requires an approved runner.
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
- Missing/custom environment support -> `bio-environment-manager`.
- Script drafting or review before execution -> `bio-analysis-script-authoring`.
- Object import -> `bio-singlecell-import`.
- QC/preprocessing -> `bio-qc-preprocess`.
- Batch correction, dimensionality reduction, clustering -> `bio-batch-dim-cluster`.
- Marker tuning -> `bio-marker-optimization`.
- Biological condition DE -> `bio-scrna-differential-expression`.
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

1. Start from the validated paper map and scope receipts, then reconcile their target, cohort, dependency, status, warning, and boundary records with the Planning Package.
2. Prepare the execution contract and route only the modules that it marks required, while retaining blocked and user-excluded map targets in coverage.
3. Resolve remaining single-cell source or metadata gaps through `bio-data-resolution`.
4. Classify inputs and claim support through `bio-singlecell-import`.
5. Select execution route with `bio-environment-routing`; prefer the minimal official `environmentRef`. If no official environment satisfies the module contract, route the gap to `bio-environment-manager`.
   A selected path is not sufficient: require `bio_runtime(action="probe_environment")` with executed package imports before marking a module execution-ready.
6. Plan the contract-required preprocessing, clustering, markers, annotation, replicate-aware DE, statistics, and plotting modules via downstream skills. Validate every condition-comparison design with `bio_statistics` before authoring or running edgeR code. Before execution, use `bio-analysis-script-authoring` to turn approved modules into readable sequential scripts with explicit input, output, environment, and session-info contracts; require ready Skill-compliance and script-preflight receipts and run them only when an approved runner is available.
7. Require each step to emit machine-readable summaries and module results before interpretation.
8. Complete execution through `bio_reproduction(action="complete_execution")`; honor `nextActions.maxAttempts`, or at most two corrective retries after the initial call when no limit is supplied. Stop on `stopWhenUnchanged`, unchanged validation/precondition fingerprints, or external blockers.
9. Register every artifact, parameter file, environment probe, log, warning, and blocked claim through `science_artifact`.

## Output Contract

Every reproduction plan or run should produce:

- `reports/reproduction_plan.json`
- `reports/claim_boundary.json`
- `execution/execution_contract.json` for an approved execution run
- one final `ReproductionExecutionReceipt` for execution-phase publication
- coverage rows for every requested or paper-relevant target, including blocked and user-excluded targets
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

| Symptom                                           | Likely cause                                             | Fix                                                                 |
| ------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Paper figure cannot be exactly matched            | unpublished filtering, random seeds, or missing raw data | State reproducible subset and register blocked details              |
| Only processed expression is available            | raw UMI counts unavailable                               | Block count-dependent QC/DE claims or downgrade scope               |
| Metadata lacks sample or patient keys             | pseudo-replication risk                                  | Block sample-level biological comparison until resolved             |
| A comparison has fewer than 3 replicates or pairs | insufficient independent replication                     | Block inference; retain descriptive summaries only                  |
| Demo output looks plausible but lacks provenance  | artifact registration skipped                            | Do not treat output as evidence until `science_artifact` records it |

## Validation

- Every source claim uses the Planning Package status vocabulary: `ready`, `partial_ready`,
  `conditional_continue`, `planned_only`, `blocked_for_localization`, `blocked_for_execution`,
  `unresolved`, or `fatal_block`.
- Every executed step has a config, log, environment probe, and output summary.
- Every execution script has a ready `ScriptValidationReceipt`; every applied local Skill has a ready SkillComplianceReceipt before its completion-receipt `skillUses` are surfaced as `usedSkills`.
- Every requested or paper-relevant target and source cohort remains visible in final coverage. No absent module, failed contrast, missing cohort, or unavailable dependency is silently dropped.
- Every biological condition comparison has current `bio_statistics` design and output receipts; effective replicate counts are calculated after exclusions and pairing.
- A blocked DE contrast is a valid scientific outcome when it appears in the declared status table and final receipt; it does not make unrelated completed modules fail.
- Every execution-ready module cites an environment probe with `mode: execution` and `status: passed`; `path_only`, `not_run`, and default-shell package checks remain conditional.
- Random seeds, package versions, input hashes or stable pointers, and warnings are registered.
- Final interpretation separates reproduced observations from unsupported paper claims.

## Next

- Full paper, source audit, demo case, or panel feasibility request -> `bio-omics-reproduction-planning`.
- Missing dataset or unclear accession -> `bio-data-resolution`.
- Ready data but unknown runtime -> `bio-environment-routing`.
- Ready data but missing/custom runtime -> `bio-environment-manager`.
- Ready input files -> `bio-singlecell-import`.
- Approved execution module needing script work -> `bio-analysis-script-authoring`.
- Completed workflow outputs -> `bio-result-interpretation`.
