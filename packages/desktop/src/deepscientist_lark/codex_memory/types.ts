/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

export type CodexMemoryStatus = 'pending' | 'ready' | 'failed' | 'stale';

export interface CodexMemoryGlobalConversation {
  conversationId: string;
  source: 'codex';
  backend: 'codex';
  codexSessionId?: string;
  codexRolloutSessionId?: string;
  rolloutPath?: string;
  workspace?: string;
  mappingSource?: string;
  title?: string;
  memoryIndexPath: string;
  memoryCount: number;
  lastCompactionId?: string;
  updatedAt: number;
}

export interface CodexMemoryGlobalConfig {
  version: 1;
  updatedAt: number;
  conversations: CodexMemoryGlobalConversation[];
}

export interface CodexMemorySummary {
  topic: string;
  completed: string[];
  decisions: string[];
  files: string[];
  verification: string[];
  todo: string[];
}

export interface CodexMemoryRecord {
  id: string;
  windowNumber: number;
  timestamp: string;
  line: number;
  windowId?: string;
  firstWindowId?: string;
  previousWindowId?: string;
  rolloutPath: string;
  encryptedContentSha256?: string;
  markdownPath: string;
  jsonPath: string;
  status: CodexMemoryStatus;
  title: string;
  tokenEstimate?: number;
  generatedAt?: number;
  error?: string;
}

export interface CodexMemoryConversationIndex {
  version: 1;
  conversationId: string;
  source: 'codex';
  codexSessionId?: string;
  codexRolloutSessionId?: string;
  rolloutPath?: string;
  workspace?: string;
  mappingSource?: string;
  title?: string;
  lastScannedLine: number;
  lastScannedSize?: number;
  lastScannedMtimeMs?: number;
  lastCompactionId?: string;
  memoryCount: number;
  updatedAt: number;
  memories: CodexMemoryRecord[];
}

export interface CodexMemoryDetail extends CodexMemoryRecord {
  conversationId: string;
  markdown: string;
  summary?: CodexMemorySummary;
}

export interface CodexMemoryScanRequest {
  conversationId: string;
  conversationTitle?: string;
  codexSessionId?: string;
  rolloutPath?: string;
  workspace?: string;
  force?: boolean;
}

export interface CodexMemoryScanResult {
  ok: boolean;
  conversationId: string;
  scanned: boolean;
  memories: CodexMemoryRecord[];
  dataDir: string;
  error?: string;
}

export interface CodexMemoryPersistRequest {
  conversationId: string;
  workspace?: string;
  turnId?: string;
  messageId?: string;
  message: string;
  createdAt?: number;
}

export interface CodexMemoryPersistResult {
  ok: boolean;
  conversationId: string;
  saved: boolean;
  memories: CodexMemoryRecord[];
  dataDir: string;
  memory?: CodexMemoryRecord;
  error?: string;
}

export interface CodexMemoryListResult {
  ok: boolean;
  conversationId: string;
  memories: CodexMemoryRecord[];
  dataDir: string;
  indexPath?: string;
  error?: string;
}
