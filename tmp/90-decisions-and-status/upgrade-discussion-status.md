# OpenBioScience Upgrade Discussion Status

本文档记录当前临时讨论目录中需要持续推进的升级议题。它不是最终 PRD，而是后续拆解设计、实施计划和验证清单的索引。

## 当前开发日志结构

| 分组 | 目录 | 内容 |
| --- | --- | --- |
| 当前目录架构读取 | `tmp/00-current-architecture/` | Electron/WebUI/backend bridge、Science/Bio harness、测试入口、源码边界 |
| Demo reproduction | `tmp/10-development-directions/demo-reproduction/` | 单 case 如何驱动 environment / skill / MCP 的最小迭代；三 case 能力矩阵 |
| UI | `tmp/10-development-directions/ui/` | 名称替换、Bio 专业化 UI、Bio mode 入口、viewer/artifact 体验 |
| Skills/MCP | `tmp/10-development-directions/skills-mcp/` | Bio router skill、默认 MCP preset、skills 与 MCP 的环境引用方式 |
| SSH/Runtime | `tmp/10-development-directions/ssh-runtime/` | 历史 SSH 资源错位问题、remote runtime/HPC 后续方向 |
| Environment | `tmp/10-development-directions/environment/` | server-native 环境服务、Docker 内 Conda、轻量 index、User 级 conda |
| 决策与状态 | `tmp/90-decisions-and-status/` | 阶段性决策、开放问题、后续计划 |

## 当前开发方向

| 议题 | 当前状态 | 已完成 | 待完成/待讨论 |
| --- | --- | --- | --- |
| UI 修改 | 进行中 | 已完成 APP/CLI/HTML/icon 等名称更新为 OpenBioScience；已发现并修复部分首页字号不一致问题 | 继续做 Bio 专业化 UI：信息架构、视觉风格、Bio mode 入口、viewer/artifact 体验、设置页分组 |
| Demo case reproduction | 进行中 | 已明确 `demo` 用于承载 case-facing 复现框架，`tmp` 用于承载 cross-case 开发日志；已补三篇 case 的本地资产与复现边界判断 | 以 `human_CRC` 驱动第一轮 environment / skill / MCP 迭代，再逐步接入 `human_ICI` 和 `mouse_SARC` |
| Skill 调整 | 进行中 | 已删除一批与生物医学无关的 skills，并保留/整理生命科学相关基础能力；已新增第一批 scRNA-seq `bio-*` runbook skills，并通过 `openscience-singlecell` router 暴露 | 用 demo case 校验每个 runbook 的可用性；后续补充 CCI、clinical、trajectory、GRN、CNV 等下游完整 runner contract |
| MCP 调整 | 部分落地/进行中 | 已识别 MCP 是 Bio 能力落地的重要层；已新增 `openscience-bio-runtime`、`openscience-bio-source`、`openscience-bio-knowledge`、`openscience-bio-plot` 四个 control-plane profile，并接入 desktop/WebUI/build/package/test | 将 skeleton 接入真实 environment resolver、matrix/object inspector、workflow runner、source provider、knowledge provider 和 plotting scripts |
| SSH/远程计算调整 | 尚未实质开始 | 已明确核心问题：当前 SSH 连接不等于完整远程计算平台；远程算力必须和数据可达性绑定 | 设计 Remote Runtime Mode：本地 UI、远程 CLI/agent runtime、显式数据部署、远程 token/provider、结果回收 |
| Environment 环境服务 | 部分落地/进行中 | 已明确 server-native 前提；官方环境采用 Docker 内 Conda；index 轻量化；用户环境采用 User 级 conda 和受控自动注册；已完成 8 个官方 Conda 环境的 NAS 前缀安装与 bootstrap manifest；已清理旧 `/tmp/openbioscience-envs` 临时前缀；`sc-py-singlecell` 已完成 CUDA 12.4 / PyTorch 2.5.1 / `scvi-tools` 导入验证 | 将 NAS Conda 前缀封装进官方 Docker/server runtime；定义正式 environment index schema、Environment Resolver、server API、环境状态 UI、environment-manager skill/MCP 边界；补齐全部环境 smoke probe 和任务 provenance |

## 核心判断

OpenBioScience 不能只把 SSH 服务器作为一个 prompt/context 交给 agent。对于专业 Bio 任务，远程计算需要同时明确：

- 数据在哪里。
- 执行在哪里。
- 环境在哪里。
- token/provider 由谁消耗。
- 结果在哪里产生，是否回收。

因此后续设计应把 UI、skill、MCP、SSH/remote runtime、environment 五个议题联动处理，而不是分别独立改文案或入口。

同时，demo 文档和开发文档需要保持边界：

- `demo/<case>/README.md` 只写单篇文章的复现目标、当前资产、可复现边界和阻塞项。
- `tmp/` 只写跨 case 的能力规划、环境架构、MCP / skill 设计和实施状态。

## 建议后续顺序

1. 先完成架构读取和五项开发方向的边界定义。
2. 再以 `human_CRC` 为第一主导 case，定义 environment / skill / MCP 的最小可执行闭环。
3. Environment 服务应先落轻量 index 和 resolver，再接复杂 job runner。
4. 之后把 `human_ICI` 接入 response / clinical 相关能力，把 `mouse_SARC` 接入 correction / CyTOF / cross-species 相关能力。
5. SSH/Remote Runtime 作为独立 P1/P2 设计，不应以当前 SSH host prompt 注入的形态假装已经具备 HPC 能力。
6. 每个议题都需要形成独立修改计划、风险清单和验证路径。

## 最新阶段性更新：官方环境落地

本阶段把环境议题从纯架构讨论推进到可执行前缀层：

- 官方环境根目录已迁移到 `/mnt/NAS_21T/ProjectData/OpenBioScience/environments/official`。
- 当前已安装 8 个官方环境：`sc-py-singlecell`、`sc-r-singlecell`、`sc-r-plot`、`sc-r-clinical`、`sc-cci-r`、`sc-r-trajectory`、`sc-r-tumor-cnv`、`sc-network-grn-r`。
- `sc-py-singlecell` 去掉临时 CUDA 版本后缀，作为正式环境名；`sc-r-trajectory` 也使用无版本后缀的正式名称。
- `sc-py-singlecell` 已完成核心导入验证：`torch 2.5.1`、CUDA `12.4`、`torchvision 0.20.1`、`torchaudio 2.5.1`、`scvi-tools 1.4.3`。
- 新增 `environments/official/bootstrap/env-manifest.json` 和 `install-official-envs.sh`，记录官方环境的 YAML、NAS prefix 和 cache 根目录。

仍需注意：这一步解决的是 server-side Conda 前缀和存储布局，不等于完整 harness runtime 已经完成。Docker image、resolver、job runner、UI 状态与 skill/MCP 的 `environmentRef` 绑定仍是后续工程任务。

## 最新阶段性更新：scRNA-seq Skill/MCP Control Plane

本阶段把 skills/MCP 议题从规划推进到第一批可加载骨架：

- 新增 10 个手写 `bio-*` scRNA-seq runbook skills，覆盖 reproduction、environment、data、import、QC、cluster、marker、annotation、plotting、interpretation。
- 更新 `openscience-singlecell` router，明确 `bio-*` 是手写 runbooks，不由 generated manifest 管理。
- 新增共享 `builtin-mcp-bio.js` bundle，通过 `OPENBIOSCIENCE_BIO_MCP_PROFILE` 暴露四个独立 server profile：runtime、source、knowledge、plot。
- 已接入 desktop migration、standalone WebUI catalog、MCP bundle build 和 package unpack list。
- 已新增/更新测试并通过 targeted validation。

仍需注意：当前 MCP 是 control-plane skeleton。它能表达 catalog、环境引用、workflow/plot validation 和 plan contract，但还没有执行真实 R/Python 分析、下载公开数据、查询 marker/atlas 数据库或生成图形。下一步应以 `human_CRC` demo case 驱动真实 runtime runner。
