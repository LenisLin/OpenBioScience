/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MedicalEvidencePanelData } from '@/common/chat/medicalEvidence';

export interface MedicalEvidenceReportRecord {
  id: string;
  conversationId: string;
  runId: string;
  textMessageId?: string;
  sourceMessageId?: string;
  panel: MedicalEvidencePanelData;
  createdAt: number;
  updatedAt: number;
}

export interface MedicalEvidenceReportListResult {
  ok: boolean;
  conversationId: string;
  reports: MedicalEvidenceReportRecord[];
  dataDir: string;
  indexPath?: string;
  error?: string;
}

export interface MedicalEvidenceReportSaveRequest {
  conversationId: string;
  textMessageId?: string;
  sourceMessageId?: string;
  panel: MedicalEvidencePanelData;
}

export interface MedicalEvidenceReportSaveResult {
  ok: boolean;
  conversationId: string;
  saved: boolean;
  report?: MedicalEvidenceReportRecord;
  dataDir: string;
  error?: string;
}
