# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## [LRN-20260719-003] correction

**Logged**: 2026-07-19T11:27:00+08:00
**Priority**: high
**Status**: pending
**Area**: mcp

### Summary
Do not expose full sha256 values in skill/MCP context unless integrity debugging requires them.

### Details
Hashes are useful in machine manifests for reproducibility and file integrity, but they consume context and are not biologically useful for routine agent reasoning. Skills and MCP summaries should default to compact provenance: resource id, collection, species, path, version/status, license/terms, and counts. Full hashes can stay in manifest files or be returned only by explicit detail actions.

### Suggested Action
Keep resource hashes in local manifest JSON/index files; remove hash requirements from prompt/skill wording and shrink `bio_knowledge` default action payloads.

### Metadata
- Source: user_feedback
- Related Files: resources/skills/bio-analysis-script-authoring/SKILL.md, resources/skills/science-artifact/SKILL.md, packages/desktop/src/process/resources/builtinMcp/bio/knowledgeResources.ts
- Tags: openbioscience, context-hygiene, provenance

---

## [LRN-20260719-002] correction

**Logged**: 2026-07-19T11:16:00+08:00
**Priority**: high
**Status**: pending
**Area**: docs

### Summary
Large public registries such as GEO and ArrayExpress are online discovery/localization services, not resources to mirror wholesale.

### Details
OpenBioScience should keep online search MCPs/skills for GEO, ArrayExpress, SRA, TISCH2, and similar registries. The workflow localizes selected dataset files, accession records/evidence snapshots, and reusable analysis resources such as marker dictionaries or MSigDB GMT files.

### Suggested Action
Use precise workflow language: online database search -> candidate evidence snapshot -> selected-file download/localization -> project-local data manifest. Do not imply full registry localization.

### Metadata
- Source: user_feedback
- Related Files: resources/skills/databases/SKILL.md, resources/skills/bio-omics-analysis/SKILL.md
- Tags: openbioscience, databases, localization

---

## [LRN-20260718-002] correction

**Logged**: 2026-07-18T22:32:19+08:00
**Priority**: high
**Status**: pending
**Area**: backend | skills | tests

### Summary
OpenBioScience script quality must be enforced through MCP contracts, not satisfied by shallow headers and generic Step comments.

### Details
User corrected that the existing script preflight still allowed scripts with contract headers, entrypoint Step comments, and module-level blurbs while missing function-level readability and explicit scientific decision documentation. For bioinformatics exploration, generated scripts must be understandable and auditable by a human: public helper functions need local docstrings/comments, and key scientific choices such as expression semantics, replicate unit, filtering, feature screening, enrichment sources, and blocked contrasts must be traceable to implementation files and outputs.

### Suggested Action
Keep script authoring skills and MCP preflight aligned: require `script_manifest.json.scientificDecisions`, require documented public helper functions in modules, and test that shallow comment scaffolding is rejected.

### Metadata
- Source: user_feedback
- Related Files: resources/skills/bio-analysis-script-authoring/SKILL.md; packages/desktop/src/process/resources/builtinMcp/bio/analysis/preflight.ts; tests/unit/process/bioAnalysisWorkflow.test.ts
- Tags: openbioscience, script-authoring, mcp-preflight, scientific-decisions

---

## [LRN-20260719-001] correction

**Logged**: 2026-07-19T10:24:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend | skills | resources

### Summary
External atlas, marker, TISCH2, and MSigDB knowledge must be localized into resource packages before analysis MCPs consume them.

### Details
User corrected that the implementation should not build runtime analysis skills/MCPs directly on remote external content. The correct product flow is: download/localize external content into declared local resource packages first, validate provenance/license/version/checksums, then build analysis-useful skills and MCP lookup actions on top of those local packages.

### Suggested Action
Separate resource localization from analysis execution. Add local resource manifests, loader contracts, and MCP checks for marker dictionaries and MSigDB GMT roots. Skills should instruct agents to use local resource packages during analysis and only perform web/database access during the resource-localization stage.

### Metadata
- Source: user_feedback
- Related Files: resources/bio; resources/skills; packages/desktop/src/process/resources/builtinMcp/bioServer.ts
- Tags: openbioscience, resource-localization, atlas-markers, msigdb, mcp

---

## [LRN-20260718-001] correction

**Logged**: 2026-07-18T15:30:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend | docs | tests

### Summary
OpenBioScience workflow fixes must change actual MCP/skill behavior and analysis deliverables, not only rephrase shortcomings.

### Details
User corrected that saying the analysis-depth contract was underspecified is not useful by itself. For automated omics exploration, the product must enforce real analysis completeness: clustering, major annotation, marker plots, response-group fraction comparisons, processed-expression differential feature screening when raw counts are unavailable, pathway enrichment, and openable canonical outputs.

### Suggested Action
Encode these minimum deliverables in MCP completion gates, skill requirements, prompts, and tests. Do not present audit-only flows as automated biological exploration unless the input data are unreadable or the necessary design metadata are absent.

### Metadata
- Source: user_feedback
- Related Files: packages/desktop/src/process/resources/builtinMcp/bio/analysis/contracts.ts; packages/desktop/src/process/resources/builtinMcp/bio/analysis/workflow.ts; resources/skills/bio-omics-analysis/SKILL.md; resources/skills/bio-singlecell-baseline/SKILL.md; resources/skills/bio-scrna-differential-expression/SKILL.md
- Tags: openbioscience, omics-analysis, workflow-depth, product-quality

---

## [LRN-20260717-001] best_practice

**Logged**: 2026-07-17T19:52:00+08:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
OpenBioScience WebUI fixes that affect renderer or bundled MCP behavior must rebuild `out/` before relaunching with `--no-build`.

### Details
The running WebUI was started with `--no-build`, so it continued serving stale `out/main` and `out/renderer` bundles after source changes. This preserved old MCP selection and runtime-environment behavior even though the TypeScript sources were fixed.

### Suggested Action
For WebUI runtime fixes, run targeted tests, `bunx tsc --noEmit`, then `bun run package`; verify expected strings or behavior in `out/` before restarting the WebUI with `--no-build`.

### Metadata
- Source: conversation
- Related Files: scripts/webui.ts, out/main, out/renderer
- Tags: webui, build, mcp, openbioscience

---
