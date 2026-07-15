---
name: bio-analysis-script-authoring
description: >
  Use when writing or reviewing OpenBioScience R or Python analysis scripts for planned bioinformatics execution modules. This skill enforces readable sequential scripts, contract headers, fixed execution output directories, explicit assumptions, session/package reporting, and reproducibility boundaries. It does not create an MCP, runner, scheduler, environment manager, or package installer.
---

# Bio Analysis Script Authoring

## Workflow Contract Selection

- Set `OpenBioScience-Workflow-Kind: omics_reproduction` only for an accepted paper reproduction contract under `case_reproduction/`.
- Set `OpenBioScience-Workflow-Kind: omics_analysis` for local/private analysis under `omics_analysis/<analysisId>/`; include Analysis ID, Stage-or-Episode-ID, Contract-Receipt-ID, Annotation-Mode, and External-Egress-Policy headers.
- Analysis scripts must write `openbioscience.analysis_script.outputs.v2`; reproduction scripts retain v1 compatibility.
- Do not mix analysis and reproduction receipts, layouts, or report language.

## Method Parameter Contract

- Require current `PaperReproductionMapReceipt` and `ReproductionScopeReceipt` values. Every script module must declare the mapped target IDs and cohort IDs it serves.
- Require a current MethodParameterReceipt before generating reproduction scripts.
- Read reported parameters from `planning/method_parameter_contract.json`; do not silently use package defaults in their place.
- Emit `execution/configs/executed_parameters.json` with every actual analysis value and its origin.
- Add an `OpenBioScience-Parameters: id1,id2` declaration to every generated analysis script.
- Validate the scripts and manifest with `bio_reproduction.validate_method_alignment` before execution publication.

## Execution Contract

- Require a current `ExecutionContractReceipt` before generating execution scripts.
- Author scripts only for modules marked `required` in `execution/execution_contract.json`; optional modules must not become implicit completion requirements.
- Reconcile every requested or paper-relevant target against the execution contract. A blocked or excluded target remains in coverage with its explicit scope status; never silently omit it from scripts, manifests, or review because no script can run it.
- In `independent_annotation` mode, scripts must not read imported cell-type or subtype labels until de novo assignments are frozen and the post hoc concordance stage begins.
- Each executed module must emit a module-result payload and output manifest suitable for `bio_reproduction(action="complete_execution")`.

## Skill And Script Preflight

1. Read each local Skill used by a required module and apply its current requirements.
2. Call `bio_reproduction(action="validate_skill_compliance")` for each applied Skill content hash. Do not manually register or display `usedSkills` at load time; only validated completion-receipt `skillUses` may populate `science_artifact`.
3. Call `bio_reproduction(action="preflight_execution_scripts")` with current execution, method, Skill-compliance, and statistical-design receipt IDs plus script hashes. Never pass full receipt objects.
4. Do not execute any script until the returned `ScriptValidationReceipt` is ready and has no violations or correctable `nextActions`.
5. Resolve retries conservatively: honor `maxAttempts`; otherwise allow at most two corrective retries after the initial call for one action fingerprint. Stop on `stopWhenUnchanged`, unchanged validation/precondition fingerprints, or an external blocker.

This skill defines script-writing rules for OpenBioScience bioinformatics analysis modules.
It is a writing and review runbook, not an execution layer.

## OpenBioScience Adapter

- Treat `bio-omics-reproduction-planning` and downstream modality skills as the source of module scope.
- Use an existing official or user `environmentRef`; do not install packages inside scripts.
- Use `bio-environment-routing` or `bio-environment-manager` when the required environment is unavailable.
- Register scripts, inputs, outputs, logs, assumptions, package/session info, and warnings through `science_artifact` when used in a task.
- Do not add a `bio_script` MCP, script runner, scheduler, or complex execution state machine for this skill.
- For edgeR or any biological condition comparison, require a current `bio_statistics(action="validate_de_design")` receipt before authoring executable analysis code.

## Scope

Use this skill for:

- Writing R or Python scripts for a planned analysis module.
- Reviewing scripts for reproducibility, output contracts, and hidden side effects.
- Converting notebook-style logic into sequential, auditable script flow.
- Defining script inputs, outputs, run command, assumptions, and package/session reporting.

Do not use for:

- Creating environments or installing packages.
- Downloading, replacing, or silently modifying input data.
- Running scripts, scheduling jobs, streaming logs, or selecting favorable outputs.
- Making final biological claims before outputs are reviewed.

## Required Contract Header

Every script must start with a contract header in language-appropriate comments:

```text
Module ID:
Target IDs:
Cohort IDs:
Reproduction mode:
EnvironmentRef:
Inputs:
Outputs:
Run command:
Assumptions:
```

The header must be concrete enough that a different agent can run the same module through the declared `environmentRef` without inferring hidden paths, package installs, or data downloads.

## Required Directory Contract

Scripts must write only to the execution output tree unless a caller explicitly passes another approved path:

```text
execution/
  scripts/
  configs/
  results/
    objects/
    tables/
    figures/
  logs/
```

Required output placement:

- Analysis objects: `execution/results/objects/`
- Tables and manifests: `execution/results/tables/`
- Figures and plot source data: `execution/results/figures/`
- Runtime logs, warnings, and session/package info: `execution/logs/`

## Script Structure

Write scripts as a readable top-to-bottom workflow:

1. Parse explicit arguments or load one config file.
2. Validate all input paths and required columns before analysis.
3. Create output directories under the fixed contract.
4. Load packages and write package/session info.
5. Read immutable input data.
6. Run analysis steps in the same order as the planned module.
7. Write intermediate objects only when they are part of the output contract.
8. Write tables, figures, manifests, and warnings.
9. Write the module result status, including `scientifically_limited` for declared blocked contrasts or equivalent bounded outcomes.
10. Exit with a clear error when required inputs or assumptions are violated.

Prefer small named helper functions for repeated mechanics, but keep the scientific workflow visible in the main sequence.

## Scientific Comments

Comments should explain scientific or reproducibility decisions, such as:

- why a filtering threshold was chosen
- why a metadata column defines sample, condition, patient, batch, or response
- why a method is compatible with raw counts or processed expression
- why a plot, model, or comparison is conditional or blocked

Do not add comments that merely restate syntax.

## Prohibited Script Behavior

Scripts must not:

- install packages with `pip`, `conda`, `mamba`, `install.packages`, `BiocManager::install`, `remotes::install_*`, or equivalent calls
- clone repositories or fetch code at runtime
- implicitly download data
- replace missing input data with public examples, toy data, or regenerated files
- write outside `execution/results/` or `execution/logs/` unless explicitly configured
- hide failed assumptions by dropping samples, genes, cells, or metadata rows without a reported table
- omit a mapped target, cohort, dependency, or failed output from manifests and coverage without its explicit scope or failure status
- select only favorable results while discarding failed or contradictory outputs
- depend on interactive notebooks, GUI prompts, local absolute paths, or hidden global state
- execute a blocked contrast or replace insufficient biological replication with cell-level testing

## Output Contract

Each script should produce:

- declared objects in `execution/results/objects/`
- declared tables in `execution/results/tables/`
- declared figures and plot source data in `execution/results/figures/`
- `execution/logs/<module_id>.log`
- `execution/logs/<module_id>_session_info.txt` or `.json`
- `execution/logs/<module_id>_warnings.tsv` when warnings occur
- a small output manifest when more than one artifact is produced

Manifest schema:

```json
{
  "schema": "openbioscience.analysis_script.outputs.v1",
  "moduleId": "...",
  "environmentRef": "...",
  "inputs": [],
  "outputs": {
    "objects": [],
    "tables": [],
    "figures": [],
    "logs": []
  },
  "assumptions": [],
  "warnings": []
}
```

After all contract-required scripts finish, pass their manifests and module results to `bio_reproduction(action="complete_execution")`. Do not construct a completion receipt in a script.

## R Notes

- Use `sessionInfo()` or a structured package-version table.
- Use explicit library calls at the top after argument/config parsing.
- Use `stop()` for violated required inputs.
- Avoid `.libPaths()` mutation unless the environment contract explicitly requires it and the reason is logged.

## Python Notes

- Write Python, package, and important dependency versions to session info.
- Use explicit imports at the top after standard library imports.
- Use `argparse` or a single config file for parameters.
- Raise exceptions for violated required inputs; do not silently continue with partial data.

## Validation

- Contract header is present and complete.
- `environmentRef` is declared and available before execution.
- No package installation, clone, or implicit download appears in the script.
- All outputs are under `execution/results/{objects,tables,figures}` or `execution/logs`.
- Input validation happens before analysis.
- Session/package information is written.
- Scientific assumptions and conditional decisions are documented.
- Every script module exists in the current execution contract, and every required module has a machine-readable result.
- Every script has a ready `ScriptValidationReceipt` from `preflight_execution_scripts`, and every applied Skill has a ready SkillComplianceReceipt before execution.
- Target and cohort declarations reconcile with the validated paper map and scope; exact, analogous, and scoped targets remain distinguishable in output manifests.
- Project roots and input/output paths come from arguments or config; scripts never hardcode `/app/demo/...` or another deployment-specific absolute path.
- JSON writers reject or convert non-finite values, and generated files are host-readable.

## Next

- Environment missing -> `bio-environment-manager`.
- Environment choice unclear -> `bio-environment-routing`.
- Script outputs ready for claim review -> `bio-result-interpretation`.
- Plot-specific polishing -> `bio-scrna-plotting` or `bio_plot` when compatible.
