# OpenBioScience 升级架构总图

本文档把当前 OpenBioScience 工作区按可修改边界拆开，目标是为后续从 OpenScience 升级为更专业的 Bio 版本提供定位图。这里记录的是本地源码事实、已存在能力和推荐升级切口，不代表后端 Rust `deeporganiser-core` 已经具备新的 Bio API。

## 当前事实

OpenBioScience 目前仍是 DeepOrganiser/OpenScience 派生结构：

| 层级 | 主要位置 | 当前职责 |
| --- | --- | --- |
| Electron Main | `packages/desktop/src/index.ts`, `packages/desktop/src/process/` | 桌面生命周期、窗口、preload、托盘、系统能力、本地进程管理、Electron-only IPC |
| Renderer UI | `packages/desktop/src/renderer/` | React UI、Guid 首页、Conversation、Settings、Preview、Science/Medical 面板 |
| Common Contract | `packages/desktop/src/common/` | typed bridge、聊天/配置/agent/team 类型、DTO mapper、HTTP/WebSocket adapter |
| Web Host | `packages/web-host/src/` | 启动/连接 `deeporganiser-core`，托管 renderer 静态产物，代理 `/api/*`、`/ws`、登录路由 |
| Web CLI | `packages/web-cli/` | WebUI 启动辅助、浏览器打开、管理员密码流程 |
| Bundled Core | `resources/bundled-deeporganiser-core/<platform>-<arch>/` | 本地预编译 Rust 后端，开发/打包运行依赖；目录被 gitignore |
| Built-in MCP | `packages/desktop/src/process/resources/builtinMcp/` | research evidence、science artifact、medical evidence、lab skill 等本地 MCP server |
| Product Skills | `resources/skills/` | 随产品/skill pack 分发的 Science、数据库、单细胞、计算等 SOP 与工具路由 |
| Repo Agent Skills | `.claude/skills/` | 仓库内 contributor/agent 工作指导，不等同于产品运行时 skill |
| Extension Skill Examples | `examples/*/` | extension 贡献 skills/assistants/MCP 的示例 |
| Tests | `tests/`, `packages/web-host/vitest.config.ts`, `mobile/` | Vitest、Playwright、WebHost、mobile 测试入口 |

核心边界：业务 API 大多属于 `deeporganiser-core`，前端通过 `ipcBridge.ts` 的 typed facade 调用。不要在 `packages/web-host/src/static-server.ts` 添加业务路由，也不要让 renderer 绕过 `ipcBridge` 直接访问后端业务接口，除非已有局部模式明确支持。

## 运行时主链路

桌面模式：

1. `packages/desktop/src/index.ts` 初始化 Electron、路径、日志、单实例、Sentry、storage。
2. `packages/desktop/src/process/startup/backendStartup.ts` 和 WebHost backend lifecycle 解析并启动 `deeporganiser-core`。
3. `packages/desktop/src/preload/main.ts` 暴露 Electron bridge、后端端口与启动状态。
4. `packages/desktop/src/renderer/main.tsx` 初始化 config、i18n、theme、browser bridge、agent metadata，然后挂载 React。
5. Renderer 业务请求主要经 `packages/desktop/src/common/adapter/ipcBridge.ts` -> `httpBridge.ts` -> `/api/*` 或 `/ws`。

Standalone WebUI：

1. `scripts/webui.ts` 解析 renderer 产物、数据目录、端口和 `deeporganiser-core`。
2. `packages/web-host/src/index.ts` 启动静态 server 和 reverse proxy。
3. `packages/web-host/src/static-server.ts` 只处理静态资源、登录代理、API/WS 代理，不承载业务实现。

## Bio 升级推荐基线

推荐把 Bio 的第一阶段定义为：

```text
Bio = Guid capability mode
    + Bio preset assistant/profile
    + Bio skill/router bundle
    + 复用 Science MCP evidence/artifact pipeline
    + 补齐 Bio 领域 viewer/settings/source defaults
```

不建议第一阶段新建 agent runtime 或 WebHost 业务路由。原因：

- 现有 Science Mode 已有 evidence、artifact、panel schema、viewer contract 和 Git artifact store。
- `research_evidence` 已配置/声明 `bio_tools` provider 和 PubMed/ChEMBL/GEO/AlphaFold 等别名；实际可用性需要通过 `status/list_tools/search/read/call` 在 dev、packaged Electron、WebUI 三个路径验证。
- `common/chat/science.ts` 已声明分子、蛋白结构、genome track、alignment 等 artifact 类型，但 UI viewer 尚未完全实现。
- 新 runtime 会放大后端 API、权限、packaging、WebUI、测试的改动面。

关键 gate：必须确认 core-owned conversation 创建/读取路径接受并回传 `bio` mode metadata。若不接受，P0 fallback 是使用 `science` mode 加 `bio` profile metadata，而不是未经验证地假设新 mode 已持久化。

## 推荐切分文档

| 文件 | 关注点 |
| --- | --- |
| `tmp/frontend-ui-map.md` | Guid、Conversation、Preview、Settings 的 Bio 切入点 |
| `tmp/backend-bridge-map.md` | Electron/Main/WebHost/Core/IPC 边界与可扩展位置 |
| `tmp/agent-mcp-skill-map.md` | agent、assistant、capability mode、MCP、skills、extension 的关系 |
| `tmp/science-bio-harness-map.md` | Science/Bio harness、evidence、artifact、viewer、skill router |
| `tmp/testing-validation-map.md` | 单测/E2E/WebHost/packaging/i18n 验证矩阵 |
| `tmp/bio-upgrade-decisions.md` | P0/P1/P2 决策、风险和开放问题 |

## 后续修改原则

1. Bio 作为 capability mode 先落地，复用 `science` 的证据与 artifact 管线。
2. 新的 renderer 数据请求先加 `ipcBridge.ts` typed wrapper；只有桌面 OS 能力才加 Electron bridge。
3. Bio viewer 优先补齐已有 contract 中的 `igv`、`vitessce`、`msa`、`molstar`，避免重复造 panel。
4. 临床/医疗证据边界保持独立：`medical_evidence` 不应被 Bio 泛化覆盖。
5. 所有用户可见文案走 i18n；Settings/UI 使用 Arco、IconPark、Uno tokens/CSS Modules。
6. 打包链路必须同时覆盖 Electron 和 WebUI，尤其是 built-in MCP、skills、bio tools provider 可用性。
