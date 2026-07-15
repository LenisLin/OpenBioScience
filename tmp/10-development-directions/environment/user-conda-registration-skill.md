# User Conda Registration Skill

本文档记录 advanced 用户自定义环境的设计方向：User 级 conda 环境，受控自动注册。

## 已确认决策

| 决策点 | 选择 |
| --- | --- |
| 自定义环境范围 | User 级 |
| 自动化权限 | agent 外层创建，MCP 只注册/index |
| 官方环境是否可被用户修改 | 不可修改 |
| 自定义环境基础 | 优先 fork/patch 官方环境 |
| 首版可见性 | agent/runtime 可见，不做前台 UI 管理 |

User 级意味着一个用户的自定义环境可以跨项目复用，但需要在任务 provenance 中记录使用了哪个 user env，避免项目复现时隐含依赖丢失。

## 受控注册流程

目标流程：

```text
用户/agent 发现官方环境缺包
  -> bio-environment-manager skill 判断是否需要新环境
  -> 优先复用官方 environmentRef
  -> 若必须新增，由 agent 在 MCP 外层创建/派生 user conda env
  -> agent 记录包来源、patch/spec、日志和 probe 结果
  -> environment registration MCP 写入 user environment index
  -> bio_runtime list/resolve/probe 暴露并验证 environmentRef
  -> 下游脚本或 workflow 使用该 environmentRef
```

环境 ID 示例：

```text
user:lyx/scanpy-custom:1
user:lyx/spatial-extra:1
```

## Environment Manager Skill

新增手写 compact runbook skill：

```text
bio-environment-manager
```

职责：

- 判断当前任务是否真的需要新环境。
- 优先复用官方环境。
- 优先基于官方环境生成最小 patch。
- 指导 agent 在 MCP 外层创建或派生 user conda env。
- 通过 MCP 注册/index 已创建的 user env。
- 通过 `bio_runtime` list/resolve/probe 返回可用的 `environmentRef`。
- 失败时区分包冲突、权限不足、资源不足、网络问题、probe 失败。

硬规则：

```text
能复用官方环境就不创建用户环境。
能基于官方环境 patch 就不从零创建。
probe 不通过就不注册为可用环境。
skill 不直接修改官方 index。
skill 不直接在官方环境中安装包。
MCP 不负责真实 conda/mamba/pip/R/GitHub 安装。
```

包来源不做固定白名单；agent 必须记录来源、版本、Git commit/tag、channel/repository 和许可证/凭证风险。

## MCP 注册草案

注册已创建的 user conda 环境：

```text
environment_registration.register_user_conda
```

请求：

```json
{
  "baseEnvironmentRef": "sc-py-singlecell",
  "name": "scanpy-custom",
  "prefix": "/srv/openbioscience/users/lyx/envs/scanpy-custom-1",
  "packageDelta": {
    "channels": ["conda-forge", "bioconda"],
    "dependencies": ["squidpy", "spatialdata"],
    "pip": [],
    "r": [],
    "github": []
  },
  "probeSummary": {
    "status": "passed",
    "log": "execution/logs/environment_probe.log"
  },
  "supports": {
    "skills": ["openscience-singlecell"],
    "tools": ["scanpy", "squidpy"],
    "workflows": ["spatial-singlecell"]
  }
}
```

响应：

```json
{
  "environmentRef": "user:lyx/scanpy-custom:1",
  "status": "ready",
  "path": {
    "conda": "/srv/openbioscience/users/lyx/envs/scanpy-custom-1"
  }
}
```

## User Index 示例

```yaml
userEnvironments:
  user:lyx/scanpy-custom:1:
    path:
      conda: /srv/openbioscience/users/lyx/envs/scanpy-custom-1
      entry: conda run -p /srv/openbioscience/users/lyx/envs/scanpy-custom-1
    build:
      base: singlecell-python
      condaPatch: /srv/openbioscience/users/lyx/env-specs/scanpy-custom-1.yml
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
```

## 待开发事项

1. 完成 `bio-environment-manager` skill SOP。
2. 定义 environment registration MCP 的 register/index schema。
3. 让 `bio_runtime` 支持 user env 的 list/resolve/probe。
4. 记录 build/probe 日志和 user env provenance。
5. 暂不开发前台 UI 管理、复杂环境状态机或 server-side installer。
