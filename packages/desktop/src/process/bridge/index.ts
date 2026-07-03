/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initApplicationBridge } from './applicationBridge';
import { initDialogBridge } from './dialogBridge';
import { initUpdateBridge } from './updateBridge';
import { initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWebuiBridge } from './webuiBridge';
import { initThemeBridge } from './themeBridge';
import { initTelemetryBridge } from './telemetryBridge';
import { initLarkAutomationBridge } from './larkAutomationBridge';
import { initLarkProjectAgentBridge } from './larkProjectAgentBridge';
import { initNativeWebPanelBridge } from './nativeWebPanelBridge';
import { initCodexMemoryBridge } from './codexMemoryBridge';
import { initUserInputBridge } from './userInputBridge';
import { initMedicalEvidenceReportBridge } from './medicalEvidenceReportBridge';
import { initMedicalEvidenceSettingsBridge } from './medicalEvidenceSettingsBridge';
import { initScienceArtifactArchiveBridge } from './scienceArtifactArchiveBridge';
import { initScienceArtifactReportBridge } from './scienceArtifactReportBridge';
import { initScienceLatexBridge } from './scienceLatexBridge';
import { initComputeHostsBridge } from './computeHostsBridge';

export type BridgeDependencies = Record<string, never>;

export function initAllBridges(_deps: BridgeDependencies = {}): void {
  initDialogBridge();
  initApplicationBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initTelemetryBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initWebuiBridge();
  initThemeBridge();
  initLarkProjectAgentBridge();
  initLarkAutomationBridge();
  initNativeWebPanelBridge();
  initCodexMemoryBridge();
  initMedicalEvidenceReportBridge();
  initMedicalEvidenceSettingsBridge();
  initComputeHostsBridge();
  initScienceArtifactReportBridge();
  initScienceArtifactArchiveBridge();
  initScienceLatexBridge();
  initUserInputBridge();
}

export {
  initApplicationBridge,
  initDialogBridge,
  initNotificationBridge,
  initSystemSettingsBridge,
  initThemeBridge,
  initTelemetryBridge,
  initUpdateBridge,
  initWindowControlsBridge,
  initWebuiBridge,
  initLarkAutomationBridge,
  initLarkProjectAgentBridge,
  initNativeWebPanelBridge,
  initCodexMemoryBridge,
  initMedicalEvidenceReportBridge,
  initMedicalEvidenceSettingsBridge,
  initComputeHostsBridge,
  initScienceArtifactReportBridge,
  initScienceArtifactArchiveBridge,
  initScienceLatexBridge,
  initUserInputBridge,
};
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
