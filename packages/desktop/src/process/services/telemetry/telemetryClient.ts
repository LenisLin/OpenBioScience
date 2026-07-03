/**
 * @license
 * Copyright 2026 OpenScience (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  TelemetryBatch,
  TelemetryConsentSettings,
  TelemetryEvent,
  TelemetryEventCategory,
  TelemetryFlushResult,
  TelemetryProperties,
  TelemetrySettingsSnapshot,
  TelemetryTrackRequest,
  TelemetryTrackResult,
} from '@/common/telemetry/telemetryTypes';
import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { ProcessConfig } from '@process/utils/initStorage';
import { getOrCreateAnalyticsId } from '@process/utils/analyticsId';
import { getUpdateBaseUrl } from '../updateFeed';
import { appendTelemetryEvent, readTelemetryQueue, replaceTelemetryEvents } from './telemetryStore';

const SCHEMA_VERSION = 1;
const MAX_BATCH_EVENTS = 50;
const SESSION_ID = randomUUID();
const TELEMETRY_DISABLED = process.env.DEEPORGANISER_TELEMETRY_DISABLED === '1';
const TELEMETRY_ENDPOINT =
  process.env.DEEPORGANISER_TELEMETRY_ENDPOINT?.trim() || `${getUpdateBaseUrl()}/api/telemetry/events`;
const TELEMETRY_WRITE_TOKEN = process.env.DEEPORGANISER_TELEMETRY_WRITE_TOKEN?.trim();

let flushTimer: NodeJS.Timeout | null = null;
let flushInFlight: Promise<TelemetryFlushResult> | null = null;

const DEFAULT_CONSENT: TelemetryConsentSettings = {
  diagnostics: false,
  update: true,
  usage: false,
};

const isAllowedCategory = (category: string): category is TelemetryEventCategory =>
  category === 'update' || category === 'usage' || category === 'diagnostics';

function inferCategory(name: string): TelemetryEventCategory {
  if (name.startsWith('update.') || name.startsWith('auto_update.')) return 'update';
  if (name.includes('error') || name.includes('diagnostic')) return 'diagnostics';
  return 'usage';
}

function normalizeEventName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
}

function redactString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(sk|pk|app_secret|token|password)[-_A-Za-z0-9]{8,}/gi, '[redacted]')
    .replace(/\/Users\/[^/\s]+/g, '/Users/[redacted]')
    .replace(/[A-Z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\[redacted]')
    .slice(0, 240);
}

function sanitizeProperties(properties?: Record<string, unknown>): TelemetryProperties | undefined {
  if (!properties) return undefined;
  const sanitized: TelemetryProperties = {};
  for (const [rawKey, rawValue] of Object.entries(properties)) {
    const key = rawKey
      .trim()
      .replace(/[^A-Za-z0-9_.:-]+/g, '_')
      .slice(0, 64);
    if (!key) continue;

    // Never accept content-bearing or identity-bearing keys through the generic telemetry path.
    if (
      /(prompt|content|body|message|text|file|path|token|secret|password|email|username|userName|displayName)/.test(
        key
      )
    ) {
      continue;
    }

    if (rawValue === null || typeof rawValue === 'boolean') {
      sanitized[key] = rawValue as boolean | null;
    } else if (typeof rawValue === 'number') {
      if (Number.isFinite(rawValue)) sanitized[key] = rawValue;
    } else if (typeof rawValue === 'string') {
      sanitized[key] = redactString(rawValue);
    }
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
}

async function getConsent(): Promise<TelemetryConsentSettings> {
  if (TELEMETRY_DISABLED) {
    return { diagnostics: false, update: false, usage: false };
  }

  const [update, usage, diagnostics] = await Promise.all([
    ProcessConfig.get('telemetry.updateEnabled').catch((): undefined => undefined),
    ProcessConfig.get('telemetry.usageEnabled').catch((): undefined => undefined),
    ProcessConfig.get('telemetry.diagnosticsEnabled').catch((): undefined => undefined),
  ]);
  return {
    diagnostics: diagnostics ?? DEFAULT_CONSENT.diagnostics,
    update: update ?? DEFAULT_CONSENT.update,
    usage: usage ?? DEFAULT_CONSENT.usage,
  };
}

function canSendCategory(consent: TelemetryConsentSettings, category: TelemetryEventCategory): boolean {
  return category === 'update' ? consent.update : category === 'usage' ? consent.usage : consent.diagnostics;
}

function getUserDataPath(): string {
  try {
    return app.getPath('userData');
  } catch {
    return process.cwd();
  }
}

function buildEvent(input: TelemetryTrackRequest): TelemetryEvent | undefined {
  const name = normalizeEventName(input.name);
  if (!name) return undefined;
  const category = input.category && isAllowedCategory(input.category) ? input.category : inferCategory(name);
  return {
    at: new Date().toISOString(),
    category,
    id: randomUUID(),
    name,
    properties: sanitizeProperties(input.properties),
  };
}

function buildBatch(events: TelemetryEvent[], consent: TelemetryConsentSettings): TelemetryBatch {
  return {
    appVersion: app.getVersion(),
    arch: process.arch,
    channel: app.isPackaged ? 'stable' : 'dev',
    consent,
    events,
    installationId: getOrCreateAnalyticsId(),
    locale: app.getLocale?.() || process.env.LANG || 'en-US',
    platform: process.platform,
    schemaVersion: SCHEMA_VERSION,
    sessionId: SESSION_ID,
  };
}

export async function getTelemetrySettingsSnapshot(): Promise<TelemetrySettingsSnapshot> {
  const queue = readTelemetryQueue(getUserDataPath());
  return {
    consent: await getConsent(),
    endpoint: TELEMETRY_ENDPOINT,
    installationId: getOrCreateAnalyticsId(),
    lastFlushAt: queue.lastFlushAt,
    queuedEvents: queue.events.length,
  };
}

export async function setTelemetryConsent(partial: Partial<TelemetryConsentSettings>): Promise<TelemetrySettingsSnapshot> {
  const current = await getConsent();
  const next = {
    diagnostics: partial.diagnostics ?? current.diagnostics,
    update: partial.update ?? current.update,
    usage: partial.usage ?? current.usage,
  };

  await Promise.all([
    ProcessConfig.set('telemetry.updateEnabled', next.update),
    ProcessConfig.set('telemetry.usageEnabled', next.usage),
    ProcessConfig.set('telemetry.diagnosticsEnabled', next.diagnostics),
  ]);

  await trackTelemetryEvent({
    category: 'update',
    name: 'telemetry.consent_changed',
    properties: {
      diagnostics: next.diagnostics,
      update: next.update,
      usage: next.usage,
    },
  });
  scheduleTelemetryFlush(1000);

  return getTelemetrySettingsSnapshot();
}

export async function trackTelemetryEvent(input: TelemetryTrackRequest): Promise<TelemetryTrackResult> {
  const event = buildEvent(input);
  if (!event) return { queued: false, reason: 'invalid-event' };

  const consent = await getConsent();
  if (!canSendCategory(consent, event.category)) {
    return { queued: false, reason: 'disabled' };
  }

  const queue = appendTelemetryEvent(getUserDataPath(), event);
  if (event.category === 'update' || queue.events.length >= 10) {
    scheduleTelemetryFlush(1000);
  }
  return { queued: true };
}

export function scheduleTelemetryFlush(delayMs = 5000): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushTelemetryNow();
  }, delayMs);
}

export async function flushTelemetryNow(): Promise<TelemetryFlushResult> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const userDataPath = getUserDataPath();
    const queue = readTelemetryQueue(userDataPath);
    if (!queue.events.length) {
      return { remaining: 0, sent: 0, success: true };
    }

    const consent = await getConsent();
    const sendable = queue.events.filter((event) => canSendCategory(consent, event.category));
    const droppedIds = new Set(queue.events.filter((event) => !canSendCategory(consent, event.category)).map((event) => event.id));
    if (!sendable.length) {
      replaceTelemetryEvents(userDataPath, [], new Date().toISOString());
      return { remaining: 0, sent: 0, success: true };
    }

    const batchEvents = sendable.slice(0, MAX_BATCH_EVENTS);
    const batchIds = new Set(batchEvents.map((event) => event.id));
    const batch = buildBatch(batchEvents, consent);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'OpenScience',
      };
      if (TELEMETRY_WRITE_TOKEN) headers['X-OpenScience-Telemetry-Token'] = TELEMETRY_WRITE_TOKEN;

      const response = await fetch(TELEMETRY_ENDPOINT, {
        body: JSON.stringify(batch),
        headers,
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`telemetry upload failed: ${response.status}`);
      }

      const flushedAt = new Date().toISOString();
      const remaining = queue.events.filter((event) => !batchIds.has(event.id) && !droppedIds.has(event.id));
      replaceTelemetryEvents(userDataPath, remaining, flushedAt);
      if (remaining.length) scheduleTelemetryFlush(10_000);
      return { remaining: remaining.length, sent: batchEvents.length, success: true };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        remaining: queue.events.length,
        sent: 0,
        success: false,
      };
    }
  })();

  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}
