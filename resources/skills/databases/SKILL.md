---
name: openscience-databases
description: Router for paper and scientific database retrieval in Science Mode, including PaperClip research_evidence, K-Dense lookup skills, and future bio-tools/JimLiu database providers.
---

# OpenScience Databases Router

Use this skill when the task needs papers, preprints, public biological or
chemical databases, dataset registries, metadata, identifiers, or database
provenance.

## Current Tool Contract

- Use `research_evidence(action="search"|"read")` for live retrieval.
- After reading, create evidence nodes with source type `paper`,
  `database_record`, `dataset`, or `validation_result`.
- Record database name, endpoint/source, query parameters, access date,
  returned/retrieved counts, identifiers, warnings, and raw file/hash when
  available.

Do not implement new provider dispatch here; the future provider gateway is
outside this skill.

## Merge Map

- General paper lookup: `ds-alphaxiv-paper-lookup`, `kdense-paper-lookup`,
  `kdense-literature-review`, `kdense-citation-management`.
- Broad database routing: `kdense-database-lookup`,
  `kdense-research-lookup`.
- Biology/genomics: `kdense-cellxgene-census`, `kdense-gget`,
  `kdense-bioservices`, `kdense-onekgpd`, `kdense-tiledbvcf`,
  `kdense-depmap`, `kdense-primekg`.
- Structures/proteins/chemistry: `kdense-biopython`, `kdense-rdkit`,
  `kdense-datamol`, `kdense-medchem`, `kdense-deepchem`,
  `kdense-matchms`.
- JimLiu bio-tools domains to map later behind `research_evidence`:
  PubMed, Europe PMC, bioRxiv, arXiv, UniProt, AlphaFold, PDB/EMDB,
  Ensembl/BioMart, Reactome/pathways, ClinVar/dbSNP/gnomAD/GWAS,
  GEO/ArrayExpress, ChEMBL/ChEBI/BindingDB/ZINC, CellGuide, GTEx,
  ENCODE/JASPAR, IntAct/ComplexPortal.

## SOP

1. Pick the smallest source set needed for the question.
2. Search/read with `research_evidence`.
3. Normalize identifiers and record access metadata.
4. If a database record supports a visible artifact, link its evidence id to
   the artifact and snapshot any saved raw response or exported table.
5. If retrieval is incomplete, publish a graph warning rather than hiding it.
