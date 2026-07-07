# Science And Bio Harness Map

本文档聚焦现有 Science/Medical/Lab harness 与 Bio 可复用部分。核心判断：当前 Bio 能力已经以零散方式存在于 Science Mode、bio tools provider、skills 和 preview contract 中，但还不是一等产品模式。

## Common Chat Contracts

| Contract | 文件 | 当前职责 | Bio 相关判断 |
| --- | --- | --- | --- |
| Science | `packages/desktop/src/common/chat/science.ts` | `SCIENCE_MODE_ID='science'`、Science panel schema、artifact/event 类型 | Bio artifact/panel 复用基础 |
| Medical Evidence | `packages/desktop/src/common/chat/medicalEvidence.ts` | `MEDICAL_EVIDENCE_MODE_ID='medical_evidence'`、PICO/证据 panel schema | 保持临床证据独立 |
| Medical defaults | `packages/desktop/src/common/chat/medicalEvidenceDefaults.ts` | 医学证据默认配置 | 不应作为通用 Bio 默认 |
| Lab Skill | `packages/desktop/src/common/chat/labSkillDeposition.ts` | 实验技能沉淀 schema | Bio SOP 可借鉴 |

`science.ts` 已声明的 Bio-adjacent artifact 类型包括：

- `molecule`
- `protein_structure`
- `genome_track`
- `alignment`

已声明 viewer kind 包括：

- `3dmol`
- `molstar`
- `rcsb_molstar`
- `igv`
- `ketcher`
- `vitessce`
- `msa`

这说明 Bio P1 不必先设计新 artifact contract，应优先补齐已声明 viewer 的前端实现和测试。

## Built-in MCP Harness

| MCP | 文件 | 主要能力 | Bio 相关判断 |
| --- | --- | --- | --- |
| research evidence | `packages/desktop/src/process/resources/builtinMcp/researchEvidenceServer.ts` | 单工具 `research_evidence`，action 包括 `status/list_tools/search/read/call` | Bio source/provider 主入口 |
| research env | `packages/desktop/src/common/config/researchEvidenceMcpEnv.ts` | provider/env 配置 | Bio domain defaults 应在这里规范 |
| science artifact | `packages/desktop/src/process/resources/builtinMcp/scienceArtifactServer.ts` | `create/patch/replace/version/snapshot/publish/annotate/focus_page` 等 | Bio artifact 输出主入口 |
| medical evidence | `packages/desktop/src/process/resources/builtinMcp/medicalEvidenceServer.ts` | `evidence_start_run/search/collect_anchor/read_artifact/grade/attach_figure/submit_panel` | 临床证据专用 |
| lab skill | `packages/desktop/src/process/resources/builtinMcp/labSkillServer.ts` | 实验 SOP/技能沉淀 | Bio protocol 场景可复用 |
| user input | `packages/desktop/src/process/resources/builtinMcp/userInputServer.ts` | 人机交互输入 | 需要用户澄清 sample/assay 时可复用 |

`research_evidence` 目前配置/声明的 provider 包括 `auto`、`paperclip`、`bio_tools`。已存在别名方向包括 PubMed、ChEMBL、GEO、AlphaFold 等。Bio P0 应把这些能力显式归入 Bio profile，但不能把“有别名”当成“数据库调用已验证”；实际能力需要按 provider 的 `status/list_tools/search/read/call` 结果确认。

## Science Artifact Store

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| artifact MCP runtime output | `.openscience/science-artifacts/runs/<runId>/panel.json` | Science panel/artifact 输出位置 |
| artifact git store | `packages/desktop/src/process/services/scienceArtifactGitStore.ts` | `.openscience/project.json`、`.openscience/artifact-repo`、artifact 历史 |
| archive bridge | `packages/desktop/src/process/bridge/scienceArtifactArchiveBridge.ts` | artifact 归档/读取 bridge |
| Science panel UI | `ScienceReportPanel.tsx` | 面板展示 |
| Science workspace | `ScienceArtifactWorkspace.tsx` | artifact 工作区 |
| Science files view | `ScienceFilesView.tsx` | 文件列表与预览 |

Bio P0 应复用这些路径。P1 再考虑增加 Bio-specific metadata，例如：

- organism/taxon
- genome assembly/reference database
- assay/platform
- sample/cohort
- identifier namespace
- database version/access date
- provenance/source confidence
- regulated/clinical boundary flag

## Preview/Viewers

| Viewer/工具 | 文件 | 当前状态 | Bio 后续 |
| --- | --- | --- | --- |
| file type | `packages/desktop/src/renderer/utils/file/fileType.ts` | 基础文件类型识别 | 增加 FASTA/FASTQ/BAM/VCF/BED/GFF/GTF/H5AD/loom/alignment 等映射 |
| preview utils | `packages/desktop/src/renderer/pages/conversation/Preview/fileUtils.ts` | preview type 推断 | 按 artifact/viewer kind 扩展 |
| molecular viewer | `packages/desktop/src/renderer/pages/conversation/Preview/viewers/MolecularStructureViewer.tsx` | 分子/结构查看基础 | P1 接入 Mol*/RCSB/AlphaFold 显示 |
| ketcher viewer | `packages/desktop/src/renderer/pages/conversation/Preview/viewers/KetcherViewer.tsx` | 化学结构查看/编辑占位 | P1 实现编辑并保存 artifact version |
| genome viewer | 当前 contract 有 `igv`，UI 不完整 | 基因组 track | P1 引入 IGV viewer |
| single-cell viewer | 当前 contract 有 `vitessce`，UI 不完整 | 单细胞/空间组学 | P1 引入 Vitessce |
| alignment viewer | 当前 contract 有 `msa`，UI 不完整 | MSA/序列比对 | P1 引入 MSA viewer |

Preview 类型当前偏向 `science_report`、`science_files`、`molecular_structure`。Bio 不应通过大量 hardcoded preview type 扩展，而应让 artifact type + viewer kind 驱动 UI。

## Skills

当前可复用 skills：

| Skill | 路径 | Bio 用途 |
| --- | --- | --- |
| science | `resources/skills/science/SKILL.md` | 现有 Science router |
| science-artifact | `resources/skills/science-artifact/SKILL.md` | artifact 创建/修订/publish |
| databases | `resources/skills/databases/SKILL.md` | 数据库检索 |
| biomodels | `resources/skills/biomodels/SKILL.md` | 生物模型 |
| singlecell | `resources/skills/singlecell/SKILL.md` | 单细胞分析 |
| compute | `resources/skills/compute/SKILL.md` | 计算资源与执行 |

建议新增 Bio router skill，职责不是重写所有 SOP，而是把已有 Science/Database/Single-cell/Compute skills 组织成 Bio 任务路由。

## Bio Source 扩展候选

P0 可先规范已有 provider；P1 再扩展 source aliases：

| Domain | 候选 source |
| --- | --- |
| literature | PubMed, Europe PMC, bioRxiv |
| protein/structure | UniProt, PDB, EMDB, AlphaFold DB |
| genomics | Ensembl/BioMart, NCBI Gene, RefSeq |
| variants | ClinVar, dbSNP, gnomAD, GWAS Catalog |
| expression/omics | GEO, ArrayExpress, Expression Atlas |
| pathway | Reactome, KEGG, BioModels |
| chemistry | ChEMBL, ChEBI, BindingDB, ZINC |

是否直接接入这些 source 取决于 `bio_tools` provider 的真实能力和 license/API 限制；文档中只能把它们列为候选。

## Bio Harness P0 规格草案

Bio mode prompt/contract 应至少要求：

1. 说明研究对象：organism/taxon、细胞类型/组织/模型系统。
2. 说明 reference：基因组 assembly、蛋白 ID、数据库版本、访问日期。
3. 说明 assay：RNA-seq、scRNA-seq、ATAC、proteomics、structure、chemical screen 等。
4. 对证据分级：primary database、review、preprint、model prediction、user-provided artifact。
5. 所有结论区分事实、推断、假设和未解析问题。
6. 生成可追踪 artifact，而不是只生成自然语言回答。
7. 涉及临床诊疗、患者数据或 PHI 时转入 medical/regulated boundary，不提供诊疗建议。

## 不确定项

- `bio_tools` provider 在当前环境和打包后环境的实际可用性未验证。
- Rust core 是否已有 Bio/Science 专用 API 面不可从当前 TS 仓库完全确认。
- `igv`、`vitessce`、`msa` 等 viewer contract 已存在，但实际 UI 实现程度需要逐文件验证。
- 第三方数据库接入受 API key、license、速率限制影响，不能只按 UI 设计承诺。
