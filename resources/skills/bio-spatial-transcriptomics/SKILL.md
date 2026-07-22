---
name: bio-spatial-transcriptomics
description: Run a reproducible baseline for localized 10x Visium or Squidpy-registered spatial transcriptomics data. Use for Space Ranger bundle intake, image-coordinate alignment validation, spot QC, spatial clustering, descriptive marker analysis, spatial neighbor graphs, Moran's I with multiple-testing correction, spatial figures, and canonical OpenBioScience output manifests. Use after paper-level scope planning for reproduction tasks or directly after intake for local/public baseline analysis.
---

# Bio Spatial Transcriptomics

Run this skill as the spatial leaf workflow after `openscience-singlecell` routing. Treat it as a runbook; execute analysis through approved Python scripts in `environmentRef: sc-py-spatial`.

## Required routing

1. For paper reproduction, start with `bio-omics-reproduction-planning`, then route the scoped spatial module here. For local or public baseline analysis without a paper target, start with `bio-omics-analysis`.
2. Localize public data with `bio-data-resolution` and `bio_source`. Accept either a complete 10x Space Ranger bundle or an explicitly versioned Squidpy registry object. Do not download from analysis scripts.
3. Resolve and probe `sc-py-spatial` with `bio-environment-routing` and `bio_runtime`. Do not install packages during a run.
4. Author readable scripts with `bio-analysis-script-authoring`; register inputs, outputs, receipts, logs, and limitations with `science_artifact`.

Read [references/contracts.md](references/contracts.md) before authoring or reviewing a run package. It defines source manifests, validation gates, workflow modules, and canonical outputs.

## Baseline workflow

1. **Validate localization.** Run `scripts/validate_contract.py input <manifest>` before loading data. Record source URL/accession, source kind, release/version, checksums, and localized paths. Reject mixed samples or silently substituted files.
2. **Import without changing semantics.** Prefer `spatialdata-io` for a complete Space Ranger directory and use Scanpy/Squidpy for a registered AnnData object. Preserve raw counts when available; record the active matrix and gene identifier namespace.
3. **Validate image-coordinate alignment.** Verify unique expression and position barcodes, barcode overlap, finite coordinates, `in_tissue`, full-resolution pixel bounds, image dimensions, scale-factor keys, and spot-diameter plausibility. Write an alignment overlay. If the image is unavailable, continue only as coordinate-only and mark image-dependent claims blocked.
4. **Run spot QC.** Report counts, detected genes, mitochondrial fraction, tissue status, and filtering reason per spot. Select thresholds from the observed distributions or a declared preset; write thresholds before filtering. Never silently discard spots.
5. **Normalize and cluster.** Keep raw counts in a layer, normalize/log-transform for baseline clustering, select variable genes, compute PCA, a transcriptomic neighbor graph, UMAP, and Leiden clusters with fixed seeds. Spatial coordinates must not enter clustering unless explicitly declared as a separate method.
6. **Rank descriptive markers.** Rank cluster markers on the declared analysis matrix, report effect size, test, raw p-value, Benjamini-Hochberg q-value, detection fractions, and cluster. Describe these as spot-cluster markers, not cell-type truth.
7. **Build the spatial graph.** Use array-grid neighbors for Visium when grid coordinates are valid; otherwise use an explicitly parameterized generic-coordinate graph. Record graph type, library/sample key, radius or ring count, connectivity summary, and disconnected spots.
8. **Compute Moran's I.** Predeclare tested genes or a reproducible selection rule. Report statistic, expected value when available, p-value, BH q-value, permutation count/method, graph identifier, and tested-feature count. Never rank significance using uncorrected p-values alone.
9. **Render and report.** Produce alignment, QC, cluster, marker, and Moran figures with matching coordinate orientation. State descriptive versus inferential boundaries and any blocked image-dependent claims.
10. **Validate completion.** Run `scripts/validate_contract.py output <results/output_manifest.json>` and register the validated manifest through the controlling analysis/reproduction MCP.

## Stop conditions

- Block the run if expression barcodes cannot be reconciled with positions or if coordinate values are invalid.
- Block image-dependent interpretation if image dimensions, scale factors, or an alignment overlay cannot be validated.
- Do not label computed clusters as anatomical regions without external annotation evidence.
- Do not interpret spot-level tests as sample-level biological replication.
- Do not combine libraries in one spatial graph unless library-aware construction is explicit.
- Keep segmentation, cell-type deconvolution, image feature learning, condition DE, and atlas transfer outside this baseline unless separately planned.

## Validation commands

```powershell
& <python> resources/skills/bio-spatial-transcriptomics/scripts/smoke_test.py
& <python> resources/skills/bio-spatial-transcriptomics/scripts/validate_contract.py input <input_manifest.json>
& <python> resources/skills/bio-spatial-transcriptomics/scripts/validate_contract.py output <output_manifest.json>
```

## Completion contract

Complete only when localization and environment receipts are recorded, image-coordinate status is explicit, every spot has a QC disposition, marker and Moran tables contain BH-adjusted q-values, outputs stay under the canonical run root, warnings and session versions are present, and the output manifest validates.
