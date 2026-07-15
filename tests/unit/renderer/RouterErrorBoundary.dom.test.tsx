/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Router from '@/renderer/components/layout/Router';

vi.mock('@/renderer/services/i18n', () => ({
  default: {
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  Result: ({
    title,
    subTitle,
    extra,
  }: {
    title?: React.ReactNode;
    subTitle?: React.ReactNode;
    extra?: React.ReactNode;
  }) => (
    <section role='alert'>
      <h1>{title}</h1>
      <p>{subTitle}</p>
      {extra}
    </section>
  ),
  Notification: { warning: vi.fn() },
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated' }),
}));

vi.mock('@renderer/hooks/config/useConfig', () => ({
  useConfig: () => [false],
}));

vi.mock('@renderer/pages/onboarding/onboardingState', () => ({
  shouldShowOnboarding: () => false,
}));

vi.mock('@renderer/pages/conversation', () => ({
  default: () => {
    throw new Error('conversation route crashed');
  },
}));

vi.mock('@renderer/pages/guid', () => ({
  default: () => <div>guid page</div>,
}));

vi.mock('@renderer/pages/settings/ModeSettings', () => ({
  default: () => <div>settings</div>,
}));

describe('Router route error boundary', () => {
  it('renders a recoverable error screen when a lazy route crashes', async () => {
    window.location.hash = '#/conversation/abc';

    render(<Router layout={<Outlet />} />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('conversation route crashed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
