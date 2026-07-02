/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { RESEARCH_EVIDENCE_ENV_KEYS } from '@/common/config/researchEvidenceMcpEnv';
import { BUILTIN_RESEARCH_EVIDENCE_NAME } from './constants';

const DEFAULT_BASE_URL = 'https://paperclip.gxl.ai';
const DEFAULT_TIMEOUT_MS = 30000;
const RESULT_SCHEMA = 'deeporganiser.research_evidence.result.v2';

type ProviderName = 'paperclip' | 'bio_tools';

type PaperclipMcpResponse = {
  result?: {
    content?: Array<{ type?: string; text?: string }>;
  };
  error?: {
    message?: string;
  };
};

type BioTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type BioToolCallResult = {
  content?: Array<{ type?: string; text?: string; data?: string; mimeType?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
};

type EvidenceDraft = {
  title: string;
  sourceType: 'paper' | 'database_record' | 'dataset';
  claimType: 'parsed';
  confidence: 'moderate';
  status: 'available' | 'needs_review';
  summary?: string;
  url?: string;
  database: {
    name: string;
    provider: ProviderName;
    domain?: string;
    tool?: string;
    endpoint?: string;
    params?: Record<string, unknown>;
    accessDate: string;
    returnedCount?: number;
    retrievedCount?: number;
    warnings?: string[];
  };
};

type BioSearchRoute = {
  tool: string;
  databaseName: string;
  domain: string;
  sourceType: EvidenceDraft['sourceType'];
  buildArguments: (query: string, maxResults: number) => Record<string, unknown>;
};

const jsonText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const previewOutput = (output: string, maxLength = 1600): string => {
  const trimmed = output.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}\n...`;
};

const parseFoundCount = (output: string): number => {
  const match = output.match(/Found\s+(\d+)\s+(?:results|papers|records|items)/iu);
  if (match) return Number(match[1]) || 0;
  const numbered = output.match(/^\s*\d+\.\s+/gmu);
  return numbered?.length || 0;
};

const parseSavedSearchId = (output: string): string | undefined => {
  const match = output.match(/saved\s+as\s+(s_[A-Za-z0-9_-]+)/i) || output.match(/\b(s_[A-Za-z0-9_-]+)\b/u);
  return match?.[1];
};

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const normalizeSource = (source: string): string => (source === 'clinicaltrials' ? 'trials/us' : source);

const normalizeBioSource = (source?: string): string =>
  (source || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, '_')
    .replace(/-/gu, '_');

const firstString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
};

const countFromStructured = (value: unknown): { returnedCount?: number; retrievedCount?: number } => {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const returned =
    Number(record.total_count) ||
    Number(record.total) ||
    Number(record.count) ||
    Number(record.totalCount) ||
    Number(record.returnedCount) ||
    undefined;
  const collections = ['records', 'results', 'articles', 'molecules', 'targets', 'studies', 'models'];
  for (const key of collections) {
    const item = record[key];
    if (Array.isArray(item)) {
      return { returnedCount: returned, retrievedCount: item.length };
    }
  }
  return { returnedCount: returned };
};

const titleFromStructured = (tool: string, source: string | undefined, query: string | undefined, value: unknown): string => {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const records = record.records || record.results || record.articles || record.molecules || record.targets;
    if (Array.isArray(records) && records.length) {
      const first = records[0] as Record<string, unknown>;
      return (
        firstString(first.title) ||
        firstString(first.name) ||
        firstString(first.pref_name) ||
        firstString(first.accession) ||
        firstString(first.id) ||
        `${tool}: ${query || source || 'result'}`
      );
    }
  }
  return `${tool}: ${query || source || 'result'}`;
};

const stripSchemas = (tool: BioTool, domain?: string) => ({
  name: tool.name,
  description: tool.description,
  domain,
});

const inheritedEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  return env;
};

const bioToolSearchRoutes: Record<string, BioSearchRoute> = {
  pubmed: {
    tool: 'search_articles',
    databaseName: 'PubMed',
    domain: 'pubmed',
    sourceType: 'paper',
    buildArguments: (query, maxResults) => ({ query, max_results: maxResults }),
  },
  ncbi_pubmed: {
    tool: 'search_articles',
    databaseName: 'PubMed',
    domain: 'pubmed',
    sourceType: 'paper',
    buildArguments: (query, maxResults) => ({ query, max_results: maxResults }),
  },
  chembl: {
    tool: 'compound_search',
    databaseName: 'ChEMBL',
    domain: 'chembl',
    sourceType: 'database_record',
    buildArguments: (query, maxResults) => ({ name: query, limit: maxResults }),
  },
  chembl_compound: {
    tool: 'compound_search',
    databaseName: 'ChEMBL',
    domain: 'chembl',
    sourceType: 'database_record',
    buildArguments: (query, maxResults) => ({ name: query, limit: maxResults }),
  },
  chembl_target: {
    tool: 'target_search',
    databaseName: 'ChEMBL Target',
    domain: 'chembl',
    sourceType: 'database_record',
    buildArguments: (query, maxResults) => ({ gene_symbol: query, limit: maxResults }),
  },
  geo: {
    tool: 'geo_search_series',
    databaseName: 'NCBI GEO',
    domain: 'omics-archives',
    sourceType: 'dataset',
    buildArguments: (query, maxResults) => ({ term: query, retmax: maxResults }),
  },
  ncbi_geo: {
    tool: 'geo_search_series',
    databaseName: 'NCBI GEO',
    domain: 'omics-archives',
    sourceType: 'dataset',
    buildArguments: (query, maxResults) => ({ term: query, retmax: maxResults }),
  },
  alphafold: {
    tool: 'alphafold_get_prediction',
    databaseName: 'AlphaFold DB',
    domain: 'structures-interactions',
    sourceType: 'database_record',
    buildArguments: (query) => ({ uniprot_accession: query }),
  },
  alphafold_db: {
    tool: 'alphafold_get_prediction',
    databaseName: 'AlphaFold DB',
    domain: 'structures-interactions',
    sourceType: 'database_record',
    buildArguments: (query) => ({ uniprot_accession: query }),
  },
};

class PaperclipGateway {
  private readonly apiKey = process.env[RESEARCH_EVIDENCE_ENV_KEYS.apiKey] || '';
  private readonly baseUrl = (process.env[RESEARCH_EVIDENCE_ENV_KEYS.baseUrl] || DEFAULT_BASE_URL).replace(/\/+$/u, '');
  private readonly timeoutMs = Number(process.env[RESEARCH_EVIDENCE_ENV_KEYS.timeoutMs] || DEFAULT_TIMEOUT_MS);
  readonly enabled =
    process.env[RESEARCH_EVIDENCE_ENV_KEYS.paperclipEnabled] !== 'false' && Boolean(this.apiKey.trim());

  status() {
    return {
      provider: 'paperclip' as const,
      enabled: this.enabled,
      configured: Boolean(this.apiKey.trim()),
      baseUrl: this.baseUrl,
    };
  }

  async call(command: string): Promise<string> {
    if (!this.enabled) {
      throw new Error('PaperClip is not configured. Add a PaperClip API key in Science settings to enable it.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number.isFinite(this.timeoutMs) ? this.timeoutMs : DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `openscience-research-evidence-${Date.now()}`,
          method: 'tools/call',
          params: {
            name: 'paperclip',
            arguments: { command },
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`PaperClip request failed (${response.status})`);
      }
      const payload = (await response.json()) as PaperclipMcpResponse;
      if (payload.error?.message) {
        throw new Error(payload.error.message);
      }
      return (payload.result?.content || [])
        .map((item) => (item.type === 'text' ? item.text || '' : ''))
        .filter(Boolean)
        .join('\n');
    } finally {
      clearTimeout(timer);
    }
  }
}

class BioToolsGateway {
  private client?: Client;
  private transport?: StdioClientTransport;
  private domains?: Record<string, string[]>;
  readonly enabled = process.env[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsEnabled] === 'true';
  readonly pythonPath = process.env[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsPythonPath] || 'python3';
  readonly defaultDomains = (process.env[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsDefaultDomains] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  readonly serverRoot = this.resolveServerRoot();

  status() {
    const configured = Boolean(this.serverRoot && existsSync(path.join(this.serverRoot, 'run_server.py')));
    return {
      provider: 'bio_tools' as const,
      enabled: this.enabled,
      configured,
      pythonPath: this.pythonPath,
      serverRoot: this.serverRoot,
      defaultDomains: this.defaultDomains,
      connected: Boolean(this.client),
    };
  }

  async listTools(domain?: string, includeSchemas = false): Promise<Array<Record<string, unknown>>> {
    const client = await this.ensureClient();
    const tools = (await client.listTools()).tools as BioTool[];
    const domains = this.readDomains();
    const toolToDomain = new Map<string, string>();
    for (const [domainName, toolNames] of Object.entries(domains)) {
      for (const toolName of toolNames) toolToDomain.set(toolName, domainName);
    }
    return tools
      .filter((tool) => !domain || toolToDomain.get(tool.name) === domain)
      .map((tool) => (includeSchemas ? { ...tool, domain: toolToDomain.get(tool.name) } : stripSchemas(tool, toolToDomain.get(tool.name))));
  }

  async callTool(tool: string, args: Record<string, unknown>): Promise<BioToolCallResult> {
    const client = await this.ensureClient();
    return (await client.callTool({ name: tool, arguments: args })) as BioToolCallResult;
  }

  toolDomain(tool: string): string | undefined {
    const domains = this.readDomains();
    for (const [domainName, tools] of Object.entries(domains)) {
      if (tools.includes(tool)) return domainName;
    }
    return undefined;
  }

  private resolveServerRoot(): string | undefined {
    const resourcesPath = (process as typeof process & { resourcesPath?: string }).resourcesPath;
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      process.env[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsServerRoot],
      path.resolve(process.cwd(), 'resources/skills/vendor/science-skills/mcp-servers/bio-tools'),
      path.resolve(process.cwd(), 'resources/skills/vendor/JimLiu-science-skills/mcp-servers/bio-tools'),
      resourcesPath ? path.resolve(resourcesPath, 'skills/vendor/science-skills/mcp-servers/bio-tools') : undefined,
      path.resolve(currentDir, '../../resources/skills/vendor/science-skills/mcp-servers/bio-tools'),
      '/tmp/jimli-science-skills/mcp-servers/bio-tools',
    ].filter(Boolean) as string[];
    return candidates.find((candidate) => existsSync(path.join(candidate, 'run_server.py')));
  }

  private readDomains(): Record<string, string[]> {
    if (this.domains) return this.domains;
    const domainPath = this.serverRoot ? path.join(this.serverRoot, 'lib/mcp_bio/domains.json') : '';
    if (!domainPath || !existsSync(domainPath)) {
      this.domains = {};
      return this.domains;
    }
    try {
      this.domains = JSON.parse(readFileSync(domainPath, 'utf8')) as Record<string, string[]>;
    } catch {
      this.domains = {};
    }
    return this.domains;
  }

  private async ensureClient(): Promise<Client> {
    if (!this.enabled) {
      throw new Error('bio-tools provider is disabled. Enable it in Science settings before using provider="bio_tools".');
    }
    if (!this.serverRoot) {
      throw new Error('bio-tools server root was not found. Set the bio-tools server root in Science settings.');
    }
    if (this.client) return this.client;

    const libPath = path.join(this.serverRoot, 'lib');
    const env = inheritedEnv();
    env.PYTHONUNBUFFERED = '1';
    env.PYTHONPATH = env.PYTHONPATH ? `${libPath}${path.delimiter}${env.PYTHONPATH}` : libPath;
    const transport = new StdioClientTransport({
      command: this.pythonPath,
      args: [path.join(this.serverRoot, 'run_server.py'), 'mcp_bio'],
      cwd: this.serverRoot,
      env,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'openscience-research-evidence-bio-tools', version: '1.0.0' });
    const stderrChunks: string[] = [];
    transport.stderr?.on('data', (chunk) => {
      stderrChunks.push(String(chunk));
      if (stderrChunks.join('').length > 8000) stderrChunks.splice(0, stderrChunks.length - 4);
    });
    try {
      await client.connect(transport);
    } catch (error) {
      const stderr = previewOutput(stderrChunks.join('\n'), 1200);
      await transport.close().catch((): undefined => undefined);
      throw new Error(
        [
          'bio-tools MCP could not start.',
          `Python: ${this.pythonPath}`,
          `Server root: ${this.serverRoot}`,
          stderr ? `stderr: ${stderr}` : error instanceof Error ? `error: ${error.message}` : undefined,
          'Configure a Python environment with the JimLiu science-skills bio-tools dependencies installed.',
        ]
          .filter(Boolean)
          .join('\n')
      );
    }
    this.transport = transport;
    this.client = client;
    return client;
  }
}

const resultText = (result: BioToolCallResult): string => {
  const text = (result.content || [])
    .map((item) => (item.type === 'text' ? item.text || '' : ''))
    .filter(Boolean)
    .join('\n');
  if (text.trim()) return text;
  if (result.structuredContent != null) return JSON.stringify(result.structuredContent);
  return JSON.stringify(result);
};

const buildBioEvidenceDraft = ({
  route,
  tool,
  args,
  query,
  output,
  structured,
}: {
  route?: BioSearchRoute;
  tool: string;
  args: Record<string, unknown>;
  query?: string;
  output: string;
  structured?: unknown;
}): EvidenceDraft => {
  const parsed = structured ?? safeJsonParse(output);
  const counts = countFromStructured(parsed);
  const domain = route?.domain;
  return {
    title: titleFromStructured(tool, domain, query, parsed),
    sourceType: route?.sourceType || 'database_record',
    claimType: 'parsed',
    confidence: 'moderate',
    status: 'available',
    summary: previewOutput(output, 360),
    database: {
      name: route?.databaseName || 'bio-tools',
      provider: 'bio_tools',
      domain,
      tool,
      params: args,
      accessDate: new Date().toISOString(),
      ...counts,
    },
  };
};

async function main() {
  const paperclip = new PaperclipGateway();
  const bioTools = new BioToolsGateway();
  const server = new McpServer({
    name: BUILTIN_RESEARCH_EVIDENCE_NAME,
    version: '1.1.0',
  });

  server.tool(
    'research_evidence',
    'Unified research evidence control-plane tool for PaperClip literature/files and bio-tools scientific databases. Search/read/call results should be registered as Science evidence via science_artifact when used in claims.',
    {
      action: z.enum(['status', 'list_tools', 'search', 'read', 'call']),
      provider: z.enum(['auto', 'paperclip', 'bio_tools']).default('auto'),
      mode: z.enum(['medical', 'science', 'general']).default('science'),
      query: z.string().optional(),
      source: z.string().optional().describe('PaperClip source or bio-tools source alias, e.g. pmc, pubmed, chembl, geo, alphafold.'),
      sources: z.array(z.string()).optional(),
      maxResults: z.number().min(1).max(50).default(8),
      sourceId: z.string().optional(),
      url: z.string().optional(),
      virtualPath: z.string().optional(),
      command: z.string().optional(),
      tool: z.string().optional().describe('bio-tools MCP tool name for action="call", e.g. search_articles, compound_search.'),
      arguments: z.record(z.unknown()).optional(),
      domain: z.string().optional().describe('Optional bio-tools domain filter for action="list_tools".'),
      includeSchemas: z.boolean().default(false),
      anchor: z
        .object({
          lineStart: z.number().optional(),
          lineEnd: z.number().optional(),
          page: z.number().optional(),
        })
        .optional(),
    },
    async ({
      action,
      provider,
      mode,
      query,
      source,
      sources,
      maxResults,
      sourceId,
      url,
      virtualPath,
      command,
      tool,
      arguments: toolArguments,
      domain,
      includeSchemas,
      anchor,
    }) => {
      if (action === 'status') {
        return jsonText({
          schema: RESULT_SCHEMA,
          action,
          mode,
          providers: {
            paperclip: paperclip.status(),
            bio_tools: bioTools.status(),
          },
          timestamp: Date.now(),
        });
      }

      if (action === 'list_tools') {
        const resolvedProvider: ProviderName = provider === 'paperclip' ? 'paperclip' : 'bio_tools';
        if (resolvedProvider === 'paperclip') {
          return jsonText({
            schema: RESULT_SCHEMA,
            action,
            provider: 'paperclip',
            tools: [{ name: 'paperclip', description: 'PaperClip command bridge: search, cat, and source-specific commands.' }],
            timestamp: Date.now(),
          });
        }
        const tools = await bioTools.listTools(domain, includeSchemas);
        return jsonText({
          schema: RESULT_SCHEMA,
          action,
          provider: 'bio_tools',
          domain,
          count: tools.length,
          tools,
          timestamp: Date.now(),
        });
      }

      if (action === 'call') {
        if (provider === 'paperclip') {
          const resolvedCommand = command || String(toolArguments?.command || '');
          if (!resolvedCommand) throw new Error('research_evidence call with provider="paperclip" requires command.');
          const output = await paperclip.call(resolvedCommand);
          return jsonText({
            schema: RESULT_SCHEMA,
            action,
            provider: 'paperclip',
            mode,
            command: resolvedCommand,
            rawPreview: previewOutput(output),
            rawOutput: output,
            timestamp: Date.now(),
          });
        }
        if (!tool) throw new Error('research_evidence call with provider="bio_tools" requires tool.');
        const args = toolArguments || {};
        const result = await bioTools.callTool(tool, args);
        const output = resultText(result);
        const route: BioSearchRoute | undefined = {
          tool,
          databaseName: bioTools.toolDomain(tool) || 'bio-tools',
          domain: bioTools.toolDomain(tool) || 'bio-tools',
          sourceType: tool.includes('search_articles') ? 'paper' : 'database_record',
          buildArguments: () => args,
        };
        return jsonText({
          schema: RESULT_SCHEMA,
          action,
          provider: 'bio_tools',
          mode,
          tool,
          arguments: args,
          domain: bioTools.toolDomain(tool),
          rawPreview: previewOutput(output),
          rawOutput: output,
          structuredContent: result.structuredContent,
          evidenceDrafts: [buildBioEvidenceDraft({ route, tool, args, output, structured: result.structuredContent })],
          timestamp: Date.now(),
        });
      }

      if (action === 'search') {
        if (!query?.trim()) throw new Error('research_evidence search requires query.');
        const requestedSources = sources?.length ? sources : [source || 'pmc'];
        const results = [];
        for (const item of requestedSources) {
          const bioRoute = bioToolSearchRoutes[normalizeBioSource(item)];
          const shouldUseBioTools =
            provider === 'bio_tools' || (provider === 'auto' && bioRoute && !paperclip.enabled) || (provider === 'auto' && bioRoute && !['pmc', 'abstracts', 'abstracts_only', 'arxiv', 'biorxiv', 'medrxiv'].includes(normalizeBioSource(item)));
          if (shouldUseBioTools) {
            if (!bioRoute) {
              throw new Error(`No bio-tools search route is defined for source "${item}". Use action="list_tools" then action="call".`);
            }
            const args = bioRoute.buildArguments(query, maxResults);
            const result = await bioTools.callTool(bioRoute.tool, args);
            const output = resultText(result);
            const parsed = result.structuredContent ?? safeJsonParse(output);
            const counts = countFromStructured(parsed);
            results.push({
              provider: 'bio_tools',
              source: normalizeBioSource(item),
              tool: bioRoute.tool,
              domain: bioRoute.domain,
              found: counts.returnedCount || counts.retrievedCount || 0,
              rawPreview: previewOutput(output),
              rawOutput: output,
              structuredContent: result.structuredContent,
              evidenceDrafts: [
                buildBioEvidenceDraft({ route: bioRoute, tool: bioRoute.tool, args, query, output, structured: parsed }),
              ],
            });
            continue;
          }

          const normalizedSource = normalizeSource(item);
          const output = await paperclip.call(`search -s ${normalizedSource} ${JSON.stringify(query)} -n ${maxResults}`);
          results.push({
            provider: 'paperclip',
            source: normalizedSource,
            found: parseFoundCount(output),
            savedSearchId: parseSavedSearchId(output),
            rawPreview: previewOutput(output),
            rawOutput: output,
          });
        }
        return jsonText({
          schema: RESULT_SCHEMA,
          action,
          provider,
          mode,
          query,
          results,
          timestamp: Date.now(),
        });
      }

      const resolvedCommand =
        command ||
        (virtualPath
          ? anchor?.lineStart
            ? `cat ${JSON.stringify(virtualPath)} --lines ${anchor.lineStart}-${anchor.lineEnd || anchor.lineStart}`
            : `cat ${JSON.stringify(virtualPath)}`
          : undefined);
      if (!resolvedCommand) {
        throw new Error('research_evidence read requires command or virtualPath.');
      }
      const output = await paperclip.call(resolvedCommand);
      return jsonText({
        schema: RESULT_SCHEMA,
        action,
        provider: 'paperclip',
        mode,
        sourceId,
        url,
        virtualPath,
        command: resolvedCommand,
        anchor,
        rawPreview: previewOutput(output),
        rawOutput: output,
        timestamp: Date.now(),
      });
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[ResearchEvidenceMCP] Fatal error:', error);
  process.exit(1);
});
