# Frontend UI Map

本文档定位 OpenBioScience 前端 UI 的主要模块，以及 Bio 升级时应改哪些位置、避免改哪些位置。

## 入口与布局

| 模块 | 文件 | 职责 | Bio 相关判断 |
| --- | --- | --- | --- |
| renderer boot | `packages/desktop/src/renderer/main.tsx` | 初始化 Sentry、browser bridge、config、i18n、theme、agent 预取、React root | 一般不需要为 Bio 修改，除非新增全局 provider |
| route | `packages/desktop/src/renderer/components/layout/Router.tsx` | `/guid`, `/conversation/:id`, `/settings/*`, cron/collaboration 等路由 | Bio P0 不需要新顶层 route；Settings 可增加 Bio 子页 |
| app layout | `packages/desktop/src/renderer/components/layout/Layout.tsx` | 主布局、Sider、导航容器 | Bio 作为 Guid mode 时不需要改整体 layout |
| sider | `packages/desktop/src/renderer/components/layout/Sider/index.tsx` | 侧栏导航 | 只有 Bio 成为独立一级产品入口时才改 |

## Guid 模式入口

| 模块 | 文件 | 当前职责 | Bio P0 切入点 |
| --- | --- | --- | --- |
| Guid page | `packages/desktop/src/renderer/pages/guid/GuidPage.tsx` | 模式选择、输入区、agent/assistant 选择、发送入口 | 增加 Bio capability mode 的 UI 展示 |
| mode capability | `packages/desktop/src/renderer/pages/guid/utils/modeCapabilities.ts` | 定义 `standard`、`science`、`medical_evidence`、`skill_deposition` 等模式能力 | 新增 `bio` mode；若 core 不接受/持久化新 mode，则 fallback 为 `science` mode + `bio` profile metadata |
| send flow | `packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts` | 根据 mode 构造 conversation 参数、system prompt、extra metadata | Bio P0 的核心修改点：注入 Bio prompt/profile/skills/MCP 约束 |
| action row | `packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx` | 输入区动作和模式相关控件 | 需要确认 Bio 模式是否有专属 source/profile 控件 |
| agent selection | `packages/desktop/src/renderer/pages/guid/hooks/useGuidAgentSelection.ts` | agent 选择与过滤 | Bio P0 不需要新 agent runtime；只需复用现有可用 agent |

建议：Bio 先作为 `Guid capability mode`，不要新建完整页面。这样可以复用已有 conversation 创建、agent picker、assistant resolver 和 realtime event 机制。

## Conversation 与消息展示

| 模块 | 文件 | 当前职责 | Bio 相关判断 |
| --- | --- | --- | --- |
| conversation page | `packages/desktop/src/renderer/pages/conversation/index.tsx` | 会话页面总入口 | 不应为 Bio 新建 parallel page |
| chat conversation | `packages/desktop/src/renderer/pages/conversation/components/ChatConversation.tsx` | 消息列表、输入、runtime 状态 | Bio 应通过 conversation metadata/extra 控制展示 |
| chat layout | `packages/desktop/src/renderer/pages/conversation/components/ChatLayout/index.tsx` | 消息区与 preview/workspace 布局 | 复用现有 science preview/workspace |
| ACP chat | `packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpChat.tsx` | ACP agent conversation UI | 只有接入真实 Bio ACP CLI 时才改 |
| sendbox | `packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx` | ACP 输入框 | Bio P0 不应依赖专用 ACP sendbox |
| messages | `packages/desktop/src/renderer/pages/conversation/Messages/MessageList.tsx` | 消息渲染、面板提取 | 如果 Bio 复用 science panel，尽量避免复制新 Bio panel |
| science panel | `packages/desktop/src/renderer/pages/conversation/Messages/ScienceReportPanel.tsx` | Science panel 展示 | Bio P0 可复用；P1 再评估是否需要 Bio label/profile 变体 |
| medical panel | `packages/desktop/src/renderer/pages/conversation/Messages/MedicalEvidencePanel.tsx` | 临床/医学证据展示 | 不建议让 Bio 泛化覆盖该面板 |
| lab skill panel | `packages/desktop/src/renderer/pages/conversation/Messages/LabSkillDepositionPanel.tsx` | 实验技能沉淀展示 | Bio SOP 可以通过 skill bundle 复用，但不是 Bio 主 UI |

关键点：Bio 不应以复制 `ScienceReportPanel` 的方式起步。更稳妥的是扩展 Science artifact/panel 的 domain metadata，例如 organism、assembly、assay、database version、access date、clinical boundary。

## Preview 与文件/Artifact 展示

| 模块 | 文件 | 当前职责 | Bio 升级方向 |
| --- | --- | --- | --- |
| preview context | `packages/desktop/src/renderer/pages/conversation/Preview/context/PreviewContext.tsx` | 管理 preview 类型和打开状态 | 不要硬编码 Bio 特例；通过 artifact type/viewer kind 路由 |
| preview panel | `packages/desktop/src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel.tsx` | 统一 preview 容器 | Bio viewer 新增后接入此层 |
| file utils | `packages/desktop/src/renderer/pages/conversation/Preview/fileUtils.ts` | 文件类型识别与 preview type | P1 增加 genomics/alignment 常见格式映射 |
| science workspace | `packages/desktop/src/renderer/pages/conversation/Preview/ScienceArtifactWorkspace/ScienceArtifactWorkspace.tsx` | Science artifact 工作区 | Bio artifact 复用第一选择 |
| science files view | `packages/desktop/src/renderer/pages/conversation/Preview/ScienceFilesView.tsx` | Science 文件列表/预览 | 增加 Bio 文件类型图标和 viewer 映射 |
| molecular viewer | `packages/desktop/src/renderer/pages/conversation/Preview/viewers/MolecularStructureViewer.tsx` | 分子/结构展示 | P1 补强 Mol*/RCSB/AlphaFold 类结构查看 |
| ketcher viewer | `packages/desktop/src/renderer/pages/conversation/Preview/viewers/KetcherViewer.tsx` | 化学结构编辑/查看占位 | P1 做真实编辑和 artifact version 保存 |

`common/chat/science.ts` 已声明 `protein_structure`、`genome_track`、`alignment`、`molecule` 等 artifact 类型，以及 `igv`、`vitessce`、`msa`、`molstar` 等 viewer kind。Bio 前端优先补这些已声明但 UI 不完整的 viewer，而不是新增平行 contract。

## Settings

| 模块 | 文件 | 当前职责 | Bio 相关判断 |
| --- | --- | --- | --- |
| settings shell | `packages/desktop/src/renderer/pages/settings/SettingsPageWrapper.tsx` | Settings 页面容器 | 可挂 Bio settings |
| settings sider | `packages/desktop/src/renderer/pages/settings/SettingsSider.tsx` | Settings 导航 | Bio 设为一等配置时增加条目 |
| science settings | `packages/desktop/src/renderer/pages/settings/ScienceSettings.tsx` | Science/research evidence/bio tools 相关配置 | 当前 Bio 工具配置主要在这里；P0 可先扩展 profile |
| medical settings | `packages/desktop/src/renderer/pages/settings/MedicalEvidenceSettings.tsx` | 医学证据配置 | 保持临床边界，不与 Bio 混合 |
| skills settings | `packages/desktop/src/renderer/pages/settings/SkillsSettings.tsx` | skill 管理 | Bio skill bundle/tag 展示入口 |
| capabilities settings | `packages/desktop/src/renderer/pages/settings/CapabilitiesSettings.tsx` | capability 配置 | Bio mode 开关可放这里或 Science settings |
| compute settings | `packages/desktop/src/renderer/pages/settings/ComputeSettings.tsx` | compute hosts/HPC 配置 | P2 远程 Bio 计算资源可复用 |

当前已有 Bio tools 配置字段包括 `bioToolsEnabled`、`bioToolsPythonPath`、`bioToolsServerRoot`、`bioToolsDefaultDomains`，默认方向覆盖 PubMed、ChEMBL、omics、structures。后续应明确这些是 Bio profile 的默认 source preset，还是 Science settings 的一部分。

## 前端 P0 改动建议

1. 新增 `common/chat/bio.ts` 或同等 contract，定义 `BIO_MODE_ID`、Bio prompt builder、Bio conversation extra 类型。
2. 在 `modeCapabilities.ts` 增加 Bio capability mode。
3. 在 `useGuidSend.ts` 根据 Bio mode 注入 prompt、skill bundle、MCP/source defaults。
4. UI 复用 `ScienceReportPanel` 和 `ScienceArtifactWorkspace`，只在 label/profile 层区分 Bio。
5. i18n 增加所有语言 key；UI 控件继续使用 Arco/IconPark/Uno tokens。

## 避免事项

- 不要在 renderer 里直接 `fetch('/api/...')` 绕过 `ipcBridge`。
- 不要复制 Science panel 形成两个长期分叉。
- 不要把 Medical Evidence 的临床证据语义并入泛 Bio。
- 不要用 WebHost 静态 server 承载 Bio 业务逻辑。
- 不要在 preview context 里硬编码每个 Bio 文件格式；应通过 artifact type 和 viewer kind 扩展。
