Marker and atlas resource contract for OpenBioScience workflows.

This directory is intentionally compact. It keeps only the files needed by
`bio_knowledge` and analysis skills:

- `scrna_atlas_markers.v1.jsonl`: localized marker-atlas records.
- `scrna_atlas_markers.meta.yaml`: package scope, terms, and use policy.
- `index.tsv`: package discovery entry for `bio_knowledge.search_atlas`.
- `marker_resource.schema.json`: JSONL record schema.
- `README.md`: this operator-facing contract.

`bio_knowledge.search_marker` reads `*.jsonl` files from this directory.
`bio_knowledge.search_atlas` reads `index.tsv` and returns package metadata.
Analysis scripts should record the package as `scrna_atlas_markers.v1` in
`scripts/script_manifest.json.resourceProvenance.markerResources`.

`scrna_atlas_markers.v1.jsonl` was derived from the user-localized workbook
`scRNA_atlas_marker_dictionary.xlsx`. It contains 634 human, mouse, and
cross-species marker records from 31 scRNA-seq atlas papers. Each record carries
species, organ/context, compartment, major type, subtype/state, marker arrays,
source paper, source URL, evidence type, confidence, aliases, and embedded
exact-signature genes where available.

Use the hierarchy `compartment -> major_type -> subtype -> state`. State,
program, cycling, stress, interferon, exhaustion, hypoxia, metaprogram, and
ecotype labels are evidence for cell state or program, not standalone major
identity. Reports should retain source paper, evidence type, confidence, and
unresolved labels when annotation is ambiguous.
