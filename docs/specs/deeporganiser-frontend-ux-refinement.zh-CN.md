# DeepOrganiser 前端 UI/UX 收敛改造方案

本文档用于承接一次有约束的前端体验改造，不是泛泛的视觉建议。目标是把当前已经做出的图标、主题、Agent 状态、SendBox、设置页和文案，收束成一套更统一、更安静、更可解释的 DeepScientist 前端语言。

参考原则来自 Vercel Geist 设计文档：

- https://vercel.com/design.md#geist
- https://vercel.com/design.dark.md#geist

本文重点覆盖四个用户明确关心的区域：

1. 设置页减少“大圆角卡片套卡片”
2. Agent 运行状态区合并成“活动时间线”体系
3. SendBox 作为最高价值输入区域的体验优化
4. 文案语气进行系统清理

## 总判断

当前 DeepOrganiser 的问题不是单个组件不好看，而是多个局部视觉系统同时存在：

- 设置页使用大块 `bg-2 rd-16px` 作为分区容器。
- Agent 运行状态有 `AgentSteps`、`MessageToolGroupSummary`、`MessageToolGroup` 三套相近但不完全一致的展示。
- SendBox 内部承担输入、文件引用、语音、命令、导出、回复、预览插入、运行停止等多种职责，但缺少一个清楚的状态分层。
- 文案中混合了 “successfully / Please / Loading...” 这类泛化提示，以及部分中文“成功/请稍候”的直译语气。

改造方向不是继续加装饰，而是建立一条统一的体验合同：

- 容器少一点，信息层级准一点。
- 动效少一点，状态解释强一点。
- 图标更有辨识度，但语义由统一状态模型驱动。
- 文案短、具体、可行动，避免泛泛的“成功”“失败”。

## 共同设计合同

四个区域应共享同一套基础规则。

### 1. 层级

页面只保留三层主要表面：

- App base：主背景。
- Section：无边框或轻边框分区，用 spacing 表达分组。
- Control / Row：真正可点击、可编辑、可选择的控件。

避免：

- 大卡片里再套大卡片。
- 每个 section 都加重背景、圆角和阴影。
- 用装饰性背景替代真实信息层级。

### 2. 状态

所有运行状态都应归入同一组语义：

| 状态      | 含义             | 视觉策略                      |
| --------- | ---------------- | ----------------------------- |
| pending   | 已排队，尚未开始 | Time icon + 次级文字          |
| running   | 正在发生         | Loading icon + 当前动作动词   |
| completed | 已完成           | CheckOne icon + 过去式动作    |
| error     | 失败且需要注意   | Error icon + 失败原因或下一步 |
| canceled  | 用户/系统中止    | CloseOne icon + 中止说明      |

颜色不能是唯一状态提示；图标、文本和布局位置必须共同表达状态。

### 3. 动效

动效只用于解释状态变化：

- loading 可以旋转。
- 展开/收起可以 150-220ms。
- 面板出现可以 150-200ms。
- 停止按钮、运行摘要、文字不应持续呼吸或闪烁。

需要全局遵守 `prefers-reduced-motion`。

### 4. 文案

文案以“发生了什么 + 用户下一步能做什么”为标准。

避免：

- `Saved successfully`
- `Deleted successfully`
- `Please wait...`
- `Processing...`
- `响应已成功发送`

优先：

- `Saved`
- `Deleted`
- `Saving...`
- `Checking files...`
- `Message sent`
- `无法保存设置，检查写入权限后重试`

中文界面应避免机械直译，倾向短促、明确、工作台语气。

## 重点一：设置页减少“大圆角卡片套卡片”

### 当前实现

主要文件：

- `packages/desktop/src/renderer/components/settings/SettingsModal/contents/AppearanceModalContent.tsx`
- `packages/desktop/src/renderer/pages/settings/AppearanceSettings/CssThemeSettings.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsModal/index.tsx`
- `packages/desktop/src/renderer/pages/settings/components/SettingsPageWrapper.tsx`

当前 `AppearanceModalContent` 里有三块类似结构：

- 主题画廊
- 字体大小
- 缩放控制

这些分区都使用类似：

```tsx
<div className='px-16px md:px-24px lg:px-28px py-14px md:py-16px bg-2 rd-16px'>
```

问题是：设置页本身已经在 modal/page 容器里，再给每个 section 一个大圆角灰底，会让视觉变成“卡片堆卡片”。这会削弱主题卡、字体设置和缩放控制之间的真实层级。

### 目标体验

设置页应该像一个清爽的控制台：

- 左侧导航明确。
- 右侧内容像文档化的配置面板。
- 每个 section 有标题、可选说明、控件区。
- section 之间通过间距和细分隔线区分，而不是厚背景块。
- 主题卡本身可以有视觉重点，但外层不要再抢戏。

### 改造逻辑

#### 1. 抽象 `SettingsSection`

新增一个轻量 section 组件，建议位置：

- `packages/desktop/src/renderer/components/settings/SettingsSection.tsx`

合同：

```ts
type SettingsSectionProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  dense?: boolean;
};
```

视觉策略：

- 不默认使用大背景卡。
- 标题 `14px/22px` 或 `15px/24px`，字重 500。
- 描述 `12px/18px` 或 `13px/20px`，使用 secondary text。
- section 间距：`24px`，较大页面模式可为 `32px`。
- section 内部标题到内容：`12px`。
- 如果需要分割，使用 `border-top: 1px solid var(--border-subtle)`，不要整块填色。

#### 2. 改写 Appearance 内容结构

当前：

```tsx
<div className='space-y-16px'>
  <div className='... bg-2 rd-16px'>主题</div>
  <div className='... bg-2 rd-16px'>字体</div>
  <div className='... bg-2 rd-16px'>缩放</div>
</div>
```

建议：

```tsx
<div className='settings-appearance'>
  <SettingsSection title={t('settings.theme')} description={...}>
    <CssThemeSettings />
  </SettingsSection>

  <SettingsSection title={t('settings.fontSize')}>
    <SettingsRows>
      ...
    </SettingsRows>
  </SettingsSection>

  <SettingsSection title={t('settings.scale')}>
    <SettingsRows>
      ...
    </SettingsRows>
  </SettingsSection>
</div>
```

其中 `SettingsRows` 可以是一个简单容器：

- 行高稳定。
- 行之间用分隔线。
- 移动端纵向堆叠。
- 桌面端 label 左、control 右。

#### 3. 主题卡使用 radio group 语义

`CssThemeSettings.tsx` 里主题卡目前是 `div onClick`。建议改为：

- 外层 `role="radiogroup"`，带 aria-label。
- 每张卡用 `button` 或 `role="radio"`。
- 支持 Enter / Space 选择。
- 当前选中态用边框、CheckOne、`aria-checked` 同步表达。

主题卡视觉：

- 继续保持 16:9。
- 卡片本身可 `radius 10-12px`。
- 选中态使用细边框 + 右上角 check。
- 底部名称建议从图片遮罩里移出，改成卡片下方小 label，避免遮住 AI 生成主题图。
- 如果必须放在图上，遮罩高度控制在 24-28px，不超过图片高度的 25%。

#### 4. Modal 高度不要固定得太死

`SettingsModal/index.tsx` 当前桌面高度常量为 `459`。设置内容变多时会显得被压扁。建议：

- `height: min(70vh, 640px)` 或 `clamp(480px, 70vh, 680px)`。
- Appearance 页在 modal 内滚动，但 page 模式不应该强制重复滚动。
- 侧栏和内容区使用同一高度合同。

### 视觉验收标准

- Appearance 页面首屏看起来是一个设置表单，而不是三个大卡片。
- 主题三卡都是 16:9，任何 viewport 下比例不变。
- 选中主题不用只靠颜色，键盘也能选择。
- 字体大小和缩放行在 desktop/mobile 都不挤压、不跳动。
- dark mode 下 section 分割线可见但不显脏。

### 建议迁移顺序

1. 新增 `SettingsSection` 和 `SettingsRows`。
2. 改 `AppearanceModalContent` 的结构，去掉三块 `bg-2 rd-16px`。
3. 改 `CssThemeSettings` 的可访问语义和 label 布局。
4. 微调 `SettingsModal` 高度和内容 padding。
5. 补 DOM 测试：主题卡数量、选中态、键盘选择、16:9 样式。

## 重点二：Agent 运行状态合并为“活动时间线”

### 当前实现

主要文件：

- `packages/desktop/src/common/chat/agentStep.ts`
- `packages/desktop/src/common/chat/normalizeToolCall.ts`
- `packages/desktop/src/renderer/pages/conversation/Messages/agent-steps/AgentSteps.tsx`
- `packages/desktop/src/renderer/pages/conversation/Messages/agent-steps/AgentSteps.css`
- `packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroupSummary.tsx`
- `packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroupSummary.css`
- `packages/desktop/src/renderer/components/icons/AgentStatusIcon.tsx`

当前已经有两个很好的基础：

- `agentStep.ts` 开始建立标准化 Agent step model。
- `AgentStatusIcon.tsx` 已经收敛了一批运行状态图标，并且包含 light/dark 版本。

但 UI 层仍有多个重复体系：

- `AgentSteps` 自己做 summary、duration、expand、body。
- `MessageToolGroupSummary` 自己做 tool normalize、header、body、detail。
- `MessageToolGroup` 还保留较原始的 tool 展开内容。
- CSS 中存在硬编码状态色、`aou-*` 状态色、shimmer、running sweep 等局部风格。

### 目标体验

Agent 运行状态应该像一条可检查的活动时间线：

- 最上方只显示一条摘要：当前在做什么，运行了多久。
- 展开后按真实顺序显示活动。
- 每个活动都有统一的 icon、标题、secondary metadata、状态。
- 文件、命令、网页、图片、MCP、todo 都是同一个 row 体系下的不同类型。
- 详情可展开，但不会把主要聊天流变成大块日志。

### 统一活动模型

建议建立一个 UI-facing model，命名为 `AgentActivityItem`。

建议位置：

- `packages/desktop/src/common/chat/agentActivity.ts`

类型草案：

```ts
export type AgentActivityKind =
  | 'loading'
  | 'todo'
  | 'file_edit'
  | 'file_write'
  | 'file_read'
  | 'file_search'
  | 'web_search'
  | 'web_fetch'
  | 'command'
  | 'test'
  | 'build'
  | 'mcp'
  | 'image'
  | 'generic';

export type AgentActivityStatus = 'pending' | 'running' | 'completed' | 'error' | 'canceled';

export interface AgentActivityItem {
  id: string;
  kind: AgentActivityKind;
  status: AgentActivityStatus;
  title: string;
  subtitle?: string;
  meta?: string;
  startedAt?: number;
  endedAt?: number;
  input?: string;
  output?: string;
  path?: string;
  command?: string;
  url?: string;
  imagePath?: string;
  children?: AgentActivityItem[];
  raw?: unknown;
}
```

这不是要丢弃 `AgentStep`，而是让 `AgentStep` 和 `NormalizedToolCall` 都能投影到同一个 UI model。

### 图标语义映射

沿用已生成的 `AgentStatusIcon`，但把映射放在一个集中函数里，避免每个组件自己猜。

| 活动               | 图标                        | 文案倾向                        |
| ------------------ | --------------------------- | ------------------------------- |
| 输入框上方运行状态 | `loading`                   | `正在处理` / `Working`          |
| todo/plan 当前任务 | `listCheckbox`              | `正在执行计划`                  |
| 已完成 todo        | `checkOne`                  | item 左侧                       |
| 当前 todo          | `loading`                   | item 左侧，小尺寸               |
| 待处理 todo        | `time`                      | item 左侧                       |
| 编辑文件           | `fileEditing`               | `编辑 file.ts`                  |
| 创建/写入文件      | `write`                     | `创建 file.ts` / `写入 file.ts` |
| 读取文件           | `fileText`                  | `读取 file.ts`                  |
| 搜索代码/文件      | `fileSearch`                | `搜索 "query"`                  |
| Web 搜索           | `globe`                     | `搜索网页`                      |
| 打开/抓取网页      | `webPage`                   | `获取 example.com`              |
| 执行命令           | `terminal`                  | `运行 pnpm test`                |
| 命令/快捷动作      | `command`                   | 备用                            |
| 测试/构建进行中    | `loading` + kind test/build | `正在运行测试`                  |
| 成功完成           | `checkOne`                  | 完成态                          |
| 失败/错误          | `error`                     | 错误态                          |
| 取消/中止          | `closeOne`                  | 中止态                          |
| MCP/外部工具       | `tool`                      | `调用 MCP 工具`                 |
| 生成图片           | `imageFiles`                | `生成图片`                      |

### 组件拆分

建议新增：

- `AgentActivitySummary.tsx`
- `AgentActivityTimeline.tsx`
- `AgentActivityRow.tsx`
- `AgentActivityDetails.tsx`
- `AgentActivityIcon.tsx`

建议位置：

- `packages/desktop/src/renderer/pages/conversation/Messages/agent-activity/`

组件合同：

```tsx
<AgentActivitySummary
  items={items}
  liveRunning={liveRunning}
  collapsed={collapsed}
  onToggle={...}
/>

<AgentActivityTimeline
  items={items}
  liveRunning={liveRunning}
/>
```

### Summary 行规则

摘要行应回答三件事：

1. 当前主要动作是什么？
2. 是否仍在运行？
3. 已处理多久或完成了多少？

例子：

- `正在编辑 2 个文件 · 1m 12s`
- `已运行测试 · 42s`
- `命令失败 · pnpm test`
- `已完成 3/5 个任务，正在检查构建`

不要：

- `View Steps`
- `Working`
- 只显示 loading icon，没有说明

### Timeline 行规则

每行建议结构：

```text
[icon] title                            [status/meta]
       subtitle / path / command summary
       details when expanded
```

视觉：

- 行高紧凑，默认不加大卡片。
- 详情才用轻量 code panel。
- timeline 左侧可用 1px 纵线，但不要每行都包卡片。
- 当前 running 行可以有很轻的背景，不使用扫光。

### Todo/Plan 表达

Todo 不应只是普通工具调用，它是 Agent 当前意图的最强信号。

建议：

- 摘要优先展示当前 `in_progress` item。
- 展开后显示 checklist。
- 每个 item 左侧用 `checkOne/loading/time`。
- 已完成 item 降低文字权重，不隐藏。
- 当前 item 不用 shimmer，用 icon spin + 字重即可。

### 详情展开规则

默认折叠：

- 大段 input/output
- 命令 stdout/stderr
- web fetch 正文
- MCP 原始 JSON

默认显示：

- 文件名
- 命令第一行
- URL host
- 搜索 query
- 结果数量或修改数量

点击 row 或 chevron 展开详情。交互元素必须是 button，不使用裸 `span onClick`。

### 迁移策略

不要一次性删除旧组件。建议分三步：

1. 建 `agentActivity.ts`，让 `normalizeAgentSteps()` 和 `normalizeToolMessages()` 都能转成 `AgentActivityItem[]`。
2. 新建 `AgentActivity*` 组件，在 `MessageList.tsx` 中替代 `AgentSteps` 的显示入口。
3. 让 `MessageToolGroupSummary` 内部复用 `AgentActivityTimeline`，再逐步删除重复 CSS。

### CSS 策略

删除或降低以下视觉：

- `agent-step-title--shimmer`
- `agent-step-running-sweep`
- `@keyframes breathing`
- hardcoded `#15803d / #b91c1c / #d97706`
- `var(--aou-*)` 作为状态色

改为 token：

- `--status-success`
- `--status-warning`
- `--status-danger`
- `--status-info`
- `--surface-hover`
- `--surface-active`
- `--focus-ring`

### 验收标准

- 同一个工具调用在 compact summary 和 expanded detail 中图标一致。
- running/completed/error/canceled 的视觉合同一致。
- Todo、文件、命令、web、MCP、图片都能在同一 timeline 展示。
- 没有持续 shimmer 或 sweep。
- 键盘可展开/收起。
- 单元测试覆盖：
  - `AgentStep -> AgentActivityItem`
  - `NormalizedToolCall -> AgentActivityItem`
  - icon mapping
  - summary 文案
  - error/canceled 状态

## 重点三：SendBox 作为最高价值 UX 区域

### 当前实现

主要文件：

- `packages/desktop/src/renderer/components/chat/SendBox/index.tsx`
- `packages/desktop/src/renderer/components/chat/SendBox/sendbox.css`
- `packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx`
- `packages/desktop/src/renderer/pages/conversation/platforms/codex/CodexSendBox.tsx`
- `packages/desktop/src/renderer/components/chat/SlashCommandMenu.tsx`
- `packages/desktop/src/renderer/components/chat/SpeechInputButton.tsx`
- `packages/desktop/src/renderer/hooks/chat/useSendBoxDraft.ts`
- `packages/desktop/src/renderer/hooks/chat/useSendBoxFiles.ts`

SendBox 现在已经承载很多真实能力：

- 普通输入
- 单行/多行自适应
- slash command
- `@` 文件引用
- 文件拖拽上传
- 语音输入
- 回复引用
- DOM snippet
- preview panel 添加到聊天
- 导出对话
- loading 时停止
- mobile compact action sheet

问题不是功能少，而是这些能力没有被清楚分层。用户看到的是一个输入框，但它其实是一个运行控制台。

### 目标体验

SendBox 应该表达三件事：

1. 我现在能输入什么？
2. 当前会以什么模式发送？
3. Agent 是否正在运行，我可以做什么？

视觉上应像一个安静但可靠的 command surface：

- idle 时轻、安静。
- focus 时边框和 shadow 明确。
- running 时上方或右侧出现状态，不靠呼吸动画。
- command/file/voice 等能力有稳定位置。
- mobile 下仍然保持主要动作清晰。

### 建议结构

把 SendBox 视觉拆成四层：

```text
SendBoxPanel
  ContextStrip      可选：回复、DOM snippet、已选文件、运行状态
  TextInputLayer    输入与高亮 overlay
  CommandOverlay    slash、@file、export filename 等浮层
  ActionBar         左侧工具、右侧语音/模型/发送/停止
```

对应组件可逐步拆出：

- `SendBoxPanel.tsx`
- `SendBoxContextStrip.tsx`
- `SendBoxInputLayer.tsx`
- `SendBoxActionBar.tsx`
- `SendBoxRunStatus.tsx`

不要一次性大拆所有逻辑；先拆视觉层和 props，内部状态仍可留在 `SendBox/index.tsx`。

### 运行状态表达

当前停止按钮使用 `sendbox-stop-breathe` 持续呼吸。建议改成：

- 发送按钮位置变为 stop button。
- stop button 本身静态，使用 clear affordance：方形 stop icon + tooltip。
- panel 顶部或 action bar 左侧出现 `Agent is running` / `正在处理` 小状态。
- 状态左侧使用 `AgentStatusIcon name="loading" spin`。
- 如果有当前 activity summary，则展示 `正在运行测试`、`正在编辑文件` 等，而不是泛化 `Processing...`。

例：

```text
[loading] 正在运行测试 · 38s              [Stop]
```

### 输入提示策略

当前 placeholder 拼接：

```tsx
placeholder ? `${placeholder}  ${bottomHint ?? ...}` : ...
```

建议：

- placeholder 只说主输入意图。
- 快捷能力提示放到 action bar 或 tooltip，不塞进一条长 placeholder。
- idle placeholder：
  - 中文：`输入任务，或用 / 选择命令`
  - 英文：`Ask or type / for commands`
- 文件提示在用户输入 `@` 后通过菜单解释，不长期占 placeholder。

### 工具区和动作区

ActionBar 建议固定语义：

左侧：

- 添加文件 / 加号
- mode/model/permission 相关入口
- workspace 引用入口

右侧：

- 语音
- 发送 / 停止

运行时：

- 左侧状态条展示当前 activity。
- 右侧只保留 stop。
- 不要让多个小按钮同时争夺注意力。

### 文件引用与已选项

当前有两类 chip：

- DOM snippet tags
- unmatched selected workspace items

建议统一为 `SendBoxContextChip`：

- icon + label + close。
- 文件 chip 显示 basename，tooltip 显示路径。
- DOM snippet chip 显示 tag。
- chip 高度固定 24px。
- 多行时 wrap；单行时可 horizontal scroll。

### 导出和 slash overlay

当前 export filename panel 在 SendBox 内以一个小 rounded panel 出现。建议 overlay 统一走 `CommandOverlay`：

- 标题
- 可选 hint
- list 或 form
- footer actions

视觉和 SlashCommandMenu、AtFileMenu 保持一致：

- radius 12px。
- shadow 使用 overlay token。
- border 使用 subtle border。
- 不用强 glass blur，除非全局 overlay 体系也采用它。

### 语音状态

语音 waveform 可以保留，但需要：

- reduced motion 降级为静态状态。
- processing 不持续抢注意力。
- label 更具体：`Listening`、`Transcribing`、`No speech detected`。
- 错误态提示下一步：`Microphone unavailable. Check system permission.`

### CSS 清理

`sendbox.css` 需要避免：

- 全局 `::placeholder`。
- hardcoded `#d3d4d9`、`#a1a2aa`。
- stop button breathing。
- focus-visible 被清成透明。
- 用 drop-shadow 加粗 icon。

建议增加 SendBox 级 token：

```css
.sendbox-panel {
  --sendbox-radius: 16px;
  --sendbox-border: var(--border-base);
  --sendbox-border-focus: var(--focus-ring-primary);
  --sendbox-surface: var(--dialog-fill-0);
  --sendbox-chip-bg: var(--surface-muted);
}
```

### 交互验收标准

- 空输入、输入中、focus、dragging、uploading、loading、disabled、mobile compact 都有明确状态。
- running 时用户能一眼找到 stop。
- 不再依赖持续呼吸动画提醒运行。
- `/` 菜单、`@` 文件菜单、导出表单视觉一致。
- keyboard：
  - Enter 发送
  - Shift+Enter 换行
  - Escape 关闭 overlay
  - Arrow keys 操作菜单
  - Tab 不困住焦点
- mobile 下不自动弹键盘，且主要操作不被隐藏。

### 建议迁移顺序

1. 添加 `SendBoxRunStatus`，先接入当前 loading/onStop。
2. 停止按钮去掉 breathing，改静态 running 状态 + clear stop affordance。
3. 抽 `SendBoxContextChip`，统一 reply、DOM snippet、workspace item 的视觉。
4. 清理 placeholder 和 focus-visible。
5. 把 export、slash、at-file overlay 的样式统一。
6. 最后再考虑拆大组件内部逻辑。

## 重点四：文案语气系统清理

### 当前实现

主要文件：

- `packages/desktop/src/renderer/services/i18n/locales/en-US/common.json`
- `packages/desktop/src/renderer/services/i18n/locales/en-US/messages.json`
- `packages/desktop/src/renderer/services/i18n/locales/en-US/settings.json`
- `packages/desktop/src/renderer/services/i18n/locales/en-US/conversation.json`
- `packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json`
- `packages/desktop/src/renderer/services/i18n/locales/zh-CN/messages.json`
- `packages/desktop/src/renderer/services/i18n/locales/zh-CN/settings.json`
- 其他 locale 后续同步

当前可见问题：

- `Saved successfully`
- `Deleted successfully`
- `Created successfully`
- `Copied successfully`
- `Please wait...`
- `Processing...`
- 中文里的 `保存成功`、`删除成功`、`处理中...`、`响应已成功发送`
- 部分错误只说失败，没有下一步。

### 文案原则

#### 1. Toast 不说 successfully

Toast 本身已经表达动作结果，不需要再说 successfully。

| 当前                        | 建议           |
| --------------------------- | -------------- |
| `Saved successfully`        | `Saved`        |
| `Deleted successfully`      | `Deleted`      |
| `Copied successfully`       | `Copied`       |
| `Task created successfully` | `Task created` |
| `保存成功`                  | `已保存`       |
| `删除成功`                  | `已删除`       |
| `复制成功`                  | `已复制`       |

#### 2. Loading 要说正在做什么

| 当前             | 建议                                       |
| ---------------- | ------------------------------------------ |
| `Please wait...` | `Loading...` 或具体 `Checking settings...` |
| `Processing...`  | `Working...` 或具体 `Running command...`   |
| `请稍候...`      | `加载中...` 或具体 `正在检查设置...`       |
| `处理中...`      | `正在处理...` 或具体动作                   |

#### 3. 错误要给下一步

错误格式：

```text
{what happened}. {what to do next}.
```

中文：

```text
{发生了什么}。{下一步建议}。
```

例：

- `Failed to save` -> `Could not save settings. Check file permissions and try again.`
- `复制失败` -> `无法复制到剪贴板。检查系统权限后重试。`

#### 4. 操作按钮用动词 + 名词

按钮尽量明确对象：

- `Save`
- `Copy path`
- `Open folder`
- `Run command`
- `Stop run`

中文：

- `保存`
- `复制路径`
- `打开所在文件夹`
- `运行命令`
- `停止运行`

#### 5. 省略号统一

代码里现在有大量 `...`。建议 UI 文案统一为 Unicode ellipsis `…`，但要分阶段改，避免 locale 测试大量快照变化。

英文：

- `Loading…`
- `Saving…`

中文：

- `加载中…`
- `保存中…`

### 文案分类清理

#### common

目标：基础动作短词、全局 toast 简洁。

建议：

```json
{
  "loading": "Loading…",
  "saveSuccess": "Saved",
  "deleteSuccess": "Deleted",
  "createSuccess": "Created",
  "processing": "Working…"
}
```

中文：

```json
{
  "loading": "加载中…",
  "saveSuccess": "已保存",
  "deleteSuccess": "已删除",
  "createSuccess": "已创建",
  "processing": "正在处理…"
}
```

#### messages

重点清理：

- copy
- export
- agent steps
- permission request
- send state

建议：

| Key                        | 英文建议         | 中文建议        |
| -------------------------- | ---------------- | --------------- |
| `copySuccess`              | `Copied`         | `已复制`        |
| `downloadSuccess`          | `Downloaded`     | `已下载`        |
| `responseSentSuccessfully` | `Message sent`   | `消息已发送`    |
| `processing`               | `Working…`       | `正在处理…`     |
| `atFile.loading`           | `Loading files…` | `正在加载文件…` |

#### agentSteps

Agent 状态文案要跟 activity model 同步。

建议：

- running 用现在进行时：`Running tests` / `正在运行测试`
- completed 用过去式：`Ran tests` / `已运行测试`
- error 用明确失败：`Tests failed` / `测试失败`
- canceled 用中止：`Run canceled` / `运行已中止`

#### settings

设置页文案需要更像配置面板：

- section title 短。
- description 解释“这个设置影响什么”，不要写使用教程。
- toast 短。
- 错误可行动。

例：

- `Theme applied` / `已应用主题`
- `Could not apply theme. Try again or restart the app.` / `无法应用主题。重试或重启应用。`

### 自动化检查建议

新增一个轻量 lint 脚本，后续可选。

建议位置：

- `scripts/check-ui-copy.ts`

检查规则：

- en-US 不允许 `successfully`
- en-US 不允许 `Please wait`
- UI loading 文案优先使用 `…`
- zh-CN 尽量不出现 `成功`，除非是状态名而不是 toast
- 禁止 fallback 文案里写过长句

先以 warning 运行，不阻塞 CI。完成第一轮清理后再改为 fail。

### 迁移顺序

1. 先清理 en-US 和 zh-CN。
2. 保持 key 不变，只改 value，降低代码改动面。
3. Agent Activity 改造时同步新增/调整 agentSteps 文案。
4. 再用脚本查其他 locale 的明显英文 fallback。
5. 如果有自动翻译流程，再批量同步其他语言。

### 验收标准

- 常见成功 toast 不出现 `successfully` 或 `成功`。
- loading 文案不是泛泛 `Please wait...`。
- 错误至少 60% 以上有下一步建议；高频错误必须 100%。
- Agent 状态文案能区分 running/completed/error/canceled。
- 中英文语气都短、明确、像产品而不是翻译腔。

## 跨模块 token 与 CSS 基础工作

四个重点区域都依赖基础 token。建议在视觉改造前先补一层 semantic token，不必马上重构所有主题。

建议新增或扩充：

- `--surface-base`
- `--surface-subtle`
- `--surface-hover`
- `--surface-active`
- `--border-subtle`
- `--border-strong`
- `--text-primary`
- `--text-secondary`
- `--text-tertiary`
- `--focus-ring`
- `--radius-control`
- `--radius-panel`
- `--shadow-popover`
- `--motion-fast`
- `--motion-normal`
- `--status-success`
- `--status-warning`
- `--status-danger`
- `--status-info`

当前已有 `docs/theming/tokens.md`，可以把这次方案落地后的 token 更新同步写回那里。

## 建议 PR 切分

### PR 1：设置页结构收敛

范围：

- `AppearanceModalContent.tsx`
- `CssThemeSettings.tsx`
- settings section/row 新组件
- settings 相关测试

验收：

- 外观页不再是三块大圆角背景卡。
- 主题卡保留 16:9。
- 键盘可选择主题。

### PR 2：Agent Activity model

范围：

- `agentActivity.ts`
- `AgentActivityIcon`
- model mapping tests

验收：

- 旧 `AgentStep` 和 `NormalizedToolCall` 都能转成统一 `AgentActivityItem`。
- 图标映射集中。

### PR 3：Agent Activity UI

范围：

- 新 `agent-activity/` 组件
- 替换 `AgentSteps` / `MessageToolGroupSummary` 的展示入口
- CSS 去 shimmer/sweep

验收：

- summary 和展开详情一致。
- 所有状态可键盘操作。
- running 状态不持续闪烁。

### PR 4：SendBox 状态和视觉重排

范围：

- `SendBox/index.tsx`
- `sendbox.css`
- `SpeechInputButton`
- overlay/chip 相关小组件

验收：

- running 状态清楚。
- stop 可见但不呼吸。
- placeholder 简短。
- chips 和 overlay 统一。

### PR 5：文案清理

范围：

- `en-US/*.json`
- `zh-CN/*.json`
- 可选 copy lint 脚本

验收：

- 高频 toast 清理完成。
- Agent 状态文案与 activity model 对齐。
- 中文不再大面积“成功/请稍候”。

## 风险与注意事项

### 1. 不要在第一轮同时重写所有设置页

Appearance 是最清晰的切入点。先把它做成模板，再迁移 Model/System/WebUI 等页面。

### 2. Agent Activity 不要丢失原始详情

新的 timeline 可以更简洁，但必须保留 inspectability。input/output、命令、diff、网页结果、MCP payload 可以折叠，不能消失。

### 3. SendBox 不要先大拆逻辑

`SendBox/index.tsx` 功能很多，第一轮只拆视觉组件和状态表达。真正的状态机抽取可以等视觉合同稳定后再做。

### 4. 文案不要只改英文

DeepScientist 当前中文使用频率很高。zh-CN 应该作为一等语言，不是 en-US 的直译。

### 5. 图标是品牌资产，不是状态系统本身

已生成的 icon 很重要，但必须由统一 activity/status mapping 驱动。不要在各组件里重复写正则猜 icon，否则未来会继续分叉。

## 最小可执行版本

如果要先做一个小而完整的版本，建议这样切：

1. Appearance 页去掉三块大圆角容器，改成轻量 section。
2. 主题卡改为 radio 语义，保留 16:9，label 移到图下。
3. Agent running summary 去掉 shimmer/sweep，只保留 loading icon + 具体动作 + duration。
4. SendBox 停止按钮去掉 breathing，增加一条 running status。
5. 清理 `common.json` 和 `messages.json` 中最高频的 success/loading 文案。

这个版本不会解决全部系统债，但会让用户最常看到的几个界面立即更稳、更像一个产品。
