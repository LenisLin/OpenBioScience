# OpenBioScience Official Environments

This directory defines the current conda-first environment blueprints for
OpenBioScience.

The current core environment set is:

- `sc-py-singlecell`: Python base for AnnData/Scanpy object IO, QC,
  preprocessing, and neighborhood graph construction.
- `sc-r-singlecell`: R base for Seurat/SingleCellExperiment object handling,
  QC, preprocessing, annotation, and R/Python handoff.
- `sc-r-plot`: dedicated R plotting and rendering stack for figure production.

The active extended environment catalog is:

- `sc-r-clinical`
- `sc-cci-r`
- `sc-r-trajectory`
- `sc-r-tumor-cnv`
- `sc-network-grn-r`

The planned follow-on environment set is:

- `sc-r-cytof`
- `sc-spatial-multiome`
- `sc-legacy-repro`

## Recommended Storage Root

The current deployment target for heavyweight OpenBioScience environments is:

- `/mnt/NAS_21T/ProjectData/OpenBioScience`

The storage layout and migration policy live in:

- `bootstrap/storage-layout.md`
- `bootstrap/env-manifest.json`

## Installation Policy

1. Keep each environment aligned to a single primary responsibility.
2. Install core packages directly from `conda-forge` and `bioconda`.
3. Record package-level source decisions in `bootstrap/core-envs.md`.
4. Keep `Seurat` and `SeuratObject` on the same major train.
5. Document sibling-environment responsibilities directly in the YAML comments.

## Current Core Pass

The current core pass is conda-first. `bootstrap/core-envs.md` records the
package-level source audit for the three core environments.

The matching planning notes live under
`tmp/10-development-directions/environment/`.

## Installation Entry Point

The canonical install entry point for official environments is:

- `bootstrap/install-official-envs.sh`

This script installs environments directly into the NAS-backed official root
and uses the shared package cache under `/mnt/NAS_21T/ProjectData/OpenBioScience/cache/`.
