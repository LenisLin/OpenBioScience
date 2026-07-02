/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { normalizeCronJob } from '@/common/adapter/cronMapper';

const navigateMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'cron.page.scheduleDesc.dailyAt') return `Daily at ${params?.time}`;
      return key;
    },
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(() => false),
    setLocal: vi.fn(),
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  systemSettings: {
    setKeepAwake: { invoke: vi.fn() },
  },
}));

vi.mock('@renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({
    cliAgents: [],
    presetAssistants: [],
  }),
}));

const legacyJob = normalizeCronJob({
  id: 'legacy-job',
  name: 'Legacy task',
  enabled: true,
  schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 09:00' },
  target: undefined,
  metadata: undefined,
  state: undefined,
} as unknown as ICronJob);

vi.mock('@renderer/pages/cron/useCronJobs', () => ({
  useAllCronJobs: () => ({
    jobs: [legacyJob],
    loading: false,
    pauseJob: vi.fn(),
    resumeJob: vi.fn(),
  }),
}));

import ScheduledTasksPage from '@/renderer/pages/cron/ScheduledTasksPage';

describe('ScheduledTasksPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('renders a legacy task without crashing the route', async () => {
    render(
      <MemoryRouter initialEntries={['/scheduled']}>
        <ScheduledTasksPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Legacy task')).toBeInTheDocument();
    expect(screen.getByText('cron.page.form.newConversation')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('定时任务加载失败')).not.toBeInTheDocument();
    });
  });
});
