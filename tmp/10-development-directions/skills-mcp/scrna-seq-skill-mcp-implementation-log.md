# scRNA-seq Skill/MCP Implementation Log

本文档记录第一批 scRNA-seq skills 与 MCP control-plane 的实际落地状态。它是 `scrna-seq-skill-mcp-plan.md` 的实施日志，不替代正式 PRD。

## Implemented Scope

### Handwritten Bio Skills

已新增第一批手写 `bio-*` scRNA-seq runbook skills：

| Skill | Role |
| --- | --- |
| `bio-scrna-reproduction` | scRNA-seq 文章/demo 复现总路由 |
| `bio-environment-routing` | `environmentRef` 选择、环境 index/resolver 边界 |
| `bio-data-resolution` | 本地数据、accession、数据 manifest 与下载阻塞判断 |
| `bio-singlecell-import` | 输入格式、raw/processed matrix 语义、metadata join 判断 |
| `bio-qc-preprocess` | QC、normalization、doublet/ambient/cell-cycle/ribo/mito 决策 |
| `bio-batch-dim-cluster` | batch correction、PCA/UMAP/t-SNE、clustering 与 resolution 评估 |
| `bio-marker-optimization` | marker ranking、sample-aware marker、gene ID 风险 |
| `bio-cell-annotation` | marker/atlas/paper evidence 的 annotation runbook |
| `bio-scrna-plotting` | scRNA-seq plot template、style、manifest 与 artifact contract |
| `bio-result-interpretation` | supported / conditional / blocked claim boundary |

`resources/skills/singlecell/SKILL.md` 已更新为入口 router，明确这些 `bio-*` skills 是手写 runbooks，不由 generated manifest 或 `scienceSkills.generated.ts` 管理。

### Built-in Bio MCP Profiles

已新增一个共享 built-in MCP bundle：

```text
packages/desktop/src/process/resources/builtinMcp/bioServer.ts
packages/desktop/src/process/resources/builtinMcp/bio/catalog.ts
out/main/builtin-mcp-bio.js
```

它通过 `OPENBIOSCIENCE_BIO_MCP_PROFILE` 暴露四个独立 server profile：

| Server | Tool | Profile | Current capability |
| --- | --- | --- | --- |
| `openscience-bio-runtime` | `bio_runtime` | `runtime` | status、environment catalog、environment resolution、workflow validation、plot template listing、output summary skeleton |
| `openscience-bio-source` | `bio_source` | `source` | accession triage、local asset verification、download planning、data manifest skeleton |
| `openscience-bio-knowledge` | `bio_knowledge` | `knowledge` | marker/atlas/gene-set/LR/ortholog lookup contract skeleton |
| `openscience-bio-plot` | `bio_plot` | `plot` | local plot template catalog、plot input validation、render plan、plot output summary skeleton |

当前 MCP 仍是 control-plane / contract skeleton，不执行重分析、不下载大文件、不做真实 marker database 查询。后续需要把 runner、provider 和数据源接入这些 profile。

## Registration

已接入：

- desktop bootstrap migration: `packages/desktop/src/process/utils/runBackendMigrations.ts`
- standalone WebUI MCP catalog: `scripts/webui.ts`
- bundled MCP build: `scripts/build-mcp-servers.js`
- packaged asar unpack list: `packages/desktop/electron-builder.yml`
- common/process constants: `storage.ts` 与 `builtinMcp/constants.ts`

实现方式：四个 server profile 共用 `builtin-mcp-bio.js`，通过 profile env 区分暴露的 MCP tool。这样保持每个流程独立的 server name/tool，同时避免在 `builtinMcp/` 同级目录复制大量 server 文件。

## Validation

已通过：

```bash
bun run test -- tests/unit/bootstrap/runBackendMigrations.test.ts tests/unit/process/bioMcpCatalog.test.ts tests/unit/common/scienceSkillPack.test.ts
bunx tsc --noEmit
node scripts/build-mcp-servers.js
```

测试覆盖：

- `bio-*` 不进入 generated science skill manifest 的现有测试仍通过。
- Bio MCP catalog 不包含开发机 NAS 绝对路径。
- Desktop migration 会导入四个 bio MCP server profile。
- TypeScript 编译和 MCP bundle 构建通过。

## Remaining Work

- 把 official environment index 变成 `bio_runtime` 可查询的正式 resolver。
- 为 `bio_runtime` 增加真实 matrix/object inspection、workflow runner、log/output summary。
- 为 `bio_source` 接入 GEO/SRA/ArrayExpress/EGA/BioStudies/Zenodo/Figshare 的受控查询与下载计划。
- 为 `bio_knowledge` 接入 marker、atlas、gene set、LR database provider，并记录第三方来源和版本。
- 为 `bio_plot` 接入 `sc-r-plot` 脚本、plot manifest、thumbnail/caption 与 `science_artifact` 注册草稿。
- 用 `human_CRC` demo case 验证第一条最小 reproduction path。
