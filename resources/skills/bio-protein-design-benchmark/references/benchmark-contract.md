# Protein design benchmark contract

Use one JSON manifest per benchmark run. Paths are relative to the manifest unless absolute. Use sequence positions only with `indexing: "sequence_1_based"`; retain a separate residue map when PDB numbering differs.

## Minimal manifest

```json
{
  "schema_version": "1.0",
  "benchmark_id": "gb1-recovery-v1",
  "benchmark_kind": "backbone_sequence_recovery",
  "run": {
    "mode": "model_benchmark",
    "status": "completed",
    "started_at": "2026-07-20T01:00:00Z",
    "completed_at": "2026-07-20T02:00:00Z",
    "command_log": "logs/commands.txt",
    "environment": "environment-lock.yml"
  },
  "inputs": {
    "native_fasta": {"path": "native.fasta", "sha256": "..."},
    "backbone_structure": {
      "path": "1pga.cif",
      "sha256": "...",
      "chain_ids": ["A"]
    }
  },
  "design_protocol": {
    "indexing": "sequence_1_based",
    "design_positions": [5, 7, 9],
    "fixed_positions": [1, 2, 3, 4, 6, 8],
    "residue_map": "residue_map.csv"
  },
  "stages": {
    "proteinmpnn": {
      "status": "completed",
      "tool": "ProteinMPNN",
      "model_id": "v_48_020",
      "model_revision": "git commit or immutable archive hash",
      "checkpoint_sha256": "...",
      "seeds": [1, 2, 3],
      "parameters": {"sampling_temperature": [0.1]},
      "outputs": ["designs.fasta"]
    },
    "sequence_scoring": {
      "status": "completed",
      "tool": "ESMC",
      "model_id": "declared ESM-family model",
      "model_revision": "immutable model revision",
      "checkpoint_sha256": "...",
      "seeds": [1],
      "parameters": {
        "score_definition": "pseudo_log_likelihood",
        "score_direction": "higher_is_better"
      },
      "outputs": ["esm_scores.csv"]
    },
    "folding": {
      "status": "completed",
      "tool": "ESMFold2-Fast",
      "model_id": "biohub/ESMFold2-Fast",
      "model_revision": "immutable Hugging Face revision",
      "checkpoint_sha256": "...",
      "seeds": [1],
      "parameters": {"num_loops": 10, "num_sampling_steps": 68},
      "outputs": ["structure_metrics.csv"]
    }
  },
  "outputs": {
    "design_fasta": {"path": "designs.fasta", "sha256": "..."},
    "sequence_score_table": {"path": "esm_scores.csv", "sha256": "..."},
    "structure_metrics_table": {"path": "structure_metrics.csv", "sha256": "..."}
  }
}
```

## State rules

- `run.mode`: `model_benchmark` or `smoke_fixture`.
- `run.status`: `planned`, `running`, `completed`, or `failed`.
- Stage status: `not_run`, `planned`, `running`, `completed`, `failed`, or `skipped`.
- A completed `model_benchmark` requires completed `proteinmpnn`, `sequence_scoring`, and `folding` stages, concrete outputs, immutable model metadata, non-empty seeds, and command/environment records.
- A `smoke_fixture` may skip model stages only when each skipped stage gives a reason. It tests scripts, not model capability.
- Never change a completed manifest in place. Create a new benchmark ID or revision and retain the original.

## FASTA rules

- `native_fasta` contains exactly one record.
- `design_fasta` contains only candidate designs. If consuming raw ProteinMPNN output, explicitly use `--skip-first-record` when the first record is the native input.
- All candidate identifiers are unique and all sequences have native length.
- Allowed residues are the 20 standard amino acids plus `X`. Report `X` positions; do not score them as recovered unless both residues are `X`.

## Structure metrics table

Required columns: `candidate_id`, `model_id`, `status`. Supported numeric columns are `mean_plddt`, `ptm`, `iptm`, `pae_mean`, `aligned_ca_rmsd`, `tm_score`, and `coverage`. Use `status=completed` only for readable model outputs. Leave unavailable values empty rather than inventing defaults.
