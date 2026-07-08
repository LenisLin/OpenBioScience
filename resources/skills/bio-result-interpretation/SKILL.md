---
name: bio-result-interpretation
description: >
  Use when scRNA-seq outputs need objective interpretation, claim-boundary review, reproduction comparison, limitations, figure/table narration, or decision-ready summaries after data, QC, clustering, markers, annotation, or plotting artifacts exist. Route missing evidence back to the relevant bio-* skill and avoid interpreting unregistered outputs.
---

# Bio Result Interpretation

This skill converts registered scRNA-seq artifacts into bounded scientific interpretation. It distinguishes observations, assumptions, inferences, and unsupported claims.

## OpenBioScience Adapter

- Treat `science_artifact` as the evidence ledger; do not interpret unregistered outputs as established evidence.
- Use `research_evidence` for paper comparison and external biological context.
- Use `bio_runtime` only for targeted checks needed to resolve inconsistencies.
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
2. Separate direct observations, statistical results, biological inferences, assumptions, and unsupported claims.
3. Compare reproduced outputs with source claims using exact figure/table/claim references where available.
4. Identify sensitivity to QC, clustering, batch correction, marker thresholds, and annotation uncertainty.
5. Draft concise interpretation with explicit limitations and blocked claims.
6. Register interpretation notes, claim boundary table, and unresolved issues through `science_artifact`.

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

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Narrative says "proves" or "drives" | causal overstatement | Rephrase as association/observation unless design supports causality |
| Result depends on one cluster resolution | clustering sensitivity | Report conditional claim and request sensitivity analysis |
| Annotation uncertainty hidden | forced label assignment | Include confidence/ambiguity from annotation artifacts |
| Figure used without manifest | unregistered evidence | Route back to plotting/artifact registration before interpretation |

## Validation

- Every claim maps to at least one registered artifact or is marked unsupported.
- Limitations mention metadata, replication, batch/confounding, raw-count availability, and annotation uncertainty when relevant.
- Paper comparison uses exact claim/figure references where available.
- Final text distinguishes facts, assumptions, inferences, and unresolved issues.

## Next

- Missing evidence -> route to the relevant upstream `bio-*` skill.
- Interpretation complete -> register final report and claim boundary through `science_artifact`.
