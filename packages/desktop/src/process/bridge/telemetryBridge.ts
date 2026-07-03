/**
 * @license
 * Copyright 2026 OpenScience (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  flushTelemetryNow,
  getTelemetrySettingsSnapshot,
  setTelemetryConsent,
  trackTelemetryEvent,
} from '@process/services/telemetry/telemetryClient';

export function initTelemetryBridge(): void {
  ipcBridge.telemetry.getSettings.provider(async () => {
    try {
      return { success: true, data: await getTelemetrySettingsSnapshot() };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.telemetry.setConsent.provider(async (settings) => {
    try {
      return { success: true, data: await setTelemetryConsent(settings ?? {}) };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.telemetry.track.provider(async (event) => {
    try {
      return { success: true, data: await trackTelemetryEvent(event) };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.telemetry.flush.provider(async () => {
    try {
      return { success: true, data: await flushTelemetryNow() };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });
}
