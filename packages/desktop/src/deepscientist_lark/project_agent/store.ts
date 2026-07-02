/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getPlatformServices } from '@/common/platform';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type {
  LarkProjectBinding,
  LarkProjectDelegation,
  LarkProjectLocalConfig,
  LarkProjectLocalConversationLink,
  LarkProjectLocalTasklistConfig,
  LarkProjectPlan,
  LarkProjectPromptFile,
  LarkProjectPromptRole,
  LarkProjectSnapshot,
  LarkProjectTaskRecord,
} from './types';
import {
  DEFAULT_AGENT_TASK_SYSTEM_PROMPT,
  DEFAULT_COLLABORATION_AGENT_SYSTEM_PROMPT,
  DEFAULT_LEADER_AGENT_SYSTEM_PROMPT,
  EMPTY_DEFAULT_AGENT_SYSTEM_PROMPT,
  LEGACY_COLLABORATION_AGENT_SYSTEM_PROMPT,
} from './promptDefaults';

type PersistedState = {
  version: 1;
  plans: LarkProjectPlan[];
  bindings: LarkProjectBinding[];
  taskRecords: LarkProjectTaskRecord[];
  delegations: LarkProjectDelegation[];
  hiddenTasklistGuids: string[];
};

const STATE_FILE_NAME = 'state.json';
const CONFIG_FILE_NAME = 'config.toml';
const MODULE_DIR_PARTS = ['deepscientist_lark', 'project_agent'] as const;

function now(): number {
  return Date.now();
}

export function getProjectAgentDataDir(): string {
  return path.join(getPlatformServices().paths.getDataDir(), ...MODULE_DIR_PARTS);
}

export function getPromptDir(): string {
  return path.join(getProjectAgentDataDir(), 'prompts');
}

function getStatePath(): string {
  return path.join(getProjectAgentDataDir(), STATE_FILE_NAME);
}

export function getLocalConfigPath(): string {
  return path.join(getProjectAgentDataDir(), CONFIG_FILE_NAME);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
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

function emptyLocalConfig(): LarkProjectLocalConfig {
  return {
    version: 1,
    updatedAt: now(),
    sidebar: {
      autoSyncLark: true,
      showLarkIm: true,
    },
    tasklists: [],
    imChats: [],
  };
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_');
}

function getProjectTeamWorkspace(tasklistGuid: string): string {
  return path.join(getProjectAgentDataDir(), 'workspaces', 'project-team', sanitizePathPart(tasklistGuid));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function conversationFromToml(value: unknown): LarkProjectLocalConversationLink | undefined {
  if (!isRecord(value)) return undefined;
  const id = asString(value.id);
  if (!id) return undefined;
  const role = asString(value.role);
  return {
    id,
    role: role === 'agent' || role === 'task' || role === 'im' ? role : 'leader',
    label: asString(value.label),
    slotId: asString(value.slot_id ?? value.slotId),
    teamId: asString(value.team_id ?? value.teamId),
    taskGuid: asString(value.task_guid ?? value.taskGuid),
    backend: asString(value.backend),
    updatedAt: asNumber(value.updated_at ?? value.updatedAt),
  };
}

function tasklistFromToml(value: unknown, order: number): LarkProjectLocalTasklistConfig | undefined {
  if (!isRecord(value)) return undefined;
  const guid = asString(value.guid);
  if (!guid) return undefined;
  const conversations = Array.isArray(value.conversations)
    ? value.conversations.map(conversationFromToml).filter((item): item is LarkProjectLocalConversationLink => Boolean(item))
    : [];
  return {
    guid,
    name: asString(value.name) ?? guid,
    source: 'lark',
    visible: asBoolean(value.visible) ?? true,
    order: asNumber(value.order) ?? order,
    pinned: asBoolean(value.pinned),
    pinnedAt: asNumber(value.pinned_at ?? value.pinnedAt),
    url: asString(value.url),
    ownerName: asString(value.owner_name ?? value.ownerName),
    teamId: asString(value.team_id ?? value.teamId),
    leaderSlotId: asString(value.leader_slot_id ?? value.leaderSlotId),
    leaderConversationId: asString(value.leader_conversation_id ?? value.leaderConversationId),
    leaderAgentLabel: asString(value.leader_agent_label ?? value.leaderAgentLabel),
    workspace: asString(value.workspace) ?? getProjectTeamWorkspace(guid),
    lastSyncedAt: asNumber(value.last_synced_at ?? value.lastSyncedAt),
    conversations,
  };
}

function imChatFromToml(value: unknown, order: number): LarkProjectLocalConfig['imChats'][number] | undefined {
  if (!isRecord(value)) return undefined;
  const chatId = asString(value.chat_id ?? value.chatId);
  if (!chatId) return undefined;
  return {
    chatId,
    profileName: asString(value.profile_name ?? value.profileName),
    displayName: asString(value.display_name ?? value.displayName) ?? chatId,
    visible: asBoolean(value.visible) ?? true,
    conversationId: asString(value.conversation_id ?? value.conversationId),
    workspace: asString(value.workspace),
    lastSyncedAt: asNumber(value.last_synced_at ?? value.lastSyncedAt) ?? order,
  };
}

function normalizeLocalConfig(raw: unknown): LarkProjectLocalConfig {
  if (!isRecord(raw)) return emptyLocalConfig();
  const sidebar = isRecord(raw.sidebar) ? raw.sidebar : {};
  const tasklists = Array.isArray(raw.tasklists)
    ? raw.tasklists.map(tasklistFromToml).filter((item): item is LarkProjectLocalTasklistConfig => Boolean(item))
    : [];
  const imChatValues = Array.isArray(raw.im_chats)
    ? raw.im_chats
    : Array.isArray(raw.imChats)
      ? raw.imChats
      : [];
  const imChats = imChatValues.map(imChatFromToml).filter((item): item is LarkProjectLocalConfig['imChats'][number] => Boolean(item));
  return {
    version: 1,
    updatedAt: asNumber(raw.updated_at ?? raw.updatedAt) ?? now(),
    sidebar: {
      autoSyncLark: asBoolean(sidebar.auto_sync_lark ?? sidebar.autoSyncLark) ?? true,
      showLarkIm: asBoolean(sidebar.show_lark_im ?? sidebar.showLarkIm) ?? true,
    },
    tasklists: dedupeTasklists(tasklists),
    imChats: dedupeImChats(imChats),
  };
}

function dedupeTasklists(tasklists: LarkProjectLocalTasklistConfig[]): LarkProjectLocalTasklistConfig[] {
  const map = new Map<string, LarkProjectLocalTasklistConfig>();
  for (const tasklist of tasklists) {
    const existing = map.get(tasklist.guid);
    if (!existing || tasklist.order >= existing.order) {
      map.set(tasklist.guid, {
        ...existing,
        ...tasklist,
        conversations: mergeConversationLinks(existing?.conversations ?? [], tasklist.conversations),
      });
    }
  }
  return Array.from(map.values()).toSorted((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function dedupeImChats(imChats: LarkProjectLocalConfig['imChats']): LarkProjectLocalConfig['imChats'] {
  const map = new Map<string, LarkProjectLocalConfig['imChats'][number]>();
  for (const chat of imChats) {
    map.set(chat.chatId, {
      ...map.get(chat.chatId),
      ...chat,
    });
  }
  return Array.from(map.values());
}

function mergeConversationLinks(
  previous: LarkProjectLocalConversationLink[],
  incoming: LarkProjectLocalConversationLink[]
): LarkProjectLocalConversationLink[] {
  const map = new Map<string, LarkProjectLocalConversationLink>();
  for (const link of previous) {
    map.set(`${link.role}:${link.id}`, link);
  }
  for (const link of incoming) {
    map.set(`${link.role}:${link.id}`, {
      ...map.get(`${link.role}:${link.id}`),
      ...link,
    });
  }
  return Array.from(map.values()).toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

function localConfigToToml(config: LarkProjectLocalConfig): Record<string, unknown> {
  return compactRecord({
    version: 1,
    updated_at: config.updatedAt,
    sidebar: {
      auto_sync_lark: config.sidebar.autoSyncLark,
      show_lark_im: config.sidebar.showLarkIm,
    },
    tasklists: config.tasklists.map((tasklist) =>
      compactRecord({
        guid: tasklist.guid,
        name: tasklist.name,
        source: tasklist.source,
        visible: tasklist.visible,
        order: tasklist.order,
        pinned: tasklist.pinned,
        pinned_at: tasklist.pinnedAt,
        url: tasklist.url,
        owner_name: tasklist.ownerName,
        team_id: tasklist.teamId,
        leader_slot_id: tasklist.leaderSlotId,
        leader_conversation_id: tasklist.leaderConversationId,
        leader_agent_label: tasklist.leaderAgentLabel,
        workspace: tasklist.workspace,
        last_synced_at: tasklist.lastSyncedAt,
        conversations: tasklist.conversations.map((conversation) =>
          compactRecord({
            id: conversation.id,
            role: conversation.role,
            label: conversation.label,
            slot_id: conversation.slotId,
            team_id: conversation.teamId,
            task_guid: conversation.taskGuid,
            backend: conversation.backend,
            updated_at: conversation.updatedAt,
          })
        ),
      })
    ),
    im_chats: config.imChats.map((chat) =>
      compactRecord({
        chat_id: chat.chatId,
        profile_name: chat.profileName,
        display_name: chat.displayName,
        visible: chat.visible,
        conversation_id: chat.conversationId,
        workspace: chat.workspace,
        last_synced_at: chat.lastSyncedAt,
      })
    ),
  });
}

async function readState(): Promise<PersistedState> {
  try {
    const raw = await fs.readFile(getStatePath(), 'utf8');
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
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyState();
    }
    throw error;
  }
}

async function writeState(state: PersistedState): Promise<void> {
  await ensureDir(getProjectAgentDataDir());
  await fs.writeFile(getStatePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function writeLocalConfig(config: LarkProjectLocalConfig): Promise<void> {
  const updated: LarkProjectLocalConfig = {
    ...config,
    updatedAt: now(),
    tasklists: dedupeTasklists(config.tasklists),
    imChats: dedupeImChats(config.imChats),
  };
  await ensureDir(getProjectAgentDataDir());
  await fs.writeFile(getLocalConfigPath(), `${stringifyToml(localConfigToToml(updated))}\n`, 'utf8');
}

async function readLocalConfig(): Promise<LarkProjectLocalConfig> {
  try {
    const raw = await fs.readFile(getLocalConfigPath(), 'utf8');
    return normalizeLocalConfig(parseToml(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const config = emptyLocalConfig();
      await writeLocalConfig(config);
      return config;
    }
    throw error;
  }
}

function mergeBindingIntoConfig(
  config: LarkProjectLocalConfig,
  binding: LarkProjectBinding,
  options: { visible?: boolean } = {}
): LarkProjectLocalConfig {
  const previous = config.tasklists.find((tasklist) => tasklist.guid === binding.tasklistGuid);
  const conversationLinks: LarkProjectLocalConversationLink[] = [];
  if (binding.leaderAgentConversationId) {
    conversationLinks.push({
      id: binding.leaderAgentConversationId,
      role: 'leader',
      label: binding.leaderAgentLabel,
      slotId: binding.leaderSlotId,
      teamId: binding.teamId,
      backend: 'codex',
      updatedAt: now(),
    });
  }
  const nextTasklist: LarkProjectLocalTasklistConfig = {
    guid: binding.tasklistGuid,
    name: binding.tasklistName || previous?.name || binding.tasklistGuid,
    source: 'lark',
    visible: options.visible ?? previous?.visible ?? true,
    order: previous?.order ?? config.tasklists.length,
    pinned: previous?.pinned,
    pinnedAt: previous?.pinnedAt,
    url: previous?.url,
    ownerName: previous?.ownerName,
    teamId: binding.teamId ?? previous?.teamId,
    leaderSlotId: binding.leaderSlotId ?? previous?.leaderSlotId,
    leaderConversationId: binding.leaderAgentConversationId ?? previous?.leaderConversationId,
    leaderAgentLabel: binding.leaderAgentLabel ?? previous?.leaderAgentLabel,
    workspace: previous?.workspace ?? getProjectTeamWorkspace(binding.tasklistGuid),
    lastSyncedAt: previous?.lastSyncedAt,
    conversations: mergeConversationLinks(previous?.conversations ?? [], conversationLinks),
  };
  return {
    ...config,
    tasklists: [nextTasklist, ...config.tasklists.filter((tasklist) => tasklist.guid !== binding.tasklistGuid)],
  };
}

function mergeTaskRecordIntoConfig(
  config: LarkProjectLocalConfig,
  record: LarkProjectTaskRecord
): LarkProjectLocalConfig {
  if (!record.tasklistGuid) return config;
  const previous = config.tasklists.find((tasklist) => tasklist.guid === record.tasklistGuid);
  const conversationLinks: LarkProjectLocalConversationLink[] = [];
  if (record.agentConversationId) {
    conversationLinks.push({
      id: record.agentConversationId,
      role: record.kind === 'agent' ? 'agent' : 'task',
      label: record.metadata?.targetAgent || record.title,
      taskGuid: record.taskGuid,
      backend: 'codex',
      updatedAt: now(),
    });
  }
  const nextTasklist: LarkProjectLocalTasklistConfig = {
    guid: record.tasklistGuid,
    name: previous?.name || record.metadata?.taskTitle || record.tasklistGuid,
    source: 'lark',
    visible: previous?.visible ?? true,
    order: previous?.order ?? config.tasklists.length,
    pinned: previous?.pinned,
    pinnedAt: previous?.pinnedAt,
    url: previous?.url,
    ownerName: previous?.ownerName,
    teamId: previous?.teamId,
    leaderSlotId: previous?.leaderSlotId,
    leaderConversationId: previous?.leaderConversationId,
    leaderAgentLabel: previous?.leaderAgentLabel,
    workspace: previous?.workspace ?? getProjectTeamWorkspace(record.tasklistGuid),
    lastSyncedAt: previous?.lastSyncedAt,
    conversations: mergeConversationLinks(previous?.conversations ?? [], conversationLinks),
  };
  return {
    ...config,
    tasklists: [nextTasklist, ...config.tasklists.filter((tasklist) => tasklist.guid !== record.tasklistGuid)],
  };
}

function mergeDelegationIntoConfig(
  config: LarkProjectLocalConfig,
  delegation: LarkProjectDelegation
): LarkProjectLocalConfig {
  const previous = config.tasklists.find((tasklist) => tasklist.guid === delegation.tasklistGuid);
  const conversationLinks: LarkProjectLocalConversationLink[] = [];
  if (delegation.target.kind === 'team_agent') {
    conversationLinks.push({
      id: delegation.teamMessageId || delegation.teamRunId || delegation.id,
      role: 'agent',
      label: delegation.target.name || delegation.title,
      slotId: delegation.target.slotId,
      teamId: delegation.teamId,
      taskGuid: delegation.larkTaskGuid,
      backend: 'codex',
      updatedAt: now(),
    });
  }
  const nextTasklist: LarkProjectLocalTasklistConfig = {
    guid: delegation.tasklistGuid,
    name: delegation.tasklistName || previous?.name || delegation.tasklistGuid,
    source: 'lark',
    visible: previous?.visible ?? true,
    order: previous?.order ?? config.tasklists.length,
    pinned: previous?.pinned,
    pinnedAt: previous?.pinnedAt,
    url: previous?.url ?? delegation.larkTaskUrl,
    ownerName: previous?.ownerName,
    teamId: delegation.teamId ?? previous?.teamId,
    leaderSlotId: delegation.leaderSlotId ?? previous?.leaderSlotId,
    leaderConversationId: previous?.leaderConversationId,
    leaderAgentLabel: previous?.leaderAgentLabel,
    workspace: previous?.workspace ?? getProjectTeamWorkspace(delegation.tasklistGuid),
    lastSyncedAt: previous?.lastSyncedAt,
    conversations: mergeConversationLinks(previous?.conversations ?? [], conversationLinks),
  };
  return {
    ...config,
    tasklists: [nextTasklist, ...config.tasklists.filter((tasklist) => tasklist.guid !== delegation.tasklistGuid)],
  };
}

async function ensureConfigFromState(state: PersistedState): Promise<LarkProjectLocalConfig> {
  let config = await readLocalConfig();
  let changed = false;
  const stateHiddenSet = new Set(state.hiddenTasklistGuids);
  for (const binding of state.bindings) {
    const before = JSON.stringify(config.tasklists.find((tasklist) => tasklist.guid === binding.tasklistGuid));
    config = mergeBindingIntoConfig(config, binding, { visible: stateHiddenSet.has(binding.tasklistGuid) ? false : undefined });
    const after = JSON.stringify(config.tasklists.find((tasklist) => tasklist.guid === binding.tasklistGuid));
    changed ||= before !== after;
  }
  for (const record of state.taskRecords) {
    const before = record.tasklistGuid
      ? JSON.stringify(config.tasklists.find((tasklist) => tasklist.guid === record.tasklistGuid))
      : undefined;
    config = mergeTaskRecordIntoConfig(config, record);
    const after = record.tasklistGuid
      ? JSON.stringify(config.tasklists.find((tasklist) => tasklist.guid === record.tasklistGuid))
      : undefined;
    changed ||= before !== after;
  }
  for (const delegation of state.delegations) {
    const before = JSON.stringify(config.tasklists.find((tasklist) => tasklist.guid === delegation.tasklistGuid));
    config = mergeDelegationIntoConfig(config, delegation);
    const after = JSON.stringify(config.tasklists.find((tasklist) => tasklist.guid === delegation.tasklistGuid));
    changed ||= before !== after;
  }
  config = {
    ...config,
    tasklists: config.tasklists.map((tasklist) => {
      if (!stateHiddenSet.has(tasklist.guid) || tasklist.visible === false) return tasklist;
      changed = true;
      return { ...tasklist, visible: false };
    }),
  };
  if (changed) {
    await writeLocalConfig(config);
    config = await readLocalConfig();
  }
  return config;
}

function promptFileName(role: LarkProjectPromptRole): string {
  if (role === 'leader') return 'leader.md';
  if (role === 'collaboration') return 'collaboration.md';
  if (role === 'agent-task') return 'agent-task.md';
  return 'default.md';
}

function defaultPromptForRole(role: LarkProjectPromptRole): string {
  if (role === 'leader') return DEFAULT_LEADER_AGENT_SYSTEM_PROMPT;
  if (role === 'collaboration') return DEFAULT_COLLABORATION_AGENT_SYSTEM_PROMPT;
  if (role === 'agent-task') return DEFAULT_AGENT_TASK_SYSTEM_PROMPT;
  return EMPTY_DEFAULT_AGENT_SYSTEM_PROMPT;
}

export async function getPromptFile(role: LarkProjectPromptRole): Promise<LarkProjectPromptFile> {
  const dir = getPromptDir();
  const filePath = path.join(dir, promptFileName(role));
  const defaultContent = defaultPromptForRole(role);
  await ensureDir(dir);
  try {
    let [content, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
    if (role === 'collaboration' && content.trim() === LEGACY_COLLABORATION_AGENT_SYSTEM_PROMPT.trim()) {
      await fs.writeFile(filePath, defaultContent, 'utf8');
      content = defaultContent;
      stat = await fs.stat(filePath);
    }
    return { role, path: filePath, content, defaultContent, updatedAt: stat.mtimeMs };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    await fs.writeFile(filePath, defaultContent, 'utf8');
    const stat = await fs.stat(filePath);
    return { role, path: filePath, content: defaultContent, defaultContent, updatedAt: stat.mtimeMs };
  }
}

export async function listPromptFiles(): Promise<LarkProjectPromptFile[]> {
  return Promise.all([
    getPromptFile('default'),
    getPromptFile('leader'),
    getPromptFile('collaboration'),
    getPromptFile('agent-task'),
  ]);
}

export async function updatePromptFile(role: LarkProjectPromptRole, content: string): Promise<LarkProjectPromptFile> {
  const dir = getPromptDir();
  const filePath = path.join(dir, promptFileName(role));
  await ensureDir(dir);
  await fs.writeFile(filePath, content, 'utf8');
  return getPromptFile(role);
}

export async function resetPromptFile(role: LarkProjectPromptRole): Promise<LarkProjectPromptFile> {
  return updatePromptFile(role, defaultPromptForRole(role));
}

export async function listSnapshot(): Promise<LarkProjectSnapshot> {
  const state = await readState();
  const localConfig = await ensureConfigFromState(state);
  const hiddenTasklistGuids = Array.from(
    new Set([
      ...state.hiddenTasklistGuids,
      ...localConfig.tasklists.filter((tasklist) => tasklist.visible === false).map((tasklist) => tasklist.guid),
    ])
  );
  return {
    plans: state.plans,
    bindings: state.bindings,
    taskRecords: state.taskRecords,
    delegations: state.delegations,
    hiddenTasklistGuids,
    localConfig,
  };
}

export async function hideTasklist(tasklistGuid: string): Promise<LarkProjectSnapshot> {
  const trimmed = tasklistGuid.trim();
  if (!trimmed) {
    throw new Error('LARK_TASKLIST_GUID_REQUIRED');
  }
  const state = await readState();
  if (!state.hiddenTasklistGuids.includes(trimmed)) {
    state.hiddenTasklistGuids = [trimmed, ...state.hiddenTasklistGuids];
    await writeState(state);
  }
  const config = await ensureConfigFromState(state);
  const existing = config.tasklists.find((tasklist) => tasklist.guid === trimmed);
  const nextTasklist: LarkProjectLocalTasklistConfig = {
    guid: trimmed,
    name: existing?.name ?? trimmed,
    source: 'lark',
    visible: false,
    order: existing?.order ?? config.tasklists.length,
    pinned: existing?.pinned,
    pinnedAt: existing?.pinnedAt,
    url: existing?.url,
    ownerName: existing?.ownerName,
    teamId: existing?.teamId,
    leaderSlotId: existing?.leaderSlotId,
    leaderConversationId: existing?.leaderConversationId,
    leaderAgentLabel: existing?.leaderAgentLabel,
    workspace: existing?.workspace ?? getProjectTeamWorkspace(trimmed),
    lastSyncedAt: existing?.lastSyncedAt,
    conversations: existing?.conversations ?? [],
  };
  await writeLocalConfig({
    ...config,
    tasklists: [nextTasklist, ...config.tasklists.filter((tasklist) => tasklist.guid !== trimmed)],
  });
  return listSnapshot();
}

export async function updateTasklistLocalState(input: {
  tasklistGuid: string;
  visible?: boolean;
  pinned?: boolean;
  pinnedAt?: number;
}): Promise<LarkProjectSnapshot> {
  const guid = input.tasklistGuid.trim();
  if (!guid) {
    throw new Error('LARK_TASKLIST_GUID_REQUIRED');
  }
  const state = await readState();
  if (input.visible === true) {
    state.hiddenTasklistGuids = state.hiddenTasklistGuids.filter((item) => item !== guid);
    await writeState(state);
  } else if (input.visible === false && !state.hiddenTasklistGuids.includes(guid)) {
    state.hiddenTasklistGuids = [guid, ...state.hiddenTasklistGuids];
    await writeState(state);
  }
  const config = await ensureConfigFromState(state);
  const existing = config.tasklists.find((tasklist) => tasklist.guid === guid);
  const nextTasklist: LarkProjectLocalTasklistConfig = {
    guid,
    name: existing?.name ?? guid,
    source: 'lark',
    visible: input.visible ?? existing?.visible ?? !state.hiddenTasklistGuids.includes(guid),
    order: existing?.order ?? config.tasklists.length,
    pinned: input.pinned ?? existing?.pinned,
    pinnedAt: input.pinned === false ? undefined : (input.pinnedAt ?? existing?.pinnedAt),
    url: existing?.url,
    ownerName: existing?.ownerName,
    teamId: existing?.teamId,
    leaderSlotId: existing?.leaderSlotId,
    leaderConversationId: existing?.leaderConversationId,
    leaderAgentLabel: existing?.leaderAgentLabel,
    workspace: existing?.workspace ?? getProjectTeamWorkspace(guid),
    lastSyncedAt: existing?.lastSyncedAt,
    conversations: existing?.conversations ?? [],
  };
  await writeLocalConfig({
    ...config,
    tasklists: [nextTasklist, ...config.tasklists.filter((tasklist) => tasklist.guid !== guid)],
  });
  return listSnapshot();
}

export async function removeLocalConversationLink(input: {
  conversationId: string;
  tasklistGuid?: string;
}): Promise<LarkProjectSnapshot> {
  const conversationId = input.conversationId.trim();
  if (!conversationId) {
    throw new Error('LARK_CONVERSATION_ID_REQUIRED');
  }
  const timestamp = now();
  const state = await readState();
  state.bindings = state.bindings.map((binding) => {
    if (input.tasklistGuid && binding.tasklistGuid !== input.tasklistGuid) return binding;
    if (binding.leaderAgentConversationId !== conversationId) return binding;
    return {
      ...binding,
      leaderAgentConversationId: undefined,
      leaderAgentPendingPrompt: undefined,
      teamId: undefined,
      leaderSlotId: undefined,
      updatedAt: timestamp,
    };
  });
  state.taskRecords = state.taskRecords.filter((record) => record.agentConversationId !== conversationId);
  state.delegations = state.delegations.filter(
    (delegation) => delegation.teamMessageId !== conversationId && delegation.teamRunId !== conversationId
  );
  await writeState(state);

  const config = await ensureConfigFromState(state);
  await writeLocalConfig({
    ...config,
    tasklists: config.tasklists.map((tasklist) => {
      if (input.tasklistGuid && tasklist.guid !== input.tasklistGuid) return tasklist;
      const isLeaderConversation = tasklist.leaderConversationId === conversationId;
      return {
        ...tasklist,
        teamId: isLeaderConversation ? undefined : tasklist.teamId,
        leaderSlotId: isLeaderConversation ? undefined : tasklist.leaderSlotId,
        leaderConversationId: isLeaderConversation ? undefined : tasklist.leaderConversationId,
        conversations: tasklist.conversations.filter((conversation) => conversation.id !== conversationId),
      };
    }),
    imChats: config.imChats.map((chat) =>
      chat.conversationId === conversationId ? { ...chat, conversationId: undefined, visible: false } : chat
    ),
  });
  return listSnapshot();
}

export async function removeLocalTaskRecord(recordId: string): Promise<LarkProjectSnapshot> {
  const trimmed = recordId.trim();
  if (!trimmed) {
    throw new Error('LARK_TASK_RECORD_ID_REQUIRED');
  }
  const state = await readState();
  const record = state.taskRecords.find((item) => item.id === trimmed || item.taskGuid === trimmed);
  state.taskRecords = state.taskRecords.filter((item) => item.id !== trimmed && item.taskGuid !== trimmed);
  if (record) {
    state.delegations = state.delegations.filter((delegation) => delegation.larkTaskGuid !== record.taskGuid);
  }
  await writeState(state);

  const config = await ensureConfigFromState(state);
  await writeLocalConfig({
    ...config,
    tasklists: config.tasklists.map((tasklist) => ({
      ...tasklist,
      conversations: tasklist.conversations.filter((conversation) => {
        if (!record) return conversation.taskGuid !== trimmed;
        return conversation.taskGuid !== record.taskGuid && conversation.id !== record.agentConversationId;
      }),
    })),
  });
  return listSnapshot();
}

export async function updateLocalTaskRecordState(input: {
  recordId: string;
  localTitle?: string;
  pinned?: boolean;
  pinnedAt?: number;
}): Promise<LarkProjectSnapshot> {
  const recordId = input.recordId.trim();
  if (!recordId) {
    throw new Error('LARK_TASK_RECORD_ID_REQUIRED');
  }
  const state = await readState();
  const existing = state.taskRecords.find((record) => record.id === recordId || record.taskGuid === recordId);
  if (!existing) {
    throw new Error('LARK_TASK_RECORD_NOT_FOUND');
  }
  const updated: LarkProjectTaskRecord = {
    ...existing,
    ...(input.localTitle !== undefined ? { localTitle: input.localTitle.trim() || undefined } : {}),
    ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
    ...(input.pinnedAt !== undefined ? { pinnedAt: input.pinnedAt } : {}),
    updatedAt: now(),
  };
  state.taskRecords = [updated, ...state.taskRecords.filter((record) => record.id !== existing.id)];
  await writeState(state);
  const config = await ensureConfigFromState(state);
  await writeLocalConfig(config);
  return listSnapshot();
}

export async function renameLocalTasklist(input: {
  tasklistGuid: string;
  name: string;
  url?: string;
  updatedAt?: number;
}): Promise<LarkProjectSnapshot> {
  const guid = input.tasklistGuid.trim();
  const name = input.name.trim();
  if (!guid) {
    throw new Error('LARK_TASKLIST_GUID_REQUIRED');
  }
  if (!name) {
    throw new Error('LARK_TASKLIST_NAME_REQUIRED');
  }
  const timestamp = input.updatedAt ?? now();
  const state = await readState();
  state.bindings = state.bindings.map((binding) =>
    binding.tasklistGuid === guid ? { ...binding, tasklistName: name, updatedAt: timestamp } : binding
  );
  state.plans = state.plans.map((plan) =>
    plan.tasklistGuid === guid ? { ...plan, tasklistName: name, title: plan.title || name, updatedAt: timestamp } : plan
  );
  state.delegations = state.delegations.map((delegation) =>
    delegation.tasklistGuid === guid ? { ...delegation, tasklistName: name, updatedAt: timestamp } : delegation
  );
  await writeState(state);

  const config = await ensureConfigFromState(state);
  const existing = config.tasklists.find((tasklist) => tasklist.guid === guid);
  const nextTasklist: LarkProjectLocalTasklistConfig = {
    guid,
    name,
    source: 'lark',
    visible: existing?.visible ?? !state.hiddenTasklistGuids.includes(guid),
    order: existing?.order ?? config.tasklists.length,
    pinned: existing?.pinned,
    pinnedAt: existing?.pinnedAt,
    url: input.url ?? existing?.url,
    ownerName: existing?.ownerName,
    teamId: existing?.teamId,
    leaderSlotId: existing?.leaderSlotId,
    leaderConversationId: existing?.leaderConversationId,
    leaderAgentLabel: existing?.leaderAgentLabel,
    workspace: existing?.workspace ?? getProjectTeamWorkspace(guid),
    lastSyncedAt: timestamp,
    conversations: existing?.conversations ?? [],
  };
  await writeLocalConfig({
    ...config,
    tasklists: [nextTasklist, ...config.tasklists.filter((tasklist) => tasklist.guid !== guid)],
  });
  return listSnapshot();
}

export async function upsertLocalTasklistConfig(input: {
  guid: string;
  name?: string;
  url?: string;
  ownerName?: string;
  visible?: boolean;
  lastSyncedAt?: number;
}): Promise<LarkProjectLocalConfig> {
  const guid = input.guid.trim();
  if (!guid) {
    throw new Error('LARK_TASKLIST_GUID_REQUIRED');
  }
  const config = await readLocalConfig();
  const existing = config.tasklists.find((tasklist) => tasklist.guid === guid);
  const nextTasklist: LarkProjectLocalTasklistConfig = {
    guid,
    name: input.name?.trim() || existing?.name || guid,
    source: 'lark',
    visible: input.visible ?? existing?.visible ?? true,
    order: existing?.order ?? config.tasklists.length,
    pinned: existing?.pinned,
    pinnedAt: existing?.pinnedAt,
    url: input.url ?? existing?.url,
    ownerName: input.ownerName ?? existing?.ownerName,
    teamId: existing?.teamId,
    leaderSlotId: existing?.leaderSlotId,
    leaderConversationId: existing?.leaderConversationId,
    leaderAgentLabel: existing?.leaderAgentLabel,
    workspace: existing?.workspace ?? getProjectTeamWorkspace(guid),
    lastSyncedAt: input.lastSyncedAt ?? existing?.lastSyncedAt,
    conversations: existing?.conversations ?? [],
  };
  const nextConfig = {
    ...config,
    tasklists: [nextTasklist, ...config.tasklists.filter((tasklist) => tasklist.guid !== guid)],
  };
  await writeLocalConfig(nextConfig);
  return readLocalConfig();
}

export async function upsertLocalTasklistsFromSync(
  tasklists: Array<{ guid?: string; name?: string; url?: string; ownerName?: string }>,
  syncedAt = now()
): Promise<LarkProjectLocalConfig> {
  let config = await readLocalConfig();
  for (const tasklist of tasklists) {
    const guid = tasklist.guid?.trim();
    if (!guid) continue;
    const existing = config.tasklists.find((item) => item.guid === guid);
    const nextTasklist: LarkProjectLocalTasklistConfig = {
      guid,
      name: tasklist.name?.trim() || existing?.name || guid,
      source: 'lark',
      visible: existing?.visible ?? true,
      order: existing?.order ?? config.tasklists.length,
      pinned: existing?.pinned,
      pinnedAt: existing?.pinnedAt,
      url: tasklist.url ?? existing?.url,
      ownerName: tasklist.ownerName ?? existing?.ownerName,
      teamId: existing?.teamId,
      leaderSlotId: existing?.leaderSlotId,
      leaderConversationId: existing?.leaderConversationId,
      leaderAgentLabel: existing?.leaderAgentLabel,
      workspace: existing?.workspace ?? getProjectTeamWorkspace(guid),
      lastSyncedAt: syncedAt,
      conversations: existing?.conversations ?? [],
    };
    config = {
      ...config,
      tasklists: [nextTasklist, ...config.tasklists.filter((item) => item.guid !== guid)],
    };
  }
  await writeLocalConfig(config);
  return readLocalConfig();
}

export async function upsertLocalImChatConfig(input: {
  chatId: string;
  profileName?: string;
  displayName?: string;
  conversationId?: string;
  workspace?: string;
  visible?: boolean;
  lastSyncedAt?: number;
}): Promise<LarkProjectLocalConfig> {
  const chatId = input.chatId.trim();
  if (!chatId) {
    throw new Error('LARK_IM_CHAT_ID_REQUIRED');
  }
  const config = await readLocalConfig();
  const existing = config.imChats.find((chat) => chat.chatId === chatId);
  const nextChat: LarkProjectLocalConfig['imChats'][number] = {
    chatId,
    profileName: input.profileName ?? existing?.profileName,
    displayName: input.displayName?.trim() || existing?.displayName || chatId,
    visible: input.visible ?? existing?.visible ?? true,
    conversationId: input.conversationId ?? existing?.conversationId,
    workspace: input.workspace ?? existing?.workspace,
    lastSyncedAt: input.lastSyncedAt ?? existing?.lastSyncedAt ?? now(),
  };
  const nextConfig = {
    ...config,
    imChats: [nextChat, ...config.imChats.filter((chat) => chat.chatId !== chatId)],
  };
  await writeLocalConfig(nextConfig);
  return readLocalConfig();
}

export async function savePlan(plan: LarkProjectPlan): Promise<LarkProjectPlan> {
  const state = await readState();
  const updated = { ...plan, updatedAt: now() };
  state.plans = [updated, ...state.plans.filter((item) => item.id !== plan.id)];
  await writeState(state);
  return updated;
}

export async function getPlan(planId: string): Promise<LarkProjectPlan | undefined> {
  const state = await readState();
  return state.plans.find((plan) => plan.id === planId);
}

export async function createPlan(
  input: Omit<LarkProjectPlan, 'id' | 'state' | 'createdAt' | 'updatedAt' | 'requiresApprovalBeforeWrite'>
): Promise<LarkProjectPlan> {
  const timestamp = now();
  return savePlan({
    ...input,
    id: `lark-plan-${randomUUID()}`,
    state: 'draft',
    requiresApprovalBeforeWrite: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function saveBinding(binding: LarkProjectBinding): Promise<LarkProjectBinding> {
  const state = await readState();
  const updated = { ...binding, updatedAt: now() };
  state.bindings = [updated, ...state.bindings.filter((item) => item.id !== binding.id)];
  await writeState(state);
  const config = await ensureConfigFromState(state);
  await writeLocalConfig(mergeBindingIntoConfig(config, updated));
  return updated;
}

export async function getBindingByTasklistGuid(tasklistGuid: string): Promise<LarkProjectBinding | undefined> {
  const state = await readState();
  return state.bindings.find((binding) => binding.tasklistGuid === tasklistGuid);
}

export async function saveTaskRecord(record: LarkProjectTaskRecord): Promise<LarkProjectTaskRecord> {
  const state = await readState();
  const updated = { ...record, updatedAt: now() };
  state.taskRecords = [
    updated,
    ...state.taskRecords.filter((item) => item.id !== record.id && item.taskGuid !== record.taskGuid),
  ];
  await writeState(state);
  const config = await ensureConfigFromState(state);
  await writeLocalConfig(mergeTaskRecordIntoConfig(config, updated));
  return updated;
}

export async function getTaskRecord(taskGuid: string): Promise<LarkProjectTaskRecord | undefined> {
  const state = await readState();
  return state.taskRecords.find((record) => record.taskGuid === taskGuid);
}

export async function updateTaskRecord(
  taskGuid: string,
  patch: Partial<Omit<LarkProjectTaskRecord, 'id' | 'taskGuid' | 'createdAt'>>
): Promise<LarkProjectTaskRecord | undefined> {
  const state = await readState();
  const existing = state.taskRecords.find((record) => record.taskGuid === taskGuid);
  if (!existing) return undefined;
  const updated: LarkProjectTaskRecord = {
    ...existing,
    ...patch,
    taskGuid: existing.taskGuid,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };
  state.taskRecords = [updated, ...state.taskRecords.filter((record) => record.id !== existing.id)];
  await writeState(state);
  const config = await ensureConfigFromState(state);
  await writeLocalConfig(mergeTaskRecordIntoConfig(config, updated));
  return updated;
}

export async function saveDelegation(delegation: LarkProjectDelegation): Promise<LarkProjectDelegation> {
  const state = await readState();
  const updated = { ...delegation, updatedAt: now() };
  state.delegations = [
    updated,
    ...state.delegations.filter((item) => item.id !== delegation.id && item.larkTaskGuid !== delegation.larkTaskGuid),
  ];
  await writeState(state);
  const config = await ensureConfigFromState(state);
  await writeLocalConfig(mergeDelegationIntoConfig(config, updated));
  return updated;
}

export async function getDelegationByTaskGuid(taskGuid: string): Promise<LarkProjectDelegation | undefined> {
  const state = await readState();
  return state.delegations.find((delegation) => delegation.larkTaskGuid === taskGuid);
}

export async function listDelegations(): Promise<LarkProjectDelegation[]> {
  const state = await readState();
  return state.delegations;
}

export async function getDelegationByTeamRunId(teamRunId: string): Promise<LarkProjectDelegation | undefined> {
  const state = await readState();
  return state.delegations.find((delegation) => delegation.teamRunId === teamRunId);
}

export async function updateDelegation(
  delegationId: string,
  patch: Partial<Omit<LarkProjectDelegation, 'id' | 'createdAt'>>
): Promise<LarkProjectDelegation | undefined> {
  const state = await readState();
  const existing = state.delegations.find((delegation) => delegation.id === delegationId);
  if (!existing) return undefined;
  const updated: LarkProjectDelegation = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };
  state.delegations = [updated, ...state.delegations.filter((delegation) => delegation.id !== existing.id)];
  await writeState(state);
  const config = await ensureConfigFromState(state);
  await writeLocalConfig(mergeDelegationIntoConfig(config, updated));
  return updated;
}

export async function listCompletedTaskRecords(
  query: { projectId?: string; tasklistGuid?: string } = {}
): Promise<LarkProjectTaskRecord[]> {
  const state = await readState();
  return state.taskRecords.filter((record) => {
    if (record.state !== 'completed' && record.state !== 'returned') return false;
    if (query.projectId && record.projectId !== query.projectId) return false;
    if (query.tasklistGuid && record.tasklistGuid !== query.tasklistGuid) return false;
    return true;
  });
}
