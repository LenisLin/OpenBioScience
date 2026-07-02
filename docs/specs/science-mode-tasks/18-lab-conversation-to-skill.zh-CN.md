# 任务书：实验室对话沉淀为 Skill

## 1. 定位

这是 Science Mode 的 P2/P3 能力，建议放在 Reviewer 之后或与 Reviewer 并行推进，不进入 M1 artifact 闭环。

M1 的核心是：Agent 能生成可追溯 artifact。  
本任务的核心是：把实验室长期积累的对话、纠偏、SOP、审稿意见、项目习惯，提炼成可审查、可版本化、可安装的 lab skill。

它不是自动记忆，也不是聊天记录摘要。产品内统一叫“沉淀模式”或“Skill 沉淀”：只把稳定、可复用、有证据支撑的工作方式沉淀成资产；保留本地私有层、可编辑文件和证据链，然后由用户决定是否安装、启用和复用。

## 2. 为什么放到第二阶段

原因：

1. 它依赖 M1 的 artifact/evidence/page 基础设施。没有稳定 artifact graph，skill 只会变成另一堆 prompt。
2. 它需要 reviewer-like 的审查机制。实验室对话里有临时偏好、未验证结论、敏感信息、个体风格和项目特例，不能直接晋升成 SOP。
3. 它会影响后续所有 Agent 行为，风险比普通 UI 或单次报告更高。
4. 它的价值来自长期 refresh 和 apply，不是一次性生成。

建议阶段：

- P2A：只做“候选 SOP 提取 + 人工 review + skill 草稿”。
- P2B：支持安装到项目 skill / 实验室 skill，并在 Science Mode prompt 中按需加载。
- P3：支持自动 refresh、冲突检测、跨项目 skill marketplace、图谱预览。

## 3. 沉淀模式与 Protocol 资产化

外部 operating-layer / memory-as-files 方案可借鉴的不是“个人画像”，而是四个工程原则。OpenScience 产品内不要出现外部项目命名，统一叫“沉淀”：

1. **File-first**：结果是 `SKILL.md`、references、claims/evidence ledger，而不是黑箱向量记忆。
2. **沉淀生命周期**：有 `init / refresh / apply` 三个阶段。第一次建立资产、后续用新材料更新、真实任务中只读取最相关资产。
3. **Promotion policy**：只晋升稳定规则，不把单次聊天、一次性情绪、临时 workaround 当成 SOP。
4. **Graph preview**：claim ledger 可以编译成 graph 和 alignment packet，供人检查来源、稳定性、scope。

Airalogy 可借鉴的是 Protocol 资产化。Airalogy 论文把跨学科研究流程拆成可定制 Protocol，并用 Protocol 生成标准化 Record；补充材料还把 Protocol 明确组织成 Markdown、Model、Assigner 三类文件，并通过编辑器、预览、语法检查和 discussion 促进协议更新。OpenScience 不需要复制 Airalogy 的 `protocol.aimd` 语法，但应该借鉴它的结构：Protocol 是独立、可组合、可版本化、可被 AI 读取和更新的研究流程资产。

迁移到实验室场景时，主体从 “owner/person” 变为：

- lab：整个实验室共用标准。
- project：某个研究项目的局部 SOP。
- domain：single-cell、结构生物学、化学信息学等领域流程。
- role：PI、postdoc、student、data analyst、reviewer 等角色视角。

## 4. 目标产物

最终生成的是一个标准 skill 目录，而不是报告：

```text
lab-skills/
  lab-single-cell-sop/
    SKILL.md
    agents/
      openai.yaml
    references/
      Protocol/
        index.md
        protocol-index.json
        single-cell-qc-and-umap.md
        figure-polish-review.md
        latex-manuscript-compile.md
      sop.md
      evidence-ledger.jsonl
      claims.jsonl
      conflicts.md
      privacy.md
      source-map.json
    scripts/
      optional-validator-or-template-tools
    assets/
      optional-report-templates
```

原则：

- `SKILL.md` 保持短，只放触发条件、核心流程、加载哪些 reference。
- 详细 SOP 放 `references/sop.md`。
- 可执行流程放 `references/Protocol/`，每个 Protocol 一个 Markdown 文件，另有 `protocol-index.json` 供检索和自进化维护。
- 每条规则有 `claims.jsonl` 和 `evidence-ledger.jsonl` 支撑。
- 任何被判定为敏感、临时、冲突、低置信的内容不进入 `SKILL.md`，只进入 review queue 或 conflicts。

### 4.1 SOP 与 Protocol 的边界

| 类型 | 作用 | 例子 | 存放位置 |
|---|---|---|---|
| SOP | 实验室稳定标准、原则、质量门槛 | “computed claim 必须有代码和日志”；“图表修改必须回到源代码” | `references/sop.md`、`claims.jsonl` |
| Protocol | 可执行、可重复、带输入输出和验证门槛的流程 | “single-cell QC + UMAP”；“LaTeX 编译和 PDF 检查”；“figure polish review” | `references/Protocol/*.md` |
| Template | 输出格式或文件骨架 | report 模板、figure caption 模板、manuscript 目录模板 | `assets/` 或 `references/templates/` |
| Script | 易错或重复的确定性操作 | protocol schema validator、skill draft compiler | `scripts/` |

SOP 回答“标准是什么”。Protocol 回答“在这个任务里怎么做，产出什么，如何验收”。

## 5. 输入来源

可选来源：

- OpenScience/DeepOrganiser 本地对话。
- Science Mode artifact graph：report、review warning、annotation、claim、methods、log。
- 飞书/Lark 群聊、会议纪要、文档、任务列表。
- 实验室 SOP 文档、README、protocol、pipeline 脚本。
- Reviewer 对话和 rebuttal 修订记录。
- 用户手动选择的一组对话或项目。

安全规则：

- 默认不扫描全量聊天。必须由用户选择项目、时间范围、会话、文档或群聊。
- 默认不保存原始私密消息到 skill。skill 只保存必要摘录、source pointer、hash、时间和证据 id。
- API key、账户、私人身份、未公开实验数据、病人/受试者信息不得进入 skill 正文。
- 如果内容只适用于某个项目，scope 必须标为 project，不得晋升为 lab-wide。

## 5A. 何时需要沉淀

系统不要主动把每段对话都写进 skill。只有出现下面信号时，才进入沉淀流程。

### 5A.1 必须沉淀为 Protocol 候选

- 用户明确说“把这个流程沉淀下来”“以后按这个做”“这是实验室标准流程”。
- 用户上传或选择了 protocol、SOP、methods、pipeline README、notebook 模板等流程文件。
- 同一类任务中出现新的稳定流程，而现有 `references/Protocol/` 没有覆盖。
- Agent 生成了一个经过验证的 workflow，包含输入、代码、日志、输出、validation，并被用户接受。
- Reviewer 多次指出同类流程缺陷，且已有稳定修复方案。
- 某个项目内的 figure、LaTeX、数据归档、marker table、QC pipeline 被反复迭代到固定格式。

### 5A.2 可以沉淀为 SOP 候选

- 规则不是步骤，而是质量标准或决策原则。
- 它影响多个 Protocol，例如 provenance、隐私、图表风格、review gate。
- 用户纠偏反复出现，并且不是一次性偏好。

### 5A.3 不应沉淀

- 单次 workaround，尤其是为绕过环境 bug、临时缺数据、赶时间而做的处理。
- 未验证科学结论，或只属于当前数据集的结论。
- 与现有 SOP/Protocol 冲突且没有人工裁决。
- 含敏感信息、密钥、私有身份、未公开样本信息。
- 只属于某个学生、某个临时审稿、某次会议语气的表达习惯。

### 5A.4 Scope 判定

- `project`：只在当前项目中出现，或含项目私有路径/样本/数据约定。
- `domain`：适用于 single-cell、protein structure、cheminformatics 等同类任务。
- `lab`：跨项目重复出现，且由用户确认是实验室标准。
- `global`：只用于真正通用的工程规则，默认不要使用。

## 6. 数据模型

### 6.1 Source

```ts
type LabSkillSource = {
  id: string;
  type:
    | 'conversation'
    | 'lark_chat'
    | 'meeting_minutes'
    | 'document'
    | 'science_artifact'
    | 'review_finding'
    | 'manual_note';
  title: string;
  projectId?: string;
  projectRoot?: string;
  uri?: string;
  localPath?: string;
  conversationId?: string;
  selectedRange?: { start?: number; end?: number };
  permission: 'user_selected' | 'project_policy' | 'manual_import';
  sensitivity: 'public' | 'internal' | 'private' | 'restricted';
  createdAt?: number;
  importedAt: number;
};
```

### 6.2 Claim

```ts
type LabSkillClaim = {
  id: string;
  subject: 'lab' | 'project' | 'domain' | 'role';
  subjectId?: string;
  dimension:
    | 'sop'
    | 'workflow'
    | 'tool_usage'
    | 'quality_bar'
    | 'review_rule'
    | 'writing_style'
    | 'figure_style'
    | 'data_policy'
    | 'privacy_rule'
    | 'correction';
  predicate: string;
  object: string;
  scope: 'global' | 'lab' | 'project' | 'domain' | 'task_family';
  scopeValue?: string;
  explicitness: 'explicit' | 'inferred';
  stability: 'candidate' | 'stable' | 'deprecated' | 'conflict';
  confidence: number;
  evidenceIds: string[];
  firstSeen: string;
  lastSeen: string;
  promotedAt?: string;
  reviewerStatus?: 'pending' | 'approved' | 'rejected' | 'needs_edit';
};
```

### 6.3 SOP Step

```ts
type LabSopStep = {
  id: string;
  title: string;
  trigger: string;
  preconditions?: string[];
  actions: string[];
  requiredArtifacts?: string[];
  requiredEvidence?: string[];
  tools?: string[];
  verification?: string[];
  failureModes?: string[];
  claimIds: string[];
};
```

### 6.4 Skill Draft

```ts
type LabSkillDraft = {
  id: string;
  name: string;
  scope: 'lab' | 'project' | 'domain';
  status: 'draft' | 'reviewing' | 'approved' | 'installed' | 'archived';
  version: string;
  sourceIds: string[];
  claimIds: string[];
  sopSteps: LabSopStep[];
  targetPath?: string;
  generatedFiles: string[];
  warnings: Array<{ code: string; message: string; targetId?: string }>;
  createdAt: number;
  updatedAt: number;
};
```

### 6.5 Protocol 文件格式

Protocol 采用 Markdown + YAML frontmatter，放在 `references/Protocol/<protocol-id>.md`。它不是 Airalogy `protocol.aimd` 的直接复刻，而是更适合 Codex/Claude Code 读取的 Protocol Markdown。

```md
---
protocol_id: single-cell-qc-and-umap
title: Single-cell QC, normalization, UMAP, and marker table
version: 0.1.0
status: candidate # candidate | approved | deprecated | conflict
scope: domain
scope_value: single-cell-rna-seq
owner: lab
created_at: 2026-07-01
updated_at: 2026-07-01
source_claim_ids:
  - claim_sc_qc_thresholds_001
source_evidence_ids:
  - LSE1
  - LSE2
supersedes: []
applies_when:
  - User asks for scRNA-seq QC, UMAP, or marker table analysis.
do_not_apply_when:
  - The task is a clinical recommendation; route to medical evidence mode.
required_inputs:
  - h5ad/count matrix or equivalent
  - species/reference genome
  - batch/grouping columns if differential analysis is requested
expected_artifacts:
  - qc_summary_table
  - umap_figure
  - marker_table
  - analysis_script_or_notebook
  - execution_log
validation_gates:
  - input schema inspected
  - package/environment checked
  - computed claims linked to script/log/output
---

# Purpose

...

# Preconditions

...

# Procedure

1. Inspect input schema and record dataset evidence.
2. Check packages and versions.
3. Run QC with explicit thresholds.
4. Generate UMAP and marker table.
5. Register artifacts and claims.

# Required Evidence

...

# Quality Gates

...

# Failure Modes

...

# Revision Notes

...
```

`references/Protocol/protocol-index.json` 维护检索和自进化状态：

```ts
type ProtocolIndexEntry = {
  protocolId: string;
  title: string;
  path: string;
  version: string;
  status: 'candidate' | 'approved' | 'deprecated' | 'conflict';
  scope: 'project' | 'domain' | 'lab' | 'global';
  scopeValue?: string;
  triggers: string[];
  sourceClaimIds: string[];
  sourceEvidenceIds: string[];
  lastAppliedAt?: string;
  lastRefreshedAt?: string;
  supersedes?: string[];
};
```

Protocol 文件必须满足：

- 标题、触发条件、适用边界和不适用边界明确。
- 至少有一个 source claim 或 source evidence。
- 关键步骤有 expected artifacts 和 validation gates。
- 如果有 computed claim，必须要求 script/log/output/environment。
- 如果是 project scope，不得写成 lab-wide 规则。
- 如果 status 不是 `approved`，Apply 时需要显式提示“候选协议”。

### 6.6 Deposition Session

Skill 沉淀不是普通聊天状态，也不是 Science artifact run。后端需要一个独立的沉淀 session，用来承载来源、候选规则、草稿、diff、review 决策和最终发布记录。

```ts
type LabSkillDepositionSession = {
  id: string;
  mode: 'init' | 'refresh' | 'apply_review';
  status: 'opened' | 'sources_selected' | 'extracting' | 'drafting' | 'reviewing' | 'published' | 'installed' | 'cancelled';
  projectRoot?: string;
  conversationId?: string;
  userInstruction: string;
  labId?: string;
  targetSkillName?: string;
  targetScope?: 'project' | 'domain' | 'lab';
  sourceScope?: {
    projectIds?: string[];
    conversationIds?: string[];
    artifactIds?: string[];
    documentUris?: string[];
    timeRange?: { start?: string; end?: string };
  };
  privacyPolicy: {
    copyRawText: false;
    redactSecrets: true;
    storePointers: true;
  };
  workingDir: string;
  createdAt: number;
  updatedAt: number;
};
```

Session 的职责：

- 记录“用户授权了哪些来源”，而不是默认扫描所有历史。
- 为每个 source、claim、protocol、draft file 分配稳定 id。
- 允许 Agent 在同一个 session 里多次读取、修改、验证、提交草稿。
- 把每次修改写入事件流，供前端生成证据链图和 diff。
- 发布或安装时只读取 session 中通过 review 的内容。

### 6.7 Deposition Report Panel

沉淀完成后，系统默认生成一个结构化“沉淀报告框”。它不是最终 skill 文件本身，而是给用户判断“是否启用 / 是否继续修改”的审查界面。数据结构建议类似循证报告的 panel，但右侧打开方式参考 Science artifact。

```ts
type LabSkillDepositionPanelData = {
  schema: 'deeporganiser.lab_skill_deposition.panel.v1';
  sessionId: string;
  targetSkillName: string;
  targetScope: 'project' | 'domain' | 'lab';
  status: 'draft_ready' | 'needs_review' | 'enabled' | 'revision_requested' | 'blocked';
  userInstruction: string;
  generatedAt: number;
  projectRoot?: string;
  summaryMarkdown: string;
  stats: {
    sources: number;
    candidateClaims: number;
    sopSteps: number;
    protocols: number;
    conflicts: number;
    privacyWarnings: number;
    draftFiles: number;
  };
  report: {
    title: string;
    sections: Array<{
      id: string;
      heading: string;
      markdown?: string;
      blocks?: Array<
        | { type: 'paragraph'; markdown: string; evidenceIds?: string[] }
        | { type: 'checklist'; items: Array<{ label: string; detail?: string; status: 'met' | 'caution' | 'blocked'; evidenceIds?: string[] }> }
        | { type: 'table'; columns: string[]; rows: string[][]; evidenceIds?: string[] }
        | { type: 'file_ref'; path: string; label?: string }
        | { type: 'protocol_ref'; protocolId: string }
      >;
    }>;
  };
  evidence: Array<{ id: string; title: string; type: LabSkillSource['type']; path?: string; uri?: string; summary?: string }>;
  draftFiles: Array<{ path: string; kind: 'skill' | 'sop' | 'protocol' | 'ledger' | 'graph' | 'other'; status: 'created' | 'patched' | 'unchanged' }>;
  protocols: Array<{ protocolId: string; title: string; status: 'candidate' | 'approved' | 'conflict'; scope: string; path: string }>;
  validation: {
    canEnable: boolean;
    blockers: string[];
    warnings: string[];
    respectsUserInstruction: boolean;
  };
  actions: {
    enable: {
      visible: boolean;
      label: '启用';
      target: 'current_project' | 'global_user' | 'lab_shared';
      requiresConfirmation: true;
      disabledReason?: string;
    };
    requestRevision: {
      visible: true;
      label: '还需要修改';
      inputPrefix: '还需要修改：';
    };
  };
};
```

报告框必须支持 Markdown 解析，但 Markdown 是内容表达，不是任意 HTML。建议复用现有 `MarkdownView`，并限制在安全 Markdown 渲染范围内。

## 7. 后端方案

### 7.1 存储位置

项目内使用单独文件夹，不混进普通 conversation 数据库，也不直接写入最终 skill。建议改成：

```text
.openscience/
  skill-deposition/
    sessions/
      <deposition-run-id>/
        session.json
        sources.jsonl
        extraction-events.jsonl
        candidate-claims.jsonl
        candidate-sop-steps.jsonl
        candidate-protocols/
          <protocol-id>.md
        review/
          privacy-warnings.jsonl
          conflicts.md
          decisions.jsonl
        draft/
          <skill-name>/
            SKILL.md
            agents/
              openai.yaml
            references/
              Protocol/
                protocol-index.json
              sop.md
              evidence-ledger.jsonl
              claims.jsonl
              conflicts.md
              privacy.md
              source-map.json
            scripts/
            assets/
        graph.json
        publish-manifest.json
  lab-skills/
    <skill-name>/
```

全局/实验室层同样拆成“沉淀工作区”和“已发布 skill”：

```text
~/.openscience/
  lab-skill-deposition/
    labs/
      <lab-id>/
        sessions/
          <deposition-run-id>/
  lab-skills/
    <lab-id>/
      <skill-name>/
```

这三个目录的边界必须清楚：

- `.openscience/skill-deposition/sessions/<id>/`：沉淀过程，包含候选内容、事件、diff 和 review，不等于已启用。
- `.openscience/lab-skills/<skill>/` 或 `~/.openscience/lab-skills/<lab>/<skill>/`：已发布但还不一定被某个 Agent runtime 加载的标准 skill 包。
- runtime skill 目录：真正安装给 Codex/Claude Code/OpenCode 使用的位置。

最终 runtime 安装位置根据运行时决定：

- Codex：`~/.codex/skills` 或项目 `.codex/skills`。
- Claude Code：`~/.claude/skills` 或项目 `.claude/skills`。
- OpenCode/OpenClaw：按它们支持的 skill 目录复制。

### 7.2 MCP/API

不建议 M1 做。P2 可以新增一个 CLI-style MCP：`lab_skill`。

```ts
type LabSkillAction =
  | 'open_session'
  | 'status'
  | 'select_sources'
  | 'ingest'
  | 'extract_claims'
  | 'detect_protocol_gaps'
  | 'draft_protocol'
  | 'patch_protocol'
  | 'validate_protocol'
  | 'review_claim'
  | 'compile_draft'
  | 'submit_report'
  | 'patch_draft'
  | 'publish_skill'
  | 'install_skill'
  | 'refresh_skill'
  | 'build_graph'
  | 'apply_packet';
```

关键规则：

- `open_session` 是沉淀会话的第一步。它接收并保存 `userInstruction`，只创建 session id 和工作目录，不扫描来源、不生成 skill。
- `select_sources` 必须由用户发起或确认。
- `ingest` 只登记 source pointer 和必要摘要，不默认复制原始全文。
- `extract_claims` 生成 candidate，不直接进入 skill。
- `detect_protocol_gaps` 对照 `references/Protocol/protocol-index.json`，发现当前任务或新来源里缺失的 Protocol。
- `draft_protocol` 可以把新 Protocol 直接写入 `references/Protocol/<id>.md`，但默认 status 为 `candidate`。
- `patch_protocol` 修改已有 Protocol 前必须读取当前版本，并生成 diff。
- `validate_protocol` 检查 frontmatter、scope、source evidence、validation gates、隐私风险。
- `review_claim` 支持逐条 approve/reject/edit。
- `compile_draft` 生成 skill 文件，但状态仍是 draft；它必须检查 SOP 是否完整、Protocol 是否可触发、SKILL.md 是否足够短。
- `submit_report` 提交 `LabSkillDepositionPanelData`，默认打开右侧沉淀报告框；这一步只展示，不等于启用。
- `publish_skill` 才写入项目 `.openscience/lab-skills/<skill>` 或全局 `~/.openscience/lab-skills/<lab>/<skill>`。
- `install_skill` 才复制/链接到 agent runtime skill 目录。
- `refresh_skill` 必须显示 diff，不自动覆盖已安装 skill。

MCP 仍然只有一个工具：`lab_skill`。不要拆成 `start_run`、`submit_panel`、`submit_protocol` 等多个工具。复杂度放在 action 和 item id 里，前端与 Agent 都围绕一个“沉淀 CLI”工作。

建议的通用参数：

```ts
type LabSkillToolInput = {
  action: LabSkillAction;
  sessionId?: string;
  projectRoot?: string;
  userInstruction?: string;
  targetSkillName?: string;
  itemKind?: 'source' | 'claim' | 'sop_step' | 'protocol' | 'draft_file' | 'review_decision';
  itemId?: string;
  patch?: unknown;
  content?: unknown;
  options?: Record<string, unknown>;
};
```

关键返回值：

```ts
type LabSkillToolResult = {
  sessionId: string;
  status: LabSkillDepositionSession['status'];
  workingDir: string;
  changedPaths?: string[];
  createdIds?: string[];
  warnings?: Array<{ code: string; message: string; targetId?: string }>;
  nextActions?: LabSkillAction[];
};
```

### 7.3 与 Science Artifact 的关系

`lab_skill` 不替代 `science_artifact`。它读 `science_artifact` 的历史：

- 哪些 reviewer warning 被反复接受。
- 哪些图表/LaTeX/报告修改被用户多次要求。
- 哪些 evidence/claim 规范被反复强调。
- 哪些 pipeline 运行方式稳定复用。

当 skill draft 生成后，可以反过来登记为 `science_artifact` 的 artifact：

- `artifact.type='skill'`
- `primaryPath='.openscience/lab-skills/lab-single-cell-sop/SKILL.md'`
- evidence 指向 source conversations 和 approved claims。

这样 skill 本身也成为可追溯 artifact。

### 7.4 当前代码迁移点

可以直接参考循证模式的实现方式，但换成 lab skill 的命名和目录：

- `packages/desktop/src/common/chat/medicalEvidence.ts` -> 新增 `packages/desktop/src/common/chat/labSkillDeposition.ts`。
- `buildMedicalEvidenceModePrompt` -> 新增 `buildLabSkillDepositionModePrompt`。
- `buildMedicalEvidenceConversationExtra` -> 新增 `buildLabSkillDepositionConversationExtra`。
- `BUILTIN_MEDICAL_EVIDENCE_NAME` -> 新增 `BUILTIN_LAB_SKILL_NAME = 'deeporganiser-lab-skill'`。
- `packages/desktop/src/process/resources/builtinMcp/medicalEvidenceServer.ts` / `researchEvidenceServer.ts` -> 新增 `labSkillServer.ts`，实现一个 CLI-style MCP tool：`lab_skill`。
- `packages/desktop/src/common/config/medicalEvidenceMcpEnv.ts` / `researchEvidenceMcpEnv.ts` -> 如需环境变量，再新增 `labSkillMcpEnv.ts`，但 P2A 尽量不需要外部 API key。
- `packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts` -> 复用循证模式注入 prompt、extra、session MCP server 的写法。

后端 P2A 最小可行范围：

- `lab_skill(open_session)`：创建 session 和 `.openscience/skill-deposition/sessions/<id>/session.json`。
- `lab_skill(select_sources)`：写入用户授权来源，支持 conversation/artifact/local document 三类即可。
- `lab_skill(ingest)`：写 `sources.jsonl` 和 `extraction-events.jsonl`，默认只存 pointer、hash、摘要和局部摘录。
- `lab_skill(extract_claims)`：写 `candidate-claims.jsonl`、`candidate-sop-steps.jsonl`。
- `lab_skill(detect_protocol_gaps)`：读取草稿或已发布 skill 的 `references/Protocol/protocol-index.json`，输出缺口。
- `lab_skill(draft_protocol)`：写 `candidate-protocols/<protocol-id>.md`。
- `lab_skill(compile_draft)`：生成 `draft/<skill-name>/SKILL.md`、`references/sop.md`、`references/Protocol/`、ledger 文件。
- `lab_skill(submit_report)`：提交沉淀报告 panel，右侧默认打开，展示摘要、证据、草稿文件、Protocol、validation 和操作按钮。
- `lab_skill(build_graph)`：生成 `graph.json`，前端可按 source -> claim -> SOP/Protocol -> draft file 画图。

## 8. Prompt / SOP 设计

### 8.0 新会话沉淀入口的 System Prompt

沉淀模式不要复用 Science Mode prompt，也不要让 Agent 误以为要开始做科研分析。它是一个独立的会话类型，建议新增：

- `packages/desktop/src/common/chat/labSkillDeposition.ts`
- `LAB_SKILL_DEPOSITION_MODE_ID = 'lab_skill_deposition'`
- `LAB_SKILL_DEPOSITION_EVENT_SCHEMA = 'deeporganiser.lab_skill_deposition.event.v1'`
- `buildLabSkillDepositionModePrompt(options)`
- `buildLabSkillDepositionConversationExtra(options)`

发送时写入：

```ts
extra: {
  lab_skill_deposition: {
    enabled: true,
    mode: 'lab_skill_deposition',
    sopVersion: 1,
    render: 'skill_deposition',
    storage: {
      projectDir: '.openscience/skill-deposition',
      publishedDir: '.openscience/lab-skills',
    },
  },
  preset_context: buildLabSkillDepositionModePrompt(...),
  preset_rules: buildLabSkillDepositionModePrompt(...),
}
```

System Prompt 核心草案：

```text
# Lab Skill Deposition Mode

You are running inside OpenScience Lab Skill Deposition Mode.
Your job is to convert user-approved conversations, project artifacts, documents, and review corrections into a reusable lab skill.
The user's sent input is the task instruction for this deposition run. Follow it when it specifies source scope, target skill name, exclusions, tone, installation boundary, or review requirements.
You are not doing a new scientific analysis unless the user explicitly asks; do not run data analysis as part of deposition.

## Mandatory Workflow
1. Open a deposition session with lab_skill(action="open_session") before creating or modifying any skill content.
2. Determine the SOP boundary before extraction:
   - target skill name
   - target scope: project, domain, or lab
   - source scope: conversations, artifacts, documents, time range
   - privacy boundary: what cannot be copied into the skill
   - whether this is init, refresh, or apply-review
3. Treat the user's visible message as binding task instruction. If it says “only use these files”, “do not install”, “only draft”, “refresh existing skill”, or “ignore old chats”, obey that boundary unless it conflicts with safety or system rules.
4. If the source scope is unclear, ask the user to confirm it. Do not scan all chats or all project files by default.
5. Use lab_skill(action="select_sources") and lab_skill(action="ingest") only for user-approved sources.
6. Extract candidate claims, candidate SOP steps, and candidate Protocols. Keep them candidate until reviewed.
7. Build a SOP Determination Memo before compiling a draft. The memo must list:
   - durable rules that should become SOP
   - executable workflows that should become Protocol
   - one-off items that must be excluded
   - conflicts and privacy risks
   - the evidence/source ids supporting each important rule
8. Write SKILL.md as a short trigger and workflow file. Put detailed SOP in references/sop.md and executable workflows in references/Protocol/*.md.
9. Every important SOP rule or Protocol must link to source claim ids and evidence ids. Do not include unsupported scientific conclusions as SOP.
10. After compiling the draft, call lab_skill(action="submit_report") with a structured deposition report panel. The report should help the user decide whether to enable now or request revision.
11. Do not overwrite an existing skill without reading it first and producing a diff.
12. Do not publish, enable, or install a skill without explicit user approval through the UI or a clear user message.
13. At the end of the turn, summarize only: session id, proposed skill name, changed paths, review blockers, and next action.

## SOP Determination Standard
- SOP means a stable standard, quality gate, policy, or decision rule that should shape future agent behavior.
- Protocol means a repeatable workflow with trigger, required inputs, expected artifacts, validation gates, and failure modes.
- A rule can enter SOP only when it is explicitly requested by the user, appears repeatedly with acceptance, comes from a formal lab document, or fixes a repeated reviewer issue.
- Project-specific rules must stay project scope. Do not silently promote them to lab scope.
- Sensitive data, credentials, private identities, patient/subject data, and unpublished sample details must be redacted or represented only as pointers.

## Output Contract
Use the lab_skill MCP to maintain the session files. The visible answer should not paste the full generated skill.
```

新会话页自动填入输入框的默认用户消息：

```text
请进入实验室对话沉淀模式。请根据我选择的研究项目、对话、文档或 artifact，整理可复用的 SOP、Protocol 和 Skill 草稿。请先确定目标 skill 名称、适用范围、来源范围和隐私边界；不要自动扫描全部历史，不要自动安装或覆盖已有 skill。请先输出需要我确认的来源范围和 SOP 边界。
```

如果当前新会话页已经选中了工作目录，可以追加：

```text
当前研究项目目录是：<workspaceDir>。请优先把沉淀工作区放在该项目的 .openscience/skill-deposition/ 下。
```

用户发送文本的规则：

- 默认文本只是模板，不是固定命令。用户可以在输入框里改写、补充或删减。
- 发送出去的最终文本必须写入 session，例如 `session.userInstruction`，并在 Agent prompt 中视为本次沉淀 run 的用户指示。
- 如果用户文本限定了来源范围、目标 skill 名称、是否只生成草稿、是否禁止安装、是否刷新已有 skill，Agent 必须遵循。
- 如果用户文本和默认模板冲突，以用户文本为准；如果和系统安全规则冲突，以系统安全规则为准，并向用户说明。
- 后续 `select_sources`、`ingest`、`compile_draft`、`publish_skill` 和 `install_skill` 都要检查 `userInstruction` 的边界，避免 Agent 越权扩大来源或提前安装。

### 8.1 三种模式

沉淀生命周期分成三个阶段：

#### Init

用于第一次从一批授权材料建立 skill。

Prompt 目标：

- 读取 source policy、privacy policy、promotion policy。
- 从材料中提取 candidate claims 和 SOP steps。
- 区分 lab-wide、project-specific、domain-specific。
- 输出 draft，不直接安装。

#### Refresh

用于用新对话或 reviewer 记录更新已有 skill。

Prompt 目标：

- 读取旧 skill、claims、conflicts。
- 只晋升重复出现或明确确认的新规则。
- 发现冲突时进入 review queue。
- 生成 diff，不静默覆盖。

#### Apply

用于真实任务中使用 lab skill。

Prompt 目标：

- 只读取当前任务相关的 skill 和 reference。
- 用 SOP 约束计划、执行、artifact 登记和 review。
- 只在出现稳定新规则时建议 refresh，不在普通任务中写回。

## 8A. 自进化机制

每个专属 lab skill 都应该可以维护和改进自己，但必须区分“自动沉淀”和“自动晋升”。

### 8A.1 自动沉淀

当 Apply 或 Refresh 发现新 Protocol 缺口时，系统可以自动做这些事：

1. 调用 `detect_protocol_gaps`，确认现有 `references/Protocol/` 未覆盖该流程。
2. 生成 `draft_protocol`，写入 `references/Protocol/<protocol-id>.md`。
3. 更新 `references/Protocol/protocol-index.json`，status 设为 `candidate`。
4. 在 `claims.jsonl` 和 `evidence-ledger.jsonl` 中记录来源。
5. 在前端 Review Queue 中显示新增 Protocol。

这就是“有新的 Protocol，之前不包含，就直接放进来”的含义：直接放进 skill draft 的 Protocol folder，但先作为 candidate 使用和审查。

### 8A.2 自动应用

候选 Protocol 可以在当前项目内被使用，但 UI 和 Agent 都必须标记：

- `candidate protocol`
- 来源 evidence
- 未晋升为 lab-wide SOP

如果用户在当前任务中明确接受它，系统可以把 stability 从 `candidate` 改为 `approved`，但 scope 仍默认保持 `project` 或 `domain`，除非用户明确说是 lab 标准。

### 8A.3 自动晋升限制

自动晋升到 `approved` 或 `lab` scope 必须满足至少一个条件：

- 用户明确批准。
- 至少两个项目中重复出现，且没有冲突。
- reviewer 多次接受同一修复规则，并且用户确认。
- 源文件本身就是实验室正式 SOP/protocol 文档。

否则只保持 candidate。

### 8A.4 Refresh 策略

`refresh_skill` 不重写整个 skill。它生成一个 refresh packet：

```ts
type LabSkillRefreshPacket = {
  skillName: string;
  previousVersion: string;
  proposedVersion: string;
  addedProtocols: string[];
  changedProtocols: string[];
  deprecatedProtocols: string[];
  newClaims: string[];
  conflicts: string[];
  privacyWarnings: string[];
  diffPaths: string[];
};
```

版本规则：

- 新增 candidate Protocol：patch version，例如 `0.3.1`。
- 新增 approved Protocol 或 SOP step：minor version，例如 `0.4.0`。
- 修改已批准 Protocol 的输入/输出/质量门槛：minor 或 major，取决于是否破坏兼容。
- 废弃 Protocol 或改变 lab-wide 标准：major version，并要求人工确认。

### 8A.5 Protocol 冲突处理

冲突不自动解决。常见冲突：

- 新 Protocol 与旧 Protocol 的输入输出不兼容。
- 新阈值覆盖旧 QC 标准。
- 项目特例试图晋升为 lab 标准。
- reviewer 规则和用户最新指令矛盾。

冲突进入 `references/conflicts.md` 和 Review Queue。Apply 时如果遇到冲突 Protocol，必须问用户或选择 scope 更窄的规则。

### 8.2 Promotion Policy

可以晋升：

- 用户明确说“以后都这样做”“实验室统一要求”。
- 多个项目中重复出现，并被用户接受的 SOP。
- reviewer 多次指出的同类错误修复规则。
- 已验证 pipeline 的标准命令、输入输出、质量门槛。
- 图表、报告、LaTeX、数据归档的稳定格式要求。

不能晋升：

- 单次临时 workaround。
- 未验证的科学结论。
- 项目私有数据、密钥、身份信息。
- 明显只属于某个学生/某次审稿/某个会议的语境。
- 和已有 SOP 冲突但未被人工裁决的规则。

### 8.3 Skill 写作模板

`SKILL.md` 建议结构：

```md
---
name: lab-single-cell-sop
description: Use for this lab's single-cell RNA-seq analysis workflow, artifact provenance, figure style, review checks, and report conventions...
---

# Lab Single-Cell SOP

## Quick Route

1. Identify species, reference genome, grouping columns, and batch variables.
2. Run package/environment checks before computed claims.
3. Register datasets, scripts, logs, figures, tables, and claims with Science artifacts.
4. Use the lab marker-table and figure conventions.
5. Run reviewer checks before final report.

## References

- For detailed pipeline steps, read `references/sop.md`.
- For accepted figure style rules, read `references/figure-style.md`.
- For evidence ledger and source mapping, read `references/evidence-ledger.jsonl` only when auditing.
```

SKILL.md 不放大段聊天摘录。具体来源进 evidence ledger。

## 9. 前端效果

主入口放在新会话页加号菜单里，不做成 Science Mode 的默认入口。用户点击“沉淀为 Skill”后，输入框自动出现一段可发送的沉淀请求；用户点击发送，才创建独立的 Skill Deposition conversation。

后续管理入口放在 Research Project 的 `Customize` / `Lab Skills` 或后续 `Review` 区，用来查看草稿、review queue、Protocol、diff 和安装状态。

### 9.0 新会话页入口

当前代码可以直接沿用循证模式的链路：

- [GuidPage.tsx](/Users/yixuan/Documents/OpenScience/packages/desktop/src/renderer/pages/guid/GuidPage.tsx)：新增 `isSkillDepositionMode` 状态、`handleStartSkillDepositionMode`、发送后 reset。
- [GuidActionRow.tsx](/Users/yixuan/Documents/OpenScience/packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx)：在加号菜单增加 `lab-skill-deposition` menu item，图标可先用 `collab-sop-skill.png` 或 `Lightning`，文案为“沉淀为 Skill”/“沉淀实验室 SOP”。
- [useGuidSend.ts](/Users/yixuan/Documents/OpenScience/packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts)：新增 `isSkillDepositionMode`、`onSkillDepositionModeSent`，发送时注入 `buildLabSkillDepositionModePrompt`、`lab_skill_deposition` extra 和内置 `lab_skill` MCP。
- `packages/desktop/src/common/chat/labSkillDeposition.ts`：新增 mode id、默认用户消息、system prompt、conversation extra builder。
- `packages/desktop/src/common/config/storage.ts`：给 conversation extra 增加 `lab_skill_deposition?: LabSkillDepositionConversationExtra`。
- `packages/desktop/src/process/resources/builtinMcp/constants.ts` 和 catalog：新增 `deeporganiser-lab-skill` 内置 MCP。

交互流程：

1. 用户在新会话页点击加号。
2. 菜单中选择“沉淀为 Skill”。
3. 输入框出现一条已填好的沉淀请求，用户可以直接发送，也可以改写。
4. 输入框上方或左下角出现一个小 chip：`沉淀为 Skill · SOP/Protocol`，带关闭按钮。
5. 选择该模式时自动关闭 `loop-goal` 和 `medical-evidence` 模式，避免多个强模式互相污染。
6. 点击发送后创建普通 conversation，但 extra 中标记 `lab_skill_deposition.enabled=true`，并自动挂载 `deeporganiser-lab-skill` 和必要时的 `deeporganiser-user-input`。
7. Agent 第一轮按 prompt 调用 `lab_skill(open_session)`，然后要求用户确认来源范围和 SOP 边界。

前端状态伪代码：

```ts
const [isSkillDepositionMode, setIsSkillDepositionMode] = useState(false);

const handleStartSkillDepositionMode = useCallback(() => {
  setIsSkillDepositionMode(true);
  setIsMedicalEvidenceMode(false);
  setIsLoopGoalMode(false);
  setLoopGoal(undefined);
  guidInput.setInput((current) =>
    current.trim() ? current : buildDefaultLabSkillDepositionUserMessage({ workspaceDir: guidInput.dir })
  );
}, [guidInput.dir, guidInput.setInput]);
```

视觉设计：

- 菜单项不做大型弹窗，保持新会话页轻量；点击后只在输入框附近给出明确模式 chip。
- chip 使用现有 rounded pill 风格，但不要像营销 badge；文字短、状态清楚、可关闭。
- chip 出现用 120-160ms 的 opacity + translateY 动画，避免页面跳动。
- 输入框中“**SOP** / **Protocol** / **Skill**”这类关键词可以复用循证报告里的半高亮加粗样式，但只用于默认说明或后续 Review 页面，不要在菜单里堆装饰。
- 发送后进入 conversation 时，首条 assistant 响应应显示一个紧凑状态条：`Skill Deposition · session opened · waiting for source scope`。
- 这不是 Science artifact 预览页；早期不需要三栏大 UI，先把“入口 -> prompt -> MCP session -> source confirmation”打通。

### 9.1 创建完成后的沉淀报告框

当 `compile_draft` 完成后，系统默认由 Agent 调用 `lab_skill(action="submit_report")`，右侧打开一个沉淀报告框。这个报告框的阅读样式参考循证报告，打开位置和侧边 inspector 参考 Science artifact。

布局建议：

```text
Conversation / Messages        Skill Deposition Report
用户和 Agent 对话              ┌ 摘要、状态、统计
                               ├ 生成了什么
                               ├ SOP 与 Protocol 判断
                               ├ 证据和来源
                               ├ 草稿文件与 diff
                               ├ 风险、冲突、隐私提醒
                               └ [启用] [还需要修改]
```

报告框左侧主阅读区：

- 顶部：目标 skill 名称、scope、状态、是否遵循用户指示。
- 摘要：用 Markdown 渲染 `summaryMarkdown`，支持加粗半高亮、列表、表格、代码路径。
- “本次沉淀了什么”：候选 SOP、Protocol、模板、ledger、graph。
- “为什么这样沉淀”：source/evidence 与 claim 的对应关系。
- “不能沉淀的内容”：一次性 workaround、隐私风险、冲突项、未验证科学结论。
- “下一步”：启用、修改、保留草稿。

报告框右侧 inspector：

- `Overview`：状态、路径、scope、版本。
- `Draft Files`：`SKILL.md`、`references/sop.md`、`Protocol/*.md`、ledger、graph，点击可打开。
- `Protocols`：candidate/approved/conflict 状态。
- `Evidence`：来源、摘要、路径、conversation/artifact 指针。
- `Validation`：blockers、warnings、是否可启用。
- `Diff`：如果是 refresh，展示旧 skill 和新草稿差异。

按钮行为：

- `启用`：只有 `validation.canEnable=true` 且没有违反 `session.userInstruction` 时可用。点击后才算用户明确授权，后端再执行 `publish_skill` 和 `install_skill`。默认 target 是当前项目；全局或实验室共享必须二次确认。
- `还需要修改`：不自动改文件，只关闭或保持报告框，并把输入框预填为 `还需要修改：`，光标放在后面。用户补充要求后发送，Agent 读取现有 session 和 draft，再调用 `patch_draft` / `patch_protocol` / `submit_report` 更新报告。

关键冲突与处理：

| 可能冲突 | 判断 | 处理 |
|---|---|---|
| “创建完成后显示报告” vs “不自动安装” | 不冲突 | 报告只是审查视图，`启用` 才是安装授权 |
| 用户开头说“只生成草稿，不要安装” vs 报告里有 `启用` | 有潜在冲突 | `validation.respectsUserInstruction=false` 或 `actions.enable.visible=false`，不展示或禁用启用按钮 |
| candidate Protocol 未人工批准 vs 启用 | 有风险 | 允许“仅当前项目启用 candidate”，但必须明显标记；lab/shared 启用需批准 |
| 存在 privacy warning 或 blocking conflict vs 启用 | 有冲突 | `canEnable=false`，按钮禁用，提示先修改 |
| 右侧报告框和 Science artifact 右侧 inspector 重叠 | 需要路由 | 同一 conversation 只聚焦一个右侧对象；用户可从 tabs/历史重新打开 |
| “还需要修改”点击后自动让 Agent 修改 | 不应该 | 只预填输入框，不自动发送，用户写清楚后再发 |

技术实现建议：

- 新增 `LabSkillDepositionPanel.tsx`，报告块渲染逻辑参考 `MedicalEvidencePanel`，右侧 inspector 和打开文件逻辑参考 `ScienceReportPanel`。
- Markdown 渲染复用 `MarkdownView`，但 report schema 仍保留结构化 blocks，避免只有一大段 markdown 导致证据和文件不能点击。
- 对话消息里可以显示一张简短完成卡，右侧区域显示完整报告；关闭右侧后回到普通对话。
- `submit_report` 的 `displayIntent` 默认为 `open`，让报告完成后自动聚焦右侧框。
- 报告框的 `启用` 操作应走前端按钮事件，再调用后端 `lab_skill(publish_skill/install_skill)`，不要让 Agent 在没有用户点击时自动调用。

### 9.2 页面结构

```text
Lab Skills
├── Installed
├── Drafts
├── Protocols
├── Review Queue
├── Conflicts
└── Sources
```

### 9.3 Skill 沉淀向导

步骤：

1. Select Sources：选择对话、会议纪要、文档、Science artifacts、review findings。
2. Privacy Scan：显示敏感风险、将被忽略的字段、source scope。
3. Extract Claims：生成候选 claims 和 SOP steps。
4. Detect Protocol Gaps：对照 `references/Protocol/` 找缺失流程。
5. Draft Protocols：自动生成或更新 Protocol Markdown。
6. Review：用户逐条 approve/reject/edit claims、SOP steps 和 Protocols。
7. Compile Draft：生成 `SKILL.md` 和 references。
8. Install：选择安装到项目、用户全局或实验室共享。

### 9.4 三栏 Review UI

```text
Sources / Evidence       Draft Skill Editor          Review / Conflicts
conversation snippets    SKILL.md preview            candidate claims
artifact graph links     references/sop.md           protocol validation
review findings          Protocol/*.md editor        conflict warnings
                         diff view                   approve/reject/edit
```

交互：

- 点击 claim 显示支持它的 source snippet 和 artifact/evidence。
- 点击 Protocol 显示 Markdown source、rendered preview、frontmatter、validation gates。
- 点击 source 可以回到原对话或 Science artifact。
- 冲突项默认不进入 skill。
- 新 Protocol 默认进入 candidate；用户可以批准为 project/domain/lab scope。
- 用户可以手工编辑 draft，保存后重新生成 validation。
- 安装前显示完整 diff 和目标路径。

### 9.5 Protocol 自进化 UI

新增一个 Protocols tab：

```text
Protocols
├── Approved
├── Candidate
├── Conflicts
├── Deprecated
└── Gap Detector
```

每个 Protocol card 显示：

- title、protocol_id、version、scope、status。
- 触发条件和不适用条件。
- 最近应用次数和最近更新时间。
- 支持它的 evidence/claim 数量。
- validation 状态。
- actions：Open、Approve、Limit Scope、Deprecate、Compare、Install。

Gap Detector 显示：

- 当前任务中出现但没有 Protocol 覆盖的流程。
- 推荐新建的 Protocol 名称和 scope。
- 证据来源。
- 自动草稿 diff。

默认行为：

- 自动发现 gap 后可以创建 candidate Protocol。
- 前端不把 candidate 混同于 approved。
- 安装或晋升前必须展示 diff。
- 用户可以一键“只在当前项目启用”，避免过早污染实验室标准。

### 9.6 Apply 体验

在 Science Mode 中：

- 新建研究项目时可以选择 “Use lab skills”。
- SendBox 或 project header 显示当前加载的 lab skill chips。
- Agent 执行任务时只加载相关 skill，不把整个实验室记忆塞进上下文。
- 如果任务中出现新稳定规则，最终报告可提示：“发现 2 条可加入 lab skill 的候选规则”，进入 Review Queue。
- 如果任务中出现未覆盖的新流程，最终报告可提示：“发现 1 个新的 Protocol 候选”，进入 Protocols/Gaps。

## 10. 验收标准

P2A：

- 新会话页加号菜单有“沉淀为 Skill”入口。
- 点击入口后输入框自动填入默认沉淀请求，并显示可关闭的 `沉淀为 Skill · SOP/Protocol` chip。
- 用户改写并发送的最终输入文本会写入 `session.userInstruction`，并约束本次沉淀 run。
- 发送后会话 extra 写入 `lab_skill_deposition.enabled=true`，system prompt 注入 `buildLabSkillDepositionModePrompt`。
- 发送后自动挂载 `deeporganiser-lab-skill` 内置 MCP。
- Agent 第一轮必须调用 `lab_skill(open_session)`，并在 `.openscience/skill-deposition/sessions/<id>/` 创建 session。
- Agent 必须先要求确认来源范围、隐私边界、目标 skill 名称和 SOP 边界。
- 用户能选择一组本地对话/文档/artifact 作为 source。
- 系统能生成 candidate claims、SOP steps、privacy warnings。
- 系统能生成 SOP Determination Memo，明确哪些内容进入 SOP、哪些进入 Protocol、哪些排除。
- 系统能生成 `references/Protocol/` 文件夹、Protocol Markdown 和 `protocol-index.json`。
- 系统能检测现有 skill 未覆盖的新 Protocol gap。
- Protocol 文件能通过 frontmatter、scope、source evidence、validation gate 检查。
- `compile_draft` 后会通过 `lab_skill(submit_report)` 打开右侧沉淀报告框。
- 沉淀报告框能渲染 Markdown、结构化 checklist/table、证据、草稿文件、Protocol、validation 和 diff 摘要。
- 报告框提供 `启用` 和 `还需要修改` 两个操作；`还需要修改` 会把输入框预填为 `还需要修改：`，但不自动发送。
- 若存在 blocking conflict、privacy warning 或用户指示禁止安装，`启用` 不可用或不展示。
- 用户能 approve/reject/edit candidate。
- 系统能编译出一个 skill draft 文件夹。
- draft 中每条重要规则都能追溯到 evidence/source。

P2B：

- 用户能把 approved draft 安装到项目或全局 skill 目录。
- Science Mode 能按需加载该 skill。
- refresh 能显示 diff 和 conflicts，不静默覆盖。
- refresh 能自动新增 candidate Protocol，但不会自动晋升 lab-wide approved。
- skill graph 页面能按 dimension、scope、stability 过滤 claims。
- Protocols tab 能按 approved/candidate/conflict/deprecated 过滤。

P3：

- 支持 Lark/飞书会议和群聊来源。
- 支持跨项目 lab-wide skill 和 project-specific skill 的冲突检查。
- 支持 reviewer 自动提出 skill 更新候选。

## 11. 风险与边界

| 风险 | 处理 |
|---|---|
| 把聊天噪声晋升成 SOP | promotion policy + 人工 review gate |
| 泄露私密信息 | source selection + privacy scan + redaction + evidence pointer |
| skill 过大导致上下文污染 | progressive disclosure，SKILL.md 短，references 按需读 |
| Protocol 越积越乱 | protocol-index + scope/status/version + validation |
| 和项目特例冲突 | scope 标注 + conflicts queue |
| Agent 自动改写已安装 skill | refresh 只出 draft/diff，安装需用户确认 |
| candidate Protocol 被误当成实验室标准 | UI 标记 candidate，Apply 时提示，lab scope 晋升需要确认 |
| 科学结论被写成 SOP | claim dimension 区分 workflow/SOP 与 scientific result，未验证结论禁止晋升 |
| 报告框展示被误解为已经启用 | 报告状态明确标为 draft/needs_review，只有点击 `启用` 才 publish/install |
| 用户明确禁止安装但 UI 仍提示启用 | `session.userInstruction` 进入 validation，禁止安装时隐藏或禁用 `启用` |
| `还需要修改` 触发自动修改 | 只预填输入框 `还需要修改：`，不自动发送、不改文件 |
| 右侧沉淀报告和 Science artifact 抢焦点 | 使用统一右侧对象路由，一次聚焦一个 panel，可从历史重新打开 |

## 12. Checklist

- [ ] 新增 `lab_skill` P2 MCP 任务书，不进 M1。
- [ ] 新增 `labSkillDeposition.ts`：mode id、默认用户消息、system prompt、conversation extra builder。
- [ ] 新增 `BUILTIN_LAB_SKILL_NAME = 'deeporganiser-lab-skill'` 和 built-in MCP catalog 配置。
- [ ] 新会话页 `GuidPage.tsx` 增加 `isSkillDepositionMode`、默认消息填充、与循证/loop goal 的互斥逻辑。
- [ ] `GuidActionRow.tsx` 加号菜单增加“沉淀为 Skill”入口和 active 状态。
- [ ] `GuidInputCard.tsx` 支持显示 `沉淀为 Skill · SOP/Protocol` chip，允许用户关闭。
- [ ] `useGuidSend.ts` 在该模式下注入 prompt、extra 和 `deeporganiser-lab-skill` MCP。
- [ ] `lab_skill(open_session)` 保存用户发送文本为 `session.userInstruction`，后续 action 必须遵守其来源、安装和输出边界。
- [ ] 新增 `.openscience/skill-deposition/sessions/<id>/` session 存储结构。
- [ ] 增加 source selection 和 privacy scan 数据模型。
- [ ] 增加 candidate claim / SOP step schema。
- [ ] 增加 SOP Determination Memo 生成与验证。
- [ ] 增加 Protocol Markdown schema 和 `references/Protocol/` 目录规范。
- [ ] 增加 `protocol-index.json` 和 Protocol validation。
- [ ] 增加 `detect_protocol_gaps`、`draft_protocol`、`patch_protocol`、`validate_protocol`。
- [ ] 增加 skill draft compiler：生成 `SKILL.md`、`agents/openai.yaml`、references。
- [ ] 增加 `submit_report` action 和 `LabSkillDepositionPanelData` schema。
- [ ] 新增 `LabSkillDepositionPanel.tsx`，复用循证报告阅读样式和 Science artifact 右侧 inspector 打开方式。
- [ ] 报告框支持 Markdown 渲染、证据/文件点击、validation 状态、`启用` / `还需要修改` 操作。
- [ ] `还需要修改` 按钮只预填输入框 `还需要修改：`，不自动发送。
- [ ] `启用` 按钮必须检查 `validation.canEnable`、privacy/conflict、`session.userInstruction` 和目标安装范围。
- [ ] 增加 review queue UI。
- [ ] 增加 Protocols tab 和 Gap Detector UI。
- [ ] 增加 claim graph preview。
- [ ] 增加 install target 管理。
- [ ] 增加 refresh diff、Protocol self-evolution 和 conflict resolution。
- [ ] 与 `science_artifact` 打通，让生成的 skill 本身也成为可追溯 artifact。

## 13. 参考来源

- Airalogy arXiv：https://arxiv.org/abs/2506.18586
- Airalogy 论文中 Protocol/Record、Protocol Workflow、Protocol Editor、Syntax Checker、Discussions 和 Hub 的设计，用于参考 `references/Protocol/` 的组织、自进化和审查流程。
- Codex skill 创建规范：本地 `skill-creator` skill。
