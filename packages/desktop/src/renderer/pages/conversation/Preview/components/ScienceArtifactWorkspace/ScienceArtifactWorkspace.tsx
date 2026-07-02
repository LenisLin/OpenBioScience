/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ScienceArtifact,
  ScienceArtifactInspectorTab,
  ScienceEvidenceItem,
  SciencePanelData,
} from '@/common/chat/science';
import { ipcBridge } from '@/common';
import { ArrowLeft } from '@icon-park/react';
import { usePreviewContext, type PreviewTab } from '../../context/PreviewContext';
import OpenScienceIcon, { type OpenScienceIconName } from '@/renderer/components/icons/OpenScienceIcon';
import CodeEditor from '../editors/CodeEditor';
import PDFPreview from '../viewers/PDFViewer';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './science-artifact-workspace.css';

const TAB_LABELS: Record<ScienceArtifactInspectorTab, string> = {
  overview: 'Overview',
  inputs: 'Inputs',
  code: 'Code',
  execution_log: 'Execution Log',
  messages: 'Messages',
  environment: 'Environment',
  history: 'History',
  review: 'Review',
};

const DETAIL_LABELS: Record<ScienceArtifactInspectorTab, string> = {
  ...TAB_LABELS,
  overview: 'Details',
};

const DEFAULT_TABS: ScienceArtifactInspectorTab[] = [
  'overview',
  'inputs',
  'code',
  'execution_log',
  'messages',
  'environment',
  'history',
];

const TAB_ICONS: Record<ScienceArtifactInspectorTab, OpenScienceIconName> = {
  overview: 'artifact',
  inputs: 'artifactInputs',
  code: 'artifactCode',
  execution_log: 'artifactLog',
  messages: 'artifactMessages',
  environment: 'artifactEnvironment',
  history: 'artifactVersion',
  review: 'artifactReview',
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

const getArtifactIconName = (artifact?: ScienceArtifact): OpenScienceIconName =>
  artifact ? ARTIFACT_TYPE_ICONS[artifact.type] || 'artifact' : 'artifact';

const pathLabel = (value?: string): string => {
  if (!value) return '';
  const normalized = value.replace(/\\/g, '/');
  return normalized.split('/').pop() || value;
};

const isPdfPath = (value?: string): boolean => Boolean(value && /\.pdf(?:$|\?)/iu.test(value));
const isTexPath = (value?: string): boolean => Boolean(value && /\.(tex|bib|sty|cls)(?:$|\?)/iu.test(value));
const isImagePath = (value?: string): boolean =>
  Boolean(value && /\.(png|jpe?g|webp|gif|svg|tiff?|bmp|avif)(?:$|\?)/iu.test(value));

const getArtifactPath = (artifact?: ScienceArtifact): string | undefined =>
  artifact?.previewPath || artifact?.primaryPath || artifact?.thumbnailPath || artifact?.outputPaths?.[0];

const findArtifact = (
  artifacts: ScienceArtifact[],
  artifactId?: string,
  artifactVersion?: number
): ScienceArtifact | undefined => {
  if (!artifactId) return undefined;
  return (
    artifacts.find((artifact) => artifact.id === artifactId && artifact.version === artifactVersion) ||
    artifacts.find((artifact) => artifact.id === artifactId)
  );
};

const inspectorTabsForArtifact = (artifact: ScienceArtifact): ScienceArtifactInspectorTab[] => {
  if (artifact.availableTabs?.length) return artifact.availableTabs;
  return artifact.reviewStatus && artifact.reviewStatus !== 'not_reviewed' ? [...DEFAULT_TABS, 'review'] : DEFAULT_TABS;
};

const getArtifactPdfPath = (artifact?: ScienceArtifact): string | undefined =>
  artifact?.outputPaths?.find(isPdfPath) ||
  (isPdfPath(artifact?.previewPath) ? artifact?.previewPath : undefined) ||
  (isPdfPath(artifact?.primaryPath) ? artifact?.primaryPath : undefined);

const isLatexArtifact = (artifact?: ScienceArtifact, tab?: PreviewTab | null): boolean =>
  Boolean(
    artifact?.type === 'latex' ||
    artifact?.type === 'manuscript' ||
    artifact?.code?.language === 'latex' ||
    isTexPath(artifact?.primaryPath) ||
    isTexPath(artifact?.code?.path) ||
    isTexPath(tab?.metadata?.file_path) ||
    isTexPath(tab?.metadata?.file_name)
  );

const isImageArtifact = (artifact?: ScienceArtifact, tab?: PreviewTab | null): boolean =>
  Boolean(artifact?.type === 'figure' || isImagePath(getArtifactPath(artifact)) || tab?.content_type === 'image');

type AnnotationRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const AnnotationOverlay: React.FC<{
  artifact: ScienceArtifact;
  children: React.ReactNode;
  filePath?: string;
  enabled: boolean;
}> = ({ artifact, children, filePath, enabled }) => {
  const { addToSendBox } = usePreviewContext();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [annotating, setAnnotating] = useState(false);
  const [draftRect, setDraftRect] = useState<AnnotationRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [comment, setComment] = useState('');

  const pointFromEvent = useCallback((event: React.PointerEvent): { x: number; y: number } | null => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      const point = pointFromEvent(event);
      if (!point) return;
      setDragStart(point);
      setDraftRect({ x: point.x, y: point.y, width: 0.001, height: 0.001 });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pointFromEvent]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragStart) return;
      const point = pointFromEvent(event);
      if (!point) return;
      setDraftRect({
        x: Math.min(dragStart.x, point.x),
        y: Math.min(dragStart.y, point.y),
        width: Math.max(0.001, Math.abs(point.x - dragStart.x)),
        height: Math.max(0.001, Math.abs(point.y - dragStart.y)),
      });
    },
    [dragStart, pointFromEvent]
  );

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    setDragStart(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!draftRect || !comment.trim()) return;
    const prompt = [
      '请根据这个科学研究 artifact 批注修改结果。',
      '不要只编辑图片表面；优先回到生成该 artifact 的代码、LaTeX、Markdown 或 notebook 中修改，并重新运行生成新版本。',
      `artifactId=${artifact.id}`,
      `version=${artifact.version}`,
      `file=${filePath || artifact.primaryPath || artifact.previewPath || ''}`,
      `region=normalized(x=${draftRect.x.toFixed(4)}, y=${draftRect.y.toFixed(4)}, w=${draftRect.width.toFixed(4)}, h=${draftRect.height.toFixed(4)})`,
      `comment=${comment.trim()}`,
      '完成后请发布新版本，并保留旧版本的 source trail、输入、代码和运行记录。',
    ].join('\n');
    addToSendBox(prompt);
    setComment('');
    setAnnotating(false);
  }, [addToSendBox, artifact, comment, draftRect, filePath]);

  const handleToggle = useCallback(() => {
    setAnnotating((value) => {
      const next = !value;
      if (!next) {
        setDraftRect(null);
        setDragStart(null);
        setComment('');
      }
      return next;
    });
  }, []);

  return (
    <div className='science-preview-surface'>
      <div className='science-preview-surface__content'>{children}</div>
      {enabled ? (
        <button
          type='button'
          className={classNames('science-preview-surface__annotateButton', annotating && 'is-active')}
          onClick={handleToggle}
        >
          {annotating ? 'Cancel annotation' : 'Annotate'}
        </button>
      ) : null}
      {enabled && annotating ? (
        <div
          ref={surfaceRef}
          className='science-preview-annotation-layer'
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {draftRect ? (
            <span
              className='science-preview-annotation-layer__rect'
              style={{
                left: `${draftRect.x * 100}%`,
                top: `${draftRect.y * 100}%`,
                width: `${draftRect.width * 100}%`,
                height: `${draftRect.height * 100}%`,
              }}
            />
          ) : null}
          <div
            className='science-preview-annotation-layer__composer'
            onPointerDown={(event) => event.stopPropagation()}
          >
            <input
              value={comment}
              placeholder='Describe what should change...'
              onChange={(event) => setComment(event.target.value)}
            />
            <button type='button' disabled={!draftRect || !comment.trim()} onClick={handleSubmit}>
              Send
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const LatexWorkspacePane: React.FC<{
  artifact: ScienceArtifact;
  activeTab: PreviewTab;
  onContentChange: (value: string) => void;
  onOpenFile: (path: string) => void;
}> = ({ artifact, activeTab, onContentChange, onOpenFile }) => {
  const { addToSendBox } = usePreviewContext();
  const pdfPath = getArtifactPdfPath(artifact);
  const sourcePath = activeTab.metadata?.file_path || artifact.code?.path || artifact.primaryPath;
  const [compiledPdfPath, setCompiledPdfPath] = useState<string | undefined>(pdfPath);
  const [compileState, setCompileState] = useState<{
    status: 'idle' | 'running' | 'success' | 'failed';
    command?: string;
    logPath?: string;
    message?: string;
    logPreview?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    setCompiledPdfPath(pdfPath);
    setCompileState({ status: 'idle' });
  }, [artifact.id, artifact.version, pdfPath]);

  const handleCompile = useCallback(async () => {
    if (!sourcePath) {
      setCompileState({
        status: 'failed',
        message: 'No .tex source path is recorded for this artifact.',
      });
      return;
    }

    setCompileState({ status: 'running', message: 'Compiling LaTeX...' });
    try {
      const result = await ipcBridge.scienceLatex.compile.invoke({
        sourcePath,
        sourceContent: activeTab.content,
        workspace: activeTab.metadata?.workspace || artifact.execution?.cwd,
        timeoutMs: 120_000,
      });
      if (result.pdfPath) {
        setCompiledPdfPath(result.pdfPath);
      }
      setCompileState({
        status: result.ok ? 'success' : 'failed',
        command: result.command,
        logPath: result.logPath,
        message: result.ok
          ? `Compiled ${pathLabel(result.pdfPath)} in ${(result.durationMs / 1000).toFixed(1)}s.`
          : result.error || 'LaTeX compile failed.',
        logPreview: (result.stderr || result.stdout || '').trim(),
      });
    } catch (error) {
      setCompileState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [activeTab.content, activeTab.metadata?.workspace, artifact.execution?.cwd, sourcePath]);

  const handleCompileRequest = useCallback(() => {
    const prompt = [
      '请检查并修复这个 LaTeX Science artifact 的编译问题，然后把结果作为新版本登记。',
      `artifactId=${artifact.id}`,
      `version=${artifact.version}`,
      `source=${sourcePath || ''}`,
      compiledPdfPath ? `currentPdf=${compiledPdfPath}` : 'currentPdf=not_recorded',
      artifact.execution?.logPath ? `currentLog=${artifact.execution.logPath}` : 'currentLog=not_recorded',
      compileState.command ? `lastCommand=${compileState.command}` : 'lastCommand=not_recorded',
      compileState.logPath ? `lastLog=${compileState.logPath}` : 'lastLog=not_recorded',
      '请优先使用 latexmk；如果不可用，再按 pdflatex/xelatex + bibtex/biber 的项目实际需求执行。',
      '完成后请记录 source、compiled PDF、log、environment 和 source trail。',
    ].join('\n');
    addToSendBox(prompt);
  }, [addToSendBox, artifact, compiledPdfPath, compileState.command, compileState.logPath, sourcePath]);

  return (
    <div className='science-latex-pane'>
      <div className='science-latex-pane__editor'>
        <div className='science-latex-pane__bar'>
          <span>{pathLabel(sourcePath) || 'LaTeX source'}</span>
          <button type='button' disabled={compileState.status === 'running'} onClick={handleCompile}>
            {compileState.status === 'running' ? 'Compiling...' : 'Compile PDF'}
          </button>
        </div>
        <CodeEditor
          value={activeTab.content}
          onChange={onContentChange}
          language='latex'
          fileName={activeTab.metadata?.file_name || pathLabel(sourcePath)}
          readOnly={activeTab.metadata?.editable === false}
        />
        {compileState.status !== 'idle' ? (
          <div className={classNames('science-latex-pane__compileLog', `is-${compileState.status}`)}>
            <div>
              <b>{compileState.message}</b>
              <span>{compileState.command}</span>
            </div>
            {compileState.logPreview ? <pre>{compileState.logPreview}</pre> : null}
            <div className='science-latex-pane__compileActions'>
              {compileState.logPath ? (
                <button type='button' onClick={() => onOpenFile(compileState.logPath!)}>
                  Open log
                </button>
              ) : null}
              {compileState.status === 'failed' ? (
                <button type='button' onClick={handleCompileRequest}>
                  Ask Agent
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className='science-latex-pane__pdf'>
        <div className='science-latex-pane__bar'>
          <span>{compiledPdfPath ? pathLabel(compiledPdfPath) : 'Compiled PDF'}</span>
        </div>
        {compiledPdfPath ? (
          <PDFPreview file_path={compiledPdfPath} hideToolbar />
        ) : (
          <div className='science-latex-pane__empty'>
            <b>No compiled PDF recorded</b>
            <span>Compile the source to preview the rendered manuscript here.</span>
          </div>
        )}
      </div>
    </div>
  );
};

const InspectorPane: React.FC<{
  artifact: ScienceArtifact;
  evidenceById: Map<string, ScienceEvidenceItem>;
  onOpenFile: (path: string) => void;
  onOpenFiles: () => void;
  reportTitle?: string;
  projectRoot?: string;
  gitRef?: SciencePanelData['git'];
}> = ({ artifact, evidenceById, onOpenFile, onOpenFiles, reportTitle, projectRoot, gitRef }) => {
  const availableTabs = inspectorTabsForArtifact(artifact);
  const [activeTab, setActiveTab] = useState<ScienceArtifactInspectorTab | null>(
    artifact.defaultInspectorTab &&
      artifact.defaultInspectorTab !== 'overview' &&
      availableTabs.includes(artifact.defaultInspectorTab)
      ? artifact.defaultInspectorTab
      : null
  );
  const [historyState, setHistoryState] = useState<{
    loading: boolean;
    error?: string;
    items: Array<{
      commit: string;
      shortCommit: string;
      subject: string;
      authoredAt?: string;
      changedFiles: string[];
    }>;
  }>({ loading: false, items: [] });
  useEffect(() => {
    const nextTabs = inspectorTabsForArtifact(artifact);
    setActiveTab(
      artifact.defaultInspectorTab &&
        artifact.defaultInspectorTab !== 'overview' &&
        nextTabs.includes(artifact.defaultInspectorTab)
        ? artifact.defaultInspectorTab
        : null
    );
  }, [artifact.id, artifact.version]);

  useEffect(() => {
    if (activeTab !== 'history' || !projectRoot) return;
    let cancelled = false;
    setHistoryState((current) => ({ ...current, loading: true, error: undefined }));
    ipcBridge.scienceArtifactArchive.history
      .invoke({
        projectRoot,
        runId: artifact.runId,
        artifactId: artifact.id,
        artifactVersion: artifact.version,
        limit: 12,
      })
      .then((result) => {
        if (cancelled) return;
        setHistoryState({
          loading: false,
          error: result.ok ? undefined : result.error || 'History is unavailable.',
          items: result.items || [],
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setHistoryState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          items: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, artifact.id, artifact.runId, artifact.version, projectRoot]);

  const inputs: Array<{ label: string; path?: string; evidenceId?: string }> = [
    ...(artifact.inputPaths || []).map((path) => ({ label: pathLabel(path), path })),
    ...(artifact.inputs || []).map((input) => ({
      label: input.label || pathLabel(input.path) || input.artifactId || input.evidenceId || 'input',
      path: input.path,
      evidenceId: input.evidenceId,
    })),
  ];
  const linkedEvidenceIds = Array.from(
    new Set([...(artifact.evidenceIds || []), ...inputs.map((input) => input.evidenceId).filter(Boolean)])
  ) as string[];
  const linkedEvidence = linkedEvidenceIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is ScienceEvidenceItem => Boolean(item));
  const currentGit = artifact.git || gitRef;
  const currentGitFiles = currentGit?.files || [];
  const gitFileStats = currentGitFiles.reduce(
    (acc, file) => {
      acc.total += 1;
      acc[file.mode] += 1;
      return acc;
    },
    { total: 0, copied: 0, pointer: 0, missing: 0, ignored: 0 }
  );
  const currentSnapshotPanelPath = currentGit?.runPath
    ? `${currentGit.runPath.replace(/\/$/u, '')}/panel.json`
    : currentGit?.repoPath && currentGit.snapshotPath
      ? `${currentGit.repoPath.replace(/\/$/u, '')}/${currentGit.snapshotPath.replace(/^\/|\/$/gu, '')}/panel.json`
      : undefined;
  const artifactPath = getArtifactPath(artifact);
  const relatedMessagesCount = (artifact.relatedMessageIds || []).length + (artifact.relatedToolCallIds || []).length;
  const detailItems: Array<{
    tab: ScienceArtifactInspectorTab;
    icon: OpenScienceIconName;
    label: string;
  }> = availableTabs.map((tab) => ({
    tab,
    icon: TAB_ICONS[tab],
    label: tab === 'execution_log' ? 'Run Log' : DETAIL_LABELS[tab],
  }));

  const renderHistoryPage = () => (
    <div className='science-workspace-historyPage'>
      {currentGit?.shortCommit || currentGit?.status ? (
        <section className='science-workspace-historyHero'>
          <div className='science-workspace-historyHero__copy'>
            <span>current snapshot</span>
            <b>{currentGit.shortCommit || currentGit.status}</b>
            {currentGit.commit ? <code>{currentGit.commit}</code> : null}
          </div>
          <div className='science-workspace-historyHero__stats'>
            <span>{gitFileStats.total} files</span>
            <span>{gitFileStats.copied} archived</span>
            <span>{gitFileStats.pointer} pointers</span>
            {gitFileStats.missing ? <span className='is-warning'>{gitFileStats.missing} missing</span> : null}
          </div>
          {currentSnapshotPanelPath ? (
            <button type='button' onClick={() => onOpenFile(currentSnapshotPanelPath)}>
              Open panel.json
            </button>
          ) : null}
        </section>
      ) : null}

      {currentGitFiles.length ? (
        <section className='science-workspace-historyFiles'>
          <div className='science-workspace-historyFiles__title'>Snapshot files</div>
          {currentGitFiles.slice(0, 8).map((file) => (
            <button
              key={`${file.path}-${file.mode}`}
              type='button'
              className='science-workspace-historyFiles__row'
              onClick={() => file.storedPath && onOpenFile(file.storedPath)}
              disabled={!file.storedPath}
            >
              <span>{file.relativePath || file.path}</span>
              <b className={`is-${file.mode}`}>{file.mode}</b>
            </button>
          ))}
          {currentGitFiles.length > 8 ? (
            <div className='science-workspace-historyFiles__more'>+{currentGitFiles.length - 8} more files</div>
          ) : null}
        </section>
      ) : null}

      <section className='science-workspace-historyTimeline'>
        <div className='science-workspace-historyTimeline__title'>Git timeline</div>
        {historyState.loading ? <span className='science-workspace-muted'>Loading artifact history...</span> : null}
        {historyState.error ? <span className='science-workspace-muted'>{historyState.error}</span> : null}
        {!historyState.loading && !historyState.error && !historyState.items.length ? (
          <span className='science-workspace-muted'>No git history has been recorded for this artifact yet.</span>
        ) : null}
        {historyState.items.map((item) => (
          <article key={item.commit} className='science-workspace-history__item'>
            <div>
              <span className='science-workspace-history__dot' aria-hidden='true' />
              <b>{item.subject || 'Science artifact snapshot'}</b>
              <code>{item.shortCommit}</code>
            </div>
            {item.authoredAt ? <span>{new Date(item.authoredAt).toLocaleString()}</span> : null}
            {item.changedFiles.length ? (
              <details>
                <summary>
                  {item.changedFiles.length} changed file{item.changedFiles.length === 1 ? '' : 's'}
                </summary>
                <ul>
                  {item.changedFiles.slice(0, 12).map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );

  const renderDetailPage = () => {
    if (activeTab === 'history') return renderHistoryPage();

    return (
      <>
        {activeTab === 'overview' ? (
          <div className='science-workspace-kv'>
            <span>ID</span>
            <code>{artifact.id}</code>
            <span>Version</span>
            <b>v{artifact.version}</b>
            <span>Status</span>
            <b>{artifact.status || 'available'}</b>
            <span>Hash</span>
            <code>{artifact.contentHash || 'not recorded'}</code>
            <span>Report</span>
            <b>{reportTitle || 'not recorded'}</b>
            {artifact.viewer ? (
              <>
                <span>Viewer</span>
                <b>{artifact.viewer.kind || 'auto'}</b>
                <span>Format</span>
                <b>{artifact.viewer.format || 'auto'}</b>
                <span>View</span>
                <b>
                  {artifact.viewer.representation || 'auto'} · {artifact.viewer.colorBy || 'auto'}
                </b>
              </>
            ) : null}
            <span>Primary</span>
            <button
              type='button'
              disabled={!artifact.primaryPath}
              onClick={() => artifact.primaryPath && onOpenFile(artifact.primaryPath)}
            >
              {pathLabel(artifact.primaryPath) || 'none'}
            </button>
            <span>Evidence</span>
            <div className='science-workspace-evidenceLinks'>
              {linkedEvidence.length ? (
                linkedEvidence.map((evidence) => (
                  <button
                    key={evidence.id}
                    type='button'
                    disabled={!evidence.path}
                    onClick={() => evidence.path && onOpenFile(evidence.path)}
                    title={evidence.summary || evidence.title}
                  >
                    {evidence.id}
                  </button>
                ))
              ) : (
                <em>not recorded</em>
              )}
            </div>
          </div>
        ) : null}
        {activeTab === 'inputs' ? (
          <div className='science-workspace-list'>
            {inputs.length ? (
              inputs.map((input, index) => (
                <div key={`${input.label}-${index}`} className='science-workspace-list__row'>
                  <b>{input.label}</b>
                  {input.evidenceId ? (
                    <span>{evidenceById.get(input.evidenceId)?.title || input.evidenceId}</span>
                  ) : null}
                  {input.path ? (
                    <button type='button' onClick={() => onOpenFile(input.path!)}>
                      Open
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              <span className='science-workspace-muted'>No inputs recorded.</span>
            )}
          </div>
        ) : null}
        {activeTab === 'code' ? (
          <div className='science-workspace-codeBlock'>
            <div>
              <span>{artifact.code?.language || 'code'}</span>
              {artifact.code?.path ? (
                <button type='button' onClick={() => onOpenFile(artifact.code!.path!)}>
                  {pathLabel(artifact.code.path)}
                </button>
              ) : null}
            </div>
            <pre>{artifact.code?.entrypoint || artifact.execution?.scriptPath || 'No code path recorded.'}</pre>
          </div>
        ) : null}
        {activeTab === 'execution_log' ? (
          <div className='science-workspace-codeBlock'>
            <div>
              <span>exit {artifact.execution?.exitCode ?? 'unknown'}</span>
              {artifact.execution?.logPath ? (
                <button type='button' onClick={() => onOpenFile(artifact.execution!.logPath!)}>
                  {pathLabel(artifact.execution.logPath)}
                </button>
              ) : null}
            </div>
            <pre>
              {artifact.execution?.stdoutPreview ||
                artifact.execution?.stderrPreview ||
                artifact.execution?.command ||
                'No execution log recorded.'}
            </pre>
          </div>
        ) : null}
        {activeTab === 'messages' ? (
          <div className='science-workspace-list'>
            {relatedMessagesCount ? (
              [...(artifact.relatedMessageIds || []), ...(artifact.relatedToolCallIds || [])].map((id) => (
                <div key={id} className='science-workspace-list__row'>
                  <b>{id}</b>
                </div>
              ))
            ) : (
              <span className='science-workspace-muted'>No related messages recorded.</span>
            )}
          </div>
        ) : null}
        {activeTab === 'environment' ? (
          <div className='science-workspace-codeBlock'>
            <pre>{JSON.stringify(artifact.environment || { status: 'not recorded' }, null, 2)}</pre>
          </div>
        ) : null}
        {activeTab === 'review' ? (
          <div className='science-workspace-review'>
            <b>{artifact.reviewStatus || 'not_reviewed'}</b>
            <span>Reviewer details are recorded as evidence or source trail notes in later milestones.</span>
          </div>
        ) : null}
      </>
    );
  };

  if (activeTab) {
    return (
      <aside className='science-workspace-inspector science-workspace-inspector--tertiary'>
        <header className='science-workspace-tertiaryHeader'>
          <button type='button' className='science-workspace-tertiaryHeader__back' onClick={() => setActiveTab(null)}>
            <ArrowLeft theme='outline' size={13} fill='currentColor' strokeWidth={4} />
            Back
          </button>
          <span>
            <OpenScienceIcon name={TAB_ICONS[activeTab]} size={14} visualScale={1.05} />
            Artifact Inspector / {DETAIL_LABELS[activeTab]}
          </span>
          <h3>{artifact.title}</h3>
        </header>
        <div className='science-workspace-inspector__body'>{renderDetailPage()}</div>
      </aside>
    );
  }

  return (
    <aside className='science-workspace-inspector'>
      <header>
        <div className='science-workspace-inspector__headerCopy'>
          <span>
            <OpenScienceIcon name={getArtifactIconName(artifact)} size={14} visualScale={1.08} />
            Artifact Inspector
          </span>
          <h3>{artifact.title}</h3>
        </div>
        <div className='science-workspace-inspector__actions'>
          <button
            type='button'
            className='science-workspace-inspector__historyFab'
            onClick={onOpenFiles}
            aria-label='Open Science files'
            title='Open Science files'
          >
            <OpenScienceIcon name='artifactDataset' size={15} visualScale={1.05} />
            <span>Files</span>
          </button>
        </div>
      </header>
      <div className='science-workspace-inspector__body'>
        <div className='science-workspace-compact'>
          <section className='science-workspace-compactHero'>
            <OpenScienceIcon name={getArtifactIconName(artifact)} size={34} visualScale={1.08} />
            <div>
              <span>{artifact.type.replace(/_/gu, ' ')}</span>
              <b>v{artifact.version}</b>
              <em>{artifact.status || 'available'}</em>
            </div>
          </section>
          <div className='science-workspace-quickActions'>
            <button
              type='button'
              disabled={!artifactPath}
              onClick={() => artifactPath && onOpenFile(artifactPath)}
            >
              <OpenScienceIcon name={getArtifactIconName(artifact)} size={15} visualScale={1.05} />
              <span>{artifactPath ? pathLabel(artifactPath) : 'No preview file'}</span>
            </button>
            <button type='button' onClick={() => setActiveTab('overview')}>
              <OpenScienceIcon name='artifact' size={15} visualScale={1.05} />
              <span>Open details</span>
            </button>
          </div>
          <div className='science-workspace-detailMenu'>
            {detailItems.map((item) => (
              <button key={item.tab} type='button' onClick={() => setActiveTab(item.tab)}>
                <OpenScienceIcon name={item.icon} size={16} visualScale={1.05} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

export interface ScienceArtifactWorkspaceProps {
  panel: SciencePanelData;
  activeTab: PreviewTab;
  previewContent: React.ReactNode;
  onOpenFile: (path: string) => void;
  onContentChange: (value: string) => void;
}

const ScienceArtifactWorkspace: React.FC<ScienceArtifactWorkspaceProps> = ({
  panel,
  activeTab,
  previewContent,
  onOpenFile,
  onContentChange,
}) => {
  const { openPreview } = usePreviewContext();
  const evidenceById = useMemo(
    () => new Map(panel.evidence.map((evidence) => [evidence.id, evidence])),
    [panel.evidence]
  );
  const metadataArtifactId = activeTab.metadata?.science?.artifactId;
  const metadataArtifactVersion = activeTab.metadata?.science?.artifactVersion;
  const selectedArtifact =
    findArtifact(panel.artifacts, metadataArtifactId, metadataArtifactVersion) ||
    panel.artifacts.find((artifact) => getArtifactPath(artifact) === activeTab.metadata?.file_path) ||
    panel.artifacts[0];

  const openFiles = useCallback(() => {
    openPreview(
      '',
      'science_files',
      {
        title: 'Files',
        workspace: activeTab.metadata?.workspace || panel.projectRoot,
        science: {
          panel,
          artifactId: 'files',
        },
      },
      { replace: false }
    );
  }, [activeTab.metadata?.workspace, openPreview, panel]);

  if (!selectedArtifact) {
    return <div className='science-workspace-empty'>No Science artifact is available for this preview.</div>;
  }

  const renderPreview = () => {
    if (isLatexArtifact(selectedArtifact, activeTab)) {
      return (
        <LatexWorkspacePane
          artifact={selectedArtifact}
          activeTab={activeTab}
          onContentChange={onContentChange}
          onOpenFile={onOpenFile}
        />
      );
    }

    return (
      <AnnotationOverlay
        artifact={selectedArtifact}
        enabled={isImageArtifact(selectedArtifact, activeTab)}
        filePath={activeTab.metadata?.file_path || getArtifactPath(selectedArtifact)}
      >
        <div className='science-workspace-preview__standard'>{previewContent}</div>
      </AnnotationOverlay>
    );
  };

  return (
    <section className='science-artifact-layer' data-testid='science-artifact-workspace'>
      <div className='science-artifact-layer__content'>
        <main className='science-artifact-layer__viewer'>{renderPreview()}</main>
        <InspectorPane
          artifact={selectedArtifact}
          evidenceById={evidenceById}
          onOpenFile={onOpenFile}
          onOpenFiles={openFiles}
          reportTitle={panel.report.title}
          projectRoot={panel.projectRoot}
          gitRef={panel.git}
        />
      </div>
    </section>
  );
};

export default ScienceArtifactWorkspace;
