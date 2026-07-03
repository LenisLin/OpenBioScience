/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  LabSkillClaim,
  LabSkillDepositionPanelData,
  LabSkillEvidenceItem,
  LabSkillProtocolDraft,
  LabSkillValidationFinding,
} from '@/common/chat/labSkillDeposition';
import OpenScienceIcon, { type OpenScienceIconName } from '@/renderer/components/icons/OpenScienceIcon';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useLocalFilePreview } from '@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview';
import { emitter } from '@/renderer/utils/emitter';
import { Message, Modal } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import './LabSkillDepositionPanel.css';

type InspectorTab = 'overview' | 'sources' | 'files' | 'protocols' | 'validation' | 'graph';
type EnableBlockReason = {
  id: string;
  title: string;
  detail?: string;
};
type LabMarkdownSegment =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] };

const TAB_LABELS: Record<InspectorTab, string> = {
  overview: '总览',
  sources: '来源',
  files: '文件',
  protocols: 'Protocol',
  validation: '校验',
  graph: '图谱',
};

const TAB_ICONS: Record<InspectorTab, OpenScienceIconName> = {
  overview: 'depositionReport',
  sources: 'depositionSourceMap',
  files: 'depositionSkill',
  protocols: 'depositionProtocol',
  validation: 'scienceValidation',
  graph: 'artifactProvenance',
};

const SOURCE_ICONS: Record<LabSkillEvidenceItem['sourceType'], OpenScienceIconName> = {
  conversation: 'artifactMessages',
  artifact: 'artifact',
  file: 'artifact',
  protocol: 'depositionProtocol',
  paper: 'connectorLiterature',
  code: 'artifactCode',
  review: 'artifactReview',
  user_instruction: 'artifactInputs',
  manual_note: 'depositionSop',
};

const FILE_ROLE_ICONS: Record<NonNullable<LabSkillDepositionPanelData['files']>[number]['role'], OpenScienceIconName> =
  {
    skill: 'depositionSkill',
    protocol: 'depositionProtocol',
    reference: 'depositionSourceMap',
    ledger: 'artifactProvenance',
    report: 'depositionReport',
    other: 'artifact',
  };

const FINDING_ICONS: Record<LabSkillValidationFinding['severity'], OpenScienceIconName> = {
  info: 'scienceValidation',
  warning: 'reviewWarning',
  error: 'reviewFailed',
  blocking: 'reviewFailed',
};

const SUBSTANTIVE_SOURCE_TYPES = new Set<LabSkillEvidenceItem['sourceType']>([
  'conversation',
  'artifact',
  'file',
  'protocol',
  'paper',
  'code',
  'review',
]);

const PLACEHOLDER_CLAIM_TEXTS = new Set(['未命名规则', 'unnamed rule', 'placeholder rule']);

const pathLabel = (value?: string): string => {
  if (!value) return '';
  const normalized = value.replace(/\\/g, '/');
  return normalized.split('/').pop() || value;
};

const hasSubstantiveSource = (panel: LabSkillDepositionPanelData): boolean =>
  panel.sources.some(
    (source) =>
      SUBSTANTIVE_SOURCE_TYPES.has(source.sourceType) && source.status !== 'ignored' && source.status !== 'blocked'
  );

const isPlaceholderClaim = (claim: LabSkillClaim): boolean =>
  !claim.text.trim() || PLACEHOLDER_CLAIM_TEXTS.has(claim.text.trim().toLowerCase());

const hasSupportedClaim = (panel: LabSkillDepositionPanelData): boolean => {
  const sourceIds = new Set(
    panel.sources
      .filter(
        (source) =>
          SUBSTANTIVE_SOURCE_TYPES.has(source.sourceType) && source.status !== 'ignored' && source.status !== 'blocked'
      )
      .map((source) => source.id)
  );
  return (panel.claims || []).some(
    (claim) =>
      !isPlaceholderClaim(claim) &&
      claim.status !== 'blocked' &&
      claim.status !== 'conflict' &&
      claim.evidenceIds.some((sourceId) => sourceIds.has(sourceId))
  );
};

const getEnableBlockReasons = (panel: LabSkillDepositionPanelData): EnableBlockReason[] => {
  const reasons: EnableBlockReason[] = [];
  const reasonIds = new Set<string>();
  const addReason = (reason: EnableBlockReason) => {
    if (reasonIds.has(reason.id)) return;
    reasonIds.add(reason.id);
    reasons.push(reason);
  };

  const blockingFindings = (panel.validation?.findings || []).filter((finding) => finding.severity === 'blocking');
  for (const finding of blockingFindings) {
    addReason({
      id: `finding-${finding.id}`,
      title: finding.title || '存在阻断级校验问题',
      detail: finding.detail || finding.target,
    });
  }

  if (!panel.skill.draftDir) {
    addReason({
      id: 'missing-draft',
      title: '尚未生成 Skill 草稿',
      detail: '需要先让 Agent 完成 compile_draft，并产出可检查的 SKILL.md、Protocol 或引用文件。',
    });
  }

  if (!panel.sources.length || panel.stats.sources <= 0) {
    addReason({
      id: 'missing-sources',
      title: '尚未登记可追踪来源',
      detail: '沉淀结果至少需要绑定一条 conversation、artifact、文件、代码、论文或 review 来源。',
    });
  } else if (!hasSubstantiveSource(panel)) {
    addReason({
      id: 'weak-sources',
      title: '缺少可沉淀的实质来源',
      detail: '当前来源主要是用户指令或手工备注，不能证明 SOP 来自真实会话、文件、artifact 或代码证据。',
    });
  }

  if ((panel.claims || []).length === 0 || panel.stats.claims <= 0 || (panel.claims || []).every(isPlaceholderClaim)) {
    addReason({
      id: 'missing-claims',
      title: '尚未抽取 SOP 规则',
      detail: '需要先把可复用的操作步骤、约束、校验标准或适用边界沉淀为规则。',
    });
  } else if (!hasSupportedClaim(panel)) {
    addReason({
      id: 'unsupported-claims',
      title: 'SOP 规则没有绑定实质来源',
      detail:
        '至少一条可启用规则需要通过 evidenceIds 指向已登记的 conversation、artifact、文件、代码、论文或 review 来源。',
    });
  }

  if (!['ready', 'enabled'].includes(panel.status) && panel.validation?.canEnable === false) {
    addReason({
      id: 'not-ready',
      title: '沉淀状态尚未进入 ready',
      detail: `当前状态是 ${panel.status}，需要先完成来源选择、规则抽取、草稿编译和校验。`,
    });
  }

  if (!reasons.length && panel.validation?.canEnable === false) {
    addReason({
      id: 'validation-failed',
      title: '校验结果尚不允许启用',
      detail: '后端校验返回 canEnable=false，请先查看右侧“校验”页签中的 finding。',
    });
  }

  if (!reasons.length && !panel.skill.canEnable) {
    addReason({
      id: 'skill-not-enableable',
      title: 'Skill 草稿尚不可启用',
      detail: '当前草稿还没有满足发布或安装前置条件。',
    });
  }

  return reasons;
};

const isPanelEnableable = (panel: LabSkillDepositionPanelData, reasons = getEnableBlockReasons(panel)): boolean =>
  Boolean(panel.validation?.canEnable && panel.skill.canEnable && reasons.length === 0);

const stripStandaloneEvidenceCitations = (text: string): string =>
  text
    .replace(/\s*(?:\[\s*[A-Z]\d+\s*\]\s*){1,}/giu, ' ')
    .replace(/\s+([，。；：、,.!?;:])/gu, '$1')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();

const parseTableRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((cell) => cell.trim());

const isTableSeparator = (line: string): boolean => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);

const parseLabMarkdown = (markdown: string): LabMarkdownSegment[] => {
  const segments: LabMarkdownSegment[] = [];
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

  const lines = stripStandaloneEvidenceCitations(markdown).split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const nextLine = lines[index + 1]?.trim() || '';
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.includes('|') && isTableSeparator(nextLine)) {
      flushParagraph();
      flushList();
      const headers = parseTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().includes('|')) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      if (headers.length && rows.length) segments.push({ type: 'table', headers, rows });
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

const renderInlineMarkdown = (text: string, variant: 'body' | 'table' = 'body'): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const inlinePattern = /(\*\*([^*]+?)\*\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)]+?)\))/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2]) {
      nodes.push(
        <strong
          key={`strong-${match.index}`}
          className={classNames('lab-skill-emphasis', variant === 'table' && 'lab-skill-emphasis--table')}
        >
          {match[2].trim()}
        </strong>
      );
    } else if (match[4]) {
      nodes.push(<code key={`code-${match.index}`}>{match[4]}</code>);
    } else if (match[6] && match[7]) {
      nodes.push(
        <a key={`link-${match.index}`} href={match[7]} target='_blank' rel='noreferrer'>
          {match[6]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : [text];
};

const scrollToLabSkillSource = (id: string) => {
  const target = document.getElementById(`lab-skill-source-${id}`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (!target) return;
  target.classList.remove('lab-skill-card--jumped');
  window.setTimeout(() => {
    target.classList.add('lab-skill-card--jumped');
    window.setTimeout(() => target.classList.remove('lab-skill-card--jumped'), 2200);
  }, 0);
};

const LabMarkdownBlock: React.FC<{
  markdown: string;
  className?: string;
}> = ({ markdown, className }) => {
  const segments = parseLabMarkdown(markdown);
  if (!segments.length) return null;
  return (
    <div className={classNames('lab-skill-markdown', className)}>
      {segments.map((segment, index) => {
        if (segment.type === 'heading') {
          return <h5 key={`heading-${index}`}>{renderInlineMarkdown(segment.text)}</h5>;
        }
        if (segment.type === 'paragraph') {
          return <p key={`paragraph-${index}`}>{renderInlineMarkdown(segment.text)}</p>;
        }
        if (segment.type === 'table') {
          return (
            <figure key={`table-${index}`} className='lab-skill-table'>
              <div className='lab-skill-table__scroll'>
                <table>
                  <thead>
                    <tr>
                      {segment.headers.map((header, headerIndex) => (
                        <th key={`${header}-${headerIndex}`}>{renderInlineMarkdown(header, 'table')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {segment.rows.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`}>
                        {segment.headers.map((header, columnIndex) => (
                          <td key={`${header}-${columnIndex}`}>
                            {renderInlineMarkdown(row[columnIndex] || '', 'table')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </figure>
          );
        }
        const ListTag = segment.type === 'ol' ? 'ol' : 'ul';
        return (
          <ListTag key={`list-${index}`}>
            {segment.items.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
};

const StatPill: React.FC<{ label: string; value: number; icon: OpenScienceIconName }> = ({ label, value, icon }) => (
  <span className='lab-skill-stat'>
    <OpenScienceIcon name={icon} size={14} visualScale={1.05} />
    <b>{value}</b>
    {label}
  </span>
);

const EvidenceBadges: React.FC<{
  ids?: string[];
  sourcesById: Map<string, LabSkillEvidenceItem>;
}> = ({ ids, sourcesById }) => {
  if (!ids?.length) return null;
  return (
    <span className='lab-skill-evidence-badges'>
      {ids.map((id) => {
        const source = sourcesById.get(id);
        return (
          <span key={id} className='lab-skill-citationWrap'>
            <button type='button' className='lab-skill-citation' onClick={() => scrollToLabSkillSource(id)}>
              [{id}]
            </button>
            {source ? (
              <button type='button' className='lab-skill-citationCard' onClick={() => scrollToLabSkillSource(id)}>
                <span>
                  <OpenScienceIcon name={SOURCE_ICONS[source.sourceType]} size={13} visualScale={1.05} />
                  {source.sourceType}
                </span>
                <strong>{source.title}</strong>
                {source.summary ? <em>{source.summary}</em> : null}
                {source.path || source.url ? <code>{source.path || source.url}</code> : null}
              </button>
            ) : null}
          </span>
        );
      })}
    </span>
  );
};

const ClaimList: React.FC<{
  claims: LabSkillClaim[];
  sourcesById: Map<string, LabSkillEvidenceItem>;
}> = ({ claims, sourcesById }) => {
  if (!claims.length) return <div className='lab-skill-empty'>尚未抽取 SOP 规则。</div>;
  return (
    <div className='lab-skill-claims'>
      {claims.map((claim) => (
        <article key={claim.id} className={`lab-skill-claim lab-skill-claim--${claim.status}`}>
          <div>
            <b>{claim.id}</b>
            <span>{claim.target || 'sop'}</span>
          </div>
          <p>{renderInlineMarkdown(claim.text)}</p>
          <EvidenceBadges ids={claim.evidenceIds} sourcesById={sourcesById} />
        </article>
      ))}
    </div>
  );
};

const ProtocolList: React.FC<{
  protocols: LabSkillProtocolDraft[];
  onOpenFile: (path: string) => void;
}> = ({ protocols, onOpenFile }) => {
  if (!protocols.length) return <div className='lab-skill-empty'>尚未生成 Protocol。</div>;
  return (
    <div className='lab-skill-protocols'>
      {protocols.map((protocol) => (
        <article key={protocol.id} className={`lab-skill-protocol lab-skill-protocol--${protocol.status}`}>
          <div>
            <b>{protocol.id}</b>
            <span>
              <OpenScienceIcon name='depositionProtocol' size={13} visualScale={1.05} />
              {protocol.status}
            </span>
          </div>
          <strong>{protocol.title}</strong>
          {protocol.summary ? <p>{renderInlineMarkdown(protocol.summary)}</p> : null}
          {protocol.path ? (
            <button type='button' onClick={() => onOpenFile(protocol.path!)}>
              {pathLabel(protocol.path)}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
};

const FindingList: React.FC<{ findings: LabSkillValidationFinding[] }> = ({ findings }) => {
  if (!findings.length) return <div className='lab-skill-empty'>没有校验问题。</div>;
  return (
    <div className='lab-skill-findings'>
      {findings.map((finding) => (
        <article key={finding.id} className={`lab-skill-finding lab-skill-finding--${finding.severity}`}>
          <b>
            <OpenScienceIcon name={FINDING_ICONS[finding.severity]} size={14} visualScale={1.05} />
            {finding.title}
          </b>
          {finding.detail ? <p>{renderInlineMarkdown(finding.detail)}</p> : null}
          {finding.target ? <code>{finding.target}</code> : null}
        </article>
      ))}
    </div>
  );
};

const InspectorPane: React.FC<{
  panel: LabSkillDepositionPanelData;
  onOpenFile: (path: string) => void;
}> = ({ panel, onOpenFile }) => {
  const [tab, setTab] = useState<InspectorTab>('overview');
  const findings = panel.validation?.findings || [];
  const canEnable = useMemo(() => isPanelEnableable(panel), [panel]);

  return (
    <aside className='lab-skill-inspector'>
      <div className='lab-skill-tabs'>
        {(Object.keys(TAB_LABELS) as InspectorTab[]).map((item) => (
          <button
            key={item}
            type='button'
            className={classNames(tab === item && 'lab-skill-tabs__item--active')}
            onClick={() => setTab(item)}
          >
            <OpenScienceIcon name={TAB_ICONS[item]} size={14} visualScale={1.05} />
            <span>{TAB_LABELS[item]}</span>
          </button>
        ))}
      </div>

      <div className='lab-skill-inspector-body'>
        {tab === 'overview' ? (
          <div className='lab-skill-kv'>
            <span>Skill</span>
            <b>{panel.skill.displayName || panel.skill.name}</b>
            <span>状态</span>
            <b>{panel.status}</b>
            <span>可启用</span>
            <b>{canEnable ? '是' : '否'}</b>
            <span>草稿</span>
            <button
              type='button'
              disabled={!panel.skill.draftDir}
              onClick={() => panel.skill.draftDir && onOpenFile(panel.skill.draftDir)}
            >
              {pathLabel(panel.skill.draftDir) || 'none'}
            </button>
          </div>
        ) : null}

        {tab === 'sources' ? (
          <div className='lab-skill-source-list'>
            {panel.sources.length ? (
              panel.sources.map((source) => (
                <article key={source.id} id={`lab-skill-source-${source.id}`} className='lab-skill-source'>
                  <div>
                    <b>{source.id}</b>
                    <span>
                      <OpenScienceIcon name={SOURCE_ICONS[source.sourceType]} size={13} visualScale={1.05} />
                      {source.sourceType}
                    </span>
                  </div>
                  <strong>{source.title}</strong>
                  {source.summary ? <p>{renderInlineMarkdown(source.summary)}</p> : null}
                  {source.path ? (
                    <button type='button' onClick={() => onOpenFile(source.path!)}>
                      {pathLabel(source.path)}
                    </button>
                  ) : source.url ? (
                    <a href={source.url} target='_blank' rel='noreferrer'>
                      Open URL
                    </a>
                  ) : null}
                </article>
              ))
            ) : (
              <div className='lab-skill-empty'>尚未选择来源。</div>
            )}
          </div>
        ) : null}

        {tab === 'files' ? (
          <div className='lab-skill-file-list'>
            {panel.files?.length ? (
              panel.files.map((file) => (
                <button key={`${file.role}-${file.path}`} type='button' onClick={() => onOpenFile(file.path)}>
                  <span>
                    <OpenScienceIcon name={FILE_ROLE_ICONS[file.role]} size={13} visualScale={1.05} />
                    {file.role}
                  </span>
                  <b>{file.label || pathLabel(file.path)}</b>
                </button>
              ))
            ) : (
              <div className='lab-skill-empty'>暂无草稿文件。</div>
            )}
          </div>
        ) : null}

        {tab === 'protocols' ? <ProtocolList protocols={panel.protocols || []} onOpenFile={onOpenFile} /> : null}

        {tab === 'validation' ? <FindingList findings={findings} /> : null}

        {tab === 'graph' ? (
          <div className='lab-skill-graph'>
            {(panel.graph?.edges || []).slice(0, 16).map((edge) => (
              <div key={edge.id}>
                <code>{edge.from}</code>
                <span>{edge.type}</span>
                <code>{edge.to}</code>
              </div>
            ))}
            {!(panel.graph?.edges || []).length ? <div className='lab-skill-empty'>暂无证据链边。</div> : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
};

export const LabSkillDepositionPanel: React.FC<{ panel: LabSkillDepositionPanelData }> = ({ panel }) => {
  const conversationContext = useConversationContextSafe();
  const workspace = panel.projectRoot || conversationContext?.workspace;
  const openLocalFilePreview = useLocalFilePreview(workspace);
  const sourcesById = useMemo(() => new Map(panel.sources.map((source) => [source.id, source])), [panel.sources]);
  const enableBlockReasons = useMemo(() => getEnableBlockReasons(panel), [panel]);
  const canEnable = isPanelEnableable(panel, enableBlockReasons);

  const openFile = React.useCallback(
    (filePath: string) => {
      void openLocalFilePreview(filePath);
    },
    [openLocalFilePreview]
  );

  const handleEnable = React.useCallback(() => {
    if (!canEnable) {
      Modal.warning({
        title: '暂不能启用这个 Skill',
        okText: '知道了',
        content: (
          <div className='lab-skill-enableReasons'>
            <p className='lab-skill-enableReasons__lead'>
              当前沉淀结果还不能安全发布或安装。请先修复下面的问题，再重新生成沉淀报告。
            </p>
            <ul>
              {(enableBlockReasons.length
                ? enableBlockReasons
                : [
                    {
                      id: 'unknown',
                      title: '启用条件未满足',
                      detail: '系统没有拿到更具体的失败原因，请查看校验页签或重新提交沉淀报告。',
                    },
                  ]
              ).map((reason) => (
                <li key={reason.id}>
                  <b>{reason.title}</b>
                  {reason.detail ? <span>{reason.detail}</span> : null}
                </li>
              ))}
            </ul>
            {panel.nextActions?.length ? (
              <p className='lab-skill-enableReasons__next'>建议下一步：{panel.nextActions.join(' · ')}</p>
            ) : null}
          </div>
        ),
      });
      return;
    }
    emitter.emit(
      'sendbox.fill',
      `请启用当前沉淀 Skill：${panel.skill.name}。请先调用 lab_skill(action="publish_skill")，确认没有 blocking finding 后，再调用 lab_skill(action="install_skill", options={approved:true})。`
    );
    Message.info('已填入启用指令，请发送后由 Agent 完成发布和安装。');
  }, [canEnable, enableBlockReasons, panel.nextActions, panel.skill.name]);

  const handleRevision = React.useCallback(() => {
    emitter.emit('sendbox.fill', '还需要修改：');
    emitter.emit('sendbox.focus');
    Message.info('请在输入框更进一步填写。');
  }, []);

  return (
    <section className='lab-skill-panel' data-testid='lab-skill-deposition-panel'>
      <header className='lab-skill-header'>
        <div>
          <div className='lab-skill-titleline'>
            <span className='lab-skill-kicker'>
              <OpenScienceIcon name='depositionReport' size={15} visualScale={1.08} />
              OpenScience 沉淀报告
            </span>
            <span className={`lab-skill-status lab-skill-status--${panel.status}`}>{panel.status}</span>
          </div>
          <h2>{panel.report.title || panel.title}</h2>
          {panel.userInstruction ? <p>{panel.userInstruction}</p> : null}
        </div>
        <div className='lab-skill-buttons'>
          <button type='button' className='lab-skill-secondary' onClick={handleRevision}>
            <OpenScienceIcon name='depositionRevise' size={17} visualScale={1.08} />
            还需要修改
          </button>
          <button
            type='button'
            className={classNames('lab-skill-primary', !canEnable && 'lab-skill-primary--blocked')}
            aria-disabled={!canEnable}
            title={!canEnable ? '查看暂不能启用的原因' : undefined}
            onClick={handleEnable}
          >
            <OpenScienceIcon name='depositionEnable' size={17} visualScale={1.08} />
            启用
          </button>
        </div>
      </header>

      <div className='lab-skill-actions'>
        <div className='lab-skill-stats'>
          <StatPill icon='depositionSourceMap' label='来源' value={panel.stats.sources} />
          <StatPill icon='depositionSop' label='规则' value={panel.stats.claims} />
          <StatPill icon='depositionProtocol' label='Protocol' value={panel.stats.protocols} />
          <StatPill icon='reviewFailed' label='阻断' value={panel.stats.blockers} />
        </div>
      </div>

      <div className='lab-skill-layout'>
        <main className='lab-skill-report'>
          {panel.summaryMarkdown ? (
            <section className='lab-skill-section lab-skill-section--summary'>
              <h3>摘要</h3>
              <LabMarkdownBlock markdown={panel.summaryMarkdown} />
            </section>
          ) : null}

          {panel.report.sections.map((section) => (
            <section key={section.id} className='lab-skill-section'>
              <h3>{section.heading}</h3>
              <LabMarkdownBlock markdown={section.markdown} />
              <EvidenceBadges ids={section.evidenceIds} sourcesById={sourcesById} />
            </section>
          ))}

          <section className='lab-skill-section'>
            <h3>SOP 规则</h3>
            <ClaimList claims={panel.claims || []} sourcesById={sourcesById} />
          </section>
        </main>

        <InspectorPane panel={panel} onOpenFile={openFile} />
      </div>

      {panel.nextActions?.length ? (
        <footer className='lab-skill-next'>
          <b>Next</b>
          <span>{panel.nextActions.join(' · ')}</span>
        </footer>
      ) : null}
    </section>
  );
};

export default LabSkillDepositionPanel;
