/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AgentStatusIcon from '@/renderer/components/icons/AgentStatusIcon';

describe('AgentStatusIcon', () => {
  it('renders paired light and dark bitmap assets', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentStatusIcon, { name: 'fileEditing', size: 20, title: 'Editing file' })
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Editing file"');
    expect(markup).toContain('width:20px');
    expect(markup).toContain('height:20px');
    expect(markup).toContain('agent-status-icon__light');
    expect(markup).toContain('agent-status-icon__dark');
  });

  it('marks loading icons as spinning when requested', () => {
    const markup = renderToStaticMarkup(React.createElement(AgentStatusIcon, { name: 'loading', spin: true }));

    expect(markup).toContain('agent-status-icon--spin');
  });

  it.each(['test', 'build', 'install', 'server', 'permission', 'inspect'] as const)(
    'renders the generated %s status icon',
    (name) => {
      const markup = renderToStaticMarkup(React.createElement(AgentStatusIcon, { name, size: 18 }));

      expect(markup).toContain('agent-status-icon__light');
      expect(markup).toContain('agent-status-icon__dark');
      expect(markup).toContain('width:18px');
    }
  );
});
