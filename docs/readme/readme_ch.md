<h1 align="center">OpenScience</h1>

<p align="center">
  <strong>面向严谨科研的开源 AI 研究工作台。</strong>
</p>

<p align="center">
  OpenScience 把本地研究项目变成一个可以读文献、查证据、跑分析、预览文件、修改图表、写手稿并保留来源轨迹的科学工作空间。
</p>

<p align="center">
  <img src="../../resources/readme/website-openscience-hero.png" alt="OpenScience 研究项目总览" width="100%" />
</p>

<p align="center">
  <a href="../../readme.md">English</a> · <strong>简体中文</strong> · <a href="./readme_tw.md">繁體中文</a> · <a href="./readme_jp.md">日本語</a> · <a href="./readme_ko.md">한국어</a> · <a href="./readme_es.md">Español</a> · <a href="./readme_pt.md">Português</a> · <a href="./readme_tr.md">Türkçe</a> · <a href="./readme_ru.md">Русский</a> · <a href="./readme_uk.md">Українська</a>
</p>

---

## 主线

OpenScience 借鉴 Claude Science 强调的方向：科学 AI 不应该只是聊天框，而应该是一个研究环境。它需要能围绕研究项目运行分析、搜索证据、生成可检查的科学 artifact、预览科学文件，并把计算、证据和审查记录留在项目里。

| 科研问题 | OpenScience 的做法 |
|---|---|
| 工作放在哪里 | 放在研究项目文件夹里，而不是只在聊天记录里 |
| 能否跑真实分析 | 通过 Python、R、shell、notebook 和本地 coding agent 执行 |
| 结果能否复查 | 图、表、notebook、报告、手稿都作为 artifact 打开并带来源轨迹 |
| 医学/临床证据怎么办 | 使用医学循证模式，生成带证据强度和冲突记录的结构化报告 |
| 能否接入现有工具 | 复用本地文件、已有脚本、模型服务和 coding agent 工作流 |

---

## 产品预览

<table>
<tr>
<td width="50%" valign="top">
<img src="../../resources/readme/science-output-workspace.png" alt="OpenScience artifact 预览" /><br/>
<sub><b>Artifact 预览。</b> 普通预览框可以变成科学 artifact 视图，右侧保留来源、代码、日志和审查状态。</sub>
</td>
<td width="50%" valign="top">
<img src="../../resources/readme/medical-evidence-report.png" alt="OpenScience 医学循证报告" /><br/>
<sub><b>医学循证模式。</b> 把临床和生物医学问题整理成带来源、证据强度、冲突和结论的报告。</sub>
</td>
</tr>
</table>

---

## 研究项目流程

| 步骤 | 研究者做什么 | OpenScience 保留什么 |
|---:|---|---|
| 1 | 创建或打开研究项目 | 项目文件夹、设置、来源记录、输出 |
| 2 | 用自然语言提出问题 | 任务、假设、文件、澄清回答 |
| 3 | 搜索和读取证据 | 论文、试验、监管文档、数据、图像、代码运行的来源标签 |
| 4 | 运行分析 | 脚本、命令、notebook、输入文件、日志、环境信息 |
| 5 | 检查 artifact | 图、表、报告、手稿、来源轨迹和审查状态 |
| 6 | 修改并导出 | 新版本、批注、PDF、Word、LaTeX、notebook、项目记录 |

---

## 证据优先

数字不是口号，而是支撑“每个关键结论都能回到来源”的能力。

| 证据范围 | 用途 |
|---|---|
| 11M+ 论文 | 文献综述、方法比较、引用支撑写作 |
| 225K+ 药品和器械文档 | 标签、指南、监管背景、安全性和适应症审查 |
| 1M+ 临床试验 | 干预、结局、状态、对照和入排标准检查 |
| 150M+ 研究摘要 | 快速发现相关方向 |
| 本地文件和生成结果 | 数据集、脚本、图表、notebook、报告、日志和审查记录 |

---

## 四种工作模式

OpenScience 的模式不是简单换一套提示词，而是给 Agent 换一套工作纪律：它会决定要不要绑定研究项目、要不要记录 artifact、要不要查证据、要不要持续推进，以及最后应该交付什么。

| 模式 | 一句话 | 适合什么时候打开 | 最终得到什么 |
|---|---|---|---|
| 科学研究模式 | 把自然语言问题推进成真实执行过、可复查的科研结果 | 文献综述、数据分析、计算实验、图表、Notebook、论文初稿 | 带来源、代码、日志和版本记录的科研 artifact |
| 医学循证模式 | 把医学问题拆成可追溯证据链，而不是只给一个笼统建议 | 治疗方案、药品用法、指南/RCT/说明书对照、风险与禁忌核查 | 带证据等级、冲突记录、限制条件和引用锚点的循证报告 |
| 目标模式 | 让 Agent 围绕一个长期目标持续检查、总结并推进下一步 | 多轮实验、论文修改、项目排期、长期资料整理、连续迭代任务 | 每轮进展、下一步行动、阻塞点和可恢复的持续目标 |
| 知识沉淀模式 | 把一次做对的流程沉淀成下次可复用的 SOP / 流程能力 | 实验室流程、图表风格、审稿回应、数据清洗、团队规范 | 可审查的能力草稿、SOP、来源账本、隐私与冲突说明 |

### 科学研究模式

科学研究模式是默认的研究项目入口。你可以直接说“帮我分析这批数据”“复现这篇文章的图”“把这个结果整理成 manuscript draft”，OpenScience 会把对话、文件、代码运行、图表、表格、Notebook 和报告都放回同一个研究项目里。

它最重要的价值是：**结果不是聊天记录里的几段文字，而是可以继续打开、检查、修改、导出和复现的科研 artifact。** 每个关键结论都应尽量连接到输入数据、执行命令、环境信息和证据来源；几周后回到项目里，仍然能看清当时是怎么得到这个结果的。

### 医学循证模式

<p align="center">
  <img src="../../resources/readme/medical-evidence-report.png" alt="OpenScience 医学循证模式：带引用锚点的临床问题回答" width="100%" />
</p>

医学循证模式适合临床、生物医学和监管相关问题。它会更严格地区分“指南怎么说”“RCT 或系统综述怎么说”“药品说明书/监管文档怎么说”“哪些人群需要谨慎处理”，并把证据锚点直接挂在段落后面。

这种模式的输出重点不是“给一个看似确定的答案”，而是帮助你快速看到：

- 主要结论是什么，以及它适用于哪些前提；
- 证据来自指南、RCT、综述、说明书、监管文档还是其他来源；
- 不同来源之间有没有冲突，冲突会不会影响结论；
- 儿童、妊娠、老年、肝肾功能异常、合并用药等边界条件是否需要单独处理；
- 哪些地方只能作为研究和讨论线索，不能替代临床判断。

### 目标模式

目标模式适合“不是一次回答就结束”的任务。你写下一个长期目标后，Agent 每一轮都会带着这个目标继续检查现状：已经完成什么、还有什么没做、下一步应该推进哪里、是否需要先问你确认。

它适合论文返修、长期实验、持续调研、项目周推进、资料库整理这类任务。好处是 Agent 不会每次都从零开始理解上下文，也不会把“下一步”散落在聊天里；目标、进展和阻塞点会被持续保留下来，方便暂停、恢复和交接。

### 知识沉淀模式

知识沉淀模式用于把一次成功经验变成可复用能力。比如你刚完成了一套图表规范、一个实验分析流程、一份审稿回应策略，或者一套团队内部 SOP，就可以让 OpenScience 从会话、artifact、项目文档和你的补充说明里提炼出能力说明草稿。

沉淀结果不会直接启用。它会先生成可审查的内容：SOP、来源账本、隐私说明、冲突记录和待确认项。你确认后，它才会成为后续 Agent 可以调用的本地能力。这样团队不是只“完成了一次任务”，而是把做对的方式留下来，让下次更快、更一致、更可审查。

---

## 快速开始

```bash
git clone https://github.com/ResearAI/OpenScience.git
cd OpenScience
bun install
bun run dev
```

完整英文 README 见 [readme.md](../../readme.md)。

---

## 许可证和致谢

OpenScience 是基于 [AionUi](https://github.com/iOfficeAI/AionUi) 的修改作品。AionUi 原始项目采用 Apache-2.0 许可证。

OpenScience 也感谢以下开源项目和资料来源：

| 项目 | OpenScience 从中获得的帮助 |
|---|---|
| [AionUi](https://github.com/iOfficeAI/AionUi) | 原始开源桌面 AI 助手基础、跨平台应用框架和本地工作台形态 |
| [ResearAI/DeepScientist](https://github.com/ResearAI/DeepScientist) | 科研工作流、Science Evidence Graph、科研写作、实验/审稿/图表打磨等技能设计参考 |
| [K-Dense scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | MIT 许可的科学技能语料，覆盖数据库检索、生物/化学工作流、科学 Python 包、写作和实验室集成 |
| [Auto-Empirical Research Skills](https://github.com/brycewang-stanford/Auto-Empirical-Research-Skills) | CC BY-SA 4.0 许可的实证研究技能语料，覆盖计量、因果推断、复现包、引用核查、问卷/codebook、质性分析和社科论文工作流 |

从这个 OpenScience fork/发行版开始，本项目采用 [AGPL-3.0-only](../../LICENSE) 发布；带有独立许可证声明的第三方组件和文件仍遵守各自许可证。原始 Apache-2.0 版权、许可证和致谢保留在 [LICENSES/Apache-2.0.txt](../../LICENSES/Apache-2.0.txt)、[NOTICE](../../NOTICE) 和 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) 中。
