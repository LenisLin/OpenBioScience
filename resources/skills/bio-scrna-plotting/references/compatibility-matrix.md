# Plot Backend Compatibility Matrix

| Backend | Used by | Export strategy |
| --- | --- | --- |
| `ggplot_patchwork` | SCpubr volcano/waffle/alluvial, SCP CellDimPlot/LineagePlot, scRNAtoolVis dotplot/corner axes | `ggsave` or patchwork-aware export |
| `complexheatmap_grid` | SCP GroupHeatmap/DynamicHeatmap and CNV heatmap-like outputs | open PNG/PDF/SVG device, draw grid object, close device |
| `circlize_device` | plot1cell circular layouts and ligand-receptor chord diagrams | export layer owns device lifecycle before drawing |

SCpubr is useful for stable API calls but is in maintenance mode. Pin package
versions in the plot manifest. Use adapters through public APIs; do not copy
package internals into OpenBioScience.
