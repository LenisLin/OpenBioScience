# 额外任务书：Notebook、PDF、Manuscript 导出

## 1. 目标

把 Science Panel 和 artifact ledger 导出为可交付科研产物：notebook、PDF、Markdown/LaTeX manuscript、run bundle。

## 2. 导出类型

| 导出 | 首版建议 | 工具 |
|---|---|---|
| Markdown report | P1 | 直接由 panel 渲染/序列化 |
| HTML report | P1 | Markdown + CSS |
| PDF report | P1 | HTML print/export 优先 |
| Jupyter notebook | P1/P2 | nbformat/nbconvert |
| LaTeX manuscript | P2 | Tectonic 或 latexmk |
| Run bundle | P1 | zip `.openscience/runs/<runId>` 和 artifact manifest |

## 3. 输出目录

```text
.openscience/
  exports/
    <runId>/
      report.md
      report.html
      report.pdf
      analysis.ipynb
      manuscript.tex
      run-bundle.zip
      export-manifest.json
```

## 4. Export Manifest

```ts
type ScienceExportManifest = {
  runId: string;
  exportedAt: number;
  exports: Array<{
    type: 'markdown' | 'html' | 'pdf' | 'notebook' | 'latex' | 'run_bundle' | 'git_bundle';
    path: string;
    contentHash?: string;
    sourcePanelPath?: string;
    artifactIds: string[];
    evidenceIds: string[];
  }>;
};
```

## 5. 前端

在 `ScienceReportPanel` 顶部或 overflow menu 提供导出：

- Export Markdown
- Export HTML/PDF
- Export Run Bundle
- Export Notebook
- Export Manuscript

首版只启用已经实现的类型，未实现项可展示 disabled + tooltip。

## 6. 后端/API

不要把导出放进 renderer。新增 process bridge：

- `scienceExport.exportMarkdown`
- `scienceExport.exportHtml`
- `scienceExport.exportPdf`
- `scienceExport.exportBundle`

后续再接：

- `scienceExport.exportNotebook`
- `scienceExport.exportLatex`

## 7. Notebook 生成策略

首版 notebook 不是重建完整交互历史，而是把 run 中的脚本、命令、主要输出组织成 notebook：

1. Markdown cell：任务、环境、摘要。
2. Code cell：脚本内容或命令。
3. Markdown cell：artifact/evidence 引用。
4. Output cell：图片/table preview。

若没有可读代码，notebook export 应标记 partial。

## 8. 验收标准

- Science panel 能导出 Markdown。
- Markdown 中保留 E1/E2、artifact list、methods、limitations。
- Bundle 中包含 panel.json、events.jsonl、artifact index、可用文件引用。
- `run-bundle.zip` 必须来自冻结 artifact git commit，而不是当前工作区文件；其中包含 `runs/<runId>/panel.json`、`events.jsonl`、artifact manifest、files.json 和已复制的小文件。
- PDF 导出不遮挡文字，表格不横向溢出。
- 导出后生成的文件也登记为 artifact/export。

## 9. 风险

- LaTeX 环境复杂：P2，先做 Markdown/HTML/PDF。
- Notebook 可能误导为“可完全复现”：需要 manifest 标记是否 complete。
- 大数据文件打包会太大：bundle 首版只打包 manifest + 小文件，大文件用路径/哈希引用。

## 10. 2026-07-02 导出审计与端到端测试

### 10.1 已审计的导出入口

| 入口 | 覆盖内容 | 当前结论 |
| --- | --- | --- |
| Science 报告 `Export` 按钮 | `manifest`、`panel`、`markdown`、`html`、`pdf`、`notebook`、`latex`、`run_bundle` | 已接入；PDF 由 Electron bridge 从 HTML 打印，其他类型由 artifact git service 生成 |
| `scienceArtifactArchive.export` bridge | Electron 主进程导出 API | 已端到端测试；会生成 PDF 并回写 manifest |
| `exportScienceArtifactSnapshot` service | 冻结 commit 的导出核心 | 已单元测试；不读当前工作区脏文件，只从 artifact git commit 生成 |
| `git_bundle` | 完整 artifact git 历史 | 已测试，但不作为普通 Export 按钮默认项，适合作为后续高级导出 |

### 10.2 发现并修复的问题

1. 旧实现没有默认导出 `run-bundle.zip`，导致报告/Markdown/notebook/LaTeX 存在，但 artifact snapshot 小文件和 `events.jsonl` 没有作为交付包出现。
   - 修复：新增 `run_bundle` export type。
   - 生成方式：`git archive --format=zip --output run-bundle.zip <sourceCommit> runs/<runId>`。
   - 好处：bundle 来自冻结 commit，不会混入当前工作区后续改动。

2. PDF 是 Electron bridge 后置生成的，旧 manifest 不会记录 `report.pdf`。
   - 修复：PDF 成功或失败后，bridge 会回写 `export-manifest.json` 的 `exports` 列表，并刷新 manifest hash。

3. 旧测试只验证 Markdown/manifest 这类文本导出，无法发现 run bundle 缺失。
   - 修复：扩展单元测试，新增 Electron E2E 测试。

### 10.3 当前导出文件约定

```text
.openscience/exports/<runId>/<exportId>/
  export-manifest.json
  panel.json
  report.md
  report.html
  report.pdf
  analysis.ipynb
  manuscript.tex
  run-bundle.zip
  artifact-history.bundle        # 高级导出/测试覆盖，普通按钮暂不默认请求
```

`run-bundle.zip` 至少应包含：

```text
runs/<runId>/panel.json
runs/<runId>/events.jsonl
runs/<runId>/artifacts/<artifactId>/v<version>/artifact.json
runs/<runId>/artifacts/<artifactId>/v<version>/files.json
runs/<runId>/artifacts/<artifactId>/v<version>/files/<role>/<filename>
```

### 10.4 真实测试记录

已执行：

```bash
npm test -- tests/unit/process/scienceArtifactGitStore.test.ts
```

结果：

- 1 个测试文件通过。
- 3 个测试通过。
- 覆盖真实临时项目、artifact git snapshot、`run-bundle.zip`、`artifact-history.bundle`、manifest、Markdown、HTML、notebook、LaTeX。
- 用 `unzip -l run-bundle.zip` 确认 bundle 内包含 `panel.json`、artifact manifest 和 copied artifact 文件。

已执行：

```bash
npm run package
E2E_DEV=1 npx playwright test --config playwright.config.ts tests/e2e/features/science/science-export.e2e.ts --reporter=list
```

结果：

- Electron E2E 1 个测试通过。
- 通过 renderer IPC 调用 `science-artifact-archive:export`，实际进入主进程 bridge。
- 检查了 `report.pdf` 文件存在、非空，且文件头为 `%PDF`。
- 检查了 manifest 中包含 `markdown/html/pdf/notebook/latex/run_bundle/git_bundle`。
- 检查了 `run-bundle.zip` 内包含冻结 run 的 `panel.json` 和 artifact 文件。

构建说明：

- `npm run package` 成功。
- 构建输出有常见 chunk size warning，不影响本次导出功能验证。
