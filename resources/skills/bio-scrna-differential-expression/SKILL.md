---
name: bio-scrna-differential-expression
description: >
  Use when scRNA-seq conditions, tissues, treatments, or phenotypes require replicate-aware differential-expression testing. Enforces raw-count pseudobulk aggregation, biological-replicate gates, paired-design handling, edgeR quasi-likelihood contracts, blocked contrast reporting, and statistical completion receipts. Cluster identity markers remain under bio-marker-optimization.
---

# Bio scRNA-seq Differential Expression

## Reproduction Parameters

- Compare the validated replicate-aware design with the reported paper method.
- If the source used cell-level tests but the current contract requires pseudobulk edgeR, record edgeR as a scientifically motivated substitution and classify the result as scoped reimplementation.
- Statistical validity does not imply method-parameter alignment.

Use this skill for biological condition comparisons. Cell-level marker ranking is not a substitute for independent biological replication.

## Required Control Flow

1. Declare the biological replicate, condition, cell type, optional pairing key, formula, and contrasts.
2. Aggregate raw integer counts by biological replicate and cell type.
3. Call `bio_statistics(action="validate_de_design")` before writing or running edgeR code.
4. Follow returned `nextActions`; never replace a failed validation with an ad hoc audit.
5. Run only contrasts marked `ready`. Preserve blocked contrasts in the output status table.
6. Call `bio_statistics(action="validate_de_outputs")` before interpretation or execution-phase publication.

## Replication Gate

- Unpaired comparison: at least 3 independent biological replicates in each group after exclusions.
- Paired comparison: at least 3 complete pairs after exclusions.
- Exactly 3 valid replicates or pairs may be tested, but the report must carry a low-replication warning.
- Cells, clusters, technical libraries, and pseudobulk columns from the same biological unit do not increase the replicate count.
- An invalid contrast may receive descriptive summaries and plots only; do not fall back to cell-level inferential testing.
- A paired t-test, a t-test on logCPM values, or any cell-level test is exploratory only and cannot satisfy the condition-DE execution module.

## edgeR Contract

- Input: raw integer pseudobulk counts with one metadata row per count column.
- Design: declared formula equals the executed formula, includes pairing when applicable, and is full rank.
- Method: `DGEList`, TMM `calcNormFactors`, design-aware `filterByExpr`, dispersion estimation, `glmQLFit(..., robust=TRUE)`, and `glmQLFTest`.
- Direction: save target, reference, coefficient or contrast, and effect-size direction.
- Multiplicity: Benjamini-Hochberg within each declared cell-type/contrast family; state this scope explicitly.

## Output Contract

Produce:

- sample inclusion/exclusion table
- effective replicate counts after all exclusions and pairing
- design matrix and formula record
- library sizes and normalization factors
- dispersion and BCV diagnostics
- complete DE table for every tested contrast
- explicit status row for every blocked or failed contrast
- package/session information and execution log
- `bio_statistics` design and completion receipts

Allowed contrast statuses are `tested`, `blocked_insufficient_replicates`, `blocked_invalid_design`, and `failed`.

A run may complete with `validated_with_limits` when every declared contrast has one of these statuses, all tested contrasts pass output validation, and blocked contrasts remain visible in the status table. A scientifically blocked contrast is not a workflow failure and must not trigger a substitute statistical method.

## Processed Expression Exploratory Feature Screening

If raw integer counts are absent, do not run edgeR, DESeq2, negative-binomial pseudobulk DE, or any confirmatory raw-count statistical contract. This blockage does not stop exploratory biology.

Allowed exploratory alternatives on log-normalized or processed expression:

- Scanpy/Seurat-style feature ranking within each major cell class or cluster;
- sample/patient-level aggregate summaries within cell class when a biological replicate key exists;
- cell-level Wilcoxon, t-test, or logistic-regression ranking only as descriptive feature screening with an explicit pseudoreplication limitation;
- effect-size, detection-fraction, and group-mean summaries;
- heatmap, dotplot, volcano-like ranked feature plots, and pathway enrichment from ranked genes.

Required status label: `exploratory_processed_expression_screening`. Reports must state that these results are hypothesis-generating and not a substitute for replicate-aware raw-count DE. Required outputs are a feature table, status/blocked contrast table, feature heatmap or dotplot, ranked-gene enrichment table, enrichment figure when possible, and limitations.

For `omics_analysis/free_exploration`, report each comparison with one result-strength label:

- `descriptive`: composition, QC, marker, or summary output without inferential claim.
- `exploratory_processed_expression`: processed-expression ranking with effect sizes, detection fractions, and visible replicate/unit notes.
- `replicate_aware_inference`: a contrast with a ready `bio_statistics` design and validated outputs.

## Boundaries

- Cluster markers for annotation route to `bio-marker-optimization` and use log-normalized expression.
- Biological interpretation routes to `bio-result-interpretation` only after output validation.
- The statistical completion receipt is consumed by `bio_reproduction(action="complete_execution")`; Science execution publication consumes the resulting final reproduction execution receipt.
