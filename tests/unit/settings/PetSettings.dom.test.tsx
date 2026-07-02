/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPetTransitionLogs: vi.fn(),
  configGet: vi.fn(),
  configSetLocal: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: React.ReactNode;
    description?: React.ReactNode;
    label: React.ReactNode;
  }) => (
    <div>
      <div>{label}</div>
      {description ? <div>{description}</div> : null}
      <div>{children}</div>
    </div>
  ),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: mocks.configGet,
    setLocal: mocks.configSetLocal,
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  systemSettings: {
    setPetEnabled: { invoke: vi.fn() },
    setPetSize: { invoke: vi.fn() },
    setPetStyle: { invoke: vi.fn() },
    setPetPersonality: { invoke: vi.fn() },
    setPetDnd: { invoke: vi.fn() },
    setPetConfirmEnabled: { invoke: vi.fn() },
    getPetTransitionLogs: { invoke: mocks.getPetTransitionLogs },
  },
}));

import PetSettings from '@/renderer/pages/settings/PetSettings';

describe('PetSettings diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configGet.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'pet.enabled': true,
        'pet.size': 280,
        'pet.style': 'deepscientist',
        'pet.personality': 'balanced',
        'pet.dnd': false,
        'pet.confirmEnabled': true,
      };
      return values[key];
    });
    mocks.getPetTransitionLogs.mockResolvedValue([
      {
        id: 7,
        at: Date.parse('2026-06-24T02:30:00.000Z'),
        from: 'working',
        to: 'attention',
        reason: 'watchdog',
        detail: 'AI activity timed out after 120000ms from working',
        elapsedMs: 120_000,
        dnd: false,
      },
    ]);
  });

  it('opens a detail modal for a diagnostic transition row', async () => {
    render(<PetSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'pet.diagnosticsOpen' }));

    await waitFor(() => {
      expect(mocks.getPetTransitionLogs).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(await screen.findByRole('button', { name: /working -> attention/ }));

    expect(await screen.findByText('pet.diagnosticsDetailTitle')).toBeInTheDocument();
    expect(screen.getByText('watchdog')).toBeInTheDocument();
    expect(screen.getAllByText('AI activity timed out after 120000ms from working').length).toBeGreaterThan(0);
    expect(screen.getByText(/"reason": "watchdog"/)).toBeInTheDocument();
  });
});
