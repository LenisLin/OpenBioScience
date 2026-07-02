/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import SettingsIcon from '@/renderer/components/icons/SettingsIcon';

describe('SettingsIcon', () => {
  it('renders paired light and dark bitmap assets', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SettingsIcon, { name: 'theme', size: 22, title: 'Theme settings' })
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Theme settings"');
    expect(markup).toContain('width:22px');
    expect(markup).toContain('height:22px');
    expect(markup).toContain('settings-icon__light');
    expect(markup).toContain('settings-icon__dark');
  });
});
