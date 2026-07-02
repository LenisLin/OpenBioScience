/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 *
 * OpenScience no longer requires an app-level WebUI login. This compatibility
 * helper is kept so older CLI startup code can call the same function without
 * seeding or printing an administrator password.
 */

export type EnsureAdminPasswordDeps = {
  fetch: typeof fetch;
  log: (msg: string) => void;
  warn: (msg: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export type EnsureAdminPasswordOptions = {
  /** 127.0.0.1 port where DeepOrganiser Core listens (from WebHostHandle.backendPort). */
  backendPort: number;
  statusTimeoutMs?: number;
  statusPollIntervalMs?: number;
};

export async function ensureAdminPassword(
  _opts: EnsureAdminPasswordOptions,
  deps: EnsureAdminPasswordDeps
): Promise<void> {
  deps.log('[deeporganiser-web] OpenScience WebUI uses no app-level login; open the URL directly.');
}
