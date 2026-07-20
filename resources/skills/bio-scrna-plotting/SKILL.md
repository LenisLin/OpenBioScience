---
name: bio-scrna-plotting
description: >
  Use when scRNA-seq outputs need reproducible figures: QC plots, UMAP/t-SNE embeddings, cluster or annotation overlays, marker dot/violin/feature plots, composition barplots, heatmaps, or paper-style figure bundles. Applies after import, QC, clustering, markers, or annotation. Route final scientific claims to bio-result-interpretation.
---

# Bio scRNA-seq Plotting

## Reference Files

- `references/visualization-catalog.md`: read when choosing a plot objective or recipe.
- `references/input-contracts.md`: read when validating object/table fields.
- `references/compatibility-matrix.md`: read when selecting an export backend.
- `references/source-attribution.md`: read when writing figure provenance or manifest source fields.
- `schemas/`: use for plot spec, data source, and export spec shape.
- `recipes/`: compact MVP/advanced/experimental recipe lists.
- `presets/`: reusable style presets.

## Reproduction Parameters

- Consume reported expression transformation, centering, scaling, color limits, aggregation unit, and embedding method from the method contract.
- Record the actual expression layer and transformation in the executed parameter manifest.
- Visual similarity without aligned source parameters is not figure-level reproduction.

This skill defines figure contracts for scRNA-seq workflows. It prepares reproducible visual outputs and figure provenance; it does not fabricate data or interpret significance.

## OpenBioScience Adapter

- Use `bio_plot.list_plot_recipes`, `bio_plot.select_plot_recipe`, `bio_plot.validate_plot_spec`, target render actions, and `bio_plot.export_figure_bundle` for current plot contracts; legacy `list_plot_templates`, `validate_plot_inputs`, and `render_plan` remain compatible.
- Register source objects, plotting configs, code, figure files, thumbnails, and warnings through `science_artifact`.
- Use `ds-nature-figure`, `ds-figure-polish`, or scientific visualization skills only for presentation refinement after data-backed plots exist.
- Do not create paper-like panels without linking every panel to source tables/objects.
- Choose recipes by user visualization objective, not by the source R package. Treat SCpubr, SCP, scRNAtoolVis, and plot1cell as implementation backends behind recipe IDs.

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
2. Classify the plot request into one visualization objective: `embedding`, `expression`, `composition`, `differential`, `trajectory`, `communication`, or `cnv`.
3. Call `bio_plot.select_plot_recipe` with the objective, user intent, and available inputs.
4. Build a plot specification with recipe id, data source, mapping, style, export formats, and output root.
   Marker and expression plots must declare their expression layer; raw counts or scaled values cannot be presented as normalized expression.
5. Call `bio_plot.validate_plot_spec` and the matching target render action, such as `render_embedding`, `render_expression_matrix`, `render_composition`, `render_differential`, `render_trajectory`, `render_communication`, or `render_cnv`.
6. Generate figures through controlled runner with saved config and deterministic settings only when that runner is available.
7. Export publication-friendly and audit-friendly formats when feasible.
8. Validate readability, axis labels, legends, group ordering, and missing categories.
9. Register figures, configs, source artifact links, and warnings through `science_artifact`.

## Visualization Objectives And Recipes

| Objective | Primary use | MVP recipes | Later/experimental recipes |
| --- | --- | --- | --- |
| `embedding` | UMAP/t-SNE/PCA, density, statistic inset, corner axes | `scp_embedding_stat_inset`, `scrnatoolvis_corner_axes` | `plot1cell_circular` |
| `expression` | Marker/grouped expression heatmap or dotplot | `scp_group_heatmap`, `scrnatoolvis_annotated_dotplot`, `scrnatoolvis_average_heatmap` | dynamic trajectory heatmaps via `trajectory` |
| `composition` | Percentages and category flows | `scpubr_waffle`, `scpubr_alluvial` | stacked/grouped bar fallback when categories are numerous |
| `differential` | Volcano and marker volcano from precomputed statistics | `scpubr_volcano`, `scrnatoolvis_marker_volcano` | MA/coefficient plots through future recipes |
| `trajectory` | Lineage curves and pseudotime programs | none in MVP | `scp_lineage`, `scp_dynamic_heatmap` |
| `communication` | Ligand-receptor visual summaries | none in MVP | `scpubr_ligand_receptor` with precomputed LIANA-like results |
| `cnv` | inferCNV heatmaps | none in MVP | `scpubr_cnv_heatmap` with precomputed inferCNV outputs |

Target actions:

```text
embedding -> bio_plot.render_embedding
expression -> bio_plot.render_expression_matrix
composition -> bio_plot.render_composition
differential -> bio_plot.render_differential
trajectory -> bio_plot.render_trajectory
communication -> bio_plot.render_communication
cnv -> bio_plot.render_cnv
```

## Plot Specification

Use this shape before rendering:

```json
{
  "recipe": "scp_embedding_stat_inset",
  "input": {
    "object_path": "omics_analysis/<analysisId>/exploration/results/objects/exploration.rds",
    "reduction": "UMAP"
  },
  "mapping": {
    "group_by": "CellType",
    "stat_by": "Phase"
  },
  "style": {
    "preset": "journal-light",
    "stat_plot_type": "ring",
    "label": true,
    "rasterize": true
  },
  "export": {
    "formats": ["png", "pdf"],
    "width": 7,
    "height": 6,
    "dpi": 300
  }
}
```

The MCP validates recipe-required fields. It returns `executeNow: false` until an approved R adapter/runner is available.

## Plot Backends

| Backend | Recipes | Export rule |
| --- | --- | --- |
| `ggplot_patchwork` | volcano, waffle, alluvial, CellDimPlot, LineagePlot, jjDotPlot, corner axes | use ggplot/patchwork export logic |
| `complexheatmap_grid` | GroupHeatmap, DynamicHeatmap, AverageHeatmap-like grid outputs, CNV heatmap | open graphics device and call grid/ComplexHeatmap draw logic |
| `circlize_device` | plot1cell circular layouts and ligand-receptor chord diagrams | export layer owns device lifecycle before drawing |

## MVP Recipe Selection Rules

- Use `scpubr_volcano` only with a precomputed DE or marker table.
- Use `scpubr_waffle` when the categorical level count is small and percentages are the message.
- Use `scpubr_alluvial` when the question is category flow across two or more metadata columns.
- Use `scp_group_heatmap` for grouped marker/expression heatmaps with annotation tracks or clustering.
- Use `scrnatoolvis_annotated_dotplot` when marker categories, group order, or gene/group trees matter.
- Use `scp_embedding_stat_inset` when the user asks for UMAP/t-SNE with density, highlight, hexbin, or cluster-level pie/ring/bar composition.
- Use `scrnatoolvis_corner_axes` for presentation-style embeddings with short corner axes or faceted feature embeddings.

## Advanced And Experimental Boundaries

- `scp_lineage` and `scp_dynamic_heatmap` require precomputed trajectory/pseudotime results.
- `scpubr_ligand_receptor` accepts precomputed LIANA-like interaction tables; it does not run communication inference.
- `scpubr_cnv_heatmap` accepts precomputed inferCNV outputs and chromosome position tables; it does not run inferCNV.
- `plot1cell_circular` must not call `Install.example()`; use user-provided final objects or precomputed circular data only.

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

Plot manifest fields must include: input object summary, recipe, actual R function, complete parameters, package versions, R version, seed, warnings, output files, whether data was sampled, and whether input data was modified.

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
