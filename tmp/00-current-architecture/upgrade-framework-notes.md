# OpenBioScience Upgrade Framework Notes

This note records the initial local framework inventory for discussing the
upgrade from OpenScience toward a more professional bio-focused version.

## Summary

This repository is not a pure frontend project. It is a combination of an
Electron/React desktop shell, standalone WebUI, bundled Rust backend binary,
local MCP servers, and a distributed scientific skill library.

The product branding has largely moved toward `OpenScience`, while internal
packages and runtime names still retain `DeepOrganiser` and
`deeporganiser-core`. These naming layers should be handled separately during
any bio-version upgrade.

## Overall Architecture

- Root project: `OpenScience`, Bun workspace, version `0.1.2`.
- Desktop: Electron + React 19.
  - Main entry: `packages/desktop/src/index.ts`.
  - Renderer entry: `packages/desktop/src/renderer/main.tsx`.
- WebUI: `@deeporganiser/web-host`, serving the renderer bundle and proxying
  `/api/*`, `/ws`, and streaming endpoints.
- Backend business core: prebuilt Rust binary `deeporganiser-core`, launched by
  `packages/web-host/src/backend-launcher.ts`.
- Local resource note: no actual files were observed under
  `resources/bundled-deeporganiser-core` during this inspection, so the local
  backend bundle may not be prepared for runtime launch.

## Frontend and UI

- UI stack: React 19, Arco Design, UnoCSS, React Router, i18n.
- Main routes are defined in
  `packages/desktop/src/renderer/components/layout/Router.tsx`.
- Major routes/pages:
  - `/guid`: task start / mode selection / agent send entry.
  - `/conversation/:id`: conversation workspace.
  - `/settings/*`: model, capabilities, skills, science, medical evidence,
    compute, appearance, WebUI, diagnostics, system.
  - `/scheduled`: cron/scheduled tasks.
  - `/collaboration/*`: collaboration workspace.
  - `/lark-projects/*`: Lark project agent workflow.
- Existing research/science UI surfaces include:
  - `ScienceReportPanel`.
  - `MedicalEvidencePanel`.
  - `LabSkillDepositionPanel`.
  - `ScienceArtifactWorkspace`.
  - file preview workspace.
  - molecular/structure preview.
- The molecular structure preview dynamically loads `3dmol`.
- The Ketcher-related preview currently appears closer to a
  "Ketcher-ready" placeholder surface than a full embedded chemical editor.

## Frontend and Backend Boundary

- Renderer code mostly calls typed wrappers in
  `packages/desktop/src/common/adapter/ipcBridge.ts`.
- Most business APIs are HTTP/WebSocket wrappers over `deeporganiser-core`:
  providers, agents, conversations, messages, MCP, cron, teams, remote agents,
  extensions, channels, and settings.
- Electron IPC is still used for desktop-local capabilities:
  - file dialogs, shell/window/update operations;
  - Lark automation;
  - Lark project agent;
  - Codex memory;
  - medical evidence report local store;
  - science artifact report local store;
  - SSH compute host management;
  - LaTeX compile helper;
  - artifact archive/history/export.

## Agent Layer

- Supported runtime/agent categories include ACP, remote, custom agent, Codex,
  OpenClaw, Nanobot, and extension-contributed adapters.
- Agent metadata and management are routed through `/api/agents`.
- Team mode is routed through `/api/teams/*` and includes agent sessions,
  child turns, status events, and WebSocket events.
- Guid send logic attaches mode-specific prompts, default skills, and MCP
  servers before creating conversations.

Key files:

- `packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts`
- `packages/desktop/src/renderer/pages/guid/utils/modeCapabilities.ts`
- `packages/desktop/src/common/adapter/ipcBridge.ts`

## Built-in MCP / Science Harness

The project ships built-in MCP stdio servers. They are bundled by
`scripts/build-mcp-servers.js`.

Current built-in MCP servers:

- `openscience-research-evidence`
  - Unified evidence retrieval for PaperClip and `bio_tools`.
  - Declares/configures aliases for PubMed, ChEMBL, GEO, AlphaFold, and other
    scientific database tools when configured; actual availability still needs
    provider-level `status/list_tools/search/read/call` verification in dev,
    packaged Electron, and WebUI.
- `openscience-science-artifact`
  - Manages artifact graph, evidence, claims, pages, versions, snapshots, and
    publishing.
  - Writes project-scoped science artifact state under `.openscience`.
- `openscience-medical-evidence`
  - Structured medical evidence panel and report model.
- `openscience-lab-skill`
  - Converts selected conversation/project evidence into reviewable skill
    drafts.
- `openscience-image-generation`.
- `openscience-lark-project-agent`.
- `openscience-user-input`.

Important source files:

- `packages/desktop/src/process/resources/builtinMcp/researchEvidenceServer.ts`
- `packages/desktop/src/process/resources/builtinMcp/scienceArtifactServer.ts`
- `packages/desktop/src/process/resources/builtinMcp/medicalEvidenceServer.ts`
- `packages/desktop/src/process/resources/builtinMcp/labSkillServer.ts`

## Science Mode Contract

Science Mode is a core reusable basis for a bio-focused version. Its prompt and
skill contract require:

- real execution through shell, Python, R, LaTeX, notebooks, or project
  pipelines;
- `research_evidence` for papers, database records, and scientific retrieval;
- `science_artifact` for evidence, claims, artifacts, pages, versions,
  provenance, snapshots, and published reports;
- structured claim typing: computed, parsed, digitized, or hypothesis;
- artifact publication before the final user-visible answer unless the user
  explicitly asks for chat-only brainstorming.

Current Science Mode is general scientific infrastructure. Bio is represented
as routers and skill packs rather than a separate first-class product layer.

## Skill System

- Product-distributed skills live under `resources/skills`.
- Excluding `resources/skills/vendor`, there are about 382 top-level
  distributed skills.
- Including vendor subtrees, there are about 1717 `SKILL.md` files.
- Major skill families:
  - `kdense-*`: scientific, biomedical, computational, and package-specific
    skills.
  - `aer-*`: empirical research, econometrics, social-science, and paper
    workflow skills.
  - `ds-*`: DeepScientist-style research workflow stages.
  - `nature-*`: scientific writing, figure, review, and Nature-style
    production workflows.
  - router/core skills: `science`, `science-artifact`, `workflow`, `databases`,
    `biomodels`, `singlecell`, `compute`.

Bio-relevant existing skill areas include:

- single-cell and omics: `singlecell`, `kdense-anndata`,
  `kdense-scanpy`, `kdense-scvi-tools`, `kdense-scvelo`,
  `kdense-cellxgene-census`, `kdense-pydeseq2`, `kdense-pysam`,
  `kdense-polars-bio`;
- biological databases: `databases`, `kdense-bioservices`, `kdense-gget`,
  `kdense-depmap`, `kdense-primekg`;
- protein and biomolecular modeling: `biomodels`, `kdense-biopython`,
  `kdense-esm`, `kdense-diffdock`, `kdense-molecular-dynamics`;
- chemistry and drug discovery: `kdense-rdkit`, `kdense-datamol`,
  `kdense-deepchem`, `kdense-medchem`, `kdense-molfeat`;
- clinical/medical: `kdense-clinical-decision-support`,
  `kdense-clinical-reports`, plus Medical Evidence Mode and PaperClip-related
  retrieval.

## Testing and Harness

- Unit and DOM tests use Vitest.
  - Node tests: `tests/unit/**/*.test.ts`,
    `tests/integration/**/*.test.ts`, `tests/regression/**/*.test.ts`.
  - DOM tests: `tests/unit/**/*.dom.test.ts(x)` under jsdom.
  - Config: `vitest.config.ts`.
- E2E uses Playwright with an Electron singleton app instance.
  - Config: `playwright.config.ts`.
  - Fixture entry: `tests/e2e/fixtures.ts`.
- Fixtures include:
  - fake ACP CLI;
  - fake extension;
  - helpers for conversations, HTTP bridge, permissions, navigation, teams,
    skills hub, and extension flows.
- Existing E2E coverage includes app launch, ACP conversation, agent settings,
  assistant settings, channels, cron, extensions, hub install, loop goal,
  navigation, team mode, and WebUI.

## Mobile

There is a separate `mobile/` project with Expo/React Native-style structure,
connection contexts, API/WebSocket services, message adaptation, workspace
utilities, and Jest tests. It appears secondary to the current Electron/WebUI
mainline.

## Initial Upgrade Interpretation

The current repository already has a strong generic Science Mode foundation and
partial biomedical/clinical evidence capability. For a professional
BioScience-focused version, the main architectural question is not whether the
base can support bio workflows. It can. The question is which parts should
become first-class Bio product surfaces rather than remaining generic Science
Mode routes.

Likely upgrade axes:

- Bio-specific default mode and onboarding.
- Bio-specific UI surface in Guid and result workspace.
- Bio-focused default agent/skill/MCP selection.
- Stronger evidence-source routing for PubMed, GEO, AlphaFold, ChEMBL,
  ClinVar, Ensembl, PDB, UniProt, CellxGene, and related sources.
- Native artifact viewers for structures, molecules, genome tracks,
  single-cell/spatial omics, alignments, and clinical evidence tables.
- Clear distinction between research/education output and clinical decision
  support boundaries.
- Reproducibility-first run bundles for bioinformatics pipelines.
