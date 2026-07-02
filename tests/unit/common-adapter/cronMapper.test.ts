/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { normalizeCronJob, normalizeCronJobs } from '@/common/adapter/cronMapper';

describe('cronMapper', () => {
  it('normalizes legacy flat cron job rows into renderer-safe shape', () => {
    const job = normalizeCronJob({
      id: 'legacy-job',
      title: 'Legacy task',
      enabled: 1,
      schedule_kind: 'cron',
      schedule_value: '0 9 * * *',
      schedule_tz: 'Asia/Shanghai',
      schedule_description: 'Daily at 09:00',
      message: 'Run the report',
      conversation_id: '',
      execution_mode: 'new_conversation',
      agent_type: 'codex',
      agent_config: JSON.stringify({
        backend: 'codex',
        name: 'Codex',
        config_options: { reasoning_effort: 'high' },
      }),
      next_run_at_ms: 1000,
      last_status: 'success',
      created_at_ms: 1,
      updated_at_ms: 2,
    });

    expect(job).toMatchObject({
      id: 'legacy-job',
      name: 'Legacy task',
      enabled: true,
      schedule: {
        kind: 'cron',
        expr: '0 9 * * *',
        tz: 'Asia/Shanghai',
        description: 'Daily at 09:00',
      },
      target: {
        payload: { kind: 'message', text: 'Run the report' },
        execution_mode: 'new_conversation',
      },
      metadata: {
        conversation_id: '',
        agent_type: 'codex',
        created_by: 'user',
        created_at: 1,
        updated_at: 2,
        agent_config: {
          backend: 'codex',
          name: 'Codex',
          config_options: { reasoning_effort: 'high' },
        },
      },
      state: {
        next_run_at_ms: 1000,
        last_status: 'ok',
        run_count: 0,
        retry_count: 0,
        max_retries: 0,
      },
    });
  });

  it('returns an empty list for non-array payloads', () => {
    expect(normalizeCronJobs({ success: true })).toEqual([]);
  });
});
