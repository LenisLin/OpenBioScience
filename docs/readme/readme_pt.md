<h1 align="center">OpenScience</h1>

<p align="center">
  <strong>Um espaço de pesquisa com IA, aberto e voltado para ciência rigorosa baseada em evidências.</strong>
</p>

<p align="center">
  OpenScience transforma um projeto local em um lugar onde a IA pode ler fontes, buscar evidências, executar análises, visualizar arquivos, revisar figuras, escrever manuscritos e manter um trilha de fontes revisável.
</p>

<p align="center">
  <img src="../../resources/readme/website-openscience-hero.png" alt="OpenScience research workspace overview" width="100%" />
</p>

<p align="center">
  <a href="../../readme.md">English</a> · <a href="./readme_ch.md">简体中文</a> · <a href="./readme_tw.md">繁體中文</a> · <a href="./readme_jp.md">日本語</a> · <a href="./readme_ko.md">한국어</a> · <a href="./readme_es.md">Español</a> · <strong>Português</strong> · <a href="./readme_tr.md">Türkçe</a> · <a href="./readme_ru.md">Русский</a> · <a href="./readme_uk.md">Українська</a>
</p>

---

## Linha principal

OpenScience aprende com a ideia central do Claude Science: IA científica não deve ser apenas um chat, mas um ambiente de pesquisa que organiza projetos, executa análises, busca evidências, preserva artifacts científicos, visualiza arquivos e registra cálculo e revisão.

| Pergunta de pesquisa | Resposta do OpenScience |
|---|---|
| Onde o trabalho fica | Em uma pasta de projeto, não apenas em uma conversa |
| Pode executar análises reais | Sim, com Python, R, shell, notebooks e coding agents locais |
| O resultado pode ser revisado | Sim, figuras, tabelas, notebooks, relatórios e manuscritos abrem como artifacts com trilha de fontes |
| E a evidência médica | Medical Evidence Mode cria relatórios com força da evidência, conflitos e limites |
| Pode usar ferramentas existentes | Sim, arquivos locais, scripts, provedores de modelos e fluxos de coding agents |

---

## Visão do produto

<table>
<tr>
<td width="50%" valign="top">
<img src="../../resources/readme/science-output-workspace.png" alt="OpenScience artifact preview" /><br/>
<sub><b>Artifact preview.</b> O painel normal de visualização vira uma visão científica com fontes, código, log e revisão ao lado do arquivo.</sub>
</td>
<td width="50%" valign="top">
<img src="../../resources/readme/medical-evidence-report.png" alt="OpenScience medical evidence report" /><br/>
<sub><b>Medical Evidence Mode.</b> Perguntas clínicas e biomédicas viram relatórios com fontes, força da evidência, conflitos e conclusão.</sub>
</td>
</tr>
</table>

---

## Fluxo de pesquisa

| Etapa | O que a pessoa pesquisadora faz | O que o OpenScience mantém |
|---:|---|---|
| 1 | Criar ou abrir um projeto | Pasta, configurações, fontes, saídas |
| 2 | Fazer uma pergunta em linguagem natural | Tarefa, suposições, arquivos, esclarecimentos |
| 3 | Buscar e ler evidências | Rótulos para papers, ensaios, documentos, dados, figuras ou execuções |
| 4 | Executar análise | Scripts, comandos, notebooks, entradas, logs, ambiente |
| 5 | Revisar artifacts | Figuras, tabelas, relatórios, manuscritos, trilha de fontes, revisão |
| 6 | Revisar e exportar | Versões, comentários, PDF, Word, LaTeX, notebooks |

---

## Alcance de evidências

| Evidência | Uso |
|---|---|
| 11M+ papers | Revisões, comparação de métodos, escrita com citações |
| 225K+ documentos de medicamentos e dispositivos | Rótulos, guias, contexto regulatório, segurança |
| 1M+ ensaios clínicos | Intervenções, desfechos, status, comparadores, critérios |
| 150M+ abstracts | Descoberta rápida de literatura |
| Arquivos locais e saídas | Dados, código, figuras, notebooks, relatórios, logs |

---

## Início rápido

```bash
git clone https://github.com/ResearAI/OpenScience.git
cd OpenScience
bun install
bun run dev
```

README completo em inglês: [readme.md](../../readme.md).

---

## Licença e agradecimentos

OpenScience é uma obra modificada baseada em [AionUi](https://github.com/iOfficeAI/AionUi), originalmente publicado sob Apache-2.0.

A partir deste fork/distribuição do OpenScience, o projeto é publicado sob [AGPL-3.0-only](../../LICENSE), exceto componentes de terceiros e arquivos com avisos de licença próprios. Os avisos originais de copyright, licença e atribuição Apache-2.0 são preservados em [LICENSES/Apache-2.0.txt](../../LICENSES/Apache-2.0.txt), [NOTICE](../../NOTICE) e [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
