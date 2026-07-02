/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';

export type LoopGoalStatus = 'active' | 'paused' | 'deleted';

export type LoopGoalOptions = {
  max_iterations?: number;
  continue_when_idle?: boolean;
};

export type LoopGoalState = {
  id: string;
  goal: string;
  status: LoopGoalStatus;
  created_at: number;
  updated_at: number;
  started_at: number;
  last_resumed_at?: number;
  accumulated_active_ms: number;
  iteration_count: number;
  last_turn_id?: string;
  last_triggered_turn_id?: string;
  last_error?: string;
  options?: LoopGoalOptions;
};

export type LoopGoalConversationExtra = {
  loop_goal?: LoopGoalState;
};

const DEFAULT_GOAL_NAME_MAX = 42;

export const createLoopGoalState = (goal: string, now = Date.now()): LoopGoalState => ({
  id: uuid(),
  goal: goal.trim(),
  status: 'active',
  created_at: now,
  updated_at: now,
  started_at: now,
  last_resumed_at: now,
  accumulated_active_ms: 0,
  iteration_count: 0,
  options: {
    continue_when_idle: true,
  },
});

export const getLoopGoalFromExtra = (extra: unknown): LoopGoalState | undefined =>
  (extra as LoopGoalConversationExtra | undefined)?.loop_goal;

export const summarizeLoopGoal = (goal: string, maxLength = DEFAULT_GOAL_NAME_MAX): string => {
  const normalized = goal.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}...`;
};

export const getLoopGoalElapsedMs = (loopGoal: LoopGoalState, now = Date.now()): number => {
  const base = loopGoal.accumulated_active_ms || 0;
  if (loopGoal.status !== 'active' || !loopGoal.last_resumed_at) return base;
  return Math.max(0, base + now - loopGoal.last_resumed_at);
};

export const formatLoopGoalElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
};

export const pauseLoopGoal = (loopGoal: LoopGoalState, now = Date.now()): LoopGoalState => ({
  ...loopGoal,
  status: 'paused',
  updated_at: now,
  accumulated_active_ms: getLoopGoalElapsedMs(loopGoal, now),
  last_resumed_at: undefined,
});

export const resumeLoopGoal = (loopGoal: LoopGoalState, now = Date.now()): LoopGoalState => ({
  ...loopGoal,
  status: 'active',
  updated_at: now,
  last_resumed_at: now,
  last_error: undefined,
});

export const deleteLoopGoal = (loopGoal: LoopGoalState, now = Date.now()): LoopGoalState => ({
  ...pauseLoopGoal(loopGoal, now),
  status: 'deleted',
  updated_at: now,
});

export const updateLoopGoalText = (loopGoal: LoopGoalState, goal: string, now = Date.now()): LoopGoalState => ({
  ...loopGoal,
  goal: goal.trim(),
  updated_at: now,
});

export const buildLoopGoalKickoffPrompt = (loopGoal: LoopGoalState, userMessage?: string): string => {
  const trimmedUserMessage = userMessage?.trim();
  return [
    '# Loop Goal Mode',
    '',
    'You are starting a persistent Loop Goal. Work toward the user goal below, then finish this turn with a concise progress summary and the next concrete action you will take.',
    '',
    'Important rules:',
    '- Keep iterating toward the goal until the user pauses or deletes this Loop Goal.',
    '- Each turn should produce useful progress, not just restate the plan.',
    '- If you need user approval, missing credentials, or an external blocker prevents progress, say exactly what is blocked and stop asking for another loop until the blocker is resolved.',
    '- Prefer small verifiable steps. When code or files change, verify them before summarizing.',
    '',
    'User goal:',
    loopGoal.goal,
    trimmedUserMessage ? '' : undefined,
    trimmedUserMessage ? 'Additional user instruction for this first iteration:' : undefined,
    trimmedUserMessage || undefined,
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
};

export const buildLoopGoalContinuationPrompt = (loopGoal: LoopGoalState): string =>
  [
    '# Continue Loop Goal Mode',
    '',
    `Loop iteration: ${loopGoal.iteration_count + 1}`,
    '',
    'Continue working toward the same user goal. Use the previous result as context, choose the next useful step, execute it, and end with a concise progress summary plus the next action.',
    '',
    'Stop only if the loop was paused/deleted, the user changes direction, or you hit a real blocker that needs user input.',
    '',
    'User goal:',
    loopGoal.goal,
  ].join('\n');
