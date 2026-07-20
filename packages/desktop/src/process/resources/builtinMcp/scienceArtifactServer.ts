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
  isRecognizedSciencePanelStatus,
  normalizeSciencePanelStatus,
  type BioBlocker,
  type BioNextAction,
  type BioStatisticsCompletionReceipt,
  type MethodAlignmentReceipt,
  type OmicsAnalysisReceipt,
  type ReproductionCompletionReceipt,
  type ReproductionExecutionReceipt,
  type ReproductionExecutionReceiptV2,
  type ScienceArtifact,
  type ScienceArtifactAction,
  type ScienceAttachmentRef,
  type ScienceArtifactEvent,
  type ScienceArtifactGitRef,
  type ScienceArtifactPage,
  type ScienceArtifactResourceKind,
  type ScienceArtifactSnapshotIncludePath,
  type ScienceClaim,
  type ScienceCoverageItem,
  type ScienceCoverageSummary,
  type ScienceDeliveryStatus,
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
import {
  authorizeScienceArtifactExternalFile,
  resolveScienceArtifactWorkspace,
  type ScienceArtifactAuthorizationGatewayResult,
} from '@/process/services/scienceArtifactAuthorization';
import { BUILTIN_SCIENCE_ARTIFACT_NAME } from './constants';
import { stageArtifactRequirements, stageOutputRelativePath } from './bio/analysis/contracts';
import { FREE_EXPLORATION_MODULE_PLAN } from './bio/catalog';
import { readReceipt } from './bio/receipts';

type JsonRecord = Record<string, unknown>;
type ExecutionReceipt = ReproductionExecutionReceipt | ReproductionExecutionReceiptV2;
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
  workflowKind?: SciencePanelData['workflowKind'];
  workflowPhase?: SciencePanelData['workflowPhase'];
  planningCompletion?: SciencePanelData['planningCompletion'];
  executionReadiness?: SciencePanelData['executionReadiness'];
  completionReceipt?: ReproductionCompletionReceipt;
  executionReceipt?: ExecutionReceipt;
  statisticalCompletionReceipt?: BioStatisticsCompletionReceipt;
  methodAlignmentReceipt?: MethodAlignmentReceipt;
  analysisReceipt?: OmicsAnalysisReceipt;
  analysisId?: string;
  analysisStage?: OmicsAnalysisReceipt['stage'];
  analysisCheckpointStatus?: string;
  baselineReceiptId?: string;
  nextActions: BioNextAction[];
  externalBlockers: BioBlocker[];
  annotations: Map<string, AnnotationRecord>;
  events: ScienceArtifactEvent[];
  git?: ScienceArtifactGitRef;
  createdAt: number;
  updatedAt: number;
};

const runs = new Map<string, ScienceRunState>();
const authorizedExternalFiles = new Map<string, { authorizedAt: number; requestId: string }>();

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
const configuredSessionId = (): string => process.env[SCIENCE_ARTIFACT_ENV_KEYS.sessionId]?.trim() || 'science-session';

const assertAuthorizedProjectRoot = (projectRoot?: string): string => {
  const resolution = resolveScienceArtifactWorkspace(process.env[SCIENCE_ARTIFACT_ENV_KEYS.workspaceRoot], projectRoot);
  if (resolution.ok === false) throw new Error(`${resolution.code}: ${resolution.message}`);
  return resolution.workspaceRoot;
};

const callUserInputGateway = async (payload: unknown): Promise<ScienceArtifactAuthorizationGatewayResult> => {
  const url = process.env.DEEPORGANISER_USER_INPUT_URL;
  const token = process.env.DEEPORGANISER_USER_INPUT_TOKEN;
  if (!url || !token) throw new Error('external_file_authorization_unavailable: User input gateway is unavailable.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`external_file_authorization_unavailable: Gateway failed (${response.status}).`);
  return (await response.json()) as ScienceArtifactAuthorizationGatewayResult;
};

const authorizeExternalFile = async (candidate: string, conversationId?: string): Promise<JsonRecord> => {
  const workspaceRoot = assertAuthorizedProjectRoot();
  const result = await authorizeScienceArtifactExternalFile({
    workspaceRoot,
    candidate,
    conversationId,
    sessionId: configuredSessionId(),
    requestAuthorization: callUserInputGateway,
    now,
  });
  if (result.status === 'authorized' && 'authorizedAt' in result && result.normalizedPath) {
    authorizedExternalFiles.set(result.normalizedPath, {
      authorizedAt: result.authorizedAt,
      requestId: result.requestId,
    });
  }
  return result;
};

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

const isInsidePath = (root: string, candidate: string): boolean => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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
  const authorizedProjectRoot = assertAuthorizedProjectRoot(projectRoot);
  const id = requestedRunId || asString(payload?.runId) || runId();
  const existing = runs.get(id);
  if (existing) {
    if (!existing.projectRoot) existing.projectRoot = authorizedProjectRoot;
    ensureScienceProject(authorizedProjectRoot);
    existing.updatedAt = now();
    return existing;
  }
  const hydrated = hydrateRun(id, authorizedProjectRoot);
  if (hydrated) {
    runs.set(id, hydrated);
    return hydrated;
  }
  const created: ScienceRunState = {
    runId: id,
    conversationId: asString(contextValue(payload, 'conversationId'), undefined as unknown as string),
    messageId: asString(contextValue(payload, 'messageId'), undefined as unknown as string),
    toolCallId: asString(contextValue(payload, 'toolCallId'), undefined as unknown as string),
    projectRoot: authorizedProjectRoot,
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
    workflowKind:
      payload?.workflowKind === 'omics_reproduction' || payload?.workflow_kind === 'omics_reproduction'
        ? 'omics_reproduction'
        : payload?.workflowKind === 'omics_analysis' || payload?.workflow_kind === 'omics_analysis'
          ? 'omics_analysis'
          : undefined,
    workflowPhase:
      payload?.workflowKind === 'omics_reproduction' || payload?.workflow_kind === 'omics_reproduction'
        ? payload?.workflowPhase === 'execution' || payload?.workflow_phase === 'execution'
          ? 'execution'
          : 'planning'
        : payload?.workflowKind === 'omics_analysis' || payload?.workflow_kind === 'omics_analysis'
          ? (asString(payload?.workflowPhase || payload?.workflow_phase, 'intake') as SciencePanelData['workflowPhase'])
          : undefined,
    nextActions: [],
    externalBlockers: [],
    annotations: new Map(),
    events: [],
    createdAt: now(),
    updatedAt: now(),
  };
  ensureScienceProject(authorizedProjectRoot);
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
    workflowKind:
      state.workflowKind === 'omics_reproduction' || panel.workflowKind === 'omics_reproduction'
        ? 'omics_reproduction'
        : state.workflowKind === 'omics_analysis' || panel.workflowKind === 'omics_analysis'
          ? 'omics_analysis'
          : undefined,
    workflowPhase:
      state.workflowKind === 'omics_reproduction' || panel.workflowKind === 'omics_reproduction'
        ? state.workflowPhase === 'execution' || panel.workflowPhase === 'execution'
          ? 'execution'
          : 'planning'
        : state.workflowKind === 'omics_analysis' || panel.workflowKind === 'omics_analysis'
          ? ((state.workflowPhase || panel.workflowPhase || 'intake') as SciencePanelData['workflowPhase'])
          : undefined,
    planningCompletion:
      state.planningCompletion === 'complete' || state.planningCompletion === 'incomplete'
        ? state.planningCompletion
        : panel.planningCompletion,
    executionReadiness:
      state.executionReadiness === 'ready' ||
      state.executionReadiness === 'partial' ||
      state.executionReadiness === 'blocked'
        ? state.executionReadiness
        : panel.executionReadiness,
    completionReceipt: isRecord(state.completionReceipt)
      ? (state.completionReceipt as unknown as ReproductionCompletionReceipt)
      : panel.completionReceipt,
    executionReceipt: isRecord(state.executionReceipt)
      ? (state.executionReceipt as unknown as ExecutionReceipt)
      : panel.executionReceipt,
    statisticalCompletionReceipt: isRecord(state.statisticalCompletionReceipt)
      ? (state.statisticalCompletionReceipt as unknown as BioStatisticsCompletionReceipt)
      : panel.statisticalCompletionReceipt,
    methodAlignmentReceipt: isRecord(state.methodAlignmentReceipt)
      ? (state.methodAlignmentReceipt as unknown as MethodAlignmentReceipt)
      : panel.methodAlignmentReceipt,
    analysisReceipt: isRecord(state.analysisReceipt)
      ? (state.analysisReceipt as unknown as OmicsAnalysisReceipt)
      : panel.analysisReceipt,
    analysisId: asString(state.analysisId || panel.analysisId, undefined as unknown as string),
    analysisStage: asString(
      state.analysisStage || panel.analysisStage,
      undefined as unknown as string
    ) as OmicsAnalysisReceipt['stage'],
    analysisCheckpointStatus: asString(
      state.analysisCheckpointStatus || panel.analysisCheckpointStatus,
      undefined as unknown as string
    ),
    baselineReceiptId: asString(state.baselineReceiptId || panel.baselineReceiptId, undefined as unknown as string),
    nextActions: Array.isArray(state.nextActions)
      ? (state.nextActions as unknown as BioNextAction[])
      : panel.nextActions || [],
    externalBlockers: Array.isArray(state.externalBlockers)
      ? (state.externalBlockers as unknown as BioBlocker[])
      : panel.externalBlockers || [],
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
    const referencedPaths = [
      { role: 'primary', path: artifact.primaryPath },
      { role: 'preview', path: artifact.previewPath },
      { role: 'thumbnail', path: artifact.thumbnailPath },
      { role: 'code', path: artifact.code?.path },
      { role: 'execution_log', path: artifact.execution?.logPath },
      ...(artifact.outputPaths || []).map((candidate) => ({ role: 'output', path: candidate })),
    ].filter((item): item is { role: string; path: string } => Boolean(item.path));
    for (const reference of referencedPaths) {
      if (!run.projectRoot) continue;
      const resolved = normalizeRelativePath(reference.path, run.projectRoot);
      const projectLocal = isInsidePath(run.projectRoot, resolved);
      const localFileAvailable = projectLocal && fs.existsSync(resolved);
      const snapshotAvailable = (run.git?.files || []).some((file) => {
        const sameArtifact = file.artifactId === artifact.id && (!file.role || file.role === reference.role);
        const samePath =
          file.path === reference.path ||
          file.relativePath === reference.path ||
          normalizeRelativePath(file.path, run.projectRoot) === resolved ||
          (file.relativePath ? normalizeRelativePath(file.relativePath, run.projectRoot) === resolved : false);
        return (
          sameArtifact &&
          samePath &&
          file.mode === 'copied' &&
          Boolean(file.storedPath) &&
          file.reason !== 'external_path_not_authorized'
        );
      });
      if (!localFileAvailable && !snapshotAvailable) {
        warnings.push({
          id: `warn_unopenable_artifact_${artifact.id}_${artifact.version}_${reference.role}`,
          runId: run.runId,
          severity: 'error',
          code: 'unopenable_artifact',
          message: `Artifact ${artifact.id} v${artifact.version} declares ${reference.role} path ${reference.path}, but the file is not available inside the project root or artifact snapshot.`,
          target: { kind: 'artifact', id: artifact.id, version: artifact.version },
          blocking: true,
          createdAt: now(),
        });
      }
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
    return artifacts.map((artifact) =>
      ['figure', 'html', 'pdf', 'latex', 'table', 'regression_table', 'notebook'].includes(artifact.type)
        ? ({ type: 'artifact_embed', artifactId: artifact.id } satisfies ScienceReportBlock)
        : ({ type: 'artifact_ref', artifactId: artifact.id } satisfies ScienceReportBlock)
    );
  }
  return [{ type: 'paragraph', text: run.summary || 'Science artifact run is being assembled.' }];
};

const deliveryStatus = (
  run: ScienceRunState,
  state: ScienceDeliveryStatus['state'],
  reasonCodes: string[]
): ScienceDeliveryStatus => {
  const phase =
    run.workflowKind === 'omics_reproduction'
      ? run.workflowPhase || 'planning'
      : run.workflowKind === 'omics_analysis'
        ? run.analysisStage || 'intake'
        : 'general';
  const rejected =
    run.graphWarnings.has('warn_reproduction_completion_required') ||
    run.nextActions.some((action) => action.id === 'correct-science-publication-status');
  return {
    state,
    phase,
    authoritativeLabel: `${phase}.${state}`,
    reasonCodes: [...new Set(reasonCodes)],
    publicationDisposition: rejected
      ? 'rejected'
      : state === 'running' || state === 'action_required'
        ? 'pending'
        : 'accepted',
  };
};

const deriveDeliveryState = (run: ScienceRunState): ScienceDeliveryStatus => {
  const nextActionReasons = run.nextActions.map((action) => `next_action:${action.id}`);
  const blockerReasons = run.externalBlockers.map((blocker) => `external_blocker:${blocker.id}`);
  if (run.nextActions.length) return deliveryStatus(run, 'action_required', [...nextActionReasons, ...blockerReasons]);

  if (run.workflowKind === 'omics_reproduction' && run.workflowPhase === 'execution') {
    const receipt = run.executionReceipt;
    if (!receipt) return deliveryStatus(run, 'running', ['execution_receipt:missing']);
    const reasons = [
      `receipt_status:${receipt.status}`,
      `execution_completion:${receipt.executionCompletion}`,
      `scientific_outcome:${receipt.scientificOutcome}`,
      ...blockerReasons,
    ];
    if (receipt.scientificOutcome === 'externally_blocked' || receipt.status === 'blocked') {
      return deliveryStatus(run, 'blocked', reasons);
    }
    if (receipt.status === 'ready' && receipt.executionCompletion === 'complete') {
      return deliveryStatus(run, receipt.scientificOutcome === 'validated' ? 'completed' : 'partial', reasons);
    }
    if (['failed', 'error', 'invalid'].includes(receipt.status)) return deliveryStatus(run, 'failed', reasons);
    return deliveryStatus(run, 'running', reasons);
  }

  if (run.workflowKind === 'omics_reproduction') {
    const receipt = run.completionReceipt;
    if (!receipt) return deliveryStatus(run, 'running', ['planning_receipt:missing']);
    const reasons = [
      `receipt_status:${receipt.status}`,
      `planning_completion:${receipt.planningCompletion}`,
      `execution_readiness:${receipt.executionReadiness}`,
      ...blockerReasons,
    ];
    if (receipt.status === 'ready' && receipt.planningCompletion === 'complete') {
      return deliveryStatus(run, 'completed', reasons);
    }
    if (receipt.status === 'blocked') return deliveryStatus(run, 'blocked', reasons);
    if (['failed', 'error', 'invalid'].includes(receipt.status)) return deliveryStatus(run, 'failed', reasons);
    return deliveryStatus(run, 'running', reasons);
  }

  if (run.workflowKind === 'omics_analysis') {
    const receipt = run.analysisReceipt;
    if (!receipt) return deliveryStatus(run, 'running', ['analysis_receipt:missing']);
    const graphBlockers = validateGraph(run).filter((warning) => warning.blocking);
    if (graphBlockers.length) {
      return deliveryStatus(run, 'action_required', [
        ...graphBlockers.map((warning) => `graph_warning:${warning.code}`),
        ...blockerReasons,
      ]);
    }
    const reasons = [
      `receipt_status:${receipt.status}`,
      `stage:${receipt.stage}`,
      `stage_status:${receipt.stageStatus}`,
      `project_status:${receipt.projectStatus}`,
      ...blockerReasons,
    ];
    if (receipt.stageStatus === 'awaiting_user') return deliveryStatus(run, 'awaiting_user', reasons);
    if (receipt.stageStatus === 'needs_revision') return deliveryStatus(run, 'action_required', reasons);
    if (receipt.stageStatus === 'blocked' || receipt.projectStatus === 'blocked')
      return deliveryStatus(run, 'blocked', reasons);
    if (receipt.action === 'close_analysis' && receipt.projectStatus === 'closed') {
      return deliveryStatus(run, 'completed', reasons);
    }
    if (receipt.stage === 'exploration' && receipt.stageStatus === 'accepted' && receipt.projectStatus === 'accepted') {
      return deliveryStatus(run, 'completed', reasons);
    }
    return deliveryStatus(run, 'running', reasons);
  }

  const state = run.status === 'draft' ? 'running' : run.status;
  return deliveryStatus(run, state, [`panel_status:${run.status}`]);
};

const reproductionModeFor = (run: ScienceRunState): ScienceCoverageItem['reproductionMode'] => {
  if (run.methodAlignmentReceipt?.alignmentLevel === 'parameter_aligned') return 'exact';
  if (run.methodAlignmentReceipt?.alignmentLevel === 'partially_aligned') return 'analogous';
  return 'scoped_reimplementation';
};

const artifactIdsForPaths = (run: ScienceRunState, paths: string[]): string[] => {
  const normalizedPaths = new Set(paths.map((candidate) => normalizeRelativePath(candidate, run.projectRoot)));
  const ids = new Set<string>();
  for (const artifact of run.artifacts.values()) {
    const artifactPaths = [
      artifact.primaryPath,
      artifact.previewPath,
      artifact.thumbnailPath,
      ...(artifact.outputPaths || []),
    ]
      .filter((candidate): candidate is string => Boolean(candidate))
      .map((candidate) => normalizeRelativePath(candidate, run.projectRoot));
    if (artifactPaths.some((candidate) => normalizedPaths.has(candidate))) ids.add(artifact.id);
  }
  return [...ids];
};

const analysisWorkflowModules = (receipt?: OmicsAnalysisReceipt): JsonRecord[] => {
  const modules = receipt?.summary?.workflowModules;
  return Array.isArray(modules) ? modules.filter(isRecord) : [];
};

const deriveCoverageItems = (run: ScienceRunState): ScienceCoverageItem[] => {
  const receipt = run.executionReceipt;
  if (receipt && 'coverageItems' in receipt && Array.isArray(receipt.coverageItems))
    return clone(receipt.coverageItems);
  if (receipt) {
    const reproductionMode = reproductionModeFor(run);
    return receipt.modules.map((module): ScienceCoverageItem => {
      const status: ScienceCoverageItem['status'] =
        module.status === 'validated'
          ? 'completed'
          : module.status === 'scientifically_limited'
            ? 'scientifically_blocked'
            : module.status === 'externally_blocked'
              ? 'external_data_block'
              : module.status === 'not_requested'
                ? 'excluded_by_user'
                : module.status === 'generated_unvalidated'
                  ? 'conditional'
                  : 'unresolved';
      const artifactIds = artifactIdsForPaths(
        run,
        module.outputFiles.map((file) => file.path)
      );
      return {
        id: `coverage-${module.id}`,
        targetType: 'user_objective',
        targetId: module.id,
        moduleIds: [module.id],
        cohortIds: [],
        reproductionMode,
        status,
        reason: module.limitations.join(' ') || module.status,
        artifactIds,
        evidenceIds: artifactIds.flatMap(
          (artifactId) => [...run.artifacts.values()].find((artifact) => artifact.id === artifactId)?.evidenceIds || []
        ),
        receiptIds: [receipt.receiptId, ...module.validationReceiptIds],
      };
    });
  }

  if (run.workflowKind === 'omics_analysis' && run.analysisReceipt) {
    return analysisWorkflowModules(run.analysisReceipt).map((module): ScienceCoverageItem => {
      const moduleId = asString(module.moduleId, 'unknown_module');
      const status = asString(module.status);
      const outputs = asArray(module.outputs)
        .map((item) => asString(item))
        .filter(Boolean);
      const artifactIds = artifactIdsForPaths(run, outputs);
      return {
        id: `coverage-${moduleId}`,
        targetType: 'user_objective',
        targetId: moduleId,
        moduleIds: [moduleId],
        cohortIds: [],
        reproductionMode: 'scoped_reimplementation',
        status:
          status === 'completed'
            ? 'completed'
            : status === 'blocked'
              ? 'scientifically_blocked'
              : 'conditional',
        reason: asString(module.blockerReason, status || 'module declared in exploration workflow'),
        artifactIds,
        evidenceIds: artifactIds.flatMap(
          (artifactId) => [...run.artifacts.values()].find((artifact) => artifact.id === artifactId)?.evidenceIds || []
        ),
        receiptIds: [run.analysisReceipt.receiptId],
      };
    });
  }

  if (!run.completionReceipt) return [];
  return run.completionReceipt.moduleReadiness.map(
    (module): ScienceCoverageItem => ({
      id: `coverage-${module.id}`,
      targetType: 'user_objective',
      targetId: module.id,
      moduleIds: [module.id],
      cohortIds: [],
      reproductionMode: 'scoped_reimplementation',
      status:
        module.executionStatus === 'ready'
          ? 'ready'
          : module.executionStatus === 'conditional'
            ? 'conditional'
            : 'external_data_block',
      reason: module.blockingReasons.join(' ') || module.declaredStatus,
      artifactIds: [],
      evidenceIds: [],
      receiptIds: [run.completionReceipt?.receiptId || ''].filter(Boolean),
    })
  );
};

const summarizeCoverage = (items: ScienceCoverageItem[]): ScienceCoverageSummary => ({
  total: items.length,
  completed: items.filter((item) => item.status === 'completed').length,
  exact: items.filter((item) => item.reproductionMode === 'exact').length,
  analogous: items.filter((item) => item.reproductionMode === 'analogous').length,
  scoped: items.filter((item) => item.reproductionMode === 'scoped_reimplementation').length,
  actionRequired: items.filter((item) => ['required', 'conditional', 'unresolved'].includes(item.status)).length,
  externalBlocked: items.filter((item) => ['external_data_block', 'capability_block'].includes(item.status)).length,
  excluded: items.filter((item) => item.status === 'excluded_by_user').length,
});

const attachmentUri = (
  runIdValue: string,
  artifactId: string,
  version: number,
  role: string,
  contentHash: string
): string =>
  `openscience-attachment://${encodeURIComponent(runIdValue)}/${encodeURIComponent(artifactId)}/${version}/${encodeURIComponent(role)}/${contentHash}`;

const deriveAttachments = (panel: SciencePanelData, git: ScienceArtifactGitRef | undefined): ScienceAttachmentRef[] =>
  (git?.files || [])
    .filter(
      (file): file is typeof file & { artifactId: string; storedPath: string; sha256: string } =>
        file.mode === 'copied' && Boolean(file.artifactId && file.storedPath && file.sha256)
    )
    .map((file) => {
      const artifact = panel.artifacts.find((candidate) => candidate.id === file.artifactId);
      const version = file.artifactVersion || artifact?.version || 1;
      return {
        uri: attachmentUri(panel.runId, file.artifactId, version, file.role || 'other', file.sha256),
        artifactId: file.artifactId,
        version,
        role: file.role || 'other',
        contentHash: file.sha256,
        sourcePath: file.relativePath || file.path,
        status:
          artifact?.contentHash && file.role === 'primary' && artifact.contentHash !== file.sha256
            ? 'modified'
            : 'ready',
      } satisfies ScienceAttachmentRef;
    });

const applyArtifactDeliveryWarnings = (
  artifacts: ScienceArtifact[],
  warnings: ScienceGraphWarning[]
): ScienceArtifact[] => {
  const blocked = new Set(
    warnings
      .filter((warning) => warning.code === 'unopenable_artifact' && warning.target?.kind === 'artifact')
      .map((warning) => warning.target?.id)
      .filter((id): id is string => Boolean(id))
  );
  if (!blocked.size) return artifacts;
  return artifacts.map((artifact) =>
    blocked.has(artifact.id) && artifact.status !== 'missing' ? { ...artifact, status: 'missing' } : artifact
  );
};

const buildPanel = (run: ScienceRunState): SciencePanelData => {
  const rawArtifacts = [...run.artifacts.values()];
  const evidence = [...run.evidence.values()];
  const claims = [...run.claims.values()];
  const warnings = validateGraph(run);
  const artifacts = applyArtifactDeliveryWarnings(rawArtifacts, warnings);
  const deliveryState = deriveDeliveryState(run);
  const panelStatus = deliveryState.state === 'action_required' && run.status === 'completed' ? 'partial' : run.status;
  const stats = {
    searches:
      run.statsPatch?.searches || evidence.filter((item) => item.sourceType === 'paper' || item.database).length,
    artifacts: artifacts.length,
    evidence: evidence.length,
    commands:
      run.statsPatch?.commands ||
      artifacts.filter((item) => item.execution?.command || item.execution?.scriptPath).length,
    validations:
      run.statsPatch?.validations ||
      evidence.filter((item) => item.sourceType === 'validation_result').length +
        (run.completionReceipt
          ? 1 + run.completionReceipt.sourceReceiptIds.length + run.completionReceipt.runtimeReceiptIds.length
          : 0) +
        (run.executionReceipt
          ? 1 + new Set(run.executionReceipt.modules.flatMap((module) => module.validationReceiptIds)).size
          : 0),
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
  const coverageItems = deriveCoverageItems(run);

  const panel: SciencePanelData = {
    schema: SCIENCE_PANEL_SCHEMA,
    runId: run.runId,
    conversationId: run.conversationId,
    projectRoot: run.projectRoot,
    question: run.question,
    generatedAt: now(),
    summary: run.summary,
    status: panelStatus,
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
    workflowKind: run.workflowKind,
    workflowPhase: run.workflowPhase,
    planningCompletion: run.planningCompletion,
    executionReadiness: run.executionReadiness,
    completionReceipt: run.completionReceipt,
    executionReceipt: run.executionReceipt,
    statisticalCompletionReceipt: run.statisticalCompletionReceipt,
    deliveryState,
    coverageSummary: summarizeCoverage(coverageItems),
    coverageItems,
    methodAlignmentReceipt: run.methodAlignmentReceipt,
    analysisReceipt: run.analysisReceipt,
    analysisId: run.analysisId,
    analysisStage: run.analysisStage,
    analysisCheckpointStatus: run.analysisCheckpointStatus as SciencePanelData['analysisCheckpointStatus'],
    baselineReceiptId: run.baselineReceiptId,
    nextActions: run.nextActions,
    externalBlockers: run.externalBlockers,
    methods: {
      commands: artifacts.map((item) => item.execution?.command).filter((item): item is string => Boolean(item)),
      environmentSummary:
        run.executionReceipt?.modules
          .filter((item) => item.required)
          .map((item) => `${item.id}: ${item.status}`)
          .join(', ') ||
        run.completionReceipt?.moduleReadiness
          .map((item) => `${item.environmentRef}: ${item.executionStatus}`)
          .join(', ') ||
        analysisWorkflowModules(run.analysisReceipt)
          .map((item) => `${asString(item.moduleId)}: ${asString(item.environmentRef, 'control-plane')}`)
          .join(', ') ||
        artifacts
          .map((item) => item.environment?.kind)
          .filter(Boolean)
          .join(', '),
      limitations: [
        ...warnings.filter((item) => item.severity !== 'info').map((item) => item.message),
        ...run.externalBlockers.map((item) => item.message),
      ],
    },
    git: run.git,
  };
  panel.attachments = deriveAttachments(panel, run.git);
  return panel;
};

const completionReceiptFrom = (value: unknown): ReproductionCompletionReceipt | undefined => {
  if (!isRecord(value)) return undefined;
  if (
    value.schema !== 'openbioscience.bio.receipt.v1' ||
    value.producer !== 'bio_reproduction' ||
    value.action !== 'validate_reproduction_plan' ||
    value.workflowKind !== 'omics_reproduction' ||
    !Array.isArray(value.canonicalFiles) ||
    !Array.isArray(value.skillUses) ||
    !Array.isArray(value.moduleReadiness) ||
    typeof value.methodParameterReceiptId !== 'string' ||
    !Array.isArray(value.methodModuleCoverage) ||
    !Array.isArray(value.eligibleClaims) ||
    !Array.isArray(value.nextActions) ||
    !Array.isArray(value.externalBlockers)
  ) {
    return undefined;
  }
  return value as unknown as ReproductionCompletionReceipt;
};

const analysisReceiptFrom = (value: unknown): OmicsAnalysisReceipt | undefined => {
  if (!isRecord(value)) return undefined;
  if (
    value.schema !== 'openbioscience.bio.receipt.v1' ||
    value.producer !== 'bio_analysis' ||
    value.workflowKind !== 'omics_analysis' ||
    typeof value.analysisId !== 'string' ||
    !['intake', 'qc', 'baseline', 'exploration', 'episode', 'closing'].includes(asString(value.stage)) ||
    !['running', 'awaiting_user', 'accepted', 'needs_revision', 'blocked'].includes(asString(value.stageStatus)) ||
    !Array.isArray(value.canonicalFiles) ||
    !Array.isArray(value.skillUses) ||
    !Array.isArray(value.nextActions) ||
    !Array.isArray(value.externalBlockers)
  ) {
    return undefined;
  }
  return value as unknown as OmicsAnalysisReceipt;
};

const receiptById = <T>(
  projectRoot: string,
  receiptId: string,
  parser: (value: unknown) => T | undefined
): T | undefined => {
  if (!receiptId) return undefined;
  try {
    return parser(readReceipt(projectRoot, receiptId));
  } catch {
    return undefined;
  }
};

const statisticalCompletionReceiptFrom = (value: unknown): BioStatisticsCompletionReceipt | undefined => {
  if (!isRecord(value)) return undefined;
  if (
    value.schema !== 'openbioscience.bio.receipt.v1' ||
    value.producer !== 'bio_statistics' ||
    value.action !== 'validate_de_outputs' ||
    value.workflowKind !== 'omics_reproduction' ||
    value.workflowPhase !== 'execution' ||
    !Array.isArray(value.canonicalFiles) ||
    !Array.isArray(value.contrasts) ||
    !Array.isArray(value.skillUses) ||
    !Array.isArray(value.mcpActions) ||
    !Array.isArray(value.nextActions) ||
    !Array.isArray(value.externalBlockers)
  ) {
    return undefined;
  }
  return value as unknown as BioStatisticsCompletionReceipt;
};

const methodAlignmentReceiptFrom = (value: unknown): MethodAlignmentReceipt | undefined => {
  if (!isRecord(value)) return undefined;
  if (
    value.schema !== 'openbioscience.bio.receipt.v1' ||
    value.producer !== 'bio_reproduction' ||
    value.action !== 'validate_method_alignment' ||
    typeof value.methodParameterReceiptId !== 'string' ||
    !['parameter_aligned', 'partially_aligned', 'scoped_reimplementation', 'unresolved_conflict'].includes(
      String(value.alignmentLevel)
    ) ||
    !isRecord(value.executedParameterFile) ||
    !Array.isArray(value.scriptFiles) ||
    !Array.isArray(value.alignedParameters) ||
    !Array.isArray(value.substitutedParameters) ||
    !Array.isArray(value.conflicts) ||
    !Array.isArray(value.eligibleClaims) ||
    !Array.isArray(value.nextActions)
  ) {
    return undefined;
  }
  return value as unknown as MethodAlignmentReceipt;
};

const executionCanonicalFileSchema = z.object({ path: z.string().min(1), contentHash: z.string().min(1) });
const executionModuleResultSchema = z.object({
  id: z.enum([
    'data_import',
    'quality_control',
    'normalization',
    'clustering',
    'major_annotation',
    'minor_annotation',
    'cluster_markers',
    'composition',
    'condition_de',
    'descriptive_statistics',
    'figures',
    'disease_program',
  ]),
  required: z.boolean(),
  status: z.enum([
    'validated',
    'generated_unvalidated',
    'scientifically_limited',
    'externally_blocked',
    'incomplete',
    'not_requested',
  ]),
  outputFiles: z.array(executionCanonicalFileSchema),
  validationReceiptIds: z.array(z.string()),
  qcOutcome: z.enum(['filtered', 'passed_no_removal', 'failed']).optional(),
  annotationMode: z.enum(['independent_annotation', 'reference_review', 'label_transfer']).optional(),
  limitations: z.array(z.string()),
});
const executionModuleResultV2Schema = z.object({
  id: z.string().min(1),
  required: z.boolean(),
  status: z.enum([
    'validated',
    'generated_unvalidated',
    'scientifically_limited',
    'externally_blocked',
    'incomplete',
    'not_requested',
  ]),
  targetIds: z.array(z.string()),
  outputFiles: z.array(executionCanonicalFileSchema),
  validationReceiptIds: z.array(z.string()),
  limitations: z.array(z.string()),
});
const coverageItemSchema = z
  .object({
    id: z.string().min(1),
    targetType: z.enum(['user_objective', 'paper_figure', 'paper_panel', 'paper_claim']),
    targetId: z.string().min(1),
    moduleIds: z.array(z.string()),
    cohortIds: z.array(z.string()),
    reproductionMode: z.enum(['exact', 'analogous', 'scoped_reimplementation']),
    status: z.enum([
      'required',
      'ready',
      'conditional',
      'external_data_block',
      'capability_block',
      'analogous_only',
      'excluded_by_user',
      'unresolved',
      'completed',
      'scientifically_blocked',
    ]),
    reason: z.string(),
    artifactIds: z.array(z.string()),
    evidenceIds: z.array(z.string()),
    receiptIds: z.array(z.string()),
  })
  .passthrough();
const executionSkillUseSchema = z
  .object({
    id: z.string().min(1),
    skillId: z.string().min(1),
    skillName: z.string().min(1),
    source: z.string().min(1),
    purpose: z.string().min(1),
    status: z.string().min(1),
    triggeredBy: z.string().min(1),
    createdAt: z.number(),
  })
  .passthrough();
const executionBlockerSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['credentials', 'permissions', 'data', 'environment', 'contract']),
  message: z.string().min(1),
  moduleId: z.string().optional(),
  external: z.boolean(),
});
const reproductionExecutionReceiptSchema = z
  .object({
    schema: z.literal('openbioscience.bio.receipt.v1'),
    receiptId: z.string().min(1),
    producer: z.literal('bio_reproduction'),
    action: z.literal('complete_execution'),
    status: z.string().min(1),
    projectRoot: z.string().min(1),
    createdAt: z.number(),
    workflowKind: z.literal('omics_reproduction'),
    workflowPhase: z.literal('execution'),
    modality: z.literal('scrna_seq'),
    executionCompletion: z.enum(['complete', 'incomplete']),
    scientificOutcome: z.enum(['validated', 'validated_with_limits', 'externally_blocked']),
    executionContractFile: executionCanonicalFileSchema,
    executionContractReceiptId: z.string().min(1),
    planningReceiptId: z.string().min(1),
    methodAlignmentReceiptId: z.string().min(1),
    statisticalReceiptIds: z.array(z.string()),
    modules: z.array(executionModuleResultSchema),
    canonicalFiles: z.array(executionCanonicalFileSchema),
    skillUses: z.array(executionSkillUseSchema),
    nextActions: z.array(z.record(z.unknown())),
    externalBlockers: z.array(executionBlockerSchema),
  })
  .passthrough();

const reproductionExecutionReceiptV2Schema = reproductionExecutionReceiptSchema
  .omit({ modules: true })
  .extend({
    contractVersion: z.literal(2),
    paperMapReceiptId: z.string().min(1),
    scopeReceiptId: z.string().min(1),
    scriptValidationReceiptId: z.string().min(1),
    executionRunReceiptIds: z.array(z.string()),
    modules: z.array(executionModuleResultV2Schema),
    coverageItems: z.array(coverageItemSchema),
  })
  .passthrough();

const executionReceiptFrom = (value: unknown): ExecutionReceipt | undefined => {
  const parsed =
    isRecord(value) && value.contractVersion === 2
      ? reproductionExecutionReceiptV2Schema.safeParse(value)
      : reproductionExecutionReceiptSchema.safeParse(value);
  return parsed.success ? (parsed.data as unknown as ExecutionReceipt) : undefined;
};

const validateCompletionReceipt = (
  receipt: ReproductionCompletionReceipt | undefined,
  projectRoot: string
): string[] => {
  if (!receipt) return ['A valid bio_reproduction completionReceipt is required.'];
  const issues: string[] = [];
  if (receipt.status !== 'ready') issues.push('The completion receipt is not ready.');
  if (receipt.planningCompletion !== 'complete') issues.push('planningCompletion is incomplete.');
  if (receipt.nextActions.length) issues.push('Correctable nextActions remain unfinished.');
  if (path.resolve(receipt.projectRoot) !== path.resolve(projectRoot)) {
    issues.push('The completion receipt belongs to a different project root.');
  }
  for (const file of receipt.canonicalFiles) {
    const resolved = path.resolve(projectRoot, file.path);
    const relative = path.relative(projectRoot, resolved);
    if (path.isAbsolute(file.path) || relative.startsWith('..') || path.isAbsolute(relative)) {
      issues.push(`Canonical file escapes the project root: ${file.path}`);
      continue;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      issues.push(`Canonical file is missing: ${file.path}`);
      continue;
    }
    const currentHash = crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
    if (currentHash !== file.contentHash) issues.push(`Canonical file changed after validation: ${file.path}`);
  }
  if (receipt.canonicalFiles.length < 3) {
    issues.push('The plan, source audit, and method parameter contract must be included in the receipt.');
  }
  if (!receipt.methodParameterReceiptId) issues.push('The planning receipt has no method parameter receipt.');
  return issues;
};

const validateExecutionReceipt = (
  receipt: ExecutionReceipt | undefined,
  planningReceipt: ReproductionCompletionReceipt | undefined,
  projectRoot: string,
  requestedStatus: SciencePanelData['status']
): string[] => {
  if (!receipt) return ['A current bio_reproduction executionReceipt is required for execution publication.'];
  const issues: string[] = [];
  const completedPublication = requestedStatus === 'completed';
  if (!planningReceipt || receipt.planningReceiptId !== planningReceipt.receiptId) {
    issues.push('The execution receipt does not reference the current reproduction planning receipt.');
  }
  if (path.resolve(receipt.projectRoot) !== path.resolve(projectRoot)) {
    issues.push('The execution receipt belongs to a different project root.');
  }
  if (receipt.nextActions.length) issues.push('Correctable execution nextActions remain unfinished.');
  if (completedPublication && (receipt.status !== 'ready' || receipt.executionCompletion !== 'complete')) {
    issues.push('A completed publication requires a ready, complete execution receipt.');
  }
  if (completedPublication && receipt.scientificOutcome === 'externally_blocked') {
    issues.push('An externally blocked execution cannot publish as completed.');
  }
  if (
    requestedStatus === 'partial' &&
    !(
      (receipt.status === 'ready' && receipt.executionCompletion === 'complete') ||
      (receipt.status === 'blocked' && receipt.scientificOutcome === 'externally_blocked')
    )
  ) {
    issues.push('A partial publication requires a complete receipt or a terminal externally blocked receipt.');
  }
  if (
    receipt.scientificOutcome === 'externally_blocked' &&
    !receipt.externalBlockers.some((blocker) => blocker.external && blocker.kind !== 'contract')
  ) {
    issues.push('An externally blocked receipt requires a genuine external blocker.');
  }
  const validCompletedStatuses = new Set(['validated', 'scientifically_limited']);
  for (const module of receipt.modules) {
    if (!module.required) continue;
    if (completedPublication && !validCompletedStatuses.has(module.status)) {
      issues.push(`Required module ${module.id} is not validated.`);
    }
    if (requestedStatus === 'partial' && ['generated_unvalidated', 'incomplete'].includes(module.status)) {
      issues.push(`Required module ${module.id} still has a correctable validation state.`);
    }
    if (
      module.status === 'externally_blocked' &&
      !receipt.externalBlockers.some(
        (blocker) => blocker.external && blocker.kind !== 'contract' && blocker.moduleId === module.id
      )
    ) {
      issues.push(`Required module ${module.id} has no matching genuine external blocker.`);
    }
  }
  if (!receipt.canonicalFiles.length) issues.push('The execution receipt has no canonical files.');
  for (const file of receipt.canonicalFiles) {
    const resolved = path.resolve(projectRoot, file.path);
    const relative = path.relative(projectRoot, resolved);
    if (path.isAbsolute(file.path) || relative.startsWith('..') || path.isAbsolute(relative)) {
      issues.push(`Execution file escapes the project root: ${file.path}`);
      continue;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      issues.push(`Execution file is missing: ${file.path}`);
      continue;
    }
    const realRoot = fs.realpathSync(projectRoot);
    const realFile = fs.realpathSync(resolved);
    const realRelative = path.relative(realRoot, realFile);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      issues.push(`Execution file resolves outside the project root: ${file.path}`);
      continue;
    }
    const stat = fs.statSync(resolved);
    if ((stat.mode & 0o444) === 0) issues.push(`Execution file is not host-readable: ${file.path}`);
    const snapshot = file as { path: string; contentHash: string; sizeBytes?: number; mtimeMs?: number };
    const unchangedLargeFile =
      stat.size > 25 * 1024 * 1024 && snapshot.sizeBytes === stat.size && snapshot.mtimeMs === stat.mtimeMs;
    if (!unchangedLargeFile) {
      const currentHash = crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
      if (currentHash !== file.contentHash) issues.push(`Execution file changed after validation: ${file.path}`);
    }
  }
  if (!receipt.canonicalFiles.some((file) => file.path === receipt.executionContractFile.path)) {
    issues.push('The execution contract is missing from the final canonical file set.');
  }
  const canonicalContract = receipt.canonicalFiles.find((file) => file.path === receipt.executionContractFile.path);
  if (canonicalContract && canonicalContract.contentHash !== receipt.executionContractFile.contentHash) {
    issues.push('The execution contract hash does not match the final canonical file set.');
  }
  return issues;
};

const applyCompletionReceipt = (run: ScienceRunState, receipt: ReproductionCompletionReceipt): void => {
  run.workflowKind = receipt.workflowKind;
  run.planningCompletion = receipt.planningCompletion;
  run.executionReadiness = receipt.executionReadiness;
  run.completionReceipt = receipt;
  run.nextActions = receipt.nextActions;
  run.externalBlockers = receipt.externalBlockers;
  for (const value of receipt.skillUses) {
    const skillUse = normalizeSkillUse(run, { ...value, id: value.id });
    run.usedSkills.set(skillUse.id, skillUse);
  }
  const completionNode = normalizeNode(run, {
    id: receipt.receiptId,
    type: 'activity',
    label: 'Omics reproduction planning completion',
    contentHash: crypto.createHash('sha256').update(JSON.stringify(receipt.canonicalFiles)).digest('hex'),
    metadata: {
      producer: receipt.producer,
      action: receipt.action,
      planningCompletion: receipt.planningCompletion,
      executionReadiness: receipt.executionReadiness,
      sourceReceiptIds: receipt.sourceReceiptIds,
      runtimeReceiptIds: receipt.runtimeReceiptIds,
    },
  });
  run.provenance.set(completionNode.id, completionNode);
};

const applyStatisticalCompletionReceipt = (run: ScienceRunState, receipt: BioStatisticsCompletionReceipt): void => {
  run.workflowKind = receipt.workflowKind;
  run.workflowPhase = 'execution';
  run.statisticalCompletionReceipt = receipt;
  run.nextActions = receipt.nextActions;
  run.externalBlockers = receipt.externalBlockers;
  for (const value of receipt.skillUses) {
    const skillUse = normalizeSkillUse(run, { ...value, id: value.id });
    run.usedSkills.set(skillUse.id, skillUse);
  }
  const completionNode = normalizeNode(run, {
    id: receipt.receiptId,
    type: 'activity',
    label: 'Omics reproduction statistical completion',
    contentHash: crypto.createHash('sha256').update(JSON.stringify(receipt.canonicalFiles)).digest('hex'),
    metadata: {
      producer: receipt.producer,
      action: receipt.action,
      planningReceiptId: receipt.planningReceiptId,
      designReceiptId: receipt.designReceiptId,
      package: receipt.package,
      packageVersion: receipt.packageVersion,
      mcpActions: receipt.mcpActions,
    },
  });
  run.provenance.set(completionNode.id, completionNode);
};

const applyMethodAlignmentReceipt = (run: ScienceRunState, receipt: MethodAlignmentReceipt): void => {
  run.workflowKind = 'omics_reproduction';
  run.workflowPhase = 'execution';
  run.methodAlignmentReceipt = receipt;
  const completionNode = normalizeNode(run, {
    id: receipt.receiptId,
    type: 'activity',
    label: 'Omics reproduction method alignment',
    contentHash: crypto
      .createHash('sha256')
      .update(JSON.stringify([receipt.executedParameterFile, ...receipt.scriptFiles]))
      .digest('hex'),
    metadata: {
      producer: receipt.producer,
      action: receipt.action,
      alignmentLevel: receipt.alignmentLevel,
      methodParameterReceiptId: receipt.methodParameterReceiptId,
      alignedParameterCount: receipt.alignedParameters.length,
      substitutedParameterCount: receipt.substitutedParameters.length,
      eligibleClaims: receipt.eligibleClaims,
    },
  });
  run.provenance.set(completionNode.id, completionNode);
};

const applyExecutionReceipt = (run: ScienceRunState, receipt: ExecutionReceipt): void => {
  run.workflowKind = receipt.workflowKind;
  run.workflowPhase = 'execution';
  run.executionReceipt = receipt;
  run.nextActions = receipt.nextActions;
  run.externalBlockers = receipt.externalBlockers;
  for (const value of receipt.skillUses) {
    const skillUse = normalizeSkillUse(run, { ...value, id: value.id });
    run.usedSkills.set(skillUse.id, skillUse);
  }
  const completionNode = normalizeNode(run, {
    id: receipt.receiptId,
    type: 'activity',
    label: 'Omics reproduction execution completion',
    contentHash: crypto.createHash('sha256').update(JSON.stringify(receipt.canonicalFiles)).digest('hex'),
    metadata: {
      producer: receipt.producer,
      action: receipt.action,
      executionCompletion: receipt.executionCompletion,
      scientificOutcome: receipt.scientificOutcome,
      planningReceiptId: receipt.planningReceiptId,
      executionContractReceiptId: receipt.executionContractReceiptId,
      methodAlignmentReceiptId: receipt.methodAlignmentReceiptId,
      statisticalReceiptIds: receipt.statisticalReceiptIds,
    },
  });
  run.provenance.set(completionNode.id, completionNode);
};

const isTerminalAnalysisReceipt = (receipt: OmicsAnalysisReceipt): boolean =>
  (receipt.action === 'close_analysis' && receipt.projectStatus === 'closed') ||
  (receipt.stageStatus === 'accepted' && receipt.projectStatus === 'accepted');

const analysisReceiptStageRoot = (receipt: OmicsAnalysisReceipt): string => {
  const episodeId = asString((receipt as unknown as JsonRecord).episodeId);
  return stageOutputRelativePath(receipt.analysisId, receipt.stage, episodeId || undefined);
};

const validateAnalysisReceiptCanonicalFiles = (receipt: OmicsAnalysisReceipt, projectRoot: string): string[] => {
  if (!isTerminalAnalysisReceipt(receipt)) return [];
  const issues: string[] = [];
  const stageRoot = analysisReceiptStageRoot(receipt);
  if (!receipt.canonicalFiles.length) issues.push('The terminal analysis receipt has no canonical files.');
  const receiptPaths = receipt.canonicalFiles.map((file) => file.path);
  const missingCoverage = stageArtifactRequirements(receipt.stage).filter(
    (required) => !receiptPaths.some((candidate) => candidate.includes(required))
  );
  for (const required of missingCoverage) {
    issues.push(`The terminal analysis receipt is missing required output coverage: ${required}.`);
  }
  for (const file of receipt.canonicalFiles) {
    const normalized = file.path.replaceAll('\\', '/');
    if (path.isAbsolute(normalized) || !normalized.startsWith(`${stageRoot}/`)) {
      issues.push(`Canonical analysis file is outside the UI-openable stage root ${stageRoot}: ${file.path}`);
      continue;
    }
    const resolved = path.resolve(projectRoot, normalized);
    const relative = path.relative(projectRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      issues.push(`Canonical analysis file escapes the project root: ${file.path}`);
      continue;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      issues.push(`Canonical analysis file is missing: ${file.path}`);
      continue;
    }
    const realRoot = fs.realpathSync(projectRoot);
    const realFile = fs.realpathSync(resolved);
    const realRelative = path.relative(realRoot, realFile);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      issues.push(`Canonical analysis file resolves outside the project root: ${file.path}`);
      continue;
    }
    const stat = fs.statSync(resolved);
    if ((stat.mode & 0o444) === 0) issues.push(`Canonical analysis file is not host-readable: ${file.path}`);
    const currentHash = crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
    if (currentHash !== file.contentHash) issues.push(`Canonical analysis file changed after validation: ${file.path}`);
    const sizeBytes = Number((file as unknown as JsonRecord).sizeBytes);
    if (Number.isFinite(sizeBytes) && sizeBytes !== stat.size) {
      issues.push(`Canonical analysis file size changed after validation: ${file.path}`);
    }
  }
  if (receipt.stage === 'exploration') {
    const modules = analysisWorkflowModules(receipt);
    if (!modules.length) {
      issues.push('The terminal exploration receipt has no workflowModules summary.');
    }
    const declared = new Set(modules.map((module) => asString(module.moduleId)).filter(Boolean));
    for (const module of FREE_EXPLORATION_MODULE_PLAN) {
      if (!declared.has(module.moduleId)) {
        issues.push(`The terminal exploration receipt must declare workflow module: ${module.moduleId}.`);
      }
    }
    for (const module of modules) {
      const moduleId = asString(module.moduleId, 'unknown_module');
      const status = asString(module.status);
      if (!['completed', 'blocked', 'not_applicable'].includes(status)) {
        issues.push(`Workflow module ${moduleId} has invalid status: ${status || '<missing>'}.`);
      }
      if (status === 'completed' && !asArray(module.outputs).length) {
        issues.push(`Workflow module ${moduleId} is completed but declares no outputs.`);
      }
      if (status === 'blocked' && !asString(module.blockerReason)) {
        issues.push(`Workflow module ${moduleId} is blocked but has no blockerReason.`);
      }
      if (status === 'not_applicable' && !asString(module.reason) && !asString(module.notApplicableReason)) {
        issues.push(`Workflow module ${moduleId} is not_applicable but has no reason.`);
      }
    }
  }
  return issues;
};

const analysisArtifactGroup = (
  analysisId: string,
  filePath: string
): { id: string; type: ScienceArtifact['type']; title: string; role: ScienceArtifactSnapshotIncludePath['role'] } => {
  if (filePath.includes('/reports/')) {
    return { id: `${analysisId}-report`, type: 'report', title: 'Analysis report', role: 'primary' };
  }
  if (filePath.includes('/scripts/')) {
    return { id: `${analysisId}-scripts`, type: 'code', title: 'Analysis script package', role: 'code' };
  }
  if (filePath.includes('/results/tables/')) {
    return { id: `${analysisId}-tables`, type: 'table', title: 'Analysis result tables', role: 'output' };
  }
  if (filePath.includes('/results/figures/')) {
    return { id: `${analysisId}-figures`, type: 'figure', title: 'Analysis figures', role: 'output' };
  }
  if (filePath.includes('/results/objects/')) {
    return { id: `${analysisId}-objects`, type: 'dataset', title: 'Analysis objects', role: 'output' };
  }
  if (filePath.includes('/logs/')) {
    return { id: `${analysisId}-logs`, type: 'run_bundle', title: 'Analysis logs', role: 'log' };
  }
  return { id: `${analysisId}-manifest`, type: 'run_bundle', title: 'Analysis manifest', role: 'output' };
};

const applyAnalysisArtifacts = (
  run: ScienceRunState,
  receipt: OmicsAnalysisReceipt
): ScienceArtifactSnapshotIncludePath[] => {
  const grouped = new Map<
    string,
    {
      id: string;
      type: ScienceArtifact['type'];
      title: string;
      paths: string[];
      role: ScienceArtifactSnapshotIncludePath['role'];
    }
  >();
  for (const file of receipt.canonicalFiles || []) {
    const group = analysisArtifactGroup(receipt.analysisId, file.path);
    const current = grouped.get(group.id) || { ...group, paths: [] };
    current.paths.push(file.path);
    grouped.set(group.id, current);
  }
  const includePaths: ScienceArtifactSnapshotIncludePath[] = [];
  for (const group of grouped.values()) {
    const primaryPath =
      group.paths.find((candidate) => candidate.includes('/reports/analysis_report')) ||
      group.paths.find((candidate) => candidate.endsWith('results/output_manifest.json')) ||
      group.paths[0];
    if (!primaryPath) continue;
    const artifact = normalizeArtifact(run, {
      id: group.id,
      type: group.type,
      title: group.title,
      primaryPath,
      sourcePaths: group.paths,
      outputPaths: group.paths,
      status: 'available',
      revision: revision(),
      ...(group.type === 'code' ? { code: { path: primaryPath, language: 'python', entrypoint: primaryPath } } : {}),
    });
    run.artifacts.set(artifactKey(artifact.id, artifact.version), artifact);
    syncArtifactEdges(run, artifact);
    for (const filePath of group.paths) {
      includePaths.push({
        path: filePath,
        role: group.role,
        artifactId: artifact.id,
        artifactVersion: artifact.version,
      });
    }
  }
  return includePaths;
};

const applyAnalysisReceipt = (run: ScienceRunState, receipt: OmicsAnalysisReceipt): void => {
  run.workflowKind = 'omics_analysis';
  run.workflowPhase = receipt.stage;
  run.analysisReceipt = receipt;
  run.analysisId = receipt.analysisId;
  run.analysisStage = receipt.stage;
  run.analysisCheckpointStatus =
    receipt.action === 'request_checkpoint' ? asString((receipt as unknown as JsonRecord).checkpointStatus) : undefined;
  if (receipt.stage === 'baseline') run.baselineReceiptId = receipt.receiptId;
  run.nextActions = receipt.nextActions;
  run.externalBlockers = receipt.externalBlockers;
  const node = normalizeNode(run, {
    id: receipt.receiptId,
    type: 'activity',
    label: `Omics analysis ${receipt.stage}`,
    contentHash: crypto.createHash('sha256').update(JSON.stringify(receipt.canonicalFiles)).digest('hex'),
    metadata: {
      producer: receipt.producer,
      action: receipt.action,
      analysisId: receipt.analysisId,
      stage: receipt.stage,
      stageStatus: receipt.stageStatus,
      projectStatus: receipt.projectStatus,
      checkpointStatus: run.analysisCheckpointStatus,
    },
  });
  run.provenance.set(node.id, node);
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
      workflowKind: run.workflowKind,
      workflowPhase: run.workflowPhase,
      planningCompletion: run.planningCompletion,
      executionReadiness: run.executionReadiness,
      completionReceipt: run.completionReceipt,
      executionReceipt: run.executionReceipt,
      statisticalCompletionReceipt: run.statisticalCompletionReceipt,
      methodAlignmentReceipt: run.methodAlignmentReceipt,
      analysisReceipt: run.analysisReceipt,
      analysisId: run.analysisId,
      analysisStage: run.analysisStage,
      analysisCheckpointStatus: run.analysisCheckpointStatus,
      baselineReceiptId: run.baselineReceiptId,
      deliveryState: panel.deliveryState,
      coverageSummary: panel.coverageSummary,
      coverageItems: panel.coverageItems,
      attachments: panel.attachments,
      nextActions: run.nextActions,
      externalBlockers: run.externalBlockers,
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
      authorizedExternalPaths: [...authorizedExternalFiles.keys()],
    });
    if (gitRef.ok) {
      run.git = gitRef;
      panel.git = gitRef;
      panel.attachments = deriveAttachments(panel, gitRef);
      state.git = gitRef;
      state.attachments = panel.attachments;
      if (triggerEvent) {
        triggerEvent.git = gitRef;
        if (triggerEvent.panel) {
          triggerEvent.panel.git = gitRef;
          triggerEvent.panel.attachments = panel.attachments;
        }
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
    run.status = normalizeSciencePanelStatus(asString(payload.status, run.status));
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
      'Use action=status/reserve_id/get/list/create/patch/replace/append/version/authorize_external_file/snapshot/publish/annotate/focus_page.',
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
        'authorize_external_file',
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

      if (action === 'authorize_external_file') {
        const authorization = await authorizeExternalFile(
          asString(body.externalPath || body.external_path || body.path),
          conversationId || run.conversationId
        );
        if (authorization.status === 'authorized') {
          const nodeId = makeId('provenance');
          run.provenance.set(nodeId, {
            id: nodeId,
            type: 'user_decision',
            label: 'Authorized one external file for this Science session',
            path: asString(authorization.normalizedPath),
            createdAt: asNumber(authorization.authorizedAt, now()),
            metadata: {
              requestId: authorization.requestId,
              scope: authorization.scope,
              expiresOnSessionEnd: true,
            },
            revision: revision(),
          });
        }
        const evt = eventFor(run, action, undefined, {
          provenanceNodeIds: authorization.status === 'authorized' ? [...run.provenance.keys()].slice(-1) : undefined,
          warnings:
            authorization.status === 'authorized'
              ? undefined
              : [
                  {
                    id: `sci_warning_${crypto.randomBytes(4).toString('hex')}`,
                    runId: run.runId,
                    severity: 'warning',
                    code: 'missing_source',
                    message: `External file authorization status: ${authorization.status}`,
                    blocking: true,
                    createdAt: now(),
                  },
                ],
        });
        return jsonText({ ...evt, authorization });
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
        const preserveAcceptedPublication =
          run.workflowKind === 'omics_reproduction' && deriveDeliveryState(run).publicationDisposition === 'accepted';
        const rawRequestedStatus = body.status ? asString(body.status, run.status) : run.status;
        const requestedStatus = normalizeSciencePanelStatus(rawRequestedStatus);
        const completionReceiptId = asString(body.completionReceiptId || body.completion_receipt_id);
        const statisticalCompletionReceiptId = asString(
          body.statisticalCompletionReceiptId || body.statistical_completion_receipt_id
        );
        const methodAlignmentReceiptId = asString(body.methodAlignmentReceiptId || body.method_alignment_receipt_id);
        const executionReceiptId = asString(body.executionReceiptId || body.execution_receipt_id);
        const analysisReceiptId = asString(body.analysisReceiptId || body.analysis_receipt_id);
        const requestedWorkflowKind = asString(body.workflowKind || body.workflow_kind);
        if (requestedWorkflowKind && !['omics_reproduction', 'omics_analysis'].includes(requestedWorkflowKind)) {
          run.status = 'running';
          const panel = buildPanel(run);
          const evt = eventFor(run, action, target, { panel, warnings: panel.graphWarnings });
          return jsonText({
            ...evt,
            displayIntent: displayIntent || 'open',
            status: 'invalid_request',
            error: { code: 'UNSUPPORTED_WORKFLOW_KIND', workflowKind: requestedWorkflowKind },
          });
        }
        const legacyReceiptProvided = Boolean(
          body.completionReceipt ||
          body.completion_receipt ||
          body.statisticalCompletionReceipt ||
          body.statistical_completion_receipt ||
          body.methodAlignmentReceipt ||
          body.method_alignment_receipt ||
          body.executionReceipt ||
          body.execution_receipt
        );
        const declaredReproductionWorkflow =
          body.workflowKind === 'omics_reproduction' ||
          body.workflow_kind === 'omics_reproduction' ||
          run.workflowKind === 'omics_reproduction';
        const declaredAnalysisWorkflow =
          body.workflowKind === 'omics_analysis' ||
          body.workflow_kind === 'omics_analysis' ||
          run.workflowKind === 'omics_analysis';
        const legacyAnalysisReceiptProvided = Boolean(body.analysisReceipt || body.analysis_receipt);
        if (declaredAnalysisWorkflow && legacyAnalysisReceiptProvided) {
          run.status = 'running';
          run.nextActions = [
            {
              id: 'publish-analysis-with-receipt-id',
              tool: 'science_artifact',
              action: 'publish',
              reason: 'Omics analysis publishing accepts analysisReceiptId only; full receipt objects are rejected.',
              payload: { workflowKind: 'omics_analysis', analysisReceiptId },
              maxAttempts: 1,
              stopWhenUnchanged: true,
            },
          ];
          const panel = buildPanel(run);
          const evt = eventFor(run, action, target, { panel, warnings: panel.graphWarnings });
          return jsonText({
            ...evt,
            displayIntent: displayIntent || 'open',
            status: 'invalid_request',
            error: { code: 'FULL_RECEIPT_PAYLOAD_REJECTED' },
            correctedCall: run.nextActions[0],
            nextActions: run.nextActions,
          });
        }
        if (declaredAnalysisWorkflow) {
          const incomingAnalysisReceipt = receiptById(run.projectRoot || '', analysisReceiptId, analysisReceiptFrom);
          if (!incomingAnalysisReceipt) {
            run.status = 'running';
            run.nextActions = [
              {
                id: 'publish-analysis-with-current-receipt',
                tool: 'bio_analysis',
                action: 'status',
                reason: 'A current analysisReceiptId from this project is required for analysis publishing.',
                payload: { analysisId: asString(body.analysisId) },
                maxAttempts: 1,
                stopWhenUnchanged: true,
              },
            ];
            const panel = buildPanel(run);
            const evt = eventFor(run, action, target, { panel, warnings: panel.graphWarnings });
            return jsonText({
              ...evt,
              displayIntent: displayIntent || 'open',
              status: 'invalid_request',
              error: { code: 'ANALYSIS_RECEIPT_REQUIRED' },
              nextActions: run.nextActions,
            });
          }
          const canonicalIssues = validateAnalysisReceiptCanonicalFiles(incomingAnalysisReceipt, run.projectRoot || '');
          if (canonicalIssues.length) {
            run.status = 'running';
            run.nextActions = [
              {
                id: 'repair-analysis-canonical-files',
                tool: 'bio_analysis',
                action: 'status',
                reason:
                  'The analysis receipt is terminal, but its canonical files are not complete, project-local, readable, and hash-stable.',
                payload: { analysisId: incomingAnalysisReceipt.analysisId },
                maxAttempts: 1,
                stopWhenUnchanged: true,
              },
            ];
            const panel = buildPanel(run);
            const evt = eventFor(run, action, target, { panel, warnings: panel.graphWarnings });
            return jsonText({
              ...evt,
              displayIntent: displayIntent || 'open',
              status: 'invalid_request',
              error: { code: 'ANALYSIS_CANONICAL_FILES_UNOPENABLE', issues: canonicalIssues },
              nextActions: run.nextActions,
            });
          }
          applyAnalysisReceipt(run, incomingAnalysisReceipt);
          const analysisIncludePaths = applyAnalysisArtifacts(run, incomingAnalysisReceipt);
          run.status =
            incomingAnalysisReceipt.stageStatus === 'awaiting_user'
              ? 'awaiting_user'
              : (incomingAnalysisReceipt.action === 'close_analysis' &&
                    incomingAnalysisReceipt.projectStatus === 'closed') ||
                  (incomingAnalysisReceipt.stage === 'exploration' &&
                    incomingAnalysisReceipt.stageStatus === 'accepted' &&
                    incomingAnalysisReceipt.projectStatus === 'accepted')
                ? 'completed'
                : 'running';
          if (body.question) run.question = asString(body.question, run.question);
          if (body.summary) run.summary = asString(body.summary, run.summary as string);
          const panel = buildPanel(run);
          const evt = eventFor(
            run,
            action,
            target,
            {
              panel,
              artifactIds: panel.artifacts.map((item) => item.id),
              warnings: panel.graphWarnings,
              snapshot: { includePaths: analysisIncludePaths },
            },
            analysisIncludePaths
          );
          if (
            writeProjectManifest() &&
            run.status === 'completed' &&
            (!evt.git || !evt.git.files?.some((file) => file.mode === 'copied'))
          ) {
            run.status = 'partial';
            run.graphWarnings.set('warn_analysis_artifact_snapshot_empty', {
              id: 'warn_analysis_artifact_snapshot_empty',
              runId: run.runId,
              code: 'analysis_artifact_snapshot_empty',
              severity: 'error',
              message: 'Completed omics analysis publishing requires copied, UI-openable canonical artifact files.',
              blocking: true,
              createdAt: now(),
            });
            const blockedPanel = buildPanel(run);
            const blockedEvt = eventFor(
              run,
              action,
              target,
              {
                panel: blockedPanel,
                artifactIds: blockedPanel.artifacts.map((item) => item.id),
                warnings: blockedPanel.graphWarnings,
                snapshot: { includePaths: analysisIncludePaths },
              },
              analysisIncludePaths
            );
            return jsonText({
              ...blockedEvt,
              displayIntent: displayIntent || 'open',
              status: 'invalid_request',
              error: { code: 'ANALYSIS_ARTIFACT_SNAPSHOT_EMPTY' },
            });
          }
          return jsonText({
            ...evt,
            displayIntent: displayIntent || 'open',
            analysisReceiptId: incomingAnalysisReceipt.receiptId,
            authoritativeState: {
              status: panel.status,
              deliveryState: panel.deliveryState,
              analysisId: panel.analysisId,
              analysisStage: panel.analysisStage,
              checkpointStatus: panel.analysisCheckpointStatus,
            },
          });
        }
        if (legacyReceiptProvided) {
          if (!preserveAcceptedPublication) run.status = 'running';
          run.nextActions = [
            {
              id: 'publish-with-receipt-ids',
              tool: 'science_artifact',
              action: 'publish',
              reason: 'Omics reproduction publishing accepts receipt IDs only; full receipt objects are rejected.',
              payload: {
                workflowKind: 'omics_reproduction',
                status: 'running',
                completionReceiptId,
                executionReceiptId,
                statisticalCompletionReceiptId,
                methodAlignmentReceiptId,
              },
              maxAttempts: 1,
              stopWhenUnchanged: true,
            },
          ];
          const panel = buildPanel(run);
          const evt = eventFor(run, action, target, { panel, warnings: panel.graphWarnings });
          return jsonText({
            ...evt,
            displayIntent: displayIntent || 'open',
            status: 'invalid_request',
            error: { code: 'FULL_RECEIPT_PAYLOAD_REJECTED' },
            correctedCall: run.nextActions[0],
            nextActions: run.nextActions,
            authoritativeState: {
              status: panel.status,
              deliveryState: panel.deliveryState,
              planningCompletion: panel.planningCompletion,
              executionReadiness: panel.executionReadiness,
            },
          });
        }
        const incomingReceipt = receiptById(run.projectRoot || '', completionReceiptId, completionReceiptFrom);
        const incomingStatisticalReceipt = receiptById(
          run.projectRoot || '',
          statisticalCompletionReceiptId,
          statisticalCompletionReceiptFrom
        );
        const incomingMethodAlignmentReceipt = receiptById(
          run.projectRoot || '',
          methodAlignmentReceiptId,
          methodAlignmentReceiptFrom
        );
        const incomingExecutionReceipt = receiptById(run.projectRoot || '', executionReceiptId, executionReceiptFrom);
        const reproductionWorkflow =
          declaredReproductionWorkflow ||
          incomingReceipt?.workflowKind === 'omics_reproduction' ||
          incomingExecutionReceipt?.workflowKind === 'omics_reproduction' ||
          incomingStatisticalReceipt?.workflowKind === 'omics_reproduction' ||
          Boolean(incomingMethodAlignmentReceipt) ||
          run.workflowKind === 'omics_reproduction';
        if (reproductionWorkflow && !run.workflowKind) run.workflowKind = 'omics_reproduction';
        const workflowPhase =
          body.workflowPhase === 'execution' ||
          body.workflow_phase === 'execution' ||
          incomingExecutionReceipt?.workflowPhase === 'execution' ||
          incomingStatisticalReceipt?.workflowPhase === 'execution' ||
          run.workflowPhase === 'execution'
            ? 'execution'
            : 'planning';
        if (reproductionWorkflow && !run.workflowPhase) run.workflowPhase = workflowPhase;
        if (body.status && !isRecognizedSciencePanelStatus(rawRequestedStatus)) {
          const correctedStatus: SciencePanelData['status'] = reproductionWorkflow ? 'running' : 'draft';
          if (!preserveAcceptedPublication) run.status = 'running';
          run.nextActions = [
            {
              id: 'correct-science-publication-status',
              tool: 'science_artifact',
              action: 'publish',
              reason: `Unsupported Science status: ${rawRequestedStatus}. Use a declared Science panel status.`,
              payload: { status: correctedStatus },
            },
          ];
          const panel = buildPanel(run);
          const evt = eventFor(run, action, target, { panel, warnings: panel.graphWarnings });
          return jsonText({
            ...evt,
            displayIntent: displayIntent || 'open',
            statusCorrectionRequired: true,
            nextActions: run.nextActions,
          });
        }
        const planningReceipt = incomingReceipt || run.completionReceipt;
        const receiptResolutionIssues = [
          completionReceiptId && !incomingReceipt
            ? `Unknown or invalid completionReceiptId: ${completionReceiptId}`
            : '',
          executionReceiptId && !incomingExecutionReceipt
            ? `Unknown or invalid executionReceiptId: ${executionReceiptId}`
            : '',
          statisticalCompletionReceiptId && !incomingStatisticalReceipt
            ? `Unknown or invalid statisticalCompletionReceiptId: ${statisticalCompletionReceiptId}`
            : '',
          methodAlignmentReceiptId && !incomingMethodAlignmentReceipt
            ? `Unknown or invalid methodAlignmentReceiptId: ${methodAlignmentReceiptId}`
            : '',
        ].filter(Boolean);
        const planningReceiptIssues = reproductionWorkflow
          ? validateCompletionReceipt(planningReceipt, run.projectRoot || '')
          : [];
        const executionReceiptIssues =
          reproductionWorkflow && workflowPhase === 'execution'
            ? validateExecutionReceipt(
                incomingExecutionReceipt || run.executionReceipt,
                planningReceipt,
                run.projectRoot || '',
                requestedStatus
              )
            : [];
        const receiptIssues = [...receiptResolutionIssues, ...planningReceiptIssues, ...executionReceiptIssues];
        const reproductionSuccessPublication = requestedStatus === 'completed' || requestedStatus === 'partial';
        if (reproductionWorkflow && reproductionSuccessPublication && receiptIssues.length) {
          const receipt = planningReceipt;
          const executionReceipt = incomingExecutionReceipt || run.executionReceipt;
          if (!preserveAcceptedPublication) run.status = 'running';
          run.nextActions = planningReceiptIssues.length
            ? receipt?.nextActions.length
              ? receipt.nextActions
              : [
                  {
                    id: 'complete-reproduction-workflow',
                    tool: 'bio_reproduction',
                    action: 'validate_reproduction_plan',
                    reason: planningReceiptIssues.join(' '),
                  },
                ]
            : executionReceipt?.nextActions.length
              ? executionReceipt.nextActions
              : [
                  {
                    id: 'complete-reproduction-execution',
                    tool: 'bio_reproduction',
                    action: 'complete_execution',
                    reason: executionReceiptIssues.join(' '),
                  },
                ];
          run.graphWarnings.set('warn_reproduction_completion_required', {
            id: 'warn_reproduction_completion_required',
            runId: run.runId,
            severity: 'error',
            code: 'workflow_action_required',
            message: `Reproduction publication remains running: ${receiptIssues.join(' ')}`,
            blocking: true,
            createdAt: now(),
          });
          const panel = buildPanel(run);
          const evt = eventFor(run, action, target, {
            panel,
            warnings: panel.graphWarnings,
          });
          return jsonText({
            ...evt,
            displayIntent: displayIntent || 'open',
            completionRequired: true,
            nextActions: run.nextActions,
            authoritativeState: {
              status: panel.status,
              deliveryState: panel.deliveryState,
              planningCompletion: panel.planningCompletion,
              executionReadiness: panel.executionReadiness,
            },
          });
        }
        if (incomingReceipt && !planningReceiptIssues.length) {
          applyCompletionReceipt(run, incomingReceipt);
          run.graphWarnings.delete('warn_reproduction_completion_required');
        }
        if (incomingMethodAlignmentReceipt) {
          applyMethodAlignmentReceipt(run, incomingMethodAlignmentReceipt);
        }
        if (incomingStatisticalReceipt) {
          applyStatisticalCompletionReceipt(run, incomingStatisticalReceipt);
        }
        if (incomingExecutionReceipt && !receiptIssues.length) {
          applyExecutionReceipt(run, incomingExecutionReceipt);
          run.graphWarnings.delete('warn_reproduction_completion_required');
        }
        if (reproductionWorkflow) {
          run.workflowKind = 'omics_reproduction';
          run.workflowPhase = workflowPhase;
          run.graphWarnings.delete('warn_reproduction_completion_required');
          const authoritativeReceipt = workflowPhase === 'execution' ? run.executionReceipt : run.completionReceipt;
          if (authoritativeReceipt) {
            run.nextActions = authoritativeReceipt.nextActions;
            run.externalBlockers = authoritativeReceipt.externalBlockers;
          }
        }
        if (body.question) run.question = asString(body.question, run.question);
        if (body.summary) run.summary = asString(body.summary, run.summary as string);
        run.status = requestedStatus;
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
        return jsonText({
          ...evt,
          displayIntent: displayIntent || 'open',
          authoritativeState: {
            status: panel.status,
            deliveryState: panel.deliveryState,
            planningCompletion: panel.planningCompletion,
            executionReadiness: panel.executionReadiness,
          },
        });
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
