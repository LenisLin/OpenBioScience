# OpenBioScience Bio 官方环境入门

这份 README 面向刚加入项目的人。目标是让你从 clone 仓库开始，能够安装项目依赖、复刻 Bio scRNA-seq 官方分析环境、跑通最小测试，并知道以后如何维护这些环境、skills、MCP 和 runner。

本目录只保存“可复刻定义”和“小型验证资产”。真实 conda 环境目录、R/Python 包缓存、下载数据、数据库缓存、分析输出和 binary 都放在 runtime root，不能提交到 Git。

## 你需要先知道的背景

当前 `hzqiu` 分支是在 `origin/preview-lyx` 的 Bio harness 骨架基础上继续做的。

`origin/preview-lyx` 已经准备了第一轮 Bio 方向基础：

- 10 个 Bio scRNA-seq skills。
- 4 个 Bio MCP 骨架 profile：`bio_runtime`、`bio_source`、`bio_knowledge`、`bio_plot`。
- `environments/official/` 官方环境蓝图。
- 服务端优先（server-first）的 harness 方向。
- 以 demo 驱动（demo-driven）的 P0 目标和能力矩阵。

本轮在这个基础上继续把“环境、skills、MCP、runner 骨架”接成可安装、可 probe、可复刻、可测试的 P0 闭环。

当前 Bio 官方环境版本：

- `harness_version`: `0.1.0-p0`
- 主要平台：WSL Ubuntu / Linux server `linux-64`
- 服务器默认 runtime root：`/srv/openbioscience`
- 本机开发 runtime root：通常使用 `$HOME/openbioscience-runtime`

## 新成员从零开始

下面按推荐顺序执行。第一次安装完整 P0 环境可能需要较长时间，也需要稳定访问 conda-forge、bioconda、PyPI 和 GitHub。

### 1. 克隆仓库并切到工作分支

```bash
git clone <OpenBioScience repo url>
cd OpenBioScience
git fetch origin
git checkout hzqiu
```

如果你是从 `origin/preview-lyx` 新建自己的工作分支，可以这样做：

```bash
git checkout -b <your-branch> origin/preview-lyx
```

当前这套 Bio 环境工作是在 `hzqiu` 分支上继续推进的；如果要复刻本分支内容，请直接 checkout `hzqiu`。

### 2. 准备项目本身的开发依赖

这个仓库是 Electron + React + TypeScript 项目，包管理器是 Bun。建议准备：

- Node.js `>=22 <25`
- Bun
- Git
- Python 3
- WSL Ubuntu 或 Linux shell

安装前端/TypeScript 项目依赖：

```bash
bun install
```

先做一次轻量项目检查：

```bash
bunx tsc --noEmit
bun run test -- tests/unit/process/bioMcpCatalog.test.ts tests/unit/process/bioMcpServer.test.ts tests/unit/process/bioMcpRuntime.test.ts
```

注意：完整 Electron/WebUI 启动还依赖 `deeporganiser-core` 后端 bundle。本文重点是 Bio 官方环境、skills、MCP 和 runner 的可复刻维护；启动完整 UI 时再按项目根目录文档和 `AGENTS.md` 准备后端 bundle。

### 3. 选择运行根目录

运行根目录（runtime root）是真实环境和运行产物的位置。Git 只保存定义和 lock，不保存这里面的重包和数据。

服务器推荐：

```bash
export OPENBIOSCIENCE_RUNTIME_ROOT=/srv/openbioscience
```

个人 WSL 开发机推荐：

```bash
export OPENBIOSCIENCE_RUNTIME_ROOT=$HOME/openbioscience-runtime
```

运行根目录的典型结构：

```text
$OPENBIOSCIENCE_RUNTIME_ROOT/
  envs/       # 真实 conda/micromamba 环境
  cache/      # conda、mamba、R GitHub tarball 等缓存
  data/       # 后续下载的数据
  results/    # runner 和分析输出
  manifests/  # 本地运行 manifest
  tools/      # micromamba 等本地工具
```

这些目录不要提交。

### 4. 安装项目本地 micromamba

如果机器上没有可用的 mamba/micromamba，先安装项目本地 micromamba：

```bash
bash environments/official/bootstrap/install-micromamba-wsl.sh
```

脚本会优先把 micromamba 放到：

```text
$OPENBIOSCIENCE_RUNTIME_ROOT/tools/micromamba/bin/micromamba
```

如果你想使用系统已有的 mamba/micromamba，可以设置：

```bash
export MAMBA_EXE=/path/to/micromamba
```

### 5. 从 lock 复刻官方环境

推荐从 lock 复刻，而不是重新解 YAML 依赖。lock 是本分支已经测试过的环境快照。

安装完整 P0：

```bash
bash scripts/bio-harness/reproduce-official-envs.sh --p0 --from-lock
```

如果你只想先快速验证一小部分，可以先安装 Python 单细胞环境：

```bash
bash scripts/bio-harness/reproduce-official-envs.sh --env sc-py-singlecell --from-lock
```

如果已有 prefix，但你想严格重建：

```bash
bash scripts/bio-harness/reproduce-official-envs.sh --env sc-py-singlecell --from-lock --recreate
```

`--recreate` 会删除对应官方环境 prefix。脚本只允许删除官方环境根目录下的一层环境目录。

如果你正在开发新环境，或某个环境还没有 lock，可以从 YAML 安装：

```bash
bash scripts/bio-harness/reproduce-official-envs.sh --env sc-py-singlecell --from-yaml
```

### 6. 验证环境是否可用

先跑官方环境 probe：

```bash
bash environments/official/bootstrap/probe-official-envs.sh --all
```

如果你只安装了一个环境：

```bash
bash environments/official/bootstrap/probe-official-envs.sh sc-py-singlecell
```

再跑小型 fixture smoke：

```bash
bash packages/desktop/src/process/resources/builtinMcp/bio/runners/smoke-fixtures.sh --all
```

如果只安装了 `sc-py-singlecell`，可以先跑 Python 相关 runner：

```bash
bash packages/desktop/src/process/resources/builtinMcp/bio/runners/smoke-fixtures.sh inspect_input run_scanpy_core run_liana
```

这些 smoke 不下载大数据，只使用 repo 内的小型 fixture，输出写到：

```text
$OPENBIOSCIENCE_RUNTIME_ROOT/results/fixture-smoke
```

### 7. 做一次干净 runtime canary

这一步用于确认“别人 clone 仓库后能按 lock 复刻环境”。它会在 `/tmp` 下创建一个临时 runtime，不影响你的主 runtime。

```bash
export OPENBIOSCIENCE_TEST_RUNTIME=/tmp/openbioscience-repro-canary
rm -rf "$OPENBIOSCIENCE_TEST_RUNTIME"

OPENBIOSCIENCE_RUNTIME_ROOT="$OPENBIOSCIENCE_TEST_RUNTIME" \
MAMBA_EXE="$HOME/openbioscience-runtime/tools/micromamba/bin/micromamba" \
CONDA_PKGS_DIRS="$HOME/openbioscience-runtime/cache/conda-pkgs" \
bash scripts/bio-harness/reproduce-official-envs.sh --env sc-py-singlecell --from-lock
```

然后验证这个临时环境：

```bash
OPENBIOSCIENCE_RUNTIME_ROOT="$OPENBIOSCIENCE_TEST_RUNTIME" \
MAMBA_EXE="$HOME/openbioscience-runtime/tools/micromamba/bin/micromamba" \
bash environments/official/bootstrap/probe-official-envs.sh sc-py-singlecell
```

测试完成后删除临时 runtime：

```bash
rm -rf "$OPENBIOSCIENCE_TEST_RUNTIME"
```

`CONDA_PKGS_DIRS` 在 canary 中只是为了复用开发机已有 package cache，节省时间和下载量。服务器首次部署时不需要设置它。

## 当前 P0 官方环境

| 环境 | 用途 |
| --- | --- |
| `sc-py-singlecell` | Python/AnnData/Scanpy 基础环境，用于对象读取、QC、聚类、provider 解析、CellPhoneDB/LIANA smoke。 |
| `sc-r-singlecell` | R/Seurat/SCE 主分析环境，用于导入、QC、聚类、注释、pseudobulk DE、富集和 signature scoring。 |
| `sc-r-plot` | R 绘图环境，用于 ggplot2、ComplexHeatmap、dittoSeq、导出设备和出版级图件。 |
| `sc-r-clinical` | R 临床统计环境，用于 response group、composition、survival、GDC/TCGA 相关分析。 |
| `sc-cci-r` | R 细胞互作环境，用于 CellChat/NicheNet 风格 workflow。 |

当前保留但不放入 P0 主线闭环的扩展环境：

- `sc-r-trajectory`：Monocle/Slingshot/tradeSeq 类轨迹分析。
- `sc-r-tumor-cnv`：inferCNV/COPYKAT/SCEVAN 类肿瘤 CNV 推断。
- `sc-network-grn-r`：GENIE3/BioNERO/SCENIC/DoRothEA 类 GRN 或 TF 活性分析。

后续计划环境：

- `sc-r-cytof`
- `sc-spatial-multiome`
- `sc-legacy-repro`

## 本目录里哪些文件负责什么

| 路径 | 作用 | 是否提交 |
| --- | --- | --- |
| `*.yml` | 官方环境的可编辑定义。 | 是 |
| `bootstrap/env-manifest.json` | 官方环境目录、用途、probe、postinstall 和复刻策略。 | 是 |
| `bootstrap/*.sh`, `bootstrap/*.R` | micromamba 安装、环境安装、probe、repair、cache、postinstall 入口。 | 是 |
| `bootstrap/probes/` | 每个 P0 环境的轻量 probe。 | 是 |
| `locks/linux-64/*.explicit.txt` | conda explicit lock，用于复刻 conda 包。 | 是 |
| `locks/linux-64/*.pip-lock.txt` | pip lock，用于补齐 pip 安装包。 | 是 |
| `locks/linux-64/*.postinstall-lock.json` | R GitHub/CRAN postinstall lock。 | 是 |
| `locks/linux-64/probe-results.json` | 当前测试通过环境的 probe 快照。 | 是 |
| `locks/linux-64/runtime-build-report.md` | 当前 lock 的构建报告。 | 是 |
| `$OPENBIOSCIENCE_RUNTIME_ROOT/envs` | 真实 conda/micromamba 环境目录。 | 否 |
| `$OPENBIOSCIENCE_RUNTIME_ROOT/cache` | 包缓存、R GitHub tarball 缓存。 | 否 |
| `$OPENBIOSCIENCE_RUNTIME_ROOT/data` | 下载数据。 | 否 |
| `$OPENBIOSCIENCE_RUNTIME_ROOT/results` | 分析和 smoke 输出。 | 否 |

## Skill / MCP / 包映射

每个 skill 本身是 agent runbook，不直接安装包；真正执行分析时通过 MCP workflow 或 runner 路由到官方环境。

| skill | 主要 MCP/profile | 官方环境 | 关键包/能力 |
| --- | --- | --- | --- |
| `bio-scrna-reproduction` | `bio_runtime`, `bio_source`, `bio_knowledge`, `bio_plot` | `sc-py-singlecell`, `sc-r-singlecell`, `sc-r-plot`, `sc-r-clinical`, `sc-cci-r` | 复现编排；本身不绑定单一包。 |
| `bio-environment-routing` | `bio_runtime` | 所有官方环境 | environment catalog、probe、workflow routing。 |
| `bio-data-resolution` | `bio_source` | `sc-py-singlecell` | `GEOparse`, `pysradb`, `requests`, `beautifulsoup4`, `lxml`, `biopython`。 |
| `bio-singlecell-import` | `bio_runtime` | `sc-py-singlecell`, `sc-r-singlecell` | `scanpy`, `anndata`, `h5py`, `zarr`, `Seurat`, `SingleCellExperiment`, `DropletUtils`, `zellkonverter`。 |
| `bio-qc-preprocess` | `bio_runtime` | `sc-r-singlecell`, `sc-py-singlecell` | `Seurat`, `sctransform`, `scater`, `scran`, `scuttle`, `scanpy`, `scrublet`。 |
| `bio-batch-dim-cluster` | `bio_runtime` | `sc-r-singlecell`, `sc-py-singlecell` | `Seurat` integration APIs, `scanpy`, `leidenalg`, `python-igraph`, `harmonypy`, `bbknn`, `scanorama`。 |
| `bio-marker-optimization` | `bio_runtime`, `bio_knowledge` | `sc-r-singlecell`, `sc-py-singlecell` | `Seurat` markers, `SingleR`, `celldex`, `celltypist`, marker evidence contracts。 |
| `bio-cell-annotation` | `bio_knowledge`, `bio_runtime` | `sc-r-singlecell`, `sc-py-singlecell` | `SingleR`, `celldex`, `celltypist`, marker/atlas lookup contracts。 |
| `bio-scrna-plotting` | `bio_plot` | `sc-r-plot` | `ggplot2`, `ComplexHeatmap`, `dittoSeq`, `EnhancedVolcano`, `patchwork`, `svglite`, `ragg`。 |
| `bio-result-interpretation` | `bio_knowledge`, `bio_runtime` | 通常不直接运行 runner；读取各环境产物 | PubMed/atlas/gene-set evidence contracts；包版本来自 artifact manifests。 |

当前 MCP workflow 到环境/包的执行映射：

| workflow id | MCP profile | 官方环境 | runner | 关键包 |
| --- | --- | --- | --- | --- |
| `inspect_input` | `bio_runtime` | `sc-py-singlecell` | Python | `pandas`, `anndata`, `h5py`。 |
| `run_scanpy_core` | `bio_runtime` | `sc-py-singlecell` | Python | `scanpy`, `anndata`, `leidenalg`, `python-igraph`, `matplotlib-base`。 |
| `run_liana` | `bio_runtime` | `sc-py-singlecell` | Python | `liana`, `pandas`, `numpy`。 |
| `run_seurat_core` | `bio_runtime` | `sc-r-singlecell` | Rscript | `Seurat`, `SeuratObject`, `SingleCellExperiment`。 |
| `run_pseudobulk_de` | `bio_runtime` | `sc-r-singlecell` | Rscript | `edgeR`, `DESeq2`, `limma`, `SummarizedExperiment`。 |
| `run_signature_scoring` | `bio_runtime` | `sc-r-singlecell` | Rscript | `GSVA`, `fgsea`, `UCell`, `AUCell`, `msigdbr`。 |
| `scrna_plot_figure_set` | `bio_plot` | `sc-r-plot` | 当前是契约，后续接 runner | `ggplot2`, `ComplexHeatmap`, `dittoSeq`, export devices。 |

`bio_source`、`bio_knowledge`、`bio_plot` 目前仍以控制面 / 契约骨架为主。真实下载 provider、marker DB provider、plot runner 接入后，需要同步更新本表、`env-manifest.json`、MCP catalog、probe 和 lock。

## 以后如何参与维护

新增或修改环境、skill、MCP、runner 时，按这个顺序来：

1. 修改 repo 里的定义文件。
   - 环境包变化：改 `environments/official/*.yml`。
   - 环境目录、用途、probe、postinstall 变化：改 `bootstrap/env-manifest.json`。
   - MCP workflow 变化：改 `packages/desktop/src/process/resources/builtinMcp/bio/catalog.ts`。
   - runner 变化：改 `packages/desktop/src/process/resources/builtinMcp/bio/runners/`。
   - skill 变化：改 `resources/skills/bio-*`。
2. 在本地 runtime 安装或更新环境。
3. 跑 probe 和 fixture smoke。
4. 从已测试 runtime 导出可提交 lock/report：

```bash
bash scripts/bio-harness/sync-tested-runtime.sh --p0
```

5. 跑 TypeScript 和相关 MCP 单测：

```bash
bunx tsc --noEmit
bun run test -- tests/unit/process/bioMcpCatalog.test.ts tests/unit/process/bioMcpServer.test.ts tests/unit/process/bioMcpRuntime.test.ts
```

6. 检查 Git 状态，确认没有把 runtime 产物放进来：

```bash
git status --short
```

可以提交的通常是：

- YAML
- manifest
- bootstrap/probe/runner 脚本
- skills/MCP 配置
- 小型 fixture
- `locks/linux-64/*.explicit.txt`
- `locks/linux-64/*.pip-lock.txt`
- `locks/linux-64/*.postinstall-lock.json`
- `probe-results.json`
- `runtime-build-report.md`
- 文档和测试

不能提交的是：

- conda/micromamba 环境目录
- R/Python 包本体
- conda package cache
- R GitHub tarball cache
- 下载好的大数据
- 数据库缓存
- 分析输出
- 编译产物
- binary

## 本轮已经做过的测试

本分支当前环境维护层已经做过这些验证：

- 默认 WSL 实例 `Ubuntu-22.04` 中的 P0 环境 probe 全部通过。
- fixture smoke workflow 已跑通，包括 Python 和 R 端最小 runner。
- 用干净临时 runtime `/tmp/openbioscience-repro-canary` 从 lock 复刻 `sc-py-singlecell`，并通过 probe、`inspect_input`、`run_scanpy_core`、`run_liana`。
- `bunx tsc --noEmit` 通过。
- bio MCP 相关 targeted Vitest 通过：3 个测试文件、11 个测试。
- lock 快照中已检查没有保留本机绝对路径，例如 `/home/<user>`、`/mnt/<drive>` 这类路径。

## 下一步建议

1. 在服务器或干净 WSL 中按本文完整复刻 P0；如果时间有限，先复刻 `sc-py-singlecell` 和 `sc-r-singlecell`。
2. 把 `bio_runtime` 的 runner 调用和真实 WebUI 使用路径继续联调，确认普通用户通过 WebUI 触发时能正确走 approved root、env resolver、runner 和 artifact manifest。
3. 为 `bio_source` 接 GEO/SRA/ArrayExpress provider。
4. 为 `bio_knowledge` 接 marker、atlas、gene set、ligand-receptor database provider。
5. 为 `bio_plot` 接真实 plot runner。
6. 后续每次新增包、skill、MCP 或 runner，都同步更新 YAML、manifest、probe、lock、README 映射表和测试记录。

## 受限网络和特殊情况

`sc-cci-r` 通过 `bootstrap/postinstall-sc-cci-r.R` 安装 CellChat 和 nichenetr。受限网络下，可以先按 lock 下载 GitHub tarball：

```bash
export OPENBIOSCIENCE_R_GITHUB_CACHE=$OPENBIOSCIENCE_RUNTIME_ROOT/cache/r-github
mkdir -p "$OPENBIOSCIENCE_R_GITHUB_CACHE"
bash environments/official/bootstrap/cache-r-github-tarballs.sh --from-lock
```

准确的文件名、短 ref 和 sha256 记录在：

```text
environments/official/locks/linux-64/sc-cci-r.postinstall-lock.json
```

部分 Bioconductor annotation/data 包依赖 post-link 下载。网络不稳时，包可能出现在 conda metadata 中，但 R library 中实际缺文件。可用修复脚本处理：

```bash
bash environments/official/bootstrap/repair-bioconductor-data-packages.sh \
  --env sc-r-singlecell \
  go.db-3.22.0 org.hs.eg.db-3.22.0

bash environments/official/bootstrap/repair-bioconductor-data-packages.sh \
  --env sc-r-clinical \
  tcgabiolinksgui.data-1.30.0
```

## 设计边界

P0 默认是 CPU-friendly、conda-first。`sc-py-singlecell` 暂不默认安装 GPU/scVI 类深度生成模型；这些后续应作为扩展环境加入。

`ReactomePA`/`reactome.db` 也没有放入默认 probe，因为 Bioconductor data package 较大且在代理受限 WSL 网络中不稳定。P0 的 Reactome 风格分析优先使用 `msigdbr`、`fgsea` 和 `GSVA`。

相关文件：

- `bootstrap/env-manifest.json`
- `bootstrap/storage-layout.md`
- `bootstrap/core-envs.md`
- `locks/linux-64/runtime-build-report.md`
