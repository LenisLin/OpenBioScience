---
name: bio-omics-reproduction-planning
description: >
  Use when planning, auditing, scoping, or demoing reproduction of an omics paper or article in OpenBioScience, including paper/source package creation, source/data/code availability audit, demo case planning, figure/table/panel feasibility analysis, claim support boundaries, and execution-unit routing before any scRNA-seq, bulk RNA-seq, spatial, ATAC, multiome, proteomics, CCI, trajectory, GRN, or CNV workflow.
---

# Bio Omics Reproduction Planning

## Method Parameter Gate

- Require a current `PaperReproductionMapReceipt` and `ReproductionScopeReceipt` before method extraction or plan validation.
- Before `validate_reproduction_plan`, follow `bio-method-parameter-reconstruction`.
- Require `bio_source.inspect_method_sources`, `bio_reproduction.extract_method_parameters`, and the canonical `planning/method_parameter_contract.json`.
- Pass the current MethodParameterReceipt into `validate_reproduction_plan`.
- Unreported parameters do not block scoped planning, but they cannot support parameter-aligned or figure-level claims.

## Paper Map And Scope Gate

- Write `case_reproduction/planning/paper_reproduction_map.json` using `references/paper-reproduction-map-schema.md`.
- `bio_source(action="index_paper_sources")` writes `planning/paper_target_inventory.json`. Every indexed figure/panel concept must appear in the map or an explicit unresolved/excluded decision.
- Call `bio_reproduction(action="validate_paper_reproduction_map")` with `sourceReceiptIds`, then call `bio_reproduction(action="validate_reproduction_scope")` with `paperMapReceiptId`. Never pass complete receipt objects.
- Include every requested or paper-relevant figure, panel, claim, cohort, method unit, data dependency, and expected output. Every included target must have an explicit scope decision; no target, cohort, or dependency may disappear between the paper map, plan, execution contract, and final coverage table.
- Use `excluded_by_user` only for a recorded user decision and include `userDecisionId`. Missing data, methods, code, runtime, or permissions are blocks or unresolved items, not exclusions.
- Use the reproduction modes exactly as defined in the schema reference: `exact`, `analogous`, or `scoped_reimplementation`. These modes describe scientific correspondence and are independent of readiness status.

## Purpose

Plan an omics paper reproduction before analysis execution.
Turn a paper, accession, repository, supplement, local demo case, or user objective into an audit-informed, execution-oriented Planning Package.
The audit is an input to planning, not a pass/fail gate. Maximize useful similarity to the published analysis by preserving available methods, parameters, algorithms, comparisons, and output types; when exact inputs are unavailable, design explicit substitute or proxy analyses instead of declaring the whole article non-reproducible.
Decide what can be attempted exactly, approximately, conditionally, or through a documented substitute; do not execute analysis, write final scripts, install packages, or claim reproduced biology.
Read references only when needed: `paper-reproduction-map-schema.md` for paper mapping and scope, `reproduction-plan-template.md` for the plan, `source-audit-schema.md` for audit JSON, `lightweight-localization-policy.md` before localization, and `modality-routing-notes.md` before downstream routing.

## OpenBioScience Adapter

- Treat `openscience-science`, `research_evidence`, `science_artifact`, `bio_reproduction`, `bio_source`, and `bio_runtime` as the controlling contract.
- Use this skill as workflow guidance, not as evidence.
- Use `research_evidence` for paper, supplement, accession, database, and repository lookup.
- Use `bio_reproduction` as planning coordinator when available; do not let it replace `bio_source` or `bio_runtime`.
- Use `bio_source` for accession, data-manifest, file semantics, and download-plan details.
- Use `bio_runtime` for environmentRef, capability, package, and workflow-readiness checks.
- Register paper package, source audit, plan, decisions, warnings, localized files, and later execution outputs through `science_artifact`.
- Treat paper methods, code, notebooks, and README files as source material, not reproduced evidence.

## Execution Policy

- Default mode is `planning_only`; default safety is `restricted_default`.
- Do not execute paper code, notebooks, R/Python workflows, shell snippets, package installers, or environment mutations.
- Do not download large omics data, controlled-access data, credential-gated data, or unclear-license data.
- Localize only small allowed source files under the lightweight localization policy.
- Continue planning through gaps whenever safe; block only the affected resource or execution unit.
- Prefer a bounded approximate module over an empty blocked scope when local data can support a scientifically related analysis. Label the approximation and the divergence from the paper.
- For local single-cell datasets, import/QC is not a sufficient terminal plan when the user also requests downstream analysis. Derive the minimum execution plan from the user objective and the scoped paper target. Include annotation, composition, condition comparisons, markers, disease programs, and figures only when requested or required by that target; do not impose an unrequested disease program as a hard completion gate.
- Stop the whole planning flow only for fatal safety, permissions, or missing-context conditions.

## Scope

Use for:

- full article reproduction planning for omics papers
- demo case planning before a scripted or runner-backed reproduction attempt
- data, code, supplement, reference-resource, and availability audits
- figure, table, panel, method-unit, and claim feasibility analysis
- decomposition into executable modules with expected outputs
- routing to modality-specific skills after the top-level paper audit

Do not use for direct user-data analysis without a paper objective, workflow execution, production script writing, result selection, final biological interpretation, favorable-reproduction claims, or downstream leaf workflow implementation.

## Inputs

Required:

- `objective`
- `paper_or_source`
- `reproduction_scope` or requested figures, tables, panels, claims, or demo case
- `omics_modality` or `modality:auto`

Recommended:

- PDF, supplement, accession IDs, repository URLs, or local source paths
- species, cohort, tissue, disease, perturbation, and sample-level design
- expected outputs and acceptable demo simplifications
- local data paths, artifact namespace, and license/privacy/access constraints

## Mandatory Stage Flow

1. Build the paper evidence package: locate PDF, supplement, methods, data availability, code availability, accessions, key figures, tables, and panels; save stable pointers and safe localized files under `planning/localized/`.
2. Build and validate the paper map: map evidence-backed figures, panels, claims, cohorts, method units, dependencies, and expected outputs; write `planning/paper_reproduction_map.json`; obtain a ready `PaperReproductionMapReceipt`.
3. Validate scope: add an explicit decision for every relevant target, distinguish `exact`, `analogous`, and `scoped_reimplementation`, record all blocks and user exclusions, and obtain a ready `ReproductionScopeReceipt`. Never infer scope from whichever local files happen to be available.
4. Audit sources: classify paper, data, code, and reference resources with the `source-audit-schema.md` status vocabulary: `ready`, `partial_ready`, `conditional_continue`, `planned_only`, `blocked_for_localization`, `blocked_for_execution`, `unresolved`, or `fatal_block`; write `planning/source_audit.json`.
5. Reconstruct methods and plan execution modules: split the validated scope into modules with target IDs, cohort IDs, inputs, preserved methods/parameters, intentional deviations, environmentRef candidates, skill/MCP route, capability gaps, expected tables, figures, objects, logs, and review criteria.
6. Set the script boundary: state what may enter a later script or runner phase, what remains plan-only, and what requires approval, credentials, new data, new environments, or downstream skill implementation. Route approved script drafting to `bio-analysis-script-authoring`; route missing or custom environment work to `bio-environment-manager`.

## Output Contract

The Planning Package must use:

```text
case_reproduction/
  planning/
    paper_target_inventory.json
    paper_reproduction_map.json
    reproduction_plan.md
    source_audit.json
    localized/
```

`paper_target_inventory.json` is MCP-owned and content-addressed; do not edit it manually. `paper_reproduction_map.json` must cover its indexed targets and satisfy the schema and graph invariants in `references/paper-reproduction-map-schema.md`.
`reproduction_plan.md` must include objective, source summary, map and scope receipt IDs, availability summary, ready/conditional/blocked scope, planned execution modules with target/cohort IDs, expected outputs, environmentRef candidates, skill/MCP route, and execution boundary.
`source_audit.json` must include paper, data, code, referenceResources, localized, plannedOnly, warnings, and timestamp fields.
If execution is later approved, plan for `execution/scripts/`, `execution/configs/`, `execution/results/`, `execution/logs/execution.log`, and `execution/logs/review.md`, but do not create scripts here.

## Completion Gate

Do not publish a reproduction-feasibility conclusion until all of the following are true:

1. The local `SKILL.md` has been read, its requirements have been applied, and `bio_reproduction(action="validate_skill_compliance")` has returned a ready `SkillComplianceReceipt` for the current skill content hash. Only validated `skillUses` from a completion receipt may be passed to `science_artifact` and surfaced as `usedSkills`; do not manually register a skill as used before validation.
2. `bio_reproduction` has been called in order for source package construction, paper-map validation, scope validation, availability audit, method reconstruction, plan drafting, and plan validation.
3. The canonical Planning Package exists at `case_reproduction/planning/`; ad hoc reports under `outputs/` do not satisfy this requirement.
4. Every selected official `environmentRef` has a `bio_runtime(action="probe_environment")` result. A `path_only`, `not_run`, or shell-PATH check is not execution readiness.
5. Local PDF extraction has been attempted with the primary available extractor, independently of optional preliminary probes.
6. The Science report records source status, environment probe evidence, planning validation, selected skills, MCP routes, warnings, and the exact execution boundary.

`validate_reproduction_plan` is the planning completion coordinator for this gate. Pass only current map, scope, method, source, runtime, and Skill-compliance receipt IDs. Source indexing, environment probes, and ready phase receipts are content-addressed and must be reused when their dependency fingerprints are unchanged. An `invalid_request` permits exactly one corrected call; never retry the unchanged malformed payload. Do not replace a required action with an ad hoc audit script.

A missing, malformed, or incomplete method-parameter receipt is a correctable workflow step, not a provenance limitation. Do not publish a terminal Science status, downgrade the failure to a warning, or construct a substitute receipt manually. Use only declared Science panel statuses and pass the exact ready receipt returned by `bio_reproduction`.

The coordinator reports two independent outcomes:

- `planningCompletion`: whether this workflow and its canonical Planning Package are complete.
- `executionReadiness`: whether all, some, or none of the planned modules can currently run.

Unavailable external data, credentials, permissions, or environments reduce `executionReadiness`; they do not make `planningCompletion` incomplete when accurately classified. Pass only the resulting `completionReceiptId` to the final `science_artifact` publish call with `workflowKind: "omics_reproduction"`.

If a required control surface is unavailable, mark the affected item `blocked_for_execution` or `unresolved` and state the missing call or artifact. Do not replace a missing stage with a prose summary.

## User-Facing Conclusion Contract

The final chat answer and Science report must distinguish four separate conclusions:

- locally available data and metadata
- modules supported by those data
- modules whose selected runtime passed executable/package probes
- exact, figure-level, legacy-version, controlled-access, or other claims that remain unsupported

Use `P0` and `P1` only when the plan defines them. Input preparation for a P1 module is not evidence that the P1 analysis is executable or reproduced.

## Fallback and Stop Rules

- Before using optional inspection utilities, probe them independently with `command -v <tool>` or run the required tool directly and handle exit code 127. Do not chain optional probes such as `file` or `pdfinfo` before the primary extraction command with `&&`; a missing probe must not prevent `pdftotext`, Python PDF extraction, or another available fallback from running.
- For local PDFs, prefer `pdftotext -layout <pdf> <output>` when available. If PATH lookup fails after `bio_runtime` resolves an official environment, probe `${OPENBIOSCIENCE_RUNTIME_ROOT}/environments/official/sc-py-singlecell/bin/pdftotext` directly before using an existing Python PDF library. Report the exact missing executable only after both probes; do not infer that one missing PDF utility means all PDF extraction is unavailable.
- When the runtime reports `[LOAD_SKILL: bio-omics-reproduction-planning]`, treat the skill as loaded. In WebUI containers its source may be under `/data/builtin-skills/bio-omics-reproduction-planning/SKILL.md`, not inside the authorized research workspace.
- PaperClip and `bio_tools` are optional providers of the `research_evidence` aggregation service. If they are disabled, state only which provider-backed lookup is unavailable; continue with local PDFs, local data, direct allowed web sources, `bio_source`, `bio_runtime`, and other configured MCPs. Do not describe optional-provider absence as the OpenBioScience evidence or Bio MCP stack being unavailable.
- Resolve official environments through `bio_runtime` and `OPENBIOSCIENCE_RUNTIME_ROOT`; do not infer that an environment is missing merely because it is absent from the shell PATH. Report `missing` only after the resolved prefix and required executables/packages are probed.
- Code unavailable -> plan methods-based reimplementation only; block exact-code reproduction claims.
- A requested or paper-relevant target cannot run -> retain it in the map and scope table with `external_data_block`, `capability_block`, or `unresolved`; never delete it from downstream coverage.
- Raw counts unavailable -> downgrade count-dependent QC, DE, trajectory, CNV, or pseudobulk claims.
- Metadata incomplete -> block only comparisons requiring missing sample, patient, condition, response, or batch fields.
- Environment unavailable -> create a capability-gap task; do not install packages during planning.
- Large, controlled, credentialed, or unclear-license files -> mark planned-only or execution-blocked.
- Fatal stop only for unsafe URL/path behavior, credential requests, controlled data without authorization, no identifiable paper/source, or user objective too ambiguous to scope.

## Gotchas

| Symptom                                         | Likely cause                                       | Planning response                                      |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Paper has impressive figures but no raw data    | processed or figure-level outputs only             | Plan limited panels and block raw-dependent claims     |
| Repository exists but scripts are not runnable  | missing environment, data paths, or private assets | Audit code as source material and plan gaps            |
| Supplement names datasets but no accession maps | fragmented availability statement                  | Route to `bio_source` or mark unresolved units         |
| Demo data is smaller than paper data            | intentional capability demo                        | Label demo reproduction, not full article reproduction |
| Leaf workflow is absent                         | downstream workflow not implemented                | Keep module planned-only and record required route     |

## Next Routing

- scRNA-seq scope after this plan -> `bio-scrna-reproduction`.
- Dataset, accession, or file-semantics detail -> `bio-data-resolution` or `bio_source`.
- Runtime capability and environmentRef detail -> `bio-environment-routing` or `bio_runtime`.
- Missing, custom, or user-registered environment support -> `bio-environment-manager` or `bio_environment_manager`.
- Approved script drafting after a bounded module exists -> `bio-analysis-script-authoring`.
- Figure output planning -> `bio-scrna-plotting` or `bio_plot` when modality-compatible.
- Final claim wording after executed outputs exist -> `bio-result-interpretation`.
- Non-scRNA modalities without an implemented downstream skill -> keep the module planned-only with explicit gaps.
