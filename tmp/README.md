# OpenBioScience Development Notes

本目录保存 OpenBioScience 升级讨论中的临时架构笔记、方向梳理和阶段性结论，不作为最终 PRD 或正式文档发布入口。

## Overview

当前已完成四类基础工作：

- 一轮现有 OpenScience / DeepOrganiser 架构阅读与映射
- 一轮 UI 名称层清理与 `OpenBioScience` 品牌替换
- 一轮面向生物医学场景的 skills 整合与物化适配
- 一轮官方分析环境 catalog 定稿、NAS 存储迁移与 Conda 前缀安装
- 第一批 scRNA-seq `bio-*` runbook skills 与 Bio MCP control-plane skeleton

当前仍在推进的主题：

- 更进一步的 Bio UI 风格改造
- MCP 体系精简与重构
- server-native / SSH / remote runtime 的执行语义统一
- 官方分析环境与用户自定义环境的 resolver / UI / skill-MCP 绑定
- demo-driven reproduction：用固定 demo case 反推 environment / skill / MCP 的最小升级闭环
- omics 文献复现规划层：在脚本和执行前先完成 paper / data / code / method / environment / task planning

## Directory Layout

```text
tmp/
  00-current-architecture/
  10-development-directions/
    demo-reproduction/
    environment/
    skills-mcp/
    ssh-runtime/
    ui/
  90-decisions-and-status/
```

## Completed Work

### 1. Architecture Summary

已完成当前项目框架拆解，覆盖前端、bridge、backend boundary、science mode、测试入口与 harness 位置判断。

相关文档：

- `00-current-architecture/architecture-map.md`
- `00-current-architecture/backend-bridge-map.md`
- `00-current-architecture/science-bio-harness-map.md`
- `00-current-architecture/testing-validation-map.md`
- `00-current-architecture/upgrade-framework-notes.md`

核心结论：

- 当前 OpenBioScience 仍然是一个以 Electron/WebUI shell + bundled backend 为主的框架。
- 业务执行、agent、mcp、conversation、settings 等主要运行能力更多由 backend API 面提供。
- `resources/skills/` 是当前 science/bio 工作流定制的重要可扩展层。

### 2. UI Naming Cleanup

已完成一轮 UI 名称替换与显式品牌清理，重点是将用户可见的 `OpenScience` 入口统一更新为 `OpenBioScience`，并补做了 icon 替换。

当前已落实：

- App / WebUI 可见名称的主要替换
- 设置页相关 science 文案补充
- 图标资源替换

后续待做：

- Bio 专业化视觉风格改造
- 首页与工作台信息密度重组
- artifact / viewer / environment 相关入口的 UI 组织

相关讨论：

- `10-development-directions/ui/frontend-ui-map.md`

### 3. Skills Integration

已完成一轮 AcademicForge biomedical skills 向当前 OpenBioScience skills 体系的导入、筛选、物化与命名适配。

当前已落实：

- 引入 AcademicForge 上游 skills 作为 vendor source
- 选择生物医学相关 skill 集进入当前物化流程
- 生成 `cs-*` 命名空间 materialized skills
- 将上游 skill 内部互相引用改写为当前 OpenBioScience 可识别的 skill id
- 保留现有 `kdense-*` 技能族，并避免粗暴覆盖已有调用约定

后续待做：

- 继续精简无效或冗余的 skill surface
- 继续细化 Bio router skill / 环境注册 skill
- 将第一批 `bio-*` runbooks 接入真实 environment resolver / runner / data provider

相关讨论：

- `10-development-directions/skills-mcp/agent-mcp-skill-map.md`
- `10-development-directions/skills-mcp/cs-skill-and-mcp-style-study.md`
- `10-development-directions/skills-mcp/openbioscience-skill-template.md`
- `10-development-directions/skills-mcp/omics-reproduction-planning-skill-mcp-plan.md`
- `10-development-directions/skills-mcp/scrna-seq-skill-mcp-plan.md`
- `10-development-directions/skills-mcp/scrna-seq-skill-mcp-implementation-log.md`

### 3.1 scRNA-seq Skill/MCP Control Plane

已完成第一批手写 scRNA-seq runbook skills：

- `bio-scrna-reproduction`
- `bio-environment-routing`
- `bio-data-resolution`
- `bio-singlecell-import`
- `bio-qc-preprocess`
- `bio-batch-dim-cluster`
- `bio-marker-optimization`
- `bio-cell-annotation`
- `bio-scrna-plotting`
- `bio-result-interpretation`

已新增四个 Bio MCP profile：

- `openscience-bio-runtime` / `bio_runtime`
- `openscience-bio-source` / `bio_source`
- `openscience-bio-knowledge` / `bio_knowledge`
- `openscience-bio-plot` / `bio_plot`

当前状态：这些 MCP 先提供 control-plane skeleton、catalog、validation 和 plan contract，不执行重分析、不下载大文件、不做真实 provider 查询。下一步应以 `human_CRC` demo case 驱动真实 resolver、runner、source provider 和 plotting scripts。

### 4. Official Environment Bootstrap

已完成一轮官方单细胞复现环境的 Conda 前缀安装与存储迁移。当前阶段先把 server-side 可执行环境落到 NAS；Docker 外壳、Environment Resolver、server API 和 UI 状态展示仍属于后续开发项。

当前已落实：

- 官方环境统一存储到 `<OPENBIOSCIENCE_RUNTIME_ROOT>/environments/official`
- Conda / mamba cache 统一放到 `<OPENBIOSCIENCE_RUNTIME_ROOT>/cache`
- 已安装 8 个官方环境：`sc-py-singlecell`、`sc-r-singlecell`、`sc-r-plot`、`sc-r-clinical`、`sc-cci-r`、`sc-r-trajectory`、`sc-r-tumor-cnv`、`sc-network-grn-r`
- `sc-py-singlecell` 已补 `scvi-tools`，并按 CUDA 12.4 / PyTorch 2.5.1 组合完成导入验证
- 旧的 `/tmp/openbioscience-envs` 临时环境前缀已清理
- 新增 bootstrap manifest 和安装入口，作为后续 resolver / server 资源注册的输入雏形

后续待做：

- 将 NAS Conda 前缀封装进官方 Docker image 或 server runtime image
- 将 bootstrap manifest 升级为 server 可查询的轻量 environment index
- 为 skill/MCP/workflow 增加明确的 `environmentRef`
- 增加环境可用性 probe、资源检查、UI 状态展示和任务 provenance 记录

相关讨论：

- `10-development-directions/environment/official-environment-catalog.md`
- `10-development-directions/environment/environment-runtime-architecture.md`
- `10-development-directions/environment/environment-index-design.md`

## In Progress

### Demo-driven Reproduction

- `10-development-directions/demo-reproduction/demo-driven-iteration.md`
- `10-development-directions/demo-reproduction/p0-case-capability-matrix.md`
- `10-development-directions/skills-mcp/omics-reproduction-planning-skill-mcp-plan.md`

当前已明确：

- `demo/<case>/README.md` 负责记录单篇文章如何被当前 harness 接住，以及当前可复现边界。
- `tmp/` 负责记录跨 case 的平台迭代逻辑，而不是替代 case 文档。
- 从本地证据强弱看，`human_CRC` 是当前最适合驱动第一轮 environment / skill / MCP 迭代的主导 case。
- 在进入具体脚本和执行前，应先补齐 `bio-omics-reproduction-planning` skill 与 `bio_reproduction` MCP 规划控制面，用于平衡科学性解读、实现规划和基础审计。

### SSH / Runtime

- `10-development-directions/ssh-runtime/ssh-remote-runtime-adjustment.md`

当前已明确的问题是：如果 UI 在本地而计算、数据、token、环境实际在远程或 server 端，必须明确资源归属与数据可达性，避免“本地数据 + 远程算力”语义错位。

### Environment

- `10-development-directions/environment/environment-runtime-architecture.md`
- `10-development-directions/environment/environment-index-design.md`
- `10-development-directions/environment/user-conda-registration-skill.md`

当前方向已经明确为：

- OpenBioScience 应按 server-native harness 设计
- 官方环境采用 Docker 外壳 + Conda 内核
- environment index 保持轻量，只保留 `path`、`build`、`key resources`、`key supports`
- 用户自定义环境在受控 conda 注册流程下接入
- 当前已先完成 NAS 侧 Conda 前缀落地；Docker / resolver / server API / UI 仍待实现

## Status Files

- `90-decisions-and-status/bio-upgrade-decisions.md`
- `90-decisions-and-status/upgrade-discussion-status.md`

这两份文件继续作为后续 PRD、技术设计与实施排期的汇总入口。
