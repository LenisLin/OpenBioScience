---
name: bio-environment-routing
description: >
  Use when an OpenBioScience single-cell task needs an official environmentRef, runtime route, package capability check, R-versus-Python decision, or blocked execution decision. Applies to scRNA-seq reproduction, Scanpy, Seurat, AnnData, h5ad, RDS, batch correction, marker detection, plotting, and science_artifact registration. Route data questions to bio-data-resolution and scientific interpretation to bio-result-interpretation.
---

# Bio Environment Routing

This skill chooses the minimal official environment and execution route for scRNA-seq work. It is a runbook for routing and validation, not a package installer or shell executor.

## OpenBioScience Adapter

- Treat `openscience-compute`, `openscience-singlecell`, and `openscience-science-artifact` as controlling contracts.
- Use `bio_runtime.status`, `bio_runtime.list_environments`, and `bio_runtime.probe_environment` for current environment checks; execute supported smoke workflows only through `bio_runtime.run_workflow`.
- Record probes, selected `environmentRef`, package versions, blocked reasons, and logs through `science_artifact`.
- Do not write absolute host paths; use user-provided paths, artifact IDs, or `environmentRef`.
- Do not install or mutate official environments during analysis. Environment creation belongs to the server admin bootstrap flow, not the user workflow.

## Scope

Use this skill for:

- Selecting between Python/Scanpy, R/Seurat, or conversion-only workflows.
- Checking whether an input object requires a specific runtime.
- Blocking execution when no official environment supports the requested package.
- Capturing reproducibility metadata before downstream analysis.

Route elsewhere for:

- Dataset lookup -> `bio-data-resolution`.
- Input semantics -> `bio-singlecell-import`.
- Step-specific analysis -> QC, clustering, marker, annotation, plotting, or interpretation skills.

## Inputs

Required:

- `task_type`
- `input_format`
- `species`
- candidate `environmentRef` list or `environmentRef:auto`

Recommended:

- `required_packages`
- `object_path`
- `expected_outputs`
- `gpu_required`
- `memory_estimate`

## Workflow

1. Classify the requested operation: inspect, convert, preprocess, model, plot, or interpret.
2. Map the operation to candidate `environmentRef` values such as `sc-py-singlecell` or `sc-r-singlecell`.
3. Probe package availability, versions, object readability, and hardware needs through controlled runtime calls.
4. Choose the least specialized environment that supports the operation.
5. For supported P0 runners, validate `workflowId`, config fields, and output root before calling `bio_runtime.run_workflow`.
6. Register probe logs and the final route through `science_artifact`.

## Output Contract

Every routing decision should produce:

- `reports/environment_routing.json`
- `logs/environment_probe.log`
- package/version summary
- selected `environmentRef` or blocked reason

Summary schema:

```json
{
  "schema": "openbioscience.environment_routing.summary.v1",
  "taskType": "...",
  "selectedEnvironmentRef": "...",
  "candidateEnvironmentRefs": [],
  "requiredPackages": [],
  "probeStatus": "passed|failed|blocked",
  "blockedReason": null,
  "warnings": []
}
```

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Agent proposes conda install | environment mutation drift | Block and request an official `environmentRef` update outside the analysis |
| Seurat RDS fails in Python | R serialization/object dependency | Route through `sc-r-singlecell` or conversion runner |
| H5AD reads but categories differ | AnnData version or categorical encoding | Record package versions and verify metadata columns |
| GPU requested for basic QC | unnecessary runtime inflation | Use CPU environment unless model workflow requires GPU |

## Validation

- Selected `environmentRef` exists in the current OpenBioScience environment registry.
- Probe logs include package versions and object read/write status when relevant.
- The route explains why rejected candidate environments were not used.
- Blocked execution is explicit and registered rather than silently skipped.

## Next

- Environment selected for import -> `bio-singlecell-import`.
- Environment selected for QC -> `bio-qc-preprocess`.
- Environment selected for clustering -> `bio-batch-dim-cluster`.
- Execution complete -> register outputs through `science_artifact` and route to downstream interpretation.
