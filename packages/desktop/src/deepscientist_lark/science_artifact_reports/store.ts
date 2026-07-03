/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SCIENCE_PANEL_SCHEMA } from '@/common/chat/science';
import { getPlatformServices } from '@/common/platform';
import type {
  ScienceArtifactReportListResult,
  ScienceArtifactReportRecord,
  ScienceArtifactReportSaveRequest,
  ScienceArtifactReportSaveResult,
} from './types';

const MODULE_DIR_PARTS = ['deepscientist_lark', 'science_artifact_reports'] as const;
const CONVERSATION_REPORTS_FILE_NAME = 'reports.json';

function now(): number {
  return Date.now();
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'conversation';
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function reportIdFor(request: ScienceArtifactReportSaveRequest): string {
  const key = [
    request.conversationId,
    request.panel.runId,
    request.textMessageId ?? '',
    request.sourceMessageId ?? '',
  ].join('\n');
  return `science-artifact-${stableHash(key)}`;
}

function reportIdentity(
  record: Pick<ScienceArtifactReportRecord, 'runId' | 'textMessageId' | 'sourceMessageId'>
): string {
  return `${record.runId}\n${record.textMessageId ?? ''}\n${record.sourceMessageId ?? ''}`;
}

function normalizeReports(raw: unknown, conversationId: string): ScienceArtifactReportRecord[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const reports = (raw as { reports?: unknown }).reports;
  if (!Array.isArray(reports)) return [];
  return reports
    .filter((item): item is ScienceArtifactReportRecord => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const record = item as Partial<ScienceArtifactReportRecord>;
      return (
        typeof record.id === 'string' &&
        typeof record.runId === 'string' &&
        typeof record.createdAt === 'number' &&
        typeof record.updatedAt === 'number' &&
        Boolean(record.panel) &&
        record.panel?.schema === SCIENCE_PANEL_SCHEMA
      );
    })
    .map((record) => Object.assign(record, { conversationId }))
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function getScienceArtifactReportsDataDir(): string {
  return path.join(getPlatformServices().paths.getDataDir(), ...MODULE_DIR_PARTS);
}

export function getScienceArtifactReportsConversationDir(conversationId: string): string {
  return path.join(getScienceArtifactReportsDataDir(), 'conversations', sanitizePathPart(conversationId));
}

export function getScienceArtifactReportsIndexPath(conversationId: string): string {
  return path.join(getScienceArtifactReportsConversationDir(conversationId), CONVERSATION_REPORTS_FILE_NAME);
}

async function readConversationReports(conversationId: string): Promise<ScienceArtifactReportRecord[]> {
  const indexPath = getScienceArtifactReportsIndexPath(conversationId);
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    return normalizeReports(JSON.parse(raw) as unknown, conversationId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeConversationReports(
  conversationId: string,
  reports: ScienceArtifactReportRecord[]
): Promise<void> {
  const indexPath = getScienceArtifactReportsIndexPath(conversationId);
  const uniqueReports = Array.from(
    reports
      .toSorted((a, b) => a.updatedAt - b.updatedAt)
      .reduce(
        (map, report) => map.set(reportIdentity(report), report),
        new Map<string, ScienceArtifactReportRecord>()
      )
      .values()
  ).toSorted((a, b) => a.createdAt - b.createdAt);
  await ensureDir(path.dirname(indexPath));
  await fs.writeFile(
    indexPath,
    `${JSON.stringify({ version: 1, conversationId, updatedAt: now(), reports: uniqueReports }, null, 2)}\n`,
    'utf8'
  );
}

export async function listScienceArtifactReports(
  conversationId: string
): Promise<ScienceArtifactReportListResult> {
  try {
    const reports = await readConversationReports(conversationId);
    return {
      ok: true,
      conversationId,
      reports,
      dataDir: getScienceArtifactReportsDataDir(),
      indexPath: getScienceArtifactReportsIndexPath(conversationId),
    };
  } catch (error) {
    return {
      ok: false,
      conversationId,
      reports: [],
      dataDir: getScienceArtifactReportsDataDir(),
      indexPath: getScienceArtifactReportsIndexPath(conversationId),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function saveScienceArtifactReport(
  request: ScienceArtifactReportSaveRequest
): Promise<ScienceArtifactReportSaveResult> {
  try {
    const reports = await readConversationReports(request.conversationId);
    const id = reportIdFor(request);
    const existing = reports.find(
      (report) =>
        report.runId === request.panel.runId &&
        (report.textMessageId ?? '') === (request.textMessageId ?? '') &&
        (report.sourceMessageId ?? '') === (request.sourceMessageId ?? '')
    );
    const timestamp = now();
    const report: ScienceArtifactReportRecord = {
      id,
      conversationId: request.conversationId,
      runId: request.panel.runId,
      textMessageId: request.textMessageId,
      sourceMessageId: request.sourceMessageId,
      projectRoot: request.panel.projectRoot,
      panel: {
        ...request.panel,
        conversationId: request.panel.conversationId || request.conversationId,
      },
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await writeConversationReports(request.conversationId, [
      ...reports.filter((item) => item.id !== id && reportIdentity(item) !== reportIdentity(report)),
      report,
    ]);
    return {
      ok: true,
      conversationId: request.conversationId,
      saved: true,
      report,
      dataDir: getScienceArtifactReportsDataDir(),
    };
  } catch (error) {
    return {
      ok: false,
      conversationId: request.conversationId,
      saved: false,
      dataDir: getScienceArtifactReportsDataDir(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
