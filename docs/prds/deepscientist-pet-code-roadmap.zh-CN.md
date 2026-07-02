# DeepScientist 桌面宠物代码侧改造清单

本文基于本轮外部模型评审与当前 DeepOrganiser 宠物系统源码整理，目标是让桌面宠物更稳、更有生命感，同时不打扰用户。

## P0：先修稳定性和状态时间线

### 1. AI 运行状态看门狗

用户感知：如果流式事件丢了 `finish` / `error`，宠物不应永久卡在 `thinking` 或 `working`。

涉及文件：

- `packages/desktop/src/process/pet/petEventBridge.ts`
- `packages/desktop/src/process/pet/petStateMachine.ts`
- `packages/desktop/src/process/pet/petTypes.ts`

具体做法：

- 在 `PetEventBridge` 中维护 `aiWatchdogTimer`。
- 收到 `thinking` / `thought` / `text` / `content` 时启动或刷新 120 秒看门狗。
- 收到 `finish` / `error` / `handleTurnCompleted()` 时清除看门狗。
- 看门狗触发时不要直接报错吓用户，优先 `requestState('attention')` 或 `forceState('idle')`，并记录日志；如果主会话确实有错误事件，再进入 `error`。

风险：

- 超时时间太短会打断长任务的陪伴感；建议 120 秒起步，并在后续绑定真实 agent run id 后按 run 生命周期清除。

测试：

- 单元测试模拟只发 `thinking` 不发 `finish`，推进 fake timer，断言最终回到 `idle` 或 `attention`。
- 手动断网/杀子进程，观察宠物不会永久卡住。

### 2. 状态机时间不变量测试

用户感知：状态不会被奇怪地抢占、延迟、幽灵恢复。

涉及文件：

- `packages/desktop/src/process/pet/petTypes.ts`
- `packages/desktop/src/process/pet/petStateMachine.ts`
- 新增测试：`tests/unit/process/pet/petStateMachine.test.ts`

具体做法：

- 为 `AUTO_RETURN[state].delayMs >= MIN_DISPLAY_MS[state]` 加测试断言。
- 为高优先级抢占低优先级写测试：`error` 应抢占 `working`，`dragging` 应抢占所有普通状态。
- 为同优先级 pending 写测试，明确当前语义是“最新请求覆盖旧 pending”。如果保留此语义，给 `requestState` 注释补清楚。
- 为 `forceState()` 写测试，确保会清掉 pending 和 auto return。

风险：

- 这一步主要是保护后续重构，行为不应改变。

测试：

- 使用 fake timers 覆盖 `done -> idle`、`yawning -> dozing`、`poke-left -> poke-right`。

### 3. DND 进入时回归 idle

用户感知：开启免打扰后，宠物应该安静下来，而不是停在错误、通知或完成动画上。

涉及文件：

- `packages/desktop/src/process/pet/petStateMachine.ts`
- `packages/desktop/src/renderer/pages/settings/PetSettings.tsx`

具体做法：

- `setDnd(true)` 时清 pending / auto return 后，如果当前状态不是 `idle` 且不是 `dragging`，直接 `applyState('idle')`。
- `dragging` 例外：拖拽是用户直接操作，不应被 DND 打断。
- 可以在设置页文案里把 DND 解释成“保持空闲并忽略 AI 事件”。

风险：

- 如果用户正在看一个重要通知，开启 DND 会立刻收起；这符合 DND 语义。

测试：

- 进入 `error` 后开启 DND，断言立即回 `idle` 且不会 5 秒后再触发 auto return。

### 4. SVG fallback 终极兜底

用户感知：无论资源缺失、打包漏文件还是 SVG 加载失败，宠物窗口都不能空白。

涉及文件：

- `packages/desktop/src/renderer/pet/petRenderer.ts`
- `packages/desktop/src/renderer/pet/pet.html`

具体做法：

- 将 fallback 从单个路径改成数组链：
  1. 当前风格当前状态
  2. 当前风格 `idle`
  3. `classic/idle`
  4. 内联 minimal SVG data URI
- 把 `LOAD_TIMEOUT` 从 3000ms 降到 800-1200ms，本地资源不应等 3 秒。
- 加 `loadToken` 或 `requestId`，快速连续切状态时，只允许最新加载完成的 object 接管 `currentObject`。

风险：

- `object` 的 load/error 行为在 Electron 下需要真实窗口验证。

测试：

- 临时改错一个 SVG 路径，确认回退到 `idle`。
- 连续触发 `thinking -> working -> done -> idle`，检查 DOM 中不会堆积多个旧 object。

## P1：增强生命感但控制打扰

### 5. 状态元数据集中化

用户感知：状态行为更一致，后续新增动作不容易漏掉优先级/时长/是否 AI 驱动。

涉及文件：

- `packages/desktop/src/process/pet/petTypes.ts`
- `packages/desktop/src/process/pet/petStateMachine.ts`
- `packages/desktop/src/process/pet/petIdleTicker.ts`

具体做法：

- 新增 `STATE_METADATA`：
  - `priority`
  - `minDisplayMs`
  - `autoReturn`
  - `category: 'idle' | 'ai' | 'sleep' | 'interaction' | 'system'`
  - `interruptible`
- 用 metadata 替换分散的 `STATE_PRIORITY`、`MIN_DISPLAY_MS`、`AUTO_RETURN`、`AI_DRIVEN_STATES`、`SLEEP_STATES`。
- 保留旧导出作为兼容层也可以，但源头改成 metadata。

风险：

- 这是中等规模重构，必须先有 P0 的状态机测试。

测试：

- 对比重构前后的状态转换快照。

### 6. 空闲时间线校准

用户感知：宠物安静但不僵硬；长时间不动会自然打盹、睡觉，而不是被 random-look 打断。

涉及文件：

- `packages/desktop/src/process/pet/petIdleTicker.ts`
- `packages/desktop/src/process/pet/petTypes.ts`

具体做法：

- 明确定义：
  - `nextIdleMomentAt` 是“累计 idleMs 阈值”，不是绝对时间戳。
  - random idle 只在 `idle` 且未进入 sleep timeline 前触发。
  - `YAWN_TIMEOUT` 之后暂停 random-look/read，避免睡眠链路被轻动作抢戏。
- 增加 `nextIdleMomentAt` 注释和 fake timer 测试。
- 可以把 random idle 触发概率做成：20-60 秒内小动作，60 秒后进入 sleepy phase。

风险：

- 动作太频繁会吵，太少又像贴纸。建议保留现在 20-38 秒间隔，再加 sleep phase。

测试：

- fake timer 推进 20s/60s/10min，检查状态序列。

### 7. 眼球跟随平滑和生命周期防护

用户感知：眼睛跟鼠标更自然，不会跳或看偏。

涉及文件：

- `packages/desktop/src/process/pet/petIdleTicker.ts`
- `packages/desktop/src/renderer/pet/petRenderer.ts`
- `packages/desktop/src/process/pet/petManager.ts`

具体做法：

- `computeEyeTracking` 输出前增加 `Number.isFinite` 防护。
- 对 `eyeDx/eyeDy` 做轻微 lerp 或只在变化超过 0.25 时发送，降低 IPC 抖动。
- 拖拽结束和窗口 resize 后强制刷新 `petBounds`。
- 长期方案：SVG 内声明 `data-eye-center-x/y`，`petRenderer` 读取，替代硬编码 `50/50` 与 `11/12`。

风险：

- 平滑过度会显得迟钝；lerp 系数建议 0.25-0.35。

测试：

- 大小 200/280/360 下移动鼠标，眼睛不越界。
- 拖拽后眼睛仍朝向正确。

### 8. 状态转换 ring buffer 日志

用户感知：不是直接可见，但后续定位“为什么宠物卡住/跳过状态”会快很多。

涉及文件：

- `packages/desktop/src/process/pet/petStateMachine.ts`
- `packages/desktop/src/process/bridge/systemSettingsBridge.ts` 或调试 bridge

具体做法：

- `PetStateMachine` 内维护最近 80 条状态事件：
  - time
  - prev
  - next/requested
  - reason: applied/rejected/pending/auto-return/force/dnd
- 开发模式下暴露一个 IPC 读取方法，设置页可暂不接 UI。
- 所有空 catch 至少写入 debug log，不吞掉关键信息。

风险：

- 不要在生产频繁打印 console；ring buffer 在内存中即可。

测试：

- 连续触发几类状态，读取 ring buffer，顺序和 reason 正确。

## P2：体验和美术工作流

### 9. 预加载宠物资源

用户感知：首次切到某个状态不会白一下，也不会等 timeout。

涉及文件：

- `packages/desktop/src/renderer/pet/petRenderer.ts`

具体做法：

- 启动时预创建 `Image` 或 `fetch` 所有当前风格 SVG，记录 `availableStates`。
- 风格切换时重新预加载目标风格。
- 只要发现缺资源，立即走 fallback 链，不等 object timeout。

风险：

- SVG 内 CSS 动画需要通过 `<object>` 运行；预加载只做可用性校验，不替代最终渲染。

测试：

- 删除某个状态文件后刷新，切换到该状态应立即回 idle。

### 10. 宠物“性格”设置

用户感知：用户可以选择更安静或更活泼的宠物，而不是所有人同一频率。

涉及文件：

- `packages/desktop/src/common/config/configKeys.ts`
- `packages/desktop/src/process/pet/petIdleTicker.ts`
- `packages/desktop/src/renderer/pages/settings/PetSettings.tsx`

具体做法：

- 新增 `pet.personality: 'calm' | 'balanced' | 'lively'`。
- calm：idle 小动作间隔更长，睡眠更早。
- lively：小动作更频繁，更多 attention/happy 微动作。
- balanced：保持当前默认。

风险：

- 设置太多会让页面复杂；可以先不做 UI，只保留内部参数表。

测试：

- 切 personality 后 fake timer 验证触发间隔变化。

### 11. 美术状态分组规范

用户感知：后续状态越加越多也能保持统一，不会回到图标拼贴。

涉及文件：

- `scripts/generate-deepscientist-pet-states.js`
- `public/pet-states/preview.html`

具体做法：

- 在生成脚本里把状态拆成：
  - `face`
  - `pose`
  - `ring`
  - `mark`
  - `motion`
- 给每类 face/pose/ring 写短注释，说明适用场景。
- 预览页增加状态分组筛选：AI、interaction、sleep、system。

风险：

- 脚本会变长，但比手写 21 个 SVG 更可维护。

测试：

- 每次生成后跑状态目录一致性检查和预览图渲染。

## 建议执行顺序

1. P0-2 状态机测试先落地。
2. P0-1 AI 看门狗。
3. P0-4 SVG fallback 终极兜底。
4. P0-3 DND 回 idle。
5. P1-6 空闲/睡眠时间线校准。
6. P1-7 眼球平滑与 bounds 刷新。
7. P1-8 ring buffer。
8. P1-5 状态元数据集中化。
