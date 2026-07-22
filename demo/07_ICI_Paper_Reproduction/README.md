# human_ICI Demo Case

## Paper Snapshot

- Title: *High systemic and tumor-associated IL-8 correlates with reduced clinical benefit of PD-L1 blockade*
- Year: 2020
- Journal: *Nature Medicine*
- Disease context: immunotherapy-treated metastatic cancer cohorts, with local demo focused on BLCA / aPDL1 single-cell assets
- Species: human
- Assay focus: immune scRNA-seq with response-state comparison

本 case 对 harness 的关键要求是：

1. 能导入 immune-focused expression matrix 和 metadata。
2. 能做 responder / nonresponder 与 PBMC / tumor 的结构比较。
3. 能围绕 IL8/CXCL8-related myeloid state、antigen-presentation programs 做解释。
4. 能为后续 clinical / survival-aware analysis 预留路径。

## Local Assets Available Now

| 文件 | 当前判断 | 说明 |
| --- | --- | --- |
| `High systemic and tumor-associated IL-8 correlates with reduced clinical benefit of PD-L1 blockade.pdf` | paper context | 本地论文 PDF |
| `data/BLCA_GSE145281_aPDL1_expression.h5` | sparse expression matrix, likely processed | 本地检查显示为 HDF5 sparse matrix；`matrix/shape = [13502, 14474]`；`matrix/data` 为 `float32` 且抽样值非整数 |
| `data/BLCA_GSE145281_aPDL1_CellMetainfo_table.tsv` | metadata / annotation | 含 UMAP、cell type、cluster、sample、response、source、gender、stage、treatment |

### Local evidence assessment

这里最关键的科学判断是：

- 这个 `.h5` **结构上**像 10x-style sparse matrix；
- 但 `matrix/data` 抽样为非整数 float 值，当前更像 **processed expression**，而不是 raw UMI counts。

这意味着本 case 适合驱动 import、annotation、state comparison 和部分 signature analysis，但**不应自动视为严格 counts-based DE / pseudobulk 输入**。

## Target Reproduction Scope

### P0 safe targets

第一轮建议收敛为：

1. 导入 `.h5` expression matrix 和 metadata。
2. 校验 immune major/minor lineage 与 metadata 的一致性。
3. 进行 responder / nonresponder 与 PBMC / tumor 的组成结构比较。
4. 进行 IL8/CXCL8-related myeloid state 的初步基因与 signature 检查。
5. 产出 case-level response comparison report。

### P1 / P2 targets

后续再推进：

1. pseudobulk DE / edgeR / limma
2. antigen-presentation pathway heatmap
3. 更严格的 IL8-high vs IL8-low 分组比较
4. OS / ORR / survival 相关模型
5. 与更完整 trial-level clinical data 的联动

## Current Reproducibility Boundary

### Supported now

基于当前本地资产，可以相对安全地支持：

- sparse matrix import
- metadata alignment
- immune lineage review
- responder / nonresponder 的结构核对
- PBMC / tumor 来源的结构比较

### Conditionally supported

下列模块需要先验证 matrix semantics 或补 clinical 能力：

- IL8/CXCL8-related state scoring
- myeloid-specific enrichment analysis
- response biomarker reporting
- limited pathway / signature comparison

### Not yet safe to claim

当前还不应直接宣称：

- 已完成严格 counts-based DE
- 已完成 pseudobulk / edgeR reproduction
- 已完成 paper-wide OS / ORR / survival reproduction
- 已覆盖 paper 涉及的全部 mUC / mRCC cohort 结论

原因是：

1. 本地 `.h5` 当前更像 processed expression，不是已证实的 raw counts。
2. 本地 demo 主要是 BLCA / aPDL1 单细胞子集，不等于论文全部临床范围。
3. 完整 survival / response 结论依赖更大的 trial-level clinical data。

## Required Environments

| 环境 | 角色 |
| --- | --- |
| `sc-py-core` | HDF5 / AnnData / Scanpy / LIANA / Python-side import 与互操作 |
| `sc-r-core` | annotation、signature、R-side downstream 分析 |
| `sc-r-clinical` | 后续 survival、response biomarker、GDC/TCGA 关联 |
| `sc-legacy-repro` | 如需对齐 Seurat v3 / SingleR 旧版本行为时使用 |

## Required Skills And MCP

### Skills

| Skill | 作用 |
| --- | --- |
| `paper_triage_skill` | 抽取 cohort、accession、software version 和主要分析模块 |
| `data_resolution_skill` | 判断本地 BLCA 子集与原文更大 cohort 的关系 |
| `singlecell_import_skill` | 识别 `.h5` 的矩阵语义和 metadata 契约 |
| `immune_annotation_skill` | immune lineage annotation 与核对 |
| `response_biomarker_skill` | responder / nonresponder / IL8-high-low 分析策略 |
| `enrichment_signature_skill` | antigen presentation / inflammatory / Reactome 类 pathway 分析 |
| `pseudobulk_de_skill` | 仅在确认 raw-count 合法时启用 |
| `result_interpretation_skill` | 把结构差异、state scoring 与论文 claims 对齐 |
| `methods_writing_skill` | 生成 case-level methods / report |

### MCP

| MCP | 作用 |
| --- | --- |
| `local_workspace_mcp` | 检查 `.h5`、metadata、文件形态和 manifest |
| `paper_mcp` | 提取 paper 中的 cohort / accession / methods / corrections |
| `object_io_mcp` | 将 `.h5` 转为 AnnData / Seurat 兼容对象并校验 feature ids |
| `analysis_runner_mcp` | 受控运行 import、annotation、signature、comparison |
| `marker_signature_mcp` | 获取 immune marker、IL8-related gene sets、Reactome signatures |
| `literature_mcp` | 对 IL8 / myeloid / antigen presentation 结果做证据解释 |
| `clinical_cancer_mcp` | 后续接 clinical / survival 数据时启用 |

## Minimal Recommended Workflow

1. 用 `paper_mcp` + `paper_triage_skill` 明确原文临床范围与本地 BLCA demo 子集的关系。
2. 用 `local_workspace_mcp` 和 `object_io_mcp` 检查 `.h5` 结构与 feature ids。
3. 先完成 matrix import、metadata merge 和 annotation review。
4. 运行 responder / nonresponder、PBMC / tumor 的组成比较。
5. 在 matrix semantics 明确后，再决定是否允许 response biomarker 和 enrichment 分析进入 P0 主线。
6. survival / ORR 相关步骤推迟到 `sc-r-clinical` 与外部 clinical data 接入之后。

## Current Blockers And Next Data Needed

1. 需要明确本地 `.h5` 是否为 log-normalized / processed expression，以及是否还能安全支持 counts-based downstream。
2. 需要验证 gene naming 和 IL8/CXCL8 相关特征是否可直接匹配。
3. 需要接入更完整的 trial-level clinical data，才能支撑 survival / ORR claims。
4. 需要环境和 runner 层明确区分“processed matrix support”和“raw-count support”。
