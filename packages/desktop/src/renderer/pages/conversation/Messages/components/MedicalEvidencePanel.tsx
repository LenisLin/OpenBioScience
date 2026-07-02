/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  MedicalEvidenceAppraisal,
  MedicalEvidenceConfidence,
  MedicalEvidenceConflict,
  MedicalEvidenceFigure,
  MedicalEvidenceFinding,
  MedicalEvidenceItem,
  MedicalEvidencePanelData,
  MedicalEvidencePaperclipArtifact,
  MedicalEvidenceQualityBadge,
  MedicalEvidenceReportBlock,
  MedicalEvidenceReportCard,
  MedicalEvidenceReportCardItem,
  MedicalEvidenceReportCardKind,
  MedicalEvidenceTable,
  MedicalEvidenceTraceItem,
  MedicalEvidenceTraceKind,
} from '@/common/chat/medicalEvidence';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import MedicalEvidenceIcon, { type MedicalEvidenceIconName } from '@/renderer/components/icons/MedicalEvidenceIcon';
import { Copy, Down, Right } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './MedicalEvidencePanel.css';

type Stats = MedicalEvidencePanelData['stats'];
type MedicalEvidenceUiLanguage = 'zh' | 'en';
type RuntimeSummary = {
  stats: Stats;
  trace?: MedicalEvidenceTraceItem[];
  hasPanel?: boolean;
  language?: MedicalEvidenceUiLanguage;
  processEventCount?: number;
  stageKeys?: MedicalEvidenceTraceKind[];
};
type InlineMarkdownVariant = 'body' | 'table';

const confidenceTone: Record<MedicalEvidenceConfidence, string> = {
  high: 'medical-evidence-tone--high',
  moderate: 'medical-evidence-tone--moderate',
  low: 'medical-evidence-tone--low',
  very_low: 'medical-evidence-tone--low',
};

const citationTone: Record<MedicalEvidenceConfidence, string> = {
  high: 'medical-evidence-citation--strong',
  moderate: 'medical-evidence-citation--medium',
  low: 'medical-evidence-citation--soft',
  very_low: 'medical-evidence-citation--soft',
};

const qualityBadgeIconName: Record<MedicalEvidenceQualityBadge, MedicalEvidenceIconName> = {
  leading_journal: 'gradeHigh',
  new_research: 'search',
  guideline: 'guideline',
  drug_label: 'drugLabel',
  regulatory: 'regulatory',
  rct: 'rct',
  systematic_review: 'review',
  population_matched: 'pico',
  anchored: 'anchor',
  figure_available: 'scan',
  paperclip_verified: 'paper',
  full_text: 'paper',
  recent: 'search',
  safety: 'drugLabel',
  applicability_limited: 'downgrade',
};

const qualityBadgePriority: Record<MedicalEvidenceQualityBadge, number> = {
  leading_journal: 1,
  guideline: 2,
  systematic_review: 3,
  rct: 4,
  drug_label: 5,
  regulatory: 6,
  paperclip_verified: 7,
  anchored: 8,
  full_text: 9,
  population_matched: 10,
  safety: 11,
  applicability_limited: 12,
  recent: 13,
  new_research: 14,
  figure_available: 15,
};

const confidenceIconName: Record<MedicalEvidenceConfidence, MedicalEvidenceIconName> = {
  high: 'gradeHigh',
  moderate: 'gradeMid',
  low: 'gradeLow',
  very_low: 'gradeLow',
};

const MEDICAL_EVIDENCE_LABELS = {
  zh: {
    confidence: {
      high: '高',
      moderate: '中',
      low: '低',
      very_low: '很低',
    },
    source: {
      guideline: '指南',
      systematic_review: '系统综述',
      rct: 'RCT',
      cohort: '队列',
      case_control: '病例对照',
      case_series: '病例系列',
      regulatory: '监管',
      drug_label: '说明书',
      trial_registry: '注册',
      abstract: '摘要',
      other: '其他',
    },
    qualityBadge: {
      leading_journal: '顶级期刊',
      new_research: '新研究',
      guideline: '指南',
      drug_label: '说明书',
      regulatory: '监管',
      rct: 'RCT',
      systematic_review: '系统综述',
      population_matched: '人群匹配',
      anchored: '已锚定',
      figure_available: '有图像',
      paperclip_verified: 'PaperClip',
      full_text: '全文',
      recent: '近年',
      safety: '安全性',
      applicability_limited: '适用受限',
    },
    artifact: {
      search: '检索',
      metadata: '元数据',
      content: '原文',
      section: '章节',
      figures: '图像目录',
      figure_analysis: '读图',
      sql: 'SQL',
      export: '导出',
      repo: '引用库',
    },
    stats: {
      search: '检索',
      screen: '筛选',
      include: '纳入',
      anchor: '锚点',
      weigh: '权衡',
    },
    pipelineLabel: '真实循证事件',
    stages: {
      plan: 'PICO',
      search: '检索',
      artifact: '读取',
      anchor: '锚定',
      grade: '分级',
      figure: '图表',
      panel: '报告',
    },
    waitingEvidence: '等待证据入库',
    originalText: '原文',
    viewReference: '查看引用',
    drawioSource: 'draw.io 源文件',
    figurePending: '图表预览待生成',
    evidenceStrength: '证据强度：',
    evidenceWeighing: '证据权衡',
    evidenceDecision: '循证判定',
    adopted: '采纳',
    weighed: '权衡',
    downgraded: '降权',
    fallbackTitle: '临床循证报告',
    fallbackSubtitle: '可追溯引用 · 证据分级 · 适用性边界',
    findingSection: '结论校验',
    appraisalSection: '循证判定',
    referenceSection: '参考文献与原文锚点',
    expandReferences: '展开全部',
    collapseReferences: '收起引用',
    referencesUnit: '条引用',
    methods: '方法记录',
    queryPlan: '检索计划',
    gradingFramework: '分级原则',
    limitations: '限制',
    inferredBottomLine: '答案总览',
    inferredReasoningMap: '判定要点',
    inferredEvidencePoints: '分点结论',
    inferredChecklist: '决策条件清单',
    inferredActionPoints: '行动关注点',
    inferredTable: '证据表',
    inferredFigure: '图示证据',
  },
  en: {
    confidence: {
      high: 'High',
      moderate: 'Moderate',
      low: 'Low',
      very_low: 'Very low',
    },
    source: {
      guideline: 'Guideline',
      systematic_review: 'Systematic review',
      rct: 'RCT',
      cohort: 'Cohort',
      case_control: 'Case-control',
      case_series: 'Case series',
      regulatory: 'Regulatory',
      drug_label: 'Label',
      trial_registry: 'Registry',
      abstract: 'Abstract',
      other: 'Other',
    },
    qualityBadge: {
      leading_journal: 'Leading journal',
      new_research: 'New research',
      guideline: 'Guideline',
      drug_label: 'Drug label',
      regulatory: 'Regulatory',
      rct: 'RCT',
      systematic_review: 'Systematic review',
      population_matched: 'Population matched',
      anchored: 'Anchored',
      figure_available: 'Figure',
      paperclip_verified: 'PaperClip',
      full_text: 'Full text',
      recent: 'Recent',
      safety: 'Safety',
      applicability_limited: 'Applicability limited',
    },
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
    stats: {
      search: 'searches',
      screen: 'screened',
      include: 'included',
      anchor: 'anchors',
      weigh: 'weighed',
    },
    pipelineLabel: 'Real evidence events',
    stages: {
      plan: 'PICO',
      search: 'Search',
      artifact: 'Read',
      anchor: 'Anchor',
      grade: 'Grade',
      figure: 'Figure',
      panel: 'Report',
    },
    waitingEvidence: 'Waiting for evidence',
    originalText: 'Source',
    viewReference: 'View reference',
    drawioSource: 'draw.io source',
    figurePending: 'Figure preview pending',
    evidenceStrength: 'Evidence strength: ',
    evidenceWeighing: 'Evidence weighing',
    evidenceDecision: 'Evidence decision',
    adopted: 'Adopted',
    weighed: 'Weighed',
    downgraded: 'Downgraded',
    fallbackTitle: 'Clinical Evidence Report',
    fallbackSubtitle: 'Traceable references · Evidence grading · Applicability boundaries',
    findingSection: 'Conclusion Check',
    appraisalSection: 'Evidence Decision',
    referenceSection: 'References and Source Anchors',
    expandReferences: 'Show all',
    collapseReferences: 'Collapse references',
    referencesUnit: 'references',
    methods: 'Methods',
    queryPlan: 'Search plan',
    gradingFramework: 'Grading framework',
    limitations: 'Limitations',
    inferredBottomLine: 'Bottom Line',
    inferredReasoningMap: 'Key Points',
    inferredEvidencePoints: 'Evidence-Backed Points',
    inferredChecklist: 'Decision Checklist',
    inferredActionPoints: 'Action Points',
    inferredTable: 'Evidence Table',
    inferredFigure: 'Visual Evidence',
  },
} satisfies Record<
  MedicalEvidenceUiLanguage,
  {
    confidence: Record<MedicalEvidenceConfidence, string>;
    source: Record<MedicalEvidenceItem['sourceType'], string>;
    qualityBadge: Record<MedicalEvidenceQualityBadge, string>;
    artifact: Record<MedicalEvidencePaperclipArtifact['kind'], string>;
    stats: Record<'search' | 'screen' | 'include' | 'anchor' | 'weigh', string>;
    pipelineLabel: string;
    stages: Record<MedicalEvidenceTraceKind, string>;
    waitingEvidence: string;
    originalText: string;
    viewReference: string;
    drawioSource: string;
    figurePending: string;
    evidenceStrength: string;
    evidenceWeighing: string;
    evidenceDecision: string;
    adopted: string;
    weighed: string;
    downgraded: string;
    fallbackTitle: string;
    fallbackSubtitle: string;
    findingSection: string;
    appraisalSection: string;
    referenceSection: string;
    expandReferences: string;
    collapseReferences: string;
    referencesUnit: string;
    methods: string;
    queryPlan: string;
    gradingFramework: string;
    limitations: string;
    inferredBottomLine: string;
    inferredReasoningMap: string;
    inferredEvidencePoints: string;
    inferredChecklist: string;
    inferredActionPoints: string;
    inferredTable: string;
    inferredFigure: string;
  }
>;

type MedicalEvidenceLabels = (typeof MEDICAL_EVIDENCE_LABELS)[MedicalEvidenceUiLanguage];

const MedicalEvidenceLanguageContext = React.createContext<MedicalEvidenceUiLanguage>('zh');

const useMedicalEvidenceLabels = (): MedicalEvidenceLabels =>
  MEDICAL_EVIDENCE_LABELS[React.useContext(MedicalEvidenceLanguageContext)];

const statItems = (stats: Stats, labels: MedicalEvidenceLabels) => [
  { label: labels.stats.search, value: stats.searches },
  { label: labels.stats.screen, value: stats.screened || stats.recordsFound },
  { label: labels.stats.include, value: stats.included },
  { label: labels.stats.anchor, value: stats.anchors },
  ...(stats.conflicts ? [{ label: labels.stats.weigh, value: stats.conflicts }] : []),
];

const stageOrder: MedicalEvidenceTraceKind[] = ['plan', 'search', 'artifact', 'anchor', 'grade', 'figure'];

const buildStageActivity = (
  trace: MedicalEvidenceTraceItem[],
  summary?: RuntimeSummary
): Array<{ key: MedicalEvidenceTraceKind; count: number; latestIndex: number }> => {
  const activity = new Map<
    MedicalEvidenceTraceKind,
    { key: MedicalEvidenceTraceKind; count: number; latestIndex: number }
  >();
  const register = (key: MedicalEvidenceTraceKind, latestIndex = -1) => {
    if (key === 'panel') return;
    const existing = activity.get(key);
    activity.set(key, {
      key,
      count: (existing?.count ?? 0) + (latestIndex >= 0 ? 1 : 0),
      latestIndex: Math.max(existing?.latestIndex ?? -1, latestIndex),
    });
  };

  for (const key of summary?.stageKeys || []) {
    register(key);
  }
  trace.forEach((item, index) => register(item.kind, index));

  return stageOrder
    .filter((key) => activity.has(key))
    .map((key) => activity.get(key)!)
    .filter(Boolean);
};

const detectUiLanguage = (panel: MedicalEvidencePanelData): MedicalEvidenceUiLanguage => {
  const text: Array<string | undefined> = [panel.report?.title, panel.summary];
  for (const section of panel.report?.sections || []) {
    text.push(section.heading);
    for (const block of section.blocks) {
      if (block.type === 'paragraph') text.push(block.text, block.markdown);
      if (block.type === 'bullet_list') text.push(...block.items.map((item) => item.text));
      if (block.type === 'checklist') {
        for (const item of block.items) text.push(item.label, item.detail);
      }
    }
  }
  for (const card of panel.cards || []) {
    text.push(card.title, card.subtitle, card.markdown);
    for (const item of card.items || []) text.push(item.label, item.detail, item.markdown);
  }
  for (const finding of panel.findings) text.push(finding.title, finding.conclusion);
  const reportText = text.filter((item): item is string => Boolean(item)).join(' ');
  const chineseChars = reportText.match(/[\u3400-\u9fff]/gu)?.length || 0;
  const latinWords = reportText.match(/[A-Za-z][A-Za-z-]{2,}/gu)?.length || 0;
  return chineseChars >= Math.max(8, latinWords * 2) ? 'zh' : 'en';
};

const resolveMedicalEvidenceUiLanguage = (
  appLanguage: string | undefined,
  panel: MedicalEvidencePanelData
): MedicalEvidenceUiLanguage => {
  const normalized = appLanguage?.replace(/_/gu, '-').toLowerCase() || '';
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('en')) return 'en';
  return detectUiLanguage(panel) === 'zh' ? 'zh' : 'en';
};

const reportHeadingTranslations = [
  {
    zh: '临床摘要',
    en: 'Clinical Summary',
    aliases: ['clinical summary', 'summary', 'executive summary', '临床摘要', '摘要', '结论摘要'],
  },
  {
    zh: '引言',
    en: 'Introduction',
    aliases: ['introduction', 'background', '背景', '引言', '问题背景'],
  },
  {
    zh: '证据综合',
    en: 'Evidence Synthesis',
    aliases: ['evidence synthesis', 'synthesis', 'evidence summary', '证据综合', '证据总结', '证据摘要'],
  },
  {
    zh: '适用性与安全性',
    en: 'Applicability and Safety',
    aliases: [
      'applicability and safety',
      'applicability & safety',
      'safety and applicability',
      '适用性与安全性',
      '适用性和安全性',
    ],
  },
  {
    zh: '图表证据',
    en: 'Visual Evidence',
    aliases: ['visual evidence', 'figures', 'figure evidence', '图表证据', '图像证据', '图表或表格证据'],
  },
  {
    zh: '结论与证据映射',
    en: 'Claim-to-Evidence Map',
    aliases: ['claim-to-evidence map', 'claim evidence map', 'evidence map', '结论与证据映射', '结论证据映射'],
  },
  {
    zh: '方法',
    en: 'Methods',
    aliases: ['methods', 'method', '方法', '方法记录'],
  },
  {
    zh: '限制',
    en: 'Limitations',
    aliases: ['limitations', 'limits', '限制', '局限性'],
  },
];

const normalizeHeadingKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[&]/gu, 'and')
    .replace(/[\s\-–—_/：:]+/gu, ' ')
    .replace(/\s+/gu, ' ');

const isInternalReportHeading = (heading: string): boolean =>
  /^(?:回答结构|推理路径|证据依据|临床问题|从问题到证据再到结论的阅读路径|reasoning\s*map|reasoning\s*path|evidence\s*basis|clinical\s*question)$/iu.test(
    normalizeHeadingKey(heading)
  );

const normalizeReportHeading = (heading: string, language: MedicalEvidenceUiLanguage): string => {
  const key = normalizeHeadingKey(heading);
  const match = reportHeadingTranslations.find((item) =>
    item.aliases.some((alias) => normalizeHeadingKey(alias) === key)
  );
  return match ? match[language] : heading;
};

const normalizeReportTitle = (title: string | undefined, labels: MedicalEvidenceLabels): string | undefined => {
  if (!title) return title;
  const key = normalizeHeadingKey(title);
  if (['clinical evidence report', 'medical evidence report', '临床循证报告', '医学循证报告'].includes(key)) {
    return labels.fallbackTitle;
  }
  return title;
};

const inferReportSectionHeading = (
  section: NonNullable<MedicalEvidencePanelData['report']>['sections'][number],
  labels: MedicalEvidenceLabels,
  index: number
): string | undefined => {
  if (section.heading && !isInternalReportHeading(stripStandaloneEvidenceCitations(section.heading)))
    return section.heading;
  if (section.blocks.some((block) => block.type === 'checklist')) return labels.inferredChecklist;
  if (section.blocks.some((block) => block.type === 'bullet_list'))
    return index <= 2 ? labels.inferredEvidencePoints : labels.inferredActionPoints;
  if (section.blocks.some((block) => block.type === 'card_ref' || block.type === 'card_grid')) return undefined;
  if (section.blocks.some((block) => block.type === 'table_ref')) return labels.inferredTable;
  if (section.blocks.some((block) => block.type === 'figure_ref')) return labels.inferredFigure;
  if (index === 0) return labels.inferredBottomLine;
  return undefined;
};

const traceIconName: Record<MedicalEvidenceTraceItem['kind'], MedicalEvidenceIconName> = {
  plan: 'pico',
  search: 'search',
  anchor: 'anchor',
  grade: 'gradeHigh',
  artifact: 'paper',
  figure: 'scan',
  panel: 'complete',
};

const getTraceIconName = (item: MedicalEvidenceTraceItem): MedicalEvidenceIconName => {
  if (item.kind !== 'grade') return traceIconName[item.kind];
  const detail = item.detail?.toLowerCase() || '';
  if (detail.includes('low') || detail.includes('很低')) return 'gradeLow';
  if (detail.includes('moderate') || detail.includes('中')) return 'gradeMid';
  return 'gradeHigh';
};

const reportCardIconName: Record<MedicalEvidenceReportCardKind, MedicalEvidenceIconName> = {
  quality_references: 'citation',
  paperclip_trace: 'paper',
  evidence_hierarchy: 'gradeHigh',
  visual_evidence: 'scan',
  applicability: 'pico',
  safety: 'drugLabel',
  search_strategy: 'search',
  claim_map: 'anchor',
  source_coverage: 'basket',
  takeaway: 'complete',
};

const reportCardKindsWithIcon = new Set<MedicalEvidenceReportCardKind>([
  'quality_references',
  'paperclip_trace',
  'visual_evidence',
]);

const unique = <T,>(items: T[]): T[] => Array.from(new Set(items));

const getEvidenceQualityBadges = (evidence: MedicalEvidenceItem): MedicalEvidenceQualityBadge[] => {
  const badges: MedicalEvidenceQualityBadge[] = [...(evidence.qualityBadges || [])];
  const add = (badge: MedicalEvidenceQualityBadge) => {
    if (!badges.includes(badge)) badges.push(badge);
  };
  if (evidence.sourceType === 'guideline') add('guideline');
  if (evidence.sourceType === 'drug_label') add('drug_label');
  if (evidence.sourceType === 'regulatory') add('regulatory');
  if (evidence.sourceType === 'rct') add('rct');
  if (evidence.sourceType === 'systematic_review') add('systematic_review');
  if (evidence.journalTier === 'leading') add('leading_journal');
  if (evidence.anchor) add('anchored');
  if (evidence.paperclip?.artifacts?.length || evidence.paperclip?.metaPath || evidence.paperclip?.contentPath) {
    add('paperclip_verified');
  }
  if (evidence.paperclip?.contentPath || evidence.anchor?.path?.includes('content.lines')) add('full_text');
  if (evidence.paperclip?.figuresPath) add('figure_available');
  const publishedYear = evidence.publishedAt ? Number(evidence.publishedAt.match(/\d{4}/u)?.[0]) : evidence.year;
  if (publishedYear && new Date().getFullYear() - publishedYear <= 3) add('recent');
  if (/不适用|不能|外推|受限|limited|mismatch/iu.test(evidence.applicability || '')) add('applicability_limited');
  return badges.slice(0, 7);
};

const QualityBadgeList: React.FC<{ badges: MedicalEvidenceQualityBadge[]; compact?: boolean }> = ({
  badges,
  compact,
}) => {
  const labels = useMedicalEvidenceLabels();
  const resolvedBadges = unique(badges)
    .toSorted((left, right) => qualityBadgePriority[left] - qualityBadgePriority[right])
    .slice(0, compact ? 2 : 3);
  if (!resolvedBadges.length) return null;
  return (
    <span
      className={classNames('medical-evidence-qualityBadges', compact && 'medical-evidence-qualityBadges--compact')}
    >
      {resolvedBadges.map((badge) => (
        <span key={badge} className={`medical-evidence-qualityBadge medical-evidence-qualityBadge--${badge}`}>
          <MedicalEvidenceIcon name={qualityBadgeIconName[badge]} size={compact ? 11 : 12} visualScale={1.12} />
          {labels.qualityBadge[badge]}
        </span>
      ))}
    </span>
  );
};

const formatArtifactDetail = (artifact: MedicalEvidencePaperclipArtifact): string => {
  const lineLabel =
    artifact.lineStart && artifact.lineEnd
      ? artifact.lineStart === artifact.lineEnd
        ? `L${artifact.lineStart}`
        : `L${artifact.lineStart}-L${artifact.lineEnd}`
      : undefined;
  return [artifact.path, lineLabel, artifact.savedSearchId].filter(Boolean).join(' · ');
};

export const MedicalEvidenceAccumulator: React.FC<{
  stats?: Stats;
  summary?: RuntimeSummary;
  running?: boolean;
  showDetails?: boolean;
}> = ({ stats, summary, running, showDetails = false }) => {
  const contextLabels = useMedicalEvidenceLabels();
  const labels = contextLabels;
  const resolvedStats = summary?.stats || stats;
  if (!resolvedStats) return null;
  const trace = (summary?.trace || []).filter((item) => item.kind !== 'panel').slice(-4);
  const processEventCount = summary?.processEventCount ?? trace.length;
  const stageActivity = buildStageActivity(
    (summary?.trace || []).filter((item) => item.kind !== 'panel'),
    summary
  );
  if (processEventCount <= 0 || (!trace.length && !stageActivity.length)) return null;
  const basketCount = resolvedStats.included || resolvedStats.anchors || resolvedStats.recordsFound || 0;
  const activeStageKey = trace.at(-1)?.kind;
  const hasBasketEvidence = basketCount > 0;
  return (
    <div
      className={classNames(
        'medical-evidence-accumulator',
        running && 'medical-evidence-accumulator--running',
        hasBasketEvidence && 'medical-evidence-accumulator--has-basket',
        !showDetails && 'medical-evidence-accumulator--compact'
      )}
    >
      <div className='medical-evidence-accumulator__main'>
        <div className='medical-evidence-accumulator__pipeline' aria-label={labels.pipelineLabel}>
          {stageActivity.map((stage) => (
            <span
              key={stage.key}
              className={classNames(
                'medical-evidence-accumulator__stage',
                stage.count > 0 && 'medical-evidence-accumulator__stage--seen',
                activeStageKey === stage.key && 'medical-evidence-accumulator__stage--active'
              )}
            >
              <i aria-hidden='true' />
              {labels.stages[stage.key]}
              {stage.count > 1 ? <b>{stage.count}</b> : null}
            </span>
          ))}
        </div>
        {showDetails ? (
          <span className='medical-evidence-accumulator__stats'>
            {statItems(resolvedStats, labels).map((item) => (
              <span key={item.label}>
                <b>{item.value}</b>
                {item.label}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {showDetails ? (
        <div className='medical-evidence-accumulator__basket' aria-label='证据篮'>
          <span className='medical-evidence-accumulator__basketIcon' aria-hidden='true'>
            <MedicalEvidenceIcon
              name='basket'
              size={21}
              visualScale={1.12}
              className='medical-evidence-accumulator__basketBase'
            />
            {hasBasketEvidence ? (
              <>
                <MedicalEvidenceIcon
                  key={`basket-slip-${basketCount}`}
                  name='paper'
                  size={11}
                  visualScale={1.08}
                  className='medical-evidence-accumulator__basketSlip'
                />
                <b key={basketCount}>{basketCount}</b>
              </>
            ) : null}
          </span>
          <div className='medical-evidence-accumulator__trace'>
            {trace.map((item, index) => (
              <span
                key={item.id}
                className='medical-evidence-accumulator__traceItem'
                style={{ animationDelay: `${Math.max(0, index) * 45}ms` }}
              >
                <MedicalEvidenceIcon
                  name={getTraceIconName(item)}
                  size={14}
                  visualScale={1.14}
                  className='medical-evidence-accumulator__traceIcon'
                />
                <span>{item.label}</span>
                {item.detail ? <em>{item.detail}</em> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const AnchorLabel: React.FC<{ evidence: MedicalEvidenceItem }> = ({ evidence }) => {
  const labels = useMedicalEvidenceLabels();
  const anchor = evidence.anchor;
  const href = evidence.url || anchor?.url;
  const lineLabel =
    anchor?.lineStart && anchor?.lineEnd
      ? anchor.lineStart === anchor.lineEnd
        ? `L${anchor.lineStart}`
        : `L${anchor.lineStart}-L${anchor.lineEnd}`
      : undefined;
  if (!href && !anchor?.path) return null;
  const content = (
    <>
      <MedicalEvidenceIcon name='anchor' size={13} visualScale={1.12} />
      {lineLabel || labels.originalText}
    </>
  );
  if (href) {
    return (
      <a className='medical-evidence-anchorLabel' href={href} target='_blank' rel='noreferrer'>
        {content}
      </a>
    );
  }
  return (
    <span className='medical-evidence-anchorLabel' title={anchor?.path || ''}>
      {content}
    </span>
  );
};

const getCitationLabel = (evidence: MedicalEvidenceItem | undefined, labels: MedicalEvidenceLabels): string => {
  if (!evidence) return '';
  return [evidence.id, labels.source[evidence.sourceType], labels.confidence[evidence.confidence]]
    .filter(Boolean)
    .join(' · ');
};

const scrollToEvidence = (id: string) => {
  const target = document.getElementById(`medical-evidence-${id}`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (!target) return;
  target.classList.remove('medical-evidence-card--jumped');
  window.setTimeout(() => {
    target.classList.add('medical-evidence-card--jumped');
    window.setTimeout(() => target.classList.remove('medical-evidence-card--jumped'), 2200);
  }, 0);
};

const EvidenceHoverCard: React.FC<{ evidence: MedicalEvidenceItem; children: React.ReactNode }> = ({
  evidence,
  children,
}) => {
  const labels = useMedicalEvidenceLabels();
  const lineLabel =
    evidence.anchor?.lineStart && evidence.anchor?.lineEnd
      ? evidence.anchor.lineStart === evidence.anchor.lineEnd
        ? `L${evidence.anchor.lineStart}`
        : `L${evidence.anchor.lineStart}-L${evidence.anchor.lineEnd}`
      : undefined;
  const badges = getEvidenceQualityBadges(evidence);
  const content = (
    <button
      type='button'
      className='medical-evidence-citationCard'
      onClick={(event) => {
        event.preventDefault();
        scrollToEvidence(evidence.id);
      }}
    >
      <span className='medical-evidence-citationCard__meta'>{getCitationLabel(evidence, labels)}</span>
      <strong>{evidence.title}</strong>
      <QualityBadgeList badges={badges} compact />
      {evidence.summary ? <span>{evidence.summary}</span> : null}
      {evidence.anchor?.quote ? <blockquote>{evidence.anchor.quote}</blockquote> : null}
      <em>{lineLabel || evidence.paperclip?.contentPath || evidence.doi || evidence.url || labels.viewReference}</em>
    </button>
  );
  return (
    <span className='medical-evidence-citationWrap'>
      <button
        type='button'
        className={classNames('medical-evidence-citation', citationTone[evidence.confidence])}
        onClick={(event) => {
          event.preventDefault();
          scrollToEvidence(evidence.id);
        }}
      >
        {children}
      </button>
      {content}
    </span>
  );
};

const EvidenceCitationList: React.FC<{ ids: string[]; evidenceById: Map<string, MedicalEvidenceItem> }> = ({
  ids,
  evidenceById,
}) => (
  <span className='medical-evidence-citationList'>
    {ids.map((id) => {
      const evidence = evidenceById.get(id);
      if (!evidence)
        return (
          <span key={id} className='medical-evidence-citation medical-evidence-citation--plain'>
            [{id}]
          </span>
        );
      return (
        <EvidenceHoverCard key={id} evidence={evidence}>
          [{id}]
        </EvidenceHoverCard>
      );
    })}
  </span>
);

const renderInlineMarkdown = (text: string, variant: InlineMarkdownVariant = 'body'): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const emphasisPattern = /\*\*([^*]+?)\*\*/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = emphasisPattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const content = match[1].trim();
    nodes.push(
      content ? (
        <strong
          key={`emphasis-${match.index}`}
          className={classNames('medical-evidence-emphasis', variant === 'table' && 'medical-evidence-emphasis--table')}
        >
          {content}
        </strong>
      ) : (
        match[0]
      )
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : [text];
};

const stripStandaloneEvidenceCitations = (text: string): string =>
  text
    .replace(/\s*(?:\[\s*E\d+\s*\]\s*){1,}/giu, ' ')
    .replace(/\s+([，。；：、,.!?;:])/gu, '$1')
    .replace(/([（(【])\s+/gu, '$1')
    .replace(/\s+([）)】])/gu, '$1')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();

const renderEvidenceInlineMarkdown = (text: string, variant: InlineMarkdownVariant = 'body'): React.ReactNode[] =>
  renderInlineMarkdown(stripStandaloneEvidenceCitations(text), variant);

const renderInlineValue = (
  value: string | number | undefined,
  variant: InlineMarkdownVariant = 'body'
): React.ReactNode => (typeof value === 'string' ? renderEvidenceInlineMarkdown(value, variant) : (value ?? ''));

const appendEvidenceCitations = (
  text: string,
  ids: string[] | undefined,
  evidenceById: Map<string, MedicalEvidenceItem>
) => (
  <>
    {renderEvidenceInlineMarkdown(text)}
    {ids?.length ? (
      <>
        {' '}
        <EvidenceCitationList ids={ids} evidenceById={evidenceById} />
      </>
    ) : null}
  </>
);

type BasicMarkdownSegment =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

const parseBasicMarkdown = (markdown: string): BasicMarkdownSegment[] => {
  const segments: BasicMarkdownSegment[] = [];
  const paragraphLines: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | undefined;

  const flushParagraph = () => {
    const text = paragraphLines.join(' ').trim();
    if (text) segments.push({ type: 'paragraph', text });
    paragraphLines.length = 0;
  };
  const flushList = () => {
    if (list?.items.length) segments.push(list);
    list = undefined;
  };

  for (const rawLine of stripStandaloneEvidenceCitations(markdown).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.+)$/u);
    if (heading) {
      flushParagraph();
      flushList();
      segments.push({ type: 'heading', text: heading[1].trim() });
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/u);
    if (unordered) {
      flushParagraph();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(unordered[1].trim());
      continue;
    }
    const ordered = line.match(/^\d+[.)]\s+(.+)$/u);
    if (ordered) {
      flushParagraph();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(ordered[1].trim());
      continue;
    }
    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return segments;
};

const MarkdownTextBlock: React.FC<{
  markdown: string;
  evidenceIds?: string[];
  evidenceById: Map<string, MedicalEvidenceItem>;
  variant?: InlineMarkdownVariant;
  className?: string;
}> = ({ markdown, evidenceIds, evidenceById, variant = 'body', className }) => {
  const segments = parseBasicMarkdown(markdown);
  if (!segments.length && !evidenceIds?.length) return null;
  return (
    <div className={classNames('medical-evidence-markdown', className)}>
      {segments.map((segment, index) => {
        if (segment.type === 'heading') {
          return <h6 key={`heading-${index}`}>{renderEvidenceInlineMarkdown(segment.text, variant)}</h6>;
        }
        if (segment.type === 'paragraph') {
          return <p key={`paragraph-${index}`}>{renderEvidenceInlineMarkdown(segment.text, variant)}</p>;
        }
        const ListTag = segment.type === 'ol' ? 'ol' : 'ul';
        return (
          <ListTag key={`list-${index}`}>
            {segment.items.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`}>{renderEvidenceInlineMarkdown(item, variant)}</li>
            ))}
          </ListTag>
        );
      })}
      {evidenceIds?.length ? (
        <div className='medical-evidence-markdown__refs'>
          <EvidenceCitationList ids={evidenceIds} evidenceById={evidenceById} />
        </div>
      ) : null}
    </div>
  );
};

const getFigurePreviewSrc = (figure: MedicalEvidenceFigure): string | undefined =>
  figure.previewSvgPath || figure.previewPngPath || figure.svgPath || figure.imagePath || figure.imageUrl;

const isRemoteOrDataImage = (src: string): boolean => /^(?:https?:|data:|file:)/iu.test(src);

const ReportImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) =>
  isRemoteOrDataImage(src) ? (
    <img src={src} alt={alt} className='medical-evidence-figure__image' loading='lazy' />
  ) : (
    <LocalImageView src={src} alt={alt} className='medical-evidence-figure__image' />
  );

const normalizeChartData = (figure: MedicalEvidenceFigure): Array<{ label: string; value: number; color?: string }> => {
  const spec = figure.chartSpec || {};
  const rawData = Array.isArray(spec.data) ? spec.data : Array.isArray(spec.values) ? spec.values : [];
  return rawData.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const label = stripStandaloneEvidenceCitations(String(record.label ?? record.name ?? record.category ?? '').trim());
    const value = Number(record.value ?? record.count ?? record.n);
    if (!label || !Number.isFinite(value)) return [];
    const color = typeof record.color === 'string' ? record.color : undefined;
    return [{ label, value, color }];
  });
};

const FigureChartFallback: React.FC<{ figure: MedicalEvidenceFigure }> = ({ figure }) => {
  const data = normalizeChartData(figure);
  if (!data.length) return null;
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div
      className='medical-evidence-chart'
      role='img'
      aria-label={stripStandaloneEvidenceCitations(figure.alt || figure.title || '循证图表')}
    >
      {data.map((item) => (
        <div key={item.label} className='medical-evidence-chart__row'>
          <span>{stripStandaloneEvidenceCitations(item.label)}</span>
          <i>
            <b
              style={{
                width: `${Math.max(3, (item.value / max) * 100)}%`,
                ...(item.color ? { background: item.color } : {}),
              }}
            />
          </i>
          <em>{item.value}</em>
        </div>
      ))}
    </div>
  );
};

const FigureCard: React.FC<{
  figure: MedicalEvidenceFigure;
  evidenceById: Map<string, MedicalEvidenceItem>;
}> = ({ figure, evidenceById }) => {
  const labels = useMedicalEvidenceLabels();
  const src = getFigurePreviewSrc(figure);
  return (
    <figure className='medical-evidence-figure' id={`medical-evidence-figure-${figure.id}`}>
      <div className='medical-evidence-figure__media'>
        {src ? (
          <ReportImage src={src} alt={stripStandaloneEvidenceCitations(figure.alt || figure.title || figure.id)} />
        ) : figure.kind === 'chart' ? (
          <FigureChartFallback figure={figure} />
        ) : (
          <div className='medical-evidence-figure__placeholder'>
            <MedicalEvidenceIcon name={figure.kind === 'drawio' ? 'pico' : 'scan'} size={18} visualScale={1.12} />
            <span>{figure.kind === 'drawio' ? labels.drawioSource : labels.figurePending}</span>
            {figure.drawioPath ? <em>{figure.drawioPath}</em> : null}
          </div>
        )}
      </div>
      {figure.title || figure.caption || figure.evidenceIds?.length ? (
        <figcaption>
          {figure.title ? <b>{renderEvidenceInlineMarkdown(figure.title)}</b> : null}
          {figure.caption ? <span>{renderEvidenceInlineMarkdown(figure.caption)}</span> : null}
          {figure.evidenceIds?.length ? (
            <EvidenceCitationList ids={figure.evidenceIds} evidenceById={evidenceById} />
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
};

const EvidenceTable: React.FC<{
  table: MedicalEvidenceTable;
  evidenceById: Map<string, MedicalEvidenceItem>;
}> = ({ table, evidenceById }) => (
  <figure className='medical-evidence-table' id={`medical-evidence-table-${table.id}`}>
    {table.title ? (
      <figcaption className='medical-evidence-table__title'>
        {renderEvidenceInlineMarkdown(table.title, 'table')}
      </figcaption>
    ) : null}
    <div className='medical-evidence-table__scroll'>
      <table>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column}>{renderEvidenceInlineMarkdown(column, 'table')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`${table.id}-${rowIndex}`}>
              {table.columns.map((column, columnIndex) => (
                <td key={`${column}-${columnIndex}`}>{renderInlineValue(row[columnIndex], 'table')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {table.caption || table.evidenceIds?.length ? (
      <figcaption className='medical-evidence-table__caption'>
        {table.caption ? <span>{renderEvidenceInlineMarkdown(table.caption, 'table')}</span> : null}
        {table.evidenceIds?.length ? (
          <EvidenceCitationList ids={table.evidenceIds} evidenceById={evidenceById} />
        ) : null}
      </figcaption>
    ) : null}
  </figure>
);

const CardMetricRow: React.FC<{ card: MedicalEvidenceReportCard }> = ({ card }) => {
  if (!card.metrics?.length) return null;
  return (
    <div className='medical-evidence-reportCard__metrics'>
      {card.metrics.slice(0, 4).map((metric) => (
        <span
          key={`${card.id}-${metric.label}`}
          className={`medical-evidence-reportCard__metric medical-evidence-reportCard__metric--${metric.tone || 'neutral'}`}
        >
          <b>{renderInlineValue(metric.value)}</b>
          <em>{stripStandaloneEvidenceCitations(metric.unit ? `${metric.label}${metric.unit}` : metric.label)}</em>
        </span>
      ))}
    </div>
  );
};

const StatusDot: React.FC<{ status?: MedicalEvidenceReportCardItem['status'] }> = ({ status }) => (
  <span
    className={`medical-evidence-reportCard__status medical-evidence-reportCard__status--${status || 'unknown'}`}
    aria-hidden='true'
  />
);

const CardItem: React.FC<{
  item: MedicalEvidenceReportCardItem;
  evidenceById: Map<string, MedicalEvidenceItem>;
  figuresById: Map<string, MedicalEvidenceFigure>;
}> = ({ item, evidenceById, figuresById }) => {
  const labels = useMedicalEvidenceLabels();
  const figure = item.figureId ? figuresById.get(item.figureId) : undefined;
  return (
    <div className='medical-evidence-reportCard__item'>
      <StatusDot status={item.status} />
      <div>
        <div className='medical-evidence-reportCard__itemHead'>
          <span>{renderEvidenceInlineMarkdown(item.label)}</span>
          {item.value !== undefined ? <b>{renderInlineValue(item.value)}</b> : null}
          {item.confidence ? (
            <em className={confidenceTone[item.confidence]}>{labels.confidence[item.confidence]}</em>
          ) : null}
          {item.sourceType && item.sourceType !== 'other' ? <small>{labels.source[item.sourceType]}</small> : null}
          {item.badge ? <QualityBadgeList badges={[item.badge]} compact /> : null}
        </div>
        {item.detail ? <p>{appendEvidenceCitations(item.detail, item.evidenceIds, evidenceById)}</p> : null}
        {item.markdown ? (
          <MarkdownTextBlock
            markdown={item.markdown}
            evidenceIds={item.detail ? undefined : item.evidenceIds}
            evidenceById={evidenceById}
            className='medical-evidence-reportCard__markdown'
          />
        ) : null}
        {item.path || item.command ? <code title={item.command || item.path}>{item.path || item.command}</code> : null}
        {figure ? (
          <a
            className='medical-evidence-reportCard__figureLink'
            href={`#medical-evidence-figure-${figure.id}`}
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById(`medical-evidence-figure-${figure.id}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            <MedicalEvidenceIcon name='scan' size={12} visualScale={1.12} />
            {stripStandaloneEvidenceCitations(figure.figureNumber || figure.title || figure.id)}
          </a>
        ) : null}
      </div>
    </div>
  );
};

const EvidenceMiniReference: React.FC<{
  evidence: MedicalEvidenceItem;
  evidenceById: Map<string, MedicalEvidenceItem>;
  rank: number;
}> = ({ evidence, evidenceById, rank }) => (
  <div className='medical-evidence-reportCard__reference'>
    <span>{rank}</span>
    <div>
      <strong>{evidence.title}</strong>
      <p>
        {[evidence.journal, evidence.year, evidence.doi ? `doi: ${evidence.doi}` : undefined]
          .filter(Boolean)
          .join(' · ')}
        {evidence.paperclip?.virtualPath ? ` · ${evidence.paperclip.virtualPath}` : ''}
      </p>
      <QualityBadgeList badges={getEvidenceQualityBadges(evidence)} compact />
      <EvidenceCitationList ids={[evidence.id]} evidenceById={evidenceById} />
    </div>
  </div>
);

const ArtifactRow: React.FC<{ artifact: MedicalEvidencePaperclipArtifact }> = ({ artifact }) => {
  const labels = useMedicalEvidenceLabels();
  return (
    <div className='medical-evidence-reportCard__artifact'>
      <span>{labels.artifact[artifact.kind]}</span>
      <div>
        {formatArtifactDetail(artifact) ? (
          <b>{stripStandaloneEvidenceCitations(formatArtifactDetail(artifact))}</b>
        ) : null}
        {artifact.command ? <code>{artifact.command}</code> : null}
        {artifact.description ? <em>{stripStandaloneEvidenceCitations(artifact.description)}</em> : null}
      </div>
    </div>
  );
};

const DerivedHierarchy: React.FC<{
  evidenceIds?: string[];
  evidenceById: Map<string, MedicalEvidenceItem>;
}> = ({ evidenceIds, evidenceById }) => {
  const labels = useMedicalEvidenceLabels();
  const evidence = (evidenceIds || [])
    .map((id) => evidenceById.get(id))
    .filter((item): item is MedicalEvidenceItem => Boolean(item));
  const rows = Object.entries(
    evidence.reduce<Record<string, number>>((accumulator, item) => {
      const label = labels.source[item.sourceType] || item.sourceType;
      accumulator[label] = (accumulator[label] || 0) + 1;
      return accumulator;
    }, {})
  );
  if (!rows.length) return null;
  const max = Math.max(...rows.map(([, value]) => value), 1);
  return (
    <div className='medical-evidence-reportCard__bars'>
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <i>
            <b style={{ width: `${Math.max(8, (value / max) * 100)}%` }} />
          </i>
          <em>{value}</em>
        </div>
      ))}
    </div>
  );
};

const ReportCard: React.FC<{
  card: MedicalEvidenceReportCard;
  evidenceById: Map<string, MedicalEvidenceItem>;
  figuresById: Map<string, MedicalEvidenceFigure>;
  tablesById?: Map<string, MedicalEvidenceTable>;
}> = ({ card, evidenceById, figuresById, tablesById }) => {
  const evidence = (card.evidenceIds || [])
    .map((id) => evidenceById.get(id))
    .filter((item): item is MedicalEvidenceItem => Boolean(item));
  const figures = (card.figureIds || [])
    .map((id) => figuresById.get(id))
    .filter((item): item is MedicalEvidenceFigure => Boolean(item));
  const tables = (card.tableIds || [])
    .map((id) => tablesById?.get(id))
    .filter((item): item is MedicalEvidenceTable => Boolean(item));
  const isReferenceCard = card.kind === 'quality_references';
  const isTraceCard = card.kind === 'paperclip_trace' || card.artifacts?.length;
  const showIcon = reportCardKindsWithIcon.has(card.kind);
  return (
    <article
      className={classNames('medical-evidence-reportCard', `medical-evidence-reportCard--${card.kind}`)}
      id={`medical-evidence-card-${card.id}`}
    >
      <div
        className={classNames(
          'medical-evidence-reportCard__head',
          !showIcon && 'medical-evidence-reportCard__head--plain'
        )}
      >
        {showIcon ? <MedicalEvidenceIcon name={reportCardIconName[card.kind]} size={16} visualScale={1.14} /> : null}
        <div>
          <h5>{renderEvidenceInlineMarkdown(card.title)}</h5>
          {card.subtitle ? <p>{renderEvidenceInlineMarkdown(card.subtitle)}</p> : null}
        </div>
      </div>
      {card.markdown ? (
        <MarkdownTextBlock
          markdown={card.markdown}
          evidenceIds={card.evidenceIds}
          evidenceById={evidenceById}
          className='medical-evidence-reportCard__markdown'
        />
      ) : null}
      <CardMetricRow card={card} />
      {isReferenceCard && evidence.length ? (
        <div className='medical-evidence-reportCard__references'>
          {evidence.slice(0, 5).map((item, index) => (
            <EvidenceMiniReference key={item.id} evidence={item} evidenceById={evidenceById} rank={index + 1} />
          ))}
        </div>
      ) : null}
      {card.kind === 'evidence_hierarchy' && !card.items?.length ? (
        <DerivedHierarchy evidenceIds={card.evidenceIds} evidenceById={evidenceById} />
      ) : null}
      {figures.length ? (
        <div className='medical-evidence-reportCard__figures'>
          {figures.map((figure) => (
            <a
              key={figure.id}
              href={`#medical-evidence-figure-${figure.id}`}
              onClick={(event) => {
                event.preventDefault();
                document
                  .getElementById(`medical-evidence-figure-${figure.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            >
              <MedicalEvidenceIcon name='scan' size={13} visualScale={1.12} />
              <span>{renderEvidenceInlineMarkdown(figure.figureNumber || figure.title || figure.id)}</span>
              {figure.sourceJournal || figure.sourcePath ? (
                <em>{renderEvidenceInlineMarkdown(figure.sourceJournal || figure.sourcePath || '')}</em>
              ) : null}
            </a>
          ))}
        </div>
      ) : null}
      {tables.length ? (
        <div className='medical-evidence-reportCard__figures'>
          {tables.map((table) => (
            <a
              key={table.id}
              href={`#medical-evidence-table-${table.id}`}
              onClick={(event) => {
                event.preventDefault();
                document
                  .getElementById(`medical-evidence-table-${table.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            >
              <MedicalEvidenceIcon name='citation' size={13} visualScale={1.12} />
              <span>{renderEvidenceInlineMarkdown(table.title || table.id)}</span>
              {table.caption ? <em>{renderEvidenceInlineMarkdown(table.caption)}</em> : null}
            </a>
          ))}
        </div>
      ) : null}
      {card.items?.length ? (
        <div className='medical-evidence-reportCard__items'>
          {card.items.map((item, index) => (
            <CardItem
              key={`${card.id}-${item.label}-${index}`}
              item={item}
              evidenceById={evidenceById}
              figuresById={figuresById}
            />
          ))}
        </div>
      ) : null}
      {isTraceCard && card.artifacts?.length ? (
        <div className='medical-evidence-reportCard__artifacts'>
          {card.artifacts.slice(0, 8).map((artifact, index) => (
            <ArtifactRow
              key={`${card.id}-${artifact.kind}-${artifact.path || artifact.command || index}`}
              artifact={artifact}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
};

const ReportCardGrid: React.FC<{
  cards: MedicalEvidenceReportCard[];
  evidenceById: Map<string, MedicalEvidenceItem>;
  figuresById: Map<string, MedicalEvidenceFigure>;
  tablesById?: Map<string, MedicalEvidenceTable>;
  index: number;
}> = ({ cards, evidenceById, figuresById, tablesById, index }) => {
  if (!cards.length) return null;
  return (
    <div className='medical-evidence-reportCardGrid' style={{ animationDelay: `${Math.min(index * 42, 220)}ms` }}>
      {cards.map((card, cardIndex) => (
        <div key={card.id} style={{ animationDelay: `${Math.min(cardIndex * 45, 180)}ms` }}>
          <ReportCard card={card} evidenceById={evidenceById} figuresById={figuresById} tablesById={tablesById} />
        </div>
      ))}
    </div>
  );
};

const ReportBlock: React.FC<{
  block: MedicalEvidenceReportBlock;
  evidenceById: Map<string, MedicalEvidenceItem>;
  figuresById: Map<string, MedicalEvidenceFigure>;
  tablesById: Map<string, MedicalEvidenceTable>;
  cardsById: Map<string, MedicalEvidenceReportCard>;
  index: number;
}> = ({ block, evidenceById, figuresById, tablesById, cardsById, index }) => {
  if (block.type === 'paragraph') {
    if (block.markdown) {
      return (
        <MarkdownTextBlock
          markdown={block.markdown}
          evidenceIds={block.evidenceIds}
          evidenceById={evidenceById}
          className='medical-evidence-report__markdown'
        />
      );
    }
    return (
      <p className='medical-evidence-report__paragraph' style={{ animationDelay: `${Math.min(index * 42, 220)}ms` }}>
        {appendEvidenceCitations(block.text, block.evidenceIds, evidenceById)}
      </p>
    );
  }
  if (block.type === 'bullet_list') {
    return (
      <ul className='medical-evidence-report__list' style={{ animationDelay: `${Math.min(index * 42, 220)}ms` }}>
        {block.items.map((item, itemIndex) => (
          <li key={`${item.text}-${itemIndex}`}>
            {appendEvidenceCitations(item.text, item.evidenceIds, evidenceById)}
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === 'checklist') {
    return (
      <div className='medical-evidence-report__checklist' style={{ animationDelay: `${Math.min(index * 42, 220)}ms` }}>
        {block.items.map((item, itemIndex) => (
          <div
            key={`${item.label}-${itemIndex}`}
            className={`medical-evidence-report__check medical-evidence-report__check--${item.status || 'unknown'}`}
          >
            <span aria-hidden='true' />
            <div>
              <b>{renderEvidenceInlineMarkdown(item.label)}</b>
              {item.detail ? <p>{appendEvidenceCitations(item.detail, item.evidenceIds, evidenceById)}</p> : null}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === 'figure_ref') {
    const figure = figuresById.get(block.figureId);
    return figure ? <FigureCard figure={figure} evidenceById={evidenceById} /> : null;
  }
  if (block.type === 'card_ref') {
    const card = cardsById.get(block.cardId);
    return card ? (
      <ReportCard card={card} evidenceById={evidenceById} figuresById={figuresById} tablesById={tablesById} />
    ) : null;
  }
  if (block.type === 'card_grid') {
    return (
      <ReportCardGrid
        cards={block.cardIds
          .map((id) => cardsById.get(id))
          .filter((item): item is MedicalEvidenceReportCard => Boolean(item))}
        evidenceById={evidenceById}
        figuresById={figuresById}
        tablesById={tablesById}
        index={index}
      />
    );
  }
  const table = tablesById.get(block.tableId);
  return table ? <EvidenceTable table={table} evidenceById={evidenceById} /> : null;
};

const ReportSections: React.FC<{
  panel: MedicalEvidencePanelData;
  evidenceById: Map<string, MedicalEvidenceItem>;
}> = ({ panel, evidenceById }) => {
  const language = React.useContext(MedicalEvidenceLanguageContext);
  const labels = useMedicalEvidenceLabels();
  const figuresById = useMemo(
    () => new Map((panel.figures || []).map((figure) => [figure.id, figure])),
    [panel.figures]
  );
  const tablesById = useMemo(() => new Map((panel.tables || []).map((table) => [table.id, table])), [panel.tables]);
  const cardsById = useMemo(() => new Map((panel.cards || []).map((card) => [card.id, card])), [panel.cards]);
  const reportTitle = normalizeReportTitle(stripStandaloneEvidenceCitations(panel.report?.title || ''), labels);
  if (!panel.report?.sections?.length) return null;
  return (
    <div className='medical-evidence-report'>
      {reportTitle ? <h3>{reportTitle}</h3> : null}
      {panel.report.sections.map((section, sectionIndex) => (
        <section
          key={section.id}
          className={classNames(
            'medical-evidence-report__section',
            sectionIndex === 0 && 'medical-evidence-report__section--lead'
          )}
          style={{ animationDelay: `${Math.min(sectionIndex * 70, 320)}ms` }}
        >
          {inferReportSectionHeading(section, labels, sectionIndex) ? (
            <h4>
              {normalizeReportHeading(
                stripStandaloneEvidenceCitations(inferReportSectionHeading(section, labels, sectionIndex)!),
                language
              )}
            </h4>
          ) : null}
          {section.blocks.map((block, blockIndex) => (
            <ReportBlock
              key={`${section.id}-${blockIndex}`}
              block={block}
              evidenceById={evidenceById}
              figuresById={figuresById}
              tablesById={tablesById}
              cardsById={cardsById}
              index={blockIndex}
            />
          ))}
          {section.evidenceIds?.length ? (
            <div className='medical-evidence-report__sectionRefs'>
              <EvidenceCitationList ids={section.evidenceIds} evidenceById={evidenceById} />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
};

const EvidenceReference: React.FC<{ evidence: MedicalEvidenceItem; index: number }> = ({ evidence, index }) => {
  const labels = useMedicalEvidenceLabels();
  return (
    <article
      id={`medical-evidence-${evidence.id}`}
      className='medical-evidence-reference'
      style={{ animationDelay: `${Math.min(index * 30, 150)}ms` }}
    >
      <div className='medical-evidence-reference__index'>{evidence.id}</div>
      <div className='medical-evidence-reference__body'>
        <div className='medical-evidence-reference__heading'>
          <h4>{evidence.title}</h4>
        </div>
        <QualityBadgeList badges={getEvidenceQualityBadges(evidence)} />
        <div className='medical-evidence-reference__meta'>
          {[evidence.authors, evidence.journal, evidence.year, evidence.doi ? `doi: ${evidence.doi}` : undefined]
            .filter(Boolean)
            .map((item) => (
              <span key={item}>{item}</span>
            ))}
        </div>
        <div className='medical-evidence-reference__strength'>
          <span className={confidenceTone[evidence.confidence]}>
            <MedicalEvidenceIcon name={confidenceIconName[evidence.confidence]} size={13} visualScale={1.12} />
            {labels.evidenceStrength}
            {labels.confidence[evidence.confidence]}
          </span>
          {evidence.grade ? <span>{evidence.grade}</span> : null}
        </div>
        {evidence.summary ? <p>{evidence.summary}</p> : null}
        {evidence.anchor?.quote ? <blockquote>{evidence.anchor.quote}</blockquote> : null}
        {evidence.paperclip?.contentPath || evidence.paperclip?.metaPath ? (
          <div className='medical-evidence-reference__paperclip'>
            <MedicalEvidenceIcon name='paper' size={12} visualScale={1.12} />
            <span>{evidence.paperclip.contentPath || evidence.paperclip.metaPath}</span>
          </div>
        ) : null}
        <div className='medical-evidence-reference__footer'>
          {evidence.applicability ? <span>{evidence.applicability}</span> : <span />}
          <AnchorLabel evidence={evidence} />
        </div>
      </div>
    </article>
  );
};

const FindingRow: React.FC<{
  finding: MedicalEvidenceFinding;
  evidenceById: Map<string, MedicalEvidenceItem>;
}> = ({ finding, evidenceById }) => {
  const labels = useMedicalEvidenceLabels();
  return (
    <div className='medical-evidence-finding'>
      <MedicalEvidenceIcon name='complete' size={16} visualScale={1.12} className='medical-evidence-finding__icon' />
      <div>
        <div className='medical-evidence-finding__title'>
          <span>{renderEvidenceInlineMarkdown(finding.title)}</span>
          <em className={confidenceTone[finding.confidence]}>{labels.confidence[finding.confidence]}</em>
        </div>
        <p>{renderEvidenceInlineMarkdown(finding.conclusion)}</p>
        <div className='medical-evidence-finding__refs'>
          <EvidenceCitationList ids={finding.evidenceIds} evidenceById={evidenceById} />
        </div>
      </div>
    </div>
  );
};

const toLegacyAppraisal = (conflict: MedicalEvidenceConflict): MedicalEvidenceAppraisal => ({
  id: conflict.id,
  claim: conflict.claim,
  conclusion: conflict.resolution || conflict.explanation,
  confidence: 'moderate',
  selectedEvidenceIds: conflict.primaryEvidenceIds,
  alternativeEvidenceIds: conflict.conflictingEvidenceIds,
  rationale: conflict.explanation,
  candidates: [
    ...conflict.primaryEvidenceIds.map((evidenceId, index) => ({
      evidenceId,
      label: index === 0 ? '采纳' : undefined,
      hierarchyRank: 1,
    })),
    ...conflict.conflictingEvidenceIds.map((evidenceId, index) => ({
      evidenceId,
      label: index === 0 ? '较低权重' : undefined,
      hierarchyRank: 2,
    })),
  ],
});

const AppraisalCard: React.FC<{
  appraisal: MedicalEvidenceAppraisal;
  evidenceById: Map<string, MedicalEvidenceItem>;
}> = ({ appraisal, evidenceById }) => {
  const labels = useMedicalEvidenceLabels();
  const alternativeEvidence = (appraisal.alternativeEvidenceIds || [])
    .map((id) => evidenceById.get(id))
    .filter((item): item is MedicalEvidenceItem => Boolean(item));
  const hasWeighing = alternativeEvidence.length > 0;
  const primary = appraisal.selectedEvidenceIds.map((id) => evidenceById.get(id)).find(Boolean);
  const alternative = (appraisal.alternativeEvidenceIds || []).map((id) => evidenceById.get(id)).find(Boolean);

  return (
    <article
      className={classNames('medical-evidence-appraisal', hasWeighing && 'medical-evidence-appraisal--weighing')}
    >
      <div className='medical-evidence-appraisal__head'>
        <MedicalEvidenceIcon
          name={hasWeighing ? 'weigh' : confidenceIconName[appraisal.confidence]}
          size={15}
          visualScale={1.12}
        />
        <span>{hasWeighing ? labels.evidenceWeighing : labels.evidenceDecision}</span>
        <em className={confidenceTone[appraisal.confidence]}>{labels.confidence[appraisal.confidence]}</em>
      </div>
      <b>{renderEvidenceInlineMarkdown(appraisal.claim)}</b>
      <p>{renderEvidenceInlineMarkdown(appraisal.conclusion)}</p>
      {hasWeighing ? (
        <div className='medical-evidence-appraisal__duel' aria-label={labels.evidenceWeighing}>
          <div className='medical-evidence-appraisal__candidate medical-evidence-appraisal__candidate--selected'>
            <span>
              <MedicalEvidenceIcon name='adopt' size={13} visualScale={1.12} />
              {labels.adopted}
            </span>
            <strong>
              {primary
                ? `${primary.id} · ${labels.source[primary.sourceType]}`
                : appraisal.selectedEvidenceIds.join(' ')}
            </strong>
            {primary?.grade ? <small>{primary.grade}</small> : null}
          </div>
          <div className='medical-evidence-appraisal__versus'>
            <MedicalEvidenceIcon name='weigh' size={17} visualScale={1.12} />
            <span>{labels.weighed}</span>
          </div>
          <div className='medical-evidence-appraisal__candidate'>
            <span>
              <MedicalEvidenceIcon name='downgrade' size={13} visualScale={1.12} />
              {labels.downgraded}
            </span>
            <strong>
              {alternative
                ? `${alternative.id} · ${labels.source[alternative.sourceType]}`
                : appraisal.alternativeEvidenceIds?.join(' ')}
            </strong>
            {alternative?.grade ? <small>{alternative.grade}</small> : null}
          </div>
        </div>
      ) : null}
      <div className='medical-evidence-appraisal__rationale'>{renderEvidenceInlineMarkdown(appraisal.rationale)}</div>
      {appraisal.basis?.length ? (
        <div className='medical-evidence-appraisal__basis'>
          {renderEvidenceInlineMarkdown(appraisal.basis.map((basis) => basis).join(' · '))}
        </div>
      ) : null}
      <div className='medical-evidence-appraisal__refs'>
        <EvidenceCitationList
          ids={[...appraisal.selectedEvidenceIds, ...(appraisal.alternativeEvidenceIds || [])]}
          evidenceById={evidenceById}
        />
      </div>
    </article>
  );
};

const markdownClean = (value: string | number | undefined): string =>
  stripStandaloneEvidenceCitations(String(value ?? '').trim());

const markdownCleanBlock = (value: string | undefined): string =>
  (value || '')
    .split(/\r?\n/u)
    .map((line) => stripStandaloneEvidenceCitations(line))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

const markdownJoin = (parts: Array<string | undefined | false | null>): string =>
  parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join('\n\n');

const markdownCitations = (ids?: string[]): string => {
  const resolved = unique((ids || []).filter(Boolean));
  return resolved.length ? resolved.map((id) => `[${id}]`).join(' ') : '';
};

const markdownWithCitations = (text: string | undefined, ids?: string[]): string => {
  const body = markdownClean(text);
  const citations = markdownCitations(ids);
  return [body, citations].filter(Boolean).join(' ');
};

const markdownTableCell = (value: string | number | undefined): string =>
  markdownClean(value)
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, '<br />');

const markdownList = (items: string[], ordered = false): string =>
  items
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : '-';
      const lines = item.trim().split(/\r?\n/u);
      return lines
        .map((line, lineIndex) => (lineIndex === 0 ? `${marker} ${line}` : `  ${line}`))
        .join('\n');
    })
    .join('\n');

const markdownStatus = (
  status: MedicalEvidenceReportCardItem['status'] | undefined,
  language: MedicalEvidenceUiLanguage
): string => {
  if (!status || status === 'unknown') return '';
  const labels =
    language === 'zh'
      ? { met: '满足', caution: '需谨慎', not_met: '不满足' }
      : { met: 'met', caution: 'caution', not_met: 'not met' };
  return labels[status] || '';
};

const markdownFigureImage = (figure: MedicalEvidenceFigure): string | undefined => {
  const src = getFigurePreviewSrc(figure);
  if (!src) return undefined;
  const alt = markdownClean(figure.alt || figure.title || figure.figureNumber || figure.id).replace(/\]/gu, '\\]');
  return `![${alt}](${src})`;
};

const serializeFigureMarkdown = (
  figure: MedicalEvidenceFigure,
  evidenceById: Map<string, MedicalEvidenceItem>,
  labels: MedicalEvidenceLabels
): string => {
  const title = markdownClean(figure.figureNumber || figure.title || figure.id);
  const chartData = figure.kind === 'chart' && !getFigurePreviewSrc(figure) ? normalizeChartData(figure) : [];
  const visual =
    markdownFigureImage(figure) ||
    (chartData.length
      ? markdownJoin([
          `| ${labels.inferredFigure} | value |`,
          '| --- | ---: |',
          chartData.map((item) => `| ${markdownTableCell(item.label)} | ${item.value} |`).join('\n'),
        ])
      : figure.drawioPath
        ? `draw.io: \`${figure.drawioPath}\``
        : undefined);
  return markdownJoin([
    title ? `#### ${title}` : undefined,
    visual,
    figure.caption ? markdownWithCitations(figure.caption, figure.evidenceIds) : markdownCitations(figure.evidenceIds),
    figure.sourceTitle || figure.sourceJournal || figure.sourcePath
      ? `_${[figure.sourceTitle, figure.sourceJournal, figure.sourcePath].filter(Boolean).map(markdownClean).join(' · ')}_`
      : undefined,
    figure.licenseNote ? `_${markdownClean(figure.licenseNote)}_` : undefined,
    figure.paperclip?.figurePath || figure.paperclip?.command
      ? `PaperClip: ${[figure.paperclip.figurePath, figure.paperclip.command].filter(Boolean).join(' · ')}`
      : undefined,
    figure.evidenceIds?.length
      ? figure.evidenceIds
          .map((id) => evidenceById.get(id))
          .filter((item): item is MedicalEvidenceItem => Boolean(item))
          .map((item) => `- ${markdownWithCitations(item.title, [item.id])}`)
          .join('\n')
      : undefined,
  ]);
};

const serializeTableMarkdown = (table: MedicalEvidenceTable): string => {
  const header = `| ${table.columns.map(markdownTableCell).join(' | ')} |`;
  const rule = `| ${table.columns.map(() => '---').join(' | ')} |`;
  const rows = table.rows.map((row) => `| ${table.columns.map((_, index) => markdownTableCell(row[index])).join(' | ')} |`);
  return markdownJoin([
    table.title ? `#### ${markdownClean(table.title)}` : undefined,
    [header, rule, ...rows].join('\n'),
    table.caption ? markdownWithCitations(table.caption, table.evidenceIds) : markdownCitations(table.evidenceIds),
  ]);
};

const serializeEvidenceReferenceMarkdown = (
  evidence: MedicalEvidenceItem,
  index: number,
  labels: MedicalEvidenceLabels
): string => {
  const badges = getEvidenceQualityBadges(evidence).map((badge) => labels.qualityBadge[badge]);
  const lineLabel =
    evidence.anchor?.lineStart && evidence.anchor?.lineEnd
      ? evidence.anchor.lineStart === evidence.anchor.lineEnd
        ? `L${evidence.anchor.lineStart}`
        : `L${evidence.anchor.lineStart}-L${evidence.anchor.lineEnd}`
      : undefined;
  const meta = [
    evidence.authors,
    evidence.journal,
    evidence.publishedAt || evidence.year,
    evidence.doi ? `doi: ${evidence.doi}` : undefined,
    evidence.url,
  ]
    .filter(Boolean)
    .map((item) => markdownClean(item as string | number))
    .join(' · ');
  const source = [
    labels.source[evidence.sourceType],
    `${labels.evidenceStrength}${labels.confidence[evidence.confidence]}`,
    evidence.grade,
    badges.length ? badges.join(' / ') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  return markdownJoin([
    `${index + 1}. **[${evidence.id}] ${markdownClean(evidence.title)}**${meta ? `  \n   ${meta}` : ''}`,
    source ? `   - ${source}` : undefined,
    evidence.summary ? `   - ${markdownClean(evidence.summary)}` : undefined,
    evidence.applicability ? `   - ${markdownClean(evidence.applicability)}` : undefined,
    evidence.anchor?.quote ? `   > ${markdownClean(evidence.anchor.quote)}` : undefined,
    evidence.anchor?.path || lineLabel || evidence.paperclip?.contentPath || evidence.paperclip?.metaPath
      ? `   - Anchor: ${[evidence.anchor?.path, lineLabel, evidence.paperclip?.contentPath || evidence.paperclip?.metaPath]
          .filter(Boolean)
          .join(' · ')}`
      : undefined,
  ]);
};

const serializeArtifactMarkdown = (
  artifact: MedicalEvidencePaperclipArtifact,
  labels: MedicalEvidenceLabels
): string => {
  const detail = markdownClean(formatArtifactDetail(artifact));
  const tail = [detail, artifact.description ? markdownClean(artifact.description) : undefined, artifact.command ? `\`${artifact.command}\`` : undefined]
    .filter(Boolean)
    .join(' · ');
  return `- **${labels.artifact[artifact.kind]}**${tail ? `: ${tail}` : ''}`;
};

const serializeCardItemMarkdown = (
  item: MedicalEvidenceReportCardItem,
  language: MedicalEvidenceUiLanguage,
  labels: MedicalEvidenceLabels
): string => {
  const status = markdownStatus(item.status, language);
  const meta = [
    item.value !== undefined ? markdownClean(item.value) : undefined,
    item.confidence ? labels.confidence[item.confidence] : undefined,
    item.sourceType && item.sourceType !== 'other' ? labels.source[item.sourceType] : undefined,
    item.badge ? labels.qualityBadge[item.badge] : undefined,
    status,
  ].filter(Boolean);
  const head = `**${markdownClean(item.label)}**${meta.length ? ` (${meta.join(' · ')})` : ''}`;
  return markdownJoin([
    `- ${markdownWithCitations(head, item.detail || item.markdown ? undefined : item.evidenceIds)}`,
    item.detail ? `  ${markdownWithCitations(item.detail, item.evidenceIds)}` : undefined,
    item.markdown ? markdownCleanBlock(item.markdown).replace(/^/gmu, '  ') : undefined,
    item.figureId ? `  Figure: ${item.figureId}` : undefined,
    item.path ? `  Path: \`${item.path}\`` : undefined,
    item.command ? `  Command: \`${item.command}\`` : undefined,
  ]);
};

const serializeCardMarkdown = (
  card: MedicalEvidenceReportCard,
  language: MedicalEvidenceUiLanguage,
  labels: MedicalEvidenceLabels,
  evidenceById: Map<string, MedicalEvidenceItem>,
  figuresById: Map<string, MedicalEvidenceFigure>,
  tablesById: Map<string, MedicalEvidenceTable>
): string => {
  const evidence = (card.evidenceIds || [])
    .map((id) => evidenceById.get(id))
    .filter((item): item is MedicalEvidenceItem => Boolean(item));
  const figures = (card.figureIds || [])
    .map((id) => figuresById.get(id))
    .filter((item): item is MedicalEvidenceFigure => Boolean(item));
  const tables = (card.tableIds || [])
    .map((id) => tablesById.get(id))
    .filter((item): item is MedicalEvidenceTable => Boolean(item));
  const derivedHierarchy =
    card.kind === 'evidence_hierarchy' && !card.items?.length && evidence.length
      ? Object.entries(
          evidence.reduce<Record<string, number>>((accumulator, item) => {
            const label = labels.source[item.sourceType] || item.sourceType;
            accumulator[label] = (accumulator[label] || 0) + 1;
            return accumulator;
          }, {})
        ).map(([label, value]) => `- ${label}: ${value}`)
      : [];

  return markdownJoin([
    `### ${markdownClean(card.title)}`,
    card.subtitle ? `_${markdownClean(card.subtitle)}_` : undefined,
    card.markdown ? markdownWithCitations(markdownCleanBlock(card.markdown), card.evidenceIds) : undefined,
    card.metrics?.length
      ? markdownList(
          card.metrics.map((metric) =>
            [
              `**${markdownClean(metric.label)}**: ${markdownClean(metric.value)}${metric.unit ? markdownClean(metric.unit) : ''}`,
              metric.tone && metric.tone !== 'neutral' ? `(${metric.tone})` : undefined,
            ]
              .filter(Boolean)
              .join(' ')
          )
        )
      : undefined,
    card.items?.length ? card.items.map((item) => serializeCardItemMarkdown(item, language, labels)).join('\n') : undefined,
    card.kind === 'quality_references' && evidence.length
      ? evidence
          .slice(0, 5)
          .map((item, index) => `${index + 1}. ${markdownWithCitations(item.title, [item.id])}`)
          .join('\n')
      : undefined,
    derivedHierarchy.length ? derivedHierarchy.join('\n') : undefined,
    figures.length ? figures.map((figure) => `- Figure: ${markdownWithCitations(figure.figureNumber || figure.title || figure.id, figure.evidenceIds)}`).join('\n') : undefined,
    tables.length ? tables.map((table) => `- Table: ${markdownWithCitations(table.title || table.id, table.evidenceIds)}`).join('\n') : undefined,
    card.artifacts?.length ? card.artifacts.slice(0, 8).map((artifact) => serializeArtifactMarkdown(artifact, labels)).join('\n') : undefined,
    !card.markdown && card.evidenceIds?.length ? markdownCitations(card.evidenceIds) : undefined,
  ]);
};

const serializeReportBlockMarkdown = (
  block: MedicalEvidenceReportBlock,
  language: MedicalEvidenceUiLanguage,
  labels: MedicalEvidenceLabels,
  evidenceById: Map<string, MedicalEvidenceItem>,
  figuresById: Map<string, MedicalEvidenceFigure>,
  tablesById: Map<string, MedicalEvidenceTable>,
  cardsById: Map<string, MedicalEvidenceReportCard>
): string | undefined => {
  if (block.type === 'paragraph') {
    return block.markdown
      ? markdownWithCitations(markdownCleanBlock(block.markdown), block.evidenceIds)
      : markdownWithCitations(block.text, block.evidenceIds);
  }
  if (block.type === 'bullet_list') {
    return markdownList(block.items.map((item) => markdownWithCitations(item.text, item.evidenceIds)));
  }
  if (block.type === 'checklist') {
    return markdownList(
      block.items.map((item) => {
        const marker = item.status === 'met' ? '[x]' : '[ ]';
        const status = markdownStatus(item.status, language);
        const label = `**${markdownClean(item.label)}**${status ? ` (${status})` : ''}`;
        return markdownJoin([
          `${marker} ${label}`,
          item.detail ? markdownWithCitations(item.detail, item.evidenceIds) : markdownCitations(item.evidenceIds),
        ]);
      })
    );
  }
  if (block.type === 'figure_ref') {
    const figure = figuresById.get(block.figureId);
    return figure ? serializeFigureMarkdown(figure, evidenceById, labels) : undefined;
  }
  if (block.type === 'table_ref') {
    const table = tablesById.get(block.tableId);
    return table ? serializeTableMarkdown(table) : undefined;
  }
  if (block.type === 'card_ref') {
    const card = cardsById.get(block.cardId);
    return card ? serializeCardMarkdown(card, language, labels, evidenceById, figuresById, tablesById) : undefined;
  }
  return block.cardIds
    .map((id) => cardsById.get(id))
    .filter((item): item is MedicalEvidenceReportCard => Boolean(item))
    .map((card) => serializeCardMarkdown(card, language, labels, evidenceById, figuresById, tablesById))
    .filter(Boolean)
    .join('\n\n');
};

const serializeFindingsMarkdown = (
  findings: MedicalEvidenceFinding[],
  labels: MedicalEvidenceLabels
): string | undefined => {
  if (!findings.length) return undefined;
  return markdownJoin([
    `## ${labels.findingSection}`,
    markdownList(
      findings.map((finding) =>
        [
          `**${markdownClean(finding.title)}** (${labels.confidence[finding.confidence]}): ${markdownWithCitations(
            finding.conclusion,
            finding.evidenceIds
          )}`,
          finding.caveats?.length ? `\n  ${finding.caveats.map((caveat) => `- ${markdownClean(caveat)}`).join('\n  ')}` : undefined,
        ]
          .filter(Boolean)
          .join('')
      )
    ),
  ]);
};

const serializeAppraisalsMarkdown = (
  appraisals: MedicalEvidenceAppraisal[],
  labels: MedicalEvidenceLabels,
  evidenceById: Map<string, MedicalEvidenceItem>
): string | undefined => {
  if (!appraisals.length) return undefined;
  return markdownJoin([
    `## ${labels.appraisalSection}`,
    ...appraisals.map((appraisal) => {
      const selected = appraisal.selectedEvidenceIds
        .map((id) => evidenceById.get(id))
        .filter((item): item is MedicalEvidenceItem => Boolean(item));
      const alternative = (appraisal.alternativeEvidenceIds || [])
        .map((id) => evidenceById.get(id))
        .filter((item): item is MedicalEvidenceItem => Boolean(item));
      return markdownJoin([
        `### ${markdownClean(appraisal.claim)}`,
        `${labels.evidenceDecision}: ${markdownWithCitations(appraisal.conclusion, appraisal.selectedEvidenceIds)}`,
        `${labels.evidenceStrength}${labels.confidence[appraisal.confidence]}`,
        appraisal.rationale ? markdownClean(appraisal.rationale) : undefined,
        appraisal.basis?.length ? markdownList(appraisal.basis.map(markdownClean)) : undefined,
        selected.length
          ? `${labels.adopted}: ${selected.map((item) => `[${item.id}] ${markdownClean(item.title)}`).join('; ')}`
          : undefined,
        alternative.length
          ? `${labels.downgraded}: ${alternative.map((item) => `[${item.id}] ${markdownClean(item.title)}`).join('; ')}`
          : undefined,
      ]);
    }),
  ]);
};

const buildMedicalEvidenceMarkdown = (
  panel: MedicalEvidencePanelData,
  language: MedicalEvidenceUiLanguage,
  labels: MedicalEvidenceLabels
): string => {
  const evidenceById = new Map(panel.evidence.map((item) => [item.id, item]));
  const figuresById = new Map((panel.figures || []).map((figure) => [figure.id, figure]));
  const tablesById = new Map((panel.tables || []).map((table) => [table.id, table]));
  const cardsById = new Map((panel.cards || []).map((card) => [card.id, card]));
  const appraisals = panel.appraisals?.length ? panel.appraisals : (panel.conflicts || []).map(toLegacyAppraisal);
  const hasReport = Boolean(panel.report?.sections?.length);
  const visibleAppraisals = hasReport
    ? appraisals.filter(
        (appraisal) => appraisal.alternativeEvidenceIds?.length || appraisal.candidates?.some((candidate) => candidate.label)
      )
    : appraisals;
  const reportTitle =
    normalizeReportTitle(stripStandaloneEvidenceCitations(panel.report?.title || ''), labels) || labels.fallbackTitle;
  const reportBody = panel.report?.sections?.length
    ? panel.report.sections
        .map((section, sectionIndex) => {
          const heading = inferReportSectionHeading(section, labels, sectionIndex);
          const normalizedHeading = heading
            ? normalizeReportHeading(stripStandaloneEvidenceCitations(heading), language)
            : undefined;
          return markdownJoin([
            normalizedHeading ? `## ${normalizedHeading}` : undefined,
            ...section.blocks.map((block) =>
              serializeReportBlockMarkdown(block, language, labels, evidenceById, figuresById, tablesById, cardsById)
            ),
            section.evidenceIds?.length ? markdownCitations(section.evidenceIds) : undefined,
          ]);
        })
        .filter(Boolean)
        .join('\n\n')
    : undefined;
  const allFiguresOutsideReport = (panel.figures || []).filter((figure) => {
    const referenced = panel.report?.sections?.some((section) =>
      section.blocks.some((block) => block.type === 'figure_ref' && block.figureId === figure.id)
    );
    return !referenced;
  });
  const allTablesOutsideReport = (panel.tables || []).filter((table) => {
    const referenced = panel.report?.sections?.some((section) =>
      section.blocks.some((block) => block.type === 'table_ref' && block.tableId === table.id)
    );
    return !referenced;
  });

  return markdownJoin([
    `# ${reportTitle}`,
    panel.summary && !hasReport ? markdownClean(panel.summary) : undefined,
    reportBody,
    !hasReport ? serializeFindingsMarkdown(panel.findings, labels) : undefined,
    allFiguresOutsideReport.length
      ? markdownJoin([
          `## ${labels.inferredFigure}`,
          ...allFiguresOutsideReport.map((figure) => serializeFigureMarkdown(figure, evidenceById, labels)),
        ])
      : undefined,
    allTablesOutsideReport.length
      ? markdownJoin([`## ${labels.inferredTable}`, ...allTablesOutsideReport.map(serializeTableMarkdown)])
      : undefined,
    serializeAppraisalsMarkdown(visibleAppraisals, labels, evidenceById),
    panel.evidence.length
      ? markdownJoin([
          `## ${labels.referenceSection}`,
          panel.evidence.map((evidence, index) => serializeEvidenceReferenceMarkdown(evidence, index, labels)).join('\n\n'),
        ])
      : undefined,
    panel.methods
      ? markdownJoin([
          `## ${labels.methods}`,
          panel.methods.queryPlan?.length
            ? markdownJoin([`### ${labels.queryPlan}`, markdownList(panel.methods.queryPlan.map(markdownClean))])
            : undefined,
          panel.methods.gradingFramework
            ? markdownJoin([`### ${labels.gradingFramework}`, markdownClean(panel.methods.gradingFramework)])
            : undefined,
          panel.methods.limitations?.length
            ? markdownJoin([`### ${labels.limitations}`, markdownList(panel.methods.limitations.map(markdownClean))])
            : undefined,
        ])
      : undefined,
  ]).trim();
};

const copyMarkdownToClipboard = async (markdown: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(markdown);
    return;
  }
  const textArea = document.createElement('textarea');
  textArea.value = markdown;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!copied) throw new Error('copy failed');
};

export const MedicalEvidencePanel: React.FC<{ panel: MedicalEvidencePanelData }> = ({ panel }) => {
  const { i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const uiLanguage = useMemo(() => resolveMedicalEvidenceUiLanguage(i18n.language, panel), [i18n.language, panel]);
  const labels = MEDICAL_EVIDENCE_LABELS[uiLanguage];
  const evidenceById = useMemo(() => new Map(panel.evidence.map((item) => [item.id, item])), [panel.evidence]);
  const markdownReport = useMemo(() => buildMedicalEvidenceMarkdown(panel, uiLanguage, labels), [panel, uiLanguage, labels]);
  const references = useMemo(
    () => panel.evidence.slice(0, expanded ? panel.evidence.length : 6),
    [expanded, panel.evidence]
  );
  const appraisals = useMemo(
    () => (panel.appraisals?.length ? panel.appraisals : (panel.conflicts || []).map(toLegacyAppraisal)),
    [panel.appraisals, panel.conflicts]
  );
  const hasReport = Boolean(panel.report?.sections?.length);
  const visibleAppraisals = useMemo(
    () =>
      hasReport
        ? appraisals.filter(
            (appraisal) =>
              appraisal.alternativeEvidenceIds?.length || appraisal.candidates?.some((candidate) => candidate.label)
          )
        : appraisals,
    [appraisals, hasReport]
  );
  const copyLabel =
    copyState === 'copied'
      ? uiLanguage === 'zh'
        ? '已复制'
        : 'Copied'
      : copyState === 'error'
        ? uiLanguage === 'zh'
          ? '复制失败'
          : 'Copy failed'
        : uiLanguage === 'zh'
          ? '复制 Markdown'
          : 'Copy Markdown';
  const handleCopyMarkdown = useCallback(async () => {
    try {
      await copyMarkdownToClipboard(markdownReport);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    window.setTimeout(() => setCopyState('idle'), 1600);
  }, [markdownReport]);

  return (
    <MedicalEvidenceLanguageContext.Provider value={uiLanguage}>
      <section className='medical-evidence-panel' data-testid='medical-evidence-panel'>
        {!hasReport ? (
          <header className='medical-evidence-panel__header'>
            <div className='medical-evidence-panel__title'>
              <span>{labels.fallbackTitle}</span>
              <small>{labels.fallbackSubtitle}</small>
            </div>
          </header>
        ) : null}

        {hasReport ? <ReportSections panel={panel} evidenceById={evidenceById} /> : null}

        {!hasReport && panel.findings.length > 0 ? (
          <section className='medical-evidence-section'>
            <div className='medical-evidence-section__title'>
              <MedicalEvidenceIcon name='scan' size={15} visualScale={1.12} />
              {labels.findingSection}
            </div>
            <div className='medical-evidence-findings'>
              {panel.findings.map((finding) => (
                <FindingRow key={finding.id} finding={finding} evidenceById={evidenceById} />
              ))}
            </div>
          </section>
        ) : null}

        {visibleAppraisals.length > 0 ? (
          <section className='medical-evidence-section'>
            <div className='medical-evidence-section__title'>
              <MedicalEvidenceIcon name='weigh' size={15} visualScale={1.12} />
              {labels.appraisalSection}
            </div>
            <div className='medical-evidence-appraisals'>
              {visibleAppraisals.map((appraisal) => (
                <AppraisalCard key={appraisal.id} appraisal={appraisal} evidenceById={evidenceById} />
              ))}
            </div>
          </section>
        ) : null}

        <section className='medical-evidence-section'>
          <div className='medical-evidence-section__title'>
            <MedicalEvidenceIcon name='citation' size={15} visualScale={1.12} />
            {labels.referenceSection}
          </div>
          <div className='medical-evidence-references'>
            {references.map((evidence, index) => (
              <EvidenceReference key={evidence.id} evidence={evidence} index={index} />
            ))}
          </div>
          {panel.evidence.length > 6 ? (
            <button type='button' className='medical-evidence-expand' onClick={() => setExpanded((value) => !value)}>
              {expanded ? (
                <>
                  <Down theme='outline' size='13' />
                  {labels.collapseReferences}
                </>
              ) : (
                <>
                  <Right theme='outline' size='13' />
                  {labels.expandReferences} {panel.evidence.length} {labels.referencesUnit}
                </>
              )}
            </button>
          ) : null}
        </section>

        {panel.methods ? (
          <details className='medical-evidence-methods'>
            <summary>{labels.methods}</summary>
            <div className='medical-evidence-methods__body'>
              {panel.methods.queryPlan?.length ? (
                <div className='medical-evidence-methodBlock'>
                  <b>{labels.queryPlan}</b>
                  <ul>
                    {panel.methods.queryPlan.map((query) => (
                      <li key={query}>{query}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {panel.methods.gradingFramework ? (
                <div className='medical-evidence-methodBlock'>
                  <b>{labels.gradingFramework}</b>
                  <p>{panel.methods.gradingFramework}</p>
                </div>
              ) : null}
              {panel.methods.limitations?.length ? (
                <div className='medical-evidence-methodBlock'>
                  <b>{labels.limitations}</b>
                  <ul>
                    {panel.methods.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}

        <button
          type='button'
          className={classNames(
            'medical-evidence-copyMarkdown',
            copyState === 'copied' && 'medical-evidence-copyMarkdown--copied',
            copyState === 'error' && 'medical-evidence-copyMarkdown--error'
          )}
          onClick={handleCopyMarkdown}
          aria-label={copyLabel}
        >
          <Copy theme='outline' size='13' />
          <span>{copyLabel}</span>
        </button>
      </section>
    </MedicalEvidenceLanguageContext.Provider>
  );
};
