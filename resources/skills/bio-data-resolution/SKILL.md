---
name: bio-data-resolution
description: >
Use when a scRNA-seq reproduction task or user-authorized private-data analysis needs dataset discovery, source-file mapping, local artifact pointer validation, dataset-unit identification, metadata availability checks, or raw-versus-processed data status. Route importable local files to bio-singlecell-import.
---

# Bio Data Resolution

This skill resolves data sources and access status for scRNA-seq workflows. It records what is available and what claims the data can support; it does not download or transform data by itself.

## OpenBioScience Adapter

- For a user-provided local analysis, require the user-selected data root to be inside the authorized workspace and start `bio_analysis(action="start_analysis")`; never infer a host path or merge independently identified dataset units.
- Record one dataset-unit row for every matrix/object plus linked metadata group. A shared parent folder is not evidence that units should be combined.

- Use `research_evidence` for papers, repositories, database records, and accession metadata.
- Use `bio_source` for accession and data-manifest contracts; use `bio_runtime` only for environment/workflow validation. Managed downloads require a future approved provider/runner.
- Register source records, local pointers, hashes/sizes when available, license/terms notes, and unresolved issues through `science_artifact`.
- Avoid absolute infrastructure paths in documentation; use artifact IDs, user paths, or environment-neutral references.
- Use `environmentRef` only for runtime requirements; do not encode physical storage in skill text.

## Scope

Use this skill for:

- Resolving GEO, SRA, ArrayExpress, Zenodo, Figshare, CellxGene, HCA, lab repository, or supplementary data references.
- Determining whether raw counts, processed objects, metadata, or only figure-level data are available.
- Selecting demo datasets for reproducibility exercises.
- Creating a data manifest for downstream import.

Route elsewhere for:

- File/object import -> `bio-singlecell-import`.
- Environment probing -> `bio-environment-routing`.
- Scientific conclusion writing -> `bio-result-interpretation`.

## Inputs

Required:

- `paper_or_source`
- `species`
- `desired_claims`

Recommended:

- `accession_ids`
- `figure_or_table_ids`
- `local_candidate_paths`
- `required_metadata_keys`
- `license_or_terms_constraints`

## Workflow

1. Extract accessions, repository links, supplementary files, and methods statements from the source.
2. Classify each data item as raw count, processed matrix, object file, metadata table, code/config, figure data, or unknown.
3. Check availability, access restrictions, file sizes, and expected formats through approved lookup tools.
4. Build a data manifest with stable identifiers and local artifact pointers where available.
5. Mark claim support: directly supported, conditionally supported, unsupported, or unresolved.
6. Register the manifest and unresolved decisions through `science_artifact`.

## Output Contract

Every resolution pass should produce:

- `reports/data_resolution.json`
- `tables/data_manifest.tsv`
- `tables/claim_data_support.tsv`
- `logs/data_resolution.log`

Summary schema:

```json
{
  "schema": "openbioscience.data_resolution.summary.v1",
  "sources": [],
  "accessions": [],
  "dataItems": [],
  "rawCountsAvailable": false,
  "metadataKeysAvailable": [],
  "claimSupport": [],
  "unresolved": [],
  "warnings": []
}
```

## Gotchas

| Symptom                               | Likely cause                            | Fix                                                                                       |
| ------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Accession has only FASTQ              | alignment/counting not in current scope | Record raw sequencing status and route to appropriate upstream pipeline only if requested |
| Supplement has normalized matrix only | authors did not publish raw UMI counts  | Allow annotation/plotting with limited claims; block counts-based DE                      |
| Metadata split across files           | repository-specific organization        | Create explicit join plan before import                                                   |
| Dataset license/terms unclear         | external repository restrictions        | Record uncertainty and avoid redistribution assumptions                                   |

## Validation

- Each accession or file has a status and source URL/identifier.
- Manifest distinguishes raw counts from processed expression.
- Required sample, patient, condition, batch, and response keys are present or explicitly missing.
- Downstream blocked claims are visible before import.

## Next

- Local importable files available -> `bio-singlecell-import`.
- Runtime requirement unclear -> `bio-environment-routing`.
- Explicit paper/demo objective -> `bio-scrna-reproduction`.
- No paper objective and local/private data -> `bio-omics-analysis`.
