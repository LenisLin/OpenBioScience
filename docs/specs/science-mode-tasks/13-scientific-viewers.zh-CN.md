# 额外任务书：科学原生 Viewer

## 1. 结论

OpenScience 应该把 Mol\*/3Dmol、igv.js、Ketcher、Vitessce 做成同一个 Science artifact preview 体系的不同“视角”，而不是新增四套独立页面。

核心实现路线：

1. 继续复用现有 `PreviewPanel`、`PreviewContext`、`ScienceArtifactWorkspace`。
2. 新增一个 `ScienceViewerRegistry`，根据 `ScienceArtifact.type`、文件扩展名和 `artifact.viewer.kind` 决定具体 viewer。
3. 扩展 `ScienceArtifact.viewer` 为 discriminated union：`structure | genome | chemical | vitessce | alignment`。
4. 新增 project-scoped local asset URL bridge。小文本文件仍可 `readFile`，但 igv.js/Vitessce 这类大数据 viewer 必须拿到可 fetch 的 URL，且要支持 Range request。
5. Agent 不直接控制前端 DOM，只通过 `science_artifact` MCP 创建/修改 artifact、viewer spec、page 和 display intent。前端按结构化对象自动打开、聚焦、渲染。

这和当前系统最契合：现有代码已经有 `science_artifact` 单工具、artifact version、page、evidence/provenance、`metadata.science.panel`、`MolecularStructureViewer` 和 Preview 包裹层，只需要扩展 viewer 契约。

## 2. 调研依据

主要参考：

- Mol\*: https://github.com/molstar/molstar
- PDBe Mol\* plugin: https://github.com/molstar/pdbe-molstar
- RCSB Mol\* plugin: https://github.com/molstar/rcsb-molstar
- 3Dmol.js: https://github.com/3dmol/3Dmol.js
- igv.js: https://github.com/igvteam/igv.js
- igv.js docs: https://igv.org/doc/igvjs/
- Ketcher: https://github.com/epam/ketcher
- Ketcher React package: https://www.npmjs.com/package/ketcher-react
- Vitessce: https://github.com/vitessce/vitessce
- Vitessce docs: https://vitessce.io/

调研结论：

| Viewer   | 适合对象                                       | 接入方式                                 | 关键约束                                           | OpenScience 优先级    |
| -------- | ---------------------------------------------- | ---------------------------------------- | -------------------------------------------------- | --------------------- |
| 3Dmol.js | PDB/mmCIF/PQR/SDF/MOL/MOL2/XYZ 快速预览        | 当前已用 `import('3dmol')`               | 轻量、够快；复杂蛋白/密度/装配能力有限             | 已完成，作为 fallback |
| Mol\*    | 蛋白结构、复合物、AlphaFold/PDB、密度/注释     | React/WebGL plugin 或 viewer app wrapper | 体积大，初始化复杂；但专业结构生物学能力强         | P2                    |
| igv.js   | BAM/CRAM/VCF/BigWig/BED/GFF/GTF                | `igv.createBrowser(div, config)`         | track 必须是 URL/indexURL；大文件需要 Range        | P1                    |
| Ketcher  | SMILES/MOL/SDF/RXN/KET/HELM/FASTA 化学结构编辑 | `ketcher-react` + `ketcher-standalone`   | 编辑会改变 artifact，必须保存为新版本              | P1                    |
| Vitessce | single-cell/spatial omics、多视图联动          | React component + config JSON            | 大体积，依赖 URL、Zarr/OME-Zarr/AnnData 转换和配置 | P2/P3                 |

## 3. 当前代码落点

现有基础已经足够承载 viewer 扩展：

- `packages/desktop/src/common/chat/science.ts`
  - 已有 `ScienceArtifactType`：`molecule`、`protein_structure`、`genome_track`、`alignment`。
  - 已有 `ScienceArtifact.viewer?: ScienceStructureViewerSpec`，但目前只覆盖结构 viewer。
  - 已有 `ScienceArtifactPage.kind` 和 `panes.type='structure_viewer'`。
- `packages/desktop/src/process/resources/builtinMcp/scienceArtifactServer.ts`
  - `science_artifact` 已支持 `reserve_id/get/list/create/patch/replace/append/version/publish/annotate/focus_page`。
  - `normalizeArtifact()` 目前会透传 `viewer`，因此前端 schema 扩展后 MCP 端不需要拆成多个工具。
- `packages/desktop/src/renderer/pages/conversation/Preview/`
  - `PreviewPanel` 已按 content type 渲染普通 viewer。
  - 当 `metadata.science.panel` 存在时，外层会包 `ScienceArtifactWorkspace`。
  - `MolecularStructureViewer` 已支持 3Dmol、选择、snapshot、send selection。
- `packages/desktop/src/renderer/pages/conversation/Preview/fileUtils.ts`
  - 目前只把 PDB/CIF/SDF/MOL 等映射到 `molecular_structure`。
  - 后续要扩展 genome、chemical、vitessce config、alignment 文件类型。

重要约束：`useLocalFilePreview()` 目前主要通过 `ipcBridge.fs.readFile` 或 image base64 读文件。这个路径不适合 BAM/CRAM/BigWig/Zarr/OME-Zarr 这类大文件，也不适合需要 `fetch(url, Range)` 的 viewer。因此必须新增 asset URL bridge。

## 4. 分层设计标准

### 4.1 底层：科研对象和证据图

底层不把 viewer 当成独立文件附件，而是把它当成 artifact 的一种可视化视角。真正可信的数据仍然是：

- `ScienceEvidenceItem`：论文、数据库记录、用户上传数据、代码、日志、验证结果、用户决策。
- `ScienceArtifact`：稳定 id、version、type、路径、hash、输入、输出、代码、环境、消息和 reviewer/validation 状态。
- `ScienceProvenanceEdge`：`evidence -> artifact -> claim -> report` 以及 `artifact v1 -> artifact v2` 的关系。
- `ScienceArtifactPage`：声明 UI 应该显示哪个 artifact、哪个 pane、用什么 layout。

viewer spec 只允许保存可复现的显示意图，例如 `kind`、`locus`、`tracks`、`focus`、`configPath`、`representation`。它不能保存短期 asset URL，也不能把“前端看到了某个形状/峰/cluster”自动升级成科学结论。任何 claim 仍必须链接 evidence id。

底层标准：

- 每个 viewer artifact 必须有稳定 id 和 version。
- 文件路径必须是 project-relative path；需要保存 hash/size 时保存到 artifact/evidence。
- 临时渲染 URL 只属于前端运行时，不进入 artifact graph、不进入 prompt、不写入报告。
- 用户在 viewer 中产生的选择、圈选、批注或 Ketcher 编辑，先形成 annotation 或 follow-up intent；只有经过 Agent 登记/版本化后才成为新的 evidence/artifact。
- 修改已有 artifact/page/viewer 前必须 `get`，然后带 `baseRevision` 做 `patch` 或 `version`。

### 4.2 后端：MCP 和安全资产服务

后端继续保持单工具架构：`science_artifact` 是唯一负责 artifact graph 的 MCP 工具，不再为 igv、Ketcher、Vitessce 分裂出多个专用 MCP。

后端职责：

- `science_artifact` 接收和保存 `viewer` spec，做基础 schema 校验和版本控制。
- `snapshot` 把 viewer 所需的 config、索引、转换脚本、日志和小型输出纳入 `.openscience/artifact-repo`。
- `publish/focus_page` 只发布结构化 Science panel，不直接调用前端库。
- 新增 `scienceAssets.createUrl` 这类 renderer-facing bridge，负责把 project-relative path 临时映射成可 fetch 的 URL。
- asset bridge 必须限制 projectRoot、短 token、过期时间、Range request、目录型 Zarr/OME-Zarr 相对资源和同源/CORS。
- 当 viewer 所需索引、reference、config、conversion evidence 缺失时，后端/前端应显示 graph warning；Agent 需要先补齐或明确说明 blocked。

后端不做的事：

- 不代替 Agent 运行分析。
- 不把 Ketcher 编辑静默覆盖原文件。
- 不把临时 URL 写入证据链。
- 不允许 viewer 访问项目目录以外的任意本地文件。

### 4.3 前端：Artifact Preview 的专业视角

前端只做“把结构化 artifact 显示得好用”。它不判断科研结论是否成立。

前端展示标准：

- 继续使用当前 Preview/ScienceArtifactWorkspace，不新建孤立的科学 dashboard。
- 中间主区域显示科学对象：结构、基因组 track、化学结构、single-cell/spatial 多视图、alignment。
- 右侧 inspector 显示 artifact id/version、输入、代码、运行日志、环境、消息、证据、provenance 和 warning。
- report 仍使用循证报告风格；viewer 只展示对象和可交互工具条，避免把长报告挤进可视化区域。
- 所有重 viewer 都 lazy import，普通文件预览不受影响。
- viewer 加载失败时 fallback 到普通文件预览、配置 JSON 和可执行修复建议。

前端交互原则：

- 选择 residue/locus/variant/cell/gene/atom 后，默认预填发送框，让用户确认再交给 Agent。
- 用户点击“保存结构/保存分子/保存视图”时，保存的是新版本或 annotation intent，不直接篡改旧 artifact。
- 页面打开/关闭由用户和 `page` spec 协同决定；Agent 不应未经授权关闭用户打开的页面。

### 4.4 智能体：声明式控制，不操作 DOM

Agent 控制 viewer 的唯一方式是写 artifact/page/viewer spec：

- 想让用户看某个对象：创建或更新 artifact，设置 `viewer.kind`，创建/聚焦 page。
- 想调整视角：`get` artifact/page 后 patch `viewer.locus`、`viewer.focus`、`viewer.configPath` 等稳定字段。
- 想登记用户批注：用 `annotate` 或创建新的 evidence/artifact version。
- 想支持 claim：链接 evidence ids，而不是引用“viewer 中看起来像”。

## 5. 统一数据模型

### 5.1 Viewer union

建议把 `ScienceArtifact.viewer` 从结构专用扩展成：

```ts
export type ScienceViewerSpec =
  | ScienceStructureViewerSpec
  | ScienceGenomeViewerSpec
  | ScienceChemicalViewerSpec
  | ScienceVitessceViewerSpec
  | ScienceAlignmentViewerSpec;

export type ScienceViewerKind = 'auto' | '3dmol' | 'molstar' | 'rcsb_molstar' | 'igv' | 'ketcher' | 'vitessce' | 'msa';
```

### 5.2 结构 viewer

保留当前字段，增加 Mol\* 所需字段：

```ts
type ScienceStructureViewerSpec = {
  kind?: 'auto' | '3dmol' | 'molstar' | 'rcsb_molstar';
  format?: 'pdb' | 'cif' | 'mmcif' | 'bcif' | 'pqr' | 'sdf' | 'mol' | 'mol2' | 'xyz' | 'unknown';
  representation?: 'auto' | 'cartoon' | 'stick' | 'sphere' | 'line' | 'surface';
  colorBy?: 'auto' | 'chain' | 'element' | 'spectrum' | 'plddt' | 'secondary_structure';
  background?: 'light' | 'dark' | 'transparent';
  assemblyId?: string;
  modelIndex?: number;
  focus?: { chain?: string; residueStart?: number; residueEnd?: number; ligand?: string; atomIds?: number[] };
  annotations?: Array<{ label: string; evidenceIds?: string[]; color?: string } & ScienceStructureSelection>;
  densityMaps?: Array<{ path: string; format?: 'ccp4' | 'dsn6' | 'mrc'; evidenceId?: string }>;
};
```

首版策略：`kind='auto'` 对 PDB/CIF 默认仍走 3Dmol；当用户需要装配、密度、复杂注释或大结构时，Agent 填 `kind='molstar'`，前端懒加载 Mol\*。

### 5.3 igv.js genome viewer

```ts
type ScienceGenomeViewerSpec = {
  kind: 'igv';
  genome?: 'hg19' | 'hg38' | 'mm10' | string;
  reference?: {
    id?: string;
    name?: string;
    fastaPath?: string;
    indexPath?: string;
    cytobandPath?: string;
  };
  locus?: string;
  tracks: Array<{
    id?: string;
    name: string;
    type?: 'alignment' | 'variant' | 'annotation' | 'wig' | 'seg' | 'bed' | 'gff' | 'custom';
    format?: 'bam' | 'cram' | 'vcf' | 'vcf.gz' | 'bed' | 'bigwig' | 'bigbed' | 'gff' | 'gtf' | 'bedgraph';
    path: string;
    indexPath?: string;
    evidenceId?: string;
    color?: string;
    height?: number;
    order?: number;
  }>;
  showRuler?: boolean;
  snapshotName?: string;
};
```

Agent 责任：

- BAM 必须有 BAI，CRAM 必须有 CRAI，VCF.GZ 必须有 TBI/CSI。
- 如果缺索引，Agent 应先运行 `samtools index` 或 `tabix`，并把命令/log 登记为 evidence。
- 若 genome 是自定义 FASTA，也必须登记 `.fai` 和 reference evidence。

前端责任：

- 把 `path/indexPath/fastaPath` 转成临时 asset URL。
- 调 `igv.createBrowser(container, config)`。
- 监听 locus/track click，提供 `Send locus to Agent`。

### 5.4 Ketcher chemical viewer

```ts
type ScienceChemicalViewerSpec = {
  kind: 'ketcher';
  format?: 'smiles' | 'mol' | 'sdf' | 'rxn' | 'ket' | 'helm' | 'fasta' | 'sequence' | 'auto';
  editable?: boolean;
  initialSmiles?: string;
  primaryPath?: string;
  service?: 'standalone' | 'remote_indigo';
  exportFormats?: Array<'smiles' | 'molfile' | 'sdf' | 'rxn' | 'ket' | 'inchi' | 'svg' | 'png'>;
  savePolicy?: 'new_version_required' | 'read_only' | 'draft_until_user_confirms';
  annotations?: Array<{ label: string; atomIds?: number[]; bondIds?: number[]; evidenceIds?: string[] }>;
};
```

首版策略：

- 默认 `service='standalone'`，使用 `ketcher-standalone`，避免依赖远程 Indigo 服务。
- `editable=true` 时不允许直接覆盖原文件；保存时创建新 artifact version。
- 保存动作生成新文件，例如 `molecules/candidate.v2.sdf`，然后预填或触发 Agent follow-up：登记 `science_artifact(action='version')`。

### 5.5 Vitessce viewer

```ts
type ScienceVitessceViewerSpec = {
  kind: 'vitessce';
  configPath?: string;
  config?: Record<string, unknown>;
  datasets?: Array<{
    uid: string;
    name: string;
    files: Array<{
      fileType: string;
      path: string;
      options?: Record<string, unknown>;
      evidenceId?: string;
    }>;
  }>;
  initialView?: 'embedding' | 'spatial' | 'heatmap' | 'genes' | 'custom';
  requiredConversions?: Array<{
    from: string;
    to: 'zarr' | 'ome-zarr' | 'anndata-zarr' | 'obsEmbedding.csv' | 'obsFeatureMatrix.zarr';
    command?: string;
    logPath?: string;
    evidenceId?: string;
  }>;
};
```

Agent 责任：

- 对 `.h5ad` 不要直接丢给前端假装 Vitessce 一定能打开；应优先转换/导出为 Vitessce 支持的 config + data layout。
- 将转换命令、输出 zarr/config、schema validation 登记为 evidence。
- 创建 `artifact.type='dataset'` 或 `artifact.type='run_bundle'`，`viewer.kind='vitessce'`，`primaryPath` 可以是 config JSON。

前端责任：

- 加载 `configPath/config`。
- 把 config 中的本地 `path` 重写为 asset URL。
- 懒加载 Vitessce，失败时展示 config JSON、数据文件和转换建议。

### 5.6 Alignment/MSA viewer

可以后置，但 schema 先留口：

```ts
type ScienceAlignmentViewerSpec = {
  kind: 'msa';
  format?: 'fasta' | 'clustal' | 'stockholm' | 'a3m' | 'auto';
  path: string;
  colorScheme?: 'clustal' | 'identity' | 'hydrophobicity';
  focus?: { sequenceId?: string; start?: number; end?: number };
};
```

## 6. 本地科学资产 URL Bridge

### 6.1 为什么必须做

当前 `ipcBridge.fs.readFile` 适合 Markdown、代码、小型 PDB、SDF，但不适合：

- BAM/CRAM/BigWig/VCF.GZ：igv.js 需要随机访问和索引。
- Zarr/OME-Zarr/tiles：Vitessce 会发大量 fetch 请求。
- 大型 mmCIF/BCIF/密度图：Mol\* 更适合 URL 加载。

因此需要一个安全的本地 URL 层。

### 6.2 建议接口

前端 bridge：

```ts
ipcBridge.scienceAssets.createUrl.invoke({
  path: 'alignments/sample.bam',
  workspace: projectRoot,
  runId,
  artifactId,
  role: 'primary' | 'index' | 'reference' | 'tile' | 'config',
  expiresInMs: 30 * 60 * 1000,
});
```

返回：

```ts
{
  url: 'http://127.0.0.1:<backendPort>/api/science-assets/<token>/sample.bam',
  expiresAt: 1780000000000,
  sizeBytes: 123456789,
  contentHash?: 'sha256:...',
  range: true
}
```

后端要求：

- 只允许 projectRoot 内部路径，禁止任意文件系统暴露。
- token 绑定 `runId/artifactId/path/role`，短时有效。
- 支持 HTTP Range：`Accept-Ranges`、`Content-Range`、`206 Partial Content`。
- 设置 same-origin/CORS 策略，只允许本应用 renderer 访问。
- 对 `.zarr/`、`.ome.zarr/` 目录支持目录内相对资源。
- token 不写入 report，不进入 LLM prompt；report 只保存相对 path 和 evidence id。

### 6.3 与证据链关系

asset URL 不是 evidence。它只是渲染通道。

证据链仍然使用：

- `ScienceEvidenceItem.path`
- `ScienceArtifact.primaryPath/inputPaths/sourcePaths/outputPaths`
- `ScienceArtifact.contentHash`
- `ScienceArtifact.execution.logPath`
- `ScienceProvenanceEdge`

这能避免 UI URL 过期后破坏 provenance。

## 7. 前端架构

### 7.1 ScienceViewerRegistry

新增：

```text
packages/desktop/src/renderer/pages/conversation/Preview/components/science-viewers/
  ScienceViewerRegistry.ts
  ScienceViewerFrame.tsx
  IgvGenomeViewer.tsx
  KetcherChemicalViewer.tsx
  MolstarStructureViewer.tsx
  VitessceDataViewer.tsx
  MsaAlignmentViewer.tsx
```

注册接口：

```ts
type ScienceViewerPlugin = {
  id: ScienceViewerKind;
  label: string;
  priority: number;
  matches: (ctx: ScienceViewerContext) => boolean;
  load: () => Promise<React.ComponentType<ScienceViewerProps>>;
  requiresAssetUrls?: boolean;
};
```

渲染流程：

1. `ScienceArtifactWorkspace` 拿到当前 `artifact`。
2. `ScienceViewerFrame` 根据 `artifact.viewer.kind` 和 `artifact.type` 选择 plugin。
3. 若 plugin 需要 URL，则调用 `scienceAssets.createUrl` 转换所有 path。
4. 懒加载 viewer。
5. viewer 加载失败时 fallback 到普通文件 preview + inspector。

### 7.2 content type 不要无限膨胀

建议 `PreviewContentType` 只新增少量：

```ts
| 'science_viewer'
| 'genome_browser'
| 'chemical_structure'
| 'single_cell_viewer'
```

但更推荐第一阶段不靠 content type 分裂，而是：

- 普通文件打开：按扩展名走已有 Preview。
- Science artifact 打开：`metadata.science.panel` 存在时由 `ScienceViewerFrame` 接管。

这样不会污染普通 Preview 逻辑，也避免每种科学对象都新增一条 `PreviewPanel` 分支。

### 7.3 UI 形态

保持当前 artifact workspace：

```text
Preview tabs / toolbar
┌──────────────────────────────────────────────┬──────────────────────┐
│ ScienceViewerFrame                           │ Artifact Inspector   │
│ Mol*/igv/Ketcher/Vitessce/standard preview   │ Overview/Inputs/...  │
└──────────────────────────────────────────────┴──────────────────────┘
```

每个 viewer 自己只有轻量工具条：

- Mol\*: representation、color、focus、snapshot、send selection。
- igv: locus input、track visibility、send locus、snapshot。
- Ketcher: edit/read-only toggle、export、save as new version。
- Vitessce: dataset/config status、view reset、send selected cells/genes/layers。

不要把完整报告塞进 viewer。完整报告仍在聊天流 `ScienceReportPanel`，右侧 inspector 负责 provenance/detail。

## 8. Agent/MCP 操作流

### 8.1 原则

Agent 对 viewer 的控制必须是声明式：

- 不说“打开 igv 并点击某处”。
- 要说“创建 artifact，viewer.kind=igv，locus=chr7:...，tracks=[...]，publish/focus”。
- 如果要改变视角，先 `get` artifact/page，拿 `baseRevision`，再 `patch viewer.locus` 或 `patch viewer.focus`。

这符合当前 system prompt：

- `science_artifact` 是单一 artifact graph control surface。
- MCP 不执行分析，只记录、读取、修改、发布和聚焦。
- 修改已有 artifact/page 前必须 `get`。

### 8.2 Agent 触发标准

Agent 不是遇到科学文件就一定打开 native viewer，而是在“原生交互明显能降低理解成本或减少错误”时调用。

| 场景                                                                       | 应调用 viewer        | 前置条件                                                                | 不应调用时                                                                |
| -------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 蛋白/分子结构检查、活性位点、链/残基/配体定位、AlphaFold/PDB 结果          | `3dmol` 或 `molstar` | 有 PDB/mmCIF/PQR/SDF/MOL/MOL2/XYZ 文件，已登记来源和解析验证 evidence   | 只是引用数据库元数据或摘要，不需要看结构                                  |
| BAM/CRAM/VCF/BED/BigWig/GFF/GTF locus 检查                                 | `igv`                | 有 genome/reference、locus、track 文件、必要 index、QC/索引 evidence    | 缺索引/缺 reference 且用户还没有授权补齐；普通表格统计可先用 report/table |
| SMILES/SDF/MOL/RXN 编辑、 scaffold 设计、反应草图、分子导出                | `ketcher`            | 有可读分子输入；若 editable，明确保存为新 artifact version              | 只需要计算 descriptor、筛选表格或展示静态图片                             |
| single-cell/spatial 多视图联动、cluster/embedding/gene/spatial region 检查 | `vitessce`           | 已生成 Vitessce config 和可 URL 访问的数据布局，转换/验证 evidence 完整 | 只有原始 `.h5ad` 且未转换；简单 UMAP PNG/CSV 足够说明                     |
| MSA/FASTA/CLUSTAL/A3M alignment 查看                                       | `msa`                | 有 alignment 文件、格式识别和来源 evidence                              | 只是序列长度/GC/简单统计，不需要逐位检查                                  |

触发时机：

- 用户明确说“打开/查看/比较/标注/编辑/圈出/定位/聚焦”科学对象。
- Agent 生成了结构、track、分子、alignment、single-cell/spatial workspace，且用户下一步很可能需要检查。
- claim 涉及具体 residue、locus、variant、cluster、gene、cell region、atom/bond，需要给用户可追溯的可视化入口。
- 需要把用户在 viewer 的选择回传给后续分析，例如“这个 peak 附近重新统计”“这个配体姿势重新导出”。

不触发时机：

- 普通 Markdown/PDF/CSV/表格预览已经足够。
- 没有可复现输入、索引、config 或 evidence，只能产生一个看似漂亮但无法辩护的视图。
- 只是为了装饰报告。viewer 必须服务于检查、修改、复现或证据链。

### 8.3 创建 Mol\* artifact

```json
{
  "action": "create",
  "target": { "kind": "artifact" },
  "payload": {
    "id": "artifact_af2_model",
    "type": "protein_structure",
    "title": "AlphaFold model for P69905",
    "version": 1,
    "primaryPath": "structures/P69905.cif",
    "sourcePaths": ["evidence/uniprot_P69905.json", "evidence/alphafold_P69905.json"],
    "evidenceIds": ["E-uniprot-P69905", "E-afdb-P69905", "E-structure-parse-P69905"],
    "viewer": {
      "kind": "molstar",
      "format": "mmcif",
      "representation": "cartoon",
      "colorBy": "plddt",
      "focus": { "chain": "A", "residueStart": 35, "residueEnd": 58 },
      "annotations": [
        {
          "label": "low-confidence loop",
          "chain": "A",
          "residueStart": 35,
          "residueEnd": 58,
          "evidenceIds": ["E-structure-parse-P69905"]
        }
      ]
    }
  }
}
```

### 8.4 创建 igv artifact

```json
{
  "action": "create",
  "target": { "kind": "artifact" },
  "payload": {
    "id": "artifact_egfr_tracks",
    "type": "genome_track",
    "title": "EGFR locus alignments and variants",
    "version": 1,
    "primaryPath": "alignments/sample.bam",
    "inputPaths": [
      "alignments/sample.bam",
      "alignments/sample.bam.bai",
      "variants/sample.vcf.gz",
      "variants/sample.vcf.gz.tbi"
    ],
    "evidenceIds": ["E-bam-qc", "E-vcf-qc", "E-reference-hg38"],
    "viewer": {
      "kind": "igv",
      "genome": "hg38",
      "locus": "chr7:55,086,724-55,275,031",
      "tracks": [
        {
          "name": "RNA-seq alignment",
          "type": "alignment",
          "format": "bam",
          "path": "alignments/sample.bam",
          "indexPath": "alignments/sample.bam.bai",
          "evidenceId": "E-bam-qc"
        },
        {
          "name": "Variants",
          "type": "variant",
          "format": "vcf.gz",
          "path": "variants/sample.vcf.gz",
          "indexPath": "variants/sample.vcf.gz.tbi",
          "evidenceId": "E-vcf-qc"
        }
      ]
    }
  }
}
```

### 8.5 创建 Ketcher artifact

```json
{
  "action": "create",
  "target": { "kind": "artifact" },
  "payload": {
    "id": "artifact_candidate_ligand",
    "type": "molecule",
    "title": "Candidate ligand scaffold",
    "version": 1,
    "primaryPath": "molecules/candidate.sdf",
    "evidenceIds": ["E-rdkit-parse", "E-chembl-template"],
    "viewer": {
      "kind": "ketcher",
      "format": "sdf",
      "editable": true,
      "service": "standalone",
      "savePolicy": "new_version_required",
      "exportFormats": ["smiles", "molfile", "sdf", "svg"]
    }
  }
}
```

当用户点击保存：

1. 前端调用 Ketcher API 导出 SDF/SMILES。
2. 写入 `molecules/candidate.v2.sdf`。
3. 预填发送框：“请登记 candidate ligand 的新版本，说明修改来源和验证需求。”
4. Agent 调 `science_artifact(action='version')`，而不是前端静默篡改 provenance。

### 8.6 创建 Vitessce artifact

```json
{
  "action": "create",
  "target": { "kind": "artifact" },
  "payload": {
    "id": "artifact_spatial_vitessce",
    "type": "dataset",
    "title": "Spatial transcriptomics Vitessce workspace",
    "version": 1,
    "primaryPath": ".openscience/viewers/spatial-vitessce.json",
    "inputPaths": ["data/spatial.ome.zarr", "data/cells.zarr", ".openscience/viewers/spatial-vitessce.json"],
    "evidenceIds": ["E-h5ad-conversion", "E-ome-zarr-validation"],
    "viewer": {
      "kind": "vitessce",
      "configPath": ".openscience/viewers/spatial-vitessce.json",
      "initialView": "spatial",
      "requiredConversions": [
        {
          "from": "data/raw.h5ad",
          "to": "anndata-zarr",
          "command": "python scripts/export_vitessce.py",
          "logPath": "logs/export_vitessce.log",
          "evidenceId": "E-h5ad-conversion"
        }
      ]
    }
  }
}
```

### 8.7 Page/focus

所有 viewer 最后都用 page 表达 UI：

```json
{
  "action": "create",
  "target": { "kind": "page" },
  "payload": {
    "id": "page_egfr_tracks",
    "title": "EGFR genome view",
    "kind": "artifact_workspace",
    "layout": "single_preview",
    "panes": [
      { "id": "viewer", "type": "preview", "target": { "artifactId": "artifact_egfr_tracks" } },
      { "id": "inspector", "type": "inspector", "target": { "artifactId": "artifact_egfr_tracks" } }
    ]
  }
}
```

然后：

```json
{
  "action": "focus_page",
  "target": { "kind": "page", "id": "page_egfr_tracks" },
  "displayIntent": "focus"
}
```

## 9. 用户交互回传

viewer 的交互不要绕过 Agent。建议所有“继续分析”都生成结构化文本到发送框：

- Mol\*: 选中 residue/ligand/chain 后，发送 artifact id、version、chain、resi、atom、evidence ids。
- igv: 发送 locus、track id、feature id、variant id、坐标范围。
- Ketcher: 发送修改摘要、导出的 SMILES/SDF 路径、是否需要登记新版本。
- Vitessce: 发送 selected cell ids、gene set、cluster、spatial region、view config hash。

如果后续要让前端直接写 annotation，可复用现有 `science_artifact(action='annotate')`，但默认还是“预填发送框，让用户确认发送”。

## 10. 实施顺序

### P0：协议和基础设施

- [x] 补齐底层、后端、前端、Agent 调用标准，并同步到 Science system prompt / skills。
- [ ] 扩展 `ScienceArtifact.viewer` union。
- [x] 扩展 `resources/skills/science/SKILL.md` 和 `science-artifact/SKILL.md`，告诉 Agent 四类 viewer 的 payload 写法。
- [ ] 新增 `ScienceViewerRegistry` 和 `ScienceViewerFrame`。
- [ ] 新增 local asset URL bridge，支持 token、projectRoot allowlist、Range request。
- [ ] 将 `artifact.viewer.kind`、`page.panes.type` 与 `ScienceArtifactWorkspace` 路由打通。

### P1：高收益 viewer

- [ ] igv.js viewer：支持 BAM/BAI、VCF.GZ/TBI、BED/GFF、BigWig，缺索引时显示可执行建议。
- [ ] Ketcher viewer：支持 SDF/MOL/SMILES 只读和编辑，保存必须新版本。
- [ ] 当前 3Dmol viewer 保持 fallback，并补充 `viewer.kind` 路由。

### P2：专业结构和 omics

- [ ] Mol\* viewer：支持 mmCIF/BCIF、assembly、focus/selection、density map 后置。
- [ ] Vitessce viewer：支持 config JSON + project asset URL rewrite，首版只打开已准备好的 config/data。

### P3：增强

- [ ] MSA/alignment viewer。
- [ ] viewer snapshot 自动成为 figure artifact。
- [ ] viewer state versioning：保存当前 locus/focus/config 为 page revision。
- [ ] reviewer 检查 viewer 与 artifact 文件、代码/log 是否一致。

## 11. 验收标准

- 初始 bundle 不包含 Mol\*/igv/Ketcher/Vitessce；所有重 viewer 懒加载。
- 普通文件预览不受影响。
- Science artifact 打开后仍能看到 Inputs、Code、Execution Log、Messages、Environment、Evidence。
- igv/Vitessce 打开本地大文件时不把整文件读入内存。
- local asset URL 只能访问项目目录下被登记的文件，并支持过期。
- viewer 选区/批注能带 artifact id/version/evidence ids 回到发送框。
- Ketcher 编辑不能直接覆盖 v1，必须创建 v2。
- 关闭 preview 后 WebGL/browser 实例释放资源，不泄漏 context。

## 12. 风险与取舍

- Mol\* 和 Vitessce 体积较大，必须 lazy import；Vitessce 可以考虑 iframe/webview 隔离。
- igv.js 对索引文件和 HTTP Range 很敏感；没有 asset bridge 会很脆。
- Ketcher 的编辑能力很强，但 provenance 风险也最大；首版必须强制 new version。
- `.h5ad` 到 Vitessce 的转换不是前端问题，必须交给 Agent/脚本完成并登记转换证据。
- viewer 不是科学结论。看到一个结构、track 或 UMAP 不等于支持 claim；claim 仍需 evidence/validation。

## 13. 真实渲染 Smoke Test

测试时间：2026-07-02。

测试位置：`output/science-viewer-smoke/`。

测试方式：单独创建一个 Vite/React smoke harness，不污染主应用依赖；用真实 npm 包和真实浏览器打开，逐项截图检查渲染结果，并运行 production build。

### 13.1 结论表

| Viewer | 实测例子 | 渲染结果 | 暴露的问题 | 集成决策 |
| --- | --- | --- | --- | --- |
| 3Dmol.js | 内联小 PDB，cartoon + residue label | 通过，canvas 正常显示 | 初版容器未设 `position: relative` 时，label/canvas 会飘出卡片并覆盖页面 | P1 继续作为结构 fallback；所有 WebGL viewer root 必须 `position: relative; overflow: hidden;` |
| Mol\* | CDN 加载 `1CRN` PDB 结构 | 通过，专业结构 viewer 效果明显好于轻量预览 | 体积大、初始化较重，适合按需加载 | P2 接入，优先用于 mmCIF/assembly/density/复杂结构 |
| igv.js | 本地 `toy.fa` + `.fai` + BED track | 通过，本地基因组 track 能显示 | 必须有可 fetch URL；真实 BAM/VCF 还需要 Range 和 index | P1 接入，但必须先做 asset URL bridge |
| Ketcher | aspirin SMILES，standalone service provider | 通过，结构编辑器能显示和导出 | 浏览器环境需要 `process/global` shim；UI 很密、依赖和 bundle 很重 | P1/P2 接入，建议只在独立编辑模式或宽预览中懒加载；保存必须新版本 |
| Vitessce | 12 个 cell 的本地 CSV UMAP embedding | 通过，scatterplot 能显示 | 默认布局会浪费右侧空间；真实 h5ad 需要先转换成 Vitessce 支持的数据 | P2 接入，先支持已准备好的 config/data，不直接生吃 h5ad |
| MSA/alignment | FASTA 多序列对齐 | 内部 fallback 通过；第三方包失败 | `biojs-vis-msa` 安装链路失败，依赖 `biojs-stat-seqs` 无可用版本 | 首版不要接入该包；先做轻量 alignment table，后续再评估维护良好的 viewer |

### 13.2 截图记录

3Dmol.js containment 修复后：

![3Dmol smoke screenshot](../../../output/science-viewer-smoke/screenshots/01-top-3dmol-fixed.png)

Mol\*：

![Molstar smoke screenshot](../../../output/science-viewer-smoke/screenshots/02-molstar.png)

igv.js：

![igv smoke screenshot](../../../output/science-viewer-smoke/screenshots/03-igv.png)

Ketcher：

![Ketcher smoke screenshot](../../../output/science-viewer-smoke/screenshots/04-ketcher.png)

Vitessce：

![Vitessce smoke screenshot](../../../output/science-viewer-smoke/screenshots/05-vitessce.png)

MSA fallback：

![MSA fallback smoke screenshot](../../../output/science-viewer-smoke/screenshots/06-msa-fallback.png)

### 13.3 浏览器状态检查

浏览器内逐项读取状态，最终结果如下：

```json
[
  { "viewer": "3dmol", "status": "Ready", "canvasCount": 1, "svgCount": 0, "controls": 0 },
  { "viewer": "molstar", "status": "Ready", "canvasCount": 1, "svgCount": 8, "controls": 12 },
  { "viewer": "igv", "status": "Ready", "canvasCount": 0, "svgCount": 0, "controls": 0 },
  { "viewer": "ketcher", "status": "Ready", "canvasCount": 0, "svgCount": 113, "controls": 103 },
  { "viewer": "vitessce", "status": "Ready", "canvasCount": 1, "svgCount": 12, "controls": 9 },
  { "viewer": "msa-fallback", "status": "Ready", "canvasCount": 0, "svgCount": 0, "controls": 0 }
]
```

这说明五个核心 viewer 都能在浏览器里真实跑起来，但 Ketcher 的交互控件数量很高，Vitessce/Mol\* 的 bundle 也很重，不能默认进入主首屏。

### 13.4 构建检查

执行 `npx vite build` 通过，但暴露出 bundle 风险：

- 主 chunk 约 `16.3 MB`，gzip 后约 `5.8 MB`。
- Ketcher 相关 chunk 约 `5.5 MB`。
- igv.js chunk 约 `1.5 MB`。
- 3Dmol chunk 约 `0.6 MB`，且构建提示 `eval` warning。
- Vitessce 依赖会拉入 higlass、neuroglancer、zstd、blosc 等大 chunk。
- `npm audit` 在 smoke harness 中报告较多漏洞，不能无脑把整套依赖并入生产主包。

工程决策：

- 主应用首屏不能同步 import 这些 viewer。
- 每种 viewer 必须单独 lazy chunk；Ketcher/Vitessce 可以进一步考虑 iframe/webview 隔离。
- `ScienceViewerFrame` 必须统一提供尺寸、loading、error、retry、fallback 和 unmount cleanup。
- 所有 viewer 容器必须固定尺寸或 `min-height`，防止加载中和渲染后布局跳动。

### 13.5 对 Agent/System Prompt 的落地标准

Agent 只有在满足以下条件时才应该声明对应 viewer：

- 结构对象：存在 PDB/mmCIF/SDF/MOL 等结构文件，或能从 PDB/AlphaFold/UniProt 明确下载并登记来源；普通小结构默认 `3dmol`，复杂结构才选 `molstar`。
- 基因组对象：必须同时登记 reference、track、index 文件；缺索引时先生成索引并把命令/log 写入 evidence，再创建 `igv` artifact。
- 化学对象：只要涉及编辑，必须设置 `savePolicy='new_version_required'`；Agent 不能要求前端覆盖原始 SDF/MOL。
- Vitessce 对象：必须先准备好 Vitessce config 和可访问的数据文件；如果输入是 `.h5ad`，Agent 要先运行转换脚本并登记转换 evidence。
- Alignment 对象：首版只用轻量 fallback 展示 FASTA/CLUSTAL；不要在 system prompt 中鼓励依赖 `biojs-vis-msa`。

### 13.6 下一步实现清单修订

- [ ] 先实现 `ScienceViewerFrame` 的统一边界样式：`position: relative`、`overflow: hidden`、稳定高度、加载态和错误态。
- [ ] 实现 project asset URL bridge，再接 igv/Vitessce。
- [ ] 把 3Dmol 从结构专用 viewer 接入 `ScienceViewerRegistry`，作为默认 fallback。
- [ ] Ketcher 先做 read-only preview，再做 editable mode 和 new-version 保存流。
- [ ] Mol\* 和 Vitessce 必须使用 lazy import；禁止出现在主 bundle。
- [ ] MSA 先实现内部轻量 viewer，支持 sticky sequence label、horizontal scroll 和 residue hover。
