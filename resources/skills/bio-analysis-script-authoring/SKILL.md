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
- For `omics_analysis`, the canonical stage tree is the primary user deliverable and must be directly openable from the UI project file panel. Do not use `/output`, `output/`, `project_outputs/`, or another external directory as the primary result location; mirrors are allowed only as optional copies after the canonical `omics_analysis/<analysisId>/<stage-or-episode>/...` outputs exist and are registered.

## Reproduction Method Parameter Contract

For `omics_reproduction` only:

- Require current `PaperReproductionMapReceipt` and `ReproductionScopeReceipt` values. Every script module must declare the mapped target IDs and cohort IDs it serves.
- Require a current MethodParameterReceipt before generating reproduction scripts.
- Read reported parameters from `planning/method_parameter_contract.json`; do not silently use package defaults in their place.
- Emit `case_reproduction/execution/configs/executed_parameters.json` with every actual analysis value and its origin.
- Add an `OpenBioScience-Parameters: id1,id2` declaration to every generated reproduction script.
- Validate the scripts and manifest with `bio_reproduction.validate_method_alignment` before execution publication.

For `omics_analysis`, do not require paper maps, reproduction scope, or method-parameter receipts. Use the current `bio_analysis` stage or episode contract receipt as the script boundary.

## Reproduction Execution Contract

For `omics_reproduction` only:

- Require a current `ExecutionContractReceipt` before generating execution scripts.
- Author scripts only for modules marked `required` in `case_reproduction/execution/execution_contract.json`; optional modules must not become implicit completion requirements.
- Reconcile every requested or paper-relevant target against the execution contract. A blocked or excluded target remains in coverage with its explicit scope status; never silently omit it from scripts, manifests, or review because no script can run it.
- In `independent_annotation` mode, scripts must not read imported cell-type or subtype labels until de novo assignments are frozen and the post hoc concordance stage begins.
- Each executed module must emit a module-result payload and output manifest suitable for `bio_reproduction(action="complete_execution")`.

For `omics_analysis`, scripts serve exactly one `bio_analysis` stage or episode contract. They must not create reproduction execution contracts, paper-target coverage, or `case_reproduction/` files.

## Skill And Script Preflight

For `omics_analysis`:

1. Read each local Skill used by the current stage or episode and apply its current requirements.
2. Call `bio_analysis(action="preflight_scripts")` with the current analysis ID, stage or episode ID, contract receipt ID, and script paths. Never pass full receipt objects.
3. Do not execute any script until the returned analysis script preflight has no violations or correctable `nextActions`.
4. When completing a free exploration stage, pass the ready preflight receipt as `scriptPreflightReceiptId` to `bio_analysis(action="complete_exploration")`; every `canonicalFilePaths` entry must point to the canonical `omics_analysis/<analysisId>/exploration/...` file, not a mirror/export directory.
5. Resolve retries conservatively: honor `maxAttempts`; otherwise allow at most two corrective retries after the initial call for one action fingerprint. Stop on `stopWhenUnchanged`, unchanged validation/precondition fingerprints, or an external blocker.

For `omics_reproduction`:

1. Read each local Skill used by a required module and apply its current requirements.
2. Call `bio_reproduction(action="validate_skill_compliance")` for each applied Skill. Do not manually register or display `usedSkills` at load time; only validated completion-receipt `skillUses` may populate `science_artifact`.
3. Call `bio_reproduction(action="preflight_execution_scripts")` with current execution, method, Skill-compliance, and statistical-design receipt IDs plus script file metadata. Never pass full receipt objects.
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
OpenBioScience-Workflow-Kind:
OpenBioScience-Analysis-ID:
OpenBioScience-Stage-Or-Episode-ID:
OpenBioScience-Contract-Receipt-ID:
OpenBioScience-Annotation-Mode:
OpenBioScience-External-Egress-Policy:
OpenBioScience-EnvironmentRef:
OpenBioScience-Inputs:
OpenBioScience-Outputs:
OpenBioScience-Run-Command:
OpenBioScience-Assumptions:
```

For `omics_reproduction`, also include module, target, cohort, and reproduction-mode declarations required by the current execution contract. The header must be concrete enough that a different agent can run the same module through the declared `environmentRef` without inferring hidden paths, package installs, or data downloads.

## Required Directory Contract

`omics_analysis` scripts must write only under the current analysis stage or episode tree:

```text
omics_analysis/<analysisId>/
  intake|qc|baseline|exploration/
    scripts/
    configs/
    results/
      objects/
      tables/
      figures/
    logs/
  episodes/<episodeId>/
    scripts/
    configs/
    results/
      objects/
      tables/
      figures/
    logs/
```

`omics_reproduction` scripts must write only under the reproduction execution tree:

```text
case_reproduction/execution/
  scripts/
  configs/
  results/
    objects/
    tables/
    figures/
  logs/
```

Required output placement:

- Objects: `<stage-or-execution>/results/objects/`
- Tables: `<stage-or-execution>/results/tables/`
- Output manifest: `<stage-or-execution>/results/output_manifest.json`
- Figures and plot source data: `<stage-or-execution>/results/figures/`
- Runtime logs, warnings, and session/package info: `<stage-or-execution>/logs/`

For scRNA-seq `omics_analysis` free exploration, the script must write the following canonical outputs unless a module-specific blocker is recorded in a status table and report:

- `scripts/script_manifest.json`
- at least two functional helper modules under `scripts/modules/`
- `results/objects/`
- `results/tables/input_inventory.*`
- `results/tables/qc_metrics.*`
- `results/tables/cluster_assignments.*`
- `results/tables/embedding_coordinates.*`
- `results/tables/cluster_markers.*`
- `results/tables/major_annotation.*`
- `results/tables/fraction_by_sample.*`
- `results/tables/fraction_group_comparison.*`
- `results/tables/processed_expression_feature_screening.*`
- `results/tables/pathway_enrichment.*`
- `results/tables/blocked_or_limited_contrasts.*`
- marker heatmap and dotplot under `results/figures/markers/`
- embedding plots under `results/figures/embedding/`
- response or condition composition plots under `results/figures/composition/`
- differential feature heatmap or dotplot under `results/figures/differential_features/`
- pathway enrichment figure under `results/figures/pathway_enrichment/`
- `reports/analysis_report.*`
- `logs/session_info.*`
- `logs/warnings.tsv`

## Analysis Script Package

For `omics_analysis` free exploration, do not place the whole analysis in one monolithic script. The executable package must contain:

- one short entrypoint under `scripts/` that exposes the workflow as ordered stages;
- at least two helper modules under `scripts/modules/`, grouped by function such as IO, QC, plotting, differential-feature screening, enrichment, reporting, or manifest writing;
- `scripts/script_manifest.json` with schema `openbioscience.analysis_script.package.v1`, the entrypoint path, module paths, workflow module bindings, expected outputs, and the declared `environmentRef`;
- a `workflowModules` array in `scripts/script_manifest.json` mapping each OpenBioScience exploration module to `moduleId`, `status`, `skillIds`, `mcpTools`, `environmentRef`, `environmentProbeReceiptId`, implementation files, and outputs. Required module ids are `singlecell_import_summary`, `singlecell_qc_preprocess`, `dim_cluster_marker`, `cell_annotation_review`, `scrna_plot_figure_set`, and `exploration_report_package`; conditional modules such as public dataset discovery/localization, response fraction comparison, processed-expression screening, and pathway enrichment are marked `completed`, `blocked`, or `not_applicable` with a concrete reason;
- a `resourceProvenance` object in `scripts/script_manifest.json`. When `cell_annotation_review` is completed, include `markerResources` with resource id, version/status, source path, source papers, evidence type, and confidence; the default localized marker-atlas package is `scrna_atlas_markers.v1` unless the analysis records a more specific resource. When `scrna_pathway_enrichment` is completed, include `geneSetResources` with provider, collection, species, and source path. Keep routine script context focused on analysis-useful provenance;
- human-readable module docstrings or top-of-file comments explaining the module role;
- at least one public helper function per helper module; every public helper function must have a docstring or immediately preceding comment following the function-level description contract below;
- a `scientificDecisions` array in `scripts/script_manifest.json` with at least four entries for exploration packages. Each entry must include `decisionId`, `topic`, `rationale`, `implementedIn`, `outputsAffected`, and `limitation`, and `implementedIn` must point to the entrypoint or declared helper modules;
- no `__pycache__` or generated bytecode in the output tree.

The entrypoint must show at least three visible ordered comments such as `# Step 1: validate inputs`, `# Step 2: build analysis object`, and `# Step 3: write outputs`. Helper functions belong in modules; the entrypoint should orchestrate the workflow.

### Function-Level Description Contract

Every public helper function in `scripts/modules/*.py` must carry a local text
description, either as a Python docstring or as immediately preceding comments.
The description must be useful to a human reviewer and must include all four
items below:

```text
Inputs: concrete argument meanings, required columns/layers/resources, and path expectations.
Outputs: returned values and/or canonical files/tables/figures written by the function.
Assumptions: matrix semantics, metadata requirements, replicate unit, thresholds, or resource availability used by the function.
Scientific/Reproducibility decision: why this function uses the chosen method, threshold, grouping, marker resource, gene-set source, or blocker rule.
```

Example:

```python
def screen_processed_expression(adata, response_column):
    """Inputs: AnnData with processed expression and a response metadata column.
    Outputs: a ranked exploratory feature table and optional dotplot source data.
    Assumptions: values are processed/log-normalized-like, so raw-count NB DE is not claimed.
    Scientific/Reproducibility decision: use replicate-aware summaries and label the result
    as exploratory_processed_expression to keep it separate from confirmatory pseudobulk DE.
    """
```

Generic descriptions such as "helper for analysis", contract headers, module
headers, or Step comments do not satisfy the function-level description
contract.

Minimum `workflowModules` entry:

```json
{
  "moduleId": "dim_cluster_marker",
  "status": "completed",
  "skillIds": ["bio-singlecell-baseline"],
  "mcpTools": ["bio_runtime", "bio_analysis"],
  "environmentRef": "sc-py-singlecell",
  "environmentProbeReceiptId": "bio_receipt_...",
  "implementation": ["run_auto_explore.py", "modules/dim_cluster.py"],
  "outputs": ["results/tables/cluster_markers.tsv", "results/figures/embedding/umap_clusters.png"]
}
```

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

For generated exploration scripts, do not satisfy this requirement with only the contract header, generic Step comments, or a single module-level paragraph. Put decision-specific comments/docstrings next to the function or block that implements the decision. At minimum, document:

- input identity checks and how barcodes/cell IDs are matched
- expression-matrix semantic classification and how it gates downstream methods
- sample/patient/replicate choice for response or condition comparisons
- QC/filtering thresholds and whether they are descriptive defaults or data-driven
- clustering/annotation marker logic and ambiguity handling
- processed-expression feature screening method and non-confirmatory interpretation
- pathway/gene-set source and fallback behavior
- blocked contrasts and why they are not executed

Do not add comments that merely restate syntax.

## Prohibited Script Behavior

Scripts must not:

- install packages with `pip`, `conda`, `mamba`, `install.packages`, `BiocManager::install`, `remotes::install_*`, or equivalent calls
- clone repositories or fetch code at runtime
- implicitly download data
- replace missing input data with public examples, toy data, or regenerated files
- write primary outputs outside the declared `omics_analysis/<analysisId>/...` stage tree or `case_reproduction/execution/` tree; external export directories and `project_outputs/` copies must never replace canonical files
- hide failed assumptions by dropping samples, genes, cells, or metadata rows without a reported table
- omit a mapped target, cohort, dependency, or failed output from manifests and coverage without its explicit scope or failure status
- select only favorable results while discarding failed or contradictory outputs
- depend on interactive notebooks, GUI prompts, local absolute paths, or hidden global state
- execute a blocked contrast or replace insufficient biological replication with cell-level testing

## Output Contract

Each script should produce:

- declared objects in the workflow `results/objects/`
- declared tables in the workflow `results/tables/`
- declared figures and plot source data in the workflow `results/figures/`
- `<workflow-stage>/logs/<module_id>.log`
- `<workflow-stage>/logs/<module_id>_session_info.txt` or `.json`
- `<workflow-stage>/logs/<module_id>_warnings.tsv` when warnings occur
- `<workflow-stage>/results/output_manifest.json`

`omics_analysis` manifest schema:

```json
{
  "schema": "openbioscience.analysis_script.outputs.v2",
  "workflowKind": "omics_analysis",
  "analysisId": "...",
  "stageOrEpisodeId": "...",
  "environmentRef": "...",
  "inputs": [],
  "outputs": {
    "objects": [],
    "tables": [],
    "figures": [],
    "reports": [],
    "logs": [],
    "scripts": []
  },
  "assumptions": [],
  "warnings": []
}
```

`omics_reproduction` manifest schema:

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

After all `omics_reproduction` contract-required scripts finish, pass their manifests and module results to `bio_reproduction(action="complete_execution")`. For `omics_analysis`, pass script outputs through the matching `bio_analysis(action="complete_*")` stage or episode action. Do not construct a completion receipt in a script.

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
- All outputs are under the declared `omics_analysis/<analysisId>/...` stage tree or `case_reproduction/execution/`.
- The report path shown to the user and registered with `science_artifact` is the canonical UI-openable path under `omics_analysis/<analysisId>/...`; do not present an external mirror as the main result.
- Input validation happens before analysis.
- Session/package information is written.
- Scientific assumptions and conditional decisions are documented.
- For `omics_analysis`, every script has no violations from `bio_analysis(action="preflight_scripts")` and writes `openbioscience.analysis_script.outputs.v2`.
- For `omics_analysis` exploration packages, `script_manifest.json` declares `scientificDecisions`, every decision maps to the script/module path that implements it, and every public helper function has local human-readable documentation rather than relying only on the package header.
- For `omics_reproduction`, every script module exists in the current execution contract, every required module has a machine-readable result, every script has a ready `ScriptValidationReceipt` from `preflight_execution_scripts`, and every applied Skill has a ready SkillComplianceReceipt before execution.
- For `omics_reproduction`, target and cohort declarations reconcile with the validated paper map and scope; exact, analogous, and scoped targets remain distinguishable in output manifests.
- Project roots and input/output paths come from arguments or config; scripts never hardcode `/app/demo/...` or another deployment-specific absolute path.
- JSON writers reject or convert non-finite values, and generated files are host-readable.

## Next

- Environment missing -> `bio-environment-manager`.
- Environment choice unclear -> `bio-environment-routing`.
- Script outputs ready for claim review -> `bio-result-interpretation`.
- Plot-specific polishing -> `bio-scrna-plotting` or `bio_plot` when compatible.
