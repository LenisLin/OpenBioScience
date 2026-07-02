# 额外任务书：Artifact 版本、Provenance 历史与 Diff

## 1. 目标

让每个 artifact 都能版本化、可追溯、可比较。用户几个月后打开项目，能知道某张图、某个 notebook、某份 manuscript 是由哪些输入、代码、命令和环境生成的。

## 2. M1 与后续边界

核心任务 M1 只要求 artifact 带 `version`、`contentHash`、`evidenceIds`、`provenanceNodeIds`，并在 `.openscience` 写 append-only events。

本任务负责更完整的历史能力：

- artifact timeline
- version diff
- stale detection
- DAG view
- history restore
- file watcher/hash refresh

## 3. Event Log

```ts
type ScienceArtifactEvent =
  | { type: 'artifact.created'; artifact: ScienceArtifact; timestamp: number }
  | { type: 'artifact.versioned'; artifactId: string; fromVersion: number; toVersion: number; timestamp: number }
  | { type: 'artifact.hash_changed'; artifactId: string; version: number; oldHash: string; newHash: string; timestamp: number }
  | { type: 'provenance.node_added'; node: ScienceProvenanceNode; timestamp: number }
  | { type: 'review.submitted'; reviewId: string; timestamp: number };
```

存储：

```text
.openscience/artifacts/index.jsonl
.openscience/runs/<runId>/events.jsonl
.openscience/runs/<runId>/panel.json
```

## 4. UI

Artifact card 增加：

- version badge
- hash status
- history menu
- compare with previous
- open source code
- open inputs
- open execution log

Provenance Drawer 增加：

- Inputs
- Code
- Command
- Environment
- Outputs
- Evidence
- Review
- Messages

## 5. Diff

首版 diff：

- text/code/markdown：现有 diff preview。
- CSV/table：行列数、列名变化、前 N 行 diff。
- image：显示两个版本并排 + 基本尺寸/hash；像素 diff 后置。
- PDF/manuscript：先展示文件版本和 hash，语义 diff 后置。

## 6. Stale Detection

如果文件 hash 与登记 hash 不一致：

- UI 标记 `stale`。
- evidence confidence 不自动改变，但 reviewer 可报告。
- 用户可以选择“登记为新版本”或“忽略外部修改”。

## 7. 验收标准

- 同一 artifact 生成两次后显示 v1/v2。
- v1/v2 可以分别打开。
- 修改本地文件后 hash status 显示 stale。
- text artifact 可以打开 diff。
- provenance drawer 能列出输入、代码、命令、输出。

## 8. 风险

- 文件 watcher 在大项目上成本高：默认只 watch `.openscience` 和已登记 artifact 文件。
- Hash 大文件耗时：大于阈值时异步计算或只记录 size/mtime。
- DAG view 容易复杂：先做列表式 provenance，再做图。

