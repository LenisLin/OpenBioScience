/**
 * @license
 * Copyright 2026 OpenScience (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TelemetryEvent } from '@/common/telemetry/telemetryTypes';
import fs from 'node:fs';
import path from 'node:path';

const TELEMETRY_QUEUE_FILE = 'telemetry-queue.json';
const MAX_QUEUE_EVENTS = 500;

export type TelemetryQueueState = {
  events: TelemetryEvent[];
  lastFlushAt?: string;
};

const emptyQueue = (): TelemetryQueueState => ({ events: [] });

export function getTelemetryQueuePath(userDataPath: string): string {
  return path.join(userDataPath, TELEMETRY_QUEUE_FILE);
}

export function readTelemetryQueue(userDataPath: string): TelemetryQueueState {
  const filePath = getTelemetryQueuePath(userDataPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<TelemetryQueueState>;
    const events = Array.isArray(parsed.events)
      ? parsed.events.filter((event): event is TelemetryEvent => {
          if (!event || typeof event !== 'object') return false;
          return (
            typeof event.id === 'string' &&
            typeof event.name === 'string' &&
            typeof event.at === 'string' &&
            ['update', 'usage', 'diagnostics'].includes(String(event.category))
          );
        })
      : [];
    return {
      events: events.slice(-MAX_QUEUE_EVENTS),
      lastFlushAt: typeof parsed.lastFlushAt === 'string' ? parsed.lastFlushAt : undefined,
    };
  } catch {
    return emptyQueue();
  }
}

export function writeTelemetryQueue(userDataPath: string, state: TelemetryQueueState): void {
  const filePath = getTelemetryQueuePath(userDataPath);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          events: state.events.slice(-MAX_QUEUE_EVENTS),
          lastFlushAt: state.lastFlushAt,
        },
        null,
        2
      ),
      { mode: 0o600 }
    );
  } catch {
    // Telemetry storage must never interfere with the app startup or update path.
  }
}

export function appendTelemetryEvent(userDataPath: string, event: TelemetryEvent): TelemetryQueueState {
  const state = readTelemetryQueue(userDataPath);
  const next = {
    ...state,
    events: [...state.events, event].slice(-MAX_QUEUE_EVENTS),
  };
  writeTelemetryQueue(userDataPath, next);
  return next;
}

export function replaceTelemetryEvents(
  userDataPath: string,
  events: TelemetryEvent[],
  lastFlushAt?: string
): TelemetryQueueState {
  const state = {
    events: events.slice(-MAX_QUEUE_EVENTS),
    lastFlushAt,
  };
  writeTelemetryQueue(userDataPath, state);
  return state;
}
