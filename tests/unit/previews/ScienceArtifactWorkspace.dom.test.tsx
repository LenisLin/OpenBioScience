/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { SCIENCE_PANEL_SCHEMA, type SciencePanelData } from '@/common/chat/science';
import type { PreviewTab } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addToSendBox: vi.fn(),
  historyInvoke: vi.fn(),
  latexCompileInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    scienceArtifactArchive: {
      history: { invoke: mocks.historyInvoke },
      export: { invoke: vi.fn() },
    },
    scienceLatex: {
      compile: { invoke: mocks.latexCompileInvoke },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/pages/conversation/Preview/context/PreviewContext')>(
    '@/renderer/pages/conversation/Preview/context/PreviewContext'
  );
  return {
    ...actual,
    usePreviewContext: () => ({
      addToSendBox: mocks.addToSendBox,
    }),
  };
});

const makePanel = (): SciencePanelData => ({
  schema: SCIENCE_PANEL_SCHEMA,
  runId: 'sci_run_dom',
  projectRoot: '/tmp/openscience-dom-project',
  question: 'Inspect an artifact',
  generatedAt: Date.now(),
  status: 'completed',
  stats: {
    searches: 0,
    artifacts: 1,
    evidence: 1,
    commands: 1,
    validations: 0,
    warnings: 0,
  },
  report: {
    title: 'Tracked figure report',
    sections: [
      {
        id: 'summary',
        heading: 'Summary',
        blocks: [{ type: 'paragraph', text: 'The figure is tracked. [E1]' }],
      },
    ],
  },
  evidence: [
    {
      id: 'E1',
      title: 'Input CSV',
      sourceType: 'dataset',
      confidence: 'high',
      path: 'data/input.csv',
      createdAt: Date.now(),
    },
  ],
  artifacts: [
    {
      id: 'fig_umap',
      runId: 'sci_run_dom',
      type: 'figure',
      title: 'UMAP figure',
      version: 2,
      primaryPath: 'results/umap.png',
      inputPaths: ['data/input.csv'],
      code: { path: 'scripts/make_umap.py', language: 'python' },
      execution: { command: 'python scripts/make_umap.py', logPath: 'logs/umap.log', exitCode: 0 },
      evidenceIds: ['E1'],
      git: {
        status: 'committed',
        commit: 'abc1234567890',
        shortCommit: 'abc1234',
        files: [],
      },
      createdAt: Date.now(),
    },
  ],
  claims: [],
  provenance: [],
  edges: [],
  graphWarnings: [],
  git: {
    status: 'committed',
    commit: 'abc1234567890',
    shortCommit: 'abc1234',
    files: [],
  },
});

describe('ScienceArtifactWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    mocks.historyInvoke.mockResolvedValue({
      ok: true,
      items: [
        {
          commit: 'abc1234567890',
          shortCommit: 'abc1234',
          subject: 'science_artifact publish run=sci_run_dom target=artifact:fig_umap',
          authoredAt: '2026-07-02T00:00:00.000Z',
          changedFiles: ['runs/sci_run_dom/artifacts/fig_umap/v2/artifact.json'],
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the inspector and loads git history for the selected artifact', async () => {
    const { default: ScienceArtifactWorkspace } = await import(
      '@/renderer/pages/conversation/Preview/components/ScienceArtifactWorkspace/ScienceArtifactWorkspace'
    );
    const panel = makePanel();
    const activeTab: PreviewTab = {
      id: 'preview-fig',
      title: 'umap.png',
      content: '',
      content_type: 'image',
      metadata: {
        file_path: 'results/umap.png',
        science: {
          panel,
          artifactId: 'fig_umap',
          artifactVersion: 2,
        },
      },
    };

    render(
      <ScienceArtifactWorkspace
        panel={panel}
        activeTab={activeTab}
        previewContent={<img alt='artifact preview' src='data:image/png;base64,iVBORw0KGgo=' />}
        onOpenFile={vi.fn()}
        onContentChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('science-artifact-workspace')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'UMAP figure' })).toBeInTheDocument();
    expect(screen.queryByText('Artifact Inspector / History')).not.toBeInTheDocument();
    expect(screen.queryByText('Hash')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open details/i }));

    expect(screen.getByText('Artifact Inspector / Details')).toBeInTheDocument();
    expect(screen.getByText('Hash')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.queryByText('Hash')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /History/i }));

    await waitFor(() =>
      expect(mocks.historyInvoke).toHaveBeenCalledWith({
        projectRoot: '/tmp/openscience-dom-project',
        runId: 'sci_run_dom',
        artifactId: 'fig_umap',
        artifactVersion: 2,
        limit: 12,
      })
    );
    expect(screen.getByText('Artifact Inspector / History')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Overview/i })).not.toBeInTheDocument();
    expect(await screen.findByText('science_artifact publish run=sci_run_dom target=artifact:fig_umap')).toBeInTheDocument();
    expect(screen.getAllByText('abc1234').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 changed file/i)).toBeInTheDocument();
  });
});
