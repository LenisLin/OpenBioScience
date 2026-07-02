/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'fs';
import path from 'path';
import {
  LEGACY_APP_NAMESPACE,
  LEGACY_LOCAL_RUNTIME_ID,
  LEGACY_LOCAL_RUNTIME_NAME,
  legacyContainsLocalRuntime,
} from '@/common/config/legacyIdentifiers';
import { DEFAULT_CODEX_MODEL_ID } from '@/common/types/codex/codexModels';
import { ensureDirectory, getDataPath } from '@process/utils';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import { runMigrations } from '@process/services/database/migrations';
import {
  CURRENT_DB_VERSION,
  getDatabaseVersion,
  initSchema,
  setDatabaseVersion,
} from '@process/services/database/schema';

const DEFAULT_USER_ID = 'system_default_user';
const DEFAULT_PASSWORD_PLACEHOLDER = '';

export type LegacyDatabaseMigrationResult = {
  dbPath: string;
  backendDbPath: string;
  fromVersion: number | null;
  toVersion: number;
  migrated: boolean;
  deprecatedRuntimeRowsMigrated: number;
  skipped: boolean;
};

export function resolveLegacyDatabasePath(dataDir = getDataPath()): string {
  return path.join(dataDir, `${LEGACY_APP_NAMESPACE}.db`);
}

export function resolveBackendDatabasePath(dataDir = getDataPath()): string {
  return path.join(dataDir, `${LEGACY_APP_NAMESPACE}-backend.db`);
}

function ensureSystemUser(db: ISqliteDriver): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO users (id, username, email, password_hash, avatar_path, created_at, updated_at, last_login, jwt_secret)
     VALUES (?, ?, NULL, ?, NULL, ?, ?, NULL, NULL)`
  ).run(DEFAULT_USER_ID, DEFAULT_USER_ID, DEFAULT_PASSWORD_PLACEHOLDER, now, now);
}

function tableExists(db: ISqliteDriver, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;
  return row?.name === tableName;
}

function columnExists(db: ISqliteDriver, tableName: string, columnName: string): boolean {
  const rows = db.pragma(`table_info(${tableName})`) as Array<{ name?: string }>;
  return Array.isArray(rows) && rows.some((row) => row.name === columnName);
}

function normalizeLegacyLocalRuntimeValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeLegacyLocalRuntimeValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        normalizeLegacyLocalRuntimeValue(entryValue, entryKey),
      ])
    );
  }

  if (value !== LEGACY_LOCAL_RUNTIME_ID && value !== 'yolo') {
    return value;
  }

  switch (key) {
    case 'agent_type':
    case 'conversation_type':
    case 'type':
      return 'acp';
    case 'current_model_id':
    case 'model':
      return 'default';
    case 'mode':
    case 'session_mode':
      return value === 'yolo' ? 'full-access' : 'codex';
    default:
      return 'codex';
  }
}

function parseJsonRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeDeprecatedRuntimeJson(raw: unknown, fallback: Record<string, unknown>): string {
  const value = normalizeLegacyLocalRuntimeValue(parseJsonRecord(raw)) as Record<string, unknown>;

  return JSON.stringify({
    ...value,
    ...fallback,
  });
}

function normalizeTeamAgentsJson(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '[]';
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return raw;
    return JSON.stringify(normalizeLegacyLocalRuntimeValue(parsed));
  } catch {
    return raw;
  }
}

function normalizeJsonText(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim() || !legacyContainsLocalRuntime(raw)) return undefined;
  try {
    return JSON.stringify(normalizeLegacyLocalRuntimeValue(JSON.parse(raw) as unknown));
  } catch {
    return undefined;
  }
}

function resolveCodexAgentId(db: ISqliteDriver): string {
  if (!tableExists(db, 'agent_metadata')) return '8e1acf31';
  const row = db
    .prepare(
      `SELECT id FROM agent_metadata
       WHERE agent_type = 'acp' AND backend = 'codex'
       ORDER BY enabled DESC, sort_order ASC
       LIMIT 1`
    )
    .get() as { id?: string } | undefined;
  return row?.id || '8e1acf31';
}

function updateJsonColumnContainingDeprecatedRuntime(
  db: ISqliteDriver,
  tableName: string,
  idColumnName: string,
  jsonColumnName: string,
  now: number
): number {
  if (!tableExists(db, tableName) || !columnExists(db, tableName, idColumnName) || !columnExists(db, tableName, jsonColumnName)) {
    return 0;
  }

  const rows = db
    .prepare(`SELECT ${idColumnName} AS id, ${jsonColumnName} AS value FROM ${tableName} WHERE ${jsonColumnName} LIKE ?`)
    .all(`%${LEGACY_LOCAL_RUNTIME_ID}%`) as Array<{ id?: string; value?: string }>;
  if (rows.length === 0) return 0;

  const hasUpdatedAt = columnExists(db, tableName, 'updated_at');
  const update = db.prepare(
    `UPDATE ${tableName}
     SET ${jsonColumnName} = ?${hasUpdatedAt ? ', updated_at = ?' : ''}
     WHERE ${idColumnName} = ?`
  );

  let changed = 0;
  for (const row of rows) {
    if (!row.id) continue;
    const normalized = normalizeJsonText(row.value);
    if (!normalized || normalized === row.value) continue;
    const result = hasUpdatedAt ? update.run(normalized, now, row.id) : update.run(normalized, row.id);
    changed += result.changes;
  }
  return changed;
}

function runIfTableHasColumns(
  db: ISqliteDriver,
  tableName: string,
  requiredColumns: string[],
  sql: string,
  ...params: unknown[]
): number {
  if (!tableExists(db, tableName) || !requiredColumns.every((column) => columnExists(db, tableName, column))) {
    return 0;
  }
  return db.prepare(sql).run(...params).changes;
}

function migrateDeprecatedRuntimeRows(db: ISqliteDriver): number {
  let changed = 0;
  const now = Date.now();
  const codexAgentId = resolveCodexAgentId(db);

  if (tableExists(db, 'conversations')) {
    const rows = db
      .prepare(
        `SELECT id, type, extra, model FROM conversations
         WHERE type = ?
            OR extra LIKE ?
            OR model LIKE ?`
      )
      .all(LEGACY_LOCAL_RUNTIME_ID, `%${LEGACY_LOCAL_RUNTIME_ID}%`, `%${LEGACY_LOCAL_RUNTIME_ID}%`) as Array<{
      id?: string;
      type?: string;
      extra?: string;
      model?: string | null;
    }>;

    const update = db.prepare(
      `UPDATE conversations
       SET type = CASE WHEN type = ? THEN 'acp' ELSE type END,
           extra = ?,
           model = CASE WHEN model LIKE ? THEN NULL ELSE model END,
           updated_at = ?
       WHERE id = ?`
    );

    for (const row of rows) {
      if (!row.id) continue;
      const extra = normalizeDeprecatedRuntimeJson(row.extra, {
        backend: 'codex',
        provider_id: 'codex',
        current_model_id: DEFAULT_CODEX_MODEL_ID,
        session_mode: 'full-access',
      });
      const result = update.run(LEGACY_LOCAL_RUNTIME_ID, extra, `%${LEGACY_LOCAL_RUNTIME_ID}%`, now, row.id);
      changed += result.changes;
    }
  }

  if (tableExists(db, 'teams') && columnExists(db, 'teams', 'agents')) {
    const rows = db.prepare('SELECT id, agents FROM teams WHERE agents LIKE ?').all(`%${LEGACY_LOCAL_RUNTIME_ID}%`) as Array<{
      id?: string;
      agents?: string;
    }>;
    const update = db.prepare('UPDATE teams SET agents = ?, updated_at = ? WHERE id = ?');
    for (const row of rows) {
      if (!row.id) continue;
      const result = update.run(normalizeTeamAgentsJson(row.agents), now, row.id);
      changed += result.changes;
    }
  }

  changed += runIfTableHasColumns(
    db,
    'assistant_definitions',
    ['agent_backend', 'updated_at'],
    `UPDATE assistant_definitions
     SET agent_backend = 'codex', updated_at = ?
     WHERE agent_backend = ?`,
    now,
    LEGACY_LOCAL_RUNTIME_ID
  );

  changed += runIfTableHasColumns(
    db,
    'conversation_assistant_snapshots',
    ['agent_backend', 'updated_at'],
    `UPDATE conversation_assistant_snapshots
     SET agent_backend = 'codex', updated_at = ?
     WHERE agent_backend = ?`,
    now,
    LEGACY_LOCAL_RUNTIME_ID
  );

  changed += runIfTableHasColumns(
    db,
    'assistant_overrides',
    ['preset_agent_type', 'updated_at'],
    `UPDATE assistant_overrides
     SET preset_agent_type = 'codex', updated_at = ?
     WHERE preset_agent_type = ?`,
    now,
    LEGACY_LOCAL_RUNTIME_ID
  );

  changed += runIfTableHasColumns(
    db,
    'assistant_sessions',
    ['agent_type', 'last_activity'],
    `UPDATE assistant_sessions
     SET agent_type = 'acp', last_activity = ?
     WHERE agent_type = ?`,
    now,
    LEGACY_LOCAL_RUNTIME_ID
  );

  changed += runIfTableHasColumns(
    db,
    'acp_session',
    [
      'agent_backend',
      'agent_source',
      'agent_id',
      'session_id',
      'session_status',
      'session_config',
      'last_active_at',
      'suspended_at',
    ],
    `UPDATE acp_session
     SET agent_backend = 'codex',
         agent_source = 'builtin',
         agent_id = ?,
         session_id = NULL,
         session_status = 'idle',
         session_config = '{}',
         last_active_at = ?,
         suspended_at = NULL
     WHERE agent_backend = ?
        OR agent_id = ?
        OR agent_id = '632f31d2'
        OR session_config LIKE ?`,
    codexAgentId,
    now,
    LEGACY_LOCAL_RUNTIME_ID,
    LEGACY_LOCAL_RUNTIME_ID,
    `%${LEGACY_LOCAL_RUNTIME_ID}%`
  );

  changed += runIfTableHasColumns(
    db,
    'cron_jobs',
    ['agent_type', 'updated_at'],
    `UPDATE cron_jobs
     SET agent_type = 'acp', updated_at = ?
     WHERE agent_type = ?`,
    now,
    LEGACY_LOCAL_RUNTIME_ID
  );

  changed += updateJsonColumnContainingDeprecatedRuntime(db, 'cron_jobs', 'id', 'agent_config', now);
  changed += updateJsonColumnContainingDeprecatedRuntime(db, 'client_preferences', 'key', 'value', now);

  if (tableExists(db, 'agent_metadata')) {
    const result = db
      .prepare(
        `UPDATE agent_metadata
         SET enabled = 0, updated_at = ?
         WHERE agent_type = ? OR backend = ? OR id = ? OR name = ?`
      )
      .run(now, LEGACY_LOCAL_RUNTIME_ID, LEGACY_LOCAL_RUNTIME_ID, LEGACY_LOCAL_RUNTIME_ID, LEGACY_LOCAL_RUNTIME_NAME);
    changed += result.changes;
  }

  return changed;
}

async function migrateBackendDatabase(dataDir: string): Promise<number> {
  const backendDbPath = resolveBackendDatabasePath(dataDir);
  if (!existsSync(backendDbPath)) {
    return 0;
  }

  const { BetterSqlite3Driver } = await import('@process/services/database/drivers/BetterSqlite3Driver');
  const driver = new BetterSqlite3Driver(backendDbPath);
  try {
    return migrateDeprecatedRuntimeRows(driver);
  } finally {
    driver.close();
  }
}

/**
 * Upgrade legacy Electron-managed SQLite catalogs to the v26 baseline before
 * the backend starts. The driver is opened only for the duration of this
 * one-shot migration pass and is always closed before returning.
 */
export async function runLegacyDatabaseMigrations(
  dbPath = resolveLegacyDatabasePath()
): Promise<LegacyDatabaseMigrationResult> {
  const dataDir = path.dirname(dbPath);
  const backendDbPath = resolveBackendDatabasePath(dataDir);

  if (!existsSync(dbPath)) {
    const deprecatedRuntimeRowsMigrated = await migrateBackendDatabase(dataDir);
    return {
      dbPath,
      backendDbPath,
      fromVersion: null,
      toVersion: CURRENT_DB_VERSION,
      migrated: false,
      deprecatedRuntimeRowsMigrated,
      skipped: true,
    };
  }

  ensureDirectory(path.dirname(dbPath));

  const { BetterSqlite3Driver } = await import('@process/services/database/drivers/BetterSqlite3Driver');
  const driver = new BetterSqlite3Driver(dbPath);

  try {
    initSchema(driver);
    const currentVersion = getDatabaseVersion(driver);

    if (currentVersion < CURRENT_DB_VERSION) {
      runMigrations(driver, currentVersion, CURRENT_DB_VERSION);
      setDatabaseVersion(driver, CURRENT_DB_VERSION);
    }

    ensureSystemUser(driver);

    const deprecatedRuntimeRowsMigrated = await migrateBackendDatabase(dataDir);

    return {
      dbPath,
      backendDbPath,
      fromVersion: currentVersion,
      toVersion: CURRENT_DB_VERSION,
      migrated: currentVersion < CURRENT_DB_VERSION,
      deprecatedRuntimeRowsMigrated,
      skipped: false,
    };
  } finally {
    driver.close();
  }
}
