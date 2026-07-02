# Third-Party Notices

This file records important upstream and third-party notices for the OpenScience distribution. It is not a full legal audit. Before a public or commercial release, review all dependencies, vendored resources, generated assets, and data connectors again.

## Upstream Desktop Foundation

| Component | Source | License | Notice |
|---|---|---|---|
| AionUi | <https://github.com/iOfficeAI/AionUi> | Apache-2.0 | Copyright 2025 AionUi (aionui.com) |
| DeepOrganiser lineage notice | Preserved from this repository's previous root `LICENSE` | Apache-2.0 | Copyright 2025 DeepOrganiser (deepscientist.cc) |

OpenScience is a modified work based on AionUi. Starting from this fork/distribution, OpenScience is distributed under AGPL-3.0-only, except for third-party components and files that carry separate license notices. The original Apache-2.0 license text is preserved in `LICENSES/Apache-2.0.txt`.

## Modification Statement

Major OpenScience changes include rebranding, Science Mode planning, research-project workflows, Medical Evidence Mode, evidence-labeled report surfaces, scientific artifact preview concepts, localized README files, generated brand assets, local MCP/tooling plans, and research workflow integrations.

Representative modified or added areas include:

| Path | Modification type |
|---|---|
| `readme.md` | OpenScience README, product positioning, license notice |
| `docs/readme/` | Localized OpenScience README files |
| `docs/specs/science-mode-architecture.zh-CN.md` | Science Mode architecture and checklist |
| `resources/readme/` | README product screenshots and diagrams |
| `resources/openscience-logo.*` | OpenScience brand assets |
| `packages/desktop/src/common/chat/` | Research, evidence, and science-mode chat configuration work |
| `packages/desktop/src/common/config/` | Research/evidence configuration work |
| `packages/desktop/src/process/resources/builtinMcp/` | Built-in MCP server integrations |
| `packages/desktop/src/renderer/pages/conversation/` | Conversation, preview, evidence, and artifact UI work |
| `packages/desktop/src/renderer/pages/settings/` | Settings UI for research/evidence features |

For the exact file-level history, compare this fork against the relevant upstream AionUi revision and inspect the git history of this repository.

## Runtime Dependencies

The root `package.json` uses third-party npm packages under their own licenses. A quick local package metadata scan found mostly MIT dependencies, plus Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, and one dependency package with unspecified metadata. Each package remains governed by its own license.

Important examples include:

| Package family | License metadata seen locally |
|---|---|
| React, many frontend utilities | MIT |
| Model and protocol SDKs | Apache-2.0 or vendor-specific terms, depending on package |
| Build and Electron tooling | MIT, Apache-2.0, ISC, BSD variants |

Do not treat this table as a complete dependency clearance report. Regenerate a dependency license report before publishing release artifacts.

## Vendored Research Skills And Resources

This repository includes or may include vendored research skills under `resources/skills/vendor/`. These resources are especially mixed and should be treated as optional third-party material until reviewed.

Observed license metadata includes:

| Vendor area | License notes |
|---|---|
| `resources/skills/vendor/deepscientist-1.6.0/` | Apache-2.0 project metadata; bundled dependencies and templates require their own review |
| `resources/skills/vendor/scientific-agent-skills/` | Repository-level MIT license, but individual skills declare different licenses |
| `resources/skills/vendor/auto-empirical-research-skills/` | CC-BY-SA-4.0, Copyright (c) 2026 CoPaper.AI |
| Individual scientific-agent skills | MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, GPL-2.0, GPL-3.0, CeCILL, CC-BY, CC-BY-NC/CC-BY-NC-SA, Proprietary, Unknown, and unspecified metadata appear in local skill files |
| Materialized OpenScience `aer-*` skills | Adapted from Auto-Empirical Research Skills. OpenScience changes include normalized frontmatter, first-class skill ids, adapter SOP text, provenance/risk metadata, and a generated manifest. These adapted skill contents are distributed under CC-BY-SA-4.0 ShareAlike terms. |

Some skill files mention proprietary services, proprietary file formats, non-commercial datasets, commercial database access, or API-key-gated services. Users and redistributors must check the license and terms for each skill, database, dataset, connector, and service before enabling it in a release or commercial environment.

Auto-Empirical Research Skills license notice:

- Creative Commons Attribution-ShareAlike 4.0 International
- Copyright (c) 2026 CoPaper.AI
- Full license text: <https://creativecommons.org/licenses/by-sa/4.0/legalcode>
- Source repository: <https://github.com/brycewang-stanford/Auto-Empirical-Research-Skills>
- Changes made in OpenScience: curated materialization into `resources/skills/aer-*`, OpenScience Adapter instructions, generated source/provenance metadata, execution-policy classification, and settings/report integration.

## Generated And External Assets

Generated images, icons, and README screenshots in this repository are OpenScience project assets unless a file states otherwise. External logos, screenshots, upstream marks, and service names remain the property of their respective owners.

## No Upstream Endorsement

The presence of an upstream notice does not imply endorsement. AionUi, iOfficeAI, DeepOrganiser, DeepScientist, and any third-party project or vendor named here do not endorse OpenScience unless expressly stated.
