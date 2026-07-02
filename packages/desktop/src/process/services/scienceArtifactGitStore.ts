/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ScienceArtifact,
  ScienceArtifactEvent,
  ScienceArtifactFileProvenanceHistoryItem,
  ScienceArtifactFileProvenanceRecord,
  ScienceArtifactFileProvenanceResult,
  ScienceArtifactGitFile,
  ScienceArtifactGitRef,
  ScienceArtifactSnapshotIncludePath,
  SciencePanelData,
} from '@/common/chat/science';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const OPENSCIENCE_DIR = '.openscience';
const SCIENCE_ARTIFACTS_DIR = 'science-artifacts';
const ARTIFACT_REPO_DIR = 'artifact-repo';
const PROJECT_SCHEMA = 'openscience.project.v1';
const FILE_INDEX_SCHEMA = 'openscience.science-artifact-file-index.v1';
const FILE_LEDGER_SCHEMA = 'openscience.science-artifact-file-ledger.v1';
const DEFAULT_MAX_COPY_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_HASH_BYTES = 256 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

export interface ScienceProjectInfo {
  projectId: string;
  projectRoot: string;
  openScienceRoot: string;
  artifactRepoPath: string;
  projectPath: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScienceArtifactSnapshotRequest {
  projectRoot?: string;
  panel: SciencePanelData;
  state: JsonRecord;
  events: ScienceArtifactEvent[];
  event?: ScienceArtifactEvent;
  target?: ScienceArtifactEvent['target'];
  includePaths?: ScienceArtifactSnapshotIncludePath[];
  message?: string;
}

export interface ScienceArtifactSnapshotResult extends ScienceArtifactGitRef {
  ok: boolean;
  projectId?: string;
  repoPath?: string;
  commit?: string;
  shortCommit?: string;
  snapshotPath?: string;
  runPath?: string;
  files: ScienceArtifactGitFile[];
  changedFiles?: string[];
  error?: string;
  warning?: string;
}

export interface ScienceArtifactHistoryItem {
  commit: string;
  shortCommit: string;
  subject: string;
  authoredAt?: string;
  changedFiles: string[];
}

export interface ScienceArtifactHistoryRequest {
  projectRoot?: string;
  runId?: string;
  artifactId?: string;
  artifactVersion?: number;
  limit?: number;
}

export interface ScienceArtifactHistoryResult {
  ok: boolean;
  project?: ScienceProjectInfo;
  head?: string;
  items: ScienceArtifactHistoryItem[];
  error?: string;
}

export interface ScienceArtifactExportRequest {
  projectRoot?: string;
  runId: string;
  commit?: string;
  exportTypes?: Array<
    'markdown' | 'html' | 'pdf' | 'notebook' | 'latex' | 'manifest' | 'panel' | 'run_bundle' | 'git_bundle'
  >;
  artifactIds?: string[];
  includeGitHistory?: boolean;
}

export interface ScienceArtifactExportResult {
  ok: boolean;
  project?: ScienceProjectInfo;
  exportId?: string;
  exportDir?: string;
  sourceCommit?: string;
  files: Array<{ type: string; path: string; contentHash?: string }>;
  error?: string;
}

export interface ScienceArtifactFileProvenanceRequest {
  projectRoot?: string;
  filePath: string;
  limit?: number;
}

const now = (): number => Date.now();

const toPosix = (value: string): string => value.replace(/\\/g, '/');

const safeSegment = (value: string, fallback = 'item'): string =>
  value
    .trim()
    .replace(/[^a-z0-9_.-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 120) || fallback;

const stableProjectId = (projectRoot: string): string =>
  `osp_${crypto.createHash('sha256').update(path.resolve(projectRoot)).digest('hex').slice(0, 16)}`;

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const readJson = <T>(filePath: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const writeJsonl = (filePath: string, values: unknown[]): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, values.map((value) => JSON.stringify(value)).join('\n') + (values.length ? '\n' : ''), 'utf8');
};

const appendJsonl = (filePath: string, values: unknown[]): void => {
  if (!values.length) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, values.map((value) => JSON.stringify(value)).join('\n') + '\n', 'utf8');
};

const readJsonl = <T>(filePath: string): T[] => {
  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
};

const hashFile = (filePath: string, maxBytes = DEFAULT_MAX_HASH_BYTES): string | undefined => {
  const stat = fs.statSync(filePath);
  if (stat.size > maxBytes) return undefined;
  const digest = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  digest.update(data);
  return digest.digest('hex');
};

const hashText = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

const isAbsolutePath = (value: string): boolean => path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/u.test(value);

const resolveProjectPath = (projectRoot: string, candidate?: string): string | undefined => {
  const text = String(candidate || '').trim();
  if (!text) return undefined;
  return path.resolve(isAbsolutePath(text) ? text : path.join(projectRoot, text));
};

const relativeToProject = (projectRoot: string, filePath: string): string | undefined => {
  const rel = path.relative(projectRoot, filePath);
  if (!rel || rel === '') return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
  return toPosix(rel);
};

const isInside = (root: string, candidate: string): boolean => {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

const git = (cwd: string, args: string[]) =>
  spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });

const gitOutput = (cwd: string, args: string[]): string | undefined => {
  const result = git(cwd, args);
  return result.status === 0 ? String(result.stdout || '').trim() : undefined;
};

const gitHead = (repoPath: string): string | undefined => gitOutput(repoPath, ['rev-parse', 'HEAD']);

const hasGitChanges = (repoPath: string): boolean => Boolean(gitOutput(repoPath, ['status', '--porcelain']));

const ensureLocalGitIdentity = (repoPath: string): void => {
  git(repoPath, ['config', 'user.name', 'OpenScience Artifact Bot']);
  git(repoPath, ['config', 'user.email', 'openscience-artifacts@local.invalid']);
};

const updateOpenScienceGitignore = (openScienceRoot: string): void => {
  const gitignorePath = path.join(openScienceRoot, '.gitignore');
  const lines = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8').split(/\r?\n/u)
    : [];
  const required = [`/${ARTIFACT_REPO_DIR}/`, '/exports/'];
  let changed = false;
  for (const item of required) {
    if (!lines.includes(item)) {
      lines.push(item);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(gitignorePath, `${lines.filter(Boolean).join('\n')}\n`, 'utf8');
};

export function ensureScienceProject(projectRoot?: string): ScienceProjectInfo | undefined {
  const root = String(projectRoot || '').trim();
  if (!root) return undefined;
  const resolvedRoot = path.resolve(root);
  const openScienceRoot = path.join(resolvedRoot, OPENSCIENCE_DIR);
  const projectPath = path.join(openScienceRoot, 'project.json');
  fs.mkdirSync(openScienceRoot, { recursive: true });
  updateOpenScienceGitignore(openScienceRoot);

  const existing = readJson<Partial<ScienceProjectInfo> & JsonRecord>(projectPath, {});
  const createdAt = typeof existing.createdAt === 'number' ? existing.createdAt : now();
  const projectId = typeof existing.projectId === 'string' && existing.projectId ? existing.projectId : stableProjectId(resolvedRoot);
  const project: ScienceProjectInfo = {
    projectId,
    projectRoot: resolvedRoot,
    openScienceRoot,
    artifactRepoPath: path.join(openScienceRoot, ARTIFACT_REPO_DIR),
    projectPath,
    createdAt,
    updatedAt: now(),
  };

  writeJson(projectPath, {
    schema: PROJECT_SCHEMA,
    ...project,
    artifactRepoRelativePath: `${OPENSCIENCE_DIR}/${ARTIFACT_REPO_DIR}`,
    scienceArtifactsRelativePath: `${OPENSCIENCE_DIR}/${SCIENCE_ARTIFACTS_DIR}`,
  });
  return project;
}

export function ensureScienceArtifactRepo(projectRoot?: string): ScienceProjectInfo | undefined {
  const project = ensureScienceProject(projectRoot);
  if (!project) return undefined;
  fs.mkdirSync(project.artifactRepoPath, { recursive: true });
  if (!fs.existsSync(path.join(project.artifactRepoPath, '.git'))) {
    const init = git(project.artifactRepoPath, ['init']);
    if (init.status !== 0) return project;
    ensureLocalGitIdentity(project.artifactRepoPath);
    git(project.artifactRepoPath, ['branch', '-M', 'main']);
    writeJson(path.join(project.artifactRepoPath, 'README.md'), {
      schema: 'openscience.artifact-repo.v1',
      projectId: project.projectId,
      projectRoot: project.projectRoot,
      createdAt: project.createdAt,
      note: 'OpenScience managed artifact provenance repository. Do not edit by hand unless you know the consequences.',
    });
    git(project.artifactRepoPath, ['add', '-A']);
    git(project.artifactRepoPath, ['commit', '-m', 'Initialize OpenScience artifact repository']);
  } else {
    ensureLocalGitIdentity(project.artifactRepoPath);
  }
  return project;
}

const deniedName = (name: string): boolean =>
  name === '.git' ||
  name === 'node_modules' ||
  name === '.venv' ||
  name === 'venv' ||
  name === '__pycache__' ||
  name === '.DS_Store' ||
  /^\.env(?:\.|$)/iu.test(name) ||
  /(?:^|[._-])(?:secret|token|credential|passwd|password)(?:[._-]|$)/iu.test(name) ||
  /(?:id_rsa|id_dsa|id_ed25519|\.pem$|\.key$|\.p12$|\.pfx$)/iu.test(name);

const shouldIgnorePath = (filePath: string, project: ScienceProjectInfo): boolean => {
  if (isInside(project.artifactRepoPath, filePath)) return true;
  const rel = relativeToProject(project.projectRoot, filePath);
  const segments = toPosix(rel || filePath).split('/');
  return segments.some((segment) => deniedName(segment));
};

const collectDeclaredArtifactPaths = (artifact: ScienceArtifact): ScienceArtifactSnapshotIncludePath[] => {
  const items: ScienceArtifactSnapshotIncludePath[] = [];
  const push = (pathValue: string | undefined, role: ScienceArtifactSnapshotIncludePath['role']) => {
    if (!pathValue) return;
    items.push({
      path: pathValue,
      role,
      artifactId: artifact.id,
      artifactVersion: artifact.version,
    });
  };
  push(artifact.primaryPath, 'primary');
  push(artifact.previewPath, 'preview');
  push(artifact.thumbnailPath, 'thumbnail');
  artifact.sourcePaths?.forEach((item) => push(item, 'source'));
  artifact.inputPaths?.forEach((item) => push(item, 'input'));
  artifact.outputPaths?.forEach((item) => push(item, 'output'));
  artifact.inputs?.forEach((input) => {
    const role = input.role === 'primary' || input.role === 'reference' ? input.role : 'input';
    push(input.path, role);
  });
  push(artifact.code?.path, 'code');
  push(artifact.execution?.scriptPath, 'code');
  push(artifact.execution?.logPath, 'log');
  push(artifact.environment?.lockfilePath, 'environment');
  return items;
};

const walkDirectory = (dirPath: string, project: ScienceProjectInfo): string[] => {
  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (deniedName(entry.name)) continue;
    const child = path.join(dirPath, entry.name);
    if (shouldIgnorePath(child, project)) continue;
    if (entry.isDirectory()) {
      files.push(...walkDirectory(child, project));
      continue;
    }
    if (entry.isFile()) files.push(child);
  }
  return files;
};

const storedFilePath = (
  runRoot: string,
  artifact: ScienceArtifact | undefined,
  include: ScienceArtifactSnapshotIncludePath,
  sourcePath: string,
  basePath: string
): string => {
  const role = safeSegment(include.role || 'file', 'file');
  const relativeSource =
    fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()
      ? path.relative(basePath, sourcePath)
      : path.basename(sourcePath);
  const safeRel = toPosix(relativeSource)
    .split('/')
    .map((segment) => safeSegment(segment, 'file'))
    .join('/');
  if (!artifact) {
    return path.join(runRoot, 'snapshots', safeSegment(include.snapshotId || 'manual'), 'files', role, safeRel);
  }
  return path.join(
    runRoot,
    'artifacts',
    safeSegment(artifact.id, 'artifact'),
    `v${artifact.version || 1}`,
    'files',
    role,
    safeRel
  );
};

const materializeFile = (
  project: ScienceProjectInfo,
  runRoot: string,
  artifact: ScienceArtifact | undefined,
  include: ScienceArtifactSnapshotIncludePath,
  sourcePath: string,
  basePath: string,
  maxCopyBytes: number
): ScienceArtifactGitFile => {
  const relativePath = relativeToProject(project.projectRoot, sourcePath);
  if (shouldIgnorePath(sourcePath, project)) {
    return {
      path: sourcePath,
      relativePath,
      role: include.role,
      artifactId: artifact?.id || include.artifactId,
      artifactVersion: artifact?.version || include.artifactVersion,
      mode: 'ignored',
      reason: 'secret_or_internal_path',
    };
  }
  if (!fs.existsSync(sourcePath)) {
    return {
      path: sourcePath,
      relativePath,
      role: include.role,
      artifactId: artifact?.id || include.artifactId,
      artifactVersion: artifact?.version || include.artifactVersion,
      mode: 'missing',
      reason: 'not_found',
    };
  }
  const stat = fs.statSync(sourcePath);
  const storedPath = storedFilePath(runRoot, artifact, include, sourcePath, basePath);
  const storedRelativePath = toPosix(path.relative(project.artifactRepoPath, storedPath));
  const base: Omit<ScienceArtifactGitFile, 'mode'> = {
    path: sourcePath,
    relativePath,
    role: include.role,
    artifactId: artifact?.id || include.artifactId,
    artifactVersion: artifact?.version || include.artifactVersion,
    sizeBytes: stat.size,
    sha256: stat.isFile() ? hashFile(sourcePath) : undefined,
  };
  if (!stat.isFile()) {
    return { ...base, mode: 'pointer', reason: 'not_a_file' };
  }
  if (stat.size > maxCopyBytes) {
    return { ...base, mode: 'pointer', reason: 'large_file' };
  }
  fs.mkdirSync(path.dirname(storedPath), { recursive: true });
  fs.copyFileSync(sourcePath, storedPath);
  return { ...base, mode: 'copied', storedPath: storedRelativePath };
};

const materializeIncludePath = (
  project: ScienceProjectInfo,
  runRoot: string,
  artifactsById: Map<string, ScienceArtifact>,
  include: ScienceArtifactSnapshotIncludePath,
  defaultArtifact?: ScienceArtifact,
  maxCopyBytes = DEFAULT_MAX_COPY_BYTES
): ScienceArtifactGitFile[] => {
  const resolved = resolveProjectPath(project.projectRoot, include.path);
  const artifact = include.artifactId ? artifactsById.get(include.artifactId) || defaultArtifact : defaultArtifact;
  if (!resolved) return [];
  if (!fs.existsSync(resolved)) {
    return [materializeFile(project, runRoot, artifact, include, resolved, resolved, maxCopyBytes)];
  }
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    if (include.recursive === false) {
      return [
        {
          path: resolved,
          relativePath: relativeToProject(project.projectRoot, resolved),
          role: include.role,
          artifactId: artifact?.id || include.artifactId,
          artifactVersion: artifact?.version || include.artifactVersion,
          mode: 'pointer',
          reason: 'directory_not_recursive',
        },
      ];
    }
    return walkDirectory(resolved, project).map((filePath) =>
      materializeFile(project, runRoot, artifact, include, filePath, resolved, maxCopyBytes)
    );
  }
  return [materializeFile(project, runRoot, artifact, include, resolved, resolved, maxCopyBytes)];
};

const groupFilesForArtifact = (
  files: ScienceArtifactGitFile[],
  artifact: ScienceArtifact
): ScienceArtifactGitFile[] =>
  files.filter(
    (item) =>
      item.artifactId === artifact.id &&
      (item.artifactVersion == null || artifact.version == null || item.artifactVersion === artifact.version)
  );

const normalizeComparablePath = (value?: string): string =>
  toPosix(String(value || '').trim()).replace(/\/+/gu, '/').replace(/^\.\//u, '');

const fileRecordKey = (record: Pick<ScienceArtifactFileProvenanceRecord, 'relativePath' | 'path'>): string =>
  normalizeComparablePath(record.relativePath || record.path);

const fileIndexPath = (project: ScienceProjectInfo): string =>
  path.join(project.openScienceRoot, SCIENCE_ARTIFACTS_DIR, 'file-index.json');

const fileLedgerPath = (project: ScienceProjectInfo): string =>
  path.join(project.openScienceRoot, SCIENCE_ARTIFACTS_DIR, 'file-ledger.jsonl');

const evidenceIdsForFile = (
  panel: SciencePanelData,
  artifact: ScienceArtifact | undefined,
  file: ScienceArtifactGitFile
): string[] => {
  const paths = new Set(
    [file.relativePath, file.path]
      .filter((item): item is string => Boolean(item))
      .map(normalizeComparablePath)
  );
  const ids = new Set<string>();
  artifact?.evidenceIds?.forEach((id) => ids.add(id));
  artifact?.inputs?.forEach((input) => {
    if (input.evidenceId && input.path && paths.has(normalizeComparablePath(input.path))) ids.add(input.evidenceId);
    if (input.evidenceId && !input.path) ids.add(input.evidenceId);
  });
  for (const evidence of panel.evidence) {
    if (artifact?.id && evidence.artifactId === artifact.id) ids.add(evidence.id);
    if (evidence.path && paths.has(normalizeComparablePath(evidence.path))) ids.add(evidence.id);
  }
  return [...ids];
};

const provenanceNodeIdsForFile = (
  panel: SciencePanelData,
  artifact: ScienceArtifact | undefined,
  file: ScienceArtifactGitFile
): string[] => {
  const paths = new Set(
    [file.relativePath, file.path]
      .filter((item): item is string => Boolean(item))
      .map(normalizeComparablePath)
  );
  const ids = new Set<string>();
  artifact?.provenanceNodeIds?.forEach((id) => ids.add(id));
  for (const node of panel.provenance) {
    if (artifact?.id && node.artifactId === artifact.id) ids.add(node.id);
    if (node.path && paths.has(normalizeComparablePath(node.path))) ids.add(node.id);
  }
  return [...ids];
};

const statusForRecord = (
  project: ScienceProjectInfo,
  record: ScienceArtifactFileProvenanceRecord
): ScienceArtifactFileProvenanceResult['status'] => {
  if (record.mode === 'ignored') return 'ignored';
  if (record.mode === 'pointer') return 'pointer';
  if (record.mode === 'missing') return 'missing';
  const sourcePath = resolveProjectPath(project.projectRoot, record.relativePath || record.path) || record.path;
  if (!fs.existsSync(sourcePath)) return 'missing';
  if (!record.sha256) return 'tracked';
  try {
    const currentHash = hashFile(sourcePath);
    return currentHash && currentHash !== record.sha256 ? 'modified' : 'tracked';
  } catch {
    return 'unknown';
  }
};

const updateFileIndex = (
  project: ScienceProjectInfo,
  panel: SciencePanelData,
  gitRef: Partial<ScienceArtifactSnapshotResult>,
  files: ScienceArtifactGitFile[],
  event?: ScienceArtifactEvent
): void => {
  const artifactsByKey = new Map(
    panel.artifacts.map((artifact) => [`${artifact.id}@${artifact.version || 1}`, artifact] as const)
  );
  const artifactsById = new Map(panel.artifacts.map((artifact) => [artifact.id, artifact] as const));
  const timestamp = event?.timestamp || now();
  const records: ScienceArtifactFileProvenanceRecord[] = files.map((file) => {
    const artifact =
      file.artifactId && file.artifactVersion
        ? artifactsByKey.get(`${file.artifactId}@${file.artifactVersion}`) || artifactsById.get(file.artifactId)
        : file.artifactId
          ? artifactsById.get(file.artifactId)
          : undefined;
    return {
      projectId: project.projectId,
      projectRoot: project.projectRoot,
      runId: panel.runId,
      conversationId: event?.conversationId,
      messageId: event?.messageId,
      toolCallId: event?.toolCallId,
      eventId: event?.eventId,
      action: event?.action,
      timestamp,
      path: file.path,
      relativePath: file.relativePath,
      role: file.role,
      artifactId: file.artifactId || artifact?.id,
      artifactVersion: file.artifactVersion || artifact?.version,
      artifactTitle: artifact?.title,
      artifactType: artifact?.type,
      evidenceIds: evidenceIdsForFile(panel, artifact, file),
      provenanceNodeIds: provenanceNodeIdsForFile(panel, artifact, file),
      mode: file.mode,
      storedPath: file.storedPath,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      reason: file.reason,
      commit: gitRef.commit,
      shortCommit: gitRef.shortCommit,
      snapshotPath: gitRef.snapshotPath,
      status: 'tracked',
    };
  });

  const previous = readJson<{ files?: ScienceArtifactFileProvenanceRecord[] }>(fileIndexPath(project), {});
  const byKey = new Map<string, ScienceArtifactFileProvenanceRecord>();
  for (const record of previous.files || []) {
    byKey.set(fileRecordKey(record), record);
  }
  for (const record of records) {
    byKey.set(fileRecordKey(record), { ...record, status: statusForRecord(project, record) });
  }
  writeJson(fileIndexPath(project), {
    schema: FILE_INDEX_SCHEMA,
    projectId: project.projectId,
    projectRoot: project.projectRoot,
    updatedAt: now(),
    files: [...byKey.values()]
      .toSorted((left, right) => (right.timestamp || 0) - (left.timestamp || 0))
      .slice(0, 2000),
  });
  appendJsonl(
    fileLedgerPath(project),
    records.map((record) => Object.assign({ schema: FILE_LEDGER_SCHEMA }, record, { status: statusForRecord(project, record) }))
  );
};

const updateProjectIndex = (
  project: ScienceProjectInfo,
  panel: SciencePanelData,
  gitRef: Partial<ScienceArtifactSnapshotResult>
): void => {
  const indexPath = path.join(project.openScienceRoot, SCIENCE_ARTIFACTS_DIR, 'project-index.json');
  const previous = readJson<JsonRecord>(indexPath, {});
  const runs = Array.isArray(previous.runs) ? previous.runs.filter((item) => (item as JsonRecord).runId !== panel.runId) : [];
  runs.unshift({
    runId: panel.runId,
    title: panel.report?.title || panel.question,
    summary: panel.summary,
    generatedAt: panel.generatedAt,
    status: panel.status,
    latestCommit: gitRef.commit,
    shortCommit: gitRef.shortCommit,
  });
  const artifacts = Array.isArray(previous.artifacts) ? previous.artifacts.filter((item) => (item as JsonRecord).runId !== panel.runId) : [];
  artifacts.unshift(
    ...panel.artifacts.map((artifact) => ({
      runId: panel.runId,
      artifactId: artifact.id,
      version: artifact.version,
      title: artifact.title,
      type: artifact.type,
      primaryPath: artifact.primaryPath,
      latestCommit: gitRef.commit,
      shortCommit: gitRef.shortCommit,
    }))
  );
  writeJson(indexPath, {
    schema: 'openscience.science-artifact-project-index.v1',
    projectId: project.projectId,
    projectRoot: project.projectRoot,
    updatedAt: now(),
    runs: runs.slice(0, 80),
    artifacts: artifacts.slice(0, 400),
  });
};

export function commitScienceArtifactSnapshot(
  request: ScienceArtifactSnapshotRequest
): ScienceArtifactSnapshotResult {
  const project = ensureScienceArtifactRepo(request.projectRoot);
  if (!project) {
    return {
      ok: false,
      files: [],
      status: 'unavailable',
      error: 'projectRoot is required for Science artifact git snapshots.',
    };
  }
  if (!fs.existsSync(path.join(project.artifactRepoPath, '.git'))) {
    return {
      ok: false,
      projectId: project.projectId,
      repoPath: project.artifactRepoPath,
      files: [],
      status: 'unavailable',
      error: 'git is unavailable or the artifact repository could not be initialized.',
    };
  }

  const maxCopyBytes = Number(process.env.OPENSCIENCE_ARTIFACT_GIT_MAX_COPY_BYTES || DEFAULT_MAX_COPY_BYTES);
  const panel = {
    ...request.panel,
    projectRoot: request.panel.projectRoot || project.projectRoot,
  } satisfies SciencePanelData;
  const runRoot = path.join(project.artifactRepoPath, 'runs', safeSegment(panel.runId, 'run'));
  const artifactsById = new Map(panel.artifacts.map((artifact) => [artifact.id, artifact]));
  const targetArtifact =
    request.target?.kind === 'artifact' && request.target.id
      ? panel.artifacts.find(
          (artifact) =>
            artifact.id === request.target?.id &&
            (request.target?.version == null || artifact.version === request.target.version)
        )
      : undefined;

  fs.mkdirSync(runRoot, { recursive: true });
  writeJson(path.join(runRoot, 'run.json'), {
    runId: panel.runId,
    projectId: project.projectId,
    question: panel.question,
    summary: panel.summary,
    status: panel.status,
    generatedAt: panel.generatedAt,
  });
  writeJson(path.join(runRoot, 'panel.json'), panel);
  writeJson(path.join(runRoot, 'state.json'), request.state);
  writeJsonl(path.join(runRoot, 'events.jsonl'), request.events);
  writeJson(path.join(runRoot, 'evidence', 'items.json'), panel.evidence);
  writeJson(path.join(runRoot, 'claims', 'items.json'), panel.claims || []);
  writeJson(path.join(runRoot, 'pages', 'items.json'), panel.pages || []);
  writeJson(path.join(runRoot, 'provenance', 'nodes.json'), panel.provenance);
  writeJson(path.join(runRoot, 'provenance', 'edges.json'), panel.edges || []);
  writeJson(path.join(runRoot, 'provenance', 'warnings.json'), panel.graphWarnings || []);
  writeJson(path.join(runRoot, 'skills', 'used-skills.json'), panel.usedSkills || []);

  const declaredPaths = panel.artifacts.flatMap(collectDeclaredArtifactPaths);
  const manualPaths = (request.includePaths || []).map((item) => {
    const next: ScienceArtifactSnapshotIncludePath = {
      path: item.path,
      role: item.role,
      recursive: item.recursive,
      snapshotId: request.event?.eventId,
      artifactId: item.artifactId || targetArtifact?.id,
      artifactVersion: item.artifactVersion || targetArtifact?.version,
    };
    return next;
  });
  const files = [...declaredPaths, ...manualPaths].flatMap((include) =>
    materializeIncludePath(project, runRoot, artifactsById, include, targetArtifact, maxCopyBytes)
  );

  for (const artifact of panel.artifacts) {
    const artifactRoot = path.join(runRoot, 'artifacts', safeSegment(artifact.id, 'artifact'), `v${artifact.version || 1}`);
    writeJson(path.join(artifactRoot, 'artifact.json'), artifact);
    writeJson(path.join(artifactRoot, 'files.json'), groupFilesForArtifact(files, artifact));
  }
  writeJson(path.join(runRoot, 'files.json'), files);

  const message =
    request.message ||
    [
      'science_artifact',
      request.event?.action || 'snapshot',
      `run=${panel.runId}`,
      request.target?.kind ? `target=${request.target.kind}:${request.target.id || 'current'}` : '',
      request.event?.eventId ? `event=${request.event.eventId}` : '',
    ]
      .filter(Boolean)
      .join(' ');

  git(project.artifactRepoPath, ['add', '-A']);
  const hadChanges = hasGitChanges(project.artifactRepoPath);
  if (hadChanges) {
    git(project.artifactRepoPath, ['commit', '-m', message]);
  }
  const commit = gitHead(project.artifactRepoPath);
  const shortCommit = commit ? commit.slice(0, 7) : undefined;
  const changedFiles = gitOutput(project.artifactRepoPath, ['show', '--name-only', '--pretty=format:', commit || 'HEAD'])
    ?.split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const result: ScienceArtifactSnapshotResult = {
    ok: true,
    projectId: project.projectId,
    repoPath: project.artifactRepoPath,
    commit,
    shortCommit,
    snapshotPath: toPosix(path.relative(project.artifactRepoPath, runRoot)),
    runPath: runRoot,
    files,
    changedFiles,
    status: hadChanges ? 'committed' : 'unchanged',
  };
  updateProjectIndex(project, panel, result);
  updateFileIndex(project, panel, result, files, request.event);
  return result;
}

export function resolveScienceArtifactFileProvenance(
  request: ScienceArtifactFileProvenanceRequest
): ScienceArtifactFileProvenanceResult {
  const project = ensureScienceProject(request.projectRoot);
  const filePath = String(request.filePath || '').trim();
  if (!project || !filePath) {
    return { ok: false, status: 'unknown', filePath, error: 'projectRoot and filePath are required.' };
  }

  const resolvedPath = resolveProjectPath(project.projectRoot, filePath) || filePath;
  const relativePath = relativeToProject(project.projectRoot, resolvedPath);
  const keys = new Set([normalizeComparablePath(filePath), normalizeComparablePath(resolvedPath)]);
  if (relativePath) keys.add(normalizeComparablePath(relativePath));

  const index = readJson<{ files?: ScienceArtifactFileProvenanceRecord[] }>(fileIndexPath(project), {});
  const indexedFiles = index.files || [];
  let matchedByHash = false;
  let currentHash: string | undefined;
  const recordByPath = indexedFiles
    .filter((item) => keys.has(fileRecordKey(item)) || keys.has(normalizeComparablePath(item.path)))
    .toSorted((left, right) => (right.timestamp || 0) - (left.timestamp || 0))[0];
  if (!recordByPath && fs.existsSync(resolvedPath)) {
    try {
      const stat = fs.statSync(resolvedPath);
      currentHash = stat.isFile() ? hashFile(resolvedPath) : undefined;
    } catch {
      currentHash = undefined;
    }
  }
  const record =
    recordByPath ||
    (currentHash
      ? indexedFiles
          .filter((item) => Boolean(item.sha256) && item.sha256 === currentHash)
          .toSorted((left, right) => (right.timestamp || 0) - (left.timestamp || 0))[0]
      : undefined);
  matchedByHash = Boolean(!recordByPath && record && currentHash);

  if (!record) {
    return {
      ok: true,
      status: 'untracked',
      filePath: resolvedPath,
      relativePath,
      projectId: project.projectId,
      projectRoot: project.projectRoot,
      history: [],
    };
  }

  const status = matchedByHash ? 'tracked' : statusForRecord(project, record);
  const limit = Math.max(1, Math.min(request.limit || 12, 50));
  const history: ScienceArtifactFileProvenanceHistoryItem[] = readJsonl<ScienceArtifactFileProvenanceRecord>(
    fileLedgerPath(project)
  )
    .filter(
      (item) =>
        keys.has(fileRecordKey(item)) ||
        keys.has(normalizeComparablePath(item.path)) ||
        (matchedByHash && Boolean(currentHash) && item.sha256 === currentHash)
    )
    .toSorted((left, right) => (right.timestamp || 0) - (left.timestamp || 0))
    .slice(0, limit)
    .map((item) => ({
      commit: item.commit,
      shortCommit: item.shortCommit,
      timestamp: item.timestamp,
      action: item.action,
      role: item.role,
      artifactId: item.artifactId,
      artifactVersion: item.artifactVersion,
      mode: item.mode,
    }));

  return {
    ok: true,
    status,
    filePath: resolvedPath,
    relativePath,
    projectId: project.projectId,
    projectRoot: project.projectRoot,
    record: { ...record, status },
    history,
  };
}

export function listScienceArtifactHistory(
  request: ScienceArtifactHistoryRequest
): ScienceArtifactHistoryResult {
  const project = ensureScienceArtifactRepo(request.projectRoot);
  if (!project || !fs.existsSync(path.join(project.artifactRepoPath, '.git'))) {
    return { ok: false, project, items: [], error: 'Science artifact repository is unavailable.' };
  }
  const limit = Math.max(1, Math.min(request.limit || 30, 200));
  const pathspec: string[] = [];
  if (request.runId) {
    let target = `runs/${safeSegment(request.runId, 'run')}`;
    if (request.artifactId) {
      target += `/artifacts/${safeSegment(request.artifactId, 'artifact')}`;
      if (request.artifactVersion) target += `/v${request.artifactVersion}`;
    }
    pathspec.push('--', target);
  }
  const format = '%H%x1f%h%x1f%ad%x1f%s';
  const result = git(project.artifactRepoPath, ['log', '--date=iso-strict', `--pretty=format:${format}`, `-n${limit}`, ...pathspec]);
  if (result.status !== 0) {
    return { ok: false, project, head: gitHead(project.artifactRepoPath), items: [], error: result.stderr || result.stdout };
  }
  const items = String(result.stdout || '')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [commit, shortCommit, authoredAt, subject] = line.split('\x1f');
      const changedFiles =
        gitOutput(project.artifactRepoPath, ['show', '--name-only', '--pretty=format:', commit, ...pathspec])?.split(/\r?\n/u).filter(Boolean) || [];
      return {
        commit,
        shortCommit,
        authoredAt,
        subject,
        changedFiles,
      };
    });
  return { ok: true, project, head: gitHead(project.artifactRepoPath), items };
}

const readGitJson = <T>(repoPath: string, commit: string, objectPath: string): T | undefined => {
  const raw = gitOutput(repoPath, ['show', `${commit}:${objectPath}`]);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

const panelToMarkdown = (panel: SciencePanelData, options: { includeHeader?: boolean } = {}): string => {
  const includeHeader = options.includeHeader !== false;
  const lines: string[] = includeHeader ? [`# ${panel.report.title || panel.question}`, '', `Run: \`${panel.runId}\``, ''] : [];
  if (panel.summary) lines.push(panel.summary, '');
  for (const section of panel.report.sections) {
    lines.push(`## ${section.heading}`, '');
    for (const block of section.blocks) {
      if (block.type === 'paragraph') lines.push(block.text, '');
      if (block.type === 'bullet_list') {
        block.items.forEach((item) => lines.push(`- ${item.text}`));
        lines.push('');
      }
      if (block.type === 'checklist') {
        block.items.forEach((item) => lines.push(`- [${item.status === 'done' || item.status === 'passed' ? 'x' : ' '}] ${item.label}${item.detail ? `: ${item.detail}` : ''}`));
        lines.push('');
      }
      if ('artifactId' in block) lines.push(`- Artifact: \`${block.artifactId}\``, '');
    }
  }
  if (panel.artifacts.length) {
    lines.push('## Artifacts', '');
    panel.artifacts.forEach((artifact) => {
      lines.push(`- \`${artifact.id}\` v${artifact.version}: ${artifact.title}${artifact.primaryPath ? ` (${artifact.primaryPath})` : ''}`);
    });
    lines.push('');
  }
  if (panel.evidence.length) {
    lines.push('## Reference Evidence', '');
    panel.evidence.forEach((evidence) => {
      lines.push(`- [${evidence.id}] ${evidence.title}${evidence.path ? ` — ${evidence.path}` : evidence.url ? ` — ${evidence.url}` : ''}`);
      if (evidence.summary) lines.push(`  - ${evidence.summary}`);
    });
    lines.push('');
  }
  if (panel.graphWarnings?.length) {
    lines.push('## Provenance Warnings', '');
    panel.graphWarnings.forEach((warning) => lines.push(`- ${warning.severity}: ${warning.message}`));
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

const renderInlineHtml = (value: string): string =>
  escapeHtml(value)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\[([A-Za-z]\d+)\]/gu, '<span class="evidence-ref">[$1]</span>');

const sourceTypeLabel = (value: string): string => value.replace(/_/gu, ' ');

const renderReportBlockHtml = (panel: SciencePanelData, block: SciencePanelData['report']['sections'][number]['blocks'][number]): string => {
  if (block.type === 'paragraph') return `<p>${renderInlineHtml(block.text)}</p>`;
  if (block.type === 'bullet_list') {
    return [
      '<ul class="report-list">',
      ...block.items.map((item) => `<li>${renderInlineHtml(item.text)}</li>`),
      '</ul>',
    ].join('\n');
  }
  if (block.type === 'checklist') {
    return [
      '<ul class="checklist">',
      ...block.items.map((item) => {
        const done = item.status === 'done' || item.status === 'passed';
        const detail = item.detail ? `<span class="muted"> - ${renderInlineHtml(item.detail)}</span>` : '';
        return `<li><span class="check">${done ? '&#10003;' : ''}</span><span>${renderInlineHtml(item.label)}${detail}</span></li>`;
      }),
      '</ul>',
    ].join('\n');
  }
  if ('artifactId' in block) {
    const artifact = panel.artifacts.find((item) => item.id === block.artifactId);
    return `<p class="artifact-ref">Artifact <code>${escapeHtml(block.artifactId)}</code>${artifact ? ` &middot; ${renderInlineHtml(artifact.title)}` : ''}</p>`;
  }
  return '';
};

const panelToHtml = (panel: SciencePanelData): string => {
  const title = panel.report.title || panel.question;
  const body = [
    '<header class="report-header">',
    '<div class="eyebrow">OpenScience artifact export</div>',
    `<h1>${renderInlineHtml(title)}</h1>`,
    '<div class="meta-grid">',
    `<div><span>Run</span><strong>${escapeHtml(panel.runId)}</strong></div>`,
    `<div><span>Status</span><strong>${escapeHtml(panel.status)}</strong></div>`,
    `<div><span>Artifacts</span><strong>${panel.artifacts.length}</strong></div>`,
    `<div><span>Evidence</span><strong>${panel.evidence.length}</strong></div>`,
    '</div>',
    '</header>',
    panel.summary
      ? `<section class="summary-block"><h2>Summary</h2><p>${renderInlineHtml(panel.summary)}</p></section>`
      : '',
    ...panel.report.sections.map((section) =>
      [
        '<section class="report-section">',
        `<h2>${renderInlineHtml(section.heading)}</h2>`,
        ...section.blocks.map((block) => renderReportBlockHtml(panel, block)),
        '</section>',
      ].join('\n')
    ),
    panel.artifacts.length
      ? [
          '<section class="report-section">',
          '<h2>Artifacts</h2>',
          '<div class="table-wrap"><table>',
          '<thead><tr><th>ID</th><th>Version</th><th>Title</th><th>Primary file</th></tr></thead>',
          '<tbody>',
          ...panel.artifacts.map(
            (artifact) =>
              `<tr><td><code>${escapeHtml(artifact.id)}</code></td><td>v${artifact.version}</td><td>${renderInlineHtml(artifact.title)}</td><td>${artifact.primaryPath ? `<code>${escapeHtml(artifact.primaryPath)}</code>` : '<span class="muted">-</span>'}</td></tr>`
          ),
          '</tbody></table></div>',
          '</section>',
        ].join('\n')
      : '',
    panel.evidence.length
      ? [
          '<section class="report-section">',
          '<h2>Reference Evidence</h2>',
          '<div class="evidence-list">',
          ...panel.evidence.map((evidence) =>
            [
              '<article class="evidence-card">',
              `<div class="evidence-title"><span class="evidence-ref">[${escapeHtml(evidence.id)}]</span><strong>${renderInlineHtml(evidence.title)}</strong></div>`,
              `<div class="evidence-meta">${escapeHtml(sourceTypeLabel(evidence.sourceType))} &middot; ${escapeHtml(evidence.confidence)}${evidence.path ? ` &middot; <code>${escapeHtml(evidence.path)}</code>` : evidence.url ? ` &middot; ${renderInlineHtml(evidence.url)}` : ''}</div>`,
              evidence.summary ? `<p>${renderInlineHtml(evidence.summary)}</p>` : '',
              '</article>',
            ].join('\n')
          ),
          '</div>',
          '</section>',
        ].join('\n')
      : '',
    panel.graphWarnings?.length
      ? [
          '<section class="report-section warning-section">',
          '<h2>Provenance Warnings</h2>',
          '<ul class="report-list">',
          ...panel.graphWarnings.map((warning) => `<li><strong>${escapeHtml(warning.severity)}</strong>: ${renderInlineHtml(warning.message)}</li>`),
          '</ul>',
          '</section>',
        ].join('\n')
      : '',
  ].join('\n');
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    '@page{size:A4;margin:20mm;}',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.58;color:#20242a;background:#fff;}',
    '.report-header{border-bottom:1px solid #d8dde3;padding:0 0 18px;margin:0 0 24px;}',
    '.eyebrow{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#68717d;font-weight:700;margin-bottom:8px;}',
    'h1{font-size:30px;line-height:1.16;margin:0 0 18px;font-weight:760;}',
    'h2{font-size:18px;line-height:1.25;margin:0 0 12px;font-weight:720;}',
    'p{margin:0 0 12px;}',
    'code{font-family:"SFMono-Regular","Roboto Mono",Consolas,monospace;background:#f3f5f7;border:1px solid #e4e8ee;border-radius:5px;padding:1px 5px;font-size:.92em;}',
    '.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}',
    '.meta-grid div{border:1px solid #e3e7ec;border-radius:8px;padding:10px 12px;background:#fafbfc;}',
    '.meta-grid span{display:block;color:#7a8491;font-size:11px;text-transform:uppercase;letter-spacing:.06em;}',
    '.meta-grid strong{display:block;margin-top:4px;font-size:14px;}',
    '.summary-block,.report-section{break-inside:avoid;margin:0 0 24px;}',
    '.report-section{border-top:1px solid #e6e9ee;padding-top:18px;}',
    '.report-list{margin:0 0 12px 18px;padding:0;}',
    '.report-list li{margin:5px 0;}',
    '.checklist{list-style:none;margin:0 0 12px;padding:0;}',
    '.checklist li{display:flex;gap:8px;margin:6px 0;}',
    '.check{width:16px;height:16px;border:1px solid #b8c0ca;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin-top:3px;}',
    '.artifact-ref{border-left:3px solid #6f7b88;padding-left:10px;color:#38414a;}',
    '.table-wrap{overflow:hidden;border:1px solid #e1e5ea;border-radius:8px;}',
    'table{width:100%;border-collapse:collapse;font-size:13px;}',
    'th,td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid #edf0f3;}',
    'th{background:#f7f8fa;color:#5e6773;font-size:11px;text-transform:uppercase;letter-spacing:.05em;}',
    'tr:last-child td{border-bottom:none;}',
    '.evidence-list{display:grid;gap:10px;}',
    '.evidence-card{border:1px solid #e1e5ea;border-radius:8px;padding:11px 12px;break-inside:avoid;}',
    '.evidence-title{display:flex;gap:8px;align-items:baseline;margin-bottom:4px;}',
    '.evidence-ref{font-family:"SFMono-Regular","Roboto Mono",Consolas,monospace;color:#2f5f9f;background:#eef4ff;border:1px solid #d7e4fb;border-radius:5px;padding:0 4px;font-size:.9em;}',
    '.evidence-meta,.muted{color:#77818e;}',
    '.warning-section{border-color:#ead6a3;}',
    '</style>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
};

const panelToNotebook = (panel: SciencePanelData): string => {
  const markdownCells = [
    `# ${panel.report.title || panel.question}\n\nRun: \`${panel.runId}\`\n\n${panel.summary || panel.question || ''}`,
    panelToMarkdown(panel, { includeHeader: false }),
  ];
  const artifactCells = panel.artifacts.flatMap((artifact) => {
    const cells: JsonRecord[] = [
      {
        cell_type: 'markdown',
        metadata: {},
        source: [
          `## ${artifact.title}\n\n`,
          `- artifact: \`${artifact.id}\`\n`,
          `- version: v${artifact.version}\n`,
          artifact.primaryPath ? `- primaryPath: \`${artifact.primaryPath}\`\n` : '',
          artifact.execution?.logPath ? `- logPath: \`${artifact.execution.logPath}\`\n` : '',
        ].filter(Boolean),
      },
    ];
    if (artifact.execution?.command || artifact.code?.path) {
      cells.push({
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '# Re-run this command in the original project environment when appropriate.\n',
          artifact.code?.path ? `# source: ${artifact.code.path}\n` : '',
          artifact.execution?.command || '',
          '\n',
        ].filter(Boolean),
      });
    }
    return cells;
  });
  const notebook = {
    cells: [
      ...markdownCells.map((source) => ({ cell_type: 'markdown', metadata: {}, source: source.split(/(?<=\n)/u) })),
      ...artifactCells,
    ],
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      openscience: {
        runId: panel.runId,
        generatedFrom: 'science artifact git snapshot',
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
  return `${JSON.stringify(notebook, null, 2)}\n`;
};

const escapeLatex = (value: string): string =>
  value
    .replace(/\\/gu, '\\textbackslash{}')
    .replace(/([#$%&_{}])/gu, '\\$1')
    .replace(/~/gu, '\\textasciitilde{}')
    .replace(/\^/gu, '\\textasciicircum{}');

const panelToLatex = (panel: SciencePanelData): string => {
  const lines: string[] = [
    '\\documentclass[11pt]{article}',
    '\\usepackage[margin=1in]{geometry}',
    '\\usepackage{hyperref}',
    '\\usepackage{longtable}',
    '\\title{' + escapeLatex(panel.report.title || panel.question) + '}',
    '\\date{}',
    '\\begin{document}',
    '\\maketitle',
    '\\noindent\\textbf{Run:} \\texttt{' + escapeLatex(panel.runId) + '}',
    '',
  ];
  if (panel.summary) lines.push(escapeLatex(panel.summary), '');
  for (const section of panel.report.sections) {
    lines.push('\\section*{' + escapeLatex(section.heading) + '}');
    for (const block of section.blocks) {
      if (block.type === 'paragraph') lines.push(escapeLatex(block.text), '');
      if (block.type === 'bullet_list') {
        lines.push('\\begin{itemize}');
        block.items.forEach((item) => lines.push('\\item ' + escapeLatex(item.text)));
        lines.push('\\end{itemize}', '');
      }
      if ('artifactId' in block) lines.push('\\noindent Artifact: \\texttt{' + escapeLatex(block.artifactId) + '}', '');
    }
  }
  if (panel.evidence.length) {
    lines.push('\\section*{Reference Evidence}', '\\begin{itemize}');
    panel.evidence.forEach((evidence) => {
      lines.push('\\item [' + escapeLatex(evidence.id) + '] ' + escapeLatex(evidence.title));
    });
    lines.push('\\end{itemize}');
  }
  lines.push('\\end{document}', '');
  return lines.join('\n');
};

export function exportScienceArtifactSnapshot(
  request: ScienceArtifactExportRequest
): ScienceArtifactExportResult {
  const project = ensureScienceArtifactRepo(request.projectRoot);
  if (!project || !fs.existsSync(path.join(project.artifactRepoPath, '.git'))) {
    return { ok: false, project, files: [], error: 'Science artifact repository is unavailable.' };
  }
  const sourceCommit = request.commit || gitHead(project.artifactRepoPath);
  if (!sourceCommit) return { ok: false, project, files: [], error: 'No Science artifact commit is available.' };
  const runSegment = safeSegment(request.runId, 'run');
  const panel = readGitJson<SciencePanelData>(project.artifactRepoPath, sourceCommit, `runs/${runSegment}/panel.json`);
  if (!panel) return { ok: false, project, files: [], error: `Run ${request.runId} is not available at commit ${sourceCommit}.` };

  const exportId = `export_${Date.now().toString(36)}_${sourceCommit.slice(0, 7)}`;
  const exportDir = path.join(project.openScienceRoot, 'exports', runSegment, exportId);
  fs.mkdirSync(exportDir, { recursive: true });
  const exportTypes = new Set(request.exportTypes?.length ? request.exportTypes : ['manifest', 'panel', 'markdown']);
  const files: ScienceArtifactExportResult['files'] = [];
  const writeExportFile = (type: string, filePath: string, content: string): void => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    files.push({ type, path: filePath, contentHash: hashText(content) });
  };
  if (exportTypes.has('panel')) {
    writeExportFile('panel', path.join(exportDir, 'panel.json'), `${JSON.stringify(panel, null, 2)}\n`);
  }
  if (exportTypes.has('markdown')) {
    writeExportFile('markdown', path.join(exportDir, 'report.md'), panelToMarkdown(panel));
  }
  if (exportTypes.has('html')) {
    writeExportFile('html', path.join(exportDir, 'report.html'), panelToHtml(panel));
  }
  if (exportTypes.has('notebook')) {
    writeExportFile('notebook', path.join(exportDir, 'analysis.ipynb'), panelToNotebook(panel));
  }
  if (exportTypes.has('latex')) {
    writeExportFile('latex', path.join(exportDir, 'manuscript.tex'), panelToLatex(panel));
  }
  if (exportTypes.has('run_bundle')) {
    const bundlePath = path.join(exportDir, 'run-bundle.zip');
    const bundle = git(project.artifactRepoPath, [
      'archive',
      '--format=zip',
      '--output',
      bundlePath,
      sourceCommit,
      `runs/${runSegment}`,
    ]);
    if (bundle.status !== 0 || !fs.existsSync(bundlePath)) {
      return {
        ok: false,
        project,
        exportId,
        exportDir,
        sourceCommit,
        files,
        error: bundle.stderr || bundle.stdout || 'Failed to create run bundle.',
      };
    }
    files.push({ type: 'run_bundle', path: bundlePath, contentHash: hashFile(bundlePath) });
  }
  if (exportTypes.has('git_bundle') || request.includeGitHistory) {
    const bundlePath = path.join(exportDir, 'artifact-history.bundle');
    const bundle = git(project.artifactRepoPath, ['bundle', 'create', bundlePath, '--all']);
    if (bundle.status !== 0 || !fs.existsSync(bundlePath)) {
      return {
        ok: false,
        project,
        exportId,
        exportDir,
        sourceCommit,
        files,
        error: bundle.stderr || bundle.stdout || 'Failed to create git history bundle.',
      };
    }
    const contentHash = hashFile(bundlePath);
    files.push({ type: 'git_bundle', path: bundlePath, contentHash });
  }
  const manifest = {
    schema: 'openscience.science-export.v1',
    projectId: project.projectId,
    projectRoot: project.projectRoot,
    runId: request.runId,
    exportId,
    exportedAt: now(),
    sourceCommit,
    sourcePanelHash: hashText(JSON.stringify(panel)),
    artifactIds: request.artifactIds?.length ? request.artifactIds : panel.artifacts.map((artifact) => artifact.id),
    evidenceIds: panel.evidence.map((evidence) => evidence.id),
    exports: files.map((file) => ({
      type: file.type,
      path: path.relative(exportDir, file.path),
      contentHash: file.contentHash,
    })),
    completeness: exportTypes.has('run_bundle') ? 'complete_with_pointers' : 'partial',
    note:
      'This export is generated from a frozen OpenScience artifact git snapshot. Large files may be represented by pointers in the artifact repo.',
  };
  if (exportTypes.has('manifest')) {
    writeExportFile('manifest', path.join(exportDir, 'export-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return {
    ok: true,
    project,
    exportId,
    exportDir,
    sourceCommit,
    files,
  };
}
