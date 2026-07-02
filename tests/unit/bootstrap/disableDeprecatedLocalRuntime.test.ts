/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_LOCAL_RUNTIME_ID, LEGACY_LOCAL_RUNTIME_NAME } from '@/common/config/legacyIdentifiers';
import { disableDeprecatedLocalRuntime } from '@/process/utils/disableDeprecatedLocalRuntime';

describe('disableDeprecatedLocalRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('disables deprecated local runtime agent rows while leaving Codex enabled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              { id: 'old-local-runtime', name: LEGACY_LOCAL_RUNTIME_NAME, agent_type: LEGACY_LOCAL_RUNTIME_ID, enabled: true },
              { id: 'codex', name: 'Codex CLI', agent_type: 'acp', backend: 'codex', enabled: true },
            ],
          })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await disableDeprecatedLocalRuntime(42123);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:42123/api/agents?include_disabled=true');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:42123/api/agents/old-local-runtime/enabled',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:42123/api/assistants');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does nothing when the legacy row is already disabled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                id: 'old-local-runtime',
                name: LEGACY_LOCAL_RUNTIME_NAME,
                agent_type: LEGACY_LOCAL_RUNTIME_ID,
                enabled: false,
              },
            ],
          })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await disableDeprecatedLocalRuntime(42123);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('migrates built-in assistants that still point at the deprecated runtime', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              { id: 'dashboard-creator', preset_agent_type: LEGACY_LOCAL_RUNTIME_ID },
              { id: 'codex-helper', preset_agent_type: 'codex' },
            ],
          })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await disableDeprecatedLocalRuntime(42123);

    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:42123/api/assistants');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:42123/api/assistants/dashboard-creator',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ preset_agent_type: 'codex' }),
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('swallows backend failures so startup can continue', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(disableDeprecatedLocalRuntime(42123)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
