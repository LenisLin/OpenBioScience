---
name: bio-marker-optimization
description: >
  Use when scRNA-seq clusters, groups, conditions, or annotations need marker ranking, differential marker method selection, marker table cleanup, threshold tuning, pseudobulk-versus-cell-level decision support, or reproducibility checks before cell annotation or result interpretation. Route upstream clustering to bio-batch-dim-cluster and annotation to bio-cell-annotation.
---

# Bio Marker Optimization

## Reproduction Parameters

- Consume reported marker method, expression representation, thresholds, and multiple-testing procedure from the method contract.
- Keep descriptive cluster markers separate from condition-level DE even when the paper uses the same term.
- Record substitutions as scoped reimplementation rather than source parameters.

This skill defines how to produce auditable marker tables and threshold decisions for scRNA-seq workflows. It does not declare cell identities by itself.

## OpenBioScience Adapter

- Use `bio_runtime.validate_workflow` and `bio_knowledge.resolve_gene_set` for planning/evidence contracts; run marker calculations only through an approved runner in a selected `environmentRef` when available.
- Register marker methods, grouping variables, thresholds, tables, plots, logs, and caveats through `science_artifact`.
- Do not treat marker lists as ground truth; route identity assignment to `bio-cell-annotation`.
- Restrict this skill to descriptive cluster-marker evidence. Route biological condition comparisons to `bio-scrna-differential-expression` and `bio_statistics`.

## Scope

Use this skill for:

- Cluster marker ranking.
- Marker threshold tuning and table cleanup.
- Deciding whether a requested comparison must route to replicate-aware pseudobulk DE.
- Preparing marker evidence for annotation and plotting.

Route elsewhere for:

- Clustering -> `bio-batch-dim-cluster`.
- Cell type labeling -> `bio-cell-annotation`.
- Biological claim interpretation -> `bio-result-interpretation`.

## Inputs

Required:

- clustered object path/artifact ID
- `group_key`
- selected `environmentRef`

Recommended:

- `sample_key`
- `patient_key`
- `condition_key`
- marker method and thresholds
- reference marker panels
- `comparison_design`

## Workflow

1. Verify group labels, object lineage, and available replication keys.
2. Confirm the purpose is cluster identity or annotation review; route condition comparisons to `bio-scrna-differential-expression`.
3. Configure thresholds for expression fraction, log fold change/effect size, adjusted p-value, and minimum cells.
4. Run marker ranking and emit complete and filtered tables.
5. Check marker direction, duplicate genes, mitochondrial/ribosomal dominance, and sample imbalance.
6. Produce marker diagnostics for top genes and ambiguous groups.
7. Register artifacts and caveats through `science_artifact`.

## Output Contract

Every marker run should produce:

- `reports/marker_optimization_summary.json`
- `tables/markers_all.tsv`
- `tables/markers_filtered.tsv`
- `tables/marker_method_config.tsv` or equivalent config artifact
- marker diagnostic figures
- `logs/marker_optimization.log`

Summary schema:

```json
{
  "schema": "openbioscience.marker_optimization.summary.v1",
  "inputObject": "...",
  "environmentRef": "...",
  "groupKey": "...",
  "method": "...",
  "thresholds": {},
  "nGroups": 0,
  "warnings": []
}
```

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Top markers are mitochondrial/ribosomal | QC artifact or stressed cells | Flag and review QC/annotation before claims |
| Markers driven by one sample | sample imbalance | Report sample composition and avoid unsupported biological claims |
| Cell-level p-values are overconfident | pseudo-replication | Use sample-aware/pseudobulk design for condition claims |
| Marker panel conflicts | mixed subtypes or over-clustering | Route to annotation with ambiguity preserved |

## Validation

- Marker tables include group, gene ID/name, effect size, detection fraction, statistic, adjusted p-value when available, and method metadata.
- Marker source is explicitly the log-normalized expression layer, never scaled values or raw counts.
- Effect sizes are finite for at least 95% of rows; missing effect-size columns block downstream marker plots and annotation claims.
- Thresholds are saved and reproducible.
- Sample/patient replication limits are reported.
- Ambiguous or low-quality marker groups are not forced into labels.

## Next

- Marker evidence ready -> `bio-cell-annotation`.
- Marker figures needed -> `bio-scrna-plotting`.
- Condition/claim narrative needed -> `bio-result-interpretation`.
