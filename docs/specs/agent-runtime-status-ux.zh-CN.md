# Agent 运行状态与命令输出收敛方案

## 目标

本次收敛重点解决四个体验问题：

1. 所有 `0 秒`、小于 1 秒的已处理耗时不展示。
2. SendBox 上方只保留一套运行状态，等待从发送开始即计时，切换对话后不归零。
3. 命令和工具结果尽量展示为可读输出块，不把对象结果直接暴露成大片 JSON。
4. 批量命令里存在少量失败时，不把整批摘要直接判定为失败，而是表达为“已完成 xxx，其中 x 条失败”。

## 计时逻辑

当前 `AgentSteps.tsx` 使用工具消息的 `createdAt` 推算耗时；当组件卸载或新会话切换回来时，输入框上方的状态条会重新从组件 mount 时间开始。调整后计时源分为两层：

- `ConversationRuntimeView.activeStartedAt`：运行开始时间。由 runtime store 在 `localSendStarted`、`localSendAccepted`、hydrate running runtime 时记录，并按 conversation/turn 留存。
- `AgentStep.createdAt`：工具活动时间线的局部时间。消息区用于历史回放和已完成摘要，但小于 1 秒不显示。

渲染规则：

- 运行中：展示“正在处理 · 8 秒”，从 `activeStartedAt` 开始累计。
- 已完成：只有耗时大于等于 1 秒才展示“已处理 8 秒”。
- 小于 1 秒：隐藏耗时线和耗时后缀。

## SendBox 运行状态

SendBox 内部原有 `sendbox-run-status` 只知道 `loading`，没有完整工具摘要。调整为由平台层在 SendBox 上方统一放置 `RunningAgentProgress`：

- 无工具消息但 runtime 已 busy：显示轻量等待态“正在处理”并计时。
- 有工具消息：显示当前活动摘要、todo 进度或命令/文件动作摘要。
- 这条状态只在输入框上方出现，不再在输入框内部重复出现。

## 命令输出

命令类展示按三层处理：

- 新 ACP/Codex normalized step：继续使用 `AgentCommandTool`，默认显示命令行、stdout/stderr 摘要，展开看完整输出。
- 旧 `MessageToolGroup`：增加 result adapter，识别 `command/cmd/stdout/stderr/output/exit_code` 等字段，转成命令输出块。
- 无法识别的对象：只展示少量关键字段和可折叠原始结果，避免第一眼就是大片 JSON。

## 局部失败语义

`summarizeAgentActivity` 增加失败计数：

- 全部命令失败：摘要仍为“命令执行失败”，状态为 error。
- 同批有成功也有失败：主状态保持 completed，摘要显示“执行了 n 条命令，其中 m 条失败”。
- 正在运行时有历史失败：状态仍以 running 为主，失败计数作为补充信息。

## Dark Icon

DeepScientist logo 和生成图标的 dark 版本应遵循同一原则：

- 主线条从灰黑改为纯白。
- 品牌金色点缀保留。
- 背景保持透明。
- 不使用 CSS 反相作为最终方案；CSS 只负责 light/dark 资产切换。

## 验收清单

- 发送后 1 秒内不出现“0 秒”。
- 运行 2 秒后切换到其他会话再回来，计时继续从原开始时间累计。
- SendBox 内部不再重复出现“正在处理中...”胶囊，输入框上方只有一条运行状态。
- 命令详情默认是输出块，不是裸 JSON。
- 批量命令部分失败时，摘要表达成功数量和失败数量，不把整个活动直接染成失败态。
- dark 主题下 DeepScientist logo 主体为白色线稿，加载/状态图标可辨识。
