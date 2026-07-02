/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { RESEARCH_EVIDENCE_ENV_KEYS } from '@/common/config/researchEvidenceMcpEnv';
import { BUILTIN_RESEARCH_EVIDENCE_NAME } from './constants';

const DEFAULT_BASE_URL = 'https://paperclip.gxl.ai';
const DEFAULT_TIMEOUT_MS = 30000;

type PaperclipMcpResponse = {
  result?: {
    content?: Array<{ type?: string; text?: string }>;
  };
  error?: {
    message?: string;
  };
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

const normalizeSource = (source: string): string => (source === 'clinicaltrials' ? 'trials/us' : source);

class PaperclipGateway {
  private readonly apiKey = process.env[RESEARCH_EVIDENCE_ENV_KEYS.apiKey] || '';
  private readonly baseUrl = (process.env[RESEARCH_EVIDENCE_ENV_KEYS.baseUrl] || DEFAULT_BASE_URL).replace(/\/+$/u, '');
  private readonly timeoutMs = Number(process.env[RESEARCH_EVIDENCE_ENV_KEYS.timeoutMs] || DEFAULT_TIMEOUT_MS);

  async call(command: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('PaperClip API key is not configured. Open Settings and add a PaperClip API key.');
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

async function main() {
  const paperclip = new PaperclipGateway();
  const server = new McpServer({
    name: BUILTIN_RESEARCH_EVIDENCE_NAME,
    version: '1.0.0',
  });

  server.tool(
    'research_evidence',
    'Shared research evidence search/read tool for Medical Evidence Mode and Science Mode. It does not mutate the Science artifact graph.',
    {
      action: z.enum(['search', 'read']),
      mode: z.enum(['medical', 'science', 'general']).default('science'),
      query: z.string().optional(),
      source: z.string().optional().describe('PaperClip source, e.g. pmc, abstracts, biorxiv, arxiv, fda, trials/us.'),
      sources: z.array(z.string()).optional(),
      maxResults: z.number().min(1).max(50).default(8),
      sourceId: z.string().optional(),
      url: z.string().optional(),
      virtualPath: z.string().optional(),
      command: z.string().optional(),
      anchor: z
        .object({
          lineStart: z.number().optional(),
          lineEnd: z.number().optional(),
          page: z.number().optional(),
        })
        .optional(),
    },
    async ({ action, mode, query, source, sources, maxResults, sourceId, url, virtualPath, command, anchor }) => {
      if (action === 'search') {
        if (!query?.trim()) throw new Error('research_evidence search requires query.');
        const requestedSources = sources?.length ? sources : [source || 'pmc'];
        const results = [];
        for (const item of requestedSources) {
          const normalizedSource = normalizeSource(item);
          const output = await paperclip.call(`search -s ${normalizedSource} ${JSON.stringify(query)} -n ${maxResults}`);
          results.push({
            source: normalizedSource,
            found: parseFoundCount(output),
            savedSearchId: parseSavedSearchId(output),
            rawPreview: previewOutput(output),
            rawOutput: output,
          });
        }
        return jsonText({
          schema: 'deeporganiser.research_evidence.result.v1',
          action,
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
        schema: 'deeporganiser.research_evidence.result.v1',
        action,
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
