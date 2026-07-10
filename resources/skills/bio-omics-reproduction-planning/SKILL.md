---
name: bio-omics-reproduction-planning
description: >
  Use when planning, auditing, scoping, or demoing reproduction of an omics paper or article in OpenBioScience, including paper/source package creation, source/data/code availability audit, demo case planning, figure/table/panel feasibility analysis, claim support boundaries, and execution-unit routing before any scRNA-seq, bulk RNA-seq, spatial, ATAC, multiome, proteomics, CCI, trajectory, GRN, or CNV workflow.
---

# Bio Omics Reproduction Planning

## Purpose

Plan an omics paper reproduction before analysis execution.
Turn a paper, accession, repository, supplement, local demo case, or user objective into a bounded Planning Package.
Decide what can be attempted, what is conditional, and what is blocked; do not execute analysis, write final scripts, install packages, or claim reproduced biology.
Read references only when needed: `reproduction-plan-template.md` for the plan, `source-audit-schema.md` for audit JSON, `lightweight-localization-policy.md` before localization, and `modality-routing-notes.md` before downstream routing.

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
2. Audit sources: classify paper, data, code, and reference resources with the `source-audit-schema.md` status vocabulary: `ready`, `partial_ready`, `conditional_continue`, `planned_only`, `blocked_for_localization`, `blocked_for_execution`, `unresolved`, or `fatal_block`; write `planning/source_audit.json`.
3. Define reproducible scope: mark each claim, panel, and method unit as ready, conditional, execution-blocked, localization-blocked, or out of scope; record downgrade reasons.
4. Plan execution modules: split ready or conditional scope into modules with inputs, environmentRef candidates, skill/MCP route, capability gaps, expected tables, figures, objects, logs, and review criteria.
5. Set the script boundary: state what may enter a later script or runner phase, what remains plan-only, and what requires approval, credentials, new data, new environments, or downstream skill implementation.

## Output Contract

The Planning Package must use:

```text
case_reproduction/
  planning/
    reproduction_plan.md
    source_audit.json
    localized/
```

`reproduction_plan.md` must include objective, source summary, availability summary, ready/conditional/blocked scope, planned execution modules, expected outputs, environmentRef candidates, skill/MCP route, and execution boundary.
`source_audit.json` must include paper, data, code, referenceResources, localized, plannedOnly, warnings, and timestamp fields.
If execution is later approved, plan for `execution/scripts/`, `execution/configs/`, `execution/results/`, `execution/logs/execution.log`, and `execution/logs/review.md`, but do not create scripts here.

## Fallback and Stop Rules

- Code unavailable -> plan methods-based reimplementation only; block exact-code reproduction claims.
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
- Figure output planning -> `bio-scrna-plotting` or `bio_plot` when modality-compatible.
- Final claim wording after executed outputs exist -> `bio-result-interpretation`.
- Non-scRNA modalities without an implemented downstream skill -> keep the module planned-only with explicit gaps.
