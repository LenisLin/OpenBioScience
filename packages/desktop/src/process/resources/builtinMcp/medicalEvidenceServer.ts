/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  MEDICAL_EVIDENCE_EVENT_SCHEMA,
  MEDICAL_EVIDENCE_PANEL_SCHEMA,
  type MedicalEvidenceConfidence,
  type MedicalEvidenceAppraisal,
  type MedicalEvidenceConflict,
  type MedicalEvidenceEvent,
  type MedicalEvidenceFigure,
  type MedicalEvidenceFinding,
  type MedicalEvidenceItem,
  type MedicalEvidenceJournalTier,
  type MedicalEvidencePaperclipArtifact,
  type MedicalEvidenceQualityBadge,
  type MedicalEvidenceReport,
  type MedicalEvidenceReportBlock,
  type MedicalEvidenceReportCard,
  type MedicalEvidenceReportCardItem,
  type MedicalEvidenceTable,
  type MedicalEvidencePanelData,
  type MedicalEvidenceSource,
} from '@/common/chat/medicalEvidence';
import { MEDICAL_EVIDENCE_ENV_KEYS } from '@/common/config/medicalEvidenceMcpEnv';
import { BUILTIN_MEDICAL_EVIDENCE_NAME } from './constants';

const DEFAULT_BASE_URL = 'https://paperclip.gxl.ai';
const DEFAULT_TIMEOUT_MS = 30000;

const sourceSchema = z.enum([
  'pmc',
  'abstracts',
  'abstracts_only',
  'biorxiv',
  'medrxiv',
  'arxiv',
  'fda',
  'fda/jp',
  'fda/eu',
  'trials',
  'trials/us',
  'trials/cn',
  'trials/jp',
  'trials/eu',
  'clinicaltrials',
]);
const confidenceSchema = z.enum(['high', 'moderate', 'low', 'very_low']);
const qualityBadgeSchema = z.enum([
  'leading_journal',
  'new_research',
  'guideline',
  'drug_label',
  'regulatory',
  'rct',
  'systematic_review',
  'population_matched',
  'anchored',
  'figure_available',
  'paperclip_verified',
  'full_text',
  'recent',
  'safety',
  'applicability_limited',
]);
const journalTierSchema = z.enum(['leading', 'specialty', 'general', 'unknown']);
const artifactKindSchema = z.enum(['search', 'metadata', 'content', 'section', 'figures', 'figure_analysis', 'sql', 'export', 'repo']);
const sourceTypeSchema = z.enum([
  'guideline',
  'systematic_review',
  'rct',
  'cohort',
  'case_control',
  'case_series',
  'regulatory',
  'drug_label',
  'trial_registry',
  'abstract',
  'other',
]);

const anchorSchema = z.object({
  sourceId: z.string(),
  path: z.string().optional(),
  url: z.string().optional(),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional(),
  quote: z.string().optional(),
  section: z.string().optional(),
});

const paperclipArtifactSchema = z.object({
  kind: artifactKindSchema,
  source: z.string().optional(),
  command: z.string().optional(),
  path: z.string().optional(),
  savedSearchId: z.string().optional(),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional(),
  description: z.string().optional(),
  count: z.number().optional(),
});

const paperclipRecordSchema = z.object({
  sourceId: z.string().optional(),
  source: z.string().optional(),
  virtualPath: z.string().optional(),
  metaPath: z.string().optional(),
  contentPath: z.string().optional(),
  sectionsPath: z.string().optional(),
  figuresPath: z.string().optional(),
  savedSearchId: z.string().optional(),
  searchQuery: z.string().optional(),
  resultRank: z.number().optional(),
  artifacts: z.array(paperclipArtifactSchema).optional(),
});

const evidenceItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceType: sourceTypeSchema,
  confidence: confidenceSchema,
  grade: z.string().optional(),
  year: z.number().optional(),
  publishedAt: z.string().optional(),
  authors: z.string().optional(),
  journal: z.string().optional(),
  journalTier: journalTierSchema.optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  anchor: anchorSchema.optional(),
  qualityBadges: z.array(qualityBadgeSchema).optional(),
  paperclip: paperclipRecordSchema.optional(),
  summary: z.string().optional(),
  population: z.string().optional(),
  applicability: z.string().optional(),
  direction: z.enum(['supports', 'against', 'mixed', 'context']).optional(),
});

const appraisalSchema = z.object({
  id: z.string(),
  claim: z.string(),
  conclusion: z.string(),
  confidence: confidenceSchema,
  selectedEvidenceIds: z.array(z.string()),
  alternativeEvidenceIds: z.array(z.string()).optional(),
  rationale: z.string(),
  basis: z.array(z.string()).optional(),
  candidates: z
    .array(
      z.object({
        evidenceId: z.string(),
        label: z.string().optional(),
        reason: z.string().optional(),
        hierarchyRank: z.number().optional(),
      })
    )
    .optional(),
});

const reportBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('paragraph'),
    text: z.string(),
    markdown: z.string().optional(),
    evidenceIds: z.array(z.string()).optional(),
    confidence: confidenceSchema.optional(),
  }),
  z.object({
    type: z.literal('bullet_list'),
    items: z.array(
      z.object({
        text: z.string(),
        evidenceIds: z.array(z.string()).optional(),
        confidence: confidenceSchema.optional(),
      })
    ),
  }),
  z.object({
    type: z.literal('checklist'),
    items: z.array(
      z.object({
        label: z.string(),
        detail: z.string().optional(),
        status: z.enum(['met', 'caution', 'not_met', 'unknown']).optional(),
        evidenceIds: z.array(z.string()).optional(),
      })
    ),
  }),
  z.object({
    type: z.literal('figure_ref'),
    figureId: z.string(),
  }),
  z.object({
    type: z.literal('table_ref'),
    tableId: z.string(),
  }),
  z.object({
    type: z.literal('card_ref'),
    cardId: z.string(),
  }),
  z.object({
    type: z.literal('card_grid'),
    cardIds: z.array(z.string()),
  }),
]);

const reportSchema = z.object({
  title: z.string().optional(),
  sections: z.array(
    z.object({
      id: z.string(),
      heading: z.string().optional(),
      blocks: z.array(reportBlockSchema),
      evidenceIds: z.array(z.string()).optional(),
    })
  ),
});

const figureSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'chart', 'drawio']),
  title: z.string().optional(),
  caption: z.string().optional(),
  alt: z.string().optional(),
  figureNumber: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceJournal: z.string().optional(),
  sourcePath: z.string().optional(),
  licenseNote: z.string().optional(),
  imageUrl: z.string().optional(),
  imagePath: z.string().optional(),
  svgPath: z.string().optional(),
  previewSvgPath: z.string().optional(),
  previewPngPath: z.string().optional(),
  drawioPath: z.string().optional(),
  drawioXml: z.string().optional(),
  chartSpec: z.record(z.unknown()).optional(),
  paperclip: z
    .object({
      sourceId: z.string().optional(),
      figurePath: z.string().optional(),
      askImageQuestion: z.string().optional(),
      askImageAnswer: z.string().optional(),
      command: z.string().optional(),
    })
    .optional(),
  evidenceIds: z.array(z.string()).optional(),
});

const tableSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  caption: z.string().optional(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number()]))),
  evidenceIds: z.array(z.string()).optional(),
});

const reportCardItemSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]).optional(),
  detail: z.string().optional(),
  markdown: z.string().optional(),
  status: z.enum(['met', 'caution', 'not_met', 'unknown']).optional(),
  evidenceIds: z.array(z.string()).optional(),
  figureId: z.string().optional(),
  confidence: confidenceSchema.optional(),
  sourceType: sourceTypeSchema.optional(),
  badge: qualityBadgeSchema.optional(),
  path: z.string().optional(),
  command: z.string().optional(),
  count: z.number().optional(),
});

const reportCardSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'quality_references',
    'paperclip_trace',
    'evidence_hierarchy',
    'visual_evidence',
    'applicability',
    'safety',
    'search_strategy',
    'claim_map',
    'source_coverage',
    'takeaway',
  ]),
  title: z.string(),
  subtitle: z.string().optional(),
  markdown: z.string().optional(),
  evidenceIds: z.array(z.string()).optional(),
  figureIds: z.array(z.string()).optional(),
  tableIds: z.array(z.string()).optional(),
  artifacts: z.array(paperclipArtifactSchema).optional(),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        unit: z.string().optional(),
        tone: z.enum(['neutral', 'good', 'caution', 'risk']).optional(),
      })
    )
    .optional(),
  items: z.array(reportCardItemSchema).optional(),
});

const panelSchema = z.object({
  schema: z.literal(MEDICAL_EVIDENCE_PANEL_SCHEMA).optional(),
  runId: z.string(),
  question: z.string(),
  generatedAt: z.number().optional(),
  summary: z.string().optional(),
  stats: z.object({
    searches: z.number(),
    recordsFound: z.number(),
    screened: z.number(),
    included: z.number(),
    anchors: z.number(),
    conflicts: z.number(),
  }),
  findings: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      conclusion: z.string(),
      confidence: confidenceSchema,
      evidenceIds: z.array(z.string()),
      caveats: z.array(z.string()).optional(),
    })
  ),
  evidence: z.array(evidenceItemSchema),
  appraisals: z.array(appraisalSchema).optional(),
  conflicts: z
    .array(
      z.object({
        id: z.string(),
        claim: z.string(),
        explanation: z.string(),
        primaryEvidenceIds: z.array(z.string()),
        conflictingEvidenceIds: z.array(z.string()),
        resolution: z.string().optional(),
      })
    )
    .optional(),
  report: reportSchema.optional(),
  cards: z.array(reportCardSchema).optional(),
  figures: z.array(figureSchema).optional(),
  tables: z.array(tableSchema).optional(),
  methods: z
    .object({
      queryPlan: z.array(z.string()).optional(),
      sources: z.array(z.string()).optional(),
      gradingFramework: z.string().optional(),
      limitations: z.array(z.string()).optional(),
    })
    .optional(),
});

type PaperclipMcpResponse = {
  result?: {
    content?: Array<{ type?: string; text?: string }>;
  };
  error?: {
    message?: string;
  };
};

type ParsedAnchor = {
  sourceId: string;
  path?: string;
  lineStart: number;
  lineEnd: number;
  quote: string;
};

const jsonText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const normalizeSource = (source: string): string => (source === 'clinicaltrials' ? 'trials/us' : source);

const parseFoundCount = (output: string): number => {
  const match = output.match(/Found\s+(\d+)\s+(?:results|papers|records|items)/iu);
  if (match) return Number(match[1]) || 0;
  const numbered = output.match(/^\s*\d+\.\s+/gmu);
  return numbered?.length || 0;
};

const parseSavedSearchId = (output: string): string | undefined => {
  const match = output.match(/saved\s+as\s+(s_[A-Za-z0-9_-]+)/i) || output.match(/\b(s_[A-Za-z0-9_-]+)\b/u);
  return match?.[1];
};

const previewOutput = (output: string, maxLength = 1200): string => {
  const trimmed = output.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}\n...`;
};

const parseAnchors = (output: string, sourceId: string, path?: string): ParsedAnchor[] =>
  output
    .split(/\r?\n/u)
    .flatMap((line): ParsedAnchor[] => {
      const match = line.match(/^L(\d+)(?:-L?(\d+))?[:\s]+(.*)$/u);
      if (!match) return [];
      const lineStart = Number(match[1]);
      const lineEnd = Number(match[2] || match[1]);
      return [
        {
          sourceId,
          ...(path ? { path } : {}),
          lineStart,
          lineEnd,
          quote: match[3].trim(),
        },
      ];
    });

const inferConfidence = (sourceType: MedicalEvidenceSource, year?: number): MedicalEvidenceConfidence => {
  const currentYear = new Date().getFullYear();
  const outdated = year ? currentYear - year > 10 : false;
  if (sourceType === 'guideline' || sourceType === 'systematic_review') return outdated ? 'moderate' : 'high';
  if (sourceType === 'rct' || sourceType === 'regulatory' || sourceType === 'drug_label') return outdated ? 'moderate' : 'high';
  if (sourceType === 'cohort' || sourceType === 'case_control') return outdated ? 'low' : 'moderate';
  if (sourceType === 'abstract' || sourceType === 'case_series') return 'low';
  return 'very_low';
};

const gradeLabel = (confidence: MedicalEvidenceConfidence, sourceType: MedicalEvidenceSource): string => {
  if (confidence === 'high') return sourceType === 'rct' ? 'High (RCT)' : 'High';
  if (confidence === 'moderate') return 'Moderate';
  if (confidence === 'low') return 'Low';
  return 'Very low';
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const asNumber = (value: unknown, fallback?: number): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
};

const splitLooseList = (value: string): string[] =>
  value
    .replace(/^\s*\[/u, '')
    .replace(/\]\s*$/u, '')
    .split(/[,;，；\n]+|\s+(?=E\d+\b)/u)
    .map((item) => item.trim().replace(/^\[|\]$/gu, ''))
    .filter(Boolean);

const asStringArray = (value: unknown): string[] => {
  if (typeof value === 'string') return splitLooseList(value);
  return asArray(value)
    .flatMap((item) => (typeof item === 'string' ? splitLooseList(item) : [asString(item)]))
    .map((item) => item.trim())
    .filter(Boolean);
};

const evidenceIdsFrom = (...values: unknown[]): string[] => Array.from(new Set(values.flatMap(asStringArray)));

type ReportLanguage = 'zh' | 'en';

const containsCjk = (value: string): boolean => /[\u3400-\u9fff]/u.test(value);

const collectText = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (isRecord(value)) return Object.values(value).flatMap(collectText);
  return [];
};

const detectReportLanguage = (...values: unknown[]): ReportLanguage =>
  values.flatMap(collectText).some(containsCjk) ? 'zh' : 'en';

const reportLabels = {
  zh: {
    bottomLine: '答案总览',
    evidencePoints: '分点结论',
    decisionChecklist: '决策条件清单',
    keyPoints: '判定要点',
    tableEvidence: '证据表',
    figureEvidence: '图示证据',
    evidenceGap: '适用边界与证据缺口',
    actionPoints: '行动关注点',
    noEvidence: '暂无证据支撑',
  },
  en: {
    bottomLine: 'Bottom Line',
    evidencePoints: 'Evidence-Backed Points',
    decisionChecklist: 'Decision Checklist',
    keyPoints: 'Key Points',
    tableEvidence: 'Evidence Table',
    figureEvidence: 'Visual Evidence',
    evidenceGap: 'Applicability and Evidence Gaps',
    actionPoints: 'Action Points',
    noEvidence: 'Current evidence is insufficient',
  },
} as const;

const internalReportHeadingPattern =
  /^(?:回答结构|推理路径|证据依据|临床问题|从问题到证据再到结论的阅读路径|reasoning\s*map|reasoning\s*path|evidence\s*basis|clinical\s*question)$/iu;

const professionalizeClinicalText = (value: string): string =>
  value
    .replace(/\s*(?:\[\s*E\d+\s*\]\s*){1,}/giu, ' ')
    .replace(/\s+([，。；：、,.!?;:])/gu, '$1')
    .replace(/([（(【])\s+/gu, '$1')
    .replace(/\s+([）)】])/gu, '$1')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim()
    .replace(/(?:我|我们)?(?:没有|没|未)看到(?:高质量|直接|充分|明确|可靠)?证据(支持|证实|证明|显示|提示)/gu, '暂无证据$1')
    .replace(/(?:我|我们)?(?:没有|没|未)看到([^。；，,.]{0,28}?)(支持|证实|证明|显示|提示)/gu, (_match, subject: string, verb: string) => `${subject || '当前证据'}暂无证据${verb}`)
    .replace(/(?:我|我们)?(?:没有|没|未)看到/gu, '当前检索证据未能支持')
    .replace(/看不到/gu, '暂无证据支撑')
    .replace(/查不到/gu, '当前检索未获得支持')
    .replace(/没查到/gu, '当前检索未获得支持');

const asClinicalString = (value: unknown, fallback = ''): string => professionalizeClinicalText(asString(value, fallback));
const asClinicalMarkdown = (value: unknown): string => professionalizeClinicalText(asString(value));

const getBlockKind = (block: MedicalEvidenceReportBlock | unknown): string => (isRecord(block) ? asString(block.type) : '');

const sectionHasHeading = (section: unknown): boolean => isRecord(section) && Boolean(asString(section.heading || section.title));

const inferSectionHeading = (blocks: unknown[], language: ReportLanguage, index: number): string | undefined => {
  const labels = reportLabels[language];
  const kinds = blocks.map(getBlockKind);
  if (!kinds.length) return undefined;
  if (kinds.includes('checklist')) return index === 0 ? labels.decisionChecklist : labels.keyPoints;
  if (kinds.includes('bullet_list')) return index === 0 ? labels.evidencePoints : labels.actionPoints;
  if (kinds.includes('table_ref')) return labels.tableEvidence;
  if (kinds.includes('figure_ref')) return labels.figureEvidence;
  if (kinds.includes('card_ref') || kinds.includes('card_grid')) return labels.keyPoints;
  return index === 0 ? labels.bottomLine : undefined;
};

const sanitizeReportHeading = (
  heading: string | undefined,
  blocks: MedicalEvidenceReportBlock[],
  language: ReportLanguage,
  index: number
): string | undefined => {
  const cleaned = professionalizeClinicalText(heading || '');
  if (!cleaned) return inferSectionHeading(blocks, language, index);
  if (internalReportHeadingPattern.test(cleaned)) return inferSectionHeading(blocks, language, index);
  return cleaned;
};

const normalizeConfidence = (value: unknown, fallback: MedicalEvidenceConfidence = 'low'): MedicalEvidenceConfidence => {
  const normalized = asString(value).toLowerCase().replace(/[\s-]+/gu, '_');
  if (['high', 'moderate', 'low', 'very_low'].includes(normalized)) return normalized as MedicalEvidenceConfidence;
  if (normalized === 'medium' || normalized === 'middle') return 'moderate';
  if (normalized === 'verylow') return 'very_low';
  return fallback;
};

const normalizeSourceType = (value: unknown): MedicalEvidenceSource => {
  const normalized = asString(value).toLowerCase().replace(/[\s-]+/gu, '_');
  const aliases: Record<string, MedicalEvidenceSource> = {
    guideline: 'guideline',
    guidelines: 'guideline',
    consensus: 'guideline',
    systematic_review: 'systematic_review',
    meta_analysis: 'systematic_review',
    metaanalysis: 'systematic_review',
    rct: 'rct',
    randomized_trial: 'rct',
    cohort: 'cohort',
    case_control: 'case_control',
    case_series: 'case_series',
    regulatory: 'regulatory',
    fda: 'regulatory',
    ema: 'regulatory',
    nmpa: 'regulatory',
    drug_label: 'drug_label',
    label: 'drug_label',
    prescribing_information: 'drug_label',
    trial_registry: 'trial_registry',
    registry: 'trial_registry',
    clinical_trial_registry: 'trial_registry',
    abstract: 'abstract',
    other: 'other',
  };
  return aliases[normalized] || 'other';
};

const normalizeArtifactKind = (value: unknown, textHint = ''): MedicalEvidencePaperclipArtifact['kind'] => {
  const normalized = `${asString(value)} ${textHint}`.toLowerCase();
  if (/meta|metadata|\.json/u.test(normalized)) return 'metadata';
  if (/section|chapter/u.test(normalized)) return 'section';
  if (/figure|image|ask[-_\s]?image|读图|图像/u.test(normalized)) return normalized.includes('ask') ? 'figure_analysis' : 'figures';
  if (/\bsql\b/u.test(normalized)) return 'sql';
  if (/export/u.test(normalized)) return 'export';
  if (/repo|citation|bibtex|reference/u.test(normalized)) return 'repo';
  if (/search|saved/u.test(normalized)) return 'search';
  return 'content';
};

const normalizePaperclipArtifact = (value: unknown): MedicalEvidencePaperclipArtifact | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return {
      kind: normalizeArtifactKind(undefined, trimmed),
      ...(trimmed.startsWith('/') ? { path: trimmed } : { description: trimmed }),
    };
  }
  if (!isRecord(value)) return undefined;
  const path = asString(value.path);
  const command = asString(value.command);
  const description = asString(value.description || value.label || value.title);
  return {
    kind: normalizeArtifactKind(value.kind, `${path} ${command} ${description}`),
    ...(asString(value.source) ? { source: asString(value.source) } : {}),
    ...(command ? { command } : {}),
    ...(path ? { path } : {}),
    ...(asString(value.savedSearchId || value.saved_search_id) ? { savedSearchId: asString(value.savedSearchId || value.saved_search_id) } : {}),
    ...(asNumber(value.lineStart ?? value.line_start) !== undefined ? { lineStart: asNumber(value.lineStart ?? value.line_start) } : {}),
    ...(asNumber(value.lineEnd ?? value.line_end) !== undefined ? { lineEnd: asNumber(value.lineEnd ?? value.line_end) } : {}),
    ...(description ? { description } : {}),
    ...(asNumber(value.count) !== undefined ? { count: asNumber(value.count) } : {}),
  };
};

const normalizePaperclipRecord = (value: unknown) => {
  if (!isRecord(value)) return undefined;
  const artifacts = asArray(value.artifacts)
    .map(normalizePaperclipArtifact)
    .filter((item): item is NonNullable<ReturnType<typeof normalizePaperclipArtifact>> => Boolean(item));
  return {
    ...(asString(value.sourceId || value.source_id) ? { sourceId: asString(value.sourceId || value.source_id) } : {}),
    ...(asString(value.source) ? { source: asString(value.source) } : {}),
    ...(asString(value.virtualPath || value.virtual_path) ? { virtualPath: asString(value.virtualPath || value.virtual_path) } : {}),
    ...(asString(value.metaPath || value.meta_path) ? { metaPath: asString(value.metaPath || value.meta_path) } : {}),
    ...(asString(value.contentPath || value.content_path) ? { contentPath: asString(value.contentPath || value.content_path) } : {}),
    ...(asString(value.sectionsPath || value.sections_path) ? { sectionsPath: asString(value.sectionsPath || value.sections_path) } : {}),
    ...(asString(value.figuresPath || value.figures_path) ? { figuresPath: asString(value.figuresPath || value.figures_path) } : {}),
    ...(asString(value.savedSearchId || value.saved_search_id) ? { savedSearchId: asString(value.savedSearchId || value.saved_search_id) } : {}),
    ...(asString(value.searchQuery || value.search_query) ? { searchQuery: asString(value.searchQuery || value.search_query) } : {}),
    ...(asNumber(value.resultRank || value.result_rank) !== undefined ? { resultRank: asNumber(value.resultRank || value.result_rank) } : {}),
    ...(artifacts.length ? { artifacts } : {}),
  };
};

const normalizeAnchor = (value: unknown, fallbackSourceId: string) => {
  if (!isRecord(value)) return undefined;
  const sourceId = asString(value.sourceId || value.source_id, fallbackSourceId);
  if (!sourceId) return undefined;
  return {
    sourceId,
    ...(asString(value.path) ? { path: asString(value.path) } : {}),
    ...(asString(value.url) ? { url: asString(value.url) } : {}),
    ...(asNumber(value.lineStart ?? value.line_start) !== undefined ? { lineStart: asNumber(value.lineStart ?? value.line_start) } : {}),
    ...(asNumber(value.lineEnd ?? value.line_end) !== undefined ? { lineEnd: asNumber(value.lineEnd ?? value.line_end) } : {}),
    ...(asString(value.quote) ? { quote: asString(value.quote) } : {}),
    ...(asString(value.section) ? { section: asString(value.section) } : {}),
  };
};

const normalizeEvidenceItem = (value: unknown, index: number): MedicalEvidenceItem | undefined => {
  if (!isRecord(value)) return undefined;
  const id = asString(value.id, `E${index + 1}`);
  const title = asString(value.title || value.name || value.citation, `Evidence ${index + 1}`);
  const sourceType = normalizeSourceType(value.sourceType || value.source_type || value.type);
  const year = asNumber(value.year);
  const confidence = normalizeConfidence(value.confidence, inferConfidence(sourceType, year));
  const paperclip = normalizePaperclipRecord(value.paperclip);
  const journalTier = journalTierSchema.safeParse(value.journalTier || value.journal_tier).success
    ? ((value.journalTier || value.journal_tier) as MedicalEvidenceJournalTier)
    : undefined;
  const qualityBadges = Array.isArray(value.qualityBadges || value.quality_badges)
    ? asArray(value.qualityBadges || value.quality_badges).filter((badge): badge is MedicalEvidenceQualityBadge =>
        qualityBadgeSchema.safeParse(badge).success
      )
    : undefined;
  const direction = z.enum(['supports', 'against', 'mixed', 'context']).safeParse(value.direction).success
    ? (value.direction as MedicalEvidenceItem['direction'])
    : undefined;
  return {
    id,
    title,
    sourceType,
    confidence,
    ...(asString(value.grade) ? { grade: asString(value.grade) } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(asString(value.publishedAt || value.published_at) ? { publishedAt: asString(value.publishedAt || value.published_at) } : {}),
    ...(asString(value.authors) ? { authors: asString(value.authors) } : {}),
    ...(asString(value.journal) ? { journal: asString(value.journal) } : {}),
    ...(journalTier ? { journalTier } : {}),
    ...(asString(value.doi) ? { doi: asString(value.doi) } : {}),
    ...(asString(value.url) ? { url: asString(value.url) } : {}),
    ...(normalizeAnchor(value.anchor, id) ? { anchor: normalizeAnchor(value.anchor, id) } : {}),
    ...(qualityBadges?.length ? { qualityBadges } : {}),
    ...(paperclip ? { paperclip } : {}),
    ...(asClinicalString(value.summary) ? { summary: asClinicalString(value.summary) } : {}),
    ...(asClinicalString(value.population) ? { population: asClinicalString(value.population) } : {}),
    ...(asClinicalString(value.applicability) ? { applicability: asClinicalString(value.applicability) } : {}),
    ...(direction ? { direction } : {}),
  };
};

const normalizeFinding = (value: unknown, index: number): MedicalEvidenceFinding | undefined => {
  if (!isRecord(value)) return undefined;
  const conclusion = asClinicalString(value.conclusion || value.text || value.summary || value.detail);
  const title = asClinicalString(value.title || value.label, conclusion ? conclusion.slice(0, 48) : `Finding ${index + 1}`);
  if (!conclusion && !title) return undefined;
  return {
    id: asString(value.id, `F${index + 1}`),
    title,
    conclusion: conclusion || title,
    confidence: normalizeConfidence(value.confidence, 'low'),
    evidenceIds: evidenceIdsFrom(value.evidenceIds, value.evidence_ids, value.refs, value.references),
    ...(asArray(value.caveats).length ? { caveats: asStringArray(value.caveats).map(professionalizeClinicalText) } : {}),
  };
};

const normalizeReportBlock = (value: unknown, index: number): MedicalEvidenceReportBlock => {
  if (typeof value === 'string') return { type: 'paragraph', text: asClinicalString(value) };
  if (!isRecord(value)) return { type: 'paragraph', text: `Block ${index + 1}` };
  const rawType = asString(value.type).toLowerCase();
  const type =
    rawType === 'bullet' || rawType === 'bullets' || rawType === 'list' || rawType === 'ordered_list'
      ? 'bullet_list'
      : rawType === 'check' || rawType === 'checks' || rawType === 'check_list'
        ? 'checklist'
        : rawType === 'figure' || rawType === 'image'
          ? 'figure_ref'
          : rawType === 'table'
            ? 'table_ref'
            : rawType === 'card'
              ? 'card_ref'
              : rawType;

  if (type === 'bullet_list') {
    return {
      type: 'bullet_list',
      items: asArray(value.items || value.children).map((item) =>
        isRecord(item)
          ? (() => {
              const confidence = confidenceSchema.safeParse(item.confidence).success
                ? (item.confidence as MedicalEvidenceConfidence)
                : undefined;
              return {
                text: asClinicalString(item.text || item.label || item.value || item.detail, `Item`),
                ...(evidenceIdsFrom(item.evidenceIds, item.evidence_ids).length
                  ? { evidenceIds: evidenceIdsFrom(item.evidenceIds, item.evidence_ids) }
                  : {}),
                ...(confidence ? { confidence } : {}),
              };
            })()
          : { text: asClinicalString(item, 'Item') }
      ),
    };
  }

  if (type === 'checklist' || (!rawType && Array.isArray(value.items))) {
    return {
      type: 'checklist',
      items: asArray(value.items || value.children).map((item) =>
        isRecord(item)
          ? (() => {
              const status = z.enum(['met', 'caution', 'not_met', 'unknown']).safeParse(item.status).success
                ? (item.status as 'met' | 'caution' | 'not_met' | 'unknown')
                : undefined;
              return {
                label: asClinicalString(item.label || item.text || item.title || item.value, 'Item'),
                ...(asClinicalString(item.detail || item.description) ? { detail: asClinicalString(item.detail || item.description) } : {}),
                ...(status ? { status } : {}),
                ...(evidenceIdsFrom(item.evidenceIds, item.evidence_ids).length
                  ? { evidenceIds: evidenceIdsFrom(item.evidenceIds, item.evidence_ids) }
                  : {}),
              };
            })()
          : { label: asClinicalString(item, 'Item') }
      ),
    };
  }

  if (type === 'figure_ref') {
    const figureId = asString(value.figureId || value.figure_id || value.id);
    return figureId ? { type: 'figure_ref', figureId } : { type: 'paragraph', text: asClinicalString(value.text || value.title || value.caption, 'Figure') };
  }
  if (type === 'table_ref') {
    const tableId = asString(value.tableId || value.table_id || value.id);
    return tableId ? { type: 'table_ref', tableId } : { type: 'paragraph', text: asClinicalString(value.text || value.title || value.caption, 'Table') };
  }
  if (type === 'card_ref') {
    const cardId = asString(value.cardId || value.card_id || value.id);
    return cardId ? { type: 'card_ref', cardId } : { type: 'paragraph', text: asClinicalString(value.text || value.title, 'Card') };
  }
  if (type === 'card_grid') {
    const cardIds = evidenceIdsFrom(value.cardIds, value.card_ids, value.ids);
    return cardIds.length ? { type: 'card_grid', cardIds } : { type: 'paragraph', text: asClinicalString(value.text || value.title, 'Cards') };
  }

  const confidence = confidenceSchema.safeParse(value.confidence).success
    ? (value.confidence as MedicalEvidenceConfidence)
    : undefined;
  return {
    type: 'paragraph',
    text: asClinicalString(value.text || value.paragraph || value.content || value.markdown || value.title || value.label, `Paragraph ${index + 1}`),
    ...(asClinicalMarkdown(value.markdown) ? { markdown: asClinicalMarkdown(value.markdown) } : {}),
    ...(evidenceIdsFrom(value.evidenceIds, value.evidence_ids).length ? { evidenceIds: evidenceIdsFrom(value.evidenceIds, value.evidence_ids) } : {}),
    ...(confidence ? { confidence } : {}),
  };
};

const normalizeReportCardItem = (value: unknown, index: number): MedicalEvidenceReportCardItem | undefined => {
  if (!isRecord(value)) {
    const label = asClinicalString(value);
    return label ? { label } : undefined;
  }
  const label = asClinicalString(value.label || value.title || value.text || value.name || value.key, `Item ${index + 1}`);
  if (!label) return undefined;
  const explicitSourceType = asString(value.sourceType || value.source_type);
  const normalizedSourceType = explicitSourceType ? normalizeSourceType(explicitSourceType) : undefined;
  const status = z.enum(['met', 'caution', 'not_met', 'unknown']).safeParse(value.status).success
    ? (value.status as MedicalEvidenceReportCardItem['status'])
    : undefined;
  const confidence = confidenceSchema.safeParse(value.confidence).success
    ? (value.confidence as MedicalEvidenceConfidence)
    : undefined;
  const badge = qualityBadgeSchema.safeParse(value.badge).success
    ? (value.badge as MedicalEvidenceQualityBadge)
    : undefined;
  return {
    label,
    ...(typeof value.value === 'string' || typeof value.value === 'number' ? { value: value.value } : {}),
    ...(asClinicalString(value.detail || value.description || value.summary) ? { detail: asClinicalString(value.detail || value.description || value.summary) } : {}),
    ...(asClinicalMarkdown(value.markdown || value.body) ? { markdown: asClinicalMarkdown(value.markdown || value.body) } : {}),
    ...(status ? { status } : {}),
    ...(evidenceIdsFrom(value.evidenceIds, value.evidence_ids).length ? { evidenceIds: evidenceIdsFrom(value.evidenceIds, value.evidence_ids) } : {}),
    ...(asString(value.figureId || value.figure_id) ? { figureId: asString(value.figureId || value.figure_id) } : {}),
    ...(confidence ? { confidence } : {}),
    ...(normalizedSourceType && normalizedSourceType !== 'other' ? { sourceType: normalizedSourceType } : {}),
    ...(badge ? { badge } : {}),
    ...(asString(value.path) ? { path: asString(value.path) } : {}),
    ...(asString(value.command) ? { command: asString(value.command) } : {}),
    ...(asNumber(value.count) !== undefined ? { count: asNumber(value.count) } : {}),
  };
};

const normalizeReportCard = (value: unknown, index: number): MedicalEvidenceReportCard | undefined => {
  if (!isRecord(value)) return undefined;
  const rawKind = asString(value.kind || value.type).toLowerCase();
  const kind = reportCardSchema.shape.kind.safeParse(rawKind).success ? rawKind : 'takeaway';
  const title = asClinicalString(value.title || value.heading || value.label, `Card ${index + 1}`);
  const artifacts = asArray(value.artifacts)
    .map(normalizePaperclipArtifact)
    .filter((item): item is NonNullable<ReturnType<typeof normalizePaperclipArtifact>> => Boolean(item));
  const items = asArray(value.items || value.children)
    .map(normalizeReportCardItem)
    .filter((item): item is NonNullable<ReturnType<typeof normalizeReportCardItem>> => Boolean(item));
  const metrics = asArray(value.metrics)
    .map((metric) => {
      if (!isRecord(metric)) return undefined;
      const label = asClinicalString(metric.label || metric.name);
      const metricValue = typeof metric.value === 'string' || typeof metric.value === 'number' ? metric.value : undefined;
      if (!label || metricValue === undefined) return undefined;
      return {
        label,
        value: metricValue,
        ...(asString(metric.unit) ? { unit: asString(metric.unit) } : {}),
        ...(z.enum(['neutral', 'good', 'caution', 'risk']).safeParse(metric.tone).success ? { tone: metric.tone as 'neutral' | 'good' | 'caution' | 'risk' } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return {
    id: asString(value.id, `card-${index + 1}`),
    kind: kind as MedicalEvidenceReportCard['kind'],
    title,
    ...(asClinicalString(value.subtitle || value.description) ? { subtitle: asClinicalString(value.subtitle || value.description) } : {}),
    ...(asClinicalMarkdown(value.markdown || value.body) ? { markdown: asClinicalMarkdown(value.markdown || value.body) } : {}),
    ...(evidenceIdsFrom(value.evidenceIds, value.evidence_ids).length ? { evidenceIds: evidenceIdsFrom(value.evidenceIds, value.evidence_ids) } : {}),
    ...(evidenceIdsFrom(value.figureIds, value.figure_ids).length ? { figureIds: evidenceIdsFrom(value.figureIds, value.figure_ids) } : {}),
    ...(evidenceIdsFrom(value.tableIds, value.table_ids).length ? { tableIds: evidenceIdsFrom(value.tableIds, value.table_ids) } : {}),
    ...(artifacts.length ? { artifacts } : {}),
    ...(metrics.length ? { metrics } : {}),
    ...(items.length ? { items } : {}),
  };
};

const ensureReportStructure = (
  report: MedicalEvidenceReport,
  language: ReportLanguage,
  summary: string,
  findings: MedicalEvidenceFinding[],
  evidence: MedicalEvidenceItem[],
  cards: MedicalEvidenceReportCard[]
): MedicalEvidenceReport => {
  const labels = reportLabels[language];
  const sections = report.sections
    .map((section, index) => ({
      ...section,
      heading: sanitizeReportHeading(section.heading, section.blocks, language, index),
      blocks: section.blocks.filter((block) => {
        if (block.type === 'card_ref') return cards.some((card) => card.id === block.cardId);
        if (block.type === 'card_grid') return block.cardIds.some((id) => cards.some((card) => card.id === id));
        return true;
      }),
    }))
    .filter((section) => section.blocks.length);

  const allEvidenceIds = Array.from(new Set(findings.flatMap((finding) => finding.evidenceIds).concat(evidence.map((item) => item.id)))).slice(0, 6);
  const firstHeading = sections[0]?.heading || '';
  const needsBottomLine = Boolean(summary || findings[0]?.conclusion) && !/答案总览|Bottom Line|Summary|总览/iu.test(firstHeading);
  if (needsBottomLine) {
    sections.unshift({
      id: 'answer-overview',
      heading: labels.bottomLine,
      blocks: [
        {
          type: 'paragraph',
          text: summary || findings[0]?.conclusion || labels.noEvidence,
          evidenceIds: findings[0]?.evidenceIds?.length ? findings[0].evidenceIds : allEvidenceIds.slice(0, 3),
        },
      ],
    });
  }

  const hasEvidencePoints = sections.some((section) => /分点结论|Evidence-Backed Points|Evidence Points|证据要点/iu.test(section.heading || ''));
  if (!hasEvidencePoints && findings.length > 1) {
    sections.splice(Math.min(2, sections.length), 0, {
      id: 'evidence-backed-points',
      heading: labels.evidencePoints,
      blocks: [
        {
          type: 'bullet_list',
          items: findings.slice(0, 6).map((finding) => ({
            text: finding.conclusion,
            evidenceIds: finding.evidenceIds,
            confidence: finding.confidence,
          })),
        },
      ],
    });
  }

  const hasEvidenceGap = sections.some((section) => /适用边界|Applicability|Evidence Gaps|证据缺口|Limitations/iu.test(section.heading || ''));
  if (!hasEvidenceGap && (findings.some((finding) => finding.caveats?.length) || evidence.some((item) => item.applicability))) {
    const caveats = Array.from(
      new Set(
        findings
          .flatMap((finding) => finding.caveats || [])
          .concat(evidence.map((item) => item.applicability || '').filter(Boolean))
          .map(professionalizeClinicalText)
      )
    ).slice(0, 5);
    if (caveats.length) {
      sections.push({
        id: 'applicability-and-gaps',
        heading: labels.evidenceGap,
        blocks: [
          {
            type: 'bullet_list',
            items: caveats.map((text) => ({ text })),
          },
        ],
      });
    }
  }

  return {
    ...report,
    sections: sections.length
      ? sections
      : [
          {
            id: 'answer-overview',
            heading: labels.bottomLine,
            blocks: [{ type: 'paragraph', text: summary || labels.noEvidence, evidenceIds: allEvidenceIds.slice(0, 3) }],
          },
        ],
  };
};

const normalizeReport = (value: unknown, summary?: string, language: ReportLanguage = 'en'): MedicalEvidenceReport | undefined => {
  const summaryBlock = (text: string): MedicalEvidenceReportBlock => ({ type: 'paragraph', text: asClinicalString(text) });
  if (!isRecord(value)) {
    return summary
      ? { sections: [{ id: 'summary', heading: reportLabels[language].bottomLine, blocks: [summaryBlock(summary)] }] }
      : undefined;
  }
  const sections: MedicalEvidenceReport['sections'] = asArray(value.sections).map((section, index) => {
    if (typeof section === 'string') {
      return { id: `section-${index + 1}`, heading: index === 0 ? reportLabels[language].bottomLine : undefined, blocks: [summaryBlock(section)] };
    }
    const record = isRecord(section) ? section : {};
    const blocksSource = asArray(record.blocks || record.content || record.children);
    const blocks = blocksSource.map(normalizeReportBlock);
    return {
      id: asString(record.id, `section-${index + 1}`),
      ...(asClinicalString(record.heading || record.title) ? { heading: asClinicalString(record.heading || record.title) } : {}),
      ...(!sectionHasHeading(record) && inferSectionHeading(blocks, language, index)
        ? { heading: inferSectionHeading(blocks, language, index) }
        : {}),
      blocks,
      ...(evidenceIdsFrom(record.evidenceIds, record.evidence_ids).length ? { evidenceIds: evidenceIdsFrom(record.evidenceIds, record.evidence_ids) } : {}),
    };
  });
  return {
    ...(asClinicalString(value.title) ? { title: asClinicalString(value.title) } : {}),
    sections: sections.length
      ? sections
      : summary
        ? [{ id: 'summary', heading: reportLabels[language].bottomLine, blocks: [summaryBlock(summary)] }]
        : [],
  };
};

const normalizeAppraisal = (value: unknown, index: number): MedicalEvidenceAppraisal | undefined => {
  if (!isRecord(value)) return undefined;
  const selectedEvidenceIds = evidenceIdsFrom(value.selectedEvidenceIds, value.selected_evidence_ids, value.primaryEvidenceIds, value.evidenceIds);
  const alternativeEvidenceIds = evidenceIdsFrom(value.alternativeEvidenceIds, value.alternative_evidence_ids, value.conflictingEvidenceIds);
  const conclusion = asClinicalString(value.conclusion || value.resolution || value.decision || value.summary);
  const rationale = asClinicalString(value.rationale || value.reason || value.explanation || value.basis, conclusion);
  if (!conclusion && !rationale && !selectedEvidenceIds.length && !alternativeEvidenceIds.length) return undefined;
  const basis = asStringArray(value.basis);
  return {
    id: asString(value.id, `A${index + 1}`),
    claim: asClinicalString(value.claim || value.title || value.question, conclusion || rationale || `Evidence appraisal ${index + 1}`),
    conclusion: conclusion || rationale || 'Evidence was appraised for hierarchy and applicability.',
    confidence: normalizeConfidence(value.confidence, 'low'),
    selectedEvidenceIds,
    ...(alternativeEvidenceIds.length ? { alternativeEvidenceIds } : {}),
    rationale: rationale || conclusion || 'Evidence hierarchy and applicability were reviewed.',
    ...(basis.length ? { basis: basis.map(professionalizeClinicalText) } : {}),
    ...(Array.isArray(value.candidates)
      ? {
          candidates: value.candidates
            .map((candidate) =>
              isRecord(candidate)
                ? {
                    evidenceId: asString(candidate.evidenceId || candidate.evidence_id),
                    ...(asClinicalString(candidate.label) ? { label: asClinicalString(candidate.label) } : {}),
                    ...(asClinicalString(candidate.reason) ? { reason: asClinicalString(candidate.reason) } : {}),
                    ...(asNumber(candidate.hierarchyRank || candidate.hierarchy_rank) !== undefined
                      ? { hierarchyRank: asNumber(candidate.hierarchyRank || candidate.hierarchy_rank) }
                      : {}),
                  }
                : { evidenceId: asString(candidate) }
            )
            .filter((candidate) => candidate.evidenceId),
        }
      : {}),
  };
};

const normalizeConflict = (value: unknown, index: number): MedicalEvidenceConflict | undefined => {
  if (!isRecord(value)) return undefined;
  const primaryEvidenceIds = evidenceIdsFrom(value.primaryEvidenceIds, value.primary_evidence_ids, value.selectedEvidenceIds, value.evidenceIds);
  const conflictingEvidenceIds = evidenceIdsFrom(value.conflictingEvidenceIds, value.conflicting_evidence_ids, value.alternativeEvidenceIds);
  const claim = asClinicalString(value.claim || value.title || value.question);
  const explanation = asClinicalString(value.explanation || value.rationale || value.reason || value.summary || value.resolution);
  if (!claim && !explanation && !primaryEvidenceIds.length && !conflictingEvidenceIds.length) return undefined;
  return {
    id: asString(value.id, `C${index + 1}`),
    claim: claim || explanation || `Evidence difference ${index + 1}`,
    explanation: explanation || 'Sources were compared by evidence hierarchy and applicability.',
    primaryEvidenceIds,
    conflictingEvidenceIds,
    ...(asClinicalString(value.resolution) ? { resolution: asClinicalString(value.resolution) } : {}),
  };
};

const normalizeTable = (value: unknown, index: number): MedicalEvidenceTable | undefined => {
  if (!isRecord(value)) return undefined;
  const rawRows = asArray(value.rows || value.data);
  const objectRows = rawRows.filter(isRecord);
  const derivedColumns = objectRows.length ? Array.from(new Set(objectRows.flatMap((row) => Object.keys(row)))) : [];
  const rows = objectRows.length
    ? objectRows.map((row) => derivedColumns.map((column) => asString(row[column])))
    : rawRows
        .filter(Array.isArray)
        .map((row) => row.map((cell) => (typeof cell === 'number' ? cell : asString(cell))));
  const columns = asStringArray(value.columns || value.headers || value.header).length
    ? asStringArray(value.columns || value.headers || value.header)
    : derivedColumns.length
      ? derivedColumns
      : rows[0]?.map((_, columnIndex) => `Column ${columnIndex + 1}`) || [];
  if (!columns.length && !rows.length) return undefined;
  return {
    id: asString(value.id, `T${index + 1}`),
    ...(asClinicalString(value.title) ? { title: asClinicalString(value.title) } : {}),
    ...(asClinicalString(value.caption) ? { caption: asClinicalString(value.caption) } : {}),
    columns: columns.map(professionalizeClinicalText),
    rows: rows.map((row) => row.map((cell) => (typeof cell === 'string' ? professionalizeClinicalText(cell) : cell))),
    ...(evidenceIdsFrom(value.evidenceIds, value.evidence_ids).length ? { evidenceIds: evidenceIdsFrom(value.evidenceIds, value.evidence_ids) } : {}),
  };
};

const normalizePanelInput = (value: unknown): unknown => {
  const panel = isRecord(value) ? value : {};
  const evidence = asArray(panel.evidence).map(normalizeEvidenceItem).filter((item): item is MedicalEvidenceItem => Boolean(item));
  const findings = asArray(panel.findings).map(normalizeFinding).filter((item): item is MedicalEvidenceFinding => Boolean(item));
  const summary = asClinicalString(panel.summary);
  if (!findings.length && summary) {
    findings.push({
      id: 'F1',
      title: summary.slice(0, 48),
      conclusion: summary,
      confidence: 'low',
      evidenceIds: evidence.map((item) => item.id).slice(0, 3),
    });
  }
  const appraisals = asArray(panel.appraisals).map(normalizeAppraisal).filter((item): item is MedicalEvidenceAppraisal => Boolean(item));
  const conflicts = asArray(panel.conflicts).map(normalizeConflict).filter((item): item is MedicalEvidenceConflict => Boolean(item));
  const tables = asArray(panel.tables).map(normalizeTable).filter((item): item is MedicalEvidenceTable => Boolean(item));
  const language = detectReportLanguage(panel.question, summary, findings, panel.report);
  const normalizedBaseReport = normalizeReport(panel.report, summary || findings[0]?.conclusion, language);
  const normalizedCards = asArray(panel.cards).map(normalizeReportCard).filter((item): item is MedicalEvidenceReportCard => Boolean(item));
  const cards = normalizedCards;
  const report = normalizedBaseReport
    ? ensureReportStructure(normalizedBaseReport, language, summary, findings, evidence, cards)
    : undefined;
  const rawStats = isRecord(panel.stats) ? panel.stats : {};
  return {
    ...panel,
    schema: MEDICAL_EVIDENCE_PANEL_SCHEMA,
    runId: asString(panel.runId || panel.run_id, `me-${Date.now().toString(36)}`),
    question: asString(panel.question, 'Medical evidence question'),
    ...(asNumber(panel.generatedAt || panel.generated_at) !== undefined ? { generatedAt: asNumber(panel.generatedAt || panel.generated_at) } : {}),
    ...(summary ? { summary } : {}),
    stats: {
      searches: asNumber(rawStats.searches, 0) ?? 0,
      recordsFound: asNumber(rawStats.recordsFound || rawStats.records_found, evidence.length) ?? evidence.length,
      screened: asNumber(rawStats.screened, evidence.length) ?? evidence.length,
      included: asNumber(rawStats.included, evidence.length) ?? evidence.length,
      anchors: asNumber(rawStats.anchors, evidence.filter((item) => item.anchor).length) ?? 0,
      conflicts: asNumber(rawStats.conflicts, conflicts.length || appraisals.filter((item) => item.alternativeEvidenceIds?.length).length) ?? 0,
    },
    findings,
    evidence,
    ...(appraisals.length ? { appraisals } : {}),
    ...(conflicts.length ? { conflicts } : {}),
    ...(report ? { report } : {}),
    ...(cards.length ? { cards } : {}),
    ...(Array.isArray(panel.figures) ? { figures: panel.figures } : {}),
    ...(tables.length ? { tables } : {}),
    ...(isRecord(panel.methods) ? { methods: panel.methods } : {}),
  };
};

class PaperclipGateway {
  private readonly apiKey = process.env[MEDICAL_EVIDENCE_ENV_KEYS.apiKey] || '';
  private readonly baseUrl = (process.env[MEDICAL_EVIDENCE_ENV_KEYS.baseUrl] || DEFAULT_BASE_URL).replace(/\/+$/u, '');
  private readonly timeoutMs = Number(process.env[MEDICAL_EVIDENCE_ENV_KEYS.timeoutMs] || DEFAULT_TIMEOUT_MS);

  async call(command: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('PaperClip API key is not configured. Open Settings > Medical Evidence and add a PaperClip API key.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number.isFinite(this.timeoutMs) ? this.timeoutMs : DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `openscience-medical-evidence-${Date.now()}`,
          method: 'tools/call',
          params: {
            name: 'paperclip',
            arguments: { command },
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`PaperClip request failed (${response.status})`);
      }
      const payload = (await response.json()) as PaperclipMcpResponse;
      if (payload.error?.message) {
        throw new Error(payload.error.message);
      }
      return (payload.result?.content || [])
        .map((item) => (item.type === 'text' ? item.text || '' : ''))
        .filter(Boolean)
        .join('\n');
    } finally {
      clearTimeout(timer);
    }
  }
}

async function main() {
  const paperclip = new PaperclipGateway();
  const server = new McpServer({
    name: BUILTIN_MEDICAL_EVIDENCE_NAME,
    version: '1.0.0',
  });

  server.tool(
    'evidence_start_run',
    'Start a medical evidence retrieval run. Use this before searching PaperClip.',
    {
      question: z.string().describe('Original user medical question.'),
      sources: z.array(sourceSchema).optional().describe('PaperClip sources planned for this run.'),
    },
    async ({ question, sources }) => {
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'run_started',
        runId: `me-${Date.now().toString(36)}`,
        question,
        sources,
        timestamp: Date.now(),
      };
      return jsonText(event);
    }
  );

  server.tool(
    'evidence_search',
    'Search PaperClip medical corpora. Emits a structured search_completed event plus raw PaperClip output.',
    {
      runId: z.string(),
      query: z.string(),
      source: sourceSchema.default('pmc'),
      limit: z.number().min(1).max(20).default(8),
    },
    async ({ runId, query, source, limit }) => {
      const normalizedSource = normalizeSource(source);
      const output = await paperclip.call(`search -s ${normalizedSource} ${JSON.stringify(query)} -n ${limit}`);
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'search_completed',
        runId,
        query,
        source: normalizedSource,
        found: parseFoundCount(output),
        savedSearchId: parseSavedSearchId(output),
        timestamp: Date.now(),
      };
      return jsonText({ ...event, rawOutput: output });
    }
  );

  server.tool(
    'evidence_collect_anchor',
    'Collect line-level anchors from PaperClip virtual files such as /papers/<id>/content.lines or /fda/<id>/content.lines.',
    {
      runId: z.string(),
      sourceId: z.string().describe('PaperClip paper/FDA/trial id, e.g. PMC8934917.'),
      path: z.string().describe('PaperClip virtual file path.'),
      lineRange: z.string().optional().describe('Line range such as 40-48. If omitted, the first 80 lines are returned.'),
    },
    async ({ runId, sourceId, path, lineRange }) => {
      const command = lineRange ? `cat ${JSON.stringify(path)} --lines ${lineRange}` : `head -80 ${JSON.stringify(path)}`;
      const output = await paperclip.call(command);
      const anchors = parseAnchors(output, sourceId, path);
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'anchor_collected',
        runId,
        sourceId,
        path,
        anchors,
        timestamp: Date.now(),
      };
      return jsonText({ ...event, rawOutput: output });
    }
  );

  server.tool(
    'evidence_read_artifact',
    'Read a PaperClip artifact for traceable report cards: meta.json, content.lines, sections, figures list, ask-image output, SQL/export, or repo citation outputs.',
    {
      runId: z.string(),
      kind: artifactKindSchema,
      command: z.string().optional().describe('Explicit PaperClip command without the leading paperclip binary, e.g. cat /papers/<id>/meta.json.'),
      path: z.string().optional().describe('Virtual PaperClip path such as /papers/<id>/meta.json or /papers/<id>/figures/.'),
      lineRange: z.string().optional().describe('Optional line range for content/section reads, e.g. 40-60.'),
      source: z.string().optional(),
      savedSearchId: z.string().optional(),
      description: z.string().optional(),
    },
    async ({ runId, kind, command, path, lineRange, source, savedSearchId, description }) => {
      const resolvedCommand =
        command ||
        (path
          ? lineRange
            ? `cat ${JSON.stringify(path)} --lines ${lineRange}`
            : kind === 'figures'
              ? `ls ${JSON.stringify(path)}`
              : `cat ${JSON.stringify(path)}`
          : undefined);
      if (!resolvedCommand) {
        throw new Error('Provide either command or path for evidence_read_artifact.');
      }
      const output = await paperclip.call(resolvedCommand);
      const artifact = paperclipArtifactSchema.parse({
        kind,
        source,
        command: resolvedCommand,
        path,
        savedSearchId,
        description,
      }) as MedicalEvidencePaperclipArtifact;
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'artifact_read',
        runId,
        artifact,
        outputPreview: previewOutput(output),
        timestamp: Date.now(),
      };
      return jsonText({ ...event, rawOutput: output });
    }
  );

  server.tool(
    'evidence_grade',
    'Grade a retrieved evidence item using a conservative evidence hierarchy and applicability check.',
    {
      runId: z.string(),
      evidenceId: z.string(),
      sourceType: sourceTypeSchema,
      year: z.number().optional(),
      applicabilityConcern: z.boolean().optional(),
      reason: z.string().optional(),
    },
    async ({ runId, evidenceId, sourceType, year, applicabilityConcern, reason }) => {
      const inferred = inferConfidence(sourceType, year);
      const confidence: MedicalEvidenceConfidence =
        applicabilityConcern && inferred === 'high' ? 'moderate' : applicabilityConcern && inferred === 'moderate' ? 'low' : inferred;
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'evidence_graded',
        runId,
        evidenceId,
        confidence,
        grade: `${gradeLabel(confidence, sourceType)}${reason ? `; ${reason}` : ''}`,
        timestamp: Date.now(),
      };
      return jsonText(event);
    }
  );

  server.tool(
    'evidence_attach_figure',
    'Attach a report figure during a medical evidence run. Use this for image URLs, generated chart previews, or drawio previews that will later appear in evidence_submit_panel.figures.',
    {
      runId: z.string(),
      figure: figureSchema.describe('Structured figure metadata. Include previewSvgPath/previewPngPath for drawio when possible.'),
    },
    async ({ runId, figure }) => {
      const parsedFigure = figureSchema.parse(figure) as MedicalEvidenceFigure;
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'figure_attached',
        runId,
        figure: parsedFigure,
        timestamp: Date.now(),
      };
      return jsonText(event);
    }
  );

  server.tool(
    'evidence_submit_panel',
    [
      'Submit the final structured evidence panel before the final medical answer. The UI renders this panel under the answer.',
      'Expected panel shape: { runId, question, stats, findings, evidence, report?, appraisals?, conflicts?, cards?, figures?, tables?, methods? }.',
      'Use strict canonical fields when possible: checklist items require label, bullet_list items require text, paragraph blocks require text and may also include markdown, paperclip.artifacts items must be objects like {kind,path,command,description}, appraisals require claim/conclusion/rationale/selectedEvidenceIds, tables require columns and rows.',
      'The final report should read for humans: bottom-line answer first, then brief background/why this matters when needed, then evidence-backed points, then applicability gaps. Do not submit a bare table/checklist without explanatory prose.',
      'In the Bottom Line/答案总览 section, Markdown bold is optional. Use **...** only when a decisive phrase or sentence truly benefits from emphasis; otherwise keep normal prose.',
      'Cards and card items may include markdown for an independent explanatory text block: card.markdown or item.markdown. Use it for short paragraphs or bullets that explain the card in plain language, such as how to read an applicability boundary, visual module, checklist, or evidence-weighting block; attach citations through evidenceIds, not literal [E1] text.',
      'For non-trivial reports, usually consider at least one evidence-bound figure or diagram. Prefer drawio/Graphviz/Mermaid-style pathways for clinical flow, source weighting, applicability boundaries, or mechanism; include previewSvgPath/previewPngPath when submitting drawio figures.',
      'Put citation links only in evidenceIds arrays. Do not manually append literal citation markers such as [E1] [E2] inside summary, text, label, detail, captions, card fields, or table cells; the UI renders anchors automatically.',
      'Do not send conflicts unless evidence really diverges. For source weighting without true conflict, use appraisals. This tool will normalize common loose inputs, but canonical JSON is preferred.',
    ].join(' '),
    {
      panel: z.record(z.unknown()).describe('Structured MedicalEvidencePanelData-like object. Prefer the canonical schema described in the tool description.'),
    },
    async ({ panel }) => {
      const parsedPanel = panelSchema.parse(normalizePanelInput(panel));
      const evidence = parsedPanel.evidence as MedicalEvidenceItem[];
      const findings = parsedPanel.findings as MedicalEvidenceFinding[];
      const appraisals = parsedPanel.appraisals as MedicalEvidenceAppraisal[] | undefined;
      const conflicts = parsedPanel.conflicts as MedicalEvidenceConflict[] | undefined;
      const report = parsedPanel.report as MedicalEvidenceReport | undefined;
      const cards = parsedPanel.cards as MedicalEvidenceReportCard[] | undefined;
      const figures = parsedPanel.figures as MedicalEvidenceFigure[] | undefined;
      const tables = parsedPanel.tables as MedicalEvidenceTable[] | undefined;
      const stats = parsedPanel.stats;
      const normalizedPanel: MedicalEvidencePanelData = {
        schema: MEDICAL_EVIDENCE_PANEL_SCHEMA,
        runId: parsedPanel.runId,
        question: parsedPanel.question,
        generatedAt: parsedPanel.generatedAt || Date.now(),
        summary: parsedPanel.summary,
        stats: {
          searches: stats.searches ?? 0,
          recordsFound: stats.recordsFound ?? 0,
          screened: stats.screened ?? 0,
          included: stats.included || evidence.length,
          anchors: stats.anchors || evidence.filter((item) => item.anchor).length,
          conflicts: stats.conflicts || appraisals?.filter((item) => item.alternativeEvidenceIds?.length).length || conflicts?.length || 0,
        },
        findings,
        evidence,
        appraisals,
        conflicts,
        report,
        cards,
        figures,
        tables,
        methods: parsedPanel.methods,
      };
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'panel_submitted',
        runId: normalizedPanel.runId,
        panel: normalizedPanel,
        timestamp: Date.now(),
      };
      return jsonText(event);
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[MedicalEvidenceMCP] Fatal error:', error);
  process.exit(1);
});
