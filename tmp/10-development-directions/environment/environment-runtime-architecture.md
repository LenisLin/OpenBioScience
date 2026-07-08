# Environment Runtime Architecture

本文档记录 OpenBioScience server-native harness 的环境准备架构。这里是开发讨论稿，不代表当前 `deeporganiser-core` 已经实现对应 API。

## Server-native 前提

OpenBioScience 后续定位为 server 提供服务：

| 维度 | 归属 |
| --- | --- |
| UI | 用户浏览器访问 server |
| 数据存储 | server workspace、对象存储或共享文件系统 |
| 分析环境 | server 管理 |
| 实际执行 | server 或 server 调度的计算节点 |
| 结果保存 | server artifact/workspace |
| token 使用 | server 侧 provider、模型服务和计量系统 |

因此环境设计不再以“本地 PC + 远程 SSH”作为默认模型。用户本地只负责访问 UI、上传数据、查看结果。

## 两层环境模型

OpenBioScience 环境分为两层：

| 层级 | 使用对象 | 形态 | 原则 |
| --- | --- | --- | --- |
| 官方稳定环境 | 普通用户 | Docker image 内置固定 conda env | 稳定、只读、版本化、可复现 |
| 用户自定义环境 | advanced 用户 | User 级 conda env | 隔离、受控自动注册、probe 通过后可用 |

官方环境建议采用 **Docker 外壳 + Conda 内核**：

```text
Docker image
  /opt/conda/envs/<official-env>
  /opt/openbioscience/entrypoints/<tool-entry>
```

理由：

- Docker 固定系统库、CUDA、编译器、R/Python 基础层。
- Conda 保留包管理语义，方便扩展和理解。
- 官方环境可锁定镜像 tag/digest，普通用户不直接修改。
- 大型或冲突工具可独立镜像，普通兼容流程可复用共享镜像。

## 官方环境粒度

官方环境不强制单一粒度。当前设计倾向：

- 普通流程尽量复用兼容环境。
- 大型工具、冲突工具、GPU/系统库要求强的工具使用独立环境。
- workflow 可以有默认环境，也可以让某些 heavy step 覆盖到独立环境。

示例：

```text
singlecell-python      # Scanpy/AnnData/CellxGene 等兼容流程
singlecell-r           # Seurat 相关流程
bulk-rnaseq            # DESeq2/edgeR 或 bulk RNA-seq 工具链
genomics-heavy         # alignment/variant/large CLI 流程
spatial-heavy          # 空间组学大型依赖或 GPU 方法
```

## 执行链路

目标运行链路：

```text
Skill / MCP / Workflow
  -> environmentRef
  -> Environment Resolver
  -> Server-side execution adapter
  -> Docker / Conda / Kubernetes / Slurm / Apptainer
  -> artifact + provenance
```

关键边界：

- Skill 负责 SOP、分析策略、何时需要环境。
- MCP 负责暴露工具能力。
- Workflow 负责输入、步骤、输出。
- Environment index 负责轻量路由。
- Server API 负责注册、解析、probe、执行权限。

Skill 不应直接修改官方环境，也不应直接在官方环境中安装包。

## 当前实现状态

截至当前阶段，已完成的是 **server-side Conda 前缀层**，还不是完整的 Docker/server runtime 服务。

已落地事实：

- 官方环境统一安装在 `<OPENBIOSCIENCE_RUNTIME_ROOT>/environments/official`。
- Conda package cache 与 mamba root prefix 统一放在 `<OPENBIOSCIENCE_RUNTIME_ROOT>/cache`。
- 当前已安装 8 个官方环境：`sc-py-singlecell`、`sc-r-singlecell`、`sc-r-plot`、`sc-r-clinical`、`sc-cci-r`、`sc-r-trajectory`、`sc-r-tumor-cnv`、`sc-network-grn-r`。
- `sc-py-singlecell` 已完成 `torch 2.5.1`、CUDA `12.4`、`torchvision 0.20.1`、`torchaudio 2.5.1`、`scvi-tools 1.4.3` 的导入验证。
- `environments/official/bootstrap/env-manifest.json` 记录了当前 YAML、prefix 和 cache root，可作为后续 resolver/index 的输入雏形。

仍未落地的部分：

- 官方 Docker image 或 server runtime image。
- Environment Resolver 和 server API。
- 每个环境的标准 probe 合约。
- UI 侧环境状态展示。
- Skill/MCP/workflow 到 `environmentRef` 的正式绑定。
- 任务级 provenance，包括环境名、prefix/image digest、包版本摘要、输入输出路径。

因此当前环境可以用于手动 smoke test 和 demo-driven 复现试跑，但还不应声明为完整 harness execution layer。

## 待开发事项

1. 定义轻量 environment index schema。
2. 新增 Environment Resolver，支持按 skill/MCP/workflow/tools 匹配环境。
3. 新增 server API 管理官方环境和用户环境。
4. 将 bio tools、workflow、未来 job runner 改为通过 `environmentRef` 获取运行环境。
5. 增加环境状态 UI：可用、缺失、probe 失败、资源不足。
