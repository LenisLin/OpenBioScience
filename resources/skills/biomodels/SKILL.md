---
name: openscience-biomodels
description: Router for protein structures, molecular structures, docking, protein language models, biomolecular design, small molecules, and native structure/chemistry viewers in Science Mode.
---

# OpenScience Biomodels Router

Use this skill for protein structure, molecular structure, docking,
protein-language-model, ligand, conformer, cheminformatics, molecular dynamics,
and biomolecular design tasks.

## Merge Map

- Structure retrieval/validation: `kdense-database-lookup`,
  `kdense-biopython`, `kdense-bioservices`.
- Protein language models and structure prediction: `kdense-esm`,
  `kdense-diffdock`, `kdense-molecular-dynamics`, `cs-alphafold2`,
  `cs-boltz`, `cs-chai1`, `cs-openfold3`, `cs-esmfold2`,
  `cs-fair-esm2`.
- Protein/ligand design: `cs-proteinmpnn`, `cs-ligandmpnn`,
  `cs-solublempnn`; K-Dense `kdense-glycoengineering`,
  `kdense-torchdrug`.
- Chemistry and molecules: `kdense-rdkit`, `kdense-datamol`,
  `kdense-deepchem`, `kdense-medchem`, `kdense-molfeat`,
  `kdense-diffdock`.
- Viewer/editing: artifact viewer metadata for 3Dmol/Mol\*, Ketcher, and
  molecule/structure Preview pages.

## SOP

1. Decide whether the object is `protein_structure`, `molecule`, `alignment`,
   `dataset`, or `run_bundle`.
2. Retrieve/generate files through real runtime or approved endpoints.
3. Validate coordinate or molecule files before claims: parser/package/version,
   atom/residue/chain/model counts, ligands, missing residues, confidence or
   resolution when available, and warnings.
4. Create or version artifacts with primary coordinate/molecule path,
   source/input/code/log/environment links, and viewer metadata.
5. Snapshot source files, generated poses/models, scripts, logs, configs, and
   small derived tables.

## Boundaries

- Rendering a structure is not proof of function or mechanism.
- Docking, design, or model endpoints may require credentials, licenses, GPUs,
  or remote compute. Verify availability and authorization before use.
