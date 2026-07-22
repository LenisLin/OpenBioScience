# Data Contracts

## Canonical Mutation

Use `CHAIN:WTPOSINSMUT`, where `CHAIN:` and insertion code are optional. Examples:

- `A42G`
- `H:Y101AW`
- `A:K27AR`
- `KA27R` (SKEMPI compact input, normalized to `A:K27R`)
- `K_A_27_R` (SKEMPI underscore input, normalized to `A:K27R`)

Fields:

| Field | Meaning |
| --- | --- |
| `chain` | Structure chain ID when supplied |
| `wild_type` | One-letter wild-type amino acid |
| `sequence_position` | Positive reference-sequence position |
| `insertion_code` | Optional PDB author insertion code |
| `mutant` | One-letter mutant amino acid |

Accept canonical `[CHAIN:]WTPOS[ICODE]MUT`, SKEMPI compact `WTCHAINPOS[ICODE]MUT`, and SKEMPI underscore `WT_CHAIN_POS[ICODE]_MUT` input. Normalize all chain-bearing forms to `CHAIN:WTPOS[ICODE]MUT`. Reject stop codons, deletions, insertions, ranges, and multi-substitution expressions from a single-substitution run.

## Residue Map CSV

Required columns:

| Column | Meaning |
| --- | --- |
| `sequence_position` | One-based position in reference FASTA |
| `reference_wt` | Reference one-letter amino acid |
| `chain` | PDB chain ID |
| `auth_seq_id` | PDB author residue number |
| `insertion_code` | PDB insertion code or empty string |
| `structure_wt` | Structure one-letter amino acid |
| `mapping_status` | `mapped`, `unresolved`, or `mismatch` |

The canonical residue key is `chain:auth_seq_id:insertion_code`. Never collapse insertion codes.

## Blind Receipt

Schema: `openbioscience.protein_variant_benchmark.blind_receipt.v1`

Required evidence:

- source file SHA-256
- blind feature file SHA-256
- sealed truth file SHA-256
- row ID, mutation, and target column names
- normalized row count and rejected row count
- creation timestamp
- state `blinded`

The public receipt must not expose the source-table or sealed-truth absolute path. The blind feature CSV must not contain the target column. Review target aliases and derived columns manually; a hash cannot detect a semantically leaked feature.

## Freeze Receipt

Schema: `openbioscience.protein_variant_benchmark.freeze_receipt.v1`

Required evidence:

- referenced blind receipt SHA-256
- blind feature SHA-256
- frozen prediction SHA-256
- prediction column and declared direction
- expected, predicted, missing, duplicate, and non-finite row counts
- state `frozen`

Freeze must fail for duplicate IDs, unknown IDs, missing required IDs, or non-finite values unless an explicit partial-coverage policy was declared.

## Metrics JSON

Schema: `openbioscience.protein_variant_benchmark.metrics.v1`

Include:

- total, evaluated, missing, and non-finite counts
- MAE and RMSE
- Pearson and Spearman correlations, or `null` plus a warning when undefined
- sign accuracy using a declared target threshold
- score direction and unit notes
- warnings and exclusions

JSON must not contain NaN or Infinity.

## Benchmark Manifest

Schema: `openbioscience.protein_variant_benchmark.manifest.v1`

Include case ID, workflow kind, UTC creation time, source metadata, hashed inputs and outputs, environment reference, model/checkpoint, parameters, random seed, assumptions, exclusions, warnings, and registered artifact IDs when available.
