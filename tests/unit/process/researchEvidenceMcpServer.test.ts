import { afterEach, describe, expect, it, vi } from 'vitest';

type ToolTextResult = {
  content: Array<{ type: 'text'; text: string }>;
};

type CapturedTool = {
  name: string;
  handler: (input: {
    action: string;
    provider?: string;
    mode?: string;
    query?: string;
    source?: string;
    sources?: string[];
    maxResults?: number;
  }) => ToolTextResult | Promise<ToolTextResult>;
};

const ENV_KEYS = [
  'OPENSCIENCE_BIO_TOOLS_ENABLED',
  'OPENSCIENCE_BIO_TOOLS_DOMAINS',
  'PAPERCLIP_API_KEY',
  'PAPERCLIP_ENABLED',
] as const;

const previousEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

const parseToolJson = (result: ToolTextResult) => {
  const text = result.content.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('MCP tool did not return text content.');
  return JSON.parse(text) as {
    action: string;
    results?: Array<{
      source?: string;
      domain?: string;
      status?: string;
      evidenceDrafts?: Array<{ status?: string; database?: { domain?: string; warnings?: string[] } }>;
      nextActions?: Array<{ tool?: string; action?: string }>;
    }>;
  };
};

const withCapturedResearchEvidenceTool = async (callback: (capturedTool: CapturedTool) => Promise<void> | void) => {
  let capturedTool: CapturedTool | undefined;

  vi.resetModules();
  vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class {
      tool(name: string, _description: string, _schema: unknown, handler: CapturedTool['handler']): void {
        capturedTool = { name, handler };
      }

      async connect(): Promise<void> {}
    },
  }));
  vi.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: class {
      readonly kind = 'stdio';
    },
  }));
  vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: class {
      readonly kind = 'client';
    },
  }));
  vi.doMock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    StdioClientTransport: class {
      readonly kind = 'stdio-client';
    },
  }));

  try {
    await import('@/process/resources/builtinMcp/researchEvidenceServer');
    if (!capturedTool) throw new Error('research_evidence MCP tool was not registered.');
    expect(capturedTool.name).toBe('research_evidence');
    await callback(capturedTool);
  } finally {
    vi.doUnmock('@modelcontextprotocol/sdk/server/mcp.js');
    vi.doUnmock('@modelcontextprotocol/sdk/server/stdio.js');
    vi.doUnmock('@modelcontextprotocol/sdk/client/index.js');
    vi.doUnmock('@modelcontextprotocol/sdk/client/stdio.js');
    vi.resetModules();
  }
};

describe('research_evidence MCP cancer single-cell routing', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      const previous = previousEnv[key];
      if (previous == null) delete process.env[key];
      else process.env[key] = previous;
    }
  });

  it('returns a structured TISCH2 fallback when no native cancer-singlecell bio-tools route is available', async () => {
    for (const key of ENV_KEYS) previousEnv[key] = process.env[key];
    process.env.OPENSCIENCE_BIO_TOOLS_ENABLED = 'false';
    delete process.env.PAPERCLIP_API_KEY;
    process.env.PAPERCLIP_ENABLED = 'false';

    await withCapturedResearchEvidenceTool(async (capturedTool) => {
      const result = parseToolJson(
        await capturedTool.handler({
          action: 'search',
          provider: 'auto',
          mode: 'science',
          query: 'gastric cancer scRNA-seq',
          source: 'tisch2',
          maxResults: 5,
        })
      );

      expect(result.results?.[0]).toMatchObject({
        source: 'tisch2',
        domain: 'cancer-singlecell',
        status: 'needs_review',
      });
      expect(result.results?.[0]?.evidenceDrafts?.[0]).toMatchObject({
        status: 'needs_review',
        database: { domain: 'cancer-singlecell' },
      });
      expect(result.results?.[0]?.nextActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tool: 'bio_source', action: 'resolve_accession' }),
        ])
      );
    });
  });
});
