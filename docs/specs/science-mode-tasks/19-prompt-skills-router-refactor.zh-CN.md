# Science Mode Prompt 与 Skills Router 重构任务书

日期：2026-07-02
范围：system prompt、内置 Science skills、默认 skill 装载、设置页文案
不包含：`research_evidence` 新 provider 网关、JimLiu bio-tools MCP 接入

## 目标

把 Science Mode 从“默认加载几百个外部 leaf skills”收敛为：

1. 一张短 system prompt，负责不可违反的运行契约。
2. 一个核心科研纪律 skill：`openscience-science`。
3. 一个 artifact MCP 手册：`openscience-science-artifact`。
4. 一个首次 onboarding skill：`openscience-onboarding`。
5. 一个研究流程 router：`openscience-workflow`。
6. 六个领域 router：writing、databases、biomodels、singlecell、compute、empirical。
7. 外部 leaf skills 仍然 materialize，但由 router 按需选择，不再全部默认装载。

## 设计原则

- System prompt 只写硬约束，不写长篇 payload 示例。
- Artifact 细节只放在 `openscience-science-artifact`。
- 外部 skill 是工作流知识，不是证据。
- 所有可见文件必须通过 artifact 或 snapshot 进入 provenance。
- 老配置如果保存了旧的 materialized default，自动迁移到新 router default。
- `research_evidence` 目前不扩展 provider；数据库 MCP 合并先只在技能层预留路线。

## 默认 Skills

新的默认列表：

```text
openscience-science
openscience-science-artifact
openscience-onboarding
openscience-workflow
openscience-writing
openscience-databases
openscience-biomodels
openscience-singlecell
openscience-compute
openscience-empirical
```

旧默认列表兼容：

- `openscience-science + openscience-science-artifact + openscience-science-vendor-catalog`
  自动升级为新默认。
- 旧的 `core + artifact + workflow + 352 materialized leaf skills`
  自动升级为新默认。
- 用户手动自定义的 skill ids 不强制覆盖。

## Skills 合并方案

### `openscience-science`

角色：科研纪律层。

保留：

- real execution；
- evidence first；
- claimType；
- artifact/snapshot/provenance 原则；
- viewer discipline 的高层选择。

删除/下沉：

- 详细 viewer JSON payload；
- 具体 K-Dense/AERS/JimLiu leaf 列表；
- 重复的 `science_artifact` action 手册。

### `openscience-science-artifact`

角色：唯一 artifact MCP 协议手册。

保留独立，不合并：

- `status/get/list/create/patch/replace/append/version/snapshot/publish/annotate/focus_page`；
- `baseRevision` 更新纪律；
- 文件 role 与 snapshot SOP；
- viewer payload 示例；
- page/focus/display 规则。

### `openscience-onboarding`

角色：首次项目画像。

触发：

- 没有 `.openscience/onboarding-profile.md`；
- `.openscience/project.json` 没有 profile summary；
- 用户明确要求更新研究偏好。

输出：

- `.openscience/onboarding-profile.md`；
- `user_input` evidence；
- snapshot includePath role=`reference`。

不做：

- 不跑分析；
- 不问 secrets；
- 不改已有项目规则，除非用户确认。

### `openscience-workflow`

角色：DeepScientist 阶段 router。

继续管理：

- intake/scout/baseline/idea/experiment/analysis/decision/finalize；
- writing/review/rebuttal/figure 的阶段选择；
- `.openscience/workflow/` 的项目计划和 ledger。

与其他 router 的边界：

- 它决定“研究流程阶段”；
- 领域 router 决定“用哪个领域 leaf skill 或包”；
- artifact/evidence 仍归 `science_artifact`。

### `openscience-writing`

合并：

- DeepScientist：`ds-scout`, `ds-paper-outline`, `ds-write`,
  `ds-review`, `ds-rebuttal`, `ds-nature-data`, `ds-nature-figure`,
  `ds-nature-polishing`, `ds-nature-paper2ppt`, `ds-figure-polish`。
- K-Dense：`kdense-literature-review`, `kdense-paper-lookup`,
  `kdense-scientific-writing`, `kdense-scientific-visualization`,
  `kdense-pdf`, `kdense-docx`, `kdense-pptx`, `kdense-markitdown`。
- AERS：`aer-lit-review-*`, `aer-paper-*`, `aer-referee-report`,
  `aer-citation-fidelity`, `aer-reference-verify`, `aer-marp-*`。
- Claude Science 适配映射：`cs-pdf-explore`,
  `cs-figure-style`, `cs-figure-composer`, `cs-paper-narrative`,
  `cs-indication-dossier`。文献综述正式版本继续使用
  `kdense-literature-review`。

### `openscience-databases`

合并：

- 当前：`research_evidence(action="search"|"read")`。
- K-Dense：`kdense-database-lookup`, `kdense-paper-lookup`,
  `kdense-research-lookup`, `kdense-cellxgene-census`, `kdense-gget`,
  `kdense-bioservices`, `kdense-depmap`, `kdense-primekg`。
- AERS：`aer-openalex`, `aer-arxiv`, `aer-unpaywall-api`。
- JimLiu 未来映射：PubMed、Europe PMC、bioRxiv、arXiv、UniProt、
  AlphaFold、PDB/EMDB、Ensembl/BioMart、Reactome、ClinVar、dbSNP、
  gnomAD、GWAS、GEO、ArrayExpress、ChEMBL、ChEBI、BindingDB、ZINC、
  CellGuide、GTEx、ENCODE、JASPAR、IntAct、ComplexPortal。

当前不实现：

- 不新增 `research_evidence(action="call")`；
- 不注册 JimLiu 247 个 bio-tools 为顶层 MCP。

### `openscience-biomodels`

合并：

- K-Dense：`kdense-biopython`, `kdense-rdkit`, `kdense-datamol`,
  `kdense-deepchem`, `kdense-medchem`, `kdense-molfeat`,
  `kdense-diffdock`, `kdense-esm`, `kdense-molecular-dynamics`,
  `kdense-torchdrug`, `kdense-glycoengineering`。
- Claude Science 适配映射：`cs-alphafold2`, `cs-boltz`,
  `cs-chai1`, `cs-openfold3`, `cs-esmfold2`, `cs-fair-esm2`,
  `cs-proteinmpnn`, `cs-ligandmpnn`, `cs-solublempnn`。Docking
  正式版本继续使用 `kdense-diffdock`。

Artifact 要求：

- structure/molecule artifact；
- source database evidence；
- parser/validation evidence；
- viewer metadata；
- source/code/log/environment snapshot。

### `openscience-singlecell`

合并：

- K-Dense：`kdense-anndata`, `kdense-scanpy`, `kdense-scvi-tools`,
  `kdense-scvelo`, `kdense-cellxgene-census`, `kdense-gget`,
  `kdense-pysam`, `kdense-gtars`, `kdense-tiledbvcf`,
  `kdense-polars-bio`, `kdense-pydeseq2`。
- Claude Science 适配映射：`cs-scgpt`。scVI 正式版本继续使用
  `kdense-scvi-tools`。
- DeepScientist figure/writing skills 用于最终图表和报告。

Artifact 要求：

- H5AD/AnnData 作为 dataset/run_bundle；
- figures、markers、logs、notebooks；
- Vitessce 必须先有兼容 config/data 和 validation evidence。

### `openscience-compute`

合并：

- DeepScientist：`ds-science`, `ds-experiment`, `ds-analysis-campaign`。
- K-Dense：`kdense-modal`, `kdense-optimize-for-gpu`, `kdense-dask`,
  `kdense-nextflow`, `kdense-latchbio-integration`,
  `kdense-dnanexus-integration`。
- Claude Science 适配映射：`cs-compute-env-setup`,
  `cs-remote-compute-ssh`, `cs-remote-compute-modal`,
  `cs-managed-model-endpoints`, `cs-using-model-endpoint`。

边界：

- 不直接授予 HPC/云权限；
- 新 host、付费服务、凭据、GPU 大任务都要用户授权。

### `openscience-empirical`

合并：

- AERS：`aer-auto-empirical-research-skills`,
  `aer-full-empirical-analysis-skill*`, `aer-statspai-skill`,
  `aer-causal-inference-*`, `aer-did-analysis`, `aer-iv-estimation`,
  `aer-rdd-analysis`, `aer-panel-data`, `aer-ols-regression`,
  `aer-data-*`, `aer-stata-*`, `aer-thematic-analysis`,
  `aer-slr-prisma`。
- K-Dense：`kdense-statsmodels`, `kdense-statistical-analysis`,
  `kdense-shap`, `kdense-geopandas`。

Artifact 要求：

- `regression_table`；
- `model_diagnostic`；
- `causal_dag`；
- `survey_codebook`；
- `geospatial_map`；
- `qualitative_coding`；
- `replication_package`。

## System Prompt 修改

已收敛为这些部分：

- Runtime Contract；
- Required Control Surfaces；
- Science SOP；
- Skill Routing；
- Final Answer；
- Default Skills。

已修复：

- `openscience-user-input` 改为实际 `user_input`；
- `Project shelf` 改为 artifact Files view / Preview frame / chat output；
- 不再把 352 个 leaf skills 描述为默认装载；
- 不再在 system prompt 中放大段 viewer payload 示例。

## 设置页修改

Science 设置页应显示：

- 默认启用 10 个一等 skills；
- 外部 leaf skills 为 discoverable catalog；
- 默认卡片分为 Core、Onboarding、Workflow、Domain Routers、Leaf Catalog。

## 验收 Checklist

- [x] 默认 Science skills 不包含 `ds-*`, `kdense-*`, `aer-*` leaf ids。
- [x] 老 catalog-only 默认能迁移到新默认。
- [x] 老 materialized-leaf 默认能迁移到新默认。
- [x] `openscience-science` 不再重复 artifact MCP 详细协议。
- [x] `openscience-science-artifact` 保持独立。
- [x] 新增 onboarding skill。
- [x] 新增 6 个领域 router skills。
- [x] vendor catalog 文案改为 migration-only。
- [x] 设置页文案说明 router/default/leaf catalog 的关系。
- [ ] 后续再实现 `research_evidence` provider gateway。
- [ ] 后续再 materialize JimLiu/science-skills leaf skills。
