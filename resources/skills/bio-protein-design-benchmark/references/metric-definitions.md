# Metric definitions and interpretation

## Sequence metrics

- **Native recovery (all positions):** fraction of sequence positions identical to the native sequence.
- **Native recovery (designed positions):** fraction identical only over predeclared `design_positions`. This is the primary recovery metric for partial redesign.
- **Pairwise sequence distance:** Hamming distance divided by sequence length, averaged across unique candidate pairs. Higher values indicate a more varied sampled set, not better proteins.
- **Unique fraction:** unique full-length candidate sequences divided by candidate count.
- **Position entropy:** Shannon entropy in bits at each position. Report the mean over all positions and over designed positions. This describes sampled diversity only.

## Supplied language-model metrics

Record the exact model, revision, tokenization, masking scheme, sequence normalization, score direction, and aggregation. Raw likelihoods, pseudo-log-likelihoods, masked-marginal mutation scores, and embedding-derived scores are different metrics. Do not merge or rank across definitions without calibration.

## Structure self-consistency metrics

- **mean pLDDT:** local confidence averaged over residues; not experimental accuracy.
- **pTM:** predicted global topology confidence.
- **ipTM:** predicted interface confidence for complexes; unavailable for ordinary monomers.
- **mean PAE:** mean predicted aligned error; lower is less predicted relative-position uncertainty.
- **aligned C-alpha RMSD:** geometric deviation after a declared alignment and residue mapping. Report coverage with it.
- **TM-score:** length-normalized fold similarity under the declared implementation.
- **coverage:** aligned or evaluated residues divided by the intended residue count.

For monomers, predeclare one ranking metric such as mean pLDDT or TM-score. For complexes, require interface evidence and do not rank by pLDDT alone. Always show missing and failed models.

## Claim boundary

Agreement among ProteinMPNN, an ESM sequence model, and a structure predictor is model self-consistency. It does not demonstrate folding in vitro, thermodynamic stability, solubility, expression, affinity, activity, specificity, developability, or safety.

