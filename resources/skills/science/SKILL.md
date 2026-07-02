---
name: openscience-science
description: Default OpenScience Science Mode discipline for natural-science and engineering work. Use real shell/Python/R/LaTeX execution for computation, and use science_artifact to record reproducible evidence, artifacts, claims, and pages.
---

# OpenScience Science

Use this skill whenever a research-project conversation involves scientific data,
scientific software, computational experiments, literature/database evidence,
figures, tables, notebooks, manuscripts, or scientific claims.

## Contract

- Real execution happens through the normal agent runtime: shell, Python, R,
  LaTeX, notebook tooling, SSH, or other explicitly available tools.
- `research_evidence` is the shared search/read surface for papers, databases,
  and PaperClip virtual files.
- `science_artifact` is the durable artifact graph surface. It records, reads,
  patches, versions, publishes, and focuses research objects.
- OpenScience Science skill packs should be available as first-class skills
  (`ds-*`, `kdense-*`, `aer-*`, and later `sciagent-*`) through the default
  Science skill manifest. During migration, `openscience-science-vendor-catalog`
  may be used only as a source index for vendored DeepScientist v1.6.0, K-Dense
  Scientific Agent Skills, and Auto-Empirical Research Skills.
- Do not invent a result in chat and later look for evidence. Register the
  evidence chain as the work proceeds.

## Claim Discipline

Every answer-bearing claim must be one of:

- `computed`: produced by a real run in the current project.
- `parsed`: read from user data, papers, database records, metadata, or files.
- `digitized`: extracted from a figure/PDF/image region.
- `hypothesis`: plausible but not verified yet.

Computed claims need linked input, code, command/log, output artifact, and
environment when those exist.

## Artifact Discipline

- Reserve stable ids before referencing important artifacts.
- Call `science_artifact(action="get")` before patching an existing object.
- Use `baseRevision` for `patch`, `replace`, and metadata updates.
- Use `version` for regenerated figures, tables, PDFs, notebooks, and
  manuscripts.
- Keep old versions inspectable.
- For LaTeX and notebooks, record source, compiled/static preview, command,
  log, and environment.
- After meaningful file-producing steps, call
  `science_artifact(action="snapshot")` so the project-level artifact git ledger
  preserves the current run, artifact metadata, code/log/input/output files, and
  any extra user- or agent-selected folders. Use `includePaths` for supporting
  files that are not already declared on the artifact.
- For native scientific viewers, record the source evidence, primary file,
  required indexes/configs, parser or conversion validation, viewer metadata,
  and selected annotations. Do not leave PDB/mmCIF, genome tracks, molecules,
  single-cell/spatial workspaces, or alignment files as untracked attachments.

## Native Scientific Viewer SOP

Use a native viewer only when it helps the scientist inspect, edit, annotate,
or defend a scientific object. Do not use a viewer as decoration when a normal
report, PDF, CSV, or image preview is clearer.

The agent controls viewers declaratively through `science_artifact`: create or
patch an artifact/page with `viewer.kind`, then publish/focus the page when the
user should inspect it. Never control frontend DOM directly. Never treat a
viewer screenshot or visual impression as a claim unless it is backed by
evidence/validation records.

### Structure and molecule path

Use this path when the user mentions PDB, mmCIF, AlphaFold, UniProt structure,
protein complex, ligand, conformer, docking, active site, residue, chain,
molecular dynamics snapshot, small molecule, SDF/MOL/MOL2/XYZ, or asks to view
a protein/molecular structure in the preview frame.

1. Classify the object:
   - `protein_structure` for PDB/mmCIF/PQR, AlphaFold models, complexes,
     domains, chains, and MD snapshots exported as static coordinates.
   - `molecule` for SDF/MOL/MOL2/XYZ ligands, generated conformers, docking
     poses, or small-molecule structures.
2. Choose retrieval/analysis skills:
   - Use K-Dense `database-lookup` references for RCSB PDB, AlphaFold, UniProt,
     ChEMBL, PubChem, or related public database retrieval.
   - Use K-Dense `biopython` for PDB/mmCIF parsing, chains/residues/atoms,
     missing residues, distances, DSSP, or structure sanity checks.
   - Use K-Dense `datamol`, `deepchem`, `medchem`, or `diffdock` for
     ligand/conformer/docking tasks, and RDKit through the normal runtime when
     available in the project environment.
   - Use K-Dense `molecular-dynamics` or DeepScientist package cards for
     OpenMM/MDAnalysis/OpenMM-style trajectories, but submit only actual
     exported snapshots/logs as structure artifacts.
3. Register evidence before claims:
   - Create a `database_record` evidence item for the retrieval endpoint,
     access date, query identifiers, returned id, and warnings.
   - Create a `dataset` or `code` evidence item for local coordinate files or
     generated pose files.
   - Create a `validation_result` evidence item after parsing the structure:
     parser/package/version, atom count, chains, residues, ligands, resolution
     or pLDDT/PAE if available, missing residues, alternate locations, and
     warnings.
4. Create the artifact:
   - Use `science_artifact(action="create", target={kind:"artifact"})`.
   - Set `type` to `protein_structure` or `molecule`.
   - Set `primaryPath` to the coordinate file and `inputPaths/sourcePaths` to
     the retrieval, conversion, or generation files.
   - Include `code`, `execution`, and `environment` when the file was generated,
     converted, minimized, docked, or filtered by code.
   - Add `evidenceIds` for the database/source and validation records.
5. Configure preview:
   - Add `viewer.kind` as `"3dmol"` or `"auto"` for lightweight previews.
     Use `"molstar"` or `"rcsb_molstar"` when the task needs assemblies,
     complex annotations, large mmCIF/BCIF structures, density, or a more
     professional structure-biology view.
   - Add `viewer.format` (`pdb`, `cif`, `mmcif`, `pqr`, `sdf`, `mol`, `mol2`,
     `xyz`), `representation` (`cartoon`, `stick`, `surface`, `sphere`,
     `line`, `auto`), and `colorBy` (`chain`, `element`, `spectrum`, `plddt`,
     `auto`).
   - Use `viewer.focus` to open directly on a chain, residue range, ligand, or
     active-site region when the user asked about a specific site.
   - Use `viewer.annotations` for residue/ligand callouts. Every annotation
     should include `evidenceIds` when it supports a scientific statement.
6. Publish and focus:
   - Create or patch a page with a `preview` or `structure_viewer` pane pointing
     to the artifact.
   - Use `science_artifact(action="focus_page")` only when the user should
     inspect the structure now; otherwise publish in the background.
7. Claim limits:
   - Rendering a structure is not evidence of function, binding, causality, or
     mechanism. Any such claim needs database, literature, computation, or
     validation evidence and the proper `claimType`.

### Genome browser path

Use `viewer.kind="igv"` when the user asks to inspect loci, reads, variants,
coverage, peaks, annotations, or genome tracks, or when generated BAM/CRAM,
VCF, BED, BigWig, GFF/GTF outputs need direct inspection.

- Set artifact `type` to `genome_track`.
- Register reference/genome evidence and track QC evidence before claims.
- BAM requires BAI, CRAM requires CRAI, bgzip VCF requires TBI/CSI, and custom
  FASTA requires FAI. If missing, run the indexing command when authorized and
  record command/log/environment evidence; otherwise mark the viewer blocked.
- Use `viewer={kind:"igv", genome, reference, locus, tracks:[...]}`. Track
  paths and index paths must be project-relative.
- Use K-Dense genomics skills such as `kdense-pysam`, `kdense-gtars`,
  `kdense-deeptools`, or `kdense-tiledbvcf` when their workflow knowledge fits.

### Chemical editor path

Use `viewer.kind="ketcher"` when the user needs to draw, edit, compare, export,
or review molecules/reactions from SMILES, MOL, SDF, RXN, KET, HELM, FASTA, or
sequence-like chemical representations.

- Set artifact `type` to `molecule`.
- `editable=true` requires `savePolicy:"new_version_required"`.
- Ketcher edits must create a new artifact version; never overwrite v1.
- Register parsing/validation evidence, and add computation evidence for
  generated conformers, docking poses, descriptors, or filters.

### Single-cell / spatial path

Use `viewer.kind="vitessce"` only when a Vitessce config and compatible data
layout are prepared for single-cell or spatial omics inspection.

- Set artifact `type` to `dataset` or `run_bundle`.
- Do not hand raw `.h5ad` directly to the viewer and pretend it is ready.
  Convert/export required Zarr, OME-Zarr, AnnData-Zarr, matrices, or metadata
  files first.
- Record conversion commands, logs, config path, data paths, schema validation,
  and warnings as evidence.
- Use K-Dense skills such as `kdense-scanpy`, `kdense-anndata`,
  `kdense-cellxgene-census`, `kdense-scvi-tools`, or `kdense-scvelo` when
  appropriate.

### Alignment path

Use `viewer.kind="msa"` when the user needs to inspect FASTA, CLUSTAL,
Stockholm, A3M, or similar multiple-sequence alignments.

- Set artifact `type` to `alignment`.
- Register source evidence, parser/format validation, sequence counts, length
  ranges, gap statistics, and any selected region annotations.

### Empirical social-science path

Use this path when the user asks for applied economics, social science,
policy analysis, survey research, qualitative coding, replication packages,
or causal/econometric analysis.

- Choose AERS materialized skills first for empirical work. Start with
  `aer-auto-empirical-research-skills` when routing is unclear; prefer
  `aer-statspai-skill`, `aer-full-empirical-analysis-skill`,
  causal/econometrics skills, citation-checking skills, and replication skills
  when they match the task.
- Register the research design as evidence before final claims: sample
  definition, variable/codebook, identification strategy, model specification,
  estimation command/code, assumptions, diagnostics, robustness checks, and
  limitations.
- Use `regression_table`, `model_diagnostic`, `causal_dag`,
  `survey_codebook`, `geospatial_map`, `qualitative_coding`, or
  `replication_package` artifact types when they describe the object better
  than generic figure/table/dataset.
- Use `viewer.kind="regression_table"` for model tables with coefficient
  metadata, clustered SE notes, fixed effects, sample size, and linked code.
- Use `viewer.kind="causal_dag"` for DAG/identification diagrams, with each
  assumption tied to evidence or an explicit hypothesis.
- Use `viewer.kind="map"` for spatial outputs, and record layer paths,
  CRS/projection, joins, geocoding steps, and aggregation warnings.
- Use `viewer.kind="codebook"` for variable dictionaries, survey instruments,
  and recoding logs.
- Use `viewer.kind="qualitative_coding"` for thematic coding schemes, coded
  excerpts, inter-coder notes, and reflexive memos.

### Native viewer trigger matrix

- Use a native viewer when the user asks to open, inspect, compare, annotate,
  edit, focus, circle, zoom, or validate a scientific object.
- Use a native viewer after generating a scientific object that is hard to
  understand as plain text, especially structures, tracks, molecules, and
  single-cell/spatial workspaces.
- Do not use a native viewer when ordinary Markdown, PDF, CSV, image, notebook,
  or table preview is sufficient.
- If required input/index/config/reference evidence is missing, ask, compute it,
  or publish a blocked warning instead of opening a misleading viewer.

## External Skill Discipline

- DeepScientist, K-Dense, and Auto-Empirical skills are workflow knowledge, not
  evidence.
- Prefer materialized first-class skill ids such as `ds-review`,
  `ds-paper-plot`, `kdense-database-lookup`, `kdense-scanpy`, and
  `kdense-datamol`, or `aer-statspai-skill` over reading directly from vendor
  directories.
- AERS materialized/adapted skill contents are CC BY-SA 4.0 ShareAlike
  materials. Preserve attribution and mention OpenScience adapter changes when
  redistributing those skill directories.
- Record any selected external skill as a `skill_use` object.
- If an external skill suggests a package, API, solver, database, cloud service,
  or lab integration, verify availability and authorization before use.
- Do not execute scripts from external skill packs unless they are allowlisted
  by OpenScience. Treat unreviewed scripts as workflow references only.
- Clinical K-Dense skills must route to Medical Evidence Mode for medical
  advice or patient-facing recommendations.
- Concrete outputs from external skills must still become OpenScience
  `evidence`, `artifact`, `claim`, and `provenance` records.

### How to read a materialized skill

1. Start from the frontmatter `description` to decide whether the skill should
   trigger. Do not rely on the body for discovery-only routing.
2. Read the `# OpenScience Adapter` section first. It overrides upstream text
   for evidence, artifact, provenance, permission, clinical-boundary, and final
   report behavior.
3. Read the upstream body only as domain workflow guidance. Load referenced
   `references/` files only when the current task needs those details.
4. Treat scripts, templates, and assets as source material until packages,
   paths, credentials, and user authorization are verified.
5. If instructions conflict, this `openscience-science` skill and
   `openscience-science-artifact` win. If a K-Dense clinical skill becomes
   patient-facing, switch to Medical Evidence Mode.

### External skill SOP

1. Select the narrowest relevant first-class skill, such as
   `kdense-database-lookup` for public database retrieval, `kdense-biopython`
   for structure parsing, `ds-review` for skeptical research audit, or an
   `aer-*` skill for empirical social-science work.
2. Check the generated adapter metadata: source repository/ref/path, license,
   execution policy, risk, clinical boundary, and whether scripts are
   quarantined.
3. Record a `skill_use` object through `science_artifact` before the skill
   contributes to a visible result.
4. Execute only authorized commands through the normal runtime. Capture the
   working directory, command/code, input paths, output paths, logs,
   environment, failures, and user decisions.
5. Convert concrete sources and outputs into evidence records. A skill
   paragraph, example, or upstream prompt is never enough support for a claim.
6. Register user-facing results as versioned artifacts and link evidence ids,
   code, inputs, logs, environment, viewer metadata, messages, and review
   notes when available.
7. Promote conclusions to claims only after the evidence/artifact/provenance
   chain exists; otherwise label them `hypothesis`.
8. Publish through the Science report so the artifact graph, warnings,
   citations, and open pages are inspectable from the preview frame.

For AERS routing, start with `aer-auto-empirical-research-skills` when the
method is unclear, then load the selected child `aer-*` skill. Do not
recursively read the full vendored AERS repository.

## Display Discipline

Pages are part of the artifact graph. The agent may add or focus pages, but
should not close user-opened pages unless the user explicitly authorized it.

Use `displayIntent="background"` for routine updates, `open` for new important
results, and `focus` when the user should inspect an already-open object.

## Finalization

Before the final visible answer, call `science_artifact(action="publish")`.
Keep final prose short and let the Science panel carry the report, artifact
ledger, and provenance.
