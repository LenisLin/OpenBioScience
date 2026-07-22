---
name: openscience-structure-triage
description: Triage batches of predicted protein or complex structures with OpenBioScience PyMOL. Use for AlphaFold, OpenFold, Boltz, Chai, or similar PDB/mmCIF outputs when comparing pLDDT, pTM, ipTM, PAE, locating low-confidence residues, ranking candidates, or selecting models for further structural review.
---

# OpenScience Structure Triage

Use `pymol_triage` and `pymol_metrics` to review prediction confidence without turning confidence scores into biological claims.

## Workflow

1. Confirm the directory and model family, then call `pymol_triage` once for the batch.
2. Rank monomers primarily by mean pLDDT and relevant global confidence. Rank complexes using ipTM/PAE evidence as well; never rank complexes by pLDDT alone.
3. Inspect shortlisted models with `pymol_metrics`. Report low-confidence regions using returned chain, residue ID, and insertion code rather than array positions.
4. Use `pymol_display` with `colorBy=plddt` for the standard discrete confidence palette.
5. Use `pymol_apply_residue_table` when ranking or uncertainty annotations come from an external residue-level table.
6. Render only requested or decision-relevant models. Register the metrics table, selected structures, render, and limitations as Science Artifacts.

## Required Reporting

- State which score drove each ranking and identify missing metrics.
- Distinguish local confidence (pLDDT), global fold confidence (pTM), interface confidence (ipTM), and relative-position uncertainty (PAE).
- Flag low-confidence linkers, termini, disordered regions, chain interfaces, and domain orientation uncertainty separately.
- Treat thresholds as screening heuristics. Do not claim binding, mechanism, or experimental quality from prediction confidence alone.
- Recommend experimental validation or independent structural evidence for consequential conclusions.
