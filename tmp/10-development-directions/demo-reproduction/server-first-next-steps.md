# OpenBioScience Bio Harness P0 复刻与部署说明

本文记录从 `hzqiu` 分支当前进度继续推进 Bio scRNA-seq harness 的最小 server-first 路径。目标不是把 R/Python 包、大型数据库或分析产物提交到 GitHub，而是提交可复刻的配置、脚本、manifest、probe、runner、skills/MCP 连接和小型 fixture。

## 1. 使用路径

推荐部署模型：

```text
实验室服务器或 WSL Ubuntu
  -> OpenBioScience WebUI
  -> Bio skills
  -> Bio MCP control plane
  -> official conda/mamba environments
  -> server-side datasets
  -> allowlisted runners
  -> artifacts / reports / provenance
```

普通用户通过 WebUI 使用。SSH/WSL shell 主要用于管理员安装环境、维护服务、查看日志和排错。

## 2. Git 与 runtime 边界

提交到 GitHub：

- `environments/official/*.yml`
- `environments/official/bootstrap/*.sh`
- `environments/official/bootstrap/*.R`
- `environments/official/bootstrap/probes/*`
- `packages/desktop/src/process/resources/builtinMcp/bio/runners/*`
- MCP catalog/server 代码
- skills 文本
- 文档和小型 synthetic fixture

不要提交：

- conda/mamba prefix
- R/Python package 本体
- 下载好的 GEO/SRA/EGA/CellxGene 数据
- MSigDB/KEGG/LR database 缓存
- 大型分析输出
- 编译产物、binary、数据库文件

## 3. Runtime root

WSL Ubuntu 和正式 Linux 服务器默认使用：

```bash
export OPENBIOSCIENCE_RUNTIME_ROOT=/srv/openbioscience
```

实际目录结构：

```text
$OPENBIOSCIENCE_RUNTIME_ROOT/
  envs/
    sc-py-singlecell/
    sc-r-singlecell/
    sc-r-plot/
    sc-r-clinical/
    sc-cci-r/
  custom-envs/
  cache/
    conda-pkgs/
    mamba-root/
  data/
  results/
  manifests/
```

如果要在个人测试目录运行，也只改 `OPENBIOSCIENCE_RUNTIME_ROOT`，不要改 repo 内脚本里的 prefix。

## 4. 安装 P0 环境

第一步先设置 runtime root。正式服务器推荐：

```bash
export OPENBIOSCIENCE_RUNTIME_ROOT=/srv/openbioscience
```

个人 WSL 测试机如果没有 `/srv/openbioscience` 写权限，可以先用用户目录：

```bash
export OPENBIOSCIENCE_RUNTIME_ROOT=$HOME/openbioscience-runtime
```

第二步安装 repo 提供的 project-local micromamba。这个脚本只把 micromamba binary 放进 runtime root，不写入 Git：

```bash
bash environments/official/bootstrap/install-micromamba-wsl.sh
```

第三步安装核心环境：

```bash
bash environments/official/bootstrap/install-official-envs.sh --dry-run sc-py-singlecell sc-r-singlecell sc-r-plot sc-r-clinical
bash environments/official/bootstrap/install-official-envs.sh --probe sc-py-singlecell sc-r-singlecell sc-r-plot sc-r-clinical
```

然后安装 CCI 环境：

```bash
bash environments/official/bootstrap/install-official-envs.sh --probe sc-cci-r
```

`sc-cci-r` 会运行 `postinstall-sc-cci-r.R`，用于安装 CellChat 和 nichenetr 这类 GitHub 依赖。若服务器暂时不能访问 GitHub，可先加 `--skip-postinstall`，但 probe 会提示缺包。更推荐管理员预先把 GitHub tarball 放入 `$OPENBIOSCIENCE_RUNTIME_ROOT/cache/r-github`，文件名分别为 `jinworks_CellChat.tar.gz` 和 `saeyslab_nichenetr.tar.gz`；postinstall 会优先使用本地 cache。

Linux/WSL 服务器可直接尝试用 repo 内脚本预缓存：

```bash
bash environments/official/bootstrap/cache-r-github-tarballs.sh --all
```

如果 WSL 访问 GitHub/codeload 不稳定，但 Windows 或另一台机器可以下载，也可以从外部下载后复制进同一个 cache 目录；GitHub 不提交这些 tarball。`sc-cci-r` postinstall 还会在需要时从 CRAN 升级 `NMF`，可用 `OPENBIOSCIENCE_CRAN_REPO` 指定镜像。

Bioconductor 的部分 annotation/data package 会在 conda post-link 阶段下载真实 R data package。WSL 网络不稳定时，conda metadata 可能显示已安装，但 R 里 `library()` 仍失败。此时使用 repair 脚本补装：

```bash
bash environments/official/bootstrap/repair-bioconductor-data-packages.sh \
  --env sc-r-singlecell \
  go.db-3.22.0 org.hs.eg.db-3.22.0

bash environments/official/bootstrap/repair-bioconductor-data-packages.sh \
  --env sc-r-clinical \
  tcgabiolinksgui.data-1.30.0
```

暂缓安装：

- `sc-r-trajectory`
- `sc-r-tumor-cnv`
- `sc-network-grn-r`

这些属于 P1/P2 插件化模块。

## 5. Probe

统一 probe 入口：

```bash
bash environments/official/bootstrap/probe-official-envs.sh --all
```

输出为 JSON，包含：

- environmentRef
- prefix
- package import/library 状态
- package version
- smoke object 创建结果
- failed/blocked 原因

这些 probe 会被 `bio_runtime.probe_environment` 调用。

## 6. Runner

P0 allowlisted runner 位于：

```text
packages/desktop/src/process/resources/builtinMcp/bio/runners/
```

当前最小集合：

- `inspect_input.py`
- `run_scanpy_core.py`
- `run_seurat_core.R`
- `run_pseudobulk_de.R`
- `run_signature_scoring.R`
- `run_liana.py`

每个 runner 统一接口：

```bash
--config <json-or-yaml>
--output-dir <approved-output-dir>
```

每次运行至少输出：

```text
run_manifest.json
reports/*.json
tables/*.tsv
logs/*.log
```

部分 workflow 会输出 `figures/*` 或 `objects/*`。runner 只支持小型 smoke 和 P0 contract 验证，不等于完整文章复现。

安装环境后可以先跑 fixture smoke：

```bash
bash packages/desktop/src/process/resources/builtinMcp/bio/runners/smoke-fixtures.sh --dry-run
bash packages/desktop/src/process/resources/builtinMcp/bio/runners/smoke-fixtures.sh inspect_input run_scanpy_core run_liana
```

如果 `sc-r-singlecell` 也已经安装好，再跑 R 端 smoke：

```bash
bash packages/desktop/src/process/resources/builtinMcp/bio/runners/smoke-fixtures.sh run_seurat_core run_pseudobulk_de run_signature_scoring
```

默认输出目录为 `$OPENBIOSCIENCE_RUNTIME_ROOT/results/fixture-smoke`，不进入 Git。

## 7. MCP 使用方式

`bio_runtime` 当前支持：

- `status`
- `list_environments`
- `resolve_environment`
- `probe_environment`
- `list_workflows`
- `validate_workflow`
- `run_workflow`
- `summarize_outputs`

`run_workflow` 只接受 catalog 中带 runner 的 workflow id，例如：

- `inspect_input`
- `run_scanpy_core`
- `run_seurat_core`
- `run_pseudobulk_de`
- `run_signature_scoring`
- `run_liana`

MCP 不允许任意 shell。输入和输出路径必须在 approved root 内，例如：

- `OPENBIOSCIENCE_RUNTIME_ROOT`
- `OPENBIOSCIENCE_WORKSPACE_ROOT`
- `OPENSCIENCE_RUNTIME_ROOT`
- `DEEPORGANISER_WORK_DIR`

## 8. WebUI 服务启动建议

管理员启动 WebUI 前设置：

```bash
export OPENBIOSCIENCE_RUNTIME_ROOT=/srv/openbioscience
export OPENBIOSCIENCE_WORKSPACE_ROOT=/srv/openbioscience
export OPENBIOSCIENCE_REPO_ROOT=/path/to/OpenBioScience
bun run webui -- --no-open
```

普通用户通过 WebUI 发起任务。agent 应先使用 bio skills 做数据、环境和 workflow 判断，再通过 bio MCP probe/run。

## 9. P0 验收标准

第一阶段成功标准不是完整复现三篇论文，而是跑通这个闭环：

```text
WebUI 用户提出 scRNA-seq demo 分析需求
-> agent 选择 bio skills
-> bio_runtime probe official env
-> bio_runtime validate/run allowlisted workflow
-> runner 生成 manifest/table/log/figure
-> science_artifact 登记 provenance
-> WebUI 展示结果和限制
```

闭环跑通后，再接真实 GEO/SRA/ArrayExpress provider、marker/gene-set/LR database provider、真实 paper demo、CNV、GRN、CyTOF 和空间组学。
