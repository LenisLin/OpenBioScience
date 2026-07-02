/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { app } from 'electron';
import { getProjectAgentDataDir } from './store';
import type {
  LarkMarkdownFile,
  LarkTaskAttachment,
  LarkTaskComment,
  LarkTaskDetail,
  LarkTaskMemberSummary,
  LarkTaskSectionSummary,
  LarkTaskSummary,
  LarkTasklistSourceSnapshot,
  LarkTasklistSummary,
} from './types';

const execFileAsync = promisify(execFile);

type CliJson = Record<string, unknown>;

let activeProfileName: string | undefined;
const memberNameCache = new Map<string, string>();
const DEFAULT_PROFILE = 'deepscientist-pro';
const PROFILE_STATE_FILE = 'lark-automation-profile.json';
const AUTOMATION_DIR = 'automation';

export function configureLarkProjectAgentCli(profileName?: string): void {
  const trimmed = profileName?.trim();
  activeProfileName = trimmed && /^[A-Za-z0-9._:-]+$/.test(trimmed) ? trimmed : undefined;
}

export function getLarkProjectAgentCliProfile(): string | undefined {
  return activeProfileName;
}

function isRecord(value: unknown): value is CliJson {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const MAX_TASK_ATTACHMENT_BYTES = 50 * 1024 * 1024;

function withProfile(args: string[]): string[] {
  return ['--profile', activeProfileName ?? readSelectedProfileName(), ...args];
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

function readSelectedProfileName(): string {
  try {
    const filePath = path.join(getProjectAgentDataDir(), AUTOMATION_DIR, PROFILE_STATE_FILE);
    const legacyFilePath = path.join(app.getPath('userData'), PROFILE_STATE_FILE);
    const selectedPath = existsSync(filePath) ? filePath : legacyFilePath;
    if (!existsSync(selectedPath)) return DEFAULT_PROFILE;
    const parsed = JSON.parse(readFileSync(selectedPath, 'utf8')) as { selectedProfile?: string };
    const profileName = parsed.selectedProfile?.trim();
    return profileName && /^[A-Za-z0-9._:-]+$/.test(profileName) ? profileName : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

async function runLarkCli(args: string[], options: { cwd?: string } = {}): Promise<unknown> {
  const { stdout } = await execFileAsync('lark-cli', withProfile(args), {
    maxBuffer: 10 * 1024 * 1024,
    cwd: options.cwd,
    env: buildCliEnv(),
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

function pickString(record: CliJson, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function parseLarkMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function pickTime(record: CliJson, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      const timestamp = parseLarkMs(value.timestamp);
      if (timestamp) return timestamp;
    }
    const timestamp = parseLarkMs(value);
    if (timestamp) return timestamp;
  }
  return undefined;
}

function normalizeTasklist(value: unknown): LarkTasklistSummary | undefined {
  if (!isRecord(value)) return undefined;
  const guid = pickString(value, ['guid', 'tasklist_guid', 'id']);
  const name = pickString(value, ['name', 'summary', 'title']);
  if (!guid || !name) return undefined;
  return {
    guid,
    name,
    url: pickString(value, ['url', 'app_link', 'applink']),
    ownerId: isRecord(value.owner) ? pickString(value.owner, ['id']) : undefined,
    updatedAt: parseLarkMs(value.updated_at),
  };
}

function normalizeSection(value: unknown): LarkTaskSectionSummary | undefined {
  if (!isRecord(value)) return undefined;
  const guid = pickString(value, ['guid', 'section_guid', 'id']);
  const name = pickString(value, ['name', 'summary', 'title']);
  if (!guid || !name) return undefined;
  return {
    guid,
    name,
    isDefault: typeof value.is_default === 'boolean' ? value.is_default : undefined,
    updatedAt: parseLarkMs(value.updated_at),
  };
}

function normalizeMember(value: unknown): LarkTaskMemberSummary | undefined {
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

function readableMemberName(member?: LarkTaskMemberSummary): string | undefined {
  const name = member?.name?.trim();
  if (name) return name;
  if (!member?.id) return undefined;
  return memberNameCache.get(member.id);
}

function memberIdsNeedingNames(items: Array<LarkTaskMemberSummary | undefined>): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item?.id || readableMemberName(item)) continue;
    if (item.type && item.type !== 'user') continue;
    if (!item.id.startsWith('ou_')) continue;
    ids.add(item.id);
  }
  return [...ids].slice(0, 100);
}

function extractUsers(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  const data = payload.data;
  const candidates = [payload.users, payload.items, data, isRecord(data) ? data.users : undefined, isRecord(data) ? data.items : undefined];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (isRecord(candidate) && Array.isArray(candidate.users)) return candidate.users;
    if (isRecord(candidate) && Array.isArray(candidate.items)) return candidate.items;
  }
  return [];
}

function cacheUserNames(payload: unknown): void {
  for (const item of extractUsers(payload)) {
    if (!isRecord(item)) continue;
    const id = pickString(item, ['open_id', 'id', 'user_id']);
    const name =
      pickString(item, ['name', 'localized_name', 'display_name', 'nickname']) ||
      (isRecord(item.name) ? pickString(item.name, ['name', 'localized_name', 'default']) : undefined);
    if (id && name) {
      memberNameCache.set(id, name);
    }
  }
}

async function resolveMemberNames(items: Array<LarkTaskMemberSummary | undefined>): Promise<void> {
  const ids = memberIdsNeedingNames(items);
  if (!ids.length) return;
  try {
    const payload = await runLarkCli([
      'contact',
      '+search-user',
      '--user-ids',
      ids.join(','),
      '--as',
      'user',
      '--json',
    ]);
    cacheUserNames(payload);
  } catch {
    // Name resolution is a UI improvement; task detail should still render when
    // the directory scope is unavailable.
  }
}

function applyResolvedMemberName(member: LarkTaskMemberSummary | undefined): LarkTaskMemberSummary | undefined {
  if (!member) return undefined;
  const resolvedName = readableMemberName(member);
  return resolvedName ? { ...member, name: resolvedName } : member;
}

function normalizeComment(value: unknown): LarkTaskComment | undefined {
  if (!isRecord(value)) return undefined;
  const id = pickString(value, ['id', 'comment_id', 'guid']);
  const content = pickString(value, ['content', 'text']);
  if (!id || typeof content !== 'string') return undefined;
  return {
    id,
    content,
    creator: normalizeMember(value.creator),
    replyToCommentId: pickString(value, ['reply_to_comment_id', 'replyToCommentId']),
    createdAt: parseLarkMs(value.created_at),
    updatedAt: parseLarkMs(value.updated_at),
    resourceType: pickString(value, ['resource_type']),
    resourceId: pickString(value, ['resource_id']),
  };
}

function normalizeAttachment(value: unknown): LarkTaskAttachment | undefined {
  if (!isRecord(value)) return undefined;
  const guid = pickString(value, ['guid', 'attachment_guid', 'id']);
  const name = pickString(value, ['name', 'file_name', 'filename']);
  if (!guid || !name) return undefined;
  const resource = isRecord(value.resource)
    ? {
        type: pickString(value.resource, ['type', 'resource_type']),
        id: pickString(value.resource, ['id', 'resource_id']),
      }
    : undefined;
  const rawSize = typeof value.size === 'number' ? value.size : Number(value.size);
  return {
    guid,
    fileToken: pickString(value, ['file_token', 'fileToken']),
    name,
    size: Number.isFinite(rawSize) ? rawSize : undefined,
    url: pickString(value, ['url']),
    isCover: typeof value.is_cover === 'boolean' ? value.is_cover : undefined,
    uploadedAt: parseLarkMs(value.uploaded_at),
    uploader: normalizeMember(value.uploader),
    resource,
  };
}

function isAgentTaskFromDescription(summary: string, description?: string, extra?: string): boolean {
  const text = `${summary}\n${description ?? ''}\n${extra ?? ''}`.trim();
  return /^\s*\[AGENT_TASK\]/i.test(text) || /"kind"\s*:\s*"agent"/i.test(text);
}

function normalizeTask(value: unknown, tasklistGuid?: string): LarkTaskSummary | undefined {
  if (!isRecord(value)) return undefined;
  const guid = pickString(value, ['guid', 'task_guid', 'id']);
  const summary = pickString(value, ['summary', 'title', 'name']);
  if (!guid || !summary) return undefined;
  const tasklists = Array.isArray(value.tasklists) ? value.tasklists : [];
  const firstTasklist = tasklists.find(isRecord);
  const sectionGuid = isRecord(firstTasklist) ? pickString(firstTasklist, ['section_guid']) : undefined;
  const resolvedTasklistGuid =
    tasklistGuid ?? (isRecord(firstTasklist) ? pickString(firstTasklist, ['tasklist_guid']) : undefined);
  const members = Array.isArray(value.members)
    ? value.members.map(normalizeMember).filter((member): member is LarkTaskMemberSummary => Boolean(member))
    : [];
  const description = pickString(value, ['description', 'desc']);
  const extra = pickString(value, ['extra']);
  return {
    guid,
    taskId: pickString(value, ['task_id']),
    summary,
    description,
    status: pickString(value, ['status']),
    completedAt: pickTime(value, ['completed_at']),
    startAt: pickTime(value, ['start']),
    dueAt: pickTime(value, ['due']),
    sectionGuid,
    tasklistGuid: resolvedTasklistGuid,
    members,
    url: pickString(value, ['url', 'app_link', 'applink']),
    extra,
    isAgentTask: isAgentTaskFromDescription(summary, description, extra),
  };
}

function unwrapItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  const candidates = [payload.items, payload.tasklists, payload.tasks, payload.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (isRecord(candidate) && Array.isArray(candidate.items)) return candidate.items;
    if (isRecord(candidate) && Array.isArray(candidate.tasklists)) return candidate.tasklists;
    if (isRecord(candidate) && Array.isArray(candidate.tasks)) return candidate.tasks;
  }
  return [];
}

function findComment(payload: unknown): LarkTaskComment | undefined {
  if (isRecord(payload)) {
    const direct = normalizeComment(payload);
    if (direct) return direct;
    for (const key of ['comment', 'data']) {
      const nested = findComment(payload[key]);
      if (nested) return nested;
    }
  }
  if (Array.isArray(payload)) {
    for (const value of payload) {
      const nested = findComment(value);
      if (nested) return nested;
    }
  }
  return undefined;
}

function findAttachment(payload: unknown): LarkTaskAttachment | undefined {
  if (isRecord(payload)) {
    const direct = normalizeAttachment(payload);
    if (direct) return direct;
    for (const key of ['attachment', 'data', 'items', 'attachments']) {
      const nested = findAttachment(payload[key]);
      if (nested) return nested;
    }
  }
  if (Array.isArray(payload)) {
    for (const value of payload) {
      const nested = findAttachment(value);
      if (nested) return nested;
    }
  }
  return undefined;
}

function findMarkdownFile(payload: unknown): LarkMarkdownFile | undefined {
  if (isRecord(payload)) {
    const fileToken = pickString(payload, ['file_token', 'fileToken', 'token']);
    const fileName = pickString(payload, ['file_name', 'fileName', 'name']);
    if (fileToken && fileName) {
      const rawSize = typeof payload.size_bytes === 'number' ? payload.size_bytes : Number(payload.size_bytes);
      return {
        fileToken,
        fileName,
        url: pickString(payload, ['url', 'app_link', 'applink']),
        version: pickString(payload, ['version']),
        sizeBytes: Number.isFinite(rawSize) ? rawSize : undefined,
      };
    }
    for (const key of ['data', 'file', 'item']) {
      const nested = findMarkdownFile(payload[key]);
      if (nested) return nested;
    }
  }
  if (Array.isArray(payload)) {
    for (const value of payload) {
      const nested = findMarkdownFile(value);
      if (nested) return nested;
    }
  }
  return undefined;
}

function findMarkdownContent(payload: unknown): { content: string; file?: LarkMarkdownFile } | undefined {
  if (isRecord(payload)) {
    const contentValue = payload.content ?? payload.markdown ?? payload.text;
    const content = typeof contentValue === 'string' ? contentValue : undefined;
    const file = findMarkdownFile(payload);
    if (typeof content === 'string') {
      return { content, file };
    }
    for (const key of ['data', 'file', 'item']) {
      const nested = findMarkdownContent(payload[key]);
      if (nested) return nested;
    }
  }
  return undefined;
}

function findTasklist(payload: unknown): LarkTasklistSummary | undefined {
  if (isRecord(payload)) {
    const direct = normalizeTasklist(payload);
    if (direct) return direct;
    if (isRecord(payload.data)) {
      const nestedDataTasklist = findTasklist(payload.data.tasklist);
      if (nestedDataTasklist) return nestedDataTasklist;
    }
    for (const key of ['tasklist', 'data', 'item']) {
      const nested = findTasklist(payload[key]);
      if (nested) return nested;
    }
  }
  if (Array.isArray(payload)) {
    for (const value of payload) {
      const nested = findTasklist(value);
      if (nested) return nested;
    }
  }
  return undefined;
}

function findGuid(payload: unknown, keys: string[]): string | undefined {
  if (isRecord(payload)) {
    const direct = pickString(payload, keys);
    if (direct) return direct;
    for (const value of Object.values(payload)) {
      const nested = findGuid(value, keys);
      if (nested) return nested;
    }
  }
  if (Array.isArray(payload)) {
    for (const value of payload) {
      const nested = findGuid(value, keys);
      if (nested) return nested;
    }
  }
  return undefined;
}

function dateToLarkTime(value?: number): { timestamp: string; is_all_day: boolean } | undefined {
  if (!value) return undefined;
  return {
    timestamp: String(value),
    is_all_day: true,
  };
}

function dateToLarkDateTime(value?: number | null): { timestamp: string; is_all_day: boolean } | undefined {
  if (!value) return undefined;
  return {
    timestamp: String(value),
    is_all_day: false,
  };
}

export async function searchTasklists(query: string): Promise<LarkTasklistSummary[]> {
  const payload = await runLarkCli(['task', '+tasklist-search', '--query', query, '--as', 'user', '--json']);
  return unwrapItems(payload)
    .map(normalizeTasklist)
    .filter((item): item is LarkTasklistSummary => Boolean(item));
}

export async function listTasklists(limit = 50): Promise<LarkTasklistSummary[]> {
  const pageSize = Math.max(1, Math.min(100, Math.trunc(limit)));
  const payload = await runLarkCli([
    'task',
    'tasklists',
    'list',
    '--page-size',
    String(pageSize),
    '--page-all',
    '--as',
    'user',
    '--json',
  ]);
  return unwrapItems(payload)
    .map(normalizeTasklist)
    .filter((item): item is LarkTasklistSummary => Boolean(item))
    .slice(0, pageSize);
}

export async function getTasklist(tasklistGuid: string): Promise<LarkTasklistSummary> {
  const payload = await runLarkCli([
    'task',
    'tasklists',
    'get',
    '--params',
    JSON.stringify({ tasklist_guid: tasklistGuid, user_id_type: 'open_id' }),
    '--as',
    'user',
    '--json',
  ]);
  const tasklist = findTasklist(payload);
  if (!tasklist) {
    throw new Error('LARK_TASKLIST_NOT_FOUND');
  }
  return tasklist;
}

export async function listSections(tasklistGuid: string): Promise<LarkTaskSectionSummary[]> {
  const payload = await runLarkCli([
    'task',
    'sections',
    'list',
    '--resource-type',
    'tasklist',
    '--resource-id',
    tasklistGuid,
    '--page-size',
    '100',
    '--page-all',
    '--page-delay',
    '0',
    '--as',
    'user',
    '--json',
  ]);
  return unwrapItems(payload)
    .map(normalizeSection)
    .filter((item): item is LarkTaskSectionSummary => Boolean(item));
}

export async function listTasklistTasks(input: {
  tasklistGuid: string;
  completed?: boolean;
}): Promise<LarkTaskSummary[]> {
  const params: Record<string, unknown> = {
    tasklist_guid: input.tasklistGuid,
    page_size: 100,
  };
  if (typeof input.completed === 'boolean') {
    params.completed = input.completed;
  }
  const args = [
    'task',
    'tasklists',
    'tasks',
    '--params',
    JSON.stringify(params),
    '--page-all',
    '--page-delay',
    '0',
    '--as',
    'user',
    '--json',
  ];
  const payload = await runLarkCli(args);
  return unwrapItems(payload)
    .map((item) => normalizeTask(item, input.tasklistGuid))
    .filter((item): item is LarkTaskSummary => Boolean(item));
}

export async function getTask(taskGuid: string): Promise<LarkTaskSummary> {
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
  if (!task) {
    throw new Error('LARK_TASK_NOT_FOUND');
  }
  return task;
}

export async function listTaskComments(taskGuid: string): Promise<LarkTaskComment[]> {
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
  return unwrapItems(payload)
    .map(normalizeComment)
    .filter((item): item is LarkTaskComment => Boolean(item));
}

export async function listTaskAttachments(taskGuid: string): Promise<LarkTaskAttachment[]> {
  const payload = await runLarkCli([
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
  ]);
  return unwrapItems(payload)
    .map(normalizeAttachment)
    .filter((item): item is LarkTaskAttachment => Boolean(item));
}

export async function getTaskDetail(taskGuid: string): Promise<LarkTaskDetail> {
  const [task, comments, attachments] = await Promise.all([
    getTask(taskGuid),
    listTaskComments(taskGuid).catch((): LarkTaskComment[] => []),
    listTaskAttachments(taskGuid).catch((): LarkTaskAttachment[] => []),
  ]);
  await resolveMemberNames([
    ...task.members,
    ...comments.map((comment) => comment.creator),
    ...attachments.map((attachment) => attachment.uploader),
  ]);
  return {
    task: {
      ...task,
      members: task.members.map((member) => applyResolvedMemberName(member) ?? member),
    },
    comments: comments.map((comment) => ({
      ...comment,
      creator: applyResolvedMemberName(comment.creator),
    })),
    attachments: attachments.map((attachment) => ({
      ...attachment,
      uploader: applyResolvedMemberName(attachment.uploader),
    })),
    fetchedAt: Date.now(),
  };
}

export async function getTasklistSourceSnapshot(tasklistGuid: string): Promise<LarkTasklistSourceSnapshot> {
  const [tasklist, sections, openTasks, completedTasks] = await Promise.all([
    getTasklist(tasklistGuid),
    listSections(tasklistGuid),
    listTasklistTasks({ tasklistGuid, completed: false }),
    listTasklistTasks({ tasklistGuid, completed: true }),
  ]);
  return {
    source: 'lark',
    tasklist,
    sections,
    openTasks,
    completedTasks,
    fetchedAt: Date.now(),
  };
}

export async function createTasklist(name: string): Promise<LarkTasklistSummary> {
  const payload = await runLarkCli(['task', '+tasklist-create', '--name', name, '--as', 'user', '--json']);
  const tasklist = findTasklist(payload);
  if (!tasklist) {
    throw new Error('LARK_TASKLIST_CREATE_FAILED');
  }
  return tasklist;
}

export async function renameTasklist(input: { tasklistGuid: string; name: string }): Promise<LarkTasklistSummary> {
  const payload = await runLarkCli([
    'task',
    'tasklists',
    'patch',
    '--params',
    JSON.stringify({ tasklist_guid: input.tasklistGuid, user_id_type: 'open_id' }),
    '--data',
    JSON.stringify({
      tasklist: {
        name: input.name,
      },
      update_fields: ['name'],
    }),
    '--as',
    'user',
    '--json',
  ]);
  const tasklist = findTasklist(payload);
  return tasklist ?? getTasklist(input.tasklistGuid);
}

export async function createSection(input: {
  tasklistGuid: string;
  name: string;
  insertBefore?: string;
  insertAfter?: string;
}): Promise<string> {
  const payload = await runLarkCli([
    'task',
    'sections',
    'create',
    '--as',
    'user',
    '--data',
    JSON.stringify({
      name: input.name,
      resource_type: 'tasklist',
      resource_id: input.tasklistGuid,
      insert_before: input.insertBefore,
      insert_after: input.insertAfter,
    }),
    '--json',
  ]);
  const guid = findGuid(payload, ['guid', 'section_guid']);
  if (!guid) {
    throw new Error('LARK_SECTION_CREATE_FAILED');
  }
  return guid;
}

export async function updateSectionPlacement(input: {
  sectionGuid: string;
  insertBefore?: string;
  insertAfter?: string;
}): Promise<void> {
  const section: Record<string, string> = {};
  const updateFields: string[] = [];
  if (input.insertBefore) {
    section.insert_before = input.insertBefore;
    updateFields.push('insert_before');
  }
  if (input.insertAfter) {
    section.insert_after = input.insertAfter;
    updateFields.push('insert_after');
  }
  if (!updateFields.length) return;
  await runLarkCli([
    'task',
    'sections',
    'patch',
    '--as',
    'user',
    '--params',
    JSON.stringify({ section_guid: input.sectionGuid }),
    '--data',
    JSON.stringify({
      section,
      update_fields: updateFields,
    }),
    '--json',
  ]);
}

export async function createTask(input: {
  tasklistGuid: string;
  sectionGuid?: string;
  summary: string;
  description?: string;
  startAt?: number;
  dueAt?: number;
  assigneeId?: string;
  extra?: string;
}): Promise<{ guid: string; url?: string }> {
  const members = input.assigneeId
    ? [
        {
          id: input.assigneeId,
          role: 'assignee',
          type: input.assigneeId.startsWith('cli_') ? 'app' : 'user',
        },
      ]
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
      start: dateToLarkTime(input.startAt),
      due: dateToLarkTime(input.dueAt),
      extra: input.extra,
      members,
      tasklists: [
        {
          tasklist_guid: input.tasklistGuid,
          section_guid: input.sectionGuid,
        },
      ],
    }),
    '--json',
  ]);
  const guid = findGuid(payload, ['guid', 'task_guid']);
  if (!guid) {
    throw new Error('LARK_TASK_CREATE_FAILED');
  }
  const url = isRecord(payload) && isRecord(payload.task) ? pickString(payload.task, ['url']) : undefined;
  return { guid, url };
}

export async function createMarkdownFile(input: {
  fileName: string;
  content: string;
  folderToken?: string;
}): Promise<LarkMarkdownFile> {
  const args = [
    'markdown',
    '+create',
    '--name',
    input.fileName,
    '--content',
    input.content,
    '--as',
    'user',
    '--json',
  ];
  if (input.folderToken) {
    args.splice(2, 0, '--folder-token', input.folderToken);
  }
  const payload = await runLarkCli(args);
  const file = findMarkdownFile(payload);
  if (!file) {
    throw new Error('LARK_MARKDOWN_CREATE_FAILED');
  }
  return file;
}

export async function fetchMarkdownFile(fileToken: string): Promise<{ content: string; file?: LarkMarkdownFile }> {
  const payload = await runLarkCli([
    'markdown',
    '+fetch',
    '--file-token',
    fileToken,
    '--as',
    'user',
    '--json',
  ]);
  const result = findMarkdownContent(payload);
  if (!result) {
    throw new Error('LARK_MARKDOWN_FETCH_FAILED');
  }
  return result;
}

export async function overwriteMarkdownFile(input: {
  fileToken: string;
  fileName?: string;
  content: string;
}): Promise<LarkMarkdownFile> {
  const args = [
    'markdown',
    '+overwrite',
    '--file-token',
    input.fileToken,
    '--content',
    input.content,
    '--as',
    'user',
    '--json',
  ];
  if (input.fileName) {
    args.splice(4, 0, '--name', input.fileName);
  }
  const payload = await runLarkCli(args);
  const file = findMarkdownFile(payload);
  if (!file) {
    throw new Error('LARK_MARKDOWN_OVERWRITE_FAILED');
  }
  return file;
}

export async function commentTask(taskGuid: string, text: string): Promise<{ commentId?: string }> {
  const payload = await addTaskComment({ taskGuid, content: text });
  return {
    commentId: payload.id,
  };
}

export async function setTaskCompletion(input: { taskGuid: string; completed: boolean }): Promise<LarkTaskSummary> {
  await runLarkCli([
    'task',
    input.completed ? '+complete' : '+reopen',
    '--task-guid',
    input.taskGuid,
    '--as',
    'user',
    '--json',
  ]);
  return getTask(input.taskGuid);
}

export async function updateTask(input: { taskGuid: string; dueAt?: number | null }): Promise<LarkTaskSummary> {
  const taskPatch: Record<string, unknown> = {};
  const updateFields: string[] = [];
  if ('dueAt' in input) {
    updateFields.push('due');
    const due = dateToLarkDateTime(input.dueAt);
    if (due) taskPatch.due = due;
  }
  if (!updateFields.length) {
    return getTask(input.taskGuid);
  }
  await runLarkCli([
    'task',
    'tasks',
    'patch',
    '--params',
    JSON.stringify({ task_guid: input.taskGuid, user_id_type: 'open_id' }),
    '--data',
    JSON.stringify({
      task: taskPatch,
      update_fields: updateFields,
    }),
    '--as',
    'user',
    '--json',
  ]);
  return getTask(input.taskGuid);
}

export async function updateTaskDescription(input: {
  taskGuid: string;
  description: string;
  extra?: string;
}): Promise<LarkTaskSummary> {
  const taskPatch: Record<string, unknown> = {
    description: input.description,
  };
  const updateFields = ['description'];
  if (typeof input.extra === 'string') {
    taskPatch.extra = input.extra;
    updateFields.push('extra');
  }
  await runLarkCli([
    'task',
    'tasks',
    'patch',
    '--params',
    JSON.stringify({ task_guid: input.taskGuid, user_id_type: 'open_id' }),
    '--data',
    JSON.stringify({
      task: taskPatch,
      update_fields: updateFields,
    }),
    '--as',
    'user',
    '--json',
  ]);
  return getTask(input.taskGuid);
}

export async function addTaskComment(input: {
  taskGuid: string;
  content: string;
  replyToCommentId?: string;
}): Promise<LarkTaskComment> {
  const payload = await runLarkCli([
    'api',
    'POST',
    '/open-apis/task/v2/comments',
    '--data',
    JSON.stringify({
      content: input.content,
      reply_to_comment_id: input.replyToCommentId,
      resource_type: 'task',
      resource_id: input.taskGuid,
    }),
    '--params',
    JSON.stringify({ user_id_type: 'open_id' }),
    '--as',
    'user',
    '--json',
  ]);
  const comment = findComment(payload);
  if (!comment) {
    throw new Error('LARK_TASK_COMMENT_CREATE_FAILED');
  }
  return comment;
}

export async function uploadTaskAttachment(input: { taskGuid: string; filePath: string }): Promise<LarkTaskAttachment> {
  const absolutePath = path.resolve(input.filePath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error('LARK_TASK_ATTACHMENT_NOT_FILE');
  }
  if (stat.size > MAX_TASK_ATTACHMENT_BYTES) {
    throw new Error('LARK_TASK_ATTACHMENT_TOO_LARGE');
  }
  const cwd = path.dirname(absolutePath);
  const fileName = path.basename(absolutePath);
  const payload = await runLarkCli(
    [
      'task',
      '+upload-attachment',
      '--resource-id',
      input.taskGuid,
      '--resource-type',
      'task',
      '--file',
      fileName,
      '--as',
      'user',
      '--json',
    ],
    { cwd }
  );
  const attachment = findAttachment(payload);
  if (!attachment) {
    throw new Error('LARK_TASK_ATTACHMENT_UPLOAD_FAILED');
  }
  return attachment;
}

export async function appendAgentTaskStep(taskGuid: string, text: string): Promise<void> {
  await runLarkCli([
    'task',
    'agent_task_step_info',
    'append_task_steps',
    '--as',
    'user',
    '--data',
    JSON.stringify({
      task_guid: taskGuid,
      task_steps: [{ content: text }],
    }),
    '--json',
  ]);
}
