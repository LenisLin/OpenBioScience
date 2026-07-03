/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  listScienceArtifactReports,
  saveScienceArtifactReport,
} from '@/deepscientist_lark/science_artifact_reports/store';

export function initScienceArtifactReportBridge(): void {
  ipcBridge.scienceArtifactReports.list.provider(({ conversationId }) =>
    listScienceArtifactReports(conversationId)
  );
  ipcBridge.scienceArtifactReports.save.provider(async (request) => {
    const result = await saveScienceArtifactReport(request);
    if (result.ok && result.saved) {
      ipcBridge.scienceArtifactReports.changed.emit({
        conversationId: result.conversationId,
        reportId: result.report?.id,
      });
    }
    return result;
  });
}
