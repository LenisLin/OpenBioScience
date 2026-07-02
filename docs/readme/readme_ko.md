<h1 align="center">OpenScience</h1>

<p align="center">
  <strong>엄밀하고 근거 기반의 과학을 위한 오픈소스 AI 연구 워크스페이스.</strong>
</p>

<p align="center">
  OpenScience는 로컬 연구 프로젝트를 문헌 읽기, 근거 검색, 분석 실행, 파일 미리보기, 그림 수정, 원고 작성, 출처 추적 기록 보존이 가능한 과학 작업 공간으로 바꿉니다.
</p>

<p align="center">
  <img src="../../resources/readme/website-openscience-hero.png" alt="OpenScience research workspace overview" width="100%" />
</p>

<p align="center">
  <a href="../../readme.md">English</a> · <a href="./readme_ch.md">简体中文</a> · <a href="./readme_tw.md">繁體中文</a> · <a href="./readme_jp.md">日本語</a> · <strong>한국어</strong> · <a href="./readme_es.md">Español</a> · <a href="./readme_pt.md">Português</a> · <a href="./readme_tr.md">Türkçe</a> · <a href="./readme_ru.md">Русский</a> · <a href="./readme_uk.md">Українська</a>
</p>

---

## Product Line

OpenScience는 Claude Science가 보여준 방향에서 배웁니다. 과학용 AI는 단순한 채팅창이 아니라 연구 프로젝트, 분석 실행, 근거 검색, 과학 artifact, 파일 미리보기, 계산 기록, 리뷰를 다루는 연구 환경이어야 합니다.

| 연구 문제 | OpenScience의 답 |
|---|---|
| 작업은 어디에 남는가 | 채팅 기록뿐 아니라 연구 프로젝트 폴더에 남습니다 |
| 실제 분석을 실행할 수 있는가 | Python, R, shell, notebook, 로컬 coding agent를 사용합니다 |
| 결과를 다시 확인할 수 있는가 | 그림, 표, notebook, 보고서, 원고를 출처 추적 기록이 있는 artifact로 엽니다 |
| 의학/임상 근거는 어떻게 다루는가 | Medical Evidence Mode로 근거 강도, 충돌, 한계를 포함한 구조화 보고서를 만듭니다 |
| 기존 도구를 쓸 수 있는가 | 로컬 파일, 기존 스크립트, 모델 제공자, coding agent를 재사용합니다 |

---

## Product Tour

<table>
<tr>
<td width="50%" valign="top">
<img src="../../resources/readme/science-output-workspace.png" alt="OpenScience artifact preview" /><br/>
<sub><b>Artifact preview.</b> 일반 미리보기 패널이 소스, 코드, 로그, 리뷰 상태를 함께 보여주는 과학 artifact 보기로 바뀝니다.</sub>
</td>
<td width="50%" valign="top">
<img src="../../resources/readme/medical-evidence-report.png" alt="OpenScience medical evidence report" /><br/>
<sub><b>Medical Evidence Mode.</b> 임상 및 생의학 질문을 출처, 근거 강도, 충돌, 결론이 있는 보고서로 정리합니다.</sub>
</td>
</tr>
</table>

---

## Research Workflow

| Step | Scientist does | OpenScience keeps |
|---:|---|---|
| 1 | 연구 프로젝트 생성 또는 재개 | 프로젝트 폴더, 설정, 출처, 출력 |
| 2 | 자연어로 질문 | 작업, 가정, 파일, 확인 답변 |
| 3 | 근거 검색 및 읽기 | 논문, 임상시험, 규제 문서, 데이터, 그림, 코드 실행 라벨 |
| 4 | 분석 실행 | 스크립트, 명령, notebook, 입력, 로그, 환경 |
| 5 | artifact 확인 | 그림, 표, 보고서, 원고, 출처 추적 기록, 리뷰 상태 |
| 6 | 수정 및 내보내기 | 새 버전, 주석, PDF, Word, LaTeX, notebook |

---

## Evidence Reach

| Evidence | Use |
|---|---|
| 11M+ papers | 문헌 리뷰, 방법 비교, 인용 기반 작성 |
| 225K+ drug and device documents | 라벨, 지침, 규제 맥락, 안전성 검토 |
| 1M+ clinical trials | 중재, 결과, 상태, 비교군, 적격 기준 |
| 150M+ abstracts | 관련 연구 빠른 발견 |
| Local files and outputs | 데이터, 코드, 그림, notebook, 보고서, 로그 |

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

## 라이선스와 감사

OpenScience는 Apache-2.0으로 공개된 [AionUi](https://github.com/iOfficeAI/AionUi)를 기반으로 한 수정 저작물입니다.

이 OpenScience fork/배포판부터 프로젝트는 [AGPL-3.0-only](../../LICENSE)로 배포됩니다. 단, 별도 라이선스 고지가 있는 타사 구성 요소와 파일은 각자의 라이선스를 따릅니다. 원래 Apache-2.0 저작권, 라이선스, attribution 고지는 [LICENSES/Apache-2.0.txt](../../LICENSES/Apache-2.0.txt), [NOTICE](../../NOTICE), [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)에 보존되어 있습니다.
