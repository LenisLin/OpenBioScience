import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  publicHttpUrlStatus,
  redactCredentialText,
  safeAbsolutePathStatus,
  safeChildPathStatus,
  safeOutputDirectoryStatus,
} from '@/process/resources/builtinMcp/bio/pathSafety';

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
  };
};

const withCapturedReproductionTool = async (callback: (capturedTool: CapturedTool) => Promise<void> | void) => {
  process.env.OPENBIOSCIENCE_BIO_MCP_PROFILE = 'reproduction';

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
    StdioServerTransport: class {},
  }));

  try {
    await import('@/process/resources/builtinMcp/bioServer');

    expect(serverConfig?.name).toBe('openscience-bio-reproduction');
    expect(capturedTool?.name).toBe('bio_reproduction');
    if (!capturedTool) throw new Error('bio reproduction MCP tool was not registered.');

    await callback(capturedTool);
  } finally {
    vi.doUnmock('@modelcontextprotocol/sdk/server/mcp.js');
    vi.doUnmock('@modelcontextprotocol/sdk/server/stdio.js');
    vi.resetModules();
  }
};

describe('OpenBioScience bio MCP server path checks', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-bio-mcp-'));
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const previous = previousEnv[key];
      if (previous == null) delete process.env[key];
      else process.env[key] = previous;
    }
    if (root) fs.rmSync(root, { recursive: true, force: true });
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
    });
  });

  it('does not allow script-stage entry for incomplete execution modules', async () => {
    const planPath = path.join(root, 'planning', 'reproduction_plan.md');
    const auditPath = path.join(root, 'planning', 'source_audit.json');
    const localizedPath = path.join(root, 'planning', 'localized', 'paper.pdf');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.mkdirSync(path.dirname(localizedPath), { recursive: true });
    fs.writeFileSync(planPath, '# plan\n', 'utf8');
    fs.writeFileSync(auditPath, '{}\n', 'utf8');
    fs.writeFileSync(localizedPath, 'pdf\n', 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    await withCapturedReproductionTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'validate_reproduction_plan',
          payload: {
            planPath,
            sourceAuditPath: auditPath,
            localizedPaths: [localizedPath],
            modules: [{ id: 'm01', objective: 'Import data' }],
          },
        })
      );

      expect(result.status).toBe('blocked_for_execution');
      expect(result.scriptBoundary?.mayEnterScriptStage).toBe(false);
      expect(result.moduleReadiness?.[0]).toMatchObject({
        status: 'blocked_for_execution',
        blockingReasons: expect.arrayContaining([
          'environmentRef is required.',
          'skillRoute is required.',
          'mcpRoute is required.',
          'expectedOutputs is required.',
          'sourceStatus is required.',
        ]),
      });
    });
  });

  it('allows script-stage entry only when planning files, source readiness, and module routes are complete', async () => {
    const planPath = path.join(root, 'planning', 'reproduction_plan.md');
    const auditPath = path.join(root, 'planning', 'source_audit.json');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, '# plan\n', 'utf8');
    fs.writeFileSync(auditPath, '{}\n', 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

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
                status: 'conditional_continue',
                sourceStatus: 'ready',
                environmentRef: 'sc-r-singlecell',
                skillRoute: ['bio-scrna-reproduction'],
                mcpRoute: ['bio_runtime'],
                expectedOutputs: ['execution/logs/review.md'],
              },
            ],
          },
        })
      );

      expect(result.status).toBe('ready');
      expect(result.scriptBoundary?.mayEnterScriptStage).toBe(true);
      expect(result.moduleReadiness?.[0]).toMatchObject({ status: 'ready', blockingReasons: [] });
    });
  });
});
