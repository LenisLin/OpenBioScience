/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ScienceArtifactFileProvenanceResult } from '@/common/chat/science';
import { downloadFileFromPath, downloadTextContent } from '@/renderer/utils/file/download';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { toLocalFileHref } from '@/renderer/components/Markdown/markdownUtils';
import { PreviewToolbarExtrasProvider, type PreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import { usePreviewContext } from '../../context/PreviewContext';
import { useLocalFilePreview } from '../../hooks/useLocalFilePreview';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import { Input, Link, Modal } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiffPreview from '../viewers/DiffViewer';
import ExcelPreview from '../viewers/ExcelViewer';
import CsvTableViewer from '../viewers/CsvTableViewer';
import HTMLEditor from '../editors/HTMLEditor';
import HTMLRenderer from '../renderers/HTMLRenderer';
import ImagePreview from '../viewers/ImageViewer';
import MarkdownEditor from '../editors/MarkdownEditor';
import MarkdownPreview from '../viewers/MarkdownViewer';
import MolecularStructureViewer from '../viewers/MolecularStructureViewer';
import PDFPreview from '../viewers/PDFViewer';
import OfficeDocPreview from '../viewers/OfficeDocViewer';
import PptViewer from '../viewers/PptViewer';
import CodeEditor from '../editors/CodeEditor';
import URLViewer from '../viewers/URLViewer';
import ScienceArtifactWorkspace from '../ScienceArtifactWorkspace/ScienceArtifactWorkspace';
import ScienceFilesView from '../ScienceArtifactWorkspace/ScienceFilesView';
import { ScienceReportPreviewPanel } from '@/renderer/pages/conversation/Messages/components/ScienceReportPanel';
import {
  PreviewTabs,
  PreviewToolbar,
  PreviewContextMenu,
  PreviewConfirmModals,
  PreviewHistoryDropdown,
  type ContextMenuState,
  type CloseTabConfirmState,
  type PreviewTab,
} from '.';
import { DEFAULT_SPLIT_RATIO, MAX_SPLIT_WIDTH, MIN_SPLIT_WIDTH } from '../../constants';
import {
  usePreviewHistory,
  usePreviewKeyboardShortcuts,
  useScrollSync,
  useTabOverflow,
  useThemeDetection,
} from '../../hooks';
import { useTranslation } from 'react-i18next';
import './preview.css';

const formatProvenanceTime = (timestamp?: number, fallback = 'Unknown'): string => {
  if (!timestamp) return fallback;
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return fallback;
  }
};

const provenanceStatusFallback = (status?: ScienceArtifactFileProvenanceResult['status']): string => {
  switch (status) {
    case 'tracked':
      return 'Tracked';
    case 'modified':
      return 'Modified after snapshot';
    case 'pointer':
      return 'Pointer only';
    case 'ignored':
      return 'Ignored';
    case 'missing':
      return 'Missing';
    case 'untracked':
      return 'Not registered';
    default:
      return 'Unknown';
  }
};

/**
 * 预览面板主组件
 * Main preview panel component
 *
 * 支持多 Tab 切换，每个 Tab 可以显示不同类型的内容
 * Supports multiple tabs, each tab can display different types of content
 */
export type PreviewPanelLayoutMode = 'split' | 'fullscreen';

interface PreviewPanelProps {
  previewLayoutMode?: PreviewPanelLayoutMode;
  onPreviewLayoutModeChange?: (mode: PreviewPanelLayoutMode) => void;
  onRequestHalfPanel?: () => void;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({
  previewLayoutMode = 'split',
  onPreviewLayoutModeChange,
  onRequestHalfPanel,
}) => {
  const { t } = useTranslation();
  const {
    isOpen,
    tabs,
    activeTabId,
    activeTab,
    closeTab,
    switchTab,
    closePreview,
    updateContent,
    saveContent,
    addDomSnippet,
  } = usePreviewContext();
  const layout = useLayoutContext();
  const openLocalFilePreview = useLocalFilePreview(activeTab?.metadata?.workspace);
  const activeScienceArtifact = useMemo(() => {
    const science = activeTab?.metadata?.science;
    if (!science?.panel || !science.artifactId) return undefined;
    return science.panel.artifacts.find(
      (artifact) =>
        artifact.id === science.artifactId &&
        (science.artifactVersion == null || artifact.version === science.artifactVersion)
    );
  }, [activeTab?.metadata?.science]);

  // 视图状态 / View states
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('preview');
  const [isSplitScreenEnabled, setIsSplitScreenEnabled] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [toolbarExtras, setToolbarExtras] = useState<PreviewToolbarExtras | null>(null);
  const [renameState, setRenameState] = useState({ visible: false, value: '', loading: false });
  const [provenanceState, setProvenanceState] = useState<{
    visible: boolean;
    loading: boolean;
    result?: ScienceArtifactFileProvenanceResult;
    error?: string;
  }>({ visible: false, loading: false });

  // 切换文件时把视图模式复位为预览，避免上一个文件的 source 模式串到下一个文件（如代码文件丢失语法高亮）。
  // 注意：单预览浏览模式下打开新文件会复用当前 tab 的 id，所以这里要监听实际显示的文件标识（路径 + 类型），
  // 而不是 activeTabId（它不会变）。
  // Reset view mode to preview when the displayed file changes so a previous file's source mode does not
  // leak into the next one (e.g. a code file losing syntax highlighting). In single-preview browse mode a
  // new file reuses the active tab's id, so we key on the file identity (path + type), not activeTabId.
  useEffect(() => {
    setViewMode('preview');
  }, [activeTabId, activeTab?.metadata?.file_path, activeTab?.content_type]);

  // 确认对话框状态 / Confirmation dialog states
  const [closeTabConfirm, setCloseTabConfirm] = useState<CloseTabConfirmState>({ show: false, tabId: null });

  // 右键菜单状态 / Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ show: false, x: 0, y: 0, tabId: null });

  // 容器引用 / Container refs
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // 使用自定义 Hooks / Use custom hooks
  const currentTheme = useThemeDetection();
  const { tabsContainerRef, tabFadeState } = useTabOverflow([tabs, activeTabId]);
  const { handleEditorScroll, handlePreviewScroll } = useScrollSync({
    enabled: isSplitScreenEnabled,
    editorContainerRef,
    previewContainerRef,
  });

  // eslint-disable-next-line max-len
  const {
    historyVersions,
    historyLoading,
    snapshotSaving,
    historyError,
    historyTarget,
    refreshHistory,
    handleSaveSnapshot,
    handleSnapshotSelect,
    messageApi,
    messageContextHolder,
  } = usePreviewHistory({
    activeTab,
    updateContent,
  });

  usePreviewKeyboardShortcuts({
    isDirty: activeTab?.isDirty,
    onSave: () => void saveContent(),
  });

  const setToolbarExtrasCallback = useCallback((extras: PreviewToolbarExtras | null) => {
    setToolbarExtras(extras);
  }, []);

  // 处理 HTML 审核模式元素选中 / Handle HTML inspect mode element selection
  const handleElementSelected = useCallback(
    (element: { html: string; tag: string }) => {
      addDomSnippet(element.tag, element.html);
    },
    [addDomSnippet]
  );

  const toolbarExtrasContextValue = useMemo(
    () => ({
      setExtras: setToolbarExtrasCallback,
    }),
    [setToolbarExtrasCallback]
  );

  // 内层分割：编辑器和预览的分割比例（默认 50/50）
  // Inner split: Split ratio between editor and preview (default 50/50)
  const { splitRatio, createDragHandle } = useResizableSplit({
    defaultWidth: DEFAULT_SPLIT_RATIO,
    minWidth: MIN_SPLIT_WIDTH,
    maxWidth: MAX_SPLIT_WIDTH,
    storageKey: 'preview-panel-split-ratio',
  });

  // 使用 useCallback 包装 updateContent，确保引用稳定 / Wrap updateContent with useCallback for stable reference
  const handleContentChange = useCallback(
    (new_content: string) => {
      // 严格的类型检查，防止 Event 对象被错误传递 / Strict type checking to prevent Event object from being passed incorrectly
      if (typeof new_content !== 'string') {
        return;
      }
      try {
        updateContent(new_content);
      } catch {
        // Silently ignore errors
      }
    },
    [updateContent]
  );

  const openPlainFilePreview = useCallback(
    (filePath: string) => {
      void openLocalFilePreview(filePath);
    },
    [openLocalFilePreview]
  );

  // 处理关闭tab / Handle close tab
  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((item) => item.id === tabId);
      // 如果tab有未保存的修改，显示确认对话框 / If tab has unsaved changes, show confirmation dialog
      if (tab?.isDirty) {
        setCloseTabConfirm({ show: true, tabId });
      } else {
        // 没有未保存的修改，直接关闭 / No unsaved changes, close directly
        closeTab(tabId);
      }
    },
    [tabs, closeTab]
  );

  // 保存并关闭tab / Save and close tab
  const handleSaveAndCloseTab = useCallback(async () => {
    if (!closeTabConfirm.tabId) return;

    try {
      const success = await saveContent(closeTabConfirm.tabId);
      if (!success) {
        throw new Error(t('common.saveFailed'));
      }
      closeTab(closeTabConfirm.tabId);
      setCloseTabConfirm({ show: false, tabId: null });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('common.unknownError');
      messageApi.error(`${t('common.saveFailed')}: ${errorMsg}`);
    }
  }, [closeTabConfirm.tabId, saveContent, closeTab, messageApi, t]);

  // 不保存直接关闭tab / Close tab without saving
  const handleCloseWithoutSave = useCallback(() => {
    if (!closeTabConfirm.tabId) return;
    closeTab(closeTabConfirm.tabId);
    setCloseTabConfirm({ show: false, tabId: null });
  }, [closeTabConfirm.tabId, closeTab]);

  // 取消关闭tab / Cancel close tab
  const handleCancelCloseTab = useCallback(() => {
    setCloseTabConfirm({ show: false, tabId: null });
  }, []);

  // 处理 tab 右键菜单 / Handle tab context menu
  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
    });
  }, []);

  // 关闭左侧 tabs / Close tabs to the left
  const handleCloseLeft = useCallback(
    (tabId: string) => {
      const currentIndex = tabs.findIndex((item) => item.id === tabId);
      if (currentIndex <= 0) return;

      const tabsToClose = tabs.slice(0, currentIndex);
      tabsToClose.forEach((tab) => closeTab(tab.id));
      setContextMenu({ show: false, x: 0, y: 0, tabId: null });
    },
    [tabs, closeTab]
  );

  // 关闭右侧 tabs / Close tabs to the right
  const handleCloseRight = useCallback(
    (tabId: string) => {
      const currentIndex = tabs.findIndex((item) => item.id === tabId);
      if (currentIndex < 0 || currentIndex >= tabs.length - 1) return;

      const tabsToClose = tabs.slice(currentIndex + 1);
      tabsToClose.forEach((tab) => closeTab(tab.id));
      setContextMenu({ show: false, x: 0, y: 0, tabId: null });
    },
    [tabs, closeTab]
  );

  // 关闭其他 tabs / Close other tabs
  const handleCloseOthers = useCallback(
    (tabId: string) => {
      const tabsToClose = tabs.filter((item) => item.id !== tabId);
      tabsToClose.forEach((tab) => closeTab(tab.id));
      setContextMenu({ show: false, x: 0, y: 0, tabId: null });
    },
    [tabs, closeTab]
  );

  // 关闭全部 tabs / Close all tabs
  const handleCloseAll = useCallback(() => {
    tabs.forEach((tab) => closeTab(tab.id));
    setContextMenu({ show: false, x: 0, y: 0, tabId: null });
  }, [tabs, closeTab]);

  // 如果预览面板未打开，不渲染 / Don't render if preview panel is not open
  if (!isOpen || !activeTab) return null;

  const { content, content_type, metadata } = activeTab;
  const isMarkdown = content_type === 'markdown';
  const isHTML = content_type === 'html';
  const isEditable = metadata?.editable !== false; // 默认可编辑 / Default editable

  // 对所有有 file_path 的文件显示"在系统中打开"按钮（统一在工具栏显示）
  // Show "Open in System" button for all files with file_path (unified in toolbar)
  const showOpenInSystemButton = Boolean(metadata?.file_path);
  const canRenamePreviewFile = Boolean(metadata?.file_path && !metadata?.missingFile);
  const canShowScienceProvenance = Boolean(
    metadata?.file_path && !metadata?.missingFile && (metadata?.science?.panel.projectRoot || metadata?.workspace)
  );

  // 下载文件到本地 / Download file to local system
  const handleDownload = useCallback(async () => {
    try {
      const rawFileName = metadata?.file_name || `${content_type}-${Date.now()}`;

      if (metadata?.file_path) {
        // All files with a disk path (binary, image, zip, etc.) — unified path
        await downloadFileFromPath(metadata.file_path, rawFileName, metadata.workspace);
        return;
      }

      if (content_type === 'image') {
        // Pure base64 image (no file path on disk)
        if (!content) {
          messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
          return;
        }
        const blob = await fetch(content).then((res) => res.blob());
        const nameExt = metadata?.file_name?.split('.').pop();
        const mimeExt = blob.type?.includes('/') ? blob.type.split('/').pop() : undefined;
        const ext = nameExt || mimeExt || 'png';
        const normalizedExt = ext.toLowerCase();
        const hasSameExt = rawFileName.toLowerCase().endsWith(`.${normalizedExt}`);
        const file_name = hasSameExt ? rawFileName : `${rawFileName}.${ext}`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      // Text / code content (no file path, no binary)
      const nameExt = metadata?.file_name?.split('.').pop();
      let mimeType = 'text/plain;charset=utf-8';
      let ext = 'txt';
      if (content_type === 'markdown') {
        mimeType = 'text/markdown;charset=utf-8';
        ext = 'md';
      } else if (content_type === 'html') {
        mimeType = 'text/html;charset=utf-8';
        ext = 'html';
      } else if (content_type === 'diff') {
        ext = 'diff';
      } else if (content_type === 'code') {
        // Code files: set extension based on language
        const lang = metadata?.language;
        if (lang === 'javascript' || lang === 'js') ext = 'js';
        else if (lang === 'typescript' || lang === 'ts') ext = 'ts';
        else if (lang === 'python' || lang === 'py') ext = 'py';
        else if (lang === 'java') ext = 'java';
        else if (lang === 'cpp' || lang === 'c++') ext = 'cpp';
        else if (lang === 'c') ext = 'c';
        else if (lang === 'html') ext = 'html';
        else if (lang === 'css') ext = 'css';
        else if (lang === 'json') ext = 'json';
      }
      if (nameExt) ext = nameExt;
      const normalizedExt = ext.toLowerCase();
      const hasSameExt = rawFileName.toLowerCase().endsWith(`.${normalizedExt}`);
      const file_name = hasSameExt ? rawFileName : `${rawFileName}.${ext}`;
      downloadTextContent(content, file_name, mimeType);
    } catch (error) {
      console.error('[PreviewPanel] Failed to download file:', error);
      messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
    }
  }, [content, content_type, metadata?.file_name, metadata?.file_path, metadata?.language, messageApi, t]);

  // 在系统默认应用中打开文件 / Open file in system default application
  const handleOpenInSystem = useCallback(async () => {
    if (!metadata?.file_path) {
      try {
        messageApi.error(t('preview.openInSystemFailed'));
      } catch {
        // Context holder may be unmounted
      }
      return;
    }

    try {
      // 使用系统默认应用打开文件 / Open file with system default application
      await ipcBridge.shell.openFile.invoke(metadata.file_path);
      try {
        messageApi.success(t('preview.openInSystemSuccess'));
      } catch {
        // Context holder may be unmounted after async operation
      }
    } catch (error) {
      console.error('[PreviewPanel] Failed to open file in system:', error);
      try {
        messageApi.error(t('preview.openInSystemFailed'));
      } catch {
        // Context holder may be unmounted after async operation
      }
    }
  }, [metadata?.file_path, messageApi, t]);

  const handleRenameRequest = useCallback(() => {
    if (!metadata?.file_path) return;
    setRenameState({
      visible: true,
      value: metadata.file_name || activeTab.title,
      loading: false,
    });
  }, [activeTab.title, metadata?.file_name, metadata?.file_path]);

  const handleRenameConfirm = useCallback(async () => {
    if (!metadata?.file_path) return;
    const nextName = renameState.value.trim();
    if (!nextName || /[/\\]/u.test(nextName)) {
      messageApi.error(t('preview.renameInvalidName', { defaultValue: 'Use a file name without path separators.' }));
      return;
    }
    setRenameState((prev) => ({ ...prev, loading: true }));
    try {
      const result = await ipcBridge.fs.renameEntry.invoke({ path: metadata.file_path, new_name: nextName });
      await openLocalFilePreview(
        result.new_path,
        undefined,
        {
          ...metadata,
          title: nextName,
          file_name: nextName,
          file_path: result.new_path,
          missingFile: false,
        },
        { replace: true }
      );
      setRenameState({ visible: false, value: '', loading: false });
      messageApi.success(t('preview.renameSuccess', { defaultValue: 'File renamed' }));
    } catch (error) {
      console.error('[PreviewPanel] Failed to rename file:', error);
      setRenameState((prev) => ({ ...prev, loading: false }));
      messageApi.error(t('preview.renameFailed', { defaultValue: 'Failed to rename file' }));
    }
  }, [metadata, messageApi, openLocalFilePreview, renameState.value, t]);

  const handleShowProvenance = useCallback(async () => {
    const filePath = metadata?.file_path;
    const projectRoot = metadata?.science?.panel.projectRoot || metadata?.workspace;
    if (!filePath || !projectRoot) {
      setProvenanceState({
        visible: true,
        loading: false,
        error: t('preview.provenanceUnavailable', { defaultValue: 'No Science project provenance is available for this file.' }),
      });
      return;
    }
    setProvenanceState({ visible: true, loading: true });
    try {
      const result = await ipcBridge.scienceArtifactArchive.resolveFile.invoke({
        projectRoot,
        filePath,
        limit: 8,
      });
      setProvenanceState({ visible: true, loading: false, result, error: result.ok ? undefined : result.error });
    } catch (error) {
      console.error('[PreviewPanel] Failed to resolve Science file provenance:', error);
      setProvenanceState({
        visible: true,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [metadata?.file_path, metadata?.science?.panel.projectRoot, metadata?.workspace, t]);

  const renderProvenanceModal = () => {
    const result = provenanceState.result;
    const record = result?.record;
    const fallbackArtifact = activeScienceArtifact;
    const sourceTitle =
      record?.artifactTitle ||
      fallbackArtifact?.title ||
      record?.artifactId ||
      fallbackArtifact?.id ||
      t('preview.provenanceUnknownSource', { defaultValue: 'Unregistered file' });
    const evidenceIds = record?.evidenceIds?.length ? record.evidenceIds : fallbackArtifact?.evidenceIds || [];
    const history = result?.history || [];
    const status = result?.status || record?.status || (provenanceState.error ? 'unknown' : 'untracked');
    const unknownLabel = t('common.unknown', { defaultValue: 'Unknown' });
    const role = record?.role || 'file';
    const roleLabel = t(`preview.provenanceRoleValues.${role}`, { defaultValue: role });
    const statusLabel = t(`preview.provenanceStatus.${status}`, {
      defaultValue: provenanceStatusFallback(status),
    });
    const formatHistoryAction = (item: (typeof history)[number]): string => {
      const key = item.action || item.role || item.mode || 'snapshot';
      return t(`preview.provenanceActionValues.${key}`, { defaultValue: key });
    };

    return (
      <Modal
        visible={provenanceState.visible}
        title={t('preview.provenance', { defaultValue: 'Provenance' })}
        footer={null}
        onCancel={() => setProvenanceState({ visible: false, loading: false })}
        alignCenter
        getPopupContainer={() => document.body}
        className='preview-provenance-modal'
      >
        {provenanceState.loading ? (
          <div className='preview-provenance-empty'>
            {t('common.loading', { defaultValue: 'Loading...' })}
          </div>
        ) : provenanceState.error ? (
          <div className='preview-provenance-empty'>{provenanceState.error}</div>
        ) : (
          <div className='preview-provenance'>
            <div className='preview-provenance__hero'>
              <div className='preview-provenance__label'>
                {t('preview.provenanceSource', { defaultValue: 'Source' })}
              </div>
              <div className='preview-provenance__title'>{sourceTitle}</div>
              <div className={`preview-provenance__status preview-provenance__status--${status}`}>
                {statusLabel}
              </div>
            </div>

            <div className='preview-provenance__grid'>
              <div>
                <span>{t('preview.provenanceFile', { defaultValue: 'File' })}</span>
                <strong>{result?.relativePath || metadata?.file_name || activeTab.title}</strong>
              </div>
              <div>
                <span>{t('preview.provenanceCreated', { defaultValue: 'Created' })}</span>
                <strong>{formatProvenanceTime(record?.timestamp || fallbackArtifact?.createdAt, unknownLabel)}</strong>
              </div>
              <div>
                <span>{t('preview.provenanceRole', { defaultValue: 'Role' })}</span>
                <strong>{roleLabel}</strong>
              </div>
              <div>
                <span>{t('preview.provenanceCommit', { defaultValue: 'Snapshot' })}</span>
                <strong>{record?.shortCommit || record?.commit?.slice(0, 8) || t('preview.provenanceNoSnapshot', { defaultValue: 'none' })}</strong>
              </div>
            </div>

            {evidenceIds.length > 0 && (
              <div className='preview-provenance__evidence'>
                <span>{t('preview.provenanceEvidence', { defaultValue: 'Evidence' })}</span>
                <div>
                  {evidenceIds.slice(0, 8).map((id) => (
                    <b key={id}>{id}</b>
                  ))}
                </div>
              </div>
            )}

            {history.length > 0 && (
              <div className='preview-provenance__history'>
                <div className='preview-provenance__sectionTitle'>
                  {t('preview.provenanceHistory', { defaultValue: 'History' })}
                </div>
                {history.slice(0, 5).map((item, index) => (
                  <div key={`${item.commit || index}-${item.timestamp}`} className='preview-provenance__historyItem'>
                    <div>
                      <strong>{item.shortCommit || item.commit?.slice(0, 8) || 'snapshot'}</strong>
                      <span>{formatProvenanceTime(item.timestamp, unknownLabel)}</span>
                    </div>
                    <span>{formatHistoryAction(item)}</span>
                  </div>
                ))}
              </div>
            )}

            {status === 'untracked' && (
              <div className='preview-provenance__note'>
                {t('preview.provenanceUntrackedHint', {
                  defaultValue: 'This file has not been registered by science_artifact yet.',
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    );
  };

  // 渲染历史下拉菜单 / Render history dropdown
  const renderHistoryDropdown = () => {
    // eslint-disable-next-line max-len
    return (
      <PreviewHistoryDropdown
        historyVersions={historyVersions}
        historyLoading={historyLoading}
        historyError={historyError}
        historyTarget={historyTarget}
        currentTheme={currentTheme}
        onSnapshotSelect={handleSnapshotSelect}
      />
    );
  };

  const renderMissingFile = () => {
    const filePath = metadata?.file_path;
    const externalHref = filePath ? toLocalFileHref(filePath) : undefined;

    return (
      <div className='flex flex-1 flex-col items-center justify-center gap-10px px-24px text-center'>
        <div className='text-15px font-medium text-t-primary'>
          {t('preview.missingFile.title', { defaultValue: 'File not found' })}
        </div>
        <div className='max-w-560px break-all text-12px leading-18px text-t-secondary'>
          {filePath || t('preview.errors.missingFilePath')}
        </div>
        {externalHref && (
          <Link href={externalHref} target='_blank' rel='noreferrer' className='text-13px'>
            {t('preview.missingFile.openInNewTab', { defaultValue: 'Try opening in a new tab' })}
          </Link>
        )}
      </div>
    );
  };

  // 渲染普通预览内容 / Render standard preview content
  const renderStandardContent = () => {
    if (content_type === 'science_report') {
      return metadata?.science?.panel ? (
        <ScienceReportPreviewPanel panel={metadata.science.panel} />
      ) : (
        <div className='flex flex-1 items-center justify-center text-13px text-t-secondary'>Science report is unavailable.</div>
      );
    }

    if (content_type === 'science_files') {
      return metadata?.science?.panel ? (
        <ScienceFilesView panel={metadata.science.panel} workspace={metadata.workspace || metadata.science.panel.projectRoot} />
      ) : (
        <div className='flex flex-1 items-center justify-center text-13px text-t-secondary'>Science files are unavailable.</div>
      );
    }

    if (metadata?.missingFile) return renderMissingFile();

    // Markdown 模式 / Markdown mode
    if (isMarkdown) {
      // 分屏模式：左右分割（编辑器 + 预览）/ Split-screen mode: Editor + Preview
      if (isSplitScreenEnabled) {
        // 移动端：全屏显示预览，隐藏编辑器 / Mobile: Full-screen preview, hide editor
        if (layout?.isMobile) {
          return (
            <div className='flex-1 overflow-hidden'>
              <MarkdownPreview content={content} file_path={metadata?.file_path} workspace={metadata?.workspace} />
            </div>
          );
        }

        // 桌面端：左右分割布局 / Desktop: Split layout
        return (
          <div className='flex flex-1 relative overflow-hidden'>
            {/* 左侧：编辑器 / Left: Editor */}
            <div className='flex flex-col relative' style={{ width: `${splitRatio}%` }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.editor')}</span>
              </div>
              <div className='flex-1 overflow-hidden'>
                <MarkdownEditor
                  key={activeTabId ?? undefined}
                  value={content}
                  onChange={updateContent}
                  containerRef={editorContainerRef}
                  onScroll={handleEditorScroll}
                />
              </div>
              {/* 拖动分割线 / Drag handle */}
              {createDragHandle({ className: 'absolute right-0 top-0 bottom-0' })}
            </div>

            {/* 右侧：预览 / Right: Preview */}
            <div className='flex flex-col' style={{ width: `${100 - splitRatio}%`, minWidth: 0 }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.preview')}</span>
              </div>
              <div className='flex flex-col flex-1 overflow-hidden'>
                <MarkdownPreview
                  content={content}
                  containerRef={previewContainerRef}
                  onScroll={handlePreviewScroll}
                  file_path={metadata?.file_path}
                  workspace={metadata?.workspace}
                />
              </div>
            </div>
          </div>
        );
      }

      // 非分屏模式：单栏（原文或预览）/ Non-split mode: Single panel (source or preview)
      return (
        <MarkdownPreview
          content={content}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onContentChange={updateContent}
          file_path={metadata?.file_path}
          workspace={metadata?.workspace}
        />
      );
    }

    // HTML 模式 / HTML mode
    if (isHTML) {
      // 分屏模式：左右分割（编辑器 + 预览）/ Split-screen mode: Editor + Preview
      if (isSplitScreenEnabled) {
        // 移动端：全屏显示预览，隐藏编辑器 / Mobile: Full-screen preview, hide editor
        if (layout?.isMobile) {
          return (
            <div className='flex-1 overflow-hidden'>
              <HTMLRenderer
                content={content}
                file_path={metadata?.file_path}
                workspace={metadata?.workspace}
                isDirty={activeTab?.isDirty}
                copySuccessMessage={t('preview.html.copySuccess')}
                inspectMode={inspectMode}
                onElementSelected={handleElementSelected}
              />
            </div>
          );
        }

        // 桌面端：左右分割布局 / Desktop: Split layout
        return (
          <div className='flex flex-1 relative overflow-hidden'>
            {/* 左侧：编辑器 / Left: Editor */}
            <div className='flex flex-col relative' style={{ width: `${splitRatio}%` }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.editor')}</span>
              </div>
              <div className='flex-1 overflow-hidden'>
                <HTMLEditor
                  key={activeTabId ?? undefined}
                  value={content}
                  onChange={updateContent}
                  containerRef={editorContainerRef}
                  onScroll={handleEditorScroll}
                  file_path={metadata?.file_path}
                />
              </div>
              {/* 拖动分割线 / Drag handle */}
              {createDragHandle({ className: 'absolute right-0 top-0 bottom-0' })}
            </div>

            {/* 右侧：预览 / Right: Preview */}
            <div className='flex flex-col' style={{ width: `${100 - splitRatio}%`, minWidth: 0 }}>
              <div className='h-40px flex items-center justify-between px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.preview')}</span>
              </div>
              <div className='flex flex-col flex-1 overflow-hidden'>
                {/* prettier-ignore */}
                {/* eslint-disable-next-line max-len */}
                <HTMLRenderer
                  content={content}
                  file_path={metadata?.file_path}
                  workspace={metadata?.workspace}
                  isDirty={activeTab?.isDirty}
                  containerRef={previewContainerRef}
                  onScroll={handlePreviewScroll}
                  inspectMode={inspectMode}
                  copySuccessMessage={t('preview.html.copySuccess')}
                  onElementSelected={handleElementSelected}
                />
              </div>
            </div>
          </div>
        );
      }

      // 非分屏模式：单栏（原文或预览）/ Non-split mode: Single panel (source or preview)
      if (viewMode === 'source') {
        return (
          <div className='flex-1 overflow-hidden'>
            <HTMLEditor
              key={activeTabId ?? undefined}
              value={content}
              onChange={handleContentChange}
              file_path={metadata?.file_path}
            />
          </div>
        );
      } else {
        // 预览模式 / Preview mode
        return (
          <div className='flex-1 overflow-hidden'>
            <HTMLRenderer
              content={content}
              file_path={metadata?.file_path}
              workspace={metadata?.workspace}
              isDirty={activeTab?.isDirty}
              inspectMode={inspectMode}
              copySuccessMessage={t('preview.html.copySuccess')}
              onElementSelected={handleElementSelected}
            />
          </div>
        );
      }
    }

    // 其他类型：全屏预览 / Other types: Full-screen preview
    if (content_type === 'diff') {
      return (
        <DiffPreview
          content={content}
          metadata={metadata}
          hideToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      );
    } else if (content_type === 'code') {
      // 统一：始终可编辑的 CodeEditor（看=改）/ Unified: always-editable CodeEditor (view = edit)
      return (
        <div className='flex-1 overflow-hidden'>
          <CodeEditor
            key={activeTabId ?? undefined}
            value={content}
            onChange={handleContentChange}
            language={metadata?.language}
            fileName={metadata?.file_name}
            readOnly={isEditable === false}
            targetLine={metadata?.targetLine}
            targetColumn={metadata?.targetColumn}
          />
        </div>
      );
    } else if (content_type === 'pdf') {
      return <PDFPreview file_path={metadata?.file_path} content={content} />;
    } else if (content_type === 'ppt') {
      return <PptViewer file_path={metadata?.file_path} content={content} workspace={metadata?.workspace} />;
    } else if (content_type === 'word') {
      return <OfficeDocPreview file_path={metadata?.file_path} content={content} workspace={metadata?.workspace} />;
    } else if (content_type === 'excel') {
      if (/\.(csv|tsv)$/iu.test(metadata?.file_name || metadata?.file_path || '')) {
        return <CsvTableViewer content={content} fileName={metadata?.file_name || metadata?.file_path} />;
      }
      return <ExcelPreview file_path={metadata?.file_path} content={content} workspace={metadata?.workspace} />;
    } else if (content_type === 'image') {
      return (
        <ImagePreview
          file_path={metadata?.file_path}
          content={content}
          file_name={metadata?.file_name || metadata?.title}
          workspace={metadata?.workspace}
        />
      );
    } else if (content_type === 'molecular_structure') {
      return (
        <MolecularStructureViewer
          content={content}
          file_path={metadata?.file_path}
          file_name={metadata?.file_name || metadata?.title}
          workspace={metadata?.workspace}
          artifact={activeScienceArtifact}
        />
      );
    } else if (content_type === 'url') {
      // URL 预览模式 / URL preview mode
      return <URLViewer url={content} title={metadata?.title} />;
    }

    return null;
  };

  // 渲染预览内容 / Render preview content
  const renderContent = () => {
    if (metadata?.science?.panel && metadata.science.workspaceView && content_type !== 'science_report') {
      return (
        <ScienceArtifactWorkspace
          panel={metadata.science.panel}
          activeTab={activeTab}
          previewContent={renderStandardContent()}
          onOpenFile={openPlainFilePreview}
          onContentChange={handleContentChange}
        />
      );
    }

    return renderStandardContent();
  };

  // 将 tabs 转换为 PreviewTab 类型 / Convert tabs to PreviewTab type
  const previewTabs: PreviewTab[] = tabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    isDirty: tab.isDirty,
  }));

  return (
    <PreviewToolbarExtrasProvider value={toolbarExtrasContextValue}>
      <div className='h-full flex flex-col bg-1 rounded-[16px]'>
        {messageContextHolder}

        {/* 确认对话框 / Confirmation modals */}
        {/* eslint-disable-next-line max-len */}
        <PreviewConfirmModals
          closeTabConfirm={closeTabConfirm}
          onSaveAndCloseTab={handleSaveAndCloseTab}
          onCloseWithoutSave={handleCloseWithoutSave}
          onCancelCloseTab={handleCancelCloseTab}
        />

        <Modal
          visible={renameState.visible}
          title={t('preview.renameFile', { defaultValue: 'Rename file' })}
          onCancel={() => setRenameState({ visible: false, value: '', loading: false })}
          onOk={() => void handleRenameConfirm()}
          confirmLoading={renameState.loading}
          okText={t('common.save', { defaultValue: 'Save' })}
          cancelText={t('common.cancel')}
          alignCenter
          getPopupContainer={() => document.body}
          className='preview-rename-modal'
        >
          <Input
            value={renameState.value}
            autoFocus
            onChange={(value) => setRenameState((prev) => ({ ...prev, value }))}
            onPressEnter={() => void handleRenameConfirm()}
          />
        </Modal>

        {renderProvenanceModal()}

        {/* Tab 栏 / Tab bar */}
        {/* eslint-disable-next-line max-len */}
        <PreviewTabs
          tabs={previewTabs}
          activeTabId={activeTabId}
          tabFadeState={tabFadeState}
          tabsContainerRef={tabsContainerRef}
          onSwitchTab={switchTab}
          onCloseTab={handleCloseTab}
          onContextMenu={handleTabContextMenu}
          onClosePanel={closePreview}
          previewLayoutMode={previewLayoutMode}
          onPreviewLayoutModeChange={onPreviewLayoutModeChange}
          onRequestHalfPanel={onRequestHalfPanel}
        />

        {/* 工具栏（URL 类型不显示工具栏，因为不需要下载/编辑等功能）/ Toolbar (hidden for URL type as it doesn't need download/edit features) */}
        {content_type !== 'url' &&
          content_type !== 'science_report' &&
          content_type !== 'science_files' &&
          !metadata?.missingFile && (
          <PreviewToolbar
            content_type={content_type}
            isMarkdown={isMarkdown}
            isHTML={isHTML}
            viewMode={viewMode}
            isSplitScreenEnabled={isSplitScreenEnabled}
            showOpenInSystemButton={showOpenInSystemButton}
            historyTarget={historyTarget}
            snapshotSaving={snapshotSaving}
            onViewModeChange={(mode) => {
              setViewMode(mode);
              setIsSplitScreenEnabled(false); // 切换视图模式时关闭分屏 / Disable split when switching view mode
            }}
            onSplitScreenToggle={() => setIsSplitScreenEnabled(!isSplitScreenEnabled)}
            onSaveSnapshot={handleSaveSnapshot}
            onRefreshHistory={refreshHistory}
            renderHistoryDropdown={renderHistoryDropdown}
            onOpenInSystem={handleOpenInSystem}
            onDownload={handleDownload}
            onRename={handleRenameRequest}
            onShowProvenance={handleShowProvenance}
            canRename={canRenamePreviewFile}
            canShowProvenance={canShowScienceProvenance}
            inspectMode={inspectMode}
            onInspectModeToggle={() => setInspectMode(!inspectMode)}
            leftExtra={toolbarExtras?.left}
            rightExtra={toolbarExtras?.right}
          />
        )}

        {metadata?.truncated && (
          <div className='sticky top-0 z-1 px-16px py-10px text-12px bg-warning-1 text-warning-7 border-b border-warning-3'>
            {t('preview.truncatedBanner')}
          </div>
        )}

        {/* 预览内容 / Preview content */}
        {renderContent()}

        {/* Tab 右键菜单 / Tab context menu */}
        {/* eslint-disable-next-line max-len */}
        <PreviewContextMenu
          contextMenu={contextMenu}
          tabs={previewTabs}
          currentTheme={currentTheme}
          onClose={() => setContextMenu({ show: false, x: 0, y: 0, tabId: null })}
          onCloseLeft={handleCloseLeft}
          onCloseRight={handleCloseRight}
          onCloseOthers={handleCloseOthers}
          onCloseAll={handleCloseAll}
        />
      </div>
    </PreviewToolbarExtrasProvider>
  );
};

export default PreviewPanel;
