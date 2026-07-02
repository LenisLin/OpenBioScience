# 核心任务书：Science Artifact System

## 1. 目标

把 Science Mode 做成默认开启的科研 artifact 闭环，而不是简单把聊天入口改名。

M1 完成后，用户在一个研究项目目录里提出自然语言科研任务，Agent 可以照常运行 Python/R/shell、搜索 PaperClip 或科研数据库、生成图表/表格/代码/报告文件，并在最终回答前提交一个结构化 Science Panel。前端把它渲染成 Science Report + Artifact Ledger + Evidence Ledger。用户点击 E1/E2、图、表、代码、数据、日志时，可以打开本地预览或 provenance 抽屉。

这版 M1 的真正中心是 artifact，而不是数据库、HPC 或 reviewer。报告负责解释结果，artifact 负责承载可复现对象：图片、表格、CSV、notebook、PDF、manuscript、代码、日志和环境。每个 artifact 都应该像 Claude Science 截图里那样，可以打开、看版本、看输入、看生成代码、看执行日志、看相关消息、看环境，并能对图片做最小批注后发回 Agent 迭代。

## 1A. 当前实现状态（M1）

截至当前代码实现，M1 已经完成第一条可运行闭环：

- [x] 新增 `common/chat/science.ts`：定义 Science panel、artifact、evidence、claim、provenance、page、skill use schema；提供 Science prompt、conversation extra、tool output parser 和最新 panel 提取。
- [x] 新增共享 `research_evidence` MCP：复用 PaperClip API key/baseUrl/sources/timeout，提供 `search/read`，供 Science 与医学循证共享数据库/文献检索入口。
- [x] 新增合并式 `science_artifact` MCP：一个工具覆盖 `status/reserve_id/get/list/create/patch/replace/append/version/publish/annotate/focus_page`，支持 stable id、artifact version、baseRevision 防误改、文件 hash/size、claim/evidence 自动建边、graph warning 和 publish panel。
- [x] 内置 MCP bootstrap 已注册 `deeporganiser-research-evidence` 与 `deeporganiser-science-artifact`，构建脚本已输出 `builtin-mcp-research-evidence.js` 和 `builtin-mcp-science-artifact.js`。
- [x] Guid 新建会话默认进入 Science Mode（医学循证模式除外）：自动注入 Science prompt、Science 默认 skills、`research_evidence`、`science_artifact` 和 `deeporganiser-user-input` session MCP。
- [x] 默认 skills 已进入代码目录：`resources/skills/science/SKILL.md` 与 `resources/skills/science-artifact/SKILL.md`。
- [x] 外部参考 skills 已进入代码目录：`resources/skills/vendor/deepscientist-1.6.0` 与 `resources/skills/vendor/scientific-agent-skills`；当前过渡期仍有 `openscience-science-vendor-catalog` 索引，最终目标是生成 `ds-*` / `kdense-*` 一等默认 Science skill pack，而不是让 Agent 临时浏览 vendor 目录。
- [x] 前端已新增 `ScienceReportPanel`：从 tool output 中解析 `science_artifact(action="publish")` 的 panel，渲染研究报告、artifact preview/inspector、evidence ledger、claims、provenance edges、graph warnings，并支持打开本地 artifact/input/code/log 文件预览。
- [x] 设置页已新增 `Science`：配置共享 `research_evidence` 连接、`science_artifact` 严格 provenance、manifest、默认 skills 和数据库 host 白名单。
- [x] Guid 首页已把默认工作区语义改成“研究项目”：Science badge 默认显示，目录选择文案支持中英文；医学循证开启时仍作为平行覆盖模式。
- [x] Preview 已新增 `ScienceArtifactWorkspace`：打开 Science artifact 时复用现有 Preview tab/toolbar/file viewer，只增加右侧 artifact inspector 与必要的轻量 overlay；普通文件预览不受影响。
- [x] 图片 artifact 已支持最小 rectangle 批注入口：批注会写入当前发送框，要求 Agent 回源代码/LaTeX/notebook 修改并重新 publish 新版本。
- [x] LaTeX artifact 已支持源码/PDF 双栏工作台：复用当前 CodeEditor 与 PDFPreview，并参考 DeepScientist `LatexPlugin` 的“源码 + 编译 PDF + 日志/错误”形态；前端 `Compile PDF` 会调用 Electron-local `scienceLatex.compile` bridge，优先 `latexmk`，缺失时回退 `pdflatex`，编译日志写入 `.openscience/latex/` 并可打开。
- [x] 单测已覆盖 Guid 默认追加 Science skills 与 MCP bootstrap 兼容路径。

M1 尚未实现：Reviewer agent、HPC/GPU 管理、持久化 `.openscience` manifest 恢复、科学对象专用 viewer（Mol*/genome/chemical/notebook live）、完整 notebook/PDF/manuscript 导出 pipeline。它们仍保留为后续独立任务。

## 2. 非目标

- 不自研并行 agent 调度。
- 不自研 Python/R/Jupyter/HPC 执行器。
- 不在 M1 扩展 `conversation_artifacts` 后端流。当前 `IConversationArtifactKind` 只有 `cron_trigger | skill_suggest`，M1 先走医学循证已经验证过的 tool-output structured panel。
- 不在 M1 一次性接入 Mol*/igv/Vitessce/Ketcher/RDKit viewer。
- 不在 M1 重新设计数据库连接架构；数据库检索直接复用循证模式的 PaperClip gateway/env/config/tool-call 形态。
- 不在 M1 做自动 reviewer、HPC/GPU 任务管理、完整 notebook/PDF/LaTeX 导出 pipeline，这些作为独立任务。但 M1 的 artifact 页面可以先承载 LaTeX/source、compiled PDF preview、compile log、notebook 静态预览等对象信息。
- 不在 M1 做完整多用户批注系统；但图片 artifact 需要有最小单区域批注和发送 follow-up 的入口，因为这是 artifact 迭代闭环的一部分。

## 3. 迁移判断

医学循证模式可以迁移的不是医学语义，而是四个工程骨架：

1. `common/chat/medicalEvidence.ts` 的 schema、prompt、parser、runtime summary。
2. `process/resources/builtinMcp/medicalEvidenceServer.ts` 的 Zod tool schema、normalization、submit panel 机制。
3. `useGuidSend.ts` 的 mode prompt、session MCP、conversation extra 注入。
4. `MessageList.tsx` 从 tool output 中提取 panel 并渲染专用面板的策略。
5. `MessageOutputFiles.tsx` 和 `PreviewContext.tsx` 的文件发现、预览打开、tab 复用机制。
6. `useLocalFilePreview.ts` 的本地文件读取、图片 base64、PDF/Office/Markdown/code 分类。

必须改掉的是医学证据分级假设。Science evidence 不是“RCT > cohort > case report”的静态等级，而是动态对象：代码、数据、运行日志、环境、图像区域、数据库记录、论文、用户输入都可能成为证据。因此核心 schema 要以 artifact/provenance 为中心，临床 GRADE 风格只保留为 “confidence/applicability” 的宽泛表达。

数据库连接不要另起炉灶。把医学循证模式里的 `evidence_search/evidence_read_artifact` 抽成共享 `research_evidence` MCP，继续复用 PaperclipGateway、`PAPERCLIP_API_KEY`、`PAPERCLIP_BASE_URL`、默认 sources、timeout 和 strict anchors。医学和 Science 都调用同一个搜索/读取工具；Science 再通过 `science_artifact` 把检索结果登记成 evidence。后续 UniProt/PDB/ChEMBL 等数据库可以走 skill/connector 扩展，但 M1 不需要新数据库架构。

## 3A. Skills 整合判断

Science Mode 的 skill 整合采用三层架构：

1. DeepScientist Science 是总控纪律。它定义真实执行边界、claim discipline、package check、HPC-through-shell、Science Evidence Graph。
2. K-Dense/SciAgent 是领域技能包。它们提供具体数据库、包、pipeline、实验设计、文献管理和领域流程知识。
3. OpenScience Adapter 是落地层。它把外部 skill 的检索、运行建议、输出文件、数据库记录、警告和结论统一登记到 `ScienceEvidenceItem`、`ScienceArtifact`、`ScienceProvenanceNode`。

不要把 K-Dense 和 DeepScientist 硬合并成一个巨大的 system prompt。正确方式是按需加载：用户任务触发 domain routing 后，只把相关 skill 的说明注入本次会话或本次工具规划，并要求 Agent 在执行后调用 Science MCP 登记 `skill_use`、`artifact`、`evidence` 和 `provenance`。

优先级规则：

- 如果 DeepScientist Science 与 K-Dense skill 冲突，DeepScientist Science 的执行边界和 evidence discipline 优先。
- 如果 K-Dense skill 给出包安装或 API 细节，必须先做 package/API smoke check，再把结果记为 `science.package_check` 或 `database_record`。
- 医学/临床建议仍路由到医学循证模式；K-Dense 中的 clinical skills 不进入普通 Science Mode 默认包。
- 外部 skill 是知识和流程，不是可信结果。只有真实检索、真实运行、真实文件和真实日志才能支持 `computed` 或 `parsed` claim。

## 4. M1 用户体验

一次成功流程应该长这样：

1. 新会话默认进入 Science Mode；输入框工具栏显示一个 Science 图标，加号菜单里可关闭/重新开启，同时可选择一个研究项目目录。
2. 用户说：“帮我分析这个 scRNA-seq h5ad，做 QC、UMAP、marker genes，并写一份结果摘要。”
3. Agent 如缺物种、分组列、阈值，调用 `deeporganiser-user-input` 问最多 3 个结构化问题。
4. Agent 用现有 runner 写脚本、运行命令、产出 `.h5ad`、`.csv`、`.png/.svg`、`.md`。
5. 每个关键步骤后调用 Science MCP 登记：
   - 检索或读取了什么。
   - 输入文件 hash 是什么。
   - 运行了什么命令或脚本。
   - 生成了什么 artifact。
   - 哪些结论由哪些 evidence 支撑。
6. 最终调用 `science_artifact(action='publish')` 发布当前 report/artifact graph。
7. 前端在聊天消息下渲染 Science Report 和 Artifact Ledger。报告正文里的 `[E1] [E2]` 可点击，artifact 卡片可直接打开。
8. 用户打开 `umap.png` 这类 artifact 时，主区域显示图片，右侧详情显示 `Code / Execution Log / Messages / Environment` tabs；`Review` tab 在 M1 不出现或 disabled。
9. 用户可以在图片上圈一个区域，写一句批注，系统把 artifact id、version、file path、normalized region、comment 组成 follow-up 发回 Agent。
10. 最终 assistant 文本只保留一句短说明，不重复完整报告。

## 4A. Artifact M1 形态

Claude Science 截图给出的核心 artifact 体验可以拆成四个必须实现的东西。这里的 artifact 不是“文件附件”，而是一个带版本、预览、源代码、输入、运行日志、环境、消息历史和后置 reviewer 结果的科研对象。

1. **Artifact Card**：在报告/消息下显示产物，包含文件名、类型、版本、状态、主要 evidence ids。
2. **Artifact Preview**：复用当前 Preview 系统打开图片、PDF、Markdown、CSV/Excel、代码；M1 不做新的科学 viewer。
3. **Artifact Detail Tabs**：在 preview 旁边或下方显示 Code、Execution Log、Messages、Environment。Reviewer 和 HPC/GPU 状态先不进入核心。
4. **Artifact Iteration Hook**：对图片支持一个最小批注入口，生成结构化 follow-up，让 Agent 修改源代码并重新登记 v2。

M1 的 artifact 不需要先进入全局 `conversation_artifacts` API。更稳妥的路线是：像医学循证 panel 一样，通过 Science MCP tool output 提交结构化 panel，前端从 tool output 提取 artifact ledger 并渲染；同时可选写入 `.openscience` 目录，保证之后可恢复和导出。

## 4B. Artifact 页面信息架构

页面要同时复用“打开各种文件”的 Preview 能力，以及“循证报告”的结构化报告能力。正确形态不是新建一个孤立的文件附件页，而是在当前 `PreviewPanel` 里增加 Science artifact layout：普通文件仍按现有 Preview 打开；只有 `PreviewMetadata.science` 存在时，才进入科研对象显示形态。

### 4B.1 聊天里的轻量展示

正常对话页面不应该被 artifact 工作台占满。Agent 完成任务后，聊天流里显示：

1. 一段很短的 assistant 说明。
2. `ScienceReportPanel`：类似循证报告，但主题是研究报告，显示结论、方法、限制、E1/E2 evidence。
3. `Artifact Ledger`：图、表、CSV、PDF、notebook、script、log 的紧凑列表。
4. 对图片 artifact，聊天里直接显示缩略图或内嵌 figure 预览；点击图片或 artifact card 才打开工作台。

关闭 artifact 工作台后，用户应该回到原来的对话页面和滚动位置。这个行为可以直接利用现有 Preview 的 `closePreview()`；不需要路由跳转或新窗口。

### 4B.2 打开后的 Preview Artifact Frame

打开 artifact 时不要另起一个新页面体系，而是在现有 `PreviewPanel` 的 tab、toolbar、history、download、open-in-system、HTML/PDF/Image/Markdown/Code/Office viewer 基础上增加一种 Science 显示形态：

```text
┌──────────────────────────────────────────────────────────────┐
│ Preview tabs / toolbar                                       │
├──────────────────────────────────────────────────────────────┤
│ Existing preview renderer + overlay    │ Artifact Inspector  │
│ Image/PDF/CSV/HTML/Code/LaTeX          │ Inputs/Code/Log/... │
└────────────────────────────────────────┴─────────────────────┘
```

- 外层仍是 `PreviewPanel`：普通文件打开、关闭、tab 切换、下载、系统打开、HTML/Markdown 分屏都沿用现有实现。
- `ScienceArtifactWorkspace` 只是一层 Preview 增强：不另画第二套顶部框；对象身份、版本、hash、report、evidence、code、log、environment 都收敛到右侧 inspector。
- 图片/figure 继续使用现有 image preview，并在用户点击 `Annotate` 后加固定 overlay；批注提交后只预填 follow-up message，让 Agent 回到源代码/源文档生成新版本。
- LaTeX/manuscript artifact 使用同一套 Preview tab 打开 `.tex`，增强层内部提供 source/PDF split 和 `Compile PDF`；编译失败时保留日志，并可一键把修复请求交给 Agent。
- Inspector 是审计侧栏，不再承载完整报告正文；完整报告仍在聊天流的 `ScienceReportPanel` 中，避免打开 artifact 后重复两份报告。
- 当 artifact 是图片或 LaTeX 文本时，`PreviewMetadata.science.presentation='conversation'`，`ChatLayout` 把 `PreviewPanel` 放进聊天栏本身，临时占据对话区；关闭 Preview 后恢复原聊天内容和滚动上下文。
- CSV/PDF/HTML/普通代码等不需要沉浸显示的 artifact 保持普通右侧 Preview。

当前实现落点：`PreviewMetadata.science` 携带 `SciencePanelData + artifactId + artifactVersion + presentation`。`PreviewPanel` 检测到该 metadata 后渲染 `ScienceArtifactWorkspace`；`ChatLayout` 根据 `presentation` 决定是右侧 split preview，还是聊天栏内 artifact stage。这样 artifact 增强不会污染普通图片、PDF、代码、Markdown 的打开逻辑。

### 4B.3 Artifact Inspector 信息

右侧 inspector 的 tab 必须映射真实 metadata，不能只做视觉 tab。

| Tab | M1 内容 | 来源字段 | 交互 |
|---|---|---|---|
| `Overview` | artifact 名称、版本、状态、类型、大小、hash、createdAt、evidence ids | `ScienceArtifact` | 点击 E 编号跳左侧 evidence；版本切换 v1/v2 |
| `Inputs` | 输入 CSV/h5ad/FASTQ/PDB/JSON 等文件 chips，显示 hash、role、relative path | `artifact.inputs[]` | 点击打开输入文件 Preview |
| `Code` | 生成该 artifact 的脚本、函数片段、notebook cell 或 command | `artifact.code`、`artifact.execution.scriptPath` | `Download script`、打开代码文件、定位行 |
| `Execution Log` | command、cwd、exitCode、duration、stdout/stderr preview、logPath | `artifact.execution` | 打开完整 log；失败时显示 stale/error 状态 |
| `Messages` | 相关 assistant/tool/user 消息摘要和 message ids | `relatedMessageIds`、`relatedToolCallIds` | 点击回到聊天消息位置 |
| `Environment` | Python/R 版本、包版本、conda/env、platform、git commit | `artifact.environment` | 复制 environment JSON；打开 lockfile |
| `Review` | 后置；M1 hidden 或 disabled | `reviewStatus/review` | Reviewer 任务实现后开启 |

Claude Science 截图中的 “Inputs chips + Download script + Code/Execution Log/Messages/Environment/Review tabs” 可以照这个信息架构复刻，但 M1 的 `Review` 不默认出现。这样用户会感觉它是一个科研对象，而不是一个孤立文件。

### 4B.4 版本与批注

版本选择应该出现在中栏/右栏顶部，形态类似 `samosa_fig1a.png  ‹  v2  ›`：

- `v1/v2` 是 artifact version，不是文件历史快照。
- 切换版本时，中间预览、右侧 code/log/env、左侧当前 artifact 状态一起切换。
- `previousArtifactId/previousVersion` 指向上一个 artifact id 或同 artifact 的 previous version。
- 批注只允许针对具体 `artifactId + version + filePath + normalized region`。

图片批注 M1 只做 rectangle/point + comment + send。发送后不直接改图片，而是把 follow-up 放入聊天输入或直接提交给 Agent：

```text
Please revise artifact fig_umap v2.
Target file: results/umap.png
Region: normalized rectangle x=0.64 y=0.72 w=0.09 h=0.06
Comment: these labels are hard to see
Expected behavior: modify the source plotting code and regenerate the artifact as a new version.
```

### 4B.5 与当前代码的落点

- `ScienceReportPanel.tsx`：保留普通文件附件能力；Science report 的 artifact card 不再只传 file path，而是传 `ScienceArtifact`，并把 `metadata.science={panel, artifactId, artifactVersion, presentation}` 放进 Preview metadata。
- `useLocalFilePreview.ts`：增加可选 `metadataOverride` 或新增 `openScienceArtifactPreview(artifact)`，复用当前文件读取和 `{ replace: true }` 行为。
- `PreviewContext.tsx`：扩展 `PreviewMetadata`，不改 tab 生命周期。artifact 工作台关闭仍调用 `closePreview()`。
- `PreviewPanel.tsx`：当 `activeTab.metadata.science` 存在时，内容区套 `ScienceArtifactWorkspace`；否则走现有 `renderContent()`。
- `MedicalEvidencePanel.tsx`：迁移 report block、evidence reference、method details 的渲染思想到 `ScienceReportPanel`，不要迁移医学 confidence/clinical labels。
- 新增 `ScienceArtifactWorkspace.tsx`：在现有 preview renderer 旁组合右侧 artifact inspector、图片 annotation overlay、LaTeX source/PDF split。

## 4C. 前端视觉与动效方案

Science Artifact Workspace 的视觉目标是“科研对象可检查”，不是“动画展示页”。React Bits 只能作为少量动效和交互模式参考，不作为全局 UI kit 引入；M1 优先复制或重写最小需要的交互，而不是把整套背景、3D、文字特效搬进主 bundle。

React Bits 官方文档强调它是可复制、可定制的动画组件集合，而不是传统通用组件库；也提醒同页不建议堆超过 2-3 个强动效组件，移动端应关闭部分效果或换静态占位。因此 M1 的动效策略是：

1. 默认动效层级是 `subtle`，只用于状态变化和空间连续性。
2. 同一屏同时可见的 React Bits 风格动效不超过 3 类。
3. 所有动效必须尊重 `prefers-reduced-motion`。
4. 移动端和低性能模式下关闭 spotlight、border sweep、chain sweep，仅保留 120-180ms opacity/transform 过渡。
5. 当前项目未看到 `motion/react`、`framer-motion`、GSAP 或 `lucide-react` 作为现有依赖，M1 不把它们设为硬依赖；优先用 CSS transition、CSS keyframes 和现有图标体系实现。若后续引入 `motion/react`、GSAP、ScrollTrigger，只能 lazy import 到 Science workspace，不进入普通聊天首屏。

### 4C.1 可采用的动效

| 位置 | 参考组件 | M1 用法 | 约束 |
|---|---|---|---|
| Report section 首次出现 | `FadeContent` / `AnimatedContent` | report rail 和 inspector section 进入时轻微 fade + translateY 4-8px | 只触发一次；不在长列表每项使用 GSAP |
| Artifact/Evidence Ledger | `AnimatedList` | 新 artifact、新 evidence 插入时短暂滑入；支持键盘上下选择 | 超过 20 项后禁用逐项动画，改虚拟/分页 |
| 当前 artifact 或选中 evidence | `SpotlightCard` | 鼠标经过时极低透明度 radial highlight，帮助用户知道“这个对象可进入” | 只用于当前/hover 行；不做大面积发光 |
| Provenance chain | `Stepper` | 把 `Question -> Input -> Run -> Artifact -> Claim -> Report` 渲染为紧凑 stepper/chain | 使用真实 graph state；不得模拟假进度 |
| 正在生成的 artifact | `StarBorder` 风格 | 仅在 `status=generating/running` 的单个 ledger item 上显示细线边框流动 | 完成后立即停止；warning/error 不用彩色流光 |

不采用：

- `Aurora`、`Particles`、`Orb`、`Beams`、`Threads`、`DotGrid`、3D background 等背景型组件。
- 大面积 `GradientText`，最多用于极小状态 pill，默认不启用。
- `Dock`、玻璃拟态、漂浮卡片墙等会削弱科研工作台信息密度的组件。

### 4C.2 具体样式规则

Report rail 的 section heading 采用用户偏好的“加粗 + 浅色背景条 + 横线”：

```css
.science-section-heading {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 2px;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
}

.science-section-heading::before {
  content: "";
  position: absolute;
  left: 0;
  right: -8px;
  bottom: 4px;
  height: 9px;
  border-radius: 3px;
  background: rgba(218, 210, 191, 0.45);
  z-index: -1;
}

.science-section-heading::after {
  content: "";
  width: 42px;
  height: 1px;
  margin-left: 10px;
  background: rgba(78, 82, 74, 0.22);
}
```

配色建议：

- 背景：`#f7f7f4` / `#f2f3ef`，偏实验记录纸感。
- 主文字：`#252723`，次级文字：`#6b6f66`。
- Evidence 蓝：低饱和 `#4c7899`。
- Artifact 茶灰：`#8a7762`。
- Warning 琥珀：`#a66b2a`。
- Success 灰绿：`#5f7f6b`，仅用于 validation，不做医疗绿主题。

动效时间：

- hover/focus：120-160ms。
- tab 切换、inspector 内容切换：160-220ms。
- workspace open/close：220-320ms。
- provenance chain 高亮扫线：300-450ms，只触发一次。

技术约束：

- 只动画 `opacity` 和 `transform`；不要动画 width/height/left/top 造成 layout shift。
- 批注 overlay 使用固定坐标层，基于图片 natural size 和 displayed rect 计算 normalized region。
- tab 内容切换保持 inspector 宽度稳定，避免代码/log 加载后挤压中间预览。
- 长日志、长代码默认虚拟滚动或懒加载预览，不能把整个 stdout/stderr 放进 React state。
- 所有 icon button 使用现有图标库；如果项目后续统一引入 lucide，再优先用 lucide，不用文字假按钮替代常见图标动作。

### 4C.3 前端状态语言

状态必须来自真实 backend 字段：

- `available`：普通边框，artifact 可打开。
- `generating`：ledger item 显示轻微 running border，inspector 显示等待日志。
- `missing`：灰色虚线边框，点击后展示缺失路径和最后一次登记事件。
- `stale`：顶部显示版本/输入已变更提示，要求重新生成。
- `failed`：显示 exitCode/logPath/stderr preview，默认打开 `Execution Log` tab。
- `needs_review` / provenance warning：Evidence chip 和 chain 节点显示琥珀提示，可展开看断链原因。

动画不能创造状态，只能解释状态变化。比如 running border 只能由 `status=generating` 或 MCP event `artifact_registered` 的 pending 状态触发，不能在等待模型回复时泛泛显示。

## 4D. 各功能运作方式

Science Mode 的每个功能都按同一条规则运转：Agent 可以执行普通代码和读取普通文件，但凡要进入前端报告或被当成结论依据，就必须通过 `science_artifact` 写入一个明确对象。这个对象可以是 artifact、evidence、claim、page、annotation 或 provenance edge。

### 4D.1 研究项目

- 新会话首页默认显示 `Science · 默认` badge。
- 输入框底部的目录选择不再叫“本地文件夹中工作”，而是“研究项目”。
- 选择目录后，`useGuidSend` 把 project root 写入 `conversation.extra.science.projectRoot`，同时注入 Science prompt、默认 skills、`research_evidence`、`science_artifact` 和 `user_input`。
- 如果用户开启医学循证模式，Science prompt/MCP 退让，避免医学模式与 Science 模式同时争夺系统规则。
- 后续 `.openscience` manifest 恢复实现后，同一个研究项目目录可以恢复 artifact graph、历史版本和 evidence ledger。

### 4D.2 检索和数据库连接

- `research_evidence` 是共享检索工具，不区分医学或 Science。医学循证和 Science 设置页都可以写同一套 PaperClip API key/base URL/sources/timeout。
- Agent 调用 `research_evidence(search/read)` 后，只得到可阅读资料；这一步还不是 Science 证据。
- Agent 必须再调用 `science_artifact(create/patch/append)` 把论文、数据库记录、API 返回、PDF 段落或文件路径登记成 `ScienceEvidenceItem`。
- 这样数据库层保持简单，证据链层保持统一。后续 UniProt/PDB/ChEMBL/GEO 等 connector 只需把结果登记为 `database_record` evidence。

### 4D.3 运行分析

- 代码执行仍走当前 Codex/Claude Code 的本地运行能力，不新建 runner。
- 每次关键运行至少登记三类对象：输入 evidence、activity provenance node、输出 artifact。
- 如果产生图或表，artifact 必须带 `primaryPath/previewPath`、`inputPaths/inputs`、`code.path` 或 `execution.scriptPath`、`execution.logPath/stdoutPreview/stderrPreview`。
- 如果只是临时探索，可以只登记低权重 evidence；如果进入报告正文的 claim，必须有 evidence ids。

### 4D.4 Artifact 生成与修改

- Agent 可以先 `reserve_id` 获取稳定 artifact id，再逐步 `patch/append` 填写字段。
- 修改已有 artifact 前必须 `get` 读取当前 revision；写入时带 `baseRevision`，防止覆盖用户或前一个工具调用刚写入的内容。
- 如果修改图、表、LaTeX 或 notebook，默认生成新 version，而不是直接覆盖旧对象。
- 用户图片批注会变成 `annotate` 事件和 follow-up 消息，要求 Agent 回到源代码/LaTeX/notebook 修改并重新运行。

### 4D.5 报告和页面

- `publish` 提交 `SciencePanelData`，前端从 tool output 里提取最新 panel。
- `pages[]` 决定前端显示哪些页面和布局：M1 支持聊天内 `ScienceReportPanel` 与 Preview 内 `artifact_frame`，后续全局 workspace 也应复用这一 display intent。
- 报告正文显示在聊天流的 `ScienceReportPanel`：结论、方法、限制、artifact ledger、evidence ledger。
- artifact 打开后由现有文件预览系统承担主 preview；Science 增强层只增加右侧 inspector，显示 Overview / Inputs / Code / Execution Log / Messages / Environment / Review tabs。

### 4D.6 中英文与配置

- 首页研究项目文案位于 `guid.scienceProject.*`。
- 设置页文案位于 `settings.science.*`。
- 数据配置位于 `tools.researchEvidence` 和 `tools.scienceArtifact`，不把语言文案混入数据 schema。
- 后续如果要支持 artifact 内部字段本地化，只本地化 UI label，不本地化 evidence id、artifact id、claim id 和 provenance edge type。

## 4E. 新会话页入口设计

- Science Mode 默认开启，但不再在输入框底部显示“Science 默认”长 badge。
- Science 模式入口收纳到输入框加号菜单，和上传文件、目标模式、医学循证、沉淀 Skill 同层。
- 默认开启时，输入框左下工具栏只显示一个圆形 Science icon 状态按钮；点击该图标可关闭 Science Mode。
- 医学循证和 Skill 沉淀开启时会自动关闭 Science；关闭医学循证或沉淀模式后恢复 Science 默认开启。
- 研究项目选择仍保留在输入框底部右侧，负责 workspace/project 绑定，不再承担 Science 模式状态展示。

## 4F. 设置页设计

Science 设置页分三层：

1. `共享科研检索连接`：PaperClip API key/base URL/sources/timeout，复用循证模式底层连接。这里的开关只控制 `research_evidence` 是否可用。
2. `Artifact 与证据链`：`strictProvenance`、`writeProjectManifest`、`defaultSkillIds`、`allowedDatabaseHosts`。这是 Science Mode 的核心行为，不属于医学模式。
3. `功能运作链路` 与 `内置参考 skill 目录`：用静态说明帮助用户理解项目入口、检索、artifact、证据图和 vendored skills 的职责。

设置页不放 HPC/GPU、Reviewer 的复杂配置。它们后续作为次要任务书独立出现，避免核心 artifact 闭环被过早拉复杂。

## 4F. 首页输入框设计

首页输入框的目标不是新增一个模式选择器，而是让用户一打开就知道“这里在研究项目里工作”：

- 默认 badge：`Science · 默认`，在输入框底部左侧。
- 目录按钮：空状态显示“选择研究项目”，有目录时显示目录名。
- 下拉菜单：搜索已有研究项目、新建或选择研究项目、暂不绑定研究项目。
- 医学循证开启时，Science badge 隐藏，行动栏显示医学循证 pill。
- 动效沿用输入框现有 running orbit glow；Science badge 只做轻微 hover/背景层次，不做额外强动效。

移动端上 badge 与目录按钮上下排列，避免路径过长挤压发送按钮。桌面端则 badge 在左、目录按钮占满剩余空间。

## 5. 数据契约

新增文件建议为 `packages/desktop/src/common/chat/science.ts`。

### 5.1 常量

```ts
export const SCIENCE_MODE_ID = 'science';
export const SCIENCE_EVENT_SCHEMA = 'deeporganiser.science.event.v1';
export const SCIENCE_PANEL_SCHEMA = 'deeporganiser.science.panel.v1';
```

### 5.2 Evidence

```ts
export type ScienceEvidenceSourceType =
  | 'paper'
  | 'database_record'
  | 'code'
  | 'command_log'
  | 'dataset'
  | 'table'
  | 'figure'
  | 'notebook'
  | 'manuscript'
  | 'package_check'
  | 'computational_run'
  | 'dataset_analysis'
  | 'parameter_sweep'
  | 'validation_result'
  | 'remote_job'
  | 'environment'
  | 'user_input';

export type ScienceClaimType = 'computed' | 'parsed' | 'digitized' | 'hypothesis';

export type ScienceEvidenceItem = {
  id: `E${number}`;
  title: string;
  sourceType: ScienceEvidenceSourceType;
  claimType?: ScienceClaimType;
  confidence: 'high' | 'moderate' | 'low' | 'blocked';
  status?: 'available' | 'missing' | 'stale' | 'needs_review';
  summary?: string;
  path?: string;
  url?: string;
  virtualPath?: string;
  command?: string;
  lineStart?: number;
  lineEnd?: number;
  cellId?: string;
  artifactId?: string;
  nodeId?: string;
  hash?: string;
  version?: number;
  skillUseId?: string;
  connectorId?: string;
  database?: {
    name: string;
    endpoint?: string;
    params?: Record<string, unknown>;
    accessDate?: string;
    returnedCount?: number;
    retrievedCount?: number;
    pagination?: string;
    identifierConversions?: string[];
    warnings?: string[];
  };
  region?: {
    filePath: string;
    page?: number;
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSystem: 'pixel' | 'normalized';
  };
  createdAt?: number;
};
```

规则：

- `computed` 必须来自本项目中真实运行的脚本、命令、notebook cell 或 remote job。
- `parsed` 是从用户数据、数据库记录、论文、PDF、CSV 等读取。
- `digitized` 是从图片/PDF figure 提取，必须带 `region`。
- `hypothesis` 是待验证推断，报告中不能伪装成实验结果。

### 5.2A Claim

报告里的关键结论也要是可点击对象，不应该只散落在 prose 里。

```ts
export type ScienceClaim = {
  id: string;
  runId: string;
  text: string;
  claimType: ScienceClaimType;
  status: 'supported' | 'partial' | 'hypothesis' | 'blocked';
  supportingEvidenceIds: string[];
  artifactIds?: string[];
  provenanceNodeIds?: string[];
  limitations?: string[];
  createdAt: number;
};
```

### 5.3 Artifact

```ts
export type ScienceArtifact = {
  id: string;
  runId: string;
  type:
    | 'figure'
    | 'table'
    | 'dataset'
    | 'code'
    | 'notebook'
    | 'manuscript'
    | 'pdf'
    | 'latex'
    | 'html'
    | 'molecule'
    | 'protein_structure'
    | 'genome_track'
    | 'alignment'
    | 'run_bundle';
  title: string;
  version: number;
  versionGroupId?: string;
  previousArtifactId?: string;
  previousVersion?: number;
  changeSummary?: string;
  status?: 'available' | 'missing' | 'stale' | 'generating' | 'failed';
  primaryPath?: string;
  previewPath?: string;
  thumbnailPath?: string;
  sourcePaths?: string[];
  inputPaths?: string[];
  outputPaths?: string[];
  contentHash?: string;
  sizeBytes?: number;
  mimeType?: string;
  code?: {
    path?: string;
    language?: 'python' | 'r' | 'shell' | 'latex' | 'markdown';
    entrypoint?: string;
    cellIds?: string[];
  };
  execution?: {
    command?: string;
    scriptPath?: string;
    cwd?: string;
    logPath?: string;
    stdoutPreview?: string;
    stderrPreview?: string;
    startedAt?: number;
    endedAt?: number;
    exitCode?: number;
  };
  environment?: {
    kind: 'local' | 'conda' | 'uv' | 'renv' | 'docker' | 'slurm' | 'modal' | 'ssh';
    python?: string;
    r?: string;
    packages?: Array<{ name: string; version?: string }>;
    lockfilePath?: string;
    hardware?: string;
  };
  inputs?: Array<{
    label?: string;
    role?: 'primary' | 'reference' | 'parameter' | 'metadata' | 'derived';
    path?: string;
    artifactId?: string;
    evidenceId?: string;
    contentHash?: string;
    sizeBytes?: number;
    mimeType?: string;
  }>;
  relatedMessageIds?: string[];
  relatedToolCallIds?: string[];
  defaultInspectorTab?: 'overview' | 'inputs' | 'code' | 'execution_log' | 'messages' | 'environment' | 'review';
  availableTabs?: Array<'overview' | 'inputs' | 'code' | 'execution_log' | 'messages' | 'environment' | 'review'>;
  evidenceIds?: string[];
  provenanceNodeIds?: string[];
  reviewStatus?: 'not_reviewed' | 'passed' | 'warnings' | 'failed';
  createdAt: number;
};
```

M1 tab 规则：

- `overview`：永远显示，展示 title、type、version、status、hash、size、evidence ids、paths。
- `inputs`：有 `inputs` 或 `inputPaths` 时显示。
- `code`：有 `code.path` 或 `execution.scriptPath` 时显示，点击可用现有 code preview。
- `execution_log`：有 `execution.logPath`、`stdoutPreview` 或 `stderrPreview` 时显示。
- `messages`：有 `relatedMessageIds` / `relatedToolCallIds` 时显示，点击可跳回 MessageList。
- `environment`：有 `environment` 或 lockfile 时显示。
- `review`：字段可保留，但 M1 不展示或 disabled。Reviewer 任务书实现后再开启。

### 5.3A Artifact Annotation

M1 只做单区域图片批注，不做完整 review/协作批注系统。

```ts
export type ScienceArtifactAnnotation = {
  id: string;
  runId: string;
  artifactId: string;
  artifactVersion: number;
  filePath: string;
  kind: 'rectangle' | 'point';
  region: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    coordinateSystem: 'normalized';
  };
  comment: string;
  createdAt: number;
};
```

提交批注后不要直接修改图片。前端生成 follow-up 消息：

```text
请根据这个 artifact 批注修改结果。不要只编辑图片表面；优先回到生成该 artifact 的代码/LaTeX/Markdown/notebook 中修改。
artifactId=...
version=...
file=...
region=normalized(x=..., y=..., w=..., h=...)
comment=...
```

Agent 重新运行后必须登记新版本 artifact，例如 `samosa_fig1a.png v2`。

当前 M1.5 实现：图片批注采用单个 rectangle。前端不直接调用 MCP 修改 artifact，而是把结构化修改请求写入发送框，让用户确认后交给 Agent 执行。原因是正确修图必须回到源代码/LaTeX/notebook 并重新运行，前端直接改像素会破坏 provenance。

### 4B.4A LaTeX 工作台

DeepScientist 的 `LatexPlugin` 形态值得复用：左侧源码编辑、右侧 PDF 预览、顶部编译动作、底部/侧边日志和错误列表。OpenScience 不复制 DeepScientist 的项目 API，而是在 Electron 本地实现一个最小 `scienceLatex.compile` bridge，并复用当前 Preview/CodeEditor/PDFPreview：

- `.tex/.bib/.sty/.cls` 或 `artifact.type = latex/manuscript` 打开时进入 LaTeX pane。
- 左侧使用现有 `CodeEditor` 编辑源码；`Compile PDF` 会把当前编辑器内容写回 `.tex` 后再编译，避免右侧 PDF 与源码不一致。
- bridge 优先执行 `latexmk -pdf -interaction=nonstopmode -halt-on-error`；如果 `latexmk` 不存在，回退 `pdflatex` 两遍。
- 右侧使用现有 `PDFPreview` 展示已记录或刚编译出的 PDF；编译失败时保留旧 PDF 或空态，并在源码下方显示错误日志。
- 编译日志写入源文件目录下 `.openscience/latex/*.compile.log`，可从 LaTeX pane 打开，也可由 Agent 后续登记到 `science_artifact`。
- `Ask Agent` 只在失败后出现，把 artifact id、source、current PDF、last command、last log 写入发送框，要求 Agent 修复并登记新版本。

### 5.4 Provenance Node

用轻量 DAG 表达，不必在 M1 完整实现 W3C PROV/RO-Crate，但字段要能映射过去。

```ts
export type ScienceProvenanceNode = {
  id: string;
  type:
    | 'input'
    | 'activity'
    | 'output'
    | 'environment'
    | 'claim'
    | 'skill_use'
    | 'review'
    | 'user_decision';
  label: string;
  artifactId?: string;
  evidenceIds?: string[];
  parents?: string[];
  command?: string;
  path?: string;
  contentHash?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
};

export type ScienceProvenanceEdgeType =
  | 'derived_from'
  | 'uses_input'
  | 'uses_code'
  | 'has_log'
  | 'generated'
  | 'supports'
  | 'contradicts'
  | 'validates'
  | 'cites'
  | 'annotates'
  | 'supersedes'
  | 'selected_by_skill'
  | 'answers';

export type ScienceProvenanceEdge = {
  id: string;
  runId: string;
  from:
    | { kind: 'evidence'; id: string }
    | { kind: 'artifact'; id: string; version?: number }
    | { kind: 'node'; id: string }
    | { kind: 'claim'; id: string }
    | { kind: 'skill_use'; id: string }
    | { kind: 'message'; id: string };
  to:
    | { kind: 'evidence'; id: string }
    | { kind: 'artifact'; id: string; version?: number }
    | { kind: 'node'; id: string }
    | { kind: 'claim'; id: string }
    | { kind: 'skill_use'; id: string }
    | { kind: 'message'; id: string };
  type: ScienceProvenanceEdgeType;
  label?: string;
  confidence?: 'certain' | 'inferred' | 'declared';
  createdAt: number;
};

export type ScienceGraphWarning = {
  id: string;
  runId: string;
  severity: 'info' | 'warning' | 'error';
  code:
    | 'missing_source'
    | 'missing_edge'
    | 'unopenable_evidence'
    | 'untraced_artifact'
    | 'unsupported_claim'
    | 'broken_reference'
    | 'stale_version'
    | 'missing_environment'
    | 'missing_execution_log';
  message: string;
  target?:
    | { kind: 'evidence'; id: string }
    | { kind: 'artifact'; id: string; version?: number }
    | { kind: 'claim'; id: string }
    | { kind: 'node'; id: string }
    | { kind: 'edge'; id: string };
  blocking?: boolean;
  createdAt: number;
};
```

核心规则：Science MCP 不是只收集一堆 E1/E2，而是接收一条可连通的证据链。每个新结果必须至少声明一个上游来源，除非它是 `run_started` 或用户直接提供的根输入。

Edge 方向采用“主语 -> 宾语”的关系表达，不强制等同数据流方向。前端遍历时同时建立 forward 和 reverse index：

- `activity -> input/code/log/output`：表达某个活动用了什么、生成了什么。
- `artifact -> evidence`：表达 artifact 从哪些证据或输入派生。
- `evidence/artifact/node -> claim`：表达哪些对象支持某个 claim。
- `claim -> report/message`：表达某个结论回答了哪个报告段落或用户问题。
- `new artifact -> old artifact`：表达版本继承或 supersede。

典型链路：

```text
E1 dataset snapshot
  -> E2 input hash / schema inspection
  -> N1 code script
  -> N2 command run
  -> E3 execution log
  -> A1 umap.png v1
  -> C1 computed claim
  -> report paragraph
```

对应 edge：

- `N2 uses_input E1`
- `N2 uses_code N1`
- `N2 has_log E3`
- `N2 generated A1`
- `A1 derived_from E1`
- `A1 supports C1`
- `E3 supports C1`
- `C1 answers report paragraph`

前端证据链抽屉不需要 Agent 手写图。系统可以根据这些显式引用自动构建：claim → supporting evidence → artifact → generating run → code/input/log/environment。断链时显示 `provenance warning`，不要悄悄隐藏。

### 5.5 Skill Use

外部 skill 的使用本身也要成为可审计对象。它不等于科学证据，但能解释 Agent 为什么选择某个包、数据库或 pipeline。

```ts
export type ScienceSkillUse = {
  id: string;
  runId: string;
  skillId: string;
  skillName: string;
  source: 'deepscientist' | 'k-dense' | 'sciagent' | 'local' | 'custom';
  sourceUrl?: string;
  version?: string;
  purpose: 'routing' | 'database_lookup' | 'package_workflow' | 'pipeline' | 'visualization' | 'writing' | 'review';
  status: 'selected' | 'used' | 'blocked' | 'unavailable';
  triggeredBy: string;
  selectedBecause?: string;
  limitations?: string[];
  evidenceIds?: string[];
  artifactIds?: string[];
  createdAt: number;
};
```

### 5.6 Report Panel

```ts
export type ScienceReportBlock =
  | { type: 'paragraph'; text: string; evidenceIds?: string[] }
  | { type: 'bullet_list'; items: Array<{ text: string; evidenceIds?: string[]; confidence?: string }> }
  | { type: 'checklist'; items: Array<{ label: string; detail?: string; status?: string; evidenceIds?: string[] }> }
  | { type: 'figure_ref'; artifactId: string }
  | { type: 'table_ref'; artifactId: string }
  | { type: 'artifact_ref'; artifactId: string }
  | { type: 'code_ref'; artifactId: string }
  | { type: 'card_ref'; cardId: string };

export type SciencePanelData = {
  schema: typeof SCIENCE_PANEL_SCHEMA;
  runId: string;
  projectRoot?: string;
  question: string;
  generatedAt: number;
  summary?: string;
  status: 'completed' | 'partial' | 'blocked' | 'failed';
  stats: {
    searches: number;
    artifacts: number;
    evidence: number;
    commands: number;
    validations: number;
    warnings: number;
  };
  report: {
    title: string;
    sections: Array<{
      id: string;
      heading: string;
      blocks: ScienceReportBlock[];
    }>;
  };
  evidence: ScienceEvidenceItem[];
  artifacts: ScienceArtifact[];
  pages?: ScienceArtifactPage[]; // 见 6.4，publish 后前端按 page spec 渲染/聚焦
  claims?: ScienceClaim[];
  provenance: ScienceProvenanceNode[];
  edges?: ScienceProvenanceEdge[];
  graphWarnings?: ScienceGraphWarning[];
  usedSkills?: ScienceSkillUse[];
  methods?: {
    queryPlan?: string[];
    commands?: string[];
    environmentSummary?: string;
    limitations?: string[];
  };
};
```

## 6. MCP 收敛方案

M1 不应该暴露十几个小登记工具。正确形态是：

1. 一个共享的 `research_evidence` MCP，承接医学循证和 Science Mode 的检索/读取。
2. 一个大的 `science_artifact` MCP，像 CLI 一样管理 run、report、artifact、page、evidence、claim、provenance、annotation。
3. 继续复用 `deeporganiser-user-input` 问用户问题。

真实执行仍由当前 agent runtime、Python/R/shell、Codex/Claude Code/OpenCode/Kimi Code 等完成；MCP 只负责“登记、读取、更新、展示和追踪”。

### 6.1 共享 `research_evidence`

把医学循证模式里的搜索能力抽成共享 MCP：`deeporganiser-research-evidence`。医学和 Science 都调用同一个 gateway、同一套 PaperClip env/config、timeout、source manifest、virtual file 读取逻辑。

M1 建议只暴露一个工具：

```ts
type ResearchEvidenceToolInput =
  | {
      action: 'search';
      mode: 'medical' | 'science' | 'general';
      query: string;
      sources?: string[];
      filters?: Record<string, unknown>;
      maxResults?: number;
    }
  | {
      action: 'read';
      mode: 'medical' | 'science' | 'general';
      sourceId?: string;
      url?: string;
      virtualPath?: string;
      anchor?: { lineStart?: number; lineEnd?: number; page?: number };
    };
```

迁移规则：

- 原医学 `evidence_search` 保留兼容 alias，但内部调用 `research_evidence(action='search', mode='medical')`。
- Science Mode 不再有单独 `science_search`。需要文献/数据库时调用 `research_evidence(action='search', mode='science')`，再用 `science_artifact` 把结果登记为 evidence。
- 搜索工具不直接修改 Science artifact graph。它只返回 `sourceId/url/virtualPath/rawPreview/metadata`；是否纳入报告由 `science_artifact` 决定。

### 6.2 主工具 `science_artifact`

新增 `packages/desktop/src/process/resources/builtinMcp/scienceArtifactServer.ts`，MCP server 建议命名 `deeporganiser-science-artifact`。它只有一个工具 `science_artifact`，通过 action 分发，避免工具面过宽。

```ts
type ScienceArtifactAction =
  | 'status'
  | 'reserve_id'
  | 'get'
  | 'list'
  | 'create'
  | 'patch'
  | 'replace'
  | 'append'
  | 'version'
  | 'publish'
  | 'annotate'
  | 'focus_page';

type ScienceArtifactResourceKind =
  | 'run'
  | 'report'
  | 'artifact'
  | 'page'
  | 'evidence'
  | 'claim'
  | 'provenance'
  | 'skill_use'
  | 'annotation';

type ScienceArtifactToolInput = {
  action: ScienceArtifactAction;
  projectRoot?: string;
  runId?: string;
  target?: {
    kind?: ScienceArtifactResourceKind;
    id?: string;
    version?: number;
    pageId?: string;
  };
  baseRevision?: string;
  createIfMissing?: boolean;
  payload?: Record<string, unknown>;
  displayIntent?: 'none' | 'open' | 'focus' | 'background' | 'pin';
  userAuthorizedClose?: boolean;
};
```

核心动作：

| Action | 用途 | 关键规则 |
|---|---|---|
| `status` | 查看当前项目/run 的 artifact graph 摘要 | 不创建对象 |
| `reserve_id` | 为 artifact/page/evidence/claim 预留专属 id | 适合文件还没生成但需要先引用 |
| `get` | 读取已有 run/report/artifact/page/evidence/claim | 更新前通常必须先 `get` |
| `list` | 列出当前 run 的 artifacts/pages/evidence/claims/warnings | 支持按 kind/status/filter |
| `create` | 新建 run/report/artifact/page/evidence/claim | 不传 id 时自动生成稳定 id |
| `patch` | 局部更新某个对象 | 必须带 `baseRevision`，避免覆盖用户/Agent 新改动 |
| `replace` | 替换整个对象内容 | 只用于明确重写；必须带 `baseRevision` |
| `append` | 追加 event/log/provenance edge/message/history | append-only，不覆盖旧记录 |
| `version` | 从已有 artifact 生成新版本 | 图/表/文稿重生成走新版本，不改旧版本 |
| `publish` | 把当前 run/report/artifact graph 发布成前端可渲染 panel | 合并原 `start_run` 与 `submit_panel` |
| `annotate` | 登记图片/PDF/表格区域批注 | 返回可发给 Agent 的 follow-up payload |
| `focus_page` | 请求前端打开/聚焦某个页面 | 不能关闭用户页面 |

`start_run` 和 `submit_panel` 合并进 `publish`：

- 第一次 `publish` 时，如果没有 run，工具自动创建 run record，并写入任务显示信息：title、question、projectRoot、status、startedAt、summary。
- 后续 `publish` 更新同一个 run/report 的前端 panel，保留历史 revision。
- report 信息和任务显示信息分开：`payload.run` 放任务状态、进度、项目、时间；`payload.report` 放可读报告、sections、figures、tables、claims；`payload.display` 放页面布局和默认打开对象。
- `publish` 不是“结束任务”。它可以是 draft、partial、final。`payload.run.status` 决定显示为 running/partial/completed/blocked/failed。

### 6.3 Artifact 专属 ID、版本和修改规则

每个 artifact 必须有专属 id，例如：

```text
art_fig_umap_01
art_table_markers_01
art_latex_review_01
art_notebook_analysis_01
```

规则：

- `reserve_id` 或 `create` 返回 id；Agent 不应该在 prose 里凭空发明关键 id。
- `artifact.id` 是逻辑对象，`version` 是该对象的版本。`umap.png v1` 和 `umap.png v2` 应该同 id、不同 version，或者共享 `versionGroupId`。
- 重生成图、表、PDF、manuscript 时使用 `version` action，不直接覆盖旧 artifact。
- 只改标题、说明、display tab、evidence 链接等元信息时用 `patch`，不增加 artifact version。
- 更新已有对象前必须 `get`，拿到 `revision` 后再 `patch/replace`；除非 `createIfMissing=true` 且目标不存在。
- 修改某一项就 patch 某一项；需要全量重写时才 `replace`，并在 payload 里说明 `changeSummary`。

### 6.4 Page 也是可管理对象

Claude Science 的体验不是单个文件，而是一个可以打开多个页面的科研工作台。Science Mode 中 page 是 artifact graph 的显示层，由 `science_artifact` 管理：

```ts
type ScienceArtifactPage = {
  id: string;
  runId: string;
  title: string;
  kind:
    | 'report'
    | 'artifact_workspace'
    | 'figure'
    | 'table'
    | 'code'
    | 'log'
    | 'latex'
    | 'notebook'
    | 'pdf'
    | 'provenance';
  layout:
    | 'report_artifact_inspector'
    | 'single_preview'
    | 'split_editor_preview'
    | 'ledger'
    | 'drawer';
  panes: Array<{
    id: string;
    type:
      | 'report'
      | 'preview'
      | 'inspector'
      | 'code'
      | 'execution_log'
      | 'latex_editor'
      | 'compiled_pdf'
      | 'notebook'
      | 'evidence_ledger'
      | 'provenance_chain';
    target?: {
      artifactId?: string;
      artifactVersion?: number;
      evidenceId?: string;
      claimId?: string;
      path?: string;
    };
  }>;
  revision: string;
};
```

页面策略：

- Agent 可以通过 `create/patch/focus_page` 新增页面、更新页面内容、请求聚焦页面。
- Agent 默认不关闭页面；关闭页面是用户 UI 状态。若确实需要关闭，必须有明确用户授权，并传 `userAuthorizedClose=true`。
- 用户可以手动打开/关闭页面；这不删除 artifact，也不删除 evidence。
- Agent 更新已有 page 前也要先 `get`，避免覆盖用户手动添加的 tab/pane。
- `displayIntent='open'` 表示新增或打开页面，`focus` 表示聚焦已有页面，`background` 表示只更新 ledger 不打断用户。

### 6.5 LaTeX、Notebook、PDF 编译型 Artifact

LaTeX 不需要另起系统，作为 artifact + page 支撑：

- `artifact.type='latex'`：记录 `.tex`、`.bib`、figure paths、compiler command、output PDF、compile log。
- `page.layout='split_editor_preview'`：左侧 LaTeX editor，中间/右侧 compiled PDF preview，下方或右侧 log pane。
- 编译动作仍由现有 shell/runner 或前端 compile command 执行；`science_artifact` 负责记录 compile spec 和 compile result。
- 编译成功：`patch artifact` 更新 `previewPath/pdfPath/logPath/environment`，必要时 `version` 出新的 PDF artifact。
- 编译失败：`append` compile event，artifact status 变 `failed`，inspector 默认打开 log。

Notebook 同理：`.ipynb` 是 artifact，静态预览和执行日志进入 inspector；后续 live kernel 是后置能力。

### 6.6 Science Graph Normalizer

`science_artifact` 内部需要一个轻量 normalizer，职责不是执行科研任务，而是把 Agent 分散提交的 run/report/artifact/evidence/claim/page event 归一成可检查的 graph。

每次 `science_artifact` action 都产生 append-only event：

```ts
type ScienceArtifactEvent = {
  schema: typeof SCIENCE_EVENT_SCHEMA;
  eventId: string;
  runId: string;
  action: ScienceArtifactAction;
  timestamp: number;
  target?: {
    kind?: ScienceArtifactResourceKind;
    id?: string;
    version?: number;
    pageId?: string;
  };
  baseRevision?: string;
  resultingRevision?: string;
  artifactIds?: string[];
  pageIds?: string[];
  evidenceIds?: string[];
  claimIds?: string[];
  provenanceNodeIds?: string[];
  edges?: ScienceProvenanceEdge[];
  warnings?: ScienceGraphWarning[];
};
```

建议内部状态：

```ts
type ScienceRunState = {
  runId: string;
  events: ScienceArtifactEvent[];
  evidenceById: Map<string, ScienceEvidenceItem>;
  artifactsByKey: Map<string, ScienceArtifact>; // `${artifactId}@${version}`
  pagesById: Map<string, ScienceArtifactPage>;
  claimsById: Map<string, ScienceClaim>;
  nodesById: Map<string, ScienceProvenanceNode>;
  edgesById: Map<string, ScienceProvenanceEdge>;
  warningsById: Map<string, ScienceGraphWarning>;
};
```

归一流程：

1. `create/patch/replace/version/append/publish` 都追加 event，不静默覆盖历史。
2. 每次更新 evidence/artifact/claim/page 后，normalizer 更新索引并尝试自动补边。
3. `publish` 时运行完整校验，输出 `SciencePanelData.edges` 和 `SciencePanelData.graphWarnings`。
4. 如果 `strictProvenance=true`，缺失 report 引用、computed claim 无证据、artifact 无输入/代码/日志链路可阻止发布；默认 M1 只返回 warning。

自动补边规则：

| 来源字段 | 自动 edge | 说明 |
|---|---|---|
| `artifact.inputs[].evidenceId` | `artifact -> evidence` / `derived_from` | artifact 可追溯到输入证据 |
| `artifact.inputs[].artifactId` | `artifact -> artifact` / `derived_from` | 派生 artifact，例如 cleaned h5ad 到 UMAP |
| `artifact.code.path` | `artifact -> code evidence/node` / `uses_code` | 若 code evidence 不存在，创建 `code` 类型 evidence |
| `artifact.execution.logPath` | `artifact -> log evidence/node` / `has_log` | 若 log evidence 不存在，创建 `command_log` evidence |
| `artifact.environment.lockfilePath` | `artifact -> environment evidence/node` / `derived_from` | 环境成为可打开证据 |
| `claim.supportingEvidenceIds[]` | `evidence -> claim` / `supports` | claim 的直接支撑 |
| `claim.artifactIds[]` | `artifact -> claim` / `supports` | 图/表/文稿支持 claim |
| `artifact.previousArtifactId` | `artifact@vN -> artifact@vN-1` / `supersedes` | 版本链 |
| `annotation.artifactId` | `annotation/message -> artifact` / `annotates` | 图片批注进入迭代链 |
| `skillUse.evidenceIds/artifactIds` | `skill_use -> evidence/artifact` / `selected_by_skill` | skill 解释路线，不直接证明结论 |

open target 规则：

- `evidence.path` 在 `projectRoot` 内：打开本地 Preview，并可计算 hash。
- `evidence.url`：打开外部链接，同时保留 accessDate/source metadata。
- `evidence.virtualPath`：打开 provenance drawer 的数据库记录详情。
- `evidence.region`：打开对应图片/PDF，并高亮 normalized region。
- `artifact.primaryPath/previewPath`：打开 `ScienceArtifactWorkspace`。
- `code/log/environment` evidence：默认打开右侧 inspector 对应 tab，也允许跳到普通 code/log preview。

断链 warning 规则：

- `unsupported_claim`：`claim.status=supported` 但没有 supporting evidence/artifact/node。
- `untraced_artifact`：artifact 没有 `inputs`、`inputPaths`、`sourcePaths`、`code`、`execution` 或 `provenanceNodeIds`。
- `missing_execution_log`：artifact 有 `execution.command` 但没有 `logPath/stdoutPreview/stderrPreview`。
- `missing_environment`：computed artifact 或 computed claim 没有 environment/lockfile/package summary。
- `broken_reference`：edge 或 report block 指向不存在的 evidence/artifact/claim/node。
- `unopenable_evidence`：evidence 没有 path/url/virtualPath/region，也没有 artifactId/nodeId。

这个 normalizer 是后续 reviewer、export、project history 的共同真相来源。Reviewer 不需要重新猜图，直接遍历 `SciencePanelData.edges` 和 `graphWarnings`；导出 notebook/PDF/manuscript 时也直接沿同一条 graph 找输入、代码、日志、环境和引用。

### 6.7 环境与配置

新增：

- `packages/desktop/src/common/config/researchEvidenceMcpEnv.ts`
- `packages/desktop/src/common/config/scienceArtifactMcpEnv.ts`
- `ConfigKeyMap['tools.researchEvidence']`
- `ConfigKeyMap['tools.scienceArtifact']`

建议配置：

```ts
type ScienceConfig = {
  paperclipApiKey?: string;
  paperclipBaseUrl?: string;
  defaultSources?: string[];
  strictProvenance?: boolean;
  writeProjectManifest?: boolean;
  allowedDatabaseHosts?: string[];
  enabledSkillPacks?: Array<'deepscientist' | 'k-dense' | 'sciagent' | 'local'>;
  defaultDomainSkills?: string[];
  blockedSkillIds?: string[];
};
```

规则：

- API key、SSH token、Modal token 不写入项目目录。
- `projectRoot` 只来自会话 workspace/research project。
- M1 允许 MCP 写 `.openscience/science-artifacts/runs/<runId>/panel.json`、`state.json` 和 `events.jsonl`，但 UI 首先从 tool output 渲染，避免引入新 DB 依赖。
- artifact 文件在 `projectRoot` 内时才计算 hash、size、mtime；在外部或远程路径时只记录引用和状态。
- 对 `projectRoot` 外路径只登记路径字符串，不计算 hash、不读取内容。
- K-Dense/SciAgent skill pack 的来源、版本、许可和启用状态写入 app config 或项目 manifest；不要把远程仓库整包复制进每个项目。

### 6.8 注册和迁移

需要改：

- `packages/desktop/src/process/resources/builtinMcp/constants.ts`
  - 增加 `BUILTIN_RESEARCH_EVIDENCE_ID`
  - 增加 `BUILTIN_RESEARCH_EVIDENCE_NAME`
  - 增加 `BUILTIN_SCIENCE_ARTIFACT_ID`
  - 增加 `BUILTIN_SCIENCE_ARTIFACT_NAME`
- `packages/desktop/src/process/utils/runBackendMigrations.ts`
  - 增加 `buildBuiltinResearchEvidenceServer`
  - 增加 `buildBuiltinScienceArtifactServer`
  - 在 bootstrap 时 import/update built-in server
  - 和 user-input 一样作为会话可选 built-in server
- `packages/desktop/electron.vite.config.ts`
  - 增加 builtin MCP entry：`builtin-mcp-research-evidence`、`builtin-mcp-science-artifact`

## 7. 会话注入

修改 `packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts`。

### 7.1 默认规则

- Science Mode 默认开启。
- 医学循证模式与 Science Mode 平行。临床/医学建议选择医学循证模式时，医学 prompt 的结论 SOP 优先；Science 仍可以作为 artifact/provenance registrar，但不要覆盖医学输出结构。
- 如果用户显式关闭研究项目或普通聊天，可不注入 Science MCP。

### 7.2 需要新增

- `buildScienceConversationExtra(projectRoot, config)`
- `buildScienceModePrompt(config)`
- `resolveScienceSessionMcpServer(...)`
- 和医学循证一样 merge 到 `selected_session_mcp_servers`。
- `deeporganiser-user-input` 在 Science Mode 下也自动加入。

### 7.3 Conversation Extra

```ts
type ScienceConversationExtra = {
  enabled: true;
  mode: 'science';
  projectRoot?: string;
  sopVersion: 1;
  report: {
    enabled: true;
    render: 'inline_structured';
    artifacts: true;
    provenance: true;
    figures: true;
  };
  paperclip: {
    enabled: boolean;
    sources: string[];
  };
  provenance: {
    evidenceIds: true;
    claimTypes: true;
    contentHash: true;
    environment: true;
  };
  skills: {
    rootDiscipline: 'deepscientist-science';
    enabledPacks: Array<'deepscientist' | 'k-dense' | 'sciagent' | 'local'>;
    adapter: 'openscience-science-artifact';
    requireSkillUseEvents: true;
  };
};
```

## 8. System Prompt

新增 `buildScienceModePrompt`，核心内容：

1. 你处在 OpenScience Science Mode。
2. 真实执行仍使用当前 agent runtime、shell、Python/R、HPC 命令；MCP 只登记、读取、更新 artifact graph 和报告页面。
3. 缺少会影响分析结论的变量时，使用 `deeporganiser-user-input`，最多 3 个问题。
4. 如果需要文献/数据库支持，先调用共享 `research_evidence`，不要只凭模型记忆。
5. 如果选择 DeepScientist/K-Dense/SciAgent/local skill，先说明它只是领域流程或数据库/包知识；无论后续成功、阻塞还是不可用，都必须用 `science_artifact(action='append'|'patch')` 登记 skill_use。
6. K-Dense 的数据库、Scanpy、RDKit、Nextflow、Modal 等 skill 可以作为操作指南，但不得覆盖 DeepScientist Science 的 claim/evidence 纪律。
7. 每个关键结论必须有 evidenceIds，如 `[E1] [E2]`。
8. 区分 `computed / parsed / digitized / hypothesis`。
9. 生成文件后必须用 `science_artifact` 创建或更新 artifact，包含专属 id、路径、类型、版本、hash、输入/输出、代码、环境。
10. 更新已有 artifact/page/evidence/claim 前，先 `science_artifact(action='get')` 读取当前 revision，再用 `patch/replace/version/append` 修改；不要盲目覆盖。
11. 对图、表、notebook、PDF、manuscript 等用户会打开的结果，必须尽量登记 source code、execution log、related messages、environment，让 UI 能显示 artifact detail tabs。
12. Agent 可以通过 `science_artifact` 创建/更新 page 和 displayIntent，让前端自动打开或聚焦页面；默认不要关闭用户已经打开的页面，除非用户明确授权。
13. LaTeX/notebook/PDF 都作为 artifact 支撑：记录 source、compiled preview、compile command、compile log、environment。
14. 最终可见回答前必须调用 `science_artifact(action='publish')`；最终文本短，不重复面板。
15. 报告前先 internally audit：是否有无法追溯的数字、图是否有源代码、表是否有数据、结论是否有证据、graphWarnings 是否需要向用户解释。
16. 不要把 reviewer 当作错误消除器；Reviewer 是后置功能，当前只保证 artifact provenance 可检查。

## 9. 前端核心

### 9.1 新增组件

- `packages/desktop/src/renderer/pages/conversation/Messages/components/ScienceReportPanel.tsx`
- `packages/desktop/src/renderer/pages/conversation/Messages/components/ScienceReportPanel.css`
- `packages/desktop/src/renderer/pages/conversation/Messages/components/ScienceEvidenceChip.tsx`
- `packages/desktop/src/renderer/pages/conversation/Messages/components/ScienceArtifactCard.tsx`
- `packages/desktop/src/renderer/pages/conversation/Messages/components/ScienceProvenanceDrawer.tsx`
- `packages/desktop/src/renderer/pages/conversation/Preview/components/ScienceArtifactInspector.tsx`
- `packages/desktop/src/renderer/pages/conversation/Preview/components/ScienceArtifactAnnotationOverlay.tsx`

建议先复制医学面板结构，不急着抽象共享组件。等 Science 和 Medical 都稳定后再抽 common report primitives。

### 9.2 面板视觉

Science Report 不要沿用临床绿色感，也不要做营销式大卡片。建议：

- 窄标题区：任务名、状态、运行环境、耗时。
- 主报告区：摘要、结果、方法、限制，排版偏论文/实验记录。
- 右侧或下方 Artifact Ledger：图、表、数据、代码、notebook、文稿。每个 artifact 卡片显示文件名、类型、版本、状态、主要 evidence id。
- Evidence Ledger：E1/E2 列表默认折叠 6 条，展开查看全部。
- Skill Trail：显示本次用过的 domain skill，例如 `DeepScientist science -> K-Dense scanpy -> K-Dense database-lookup`，默认折叠，不抢报告主阅读流。
- Provenance Drawer：点击 E chip 或 artifact 时打开。

CSS 原则：

- 半径不超过 8px。
- 不做嵌套卡片。
- 颜色保持中性，重点色用于 evidence/validation/warning，不做单一蓝紫或医疗绿主题。
- 表格用学术三线表风格。
- 图表/文件卡片保持紧凑，适合科学家反复扫描。

### 9.2A Evidence Graph 前端联动

Science 前端的核心不是“漂亮地列出文件”，而是让用户从任意结果进入它的证据链。

交互规则：

- 点击 report claim：左栏高亮相关 `[E1] [E2]`，右侧 provenance drawer 打开该 claim 的 chain；如果第一个支持对象是 artifact，中栏自动打开对应 artifact preview。
- 点击 E chip：如果有 `path/region/artifactId`，优先打开可视对象；同时 drawer 展示该 evidence 的上游和下游 claim。
- 点击 artifact card：中栏打开 artifact preview，右栏 inspector 默认打开 `Overview` 或 artifact 指定的 `defaultInspectorTab`，左栏 ledger 高亮当前 artifact。
- 点击 code/log/env chip：保持中栏 artifact 不变，右栏切到对应 tab；用户仍可选择“在普通 Preview 中打开完整文件”。
- 点击 graph warning：drawer 过滤到 warning target，显示断链原因、缺失字段和可修复建议。

Drawer 信息结构：

```text
Claim / Artifact / Evidence title
Status + claimType + confidence
Open target buttons

Chain:
  User question
  -> input / database / paper evidence
  -> code / command / notebook cell
  -> execution log / environment
  -> artifact version
  -> claim
  -> report paragraph

Warnings:
  missing log / unopenable evidence / unsupported claim
```

视觉状态：

- 当前选中节点：使用 `font-weight: 650`、浅背景条和左侧 2px accent line，不靠大面积色块。
- 已确认链路：细实线。
- 推断链路：细虚线，旁边显示 `inferred`。
- warning 链路：琥珀线 + warning icon。
- broken reference：断点线，节点可点击但只打开错误详情。
- 切换选中节点时，chain line 做一次 300-450ms 的轻微 sweep，帮助用户看清路径；关闭 reduced motion 时改为静态高亮。

组件落点：

- `ScienceProvenanceDrawer.tsx`：展示 graph、warning、open target。
- `ScienceEvidenceChip.tsx`：负责 evidence hover、click、keyboard enter。
- `ScienceArtifactCard.tsx`：负责 artifact open metadata。
- `ScienceArtifactInspector.tsx`：接收 selected evidence/claim 后切 tab 或滚动到对应段落。
- `ScienceArtifactRuntimeContext`：提供 `openEvidence(evidenceId)`、`openClaim(claimId)`、`openGraphWarning(warningId)`，内部统一走 graph index。

这套交互也决定了后端字段必须完整：如果没有 `path/url/virtualPath/artifactId/nodeId/region`，前端只能展示 unopenable evidence，而不能假装可以进入。

### 9.3 MessageList 接入

仿照当前医学逻辑：

- `latestSciencePanel(toolMessages)`
- `extractSciencePayloadsFromTools(...)`
- `summarizeScienceRuntime(...)`
- `resultSciencePanelByTextId`
- `sciencePanelByRenderableItemId`
- `hideScienceText`，面板存在时隐藏重复文本。

需要注意：医学和 Science panel 可能同一 turn 都存在。优先级：

1. 医学循证模式显式开启时，渲染 MedicalEvidencePanel。
2. 普通科研任务渲染 ScienceReportPanel。
3. 如果两者都有，Science artifact ledger 可以作为 Medical panel 附件后置，但 M1 可先只渲染医学面板，避免混乱。

新增 `ScienceArtifactRuntimeContext`，范围放在 conversation message tree 内，职责是把 panel 的结构化对象变成可进入的 UI 索引：

1. 按 `runId/artifactId/version` 建立 artifact index。
2. 按 `evidenceId` 建立 evidence index。
3. 按 `claimId`、`provenanceNodeId`、`warningId` 建立 graph index。
4. 建立 edge 的 forward/reverse adjacency，供 drawer 从任意节点展开上下游。
5. 提供 `openScienceArtifact(artifactId, version?)`，内部读取本地文件并调用 Preview `openPreview(..., metadata, { replace: true })`。
6. 提供 `openScienceEvidence(evidenceId)`、`openScienceClaim(claimId)`、`openScienceGraphWarning(warningId)`，统一处理 Preview、drawer、inspector tab 和聊天定位。

它不是新的持久化后端，也不替代 `PreviewContext`。`PreviewContext` 仍只负责“哪些 tab 打开、当前显示什么、关闭后回到聊天”；Science runtime context 负责“这个 tab 对应哪个科研对象”。

### 9.4 Preview 接入

扩展 `PreviewMetadata`：

```ts
type SciencePreviewMetadata = {
  science?: {
    panel: SciencePanelData;
    artifactId: string;
    artifactVersion?: number;
    presentation?: 'side' | 'conversation';
  };
};
```

当前实现为了让 Preview tab 能独立渲染 artifact frame，会在运行时 metadata 中携带 `SciencePanelData`；但 `PreviewContext.stripVolatileMetadata()` 在持久化前删除 `metadata.science`，避免把大 panel 或日志写入 localStorage。后续如果引入 `ScienceArtifactRuntimeContext`，可以把 panel 移到 runtime store，metadata 只保留 id/version/presentation。

改动文件：

- `packages/desktop/src/renderer/pages/conversation/Preview/context/PreviewContext.tsx`
- `packages/desktop/src/renderer/pages/conversation/Preview/hooks/useLocalFilePreview.ts`
- `packages/desktop/src/renderer/pages/conversation/Messages/components/MessageOutputFiles.tsx`
- `packages/desktop/src/renderer/pages/conversation/Messages/components/ScienceReportPanel.tsx`
- `packages/desktop/src/renderer/pages/conversation/Preview/components/ScienceArtifactWorkspace.tsx`

M1 只需要：

- artifact card 打开 preview 时带 metadata。
- `ScienceArtifactWorkspace` 根据 metadata 从 runtime context 找到完整 artifact 对象；找不到时降级为普通 Preview + metadata header。
- preview header 能显示 artifact id/version/evidence，并能切换 v1/v2。
- preview inspector 显示 Overview、Inputs、Code、Execution Log、Messages、Environment tabs；Review tab 后置。
- evidence chip 点击能打开相关文件或 provenance drawer。
- image preview 叠加最小 annotation overlay，支持 rectangle/point + comment + send follow-up。

### 9.5 与现有代码复用关系

M1 直接复用：

- `MessageOutputFiles.tsx`：文件路径提取、文件卡片、open system、show in folder、copy path。
- `useLocalFilePreview.ts`：图片 base64、文本读取、PDF/Office/Excel/PPT 路由。
- `PreviewContext.tsx`：tab identity、replace mode、dirty state、preview metadata。
- `MedicalEvidencePanel.tsx` 的 report blocks、evidence references、methods 折叠区思路。
- `medicalEvidence.ts` 的 tool-output parser 和 runtime summary 模式。

M1 新增而不是复用：

- artifact inspector tabs，因为医学循证没有“同一个产物的代码/日志/消息/环境”详情面板。
- annotation overlay，因为现有 preview 只负责查看，不负责区域批注。
- artifact version metadata，因为当前 output file card 只按 path 去重，没有 artifact id/version 概念。

## 10. Project Manifest

M1 不做完整数据库迁移，但建议 project root 下写轻量 manifest：

```text
.openscience/
  project.json
  runs/
    <runId>/
      events.jsonl
      panel.json
  artifacts/
    index.jsonl
    <artifactId>/
      artifact.json
      annotations.jsonl
  reports/
  exports/
```

MCP 在 `writeProjectManifest=true` 且路径在 `projectRoot` 内时写入。UI 不依赖它完成渲染，但导出、review、恢复历史会用到。

## 11. 测试

### Unit

- `science.ts` parser 能从 tool_group/acp_tool_call/tool_call 中提取 event/panel。
- `science_artifact(action='publish')` normalization 能处理空 stats、缺失 optional fields、artifact/evidence 顺序。
- `claimType` 和 `sourceType` 不接受未知值。
- `science_artifact(action='append'|'patch')` 能记录 K-Dense/DeepScientist/SciAgent/local skill source、version、purpose，并能被 panel parser 提取。
- `science_artifact(action='create'|'patch')` 能根据 projectRoot 内文件补齐 hash/size/mime/status，并保留 code/log/environment/messages。
- `science_artifact(action='annotate')` 输出 normalized region，不能写入像素坐标。
- `science_artifact(action='reserve_id')` 能生成稳定 artifact/page/evidence/claim id。
- `science_artifact(action='patch'|'replace')` 在缺少 `baseRevision` 时拒绝修改已有对象。
- `science_artifact(action='version')` 能从已有 artifact 创建新版本，不覆盖旧版本。
- hash/path 只在 `projectRoot` 内计算。
- Science Graph Normalizer 能从 artifact inputs/code/log/environment 和 claim supports 自动补边。
- Science Graph Normalizer 对 unsupported claim、untraced artifact、missing execution log、unopenable evidence 生成 `graphWarnings`。
- edge direction 按“主语 -> 宾语”存储，runtime context 能建立 forward/reverse adjacency。

### MCP

- 每个 tool 的 Zod schema 测试。
- `research_evidence(action='search')` 缺 PaperClip key 时返回可读错误，不崩溃。
- `research_evidence(action='search'|'read')` 直接复用循证模式 PaperClip env/config/gateway，不引入新的数据库连接协议。
- `science_artifact(action='publish')` 返回 `panel_published` event。
- `science_artifact(action='publish')` 返回 normalized `edges` 和 `graphWarnings`。
- `science_artifact(action='create'|'patch')` 对不存在文件标记 `missing`，不假装成功。
- `science_artifact(action='append')` 不读取外部 skill 仓库内容，只登记本次会话已选择的 skill 元数据。
- `science_artifact(action='focus_page')` 不能关闭用户页面；关闭必须显式 `userAuthorizedClose=true`。

### Renderer

- MessageList 能把 Science Panel 挂到 turn 的最后一个 assistant text。
- fallback tool summary 下也能渲染 panel。
- ScienceReportPanel 渲染 report sections、artifacts、evidence、methods。
- ScienceReportPanel 能显示折叠的 Skill Trail，并可从 skill use 跳到相关 evidence/artifact。
- 图片 artifact 在普通聊天流中显示缩略图/内嵌预览；点击后才进入 artifact workspace。
- 点击 E chip 打开 provenance drawer。
- 点击 claim/E chip/artifact/graph warning 时，ScienceArtifactRuntimeContext 能定位同一条 chain。
- artifact card 调用 preview 并传 metadata。
- Preview metadata 带 `science` 时，PreviewPanel 切到 ScienceArtifactWorkspace；普通文件不受影响。
- ScienceArtifactWorkspace 桌面端显示 Preview 原生 chrome、主 preview renderer 和右侧 inspector；不再重复完整 report rail，也不另画第二套顶部框。
- Preview 中 artifact inspector 能展示 Overview / Inputs / Code / Execution Log / Messages / Environment。
- closePreview 后回到原对话页面，不做路由跳转，不清空聊天上下文。
- 图片 artifact 可创建一个 rectangle annotation，并生成 follow-up message。
- reduced motion 开启时关闭 spotlight/border sweep/chain sweep，基础可用性不变。
- graph warning 显示为琥珀状态，不能被正常 evidence/card 样式吞掉。

### E2E

准备 fixture conversation：

1. `science_artifact(action='publish')` 创建 run/report draft。
2. `science_artifact(action='reserve_id')` 预留 `art_fig_umap_01`。
3. `science_artifact(action='create')` 登记 `results/umap.png` artifact。
4. `science_artifact(action='append')` 登记 `k-dense:scanpy` skill_use。
5. `science_artifact(action='create')` 登记 E1/E2 evidence。
6. `science_artifact(action='create')` 登记 C1 claim，并连接 E1/E2 和 artifact。
7. `science_artifact(action='create')` 创建 figure workspace page。
8. `science_artifact(action='publish')` 发布 panel。

验收：

- 面板出现。
- E chip 可点击。
- 普通聊天流里能看到图片 artifact 缩略图。
- 图片 artifact 可 preview。
- 打开 artifact 后左栏报告高亮当前 artifact，中间显示图片，右栏显示 inspector。
- 图片 artifact 的 Overview/Inputs/Code/Execution Log/Environment tabs 可打开。
- Provenance drawer 能展示 `input -> code/run/log -> artifact -> claim -> report` 链路。
- 故意缺 log 的 fixture 会出现 `missing_execution_log` warning。
- 关闭 artifact workspace 后恢复原聊天页面。
- 对图片圈选区域后，sendbox 或 follow-up payload 包含 artifactId/version/path/normalized region/comment。
- 缺文件 artifact 显示 missing，而不是打开空白。

## 12. 验收标准

- 新建普通研究项目会话默认注入 Science prompt、Science MCP、User Input MCP。
- 医学循证模式不被破坏。
- Agent 提交的 Science panel 可以在消息下稳定渲染。
- 报告正文里至少一种 E chip 可点击并打开 provenance。
- artifact card 能打开本地图片、CSV、Markdown、PDF 或代码预览。
- artifact workspace 能把报告、预览和 inspector 合在同一个对象页面里：左侧报告/证据，中间文件预览，右侧输入、代码、日志、消息和环境。
- artifact detail tabs 能查看 Overview、Inputs、生成代码、执行日志、相关消息和环境。没有数据时显示空状态，不编造。
- 图片 artifact 支持最小区域批注并生成结构化 follow-up。
- 最终报告中每个主要结论都能追溯到 evidence id。
- 每个 supported/computed claim 都能在 provenance drawer 中追溯到至少一个可打开的输入、代码/命令、日志或 artifact；追溯不完整时必须显示 `graphWarnings`。
- 点击 claim、E chip、artifact、graph warning 都能进入同一个证据链索引，而不是打开互不相干的面板。
- 前端动效尊重 `prefers-reduced-motion`，同屏不堆叠超过 3 类强动效，且不使用背景型 React Bits 特效。
- 生成的 `.openscience/science-artifacts/runs/<runId>/panel.json` 与 UI 渲染内容一致。
- 使用 K-Dense/DeepScientist/SciAgent skill 时，报告能显示 skill trail，但科学结论仍必须通过 evidence/provenance 支撑。
- 没有引入 Mol*/igv/Vitessce/Ketcher 等大依赖到主 bundle。

## 13. 实施 Checklist

- [x] 新增 `common/chat/science.ts` schema、prompt、parser、runtime summary。
- [x] 新增 `common/config/researchEvidenceMcpEnv.ts`。
- [x] 新增 `common/config/scienceArtifactMcpEnv.ts`。
- [x] 新增 `process/resources/builtinMcp/researchEvidenceServer.ts`，把医学循证搜索抽成共享工具。
- [x] 新增 `process/resources/builtinMcp/scienceArtifactServer.ts`，只暴露 `science_artifact` 一个 CLI-style 工具。
- [x] `science_artifact` 支持 `reserve_id/get/list/create/patch/replace/append/version/publish/annotate/focus_page`。
- [x] `science_artifact` 强制已有 artifact/page/evidence/claim/skill_use 更新前携带 `baseRevision`。
- [x] `science_artifact` 支持 page create/patch/focus，默认不关闭用户页面。
- [x] `science_artifact` 支持 LaTeX artifact 的 source/PDF/log/compiler metadata。
- [x] 实现内建 Science graph normalizer，从 evidence/artifact/claim 自动补边并生成 `graphWarnings`。
- [x] 在 `constants.ts` 注册 built-in MCP 常量。
- [x] 在 `runBackendMigrations.ts` 注册/更新 Science MCP。
- [x] 在 `electron.vite.config.ts` 和 `scripts/build-mcp-servers.js` 增加 builtin MCP entry。
- [x] 在 `useGuidSend.ts` 注入 Science prompt、MCP、extra。
- [x] 增加 curated skill pack 选择和 adapter prompt：DeepScientist Science 为 root discipline，K-Dense/SciAgent 为 domain pack。
- [x] 在 `ScienceReportPanel` / `ScienceArtifactWorkspace` 内建立 runId/artifactId/version 到 panel artifact 的索引。
- [x] 在 panel/workspace 内增加 evidence、claim、warning、edge 的展示与打开入口。
- [x] 新增 `ScienceReportPanel` 及 CSS。
- [x] 新增 `ScienceArtifactWorkspace`，在 PreviewPanel 中组合 report rail、preview renderer、inspector。
- [x] 新增 `ScienceArtifactInspector`，提供 Overview / Inputs / Code / Execution Log / Messages / Environment / Review tabs。
- [x] 新增 `ScienceArtifactAnnotationOverlay`，支持图片 rectangle 批注并回填发送框。
- [x] 新增 React Bits inspired subtle motion CSS：section highlight、selected spotlight、workspace enter、hover lift，并支持 reduced motion。
- [x] 在 `MessageList.tsx` 增加 Science panel extraction/rendering。
- [x] 扩展 Preview metadata 和 artifact card 打开逻辑。
- [x] 增加 unit/MCP smoke/renderer 相关验证。
- [x] 写一份 fixture JSON，用于人工验收 Science Panel。
