# OpenBioScience Bio Feature Batches - 2026-07-22

## SemVer Decision

Target version: `0.2.0`.

Rationale: the local change set adds backwards-compatible user-facing capabilities across structure viewing, PyMOL-backed MCP tooling, benchmark control contracts, scientific skills, official environments, and reproducible demo cases. This is a minor feature release from `0.1.2`, not a patch-only bug fix and not a breaking `1.0.0` change.

## Feature Scope

### Structure and PyMOL Session Support

- Adds shared PyMOL session state and command DTOs under the common platform type layer.
- Adds a renderer-side synchronized structure viewer path that can mirror background, representation, selection, camera, and server-rendered PyMOL images.
- Adds a built-in `openscience-pymol` MCP server with typed tools for session control, loading, display, selection, alignment, measurement, metrics, residue-table overlays, triage, rendering, export, and audited custom PyMOL execution.
- Packages the PyMOL worker script and standalone MCP bundle for desktop and WebUI startup paths.

### Benchmark Control Plane

- Adds a `benchmark` Bio MCP profile with a blind/freeze/reveal/evaluate state model.
- Adds strict benchmark schemas for plans, provenance, frozen inputs, prediction freezes, reveals, metric records, and state transitions.
- Registers protein variant mapping, interface ddG, sequence recovery, single-cell VDJ, and spatial transcriptomics workflow catalog entries.

### Official Environments and Skill Surface

- Adds three official environment manifests:
  - `bio-py-structure-benchmark`
  - `sc-py-immune-repertoire`
  - `sc-py-spatial`
- Adds first-party skills for protein design benchmarks, protein variant benchmarks, single-cell VDJ, spatial transcriptomics, PyMOL, and structure triage.
- Syncs first-party OpenBioScience skills into desktop and WebUI builtin skill directories through a shared sync helper.

### Demo and Reproduction Evidence

- Replaces older human/mouse demo naming with numbered reproduction/exploration demo case directories.
- Adds GB1 sequence recovery, BLCA open exploration, ICI paper reproduction, and CRC paper reproduction notes and artifacts where appropriate.
- Excludes runtime caches, dependency folders, model checkpoint caches, and database backups from source commits.

## Commit Batches

1. `chore(release): bump OpenBioScience to 0.2.0`
   - `package.json`
   - `CHANGELOG.md`
   - `tmp/90-decisions-and-status/2026-07-22-openbioscience-bio-feature-batches.md`
   - local ignore hygiene for `NUL`, Python bytecode, and tmp runtime backups

2. `feat(pymol): add synchronized structure analysis MCP`
   - PyMOL state contracts, bridge wrappers, viewer synchronization, MCP server, worker packaging, i18n, and registration tests

3. `feat(bio): add benchmark control plane and environments`
   - Bio MCP benchmark profile, schemas, actions, official environment manifests, catalog wiring, and tests

4. `feat(skills): add OpenBioScience benchmark and structure skills`
   - First-party skill packs and shared desktop/WebUI skill synchronization

5. `docs(demo): add reproducible bio demo cases`
   - Numbered demo case README/PDF/example benchmark artifacts, excluding generated caches and installed dependencies

## Not Committed

- `NUL`
- `tmp/90-decisions-and-status/runtime-backups/`
- ad-hoc tmp repair/import scripts and restored runtime transcript JSON
- demo `.cache`, `.openbioscience`, `.openscience`, `node_modules`, tool checkouts, and model checkpoints
- Windows checkout artifacts that make tracked Unix symlinks appear deleted under `resources/skills/vendor/deepscientist-1.6.0/src/ui/bin/`
