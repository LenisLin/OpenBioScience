# OpenBioScience Development Notes

本目录保存 OpenBioScience 升级讨论中的临时架构笔记、方向梳理和阶段性结论，不作为最终 PRD 或正式文档发布入口。

## Overview

当前已完成三类基础工作：

- 一轮现有 OpenScience / DeepOrganiser 架构阅读与映射
- 一轮 UI 名称层清理与 `OpenBioScience` 品牌替换
- 一轮面向生物医学场景的 skills 整合与物化适配

当前仍在推进的主题：

- 更进一步的 Bio UI 风格改造
- MCP 体系精简与重构
- server-native / SSH / remote runtime 的执行语义统一
- 官方分析环境与用户自定义环境的双层架构

## Directory Layout

```text
tmp/
  00-current-architecture/
  10-development-directions/
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
- 补 Bio router skill / 环境注册 skill
- 让 skill 与 MCP / environment index 的引用关系更明确

相关讨论：

- `10-development-directions/skills-mcp/agent-mcp-skill-map.md`

## In Progress

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

## Status Files

- `90-decisions-and-status/bio-upgrade-decisions.md`
- `90-decisions-and-status/upgrade-discussion-status.md`

这两份文件继续作为后续 PRD、技术设计与实施排期的汇总入口。
