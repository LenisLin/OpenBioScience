# 额外任务书：研究项目入口

## 1. 目标

把新会话页面从“在本地文件夹中工作”升级为“研究项目”。用户可以选择已有研究项目或新建研究项目。Science Mode 默认开启，医学循证模式与其平行。

## 2. 当前基础

已有可复用代码：

- `GuidWorkspaceFootnote.tsx` 已支持选择目录、最近 workspace、清除 workspace。
- `GroupedHistory/index.tsx` 已有 Projects section，并可在项目下新建会话。
- `GroupedHistory/utils/groupingHelpers.ts` 已按 `custom_workspace` 分组。
- 会话 `extra` 已能保存 `custom_workspace` 等信息。

## 3. 新对象

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
  scienceEnabled: boolean;
};
```

项目目录：

```text
.openscience/
  project.json
  runs/
  artifacts/
  reports/
  exports/
```

## 4. UI 改动

- `GuidWorkspaceFootnote` 文案改为“研究项目”。
- 下拉中显示：
  - 最近研究项目
  - 新建研究项目
  - 选择已有文件夹作为研究项目
  - 不使用研究项目
- 若选择空目录，初始化 `.openscience/project.json`。
- 若选择旧 workspace，没有 `.openscience`，提示是否升级为研究项目。

## 5. 会话行为

- 有研究项目：Science Mode 默认注入。
- 无研究项目：可普通聊天，不写 `.openscience`。
- 医学循证模式：仍可在研究项目中运行，但 report SOP 用医学循证。

## 6. 验收标准

- 新会话入口显示“研究项目”。
- 可选择最近项目并创建会话。
- 可新建项目目录并生成 `.openscience/project.json`。
- 侧边栏按研究项目分组。
- 项目下新建会话继承同一 rootPath。
- 旧 workspace 可平滑升级，不丢历史会话。

## 7. 风险

- 改名影响既有用户认知：内部字段可暂时沿用 `workspace`，UI 先升级。
- 项目 manifest 和数据库双写可能不一致：M1 以会话 extra 为真，manifest 为辅助。
- “默认开启 Science”不能影响普通聊天性能：只有项目会话注入完整 prompt/MCP。

