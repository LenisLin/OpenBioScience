/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentStepStatus } from '@/common/chat/agentStep';
import type { NormalizedToolStatus } from '@/common/chat/normalizeToolCall';
import type { AgentStatusIconName } from '@/renderer/components/icons/AgentStatusIcon';

export type ActivityIconSpec = {
  name: AgentStatusIconName;
  spin?: boolean;
};

export const statusIconForActivity = (status: AgentStepStatus | NormalizedToolStatus): ActivityIconSpec => {
  switch (status) {
    case 'completed':
      return { name: 'checkOne' };
    case 'error':
      return { name: 'error' };
    case 'canceled':
      return { name: 'closeOne' };
    case 'running':
      return { name: 'loading', spin: true };
    case 'pending':
    default:
      return { name: 'time' };
  }
};

const commandText = (value?: string): string => (value || '').toLowerCase();

export const iconForCommandIntent = (
  value?: string,
  status: AgentStepStatus | NormalizedToolStatus = 'completed'
): ActivityIconSpec => {
  const text = commandText(value);
  const isLive = status === 'running' || status === 'pending';
  const withSpin = (name: AgentStatusIconName): ActivityIconSpec => ({ name, spin: isLive && name === 'loading' });

  if (/\b(test|vitest|jest|playwright|pytest|cargo test|go test)\b/.test(text)) {
    return isLive ? { name: 'loading', spin: true } : { name: 'test' };
  }
  if (/\b(tsc|typecheck|type:check|ts:check|eslint|lint)\b/.test(text)) {
    return isLive ? { name: 'loading', spin: true } : { name: 'test' };
  }
  if (/\b(build|package|make|dist|compile|vite build)\b/.test(text)) {
    return isLive ? { name: 'loading', spin: true } : { name: 'build' };
  }
  if (/\b(install|add|bun i|npm i|pnpm i|yarn|pip install)\b/.test(text)) {
    return isLive ? { name: 'loading', spin: true } : { name: 'install' };
  }
  if (/\b(git status|git diff|git show|git log)\b/.test(text)) {
    return { name: 'inspect' };
  }
  if (/\b(dev|start|serve|preview)\b/.test(text)) {
    return isLive ? { name: 'loading', spin: true } : { name: 'server' };
  }
  return withSpin('terminal');
};
