---
name: openscience-databases
description: Router for paper and scientific database retrieval in Science Mode, including PaperClip research_evidence, K-Dense lookup skills, and bio-tools/JimLiu database providers.
---

# OpenScience Databases Router

Use this skill when the task needs papers, preprints, public biological or
chemical databases, dataset registries, metadata, identifiers, or database
provenance.

## Current Tool Contract

- Use `research_evidence(action="search"|"read"|"call")` for live retrieval.
- For tumor scRNA-seq dataset discovery, search curated cancer single-cell
  resources first. Use `source="tisch2"` or `source="cancer_singlecell"` with
  `research_evidence`; if the provider returns a structured fallback instead of
  native results, record that fallback as database evidence and continue with
  accessible TISCH2/web records plus archive accession localization.
- Use GEO, ArrayExpress, SRA, or similar broad archives through online
  database/search MCPs. These registries are not mirrored wholesale; they
  provide accession resolution, metadata retrieval, and selected-file download
  routes after a dataset candidate is selected.
- Before analysis, hand the selected public dataset files to `bio_source`:
  `rank_dataset_candidates` -> `prepare_public_download` ->
  `complete_public_download` -> `complete_localization`. Store reusable
  localized files under `data/public/<source>/<accession>/` and reference them
  from the exploration manifest instead of downloading inside analysis scripts.
- After reading, create evidence nodes with source type `paper`,
  `database_record`, `dataset`, or `validation_result`.
- Record database name, endpoint/source, query parameters, access date,
  returned/retrieved counts, identifiers, warnings, and raw file/hash when
  available.

Provider dispatch is owned by `research_evidence`; this skill selects source
order, records provenance expectations, and names the follow-up localization
route.

## Merge Map

- General paper lookup: `kdense-paper-lookup`,
  `kdense-literature-review`, `kdense-citation-management`.
- Broad database routing: `kdense-database-lookup`,
  `kdense-research-lookup`.
- Biology/genomics: `kdense-cellxgene-census`, `kdense-gget`,
  `kdense-bioservices`, `kdense-onekgpd`, `kdense-tiledbvcf`,
  `kdense-depmap`, `kdense-primekg`.
- Structures/proteins/chemistry: `kdense-biopython`, `kdense-rdkit`,
  `kdense-datamol`, `kdense-medchem`, `kdense-deepchem`,
  `kdense-matchms`.
- JimLiu bio-tools domains exposed or expected behind `research_evidence`:
  PubMed, Europe PMC, bioRxiv, arXiv, UniProt, AlphaFold, PDB/EMDB,
  Ensembl/BioMart, Reactome/pathways, ClinVar/dbSNP/gnomAD/GWAS,
  GEO/ArrayExpress, ChEMBL/ChEBI/BindingDB/ZINC, CellGuide, GTEx,
  ENCODE/JASPAR, IntAct/ComplexPortal, TISCH2/cancer-singlecell.

## SOP

1. Pick the smallest source set needed for the question.
2. Search/read with `research_evidence`.
3. Normalize identifiers and record access metadata. Save only the evidence
   snapshot or exported candidate table needed for provenance; keep the live
   registry query path available for refresh.
4. If selected data need local files, create a download/localization plan and
   complete it before any `bio_analysis.prepare_exploration` script work.
5. If a database record supports a visible artifact, link its evidence id to
   the artifact and snapshot any saved raw response or exported table.
6. If retrieval is incomplete, publish a graph warning rather than hiding it.
