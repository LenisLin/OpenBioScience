/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  SCIENCE_PANEL_SCHEMA,
  type ScienceArtifact,
  type ScienceArtifactFileProvenanceRecord,
  type ScienceArtifactSnapshotIncludePath,
  type SciencePanelData,
} from '@/common/chat/science';

export interface ScienceArtifactFileRef {
  artifact: ScienceArtifact;
  artifactId: string;
  artifactVersion: number;
  displayPath: string;
  path: string;
  relativePath?: string;
  role: ScienceArtifactSnapshotIncludePath['role'];
  createdAt?: number;
  shortCommit?: string;
  status?: ScienceArtifactFileProvenanceRecord['status'];
  sourceTitle?: string;
}

export interface ScienceProjectRunIndex {
  runId: string;
  panel: SciencePanelData;
  panelPath: string;
  panelRelativePath?: string;
  title: string;
  summary?: string;
  updatedAt: number;
  artifacts: ScienceArtifactFileRef[];
}

export interface ScienceProjectIndex {
  workspace: string;
  runs: ScienceProjectRunIndex[];
  filesByPath: Map<string, ScienceArtifactFileRef & { panel: SciencePanelData; panelPath: string }>;
}

const isAbsolutePath = (value: string): boolean => /^([a-zA-Z]:[\\/]|\/|\\\\)/u.test(value);

const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+/g, '/');

export const getFileNameFromSciencePath = (value: string): string => {
  const normalized = normalizePath(value);
  return normalized.split('/').pop() || value;
};

export const toWorkspaceRelativePath = (workspace: string, filePath?: string): string | undefined => {
  if (!filePath) return undefined;
  const normalizedWorkspace = normalizePath(workspace).replace(/\/$/u, '');
  const normalizedPath = normalizePath(filePath);
  if (!isAbsolutePath(filePath)) return normalizedPath;
  if (normalizedPath === normalizedWorkspace) return '.';
  if (normalizedPath.startsWith(`${normalizedWorkspace}/`)) {
    return normalizedPath.slice(normalizedWorkspace.length + 1);
  }
  return undefined;
};

export const resolveSciencePath = (workspace: string, maybePath?: string): string | undefined => {
  if (!maybePath) return undefined;
  const trimmed = maybePath.trim();
  if (!trimmed) return undefined;
  if (isAbsolutePath(trimmed)) return normalizePath(trimmed);
  return normalizePath(`${workspace.replace(/\/$/u, '')}/${trimmed.replace(/^\.?\//u, '')}`);
};

const isSciencePanelData = (value: unknown): value is SciencePanelData => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<SciencePanelData>;
  return candidate.schema === SCIENCE_PANEL_SCHEMA && typeof candidate.runId === 'string' && !!candidate.report;
};

const safeParsePanel = (raw: string | null): SciencePanelData | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isSciencePanelData(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const safeParseFileRecords = (raw: string | null): ScienceArtifactFileProvenanceRecord[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { files?: unknown };
    return Array.isArray(parsed.files)
      ? parsed.files.filter(
          (item): item is ScienceArtifactFileProvenanceRecord =>
            Boolean(item) && typeof item === 'object' && typeof (item as ScienceArtifactFileProvenanceRecord).path === 'string'
        )
      : [];
  } catch {
    return [];
  }
};

const pushFileRef = (
  refs: ScienceArtifactFileRef[],
  workspace: string,
  artifact: ScienceArtifact,
  role: ScienceArtifactFileRef['role'],
  maybePath?: string
): void => {
  const resolved = resolveSciencePath(workspace, maybePath);
  if (!resolved) return;
  if (refs.some((item) => item.path === resolved && item.artifactId === artifact.id && item.role === role)) return;
  refs.push({
    artifact,
    artifactId: artifact.id,
    artifactVersion: artifact.version || 1,
    displayPath: maybePath || resolved,
    path: resolved,
    relativePath: toWorkspaceRelativePath(workspace, resolved),
    role,
  });
};

export const collectScienceArtifactFiles = (workspace: string, artifact: ScienceArtifact): ScienceArtifactFileRef[] => {
  const refs: ScienceArtifactFileRef[] = [];
  pushFileRef(refs, workspace, artifact, 'primary', artifact.primaryPath);
  pushFileRef(refs, workspace, artifact, 'preview', artifact.previewPath);
  pushFileRef(refs, workspace, artifact, 'thumbnail', artifact.thumbnailPath);
  pushFileRef(refs, workspace, artifact, 'code', artifact.code?.path || artifact.execution?.scriptPath);
  pushFileRef(refs, workspace, artifact, 'log', artifact.execution?.logPath);
  artifact.sourcePaths?.forEach((item) => pushFileRef(refs, workspace, artifact, 'source', item));
  artifact.inputPaths?.forEach((item) => pushFileRef(refs, workspace, artifact, 'input', item));
  artifact.outputPaths?.forEach((item) => pushFileRef(refs, workspace, artifact, 'output', item));
  artifact.inputs?.forEach((item) => pushFileRef(refs, workspace, artifact, 'input', item.path));
  return refs;
};

export const collectSciencePanelFiles = (workspace: string, panel: SciencePanelData): ScienceArtifactFileRef[] =>
  panel.artifacts.flatMap((artifact) => collectScienceArtifactFiles(workspace, artifact));

const panelSortTime = (panel: SciencePanelData): number =>
  Math.max(panel.generatedAt || 0, ...panel.artifacts.map((artifact) => artifact.createdAt || 0));

export async function loadScienceProjectIndex(workspace: string, limitRuns = 12): Promise<ScienceProjectIndex> {
  const filesByPath = new Map<string, ScienceArtifactFileRef & { panel: SciencePanelData; panelPath: string }>();
  if (!workspace) {
    return { workspace, runs: [], filesByPath };
  }

  const files = await ipcBridge.fs.listWorkspaceFiles.invoke({ root: workspace });
  const fileIndexEntry = files.find((item) =>
    /(^|\/)\.openscience\/science-artifacts\/file-index\.json$/u.test(normalizePath(item.relativePath || item.fullPath))
  );
  const fileRecords = fileIndexEntry
    ? safeParseFileRecords(await ipcBridge.fs.readFile.invoke({ path: fileIndexEntry.fullPath, workspace }))
    : [];
  const fileRecordsByKey = new Map<string, ScienceArtifactFileProvenanceRecord>();
  for (const record of fileRecords) {
    [record.path, record.relativePath].filter((item): item is string => Boolean(item)).forEach((item) => {
      fileRecordsByKey.set(normalizePath(item), record);
      const resolved = resolveSciencePath(workspace, item);
      if (resolved) fileRecordsByKey.set(normalizePath(resolved), record);
    });
  }
  const enrichRef = (ref: ScienceArtifactFileRef): ScienceArtifactFileRef => {
    const record =
      fileRecordsByKey.get(normalizePath(ref.path)) ||
      (ref.relativePath ? fileRecordsByKey.get(normalizePath(ref.relativePath)) : undefined);
    if (!record) return ref;
    return {
      ...ref,
      createdAt: record.timestamp,
      shortCommit: record.shortCommit,
      status: record.status,
      sourceTitle: record.artifactTitle,
      role: record.role || ref.role,
    };
  };
  const panelFiles = files
    .filter((item) =>
      normalizePath(item.relativePath || item.fullPath).includes('.openscience/science-artifacts/runs/')
    )
    .filter((item) => /(^|\/)panel\.json$/u.test(normalizePath(item.relativePath || item.fullPath)));

  const parsedRuns = await Promise.all(
    panelFiles.map(async (item): Promise<ScienceProjectRunIndex | undefined> => {
      const raw = await ipcBridge.fs.readFile.invoke({ path: item.fullPath, workspace });
      const panel = safeParsePanel(raw);
      if (!panel) return undefined;

      const artifactFiles = collectSciencePanelFiles(workspace, panel).map(enrichRef);
      return {
        runId: panel.runId,
        panel,
        panelPath: item.fullPath,
        panelRelativePath: item.relativePath || toWorkspaceRelativePath(workspace, item.fullPath),
        title: panel.report?.title || panel.question || panel.runId,
        summary: panel.summary,
        updatedAt: panelSortTime(panel),
        artifacts: artifactFiles,
      };
    })
  );

  const runs = parsedRuns
    .filter((item): item is ScienceProjectRunIndex => Boolean(item))
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limitRuns);

  for (const run of runs) {
    for (const ref of run.artifacts) {
      filesByPath.set(ref.path, { ...ref, panel: run.panel, panelPath: run.panelPath });
    }
  }

  return { workspace, runs, filesByPath };
}

export function findScienceFileProvenance(index: ScienceProjectIndex | undefined, filePath?: string) {
  if (!index || !filePath) return undefined;
  const resolved = resolveSciencePath(index.workspace, filePath);
  return resolved ? index.filesByPath.get(resolved) : undefined;
}
