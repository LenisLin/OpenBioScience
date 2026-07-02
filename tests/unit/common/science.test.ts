import {
  SCIENCE_EVENT_SCHEMA,
  SCIENCE_PANEL_SCHEMA,
  buildScienceModePrompt,
  latestSciencePanel,
  resolveScienceDisplayTarget,
  summarizeScienceRuntime,
} from '@/common/chat/science';
import { describe, expect, it } from 'vitest';

describe('Science Mode payload parsing', () => {
  it('tells agents to publish a structured report instead of only writing markdown', () => {
    const prompt = buildScienceModePrompt('/tmp/project', 'zh-CN');

    expect(prompt).toContain('science_artifact(action="publish", displayIntent="open")');
    expect(prompt).toContain('A file can be both an artifact and an evidence node');
    expect(prompt).toContain('report.sections is the canonical report object');
    expect(prompt).toContain('supportingEvidenceIds');
  });

  it('extracts the latest published Science panel from tool output', () => {
    const panel = {
      schema: SCIENCE_PANEL_SCHEMA,
      runId: 'run-1',
      question: 'Generate a figure',
      generatedAt: 1,
      status: 'completed',
      stats: {
        searches: 1,
        artifacts: 2,
        evidence: 2,
        commands: 1,
        validations: 0,
        warnings: 0,
      },
      report: {
        title: 'Figure report',
        sections: [
          {
            id: 'summary',
            heading: 'Summary',
            blocks: [{ type: 'artifact_ref', artifactId: 'fig1' }],
          },
        ],
      },
      evidence: [
        {
          id: 'E1',
          title: 'Input CSV',
          sourceType: 'dataset',
          confidence: 'high',
          path: 'data.csv',
          database: {
            name: 'CELLxGENE',
            endpoint: '/datasets',
            params: { organism: 'human' },
            accessDate: '2026-07-01',
            returnedCount: 8,
            retrievedCount: 8,
            pagination: 'single page',
          },
        },
        {
          id: 'E2',
          title: 'DID regression output',
          sourceType: 'regression_output',
          claimType: 'computed',
          confidence: 'high',
          path: 'tables/did_main.csv',
          command: 'python scripts/did.py',
          artifactId: 'tbl1',
        },
      ],
      artifacts: [
        {
          id: 'fig1',
          runId: 'run-1',
          type: 'figure',
          title: 'UMAP',
          version: 1,
          primaryPath: 'results/umap.png',
          evidenceIds: ['E1'],
          createdAt: 1,
        },
        {
          id: 'tbl1',
          runId: 'run-1',
          type: 'regression_table',
          title: 'DID main table',
          version: 1,
          primaryPath: 'tables/did_main.csv',
          evidenceIds: ['E2'],
          viewer: {
            kind: 'regression_table',
            tablePath: 'tables/did_main.csv',
            codebookPath: 'data/codebook.csv',
            diagnostics: [{ label: 'clustered SE', value: 'firm' }],
          },
          createdAt: 1,
        },
      ],
      claims: [],
      provenance: [],
      edges: [],
      graphWarnings: [],
      usedSkills: [
        {
          id: 'skill-use-1',
          runId: 'run-1',
          skillId: 'kdense-database-lookup',
          skillName: 'K-Dense Database Lookup',
          source: 'k-dense',
          purpose: 'database_lookup',
          status: 'used',
          triggeredBy: 'Need reproducible database provenance',
          evidenceIds: ['E1'],
          artifactIds: ['fig1'],
          createdAt: 1,
        },
        {
          id: 'skill-use-2',
          runId: 'run-1',
          skillId: 'aer-statspai-skill',
          skillName: 'StatsPAI',
          source: 'auto-empirical',
          purpose: 'causal_inference',
          status: 'used',
          triggeredBy: 'Need DID model table with provenance',
          evidenceIds: ['E2'],
          artifactIds: ['tbl1'],
          createdAt: 1,
        },
      ],
    } as const;

    const event = {
      schema: SCIENCE_EVENT_SCHEMA,
      eventId: 'evt-1',
      runId: 'run-1',
      action: 'publish',
      timestamp: 2,
      panel,
      artifactIds: ['fig1', 'tbl1'],
      evidenceIds: ['E1', 'E2'],
    };
    const messages = [
      {
        type: 'tool_call',
        content: {
          output: JSON.stringify(event),
        },
      },
    ] as never;

    expect(latestSciencePanel(messages)?.report.title).toBe('Figure report');
    expect(latestSciencePanel(messages)?.usedSkills?.[0]?.skillId).toBe('kdense-database-lookup');
    expect(latestSciencePanel(messages)?.usedSkills?.[1]?.source).toBe('auto-empirical');
    expect(latestSciencePanel(messages)?.evidence[0]?.database?.endpoint).toBe('/datasets');
    expect(latestSciencePanel(messages)?.artifacts[1]?.viewer?.kind).toBe('regression_table');
    const summary = summarizeScienceRuntime(messages);
    expect(summary?.hasPanel).toBe(true);
    expect(summary?.stats.artifacts).toBe(2);
    expect(summary?.trace.at(-1)?.kind).toBe('publish');
  });

  it('resolves a focus_page event to a real artifact preview target', () => {
    const panel = {
      schema: SCIENCE_PANEL_SCHEMA,
      runId: 'run-focus',
      question: 'Open a figure',
      generatedAt: 3,
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
        title: 'Focused artifact report',
        sections: [{ id: 'summary', heading: 'Summary', blocks: [] }],
      },
      evidence: [
        {
          id: 'E1',
          title: 'Input',
          sourceType: 'dataset',
          confidence: 'high',
          path: 'data/input.csv',
        },
      ],
      artifacts: [
        {
          id: 'fig_umap',
          runId: 'run-focus',
          type: 'figure',
          title: 'UMAP figure',
          version: 2,
          primaryPath: 'results/umap.png',
          evidenceIds: ['E1'],
          createdAt: 3,
        },
      ],
      pages: [
        {
          id: 'page_umap',
          runId: 'run-focus',
          title: 'UMAP workspace',
          kind: 'artifact_workspace',
          layout: 'single_preview',
          panes: [
            {
              id: 'viewer',
              type: 'preview',
              target: { artifactId: 'fig_umap', artifactVersion: 2 },
            },
            {
              id: 'inspector',
              type: 'inspector',
              target: { artifactId: 'fig_umap', artifactVersion: 2 },
            },
          ],
        },
      ],
      claims: [],
      provenance: [],
      edges: [],
      graphWarnings: [],
    } as const;
    const target = resolveScienceDisplayTarget({
      schema: SCIENCE_EVENT_SCHEMA,
      eventId: 'evt-focus',
      runId: 'run-focus',
      action: 'focus_page',
      timestamp: 4,
      target: { kind: 'page', id: 'page_umap', pageId: 'page_umap' },
      pageIds: ['page_umap'],
      panel,
      displayIntent: 'focus',
    });

    expect(target?.kind).toBe('artifact');
    if (target?.kind === 'artifact') {
      expect(target.artifact.id).toBe('fig_umap');
      expect(target.artifact.version).toBe(2);
      expect(target.path).toBe('results/umap.png');
      expect(target.pageId).toBe('page_umap');
    }
  });
});
