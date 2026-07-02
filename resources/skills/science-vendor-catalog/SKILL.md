---
name: openscience-science-vendor-catalog
description: OpenScience local catalog router for vendored DeepScientist v1.6.0 and K-Dense Scientific Agent Skills. Use it to locate domain skills, database lookup guides, package workflows, and writing/visualization skills while keeping OpenScience artifact provenance as the source of truth.
---

# OpenScience Science Vendor Catalog

This skill is enabled by default in Science Mode. It does not replace the
OpenScience artifact protocol. It tells the agent where the vendored science
skills live and how to use them safely.

## Sources

Read `references/vendor-skill-sources.md` first when deciding whether an
external skill should be consulted.

Vendored repositories:

- DeepScientist v1.6.0:
  `resources/skills/vendor/deepscientist-1.6.0`
- K-Dense Scientific Agent Skills:
  `resources/skills/vendor/scientific-agent-skills`

## Routing Rule

Use progressive disclosure:

1. Identify the scientific domain or tool need.
2. Read only the relevant vendored `SKILL.md` and directly referenced
   `references/` files.
3. Treat vendored skills as workflow knowledge, not as evidence.
4. Run real work through the normal runtime: shell, Python, R, LaTeX, notebook,
   SSH, or user-approved connectors.
5. Record selected external skills with
   `science_artifact(action="create", target={kind:"skill_use"})`.
6. Record files, code, logs, database records, figures, tables, claims, and
   provenance through `science_artifact`.
7. Publish the final Science panel with `science_artifact(action="publish")`.

## Priority

- OpenScience `openscience-science` and `openscience-science-artifact` are the
  controlling contract.
- DeepScientist Science discipline is the preferred route for computed claims,
  package checks, HPC-through-shell discipline, experiment planning, paper
  writing, and review-stage research workflows.
- K-Dense Scientific Agent Skills are the preferred route for domain-specific
  database lookup, scientific Python package usage, bio/chem/protein/genomics
  workflows, scientific visualization, writing, citations, slides/posters, and
  lab/tool integrations.

## Protein / Molecule Routing

For structure visualization or structure-backed artifacts, prefer these local
skill routes:

- `database-lookup`: RCSB PDB, AlphaFold, UniProt, ChEMBL, PubChem, and related
  endpoint provenance.
- `biopython`: PDB/mmCIF parsing, chains/residues/atoms, DSSP, distance checks,
  missing residues, and structural sanity checks.
- `rdkit`, `datamol`, `deepchem`, `medchem`: ligand/conformer/small-molecule
  parsing, descriptors, fingerprints, standardization, and depictions.
- `diffdock`, `esm`: docking and protein-language-model workflows when the
  vendored reference matches the user's task and the required runtime is
  actually available.
- `molecular-dynamics`: OpenMM/MDAnalysis trajectory or snapshot analysis.

After reading the relevant vendored skill files, still submit outputs through
`science_artifact`: `database_record` evidence, coordinate-file artifact,
parser/validation evidence, and a `protein_structure` or `molecule` artifact
with `viewer` metadata.

## Clinical Boundary

Clinical diagnosis, treatment, patient-care recommendations, clinical reports,
and clinical decision-support tasks should route to Medical Evidence Mode when
possible. In ordinary Science Mode, clinical K-Dense skills may be read only as
technical references and must not produce medical advice without the medical
evidence contract.

## Safety

External skills may mention API keys, cloud services, laboratory platforms,
remote execution, or paid services. Do not call them unless the user has
authorized the host/service and the required credentials are available.

Never present a vendored skill's documentation as proof. A result is supported
only when it is connected to concrete evidence objects, files, command logs,
database records, papers, or user inputs in the Science artifact graph.
