# 新增生成图标资产清单

本清单记录本轮使用 `gpt-image-2` 生成并接入 DeepOrganiser 前端的新增 PNG 图标。所有路径均位于：

`/Users/yixuan/Documents/DeepOrganiser/DeepOrganiser-git/packages/desktop/src/renderer/assets/icons/generated`

## Agent 输出文件图标

| 图标         | Light                       | Dark                             |
| ------------ | --------------------------- | -------------------------------- |
| 压缩包       | `agent-output-archive.png`  | `agent-output-archive-dark.png`  |
| 音频         | `agent-output-audio.png`    | `agent-output-audio-dark.png`    |
| 配置         | `agent-output-config.png`   | `agent-output-config-dark.png`   |
| 数据库       | `agent-output-database.png` | `agent-output-database-dark.png` |
| 下载         | `agent-output-download.png` | `agent-output-download-dark.png` |
| Notebook     | `agent-output-notebook.png` | `agent-output-notebook-dark.png` |
| 表格/CSV/TSV | `agent-output-table.png`    | `agent-output-table-dark.png`    |
| 纯文本/日志  | `agent-output-text.png`     | `agent-output-text-dark.png`     |
| 视频         | `agent-output-video.png`    | `agent-output-video-dark.png`    |

## Agent 运行状态图标

| 图标      | Light                         | Dark                               |
| --------- | ----------------------------- | ---------------------------------- |
| 测试      | `agent-status-test.png`       | `agent-status-test-dark.png`       |
| 构建      | `agent-status-build.png`      | `agent-status-build-dark.png`      |
| 安装依赖  | `agent-status-install.png`    | `agent-status-install-dark.png`    |
| 服务/预览 | `agent-status-server.png`     | `agent-status-server-dark.png`     |
| 权限      | `agent-status-permission.png` | `agent-status-permission-dark.png` |
| 检查/审阅 | `agent-status-inspect.png`    | `agent-status-inspect-dark.png`    |

## SendBox 图标

| 图标       | Light                          | Dark                                |
| ---------- | ------------------------------ | ----------------------------------- |
| 发送       | `sendbox-send.png`             | `sendbox-send-dark.png`             |
| 停止       | `sendbox-stop.png`             | `sendbox-stop-dark.png`             |
| 附件       | `sendbox-attach.png`           | `sendbox-attach-dark.png`           |
| Slash 命令 | `sendbox-slash-command.png`    | `sendbox-slash-command-dark.png`    |
| 文件引用   | `sendbox-mention-file.png`     | `sendbox-mention-file-dark.png`     |
| 麦克风     | `sendbox-microphone.png`       | `sendbox-microphone-dark.png`       |
| 语音转写   | `sendbox-voice-transcribe.png` | `sendbox-voice-transcribe-dark.png` |
| 工作区     | `sendbox-workspace.png`        | `sendbox-workspace-dark.png`        |
| 引用       | `sendbox-quote.png`            | `sendbox-quote-dark.png`            |
| DOM 片段   | `sendbox-dom-snippet.png`      | `sendbox-dom-snippet-dark.png`      |

## 设置页图标

| 图标 | Light                    | Dark                          |
| ---- | ------------------------ | ----------------------------- |
| 主题 | `settings-theme.png`     | `settings-theme-dark.png`     |
| 字体 | `settings-font-size.png` | `settings-font-size-dark.png` |
| 缩放 | `settings-scale.png`     | `settings-scale-dark.png`     |
| 动效 | `settings-motion.png`    | `settings-motion-dark.png`    |

## 预览图

| 内容                | 路径                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 新增 Light 图标总览 | `/Users/yixuan/Documents/DeepOrganiser/DeepOrganiser-git/output/imagegen/new-icons/new-icons-light-overview.png`        |
| 新增 Dark 图标总览  | `/Users/yixuan/Documents/DeepOrganiser/DeepOrganiser-git/output/imagegen/new-icons/new-icons-dark-on-dark-overview.png` |
| 主题预览总览        | `/Users/yixuan/Documents/DeepOrganiser/DeepOrganiser-git/output/imagegen/deepscientist-theme-assets-overview-16x9.png`  |

## 医疗循证图标

本组使用 `gpt-image-2` 通过 Bianxie API 生成，接入路径为：

`/Users/yixuan/Documents/DeepScientist_lark/packages/desktop/src/renderer/assets/icons/generated`

当前版本为 simple/direct v2：每个医学循证图标尽量只保留一个主体和一个辅助符号，减少堆叠文件、复杂表格和装饰性火花；Logo 收束为“单张临床文档 + 红色 medical plus + 金色证据线”。

React 组件：

`/Users/yixuan/Documents/DeepScientist_lark/packages/desktop/src/renderer/components/icons/MedicalEvidenceIcon.tsx`

`/Users/yixuan/Documents/DeepScientist_lark/packages/desktop/src/renderer/components/icons/MedicalEvidenceLogo.tsx`

生成脚本：

`/Users/yixuan/Documents/DeepScientist_lark/scripts/generate-medical-evidence-icons-bianxie.py`

`/Users/yixuan/Documents/DeepScientist_lark/scripts/generate-medical-evidence-logo-bianxie.py`

### 医疗循证 Logo

| 内容 | 路径 |
| --- | --- |
| Light logo | `/Users/yixuan/Documents/DeepScientist_lark/packages/desktop/src/renderer/assets/icons/generated/medical-evidence-logo.png` |
| Dark logo | `/Users/yixuan/Documents/DeepScientist_lark/packages/desktop/src/renderer/assets/icons/generated/medical-evidence-logo-dark.png` |
| Light raw | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-logo/raw/medical-evidence-logo-light.png` |
| Dark raw | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-logo/raw/medical-evidence-logo-dark.png` |
| Light prompt | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-logo/raw/medical-evidence-logo-light.prompt.txt` |
| Dark prompt | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-logo/raw/medical-evidence-logo-dark.prompt.txt` |
| Logo 总览 | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-logo/medical-evidence-logo-overview.png` |

| 图标用途 | 组件 name | Light | Dark |
| --- | --- | --- | --- |
| 证据正在收集的主容器 | `basket` | `medical-evidence-basket.png` | `medical-evidence-basket-dark.png` |
| 检索增强阶段 | `search` | `medical-evidence-search.png` | `medical-evidence-search-dark.png` |
| 普通论文结果 | `paper` | `medical-evidence-paper.png` | `medical-evidence-paper-dark.png` |
| 指南类证据 | `guideline` | `medical-evidence-guideline.png` | `medical-evidence-guideline-dark.png` |
| RCT 证据 | `rct` | `medical-evidence-rct.png` | `medical-evidence-rct-dark.png` |
| 系统综述/Meta | `review` | `medical-evidence-review.png` | `medical-evidence-review-dark.png` |
| 药品说明书 | `drugLabel` | `medical-evidence-drug-label.png` | `medical-evidence-drug-label-dark.png` |
| FDA/监管文件 | `regulatory` | `medical-evidence-regulatory.png` | `medical-evidence-regulatory-dark.png` |
| ClinicalTrials | `trial` | `medical-evidence-trial.png` | `medical-evidence-trial-dark.png` |
| 行级证据锚定 | `anchor` | `medical-evidence-anchor.png` | `medical-evidence-anchor-dark.png` |
| 高等级证据 | `gradeHigh` | `medical-evidence-grade-high.png` | `medical-evidence-grade-high-dark.png` |
| 中等证据 | `gradeMid` | `medical-evidence-grade-mid.png` | `medical-evidence-grade-mid-dark.png` |
| 低等级证据 | `gradeLow` | `medical-evidence-grade-low.png` | `medical-evidence-grade-low-dark.png` |
| 循证权衡 | `weigh` | `medical-evidence-weigh.png` | `medical-evidence-weigh-dark.png` |
| 被采纳证据 | `adopt` | `medical-evidence-adopt.png` | `medical-evidence-adopt-dark.png` |
| 降权证据 | `downgrade` | `medical-evidence-downgrade.png` | `medical-evidence-downgrade-dark.png` |
| PICO 检索计划 | `pico` | `medical-evidence-pico.png` | `medical-evidence-pico-dark.png` |
| 正在读取原文 | `scan` | `medical-evidence-scan.png` | `medical-evidence-scan-dark.png` |
| 可追溯引用 | `citation` | `medical-evidence-citation.png` | `medical-evidence-citation-dark.png` |
| 循证结果完成 | `complete` | `medical-evidence-complete.png` | `medical-evidence-complete-dark.png` |

### 医疗循证图标生成 Prompt 文件

| 分组 | Light prompt | Dark prompt |
| --- | --- | --- |
| 收集/检索/扫描/完成 | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/raw/medical-evidence-flow-light.prompt.txt` | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/raw/medical-evidence-flow-dark.prompt.txt` |
| 论文/指南/药品说明书/监管 | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/raw/medical-evidence-sources-light.prompt.txt` | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/raw/medical-evidence-sources-dark.prompt.txt` |
| RCT/综述/试验/PICO | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/raw/medical-evidence-study-designs-light.prompt.txt` | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/raw/medical-evidence-study-designs-dark.prompt.txt` |
| 证据等级/权衡 | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/raw/medical-evidence-grade-light.prompt.txt` | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/raw/medical-evidence-grade-dark.prompt.txt` |
| 采纳/降权/锚点/引用 | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/raw/medical-evidence-trace-light.prompt.txt` | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/raw/medical-evidence-trace-dark.prompt.txt` |

### 医疗循证图标总览

| 内容 | 路径 |
| --- | --- |
| Light 总览 | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/medical-evidence-icons-light-overview.png` |
| Dark 总览 | `/Users/yixuan/Documents/DeepScientist_lark/output/imagegen/medical-evidence-icons/medical-evidence-icons-dark-overview.png` |
