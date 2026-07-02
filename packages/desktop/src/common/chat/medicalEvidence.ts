/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';
import {
  MEDICAL_EVIDENCE_EVIDENCE_HIERARCHY,
  MEDICAL_EVIDENCE_PAPERCLIP_SOURCE_GROUPS,
  MEDICAL_EVIDENCE_SOURCE_TIER_RULES,
} from './medicalEvidenceDefaults';
import { getPromptLanguageInstruction } from './language';

export const MEDICAL_EVIDENCE_MODE_ID = 'medical_evidence';
export const MEDICAL_EVIDENCE_EVENT_SCHEMA = 'deeporganiser.medical_evidence.event.v1';
export const MEDICAL_EVIDENCE_PANEL_SCHEMA = 'deeporganiser.medical_evidence.panel.v1';
export const MEDICAL_EVIDENCE_FIGURE_SKILL_NAME = 'research-figure-diagram';
export const MEDICAL_EVIDENCE_FIGURE_SKILL_PATH = 'resources/skills/research-figure-diagram/SKILL.md';
export const MEDICAL_EVIDENCE_WRITING_SKILL_NAME = 'draft-to-top-conference-oral';
export const MEDICAL_EVIDENCE_WRITING_SKILL_PATH = 'resources/skills/draft-to-top-conference-oral/SKILL.md';
export const DEFAULT_MEDICAL_EVIDENCE_SKILL_IDS = [
  MEDICAL_EVIDENCE_FIGURE_SKILL_NAME,
  MEDICAL_EVIDENCE_WRITING_SKILL_NAME,
] as const;

export type MedicalEvidenceSource =
  | 'guideline'
  | 'systematic_review'
  | 'rct'
  | 'cohort'
  | 'case_control'
  | 'case_series'
  | 'regulatory'
  | 'drug_label'
  | 'trial_registry'
  | 'abstract'
  | 'other';

export type MedicalEvidenceConfidence = 'high' | 'moderate' | 'low' | 'very_low';

export type MedicalEvidenceQualityBadge =
  | 'leading_journal'
  | 'new_research'
  | 'guideline'
  | 'drug_label'
  | 'regulatory'
  | 'rct'
  | 'systematic_review'
  | 'population_matched'
  | 'anchored'
  | 'figure_available'
  | 'paperclip_verified'
  | 'full_text'
  | 'recent'
  | 'safety'
  | 'applicability_limited';

export type MedicalEvidenceJournalTier = 'leading' | 'specialty' | 'general' | 'unknown';

export type MedicalEvidencePaperclipArtifactKind =
  | 'search'
  | 'metadata'
  | 'content'
  | 'section'
  | 'figures'
  | 'figure_analysis'
  | 'sql'
  | 'export'
  | 'repo';

export interface MedicalEvidencePaperclipArtifact {
  kind: MedicalEvidencePaperclipArtifactKind;
  source?: string;
  command?: string;
  path?: string;
  savedSearchId?: string;
  lineStart?: number;
  lineEnd?: number;
  description?: string;
  count?: number;
}

export interface MedicalEvidencePaperclipRecord {
  sourceId?: string;
  source?: string;
  virtualPath?: string;
  metaPath?: string;
  contentPath?: string;
  sectionsPath?: string;
  figuresPath?: string;
  savedSearchId?: string;
  searchQuery?: string;
  resultRank?: number;
  artifacts?: MedicalEvidencePaperclipArtifact[];
}

export interface MedicalEvidenceAnchor {
  sourceId: string;
  path?: string;
  url?: string;
  lineStart?: number;
  lineEnd?: number;
  quote?: string;
  section?: string;
}

export interface MedicalEvidenceItem {
  id: string;
  title: string;
  sourceType: MedicalEvidenceSource;
  confidence: MedicalEvidenceConfidence;
  grade?: string;
  year?: number;
  publishedAt?: string;
  authors?: string;
  journal?: string;
  journalTier?: MedicalEvidenceJournalTier;
  doi?: string;
  url?: string;
  anchor?: MedicalEvidenceAnchor;
  qualityBadges?: MedicalEvidenceQualityBadge[];
  paperclip?: MedicalEvidencePaperclipRecord;
  summary?: string;
  population?: string;
  applicability?: string;
  direction?: 'supports' | 'against' | 'mixed' | 'context';
}

export interface MedicalEvidenceConflict {
  id: string;
  claim: string;
  explanation: string;
  primaryEvidenceIds: string[];
  conflictingEvidenceIds: string[];
  resolution?: string;
}

export interface MedicalEvidenceAppraisalCandidate {
  evidenceId: string;
  label?: string;
  reason?: string;
  hierarchyRank?: number;
}

export interface MedicalEvidenceAppraisal {
  id: string;
  claim: string;
  conclusion: string;
  confidence: MedicalEvidenceConfidence;
  selectedEvidenceIds: string[];
  alternativeEvidenceIds?: string[];
  rationale: string;
  basis?: string[];
  candidates?: MedicalEvidenceAppraisalCandidate[];
}

export interface MedicalEvidenceFinding {
  id: string;
  title: string;
  conclusion: string;
  confidence: MedicalEvidenceConfidence;
  evidenceIds: string[];
  caveats?: string[];
}

export type MedicalEvidenceReportBlock =
  | {
      type: 'paragraph';
      text: string;
      markdown?: string;
      evidenceIds?: string[];
      confidence?: MedicalEvidenceConfidence;
    }
  | {
      type: 'bullet_list';
      items: Array<{
        text: string;
        evidenceIds?: string[];
        confidence?: MedicalEvidenceConfidence;
      }>;
    }
  | {
      type: 'checklist';
      items: Array<{
        label: string;
        detail?: string;
        status?: 'met' | 'caution' | 'not_met' | 'unknown';
        evidenceIds?: string[];
      }>;
    }
  | {
      type: 'figure_ref';
      figureId: string;
    }
  | {
      type: 'table_ref';
      tableId: string;
    }
  | {
      type: 'card_ref';
      cardId: string;
    }
  | {
      type: 'card_grid';
      cardIds: string[];
    };

export interface MedicalEvidenceReportSection {
  id: string;
  heading?: string;
  blocks: MedicalEvidenceReportBlock[];
  evidenceIds?: string[];
}

export interface MedicalEvidenceReport {
  title?: string;
  sections: MedicalEvidenceReportSection[];
}

export interface MedicalEvidenceFigure {
  id: string;
  kind: 'image' | 'chart' | 'drawio';
  title?: string;
  caption?: string;
  alt?: string;
  figureNumber?: string;
  sourceTitle?: string;
  sourceJournal?: string;
  sourcePath?: string;
  licenseNote?: string;
  imageUrl?: string;
  imagePath?: string;
  svgPath?: string;
  previewSvgPath?: string;
  previewPngPath?: string;
  drawioPath?: string;
  drawioXml?: string;
  chartSpec?: Record<string, unknown>;
  paperclip?: {
    sourceId?: string;
    figurePath?: string;
    askImageQuestion?: string;
    askImageAnswer?: string;
    command?: string;
  };
  evidenceIds?: string[];
}

export interface MedicalEvidenceTable {
  id: string;
  title?: string;
  caption?: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  evidenceIds?: string[];
}

export type MedicalEvidenceReportCardKind =
  | 'quality_references'
  | 'paperclip_trace'
  | 'evidence_hierarchy'
  | 'visual_evidence'
  | 'applicability'
  | 'safety'
  | 'search_strategy'
  | 'claim_map'
  | 'source_coverage'
  | 'takeaway';

export interface MedicalEvidenceReportCardItem {
  label: string;
  value?: string | number;
  detail?: string;
  markdown?: string;
  status?: 'met' | 'caution' | 'not_met' | 'unknown';
  evidenceIds?: string[];
  figureId?: string;
  confidence?: MedicalEvidenceConfidence;
  sourceType?: MedicalEvidenceSource;
  badge?: MedicalEvidenceQualityBadge;
  path?: string;
  command?: string;
  count?: number;
}

export interface MedicalEvidenceReportCard {
  id: string;
  kind: MedicalEvidenceReportCardKind;
  title: string;
  subtitle?: string;
  markdown?: string;
  evidenceIds?: string[];
  figureIds?: string[];
  tableIds?: string[];
  artifacts?: MedicalEvidencePaperclipArtifact[];
  metrics?: Array<{
    label: string;
    value: string | number;
    unit?: string;
    tone?: 'neutral' | 'good' | 'caution' | 'risk';
  }>;
  items?: MedicalEvidenceReportCardItem[];
}

export interface MedicalEvidencePanelData {
  schema: typeof MEDICAL_EVIDENCE_PANEL_SCHEMA;
  runId: string;
  question: string;
  generatedAt?: number;
  summary?: string;
  stats: {
    searches: number;
    recordsFound: number;
    screened: number;
    included: number;
    anchors: number;
    conflicts: number;
  };
  findings: MedicalEvidenceFinding[];
  evidence: MedicalEvidenceItem[];
  appraisals?: MedicalEvidenceAppraisal[];
  conflicts?: MedicalEvidenceConflict[];
  report?: MedicalEvidenceReport;
  cards?: MedicalEvidenceReportCard[];
  figures?: MedicalEvidenceFigure[];
  tables?: MedicalEvidenceTable[];
  methods?: {
    queryPlan?: string[];
    sources?: string[];
    gradingFramework?: string;
    limitations?: string[];
  };
}

export type MedicalEvidenceEvent =
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'run_started';
      runId: string;
      question: string;
      sources?: string[];
      timestamp?: number;
    }
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'search_completed';
      runId: string;
      query: string;
      source: string;
      found: number;
      savedSearchId?: string;
      timestamp?: number;
    }
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'anchor_collected';
      runId: string;
      evidenceId?: string;
      sourceId: string;
      path?: string;
      anchors: MedicalEvidenceAnchor[];
      timestamp?: number;
    }
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'evidence_graded';
      runId: string;
      evidenceId: string;
      confidence: MedicalEvidenceConfidence;
      grade?: string;
      timestamp?: number;
    }
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'figure_attached';
      runId: string;
      figure: MedicalEvidenceFigure;
      timestamp?: number;
    }
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'artifact_read';
      runId: string;
      artifact: MedicalEvidencePaperclipArtifact;
      outputPreview?: string;
      timestamp?: number;
    }
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'panel_submitted';
      runId: string;
      panel: MedicalEvidencePanelData;
      timestamp?: number;
    };

export type MedicalEvidencePayload = MedicalEvidenceEvent | MedicalEvidencePanelData;

export type MedicalEvidenceTraceKind = 'plan' | 'search' | 'anchor' | 'grade' | 'artifact' | 'figure' | 'panel';
export type MedicalEvidenceRuntimeLanguage = 'zh' | 'en';

export interface MedicalEvidenceTraceItem {
  id: string;
  kind: MedicalEvidenceTraceKind;
  label: string;
  detail?: string;
  count?: number;
  timestamp?: number;
}

export interface MedicalEvidenceRuntimeSummary {
  stats: MedicalEvidencePanelData['stats'];
  trace: MedicalEvidenceTraceItem[];
  hasPanel: boolean;
  language: MedicalEvidenceRuntimeLanguage;
  processEventCount: number;
  stageKeys: MedicalEvidenceTraceKind[];
}

export interface MedicalEvidenceConversationExtra {
  enabled: true;
  mode: typeof MEDICAL_EVIDENCE_MODE_ID;
  report: {
    enabled: true;
    render: 'inline_structured';
    figures: true;
    drawioPreview: true;
  };
  paperclip: {
    enabled: true;
    sources: string[];
    strictAnchors: boolean;
  };
  figureSkill: {
    enabled: true;
    name: typeof MEDICAL_EVIDENCE_FIGURE_SKILL_NAME;
    path: typeof MEDICAL_EVIDENCE_FIGURE_SKILL_PATH;
    useWhen: 'clinical_report_needs_visual_evidence';
  };
  writingSkill: {
    enabled: true;
    name: typeof MEDICAL_EVIDENCE_WRITING_SKILL_NAME;
    path: typeof MEDICAL_EVIDENCE_WRITING_SKILL_PATH;
    useWhen: 'clinical_report_needs_reader_onboarding_or_editorial_structure';
  };
  sopVersion: 1;
}

export const buildMedicalEvidenceConversationExtra = (sources: string[], strictAnchors = true): MedicalEvidenceConversationExtra => ({
  enabled: true,
  mode: MEDICAL_EVIDENCE_MODE_ID,
  report: {
    enabled: true,
    render: 'inline_structured',
    figures: true,
    drawioPreview: true,
  },
  paperclip: {
    enabled: true,
    sources,
    strictAnchors,
  },
  figureSkill: {
    enabled: true,
    name: MEDICAL_EVIDENCE_FIGURE_SKILL_NAME,
    path: MEDICAL_EVIDENCE_FIGURE_SKILL_PATH,
    useWhen: 'clinical_report_needs_visual_evidence',
  },
  writingSkill: {
    enabled: true,
    name: MEDICAL_EVIDENCE_WRITING_SKILL_NAME,
    path: MEDICAL_EVIDENCE_WRITING_SKILL_PATH,
    useWhen: 'clinical_report_needs_reader_onboarding_or_editorial_structure',
  },
  sopVersion: 1,
});

export const isMedicalEvidenceConversationExtra = (
  extra: unknown
): extra is { medical_evidence: MedicalEvidenceConversationExtra } => {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return false;
  const medicalEvidence = (extra as Record<string, unknown>).medical_evidence;
  if (!medicalEvidence || typeof medicalEvidence !== 'object' || Array.isArray(medicalEvidence)) return false;

  const record = medicalEvidence as Partial<MedicalEvidenceConversationExtra> & Record<string, unknown>;
  return record.enabled === true && (record.mode === MEDICAL_EVIDENCE_MODE_ID || record.report !== undefined);
};

const medicalEvidenceSourceGroupPrompt = MEDICAL_EVIDENCE_PAPERCLIP_SOURCE_GROUPS.map(
  (group) => `- ${group.label}: ${group.sources.join(', ')}. ${group.intent}`
).join('\n');

const medicalEvidenceHierarchyPrompt = MEDICAL_EVIDENCE_EVIDENCE_HIERARCHY.map(
  (tier) => `- E${tier.rank}. ${tier.label} (${tier.confidence}): ${tier.rule}`
).join('\n');

const medicalEvidenceSourceTierPrompt = MEDICAL_EVIDENCE_SOURCE_TIER_RULES.map((rule) => `- ${rule}`).join('\n');

export const buildMedicalEvidenceModePrompt = (
  sources: string[],
  strictAnchors = true,
  preferredLocale?: string,
  agentBackend?: string
): string => {
  const isCodexRuntime = agentBackend === 'codex';
  const codexImageFigureInstructions = isCodexRuntime
    ? [
        '- Codex runtime image workflow: when a non-trivial report would benefit from a single explanatory figure, prefer requesting the configured image generation tool/model rather than hand-drawing the final image. Ask for GPT-IMAGE-2, or the newest available image generation model if GPT-IMAGE-2 is unavailable.',
        '- For Codex-generated medical evidence figures, request a 4K or highest-available-resolution image on a pure white background. The figure must adapt all visible text to the user/report language, use large readable typography, and show only the information that most helps the reader understand the clinical conclusion.',
        '- Keep Codex image prompts compact and editorial: one clear title, 3-5 labeled nodes or regions, evidence-aware labels, no dense paragraphs, no decorative medical stock imagery, no dark background, and no information overload. The image should explain the answer, not replace the evidence ledger.',
        '- After the image is generated, attach the saved image through evidence_attach_figure or panel.figures with kind:"image", imagePath or previewPngPath, title, caption, alt text, and evidenceIds. If generation fails or no image model is configured, fall back to the non-Codex diagram workflow below or omit the figure.',
      ]
    : [
        '- Non-Codex runtime workflow: continue using the existing editable figure path. Prefer Graphviz/Mermaid/draw.io-friendly diagrams for pathways and Python/matplotlib for data charts. Draw.io is preferred when the diagram may need later manual editing. If you create or receive a drawio file, also provide previewSvgPath or previewPngPath when possible.',
      ];

  return [
    '# Medical Evidence Mode',
    '',
    `You are running inside OpenScience Medical Evidence Mode. Use the existing agent runtime as usual, but treat medical claims as evidence-bound work. From the first paragraph of the final report, write in the editorial style adapted from ${MEDICAL_EVIDENCE_WRITING_SKILL_NAME}: reader cognition first, clear story spine, compact clinical background, one job per paragraph, explicit transitions, and plain-language interpretation of evidence, tables, figures, and cards before expecting the user to inspect details.`,
    getPromptLanguageInstruction(preferredLocale),
    '',
    'The target is a compact Nature/NEJM-style clinical evidence note: cautious like a clinician, readable for a non-expert, and traceable like a paper. Do not write a compressed answer, a retrieval log, or a table dump. Orientation sentences may explain the background and motivation, while diagnosis/treatment/safety/threshold/applicability conclusions must remain evidence-bound.',
    '',
    '## Mandatory Workflow',
    '1. Clarify the clinical question like a cautious physician: population, disease stage/severity, intervention/exposure, comparator, outcomes, setting, and safety exclusions. Use PICO when possible.',
    '2. Start a retrieval run with evidence_start_run, then use the openscience-medical-evidence MCP tools before answering medical knowledge questions. Do not rely only on model memory.',
    `3. Search PaperClip sources first: ${sources.join(', ')}. Use multiple search angles before synthesizing: clinical guideline/consensus terms, medication label/regulatory terms when safety or dosing is involved, systematic review/RCT terms, and the user's exact symptom/drug/disease terms. Do not stop at the first supportive result.`,
    '4. Search broadly enough to support the answer. When feasible, cover at least three complementary source families: guidelines/labels/regulatory sources, systematic reviews/meta-analyses or high-quality RCTs, and recent clinical studies or registries for context. For narrow medication safety questions, regulatory/drug-label sources are mandatory when available.',
    '5. Collect paragraph or line anchors from PaperClip virtual files such as /papers/<id>/content.lines or /fda/<id>/content.lines for statements you will cite. If a key claim has no anchor, downgrade confidence and state the limitation.',
    '6. Grade evidence strength and applicability with a conservative hierarchy: up-to-date specialty guidelines, regulatory/drug labels for medication safety, systematic reviews/meta-analyses, RCTs, high-quality observational studies, then case series/abstracts/registries. Adjust for recency, population match, pediatric/adult mismatch, dose/route/context limits, pregnancy, comorbidity, and disease-stage differences.',
    '7. If retrieved evidence or standard triage logic shows that missing user information could change the recommendation, pause before final synthesis and call the openscience-user-input MCP tool user_input. Ask at most 3 concise questions. Prefer single_choice or multi_choice with an “unknown/not sure” or “other” path; use text only when choices would be unsafe. If user_input returns timeout/skipped/cancelled/unavailable, ask in ordinary text only if the missing information is still decisive; otherwise write an uncertainty-limited report.',
    '8. If sources materially diverge, do an evidence appraisal instead of treating both sides equally: selected evidence, lower-weight alternative evidence, hierarchy/applicability reason, and adopted clinical conclusion.',
    '9. Write like a careful clinician: separate “can consider”, “should not”, “requires clinician assessment”, and “insufficient evidence”. Avoid overconfident treatment changes. Mention emergency or high-risk boundaries when relevant.',
    '10. Every clinically meaningful conclusion in the report must carry traceable evidenceIds. Do not manually write citation markers such as [E1] [E2] inside summary, text, label, detail, table cells, or card fields; the UI renders citation anchors from evidenceIds. Do not cite sources that were not actually retrieved. Do not write a conclusion first and look for evidence later.',
    '11. Before the final visible answer, call evidence_submit_panel with the full structured report. In Medical Evidence Mode the UI renders the report; keep final prose very short and do not duplicate the report in plain text.',
    '',
    '## Medical Evidence SOP',
    '- Step A: Frame. Restate the clinical decision, patient group, exclusions, and outcome priorities. Identify missing variables that could change safety, urgency, dose, population applicability, or interpretation.',
    '- Step B: Clarification gate. If missing variables are clinically decisive according to retrieved evidence or standard triage logic, use user_input before the final report. Keep questions short, grouped, and answerable with choices when possible. Include “unknown/not sure” or “other” options when appropriate. If the user cannot answer or the tool times out, write an uncertainty-limited report instead of guessing, and explicitly state which missing information would change the conclusion.',
    '- Step C: Retrieve. Search from multiple angles and source families. Minimum target when feasible: guideline/consensus or regulatory/label source, review/meta-analysis or RCT source, and a recent clinical study/registry/context source. Use synonyms and official terms; document the actual query/source path in process metadata when useful.',
    '- Step D: Screen. Include only sources whose population and intervention actually match; record mismatch as applicability limits. Prefer newer high-tier evidence over older lower-tier evidence when both answer the same clinical claim.',
    '- Step E: Anchor. Collect exact paragraph/line anchors for every claim that will appear in the report. If a conclusion cannot be anchored, either remove it, mark it as background/non-actionable, or label it insufficient evidence.',
    '- Step F: Enrich. Use evidence_read_artifact when helpful to read PaperClip artifacts that support the report: /papers/<id>/meta.json for title/authors/journal/year/DOI; /papers/<id>/content.lines or sections/*.lines for anchors; /papers/<id>/figures/ plus ask_image for visual evidence; SQL/export for source coverage or counts; repo citations when using a PaperClip paper repo.',
    '- Step G: Grade. Assign high/moderate/low/very_low and explain downgrades for indirectness, age mismatch, outdated evidence, small samples, surrogate outcomes, missing anchor, or safety uncertainty. Each conclusion should cite at least one appropriate high-tier source when available; if only low-tier evidence exists, say so plainly.',
    '- Step H: Claim audit. Before writing the final report, list the intended clinical conclusions internally and verify that each has matching evidenceIds, anchors, applicability notes, and confidence. Delete or soften any conclusion that fails this audit.',
    '- Step I: Reader onboarding. Before synthesis, make a short internal draft of the reader path: what clinical background the user needs, why this question matters, what evidence was prioritized, what the conclusion means in plain language, and what remains uncertain. This is adapted from the bundled oral-paper writing skill: write for reader cognition, use section/paragraph jobs, introduce tables/figures before expecting the user to interpret them, and never dump results without interpretation.',
    `- Step J: Visual plan. Usually try to include one evidence-bound visual element when it improves comprehension: a clinical decision path, evidence hierarchy/source weighting diagram, source distribution chart, mechanism sketch, medication safety table figure, or “applies / does not apply” pathway. ${isCodexRuntime ? 'In Codex, prefer a generated high-resolution explanatory image when it best helps the reader; otherwise use the editable diagram workflow.' : 'Prefer editable draw.io/Graphviz/Mermaid-style diagrams for pathways and SVG/PNG previews for rendering.'} Skip the visual only when it would be decorative, unsupported, or less clear than prose.`,
    '- Step K: Synthesize. Produce a clinically readable report: bottom-line conclusion, one or two plain-language background/motivation sentences when needed, point-by-point answer, conditions where it applies, when not to apply it, what information is still needed, and what to verify with a clinician.',
    '- Step L: Submit. Use evidence_submit_panel. Prefer report.sections over a short free-text answer; use findings as concise highlights and evidence as the traceable reference ledger.',
    '',
    '## PaperClip Source Coverage Preset',
    'Default PaperClip coverage is intentionally broad. Search across all enabled source families when the question is not already narrow, then screen and rank instead of omitting source families prematurely.',
    medicalEvidenceSourceGroupPrompt,
    '',
    '## Evidence and Journal Tiering Standard',
    'Use this hierarchy as the default grading rubric. Record downgrades explicitly for indirect population, outdated source, small sample, surrogate endpoint, missing anchor, or safety uncertainty.',
    medicalEvidenceHierarchyPrompt,
    '',
    'Source and journal tier rules:',
    medicalEvidenceSourceTierPrompt,
    '',
    '## Report Writing and Markdown Style SOP',
    '- The final report should read like a compact Nature/NEJM-style clinical evidence note, not a chat transcript and not an AI run log. Choose the report language from the preferred response language above unless the user explicitly asks for another language. Do not mix UI prose across languages. Keep official titles, journal names, guideline names, drug labels, DOI strings, URLs, and quoted source text in their original language unless the user asks for translation.',
    `- When report writing needs stronger story, reader onboarding, table/figure roles, or oral-paper pacing, use the bundled ${MEDICAL_EVIDENCE_WRITING_SKILL_NAME} skill: ${MEDICAL_EVIDENCE_WRITING_SKILL_PATH}. Apply its principles, not its conference-specific wording: optimize for reader cognition, build a story spine, give each section and paragraph one job, signpost transitions, and make tables/figures explain a question rather than act as storage.`,
    '- Editorial Hybrid means a standardized reading layout, not a fixed paper outline. Do not force every answer into abstract/introduction/evidence synthesis. Choose a structure that matches what the user is trying to decide, then use restrained academic CSS-friendly blocks.',
    '- The report must have human-readable connective tissue. It should not assume the reader already knows the clinical background. Include concise plain-language setup, motivation, or interpretation sentences when they help the user understand why the evidence matters. These sentences do not need citation anchors if they are purely orienting and do not introduce a clinical claim, but every diagnosis/treatment/safety/threshold conclusion still needs evidenceIds.',
    '- Use a clear narrative spine: context -> what decision is being made -> how evidence was prioritized -> bottom-line answer -> point-by-point evidence interpretation -> practical boundaries/next steps. Keep it compact, but do not remove the setup sentences that make the answer readable.',
    '- Use paragraph jobs deliberately: one paragraph should either set up the clinical problem, state the main pattern, interpret a table/figure/card, answer an objection, or explain an applicability boundary. Split paragraphs that mix too many jobs.',
    '- Use explicit transitions when the report changes jobs, for example: “这个问题的关键在于…”, “这条证据的意义是…”, “因此对当前场景来说…”, “需要注意的是…”. These are allowed because they reduce cognitive load; do not remove all connective language just to make every sentence look like a citation-bearing conclusion.',
    '- Choose one of these default report structures when applicable:',
    '  1. Symptom triage / 症状自查: sections should prioritize “先看风险信号”, “可能方向”, “什么时候就医/急诊”, “可观察与记录的信息”, then evidence. Use checklist blocks more than tables.',
    '  2. Care-seeking advice / 就医建议: sections should prioritize “是否需要就医”, “建议科室/时限”, “就诊前准备”, “哪些情况升级处理”, then evidence. Use concise decision blocks and avoid broad disease lectures.',
    '  3. Disease or mechanism analysis / 病情分析: sections should prioritize “最可能解释”, “需要排除的情况”, “关键证据”, “下一步检查或确认”, then evidence. Use a figure only if it clarifies mechanism or pathway.',
    '  4. Doctor-order interpretation / 医嘱解读: sections should prioritize “医嘱在解决什么问题”, “应遵循的关键点”, “常见误解/不可自行调整”, “复诊或监测指标”, then evidence. Drug labels/regulatory sources are mandatory when medication safety is involved.',
    '- If none of the four patterns fits, use a short custom structure with the bottom-line answer first, then evidence, applicability boundaries, and references.',
    '- Default answer logic is 总-分-总: first give a direct bottom-line answer with a brief context bridge; then answer point-by-point with evidence and interpretation; finally close with applicability boundaries, evidence gaps, and when to seek clinician review. Avoid abrupt lists whose clinical role is unclear.',
    '- Do not include a generic “回答结构/Reasoning map/推理路径” module in the final report. Those are internal planning or audit concepts, not clinical report content. If the user needs to understand why a conclusion follows, use a content-specific section title such as “为什么这样判断”, “高级气道证据如何解读”, or “对当前病区的意义”, and summarize evidence rather than exposing the agent workflow.',
    '- Every answer-bearing point must cite evidenceIds. Keep citation ids out of visible prose fields; do not append literal [E1] style markers to text because the UI appends anchors automatically. If a point lacks usable evidence, do not present it as a conclusion; write “暂无证据支撑……” / “Current evidence is insufficient to support …” and explain what information or source would be needed.',
    '- Do not use colloquial phrases such as “没有看到”, “没看到”, “查不到”, or “看不到” in the final report. Use professional evidence language: “暂无证据支撑”, “当前检索证据未能支持”, “证据不足以推出”, or “需补充患者信息后判断”.',
    '- Never submit a bare checklist or bullet list without a section heading that explains its clinical role. A list like “BMV 可维持 / BMV 困难 / 专家团队 / 已建高级气道” must be under a heading such as “气道策略的适用条件” or “需要现场确认的条件”, and each item should include a short detail or evidenceIds when it affects the answer.',
    '- Put the answer-bearing conclusion directly under the title in whatever structure you choose. Do not put quality_references, PaperClip trace, source coverage, or evidence hierarchy before the user-facing conclusion.',
    '- The final report body must not contain internal instruction text, schema labels, or process explanations such as “已纳入 N 条证据并按层级加权”, “每条结论均需回链到 E 编号证据”, “从问题到证据再到结论的阅读路径”, “检索计划”, “推理路径”, or “回答结构”. Put retrieval, weighting, and audit details into panel.methods or process cards that the UI can keep collapsed.',
    '- Section headings must be content-specific and non-duplicated. Avoid generic headings such as “回答结构”, “推理路径”, “证据依据”, “临床问题”, “Clinical question”, “Evidence basis”, or “Reasoning map”. Prefer headings that name the clinical issue: “按压深度是否需要改变”, “肾上腺素给药时机”, “高级气道选择”, “适用边界与证据缺口”.',
    '- The UI renders Markdown emphasis written as **key phrase** with a half-height highlight underline. Body emphasis is warm/yellow for decisive clinical wording; table emphasis is rendered separately in a muted medical green for classification, status, or decision cells. Use this sparingly and only when emphasis helps the reader: recommended action, population boundary, contraindication/safety boundary, confidence downgrade, key numeric threshold, or the evidence standard being adopted.',
    '- In the 答案总览/Bottom Line paragraph, decide whether Markdown bold is useful. Do not force bolding. When the answer contains a single decisive sentence that the user should notice immediately, you may bold that sentence or a short phrase; otherwise leave the overview as normal prose.',
    '- In tables, use **key phrase** mainly for short judgment cells such as **可考虑**, **不建议**, **需医生评估**, **High certainty**, or **Adult-only evidence**. In body paragraphs, use it for the one phrase the clinician should notice first.',
    '- Do not bold whole paragraphs, whole list items, citation ids, or decorative words. Usually 1-6 words per emphasis is enough; too much emphasis makes the report look less professional.',
    '- Every emphasized clinical claim must still carry evidenceIds. Emphasis is not a substitute for evidence anchors.',
    '- Use neutral academic Chinese: short paragraphs, clear section headings, compact checklist rows, and tables only for structured comparisons. Avoid marketing language, self-praise, or explaining UI behavior to the user.',
    '- Cards must remain single-column evidence modules and should read like inline editorial callouts, not dashboard widgets. Never use two-column card layouts in the final report.',
    '- Cards and card items may include an independent markdown field for explanatory text. Use markdown for short paragraphs and bullets that explain the meaning of a card in plain language, for example why a checklist matters, how to read a confidence boundary, or what a source-weighting module changes in the clinical conclusion. Keep citations out of the markdown text itself; attach evidenceIds to the card or item.',
    '- Use cards sparingly. The default visual style is plain/no-border editorial blocks; do not create multiple cards that differ only by border color. Prefer ordinary paragraphs, checklists, tables, or a single figure unless the card has a distinct semantic job.',
    '- Card usage contract: takeaway is a short final-conclusion or checkpoint block; applicability is for who this applies to and what to record; safety is for red flags, contraindications, and do-not-self-adjust boundaries; claim_map links a specific conclusion to specific evidence ids; evidence_hierarchy explains source weighting only when it changes the answer; visual_evidence links real figures/tables/drawio/image evidence; quality_references highlights a few top references but does not replace the references section; search_strategy/source_coverage/paperclip_trace are method/process metadata and should be hidden from the main clinical reading flow unless the user asks to audit retrieval.',
    '- Do not duplicate the same information as both a chart and a card. If a figure already shows source distribution, the evidence_hierarchy card should explain how the hierarchy affects the clinical conclusion, not repeat the chart.',
    '- paperclip_trace, search_strategy, source_coverage, and raw command/path details are generation-process or methods metadata. Do not place them in the main report body unless the user explicitly asks to audit retrieval. Prefer panel.methods or an unreferenced card so the UI can keep it out of the final clinical reading flow.',
    '- quality_references should not replace the References section. Use it only as a compact highlight after the clinical summary, never before the summary.',
    '- Use tables only when a matrix is genuinely easier than prose, such as scenario / judgment / evidence / applicability. Tables are rendered as academic three-line tables: top rule, header rule, bottom rule, no heavy grid. Do not make table layout the default report shape. Keep cells short and use **key phrase** inside cells only when it helps scanning.',
    '- In most medical evidence reports, actively consider adding one figure or diagram. Prefer a figure when it clarifies a clinical pathway, evidence hierarchy, source distribution, quantitative comparison, mechanism, or applicability boundary. Attach image, chart, or drawio previews through evidence_attach_figure/panel.figures with evidenceIds. Do not add a figure merely to make the report look impressive.',
    '',
    '## Figure and Diagram SOP',
    `- Medical Evidence Mode enables the bundled ${MEDICAL_EVIDENCE_FIGURE_SKILL_NAME} skill by default: ${MEDICAL_EVIDENCE_FIGURE_SKILL_PATH}. Use it whenever a visual would make the clinical reasoning more legible.`,
    '- A figure is evidence, not decoration. Usually attempt one compact visual for non-trivial reports, but only keep it when it clarifies a quantitative comparison, evidence hierarchy, clinical decision path, source distribution, mechanism, or applicability boundary.',
    '- Before creating a figure, write a compact figure contract internally: Claim, Evidence map, Figure type, Output contract, Review risks.',
    ...codexImageFigureInstructions,
    `- For data figures, use Python/matplotlib with ${MEDICAL_EVIDENCE_FIGURE_SKILL_PATH.replace('/SKILL.md', '/scripts/pubfig.py')} when available. Prefer SVG/PDF first, PNG preview second.`,
    '- Attach figures through evidence_attach_figure or panel.figures. Every figure/table must have title/caption and evidenceIds when it supports a medical claim.',
    '- Good default figure choices: evidence source distribution, evidence certainty bar, “when this applies / does not apply” pathway, clinical decision flow, mechanism sketch, or a table-like medication/safety summary. Do not invent effect sizes or pseudo-data.',
    '',
    '## Evidence Panel Contract',
    '- Use stable ids E1, E2, ... for included evidence.',
    '- Include source type, confidence, grade, applicability, DOI/URL/path when available, and line anchors when available. For PaperClip sources, include paperclip.virtualPath, metaPath, contentPath, figuresPath, savedSearchId, searchQuery, resultRank, and artifacts when known.',
    '- qualityBadges must be evidence-derived: leading_journal only when journal/source is genuinely top-tier or guideline-grade; new_research/recent only when publication date supports it; anchored only when line anchors exist; figure_available only when PaperClip figures or submitted figures exist; paperclip_verified only when artifacts were actually read.',
    '- Include appraisals only when evidence needs weighing or an applicability limitation changes the answer. An appraisal must identify the selected evidence ids, lower-weight alternative evidence ids when present, rationale, basis, confidence, and conclusion. Use legacy disagreement fields only for backwards compatibility.',
    '- Prefer report.sections for the final report body. Each paragraph, checklist item, table, and figure should map back to evidenceIds. Do not duplicate those ids in text, label, detail, caption, or table cell strings.',
    '- Preferred report.sections order: 答案总览/Bottom line, 背景与判断依据/Context and rationale when needed, 分点临床结论/Evidence-backed clinical points, 图示解读/Visual interpretation when a figure exists, 对当前场景的意义/Patient-or-setting implications when context exists, 适用边界与证据缺口/Applicability and evidence gaps, then references are rendered automatically from evidence.',
    '- cards supports compact editorial modules. Use them only when data exists and the module changes readability: quality_references for high-value citations, paperclip_trace for commands/paths read, evidence_hierarchy for source strength, visual_evidence for PaperClip figures/ask-image/guideline diagrams, applicability/safety for clinical boundaries, search_strategy/source_coverage for transparent retrieval. Do not use cards as decoration.',
    '- figures supports imageUrl/imagePath/svgPath/previewSvgPath/previewPngPath/drawioPath/chartSpec. For drawio, always include a preview path when possible so the report can render it.',
    '- tables supports compact evidence tables. Do not put long paragraphs inside table cells.',
    '- evidence_submit_panel is strict structured JSON. Use only these report block types and fields: paragraph {type:"paragraph", text, markdown?, evidenceIds?}; bullet_list {type:"bullet_list", items:[{text,evidenceIds?,confidence?}]}; checklist {type:"checklist", items:[{label,detail?,status?,evidenceIds?}]}; figure_ref {type:"figure_ref", figureId}; table_ref {type:"table_ref", tableId}; card_ref {type:"card_ref", cardId}; card_grid {type:"card_grid", cardIds}. Do not invent block types such as summary/table/image/text_block.',
    '- cards items may use {label, value?, detail?, markdown?, status?, evidenceIds?, figureId?, confidence?, sourceType?, badge?, path?, command?, count?}. A card may also include markdown for a standalone explanatory text block. Use detail for one-line explanations; use markdown for multiple sentences or bullets.',
    '- paperclip.artifacts must be an array of objects, never strings. Valid object examples: {kind:"search", command:"search -s pmc ...", savedSearchId:"s_..."}, {kind:"content", path:"/papers/PMC.../content.lines", lineStart:40, lineEnd:48}, {kind:"metadata", path:"/papers/PMC.../meta.json"}, {kind:"figures", path:"/papers/PMC.../figures/"}',
    '- appraisals must include id, claim, conclusion, confidence, selectedEvidenceIds, rationale, and optional basis as an array of strings. Do not put basis as one string. Use appraisals for evidence hierarchy, applicability limits, or when a higher-quality source outweighs a lower-quality source.',
    '- conflicts is optional and should usually be omitted. Only include conflicts when two retrieved sources materially disagree. If included, every item must have id, claim, explanation, primaryEvidenceIds, conflictingEvidenceIds, and optional resolution.',
    '- tables must include id, columns, and rows. If you cannot provide columns and rows, use a paragraph, checklist, or card instead of a table.',
    '- checklist items require label; bullet_list items require text. If you are unsure which to use, prefer paragraph blocks with evidenceIds.',
    `- Strict anchors: ${strictAnchors ? 'on. If a claim lacks a retrievable paragraph anchor, mark confidence lower and state the limitation.' : 'off, but still collect anchors whenever possible.'}`,
    '',
    '## Safety',
    'This mode supports clinical reasoning and literature review. It must not present itself as a substitute for a licensed clinician, and must recommend professional evaluation for diagnosis, treatment changes, emergencies, pregnancy, pediatrics, complex comorbidity, or medication safety decisions.',
  ].join('\n');
};

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const stripFence = (value: string): string => {
  const trimmed = value.trim();
  const opening = trimmed.match(/^```(?:json)?\s*/u);
  if (!opening) return trimmed;
  return trimmed.slice(opening[0].length).replace(/\s*```\s*$/u, '').trim();
};

function parsePayloadString(text: string, depth = 0): MedicalEvidencePayload | undefined {
  if (depth > 6 || !text.includes('deeporganiser.medical_evidence.')) return undefined;
  const candidates = [stripFence(text)];
  const schemaIndex = text.indexOf('deeporganiser.medical_evidence.');
  if (schemaIndex >= 0) {
    const start = text.lastIndexOf('{', schemaIndex);
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      candidates.push(text.slice(start, end + 1));
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const payload = findPayloadCandidate(parsed, depth + 1);
      if (payload) return payload;
    } catch {
      // Continue with other candidates.
    }
  }
  return undefined;
}

function findPayloadCandidate(value: unknown, depth = 0): MedicalEvidencePayload | undefined {
  if (depth > 6) return undefined;
  if (typeof value === 'string') return parsePayloadString(value, depth + 1);
  if (Array.isArray(value)) {
    for (const item of value) {
      const payload = findPayloadCandidate(item, depth + 1);
      if (payload) return payload;
    }
    return undefined;
  }
  const record = toRecord(value);
  if (!record) return undefined;
  if (record.schema === MEDICAL_EVIDENCE_PANEL_SCHEMA) return value as MedicalEvidencePanelData;
  if (record.schema === MEDICAL_EVIDENCE_EVENT_SCHEMA) return value as MedicalEvidenceEvent;
  for (const nested of Object.values(record)) {
    const payload = findPayloadCandidate(nested, depth + 1);
    if (payload) return payload;
  }
  return undefined;
}

const parsePayloadCandidate = (text: string): MedicalEvidencePayload | undefined =>
  parsePayloadString(text);

const getToolGroupOutput = (message: IMessageToolGroup): string[] =>
  Array.isArray(message.content)
    ? message.content
        .flatMap((tool) => {
          const result = tool.result_display;
          if (!result) return [];
          if (typeof result === 'string') return [result];
          if ('output' in result && typeof result.output === 'string') return [result.output];
          if ('result' in result && typeof result.result === 'string') return [result.result];
          if ('text' in result && typeof result.text === 'string') return [result.text];
          return [];
        })
        .filter(Boolean)
    : [];

const getAcpToolOutput = (message: IMessageAcpToolCall): string[] => {
  const update = message.content?.update;
  const textParts =
    update?.content
      ?.map((item) => (item.type === 'content' ? item.content?.text : undefined))
      .filter((item): item is string => Boolean(item)) ?? [];
  const rawOutput = update?.rawOutput || update?.raw_output;
  return [...textParts, ...(rawOutput ? [JSON.stringify(rawOutput)] : [])];
};

const getToolCallOutput = (message: IMessageToolCall): string[] =>
  [message.content.output, message.content.error].filter((item): item is string => Boolean(item));

export const extractMedicalEvidencePayloadsFromTools = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): MedicalEvidencePayload[] =>
  messages.flatMap((message) => {
    const outputs =
      message.type === 'tool_group'
        ? getToolGroupOutput(message)
        : message.type === 'acp_tool_call'
          ? getAcpToolOutput(message)
          : getToolCallOutput(message);
    return outputs.map(parsePayloadCandidate).filter((payload): payload is MedicalEvidencePayload => Boolean(payload));
  });

export const latestMedicalEvidencePanel = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): MedicalEvidencePanelData | undefined => {
  const panels = extractMedicalEvidencePayloadsFromTools(messages)
    .map((payload) => {
      if ((payload as MedicalEvidencePanelData).schema === MEDICAL_EVIDENCE_PANEL_SCHEMA) {
        return payload as MedicalEvidencePanelData;
      }
      if ((payload as MedicalEvidenceEvent).event === 'panel_submitted') {
        return (payload as Extract<MedicalEvidenceEvent, { event: 'panel_submitted' }>).panel;
      }
      return undefined;
    })
    .filter((panel): panel is MedicalEvidencePanelData => Boolean(panel));
  return panels.at(-1);
};

const getPayloadTextForLanguage = (payload: MedicalEvidencePayload): string[] => {
  if ((payload as MedicalEvidencePanelData).schema === MEDICAL_EVIDENCE_PANEL_SCHEMA) {
    const panel = payload as MedicalEvidencePanelData;
    const text: Array<string | undefined> = [panel.summary, panel.report?.title];
    for (const section of panel.report?.sections || []) {
      text.push(section.heading);
      for (const block of section.blocks) {
        if (block.type === 'paragraph') text.push(block.text);
        if (block.type === 'bullet_list') text.push(...block.items.map((item) => item.text));
        if (block.type === 'checklist') {
          for (const item of block.items) text.push(item.label, item.detail);
        }
      }
    }
    for (const finding of panel.findings) text.push(finding.title, finding.conclusion);
    return text.filter((item): item is string => Boolean(item));
  }
  if ((payload as MedicalEvidenceEvent).schema !== MEDICAL_EVIDENCE_EVENT_SCHEMA) return [];
  const event = payload as MedicalEvidenceEvent;
  if (event.event === 'run_started') return [event.question, ...(event.sources || [])];
  if (event.event === 'search_completed') return [event.query, event.source];
  if (event.event === 'figure_attached') return [event.figure.title, event.figure.caption].filter((item): item is string => Boolean(item));
  if (event.event === 'artifact_read') return [event.artifact.description, event.artifact.source].filter((item): item is string => Boolean(item));
  if (event.event === 'panel_submitted') return getPayloadTextForLanguage(event.panel);
  return [];
};

const detectMedicalEvidenceRuntimeLanguage = (payloads: MedicalEvidencePayload[]): MedicalEvidenceRuntimeLanguage => {
  const text = payloads.flatMap(getPayloadTextForLanguage).join(' ');
  const chineseChars = text.match(/[\u3400-\u9fff]/gu)?.length || 0;
  const latinWords = text.match(/[A-Za-z][A-Za-z-]{2,}/gu)?.length || 0;
  return chineseChars >= Math.max(8, latinWords * 2) ? 'zh' : 'en';
};

const traceLabels = {
  zh: {
    resultPanel: '结果框',
    evidenceUnit: '条证据',
    searchPlan: '检索计划',
    search: '检索',
    anchor: '锚定',
    anchorUnit: '段',
    grade: '分级',
    figure: '图表',
    output: '输出',
    artifact: {
      search: '检索',
      metadata: '元数据',
      content: '原文',
      section: '章节',
      figures: '图像',
      figure_analysis: '读图',
      sql: 'SQL',
      export: '导出',
      repo: '引用库',
    },
  },
  en: {
    resultPanel: 'Report',
    evidenceUnit: 'evidence items',
    searchPlan: 'search plan',
    search: 'Search',
    anchor: 'Anchor',
    anchorUnit: 'anchors',
    grade: 'Grade',
    figure: 'Figure',
    output: 'Report',
    artifact: {
      search: 'Search',
      metadata: 'Metadata',
      content: 'Full text',
      section: 'Section',
      figures: 'Figures',
      figure_analysis: 'Figure analysis',
      sql: 'SQL',
      export: 'Export',
      repo: 'Reference library',
    },
  },
} satisfies Record<MedicalEvidenceRuntimeLanguage, {
  resultPanel: string;
  evidenceUnit: string;
  searchPlan: string;
  search: string;
  anchor: string;
  anchorUnit: string;
  grade: string;
  figure: string;
  output: string;
  artifact: Record<MedicalEvidencePaperclipArtifactKind, string>;
}>;

const traceFromPayload = (
  payload: MedicalEvidencePayload,
  index: number,
  language: MedicalEvidenceRuntimeLanguage
): MedicalEvidenceTraceItem | undefined => {
  const labels = traceLabels[language];
  if ((payload as MedicalEvidencePanelData).schema === MEDICAL_EVIDENCE_PANEL_SCHEMA) {
    return undefined;
  }

  if ((payload as MedicalEvidenceEvent).schema !== MEDICAL_EVIDENCE_EVENT_SCHEMA) return undefined;
  const event = payload as MedicalEvidenceEvent;
  if (event.event === 'run_started') {
    return {
      id: `plan-${event.runId}-${event.timestamp || index}`,
      kind: 'plan',
      label: 'PICO',
      detail: event.sources?.join(', ') || labels.searchPlan,
      timestamp: event.timestamp,
    };
  }
  if (event.event === 'search_completed') {
    return {
      id: `search-${event.runId}-${event.savedSearchId || event.timestamp || index}`,
      kind: 'search',
      label: labels.search,
      detail: `${event.source} · ${event.found}`,
      count: event.found,
      timestamp: event.timestamp,
    };
  }
  if (event.event === 'anchor_collected') {
    return {
      id: `anchor-${event.runId}-${event.sourceId}-${event.timestamp || index}`,
      kind: 'anchor',
      label: labels.anchor,
      detail: `${event.sourceId} · ${event.anchors.length} ${labels.anchorUnit}`,
      count: event.anchors.length,
      timestamp: event.timestamp,
    };
  }
  if (event.event === 'evidence_graded') {
    return {
      id: `grade-${event.runId}-${event.evidenceId}-${event.timestamp || index}`,
      kind: 'grade',
      label: labels.grade,
      detail: `${event.evidenceId} · ${event.confidence}`,
      timestamp: event.timestamp,
    };
  }
  if (event.event === 'figure_attached') {
    return {
      id: `figure-${event.runId}-${event.figure.id}-${event.timestamp || index}`,
      kind: 'figure',
      label: labels.figure,
      detail: event.figure.title || event.figure.id,
      timestamp: event.timestamp,
    };
  }
  if (event.event === 'artifact_read') {
    return {
      id: `artifact-${event.runId}-${event.artifact.kind}-${event.timestamp || index}`,
      kind: 'artifact',
      label: labels.artifact[event.artifact.kind],
      detail: event.artifact.path || event.artifact.command || event.artifact.description,
      count: event.artifact.count,
      timestamp: event.timestamp,
    };
  }
  if (event.event === 'panel_submitted') {
    return undefined;
  }
  return undefined;
};

export const summarizeMedicalEvidenceRuntime = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): MedicalEvidenceRuntimeSummary | undefined => {
  const payloads = extractMedicalEvidencePayloadsFromTools(messages);
  if (!payloads.length) return undefined;
  const language = detectMedicalEvidenceRuntimeLanguage(payloads);
  const panel = latestMedicalEvidencePanel(messages);
  const trace = payloads.map((payload, index) => traceFromPayload(payload, index, language)).filter((item): item is MedicalEvidenceTraceItem => Boolean(item));
  const processEvents = payloads.filter(
    (payload): payload is Exclude<MedicalEvidenceEvent, { event: 'panel_submitted' }> =>
      (payload as MedicalEvidenceEvent).schema === MEDICAL_EVIDENCE_EVENT_SCHEMA &&
      (payload as MedicalEvidenceEvent).event !== 'panel_submitted'
  );
  const stageKeys = Array.from(new Set(processEvents.map((event) => traceFromPayload(event, 0, language)?.kind).filter(Boolean))) as MedicalEvidenceTraceKind[];
  if (panel) {
    return {
      stats: panel.stats,
      trace,
      hasPanel: true,
      language,
      processEventCount: processEvents.length,
      stageKeys,
    };
  }

  const stats: MedicalEvidencePanelData['stats'] = {
    searches: 0,
    recordsFound: 0,
    screened: 0,
    included: 0,
    anchors: 0,
    conflicts: 0,
  };
  for (const payload of payloads) {
    if ((payload as MedicalEvidenceEvent).schema !== MEDICAL_EVIDENCE_EVENT_SCHEMA) continue;
    const event = payload as MedicalEvidenceEvent;
    if (event.event === 'search_completed') {
      stats.searches += 1;
      stats.recordsFound += event.found;
    }
    if (event.event === 'anchor_collected') {
      stats.anchors += event.anchors.length;
    }
    if (event.event === 'evidence_graded') {
      stats.included += 1;
    }
  }
  return {
    stats,
    trace,
    hasPanel: false,
    language,
    processEventCount: processEvents.length,
    stageKeys,
  };
};

export const summarizeMedicalEvidenceEvents = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): MedicalEvidencePanelData['stats'] | undefined => summarizeMedicalEvidenceRuntime(messages)?.stats;
