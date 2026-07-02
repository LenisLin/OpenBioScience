/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentActivitySummary,
  AgentCommandStep,
  AgentExploreChild,
  AgentExploreStep,
  AgentFileChangeStep,
  AgentImageStep,
  AgentStep,
  AgentStepStatus,
  AgentTodoPlanStep,
  AgentWebStep,
  ToolMessage,
} from '@/common/chat/agentStep';
import {
  hasRunningAgentSteps,
  normalizeAgentSteps,
  summarizeAgentActivity,
  summarizeAgentFileChanges,
  summarizeAgentTodoProgress,
} from '@/common/chat/agentStep';
import AgentStatusIcon from '@/renderer/components/icons/AgentStatusIcon';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { usePreviewLauncher } from '@/renderer/hooks/file/usePreviewLauncher';
import type { ConversationRuntimeView } from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import type { I18nKey } from '@/renderer/services/i18n';
import { extractContentFromDiff, parseDiff } from '@/renderer/utils/file/diffUtils';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { Popover } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import classNames from 'classnames';
import { createTwoFilesPatch } from 'diff';
import type { TFunction } from 'i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { iconForCommandIntent, statusIconForActivity, type ActivityIconSpec } from '../agentActivityIcon';
import './AgentSteps.css';

const isPendingStatus = (status: AgentStepStatus): boolean => status === 'running' || status === 'pending';

const getLatestTodoPlanStep = (steps: AgentStep[]): AgentTodoPlanStep | undefined =>
  steps.findLast(
    (step): step is AgentTodoPlanStep =>
      (step.kind === 'todo' || step.kind === 'plan') && (step as AgentTodoPlanStep).items.length > 0
  );

const padDurationUnit = (value: number): string => String(value).padStart(2, '0');

const getMessageTurnId = (message: ToolMessage): string | undefined =>
  (message as ToolMessage & { turn_id?: string }).turn_id;

const fallbackRuntimeView: ConversationRuntimeView = {
  conversation_id: '',
  activeTurnId: null,
  activeStartedAt: null,
  state: 'running',
  isProcessing: true,
  canSendMessage: false,
  pendingConfirmations: 0,
  hasBackendRuntime: false,
  localSubmitting: false,
  hydrated: true,
  localStopping: false,
};

const isLivePendingStatus = (status: AgentStepStatus, liveRunning: boolean): boolean =>
  liveRunning && isPendingStatus(status);

const isValidationCommandTitle = (title?: string): boolean =>
  /\b(test|tests|type check|checking types|build|building|install|installing)\b/i.test(title || '');

const isCreatingFileTitle = (title?: string): boolean => /^(Created|Creating|Failed to create)\b/i.test(title || '');

const iconForExploreChild = (child: AgentExploreChild, liveRunning: boolean): ActivityIconSpec => {
  if (child.status === 'running' || child.status === 'pending') {
    if (!liveRunning) return { name: 'time' };
    return child.kind === 'fetch'
      ? { name: 'webPage' }
      : child.kind === 'search'
        ? { name: 'globe' }
        : statusIconForActivity(child.status);
  }
  if (child.status === 'error' || child.status === 'canceled') return statusIconForActivity(child.status);
  switch (child.kind) {
    case 'read':
      return { name: 'fileText' };
    case 'grep':
    case 'glob':
      return { name: 'fileSearch' };
    case 'search':
      return { name: 'globe' };
    case 'fetch':
      return { name: 'webPage' };
    default:
      return statusIconForActivity(child.status);
  }
};

const iconForStep = (step: AgentStep, liveRunning = true): ActivityIconSpec => {
  if (step.status === 'error' || step.status === 'canceled') return statusIconForActivity(step.status);
  if (isPendingStatus(step.status) && !liveRunning) {
    return { name: 'time' };
  }
  if (step.kind === 'command' && isPendingStatus(step.status) && isValidationCommandTitle(step.title)) {
    return iconForCommandIntent(`${step.title} ${(step as AgentCommandStep).command || ''}`, step.status);
  }

  switch (step.kind) {
    case 'explore': {
      const explore = step as AgentExploreStep;
      const searchable = explore.children.find((child) => child.kind === 'grep' || child.kind === 'glob');
      const readable = explore.children.find((child) => child.kind === 'read');
      const webSearch = explore.children.find((child) => child.kind === 'search');
      const webFetch = explore.children.find((child) => child.kind === 'fetch');
      if (searchable) return { name: 'fileSearch' };
      if (readable) return { name: 'fileText' };
      if (webFetch) return { name: 'webPage' };
      if (webSearch) return { name: 'globe' };
      return statusIconForActivity(step.status);
    }
    case 'web':
      return /webfetch|fetchurl|fetch/i.test(step.rawName || step.title) ? { name: 'webPage' } : { name: 'globe' };
    case 'command':
      return iconForCommandIntent(`${step.title} ${(step as AgentCommandStep).command || ''}`, step.status);
    case 'file_change':
      return isCreatingFileTitle(step.title) ? { name: 'write' } : { name: 'fileEditing' };
    case 'todo':
    case 'plan':
      return { name: 'listCheckbox' };
    case 'mcp':
      return { name: 'tool' };
    case 'image':
      return { name: 'imageFiles' };
    default: {
      const raw = `${step.rawName || ''} ${step.title || ''}`.toLowerCase();
      if (/\b(read|viewfile|openfile)\b/.test(raw)) return { name: 'fileText' };
      if (/\b(grep|search|ripgrep|glob|findfiles|list|ls)\b/.test(raw)) return { name: 'fileSearch' };
      if (/\b(websearch|searchweb)\b/.test(raw)) return { name: 'globe' };
      if (/\b(webfetch|fetchurl|fetch)\b/.test(raw)) return { name: 'webPage' };
      if (/\b(write|createfile)\b/.test(raw)) return { name: 'write' };
      if (/\b(edit|replace|strreplace|updatefile)\b/.test(raw)) return { name: 'fileEditing' };
      if (/\b(bash|shell|exec|execute|run|command|terminal)\b/.test(raw)) return iconForCommandIntent(raw, step.status);
      return statusIconForActivity(step.status);
    }
  }
};

const iconForActivitySummary = (
  summary: AgentActivitySummary,
  activeStep: AgentStep,
  aggregateStatus: AgentStepStatus
): ActivityIconSpec => {
  if (aggregateStatus === 'error' || aggregateStatus === 'canceled') return statusIconForActivity(aggregateStatus);
  if (aggregateStatus === 'running' && activeStep.kind === 'command' && isValidationCommandTitle(activeStep.title)) {
    return iconForCommandIntent(
      `${activeStep.title} ${(activeStep as AgentCommandStep).command || ''}`,
      aggregateStatus
    );
  }
  switch (summary.primaryKind) {
    case 'file_change':
      return iconForStep(activeStep, aggregateStatus === 'running').name === 'write'
        ? { name: 'write' }
        : { name: 'fileEditing' };
    case 'todo':
      return { name: 'listCheckbox' };
    case 'command':
      return iconForCommandIntent(
        `${activeStep.title} ${(activeStep as AgentCommandStep).command || ''}`,
        aggregateStatus
      );
    case 'read':
      return { name: 'fileText' };
    case 'code_search':
      return { name: 'fileSearch' };
    case 'web_search':
      return { name: 'globe' };
    case 'web_fetch':
      return { name: 'webPage' };
    case 'mcp':
      return { name: 'tool' };
    case 'image':
      return { name: 'imageFiles' };
    case 'generic':
    default:
      return statusIconForActivity(aggregateStatus);
  }
};

const formatDuration = (durationMs: number, t: TFunction): string | undefined => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (totalSeconds === 0) {
    return undefined;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const separator = t('messages.agentSteps.duration.separator', { defaultValue: ' ' });
  const unit = (key: I18nKey, value: string | number, suffix: string) =>
    t(key, { value, defaultValue: `${value}${suffix}` });

  if (hours > 0) {
    return [
      unit('messages.agentSteps.duration.hour', hours, 'h'),
      unit('messages.agentSteps.duration.minute', padDurationUnit(minutes), 'm'),
      unit('messages.agentSteps.duration.second', padDurationUnit(seconds), 's'),
    ].join(separator);
  }
  if (minutes > 0) {
    return [
      unit('messages.agentSteps.duration.minute', minutes, 'm'),
      unit('messages.agentSteps.duration.second', padDurationUnit(seconds), 's'),
    ].join(separator);
  }
  return unit('messages.agentSteps.duration.second', seconds, 's');
};

const joinSummaryParts = (parts: string[], t: TFunction): string => {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) {
    return t('messages.agentSteps.summary.joinPair', {
      first: parts[0],
      second: parts[1],
      defaultValue: `${parts[0]} and ${parts[1]}`,
    });
  }
  return t('messages.agentSteps.summary.joinFinal', {
    items: parts.slice(0, -1).join(t('messages.agentSteps.summary.joinSeparator', { defaultValue: ', ' })),
    last: parts[parts.length - 1],
    defaultValue: `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`,
  });
};

const buildActivitySummaryParts = (summary: AgentActivitySummary, t: TFunction): string[] => {
  const { counts } = summary;
  if (summary.status === 'error') {
    if (counts.commands > 0) {
      return [t('messages.agentSteps.summary.commandFailed', { defaultValue: 'Command failed' })];
    }
    if (counts.fileChanges > 0) {
      return [t('messages.agentSteps.summary.fileChangeFailed', { defaultValue: 'File edit failed' })];
    }
    return [t('messages.agentSteps.summary.actionFailed', { defaultValue: 'Action failed' })];
  }

  const candidates = [
    counts.fileChanges > 0 &&
      t('messages.agentSteps.summary.editedFiles', {
        count: counts.fileChanges,
        defaultValue: `Edited ${counts.fileChanges} ${counts.fileChanges === 1 ? 'file' : 'files'}`,
      }),
    counts.filesRead > 0 &&
      t('messages.agentSteps.summary.readFiles', {
        count: counts.filesRead,
        defaultValue: `Read ${counts.filesRead} ${counts.filesRead === 1 ? 'file' : 'files'}`,
      }),
    counts.codeSearches > 0 &&
      t('messages.agentSteps.summary.searchedCode', {
        count: counts.codeSearches,
        defaultValue: 'Searched code',
      }),
    counts.commands > 0 &&
      t('messages.agentSteps.summary.ranCommands', {
        count: counts.commands,
        defaultValue: `Ran ${counts.commands} ${counts.commands === 1 ? 'command' : 'commands'}`,
      }),
    counts.failedCommands > 0 &&
      counts.failedCommands < counts.commands &&
      t('messages.agentSteps.summary.someCommandsFailed', {
        count: counts.failedCommands,
        defaultValue: `${counts.failedCommands} ${counts.failedCommands === 1 ? 'command' : 'commands'} failed`,
      }),
    counts.webSearches > 0 &&
      t('messages.agentSteps.summary.searchedWeb', {
        count: counts.webSearches,
        defaultValue: 'Searched web',
      }),
    counts.webFetches > 0 &&
      t('messages.agentSteps.summary.fetchedPages', {
        count: counts.webFetches,
        defaultValue: `Fetched ${counts.webFetches} ${counts.webFetches === 1 ? 'page' : 'pages'}`,
      }),
    counts.images > 0 &&
      t('messages.agentSteps.summary.generatedImages', {
        count: counts.images,
        defaultValue: `Generated ${counts.images} ${counts.images === 1 ? 'image' : 'images'}`,
      }),
    counts.mcpTools > 0 &&
      t('messages.agentSteps.summary.calledTools', {
        count: counts.mcpTools,
        defaultValue: `Called ${counts.mcpTools} ${counts.mcpTools === 1 ? 'tool' : 'tools'}`,
      }),
    counts.todoUpdates > 0 &&
      t('messages.agentSteps.summary.updatedTodos', {
        count: counts.todoUpdates,
        defaultValue: counts.todoUpdates === 1 ? 'Updated tasks' : `Updated tasks ${counts.todoUpdates} times`,
      }),
    counts.genericTools > 0 &&
      t('messages.agentSteps.summary.usedTools', {
        count: counts.genericTools,
        defaultValue: `Used ${counts.genericTools} ${counts.genericTools === 1 ? 'tool' : 'tools'}`,
      }),
  ].filter((part): part is string => Boolean(part));

  const visible = candidates.slice(0, 3);
  if (candidates.length > visible.length) {
    visible.push(
      t('messages.agentSteps.summary.moreActions', {
        count: candidates.length - visible.length,
        defaultValue: `${candidates.length - visible.length} more actions`,
      })
    );
  }

  return visible.length ? visible : [t('messages.agentSteps.summary.working', { defaultValue: 'Working' })];
};

const formatActivitySummary = (summary: AgentActivitySummary, t: TFunction): string =>
  joinSummaryParts(buildActivitySummaryParts(summary, t), t);

const limitLines = (text?: string, count = 3): { text: string; truncated: boolean } => {
  if (!text) return { text: '', truncated: false };
  const lines = text.trimEnd().split('\n');
  if (lines.length <= count) return { text, truncated: false };
  return { text: lines.slice(0, count).join('\n'), truncated: true };
};

const commandSummary = (command?: string): string => {
  if (!command?.trim()) return '';
  return command
    .replace(/\\\s*\n\s*/g, ' ')
    .split('|')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .slice(0, 4)
    .join(' | ');
};

const commandStatusLabel = (
  status: AgentStepStatus,
  t: TFunction
): { icon: 'checkOne' | 'closeOne' | 'time'; label: string } | undefined => {
  switch (status) {
    case 'completed':
      return { icon: 'checkOne', label: t('messages.agentSteps.status.success', { defaultValue: '成功' }) };
    case 'error':
      return { icon: 'closeOne', label: t('messages.agentSteps.status.failed', { defaultValue: '失败' }) };
    case 'canceled':
      return { icon: 'closeOne', label: t('messages.agentSteps.status.canceled', { defaultValue: '已取消' }) };
    case 'running':
    case 'pending':
      return { icon: 'time', label: t('messages.agentSteps.status.running', { defaultValue: '运行中' }) };
    default:
      return undefined;
  }
};

const safeFileName = (path?: string): string => {
  const parts = path?.split(/[\\/]/);
  return parts?.findLast(Boolean) || path || 'file';
};

type WebResult = {
  title: string;
  url?: string;
  snippet?: string;
};

const STEP_TITLE_TRANSLATIONS = {
  'Tests failed': ['messages.agentSteps.titles.testsFailed', 'Tests failed'],
  'Ran tests': ['messages.agentSteps.titles.ranTests', 'Ran tests'],
  'Running tests': ['messages.agentSteps.titles.runningTests', 'Running tests'],
  'Type check failed': ['messages.agentSteps.titles.typeCheckFailed', 'Type check failed'],
  'Checked types': ['messages.agentSteps.titles.checkedTypes', 'Checked types'],
  'Checking types': ['messages.agentSteps.titles.checkingTypes', 'Checking types'],
  'Build failed': ['messages.agentSteps.titles.buildFailed', 'Build failed'],
  'Built project': ['messages.agentSteps.titles.builtProject', 'Built project'],
  'Building project': ['messages.agentSteps.titles.buildingProject', 'Building project'],
  'Install failed': ['messages.agentSteps.titles.installFailed', 'Install failed'],
  'Installed dependencies': ['messages.agentSteps.titles.installedDependencies', 'Installed dependencies'],
  'Installing dependencies': ['messages.agentSteps.titles.installingDependencies', 'Installing dependencies'],
  'Inspected changes': ['messages.agentSteps.titles.inspectedChanges', 'Inspected changes'],
  'Inspecting changes': ['messages.agentSteps.titles.inspectingChanges', 'Inspecting changes'],
  'Started server': ['messages.agentSteps.titles.startedServer', 'Started server'],
  'Starting server': ['messages.agentSteps.titles.startingServer', 'Starting server'],
  'Command failed': ['messages.agentSteps.titles.commandFailed', 'Command failed'],
  'Ran command': ['messages.agentSteps.titles.ranCommand', 'Ran command'],
  'Running command': ['messages.agentSteps.titles.runningCommand', 'Running command'],
  Read: ['messages.agentSteps.titles.read', 'Read'],
  'Searched files': ['messages.agentSteps.titles.searchedFiles', 'Searched files'],
  'Listed files': ['messages.agentSteps.titles.listedFiles', 'Listed files'],
  'Searching web': ['messages.agentSteps.titles.searchingWeb', 'Searching web'],
  'Searched web': ['messages.agentSteps.titles.searchedWeb', 'Searched web'],
  Fetching: ['messages.agentSteps.titles.fetching', 'Fetching'],
  Fetched: ['messages.agentSteps.titles.fetched', 'Fetched'],
  'Fetched page': ['messages.agentSteps.titles.fetchedPage', 'Fetched page'],
  'Generated image': ['messages.agentSteps.titles.generatedImage', 'Generated image'],
  'Updated plan': ['messages.agentSteps.titles.updatedPlan', 'Updated plan'],
  'Updated to-dos': ['messages.agentSteps.titles.updatedTodos', 'Updated to-dos'],
  'Inspecting files': ['messages.agentSteps.titles.inspectingFiles', 'Inspecting files'],
  'Inspected files': ['messages.agentSteps.titles.inspectedFiles', 'Inspected files'],
} as const satisfies Record<string, readonly [I18nKey, string]>;

const translateAgentStepTitle = (title: string, t: TFunction): string => {
  const exact = STEP_TITLE_TRANSLATIONS[title as keyof typeof STEP_TITLE_TRANSLATIONS];
  if (exact) return t(exact[0], { defaultValue: exact[1] });

  const fileMatch = title.match(/^(Created|Creating|Updated|Updating) (.+)$/);
  if (fileMatch) {
    const [, action, name] = fileMatch;
    const keyMap = {
      Created: ['messages.agentSteps.titles.createdFile', 'Created {{name}}'],
      Creating: ['messages.agentSteps.titles.creatingFile', 'Creating {{name}}'],
      Updated: ['messages.agentSteps.titles.updatedFile', 'Updated {{name}}'],
      Updating: ['messages.agentSteps.titles.updatingFile', 'Updating {{name}}'],
    } as const satisfies Record<string, readonly [I18nKey, string]>;
    const entry = keyMap[action as keyof typeof keyMap];
    return t(entry[0], { name, defaultValue: entry[1].replace('{{name}}', name) });
  }

  const failedFileMatch = title.match(/^Failed to (create|update) (.+)$/);
  if (failedFileMatch) {
    const [, action, name] = failedFileMatch;
    const key: I18nKey =
      action === 'create'
        ? 'messages.agentSteps.titles.failedCreateFile'
        : 'messages.agentSteps.titles.failedUpdateFile';
    const defaultValue = action === 'create' ? `Failed to create ${name}` : `Failed to update ${name}`;
    return t(key, { name, defaultValue });
  }

  const webMatch = title.match(/^(Searching web|Searched web|Fetching|Fetched) (.+)$/);
  if (webMatch) {
    const [, action, target] = webMatch;
    const keyMap = {
      'Searching web': ['messages.agentSteps.titles.searchingWebTarget', 'Searching web {{target}}'],
      'Searched web': ['messages.agentSteps.titles.searchedWebTarget', 'Searched web {{target}}'],
      Fetching: ['messages.agentSteps.titles.fetchingTarget', 'Fetching {{target}}'],
      Fetched: ['messages.agentSteps.titles.fetchedTarget', 'Fetched {{target}}'],
    } as const satisfies Record<string, readonly [I18nKey, string]>;
    const entry = keyMap[action as keyof typeof keyMap];
    return t(entry[0], { target, defaultValue: entry[1].replace('{{target}}', target) });
  }

  const searchedMatch = title.match(/^Searched (.+)$/);
  if (searchedMatch) {
    return t('messages.agentSteps.titles.searchedTarget', {
      target: searchedMatch[1],
      defaultValue: `Searched ${searchedMatch[1]}`,
    });
  }

  const listedMatch = title.match(/^Listed (.+)$/);
  if (listedMatch) {
    return t('messages.agentSteps.titles.listedTarget', {
      target: listedMatch[1],
      defaultValue: `Listed ${listedMatch[1]}`,
    });
  }

  return title;
};

const hostname = (url?: string): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
};

const toWebResult = (value: unknown, t: TFunction): WebResult | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const title =
    typeof record.title === 'string'
      ? record.title
      : typeof record.name === 'string'
        ? record.name
        : typeof record.text === 'string'
          ? record.text
          : undefined;
  const url =
    typeof record.url === 'string'
      ? record.url
      : typeof record.link === 'string'
        ? record.link
        : typeof record.href === 'string'
          ? record.href
          : undefined;
  const snippet =
    typeof record.snippet === 'string'
      ? record.snippet
      : typeof record.description === 'string'
        ? record.description
        : typeof record.summary === 'string'
          ? record.summary
          : undefined;

  if (!title && !url && !snippet) return undefined;
  return {
    title: title || hostname(url) || t('messages.agentSteps.web.result', { defaultValue: 'Result' }),
    url,
    snippet,
  };
};

const extractWebResults = (output: string | undefined, t: TFunction): WebResult[] => {
  if (!output?.trim()) return [];

  try {
    const parsed = JSON.parse(output) as unknown;
    const candidates = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? ((parsed as Record<string, unknown>).results as unknown[]) ||
          ((parsed as Record<string, unknown>).items as unknown[]) ||
          ((parsed as Record<string, unknown>).data as unknown[])
        : undefined;
    if (Array.isArray(candidates)) {
      return candidates
        .map((item) => toWebResult(item, t))
        .filter((item): item is WebResult => !!item)
        .slice(0, 3);
    }
  } catch {
    // Plain text outputs are handled below.
  }

  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const urlResults = lines
    .reduce<WebResult[]>((results, line) => {
      const match = line.match(/https?:\/\/[^\s)]+/);
      if (!match) return results;
      results.push({
        title: hostname(match[0]) || line.replace(match[0], '').trim() || match[0],
        url: match[0],
        snippet: line.replace(match[0], '').trim() || undefined,
      });
      return results;
    }, [])
    .slice(0, 3);

  if (urlResults.length) return urlResults;

  return lines.slice(0, 3).map((line, index) => ({
    title:
      index === 0
        ? t('messages.agentSteps.web.summary', { defaultValue: 'Summary' })
        : t('messages.agentSteps.web.resultNumber', {
            number: index + 1,
            defaultValue: `Result ${index + 1}`,
          }),
    snippet: line,
  }));
};

const AgentStepKindIcon: React.FC<{ step: AgentStep; size?: number; liveRunning?: boolean }> = ({
  step,
  size = 15,
  liveRunning = true,
}) => {
  const icon = iconForStep(step, liveRunning);
  return <AgentStatusIcon className='agent-step-status-icon' name={icon.name} size={size} spin={icon.spin} />;
};

const AgentExploreChildIcon: React.FC<{ child: AgentExploreChild; liveRunning: boolean }> = ({
  child,
  liveRunning,
}) => {
  const icon = iconForExploreChild(child, liveRunning);
  return <AgentStatusIcon className='agent-step-status-icon' name={icon.name} size={14} spin={icon.spin} />;
};

const ExpandIcon: React.FC<{ expanded: boolean }> = ({ expanded }) =>
  expanded ? <IconDown fontSize={12} /> : <IconRight fontSize={12} />;

const AgentGenericStep: React.FC<{ step: AgentStep; liveRunning: boolean }> = ({ step, liveRunning }) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const hasDetail = !!step.input || !!step.output;
  const livePending = isLivePendingStatus(step.status, liveRunning);

  return (
    <div className='agent-step-row'>
      <button
        type='button'
        className={classNames(
          'agent-step-line',
          hasDetail && 'agent-step-line--clickable',
          livePending && 'agent-step-running-sweep'
        )}
        disabled={!hasDetail}
        aria-expanded={hasDetail ? expanded : undefined}
        onClick={hasDetail ? () => setExpanded((v) => !v) : undefined}
      >
        <AgentStepKindIcon step={step} liveRunning={liveRunning} />
        <span className='agent-step-title'>{translateAgentStepTitle(step.title, t)}</span>
        {step.subtitle && <span className='agent-step-subtitle'>{step.subtitle}</span>}
        {hasDetail && (
          <span className='agent-step-chevron'>
            <ExpandIcon expanded={expanded} />
          </span>
        )}
      </button>
      {expanded && hasDetail && (
        <div className='agent-step-detail'>
          {step.input && (
            <div className='agent-step-detail-block'>
              <div className='agent-step-detail-label'>{t('messages.agentSteps.input', { defaultValue: 'Input' })}</div>
              <pre>{step.input}</pre>
            </div>
          )}
          {step.output && (
            <div className='agent-step-detail-block'>
              <div className='agent-step-detail-label'>
                {t('messages.agentSteps.output', { defaultValue: 'Output' })}
              </div>
              <pre>{step.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AgentExploreGroup: React.FC<{ step: AgentExploreStep; liveRunning: boolean }> = ({ step, liveRunning }) => {
  const livePending = isLivePendingStatus(step.status, liveRunning);
  const [expanded, setExpanded] = useState(livePending);
  const { t } = useTranslation();

  useEffect(() => {
    if (livePending) setExpanded(true);
  }, [livePending]);

  return (
    <div className='agent-step-row'>
      <button
        type='button'
        className={classNames('agent-step-line agent-step-line--clickable', livePending && 'agent-step-running-sweep')}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <AgentStepKindIcon step={step} liveRunning={liveRunning} />
        <span className={classNames('agent-step-title', livePending && 'agent-step-title--shimmer')}>
          {translateAgentStepTitle(step.title, t)}
        </span>
        {step.subtitle && <span className='agent-step-subtitle'>{step.subtitle}</span>}
        <span className='agent-step-chevron'>
          <ExpandIcon expanded={expanded} />
        </span>
      </button>
      {expanded && (
        <div className='agent-step-nested'>
          {step.children.map((child) => (
            <div className='agent-step-nested-line' key={child.id}>
              <AgentExploreChildIcon child={child} liveRunning={liveRunning} />
              <span className='agent-step-title'>{translateAgentStepTitle(child.title, t)}</span>
              {child.subtitle && <span className='agent-step-subtitle'>{child.subtitle}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AgentWebStepView: React.FC<{ step: AgentWebStep; liveRunning: boolean }> = ({ step, liveRunning }) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const webResults = useMemo(() => extractWebResults(step.output, t), [step.output, t]);
  const hasDetail = !!step.output || !!step.input || webResults.length > 0;
  const livePending = isLivePendingStatus(step.status, liveRunning);
  const fallbackTitle =
    step.title ||
    (livePending
      ? step.query
        ? t('messages.agentSteps.titles.searchingWeb', { defaultValue: 'Searching web' })
        : t('messages.agentSteps.titles.fetching', { defaultValue: 'Fetching' })
      : step.query
        ? t('messages.agentSteps.titles.searchedWeb', { defaultValue: 'Searched web' })
        : t('messages.agentSteps.titles.fetched', { defaultValue: 'Fetched' }));
  const title = translateAgentStepTitle(fallbackTitle, t);

  return (
    <div className='agent-step-row'>
      <button
        type='button'
        className={classNames(
          'agent-step-line',
          hasDetail && 'agent-step-line--clickable',
          livePending && 'agent-step-running-sweep'
        )}
        disabled={!hasDetail}
        aria-expanded={hasDetail ? expanded : undefined}
        onClick={hasDetail ? () => setExpanded((v) => !v) : undefined}
      >
        <AgentStepKindIcon step={step} liveRunning={liveRunning} />
        <span className='agent-step-title'>{title}</span>
        {(step.query || step.url || step.subtitle) && (
          <span className='agent-step-subtitle'>{step.query || step.url || step.subtitle}</span>
        )}
        {hasDetail && (
          <span className='agent-step-chevron'>
            <ExpandIcon expanded={expanded} />
          </span>
        )}
      </button>
      {expanded &&
        (webResults.length > 0 ? (
          <div className='agent-web-results'>
            {webResults.map((result, index) => (
              <div className='agent-web-result' key={`${result.url || result.title}-${index}`}>
                <div className='agent-web-result-title'>{result.title}</div>
                {result.url && <div className='agent-web-result-url'>{hostname(result.url) || result.url}</div>}
                {result.snippet && <div className='agent-web-result-snippet'>{result.snippet}</div>}
              </div>
            ))}
          </div>
        ) : (
          <AgentStepOutput input={step.input} output={step.output} />
        ))}
    </div>
  );
};

const AgentCommandTool: React.FC<{ step: AgentCommandStep; liveRunning: boolean }> = ({ step, liveRunning }) => {
  const [expanded, setExpanded] = useState(false);
  const [showFullOutput, setShowFullOutput] = useState(false);
  const { t } = useTranslation();
  const livePending = isLivePendingStatus(step.status, liveRunning);
  const stdout = limitLines(step.stdout);
  const stderr = limitLines(step.stderr);
  const hasMore = stdout.truncated || stderr.truncated;
  const hasOutput = !!step.stdout || !!step.stderr;
  const summary =
    commandSummary(step.command) ||
    step.subtitle ||
    t('messages.agentSteps.commandFallback', { defaultValue: 'command' });
  const statusLabel = commandStatusLabel(step.status, t);

  useEffect(() => {
    setShowFullOutput(false);
  }, [step.id]);

  return (
    <div className='agent-command-card'>
      <button
        type='button'
        className={classNames('agent-command-header', livePending && 'agent-step-running-sweep')}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <AgentStepKindIcon step={step} liveRunning={liveRunning} />
        <span className='agent-step-title'>
          {translateAgentStepTitle(step.title, t)}
          {summary ? ':' : ''}
        </span>
        <span className='agent-step-subtitle'>{summary}</span>
        <span className='agent-step-chevron'>
          <ExpandIcon expanded={expanded} />
        </span>
      </button>
      {(expanded || hasOutput || step.command) && (
        <div className='agent-command-body'>
          {step.command && <pre className='agent-command-code'>$ {step.command}</pre>}
          {step.stdout && (
            <pre className={classNames('agent-command-output', showFullOutput && 'agent-command-output--full')}>
              {showFullOutput ? step.stdout : stdout.text}
            </pre>
          )}
          {step.stderr && (
            <pre
              className={classNames(
                'agent-command-output agent-command-output--stderr',
                showFullOutput && 'agent-command-output--full'
              )}
            >
              {showFullOutput ? step.stderr : stderr.text}
            </pre>
          )}
          {hasMore && !showFullOutput && (
            <button
              type='button'
              className='agent-step-more'
              onClick={(event) => {
                event.stopPropagation();
                setShowFullOutput(true);
              }}
            >
              {t('messages.agentSteps.moreOutputAvailable', { defaultValue: 'More output available' })}
            </button>
          )}
          {statusLabel && (
            <div className={classNames('agent-command-status', `agent-command-status--${step.status}`)}>
              <AgentStatusIcon name={statusLabel.icon} size={13} />
              <span>{statusLabel.label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AgentFileChangeTool: React.FC<{ step: AgentFileChangeStep; liveRunning: boolean }> = ({ step, liveRunning }) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const livePending = isLivePendingStatus(step.status, liveRunning);
  const { launchPreview } = usePreviewLauncher();
  const filePath = step.filePath || step.fileName || 'file';
  const fileName = step.fileName || safeFileName(filePath);
  const diffText = useMemo(() => {
    if (step.diff) return step.diff;
    if (step.oldText !== undefined || step.newText !== undefined) {
      return createTwoFilesPatch(fileName, fileName, step.oldText || '', step.newText || '', '', '', { context: 3 });
    }
    return '';
  }, [fileName, step.diff, step.newText, step.oldText]);
  const fileInfo = useMemo(() => (diffText ? parseDiff(diffText, filePath) : null), [diffText, filePath]);
  const diffLines = useMemo(() => diffText.split('\n').filter(Boolean), [diffText]);
  const previewLines = expanded ? diffLines : diffLines.slice(0, 9);

  const openFile = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!fileInfo) return;
      const { contentType, editable, language } = getFileTypeInfo(fileInfo.file_name);
      void launchPreview({
        relativePath: fileInfo.fullPath,
        file_name: fileInfo.file_name,
        contentType,
        editable,
        language,
        fallbackContent: editable ? extractContentFromDiff(fileInfo.diff) : undefined,
        diffContent: fileInfo.diff,
      });
    },
    [fileInfo, launchPreview]
  );

  const openDiff = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!fileInfo) return;
      void launchPreview({
        file_name: fileInfo.file_name,
        contentType: 'diff',
        editable: false,
        language: 'diff',
        diffContent: fileInfo.diff,
      });
    },
    [fileInfo, launchPreview]
  );

  if (!diffText || !fileInfo) {
    return <AgentGenericStep step={step} liveRunning={liveRunning} />;
  }

  return (
    <div className='agent-file-card'>
      <button
        type='button'
        className={classNames('agent-file-header', livePending && 'agent-step-running-sweep')}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <AgentStepKindIcon step={step} liveRunning={liveRunning} />
        <span className='agent-step-title'>{translateAgentStepTitle(step.title, t)}</span>
        {step.title !== fileName && <span className='agent-step-subtitle'>{fileName}</span>}
        <span className='agent-file-stats'>
          {fileInfo.insertions > 0 && <span className='agent-file-stat--add'>+{fileInfo.insertions}</span>}
          {fileInfo.deletions > 0 && <span className='agent-file-stat--remove'>-{fileInfo.deletions}</span>}
        </span>
        <span className='agent-step-chevron'>
          <ExpandIcon expanded={expanded} />
        </span>
      </button>
      <div className={classNames('agent-file-diff', !expanded && 'agent-file-diff--collapsed')}>
        {previewLines.map((line: string, index: number) => (
          <div
            className={classNames(
              'agent-file-diff-line',
              line.startsWith('+') && !line.startsWith('+++') && 'agent-file-diff-line--add',
              line.startsWith('-') && !line.startsWith('---') && 'agent-file-diff-line--remove',
              line.startsWith('@@') && 'agent-file-diff-line--meta'
            )}
            key={`${index}-${line}`}
          >
            {line}
          </div>
        ))}
      </div>
      <div className='agent-file-actions'>
        <button className='agent-file-action' type='button' onClick={openFile}>
          {t('messages.agentSteps.preview', { defaultValue: 'Preview' })}
        </button>
        <button className='agent-file-action' type='button' onClick={openDiff}>
          {t('messages.agentSteps.diff', { defaultValue: 'Diff' })}
        </button>
      </div>
    </div>
  );
};

const AgentTodoPlanTool: React.FC<{ step: AgentTodoPlanStep; liveRunning: boolean }> = ({ step, liveRunning }) => {
  const livePending = isLivePendingStatus(step.status, liveRunning);
  const [expanded, setExpanded] = useState(livePending);
  const { t } = useTranslation();
  const completed = step.items.filter((item) => item.status === 'completed').length;
  const inProgress = step.items.filter((item) => item.status === 'in_progress').length;
  const current =
    step.items.find((item) => item.status === 'in_progress') || step.items.find((item) => item.status === 'pending');
  const total = step.items.length;

  return (
    <div className='agent-todo-card'>
      <button
        type='button'
        className={classNames('agent-step-line agent-step-line--clickable', livePending && 'agent-step-running-sweep')}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <AgentStepKindIcon step={step} liveRunning={liveRunning} />
        <span className='agent-step-title'>
          {step.kind === 'plan'
            ? t('messages.agentSteps.planProgress', { defaultValue: 'Plan progress' })
            : t('messages.agentSteps.todoProgress', { defaultValue: 'Todo progress' })}
        </span>
        <span className='agent-step-subtitle'>
          {current?.content ||
            (total
              ? t('messages.agentSteps.completedCount', {
                  completed,
                  total,
                  defaultValue: `${completed}/${total} completed`,
                })
              : step.subtitle || translateAgentStepTitle(step.title, t))}
        </span>
        {total > 0 && (
          <span className='agent-todo-count'>
            {completed + inProgress}/{total}
          </span>
        )}
        <span className='agent-step-chevron'>
          <ExpandIcon expanded={expanded} />
        </span>
      </button>
      {expanded && total > 0 && (
        <div className='agent-todo-list'>
          {step.items.map((item, index) => (
            <div className='agent-todo-item' key={`${item.content}-${index}`}>
              {item.status === 'completed' ? (
                <AgentStatusIcon className='agent-step-status-icon' name='checkOne' size={14} />
              ) : item.status === 'in_progress' && liveRunning ? (
                <AgentStatusIcon className='agent-step-status-icon' name='loading' size={14} spin />
              ) : (
                <AgentStatusIcon className='agent-step-status-icon' name='time' size={14} />
              )}
              <span className={classNames(item.status === 'completed' && 'agent-todo-text--done')}>{item.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AgentImageTool: React.FC<{ step: AgentImageStep; liveRunning: boolean }> = ({ step, liveRunning }) => {
  const { t } = useTranslation();

  return (
    <div className='agent-image-card'>
      <div className='agent-step-line'>
        <AgentStepKindIcon step={step} liveRunning={liveRunning} />
        <span className='agent-step-title'>{translateAgentStepTitle(step.title, t)}</span>
        {step.subtitle && <span className='agent-step-subtitle'>{step.subtitle}</span>}
      </div>
      <div className='agent-image-preview'>
        <LocalImageView
          src={step.imagePath}
          alt={step.subtitle || translateAgentStepTitle(step.title, t)}
          className='max-w-full max-h-320px object-contain rounded'
        />
      </div>
    </div>
  );
};

const AgentStepOutput: React.FC<{ input?: string; output?: string }> = ({ input, output }) => {
  const { t } = useTranslation();

  return (
    <div className='agent-step-detail'>
      {input && (
        <div className='agent-step-detail-block'>
          <div className='agent-step-detail-label'>{t('messages.agentSteps.input', { defaultValue: 'Input' })}</div>
          <pre>{input}</pre>
        </div>
      )}
      {output && (
        <div className='agent-step-detail-block'>
          <div className='agent-step-detail-label'>{t('messages.agentSteps.output', { defaultValue: 'Output' })}</div>
          <pre>{output}</pre>
        </div>
      )}
    </div>
  );
};

const AgentStepItem: React.FC<{ step: AgentStep; liveRunning: boolean }> = ({ step, liveRunning }) => {
  switch (step.kind) {
    case 'explore':
      return <AgentExploreGroup step={step as AgentExploreStep} liveRunning={liveRunning} />;
    case 'web':
      return <AgentWebStepView step={step as AgentWebStep} liveRunning={liveRunning} />;
    case 'command':
      return <AgentCommandTool step={step as AgentCommandStep} liveRunning={liveRunning} />;
    case 'file_change':
      return <AgentFileChangeTool step={step as AgentFileChangeStep} liveRunning={liveRunning} />;
    case 'todo':
    case 'plan':
      return <AgentTodoPlanTool step={step as AgentTodoPlanStep} liveRunning={liveRunning} />;
    case 'image':
      return <AgentImageTool step={step as AgentImageStep} liveRunning={liveRunning} />;
    default:
      return <AgentGenericStep step={step} liveRunning={liveRunning} />;
  }
};

export const AgentStepsProgressPill: React.FC<{
  messages: ToolMessage[];
  className?: string;
  liveRunning?: boolean;
}> = ({ messages, className, liveRunning = true }) => {
  const { t } = useTranslation();
  const steps = useMemo(() => normalizeAgentSteps(messages), [messages]);
  const hasRunning = liveRunning && hasRunningAgentSteps(steps);
  const todoProgress = useMemo(() => summarizeAgentTodoProgress(steps), [steps]);
  const activitySummary = useMemo(() => summarizeAgentActivity(steps), [steps]);

  if (!steps.length || !hasRunning) return null;

  const progressLabel =
    todoProgress && todoProgress.total > 0
      ? t('messages.agentSteps.progress.todoCurrent', {
          completed: todoProgress.completed,
          total: todoProgress.total,
          current: todoProgress.current || t('messages.agentSteps.summary.working', { defaultValue: 'Working' }),
          defaultValue: `Completed ${todoProgress.completed}/${todoProgress.total}, working on ${todoProgress.current || 'current task'}`,
        })
      : t('messages.agentSteps.progress.currentActivity', {
          activity: formatActivitySummary(activitySummary, t),
          defaultValue: formatActivitySummary(activitySummary, t),
        });

  return (
    <div
      className={classNames(
        'agent-steps-progress-pill',
        'agent-steps-progress-pill--floating',
        'agent-steps-progress-pill--running',
        'agent-step-running-sweep',
        className
      )}
    >
      <AgentStatusIcon className='agent-steps-progress-icon' name='loading' size={18} spin />
      <span className='agent-steps-progress-text agent-step-title--shimmer'>{progressLabel}</span>
    </div>
  );
};

export const AgentRuntimeProgressPill: React.FC<{
  runtimeView: ConversationRuntimeView;
  messages?: ToolMessage[];
  className?: string;
}> = ({ runtimeView, messages = [], className }) => {
  const { t } = useTranslation();
  const steps = useMemo(() => normalizeAgentSteps(messages), [messages]);
  const todoStep = useMemo(() => getLatestTodoPlanStep(steps), [steps]);
  const todoProgress = useMemo(() => summarizeAgentTodoProgress(steps), [steps]);
  const fileChanges = useMemo(() => summarizeAgentFileChanges(steps), [steps]);
  const activitySummary = useMemo(() => summarizeAgentActivity(steps), [steps]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!runtimeView.isProcessing) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [runtimeView.isProcessing]);

  if (!runtimeView.isProcessing) return null;

  const durationLabel =
    runtimeView.activeStartedAt !== null
      ? formatDuration(Math.max(0, now - runtimeView.activeStartedAt), t)
      : undefined;
  const inProgressTodoIndex = todoStep?.items.findIndex((item) => item.status === 'in_progress') ?? -1;
  const pendingTodoIndex = todoStep?.items.findIndex((item) => item.status === 'pending') ?? -1;
  const todoCurrentIndex = todoStep
    ? inProgressTodoIndex >= 0
      ? inProgressTodoIndex + 1
      : pendingTodoIndex >= 0
        ? pendingTodoIndex + 1
        : todoStep.items.length
    : 0;
  const todoStepLabel =
    steps.length && todoProgress && todoProgress.total > 0
      ? t('messages.agentSteps.progress.stepRatio', {
          current: todoCurrentIndex || Math.max(1, todoProgress.completed),
          total: todoProgress.total,
          defaultValue: `第 ${todoCurrentIndex || Math.max(1, todoProgress.completed)} / ${todoProgress.total} 步`,
        })
      : undefined;
  const activityLabel =
    steps.length && !todoStepLabel
      ? t('messages.agentSteps.progress.currentActivity', {
          activity: formatActivitySummary(activitySummary, t),
          defaultValue: formatActivitySummary(activitySummary, t),
        })
      : undefined;
  const fileChangeLabel =
    fileChanges.files > 0
      ? t('messages.agentSteps.progress.fileChanges', {
          count: fileChanges.files,
          defaultValue: `${fileChanges.files} 个文件已更改`,
        })
      : undefined;
  const durationText = durationLabel
    ? t('messages.agentSteps.processedDuration', {
        duration: durationLabel,
        defaultValue: `已处理 ${durationLabel}`,
      })
    : undefined;
  const segments = [
    t('messages.agentSteps.summary.working', { defaultValue: '正在处理' }),
    todoStepLabel || activityLabel,
    fileChangeLabel,
    durationText,
  ].filter((part): part is string => Boolean(part));
  const todoPopover =
    todoStep && todoStep.items.length > 0 ? (
      <div className='agent-runtime-todo-popover'>
        <div className='agent-runtime-todo-popover__title'>
          {todoStep.kind === 'plan'
            ? t('messages.agentSteps.planProgress', { defaultValue: '计划进展' })
            : t('messages.agentSteps.todoProgress', { defaultValue: 'Todo 进展' })}
        </div>
        <div className='agent-runtime-todo-popover__list'>
          {todoStep.items.map((item, index) => (
            <div
              className={classNames(
                'agent-runtime-todo-popover__item',
                item.status === 'completed' && 'agent-runtime-todo-popover__item--done',
                item.status === 'in_progress' && 'agent-runtime-todo-popover__item--active'
              )}
              key={`${index}-${item.content}`}
            >
              <span className='agent-runtime-todo-popover__index'>{index + 1}</span>
              <AgentStatusIcon
                className='agent-runtime-todo-popover__icon'
                name={item.status === 'completed' ? 'checkOne' : item.status === 'in_progress' ? 'loading' : 'time'}
                size={13}
                spin={item.status === 'in_progress'}
              />
              <span className='agent-runtime-todo-popover__text'>{item.content}</span>
            </div>
          ))}
        </div>
      </div>
    ) : null;
  const pill = (
    <div
      className={classNames(
        'agent-steps-progress-pill',
        'agent-steps-progress-pill--floating',
        'agent-steps-progress-pill--running',
        'agent-step-running-sweep',
        className
      )}
      role='status'
      aria-live='polite'
    >
      <AgentStatusIcon className='agent-steps-progress-icon' name='loading' size={18} spin />
      <span className='agent-steps-progress-text agent-step-title--shimmer'>{segments.join(' · ')}</span>
      {fileChanges.files > 0 && (
        <span className='agent-steps-progress-stats' aria-label={fileChangeLabel}>
          <span className='agent-file-stat--add'>+{fileChanges.insertions}</span>
          <span className='agent-file-stat--remove'>-{fileChanges.deletions}</span>
        </span>
      )}
    </div>
  );

  if (!todoPopover) return pill;

  return (
    <Popover
      trigger='hover'
      position='top'
      className='agent-runtime-todo-popover-shell'
      content={todoPopover}
      unmountOnExit
    >
      {pill}
    </Popover>
  );
};

const AgentSteps: React.FC<{
  messages: ToolMessage[];
  runtimeView?: ConversationRuntimeView;
  allowLiveWithoutTurnId?: boolean;
}> = ({
  messages,
  runtimeView = fallbackRuntimeView,
  allowLiveWithoutTurnId = runtimeView === fallbackRuntimeView,
}) => {
  const { t } = useTranslation();
  const conversationContext = useConversationContextSafe();
  const collapseExecutionByDefault = conversationContext?.type === 'codex';
  const steps = useMemo(() => normalizeAgentSteps(messages), [messages]);
  const hasRunning = hasRunningAgentSteps(steps);
  const messageTurnIds = useMemo(
    () => new Set(messages.map(getMessageTurnId).filter((turnId): turnId is string => Boolean(turnId))),
    [messages]
  );
  const belongsToActiveTurn =
    (messageTurnIds.size === 0 && allowLiveWithoutTurnId) ||
    (runtimeView.activeTurnId !== null && messageTurnIds.has(runtimeView.activeTurnId));
  const liveRunning = hasRunning && runtimeView.isProcessing && belongsToActiveTurn;
  const [now, setNow] = useState(() => Date.now());
  const shouldAutoExpand = liveRunning && !collapseExecutionByDefault;
  const [expanded, setExpanded] = useState(shouldAutoExpand);
  const activitySummary = useMemo(() => summarizeAgentActivity(steps), [steps]);

  useEffect(() => {
    setExpanded(shouldAutoExpand);
  }, [shouldAutoExpand, steps.length]);

  useEffect(() => {
    if (!liveRunning) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [liveRunning]);

  if (!steps.length) return null;

  const times = steps.map((step) => step.createdAt).filter((value): value is number => typeof value === 'number');
  const startTime = times.length ? Math.min(...times) : now;
  const endTime = liveRunning ? now : times.length ? Math.max(...times) : now;
  const durationLabel = formatDuration(Math.max(0, endTime - startTime), t);
  const activeStep = steps.findLast((step) => isPendingStatus(step.status)) || steps[steps.length - 1];
  const hasError = steps.some((step) => step.status === 'error');
  const aggregateStatus: AgentStepStatus = liveRunning ? 'running' : hasError ? 'error' : 'completed';
  const headerIcon = iconForActivitySummary(activitySummary, activeStep, aggregateStatus);
  const headerTitle = formatActivitySummary(activitySummary, t);
  const headerSubtitle = liveRunning
    ? [translateAgentStepTitle(activeStep.title, t), activeStep.subtitle, durationLabel].filter(Boolean).join(' · ')
    : durationLabel;
  const processedDurationLabel = durationLabel
    ? t('messages.agentSteps.processedDuration', {
        duration: durationLabel,
        defaultValue: `已处理 ${durationLabel}`,
      })
    : undefined;

  return (
    <div className={classNames('agent-steps', collapseExecutionByDefault && 'agent-steps--quiet')}>
      {processedDurationLabel && (
        <div className={classNames('agent-steps-duration-line', liveRunning && 'agent-steps-duration-line--running')}>
          <span className='agent-steps-duration-rule' />
          <span className='agent-steps-duration-label'>{processedDurationLabel}</span>
        </div>
      )}
      <button
        type='button'
        className={classNames(
          'agent-steps-header',
          'agent-steps-header--summary',
          liveRunning && 'agent-steps-header--running agent-step-running-sweep'
        )}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className='agent-steps-header-icon'>
          <AgentStatusIcon
            className='agent-step-status-icon'
            name={headerIcon.name}
            size={16}
            spin={liveRunning && headerIcon.spin}
          />
        </span>
        <span className={classNames('agent-steps-header-title', liveRunning && 'agent-step-title--shimmer')}>
          {headerTitle}
        </span>
        {headerSubtitle && <span className='agent-step-subtitle'>{headerSubtitle}</span>}
        <span className='agent-step-chevron'>
          <ExpandIcon expanded={expanded} />
        </span>
      </button>
      <div className={classNames('agent-steps-body-shell', expanded ? 'is-expanded' : 'is-collapsed')}>
        <div className='agent-steps-body'>
          {steps.map((step) => (
            <AgentStepItem key={step.id} step={step} liveRunning={liveRunning} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default React.memo(AgentSteps);
