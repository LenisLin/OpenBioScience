# 额外任务书：Science Reviewer

## 1. 目标

在 artifact 完成后提供背景 reviewer 检查，帮助科学家发现引用错误、无法追溯数字、图表和底层代码不一致、环境缺失、结论过度外推等问题。

Reviewer 不重新跑分析，不保证消除错误。它是审计层，不是科研结论裁判。

## 2. 输入

- `SciencePanelData`
- `.openscience/runs/<runId>/events.jsonl`
- artifact 列表、evidence 列表、provenance nodes
- 可读的代码、日志、表格、图像路径
- 可选 PaperClip 检索结果

## 3. 输出 Schema

```ts
type ScienceReviewFinding = {
  id: string;
  severity: 'info' | 'warning' | 'error';
  category:
    | 'missing_evidence'
    | 'untraceable_number'
    | 'figure_code_mismatch'
    | 'citation_mismatch'
    | 'environment_gap'
    | 'stale_artifact'
    | 'overclaim'
    | 'reproducibility_gap';
  title: string;
  detail: string;
  evidenceIds?: string[];
  artifactIds?: string[];
  suggestedAction?: string;
};

type ScienceReviewReport = {
  schema: 'deeporganiser.science.review.v1';
  runId: string;
  generatedAt: number;
  status: 'passed' | 'warnings' | 'failed';
  findings: ScienceReviewFinding[];
  checked: {
    citations: boolean;
    numbers: boolean;
    figureCodeLinks: boolean;
    environment: boolean;
    artifactHashes: boolean;
  };
};
```

## 4. MCP 工具

新增到 `scienceServer.ts`，但不进核心 M1：

- `science_submit_review`
- `science_attach_review_finding`

如果 reviewer 是同一个 agent 触发，则由 prompt 要求先读取 panel，再调用 submit。若将来有后台 reviewer agent，可复用同一 schema。

## 5. 前端

在 `ScienceReportPanel` 增加 `Review` tab 或折叠区：

- 顶部显示 `Passed / Warnings / Failed`。
- findings 按 severity 分组。
- 点击 finding 打开相关 artifact/evidence。
- 对 `figure_code_mismatch` 展示图、代码、日志三条路径。

不要把 reviewer 输出混进报告正文。报告正文是科学叙述，review 是审计。

## 6. 检查规则

M1 reviewer 后置版本应至少检查：

- 报告中所有 `[E#]` 是否存在于 evidence ledger。
- 所有数字是否来自 evidence、table、command log 或 artifact metadata。
- 每个 figure artifact 是否有 source code 或生成命令。
- 每个 table artifact 是否有数据源路径。
- 每个 computed claim 是否有 command/code/log。
- 每个 artifact hash 是否仍匹配当前文件。
- 环境信息是否包含 Python/R 版本或 lockfile。

## 7. 验收标准

- 能对一个已提交的 SciencePanel 产生 review report。
- UI 能渲染 warning/error 并跳转到对应 evidence/artifact。
- 删除一个 artifact 文件后，review 能标记 stale/missing。
- 报告中引用不存在的 `[E99]` 时，review 能报错。
- reviewer 说明“未重新运行分析”，不误导用户。

## 8. 风险

- Reviewer 容易过度自信：必须在 schema 和 UI 中显示 checked scope。
- Reviewer 若直接读大文件会卡 UI：只读 metadata、preview、hash，重分析必须由用户明确要求。
- 图和代码是否匹配很难自动证明：M1 只检查链接和 hash，不声称语义一致。

