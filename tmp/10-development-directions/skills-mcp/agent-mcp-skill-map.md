# Agent, MCP And Skill Map

本文档梳理 agent runtime、preset assistant、Guid capability mode、MCP server、skills、extension、team/channel 的关系，并给出 Bio 升级的推荐形态。

## 当前 agent 分层

| 层级 | 关键文件 | 职责 |
| --- | --- | --- |
| agent metadata | `packages/desktop/src/renderer/utils/model/agentTypes.ts` | renderer 侧 agent 元数据 |
| detected agent type | `packages/desktop/src/common/types/agent/detectedAgent.ts` | execution engine kind：`acp`、`remote`、`codex`、`openclaw-gateway`、`nanobot` |
| Guid agent picker | `packages/desktop/src/renderer/pages/guid/hooks/useGuidAgentSelection.ts` | Guid 中选择可用 agent |
| picker utils/types | `packages/desktop/src/renderer/pages/guid/hooks/agentSelectionUtils.ts`, `types.ts` | agent 过滤、默认选择等 |
| preset assistant | `packages/desktop/src/common/types/agent/assistantTypes.ts` | assistant/profile 类型 |
| preset resolver | `packages/desktop/src/renderer/hooks/usePresetAssistantResolver.ts`, `usePresetAssistantInfo.ts` | assistant 信息解析 |
| conversation params | `packages/desktop/src/common/utils/buildAgentConversationParams.ts` | 创建 agent conversation 参数 |
| conversation create | `packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts`, `packages/desktop/src/common/adapter/ipcBridge.ts` | Guid 发起会话 |
| ACP custom agent | `packages/desktop/src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`, `InlineAgentEditor.tsx`, `AgentCard.tsx` | 本地 ACP agent 管理 |
| ACP type | `packages/desktop/src/common/types/platform/acpTypes.ts` | ACP capability/config/mode/model/permission/session 类型 |
| remote agent | `packages/desktop/src/common/types/agent/remoteAgentTypes.ts`, `RemoteAgentManagement.tsx` | 远程 agent 配置；当前 UI 暴露程度需进一步确认 |

当前内置/检测的 ACP CLI 包括 Claude Code、Codex、OpenCode、Qwen、Cursor Agent、Hermes Agent、Snow CLI 等。Bio P0 不需要新增 execution engine。

## Capability Mode vs Agent Runtime

| 方案 | 适用情况 | 成本 | Bio 建议 |
| --- | --- | --- | --- |
| Guid capability mode | 需要一等入口、不同 prompt/source/tool policy，但仍用现有 agent 执行 | 低 | P0 推荐 |
| preset assistant/profile | 需要默认 persona、prompt、skill bundle、MCP 偏好 | 低 | P0 推荐 |
| skill bundle/router | 需要领域 SOP、任务拆解、工具选择规则 | 低到中 | P0 推荐 |
| built-in MCP provider | 需要本地工具、数据库查询、artifact 操作 | 中 | P0 复用，P1 扩展 |
| extension bundle | 需要可安装/分发能力包 | 中 | P1/P2 |
| ACP adapter | 存在独立 Bio CLI/runtime | 高 | 暂不建议 |
| remote agent | 需要外部 Bio 服务/HPC/队列运行 | 高 | P2 |

结论：Bio 第一阶段应是 mode/profile/skill/MCP 组合，而不是新 agent runtime。

## MCP 管理与内置 MCP

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| MCP catalog | `packages/desktop/src/renderer/hooks/mcp/catalog.ts` | MCP 展示/分类信息 |
| MCP list hook | `packages/desktop/src/renderer/hooks/mcp/useMcpServers.ts` | MCP server 列表状态 |
| MCP CRUD hook | `packages/desktop/src/renderer/hooks/mcp/useMcpServerCRUD.ts` | MCP server 增删改 |
| MCP settings UI | `packages/desktop/src/renderer/pages/settings/ToolsSettings/McpManagement.tsx` | MCP 管理界面 |
| built-in MCP constants | `packages/desktop/src/process/resources/builtinMcp/constants.ts` | 内置 MCP 标识 |
| built-in servers | `packages/desktop/src/process/resources/builtinMcp/*.ts` | research/science/medical/lab/user-input 等 MCP 实现 |
| MCP build | `scripts/build-mcp-servers.js` | 编译内置 MCP |
| packaging inclusion | `packages/desktop/electron.vite.config.ts`, `packages/desktop/electron-builder.yml` | MCP 产物打包 |
| backend migration/bootstrap | `packages/desktop/src/process/utils/runBackendMigrations.ts`, `scripts/webui.ts` | 桌面/WebUI 内置 MCP 注册和启动资源 |

Bio P0 应明确：

- Bio mode 默认启用或推荐 `research_evidence` 与 `science_artifact`。
- Bio 默认 source profile 包括文献、蛋白/结构、组学、化学、变异/通路等域。
- MCP 的可用性要在 Electron dev、Electron packaged、WebUI 三个路径验证。

## Skills 与 Extension

| 能力 | 关键位置 | Bio 相关判断 |
| --- | --- | --- |
| Science skill router | `resources/skills/science/SKILL.md` | 当前 Science 主路由，Bio 可参考但不宜长期混在同一入口 |
| Science artifact skill | `resources/skills/science-artifact/SKILL.md` | artifact 创建/修改/publish SOP |
| database skill | `resources/skills/databases/SKILL.md` | 数据库检索 SOP，可扩展 Bio source |
| biomodels skill | `resources/skills/biomodels/SKILL.md` | 生物模型相关能力 |
| singlecell skill | `resources/skills/singlecell/SKILL.md` | 单细胞分析 SOP |
| compute skill | `resources/skills/compute/SKILL.md` | 计算资源与任务 SOP |
| skill manifest/materialize | `resources/skills/openscience-skill-pack.manifest.json`, `scripts/materialize-science-skills.mjs` | 打包/物化 skill pack |
| extension examples | `examples/hello-world-extension/`, `examples/e2e-full-extension/`, `examples/ext-feishu/` | 展示 contributed assistants、agents、ACP adapters、MCP servers、skills、themes、settings tabs |

Bio P0 推荐新增一个 first-party Bio router skill，例如 `resources/skills/bio/SKILL.md`，负责：

- 将任务按 molecular、genomics、single-cell、pathway、protein structure、chemical biology、clinical-adjacent evidence 分类。
- 指定 evidence/source 优先级和引用规则。
- 明确临床边界：不能替代诊疗建议，涉及患者/PHI 时必须走 medical/regulated workflow。
- 复用 `science-artifact` 输出可预览 artifact，而不是只生成文本。

新增 Bio router skill 时还要更新 skill manifest/materialization 路径和对应测试，避免只在源码树中存在但不进入产品 skill pack。

## Team 与 Channel

| 模块 | 文件 | 当前职责 | Bio 相关判断 |
| --- | --- | --- | --- |
| team types | `packages/desktop/src/common/types/team/teamTypes.ts` | team 数据结构 |
| team mapper | `packages/desktop/src/common/adapter/teamMapper.ts` | team DTO 映射 |
| team runtime | `packages/desktop/src/renderer/pages/conversation/hooks/useTeamConversationRuntime.ts` | team conversation runtime |
| team permission | `packages/desktop/src/renderer/pages/conversation/TeamPermissionContext.tsx` | 权限上下文 |
| channel types | `packages/desktop/src/common/types/channel/channel.ts` | channel assistant 配置 |
| channel modal | `packages/desktop/src/renderer/pages/settings/ChannelModalContent.tsx` | Lark/DingTalk/Weixin/WeCom 等 channel 配置 |
| Lark project agent | `packages/desktop/src/deepscientist_lark/project_agent/service.ts`, `teamClient.ts`, `promptDefaults.ts` | DeepScientist Lark 项目 agent |

Bio P0 不应依赖 team/channel。P2 如果要做实验室团队协作、远程 HPC 或 LIMS/ELN 集成，再评估 team/channel 作为运行层。

## Bio 形态建议

P0：

1. `bio` Guid capability mode。
2. Bio preset assistant/profile。
3. `resources/skills/bio/SKILL.md`。
4. 更新 skill manifest/materialization/test。
5. 默认 MCP/source profile：`research_evidence` + `science_artifact`。
6. Bio prompt 约束包括 organism/taxon、reference genome/assembly、assay/platform、sample/cohort、database version/access date、clinical boundary。

P1：

1. Extension bundle 分发 Bio assistant、skills、settings tab。
2. 增加 Bio source presets 和 MCP catalog 分组。
3. 补充结构、基因组、单细胞、alignment viewer。

P2：

1. 真正独立 Bio runtime/ACP adapter，仅在已有外部 CLI 或服务时做。
2. Remote agent/HPC 队列集成。
3. Team workflow 与权限策略。
