/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import AgentOutputIcon, { getAgentOutputFileIconName } from '@/renderer/components/icons/AgentOutputIcon';

describe('getAgentOutputFileIconName', () => {
  it.each([
    ['README.md', 'markdown'],
    ['notes.mdx', 'markdown'],
    ['paper.pdf', 'pdf'],
    ['proposal.docx', 'word'],
    ['draft.rtf', 'word'],
    ['table.xlsx', 'excel'],
    ['data.tsv', 'table'],
    ['data.csv', 'table'],
    ['slides.pptx', 'ppt'],
    ['deck.key', 'ppt'],
    ['figure.svg', 'image'],
    ['voice.mp3', 'audio'],
    ['clip.webm', 'video'],
    ['archive.zip', 'archive'],
    ['app.sqlite', 'database'],
    ['analysis.ipynb', 'notebook'],
    ['run.log', 'text'],
    ['settings.yaml', 'config'],
    ['package.json', 'config'],
    ['patch.diff', 'diff'],
    ['changes.patch', 'diff'],
    ['main.tsx', 'code'],
    ['unknown.binary', 'file'],
  ] as const)('maps %s to %s', (fileName, iconName) => {
    expect(getAgentOutputFileIconName(fileName)).toBe(iconName);
  });

  it('uses preview content type when provided', () => {
    expect(getAgentOutputFileIconName('download', 'word')).toBe('word');
    expect(getAgentOutputFileIconName('download', 'excel')).toBe('excel');
    expect(getAgentOutputFileIconName('download', 'ppt')).toBe('ppt');
    expect(getAgentOutputFileIconName('download', 'diff')).toBe('diff');
    expect(getAgentOutputFileIconName('download', 'table')).toBe('table');
    expect(getAgentOutputFileIconName('download', 'database')).toBe('database');
  });

  it('renders paired light and dark bitmap assets', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentOutputIcon, { name: 'excel', size: 20, title: 'Excel file' })
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Excel file"');
    expect(markup).toContain('width:20px');
    expect(markup).toContain('height:20px');
    expect(markup).toContain('agent-output-icon__light');
    expect(markup).toContain('agent-output-icon__dark');
  });
});
