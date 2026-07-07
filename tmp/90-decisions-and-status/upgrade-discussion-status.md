# OpenBioScience Upgrade Discussion Status

本文档记录当前临时讨论目录中需要持续推进的升级议题。它不是最终 PRD，而是后续拆解设计、实施计划和验证清单的索引。

## 当前开发日志结构

| 分组 | 目录 | 内容 |
| --- | --- | --- |
| 当前目录架构读取 | `tmp/00-current-architecture/` | Electron/WebUI/backend bridge、Science/Bio harness、测试入口、源码边界 |
| UI | `tmp/10-development-directions/ui/` | 名称替换、Bio 专业化 UI、Bio mode 入口、viewer/artifact 体验 |
| Skills/MCP | `tmp/10-development-directions/skills-mcp/` | Bio router skill、默认 MCP preset、skills 与 MCP 的环境引用方式 |
| SSH/Runtime | `tmp/10-development-directions/ssh-runtime/` | 历史 SSH 资源错位问题、remote runtime/HPC 后续方向 |
| Environment | `tmp/10-development-directions/environment/` | server-native 环境服务、Docker 内 Conda、轻量 index、User 级 conda |
| 决策与状态 | `tmp/90-decisions-and-status/` | 阶段性决策、开放问题、后续计划 |

## 当前开发方向

| 议题 | 当前状态 | 已完成 | 待完成/待讨论 |
| --- | --- | --- | --- |
| UI 修改 | 进行中 | 已完成 APP/CLI/HTML/icon 等名称更新为 OpenBioScience；已发现并修复部分首页字号不一致问题 | 继续做 Bio 专业化 UI：信息架构、视觉风格、Bio mode 入口、viewer/artifact 体验、设置页分组 |
| Skill 调整 | 进行中 | 已删除一批与生物医学无关的 skills，并保留/整理生命科学相关基础能力 | 新增 Bio router skill、领域 SOP skill、数据库/source policy skill，并补 manifest/materialization/test |
| MCP 调整 | 尚未实质开始 | 已识别 MCP 是 Bio 能力落地的重要层，现有 research/science/medical/lab/user-input 等可复用 | 梳理内置 MCP catalog、Bio 默认 MCP preset、远程/本地 MCP 边界、Electron/WebUI/package 验证路径 |
| SSH/远程计算调整 | 尚未实质开始 | 已明确核心问题：当前 SSH 连接不等于完整远程计算平台；远程算力必须和数据可达性绑定 | 设计 Remote Runtime Mode：本地 UI、远程 CLI/agent runtime、显式数据部署、远程 token/provider、结果回收 |
| Environment 环境服务 | 规划中 | 已明确 server-native 前提；官方环境采用 Docker 内 Conda；index 轻量化；用户环境采用 User 级 conda 和受控自动注册 | 定义 environment index schema、Environment Resolver、server API、环境状态 UI、environment-manager skill/MCP 边界 |

## 核心判断

OpenBioScience 不能只把 SSH 服务器作为一个 prompt/context 交给 agent。对于专业 Bio 任务，远程计算需要同时明确：

- 数据在哪里。
- 执行在哪里。
- 环境在哪里。
- token/provider 由谁消耗。
- 结果在哪里产生，是否回收。

因此后续设计应把 UI、skill、MCP、SSH/remote runtime、environment 五个议题联动处理，而不是分别独立改文案或入口。

## 建议后续顺序

1. 先完成架构读取和五项开发方向的边界定义。
2. 再为 Bio P0 定义最小闭环：Bio UI mode -> Bio skills -> 默认 MCP/source policy -> environmentRef -> artifact/report 输出。
3. Environment 服务应先落轻量 index 和 resolver，再接复杂 job runner。
4. SSH/Remote Runtime 作为独立 P1/P2 设计，不应以当前 SSH host prompt 注入的形态假装已经具备 HPC 能力。
5. 每个议题都需要形成独立修改计划、风险清单和验证路径。
