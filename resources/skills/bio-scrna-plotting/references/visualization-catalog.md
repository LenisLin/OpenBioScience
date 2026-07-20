# scRNA-seq Visualization Catalog

Use visualization goals as the public interface. Package names are implementation
details selected by recipe.

| Goal | Stable recipes | Advanced recipes | Experimental recipes |
| --- | --- | --- | --- |
| `embedding` | `scp_embedding_stat_inset`, `scrnatoolvis_corner_axes` | `plot1cell_circular` | velocity/PAGA overlays when upstream results exist |
| `expression` | `scp_group_heatmap`, `scrnatoolvis_annotated_dotplot`, `scrnatoolvis_average_heatmap` | trajectory dynamic heatmaps | none |
| `composition` | `scpubr_waffle`, `scpubr_alluvial` | stacked/grouped bar fallback | none |
| `differential` | `scpubr_volcano`, `scrnatoolvis_marker_volcano` | coefficient/MA plots | none |
| `trajectory` | none | `scp_lineage`, `scp_dynamic_heatmap` | none |
| `communication` | none | none | `scpubr_ligand_receptor` from precomputed LIANA-like results |
| `cnv` | none | none | `scpubr_cnv_heatmap` from precomputed inferCNV results |

Default route:

1. Identify goal.
2. Inspect source object/table availability.
3. Select an MVP recipe when possible.
4. Validate recipe fields through `bio_plot.validate_plot_spec`.
5. Produce a render plan and figure bundle manifest before drawing.
