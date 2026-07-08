---
name: bio-scrna-plotting
description: >
  Use when scRNA-seq outputs need reproducible figures: QC plots, UMAP/t-SNE embeddings, cluster or annotation overlays, marker dot/violin/feature plots, composition barplots, heatmaps, or paper-style figure bundles. Applies after import, QC, clustering, markers, or annotation. Route final scientific claims to bio-result-interpretation.
---

# Bio scRNA-seq Plotting

This skill defines figure contracts for scRNA-seq workflows. It prepares reproducible visual outputs and figure provenance; it does not fabricate data or interpret significance.

## OpenBioScience Adapter

- Use `bio_plot.list_plot_templates`, `bio_plot.validate_plot_inputs`, and `bio_plot.render_plan` for current plot contracts; generate figures only through an approved runner in an official `environmentRef` when available.
- Register source objects, plotting configs, code, figure files, thumbnails, and warnings through `science_artifact`.
- Use `ds-nature-figure`, `ds-figure-polish`, or scientific visualization skills only for presentation refinement after data-backed plots exist.
- Do not create paper-like panels without linking every panel to source tables/objects.

## Scope

Use this skill for:

- QC distributions and retention plots.
- Embedding overlays by cluster, sample, batch, condition, or annotation.
- Marker feature, violin, dot, ridge, and heatmap plots.
- Composition plots by sample/group.
- Reproduction figure bundles and panel manifests.

Route elsewhere for:

- Missing upstream outputs -> the relevant import/QC/clustering/marker/annotation skill.
- Biological conclusion writing -> `bio-result-interpretation`.

## Inputs

Required:

- source object or table artifact ID
- plot objective
- `environmentRef`

Recommended:

- `color_keys`
- `gene_list`
- `group_key`
- `facet_key`
- figure size/style constraints
- output format requirements

## Workflow

1. Verify every requested panel has a source object/table and required keys.
2. Build a plot manifest with panel IDs, data sources, variables, transformations, and output paths.
3. Generate figures through controlled runner with saved config and deterministic settings only when that runner is available.
4. Export publication-friendly and audit-friendly formats when feasible.
5. Validate readability, axis labels, legends, group ordering, and missing categories.
6. Register figures, configs, source artifact links, and warnings through `science_artifact`.

## Output Contract

Every plotting run should produce:

- `reports/plotting_summary.json`
- `tables/figure_panel_manifest.tsv`
- figure files such as `.png`, `.pdf`, or `.svg`
- plotting config/code artifact
- `logs/scrna_plotting.log`

Summary schema:

```json
{
  "schema": "openbioscience.scrna_plotting.summary.v1",
  "environmentRef": "...",
  "panels": [],
  "sourceArtifacts": [],
  "figureFiles": [],
  "warnings": []
}
```

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Gene missing from plot | gene ID/symbol mismatch | Use mapping table and report unresolved genes |
| Empty category in legend | stale categorical levels | Drop or report unused categories before plotting |
| UMAP color suggests condition effect | visual confounding | Route interpretation to claim audit; include sample/batch overlays |
| Figure has no source manifest | provenance gap | Block publication-style claim until panel manifest exists |

## Validation

- Each panel references a concrete source artifact and variable.
- Output files exist and are registered with plotting config and logs.
- Legends and group labels match metadata categories.
- Missing genes, filtered cells, and transformations are recorded.

## Next

- Figures ready for scientific narrative -> `bio-result-interpretation`.
- Need style polishing only after provenance exists -> figure polishing skills.
- Missing markers/labels -> `bio-marker-optimization` or `bio-cell-annotation`.
