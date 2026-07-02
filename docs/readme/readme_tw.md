<h1 align="center">OpenScience</h1>

<p align="center">
  <strong>面向嚴謹科研的開源 AI 研究工作台。</strong>
</p>

<p align="center">
  OpenScience 將本地研究專案變成一個可以讀文獻、查證據、跑分析、預覽檔案、修改圖表、撰寫手稿並保留來源軌跡的科學工作空間。
</p>

<p align="center">
  <img src="../../resources/readme/website-openscience-hero.png" alt="OpenScience 研究專案總覽" width="100%" />
</p>

<p align="center">
  <a href="../../readme.md">English</a> · <a href="./readme_ch.md">简体中文</a> · <strong>繁體中文</strong> · <a href="./readme_jp.md">日本語</a> · <a href="./readme_ko.md">한국어</a> · <a href="./readme_es.md">Español</a> · <a href="./readme_pt.md">Português</a> · <a href="./readme_tr.md">Türkçe</a> · <a href="./readme_ru.md">Русский</a> · <a href="./readme_uk.md">Українська</a>
</p>

---

## 主線

OpenScience 借鑑 Claude Science 強調的方向：科學 AI 不應只是聊天框，而應是一個研究環境。它需要圍繞研究專案執行分析、搜尋證據、生成可檢查的科學 artifact、預覽科學檔案，並把計算、證據與審查記錄留在專案中。

| 科研問題 | OpenScience 的做法 |
|---|---|
| 工作放在哪裡 | 放在研究專案資料夾中，而不是只留在聊天紀錄裡 |
| 能否跑真實分析 | 透過 Python、R、shell、notebook 和本地 coding agent 執行 |
| 結果能否複查 | 圖、表、notebook、報告、手稿都作為 artifact 開啟並帶來源軌跡 |
| 醫學/臨床證據怎麼辦 | 使用醫學循證模式，生成帶證據強度和衝突記錄的結構化報告 |
| 能否接入既有工具 | 復用本地檔案、既有腳本、模型服務和 coding agent 工作流 |

---

## 產品預覽

<table>
<tr>
<td width="50%" valign="top">
<img src="../../resources/readme/science-output-workspace.png" alt="OpenScience artifact 預覽" /><br/>
<sub><b>Artifact 預覽。</b> 普通預覽框可以變成科學 artifact 視圖，右側保留來源、程式碼、日誌和審查狀態。</sub>
</td>
<td width="50%" valign="top">
<img src="../../resources/readme/medical-evidence-report.png" alt="OpenScience 醫學循證報告" /><br/>
<sub><b>醫學循證模式。</b> 將臨床和生物醫學問題整理成帶來源、證據強度、衝突和結論的報告。</sub>
</td>
</tr>
</table>

---

## 研究專案流程

| 步驟 | 研究者做什麼 | OpenScience 保留什麼 |
|---:|---|---|
| 1 | 建立或開啟研究專案 | 專案資料夾、設定、來源記錄、輸出 |
| 2 | 用自然語言提出問題 | 任務、假設、檔案、澄清回答 |
| 3 | 搜尋和讀取證據 | 論文、試驗、監管文件、資料、圖像、程式碼執行的來源標籤 |
| 4 | 執行分析 | 腳本、命令、notebook、輸入檔、日誌、環境資訊 |
| 5 | 檢查 artifact | 圖、表、報告、手稿、來源軌跡和審查狀態 |
| 6 | 修改並匯出 | 新版本、批註、PDF、Word、LaTeX、notebook、專案記錄 |

---

## 證據優先

| 證據範圍 | 用途 |
|---|---|
| 11M+ 論文 | 文獻綜述、方法比較、引用支撐寫作 |
| 225K+ 藥品和器械文件 | 標籤、指南、監管背景、安全性和適應症審查 |
| 1M+ 臨床試驗 | 干預、結局、狀態、對照和入排標準檢查 |
| 150M+ 研究摘要 | 快速發現相關方向 |
| 本地檔案和生成結果 | 資料集、腳本、圖表、notebook、報告、日誌和審查記錄 |

---

## 快速開始

```bash
git clone https://github.com/ResearAI/OpenScience.git
cd OpenScience
bun install
bun run dev
```

完整英文 README 見 [readme.md](../../readme.md)。

---

## 授權與致謝

OpenScience 是基於 [AionUi](https://github.com/iOfficeAI/AionUi) 的修改作品。AionUi 原始專案採用 Apache-2.0 授權。

從這個 OpenScience fork/發行版開始，本專案採用 [AGPL-3.0-only](../../LICENSE) 發布；具有獨立授權聲明的第三方元件和檔案仍遵守各自授權。原始 Apache-2.0 版權、授權和致謝保留在 [LICENSES/Apache-2.0.txt](../../LICENSES/Apache-2.0.txt)、[NOTICE](../../NOTICE) 和 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) 中。
