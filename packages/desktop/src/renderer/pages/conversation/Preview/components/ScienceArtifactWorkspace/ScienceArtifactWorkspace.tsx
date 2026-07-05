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
import { Dropdown, Menu, Modal } from '@arco-design/web-react';
import { ArrowLeft, MoreOne } from '@icon-park/react';
import { usePreviewContext, type PreviewTab } from '../../context/PreviewContext';
import OpenScienceIcon, { type OpenScienceIconName } from '@/renderer/components/icons/OpenScienceIcon';
import CodeEditor from '../editors/CodeEditor';
import PDFPreview from '../viewers/PDFViewer';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { uploadFileViaHttp } from '@/renderer/services/FileService';
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

const initialInspectorTab = (
  artifact: ScienceArtifact,
  availableTabs: ScienceArtifactInspectorTab[],
  variant: 'inline' | 'modal'
): ScienceArtifactInspectorTab | null => {
  if (variant === 'modal') return 'overview';
  return artifact.defaultInspectorTab &&
    artifact.defaultInspectorTab !== 'overview' &&
    availableTabs.includes(artifact.defaultInspectorTab)
    ? artifact.defaultInspectorTab
    : null;
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

type ImageAnnotationRect = AnnotationRect & {
  pixelX: number;
  pixelY: number;
  pixelWidth: number;
  pixelHeight: number;
  naturalWidth: number;
  naturalHeight: number;
};

type RenderedImageBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const formatNormalizedRect = (rect: AnnotationRect): string =>
  `normalized(x=${rect.x.toFixed(4)}, y=${rect.y.toFixed(4)}, w=${rect.width.toFixed(4)}, h=${rect.height.toFixed(4)})`;

const formatImageRect = (rect: ImageAnnotationRect): string =>
  [
    formatNormalizedRect(rect),
    `pixels(x=${rect.pixelX}, y=${rect.pixelY}, w=${rect.pixelWidth}, h=${rect.pixelHeight})`,
    `naturalSize=${rect.naturalWidth}x${rect.naturalHeight}`,
  ].join(', ');

const sanitizeFileSegment = (value?: string): string => {
  const label = pathLabel(value) || 'annotation';
  return (
    label
      .replace(/[^\w.-]+/gu, '_')
      .replace(/^_+|_+$/gu, '')
      .slice(0, 72) || 'annotation'
  );
};

const findRenderedImage = (surface: HTMLDivElement | null): HTMLImageElement | null =>
  surface?.closest('.science-preview-surface')?.querySelector('img') || null;

const getRenderedImageBox = (image: HTMLImageElement): RenderedImageBox | null => {
  const elementRect = image.getBoundingClientRect();
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (elementRect.width <= 0 || elementRect.height <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return null;

  const renderedScale = Math.min(elementRect.width / naturalWidth, elementRect.height / naturalHeight);
  const renderedWidth = naturalWidth * renderedScale;
  const renderedHeight = naturalHeight * renderedScale;
  return {
    left: elementRect.left + (elementRect.width - renderedWidth) / 2,
    top: elementRect.top + (elementRect.height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
    naturalWidth,
    naturalHeight,
  };
};

const imageRectFromSurfaceRect = (
  surfaceRect: AnnotationRect,
  surfaceBounds: DOMRect,
  imageBox: RenderedImageBox
): ImageAnnotationRect | null => {
  const absoluteLeft = surfaceBounds.left + surfaceRect.x * surfaceBounds.width;
  const absoluteTop = surfaceBounds.top + surfaceRect.y * surfaceBounds.height;
  const absoluteRight = absoluteLeft + surfaceRect.width * surfaceBounds.width;
  const absoluteBottom = absoluteTop + surfaceRect.height * surfaceBounds.height;

  const clippedLeft = clamp(absoluteLeft, imageBox.left, imageBox.left + imageBox.width);
  const clippedTop = clamp(absoluteTop, imageBox.top, imageBox.top + imageBox.height);
  const clippedRight = clamp(absoluteRight, imageBox.left, imageBox.left + imageBox.width);
  const clippedBottom = clamp(absoluteBottom, imageBox.top, imageBox.top + imageBox.height);
  if (clippedRight - clippedLeft < 2 || clippedBottom - clippedTop < 2) return null;

  const x = clamp((clippedLeft - imageBox.left) / imageBox.width, 0, 1);
  const y = clamp((clippedTop - imageBox.top) / imageBox.height, 0, 1);
  const width = clamp((clippedRight - clippedLeft) / imageBox.width, 0, 1 - x);
  const height = clamp((clippedBottom - clippedTop) / imageBox.height, 0, 1 - y);
  const pixelX = clamp(Math.floor(x * imageBox.naturalWidth), 0, imageBox.naturalWidth - 1);
  const pixelY = clamp(Math.floor(y * imageBox.naturalHeight), 0, imageBox.naturalHeight - 1);
  const pixelRight = clamp(Math.ceil((x + width) * imageBox.naturalWidth), pixelX + 1, imageBox.naturalWidth);
  const pixelBottom = clamp(Math.ceil((y + height) * imageBox.naturalHeight), pixelY + 1, imageBox.naturalHeight);

  return {
    x,
    y,
    width,
    height,
    pixelX,
    pixelY,
    pixelWidth: pixelRight - pixelX,
    pixelHeight: pixelBottom - pixelY,
    naturalWidth: imageBox.naturalWidth,
    naturalHeight: imageBox.naturalHeight,
  };
};

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create the annotated PNG.'));
      }
    }, 'image/png');
  });

const makeAnnotatedImage = async (image: HTMLImageElement, imageRect: ImageAnnotationRect): Promise<Blob> => {
  if (!image.complete) {
    await image.decode().catch((): undefined => undefined);
  }

  const canvas = document.createElement('canvas');
  canvas.width = imageRect.naturalWidth;
  canvas.height = imageRect.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this preview.');

  context.drawImage(image, 0, 0, imageRect.naturalWidth, imageRect.naturalHeight);
  const redWidth = Math.max(8, Math.round(Math.min(imageRect.naturalWidth, imageRect.naturalHeight) * 0.012));
  const haloWidth = redWidth + Math.max(3, Math.round(redWidth * 0.45));
  const inset = redWidth / 2;
  const x = clamp(imageRect.pixelX + inset, inset, imageRect.naturalWidth - inset);
  const y = clamp(imageRect.pixelY + inset, inset, imageRect.naturalHeight - inset);
  const width = Math.max(1, Math.min(imageRect.pixelWidth - redWidth, imageRect.naturalWidth - x - inset));
  const height = Math.max(1, Math.min(imageRect.pixelHeight - redWidth, imageRect.naturalHeight - y - inset));

  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  context.lineWidth = haloWidth;
  context.strokeRect(x, y, width, height);
  context.strokeStyle = '#e11919';
  context.lineWidth = redWidth;
  context.strokeRect(x, y, width, height);

  return canvasToPngBlob(canvas);
};

const AnnotationOverlay: React.FC<{
  artifact: ScienceArtifact;
  children: React.ReactNode;
  conversationId?: string;
  filePath?: string;
  enabled: boolean;
  projectRoot?: string;
  runId?: string;
}> = ({ artifact, children, conversationId, filePath, enabled, projectRoot, runId }) => {
  const { addToSendBox } = usePreviewContext();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [annotating, setAnnotating] = useState(false);
  const [draftRect, setDraftRect] = useState<AnnotationRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pointFromEvent = useCallback((event: React.PointerEvent): { x: number; y: number } | null => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (submitting) return;
      const point = pointFromEvent(event);
      if (!point) return;
      setSubmitError(null);
      setDragStart(point);
      setDraftRect({ x: point.x, y: point.y, width: 0.001, height: 0.001 });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pointFromEvent, submitting]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragStart || submitting) return;
      const point = pointFromEvent(event);
      if (!point) return;
      setDraftRect({
        x: Math.min(dragStart.x, point.x),
        y: Math.min(dragStart.y, point.y),
        width: Math.max(0.001, Math.abs(point.x - dragStart.x)),
        height: Math.max(0.001, Math.abs(point.y - dragStart.y)),
      });
    },
    [dragStart, pointFromEvent, submitting]
  );

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    setDragStart(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!draftRect || !comment.trim()) return;
    const surface = surfaceRef.current;
    const image = findRenderedImage(surface);
    const surfaceBounds = surface?.getBoundingClientRect();
    const imageBox = image ? getRenderedImageBox(image) : null;
    const imageRect = surfaceBounds && imageBox ? imageRectFromSurfaceRect(draftRect, surfaceBounds, imageBox) : null;

    if (!image || !surfaceBounds || !imageBox || !imageRect) {
      setSubmitError('Please draw the box on the visible image area.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const blob = await makeAnnotatedImage(image, imageRect);
      const baseName = sanitizeFileSegment(filePath || artifact.primaryPath || artifact.previewPath || artifact.id);
      const fileName = `${baseName.replace(/\.[^.]+$/u, '')}-annotation-v${artifact.version}-${Date.now()}.png`;
      const annotatedImagePath = await uploadFileViaHttp(
        new File([blob], fileName, { type: 'image/png' }),
        conversationId,
        undefined,
        fileName
      );
      const prompt = [
        '请根据这个 Science artifact 图片批注修改结果。',
        '请先调用 science_artifact(action="annotate") 登记这条用户批注；region 使用下面的 imageRegion，metadata 里记录 annotatedImagePath、surfaceRegion、pixelRegion 和 comment。',
        '不要只编辑这张标注图；请优先回到生成该 artifact 的代码、LaTeX、Markdown 或 notebook 中修改，并重新运行生成新版本。',
        projectRoot ? `projectRoot=${projectRoot}` : 'projectRoot=not_recorded',
        runId ? `runId=${runId}` : 'runId=not_recorded',
        `artifactId=${artifact.id}`,
        `version=${artifact.version}`,
        `file=${filePath || artifact.primaryPath || artifact.previewPath || ''}`,
        `annotatedImagePath=${annotatedImagePath}`,
        `surfaceRegion=${formatNormalizedRect(draftRect)}`,
        `imageRegion=${formatImageRect(imageRect)}`,
        `comment=${comment.trim()}`,
        '完成后请发布新版本，并保留旧版本的 source trail、输入、代码、运行记录和这张批注截图。',
      ].join('\n');
      addToSendBox(prompt);
      setComment('');
      setDraftRect(null);
      setDragStart(null);
      setAnnotating(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }, [addToSendBox, artifact, comment, conversationId, draftRect, filePath, projectRoot, runId]);

  const handleToggle = useCallback(() => {
    setAnnotating((value) => {
      const next = !value;
      if (!next) {
        setDraftRect(null);
        setDragStart(null);
        setComment('');
        setSubmitError(null);
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
              disabled={submitting}
              onChange={(event) => setComment(event.target.value)}
            />
            <button type='button' disabled={!draftRect || !comment.trim() || submitting} onClick={handleSubmit}>
              {submitting ? 'Sending...' : 'Send'}
            </button>
            {submitError ? <p className='science-preview-annotation-layer__error'>{submitError}</p> : null}
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
  variant?: 'inline' | 'modal';
}> = ({ artifact, evidenceById, onOpenFile, onOpenFiles, reportTitle, projectRoot, gitRef, variant = 'inline' }) => {
  const availableTabs = inspectorTabsForArtifact(artifact);
  const [activeTab, setActiveTab] = useState<ScienceArtifactInspectorTab | null>(() =>
    initialInspectorTab(artifact, availableTabs, variant)
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
    setActiveTab(initialInspectorTab(artifact, nextTabs, variant));
  }, [artifact.id, artifact.version, variant]);

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
  const openResolvedFile = useCallback(
    (path?: string) => {
      if (path) onOpenFile(path);
    },
    [onOpenFile]
  );
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
              onClick={() => openResolvedFile(artifact.primaryPath)}
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
                    onClick={() => openResolvedFile(evidence.path)}
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
                    <button type='button' onClick={() => openResolvedFile(input.path)}>
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
                <button type='button' onClick={() => openResolvedFile(artifact.code?.path)}>
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
                <button type='button' onClick={() => openResolvedFile(artifact.execution?.logPath)}>
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

  if (variant === 'modal') {
    return (
      <aside className='science-workspace-inspector science-workspace-inspector--modal'>
        <header className='science-workspace-dialogHeader'>
          <div className='science-workspace-dialogHeader__icon'>
            <OpenScienceIcon name={getArtifactIconName(artifact)} size={20} visualScale={1.08} />
          </div>
          <div className='science-workspace-dialogHeader__copy'>
            <h3>{artifact.title}</h3>
            <p>
              {artifact.type.replace(/_/gu, ' ')} · v{artifact.version} · {artifact.status || 'available'}
            </p>
          </div>
          <button
            type='button'
            className='science-workspace-dialogHeader__files'
            onClick={onOpenFiles}
            aria-label='OpenBioScience files'
          >
            <OpenScienceIcon name='artifactDataset' size={15} visualScale={1.05} />
            <span>Files</span>
          </button>
        </header>
        <div className='science-workspace-inspector__body'>
          <nav className='science-workspace-dialogTabs' aria-label='Artifact details'>
            {detailItems.map((item) => (
              <button
                key={item.tab}
                type='button'
                className={classNames(activeTab === item.tab && 'is-active')}
                onClick={() => setActiveTab(item.tab)}
              >
                <OpenScienceIcon name={item.icon} size={14} visualScale={1.05} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className='science-workspace-dialogContent'>{renderDetailPage()}</div>
        </div>
      </aside>
    );
  }

  if (activeTab) {
    return (
      <aside className={classNames('science-workspace-inspector', 'science-workspace-inspector--tertiary')}>
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
            aria-label='OpenBioScience files'
            title='OpenBioScience files'
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
            <button type='button' disabled={!artifactPath} onClick={() => openResolvedFile(artifactPath)}>
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

const ScienceArtifactActionMenu: React.FC<{
  artifact: ScienceArtifact;
  onOpenDetails: () => void;
  onOpenFile: (path: string) => void;
  onOpenFiles: () => void;
}> = ({ artifact, onOpenDetails, onOpenFile, onOpenFiles }) => {
  const artifactPath = getArtifactPath(artifact);

  const handleClickMenuItem = (key: string) => {
    if (key === 'details') {
      onOpenDetails();
      return;
    }
    if (key === 'files') {
      onOpenFiles();
      return;
    }
    if (key === 'open-current' && artifactPath) {
      onOpenFile(artifactPath);
    }
  };

  return (
    <div className='science-artifact-layer__actions'>
      <Dropdown
        trigger='click'
        position='br'
        getPopupContainer={() => document.body}
        droplist={
          <Menu className='science-artifact-layer__menu' onClickMenuItem={handleClickMenuItem}>
            <Menu.Item key='details'>
              <span className='science-artifact-layer__menuItem'>
                <OpenScienceIcon name='artifact' size={15} visualScale={1.05} />
                <span>详情</span>
              </span>
            </Menu.Item>
            <Menu.Item key='files'>
              <span className='science-artifact-layer__menuItem'>
                <OpenScienceIcon name='artifactDataset' size={15} visualScale={1.05} />
                <span>文件列表</span>
              </span>
            </Menu.Item>
            <Menu.Item key='open-current' disabled={!artifactPath}>
              <span className='science-artifact-layer__menuItem'>
                <OpenScienceIcon name={getArtifactIconName(artifact)} size={15} visualScale={1.05} />
                <span>{artifactPath ? `打开 ${pathLabel(artifactPath)}` : '无可打开文件'}</span>
              </span>
            </Menu.Item>
          </Menu>
        }
      >
        <button type='button' className='science-artifact-layer__moreButton' aria-label='Artifact options'>
          <MoreOne theme='outline' size={16} fill='currentColor' strokeWidth={4} />
        </button>
      </Dropdown>
    </div>
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
  const [detailsVisible, setDetailsVisible] = useState(false);
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
  const effectiveProjectRoot = panel.projectRoot || activeTab.metadata?.workspace;

  const openFiles = useCallback(() => {
    openPreview(
      '',
      'science_files',
      {
        title: 'Files',
        workspace: effectiveProjectRoot,
        science: {
          panel,
          artifactId: 'files',
        },
      },
      { replace: false }
    );
  }, [effectiveProjectRoot, openPreview, panel]);

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
        conversationId={panel.conversationId}
        enabled={isImageArtifact(selectedArtifact, activeTab)}
        filePath={activeTab.metadata?.file_path || getArtifactPath(selectedArtifact)}
        projectRoot={effectiveProjectRoot}
        runId={panel.runId}
      >
        <div className='science-workspace-preview__standard'>{previewContent}</div>
      </AnnotationOverlay>
    );
  };

  return (
    <section className='science-artifact-layer' data-testid='science-artifact-workspace'>
      <div className='science-artifact-layer__content'>
        <main className='science-artifact-layer__viewer'>{renderPreview()}</main>
        <ScienceArtifactActionMenu
          artifact={selectedArtifact}
          onOpenDetails={() => setDetailsVisible(true)}
          onOpenFile={onOpenFile}
          onOpenFiles={openFiles}
        />
        <Modal
          visible={detailsVisible}
          title='Artifact 详情'
          footer={null}
          alignCenter
          getPopupContainer={() => document.body}
          className='science-artifact-details-modal'
          style={{ width: 'min(860px, calc(100vw - 40px))' }}
          unmountOnExit
          onCancel={() => setDetailsVisible(false)}
        >
          <InspectorPane
            artifact={selectedArtifact}
            evidenceById={evidenceById}
            onOpenFile={onOpenFile}
            onOpenFiles={openFiles}
            reportTitle={panel.report.title}
            projectRoot={effectiveProjectRoot}
            gitRef={panel.git}
            variant='modal'
          />
        </Modal>
      </div>
    </section>
  );
};

export default ScienceArtifactWorkspace;
