# Plot Input Contracts

## Object-Based Recipes

Required:

- project-relative `object_path`;
- object type (`rds`, `h5seurat`, `h5ad`, or table bundle);
- assay/layer used for expression;
- available reductions;
- available metadata columns;
- feature identifier namespace.

## Table-Based Recipes

Required:

- project-relative table path;
- required columns for the recipe;
- statistic semantics;
- filter state;
- row-level provenance.

## Common Failure Modes

| Failure | Response |
| --- | --- |
| metadata column absent | return `conditional` and ask for corrected mapping |
| reduction absent | route upstream to dimensionality workflow |
| feature absent | record unresolved features and continue only when enough features remain |
| category count too high | prefer bar/dot/heatmap over waffle, pie, or ring |
| object too large | enable rasterization or approved sampling with manifest entry |
