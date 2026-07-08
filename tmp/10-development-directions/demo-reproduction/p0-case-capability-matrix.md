# P0 Demo Case Capability Matrix

本文档把三篇 demo case 与 P0 harness 能力直接对齐。这里不讨论泛化平台目标，而是只回答一个问题：**当前这 3 个 case 分别需要哪些 environment / skill / MCP，哪些结论当前可以安全支持，哪些还不能。**

## 证据等级说明

| 标记 | 含义 |
| --- | --- |
| strong local basis | 本地已有 raw counts 或足够完整的对象输入，适合作为第一轮主线 |
| conditional local basis | 本地有表达矩阵和 metadata，但 counts 语义、临床语义或下游依赖仍需验证 |
| limited local basis | 本地只有部分输入，关键模块仍缺数据或外部资源 |

## 当前仓库能力核对

本矩阵基于当前仓库已存在的 product skills 和 built-in MCP 进行确认，而不是把计划中的能力写成已经存在。

### 已有可复用 skills

| 现有 skill | 当前用途 | 对 P0 矩阵的作用 |
| --- | --- | --- |
| `openscience-science` | Science Mode 总路由、真实执行、证据和 artifact 纪律 | 可承接 paper/data/computation/report 的总体流程 |
| `openscience-singlecell` | 单细胞、AnnData/H5AD、Scanpy、scVI/scGPT、marker/DE/trajectory 等路由 | 可作为 single-cell 主入口，但 R/Seurat、免疫注释、CCI、response 专项 SOP 仍需补细 |
| `openscience-databases` | paper、公共数据库、GEO/PubMed/bio-tools routing | 可承接 paper triage、accession lookup、数据库证据注册 |
| `openscience-compute` | 环境、runtime、远程计算、包检查 | 可承接 environmentRef / server runtime 的决策层 |
| `openscience-science-artifact` | artifact graph、evidence、claims、snapshot、publish | 可承接复现报告、运行证据、输出文件和 provenance |
| `kdense-anndata`、`kdense-scanpy`、`kdense-scvi-tools` | Python single-cell leaf skills | 支持 `sc-py-singlecell` 方向的 AnnData/Scanpy/scVI 说明与执行纪律 |
| `kdense-cellxgene-census`、`kdense-gget`、`kdense-bioservices` | 生物数据库 leaf skills | 支持 accession/data source 解析，但需要实际 provider 可用性验证 |
| `kdense-scientific-visualization`、`cs-figure-composer`、`cs-figure-style` | 科学绘图与 figure polish | 可支撑 `sc-r-plot` 输出规范，但不是 R 绘图 runner 本身 |

### 已有可复用 MCP

| 现有 MCP | 工具名/能力 | 对 P0 矩阵的作用 |
| --- | --- | --- |
| `openscience-research-evidence` | `research_evidence(status/list_tools/search/read/call)` | 覆盖 `paper_mcp`、`literature_mcp`、部分 `accession_mcp` 的证据检索层；`bio_tools` 需要按 provider status 验证 |
| `openscience-science-artifact` | `science_artifact(status/reserve_id/get/list/create/patch/replace/append/version/snapshot/publish/annotate/focus_page)` | 覆盖复现 report、artifact、evidence、claim、snapshot、publish |
| `openscience-medical-evidence` | 医学证据面板与 grading | 可支持临床证据表述，不等于 tumor response / survival analysis runner |
| `openscience-lab-skill` | workflow/SOP skill 沉淀 | 可用于把 demo 复现流程沉淀成新 skill |
| `openscience-user-input` | 受控用户澄清 | 可用于 sample/assay/response 字段不清时的确认 |

### 仍需新增或适配的 Bio-specific 能力

| 计划能力 | 当前确认 |
| --- | --- |
| `object_io_mcp` | 暂未作为 built-in MCP 存在；当前只能由普通 runtime 读写对象，并用 `science_artifact` 记录输出 |
| `analysis_runner_mcp` | 暂未作为 built-in MCP 存在；当前缺少统一 runner contract、environmentRef、日志/provenance 标准 |
| `marker_signature_mcp` | 暂未作为 built-in MCP 存在；可先由脚本执行和 artifact 记录替代 |
| `clinical_cancer_mcp` | 暂未作为 built-in MCP 存在；`medical_evidence` 只覆盖医学证据展示，不覆盖统计 runner |
| `cytof_mcp` | 暂未实现；且 `sc-r-cytof` 当前仍是 planned environment |
| `singlecell_import`、`seurat_qc_clustering`、`immune_annotation`、`crc_cms`、`cci`、`response_biomarker` 等专项 skills | 当前更适合视为待沉淀的 Bio SOP modules；可先由 `openscience-singlecell` + leaf skills + case README 约束 |

## Case Matrix

| Case | 当前本地资产 | 当前数据形态判断 | 当前最安全的首轮输出 | P0 关键 environment | P0 关键 skills | P0 关键 MCP | 当前主要阻塞项 | 建议阶段 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `human_CRC` | PDF；`GSE132465` raw UMI、TPM、annotation；`GSE144735` raw UMI、TPM、annotation | **strong local basis**。本地已有两组 raw UMI count matrix 和 annotation，可直接支撑导入、QC、聚类、annotation 主线 | object import summary、major lineage annotation、CRC CMS-like scoring、初步 marker/CCI 输出 | 已安装：`sc-r-singlecell`、`sc-py-singlecell`、`sc-r-plot`、`sc-cci-r`；条件性：`sc-r-trajectory`；计划中：`sc-legacy-repro` | 已有入口：`openscience-science`、`openscience-singlecell`、`openscience-databases`、`openscience-compute`；待沉淀：`singlecell_import`、`seurat_qc_clustering`、`immune_annotation`、`crc_cms`、`cci` | 已有：`research_evidence`、`science_artifact`、`user_input`；待新增：`object_io_mcp`、`analysis_runner_mcp`、`marker_signature_mcp` | legacy 版本未锁定；CellPhoneDB/Monocle runner 未实装；EGA/BioStudies 关联数据未本地验证 | P0 第一优先 |
| `human_ICI` | PDF；`BLCA_GSE145281_aPDL1_expression.h5`；cell metadata 表 | **conditional local basis**。HDF5 结构像 10x sparse matrix，但 `matrix/data` 为 `float32` 且抽样值非整数，当前更像 processed expression，而非 raw counts | object import summary、immune major/minor lineage review、Responder vs Nonresponder 组成比较、PBMC vs tumor 结构核对 | 已安装：`sc-py-singlecell`、`sc-r-singlecell`、`sc-r-clinical`、`sc-r-plot`；计划中：`sc-legacy-repro` | 已有入口：`openscience-science`、`openscience-singlecell`、`openscience-databases`、`openscience-compute`；待沉淀：`singlecell_import`、`immune_annotation`、`response_biomarker`、`enrichment_signature` | 已有：`research_evidence`、`science_artifact`、`medical_evidence`、`user_input`；待新增：`object_io_mcp`、`analysis_runner_mcp`、`marker_signature_mcp`、`clinical_cancer_mcp` | 本地矩阵是否可用于 counts-based DE 尚未成立；完整 trial-level survival / ORR 数据不在本地；paper 覆盖 mUC/mRCC 更大临床范围 | P0 第二优先 |
| `mouse_SARC` | PDF；`SARC_GSE119352_mouse_aPD1aCTLA4_expression.h5`；cell metadata 表 | **conditional local basis**。HDF5 结构像 sparse matrix，但 `matrix/data` 为 `float32` 且抽样值非整数；本地无 FCS / CyTOF 原始文件 | object import summary、mouse immune annotation、treatment-specific cluster abundance review、初步 myeloid / lymphoid state 对比 | 已安装：`sc-py-singlecell`、`sc-r-singlecell`、`sc-r-plot`；计划中：`sc-r-cytof`、`sc-legacy-repro` | 已有入口：`openscience-science`、`openscience-singlecell`、`openscience-databases`、`openscience-compute`；待沉淀：`paper_errata_check`、`immune_annotation`、`tumor_immune_subtyping`、`cross_species_signature` | 已有：`research_evidence`、`science_artifact`、`user_input`；待新增：`object_io_mcp`、`analysis_runner_mcp`、`marker_signature_mcp`、`cytof_mcp` | 本地无 CyTOF/FCS；本地矩阵更像 processed expression；Figure 6E correction 需显式检查；跨物种 signature 还未接入 | P0 第三优先，CyTOF 进入条件性支持 |

## 当前跨 case 结论

### 可以立即推进的能力

1. `human_CRC` 足以驱动第一轮官方环境和 import/annotation 主线。
2. 三个 case 都需要：
   - 现有 `research_evidence`：paper、literature、GEO/accession 证据检索入口。
   - 现有 `science_artifact`：report、artifact、snapshot、provenance 入口。
   - 当前普通 runtime：临时承担 object IO 和分析执行。
   - 待新增 `object_io_mcp` 和 `analysis_runner_mcp`：把 object import、环境选择、脚本执行、日志和输出契约收敛成受控工具层。
3. 三个 case 都需要把 paper-level claims 与 local data semantics 分开写。

### 当前不应混淆的能力

1. `human_ICI` 和 `mouse_SARC` 虽然已有 `.h5`，但目前没有证据表明它们是 raw UMI counts。
2. 没有 raw counts 时，不应直接把 pseudobulk / edgeR / strict DE 当成已支持。
3. `mouse_SARC` 没有本地 FCS，因此 CyTOF 只能作为条件性支持模块，不应写成现成可跑。

### 对 P0 实施顺序的直接影响

建议的最小主线是：

1. 先用 `human_CRC` 建立 `sc-r-singlecell` / `sc-py-singlecell` 和 object import / annotation / scoring / CCI 主链。
2. 再用 `human_ICI` 拉进 response-aware analysis 与 `sc-r-clinical`。
3. 最后用 `mouse_SARC` 拉进 correction check、cross-species，并在 FCS/CyTOF 输入补齐后再推进 `sc-r-cytof` / `cytof_mcp`。

## 方案确认结论

当前矩阵经过 existing skills/MCP 核对后可以成立，但需要把 P0 拆成两层：

1. **P0a 可以马上试跑**：使用已安装 official environments、`openscience-*` router skills、`research_evidence`、`science_artifact` 和普通 runtime，先完成 `human_CRC` 的 import summary、对象结构检查、基础 annotation/scoring 输出，并把所有输入、脚本、日志、结果记录为 artifact。
2. **P0b 需要新增平台能力**：沉淀 `singlecell_import`、`seurat_qc_clustering`、`immune_annotation`、`crc_cms`、`cci` 等 Bio SOP skills；新增 `object_io_mcp` 和 `analysis_runner_mcp`，让对象导入、environmentRef、脚本执行、日志、输出表/图具有统一契约。

因此，当前矩阵不是“所有列出的 Bio 能力都已经实现”，而是“已有 Science/SingleCell/Evidence/Artifact 能力足以启动第一轮 human_CRC 验证；Bio-specific runner 和 SOP 需要从该验证中沉淀”。
