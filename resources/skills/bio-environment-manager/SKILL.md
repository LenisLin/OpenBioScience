---
name: bio-environment-manager
description: >
  Use when an OpenBioScience task cannot be satisfied by official immutable environments and needs a user-scoped conda environment created, forked, registered, indexed, resolved, or probed as an environmentRef. This skill guides agent-side environment creation and MCP registration only; it does not mutate official environments, install packages through MCP, run analyses, or provide a frontend environment manager.
---

# Bio Environment Manager

This skill guides creation, derivation, registration, and validation of user-private conda environments when official OpenBioScience environments do not meet a task requirement.

## OpenBioScience Adapter

- Treat official environments as immutable.
- Prefer existing official `environmentRef` values whenever they satisfy the task.
- Create or derive user environments outside MCP through the agent/runtime shell with explicit user approval when needed.
- Use the environment registration MCP only to record/index an already created environment.
- After registration, use `bio_runtime.list_environments`, `bio_runtime.resolve_environment`, and `bio_runtime.probe_environment` to expose and validate the resulting `environmentRef`.
- Register environment decisions, package deltas, probe results, warnings, and blocked reasons through `science_artifact` when tied to a reproduction or analysis task.
- Do not add a frontend UI management requirement for first version user environments; they are agent/runtime visible.

## Scope

Use this skill for:

- Official environment capability gaps.
- Deriving a user conda environment from an official base.
- Creating a user conda environment from an explicit spec when no base is suitable.
- Registering an existing user environment so OpenBioScience can refer to it by `environmentRef`.
- Probing package imports, executable availability, R/Python versions, and minimal read/write behavior.
- Deciding whether a missing package should block the analysis instead of creating a new environment.

Route elsewhere for:

- Routine selection among official environments -> `bio-environment-routing`.
- Reproduction planning before execution -> `bio-omics-reproduction-planning`.
- Script writing after an environment is available -> `bio-analysis-script-authoring`.
- Data accession, download, or file semantics -> `bio-data-resolution` or `bio_source`.

## Inputs

Required:

- `task_objective`
- missing package, executable, R/Python library, or version constraint
- candidate official `environmentRef` values or `environmentRef:auto`
- intended workflow or script module

Recommended:

- base environment candidate
- package manager preference: `conda`, `mamba`, `pip`, `R`, `BiocManager`, `remotes`, or `github`
- expected package imports or command probes
- user environment name
- resource needs: CPU, memory, GPU, CUDA, system library notes
- project or reproduction artifact namespace

## Decision Rules

1. Reuse an official environment if it already passes the required probes.
2. Do not install into or otherwise mutate official environments.
3. Prefer deriving from the closest official environment over creating from scratch.
4. Keep package deltas minimal and record every non-default source.
5. Do not impose a fixed package-source whitelist in this skill. Conda channels, pip, R repositories, Bioconductor, and GitHub sources may be used when scientifically and operationally justified.
6. Treat network access, private repositories, credentials, licenses, and native compilation as explicit risks.
7. Do not register an environment as ready until probes pass.
8. If the environment cannot be made reproducible enough for the task, block the affected module and record the reason.

## Workflow

1. Identify the capability gap: package, executable, version, system library, GPU/CUDA, or workflow-specific runtime.
2. Probe candidate official environments through `bio_runtime`.
3. Decide whether to reuse, derive, create from scratch, or block.
4. If deriving or creating, draft a minimal environment spec or patch with package sources and rationale.
5. Have the agent create the conda environment outside MCP using the appropriate runtime tooling.
6. Run local import/command/version probes and capture logs.
7. Register the environment path, base, package delta, supports metadata, and probe summary through the environment registration MCP.
8. Use `bio_runtime.list_environments`, `resolve_environment`, and `probe_environment` to confirm the new `environmentRef`.
9. Return the `environmentRef`, exact run prefix, warnings, and provenance summary to the downstream script or workflow.

## Output Contract

Environment management should produce:

- `reports/environment_request.json`
- `reports/environment_registration.json`
- `logs/environment_build.log`
- `logs/environment_probe.log`
- selected or registered `environmentRef`
- blocked reason when no environment is usable

Summary schema:

```json
{
  "schema": "openbioscience.user_environment.summary.v1",
  "taskObjective": "...",
  "decision": "reuse_official|derive_user|create_user|register_existing|blocked",
  "baseEnvironmentRef": null,
  "environmentRef": null,
  "packageDelta": [],
  "packageSources": [],
  "probeStatus": "passed|failed|blocked",
  "supports": {
    "skills": [],
    "tools": [],
    "workflows": []
  },
  "warnings": [],
  "blockedReason": null
}
```

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Agent tries to `pip install` inside an official env | official environment mutation drift | Stop, derive a user env or block the module |
| Registered env cannot be resolved later | missing or stale user environment index entry | Re-register and confirm with `bio_runtime.list_environments` |
| Probe passes import but workflow fails | missing command-line executable, system lib, or write permission | Add command and read/write probes before registration |
| GitHub package install is not reproducible | floating branch or unrecorded commit | Pin commit/tag and record repository URL |
| R package works interactively but not in script | `.libPaths()` or user library leakage | Probe through the intended `environmentRef` run command |

## Validation

- Official environments were probed before a new user environment was created.
- No official environment was modified.
- The package delta and package sources are recorded.
- The registered `environmentRef` is visible through `bio_runtime.list_environments`.
- `bio_runtime.resolve_environment` returns the intended path/entry metadata.
- `bio_runtime.probe_environment` passes imports, commands, versions, and basic output write checks needed by the task.

## Next

- Environment ready for script work -> `bio-analysis-script-authoring`.
- Environment selected from official catalog -> `bio-environment-routing`.
- Planning package still lacks execution scope -> `bio-omics-reproduction-planning`.
- Environment remains unavailable -> mark only the affected execution module as blocked.
