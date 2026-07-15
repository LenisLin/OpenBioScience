---
name: bio-cell-annotation
description: >
  Use when scRNA-seq clusters or cells need cell type annotation, marker-panel review, reference label transfer, ontology-aware naming, confidence grading, ambiguous-label handling, or annotation provenance for reproduction. Applies after marker optimization or when processed objects already contain clusters. Route plotting to bio-scrna-plotting and claim interpretation to bio-result-interpretation.
---

# Bio Cell Annotation

## Assisted Prior Mode

For `omics_analysis` baseline, use `assisted_prior`. Store `prior_label`, marker/atlas evidence, `final_label`, confidence, and unresolved status separately. A prior may guide review but cannot overwrite contradictory marker evidence or unresolved ambiguity. Minor subtype labels belong to an approved episode, not baseline.

This skill assigns defensible cell labels from marker evidence, references, and metadata. It preserves uncertainty instead of forcing labels.

## Reproduction Contract Gate

- For paper-scoped work, require current `PaperReproductionMapReceipt`, `ReproductionScopeReceipt`, and `ExecutionContractReceipt` values. Annotation must serve declared target IDs and cohort IDs; it must not infer scope from whichever labels are present in the object.
- Preserve `exact`, `analogous`, and `scoped_reimplementation` as separate reproduction modes. Imported-label review, modern reference transfer, or a reduced cohort cannot be called exact annotation of a paper panel unless the same cohort, method, material parameters, label semantics, and expected output are used.
- Keep every mapped annotation target in the coverage record. Missing markers, references, cells, cohorts, or runtime capabilities produce an explicit conditional/block status, not a silent exclusion.
- Read and apply this Skill, then obtain a ready `bio_reproduction(action="validate_skill_compliance")` receipt before it can appear in `usedSkills`. Any generated annotation script also requires a ready `bio_reproduction(action="preflight_execution_scripts")` receipt before execution.
- Follow correctable `nextActions` only within their `maxAttempts`; when absent, allow at most two corrective retries after the initial call per action fingerprint. Stop on `stopWhenUnchanged`, unchanged validation/precondition fingerprints, or external blockers.

## OpenBioScience Adapter

- Use `research_evidence` for marker/reference source lookup, `bio_knowledge` for marker/atlas contract lookup, and an approved runner only when label-transfer execution is available.
- Register marker panels, reference datasets, model/package versions, label decisions, confidence, and caveats through `science_artifact`.
- Use official `environmentRef` values for execution routes.
- Do not treat automated annotation output as final without marker and context review.

## Scope

Use this skill for:

- Cluster-level or cell-level cell type annotation.
- Marker-based review.
- Reference mapping/label transfer.
- Ontology-aware label normalization.
- Confidence grading and ambiguous cluster handling.

Route elsewhere for:

- Marker calculation -> `bio-marker-optimization`.
- Batch/clustering problems -> `bio-batch-dim-cluster`.
- Figure generation -> `bio-scrna-plotting`.
- Biological interpretation -> `bio-result-interpretation`.

## Inputs

Required:

- clustered object path/artifact ID
- `cluster_key` or cell-level label target
- marker table or existing marker evidence
- `species`

Recommended:

- tissue/context
- reference dataset or atlas
- ontology preference
- confidence rubric
- selected `environmentRef`

## Annotation Modes

- `independent_annotation`: assign major and minor labels from de novo clusters, marker evidence, tissue context, and approved references. This is the default when a user asks for cell-type clustering, major classes, or subtypes.
- `reference_review`: preserve an imported label set and assess its marker consistency, ambiguity, and composition. This does not count as independent annotation.
- `label_transfer`: assign labels using a declared reference object, method, package version, and confidence output.

In `independent_annotation` mode, imported `Cell_type`, `Cell_subtype`, or equivalent labels must be hidden from assignment logic. They may be unmasked only after assignments are frozen, for a post hoc concordance/confusion analysis. Imported labels are evidence for comparison, not ground truth.

## Workflow

1. Verify marker evidence, cluster assignments, tissue, species, and sample context.
2. Choose and record the annotation mode: independent annotation, reference review, or label transfer.
3. Map markers/references to candidate labels and known lineage hierarchy.
4. Assign labels with confidence tiers and explicit ambiguity where evidence is weak.
5. Check labels against cluster composition, condition/batch distribution, and known biology.
6. Emit annotation tables and label decision notes.
7. Reconcile produced, ambiguous, blocked, and unassigned groups against every mapped target and cohort; report all dropped cells or labels with counts and reasons.
8. Register annotation provenance and caveats through `science_artifact`.

## Output Contract

Every annotation pass should produce:

- `reports/cell_annotation_summary.json`
- `tables/cluster_annotation.tsv`
- `tables/annotation_evidence.tsv`
- optional cell-level label table
- annotation diagnostic figures
- `logs/cell_annotation.log`

Summary schema:

```json
{
  "schema": "openbioscience.cell_annotation.summary.v1",
  "inputObject": "...",
  "clusterKey": "...",
  "annotationMode": "independent_annotation|reference_review|label_transfer",
  "labelKey": "...",
  "nAnnotatedGroups": 0,
  "ambiguousGroups": [],
  "warnings": []
}
```

## Gotchas

| Symptom                                              | Likely cause                              | Fix                                                            |
| ---------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| One cluster has incompatible lineage markers         | doublets, ambient RNA, or over-clustering | Mark ambiguous and revisit QC/cluster resolution               |
| Reference labels overfit tissue context              | atlas mismatch                            | Record reference limitations and prefer broader lineage labels |
| Rare population inferred from one marker             | insufficient evidence                     | Require multi-marker support or downgrade confidence           |
| Condition-specific activation mistaken for cell type | state/type conflation                     | Separate cell identity from cell state labels                  |

## Validation

- Annotation evidence includes positive and, when relevant, negative markers.
- `cluster_annotation.tsv` includes `cluster`, `major_label`, `minor_label`, marker evidence, source, confidence, and unresolved status columns.
- Independent annotation records when imported labels were unmasked and writes post hoc concordance separately from assignment evidence.
- Every mapped annotation target and cohort is represented as completed, ambiguous, conditional, blocked, or user-excluded; there are no silent target, cluster, cell, or cohort exclusions.
- Confidence and ambiguity are represented in tables, not only prose.
- Reference sources, versions, and species/tissue compatibility are recorded.
- Final labels can be joined back to the clustered object.
- Biological subtype labels are not expanded into algorithm names without explicit evidence. In particular, paper labels such as `MF1`, `MF2`, `MF3`, and `MF4` remain myofibroblast phenotype labels and do not imply non-negative matrix factorization (`NMF`).

## Next

- Need UMAP/marker/annotation figures -> `bio-scrna-plotting`.
- Need claim-level discussion -> `bio-result-interpretation`.
- Weak markers or unstable labels -> revisit `bio-marker-optimization` or clustering.
