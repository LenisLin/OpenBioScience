OpenBioScience bioinformatics runtime resources.

This directory contains small, versioned offline assets that are safe to ship
with the WebUI container. Large reference databases and raw analysis datasets
must stay outside this tree.

`OPENBIOSCIENCE_GENE_SET_ROOT` points to the primary local gene-set directory.
`OPENBIOSCIENCE_MSIGDB_ROOT` points to the local MSigDB mirror when licensed
downloads have been localized. `OPENBIOSCIENCE_MARKER_ROOT` points to local
atlas and marker packages. Marker, atlas, and gene-set resources are resolved
through `bio_knowledge` and should record source name, version, license/terms,
and access date in analysis reports.

Resource localization comes before analysis use: external atlas tables, TISCH2
records, and MSigDB GMT files should be downloaded into local resource packages
first; analysis scripts should consume these local packages rather than reaching
out to remote sources at runtime.
