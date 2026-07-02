/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  SCIENCE_EVENT_SCHEMA,
  SCIENCE_PANEL_SCHEMA,
  type ScienceArtifact,
  type ScienceArtifactAction,
  type ScienceArtifactEvent,
  type ScienceArtifactGitRef,
  type ScienceArtifactPage,
  type ScienceArtifactResourceKind,
  type ScienceArtifactSnapshotIncludePath,
  type ScienceClaim,
  type ScienceEvidenceItem,
  type ScienceGraphWarning,
  type SciencePanelData,
  type ScienceProvenanceEdge,
  type ScienceProvenanceNode,
  type ScienceReportBlock,
  type ScienceSkillUse,
} from '@/common/chat/science';
import { SCIENCE_ARTIFACT_ENV_KEYS } from '@/common/config/scienceArtifactMcpEnv';
import {
  commitScienceArtifactSnapshot,
  ensureScienceProject,
  listScienceArtifactHistory,
} from '@/process/services/scienceArtifactGitStore';
import { BUILTIN_SCIENCE_ARTIFACT_NAME } from './constants';

type JsonRecord = Record<string, unknown>;
type TargetRef = {
  kind?: ScienceArtifactResourceKind;
  id?: string;
  version?: number;
  pageId?: string;
};

type AnnotationRecord = {
  id: string;
  runId: string;
  artifactId?: string;
  pageId?: string;
  text: string;
  region?: JsonRecord;
  status: 'open' | 'resolved';
  createdAt: number;
  revision: string;
};

type ScienceRunState = {
  runId: string;
  conversationId?: string;
  messageId?: string;
  toolCallId?: string;
  projectRoot?: string;
  question: string;
  summary?: string;
  status: SciencePanelData['status'];
  report?: SciencePanelData['report'];
  statsPatch?: Partial<SciencePanelData['stats']>;
  evidence: Map<string, ScienceEvidenceItem>;
  artifacts: Map<string, ScienceArtifact>;
  pages: Map<string, ScienceArtifactPage>;
  claims: Map<string, ScienceClaim>;
  provenance: Map<string, ScienceProvenanceNode>;
  edges: Map<string, ScienceProvenanceEdge>;
  graphWarnings: Map<string, ScienceGraphWarning>;
  usedSkills: Map<string, ScienceSkillUse>;
  annotations: Map<string, AnnotationRecord>;
  events: ScienceArtifactEvent[];
  git?: ScienceArtifactGitRef;
  createdAt: number;
  updatedAt: number;
};

const runs = new Map<string, ScienceRunState>();

const jsonText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const now = (): number => Date.now();
const revision = (): string => `rev_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
const eventId = (): string => `sci_evt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
const runId = (): string => `sci_run_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
const makeId = (kind: ScienceArtifactResourceKind): string =>
  `sci_${kind}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
const artifactKey = (id: string, version = 1): string => `${id}@${version}`;
const writeProjectManifest = (): boolean => process.env[SCIENCE_ARTIFACT_ENV_KEYS.writeProjectManifest] !== 'false';

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeRelativePath = (candidate: string, projectRoot?: string): string => {
  if (!candidate || path.isAbsolute(candidate) || !projectRoot) return candidate;
  return path.join(projectRoot, candidate);
};

const safeSegment = (value: string): string =>
  value
    .trim()
    .replace(/[^a-z0-9_.-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 120) || 'science-run';

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const writeJsonl = (filePath: string, values: unknown[]): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    values.map((value) => JSON.stringify(value)).join('\n') + (values.length ? '\n' : ''),
    'utf8'
  );
};

const readJson = <T>(filePath: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const readJsonl = <T>(filePath: string): T[] => {
  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
};

const fileMeta = (
  candidate?: string,
  projectRoot?: string
): Pick<ScienceArtifact, 'status' | 'sizeBytes' | 'contentHash'> => {
  if (!candidate) return {};
  const resolved = normalizeRelativePath(candidate, projectRoot);
  if (!fs.existsSync(resolved)) return { status: 'missing' };
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return { status: 'available', sizeBytes: stat.size };
  const hash = crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
  return { status: 'available', sizeBytes: stat.size, contentHash: hash };
};

const deepMerge = (base: unknown, patch: unknown): unknown => {
  if (!isRecord(base) || !isRecord(patch)) return clone(patch);
  const next: JsonRecord = { ...clone(base) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
      continue;
    }
    next[key] = isRecord(value) && isRecord(next[key]) ? deepMerge(next[key], value) : clone(value);
  }
  return next;
};

const contextValue = (payload: JsonRecord | undefined, key: string): unknown => {
  const context = isRecord(payload?.context) ? payload.context : undefined;
  const snakeKey = key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
  return payload?.[key] || payload?.[snakeKey] || context?.[key] || context?.[snakeKey];
};

const applyRunContext = (
  run: ScienceRunState,
  payload?: JsonRecord,
  topLevel?: { conversationId?: string; messageId?: string; toolCallId?: string }
): void => {
  const conversationId = asString(
    topLevel?.conversationId || contextValue(payload, 'conversationId'),
    undefined as unknown as string
  );
  const messageId = asString(topLevel?.messageId || contextValue(payload, 'messageId'), undefined as unknown as string);
  const toolCallId = asString(
    topLevel?.toolCallId || contextValue(payload, 'toolCallId'),
    undefined as unknown as string
  );
  if (conversationId) run.conversationId = conversationId;
  if (messageId) run.messageId = messageId;
  if (toolCallId) run.toolCallId = toolCallId;
};

const ensureRun = (requestedRunId?: string, projectRoot?: string, payload?: JsonRecord): ScienceRunState => {
  const id = requestedRunId || asString(payload?.runId) || runId();
  const existing = runs.get(id);
  if (existing) {
    if (projectRoot && !existing.projectRoot) existing.projectRoot = projectRoot;
    if (projectRoot) ensureScienceProject(projectRoot);
    existing.updatedAt = now();
    return existing;
  }
  const hydrated = hydrateRun(id, projectRoot);
  if (hydrated) {
    runs.set(id, hydrated);
    return hydrated;
  }
  const created: ScienceRunState = {
    runId: id,
    conversationId: asString(contextValue(payload, 'conversationId'), undefined as unknown as string),
    messageId: asString(contextValue(payload, 'messageId'), undefined as unknown as string),
    toolCallId: asString(contextValue(payload, 'toolCallId'), undefined as unknown as string),
    projectRoot,
    question: asString(payload?.question, 'Science research run'),
    summary: asString(payload?.summary, undefined as unknown as string),
    status: (asString(payload?.status, 'draft') as SciencePanelData['status']) || 'draft',
    evidence: new Map(),
    artifacts: new Map(),
    pages: new Map(),
    claims: new Map(),
    provenance: new Map(),
    edges: new Map(),
    graphWarnings: new Map(),
    usedSkills: new Map(),
    annotations: new Map(),
    events: [],
    createdAt: now(),
    updatedAt: now(),
  };
  if (projectRoot) ensureScienceProject(projectRoot);
  runs.set(id, created);
  return created;
};

const hydrateMap = <T extends { id: string }>(items: unknown): Map<string, T> => {
  const map = new Map<string, T>();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (!isRecord(item)) continue;
    const id = asString(item.id, undefined as unknown as string);
    if (!id) continue;
    map.set(id, item as T);
  }
  return map;
};

const hydrateArtifacts = (items: unknown): Map<string, ScienceArtifact> => {
  const map = new Map<string, ScienceArtifact>();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (!isRecord(item)) continue;
    const id = asString(item.id, undefined as unknown as string);
    if (!id) continue;
    const version = asNumber(item.version, 1);
    map.set(artifactKey(id, version), item as unknown as ScienceArtifact);
  }
  return map;
};

const hydrateRun = (id: string, projectRoot?: string): ScienceRunState | undefined => {
  if (!projectRoot) return undefined;
  const statePath = path.join(projectRoot, '.openscience', 'science-artifacts', 'runs', safeSegment(id), 'state.json');
  if (!fs.existsSync(statePath)) return undefined;
  const state = readJson<JsonRecord>(statePath, {});
  if (!isRecord(state)) return undefined;
  const panelPath = path.join(projectRoot, '.openscience', 'science-artifacts', 'runs', safeSegment(id), 'panel.json');
  const panel = readJson<Partial<SciencePanelData> & JsonRecord>(panelPath, {});
  const events = readJsonl<ScienceArtifactEvent>(
    path.join(projectRoot, '.openscience', 'science-artifacts', 'runs', safeSegment(id), 'events.jsonl')
  );
  const createdAt = asNumber(state.createdAt, now());
  return {
    runId: id,
    conversationId: asString(state.conversationId || panel.conversationId, undefined as unknown as string),
    messageId: asString(state.messageId, undefined as unknown as string),
    toolCallId: asString(state.toolCallId, undefined as unknown as string),
    projectRoot,
    question: asString(state.question, asString(panel.question, 'Science research run')),
    summary: asString(state.summary, asString(panel.summary, undefined as unknown as string)),
    status: (asString(state.status, asString(panel.status, 'draft')) as SciencePanelData['status']) || 'draft',
    report: isRecord(state.report)
      ? (state.report as SciencePanelData['report'])
      : isRecord(panel.report)
        ? (panel.report as SciencePanelData['report'])
        : undefined,
    statsPatch: isRecord(state.statsPatch) ? (state.statsPatch as Partial<SciencePanelData['stats']>) : undefined,
    evidence: hydrateMap<ScienceEvidenceItem>(state.evidence),
    artifacts: hydrateArtifacts(state.artifacts),
    pages: hydrateMap<ScienceArtifactPage>(state.pages),
    claims: hydrateMap<ScienceClaim>(state.claims),
    provenance: hydrateMap<ScienceProvenanceNode>(state.provenance),
    edges: hydrateMap<ScienceProvenanceEdge>(state.edges),
    graphWarnings: hydrateMap<ScienceGraphWarning>(state.graphWarnings),
    usedSkills: hydrateMap<ScienceSkillUse>(state.usedSkills),
    annotations: hydrateMap<AnnotationRecord>(state.annotations),
    events: Array.isArray(events) ? events : [],
    git: isRecord(state.git)
      ? (state.git as ScienceArtifactGitRef)
      : isRecord(panel.git)
        ? (panel.git as ScienceArtifactGitRef)
        : undefined,
    createdAt,
    updatedAt: asNumber(state.updatedAt, createdAt),
  };
};

const assertBaseRevision = (current: { revision?: string } | undefined, baseRevision?: string): void => {
  if (!current) return;
  if (!baseRevision) {
    throw new Error(
      'baseRevision is required before mutating an existing Science artifact object. Call science_artifact(action="get") first.'
    );
  }
  if (current.revision && current.revision !== baseRevision) {
    throw new Error(`baseRevision mismatch. Current revision is ${current.revision}.`);
  }
};

const eventFor = (
  run: ScienceRunState,
  action: ScienceArtifactAction,
  target?: TargetRef,
  extra?: Partial<ScienceArtifactEvent>,
  includePaths?: ScienceArtifactSnapshotIncludePath[]
): ScienceArtifactEvent => {
  const evt: ScienceArtifactEvent = {
    schema: SCIENCE_EVENT_SCHEMA,
    eventId: eventId(),
    runId: run.runId,
    action,
    timestamp: now(),
    conversationId: extra?.conversationId || run.conversationId,
    messageId: extra?.messageId || run.messageId,
    toolCallId: extra?.toolCallId || run.toolCallId,
    target,
    ...extra,
  };
  run.events.push(evt);
  run.updatedAt = evt.timestamp;
  const gitRef = persistRunSnapshot(run, evt, includePaths);
  if (gitRef) {
    run.git = gitRef;
    evt.git = gitRef;
    if (evt.panel) evt.panel.git = gitRef;
    if (evt.snapshot) evt.snapshot.files = gitRef.files;
  }
  return evt;
};

const normalizeEvidence = (run: ScienceRunState, value: JsonRecord): ScienceEvidenceItem => {
  const id = asString(value.id, makeId('evidence'));
  return {
    id,
    title: asString(value.title, id),
    sourceType:
      (asString(value.sourceType || value.source_type, 'dataset') as ScienceEvidenceItem['sourceType']) || 'dataset',
    claimType:
      value.claimType || value.claim_type
        ? (asString(value.claimType || value.claim_type) as ScienceEvidenceItem['claimType'])
        : undefined,
    confidence: (asString(value.confidence, 'moderate') as ScienceEvidenceItem['confidence']) || 'moderate',
    status: (asString(value.status, 'available') as ScienceEvidenceItem['status']) || 'available',
    summary: asString(value.summary, undefined as unknown as string),
    path: asString(value.path, undefined as unknown as string),
    url: asString(value.url, undefined as unknown as string),
    virtualPath: asString(value.virtualPath || value.virtual_path, undefined as unknown as string),
    command: asString(value.command, undefined as unknown as string),
    lineStart: value.lineStart || value.line_start ? asNumber(value.lineStart || value.line_start, 0) : undefined,
    lineEnd: value.lineEnd || value.line_end ? asNumber(value.lineEnd || value.line_end, 0) : undefined,
    artifactId: asString(value.artifactId || value.artifact_id, undefined as unknown as string),
    artifactVersion:
      value.artifactVersion || value.artifact_version
        ? asNumber(value.artifactVersion || value.artifact_version, 1)
        : undefined,
    nodeId: asString(value.nodeId || value.node_id, undefined as unknown as string),
    supportingEvidenceIds: asArray(value.supportingEvidenceIds || value.supporting_evidence_ids).filter(
      (item): item is string => typeof item === 'string'
    ),
    hash: asString(value.hash, undefined as unknown as string),
    version: value.version ? asNumber(value.version, 1) : undefined,
    skillUseId: asString(value.skillUseId || value.skill_use_id, undefined as unknown as string),
    connectorId: asString(value.connectorId || value.connector_id, undefined as unknown as string),
    database: isRecord(value.database) ? (value.database as ScienceEvidenceItem['database']) : undefined,
    region: isRecord(value.region) ? (value.region as ScienceEvidenceItem['region']) : undefined,
    createdAt: asNumber(value.createdAt || value.created_at, now()),
    revision: asString(value.revision, revision()),
  };
};

const normalizeArtifact = (run: ScienceRunState, value: JsonRecord): ScienceArtifact => {
  const id = asString(value.id, makeId('artifact'));
  const version = asNumber(value.version, 1);
  const primaryPath = asString(value.primaryPath || value.primary_path || value.path, undefined as unknown as string);
  const meta = fileMeta(primaryPath, run.projectRoot);
  return {
    id,
    runId: run.runId,
    type: (asString(value.type, 'run_bundle') as ScienceArtifact['type']) || 'run_bundle',
    title: asString(value.title, id),
    version,
    versionGroupId: asString(value.versionGroupId || value.version_group_id, id),
    previousArtifactId: asString(
      value.previousArtifactId || value.previous_artifact_id,
      undefined as unknown as string
    ),
    previousVersion:
      value.previousVersion || value.previous_version
        ? asNumber(value.previousVersion || value.previous_version, version - 1)
        : undefined,
    revision: asString(value.revision, revision()),
    changeSummary: asString(value.changeSummary || value.change_summary, undefined as unknown as string),
    status:
      (asString(value.status, meta.status || 'available') as ScienceArtifact['status']) || meta.status || 'available',
    primaryPath,
    previewPath: asString(value.previewPath || value.preview_path, undefined as unknown as string),
    thumbnailPath: asString(value.thumbnailPath || value.thumbnail_path, undefined as unknown as string),
    sourcePaths: asArray(value.sourcePaths || value.source_paths).filter(
      (item): item is string => typeof item === 'string'
    ),
    inputPaths: asArray(value.inputPaths || value.input_paths).filter(
      (item): item is string => typeof item === 'string'
    ),
    outputPaths: asArray(value.outputPaths || value.output_paths).filter(
      (item): item is string => typeof item === 'string'
    ),
    contentHash: asString(value.contentHash || value.content_hash, meta.contentHash),
    sizeBytes:
      value.sizeBytes || value.size_bytes
        ? asNumber(value.sizeBytes || value.size_bytes, meta.sizeBytes || 0)
        : meta.sizeBytes,
    mimeType: asString(value.mimeType || value.mime_type, undefined as unknown as string),
    code: isRecord(value.code) ? (value.code as ScienceArtifact['code']) : undefined,
    execution: isRecord(value.execution) ? (value.execution as ScienceArtifact['execution']) : undefined,
    environment: isRecord(value.environment) ? (value.environment as ScienceArtifact['environment']) : undefined,
    inputs: Array.isArray(value.inputs) ? (value.inputs as ScienceArtifact['inputs']) : undefined,
    relatedMessageIds: asArray(value.relatedMessageIds || value.related_message_ids).filter(
      (item): item is string => typeof item === 'string'
    ),
    relatedToolCallIds: asArray(value.relatedToolCallIds || value.related_tool_call_ids).filter(
      (item): item is string => typeof item === 'string'
    ),
    defaultInspectorTab: asString(
      value.defaultInspectorTab || value.default_inspector_tab,
      undefined as unknown as string
    ) as ScienceArtifact['defaultInspectorTab'],
    availableTabs: Array.isArray(value.availableTabs || value.available_tabs)
      ? ((value.availableTabs || value.available_tabs) as ScienceArtifact['availableTabs'])
      : undefined,
    evidenceIds: asArray(value.evidenceIds || value.evidence_ids).filter(
      (item): item is string => typeof item === 'string'
    ),
    provenanceNodeIds: asArray(value.provenanceNodeIds || value.provenance_node_ids).filter(
      (item): item is string => typeof item === 'string'
    ),
    reviewStatus:
      (asString(value.reviewStatus || value.review_status, 'not_reviewed') as ScienceArtifact['reviewStatus']) ||
      'not_reviewed',
    viewer: isRecord(value.viewer) ? (value.viewer as ScienceArtifact['viewer']) : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    createdAt: asNumber(value.createdAt || value.created_at, now()),
  };
};

const normalizePage = (run: ScienceRunState, value: JsonRecord): ScienceArtifactPage => ({
  id: asString(value.id, makeId('page')),
  runId: run.runId,
  title: asString(value.title, 'Science Artifact Workspace'),
  kind: (asString(value.kind, 'artifact_workspace') as ScienceArtifactPage['kind']) || 'artifact_workspace',
  layout:
    (asString(value.layout, 'report_artifact_inspector') as ScienceArtifactPage['layout']) ||
    'report_artifact_inspector',
  panes: Array.isArray(value.panes) ? (value.panes as ScienceArtifactPage['panes']) : [],
  revision: asString(value.revision, revision()),
});

const normalizeClaim = (run: ScienceRunState, value: JsonRecord): ScienceClaim => ({
  id: asString(value.id, makeId('claim')),
  runId: run.runId,
  text: asString(value.text, 'Untitled Science claim'),
  claimType: (asString(value.claimType || value.claim_type, 'hypothesis') as ScienceClaim['claimType']) || 'hypothesis',
  status: (asString(value.status, 'hypothesis') as ScienceClaim['status']) || 'hypothesis',
  supportingEvidenceIds: asArray(value.supportingEvidenceIds || value.supporting_evidence_ids).filter(
    (item): item is string => typeof item === 'string'
  ),
  artifactIds: asArray(value.artifactIds || value.artifact_ids).filter(
    (item): item is string => typeof item === 'string'
  ),
  provenanceNodeIds: asArray(value.provenanceNodeIds || value.provenance_node_ids).filter(
    (item): item is string => typeof item === 'string'
  ),
  limitations: asArray(value.limitations).filter((item): item is string => typeof item === 'string'),
  createdAt: asNumber(value.createdAt || value.created_at, now()),
  revision: asString(value.revision, revision()),
});

const normalizeNode = (run: ScienceRunState, value: JsonRecord): ScienceProvenanceNode => ({
  id: asString(value.id, makeId('provenance')),
  type: (asString(value.type, 'activity') as ScienceProvenanceNode['type']) || 'activity',
  label: asString(value.label, 'Science activity'),
  artifactId: asString(value.artifactId || value.artifact_id, undefined as unknown as string),
  evidenceIds: asArray(value.evidenceIds || value.evidence_ids).filter(
    (item): item is string => typeof item === 'string'
  ),
  parents: asArray(value.parents).filter((item): item is string => typeof item === 'string'),
  command: asString(value.command, undefined as unknown as string),
  path: asString(value.path, undefined as unknown as string),
  contentHash: asString(value.contentHash || value.content_hash, undefined as unknown as string),
  createdAt: asNumber(value.createdAt || value.created_at, now()),
  metadata: isRecord(value.metadata) ? value.metadata : undefined,
  revision: asString(value.revision, revision()),
});

const normalizeEdge = (run: ScienceRunState, value: JsonRecord): ScienceProvenanceEdge => ({
  id: asString(value.id, makeId('provenance')),
  runId: run.runId,
  from: (isRecord(value.from)
    ? value.from
    : { kind: 'node', id: asString(value.fromId || value.from_id, '') }) as ScienceProvenanceEdge['from'],
  to: (isRecord(value.to)
    ? value.to
    : { kind: 'node', id: asString(value.toId || value.to_id, '') }) as ScienceProvenanceEdge['to'],
  type: (asString(value.type, 'derived_from') as ScienceProvenanceEdge['type']) || 'derived_from',
  label: asString(value.label, undefined as unknown as string),
  confidence: (asString(value.confidence, 'declared') as ScienceProvenanceEdge['confidence']) || 'declared',
  createdAt: asNumber(value.createdAt || value.created_at, now()),
});

const normalizeSkillUse = (run: ScienceRunState, value: JsonRecord): ScienceSkillUse => ({
  id: asString(value.id, makeId('skill_use')),
  runId: run.runId,
  skillId: asString(value.skillId || value.skill_id, 'unknown-skill'),
  skillName: asString(value.skillName || value.skill_name, asString(value.skillId || value.skill_id, 'Unknown skill')),
  source: (asString(value.source, 'local') as ScienceSkillUse['source']) || 'local',
  sourceUrl: asString(value.sourceUrl || value.source_url, undefined as unknown as string),
  version: asString(value.version, undefined as unknown as string),
  purpose: (asString(value.purpose, 'routing') as ScienceSkillUse['purpose']) || 'routing',
  status: (asString(value.status, 'used') as ScienceSkillUse['status']) || 'used',
  triggeredBy: asString(value.triggeredBy || value.triggered_by, 'Science Mode'),
  selectedBecause: asString(value.selectedBecause || value.selected_because, undefined as unknown as string),
  limitations: asArray(value.limitations).filter((item): item is string => typeof item === 'string'),
  evidenceIds: asArray(value.evidenceIds || value.evidence_ids).filter(
    (item): item is string => typeof item === 'string'
  ),
  artifactIds: asArray(value.artifactIds || value.artifact_ids).filter(
    (item): item is string => typeof item === 'string'
  ),
  createdAt: asNumber(value.createdAt || value.created_at, now()),
  revision: asString(value.revision, revision()),
});

const upsertEdge = (run: ScienceRunState, edge: ScienceProvenanceEdge): void => {
  if (!edge.from.id || !edge.to.id) return;
  run.edges.set(edge.id, edge);
};

const syncArtifactEdges = (run: ScienceRunState, artifact: ScienceArtifact): void => {
  for (const evidenceId of artifact.evidenceIds || []) {
    upsertEdge(run, {
      id: `edge_${evidenceId}_${artifact.id}_${artifact.version}`,
      runId: run.runId,
      from: { kind: 'evidence', id: evidenceId },
      to: { kind: 'artifact', id: artifact.id, version: artifact.version },
      type: 'supports',
      confidence: 'declared',
      createdAt: now(),
    });
  }
  for (const input of artifact.inputs || []) {
    if (input.evidenceId) {
      upsertEdge(run, {
        id: `edge_${input.evidenceId}_${artifact.id}_${artifact.version}_input`,
        runId: run.runId,
        from: { kind: 'evidence', id: input.evidenceId },
        to: { kind: 'artifact', id: artifact.id, version: artifact.version },
        type: 'uses_input',
        confidence: 'declared',
        createdAt: now(),
      });
    }
    if (input.artifactId) {
      upsertEdge(run, {
        id: `edge_${input.artifactId}_${artifact.id}_${artifact.version}_input`,
        runId: run.runId,
        from: { kind: 'artifact', id: input.artifactId },
        to: { kind: 'artifact', id: artifact.id, version: artifact.version },
        type: 'uses_input',
        confidence: 'declared',
        createdAt: now(),
      });
    }
  }
  if (artifact.previousArtifactId || artifact.previousVersion) {
    upsertEdge(run, {
      id: `edge_${artifact.id}_${artifact.previousVersion || 'prev'}_${artifact.version}`,
      runId: run.runId,
      from: { kind: 'artifact', id: artifact.previousArtifactId || artifact.id, version: artifact.previousVersion },
      to: { kind: 'artifact', id: artifact.id, version: artifact.version },
      type: 'supersedes',
      confidence: 'declared',
      createdAt: now(),
    });
  }
};

const syncEvidenceEdges = (run: ScienceRunState, evidence: ScienceEvidenceItem): void => {
  if (evidence.artifactId) {
    upsertEdge(run, {
      id: `edge_${evidence.artifactId}_${evidence.artifactVersion || 'latest'}_${evidence.id}_file_evidence`,
      runId: run.runId,
      from: { kind: 'artifact', id: evidence.artifactId, version: evidence.artifactVersion },
      to: { kind: 'evidence', id: evidence.id },
      type: 'supports',
      label: 'file evidence',
      confidence: 'declared',
      createdAt: now(),
    });
  }

  if (evidence.nodeId) {
    upsertEdge(run, {
      id: `edge_${evidence.nodeId}_${evidence.id}_generated`,
      runId: run.runId,
      from: { kind: 'node', id: evidence.nodeId },
      to: { kind: 'evidence', id: evidence.id },
      type: 'generated',
      confidence: 'declared',
      createdAt: now(),
    });
  }

  for (const supportingEvidenceId of evidence.supportingEvidenceIds || []) {
    upsertEdge(run, {
      id: `edge_${supportingEvidenceId}_${evidence.id}_supports_evidence`,
      runId: run.runId,
      from: { kind: 'evidence', id: supportingEvidenceId },
      to: { kind: 'evidence', id: evidence.id },
      type: 'supports',
      confidence: 'declared',
      createdAt: now(),
    });
  }
};

const syncClaimEdges = (run: ScienceRunState, claim: ScienceClaim): void => {
  for (const evidenceId of claim.supportingEvidenceIds || []) {
    upsertEdge(run, {
      id: `edge_${evidenceId}_${claim.id}`,
      runId: run.runId,
      from: { kind: 'evidence', id: evidenceId },
      to: { kind: 'claim', id: claim.id },
      type: claim.status === 'blocked' ? 'contradicts' : 'supports',
      confidence: 'declared',
      createdAt: now(),
    });
  }
  for (const artifactId of claim.artifactIds || []) {
    upsertEdge(run, {
      id: `edge_${artifactId}_${claim.id}`,
      runId: run.runId,
      from: { kind: 'artifact', id: artifactId },
      to: { kind: 'claim', id: claim.id },
      type: claim.status === 'blocked' ? 'contradicts' : 'supports',
      confidence: 'declared',
      createdAt: now(),
    });
  }
};

const validateGraph = (run: ScienceRunState): ScienceGraphWarning[] => {
  const warnings: ScienceGraphWarning[] = [...run.graphWarnings.values()];
  for (const evidence of run.evidence.values()) {
    if (!evidence.path && !evidence.url && !evidence.virtualPath && !evidence.command && !evidence.artifactId) {
      warnings.push({
        id: `warn_missing_source_${evidence.id}`,
        runId: run.runId,
        severity: 'warning',
        code: 'missing_source',
        message: `Evidence ${evidence.id} has no path, url, virtualPath, command, or artifactId.`,
        target: { kind: 'evidence', id: evidence.id },
        createdAt: now(),
      });
    }
  }
  for (const artifact of run.artifacts.values()) {
    const hasInput = Boolean(
      artifact.evidenceIds?.length ||
      artifact.inputPaths?.length ||
      artifact.inputs?.length ||
      artifact.sourcePaths?.length ||
      artifact.code?.path
    );
    if (!hasInput) {
      warnings.push({
        id: `warn_untraced_artifact_${artifact.id}_${artifact.version}`,
        runId: run.runId,
        severity: 'warning',
        code: 'untraced_artifact',
        message: `Artifact ${artifact.id} v${artifact.version} has no declared inputs, sources, code, or evidence ids.`,
        target: { kind: 'artifact', id: artifact.id, version: artifact.version },
        createdAt: now(),
      });
    }
    if (
      [
        'figure',
        'table',
        'dataset',
        'notebook',
        'manuscript',
        'pdf',
        'latex',
        'regression_table',
        'model_diagnostic',
        'causal_dag',
        'survey_codebook',
        'geospatial_map',
        'qualitative_coding',
        'replication_package',
      ].includes(artifact.type) &&
      !artifact.execution?.logPath
    ) {
      warnings.push({
        id: `warn_missing_execution_log_${artifact.id}_${artifact.version}`,
        runId: run.runId,
        severity: 'info',
        code: 'missing_execution_log',
        message: `Artifact ${artifact.id} v${artifact.version} has no execution log path.`,
        target: { kind: 'artifact', id: artifact.id, version: artifact.version },
        createdAt: now(),
      });
    }
  }
  for (const claim of run.claims.values()) {
    if (claim.status !== 'hypothesis' && !claim.supportingEvidenceIds.length && !claim.artifactIds?.length) {
      warnings.push({
        id: `warn_unsupported_claim_${claim.id}`,
        runId: run.runId,
        severity: 'error',
        code: 'unsupported_claim',
        message: `Claim ${claim.id} is not marked as hypothesis but has no supporting evidence or artifact.`,
        target: { kind: 'claim', id: claim.id },
        blocking: process.env[SCIENCE_ARTIFACT_ENV_KEYS.strictProvenance] === 'true',
        createdAt: now(),
      });
    }
  }
  return Array.from(new Map(warnings.map((item) => [item.id, item])).values());
};

const fallbackBlocks = (run: ScienceRunState): ScienceReportBlock[] => {
  const artifacts = [...run.artifacts.values()].slice(0, 6);
  const claims = [...run.claims.values()].slice(0, 6);
  if (claims.length) {
    return [
      {
        type: 'bullet_list',
        items: claims.map((claim) => ({
          text: claim.text,
          evidenceIds: claim.supportingEvidenceIds,
          confidence: claim.status,
        })),
      },
    ];
  }
  if (artifacts.length) {
    return artifacts.map((artifact) => ({ type: 'artifact_ref', artifactId: artifact.id }));
  }
  return [{ type: 'paragraph', text: run.summary || 'Science artifact run is being assembled.' }];
};

const buildPanel = (run: ScienceRunState): SciencePanelData => {
  const artifacts = [...run.artifacts.values()];
  const evidence = [...run.evidence.values()];
  const claims = [...run.claims.values()];
  const warnings = validateGraph(run);
  const stats = {
    searches:
      run.statsPatch?.searches || evidence.filter((item) => item.sourceType === 'paper' || item.database).length,
    artifacts: artifacts.length,
    evidence: evidence.length,
    commands:
      run.statsPatch?.commands ||
      artifacts.filter((item) => item.execution?.command || item.execution?.scriptPath).length,
    validations:
      run.statsPatch?.validations || evidence.filter((item) => item.sourceType === 'validation_result').length,
    warnings: warnings.length,
  };
  const report =
    run.report ||
    ({
      title: run.question || 'Science Artifact Report',
      sections: [
        {
          id: 'summary',
          heading: 'Research Output',
          blocks: fallbackBlocks(run),
        },
      ],
    } satisfies SciencePanelData['report']);

  return {
    schema: SCIENCE_PANEL_SCHEMA,
    runId: run.runId,
    conversationId: run.conversationId,
    projectRoot: run.projectRoot,
    question: run.question,
    generatedAt: now(),
    summary: run.summary,
    status: run.status,
    stats,
    report,
    evidence,
    artifacts,
    pages: [...run.pages.values()],
    claims,
    provenance: [...run.provenance.values()],
    edges: [...run.edges.values()],
    graphWarnings: warnings,
    usedSkills: [...run.usedSkills.values()],
    methods: {
      commands: artifacts.map((item) => item.execution?.command).filter((item): item is string => Boolean(item)),
      environmentSummary: artifacts
        .map((item) => item.environment?.kind)
        .filter(Boolean)
        .join(', '),
      limitations: warnings.filter((item) => item.severity !== 'info').map((item) => item.message),
    },
    git: run.git,
  };
};

function persistRunSnapshot(
  run: ScienceRunState,
  triggerEvent?: ScienceArtifactEvent,
  includePaths?: ScienceArtifactSnapshotIncludePath[]
): ScienceArtifactGitRef | undefined {
  if (!writeProjectManifest() || !run.projectRoot) return undefined;
  try {
    const root = path.join(run.projectRoot, '.openscience', 'science-artifacts', 'runs', safeSegment(run.runId));
    const panel = buildPanel(run);
    const state = {
      runId: run.runId,
      conversationId: run.conversationId,
      messageId: run.messageId,
      toolCallId: run.toolCallId,
      projectRoot: run.projectRoot,
      question: run.question,
      summary: run.summary,
      status: run.status,
      report: run.report,
      statsPatch: run.statsPatch,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      evidence: panel.evidence,
      artifacts: panel.artifacts,
      pages: panel.pages,
      claims: panel.claims,
      provenance: panel.provenance,
      edges: panel.edges,
      graphWarnings: panel.graphWarnings,
      usedSkills: panel.usedSkills,
      annotations: [...run.annotations.values()],
      git: run.git,
    };
    const gitRef = commitScienceArtifactSnapshot({
      projectRoot: run.projectRoot,
      panel,
      state,
      events: run.events,
      event: triggerEvent,
      target: triggerEvent?.target,
      includePaths,
    });
    if (gitRef.ok) {
      run.git = gitRef;
      panel.git = gitRef;
      state.git = gitRef;
      if (triggerEvent) {
        triggerEvent.git = gitRef;
        if (triggerEvent.snapshot) triggerEvent.snapshot.files = gitRef.files;
      }
    }
    writeJson(path.join(root, 'panel.json'), panel);
    writeJson(path.join(root, 'state.json'), state);
    writeJsonl(path.join(root, 'events.jsonl'), run.events);
    return gitRef;
  } catch (error) {
    console.warn('[ScienceArtifactMCP] Failed to write project manifest:', error);
    return {
      status: 'unavailable',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const getResource = (run: ScienceRunState, target?: TargetRef): unknown => {
  if (!target?.kind) return buildPanel(run);
  if (target.kind === 'run')
    return {
      runId: run.runId,
      projectRoot: run.projectRoot,
      question: run.question,
      summary: run.summary,
      status: run.status,
    };
  if (target.kind === 'report') return run.report;
  if (target.kind === 'artifact' && target.id) return run.artifacts.get(artifactKey(target.id, target.version || 1));
  if (target.kind === 'page' && (target.id || target.pageId)) return run.pages.get(target.id || target.pageId || '');
  if (target.kind === 'evidence' && target.id) return run.evidence.get(target.id);
  if (target.kind === 'claim' && target.id) return run.claims.get(target.id);
  if (target.kind === 'provenance' && target.id) return run.provenance.get(target.id) || run.edges.get(target.id);
  if (target.kind === 'skill_use' && target.id) return run.usedSkills.get(target.id);
  if (target.kind === 'annotation' && target.id) return run.annotations.get(target.id);
  return undefined;
};

const listResource = (run: ScienceRunState, kind?: ScienceArtifactResourceKind): unknown[] => {
  if (kind === 'artifact') return [...run.artifacts.values()];
  if (kind === 'page') return [...run.pages.values()];
  if (kind === 'evidence') return [...run.evidence.values()];
  if (kind === 'claim') return [...run.claims.values()];
  if (kind === 'provenance') return [...run.provenance.values(), ...run.edges.values()];
  if (kind === 'skill_use') return [...run.usedSkills.values()];
  if (kind === 'annotation') return [...run.annotations.values()];
  return [
    ...run.artifacts.values(),
    ...run.pages.values(),
    ...run.evidence.values(),
    ...run.claims.values(),
    ...run.provenance.values(),
    ...run.edges.values(),
    ...run.usedSkills.values(),
    ...run.annotations.values(),
  ];
};

const normalizeIncludePaths = (value: unknown): ScienceArtifactSnapshotIncludePath[] => {
  const rawItems = Array.isArray(value) ? value : value ? [value] : [];
  return rawItems
    .map((item): ScienceArtifactSnapshotIncludePath | undefined => {
      if (typeof item === 'string') return { path: item, role: 'other', recursive: true };
      if (!isRecord(item)) return undefined;
      const filePath = asString(item.path || item.filePath || item.file_path, undefined as unknown as string);
      if (!filePath) return undefined;
      return {
        path: filePath,
        role: asString(item.role, 'other') as ScienceArtifactSnapshotIncludePath['role'],
        artifactId: asString(item.artifactId || item.artifact_id, undefined as unknown as string),
        artifactVersion:
          item.artifactVersion || item.artifact_version
            ? asNumber(item.artifactVersion || item.artifact_version, 1)
            : undefined,
        recursive: typeof item.recursive === 'boolean' ? item.recursive : true,
      };
    })
    .filter((item): item is ScienceArtifactSnapshotIncludePath => Boolean(item));
};

const listProjectResource = (
  projectRoot: string | undefined,
  kind?: ScienceArtifactResourceKind
): unknown[] | undefined => {
  if (!projectRoot) return undefined;
  const runsRoot = path.join(projectRoot, '.openscience', 'science-artifacts', 'runs');
  if (!fs.existsSync(runsRoot)) return [];
  const states = fs
    .readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readJson<JsonRecord>(path.join(runsRoot, entry.name, 'state.json'), {}))
    .filter(isRecord);
  const values = states.flatMap((state) => {
    if (kind === 'artifact') return Array.isArray(state.artifacts) ? state.artifacts : [];
    if (kind === 'page') return Array.isArray(state.pages) ? state.pages : [];
    if (kind === 'evidence') return Array.isArray(state.evidence) ? state.evidence : [];
    if (kind === 'claim') return Array.isArray(state.claims) ? state.claims : [];
    if (kind === 'provenance')
      return [
        ...(Array.isArray(state.provenance) ? state.provenance : []),
        ...(Array.isArray(state.edges) ? state.edges : []),
      ];
    if (kind === 'skill_use') return Array.isArray(state.usedSkills) ? state.usedSkills : [];
    if (kind === 'annotation') return Array.isArray(state.annotations) ? state.annotations : [];
    return [
      ...(Array.isArray(state.artifacts) ? state.artifacts : []),
      ...(Array.isArray(state.evidence) ? state.evidence : []),
      ...(Array.isArray(state.claims) ? state.claims : []),
      ...(Array.isArray(state.provenance) ? state.provenance : []),
    ];
  });
  return values;
};

const createOrReplaceResource = (
  run: ScienceRunState,
  action: 'create' | 'replace' | 'patch',
  target: TargetRef | undefined,
  payload: JsonRecord,
  baseRevision?: string,
  createIfMissing = false
): { object: unknown; target: TargetRef; resultingRevision?: string } => {
  const kind = (target?.kind || payload.kind) as ScienceArtifactResourceKind | undefined;
  if (!kind) throw new Error(`${action} requires target.kind or payload.kind.`);

  if (kind === 'run') {
    run.question = asString(payload.question, run.question);
    run.summary = asString(payload.summary, run.summary as string);
    run.status = (asString(payload.status, run.status) as SciencePanelData['status']) || run.status;
    if (isRecord(payload.stats)) run.statsPatch = payload.stats as Partial<SciencePanelData['stats']>;
    return { object: getResource(run, { kind: 'run' }), target: { kind: 'run', id: run.runId } };
  }

  if (kind === 'report') {
    run.report =
      action === 'patch' && run.report
        ? (deepMerge(run.report, payload) as SciencePanelData['report'])
        : (payload as SciencePanelData['report']);
    return { object: run.report, target: { kind: 'report', id: 'report' } };
  }

  if (kind === 'artifact') {
    const id = asString(target?.id || payload.id, makeId('artifact'));
    const version = asNumber(target?.version || payload.version, 1);
    const key = artifactKey(id, version);
    const previous = run.artifacts.get(key);
    if (action === 'create' && previous && !createIfMissing) throw new Error(`Artifact ${key} already exists.`);
    if ((action === 'patch' || action === 'replace') && previous) assertBaseRevision(previous, baseRevision);
    if ((action === 'patch' || action === 'replace') && !previous && !createIfMissing)
      throw new Error(`Artifact ${key} does not exist.`);
    const nextPayload =
      action === 'patch' && previous ? (deepMerge(previous, payload) as JsonRecord) : { ...payload, id, version };
    const artifact = normalizeArtifact(run, { ...nextPayload, id, version, revision: revision() });
    run.artifacts.set(key, artifact);
    syncArtifactEdges(run, artifact);
    return { object: artifact, target: { kind, id, version }, resultingRevision: artifact.revision };
  }

  if (kind === 'page') {
    const id = asString(target?.id || target?.pageId || payload.id, makeId('page'));
    const previous = run.pages.get(id);
    if (action === 'create' && previous && !createIfMissing) throw new Error(`Page ${id} already exists.`);
    if ((action === 'patch' || action === 'replace') && previous) assertBaseRevision(previous, baseRevision);
    if ((action === 'patch' || action === 'replace') && !previous && !createIfMissing)
      throw new Error(`Page ${id} does not exist.`);
    const nextPayload =
      action === 'patch' && previous ? (deepMerge(previous, payload) as JsonRecord) : { ...payload, id };
    const page = normalizePage(run, { ...nextPayload, id, revision: revision() });
    run.pages.set(id, page);
    return { object: page, target: { kind, id, pageId: id }, resultingRevision: page.revision };
  }

  if (kind === 'evidence') {
    const id = asString(target?.id || payload.id, makeId('evidence'));
    const previous = run.evidence.get(id);
    if (action === 'create' && previous && !createIfMissing) throw new Error(`Evidence ${id} already exists.`);
    if ((action === 'patch' || action === 'replace') && previous) assertBaseRevision(previous, baseRevision);
    if ((action === 'patch' || action === 'replace') && !previous && !createIfMissing)
      throw new Error(`Evidence ${id} does not exist.`);
    const nextPayload =
      action === 'patch' && previous ? (deepMerge(previous, payload) as JsonRecord) : { ...payload, id };
    const evidence = normalizeEvidence(run, { ...nextPayload, id, revision: revision() });
    run.evidence.set(evidence.id, evidence);
    syncEvidenceEdges(run, evidence);
    return { object: evidence, target: { kind, id: evidence.id }, resultingRevision: evidence.revision };
  }

  if (kind === 'claim') {
    const id = asString(target?.id || payload.id, makeId('claim'));
    const previous = run.claims.get(id);
    if (action === 'create' && previous && !createIfMissing) throw new Error(`Claim ${id} already exists.`);
    if ((action === 'patch' || action === 'replace') && previous) assertBaseRevision(previous, baseRevision);
    if ((action === 'patch' || action === 'replace') && !previous && !createIfMissing)
      throw new Error(`Claim ${id} does not exist.`);
    const nextPayload =
      action === 'patch' && previous ? (deepMerge(previous, payload) as JsonRecord) : { ...payload, id };
    const claim = normalizeClaim(run, { ...nextPayload, id, revision: revision() });
    run.claims.set(claim.id, claim);
    syncClaimEdges(run, claim);
    return { object: claim, target: { kind, id: claim.id }, resultingRevision: claim.revision };
  }

  if (kind === 'provenance') {
    if (Array.isArray(payload.nodes)) {
      for (const item of payload.nodes) {
        if (!isRecord(item)) continue;
        const node = normalizeNode(run, item);
        run.provenance.set(node.id, node);
      }
    }
    if (Array.isArray(payload.edges)) {
      for (const item of payload.edges) {
        if (!isRecord(item)) continue;
        upsertEdge(run, normalizeEdge(run, item));
      }
    }
    if (isRecord(payload.from) || payload.fromId || payload.from_id) {
      const edge = normalizeEdge(run, payload);
      upsertEdge(run, edge);
      return { object: edge, target: { kind, id: edge.id } };
    }
    const node = normalizeNode(run, { ...payload, id: asString(target?.id || payload.id, makeId('provenance')) });
    run.provenance.set(node.id, node);
    return { object: node, target: { kind, id: node.id } };
  }

  if (kind === 'skill_use') {
    const id = asString(target?.id || payload.id, makeId('skill_use'));
    const previous = run.usedSkills.get(id);
    if (action === 'create' && previous && !createIfMissing) throw new Error(`Skill use ${id} already exists.`);
    if ((action === 'patch' || action === 'replace') && previous) assertBaseRevision(previous, baseRevision);
    if ((action === 'patch' || action === 'replace') && !previous && !createIfMissing)
      throw new Error(`Skill use ${id} does not exist.`);
    const nextPayload =
      action === 'patch' && previous ? (deepMerge(previous, payload) as JsonRecord) : { ...payload, id };
    const skillUse = normalizeSkillUse(run, { ...nextPayload, id, revision: revision() });
    run.usedSkills.set(skillUse.id, skillUse);
    return { object: skillUse, target: { kind, id: skillUse.id }, resultingRevision: skillUse.revision };
  }

  if (kind === 'annotation') {
    const id = asString(target?.id || payload.id, makeId('annotation'));
    const previous = run.annotations.get(id);
    if (previous && action !== 'create') assertBaseRevision(previous, baseRevision);
    const annotation: AnnotationRecord = {
      id,
      runId: run.runId,
      artifactId: asString(payload.artifactId || payload.artifact_id || target?.id, undefined as unknown as string),
      pageId: asString(payload.pageId || payload.page_id || target?.pageId, undefined as unknown as string),
      text: asString(payload.text || payload.comment, 'Annotation'),
      region: isRecord(payload.region) ? payload.region : undefined,
      status: (asString(payload.status, 'open') as AnnotationRecord['status']) || 'open',
      createdAt: asNumber(payload.createdAt || payload.created_at, now()),
      revision: revision(),
    };
    run.annotations.set(id, annotation);
    return { object: annotation, target: { kind, id }, resultingRevision: annotation.revision };
  }

  throw new Error(`Unsupported Science artifact kind: ${kind}`);
};

async function main() {
  const server = new McpServer({
    name: BUILTIN_SCIENCE_ARTIFACT_NAME,
    version: '1.0.0',
  });

  server.tool(
    'science_artifact',
    [
      'Single OpenScience artifact graph control surface.',
      'Use action=status/reserve_id/get/list/create/patch/replace/append/version/snapshot/publish/annotate/focus_page.',
      'Every artifact has a stable id and version; patch/replace/version of existing objects require baseRevision from get.',
      'Use snapshot to add explicit files or folders to the project-level artifact git snapshot.',
      'publish emits the structured Science panel rendered by the UI; the final publish should use displayIntent=open.',
    ].join(' '),
    {
      action: z.enum([
        'status',
        'reserve_id',
        'get',
        'list',
        'create',
        'patch',
        'replace',
        'append',
        'version',
        'snapshot',
        'publish',
        'annotate',
        'focus_page',
      ]),
      runId: z.string().optional(),
      conversationId: z.string().optional(),
      messageId: z.string().optional(),
      toolCallId: z.string().optional(),
      projectRoot: z.string().optional(),
      target: z
        .object({
          kind: z
            .enum(['run', 'report', 'artifact', 'page', 'evidence', 'claim', 'provenance', 'skill_use', 'annotation'])
            .optional(),
          id: z.string().optional(),
          version: z.number().optional(),
          pageId: z.string().optional(),
        })
        .optional(),
      baseRevision: z.string().optional(),
      createIfMissing: z.boolean().optional(),
      payload: z.record(z.unknown()).optional(),
      displayIntent: z.enum(['background', 'open', 'focus']).optional(),
      userAuthorizedClose: z.boolean().optional(),
    },
    async ({
      action,
      runId: requestedRunId,
      conversationId,
      messageId,
      toolCallId,
      projectRoot,
      target,
      baseRevision,
      createIfMissing,
      payload,
      displayIntent,
      userAuthorizedClose,
    }) => {
      const body = payload || {};
      const run = ensureRun(requestedRunId, projectRoot, body);
      applyRunContext(run, body, { conversationId, messageId, toolCallId });

      if (action === 'status') {
        return jsonText({
          schema: SCIENCE_EVENT_SCHEMA,
          action,
          runId: run.runId,
          panel: buildPanel(run),
          openRuns: [...runs.keys()],
        });
      }

      if (action === 'reserve_id') {
        const kind = (target?.kind || body.kind || 'artifact') as ScienceArtifactResourceKind;
        const id = asString(target?.id || body.id, makeId(kind));
        const evt = eventFor(
          run,
          action,
          { kind, id, version: target?.version || (kind === 'artifact' ? 1 : undefined) },
          {
            artifactIds: kind === 'artifact' ? [id] : undefined,
            pageIds: kind === 'page' ? [id] : undefined,
            evidenceIds: kind === 'evidence' ? [id] : undefined,
            claimIds: kind === 'claim' ? [id] : undefined,
          }
        );
        return jsonText({ ...evt, reserved: { kind, id, version: evt.target?.version } });
      }

      if (action === 'get') {
        const object = getResource(run, target);
        return jsonText({
          schema: SCIENCE_EVENT_SCHEMA,
          eventId: eventId(),
          runId: run.runId,
          action,
          timestamp: now(),
          target,
          object,
        });
      }

      if (action === 'list') {
        const scope = asString(body.scope, 'run');
        const projectItems = scope === 'project' ? listProjectResource(run.projectRoot, target?.kind) : undefined;
        return jsonText({
          schema: SCIENCE_EVENT_SCHEMA,
          eventId: eventId(),
          runId: run.runId,
          action,
          timestamp: now(),
          target,
          scope,
          items: projectItems || listResource(run, target?.kind),
        });
      }

      if (action === 'create' || action === 'patch' || action === 'replace') {
        const result = createOrReplaceResource(run, action, target, body, baseRevision, createIfMissing);
        const evt = eventFor(run, action, result.target, {
          baseRevision,
          resultingRevision: result.resultingRevision,
          artifactIds: result.target.kind === 'artifact' && result.target.id ? [result.target.id] : undefined,
          pageIds: result.target.kind === 'page' && result.target.id ? [result.target.id] : undefined,
          evidenceIds: result.target.kind === 'evidence' && result.target.id ? [result.target.id] : undefined,
          claimIds: result.target.kind === 'claim' && result.target.id ? [result.target.id] : undefined,
          warnings: validateGraph(run),
        });
        return jsonText({ ...evt, object: result.object });
      }

      if (action === 'append') {
        const appendTarget = target?.kind || (body.kind as ScienceArtifactResourceKind | undefined);
        if (!appendTarget) throw new Error('append requires target.kind.');
        const items = Array.isArray(body.items) ? body.items : [body];
        const created = [];
        for (const item of items) {
          if (!isRecord(item)) continue;
          const result = createOrReplaceResource(run, 'create', { kind: appendTarget }, item, undefined, true);
          created.push(result.object);
        }
        const evt = eventFor(run, action, target, { warnings: validateGraph(run) });
        return jsonText({ ...evt, items: created });
      }

      if (action === 'version') {
        if (target?.kind !== 'artifact' || !target.id)
          throw new Error('version requires target.kind="artifact" and target.id.');
        const currentVersion = target.version || 1;
        const current = run.artifacts.get(artifactKey(target.id, currentVersion));
        if (!current) throw new Error(`Artifact ${target.id}@${currentVersion} does not exist.`);
        assertBaseRevision(current, baseRevision);
        const nextVersion = asNumber(body.version, currentVersion + 1);
        const nextPayload = deepMerge(current, {
          ...body,
          id: target.id,
          version: nextVersion,
          previousArtifactId: current.id,
          previousVersion: current.version,
          versionGroupId: current.versionGroupId || current.id,
        }) as JsonRecord;
        const artifact = normalizeArtifact(run, { ...nextPayload, revision: revision() });
        run.artifacts.set(artifactKey(artifact.id, artifact.version), artifact);
        syncArtifactEdges(run, artifact);
        const evt = eventFor(
          run,
          action,
          { kind: 'artifact', id: artifact.id, version: artifact.version },
          {
            baseRevision,
            resultingRevision: artifact.revision,
            artifactIds: [artifact.id],
            warnings: validateGraph(run),
          }
        );
        return jsonText({ ...evt, object: artifact });
      }

      if (action === 'snapshot') {
        const includePaths = normalizeIncludePaths(body.includePaths || body.include_paths || body.paths);
        const evt = eventFor(
          run,
          action,
          target,
          {
            warnings: validateGraph(run),
            snapshot: {
              includePaths,
            },
          },
          includePaths
        );
        return jsonText({
          ...evt,
          displayIntent: displayIntent || 'background',
          message:
            includePaths.length > 0
              ? `Recorded ${includePaths.length} explicit include path(s) in the project artifact git snapshot.`
              : 'Recorded a project artifact git snapshot.',
        });
      }

      if (action === 'annotate') {
        const annotationPayload = {
          ...body,
          artifactId:
            asString(body.artifactId || body.artifact_id, undefined as unknown as string) ||
            (target?.kind === 'artifact' ? target.id : undefined),
          pageId:
            asString(body.pageId || body.page_id, undefined as unknown as string) ||
            (target?.kind === 'page' ? target.pageId || target.id : target?.pageId),
        };
        const result = createOrReplaceResource(
          run,
          'create',
          {
            kind: 'annotation',
            id: target?.kind === 'annotation' ? target.id : asString(body.id, undefined as unknown as string),
            pageId: annotationPayload.pageId,
          },
          annotationPayload,
          undefined,
          true
        );
        const annotation = result.object as AnnotationRecord;
        if (annotation.artifactId) {
          upsertEdge(run, {
            id: `edge_${annotation.id}_${annotation.artifactId}`,
            runId: run.runId,
            from: { kind: 'message', id: annotation.id },
            to: { kind: 'artifact', id: annotation.artifactId },
            type: 'annotates',
            confidence: 'declared',
            createdAt: now(),
          });
        }
        const evt = eventFor(run, action, result.target, {
          resultingRevision: result.resultingRevision,
          artifactIds: annotation.artifactId ? [annotation.artifactId] : undefined,
          pageIds: annotation.pageId ? [annotation.pageId] : undefined,
        });
        return jsonText({ ...evt, object: annotation });
      }

      if (action === 'focus_page') {
        const pageIds =
          target?.pageId || target?.id
            ? [target.pageId || target.id || '']
            : asArray(body.pageIds || body.page_ids).filter((item): item is string => typeof item === 'string');
        const panel = buildPanel(run);
        const evt = eventFor(
          run,
          action,
          { kind: 'page', id: pageIds[0], pageId: pageIds[0] },
          {
            pageIds,
            warnings:
              userAuthorizedClose !== true && asString(body.closePageId || body.close_page_id)
                ? [
                    {
                      id: `warn_close_not_authorized_${Date.now()}`,
                      runId: run.runId,
                      severity: 'warning',
                      code: 'broken_reference',
                      message:
                        'The agent requested a page close without userAuthorizedClose=true; UI should ignore close-like behavior.',
                      createdAt: now(),
                    },
                  ]
                : undefined,
          }
        );
        return jsonText({ ...evt, panel, displayIntent: displayIntent || 'focus' });
      }

      if (action === 'publish') {
        if (body.question) run.question = asString(body.question, run.question);
        if (body.summary) run.summary = asString(body.summary, run.summary as string);
        if (body.status) run.status = (asString(body.status, run.status) as SciencePanelData['status']) || run.status;
        if (isRecord(body.report)) run.report = body.report as SciencePanelData['report'];
        if (isRecord(body.stats)) run.statsPatch = body.stats as Partial<SciencePanelData['stats']>;
        const panel = buildPanel(run);
        const evt = eventFor(run, action, target, {
          panel,
          artifactIds: panel.artifacts.map((item) => item.id),
          pageIds: panel.pages?.map((item) => item.id),
          evidenceIds: panel.evidence.map((item) => item.id),
          claimIds: panel.claims?.map((item) => item.id),
          provenanceNodeIds: panel.provenance.map((item) => item.id),
          warnings: panel.graphWarnings,
        });
        return jsonText({ ...evt, displayIntent: displayIntent || 'open' });
      }

      throw new Error(`Unsupported science_artifact action: ${action}`);
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[ScienceArtifactMCP] Fatal error:', error);
  process.exit(1);
});
