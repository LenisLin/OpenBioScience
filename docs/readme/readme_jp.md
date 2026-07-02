<h1 align="center">OpenScience</h1>

<p align="center">
  <strong>厳密で証拠に基づく科学のための、オープンソース AI 研究ワークスペース。</strong>
</p>

<p align="center">
  OpenScience はローカルの研究プロジェクトを、文献を読み、証拠を探し、解析を実行し、ファイルをプレビューし、図を修正し、原稿を書き、後から確認できる 出典と生成履歴 を残す作業空間にします。
</p>

<p align="center">
  <img src="../../resources/readme/website-openscience-hero.png" alt="OpenScience research workspace overview" width="100%" />
</p>

<p align="center">
  <a href="../../readme.md">English</a> · <a href="./readme_ch.md">简体中文</a> · <a href="./readme_tw.md">繁體中文</a> · <strong>日本語</strong> · <a href="./readme_ko.md">한국어</a> · <a href="./readme_es.md">Español</a> · <a href="./readme_pt.md">Português</a> · <a href="./readme_tr.md">Türkçe</a> · <a href="./readme_ru.md">Русский</a> · <a href="./readme_uk.md">Українська</a>
</p>

---

## Product Line

OpenScience は Claude Science が示した方向から学んでいます。科学向け AI は単なるチャットではなく、研究プロジェクト、解析実行、証拠検索、科学 artifact、ファイルプレビュー、計算記録、レビューを扱う研究環境であるべきです。

| 研究上の課題 | OpenScience の答え |
|---|---|
| 作業はどこに残るか | チャットだけでなく、研究プロジェクトフォルダに残ります |
| 実際の解析を実行できるか | Python、R、shell、notebook、ローカル coding agent を使います |
| 結果を後から確認できるか | 図、表、notebook、レポート、原稿を 出典と生成履歴 付き artifact として開きます |
| 医学・臨床の証拠はどう扱うか | Medical Evidence Mode で証拠強度、矛盾、制限を含む構造化レポートを作ります |
| 既存ツールを使えるか | ローカルファイル、既存スクリプト、モデルプロバイダ、coding agent を再利用します |

---

## Product Tour

<table>
<tr>
<td width="50%" valign="top">
<img src="../../resources/readme/science-output-workspace.png" alt="OpenScience artifact preview" /><br/>
<sub><b>Artifact preview.</b> 通常のプレビューパネルが、ソース、コード、ログ、レビュー状態を備えた科学 artifact ビューになります。</sub>
</td>
<td width="50%" valign="top">
<img src="../../resources/readme/medical-evidence-report.png" alt="OpenScience medical evidence report" /><br/>
<sub><b>Medical Evidence Mode.</b> 臨床・生物医学の質問を、証拠、証拠強度、矛盾、結論を含むレポートにします。</sub>
</td>
</tr>
</table>

---

## Research Workflow

| Step | Scientist does | OpenScience keeps |
|---:|---|---|
| 1 | 研究プロジェクトを作成または再開 | プロジェクトフォルダ、設定、ソース、出力 |
| 2 | 自然言語で質問する | タスク、仮説、ファイル、確認回答 |
| 3 | 証拠を検索して読む | 論文、試験、規制文書、データ、図、コード実行のラベル |
| 4 | 解析を実行する | スクリプト、コマンド、notebook、入力、ログ、環境 |
| 5 | artifact を確認する | 図、表、レポート、原稿、出典と生成履歴、レビュー状態 |
| 6 | 修正して出力する | 新バージョン、注釈、PDF、Word、LaTeX、notebook |

---

## Evidence Reach

| Evidence | Use |
|---|---|
| 11M+ papers | 文献レビュー、方法比較、引用付き執筆 |
| 225K+ drug and device documents | ラベル、ガイダンス、規制文脈、安全性確認 |
| 1M+ clinical trials | 介入、アウトカム、状態、比較、適格基準 |
| 150M+ abstracts | 関連研究の高速発見 |
| Local files and outputs | データ、コード、図、notebook、レポート、ログ |

---

## Quick Start

```bash
git clone https://github.com/ResearAI/OpenScience.git
cd OpenScience
bun install
bun run dev
```

Full English README: [readme.md](../../readme.md).

---

## ライセンスと謝辞

OpenScience は、Apache-2.0 で公開された [AionUi](https://github.com/iOfficeAI/AionUi) をもとにした改変作品です。

この OpenScience fork/配布版から、本プロジェクトは [AGPL-3.0-only](../../LICENSE) で公開されます。ただし、独自のライセンス表示を持つ第三者コンポーネントやファイルは、それぞれのライセンスに従います。元の Apache-2.0 の著作権、ライセンス、帰属表示は [LICENSES/Apache-2.0.txt](../../LICENSES/Apache-2.0.txt)、[NOTICE](../../NOTICE)、[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) に保存されています。
