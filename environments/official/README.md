# OpenBioScience Official Environments

This directory contains version-controlled Conda environment specifications,
not installed Conda prefixes. The available catalog covers Python single-cell
processing and R single-cell, plotting, clinical, CCI, trajectory, CNV, and
GRN workflows.

Build a local runtime under an explicit root:

```bash
environments/official/bootstrap/install-official-envs.sh \
  --root ./runtime \
  sc-py-singlecell
```

For Docker deployment, use the checksum-verified Hugging Face release flow
described in [the distribution guide](../../docs/environments/huggingface-distribution.md).
The release artifacts are relocatable per-environment archives; raw local
environment trees, custom environments, matrices, and metadata are not
published.
