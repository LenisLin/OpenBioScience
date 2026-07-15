---
name: bio-method-parameter-reconstruction
description: >
  Use for paper, article, figure, or omics reproduction before analysis scripts are authored. It reconstructs reported method parameters from paper Methods, supplements, author code, and figure legends, then constrains execution claims to the validated alignment level.
---

# Bio Method Parameter Reconstruction

## Required Control Sequence

1. Require ready `PaperReproductionMapReceipt` and `ReproductionScopeReceipt` values for the current `planning/paper_reproduction_map.json`; extract parameters only for mapped method units in the validated scope.
2. Locate project-relative paper text and supplements plus public author GitHub URLs.
3. Call `bio_source(action="inspect_method_sources")` with mapped method-unit and evidence IDs.
4. Reuse the returned `methodSourceReceiptId`; never copy, trim, or reconstruct the receipt object.
5. Call `bio_reproduction(action="extract_method_parameters")` with `methodSourceReceiptId`, `paperMapReceiptId`, and `scopeReceiptId`.
6. The MCP atomically writes `case_reproduction/planning/method_parameter_contract.json` and returns a ready `receiptId` in the same call. Do not rewrite MCP-owned canonical content.
7. Pass only map, scope, and method receipt IDs to reproduction planning and script authoring.
8. Require scripts to emit `execution/configs/executed_parameters.json` and declare `OpenBioScience-Parameters`.
9. After scripts and the executed manifest exist, call `bio_reproduction(action="validate_method_alignment")`.
10. Validate this Skill's current requirements with `bio_reproduction(action="validate_skill_compliance")`; do not surface it in `usedSkills` before a ready SkillComplianceReceipt exists.

A missing, malformed, or incomplete map, scope, or MethodParameterReceipt is a correctable workflow step, not a provenance limitation. An `invalid_request` is an MCP contract error: execute only its `correctedCall`, once. Do not publish a terminal Science status, downgrade the failure to a warning, pass full receipt objects, or construct a substitute receipt manually. Stop on `stopWhenUnchanged`, unchanged validation/precondition fingerprints, or an external blocker until its requested input, file, or external state changes.

## Evidence Rules

- Record only parameters explicitly supported by `paper_methods`, `supplement`, `author_code`, or `figure_legend`.
- Preserve source locator, reported value, normalized value, and content hash.
- Never register Agent inference, package defaults, or local reanalysis values as reported parameters.
- Parameters absent from the sources need no per-parameter missing audit. Record their actual execution values as `analysis_choice`.
- Preserve paper/code conflicts. Do not silently choose one source as authoritative.
- Do not omit a mapped method unit because its parameters are unavailable. Keep it in module coverage as unreported, conflicted, blocked, or scoped, and retain its target IDs.
- A material conflict may request user input when parameter-aligned reproduction is requested; scoped reimplementation may continue with the conflict visible.

## Claim Rules

- `parameter_aligned`: every declared executed parameter with source evidence matches and no conflict remains.
- `partially_aligned`: some reported parameters match and some are substituted or analysis choices.
- `scoped_reimplementation`: execution primarily uses analysis choices or another workflow.
- `unresolved_conflict`: paper/code evidence disagrees.
- Only `parameter_aligned` may support a parameter-aligned reproduction claim.
- None of these levels alone establishes figure-level reproduction.
- Paper-level reproduction mode remains separate: `exact` requires the same panel/claim, cohort dependency, compatible data layer, method family, material reported parameters, comparison, and output semantics; `analogous` changes a declared cohort/data/contrast dependency while preserving the scientific question; `scoped_reimplementation` implements a bounded subset or proxy workflow.

## Prohibited Substitutions

- Do not replace failed Bio MCP stages with an ad hoc Python audit.
- Do not infer that a repository contains the full paper pipeline because it contains one analysis module.
- Do not clone author repositories in this workflow; public GitHub access is fixed-commit remote reading only.
- Do not publish execution as completed without a current MethodAlignmentReceipt.
