---
name: bio-scrna-reproduction
description: >
  Use when a user asks to reproduce, audit, or demo a scRNA-seq paper workflow in OpenBioScience, especially when the task spans paper claims, data access, environment selection, preprocessing, clustering, markers, annotation, plots, and result interpretation. Route narrow data lookup to bio-data-resolution, import to bio-singlecell-import, execution planning to bio-environment-routing, and final narrative limits to bio-result-interpretation.
---

# Bio scRNA-seq Reproduction

This skill is the top-level runbook for scRNA-seq reproduction. It coordinates evidence, data, environments, controlled execution, artifacts, and claim boundaries; it does not execute analysis itself.

## OpenBioScience Adapter

- Treat `openscience-science`, `openscience-singlecell`, `openscience-compute`, and `openscience-science-artifact` as the controlling contract.
- Use this skill as workflow guidance, not as evidence or an execution engine.
- Use `research_evidence` for paper, accession, database, and methods lookup.
- Use `bio_runtime` for environment probing, workflow validation, and allowlisted P0 smoke execution; use `bio_source` for data-source contracts, `bio_knowledge` for marker/atlas contracts, and `bio_plot` for plot contracts.
- Register inputs, code, configs, logs, outputs, warnings, and decisions through `science_artifact`.
- Do not install packages into official environments during analysis.
- Use only `environmentRef` names when referring to execution environments.

## Scope

Use this skill for:

- Reproducing a single-cell paper figure, table, marker result, annotation, or demo workflow.
- Auditing whether available data can support claimed QC, clustering, DE, annotation, response, or trajectory results.
- Planning an end-to-end scRNA-seq analysis bundle with reproducible artifacts.

Route elsewhere for:

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
- `paper_or_claim`
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

1. Convert the user request into a reproduction objective and explicit claim list.
2. Resolve source evidence and dataset availability through `bio-data-resolution`.
3. Classify inputs and claim support through `bio-singlecell-import`.
4. Select execution route with `bio-environment-routing`; prefer the minimal official `environmentRef`.
5. Plan preprocessing, clustering, markers, annotation, and plotting via the appropriate downstream skills; run only cataloged `bio_runtime.run_workflow` entries.
6. Require each step to emit machine-readable summaries before proceeding to interpret results.
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

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Paper figure cannot be exactly matched | unpublished filtering, random seeds, or missing raw data | State reproducible subset and register blocked details |
| Only processed expression is available | raw UMI counts unavailable | Block count-dependent QC/DE claims or downgrade scope |
| Metadata lacks sample or patient keys | pseudo-replication risk | Block sample-level biological comparison until resolved |
| Demo output looks plausible but lacks provenance | artifact registration skipped | Do not treat output as evidence until `science_artifact` records it |

## Validation

- Every source claim has data status: available, partial, derived-only, inaccessible, or unresolved.
- Every executed step has a config, log, environment probe, and output summary.
- Random seeds, package versions, input hashes or stable pointers, and warnings are registered.
- Final interpretation separates reproduced observations from unsupported paper claims.

## Next

- Missing dataset or unclear accession -> `bio-data-resolution`.
- Ready data but unknown runtime -> `bio-environment-routing`.
- Ready input files -> `bio-singlecell-import`.
- Completed workflow outputs -> `bio-result-interpretation`.
