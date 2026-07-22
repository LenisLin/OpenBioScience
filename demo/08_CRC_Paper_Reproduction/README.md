# human_CRC Demo Case

## Paper Snapshot

- Title: _Lineage-dependent gene expression programs influence the immune landscape of colorectal cancer_
- Year: 2020
- Journal: _Nature Genetics_
- Disease: colorectal cancer
- Species: human
- Assay focus: tumor / normal scRNA-seq of unsorted single cells

本 case 对 harness 的核心要求不是“泛化单细胞平台”，而是更具体的：

1. 能稳定导入公开的 CRC 单细胞矩阵和 annotation。
2. 能完成基本 QC、聚类、major lineage annotation。
3. 能支持 CRC-specific CMS-like / epithelial lineage program 解释。
4. 能为后续 CellPhoneDB / CellChat / LIANA 互作分析准备标准输入。

## Local Assets Available Now

| 文件                                                                         | 当前判断         | 说明                                           |
| ---------------------------------------------------------------------------- | ---------------- | ---------------------------------------------- |
| `Lee et al. - 2020 - Lineage-dependent gene expression programs influen.pdf` | paper context    | 本地论文 PDF                                   |
| `data/GSE132465_GEO_processed_CRC_10X_raw_UMI_count_matrix.txt.gz`           | raw count matrix | 本地检查显示约 `33,694` genes x `63,689` cells |
| `data/GSE132465_GEO_processed_CRC_10X_natural_log_TPM_matrix.txt.gz`         | processed matrix | 自然对数 TPM                                   |
| `data/GSE132465_GEO_processed_CRC_10X_cell_annotation.txt.gz`                | annotation       | 公开处理后的细胞注释                           |
| `data/GSE144735_processed_KUL3_CRC_10X_raw_UMI_count_matrix.txt.gz`          | raw count matrix | 本地检查显示约 `33,694` genes x `27,414` cells |
| `data/GSE144735_processed_KUL3_CRC_10X_natural_log_TPM_matrix.txt.gz`        | processed matrix | 自然对数 TPM                                   |
| `data/GSE144735_processed_KUL3_CRC_10X_annotation.txt`                       | annotation       | 公开处理后的细胞注释                           |

### Local evidence assessment

这是当前三个 demo case 里**本地证据最强**的一篇。理由是：

- 已有 paper PDF；
- 已有两组 raw UMI count matrices；
- 已有对应 processed matrices；
- 已有 annotation。

因此它最适合作为第一轮 environment / skill / MCP 迭代的主导 case。

## Target Reproduction Scope

### P0 safe targets

第一轮建议把目标收敛为：

1. 导入两组 raw count matrices 和 annotation。
2. 重建基础 single-cell object。
3. 完成 QC、归一化、降维、聚类和 major lineage annotation。
4. 输出 CRC CMS-like / epithelial lineage scoring。
5. 输出初步 immune / stromal subtype marker tables。
6. 为后续 CCI 提供标准输入对象。

### Minimum acceptable demo completion

For this case, import/QC alone is not a meaningful reproduction result. A P0 run is incomplete unless it also produces:

1. major-lineage and available subtype annotation summaries using `Cell_type` and `Cell_subtype`;
2. patient- and sample-level cell composition tables using `Patient`, `Sample`, and `Class`;
3. Tumor-versus-Normal composition comparisons where both classes are available;
4. epithelial CMS subtype summaries and at least one CRC-relevant lineage/program score or documented proxy;
5. patient-level or sample-level marker/pseudobulk-ready tables with explicit replication units;
6. figures covering annotation, composition, cohort/patient stratification, and the selected CRC program;
7. saved analysis objects, tables, plots, parameters, environmentRef, and execution logs.

QC is a prerequisite module, not the terminal deliverable. If a requested clinical endpoint is absent, perform the supported patient/sample stratification above and state exactly which outcome-level association cannot be tested.

### P1 / P2 targets

后续再逐步推进：

1. Monocle trajectory / pseudotime
2. CellPhoneDB / CellChat / LIANA 多方法互作
3. legacy version 对齐后的 figure-level reproduction
4. 与 EGA / BioStudies / supplement 的更完整联动

## Current Reproducibility Boundary

### Supported now

基于当前本地资产，可以合理支持：

- raw count import
- barcode / annotation 对齐检查
- 基础 QC、聚类、annotation 主线
- marker-based lineage review
- CRC-specific scoring 的第一版落地

### Conditionally supported

下列模块在补齐环境和 runner 后应能支持，但当前不应直接宣称已完成：

- CellPhoneDB / CellChat / LIANA
- trajectory / pseudotime
- 跨 cohort 的 paper-style integration
- methods / report 自动生成

### Not yet safe to claim

当前还不应直接宣称：

- 已精确复现 paper 的全部 figure
- 已与原文 legacy 软件版本完全一致
- 已覆盖所有受控访问或非本地数据组成部分

原因不是目标不合理，而是 strict paper reproduction 仍依赖：

- legacy env
- 原文软件版本约束
- 额外 accession / supplement / controlled-access data 的核对

## Required Environments

| 环境               | 角色                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| `sc-r-singlecell`  | Seurat / SingleCellExperiment 端导入、QC、聚类、annotation 和 marker 主线           |
| `sc-py-singlecell` | Scanpy / AnnData 端对象检查、互操作、基础分析和 scVI-compatible workflow            |
| `sc-r-plot`        | publication-style figure、QC plot、UMAP、dotplot、heatmap 和报告图形                |
| `sc-cci-r`         | 第二轮 CCI 输入和 CellChat-style workflow                                           |
| `sc-legacy-repro`  | 计划中；用于更严格对齐 Seurat 2.x / Monocle 2.x / 旧版 CCI 依赖的 reproduction 路径 |

本 case 不需要把 `sc-r-clinical` 或 `sc-r-cytof` 放在第一轮主线。

## Required Skills And MCP

### Skills

| Skill                             | 作用                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| `bio-omics-reproduction-planning` | 生成 Planning Package、source audit、可复现范围和 execution module 边界 |
| `bio-data-resolution`             | 解析本地文件、外部 accession 和 data manifest 对应关系                  |
| `bio-singlecell-import`           | 识别 raw count / processed matrix / annotation 并生成统一对象           |
| `bio-qc-preprocess`               | QC、normalization 和基础 preprocessing                                  |
| `bio-batch-dim-cluster`           | batch/dimension reduction/clustering 主线                               |
| `bio-cell-annotation`             | major/minor lineage annotation                                          |
| `bio-marker-optimization`         | marker table、lineage marker 和 CRC-specific scoring 的第一版输入       |
| `bio-scrna-plotting`              | QC / UMAP / marker / composition plot 输出规范                          |
| `bio-analysis-script-authoring`   | 生成顺序可读、带 contract header 的 R/Python 分析脚本                   |
| `bio-environment-routing`         | 选择 official `environmentRef`                                          |
| `bio-environment-manager`         | 仅在 official env 缺包时，注册 agent 外层创建的 user env                |

### MCP

| MCP                       | 作用                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `research_evidence`       | paper、citation、source context 和外部 evidence 查询                                      |
| `science_artifact`        | 记录 Planning Package、source audit、脚本、日志、输出和 warnings                          |
| `bio_reproduction`        | source package、availability audit、reproduction plan draft 和 script-boundary validation |
| `bio_source`              | accession triage、local asset verification、download plan 和 data manifest                |
| `bio_runtime`             | official/user environment list/resolve/probe、workflow contract 和 output summary         |
| `bio_knowledge`           | marker、atlas、gene set、ligand-receptor 和 gene symbol normalization contract            |
| `bio_plot`                | plot template、plot input validation 和 plot artifact manifest                            |
| `bio_environment_manager` | 在需要 user env 时注册/index agent 外层创建的 environment                                 |

## Minimal Recommended Workflow

1. 用 `bio-omics-reproduction-planning` + `bio_reproduction` 生成 Planning Package。
2. 用 `bio_source` 检查本地两组 raw count matrix、TPM matrix 和 annotation 的一致性。
3. 用 `bio-environment-routing` + `bio_runtime` 选择并 probe `sc-r-singlecell` / `sc-py-singlecell`。
4. 用 `bio-singlecell-import` 构建统一对象或对象构建脚本。
5. 用 `bio-analysis-script-authoring` 生成带 contract header 的顺序 R/Python 脚本。
6. 运行基础 QC、降维、聚类、annotation、marker 和 CRC scoring 第一版。
7. 用 `science_artifact` 记录脚本、日志、对象、表格、图和 warnings。
8. 在第二轮再接 `sc-cci-r`、trajectory 或 legacy reproduction。

## Current Blockers And Next Data Needed

1. 需要把 actual script execution / runner 边界继续沉淀；当前已有 official env 和脚本写作规范，但没有统一 runner。
2. 需要正式定义 matrix 与 annotation 的输入契约。
3. 需要把 CRC-specific marker atlas / CMS scoring reference 接入 skill 或 MCP。
4. 需要 `sc-legacy-repro` 才能更严格比较原文图级结果。
5. 需要外部 accession 层校对 EGA / BioStudies / supplement 是否还有关键非本地组成部分。
