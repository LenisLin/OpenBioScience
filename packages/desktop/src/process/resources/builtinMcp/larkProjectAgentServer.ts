/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Built-in MCP server for Lark-backed project leadership.
 *
 * This file must stay standalone. It runs in a plain Node stdio process, so it
 * cannot import Electron-backed project services. The bridge talks to:
 * - the local persisted project-agent state file,
 * - lark-cli for task/comment operations,
 * - DeepOrganiser Core Team Mode HTTP endpoints for team/slot execution.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { z } from 'zod';
import { legacyEnvName } from '@/common/config/legacyIdentifiers';
import { BUILTIN_LARK_PROJECT_AGENT_NAME } from './constants';

const execFileAsync = promisify(execFile);
const DEFAULT_PROFILE = 'deepscientist-pro';
const DEFAULT_PROJECT_AGENT_BACKEND = 'codex';
const PROFILE_STATE_FILE = 'lark-automation-profile.json';
const STATE_FILE = path.join('deepscientist_lark', 'project_agent', 'state.json');
const CONFIG_FILE = 'config.toml';
const AUTOMATION_DIR = 'automation';

type JsonRecord = Record<string, unknown>;
type LarkProjectTaskKind = 'agent' | 'human' | 'meta';
type LarkProjectTaskState =
  | 'planned'
  | 'created'
  | 'acknowledged'
  | 'running'
  | 'completed'
  | 'returned'
  | 'leader_consumed'
  | 'blocked'
  | 'discovered';
type DelegationState = 'created' | 'running' | 'waiting' | 'returned' | 'closed' | 'blocked';
type DelegationTarget =
  | {
      kind: 'team_agent';
      slotId: string;
      name?: string;
    }
  | {
      kind: 'lark_user';
      openId: string;
      name?: string;
    };
type Binding = {
  id: string;
  projectId: string;
  tasklistGuid: string;
  tasklistName: string;
  leaderAgentConversationId?: string;
  leaderAgentLabel: string;
  teamId?: string;
  leaderSlotId?: string;
  paused?: boolean;
  state: string;
  planId?: string;
  sectionGuidsByName: Record<string, string>;
  metaTaskGuidsByTitle: Record<string, string>;
  projectDetailsSectionGuid?: string;
  projectDocs?: unknown[];
  participantIds: string[];
  createdAt: number;
  updatedAt: number;
};
type Delegation = {
  id: string;
  tasklistGuid: string;
  tasklistName?: string;
  projectId?: string;
  larkTaskGuid: string;
  larkTaskUrl?: string;
  title: string;
  target: DelegationTarget;
  teamId?: string;
  leaderSlotId?: string;
  teamRunId?: string;
  teamMessageId?: string;
  state: DelegationState;
  waitFor: 'completion' | 'first_comment' | 'none';
  approvalRef?: string;
  lastWakeAt?: number;
  lastCommentFingerprint?: string;
  lastCommentCount?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};
type TaskRecord = {
  id: string;
  taskGuid: string;
  tasklistGuid?: string;
  projectId?: string;
  kind: LarkProjectTaskKind;
  state: LarkProjectTaskState;
  title: string;
  assigneeId?: string;
  agentConversationId?: string;
  pendingAgentConversationPrompt?: string;
  ackCommentId?: string;
  returnContextPacketId?: string;
  metadata?: JsonRecord;
  createdAt: number;
  updatedAt: number;
};
type PersistedState = {
  version: 1;
  plans: unknown[];
  bindings: Binding[];
  taskRecords: TaskRecord[];
  delegations: Delegation[];
  hiddenTasklistGuids: string[];
};
type LocalConversationLink = {
  id: string;
  role: 'leader' | 'agent' | 'task' | 'im';
  label?: string;
  slot_id?: string;
  team_id?: string;
  task_guid?: string;
  backend?: string;
  updated_at?: number;
};
type LocalTasklistConfig = {
  guid: string;
  name: string;
  source: 'lark';
  visible: boolean;
  order: number;
  url?: string;
  owner_name?: string;
  team_id?: string;
  leader_slot_id?: string;
  leader_conversation_id?: string;
  leader_agent_label?: string;
  workspace?: string;
  last_synced_at?: number;
  conversations: LocalConversationLink[];
};
type LocalConfig = {
  version: 1;
  updated_at: number;
  sidebar: {
    auto_sync_lark: boolean;
    show_lark_im: boolean;
  };
  tasklists: LocalTasklistConfig[];
  im_chats: unknown[];
};
type TeamAgent = {
  slot_id: string;
  conversation_id: string;
  role: 'leader' | 'teammate';
  agent_name: string;
  agent_type?: string;
  conversation_type?: string;
  status?: string;
};
type Team = {
  id: string;
  name: string;
  workspace: string;
  workspace_mode?: string;
  leader_agent_id?: string;
  agents: TeamAgent[];
};
type TeamRunAck = {
  team_run_id: string;
  team_id: string;
  target_slot_id: string;
  target_role: string;
  accepted_slot_id: string;
  accepted_role: string;
  status: string;
  message_id?: string;
};
type LarkTaskSummary = {
  guid: string;
  taskId?: string;
  summary: string;
  description?: string;
  status?: string;
  completedAt?: number;
  startAt?: number;
  dueAt?: number;
  sectionGuid?: string;
  tasklistGuid?: string;
  members: Array<{ id: string; name?: string; role?: string; type?: string }>;
  url?: string;
  extra?: string;
  isAgentTask?: boolean;
};
type DelegateTaskInput = {
  tasklistGuid: string;
  tasklistName?: string;
  projectId?: string;
  teamId?: string;
  leaderSlotId?: string;
  sourceConversationId: string;
  targetKind: 'team_agent' | 'lark_user';
  targetSlotId?: string;
  targetOpenId?: string;
  targetName?: string;
  title: string;
  goal: string;
  context?: string;
  inputs?: string[];
  deliverables?: string[];
  acceptanceCriteria?: string[];
  dueAt?: number;
  priority?: 'low' | 'normal' | 'high';
  waitFor?: 'completion' | 'first_comment' | 'none';
  approvalRef?: string;
  idempotencyKey?: string;
};

const delegateTaskSchema = {
  tasklistGuid: z.string().min(1).describe('Bound Lark tasklist GUID.'),
  tasklistName: z.string().optional().describe('Human-readable Lark tasklist/project name.'),
  projectId: z.string().optional().describe('Optional local project identifier.'),
  teamId: z.string().optional().describe('Optional Team Mode team id. Usually omit; the bridge resolves it.'),
  leaderSlotId: z.string().optional().describe('Optional Team Mode leader slot id. Usually omit.'),
  sourceConversationId: z
    .string()
    .min(1)
    .describe(
      'Required source conversation id of the project leader Agent. The bridge rejects calls from teammate or non-leader conversations.'
    ),
  targetKind: z
    .enum(['team_agent', 'lark_user'])
    .describe('Use team_agent for a local Team Mode teammate slot; lark_user for a human Lark assignee.'),
  targetSlotId: z.string().optional().describe('Required when targetKind is team_agent.'),
  targetOpenId: z.string().optional().describe('Required when targetKind is lark_user.'),
  targetName: z.string().optional().describe('Human-readable assignee name.'),
  title: z.string().min(1).describe('Short task title. Do not include [AGENT_TASK]; the bridge adds it for Agents.'),
  goal: z.string().min(1).describe('Concrete outcome needed from this task.'),
  context: z.string().optional().describe('Important background, links, prior decisions, and source messages.'),
  inputs: z.array(z.string()).optional().describe('Input files, documents, data, constraints, or links.'),
  deliverables: z.array(z.string()).optional().describe('Expected outputs or artifacts.'),
  acceptanceCriteria: z.array(z.string()).optional().describe('Observable checks for completion.'),
  dueAt: z.number().optional().describe('Optional due time as Unix milliseconds.'),
  priority: z.enum(['low', 'normal', 'high']).optional().describe('Task priority.'),
  waitFor: z
    .enum(['completion', 'first_comment', 'none'])
    .optional()
    .describe('What should wake the leader after delegation. Default is completion.'),
  approvalRef: z.string().optional().describe('Owner approval reference, if applicable.'),
  idempotencyKey: z.string().optional().describe('Stable idempotency key for retries.'),
};

function now(): number {
  return Date.now();
}

function dataDir(): string {
  return process.env.DEEPORGANISER_DATA_DIR || process.env[legacyEnvName('DATA_DIR')] || process.env.DATA_DIR || process.cwd();
}

function projectAgentDir(): string {
  return process.env.DEEPORGANISER_PROJECT_AGENT_DIR || path.join(dataDir(), 'deepscientist_lark', 'project_agent');
}

function statePath(): string {
  return process.env.DEEPORGANISER_PROJECT_AGENT_DIR ? path.join(projectAgentDir(), 'state.json') : path.join(dataDir(), STATE_FILE);
}

function configPath(): string {
  return path.join(projectAgentDir(), CONFIG_FILE);
}

function profileStatePath(): string {
  const nextPath = path.join(projectAgentDir(), AUTOMATION_DIR, PROFILE_STATE_FILE);
  return existsSync(nextPath) ? nextPath : path.join(dataDir(), PROFILE_STATE_FILE);
}

function emptyState(): PersistedState {
  return {
    version: 1,
    plans: [],
    bindings: [],
    taskRecords: [],
    delegations: [],
    hiddenTasklistGuids: [],
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function emptyLocalConfig(): LocalConfig {
  return {
    version: 1,
    updated_at: now(),
    sidebar: {
      auto_sync_lark: true,
      show_lark_im: true,
    },
    tasklists: [],
    im_chats: [],
  };
}

function normalizeConversationLink(value: unknown): LocalConversationLink | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return undefined;
  const role = value.role === 'agent' || value.role === 'task' || value.role === 'im' ? value.role : 'leader';
  return {
    id: value.id.trim(),
    role,
    label: typeof value.label === 'string' ? value.label : undefined,
    slot_id: typeof value.slot_id === 'string' ? value.slot_id : undefined,
    team_id: typeof value.team_id === 'string' ? value.team_id : undefined,
    task_guid: typeof value.task_guid === 'string' ? value.task_guid : undefined,
    backend: typeof value.backend === 'string' ? value.backend : undefined,
    updated_at: typeof value.updated_at === 'number' ? value.updated_at : undefined,
  };
}

function normalizeTasklistConfig(value: unknown, order: number): LocalTasklistConfig | undefined {
  if (!isRecord(value) || typeof value.guid !== 'string' || !value.guid.trim()) return undefined;
  const guid = value.guid.trim();
  const conversations = Array.isArray(value.conversations)
    ? value.conversations.map(normalizeConversationLink).filter((item): item is LocalConversationLink => Boolean(item))
    : [];
  return {
    guid,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : guid,
    source: 'lark',
    visible: typeof value.visible === 'boolean' ? value.visible : true,
    order: typeof value.order === 'number' ? value.order : order,
    url: typeof value.url === 'string' ? value.url : undefined,
    owner_name: typeof value.owner_name === 'string' ? value.owner_name : undefined,
    team_id: typeof value.team_id === 'string' ? value.team_id : undefined,
    leader_slot_id: typeof value.leader_slot_id === 'string' ? value.leader_slot_id : undefined,
    leader_conversation_id: typeof value.leader_conversation_id === 'string' ? value.leader_conversation_id : undefined,
    leader_agent_label: typeof value.leader_agent_label === 'string' ? value.leader_agent_label : undefined,
    workspace: typeof value.workspace === 'string' ? value.workspace : projectWorkspace(guid),
    last_synced_at: typeof value.last_synced_at === 'number' ? value.last_synced_at : undefined,
    conversations,
  };
}

async function readLocalConfig(): Promise<LocalConfig> {
  try {
    const parsed = parseToml(await fs.readFile(configPath(), 'utf8')) as JsonRecord;
    const sidebar = isRecord(parsed.sidebar) ? parsed.sidebar : {};
    const tasklists = Array.isArray(parsed.tasklists)
      ? parsed.tasklists.map(normalizeTasklistConfig).filter((item): item is LocalTasklistConfig => Boolean(item))
      : [];
    return {
      version: 1,
      updated_at: typeof parsed.updated_at === 'number' ? parsed.updated_at : now(),
      sidebar: {
        auto_sync_lark: typeof sidebar.auto_sync_lark === 'boolean' ? sidebar.auto_sync_lark : true,
        show_lark_im: typeof sidebar.show_lark_im === 'boolean' ? sidebar.show_lark_im : true,
      },
      tasklists,
      im_chats: Array.isArray(parsed.im_chats) ? parsed.im_chats : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return emptyLocalConfig();
  }
}

async function writeLocalConfig(config: LocalConfig): Promise<void> {
  const normalized: LocalConfig = {
    ...config,
    version: 1,
    updated_at: now(),
    tasklists: config.tasklists.toSorted((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
  };
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), `${stringifyToml(normalized as unknown as Record<string, unknown>)}\n`, 'utf8');
}

function mergeLinks(previous: LocalConversationLink[], incoming: LocalConversationLink[]): LocalConversationLink[] {
  const map = new Map<string, LocalConversationLink>();
  for (const link of previous) map.set(`${link.role}:${link.id}`, link);
  for (const link of incoming) map.set(`${link.role}:${link.id}`, { ...map.get(`${link.role}:${link.id}`), ...link });
  return Array.from(map.values()).toSorted((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
}

async function syncBindingToLocalConfig(binding: Binding): Promise<void> {
  const config = await readLocalConfig();
  const existing = config.tasklists.find((tasklist) => tasklist.guid === binding.tasklistGuid);
  const links: LocalConversationLink[] = [];
  if (binding.leaderAgentConversationId) {
    links.push({
      id: binding.leaderAgentConversationId,
      role: 'leader',
      label: binding.leaderAgentLabel,
      slot_id: binding.leaderSlotId,
      team_id: binding.teamId,
      backend: DEFAULT_PROJECT_AGENT_BACKEND,
      updated_at: now(),
    });
  }
  const tasklist: LocalTasklistConfig = {
    guid: binding.tasklistGuid,
    name: binding.tasklistName || existing?.name || binding.tasklistGuid,
    source: 'lark',
    visible: existing?.visible ?? true,
    order: existing?.order ?? config.tasklists.length,
    url: existing?.url,
    owner_name: existing?.owner_name,
    team_id: binding.teamId ?? existing?.team_id,
    leader_slot_id: binding.leaderSlotId ?? existing?.leader_slot_id,
    leader_conversation_id: binding.leaderAgentConversationId ?? existing?.leader_conversation_id,
    leader_agent_label: binding.leaderAgentLabel ?? existing?.leader_agent_label,
    workspace: existing?.workspace ?? projectWorkspace(binding.tasklistGuid),
    last_synced_at: existing?.last_synced_at,
    conversations: mergeLinks(existing?.conversations ?? [], links),
  };
  await writeLocalConfig({
    ...config,
    tasklists: [tasklist, ...config.tasklists.filter((item) => item.guid !== binding.tasklistGuid)],
  });
}

async function syncDelegationToLocalConfig(delegation: Delegation): Promise<void> {
  const config = await readLocalConfig();
  const existing = config.tasklists.find((tasklist) => tasklist.guid === delegation.tasklistGuid);
  const links: LocalConversationLink[] =
    delegation.target.kind === 'team_agent'
      ? [
          {
            id: delegation.teamMessageId || delegation.teamRunId || delegation.id,
            role: 'agent',
            label: delegation.target.name || delegation.title,
            slot_id: delegation.target.slotId,
            team_id: delegation.teamId,
            task_guid: delegation.larkTaskGuid,
            backend: DEFAULT_PROJECT_AGENT_BACKEND,
            updated_at: now(),
          },
        ]
      : [];
  const tasklist: LocalTasklistConfig = {
    guid: delegation.tasklistGuid,
    name: delegation.tasklistName || existing?.name || delegation.tasklistGuid,
    source: 'lark',
    visible: existing?.visible ?? true,
    order: existing?.order ?? config.tasklists.length,
    url: existing?.url ?? delegation.larkTaskUrl,
    owner_name: existing?.owner_name,
    team_id: delegation.teamId ?? existing?.team_id,
    leader_slot_id: delegation.leaderSlotId ?? existing?.leader_slot_id,
    leader_conversation_id: existing?.leader_conversation_id,
    leader_agent_label: existing?.leader_agent_label,
    workspace: existing?.workspace ?? projectWorkspace(delegation.tasklistGuid),
    last_synced_at: existing?.last_synced_at,
    conversations: mergeLinks(existing?.conversations ?? [], links),
  };
  await writeLocalConfig({
    ...config,
    tasklists: [tasklist, ...config.tasklists.filter((item) => item.guid !== delegation.tasklistGuid)],
  });
}

async function syncTaskRecordToLocalConfig(record: TaskRecord): Promise<void> {
  if (!record.tasklistGuid || !record.agentConversationId) return;
  const config = await readLocalConfig();
  const existing = config.tasklists.find((tasklist) => tasklist.guid === record.tasklistGuid);
  const tasklist: LocalTasklistConfig = {
    guid: record.tasklistGuid,
    name: existing?.name || record.tasklistGuid,
    source: 'lark',
    visible: existing?.visible ?? true,
    order: existing?.order ?? config.tasklists.length,
    url: existing?.url,
    owner_name: existing?.owner_name,
    team_id: existing?.team_id,
    leader_slot_id: existing?.leader_slot_id,
    leader_conversation_id: existing?.leader_conversation_id,
    leader_agent_label: existing?.leader_agent_label,
    workspace: existing?.workspace ?? projectWorkspace(record.tasklistGuid),
    last_synced_at: existing?.last_synced_at,
    conversations: mergeLinks(existing?.conversations ?? [], [
      {
        id: record.agentConversationId,
        role: record.kind === 'agent' ? 'agent' : 'task',
        label: typeof record.metadata?.targetAgent === 'string' ? record.metadata.targetAgent : record.title,
        task_guid: record.taskGuid,
        backend: DEFAULT_PROJECT_AGENT_BACKEND,
        updated_at: now(),
      },
    ]),
  };
  await writeLocalConfig({
    ...config,
    tasklists: [tasklist, ...config.tasklists.filter((item) => item.guid !== record.tasklistGuid)],
  });
}

async function readState(): Promise<PersistedState> {
  try {
    const raw = await fs.readFile(statePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      version: 1,
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      bindings: Array.isArray(parsed.bindings) ? parsed.bindings : [],
      taskRecords: Array.isArray(parsed.taskRecords) ? parsed.taskRecords : [],
      delegations: Array.isArray(parsed.delegations) ? parsed.delegations : [],
      hiddenTasklistGuids: Array.isArray(parsed.hiddenTasklistGuids)
        ? parsed.hiddenTasklistGuids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
    throw error;
  }
}

async function writeState(state: PersistedState): Promise<void> {
  await fs.mkdir(path.dirname(statePath()), { recursive: true });
  await fs.writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function selectedProfileName(): string {
  try {
    if (!existsSync(profileStatePath())) return DEFAULT_PROFILE;
    const parsed = JSON.parse(readFileSync(profileStatePath(), 'utf8')) as { selectedProfile?: string };
    const profileName = parsed.selectedProfile?.trim();
    return profileName && /^[A-Za-z0-9._:-]+$/.test(profileName) ? profileName : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function cliEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME;
  const nvmPath = home ? `${home}/.nvm/versions/node/v24.14.1/bin:${home}/.nvm/versions/node/v22.19.0/bin` : '';
  return {
    ...process.env,
    PATH: [
      nvmPath,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      process.env.PATH ?? '',
    ]
      .filter(Boolean)
      .join(':'),
  };
}

async function runLarkCli(args: string[], options: { cwd?: string } = {}): Promise<unknown> {
  const { stdout } = await execFileAsync('lark-cli', ['--profile', selectedProfileName(), ...args], {
    maxBuffer: 10 * 1024 * 1024,
    cwd: options.cwd,
    env: cliEnv(),
    timeout: 60_000,
  });
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('LARK_CLI_JSON_PARSE_FAILED');
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  }
}

function backendBaseUrl(): string {
  const port = process.env.DEEPORGANISER_BACKEND_PORT || process.env[legacyEnvName('BACKEND_PORT')] || process.env.BACKEND_PORT || '13400';
  return `http://127.0.0.1:${port}`;
}

async function backendRequest<T>(method: string, route: string, body?: unknown, silentStatuses: number[] = []): Promise<T> {
  const response = await fetch(`${backendBaseUrl()}${route}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    if (silentStatuses.includes(response.status)) return null as T;
    throw new Error(`Backend ${method} ${route} failed (${response.status}): ${await response.text()}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  const parsed = JSON.parse(text) as unknown;
  if (isRecord(parsed) && 'data' in parsed) {
    return parsed.data as T;
  }
  return parsed as T;
}

function pickString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function findGuid(value: unknown, keys: string[]): string | undefined {
  if (isRecord(value)) {
    const direct = pickString(value, keys);
    if (direct) return direct;
    for (const nested of Object.values(value)) {
      const guid = findGuid(nested, keys);
      if (guid) return guid;
    }
  }
  if (Array.isArray(value)) {
    for (const nested of value) {
      const guid = findGuid(nested, keys);
      if (guid) return guid;
    }
  }
  return undefined;
}

function parseTime(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  if (isRecord(value)) return parseTime(value.timestamp);
  return undefined;
}

function normalizeMember(value: unknown): LarkTaskSummary['members'][number] | undefined {
  if (!isRecord(value)) return undefined;
  const id = pickString(value, ['id', 'open_id', 'user_id']);
  if (!id) return undefined;
  return {
    id,
    name: pickString(value, ['name', 'localized_name', 'display_name', 'nickname']),
    role: pickString(value, ['role']),
    type: pickString(value, ['type']),
  };
}

function normalizeTask(value: unknown, tasklistGuid?: string): LarkTaskSummary | undefined {
  if (!isRecord(value)) return undefined;
  const guid = pickString(value, ['guid', 'task_guid', 'id']);
  const summary = pickString(value, ['summary', 'title', 'name']);
  if (!guid || !summary) return undefined;
  const tasklists = Array.isArray(value.tasklists) ? value.tasklists : [];
  const firstTasklist = tasklists.find(isRecord);
  const description = pickString(value, ['description', 'desc']);
  const extra = pickString(value, ['extra']);
  const text = `${summary}\n${description ?? ''}\n${extra ?? ''}`;
  return {
    guid,
    taskId: pickString(value, ['task_id']),
    summary,
    description,
    status: pickString(value, ['status']),
    completedAt: parseTime(value.completed_at),
    startAt: parseTime(value.start),
    dueAt: parseTime(value.due),
    sectionGuid: isRecord(firstTasklist) ? pickString(firstTasklist, ['section_guid']) : undefined,
    tasklistGuid: tasklistGuid ?? (isRecord(firstTasklist) ? pickString(firstTasklist, ['tasklist_guid']) : undefined),
    members: Array.isArray(value.members)
      ? value.members.map(normalizeMember).filter((item): item is LarkTaskSummary['members'][number] => Boolean(item))
      : [],
    url: pickString(value, ['url', 'app_link', 'applink']),
    extra,
    isAgentTask: /^\s*\[AGENT_TASK\]/i.test(text) || /"kind"\s*:\s*"agent"/i.test(text),
  };
}

async function createTask(input: {
  tasklistGuid: string;
  summary: string;
  description: string;
  dueAt?: number;
  assigneeId?: string;
  extra?: string;
}): Promise<{ guid: string; url?: string }> {
  const members = input.assigneeId
    ? [{ id: input.assigneeId, role: 'assignee', type: input.assigneeId.startsWith('cli_') ? 'app' : 'user' }]
    : undefined;
  const payload = await runLarkCli([
    'task',
    'tasks',
    'create',
    '--as',
    'user',
    '--data',
    JSON.stringify({
      summary: input.summary,
      description: input.description,
      due: input.dueAt ? { timestamp: String(input.dueAt), is_all_day: true } : undefined,
      extra: input.extra,
      members,
      tasklists: [{ tasklist_guid: input.tasklistGuid }],
    }),
    '--json',
  ]);
  const guid = findGuid(payload, ['guid', 'task_guid']);
  if (!guid) throw new Error('LARK_TASK_CREATE_FAILED');
  const url = isRecord(payload) && isRecord(payload.task) ? pickString(payload.task, ['url', 'app_link', 'applink']) : undefined;
  return { guid, url };
}

async function getTask(taskGuid: string): Promise<LarkTaskSummary> {
  const payload = await runLarkCli([
    'task',
    'tasks',
    'get',
    '--params',
    JSON.stringify({ task_guid: taskGuid, user_id_type: 'open_id' }),
    '--as',
    'user',
    '--json',
  ]);
  const rawTask = isRecord(payload)
    ? (payload.task ?? (isRecord(payload.data) ? (payload.data.task ?? payload.data) : payload.data) ?? payload)
    : payload;
  const task = normalizeTask(rawTask);
  if (!task) throw new Error('LARK_TASK_NOT_FOUND');
  return task;
}

function findComment(value: unknown): { id?: string; content?: string } | undefined {
  if (isRecord(value)) {
    const id = pickString(value, ['id', 'comment_id', 'guid']);
    const content = pickString(value, ['content', 'text']);
    if (id || content) return { id, content };
    for (const key of ['comment', 'data', 'item']) {
      const found = findComment(value[key]);
      if (found) return found;
    }
  }
  if (Array.isArray(value)) {
    for (const nested of value) {
      const found = findComment(nested);
      if (found) return found;
    }
  }
  return undefined;
}

function commentFingerprintFromPayload(payload: unknown): { fingerprint: string; count: number } {
  const comments: string[] = [];
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;
    const id = pickString(value, ['id', 'comment_id', 'guid']);
    const content = pickString(value, ['content', 'text']);
    if (id || content) {
      const createdAt = pickString(value, ['created_at', 'create_time']);
      const updatedAt = pickString(value, ['updated_at', 'update_time']);
      comments.push(`${id ?? content}:${updatedAt ?? createdAt ?? ''}`);
      return;
    }
    for (const key of ['comments', 'items', 'data']) visit(value[key]);
  }
  visit(payload);
  return {
    fingerprint: comments.join('|'),
    count: comments.length,
  };
}

async function listTaskCommentSnapshot(taskGuid: string): Promise<{ fingerprint: string; count: number }> {
  const payload = await runLarkCli([
    'api',
    'GET',
    '/open-apis/task/v2/comments',
    '--params',
    JSON.stringify({
      resource_type: 'task',
      resource_id: taskGuid,
      direction: 'asc',
      page_size: 100,
      user_id_type: 'open_id',
    }),
    '--as',
    'user',
    '--json',
  ]);
  return commentFingerprintFromPayload(payload);
}

async function commentTask(taskGuid: string, content: string): Promise<{ commentId?: string }> {
  const payload = await runLarkCli([
    'api',
    'POST',
    '/open-apis/task/v2/comments',
    '--data',
    JSON.stringify({
      content,
      resource_type: 'task',
      resource_id: taskGuid,
    }),
    '--params',
    JSON.stringify({ user_id_type: 'open_id' }),
    '--as',
    'user',
    '--json',
  ]);
  return { commentId: findComment(payload)?.id };
}

async function getTaskDetail(taskGuid: string): Promise<unknown> {
  const [task, comments, attachments] = await Promise.all([
    getTask(taskGuid),
    runLarkCli([
      'api',
      'GET',
      '/open-apis/task/v2/comments',
      '--params',
      JSON.stringify({
        resource_type: 'task',
        resource_id: taskGuid,
        direction: 'asc',
        page_size: 100,
        user_id_type: 'open_id',
      }),
      '--as',
      'user',
      '--json',
    ]).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })),
    runLarkCli([
      'api',
      'GET',
      '/open-apis/task/v2/attachments',
      '--params',
      JSON.stringify({
        resource_type: 'task',
        resource_id: taskGuid,
        page_size: 100,
        user_id_type: 'open_id',
      }),
      '--as',
      'user',
      '--json',
    ]).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })),
  ]);
  return { task, comments, attachments, fetchedAt: now() };
}

function normalizeAgent(raw: unknown): TeamAgent {
  const value = (raw ?? {}) as JsonRecord;
  const backend =
    (value.backend as string | undefined) ?? (value.agent_type as string | undefined) ?? DEFAULT_PROJECT_AGENT_BACKEND;
  return {
    slot_id: (value.slot_id as string | undefined) ?? '',
    conversation_id: (value.conversation_id as string | undefined) ?? '',
    role: value.role === 'lead' || value.role === 'leader' ? 'leader' : 'teammate',
    agent_name: (value.agent_name as string | undefined) ?? (value.name as string | undefined) ?? '',
    agent_type: backend,
    conversation_type: 'acp',
    status: 'idle',
  };
}

function normalizeTeam(raw: unknown): Team {
  const value = (raw ?? {}) as JsonRecord;
  const agents = Array.isArray(value.agents) ? value.agents.map(normalizeAgent) : [];
  return {
    id: (value.id as string | undefined) ?? '',
    name: (value.name as string | undefined) ?? '',
    workspace: (value.workspace as string | undefined) ?? '',
    workspace_mode: (value.workspace_mode as string | undefined) ?? 'shared',
    leader_agent_id:
      (value.leader_agent_id as string | undefined) ??
      (value.lead_agent_id as string | undefined) ??
      agents.find((agent) => agent.role === 'leader')?.slot_id,
    agents,
  };
}

function projectWorkspace(tasklistGuid: string): string {
  return path.join(projectAgentDir(), 'workspaces', 'project-team', tasklistGuid.replace(/[^A-Za-z0-9._-]+/g, '_'));
}

async function ensureProjectWorkspace(tasklistGuid: string): Promise<string> {
  const workspace = projectWorkspace(tasklistGuid);
  await fs.mkdir(workspace, { recursive: true });
  return workspace;
}

async function getTeam(teamId: string): Promise<Team | null> {
  const result = await backendRequest<unknown>('GET', `/api/teams/${encodeURIComponent(teamId)}`, undefined, [404]);
  return result ? normalizeTeam(result) : null;
}

async function createTeam(input: { name: string; tasklistGuid: string; leaderName?: string }): Promise<Team> {
  const workspace = await ensureProjectWorkspace(input.tasklistGuid);
  const raw = await backendRequest<unknown>('POST', '/api/teams', {
    name: input.name,
    workspace,
    agents: [
      {
        name: input.leaderName?.trim() || '负责人 Agent',
        role: 'lead',
        backend: DEFAULT_PROJECT_AGENT_BACKEND,
        model: 'default',
      },
    ],
  });
  return normalizeTeam(raw);
}

async function ensureTeamSession(teamId: string): Promise<void> {
  await backendRequest<void>('POST', `/api/teams/${encodeURIComponent(teamId)}/session`).catch((): undefined => undefined);
}

async function sendTeamMessage(input: { teamId: string; content: string }): Promise<TeamRunAck> {
  return backendRequest<TeamRunAck>('POST', `/api/teams/${encodeURIComponent(input.teamId)}/messages`, {
    content: input.content,
  });
}

async function sendMessageToTeamAgent(input: { teamId: string; slotId: string; content: string }): Promise<TeamRunAck> {
  return backendRequest<TeamRunAck>(
    'POST',
    `/api/teams/${encodeURIComponent(input.teamId)}/agents/${encodeURIComponent(input.slotId)}/messages`,
    { content: input.content }
  );
}

function inferLanguage(text: string | undefined): 'zh' | 'en' {
  return /[\u3400-\u9fff]/.test(text ?? '') ? 'zh' : 'en';
}

function acknowledgementText(input: { actorName: string; actorKind: 'Agent' | 'Human'; taskTitle?: string }): string {
  return inferLanguage(input.taskTitle) === 'zh'
    ? `${input.actorName} [${input.actorKind}] 已顺利收到此任务。`
    : `${input.actorName} [${input.actorKind}] has successfully received this task.`;
}

function targetFromInput(input: DelegateTaskInput): DelegationTarget {
  if (input.targetKind === 'team_agent') {
    const slotId = input.targetSlotId?.trim();
    if (!slotId) throw new Error('targetSlotId is required for targetKind=team_agent');
    return { kind: 'team_agent', slotId, name: input.targetName?.trim() || undefined };
  }
  const openId = input.targetOpenId?.trim();
  if (!openId) throw new Error('targetOpenId is required for targetKind=lark_user');
  return { kind: 'lark_user', openId, name: input.targetName?.trim() || undefined };
}

function taskCard(input: DelegateTaskInput, target: DelegationTarget): string {
  const owner = target.name || (target.kind === 'team_agent' ? target.slotId : target.openId);
  return [
    target.kind === 'team_agent' ? '[AGENT_TASK]' : undefined,
    `Title: ${input.title}`,
    `Owner: ${owner}`,
    input.tasklistName ? `Project: ${input.tasklistName}` : undefined,
    `Goal: ${input.goal}`,
    input.context ? `Context: ${input.context}` : undefined,
    input.inputs?.length ? ['Inputs:', ...input.inputs.map((item) => `- ${item}`)].join('\n') : undefined,
    input.deliverables?.length ? ['Deliverables:', ...input.deliverables.map((item) => `- ${item}`)].join('\n') : undefined,
    input.acceptanceCriteria?.length
      ? ['Acceptance Criteria:', ...input.acceptanceCriteria.map((item) => `- ${item}`)].join('\n')
      : undefined,
    input.dueAt ? `Deadline: ${new Date(input.dueAt).toISOString()}` : 'Deadline: none',
    '',
    'Return Format:',
    '- Result',
    '- Evidence / Links / Attachments',
    '- Decisions Made',
    '- Open Questions',
    '- Risks / Blockers',
    '- Suggested Next Step',
  ]
    .filter((line): line is string => typeof line === 'string' && line.length > 0)
    .join('\n');
}

function childPrompt(input: {
  request: DelegateTaskInput;
  target: DelegationTarget;
  taskGuid: string;
  taskUrl?: string;
  delegationId: string;
}): string {
  return [
    '# Delegated Lark Project Task',
    '',
    `Delegation ID: ${input.delegationId}`,
    `Lark Task GUID: ${input.taskGuid}`,
    input.taskUrl ? `Lark Task URL: ${input.taskUrl}` : undefined,
    `Tasklist GUID: ${input.request.tasklistGuid}`,
    input.request.tasklistName ? `Tasklist Name: ${input.request.tasklistName}` : undefined,
    '',
    'You are executing this as a Team Mode teammate slot. The Lark task is the durable task spec and the comment thread is the shared memory.',
    'Acknowledge in the Lark task comments, complete the work, then write the completion packet back to the task comments before returning locally.',
    '',
    '## Task Card',
    taskCard(input.request, input.target),
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

async function saveBinding(binding: Binding): Promise<Binding> {
  const state = await readState();
  const updated = { ...binding, updatedAt: now() };
  state.bindings = [updated, ...state.bindings.filter((item) => item.id !== binding.id)];
  await writeState(state);
  await syncBindingToLocalConfig(updated).catch((): undefined => undefined);
  return updated;
}

async function ensureBinding(input: DelegateTaskInput): Promise<Binding> {
  const state = await readState();
  const existing = state.bindings.find((binding) => binding.tasklistGuid === input.tasklistGuid);
  const timestamp = now();
  let binding: Binding =
    existing ??
    ({
      id: `lark-binding-${randomUUID()}`,
      projectId: input.projectId || `lark-project-${input.tasklistGuid}`,
      tasklistGuid: input.tasklistGuid,
      tasklistName: input.tasklistName || '协作项目',
      leaderAgentLabel: '负责人 Agent',
      state: 'planning',
      sectionGuidsByName: {},
      metaTaskGuidsByTitle: {},
      participantIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies Binding);

  if (input.teamId && binding.teamId !== input.teamId) {
    binding = await saveBinding({ ...binding, teamId: input.teamId, leaderSlotId: input.leaderSlotId || binding.leaderSlotId });
  }

  if (binding.teamId) {
    const team = await getTeam(binding.teamId);
    if (team?.id) {
      await ensureTeamSession(team.id);
      const leader = team.agents.find((agent) => agent.slot_id === binding.leaderSlotId) ?? team.agents.find((agent) => agent.slot_id === team.leader_agent_id) ?? team.agents.find((agent) => agent.role === 'leader');
      const leaderSlotId = leader?.slot_id || binding.leaderSlotId || team.leader_agent_id;
      const leaderAgentConversationId = leader?.conversation_id || binding.leaderAgentConversationId;
      return leaderSlotId !== binding.leaderSlotId || leaderAgentConversationId !== binding.leaderAgentConversationId
        ? saveBinding({ ...binding, leaderSlotId, leaderAgentConversationId })
        : binding;
    }
  }

  const team = await createTeam({
    name: input.tasklistName || binding.tasklistName || '协作项目',
    tasklistGuid: input.tasklistGuid,
    leaderName: binding.leaderAgentLabel,
  });
  await ensureTeamSession(team.id);
  return saveBinding({
    ...binding,
    teamId: team.id,
    leaderSlotId: team.agents.find((agent) => agent.slot_id === team.leader_agent_id)?.slot_id || team.agents.find((agent) => agent.role === 'leader')?.slot_id || team.leader_agent_id,
    leaderAgentConversationId: team.agents.find((agent) => agent.slot_id === team.leader_agent_id)?.conversation_id || team.agents.find((agent) => agent.role === 'leader')?.conversation_id,
  });
}

async function assertLeaderCaller(input: { binding: Binding; sourceConversationId?: string }): Promise<void> {
  const sourceConversationId = input.sourceConversationId?.trim();
  if (!sourceConversationId) {
    throw new Error('LARK_DELEGATE_TASK_SOURCE_CONVERSATION_REQUIRED');
  }
  if (!input.binding.teamId) {
    throw new Error('LARK_DELEGATE_TASK_TEAM_REQUIRED');
  }
  const team = await getTeam(input.binding.teamId);
  const leaderSlotId = input.binding.leaderSlotId || team?.leader_agent_id;
  const leaderConversationId = team?.agents.find((agent) => {
    if (leaderSlotId && agent.slot_id === leaderSlotId) return true;
    return agent.role === 'leader';
  })?.conversation_id;
  if (!leaderConversationId || sourceConversationId !== leaderConversationId) {
    throw new Error('LARK_DELEGATE_TASK_LEADER_PERMISSION_REQUIRED');
  }
}

async function saveDelegation(delegation: Delegation): Promise<Delegation> {
  const state = await readState();
  const updated = { ...delegation, updatedAt: now() };
  state.delegations = [
    updated,
    ...state.delegations.filter((item) => item.id !== delegation.id && item.larkTaskGuid !== delegation.larkTaskGuid),
  ];
  await writeState(state);
  await syncDelegationToLocalConfig(updated).catch((): undefined => undefined);
  return updated;
}

async function saveTaskRecord(record: TaskRecord): Promise<TaskRecord> {
  const state = await readState();
  const updated = { ...record, updatedAt: now() };
  state.taskRecords = [
    updated,
    ...state.taskRecords.filter((item) => item.id !== record.id && item.taskGuid !== record.taskGuid),
  ];
  await writeState(state);
  await syncTaskRecordToLocalConfig(updated).catch((): undefined => undefined);
  return updated;
}

async function delegateTask(input: DelegateTaskInput): Promise<unknown> {
  const target = targetFromInput(input);
  const binding = await ensureBinding(input);
  await assertLeaderCaller({ binding, sourceConversationId: input.sourceConversationId });
  const description = taskCard(input, target);
  const taskSummary = target.kind === 'team_agent' && !input.title.startsWith('[AGENT_TASK]') ? `[AGENT_TASK] ${input.title}` : input.title;
  const created = await createTask({
    tasklistGuid: input.tasklistGuid,
    summary: taskSummary,
    description,
    dueAt: input.dueAt,
    assigneeId: target.kind === 'lark_user' ? target.openId : undefined,
    extra: JSON.stringify({
      source: 'deepscientist_lark_delegate_task',
      kind: target.kind === 'team_agent' ? 'agent' : 'human',
      tasklistGuid: input.tasklistGuid,
      teamId: binding.teamId,
      target,
      approvalRef: input.approvalRef,
      idempotencyKey: input.idempotencyKey,
    }),
  });
  const task = await getTask(created.guid);
  const delegationId = `lark-delegation-${randomUUID()}`;
  const actorName = target.kind === 'team_agent' ? target.name || target.slotId : target.name || target.openId;
  const ackText = acknowledgementText({
    actorName,
    actorKind: target.kind === 'team_agent' ? 'Agent' : 'Human',
    taskTitle: `${input.title}\n${input.goal}`,
  });
  const acknowledgement = await commentTask(created.guid, ackText).catch((): undefined => undefined);
  const initialComments = await listTaskCommentSnapshot(created.guid).catch((): { fingerprint: string; count: number } => ({
    fingerprint: '',
    count: 0,
  }));
  const timestamp = now();
  const base: Delegation = {
    id: delegationId,
    tasklistGuid: input.tasklistGuid,
    tasklistName: input.tasklistName || binding.tasklistName,
    projectId: input.projectId || binding.projectId,
    larkTaskGuid: created.guid,
    larkTaskUrl: created.url || task.url,
    title: input.title,
    target,
    teamId: binding.teamId,
    leaderSlotId: binding.leaderSlotId,
    state: target.kind === 'team_agent' ? 'created' : 'waiting',
    waitFor: input.waitFor || 'completion',
    approvalRef: input.approvalRef,
    lastCommentFingerprint: initialComments.fingerprint,
    lastCommentCount: initialComments.count,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (target.kind === 'team_agent') {
    if (!binding.teamId) throw new Error('LARK_PROJECT_TEAM_ID_REQUIRED');
    const run = await sendMessageToTeamAgent({
      teamId: binding.teamId,
      slotId: target.slotId,
      content: childPrompt({
        request: input,
        target,
        taskGuid: created.guid,
        taskUrl: created.url || task.url,
        delegationId,
      }),
    });
    const delegation = await saveDelegation({
      ...base,
      state: 'running',
      teamRunId: run.team_run_id,
      teamMessageId: run.message_id,
    });
    const record = await saveTaskRecord({
      id: `lark-task-${randomUUID()}`,
      taskGuid: created.guid,
      tasklistGuid: input.tasklistGuid,
      projectId: input.projectId || binding.projectId,
      kind: 'agent',
      state: 'running',
      title: input.title,
      assigneeId: target.slotId,
      ackCommentId: acknowledgement?.commentId,
      metadata: {
        taskGuid: created.guid,
        taskTitle: input.title,
        taskDescription: description,
        projectId: input.projectId || binding.projectId,
        tasklistGuid: input.tasklistGuid,
        targetAgent: actorName,
        delegationId,
        requiredResponse: 'context_packet',
        language: 'auto',
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return {
      ok: true,
      delegation,
      task,
      taskRecord: record,
      acknowledgement: { text: ackText, commentId: acknowledgement?.commentId },
      nextInstructionForLeader:
        'The task has been delegated through Team Mode. Stop this branch now and wait for the child turn or Lark task feedback before continuing.',
    };
  }

  const delegation = await saveDelegation(base);
  const record = await saveTaskRecord({
    id: `lark-task-${randomUUID()}`,
    taskGuid: created.guid,
    tasklistGuid: input.tasklistGuid,
    projectId: input.projectId || binding.projectId,
    kind: 'human',
    state: 'planned',
    title: input.title,
    assigneeId: target.openId,
    ackCommentId: acknowledgement?.commentId,
    metadata: {
      taskGuid: created.guid,
      taskTitle: input.title,
      taskDescription: description,
      projectId: input.projectId || binding.projectId,
      tasklistGuid: input.tasklistGuid,
      targetAgent: actorName,
      delegationId,
      requiredResponse: 'context_packet',
      language: 'auto',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return {
    ok: true,
    delegation,
    task,
    taskRecord: record,
    acknowledgement: { text: ackText, commentId: acknowledgement?.commentId },
    nextInstructionForLeader:
      'The task has been assigned in Lark. Stop this branch now and wait for the human assignee to comment or complete the Lark task.',
  };
}

async function main() {
  const server = new McpServer({
    name: BUILTIN_LARK_PROJECT_AGENT_NAME,
    version: '1.0.0',
  });

  server.tool(
    'delegate_task',
    `Delegate project work through the DeepScientist Lark project bridge.

Use this only after the project owner has approved the plan. It creates the Lark task, writes the Agent Card, stores delegation state, and for local Agents sends the work into Team Mode as a child turn.

After success with waitFor=completion or first_comment, stop this branch and wait for the returned Team child turn or Lark task feedback.`,
    delegateTaskSchema,
    async (input) => {
      try {
        return { content: [{ type: 'text' as const, text: JSON.stringify(await delegateTask(input), null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `delegate_task failed: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool('get_project_snapshot', 'Read the local Lark project bridge snapshot.', {}, async () => {
    try {
      const state = await readState();
      const localConfig = await readLocalConfig();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ...state, localConfig }, null, 2) }] };
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: `get_project_snapshot failed: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  });

  server.tool(
    'get_lark_task_detail',
    'Read a Lark task detail, including comments and attachments.',
    { taskGuid: z.string().min(1) },
    async ({ taskGuid }) => {
      try {
        return { content: [{ type: 'text' as const, text: JSON.stringify(await getTaskDetail(taskGuid), null, 2) }] };
      } catch (error) {
        return {
          content: [
            { type: 'text' as const, text: `get_lark_task_detail failed: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'comment_lark_task',
    'Append a concise progress, blocker, or completion comment to a Lark task.',
    {
      taskGuid: z.string().min(1),
      content: z.string().min(1),
    },
    async ({ taskGuid, content }) => {
      try {
        return { content: [{ type: 'text' as const, text: JSON.stringify(await commentTask(taskGuid, content), null, 2) }] };
      } catch (error) {
        return {
          content: [
            { type: 'text' as const, text: `comment_lark_task failed: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    }
  );

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error('[LarkProjectAgentMCP] Fatal error:', error);
  process.exit(1);
});
