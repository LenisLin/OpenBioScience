/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectThemeMock = vi.fn();
const { messageSuccessMock, messageErrorMock } = vi.hoisted(() => ({
  messageSuccessMock: vi.fn(),
  messageErrorMock: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    success: messageSuccessMock,
    error: messageErrorMock,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'settings.cssTheme.followSystem' ? 'Follow System' : key),
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext.tsx', () => ({
  useThemeContext: () => ({
    activeTheme: { id: 'light', appearance: 'light' },
    activeId: 'light',
    selectTheme: selectThemeMock,
  }),
}));

import CssThemeSettings from '@/renderer/pages/settings/AppearanceSettings/CssThemeSettings';

describe('CssThemeSettings', () => {
  beforeEach(() => {
    selectThemeMock.mockClear();
    messageSuccessMock.mockClear();
    messageErrorMock.mockClear();
  });

  it('renders only the three built-in appearance choices with generated covers', () => {
    const { container } = render(<CssThemeSettings />);

    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('Follow System')).toBeInTheDocument();

    const choices = screen.getAllByRole('radio');
    expect(choices).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Follow System' })).toHaveAttribute('aria-checked', 'false');

    const cards = Array.from(container.querySelectorAll('.theme-preview-card'));
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      const cardElement = card as HTMLElement;
      expect(cardElement.style.aspectRatio).toBe('16 / 9');
      expect(cardElement.style.backgroundImage).toContain('deepscientist-theme-');
      expect(cardElement.style.backgroundSize).toBe('cover');
    }
  });

  it('selects a theme through the accessible card button', async () => {
    const user = userEvent.setup();
    render(<CssThemeSettings />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(selectThemeMock).toHaveBeenCalledWith('dark');
    expect(messageSuccessMock).toHaveBeenCalledWith('settings.cssTheme.applied');
  });
});
