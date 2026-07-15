# Human CRC Paper-Map Fixture

This fixture represents the requested reproduction scope for Lee et al. (2020), _Lineage-dependent gene expression programs influence the immune landscape of colorectal cancer_, DOI `10.1038/s41588-020-0636-z`.

It intentionally contains only short paper excerpts and a hand-reviewed expected `PaperReproductionMap` for Figure 1c, Figures 2 and 3, Figure 4b/c, Figure 4d, and Figure 5. It does not distribute the paper PDF, supplements, expression matrices, or cell-level annotations.

The expected map models these local-availability facts from the demo case:

- SMC (`GSE132465`) and KUL3 (`GSE144735`) processed scRNA-seq count/annotation assets are locally available.
- Figure-linked clinical, mutation, bulk RNA-seq, TCGA survival, SMC lung, and PKU liver dependencies are absent or only partially represented locally.
- `MF1`, `MF2`, `MF3`, and `MF4` are paper-defined myofibroblast phenotype labels. They are not non-negative matrix factorization components.

The fixture hashes are deterministic test identifiers rather than claims that the copyrighted source file is included.
