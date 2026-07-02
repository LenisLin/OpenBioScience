# 额外任务书：HPC、SSH、Slurm、Modal 远程任务

## 1. 目标

支持科学家在本机、SSH Linux box、HPC login node、Modal/cloud VM 上运行任务时，Science Mode 能记录任务、状态、日志、输出和 artifact，而不是替代现有 runner。

## 2. 核心原则

- 不自研执行器。
- SSH、sbatch、squeue、sacct、tail logs、modal run 等仍由现有 shell/agent runner 执行。
- Science MCP 只登记 remote job metadata、命令、日志路径、输出路径、状态。
- 任何新 host、远程 job、credential 使用都应走用户批准或现有权限机制。

## 3. Remote Job Schema

```ts
type ScienceRemoteJob = {
  id: string;
  runId: string;
  kind: 'ssh' | 'slurm' | 'modal' | 'cloud_vm';
  host?: string;
  schedulerJobId?: string;
  command?: string;
  submitCommand?: string;
  statusCommand?: string;
  logPaths?: string[];
  outputPaths?: string[];
  status: 'submitted' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  submittedAt?: number;
  updatedAt?: number;
  evidenceIds?: string[];
  artifactIds?: string[];
};
```

## 4. MCP 工具

后置新增：

- `science_register_remote_job`
- `science_update_remote_job`
- `science_attach_remote_log`

这些工具不提交 Slurm，不 SSH，不 Modal run。

## 5. UI

ScienceReportPanel 增加 Run/Jobs 区：

- Local command
- SSH host
- Slurm job id
- status
- log tail preview
- output artifacts

长任务不应卡住消息。若会话断开，至少可从 `.openscience/runs/<runId>/events.jsonl` 恢复最后状态。

## 6. Prompt

Science prompt 增加：

- 远程任务提交前确认 host/queue/account/资源需求。
- 提交后记录 job id、submit command、status command、log path。
- 长任务必须说明如何恢复：`squeue -j ...`、`sacct -j ...`、日志路径。
- 不要把 `squeue` 状态当成科学结论。

## 7. 验收标准

- Agent 记录一个 Slurm job id 后，Science panel 显示 remote job。
- 更新状态后 UI 从 submitted/running 到 completed。
- remote log 作为 evidence 或 artifact 可打开。
- 断开后重新打开会话仍能看到最后登记状态。
- 未获批准的 host 不被自动加入 allowed hosts。

## 8. 风险

- 远程 job 生命周期长于会话：需要后续 watcher/monitor，不进 M1。
- SSH 凭据敏感：不写入 `.openscience`。
- HPC 输出路径可能不在本地：artifact 应允许 `ssh://` 或 remote path，但 preview 只能降级。

