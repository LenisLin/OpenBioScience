/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/utils/model/agentTypes.ts → fetchManagedAgents.
 * The settings management fetcher must hit the dedicated `getManagedAgents`
 * bridge (`/api/agents?include_disabled=true`), never the picker-safe
 * `getAvailableAgents` endpoint, and degrade to [] on failure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LEGACY_LOCAL_RUNTIME_ID, LEGACY_LOCAL_RUNTIME_NAME } from '@/common/config/legacyIdentifiers';

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getAvailableAgents: { invoke: vi.fn() },
      getManagedAgents: { invoke: vi.fn() },
    },
  },
}));

import { fetchDetectedAgents, fetchManagedAgents } from '@/renderer/utils/model/agentTypes';
import { ipcBridge } from '@/common';

describe('fetchManagedAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns rows from the include_disabled (managed) bridge', async () => {
    const rows = [{ id: 'd', name: 'D', agent_type: 'acp', agent_source: 'custom', enabled: false, available: false }];
    (ipcBridge.acpConversation.getManagedAgents.invoke as any).mockResolvedValue(rows);

    await expect(fetchManagedAgents()).resolves.toEqual(rows);
    expect(ipcBridge.acpConversation.getManagedAgents.invoke).toHaveBeenCalledTimes(1);
    // Must NOT fall back to the picker-safe endpoint.
    expect(ipcBridge.acpConversation.getAvailableAgents.invoke).not.toHaveBeenCalled();
  });

  it('filters deprecated local runtime rows from detected and managed agents', async () => {
    const rows = [
      {
        id: LEGACY_LOCAL_RUNTIME_ID,
        name: LEGACY_LOCAL_RUNTIME_NAME,
        agent_type: LEGACY_LOCAL_RUNTIME_ID,
        backend: LEGACY_LOCAL_RUNTIME_ID,
        agent_source: 'internal',
      },
      { id: 'codex', name: 'Codex', agent_type: 'acp', backend: 'codex', agent_source: 'builtin' },
    ];
    (ipcBridge.acpConversation.getAvailableAgents.invoke as any).mockResolvedValue(rows);
    (ipcBridge.acpConversation.getManagedAgents.invoke as any).mockResolvedValue(rows);

    await expect(fetchDetectedAgents()).resolves.toEqual([rows[1]]);
    await expect(fetchManagedAgents()).resolves.toEqual([rows[1]]);
  });

  it('returns [] when the bridge rejects', async () => {
    (ipcBridge.acpConversation.getManagedAgents.invoke as any).mockRejectedValue(new Error('boom'));

    await expect(fetchManagedAgents()).resolves.toEqual([]);
  });

  it('returns [] when the bridge yields a non-array', async () => {
    (ipcBridge.acpConversation.getManagedAgents.invoke as any).mockResolvedValue(undefined);

    await expect(fetchManagedAgents()).resolves.toEqual([]);
  });
});
