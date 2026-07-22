---
name: bio-singlecell-vdj
description: Audit and analyze paired single-cell B-cell receptor data with matched 10x Gene Expression and VDJ barcodes. Use for 10x BCR contig annotations, GEX-VDJ barcode joins, productive and multichain QC, explicit clonotype definitions, paired VH/VL AIRR export, isotype summaries, or SHM analysis that must be gated on IgBLAST and germline provenance.
---

# Bio Single-cell BCR/VDJ

Use this workflow after `bio-singlecell-import` has established the GEX object semantics. Use `sc-py-immune-repertoire` as the default `environmentRef` and keep all sequence-level inputs and outputs local.

## Required inputs

- Matched 10x GEX barcodes from `barcodes.tsv[.gz]` or an exported one-column list.
- `filtered_contig_annotations.csv[.gz]` from a 10x BCR library.
- Species and sample/library identifiers.
- The exact barcode normalization policy. Default to `exact`; use `strip-10x-suffix` only after collision checks.

Run the deterministic audit before loading Scirpy or Dandelion:

```bash
python scripts/audit_vdj_inputs.py \
  --gex-barcodes /path/barcodes.tsv.gz \
  --contigs /path/filtered_contig_annotations.csv \
  --sample-id donor1 \
  --output-dir /path/intake/results/vdj
```

Read [references/contracts.md](references/contracts.md) when implementing an analysis script or validating the emitted tables.

## Workflow

1. Localize the GEX and BCR files with `bio-data-resolution`; record source URLs/accessions, checksums, and sample/library relationships.
2. Import and classify the GEX matrix with `bio-singlecell-import`. Do not infer VDJ quality from GEX quality.
3. Run `scripts/audit_vdj_inputs.py`. Block the join when barcode normalization creates collisions or required 10x columns are absent.
4. Join on normalized barcodes and report both directions: VDJ cells missing from GEX and GEX cells without productive BCR contigs.
5. Retain BCR contigs that are `productive=true`; when `high_confidence` exists, require it to be true for pairing and clonotyping. Report full-length status separately rather than silently filtering it.
6. Classify each matched cell as `paired_single`, `no_productive_heavy`, `no_productive_light`, `multichain_heavy`, `multichain_light`, or `multichain_both`. Keep multichain cells in QC tables but exclude them from default paired VH/VL and clonotype outputs.
7. Define a clonotype before computing it. The default contract uses exact paired nucleotide junctions: `(IGH junction, light locus, light junction)` from one productive high-confidence IGH and one IGK/IGL contig. Do not substitute amino-acid junctions or vendor clonotype IDs without labeling a separate definition.
8. Export the two rearrangement rows for each accepted pair in AIRR-compatible long form, linked by `cell_id`, `pair_id`, and `clone_id`. Preserve IGH/IGK/IGL locus and V/D/J/C calls.
9. Join B-cell state, sample, and condition metadata only after the barcode audit. Report join coverage and do not expose raw sequence or cell-level metadata to external services.
10. Register inputs, environment, audit report, QC table, paired AIRR table, scripts, logs, and warnings with `science_artifact`.

## SHM gate

Never report somatic hypermutation from 10x V/J calls or `filtered_contig_annotations.csv` alone. Enable SHM only after all of the following are available:

- a recorded IgBLAST version and command;
- species-appropriate V, D, and J germline database release/source;
- checksums for query, germline files, and IgBLAST result;
- an AIRR-parsed alignment containing germline identity/mutation fields;
- documented handling of ambiguous calls and incomplete sequences.

Pass the provenance JSON to `--igblast-provenance` to validate this prerequisite. A valid provenance file means only `eligible_for_downstream_shm`; it does not prove that SHM was calculated correctly. Change-O is an optional downstream profile for germline reconstruction and mutation quantification, not part of the base environment.

## Output contract

Produce:

- `reports/vdj_input_audit.json`
- `tables/barcode_join_qc.tsv`
- `tables/paired_airr_rearrangements.tsv`
- an analysis object or explicit blocked reason
- execution log and environment/package inventory

The report must include input checksums, barcode policy and collision count, join rates, productive/high-confidence filters, pairing-status counts, the exact clonotype definition, AIRR row count, SHM eligibility, warnings, and blocked claims.

## Claim boundaries

- Describe clone abundance as observed cell counts; do not equate it with biological expansion without sampling and replicate context.
- Do not compare conditions inferentially without biological replicates and a sample-level model.
- Do not call lineage relationships from shared CDR3 alone.
- Do not report SHM, germline divergence, or affinity maturation before the SHM gate passes.
- Do not silently choose one chain from multichain cells.

## Validation

Run:

```bash
python tests/smoke_test.py
```

The fixture must yield one accepted VH/VL pair while retaining multichain and unmatched VDJ cells in the QC report.
