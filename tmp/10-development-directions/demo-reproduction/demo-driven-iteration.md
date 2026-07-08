# Demo-Driven Reproduction Iteration

本文档定义一个更具体的开发问题：在 `demo/` 已经给出固定案例范围的前提下，OpenBioScience 如何通过单个 demo case 触发一次最小的 environment / skill / MCP 迭代，从而把“平台讨论”收敛为“可验证的复现能力升级”。

## 目标

这里的最小迭代目标不是“一次做完整篇文章复现”，而是：

1. 选定一个 demo case。
2. 选定一个明确的复现模块。
3. 识别当前缺失的 environment / skill / MCP。
4. 只补足该模块所需的最小能力。
5. 产出一个可检查的 artifact / report / 表格 / 图。
6. 把其中可复用的部分沉淀回平台。

换句话说，demo case 是平台升级的驱动器，不只是展示数据。

## 为什么采用 demo-driven 迭代

当前仓库已经有大量通用 skill、若干内置 MCP 和完整的 UI/backend shell。如果不把范围锁到 demo case，很容易出现两个问题：

- 过早建设一个泛化但无法验证的 Bio 平台。
- 环境、skill、MCP 同时扩张，却没有一个清楚的最小验收标准。

demo-driven 迭代的约束更强：

- 目标论文是固定的。
- 本地已有数据是固定的。
- 当前不能复现的部分可以被明确指出。
- 每次迭代都必须回答“这次新增能力，具体支持了哪个 case 的哪个模块”。

## 单次最小迭代单位

一次最小迭代应由下面 8 个元素组成。

| 要素 | 说明 |
| --- | --- |
| case | `demo/<case>/` 中的一篇文章 |
| reproduction target | 一个明确模块，例如 import+annotation、CMS scoring、response comparison、CCI、CyTOF |
| local evidence | 当前本地已有的 PDF、matrix、metadata、FCS 等 |
| reproducibility boundary | 当前能安全声明支持到什么程度 |
| environment delta | 为该模块必须新增或修正的环境能力 |
| skill delta | 为该模块必须新增或修正的 SOP / 决策能力 |
| MCP delta | 为该模块必须新增或修正的数据解析、对象转换、runner 或数据库能力 |
| validation output | 一份最小可检查输出，例如 object summary、marker table、UMAP、DE table、CCI table、report |

## 标准迭代流程

### 1. 选 case，不先选工具

先选文章模块，再决定工具，不反过来。因为单细胞复现里真正约束实现的是：

- 数据类型是不是 raw counts。
- 有无 sample / treatment / response 元信息。
- 是否需要受控访问数据。
- 是否包含 FCS / CyTOF。
- 是否涉及跨物种或 legacy 版本。

### 2. 审核本地证据质量

必须先判断当前本地资产属于哪一类：

- raw UMI count matrix
- processed expression matrix
- annotation / metadata table
- H5AD / Seurat / SCE object
- FCS / CyTOF
- 仅 PDF，无可运行数据

这一层判断直接决定后续 claims 的强弱。比如：

- raw counts 支持更强的 QC、聚类、pseudobulk、DE。
- processed float expression 仍可能支持 import、annotation、signature scoring，但不应自动视为严格 counts-based reproduction。
- metadata-only 只能支撑结构核对或结果复述，不能冒充重跑分析。

### 3. 写清楚当前可复现边界

每个迭代都必须把输出 claim 分成三层：

- **supported now**：用当前本地资产和现有 harness 能直接支撑的结果。
- **conditionally supported**：补足少量环境 / skill / MCP 后可支撑。
- **not yet safe to claim**：当前证据不足，不应宣称已复现。

这一步是为了避免“目标范围”和“当前可验证范围”被混写。

### 4. 识别最小 capability gap

不要一次补全所有东西。只问三个问题：

1. 这个模块缺哪个环境？
2. 这个模块缺哪个 SOP skill？
3. 这个模块缺哪个 MCP 或 runner？

如果某个能力不能明确映射到当前 case 的明确模块，就不应放进当前迭代。

### 5. 先补 environment，再补 skill / MCP

当前项目后续定位为 server-native harness，因此最先要保证：

- server 侧存在可调用的分析环境；
- skill/MCP 只是消费这些环境，而不是自己临时装包。

建议顺序：

1. 先补 `environmentRef -> environment` 的稳定执行底座。
2. 再补 `singlecell_import / data_resolution / paper_triage` 一类入口 skill。
3. 再补 `analysis_runner_mcp / object_io_mcp` 一类受控工具层。

当前仓库已有 `research_evidence` 和 `science_artifact` built-in MCP，可分别承担 paper/database evidence 与 artifact/provenance/report。`object_io_mcp` 和 `analysis_runner_mcp` 仍是待新增 Bio-specific 工具层；在它们实现前，object IO 和分析执行只能先由普通 runtime 完成，并由 `science_artifact` 记录证据。

### 6. 用最小输出来验收

一个模块通过，不等于论文已完整复现。最小验收更适合采用下面的输出：

- object summary
- matrix / metadata import summary
- marker table
- annotation table
- UMAP / t-SNE
- signature score table
- DE / enrichment table
- CCI table
- case-level report markdown

验收标准不是“结果看起来像论文”，而是：

- 输入类型识别正确；
- 环境调用路径清楚；
- 输出结构稳定；
- 不越界声明 unsupported claim。

## 从单 case 到平台能力的沉淀规则

单 case 里出现的新能力，不应全部直接上升为“平台正式能力”。建议按下面规则沉淀：

### 升级为官方 environment

当能力满足以下条件时，应进入官方环境：

- 会被两个以上 case 共用；
- 安装复杂、版本敏感；
- 不适合由 agent 现场拼装；
- 有明确的 runner 或 workflow 入口。

### 升级为通用 skill

当能力满足以下条件时，应进入通用 skill：

- 它描述的是 SOP、判定规则、输入约束或结果解释；
- 不依赖某一篇文章的专有上下文；
- 可被多个 case 复用。

### 升级为通用 MCP

当能力满足以下条件时，应进入 MCP：

- 它本质上是外部系统交互或受控执行；
- 需要统一 I/O 契约；
- 不应让 agent 直接拼任意 shell。

### 仅保留在 case README

以下内容应留在 `demo/<case>/README.md`，不应被提升为平台能力：

- 某一篇文章特有的 figure 解释；
- 某一论文专有的 comparison setup；
- 当前 case 独有的数据缺口说明；
- 只服务于单篇论文的临时 workaround。

## 当前建议的迭代顺序

这是基于当前本地文件的证据强弱给出的建议，不是不可更改的硬顺序。

### Iteration 1: `human_CRC`

推荐优先，原因是本地证据最强：

- 已有 PDF。
- 已有两组 raw UMI count matrix。
- 已有两组 processed matrix。
- 已有 annotation。

适合作为第一轮主导 case，优先驱动：

- `sc-r-singlecell`
- `sc-py-singlecell`
- `sc-r-plot`
- `sc-cci-r`
- `singlecell_import`
- `seurat_qc_clustering`
- `immune_annotation`
- `crc_cms`
- `cci`
- `object_io_mcp` 和 `analysis_runner_mcp` 的最小契约设计

### Iteration 2: `human_ICI`

适合在主线 import / annotation 跑通后接入，重点驱动：

- `response_biomarker_skill`
- `enrichment_signature_skill`
- `sc-r-clinical`
- `sc-r-plot`
- clinical / response-aware runner

但当前本地 `expression.h5` 更像 processed float matrix，因此不应直接把它当作 raw-count pseudobulk 输入。

### Iteration 3: `mouse_SARC`

适合在 human 主线稳定后接入，重点驱动：

- mouse immune annotation
- `paper_errata_check_skill`
- `cross_species_signature_skill`
- `sc-r-cytof` 的后续环境规划
- `cytof_mcp` 的后续工具规划

当前本地没有 FCS，因此 CyTOF 仍属于条件性支持模块。

## 当前文档落点原则

- `tmp/` 记录跨 case 的开发策略、环境设计、能力矩阵和实施状态。
- `demo/<case>/README.md` 记录某篇文章如何被当前 harness 接住，以及当前复现边界。

这个边界应保持稳定，否则后面 environment、skill、MCP 的改动会与 case 事实脱节。
