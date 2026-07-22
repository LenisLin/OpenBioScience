# GB1 Sequence Recovery Benchmark

This demo records the local ProteinMPNN-style GB1 sequence recovery benchmark used to exercise the OpenBioScience benchmark control plane and PyMOL structure triage path.

## Scope

- Benchmark family: backbone-conditioned protein sequence recovery.
- Representative structure: GB1 / `1PGA`.
- Runtime evidence: local benchmark outputs were generated under `benchmarks/gb1_1pga_proteinmpnn_8seq/`.
- Platform capabilities exercised:
  - `openscience-bio-benchmark` blind/freeze/reveal/evaluate state contracts.
  - `bio-protein-design-benchmark` sequence recovery reporting.
  - `openscience-pymol` and `openscience-structure-triage` confidence review.

## Repository Boundary

Only this README is intended to be versioned. Local model checkpoints, tool checkouts, `.openscience` artifacts, `.openbioscience` control files, and benchmark run outputs stay local because they are generated or environment-specific.

See `tmp/90-decisions-and-status/2026-07-22-openbioscience-bio-feature-batches.md` for the release batch context.
