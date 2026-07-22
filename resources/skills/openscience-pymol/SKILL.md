---
name: openscience-pymol
description: Control the OpenBioScience headless PyMOL session for protein or molecular structure files. Use for PDB/mmCIF loading, selections, representations, coloring, structural alignment, distance measurements, interactive remote viewer state, high-fidelity rendering, session export, or a user-requested custom PyMOL Python operation.
---

# OpenScience PyMOL

Use the `openscience-pymol` MCP as the authoritative structure session. Keep the remote 3D viewer synchronized by using the typed tools whenever they cover the operation.

## Workflow

1. Call `pymol_session` with `status` before the first operation. If PyMOL is unavailable, report the preflight error and continue with the native structure viewer when possible.
2. Load only user-authorized structure files with `pymol_load`. Preserve meaningful object names.
3. Prefer `pymol_display`, `pymol_select`, `pymol_align`, `pymol_measure`, and `pymol_apply_residue_table` over arbitrary code so the UI can reproduce state interactively.
4. Use `pymol_metrics` for confidence data and `pymol_apply_residue_table` for score/color tables that preserve chain, residue ID, and insertion code.
5. Use `pymol_render` only when the user requests a rendered image or when PyMOL-only state needs a fidelity view.
6. Export durable results with `pymol_export`, then register coordinate files, images, logs, and session bundles through the Science Artifact MCP.

## Arbitrary Python

Use `pymol_run` only when a requested operation cannot be expressed by a typed tool. It executes arbitrary Python on the server with `cmd` bound to `pymol.cmd` and is not a sandbox.

- Keep code scoped to the requested structure task.
- Never read credentials, unrelated projects, or user data.
- State that the operation is audited.
- After the call, rely on the server render for PyMOL-only CGO, volume, plugin, or custom setting state.

## Interpretation Boundaries

- Rendering or visual proximity does not establish biological function or interaction.
- Report RMSD together with aligned atom count and alignment selections.
- Treat pLDDT, pTM, ipTM, and PAE as model confidence evidence, not experimental validation.
- Preserve chain IDs, residue IDs, and insertion codes in selections and reports.
