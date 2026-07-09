# Official Environment Catalog

This file records the official environment catalog that backs the
current demo-driven OpenBioScience reproduction scope.

## Official Environment Set

| Environment | Primary role | Current phase |
| --- | --- | --- |
| `sc-r-singlecell` | R-side single-cell mainline analysis | active |
| `sc-py-singlecell` | Python-side single-cell IO and preprocessing | active |
| `sc-r-plot` | dedicated R scientific plotting stack | active |
| `sc-r-clinical` | survival / clinical biomarker downstream analysis | active |
| `sc-cci-r` | R-first interaction analysis | active |
| `sc-r-trajectory` | trajectory inference and pseudotime | active |
| `sc-r-tumor-cnv` | tumor CNV-focused analysis | active |
| `sc-network-grn-r` | R-first GRN and activity inference | active |
| `sc-r-cytof` | CyTOF analysis with local FCS inputs | planned |
| `sc-spatial-multiome` | spatial and multiome analysis | planned |
| `sc-legacy-repro` | legacy workflow reproduction pack | planned |

## Installed Official Prefixes

Current storage root:

```text
<OPENBIOSCIENCE_RUNTIME_ROOT>
```

Current official Conda prefix root:

```text
<OPENBIOSCIENCE_RUNTIME_ROOT>/envs
```

| Environment | Installed prefix | Current size | Current validation |
| --- | --- | --- | --- |
| `sc-py-singlecell` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/envs/sc-py-singlecell` | target server dependent | official probe pending on target server |
| `sc-r-singlecell` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/envs/sc-r-singlecell` | target server dependent | official probe pending on target server |
| `sc-r-plot` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/envs/sc-r-plot` | target server dependent | official probe pending on target server |
| `sc-r-clinical` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/envs/sc-r-clinical` | target server dependent | official probe pending on target server |
| `sc-cci-r` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/envs/sc-cci-r` | target server dependent | official probe pending on target server |
| `sc-r-trajectory` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/envs/sc-r-trajectory` | target server dependent | P1 probe pending |
| `sc-r-tumor-cnv` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/envs/sc-r-tumor-cnv` | target server dependent | P1 probe pending |
| `sc-network-grn-r` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/envs/sc-network-grn-r` | target server dependent | P1 probe pending |

Bootstrap metadata:

- Manifest: `environments/official/bootstrap/env-manifest.json`
- Install entrypoint: `environments/official/bootstrap/install-official-envs.sh`
- Storage note: `environments/official/bootstrap/storage-layout.md`

Naming decisions in this phase:

- `sc-py-singlecell` is the canonical Python single-cell environment name. The temporary CUDA/version suffix was removed after installation.
- `sc-r-trajectory` is the canonical trajectory environment name. The temporary R-version suffix was removed after installation.
- Old temporary prefixes under `/tmp/openbioscience-envs` should be removed after runtime-root migration.

## Cross-Environment Rules

1. `sc-py-singlecell` owns the Python base for AnnData/Scanpy object IO, QC,
   preprocessing, and neighborhood graph construction.
2. `sc-r-singlecell` owns the R base for Seurat/SingleCellExperiment object
   handling, QC, preprocessing, annotation, and zellkonverter handoff.
3. `sc-r-plot` owns plot annotation, color systems, composite figure assembly,
   and export devices for sibling analysis environments.
4. `sc-cci-r` owns the R-first interaction-analysis layer in this phase.
5. `sc-r-trajectory` owns the trajectory-inference layer in this phase.
6. `sc-network-grn-r` owns the R-first GRN layer in this phase.
7. `Seurat` and `SeuratObject` compatibility is reviewed as a matched pair.
8. Workflow-specific Seurat v4 or v5 pinning is recorded at the
   environment revision that owns that workflow.

## Current Execution Notes

1. The current core environment pass is conda-first and uses direct package
   resolution.
2. Specialized sibling environments carry secondary bootstrap scripts at the
   revision where package sources change.
3. The first pressure-test order is `human_CRC`, then `human_ICI`, then
   `mouse_SARC`.
4. The current installed prefixes are an operational substrate for server-side
   execution tests. They are not yet a complete Docker-wrapped runtime service.
