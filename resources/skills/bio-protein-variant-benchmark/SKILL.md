---
name: bio-protein-variant-benchmark
description: Run auditable protein variant benchmarks that map ProteinGym-style single substitutions onto a PDB structure or evaluate SKEMPI-style interface ddG predictions with blind, freeze, reveal, and metric stages. Use for mutation normalization, sequence-to-structure residue mapping, structure score tables, leakage-safe mutation-effect ranking, interface benchmark reports, and reproducible benchmark manifests. Do not use for prospective therapeutic design or claims of improved affinity, stability, or function.
---

# Bio Protein Variant Benchmark

Build reproducible, bounded benchmarks for public protein mutation data. Keep source localization, prediction, reveal, structural rendering, and interpretation as separate auditable stages.

## Route The Task

- Use the **single-variant structure mapping** workflow for ProteinGym-like tables and a reference PDB.
- Use the **blind interface ddG** workflow for SKEMPI-like mutation records with experimental targets.
- Read [references/workflows.md](references/workflows.md) before execution.
- Read [references/contracts.md](references/contracts.md) when producing or validating tables and receipts.

## Required Boundaries

1. Localize source data with its source URL, version or retrieval date, license note, and SHA-256. Do not silently redistribute data with unclear terms.
2. Restrict the first ProteinGym pass to single amino-acid substitutions. Preserve rejected and unmapped rows with reasons.
3. Preserve chain IDs, author residue numbers, and insertion codes. Never infer a mapping from residue number alone when chains or insertion codes are ambiguous.
4. For blind benchmarks, run `blind`, generate predictions from the blind table only, run `freeze`, and only then run `reveal`. Treat a failed hash check as benchmark invalidation.
5. Report coverage and exclusions before performance metrics. Do not call structural association a mechanism.
6. Register tables, receipts, figures, scripts, logs, and reports through the Science Artifact MCP when available.

## Executable Helper

Use `scripts/variant_benchmark.py` with Python 3.10+ and only the standard library:

```text
normalize     Normalize mutation strings and retain rejected rows.
build-map     Align a reference FASTA sequence to one PDB chain.
map-residues  Join normalized variants to an explicit residue map.
blind         Split features from experimental truth and issue a receipt.
freeze        Validate and hash model predictions before reveal.
reveal        Verify receipts and join frozen predictions to truth.
metrics       Compute coverage, MAE, RMSE, Pearson, Spearman, and sign accuracy.
manifest      Hash inputs and outputs into a report manifest.
self-test     Exercise success and failure paths in a temporary directory.
```

Run `python scripts/variant_benchmark.py <command> --help` for arguments. The helper does not download data, install packages, score structures, or invoke a model.

## Structure Tooling

- Use Biopython or the helper's `build-map` for residue alignment and mapping.
- Use typed OpenScience PyMOL tools for selections, residue-score coloring, distances, rendering, and export. Prefer `pymol_apply_residue_table` over arbitrary `pymol_run` code.
- Compute SASA, secondary structure, interface contacts, or ligand distances in the approved structure environment and append them by canonical residue key.
- Register the exact score table used for coloring; a rendered image is not sufficient provenance.

## Output Contract

Produce, as applicable:

- `tables/normalized_variants.csv`
- `tables/residue_map.csv`
- `tables/structure_variant_map.csv`
- `blind/blind_features.csv` and `blind/blind_receipt.json`
- `blind/sealed_truth.csv`
- `predictions/frozen_predictions.csv` and `predictions/freeze_receipt.json`
- `evaluation/revealed_results.csv` and `evaluation/metrics.json`
- `reports/benchmark_manifest.json`
- a concise report separating observations, model performance, mapping limits, and unsupported claims

## Completion Checks

- Every input row is mapped, rejected, or explicitly unresolved.
- Wild-type residue identity is checked against both reference sequence and structure where available.
- Blind features contain neither the target column nor aliases copied from it.
- Input, blind, truth, frozen prediction, and reveal hashes validate.
- Metrics include evaluated row count and missing/non-finite prediction count.
- Model/checkpoint, parameters, seed, environment, source versions, and exclusions appear in the manifest or report.
- No prospective biological or therapeutic claim is made from benchmark performance alone.
