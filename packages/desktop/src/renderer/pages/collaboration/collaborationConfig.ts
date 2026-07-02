/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

export type CollaborationModuleId = 'messages' | 'calendar' | 'docs' | 'tasks';

export interface CollaborationModule {
  id: CollaborationModuleId;
  path: string;
  url: string;
  labelKey: string;
  defaultLabel: string;
}

export const COLLABORATION_PARTITION = 'persist:deeporganiser-collaboration-feishu';

export const COLLABORATION_CONNECTED_STORAGE_KEY = 'deeporganiser.collaboration.feishu.connected';
export const COLLABORATION_WORKSPACE_ORIGIN_STORAGE_KEY = 'deeporganiser.collaboration.feishu.workspaceOrigin';
export const COLLABORATION_PREWARM_INITIAL_DELAY_MS = 1_200;
export const COLLABORATION_PREWARM_STEP_DELAY_MS = 900;

export const FEISHU_DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const FEISHU_APP_CONSOLE_URL = 'https://open.feishu.cn/app?lang=zh-CN';
export const DEFAULT_FEISHU_WEB_ORIGIN = 'https://www.feishu.cn';
const FEISHU_MESSAGES_WEB_PATH = '/next/messenger/';
const FEISHU_TASK_WEB_PATH = '/next/task/';

export const COLLABORATION_MODULES: CollaborationModule[] = [
  {
    id: 'messages',
    path: '/collaboration/messages',
    url: `${DEFAULT_FEISHU_WEB_ORIGIN}${FEISHU_MESSAGES_WEB_PATH}`,
    labelKey: 'common.collaboration.modules.messages',
    defaultLabel: 'Messages',
  },
  {
    id: 'calendar',
    path: '/collaboration/calendar',
    url: 'https://www.feishu.cn/calendar/',
    labelKey: 'common.collaboration.modules.calendar',
    defaultLabel: 'Calendar',
  },
  {
    id: 'docs',
    path: '/collaboration/docs',
    url: 'https://www.feishu.cn/drive/home/',
    labelKey: 'common.collaboration.modules.docs',
    defaultLabel: 'Docs',
  },
  {
    id: 'tasks',
    path: '/collaboration/tasks',
    url: `${DEFAULT_FEISHU_WEB_ORIGIN}${FEISHU_TASK_WEB_PATH}`,
    labelKey: 'common.collaboration.modules.tasks',
    defaultLabel: 'Tasks',
  },
];

export function getCollaborationModule(moduleId?: string): CollaborationModule {
  const module = COLLABORATION_MODULES.find((item) => item.id === moduleId) ?? COLLABORATION_MODULES[0];
  if (module.id === 'messages') {
    return {
      ...module,
      url: `${getStoredFeishuWorkspaceOrigin()}${FEISHU_MESSAGES_WEB_PATH}`,
    };
  }

  if (module.id !== 'tasks') return module;

  return {
    ...module,
    url: `${getStoredFeishuWorkspaceOrigin()}${FEISHU_TASK_WEB_PATH}`,
  };
}

export function getCollaborationPanelId(moduleId: CollaborationModuleId, pageKey = 0): string {
  return pageKey > 0 ? `collaboration-${moduleId}-${pageKey}` : `collaboration-${moduleId}`;
}

function isFeishuWebHost(host: string): boolean {
  return host === 'feishu.cn' || host.endsWith('.feishu.cn');
}

function isClientOrConsoleHost(host: string): boolean {
  return host === 'applink.feishu.cn' || host === 'open.feishu.cn';
}

function isTenantWorkspaceHost(host: string): boolean {
  if (!isFeishuWebHost(host) || isClientOrConsoleHost(host)) return false;
  return !['feishu.cn', 'www.feishu.cn', 'my.feishu.cn'].includes(host);
}

export function rememberFeishuWorkspaceOrigin(rawUrl: string): void {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (!isTenantWorkspaceHost(host) || isFeishuLoginUrl(rawUrl)) return;
    if (typeof window === 'undefined') return;
    localStorage.setItem(COLLABORATION_WORKSPACE_ORIGIN_STORAGE_KEY, parsed.origin);
  } catch {
    // Ignore malformed navigation events from embedded web contents.
  }
}

export function getStoredFeishuWorkspaceOrigin(): string {
  if (typeof window === 'undefined') return DEFAULT_FEISHU_WEB_ORIGIN;
  const stored = localStorage.getItem(COLLABORATION_WORKSPACE_ORIGIN_STORAGE_KEY);
  if (!stored) return DEFAULT_FEISHU_WEB_ORIGIN;

  try {
    const parsed = new URL(stored);
    const host = parsed.hostname.toLowerCase();
    if (!isTenantWorkspaceHost(host) || isFeishuLoginUrl(stored)) {
      return DEFAULT_FEISHU_WEB_ORIGIN;
    }
    return parsed.origin;
  } catch {
    return DEFAULT_FEISHU_WEB_ORIGIN;
  }
}

export function isFeishuLoginUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    return (
      host.includes('passport.feishu.cn') ||
      host.includes('login.feishu.cn') ||
      host.includes('accounts.feishu.cn') ||
      path.includes('/login') ||
      path.includes('/accounts')
    );
  } catch {
    return false;
  }
}

export function isFeishuWorkspaceUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (isClientOrConsoleHost(host)) return false;
    return (host === 'feishu.cn' || host.endsWith('.feishu.cn')) && !isFeishuLoginUrl(rawUrl);
  } catch {
    return false;
  }
}
