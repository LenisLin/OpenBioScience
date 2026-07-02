/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import SendBoxIcon from '@/renderer/components/icons/SendBoxIcon';

describe('SendBoxIcon', () => {
  it('renders paired light and dark bitmap assets', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SendBoxIcon, { name: 'send', size: 20, title: 'Send message' })
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Send message"');
    expect(markup).toContain('width:20px');
    expect(markup).toContain('height:20px');
    expect(markup).toContain('sendbox-icon__light');
    expect(markup).toContain('sendbox-icon__dark');
  });
});
