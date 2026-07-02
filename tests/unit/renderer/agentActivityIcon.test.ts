/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { iconForCommandIntent, statusIconForActivity } from '@/renderer/pages/conversation/Messages/agentActivityIcon';

describe('agentActivityIcon', () => {
  it('maps normalized status to canonical activity icons', () => {
    expect(statusIconForActivity('completed')).toEqual({ name: 'checkOne' });
    expect(statusIconForActivity('running')).toEqual({ name: 'loading', spin: true });
    expect(statusIconForActivity('error')).toEqual({ name: 'error' });
    expect(statusIconForActivity('canceled')).toEqual({ name: 'closeOne' });
    expect(statusIconForActivity('pending')).toEqual({ name: 'time' });
  });

  it.each([
    ['bun test tests/unit/chat/AgentSteps.dom.test.tsx', 'completed', { name: 'test' }],
    ['bun test tests/unit/chat/AgentSteps.dom.test.tsx', 'running', { name: 'loading', spin: true }],
    ['npm run build', 'completed', { name: 'build' }],
    ['pnpm install', 'completed', { name: 'install' }],
    ['git diff --stat', 'completed', { name: 'inspect' }],
    ['npm run dev', 'completed', { name: 'server' }],
    ['echo hello', 'completed', { name: 'terminal', spin: false }],
  ] as const)('maps command "%s" with %s status', (command, status, expected) => {
    expect(iconForCommandIntent(command, status)).toEqual(expected);
  });
});
