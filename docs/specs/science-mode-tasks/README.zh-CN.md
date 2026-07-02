# Science Mode 任务书索引

日期：2026-07-01  
工作区：`/Users/yixuan/Documents/OpenScience`  
分支：`codex/open-science`

## 任务拆分结论

这组任务书把 Claude Science 风格能力拆成一个必须先完成的核心闭环，以及若干可以独立排期的额外任务。

核心闭环是：用户在研究项目中提出科学任务，Agent 仍用现有 Codex/Claude Code runner 运行 Python/R/shell；Science MCP 不做执行器，只登记检索、证据、文件、命令、环境和报告；前端把结构化 tool output 渲染成 Science Report、Artifact Ledger、Artifact Detail Tabs 和 E1/E2 证据入口。DeepScientist Science 作为总控纪律，K-Dense/SciAgent 等外部 skills 作为按需加载的领域工具包，所有外部 skill 的结果都必须经过 OpenScience adapter 写入 evidence/provenance。M1 数据库连接复用医学循证模式，Reviewer/HPC/GPU 后置。

| 文件                                                 | 优先级 | 目标                                                                            |
| ---------------------------------------------------- | -----: | ------------------------------------------------------------------------------- |
| `00-core-science-artifact-system.zh-CN.md`           |     P0 | Science Mode 的核心 artifact/provenance/report 闭环                             |
| `10-reviewer-agent.zh-CN.md`                         |     P1 | 背景 reviewer 检查引用、数字、代码和图是否可追溯                                |
| `11-figure-annotation-iteration.zh-CN.md`            |     P1 | 用户直接圈图批注，Agent 回到源代码/源文稿修改                                   |
| `12-export-notebook-pdf-manuscript.zh-CN.md`         |     P1 | 导出 notebook、PDF、manuscript、run bundle                                      |
| `13-scientific-viewers.zh-CN.md`                     |     P2 | Mol\*/igv/Vitessce/Ketcher/RDKit 等科学原生 viewer                              |
| `14-skills-database-connectors.zh-CN.md`             |  P1/P2 | Science skills 和科研数据库/工具连接策略                                        |
| `15-hpc-remote-jobs.zh-CN.md`                        |     P2 | SSH/Slurm/Modal/HPC job 的记录、恢复和 UI 状态                                  |
| `16-research-project-entry.zh-CN.md`                 |  P0/P1 | 新会话入口从“本地文件夹”升级为“研究项目”                                        |
| `17-artifact-versioning-provenance-history.zh-CN.md` |  P1/P2 | artifact 版本、历史、DAG、hash 和 diff                                          |
| `18-lab-conversation-to-skill.zh-CN.md`              |  P2/P3 | 将实验室对话、review 纠偏和 SOP 沉淀成可审查 skill                              |
| `19-prompt-skills-router-refactor.zh-CN.md`          |     P0 | 收敛 system prompt、首次 onboarding、默认 router skills 与 leaf skills 合并规则 |

## 调研来源

本任务书参考了这些来源和本地代码：

- Claude Science 页面和素材：`docs/references/claude-science/`，官方页面为 [Claude Science beta](https://claude.com/product/claude-science)。
- 本地已有架构：`packages/desktop/src/common/chat/medicalEvidence.ts`、`packages/desktop/src/process/resources/builtinMcp/medicalEvidenceServer.ts`、`packages/desktop/src/renderer/pages/conversation/Messages/components/MedicalEvidencePanel.tsx`、`packages/desktop/src/renderer/pages/conversation/Messages/MessageList.tsx`、`packages/desktop/src/renderer/pages/conversation/Preview/`、`packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts`。
- DeepScientist v1.6.0： [release](https://github.com/ResearAI/DeepScientist/releases/tag/v1.6.0)，重点是 Science Evidence Graph、science skill、169 package cards、HPC-through-shell discipline。
- 科学 skill 参考：[K-Dense scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills)、[SciAgent-Skills](https://github.com/jaechang-hits/SciAgent-Skills)。K-Dense 当前是可用候选：MIT 许可，tree 中约 149 个 `SKILL.md`，适合作为 curated domain pack，而不是替代 DeepScientist Science 总控。
- 数据/溯源标准参考：[RO-Crate](https://www.researchobject.org/ro-crate/)、[W3C PROV](https://www.w3.org/TR/prov-overview/)。
- viewer/执行生态参考：[Mol\*](https://github.com/molstar/molstar)、[igv.js](https://github.com/igvteam/igv.js)、[Vitessce](https://github.com/vitessce/vitessce)、[Ketcher](https://github.com/epam/ketcher)、[RDKit.js](https://github.com/rdkit/rdkit-js)、[Jupyter nbconvert](https://github.com/jupyter/nbconvert)、[Tectonic](https://github.com/tectonic-typesetting/tectonic)、[Nextflow](https://github.com/nextflow-io/nextflow)、[Snakemake](https://github.com/snakemake/snakemake)、[Slurm](https://github.com/SchedMD/slurm)、[Modal client](https://github.com/modal-labs/modal-client)。
- 实验室对话沉淀 skill 参考：[ResearAI/MeOS](https://github.com/ResearAI/MeOS)，重点借鉴 file-first、init/refresh/apply lifecycle、claim ledger/graph preview 和可编辑 skill 资产。
- Protocol 自进化参考：[Airalogy](https://arxiv.org/abs/2506.18586)，重点借鉴可定制 Protocol、标准化 Records、Protocol Workflow、Protocol Editor、Syntax Checker 和 Discussions/Hub 的组织方式。

## 外部模型评审记录

按要求使用 `/Users/yixuan/files/safe_deepscientist/.env` 中的 `BIANXIE_API_KEY` 和 Bianxie OpenAI-compatible base URL `https://api.bianxie.ai/v1` 进行了交叉评审。记录保存在 `docs/references/model-consensus/`。

需要说明：

- 精确请求 `gemini-3.1-pro` 三次，Bianxie 返回 `model_not_found`；模型列表中可用的是 `gemini-3.1-pro-preview`，因此用它补跑了有效评审。
- 精确请求 `claude-opus-4.8` 三次，Bianxie 返回 `model_not_found`；模型列表中可用的是 `claude-opus-4-8`，因此用它补跑了三轮有效评审。
- `gemini-3.5-flash` 精确模型名可用，但部分长 prompt 返回空内容和 `finish_reason=length`；后续用短 prompt 补跑得到有效内容。
- 模型输出只作为评审意见，其中一条 Opus 任务拆分跑偏到航天状态机，已判为无效参考，没有纳入工程方案。

模型共识：

- 核心应先做 structured report + artifact ledger + provenance DAG，不要先做大而全 scientific workbench。
- Science MCP 只登记 evidence/artifact/provenance/report，不应成为另一个执行器。
- DeepScientist Science 和 K-Dense 不应硬合并成一个巨型 prompt；正确做法是“总控 discipline + domain skill pack + OpenScience adapter”。
- 每个 artifact 必须有内容 hash、输入/输出/代码/执行日志/相关消息/环境指针、版本号和 append-only 事件。
- UI 首批要做 ScienceReportPanel、Artifact Ledger、Artifact Detail Tabs、E1/E2 可点击溯源、Preview metadata。
- 科学 viewer、完整 reviewer、HPC 状态恢复都重要，但应该独立任务推进；图片最小批注作为 artifact 迭代入口进入 M1。
