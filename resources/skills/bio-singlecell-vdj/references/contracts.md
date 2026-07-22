# Single-cell BCR/VDJ contracts

## Accepted 10x columns

The audit requires `barcode`, `chain`, and `productive`. It recognizes `contig_id`, `high_confidence`, `full_length`, `v_gene`, `d_gene`, `j_gene`, `c_gene`, `cdr3`, `cdr3_nt`, `sequence`, `aa_sequence`, `umis`, and `reads` when present.

Accepted BCR loci are `IGH`, `IGK`, and `IGL`. Other loci remain visible in warnings and counts but cannot form a BCR pair.

## Pairing contract

An accepted pair has exactly one productive, high-confidence `IGH` contig and exactly one productive, high-confidence `IGK` or `IGL` contig in a GEX-matched cell. If `high_confidence` is absent, productive contigs are eligible and the audit emits a warning. `full_length` is audited but is not a hidden filter.

The default clone key is the literal tuple:

```text
(IGH cdr3_nt, light-chain locus, light-chain cdr3_nt)
```

Both nucleotide junctions must be present. The stable `clone_id` is the first 16 hexadecimal characters of SHA-256 over the tab-delimited tuple. This is an exact-pair clonotype, not a lineage cluster.

## AIRR-compatible paired export

`tables/paired_airr_rearrangements.tsv` contains two rows per accepted pair and these columns:

```text
sequence_id sequence sequence_aa productive v_call d_call j_call c_call
junction junction_aa cell_id locus pair_id clone_id sample_id
```

The extra linkage columns are OpenBioScience extensions. Validate strict AIRR schema compatibility with the pinned `airr` package before external submission; this audit does not claim registry submission readiness.

## IgBLAST and germline provenance

Optional provenance JSON uses schema `openbioscience.igblast_germline_provenance.v1`:

```json
{
  "schema": "openbioscience.igblast_germline_provenance.v1",
  "igblast": {"version": "...", "command": "..."},
  "germline": {
    "species": "human",
    "release": "...",
    "source": "...",
    "files": [
      {"role": "V", "path": "...", "sha256": "64 hex characters"},
      {"role": "D", "path": "...", "sha256": "64 hex characters"},
      {"role": "J", "path": "...", "sha256": "64 hex characters"}
    ]
  },
  "query": {"path": "...", "sha256": "64 hex characters"},
  "result": {"path": "...", "sha256": "64 hex characters"}
}
```

All three germline roles are required for the default human BCR contract. A valid document changes the audit status from `blocked_missing_igblast_germline_provenance` to `eligible_for_downstream_shm`; mutation counts still require parsing and validating the IgBLAST AIRR result.
