/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';
import ScienceSettings from '@/renderer/pages/settings/ScienceSettings';
import { DEFAULT_SCIENCE_SKILL_IDS } from '@/common/chat/science';
import {
  SCIENCE_SKILL_PACK_COUNTS,
  SCIENCE_SKILL_PACK_MANIFEST_PATH,
} from '@/common/chat/scienceSkills.generated';

const { invokeMock, getMock, setMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getMock: vi.fn(),
  setMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const defaultValue = typeof options?.defaultValue === 'string' ? options.defaultValue : undefined;
      if (defaultValue) return defaultValue;
      if (key === 'settings.science.defaultSkillPackDesc') {
        return `default:${String(options?.total)} external:${String(options?.external)}`;
      }
      if (key === 'settings.science.skillPackManifest') {
        return `manifest:${String(options?.path)}`;
      }
      return key;
    },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    medicalEvidenceSettings: {
      testPaperclipConnection: {
        invoke: invokeMock,
      },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: getMock,
    set: setMock,
  },
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/pages/settings/components/PaperclipApiGuide', () => ({
  default: () => <div data-testid='paperclip-guide' />,
}));

describe('ScienceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockReturnValue(undefined);
    invokeMock.mockResolvedValue({ ok: true });
  });

  it('renders the AcademicForge vendor card and materialized skill counts', () => {
    render(
      <ConfigProvider>
        <ScienceSettings />
      </ConfigProvider>
    );

    expect(screen.getByText('HughYau/AcademicForge')).toBeInTheDocument();
    expect(screen.getByText(String(SCIENCE_SKILL_PACK_COUNTS.academicforge))).toBeInTheDocument();
    expect(screen.getByText(`${SCIENCE_SKILL_PACK_COUNTS.academicforge} skills`)).toBeInTheDocument();
    expect(screen.getByText('MIT')).toBeInTheDocument();
  });

  it('renders the generated default skill pack summary and manifest path', () => {
    render(
      <ConfigProvider>
        <ScienceSettings />
      </ConfigProvider>
    );

    expect(
      screen.getByText(`default:${DEFAULT_SCIENCE_SKILL_IDS.length} external:${SCIENCE_SKILL_PACK_COUNTS.total}`)
    ).toBeInTheDocument();
    expect(screen.getByText(`manifest:${SCIENCE_SKILL_PACK_MANIFEST_PATH}`)).toBeInTheDocument();
  });

  it('renders vendor pack totals for all configured materialized sources', () => {
    render(
      <ConfigProvider>
        <ScienceSettings />
      </ConfigProvider>
    );

    expect(screen.getByText('OpenBioScience Core')).toBeInTheDocument();
    expect(screen.getByText('Workflow')).toBeInTheDocument();
    expect(screen.getByText('DeepScientist')).toBeInTheDocument();
    expect(screen.getByText('K-Dense')).toBeInTheDocument();
    expect(screen.getByText('Nature Skills')).toBeInTheDocument();
    expect(screen.getByText('AcademicForge')).toBeInTheDocument();

    expect(screen.getByText(String(SCIENCE_SKILL_PACK_COUNTS.deepscientist))).toBeInTheDocument();
    expect(screen.getByText(String(SCIENCE_SKILL_PACK_COUNTS.kdense))).toBeInTheDocument();
    expect(screen.getByText(String(SCIENCE_SKILL_PACK_COUNTS.natureSkills))).toBeInTheDocument();
  });
});
