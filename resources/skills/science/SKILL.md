---
name: openscience-science
description: Default OpenScience Science Mode discipline for scientific work. Use real execution for computation, then use research_evidence and science_artifact to make results reproducible, citeable, and inspectable.
---

# OpenScience Science

Use this skill for scientific conversations that involve data, software,
experiments, literature/database evidence, figures, tables, notebooks,
manuscripts, or scientific claims.

## Contract

- Run real work through the normal runtime: shell, Python, R, LaTeX, notebooks,
  project pipelines, SSH, or explicitly authorized remote tools.
- Use `research_evidence` for paper/database/PaperClip search and reading.
- Use `science_artifact` for artifact ids, evidence, claims, pages, versions,
  snapshots, publication, and Preview focus.
- Use `openscience-science-artifact` for the exact artifact MCP protocol.
- Use the default router skills to select narrow leaf skills. Do not load or
  cite vendored skill text as evidence.
- Concrete results must enter the artifact graph before the final answer.

## Minimal SOP

1. Restate the research objective, project root, deliverables, selected router
   skills, and assumptions.
2. Search/read or inspect inputs before making claims.
3. Execute the analysis or compilation in the real runtime.
4. Register evidence for source data, database records, papers, commands, logs,
   generated files, environments, and user decisions.
5. Create or version user-visible artifacts: figures, tables, datasets,
   notebooks, manuscripts, PDFs, HTML pages, native viewer objects, or run
   bundles.
6. Snapshot files needed for inspection or reproducibility.
7. Publish a Science report in the existing Preview frame.

## Claim Discipline

Every answer-bearing claim must be one of:

- `computed`: produced by a real run in the current project.
- `parsed`: read from user files, papers, database records, or metadata.
- `digitized`: extracted from a figure, PDF, screenshot, or selected region.
- `hypothesis`: plausible but not verified.

Computed claims need linked inputs, code, command/log, output artifact, and
environment whenever those exist. A viewer rendering is not evidence by itself;
claims about function, binding, causality, mechanism, or significance need
database, literature, computation, validation, or user-input evidence.

## Artifact Discipline

- Reserve stable ids before referencing important artifacts.
- Get the current object before patching and pass `baseRevision`.
- Use `version` for regenerated visible outputs.
- Keep old versions inspectable unless the user explicitly asks otherwise.
- Snapshot source paths, output paths, code, logs, configs, LaTeX sources,
  notebooks, small derived tables, viewer configs, and other supporting files.
- Assign file roles deliberately: `primary`, `preview`, `input`, `source`,
  `code`, `log`, `output`, `environment`, or `reference`.
- Do not include secrets. Large data may be represented by pointer, hash, size,
  and reason.

## Viewer Discipline

Use native viewer metadata only when it improves scientific inspection,
annotation, editing, or reproducibility:

- structures and molecules: 3Dmol/Mol\* or Ketcher;
- genome tracks: IGV with indexes and reference/QC evidence;
- single-cell/spatial workspaces: Vitessce only after conversion/configuration;
- alignments: MSA viewer with parser/format validation;
- empirical outputs: regression tables, model diagnostics, causal DAGs,
  codebooks, maps, qualitative coding ledgers, or replication packages.

Exact payload shapes live in `openscience-science-artifact`.

## External Skill Discipline

- `openscience-workflow` routes DeepScientist research stages.
- `openscience-writing` routes literature, figure, report, manuscript, LaTeX,
  citation, review, and presentation work.
- `openscience-databases` routes paper and public scientific database lookup.
- `openscience-biomodels` routes protein, molecular, docking, and model
  endpoint tasks.
- `openscience-singlecell` routes single-cell, spatial omics, AnnData, Scanpy,
  scVI/scGPT, and Vitessce workflows.
- `openscience-compute` routes environment, remote compute, GPU/HPC, Modal, and
  package setup decisions.
- `openscience-empirical` routes social-science, econometrics, causal,
  survey/qualitative, and replication-package work.

Record selected external leaf skills as `skill_use` when they affect a visible
result. Clinical advice, diagnosis, treatment, patient-facing reports, and
clinical decision support should route to Medical Evidence Mode when possible.
