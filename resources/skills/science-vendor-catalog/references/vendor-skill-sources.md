# Vendored Science Skill Sources

OpenScience vendors external science skills as source material for the default
Science skill pack. The final runtime surface should materialize these sources
into first-class `ds-*`, `kdense-*`, `aer-*`, and later `sciagent-*` skill
directories rather than asking the agent to browse vendor folders as its main
workflow. The vendored originals remain useful for provenance, license review,
and migration.

These repositories are not runtime engines and do not override the OpenScience
Science artifact contract.

## How to Read Materialized Skills

Each generated `ds-*`, `kdense-*`, and `aer-*` directory starts with an
OpenScience adapter before the upstream skill body.

1. Use frontmatter `description` for trigger/routing.
2. Read the OpenScience adapter first. It controls evidence, artifact,
   provenance, permissions, clinical boundaries, license notices, and final
   reporting.
3. Use the upstream body as domain workflow guidance only.
4. Load `references/` files only when the selected workflow needs them.
5. Treat scripts/assets/templates as source material until authorization and
   environment checks pass.
6. Record `skill_use`, then convert concrete retrievals/runs/outputs into
   evidence, artifacts, claims, and provenance.

## DeepScientist v1.6.0

- Source: `https://github.com/ResearAI/DeepScientist.git`
- Local path: `resources/skills/vendor/deepscientist-1.6.0`
- Pinned ref: tag `v1.6.0`, commit `3fa3485`
- License: Apache-2.0
- Skill root: `resources/skills/vendor/deepscientist-1.6.0/src/skills`
- Skill count at import: 21 under `src/skills`

Useful Science Mode skills:

- `science`: scientific package routing, package checks, HPC-through-shell,
  computed/parsed/digitized/hypothesis claim discipline.
- `scout`, `idea`, `experiment`, `analysis-campaign`, `decision`, `finalize`:
  long-running research workflow stages.
- `paper-outline`, `write`, `review`, `rebuttal`: manuscript and review flow.
- `paper-plot`, `figure-polish`, `nature-figure`: publication-quality figures.
- `nature-data`, `nature-polishing`, `nature-paper2ppt`: journal-facing data,
  writing, and presentation workflows.

OpenScience mapping:

- Replace DeepScientist's `artifact.science(...)` recording calls with
  `science_artifact(...)`.
- Keep its package-check and claim discipline.
- Treat package cards as routing guidance. Real package availability still
  requires import/executable/version/smoke-test checks.

## K-Dense Scientific Agent Skills

- Source: `https://github.com/K-Dense-AI/scientific-agent-skills.git`
- Local path: `resources/skills/vendor/scientific-agent-skills`
- Pinned ref at import: commit `0807ddb`
- License: MIT
- Skill root: `resources/skills/vendor/scientific-agent-skills/skills`
- Skill count at import: 149 `SKILL.md` files

High-priority Science Mode entry points:

- `database-lookup`: deterministic public database lookups with endpoint
  provenance; includes UniProt, PDB, ChEMBL, ClinVar, Ensembl, Reactome, GEO,
  PubChem, KEGG, STRING, OpenTargets, SRA, PRIDE, AlphaFold, and many others.
- `paper-lookup`, `research-lookup`, `literature-review`, `citation-management`:
  literature search, review, and citation workflows.
- `scanpy`, `anndata`, `scvi-tools`, `scvelo`, `cellxgene-census`:
  single-cell and AnnData workflows.
- `rdkit`, `datamol`, `deepchem`, `medchem`, `molecular-dynamics`,
  `diffdock`, `esm`: cheminformatics, molecular modeling, protein workflows.
- `biopython`, `bioservices`, `gget`, `phylogenetics`, `pydeseq2`,
  `bulk-rnaseq`: bioinformatics and genomics workflows.
- `scientific-visualization`, `matplotlib`, `seaborn`, `scientific-schematics`:
  figures and diagrams.
- `scientific-writing`, `venue-templates`, `scientific-slides`, `latex-posters`,
  `pptx-posters`: manuscript, slides, posters, and venue-specific writing.
- `get-available-resources`, `modal`, `nextflow`, `pacsomatic`,
  `optimize-for-gpu`: compute/resource/workflow routing. HPC/GPU orchestration
  remains a later OpenScience feature; record only what was actually run.

Clinical boundary:

- `clinical-decision-support`, `clinical-reports`, `treatment-plans`, and
  similar patient-care skills should route to Medical Evidence Mode when the
  user asks for clinical decisions or medical advice.
- In Science Mode they may be used only as technical references, and outputs
  still require Medical Evidence review before patient-facing use.

## Auto-Empirical Research Skills

- Source: `https://github.com/brycewang-stanford/Auto-Empirical-Research-Skills.git`
- Local path: `resources/skills/vendor/auto-empirical-research-skills`
- Pinned ref at import: commit `e42d97d`
- License: CC-BY-SA-4.0, Copyright (c) 2026 CoPaper.AI
- Skill root: repository root plus curated child `skills/**/SKILL.md`
- Skill count at import: 1,153 `SKILL.md` files in the vendored repo
- Materialized default subset: root router plus flagship/full empirical,
  causal/econometrics, replication, citation, open-science, survey/qualitative,
  and productivity skills as `aer-*`

High-priority Science Mode entry points:

- `aer-auto-empirical-research-skills`: router for the whole AERS catalog.
- `aer-statspai-skill` and full empirical Python/Stata/R skills: applied
  empirical pipeline, tables, event studies, causal methods, robustness, and
  paper-ready outputs.
- AERS causal/econometrics skills: DID, IV, RDD, synthetic control, DML,
  panel fixed effects, Bayesian/quasi-experimental workflows, and Stata/R/Python
  replication patterns.
- AERS replication/citation/open-science skills: codebook pass, citation
  fidelity, replication-package audit, systematic review, OpenAlex/citation
  checking, and DOI/claim support.
- AERS social-science writing/paper workflow skills: AER-style research design,
  top-journal paper workflow, Chinese de-AIGC editing, and empirical paper
  revision.

Integration notes:

- Do not recursively load all 1,153 AERS child skills into a single prompt.
  The upstream root `SKILL.md` explicitly treats the repo as a router; the
  OpenScience materializer follows that design by default-enabling a curated
  high-signal subset and retaining the full vendor catalog for discovery.
- AERS contains some collections that overlap with K-Dense and other general
  writing/research skill packs. Prefer the already materialized K-Dense skill
  for natural-science database/software tasks; prefer AERS for social-science
  methodology, econometrics, causal inference, replication, and AER-style
  manuscript workflows.
- All materialized/adapted AERS skill content must keep CC BY-SA 4.0
  attribution and ShareAlike notices. The main OpenScience app code license is
  unchanged; this rule applies to the adapted skill material.

## Selection Algorithm

1. Search this file or the vendor skill directory names for the closest domain.
2. Open exactly one or a small set of relevant vendored `SKILL.md` files.
3. Open referenced `references/` files only when needed for the current task.
4. Record the selection:

```json
{
  "action": "create",
  "target": { "kind": "skill_use" },
  "payload": {
    "skillId": "database-lookup",
    "skillName": "K-Dense Database Lookup",
    "source": "k-dense",
    "sourceUrl": "https://github.com/K-Dense-AI/scientific-agent-skills",
    "purpose": "database_lookup",
    "status": "used",
    "triggeredBy": "Need UniProt/PDB/ChEMBL retrieval guidance"
  }
}
```

5. Convert concrete retrievals/runs/outputs into `evidence`, `artifact`,
   `claim`, and `provenance` records.

## Do Not

- Do not expand all vendored skill bodies into every conversation prompt.
- Do not rely on this catalog as the final runtime surface; generate and enable
  first-class Science skill pack entries instead.
- Do not treat a skill description as evidence.
- Do not execute unreviewed external `scripts/`; treat them as quarantined until
  allowlisted by OpenScience.
- Do not execute paid/cloud/lab/remote actions without user authorization.
- Do not bypass `research_evidence` for literature/database evidence when the
  shared OpenScience retrieval path can provide traceable records.
- Do not bypass `science_artifact` when a result affects the final report.

## Structure Workflow Map

When the user asks for protein/molecule visualization or structure-backed
reasoning, use the vendored skills this way:

- Retrieval: `database-lookup/references/pdb.md`,
  `database-lookup/references/alphafold.md`,
  `database-lookup/references/uniprot.md`, and when relevant ChEMBL/PubChem
  references. Register each fetched record as `database_record` evidence.
- Protein validation: `biopython/references/structure.md` for parsing
  PDB/mmCIF, enumerating chains/residues/atoms, checking ligands and distances,
  and detecting missing/ambiguous structure details. Register this as
  `validation_result` evidence.
- Small molecules: `rdkit`, `datamol`, `medchem`, or `deepchem` for SDF/MOL
  parsing, standardization, conformer generation, descriptors, and docking
  preparation. Generated coordinate files become `molecule` artifacts.
- MD/docking/PLM: `molecular-dynamics`, `diffdock`, and `esm` are workflow
  references only. Verify packages and record actual commands/logs before
  creating computed claims.

OpenScience preview currently renders static PDB/mmCIF/PQR/SDF/MOL/MOL2/XYZ
files through the `molecular_structure` preview type. Submit these outputs as
`protein_structure` or `molecule` artifacts with `viewer` metadata so the
existing Preview frame opens the 3D structure instead of treating coordinates
as code.
