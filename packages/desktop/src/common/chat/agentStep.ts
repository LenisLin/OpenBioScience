/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';
import { getAcpImagePath } from './acpToolCallOutput';

export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'error' | 'canceled';

export type AgentStepKind =
  | 'explore'
  | 'web'
  | 'command'
  | 'file_change'
  | 'todo'
  | 'plan'
  | 'mcp'
  | 'image'
  | 'generic';

export type ToolMessage = IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall;

export interface AgentStepBase {
  id: string;
  kind: AgentStepKind;
  status: AgentStepStatus;
  title: string;
  subtitle?: string;
  input?: string;
  output?: string;
  createdAt?: number;
  messageId?: string;
  conversationId?: string;
  source: 'tool_group' | 'acp_tool_call' | 'tool_call';
  rawName?: string;
  raw?: unknown;
}

export interface AgentExploreChild {
  id: string;
  kind: 'read' | 'grep' | 'glob' | 'search' | 'fetch' | 'generic';
  title: string;
  subtitle?: string;
  status: AgentStepStatus;
  path?: string;
  query?: string;
  pattern?: string;
  createdAt?: number;
}

export interface AgentExploreStep extends AgentStepBase {
  kind: 'explore';
  children: AgentExploreChild[];
  fileCount: number;
  searchCount: number;
}

export interface AgentWebStep extends AgentStepBase {
  kind: 'web';
  url?: string;
  query?: string;
}

export interface AgentCommandStep extends AgentStepBase {
  kind: 'command';
  command?: string;
  stdout?: string;
  stderr?: string;
}

export interface AgentFileChangeStep extends AgentStepBase {
  kind: 'file_change';
  fileName?: string;
  filePath?: string;
  diff?: string;
  oldText?: string;
  newText?: string;
}

export interface AgentTodoPlanItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AgentTodoPlanStep extends AgentStepBase {
  kind: 'todo' | 'plan';
  items: AgentTodoPlanItem[];
}

export interface AgentImageStep extends AgentStepBase {
  kind: 'image';
  imagePath: string;
}

export type AgentStep =
  | AgentExploreStep
  | AgentWebStep
  | AgentCommandStep
  | AgentFileChangeStep
  | AgentTodoPlanStep
  | AgentImageStep
  | AgentStepBase;

export interface AgentStepFileChangeSummary {
  files: number;
  insertions: number;
  deletions: number;
}

export interface AgentStepProgressSummary {
  current: number;
  total: number;
  files: number;
  insertions: number;
  deletions: number;
}

export type AgentActivitySummaryKind =
  | 'file_change'
  | 'todo'
  | 'command'
  | 'read'
  | 'code_search'
  | 'web_search'
  | 'web_fetch'
  | 'mcp'
  | 'image'
  | 'generic';

export interface AgentActivitySummaryCounts {
  fileChanges: number;
  filesRead: number;
  codeSearches: number;
  commands: number;
  failedCommands: number;
  webSearches: number;
  webFetches: number;
  mcpTools: number;
  images: number;
  todoUpdates: number;
  genericTools: number;
}

export interface AgentActivitySummary {
  primaryKind: AgentActivitySummaryKind;
  counts: AgentActivitySummaryCounts;
  totalActions: number;
  visibleActionCount: number;
  extraActionCount: number;
  status: AgentStepStatus;
}

export interface AgentTodoProgressSummary {
  kind: 'todo' | 'plan';
  completed: number;
  total: number;
  current?: string;
  status: AgentStepStatus;
}

type AnyRecord = Record<string, unknown>;

const toRecord = (value: unknown): AnyRecord | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : undefined;

const valueToString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
};

const stringify = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const compact = (value?: string, max = 120): string | undefined => {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}...` : trimmed;
};

const stripMarkdownCodeFence = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const openingFence = trimmed.match(/^```[^\r\n`]*\r?\n?/);
  if (!openingFence) return trimmed;
  return trimmed
    .slice(openingFence[0].length)
    .replace(/\r?\n?```\s*$/u, '')
    .trim();
};

const basename = (path?: string): string | undefined => {
  if (!path) return undefined;
  return path.split(/[\\/]/).findLast(Boolean) || path;
};

const hostnameFromUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return compact(url, 64);
  }
};

const messageCreatedAt = (message: ToolMessage): number | undefined =>
  typeof message.created_at === 'number' ? message.created_at : undefined;

const quoted = (value?: string, max = 42): string | undefined => {
  const text = compact(value, max);
  return text ? `"${text}"` : undefined;
};

const countDiffChanges = (diff?: string): Pick<AgentStepFileChangeSummary, 'insertions' | 'deletions'> => {
  if (!diff) return { insertions: 0, deletions: 0 };
  return diff.split('\n').reduce(
    (summary, line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) summary.insertions += 1;
      if (line.startsWith('-') && !line.startsWith('---')) summary.deletions += 1;
      return summary;
    },
    { insertions: 0, deletions: 0 }
  );
};

const commandIntent = (command: string | undefined, status: AgentStepStatus): string => {
  const normalized = command?.toLowerCase() || '';
  const done = status !== 'running' && status !== 'pending';
  const failed = status === 'error';

  if (/\b(test|vitest|jest|playwright)\b/.test(normalized)) {
    if (failed) return 'Tests failed';
    return done ? 'Ran tests' : 'Running tests';
  }
  if (/\b(tsc|typecheck|type:check|ts:check)\b/.test(normalized)) {
    if (failed) return 'Type check failed';
    return done ? 'Checked types' : 'Checking types';
  }
  if (/\b(build|package|make|dist)\b/.test(normalized)) {
    if (failed) return 'Build failed';
    return done ? 'Built project' : 'Building project';
  }
  if (/\b(install|add|bun i|npm i|pnpm i|yarn)\b/.test(normalized)) {
    if (failed) return 'Install failed';
    return done ? 'Installed dependencies' : 'Installing dependencies';
  }
  if (/\b(git status|git diff|git show)\b/.test(normalized)) {
    return done ? 'Inspected changes' : 'Inspecting changes';
  }
  if (/\b(dev|start|serve)\b/.test(normalized)) {
    return done ? 'Started server' : 'Starting server';
  }

  if (failed) return 'Command failed';
  return done ? 'Ran command' : 'Running command';
};

const fileIntent = (status: AgentStepStatus, isWrite: boolean, fileName?: string): string => {
  const name = fileName || 'file';
  if (status === 'error') return `Failed to ${isWrite ? 'create' : 'update'} ${name}`;
  if (status === 'running' || status === 'pending') return `${isWrite ? 'Creating' : 'Updating'} ${name}`;
  return `${isWrite ? 'Created' : 'Updated'} ${name}`;
};

const webIntent = (status: AgentStepStatus, isSearch: boolean, target?: string): string => {
  const prefix = isSearch
    ? status === 'running' || status === 'pending'
      ? 'Searching web'
      : 'Searched web'
    : status === 'running' || status === 'pending'
      ? 'Fetching'
      : 'Fetched';
  return target ? `${prefix} ${target}` : prefix;
};

const statusFromToolGroup = (status: string): AgentStepStatus => {
  switch (status) {
    case 'Success':
      return 'completed';
    case 'Error':
      return 'error';
    case 'Canceled':
      return 'canceled';
    case 'Pending':
      return 'pending';
    case 'Executing':
    case 'Confirming':
    default:
      return 'running';
  }
};

const statusFromAcp = (status: string): AgentStepStatus => {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'error';
    case 'in_progress':
      return 'running';
    case 'pending':
    default:
      return 'pending';
  }
};

const statusFromToolCall = (status?: string): AgentStepStatus => {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'error':
      return 'error';
    case 'running':
      return 'running';
    default:
      return 'pending';
  }
};

const getFirstString = (record: AnyRecord | undefined, keys: string[]): string | undefined => {
  if (!record) return undefined;
  for (const key of keys) {
    const value = stripMarkdownCodeFence(valueToString(record[key]));
    if (value?.trim()) return value.trim();
  }
  return undefined;
};

const parseJsonObject = (value?: string): AnyRecord | undefined => {
  if (!value) return undefined;
  try {
    return toRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
};

const normalizeName = (name?: string): string =>
  (name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

const isReadName = (name: string): boolean =>
  ['read', 'readfile', 'viewfile', 'openfile'].includes(normalizeName(name));
const isGrepName = (name: string): boolean => ['grep', 'search', 'ripgrep'].includes(normalizeName(name));
const isGlobName = (name: string): boolean => ['glob', 'list', 'ls', 'findfiles'].includes(normalizeName(name));
const isWebSearchName = (name: string): boolean => ['websearch', 'searchweb'].includes(normalizeName(name));
const isWebFetchName = (name: string): boolean => ['webfetch', 'fetch', 'fetchurl'].includes(normalizeName(name));
const isCommandName = (name: string): boolean =>
  ['bash', 'shell', 'exec', 'execute', 'run', 'command', 'terminal'].includes(normalizeName(name));
const isWriteName = (name: string): boolean => ['write', 'writefile', 'createfile'].includes(normalizeName(name));
const isEditName = (name: string): boolean =>
  ['edit', 'replace', 'strreplace', 'updatefile'].includes(normalizeName(name));
const isTodoName = (name: string): boolean => ['todowrite', 'todo', 'tasklist'].includes(normalizeName(name));
const isPlanName = (name: string): boolean => ['planwrite', 'plan', 'updateplan'].includes(normalizeName(name));

const getResultDisplayText = (result: IMessageToolGroup['content'][0]['result_display']): string | undefined => {
  if (!result) return undefined;
  if (typeof result === 'string') return result;
  if ('file_diff' in result) return result.file_diff;
  if ('img_url' in result) return result.relative_path || result.img_url;
  return undefined;
};

const getToolGroupInputRecord = (tool: IMessageToolGroup['content'][0]): AnyRecord | undefined => {
  const details = tool.confirmationDetails;
  if (details?.type === 'exec') {
    return {
      command: stripMarkdownCodeFence(details.command),
      rootCommand: details.rootCommand,
    };
  }
  if (details?.type === 'edit') {
    return {
      file_path: details.file_name,
      file_diff: details.file_diff,
      isModifying: details.isModifying,
    };
  }
  if (details?.type === 'info') return { prompt: details.prompt, urls: details.urls };
  if (details?.type === 'mcp') {
    return {
      server_name: details.server_name,
      tool_name: details.tool_name,
      tool_display_name: details.tool_display_name,
    };
  }
  return parseJsonObject(tool.description) || undefined;
};

const getToolCallInputRecord = (message: IMessageToolCall): AnyRecord | undefined => {
  const { input, args } = message.content;
  return toRecord(input) || toRecord(args);
};

const acpContentOutput = (content: IMessageAcpToolCall['content']['update']['content']): string | undefined => {
  if (!Array.isArray(content)) return undefined;
  return content
    .map((item) => {
      if (item.type === 'content') return item.content?.text || '';
      if (item.type === 'diff') return item.path ? `[diff] ${item.path}` : '[diff]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
};

const extractTodoItems = (input: AnyRecord | undefined, output?: unknown): AgentTodoPlanItem[] => {
  const outputRecord = toRecord(output);
  const candidates = [input?.todos, input?.entries, outputRecord?.newTodos, outputRecord?.todos, outputRecord?.entries];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate
      .map((item) => toRecord(item))
      .filter((item): item is AnyRecord => !!item)
      .map((item) => ({
        content: valueToString(item.content) || valueToString(item.title) || valueToString(item.text) || 'Task',
        status:
          item.status === 'completed' || item.status === 'in_progress' || item.status === 'pending'
            ? item.status
            : 'pending',
      }));
  }

  return [];
};

const exploreChildFromStep = (step: AgentStep): AgentExploreChild | undefined => {
  if (step.kind !== 'generic' && step.kind !== 'web') {
    if (step.kind === 'file_change' || step.kind === 'command' || step.kind === 'todo' || step.kind === 'plan') {
      return undefined;
    }
  }

  const rawName = step.rawName || step.title;
  const input = parseJsonObject(step.input) || toRecord((step.raw as { input?: unknown } | undefined)?.input);
  const name = normalizeName(rawName);
  const path = getFirstString(input, ['file_path', 'file', 'path', 'target', 'name']);
  const pattern = getFirstString(input, ['pattern', 'glob', 'query']);
  const url = getFirstString(input, ['url', 'href']);
  const query = getFirstString(input, ['query', 'search', 'prompt']) || pattern;

  if (isReadName(rawName) || name === 'read') {
    return {
      id: step.id,
      kind: 'read',
      title: 'Read',
      subtitle: basename(path) || compact(step.subtitle),
      status: step.status,
      path,
      createdAt: step.createdAt,
    };
  }
  if (isGrepName(rawName)) {
    return {
      id: step.id,
      kind: 'grep',
      title: pattern ? `Searched ${quoted(pattern) || pattern}` : 'Searched files',
      subtitle: compact(pattern || step.subtitle),
      status: step.status,
      pattern,
      path,
      createdAt: step.createdAt,
    };
  }
  if (isGlobName(rawName)) {
    return {
      id: step.id,
      kind: 'glob',
      title: pattern ? `Listed ${compact(pattern, 42)}` : 'Listed files',
      subtitle: compact(pattern || path || step.subtitle),
      status: step.status,
      pattern,
      path,
      createdAt: step.createdAt,
    };
  }
  if (isWebSearchName(rawName)) {
    return {
      id: step.id,
      kind: 'search',
      title: query ? `Searched web ${quoted(query) || query}` : 'Searched web',
      subtitle: compact(query || step.subtitle),
      status: step.status,
      query,
      createdAt: step.createdAt,
    };
  }
  if (isWebFetchName(rawName)) {
    return {
      id: step.id,
      kind: 'fetch',
      title: hostnameFromUrl(url) ? `Fetched ${hostnameFromUrl(url)}` : 'Fetched page',
      subtitle: hostnameFromUrl(url) || compact(step.subtitle),
      status: step.status,
      query: url,
      createdAt: step.createdAt,
    };
  }
  return undefined;
};

const isExplorationStep = (step: AgentStep): boolean => !!exploreChildFromStep(step);

const makeExploreGroup = (children: AgentExploreChild[], status: AgentStepStatus): AgentExploreStep => {
  const fileCount = children.filter((child) => ['read', 'grep', 'glob'].includes(child.kind)).length;
  const searchCount = children.filter((child) => ['search', 'fetch'].includes(child.kind)).length;
  const createdAtValues = children
    .map((child) => child.createdAt)
    .filter((value): value is number => typeof value === 'number');
  const subtitleParts: string[] = [];
  if (fileCount) subtitleParts.push(`${fileCount} ${fileCount === 1 ? 'file' : 'files'}`);
  if (searchCount) subtitleParts.push(`${searchCount} ${searchCount === 1 ? 'search' : 'searches'}`);

  return {
    id: `explore-${children[0]?.id || Date.now()}`,
    kind: 'explore',
    status,
    title:
      fileCount > 0
        ? status === 'running' || status === 'pending'
          ? 'Inspecting files'
          : 'Inspected files'
        : status === 'running' || status === 'pending'
          ? 'Searching web'
          : 'Searched web',
    subtitle: subtitleParts.join(' · '),
    createdAt: createdAtValues.length ? Math.min(...createdAtValues) : undefined,
    children,
    fileCount,
    searchCount,
    source: 'tool_call',
  };
};

const combineStatus = (steps: AgentStep[]): AgentStepStatus => {
  if (steps.some((step) => step.status === 'running')) return 'running';
  if (steps.some((step) => step.status === 'pending')) return 'pending';
  if (steps.some((step) => step.status === 'error')) return 'error';
  if (steps.every((step) => step.status === 'canceled')) return 'canceled';
  return 'completed';
};

const stepFromToolGroupItem = (
  message: IMessageToolGroup,
  tool: IMessageToolGroup['content'][0]
): AgentStep | undefined => {
  const input = getToolGroupInputRecord(tool);
  const output = getResultDisplayText(tool.result_display);
  const status = statusFromToolGroup(tool.status);
  const details = tool.confirmationDetails;
  const fileDiff =
    details?.type === 'edit'
      ? details.file_diff
      : typeof tool.result_display === 'object' && tool.result_display && 'file_diff' in tool.result_display
        ? tool.result_display.file_diff
        : undefined;
  const fileName =
    details?.type === 'edit'
      ? details.file_name
      : typeof tool.result_display === 'object' && tool.result_display && 'file_name' in tool.result_display
        ? tool.result_display.file_name
        : getFirstString(input, ['file_path', 'path', 'file_name']);
  const base: AgentStepBase = {
    id: tool.call_id || `${message.id}-${tool.name}`,
    kind: 'generic',
    status,
    title: tool.name,
    subtitle: compact(tool.description),
    input: stringify(input || tool.description),
    output,
    createdAt: messageCreatedAt(message),
    messageId: message.id,
    conversationId: message.conversation_id,
    source: 'tool_group',
    rawName: tool.name,
    raw: tool,
  };

  if (details?.type === 'exec' || isCommandName(tool.name)) {
    const command = stripMarkdownCodeFence(
      details?.type === 'exec' ? details.command : getFirstString(input, ['command'])
    );
    return {
      ...base,
      kind: 'command',
      title: commandIntent(command, status),
      subtitle: compact(command),
      command,
      stdout: status === 'error' ? undefined : output,
      stderr: status === 'error' ? output || tool.description : undefined,
    } satisfies AgentCommandStep;
  }

  if (fileDiff || isWriteName(tool.name) || isEditName(tool.name)) {
    return {
      ...base,
      kind: 'file_change',
      title: fileIntent(status, isWriteName(tool.name), basename(fileName)),
      subtitle: basename(fileName) || compact(tool.description),
      fileName: basename(fileName),
      filePath: fileName,
      diff: fileDiff,
    } satisfies AgentFileChangeStep;
  }

  if (details?.type === 'mcp') {
    return {
      ...base,
      kind: 'mcp',
      title: details.tool_display_name || details.tool_name,
      subtitle: `${details.server_name}:${details.tool_name}`,
    };
  }

  if (isWebSearchName(tool.name) || isWebFetchName(tool.name)) {
    const url = getFirstString(input, ['url', 'href']);
    const query = getFirstString(input, ['query', 'search', 'prompt', 'pattern']);
    return {
      ...base,
      kind: 'web',
      title: webIntent(
        status,
        isWebSearchName(tool.name),
        compact(query || hostnameFromUrl(url), isWebSearchName(tool.name) ? 42 : 28)
      ),
      subtitle: compact(query || hostnameFromUrl(url) || tool.description),
      url,
      query,
    } satisfies AgentWebStep;
  }

  if (typeof tool.result_display === 'object' && tool.result_display && 'img_url' in tool.result_display) {
    return {
      ...base,
      kind: 'image',
      title: 'Generated image',
      subtitle: basename(tool.result_display.relative_path),
      imagePath: tool.result_display.relative_path || tool.result_display.img_url,
    } satisfies AgentImageStep;
  }

  if (isTodoName(tool.name) || isPlanName(tool.name)) {
    const items = extractTodoItems(input, output);
    return {
      ...base,
      kind: isPlanName(tool.name) ? 'plan' : 'todo',
      title: isPlanName(tool.name) ? 'Updated plan' : 'Updated to-dos',
      items,
    } satisfies AgentTodoPlanStep;
  }

  return base;
};

const stepFromAcpToolCall = (message: IMessageAcpToolCall): AgentStep | undefined => {
  const update = message.content?.update;
  if (!update) return undefined;
  const rawInput = update.rawInput || (update as typeof update & { raw_input?: AnyRecord }).raw_input;
  const output = acpContentOutput(update.content) || stringify(update.rawOutput || update.raw_output);
  const status = statusFromAcp(update.status);
  const imagePath = getAcpImagePath(update);
  const firstDiff = update.content?.find((item) => item.type === 'diff');
  const filePath =
    getFirstString(rawInput, ['file_path', 'path', 'file_name']) || firstDiff?.path || update.locations?.[0]?.path;
  const title = update.title || update.kind;
  const base: AgentStepBase = {
    id: update.tool_call_id,
    kind: 'generic',
    status,
    title,
    subtitle: compact(filePath || getFirstString(rawInput, ['command', 'query', 'pattern', 'url'])),
    input: stringify(rawInput),
    output,
    createdAt: messageCreatedAt(message),
    messageId: message.id,
    conversationId: message.conversation_id,
    source: 'acp_tool_call',
    rawName: title || update.kind,
    raw: message.content,
  };

  if (imagePath) {
    return {
      ...base,
      kind: 'image',
      title: 'Generated image',
      subtitle: basename(imagePath),
      imagePath,
    } satisfies AgentImageStep;
  }

  if (update.kind === 'execute' || isCommandName(title)) {
    const command = getFirstString(rawInput, ['command', 'cmd']);
    return {
      ...base,
      kind: 'command',
      title: commandIntent(command, status),
      subtitle: compact(command || title),
      command,
      stdout: status === 'error' ? undefined : output,
      stderr: status === 'error' ? output : undefined,
    } satisfies AgentCommandStep;
  }

  if (update.kind === 'edit' || firstDiff || isWriteName(title) || isEditName(title)) {
    return {
      ...base,
      kind: 'file_change',
      title: fileIntent(status, false, basename(filePath)),
      subtitle: basename(filePath),
      fileName: basename(filePath),
      filePath,
      diff: firstDiff ? undefined : undefined,
      oldText: firstDiff?.old_text || undefined,
      newText: firstDiff?.new_text,
    } satisfies AgentFileChangeStep;
  }

  if (isWebSearchName(title) || isWebFetchName(title)) {
    const url = getFirstString(rawInput, ['url', 'href']);
    const query = getFirstString(rawInput, ['query', 'search', 'prompt', 'pattern']);
    return {
      ...base,
      kind: 'web',
      title: webIntent(
        status,
        isWebSearchName(title),
        compact(query || hostnameFromUrl(url), isWebSearchName(title) ? 42 : 28)
      ),
      subtitle: compact(query || hostnameFromUrl(url) || title),
      url,
      query,
    } satisfies AgentWebStep;
  }

  return base;
};

const stepFromToolCall = (message: IMessageToolCall): AgentStep | undefined => {
  const { call_id, name, status, output, description } = message.content;
  if (!call_id) return undefined;
  const input = getToolCallInputRecord(message);
  const stepStatus = statusFromToolCall(status);
  const filePath = getFirstString(input, ['file_path', 'path', 'file_name']);
  const command = getFirstString(input, ['command', 'cmd']);
  const base: AgentStepBase = {
    id: call_id,
    kind: 'generic',
    status: stepStatus,
    title: name,
    subtitle: compact(description || filePath || command || getFirstString(input, ['pattern', 'query', 'url'])),
    input: stringify(input),
    output,
    createdAt: messageCreatedAt(message),
    messageId: message.id,
    conversationId: message.conversation_id,
    source: 'tool_call',
    rawName: name,
    raw: message.content,
  };

  if (isCommandName(name)) {
    return {
      ...base,
      kind: 'command',
      title: commandIntent(command, stepStatus),
      subtitle: compact(command || description),
      command,
      stdout: stepStatus === 'error' ? undefined : output,
      stderr: stepStatus === 'error' ? output : undefined,
    } satisfies AgentCommandStep;
  }

  if (isWriteName(name) || isEditName(name)) {
    return {
      ...base,
      kind: 'file_change',
      title: fileIntent(stepStatus, isWriteName(name), basename(filePath)),
      subtitle: basename(filePath) || compact(description),
      fileName: basename(filePath),
      filePath,
      diff: output,
      oldText: getFirstString(input, ['old_string', 'old_text']),
      newText: getFirstString(input, ['new_string', 'new_text', 'content']),
    } satisfies AgentFileChangeStep;
  }

  if (isTodoName(name) || isPlanName(name)) {
    return {
      ...base,
      kind: isPlanName(name) ? 'plan' : 'todo',
      title: isPlanName(name) ? 'Updated plan' : 'Updated to-dos',
      items: extractTodoItems(input, output),
    } satisfies AgentTodoPlanStep;
  }

  if (isWebSearchName(name) || isWebFetchName(name)) {
    const url = getFirstString(input, ['url', 'href']);
    const query = getFirstString(input, ['query', 'search', 'prompt', 'pattern']);
    return {
      ...base,
      kind: 'web',
      title: webIntent(
        stepStatus,
        isWebSearchName(name),
        compact(query || hostnameFromUrl(url), isWebSearchName(name) ? 42 : 28)
      ),
      subtitle: compact(query || hostnameFromUrl(url) || description),
      url,
      query,
    } satisfies AgentWebStep;
  }

  return base;
};

const stepFromMessage = (message: ToolMessage): AgentStep[] => {
  if (message.type === 'tool_group') {
    if (!Array.isArray(message.content)) return [];
    return message.content
      .map((tool) => stepFromToolGroupItem(message, tool))
      .filter((step): step is AgentStep => !!step);
  }
  if (message.type === 'acp_tool_call') {
    const step = stepFromAcpToolCall(message);
    return step ? [step] : [];
  }
  const step = stepFromToolCall(message);
  return step ? [step] : [];
};

const groupExplorationSteps = (steps: AgentStep[]): AgentStep[] => {
  const result: AgentStep[] = [];
  let current: AgentStep[] = [];

  const flush = () => {
    if (!current.length) return;
    if (current.length >= 2) {
      const children = current.map(exploreChildFromStep).filter((child): child is AgentExploreChild => !!child);
      result.push(makeExploreGroup(children, combineStatus(current)));
    } else {
      result.push(current[0]);
    }
    current = [];
  };

  for (const step of steps) {
    if (isExplorationStep(step)) {
      current.push(step);
    } else {
      flush();
      result.push(step);
    }
  }
  flush();
  return result;
};

export const normalizeAgentSteps = (messages: ToolMessage[]): AgentStep[] => {
  const steps = messages.flatMap(stepFromMessage);
  return groupExplorationSteps(steps);
};

export const hasRunningAgentSteps = (steps: AgentStep[]): boolean =>
  steps.some((step) => step.status === 'running' || step.status === 'pending');

export const summarizeAgentFileChanges = (steps: AgentStep[]): AgentStepFileChangeSummary => {
  const files = new Map<string, Pick<AgentStepFileChangeSummary, 'insertions' | 'deletions'>>();

  for (const step of steps) {
    if (step.kind !== 'file_change') continue;
    const change = step as AgentFileChangeStep;
    const fileKey = change.filePath || change.fileName || step.id;
    const diff =
      change.diff ||
      (change.oldText !== undefined || change.newText !== undefined
        ? `${
            change.oldText
              ? change.oldText
                  .split('\n')
                  .map((line) => `-${line}`)
                  .join('\n')
              : ''
          }\n${
            change.newText
              ? change.newText
                  .split('\n')
                  .map((line) => `+${line}`)
                  .join('\n')
              : ''
          }`
        : '');
    const counts = countDiffChanges(diff);
    const existing = files.get(fileKey);
    files.set(fileKey, {
      insertions: (existing?.insertions || 0) + counts.insertions,
      deletions: (existing?.deletions || 0) + counts.deletions,
    });
  }

  return Array.from(files.values()).reduce<AgentStepFileChangeSummary>(
    (summary, change) => ({
      files: summary.files + 1,
      insertions: summary.insertions + change.insertions,
      deletions: summary.deletions + change.deletions,
    }),
    { files: 0, insertions: 0, deletions: 0 }
  );
};

export const summarizeAgentProgress = (steps: AgentStep[]): AgentStepProgressSummary => {
  const total = Math.max(steps.length, 1);
  const activeIndex = steps.findIndex((step) => step.status === 'running' || step.status === 'pending');
  const completedCount = steps.filter(
    (step) => step.status === 'completed' || step.status === 'error' || step.status === 'canceled'
  ).length;
  const current = activeIndex >= 0 ? activeIndex + 1 : Math.max(completedCount, steps.length);
  const changes = summarizeAgentFileChanges(steps);

  return {
    current: Math.min(Math.max(current, 1), total),
    total,
    files: changes.files,
    insertions: changes.insertions,
    deletions: changes.deletions,
  };
};

const emptyActivityCounts = (): AgentActivitySummaryCounts => ({
  fileChanges: 0,
  filesRead: 0,
  codeSearches: 0,
  commands: 0,
  failedCommands: 0,
  webSearches: 0,
  webFetches: 0,
  mcpTools: 0,
  images: 0,
  todoUpdates: 0,
  genericTools: 0,
});

const uniqueFileChangeCount = (steps: AgentStep[]): number => {
  const files = new Set<string>();
  for (const step of steps) {
    if (step.kind !== 'file_change') continue;
    const fileStep = step as AgentFileChangeStep;
    files.add(fileStep.filePath || fileStep.fileName || step.id);
  }
  return files.size;
};

const addExplorationCounts = (counts: AgentActivitySummaryCounts, step: AgentExploreStep) => {
  for (const child of step.children) {
    if (child.kind === 'read') {
      counts.filesRead += 1;
      continue;
    }
    if (child.kind === 'grep' || child.kind === 'glob') {
      counts.codeSearches += 1;
      continue;
    }
    if (child.kind === 'search') {
      counts.webSearches += 1;
      continue;
    }
    if (child.kind === 'fetch') {
      counts.webFetches += 1;
      continue;
    }
    counts.genericTools += 1;
  }
};

const primaryKindFromCounts = (
  counts: AgentActivitySummaryCounts,
  status: AgentStepStatus
): AgentActivitySummaryKind => {
  if (status === 'error') return counts.commands > 0 ? 'command' : counts.fileChanges > 0 ? 'file_change' : 'generic';
  if (counts.fileChanges > 0) return 'file_change';
  if (counts.todoUpdates > 0) return 'todo';
  if (counts.commands > 0) return 'command';
  if (counts.filesRead > 0) return 'read';
  if (counts.codeSearches > 0) return 'code_search';
  if (counts.webSearches > 0) return 'web_search';
  if (counts.webFetches > 0) return 'web_fetch';
  if (counts.images > 0) return 'image';
  if (counts.mcpTools > 0) return 'mcp';
  return 'generic';
};

const summaryActionCount = (counts: AgentActivitySummaryCounts): number =>
  [
    counts.fileChanges,
    counts.filesRead,
    counts.codeSearches,
    counts.commands,
    counts.webSearches,
    counts.webFetches,
    counts.mcpTools,
    counts.images,
    counts.todoUpdates,
    counts.genericTools,
  ].filter((count) => count > 0).length;

export const summarizeAgentActivity = (steps: AgentStep[]): AgentActivitySummary => {
  const counts = emptyActivityCounts();
  counts.fileChanges = uniqueFileChangeCount(steps);

  for (const step of steps) {
    switch (step.kind) {
      case 'explore':
        addExplorationCounts(counts, step as AgentExploreStep);
        break;
      case 'web': {
        const webStep = step as AgentWebStep;
        if (isWebFetchName(webStep.rawName || webStep.title)) counts.webFetches += 1;
        else counts.webSearches += 1;
        break;
      }
      case 'command':
        counts.commands += 1;
        if (step.status === 'error') counts.failedCommands += 1;
        break;
      case 'todo':
      case 'plan':
        counts.todoUpdates += 1;
        break;
      case 'mcp':
        counts.mcpTools += 1;
        break;
      case 'image':
        counts.images += 1;
        break;
      case 'file_change':
        break;
      default:
        counts.genericTools += 1;
        break;
    }
  }

  const status = (() => {
    const combined = combineStatus(steps);
    const hasSuccessfulCommand = counts.commands > counts.failedCommands;
    if (combined === 'error' && counts.failedCommands > 0 && hasSuccessfulCommand) {
      return 'completed';
    }
    return combined;
  })();
  const visibleActionCount = Math.min(summaryActionCount(counts), 3);

  return {
    primaryKind: primaryKindFromCounts(counts, status),
    counts,
    totalActions: steps.length,
    visibleActionCount,
    extraActionCount: Math.max(0, summaryActionCount(counts) - visibleActionCount),
    status,
  };
};

export const summarizeAgentTodoProgress = (steps: AgentStep[]): AgentTodoProgressSummary | undefined => {
  const todoStep = steps.findLast(
    (step): step is AgentTodoPlanStep =>
      (step.kind === 'todo' || step.kind === 'plan') && (step as AgentTodoPlanStep).items.length > 0
  );
  if (!todoStep) return undefined;

  const completed = todoStep.items.filter((item) => item.status === 'completed').length;
  const current =
    todoStep.items.find((item) => item.status === 'in_progress') ||
    todoStep.items.find((item) => item.status === 'pending');

  return {
    kind: todoStep.kind,
    completed,
    total: todoStep.items.length,
    current: compact(current?.content, 72),
    status: todoStep.status,
  };
};
