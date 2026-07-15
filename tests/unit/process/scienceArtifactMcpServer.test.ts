import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BioStatisticsCompletionReceipt,
  MethodAlignmentReceipt,
  ReproductionCompletionReceipt,
  ReproductionExecutionReceipt,
} from '@/common/chat/science';
import { writeReceipt } from '@/process/resources/builtinMcp/bio/receipts';

type ToolTextResult = { content: Array<{ type: 'text'; text: string }> };
type ToolHandler = (input: {
  action: string;
  runId?: string;
  projectRoot?: string;
  payload?: Record<string, unknown>;
  displayIntent?: string;
}) => ToolTextResult | Promise<ToolTextResult>;

const parseResult = (result: ToolTextResult) => {
  const text = result.content.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('science_artifact did not return JSON text.');
  return JSON.parse(text) as {
    status?: string;
    error?: { code: string };
    completionRequired?: boolean;
    statusCorrectionRequired?: boolean;
    nextActions?: unknown[];
    panel?: {
      status: string;
      workflowPhase?: string;
      planningCompletion?: string;
      executionReadiness?: string;
      executionReceipt?: ReproductionExecutionReceipt;
      usedSkills?: Array<{ skillId: string; status: string }>;
      provenance: Array<{ id: string }>;
      stats: { validations: number };
      methods?: { environmentSummary?: string };
    };
  };
};

const withCapturedScienceTool = async (callback: (handler: ToolHandler) => Promise<void>) => {
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

describe('science_artifact reproduction completion publishing', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-science-mcp-'));
    process.env.OPENSCIENCE_WORKSPACE_ROOT = root;
    process.env.OPENSCIENCE_WRITE_PROJECT_MANIFEST = 'false';
  });

  afterEach(() => {
    delete process.env.OPENSCIENCE_WORKSPACE_ROOT;
    delete process.env.OPENSCIENCE_WRITE_PROJECT_MANIFEST;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const completionReceipt = (): ReproductionCompletionReceipt => {
    const planPath = 'case_reproduction/planning/reproduction_plan.md';
    const auditPath = 'case_reproduction/planning/source_audit.json';
    const methodPath = 'case_reproduction/planning/method_parameter_contract.json';
    fs.mkdirSync(path.join(root, 'case_reproduction', 'planning'), { recursive: true });
    fs.writeFileSync(path.join(root, planPath), '# plan\n', 'utf8');
    fs.writeFileSync(path.join(root, auditPath), '{}\n', 'utf8');
    fs.writeFileSync(path.join(root, methodPath), '{}\n', 'utf8');
    const hash = (candidate: string) =>
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, candidate)))
        .digest('hex');
    return {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'bio_receipt_aaaaaaaaaaaaaaaaaaaa',
      producer: 'bio_reproduction',
      action: 'validate_reproduction_plan',
      status: 'ready',
      projectRoot: root,
      createdAt: Date.now(),
      workflowKind: 'omics_reproduction',
      planningCompletion: 'complete',
      executionReadiness: 'partial',
      canonicalFiles: [
        { path: planPath, contentHash: hash(planPath) },
        { path: auditPath, contentHash: hash(auditPath) },
        { path: methodPath, contentHash: hash(methodPath) },
      ],
      sourceReceiptIds: ['source-receipt'],
      runtimeReceiptIds: ['runtime-receipt'],
      methodParameterReceiptId: 'bio_method_parameters',
      methodModuleCoverage: [],
      eligibleClaims: ['scoped_reimplementation'],
      skillUses: [
        {
          id: 'skill-use-planning',
          skillId: 'bio-omics-reproduction-planning',
          skillName: 'bio-omics-reproduction-planning',
          source: 'local',
          purpose: 'replication',
          status: 'used',
          triggeredBy: 'bio_reproduction completion receipt',
          createdAt: Date.now(),
        },
      ],
      moduleReadiness: [
        {
          id: 'm01',
          environmentRef: 'sc-r-singlecell',
          declaredStatus: 'conditional_continue',
          sourceStatus: 'ready',
          contractStatus: 'complete',
          executionStatus: 'conditional',
          skillRoute: ['bio-scrna-reproduction'],
          mcpRoute: ['bio_runtime'],
          expectedOutputs: ['result.tsv'],
          blockingReasons: [],
        },
      ],
      nextActions: [],
      externalBlockers: [],
    };
  };

  const methodAlignmentReceipt = (planningReceipt: ReproductionCompletionReceipt): MethodAlignmentReceipt => {
    const executedPath = 'case_reproduction/execution/configs/executed_parameters.json';
    const scriptPath = 'case_reproduction/execution/scripts/analysis.py';
    fs.mkdirSync(path.dirname(path.join(root, executedPath)), { recursive: true });
    fs.mkdirSync(path.dirname(path.join(root, scriptPath)), { recursive: true });
    fs.writeFileSync(path.join(root, executedPath), '{"parameters":[]}\n', 'utf8');
    fs.writeFileSync(path.join(root, scriptPath), '# OpenBioScience-Parameters: hvg_count\n', 'utf8');
    const hash = (candidate: string) =>
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, candidate)))
        .digest('hex');
    return {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'bio_receipt_bbbbbbbbbbbbbbbbbbbb',
      producer: 'bio_reproduction',
      action: 'validate_method_alignment',
      status: 'ready',
      projectRoot: root,
      createdAt: Date.now(),
      methodParameterReceiptId: planningReceipt.methodParameterReceiptId,
      alignmentLevel: 'scoped_reimplementation',
      executedParameterFile: { path: executedPath, contentHash: hash(executedPath) },
      scriptFiles: [{ path: scriptPath, contentHash: hash(scriptPath) }],
      alignedParameters: [],
      substitutedParameters: ['hvg_count'],
      conflicts: [],
      eligibleClaims: ['scoped_reimplementation'],
      nextActions: [],
    };
  };

  const statisticalCompletionReceipt = (
    planningReceipt: ReproductionCompletionReceipt
  ): BioStatisticsCompletionReceipt => {
    const outputPath = 'case_reproduction/execution/results/tables/de_status.tsv';
    fs.mkdirSync(path.dirname(path.join(root, outputPath)), { recursive: true });
    fs.writeFileSync(
      outputPath.startsWith('/') ? outputPath : path.join(root, outputPath),
      'contrast\tstatus\nmast\tblocked\n'
    );
    const contentHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(root, outputPath)))
      .digest('hex');
    return {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'bio_receipt_cccccccccccccccccccc',
      producer: 'bio_statistics',
      action: 'validate_de_outputs',
      status: 'ready',
      projectRoot: root,
      createdAt: Date.now(),
      workflowKind: 'omics_reproduction',
      workflowPhase: 'execution',
      planningReceiptId: planningReceipt.receiptId,
      designReceiptId: 'bio_statistics_design',
      package: 'edgeR',
      packageVersion: '4.0.0',
      contrasts: [
        {
          id: 'mast-tvn',
          target: 'Tumor',
          reference: 'Normal',
          coefficient: 'ClassTumor-ClassNormal',
          status: 'blocked_insufficient_replicates',
          effectiveReplicates: { Tumor: 2, Normal: 0 },
          warnings: ['Fewer than three complete biological replicates.'],
        },
      ],
      canonicalFiles: [{ path: outputPath, contentHash }],
      skillUses: [
        {
          id: 'skill-use-de',
          skillId: 'bio-scrna-differential-expression',
          skillName: 'bio-scrna-differential-expression',
          source: 'local',
          purpose: 'replication',
          status: 'used',
          triggeredBy: 'bio_statistics completion receipt',
          createdAt: Date.now(),
        },
      ],
      mcpActions: ['validate_de_design', 'validate_de_outputs'],
      nextActions: [],
      externalBlockers: [],
    };
  };

  const executionCompletionReceipt = (
    planningReceipt: ReproductionCompletionReceipt,
    methodReceipt: MethodAlignmentReceipt,
    statisticalReceipt: BioStatisticsCompletionReceipt
  ): ReproductionExecutionReceipt => {
    const contractPath = 'case_reproduction/execution/execution_contract.json';
    fs.mkdirSync(path.dirname(path.join(root, contractPath)), { recursive: true });
    fs.writeFileSync(
      path.join(root, contractPath),
      JSON.stringify({ schema: 'openbioscience.scrna_reproduction.execution_contract.v1' }) + '\n',
      'utf8'
    );
    const canonicalPaths = [
      contractPath,
      methodReceipt.executedParameterFile.path,
      ...methodReceipt.scriptFiles.map((file) => file.path),
      ...statisticalReceipt.canonicalFiles.map((file) => file.path),
    ];
    const canonicalFiles = canonicalPaths.map((candidate) => ({
      path: candidate,
      contentHash: crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, candidate)))
        .digest('hex'),
    }));
    return {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'bio_receipt_dddddddddddddddddddd',
      producer: 'bio_reproduction',
      action: 'complete_execution',
      status: 'ready',
      projectRoot: root,
      createdAt: Date.now(),
      workflowKind: 'omics_reproduction',
      workflowPhase: 'execution',
      modality: 'scrna_seq',
      executionCompletion: 'complete',
      scientificOutcome: 'validated_with_limits',
      executionContractFile: canonicalFiles[0],
      executionContractReceiptId: 'bio_execution_contract',
      planningReceiptId: planningReceipt.receiptId,
      methodAlignmentReceiptId: methodReceipt.receiptId,
      statisticalReceiptIds: [statisticalReceipt.receiptId],
      modules: [
        {
          id: 'condition_de',
          required: true,
          status: 'scientifically_limited',
          outputFiles: statisticalReceipt.canonicalFiles,
          validationReceiptIds: [statisticalReceipt.receiptId],
          limitations: ['One contrast lacked sufficient biological replicates.'],
        },
        {
          id: 'disease_program',
          required: false,
          status: 'not_requested',
          outputFiles: [],
          validationReceiptIds: [],
          limitations: [],
        },
      ],
      canonicalFiles,
      skillUses: statisticalReceipt.skillUses,
      nextActions: [],
      externalBlockers: [],
    };
  };

  const storedReceiptIds = (
    ...receipts: Array<
      | ReproductionCompletionReceipt
      | MethodAlignmentReceipt
      | BioStatisticsCompletionReceipt
      | ReproductionExecutionReceipt
    >
  ): Record<string, string> => {
    const payload: Record<string, string> = {};
    for (const receipt of receipts) {
      writeReceipt(root, receipt);
      if (receipt.action === 'validate_reproduction_plan') payload.completionReceiptId = receipt.receiptId;
      if (receipt.action === 'validate_method_alignment') payload.methodAlignmentReceiptId = receipt.receiptId;
      if (receipt.action === 'validate_de_outputs') payload.statisticalCompletionReceiptId = receipt.receiptId;
      if (receipt.action === 'complete_execution') payload.executionReceiptId = receipt.receiptId;
    }
    return payload;
  };

  it('keeps a completed reproduction publish running until a receipt is supplied', async () => {
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-missing-receipt',
          projectRoot: root,
          payload: { workflowKind: 'omics_reproduction', status: 'completed' },
        })
      );

      expect(result.completionRequired).toBe(true);
      expect(result.panel?.status).toBe('running');
      expect(result.nextActions).toHaveLength(1);
    });
  });

  it('rejects a full reproduction receipt object and returns the ID-only call shape', async () => {
    const receipt = completionReceipt();
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-full-receipt-rejected',
          projectRoot: root,
          payload: { workflowKind: 'omics_reproduction', status: 'completed', completionReceipt: receipt },
        })
      );

      expect(result.status).toBe('invalid_request');
      expect(result.error?.code).toBe('FULL_RECEIPT_PAYLOAD_REJECTED');
      expect(result.panel?.status).toBe('running');
    });
  });

  it('normalizes completed_with_warnings and still enforces the reproduction receipt gate', async () => {
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-warning-alias',
          projectRoot: root,
          payload: { workflowKind: 'omics_reproduction', status: 'completed_with_warnings' },
        })
      );

      expect(result.completionRequired).toBe(true);
      expect(result.panel?.status).toBe('running');
    });
  });

  it('keeps a partial reproduction publication running until a receipt is supplied', async () => {
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-partial-missing-receipt',
          projectRoot: root,
          payload: { workflowKind: 'omics_reproduction', status: 'partial' },
        })
      );

      expect(result.completionRequired).toBe(true);
      expect(result.panel?.status).toBe('running');
    });
  });

  it('returns a corrected publish action for an unsupported Science status', async () => {
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-unsupported-status',
          projectRoot: root,
          payload: { workflowKind: 'omics_reproduction', status: 'finished_with_notes' },
        })
      );

      expect(result.statusCorrectionRequired).toBe(true);
      expect(result.panel?.status).toBe('running');
      expect(result.nextActions).toEqual([
        expect.objectContaining({ action: 'publish', payload: { status: 'running' } }),
      ]);
    });
  });

  it('rejects a reproduction completion receipt that is not ready', async () => {
    const receipt = completionReceipt();
    receipt.status = 'needs_completion';
    const receiptIds = storedReceiptIds(receipt);
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-incomplete-receipt',
          projectRoot: root,
          payload: { workflowKind: 'omics_reproduction', status: 'completed', ...receiptIds },
        })
      );

      expect(result.completionRequired).toBe(true);
      expect(result.panel?.status).toBe('running');
    });
  });

  it('publishes completed planning with partial execution and derived provenance', async () => {
    const receipt = completionReceipt();
    const receiptIds = storedReceiptIds(receipt);
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-complete',
          projectRoot: root,
          payload: { workflowKind: 'omics_reproduction', status: 'completed', ...receiptIds },
        })
      );

      expect(result.completionRequired).toBeUndefined();
      expect(result.panel).toMatchObject({
        status: 'completed',
        planningCompletion: 'complete',
        executionReadiness: 'partial',
      });
      expect(result.panel?.usedSkills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ skillId: 'bio-omics-reproduction-planning', status: 'used' }),
        ])
      );
      expect(result.panel?.provenance).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: receipt.receiptId })])
      );
      expect(result.panel?.stats.validations).toBe(3);
      expect(result.panel?.methods?.environmentSummary).toContain('sc-r-singlecell: conditional');
    });
  });

  it('rejects a stale completion receipt after a canonical file changes', async () => {
    const receipt = completionReceipt();
    const receiptIds = storedReceiptIds(receipt);
    fs.appendFileSync(path.join(root, receipt.canonicalFiles[0].path), 'changed\n', 'utf8');

    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-stale',
          projectRoot: root,
          payload: { workflowKind: 'omics_reproduction', status: 'completed', ...receiptIds },
        })
      );

      expect(result.completionRequired).toBe(true);
      expect(result.panel?.status).toBe('running');
    });
  });

  it('keeps an execution publication running without a final execution receipt', async () => {
    const receipt = completionReceipt();
    const methodReceipt = methodAlignmentReceipt(receipt);
    const receiptIds = storedReceiptIds(receipt, methodReceipt);
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-execution-missing-statistics',
          projectRoot: root,
          payload: {
            workflowKind: 'omics_reproduction',
            workflowPhase: 'execution',
            status: 'completed',
            ...receiptIds,
          },
        })
      );

      expect(result.completionRequired).toBe(true);
      expect(result.panel?.status).toBe('running');
      expect(result.nextActions).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'complete_execution' })])
      );
    });
  });

  it('publishes execution completion when blocked contrasts are accurately receipted', async () => {
    const planningReceipt = completionReceipt();
    const methodReceipt = methodAlignmentReceipt(planningReceipt);
    const statisticalReceipt = statisticalCompletionReceipt(planningReceipt);
    const executionReceipt = executionCompletionReceipt(planningReceipt, methodReceipt, statisticalReceipt);
    const receiptIds = storedReceiptIds(planningReceipt, methodReceipt, statisticalReceipt, executionReceipt);
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-execution-complete',
          projectRoot: root,
          payload: {
            workflowKind: 'omics_reproduction',
            workflowPhase: 'execution',
            status: 'completed',
            ...receiptIds,
          },
        })
      );

      expect(result.panel).toMatchObject({ status: 'completed', workflowPhase: 'execution' });
      expect(result.panel?.usedSkills).toEqual(
        expect.arrayContaining([expect.objectContaining({ skillId: 'bio-scrna-differential-expression' })])
      );
      expect(result.panel?.stats.validations).toBe(5);
      expect(result.panel?.executionReceipt?.scientificOutcome).toBe('validated_with_limits');
    });
  });

  it('publishes partial when the final receipt contains only terminal external blockers', async () => {
    const planningReceipt = completionReceipt();
    const methodReceipt = methodAlignmentReceipt(planningReceipt);
    const statisticalReceipt = statisticalCompletionReceipt(planningReceipt);
    const executionReceipt = executionCompletionReceipt(planningReceipt, methodReceipt, statisticalReceipt);
    executionReceipt.status = 'blocked';
    executionReceipt.executionCompletion = 'incomplete';
    executionReceipt.scientificOutcome = 'externally_blocked';
    executionReceipt.modules[0].status = 'externally_blocked';
    executionReceipt.externalBlockers = [
      {
        id: 'missing-controlled-data',
        kind: 'data',
        message: 'Controlled data are unavailable.',
        moduleId: 'condition_de',
        external: true,
      },
    ];
    const receiptIds = storedReceiptIds(planningReceipt, executionReceipt);

    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-execution-external-block',
          projectRoot: root,
          payload: {
            workflowKind: 'omics_reproduction',
            workflowPhase: 'execution',
            status: 'partial',
            ...receiptIds,
          },
        })
      );

      expect(result.completionRequired).toBeUndefined();
      expect(result.panel).toMatchObject({ status: 'partial', workflowPhase: 'execution' });
    });
  });

  it('does not accept legacy method and statistics receipts as the final execution gate', async () => {
    const planningReceipt = completionReceipt();
    const statisticalReceipt = statisticalCompletionReceipt(planningReceipt);
    const receiptIds = storedReceiptIds(planningReceipt, statisticalReceipt);
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-execution-missing-method-alignment',
          projectRoot: root,
          payload: {
            workflowKind: 'omics_reproduction',
            workflowPhase: 'execution',
            status: 'completed',
            ...receiptIds,
          },
        })
      );

      expect(result.completionRequired).toBe(true);
      expect(result.nextActions).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'complete_execution' })])
      );
    });
  });

  it('rejects a stale final execution receipt after a script changes', async () => {
    const planningReceipt = completionReceipt();
    const methodReceipt = methodAlignmentReceipt(planningReceipt);
    const statisticalReceipt = statisticalCompletionReceipt(planningReceipt);
    const executionReceipt = executionCompletionReceipt(planningReceipt, methodReceipt, statisticalReceipt);
    const receiptIds = storedReceiptIds(planningReceipt, methodReceipt, statisticalReceipt, executionReceipt);
    fs.appendFileSync(path.join(root, methodReceipt.scriptFiles[0].path), '# changed\n', 'utf8');
    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-execution-stale-method',
          projectRoot: root,
          payload: {
            workflowKind: 'omics_reproduction',
            workflowPhase: 'execution',
            status: 'completed',
            ...receiptIds,
          },
        })
      );

      expect(result.completionRequired).toBe(true);
      expect(result.panel?.status).toBe('running');
    });
  });

  it('rejects a stale final execution receipt after a statistical output changes', async () => {
    const planningReceipt = completionReceipt();
    const methodReceipt = methodAlignmentReceipt(planningReceipt);
    const statisticalReceipt = statisticalCompletionReceipt(planningReceipt);
    const executionReceipt = executionCompletionReceipt(planningReceipt, methodReceipt, statisticalReceipt);
    const receiptIds = storedReceiptIds(planningReceipt, methodReceipt, statisticalReceipt, executionReceipt);
    fs.appendFileSync(path.join(root, statisticalReceipt.canonicalFiles[0].path), 'changed\n', 'utf8');

    await withCapturedScienceTool(async (handler) => {
      const result = parseResult(
        await handler({
          action: 'publish',
          runId: 'run-execution-stale',
          projectRoot: root,
          payload: {
            workflowKind: 'omics_reproduction',
            workflowPhase: 'execution',
            status: 'completed',
            ...receiptIds,
          },
        })
      );

      expect(result.completionRequired).toBe(true);
      expect(result.panel?.status).toBe('running');
    });
  });
});
