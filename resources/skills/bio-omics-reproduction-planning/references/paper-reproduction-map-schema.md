# Paper Reproduction Map Schema

Use this reference when creating or reviewing `case_reproduction/planning/paper_reproduction_map.json`.
The map is the evidence-backed target graph for a paper-scoped reproduction. It is not a feasibility conclusion or evidence that analysis ran.

`bio_source(action="index_paper_sources")` also writes the MCP-owned
`case_reproduction/planning/paper_target_inventory.json`. This inventory is a deterministic extraction of paper-level
figure, panel, method, cohort, and outcome concepts. It is not a second audit. Every relevant inventory target must be
represented in the reproduction map or linked to an explicit unresolved or excluded scope decision before map validation
can become ready.

## Reproduction Modes

- `exact`: targets the same paper panel or claim with the same cohort or dataset dependency, compatible data layer, reported method family, material reported parameters, comparison, and output semantics. Visual similarity alone is not exact reproduction.
- `analogous`: targets the same scientific question and comparable output semantics with a different but explicitly justified cohort, dataset, assay, contrast, or reference dependency. It cannot be described as reproducing the paper cohort or panel exactly.
- `scoped_reimplementation`: implements only a bounded subset or structural analogue of the paper workflow, including modernized software, analysis-choice parameters, reduced cohorts, proxy outputs, or omitted paper components. It supports only scoped reimplementation claims.

Reproduction mode and readiness are independent. For example, an `exact` target may be `external_data_block`, while a ready local analysis may still be only `scoped_reimplementation`.

## Canonical Shape

```json
{
  "schema": "openbioscience.paper_reproduction_map.v1",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "sources": [
    { "id": "source-paper", "kind": "paper_text", "path": "planning/localized/paper.txt", "contentHash": "<sha256>" }
  ],
  "evidence": [
    {
      "id": "evidence-figure-1a",
      "sourceId": "source-paper",
      "sourceHash": "<same source content hash>",
      "path": "planning/localized/paper.txt",
      "page": 2,
      "section": "Figure 1 legend",
      "excerptHash": "<sha256 of the retained excerpt>",
      "basis": "explicit"
    }
  ],
  "figures": [
    {
      "id": "figure-1",
      "label": "Figure 1",
      "title": "...",
      "panelIds": ["panel-1a"],
      "evidenceIds": ["evidence-figure-1a"]
    }
  ],
  "panels": [
    {
      "id": "panel-1a",
      "figureId": "figure-1",
      "label": "Figure 1a",
      "claimIds": ["claim-1"],
      "cohortIds": ["cohort-1"],
      "methodUnitIds": ["method-1"],
      "dependencyIds": ["dependency-1"],
      "expectedOutputIds": ["output-1"],
      "evidenceIds": ["evidence-figure-1a"]
    }
  ],
  "claims": [{ "id": "claim-1", "text": "...", "claimKind": "descriptive", "evidenceIds": ["evidence-figure-1a"] }],
  "cohorts": [{ "id": "cohort-1", "label": "...", "datasetIds": ["GSE000000"], "evidenceIds": ["evidence-figure-1a"] }],
  "methodUnits": [
    {
      "id": "method-1",
      "analysisFamily": "clustering",
      "reportedMethod": "...",
      "parameterIds": [],
      "evidenceIds": ["evidence-figure-1a"]
    }
  ],
  "dataDependencies": [
    {
      "id": "dependency-1",
      "label": "...",
      "cohortIds": ["cohort-1"],
      "modality": "scRNA-seq",
      "requiredFields": ["counts"],
      "localSupport": "partial",
      "evidenceIds": ["evidence-figure-1a"]
    }
  ],
  "expectedOutputs": [
    { "id": "output-1", "label": "...", "artifactKind": "figure", "evidenceIds": ["evidence-figure-1a"] }
  ],
  "scopeDecisions": [
    {
      "id": "scope-panel-1a",
      "targetIds": ["panel-1a"],
      "reproductionMode": "scoped_reimplementation",
      "status": "ready",
      "reason": "..."
    }
  ],
  "conflicts": [],
  "unresolvedItems": []
}
```

## Graph Invariants

- IDs are unique within and across target collections where references could otherwise be ambiguous.
- Every `sourceId`, `figureId`, evidence ID, claim ID, cohort ID, method-unit ID, dependency ID, and expected-output ID resolves to an existing object.
- Every panel is listed by its parent figure, and each figure-listed panel points back to that figure.
- Every requested or paper-relevant figure, panel, and claim has at least one scope decision. Decisions may group targets only when the same mode, status, and reason apply to all of them.
- Every panel declares its source cohort and data dependencies. A dependency with `localSupport: "missing"` or `"unresolved"` remains in the map.
- `excluded_by_user` requires `userDecisionId`. Data, code, method, runtime, credential, and permission gaps use `external_data_block`, `capability_block`, `conditional`, or `unresolved` instead.
- Every evidence locator records a stable source hash and excerpt hash. Store short necessary excerpts or hashes, not a redistributed full paper or full omics matrix.
- Cross-source inference and agent inference are labeled through `basis`; they are never represented as explicit paper statements.
- Method labels are interpreted in context. A biological label such as `MF1` through `MF4` must not be expanded into an unrelated algorithm such as non-negative matrix factorization unless the source explicitly says so.

## Scope And Lifecycle

1. Index paper sources once and retain the returned source receipt IDs; reuse a cache hit while source hashes remain unchanged.
2. Validate the canonical map with `bio_reproduction(action="validate_paper_reproduction_map")`, passing receipt IDs only.
3. Resolve a returned `correctedCall` once under the bounded retry policy and retain the ready `PaperReproductionMapReceipt`.
4. Validate explicit decisions with `bio_reproduction(action="validate_reproduction_scope")` and retain the ready `ReproductionScopeReceipt`.
5. Carry target IDs, cohort IDs, dependency IDs, and receipt IDs into method reconstruction, planning, execution contracts, script preflight, completion coverage, and interpretation.
6. Validate each applied local Skill with `bio_reproduction(action="validate_skill_compliance")`. Only completion-receipt `skillUses` backed by ready Skill-compliance receipts may become `science_artifact` `usedSkills`.

For a repeated correctable action, honor `maxAttempts`; otherwise permit at most two corrective retries after the initial call for the same `actionFingerprint`. Stop on unchanged validation/precondition fingerprints, `stopWhenUnchanged`, or an external blocker.
