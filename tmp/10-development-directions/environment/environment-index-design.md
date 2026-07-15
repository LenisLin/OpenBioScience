# Environment Index Design

本文档定义 OpenBioScience 的轻量环境索引方向。设计目标是方便 skill/MCP/workflow 快速调用，而不是把完整包版本矩阵塞进上下文。

## 设计原则

Environment index 只承担 routing contract：

```text
skill / MCP / workflow / tool
  -> candidate environment
  -> path/build/resources/supports
```

不建议在 index 中记录大量细粒度包版本、完整 provenance、所有 probe 结果或审计日志。这些信息应放在 server 环境详情、构建日志、任务 provenance 或 artifact 中。

## 最小字段

建议只保留四类字段：

| 字段 | 含义 |
| --- | --- |
| `path` | 环境运行地址，如 image、conda path、entrypoint |
| `build` | 构建来源，如 Dockerfile、conda yaml、base environment |
| `resources` | 关键资源需求，如 CPU、内存、GPU |
| `supports` | 支持的 skills、MCP、workflows、tools |

## 官方环境示例

```yaml
schema: openbioscience.environment-index.v1

environments:
  singlecell-python:
    path:
      image: registry.openbioscience.org/runtime-singlecell:2026.07
      conda: /opt/conda/envs/scanpy
      entry: /opt/openbioscience/entrypoints/run-python
    build:
      dockerfile: environments/singlecell/Dockerfile
      conda: environments/singlecell/scanpy.yml
    resources:
      cpu: "4+"
      memory: "16GB+"
      gpu: false
    supports:
      skills:
        - openscience-singlecell
        - kdense-scanpy
        - kdense-anndata
      mcp:
        - openscience-research-evidence
      workflows:
        - singlecell-qc
        - singlecell-cluster
      tools:
        - scanpy
        - anndata
        - cellxgene-census

  singlecell-r:
    path:
      image: registry.openbioscience.org/runtime-singlecell-r:2026.07
      conda: /opt/conda/envs/seurat
      entry: /opt/openbioscience/entrypoints/run-r
    build:
      dockerfile: environments/singlecell-r/Dockerfile
      conda: environments/singlecell-r/seurat.yml
    resources:
      cpu: "4+"
      memory: "32GB+"
      gpu: false
    supports:
      skills:
        - openscience-singlecell
      workflows:
        - seurat-qc
        - seurat-cluster
      tools:
        - seurat
```

## Resolver 行为

Environment Resolver 的最小行为：

1. 接收 `skillId`、`mcpName`、`workflowId` 或 `toolName`。
2. 从 index 中查找 `supports` 匹配项。
3. 返回候选环境列表，而不是把完整 index 交给 agent。
4. 优先官方稳定环境。
5. 如果用户有匹配的 user env，可作为候选或覆盖项返回。
6. 对 heavy step 允许 workflow 指定 step-level `environmentRef`。

## User Environment Index

本轮决策：官方环境 immutable；用户需要额外包时，由 agent 在 MCP 外层创建或派生用户私有 conda 环境，MCP 只负责注册/index。注册后由 `bio_runtime` 提供 list/resolve/probe 能力，使下游脚本、workflow 或 skill 只依赖 `environmentRef`。

首版 user env 只对 agent/runtime 可见，不做前台 UI 管理，也不引入复杂环境状态机。包来源不做固定白名单，但必须记录 conda channel、pip/R repository、GitHub URL、commit/tag、许可证或凭证风险。

用户环境索引仍保持轻量 routing contract：

```yaml
userEnvironments:
  user:lyx/scanpy-custom:1:
    path:
      conda: /srv/openbioscience/users/lyx/envs/scanpy-custom-1
      entry: conda run -p /srv/openbioscience/users/lyx/envs/scanpy-custom-1
    build:
      baseEnvironmentRef: sc-py-singlecell
      packageDelta: /srv/openbioscience/users/lyx/env-specs/scanpy-custom-1.yml
      createdBy: agent
    resources:
      cpu: "4+"
      memory: "16GB+"
      gpu: false
    supports:
      skills:
        - openscience-singlecell
      tools:
        - scanpy
        - squidpy
      workflows:
        - spatial-singlecell
    probe:
      status: passed
      log: execution/logs/environment_probe.log
```

## Current Bootstrap Manifest

当前仓库已经新增一个操作层 manifest：

```text
environments/official/bootstrap/env-manifest.json
```

它记录当前阶段已经安装的官方 Conda 环境：

| Environment | YAML | Prefix |
| --- | --- | --- |
| `sc-py-singlecell` | `environments/official/sc-py-singlecell.yml` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/environments/official/sc-py-singlecell` |
| `sc-r-singlecell` | `environments/official/sc-r-singlecell.yml` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/environments/official/sc-r-singlecell` |
| `sc-r-plot` | `environments/official/sc-r-plot.yml` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/environments/official/sc-r-plot` |
| `sc-r-clinical` | `environments/official/sc-r-clinical.yml` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/environments/official/sc-r-clinical` |
| `sc-cci-r` | `environments/official/sc-cci-r.yml` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/environments/official/sc-cci-r` |
| `sc-r-trajectory` | `environments/official/sc-r-trajectory.yml` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/environments/official/sc-r-trajectory` |
| `sc-r-tumor-cnv` | `environments/official/sc-r-tumor-cnv.yml` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/environments/official/sc-r-tumor-cnv` |
| `sc-network-grn-r` | `environments/official/sc-network-grn-r.yml` | `<OPENBIOSCIENCE_RUNTIME_ROOT>/environments/official/sc-network-grn-r` |

这个 manifest 是当前安装和迁移的操作记录，不是最终 resolver index。后续正式 index 仍应保留轻量 routing contract，并补充 `resources` 与 `supports`，而不是把完整包版本矩阵塞进上下文。

## 与上下文的关系

LLM 或 agent 不应默认加载完整 index。更推荐：

```text
任务触发 skill
  -> skill/MCP 请求 resolver
  -> resolver 返回少量候选环境
  -> agent 选择或使用默认 environmentRef
```

这样可以降低上下文占用，也避免模型在过长环境列表中误选。

## 待开发事项

1. 确认 index 文件位置，例如 server 资源目录或 `resources/environments/`。
2. 定义 TypeScript/Rust DTO，保证前后端字段一致。
3. 给 resolver 增加最小单元测试：按 skill、tool、workflow 匹配。
4. 在 Bio skills/MCP 文档中引用 `environmentRef`，不要嵌入完整安装说明。
5. 增加 user env 注册/index schema，并由 `bio_runtime` 提供 list/resolve/probe。
