/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import {
  canUndoFileChanges,
  inspectUndoFileChanges,
  resolveUndoTargetPath,
  undoFileChanges,
} from '@/renderer/pages/conversation/Messages/utils/undoFileChanges';
import type { FileChangeInfo } from '@/renderer/utils/file/diffUtils';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      readFile: { invoke: vi.fn() },
      writeFile: { invoke: vi.fn() },
      removeEntry: { invoke: vi.fn() },
    },
  },
}));

const change = (diff: string, fullPath = 'src/app.ts'): FileChangeInfo => ({
  file_name: fullPath.split(/[\\/]/).pop() || fullPath,
  fullPath,
  insertions: 1,
  deletions: 0,
  diff,
});

describe('undoFileChanges', () => {
  beforeEach(() => {
    vi.mocked(ipcBridge.fs.readFile.invoke).mockReset();
    vi.mocked(ipcBridge.fs.writeFile.invoke).mockReset();
    vi.mocked(ipcBridge.fs.removeEntry.invoke).mockReset();
  });

  it('resolves relative patch paths against the workspace', () => {
    expect(resolveUndoTargetPath('/repo', 'src/app.ts')).toBe('/repo/src/app.ts');
    expect(resolveUndoTargetPath('/repo', '/tmp/app.ts')).toBe('/tmp/app.ts');
    expect(resolveUndoTargetPath('C:\\repo', 'src/app.ts')).toBe('C:\\repo\\src\\app.ts');
  });

  it('applies a reverse patch to restore a modified file', async () => {
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('a\nc\nb\n');
    vi.mocked(ipcBridge.fs.writeFile.invoke).mockResolvedValue(true);

    const result = await undoFileChanges(
      [change(['--- a/src/app.ts', '+++ b/src/app.ts', '@@ -1,2 +1,3 @@', ' a', '+c', ' b', ''].join('\n'))],
      '/repo'
    );

    expect(result).toEqual({ undone: 1, failed: [] });
    expect(ipcBridge.fs.readFile.invoke).toHaveBeenCalledWith({ path: '/repo/src/app.ts', workspace: '/repo' });
    expect(ipcBridge.fs.writeFile.invoke).toHaveBeenCalledWith({ path: '/repo/src/app.ts', data: 'a\nb\n' });
  });

  it('removes files created from /dev/null diffs', async () => {
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('export const value = 1;\n');

    const result = await undoFileChanges(
      [
        change(
          ['--- /dev/null', '+++ b/src/new.ts', '@@ -0,0 +1 @@', '+export const value = 1;', ''].join('\n'),
          'src/new.ts'
        ),
      ],
      '/repo'
    );

    expect(result).toEqual({ undone: 1, failed: [] });
    expect(ipcBridge.fs.readFile.invoke).toHaveBeenCalledWith({ path: '/repo/src/new.ts', workspace: '/repo' });
    expect(ipcBridge.fs.removeEntry.invoke).toHaveBeenCalledWith({ path: '/repo/src/new.ts' });
    expect(ipcBridge.fs.writeFile.invoke).not.toHaveBeenCalled();
  });

  it('reports patch failures without writing over the file', async () => {
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('different\ncontent\n');

    const result = await undoFileChanges(
      [change(['--- a/src/app.ts', '+++ b/src/app.ts', '@@ -1,2 +1,3 @@', ' a', '+c', ' b', ''].join('\n'))],
      '/repo'
    );

    expect(result.undone).toBe(0);
    expect(result.failed).toEqual([{ path: '/repo/src/app.ts', reason: 'patch_failed' }]);
    expect(ipcBridge.fs.writeFile.invoke).not.toHaveBeenCalled();
  });

  it('detects changes that have already been undone', async () => {
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('a\nb\n');

    const inspection = await inspectUndoFileChanges(
      [change(['--- a/src/app.ts', '+++ b/src/app.ts', '@@ -1,2 +1,3 @@', ' a', '+c', ' b', ''].join('\n'))],
      '/repo'
    );

    expect(inspection.state).toBe('already_undone');
    expect(inspection.alreadyUndone).toHaveLength(1);

    const result = await undoFileChanges(
      [change(['--- a/src/app.ts', '+++ b/src/app.ts', '@@ -1,2 +1,3 @@', ' a', '+c', ' b', ''].join('\n'))],
      '/repo'
    );
    expect(result).toEqual({ undone: 0, failed: [] });
    expect(ipcBridge.fs.writeFile.invoke).not.toHaveBeenCalled();
  });

  it('blocks patches that resolve outside the workspace', async () => {
    const result = await undoFileChanges(
      [
        change(
          ['--- a/../outside.ts', '+++ b/../outside.ts', '@@ -1 +1 @@', '-old', '+new', ''].join('\n'),
          '../outside.ts'
        ),
      ],
      '/repo'
    );

    expect(result).toEqual({ undone: 0, failed: [{ path: '/repo/../outside.ts', reason: 'outside_workspace' }] });
    expect(ipcBridge.fs.readFile.invoke).not.toHaveBeenCalled();
    expect(ipcBridge.fs.writeFile.invoke).not.toHaveBeenCalled();
  });

  it('rolls back earlier writes when a later file fails', async () => {
    const aDiff = ['--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1,2 @@', ' a', '+x', ''].join('\n');
    const bDiff = ['--- a/src/b.ts', '+++ b/src/b.ts', '@@ -1 +1,2 @@', ' b', '+y', ''].join('\n');

    vi.mocked(ipcBridge.fs.readFile.invoke).mockImplementation(({ path }) => {
      if (path === '/repo/src/a.ts') return Promise.resolve('a\nx\n');
      if (path === '/repo/src/b.ts') return Promise.resolve('b\ny\n');
      return Promise.resolve(null);
    });
    vi.mocked(ipcBridge.fs.writeFile.invoke).mockImplementation(({ path, data }) => {
      if (path === '/repo/src/b.ts' && data === 'b\n') return Promise.resolve(false);
      return Promise.resolve(true);
    });

    const result = await undoFileChanges([change(aDiff, 'src/a.ts'), change(bDiff, 'src/b.ts')], '/repo');

    expect(result).toEqual({ undone: 0, failed: [{ path: '/repo/src/b.ts', reason: 'write_failed' }] });
    expect(ipcBridge.fs.writeFile.invoke).toHaveBeenNthCalledWith(1, { path: '/repo/src/a.ts', data: 'a\n' });
    expect(ipcBridge.fs.writeFile.invoke).toHaveBeenNthCalledWith(2, { path: '/repo/src/b.ts', data: 'b\n' });
    expect(ipcBridge.fs.writeFile.invoke).toHaveBeenNthCalledWith(3, { path: '/repo/src/a.ts', data: 'a\nx\n' });
  });

  it('does not expose undo for invalid diffs', () => {
    expect(canUndoFileChanges([change('not a diff')])).toBe(false);
    expect(
      canUndoFileChanges([change(['--- a/a.txt', '+++ b/a.txt', '@@ -1 +1 @@', '-old', '+new', ''].join('\n'))])
    ).toBe(true);
  });
});
