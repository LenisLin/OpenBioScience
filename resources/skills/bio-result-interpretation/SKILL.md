---
name: bio-result-interpretation
description: >
  Use when scRNA-seq outputs need objective interpretation, claim-boundary review, reproduction comparison, limitations, figure/table narration, or decision-ready summaries after data, QC, clustering, markers, annotation, or plotting artifacts exist. Route missing evidence back to the relevant bio-* skill and avoid interpreting unregistered outputs.
---

# Bio Result Interpretation

## Method Alignment

The paper-map and method-alignment requirements in this section apply only to `omics_reproduction`.

For `omics_analysis`, interpret only the current accepted baseline or episode receipt. State direct observations, analysis assumptions, inferential limits, unresolved labels, and metadata/batch limits without reproduction wording or paper-coverage audit.

- Require the current `PaperReproductionMapReceipt` and `ReproductionScopeReceipt`, and interpret results against target-level coverage rather than file presence alone.
- Derive reproduction wording from the MethodAlignmentReceipt.
- Separate data-layer reproduction, method-structure reproduction, partial parameter alignment, parameter-aligned reproduction, scoped reimplementation, and figure-level reproduction.
- Report only extracted parameters, actual values, important substitutions, and source conflicts; do not generate a verbose list of every unreported parameter.
- Refuse parameter-aligned claims when substitutions, analysis choices, or unresolved source conflicts remain.

## Execution Completion

- Require a current `ReproductionExecutionReceipt` before using terminal wording such as execution completed, validated, or reproduced.
- Require the receipt's `scriptValidationReceiptId`, execution-run receipts, and Skill-compliance-backed `skillUses` to be current. Do not manually infer `usedSkills` from loaded or mentioned Skill files.
- Treat `generated_unvalidated` modules as generated outputs, not validated scientific results.
- Treat declared blocked contrasts as scientific limits when the final receipt reports `validated_with_limits`; do not describe them as pipeline failures.
- Discuss a disease program only when it is required by the execution contract or separately requested by the user.

This skill converts registered scRNA-seq artifacts into bounded scientific interpretation. It distinguishes observations, assumptions, inferences, and unsupported claims.

## Reproduction Wording

- `exact`: use only when the same panel or claim, cohort/data dependency, compatible data layer, reported method family and material parameters, comparison, and output semantics were validated.
- `analogous`: use when a different declared cohort, dataset, assay, contrast, or reference dependency addresses the same scientific question with comparable output semantics.
- `scoped_reimplementation`: use for a bounded subset, proxy output, reduced cohort, modernized workflow, or analysis-choice parameter set.

Never upgrade mode because an output is visually similar or statistically favorable. Report mode separately from completion, scientific outcome, and readiness.

## OpenBioScience Adapter

- Treat `science_artifact` as the evidence ledger; do not interpret unregistered outputs as established evidence.
- Use `research_evidence` for paper comparison and external biological context.
- Use `bio_runtime` only for targeted environment checks and require `bio_statistics` receipts for condition-level DE interpretation.
- Record final claims, caveats, rejected interpretations, and unresolved issues through `science_artifact`.
- Do not overstate causality from observational scRNA-seq analyses.

## Scope

Use this skill for:

- Summarizing QC, clustering, marker, annotation, and figure outputs.
- Comparing reproduced results with paper claims.
- Writing limitations and claim boundaries.
- Reviewing whether outputs support downstream biological, clinical, or mechanistic statements.

Route elsewhere for:

- Missing data/source -> `bio-data-resolution`.
- Missing import/QC/clustering/marker/annotation/plot artifacts -> the relevant upstream skill.
- Additional computations -> controlled runner via the step-specific skill.

## Inputs

Required:

- registered artifact list
- user objective or claim list
- relevant summaries from upstream skills

Recommended:

- paper claim excerpts or figure IDs
- data support table
- known limitations
- target audience and output format

## Workflow

1. Inventory registered artifacts and confirm each requested claim has supporting evidence.
2. Reconcile every requested or paper-relevant figure, panel, claim, cohort, and dependency from the validated map against final coverage. Keep blocked, unresolved, failed, and user-excluded items visible; do not silently omit them from the narrative or claim table.
3. Separate direct observations, statistical results, biological inferences, assumptions, and unsupported claims.
4. For every condition comparison, report effective biological replicate counts after exclusions and pairing; treat blocked contrasts as descriptive only.
5. Compare reproduced outputs with source claims using exact figure/table/claim references where available.
6. Identify sensitivity to QC, clustering, batch correction, marker thresholds, and annotation uncertainty.
7. Draft concise interpretation with explicit limitations and blocked claims.
8. Validate this Skill with `bio_reproduction(action="validate_skill_compliance")`, then register only validated interpretation notes, claim boundaries, unresolved issues, and completion-receipt `skillUses` through `science_artifact`.

For correctable validation actions, honor `maxAttempts`; otherwise permit at most two corrective retries after the initial call per action fingerprint. Stop on `stopWhenUnchanged`, unchanged validation/precondition fingerprints, or an external blocker.

## Output Contract

Every interpretation pass should produce:

- `reports/result_interpretation.md`
- `reports/claim_boundary.json`
- `tables/claim_evidence_map.tsv`
- `logs/result_interpretation.log`

Claim boundary schema:

```json
{
  "schema": "openbioscience.result_interpretation.claim_boundary.v1",
  "objective": "...",
  "directObservations": [],
  "supportedClaims": [],
  "conditionalClaims": [],
  "unsupportedClaims": [],
  "unresolvedIssues": [],
  "warnings": []
}
```

## Gotchas

| Symptom                                  | Likely cause            | Fix                                                                  |
| ---------------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| Narrative says "proves" or "drives"      | causal overstatement    | Rephrase as association/observation unless design supports causality |
| Result depends on one cluster resolution | clustering sensitivity  | Report conditional claim and request sensitivity analysis            |
| Annotation uncertainty hidden            | forced label assignment | Include confidence/ambiguity from annotation artifacts               |
| Figure used without manifest             | unregistered evidence   | Route back to plotting/artifact registration before interpretation   |

## Validation

- Every claim maps to at least one registered artifact or is marked unsupported.
- Every mapped figure, panel, claim, cohort, and dependency maps to a completed, analogous, scoped, blocked, unresolved, failed, or user-excluded coverage row; there are no silent exclusions.
- Limitations mention metadata, replication, batch/confounding, raw-count availability, and annotation uncertainty when relevant.
- Paper comparison uses exact claim/figure references where available.
- Final text distinguishes facts, assumptions, inferences, and unresolved issues.
- No inferential claim is made for `blocked_insufficient_replicates`, `blocked_invalid_design`, or `failed` contrasts.
- Biological labels are interpreted from source context. `MF1` through `MF4` are myofibroblast phenotype labels in the human CRC paper and must not be reported as non-negative matrix factorization components.

## Next

- Missing evidence -> route to the relevant upstream `bio-*` skill.
- Interpretation complete -> register final report and claim boundary through `science_artifact`.
