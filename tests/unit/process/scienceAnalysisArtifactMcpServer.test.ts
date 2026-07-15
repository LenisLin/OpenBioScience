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
});
