# scRNA-seq Skill and MCP Plan

本文档把 OpenBioScience scRNA-seq 复现流程拆成可制作的 skills 与 MCP。核心原则是：

```text
skills = agent 的知识库 / runbook / 判断规则 / workflow 路由
MCP    = 受控检索 / 数据下载 / 文件检查 / 环境解析 / runner / 结构化输出
```

因此 skill 不直接替代 Seurat、Scanpy、CellChat、inferCNV、Monocle 或数据库 API。skill 负责告诉 agent **什么时候做什么、怎么判断边界、该调用哪个 MCP/环境、如何解释输出**；MCP 负责把具体操作变成可审计、可复用、可失败恢复的接口。

## 关键设计判断

### 1. Environment 不应写死 NAS 绝对路径

当前 NAS 路径：

```text
<OPENBIOSCIENCE_RUNTIME_ROOT>
```

只是开发期安装事实。长期 contract 不应把它写进 skill。skill 只引用逻辑环境：

```text
environmentRef: sc-r-singlecell
environmentRef: sc-py-singlecell
environmentRef: sc-cci-r
```

实际路径应由 runtime resolver / MCP 解析：

```text
OPENBIOSCIENCE_RUNTIME_ROOT
  + environments/official/<environmentRef>
```

后续 environment index 应优先使用相对路径：

```yaml
schema: openbioscience.environment-index.v1
runtimeRoot: ${OPENBIOSCIENCE_RUNTIME_ROOT}
environments:
  sc-r-singlecell:
    path:
      conda: environments/official/sc-r-singlecell
      entry: entrypoints/run-r
```

### 2. P0 不宜把所有下游分析一次性做成 MCP

P0 应先做两类能力：

- `bio_runtime`：当前提供环境解析、workflow validation、plot input validation 和输出 summary skeleton；矩阵检查、对象准备、受控 workflow runner 是后续能力。
- `bio_source` / `research_evidence` 扩展：数据 accession、paper、数据库记录、marker/source evidence。

CCI、Trajectory、GRN、CNV 等先做 skill runbook 和 workflow spec；等主线 import/QC/cluster/annotation 能稳定跑通后，再把高频 workflow 接入 `bio_runtime.run_workflow`，不急着为每个流程单独做一个 MCP server。

## 推荐 Skill 分层

### P0: 主链必须补齐

| Skill | 类型 | 主要职责 | 依赖 MCP | 主要环境 |
| --- | --- | --- | --- | --- |
| `bio-scrna-reproduction` | router | scRNA-seq 文章复现总入口；连接 paper、data、environment、analysis、artifact；判断当前任务进入哪条子流程 | `research_evidence`、`science_artifact`、`bio_runtime`、`bio_source` | none |
| `bio-environment-routing` | runbook | 教 agent 如何选择 `environmentRef`，如何读取 environment index，如何判断官方/用户环境，如何避免写死 NAS 绝对路径 | `bio_runtime.status`、`bio_runtime.list_environments`、`bio_runtime.probe_environment` | all |
| `bio-data-resolution` | runbook | 判断本地是否已有数据；缺失时从 paper accession、GEO/SRA/ArrayExpress/EGA/BioStudies/supplementary data 寻找数据；建立 data manifest | `bio_source.resolve_accession`、`bio_source.list_files`、`research_evidence.search/read` | none |
| `bio-singlecell-import` | runbook | 判断 raw counts / processed expression / metadata / H5AD / Seurat/SCE；定义 object import 与 claim boundary | current: `bio_runtime.validate_workflow`; future: `inspect_matrix`、`inspect_metadata`、`prepare_object` | `sc-py-singlecell`、`sc-r-singlecell` |
| `bio-qc-preprocess` | runbook | QC、doublet/ambient/cell-cycle/mito-ribo 判断、normalization、HVG、sample-level QC | current: `bio_runtime.validate_workflow`; future: `run_workflow` | `sc-r-singlecell`、`sc-py-singlecell` |
| `bio-batch-dim-cluster` | runbook | integration/batch correction 决策、PCA/UMAP/t-SNE、clustering、多 resolution 评估 | current: `bio_runtime.validate_workflow`; future: `run_workflow` | `sc-r-singlecell`、`sc-py-singlecell` |
| `bio-marker-optimization` | runbook | cluster marker ranking、marker 稳定性、sample-aware marker 检查、伪重复风险提示 | current: `bio_runtime.validate_workflow`、`bio_knowledge.resolve_gene_set`; future: `run_workflow` | `sc-r-singlecell`、`sc-r-plot` |
| `bio-cell-annotation` | runbook | 免疫/肿瘤/基质等 cell type/state 注释；marker/atlas/paper evidence；跨物种 marker 注意事项 | `bio_knowledge.search_marker`、`bio_knowledge.search_atlas`、`research_evidence.search/read` | `sc-r-singlecell`、`sc-py-singlecell` |
| `bio-result-interpretation` | runbook | 将结果分成 supported / conditional / blocked；防止 processed expression 被当作 raw counts；输出 report 结构 | `science_artifact` | none |

### P0.5: 很快需要补齐

| Skill | 类型 | 主要职责 | 依赖 MCP | 主要环境 |
| --- | --- | --- | --- | --- |
| `bio-pseudobulk-de` | runbook | sample/patient-aware DE；避免 cell-level pseudoreplication；定义 edgeR/DESeq2/limma 的输入边界 | current: `bio_runtime.validate_workflow`; future: `run_workflow` | `sc-r-singlecell` 或后续 bulk/R env |
| `bio-signature-scoring` | runbook | CMS-like score、immune score、response signature、module score、GSVA/AUCell；记录 gene set 来源 | current: `bio_knowledge.resolve_gene_set`、`bio_runtime.validate_workflow`; future: `run_workflow` | `sc-r-singlecell`、`sc-r-clinical` |
| `bio-plot-reporting` | runbook | UMAP、QC、marker dotplot/heatmap、composition plot、publication figure output contract | current: `bio_plot.render_plan`、`science_artifact`; future: runner-backed plotting | `sc-r-plot` |

### P1: 独立下游分析模块

你列出的独立流程都适合作为单独 skill。建议如下：

| Skill | 主要职责 | 是否需要独立 MCP | 推荐方式 |
| --- | --- | --- | --- |
| `bio-cci-analysis` | CellChat/CellPhoneDB/NicheNet 等 CCI 前置条件、过滤规则、结果解释边界 | 不先做独立 MCP | 当前先做 skill + `validate_workflow`；后续接 `run_workflow(workflowId="cci_*")` |
| `bio-clinical-response` | response/non-response、treatment group、clinical metadata、survival/ORR/PFS 边界 | 不先做独立 MCP | 先走 `bio_runtime` + `sc-r-clinical` |
| `bio-trajectory-pseudotime` | Monocle/Slingshot/dynverse/palantir 等轨迹前置条件、root 选择、解释边界 | 不先做独立 MCP | 先走 `bio_runtime` + `sc-r-trajectory` |
| `bio-grn-activity` | SCENIC/GENIE3/decoupleR/DoRothEA/VIPER，区分 GRN inference 与 TF activity | 不先做独立 MCP | 先走 `bio_runtime` + `sc-network-grn-r` |
| `bio-tumor-cnv` | inferCNV/copyKAT/honeyBADGER 等 malignant CNV 推断、reference cell 选择、解释边界 | 不先做独立 MCP | 先走 `bio_runtime` + `sc-r-tumor-cnv` |

### P2: 后续场景

| Skill | 触发条件 |
| --- | --- |
| `bio-cytof-analysis` | 本地有 FCS / CyTOF 原始文件，或 demo 明确进入 CyTOF |
| `bio-spatial-multiome` | 空间转录组 / multiome 进入 P1/P2 |
| `bio-cross-species-mapping` | mouse/human marker 或 ortholog mapping 成为重复需求 |
| `bio-atlas-reference-mapping` | 需要系统化 CellTypist/scArches/Azimuth/reference mapping |
| `bio-reproducibility-audit` | 需要检查 notebook/script/sessionInfo/seed/output/provenance 是否可复现 |

## 需要新增或扩展的 MCP

### MCP 1: `openscience-bio-runtime`

优先级：P0。

工具名：

```text
bio_runtime
```

职责：先把环境解析、workflow contract validation、plot template validation 和输出 summary skeleton 收敛到一个 control-plane tool；对象检查和受控 runner 是后续扩展。

当前 skeleton actions：

| Action | 职责 |
| --- | --- |
| `status` | 返回 runtime root、environment index 位置、官方环境安装状态 |
| `list_environments` | 返回轻量 environment 列表，只含 `path/build/resources/supports` 摘要 |
| `resolve_environment` | 将 `environmentRef` 解析为实际 conda/docker/entrypoint；不暴露完整包矩阵 |
| `probe_environment` | 当前只做 path-level probe；后续再接 import/CLI smoke |
| `list_workflows` | 返回已注册 workflow id，如 `import_summary`、`seurat_qc`、`cluster_markers` |
| `validate_workflow` | 校验 workflow id、必需字段和候选 environmentRef，不执行脚本 |
| `list_plot_templates` | 返回本地 plot template catalog |
| `validate_plot_inputs` | 校验 plot template 输入字段 |
| `summarize_outputs` | 对允许 root 内的 workflow 输出做存在性 summary skeleton |

后续 runner/provider actions：

| Action | 职责 |
| --- | --- |
| `inspect_matrix` | 检查 mtx/h5/h5ad/rds/table 的维度、dtype、整数性、稀疏度、gene/barcode 轴 |
| `inspect_metadata` | 检查 metadata key、join rate、sample/patient/condition/response 字段完整性 |
| `prepare_object` | 生成 AnnData/Seurat/SCE 对象或 conversion plan |
| `run_workflow` | 按 workflow id 运行受控脚本，记录 command、env、cwd、log、outputs |

最小返回格式：

```json
{
  "schema": "openbioscience.bio_runtime.result.v1",
  "action": "validate_workflow",
  "status": "supported|conditional|blocked",
  "environmentRef": "sc-py-singlecell",
  "inputPaths": [],
  "outputPaths": [],
  "logPath": "...",
  "warnings": [],
  "timestamp": 0
}
```

### MCP 2: `openscience-bio-source`

优先级：P0/P1，取决于 `research_evidence` + `bio_tools` 是否足够覆盖。

工具名：

```text
bio_source
```

职责：数据 accession、文件列表、下载计划、manifest 和校验。它不负责解释科学结果。

建议 actions：

| Action | 职责 |
| --- | --- |
| `resolve_accession` | 解析 GEO/SRA/ArrayExpress/EGA/BioStudies/Zenodo/Figshare/supplementary accession |
| `list_files` | 返回可用文件、大小、格式、访问限制、是否需要授权 |
| `plan_download` | 生成下载计划；大文件和受控数据不自动下载 |
| `download_file` | 执行受控下载，记录 checksum/size/source |
| `build_data_manifest` | 生成 case-level data manifest |
| `verify_local_assets` | 对本地文件做 checksum、size、expected format 检查 |

边界：

- Paper/PubMed/PMC 文献检索优先继续使用 `research_evidence`。
- `bio_source` 只处理数据资产和 accession，不做文献综述。
- EGA/dbGaP/controlled access 只能返回申请/阻塞状态，不应绕过授权。

### MCP 3: `openscience-bio-knowledge`

优先级：P1。Annotation 和 signature 开始系统化后需要。

工具名：

```text
bio_knowledge
```

职责：marker、atlas、cell ontology、gene set、ligand-receptor reference 的受控查询和版本记录。

建议 actions：

| Action | 职责 |
| --- | --- |
| `search_marker` | 查询 CellMarker、PanglaoDB、HPA、Azimuth refs、CellTypist refs 等 marker/source |
| `search_atlas` | 查询 atlas paper / reference dataset / cell atlas metadata |
| `resolve_gene_set` | 查询 MSigDB、Reactome、GO、custom signature 文件，返回版本和来源 |
| `map_orthologs` | human/mouse ortholog mapping，记录 source 和 mapping ambiguity |
| `list_lr_database` | 查询 CellChatDB、OmniPath、CellPhoneDB、NicheNet ligand-receptor resources |
| `normalize_gene_symbols` | gene symbol / Ensembl id / alias normalization |

边界：

- `bio_knowledge` 只返回 evidence-backed candidates，不直接决定最终注释。
- 最终 annotation 仍由 `bio-cell-annotation` skill 根据 marker、cluster marker、metadata 和 paper context 做判断。
- 所有 marker/atlas/signature 来源必须能被 `science_artifact` 注册为 evidence。

## 用户列出的模块是否需要调整

| 用户提出的模块 | 判断 | 建议调整 |
| --- | --- | --- |
| 环境判断 skill | 必须 | 做成 `bio-environment-routing`；只写 `environmentRef`，路径交给 `bio_runtime.resolve_environment` |
| 数据判断 skill | 必须 | 做成 `bio-data-resolution`；本地检查和下载计划由 `bio_source` / `bio_runtime` 执行 |
| 数据读取与预处理 skill | 必须 | 建议拆成 `bio-singlecell-import` 和 `bio-qc-preprocess`，因为输入语义判断和 QC 决策是两个风险点 |
| 降维聚类、群类优化、marker 优化 skill | 必须 | 建议拆成 `bio-batch-dim-cluster` 与 `bio-marker-optimization`；integration/batch 和 marker 稳定性都容易出错 |
| 注释 skill | 必须 | 做成 `bio-cell-annotation`；marker/atlas 检索由 `bio_knowledge` 或 `research_evidence` 支撑 |
| CCI / clinical / trajectory / pseudotime / GRN / CNV | 必须，但分阶段 | 都做独立 skill；当前先统一走 `bio_runtime.validate_workflow`，后续接 `run_workflow`，暂不为每个流程做独立 MCP |

## 还需要补充的 Skills

建议补充 5 个你没有明确列出但对 scRNA-seq 复现很关键的 skills：

| Skill | 为什么需要 |
| --- | --- |
| `bio-scrna-reproduction` | 总路由，避免 agent 在数据、环境、分析、报告之间乱跳 |
| `bio-pseudobulk-de` | 避免把 cell 当 replicate，是 scRNA-seq 论文复现的高风险点 |
| `bio-signature-scoring` | 文章复现经常依赖 pathway/module score/CMS/response signature |
| `bio-plot-reporting` | 标准输出图、表、report contract，保证 artifact 可检查 |
| `bio-result-interpretation` | 把结果解释约束在 supported/conditional/blocked，防止过度声称复现 |

## 建议实施顺序

### Step 1: 先做最小闭环

1. `bio-environment-routing`
2. `bio-data-resolution`
3. `bio-singlecell-import`
4. `openscience-bio-runtime` 的 `status/list_environments/resolve_environment/validate_workflow`

目标：不跑完整分析，只证明 agent 能找到环境、定位数据、判断当前 workflow contract 是否足够支撑下一步。

### Step 2: 跑通 human_CRC 主线

1. `bio-qc-preprocess`
2. `bio-batch-dim-cluster`
3. `bio-marker-optimization`
4. `bio-cell-annotation`
5. future `bio_runtime.run_workflow(import_summary/seurat_qc/cluster_markers)` or approved runner equivalent

目标：用 `human_CRC` 产出 object summary、QC summary、UMAP、cluster marker、初步 annotation。

### Step 3: 加入文章级复现能力

1. `bio-signature-scoring`
2. `bio-cci-analysis`
3. `bio-result-interpretation`
4. `bio-plot-reporting`

目标：补 CRC CMS-like scoring、初步 CCI、标准 report/artifact。

### Step 4: 扩展到 ICI 和 SARC

1. `bio-clinical-response`
2. `bio-pseudobulk-de`
3. `bio-trajectory-pseudotime`
4. `bio-grn-activity`
5. `bio-tumor-cnv`

目标：支持 response comparison、trajectory/GRN/CNV 等独立模块，但仍保持每个 claim 的数据语义边界。

## 当前推荐结论

你的 skill 划分方向基本正确。需要补充的是：

1. 增加一个总路由 skill：`bio-scrna-reproduction`。
2. 把“数据读取与预处理”拆成输入语义判断与 QC/preprocess 两层。
3. 把“降维聚类 marker”拆出 batch/integration 与 marker 稳定性判断。
4. 增加 pseudobulk DE、signature scoring、plot/reporting、result interpretation。
5. MCP 不应按每个分析主题分散创建；P0 先做 `bio_runtime`，再视需要增加 `bio_source` 和 `bio_knowledge`。
6. 所有环境路径长期都应走 `environmentRef` + resolver，不写 NAS 绝对路径。
