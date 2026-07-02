/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  MEDICAL_EVIDENCE_EVENT_SCHEMA,
  MEDICAL_EVIDENCE_PANEL_SCHEMA,
  type MedicalEvidenceConfidence,
  type MedicalEvidenceEvent,
  type MedicalEvidencePanelData,
  type MedicalEvidenceSource,
} from '@/common/chat/medicalEvidence';
import { MEDICAL_EVIDENCE_ENV_KEYS } from '@/common/config/medicalEvidenceMcpEnv';
import { BUILTIN_MEDICAL_EVIDENCE_NAME } from './constants';

const DEFAULT_BASE_URL = 'https://paperclip.gxl.ai';
const DEFAULT_TIMEOUT_MS = 30000;

const sourceSchema = z.enum(['pmc', 'abstracts', 'fda', 'trials', 'trials/us', 'clinicaltrials']);
const confidenceSchema = z.enum(['high', 'moderate', 'low', 'very_low']);
const sourceTypeSchema = z.enum([
  'guideline',
  'systematic_review',
  'rct',
  'cohort',
  'case_control',
  'case_series',
  'regulatory',
  'drug_label',
  'trial_registry',
  'abstract',
  'other',
]);

const anchorSchema = z.object({
  sourceId: z.string(),
  path: z.string().optional(),
  url: z.string().optional(),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional(),
  quote: z.string().optional(),
  section: z.string().optional(),
});

const evidenceItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceType: sourceTypeSchema,
  confidence: confidenceSchema,
  grade: z.string().optional(),
  year: z.number().optional(),
  authors: z.string().optional(),
  journal: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  anchor: anchorSchema.optional(),
  summary: z.string().optional(),
  population: z.string().optional(),
  applicability: z.string().optional(),
  direction: z.enum(['supports', 'against', 'mixed', 'context']).optional(),
});

const panelSchema = z.object({
  schema: z.literal(MEDICAL_EVIDENCE_PANEL_SCHEMA).optional(),
  runId: z.string(),
  question: z.string(),
  generatedAt: z.number().optional(),
  summary: z.string().optional(),
  stats: z.object({
    searches: z.number(),
    recordsFound: z.number(),
    screened: z.number(),
    included: z.number(),
    anchors: z.number(),
    conflicts: z.number(),
  }),
  findings: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      conclusion: z.string(),
      confidence: confidenceSchema,
      evidenceIds: z.array(z.string()),
      caveats: z.array(z.string()).optional(),
    })
  ),
  evidence: z.array(evidenceItemSchema),
  conflicts: z
    .array(
      z.object({
        id: z.string(),
        claim: z.string(),
        explanation: z.string(),
        primaryEvidenceIds: z.array(z.string()),
        conflictingEvidenceIds: z.array(z.string()),
        resolution: z.string().optional(),
      })
    )
    .optional(),
  methods: z
    .object({
      queryPlan: z.array(z.string()).optional(),
      sources: z.array(z.string()).optional(),
      gradingFramework: z.string().optional(),
      limitations: z.array(z.string()).optional(),
    })
    .optional(),
});

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

const normalizeSource = (source: string): string => (source === 'clinicaltrials' ? 'trials/us' : source);

const parseFoundCount = (output: string): number => {
  const match = output.match(/Found\s+(\d+)\s+results/i);
  if (match) return Number(match[1]) || 0;
  const numbered = output.match(/^\s*\d+\.\s+/gmu);
  return numbered?.length || 0;
};

const parseSavedSearchId = (output: string): string | undefined => {
  const match = output.match(/saved\s+as\s+(s_[A-Za-z0-9_-]+)/i) || output.match(/\b(s_[A-Za-z0-9_-]+)\b/u);
  return match?.[1];
};

const parseAnchors = (output: string, sourceId: string, path?: string) =>
  output
    .split(/\r?\n/u)
    .map((line) => {
      const match = line.match(/^L(\d+)(?:-L?(\d+))?\s+(.*)$/u);
      if (!match) return undefined;
      const lineStart = Number(match[1]);
      const lineEnd = Number(match[2] || match[1]);
      return {
        sourceId,
        path,
        lineStart,
        lineEnd,
        quote: match[3].trim(),
      };
    })
    .filter((item): item is { sourceId: string; path?: string; lineStart: number; lineEnd: number; quote: string } =>
      Boolean(item)
    );

const inferConfidence = (sourceType: MedicalEvidenceSource, year?: number): MedicalEvidenceConfidence => {
  const currentYear = new Date().getFullYear();
  const outdated = year ? currentYear - year > 10 : false;
  if (sourceType === 'guideline' || sourceType === 'systematic_review') return outdated ? 'moderate' : 'high';
  if (sourceType === 'rct' || sourceType === 'regulatory' || sourceType === 'drug_label') return outdated ? 'moderate' : 'high';
  if (sourceType === 'cohort' || sourceType === 'case_control') return outdated ? 'low' : 'moderate';
  if (sourceType === 'abstract' || sourceType === 'case_series') return 'low';
  return 'very_low';
};

const gradeLabel = (confidence: MedicalEvidenceConfidence, sourceType: MedicalEvidenceSource): string => {
  if (confidence === 'high') return sourceType === 'rct' ? 'High (RCT)' : 'High';
  if (confidence === 'moderate') return 'Moderate';
  if (confidence === 'low') return 'Low';
  return 'Very low';
};

class PaperclipGateway {
  private readonly apiKey = process.env[MEDICAL_EVIDENCE_ENV_KEYS.apiKey] || '';
  private readonly baseUrl = (process.env[MEDICAL_EVIDENCE_ENV_KEYS.baseUrl] || DEFAULT_BASE_URL).replace(/\/+$/u, '');
  private readonly timeoutMs = Number(process.env[MEDICAL_EVIDENCE_ENV_KEYS.timeoutMs] || DEFAULT_TIMEOUT_MS);

  async call(command: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('PaperClip API key is not configured. Open Settings > Medical Evidence and add a PaperClip API key.');
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
          id: `deeporganiser-medical-evidence-${Date.now()}`,
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
    name: BUILTIN_MEDICAL_EVIDENCE_NAME,
    version: '1.0.0',
  });

  server.tool(
    'evidence_start_run',
    'Start a medical evidence retrieval run. Use this before searching PaperClip.',
    {
      question: z.string().describe('Original user medical question.'),
      sources: z.array(sourceSchema).optional().describe('PaperClip sources planned for this run.'),
    },
    async ({ question, sources }) => {
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'run_started',
        runId: `me-${Date.now().toString(36)}`,
        question,
        sources,
        timestamp: Date.now(),
      };
      return jsonText(event);
    }
  );

  server.tool(
    'evidence_search',
    'Search PaperClip medical corpora. Emits a structured search_completed event plus raw PaperClip output.',
    {
      runId: z.string(),
      query: z.string(),
      source: sourceSchema.default('pmc'),
      limit: z.number().min(1).max(20).default(8),
    },
    async ({ runId, query, source, limit }) => {
      const normalizedSource = normalizeSource(source);
      const output = await paperclip.call(`search -s ${normalizedSource} ${JSON.stringify(query)} -n ${limit}`);
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'search_completed',
        runId,
        query,
        source: normalizedSource,
        found: parseFoundCount(output),
        savedSearchId: parseSavedSearchId(output),
        timestamp: Date.now(),
      };
      return jsonText({ ...event, rawOutput: output });
    }
  );

  server.tool(
    'evidence_collect_anchor',
    'Collect line-level anchors from PaperClip virtual files such as /papers/<id>/content.lines or /fda/<id>/content.lines.',
    {
      runId: z.string(),
      sourceId: z.string().describe('PaperClip paper/FDA/trial id, e.g. PMC8934917.'),
      path: z.string().describe('PaperClip virtual file path.'),
      lineRange: z.string().optional().describe('Line range such as 40-48. If omitted, the first 80 lines are returned.'),
    },
    async ({ runId, sourceId, path, lineRange }) => {
      const command = lineRange ? `cat ${JSON.stringify(path)} --lines ${lineRange}` : `head -80 ${JSON.stringify(path)}`;
      const output = await paperclip.call(command);
      const anchors = parseAnchors(output, sourceId, path);
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'anchor_collected',
        runId,
        sourceId,
        path,
        anchors,
        timestamp: Date.now(),
      };
      return jsonText({ ...event, rawOutput: output });
    }
  );

  server.tool(
    'evidence_grade',
    'Grade a retrieved evidence item using a conservative evidence hierarchy and applicability check.',
    {
      runId: z.string(),
      evidenceId: z.string(),
      sourceType: sourceTypeSchema,
      year: z.number().optional(),
      applicabilityConcern: z.boolean().optional(),
      reason: z.string().optional(),
    },
    async ({ runId, evidenceId, sourceType, year, applicabilityConcern, reason }) => {
      const inferred = inferConfidence(sourceType, year);
      const confidence: MedicalEvidenceConfidence =
        applicabilityConcern && inferred === 'high' ? 'moderate' : applicabilityConcern && inferred === 'moderate' ? 'low' : inferred;
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'evidence_graded',
        runId,
        evidenceId,
        confidence,
        grade: `${gradeLabel(confidence, sourceType)}${reason ? `; ${reason}` : ''}`,
        timestamp: Date.now(),
      };
      return jsonText(event);
    }
  );

  server.tool(
    'evidence_submit_panel',
    'Submit the final structured evidence panel before the final medical answer. The UI renders this panel under the answer.',
    {
      panel: panelSchema,
    },
    async ({ panel }) => {
      const normalizedPanel: MedicalEvidencePanelData = {
        ...panel,
        schema: MEDICAL_EVIDENCE_PANEL_SCHEMA,
        generatedAt: panel.generatedAt || Date.now(),
        stats: {
          ...panel.stats,
          included: panel.stats.included || panel.evidence.length,
          anchors: panel.stats.anchors || panel.evidence.filter((item) => item.anchor).length,
          conflicts: panel.stats.conflicts || panel.conflicts?.length || 0,
        },
      };
      const event: MedicalEvidenceEvent = {
        schema: MEDICAL_EVIDENCE_EVENT_SCHEMA,
        event: 'panel_submitted',
        runId: normalizedPanel.runId,
        panel: normalizedPanel,
        timestamp: Date.now(),
      };
      return jsonText(event);
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[MedicalEvidenceMCP] Fatal error:', error);
  process.exit(1);
});

