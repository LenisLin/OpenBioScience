/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ensureAdminPassword,
  type EnsureAdminPasswordDeps,
} from '../../../packages/web-cli/src/ensureAdminPassword.js';

function makeDeps(): {
  deps: EnsureAdminPasswordDeps;
  logs: string[];
} {
  const logs: string[] = [];
  const deps: EnsureAdminPasswordDeps = {
    fetch: vi.fn(async () => new Response('{}')) as unknown as typeof fetch,
    log: (msg) => logs.push(msg),
    warn: vi.fn(),
    sleep: vi.fn(async () => {}),
    now: vi.fn(() => 0),
  };
  return { deps, logs };
}

describe('ensureAdminPassword', () => {
  it('does not contact backend or seed passwords in no-login mode', async () => {
    const { deps, logs } = makeDeps();

    await ensureAdminPassword({ backendPort: 25808 }, deps);

    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.warn).not.toHaveBeenCalled();
    expect(deps.sleep).not.toHaveBeenCalled();
    expect(logs).toEqual([
      '[openscience-web] OpenScience WebUI uses no app-level login; open the URL directly.',
    ]);
  });
});
