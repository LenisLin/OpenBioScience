# 额外任务书：图片直接批注与自然语言迭代

## 1. 目标

用户打开 figure artifact 后，可以直接圈选局部区域并写批注，例如“这些标签太小”“右侧 legend 挡住了点”“把 y 轴改成 log scale”。提交后系统生成一条结构化 follow-up，让 Agent 回到生成图的代码或源数据中修改，而不是只在 PNG 表面涂改。

## 2. 范围

首版只支持 image preview 上的矩形/自由框批注。PDF 页面、HTML 图、notebook cell 输出后置。

## 3. 数据结构

```ts
type ScienceAnnotation = {
  id: string;
  runId: string;
  artifactId: string;
  artifactVersion: number;
  filePath: string;
  kind: 'rectangle' | 'freehand' | 'point';
  region: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    points?: Array<{ x: number; y: number }>;
    coordinateSystem: 'normalized';
  };
  comment: string;
  createdAt: number;
};
```

坐标统一用 normalized，避免图片缩放导致坐标失效。

## 4. 前端改动

涉及：

- `PreviewPanel.tsx`
- image preview renderer
- `PreviewContext.tsx`
- 新增 `ArtifactAnnotationOverlay.tsx`
- 新增 `ArtifactAnnotationToolbar.tsx`

交互：

1. 打开带 `scienceArtifactId` 的图片。
2. Toolbar 出现批注按钮。
3. 用户拖拽创建区域，输入 comment。
4. 提交后调用事件构造器，把批注插入 sendbox 或直接发送 follow-up。

生成的 follow-up 文本建议：

```text
请根据这个 figure artifact 批注修改结果：
- artifactId: fig_umap_1
- version: 2
- file: /.../figures/umap.png
- region: normalized x=0.62 y=0.18 w=0.21 h=0.14
- comment: 这些 cluster label 太小，和点重叠。请回到生成图的代码修改字体/避让，并重新生成 artifact。
```

## 5. MCP 工具

后置新增：

- `science_register_annotation`

作用是登记批注，不执行修改。Agent 后续运行代码并生成新 artifact version。

## 6. Agent Prompt

Science prompt 增加：

- 收到 annotation 时必须定位源代码或源 notebook。
- 优先修改生成代码、参数或源文稿。
- 重新生成图后必须登记新 artifact version。
- 如果找不到源代码，只能提出限制，不能假装已经改源码。

## 7. 验收标准

- 图片 preview 可进入批注模式。
- 用户画框、输入文字、提交。
- follow-up 包含 artifact id、版本、文件路径、normalized region、comment。
- Agent 重新生成 artifact 后，ledger 中出现新版本。
- 旧版本仍可查看，不能被覆盖。

## 8. 风险

- 坐标和图片实际尺寸不一致：必须用 normalized 并记录原始 naturalWidth/naturalHeight。
- 用户期望“直接修图片”：UI 文案要把批注定位为“修改源结果”的请求。
- figure 没有源码：需要明确提示该批注只能作为人工编辑建议。

