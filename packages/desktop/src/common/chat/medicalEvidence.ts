/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';

export const MEDICAL_EVIDENCE_MODE_ID = 'medical_evidence';
export const MEDICAL_EVIDENCE_EVENT_SCHEMA = 'deeporganiser.medical_evidence.event.v1';
export const MEDICAL_EVIDENCE_PANEL_SCHEMA = 'deeporganiser.medical_evidence.panel.v1';

export type MedicalEvidenceSource =
  | 'guideline'
  | 'systematic_review'
  | 'rct'
  | 'cohort'
  | 'case_control'
  | 'case_series'
  | 'regulatory'
  | 'drug_label'
  | 'trial_registry'
  | 'abstract'
  | 'other';

export type MedicalEvidenceConfidence = 'high' | 'moderate' | 'low' | 'very_low';

export interface MedicalEvidenceAnchor {
  sourceId: string;
  path?: string;
  url?: string;
  lineStart?: number;
  lineEnd?: number;
  quote?: string;
  section?: string;
}

export interface MedicalEvidenceItem {
  id: string;
  title: string;
  sourceType: MedicalEvidenceSource;
  confidence: MedicalEvidenceConfidence;
  grade?: string;
  year?: number;
  authors?: string;
  journal?: string;
  doi?: string;
  url?: string;
  anchor?: MedicalEvidenceAnchor;
  summary?: string;
  population?: string;
  applicability?: string;
  direction?: 'supports' | 'against' | 'mixed' | 'context';
}

export interface MedicalEvidenceConflict {
  id: string;
  claim: string;
  explanation: string;
  primaryEvidenceIds: string[];
  conflictingEvidenceIds: string[];
  resolution?: string;
}

export interface MedicalEvidenceFinding {
  id: string;
  title: string;
  conclusion: string;
  confidence: MedicalEvidenceConfidence;
  evidenceIds: string[];
  caveats?: string[];
}

export interface MedicalEvidencePanelData {
  schema: typeof MEDICAL_EVIDENCE_PANEL_SCHEMA;
  runId: string;
  question: string;
  generatedAt?: number;
  summary?: string;
  stats: {
    searches: number;
    recordsFound: number;
    screened: number;
    included: number;
    anchors: number;
    conflicts: number;
  };
  findings: MedicalEvidenceFinding[];
  evidence: MedicalEvidenceItem[];
  conflicts?: MedicalEvidenceConflict[];
  methods?: {
    queryPlan?: string[];
    sources?: string[];
    gradingFramework?: string;
    limitations?: string[];
  };
}

export type MedicalEvidenceEvent =
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'run_started';
      runId: string;
      question: string;
      sources?: string[];
      timestamp?: number;
    }
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'search_completed';
      runId: string;
      query: string;
      source: string;
      found: number;
      savedSearchId?: string;
      timestamp?: number;
    }
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'anchor_collected';
      runId: string;
      evidenceId?: string;
      sourceId: string;
      path?: string;
      anchors: MedicalEvidenceAnchor[];
      timestamp?: number;
    }
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'evidence_graded';
      runId: string;
      evidenceId: string;
      confidence: MedicalEvidenceConfidence;
      grade?: string;
      timestamp?: number;
    }
  | {
      schema: typeof MEDICAL_EVIDENCE_EVENT_SCHEMA;
      event: 'panel_submitted';
      runId: string;
      panel: MedicalEvidencePanelData;
      timestamp?: number;
    };

export type MedicalEvidencePayload = MedicalEvidenceEvent | MedicalEvidencePanelData;

export interface MedicalEvidenceConversationExtra {
  enabled: true;
  mode: typeof MEDICAL_EVIDENCE_MODE_ID;
  paperclip: {
    enabled: true;
    sources: string[];
    strictAnchors: boolean;
  };
}

export const buildMedicalEvidenceConversationExtra = (sources: string[], strictAnchors = true): MedicalEvidenceConversationExtra => ({
  enabled: true,
  mode: MEDICAL_EVIDENCE_MODE_ID,
  paperclip: {
    enabled: true,
    sources,
    strictAnchors,
  },
});

export const buildMedicalEvidenceModePrompt = (sources: string[], strictAnchors = true): string =>
  [
    '# Medical Evidence Mode',
    '',
    'You are running inside DeepOrganiser Medical Evidence Mode. Use the existing agent runtime as usual, but treat medical claims as evidence-bound work.',
    '',
    '## Mandatory Workflow',
    '1. Translate the user question into a PICO-style retrieval plan when possible: population, intervention/exposure, comparator, outcome, and patient-specific constraints.',
    '2. Use the deeporganiser-medical-evidence MCP tools before answering medical knowledge questions. Do not rely only on model memory.',
    `3. Search PaperClip sources first: ${sources.join(', ')}. Prefer guidelines, regulatory labels, systematic reviews, randomized trials, and recent high-quality evidence over weak or outdated sources.`,
    '4. Collect line-level anchors from PaperClip virtual files such as /papers/<id>/content.lines or /fda/<id>/content.lines for the statements you will cite.',
    '5. Grade evidence strength and applicability. Explicitly handle conflicts, recency, population mismatch, pediatric/adult mismatch, dosage/context limits, and disease-stage differences.',
    '6. Every clinically meaningful conclusion in the final answer must carry citation anchors like [E1] [E2]. Do not cite sources that were not actually retrieved.',
    '7. Before the final answer, call evidence_submit_panel with the full evidence panel. The final answer should be concise and should reuse the same evidence ids from the panel.',
    '',
    '## Evidence Panel Contract',
    '- Use stable ids E1, E2, ... for included evidence.',
    '- Include source type, confidence, grade, applicability, DOI/URL/path when available, and line anchors when available.',
    '- Include conflicts when evidence disagrees or applicability is limited.',
    `- Strict anchors: ${strictAnchors ? 'on. If a claim lacks a retrievable paragraph anchor, mark confidence lower and state the limitation.' : 'off, but still collect anchors whenever possible.'}`,
    '',
    '## Safety',
    'This mode supports clinical reasoning and literature review. It must not present itself as a substitute for a licensed clinician, and must recommend professional evaluation for diagnosis, treatment changes, emergencies, pregnancy, pediatrics, complex comorbidity, or medication safety decisions.',
  ].join('\n');

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const stripFence = (value: string): string => {
  const trimmed = value.trim();
  const opening = trimmed.match(/^```(?:json)?\s*/u);
  if (!opening) return trimmed;
  return trimmed.slice(opening[0].length).replace(/\s*```\s*$/u, '').trim();
};

const parsePayloadCandidate = (text: string): MedicalEvidencePayload | undefined => {
  const candidates = [stripFence(text)];
  const schemaIndex = text.indexOf('deeporganiser.medical_evidence.');
  if (schemaIndex >= 0) {
    const start = text.lastIndexOf('{', schemaIndex);
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      candidates.push(text.slice(start, end + 1));
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const record = toRecord(parsed);
      if (!record) continue;
      if (record.schema === MEDICAL_EVIDENCE_PANEL_SCHEMA) return parsed as MedicalEvidencePanelData;
      if (record.schema === MEDICAL_EVIDENCE_EVENT_SCHEMA) return parsed as MedicalEvidenceEvent;
    } catch {
      // Continue with other candidates.
    }
  }
  return undefined;
};

const getToolGroupOutput = (message: IMessageToolGroup): string[] =>
  Array.isArray(message.content)
    ? message.content
        .flatMap((tool) => {
          const result = tool.result_display;
          if (!result) return [];
          if (typeof result === 'string') return [result];
          if ('output' in result && typeof result.output === 'string') return [result.output];
          if ('result' in result && typeof result.result === 'string') return [result.result];
          if ('text' in result && typeof result.text === 'string') return [result.text];
          return [];
        })
        .filter(Boolean)
    : [];

const getAcpToolOutput = (message: IMessageAcpToolCall): string[] => {
  const update = message.content?.update;
  const textParts =
    update?.content
      ?.map((item) => (item.type === 'content' ? item.content?.text : undefined))
      .filter((item): item is string => Boolean(item)) ?? [];
  const rawOutput = update?.rawOutput || update?.raw_output;
  return [...textParts, ...(rawOutput ? [JSON.stringify(rawOutput)] : [])];
};

const getToolCallOutput = (message: IMessageToolCall): string[] =>
  [message.content.output, message.content.error].filter((item): item is string => Boolean(item));

export const extractMedicalEvidencePayloadsFromTools = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): MedicalEvidencePayload[] =>
  messages.flatMap((message) => {
    const outputs =
      message.type === 'tool_group'
        ? getToolGroupOutput(message)
        : message.type === 'acp_tool_call'
          ? getAcpToolOutput(message)
          : getToolCallOutput(message);
    return outputs.map(parsePayloadCandidate).filter((payload): payload is MedicalEvidencePayload => Boolean(payload));
  });

export const latestMedicalEvidencePanel = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): MedicalEvidencePanelData | undefined => {
  const panels = extractMedicalEvidencePayloadsFromTools(messages)
    .map((payload) => {
      if ((payload as MedicalEvidencePanelData).schema === MEDICAL_EVIDENCE_PANEL_SCHEMA) {
        return payload as MedicalEvidencePanelData;
      }
      if ((payload as MedicalEvidenceEvent).event === 'panel_submitted') {
        return (payload as Extract<MedicalEvidenceEvent, { event: 'panel_submitted' }>).panel;
      }
      return undefined;
    })
    .filter((panel): panel is MedicalEvidencePanelData => Boolean(panel));
  return panels.at(-1);
};

export const summarizeMedicalEvidenceEvents = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): MedicalEvidencePanelData['stats'] | undefined => {
  const payloads = extractMedicalEvidencePayloadsFromTools(messages);
  if (!payloads.length) return undefined;
  const panel = latestMedicalEvidencePanel(messages);
  if (panel) return panel.stats;

  const stats: MedicalEvidencePanelData['stats'] = {
    searches: 0,
    recordsFound: 0,
    screened: 0,
    included: 0,
    anchors: 0,
    conflicts: 0,
  };
  for (const payload of payloads) {
    if ((payload as MedicalEvidenceEvent).schema !== MEDICAL_EVIDENCE_EVENT_SCHEMA) continue;
    const event = payload as MedicalEvidenceEvent;
    if (event.event === 'search_completed') {
      stats.searches += 1;
      stats.recordsFound += event.found;
    }
    if (event.event === 'anchor_collected') {
      stats.anchors += event.anchors.length;
    }
    if (event.event === 'evidence_graded') {
      stats.included += 1;
    }
  }
  return stats;
};

