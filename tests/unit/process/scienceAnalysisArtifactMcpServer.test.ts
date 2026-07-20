import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OmicsAnalysisReceipt } from '@/common/chat/science';
import { writeReceipt } from '@/process/resources/builtinMcp/bio/receipts';

type ToolResult = { content: Array<{ type: 'text'; text: string }> };
type ToolHandler = (input: {
  action: string;
  runId?: string;
  projectRoot?: string;
  target?: { kind?: string; id?: string; version?: number; pageId?: string };
  payload?: Record<string, unknown>;
  displayIntent?: string;
}) => ToolResult | Promise<ToolResult>;

const withScienceArtifactTool = async (callback: (handler: ToolHandler) => Promise<void>) => {
  let handler: ToolHandler | undefined;
  vi.resetModules();
  vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class {
      tool(_name: string, _description: string, _schema: unknown, registeredHandler: ToolHandler): void {
        handler = registeredHandler;
      }

      async connect(): Promise<void> {}
    },
  }));
  vi.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: class {
      readonly kind = 'stdio';
    },
  }));
  try {
    await import('@/process/resources/builtinMcp/scienceArtifactServer');
    if (!handler) throw new Error('science_artifact MCP tool was not registered.');
    await callback(handler);
  } finally {
    vi.doUnmock('@modelcontextprotocol/sdk/server/mcp.js');
    vi.doUnmock('@modelcontextprotocol/sdk/server/stdio.js');
    vi.resetModules();
  }
};

const writeCanonicalFile = (projectRoot: string, relativePath: string, content = '{}\n') => {
  const target = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return {
    path: relativePath,
    contentHash: crypto.createHash('sha256').update(content).digest('hex'),
    fingerprintMethod: 'sha256' as const,
    sizeBytes: Buffer.byteLength(content),
  };
};

const explorationManifestContent = (analysisId: string): string => {
  const root = `omics_analysis/${analysisId}/exploration`;
  return `${JSON.stringify(
    {
      schema: 'openbioscience.analysis_script.outputs.v2',
      workflowKind: 'omics_analysis',
      analysisId,
      stageOrEpisodeId: 'exploration',
      environmentRef: 'sc-py-singlecell',
      inputs: ['private-input'],
      outputs: {
        objects: [`${root}/results/objects/exploration.h5ad`],
        tables: [
          `${root}/results/tables/input_inventory.tsv`,
          `${root}/results/tables/qc_metrics.tsv`,
          `${root}/results/tables/cluster_assignments.tsv`,
          `${root}/results/tables/embedding_coordinates.tsv`,
          `${root}/results/tables/cluster_markers.tsv`,
          `${root}/results/tables/major_annotation.tsv`,
          `${root}/results/tables/fraction_by_sample.tsv`,
          `${root}/results/tables/fraction_group_comparison.tsv`,
          `${root}/results/tables/processed_expression_feature_screening.tsv`,
          `${root}/results/tables/pathway_enrichment.tsv`,
          `${root}/results/tables/blocked_or_limited_contrasts.tsv`,
        ],
        figures: [
          `${root}/results/figures/embedding/umap_clusters.png`,
          `${root}/results/figures/markers/marker_dotplot.png`,
          `${root}/results/figures/markers/marker_heatmap.png`,
          `${root}/results/figures/composition/fraction_by_response.png`,
          `${root}/results/figures/differential_features/feature_heatmap.png`,
          `${root}/results/figures/differential_features/feature_dotplot.png`,
          `${root}/results/figures/pathway_enrichment/enrichment_barplot.png`,
        ],
        reports: [`${root}/reports/analysis_report.md`],
        logs: [`${root}/logs/run_auto_explore.log`, `${root}/logs/session_info.json`, `${root}/logs/warnings.tsv`],
        scripts: [
          `${root}/scripts/run_auto_explore.py`,
          `${root}/scripts/script_manifest.json`,
          `${root}/scripts/modules/io_utils.py`,
          `${root}/scripts/modules/feature_screening.py`,
        ],
      },
      assumptions: ['processed expression screening is exploratory'],
      warnings: [],
    },
    null,
    2
  )}\n`;
};

const explorationWorkflowModules = () => [
  {
    moduleId: 'public_dataset_discovery',
    status: 'not_applicable',
    environmentRef: 'control-plane',
    reason: 'The fixture represents user-authorized local/private input rather than public dataset discovery.',
    outputs: [],
  },
  {
    moduleId: 'public_dataset_localization',
    status: 'not_applicable',
    environmentRef: 'control-plane',
    reason: 'No public accession download/localization step is required for this local/private fixture.',
    outputs: [],
  },
  {
    moduleId: 'singlecell_import_summary',
    status: 'completed',
    environmentRef: 'sc-py-singlecell',
    outputs: ['results/tables/input_inventory.tsv'],
  },
  {
    moduleId: 'singlecell_qc_preprocess',
    status: 'completed',
    environmentRef: 'sc-py-singlecell',
    outputs: ['results/tables/qc_metrics.tsv', 'results/objects/exploration.h5ad'],
  },
  {
    moduleId: 'dim_cluster_marker',
    status: 'completed',
    environmentRef: 'sc-py-singlecell',
    outputs: ['results/tables/cluster_markers.tsv', 'results/figures/embedding/umap_clusters.png'],
  },
  {
    moduleId: 'cell_annotation_review',
    status: 'completed',
    environmentRef: 'sc-py-singlecell',
    outputs: ['results/tables/major_annotation.tsv', 'results/figures/markers/marker_dotplot.png'],
  },
  {
    moduleId: 'scrna_plot_figure_set',
    status: 'completed',
    environmentRef: 'sc-py-singlecell',
    outputs: ['results/figures/embedding/umap_clusters.png', 'results/figures/markers/marker_heatmap.png'],
  },
  {
    moduleId: 'scrna_response_fraction_comparison',
    status: 'completed',
    environmentRef: 'sc-py-singlecell',
    outputs: ['results/tables/fraction_by_sample.tsv', 'results/tables/fraction_group_comparison.tsv'],
  },
  {
    moduleId: 'scrna_processed_feature_screening',
    status: 'completed',
    environmentRef: 'sc-py-singlecell',
    outputs: ['results/tables/processed_expression_feature_screening.tsv'],
  },
  {
    moduleId: 'scrna_pathway_enrichment',
    status: 'completed',
    environmentRef: 'sc-py-singlecell',
    outputs: ['results/tables/pathway_enrichment.tsv'],
  },
  {
    moduleId: 'exploration_report_package',
    status: 'completed',
    environmentRef: 'sc-py-singlecell',
    outputs: ['reports/analysis_report.md', 'results/output_manifest.json', 'logs/session_info.json'],
  },
];

const writeExplorationCanonicalFiles = (projectRoot: string, analysisId: string) => [
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/scripts/run_auto_explore.py`,
    'print("ok")\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/scripts/script_manifest.json`,
    `${JSON.stringify(
      {
        schema: 'openbioscience.analysis_script.package.v1',
        workflowKind: 'omics_analysis',
        analysisId,
        stageOrEpisodeId: 'exploration',
        environmentRef: 'sc-py-singlecell',
        entrypoint: 'run_auto_explore.py',
        modules: [
          { path: 'modules/io_utils.py', role: 'io_and_manifest' },
          { path: 'modules/feature_screening.py', role: 'processed_expression_screening' },
        ],
        workflowModules: explorationWorkflowModules(),
      },
      null,
      2
    )}\n`
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/scripts/modules/io_utils.py`,
    '"""Input/output helpers for canonical OpenBioScience exploration outputs."""\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/scripts/modules/feature_screening.py`,
    '"""Processed-expression feature screening helper module for exploration."""\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/objects/exploration.h5ad`,
    'h5ad\n'
  ),
  writeCanonicalFile(projectRoot, `omics_analysis/${analysisId}/exploration/results/tables/input_inventory.tsv`, 'x\n'),
  writeCanonicalFile(projectRoot, `omics_analysis/${analysisId}/exploration/results/tables/qc_metrics.tsv`, 'x\n'),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/tables/cluster_assignments.tsv`,
    'x\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/tables/embedding_coordinates.tsv`,
    'x\n'
  ),
  writeCanonicalFile(projectRoot, `omics_analysis/${analysisId}/exploration/results/tables/cluster_markers.tsv`, 'x\n'),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/tables/major_annotation.tsv`,
    'x\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/tables/fraction_by_sample.tsv`,
    'x\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/tables/fraction_group_comparison.tsv`,
    'x\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/tables/processed_expression_feature_screening.tsv`,
    'x\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/tables/pathway_enrichment.tsv`,
    'x\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/tables/blocked_or_limited_contrasts.tsv`,
    'x\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/figures/embedding/umap_clusters.png`,
    'png\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/figures/markers/marker_dotplot.png`,
    'png\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/figures/markers/marker_heatmap.png`,
    'png\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/figures/composition/fraction_by_response.png`,
    'png\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/figures/differential_features/feature_heatmap.png`,
    'png\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/figures/differential_features/feature_dotplot.png`,
    'png\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/figures/pathway_enrichment/enrichment_barplot.png`,
    'png\n'
  ),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/results/output_manifest.json`,
    explorationManifestContent(analysisId)
  ),
  writeCanonicalFile(projectRoot, `omics_analysis/${analysisId}/exploration/reports/analysis_report.md`, '# Report\n'),
  writeCanonicalFile(projectRoot, `omics_analysis/${analysisId}/exploration/logs/run_auto_explore.log`, 'ok\n'),
  writeCanonicalFile(projectRoot, `omics_analysis/${analysisId}/exploration/logs/session_info.json`, '{}\n'),
  writeCanonicalFile(
    projectRoot,
    `omics_analysis/${analysisId}/exploration/logs/warnings.tsv`,
    'warning_id\tmessage\n'
  ),
];

describe('science_artifact omics analysis publishing', () => {
  let projectRoot = '';

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-analysis-artifact-'));
    process.env.OPENSCIENCE_WORKSPACE_ROOT = projectRoot;
    process.env.OPENSCIENCE_WRITE_PROJECT_MANIFEST = 'false';
  });

  afterEach(() => {
    delete process.env.OPENSCIENCE_WORKSPACE_ROOT;
    delete process.env.OPENSCIENCE_WRITE_PROJECT_MANIFEST;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('publishes an awaiting-user analysis only from an analysis receipt ID', async () => {
    const receipt: OmicsAnalysisReceipt = {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'bio_receipt_aaaaaaaaaaaaaaaaaaaa',
      producer: 'bio_analysis',
      action: 'complete_baseline',
      status: 'awaiting_user',
      projectRoot,
      createdAt: Date.now(),
      workflowKind: 'omics_analysis',
      analysisId: 'analysis-a',
      modality: 'scrna_seq',
      stage: 'baseline',
      stageStatus: 'awaiting_user',
      projectStatus: 'awaiting_user',
      directDependencyReceiptIds: ['bio_receipt_bbbbbbbbbbbbbbbbbbbb'],
      canonicalFiles: [],
      skillUses: [],
      nextActions: [],
      externalBlockers: [],
      privacyPolicy: {
        externalEgress: 'allowlisted',
        rawDataExport: 'forbidden',
        sampleIdentifierPolicy: 'local_only',
      },
      summary: { candidateEpisodes: ['de', 'cci', 'trajectory'] },
    };
    writeReceipt(projectRoot, receipt);

    await withScienceArtifactTool(async (handler) => {
      const result = await handler({
        action: 'publish',
        runId: 'analysis-run',
        projectRoot,
        payload: { workflowKind: 'omics_analysis', analysisReceiptId: receipt.receiptId },
      });
      const parsed = JSON.parse(result.content[0]?.text || '{}') as {
        panel?: {
          status?: string;
          workflowKind?: string;
          analysisId?: string;
          analysisStage?: string;
          deliveryState?: { state?: string };
        };
      };

      expect(parsed.panel).toMatchObject({
        status: 'awaiting_user',
        workflowKind: 'omics_analysis',
        analysisId: 'analysis-a',
        analysisStage: 'baseline',
        deliveryState: { state: 'awaiting_user' },
      });
    });
  });

  it('blocks completed analysis publishing when declared artifacts are not openable', async () => {
    const receipt: OmicsAnalysisReceipt = {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'bio_receipt_cccccccccccccccccccc',
      producer: 'bio_analysis',
      action: 'complete_exploration',
      status: 'ready',
      projectRoot,
      createdAt: Date.now(),
      workflowKind: 'omics_analysis',
      analysisId: 'analysis-explore',
      modality: 'scrna_seq',
      stage: 'exploration',
      stageStatus: 'accepted',
      projectStatus: 'accepted',
      directDependencyReceiptIds: ['bio_receipt_dddddddddddddddddddd'],
      canonicalFiles: writeExplorationCanonicalFiles(projectRoot, 'analysis-explore'),
      skillUses: [],
      nextActions: [],
      externalBlockers: [],
      privacyPolicy: {
        externalEgress: 'allowlisted',
        rawDataExport: 'forbidden',
        sampleIdentifierPolicy: 'local_only',
      },
      summary: { exploratory: true, workflowModules: explorationWorkflowModules() },
    };
    writeReceipt(projectRoot, receipt);

    await withScienceArtifactTool(async (handler) => {
      await handler({
        action: 'create',
        runId: 'analysis-run-external',
        projectRoot,
        target: { kind: 'artifact', id: 'external-report' },
        payload: {
          type: 'manuscript',
          title: 'External report',
          primaryPath: path.join(os.tmpdir(), 'openbioscience-external-report.md'),
          execution: {
            command: 'python run_auto_explore.py',
            logPath: 'omics_analysis/analysis-explore/exploration/logs/run.log',
          },
        },
      });

      const result = await handler({
        action: 'publish',
        runId: 'analysis-run-external',
        projectRoot,
        payload: { workflowKind: 'omics_analysis', analysisReceiptId: receipt.receiptId },
      });
      const parsed = JSON.parse(result.content[0]?.text || '{}') as {
        panel?: {
          status?: string;
          deliveryState?: { state?: string; reasonCodes?: string[] };
          graphWarnings?: Array<{ code?: string; blocking?: boolean }>;
          artifacts?: Array<{ id?: string; status?: string }>;
        };
      };

      expect(parsed.panel?.status).toBe('partial');
      expect(parsed.panel?.deliveryState?.state).toBe('action_required');
      expect(parsed.panel?.deliveryState?.reasonCodes).toContain('graph_warning:unopenable_artifact');
      expect(parsed.panel?.graphWarnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'unopenable_artifact', blocking: true })])
      );
      expect(parsed.panel?.artifacts).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'external-report', status: 'missing' })])
      );
    });
  });

  it('rejects terminal analysis publishing when the receipt has no canonical files', async () => {
    const receipt: OmicsAnalysisReceipt = {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'bio_receipt_eeeeeeeeeeeeeeeeeeee',
      producer: 'bio_analysis',
      action: 'complete_exploration',
      status: 'ready',
      projectRoot,
      createdAt: Date.now(),
      workflowKind: 'omics_analysis',
      analysisId: 'analysis-empty',
      modality: 'scrna_seq',
      stage: 'exploration',
      stageStatus: 'accepted',
      projectStatus: 'accepted',
      directDependencyReceiptIds: ['bio_receipt_ffffffffffffffffffff'],
      canonicalFiles: [],
      skillUses: [],
      nextActions: [],
      externalBlockers: [],
      privacyPolicy: {
        externalEgress: 'allowlisted',
        rawDataExport: 'forbidden',
        sampleIdentifierPolicy: 'local_only',
      },
      summary: { exploratory: true, workflowModules: explorationWorkflowModules() },
    };
    writeReceipt(projectRoot, receipt);

    await withScienceArtifactTool(async (handler) => {
      const result = await handler({
        action: 'publish',
        runId: 'analysis-run-empty',
        projectRoot,
        payload: { workflowKind: 'omics_analysis', analysisReceiptId: receipt.receiptId },
      });
      const parsed = JSON.parse(result.content[0]?.text || '{}') as {
        status?: string;
        error?: { code?: string; issues?: string[] };
        nextActions?: Array<{ id?: string }>;
      };

      expect(parsed.status).toBe('invalid_request');
      expect(parsed.error?.code).toBe('ANALYSIS_CANONICAL_FILES_UNOPENABLE');
      expect(parsed.error?.issues).toEqual(
        expect.arrayContaining(['The terminal analysis receipt has no canonical files.'])
      );
      expect(parsed.nextActions).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'repair-analysis-canonical-files' })])
      );
    });
  });

  it('rejects terminal exploration publishing when workflow module summaries are missing', async () => {
    const receipt: OmicsAnalysisReceipt = {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'bio_receipt_abababababababababab',
      producer: 'bio_analysis',
      action: 'complete_exploration',
      status: 'ready',
      projectRoot,
      createdAt: Date.now(),
      workflowKind: 'omics_analysis',
      analysisId: 'analysis-no-modules',
      modality: 'scrna_seq',
      stage: 'exploration',
      stageStatus: 'accepted',
      projectStatus: 'accepted',
      directDependencyReceiptIds: ['bio_receipt_cdcdcdcdcdcdcdcdcdcd'],
      canonicalFiles: writeExplorationCanonicalFiles(projectRoot, 'analysis-no-modules'),
      skillUses: [],
      nextActions: [],
      externalBlockers: [],
      privacyPolicy: {
        externalEgress: 'allowlisted',
        rawDataExport: 'forbidden',
        sampleIdentifierPolicy: 'local_only',
      },
      summary: { exploratory: true },
    };
    writeReceipt(projectRoot, receipt);

    await withScienceArtifactTool(async (handler) => {
      const result = await handler({
        action: 'publish',
        runId: 'analysis-run-no-modules',
        projectRoot,
        payload: { workflowKind: 'omics_analysis', analysisReceiptId: receipt.receiptId },
      });
      const parsed = JSON.parse(result.content[0]?.text || '{}') as {
        status?: string;
        error?: { code?: string; issues?: string[] };
      };

      expect(parsed.status).toBe('invalid_request');
      expect(parsed.error?.issues).toEqual(
        expect.arrayContaining(['The terminal exploration receipt has no workflowModules summary.'])
      );
    });
  });

  it('indexes completed analysis canonical files into UI-openable Science artifacts', async () => {
    process.env.OPENSCIENCE_WRITE_PROJECT_MANIFEST = 'true';
    const receipt: OmicsAnalysisReceipt = {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'bio_receipt_aaaaaaaaaaaaaaaabbbb',
      producer: 'bio_analysis',
      action: 'complete_exploration',
      status: 'ready',
      projectRoot,
      createdAt: Date.now(),
      workflowKind: 'omics_analysis',
      analysisId: 'analysis-indexed',
      modality: 'scrna_seq',
      stage: 'exploration',
      stageStatus: 'accepted',
      projectStatus: 'accepted',
      directDependencyReceiptIds: ['bio_receipt_bbbbbbbbbbbbbbbbbbaa'],
      canonicalFiles: writeExplorationCanonicalFiles(projectRoot, 'analysis-indexed'),
      skillUses: [],
      nextActions: [],
      externalBlockers: [],
      privacyPolicy: {
        externalEgress: 'allowlisted',
        rawDataExport: 'forbidden',
        sampleIdentifierPolicy: 'local_only',
      },
      summary: { exploratory: true, workflowModules: explorationWorkflowModules() },
    };
    writeReceipt(projectRoot, receipt);

    await withScienceArtifactTool(async (handler) => {
      const result = await handler({
        action: 'publish',
        runId: 'analysis-run-indexed',
        projectRoot,
        payload: { workflowKind: 'omics_analysis', analysisReceiptId: receipt.receiptId },
      });
      const parsed = JSON.parse(result.content[0]?.text || '{}') as {
        panel?: {
          status?: string;
          artifacts?: Array<{ id?: string; type?: string; primaryPath?: string }>;
          coverageItems?: Array<{ targetId?: string; status?: string }>;
          methods?: { environmentSummary?: string };
        };
      };

      expect(parsed.panel?.status).toBe('completed');
      expect(parsed.panel?.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'analysis-indexed-report', type: 'report' }),
          expect.objectContaining({ id: 'analysis-indexed-scripts', type: 'code' }),
          expect.objectContaining({ id: 'analysis-indexed-figures', type: 'figure' }),
        ])
      );
      expect(parsed.panel?.coverageItems).toEqual(
        expect.arrayContaining([expect.objectContaining({ targetId: 'dim_cluster_marker', status: 'completed' })])
      );
      expect(parsed.panel?.methods?.environmentSummary).toContain('dim_cluster_marker: sc-py-singlecell');

      const fileIndex = JSON.parse(
        fs.readFileSync(path.join(projectRoot, '.openscience', 'science-artifacts', 'file-index.json'), 'utf8')
      ) as { files?: Array<{ relativePath?: string; artifactId?: string }> };
      expect(fileIndex.files?.length).toBeGreaterThan(0);
      expect(fileIndex.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            relativePath: 'omics_analysis/analysis-indexed/exploration/reports/analysis_report.md',
            artifactId: 'analysis-indexed-report',
          }),
        ])
      );
    });
  });

  it('rejects unsupported free-exploration workflow kind at publish time', async () => {
    await withScienceArtifactTool(async (handler) => {
      const result = await handler({
        action: 'publish',
        runId: 'analysis-run-unsupported-kind',
        projectRoot,
        payload: { workflowKind: 'omics_free_exploration', analysisReceiptId: 'bio_receipt_cccccccccccccccccccc' },
      });
      const parsed = JSON.parse(result.content[0]?.text || '{}') as {
        status?: string;
        error?: { code?: string; workflowKind?: string };
      };

      expect(parsed.status).toBe('invalid_request');
      expect(parsed.error).toEqual({
        code: 'UNSUPPORTED_WORKFLOW_KIND',
        workflowKind: 'omics_free_exploration',
      });
    });
  });
});
