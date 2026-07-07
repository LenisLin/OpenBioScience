# Backend And Bridge Map

本文档描述 Electron、WebHost、typed bridge、本地 IPC 与 `deeporganiser-core` 的边界。Bio 升级时需要先判断能力归属，再决定应该改前端 contract、Electron bridge、MCP server，还是 Rust core API。

## 关键运行路径

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| desktop entry | `packages/desktop/src/index.ts` | Electron 第一入口，配置路径、单实例、日志、Sentry、storage、窗口、backend startup |
| process init | `packages/desktop/src/process/index.ts` | 平台注册、storage、bridge、main-process i18n |
| backend startup | `packages/desktop/src/process/startup/backendStartup.ts` | backend 启动状态衔接 |
| backend lifecycle | `packages/web-host/src/backend-launcher.ts` | 解析/启动 `deeporganiser-core`，设置 data-dir、log-dir、work-dir、env |
| binary resolver | `packages/desktop/src/process/backend/binaryResolver.ts` | 定位 bundled core 或 `DEEPORGANISER_CORE_BIN` |
| web host entry | `packages/web-host/src/index.ts` | 启动 WebHost 和 proxy |
| static/proxy server | `packages/web-host/src/static-server.ts` | 静态资源、登录代理、`/api/*`、`/ws`、`/api/stt/stream` proxy |
| preload | `packages/desktop/src/preload/main.ts` | 暴露 Electron bridge 与 backend port/startup 状态 |
| renderer HTTP bridge | `packages/desktop/src/common/adapter/httpBridge.ts` | HTTP 方法、backend URL resolution、`BackendHttpError`、敏感日志脱敏 |
| typed API facade | `packages/desktop/src/common/adapter/ipcBridge.ts` | renderer 使用的主要 typed API 表面 |
| browser bridge | `packages/desktop/src/common/adapter/browser.ts` | desktop/WebUI bridge 适配 |
| main bridge | `packages/desktop/src/common/adapter/main.ts`, `registry.ts` | Electron BrowserWindow/WebSocket event broadcast |

## API 所有权判断

| 能力类型 | 应该放哪里 | 说明 |
| --- | --- | --- |
| auth/users/providers/conversations/messages/agents/MCP/cron/team/settings/realtime | `deeporganiser-core` API + `ipcBridge.ts` wrapper | 当前大部分业务 API 属于 core |
| dialogs/windows/tray/OS path/notifications/update/app lifecycle | Electron `process/bridge/*` | 桌面专属能力 |
| WebUI static/proxy/login forwarding | `packages/web-host/src/static-server.ts` | 只能做代理和静态服务 |
| 本地 Science artifact archive/git store | Electron process service/bridge | 当前是本地实现，未来可评估迁移 core |
| built-in MCP tools | `process/resources/builtinMcp/*` + build/package scripts | 适合工具编排和本地 harness，不适合替代 core 业务数据库 |

Bio P0 如果只是新增 mode/profile/prompt/source preset，主要改 renderer/common/MCP/skills。这个判断有一个前置 gate：必须确认 core-owned conversation 创建、读取和事件回传路径接受并保留 `bio` mode metadata。若不满足，应 fallback 为 `science` mode + `bio` profile metadata，或先定义 core API contract。只有当 Bio 需要持久化独立实体、权限模型、共享团队对象或远程同步时，才应设计新的 core API 面。

## ipcBridge 现状

`packages/desktop/src/common/adapter/ipcBridge.ts` 是混合 facade：

- 多数函数映射到 `/api/*` 或 WebSocket。
- 少数函数通过 Electron IPC 访问桌面专属能力。
- renderer 组件应该依赖它，而不是直接依赖 Electron main 或裸 HTTP。

Bio 相关新增 API 的推荐顺序：

1. 先确认后端 owner：core API、Electron-only local service、还是 MCP server。
2. 如果是 core-owned，新增/复用 `ipcBridge.ts` typed wrapper。
3. 如果 renderer shape 与 backend DTO 不一致，在 `packages/desktop/src/common/` 增加 mapper/type。
4. 如果是 realtime，复用 `wsEmitter`/`wsMappedEmitter`，不要轮询。
5. 只有桌面 OS 或本地文件能力才新增 `packages/desktop/src/process/bridge/*`。

## 本地 Science/Medical 扩展点

| 能力 | 文件 | 当前职责 | Bio 相关判断 |
| --- | --- | --- | --- |
| research evidence MCP | `packages/desktop/src/process/resources/builtinMcp/researchEvidenceServer.ts` | 统一 evidence 工具入口，含 paperclip/bio_tools provider | Bio source/provider preset 的主入口 |
| research evidence env | `packages/desktop/src/common/config/researchEvidenceMcpEnv.ts` | MCP env 和 provider 配置 | Bio 默认 domain/provider 应在这里有明确映射 |
| science artifact MCP | `packages/desktop/src/process/resources/builtinMcp/scienceArtifactServer.ts` | artifact create/patch/version/snapshot/publish 等 | Bio artifact 应优先复用 |
| medical evidence MCP | `packages/desktop/src/process/resources/builtinMcp/medicalEvidenceServer.ts` | 临床证据工作流 | 保持独立，不作为通用 Bio pipeline |
| medical evidence store | `packages/desktop/src/deepscientist_lark/medical_evidence_reports/store.ts` | 本地医学证据报告存储 | 可参考，但不建议复制新本地存储 |
| science artifact store | `packages/desktop/src/process/services/scienceArtifactGitStore.ts` | `.openscience` artifact git store | Bio P1 可扩展 artifact metadata/viewer |
| science archive bridge | `packages/desktop/src/process/bridge/scienceArtifactArchiveBridge.ts` | artifact 归档桥 | 桌面端 Bio artifact 归档可优先复用；WebUI 需要走 MCP/core/static 可访问路径并单独验证 |
| compute hosts | `packages/desktop/src/process/bridge/computeHostsBridge.ts`, `packages/desktop/src/common/types/compute.ts` | 本地/远程计算 host 配置 | P2 Bio HPC/omics pipeline 可复用 |
| science LaTeX | `packages/desktop/src/process/bridge/scienceLatexBridge.ts` | 科学报告 LaTeX 支持 | Bio report 输出可复用 |

## Bundled Core 与 Packaging

| 模块 | 文件 | 说明 |
| --- | --- | --- |
| core pin | `package.json#deepOrganiserCoreVersion` | 当前 pinned 版本为 `v0.1.34` |
| prepare core | `scripts/prepareDeepOrganiserCore.js`, `packages/shared-scripts/src/prepare-deeporganiser-core.js` | 下载/准备 bundled core |
| verify core | `packages/shared-scripts/src/verify-bundled-deeporganiser-core-resources.js` | 验证 binary/manifest/managed-resources |
| package hook | `scripts/afterPack.js` | 打包后资源处理 |
| electron builder | `packages/desktop/electron-builder.yml` | 打包资源规则 |
| MCP build | `scripts/build-mcp-servers.js`, `packages/desktop/electron.vite.config.ts` | built-in MCP 编译和 inclusion |
| WebUI launch | `scripts/webui.ts` | WebUI 模式也要准备 backend/MCP/static 资源 |

Bio 工具如果依赖 vendor Python/server/root，必须验证 Electron 打包和 WebUI 启动路径都能找到对应资源。不能只在开发环境 `resources/skills/vendor/**` 可用时认为已完成。

## 已识别风险

1. `codex_memory` 相关服务存在直接访问 backend SQLite 的迹象，跨越 core 边界；Bio 不应仿照这种模式。
2. Electron-local report/store 能力对 WebUI/多端一致性不天然成立。
3. `research_evidence` 的 `bio_tools` provider 是否在 packaged app 可用，需要打包验证。
4. WebUI 和 Electron 的 MCP/bootstrap 路径不同，Bio 资源必须双路径验证。
5. `deeporganiser-core` 源码不在当前 TS 仓库内，新增 core API 前需要单独确认 Rust API 面。

## Bio 后端/桥接 P0 建议

- 不新增 WebHost 业务路由。
- 不新增 core API，前提是现有 conversation create/readback/realtime path 能接受并保留 Bio metadata。
- 复用 `research_evidence` 和 `science_artifact` built-in MCP。
- Bio mode 的 conversation metadata 先通过现有 conversation create path 验证；如果 core 拒绝或丢失新 mode，则使用 `science` mode + `bio` profile metadata 作为 P0 fallback。
- 如需 Bio settings，优先走 `/api/settings/client` 和 `configService.ts`。
- 如需本地文件 preview/archive，桌面端复用 science artifact archive bridge；WebUI 端必须明确 MCP/core/static 访问路径并加 E2E 验证。
