/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile, spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { app, shell } from 'electron';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import { LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { httpRequest } from '@/common/adapter/httpBridge';
import { normalizeCodexMode } from '@/common/types/codex/codexModes';
import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import {
  configureProjectAgent,
  intakeAgentTask,
  startEventListener as startProjectAgentEventListener,
} from '@/deepscientist_lark/project_agent/service';
import {
  getProjectAgentDataDir,
  getPromptFile,
  upsertLocalImChatConfig,
  upsertLocalTasklistConfig,
  upsertLocalTasklistsFromSync,
} from '@/deepscientist_lark/project_agent/store';
import type {
  ILarkAutomationChannelSyncRequest,
  ILarkAutomationChannelSyncResult,
  ILarkAutomationBindingRecord,
  ILarkAutomationContact,
  ILarkAutomationContactsResult,
  ILarkAutomationCreateTasklistRequest,
  ILarkAutomationCreateTasklistResult,
  ILarkAutomationCompleteAuthResult,
  ILarkAutomationIdentityStatus,
  ILarkAutomationProjectBucket,
  ILarkAutomationProjectTask,
  ILarkAutomationProjectsResult,
  ILarkAutomationProfile,
  ILarkAutomationProfilesResult,
  ILarkAutomationStartAuthRequest,
  ILarkAutomationStartAuthResult,
  ILarkAutomationStatus,
} from '@/common/adapter/ipcBridge';

const execFileAsync = promisify(execFile);
const LARK_CLI = 'lark-cli';
const EXEC_TIMEOUT_MS = 25_000;
const DEFAULT_PROFILE = 'deepscientist-pro';
const PROFILE_STATE_FILE = 'lark-automation-profile.json';
const BINDING_STATE_FILE = 'lark-automation-binding.json';
const EVENT_STATE_FILE = 'lark-automation-events.json';
const IM_SESSION_STATE_FILE = 'lark-automation-im-sessions.json';
const PROJECT_STATE_FILE = 'lark-automation-projects.json';
const CONTACT_STATE_FILE = 'lark-automation-contacts.json';
const RAW_DATA_DIR = 'lark-automation-raw';
const EVENT_KEY_MESSAGE_RECEIVE = 'im.message.receive_v1';
const EVENT_RESTART_DELAY_MS = 5_000;
const EVENT_MAX_RESTART_DELAY_MS = 60_000;
const EVENT_BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000;
const IM_AGENT_REPLY_TIMEOUT_MS = 90_000;
const IM_AGENT_REPLY_POLL_INTERVAL_MS = 2_500;
const AUTOMATION_DIR = 'automation';
const RAW_DATA_DIR_NAME = 'raw';
const IM_WORKSPACES_DIR = 'lark-im-workspaces';

interface ExecResult {
  stdout: string;
  stderr: string;
}

interface ExecError extends Error {
  code?: string | number;
  stdout?: string;
  stderr?: string;
}

interface SafeExecResult extends ExecResult {
  code: number;
}

interface AuthStatusJson {
  appId?: string;
  brand?: string;
  identity?: string;
  note?: string;
  identities?: {
    user?: ILarkAutomationIdentityStatus;
    bot?: ILarkAutomationIdentityStatus;
  };
}

interface ConfigShowJson {
  appId?: string;
  brand?: string;
  workspace?: string;
  profile?: string;
}

interface NoWaitAuthJson {
  verification_url?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  device_code?: string;
  user_code?: string;
  message?: string;
}

interface ProfileState {
  selectedProfile?: string;
}

interface LarkApiErrorJson {
  error?: {
    message?: string;
    subtype?: string;
    type?: string;
  };
  msg?: string;
  message?: string;
}

interface ApplicationDetailJson extends LarkApiErrorJson {
  data?: {
    app?: {
      app_id?: string;
      app_name?: string;
      avatar_url?: string;
      description?: string;
      primary_language?: string;
      owner?: {
        name?: string;
        owner_id?: string;
      };
    };
  };
}

interface CurrentUserJson extends LarkApiErrorJson {
  data?: {
    avatar_url?: string;
    name?: string;
    open_id?: string;
    tenant_key?: string;
    union_id?: string;
    user?: {
      avatar_url?: string;
      name?: string;
      open_id?: string;
      tenant_key?: string;
      union_id?: string;
    };
  };
}

interface LarkDepartmentRecord {
  department_id?: string;
  open_department_id?: string;
  name?: string;
}

interface LarkDepartmentChildrenResponse extends LarkApiErrorJson {
  data?: {
    items?: LarkDepartmentRecord[];
    has_more?: boolean;
    page_token?: string;
  };
  items?: LarkDepartmentRecord[];
}

interface LarkContactUserRecord {
  open_id?: string;
  user_id?: string;
  union_id?: string;
  name?: string;
  en_name?: string;
  localized_name?: string;
  email?: string;
  enterprise_email?: string;
  department?: string;
  department_ids?: string[];
  avatar?: {
    avatar_72?: string;
    avatar_origin?: string;
    avatar_middle?: string;
    avatar_big?: string;
  };
  avatar_url?: string;
  p2p_chat_id?: string;
  has_chatted?: boolean;
}

interface LarkContactUsersResponse extends LarkApiErrorJson {
  data?: {
    items?: LarkContactUserRecord[];
    users?: LarkContactUserRecord[];
    has_more?: boolean;
    page_token?: string;
  };
  items?: LarkContactUserRecord[];
  users?: LarkContactUserRecord[];
}

interface LarkContactState {
  profileName?: string;
  syncedAt?: number;
  source?: ILarkAutomationContactsResult['source'];
  limited?: boolean;
  contacts?: ILarkAutomationContact[];
  error?: string;
}

interface LarkEventState {
  seenEventIds?: string[];
  seenMessageIds?: string[];
  knownChats?: Record<string, LarkKnownChatState>;
  lastEventAt?: number;
  lastBackfillAt?: number;
  receivedCount?: number;
  taskCreatedCount?: number;
}

interface LarkImSessionState {
  profileName?: string;
  updatedAt?: number;
  processedMessageIds?: string[];
  sentMessageIds?: string[];
  sessions?: Record<string, LarkImSessionRecord>;
}

interface LarkImSessionRecord {
  chatId: string;
  chatType?: string;
  senderId?: string;
  senderName?: string;
  conversationId?: string;
  conversationName?: string;
  createdAt: number;
  updatedAt: number;
  lastInboundMessageId?: string;
  lastInboundAt?: number;
  lastInboundContent?: string;
  lastOutboundMessageId?: string;
  lastOutboundAt?: number;
  lastOutboundContent?: string;
  pendingOutboundAt?: number;
  pendingOutboundContent?: string;
  lastError?: string;
  replyCount: number;
  messages: LarkImSessionMessage[];
}

interface LarkImSessionMessage {
  messageId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  at: number;
  larkMessageId?: string;
  conversationId?: string;
  error?: string;
}

interface LarkKnownChatState {
  chatId: string;
  chatType?: string;
  lastMessageId?: string;
  lastMessageAt?: number;
  lastSenderId?: string;
  lastContent?: string;
}

interface LarkTaskCreateRecord {
  taskGuid: string;
  taskUrl?: string;
  messageId?: string;
  chatId?: string;
  createdAt: number;
  summary?: string;
}

interface LarkReceiveEvent {
  event_id?: string;
  message_id?: string;
  id?: string;
  chat_id?: string;
  chat_type?: string;
  sender_id?: string;
  message_type?: string;
  content?: string;
  create_time?: string;
  timestamp?: string;
  type?: string;
  [key: string]: unknown;
}

interface LarkMessageHistoryResponse {
  messages?: Array<{
    message_id?: string;
    msg_type?: string;
    create_time?: string | number;
    sender?: {
      id?: string;
      open_id?: string;
      name?: string;
    };
    content?: string;
    deleted?: boolean;
    [key: string]: unknown;
  }>;
}

interface LarkChatListResponse {
  data?: {
    chats?: Array<{
      chat_id?: string;
      chat_mode?: string;
      name?: string;
      p2p_target_type?: string;
      p2p_target_id?: string;
      [key: string]: unknown;
    }> | null;
  };
}

interface LarkCreateTaskResponse extends LarkApiErrorJson {
  data?: {
    guid?: string;
    url?: string;
  };
}

interface LarkImReplyResponse extends LarkApiErrorJson {
  data?: {
    message_id?: string;
    chat_id?: string;
    create_time?: string;
  };
  message_id?: string;
  chat_id?: string;
}

interface BackendClientSettings {
  'acp.config'?: Record<
    string,
    {
      preferredMode?: string;
      preferredModelId?: string;
      preferredThoughtLevel?: string;
    }
  >;
  'assistant.lark.defaultModel'?: {
    id?: string;
    use_model?: string;
  };
  'assistant.lark.agent'?: {
    agent_type?: string;
    backend?: string;
    id?: string;
    custom_agent_id?: string;
    name?: string;
  };
}

interface BackendPaginatedMessages {
  items?: TMessage[];
  total?: number;
  has_more?: boolean;
}

interface LarkTasklistRecord {
  guid?: string;
  name?: string;
  url?: string;
  created_at?: string;
  updated_at?: string;
  owner?: {
    id?: string;
    name?: string;
    role?: string;
    type?: string;
  };
  members?: LarkTaskMember[];
}

interface LarkTaskMember {
  id?: string;
  name?: string;
  role?: string;
  type?: string;
}

interface LarkTaskRecord {
  guid?: string;
  summary?: string;
  description?: string;
  url?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  due?: {
    timestamp?: string;
    is_all_day?: boolean;
  };
  tasklists?: Array<{
    tasklist_guid?: string;
    section_guid?: string;
  }>;
  members?: LarkTaskMember[];
  subtask_count?: number;
}

interface LarkTasklistsResponse extends LarkApiErrorJson {
  data?: {
    items?: LarkTasklistRecord[];
    has_more?: boolean;
    page_token?: string;
  };
  items?: LarkTasklistRecord[];
}

interface LarkTasklistCreateResponse extends LarkApiErrorJson {
  data?: {
    guid?: string;
    name?: string;
    url?: string;
    tasklist?: LarkTasklistRecord;
  };
  guid?: string;
  name?: string;
  url?: string;
  tasklist?: LarkTasklistRecord;
}

interface LarkTasksResponse extends LarkApiErrorJson {
  data?: {
    items?: LarkTaskRecord[];
    has_more?: boolean;
    page_token?: string;
  };
  items?: LarkTaskRecord[];
}

interface LarkProjectState {
  profileName?: string;
  syncedAt?: number;
  taskCreates?: Record<string, LarkTaskCreateRecord>;
  buckets?: ILarkAutomationProjectBucket[];
}

interface LarkAutomationEventListenerStatus {
  enabled: boolean;
  running: boolean;
  ready: boolean;
  eventKey: string;
  profileName?: string;
  appId?: string;
  startedAt?: number;
  readyAt?: number;
  lastEventAt?: number;
  lastExitAt?: number;
  lastError?: string;
  restartCount: number;
  receivedCount: number;
  taskCreatedCount: number;
  knownChatCount: number;
  backfillRunning?: boolean;
}

let eventConsumer: ChildProcessWithoutNullStreams | null = null;
let eventConsumerProfile: string | null = null;
let eventConsumerAppId: string | null = null;
let eventConsumerIntentionalStop = false;
let eventRestartTimer: NodeJS.Timeout | null = null;
let eventBackfillTimer: NodeJS.Timeout | null = null;
let eventBackfillRunning = false;
let eventStdoutBuffer = '';
let eventStartedAt: number | undefined;
let eventReadyAt: number | undefined;
let eventLastExitAt: number | undefined;
let eventLastError: string | undefined;
let eventRestartCount = 0;

function normalizeExecError(error: unknown): ExecError {
  return error instanceof Error ? (error as ExecError) : new Error(String(error));
}

function sanitizeOutput(output: string): string {
  return output
    .replace(/"appSecret"\s*:\s*"[^"]*"/gi, '"appSecret":"****"')
    .replace(/appSecret:\s*\S+/gi, 'appSecret: ****')
    .trim();
}

function parseJsonObject<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

function extractUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s"'<>]+/);
  return match?.[0];
}

function buildCliEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME;
  const nvmPath = home ? `${home}/.nvm/versions/node/v24.14.1/bin:${home}/.nvm/versions/node/v22.19.0/bin` : '';
  const commonPath = [
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
    .join(':');

  return {
    ...process.env,
    PATH: commonPath,
  };
}

async function runLarkCli(args: string[], timeout = EXEC_TIMEOUT_MS): Promise<ExecResult> {
  const result = await execFileAsync(LARK_CLI, args, {
    timeout,
    maxBuffer: 1024 * 1024 * 8,
    env: buildCliEnv(),
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function runLarkCliUntilUrl(args: string[], waitMs = 8_000): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(LARK_CLI, args, {
      env: buildCliEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: ExecResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const fail = (error: ExecError) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const maybeFinishWithUrl = () => {
      const output = `${stdout}\n${stderr}`;
      if (extractUrl(output)) {
        finish({ stdout, stderr });
      }
    };

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      maybeFinishWithUrl();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      maybeFinishWithUrl();
    });
    child.on('error', (error) => {
      fail(error as ExecError);
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code === 0) {
        finish({ stdout, stderr });
      } else {
        const error = new Error(`lark-cli exited with code ${code}`) as ExecError;
        error.code = code ?? undefined;
        error.stdout = stdout;
        error.stderr = stderr;
        fail(error);
      }
    });

    setTimeout(() => {
      finish({ stdout, stderr });
      child.unref();
    }, waitMs);
  });
}

function getProfileStatePath(): string {
  return getAutomationStatePath(PROFILE_STATE_FILE);
}

function getBindingStatePath(): string {
  return getAutomationStatePath(BINDING_STATE_FILE);
}

function getEventStatePath(): string {
  return getAutomationStatePath(EVENT_STATE_FILE);
}

function getImSessionStatePath(): string {
  return getAutomationStatePath(IM_SESSION_STATE_FILE);
}

function getProjectStatePath(): string {
  return getAutomationStatePath(PROJECT_STATE_FILE);
}

function getContactStatePath(): string {
  return getAutomationStatePath(CONTACT_STATE_FILE);
}

function getLegacyAutomationStatePath(fileName: string): string {
  return path.join(app.getPath('userData'), fileName);
}

function getAutomationStatePath(fileName: string): string {
  const nextPath = path.join(getProjectAgentDataDir(), AUTOMATION_DIR, fileName);
  const legacyPath = getLegacyAutomationStatePath(fileName);
  if (!existsSync(nextPath) && existsSync(legacyPath)) {
    mkdirSync(path.dirname(nextPath), { recursive: true });
    copyFileSync(legacyPath, nextPath);
  }
  return nextPath;
}

function getRawDataDir(): string {
  const dir = path.join(getProjectAgentDataDir(), AUTOMATION_DIR, RAW_DATA_DIR_NAME);
  const legacyDir = path.join(app.getPath('userData'), RAW_DATA_DIR);
  if (!existsSync(dir) && existsSync(legacyDir)) {
    mkdirSync(path.dirname(dir), { recursive: true });
    cpSync(legacyDir, dir, { recursive: true });
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getLarkImWorkspaceRoot(): string {
  const root = path.join(app.getPath('userData'), IM_WORKSPACES_DIR);
  mkdirSync(root, { recursive: true });
  return root;
}

function safeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_');
}

function writeRawDataFile(fileName: string, data: string): string {
  const filePath = path.join(getRawDataDir(), fileName);
  writeFileSync(filePath, data);
  return filePath;
}

function appendRawDataFile(fileName: string, data: string): string {
  const filePath = path.join(getRawDataDir(), fileName);
  appendFileSync(filePath, data);
  return filePath;
}

function readBindingRecord(): ILarkAutomationBindingRecord | undefined {
  try {
    const statePath = getBindingStatePath();
    if (!existsSync(statePath)) return undefined;
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as ILarkAutomationBindingRecord;
    if (!parsed?.profileName || !parsed.appId) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeBindingRecord(record: ILarkAutomationBindingRecord): void {
  const statePath = getBindingStatePath();
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(record, null, 2));
}

function readEventState(): LarkEventState {
  try {
    const statePath = getEventStatePath();
    if (!existsSync(statePath)) return {};
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as LarkEventState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeEventState(state: LarkEventState): void {
  const statePath = getEventStatePath();
  mkdirSync(path.dirname(statePath), { recursive: true });
  const normalized: LarkEventState = {
    ...state,
    seenEventIds: (state.seenEventIds ?? []).slice(-500),
    seenMessageIds: (state.seenMessageIds ?? []).slice(-500),
    knownChats: state.knownChats ?? {},
  };
  writeFileSync(statePath, JSON.stringify(normalized, null, 2));
}

function readImSessionState(): LarkImSessionState {
  try {
    const statePath = getImSessionStatePath();
    if (!existsSync(statePath)) return {};
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as LarkImSessionState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeImSessionRecord(record: LarkImSessionRecord): LarkImSessionRecord {
  return {
    ...record,
    messages: (record.messages ?? []).slice(-80),
  };
}

function writeImSessionState(state: LarkImSessionState): void {
  const statePath = getImSessionStatePath();
  mkdirSync(path.dirname(statePath), { recursive: true });
  const sessions = Object.fromEntries(
    Object.entries(state.sessions ?? {}).map(([chatId, session]) => [chatId, normalizeImSessionRecord(session)])
  );
  const normalized: LarkImSessionState = {
    ...state,
    updatedAt: Date.now(),
    processedMessageIds: (state.processedMessageIds ?? []).slice(-1000),
    sentMessageIds: (state.sentMessageIds ?? []).slice(-1000),
    sessions,
  };
  writeFileSync(statePath, JSON.stringify(normalized, null, 2));
}

function readProjectState(): LarkProjectState {
  try {
    const statePath = getProjectStatePath();
    if (!existsSync(statePath)) return {};
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as LarkProjectState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeProjectState(state: LarkProjectState): void {
  const statePath = getProjectStatePath();
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    JSON.stringify(
      {
        ...state,
        taskCreates: Object.fromEntries(Object.entries(state.taskCreates ?? {}).slice(-500)),
      },
      null,
      2
    )
  );
}

function readContactState(): LarkContactState {
  try {
    const statePath = getContactStatePath();
    if (!existsSync(statePath)) return {};
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as LarkContactState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeContactState(state: LarkContactState): void {
  const statePath = getContactStatePath();
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function rememberCreatedTask(profileName: string, record: LarkTaskCreateRecord): void {
  const state = readProjectState();
  const taskCreates = { ...state.taskCreates };
  taskCreates[record.taskGuid] = record;
  writeProjectState({
    ...state,
    profileName,
    taskCreates,
  });
}

function summarizeCliFailure(result: SafeExecResult): string | undefined {
  const text = sanitizeOutput(`${result.stdout}\n${result.stderr}`);
  const json = parseJsonObject<LarkApiErrorJson>(text);
  const detail = json?.error?.message || json?.error?.subtype || json?.error?.type || json?.msg || json?.message;
  return detail || text || (result.code ? `lark-cli exited with code ${result.code}` : undefined);
}

async function runLarkCliSafe(args: string[], timeout = EXEC_TIMEOUT_MS): Promise<SafeExecResult> {
  try {
    const result = await runLarkCli(args, timeout);
    return { ...result, code: 0 };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    return {
      code: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
    };
  }
}

function getEventListenerStatus(): LarkAutomationEventListenerStatus {
  const state = readEventState();
  const binding = readBindingRecord();
  return {
    enabled: Boolean(binding?.profileName && binding.appId && binding.userReady && binding.botReady),
    running: Boolean(eventConsumer && !eventConsumer.killed),
    ready: Boolean(eventConsumer && !eventConsumer.killed && eventReadyAt),
    eventKey: EVENT_KEY_MESSAGE_RECEIVE,
    profileName: eventConsumerProfile ?? binding?.profileName,
    appId: eventConsumerAppId ?? binding?.appId,
    startedAt: eventStartedAt,
    readyAt: eventReadyAt,
    lastEventAt: state.lastEventAt,
    lastExitAt: eventLastExitAt,
    lastError: eventLastError,
    restartCount: eventRestartCount,
    receivedCount: state.receivedCount ?? 0,
    taskCreatedCount: state.taskCreatedCount ?? 0,
    knownChatCount: Object.keys(state.knownChats ?? {}).length,
    backfillRunning: eventBackfillRunning,
  };
}

function parseEventTimeMs(event: Pick<LarkReceiveEvent, 'create_time' | 'timestamp'>): number {
  const raw = event.create_time || event.timestamp;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
}

function addUniqueTail(values: string[] | undefined, value: string, limit = 500): string[] {
  const next = (values ?? []).filter((item) => item !== value);
  next.push(value);
  return next.slice(-limit);
}

function isTaskIntent(content?: string): boolean {
  const text = (content ?? '').trim().toLowerCase();
  if (!text) return false;
  return (
    /\[agent_task\]/i.test(text) ||
    /(^|\s)(todo|task)(\s|:|：|$)/i.test(text) ||
    /(创建|新建|生成|安排|加入|记录).{0,8}(任务|待办|事项)/.test(text) ||
    /(任务|待办|事项).{0,8}(创建|新建|生成|安排|加入|记录)/.test(text)
  );
}

function isAgentTaskIntent(content?: string): boolean {
  return /\[agent_task\]/i.test(content ?? '');
}

function isSupportedTextMessage(event: LarkReceiveEvent): boolean {
  const messageType = (event.message_type ?? '').toLowerCase();
  return !messageType || messageType === 'text' || messageType === 'post';
}

function shouldAutoReplyToImEvent(binding: ILarkAutomationBindingRecord, event: LarkReceiveEvent, content: string): boolean {
  if (!content.trim() || !event.chat_id || !event.message_id) return false;
  if (!isSupportedTextMessage(event)) return false;
  return event.chat_type === 'p2p' || !event.chat_type;
}

function shouldCreateTaskFromEvent(event: LarkReceiveEvent, content: string): boolean {
  if (!content.trim()) return false;
  const messageType = (event.message_type ?? '').toLowerCase();
  if (messageType && !['text', 'post'].includes(messageType)) {
    return isTaskIntent(content);
  }
  return isTaskIntent(content);
}

function normalizeTaskSummary(content: string): string {
  const cleaned = content
    .replace(/^(请|帮我|麻烦)?\s*(创建|新建|生成|安排|加入|记录)?\s*(一个|一条)?\s*(任务|待办|事项)\s*[:：,，-]?\s*/i, '')
    .replace(/\[agent_task\]\s*/i, '')
    .replace(/^(todo|task)\s*[:：-]?\s*/i, '')
    .trim();
  return (cleaned || content.trim()).slice(0, 120);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMessageContent(message: TMessage | undefined): string | undefined {
  if (!message || message.type !== 'text') return undefined;
  const content = message.content?.content;
  return typeof content === 'string' ? content : undefined;
}

function getAssistantTextFinality(message: TMessage | undefined): 'final' | 'progress' | undefined {
  if (!message || message.type !== 'text') return undefined;
  const finality = message.content?.finality;
  return finality === 'final' || finality === 'progress' ? finality : undefined;
}

function detectMessageLanguage(content: string): 'zh' | 'ja' | 'es' | 'en' {
  if (/[\u3040-\u30ff]/.test(content)) return 'ja';
  if (/[\u4e00-\u9fff]/.test(content)) return 'zh';
  if (/[¿¡áéíóúñü]/i.test(content) || /\b(hola|gracias|tarea|proyecto|ayuda|puedes|necesito)\b/i.test(content)) return 'es';
  return 'en';
}

function normalizeFeishuReplyContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 3500) return trimmed;
  const suffixByLanguage = {
    zh: '（回复较长，已自动截断；完整上下文可在本地会话中查看。）',
    ja: '（返信が長いため自動的に短縮しました。完全な文脈はローカル会話で確認できます。）',
    es: '(La respuesta era larga y se acortó automáticamente. El contexto completo está disponible en la conversación local.)',
    en: '(The reply was long and was truncated automatically. The full context is available in the local conversation.)',
  };
  return `${trimmed.slice(0, 3400).trim()}\n\n${suffixByLanguage[detectMessageLanguage(trimmed)]}`;
}

function getImSession(profileName: string, event: LarkReceiveEvent): LarkImSessionRecord {
  const chatId = event.chat_id || 'unknown';
  const state = readImSessionState();
  return (
    state.sessions?.[chatId] ?? {
      chatId,
      chatType: event.chat_type,
      senderId: event.sender_id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      replyCount: 0,
      messages: [],
    }
  );
}

function updateImSession(
  profileName: string,
  chatId: string,
  updater: (record: LarkImSessionRecord | undefined, state: LarkImSessionState) => LarkImSessionRecord
): LarkImSessionRecord {
  const state = readImSessionState();
  const sessions = { ...state.sessions };
  const next = normalizeImSessionRecord(updater(sessions[chatId], state));
  sessions[chatId] = next;
  writeImSessionState({
    ...state,
    profileName,
    sessions,
  });
  return next;
}

function addImProcessedMessage(profileName: string, messageId: string): void {
  const state = readImSessionState();
  writeImSessionState({
    ...state,
    profileName,
    processedMessageIds: addUniqueTail(state.processedMessageIds, messageId, 1000),
  });
}

function addImSentMessage(profileName: string, messageId: string | undefined): void {
  if (!messageId) return;
  const state = readImSessionState();
  writeImSessionState({
    ...state,
    profileName,
    sentMessageIds: addUniqueTail(state.sentMessageIds, messageId, 1000),
  });
}

function hasProcessedImMessage(messageId?: string): boolean {
  if (!messageId) return false;
  const state = readImSessionState();
  return Boolean(state.processedMessageIds?.includes(messageId));
}

function isKnownOutboundImMessage(messageId?: string): boolean {
  if (!messageId) return false;
  const state = readImSessionState();
  return Boolean(state.sentMessageIds?.includes(messageId));
}

function looksLikeRecentOutboundEcho(event: LarkReceiveEvent, content: string): boolean {
  if (!event.chat_id || !content.trim()) return false;
  const state = readImSessionState();
  const session = state.sessions?.[event.chat_id];
  const outboundText = (session?.pendingOutboundContent || session?.lastOutboundContent || '').trim();
  const outboundAt = session?.pendingOutboundAt || session?.lastOutboundAt || 0;
  return Boolean(outboundText && outboundText === content.trim() && Date.now() - outboundAt < 2 * 60 * 1000);
}

async function readClientSettings(): Promise<BackendClientSettings> {
  try {
    const settings = await httpRequest<Record<string, unknown>>('GET', '/api/settings/client', undefined, {
      silentStatuses: [404],
    });
    return (settings ?? {}) as BackendClientSettings;
  } catch {
    return {};
  }
}

function resolveLarkAgentType(_settings: BackendClientSettings): 'acp' {
  return 'acp';
}

function resolveLarkAcpBackend(agent: BackendClientSettings['assistant.lark.agent']): string {
  const backend = agent?.backend || agent?.agent_type;
  return !backend || backend === LEGACY_LOCAL_RUNTIME_ID ? 'codex' : backend;
}

function resolveAcpConversationConfig(settings: BackendClientSettings, backend: string, modelRef?: { use_model?: string }): {
  currentModelId?: string;
  sessionMode?: string;
  thoughtLevel?: string;
} {
  const acpConfig = settings['acp.config']?.[backend];
  const preferredMode = backend === 'codex' ? normalizeCodexMode(acpConfig?.preferredMode) : acpConfig?.preferredMode;
  return {
    currentModelId: modelRef?.use_model || acpConfig?.preferredModelId,
    sessionMode: preferredMode,
    thoughtLevel: acpConfig?.preferredThoughtLevel,
  };
}

function buildImWorkspace(profileName: string, chatId: string): string {
  const profilePart = safeFileName(profileName);
  const chatPart = safeFileName(chatId);
  const workspace = path.join(getLarkImWorkspaceRoot(), profilePart, chatPart);
  const legacyWorkspace = path.join(getProjectAgentDataDir(), 'automation', 'workspaces', 'im', profilePart, chatPart);
  if (!existsSync(workspace) && existsSync(legacyWorkspace)) {
    mkdirSync(path.dirname(workspace), { recursive: true });
    cpSync(legacyWorkspace, workspace, { recursive: true });
  }
  mkdirSync(workspace, { recursive: true });
  return workspace;
}

async function ensureImConversationWorkspace(conversation: TChatConversation, workspace: string): Promise<void> {
  if (conversation.extra?.workspace === workspace && conversation.extra?.custom_workspace === true) return;
  await httpRequest<boolean>('PATCH', `/api/conversations/${encodeURIComponent(conversation.id)}`, {
    extra: {
      workspace,
      custom_workspace: true,
      is_temporary_workspace: true,
    },
    merge_extra: true,
  }).catch((): boolean => false);
}

async function buildCollaborationPrompt(input: {
  binding: ILarkAutomationBindingRecord;
  event: LarkReceiveEvent;
  content: string;
  taskIntent: boolean;
  agentTaskIntent: boolean;
}): Promise<string> {
  const prompt = await getPromptFile('collaboration');
  return [
    prompt.content.trim(),
    '',
    '# Current Lark Message Routing Context',
    '',
    `Bound App: ${input.binding.appName || 'DeepOrganiser'}`,
    input.binding.userName ? `Local Owner: ${input.binding.userName}` : undefined,
    `Chat Type: ${input.event.chat_type || 'unknown'}`,
    input.event.chat_id ? `Chat ID: ${input.event.chat_id}` : undefined,
    input.event.message_id ? `Source Message ID: ${input.event.message_id}` : undefined,
    `Task Intent Detected: ${input.taskIntent ? 'yes' : 'no'}`,
    `Agent Task Intent Detected: ${input.agentTaskIntent ? 'yes' : 'no'}`,
    '',
    'The bridge will handle explicit task creation separately when task intent is detected. Your reply should be the human-facing chat response only.',
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

function buildCollaborationUserInput(event: LarkReceiveEvent, content: string): string {
  return JSON.stringify(
    {
      __aion_lark_incoming_message: true,
      version: 1,
      source: 'lark',
      message: content,
      senderOpenId: event.sender_id,
      messageId: event.message_id,
      chatId: event.chat_id,
      chatType: event.chat_type,
      instruction:
        'Reply respectfully in the same language unless asked otherwise. Return only the human-facing message that should be sent back.',
    },
    null,
    2
  );
}

function buildFallbackImReply(input: { content: string; taskIntent: boolean; agentTaskIntent: boolean; error?: string }): string {
  const language = detectMessageLanguage(input.content);
  const replies = {
    zh: {
      error: [
        '我已经收到你的消息，但本地 Agent 会话暂时没有顺利完成自动处理。',
        '你可以稍后再发一次，或在 DeepOrganiser 里检查协作自动化的默认模型和本地运行状态。',
      ].join('\n'),
      agentTask: '收到，这条消息已按 Agent 任务入口处理。我会把任务内容交给本地 Agent 链路，并在任务评论区保留后续上下文。',
      task: '收到，这条消息看起来是一个待办/任务请求。我会优先把它进入协作任务链路；如果你希望交给 Agent 执行，可以用 [AGENT_TASK] 写清目标、上下文、交付物和验收标准。',
      default: [
        '你好，我是 DeepOrganiser 的协作 Agent。',
        '我可以帮你讨论项目计划、整理需求、把明确事项转成协作任务，并在需要时协调本地 Agent 继续处理。',
        '如果你想创建任务，可以直接说“创建任务：……”。如果要交给 Agent 执行，可以使用 [AGENT_TASK] 写清目标、输入、交付物和验收标准。',
      ].join('\n'),
    },
    ja: {
      error: [
        'メッセージは受け取りましたが、ローカル Agent セッションでの自動処理が一時的に完了できませんでした。',
        '少し時間を置いて再送するか、DeepOrganiser の協作自動化設定で既定モデルとローカル実行状態を確認してください。',
      ].join('\n'),
      agentTask: '受け取りました。このメッセージは Agent タスクとして扱います。内容をローカル Agent の処理フローに渡し、以後の文脈はタスクのコメントにも残します。',
      task: '受け取りました。このメッセージはタスク依頼のようです。まず協作タスクの流れに入れます。Agent に実行させたい場合は、[AGENT_TASK] に目標、文脈、成果物、受け入れ基準を書いてください。',
      default: [
        'こんにちは。DeepOrganiser の協作 Agent です。',
        'プロジェクト計画の相談、要件整理、明確な依頼のタスク化、必要に応じたローカル Agent への引き継ぎを支援できます。',
        'タスクを作成したい場合は、そのまま依頼を書いてください。Agent に実行させたい場合は [AGENT_TASK] に目標、入力、成果物、受け入れ基準を書いてください。',
      ].join('\n'),
    },
    es: {
      error: [
        'He recibido tu mensaje, pero la sesión local del Agent no pudo completar el procesamiento automático por ahora.',
        'Puedes reenviarlo más tarde o revisar el modelo predeterminado y el estado local en la automatización de colaboración de DeepOrganiser.',
      ].join('\n'),
      agentTask: 'Recibido. Trataré este mensaje como una tarea de Agent, lo pasaré al flujo local y conservaré el contexto posterior en los comentarios de la tarea.',
      task: 'Recibido. Este mensaje parece una solicitud de tarea. Lo llevaré primero al flujo de tareas de colaboración. Si quieres que lo ejecute un Agent, usa [AGENT_TASK] e incluye objetivo, contexto, entregable y criterios de aceptación.',
      default: [
        'Hola, soy el Agent de colaboración de DeepOrganiser.',
        'Puedo ayudarte a discutir planes de proyecto, ordenar requisitos, convertir solicitudes claras en tareas y coordinar un Agent local cuando haga falta.',
        'Para crear una tarea, escribe la solicitud directamente. Para que la ejecute un Agent, usa [AGENT_TASK] con objetivo, entradas, entregable y criterios de aceptación.',
      ].join('\n'),
    },
    en: {
      error: [
        'I received your message, but the local Agent session could not complete the automatic handling yet.',
        'Please try again later, or check the collaboration automation default model and local runtime status in DeepOrganiser.',
      ].join('\n'),
      agentTask: 'Received. I will treat this as an Agent task, pass it into the local Agent flow, and keep follow-up context in the task comments.',
      task: 'Received. This looks like a task request, so I will route it into the collaboration task flow first. If you want an Agent to execute it, use [AGENT_TASK] with the goal, context, deliverable, and acceptance criteria.',
      default: [
        'Hello, I am the DeepOrganiser collaboration Agent.',
        'I can help discuss project plans, clarify requirements, turn clear requests into collaboration tasks, and coordinate a local Agent when needed.',
        'To create a task, write the request directly. To delegate execution to an Agent, use [AGENT_TASK] and include the goal, inputs, deliverable, and acceptance criteria.',
      ].join('\n'),
    },
  } satisfies Record<'zh' | 'ja' | 'es' | 'en', Record<'error' | 'agentTask' | 'task' | 'default', string>>;
  const selected = replies[language];
  if (input.error) {
    return selected.error;
  }
  if (input.agentTaskIntent) {
    return selected.agentTask;
  }
  if (input.taskIntent) {
    return selected.task;
  }
  return selected.default;
}

async function getConversationIfExists(conversationId: string): Promise<TChatConversation | null> {
  try {
    return await httpRequest<TChatConversation>('GET', `/api/conversations/${encodeURIComponent(conversationId)}`, undefined, {
      silentStatuses: [404],
    });
  } catch {
    return null;
  }
}

async function getOrCreateImConversation(input: {
  profileName: string;
  binding: ILarkAutomationBindingRecord;
  event: LarkReceiveEvent;
  prompt: string;
}): Promise<string> {
  const chatId = input.event.chat_id || 'unknown';
  const workspace = buildImWorkspace(input.profileName, chatId);
  const savedConversationId = readImSessionState().sessions?.[chatId]?.conversationId;
  if (savedConversationId) {
    const saved = await getConversationIfExists(savedConversationId);
    if (saved?.id) {
      await ensureImConversationWorkspace(saved, workspace);
      await upsertLocalImChatConfig({
        chatId,
        profileName: input.profileName,
        displayName: input.binding.appName || 'DeepOrganiser',
        conversationId: saved.id,
        workspace,
        visible: true,
      }).catch((): undefined => undefined);
      return saved.id;
    }
  }

  const deterministicId = `lark-im-${safeFileName(input.profileName)}-${safeFileName(chatId)}`;
  const existing = await getConversationIfExists(deterministicId);
  if (existing?.id) {
    await ensureImConversationWorkspace(existing, workspace);
    await upsertLocalImChatConfig({
      chatId,
      profileName: input.profileName,
      displayName: input.binding.appName || 'DeepOrganiser',
      conversationId: existing.id,
      workspace,
      visible: true,
    }).catch((): undefined => undefined);
    return existing.id;
  }

  const settings = await readClientSettings();
  const modelRef = settings['assistant.lark.defaultModel'];
  const agentType = resolveLarkAgentType(settings);
  const agent = settings['assistant.lark.agent'];
  const acpBackend = resolveLarkAcpBackend(agent);
  const defaultCodexModel = DEFAULT_CODEX_MODELS[0]?.id ?? 'gpt-5.3-codex';
  const model = {
    id: modelRef?.id || acpBackend,
    use_model: modelRef?.use_model || (acpBackend === 'codex' ? defaultCodexModel : ''),
  } as TProviderWithModel;
  const acpConfig = resolveAcpConversationConfig(settings, acpBackend, modelRef);
  const body: Record<string, unknown> = {
    type: agentType,
    id: deterministicId,
    name: `${input.binding.appName || 'Collaboration Agent'} · Lark chat`,
    extra: {
      workspace,
      custom_workspace: true,
      context: input.prompt,
      context_file_name: 'lark-collaboration-agent.md',
      preset_context: input.prompt,
      preset_rules: input.prompt,
      lark_im_profile_name: input.profileName,
      lark_im_chat_id: chatId,
      lark_im_sender_id: input.event.sender_id,
      lark_im_display_group: input.binding.appName || 'DeepOrganiser',
      lark_im_kind: input.event.chat_type === 'group' ? 'group_chat' : 'direct_chat',
      lark_im_last_message_id: input.event.message_id,
      is_temporary_workspace: true,
      agent_name: input.binding.appName || 'DeepOrganiser',
      ...(agentType === 'acp'
        ? {
            backend: acpBackend,
            agent_id: agent?.id,
            custom_agent_id: agent?.custom_agent_id || agent?.id,
            current_model_id: acpConfig.currentModelId,
            session_mode: acpConfig.sessionMode,
            thought_level: acpConfig.thoughtLevel,
          }
        : {}),
    },
  };
  const created = await httpRequest<TChatConversation>('POST', '/api/conversations', body);
  await upsertLocalImChatConfig({
    chatId,
    profileName: input.profileName,
    displayName: input.binding.appName || 'DeepOrganiser',
    conversationId: created.id || deterministicId,
    workspace,
    visible: true,
  }).catch((): undefined => undefined);
  return created.id || deterministicId;
}

async function sendMessageToImConversation(conversationId: string, content: string): Promise<{ msgId?: string; turnId?: string }> {
  const result = await httpRequest<{ msg_id?: string; turn_id?: string }>(
    'POST',
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      content,
    }
  );
  return {
    msgId: result?.msg_id,
    turnId: result?.turn_id,
  };
}

function isConversationRunning(conversation: TChatConversation | null): boolean {
  if (!conversation) return false;
  const runtime = conversation.runtime;
  return Boolean(
    conversation.status === 'running' ||
      runtime?.is_processing ||
      runtime?.state === 'starting' ||
      runtime?.state === 'running' ||
      runtime?.state === 'waiting_confirmation'
  );
}

async function getLatestAssistantReply(conversationId: string, startedAt: number): Promise<string | undefined> {
  const result = await httpRequest<BackendPaginatedMessages>(
    'GET',
    `/api/conversations/${encodeURIComponent(conversationId)}/messages?page=1&page_size=30&order=desc&content_mode=full`,
    undefined,
    { silentStatuses: [404] }
  );
  const messages = Array.isArray(result?.items) ? result.items : [];
  const candidates = messages
    .filter(
      (message) =>
        message.position === 'left' &&
        (message.status === undefined || message.status === 'finish') &&
        (message.created_at ?? 0) >= startedAt - 1_000
    )
    .map((message) => ({
      content: getMessageContent(message)?.trim(),
      finality: getAssistantTextFinality(message),
      createdAt: message.created_at ?? 0,
    }))
    .filter((item) => Boolean(item.content))
    .map((item) => ({ ...item, content: item.content! }));
  const sorted = candidates.toSorted((a, b) => b.createdAt - a.createdAt);
  return (sorted.find((item) => item.finality === 'final') ?? sorted[0])?.content;
}

async function waitForAssistantReply(conversationId: string, startedAt: number): Promise<string | undefined> {
  const deadline = Date.now() + IM_AGENT_REPLY_TIMEOUT_MS;
  let latest: string | undefined;
  while (Date.now() < deadline) {
    latest = (await getLatestAssistantReply(conversationId, startedAt).catch((): undefined => undefined)) || latest;
    const conversation = await getConversationIfExists(conversationId);
    if (latest && !isConversationRunning(conversation)) {
      return latest;
    }
    await sleep(IM_AGENT_REPLY_POLL_INTERVAL_MS);
  }
  return latest;
}

function extractSentMessageId(output: string): string | undefined {
  const parsed = parseJsonObject<LarkImReplyResponse>(output);
  return parsed?.data?.message_id || parsed?.message_id;
}

async function sendLarkReply(profileName: string, event: LarkReceiveEvent, content: string): Promise<{ sentMessageId?: string; ok: boolean; error?: string }> {
  const reply = normalizeFeishuReplyContent(content);
  const messageId = event.message_id || event.id;
  const idempotencyKey = `deeporganiser-reply-${safeFileName(messageId || `${Date.now()}`)}`;
  const args = messageId
    ? ['im', '+messages-reply', '--message-id', messageId, '--markdown', reply, '--idempotency-key', idempotencyKey, '--as', 'bot', '--json']
    : event.chat_id
      ? ['im', '+messages-send', '--chat-id', event.chat_id, '--markdown', reply, '--idempotency-key', idempotencyKey, '--as', 'bot', '--json']
      : [];
  if (!args.length) {
    return { ok: false, error: 'Missing a replyable Lark message or chat ID.' };
  }

  const result = await runLarkCliSafe(withProfile(args, profileName), 30_000);
  appendRawDataFile(
    `event-im-reply.${safeFileName(profileName)}.ndjson`,
    JSON.stringify({
      at: Date.now(),
      sourceMessageId: messageId,
      ok: result.code === 0,
      code: result.code,
      stdout: sanitizeOutput(result.stdout),
      stderr: sanitizeOutput(result.stderr),
    }) + '\n'
  );
  if (result.code === 0) {
    return { ok: true, sentMessageId: extractSentMessageId(sanitizeOutput(result.stdout)) };
  }

  const error = summarizeCliFailure(result) || 'Failed to send the Lark reply.';
  if (event.chat_id && messageId) {
    const fallback = await runLarkCliSafe(
      withProfile(
        ['im', '+messages-send', '--chat-id', event.chat_id, '--markdown', reply, '--idempotency-key', `${idempotencyKey}-send`, '--as', 'bot', '--json'],
        profileName
      ),
      30_000
    );
    appendRawDataFile(
      `event-im-reply-fallback.${safeFileName(profileName)}.ndjson`,
      JSON.stringify({
        at: Date.now(),
        sourceMessageId: messageId,
        ok: fallback.code === 0,
        code: fallback.code,
        stdout: sanitizeOutput(fallback.stdout),
        stderr: sanitizeOutput(fallback.stderr),
      }) + '\n'
    );
    if (fallback.code === 0) {
      return { ok: true, sentMessageId: extractSentMessageId(sanitizeOutput(fallback.stdout)) };
    }
    return { ok: false, error: summarizeCliFailure(fallback) || error };
  }
  return { ok: false, error };
}

function extractTasks(json: LarkTasksResponse | null): LarkTaskRecord[] {
  const items = json?.data?.items ?? json?.items ?? [];
  return Array.isArray(items) ? items : [];
}

function extractTasklists(json: LarkTasklistsResponse | null): LarkTasklistRecord[] {
  const items = json?.data?.items ?? json?.items ?? [];
  return Array.isArray(items) ? items : [];
}

function extractContactUsers(json: LarkContactUsersResponse | null): LarkContactUserRecord[] {
  const items = json?.data?.items ?? json?.data?.users ?? json?.items ?? json?.users ?? [];
  return Array.isArray(items) ? items : [];
}

function extractDepartments(json: LarkDepartmentChildrenResponse | null): LarkDepartmentRecord[] {
  const items = json?.data?.items ?? json?.items ?? [];
  return Array.isArray(items) ? items : [];
}

function getNextPageToken(json: LarkDepartmentChildrenResponse | LarkContactUsersResponse | null): string | undefined {
  return json?.data?.has_more ? json.data.page_token : undefined;
}

function normalizeContactUser(
  user: LarkContactUserRecord,
  source: ILarkAutomationContact['source']
): ILarkAutomationContact | null {
  const openId = user.open_id;
  const name = user.localized_name || user.name || user.en_name || openId;
  if (!openId || !name) return null;
  return {
    id: openId,
    openId,
    userId: user.user_id,
    unionId: user.union_id,
    name,
    enName: user.en_name,
    email: user.email,
    enterpriseEmail: user.enterprise_email,
    department: user.department,
    departmentIds: user.department_ids,
    avatarUrl: user.avatar?.avatar_72 || user.avatar?.avatar_middle || user.avatar?.avatar_big || user.avatar?.avatar_origin || user.avatar_url,
    p2pChatId: user.p2p_chat_id,
    hasChatted: user.has_chatted,
    source,
  };
}

function mergeContacts(contacts: ILarkAutomationContact[]): ILarkAutomationContact[] {
  const byOpenId = new Map<string, ILarkAutomationContact>();
  for (const contact of contacts) {
    const previous = byOpenId.get(contact.openId);
    byOpenId.set(contact.openId, {
      ...previous,
      ...contact,
      source: previous?.source === 'directory' ? previous.source : contact.source,
      hasChatted: previous?.hasChatted || contact.hasChatted,
    });
  }
  return Array.from(byOpenId.values()).toSorted((a, b) => a.name.localeCompare(b.name));
}

function isTaskCompleted(task: LarkTaskRecord): boolean {
  const status = (task.status ?? '').toLowerCase();
  return status === 'done' || status === 'completed' || Boolean(task.completed_at && task.completed_at !== '0');
}

function maybeTimestampToIso(value?: string): string | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return value;
  try {
    return new Date(numeric).toISOString();
  } catch {
    return value;
  }
}

function getAutoCreatedMeta(taskGuid: string | undefined, state: LarkProjectState): LarkTaskCreateRecord | undefined {
  if (!taskGuid) return undefined;
  return state.taskCreates?.[taskGuid];
}

function isAgentTaskRecord(task: LarkTaskRecord, autoCreated?: LarkTaskCreateRecord): boolean {
  const text = `${task.summary ?? ''}\n${task.description ?? ''}`;
  return Boolean(autoCreated || /\[agent_task\]/i.test(text) || /由协作消息自动创建|Created automatically from a collaboration message/i.test(text));
}

function normalizeProjectTask(
  task: LarkTaskRecord,
  tasklistNameByGuid: Map<string, string>,
  state: LarkProjectState
): ILarkAutomationProjectTask | null {
  if (!task.guid || !task.summary) return null;
  const autoCreated = getAutoCreatedMeta(task.guid, state);
  const tasklistGuids = (task.tasklists ?? [])
    .map((item) => item.tasklist_guid)
    .filter((guid): guid is string => Boolean(guid));
  const tasklistNames = tasklistGuids.map((guid) => tasklistNameByGuid.get(guid)).filter((name): name is string => Boolean(name));
  const completed = isTaskCompleted(task);
  return {
    guid: task.guid,
    summary: task.summary,
    description: task.description,
    url: task.url ?? autoCreated?.taskUrl,
    status: task.status,
    completed,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    dueAt: maybeTimestampToIso(task.due?.timestamp),
    tasklistGuids,
    tasklistNames,
    sourceMessageId: autoCreated?.messageId,
    sourceChatId: autoCreated?.chatId,
    isAgentTask: isAgentTaskRecord(task, autoCreated),
    autoCreated: Boolean(autoCreated),
    members: task.members,
  };
}

function upsertTask(tasks: Map<string, ILarkAutomationProjectTask>, task: ILarkAutomationProjectTask | null): void {
  if (!task) return;
  const previous = tasks.get(task.guid);
  if (!previous) {
    tasks.set(task.guid, task);
    return;
  }
  tasks.set(task.guid, {
    ...previous,
    ...task,
    tasklistGuids: Array.from(new Set([...previous.tasklistGuids, ...task.tasklistGuids])),
    tasklistNames: Array.from(new Set([...previous.tasklistNames, ...task.tasklistNames])),
    isAgentTask: previous.isAgentTask || task.isAgentTask,
    autoCreated: previous.autoCreated || task.autoCreated,
    sourceMessageId: previous.sourceMessageId ?? task.sourceMessageId,
    sourceChatId: previous.sourceChatId ?? task.sourceChatId,
  });
}

function summarizeBucketTasks(tasks: ILarkAutomationProjectTask[]): Pick<ILarkAutomationProjectBucket, 'taskCount' | 'todoCount' | 'doneCount'> {
  const doneCount = tasks.filter((task) => task.completed).length;
  return {
    taskCount: tasks.length,
    doneCount,
    todoCount: tasks.length - doneCount,
  };
}

async function collectDirectoryDepartmentIds(profileName: string, rawDataFiles: string[]): Promise<string[]> {
  const pending = ['0'];
  const seen = new Set<string>();

  while (pending.length > 0 && seen.size < 500) {
    const departmentId = pending.shift();
    if (!departmentId || seen.has(departmentId)) continue;
    seen.add(departmentId);

    let pageToken = '';
    do {
      const params: Record<string, unknown> = {
        department_id_type: 'open_department_id',
        page_size: 50,
      };
      if (pageToken) params.page_token = pageToken;
      const result = await runLarkCliSafe(
        withProfile(
          [
            'api',
            'GET',
            `/open-apis/contact/v3/departments/${encodeURIComponent(departmentId)}/children`,
            '--as',
            'bot',
            '--params',
            JSON.stringify(params),
            '--json',
          ],
          profileName
        ),
        30_000
      );
      const filePrefix = `contacts-departments.${safeFileName(profileName)}.${safeFileName(departmentId)}.${pageToken || 'first'}`;
      rawDataFiles.push(writeRawDataFile(`${filePrefix}.stdout.json`, sanitizeOutput(result.stdout)));
      rawDataFiles.push(writeRawDataFile(`${filePrefix}.stderr.txt`, sanitizeOutput(result.stderr)));
      if (result.code !== 0) {
        throw new Error(summarizeCliFailure(result) || 'Failed to read Lark departments.');
      }

      const json = parseJsonObject<LarkDepartmentChildrenResponse>(sanitizeOutput(result.stdout));
      for (const department of extractDepartments(json)) {
        const childId = department.open_department_id || department.department_id;
        if (childId && !seen.has(childId)) {
          pending.push(childId);
        }
      }
      pageToken = getNextPageToken(json) ?? '';
    } while (pageToken);
  }

  return Array.from(seen);
}

async function collectUsersByDepartment(
  profileName: string,
  departmentId: string,
  rawDataFiles: string[]
): Promise<ILarkAutomationContact[]> {
  const contacts: ILarkAutomationContact[] = [];
  let pageToken = '';
  do {
    const params: Record<string, unknown> = {
      department_id: departmentId,
      department_id_type: 'open_department_id',
      user_id_type: 'open_id',
      page_size: 50,
    };
    if (pageToken) params.page_token = pageToken;
    const result = await runLarkCliSafe(
      withProfile(
        [
          'api',
          'GET',
          '/open-apis/contact/v3/users/find_by_department',
          '--as',
          'bot',
          '--params',
          JSON.stringify(params),
          '--json',
        ],
        profileName
      ),
      30_000
    );
    const filePrefix = `contacts-users.${safeFileName(profileName)}.${safeFileName(departmentId)}.${pageToken || 'first'}`;
    rawDataFiles.push(writeRawDataFile(`${filePrefix}.stdout.json`, sanitizeOutput(result.stdout)));
    rawDataFiles.push(writeRawDataFile(`${filePrefix}.stderr.txt`, sanitizeOutput(result.stderr)));
    if (result.code !== 0) {
      throw new Error(summarizeCliFailure(result) || 'Failed to read Lark department users.');
    }

    const json = parseJsonObject<LarkContactUsersResponse>(sanitizeOutput(result.stdout));
    for (const user of extractContactUsers(json)) {
      const contact = normalizeContactUser(user, 'directory');
      if (contact) contacts.push(contact);
    }
    pageToken = getNextPageToken(json) ?? '';
  } while (pageToken);
  return contacts;
}

async function collectDirectoryContacts(profileName: string, rawDataFiles: string[]): Promise<ILarkAutomationContact[]> {
  const departmentIds = await collectDirectoryDepartmentIds(profileName, rawDataFiles);
  const batches = await Promise.all(departmentIds.map((departmentId) => collectUsersByDepartment(profileName, departmentId, rawDataFiles)));
  return mergeContacts(batches.flat());
}

async function searchLarkContacts(
  profileName: string,
  rawDataFiles: string[],
  query?: string
): Promise<ILarkAutomationContact[]> {
  const trimmedQuery = query?.trim();
  const args = trimmedQuery
    ? ['contact', '+search-user', '--query', trimmedQuery, '--as', 'user', '--page-size', '30', '--json']
    : ['contact', '+search-user', '--has-chatted', '--as', 'user', '--page-size', '30', '--json'];
  const result = await runLarkCliSafe(withProfile(args, profileName), 20_000);
  const filePrefix = trimmedQuery
    ? `contacts-search.${safeFileName(profileName)}.${safeFileName(trimmedQuery)}`
    : `contacts-has-chatted.${safeFileName(profileName)}`;
  rawDataFiles.push(writeRawDataFile(`${filePrefix}.stdout.json`, sanitizeOutput(result.stdout)));
  rawDataFiles.push(writeRawDataFile(`${filePrefix}.stderr.txt`, sanitizeOutput(result.stderr)));
  if (result.code !== 0) {
    throw new Error(summarizeCliFailure(result) || 'Failed to search Lark contacts.');
  }
  const json = parseJsonObject<LarkContactUsersResponse>(sanitizeOutput(result.stdout));
  return mergeContacts(
    extractContactUsers(json)
      .map((user) => normalizeContactUser(user, 'search'))
      .filter((contact): contact is ILarkAutomationContact => Boolean(contact))
  );
}

async function collectCurrentUserContact(
  profileName: string,
  rawDataFiles: string[]
): Promise<ILarkAutomationContact | undefined> {
  const result = await runLarkCliSafe(withProfile(['contact', '+get-user', '--as', 'user', '--json'], profileName), 20_000);
  rawDataFiles.push(writeRawDataFile(`contacts-current-user.${safeFileName(profileName)}.stdout.json`, sanitizeOutput(result.stdout)));
  rawDataFiles.push(writeRawDataFile(`contacts-current-user.${safeFileName(profileName)}.stderr.txt`, sanitizeOutput(result.stderr)));
  if (result.code !== 0) return undefined;
  const json = parseJsonObject<CurrentUserJson>(sanitizeOutput(result.stdout));
  const user = json?.data?.user ?? json?.data;
  if (!user?.open_id || !user.name) return undefined;
  return {
    id: user.open_id,
    openId: user.open_id,
    unionId: user.union_id,
    name: user.name,
    avatarUrl: user.avatar_url,
    source: 'current-user',
  };
}

function eventToStateKey(event: LarkReceiveEvent): { eventId?: string; messageId?: string } {
  return {
    eventId: event.event_id,
    messageId: event.message_id || event.id,
  };
}

function persistReceiveEvent(event: LarkReceiveEvent): { duplicate: boolean; state: LarkEventState } {
  const state = readEventState();
  const { eventId, messageId } = eventToStateKey(event);
  const duplicate = Boolean(
    (eventId && state.seenEventIds?.includes(eventId)) || (messageId && state.seenMessageIds?.includes(messageId))
  );
  if (duplicate) return { duplicate, state };

  const eventAt = parseEventTimeMs(event);
  const chatId = event.chat_id;
  const knownChats = { ...state.knownChats };
  if (chatId) {
    knownChats[chatId] = {
      chatId,
      chatType: event.chat_type,
      lastMessageId: messageId,
      lastMessageAt: eventAt,
      lastSenderId: event.sender_id,
      lastContent: typeof event.content === 'string' ? event.content.slice(0, 500) : undefined,
    };
  }

  const nextState: LarkEventState = {
    ...state,
    seenEventIds: eventId ? addUniqueTail(state.seenEventIds, eventId) : state.seenEventIds,
    seenMessageIds: messageId ? addUniqueTail(state.seenMessageIds, messageId) : state.seenMessageIds,
    knownChats,
    lastEventAt: eventAt,
    receivedCount: (state.receivedCount ?? 0) + 1,
  };
  writeEventState(nextState);
  return { duplicate, state: nextState };
}

async function createTaskFromEvent(profileName: string, binding: ILarkAutomationBindingRecord, event: LarkReceiveEvent): Promise<void> {
  const content = typeof event.content === 'string' ? event.content.trim() : '';
  if (!shouldCreateTaskFromEvent(event, content)) return;

  const messageId = event.message_id || event.id || event.event_id || String(Date.now());
  const summary = normalizeTaskSummary(content);
  const description = [
    'Created automatically from a collaboration message.',
    event.sender_id ? `Sender: ${event.sender_id}` : undefined,
    event.chat_id ? `Chat: ${event.chat_id}` : undefined,
    messageId ? `Message: ${messageId}` : undefined,
    '',
    content,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const args = withProfile(
    [
      'task',
      '+create',
      '--summary',
      summary,
      '--description',
      description,
      '--idempotency-key',
      `deeporganiser-${messageId}`,
      '--as',
      'user',
      '--json',
    ],
    profileName
  );
  if (binding.openId) {
    args.push('--assignee', binding.openId);
  }

  const result = await runLarkCliSafe(args, 30_000);
  const safeMessageId = safeFileName(messageId);
  appendRawDataFile(
    `event-task-create.${safeFileName(profileName)}.ndjson`,
    JSON.stringify({
      at: Date.now(),
      messageId,
      ok: result.code === 0,
      stdout: sanitizeOutput(result.stdout),
      stderr: sanitizeOutput(result.stderr),
      code: result.code,
    }) + '\n'
  );
  writeRawDataFile(`event-task-create.${safeFileName(profileName)}.${safeMessageId}.stdout.json`, sanitizeOutput(result.stdout));
  writeRawDataFile(`event-task-create.${safeFileName(profileName)}.${safeMessageId}.stderr.txt`, sanitizeOutput(result.stderr));
  if (result.code !== 0) {
    eventLastError = summarizeCliFailure(result) || 'Failed to create the task automatically.';
    return;
  }

  const created = parseJsonObject<LarkCreateTaskResponse>(sanitizeOutput(result.stdout));
  if (created?.data?.guid) {
    rememberCreatedTask(profileName, {
      taskGuid: created.data.guid,
      taskUrl: created.data.url,
      messageId,
      chatId: event.chat_id,
      createdAt: Date.now(),
      summary,
    });
    if (isAgentTaskIntent(content)) {
      void intakeAgentTask({
        task: {
          taskGuid: created.data.guid,
          taskTitle: summary,
          taskDescription: description,
          targetAgent: binding.appName || 'DeepOrganiser',
          requiredResponse: 'context_packet',
          language: 'auto',
        },
        // External IM intake records and acknowledges the task only. Local Agent
        // execution must be explicitly delegated by a project leader through
        // delegate_task so Team Mode remains the runtime source of truth.
        autoCreateAgentConversation: false,
        acknowledge: true,
      }).catch((error) => {
        eventLastError = normalizeExecError(error).message;
      });
    }
  }

  const state = readEventState();
  writeEventState({
    ...state,
    taskCreatedCount: (state.taskCreatedCount ?? 0) + 1,
  });
}

async function processIncomingImMessage(
  profileName: string,
  binding: ILarkAutomationBindingRecord,
  event: LarkReceiveEvent
): Promise<void> {
  const content = typeof event.content === 'string' ? event.content.trim() : '';
  const messageId = event.message_id || event.id;
  const chatId = event.chat_id;
  if (!messageId || !chatId || !shouldAutoReplyToImEvent(binding, event, content)) return;
  if (isKnownOutboundImMessage(messageId) || looksLikeRecentOutboundEcho(event, content) || hasProcessedImMessage(messageId)) return;

  addImProcessedMessage(profileName, messageId);
  const eventAt = parseEventTimeMs(event);
  const taskIntent = isTaskIntent(content);
  const agentTaskIntent = isAgentTaskIntent(content);
  const baseSession = getImSession(profileName, event);
  updateImSession(profileName, chatId, (existing) => ({
    ...(existing ?? baseSession),
    chatId,
    chatType: event.chat_type || existing?.chatType,
    senderId: event.sender_id || existing?.senderId,
    updatedAt: Date.now(),
    lastInboundMessageId: messageId,
    lastInboundAt: eventAt,
    lastInboundContent: content.slice(0, 1000),
    messages: [
      ...((existing ?? baseSession).messages ?? []),
      {
        messageId,
        direction: 'inbound',
        content,
        at: eventAt,
      },
    ],
  }));

  let replyContent = '';
  let conversationId: string | undefined;
  let processingError: string | undefined;
  try {
    const prompt = await buildCollaborationPrompt({
      binding,
      event,
      content,
      taskIntent,
      agentTaskIntent,
    });
    conversationId = await getOrCreateImConversation({
      profileName,
      binding,
      event,
      prompt,
    });
    updateImSession(profileName, chatId, (existing) => ({
      ...(existing ?? baseSession),
      conversationId,
      conversationName: `${binding.appName || 'Collaboration Agent'} · Lark chat`,
      updatedAt: Date.now(),
    }));
    const userInput = buildCollaborationUserInput(event, content);
    const startedAt = Date.now();
    await sendMessageToImConversation(conversationId, userInput);
    replyContent =
      (await waitForAssistantReply(conversationId, startedAt)) ||
      buildFallbackImReply({ content, taskIntent, agentTaskIntent });
  } catch (error) {
    processingError = normalizeExecError(error).message;
    replyContent = buildFallbackImReply({ content, taskIntent, agentTaskIntent, error: processingError });
  }

  updateImSession(profileName, chatId, (existing) => ({
    ...(existing ?? baseSession),
    updatedAt: Date.now(),
    pendingOutboundAt: Date.now(),
    pendingOutboundContent: replyContent.slice(0, 1000),
  }));
  const sent = await sendLarkReply(profileName, event, replyContent);
  if (sent.sentMessageId) addImSentMessage(profileName, sent.sentMessageId);
  const outboundAt = Date.now();
  updateImSession(profileName, chatId, (existing) => ({
    ...(existing ?? baseSession),
    conversationId: conversationId ?? existing?.conversationId,
    updatedAt: outboundAt,
    lastOutboundMessageId: sent.sentMessageId,
    lastOutboundAt: outboundAt,
    lastOutboundContent: replyContent.slice(0, 1000),
    pendingOutboundAt: undefined,
    pendingOutboundContent: undefined,
    lastError: sent.ok ? processingError : sent.error || processingError,
    replyCount: (existing?.replyCount ?? baseSession.replyCount ?? 0) + (sent.ok ? 1 : 0),
    messages: [
      ...((existing ?? baseSession).messages ?? []),
      {
        messageId: sent.sentMessageId || `local-reply-${messageId}`,
        direction: 'outbound',
        content: replyContent,
        at: outboundAt,
        larkMessageId: sent.sentMessageId,
        conversationId,
        error: sent.ok ? undefined : sent.error,
      },
    ],
  }));
  if (!sent.ok) {
    eventLastError = sent.error || processingError || eventLastError;
  }
}

async function handleReceiveEvent(profileName: string, binding: ILarkAutomationBindingRecord, event: LarkReceiveEvent): Promise<void> {
  const messageId = event.message_id || event.id || event.event_id || String(Date.now());
  appendRawDataFile(
    `event-receive.${safeFileName(profileName)}.ndjson`,
    JSON.stringify({ at: Date.now(), event }) + '\n'
  );
  writeRawDataFile(`event-receive.${safeFileName(profileName)}.${safeFileName(messageId)}.json`, JSON.stringify(event, null, 2));

  const { duplicate } = persistReceiveEvent(event);
  if (duplicate) return;
  await processIncomingImMessage(profileName, binding, event);
  await createTaskFromEvent(profileName, binding, event);
}

function scheduleEventRestart(profileName: string, appId: string): void {
  if (eventConsumerIntentionalStop) return;
  if (eventRestartTimer) clearTimeout(eventRestartTimer);
  const delay = Math.min(EVENT_RESTART_DELAY_MS * Math.max(1, eventRestartCount + 1), EVENT_MAX_RESTART_DELAY_MS);
  eventRestartTimer = setTimeout(() => {
    eventRestartTimer = null;
    const binding = readBindingRecord();
    if (!binding || binding.profileName !== profileName || binding.appId !== appId) return;
    void startEventListenerForBinding(binding, { reason: 'restart' });
  }, delay);
}

function stopEventListener(): void {
  eventConsumerIntentionalStop = true;
  if (eventRestartTimer) {
    clearTimeout(eventRestartTimer);
    eventRestartTimer = null;
  }
  if (eventBackfillTimer) {
    clearTimeout(eventBackfillTimer);
    eventBackfillTimer = null;
  }
  const child = eventConsumer;
  eventConsumer = null;
  eventConsumerProfile = null;
  eventConsumerAppId = null;
  eventStartedAt = undefined;
  eventReadyAt = undefined;
  eventStdoutBuffer = '';
  if (child && !child.killed) {
    child.kill('SIGTERM');
  }
}

function handleEventStdout(profileName: string, binding: ILarkAutomationBindingRecord, chunk: Buffer | string): void {
  eventStdoutBuffer += chunk.toString();
  const lines = eventStdoutBuffer.split(/\r?\n/);
  eventStdoutBuffer = lines.pop() ?? '';
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    const event = parseJsonObject<LarkReceiveEvent>(text);
    if (!event) {
      appendRawDataFile(
        `event-receive.${safeFileName(profileName)}.invalid.ndjson`,
        JSON.stringify({ at: Date.now(), line: text }) + '\n'
      );
      continue;
    }
    void handleReceiveEvent(profileName, binding, event).catch((error) => {
      eventLastError = normalizeExecError(error).message;
      appendRawDataFile(
        `event-receive.${safeFileName(profileName)}.errors.ndjson`,
        JSON.stringify({ at: Date.now(), error: eventLastError, event }) + '\n'
      );
    });
  }
}

function handleEventStderr(profileName: string, chunk: Buffer | string): void {
  const text = chunk.toString();
  appendRawDataFile(`event-consume.${safeFileName(profileName)}.stderr.log`, text);
  if (text.includes(`[event] ready event_key=${EVENT_KEY_MESSAGE_RECEIVE}`)) {
    eventReadyAt = Date.now();
    eventLastError = undefined;
  }
  const error = parseJsonObject<LarkApiErrorJson>(text);
  const message = error?.error?.message || error?.error?.subtype || error?.error?.type;
  if (message) {
    eventLastError = message;
  }
}

async function backfillKnownChats(profileName: string, binding: ILarkAutomationBindingRecord): Promise<void> {
  if (eventBackfillRunning) return;
  const state = readEventState();
  const chats = Object.values(state.knownChats ?? {}).filter((chat) => chat.chatId);
  if (!chats.length) return;

  eventBackfillRunning = true;
  try {
    const now = Date.now();
    const startMs = Math.max(0, (state.lastEventAt ?? now) - EVENT_BACKFILL_WINDOW_MS);
    const start = new Date(startMs).toISOString();
    const end = new Date(now + 60_000).toISOString();
    for (const chat of chats.slice(-20)) {
      const result = await runLarkCliSafe(
        withProfile(
          [
            'im',
            '+chat-messages-list',
            '--chat-id',
            chat.chatId,
            '--start',
            start,
            '--end',
            end,
            '--order',
            'asc',
            '--page-size',
            '50',
            '--no-reactions',
            '--as',
            'bot',
            '--json',
          ],
          profileName
        ),
        25_000
      );
      appendRawDataFile(
        `event-backfill.${safeFileName(profileName)}.ndjson`,
        JSON.stringify({
          at: Date.now(),
          chatId: chat.chatId,
          ok: result.code === 0,
          code: result.code,
          stdout: sanitizeOutput(result.stdout),
          stderr: sanitizeOutput(result.stderr),
        }) + '\n'
      );
      if (result.code !== 0) {
        eventLastError = summarizeCliFailure(result) || eventLastError;
        continue;
      }
      const history = parseJsonObject<LarkMessageHistoryResponse>(sanitizeOutput(result.stdout));
      for (const message of history?.messages ?? []) {
        if (!message.message_id || message.deleted) continue;
        const event: LarkReceiveEvent = {
          type: EVENT_KEY_MESSAGE_RECEIVE,
          event_id: `backfill:${message.message_id}`,
          message_id: message.message_id,
          id: message.message_id,
          chat_id: chat.chatId,
          chat_type: chat.chatType,
          sender_id: message.sender?.open_id || message.sender?.id,
          message_type: message.msg_type,
          content: message.content,
          create_time: String(message.create_time ?? Date.now()),
          timestamp: String(Date.now()),
        };
        await handleReceiveEvent(profileName, binding, event);
      }
    }
    writeEventState({ ...readEventState(), lastBackfillAt: Date.now() });
  } finally {
    eventBackfillRunning = false;
  }
}

async function seedKnownChatsForBinding(profileName: string, binding: ILarkAutomationBindingRecord): Promise<void> {
  const targetName = (binding.appName || 'DeepOrganiser').trim();
  if (!targetName) return;

  const result = await runLarkCliSafe(
    withProfile(['im', '+chat-list', '--as', 'user', '--types=p2p,group', '--page-size', '50', '--json'], profileName),
    20_000
  );
  appendRawDataFile(
    `event-chat-seed.${safeFileName(profileName)}.ndjson`,
    JSON.stringify({
      at: Date.now(),
      ok: result.code === 0,
      code: result.code,
      stdout: sanitizeOutput(result.stdout),
      stderr: sanitizeOutput(result.stderr),
    }) + '\n'
  );
  if (result.code !== 0) {
    eventLastError = summarizeCliFailure(result) || eventLastError;
    return;
  }

  const list = parseJsonObject<LarkChatListResponse>(sanitizeOutput(result.stdout));
  const chats = list?.data?.chats ?? [];
  const matched = chats.find((chat) => {
    const nameMatches = chat.name?.trim() === targetName;
    return nameMatches && chat.chat_id && chat.chat_mode === 'p2p' && chat.p2p_target_type === 'bot';
  });
  if (!matched?.chat_id) return;

  const state = readEventState();
  writeEventState({
    ...state,
    knownChats: {
      ...state.knownChats,
      [matched.chat_id]: {
        chatId: matched.chat_id,
        chatType: 'p2p',
        lastMessageAt: state.knownChats?.[matched.chat_id]?.lastMessageAt,
        lastMessageId: state.knownChats?.[matched.chat_id]?.lastMessageId,
        lastSenderId: state.knownChats?.[matched.chat_id]?.lastSenderId,
        lastContent: state.knownChats?.[matched.chat_id]?.lastContent,
      },
    },
  });
}

function scheduleBackfill(profileName: string, binding: ILarkAutomationBindingRecord): void {
  if (eventBackfillTimer) clearTimeout(eventBackfillTimer);
  eventBackfillTimer = setTimeout(() => {
    eventBackfillTimer = null;
    void seedKnownChatsForBinding(profileName, binding)
      .then(() => backfillKnownChats(profileName, binding))
      .catch((error) => {
        eventLastError = normalizeExecError(error).message;
      });
  }, 3_000);
}

async function startEventListenerForBinding(
  binding: ILarkAutomationBindingRecord,
  options: { reason: 'binding' | 'startup' | 'restart' | 'manual' }
): Promise<LarkAutomationEventListenerStatus> {
  const profileName = binding.profileName;
  const appId = binding.appId;
  if (!profileName || !appId || !binding.userReady || !binding.botReady) {
    return getEventListenerStatus();
  }
  if (eventConsumer && eventConsumerProfile === profileName && eventConsumerAppId === appId && !eventConsumer.killed) {
    scheduleBackfill(profileName, binding);
    configureProjectAgent({ profileName });
    startProjectAgentEventListener();
    return getEventListenerStatus();
  }

  if (eventConsumer) {
    stopEventListener();
  }

  eventConsumerIntentionalStop = false;
  eventConsumerProfile = profileName;
  eventConsumerAppId = appId;
  eventStartedAt = Date.now();
  eventReadyAt = undefined;
  eventLastExitAt = undefined;
  eventStdoutBuffer = '';
  if (options.reason !== 'binding' && options.reason !== 'startup') {
    eventRestartCount += 1;
  }

  const child = spawn(LARK_CLI, withProfile(['event', 'consume', EVENT_KEY_MESSAGE_RECEIVE, '--as', 'bot'], profileName), {
    env: buildCliEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  eventConsumer = child;
  child.stdin.write('\n');
  configureProjectAgent({ profileName });
  startProjectAgentEventListener();

  child.stdout.on('data', (chunk) => handleEventStdout(profileName, binding, chunk));
  child.stderr.on('data', (chunk) => handleEventStderr(profileName, chunk));
  child.on('error', (error) => {
    eventLastError = error.message;
    appendRawDataFile(
      `event-consume.${safeFileName(profileName)}.errors.ndjson`,
      JSON.stringify({ at: Date.now(), error: error.message }) + '\n'
    );
  });
  child.on('close', (code) => {
    eventLastExitAt = Date.now();
    const isCurrentConsumer = eventConsumer === child;
    appendRawDataFile(
      `event-consume.${safeFileName(profileName)}.exits.ndjson`,
      JSON.stringify({ at: eventLastExitAt, code, intentional: eventConsumerIntentionalStop }) + '\n'
    );
    if (isCurrentConsumer) {
      eventConsumer = null;
      eventReadyAt = undefined;
      eventStdoutBuffer = '';
    }
    if (isCurrentConsumer && !eventConsumerIntentionalStop) {
      scheduleEventRestart(profileName, appId);
    }
  });

  scheduleBackfill(profileName, binding);
  return getEventListenerStatus();
}

function ensureEventListenerFromSavedBinding(reason: 'startup' | 'manual' = 'startup'): void {
  const binding = readBindingRecord();
  if (!binding?.profileName || !binding.appId || !binding.userReady || !binding.botReady) return;
  void verifyTaskAccess(binding.profileName)
    .then((taskAccess) => {
      if (!taskAccess.ok) {
        eventLastError =
          taskAccess.error ||
          'Task access is not available. Re-authorize the collaboration account with task permissions.';
        return;
      }
      configureProjectAgent({ profileName: binding.profileName });
      startProjectAgentEventListener();
      void startEventListenerForBinding(binding, { reason }).catch((error) => {
        eventLastError = normalizeExecError(error).message;
      });
    })
    .catch((error) => {
      eventLastError = normalizeExecError(error).message;
    });
}

function isValidProfileName(profileName?: string): profileName is string {
  return Boolean(profileName && /^[A-Za-z0-9._:-]+$/.test(profileName));
}

function readSelectedProfile(): string {
  try {
    const statePath = getProfileStatePath();
    if (!existsSync(statePath)) return DEFAULT_PROFILE;
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as ProfileState;
    return isValidProfileName(state.selectedProfile) ? state.selectedProfile : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function writeSelectedProfile(profileName: string): void {
  if (!isValidProfileName(profileName)) {
    throw new Error('invalid profile name');
  }
  const statePath = getProfileStatePath();
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ selectedProfile: profileName }, null, 2));
}

function resolveProfileName(profileName?: string): string {
  if (isValidProfileName(profileName)) return profileName;
  return readSelectedProfile();
}

function withProfile(args: string[], profileName?: string): string[] {
  return ['--profile', resolveProfileName(profileName), ...args];
}

async function getCliVersion(): Promise<string | undefined> {
  const result = await runLarkCli(['--version'], 10_000);
  return (
    sanitizeOutput(result.stdout || result.stderr)
      .replace(/^lark-cli version\s*/i, '')
      .trim() || undefined
  );
}

async function getConfigStatus(profileName = readSelectedProfile()): Promise<Partial<ILarkAutomationStatus>> {
  try {
    const result = await runLarkCli(withProfile(['config', 'show'], profileName), 10_000);
    const output = sanitizeOutput(`${result.stdout}\n${result.stderr}`);
    const json = parseJsonObject<ConfigShowJson>(output);
    const pathMatch = output.match(/Config file path:\s*(.+)$/m);
    return {
      configReady: Boolean(json?.appId || output.includes('"appId"')),
      profileName: json?.profile || profileName,
      appId: json?.appId,
      brand: json?.brand,
      workspace: json?.workspace,
      configPath: pathMatch?.[1]?.trim(),
      statusText: output,
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    return {
      configReady: false,
      profileName,
      statusText: sanitizeOutput(`${error.stdout ?? ''}\n${error.stderr ?? error.message}`),
    };
  }
}

function userIdentityAuthenticated(identity?: ILarkAutomationIdentityStatus): boolean {
  if (!identity?.available) return false;
  const status = identity.status?.toLowerCase() ?? '';
  return status === 'ready' || status === 'needs_refresh';
}

async function verifyTaskAccess(profileName = readSelectedProfile()): Promise<{
  ok: boolean;
  error?: string;
  rawDataFiles?: string[];
}> {
  const rawDataFiles: string[] = [];
  const safeName = safeFileName(profileName);
  const result = await runLarkCliSafe(
    withProfile(['task', 'tasklists', 'list', '--as', 'user', '--page-size', '1', '--json'], profileName),
    20_000
  );
  rawDataFiles.push(writeRawDataFile(`binding-task-access.${safeName}.stdout.json`, sanitizeOutput(result.stdout)));
  rawDataFiles.push(writeRawDataFile(`binding-task-access.${safeName}.stderr.txt`, sanitizeOutput(result.stderr)));
  rawDataFiles.push(writeRawDataFile(`binding-task-access.${safeName}.exitcode.txt`, String(result.code)));
  if (result.code !== 0) {
    return {
      ok: false,
      error:
        summarizeCliFailure(result) ||
        'Task access is not available. Re-authorize the collaboration account with task permissions.',
      rawDataFiles,
    };
  }
  return { ok: true, rawDataFiles };
}

async function getAuthStatus(profileName = readSelectedProfile()): Promise<Partial<ILarkAutomationStatus>> {
  try {
    const result = await runLarkCli(withProfile(['auth', 'status', '--json'], profileName), 10_000);
    const output = sanitizeOutput(`${result.stdout}\n${result.stderr}`);
    const json = parseJsonObject<AuthStatusJson>(output);
    const user = json?.identities?.user;
    const bot = json?.identities?.bot;
    return {
      appId: json?.appId,
      brand: json?.brand,
      profileName,
      authenticated: userIdentityAuthenticated(user),
      identity: json?.identity,
      user,
      bot,
      statusText: output,
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    return {
      authenticated: false,
      profileName,
      statusText: sanitizeOutput(`${error.stdout ?? ''}\n${error.stderr ?? error.message}`),
    };
  }
}

async function getStatus(): Promise<ILarkAutomationStatus> {
  try {
    const cliVersion = await getCliVersion();
    const profileName = readSelectedProfile();
    const [config, auth] = await Promise.all([getConfigStatus(profileName), getAuthStatus(profileName)]);
    const userReady = Boolean(auth.authenticated);
    const taskAccess = userReady
      ? await verifyTaskAccess(profileName)
      : {
          ok: false,
          error: 'User authorization is missing or expired. Re-authorize the collaboration account.',
        };
    const binding = readBindingRecord();
    const bindingReady = Boolean(
      binding?.profileName === profileName &&
        binding.appId === (auth.appId ?? config.appId) &&
        binding.userReady &&
        binding.botReady &&
        taskAccess.ok
    );
    return {
      cliInstalled: true,
      cliVersion,
      configReady: Boolean(config.configReady || auth.appId),
      profileName: config.profileName ?? auth.profileName ?? profileName,
      appId: auth.appId ?? config.appId,
      brand: auth.brand ?? config.brand,
      workspace: config.workspace,
      configPath: config.configPath,
      authenticated: userReady && taskAccess.ok,
      bindingReady,
      binding,
      identity: auth.identity,
      user: auth.user,
      bot: auth.bot,
      taskAccessReady: taskAccess.ok,
      taskAccessError: taskAccess.ok ? undefined : taskAccess.error,
      eventListener: getEventListenerStatus(),
      statusText: auth.statusText ?? config.statusText,
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    return {
      cliInstalled: false,
      configReady: false,
      profileName: readSelectedProfile(),
      authenticated: false,
      bindingReady: false,
      binding: readBindingRecord(),
      eventListener: getEventListenerStatus(),
      error: error.code === 'ENOENT' ? 'lark-cli not found' : error.message,
      statusText: sanitizeOutput(`${error.stdout ?? ''}\n${error.stderr ?? error.message}`),
    };
  }
}

function appDetailFromJson(json: ApplicationDetailJson | null): Partial<ILarkAutomationBindingRecord> {
  const appDetailData = json?.data?.app;
  return {
    appId: appDetailData?.app_id ?? '',
    appName: appDetailData?.app_name,
    appAvatarUrl: appDetailData?.avatar_url,
  };
}

async function collectApplicationDetail(
  profileName: string,
  appId: string,
  rawDataFiles: string[]
): Promise<Partial<ILarkAutomationBindingRecord>> {
  const safeName = safeFileName(profileName);
  const result = await runLarkCliSafe(
    withProfile(
      ['api', 'GET', `/open-apis/application/v6/applications/${appId}`, '--params', '{"lang":"zh_cn"}', '--as', 'bot', '--json'],
      profileName
    ),
    20_000
  );
  rawDataFiles.push(writeRawDataFile(`binding-application.${safeName}.stdout.json`, sanitizeOutput(result.stdout)));
  rawDataFiles.push(writeRawDataFile(`binding-application.${safeName}.stderr.txt`, sanitizeOutput(result.stderr)));
  rawDataFiles.push(writeRawDataFile(`binding-application.${safeName}.exitcode.txt`, String(result.code)));
  if (result.code !== 0) {
    throw new Error(summarizeCliFailure(result) || 'Failed to verify application details.');
  }
  const detail = appDetailFromJson(parseJsonObject<ApplicationDetailJson>(sanitizeOutput(result.stdout)));
  return {
    appId: detail.appId || appId,
    appName: detail.appName,
    appAvatarUrl: detail.appAvatarUrl,
  };
}

async function collectCurrentUser(
  profileName: string,
  rawDataFiles: string[]
): Promise<Pick<ILarkAutomationBindingRecord, 'userName' | 'openId' | 'tenantKey'>> {
  const safeName = safeFileName(profileName);
  const result = await runLarkCliSafe(withProfile(['contact', '+get-user', '--as', 'user', '--json'], profileName), 20_000);
  rawDataFiles.push(writeRawDataFile(`binding-current-user.${safeName}.stdout.json`, sanitizeOutput(result.stdout)));
  rawDataFiles.push(writeRawDataFile(`binding-current-user.${safeName}.stderr.txt`, sanitizeOutput(result.stderr)));
  rawDataFiles.push(writeRawDataFile(`binding-current-user.${safeName}.exitcode.txt`, String(result.code)));
  if (result.code !== 0) {
    throw new Error(summarizeCliFailure(result) || 'Failed to verify user identity.');
  }
  const json = parseJsonObject<CurrentUserJson>(sanitizeOutput(result.stdout));
  const user = json?.data?.user ?? json?.data;
  return {
    userName: user?.name,
    openId: user?.open_id,
    tenantKey: user?.tenant_key,
  };
}

async function syncProjects(request?: { profileName?: string }): Promise<ILarkAutomationProjectsResult> {
  const profileName = resolveProfileName(request?.profileName);
  const rawDataFiles: string[] = [];
  const state = readProjectState();
  try {
    const tasklistsResult = await runLarkCliSafe(
      withProfile(['task', 'tasklists', 'list', '--as', 'user', '--page-all', '--page-size', '100', '--json'], profileName),
      30_000
    );
    rawDataFiles.push(
      writeRawDataFile(`project-tasklists.${safeFileName(profileName)}.stdout.json`, sanitizeOutput(tasklistsResult.stdout))
    );
    rawDataFiles.push(
      writeRawDataFile(`project-tasklists.${safeFileName(profileName)}.stderr.txt`, sanitizeOutput(tasklistsResult.stderr))
    );
    if (tasklistsResult.code !== 0) {
      throw new Error(summarizeCliFailure(tasklistsResult) || 'Failed to read tasklists.');
    }

    const tasklists = extractTasklists(parseJsonObject<LarkTasklistsResponse>(sanitizeOutput(tasklistsResult.stdout)));
    const tasklistNameByGuid = new Map<string, string>();
    for (const tasklist of tasklists) {
      if (tasklist.guid) {
        tasklistNameByGuid.set(tasklist.guid, tasklist.name || 'Untitled tasklist');
      }
    }

    const allTasks = new Map<string, ILarkAutomationProjectTask>();
    await Promise.all(
      tasklists.map(async (tasklist) => {
        if (!tasklist.guid) return;
        const result = await runLarkCliSafe(
          withProfile(
            [
              'task',
              'tasklists',
              'tasks',
              '--as',
              'user',
              '--tasklist-guid',
              tasklist.guid,
              '--page-all',
              '--page-size',
              '100',
              '--json',
            ],
            profileName
          ),
          30_000
        );
        rawDataFiles.push(
          writeRawDataFile(
            `project-tasklist-tasks.${safeFileName(profileName)}.${safeFileName(tasklist.guid)}.stdout.json`,
            sanitizeOutput(result.stdout)
          )
        );
        rawDataFiles.push(
          writeRawDataFile(
            `project-tasklist-tasks.${safeFileName(profileName)}.${safeFileName(tasklist.guid)}.stderr.txt`,
            sanitizeOutput(result.stderr)
          )
        );
        if (result.code !== 0) {
          eventLastError = summarizeCliFailure(result) || eventLastError;
          return;
        }
        for (const task of extractTasks(parseJsonObject<LarkTasksResponse>(sanitizeOutput(result.stdout)))) {
          if (task.guid && (!task.tasklists || task.tasklists.length === 0)) {
            task.tasklists = [{ tasklist_guid: tasklist.guid }];
          }
          upsertTask(allTasks, normalizeProjectTask(task, tasklistNameByGuid, state));
        }
      })
    );

    const relatedResult = await runLarkCliSafe(
      withProfile(['task', '+get-related-tasks', '--as', 'user', '--page-all', '--json'], profileName),
      45_000
    );
    rawDataFiles.push(
      writeRawDataFile(`project-related-tasks.${safeFileName(profileName)}.stdout.json`, sanitizeOutput(relatedResult.stdout))
    );
    rawDataFiles.push(
      writeRawDataFile(`project-related-tasks.${safeFileName(profileName)}.stderr.txt`, sanitizeOutput(relatedResult.stderr))
    );
    if (relatedResult.code === 0) {
      for (const task of extractTasks(parseJsonObject<LarkTasksResponse>(sanitizeOutput(relatedResult.stdout)))) {
        upsertTask(allTasks, normalizeProjectTask(task, tasklistNameByGuid, state));
      }
    } else {
      eventLastError = summarizeCliFailure(relatedResult) || eventLastError;
    }

    const tasks = Array.from(allTasks.values()).toSorted((a, b) => {
      const aTime = Date.parse(a.updatedAt || a.createdAt || '') || 0;
      const bTime = Date.parse(b.updatedAt || b.createdAt || '') || 0;
      return bTime - aTime;
    });
    const agentTasks = tasks.filter((task) => task.isAgentTask || task.tasklistGuids.length === 0);
    const buckets: ILarkAutomationProjectBucket[] = [
      {
        id: 'agent',
        kind: 'agent',
        name: 'Agent inbox',
        tasks: agentTasks,
        ...summarizeBucketTasks(agentTasks),
      },
      ...tasklists
        .filter((tasklist) => tasklist.guid)
        .map((tasklist) => {
          const bucketTasks = tasks.filter((task) => task.tasklistGuids.includes(tasklist.guid as string));
          return {
            id: `tasklist:${tasklist.guid}`,
            kind: 'tasklist' as const,
            name: tasklist.name || 'Untitled tasklist',
            tasklistGuid: tasklist.guid,
            url: tasklist.url,
            ownerName: tasklist.owner?.name,
            tasks: bucketTasks,
            ...summarizeBucketTasks(bucketTasks),
          };
        }),
    ];

	    const syncedAt = Date.now();
	    writeProjectState({
	      ...state,
	      profileName,
	      syncedAt,
	      buckets,
	    });
	    void upsertLocalTasklistsFromSync(
	      tasklists
	        .filter((tasklist) => tasklist.guid)
	        .map((tasklist) => ({
	          guid: tasklist.guid,
	          name: tasklist.name || 'Untitled tasklist',
	          url: tasklist.url,
	          ownerName: tasklist.owner?.name,
	        })),
	      syncedAt
	    ).catch((error) => {
	      eventLastError = normalizeExecError(error).message;
	    });

	    return {
	      ok: true,
      profileName,
      syncedAt,
      buckets,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    const cached = readProjectState();
    return {
      ok: false,
      profileName,
      syncedAt: cached.syncedAt,
      fromCache: Boolean(cached.buckets?.length),
      buckets: cached.buckets ?? [],
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error: error.message,
    };
  }
}

async function getProjects(): Promise<ILarkAutomationProjectsResult> {
  const state = readProjectState();
  if (Array.isArray(state.buckets)) {
    void syncProjects({ profileName: state.profileName }).catch((error) => {
      eventLastError = normalizeExecError(error).message;
    });
    return {
      ok: true,
      profileName: state.profileName ?? readSelectedProfile(),
      syncedAt: state.syncedAt,
      fromCache: true,
      buckets: state.buckets,
      rawDataDir: getRawDataDir(),
    };
  }
  const profileName = readSelectedProfile();
  void syncProjects({ profileName }).catch((error) => {
    eventLastError = normalizeExecError(error).message;
  });
  return {
    ok: true,
    profileName,
    buckets: [],
    rawDataDir: getRawDataDir(),
  };
}

function extractTasklistCreate(json: LarkTasklistCreateResponse | null): LarkTasklistRecord | undefined {
  const tasklist = json?.data?.tasklist ?? json?.tasklist;
  if (tasklist?.guid || tasklist?.name || tasklist?.url) return tasklist;
  const guid = json?.data?.guid ?? json?.guid;
  const name = json?.data?.name ?? json?.name;
  const url = json?.data?.url ?? json?.url;
  if (!guid && !name && !url) return undefined;
  return { guid, name, url };
}

async function createTasklist(request: ILarkAutomationCreateTasklistRequest): Promise<ILarkAutomationCreateTasklistResult> {
  const profileName = resolveProfileName(request.profileName);
  const rawDataFiles: string[] = [];
  const name = request.name.trim();
  if (!name) {
    return {
      ok: false,
      profileName,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error: 'Tasklist name is required.',
    };
  }

  try {
    const args = withProfile(['task', '+tasklist-create', '--as', 'user', '--name', name, '--json'], profileName);
    const memberOpenIds = Array.from(new Set((request.memberOpenIds ?? []).map((item) => item.trim()).filter(Boolean)));
    if (memberOpenIds.length > 0) {
      args.push('--member', memberOpenIds.join(','));
    }

    const result = await runLarkCliSafe(args, 30_000);
    rawDataFiles.push(writeRawDataFile(`project-tasklist-create.${safeFileName(profileName)}.stdout.json`, sanitizeOutput(result.stdout)));
    rawDataFiles.push(writeRawDataFile(`project-tasklist-create.${safeFileName(profileName)}.stderr.txt`, sanitizeOutput(result.stderr)));
    if (result.code !== 0) {
      throw new Error(summarizeCliFailure(result) || 'Failed to create the tasklist.');
    }

	    const tasklist = extractTasklistCreate(parseJsonObject<LarkTasklistCreateResponse>(sanitizeOutput(result.stdout)));
	    if (tasklist?.guid) {
	      void upsertLocalTasklistConfig({
	        guid: tasklist.guid,
	        name: tasklist.name || name,
	        url: tasklist.url,
	        visible: true,
	        lastSyncedAt: Date.now(),
	      }).catch((error) => {
	        eventLastError = normalizeExecError(error).message;
	      });
	    }
	    void syncProjects({ profileName }).catch((error) => {
	      eventLastError = normalizeExecError(error).message;
	    });
    return {
      ok: true,
      profileName,
      tasklistGuid: tasklist?.guid,
      name: tasklist?.name || name,
      url: tasklist?.url,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    return {
      ok: false,
      profileName,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error: error.message,
    };
  }
}

async function syncContacts(request?: { profileName?: string }): Promise<ILarkAutomationContactsResult> {
  const profileName = resolveProfileName(request?.profileName);
  const rawDataFiles: string[] = [];
  let directoryError: string | undefined;

  try {
    const contacts = await collectDirectoryContacts(profileName, rawDataFiles);
    const syncedAt = Date.now();
    writeContactState({
      profileName,
      syncedAt,
      source: 'lark-directory',
      limited: false,
      contacts,
    });
    return {
      ok: true,
      profileName,
      syncedAt,
      source: 'lark-directory',
      limited: false,
      contacts,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
    };
  } catch (rawError) {
    directoryError = normalizeExecError(rawError).message;
  }

  try {
    const [chattedContacts, currentUser] = await Promise.all([
      searchLarkContacts(profileName, rawDataFiles),
      collectCurrentUserContact(profileName, rawDataFiles),
    ]);
    const contacts = mergeContacts([...chattedContacts, ...(currentUser ? [currentUser] : [])]);
    const syncedAt = Date.now();
    writeContactState({
      profileName,
      syncedAt,
      source: 'lark-search',
      limited: true,
      contacts,
      error: directoryError,
    });
    return {
      ok: true,
      profileName,
      syncedAt,
      source: 'lark-search',
      limited: true,
      contacts,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error: directoryError,
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    const cached = readContactState();
    return {
      ok: false,
      profileName,
      syncedAt: cached.syncedAt,
      fromCache: Boolean(cached.contacts?.length),
      limited: cached.limited,
      source: cached.source ?? 'lark-search',
      contacts: cached.contacts ?? [],
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error: [directoryError, error.message].filter(Boolean).join('\n'),
    };
  }
}

async function getContacts(): Promise<ILarkAutomationContactsResult> {
  const state = readContactState();
  if (state.contacts?.length) {
    void syncContacts({ profileName: state.profileName }).catch((error) => {
      eventLastError = normalizeExecError(error).message;
    });
    return {
      ok: true,
      profileName: state.profileName ?? readSelectedProfile(),
      syncedAt: state.syncedAt,
      fromCache: true,
      limited: state.limited,
      source: 'cache',
      contacts: state.contacts,
      rawDataDir: getRawDataDir(),
      error: state.error,
    };
  }
  return syncContacts();
}

async function searchContacts(request: { profileName?: string; query?: string }): Promise<ILarkAutomationContactsResult> {
  const profileName = resolveProfileName(request.profileName);
  const rawDataFiles: string[] = [];
  try {
    const query = request.query?.trim();
    const [searched, currentUser] = await Promise.all([
      searchLarkContacts(profileName, rawDataFiles, query),
      query ? Promise.resolve(undefined) : collectCurrentUserContact(profileName, rawDataFiles),
    ]);
    const state = readContactState();
    const contacts = mergeContacts([...(state.contacts ?? []), ...searched, ...(currentUser ? [currentUser] : [])]);
    const syncedAt = Date.now();
    writeContactState({
      profileName,
      syncedAt,
      source: state.source ?? 'lark-search',
      limited: state.limited ?? true,
      contacts,
      error: state.error,
    });
    return {
      ok: true,
      profileName,
      syncedAt,
      source: 'lark-search',
      limited: state.limited ?? true,
      contacts: query ? searched : contacts,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error: state.error,
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    const state = readContactState();
    return {
      ok: false,
      profileName,
      syncedAt: state.syncedAt,
      fromCache: Boolean(state.contacts?.length),
      limited: state.limited,
      source: state.source ?? 'lark-search',
      contacts: state.contacts ?? [],
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error: error.message,
    };
  }
}

async function getChannelPluginsSafe(): Promise<Array<Record<string, unknown>>> {
  try {
    return await httpRequest<Array<Record<string, unknown>>>('GET', '/api/channel/plugins');
  } catch {
    return [];
  }
}

async function verifyAndPersistBinding(profileName = readSelectedProfile()): Promise<ILarkAutomationChannelSyncResult> {
  const rawDataFiles: string[] = [];
  writeSelectedProfile(profileName);
  const [config, auth] = await Promise.all([getConfigStatus(profileName), getAuthStatus(profileName)]);
  const appId = auth.appId ?? config.appId;
  const userReady = userIdentityAuthenticated(auth.user);
  const botReady = Boolean(auth.bot?.available && auth.bot.status?.toLowerCase() === 'ready');

  if (!appId) {
    return {
      ok: false,
      profileName,
      bindingReady: false,
      manualSecretRequired: false,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error: 'No App ID was detected. Finish application setup first.',
    };
  }

  if (!userReady || !botReady) {
    return {
      ok: false,
      profileName,
      appId,
      bindingReady: false,
      manualSecretRequired: false,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error: !userReady
        ? 'User authorization is not complete. Finish step 3 first.'
        : 'The bot identity is not ready. Check the application setup.',
    };
  }

  const taskAccess = await verifyTaskAccess(profileName);
  rawDataFiles.push(...(taskAccess.rawDataFiles ?? []));
  if (!taskAccess.ok) {
    return {
      ok: false,
      profileName,
      appId,
      bindingReady: false,
      manualSecretRequired: false,
      taskAccessReady: false,
      taskAccessError: taskAccess.error,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error:
        taskAccess.error ||
        'Task access is not available. Re-authorize the collaboration account with task permissions.',
    };
  }

  try {
    const [appDetail, currentUser, plugins] = await Promise.all([
      collectApplicationDetail(profileName, appId, rawDataFiles),
      collectCurrentUser(profileName, rawDataFiles),
      getChannelPluginsSafe(),
    ]);
    const larkPlugin = plugins.find((plugin) => (plugin.type ?? plugin.plugin_type) === 'lark');
    const now = Date.now();
    const previous = readBindingRecord();
    const binding: ILarkAutomationBindingRecord = {
      source: 'lark-cli-profile',
      profileName,
      appId: appDetail.appId || appId,
      appName: appDetail.appName,
      appAvatarUrl: appDetail.appAvatarUrl,
      brand: auth.brand ?? config.brand,
      userName: currentUser.userName ?? auth.user?.userName,
      openId: currentUser.openId ?? auth.user?.openId,
      tenantKey: currentUser.tenantKey,
      userReady,
      botReady,
      channelPluginEnabled: Boolean(larkPlugin?.enabled || larkPlugin?.connected || larkPlugin?.has_token),
      verifiedAt: now,
      updatedAt: now,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      ...(previous?.profileName === profileName && previous.appId === appId ? { verifiedAt: previous.verifiedAt } : {}),
    };
    writeBindingRecord(binding);
    rawDataFiles.push(writeRawDataFile(`binding-state.${safeFileName(profileName)}.json`, JSON.stringify(binding, null, 2)));
    void syncProjects({ profileName }).catch((error) => {
      eventLastError = normalizeExecError(error).message;
    });
    return {
      ok: true,
      profileName,
      appId: binding.appId,
      appName: binding.appName,
      bindingReady: true,
      binding,
      channelEnabled: binding.channelPluginEnabled,
      legacyChannelSecretRequired: !binding.channelPluginEnabled,
      manualSecretRequired: false,
      taskAccessReady: true,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      message: binding.channelPluginEnabled
        ? 'Verified and enabled Channels.'
        : 'Verified with lark-cli and completed the local binding. Add App Secret only if legacy Channels need to receive bot events.',
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    return {
      ok: false,
      profileName,
      appId,
      bindingReady: false,
      manualSecretRequired: false,
      taskAccessReady: taskAccess.ok,
      taskAccessError: taskAccess.ok ? undefined : taskAccess.error,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      error: error.message,
    };
  }
}

async function qrcodeAscii(verificationUrl: string): Promise<string | undefined> {
  try {
    const result = await runLarkCli(['auth', 'qrcode', verificationUrl, '--ascii'], 10_000);
    return sanitizeOutput(result.stdout || result.stderr);
  } catch {
    return undefined;
  }
}

async function startConfig(): Promise<ILarkAutomationStartAuthResult> {
  try {
    const profileName = DEFAULT_PROFILE;
    const result = await runLarkCliUntilUrl(['config', 'init', '--new', '--name', profileName]);
    writeSelectedProfile(profileName);
    const output = sanitizeOutput(`${result.stdout}\n${result.stderr}`);
    const verificationUrl = extractUrl(output);
    return {
      ok: Boolean(verificationUrl),
      profileName,
      verificationUrl,
      qrcodeAscii: verificationUrl ? await qrcodeAscii(verificationUrl) : undefined,
      rawOutput: output,
      message: verificationUrl ? undefined : output,
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    const output = sanitizeOutput(`${error.stdout ?? ''}\n${error.stderr ?? error.message}`);
    const verificationUrl = extractUrl(output);
    return {
      ok: Boolean(verificationUrl),
      profileName: DEFAULT_PROFILE,
      verificationUrl,
      qrcodeAscii: verificationUrl ? await qrcodeAscii(verificationUrl) : undefined,
      rawOutput: output,
      error: verificationUrl ? undefined : output || error.message,
    };
  }
}

function buildAuthArgs(request?: ILarkAutomationStartAuthRequest): string[] {
  const args = withProfile(['auth', 'login', '--no-wait', '--json'], request?.profileName);
  if (request?.scope?.trim()) {
    args.push('--scope', request.scope.trim());
  } else if (request?.domain?.trim()) {
    args.push('--domain', request.domain.trim());
  } else if (request?.recommend !== false) {
    args.push('--recommend');
  }
  return args;
}

async function startAuth(request?: ILarkAutomationStartAuthRequest): Promise<ILarkAutomationStartAuthResult> {
  try {
    const profileName = resolveProfileName(request?.profileName);
    writeSelectedProfile(profileName);
    const result = await runLarkCli(buildAuthArgs(request), EXEC_TIMEOUT_MS);
    const output = sanitizeOutput(`${result.stdout}\n${result.stderr}`);
    const json = parseJsonObject<NoWaitAuthJson>(output);
    const verificationUrl =
      json?.verification_url ?? json?.verification_uri_complete ?? json?.verification_uri ?? extractUrl(output);
    return {
      ok: Boolean(verificationUrl && json?.device_code),
      profileName,
      verificationUrl,
      deviceCode: json?.device_code,
      qrcodeAscii: verificationUrl ? await qrcodeAscii(verificationUrl) : undefined,
      rawOutput: output,
      message: json?.message,
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    const output = sanitizeOutput(`${error.stdout ?? ''}\n${error.stderr ?? error.message}`);
    const json = parseJsonObject<NoWaitAuthJson>(output);
    const verificationUrl =
      json?.verification_url ?? json?.verification_uri_complete ?? json?.verification_uri ?? extractUrl(output);
    return {
      ok: Boolean(verificationUrl && json?.device_code),
      profileName: resolveProfileName(request?.profileName),
      verificationUrl,
      deviceCode: json?.device_code,
      qrcodeAscii: verificationUrl ? await qrcodeAscii(verificationUrl) : undefined,
      rawOutput: output,
      error: output || error.message,
    };
  }
}

async function completeAuth(
  deviceCode: string,
  profileName = readSelectedProfile()
): Promise<ILarkAutomationCompleteAuthResult> {
  try {
    const result = await runLarkCli(
      withProfile(['auth', 'login', '--device-code', deviceCode, '--json'], profileName),
      120_000
    );
    const bindingResult = await verifyAndPersistBinding(profileName);
    if (bindingResult.binding) {
      await startEventListenerForBinding(bindingResult.binding, { reason: 'binding' });
    }
    return {
      ok: true,
      profileName,
      bindingReady: bindingResult.bindingReady,
      binding: bindingResult.binding,
      taskAccessReady: bindingResult.taskAccessReady,
      taskAccessError: bindingResult.taskAccessError,
      rawOutput: sanitizeOutput(`${result.stdout}\n${result.stderr}`),
      error: bindingResult.ok ? undefined : bindingResult.error,
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    const output = sanitizeOutput(`${error.stdout ?? ''}\n${error.stderr ?? error.message}`);
    return {
      ok: false,
      profileName,
      rawOutput: output,
      error: output || error.message,
    };
  }
}

async function testLarkChannel(appId: string, appSecret: string): Promise<{ success?: boolean; error?: string }> {
  return httpRequest<{ success?: boolean; error?: string }>('POST', '/api/channel/plugins/test', {
    plugin_id: 'lark',
    token: '',
    extra_config: {
      app_id: appId,
      app_secret: appSecret,
    },
  });
}

async function enableLarkChannel(appId: string, appSecret: string): Promise<void> {
  await httpRequest<void>('POST', '/api/channel/plugins/enable', {
    plugin_id: 'lark',
    config: {
      credentials: {
        app_id: appId,
        app_secret: appSecret,
      },
    },
  });
}

async function syncChannel(request?: ILarkAutomationChannelSyncRequest): Promise<ILarkAutomationChannelSyncResult> {
  const profileName = resolveProfileName(request?.profileName);
  writeSelectedProfile(profileName);
  const appSecret = (request?.appSecret || '').trim();
  const bindingResult = await verifyAndPersistBinding(profileName);
  const appId = (request?.appId || bindingResult.appId || '').trim();

  if (!appId) {
    return {
      ok: false,
      profileName,
      manualSecretRequired: false,
      error: 'No App ID was detected. Finish application setup first.',
    };
  }

  if (!appSecret) {
    if (bindingResult.binding) {
      await startEventListenerForBinding(bindingResult.binding, { reason: 'binding' });
    }
    return {
      ok: Boolean(bindingResult.ok),
      profileName,
      appId,
      appName: bindingResult.appName,
      bindingReady: bindingResult.bindingReady,
      binding: bindingResult.binding,
      channelEnabled: bindingResult.channelEnabled,
      legacyChannelSecretRequired: Boolean(bindingResult.ok && !bindingResult.channelEnabled),
      manualSecretRequired: Boolean(bindingResult.ok && !bindingResult.channelEnabled),
      taskAccessReady: bindingResult.taskAccessReady,
      taskAccessError: bindingResult.taskAccessError,
      rawDataDir: bindingResult.rawDataDir,
      rawDataFiles: bindingResult.rawDataFiles,
      message: bindingResult.ok
        ? 'Verified with lark-cli and completed the local binding. App Secret remains in the system Keychain; add it manually only if legacy Channels bot events are required.'
        : bindingResult.error,
      error: bindingResult.ok ? undefined : bindingResult.error,
    };
  }

  try {
    const testResult = await testLarkChannel(appId, appSecret);
    if (testResult?.success === false) {
      return {
        ok: false,
        profileName,
        appId,
        manualSecretRequired: false,
        error: testResult.error || 'Lark channel connection test failed',
      };
    }

    await enableLarkChannel(appId, appSecret);
    const nextBinding = await verifyAndPersistBinding(profileName);
    if (nextBinding.binding) {
      await startEventListenerForBinding(nextBinding.binding, { reason: 'binding' });
    }
    return {
      ok: true,
      profileName,
      appId,
      appName: nextBinding.appName,
      bindingReady: nextBinding.bindingReady,
      binding: nextBinding.binding,
      channelEnabled: true,
      legacyChannelSecretRequired: false,
      manualSecretRequired: false,
      taskAccessReady: nextBinding.taskAccessReady,
      taskAccessError: nextBinding.taskAccessError,
      rawDataDir: nextBinding.rawDataDir,
      rawDataFiles: nextBinding.rawDataFiles,
      message: 'Saved to Channels and enabled.',
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    return {
      ok: false,
      profileName,
      appId,
      manualSecretRequired: false,
      error: error.message,
    };
  }
}

async function listProfiles(): Promise<ILarkAutomationProfilesResult> {
  const rawDataFiles: string[] = [];
  try {
    const result = await runLarkCli(['profile', 'list'], 10_000);
    const output = sanitizeOutput(`${result.stdout}\n${result.stderr}`);
    rawDataFiles.push(writeRawDataFile('profile-list.raw.json', output));
    const parsed = JSON.parse(output) as ILarkAutomationProfile[];
    const selectedProfile = readSelectedProfile();
    const profiles = Array.isArray(parsed) ? parsed : [];

    const profileDetails = new Map<string, Partial<ILarkAutomationProfile>>();

    await Promise.all(
      profiles.map(async (profile) => {
        const safeName = safeFileName(profile.name);
        const authStatus = await runLarkCliSafe(withProfile(['auth', 'status', '--json'], profile.name), 10_000);
        rawDataFiles.push(writeRawDataFile(`auth-status.${safeName}.stdout.json`, sanitizeOutput(authStatus.stdout)));
        rawDataFiles.push(writeRawDataFile(`auth-status.${safeName}.stderr.txt`, sanitizeOutput(authStatus.stderr)));
        rawDataFiles.push(writeRawDataFile(`auth-status.${safeName}.exitcode.txt`, String(authStatus.code)));

        if (!profile.appId) return;
        const appDetail = await runLarkCliSafe(
          withProfile(
            [
              'api',
              'GET',
              `/open-apis/application/v6/applications/${profile.appId}`,
              '--params',
              '{"lang":"zh_cn"}',
              '--as',
              'bot',
              '--json',
            ],
            profile.name
          ),
          20_000
        );
        rawDataFiles.push(
          writeRawDataFile(`application-detail.${safeName}.stdout.json`, sanitizeOutput(appDetail.stdout))
        );
        rawDataFiles.push(
          writeRawDataFile(`application-detail.${safeName}.stderr.txt`, sanitizeOutput(appDetail.stderr))
        );
        rawDataFiles.push(writeRawDataFile(`application-detail.${safeName}.exitcode.txt`, String(appDetail.code)));

        if (appDetail.code !== 0) {
          profileDetails.set(profile.name, { appInfoError: summarizeCliFailure(appDetail) });
          return;
        }

        const detail = parseJsonObject<ApplicationDetailJson>(sanitizeOutput(appDetail.stdout));
        const appDetailData = detail?.data?.app;
        if (!appDetailData) {
          profileDetails.set(profile.name, { appInfoError: summarizeCliFailure(appDetail) });
          return;
        }

        profileDetails.set(profile.name, {
          appId: appDetailData.app_id || profile.appId,
          appName: appDetailData.app_name,
          avatarUrl: appDetailData.avatar_url,
          description: appDetailData.description,
          primaryLanguage: appDetailData.primary_language,
          ownerName: appDetailData.owner?.name || undefined,
        });
      })
    );

    const selectedSafeName = safeFileName(selectedProfile);
    const appList = await runLarkCliSafe(
      withProfile(['apps', '+list', '--as', 'user', '--keyword', 'DeepOrganiser', '--json'], selectedProfile),
      25_000
    );
    rawDataFiles.push(writeRawDataFile(`apps-list.${selectedSafeName}.stdout.json`, sanitizeOutput(appList.stdout)));
    rawDataFiles.push(writeRawDataFile(`apps-list.${selectedSafeName}.stderr.txt`, sanitizeOutput(appList.stderr)));
    rawDataFiles.push(writeRawDataFile(`apps-list.${selectedSafeName}.exitcode.txt`, String(appList.code)));

    return {
      ok: true,
      selectedProfile,
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      profiles: profiles.map((profile) => ({
        ...profile,
        ...profileDetails.get(profile.name),
        selected: profile.name === selectedProfile,
      })),
    };
  } catch (rawError) {
    const error = normalizeExecError(rawError);
    return {
      ok: false,
      selectedProfile: readSelectedProfile(),
      rawDataDir: getRawDataDir(),
      rawDataFiles,
      profiles: [],
      error: sanitizeOutput(`${error.stdout ?? ''}\n${error.stderr ?? error.message}`) || error.message,
    };
  }
}

async function selectProfile({ profileName }: { profileName: string }): Promise<ILarkAutomationStatus> {
  writeSelectedProfile(profileName);
  configureProjectAgent({ profileName });
  return getStatus();
}

export function initLarkAutomationBridge(): void {
  ensureEventListenerFromSavedBinding('startup');
  ipcBridge.larkAutomation.getStatus.provider(getStatus);
  ipcBridge.larkAutomation.listProfiles.provider(listProfiles);
  ipcBridge.larkAutomation.selectProfile.provider(selectProfile);
  ipcBridge.larkAutomation.startConfig.provider(startConfig);
  ipcBridge.larkAutomation.startAuth.provider(startAuth);
  ipcBridge.larkAutomation.completeAuth.provider(({ deviceCode, profileName }) => completeAuth(deviceCode, profileName));
  ipcBridge.larkAutomation.syncChannel.provider(syncChannel);
  ipcBridge.larkAutomation.getProjects.provider(getProjects);
  ipcBridge.larkAutomation.syncProjects.provider(syncProjects);
  ipcBridge.larkAutomation.getContacts.provider(getContacts);
  ipcBridge.larkAutomation.syncContacts.provider(syncContacts);
  ipcBridge.larkAutomation.searchContacts.provider(searchContacts);
  ipcBridge.larkAutomation.createTasklist.provider(createTasklist);
  ipcBridge.larkAutomation.openExternal.provider(async ({ url }) => {
    await shell.openExternal(url);
  });
}
