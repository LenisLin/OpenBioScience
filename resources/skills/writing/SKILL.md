---
name: openscience-writing
description: Router for scientific writing, literature review, PDF exploration, manuscript/report generation, figure polish, citation checking, LaTeX, slides, and reviewer-facing revisions in Science Mode.
---

# OpenScience Writing Router

Use this skill when the task is primarily about literature synthesis, writing,
figures, tables, reports, manuscripts, LaTeX, PDF reading, citations, review,
rebuttal, or presentation material.

## Merge Map

Prefer one narrow route:

- Literature scouting/review: `ds-scout`, `ds-write`,
  `kdense-literature-review`, `kdense-paper-lookup`,
  `kdense-citation-management`.
- Manuscript architecture: `ds-paper-outline`, `ds-write`,
  `ds-nature-polishing`, `ds-nature-data`, `nature-writing`,
  `nature-polishing`.
- Independent review/rebuttal: `ds-review`, `ds-rebuttal`,
  `nature-reviewer`, `nature-response`, `kdense-peer-review`.
- Figures and tables: `ds-nature-figure`, `ds-figure-polish`,
  `ds-paper-plot` as a quarantined template reference, `kdense-matplotlib`,
  `kdense-seaborn`, `kdense-scientific-visualization`.
- PDF and format work: use the normal file/runtime tools and register source,
  conversion logs, and outputs as artifacts.
- Slides/posters: `ds-nature-paper2ppt`, `kdense-scientific-slides`,
  `nature-paper2ppt`.
- Claude Science helper routes: `cs-pdf-explore`, `cs-figure-style`,
  `cs-figure-composer`, `cs-paper-narrative`, `cs-indication-dossier`.

## SOP

1. Decide whether the output is a report, manuscript, figure, table, PDF,
   slide deck, or review package.
2. Choose one route first; add a second only when there is a real stage change.
3. Use `research_evidence` for literature/database claims.
4. Register citations, PDFs, extracted passages, figure sources, tables,
   LaTeX source, compile logs, and generated PDFs as evidence/artifacts.
5. Use artifact `version` for revised figures/manuscripts and snapshot the
   source plus rendered output.

## Boundaries

Writing skills provide workflow and style guidance. They are never evidence by
themselves. Claims still need evidence ids and claim types.
