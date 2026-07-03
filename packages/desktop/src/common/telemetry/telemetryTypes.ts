/**
 * @license
 * Copyright 2026 OpenScience (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

export type TelemetryConsentSettings = {
  diagnostics: boolean;
  update: boolean;
  usage: boolean;
};

export type TelemetryEventCategory = 'diagnostics' | 'update' | 'usage';

export type TelemetryPrimitive = boolean | number | string | null;

export type TelemetryProperties = Record<string, TelemetryPrimitive>;

export type TelemetryEvent = {
  at: string;
  category: TelemetryEventCategory;
  id: string;
  name: string;
  properties?: TelemetryProperties;
};

export type TelemetryTrackRequest = {
  category?: TelemetryEventCategory;
  name: string;
  properties?: Record<string, unknown>;
};

export type TelemetryBatch = {
  appVersion: string;
  arch: string;
  channel: string;
  consent: TelemetryConsentSettings;
  events: TelemetryEvent[];
  installationId: string;
  locale: string;
  platform: NodeJS.Platform;
  schemaVersion: 1;
  sessionId: string;
};

export type TelemetrySettingsSnapshot = {
  consent: TelemetryConsentSettings;
  endpoint: string;
  installationId: string;
  lastFlushAt?: string;
  queuedEvents: number;
};

export type TelemetryTrackResult = {
  flushed?: boolean;
  queued: boolean;
  reason?: string;
};

export type TelemetryFlushResult = {
  sent: number;
  success: boolean;
  remaining: number;
  error?: string;
};
