# Modality Routing Notes

Use this reference when assigning execution modules after the top-level paper audit.
Do not invent missing leaf skills.
When no downstream skill exists, keep the module planned-only and state the required capability.
All executable routes consume the validated method parameter contract first. Unreported values may be analysis choices but cannot support parameter-aligned claims.

## General Routing Rules

- Start every full paper reproduction with `bio-omics-reproduction-planning`.
- Route only scoped modules downstream after source audit and claim feasibility are explicit.
- Use `bio_source` or `bio-data-resolution` for accession, file, and data-semantics uncertainty.
- Use `bio_runtime` or `bio-environment-routing` for environmentRef and capability uncertainty.
- Use `bio-environment-manager` only when a missing/custom environment must be
  registered before a planned module can run.
- Use `bio-analysis-script-authoring` only after module scope, inputs, outputs,
  and environment candidates are explicit.
- Use `science_artifact` for plan, audit, decisions, warnings, and later execution outputs.

## scRNA-seq

Route after planning to `bio-scrna-reproduction`.
Typical downstream modules:

- import and matrix semantics -> `bio-singlecell-import`
- environmentRef choice -> `bio-environment-routing`
- missing/custom environment registration -> `bio-environment-manager`
- approved script drafting -> `bio-analysis-script-authoring`
- QC and preprocessing -> `bio-qc-preprocess`
- batch, dimensionality reduction, clustering -> `bio-batch-dim-cluster`
- markers -> `bio-marker-optimization`
- annotation -> `bio-cell-annotation`
- figures -> `bio-scrna-plotting`
- final claim wording after executed outputs -> `bio-result-interpretation`

Planning cautions:

- raw UMI counts are needed for strict QC and many DE claims
- sample or patient keys are needed for sample-level biological comparisons
- processed-only objects usually support limited annotation, visualization, or signature review
- CCI, trajectory, CNV, and GRN are downstream specialized workflows and should not be implemented here

## Bulk RNA-seq

Use the planning skill for article-level audit.
If no project bulk RNA-seq reproduction skill exists, keep modules planned-only.
Record whether the data are FASTQ, count matrix, TPM/FPKM, normalized expression, metadata, or figure-level only.
Block count-dependent DE if only normalized expression is available.
Record reference genome, annotation version, aligner or quantifier, contrast design, covariates, and replicate structure.

## Spatial Transcriptomics or Proteomics

Use the planning skill for article-level audit.
If no project spatial reproduction skill exists, keep modules planned-only.
Record assay platform, spatial image availability, spot/cell coordinates, expression matrix status, segmentation method, image size, and reference atlas needs.
Block image-dependent claims when raw images, segmentation masks, or coordinate systems are unavailable.
For large image files, prefer manifests and planned-only localization.

## scATAC-seq

Use the planning skill for article-level audit.
If no project ATAC reproduction skill exists, keep modules planned-only.
Record whether available inputs are FASTQ, fragments, peak matrix, gene activity matrix, metadata, motif database, or processed object.
Block peak-calling and motif-enrichment claims when fragments or peak definitions are unavailable.
Record genome build, blacklist, peak caller, motif database, and cell-type annotation dependencies.

## Multiome

Use the planning skill for article-level audit.
If no project multiome reproduction skill exists, keep modules planned-only.
Split modules by modality and integration step:

- RNA preprocessing
- ATAC preprocessing
- shared cell metadata
- cross-modality linkage
- integrated clustering or annotation

Block integration claims when barcode pairing, shared metadata, or one modality is missing.

## Other Omics

For proteomics, metabolomics, methylation, Hi-C, CRISPR screens, or custom assays, keep the paper-level plan and source audit.
Record data type, raw versus processed status, required reference resources, executable code availability, and downstream capability gaps.
Route only to existing skills or MCPs that are present in the repository.
