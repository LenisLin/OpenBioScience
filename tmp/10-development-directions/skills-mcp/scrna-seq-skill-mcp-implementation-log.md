# scRNA-seq Skill/MCP Implementation Log

本文档记录第一批 scRNA-seq skills 与 MCP control-plane 的实际落地状态。它是 `scrna-seq-skill-mcp-plan.md` 的实施日志，不替代正式 PRD。

## Implemented Scope

### Handwritten Bio Skills

已新增第一批手写 `bio-*` scRNA-seq runbook skills：

| Skill                             | Role                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `bio-omics-reproduction-planning` | omics 文章/demo 复现执行前规划；paper/source/data/code/reference audit、可复现范围、execution module 与 script boundary |
| `bio-scrna-reproduction`          | scRNA-seq 文章/demo 复现总路由                                                                                          |
| `bio-environment-routing`         | `environmentRef` 选择、环境 index/resolver 边界                                                                         |
| `bio-data-resolution`             | 本地数据、accession、数据 manifest 与下载阻塞判断                                                                       |
| `bio-singlecell-import`           | 输入格式、raw/processed matrix 语义、metadata join 判断                                                                 |
| `bio-qc-preprocess`               | QC、normalization、doublet/ambient/cell-cycle/ribo/mito 决策                                                            |
| `bio-batch-dim-cluster`           | batch correction、PCA/UMAP/t-SNE、clustering 与 resolution 评估                                                         |
| `bio-marker-optimization`         | marker ranking、sample-aware marker、gene ID 风险                                                                       |
| `bio-cell-annotation`             | marker/atlas/paper evidence 的 annotation runbook                                                                       |
| `bio-scrna-plotting`              | scRNA-seq plot template、style、manifest 与 artifact contract                                                           |
| `bio-result-interpretation`       | supported / conditional / blocked claim boundary                                                                        |

`resources/skills/singlecell/SKILL.md` 已更新为入口 router，明确这些 `bio-*` skills 是手写 runbooks，不由 generated manifest 或 `scienceSkills.generated.ts` 管理。完整 paper/demo 复现、source/data/code audit 或 figure/panel feasibility 先进入 `bio-omics-reproduction-planning`；已有 Planning Package 中的 scRNA-seq scoped module 再进入 `bio-scrna-reproduction`。

### Built-in Bio MCP Profiles

已新增一个共享 built-in MCP bundle：

```text
packages/desktop/src/process/resources/builtinMcp/bioServer.ts
packages/desktop/src/process/resources/builtinMcp/bio/catalog.ts
out/main/builtin-mcp-bio.js
```

它通过 `OPENBIOSCIENCE_BIO_MCP_PROFILE` 暴露五个独立 server profile：

| Server                         | Tool               | Profile        | Current capability                                                                                                                                                  |
| ------------------------------ | ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openscience-bio-runtime`      | `bio_runtime`      | `runtime`      | status、environment catalog、environment resolution、workflow validation、plot template listing、output summary skeleton                                            |
| `openscience-bio-source`       | `bio_source`       | `source`       | accession triage、local asset verification、download planning、data manifest skeleton                                                                               |
| `openscience-bio-knowledge`    | `bio_knowledge`    | `knowledge`    | marker/atlas/gene-set/LR/ortholog lookup contract skeleton                                                                                                          |
| `openscience-bio-plot`         | `bio_plot`         | `plot`         | local plot template catalog、plot input validation、render plan、plot output summary skeleton                                                                       |
| `openscience-bio-reproduction` | `bio_reproduction` | `reproduction` | paper/omics reproduction planning coordinator；source package、lightweight localization planning、source audit、reproduction plan draft、script-boundary validation |

当前 MCP 仍是 control-plane / contract skeleton，不执行重分析、不下载大文件、不做真实 marker database 查询。`bio_reproduction` 也不执行脚本、不安装包、不 clone repository、不宣称复现成功；`localize_source_package` 当前只做安全校验和 planned-only 结构化返回，不做真实网络下载或文件写入。后续需要把 runner、provider 和数据源接入这些 profile。

### Paper/Omics Reproduction Planning Layer

已新增 `resources/skills/bio-omics-reproduction-planning/`：

```text
resources/skills/bio-omics-reproduction-planning/
  SKILL.md
  references/
    reproduction-plan-template.md
    source-audit-schema.md
    lightweight-localization-policy.md
    modality-routing-notes.md
```

该 skill 是执行前规划层，默认输出 Planning Package：

```text
case_reproduction/
  planning/
    reproduction_plan.md
    source_audit.json
    localized/
```

其边界：

- 只做 paper/source/data/code/reference availability audit、可复现范围、execution module 和 script boundary。
- 不写正式脚本、不运行分析、不安装包、不声明复现成功。
- 全部后续执行需要通过下游 modality skill、`bio_runtime` runner 或人工批准的脚本阶段。
- `source_audit.json` 与 MCP 返回统一使用 `openbioscience.omics_reproduction.source_audit.v1` 和 `ready`、`partial_ready`、`conditional_continue`、`planned_only`、`blocked_for_localization`、`blocked_for_execution`、`unresolved`、`fatal_block` 状态词。

`bio_reproduction` MCP 已实现六个 planning actions：

| Action                         | Current behavior                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `status`                       | 返回 reproduction profile、actions、planning-only 与 localization policy                 |
| `build_source_package`         | 聚合 paper/methods/data/code/accession/link/local path，返回 source package draft        |
| `localize_source_package`      | 校验 URL、outputDir、target path、50MB 上限、overwrite/credential 风险；不下载、不写文件 |
| `audit_data_code_availability` | 返回与 skill reference 对齐的 `source_audit.json` skeleton                               |
| `draft_reproduction_plan`      | 返回 `reproduction_plan.md` section/module/script-boundary skeleton                      |
| `validate_reproduction_plan`   | 检查 plan/audit/source readiness/module route 是否足够进入脚本阶段                       |

已补安全边界：

- `safeAbsolutePathStatus`、`safeOutputDirectoryStatus`、`safeChildPathStatus` 均处理 symlink escape。
- URL 校验拒绝 non-HTTP(S)、localhost/internal hostname、private/loopback/link-local/mapped IPv4/IPv6 literal。
- source package 和 source audit 会 redacts credential-like fields，例如 token、cookie、password、secret、apiKey、authorization。
- `validate_reproduction_plan` 不再仅凭存在 module 就允许 script stage；必须有 planning files、source readiness 或 approved existing data、environmentRef、skillRoute、mcpRoute、expectedOutputs 和 script-ready sourceStatus。

## Registration

已接入：

- desktop bootstrap migration: `packages/desktop/src/process/utils/runBackendMigrations.ts`
- standalone WebUI MCP catalog: `scripts/webui.ts`
- bundled MCP build: `scripts/build-mcp-servers.js`
- packaged asar unpack list: `packages/desktop/electron-builder.yml`
- common/process constants: `storage.ts` 与 `builtinMcp/constants.ts`

实现方式：五个 server profile 共用 `builtin-mcp-bio.js`，通过 profile env 区分暴露的 MCP tool。这样保持每个流程独立的 server name/tool，同时避免在 `builtinMcp/` 同级目录复制大量 server 文件。

## Validation

已通过：

```bash
bun run test -- tests/unit/bootstrap/runBackendMigrations.test.ts tests/unit/process/bioMcpCatalog.test.ts tests/unit/common/scienceSkillPack.test.ts
bunx tsc --noEmit
node scripts/build-mcp-servers.js
```

本轮 paper/omics reproduction planning 层新增验证：

```bash
bun run test -- tests/unit/process/bioMcpCatalog.test.ts tests/unit/process/bioMcpServer.test.ts tests/unit/bootstrap/runBackendMigrations.test.ts tests/unit/bootstrap/syncCodexOpenScienceMcpConfig.test.ts tests/unit/renderer/guidModeCapabilities.test.ts
bunx tsc --noEmit --pretty false
bunx oxfmt --check <touched files>
python /home/lenislin/.codex/skills/.system/skill-creator/scripts/quick_validate.py resources/skills/bio-omics-reproduction-planning
python /home/lenislin/.codex/skills/.system/skill-creator/scripts/quick_validate.py resources/skills/bio-scrna-reproduction
git diff --check
```

结果：

- targeted unit tests: 5 files passed, 35 tests passed.
- TypeScript typecheck passed.
- touched-file formatting check passed.
- both skill folders passed `quick_validate.py`.
- `git diff --check` passed.

测试覆盖：

- `bio-*` 不进入 generated science skill manifest 的现有测试仍通过。
- Bio MCP catalog 不包含 `/mnt/NAS` 开发路径。
- Desktop migration 会导入五个 bio MCP server profile。
- Codex/OpenScience MCP config sync 覆盖 `openscience-bio-reproduction`。
- Science mode selectable MCP 覆盖 `openscience-bio-reproduction`。
- `bio_reproduction` source audit schema、script-boundary validation、URL/path/symlink safety、credential redaction 和 50MB lightweight localization policy 均有 targeted unit tests。
- TypeScript 编译通过。

## Current Implementation Matrix

paper/omics reproduction planning 层的文件级实现矩阵、具体实现要求、兼容性要求和参考规范已收敛到：

- `tmp/10-development-directions/skills-mcp/omics-reproduction-planning-skill-mcp-plan.md`

该矩阵当前覆盖：

- `bio-omics-reproduction-planning` skill 与 references。
- `bio_reproduction` MCP profile、actions、path/URL safety、desktop/WebUI/UI 注册面。
- source audit schema、planning package、script boundary validation 和 lightweight localization policy。
- 必须参考的 OpenBioScience skill 模板、CS/MCP 风格研究、AGENTS.md 项目边界、现有 Bio MCP 代码和 targeted tests。

## Remaining Work

- 使用 `human_CRC` demo case dry-run `bio-omics-reproduction-planning` + `bio_reproduction`，生成第一份 Planning Package。
- 把 official environment index 变成 `bio_runtime` 可查询的正式 resolver。
- 为 `bio_runtime` 增加真实 matrix/object inspection、workflow runner、log/output summary。
- 为 `bio_source` 接入 GEO/SRA/ArrayExpress/EGA/BioStudies/Zenodo/Figshare 的受控查询与下载计划。
- 为 `bio_knowledge` 接入 marker、atlas、gene set、LR database provider，并记录第三方来源和版本。
- 为 `bio_plot` 接入 `sc-r-plot` 脚本、plot manifest、thumbnail/caption 与 `science_artifact` 注册草稿。
- 用 `human_CRC` demo case 验证第一条最小 reproduction path。
