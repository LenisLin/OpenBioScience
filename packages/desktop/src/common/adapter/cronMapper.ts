/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronAgentConfig, ICronJob, ICronSchedule } from './ipcBridge';

type AnyRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is AnyRecord => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const toRecord = (value: unknown): AnyRecord => {
  if (isRecord(value)) return value;
  return {};
};

const parseJsonRecord = (value: unknown): AnyRecord => {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return toRecord(parsed);
  } catch {
    return {};
  }
};

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
};

const firstNonEmptyString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const text = firstString(value);
    if (text?.trim()) {
      return text.trim();
    }
  }
  return undefined;
};

const firstNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
      const parsedDate = Date.parse(value);
      if (Number.isFinite(parsedDate)) {
        return parsedDate;
      }
    }
  }
  return undefined;
};

const firstBoolean = (...values: unknown[]): boolean | undefined => {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'enabled', 'active', 'ok'].includes(normalized)) return true;
      if (['false', '0', 'no', 'disabled', 'paused', 'inactive'].includes(normalized)) return false;
    }
  }
  return undefined;
};

const normalizeExecutionMode = (value: unknown, conversationId: string): 'existing' | 'new_conversation' => {
  return value === 'new_conversation' || (!value && !conversationId) ? 'new_conversation' : 'existing';
};

const normalizeStatus = (value: unknown): ICronJob['state']['last_status'] | undefined => {
  const status = firstNonEmptyString(value)?.toLowerCase();
  if (!status) return undefined;
  if (status === 'success' || status === 'completed') return 'ok';
  if (status === 'ok' || status === 'error' || status === 'skipped' || status === 'missed') {
    return status;
  }
  return undefined;
};

function normalizeSchedule(raw: AnyRecord): ICronSchedule {
  const schedule = toRecord(raw.schedule);
  const kind = firstNonEmptyString(schedule.kind, raw.schedule_kind);
  const description = firstString(schedule.description, raw.schedule_description) ?? '';

  if (kind === 'at') {
    return {
      kind: 'at',
      atMs: firstNumber(schedule.atMs, schedule.at_ms, schedule.at, raw.schedule_value) ?? 0,
      description,
    };
  }

  if (kind === 'every') {
    return {
      kind: 'every',
      everyMs: firstNumber(schedule.everyMs, schedule.every_ms, schedule.every, raw.schedule_value) ?? 0,
      description,
    };
  }

  const expr = firstString(schedule.expr, schedule.cron, schedule.value, raw.schedule_value) ?? '';
  const tz = firstNonEmptyString(schedule.tz, schedule.timezone, raw.schedule_tz, raw.timezone);
  return {
    kind: 'cron',
    expr,
    ...(tz ? { tz } : {}),
    description: description || expr,
  };
}

function normalizeAgentConfig(value: unknown): ICronAgentConfig | undefined {
  const config = parseJsonRecord(value);
  if (Object.keys(config).length === 0) return undefined;

  const configOptions = parseJsonRecord(config.config_options);
  return {
    backend: firstNonEmptyString(config.backend, config.agent_type) ?? '',
    name: firstNonEmptyString(config.name, config.backend, config.agent_type) ?? '',
    cli_path: firstString(config.cli_path, config.cliPath),
    is_preset: firstBoolean(config.is_preset, config.isPreset),
    custom_agent_id: firstString(config.custom_agent_id, config.customAgentId),
    preset_agent_type: firstString(config.preset_agent_type, config.presetAgentType),
    mode: firstString(config.mode),
    model_id: firstString(config.model_id, config.modelId),
    config_options:
      Object.keys(configOptions).length > 0
        ? Object.fromEntries(Object.entries(configOptions).map(([key, entry]) => [key, String(entry)]))
        : undefined,
    workspace: firstString(config.workspace),
  };
}

/**
 * Normalize backend cron rows into the renderer's current ICronJob shape.
 *
 * Older databases and in-flight websocket events can miss nested `target`,
 * `metadata`, or `state` fields. Rendering code expects those objects to exist;
 * normalizing here keeps the UI from crashing when it opens the scheduled-tasks
 * route against legacy rows.
 */
export function normalizeCronJob(raw: unknown): ICronJob {
  const record = toRecord(raw);
  const metadataRecord = toRecord(record.metadata);
  const stateRecord = toRecord(record.state);
  const targetRecord = toRecord(record.target);
  const payloadRecord = toRecord(targetRecord.payload);
  const actionRecord = toRecord(record.action);
  const agentConfig = normalizeAgentConfig(metadataRecord.agent_config ?? record.agent_config);

  const id = firstNonEmptyString(record.id, record.job_id, record.cron_job_id) ?? 'unknown-cron-job';
  const conversationId =
    firstString(metadataRecord.conversation_id, metadataRecord.conversationId, record.conversation_id) ?? '';
  const status = firstNonEmptyString(
    stateRecord.last_status,
    stateRecord.status,
    metadataRecord.status,
    record.last_status,
    record.status
  );
  const enabled = firstBoolean(record.enabled, stateRecord.enabled) ?? status !== 'paused';
  const createdAt =
    firstNumber(metadataRecord.created_at, metadataRecord.created_at_ms, record.created_at, record.created_at_ms) ?? 0;
  const updatedAt =
    firstNumber(metadataRecord.updated_at, metadataRecord.updated_at_ms, record.updated_at, record.updated_at_ms) ??
    createdAt;
  const executionMode = normalizeExecutionMode(
    firstString(targetRecord.execution_mode, targetRecord.executionMode, record.execution_mode, record.executionMode),
    conversationId
  );

  return {
    id,
    name:
      firstNonEmptyString(record.name, record.title, metadataRecord.conversation_title, record.schedule_description) ??
      id,
    description: firstString(record.description),
    enabled,
    schedule: normalizeSchedule(record),
    target: {
      payload: {
        kind: 'message',
        text:
          firstString(payloadRecord.text, targetRecord.text, targetRecord.message, record.message, record.prompt) ??
          firstString(actionRecord.command) ??
          '',
      },
      execution_mode: executionMode,
    },
    metadata: {
      conversation_id: conversationId,
      conversation_title: firstString(metadataRecord.conversation_title, record.conversation_title),
      agent_type:
        firstNonEmptyString(metadataRecord.agent_type, record.agent_type, agentConfig?.preset_agent_type) ?? 'acp',
      created_by: metadataRecord.created_by === 'agent' || record.created_by === 'agent' ? 'agent' : 'user',
      created_at: createdAt,
      updated_at: updatedAt,
      ...(agentConfig ? { agent_config: agentConfig } : {}),
    },
    state: {
      next_run_at_ms: firstNumber(stateRecord.next_run_at_ms, stateRecord.nextRunAtMs, record.next_run_at_ms),
      last_run_at_ms: firstNumber(stateRecord.last_run_at_ms, stateRecord.lastRunAtMs, record.last_run_at_ms),
      last_status: normalizeStatus(status),
      last_error: firstString(stateRecord.last_error, stateRecord.lastError, record.last_error),
      run_count: firstNumber(stateRecord.run_count, stateRecord.runCount, record.run_count) ?? 0,
      retry_count: firstNumber(stateRecord.retry_count, stateRecord.retryCount, record.retry_count) ?? 0,
      max_retries: firstNumber(stateRecord.max_retries, stateRecord.maxRetries, record.max_retries) ?? 0,
    },
  };
}

export function normalizeCronJobs(raw: unknown): ICronJob[] {
  return Array.isArray(raw) ? raw.map(normalizeCronJob) : [];
}
