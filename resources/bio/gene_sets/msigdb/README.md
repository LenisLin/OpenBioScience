Local MSigDB resource contract.

Do not commit full MSigDB releases here unless licensing and size have been
approved. In deployed environments, mount or download licensed GMT files into
`human/` and `mouse/`, each with a `manifest.json` containing:

- `schema`: `openbioscience.gene_set_resource_manifest.v1`
- `provider`: `MSigDB`
- `release`: MSigDB release identifier
- `species`: `human` or `mouse`
- `organismCode`: `Hs` or `Mm`
- `geneIdType`: `gene_symbol`
- `files`: resourcePath, collection, geneSetCount, sizeBytes, downloadUrl, status
- `licenseOrTerms`
- `officialPortalUrl`

`index.tsv` is the compact discovery table for both species. It should stay
small enough for MCP status and provenance summaries.

`bio_knowledge.resolve_gene_set` reads this directory through
`OPENBIOSCIENCE_MSIGDB_ROOT`.
