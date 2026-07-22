# Workflow Recipes

## ProteinGym Single-Variant Structure Mapping

1. Resolve the assay table, reference FASTA, and experimental PDB. Record source URLs, retrieval dates, versions, license notes, and SHA-256 values.
2. Identify the mutation and assay-score columns. Keep only substitutions with exactly one wild-type residue, integer sequence position, and mutant residue.
3. Run `normalize`. Review `normalization_status` and `normalization_reason`; never drop rejected rows silently.
4. Run `build-map` for the selected PDB chain. Review alignment identity, coverage, unresolved positions, and structure residue identity.
5. Run `map-residues`. A row is usable for structure analysis only when `mapping_status=mapped` and the reference, mutation, and structure wild-type residues agree.
6. Add structural features using the approved structure environment: SASA, secondary structure, distance to a declared ligand or functional site, and interface/contact state when relevant.
7. Aggregate per site only after preserving the per-substitution table. State the aggregation rule, such as maximum deleterious effect or median score.
8. Use typed PyMOL operations to color the registered residue score table. Export an image and session or command log.
9. Run `manifest` and write a bounded report. Use phrases such as "associated with proximity" rather than "caused by" unless independent evidence supports mechanism.

Suggested command sequence:

```powershell
python scripts/variant_benchmark.py normalize --input assay.csv --mutation-column mutant --output tables/normalized_variants.csv
python scripts/variant_benchmark.py build-map --fasta reference.fasta --pdb structure.pdb --chain A --output tables/residue_map.csv
python scripts/variant_benchmark.py map-residues --variants tables/normalized_variants.csv --mapping tables/residue_map.csv --output tables/structure_variant_map.csv
```

## SKEMPI Blind Interface ddG Benchmark

1. Resolve the source table and choose a non-ambiguous mutation column, target ddG column, row identifier, and complex/structure fields.
2. Normalize mutation notation. For multi-substitution records, either declare a separate task or reject them from a single-substitution benchmark.
3. Run `blind` in a controlled preparation step. Use `--truth-output` to place `sealed_truth.csv` in an evaluator-only location when the prediction agent and evaluator share a workspace.
4. Give the prediction process only `blind_features.csv`, structures, and declared external resources. Do not expose the source table, truth file, or target-derived features.
5. Produce exactly one finite prediction per required row ID. Record score direction, units, model/checkpoint, parameters, seed, and failures.
6. Run `freeze`. Keep `freeze_receipt.json` beside immutable predictions.
7. Run `reveal`; it verifies the blind and frozen artifacts before joining truth.
8. Run `metrics`. Report rank and error metrics only when score direction and units are compatible. Always report coverage and exclusions.
9. Inspect error cases by structural class after metrics are frozen. Post hoc interpretation must not be presented as a preregistered predictor.

Suggested command sequence:

```powershell
python scripts/variant_benchmark.py blind --input skempi.csv --row-id-column row_id --mutation-column mutation --target-column ddg --output-dir blind --truth-output evaluator/sealed_truth.csv
python model.py --input blind/blind_features.csv --output predictions.csv
python scripts/variant_benchmark.py freeze --predictions predictions.csv --blind-receipt blind/blind_receipt.json --row-id-column row_id --prediction-column prediction --output-dir predictions
python scripts/variant_benchmark.py reveal --blind-receipt blind/blind_receipt.json --freeze-receipt predictions/freeze_receipt.json --truth evaluator/sealed_truth.csv --predictions predictions/frozen_predictions.csv --output evaluation/revealed_results.csv
python scripts/variant_benchmark.py metrics --input evaluation/revealed_results.csv --target-column target --prediction-column prediction --output evaluation/metrics.json
```

## Stop Conditions

- Stop if chain roles, score direction, ddG convention, units, or wild-type sequence cannot be established.
- Stop and invalidate the blind run if any receipt hash fails.
- Continue with mapping-only outputs when PyMOL is unavailable; report rendering as blocked rather than inventing an image.
- Do not nominate improved binders or therapeutic candidates from this benchmark unless the user starts a separately governed prospective-design task.
