# OpenScience Science Mode 方案书与 Checklist

日期：2026-07-01
工作区：`/Users/yixuan/Documents/OpenScience`
分支：`codex/open-science`

## 0. 结论先行

Science Mode 应该成为 OpenScience 的默认会话模式，并与现有医学循证模式平行：医学循证模式处理临床/医学建议时走更严格的医疗证据 SOP；Science Mode 处理自然科学、工程、数据分析、计算实验、论文产出和科研项目管理。

最核心的产品目标不是“再做一个聊天入口”，而是让科学家在一个研究项目里完成 artifact 闭环：

1. 用自然语言提出研究任务。
2. Agent 在项目授权目录内读取数据、写代码、运行 Python/R/shell、查询数据库。
3. 每个结果生成可打开的 artifact：图、表、CSV、PDF、notebook、manuscript、结构文件、分子文件、基因组 track 等。
4. 每个 artifact 都带 provenance：输入文件、代码、命令、环境、日志、生成它的消息。review 结果是后置增强，不进入 M1。
5. 每条关键结论都有 E1/E2 这种 evidence id，可以点击回到论文、代码、运行日志、数据文件、图像区域、数据库记录或 notebook cell。
6. 用户能直接圈图/批注，让 Agent 回到生成代码里修改，而不是只修饰图片表面。
7. Reviewer 做背景检查是 P1/P2 后续任务。M1 先保证 artifact 的代码、日志、消息、环境可检查。

实现上不要自研并行 agent/调度系统。并行、远程、HPC/GPU 仍交给现有 Codex/Claude Code/OpenCode/Kimi Code 这类基础 runner 和 shell 来做；Science Mode 的 M1 只负责项目语义、system prompt、MCP 工具、artifact/provenance schema 和前端 artifact 展示。HPC/GPU 状态管理和 reviewer 审计闭环放入后续任务。

核心真相层是共享 `research_evidence` + 单一 `science_artifact` event stream + Science Graph Normalizer。Agent 通过 `science_artifact` 像 CLI 一样读取、新增、局部修改、版本化、发布 run/report/artifact/page/evidence/claim/provenance；normalizer 负责补齐可推导 edges、校验断链、生成 `graphWarnings`，最终形成 `SciencePanelData`。前端的报告、artifact preview、inspector、provenance drawer 都从这同一张图读取，不各自发明状态。

## 1. Claude Science 可借鉴的使用过程

我已下载并查看了 Claude Science 页面素材与视频，参考文件在 `docs/references/claude-science/`。几个关键画面值得复刻：

- `images/032.webp`：scVI 超参数 sweep。左侧是研究项目和活动任务，中间显示 8 个远程运行任务、参数表和结果图，右侧是 live notebook，提示 kernel 变量和状态与 Agent 共享。
- `images/037.webp`：用户在 figure 上直接圈出标签并批注“these labels are hard to see”。右侧 artifact 面板有 `Code / Execution Log / Messages / Environment / Review` tabs，并能下载 script、查看 inputs。
- `images/027.webp`：长篇文献综述生成 PDF/LaTeX，同时 reviewer 抓出 PMID/DOI 对不上、执行记录缺失的问题。
- `images/041.webp`：single-cell 大图作为可版本化 artifact 打开，有版本号、下载、更多菜单。
- `images/047.webp`：系统发育图和 residue heatmap，强调科学可视化要能承载领域对象，而不是普通图片预览。
- `images/053.webp`：Ketcher 化学结构编辑器，说明 molecule artifact 应该进入原生编辑/查看体验。
- `images/054.webp`：蛋白结构 + AlphaFold/ClinVar/UniProt 风格的多来源摘要，适合我们做结构生物学 artifact panel。

因此，Science Mode 的主体验应该是：

1. 首页不是“在本地文件夹中工作”，而是“研究项目”。
2. 用户选择已有研究项目，或新建研究项目并选择/创建本地授权目录。
3. Science Mode 默认开启，首条消息可以是自然语言任务，也可以附带数据文件。
4. Agent 若缺少决定性上下文，通过结构化 `user_input` 问最多 3 个短问题，比如物种、基因组版本、对照组、统计阈值、HPC 队列。
5. Agent 正常运行代码和 shell；运行过程记录为 science events。
6. 结果以 Science Report + Artifact Ledger 展示，而不是只在聊天里贴路径。
7. 用户点击任何 E 编号、artifact 卡片、图表、表格都能打开对应预览和 provenance。
8. 用户打开 artifact 时可以看到生成代码、执行日志、相关消息和环境。Review tab 后置。
9. 用户对图片局部批注后，系统生成带 artifact id、版本、区域坐标和批注文本的 follow-up，让 Agent 修改源代码或源文稿。

## 2. 当前代码可复用面

本地代码已经有很多可以直接复用的“骨架”。

| 能力                                   | 当前位置                                                                                                                               | Science Mode 复用方式                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 新建会话时注入 mode prompt、MCP、extra | `packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts`                                                                        | 新增 `isScienceMode`，默认 true；像医学循证一样注入 Science prompt、Science MCP、User Input MCP、conversation extra |
| 医学循证 schema/prompt/panel contract  | `packages/desktop/src/common/chat/medicalEvidence.ts`                                                                                  | 抽象成 `common/chat/science.ts`，保留 panel/event/report/card/table/figure 思路，扩展 source type 和 claim type     |
| 医学循证内置 MCP                       | `packages/desktop/src/process/resources/builtinMcp/medicalEvidenceServer.ts`                                                           | 抽出共享 `researchEvidenceServer.ts`；新增 `scienceArtifactServer.ts` 管理 artifact graph                           |
| 内置 MCP 注册                          | `packages/desktop/src/process/utils/runBackendMigrations.ts`、`packages/desktop/src/process/resources/builtinMcp/constants.ts`         | 增加 `deeporganiser-science`，默认可用；会话里自动选中                                                              |
| 结构化问用户问题                       | `packages/desktop/src/process/resources/builtinMcp/userInputServer.ts`、`packages/desktop/src/renderer/pages/conversation/user-input/` | Science clarification 直接复用，无需新 UI                                                                           |
| 循证报告面板                           | `packages/desktop/src/renderer/pages/conversation/Messages/components/MedicalEvidencePanel.tsx` 和 CSS                                 | 拆出或复制为 `ScienceReportPanel`；视觉从临床报告改为研究报告/实验账本                                              |
| 从 tool call 中提取医学 panel          | `packages/desktop/src/renderer/pages/conversation/Messages/MessageList.tsx`                                                            | 新增 `latestSciencePanel()` 和 runtime accumulator                                                                  |
| 文件输出卡片                           | `packages/desktop/src/renderer/pages/conversation/Messages/components/MessageOutputFiles.tsx`                                          | 增加 “Open provenance / View in report / Copy metadata” 等 artifact 动作                                            |
| 本地预览系统                           | `packages/desktop/src/renderer/pages/conversation/Preview/`                                                                            | 已支持图片、PDF、Markdown、HTML、Office、Excel、PPT、diff、code、URL；Science 增加 annotation overlay 和科学 viewer |
| 项目/工作区分组                        | `packages/desktop/src/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers.ts`                                             | 当前 `custom_workspace` 已能分组；Science 改名并升级为 `research_project` 语义                                      |
| 最近工作区                             | `packages/desktop/src/renderer/components/workspace/recentWorkspaces.ts`、`workspaceHistory.ts`                                        | 过渡期可以把旧 workspace 映射成研究项目                                                                             |

注意：`IConversationArtifactKind` 目前只有 `cron_trigger | skill_suggest`，前端 artifact API 也主要服务这两类。第一阶段不要强依赖扩展持久 artifact API；先通过 MCP tool-call 里的 structured panel 渲染 Science Report 和 Artifact Ledger。第二阶段再把 `science_artifact`、`science_report`、`science_review` 接入 `conversation.artifact` 流。

## 3. 产品对象模型

### 3.1 ResearchProject

研究项目是 workspace 的上层语义。建议用本地 DB 表 + 项目目录 manifest 双轨保存。

```ts
type ResearchProject = {
  id: string;
  name: string;
  rootPath: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  defaultSkillIds: string[];
  defaultMcpServerIds: string[];
  databases?: ScienceDatabaseProfile[];
  hpcProfiles?: ScienceHpcProfile[];
  privacy: {
    networkDefault: 'ask' | 'deny' | 'allow_project_hosts';
    allowedHosts: string[];
  };
};
```

项目目录建议创建：

```text
.openscience/
  project.json
  artifacts/
  runs/
  reports/
  reviews/   # post-M1
  exports/   # post-M1
```

`project.json` 记录项目名、创建时间、默认 skills 和默认数据库的非敏感配置。HPC profile 后置；密钥、SSH 凭据、API key 不放进项目文件，仍走系统设置或 secret store。

### 3.2 Conversation Extra

会话继续存 `extra`，新增：

```ts
type ScienceConversationExtra = {
  science: {
    enabled: true;
    mode: 'science';
    projectId?: string;
    projectRoot?: string;
    sopVersion: 1;
    report: {
      enabled: true;
      render: 'inline_structured';
      figures: true;
      artifacts: true;
      artifactInspector: true;
      reviewer: false; // post-M1 feature flag
      exports: false; // post-M1 feature flag
    };
    provenance: {
      evidenceIds: true;
      claimTypes: true;
      environment: true;
      graphWarnings: true;
      strictProvenance: false;
    };
  };
};
```

医学循证模式和 Science Mode 不应该互相覆盖。建议规则：

- 默认：Science Mode on。
- 当用户显式选择医学循证模式，`medical_evidence.enabled=true`，Science Mode 可以保留为底层 artifact/provenance，但临床输出走医学 SOP。
- 如果问题既是科学分析又涉及临床建议，医学循证优先于普通 Science claim。

## 4. Science Evidence 与 Artifact Schema

Science Mode 需要两层追溯：

- 用户可读的 evidence ledger：E1、E2、E3，用于报告和文稿引用。
- 内部 science graph nodes：package check、run、dataset analysis、validation、claim 等，用于 reconstruct provenance。

### 4.1 Evidence Ledger

```ts
type ScienceEvidenceSourceType =
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

type ScienceClaimType = 'computed' | 'parsed' | 'digitized' | 'hypothesis';

type ScienceEvidenceItem = {
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
  region?: {
    filePath: string;
    page?: number;
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSystem: 'pixel' | 'normalized';
  };
  hash?: string;
  version?: string;
  relatedNodeIds?: string[];
  createdAt?: number;
};
```

关键规则：

- `computed` 必须来自当前项目中真实运行的代码/命令，并链接 run log、script、输入、输出。
- `parsed` 是从用户给的数据、数据库记录、论文文本中读取。
- `digitized` 是从图片/PDF figure 读数，必须记录图像区域和方法。
- `hypothesis` 是尚未验证的科学推断，不能在报告里伪装成实验结论。

### 4.2 Science Artifact

```ts
type ScienceArtifact = {
  id: string;
  runId: string;
  type:
    | 'figure'
    | 'table'
    | 'dataset'
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
  primaryPath?: string;
  previewPath?: string;
  sourcePaths?: string[];
  inputPaths?: string[];
  outputPaths?: string[];
  code?: {
    path?: string;
    language?: 'python' | 'r' | 'shell' | 'latex' | 'markdown';
    entrypoint?: string;
    cellIds?: string[];
  };
  execution?: {
    command?: string;
    cwd?: string;
    startedAt?: number;
    endedAt?: number;
    exitCode?: number;
    logPath?: string;
  };
  environment?: {
    python?: string;
    r?: string;
    packages?: Record<string, string>;
    condaEnv?: string;
    gitCommit?: string;
    platform?: string;
  };
  evidenceIds: string[];
  review?: ScienceReviewFinding[]; // reserved for post-M1 reviewer
};
```

artifact 打开时默认看到 `Preview`，右侧或顶部提供 `Code / Execution Log / Messages / Environment`。Claude Science 画面里的 `Review / Exports` 可以作为视觉和信息架构预留，但 M1 不启用，避免把核心 artifact 闭环拖成 reviewer/export 工程。

### 4.3 Science Report Panel

可以从 `MedicalEvidencePanelData` 演化：

```ts
type SciencePanelData = {
  schema: 'openscience.science.panel.v1';
  runId: string;
  projectId?: string;
  question: string;
  generatedAt: number;
  summary?: string;
  stats: {
    searches: number;
    filesRead: number;
    commandsRun: number;
    artifacts: number;
    evidence: number;
    provenanceWarnings: number;
  };
  findings: ScienceFinding[];
  claims: ScienceClaim[];
  evidence: ScienceEvidenceItem[];
  artifacts: ScienceArtifact[];
  report?: ScienceReport;
  reviews?: ScienceReviewFinding[]; // post-M1
  methods?: ScienceMethods;
  exports?: ScienceExport[]; // post-M1
};
```

## 5. 后端与 MCP 方案

### 5.1 第一阶段：内置 Science MCP

新增两个内置 MCP surface：

- `deeporganiser-research-evidence`：共享检索/读取，医学循证和 Science Mode 都用它。
- `deeporganiser-science-artifact`：artifact graph 工作台，像 CLI 一样管理 run/report/artifact/page/evidence/claim/provenance。

它们都不是运行代码的 executor；代码仍由 Codex/Claude Code 的 shell/工具执行。

M1 建议工具：

| Tool                | 用途             |
| ------------------- | ---------------- | ------------------------------------------------------ | ----- | ------ | -------- | ------- | --------- | -------- | --------- | --------- | ---------- | -------------------------------------- |
| `research_evidence` | `action='search' | 'read'`，共享 PaperClip/数据库检索和 virtual file 读取 |
| `science_artifact`  | `action='status' | 'reserve_id'                                           | 'get' | 'list' | 'create' | 'patch' | 'replace' | 'append' | 'version' | 'publish' | 'annotate' | 'focus_page'`，管理整个 artifact graph |

后置 reviewer、export、remote job 先作为 `science_artifact` 的后续 action 或 resource kind 预留，不在 M1 额外开独立工具。

`deeporganiser-user-input` 继续处理结构化问答，不重复造轮子。

Science MCP 内部必须有 `ScienceGraphNormalizer`：

- 将 `science_artifact` 分散 event 聚合成 `evidenceById`、`artifactsByKey`、`claimsById`、`pagesById`、`nodesById`、`edgesById`。
- 根据 artifact inputs/code/log/environment 和 claim supporting evidence 自动补边。
- 对 unsupported claim、untraced artifact、missing execution log、unopenable evidence、broken reference 生成 `graphWarnings`。
- 在 `science_artifact(action='publish')` 输出 normalized `edges` 和 `graphWarnings`，前端只读这个结果。
- 默认 `strictProvenance=false`，缺链显示 warning；用户或项目开启严格模式后，关键断链阻止提交。

### 5.2 PaperClip 与数据库

现有医学循证 MCP 已有 PaperClip gateway、`evidence_search`、`evidence_read_artifact`、line anchor、panel submit 的成熟模式。M1 应把搜索/读取抽成 `research_evidence`，医学循证和 Science Mode 共同使用；医学旧工具名保留 alias。

数据库连接不在 M1 重新设计。M1 只把医学循证模式已经跑通的 PaperClip gateway、env/config、`evidence_search`/`evidence_read_artifact` 风格升级为共享 `research_evidence`；返回结果由 `science_artifact` 统一登记为 evidence 和 artifact provenance。

后续数据库能力分三层：

1. 核心默认：PaperClip + PubMed/OpenAlex/CrossRef 风格的文献检索，直接复用循证模式连接架构。
2. 科学数据库技能：UniProt、PDB/RCSB、Ensembl、Reactome、ClinVar、ChEMBL、GEO、PubChem、CELLxGENE 等通过 skill 或轻量 REST wrapper 调用。
3. 后期 connectors：实验室内部 API、ELN、Benchling/LabArchives/LaminDB、私有数据库、HPC metadata service。

每次数据库检索都必须保存 endpoint、params、access date、count reconciliation、分页状态、identifier conversion。

### 5.3 Artifact 存储

短期：Science report 通过 tool call 输出，被 `MessageList` 提取并渲染。实际文件存在项目目录。

中期后置：扩展 conversation artifacts：

```ts
type IConversationArtifactKind =
  | 'cron_trigger'
  | 'skill_suggest'
  | 'science_report'
  | 'science_artifact'
  | 'science_review';
```

长期：项目级 artifact store：

```text
.openscience/artifacts/<artifactId>/
  manifest.json
  preview.png
  source.py
  execution.log
  environment.json
  review.json     # post-M1
```

这样几个月后打开项目，不依赖聊天上下文也能 reconstruct artifact。

### 5.4 Export Pipeline（后置）

导出功能不进入 M1。后续实现时应走普通本地命令，并将命令和环境写入证据：

- Notebook：`.ipynb` 生成/导出，后期接 `jupyter nbconvert`。
- PDF：Markdown/LaTeX 走 `pandoc`、`tectonic` 或 `latexmk`，根据本机可用性检测。
- Manuscript：Markdown + BibTeX/CSL + figure/table manifest，导出 `.md/.tex/.docx/.pdf`。
- Figure：优先 SVG/PDF，PNG/TIFF 作为预览或投稿格式。
- Supplement：artifact manifest + environment lock + command logs。

当前依赖已有 `katex`、`remark-math`、`rehype-katex`，适合 Markdown 数学预览；完整 LaTeX 编译不应塞进前端，放后端 export command 更稳。

## 6. System Prompt 设计

Science Mode prompt 要比普通 coding prompt 多几条硬约束。

核心骨架：

```text
# OpenScience Science Mode

You are working inside a research project. Use the normal agent runtime for file operations and execution. Treat scientific conclusions as evidence-bound claims.

Mandatory workflow:
1. Frame the task: research question, dataset, organism/system, units, success criteria, constraints, and safety/privacy limits.
2. Ask concise structured questions through deeporganiser-user-input only when missing information changes the analysis route or interpretation.
3. Use code/shell/R/Python normally for actual computation. Do not claim a result was computed unless it was actually run in this project.
4. Use deeporganiser-science tools to start runs, record evidence, attach artifacts, record validation, and submit the final report.
5. Every answer-bearing claim must cite E1/E2 style evidence ids. Evidence can be paper, database record, dataset, code, log, figure, notebook, or environment. Remote jobs and reviewer findings are post-M1 evidence types.
6. Classify claims as computed, parsed, digitized, or hypothesis.
7. For generated figures/tables/manuscripts, preserve provenance: input files, code path, command, environment, output path, and artifact status.
8. If a user annotates a figure/table/manuscript region, modify the source code or source document when possible; do not merely paint over the rendered artifact.
9. Before final response, submit a structured Science report. Keep final chat prose short.
10. If reviewer is unavailable, do not imply that an independent review has run; state limitations and verification needs.
```

Prompt 还要包含“禁止项”：

- 不把模型记忆当数据库检索结果。
- 不把下载失败/未运行的东西写成已验证。
- 不因为图好看而弱化统计/物理/生物学验证。
- 不把后置 reviewer 当成重新运行实验。
- 不泄露私有路径，除非用户明确需要审计路径。

## 7. 前端设计

### 7.1 首页：从“本地文件夹”到“研究项目”

`GuidPage`/`GuidInputCard` 当前有 workspace selector。建议升级：

- 主标题：`研究项目`
- 第一屏直接显示：
  - 最近研究项目
  - 新建研究项目
  - 打开本地文件夹作为研究项目
  - 项目默认技能/数据库/HPC 快捷设置
- 输入框仍在第一屏，不做 marketing hero。
- Science Mode 默认开启，用一个安静的状态 pill 表示。
- 医学循证模式是并列 mode，可显式切换。

过渡策略：

- 旧 `custom_workspace=true` 的会话继续按 workspace 分组。
- 第一次打开旧 workspace 时，可以提示“设为研究项目”，写 `.openscience/project.json`。
- 新建研究项目本质仍给 runner 一个 `workspace`，所以底层无需大改。

### 7.2 Science Report Panel

基于 `MedicalEvidencePanel`，但语义和布局改成研究报告：

- Header：项目名、任务名、runId、生成时间、artifact/provenance 状态。
- Pipeline accumulator：Frame → Search → Compute → Validate → Submit Report。Review/Export 作为后置 stage。
- Main report：用户可读结论，段落/表格/图引用都绑定 evidenceIds。
- Evidence Ledger：E1/E2 卡片，按 sourceType 图标区分论文、代码、数据、日志、图、环境、数据库。
- Artifact Ledger：图、表、notebook、PDF、manuscript、structure、molecule、track。
- Methods/Environment：检索计划、命令、包版本、机器信息、限制；remote job 信息后置。
- Post-M1 Reviewer：warning/error/info，点击跳到 claim、artifact、代码行或日志行。
- Post-M1 Exports：notebook/PDF/manuscript/source bundle。

视觉原则：

- 不做医疗报告的绿色/临床语气；改成安静、密集、可审计的科研工具。
- E 编号和 artifact 状态要明显，但不要像 dashboard 一样堆卡片。
- 默认阅读流是 report，审计信息折叠或切到 ledger。

### 7.3 Artifact Preview

当前 PreviewPanel 已有多 tab、编辑/预览、历史版本、图片/PDF/Markdown/HTML/Office/Excel/PPT/code。

Science artifact 的关键取舍：不要把它做成“文件附件详情页”，也不要新开一个和 Preview 并列的 viewer。它应该是当前 PreviewPanel 的一个 Science layout 变体。普通文件沿用现有 Preview；当 `PreviewMetadata.science` 存在时，PreviewPanel 切换为科研对象显示形态：

```text
Preview tabs / toolbar
Science Artifact header + trace strip
Existing preview renderer | Artifact Inspector
```

- 外层仍是 `PreviewPanel`：tab、toolbar、下载、系统打开、HTML/Markdown 分屏和已有 viewer 都不重做。
- `ScienceArtifactWorkspace` 只增加 artifact header、版本/状态、trace strip、annotation overlay、LaTeX source/PDF split 和 inspector。
- `Artifact Inspector`：显示 `Overview / Inputs / Code / Execution Log / Messages / Environment / Review`。Reviewer agent 和 export 是后置能力。
- 图片或 LaTeX 文本可通过 `PreviewMetadata.science.presentation='conversation'` 临时占据聊天栏；关闭 Preview 后回到原对话页面。

这个布局让 artifact 变成一个带版本、预览、源代码、输入、运行日志、环境和消息历史的科研对象，而不是单纯路径附件。实现上需要一个轻量 `ScienceArtifactRuntimeContext`，按 `runId + artifactId + version` 从当前 Science panel 查对象；Preview metadata 保存 panel、id、version 和 presentation，持久化时移除 volatile science metadata。

证据链交互也走同一个 context：`openScienceEvidence(evidenceId)`、`openScienceClaim(claimId)`、`openScienceGraphWarning(warningId)` 会从 normalized graph 找 open target，决定是打开 Preview、切 inspector tab、滚动回聊天消息，还是只展示 warning drawer。这样 E chip、claim、artifact card、code/log chip 都进入同一条链，不形成互相割裂的 UI。

动效方案采用 React Bits inspired 的小动效，不引入背景特效；M1 先用 CSS 和现有图标体系实现，不把 `motion/react`、GSAP 或 lucide 设为硬依赖：

- section heading 用加粗文字、浅色背景条和短横线，保持科研报告质感。
- report/inspector section 首次出现只做轻微 fade + translateY。
- artifact/evidence ledger 新项插入使用短滑入，长列表关闭逐项动画。
- 当前 artifact/evidence 行使用低透明 spotlight hover。
- provenance chain 选中时做一次短 sweep，reduced motion 下改静态高亮。
- running artifact 可用细线 border sweep，状态结束立即停止。

新增科学 viewer 推荐：

| Artifact 类型               | 首选方案                                             | 阶段  |
| --------------------------- | ---------------------------------------------------- | ----- |
| 图片/figure                 | 现有 ImageViewer + annotation overlay                | M3    |
| CSV/Excel                   | 现有 ExcelViewer，增加 provenance header             | M2-M3 |
| PDF                         | 现有 PDFViewer，增加 page/region evidence anchors    | M3    |
| Markdown/LaTeX              | 现有 Markdown + KaTeX；`.tex` 先 code + compiled PDF | M3-M4 |
| Notebook                    | `nbconvert`/静态 renderer；后期 live kernel 状态     | M4    |
| Protein/PDB/mmCIF           | Mol\* 或 3Dmol.js 懒加载                             | M5    |
| Molecule/SMILES/SDF/MOL/KET | Ketcher + RDKit.js                                   | M5    |
| Genome tracks/BAM/VCF/BED   | igv.js                                               | M5    |
| Single-cell/spatial         | Vitessce，或先生成静态 figure                        | M5-M6 |
| Alignment/phylogeny         | 先静态 SVG/PNG + tree files；后期专用 viewer         | M5-M6 |
| Regression/model table      | 先用现有 CSV/Excel/HTML/Markdown 预览 + provenance header；后期专门模型表 viewer | M3-M4 |
| Causal DAG / identification | 先用 Mermaid/SVG/PNG + assumptions ledger；后期 DAG editor/viewer | M3-M5 |
| Survey codebook             | 先用 CSV/Excel/Markdown 预览 + variable dictionary panel | M3-M4 |
| Geospatial social data      | 先生成静态 map/GeoJSON summary；后期 deck.gl/MapLibre 懒加载 | M5-M6 |
| Qualitative coding          | 先用表格/Markdown coding ledger；后期 coded excerpt + theme matrix viewer | M4-M6 |

这些 viewer 不应一开始全部打包进主 bundle。建议按 content type/lazy import/feature flag 加载。

### 7.4 自然语言迭代与批注

批注流程：

1. 用户打开 artifact。
2. 点击批注按钮。
3. 对图片/PDF/渲染页画矩形、圈选、箭头或自由笔。
4. 输入批注。
5. 前端生成 annotation JSON：

```ts
type ScienceAnnotation = {
  artifactId: string;
  artifactVersion: number;
  filePath: string;
  page?: number;
  region: { x: number; y: number; width: number; height: number; coordinateSystem: 'pixel' | 'normalized' };
  comment: string;
  screenshotPath?: string;
};
```

6. 自动向当前会话发送 follow-up：

```text
请根据这个 artifact 批注修改结果。不要只编辑图片表面；优先回到生成该 artifact 的代码/LaTeX/Markdown/notebook 中修改。
artifactId=...
version=...
region=...
comment=...
```

7. Agent 根据 artifact provenance 找到 source code，修改并重新运行，生成 v2。

## 8. Skills 策略

最终原则：不要再依赖 `science-vendor-catalog` 作为主要使用方式。DeepScientist、K-Dense、Auto-Empirical Research Skills，以及后续可能加入的 SciAgent，需要被规范化成 OpenScience 自己的内置 Science skill pack，在新建 Science 会话和研究项目时默认启用、默认可见、默认可路由。所谓“默认加载”指的是它们作为一等 builtin skills 进入会话 skill ids 和设置页，而不是把数百到上千个 `SKILL.md` 全文塞进 system prompt；后者会挤爆上下文，也会让互相冲突的 trigger 直接污染 Agent 行为。

过渡期可以保留 `science-vendor-catalog` 作为来源索引和审计入口，但正式运行路径应改为：

1. `resources/skills/vendor/**` 保留原始仓库和 license/provenance，不直接作为 Agent 的默认工作入口。
2. 生成 `resources/skills/ds-*`、`resources/skills/kdense-*`、`resources/skills/aer-*`、后续 `resources/skills/sciagent-*` 这类规范化 skill 目录；每个目录都有自己的 `SKILL.md`、稳定 `name`、来源说明、license、风险等级和 OpenScience Adapter SOP。
3. 生成 `resources/skills/openscience-skill-pack.manifest.json`，列出所有默认启用的 Science skill ids、来源、版本、license、domain tags、risk、priority、clinical boundary、是否允许执行脚本。
4. `DEFAULT_SCIENCE_SKILL_IDS` 不再只放 `openscience-science` / `openscience-science-artifact` / `openscience-science-vendor-catalog`，而是从 manifest 载入 OpenScience core + DeepScientist pack + K-Dense pack + Auto-Empirical pack + 后续 SciAgent pack。
5. Settings 里显示的是分组后的 skill pack：OpenScience Core、DeepScientist、K-Dense、Auto-Empirical、SciAgent，而不是让用户面对几百个散乱开关；但每个单独 skill 可查看、禁用、审计来源。

Science Mode 采用三层整合：

1. DeepScientist Science 是 root discipline，负责执行边界、claim discipline、Science Evidence Graph、package check、HPC-through-shell。
2. K-Dense/SciAgent 是自然科学 domain skill packs，负责数据库、包、pipeline、可视化、文稿、review 等领域操作细节。
3. Auto-Empirical 是社科/实证研究 domain skill pack，负责计量、因果推断、复现包、引用核查、survey/codebook、质性分析和 AER 风格论文工作流。
4. OpenScience Adapter 负责把外部 skill 的选择、检索、运行建议、输出文件、数据库记录和警告写入 `science_artifact` 的 skill_use、evidence、artifact、provenance resource。

这意味着：K-Dense 和 Auto-Empirical 都可以用，但它们不是新的真值源。它们给方法和领域 SOP，DeepScientist 给证据纪律，OpenScience 给 artifact/provenance 和前端可检查性。

### 8.0 规范化与冲突处理

外部 skills 不能原样“整包执行”。K-Dense 仓库自带 `SECURITY.md`，其中对部分脚本型 skill 标记了环境变量读取、网络访问、同名 Python 模块 shadowing、未披露脚本等风险。因此默认启用分两层：

- 默认启用 skill 指令、routing metadata、领域 SOP、数据库/API 使用说明。
- 默认不执行未审计脚本；脚本进入 `executionPolicy: "quarantined"`，只有通过静态扫描、来源确认、依赖审计、用户授权和 allowlist 的脚本才能由 Agent 调用。

规范化脚本需要做这些事：

1. 扫描 DeepScientist、K-Dense、Auto-Empirical 选定默认子集和后续 SciAgent 的 `SKILL.md`。AERS 的完整 1,153 个子 skill 保留在 vendor/catalog 中；默认 materialize 根 router + 高价值社科/计量/因果/复现子集，避免把上游明确建议路由化使用的超大仓库展开成上下文负担。
2. 读取 frontmatter，生成唯一 skill name：`ds-review`、`ds-science`、`kdense-database-lookup`、`kdense-scanpy` 等。
3. 复制原 skill 目录到一等目录，保留相对 `references/`、`assets/`；`scripts/` 默认保留但标记 quarantined。
4. 给每个 skill 的正文开头插入 OpenScience Adapter 说明：所有输出必须登记为 `skill_use`、`evidence`、`artifact`、`claim`、`provenance`；不得绕过 `science_artifact`。
5. 生成冲突表：exact name conflict、semantic overlap、clinical boundary、broad trigger、script risk。
6. 生成 manifest，并由测试保证没有重复 name、缺失 license/source、坏路径或未分类风险。

冲突规则：

- OpenScience core 永远最高优先级：`openscience-science` 和 `openscience-science-artifact` 决定 evidence、artifact、claim、final report 的格式。
- DeepScientist 优先处理研究流程纪律：实验规划、package check、computed claim、paper outline、write、review、figure/paper quality。
- K-Dense 优先处理领域方法：数据库检索、Scanpy/AnnData/RDKit/Biopython/ChEMBL/PDB/UniProt 等具体包和 API 的操作细节。
- Auto-Empirical 优先处理社科/实证研究：StatsPAI/full empirical pipeline、Stata/R/Python 计量、DID/IV/RDD/SCM/DML、系统综述、引用核查、replication package、codebook 和 qualitative coding。
- SciAgent 若后续引入，优先作为补充领域模板；与 K-Dense 重合时选择来源更清晰、风险更低、指令更窄的版本。
- clinical 相关 skill 可以默认出现在 pack 中，但标记 `clinicalBoundary: "medical_evidence_required"`；普通 Science Mode 不能用它们给患者级建议。
- broad trigger 或强制生成图/海报/营销内容的 skill 需要收窄 description，否则不进入默认路由优先级。

### 8.1 DeepScientist v1.6.0

DeepScientist v1.6.0（2026-05-13 发布）新增 Science Evidence Graph、`science` skill、169 张 science package cards、Nature/paper-production companion skills。它最适合作为我们的“证据纪律”和“包路由”参考。

建议吸收：

- `science`：package check、run、dataset analysis、parameter sweep、validation、claim node 类型。
- `paper-plot`：快速生成 publication-style 普通图。
- `nature-figure`：高质量论文图 workflow。
- `write/review/paper-outline`：把实验结果转成报告/论文和 reviewer 检查。

不建议照搬：

- 自己引入额外 runner、HPC profile manager、FastAPI/Chainlit stack。
- 把 FermiLink 变成 runtime 依赖。

### 8.2 K-Dense scientific-agent-skills

K-Dense 当前可以作为可用候选：MIT 许可，README 标注兼容 Codex/Claude Code 等 Agent Skills 标准，GitHub tree 中约 149 个 `SKILL.md`。它更像 curated domain pack 或项目模板库，不应替代 DeepScientist Science 总控。

优先纳入候选：

- `database-lookup`：78 个公共数据库 REST API 的确定性检索规则，适合做 Science 数据库检索 SOP。
- `citation-management`：引用校验、BibTeX/DOI/PMID 管理。
- `scanpy`、`anndata`、`bulk-rnaseq`、`pydeseq2`：生信和 single-cell 工作流。
- `rdkit`、`datamol`、`deepchem`：化学信息学和分子设计工作流。
- `matplotlib`、`scientific-schematics`：图表和科学示意图。
- `nextflow`、`modal`：后期用于 workflow/HPC/cloud，但需要凭据和权限边界。

谨慎：

- `clinical-decision-support`、`clinical-reports` 可以被纳入默认 skill pack 以便用户看见来源和边界，但必须标记为医学循证专用；普通 Science Mode 只能把它们当技术参考，不能产出临床建议。
- Lab automation、Benchling/Ginkgo 等涉及外部账户或实验室执行的 skill 可以默认登记，但 `executionPolicy` 必须是 `requires_user_authorization`。
- 过于宽泛或强制生成图的 skill 需要在规范化层收窄触发描述；不能让外部 skill 覆盖 OpenScience 的最终回答结构。

### 8.3 SciAgent-Skills

SciAgent-Skills 有 202 个技能，其中主要分布：

- genomics-bioinformatics：64
- scientific-computing：29
- structural-biology-drug-discovery：28
- scientific-writing：24
- systems-biology-multiomics：11
- proteomics-protein-engineering：10

适合作为领域模板库：

- Literature：PubMed、OpenAlex、scientific literature search、manuscript writing、peer review。
- Genomics/single-cell：Scanpy、AnnData、CELLxGENE Census、GEO、Ensembl、ClinVar、UCSC。
- Structural/drug：PDB、AlphaFold、RDKit、ChEMBL、PubChem、AutoDock/Vina。
- Computing：Nextflow、Snakemake、Dask、Polars、Zarr、Astropy、NetworkX。

### 8.4 Auto-Empirical Research Skills

Auto-Empirical Research Skills（AERS）作为第三个默认来源接入，定位是社科/实证研究 skill pack。当前 vendored snapshot 扫描到 1,153 个 `SKILL.md`。它的上游根 `SKILL.md` 明确建议将整个仓库作为 router，而不是把 69 个合集、上千个子 skill 一次性加载。因此 OpenScience 采取折中但可用的方案：

- 完整仓库 vendored 到 `resources/skills/vendor/auto-empirical-research-skills`，保留 catalog、LICENSE、README、audit/provenance 文件。
- 默认 materialize 182 个 `aer-*` 一等 skill，包含：根 router、StatsPAI、Python/Stata/R full empirical pipeline、AER/Paper workflow、因果/计量、复现包、引用核查、systematic review、survey/codebook、qualitative/thematic analysis、OpenAlex/研究生产力和 econ-fin workflow。
- 与 K-Dense 或通用写作 skill 重合的自然科学/泛写作来源不提高优先级；自然科学数据库/包仍优先 K-Dense，社科方法和实证论文优先 AERS。
- AERS 的 materialized/adapted skill 内容按 CC BY-SA 4.0 ShareAlike 处理：保留 CoPaper.AI 版权和许可证链接，并在 adapter header / notices 中说明 OpenScience 做了规范化、frontmatter 改写、SOP 增补和 provenance/risk 标注。

社科 artifact 需要新增语义类型，而不一定要立刻实现全新 viewer：

- `regression_table`：回归/模型表，记录公式、样本、FE、SE、聚类、N、R²、导出表、估计代码和诊断 evidence。
- `model_diagnostic`：event study、平行趋势、残差、leverage、placebo、specification curve、robustness grid。
- `causal_dag`：识别图和假设 ledger，假设必须是 evidence 或 hypothesis。
- `survey_codebook` / `data_dictionary`：变量字典、问卷、recode log、缺失值规则。
- `geospatial_map`：社科地图、行政区/坐标 join、CRS、聚合层级和 geocoding warnings。
- `qualitative_coding`：主题编码、coded excerpts、inter-coder/reflexive memo。
- `replication_package`：data/code/output/README/环境/许可证的可复现包。

### 8.5 技能产品形态

最终产品形态做三档，但三档都属于默认可见的 Science skill pack：

1. `active_default`：OpenScience core、DeepScientist research discipline、常用写作/图表/数据库 skill、低风险领域包。新会话默认路由。
2. `available_default`：K-Dense/SciAgent 的 single-cell、structural biology、cheminformatics、genomics、proteomics、materials、astronomy 等领域包，以及 AERS 的低风险实证研究/文献/代码本/复现技能。新会话默认可用，按任务触发。
3. `restricted_default`：HPC/cloud/lab automation/private APIs、credentialed integrations、clinical-only。默认可见和可审计，但执行需要用户授权、凭据和模式边界。

技能启用时要显示来源、license、最后更新时间和适用范围，避免用户以为它是已验证的本地软件环境。

每次使用 domain skill 都要形成 Skill Trail：

- root discipline：DeepScientist Science
- domain skill：例如 K-Dense `scanpy`、`rdkit`、`database-lookup`
- connector/source：PaperClip、REST API、local CLI、Modal
- status：used / blocked / unavailable
- related evidence/artifact links

## 9. 数据库连接架构

最低可行目标：

- PaperClip 文献检索与 artifact 读取。M1 直接复用医学循证模式的 PaperClip gateway/env/config/tool-call 形态，不重新设计数据库连接架构。
- REST API skill 方式查询 UniProt、PDB/RCSB、Ensembl、Reactome、ClinVar、ChEMBL、GEO、PubChem、CELLxGENE、OpenAlex、PubMed。
- 每次查询都变成 evidence item，能点击打开 raw/normalized metadata。

项目级 `ScienceDatabaseProfile`：

```ts
type ScienceDatabaseProfile = {
  id: string;
  name: string;
  kind: 'paperclip' | 'rest' | 'mcp' | 'local_index';
  baseUrl?: string;
  authRef?: string;
  allowedHosts: string[];
  defaultParams?: Record<string, unknown>;
};
```

后期可以加 connectors：

- ELN / LIMS / Benchling / LabArchives。
- 私有数据湖或对象存储。
- 机构内部 search API。

权限规则：每个新 host、credential、远程 job 都需要用户批准或项目白名单。prompt 和模型响应仍然会经过模型服务，涉及隐私数据时必须显示边界。

## 10. HPC/GPU 设计（后置）

本节不属于 M1 artifact 核心，只保留后续任务边界。不自研调度。Science Mode 后续只把远程/HPC 访问变成可审计 profile 和 artifact。

### 10.1 Shell-first HPC

项目可以保存 remote profile：

```ts
type ScienceHpcProfile = {
  id: string;
  name: string;
  kind: 'ssh' | 'slurm' | 'modal' | 'cloud_vm';
  host?: string;
  user?: string;
  workdir?: string;
  scheduler?: 'slurm' | 'none';
  submitTemplate?: string;
  statusCommand?: string;
  cancelCommand?: string;
  logPathPattern?: string;
};
```

Agent 实际仍通过 shell/SSH/sbatch/squeue/scancel 操作。MCP 只记录：

- remote job id
- submit command
- workdir
- stdout/stderr/log path
- status snapshots
- output files
- cost/queue/GPU 信息（如果可得）

### 10.2 Modal/cloud

Modal 可以作为后期 connector，不默认启用。原因：

- 需要账户、token、计费边界。
- 运行环境与本地项目目录不同，provenance/数据同步要更严格。
- 应先把 shell/Slurm 记录机制做稳。

## 11. Reviewer 设计（后置）

本节不属于 M1 artifact 核心，只保留后续任务边界。Reviewer 是 Science Mode 的质量护栏，而不是科学真理机。

检查项：

- claim 没有 E evidence。
- `computed` claim 没有 run log/code/input/output。
- 图表数字与生成代码/CSV 不一致。
- manuscript/PDF 中的数字在 source table 中找不到。
- 引用 DOI/PMID/标题不匹配。
- 数据库检索没有 endpoint/params/access date。
- package/environment 信息缺失。
- 远程 job 没有状态或日志。
- 用户批注后只改了图片，没有改源代码。

输出：

```ts
type ScienceReviewFinding = {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  artifactId?: string;
  evidenceIds?: string[];
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  recommendation?: string;
  rerunRequired?: boolean;
};
```

UI 中 reviewer findings 应该能点击跳转到 artifact、代码行、日志行或报告段落。默认 reviewer 不重新跑分析；如果需要 rerun，作为明确建议和用户授权动作。

## 12. 分期实现

### M0：方案书与资料归档

- 已下载 Claude Science 视频/图片到 `docs/references/claude-science/`。
- 已下载 external skill trees 和样例到 `docs/references/external-skills/`。
- 本文档作为方案书和 checklist。

### M1：Science Mode 骨架

目标：用户能从“研究项目”入口创建 Science 会话，看到默认 Science mode 状态。

- 新增 `common/chat/science.ts`：mode id、conversation extra、prompt builder、schema 常量。
- `useGuidSend` 默认注入 Science prompt、Science extra、user-input MCP。
- 首页 workspace 文案改为“研究项目”，保留原 workspace 参数。
- 侧边栏把 local project copy 改为研究项目。
- 增加基础单元测试：Science extra 不破坏 medical evidence extra。

### M2：Science MCP + Report Panel

目标：Agent 能用 MCP 提交结构化 Science report，前端渲染 E1/E2 与 artifact ledger。

- 新增 built-in MCP 注册。
- 新增共享 `researchEvidenceServer.ts`，将医学循证搜索/读取抽成 `research_evidence(action='search'|'read')`。
- 新增 `scienceArtifactServer.ts`，只暴露 `science_artifact` 一个 CLI-style 工具。
- 实现 `science_artifact` 的 `reserve_id/get/list/create/patch/replace/append/version/publish/annotate/focus_page` actions。
- 实现 `ScienceGraphNormalizer`，输出 normalized edges 和 graphWarnings。
- 新增 `ScienceReportPanel.tsx`。
- `MessageList` 提取 latest science panel。
- 先用 fixture/e2e 验证一条报告能渲染。

### M3：Artifact Provenance、详情面板与批注

目标：图/表/文件不是普通路径，而是可审计 artifact。

- `MessageOutputFiles` 识别 science artifact metadata。
- Preview metadata 增加 `artifactId/version/evidenceIds/provenancePath`。
- Artifact 打开显示 `Code / Execution Log / Messages / Environment`。`Review` 后置。
- Artifact page 支持 agent 创建/更新/聚焦，但默认不关闭用户手动打开的页面。
- LaTeX artifact 支持 source editor、compiled PDF preview、compile log metadata。
- Image annotation overlay：M1 只做 rectangle/point + comment。
- PDF annotation overlay 后置。
- 批注提交自动生成 user follow-up。
- Agent 修改 source code/source document 后生成新 artifact version。

### M4：导出 notebook/PDF/manuscript

目标：Science report 可以导出成可复现 bundle。

- `.ipynb` 静态预览和导出。
- Markdown/LaTeX to PDF command pipeline。
- manuscript bundle：report.md、references.bib、figures、tables、environment、logs。
- 每次导出成为 `science.export` evidence。

### M5：Skills 与科学 viewer

目标：常见 dry-lab 任务体验接近 Claude Science。

- Skills marketplace 中标注 Science templates。
- 引入或懒加载 Mol\*/3Dmol、Ketcher/RDKit.js、igv.js、Vitessce。
- 文件类型 router：PDB/mmCIF、MOL/SDF/KET/SMILES、BED/BAM/VCF、h5ad/zarr 等。
- 项目模板：single-cell、structural biology、cheminformatics、genomics。

### M6：数据库/HPC profiles

目标：数据库和远程任务可配置、可审计、可复现。

- Project database profiles。M1 先不做新架构，直接沿用循证模式连接方式。
- Deterministic REST retrieval manifest。
- SSH/Slurm profile UI。
- Remote job artifact cards。
- Modal/cloud connector 作为显式可选功能。

## 13. 最小可行 Demo

推荐第一条端到端 demo：

1. 新建研究项目 `scRNA-seq demo`。
2. 用户给一个小 CSV/h5ad 或 synthetic dataset，要求做 QC + UMAP + marker table。
3. Agent 运行 Python 脚本，生成 `umap.png`、`markers.csv`、`analysis.ipynb`、`report.md`。
4. Science report 展示：
   - E1 数据集 metadata
   - E2 分析脚本
   - E3 execution log
   - E4 UMAP figure
   - E5 marker table
5. 用户圈出 UMAP 标签太小，提交批注。
6. Agent 修改绘图脚本字号，重新生成 v2。
7. Artifact provenance 提示：统计阈值/marker method 已记录；环境缺少 scanpy 版本则在 artifact 状态中 warning。
8. 后续可在独立任务中导出 PDF + notebook + provenance bundle。

这个 demo 覆盖了 Science Mode 的核心价值，但不依赖 HPC、复杂数据库、专用 3D viewer。

## 14. Checklist

### 产品与入口

- [x] Guid 首页文案从“本地文件夹”升级为“研究项目”。
- [x] 支持选择已有研究项目。
- [ ] 支持新建研究项目并创建 `.openscience/project.json`。
- [x] Science Mode 默认开启。
- [x] 医学循证模式与 Science Mode 明确并列，不互相误触发。
- [ ] 旧 custom workspace 自动显示为研究项目分组。

### 后端与 MCP

- [x] 新增 `common/chat/science.ts`。
- [x] 新增 `deeporganiser-research-evidence` built-in MCP constants。
- [x] 新增 `deeporganiser-science-artifact` built-in MCP constants。
- [x] 新增 `researchEvidenceServer.ts`。
- [x] 新增 `scienceArtifactServer.ts`。
- [x] 注册到 `runBackendMigrations.ts`。
- [x] `research_evidence` 能复用 PaperClip gateway/env/config 和 virtual paths。
- [x] `science_artifact` 支持 `reserve_id/get/list/create/patch/replace/append/version/publish/annotate/focus_page`。
- [x] `science_artifact(action='publish')` Zod schema 能 normalize 常见宽松输入。
- [x] `science_artifact` 修改已有 artifact/page/evidence/claim/skill_use 必须校验 `baseRevision`。
- [x] `ScienceGraphNormalizer` 能自动补边并生成 `graphWarnings`。
- [x] MCP 工具输出能被 `latestSciencePanel` 提取。

### Evidence / Artifact

- [x] E1/E2 evidence ledger 支持 paper/code/log/dataset/figure/table/notebook/environment。remote job 后置。
- [x] Claim type 必填：computed/parsed/digitized/hypothesis。
- [x] computed claim 缺少 run log 时在 artifact/provenance 中标记 warning；reviewer 后置。
- [x] Artifact manifest 存储 code/input/output/log/env/messages。
- [x] Artifact version 可递增。
- [x] 点击 E 编号能打开对应文件、路径、行号或区域。

### 前端报告

- [x] `ScienceReportPanel` 渲染 summary、findings、claims、evidence、artifacts、methods。
- [x] 运行中 accumulator 显示 Frame/Search/Compute/Validate/Artifact。
- [x] Artifact Ledger 可打开 Preview。
- [x] Methods/Environment 默认折叠但可审计。
- [ ] Export 区域后置。

### Preview 与批注

- [x] Preview metadata 增加 artifact/provenance 字段。
- [x] Image annotation overlay：M1 只做 rectangle/point + comment。
- [ ] PDF page/region annotation。后置。
- [x] 批注生成结构化 follow-up message，包含 artifactId/version/path/normalized region/comment。
- [x] Agent 修改 source code/source document 后生成新 artifact version。
- [x] Code/Execution Log/Messages/Environment tabs。
- [x] Review tab。

### Skills / 数据库

- [x] 默认内置 DeepScientist Science root discipline。
- [x] K-Dense/Auto-Empirical/SciAgent 作为 domain skill pack，不直接抢最终回答结构。
- [x] 生成一等内置 skill 目录：`ds-*`、`kdense-*`、`aer-*`；`sciagent-*` 作为后续来源预留，不再依赖 vendor catalog 作为主路径。
- [x] 生成 `openscience-skill-pack.manifest.json`，并让 `DEFAULT_SCIENCE_SKILL_IDS` 从生成的 skill pack 启用全部 Science skill ids。
- [x] 对外部 skill 生成来源、license、领域标签、风险和执行策略：`active_default` / `available_default` / `restricted_default` / `quarantined_script`。
- [x] 使用外部 skill 时通过 `science_artifact(action='create'|'append'|'patch')` 登记 skill_use。
- [x] 默认可路由 single-cell、genomics、structural biology、cheminformatics 等领域 skills。
- [x] 默认可路由 social science、econometrics、causal inference、replication package、survey/codebook、qualitative coding 等 AERS 社科 skills。
- [x] Skill 来源、license、更新时间可通过 manifest 和每个 materialized `SKILL.md` adapter header 查看。
- [x] Science 设置页显示默认 Skill Pack 摘要、来源数量、脚本隔离、受限执行和医学边界状态，并保留高级 skill ids 编辑入口。
- [x] Science panel 显示折叠的 Skill Trail，展示 skill 来源、用途、状态、触发原因及关联 evidence/artifact。
- [x] 数据库 evidence 展示 endpoint、params、access date、count、pagination、identifier conversion 和 warnings。
- [x] credentialed/lab automation skills 默认可见，但在 manifest 中标记 `restricted_default` 或 `quarantined_script`，执行前必须授权。

### HPC / GPU

- [ ] Project-level SSH/Slurm profile schema。
- [ ] Remote job id/log/status/output 写入 artifact。
- [ ] 提交远程任务前需要用户批准或项目白名单。
- [ ] Modal/cloud 作为后期显式 connector。

### QA / 测试

- [ ] Science prompt snapshot test。
- [ ] MCP schema unit test。
- [ ] Science panel fixture render test。
- [ ] E2E：创建研究项目 → 提交 Science report → 点击 evidence → 打开 artifact。
- [ ] E2E：图片批注 → 生成 follow-up。
- [ ] Regression：医学循证模式不受 Science 默认开启影响。

## 15. 风险与决策

| 风险                                 | 决策                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Science scope 太大                   | 第一阶段只做项目入口、MCP report、E ledger、普通文件 artifact；viewer/HPC 后移               |
| 用户误以为 reviewer 已验证科学正确性 | M1 不显示 reviewer；后续上线时 UI 和 prompt 明确 reviewer 是 consistency/audit，不默认 rerun |
| computed claim 造假                  | system prompt + schema + artifact provenance 强制 run log/code/input/output                  |
| 专用 viewer 增大包体                 | lazy import + feature flag + 按项目模板安装                                                  |
| 外部 skills 质量参差                 | 一等内置但分执行策略：说明/路由默认启用，脚本和外部执行默认 quarantined/需授权               |
| 数据隐私                             | 项目 host 白名单、远程 job 批准、artifact 中不保存密钥                                       |
| PaperClip 科学覆盖不完整             | PaperClip 做文献/virtual artifact，领域数据库走 REST skill/MCP                               |
| HPC 凭据和队列差异                   | 只保存 profile 和命令模板，不自研调度；所有状态来自 shell/log                                |

## 16. 参考资料

- Claude Science 产品页：https://claude.com/product/claude-science
- 本地 Claude Science 素材：`docs/references/claude-science/`
- DeepScientist v1.6.0 release：https://github.com/ResearAI/DeepScientist/releases/tag/v1.6.0
- DeepScientist v1.6.0 source：https://github.com/ResearAI/DeepScientist/tree/v1.6.0
- DeepScientist Science skill：https://github.com/ResearAI/DeepScientist/tree/v1.6.0/src/skills/science
- K-Dense scientific-agent-skills：https://github.com/K-Dense-AI/scientific-agent-skills
- Auto-Empirical Research Skills：https://github.com/brycewang-stanford/Auto-Empirical-Research-Skills
- Creative Commons Attribution-ShareAlike 4.0 International：https://creativecommons.org/licenses/by-sa/4.0/legalcode
- SciAgent-Skills：https://github.com/jaechang-hits/SciAgent-Skills
- Mol\*：https://github.com/molstar/molstar
- 3Dmol.js：https://github.com/3dmol/3Dmol.js
- igv.js：https://github.com/igvteam/igv.js
- Vitessce：https://github.com/vitessce/vitessce
- Ketcher：https://github.com/epam/ketcher
- RDKit.js：https://github.com/rdkit/rdkit-js
- Nextflow：https://github.com/nextflow-io/nextflow
- Snakemake：https://github.com/snakemake/snakemake
- Slurm：https://github.com/SchedMD/slurm
- Modal client：https://github.com/modal-labs/modal-client
- Jupyter nbconvert：https://github.com/jupyter/nbconvert
- Tectonic LaTeX engine：https://github.com/tectonic-typesetting/tectonic
