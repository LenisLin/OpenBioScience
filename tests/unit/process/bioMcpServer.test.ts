import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  publicHttpUrlStatus,
  redactCredentialText,
  resolveSafeProjectWritePath,
  safeAbsolutePathStatus,
  safeChildPathStatus,
  safeOutputDirectoryStatus,
} from '@/process/resources/builtinMcp/bio/pathSafety';
import {
  buildMethodContract,
  inspectMethodSources,
  methodContractSchema,
  validateMethodAlignment,
} from '@/process/resources/builtinMcp/bio/reproduction/methodContract';
import { readReceipt, writeReceipt } from '@/process/resources/builtinMcp/bio/receipts';
import type { BioControlReceipt } from '@/common/chat/science';

const ENV_KEYS = [
  'OPENBIOSCIENCE_WORKSPACE_ROOT',
  'OPENBIOSCIENCE_RUNTIME_ROOT',
  'OPENSCIENCE_RUNTIME_ROOT',
  'DEEPORGANISER_WORK_DIR',
  'OPENBIOSCIENCE_BIO_MCP_PROFILE',
] as const;

const previousEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
let root = '';

type ToolTextResult = {
  content: Array<{ type: 'text'; text: string }>;
};

type CapturedTool = {
  name: string;
  description: string;
  handler: (input: { action: string; payload?: Record<string, unknown> }) => ToolTextResult | Promise<ToolTextResult>;
};

const parseToolJson = (result: ToolTextResult) => {
  const text = result.content.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('MCP tool did not return text content.');
  return JSON.parse(text) as {
    status: string;
    planningCompletion?: string;
    executionReadiness?: string;
    validationFingerprint?: string;
    nextActions?: Array<{
      id: string;
      tool: string;
      action: string;
      reason: string;
      payload?: Record<string, unknown>;
    }>;
    receipt?: Record<string, unknown>;
    receiptIds?: string[];
    cache?: { hit: boolean; inputFingerprint: string };
    methodParameterReceipt?: Record<string, unknown>;
    completionReceipt?: {
      schema: string;
      receiptId: string;
      executionCompletion?: string;
      scientificOutcome?: string;
      planningCompletion?: string;
      executionReadiness?: string;
      package?: string;
      designReceiptId?: string;
      validationFingerprint?: string;
      canonicalFiles: Array<{ path: string; contentHash: string }>;
      sourceReceiptIds?: string[];
      runtimeReceiptIds?: string[];
      skillUses: Array<{ skillId: string; status: string }>;
      nextActions: unknown[];
      externalBlockers: unknown[];
    };
    executionContractReceipt?: {
      receiptId: string;
      annotationMode: string;
      requiredModules: string[];
      canonicalFile: { path: string; contentHash: string };
    };
    requiredModules?: string[];
    contrasts?: Array<{
      id: string;
      targetReplicates: number;
      referenceReplicates: number;
      completePairs?: number;
      status: string;
      warnings: string[];
    }>;
    environmentRef?: string;
    path?: string;
    pathStatus?: string;
    environments?: Array<{
      environmentRef?: string;
      id?: string;
      path?: string;
      owner?: string;
      status?: string;
    }>;
    requiredFields?: string[];
    agentExecutesBuild?: boolean;
    indexPath?: string;
    warnings?: string[];
    planningOnly?: boolean;
    sourceAudit?: {
      schema: string;
      data: unknown[];
      code: unknown[];
      referenceResources: unknown[];
      plannedOnly: unknown[];
      warnings: unknown[];
    };
    scriptBoundary?: {
      mayEnterScriptStage: boolean;
    };
    moduleReadiness?: Array<{
      status: string;
      blockingReasons: string[];
    }>;
    plannedItems?: Array<{
      url?: string;
      urlStatus?: {
        status: string;
        reason?: string;
        redacted?: boolean;
        networkChecked?: boolean;
        credentialLikeQueryKeys?: string[];
      };
      status: string;
      plannedOnly: boolean;
      downloadAttempted: boolean;
      blockedReasons: string[];
      maxBytes: number;
    }>;
    planningStatuses?: string[];
    probe?: {
      mode: string;
      status: string;
      importChecksRun: boolean;
      checks: Array<{
        id: string;
        status: string;
        exitCode: number | null;
        stdout: string;
        stderr: string;
      }>;
      reason?: string;
    };
  };
};

const executionOutputPath = (moduleId: string): string =>
  moduleId === 'major_annotation' || moduleId === 'minor_annotation'
    ? 'results/cluster_annotation.tsv'
    : `results/${moduleId}.tsv`;

const withCapturedBioTool = async (
  profile: string,
  expectedServerName: string,
  expectedToolName: string,
  callback: (capturedTool: CapturedTool) => Promise<void> | void
) => {
  process.env.OPENBIOSCIENCE_BIO_MCP_PROFILE = profile;

  let serverConfig: { name: string; version: string } | undefined;
  let capturedTool: CapturedTool | undefined;

  vi.resetModules();
  vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class {
      constructor(config: { name: string; version: string }) {
        serverConfig = config;
      }

      tool(name: string, description: string, _schema: unknown, handler: CapturedTool['handler']): void {
        capturedTool = { name, description, handler };
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
    await import('@/process/resources/builtinMcp/bioServer');

    expect(serverConfig?.name).toBe(expectedServerName);
    expect(capturedTool?.name).toBe(expectedToolName);
    if (!capturedTool) throw new Error(`${expectedToolName} MCP tool was not registered.`);

    await callback(capturedTool);
  } finally {
    vi.doUnmock('@modelcontextprotocol/sdk/server/mcp.js');
    vi.doUnmock('@modelcontextprotocol/sdk/server/stdio.js');
    vi.resetModules();
  }
};

const withCapturedReproductionTool = async (callback: (capturedTool: CapturedTool) => Promise<void> | void) =>
  withCapturedBioTool('reproduction', 'openscience-bio-reproduction', 'bio_reproduction', callback);

const withCapturedStatisticsTool = async (callback: (capturedTool: CapturedTool) => Promise<void> | void) =>
  withCapturedBioTool('statistics', 'openscience-bio-statistics', 'bio_statistics', callback);

const validPlan = `# Reproduction plan

## Reproduction objective
## Paper and source summary
## Data, code, and reference availability
## Ready, conditional, and blocked scope
## Planned execution modules
## Expected outputs
## environmentRef candidates
## Skill and MCP route
## Execution boundary
`;

const validSourceAudit = {
  schema: 'openbioscience.omics_reproduction.source_audit.v1',
  paper: { status: 'ready' },
  data: [{ status: 'ready' }],
  code: [{ status: 'blocked_for_execution' }],
  referenceResources: [],
  localized: [],
  plannedOnly: [],
  warnings: [],
  timestamp: '2026-07-12T00:00:00.000Z',
};

const receipt = (
  producer: 'bio_source' | 'bio_runtime',
  action: string,
  details: Record<string, unknown>,
  status = 'supported'
): BioControlReceipt => ({
  schema: 'openbioscience.bio.receipt.v1',
  receiptId: `bio_receipt_${crypto
    .createHash('sha256')
    .update(JSON.stringify({ producer, action, details, status }))
    .digest('hex')
    .slice(0, 20)}`,
  producer,
  action,
  status,
  projectRoot: root,
  createdAt: Date.now(),
  details,
});

const writeMethodContractFixture = () => {
  const methodContractPath = path.join(root, 'planning', 'method_parameter_contract.json');
  const contract = {
    schema: 'openbioscience.omics_reproduction.method_parameter_contract.v1',
    createdAt: '2026-07-13T00:00:00.000Z',
    sourceReceiptIds: ['bio_receipt_00000000000000000000'],
    evidence: [],
    moduleCoverage: [],
    conflicts: [],
    eligibleClaims: ['scoped_reimplementation'],
  };
  const content = `${JSON.stringify(contract, null, 2)}\n`;
  fs.mkdirSync(path.dirname(methodContractPath), { recursive: true });
  fs.writeFileSync(methodContractPath, content, 'utf8');
  const methodParameterReceipt = {
    schema: 'openbioscience.bio.receipt.v1' as const,
    receiptId: `bio_receipt_${crypto.createHash('sha256').update(content).digest('hex').slice(0, 20)}`,
    producer: 'bio_reproduction' as const,
    action: 'extract_method_parameters',
    status: 'ready',
    projectRoot: root,
    createdAt: Date.now(),
    canonicalFile: {
      path: 'planning/method_parameter_contract.json',
      contentHash: crypto.createHash('sha256').update(content).digest('hex'),
    },
    sourceReceiptIds: contract.sourceReceiptIds,
    moduleCoverage: [],
    conflicts: [],
    nextActions: [],
  };
  writeReceipt(root, methodParameterReceipt);
  return {
    methodContractPath: 'planning/method_parameter_contract.json',
    methodParameterReceiptId: methodParameterReceipt.receiptId,
  };
};

const writePlanningReceiptFixtures = () => {
  const mapPath = path.join(root, 'case_reproduction', 'planning', 'paper_reproduction_map.json');
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, '{}\n', 'utf8');
  const canonicalFile = {
    path: 'case_reproduction/planning/paper_reproduction_map.json',
    contentHash: crypto.createHash('sha256').update(fs.readFileSync(mapPath)).digest('hex'),
  };
  const paperMapReceipt = {
    schema: 'openbioscience.bio.receipt.v1' as const,
    receiptId: 'bio_receipt_11111111111111111111',
    producer: 'bio_reproduction' as const,
    action: 'validate_paper_reproduction_map',
    status: 'ready',
    projectRoot: root,
    createdAt: Date.now(),
    canonicalFile,
    sourceReceiptIds: [],
    targetIds: [],
    unresolvedTargetIds: [],
    nextActions: [],
  };
  const scopeReceipt = {
    schema: 'openbioscience.bio.receipt.v1' as const,
    receiptId: 'bio_receipt_22222222222222222222',
    producer: 'bio_reproduction' as const,
    action: 'validate_reproduction_scope',
    status: 'ready',
    projectRoot: root,
    createdAt: Date.now(),
    paperMapReceiptId: paperMapReceipt.receiptId,
    canonicalFile,
    requiredTargetIds: [],
    excludedTargetIds: [],
    blockedTargetIds: [],
    nextActions: [],
  };
  writeReceipt(root, paperMapReceipt);
  writeReceipt(root, scopeReceipt);
  return { paperMapReceiptId: paperMapReceipt.receiptId, scopeReceiptId: scopeReceipt.receiptId };
};

describe('OpenBioScience bio MCP server path checks', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-bio-mcp-'));
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      const previous = previousEnv[key];
      if (previous == null) delete process.env[key];
      else process.env[key] = previous;
    }
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('extracts reported scRNA-seq parameters and discovers the author GitHub URL from paper text', async () => {
    const paperPath = path.join(root, 'paper.txt');
    fs.writeFileSync(
      paperPath,
      [
        'Cells with >1,000 UMI counts; >200 genes and <6,000 genes; and <20% of mitochondrial gene expression were retained.',
        'CellRanger 2.1.0 and Seurat v.2.3.4 were used.',
        'Variable genes were selected as the top 1,000 highly variable genes expressed by more than 0.1% of cells.',
        'Resolutions from 0.2 to 1.6 were explored and aligned CCA was visualized using t-SNE projection.',
        'Code is available at https://github.com/SGI-CRC/scRNA-seq.',
      ].join('\n'),
      'utf8'
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const inspection = await inspectMethodSources({
      projectRoot: root,
      paperTextPaths: ['paper.txt'],
      supplementPaths: [],
      repositoryUrls: [],
    });

    expect(inspection.status).toBe('partial');
    expect(inspection.candidates.map((item) => item.parameterId)).toEqual(
      expect.arrayContaining(['cellranger_version', 'seurat_version', 'min_umi_counts', 'hvg_count'])
    );
    expect(inspection.externalBlockers[0]?.message).toContain('https://github.com/SGI-CRC/scRNA-seq');
  });

  it('reads public GitHub method files at a fixed commit without cloning', async () => {
    const commitSha = 'a'.repeat(40);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/repos/example/methods')) {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
      }
      if (url.endsWith('/commits/main')) {
        return new Response(JSON.stringify({ sha: commitSha }), { status: 200 });
      }
      if (url.includes('/git/trees/')) {
        return new Response(
          JSON.stringify({ tree: [{ type: 'blob', path: 'analysis.R', sha: 'b'.repeat(40), size: 80 }] }),
          { status: 200 }
        );
      }
      if (url.includes('raw.githubusercontent.com')) {
        return new Response('Seurat v.2.3.4\nResolutions from 0.2 to 1.6 were explored.\n', { status: 200 });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const inspection = await inspectMethodSources({
      projectRoot: root,
      paperTextPaths: [],
      supplementPaths: [],
      repositoryUrls: ['https://github.com/example/methods'],
    });

    expect(inspection.status).toBe('ready');
    expect(inspection.repositories[0]).toMatchObject({ commitSha, scope: 'remote_read_only' });
    expect(inspection.candidates[0]).toMatchObject({ sourceKind: 'author_code' });
    expect(fs.existsSync(path.join(root, 'methods'))).toBe(false);
  });

  it('does not inspect method text through a symlink escaping the project root', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-method-outside-'));
    fs.writeFileSync(path.join(outside, 'paper.txt'), 'Seurat v.2.3.4\n', 'utf8');
    fs.symlinkSync(path.join(outside, 'paper.txt'), path.join(root, 'paper.txt'));
    try {
      const inspection = await inspectMethodSources({
        projectRoot: root,
        paperTextPaths: ['paper.txt'],
        supplementPaths: [],
        repositoryUrls: [],
      });

      expect(inspection.status).toBe('blocked');
      expect(inspection.candidates).toEqual([]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('classifies unreported execution choices as scoped rather than parameter aligned', () => {
    const methodFixture = writeMethodContractFixture();
    const contractPath = path.join(root, methodFixture.methodContractPath);
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    contract.evidence = [
      {
        parameterId: 'min_genes',
        moduleId: 'cell_qc',
        name: 'Minimum genes',
        sourceKind: 'paper_methods',
        sourceId: 'paper',
        locator: 'paper.txt:1',
        reportedValue: 200,
        normalizedValue: 200,
        contentHash: 'a'.repeat(64),
      },
    ];
    fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
    const scriptPath = path.join(root, 'analysis.py');
    const executedPath = path.join(root, 'executed_parameters.json');
    fs.writeFileSync(scriptPath, '# OpenBioScience-Parameters: min_genes,hvg_count\n', 'utf8');
    fs.writeFileSync(
      executedPath,
      JSON.stringify({
        schema: 'openbioscience.omics_reproduction.executed_parameters.v1',
        createdAt: '2026-07-13T00:00:00Z',
        parameters: [
          {
            parameterId: 'min_genes',
            moduleId: 'cell_qc',
            name: 'Minimum genes',
            value: 200,
            origin: 'reported_parameter',
          },
          {
            parameterId: 'hvg_count',
            moduleId: 'hvg_selection',
            name: 'HVG count',
            value: 2000,
            origin: 'analysis_choice',
          },
        ],
      }),
      'utf8'
    );

    const result = validateMethodAlignment({
      projectRoot: root,
      methodReceipt: readReceipt(root, methodFixture.methodParameterReceiptId) as never,
      methodContract: methodContractSchema.parse(contract),
      executedParameterPath: 'executed_parameters.json',
      scriptPaths: ['analysis.py'],
    });

    expect(result.receipt).toMatchObject({
      alignmentLevel: 'scoped_reimplementation',
      alignedParameters: ['min_genes'],
      substitutedParameters: ['hvg_count'],
      eligibleClaims: expect.not.arrayContaining(['parameter_aligned_reproduction']),
    });
  });

  it('preserves conflicting paper and author-code parameter evidence', () => {
    const baseEvidence = {
      parameterId: 'cluster_resolution_range',
      moduleId: 'clustering',
      name: 'Clustering resolution',
      locator: 'source:1',
      contentHash: 'a'.repeat(64),
    };
    const sourceReceipt = {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'method-source',
      producer: 'bio_source',
      action: 'inspect_method_sources',
      status: 'ready',
      projectRoot: root,
      createdAt: Date.now(),
      details: {
        sources: [{ sourceKind: 'paper_methods' }, { sourceKind: 'author_code' }],
        candidates: [
          {
            ...baseEvidence,
            evidenceId: 'paper-value',
            sourceKind: 'paper_methods',
            sourceId: 'paper',
            reportedValue: [0.2, 1.6],
            normalizedValue: [0.2, 1.6],
          },
          {
            ...baseEvidence,
            evidenceId: 'code-value',
            sourceKind: 'author_code',
            sourceId: 'code',
            reportedValue: 0.8,
            normalizedValue: 0.8,
          },
        ],
      },
    };

    const contract = buildMethodContract([sourceReceipt as never]);

    expect(contract.conflicts).toEqual([
      expect.objectContaining({
        parameterId: 'cluster_resolution_range',
        material: true,
        values: [[0.2, 1.6], 0.8],
      }),
    ]);
    expect(contract.moduleCoverage.find((item) => item.moduleId === 'clustering')).toMatchObject({
      hasConflict: true,
      alignmentLevel: 'unresolved_conflict',
    });
  });

  it('returns a correction action for malformed executed-parameter JSON', () => {
    const methodFixture = writeMethodContractFixture();
    fs.writeFileSync(path.join(root, 'executed.json'), '{bad json', 'utf8');
    fs.writeFileSync(path.join(root, 'analysis.py'), '# OpenBioScience-Parameters: min_genes\n', 'utf8');

    const result = validateMethodAlignment({
      projectRoot: root,
      methodReceipt: methodFixture.methodParameterReceipt as never,
      methodContract: methodContractSchema.parse(
        JSON.parse(fs.readFileSync(path.join(root, methodFixture.methodContractPath), 'utf8'))
      ),
      executedParameterPath: 'executed.json',
      scriptPaths: ['analysis.py'],
    });

    expect(result.receipt).toBeUndefined();
    expect(result.nextActions[0]).toMatchObject({ id: 'complete-executed-parameter-contract' });
  });

  it('reports available only for paths under an approved analysis root', () => {
    const allowedFile = path.join(root, 'outputs', 'summary.tsv');
    fs.mkdirSync(path.dirname(allowedFile), { recursive: true });
    fs.writeFileSync(allowedFile, 'ok\n', 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    expect(safeAbsolutePathStatus(allowedFile)).toBe('available');
  });

  it('does not reveal existence for absolute paths outside approved roots', () => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-outside-'));
    const outsideFile = path.join(outsideRoot, 'secret.txt');
    fs.writeFileSync(outsideFile, 'secret\n', 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    try {
      expect(safeAbsolutePathStatus(outsideFile)).toBe('unverified');
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('does not mark symlinked files outside approved roots as available', () => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-outside-'));
    const outsideFile = path.join(outsideRoot, 'source_audit.json');
    const symlinkPath = path.join(root, 'planning', 'source_audit.json');
    fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
    fs.writeFileSync(outsideFile, '{}\n', 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    try {
      fs.symlinkSync(outsideFile, symlinkPath);

      expect(safeAbsolutePathStatus(symlinkPath)).toBe('unverified');
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('rejects canonical writes through a directory symlink outside the project', () => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-outside-'));
    fs.symlinkSync(outsideRoot, path.join(root, 'case_reproduction'));

    try {
      expect(() => resolveSafeProjectWritePath(root, 'case_reproduction/planning/source_audit.json')).toThrow(
        'resolves through a symlink outside the project root'
      );
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('accepts safe output directories inside an approved root', () => {
    const outputDir = path.join(root, 'reproduction', 'localized');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    expect(safeOutputDirectoryStatus(outputDir)).toMatchObject({
      status: 'allowed',
      outputDir,
      resolvedPath: outputDir,
      allowedRoots: [root],
    });
  });

  it('accepts approved roots that are symlinks while still resolving paths safely', () => {
    const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-real-root-'));
    const symlinkRoot = path.join(root, 'workspace-link');
    const allowedFile = path.join(symlinkRoot, 'outputs', 'summary.tsv');

    try {
      fs.symlinkSync(realRoot, symlinkRoot);
      fs.mkdirSync(path.dirname(allowedFile), { recursive: true });
      fs.writeFileSync(allowedFile, 'ok\n', 'utf8');
      process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = symlinkRoot;

      expect(safeAbsolutePathStatus(allowedFile)).toBe('available');
      expect(safeOutputDirectoryStatus(path.join(symlinkRoot, 'localized'))).toMatchObject({
        status: 'allowed',
      });
    } finally {
      fs.rmSync(realRoot, { recursive: true, force: true });
    }
  });

  it('rejects child path traversal targets before localization writes', () => {
    const outputDir = path.join(root, 'reproduction', 'localized');
    const result = safeChildPathStatus(outputDir, '../escape.pdf');

    expect(result).toMatchObject({
      status: 'blocked',
      targetName: '../escape.pdf',
      reason: 'targetName escapes outputDir.',
    });
  });

  it('rejects output directories that resolve through symlinks outside approved roots', () => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-outside-'));
    const symlinkPath = path.join(root, 'linked-output');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    try {
      fs.symlinkSync(outsideRoot, symlinkPath);

      expect(safeOutputDirectoryStatus(symlinkPath)).toMatchObject({
        status: 'blocked',
        outputDir: symlinkPath,
        reason: 'outputDir resolves through a symlink outside allowed roots.',
      });
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('rejects child targets that resolve through symlinks outside outputDir', () => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-outside-'));
    const outputDir = path.join(root, 'reproduction', 'localized');
    fs.mkdirSync(outputDir, { recursive: true });

    try {
      fs.symlinkSync(outsideRoot, path.join(outputDir, 'linked-target'));

      expect(safeChildPathStatus(outputDir, 'linked-target/source.pdf')).toMatchObject({
        status: 'blocked',
        targetName: 'linked-target/source.pdf',
        reason: 'targetName resolves outside outputDir.',
      });
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('rejects localhost URLs for lightweight source localization', () => {
    expect(publicHttpUrlStatus('http://localhost/source.pdf')).toMatchObject({
      status: 'blocked',
      hostname: 'localhost',
      reason: 'Local or internal hostnames are not allowed.',
    });
  });

  it('rejects private IP URLs for lightweight source localization', () => {
    expect(publicHttpUrlStatus('https://192.168.1.20/source.pdf')).toMatchObject({
      status: 'blocked',
      hostname: '192.168.1.20',
      reason: 'Non-public IPv4 URLs are not allowed.',
    });
  });

  it('rejects non-HTTP source URLs for lightweight source localization', () => {
    expect(publicHttpUrlStatus('file:///tmp/source.pdf')).toMatchObject({
      status: 'blocked',
      reason: 'Only HTTP/HTTPS URLs are allowed.',
    });
  });

  it('rejects credential-like URL query parameters and redacts their values', () => {
    const result = publicHttpUrlStatus('https://example.org/source.pdf?token=secret-token&download=1');

    expect(result).toMatchObject({
      status: 'blocked',
      hostname: 'example.org',
      reason: 'Credential-like URL query parameters are not allowed.',
      credentialLikeQueryKeys: ['token'],
      redacted: true,
    });
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(result.url).toContain('token=');
    expect(result.url).not.toContain('secret-token');
  });

  it('rejects URL username and password credentials and redacts their values', () => {
    const result = publicHttpUrlStatus('https://user-secret:password-secret@example.org/source.pdf');

    expect(result).toMatchObject({
      status: 'blocked',
      hostname: 'example.org',
      reason: 'URL credentials are not allowed.',
      redacted: true,
    });
    expect(JSON.stringify(result)).not.toContain('user-secret');
    expect(JSON.stringify(result)).not.toContain('password-secret');
  });

  it('redacts credential-like free text and malformed URL fragments', () => {
    const result = redactCredentialText('Data: not-a-url?token=free-text-secret and api_key=plain-secret before use.');

    expect(result.redacted).toBe(true);
    expect(result.value).toContain('token=');
    expect(result.value).toContain('api_key=');
    expect(result.value).not.toContain('free-text-secret');
    expect(result.value).not.toContain('plain-secret');
  });

  it('reports the full reproduction planning status vocabulary', async () => {
    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(await capturedTool.handler({ action: 'status' }));

      expect(result.planningStatuses).toEqual([
        'ready',
        'partial_ready',
        'conditional_continue',
        'planned_only',
        'blocked_for_localization',
        'blocked_for_execution',
        'unresolved',
        'fatal_block',
      ]);
    });
  });

  it('returns a control-plane contract for user environment creation without running package installation', async () => {
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;

    await withCapturedBioTool(
      'environment_manager',
      'openscience-bio-environment-manager',
      'bio_environment_manager',
      async (capturedTool) => {
        const result = parseToolJson(
          await capturedTool.handler({
            action: 'create_user_environment',
            payload: {
              userId: 'alice',
              environmentName: 'scanpy-custom',
              version: 'v1',
            },
          })
        );

        expect(result).toMatchObject({
          status: 'planned_only',
          environmentRef: 'user:alice/scanpy-custom:v1',
          agentExecutesBuild: true,
          requiredFields: ['userId', 'environmentName', 'version', 'path', 'build', 'keyResources', 'keySupports'],
        });
        expect(result.path).toBe(path.join(root, 'environments', 'custom', 'users', 'alice', 'scanpy-custom', 'v1'));
      }
    );
  });

  it('blocks unsafe user environment identifiers before generating a path contract', async () => {
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;

    await withCapturedBioTool(
      'environment_manager',
      'openscience-bio-environment-manager',
      'bio_environment_manager',
      async (capturedTool) => {
        const result = parseToolJson(
          await capturedTool.handler({
            action: 'create_user_environment',
            payload: {
              userId: 'alice',
              environmentName: '..',
              version: 'v1',
            },
          })
        );

        expect(result).toMatchObject({
          status: 'blocked',
          environmentRef: 'user:alice/..:v1',
        });
        expect(result.warnings).toEqual(expect.arrayContaining(['Invalid identifier fields: environmentName.']));
      }
    );
  });

  it('registers and lists only the requested user environment index', async () => {
    const aliceEnvPath = path.join(root, 'environments', 'custom', 'users', 'alice', 'scanpy-custom', 'v1');
    const bobEnvPath = path.join(root, 'environments', 'custom', 'users', 'bob', 'scanpy-custom', 'v1');
    fs.mkdirSync(aliceEnvPath, { recursive: true });
    fs.mkdirSync(bobEnvPath, { recursive: true });
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;

    await withCapturedBioTool(
      'environment_manager',
      'openscience-bio-environment-manager',
      'bio_environment_manager',
      async (capturedTool) => {
        const aliceRegister = parseToolJson(
          await capturedTool.handler({
            action: 'register_user_environment',
            payload: {
              userId: 'alice',
              environmentName: 'scanpy-custom',
              version: 'v1',
              path: aliceEnvPath,
              build: { source: 'agent-created' },
              keyResources: { cpu: '4+', memory: '16GB+', gpu: false },
              keySupports: {
                tools: ['scanpy'],
                skills: ['bio-qc-preprocess'],
                workflows: ['singlecell_import_summary'],
              },
            },
          })
        );
        const bobRegister = parseToolJson(
          await capturedTool.handler({
            action: 'register_user_environment',
            payload: {
              userId: 'bob',
              environmentName: 'scanpy-custom',
              version: 'v1',
              path: bobEnvPath,
              build: { source: 'agent-created' },
              keyResources: ['conda-env.yml'],
              keySupports: ['scanpy'],
            },
          })
        );
        const listed = parseToolJson(
          await capturedTool.handler({
            action: 'list_user_environments',
            payload: { userId: 'alice' },
          })
        );

        expect(aliceRegister).toMatchObject({
          status: 'ready',
          environmentRef: 'user:alice/scanpy-custom:v1',
          path: aliceEnvPath,
        });
        expect(bobRegister).toMatchObject({ status: 'ready', environmentRef: 'user:bob/scanpy-custom:v1' });
        expect(listed.environments).toHaveLength(1);
        expect(listed.environments?.[0]).toMatchObject({
          environmentRef: 'user:alice/scanpy-custom:v1',
          path: aliceEnvPath,
          owner: 'alice',
          status: 'ready',
          keyResources: { cpu: '4+', memory: '16GB+', gpu: false },
          keySupports: { tools: ['scanpy'], skills: ['bio-qc-preprocess'], workflows: ['singlecell_import_summary'] },
        });
        expect(JSON.stringify(listed)).not.toContain('user:bob');
        expect(aliceRegister.indexPath).toBe(path.join(root, 'manifests', 'environments', 'users', 'alice.json'));
        expect(fs.existsSync(aliceRegister.indexPath || '')).toBe(true);
      }
    );
  });

  it('rejects registration when a user environment path escapes the owner custom root', async () => {
    const bobOwnedEnvPath = path.join(root, 'environments', 'custom', 'users', 'bob', 'scanpy-custom', 'v1');
    const externalEnvPath = path.join(root, 'external-conda', 'scanpy-custom');
    fs.mkdirSync(bobOwnedEnvPath, { recursive: true });
    fs.mkdirSync(externalEnvPath, { recursive: true });
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;

    await withCapturedBioTool(
      'environment_manager',
      'openscience-bio-environment-manager',
      'bio_environment_manager',
      async (capturedTool) => {
        for (const envPath of [bobOwnedEnvPath, externalEnvPath]) {
          const result = parseToolJson(
            await capturedTool.handler({
              action: 'register_user_environment',
              payload: {
                userId: 'alice',
                environmentName: 'scanpy-custom',
                version: 'v1',
                path: envPath,
                build: {},
                keyResources: [],
                keySupports: [],
              },
            })
          );

          expect(result.status).toBe('blocked');
          expect(result.warnings).toEqual(
            expect.arrayContaining(['User environment path must live under the owner custom env root.'])
          );
        }
      }
    );
  });

  it('rejects registration when a user environment path points at the official environment prefix', async () => {
    const officialEnvPath = path.join(root, 'environments', 'official', 'sc-r-singlecell');
    fs.mkdirSync(officialEnvPath, { recursive: true });
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;

    await withCapturedBioTool(
      'environment_manager',
      'openscience-bio-environment-manager',
      'bio_environment_manager',
      async (capturedTool) => {
        const result = parseToolJson(
          await capturedTool.handler({
            action: 'register_user_environment',
            payload: {
              userId: 'alice',
              environmentName: 'bad-alias',
              version: 'v1',
              path: officialEnvPath,
              build: {},
              keyResources: [],
              keySupports: [],
            },
          })
        );

        expect(result.status).toBe('blocked');
        expect(result.warnings).toEqual(
          expect.arrayContaining(['User environment path must not use official env prefix.'])
        );
      }
    );
  });

  it('filters stale user environment index records that escape the owner custom root', async () => {
    const validEnvPath = path.join(root, 'environments', 'custom', 'users', 'alice', 'scanpy-custom', 'v1');
    const unsafeEnvPath = path.join(root, 'external-conda', 'scanpy-custom');
    const indexPath = path.join(root, 'manifests', 'environments', 'users', 'alice.json');
    fs.mkdirSync(validEnvPath, { recursive: true });
    fs.mkdirSync(unsafeEnvPath, { recursive: true });
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(
      indexPath,
      JSON.stringify(
        {
          schema: 'openbioscience.bio_mcp.user_environment_index.v1',
          userId: 'alice',
          environments: [
            {
              environmentRef: 'user:alice/scanpy-custom:v1',
              path: validEnvPath,
              build: {},
              keyResources: [],
              keySupports: [],
              owner: 'alice',
              status: 'ready',
            },
            {
              environmentRef: 'user:alice/unsafe:v1',
              path: unsafeEnvPath,
              build: {},
              keyResources: [],
              keySupports: [],
              owner: 'alice',
              status: 'ready',
            },
          ],
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;

    await withCapturedBioTool(
      'environment_manager',
      'openscience-bio-environment-manager',
      'bio_environment_manager',
      async (capturedTool) => {
        const listed = parseToolJson(
          await capturedTool.handler({
            action: 'list_user_environments',
            payload: { userId: 'alice' },
          })
        );

        expect(listed.environments).toHaveLength(1);
        expect(listed.environments?.[0]).toMatchObject({
          environmentRef: 'user:alice/scanpy-custom:v1',
          path: validEnvPath,
        });
        expect(JSON.stringify(listed)).not.toContain(unsafeEnvPath);
      }
    );
  });

  it('allows runtime list, resolve, and probe to see registered user environments for the requested user', async () => {
    const envPath = path.join(root, 'environments', 'custom', 'users', 'alice', 'scanpy-custom', 'v1');
    const binPath = path.join(envPath, 'bin');
    fs.mkdirSync(binPath, { recursive: true });
    fs.writeFileSync(path.join(binPath, 'python'), '#!/bin/sh\necho Python 3.12.0\n', 'utf8');
    fs.chmodSync(path.join(binPath, 'python'), 0o755);
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;

    await withCapturedBioTool(
      'environment_manager',
      'openscience-bio-environment-manager',
      'bio_environment_manager',
      async (capturedTool) => {
        await capturedTool.handler({
          action: 'register_user_environment',
          payload: {
            userId: 'alice',
            environmentName: 'scanpy-custom',
            version: 'v1',
            path: envPath,
            build: { source: 'agent-created' },
            keyResources: ['conda-env.yml'],
            keySupports: ['scanpy'],
          },
        });
      }
    );

    await withCapturedBioTool('runtime', 'openscience-bio-runtime', 'bio_runtime', async (capturedTool) => {
      const listed = parseToolJson(
        await capturedTool.handler({
          action: 'list_environments',
          payload: { userId: 'alice' },
        })
      );
      const resolved = parseToolJson(
        await capturedTool.handler({
          action: 'resolve_environment',
          payload: { environmentRef: 'user:alice/scanpy-custom:v1' },
        })
      );
      const probed = parseToolJson(
        await capturedTool.handler({
          action: 'probe_environment',
          payload: { environmentRef: 'user:alice/scanpy-custom:v1' },
        })
      );

      expect(listed.environments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            environmentRef: 'user:alice/scanpy-custom:v1',
            path: envPath,
            owner: 'alice',
            pathStatus: 'available',
          }),
        ])
      );
      expect(resolved).toMatchObject({
        status: 'supported',
        environmentRef: 'user:alice/scanpy-custom:v1',
        path: envPath,
        pathStatus: 'available',
      });
      expect(probed).toMatchObject({
        status: 'supported',
        environmentRef: 'user:alice/scanpy-custom:v1',
        path: envPath,
        pathStatus: 'available',
        probe: {
          mode: 'execution',
          status: 'passed',
          importChecksRun: false,
          checks: [{ id: 'python-version', status: 'passed', exitCode: 0 }],
        },
      });
    });
  });

  it('runs the fixed Scanpy import probe for the official Python environment', async () => {
    const envPath = path.join(root, 'environments', 'official', 'sc-py-singlecell');
    const binPath = path.join(envPath, 'bin');
    fs.mkdirSync(binPath, { recursive: true });
    fs.writeFileSync(path.join(binPath, 'python'), '#!/bin/sh\necho 3.12.0\necho scanpy,anndata\n', 'utf8');
    fs.chmodSync(path.join(binPath, 'python'), 0o755);
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;

    await withCapturedBioTool('runtime', 'openscience-bio-runtime', 'bio_runtime', async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'probe_environment',
          payload: { environmentRef: 'sc-py-singlecell' },
        })
      );

      expect(result).toMatchObject({
        status: 'supported',
        environmentRef: 'sc-py-singlecell',
        pathStatus: 'available',
        probe: {
          mode: 'execution',
          status: 'passed',
          importChecksRun: true,
          checks: [{ id: 'python-imports', status: 'passed', exitCode: 0 }],
        },
      });
    });
  });

  it('does not report an available official prefix as execution-ready when its executable is missing', async () => {
    fs.mkdirSync(path.join(root, 'environments', 'official', 'sc-r-singlecell'), { recursive: true });
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;

    await withCapturedBioTool('runtime', 'openscience-bio-runtime', 'bio_runtime', async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'probe_environment',
          payload: { environmentRef: 'sc-r-singlecell' },
        })
      );

      expect(result).toMatchObject({
        status: 'conditional',
        pathStatus: 'available',
        probe: {
          mode: 'execution',
          status: 'failed',
          importChecksRun: true,
          checks: [{ id: 'r-imports', status: 'missing', exitCode: null }],
        },
      });
    });
  });

  it('keeps runtime official-only without userId and blocks unknown user environment refs', async () => {
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;

    await withCapturedBioTool('runtime', 'openscience-bio-runtime', 'bio_runtime', async (capturedTool) => {
      const listed = parseToolJson(await capturedTool.handler({ action: 'list_environments' }));
      const resolved = parseToolJson(
        await capturedTool.handler({
          action: 'resolve_environment',
          payload: { environmentRef: 'user:alice/missing:v1' },
        })
      );

      expect(listed.environments?.some((environment) => environment.environmentRef?.startsWith('user:'))).toBe(false);
      expect(resolved).toMatchObject({
        status: 'blocked',
        environmentRef: 'user:alice/missing:v1',
        pathStatus: 'unavailable',
      });
    });
  });

  it('blocks lightweight localization for credential-like URL queries without echoing secrets', async () => {
    const outputDir = path.join(root, 'reproduction', 'localized');
    fs.mkdirSync(outputDir, { recursive: true });
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'localize_source_package',
          payload: {
            outputDir,
            sources: [
              {
                id: 'signed-source',
                url: 'https://example.org/source.pdf?token=secret-token',
                targetName: 'source.pdf',
                expectedBytes: 1024,
              },
            ],
          },
        })
      );

      expect(result.status).toBe('fatal_block');
      expect(JSON.stringify(result)).not.toContain('secret-token');
      expect(result.plannedItems?.[0]).toMatchObject({
        urlStatus: {
          status: 'blocked',
          redacted: true,
          networkChecked: false,
          credentialLikeQueryKeys: ['token'],
        },
        status: 'blocked_for_localization',
        blockedReasons: expect.arrayContaining(['Credential-like URL query parameters are not allowed.']),
      });
    });
  });

  it('blocks malformed credential-like localization URLs without echoing secrets', async () => {
    const outputDir = path.join(root, 'reproduction', 'localized');
    fs.mkdirSync(outputDir, { recursive: true });
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'localize_source_package',
          payload: {
            outputDir,
            sources: [
              {
                id: 'malformed-source',
                url: 'not-a-url?token=malformed-secret',
                targetName: 'source.pdf',
                expectedBytes: 1024,
              },
            ],
          },
        })
      );

      expect(result.status).toBe('fatal_block');
      expect(JSON.stringify(result)).not.toContain('malformed-secret');
      expect(result.plannedItems?.[0]).toMatchObject({
        urlStatus: {
          status: 'blocked',
          redacted: true,
          networkChecked: false,
          reason: 'URL is invalid.',
        },
        status: 'blocked_for_localization',
      });
    });
  });

  it('represents files over 50 MB as blocked planned-only localization items', async () => {
    const outputDir = path.join(root, 'reproduction', 'localized');
    fs.mkdirSync(outputDir, { recursive: true });
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'localize_source_package',
          payload: {
            outputDir,
            sources: [
              {
                id: 'large-source',
                url: 'https://example.org/source.pdf',
                targetName: 'source.pdf',
                expectedBytes: 50 * 1024 * 1024 + 1,
              },
            ],
          },
        })
      );

      expect(result).toMatchObject({
        status: 'blocked_for_localization',
        planningOnly: true,
        plannedItems: [
          {
            status: 'blocked_for_localization',
            plannedOnly: true,
            downloadAttempted: false,
            maxBytes: 50 * 1024 * 1024,
            blockedReasons: ['Expected file size exceeds limit of 52428800 bytes.'],
          },
        ],
      });
    });
  });

  it('emits a source audit shape aligned with the planning skill schema', async () => {
    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'audit_data_code_availability',
          payload: {
            paper: { title: 'Demo paper', doi: '10.0000/demo' },
            accessions: ['GSE12345'],
            codeLinks: ['https://github.com/example/repro'],
            referenceResources: ['GRCh38 GTF'],
          },
        })
      );

      expect(result).toMatchObject({
        status: 'conditional_continue',
        planningOnly: true,
        sourceAudit: {
          schema: 'openbioscience.omics_reproduction.source_audit.v1',
          paper: expect.objectContaining({ title: 'Demo paper' }),
        },
      });
      expect(Array.isArray(result.sourceAudit?.data)).toBe(true);
      expect(Array.isArray(result.sourceAudit?.code)).toBe(true);
      expect(Array.isArray(result.sourceAudit?.referenceResources)).toBe(true);
      expect(Array.isArray(result.sourceAudit?.plannedOnly)).toBe(true);
      expect(Array.isArray(result.sourceAudit?.warnings)).toBe(true);
    });
  });

  it('returns canonical method-contract content and a reusable receipt after the file is written', async () => {
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
    const sourceReceipt = receipt(
      'bio_source',
      'inspect_method_sources',
      {
        sources: [{ sourceKind: 'paper_methods' }],
        candidates: [
          {
            evidenceId: 'evidence-min-genes',
            parameterId: 'min_genes',
            moduleId: 'cell_qc',
            name: 'Minimum genes',
            sourceKind: 'paper_methods',
            sourceId: 'paper',
            locator: 'paper.txt:1',
            reportedValue: 200,
            normalizedValue: 200,
            contentHash: 'a'.repeat(64),
          },
        ],
      },
      'ready'
    );
    writeReceipt(root, sourceReceipt);
    await withCapturedReproductionTool(async (capturedTool) => {
      const first = parseToolJson(
        await capturedTool.handler({
          action: 'extract_method_parameters',
          payload: {
            methodContractPath: 'case_reproduction/planning/method_parameter_contract.json',
            methodSourceReceiptId: sourceReceipt.receiptId,
          },
        })
      ) as Record<string, unknown>;
      const contractPath = path.join(root, 'case_reproduction', 'planning', 'method_parameter_contract.json');
      expect(first.status).toBe('ready');
      expect(first.methodParameterReceipt).toMatchObject({
        action: 'extract_method_parameters',
        status: 'ready',
        canonicalFile: {
          path: 'case_reproduction/planning/method_parameter_contract.json',
          contentHash: crypto.createHash('sha256').update(fs.readFileSync(contractPath)).digest('hex'),
        },
      });

      const repeated = parseToolJson(
        await capturedTool.handler({
          action: 'extract_method_parameters',
          payload: {
            methodContractPath: 'case_reproduction/planning/method_parameter_contract.json',
            methodSourceReceiptId: sourceReceipt.receiptId,
          },
        })
      ) as Record<string, unknown>;
      expect(repeated.status).toBe('ready');
      expect((repeated.receipt as { receiptId: string }).receiptId).toBe(
        (first.methodParameterReceipt as { receiptId: string }).receiptId
      );
      expect(repeated.cache).toMatchObject({ hit: true });
      expect(repeated.nextActions).toEqual([]);
    });
  });

  it('atomically replaces a malformed MCP-owned method contract', async () => {
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
    const sourceReceipt = receipt(
      'bio_source',
      'inspect_method_sources',
      { sources: [{ sourceKind: 'paper_methods' }], candidates: [] },
      'ready'
    );
    writeReceipt(root, sourceReceipt);
    const contractPath = path.join(root, 'case_reproduction', 'planning', 'method_parameter_contract.json');
    fs.mkdirSync(path.dirname(contractPath), { recursive: true });
    fs.writeFileSync(contractPath, '{invalid', 'utf8');

    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'extract_method_parameters',
          payload: {
            methodContractPath: 'case_reproduction/planning/method_parameter_contract.json',
            methodSourceReceiptId: sourceReceipt.receiptId,
          },
        })
      );

      expect(result.status).toBe('ready');
      expect(methodContractSchema.parse(JSON.parse(fs.readFileSync(contractPath, 'utf8')))).toBeDefined();
      expect(result.nextActions).toEqual([]);
    });
  });

  it('rejects a singular methodSourceReceipt object and returns the receipt-id call', async () => {
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
    const sourceReceipt = receipt(
      'bio_source',
      'inspect_method_sources',
      { sources: [{ sourceKind: 'paper_methods' }], candidates: [] },
      'ready'
    );

    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'extract_method_parameters',
          payload: {
            methodContractPath: 'case_reproduction/planning/method_parameter_contract.json',
            methodSourceReceipt: sourceReceipt,
          },
        })
      ) as Record<string, unknown>;

      expect(result.status).toBe('invalid_request');
      expect(result.correctedCall).toMatchObject({
        action: 'extract_method_parameters',
        payload: { methodSourceReceiptId: sourceReceipt.receiptId },
      });
      expect(fs.existsSync(path.join(root, 'case_reproduction/planning/method_parameter_contract.json'))).toBe(false);
    });
  });

  it('redacts credential-like source package fields before returning planning drafts', async () => {
    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'build_source_package',
          payload: {
            paper: { title: 'Demo paper' },
            links: ['https://example.org/download?token=link-secret'],
            codeLinks: ['https://github.com/example/repro?signature=repo-secret'],
            supplements: [
              {
                url: 'https://example.org/supplement.xlsx',
                apiKey: 'secret-key',
                nested: [{ token: 'nested-token' }],
              },
            ],
          },
        })
      ) as {
        sourcePackageDraft?: {
          supplements?: Array<Record<string, unknown>>;
          links?: string[];
          codeLinks?: string[];
        };
        warnings?: string[];
      };

      expect(result.sourcePackageDraft?.supplements?.[0]).toMatchObject({
        url: 'https://example.org/supplement.xlsx',
        apiKey: '[redacted]',
        nested: [{ token: '[redacted]' }],
      });
      expect(result.sourcePackageDraft).toMatchObject({
        links: [expect.stringContaining('token=')],
        codeLinks: [expect.stringContaining('signature=')],
      });
      expect(JSON.stringify(result)).not.toContain('secret-key');
      expect(JSON.stringify(result)).not.toContain('nested-token');
      expect(JSON.stringify(result)).not.toContain('link-secret');
      expect(JSON.stringify(result)).not.toContain('repo-secret');
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          'Credential-like source fields were redacted and must not be stored in the Planning Package.',
        ])
      );
    });
  });

  it('redacts credential-like free-text source package and source audit fields', async () => {
    await withCapturedReproductionTool(async (capturedTool) => {
      const sourcePackage = parseToolJson(
        await capturedTool.handler({
          action: 'build_source_package',
          payload: {
            paper: { title: 'Demo paper' },
            methods: 'Downloaded from https://example.org/methods.txt?token=methods-secret',
            dataAvailability: 'Data are at not-a-url?api_key=data-secret',
            codeAvailability: 'Code mirror uses https://user-secret:password-secret@example.org/repo.git',
            referenceResources: ['Atlas table token=reference-secret'],
          },
        })
      ) as {
        sourcePackageDraft?: {
          methods?: string;
          dataAvailability?: string;
          codeAvailability?: string;
          referenceResources?: string[];
        };
        warnings?: string[];
      };

      expect(JSON.stringify(sourcePackage)).not.toContain('methods-secret');
      expect(JSON.stringify(sourcePackage)).not.toContain('data-secret');
      expect(JSON.stringify(sourcePackage)).not.toContain('user-secret');
      expect(JSON.stringify(sourcePackage)).not.toContain('password-secret');
      expect(JSON.stringify(sourcePackage)).not.toContain('reference-secret');
      expect(sourcePackage.warnings).toEqual(
        expect.arrayContaining([
          'Credential-like source fields were redacted and must not be stored in the Planning Package.',
        ])
      );

      const audit = parseToolJson(
        await capturedTool.handler({
          action: 'audit_data_code_availability',
          payload: {
            paper: { title: 'Demo paper' },
            dataAvailability: 'Data are at https://example.org/data.tsv?token=audit-data-secret',
            codeAvailability: 'Code uses api_key=audit-code-secret',
            referenceResources: ['Atlas password=audit-reference-secret'],
          },
        })
      );

      expect(JSON.stringify(audit)).not.toContain('audit-data-secret');
      expect(JSON.stringify(audit)).not.toContain('audit-code-secret');
      expect(JSON.stringify(audit)).not.toContain('audit-reference-secret');
      expect(audit.sourceAudit?.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'warning',
            scope: 'source',
          }),
        ])
      );
      expect(
        JSON.parse(fs.readFileSync(path.join(root, 'case_reproduction/planning/source_audit.json'), 'utf8'))
      ).toMatchObject({ schema: 'openbioscience.omics_reproduction.source_audit.v1' });
    });
  });

  it('returns a canonical retry action for legacy validation field names', async () => {
    const planPath = path.join(root, 'planning', 'reproduction_plan.md');
    const auditPath = path.join(root, 'planning', 'source_audit.json');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, validPlan, 'utf8');
    fs.writeFileSync(auditPath, JSON.stringify(validSourceAudit), 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'validate_reproduction_plan',
          payload: {
            plan_path: planPath,
            source_audit_path: auditPath,
            modules: [],
          },
        })
      );

      expect(result.status).toBe('invalid_request');
      expect(result.nextActions?.[0]).toMatchObject({
        tool: 'bio_reproduction',
        action: 'validate_reproduction_plan',
        payload: expect.objectContaining({ planPath, sourceAuditPath: auditPath }),
      });
    });
  });

  it('resolves project-relative planning paths and emits a reusable completion receipt', async () => {
    const planPath = path.join(root, 'planning', 'reproduction_plan.md');
    const auditPath = path.join(root, 'planning', 'source_audit.json');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, validPlan, 'utf8');
    fs.writeFileSync(auditPath, JSON.stringify(validSourceAudit), 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
    const runtimeReceipt = receipt('bio_runtime', 'probe_environment', {
      environmentRef: 'sc-r-singlecell',
      probe: { status: 'passed' },
    });
    const sourceReceipt = receipt('bio_source', 'verify_local_assets', { assets: [{ status: 'available' }] });
    writeReceipt(root, runtimeReceipt);
    writeReceipt(root, sourceReceipt);
    const methodFixture = writeMethodContractFixture();
    const planningFixtures = writePlanningReceiptFixtures();

    await withCapturedReproductionTool(async (capturedTool) => {
      const payload = {
        planPath: 'planning/reproduction_plan.md',
        sourceAuditPath: 'planning/source_audit.json',
        modules: [
          {
            id: 'm01',
            status: 'ready',
            sourceStatus: 'ready',
            environmentRef: 'sc-r-singlecell',
            skillRoute: ['bio-scrna-reproduction'],
            mcpRoute: ['bio_runtime'],
            expectedOutputs: ['execution/logs/review.md'],
          },
        ],
        sourceReceiptIds: [sourceReceipt.receiptId],
        runtimeReceiptIds: [runtimeReceipt.receiptId],
        skillComplianceReceiptIds: [],
        ...planningFixtures,
        ...methodFixture,
      };
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'validate_reproduction_plan',
          payload,
        })
      );
      const repeated = parseToolJson(
        await capturedTool.handler({
          action: 'validate_reproduction_plan',
          payload,
        })
      );

      expect(result.status).toBe('ready');
      expect(result.planningCompletion).toBe('complete');
      expect(result.executionReadiness).toBe('ready');
      expect(result.scriptBoundary?.mayEnterScriptStage).toBe(true);
      expect(result.moduleReadiness?.[0]).toMatchObject({ status: 'ready', blockingReasons: [] });
      expect(result.completionReceipt).toMatchObject({
        schema: 'openbioscience.bio.receipt.v1',
        planningCompletion: 'complete',
        executionReadiness: 'ready',
        sourceReceiptIds: [sourceReceipt.receiptId],
        runtimeReceiptIds: [runtimeReceipt.receiptId],
        nextActions: [],
      });
      expect(result.completionReceipt?.skillUses.map((item) => item.skillId)).toEqual(
        expect.arrayContaining(['bio-omics-reproduction-planning', 'bio-scrna-reproduction'])
      );
      expect(repeated.validationFingerprint).toBe(result.validationFingerprint);
      expect(repeated.receipt?.receiptId).toBe(result.completionReceipt?.receiptId);
    });
  });

  it('keeps planning complete when a documented module is externally blocked', async () => {
    const planPath = path.join(root, 'planning', 'reproduction_plan.md');
    const auditPath = path.join(root, 'planning', 'source_audit.json');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, validPlan, 'utf8');
    fs.writeFileSync(auditPath, JSON.stringify(validSourceAudit), 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
    const methodFixture = writeMethodContractFixture();
    const planningFixtures = writePlanningReceiptFixtures();
    const sourceReceipt = receipt('bio_source', 'verify_local_assets', { assets: [{ status: 'available' }] });
    const failedRuntimeReceipt = receipt(
      'bio_runtime',
      'probe_environment',
      { environmentRef: 'sc-r-singlecell', probe: { status: 'failed' } },
      'conditional'
    );
    writeReceipt(root, sourceReceipt);
    writeReceipt(root, failedRuntimeReceipt);

    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'validate_reproduction_plan',
          payload: {
            planPath,
            sourceAuditPath: auditPath,
            approvedExistingData: true,
            modules: [
              {
                id: 'm01',
                status: 'blocked_for_execution',
                sourceStatus: 'blocked_for_execution',
                environmentRef: 'sc-r-singlecell',
                skillRoute: ['bio-scrna-reproduction'],
                mcpRoute: ['bio_runtime'],
                expectedOutputs: ['execution/logs/review.md'],
              },
            ],
            sourceReceiptIds: [sourceReceipt.receiptId],
            runtimeReceiptIds: [failedRuntimeReceipt.receiptId],
            skillComplianceReceiptIds: [],
            ...planningFixtures,
            ...methodFixture,
          },
        })
      );

      expect(result.planningCompletion).toBe('complete');
      expect(result.executionReadiness).toBe('blocked');
      expect(result.status).toBe('ready');
      expect(result.scriptBoundary?.mayEnterScriptStage).toBe(false);
      expect(result.completionReceipt?.externalBlockers).toHaveLength(1);
    });
  });

  it('returns a file correction action for malformed source audit schema', async () => {
    const planPath = path.join(root, 'planning', 'reproduction_plan.md');
    const auditPath = path.join(root, 'planning', 'source_audit.json');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, validPlan, 'utf8');
    fs.writeFileSync(
      auditPath,
      JSON.stringify({ ...validSourceAudit, data: {}, paper: { status: 'invalid' } }),
      'utf8'
    );
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
    const methodFixture = writeMethodContractFixture();
    const planningFixtures = writePlanningReceiptFixtures();
    const sourceReceipt = receipt('bio_source', 'verify_local_assets', { assets: [{ status: 'available' }] });
    const failedRuntimeReceipt = receipt('bio_runtime', 'probe_environment', {
      environmentRef: 'sc-r-singlecell',
      probe: { status: 'failed' },
    });
    writeReceipt(root, sourceReceipt);
    writeReceipt(root, failedRuntimeReceipt);

    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'validate_reproduction_plan',
          payload: {
            planPath,
            sourceAuditPath: auditPath,
            approvedExistingData: true,
            modules: [
              {
                id: 'm01',
                status: 'planned_only',
                sourceStatus: 'planned_only',
                environmentRef: 'sc-r-singlecell',
                skillRoute: ['bio-scrna-reproduction'],
                mcpRoute: ['bio_runtime'],
                expectedOutputs: ['execution/logs/review.md'],
              },
            ],
            sourceReceiptIds: [sourceReceipt.receiptId],
            runtimeReceiptIds: [failedRuntimeReceipt.receiptId],
            skillComplianceReceiptIds: [],
            ...planningFixtures,
            ...methodFixture,
          },
        })
      );

      expect(result.planningCompletion).toBe('incomplete');
      expect(result.nextActions).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'write-canonical-source-audit', tool: 'runtime' })])
      );
    });
  });

  it('blocks an unpaired contrast with fewer than three biological replicates per group', async () => {
    fs.writeFileSync(path.join(root, 'counts.tsv'), 'gene\tS1\nG1\t1\n', 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    await withCapturedStatisticsTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'validate_de_design',
          payload: {
            replicateUnit: 'Sample',
            conditionColumn: 'Class',
            cellTypeColumn: 'Cell_type',
            formula: '~0+Class',
            executedFormula: '~0+Class',
            countMatrix: {
              path: 'counts.tsv',
              aggregationUnit: 'biological_replicate',
              integerCounts: true,
            },
            designMatrix: { columns: ['ClassNormal', 'ClassTumor'], rank: 2 },
            samples: [
              { id: 'N1', biologicalReplicate: 'N1', condition: 'Normal', cellType: 'Mast' },
              { id: 'N2', biologicalReplicate: 'N2', condition: 'Normal', cellType: 'Mast' },
              { id: 'T1', biologicalReplicate: 'T1', condition: 'Tumor', cellType: 'Mast' },
              { id: 'T2', biologicalReplicate: 'T2', condition: 'Tumor', cellType: 'Mast' },
            ],
            contrasts: [{ id: 'mast-tvn', target: 'Tumor', reference: 'Normal', cellType: 'Mast' }],
          },
        })
      );

      expect(result.status).toBe('ready');
      expect(result.contrasts).toEqual([
        expect.objectContaining({
          id: 'mast-tvn',
          targetReplicates: 2,
          referenceReplicates: 2,
          status: 'blocked',
        }),
      ]);
    });
  });

  it('counts complete pairs after exclusions and warns at exactly three pairs', async () => {
    fs.writeFileSync(path.join(root, 'counts.tsv'), 'gene\tS1\nG1\t1\n', 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
    const samples = ['P1', 'P2', 'P3'].flatMap((pairId) => [
      {
        id: `${pairId}-N`,
        biologicalReplicate: `${pairId}-N`,
        condition: 'Normal',
        cellType: 'B cell',
        pairId,
      },
      {
        id: `${pairId}-T`,
        biologicalReplicate: `${pairId}-T`,
        condition: 'Tumor',
        cellType: 'B cell',
        pairId,
      },
    ]);
    samples.push({
      id: 'P4-T',
      biologicalReplicate: 'P4-T',
      condition: 'Tumor',
      cellType: 'B cell',
      pairId: 'P4',
    });

    await withCapturedStatisticsTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'validate_de_design',
          payload: {
            replicateUnit: 'Sample',
            conditionColumn: 'Class',
            cellTypeColumn: 'Cell_type',
            pairedBy: 'Patient',
            formula: '~Patient+Class',
            executedFormula: '~Patient+Class',
            countMatrix: {
              path: 'counts.tsv',
              aggregationUnit: 'biological_replicate',
              integerCounts: true,
            },
            designMatrix: { columns: ['PatientP1', 'PatientP2', 'PatientP3', 'ClassTumor'], rank: 4 },
            samples,
            contrasts: [{ id: 'bcell-tvn', target: 'Tumor', reference: 'Normal', cellType: 'B cell' }],
          },
        })
      );

      expect(result.contrasts).toEqual([
        expect.objectContaining({
          completePairs: 3,
          targetReplicates: 3,
          referenceReplicates: 3,
          status: 'ready',
          warnings: [expect.stringContaining('Exactly three')],
        }),
      ]);
    });
  });

  it('returns a stable correction fingerprint for an invalid edgeR design', async () => {
    fs.writeFileSync(path.join(root, 'counts.tsv'), 'gene\tS1\nG1\t1\n', 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
    const payload = {
      replicateUnit: 'Sample',
      conditionColumn: 'Class',
      cellTypeColumn: 'Cell_type',
      formula: '~0+Class',
      executedFormula: '~Patient+Class',
      countMatrix: {
        path: 'counts.tsv',
        aggregationUnit: 'biological_replicate',
        integerCounts: false,
      },
      designMatrix: { columns: ['ClassNormal', 'ClassTumor'], rank: 1 },
      samples: [
        { id: 'N1', biologicalReplicate: 'N1', condition: 'Normal', cellType: 'B cell' },
        { id: 'T1', biologicalReplicate: 'T1', condition: 'Tumor', cellType: 'B cell' },
      ],
      contrasts: [{ id: 'bcell-tvn', target: 'Tumor', reference: 'Normal', cellType: 'B cell' }],
    };

    await withCapturedStatisticsTool(async (capturedTool) => {
      const first = parseToolJson(await capturedTool.handler({ action: 'validate_de_design', payload }));
      const repeated = parseToolJson(await capturedTool.handler({ action: 'validate_de_design', payload }));

      expect(first.status).toBe('needs_completion');
      expect(first.validationFingerprint).toBe(repeated.validationFingerprint);
      expect(first.nextActions).toHaveLength(1);
    });
  });

  it('rejects marker tables with non-finite effect sizes', async () => {
    fs.writeFileSync(
      path.join(root, 'markers.tsv'),
      'gene\tlogfoldchanges\tpvals_adj\tpct_in\tpct_out\nA\t\t0.01\t0.8\t0.1\nB\tNaN\t0.02\t0.7\t0.2\n',
      'utf8'
    );
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    await withCapturedStatisticsTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'validate_expression_contract',
          payload: {
            counts: { location: 'layers[counts]', semantics: 'raw_integer_counts', integerValues: true },
            logNormalized: { location: 'layers[lognorm]', transformation: 'normalize_total_then_log1p' },
            analysisMatrix: { location: 'X', semantics: 'log_normalized' },
            markerTable: {
              path: 'markers.tsv',
              sourceLayer: 'layers[lognorm]',
              method: 'wilcoxon',
              purpose: 'cluster_annotation',
              effectSizeColumn: 'logfoldchanges',
              adjustedPValueColumn: 'pvals_adj',
              detectionFractionColumns: ['pct_in', 'pct_out'],
            },
          },
        })
      );

      expect(result.status).toBe('needs_completion');
      expect(result.nextActions).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'validate_expression_contract' })])
      );
    });
  });

  it('produces a statistical completion receipt for valid edgeR quasi-likelihood outputs', async () => {
    const write = (candidate: string, content: string) => {
      const target = path.join(root, candidate);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    };
    write('counts.tsv', 'gene\tN1\tN2\tN3\tT1\tT2\tT3\nG1\t1\t2\t3\t4\t5\t6\n');
    for (const candidate of [
      'results/sample_inclusion.tsv',
      'results/design.tsv',
      'results/library_sizes.tsv',
      'results/norm_factors.tsv',
      'results/de.tsv',
      'logs/edger.log',
    ]) {
      write(candidate, 'id\tvalue\na\t1\n');
    }
    write('results/dispersion.json', '{"commonDispersion":0.1}\n');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    await withCapturedStatisticsTool(async (capturedTool) => {
      const design = parseToolJson(
        await capturedTool.handler({
          action: 'validate_de_design',
          payload: {
            replicateUnit: 'Sample',
            conditionColumn: 'Class',
            cellTypeColumn: 'Cell_type',
            formula: '~0+Class',
            executedFormula: '~0+Class',
            countMatrix: {
              path: 'counts.tsv',
              aggregationUnit: 'biological_replicate',
              integerCounts: true,
            },
            designMatrix: { columns: ['ClassNormal', 'ClassTumor'], rank: 2 },
            samples: [
              ...['N1', 'N2', 'N3'].map((id) => ({
                id,
                biologicalReplicate: id,
                condition: 'Normal',
                cellType: 'B cell',
              })),
              ...['T1', 'T2', 'T3'].map((id) => ({
                id,
                biologicalReplicate: id,
                condition: 'Tumor',
                cellType: 'B cell',
              })),
            ],
            contrasts: [{ id: 'bcell-tvn', target: 'Tumor', reference: 'Normal', cellType: 'B cell' }],
          },
        })
      );
      expect(design.receipt).toBeDefined();

      const result = parseToolJson(
        await capturedTool.handler({
          action: 'validate_de_outputs',
          payload: {
            planningReceiptId: 'planning-receipt',
            designReceipt: design.receipt,
            package: { name: 'edgeR', version: '4.0.0' },
            methods: {
              normalization: 'TMM',
              filterByExprWithDesign: true,
              dispersionEstimated: true,
              glmQLFitRobust: true,
              glmQLFTest: true,
              multipleTesting: 'BH_within_cell_type_contrast',
            },
            executedFormula: '~0+Class',
            contrasts: [
              {
                id: 'bcell-tvn',
                target: 'Tumor',
                reference: 'Normal',
                coefficient: 'ClassTumor-ClassNormal',
                status: 'tested',
                effectiveReplicates: { Tumor: 3, Normal: 3 },
                warnings: ['Exactly three replicates; interpret power cautiously.'],
              },
            ],
            files: {
              sampleInclusion: 'results/sample_inclusion.tsv',
              designMatrix: 'results/design.tsv',
              librarySizes: 'results/library_sizes.tsv',
              normalizationFactors: 'results/norm_factors.tsv',
              dispersionDiagnostics: 'results/dispersion.json',
              deTables: ['results/de.tsv'],
              executionLog: 'logs/edger.log',
            },
            skillUses: [
              {
                id: 'skill-de',
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
          },
        })
      );

      expect(result.status).toBe('ready');
      expect(result.completionReceipt).toEqual(
        expect.objectContaining({ package: 'edgeR', designReceiptId: design.receipt?.receiptId })
      );
    });
  });

  it('rejects the legacy GSE144735 execution payload and returns the v2 receipt-id shape', async () => {
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
    const planningReceipt = {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'planning-current',
      producer: 'bio_reproduction',
      action: 'validate_reproduction_plan',
      status: 'ready',
      projectRoot: root,
      createdAt: Date.now(),
      methodParameterReceiptId: 'method-parameters-current',
      skillUses: [],
    };
    const preparePayload = {
      objective:
        '仅使用 GSE144735，完成数据导入、质控、细胞类型分群（包括大类和小类）、差异基因、统计描述和必要结果图。',
      datasetIds: ['GSE144735'],
      planningReceipt,
    };

    await withCapturedReproductionTool(async (capturedTool) => {
      const first = parseToolJson(
        await capturedTool.handler({ action: 'prepare_execution_contract', payload: preparePayload })
      );
      expect(first.status).toBe('invalid_request');
      expect(first.nextActions?.[0]).toMatchObject({
        action: 'prepare_execution_contract',
        payload: expect.objectContaining({ contractVersion: 2 }),
      });
      if (first.status !== 'invalid_request') {
        expect(first.status).toBe('needs_completion');
        expect(first.requiredModules).toEqual(
          expect.arrayContaining([
            'data_import',
            'quality_control',
            'clustering',
            'major_annotation',
            'minor_annotation',
            'condition_de',
            'descriptive_statistics',
            'figures',
          ])
        );
        expect(first.requiredModules).not.toContain('disease_program');
        expect(first.nextActions?.[0]).toEqual(
          expect.objectContaining({
            action: 'write_file',
            payload: expect.objectContaining({
              onSuccess: expect.objectContaining({ action: 'prepare_execution_contract' }),
            }),
          })
        );

        const contractPath = path.join(root, 'case_reproduction', 'execution', 'execution_contract.json');
        fs.mkdirSync(path.dirname(contractPath), { recursive: true });
        fs.writeFileSync(
          contractPath,
          `${JSON.stringify(first.nextActions?.[0].payload?.canonicalContent, null, 2)}\n`
        );
        const prepared = parseToolJson(
          await capturedTool.handler({ action: 'prepare_execution_contract', payload: preparePayload })
        );
        expect(prepared.status).toBe('ready');
        expect(prepared.executionContractReceipt).toEqual(
          expect.objectContaining({ annotationMode: 'independent_annotation' })
        );

        const write = (candidate: string, content = 'id\tvalue\na\t1\n') => {
          const target = path.join(root, candidate);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, content, 'utf8');
        };
        const hash = (candidate: string) =>
          crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, candidate)))
            .digest('hex');
        const requiredModules = prepared.executionContractReceipt!.requiredModules;
        for (const moduleId of requiredModules) write(executionOutputPath(moduleId));
        write('execution/configs/executed_parameters.json', '{"parameters":[]}\n');
        write('execution/scripts/analysis.py', '# OpenBioScience-Parameters: none\n');
        write('results/de_status.tsv', 'contrast\tstatus\nmast\tblocked_insufficient_replicates\n');

        const methodAlignmentReceipt = {
          schema: 'openbioscience.bio.receipt.v1',
          receiptId: 'method-alignment-current',
          producer: 'bio_reproduction',
          action: 'validate_method_alignment',
          status: 'ready',
          projectRoot: root,
          createdAt: Date.now(),
          methodParameterReceiptId: planningReceipt.methodParameterReceiptId,
          executedParameterFile: {
            path: 'execution/configs/executed_parameters.json',
            contentHash: hash('execution/configs/executed_parameters.json'),
          },
          scriptFiles: [{ path: 'execution/scripts/analysis.py', contentHash: hash('execution/scripts/analysis.py') }],
        };
        const statisticalCompletionReceipt = {
          schema: 'openbioscience.bio.receipt.v1',
          receiptId: 'statistics-current',
          producer: 'bio_statistics',
          action: 'validate_de_outputs',
          status: 'ready',
          projectRoot: root,
          createdAt: Date.now(),
          workflowKind: 'omics_reproduction',
          workflowPhase: 'execution',
          planningReceiptId: planningReceipt.receiptId,
          contrasts: [
            {
              id: 'mast-tvn',
              status: 'blocked_insufficient_replicates',
              effectiveReplicates: { Tumor: 2, Normal: 0 },
            },
          ],
          canonicalFiles: [{ path: 'results/de_status.tsv', contentHash: hash('results/de_status.tsv') }],
          skillUses: [],
        };
        const moduleResults = requiredModules.map((moduleId) => {
          const result: Record<string, unknown> = {
            id: moduleId,
            status: moduleId === 'condition_de' ? 'scientifically_limited' : 'validated',
            outputPaths: [executionOutputPath(moduleId)],
            validationReceiptIds: moduleId === 'condition_de' ? [statisticalCompletionReceipt.receiptId] : [],
            limitations: moduleId === 'condition_de' ? ['Mast-cell contrast has insufficient complete pairs.'] : [],
          };
          if (moduleId === 'quality_control') result.qcOutcome = 'passed_no_removal';
          if (moduleId === 'major_annotation' || moduleId === 'minor_annotation') {
            result.annotationMode = 'independent_annotation';
          }
          return result;
        });
        const completionPayload = {
          executionContractReceipt: prepared.executionContractReceipt!,
          planningReceipt,
          methodAlignmentReceipt,
          statisticalCompletionReceipt,
          moduleResults,
        };
        const completed = parseToolJson(
          await capturedTool.handler({ action: 'complete_execution', payload: completionPayload })
        );
        expect(completed.status).toBe('ready');
        expect(completed.completionReceipt).toEqual(
          expect.objectContaining({
            executionCompletion: 'complete',
            scientificOutcome: 'validated_with_limits',
          })
        );

        const malformed = parseToolJson(
          await capturedTool.handler({
            action: 'complete_execution',
            payload: { ...completionPayload, executionContractReceipt: {} },
          })
        );
        expect(malformed.status).toBe('needs_completion');
        expect(malformed.nextActions).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: 'repair-complete-execution-call' })])
        );

        const invalidRequiredStatus = parseToolJson(
          await capturedTool.handler({
            action: 'complete_execution',
            payload: {
              ...completionPayload,
              moduleResults: moduleResults.map((result, index) =>
                index === 0 ? Object.assign({}, result, { status: 'not_requested' }) : result
              ),
            },
          })
        );
        expect(invalidRequiredStatus.status).toBe('needs_completion');
        expect(invalidRequiredStatus.completionReceipt?.executionCompletion).toBe('incomplete');

        const externallyBlocked = parseToolJson(
          await capturedTool.handler({
            action: 'complete_execution',
            payload: {
              ...completionPayload,
              statisticalCompletionReceipt: undefined,
              moduleResults: moduleResults.map((result) =>
                result.id === 'condition_de'
                  ? Object.assign({}, result, {
                      status: 'externally_blocked',
                      outputPaths: [],
                      validationReceiptIds: [],
                      limitations: ['Controlled condition metadata are unavailable.'],
                    })
                  : result
              ),
              externalBlockers: [
                {
                  id: 'controlled-condition-data',
                  kind: 'data',
                  message: 'Controlled condition metadata are unavailable.',
                  moduleId: 'condition_de',
                  external: true,
                },
              ],
            },
          })
        );
        expect(externallyBlocked.status).toBe('blocked');
        expect(externallyBlocked.nextActions).toEqual([]);
        expect(externallyBlocked.completionReceipt).toEqual(
          expect.objectContaining({ executionCompletion: 'incomplete', scientificOutcome: 'externally_blocked' })
        );

        const withoutStatistics = parseToolJson(
          await capturedTool.handler({
            action: 'complete_execution',
            payload: { ...completionPayload, statisticalCompletionReceipt: undefined },
          })
        );
        expect(withoutStatistics.status).toBe('needs_completion');
        expect(withoutStatistics.nextActions).toEqual(
          expect.arrayContaining([expect.objectContaining({ action: 'validate_de_outputs' })])
        );
      }
    });
  });

  it('prepares a v2 execution contract from stored receipt ids in one call', async () => {
    const map = JSON.parse(
      fs.readFileSync('tests/fixtures/reproduction/human-crc/expected-paper-reproduction-map.json', 'utf8')
    ) as Record<string, unknown>;
    const mapPath = path.join(root, 'case_reproduction/planning/paper_reproduction_map.json');
    fs.mkdirSync(path.dirname(mapPath), { recursive: true });
    fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
    const canonicalFile = {
      path: 'case_reproduction/planning/paper_reproduction_map.json',
      contentHash: crypto.createHash('sha256').update(fs.readFileSync(mapPath)).digest('hex'),
    };
    const targetIds = [
      ...(map.figures as Array<{ id: string }>).map((item) => item.id),
      ...(map.panels as Array<{ id: string }>).map((item) => item.id),
      ...(map.claims as Array<{ id: string }>).map((item) => item.id),
      ...(map.cohorts as Array<{ id: string }>).map((item) => item.id),
      ...(map.methodUnits as Array<{ id: string }>).map((item) => item.id),
      ...(map.dataDependencies as Array<{ id: string }>).map((item) => item.id),
      ...(map.expectedOutputs as Array<{ id: string }>).map((item) => item.id),
    ];
    const planningReceipt = {
      schema: 'openbioscience.bio.receipt.v1' as const,
      receiptId: 'bio_receipt_33333333333333333333',
      producer: 'bio_reproduction' as const,
      action: 'validate_reproduction_plan',
      status: 'ready',
      projectRoot: root,
      createdAt: Date.now(),
      methodParameterReceiptId: 'bio_receipt_44444444444444444444',
      skillUses: [],
    };
    const paperMapReceipt = {
      schema: 'openbioscience.bio.receipt.v1' as const,
      receiptId: 'bio_receipt_55555555555555555555',
      producer: 'bio_reproduction' as const,
      action: 'validate_paper_reproduction_map',
      status: 'ready',
      projectRoot: root,
      createdAt: Date.now(),
      canonicalFile,
      sourceReceiptIds: ['bio_receipt_66666666666666666666'],
      targetIds,
      unresolvedTargetIds: [],
      nextActions: [],
    };
    const decisions = map.scopeDecisions as Array<{ targetIds: string[]; status: string }>;
    const scopeReceipt = {
      schema: 'openbioscience.bio.receipt.v1' as const,
      receiptId: 'bio_receipt_77777777777777777777',
      producer: 'bio_reproduction' as const,
      action: 'validate_reproduction_scope',
      status: 'ready',
      projectRoot: root,
      createdAt: Date.now(),
      paperMapReceiptId: paperMapReceipt.receiptId,
      canonicalFile,
      requiredTargetIds: decisions
        .filter((item) => ['required', 'ready', 'conditional', 'analogous_only'].includes(item.status))
        .flatMap((item) => item.targetIds),
      excludedTargetIds: decisions
        .filter((item) => item.status === 'excluded_by_user')
        .flatMap((item) => item.targetIds),
      blockedTargetIds: decisions
        .filter((item) => ['external_data_block', 'capability_block', 'unresolved'].includes(item.status))
        .flatMap((item) => item.targetIds),
      nextActions: [],
    };
    [planningReceipt, paperMapReceipt, scopeReceipt].forEach((item) => writeReceipt(root, item));

    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'prepare_execution_contract',
          payload: {
            contractVersion: 2,
            objective: 'Prepare the scoped human CRC execution contract.',
            datasetIds: ['GSE132465', 'GSE144735'],
            planningReceiptId: planningReceipt.receiptId,
            paperMapReceiptId: paperMapReceipt.receiptId,
            scopeReceiptId: scopeReceipt.receiptId,
          },
        })
      );

      expect(result.status).toBe('ready');
      expect(result.executionContractReceipt).toEqual(
        expect.objectContaining({ contractVersion: 2, planningReceiptId: planningReceipt.receiptId })
      );
      expect(fs.existsSync(path.join(root, 'case_reproduction/execution/execution_contract.json'))).toBe(true);
    });
  });
});
