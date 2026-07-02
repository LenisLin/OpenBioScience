/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IWorkspaceFlatFile } from '@/common/adapter/ipcBridge';
import type { ScienceArtifact, SciencePanelData } from '@/common/chat/science';
import { toLocalFileHref } from '@/renderer/components/Markdown/markdownUtils';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import { useLocalFilePreview } from '../../hooks/useLocalFilePreview';
import FileTypeIcon from '@/renderer/pages/conversation/Workspace/components/FileTypeIcon';
import {
  collectSciencePanelFiles,
  getFileNameFromSciencePath,
  loadScienceProjectIndex,
  resolveSciencePath,
  toWorkspaceRelativePath,
  type ScienceProjectIndex,
} from '@/renderer/utils/science/scienceProjectIndex';
import { IconFile, IconFileImage, IconSearch } from '@arco-design/web-react/icon';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

type ScienceFilesViewMode = 'grid' | 'list';

type ScienceFileItem = {
  id: string;
  name: string;
  path: string;
  relativePath?: string;
  role: string;
  group: string;
  source: string;
  sourceKind: 'science' | 'project';
  artifact?: ScienceArtifact;
  panel?: SciencePanelData;
  createdAt?: number;
  modifiedAt?: number;
  shortCommit?: string;
  status?: string;
};

const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+/g, '/');

const IGNORED_WORKSPACE_PARTS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
]);

const isHiddenWorkspaceFile = (file: IWorkspaceFlatFile): boolean => {
  const normalized = normalizePath(file.relativePath || file.fullPath);
  if (!normalized || normalized.startsWith('.openscience/')) return true;
  const parts = normalized.split('/');
  return parts.some((part) => IGNORED_WORKSPACE_PARTS.has(part)) || /(^|\/)\.env(?:\.|$)/u.test(normalized);
};

const isImagePath = (value: string): boolean => /\.(png|jpe?g|gif|webp|svg|tiff?|bmp|avif)$/iu.test(value);
const isTablePath = (value: string): boolean => /\.(csv|tsv|xlsx?|parquet|feather)$/iu.test(value);
const isTextPath = (value: string): boolean => /\.(md|txt|tex|bib|json|yaml|yml|py|r|sh|log)$/iu.test(value);

const formatTime = (timestamp?: number): string => {
  if (!timestamp) return 'time not recorded';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return 'time not recorded';
  }
};

const formatCompactTime = (timestamp?: number): string => {
  if (!timestamp) return 'unknown time';
  const diff = Date.now() - timestamp;
  if (diff > 0 && diff < 60_000) return 'just now';
  if (diff > 0 && diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff > 0 && diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}h ago`;
  if (diff > 0 && diff < 604_800_000) return `${Math.max(1, Math.round(diff / 86_400_000))}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const sourceLine = (item: ScienceFileItem): string => {
  const time = formatCompactTime(item.createdAt || item.modifiedAt);
  if (item.sourceKind === 'science') {
    return `${time} · ${item.source}${item.shortCommit ? ` · ${item.shortCommit}` : ''}`;
  }
  return `${time} · Project file`;
};

const makeFileId = (path: string, role: string, artifactId?: string): string =>
  `${normalizePath(path)}::${role}::${artifactId || 'project'}`;

const makeScienceItems = (
  workspace: string,
  panel: SciencePanelData,
  index?: ScienceProjectIndex | null
): ScienceFileItem[] => {
  const items = new Map<string, ScienceFileItem>();
  const addRef = (
    ref: ReturnType<typeof collectSciencePanelFiles>[number],
    sourcePanel: SciencePanelData,
    group: string
  ) => {
    const key = makeFileId(ref.path, ref.role, ref.artifactId);
    if (items.has(key)) return;
    items.set(key, {
      id: key,
      name: getFileNameFromSciencePath(ref.path),
      path: ref.path,
      relativePath: ref.relativePath || toWorkspaceRelativePath(workspace, ref.path),
      role: ref.role,
      group,
      source: ref.sourceTitle || ref.artifact.title || group,
      sourceKind: 'science',
      artifact: ref.artifact,
      panel: sourcePanel,
      createdAt: ref.createdAt || ref.artifact.createdAt,
      shortCommit: ref.shortCommit || ref.artifact.git?.shortCommit || sourcePanel.git?.shortCommit,
      status: ref.status || ref.artifact.status,
    });
  };

  collectSciencePanelFiles(workspace, panel).forEach((ref) => addRef(ref, panel, panel.report.title || 'Current report'));
  index?.runs.forEach((run) => {
    run.artifacts.forEach((ref) => addRef(ref, run.panel, run.title || run.runId));
  });
  return Array.from(items.values());
};

const ScienceFilePreviewThumb: React.FC<{ item: ScienceFileItem }> = ({ item }) => {
  if (isImagePath(item.path)) {
    return (
      <div className='science-files-thumb science-files-thumb--image'>
        <img src={toLocalFileHref(item.path)} alt='' loading='lazy' />
      </div>
    );
  }

  if (isTablePath(item.path)) {
    return (
      <div className='science-files-thumb science-files-thumb--table' aria-hidden='true'>
        {Array.from({ length: 18 }).map((_, index) => (
          <span key={index} className={index % 5 === 0 || index % 7 === 0 ? 'is-strong' : undefined} />
        ))}
      </div>
    );
  }

  return (
    <div className='science-files-thumb science-files-thumb--file' aria-hidden='true'>
      {isTextPath(item.path) ? <IconFile fontSize={28} /> : <IconFileImage fontSize={28} />}
      <span>{item.name.split('.').pop()?.toUpperCase() || 'FILE'}</span>
    </div>
  );
};

export interface ScienceFilesViewProps {
  panel: SciencePanelData;
  workspace?: string;
}

const ScienceFilesView: React.FC<ScienceFilesViewProps> = ({ panel, workspace }) => {
  const effectiveWorkspace = workspace || panel.projectRoot || '';
  const openLocalFilePreview = useLocalFilePreview(effectiveWorkspace);
  const [viewMode, setViewMode] = useState<ScienceFilesViewMode>('grid');
  const [query, setQuery] = useState('');
  const [projectIndex, setProjectIndex] = useState<ScienceProjectIndex | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<IWorkspaceFlatFile[]>([]);
  const [fileTimes, setFileTimes] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!effectiveWorkspace) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    Promise.allSettled([
      loadScienceProjectIndex(effectiveWorkspace, 18),
      ipcBridge.fs.listWorkspaceFiles.invoke({ root: effectiveWorkspace }),
    ])
      .then(([indexResult, filesResult]) => {
        if (cancelled) return;
        setProjectIndex(indexResult.status === 'fulfilled' ? indexResult.value : null);
        setWorkspaceFiles(filesResult.status === 'fulfilled' ? filesResult.value : []);
        if (indexResult.status === 'rejected' && filesResult.status === 'rejected') {
          setError('Files are unavailable for this project.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveWorkspace]);

  const scienceItems = useMemo(
    () => (effectiveWorkspace ? makeScienceItems(effectiveWorkspace, panel, projectIndex) : []),
    [effectiveWorkspace, panel, projectIndex]
  );

  useEffect(() => {
    if (!effectiveWorkspace || !workspaceFiles.length) return;
    let cancelled = false;
    const visibleFiles = workspaceFiles.filter((file) => !isHiddenWorkspaceFile(file)).slice(0, 240);
    Promise.allSettled(
      visibleFiles.map(async (file) => {
        const metadata = await ipcBridge.fs.getFileMetadata.invoke({
          path: file.fullPath,
          workspace: effectiveWorkspace,
        });
        return [normalizePath(file.fullPath), metadata?.lastModified] as const;
      })
    ).then((results) => {
      if (cancelled) return;
      const next = new Map<string, number>();
      results.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        const [path, modifiedAt] = result.value;
        if (modifiedAt) next.set(path, modifiedAt);
      });
      setFileTimes(next);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveWorkspace, workspaceFiles]);

  const items = useMemo(() => {
    const sciencePaths = new Set(scienceItems.map((item) => normalizePath(item.path)));
    const projectItems: ScienceFileItem[] = workspaceFiles
      .filter((file) => !isHiddenWorkspaceFile(file))
      .map((file) => {
        const resolved = resolveSciencePath(effectiveWorkspace, file.fullPath) || normalizePath(file.fullPath);
        return {
          id: makeFileId(resolved, 'project'),
          name: file.name || getFileNameFromSciencePath(resolved),
          path: resolved,
          relativePath: file.relativePath,
          role: 'project',
          group: 'Project files',
          source: 'Project file',
          sourceKind: 'project' as const,
          modifiedAt: fileTimes.get(normalizePath(resolved)),
        };
      })
      .filter((item) => !sciencePaths.has(normalizePath(item.path)));
    return [...scienceItems, ...projectItems];
  }, [effectiveWorkspace, fileTimes, scienceItems, workspaceFiles]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.name, item.relativePath, item.role, item.source, item.group]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [items, query]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ScienceFileItem[]>();
    filteredItems.forEach((item) => {
      const key = item.sourceKind === 'science' ? item.group : 'Project files';
      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    });
    return Array.from(groups.entries()).map(([group, groupItems]) => ({
      group,
      items: groupItems.toSorted((left, right) => {
        const leftTime = left.createdAt || left.modifiedAt || 0;
        const rightTime = right.createdAt || right.modifiedAt || 0;
        if (leftTime !== rightTime) return rightTime - leftTime;
        return left.name.localeCompare(right.name);
      }),
    }));
  }, [filteredItems]);

  const openItem = useCallback(
    (item: ScienceFileItem) => {
      void openLocalFilePreview(
        item.path,
        undefined,
        {
          title: item.artifact?.title || item.name,
          workspace: effectiveWorkspace,
          science: item.artifact
            ? {
                panel: item.panel || panel,
                artifactId: item.artifact.id,
                artifactVersion: item.artifact.version,
                workspaceView: true,
              }
            : undefined,
        },
        { replace: false }
      );
    },
    [effectiveWorkspace, openLocalFilePreview, panel]
  );

  const renderGridItem = (item: ScienceFileItem) => (
    <button key={item.id} type='button' className='science-files-card' onClick={() => openItem(item)}>
      <ScienceFilePreviewThumb item={item} />
      <span className='science-files-card__name'>{item.name}</span>
      <span className='science-files-card__meta'>{sourceLine(item)}</span>
      <span className='science-files-card__role'>{item.role}</span>
    </button>
  );

  const renderListItem = (item: ScienceFileItem) => (
    <button key={item.id} type='button' className='science-files-row' onClick={() => openItem(item)}>
      <FileTypeIcon node={{ name: item.name, relativePath: item.relativePath || item.name, isFile: true }} />
      <span className='science-files-row__name'>{item.name}</span>
      <span className='science-files-row__source'>{item.source}</span>
      <span className='science-files-row__role'>{item.role}</span>
      <span className='science-files-row__time'>{formatCompactTime(item.createdAt || item.modifiedAt)}</span>
      <span className='science-files-row__commit'>{item.shortCommit || item.status || ''}</span>
    </button>
  );

  return (
    <section className='science-files-view' data-testid='science-files-view'>
      <header className='science-files-view__header'>
        <div>
          <span>
            <OpenScienceIcon name='artifactDataset' size={14} visualScale={1.04} />
            Files
          </span>
          <h3>{panel.report.title || panel.question || 'Science project'}</h3>
        </div>
        <div className='science-files-view__summary'>
          <b>{filteredItems.length}</b>
          <span>{filteredItems.length === 1 ? 'file' : 'files'}</span>
        </div>
      </header>

      <div className='science-files-toolbar'>
        <label className='science-files-search'>
          <IconSearch fontSize={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Search files...'
            aria-label='Search Science files'
          />
        </label>
        <div className='science-files-toggle' aria-label='Switch file view'>
          <button
            type='button'
            className={classNames(viewMode === 'grid' && 'is-active')}
            onClick={() => setViewMode('grid')}
          >
            Grid
          </button>
          <button
            type='button'
            className={classNames(viewMode === 'list' && 'is-active')}
            onClick={() => setViewMode('list')}
          >
            List
          </button>
        </div>
      </div>

      <div className='science-files-scroll'>
        {loading ? <div className='science-files-empty'>Loading files...</div> : null}
        {error ? <div className='science-files-empty'>{error}</div> : null}
        {!loading && !error && !filteredItems.length ? (
          <div className='science-files-empty'>
            <IconFile fontSize={24} />
            <b>No files yet</b>
            <span>When science_artifact snapshots outputs, they will appear here with provenance.</span>
          </div>
        ) : null}

        {groupedItems.map(({ group, items: groupItems }) => (
          <section key={group} className='science-files-group'>
            <div className='science-files-group__heading'>
              <span>{group}</span>
              <em>
                {groupItems.length} · {formatTime(groupItems[0]?.createdAt || groupItems[0]?.modifiedAt)}
              </em>
            </div>
            <div className={viewMode === 'grid' ? 'science-files-grid' : 'science-files-list'}>
              {groupItems.map((item) => (viewMode === 'grid' ? renderGridItem(item) : renderListItem(item)))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
};

export default ScienceFilesView;
