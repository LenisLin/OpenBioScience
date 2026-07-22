---
name: bio-protein-design-benchmark
description: Benchmark ProteinMPNN backbone-conditioned sequence designs with native sequence recovery, sequence diversity, ESM-family sequence scores supplied by an external run, and ESMFold/other predicted-structure self-consistency metrics. Use when evaluating inverse-folding runs, comparing checkpoints or seeds, validating a fixed-position design protocol, or preparing a reproducible GB1-like sequence-recovery report. Do not use it to claim improved stability, expression, binding, activity, safety, or experimental performance.
---

# Protein Design Benchmark

Evaluate recorded model outputs without turning model agreement into biological performance claims.

## Required workflow

1. Read [references/benchmark-contract.md](references/benchmark-contract.md) before creating a run manifest. Read [references/metric-definitions.md](references/metric-definitions.md) before interpreting metrics.
2. Define the native sequence, backbone, designed and fixed positions, chain mapping, model revisions, checkpoints, parameters, and seeds before running models.
3. Use `cs-proteinmpnn` for actual sequence generation. Preserve its raw FASTA and command log. Never treat the first ProteinMPNN FASTA record as a design unless the run protocol explicitly says so.
4. Use an ESM skill only for explicitly recorded sequence likelihood or mutation scores. Do not compare scores from different model families or scoring definitions as if they shared a scale.
5. Use `cs-esmfold2` or another declared structure predictor for actual folding. Record every model revision and inference parameter. Use `openscience-structure-triage` to inspect confidence and uncertainty.
6. Validate the manifest before reporting:

   ```bash
   python scripts/validate_manifest.py run_manifest.json --check-files
   ```

7. Calculate deterministic sequence metrics from the native and design FASTA files:

   ```bash
   python scripts/compute_sequence_metrics.py \
     --manifest run_manifest.json \
     --output-json sequence_summary.json \
     --output-csv sequence_metrics.csv
   ```

8. Summarize externally generated structure metrics without rerunning a model:

   ```bash
   python scripts/summarize_structure_metrics.py \
     --input-csv structure_metrics.csv \
     --mode monomer \
     --output-json structure_summary.json \
     --output-csv selected_models.csv
   ```

9. Register raw inputs, commands, logs, manifests, metric tables, selected structures, failures, and limitations as Science artifacts when that control plane is available.

## Integrity rules

- Mark a model stage `completed` only after concrete output files exist. Record an immutable checkpoint or revision, parameters, seeds, and command log.
- Keep native recovery, language-model score, predictor confidence, and geometric agreement as separate evidence classes.
- Compare candidates under the same protocol. Label mixed checkpoints, templates, MSAs, recycles, sampling steps, or ranking rules as non-comparable.
- Report failed and missing predictions. Never select only successful candidates without a failure count.
- Rank monomers by the predeclared monomer metric. Rank complexes with interface evidence such as ipTM/PAE; do not use pLDDT alone.
- Use the phrases `model self-consistency` or `computational screening result`. Never claim stability, function, affinity, expression, or developability without corresponding experimental evidence.

## Required report

Include the benchmark question, input identifiers and checksums, designed-position policy, exact model revisions and seeds, candidate counts, failures, native recovery, diversity, supplied ESM score definition, structure self-consistency metrics, selection rule, and limitations. End with an explicit statement that the benchmark does not establish experimental performance.

