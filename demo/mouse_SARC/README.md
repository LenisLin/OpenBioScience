# mouse_SARC Demo Case

## Paper Snapshot

- Title: *High-Dimensional Analysis Delineates Myeloid and Lymphoid Compartment Remodeling during Successful Immune-Checkpoint Cancer Therapy*
- Year: 2018
- Journal: *Cell*
- Disease context: T3 sarcoma immune-checkpoint therapy model
- Species: mouse
- Assay focus: scRNA-seq of tumor-infiltrating immune cells with CyTOF companion analysis

本 case 对 harness 的关键要求是：

1. 支持 mouse immune scRNA-seq 导入和 annotation。
2. 支持 treatment-specific lymphoid / myeloid remodeling 比较。
3. 预留 Monocle / cross-species macrophage signature 路径。
4. 为后续 CyTOF / FCS 分析保留明确入口。
5. 对 paper correction / erratum 进行显式检查。

## Local Assets Available Now

| 文件 | 当前判断 | 说明 |
| --- | --- | --- |
| `High-Dimensional Analysis Delineates Myeloid and Lymphoid Compartment Remodeling during Successful Immune-Checkpoint Cancer Therapy.pdf` | paper context | 本地论文 PDF |
| `data/SARC_GSE119352_mouse_aPD1aCTLA4_expression.h5` | sparse expression matrix, likely processed | 本地检查显示为 HDF5 sparse matrix；`matrix/shape = [13391, 13789]`；`matrix/data` 为 `float32` 且抽样值非整数 |
| `data/SARC_GSE119352_mouse_aPD1aCTLA4_CellMetainfo_table.tsv` | metadata / annotation | 含 UMAP、major/minor lineage、cluster、treatment |

### Local evidence assessment

当前本地证据能支撑 scRNA 入口，但**不能**支撑完整 Gubin workflow，原因有两个：

1. 本地 `.h5` 当前更像 processed expression，而不是已证实的 raw counts。
2. 本地没有 CyTOF / FCS 原始文件，因此 paper 的 CyTOF 支线当前只是条件性支持。

此外，这篇文章已知存在 correction / update 风险，因此 `paper_errata_check` 不是可选项。

## Target Reproduction Scope

### P0 safe targets

第一轮建议收敛为：

1. 导入 mouse scRNA expression matrix 与 metadata。
2. 校验 lymphoid / myeloid major-minor lineage annotation。
3. 比较不同 treatment 下的 cluster abundance 和主要状态差异。
4. 生成 case-level immune remodeling summary。

### P1 / P2 targets

后续再推进：

1. macrophage-focused trajectory / pseudotime
2. cross-species macrophage signature mapping
3. CyTOF / FCS import、FlowSOM / diffcyt
4. 与 FlowRepository 的正式接入
5. figure-level correction-aware reproduction

## Current Reproducibility Boundary

### Supported now

当前本地资产较安全支持：

- sparse matrix import
- mouse immune annotation review
- treatment-specific structure comparison
- 基于 metadata 的 cluster abundance summary

### Conditionally supported

下列模块需要先补环境或外部数据：

- mouse state scoring
- macrophage / T cell program comparison
- cross-species signature interpretation
- trajectory / pseudotime

### Not yet safe to claim

当前还不应直接宣称：

- 已完成 CyTOF reproduction
- 已完成 strict Monocle reproduction
- 已完成与 paper correction 完全对齐的 figure interpretation

原因是：

1. 本地无 FCS / FlowRepository 数据。
2. 本地矩阵更像 processed expression。
3. correction / erratum 尚未进入标准化核查流程。

## Required Environments

| 环境 | 角色 |
| --- | --- |
| `sc-r-core` | mouse scRNA annotation、marker、R-side downstream |
| `sc-py-core` | HDF5 import、AnnData 互操作、Python-side对象转换 |
| `sc-r-cytof` | 后续 CyTOF / FCS / FlowSOM / diffcyt 支持 |
| `sc-legacy-repro` | 如需更严格对齐旧版 Monocle / Seurat / Cytometry 工具链 |

## Required Skills And MCP

### Skills

| Skill | 作用 |
| --- | --- |
| `paper_triage_skill` | 抽取 accession、software version、scRNA/CyTOF 双路径 |
| `paper_errata_check_skill` | 检查 correction / update / erratum |
| `data_resolution_skill` | 解析本地 scRNA 数据与外部 FlowRepository/FCS 的对应关系 |
| `singlecell_import_skill` | 导入 `.h5` 并判断其矩阵语义 |
| `immune_annotation_skill` | mouse immune annotation |
| `tumor_immune_subtyping_skill` | macrophage / T cell / myeloid remodeling 解释 |
| `trajectory_skill` | Monocle / Slingshot 等路径，后续启用 |
| `cross_species_signature_skill` | mouse-human homolog / signature mapping |
| `cytof_analysis_skill` | FCS / CyTOF 专用分析 |
| `result_interpretation_skill` | 把结构变化、state 和 paper claims 对齐 |

### MCP

| MCP | 作用 |
| --- | --- |
| `local_workspace_mcp` | 检查 `.h5`、metadata 和 manifest |
| `paper_mcp` | 解析 paper methods、software version 和 correction 入口 |
| `accession_mcp` | 获取 GEO / FlowRepository metadata |
| `object_io_mcp` | `.h5` 对象转换和 feature id 校验 |
| `analysis_runner_mcp` | 受控运行 annotation、comparison、trajectory |
| `marker_signature_mcp` | 获取 ImmGen / mouse immune marker / pathway signatures |
| `cytof_mcp` | 后续 FCS / CyTOF 数据接入 |
| `literature_mcp` | 对 remodeling 结果做文献解释 |

## Minimal Recommended Workflow

1. 先用 `paper_mcp` + `paper_errata_check_skill` 明确 paper 更新状态。
2. 用 `local_workspace_mcp` 和 `object_io_mcp` 检查 `.h5` 结构与 metadata 对齐。
3. 完成 mouse immune annotation review 和 treatment-specific abundance summary。
4. 在明确 matrix semantics 后，再决定是否允许更强的 state scoring 和 trajectory。
5. 只有在接入 FlowRepository / FCS 后，才把 CyTOF 路径升级为可执行主线。

## Current Blockers And Next Data Needed

1. 需要显式接入 correction / errata 检查。
2. 需要确认 `.h5` 是否为 processed expression，以及它能安全支撑到哪类下游分析。
3. 需要补 FlowRepository / FCS 资产，CyTOF 支线才能真正启动。
4. 需要补 ImmGen / homolog mapping 支撑 cross-species interpretation。
