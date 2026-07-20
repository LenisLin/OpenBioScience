Offline exploratory gene sets for OpenBioScience workflows.

These files are intentionally compact fallback resources for local/private data
exploration when external enrichment providers or large curated libraries are
not configured. Reports must label results from these files as exploratory.

Analysis manifests must name the gene-set file or provider used for enrichment.
Generated scripts should read this directory through `OPENBIOSCIENCE_GENE_SET_ROOT`
instead of hardcoding pathway genes inside the analysis code.

## MSigDB Localization

Full MSigDB collections are not vendored here. Localize licensed downloads from
https://www.gsea-msigdb.org/gsea/msigdb into:

```text
${OPENBIOSCIENCE_MSIGDB_ROOT:-$OPENBIOSCIENCE_GENE_SET_ROOT/msigdb}/
  human/
    *.gmt
    manifest.json
  mouse/
    *.gmt
    manifest.json
```

Each `manifest.json` should record species, MSigDB release/version, collection
names, file paths, license/terms, download URL, and access date.
`bio_knowledge.resolve_gene_set` should prefer localized MSigDB files when
available and fall back to compact shipped GMT files only for exploratory
analysis.
