import {
  SCIENCE_EVENT_SCHEMA,
  SCIENCE_PANEL_SCHEMA,
  buildScienceModePrompt,
  latestSciencePanel,
  normalizeSciencePanelData,
  resolveScienceDisplayTarget,
  summarizeScienceRuntime,
} from '@/common/chat/science';
import { describe, expect, it } from 'vitest';

describe('Science Mode payload parsing', () => {
  it('keeps the Science Mode prompt aligned with the compact router contract', () => {
    const prompt = buildScienceModePrompt('/tmp/project', 'zh-CN');

    expect(prompt).toContain('user_input');
    expect(prompt).toContain('artifact Files view');
    expect(prompt).toContain('openscience-onboarding');
    expect(prompt).toContain('case_reproduction/planning/reproduction_plan.md');
    expect(prompt).toContain('build_source_package');
    expect(prompt).toContain('probe_environment');
    expect(prompt).toContain('Do not report the default shell as the analysis environment');
    expect(prompt).toContain('probe `pdftotext` directly');
    expect(prompt).toContain('${OPENBIOSCIENCE_RUNTIME_ROOT}/environments/official/sc-py-singlecell/bin/pdftotext');
    expect(prompt).toContain('Skill selection or loading is not Skill completion');
    expect(prompt).toContain('derive scope from the current validated PaperReproductionMap');
    expect(prompt).toContain('### Free Exploration Workflow');
    expect(prompt).toContain('classify the task as `omics_analysis/free_exploration`');
    expect(prompt).toContain('search TISCH2 or other curated cancer single-cell resources before broad GEO/ArrayExpress');
    expect(prompt).toContain('bio_knowledge');
    expect(prompt).toContain('bio_plot');
    expect(prompt).toContain('script_manifest.json.workflowModules');
    expect(prompt).toContain('result strength as `descriptive`, `exploratory_processed_expression`, or `replicate_aware_inference`');
    expect(prompt).toContain('/data/builtin-skills/<id>/SKILL.md');
    expect(prompt).toContain('openscience-writing');
    expect(prompt).toContain('openscience-databases');
    expect(prompt).not.toContain('openscience-user-input');
    expect(prompt).not.toContain('Project shelf');
    expect(prompt).toContain('correctable workflow step, not a provenance limitation');
  });

  it('normalizes the legacy completed_with_warnings status to completed', () => {
    const panel = normalizeSciencePanelData({
      schema: SCIENCE_PANEL_SCHEMA,
      runId: 'run-warning-alias',
      question: 'Can this be reproduced?',
      generatedAt: 1,
      status: 'completed_with_warnings',
      stats: {},
      report: { title: 'Assessment', sections: [] },
      evidence: [],
      artifacts: [],
      provenance: [],
    });

    expect(panel?.status).toBe('completed');
  });

  it('preserves authoritative delivery and coverage fields', () => {
    const panel = normalizeSciencePanelData({
      schema: SCIENCE_PANEL_SCHEMA,
      runId: 'run-v2-coverage',
      question: 'Reproduce Figure 4',
      generatedAt: 1,
      status: 'running',
      stats: {},
      report: { title: 'Figure 4', sections: [] },
      evidence: [],
      artifacts: [],
      provenance: [],
      deliveryState: {
        state: 'action_required',
        phase: 'execution',
        authoritativeLabel: 'Script preflight required',
        reasonCodes: ['missing_script_preflight'],
        publicationDisposition: 'pending',
      },
      coverageSummary: {
        total: 2,
        completed: 1,
        exact: 0,
        analogous: 1,
        scoped: 0,
        actionRequired: 1,
        externalBlocked: 0,
        excluded: 0,
      },
      coverageItems: [
        {
          id: 'coverage-figure4b',
          targetType: 'paper_panel',
          targetId: 'figure4b',
          moduleIds: ['figure4.myeloid.subclustering'],
          cohortIds: ['KUL3'],
          reproductionMode: 'analogous',
          status: 'completed',
          reason: 'KUL3 myeloid cells are locally available.',
          artifactIds: [],
          evidenceIds: [],
          receiptIds: [],
        },
      ],
    });

    expect(panel?.deliveryState?.state).toBe('action_required');
    expect(panel?.coverageSummary?.analogous).toBe(1);
    expect(panel?.coverageItems?.[0]?.targetId).toBe('figure4b');
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

  it('upgrades legacy Science panel sections before callers render them', () => {
    const legacyPanel = {
      schema: SCIENCE_PANEL_SCHEMA,
      runId: 'sci_run_legacy',
      question: 'Can this paper be reproduced?',
      generatedAt: 42,
      status: 'in_progress',
      stats: { searches: 1 },
      report: {
        title: 'Legacy reproduction plan',
        sections: [{ title: '目标', content: '判断论文中哪些分析内容可以复现。' }],
      },
      methods: {
        queryPlan: 'PubMed + local PDF',
        commands: 'Rscript scripts/01_qc.R',
        limitations: ['No raw FASTQ files'],
      },
      workflowKind: 'omics_reproduction',
      planningCompletion: 'complete',
      executionReadiness: 'partial',
      nextActions: [],
      externalBlockers: [{ id: 'missing-fastq', kind: 'data', message: 'No raw FASTQ files', external: true }],
    };
    const messages = [
      {
        type: 'tool_call',
        content: {
          output: JSON.stringify(legacyPanel),
        },
      },
    ] as never;

    const panel = latestSciencePanel(messages);
    const normalized = normalizeSciencePanelData(legacyPanel);

    expect(panel?.status).toBe('running');
    expect(normalized?.status).toBe('running');
    expect(panel?.report.sections[0]).toEqual({
      id: 'section-1',
      heading: '目标',
      blocks: [{ type: 'paragraph', text: '判断论文中哪些分析内容可以复现。' }],
    });
    expect(panel?.artifacts).toEqual([]);
    expect(panel?.evidence).toEqual([]);
    expect(panel?.methods?.queryPlan).toEqual(['PubMed + local PDF']);
    expect(panel?.methods?.commands).toEqual(['Rscript scripts/01_qc.R']);
    expect(panel).toMatchObject({
      workflowKind: 'omics_reproduction',
      planningCompletion: 'complete',
      executionReadiness: 'partial',
      externalBlockers: [expect.objectContaining({ id: 'missing-fastq', external: true })],
    });
  });

  it('extracts a Science panel from nested MCP content in a tool group result object', () => {
    const panel = {
      schema: SCIENCE_PANEL_SCHEMA,
      runId: 'run-nested-tool-group',
      question: 'Inspect HBA1 AlphaFold structure',
      generatedAt: 10,
      status: 'completed',
      stats: { searches: 2, artifacts: 1, evidence: 2, commands: 1, validations: 1, warnings: 0 },
      report: { title: 'HBA1 structure report', sections: [{ id: 'summary', heading: 'Summary', blocks: [] }] },
      evidence: [],
      artifacts: [
        {
          id: 'hba1_structure_figure',
          runId: 'run-nested-tool-group',
          type: 'figure',
          title: 'HBA1 structure annotation',
          version: 1,
          primaryPath: 'results/hba1_structure.svg',
          createdAt: 10,
        },
      ],
      claims: [],
      provenance: [],
      edges: [],
      graphWarnings: [],
    } as const;
    const event = {
      schema: SCIENCE_EVENT_SCHEMA,
      eventId: 'evt-nested-tool-group',
      runId: panel.runId,
      action: 'publish',
      timestamp: 11,
      panel,
      artifactIds: ['hba1_structure_figure'],
      displayIntent: 'open',
    };
    const messages = [
      {
        type: 'tool_group',
        content: [
          {
            result_display: {
              content: [{ type: 'text', text: JSON.stringify(event) }],
            },
          },
        ],
      },
    ] as never;

    expect(latestSciencePanel(messages)?.report.title).toBe('HBA1 structure report');
  });

  it('extracts a Science panel from ACP rawOutput objects', () => {
    const panel = {
      schema: SCIENCE_PANEL_SCHEMA,
      runId: 'run-acp-raw-output',
      question: 'Inspect AlphaFold confidence',
      generatedAt: 20,
      status: 'completed',
      stats: { searches: 1, artifacts: 1, evidence: 1, commands: 0, validations: 1, warnings: 0 },
      report: { title: 'AlphaFold confidence report', sections: [{ id: 'summary', heading: 'Summary', blocks: [] }] },
      evidence: [],
      artifacts: [],
      claims: [],
      provenance: [],
      edges: [],
      graphWarnings: [],
    } as const;
    const event = {
      schema: SCIENCE_EVENT_SCHEMA,
      eventId: 'evt-acp-raw-output',
      runId: panel.runId,
      action: 'publish',
      timestamp: 21,
      panel,
      displayIntent: 'open',
    };
    const messages = [
      {
        type: 'acp_tool_call',
        content: {
          update: {
            rawOutput: event,
            content: [],
          },
        },
      },
    ] as never;

    expect(latestSciencePanel(messages)?.report.title).toBe('AlphaFold confidence report');
  });

  it('extracts a Science panel from ACP top-level MCP content arrays', () => {
    const panel = {
      schema: SCIENCE_PANEL_SCHEMA,
      runId: 'run-acp-content-array',
      question: 'Inspect AlphaFold and UniProt',
      generatedAt: 30,
      status: 'completed',
      stats: { searches: 2, artifacts: 1, evidence: 2, commands: 1, validations: 1, warnings: 0 },
      report: { title: 'HBA1 artifact report', sections: [{ id: 'summary', heading: 'Summary', blocks: [] }] },
      evidence: [],
      artifacts: [],
      claims: [],
      provenance: [],
      edges: [],
      graphWarnings: [],
    } as const;
    const event = {
      schema: SCIENCE_EVENT_SCHEMA,
      eventId: 'evt-acp-content-array',
      runId: panel.runId,
      action: 'publish',
      timestamp: 31,
      panel,
      displayIntent: 'open',
    };
    const messages = [
      {
        type: 'acp_tool_call',
        content: {
          update: {
            kind: 'execute',
            raw_input: {
              server: 'openscience-science-artifact',
              tool: 'science_artifact',
            },
          },
          content: [
            {
              content: {
                text: JSON.stringify(event),
              },
            },
          ],
        },
      },
    ] as never;

    expect(latestSciencePanel(messages)?.report.title).toBe('HBA1 artifact report');
    expect(resolveScienceDisplayTarget(event)?.kind).toBe('report');
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
