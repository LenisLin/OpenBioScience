/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ScienceArtifact,
  ScienceEvidenceItem,
  SciencePanelData,
  ScienceProvenanceEdge,
  ScienceProvenanceNode,
  ScienceReportBlock,
  ScienceSkillUse,
} from '@/common/chat/science';
import { ipcBridge } from '@/common';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import OpenScienceIcon, { type OpenScienceIconName } from '@/renderer/components/icons/OpenScienceIcon';
import { collectSciencePanelFiles, resolveSciencePreviewPath } from '@/renderer/utils/science/scienceProjectIndex';
import { useLocalFilePreview } from '../../Preview/hooks/useLocalFilePreview';
import { usePreviewContext } from '../../Preview/context/PreviewContext';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './MedicalEvidencePanel.css';
import './ScienceReportPanel.css';

const pathLabel = (value?: string): string => {
  if (!value) return '';
  const normalized = value.replace(/\\/g, '/');
  return normalized.split('/').pop() || value;
};

const getArtifactPreviewPath = (artifact?: ScienceArtifact): string | undefined =>
  artifact?.previewPath ||
  artifact?.primaryPath ||
  artifact?.thumbnailPath ||
  artifact?.outputPaths?.[0] ||
  artifact?.code?.path;

const getEvidencePreviewPath = (evidence?: ScienceEvidenceItem): string | undefined =>
  evidence?.path || evidence?.region?.filePath;

const isEvidenceOpenable = (evidence?: ScienceEvidenceItem): boolean =>
  Boolean(getEvidencePreviewPath(evidence) || evidence?.url);

const shouldIgnoreEvidenceCardOpen = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && Boolean(target.closest('button, a, input, textarea, select, summary, details'));

const unique = (values: Array<string | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
};

const hasSciencePanelFiles = (panel: SciencePanelData, workspace?: string): boolean =>
  Boolean(workspace && collectSciencePanelFiles(workspace, panel).length);

const HIDDEN_WORKSPACE_PARTS = new Set([
  '.git',
  '.openscience',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
]);

const hasVisibleWorkspaceFile = (file: { fullPath: string; relativePath?: string }): boolean => {
  const normalized = (file.relativePath || file.fullPath).replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!normalized) return false;
  const parts = normalized.split('/');
  if (parts.some((part) => HIDDEN_WORKSPACE_PARTS.has(part))) return false;
  return !/(^|\/)\.env(?:\.|$)/u.test(normalized);
};

const useScienceFilesAvailable = (panel: SciencePanelData, workspace?: string): boolean => {
  const declaredFiles = useMemo(() => hasSciencePanelFiles(panel, workspace), [panel, workspace]);
  const [workspaceHasFiles, setWorkspaceHasFiles] = useState(false);

  useEffect(() => {
    if (!workspace || declaredFiles) {
      setWorkspaceHasFiles(false);
      return undefined;
    }
    let cancelled = false;
    ipcBridge.fs.listWorkspaceFiles
      .invoke({ root: workspace })
      .then((files) => {
        if (!cancelled) setWorkspaceHasFiles(files.some(hasVisibleWorkspaceFile));
      })
      .catch(() => {
        if (!cancelled) setWorkspaceHasFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [declaredFiles, workspace]);

  return declaredFiles || workspaceHasFiles;
};

const citationTone = (evidence?: ScienceEvidenceItem): 'strong' | 'medium' | 'soft' => {
  if (evidence?.confidence === 'high') return 'strong';
  if (evidence?.confidence === 'moderate') return 'medium';
  return 'soft';
};

const checklistTone = (status?: string): 'met' | 'caution' | 'not_met' | 'unknown' => {
  const normalized = status?.toLowerCase();
  if (normalized === 'done' || normalized === 'completed' || normalized === 'passed' || normalized === 'supported')
    return 'met';
  if (normalized === 'warning' || normalized === 'partial' || normalized === 'needs_review' || normalized === 'running')
    return 'caution';
  if (normalized === 'failed' || normalized === 'blocked' || normalized === 'missing' || normalized === 'unsupported')
    return 'not_met';
  return 'unknown';
};

const artifactKindLabel = (artifact: ScienceArtifact): string => {
  if (artifact.type === 'latex' || artifact.code?.language === 'latex') return 'LaTeX';
  if (artifact.type === 'run_bundle') return 'run bundle';
  return artifact.type.replace(/_/g, ' ');
};

const ARTIFACT_TYPE_ICONS: Record<ScienceArtifact['type'], OpenScienceIconName> = {
  report: 'scienceReport',
  figure: 'artifactFigure',
  table: 'artifactTable',
  dataset: 'artifactDataset',
  code: 'artifactCode',
  notebook: 'artifactNotebook',
  manuscript: 'artifactManuscript',
  pdf: 'artifactPdf',
  latex: 'artifactLatex',
  html: 'artifactHtml',
  molecule: 'artifactMolecule',
  protein_structure: 'artifactProtein',
  genome_track: 'artifactGenomeTrack',
  alignment: 'artifactAlignment',
  regression_table: 'artifactTable',
  model_diagnostic: 'scienceValidation',
  causal_dag: 'scienceMethods',
  survey_codebook: 'artifactDataset',
  geospatial_map: 'artifactFigure',
  qualitative_coding: 'artifactManuscript',
  replication_package: 'artifactRunBundle',
  run_bundle: 'artifactRunBundle',
};

const EVIDENCE_SOURCE_ICONS: Record<ScienceEvidenceItem['sourceType'], OpenScienceIconName> = {
  file: 'artifact',
  paper: 'connectorLiterature',
  database_record: 'settingsDatasource',
  code: 'artifactCode',
  command_log: 'artifactLog',
  dataset: 'artifactDataset',
  table: 'artifactTable',
  figure: 'artifactFigure',
  notebook: 'artifactNotebook',
  manuscript: 'artifactManuscript',
  package_check: 'scienceValidation',
  computational_run: 'scienceComputed',
  dataset_analysis: 'scienceComputed',
  parameter_sweep: 'scienceComputed',
  validation_result: 'scienceValidation',
  remote_job: 'remoteJob',
  environment: 'artifactEnvironment',
  regression_output: 'artifactTable',
  statistical_model: 'scienceComputed',
  causal_assumption: 'scienceMethods',
  survey_instrument: 'artifactDataset',
  codebook: 'artifactDataset',
  data_dictionary: 'artifactDataset',
  qualitative_code: 'artifactManuscript',
  geospatial_layer: 'artifactFigure',
  replication_package: 'artifactRunBundle',
  user_input: 'artifactMessages',
};

const artifactIconName = (artifact: ScienceArtifact): OpenScienceIconName =>
  ARTIFACT_TYPE_ICONS[artifact.type] || 'artifact';
const evidenceIconName = (evidence: ScienceEvidenceItem): OpenScienceIconName =>
  EVIDENCE_SOURCE_ICONS[evidence.sourceType] || 'scienceEvidence';

const evidenceRegionLabel = (evidence: ScienceEvidenceItem): string | undefined => {
  if (!evidence.region) return undefined;
  const page = evidence.region.page != null ? `p${evidence.region.page}` : 'region';
  const file = pathLabel(evidence.region.filePath);
  return `${file || 'screenshot'} · ${page} · ${Math.round(evidence.region.width)}×${Math.round(evidence.region.height)}`;
};

const evidenceDatabaseCountLabel = (evidence: ScienceEvidenceItem): string | undefined => {
  const returned = evidence.database?.returnedCount;
  const retrieved = evidence.database?.retrievedCount;
  if (returned == null && retrieved == null) return undefined;
  if (returned != null && retrieved != null) return `count: ${retrieved}/${returned}`;
  if (retrieved != null) return `retrieved: ${retrieved}`;
  return `returned: ${returned}`;
};

const evidenceSourceLabel = (evidence: ScienceEvidenceItem): string => evidence.sourceType.replace(/_/g, ' ');

const evidenceConfidenceLabel = (confidence: ScienceEvidenceItem['confidence']): string => {
  if (confidence === 'blocked') return 'blocked';
  return confidence;
};

const endpointId = (endpoint: ScienceProvenanceEdge['from'] | ScienceProvenanceEdge['to']): string =>
  endpoint.kind === 'artifact' && endpoint.version ? `${endpoint.id}@v${endpoint.version}` : endpoint.id;

const endpointTitle = (
  endpoint: ScienceProvenanceEdge['from'] | ScienceProvenanceEdge['to'],
  evidenceById: Map<string, ScienceEvidenceItem>,
  artifactsById: Map<string, ScienceArtifact>,
  nodesById: Map<string, ScienceProvenanceNode>
): string => {
  if (endpoint.kind === 'evidence') return evidenceById.get(endpoint.id)?.title || endpoint.id;
  if (endpoint.kind === 'artifact') return artifactsById.get(endpoint.id)?.title || endpoint.id;
  if (endpoint.kind === 'node') return nodesById.get(endpoint.id)?.label || endpoint.id;
  return endpoint.id;
};

const skillSourceLabel = (source: ScienceSkillUse['source']): string => {
  if (source === 'k-dense') return 'K-Dense';
  if (source === 'deepscientist') return 'DeepScientist';
  if (source === 'auto-empirical') return 'Auto-Empirical';
  if (source === 'nature-skills') return 'Nature Skills';
  if (source === 'sciagent') return 'SciAgent';
  return source;
};

const scrollToEvidence = (id: string) => {
  const element = document.getElementById(`science-evidence-${id}`);
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  element.classList.add('medical-evidence-card--jumped');
  window.setTimeout(() => element.classList.remove('medical-evidence-card--jumped'), 2200);
};

const isEvidenceToken = (value: string, evidenceById?: Map<string, ScienceEvidenceItem>): boolean => {
  const trimmed = value.trim();
  if (evidenceById?.has(trimmed)) return true;
  if (/^ev_[0-9A-Za-z_.-]+$/u.test(trimmed)) return true;
  if (!/^E(?:\d[0-9A-Za-z_.-]*|[-_.][0-9A-Za-z_.-]+)$/u.test(trimmed)) return false;
  if (!trimmed.startsWith('E') || trimmed.length < 2) return false;
  return Array.from(trimmed.slice(1)).every((char) => {
    const code = char.charCodeAt(0);
    return (
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      char === '_' ||
      char === '.' ||
      char === '-'
    );
  });
};

const evidenceTokensFromBracket = (
  value: string,
  evidenceById: Map<string, ScienceEvidenceItem>
): string[] | undefined => {
  const tokens = value
    .split(/[,\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!tokens.length) return undefined;
  if (!tokens.every((token) => isEvidenceToken(token, evidenceById))) return undefined;
  return tokens;
};

const trimTrailingTextWhitespace = (nodes: React.ReactNode[]): void => {
  const lastIndex = nodes.length - 1;
  if (lastIndex < 0 || typeof nodes[lastIndex] !== 'string') return;
  nodes[lastIndex] = (nodes[lastIndex] as string).replace(/\s+$/u, '');
};

const ScienceCitation: React.FC<{
  id: string;
  evidenceById: Map<string, ScienceEvidenceItem>;
}> = ({ id, evidenceById }) => {
  const evidence = evidenceById.get(id);
  return (
    <span className='medical-evidence-citationWrap science-report-citationWrap'>
      <button
        type='button'
        className={classNames('medical-evidence-citation', `medical-evidence-citation--${citationTone(evidence)}`)}
        onClick={() => scrollToEvidence(id)}
      >
        [{id}]
      </button>
      <span className='medical-evidence-citationCard science-report-citationCard'>
        <span className='medical-evidence-citationCard__meta'>
          {id}
          {evidence?.sourceType ? ` · ${evidence.sourceType.replace(/_/g, ' ')}` : ''}
        </span>
        <strong>{evidence?.title || 'Evidence object'}</strong>
        {evidence?.summary ? <span>{evidence.summary}</span> : null}
        {evidence?.path || evidence?.virtualPath || evidence?.url ? (
          <em>{pathLabel(evidence.path) || evidence.virtualPath || evidence.url}</em>
        ) : null}
      </span>
    </span>
  );
};

const renderInlineEvidenceText = (
  text: string,
  evidenceIds: string[] | undefined,
  evidenceById: Map<string, ScienceEvidenceItem>
): React.ReactNode => {
  const nodes: React.ReactNode[] = [];
  const cited = new Set<string>();

  let index = 0;
  while (index < text.length) {
    const boldIndex = text.indexOf('**', index);
    const citationIndex = text.indexOf('[', index);
    const nextIndex =
      boldIndex >= 0 && citationIndex >= 0 ? Math.min(boldIndex, citationIndex) : Math.max(boldIndex, citationIndex);

    if (nextIndex < 0) {
      nodes.push(text.slice(index));
      break;
    }
    if (nextIndex > index) nodes.push(text.slice(index, nextIndex));

    if (nextIndex === boldIndex) {
      const endIndex = text.indexOf('**', boldIndex + 2);
      if (endIndex < 0) {
        nodes.push(text.slice(boldIndex));
        break;
      }
      const emphasized = text.slice(boldIndex + 2, endIndex);
      nodes.push(
        <span key={`em-${boldIndex}`} className='medical-evidence-emphasis science-report-emphasis'>
          {emphasized}
        </span>
      );
      index = endIndex + 2;
      continue;
    }

    const endIndex = text.indexOf(']', citationIndex + 2);
    const candidate = endIndex >= 0 ? text.slice(citationIndex + 1, endIndex) : '';
    const discoveredTokens = endIndex >= 0 ? evidenceTokensFromBracket(candidate, evidenceById) : undefined;
    if (discoveredTokens?.length) {
      discoveredTokens.forEach((token) => cited.add(token));
      trimTrailingTextWhitespace(nodes);
      nodes.push(
        <span
          key={`inline-citations-${citationIndex}`}
          className='medical-evidence-citationList science-report-citationList'
        >
          {discoveredTokens.map((id) => (
            <ScienceCitation key={id} id={id} evidenceById={evidenceById} />
          ))}
        </span>
      );
      index = endIndex + 1;
      continue;
    }
    nodes.push(text[citationIndex]);
    index = citationIndex + 1;
  }

  const appendedIds = unique(evidenceIds || []).filter((id) => !cited.has(id));
  if (appendedIds.length) {
    nodes.push(
      <span key='inline-extra-citations' className='medical-evidence-citationList science-report-citationList'>
        {appendedIds.map((id) => (
          <ScienceCitation key={id} id={id} evidenceById={evidenceById} />
        ))}
      </span>
    );
  }
  return nodes;
};

const ScienceReportBlockView: React.FC<{
  block: ScienceReportBlock;
  blockIndex: number;
  artifactsById: Map<string, ScienceArtifact>;
  evidenceById: Map<string, ScienceEvidenceItem>;
  onOpenArtifact: (artifact: ScienceArtifact) => void;
}> = ({ block, blockIndex, artifactsById, evidenceById, onOpenArtifact }) => {
  if (block.type === 'paragraph') {
    return (
      <p
        className='medical-evidence-report__paragraph'
        style={{ animationDelay: `${Math.min(blockIndex * 42, 220)}ms` }}
      >
        {renderInlineEvidenceText(block.text, block.evidenceIds, evidenceById)}
      </p>
    );
  }

  if (block.type === 'bullet_list') {
    return (
      <ul className='medical-evidence-report__list' style={{ animationDelay: `${Math.min(blockIndex * 42, 220)}ms` }}>
        {block.items.map((item, index) => (
          <li key={`${item.text}-${index}`}>{renderInlineEvidenceText(item.text, item.evidenceIds, evidenceById)}</li>
        ))}
      </ul>
    );
  }

  if (block.type === 'checklist') {
    return (
      <div
        className='medical-evidence-report__checklist'
        style={{ animationDelay: `${Math.min(blockIndex * 42, 220)}ms` }}
      >
        {block.items.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className={`medical-evidence-report__check medical-evidence-report__check--${checklistTone(item.status)}`}
          >
            <span aria-hidden='true' />
            <div>
              <b>{renderInlineEvidenceText(item.label, undefined, evidenceById)}</b>
              {item.detail ? <p>{renderInlineEvidenceText(item.detail, item.evidenceIds, evidenceById)}</p> : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const artifactId = 'artifactId' in block ? block.artifactId : undefined;
  const artifact = artifactId ? artifactsById.get(artifactId) : undefined;
  if (!artifact) return null;

  return (
    <button
      type='button'
      className='medical-evidence-reportCard__artifact science-report-artifactRef'
      style={{ animationDelay: `${Math.min(blockIndex * 42, 220)}ms` }}
      onClick={() => onOpenArtifact(artifact)}
    >
      <span>
        <OpenScienceIcon name={artifactIconName(artifact)} size={14} visualScale={1.05} />
        {artifactKindLabel(artifact)}
      </span>
      <div>
        <b>{artifact.title}</b>
        <code>
          {artifact.id} · v{artifact.version}
        </code>
        {artifact.changeSummary ? <em>{artifact.changeSummary}</em> : null}
      </div>
    </button>
  );
};

const ScienceEvidenceReference: React.FC<{
  evidence: ScienceEvidenceItem;
  evidenceById: Map<string, ScienceEvidenceItem>;
  index: number;
  onOpenEvidence: (evidence: ScienceEvidenceItem) => void;
}> = ({ evidence, evidenceById, index, onOpenEvidence }) => {
  const previewPath = getEvidencePreviewPath(evidence);
  const openable = isEvidenceOpenable(evidence);
  const sourceLocation = pathLabel(previewPath) || evidence.virtualPath || evidence.url;
  const metaItems = unique([
    evidence.database?.name,
    evidence.database?.accessDate ? `accessed ${evidence.database.accessDate}` : undefined,
    evidenceDatabaseCountLabel(evidence),
    evidenceRegionLabel(evidence),
    evidence.hash ? `hash ${evidence.hash.slice(0, 12)}` : undefined,
  ]);
  const technicalDetails = unique([
    evidence.database?.provider ? `provider: ${evidence.database.provider}` : undefined,
    evidence.database?.domain ? `domain: ${evidence.database.domain}` : undefined,
    evidence.database?.tool ? `tool: ${evidence.database.tool}` : undefined,
    evidence.database?.endpoint ? `endpoint: ${evidence.database.endpoint}` : undefined,
    evidence.database?.pagination ? `pagination: ${evidence.database.pagination}` : undefined,
    evidence.command ? `command: ${evidence.command}` : undefined,
    evidence.database?.identifierConversions?.length
      ? `identifier conversions: ${evidence.database.identifierConversions.join(' -> ')}`
      : undefined,
    evidence.database?.warnings?.length ? `warnings: ${evidence.database.warnings.join(' | ')}` : undefined,
    evidence.database?.params ? `params: ${JSON.stringify(evidence.database.params)}` : undefined,
  ]);

  const openEvidenceFromCard = useCallback(
    (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
      if (!openable || shouldIgnoreEvidenceCardOpen(event.target)) return;
      if ('key' in event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
      }
      onOpenEvidence(evidence);
    },
    [evidence, onOpenEvidence, openable]
  );

  return (
    <article
      id={`science-evidence-${evidence.id}`}
      className={classNames(
        'medical-evidence-reference science-evidence-reference',
        openable && 'science-evidence-reference--openable'
      )}
      style={{ animationDelay: `${Math.min(index * 30, 150)}ms` }}
      role={openable ? 'button' : undefined}
      tabIndex={openable ? 0 : undefined}
      aria-label={openable ? `Open evidence source for ${evidence.title}` : undefined}
      onClick={openEvidenceFromCard}
      onKeyDown={openEvidenceFromCard}
    >
      <div className='medical-evidence-reference__index'>{evidence.id}</div>
      <div className='medical-evidence-reference__body'>
        <div className='medical-evidence-reference__heading'>
          <h4>{evidence.title}</h4>
        </div>
        <div className='medical-evidence-qualityBadges medical-evidence-qualityBadges--compact'>
          <span className='medical-evidence-qualityBadge science-evidence-reference__typeBadge'>
            <OpenScienceIcon name={evidenceIconName(evidence)} size={12} visualScale={1.06} />
            {evidenceSourceLabel(evidence)}
          </span>
          {evidence.status ? (
            <span className='medical-evidence-qualityBadge'>{evidence.status.replace(/_/g, ' ')}</span>
          ) : null}
          {evidence.version ? <span className='medical-evidence-qualityBadge'>v{evidence.version}</span> : null}
          {evidence.region ? <span className='medical-evidence-qualityBadge'>region</span> : null}
        </div>
        {metaItems.length ? (
          <div className='medical-evidence-reference__meta'>
            {metaItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
        <div className='medical-evidence-reference__strength'>
          <span className={`science-evidence-strength science-evidence-strength--${evidence.confidence}`}>
            <OpenScienceIcon name='scienceValidation' size={13} visualScale={1.08} />
            Evidence strength: {evidenceConfidenceLabel(evidence.confidence)}
          </span>
          {evidence.artifactId ? (
            <span>
              artifact {evidence.artifactId}
              {evidence.artifactVersion ? ` v${evidence.artifactVersion}` : ''}
            </span>
          ) : null}
        </div>
        {evidence.summary ? <p>{evidence.summary}</p> : null}
        {sourceLocation ? (
          openable ? (
            <button
              type='button'
              className='medical-evidence-reference__paperclip science-evidence-reference__sourceButton'
              title={previewPath ? 'Open evidence file' : 'Open source URL'}
              onClick={(event) => {
                event.stopPropagation();
                onOpenEvidence(evidence);
              }}
            >
              <OpenScienceIcon name='artifactProvenance' size={12} visualScale={1.06} />
              <span>{sourceLocation}</span>
            </button>
          ) : (
            <span className='medical-evidence-reference__paperclip science-evidence-reference__sourceButton science-evidence-reference__sourceButton--static'>
              <OpenScienceIcon name='artifactProvenance' size={12} visualScale={1.06} />
              <span>{sourceLocation}</span>
            </span>
          )
        ) : null}
        {evidence.supportingEvidenceIds?.length ? (
          <div className='science-evidence-supporting'>
            <span>Supported by</span>
            {evidence.supportingEvidenceIds.map((id) => (
              <ScienceCitation key={id} id={id} evidenceById={evidenceById} />
            ))}
          </div>
        ) : null}
        {technicalDetails.length ? (
          <details className='science-evidence-reference__details' onClick={(event) => event.stopPropagation()}>
            <summary>Technical details</summary>
            <div>
              {technicalDetails.map((item) => (
                <code key={item}>{item}</code>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </article>
  );
};

const ScienceEvidenceChain: React.FC<{
  panel: SciencePanelData;
  evidenceById: Map<string, ScienceEvidenceItem>;
  artifactsById: Map<string, ScienceArtifact>;
}> = ({ panel, evidenceById, artifactsById }) => {
  const nodesById = useMemo(() => new Map(panel.provenance.map((node) => [node.id, node])), [panel.provenance]);
  const edges = panel.edges?.slice(0, 28) || [];
  const visibleNodes = panel.provenance.slice(0, 10);
  const warnings = panel.graphWarnings?.slice(0, 8) || [];

  if (!edges.length && !visibleNodes.length && !warnings.length) return null;

  return (
    <details className='medical-evidence-methods science-evidence-chainSection'>
      <summary>Evidence Chain</summary>
      <div className='medical-evidence-methods__body science-evidence-chainSection__body'>
        {edges.length ? (
          <div className='science-evidence-chain' data-testid='science-evidence-chain'>
            {edges.map((edge) => (
              <div key={edge.id} className='science-evidence-chain__edge'>
                <div className='science-evidence-chain__endpoint'>
                  <span>{edge.from.kind.replace(/_/g, ' ')}</span>
                  <b>{endpointTitle(edge.from, evidenceById, artifactsById, nodesById)}</b>
                  <code>{endpointId(edge.from)}</code>
                </div>
                <div
                  className={`science-evidence-chain__verb science-evidence-chain__verb--${edge.confidence || 'declared'}`}
                >
                  {edge.label || edge.type.replace(/_/g, ' ')}
                </div>
                <div className='science-evidence-chain__endpoint'>
                  <span>{edge.to.kind.replace(/_/g, ' ')}</span>
                  <b>{endpointTitle(edge.to, evidenceById, artifactsById, nodesById)}</b>
                  <code>{endpointId(edge.to)}</code>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {!edges.length && visibleNodes.length ? (
          <div className='science-evidence-nodeGrid'>
            {visibleNodes.map((node) => (
              <div key={node.id} className='science-evidence-node'>
                <span>{node.type.replace(/_/g, ' ')}</span>
                <b>{node.label}</b>
                {node.path ? <code>{pathLabel(node.path)}</code> : null}
              </div>
            ))}
          </div>
        ) : null}
        {warnings.length ? (
          <div className='science-report-warningList science-evidence-chain__warnings'>
            {warnings.map((warning) => (
              <div key={warning.id} className={`science-report-warning science-report-warning--${warning.severity}`}>
                <b>{warning.code.replace(/_/g, ' ')}</b>
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
};

const ScienceSkillTrail: React.FC<{
  skills?: ScienceSkillUse[];
  evidenceById: Map<string, ScienceEvidenceItem>;
  artifactsById: Map<string, ScienceArtifact>;
  onOpenArtifact: (artifact: ScienceArtifact) => void;
}> = ({ skills = [], evidenceById, artifactsById, onOpenArtifact }) => (
  <details className='medical-evidence-methods science-skillTrail'>
    <summary>Skill Trail</summary>
    <div className='medical-evidence-methods__body science-skillTrail__body'>
      {skills.length ? (
        skills.map((skill) => (
          <article key={skill.id} className={`science-skillTrail__item science-skillTrail__item--${skill.status}`}>
            <div className='science-skillTrail__head'>
              <div>
                <b>{skill.skillName || skill.skillId}</b>
                <code>{skill.skillId}</code>
              </div>
              <span>{skill.status.replace(/_/g, ' ')}</span>
            </div>
            <div className='science-skillTrail__meta'>
              <span>{skillSourceLabel(skill.source)}</span>
              <span>{skill.purpose.replace(/_/g, ' ')}</span>
              {skill.version ? <span>v{skill.version}</span> : null}
            </div>
            <p>{skill.selectedBecause || skill.triggeredBy}</p>
            {skill.evidenceIds?.length ? (
              <div className='science-skillTrail__links'>
                <span>Evidence</span>
                {skill.evidenceIds.map((id) => (
                  <ScienceCitation key={id} id={id} evidenceById={evidenceById} />
                ))}
              </div>
            ) : null}
            {skill.artifactIds?.length ? (
              <div className='science-skillTrail__links'>
                <span>Artifacts</span>
                {skill.artifactIds.map((id) => {
                  const artifact = artifactsById.get(id);
                  return artifact ? (
                    <button key={id} type='button' onClick={() => onOpenArtifact(artifact)}>
                      {artifact.title}
                    </button>
                  ) : (
                    <code key={id}>{id}</code>
                  );
                })}
              </div>
            ) : null}
            {skill.limitations?.length ? (
              <ul>
                {skill.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))
      ) : (
        <div className='science-report-empty'>
          No skill_use records have been published yet. The agent should register selected skills through
          science_artifact when a domain workflow affects the report.
        </div>
      )}
    </div>
  </details>
);

const ScienceArtifactList: React.FC<{
  artifacts: ScienceArtifact[];
  onOpenArtifact: (artifact: ScienceArtifact) => void;
}> = ({ artifacts, onOpenArtifact }) => {
  if (!artifacts.length) return <div className='science-report-empty'>No artifacts have been published yet.</div>;
  return (
    <div className='medical-evidence-reportCard__artifacts science-report-artifactList'>
      {artifacts.map((artifact) => (
        <button
          key={`${artifact.id}-${artifact.version}`}
          type='button'
          className={classNames(
            'medical-evidence-reportCard__artifact',
            'science-report-artifactItem',
            artifact.status && `science-report-artifactItem--${artifact.status}`
          )}
          onClick={() => onOpenArtifact(artifact)}
        >
          <span>
            <OpenScienceIcon name={artifactIconName(artifact)} size={14} visualScale={1.05} />
            {artifactKindLabel(artifact)}
          </span>
          <div>
            <b>{artifact.title}</b>
            <code>
              {artifact.id} · v{artifact.version}
            </code>
            {artifact.changeSummary ? <em>{artifact.changeSummary}</em> : null}
          </div>
        </button>
      ))}
    </div>
  );
};

export const ScienceReportPreviewPanel: React.FC<{ panel: SciencePanelData }> = ({ panel }) => {
  const conversationContext = useConversationContextSafe();
  const workspace = panel.projectRoot || conversationContext?.workspace;
  const openLocalFilePreview = useLocalFilePreview(workspace);
  const { openPreview } = usePreviewContext();
  const artifactsById = useMemo(() => new Map(panel.artifacts.map((item) => [item.id, item])), [panel.artifacts]);
  const evidenceById = useMemo(() => new Map(panel.evidence.map((item) => [item.id, item])), [panel.evidence]);
  const references = panel.evidence;
  const hasFiles = useScienceFilesAvailable(panel, workspace);

  const openArtifact = useCallback(
    (artifact: ScienceArtifact) => {
      const filePath = getArtifactPreviewPath(artifact);
      if (!filePath) return;
      const resolvedPath = resolveSciencePreviewPath(workspace, filePath) || filePath;
      void openLocalFilePreview(
        resolvedPath,
        undefined,
        {
          title: artifact.title,
          workspace,
          science: {
            panel,
            artifactId: artifact.id,
            artifactVersion: artifact.version,
            workspaceView: true,
          },
        },
        { replace: true }
      );
    },
    [openLocalFilePreview, panel, workspace]
  );

  const openEvidence = useCallback(
    (evidence: ScienceEvidenceItem) => {
      const filePath = getEvidencePreviewPath(evidence);
      if (filePath) {
        const resolvedPath = resolveSciencePreviewPath(workspace, filePath) || filePath;
        void openLocalFilePreview(resolvedPath, undefined, { title: evidence.title, workspace }, { replace: false });
        return;
      }
      if (evidence.url && typeof window !== 'undefined') {
        window.open(evidence.url, '_blank', 'noopener,noreferrer');
      }
    },
    [openLocalFilePreview, workspace]
  );

  const openFiles = useCallback(() => {
    if (!hasFiles) return;
    openPreview(
      '',
      'science_files',
      {
        title: 'Files',
        workspace,
        science: {
          panel,
          artifactId: 'files',
        },
      },
      { replace: false }
    );
  }, [hasFiles, openPreview, panel, workspace]);

  return (
    <div className='science-report-previewScroll'>
      <section className='medical-evidence-panel science-evidence-report' data-testid='science-report-preview-panel'>
        {hasFiles ? (
          <div className='science-report-previewActions'>
            <button type='button' onClick={openFiles}>
              <OpenScienceIcon name='artifactDataset' size={14} visualScale={1.05} />
              Files
            </button>
          </div>
        ) : null}
        <div className='medical-evidence-report'>
          <h3>{panel.report.title}</h3>
          {panel.summary || panel.question ? (
            <section className='medical-evidence-report__section medical-evidence-report__section--lead'>
              <h4>Research question</h4>
              <p className='medical-evidence-report__paragraph'>{panel.summary || panel.question}</p>
            </section>
          ) : null}
          {panel.report.sections.map((section, sectionIndex) => (
            <section
              key={section.id}
              className={classNames(
                'medical-evidence-report__section',
                !panel.summary && sectionIndex === 0 && 'medical-evidence-report__section--lead'
              )}
              style={{ animationDelay: `${Math.min(sectionIndex * 70, 320)}ms` }}
            >
              <h4>{section.heading}</h4>
              {section.blocks.map((block, blockIndex) => (
                <ScienceReportBlockView
                  key={`${section.id}-${blockIndex}`}
                  block={block}
                  blockIndex={blockIndex}
                  artifactsById={artifactsById}
                  evidenceById={evidenceById}
                  onOpenArtifact={openArtifact}
                />
              ))}
            </section>
          ))}
        </div>

        <section className='medical-evidence-section science-report-artifactsSection'>
          <div className='medical-evidence-section__title'>Artifacts</div>
          <ScienceArtifactList artifacts={panel.artifacts} onOpenArtifact={openArtifact} />
        </section>

        {panel.claims?.length ? (
          <section className='medical-evidence-section'>
            <div className='medical-evidence-section__title'>Claims</div>
            <div className='medical-evidence-report__checklist'>
              {panel.claims.map((claim) => (
                <div
                  key={claim.id}
                  className={`medical-evidence-report__check medical-evidence-report__check--${checklistTone(claim.status)}`}
                >
                  <span aria-hidden='true' />
                  <div>
                    <b>{claim.claimType}</b>
                    <p>{renderInlineEvidenceText(claim.text, claim.supportingEvidenceIds, evidenceById)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <ScienceSkillTrail
          skills={panel.usedSkills}
          evidenceById={evidenceById}
          artifactsById={artifactsById}
          onOpenArtifact={openArtifact}
        />

        <ScienceEvidenceChain panel={panel} evidenceById={evidenceById} artifactsById={artifactsById} />

        <section className='medical-evidence-section'>
          <div className='medical-evidence-section__title'>Reference Evidence</div>
          <div className='medical-evidence-references'>
            {references.length ? (
              references.map((evidence, index) => (
                <ScienceEvidenceReference
                  key={evidence.id}
                  evidence={evidence}
                  evidenceById={evidenceById}
                  index={index}
                  onOpenEvidence={openEvidence}
                />
              ))
            ) : (
              <div className='science-report-empty'>No evidence objects have been published yet.</div>
            )}
          </div>
        </section>

        {panel.methods ? (
          <details className='medical-evidence-methods'>
            <summary>Methods</summary>
            <div className='medical-evidence-methods__body'>
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
              {panel.methods.commands?.length ? (
                <div className='medical-evidence-methodBlock'>
                  <b>Commands</b>
                  <ul>
                    {panel.methods.commands.map((command) => (
                      <li key={command}>
                        <code>{command}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {panel.methods.environmentSummary ? (
                <div className='medical-evidence-methodBlock'>
                  <b>Environment</b>
                  <p>{panel.methods.environmentSummary}</p>
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
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
};

export const ScienceReportPanel: React.FC<{ panel: SciencePanelData }> = ({ panel }) => {
  const conversationContext = useConversationContextSafe();
  const workspace = panel.projectRoot || conversationContext?.workspace;
  const openLocalFilePreview = useLocalFilePreview(workspace);
  const { openPreview } = usePreviewContext();
  const featuredArtifacts = panel.artifacts.slice(0, 4);
  const [exportState, setExportState] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [exportNotice, setExportNotice] = useState<{ tone: 'success' | 'error'; text: string }>();
  const hasFiles = useScienceFilesAvailable(panel, workspace);

  const openReport = useCallback(() => {
    openPreview(
      '',
      'science_report',
      {
        title: panel.report.title || 'Science report',
        science: {
          panel,
          artifactId: 'report',
        },
      },
      { replace: true }
    );
  }, [openPreview, panel]);

  const openArtifact = useCallback(
    (artifact: ScienceArtifact) => {
      const filePath = getArtifactPreviewPath(artifact);
      if (!filePath) {
        openReport();
        return;
      }
      const resolvedPath = resolveSciencePreviewPath(workspace, filePath) || filePath;
      void openLocalFilePreview(
        resolvedPath,
        undefined,
        {
          title: artifact.title,
          workspace,
          science: {
            panel,
            artifactId: artifact.id,
            artifactVersion: artifact.version,
            workspaceView: true,
          },
        },
        { replace: true }
      );
    },
    [openLocalFilePreview, openReport, panel, workspace]
  );

  const openFiles = useCallback(() => {
    if (!hasFiles) return;
    openPreview(
      '',
      'science_files',
      {
        title: 'Files',
        workspace,
        science: {
          panel,
          artifactId: 'files',
        },
      },
      { replace: false }
    );
  }, [hasFiles, openPreview, panel, workspace]);

  const handleExport = useCallback(async () => {
    if (exportState === 'running') return;
    if (!workspace) {
      setExportState('failed');
      setExportNotice({ tone: 'error', text: 'Export needs a Science project workspace.' });
      return;
    }
    setExportState('running');
    setExportNotice(undefined);
    try {
      const result = await ipcBridge.scienceArtifactArchive.export.invoke({
        projectRoot: workspace,
        runId: panel.runId,
        commit: panel.git?.commit,
        exportTypes: ['manifest', 'panel', 'markdown', 'html', 'pdf', 'notebook', 'latex', 'run_bundle'],
      });
      if (!result.ok || !result.exportDir) {
        setExportState('failed');
        setExportNotice({ tone: 'error', text: result.error || 'Export failed. No export directory was returned.' });
        return;
      }
      setExportState('success');
      setExportNotice({ tone: 'success', text: `Export saved to ${result.exportDir}` });
      void ipcBridge.shell.showItemInFolder.invoke(result.exportDir);
    } catch (error) {
      setExportState('failed');
      setExportNotice({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    }
  }, [exportState, panel.git?.commit, panel.runId, workspace]);

  return (
    <section className='science-report-panel' data-testid='science-report-panel'>
      <header className='science-report-cardHeader'>
        <div>
          <span>
            <OpenScienceIcon name='scienceReport' size={14} visualScale={1.05} />
            Science report
          </span>
          <h3>{panel.report.title}</h3>
        </div>
        <div className='science-report-cardHeader__actions'>
          <button type='button' onClick={openReport}>
            <OpenScienceIcon name='scienceReport' size={14} visualScale={1.05} />
            Open report
          </button>
          {hasFiles ? (
            <button type='button' onClick={openFiles}>
              <OpenScienceIcon name='artifactDataset' size={14} visualScale={1.05} />
              Files
            </button>
          ) : null}
          <button
            type='button'
            disabled={exportState === 'running'}
            title={workspace ? 'Export Science report and artifact bundle' : 'Export needs a Science project workspace'}
            onClick={handleExport}
          >
            <OpenScienceIcon name='artifactExport' size={14} visualScale={1.05} />
            {exportState === 'running'
              ? 'Exporting'
              : exportState === 'success'
                ? 'Exported'
                : exportState === 'failed'
                  ? 'Export failed'
                  : 'Export'}
          </button>
        </div>
      </header>
      {exportNotice ? (
        <div className={`science-report-exportNotice science-report-exportNotice--${exportNotice.tone}`}>
          {exportNotice.text}
        </div>
      ) : null}
      {panel.summary || panel.question ? (
        <p className='science-report-cardSummary'>{panel.summary || panel.question}</p>
      ) : null}
      {featuredArtifacts.length ? (
        <div className='science-report-cardArtifacts'>
          {featuredArtifacts.map((artifact) => (
            <button key={`${artifact.id}-${artifact.version}`} type='button' onClick={() => openArtifact(artifact)}>
              <span>
                <OpenScienceIcon name={artifactIconName(artifact)} size={14} visualScale={1.05} />
                {artifactKindLabel(artifact)}
              </span>
              <b>{artifact.title}</b>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default ScienceReportPanel;
