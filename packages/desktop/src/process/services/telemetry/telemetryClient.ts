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
  TelemetryHardwareSnapshot,
  TelemetryProperties,
  TelemetrySettingsSnapshot,
  TelemetryTrackRequest,
  TelemetryTrackResult,
} from '@/common/telemetry/telemetryTypes';
import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
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
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const TELEMETRY_WEEKLY_FLUSH_DAY = clampInt(
  Number.parseInt(process.env.DEEPORGANISER_TELEMETRY_WEEKLY_FLUSH_DAY ?? '1', 10),
  0,
  6,
  1
);
const TELEMETRY_WEEKLY_FLUSH_HOUR = clampInt(
  Number.parseInt(process.env.DEEPORGANISER_TELEMETRY_WEEKLY_FLUSH_HOUR ?? '10', 10),
  0,
  23,
  10
);
const TELEMETRY_WEEKLY_FLUSH_MINUTE = clampInt(
  Number.parseInt(process.env.DEEPORGANISER_TELEMETRY_WEEKLY_FLUSH_MINUTE ?? '0', 10),
  0,
  59,
  0
);
const TELEMETRY_WEEKLY_FLUSH_WINDOW_MS =
  clampInt(Number.parseInt(process.env.DEEPORGANISER_TELEMETRY_WEEKLY_FLUSH_WINDOW_MINUTES ?? '360', 10), 1, 1440, 360) *
  60 *
  1000;

let flushTimer: NodeJS.Timeout | null = null;
let flushInFlight: Promise<TelemetryFlushResult> | null = null;

const DEFAULT_CONSENT: TelemetryConsentSettings = {
  diagnostics: false,
  update: true,
  usage: false,
};

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

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

function sanitizeHardwareString(value: unknown, limit = 160): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = redactString(value).replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, limit) : undefined;
}

function stringifyHardwareId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 40);
  return undefined;
}

function normalizeGpuInfo(raw: unknown): TelemetryHardwareSnapshot['gpu'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const info = raw as {
    featureStatus?: Record<string, unknown>;
    gpuDevice?: Array<Record<string, unknown>>;
  };
  const devices = Array.isArray(info.gpuDevice)
    ? info.gpuDevice.slice(0, 8).map((device) => ({
        active: typeof device.active === 'boolean' ? device.active : undefined,
        device: sanitizeHardwareString(device.deviceString ?? device.device),
        deviceId: stringifyHardwareId(device.deviceId),
        vendor: sanitizeHardwareString(device.vendorString ?? device.vendor),
        vendorId: stringifyHardwareId(device.vendorId),
      }))
    : undefined;

  const featureStatus: Record<string, string> = {};
  if (info.featureStatus && typeof info.featureStatus === 'object') {
    for (const [key, value] of Object.entries(info.featureStatus).slice(0, 30)) {
      if (typeof value !== 'string') continue;
      const safeKey = key.replace(/[^A-Za-z0-9_.:-]+/g, '_').slice(0, 64);
      const safeValue = sanitizeHardwareString(value, 80);
      if (safeKey && safeValue) featureStatus[safeKey] = safeValue;
    }
  }

  const normalized: TelemetryHardwareSnapshot['gpu'] = {};
  if (devices?.length) normalized.devices = devices;
  if (Object.keys(featureStatus).length) normalized.featureStatus = featureStatus;
  return normalized.devices || normalized.featureStatus ? normalized : undefined;
}

async function collectHardwareSnapshot(): Promise<TelemetryHardwareSnapshot | undefined> {
  const cpus = os.cpus();
  const firstCpu = cpus[0];
  const totalBytes = os.totalmem();
  const hardware: TelemetryHardwareSnapshot = {
    cpu: {
      architecture: process.arch,
      logicalCores: cpus.length || undefined,
      model: sanitizeHardwareString(firstCpu?.model),
      speedMHz: Number.isFinite(firstCpu?.speed) ? firstCpu.speed : undefined,
    },
    memory: Number.isFinite(totalBytes)
      ? {
          totalBytes,
          totalGb: Math.round((totalBytes / 1024 / 1024 / 1024) * 10) / 10,
        }
      : undefined,
  };

  try {
    hardware.gpu = normalizeGpuInfo(await app.getGPUInfo('basic'));
  } catch {
    // GPU details are best-effort only; missing values must not block telemetry.
  }

  return hardware.cpu || hardware.memory || hardware.gpu ? hardware : undefined;
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
      /(prompt|content|body|message|text|file|path|token|secret|password|email|username|userName|displayName|cpu|memory|ram|gpu|vram|hardware|device)/i.test(
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

async function buildBatch(events: TelemetryEvent[], consent: TelemetryConsentSettings): Promise<TelemetryBatch> {
  return {
    appVersion: app.getVersion(),
    arch: process.arch,
    channel: app.isPackaged ? 'stable' : 'dev',
    consent,
    events,
    hardware: consent.update || consent.diagnostics ? await collectHardwareSnapshot() : undefined,
    installationId: getOrCreateAnalyticsId(),
    locale: app.getLocale?.() || process.env.LANG || 'en-US',
    platform: process.platform,
    schemaVersion: SCHEMA_VERSION,
    sessionId: SESSION_ID,
  };
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function weeklyAnchorFor(reference: Date): Date {
  const anchor = new Date(reference);
  const dayDiff = (anchor.getDay() - TELEMETRY_WEEKLY_FLUSH_DAY + 7) % 7;
  anchor.setDate(anchor.getDate() - dayDiff);
  anchor.setHours(TELEMETRY_WEEKLY_FLUSH_HOUR, TELEMETRY_WEEKLY_FLUSH_MINUTE, 0, 0);
  return anchor;
}

function nextWeeklyAnchorAfter(reference: Date): Date {
  const anchor = weeklyAnchorFor(reference);
  if (anchor.getTime() <= reference.getTime()) {
    anchor.setTime(anchor.getTime() + WEEK_MS);
  }
  return anchor;
}

function getWeeklyFlushWindow(lastAttemptAt?: string, now = new Date()): {
  due: boolean;
  nextFlushAt: string;
  waitMs: number;
} {
  const currentAnchor = weeklyAnchorFor(now);
  const lastAttempt = parseDate(lastAttemptAt);
  const currentAnchorTime = currentAnchor.getTime();
  const withinWeeklyWindow =
    now.getTime() >= currentAnchorTime && now.getTime() - currentAnchorTime <= TELEMETRY_WEEKLY_FLUSH_WINDOW_MS;
  const due = withinWeeklyWindow && (!lastAttempt || lastAttempt.getTime() < currentAnchorTime);
  const next =
    due || now.getTime() < currentAnchorTime
      ? currentAnchor
      : now.getTime() <= currentAnchorTime + TELEMETRY_WEEKLY_FLUSH_WINDOW_MS
        ? nextWeeklyAnchorAfter(currentAnchor)
        : nextWeeklyAnchorAfter(now);
  return {
    due,
    nextFlushAt: next.toISOString(),
    waitMs: Math.max(0, next.getTime() - now.getTime()),
  };
}

export async function getTelemetrySettingsSnapshot(): Promise<TelemetrySettingsSnapshot> {
  const queue = readTelemetryQueue(getUserDataPath());
  const window = getWeeklyFlushWindow(queue.lastAttemptAt);
  return {
    consent: await getConsent(),
    endpoint: TELEMETRY_ENDPOINT,
    installationId: getOrCreateAnalyticsId(),
    lastAttemptAt: queue.lastAttemptAt,
    lastFlushAt: queue.lastFlushAt,
    nextFlushAt: window.nextFlushAt,
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
  scheduleTelemetryFlush();

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
  if (queue.events.length >= 1) scheduleTelemetryFlush();
  return { queued: true };
}

export function scheduleTelemetryFlush(delayMs = 5000): void {
  if (flushTimer) return;
  const queue = readTelemetryQueue(getUserDataPath());
  const window = getWeeklyFlushWindow(queue.lastAttemptAt);
  const scheduledDelay = window.due ? delayMs : window.waitMs;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushTelemetryNow();
  }, Math.min(Math.max(0, scheduledDelay), MAX_TIMER_DELAY_MS));
}

export async function flushTelemetryNow(): Promise<TelemetryFlushResult> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const userDataPath = getUserDataPath();
    const queue = readTelemetryQueue(userDataPath);
    if (!queue.events.length) {
      return { remaining: 0, sent: 0, success: true };
    }

    const window = getWeeklyFlushWindow(queue.lastAttemptAt);
    if (!window.due) {
      scheduleTelemetryFlush();
      return {
        nextFlushAt: window.nextFlushAt,
        reason: 'weekly-window-not-due',
        remaining: queue.events.length,
        sent: 0,
        success: true,
      };
    }

    const consent = await getConsent();
    const sendable = queue.events.filter((event) => canSendCategory(consent, event.category));
    const droppedIds = new Set(queue.events.filter((event) => !canSendCategory(consent, event.category)).map((event) => event.id));
    if (!sendable.length) {
      const now = new Date().toISOString();
      replaceTelemetryEvents(userDataPath, [], now, queue.lastAttemptAt);
      return { remaining: 0, sent: 0, success: true };
    }

    const batchEvents = sendable.slice(0, MAX_BATCH_EVENTS);
    const batchIds = new Set(batchEvents.map((event) => event.id));
    const batch = await buildBatch(batchEvents, consent);
    const attemptAt = new Date().toISOString();
    replaceTelemetryEvents(userDataPath, queue.events, queue.lastFlushAt, attemptAt);

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
      replaceTelemetryEvents(userDataPath, remaining, flushedAt, flushedAt);
      if (remaining.length) scheduleTelemetryFlush();
      return {
        nextFlushAt: getWeeklyFlushWindow(flushedAt).nextFlushAt,
        remaining: remaining.length,
        sent: batchEvents.length,
        success: true,
      };
    } catch (error) {
      replaceTelemetryEvents(userDataPath, queue.events, queue.lastFlushAt, attemptAt);
      return {
        error: error instanceof Error ? error.message : String(error),
        nextFlushAt: getWeeklyFlushWindow(attemptAt).nextFlushAt,
        remaining: queue.events.length,
        reason: 'weekly-attempt-failed',
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
