---
name: openscience-science-artifact
description: Operate the OpenScience artifact graph with the science_artifact MCP tool: reserve ids, create, read, patch, version, publish, annotate, and focus artifact pages.
---

# OpenScience Science Artifact

Use this skill when creating or modifying a Science Mode artifact, evidence item,
claim, report, page, annotation, or provenance link.

## Tool Surface

Use one MCP tool: `science_artifact`.

Important actions:

- `status`: inspect the current run/project graph.
- `reserve_id`: allocate stable ids before files exist.
- `get`: read an object and its revision before updating.
- `list`: enumerate artifacts, pages, evidence, claims, or warnings.
- `create`: add a run/report/artifact/page/evidence/claim/provenance object.
- `patch`: update part of an existing object with `baseRevision`.
- `replace`: replace an existing object with `baseRevision`.
- `append`: append events, logs, skill_use records, or provenance edges.
- `version`: create a new artifact version.
- `snapshot`: add declared or extra files/folders to the project-level artifact
  git ledger.
- `publish`: produce the UI-renderable Science panel.
- `annotate`: record a user annotation on a region.
- `focus_page`: ask the UI to open or focus a page.

## Update Rules

1. For an existing id, call `get` first.
2. Pass the returned `revision` as `baseRevision`.
3. Use `patch` for metadata or display changes.
4. Use `version` when regenerating rendered scientific results.
5. Use `append` for logs, provenance, messages, warnings, and skill_use.
6. Use `replace` only for intentional whole-object rewrites.
7. Use `snapshot` after meaningful file-producing steps, before final publish
   or export, and after user annotation fixes.

For artifacts from an earlier conversation in the same research project:

1. Call `science_artifact(action="list", payload={"scope":"project"}, projectRoot=<authorized root>)`.
2. Identify the source `runId`, artifact `id`, and `version`.
3. Call `science_artifact(action="get", runId=<source runId>, target={"kind":"artifact","id":<id>,"version":<version>}, projectRoot=<authorized root>)`.
4. Use the returned `revision` as `baseRevision` for `patch` or `version`.
5. Prefer `version` when visible scientific content or source files changed; use
   `patch` only for metadata, viewer configuration, labels, pages, report text,
   or provenance corrections.
6. Do not silently recreate a duplicate artifact in the current run when a
   same-project artifact already exists and the user's intent is to modify it.

## Snapshot SOP

OpenScience keeps one artifact git ledger per research project under
`.openscience/artifact-repo`. Do not create a separate ledger for each
conversation when the project root is the same.

Call `science_artifact(action="snapshot")` when:

- an artifact has just been created or versioned;
- a figure, table, notebook, PDF, LaTeX manuscript, dataset slice, or run bundle
  was regenerated;
- a user annotation led to changed source code or source text;
- extra files or folders are required to reproduce a result but are not already
  declared in `primaryPath`, `sourcePaths`, `inputPaths`, `outputPaths`,
  `code.path`, or `execution.logPath`;
- the user asks to preserve temporary outputs.

Example:

```json
{
  "action": "snapshot",
  "target": { "kind": "artifact", "id": "fig_umap", "version": 2 },
  "payload": {
    "includePaths": [
      { "path": "results/umap.png", "role": "primary" },
      { "path": "scripts/make_umap.py", "role": "code" },
      { "path": "logs/umap.log", "role": "log" },
      { "path": "results/supplementary", "role": "output", "recursive": true }
    ]
  }
}
```

Snapshot standards:

- include files/folders needed to inspect, rerun, or defend the artifact;
- prefer project-relative paths;
- include folders only when their contents are relevant;
- never intentionally include `.env`, credentials, SSH keys, tokens, or private
  secrets;
- expect large files to be recorded as pointers with size/hash rather than
  copied into git;
- after snapshot, use the returned commit in follow-up notes when explaining
  provenance.

## Page Rules

Pages describe UI layout, not scientific truth. They can point to report,
preview, inspector, code, log, LaTeX editor, compiled PDF, notebook, evidence
ledger, provenance panes, or native scientific viewers.

Do not close user-opened pages unless explicitly authorized.

## Report Text Rules

When creating or patching a report page/panel:

- Use concise Markdown bold for decisive conclusion phrases, for example
  `**this run supports the negative control but not the main claim**`.
- Do not bold whole paragraphs, methods logs, or long caveat lists.
- Put supporting evidence ids in the block/item `evidenceIds` array, not as
  literal `[E2]`, `[ev_file]`, or `[ev_a, ev_b]` text inside `summary`, `text`,
  `label`, `detail`, captions, table cells, or report prose. The UI renders
  clickable anchors automatically from structured fields.
- Keep Reference Evidence entries short; detailed query parameters, identifier
  conversions, and warnings belong in evidence metadata/provenance, not in the
  main reading flow.

## Native Viewer Payload Rules

Native scientific viewers are artifact display metadata. They are not separate
MCP tools and they are not evidence by themselves.

General rules:

- Put viewer configuration under `payload.viewer`.
- Use project-relative paths only.
- Store durable paths, indexes, config files, hashes, commands, logs, and
  evidence ids. Do not store temporary local asset URLs.
- Before patching `viewer`, call `get` and pass `baseRevision`.
- If a viewer edit changes scientific content, use `version` rather than
  silently overwriting the previous artifact.
- If required index/config/reference files are missing, publish a warning or
  mark the artifact blocked; do not create a misleading viewer.

Viewer kinds:

| `viewer.kind`                        | Artifact type                     | Required durable information                                                                     |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `3dmol` / `molstar` / `rcsb_molstar` | `protein_structure` or `molecule` | coordinate path, format, source evidence, parser/validation evidence, optional focus/annotations |
| `igv`                                | `genome_track`                    | genome/reference, locus, tracks, index paths, reference/QC evidence                              |
| `ketcher`                            | `molecule`                        | molecule path or initial SMILES, format, editable/save policy, parsing/validation evidence       |
| `vitessce`                           | `dataset` or `run_bundle`         | config path/config, data paths, conversion logs, validation evidence                             |
| `msa`                                | `alignment`                       | alignment path, format, parser/format validation, selected sequence/region metadata              |

Genome track minimal payload:

```json
{
  "action": "create",
  "target": { "kind": "artifact" },
  "payload": {
    "id": "artifact_egfr_tracks",
    "type": "genome_track",
    "title": "EGFR locus alignments and variants",
    "version": 1,
    "primaryPath": "alignments/sample.bam",
    "inputPaths": [
      "alignments/sample.bam",
      "alignments/sample.bam.bai",
      "variants/sample.vcf.gz",
      "variants/sample.vcf.gz.tbi"
    ],
    "evidenceIds": ["E-reference-hg38", "E-bam-qc", "E-vcf-qc"],
    "viewer": {
      "kind": "igv",
      "genome": "hg38",
      "locus": "chr7:55,086,724-55,275,031",
      "tracks": [
        {
          "name": "Alignment",
          "type": "alignment",
          "format": "bam",
          "path": "alignments/sample.bam",
          "indexPath": "alignments/sample.bam.bai",
          "evidenceId": "E-bam-qc"
        },
        {
          "name": "Variants",
          "type": "variant",
          "format": "vcf.gz",
          "path": "variants/sample.vcf.gz",
          "indexPath": "variants/sample.vcf.gz.tbi",
          "evidenceId": "E-vcf-qc"
        }
      ]
    }
  }
}
```

Chemical editor minimal payload:

```json
{
  "action": "create",
  "target": { "kind": "artifact" },
  "payload": {
    "id": "artifact_candidate_ligand",
    "type": "molecule",
    "title": "Candidate ligand scaffold",
    "version": 1,
    "primaryPath": "molecules/candidate.sdf",
    "evidenceIds": ["E-molecule-parse", "E-design-source"],
    "viewer": {
      "kind": "ketcher",
      "format": "sdf",
      "editable": true,
      "service": "standalone",
      "savePolicy": "new_version_required",
      "exportFormats": ["smiles", "molfile", "sdf", "svg"]
    }
  }
}
```

Vitessce minimal payload:

```json
{
  "action": "create",
  "target": { "kind": "artifact" },
  "payload": {
    "id": "artifact_spatial_workspace",
    "type": "dataset",
    "title": "Spatial transcriptomics Vitessce workspace",
    "version": 1,
    "primaryPath": ".openscience/viewers/spatial-vitessce.json",
    "inputPaths": [".openscience/viewers/spatial-vitessce.json", "data/spatial.ome.zarr", "data/cells.zarr"],
    "evidenceIds": ["E-vitessce-conversion", "E-vitessce-validation"],
    "viewer": {
      "kind": "vitessce",
      "configPath": ".openscience/viewers/spatial-vitessce.json",
      "initialView": "spatial",
      "requiredConversions": [
        {
          "from": "data/raw.h5ad",
          "to": "anndata-zarr",
          "command": "python scripts/export_vitessce.py",
          "logPath": "logs/export_vitessce.log",
          "evidenceId": "E-vitessce-conversion"
        }
      ]
    }
  }
}
```

## Structure Artifact SOP

Use this subsection when registering or updating a protein/molecule structure
artifact.

Minimal create payload:

```json
{
  "action": "create",
  "target": { "kind": "artifact" },
  "payload": {
    "id": "artifact_structure_001",
    "type": "protein_structure",
    "title": "AlphaFold model for UniProt P69905",
    "version": 1,
    "primaryPath": "structures/P69905.cif",
    "sourcePaths": ["evidence/uniprot_P69905.json", "evidence/alphafold_P69905.json"],
    "evidenceIds": ["E-uniprot-P69905", "E-alphafold-P69905", "E-structure-parse-P69905"],
    "viewer": {
      "kind": "3dmol",
      "format": "cif",
      "representation": "cartoon",
      "colorBy": "plddt",
      "focus": { "chain": "A", "residueStart": 35, "residueEnd": 58 },
      "annotations": [
        {
          "label": "region inspected in validation",
          "chain": "A",
          "residueStart": 35,
          "residueEnd": 58,
          "evidenceIds": ["E-structure-parse-P69905"]
        }
      ]
    }
  }
}
```

For ligands or generated poses, set `type` to `molecule`, `format` to `sdf`,
`mol`, `mol2`, or `xyz`, and usually use `representation:"stick"` plus
`colorBy:"element"`.

Every structure artifact should normally have these evidence items:

- source/database evidence: PDB, AlphaFold, UniProt, ChEMBL, PubChem, local
  upload, or generated file source.
- validation evidence: parser/version, file hash, atom/residue/chain counts,
  ligand names, model count, missing residues/altLoc warnings, resolution or
  confidence metrics when known.
- run evidence when generated: command, script/notebook, log, environment, and
  output coordinate file.

Page example:

```json
{
  "action": "create",
  "target": { "kind": "page" },
  "payload": {
    "id": "page_structure_001",
    "title": "Structure preview",
    "kind": "structure",
    "layout": "single_preview",
    "panes": [
      {
        "id": "structure",
        "type": "structure_viewer",
        "target": { "artifactId": "artifact_structure_001", "path": "structures/P69905.cif" }
      },
      {
        "id": "inspector",
        "type": "inspector",
        "target": { "artifactId": "artifact_structure_001" }
      }
    ]
  }
}
```

If modifying viewer settings, call `get` for the artifact first and then
`patch` only `viewer` with `baseRevision`. If changing the coordinate file or a
generated pose, use `version` so v1 remains inspectable.

## Provenance Rules

Prefer explicit links:

- artifact derived from input evidence or prior artifact
- artifact uses code
- artifact has log
- artifact supports claim
- evidence supports claim
- claim answers report
- annotation annotates artifact

If a link is missing, publish with a warning rather than hiding the gap.
