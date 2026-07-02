/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getPlatformServices } from '@/common/platform';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type {
  CodexMemoryConversationIndex,
  CodexMemoryDetail,
  CodexMemoryGlobalConfig,
  CodexMemoryGlobalConversation,
  CodexMemoryRecord,
  CodexMemorySummary,
} from './types';

const MODULE_DIR_PARTS = ['deepscientist_lark', 'codex_memory'] as const;
const CONFIG_FILE_NAME = 'config.toml';
const CONVERSATION_FILE_NAME = 'conversation.toml';

function now(): number {
  return Date.now();
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

function asStatus(value: unknown): CodexMemoryRecord['status'] {
  return value === 'pending' || value === 'failed' || value === 'stale' || value === 'ready' ? value : 'ready';
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'conversation';
}

export function getCodexMemoryDataDir(): string {
  return path.join(getPlatformServices().paths.getDataDir(), ...MODULE_DIR_PARTS);
}

export function getCodexMemoryConfigPath(): string {
  return path.join(getCodexMemoryDataDir(), CONFIG_FILE_NAME);
}

export function getCodexMemoryConversationDir(conversationId: string): string {
  return path.join(getCodexMemoryDataDir(), 'conversations', sanitizePathPart(conversationId));
}

export function getCodexMemoryConversationIndexPath(conversationId: string): string {
  return path.join(getCodexMemoryConversationDir(conversationId), CONVERSATION_FILE_NAME);
}

export function getCodexMemoryMemoriesDir(conversationId: string): string {
  return path.join(getCodexMemoryConversationDir(conversationId), 'memories');
}

export function getCodexMemoryRecordPaths(conversationId: string, memoryId: string): { markdownPath: string; jsonPath: string } {
  const safeId = sanitizePathPart(memoryId);
  const dir = getCodexMemoryMemoriesDir(conversationId);
  return {
    markdownPath: path.join(dir, `${safeId}.md`),
    jsonPath: path.join(dir, `${safeId}.json`),
  };
}

export function relativeToConversationDir(conversationId: string, filePath: string): string {
  return path.relative(getCodexMemoryConversationDir(conversationId), filePath).replace(/\\/g, '/');
}

export function resolveConversationRelativePath(conversationId: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(getCodexMemoryConversationDir(conversationId), filePath);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function emptyGlobalConfig(): CodexMemoryGlobalConfig {
  return {
    version: 1,
    updatedAt: now(),
    conversations: [],
  };
}

function emptyConversationIndex(conversationId: string): CodexMemoryConversationIndex {
  return {
    version: 1,
    conversationId,
    source: 'codex',
    lastScannedLine: 0,
    memoryCount: 0,
    updatedAt: now(),
    memories: [],
  };
}

function globalConversationFromToml(value: unknown): CodexMemoryGlobalConversation | undefined {
  if (!isRecord(value)) return undefined;
  const conversationId = asString(value.conversation_id ?? value.conversationId);
  if (!conversationId) return undefined;
  return {
    conversationId,
    source: 'codex',
    backend: 'codex',
    codexSessionId: asString(value.codex_session_id ?? value.codexSessionId),
    codexRolloutSessionId: asString(value.codex_rollout_session_id ?? value.codexRolloutSessionId),
    rolloutPath: asString(value.rollout_path ?? value.rolloutPath),
    workspace: asString(value.workspace),
    mappingSource: asString(value.mapping_source ?? value.mappingSource),
    title: asString(value.title),
    memoryIndexPath:
      asString(value.memory_index_path ?? value.memoryIndexPath) ??
      relativeToConversationDir(conversationId, getCodexMemoryConversationIndexPath(conversationId)),
    memoryCount: asNumber(value.memory_count ?? value.memoryCount) ?? 0,
    lastCompactionId: asString(value.last_compaction_id ?? value.lastCompactionId),
    updatedAt: asNumber(value.updated_at ?? value.updatedAt) ?? now(),
  };
}

function memoryRecordFromToml(value: unknown): CodexMemoryRecord | undefined {
  if (!isRecord(value)) return undefined;
  const id = asString(value.id);
  const rolloutPath = asString(value.rollout_path ?? value.rolloutPath);
  const markdownPath = asString(value.markdown_path ?? value.markdownPath);
  const jsonPath = asString(value.json_path ?? value.jsonPath);
  if (!id || !rolloutPath || !markdownPath || !jsonPath) return undefined;
  return {
    id,
    windowNumber: asNumber(value.window_number ?? value.windowNumber) ?? 0,
    timestamp: asString(value.timestamp) ?? new Date(now()).toISOString(),
    line: asNumber(value.line) ?? 0,
    windowId: asString(value.window_id ?? value.windowId),
    firstWindowId: asString(value.first_window_id ?? value.firstWindowId),
    previousWindowId: asString(value.previous_window_id ?? value.previousWindowId),
    rolloutPath,
    encryptedContentSha256: asString(value.encrypted_content_sha256 ?? value.encryptedContentSha256),
    markdownPath,
    jsonPath,
    status: asStatus(value.status),
    title: asString(value.title) ?? id,
    tokenEstimate: asNumber(value.token_estimate ?? value.tokenEstimate),
    generatedAt: asNumber(value.generated_at ?? value.generatedAt),
    error: asString(value.error),
  };
}

function normalizeGlobalConfig(raw: unknown): CodexMemoryGlobalConfig {
  if (!isRecord(raw)) return emptyGlobalConfig();
  const conversations = Array.isArray(raw.conversations)
    ? raw.conversations.map(globalConversationFromToml).filter((item): item is CodexMemoryGlobalConversation => Boolean(item))
    : [];
  return {
    version: 1,
    updatedAt: asNumber(raw.updated_at ?? raw.updatedAt) ?? now(),
    conversations: dedupeGlobalConversations(conversations),
  };
}

function normalizeConversationIndex(raw: unknown, conversationId: string): CodexMemoryConversationIndex {
  if (!isRecord(raw)) return emptyConversationIndex(conversationId);
  const memories = Array.isArray(raw.memories)
    ? raw.memories.map(memoryRecordFromToml).filter((item): item is CodexMemoryRecord => Boolean(item))
    : [];
  const normalizedConversationId = asString(raw.conversation_id ?? raw.conversationId) ?? conversationId;
  const sorted = dedupeMemories(memories);
  return {
    version: 1,
    conversationId: normalizedConversationId,
    source: 'codex',
    codexSessionId: asString(raw.codex_session_id ?? raw.codexSessionId),
    codexRolloutSessionId: asString(raw.codex_rollout_session_id ?? raw.codexRolloutSessionId),
    rolloutPath: asString(raw.rollout_path ?? raw.rolloutPath),
    workspace: asString(raw.workspace),
    mappingSource: asString(raw.mapping_source ?? raw.mappingSource),
    title: asString(raw.title),
    lastScannedLine: asNumber(raw.last_scanned_line ?? raw.lastScannedLine) ?? 0,
    lastScannedSize: asNumber(raw.last_scanned_size ?? raw.lastScannedSize),
    lastScannedMtimeMs: asNumber(raw.last_scanned_mtime_ms ?? raw.lastScannedMtimeMs),
    lastCompactionId: asString(raw.last_compaction_id ?? raw.lastCompactionId) ?? sorted.at(-1)?.id,
    memoryCount: sorted.length,
    updatedAt: asNumber(raw.updated_at ?? raw.updatedAt) ?? now(),
    memories: sorted,
  };
}

function dedupeGlobalConversations(conversations: CodexMemoryGlobalConversation[]): CodexMemoryGlobalConversation[] {
  const map = new Map<string, CodexMemoryGlobalConversation>();
  for (const conversation of conversations) {
    const existing = map.get(conversation.conversationId);
    if (!existing || conversation.updatedAt >= existing.updatedAt) {
      map.set(conversation.conversationId, { ...existing, ...conversation });
    }
  }
  return Array.from(map.values()).toSorted((a, b) => b.updatedAt - a.updatedAt);
}

function dedupeMemories(memories: CodexMemoryRecord[]): CodexMemoryRecord[] {
  const map = new Map<string, CodexMemoryRecord>();
  for (const memory of memories) {
    const existing = map.get(memory.id);
    map.set(memory.id, { ...existing, ...memory });
  }
  return Array.from(map.values()).toSorted((a, b) => a.line - b.line || a.windowNumber - b.windowNumber);
}

function globalConfigToToml(config: CodexMemoryGlobalConfig): Record<string, unknown> {
  return compactRecord({
    version: 1,
    updated_at: config.updatedAt,
    conversations: config.conversations.map((conversation) =>
      compactRecord({
        conversation_id: conversation.conversationId,
        source: conversation.source,
        backend: conversation.backend,
        codex_session_id: conversation.codexSessionId,
        codex_rollout_session_id: conversation.codexRolloutSessionId,
        rollout_path: conversation.rolloutPath,
        workspace: conversation.workspace,
        mapping_source: conversation.mappingSource,
        title: conversation.title,
        memory_index_path: conversation.memoryIndexPath,
        memory_count: conversation.memoryCount,
        last_compaction_id: conversation.lastCompactionId,
        updated_at: conversation.updatedAt,
      })
    ),
  });
}

function conversationIndexToToml(index: CodexMemoryConversationIndex): Record<string, unknown> {
  return compactRecord({
    version: 1,
    conversation_id: index.conversationId,
    source: index.source,
    codex_session_id: index.codexSessionId,
    codex_rollout_session_id: index.codexRolloutSessionId,
    rollout_path: index.rolloutPath,
    workspace: index.workspace,
    mapping_source: index.mappingSource,
    title: index.title,
    last_scanned_line: index.lastScannedLine,
    last_scanned_size: index.lastScannedSize,
    last_scanned_mtime_ms: index.lastScannedMtimeMs,
    last_compaction_id: index.lastCompactionId,
    memory_count: index.memories.length,
    updated_at: index.updatedAt,
    memories: index.memories.map((memory) =>
      compactRecord({
        id: memory.id,
        window_number: memory.windowNumber,
        timestamp: memory.timestamp,
        line: memory.line,
        window_id: memory.windowId,
        first_window_id: memory.firstWindowId,
        previous_window_id: memory.previousWindowId,
        rollout_path: memory.rolloutPath,
        encrypted_content_sha256: memory.encryptedContentSha256,
        markdown_path: memory.markdownPath,
        json_path: memory.jsonPath,
        status: memory.status,
        title: memory.title,
        token_estimate: memory.tokenEstimate,
        generated_at: memory.generatedAt,
        error: memory.error,
      })
    ),
  });
}

export async function readCodexMemoryGlobalConfig(): Promise<CodexMemoryGlobalConfig> {
  try {
    const raw = await fs.readFile(getCodexMemoryConfigPath(), 'utf8');
    return normalizeGlobalConfig(parseToml(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const config = emptyGlobalConfig();
      await writeCodexMemoryGlobalConfig(config);
      return config;
    }
    throw error;
  }
}

export async function writeCodexMemoryGlobalConfig(config: CodexMemoryGlobalConfig): Promise<void> {
  const updated: CodexMemoryGlobalConfig = {
    version: 1,
    updatedAt: now(),
    conversations: dedupeGlobalConversations(config.conversations),
  };
  await ensureDir(getCodexMemoryDataDir());
  await fs.writeFile(getCodexMemoryConfigPath(), `${stringifyToml(globalConfigToToml(updated))}\n`, 'utf8');
}

export async function readCodexMemoryConversationIndex(conversationId: string): Promise<CodexMemoryConversationIndex> {
  try {
    const raw = await fs.readFile(getCodexMemoryConversationIndexPath(conversationId), 'utf8');
    return normalizeConversationIndex(parseToml(raw), conversationId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const index = emptyConversationIndex(conversationId);
      await writeCodexMemoryConversationIndex(index);
      return index;
    }
    throw error;
  }
}

export async function writeCodexMemoryConversationIndex(index: CodexMemoryConversationIndex): Promise<void> {
  const memories = dedupeMemories(index.memories);
  const updated: CodexMemoryConversationIndex = {
    ...index,
    version: 1,
    updatedAt: now(),
    memories,
    memoryCount: memories.length,
    lastCompactionId: index.lastCompactionId ?? memories.at(-1)?.id,
  };
  await ensureDir(getCodexMemoryConversationDir(index.conversationId));
  await fs.writeFile(getCodexMemoryConversationIndexPath(index.conversationId), `${stringifyToml(conversationIndexToToml(updated))}\n`, 'utf8');
}

export async function upsertCodexMemoryGlobalConversation(index: CodexMemoryConversationIndex): Promise<void> {
  const config = await readCodexMemoryGlobalConfig();
  const memoryIndexPath = path
    .relative(getCodexMemoryDataDir(), getCodexMemoryConversationIndexPath(index.conversationId))
    .replace(/\\/g, '/');
  const next: CodexMemoryGlobalConversation = {
    conversationId: index.conversationId,
    source: 'codex',
    backend: 'codex',
    codexSessionId: index.codexSessionId,
    codexRolloutSessionId: index.codexRolloutSessionId,
    rolloutPath: index.rolloutPath,
    workspace: index.workspace,
    mappingSource: index.mappingSource,
    title: index.title,
    memoryIndexPath,
    memoryCount: index.memories.length,
    lastCompactionId: index.lastCompactionId,
    updatedAt: now(),
  };
  await writeCodexMemoryGlobalConfig({
    ...config,
    conversations: [next, ...config.conversations.filter((item) => item.conversationId !== index.conversationId)],
  });
}

export async function writeCodexMemoryDetail(
  conversationId: string,
  record: CodexMemoryRecord,
  markdown: string,
  summary: CodexMemorySummary
): Promise<CodexMemoryRecord> {
  const absoluteMarkdownPath = resolveConversationRelativePath(conversationId, record.markdownPath);
  const absoluteJsonPath = resolveConversationRelativePath(conversationId, record.jsonPath);
  await ensureDir(path.dirname(absoluteMarkdownPath));
  await ensureDir(path.dirname(absoluteJsonPath));
  const nextRecord: CodexMemoryRecord = {
    ...record,
    status: 'ready',
    generatedAt: now(),
  };
  const detail = {
    ...nextRecord,
    conversationId,
    summary,
    markdown,
  };
  await Promise.all([
    fs.writeFile(absoluteMarkdownPath, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8'),
    fs.writeFile(absoluteJsonPath, `${JSON.stringify(detail, null, 2)}\n`, 'utf8'),
  ]);
  return nextRecord;
}

export async function readCodexMemoryDetail(conversationId: string, memoryId: string): Promise<CodexMemoryDetail | undefined> {
  const index = await readCodexMemoryConversationIndex(conversationId);
  const record = index.memories.find((item) => item.id === memoryId);
  if (!record) return undefined;
  const markdownPath = resolveConversationRelativePath(conversationId, record.markdownPath);
  const jsonPath = resolveConversationRelativePath(conversationId, record.jsonPath);
  const [markdownResult, jsonResult] = await Promise.allSettled([
    fs.readFile(markdownPath, 'utf8'),
    fs.readFile(jsonPath, 'utf8'),
  ]);
  const markdown = markdownResult.status === 'fulfilled' ? markdownResult.value : '';
  const json =
    jsonResult.status === 'fulfilled'
      ? (() => {
          try {
            return JSON.parse(jsonResult.value) as { summary?: CodexMemorySummary };
          } catch {
            return undefined;
          }
        })()
      : undefined;
  return {
    ...record,
    conversationId,
    markdown,
    summary: json?.summary,
  };
}
