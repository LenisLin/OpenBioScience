<h1 align="center">OpenScience</h1>

<p align="center">
  <strong>Un espacio de investigación con IA, abierto y orientado a ciencia rigurosa basada en evidencia.</strong>
</p>

<p align="center">
  OpenScience convierte un proyecto local en un lugar donde la IA puede leer fuentes, buscar evidencia, ejecutar análisis, previsualizar archivos, revisar figuras, escribir manuscritos y conservar un rastro de fuentes revisable.
</p>

<p align="center">
  <img src="../../resources/readme/website-openscience-hero.png" alt="OpenScience research workspace overview" width="100%" />
</p>

<p align="center">
  <a href="../../readme.md">English</a> · <a href="./readme_ch.md">简体中文</a> · <a href="./readme_tw.md">繁體中文</a> · <a href="./readme_jp.md">日本語</a> · <a href="./readme_ko.md">한국어</a> · <strong>Español</strong> · <a href="./readme_pt.md">Português</a> · <a href="./readme_tr.md">Türkçe</a> · <a href="./readme_ru.md">Русский</a> · <a href="./readme_uk.md">Українська</a>
</p>

---

## Línea principal

OpenScience aprende de la idea central de Claude Science: la IA científica no debería ser solo un chat, sino un entorno de investigación que organiza proyectos, ejecuta análisis, busca evidencia, conserva artifacts científicos, previsualiza archivos y deja registro de cálculo y revisión.

| Pregunta de investigación | Respuesta de OpenScience |
|---|---|
| Dónde vive el trabajo | En una carpeta de proyecto, no solo en una conversación |
| Puede ejecutar análisis reales | Sí, con Python, R, shell, notebooks y coding agents locales |
| Puede revisarse el resultado | Sí, figuras, tablas, notebooks, informes y manuscritos se abren como artifacts con rastro de fuentes |
| Qué pasa con evidencia médica | Medical Evidence Mode produce informes con fuerza de evidencia, conflictos y límites |
| Puede usar herramientas existentes | Sí, archivos locales, scripts, proveedores de modelos y flujos de coding agents |

---

## Vista del producto

<table>
<tr>
<td width="50%" valign="top">
<img src="../../resources/readme/science-output-workspace.png" alt="OpenScience artifact preview" /><br/>
<sub><b>Artifact preview.</b> El panel normal de vista previa se convierte en una vista científica con fuentes, código, log y revisión junto al archivo.</sub>
</td>
<td width="50%" valign="top">
<img src="../../resources/readme/medical-evidence-report.png" alt="OpenScience medical evidence report" /><br/>
<sub><b>Medical Evidence Mode.</b> Preguntas clínicas y biomédicas se convierten en informes con fuentes, fuerza de evidencia, conflictos y conclusión.</sub>
</td>
</tr>
</table>

---

## Flujo de investigación

| Paso | Qué hace la persona investigadora | Qué conserva OpenScience |
|---:|---|---|
| 1 | Crear o abrir un proyecto | Carpeta, configuración, fuentes, salidas |
| 2 | Hacer una pregunta en lenguaje natural | Tarea, supuestos, archivos, aclaraciones |
| 3 | Buscar y leer evidencia | Etiquetas para papers, ensayos, documentos, datos, figuras o ejecuciones |
| 4 | Ejecutar análisis | Scripts, comandos, notebooks, entradas, logs, entorno |
| 5 | Revisar artifacts | Figuras, tablas, informes, manuscritos, rastro de fuentes, revisión |
| 6 | Revisar y exportar | Versiones, comentarios, PDF, Word, LaTeX, notebooks |

---

## Alcance de evidencia

| Evidencia | Uso |
|---|---|
| 11M+ papers | Revisiones, comparación de métodos, escritura con citas |
| 225K+ documentos de fármacos y dispositivos | Etiquetas, guías, contexto regulatorio, seguridad |
| 1M+ ensayos clínicos | Intervenciones, resultados, estado, comparadores, criterios |
| 150M+ abstracts | Descubrimiento rápido de literatura |
| Archivos locales y salidas | Datos, código, figuras, notebooks, informes, logs |

---

## Inicio rápido

```bash
git clone https://github.com/ResearAI/OpenScience.git
cd OpenScience
bun install
bun run dev
```

README completo en inglés: [readme.md](../../readme.md).

---

## Licencia y agradecimientos

OpenScience es una obra modificada basada en [AionUi](https://github.com/iOfficeAI/AionUi), originalmente publicado bajo Apache-2.0.

Desde este fork/distribución de OpenScience, el proyecto se publica bajo [AGPL-3.0-only](../../LICENSE), excepto los componentes de terceros y archivos con avisos de licencia propios. Los avisos originales de copyright, licencia y atribución de Apache-2.0 se conservan en [LICENSES/Apache-2.0.txt](../../LICENSES/Apache-2.0.txt), [NOTICE](../../NOTICE) y [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
