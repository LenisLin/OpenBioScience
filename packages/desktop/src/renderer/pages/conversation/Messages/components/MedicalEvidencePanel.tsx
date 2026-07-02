/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  MedicalEvidenceConfidence,
  MedicalEvidenceItem,
  MedicalEvidencePanelData,
} from '@/common/chat/medicalEvidence';
import { Button, Collapse, Tag, Tooltip } from '@arco-design/web-react';
import { CheckCorrect, LinkCloud, Search, Shield, Warning } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './MedicalEvidencePanel.css';

type Stats = MedicalEvidencePanelData['stats'];

const confidenceLabel: Record<MedicalEvidenceConfidence, string> = {
  high: '高',
  moderate: '中',
  low: '低',
  very_low: '很低',
};

const confidenceScore: Record<MedicalEvidenceConfidence, number> = {
  high: 92,
  moderate: 68,
  low: 42,
  very_low: 24,
};

const confidenceClass: Record<MedicalEvidenceConfidence, string> = {
  high: 'medical-evidence-confidence--high',
  moderate: 'medical-evidence-confidence--moderate',
  low: 'medical-evidence-confidence--low',
  very_low: 'medical-evidence-confidence--very-low',
};

const sourceLabel: Record<MedicalEvidenceItem['sourceType'], string> = {
  guideline: '指南',
  systematic_review: '系统综述',
  rct: 'RCT',
  cohort: '队列研究',
  case_control: '病例对照',
  case_series: '病例系列',
  regulatory: '监管文件',
  drug_label: '说明书',
  trial_registry: '试验注册',
  abstract: '摘要',
  other: '其他',
};

const CountUp: React.FC<{ value: number; duration?: number }> = ({ value, duration = 700 }) => {
  const [display, setDisplay] = useState(value);
  const startRef = useRef(value);

  useEffect(() => {
    const start = startRef.current;
    const delta = value - start;
    if (delta === 0) return;
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + delta * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      startRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, value]);

  return <>{display}</>;
};

export const MedicalEvidenceAccumulator: React.FC<{ stats: Stats; running?: boolean }> = ({ stats, running }) => {
  const items = [
    { label: '检索', value: stats.searches, icon: <Search theme='outline' size='13' /> },
    { label: '命中', value: stats.recordsFound, icon: <LinkCloud theme='outline' size='13' /> },
    { label: '锚点', value: stats.anchors, icon: <CheckCorrect theme='outline' size='13' /> },
    { label: '冲突', value: stats.conflicts, icon: <Warning theme='outline' size='13' /> },
  ];

  return (
    <div className={classNames('medical-evidence-accumulator', running && 'medical-evidence-accumulator--running')}>
      <span className='medical-evidence-accumulator__pulse' aria-hidden='true' />
      {items.map((item) => (
        <span key={item.label} className='medical-evidence-accumulator__item'>
          {item.icon}
          <b>
            <CountUp value={item.value} />
          </b>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
};

const EvidenceAnchorLink: React.FC<{ evidence: MedicalEvidenceItem }> = ({ evidence }) => {
  const anchor = evidence.anchor;
  const href = evidence.url || anchor?.url;
  const lineLabel =
    anchor?.lineStart && anchor?.lineEnd
      ? anchor.lineStart === anchor.lineEnd
        ? `L${anchor.lineStart}`
        : `L${anchor.lineStart}-L${anchor.lineEnd}`
      : undefined;
  if (!href && !anchor?.path) return null;
  return (
    <Tooltip content={anchor?.path || href || ''}>
      <span className='medical-evidence-source-link'>
        <LinkCloud theme='outline' size='13' />
        <span>{lineLabel || '原文'}</span>
      </span>
    </Tooltip>
  );
};

const EvidenceCard: React.FC<{ evidence: MedicalEvidenceItem; index: number }> = ({ evidence, index }) => {
  const score = confidenceScore[evidence.confidence];
  return (
    <article
      id={`medical-evidence-${evidence.id}`}
      className='medical-evidence-card'
      style={{ animationDelay: `${Math.min(index * 52, 260)}ms` }}
    >
      <div className='medical-evidence-card__head'>
        <div className='medical-evidence-card__titleRow'>
          <span className='medical-evidence-id'>{evidence.id}</span>
          <Tag size='small' color={evidence.sourceType === 'rct' ? 'orange' : evidence.sourceType === 'drug_label' ? 'arcoblue' : 'green'}>
            {sourceLabel[evidence.sourceType]}
          </Tag>
          <span className={classNames('medical-evidence-confidence', confidenceClass[evidence.confidence])}>
            {confidenceLabel[evidence.confidence]}
          </span>
        </div>
        <h4>{evidence.title}</h4>
        <div className='medical-evidence-card__meta'>
          {evidence.authors ? <span>{evidence.authors}</span> : null}
          {evidence.year ? <span>{evidence.year}</span> : null}
          {evidence.journal ? <span>{evidence.journal}</span> : null}
          {evidence.doi ? <span>doi: {evidence.doi}</span> : null}
        </div>
      </div>
      {evidence.summary ? <p className='medical-evidence-card__summary'>{evidence.summary}</p> : null}
      {evidence.anchor?.quote ? <blockquote>{evidence.anchor.quote}</blockquote> : null}
      <div className='medical-evidence-card__foot'>
        <div className='medical-evidence-meter' aria-label={`置信度 ${score}`}>
          <span style={{ width: `${score}%` }} />
        </div>
        <EvidenceAnchorLink evidence={evidence} />
      </div>
      {evidence.applicability ? <div className='medical-evidence-applicability'>{evidence.applicability}</div> : null}
    </article>
  );
};

const FindingRow: React.FC<{ finding: MedicalEvidencePanelData['findings'][number] }> = ({ finding }) => (
  <div className='medical-evidence-finding'>
    <div className='medical-evidence-finding__icon'>
      <CheckCorrect theme='outline' size='16' />
    </div>
    <div className='min-w-0'>
      <div className='medical-evidence-finding__title'>{finding.title}</div>
      <div className='medical-evidence-finding__text'>{finding.conclusion}</div>
      <div className='medical-evidence-finding__refs'>{finding.evidenceIds.map((id) => `[${id}]`).join(' ')}</div>
    </div>
  </div>
);

export const MedicalEvidencePanel: React.FC<{ panel: MedicalEvidencePanelData }> = ({ panel }) => {
  const [expanded, setExpanded] = useState(false);
  const stats = panel.stats;
  const topEvidence = useMemo(() => panel.evidence.slice(0, expanded ? panel.evidence.length : 4), [expanded, panel.evidence]);
  const conflicts = panel.conflicts || [];

  return (
    <section className='medical-evidence-panel' data-testid='medical-evidence-panel'>
      <div className='medical-evidence-panel__header'>
        <div className='medical-evidence-panel__badge'>
          <Shield theme='outline' size='18' />
        </div>
        <div className='min-w-0 flex-1'>
          <div className='medical-evidence-panel__eyebrow'>Evidence Mode</div>
          <h3>医学循证面板</h3>
          <p>{panel.summary || panel.question}</p>
        </div>
        <MedicalEvidenceAccumulator stats={stats} />
      </div>

      <div className='medical-evidence-stagebar' aria-label='循证流程'>
        {['检索增强', '证据分级', '可追溯输出'].map((label, index) => (
          <div key={label} className='medical-evidence-stagebar__item'>
            <span>{index + 1}</span>
            <b>{label}</b>
          </div>
        ))}
      </div>

      {panel.findings.length > 0 ? (
        <div className='medical-evidence-findings'>
          {panel.findings.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </div>
      ) : null}

      {conflicts.length > 0 ? (
        <div className='medical-evidence-conflicts'>
          <div className='medical-evidence-sectionTitle'>
            <Warning theme='outline' size='15' />
            <span>冲突证据与处理</span>
          </div>
          {conflicts.map((conflict) => (
            <div key={conflict.id} className='medical-evidence-conflict'>
              <b>{conflict.claim}</b>
              <p>{conflict.explanation}</p>
              {conflict.resolution ? <span>{conflict.resolution}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className='medical-evidence-sectionTitle'>
        <LinkCloud theme='outline' size='15' />
        <span>全部引用</span>
      </div>
      <div className='medical-evidence-grid'>
        {topEvidence.map((evidence, index) => (
          <EvidenceCard key={evidence.id} evidence={evidence} index={index} />
        ))}
      </div>
      {panel.evidence.length > 4 ? (
        <Button size='small' type='secondary' className='mt-12px' onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起引用' : `展开全部 ${panel.evidence.length} 条引用`}
        </Button>
      ) : null}

      {panel.methods ? (
        <Collapse bordered={false} className='medical-evidence-methods'>
          <Collapse.Item header='检索与分级方法' name='methods'>
            {panel.methods.queryPlan?.length ? (
              <div className='medical-evidence-methodBlock'>
                <b>Query plan</b>
                <ul>
                  {panel.methods.queryPlan.map((query) => (
                    <li key={query}>{query}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {panel.methods.gradingFramework ? (
              <div className='medical-evidence-methodBlock'>
                <b>Grading</b>
                <p>{panel.methods.gradingFramework}</p>
              </div>
            ) : null}
            {panel.methods.limitations?.length ? (
              <div className='medical-evidence-methodBlock'>
                <b>Limitations</b>
                <ul>
                  {panel.methods.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Collapse.Item>
        </Collapse>
      ) : null}
    </section>
  );
};

