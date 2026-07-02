/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  listMedicalEvidenceReports,
  saveMedicalEvidenceReport,
} from '@/deepscientist_lark/medical_evidence_reports/store';

export function initMedicalEvidenceReportBridge(): void {
  ipcBridge.medicalEvidenceReports.list.provider(({ conversationId }) => listMedicalEvidenceReports(conversationId));
  ipcBridge.medicalEvidenceReports.save.provider(async (request) => {
    const result = await saveMedicalEvidenceReport(request);
    if (result.ok && result.saved) {
      ipcBridge.medicalEvidenceReports.changed.emit({
        conversationId: result.conversationId,
        reportId: result.report?.id,
      });
    }
    return result;
  });
}
