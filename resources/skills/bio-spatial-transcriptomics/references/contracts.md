# Spatial Baseline Contracts

## Input manifest

Use schema `openbioscience.spatial_input.v1`:

```json
{
  "schema": "openbioscience.spatial_input.v1",
  "datasetId": "visium-example",
  "source": {
    "kind": "tenx_visium|squidpy_registry",
    "uri": "https://...",
    "version": "release-or-registry-version",
    "localized": true,
    "checksumAlgorithm": "sha256"
  },
  "sampleId": "sample-a",
  "files": {
    "expression": {"path": "input/filtered_feature_bc_matrix.h5", "sha256": "..."},
    "positions": {"path": "input/spatial/tissue_positions.csv", "sha256": "..."},
    "scalefactors": {"path": "input/spatial/scalefactors_json.json", "sha256": "..."},
    "image": {"path": "input/spatial/tissue_hires_image.png", "sha256": "..."}
  },
  "matrixSemantics": "raw_counts|processed_expression|unknown",
  "species": "Mus musculus"
}
```

For `tenx_visium`, require expression, positions, scalefactors, and image entries. For `squidpy_registry`, expression may be a localized `.h5ad` or `.zarr`; positions/scalefactors/image may be embedded and must use `{ "embedded": true }`. Every path must be relative and every external file must carry a 64-character SHA-256. Record `matrixSemantics: unknown` when not proven.

## Coordinate gate

Write `results/tables/coordinate_validation.tsv` with checks for barcode uniqueness, overlap fraction, finite coordinates, pixel bounds, image dimensions, scale factors, spot diameter, and overlay review. Each row must include `check_id`, `status`, `observed`, `expected`, and `message`.

Require all expression barcodes to receive a declared status. A partial barcode match is allowed only when the excluded barcodes and source reason are written to `spot_filter_status.tsv`. Never infer a coordinate transform from appearance alone. Preserve the source orientation and record any explicit transform.

## Workflow modules

Declare these entries in `scripts/script_manifest.json.workflowModules`:

| Module ID | Required state | Principal outputs |
| --- | --- | --- |
| `spatial_source_localization` | completed | input manifest and source receipt |
| `spatial_input_validation` | completed or blocked | inventory, coordinate checks, alignment overlay |
| `spatial_spot_qc` | completed or blocked | QC metrics, thresholds, filter status |
| `spatial_cluster_marker` | completed or blocked | object, clusters, markers |
| `spatial_neighborhood` | completed or blocked | graph parameters and summary |
| `spatial_morans_i` | completed, blocked, or not_applicable | Moran table and plot source data |
| `spatial_figure_set` | completed or blocked | canonical figures |
| `spatial_report_package` | completed | report, warnings, session info, output manifest |

Each module records `skillIds`, `mcpTools`, `environmentRef`, environment probe receipt, implementation files, outputs, and a concrete reason for any non-completed state.

## Canonical outputs

Place outputs below the controlling `omics_analysis/<analysisId>/<stage-or-episode>/` or `case_reproduction/execution/<moduleId>/` root:

```text
scripts/script_manifest.json
results/objects/spatial_baseline.h5ad
results/tables/input_inventory.tsv
results/tables/coordinate_validation.tsv
results/tables/qc_metrics.tsv
results/tables/qc_thresholds.json
results/tables/spot_filter_status.tsv
results/tables/spatial_coordinates.tsv
results/tables/cluster_assignments.tsv
results/tables/cluster_markers.tsv
results/tables/spatial_neighbors_summary.tsv
results/tables/morans_i.tsv
results/figures/alignment_overlay.png
results/figures/qc_spatial.png
results/figures/spatial_clusters.png
results/figures/marker_spatial.png
results/figures/morans_i_spatial.png
results/output_manifest.json
reports/analysis_report.md
logs/session_info.json
logs/warnings.tsv
```

An image-less coordinate-only run may omit image-dependent figures only when the manifest warning and module blocker name each omitted output.

## Output manifest

Use `openbioscience.analysis_script.outputs.v2` for `omics_analysis`; reproduction modules may retain v1 only when required by the controlling reproduction contract. Spatial v2 manifests add `modality: spatial_transcriptomics`, `sourceKind`, `coordinateValidation`, `matrixSemantics`, `workflowModules`, and `statistics`.

`coordinateValidation` includes `status`, `barcodeMatchFraction`, `imageAvailable`, `pixelBoundsPassed`, and `overlayPath`. `statistics` includes `markerMultipleTesting: benjamini-hochberg`, `moranMultipleTesting: benjamini-hochberg`, and `moranTestedFeatures`. Output paths must be relative and remain below the run root.
