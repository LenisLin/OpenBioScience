---
name: bio-cell-annotation
description: >
  Use when scRNA-seq clusters or cells need cell type annotation, marker-panel review, reference label transfer, ontology-aware naming, confidence grading, ambiguous-label handling, or annotation provenance for reproduction. Applies after marker optimization or when processed objects already contain clusters. Route plotting to bio-scrna-plotting and claim interpretation to bio-result-interpretation.
---

# Bio Cell Annotation

This skill assigns defensible cell labels from marker evidence, references, and metadata. It preserves uncertainty instead of forcing labels.

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

## Workflow

1. Verify marker evidence, cluster assignments, tissue, species, and sample context.
2. Choose annotation strategy: marker-only, reference transfer, hybrid, or review-only.
3. Map markers/references to candidate labels and known lineage hierarchy.
4. Assign labels with confidence tiers and explicit ambiguity where evidence is weak.
5. Check labels against cluster composition, condition/batch distribution, and known biology.
6. Emit annotation tables and label decision notes.
7. Register annotation provenance and caveats through `science_artifact`.

## Output Contract

Every annotation pass should produce:

- `reports/cell_annotation_summary.json`
- `tables/cluster_annotations.tsv`
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
  "strategy": "marker|reference_transfer|hybrid|review_only",
  "labelKey": "...",
  "nAnnotatedGroups": 0,
  "ambiguousGroups": [],
  "warnings": []
}
```

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| One cluster has incompatible lineage markers | doublets, ambient RNA, or over-clustering | Mark ambiguous and revisit QC/cluster resolution |
| Reference labels overfit tissue context | atlas mismatch | Record reference limitations and prefer broader lineage labels |
| Rare population inferred from one marker | insufficient evidence | Require multi-marker support or downgrade confidence |
| Condition-specific activation mistaken for cell type | state/type conflation | Separate cell identity from cell state labels |

## Validation

- Annotation evidence includes positive and, when relevant, negative markers.
- Confidence and ambiguity are represented in tables, not only prose.
- Reference sources, versions, and species/tissue compatibility are recorded.
- Final labels can be joined back to the clustered object.

## Next

- Need UMAP/marker/annotation figures -> `bio-scrna-plotting`.
- Need claim-level discussion -> `bio-result-interpretation`.
- Weak markers or unstable labels -> revisit `bio-marker-optimization` or clustering.
