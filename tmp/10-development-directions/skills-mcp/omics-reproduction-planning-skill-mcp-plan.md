# Omics Reproduction Planning Skill/MCP Plan

本文档记录 OpenBioScience 在运行 demo case 之前需要补齐的 omics 文献复现规划层。它不是正式 PRD；早期版本用于指导 `bio-omics-reproduction-planning` skill 与 `openscience-bio-reproduction` MCP 的实现，当前版本同时记录第一版已落地内容、后续实现矩阵、实现要求和必须参考的本地规范。

## Background

当前已有第一批 scRNA-seq `bio-*` runbook skills 和四个 Bio MCP control-plane skeleton，但它们主要覆盖单细胞分析链路中的数据、环境、导入、QC、聚类、注释、绘图和解释。真实文献复现还需要一个更上游的规划层，用来先回答：

- 文章、methods、data availability 和 code availability 是否已定位。
- 数据、代码、reference resources 是否可及。
- 论文哪些 claim、figure、panel 或 method unit 可以被当前证据支撑。
- 当前环境、skill、MCP、runner 是否具备实现条件。
- 一个较大的科学链条应如何拆成多个可执行、可验收的任务。

本轮讨论确认：**文献复现规划** 和 **用户数据直接分析规划** 应分开。本文只覆盖 omics 文献复现规划，不覆盖直接分析规划、脚本/code 约束或实际执行 runner。

## Confirmed Decisions

| 决策           | 结论                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| 顶层 skill     | 新增 `bio-omics-reproduction-planning`                                                                        |
| 适用范围       | omics 文章复现规划，包括 scRNA-seq、bulk RNA-seq、spatial transcriptomics/proteomics、scATAC-seq、multiome 等 |
| 文档风格       | 采用 `cs-skill-and-mcp-style-study.md` 中的 Adapter + SOP + provenance discipline                             |
| skill 本体长度 | 目标约 90-115 行，避免长说明书                                                                                |
| 细节承载       | 必要细节放入 `references/`，但第一版避免强制拆出多份矩阵文件                                                  |
| 默认本地化     | 轻量本地化；单文件默认 50MB 上限，更大需要批准                                                                |
| MCP 形态       | 新增 `openscience-bio-reproduction` / `bio_reproduction`                                                      |
| MCP 定位       | planning coordinator，不替代 `bio_source` / `bio_runtime`                                                     |
| 状态语义       | 采用非中断式规划：尽量继续规划，只阻断具体资源或执行单元                                                      |
| 结果实现架构   | 采用轻量两阶段 package：Planning Package -> Execution Package                                                 |
| Planning 输出  | 默认输出一个主计划文件、一个简单审计 JSON 和本地化 source 文件                                                |

## Skill Design

`bio-omics-reproduction-planning` 是执行前规划 skill。它应强触发于以下请求：

- 用户要求复现、审计、拆解或规划一篇 omics 文章。
- 用户要求判断某篇文章哪些内容可以复现。
- 用户提供 PDF、supplement、accession、代码仓库或 demo case，希望先做复现可行性分析。
- 用户要求在执行前拆分多 agent 任务。

它不应承担：

- 用户数据直接分析规划。
- 正式脚本撰写。
- 实际分析执行。
- 包安装、环境修改或任意 shell 执行。
- 最终生物学结论或复现成功声明。

建议 `SKILL.md` 结构：

```text
Frontmatter
Purpose
OpenBioScience Adapter
Execution Policy
Scope
Inputs
Mandatory Stage Flow
Output Contract
Fallback and Stop Rules
Gotchas
Next Routing
```

其中 `OpenBioScience Adapter` 必须声明：

- `openscience-science`、`research_evidence`、`science_artifact`、`bio_reproduction`、`bio_source`、`bio_runtime` 是控制契约。
- skill 是 workflow guidance，不是 evidence。
- paper package、manifest、matrix、plan、decision、warning 都需要注册到 `science_artifact`。
- 上游 paper、code、script 只能作为 source material，不能默认执行。

## Mandatory Stage Flow

`bio-omics-reproduction-planning` 第一版应按下面顺序组织规划，但输出应收敛为一个 planning package，而不是强制拆出多份矩阵文件。Gate 不完整不等于停止整个规划；缺口应降级、标记或阻断对应 execution unit。

| Stage                        | 目标                                                                                         | 写入到哪里                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1. Paper evidence package    | 定位 PDF、supplement、methods、data availability、code availability、核心 figure/table/panel | `planning/reproduction_plan.md`、`planning/localized/` |
| 2. Source audit              | 判断数据、代码和 reference resources 是否可及，以及可及到什么层级                            | `planning/source_audit.json`                           |
| 3. Reproducible scope        | 在主计划中记录 ready / conditional / blocked 范围和降级原因                                  | `planning/reproduction_plan.md`                        |
| 4. Execution module planning | 在主计划中记录任务拆解、environmentRef、skill/MCP route、预期结果                            | `planning/reproduction_plan.md`                        |
| 5. Script boundary           | 明确哪些内容可以进入脚本阶段，哪些需要补数据、补环境或人工批准                               | `planning/reproduction_plan.md`                        |

Planning package 最小结构：

```text
case_reproduction/
  planning/
    reproduction_plan.md
    source_audit.json
    localized/
```

## Progressive Disclosure References

后续实现 skill 时建议配套 references，而不是把所有字段塞入 `SKILL.md`：

```text
resources/skills/bio-omics-reproduction-planning/
  SKILL.md
  references/
    reproduction-plan-template.md
    source-audit-schema.md
    lightweight-localization-policy.md
    modality-routing-notes.md
```

这些 references 用于指导 `reproduction_plan.md` 和 `source_audit.json` 的内容，不要求每个 case 额外生成多份矩阵文件。执行时只在对应 stage 需要细节时读取相关 reference。这样保持入口短、强触发、强约束，同时符合 progressive disclosure。

## MCP Functional Matrix

新增 MCP：

```text
server: openscience-bio-reproduction
tool: bio_reproduction
```

它采用单 server + 单 control-plane tool + `action` enum 风格。

| Action                         | 职责                                                                                                                   | 不承担                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `status`                       | 返回 profile、action、schema、限制和边界说明                                                                           | 不 probe 环境                                |
| `build_source_package`         | 聚合 paper、supplement、methods、data/code availability、accessions、links、local paths，形成 planning package 草案    | 不替代 `bio_source` 底层 accession/path 解析 |
| `localize_source_package`      | 按轻量本地化策略下载/保存允许的小文件和代码索引                                                                        | 不下载重数据、受控访问数据或需要凭据的资源   |
| `audit_data_code_availability` | 生成 `planning/source_audit.json` 草案，覆盖 data、code 和 reference resources                                         | 不把可访问等同于可复现                       |
| `draft_reproduction_plan`      | 生成或校验 `planning/reproduction_plan.md` 的结构，包括复现目标、可复现范围、执行模块、环境/skill/MCP route 和预期输出 | 不写脚本，不运行 workflow                    |
| `validate_reproduction_plan`   | 检查 planning package 是否足够进入脚本边界                                                                             | 不修复计划，不宣称复现成功                   |

## Relationship With Existing MCP

| MCP                 | 职责边界                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `bio_reproduction`  | 复现规划协调器，组织 planning package、source audit、reproduction plan 和 script boundary |
| `bio_source`        | accession、local asset、download plan、data manifest 的底层细查                           |
| `bio_runtime`       | environmentRef、workflow validation、environment probe、output summary 的底层细查         |
| `bio_knowledge`     | marker、atlas、gene set、ligand-receptor、ortholog evidence contract                      |
| `bio_plot`          | plot template、plot input validation、plot artifact manifest                              |
| `research_evidence` | paper、database、source lookup                                                            |
| `science_artifact`  | evidence、artifact、claim、provenance、report 注册                                        |

`bio_reproduction` 可以引用 `bio_source` / `bio_runtime` 的结果，但不应复制它们的底层能力。

## Lightweight Two-Stage IO

第一版结果实现架构采用两个 package，不引入复杂 result contract 文件。

### Planning Package

输入：paper / accession / local demo data / user objective。

输出：

```text
case_reproduction/
  planning/
    reproduction_plan.md
    source_audit.json
    localized/
```

`reproduction_plan.md` 应包含：复现目标、paper/source summary、data/code/reference availability summary、ready / conditional / blocked 范围、planned execution modules、expected outputs、environmentRef candidates、skill/MCP route、execution boundary。

`source_audit.json` 应包含：paper、data、code、referenceResources、localized、plannedOnly、warnings。

### Execution Package

输入：`planning/reproduction_plan.md`、`planning/source_audit.json`、localized data 或已有 demo data、official `environmentRef`。

输出：

```text
case_reproduction/
  execution/
    scripts/
    configs/
    results/
      tables/
      figures/
      objects/
      reports/
    logs/
      execution.log
      review.md
      sessionInfo_R.txt
```

`logs/review.md` 应包含：executed scripts、produced outputs、missing/failed outputs、simple sanity checks、warnings、which results can enter interpretation。

## Lightweight Localization Policy

`localize_source_package` 是第一版唯一允许有副作用的 action，必须受限。

默认允许：

- paper PDF。
- supplementary PDF、doc、xlsx、csv、tsv、txt、json、yaml 等小文件。
- GitHub/GitLab 仓库 README、LICENSE、environment files、script index、小型脚本。
- Zenodo、Figshare、OSF 等公开资源的 metadata manifest 和小型表格。
- GEO、ArrayExpress、SRA、EGA 等 accession metadata，不下载 raw sequencing data。

默认不下载：

- FASTQ、BAM、CRAM、SRA、fragments 等原始组学大文件。
- raw microscopy、whole-slide image、大型 spatial image。
- controlled-access data。
- 需要登录、token、cookies 或机构权限的数据。
- license、terms 或 privacy 边界不清楚的数据。

硬限制：

- 单文件默认上限 50MB。
- 超过 50MB 需要显式批准。
- `outputDir` 必须在允许 root 内。
- 默认不覆盖已有文件。
- 仅允许 HTTP/HTTPS 公网 URL。
- 拒绝 localhost、private IP、internal network URL。
- 不使用 credentials、cookies 或 token。
- 必须记录 local path、size、hash、content type、download status、blocked reason 和 timestamp。

## Status Semantics

规划阶段采用非中断式状态语义：默认继续规划，只阻断具体资源或执行单元。

| 状态                       | 含义                     | 行为                                 |
| -------------------------- | ------------------------ | ------------------------------------ |
| `ready`                    | 当前单元可进入下一步     | 继续                                 |
| `conditional_continue`     | 有缺口但可继续规划       | 继续并记录 warning / required action |
| `blocked_for_localization` | 资源不能自动本地化       | 改为 plan-only，不中断整体规划       |
| `blocked_for_execution`    | 对应复现单元不能进入执行 | 该 unit 降级或从执行 task 中排除     |
| `partial_ready`            | 计划部分可推进           | 只推进 ready units                   |
| `fatal_block`              | 安全、权限或上下文问题   | 停止当前规划流程                     |

常见非 fatal 情况：

- code unavailable -> methods-based reimplementation plan。
- raw counts unavailable -> claim 降级。
- metadata incomplete -> 只阻断特定 comparison。
- environment missing -> capability gap task。
- large files -> planned-only localization。
- controlled access -> access plan + affected claims conditional / execution-blocked。

## Reviewed Corrections

本轮客观审核后采纳以下修正，并在后续讨论中进一步收缩为轻量两阶段输出：

1. `bio_reproduction` 不替代 `bio_source` / `bio_runtime`，只做 planning coordination。
2. `localize_source_package` 加入 50MB、路径、网络和授权安全边界。
3. `draft_reproduction_plan` 只组织 agent/skill 已提取材料，不做论文理解黑箱。
4. `source_audit.json` 覆盖 data、code 和 reference resources，例如 reference genome、GTF/GFF、marker database、signature gene set、ligand-receptor database、atlas reference、pretrained model/reference embedding。
5. 结果实现架构收缩为 Planning Package 和 Execution Package，不额外强制 `result_contract`、`output_manifest` 或多份 claim/task 矩阵文件。

以下审计项本轮暂不纳入设计约束：

- 不新增独立 `validate_scope_matrix`。
- 不强制定义 execution readiness 硬门槛。
- 不强制拆分 P0 artifact 数量；第一版以 package 目录和关键文件为主。
- 不强制 modality enum 收紧。
- 不把 code license/provenance 字段作为本轮重点。

## Implementation Matrix

本节记录当前第一版已经落地的文件级实现矩阵，同时标出后续进入 demo case 前仍需遵守的实现约束。状态含义：

- `implemented`: 第一版已写入代码或文档，并已有基础校验。
- `implemented-with-gap`: 已写入但仍有明确残余风险或后续增强项。
- `future`: 本轮不实现，只作为后续迭代入口。

### Skill Implementation Matrix

| 层级                       | 文件/目录                                                                                        | 状态        | 当前职责                                                                                            | 必须保持的实现要求                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 顶层规划 skill             | `resources/skills/bio-omics-reproduction-planning/SKILL.md`                                      | implemented | omics paper/demo 复现执行前规划；组织 source audit、可复现范围、execution module 和 script boundary | 保持 planning-only、restricted-default；不能写正式脚本、运行分析或声明复现成功；`description` 必须强触发复现、审计、demo case planning、panel feasibility   |
| 计划模板 reference         | `resources/skills/bio-omics-reproduction-planning/references/reproduction-plan-template.md`      | implemented | 定义 `planning/reproduction_plan.md` 的最小结构                                                     | 必须包含 target, source summary, availability, reproducible scope, execution modules, environmentRef, skill/MCP route, expected outputs, execution boundary |
| source audit reference     | `resources/skills/bio-omics-reproduction-planning/references/source-audit-schema.md`             | implemented | 定义 `planning/source_audit.json` 的轻量 schema                                                     | schema 名称保持 `openbioscience.omics_reproduction.source_audit.v1`；覆盖 paper、data、code、referenceResources、localized、warnings、plannedOnly           |
| 轻量本地化 policy          | `resources/skills/bio-omics-reproduction-planning/references/lightweight-localization-policy.md` | implemented | 记录本地化允许范围、阻断范围、50MB 默认上限和路径/URL safety                                        | 不能把受控访问、raw sequencing、raw imaging、需要 token/cookie/credential 的资源纳入自动本地化                                                              |
| modality routing reference | `resources/skills/bio-omics-reproduction-planning/references/modality-routing-notes.md`          | implemented | 记录 scRNA-seq、bulk RNA-seq、spatial、ATAC、multiome 下游路由                                      | 只做规划路由，不替代具体 modality 的执行 runbook                                                                                                            |
| scRNA 下游复现 skill       | `resources/skills/bio-scrna-reproduction/SKILL.md`                                               | implemented | 已有 Planning Package 后的 scRNA-seq scoped reproduction runbook                                    | 完整 paper/demo 复现不能直接从这里开始；必须先经过 `bio-omics-reproduction-planning`                                                                        |
| single-cell 入口 router    | `resources/skills/singlecell/SKILL.md`                                                           | implemented | 将完整 paper/demo/source audit/panel feasibility 路由到 omics planning                              | 不能把手写 `bio-*` skills 当作 generated/materialized skill manifest 管理                                                                                   |

### MCP Implementation Matrix

| 层级                     | 文件/目录                                                               | 状态                 | 当前职责                                                                                                                                                                              | 必须保持的实现要求                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bio MCP catalog          | `packages/desktop/src/process/resources/builtinMcp/bio/catalog.ts`      | implemented          | 新增 `reproduction` profile，注册 `openscience-bio-reproduction` / `bio_reproduction` 和六个 actions                                                                                  | 保持单共享 bundle + profile env 结构；不能引入 `/mnt/NAS` 等开发机绝对路径                                             |
| Bio MCP server           | `packages/desktop/src/process/resources/builtinMcp/bioServer.ts`        | implemented          | 实现 `bio_reproduction` actions: `status`, `build_source_package`, `localize_source_package`, `audit_data_code_availability`, `draft_reproduction_plan`, `validate_reproduction_plan` | 所有 actions 返回 JSON text；包含 schema/action/status/timestamp；不执行脚本、不安装包、不下载重数据、不做最终科学判断 |
| Path/URL safety          | `packages/desktop/src/process/resources/builtinMcp/bio/pathSafety.ts`   | implemented          | 为 `localize_source_package` 提供 allow-root、realpath、child path、URL safety 检查                                                                                                   | 必须处理 symlink escape；拒绝 localhost/internal/private/link-local/mapped IP；拒绝 outputDir 越界                     |
| Built-in MCP 常量        | `packages/desktop/src/process/resources/builtinMcp/constants.ts`        | implemented          | 将 `openscience-bio-reproduction` 纳入内置 MCP 常量                                                                                                                                   | 命名必须与 catalog、migration、WebUI 注册一致                                                                          |
| Storage/config 类型      | `packages/desktop/src/common/config/storage.ts`                         | implemented          | 允许内置 MCP 配置持久化识别 reproduction profile                                                                                                                                      | 不改变已有 runtime/source/knowledge/plot profile 语义                                                                  |
| Desktop migration        | `packages/desktop/src/process/utils/runBackendMigrations.ts`            | implemented          | Desktop 端启动迁移注册 `openscience-bio-reproduction`                                                                                                                                 | 必须与其他 bio profiles 一起 idempotent 注册                                                                           |
| Standalone WebUI catalog | `scripts/webui.ts`                                                      | implemented-with-gap | WebUI 内置 MCP catalog 纳入 `openscience-bio-reproduction`                                                                                                                            | 已实现注册；直接测试受当前私有 builder 结构限制，后续若导出 builder 需补单测                                           |
| Science mode 可选 MCP    | `packages/desktop/src/renderer/pages/guid/utils/modeCapabilities.ts`    | implemented          | Science/Bio 手动 selectable MCP 包含 `openscience-bio-reproduction`                                                                                                                   | UI selectable 列表必须和 built-in MCP catalog 保持一致                                                                 |
| 打包构建                 | `scripts/build-mcp-servers.js`、`packages/desktop/electron-builder.yml` | implemented          | 继续使用共用 `builtin-mcp-bio.js` bundle                                                                                                                                              | `reproduction` 只通过 `OPENBIOSCIENCE_BIO_MCP_PROFILE=reproduction` 区分，不复制 server 文件                           |

### Test And Validation Matrix

| 测试/校验                                                            | 状态        | 覆盖内容                                                                                                                                     | 后续要求                                                                                                      |
| -------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `tests/unit/process/bioMcpCatalog.test.ts`                           | implemented | Bio profile 包含 `reproduction`；server/tool/action 列表正确；无开发绝对路径泄露                                                             | 后续新增 action 必须更新 action contract 测试                                                                 |
| `tests/unit/process/bioMcpServer.test.ts`                            | implemented | `bio_reproduction` 六个 actions、source audit schema、script-boundary validation、URL/path/symlink safety、credential redaction、50MB policy | 若 `localize_source_package` 从 validation 变为真实写入，必须新增写入、hash、overwrite、failure recovery 测试 |
| `tests/unit/bootstrap/runBackendMigrations.test.ts`                  | implemented | Desktop migration 注册 `openscience-bio-reproduction`                                                                                        | 新增 profile 时必须保持 idempotent 注册测试                                                                   |
| `tests/unit/bootstrap/syncCodexOpenScienceMcpConfig.test.ts`         | implemented | Codex/OpenScience MCP config sync 覆盖 reproduction profile                                                                                  | 后续修改 built-in MCP naming 时必须同步                                                                       |
| `tests/unit/renderer/guidModeCapabilities.test.ts`                   | implemented | Science mode selectable MCP 覆盖 reproduction profile                                                                                        | 后续 UI mode 变更时必须保留 Bio MCP 可选性                                                                    |
| `quick_validate.py resources/skills/bio-omics-reproduction-planning` | implemented | skill frontmatter、目录结构、基础格式                                                                                                        | 每次改 skill 后都要重新运行                                                                                   |
| `quick_validate.py resources/skills/bio-scrna-reproduction`          | implemented | scRNA 下游复现 skill 基础格式                                                                                                                | 每次改 skill 后都要重新运行                                                                                   |
| `bunx tsc --noEmit --pretty false`                                   | implemented | TypeScript 类型边界                                                                                                                          | 修改 MCP/server/catalog/renderer 注册后必须运行                                                               |
| `git diff --check`                                                   | implemented | 空白和 patch 基础合法性                                                                                                                      | 每次提交前运行                                                                                                |

## Implementation Requirements

### Skill Requirements

- `SKILL.md` 只能承担 runbook 职责，不能变成长篇包文档、marker 数据库或脚本集合。
- Frontmatter 必须至少包含 `name` 和强触发 `description`；扩展字段进入正式加载链路前需要单独验证。
- `description` 必须覆盖用户自然语言触发场景：复现、文献审计、scope 判断、demo case planning、claim 或 panel feasibility。
- `OpenBioScience Adapter` 必须声明 `research_evidence`、`science_artifact`、`bio_reproduction`、`bio_source`、`bio_runtime` 的边界。
- `Execution Policy` 必须写明 `planning_only` 和 `restricted_default`。
- Stage flow 必须覆盖 paper package、source audit、reproducible scope、execution modules 和 script boundary。
- Stop/fallback rules 必须采用非中断式语义：除安全、权限、上下文 fatal 外，缺口应转为降级、planned-only 或 execution-blocked unit。
- Planning 默认输出必须收敛到 `planning/reproduction_plan.md`、`planning/source_audit.json` 和 `planning/localized/`。
- Execution 默认输出只作为后续包结构约束：`execution/scripts/`、`execution/configs/`、`execution/results/`、`execution/logs/execution.log`、`execution/logs/review.md` 和环境记录；script 和 runner 实现不属于当前 planning MCP。
- 长字段、modality 细则、判定 rubric、模板和 routing notes 必须放入 `references/`，而不是塞回入口 `SKILL.md`。
- 所有用户可见证据、artifact、warning、decision 和 output pointer 都必须能通过 `science_artifact` 注册。
- 不能把 skill 本身、MCP 返回、代码仓库 README、methods 文本或 agent 推理直接当作已复现证据。

### MCP Requirements

- `bio_reproduction` 必须是 planning coordinator，不替代 `bio_source`、`bio_runtime`、`bio_knowledge` 或下游 modality skill。
- MCP surface 继续采用单 server + 单 control-plane tool + `action` enum 风格。
- 所有 actions 返回 JSON text，至少包含 `schema`、`action`、`status`、`warnings`、`timestamp`。
- `status` 必须说明该 MCP 是 planning-only，不做 final biological judgment、analysis execution、package installation 或 environment mutation。
- `build_source_package` 只能聚合 paper、methods、data/code availability、accessions、links、local paths 和用户输入，不替代底层 accession/path 解析。
- `audit_data_code_availability` 必须输出或校验 `source_audit.json` 草案，并覆盖 data、code 和 reference resources。
- `draft_reproduction_plan` 必须组织已提取材料，输入应包含 source pointer；不得自动生成最终 scientific claim。
- `draft_reproduction_plan` 必须记录 workflow family、candidate environmentRef、skill/MCP route、capability gap、expected outputs 和 execution boundary。
- `validate_reproduction_plan` 必须严格检查 planning files、source readiness 或 approved existing data、environmentRef、skillRoute、mcpRoute、expectedOutputs 和 script-ready sourceStatus。
- `localize_source_package` 当前只做安全校验和 planned-only 返回；若后续变为真实下载/写入，必须先补用户批准、hash、size、content-type、overwrite policy 和 failure recovery 测试。
- `localize_source_package` 必须拒绝 localhost、private IP、internal URL、credential/cookie/token 依赖和 outputDir 越界。
- MCP 不得下载 raw sequencing、raw imaging、controlled-access data 或 license/terms 不清楚的数据。
- MCP 不得执行 R/Python 分析脚本，不得安装包，不得写入 official environments。
- source package 和 source audit 必须 redacts credential-like fields，例如 token、cookie、password、secret、apiKey、api_key、authorization、auth、credential、key。

### Documentation Requirements

- 文档必须区分 `implemented`、`implemented-with-gap`、`future`，避免把未实现能力写成已完成。
- `tmp/` 中必须区分 confirmed decisions、current implementation、planned implementation、deferred items。
- scRNA-seq 文档必须说明 `bio-scrna-reproduction` 是 omics planning 后的下游，不再是所有 omics 文献复现的顶层入口。
- template 文档必须强调 progressive disclosure：短 `SKILL.md` + references + MCP/schema 约束。
- 环境、数据、runner、MCP 文档不能固化当前 NAS 绝对路径为长期 API；NAS 路径只能作为当前部署说明或临时本地配置。
- 新增 paper-reproduction 相关 skill/MCP 前，必须先在本文件或相邻 plan 文档中写入矩阵、边界、测试和残余风险。

### Compatibility Requirements

- Renderer 不直接调用 Node.js、filesystem 或 MCP server implementation；需要走现有 bridge/config/UI 模式。
- Web host 只做静态服务和代理，不放业务路由。
- Built-in MCP 新 profile 必须同步 desktop bootstrap、WebUI catalog、common storage/config、Science mode selectable UI 和测试。
- `resources/skills/bio-*` 手写 runbooks 不应破坏 `cs-*` materialized skills 和 generated science skill manifest。
- 不提交 local backend bundle、NAS 大文件、demo 大文件或环境 prefix。

## Reference Standards

后续实现必须参考以下本地规范、现有代码和已落地文件：

| 参考文件                                                                                         | 必须参考的内容                                                                                     |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                                                      | 项目边界、Electron/WebUI/backend 分层、MCP/skills 位置、测试选择、UI 与 i18n 约束                  |
| `tmp/10-development-directions/skills-mcp/cs-skill-and-mcp-style-study.md`                       | Adapter + SOP + provenance discipline；built-in MCP 单 control-plane tool 风格；MCP 返回 JSON text |
| `tmp/10-development-directions/skills-mcp/openbioscience-skill-template.md`                      | OpenBioScience Bio skill 模板、progressive disclosure、skill/MCP/conda/science_artifact 分工       |
| `tmp/10-development-directions/skills-mcp/scrna-seq-skill-mcp-plan.md`                           | 当前 scRNA-seq skill/MCP 分层、`bio_runtime` / `bio_source` / `bio_knowledge` / `bio_plot` 边界    |
| `tmp/10-development-directions/skills-mcp/scrna-seq-skill-mcp-implementation-log.md`             | 现有 Bio skills、Bio MCP profile 注册、构建、测试状态                                              |
| `resources/skills/bio-omics-reproduction-planning/SKILL.md`                                      | 当前 omics planning skill 的入口 runbook 和边界                                                    |
| `resources/skills/bio-omics-reproduction-planning/references/reproduction-plan-template.md`      | Planning Package 主计划模板                                                                        |
| `resources/skills/bio-omics-reproduction-planning/references/source-audit-schema.md`             | Source audit schema 和状态词                                                                       |
| `resources/skills/bio-omics-reproduction-planning/references/lightweight-localization-policy.md` | 轻量本地化安全边界                                                                                 |
| `resources/skills/bio-omics-reproduction-planning/references/modality-routing-notes.md`          | 各 omics modality 下游路由                                                                         |
| `tmp/10-development-directions/demo-reproduction/demo-driven-iteration.md`                       | demo-driven reproduction 的最小迭代单位和验收逻辑                                                  |
| `tmp/10-development-directions/demo-reproduction/p0-case-capability-matrix.md`                   | 当前 demo cases 对 object IO、runner、marker/signature、clinical/CCI 等能力缺口的要求              |
| `packages/desktop/src/process/resources/builtinMcp/bio/catalog.ts`                               | Bio MCP profile、server name、tool name、actions、environment/workflow/plot template 定义          |
| `packages/desktop/src/process/resources/builtinMcp/bioServer.ts`                                 | Bio MCP action 处理、JSON text 返回、schema/status/warning 风格                                    |
| `packages/desktop/src/process/resources/builtinMcp/bio/pathSafety.ts`                            | allow root、realpath、child path、URL safety 和 symlink escape 检查                                |
| `packages/desktop/src/process/resources/builtinMcp/researchEvidenceServer.ts`                    | evidence/source lookup MCP 的边界和返回模式                                                        |
| `packages/desktop/src/process/resources/builtinMcp/scienceArtifactServer.ts`                     | evidence/artifact/provenance 注册边界                                                              |
| `packages/desktop/src/process/utils/runBackendMigrations.ts`                                     | Desktop built-in MCP bootstrap/migration 注册模式                                                  |
| `scripts/webui.ts`                                                                               | Standalone WebUI built-in MCP catalog 注册模式                                                     |
| `scripts/build-mcp-servers.js`                                                                   | built-in MCP bundle 构建方式                                                                       |
| `tests/unit/process/bioMcpCatalog.test.ts`                                                       | Bio MCP catalog 测试风格                                                                           |
| `tests/unit/process/bioMcpServer.test.ts`                                                        | Bio MCP action contract、安全边界和 schema 测试风格                                                |

## Implementation Order

第一版 paper/omics reproduction planning 层已经完成前 6 个阶段。后续新增 action、profile 或 paper-reproduction skill 时，仍按同一顺序推进。

| 阶段                          | 状态        | 执行要求                                                                                                        |
| ----------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| 1. Skill and references       | implemented | 先更新 `bio-omics-reproduction-planning` skill 与 references，使 Planning Package / Execution Package 边界清楚  |
| 2. MCP profile declaration    | implemented | 再增加或更新 `bio_reproduction` profile、server name、tool name 和 action enum                                  |
| 3. Planning actions           | implemented | 优先实现 planning package actions：source package、source audit、plan draft、plan validation                    |
| 4. Safety-gated localization  | implemented | 只有在 path/URL safety 测试存在后，才允许扩展 `localize_source_package`                                         |
| 5. Runtime registration       | implemented | 同步 Desktop migration、WebUI catalog、common config、Science mode selectable MCP 和打包构建                    |
| 6. Targeted validation        | implemented | 增加 profile resolution、action contract、source audit shape、path/network safety、non-interrupting status 测试 |
| 7. Demo dry-run               | future      | 用 `human_CRC` demo case 生成第一份 Planning Package，并记录 blocked/ready/conditional units                    |
| 8. Script / Execution Package | future      | 单独讨论 human-readable script、runner、execution logs、result review 和 artifact registration                  |
