# User Conda Registration Skill

本文档记录 advanced 用户自定义环境的设计方向：User 级 conda 环境，受控自动注册。

## 已确认决策

| 决策点 | 选择 |
| --- | --- |
| 自定义环境范围 | User 级 |
| 自动化权限 | 受控自动注册 |
| 官方环境是否可被用户修改 | 不可修改 |
| 自定义环境基础 | 优先 fork/patch 官方环境 |

User 级意味着一个用户的自定义环境可以跨项目复用，但需要在任务 provenance 中记录使用了哪个 user env，避免项目复现时隐含依赖丢失。

## 受控自动注册流程

目标流程：

```text
用户/agent 发现官方环境缺包
  -> environment-manager skill 判断是否需要新环境
  -> 生成最小 conda patch
  -> 调用 server API
  -> server 校验权限、资源、包来源、名称
  -> server 创建 user-scoped conda env
  -> 运行 probe
  -> 写入 user environment index
  -> 返回 environmentRef
```

环境 ID 示例：

```text
user:lyx/scanpy-custom:1
user:lyx/spatial-extra:1
```

## Environment Manager Skill

建议新增手写 compact router skill：

```text
openbioscience-environment-manager
```

职责：

- 判断当前任务是否真的需要新环境。
- 优先复用官方环境。
- 优先基于官方环境生成最小 patch。
- 生成 server 可执行的注册请求。
- 等待 build/probe 结果。
- 返回可用的 `environmentRef`。
- 失败时区分包冲突、权限不足、资源不足、网络问题、probe 失败。

硬规则：

```text
能复用官方环境就不创建用户环境。
能基于官方环境 patch 就不从零创建。
probe 不通过就不注册为可用环境。
skill 不直接修改官方 index。
skill 不直接在官方环境中安装包。
```

是否默认注入该 skill 暂不决定，保留为后续开发需求。

## API 草案

注册 user conda 环境：

```text
POST /api/environments/user-conda
```

请求：

```json
{
  "baseEnvironment": "singlecell-python",
  "name": "scanpy-custom",
  "condaPatch": {
    "channels": ["conda-forge", "bioconda"],
    "dependencies": ["squidpy", "spatialdata"]
  },
  "supports": {
    "skills": ["openscience-singlecell"],
    "tools": ["squidpy"]
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

1. 定义 `openbioscience-environment-manager` skill 的 SOP。
2. 新增 server API 受控创建 user conda env。
3. 实现 build/probe 状态记录。
4. 在 UI 中展示用户环境列表、状态、失败日志和删除入口。
5. 在任务 provenance 中记录 user env 使用情况。

