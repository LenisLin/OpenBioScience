/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SciencePanelData } from '@/common/chat/science';

export interface ScienceArtifactReportRecord {
  id: string;
  conversationId: string;
  runId: string;
  textMessageId?: string;
  sourceMessageId?: string;
  projectRoot?: string;
  panel: SciencePanelData;
  createdAt: number;
  updatedAt: number;
}

export interface ScienceArtifactReportListResult {
  ok: boolean;
  conversationId: string;
  reports: ScienceArtifactReportRecord[];
  dataDir: string;
  indexPath?: string;
  error?: string;
}

export interface ScienceArtifactReportSaveRequest {
  conversationId: string;
  textMessageId?: string;
  sourceMessageId?: string;
  panel: SciencePanelData;
}

export interface ScienceArtifactReportSaveResult {
  ok: boolean;
  conversationId: string;
  saved: boolean;
  report?: ScienceArtifactReportRecord;
  dataDir: string;
  error?: string;
}
