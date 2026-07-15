/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  SCIENCE_PANEL_SCHEMA,
  normalizeSciencePanelData,
  type ScienceArtifact,
  type ScienceArtifactFileProvenanceRecord,
  type ScienceArtifactGitFile,
  type ScienceArtifactGitRef,
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

const safeDecodePath = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    try {
      return decodeURI(value);
    } catch {
      return value;
    }
  }
};

const normalizeDrivePath = (value: string): string => (/^\/[A-Za-z]:[\\/]/u.test(value) ? value.slice(1) : value);

const normalizePathInput = (value: string): string => {
  const trimmed = String(value || '').trim();
  if (/^file:/iu.test(trimmed)) {
    try {
      return normalizeDrivePath(safeDecodePath(new URL(trimmed).pathname));
    } catch {
      return normalizeDrivePath(safeDecodePath(trimmed.replace(/^file:(?:\/\/)?/iu, '')));
    }
  }
  return normalizeDrivePath(safeDecodePath(trimmed));
};

const isAbsolutePath = (value: string): boolean => /^([a-zA-Z]:[\\/]|\/|\\\\)/u.test(normalizePathInput(value));

const normalizePath = (value: string): string => normalizePathInput(value).replace(/\\/g, '/').replace(/\/+/g, '/');
const normalizeComparablePath = (value?: string): string =>
  normalizePath(String(value || ''))
    .replace(/^\.\/+/u, '')
    .replace(/\/$/u, '')
    .toLowerCase();

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

export const resolveSciencePreviewPath = (workspace?: string, maybePath?: string): string | undefined => {
  if (!maybePath) return undefined;
  const trimmed = maybePath.trim();
  if (!trimmed) return undefined;
  if (isAbsolutePath(trimmed) || !workspace) return normalizePath(trimmed);
  return resolveSciencePath(workspace, trimmed);
};

const artifactMatchesGitFile = (artifact: ScienceArtifact | undefined, file: ScienceArtifactGitFile): boolean => {
  if (!artifact) return true;
  if (!file.artifactId) return true;
  if (file.artifactId !== artifact.id) return false;
  return file.artifactVersion == null || artifact.version == null || file.artifactVersion === artifact.version;
};

const storedPathFromGitFile = (
  git: ScienceArtifactGitRef | undefined,
  file: ScienceArtifactGitFile
): string | undefined => {
  if (file.mode !== 'copied' || !file.storedPath) return undefined;
  if (isAbsolutePath(file.storedPath)) return normalizePath(file.storedPath);
  if (!git?.repoPath) return undefined;
  return normalizePath(`${git.repoPath.replace(/\/$/u, '')}/${file.storedPath.replace(/^\/+/u, '')}`);
};

export const resolveScienceAttachmentStoredPath = (
  workspace: string | undefined,
  panel: SciencePanelData | undefined,
  maybePath: string | undefined
): string | undefined => {
  if (!maybePath || !panel?.attachments?.length) return undefined;
  const comparablePath = normalizeComparablePath(maybePath);
  const attachment = panel.attachments.find(
    (candidate) =>
      candidate.uri === maybePath ||
      (candidate.sourcePath && normalizeComparablePath(candidate.sourcePath) === comparablePath)
  );
  if (!attachment) return undefined;

  const artifact = panel.artifacts.find(
    (candidate) => candidate.id === attachment.artifactId && (candidate.version || 1) === attachment.version
  );
  for (const git of [artifact?.git, panel.git]) {
    const file = git?.files?.find(
      (candidate) =>
        candidate.mode === 'copied' &&
        candidate.artifactId === attachment.artifactId &&
        (candidate.artifactVersion || 1) === attachment.version &&
        candidate.sha256 === attachment.contentHash
    );
    if (!file) continue;
    const storedPath = storedPathFromGitFile(git, file);
    if (storedPath) return storedPath;
  }

  return attachment.sourcePath
    ? resolveSciencePreviewPath(workspace || panel.projectRoot, attachment.sourcePath)
    : undefined;
};

export const resolveScienceArtifactStoredPath = (
  workspace: string | undefined,
  panel: SciencePanelData | undefined,
  maybePath: string | undefined,
  artifact?: ScienceArtifact
): string | undefined => {
  if (!maybePath || !panel) return undefined;
  const attachmentPath = resolveScienceAttachmentStoredPath(workspace, panel, maybePath);
  if (attachmentPath) return attachmentPath;
  const directPath = resolveSciencePreviewPath(workspace || panel.projectRoot, maybePath);
  const keys = new Set<string>(
    [maybePath, directPath, workspace ? toWorkspaceRelativePath(workspace, directPath) : undefined]
      .filter((item): item is string => Boolean(item))
      .map(normalizeComparablePath)
  );
  if (keys.size === 0) return undefined;

  const gitRefs: Array<ScienceArtifactGitRef | undefined> = [artifact?.git, panel.git];
  for (const git of gitRefs) {
    for (const file of git?.files || []) {
      if (!artifactMatchesGitFile(artifact, file)) continue;
      const fileKeys = [file.path, file.relativePath]
        .filter((item): item is string => Boolean(item))
        .map(normalizeComparablePath);
      if (!fileKeys.some((key) => keys.has(key))) continue;
      const storedPath = storedPathFromGitFile(git, file);
      if (storedPath) return storedPath;
    }
  }

  return undefined;
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
    return isSciencePanelData(parsed) ? normalizeSciencePanelData(parsed) : undefined;
  } catch {
    return undefined;
  }
};

const readFileOrNull = async (path: string, workspace?: string): Promise<string | null> => {
  try {
    return await ipcBridge.fs.readFile.invoke({ path, workspace });
  } catch {
    return null;
  }
};

const safeParseFileRecords = (raw: string | null): ScienceArtifactFileProvenanceRecord[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { files?: unknown };
    return Array.isArray(parsed.files)
      ? parsed.files.filter(
          (item): item is ScienceArtifactFileProvenanceRecord =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as ScienceArtifactFileProvenanceRecord).path === 'string'
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
  (Array.isArray(panel.artifacts) ? panel.artifacts : []).flatMap((artifact) =>
    collectScienceArtifactFiles(workspace, artifact)
  );

const panelSortTime = (panel: SciencePanelData): number =>
  Math.max(
    panel.generatedAt || 0,
    ...(Array.isArray(panel.artifacts) ? panel.artifacts : []).map((artifact) => artifact.createdAt || 0)
  );

type ProjectRunEntry = { runId: string; panelPath?: string; updatedAt?: number };

const parseProjectRunEntries = (raw: string | null): ProjectRunEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { runs?: unknown };
    if (!Array.isArray(parsed.runs)) return [];
    return parsed.runs
      .map((item) => {
        if (!item || typeof item !== 'object') return undefined;
        const record = item as { runId?: unknown; panelPath?: unknown; updatedAt?: unknown; generatedAt?: unknown };
        if (typeof record.runId !== 'string' || !record.runId.trim()) return undefined;
        const updatedAt =
          typeof record.updatedAt === 'number'
            ? record.updatedAt
            : typeof record.generatedAt === 'number'
              ? record.generatedAt
              : undefined;
        const entry: ProjectRunEntry = {
          runId: record.runId,
          panelPath: typeof record.panelPath === 'string' ? record.panelPath : undefined,
          updatedAt,
        };
        return entry;
      })
      .filter((item): item is ProjectRunEntry => Boolean(item));
  } catch {
    return [];
  }
};

const scienceArtifactsDir = (workspace: string): string =>
  normalizePath(`${workspace.replace(/\/$/u, '')}/.openscience/science-artifacts`);

const loadIndexedScienceRuns = async (
  workspace: string,
  limitRuns: number,
  enrichRef: (ref: ScienceArtifactFileRef) => ScienceArtifactFileRef
): Promise<ScienceProjectRunIndex[]> => {
  const artifactsDir = scienceArtifactsDir(workspace);
  const projectIndexPath = `${artifactsDir}/project-index.json`;
  const entries = parseProjectRunEntries(await readFileOrNull(projectIndexPath, workspace))
    .toSorted((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, Math.max(limitRuns, 1) * 2);

  const parsedRuns = await Promise.all(
    entries.map(async (entry): Promise<ScienceProjectRunIndex | undefined> => {
      const candidatePaths = [
        entry.panelPath ? resolveSciencePath(workspace, entry.panelPath) : undefined,
        `${artifactsDir}/runs/${entry.runId}/panel.json`,
      ].filter((item): item is string => Boolean(item));

      for (const panelPath of candidatePaths) {
        const panel = safeParsePanel(await readFileOrNull(panelPath, workspace));
        if (!panel) continue;
        const artifactFiles = collectSciencePanelFiles(workspace, panel).map(enrichRef);
        return {
          runId: panel.runId,
          panel,
          panelPath,
          panelRelativePath: toWorkspaceRelativePath(workspace, panelPath),
          title: panel.report?.title || panel.question || panel.runId,
          summary: panel.summary,
          updatedAt: panelSortTime(panel) || entry.updatedAt || 0,
          artifacts: artifactFiles,
        };
      }
      return undefined;
    })
  );

  return parsedRuns
    .filter((item): item is ScienceProjectRunIndex => Boolean(item))
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limitRuns);
};

export async function loadScienceProjectIndex(workspace: string, limitRuns = 12): Promise<ScienceProjectIndex> {
  const filesByPath = new Map<string, ScienceArtifactFileRef & { panel: SciencePanelData; panelPath: string }>();
  if (!workspace) {
    return { workspace, runs: [], filesByPath };
  }

  const directFileIndexPath = `${scienceArtifactsDir(workspace)}/file-index.json`;
  let files = await ipcBridge.fs.listWorkspaceFiles.invoke({ root: workspace });
  const fileIndexEntry = files.find((item) =>
    /(^|\/)\.openscience\/science-artifacts\/file-index\.json$/u.test(normalizePath(item.relativePath || item.fullPath))
  );
  const fileRecords = safeParseFileRecords(await readFileOrNull(directFileIndexPath, workspace)).concat(
    fileIndexEntry ? safeParseFileRecords(await readFileOrNull(fileIndexEntry.fullPath, workspace)) : []
  );
  const fileRecordsByKey = new Map<string, ScienceArtifactFileProvenanceRecord>();
  for (const record of fileRecords) {
    [record.path, record.relativePath]
      .filter((item): item is string => Boolean(item))
      .forEach((item) => {
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
  const indexedRuns = await loadIndexedScienceRuns(workspace, limitRuns, enrichRef);

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

  const runsById = new Map<string, ScienceProjectRunIndex>();
  for (const run of indexedRuns) {
    runsById.set(run.runId, run);
  }
  for (const run of parsedRuns.filter((item): item is ScienceProjectRunIndex => Boolean(item))) {
    if (!runsById.has(run.runId)) {
      runsById.set(run.runId, run);
    }
  }

  const runs = Array.from(runsById.values())
    .filter((item): item is ScienceProjectRunIndex => Boolean(item))
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limitRuns);

  for (const run of runs) {
    for (const ref of run.artifacts) {
      const value = { ...ref, panel: run.panel, panelPath: run.panelPath };
      filesByPath.set(ref.path, value);
      if (ref.relativePath && run.panel.projectRoot) {
        const projectRootResolved = resolveSciencePath(run.panel.projectRoot, ref.relativePath);
        if (projectRootResolved) filesByPath.set(projectRootResolved, value);
      }
    }
  }

  return { workspace, runs, filesByPath };
}

export function findScienceFileProvenance(index: ScienceProjectIndex | undefined, filePath?: string) {
  if (!index || !filePath) return undefined;
  const resolved = resolveSciencePath(index.workspace, filePath);
  return resolved ? index.filesByPath.get(resolved) : undefined;
}
