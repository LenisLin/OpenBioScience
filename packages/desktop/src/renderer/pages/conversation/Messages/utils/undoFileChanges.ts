/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FileChangeInfo } from '@/renderer/utils/file/diffUtils';
import { applyPatch, parsePatch, reversePatch } from 'diff';

type ParsedPatch = ReturnType<typeof parsePatch>[number];

const isAbsolutePath = (filePath: string): boolean => filePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(filePath);

const normalizeSlashes = (value: string): string => value.replace(/\\/g, '/');

const normalizePathForCompare = (value: string): string => {
  const normalized = normalizeSlashes(value);
  const prefixMatch = normalized.match(/^([A-Za-z]:)?\/?/);
  const prefix = prefixMatch?.[0] ?? '';
  const rest = normalized.slice(prefix.length);
  const parts: string[] = [];

  for (const part of rest.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  const joined = `${prefix}${parts.join('/')}`.replace(/\/+$/, '');
  return /^[A-Za-z]:/.test(joined) ? joined.toLowerCase() : joined;
};

const isPathInsideWorkspace = (workspace: string | undefined, targetPath: string): boolean => {
  if (!workspace) return false;
  const base = normalizePathForCompare(workspace);
  const target = normalizePathForCompare(targetPath);
  return target === base || target.startsWith(`${base}/`);
};

export const resolveUndoTargetPath = (workspace: string | undefined, filePath: string): string => {
  if (!workspace || isAbsolutePath(filePath)) return filePath;
  const separator = workspace.includes('\\') ? '\\' : '/';
  const base = workspace.replace(/[\\/]+$/, '');
  const relative = filePath.replace(/^[\\/]+/, '').replace(/[\\/]+/g, separator);
  return `${base}${separator}${relative}`;
};

const isDevNull = (fileName?: string): boolean => fileName === '/dev/null';

const normalizePatchPath = (fileName?: string): string | undefined => {
  if (!fileName || isDevNull(fileName)) return fileName;
  return fileName.replace(/^[ab][\\/]/, '');
};

const getPatchFileName = (patch: ParsedPatch): string | undefined =>
  normalizePatchPath(isDevNull(patch.newFileName) ? patch.oldFileName : patch.newFileName || patch.oldFileName);

const parseUndoPatches = (diff: string): ParsedPatch[] => parsePatch(diff) as ParsedPatch[];

export const canUndoFileChanges = (files: FileChangeInfo[]): boolean => {
  return files.some((file) => {
    if (!file.diff.trim()) return false;
    try {
      return parseUndoPatches(file.diff).some((patch: ParsedPatch) => patch.hunks.length > 0);
    } catch {
      return false;
    }
  });
};

export type UndoFailureReason =
  | 'read_failed'
  | 'patch_failed'
  | 'write_failed'
  | 'remove_failed'
  | 'invalid_diff'
  | 'outside_workspace'
  | 'rollback_failed';

export type UndoFileChangesResult = {
  undone: number;
  failed: Array<{ path: string; reason: UndoFailureReason }>;
};

export type UndoOperation = {
  path: string;
  kind: 'write' | 'remove';
  beforeContent: string | null;
  afterContent?: string;
};

export type UndoInspectionItem = {
  path: string;
  status: 'ready' | 'already_undone' | 'blocked';
  reason?: UndoFailureReason;
  operation?: UndoOperation;
};

export type UndoFileChangesInspection = {
  state: 'ready' | 'already_undone' | 'blocked';
  files: UndoInspectionItem[];
  operations: UndoOperation[];
  blocked: UndoInspectionItem[];
  alreadyUndone: UndoInspectionItem[];
};

type ReadUndoTargetResult =
  | { ok: true; exists: true; content: string }
  | { ok: true; exists: false; content: null }
  | { ok: false; exists: false; content: null };

const readUndoTarget = async (path: string, workspace?: string): Promise<ReadUndoTargetResult> => {
  try {
    const content = await ipcBridge.fs.readFile.invoke({ path, workspace });
    if (typeof content === 'string') {
      return { ok: true, exists: true, content };
    }
    return { ok: true, exists: false, content: null };
  } catch {
    return { ok: false, exists: false, content: null };
  }
};

const buildBlockedItem = (path: string, reason: UndoFailureReason): UndoInspectionItem => ({
  path,
  status: 'blocked',
  reason,
});

const inspectPatch = async (
  file: FileChangeInfo,
  patch: ParsedPatch,
  workspace?: string
): Promise<UndoInspectionItem> => {
  if (!patch.hunks.length) {
    return buildBlockedItem(file.fullPath, 'invalid_diff');
  }

  const patchFileName = getPatchFileName(patch) || file.fullPath;
  const targetPath = resolveUndoTargetPath(workspace, patchFileName);
  if (!isPathInsideWorkspace(workspace, targetPath)) {
    return buildBlockedItem(targetPath, 'outside_workspace');
  }

  const wasCreated = isDevNull(patch.oldFileName);
  const wasDeleted = isDevNull(patch.newFileName);
  const readResult = await readUndoTarget(targetPath, workspace);

  if (!readResult.ok) {
    return buildBlockedItem(targetPath, 'read_failed');
  }

  if (wasCreated && !readResult.exists) {
    return { path: targetPath, status: 'already_undone' };
  }

  const current = readResult.content ?? '';
  if (!readResult.exists && !wasDeleted) {
    return buildBlockedItem(targetPath, 'read_failed');
  }

  const reversed = reversePatch(patch) as ParsedPatch;
  const patched = applyPatch(current, reversed, { fuzzFactor: 0 });
  if (patched === false) {
    if (!wasCreated) {
      const forwardPatched = applyPatch(current, patch, { fuzzFactor: 0 });
      if (forwardPatched !== false) {
        return { path: targetPath, status: 'already_undone' };
      }
    }
    return buildBlockedItem(targetPath, 'patch_failed');
  }

  const operation: UndoOperation =
    wasCreated && patched.length === 0
      ? { path: targetPath, kind: 'remove', beforeContent: current }
      : { path: targetPath, kind: 'write', beforeContent: readResult.exists ? current : null, afterContent: patched };

  return {
    path: targetPath,
    status: 'ready',
    operation,
  };
};

export const inspectUndoFileChanges = async (
  files: FileChangeInfo[],
  workspace?: string
): Promise<UndoFileChangesInspection> => {
  const inspected: UndoInspectionItem[] = [];
  for (const file of files) {
    let patches: ParsedPatch[];
    try {
      patches = parseUndoPatches(file.diff);
    } catch {
      inspected.push(buildBlockedItem(file.fullPath, 'invalid_diff'));
      continue;
    }

    if (!patches.some((patch) => patch.hunks.length > 0)) {
      inspected.push(buildBlockedItem(file.fullPath, 'invalid_diff'));
      continue;
    }

    for (const patch of patches) {
      if (!patch.hunks.length) continue;
      inspected.push(await inspectPatch(file, patch, workspace));
    }
  }

  const operations = inspected.flatMap((item) => (item.operation ? [item.operation] : []));
  const blocked = inspected.filter((item) => item.status === 'blocked');
  const alreadyUndone = inspected.filter((item) => item.status === 'already_undone');

  return {
    state: blocked.length > 0 ? 'blocked' : operations.length > 0 ? 'ready' : 'already_undone',
    files: inspected,
    operations,
    blocked,
    alreadyUndone,
  };
};

const verifyOperationStillMatches = async (operation: UndoOperation, workspace?: string): Promise<boolean> => {
  const readResult = await readUndoTarget(operation.path, workspace);
  if (!readResult.ok) return false;
  return readResult.content === operation.beforeContent;
};

const rollbackOperations = async (operations: UndoOperation[]): Promise<boolean> => {
  for (const operation of [...operations].reverse()) {
    try {
      if (operation.beforeContent === null) {
        await ipcBridge.fs.removeEntry.invoke({ path: operation.path });
      } else {
        const ok = await ipcBridge.fs.writeFile.invoke({ path: operation.path, data: operation.beforeContent });
        if (!ok) return false;
      }
    } catch {
      return false;
    }
  }
  return true;
};

export const executeUndoPlan = async (
  inspection: UndoFileChangesInspection,
  workspace?: string
): Promise<UndoFileChangesResult> => {
  if (inspection.state !== 'ready') {
    return {
      undone: 0,
      failed: inspection.blocked.map((item) => ({
        path: item.path,
        reason: item.reason ?? 'patch_failed',
      })),
    };
  }

  const applied: UndoOperation[] = [];
  for (const operation of inspection.operations) {
    const stillMatches = await verifyOperationStillMatches(operation, workspace);
    if (!stillMatches) {
      return { undone: 0, failed: [{ path: operation.path, reason: 'patch_failed' }] };
    }
  }

  for (const operation of inspection.operations) {
    try {
      if (operation.kind === 'remove') {
        await ipcBridge.fs.removeEntry.invoke({ path: operation.path });
      } else {
        const ok = await ipcBridge.fs.writeFile.invoke({ path: operation.path, data: operation.afterContent ?? '' });
        if (!ok) {
          const rollbackOk = await rollbackOperations(applied);
          return {
            undone: 0,
            failed: [{ path: operation.path, reason: rollbackOk ? 'write_failed' : 'rollback_failed' }],
          };
        }
      }
      applied.push(operation);
    } catch {
      const rollbackOk = await rollbackOperations(applied);
      return {
        undone: 0,
        failed: [
          {
            path: operation.path,
            reason: rollbackOk ? (operation.kind === 'remove' ? 'remove_failed' : 'write_failed') : 'rollback_failed',
          },
        ],
      };
    }
  }

  return { undone: inspection.operations.length, failed: [] };
};

export const undoFileChanges = async (files: FileChangeInfo[], workspace?: string): Promise<UndoFileChangesResult> => {
  const inspection = await inspectUndoFileChanges(files, workspace);
  if (inspection.state === 'blocked') {
    return {
      undone: 0,
      failed: inspection.blocked.map((item) => ({
        path: item.path,
        reason: item.reason ?? 'patch_failed',
      })),
    };
  }

  if (inspection.state === 'already_undone') {
    return { undone: 0, failed: [] };
  }

  const result = await executeUndoPlan(inspection, workspace);
  return result;
};
