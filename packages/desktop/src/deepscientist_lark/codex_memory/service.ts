/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { isCodexCompactionMemoryText } from '@/common/chat/codexMemory';
import type {
  CodexMemoryConversationIndex,
  CodexMemoryDetail,
  CodexMemoryListResult,
  CodexMemoryPersistRequest,
  CodexMemoryPersistResult,
  CodexMemoryRecord,
  CodexMemoryScanRequest,
  CodexMemoryScanResult,
  CodexMemorySummary,
} from './types';
import {
  getCodexMemoryDataDir,
  getCodexMemoryRecordPaths,
  readCodexMemoryConversationIndex,
  readCodexMemoryDetail,
  relativeToConversationDir,
  resolveConversationRelativePath,
  upsertCodexMemoryGlobalConversation,
  writeCodexMemoryConversationIndex,
  writeCodexMemoryDetail,
} from './store';

const execFileAsync = promisify(execFile);
const CODEX_HOME = path.join(os.homedir(), '.codex');
const CODEX_SESSIONS_DIR = path.join(CODEX_HOME, 'sessions');
const BACKEND_DB_RELATIVE_PATH = path.join('deeporganiser', 'aionui-backend.db');
const MAX_EXTRACT_ITEMS = 14;
const MAX_MARKDOWN_SECTION_ITEMS = 8;
const ROLLOUT_RESOLUTION_CACHE_MS = 60_000;
const scanLocks = new Map<string, Promise<CodexMemoryScanResult>>();
const rolloutResolutionCache = new Map<
  string,
  { resolvedAt: number; result: CodexRolloutResolution }
>();

type JsonRecord = Record<string, unknown>;

type CompactionEvent = {
  line: number;
  timestamp: string;
  payload: JsonRecord;
  raw: string;
};

type RolloutCompactionMessage = {
  line: number;
  timestamp: string;
  message: string;
  raw: string;
};

type LocalCompactionMessage = {
  id: string;
  content: string;
  createdAt: number;
};

type AcpSessionBinding = {
  conversationId: string;
  codexSessionId?: string;
  rolloutPath?: string;
  codexRolloutSessionId?: string;
  workspace?: string;
  title?: string;
  sessionConfig?: JsonRecord;
};

type RolloutMeta = {
  rolloutPath: string;
  codexRolloutSessionId?: string;
  cwd?: string;
  timestamp?: string;
  mtimeMs: number;
};

type CodexRolloutResolution = {
  rolloutPath?: string;
  codexSessionId?: string;
  codexRolloutSessionId?: string;
  workspace?: string;
  mappingSource?: string;
};

function now(): number {
  return Date.now();
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeText(value: string): string {
  return value
    .replace(/gAAAAA[A-Za-z0-9_-]{40,}/g, '[encrypted_content]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[redacted_key]')
    .replace(/xox[baprs]-[A-Za-z0-9-]{20,}/g, '[redacted_token]')
    .trim();
}

function truncate(value: string, max = 220): string {
  const normalized = safeText(value).replace(/\s+/g, ' ');
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function getDataDirFromPlatform(): string {
  return path.dirname(path.dirname(getCodexMemoryDataDir()));
}

function getBackendDbPath(): string {
  return path.join(getDataDirFromPlatform(), BACKEND_DB_RELATIVE_PATH);
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseJsonRecord(value: unknown): JsonRecord | undefined {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getNestedRecord(root: JsonRecord | undefined, keys: string[]): JsonRecord | undefined {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return isRecord(current) ? current : undefined;
}

function extractStringFromRecords(records: Array<JsonRecord | undefined>, keys: string[]): string | undefined {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = asString(record[key]);
      if (value) return value;
    }
  }
  return undefined;
}

function normalizeFilePathForCompare(value?: string): string | undefined {
  if (!value) return undefined;
  return path.resolve(value).replace(/\\/g, '/').replace(/\/+$/g, '');
}

function getStableWorkspaceKey(value?: string): string | undefined {
  const normalized = normalizeFilePathForCompare(value);
  if (!normalized) return undefined;
  const leaf = normalized.split('/').filter(Boolean).at(-1);
  if (!leaf || leaf.length < 8) return undefined;
  return leaf;
}

async function queryAcpSessionBinding(conversationId: string): Promise<AcpSessionBinding> {
  const dbPath = getBackendDbPath();
  if (!(await pathExists(dbPath))) return { conversationId };
  try {
    const { stdout } = await execFileAsync(
      'sqlite3',
      [
        '-json',
        dbPath,
        `
          select
            s.session_id,
            s.session_config,
            c.name,
            c.extra
          from acp_session s
          left join conversations c on c.id = s.conversation_id
          where s.conversation_id = ${sqlQuote(conversationId)}
          limit 1;
        `,
      ],
      { timeout: 1500, maxBuffer: 1024 * 256 }
    );
    const parsed = JSON.parse(stdout || '[]') as unknown;
    const row = Array.isArray(parsed) && isRecord(parsed[0]) ? parsed[0] : undefined;
    if (!row) return { conversationId };
    const sessionConfig = parseJsonRecord(row.session_config);
    const extra = parseJsonRecord(row.extra);
    const memoryConfig = getNestedRecord(sessionConfig, ['memory', 'codex']);
    const flatCodexConfig = getNestedRecord(sessionConfig, ['codex']);
    return {
      conversationId,
      codexSessionId: asString(row.session_id),
      rolloutPath: extractStringFromRecords([memoryConfig, flatCodexConfig, sessionConfig, extra], [
        'rollout_path',
        'rolloutPath',
        'codex_rollout_path',
        'codexRolloutPath',
      ]),
      codexRolloutSessionId: extractStringFromRecords([memoryConfig, flatCodexConfig, sessionConfig, extra], [
        'rollout_session_id',
        'rolloutSessionId',
        'codex_rollout_session_id',
        'codexRolloutSessionId',
      ]),
      workspace: extractStringFromRecords([memoryConfig, flatCodexConfig, sessionConfig, extra], ['workspace', 'cwd']),
      title: asString(row.name),
      sessionConfig,
    };
  } catch {
    return { conversationId };
  }
}

async function persistAcpSessionCodexMemoryBinding(
  conversationId: string,
  binding: Pick<CodexRolloutResolution, 'rolloutPath' | 'codexRolloutSessionId' | 'workspace' | 'mappingSource'>
): Promise<void> {
  if (!binding.rolloutPath) return;
  const dbPath = getBackendDbPath();
  if (!(await pathExists(dbPath))) return;
  try {
    const current = await queryAcpSessionBinding(conversationId);
    const nextConfig: JsonRecord = {
      ...(current.sessionConfig ?? {}),
      memory: {
        ...(isRecord(current.sessionConfig?.memory) ? current.sessionConfig.memory : {}),
        codex: {
          ...(getNestedRecord(current.sessionConfig, ['memory', 'codex']) ?? {}),
          rollout_path: binding.rolloutPath,
          rollout_session_id: binding.codexRolloutSessionId,
          workspace: binding.workspace,
          mapping_source: binding.mappingSource,
          updated_at: now(),
        },
      },
    };
    await execFileAsync(
      'sqlite3',
      [
        dbPath,
        `update acp_session set session_config=${sqlQuote(JSON.stringify(nextConfig))} where conversation_id=${sqlQuote(conversationId)};`,
      ],
      { timeout: 1500, maxBuffer: 1024 * 32 }
    );
  } catch {
    // Memory binding is an optimization layer; the TOML index remains the source
    // of truth if the database is temporarily locked or unavailable.
  }
}

function extractMessageContent(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed)) {
      const content = asString(parsed.content);
      if (content) return content;
    }
  } catch {
    // Plain text payloads are still valid in old local message rows.
  }
  return asString(raw);
}

async function queryLocalCompactionMessages(conversationId: string): Promise<LocalCompactionMessage[]> {
  const dbPath = getBackendDbPath();
  if (!(await pathExists(dbPath))) return [];
  const conversation = sqlQuote(conversationId);
  const sql = `
    select m.id, m.content, m.created_at
    from messages m
    where m.conversation_id = ${conversation}
      and m.type = 'text'
      and m.position = 'left'
      and m.hidden = 0
      and (
        m.content like '%上下文已压缩%'
        or lower(m.content) like '%context compacted%'
        or exists (
          select 1
          from messages prev
          where prev.conversation_id = m.conversation_id
            and prev.type = 'text'
            and prev.position = 'right'
            and prev.hidden = 0
            and prev.created_at <= m.created_at
            and prev.created_at >= m.created_at - 120000
            and (
              prev.content like '%"content":"/compact"%'
              or prev.content like '%"content": "/compact"%'
            )
        )
      )
    order by m.created_at asc;
  `;
  try {
    const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, sql], {
      timeout: 1500,
      maxBuffer: 1024 * 512,
    });
    const parsed = JSON.parse(stdout || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (!isRecord(row)) return [];
      const id = asString(row.id);
      const content = extractMessageContent(row.content);
      const createdAt = asNumber(row.created_at);
      if (!id || !content || !createdAt) return [];
      return [{ id, content, createdAt }];
    });
  } catch {
    return [];
  }
}

async function listRolloutFiles(): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          return;
        }
        if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
          files.push(fullPath);
        }
      })
    );
  }
  await walk(CODEX_SESSIONS_DIR);
  const stats = await Promise.all(
    files.map(async (filePath) => {
      try {
        return { filePath, mtimeMs: (await fs.stat(filePath)).mtimeMs };
      } catch {
        return { filePath, mtimeMs: 0 };
      }
    })
  );
  return stats.toSorted((a, b) => b.mtimeMs - a.mtimeMs).map((item) => item.filePath);
}

async function readFirstLines(filePath: string, maxLines = 24): Promise<string[]> {
  if (maxLines <= 0) return [];
  const handle = await fs.open(filePath, 'r');
  try {
    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(64 * 1024);
    let position = 0;
    let lineCount = 0;
    const maxBytes = 1024 * 1024;

    while (lineCount < maxLines && position < maxBytes) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      for (let i = 0; i < bytesRead; i += 1) {
        if (buffer[i] === 10) lineCount += 1;
      }
      position += bytesRead;
    }

    return Buffer.concat(chunks).toString('utf8').split('\n').slice(0, maxLines);
  } finally {
    await handle.close();
  }
}

function lineIncludesSessionId(line: string, sessionId: string): boolean {
  return line.includes(sessionId);
}

async function readRolloutMeta(rolloutPath: string): Promise<RolloutMeta | undefined> {
  try {
    const [lines, stat] = await Promise.all([readFirstLines(rolloutPath, 8), fs.stat(rolloutPath)]);
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as unknown;
      if (!isRecord(parsed) || parsed.type !== 'session_meta' || !isRecord(parsed.payload)) continue;
      return {
        rolloutPath,
        codexRolloutSessionId: asString(parsed.payload.id),
        cwd: asString(parsed.payload.cwd),
        timestamp: asString(parsed.payload.timestamp ?? parsed.timestamp),
        mtimeMs: stat.mtimeMs,
      };
    }
    return { rolloutPath, mtimeMs: stat.mtimeMs };
  } catch {
    return undefined;
  }
}

function workspaceMatchesRollout(workspace: string | undefined, meta: RolloutMeta | undefined): boolean {
  const expected = normalizeFilePathForCompare(workspace);
  const actual = normalizeFilePathForCompare(meta?.cwd);
  if (expected && actual && expected === actual) return true;

  // Project workspaces have been migrated between data roots over time. The
  // final segment is the stable project/task-list id, so use it as a second
  // pass when the full cwd no longer matches byte-for-byte.
  const expectedKey = getStableWorkspaceKey(expected);
  const actualKey = getStableWorkspaceKey(actual);
  return Boolean(expectedKey && actualKey && expectedKey === actualKey);
}

async function resolveRolloutPath(request: CodexMemoryScanRequest): Promise<CodexRolloutResolution> {
  if (request.rolloutPath && (await pathExists(request.rolloutPath))) {
    const meta = await readRolloutMeta(request.rolloutPath);
    return {
      rolloutPath: request.rolloutPath,
      codexSessionId: request.codexSessionId,
      codexRolloutSessionId: meta?.codexRolloutSessionId,
      workspace: request.workspace ?? meta?.cwd,
      mappingSource: 'request.rolloutPath',
    };
  }

  const cacheKey = [
    request.conversationId,
    request.codexSessionId ?? '',
    request.rolloutPath ?? '',
    request.workspace ?? '',
  ].join('|');
  if (!request.force) {
    const cached = rolloutResolutionCache.get(cacheKey);
    if (cached && now() - cached.resolvedAt < ROLLOUT_RESOLUTION_CACHE_MS) {
      return cached.result;
    }
  }

  const remember = (result: CodexRolloutResolution) => {
    rolloutResolutionCache.set(cacheKey, { resolvedAt: now(), result });
    return result;
  };

  const acpBinding = await queryAcpSessionBinding(request.conversationId);
  const codexSessionId = request.codexSessionId ?? acpBinding.codexSessionId;
  const workspace = request.workspace ?? acpBinding.workspace;
  const persistedRolloutPath = acpBinding.rolloutPath;
  if (persistedRolloutPath && (await pathExists(persistedRolloutPath))) {
    const meta = await readRolloutMeta(persistedRolloutPath);
    return remember({
      rolloutPath: persistedRolloutPath,
      codexSessionId,
      codexRolloutSessionId: acpBinding.codexRolloutSessionId ?? meta?.codexRolloutSessionId,
      workspace: workspace ?? meta?.cwd,
      mappingSource: 'acp_session.session_config',
    });
  }

  const files = await listRolloutFiles();

  if (codexSessionId) {
    const byName = files.find((filePath) => path.basename(filePath).includes(codexSessionId));
    if (byName) {
      const meta = await readRolloutMeta(byName);
      return remember({
        rolloutPath: byName,
        codexSessionId,
        codexRolloutSessionId: meta?.codexRolloutSessionId,
        workspace: workspace ?? meta?.cwd,
        mappingSource: 'codex_session_id.filename',
      });
    }

    if (workspace) {
      for (const filePath of files.slice(0, 160)) {
        const meta = await readRolloutMeta(filePath);
        if (workspaceMatchesRollout(workspace, meta)) {
          return remember({
            rolloutPath: filePath,
            codexSessionId,
            codexRolloutSessionId: meta?.codexRolloutSessionId,
            workspace: meta?.cwd ?? workspace,
            mappingSource: 'workspace.cwd',
          });
        }
      }
    }

    for (const filePath of files.slice(0, 80)) {
      try {
        const lines = await readFirstLines(filePath);
        if (lines.some((line) => lineIncludesSessionId(line, codexSessionId))) {
          const meta = await readRolloutMeta(filePath);
          return remember({
            rolloutPath: filePath,
            codexSessionId,
            codexRolloutSessionId: meta?.codexRolloutSessionId,
            workspace: workspace ?? meta?.cwd,
            mappingSource: 'codex_session_id.content',
          });
        }
      } catch {
        // Keep searching other files.
      }
    }

    return remember({ codexSessionId, workspace, mappingSource: 'unresolved' });
  }

  for (const filePath of files.slice(0, 80)) {
    try {
      const lines = await readFirstLines(filePath, 80);
      if (lines.some((line) => lineIncludesSessionId(line, request.conversationId))) {
        const meta = await readRolloutMeta(filePath);
        return remember({
          rolloutPath: filePath,
          codexSessionId,
          codexRolloutSessionId: meta?.codexRolloutSessionId,
          workspace: workspace ?? meta?.cwd,
          mappingSource: 'conversation_id.content',
        });
      }
    } catch {
      // Keep searching other files.
    }
  }

  if (workspace) {
    for (const filePath of files.slice(0, 160)) {
      const meta = await readRolloutMeta(filePath);
      if (workspaceMatchesRollout(workspace, meta)) {
        return remember({
          rolloutPath: filePath,
          codexSessionId,
          codexRolloutSessionId: meta?.codexRolloutSessionId,
          workspace: meta?.cwd ?? workspace,
          mappingSource: 'workspace.cwd',
        });
      }
    }
  }

  return remember({ codexSessionId, workspace, mappingSource: 'unresolved' });
}

function extractTextFromContent(content: unknown): string[] {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (!isRecord(part)) return [];
    const text = asString(part.text);
    return text ? [text] : [];
  });
}

function extractHistoryTexts(payload: JsonRecord): {
  userTexts: string[];
  assistantTexts: string[];
  toolTexts: string[];
  fileTexts: string[];
} {
  const history = Array.isArray(payload.replacement_history) ? payload.replacement_history : [];
  const userTexts: string[] = [];
  const assistantTexts: string[] = [];
  const toolTexts: string[] = [];
  const fileTexts: string[] = [];

  for (const item of history) {
    if (!isRecord(item)) continue;
    if (item.type === 'message') {
      const role = asString(item.role);
      const texts = extractTextFromContent(item.content).map((text) => truncate(text, 420)).filter(Boolean);
      if (role === 'user') userTexts.push(...texts);
      if (role === 'assistant') assistantTexts.push(...texts);
      continue;
    }
    if (item.type === 'function_call' || item.type === 'function_call_output') {
      const name = asString(item.name);
      const output = asString(item.output);
      const argumentsText = asString(item.arguments);
      const text = [name, output ?? argumentsText].filter(Boolean).join(': ');
      if (text) toolTexts.push(truncate(text, 320));
      if (text.match(/(?:^|\s)(?:\/Users\/|[A-Za-z]:\\|packages\/|src\/|docs\/)[^\s)]+/)) {
        fileTexts.push(...extractPathHints(text));
      }
    }
  }

  return {
    userTexts: unique(userTexts).slice(-MAX_EXTRACT_ITEMS),
    assistantTexts: unique(assistantTexts).slice(-MAX_EXTRACT_ITEMS),
    toolTexts: unique(toolTexts).slice(-MAX_EXTRACT_ITEMS),
    fileTexts: unique(fileTexts).slice(-MAX_EXTRACT_ITEMS),
  };
}

function extractPathHints(text: string): string[] {
  const matches = text.match(/(?:\/Users\/[^\s)'"`]+|(?:packages|docs|src|tests)\/[^\s)'"`]+)/g) ?? [];
  return matches.map((item) => item.replace(/[.,;:]+$/, '')).filter((item) => item.length > 2);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function buildSummary(payload: JsonRecord): CodexMemorySummary {
  const { userTexts, assistantTexts, toolTexts, fileTexts } = extractHistoryTexts(payload);
  const latestUser = userTexts.at(-1);
  const latestAssistant = assistantTexts.at(-1);
  const topic = latestUser ? truncate(latestUser, 120) : latestAssistant ? truncate(latestAssistant, 120) : 'Codex context snapshot';
  const completed = assistantTexts.slice(-5).map((text) => truncate(text, 180));
  const decisions = userTexts.slice(-4).map((text) => truncate(text, 180));
  const verification = toolTexts
    .filter((text) => /test|vitest|playwright|npm|bun|pnpm|yarn|tsc|lint|验证|测试|screenshot/i.test(text))
    .slice(-4)
    .map((text) => truncate(text, 160));
  const todo = userTexts
    .filter((text) => /请|需要|继续|实现|修复|完善|todo|next|后续/i.test(text))
    .slice(-5)
    .map((text) => truncate(text, 180));

  return {
    topic,
    completed: completed.length ? completed : assistantTexts.slice(-3),
    decisions,
    files: fileTexts,
    verification,
    todo,
  };
}

function formatList(items: string[], fallback: string): string {
  const values = unique(items).slice(0, MAX_MARKDOWN_SECTION_ITEMS);
  if (!values.length) return `- ${fallback}`;
  return values.map((item) => `- ${item.replace(/\n+/g, ' ')}`).join('\n');
}

function buildMarkdown(record: CodexMemoryRecord, summary: CodexMemorySummary): string {
  return [
    `# ${record.title}`,
    '',
    `- Memory ID: \`${record.id}\``,
    `- Window: ${record.windowNumber || 'unknown'}`,
    `- Time: ${record.timestamp}`,
    `- Source line: ${record.line}`,
    `- Source rollout: \`${record.rolloutPath}\``,
    '',
    '## Snapshot',
    '',
    summary.topic,
    '',
    '## Completed / Assistant Context',
    '',
    formatList(summary.completed, 'No completed assistant context was recoverable from the local snapshot.'),
    '',
    '## User Decisions / Requests',
    '',
    formatList(summary.decisions, 'No explicit user request was recoverable from the local snapshot.'),
    '',
    '## Files And Paths',
    '',
    formatList(summary.files, 'No file path was detected in this memory point.'),
    '',
    '## Verification',
    '',
    formatList(summary.verification, 'No verification command was detected in this memory point.'),
    '',
    '## Next Work',
    '',
    formatList(summary.todo, 'No explicit next action was detected in this memory point.'),
  ].join('\n');
}

function buildLocalCompactionMarkdown(record: CodexMemoryRecord, summary: CodexMemorySummary): string {
  return [
    `# ${record.title}`,
    '',
    `- Memory ID: \`${record.id}\``,
    `- Time: ${record.timestamp}`,
    `- Source: local conversation message`,
    '',
    '## Snapshot',
    '',
    summary.topic,
    '',
    '## Local Compaction Summary',
    '',
    formatList(summary.completed, 'No local compaction summary was stored.'),
    '',
    '## Next Work',
    '',
    formatList(summary.todo, 'No explicit next action was detected in this local summary.'),
  ].join('\n');
}

function buildRolloutCompactionMarkdown(record: CodexMemoryRecord, summary: CodexMemorySummary): string {
  return [
    `# ${record.title}`,
    '',
    `- Memory ID: \`${record.id}\``,
    `- Window: ${record.windowNumber || 'unknown'}`,
    `- Time: ${record.timestamp}`,
    `- Source line: ${record.line}`,
    `- Source rollout: \`${record.rolloutPath}\``,
    '',
    '## Snapshot',
    '',
    summary.topic,
    '',
    '## Compaction Summary',
    '',
    formatList(summary.completed, 'No rollout compaction summary was stored.'),
    '',
    '## Next Work',
    '',
    formatList(summary.todo, 'No explicit next action was detected in this rollout summary.'),
  ].join('\n');
}

function memoryIdFromEvent(event: CompactionEvent): string {
  const payload = event.payload;
  const history = Array.isArray(payload.replacement_history) ? payload.replacement_history : [];
  const last = history.findLast((item) => isRecord(item) && item.type === 'compaction');
  if (isRecord(last)) {
    const id = asString(last.id);
    if (id) return id;
    const encrypted = asString(last.encrypted_content);
    if (encrypted) return `cmp_${sha256(encrypted).slice(0, 32)}`;
  }
  const windowId = asString(payload.window_id);
  if (windowId) return `cmp_${windowId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48)}`;
  return `cmp_${sha256(event.raw).slice(0, 32)}`;
}

function encryptedHashFromEvent(event: CompactionEvent): string | undefined {
  const history = Array.isArray(event.payload.replacement_history) ? event.payload.replacement_history : [];
  const last = history.findLast((item) => isRecord(item) && item.type === 'compaction');
  if (!isRecord(last)) return undefined;
  const encrypted = asString(last.encrypted_content);
  return encrypted ? sha256(encrypted) : undefined;
}

function recordFromEvent(conversationId: string, rolloutPath: string, event: CompactionEvent): CodexMemoryRecord {
  const id = memoryIdFromEvent(event);
  const paths = getCodexMemoryRecordPaths(conversationId, id);
  const summary = buildSummary(event.payload);
  return {
    id,
    windowNumber: asNumber(event.payload.window_number) ?? 0,
    timestamp: event.timestamp,
    line: event.line,
    windowId: asString(event.payload.window_id),
    firstWindowId: asString(event.payload.first_window_id),
    previousWindowId: asString(event.payload.previous_window_id),
    rolloutPath,
    encryptedContentSha256: encryptedHashFromEvent(event),
    markdownPath: relativeToConversationDir(conversationId, paths.markdownPath),
    jsonPath: relativeToConversationDir(conversationId, paths.jsonPath),
    status: 'ready',
    title: summary.topic || `Memory ${asNumber(event.payload.window_number) ?? event.line}`,
    tokenEstimate: Math.ceil(event.raw.length / 4),
    generatedAt: now(),
  };
}

function parseCompactionEvents(raw: string, startLine: number): CompactionEvent[] {
  const lines = raw.split('\n');
  const events: CompactionEvent[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const lineText = lines[i].trim();
    if (!lineText) continue;
    let parsed: JsonRecord;
    try {
      parsed = JSON.parse(lineText) as JsonRecord;
    } catch {
      continue;
    }
    if (parsed.type !== 'compacted' || !isRecord(parsed.payload)) continue;
    events.push({
      line: startLine + i + 1,
      timestamp: asString(parsed.timestamp) ?? new Date(now()).toISOString(),
      payload: parsed.payload,
      raw: lineText,
    });
  }
  return events;
}

function isCompactionMessageText(text: string): boolean {
  return isCodexCompactionMemoryText(text);
}

function extractAssistantOutputText(payload: JsonRecord): string | undefined {
  if (payload.type !== 'message' || payload.role !== 'assistant' || !Array.isArray(payload.content)) return undefined;
  const text = payload.content
    .flatMap((part) => (isRecord(part) ? [asString(part.text)] : []))
    .filter((part): part is string => Boolean(part))
    .join('\n')
    .trim();
  return text || undefined;
}

function parseRolloutCompactionMessages(raw: string, startLine: number): RolloutCompactionMessage[] {
  const lines = raw.split('\n');
  const messages: RolloutCompactionMessage[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i += 1) {
    const lineText = lines[i].trim();
    if (!lineText) continue;
    let parsed: JsonRecord;
    try {
      parsed = JSON.parse(lineText) as JsonRecord;
    } catch {
      continue;
    }

    const payload = isRecord(parsed.payload) ? parsed.payload : undefined;
    const eventMessage =
      parsed.type === 'event_msg' && payload?.type === 'agent_message' ? asString(payload.message) : undefined;
    const assistantMessage = parsed.type === 'response_item' && payload ? extractAssistantOutputText(payload) : undefined;
    const message = eventMessage ?? assistantMessage;
    if (!message || !isCompactionMessageText(message)) continue;

    const key = sha256(message);
    if (seen.has(key)) continue;
    seen.add(key);
    messages.push({
      line: startLine + i + 1,
      timestamp: asString(parsed.timestamp) ?? new Date(now()).toISOString(),
      message,
      raw: lineText,
    });
  }
  return messages;
}

function recordFromLocalCompactionMessage(
  conversationId: string,
  message: LocalCompactionMessage,
  windowNumber: number
): { record: CodexMemoryRecord; summary: CodexMemorySummary; markdown: string } {
  const id = `local_${message.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) || sha256(message.id).slice(0, 16)}`;
  const paths = getCodexMemoryRecordPaths(conversationId, id);
  const timestamp = new Date(message.createdAt).toISOString();
  const summary: CodexMemorySummary = {
    topic: 'Context compacted',
    completed: [truncate(message.content, 600)],
    decisions: [],
    files: [],
    verification: [],
    todo: /下一步|next|目标/i.test(message.content) ? [truncate(message.content, 260)] : [],
  };
  const record: CodexMemoryRecord = {
    id,
    windowNumber,
    timestamp,
    line: 0,
    rolloutPath: 'local-conversation-message',
    markdownPath: relativeToConversationDir(conversationId, paths.markdownPath),
    jsonPath: relativeToConversationDir(conversationId, paths.jsonPath),
    status: 'ready',
    title: truncate(message.content, 96) || 'Context compacted',
    tokenEstimate: Math.ceil(message.content.length / 4),
    generatedAt: now(),
  };
  return {
    record,
    summary,
    markdown: buildLocalCompactionMarkdown(record, summary),
  };
}

function recordFromRolloutCompactionMessage(
  conversationId: string,
  rolloutPath: string,
  message: RolloutCompactionMessage,
  windowNumber: number
): { record: CodexMemoryRecord; summary: CodexMemorySummary; markdown: string } {
  const id = `rollout_${sha256(`${message.timestamp}:${message.message}`).slice(0, 32)}`;
  const paths = getCodexMemoryRecordPaths(conversationId, id);
  const summary: CodexMemorySummary = {
    topic: 'Context compacted',
    completed: [truncate(message.message, 600)],
    decisions: [],
    files: extractPathHints(message.message).slice(0, MAX_EXTRACT_ITEMS),
    verification: [],
    todo: /下一步|next|目标|goal/i.test(message.message) ? [truncate(message.message, 260)] : [],
  };
  const record: CodexMemoryRecord = {
    id,
    windowNumber,
    timestamp: message.timestamp,
    line: message.line,
    rolloutPath,
    markdownPath: relativeToConversationDir(conversationId, paths.markdownPath),
    jsonPath: relativeToConversationDir(conversationId, paths.jsonPath),
    status: 'ready',
    title: truncate(message.message, 96) || 'Context compacted',
    tokenEstimate: Math.ceil(message.raw.length / 4),
    generatedAt: now(),
  };
  return {
    record,
    summary,
    markdown: buildRolloutCompactionMarkdown(record, summary),
  };
}

function recordFromEventCompactionMessage(
  conversationId: string,
  sourcePath: string,
  input: CodexMemoryPersistRequest
): { record: CodexMemoryRecord; summary: CodexMemorySummary; markdown: string } {
  const idSeed = input.messageId || input.turnId || `${input.createdAt ?? now()}:${input.message}`;
  const id = `event_${sha256(idSeed).slice(0, 32)}`;
  const paths = getCodexMemoryRecordPaths(conversationId, id);
  const timestamp = new Date(input.createdAt ?? now()).toISOString();
  const summary: CodexMemorySummary = {
    topic: 'Context compacted',
    completed: [truncate(input.message, 600)],
    decisions: [],
    files: extractPathHints(input.message).slice(0, MAX_EXTRACT_ITEMS),
    verification: [],
    todo: /下一步|next|目标|goal/i.test(input.message) ? [truncate(input.message, 260)] : [],
  };
  const record: CodexMemoryRecord = {
    id,
    windowNumber: 1,
    timestamp,
    line: 0,
    rolloutPath: sourcePath,
    markdownPath: relativeToConversationDir(conversationId, paths.markdownPath),
    jsonPath: relativeToConversationDir(conversationId, paths.jsonPath),
    status: 'ready',
    title: truncate(input.message, 96) || 'Context compacted',
    tokenEstimate: Math.ceil(input.message.length / 4),
    generatedAt: now(),
  };
  return {
    record,
    summary,
    markdown: buildRolloutCompactionMarkdown(record, summary),
  };
}

async function readNewRolloutText(index: CodexMemoryConversationIndex, rolloutPath: string, force: boolean): Promise<{
  raw: string;
  startLine: number;
  size: number;
  mtimeMs: number;
}> {
  const stat = await fs.stat(rolloutPath);
  if (!force && index.rolloutPath === rolloutPath && index.lastScannedSize === stat.size && index.lastScannedMtimeMs === stat.mtimeMs) {
    return { raw: '', startLine: index.lastScannedLine, size: stat.size, mtimeMs: stat.mtimeMs };
  }
  const raw = await fs.readFile(rolloutPath, 'utf8');
  if (force || index.rolloutPath !== rolloutPath || !index.lastScannedLine) {
    return { raw, startLine: 0, size: stat.size, mtimeMs: stat.mtimeMs };
  }
  const lines = raw.split('\n');
  const startLine = Math.min(index.lastScannedLine, lines.length);
  return { raw: lines.slice(startLine).join('\n'), startLine, size: stat.size, mtimeMs: stat.mtimeMs };
}

async function syncLocalCompactionMessages(
  conversationId: string,
  index: CodexMemoryConversationIndex
): Promise<{ index: CodexMemoryConversationIndex; scanned: boolean }> {
  const localMessages = await queryLocalCompactionMessages(conversationId);
  if (!localMessages.length) return { index, scanned: false };

  const existingIds = new Set(index.memories.map((memory) => memory.id));
  const nextMemories = [...index.memories];
  const newDetails: Array<{ record: CodexMemoryRecord; summary: CodexMemorySummary; markdown: string }> = [];
  localMessages.forEach((message, localIndex) => {
    const detail = recordFromLocalCompactionMessage(conversationId, message, localIndex + 1);
    const { record } = detail;
    if (existingIds.has(record.id)) return;
    existingIds.add(record.id);
    nextMemories.push(record);
    newDetails.push(detail);
  });

  if (!newDetails.length) return { index, scanned: false };

  await Promise.all(
    newDetails.map(({ record, summary, markdown }) => writeCodexMemoryDetail(conversationId, record, markdown, summary))
  );

  const memories = nextMemories.toSorted((a, b) => getMemorySortTime(a) - getMemorySortTime(b));
  const nextIndex: CodexMemoryConversationIndex = {
    ...index,
    conversationId,
    memories,
    memoryCount: memories.length,
    lastCompactionId: memories.at(-1)?.id,
    updatedAt: now(),
  };
  await writeCodexMemoryConversationIndex(nextIndex);
  await upsertCodexMemoryGlobalConversation(nextIndex);
  return { index: await readCodexMemoryConversationIndex(conversationId), scanned: true };
}

function getMemorySortTime(memory: CodexMemoryRecord): number {
  const parsed = Date.parse(memory.timestamp);
  return Number.isFinite(parsed) ? parsed : memory.generatedAt ?? 0;
}

async function scanConversationUnlocked(request: CodexMemoryScanRequest): Promise<CodexMemoryScanResult> {
  const dataDir = getCodexMemoryDataDir();
  let index = await readCodexMemoryConversationIndex(request.conversationId);
  const indexRolloutPath = request.rolloutPath ? undefined : index.rolloutPath;
  const resolvedFromRequest = await resolveRolloutPath({
    ...request,
    codexSessionId: request.codexSessionId ?? index.codexSessionId,
    rolloutPath: request.rolloutPath ?? indexRolloutPath,
  });
  const resolved: CodexRolloutResolution =
    indexRolloutPath && resolvedFromRequest.mappingSource === 'request.rolloutPath'
      ? { ...resolvedFromRequest, mappingSource: 'conversation.toml' }
      : resolvedFromRequest;
  if (!resolved.rolloutPath) {
    if (resolved.codexSessionId && resolved.codexSessionId !== index.codexSessionId) {
      const nextIndex: CodexMemoryConversationIndex = {
        ...index,
        codexSessionId: resolved.codexSessionId,
        codexRolloutSessionId: resolved.codexRolloutSessionId ?? index.codexRolloutSessionId,
        workspace: resolved.workspace ?? index.workspace,
        mappingSource: resolved.mappingSource ?? index.mappingSource,
        title: request.conversationTitle ?? index.title,
        updatedAt: now(),
      };
      await writeCodexMemoryConversationIndex(nextIndex);
      await upsertCodexMemoryGlobalConversation(nextIndex);
      index = await readCodexMemoryConversationIndex(request.conversationId);
    }
    const localSync = await syncLocalCompactionMessages(request.conversationId, index);
    if (localSync.index.memories.length > 0) {
      return {
        ok: true,
        conversationId: request.conversationId,
        scanned: localSync.scanned,
        memories: localSync.index.memories,
        dataDir,
      };
    }
    return {
      ok: false,
      conversationId: request.conversationId,
      scanned: false,
      memories: index.memories,
      dataDir,
      error: 'No Codex rollout file was found.',
    };
  }

  const rolloutRead = await readNewRolloutText(index, resolved.rolloutPath, Boolean(request.force));
  const shouldReconcileLocalSummaries =
    !rolloutRead.raw && index.memories.some((memory) => memory.rolloutPath === 'local-conversation-message');
  const rolloutTextForMemory = shouldReconcileLocalSummaries
    ? await fs.readFile(resolved.rolloutPath, 'utf8')
    : rolloutRead.raw;
  const rolloutStartLine = shouldReconcileLocalSummaries ? 0 : rolloutRead.startLine;
  const events = rolloutTextForMemory ? parseCompactionEvents(rolloutTextForMemory, rolloutStartLine) : [];
  const rolloutMessages = rolloutTextForMemory
    ? parseRolloutCompactionMessages(rolloutTextForMemory, rolloutStartLine)
    : [];
  const existingIds = new Set(index.memories.map((memory) => memory.id));
  const nextMemories = [...index.memories];
  for (const event of events) {
    const record = recordFromEvent(request.conversationId, resolved.rolloutPath, event);
    const summary = buildSummary(event.payload);
    const markdown = buildMarkdown(record, summary);
    const readyRecord = await writeCodexMemoryDetail(request.conversationId, record, markdown, summary);
    if (!existingIds.has(readyRecord.id)) {
      existingIds.add(readyRecord.id);
      nextMemories.push(readyRecord);
    } else {
      const idx = nextMemories.findIndex((item) => item.id === readyRecord.id);
      if (idx >= 0) nextMemories[idx] = { ...nextMemories[idx], ...readyRecord };
    }
  }
  for (let i = 0; i < rolloutMessages.length; i += 1) {
    const detail = recordFromRolloutCompactionMessage(
      request.conversationId,
      resolved.rolloutPath,
      rolloutMessages[i],
      i + 1
    );
    const { record } = detail;
    const duplicateLocalIndex = nextMemories.findIndex(
      (memory) =>
        memory.title === record.title &&
        (memory.rolloutPath === 'local-conversation-message' ||
          memory.rolloutPath === 'event-compaction-message' ||
          memory.id.startsWith('local_') ||
          memory.id.startsWith('event_'))
    );
    if (duplicateLocalIndex >= 0) {
      existingIds.delete(nextMemories[duplicateLocalIndex].id);
      nextMemories.splice(duplicateLocalIndex, 1);
    }
    const readyRecord = await writeCodexMemoryDetail(
      request.conversationId,
      record,
      detail.markdown,
      detail.summary
    );
    if (!existingIds.has(readyRecord.id)) {
      existingIds.add(readyRecord.id);
      nextMemories.push(readyRecord);
    } else {
      const idx = nextMemories.findIndex((item) => item.id === readyRecord.id);
      if (idx >= 0) nextMemories[idx] = { ...nextMemories[idx], ...readyRecord };
    }
  }

  const sortedMemories = nextMemories.toSorted((a, b) => a.line - b.line || a.windowNumber - b.windowNumber);

  const nextIndex: CodexMemoryConversationIndex = {
    ...index,
    conversationId: request.conversationId,
    codexSessionId: resolved.codexSessionId ?? index.codexSessionId,
    codexRolloutSessionId: resolved.codexRolloutSessionId ?? index.codexRolloutSessionId,
    rolloutPath: resolved.rolloutPath,
    workspace: resolved.workspace ?? index.workspace ?? request.workspace,
    mappingSource: resolved.mappingSource ?? index.mappingSource,
    title: request.conversationTitle ?? index.title,
    lastScannedLine: rolloutRead.raw ? rolloutRead.startLine + rolloutRead.raw.split('\n').filter((line) => line.length > 0).length : index.lastScannedLine,
    lastScannedSize: rolloutRead.size,
    lastScannedMtimeMs: rolloutRead.mtimeMs,
    memories: sortedMemories,
    memoryCount: sortedMemories.length,
    lastCompactionId: sortedMemories.at(-1)?.id,
    updatedAt: now(),
  };
  await writeCodexMemoryConversationIndex(nextIndex);
  await upsertCodexMemoryGlobalConversation(nextIndex);
  await persistAcpSessionCodexMemoryBinding(request.conversationId, {
    rolloutPath: nextIndex.rolloutPath,
    codexRolloutSessionId: nextIndex.codexRolloutSessionId,
    workspace: nextIndex.workspace,
    mappingSource: nextIndex.mappingSource,
  });
  index = await readCodexMemoryConversationIndex(request.conversationId);
  return {
    ok: true,
    conversationId: request.conversationId,
    scanned: events.length + rolloutMessages.length > 0,
    memories: index.memories,
    dataDir,
  };
}

export async function scanCodexConversationMemory(request: CodexMemoryScanRequest): Promise<CodexMemoryScanResult> {
  const key = request.conversationId;
  const existing = scanLocks.get(key);
  if (existing && !request.force) return existing;
  const task = scanConversationUnlocked(request).finally(() => {
    if (scanLocks.get(key) === task) scanLocks.delete(key);
  });
  scanLocks.set(key, task);
  return task;
}

export async function persistCodexCompactionMemory(
  input: CodexMemoryPersistRequest
): Promise<CodexMemoryPersistResult> {
  const dataDir = getCodexMemoryDataDir();
  const message = safeText(input.message);
  if (!message || !isCompactionMessageText(message)) {
    const index = await readCodexMemoryConversationIndex(input.conversationId);
    return {
      ok: true,
      conversationId: input.conversationId,
      saved: false,
      memories: index.memories,
      dataDir,
    };
  }

  let index = await readCodexMemoryConversationIndex(input.conversationId);
  const eventCreatedAt = input.createdAt ?? now();
  const existingEventId = `event_${sha256(input.messageId || input.turnId || `${eventCreatedAt}:${message}`).slice(0, 32)}`;
  const existing = index.memories.find((memory) => memory.id === existingEventId);
  if (existing) {
    return {
      ok: true,
      conversationId: input.conversationId,
      saved: false,
      memories: index.memories,
      dataDir,
      memory: existing,
    };
  }

  const resolved = await resolveRolloutPath({
    conversationId: input.conversationId,
    rolloutPath: index.rolloutPath,
    codexSessionId: index.codexSessionId,
    workspace: input.workspace ?? index.workspace,
    force: false,
  });
  const mappingSource =
    index.rolloutPath && resolved.mappingSource === 'request.rolloutPath'
      ? 'conversation.toml'
      : resolved.mappingSource;
  const sourcePath = resolved.rolloutPath ?? 'event-compaction-message';
  const detail = recordFromEventCompactionMessage(input.conversationId, sourcePath, {
    ...input,
    message,
    createdAt: eventCreatedAt,
  });
  const readyRecord = await writeCodexMemoryDetail(
    input.conversationId,
    detail.record,
    detail.markdown,
    detail.summary
  );

  const nextMemories = index.memories
    .filter((memory) => !(memory.rolloutPath === 'local-conversation-message' && memory.title === readyRecord.title))
    .filter((memory) => !(memory.rolloutPath === sourcePath && memory.title === readyRecord.title))
    .concat(readyRecord)
    .toSorted((a, b) => getMemorySortTime(a) - getMemorySortTime(b) || a.windowNumber - b.windowNumber);
  const nextIndex: CodexMemoryConversationIndex = {
    ...index,
    conversationId: input.conversationId,
    codexSessionId: resolved.codexSessionId ?? index.codexSessionId,
    codexRolloutSessionId: resolved.codexRolloutSessionId ?? index.codexRolloutSessionId,
    rolloutPath: resolved.rolloutPath ?? index.rolloutPath,
    workspace: resolved.workspace ?? input.workspace ?? index.workspace,
    mappingSource: mappingSource ?? index.mappingSource,
    memories: nextMemories,
    memoryCount: nextMemories.length,
    lastCompactionId: readyRecord.id,
    updatedAt: now(),
  };

  await writeCodexMemoryConversationIndex(nextIndex);
  await upsertCodexMemoryGlobalConversation(nextIndex);
  if (nextIndex.rolloutPath) {
    await persistAcpSessionCodexMemoryBinding(input.conversationId, {
      rolloutPath: nextIndex.rolloutPath,
      codexRolloutSessionId: nextIndex.codexRolloutSessionId,
      workspace: nextIndex.workspace,
      mappingSource: nextIndex.mappingSource,
    });
  }

  index = await readCodexMemoryConversationIndex(input.conversationId);
  return {
    ok: true,
    conversationId: input.conversationId,
    saved: true,
    memories: index.memories,
    dataDir,
    memory: index.memories.find((memory) => memory.id === readyRecord.id) ?? readyRecord,
  };
}

export async function listCodexConversationMemories(conversationId: string): Promise<CodexMemoryListResult> {
  const index = await readCodexMemoryConversationIndex(conversationId);
  return {
    ok: true,
    conversationId,
    memories: index.memories,
    dataDir: getCodexMemoryDataDir(),
    indexPath: resolveConversationRelativePath(conversationId, 'conversation.toml'),
  };
}

export async function getCodexConversationMemoryDetail(request: {
  conversationId: string;
  memoryId: string;
}): Promise<CodexMemoryDetail | undefined> {
  return readCodexMemoryDetail(request.conversationId, request.memoryId);
}
