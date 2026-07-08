# OpenBioScience Skill Authoring Template

本文档是 OpenBioScience 后续新增 Bio skills 的制作模板。它吸收 AcademicForge `claude-science` skills 中值得保留的 runbook 风格，同时适配当前 OpenBioScience 的 Science Mode、official environments、built-in MCP 和 demo-driven reproduction 目标。

## 可以吸收的定义风格

AcademicForge `claude-science` skills 最值得吸收的部分不是具体包命令，而是它把 skill 写成 **可移植、可审计、可执行的科学工作流 runbook**。

对 OpenBioScience 有直接价值的规则：

| 风格要素 | 是否吸收 | OpenBioScience 采用方式 |
| --- | --- | --- |
| 强触发 `description` | 是 | 写清楚用户什么时候会触发、适用任务、边界和相邻 skill 路由 |
| Scope / route | 是 | 每个 skill 明确适用、不适用、下一步接哪个 skill |
| Deterministic helper | 是 | `kernel.py` 只做 config/schema/path/manifest/轻量检查，不承载主观科学判断 |
| 可复制命令或配置 | 是 | 给最小 YAML/config/command，但真实执行应通过受控 runner 或项目脚本 |
| Output contract | 是 | 每个 skill 必须定义标准输出文件、表格、图、日志和 provenance |
| Gotchas / troubleshooting | 是 | 单细胞 silent failure 必须写入 skill，而不是只写 textbook workflow |
| Progressive disclosure | 是 | 长 marker、atlas、version table、decision tree 放到 `references/` |
| Third-party metadata | 是，但需验证加载链路 | 记录数据库、API、模型权重、外部服务、license、terms/privacy |
| Pure skill 思路 | 是 | skill 负责判断与流程，MCP 负责检索/下载/受控执行，conda 负责稳定包环境 |

不应直接照搬的部分：

- 不能把 AcademicForge 中依赖 Claude Science 专有 runtime 的调用原样迁移。
- 不能让 skill 直接代替 MCP runner 或 conda environment。
- 不能把大型 marker atlas、数据库内容或完整包版本矩阵塞进 `SKILL.md`。
- 不能把“skill 指南”当作 evidence；可见结果仍要通过 `science_artifact` 注册。

## 推荐目录结构

```text
resources/skills/bio-<topic>/
  SKILL.md
  kernel.py                  # optional; deterministic helpers only
  references/
    decision-tree.md
    package-version-notes.md
    marker-source-policy.md
  scripts/
    run_<workflow>.R         # optional; real runner scripts
    run_<workflow>.py        # optional
  assets/
    example-config.yml       # optional
```

目录规则：

- `SKILL.md` 保持短而高密度，主要写触发、边界、workflow、output contract、gotchas、next routing。
- `references/` 放长表、决策树、marker panel、数据库来源、版本兼容说明。
- `scripts/` 放可重复执行脚本；脚本应由 MCP runner 或明确 runtime 调用，而不是让 agent 临时拼 shell。
- `kernel.py` 只做确定性辅助，例如 config validation、manifest generation、path normalization、matrix metadata sanity check。

## Frontmatter 模板

当前产品 skills 至少需要 `name` 和 `description`。下面的扩展字段建议用于 Bio 自定义 skill，但在进入正式 materialization / settings UI 前需要做加载验证。

```yaml
---
name: bio-singlecell-import
description: >
  Inspect and import single-cell expression inputs for OpenBioScience reproduction workflows:
  10x mtx/h5, h5ad, Seurat RDS, SingleCellExperiment, metadata tables, and processed sparse matrices.
  Use when the user asks to reproduce a single-cell paper, inspect demo data, convert an expression matrix
  into an analysis object, or decide whether downstream QC, DE, annotation, CCI, CNV, trajectory, or GRN
  claims are safe. For clustering workflows route to bio-seurat-core or bio-scanpy-core; for CCI route to
  bio-cci-analysis; for tumor CNV route to bio-tumor-cnv.
license: Apache-2.0
category: single-cell
requirements:
  - server-runtime
  - conda
metadata:
  display-name: Bio Single-cell Import
  environmentRefs:
    - sc-py-singlecell
    - sc-r-singlecell
third_party:
  - kind: database
    name: GEO
    provider: NCBI
    info_url: https://www.ncbi.nlm.nih.gov/geo/
  - kind: package
    name: Seurat
    info_url: https://satijalab.org/seurat/
  - kind: package
    name: Scanpy
    info_url: https://scanpy.readthedocs.io/
---
```

`description` 写法要求：

- 第一段写核心能力。
- 第二段写触发场景，尽量覆盖用户自然语言。
- 第三段写边界和相邻 skill 路由。
- 对单细胞任务，应显式写出 raw counts、processed expression、metadata、sample/condition/response 字段的判断责任。

## `SKILL.md` 正文模板

```markdown
# Bio Single-cell Import

This skill decides whether local single-cell inputs can be safely imported and what downstream claims they can support.

## OpenBioScience Adapter

- Treat `openscience-science`, `openscience-singlecell`, `openscience-compute`, and `openscience-science-artifact` as the controlling contract.
- Use this skill as workflow guidance, not as evidence.
- Record concrete inputs, code, logs, environment, outputs, warnings, and user decisions through `science_artifact`.
- Use `research_evidence` only for paper/database/source lookup.
- Use `bio_runtime` when object inspection, environment probing, object preparation, or controlled workflow execution is required.
- Do not install packages into official environments during analysis.
- Use `environmentRef` candidates: `sc-py-singlecell`, `sc-r-singlecell`.

## Scope

Use this skill for:

- 10x `matrix.mtx` / `features.tsv` / `barcodes.tsv`.
- 10x `.h5`.
- `.h5ad`.
- Seurat `.rds`.
- SingleCellExperiment objects.
- Expression matrix + metadata tables.
- HDF5 sparse matrices whose raw-count status is uncertain.

Route elsewhere for:

- Standard clustering after import -> `bio-seurat-core` or `bio-scanpy-core`.
- Pseudobulk DE -> `bio-pseudobulk-de`.
- Cell-cell interaction -> `bio-cci-analysis`.
- Tumor CNV -> `bio-tumor-cnv`.
- Trajectory -> `bio-trajectory-analysis`.

## Inputs

Required:

- `input_path`
- `input_format` or `format:auto`
- `species`
- `sample_key` when metadata is available

Recommended:

- `condition_key`
- `patient_key`
- `response_key`
- `batch_key`
- `gene_id_type`
- `barcode_column`

## Minimal Config

```yaml
input:
  path: demo/human_CRC/GSE132465/raw_umi/
  format: 10x_mtx
species: human
metadata:
  path: demo/human_CRC/GSE132465/annotation.tsv
  sample_key: sample_id
  patient_key: patient_id
output:
  object: objects/human_crc_imported.h5ad
  summary: reports/import_summary.json
  tables:
    - tables/input_shape.tsv
    - tables/metadata_key_completeness.tsv
  logs:
    - logs/import.log
```

## Workflow

1. Identify file format and expected object type.
2. Inspect matrix dimensions, dtype, integer-like status, sparsity, gene/barcode axes, and metadata keys.
3. Classify input semantics as `raw_counts`, `processed_expression`, `metadata_only`, or `unknown`.
4. Select the minimal environmentRef.
5. Prepare an object or object conversion plan.
6. Emit an import summary before any downstream analysis.
7. Register outputs and warnings through `science_artifact`.

## Output Contract

Every successful run should produce:

- `reports/import_summary.json`
- `tables/input_shape.tsv`
- `tables/metadata_key_completeness.tsv`
- imported object path or an explicit blocked reason
- `logs/import.log`
- environment/probe summary

The summary must include:

```json
{
  "schema": "openbioscience.singlecell_import.summary.v1",
  "inputPath": "...",
  "inputFormat": "10x_mtx|10x_h5|h5ad|seurat_rds|sce|hdf5_sparse|table",
  "matrixSemantics": "raw_counts|processed_expression|metadata_only|unknown",
  "nCells": 0,
  "nGenes": 0,
  "metadataKeys": [],
  "supportedClaims": [],
  "conditionalClaims": [],
  "blockedClaims": [],
  "warnings": []
}
```

## Gotchas

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| HDF5 matrix values are `float32` and non-integer | processed expression, not raw UMI counts | Avoid strict counts-based DE; allow annotation/signature review only |
| Cell barcodes do not match metadata rows | barcode suffixes or sample prefixes differ | Normalize barcode conventions and report unmatched rates |
| UMI matrix has sample-mixed barcodes | missing sample key or concatenated 10x runs | reconstruct sample mapping before QC |
| Gene symbols duplicated | mixed gene ids or alias collapse | retain stable gene ids and create symbol mapping table |
| Metadata lacks patient/sample key | cell-level pseudo-replication risk | block pseudobulk or clinical comparison until key is resolved |

## Validation

- Matrix dimensions match gene and barcode axes.
- Metadata join rate is reported.
- Integer-like status is reported.
- Sample/patient/condition/response keys are present or explicitly missing.
- Imported object can be read back in the selected environment.

## Next

- Raw counts + metadata sufficient -> `bio-seurat-core` or `bio-scanpy-core`.
- Processed expression only -> `bio-immune-annotation` or `bio-signature-scoring` with limited claims.
- Response metadata present -> `bio-response-comparison`.
- Ligand/receptor objective -> `bio-cci-analysis`.
- Tumor epithelial objective -> `bio-tumor-cnv`.
```

## Skill 与 MCP 的分工

| 层 | 职责 | 不应承担 |
| --- | --- | --- |
| Skill | 触发、scope、decision tree、workflow、output contract、gotchas、claim boundary | 任意 shell 执行、包安装、大数据下载 |
| `kernel.py` | 轻量确定性 helper：schema validation、path normalization、manifest/checklist 生成 | 主观 annotation、复杂统计、联网检索 |
| MCP | 受控 IO、数据库/API、环境 probe、runner、日志/输出契约 | 科学结论解释、paper claim 判断 |
| Conda env | 稳定执行 R/Python 包 | 用户意图解析、证据注册 |
| `science_artifact` | evidence、artifact、claim、provenance、publish | 实际分析计算 |

## 推荐 P0 Skill Set

首轮围绕 demo reproduction，建议按下面顺序制作：

| Skill | 角色 | 首个验证 case |
| --- | --- | --- |
| `bio-reproduction` | 总路由；paper/data/environment/MCP/artifact 串联 | `human_CRC` |
| `bio-singlecell-import` | 输入语义和对象准备 | `human_CRC`、`human_ICI`、`mouse_SARC` |
| `bio-seurat-core` | R/Seurat QC、normalization、clustering、marker | `human_CRC` |
| `bio-immune-annotation` | marker-based immune annotation | 三个 case |
| `bio-signature-scoring` | CMS/immune/response signatures | `human_CRC`、`human_ICI` |
| `bio-cci-analysis` | CCI 前置条件、runner 输出和结果边界 | `human_CRC` |
| `bio-response-comparison` | responder/non-responder 或 treatment group 比较 | `human_ICI`、`mouse_SARC` |

scRNA-seq 专项拆分和 MCP 边界详见：

- `tmp/10-development-directions/skills-mcp/scrna-seq-skill-mcp-plan.md`

## Review Checklist

新增或修改 Bio skill 前，逐项检查：

- [ ] `description` 是否足够具体，能触发自然语言请求。
- [ ] 是否写清楚 scope、out-of-scope 和相邻 skill 路由。
- [ ] 是否声明 `environmentRef` 或说明如何通过 resolver 获取。
- [ ] 是否定义 input contract。
- [ ] 是否定义 output contract。
- [ ] 是否包含真实 gotchas 和 troubleshooting。
- [ ] 是否区分 supported / conditional / blocked claims。
- [ ] 是否说明如何注册 evidence/artifact/provenance。
- [ ] 是否把长表和 atlas 放入 `references/`。
- [ ] 是否避免把 skill 本身当作证据。
- [ ] 是否避免让 skill 现场安装包或执行任意 shell。
- [ ] 如果涉及第三方数据库/API/服务，是否记录 license、terms、privacy 或 source。

## 当前决策

OpenBioScience 应吸收 AcademicForge 的 runbook 风格，但不要把 Bio skills 写成 AcademicForge 的简单复制品。我们的模板需要额外绑定：

- server-native execution premise；
- official conda environment；
- `bio_runtime` MCP；
- `research_evidence` / `science_artifact` 的现有 contract；
- demo-driven reproduction 的 claim boundary。

这意味着 Bio skill 的最小合格标准不是“讲清楚怎么分析”，而是“能被 agent 触发、能被 MCP/环境执行、能产出可审计 artifact，并且不越界解释科学结论”。
