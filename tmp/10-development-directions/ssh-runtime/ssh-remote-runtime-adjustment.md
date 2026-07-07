# SSH And Remote Runtime Adjustment

本文档记录 OpenBioScience 当前 SSH/远程服务器能力的关键错位，以及后续需要改进的方向。

## 当前问题

当前 OpenBioScience 可以保存并测试 SSH 主机。测试会进入远端执行 `whoami`、`pwd`、`uname`、`nvidia-smi` 等命令，用于确认连接和远端 GPU 摘要。

但是，当前 SSH host 更接近“远程服务器上下文”，而不是完整的远程计算平台：

- 本地 UI 仍在本地 PC 运行。
- 本地 backend 和会话/配置数据仍主要在本地数据目录。
- SSH host 会被注入到会话上下文，让 agent 知道有远程服务器可用。
- 远程 CPU/RAM/GPU 只有在 agent 真正通过 SSH 在远端执行命令时才被使用。
- 如果输入数据只在本地，远端服务器无法自动访问这些数据。

因此，“已连接 SSH”不等于“该任务可以使用远程高性能计算资源”。

## 关键错位

| 维度 | 当前默认归属 | 问题 |
| --- | --- | --- |
| 计算资源 | 本地 UI/backend/agent 默认消耗本地；SSH 命令才消耗远端 | 用户容易误以为选择远程服务器后所有任务自动在远端运行 |
| 数据 | 会话、设置、provider、workspace 引用默认偏本地 | 数据只在本地时，远端 GPU/CPU 无法直接读取输入 |
| 执行环境 | 本地 agent/MCP 用本地环境；SSH 命令用远端 shell/conda/container/CUDA | 当前缺少明确的环境选择、校验和复现机制 |
| token 消耗 | 取决于谁调用 LLM：本地 provider 或 remote agent provider | token 归属和计算资源归属可能分离，UI 需要显式说明 |

## 推荐目标模式

建议引入更清晰的模式：

**本地 UI，远程 CLI/Agent Runtime，显式数据部署。**

在该模式下：

| 维度 | 归属 |
| --- | --- |
| UI | 本地 PC |
| Agent/CLI runtime | 远程服务器 |
| CPU/RAM/GPU | 远程服务器 |
| 执行环境 | 远程 conda/container/module/CLI |
| token/provider | 远程 runtime 配置的 provider/API key/subscription |
| 输入数据 | 必须在远端可访问，或由 UI 显式上传/同步/映射 |
| 输出结果 | 远端生成；小结果可回收本地，大结果保留远端并提供 manifest/preview |

## 必需的一等概念

后续不能只让用户选择 SSH host，还需要显式记录：

- `data_location`: `local` / `remote` / `shared_fs` / `object_storage`
- `execution_host`: `local` / `ssh_host` / `remote_agent`
- `runtime_location`: `local` / `remote`
- `token_owner`: `local_provider` / `remote_runtime_provider`
- `staging_policy`: 不上传 / 上传输入 / 同步目录 / 路径映射 / 对象存储引用
- `remote_workdir`: 远端项目工作目录
- `path_mapping`: 本地路径与远端路径的对应关系
- `output_policy`: 下载报告、小文件和 manifest；大数据保留远端
- `environment`: conda、container、module、Slurm/queue 等

## 建议任务流

1. 用户在本地 UI 选择远程 runtime。
2. UI 检查数据位置：
   - 数据已在远端：选择远端路径。
   - 数据只在本地：必须显式部署/上传。
   - 数据在共享文件系统：要求配置路径映射。
   - 数据在对象存储：要求远端 credential/URI 可用。
3. UI 创建远程任务，包含 project id、remote workdir、dataset manifest、environment、agent/model/provider。
4. 远程 runtime 调用 LLM 和工具，消耗远程 token/provider 与远程 CPU/RAM/GPU。
5. UI 订阅/轮询任务状态和日志。
6. 结果按 output policy 回收或保留远端，并写入可追踪 artifact manifest。

## 设计原则

- 不允许在 UI 上暗示“SSH 已连接 = 远程计算可用”。
- 选择远程 runtime 时，必须检查数据可达性。
- 大数据不应默认下载回本地；应以 manifest、摘要、预览和远端路径为主。
- token 消耗归属必须和 runtime/provider 配置绑定显示。
- SSH 可以作为安装、部署、目录浏览、日志通道，但不应继续只是 prompt 注入。
