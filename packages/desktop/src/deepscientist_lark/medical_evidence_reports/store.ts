/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getPlatformServices } from '@/common/platform';
import type {
  MedicalEvidenceReportListResult,
  MedicalEvidenceReportRecord,
  MedicalEvidenceReportSaveRequest,
  MedicalEvidenceReportSaveResult,
} from './types';

const MODULE_DIR_PARTS = ['deepscientist_lark', 'medical_evidence_reports'] as const;
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

function reportIdFor(request: MedicalEvidenceReportSaveRequest): string {
  const key = [
    request.conversationId,
    request.panel.runId,
    request.textMessageId ?? '',
    request.sourceMessageId ?? '',
  ].join('\n');
  return `medical-evidence-${stableHash(key)}`;
}

function reportIdentity(record: Pick<MedicalEvidenceReportRecord, 'runId' | 'textMessageId' | 'sourceMessageId'>): string {
  return `${record.runId}\n${record.textMessageId ?? ''}\n${record.sourceMessageId ?? ''}`;
}

function normalizeReports(raw: unknown, conversationId: string): MedicalEvidenceReportRecord[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const reports = (raw as { reports?: unknown }).reports;
  if (!Array.isArray(reports)) return [];
  return reports
    .filter((item): item is MedicalEvidenceReportRecord => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const record = item as Partial<MedicalEvidenceReportRecord>;
      return (
        typeof record.id === 'string' &&
        typeof record.runId === 'string' &&
        typeof record.createdAt === 'number' &&
        typeof record.updatedAt === 'number' &&
        Boolean(record.panel)
      );
    })
    .map((record) => ({ ...record, conversationId }))
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function getMedicalEvidenceReportsDataDir(): string {
  return path.join(getPlatformServices().paths.getDataDir(), ...MODULE_DIR_PARTS);
}

export function getMedicalEvidenceReportsConversationDir(conversationId: string): string {
  return path.join(getMedicalEvidenceReportsDataDir(), 'conversations', sanitizePathPart(conversationId));
}

export function getMedicalEvidenceReportsIndexPath(conversationId: string): string {
  return path.join(getMedicalEvidenceReportsConversationDir(conversationId), CONVERSATION_REPORTS_FILE_NAME);
}

async function readConversationReports(conversationId: string): Promise<MedicalEvidenceReportRecord[]> {
  const indexPath = getMedicalEvidenceReportsIndexPath(conversationId);
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
  reports: MedicalEvidenceReportRecord[]
): Promise<void> {
  const indexPath = getMedicalEvidenceReportsIndexPath(conversationId);
  const uniqueReports = Array.from(
    reports
      .toSorted((a, b) => a.updatedAt - b.updatedAt)
      .reduce((map, report) => map.set(reportIdentity(report), report), new Map<string, MedicalEvidenceReportRecord>())
      .values()
  ).toSorted((a, b) => a.createdAt - b.createdAt);
  await ensureDir(path.dirname(indexPath));
  await fs.writeFile(
    indexPath,
    `${JSON.stringify({ version: 1, conversationId, updatedAt: now(), reports: uniqueReports }, null, 2)}\n`,
    'utf8'
  );
}

export async function listMedicalEvidenceReports(
  conversationId: string
): Promise<MedicalEvidenceReportListResult> {
  try {
    const reports = await readConversationReports(conversationId);
    return {
      ok: true,
      conversationId,
      reports,
      dataDir: getMedicalEvidenceReportsDataDir(),
      indexPath: getMedicalEvidenceReportsIndexPath(conversationId),
    };
  } catch (error) {
    return {
      ok: false,
      conversationId,
      reports: [],
      dataDir: getMedicalEvidenceReportsDataDir(),
      indexPath: getMedicalEvidenceReportsIndexPath(conversationId),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function saveMedicalEvidenceReport(
  request: MedicalEvidenceReportSaveRequest
): Promise<MedicalEvidenceReportSaveResult> {
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
    const report: MedicalEvidenceReportRecord = {
      id,
      conversationId: request.conversationId,
      runId: request.panel.runId,
      textMessageId: request.textMessageId,
      sourceMessageId: request.sourceMessageId,
      panel: request.panel,
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
      dataDir: getMedicalEvidenceReportsDataDir(),
    };
  } catch (error) {
    return {
      ok: false,
      conversationId: request.conversationId,
      saved: false,
      dataDir: getMedicalEvidenceReportsDataDir(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
