/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLLABORATION_MODULES,
  COLLABORATION_WORKSPACE_ORIGIN_STORAGE_KEY,
  getCollaborationModule,
  rememberFeishuWorkspaceOrigin,
} from '@/renderer/pages/collaboration/collaborationConfig';

function createLocalStorageMock() {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
  };
}

describe('collaborationConfig', () => {
  beforeEach(() => {
    const storage = createLocalStorageMock();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the Feishu web task route instead of a desktop applink', () => {
    const tasks = getCollaborationModule('tasks');

    expect(tasks.url).toBe('https://www.feishu.cn/next/task/');
    expect(tasks.url).not.toContain('applink.feishu.cn');
  });

  it('remembers the tenant workspace origin for the tasks module', () => {
    localStorage.removeItem(COLLABORATION_WORKSPACE_ORIGIN_STORAGE_KEY);

    rememberFeishuWorkspaceOrigin('https://jik6rif43q.feishu.cn/messenger/');
    const tasks = getCollaborationModule('tasks');

    expect(tasks.url).toBe('https://jik6rif43q.feishu.cn/next/task/');
  });

  it('keeps collaboration module paths unique', () => {
    const paths = COLLABORATION_MODULES.map((module) => module.path);

    expect(new Set(paths).size).toBe(paths.length);
  });
});
