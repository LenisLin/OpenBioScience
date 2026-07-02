---
name: lark-project-agent
version: 1.0.0
description: "DeepScientist 项目 Agent 使用飞书任务清单、任务、评论和附件进行项目推进、上下级协作、任务回流和 memory 同步时使用。"
metadata:
  requires:
    bins: ["lark-cli"]
    scopes:
      - task:task:read
      - task:task:write
      - task:tasklist:read
      - task:tasklist:write
      - task:comment:read
      - task:comment:write
      - task:attachment:read
      - task:attachment:write
---

# Lark Project Agent SOP

本 skill 用于 DeepScientist 的“项目负责人 Agent / 普通执行 Agent”在飞书任务体系中协同。Team Mode 是本地 Agent 执行运行时；飞书任务清单是外部项目队列；飞书任务是可追踪执行单元；任务评论区是可见 memory 和上下文回流；任务附件是交付物与证据。

## Team Mode 兼容层协议

负责人 Agent 分发任务时必须使用 `delegate_task` 桥接层，而不是直接用 `lark-cli task +create` 创建执行任务。

`delegate_task` 同时完成四件事：

- 在绑定的飞书任务清单中创建任务，并写入标准 Agent Card。
- 在本地状态中保存 `taskGuid`、`tasklistGuid`、`teamId`、`slotId`、`teamRunId` 和目标对象。
- 如果目标是本地 Agent，把任务发送给 Team Mode 的 teammate slot，产生真实的 child turn。
- 当 child turn 或飞书任务反馈返回时，唤醒负责人 Agent 继续判断下一步。

目标类型：

- `team_agent`：本地 Team Mode 下级 Agent。必须提供 `slotId`，建议提供人可读 `name`。
- `lark_user`：飞书联系人或下级人类协作者。必须提供 `openId`，建议提供人可读 `name`。

等待规则：

- `delegate_task` 返回成功后，负责人 Agent 应停止当前分支，等待 Team child-turn 完成事件或飞书任务评论/完成事件唤醒。
- 不要在下级尚未反馈时假设任务完成。
- 如果需要暂停某个下级 Agent，应使用 Team Mode 的 pause/child-turn 控制，不要通过删除飞书任务代替暂停。

### `delegate_task` 工具参数

负责人 Agent 在获得项目负责人批准后，使用内置 `delegate_task` 工具部署执行任务。不要自己用 `task tasks create` 代替。

必填字段：

- `tasklistGuid`：当前绑定项目的飞书任务清单 GUID。
- `sourceConversationId`：当前负责人 Agent 会话 ID。运行时身份块会直接给出这个值，必须原样传入；服务端会硬校验，非负责人会话会被拒绝。
- `targetKind`：`team_agent` 或 `lark_user`。
- `title`：短任务标题，不要手动加 `[AGENT_TASK]`，系统会为 Agent 任务添加。
- `goal`：要完成的目标。
- `context`：必要背景、上游结论、链接或来源消息。
- `deliverables`：交付物列表。
- `acceptanceCriteria`：验收标准列表。

目标字段：

- `targetKind="team_agent"` 时，必须传 `targetSlotId`，建议传 `targetName`。这会创建飞书任务并启动 Team Mode child turn。
- `targetKind="lark_user"` 时，必须传 `targetOpenId`，建议传 `targetName`。这只创建/指派飞书任务，等待人类在评论区或状态中反馈。

可选字段：

- `tasklistName`、`projectId`、`dueAt`、`priority`、`approvalRef`、`idempotencyKey`、`waitFor`。

权限规则：

- 只有负责人 Agent 可以调用 `delegate_task`。下级 Agent、普通 Agent 或人类协作者需要新增任务时，只能把建议回传给负责人，由负责人决定是否分发。
- `sourceConversationId` 与当前 Team 的 leader slot 会话不一致时，桥接层必须拒绝创建飞书任务，避免下级越权分发。
- `waitFor="first_comment"` 会监听任务评论区的新增评论。飞书任务事件没有原生评论事件时，系统会通过短周期轮询补齐唤醒。

成功后行为：

- 系统保存 `taskGuid`、`tasklistGuid`、`teamId`、`slotId/openId`、`teamRunId`。
- 系统在任务评论区写入“已收到任务”的回执。
- 对本地下级 Agent，系统把任务发送到对应 Team slot，并等待 child turn 回流。
- 负责人 Agent 在成功后必须停止该分支，等待回流，不要继续假设任务已完成。

推荐调用意图示例：

```text
delegate_task({
  tasklistGuid: "<current tasklist guid>",
  sourceConversationId: "<project leader conversation id from runtime identity>",
  targetKind: "team_agent",
  targetSlotId: "<teammate slot id>",
  targetName: "Data Analysis Agent",
  title: "Validate the current dataset assumptions",
  goal: "Check whether the dataset satisfies the approved project acceptance criteria.",
  context: "Owner approved plan v2. Read 项目元信息 and the source task comments first.",
  deliverables: ["Short validation summary", "Evidence links or files", "Blockers if any"],
  acceptanceCriteria: ["All required fields checked", "Risks listed", "Suggested next step provided"],
  waitFor: "completion"
})
```

## 项目详情源文件协议

每个项目任务清单必须维护一个名为“项目详情”的第一自定义分组。这个分组包含三条必备任务，每条任务绑定一个飞书 Markdown 原文件，并由 DeepScientist 项目页顶部三个按钮快捷打开、编辑、保存。

| 任务 | Markdown 文件 | 用途 |
| --- | --- | --- |
| 项目元信息 | `project-meta.md` | 项目目标、范围、任务描述、验收标准、关键输入、当前状态、风险限制 |
| 人事安排 | `staffing-plan.md` | 项目负责人、负责人 Agent、成员/下级 Agent、汇报关系、权限与审批边界 |
| 时间安排 | `timeline-plan.md` | 项目周期、里程碑、截止日期、检查点和时间风险 |

执行规则：

- 如果“项目详情”分组或三份 Markdown 文件不存在，系统应先自动创建默认模板，再允许负责人 Agent 或用户补充。
- 负责人 Agent 在创建、指派、关闭、拆分任务前，必须先读取或确认这三份源文件。
- 普通执行 Agent 在处理 `[AGENT_TASK]` 前，应读取相关源文件，尤其是项目元信息中的验收标准、人事安排中的权限边界、时间安排中的截止日期。
- 项目级 memory 以这三份 Markdown 为事实源；任务描述是具体任务规格；任务评论区是按时间排序的回流记录。
- 修改项目事实时，优先更新 Markdown 源文件，再调整任务描述或评论；不要只把关键决策留在隐藏上下文里。

## 角色

- 项目负责人 Agent：绑定一个任务清单，代表项目负责人推进项目。它先与负责人商讨计划，获得批准后才创建、指派、更新任务。
- 普通执行 Agent：接收一个具体任务，只负责完成该任务并在评论区回传结果，不擅自扩散任务范围。
- Human：飞书中的人类协作者。Human 任务不使用 `[AGENT_TASK]`，但仍然通过评论区反馈。

## 禁止事项

- 未获得项目负责人明确批准前，不创建、指派、关闭或批量修改飞书任务。
- 不把普通聊天误判成任务。只有明确任务意图或含 `[AGENT_TASK]` 的内容才进入任务链路。
- 不在隐藏上下文里推进项目。重要决定必须落到任务描述、评论或附件中。
- 不要求下级 Agent 私下汇报。回流必须进入原任务评论区，便于负责人 Agent 消费。

## Agent Card

负责人 Agent 创建普通执行 Agent 任务时，任务描述使用以下格式：

```text
[AGENT_TASK]
Title: <clear task title>
Owner: <target Agent or human>
Project: <project/tasklist name>
Goal: <what outcome is needed>
Context: <links, comments, source messages, prior decisions>
Inputs: <files, docs, data, constraints>
Deliverables: <expected output artifacts>
Acceptance Criteria:
- <observable criterion 1>
- <observable criterion 2>
Deadline: <date/time or none>
Return Format:
- Result
- Evidence / Links / Attachments
- Decisions Made
- Open Questions
- Risks / Blockers
- Suggested Next Step
```

## 负责人 Agent 流程

1. 计划阶段：与项目负责人确认目标、边界、联系人、上下级关系、里程碑、验收标准。
2. 审批阶段：把计划发给负责人确认。未确认前只讨论，不写飞书任务。
3. 执行阶段：通过 `delegate_task` 在绑定任务清单里创建少量清晰任务，Agent 任务必须使用 Agent Card。
4. 监听阶段：持续读取任务状态、评论和附件；下级完成后，把回流作为新的项目上下文。
5. 决策阶段：根据回流结果选择关闭、拆分、追问、转派、升级给负责人。

## 普通 Agent 流程

1. 读取任务标题、描述、评论、附件和所属任务清单。
2. 如未自动确认，在评论区写：`<名称> [Agent] 已顺利收到此任务。`
3. 如要求不清晰，先在评论区提出澄清问题。
4. 完成后按 Return Format 写评论；有文件或图片时上传为任务附件，并在评论中说明。
5. 不擅自创建下级任务；需要拆分时向负责人 Agent 建议。

## 飞书 API 使用

负责人 Agent 创建或指派执行任务时优先使用 `delegate_task`。以下 `lark-cli task` 能力用于读取、评论、附件、状态修复和人工维护：

- `task tasks get`：读取任务详情。
- `task +create` 或 `task tasks create`：仅用于人工修复、模板初始化或非执行型元信息任务；不要绕过 `delegate_task` 创建下级执行任务。
- `task +comment` 或 `api POST /open-apis/task/v2/comments`：写任务评论。
- `api GET /open-apis/task/v2/comments`：读取评论列表。
- `task +upload-attachment`：上传任务附件，单文件不超过 50 MB。
- `api GET /open-apis/task/v2/attachments`：读取附件列表。
- `task +complete` / `task +reopen` / `task +update`：更新任务状态或字段。

如果遇到权限不足，按 `lark-shared` 规则补授权。不要输出 appSecret 或 access token。
