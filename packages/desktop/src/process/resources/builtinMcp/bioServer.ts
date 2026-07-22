/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type {
  BioBlocker,
  BioControlReceipt,
  BioNextAction,
  MethodAlignmentReceipt,
  MethodParameterReceipt,
  ReproductionCompletionReceipt,
  ReproductionModuleReadiness,
} from '@/common/chat/science';
import {
  BIO_ENVIRONMENTS,
  BIO_MCP_PROFILES,
  BIO_PLOT_TEMPLATES,
  BIO_WORKFLOWS,
  resolveBioProfile,
  type BioMcpCatalogItem,
  type BioMcpProfile,
} from './bio/catalog';
import {
  BIO_PLOT_BACKENDS,
  BIO_PLOT_OBJECTIVES,
  findPlotRecipe,
  listPlotRecipes,
  renderPlanForSpec,
  selectPlotRecipe,
  validatePlotSpec,
  type BioPlotObjective,
} from './bio/plotRecipes';
import {
  hasCredentialLikeUrl,
  publicHttpUrlStatus,
  redactCredentialText,
  redactCredentialUrl,
  resolveSafeProjectWritePath,
  safeAbsolutePathStatus,
  safeChildPathStatus,
  safeOutputDirectoryStatus,
} from './bio/pathSafety';
import {
  buildCompletionReceipt,
  buildDesignReceipt,
  validateDeDesign,
  validateDeOutputs,
  validateExpressionContract,
} from './bio/reproduction/statisticsContract';
import {
  buildMethodContract,
  buildMethodParameterReceipt,
  inspectMethodSources,
  METHOD_CONTRACT_SCHEMA,
  methodContractSchema,
  validateMethodAlignment,
} from './bio/reproduction/methodContract';
import { completeExecution, prepareExecutionContract } from './bio/reproduction/executionContract';
import { recordExecution } from './bio/reproduction/executionRun';
import {
  indexPaperSources,
  validatePaperReproductionMap,
  validateReproductionScope,
} from './bio/reproduction/paperReproductionMap';
import { preflightExecutionScripts } from './bio/reproduction/scriptPreflight';
import { validateSkillCompliance } from './bio/reproduction/skillContract';
import { handleAnalysisAction } from './bio/analysis/workflow';
import { stageOutputRelativePath } from './bio/analysis/contracts';
import { applyBenchmarkAction, benchmarkControlRelativePath, benchmarkOutputRelativePath } from './bio/benchmark';
import {
  canonicalSpecies,
  resolveLocalGeneSets,
  searchLocalMarkers,
  summarizeKnowledgeResources,
} from './bio/knowledgeResources';
import { persistReceiptsFromResult, readCachedReceipt, readReceipt, receiptInputFingerprint } from './bio/receipts';

type JsonRecord = Record<string, unknown>;
type SourceAuditDataItem = {
  id: string;
  kind: string;
  modality: string;
  source: string;
  accession: string;
  url: string;
  localPath: string;
  sizeBytes: number | null;
  access: string;
  licenseOrTerms: string;
  status: string;
  supports: string[];
  blocks: string[];
  notes: string;
};
type SourceAuditCodeItem = {
  id: string;
  repository: string;
  commitOrRelease: string;
  license: string;
  environmentFiles: string[];
  scriptIndex: string[];
  notebooks: string[];
  runnableAsIs: boolean;
  status: string;
  notes: string;
};
type SourceAuditReferenceResourceItem = {
  id: string;
  kind: string;
  name: string;
  version: string;
  source: string;
  url: string;
  localPath: string;
  status: string;
  requiredBy: string[];
  notes: string;
};
type UserEnvironmentRecord = {
  environmentRef: string;
  path: string;
  build: JsonRecord;
  keyResources: unknown;
  keySupports: unknown;
  owner: string;
  status: string;
};
type UserEnvironmentIndex = {
  schema: string;
  userId: string;
  environments: UserEnvironmentRecord[];
  updatedAt: string;
};
type EnvironmentPathStatus = 'configured' | 'available' | 'missing' | 'unavailable';
type EnvironmentResolution = {
  environmentRef: string;
  pathStatus: EnvironmentPathStatus;
  path: string;
  catalog?: BioMcpCatalogItem;
  userEnvironment?: UserEnvironmentRecord;
  warnings: string[];
};
type EnvironmentProbeCheck = {
  id: string;
  executable: string;
  status: 'passed' | 'failed' | 'missing';
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

const RESULT_SCHEMA = 'openbioscience.bio_mcp.result.v1';
const USER_ENVIRONMENT_INDEX_SCHEMA = 'openbioscience.bio_mcp.user_environment_index.v1';
const DEFAULT_RUNTIME_ROOT = '${OPENBIOSCIENCE_RUNTIME_ROOT}';
const DEFAULT_REPRODUCTION_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
const ENVIRONMENT_PROBE_TIMEOUT_MS = 20_000;
const REPRODUCTION_PLANNING_STATUSES = [
  'ready',
  'partial_ready',
  'conditional_continue',
  'planned_only',
  'blocked_for_localization',
  'blocked_for_execution',
  'unresolved',
  'fatal_block',
] as const;
const REPRODUCTION_PLAN_SECTIONS = [
  'reproduction objective',
  'paper and source summary',
  'data, code, and reference availability',
  'ready, conditional, and blocked scope',
  'planned execution modules',
  'expected outputs',
  'environmentRef candidates',
  'skill and MCP route',
  'execution boundary',
] as const;
const REPRODUCTION_PLAN_SECTION_ALIASES: Array<{ section: string; aliases: string[] }> = [
  { section: 'reproduction objective', aliases: ['reproduction objective', 'objective and scope'] },
  { section: 'paper and source summary', aliases: ['paper and source summary', 'source summary'] },
  {
    section: 'data, code, and reference availability',
    aliases: ['data, code, and reference availability', 'availability summary'],
  },
  {
    section: 'ready, conditional, and blocked scope',
    aliases: ['ready, conditional, and blocked scope', 'reproducible scope'],
  },
  { section: 'planned execution modules', aliases: ['planned execution modules', 'execution modules'] },
  { section: 'expected outputs', aliases: ['expected outputs'] },
  { section: 'environmentRef candidates', aliases: ['environmentref candidates', 'environment and route'] },
  { section: 'skill and MCP route', aliases: ['skill and mcp route', 'environment and route'] },
  { section: 'execution boundary', aliases: ['execution boundary'] },
];
const BIO_RECEIPT_SCHEMA = 'openbioscience.bio.receipt.v1' as const;
const SOURCE_AUDIT_SCHEMA = 'openbioscience.omics_reproduction.source_audit.v1';

const reproductionModuleSchema = z
  .object({
    id: z.string().min(1),
    objective: z.string().min(1).optional(),
    status: z.enum(REPRODUCTION_PLANNING_STATUSES),
    sourceStatus: z.enum(REPRODUCTION_PLANNING_STATUSES),
    environmentRef: z.string().min(1),
    skillRoute: z.array(z.string().min(1)).min(1),
    mcpRoute: z.array(z.string().min(1)).min(1),
    expectedOutputs: z.array(z.string().min(1)).min(1),
    targetIds: z.array(z.string().min(1)).optional(),
    cohortIds: z.array(z.string().min(1)).optional(),
    required: z.boolean().optional(),
  })
  .strict();

const controlReceiptSchema = z
  .object({
    schema: z.literal(BIO_RECEIPT_SCHEMA),
    receiptId: z.string().min(1),
    producer: z.enum(['bio_source', 'bio_runtime', 'bio_reproduction', 'bio_statistics', 'bio_analysis']),
    action: z.string().min(1),
    status: z.string().min(1),
    projectRoot: z.string(),
    createdAt: z.number(),
    details: z.record(z.unknown()).optional(),
  })
  .passthrough();

const validateReproductionPayloadSchema = z
  .object({
    planPath: z.string().min(1),
    sourceAuditPath: z.string().min(1),
    paperMapReceiptId: z.string().min(1),
    scopeReceiptId: z.string().min(1),
    methodParameterReceiptId: z.string().min(1),
    sourceReceiptIds: z.array(z.string().min(1)).min(1),
    runtimeReceiptIds: z.array(z.string().min(1)),
    skillComplianceReceiptIds: z.array(z.string().min(1)),
    localizedPaths: z.array(z.string().min(1)).optional(),
    approvedExistingData: z.boolean().optional(),
    modules: z.array(reproductionModuleSchema).min(1),
    methodContractPath: z.string().min(1),
  })
  .strict();

const validatePaperMapByIdPayloadSchema = z
  .object({
    mapPath: z.literal('case_reproduction/planning/paper_reproduction_map.json'),
    sourceReceiptIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

const validateScopeByIdPayloadSchema = z
  .object({
    mapPath: z.literal('case_reproduction/planning/paper_reproduction_map.json'),
    paperMapReceiptId: z.string().min(1),
  })
  .strict();

const extractMethodParametersByIdPayloadSchema = z
  .object({
    methodContractPath: z
      .literal('case_reproduction/planning/method_parameter_contract.json')
      .default('case_reproduction/planning/method_parameter_contract.json'),
    methodSourceReceiptId: z.string().min(1),
    paperMapReceiptId: z.string().min(1).optional(),
    scopeReceiptId: z.string().min(1).optional(),
  })
  .strict();

const validateMethodAlignmentByIdPayloadSchema = z
  .object({
    methodParameterReceiptId: z.string().min(1),
    executedParameterPath: z.string().min(1),
    scriptPaths: z.array(z.string().min(1)).min(1),
  })
  .strict();

const prepareExecutionByIdPayloadSchema = z
  .object({
    contractVersion: z.literal(2),
    objective: z.string().min(1),
    datasetIds: z.array(z.string().min(1)).min(1),
    executionContractPath: z.string().min(1).optional(),
    annotationMode: z.enum(['independent_annotation', 'reference_review', 'label_transfer']).optional(),
    annotationPolicy: z.record(z.unknown()).optional(),
    planningReceiptId: z.string().min(1),
    paperMapReceiptId: z.string().min(1),
    scopeReceiptId: z.string().min(1),
  })
  .strict();

const scriptPreflightByIdPayloadSchema = z
  .object({
    executionContractReceiptId: z.string().min(1),
    methodParameterReceiptId: z.string().min(1),
    scripts: z.array(z.unknown()).min(1).optional(),
    scriptPaths: z.array(z.string().min(1)).min(1).optional(),
    skillComplianceReceiptIds: z.array(z.string().min(1)),
    statisticalDesignReceiptIds: z.array(z.string().min(1)).optional(),
    skillContents: z.record(z.string()).optional(),
  })
  .strict();

const completeExecutionByIdPayloadSchema = z
  .object({
    contractVersion: z.literal(2),
    executionContractReceiptId: z.string().min(1),
    planningReceiptId: z.string().min(1),
    paperMapReceiptId: z.string().min(1),
    scopeReceiptId: z.string().min(1),
    methodAlignmentReceiptId: z.string().min(1),
    scriptValidationReceiptId: z.string().min(1),
    executionRunReceiptIds: z.array(z.string().min(1)).min(1),
    statisticalCompletionReceiptIds: z.array(z.string().min(1)).optional(),
    moduleResults: z.array(z.record(z.unknown())),
    skillUses: z.array(z.record(z.unknown())).optional(),
    externalBlockers: z.array(z.record(z.unknown())).optional(),
  })
  .strict();

const recordExecutionByIdPayloadSchema = z
  .object({
    scriptValidationReceiptId: z.string().min(1),
    startedAt: z.number().int().positive(),
    finishedAt: z.number().int().positive(),
    exitCode: z.number().int(),
    scriptFiles: z.array(z.record(z.unknown())).min(1),
    configFiles: z.array(z.record(z.unknown())),
    logFiles: z.array(z.record(z.unknown())).min(1),
    outputFiles: z.array(z.record(z.unknown())),
  })
  .strict();

const publicDatasetCandidateSchema = z
  .object({
    id: z.string().min(1),
    sourceName: z.string().min(1),
    datasetId: z.string().min(1),
    accession: z.string().min(1).optional(),
    disease: z.string().min(1),
    organism: z.string().min(1),
    tissue: z.string().min(1),
    modality: z.string().min(1),
    sampleCount: z.number().int().nonnegative().optional(),
    cellCount: z.number().int().nonnegative().optional(),
    availability: z.string().min(1),
    licenseOrTerms: z.string().min(1),
    downloadRoute: z.string().min(1),
    rationale: z.string().min(20),
    evidenceIds: z.array(z.string().min(1)).optional(),
    warnings: z.array(z.string().min(1)).optional(),
  })
  .strict();

const rankDatasetCandidatesPayloadSchema = z
  .object({
    analysisId: z.string().min(1),
    query: z.string().min(1),
    disease: z.string().min(1),
    organism: z.string().min(1),
    modality: z.string().min(1).default('scRNA-seq'),
    candidates: z.array(publicDatasetCandidateSchema).min(1),
    selectedCandidateId: z.string().min(1).optional(),
  })
  .strict();

const completeLocalizationPayloadSchema = z
  .object({
    analysisId: z.string().min(1),
    sourceName: z.string().min(1),
    datasetId: z.string().min(1),
    accession: z.string().min(1),
    downloadRoute: z.string().min(1),
    localizedPaths: z.array(z.string().min(1)).min(1),
    evidenceIds: z.array(z.string().min(1)).optional(),
    notes: z.array(z.string().min(1)).optional(),
  })
  .strict();

const publicDownloadFileSchema = z
  .object({
    id: z.string().min(1),
    kind: z
      .enum(['processed_matrix', 'processed_object', 'metadata', 'supplement', 'raw_matrix', 'unknown'])
      .default('unknown'),
    url: z.string().min(1).optional(),
    accession: z.string().min(1).optional(),
    expectedPath: z.string().min(1).optional(),
    expectedBytes: z.number().int().nonnegative().optional(),
    autoExtract: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict();

const preparePublicDownloadPayloadSchema = z
  .object({
    analysisId: z.string().min(1),
    sourceName: z.string().min(1),
    datasetId: z.string().min(1),
    accession: z.string().min(1),
    downloadRoute: z.string().min(1),
    files: z.array(publicDownloadFileSchema).min(1),
    rawMatrixDownloadApproved: z.boolean().default(false),
    autoExtract: z.boolean().default(true),
    maxBytes: z.number().int().positive().optional(),
    evidenceIds: z.array(z.string().min(1)).optional(),
    notes: z.array(z.string().min(1)).optional(),
  })
  .strict();

const completePublicDownloadPayloadSchema = z
  .object({
    analysisId: z.string().min(1),
    downloadPlanReceiptId: z.string().min(1),
    sourceName: z.string().min(1),
    datasetId: z.string().min(1),
    accession: z.string().min(1),
    downloadRoute: z.string().min(1),
    downloadedPaths: z.array(z.string().min(1)).min(1),
    extractedPaths: z.array(z.string().min(1)).optional(),
    command: z.string().min(1),
    rawMatrixDownloadApproved: z.boolean().default(false),
    evidenceIds: z.array(z.string().min(1)).optional(),
    notes: z.array(z.string().min(1)).optional(),
  })
  .strict();

const jsonText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const uniqueStrings = (values: unknown[]): string[] =>
  Array.from(new Set(values.map((value) => asString(value)).filter(Boolean))).sort();

const asBoolean = (value: unknown): boolean => value === true;

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  );
};

const contentHash = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');

const workspaceRoot = (): string => path.resolve(process.env.OPENBIOSCIENCE_WORKSPACE_ROOT || process.cwd());

const invalidActionPayload = (
  action: string,
  error: z.ZodError,
  correctedPayload: JsonRecord,
  tool: BioNextAction['tool'] = 'bio_reproduction'
) => {
  const inputFingerprint = contentHash(JSON.stringify(stableValue({ action, correctedPayload })));
  const nextAction: BioNextAction = {
    id: `correct-${action}-payload`,
    tool,
    action,
    reason: `Use the strict action payload: ${formatZodIssues(error).join('; ')}`,
    payload: correctedPayload,
    actionFingerprint: inputFingerprint,
    preconditionHash: inputFingerprint,
    expectedMutation: ['mcp_payload'],
    maxAttempts: 1,
    stopWhenUnchanged: true,
  };
  return {
    schema: 'openbioscience.bio_mcp.result.v2',
    action,
    status: 'invalid_request',
    error: { code: 'INVALID_ACTION_PAYLOAD', issues: formatZodIssues(error) },
    correctedCall: { action, payload: correctedPayload },
    nextActions: [nextAction],
    actionFingerprint: inputFingerprint,
    maxAttempts: 1,
    stopWhenUnchanged: true,
    timestamp: Date.now(),
  };
};

const readStoredReceipt = (
  receiptId: string,
  expectation: { producer: BioControlReceipt['producer']; action?: string; status?: string }
): BioControlReceipt => {
  const receipt = readReceipt(workspaceRoot(), receiptId);
  const parsed = controlReceiptSchema.parse(receipt) as BioControlReceipt;
  if (parsed.producer !== expectation.producer) {
    throw new Error(`Receipt ${receiptId} must be produced by ${expectation.producer}.`);
  }
  if (expectation.action && parsed.action !== expectation.action) {
    throw new Error(`Receipt ${receiptId} must be for ${expectation.action}.`);
  }
  if (expectation.status && parsed.status !== expectation.status) {
    throw new Error(`Receipt ${receiptId} must have status ${expectation.status}.`);
  }
  return parsed;
};

const writeCanonicalJson = (relativePath: string, value: unknown): string => {
  const root = workspaceRoot();
  const target = resolveSafeProjectWritePath(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, target);
  return contentHash(content);
};

const safePathSegment = (value: string): string => value.trim().replace(/[^A-Za-z0-9._-]+/gu, '_').replace(/^_+|_+$/gu, '') || 'unknown';

const explorationSourceRoot = (analysisId: string): string =>
  path.posix.join(stageOutputRelativePath(analysisId, 'exploration'), 'source');

const writeCanonicalText = (relativePath: string, content: string): string => {
  const root = workspaceRoot();
  const target = resolveSafeProjectWritePath(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
  fs.renameSync(temporary, target);
  return contentHash(content);
};

const sourceFileRef = (relativePath: string, hash: string) => ({ path: relativePath, contentHash: hash });

const publicDatasetScore = (candidate: z.infer<typeof publicDatasetCandidateSchema>): number => {
  const sourceScore = /tisch|cancer/i.test(candidate.sourceName) ? 30 : 0;
  const availabilityScore = /public|download|available|open/i.test(candidate.availability) ? 20 : 0;
  const modalityScore = /single|scrna|scRNA/i.test(candidate.modality) ? 15 : 0;
  const countScore = Math.min(20, Math.floor((candidate.cellCount || 0) / 5000));
  return sourceScore + availabilityScore + modalityScore + countScore;
};

const datasetSelectionTsv = (
  candidates: Array<z.infer<typeof publicDatasetCandidateSchema> & { rank: number; score: number; selected: boolean }>
): string => {
  const header = [
    'rank',
    'selected',
    'score',
    'id',
    'sourceName',
    'datasetId',
    'accession',
    'disease',
    'organism',
    'tissue',
    'modality',
    'sampleCount',
    'cellCount',
    'availability',
    'licenseOrTerms',
    'downloadRoute',
    'rationale',
  ];
  const rows = candidates.map((candidate) =>
    header
      .map((key) => String((candidate as unknown as Record<string, unknown>)[key] ?? '').replace(/\t|\r?\n/gu, ' '))
      .join('\t')
  );
  return `${header.join('\t')}\n${rows.join('\n')}\n`;
};

const publicDataPrefix = (sourceName: string, accession: string): string =>
  path.posix.join('data', 'public', safePathSegment(sourceName), safePathSegment(accession));

const normalizeProjectRelativePath = (candidate: string): string =>
  path.posix.normalize(candidate.replaceAll('\\', '/').replace(/^\.\/+/u, ''));

const localizePathStatus = (candidate: string, sourceName: string, accession: string) => {
  const normalized = normalizeProjectRelativePath(candidate);
  const allowedPrefix = publicDataPrefix(sourceName, accession);
  const resolved = resolveWorkspacePath(normalized);
  const allowedAbsolute = path.resolve(workspaceRoot(), allowedPrefix);
  const relativeToAllowed = path.relative(allowedAbsolute, resolved.path);
  const underPublicPrefix =
    !path.posix.isAbsolute(normalized) &&
    normalized !== '..' &&
    !normalized.startsWith('../') &&
    relativeToAllowed !== '..' &&
    !relativeToAllowed.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativeToAllowed);
  return {
    path: normalized,
    resolvedPath: resolved.path,
    status: resolved.status,
    allowedPrefix,
    underPublicPrefix,
  };
};

const downloadFilePolicy = (
  file: z.infer<typeof publicDownloadFileSchema>,
  rawMatrixDownloadApproved: boolean,
  maxBytes: number | undefined
) => {
  const needsRawApproval = file.kind === 'raw_matrix' && !rawMatrixDownloadApproved;
  const exceedsLimit =
    typeof file.expectedBytes === 'number' && typeof maxBytes === 'number' && file.expectedBytes > maxBytes;
  return {
    ...file,
    status: needsRawApproval || exceedsLimit ? 'blocked' : 'planned',
    autoExtract: file.autoExtract ?? file.kind !== 'unknown',
    blockers: [
      ...(needsRawApproval ? ['raw_matrix_download_requires_user_confirmation'] : []),
      ...(exceedsLimit ? [`expected_size_exceeds_maxBytes_${maxBytes}`] : []),
    ],
  };
};

const concreteExpectedDownloadPaths = (plannedFiles: JsonRecord[]): string[] =>
  uniqueStrings(
    plannedFiles
      .map((file) => asString(file.expectedPath))
      .filter((expectedPath) => expectedPath && !/[<>{}*?]/u.test(expectedPath))
      .map(normalizeProjectRelativePath)
  );

const downloadPlanTsv = (
  plannedFiles: ReturnType<typeof downloadFilePolicy>[],
  destinationRoot: string
): string => {
  const header = ['id', 'kind', 'status', 'destinationRoot', 'expectedPath', 'expectedBytes', 'autoExtract', 'blockers'];
  const rows = plannedFiles.map((file) =>
    [
      file.id,
      file.kind,
      file.status,
      destinationRoot,
      file.expectedPath || '',
      file.expectedBytes ?? '',
      String(file.autoExtract),
      file.blockers.join(';'),
    ]
      .map((value) => String(value).replace(/\t|\r?\n/gu, ' '))
      .join('\t')
  );
  return `${header.join('\t')}\n${rows.join('\n')}\n`;
};

const receiptLookupFailure = (action: string, error: unknown) => ({
  schema: 'openbioscience.bio_mcp.result.v2',
  action,
  status: 'invalid_request',
  error: {
    code: 'INVALID_RECEIPT_REFERENCE',
    issues: [error instanceof Error ? error.message : String(error)],
  },
  nextActions: [] as BioNextAction[],
  maxAttempts: 1,
  stopWhenUnchanged: true,
  timestamp: Date.now(),
});

const receiptCanonicalFiles = (receipt: BioControlReceipt): Array<{ path: string; contentHash: string }> => {
  const record = receipt as unknown as JsonRecord;
  const files = asArray(record.canonicalFiles).filter(
    (file): file is JsonRecord =>
      isRecord(file) && typeof file.path === 'string' && typeof file.contentHash === 'string'
  );
  if (isRecord(record.canonicalFile)) files.push(record.canonicalFile);
  return files.map((file) => ({ path: asString(file.path), contentHash: asString(file.contentHash) }));
};

const cachedReceiptIsCurrent = (receipt: BioControlReceipt): boolean => {
  // Analysis actions are state-machine transitions; replaying a cached prepare/complete action can bypass a checkpoint.
  if (receipt.producer === 'bio_analysis') return false;
  if (!['ready', 'supported', 'partial'].includes(receipt.status)) return false;
  if (receipt.producer === 'bio_runtime' && Date.now() - receipt.createdAt > 24 * 60 * 60 * 1000) return false;
  if (receipt.producer === 'bio_runtime' && receipt.action === 'probe_environment') {
    const checks = isRecord(receipt.details?.probe) ? asArray(receipt.details.probe.checks) : [];
    for (const check of checks) {
      if (!isRecord(check)) continue;
      const executable = asString(check.executable);
      if (check.status === 'passed' && executable && !fs.existsSync(executable)) return false;
      if (check.status === 'missing' && executable && fs.existsSync(executable)) return false;
    }
  }
  for (const file of receiptCanonicalFiles(receipt)) {
    const resolved = resolveWorkspacePath(file.path);
    if (resolved.status !== 'available' || !fs.existsSync(resolved.path) || !fs.statSync(resolved.path).isFile()) {
      return false;
    }
    if (contentHash(fs.readFileSync(resolved.path)) !== file.contentHash) return false;
  }
  return true;
};

const receiptProducerForProfile = (profile: BioMcpProfile): BioControlReceipt['producer'] | undefined => {
  if (profile === 'source') return 'bio_source';
  if (profile === 'runtime') return 'bio_runtime';
  if (profile === 'reproduction') return 'bio_reproduction';
  if (profile === 'analysis') return 'bio_analysis';
  if (profile === 'statistics') return 'bio_statistics';
  return undefined;
};

const resolveWorkspacePath = (candidate: string): { path: string; status: 'available' | 'unverified' } => {
  const root = workspaceRoot();
  const resolved = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { path: resolved, status: 'unverified' };
  return { path: resolved, status: safeAbsolutePathStatus(resolved) };
};

const makeControlReceipt = (
  producer: BioControlReceipt['producer'],
  action: string,
  status: string,
  details: JsonRecord
): BioControlReceipt => {
  const projectRoot = workspaceRoot();
  const identity = JSON.stringify(stableValue({ producer, action, status, projectRoot, details }));
  return {
    schema: BIO_RECEIPT_SCHEMA,
    receiptId: `bio_receipt_${contentHash(identity).slice(0, 20)}`,
    producer,
    action,
    status,
    projectRoot,
    createdAt: Date.now(),
    ...(typeof details.validationFingerprint === 'string'
      ? { validationFingerprint: details.validationFingerprint }
      : {}),
    details,
  };
};

const withControlReceipt = <T extends JsonRecord>(
  producer: BioControlReceipt['producer'],
  result: T,
  details: JsonRecord
): T & { receipt: BioControlReceipt } => ({
  ...result,
  receipt: makeControlReceipt(producer, asString(result.action), asString(result.status), details),
});

const firstNumber = (...values: unknown[]): number | undefined => {
  const found = values.find((value) => typeof value === 'number' && Number.isFinite(value));
  return typeof found === 'number' ? found : undefined;
};

const asPositiveInteger = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
};

const runtimeRoot = (): string =>
  process.env.OPENBIOSCIENCE_ENV_ROOT ||
  process.env.OPENBIOSCIENCE_RUNTIME_ROOT ||
  process.env.OPENSCIENCE_RUNTIME_ROOT ||
  process.env.DEEPORGANISER_WORK_DIR ||
  DEFAULT_RUNTIME_ROOT;

const writableCacheEnv = (): Record<string, string> => {
  const cacheRoot = path.join(process.env.DEEPORGANISER_WORK_DIR || os.tmpdir(), 'openbioscience-cache');
  const env = {
    XDG_CACHE_HOME: path.join(cacheRoot, 'xdg'),
    MPLCONFIGDIR: path.join(cacheRoot, 'matplotlib'),
    NUMBA_CACHE_DIR: path.join(cacheRoot, 'numba'),
  };
  for (const dir of Object.values(env)) fs.mkdirSync(dir, { recursive: true });
  return env;
};

const isCredentialKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('token') ||
    normalized.includes('cookie') ||
    normalized.includes('credential') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('apikey') ||
    normalized.includes('api_key') ||
    normalized === 'key' ||
    normalized === 'authorization' ||
    normalized === 'auth' ||
    normalized === 'signature' ||
    normalized === 'sig' ||
    normalized.startsWith('x-amz-')
  );
};

const sanitizeSourceValue = (value: unknown): { value: unknown; redacted: boolean } => {
  if (Array.isArray(value)) {
    let redacted = false;
    const sanitized = value.map((item) => {
      const result = sanitizeSourceValue(item);
      redacted ||= result.redacted;
      return result.value;
    });
    return { value: sanitized, redacted };
  }
  if (typeof value === 'string') return redactCredentialText(value);
  if (!isRecord(value)) return { value, redacted: false };

  let redacted = false;
  const sanitized = Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      if (isCredentialKey(key) && nested) {
        redacted = true;
        return [key, '[redacted]'];
      }
      const result = sanitizeSourceValue(nested);
      redacted ||= result.redacted;
      return [key, result.value];
    })
  );
  return { value: sanitized, redacted };
};

const uniqueSanitizedStrings = (values: unknown[]): string[] =>
  Array.from(new Set(values.map((value) => asString(sanitizeSourceValue(value).value)).filter(Boolean))).sort();

const environmentPath = (environmentRef: string): string =>
  runtimeRoot() === DEFAULT_RUNTIME_ROOT
    ? `${DEFAULT_RUNTIME_ROOT}/environments/official/${environmentRef}`
    : path.join(runtimeRoot(), 'environments', 'official', environmentRef);

const pathStatus = (candidate: string): Exclude<EnvironmentPathStatus, 'unavailable'> =>
  candidate.includes('${') ? 'configured' : fs.existsSync(candidate) ? 'available' : 'missing';

const compactProbeOutput = (value: string | Buffer | null | undefined): string =>
  String(value || '')
    .trim()
    .slice(0, 4_000);

const runEnvironmentProbeCheck = (
  environmentPathValue: string,
  id: string,
  executableName: string,
  args: string[]
): EnvironmentProbeCheck => {
  const executable = path.join(environmentPathValue, 'bin', executableName);
  if (!fs.existsSync(executable)) {
    return { id, executable, status: 'missing', exitCode: null, stdout: '', stderr: 'Executable not found.' };
  }
  const result = spawnSync(executable, args, {
    cwd: environmentPathValue,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...writableCacheEnv(),
      PATH: [path.join(environmentPathValue, 'bin'), process.env.PATH || ''].filter(Boolean).join(path.delimiter),
    },
    timeout: ENVIRONMENT_PROBE_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
  const stderr = compactProbeOutput(result.stderr || result.error?.message);
  return {
    id,
    executable,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    stdout: compactProbeOutput(result.stdout),
    stderr,
  };
};

const probeEnvironment = (resolved: EnvironmentResolution) => {
  if (resolved.pathStatus !== 'available') {
    return {
      mode: 'execution',
      status: 'not_run',
      importChecksRun: false,
      checks: [] as EnvironmentProbeCheck[],
      reason: 'The resolved environment path is not available.',
    };
  }

  const pythonPackagesByEnvironment: Record<string, string[]> = {
    'sc-py-singlecell': ['scanpy', 'anndata'],
  };
  const rPackagesByEnvironment: Record<string, string[]> = {
    'sc-r-singlecell': ['Seurat'],
    'sc-r-plot': ['ggplot2', 'ComplexHeatmap'],
    'sc-r-clinical': ['survival'],
    'sc-cci-r': ['CellChat'],
    'sc-r-trajectory': ['slingshot'],
    'sc-network-grn-r': ['GENIE3', 'decoupleR'],
    'sc-r-tumor-cnv': ['infercnv'],
  };
  const checks: EnvironmentProbeCheck[] = [];
  const pythonPackages = pythonPackagesByEnvironment[resolved.environmentRef];
  const rPackages = rPackagesByEnvironment[resolved.environmentRef];

  if (pythonPackages) {
    const importLines = pythonPackages.map((packageName) => `import ${packageName}`).join('; ');
    checks.push(
      runEnvironmentProbeCheck(resolved.path, 'python-imports', 'python', [
        '-c',
        `${importLines}; import sys; print(sys.version.split()[0]); print('${pythonPackages.join(',')}')`,
      ])
    );
  } else if (rPackages) {
    const packageVector = rPackages.map((packageName) => `\"${packageName}\"`).join(',');
    checks.push(
      runEnvironmentProbeCheck(resolved.path, 'r-imports', 'Rscript', [
        '-e',
        `pkgs <- c(${packageVector}); invisible(lapply(pkgs, function(pkg) suppressPackageStartupMessages(library(pkg, character.only=TRUE)))); cat(R.version.string, \"\\n\"); cat(paste(pkgs, collapse=\",\"), \"\\n\")`,
      ])
    );
  } else {
    const pythonExecutable = path.join(resolved.path, 'bin', 'python');
    const rExecutable = path.join(resolved.path, 'bin', 'Rscript');
    if (fs.existsSync(pythonExecutable)) {
      checks.push(runEnvironmentProbeCheck(resolved.path, 'python-version', 'python', ['--version']));
    } else if (fs.existsSync(rExecutable)) {
      checks.push(runEnvironmentProbeCheck(resolved.path, 'r-version', 'Rscript', ['--version']));
    }
  }

  const passed = checks.length > 0 && checks.every((check) => check.status === 'passed');
  return {
    mode: 'execution',
    status: passed ? 'passed' : 'failed',
    importChecksRun: Boolean(pythonPackages || rPackages),
    checks,
    reason: checks.length ? undefined : 'No supported Python or R executable was found in the environment prefix.',
  };
};

const userEnvironmentIndexDir = (): string =>
  runtimeRoot() === DEFAULT_RUNTIME_ROOT
    ? `${DEFAULT_RUNTIME_ROOT}/manifests/environments/users`
    : path.join(runtimeRoot(), 'manifests', 'environments', 'users');

const userEnvironmentIndexPath = (userId: string): string => path.join(userEnvironmentIndexDir(), `${userId}.json`);

const officialEnvironmentRoot = (): string =>
  runtimeRoot() === DEFAULT_RUNTIME_ROOT
    ? `${DEFAULT_RUNTIME_ROOT}/environments/official`
    : path.join(runtimeRoot(), 'environments', 'official');

const userEnvironmentRoot = (userId: string): string =>
  runtimeRoot() === DEFAULT_RUNTIME_ROOT
    ? `${DEFAULT_RUNTIME_ROOT}/environments/custom/users/${userId}`
    : path.join(runtimeRoot(), 'environments', 'custom', 'users', userId);

const userEnvironmentSuggestedPath = (userId: string, environmentName: string, version: string): string =>
  runtimeRoot() === DEFAULT_RUNTIME_ROOT
    ? `${DEFAULT_RUNTIME_ROOT}/environments/custom/users/${userId}/${environmentName}/${version}`
    : path.join(userEnvironmentRoot(userId), environmentName, version);

const isSafeIdentifier = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value) && !value.includes('..');

const userEnvironmentRef = (userId: string, environmentName: string, version: string): string =>
  `user:${userId}/${environmentName}:${version}`;

const parseUserEnvironmentRef = (
  environmentRef: string
): { userId: string; environmentName: string; version: string } | undefined => {
  const match = /^user:([^/]+)\/([^:]+):(.+)$/u.exec(environmentRef);
  if (!match) return undefined;
  return {
    userId: match[1] || '',
    environmentName: match[2] || '',
    version: match[3] || '',
  };
};

const normalizeUserEnvironmentMetadata = (value: unknown): unknown => {
  const sanitized = sanitizeSourceValue(value).value;
  if (Array.isArray(sanitized)) return uniqueStrings(sanitized);
  if (isRecord(sanitized)) return sanitized;
  return {};
};

const pathStartsWith = (candidate: string, parent: string): boolean => {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
};

const usesOfficialEnvironmentPrefix = (candidate: string): boolean =>
  Boolean(candidate && runtimeRoot() !== DEFAULT_RUNTIME_ROOT && pathStartsWith(candidate, officialEnvironmentRoot()));

const usesUserEnvironmentPrefix = (userId: string, candidate: string): boolean =>
  Boolean(
    candidate &&
    runtimeRoot() !== DEFAULT_RUNTIME_ROOT &&
    isSafeIdentifier(userId) &&
    pathStartsWith(candidate, userEnvironmentRoot(userId))
  );

const safeUserEnvironmentRecord = (userId: string, value: unknown): UserEnvironmentRecord | undefined => {
  if (!isRecord(value)) return undefined;
  const environmentRef = asString(value.environmentRef);
  const environmentPathValue = asString(value.path);
  const owner = asString(value.owner);
  if (!environmentRef || !environmentPathValue || !owner) return undefined;
  const parsed = parseUserEnvironmentRef(environmentRef);
  if (
    !parsed ||
    parsed.userId !== userId ||
    owner !== userId ||
    !isSafeIdentifier(parsed.userId) ||
    !isSafeIdentifier(parsed.environmentName) ||
    !isSafeIdentifier(parsed.version) ||
    !usesUserEnvironmentPrefix(userId, environmentPathValue)
  ) {
    return undefined;
  }
  return {
    environmentRef,
    path: environmentPathValue,
    build: isRecord(value.build) ? value.build : {},
    keyResources: normalizeUserEnvironmentMetadata(value.keyResources),
    keySupports: normalizeUserEnvironmentMetadata(value.keySupports),
    owner,
    status: asString(value.status, 'ready'),
  };
};

const emptyUserEnvironmentIndex = (userId: string): UserEnvironmentIndex => ({
  schema: USER_ENVIRONMENT_INDEX_SCHEMA,
  userId,
  environments: [],
  updatedAt: new Date(0).toISOString(),
});

const readUserEnvironmentIndex = (userId: string): UserEnvironmentIndex => {
  if (!isSafeIdentifier(userId) || runtimeRoot() === DEFAULT_RUNTIME_ROOT) return emptyUserEnvironmentIndex(userId);
  const indexPath = userEnvironmentIndexPath(userId);
  if (!fs.existsSync(indexPath)) return emptyUserEnvironmentIndex(userId);
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (!isRecord(parsed)) return emptyUserEnvironmentIndex(userId);
    return {
      schema: asString(parsed.schema, USER_ENVIRONMENT_INDEX_SCHEMA),
      userId,
      environments: asArray(parsed.environments)
        .map((record) => safeUserEnvironmentRecord(userId, record))
        .filter((record): record is UserEnvironmentRecord => Boolean(record)),
      updatedAt: asString(parsed.updatedAt, new Date(0).toISOString()),
    };
  } catch {
    return emptyUserEnvironmentIndex(userId);
  }
};

const writeUserEnvironmentIndex = (index: UserEnvironmentIndex): string => {
  const indexPath = userEnvironmentIndexPath(index.userId);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return indexPath;
};

const profileFromEnv = (): BioMcpProfile => resolveBioProfile(process.env.OPENBIOSCIENCE_BIO_MCP_PROFILE);

const definitionFor = (profile: BioMcpProfile) => BIO_MCP_PROFILES[profile];

const missingFields = (payload: JsonRecord | undefined, fields: string[]): string[] =>
  fields.filter((field) => !asString(payload?.[field]));

const catalogById = (items: BioMcpCatalogItem[], id?: string): BioMcpCatalogItem | undefined =>
  id ? items.find((item) => item.id === id) : undefined;

const resolveEnvironment = (environmentRef: string): EnvironmentResolution => {
  const userRef = parseUserEnvironmentRef(environmentRef);
  if (userRef) {
    const record = readUserEnvironmentIndex(userRef.userId).environments.find(
      (environment) => environment.environmentRef === environmentRef
    );
    if (!record) {
      return {
        environmentRef,
        pathStatus: 'unavailable',
        path: '',
        warnings: [`Unknown user environmentRef "${environmentRef}".`],
      };
    }
    return {
      environmentRef,
      pathStatus: pathStatus(record.path),
      path: record.path,
      userEnvironment: record,
      warnings: [],
    };
  }
  const catalog = catalogById(BIO_ENVIRONMENTS, environmentRef);
  const resolvedPath = environmentPath(environmentRef);
  return {
    environmentRef,
    pathStatus: pathStatus(resolvedPath),
    path: resolvedPath,
    ...(catalog ? { catalog } : {}),
    warnings: catalog ? [] : [`Unknown environmentRef "${environmentRef}".`],
  };
};

const statusPayload = (profile: BioMcpProfile) => {
  const definition = definitionFor(profile);
  return {
    schema: RESULT_SCHEMA,
    action: 'status',
    status:
      profile === 'reproduction' || profile === 'analysis' || profile === 'statistics' || profile === 'benchmark'
        ? 'ready'
        : 'supported',
    profile,
    serverName: definition.serverName,
    toolName: definition.toolName,
    runtimeRoot: runtimeRoot(),
    actions: definition.actions,
    environmentIndex: `${runtimeRoot()}/environments/official/README.md`,
    notes: [
      'This MCP exposes OpenBioScience control-plane contracts only.',
      'Use science_artifact to record concrete evidence, outputs, warnings, and blocked claims.',
      'Official environment paths are resolved from OPENBIOSCIENCE_RUNTIME_ROOT when configured.',
    ],
    ...(profile === 'reproduction'
      ? {
          planningOnly: true,
          planningStatuses: REPRODUCTION_PLANNING_STATUSES,
          localizationPolicy: {
            defaultSingleFileLimitBytes: DEFAULT_REPRODUCTION_FILE_LIMIT_BYTES,
            publicHttpOnly: true,
            noCredentialsCookiesOrTokens: true,
            overwriteDefault: false,
            executesAnalysis: false,
            installsPackages: false,
            clonesRepositories: false,
            performsHeavyDownloads: false,
          },
        }
      : {}),
    timestamp: Date.now(),
  };
};

const handleStatisticsAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') {
    return {
      ...statusPayload('statistics'),
      minimumBiologicalReplicates: 3,
      supportedConditionDeMethod: 'edgeR pseudobulk quasi-likelihood',
      contrastStatuses: ['tested', 'blocked_insufficient_replicates', 'blocked_invalid_design', 'failed'],
    };
  }

  if (action === 'validate_expression_contract') {
    const result = validateExpressionContract(workspaceRoot(), payload || {});
    return withControlReceipt(
      'bio_statistics',
      {
        schema: RESULT_SCHEMA,
        action,
        ...result,
        timestamp: Date.now(),
      },
      {
        validationFingerprint: result.validationFingerprint,
        checks: result.checks,
      }
    );
  }

  if (action === 'validate_de_design') {
    const result = validateDeDesign(workspaceRoot(), payload || {});
    const response = {
      schema: RESULT_SCHEMA,
      action,
      ...result,
      minimumReplicates: 3,
      timestamp: Date.now(),
    };
    if (!result.value || !result.contrasts) return response;
    const receipt = buildDesignReceipt(
      makeControlReceipt('bio_statistics', action, result.status, {
        validationFingerprint: result.validationFingerprint,
        checks: result.checks,
      }),
      result.value,
      result.contrasts,
      result.nextActions
    );
    return { ...response, receipt };
  }

  if (action === 'validate_de_outputs') {
    const result = validateDeOutputs(workspaceRoot(), payload || {});
    const response = {
      schema: RESULT_SCHEMA,
      action,
      ...result,
      timestamp: Date.now(),
    };
    if (result.status !== 'ready' || !result.value || !result.canonicalFiles) return response;
    const completionReceipt = buildCompletionReceipt(
      makeControlReceipt('bio_statistics', action, result.status, {
        validationFingerprint: result.validationFingerprint,
        checks: result.checks,
      }),
      result.value,
      result.canonicalFiles,
      result.nextActions
    );
    return { ...response, completionReceipt };
  }

  throw new Error(`Unsupported statistics action "${action}".`);
};

const handleRuntimeAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') return statusPayload('runtime');
  if (action === 'record_execution') {
    const parsed = recordExecutionByIdPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      return invalidActionPayload(
        action,
        parsed.error,
        {
          scriptValidationReceiptId: asString(
            payload?.scriptValidationReceiptId,
            isRecord(payload?.scriptValidationReceipt) ? asString(payload.scriptValidationReceipt.receiptId) : ''
          ),
          startedAt: payload?.startedAt,
          finishedAt: payload?.finishedAt,
          exitCode: payload?.exitCode,
          scriptFiles: asArray(payload?.scriptFiles),
          configFiles: asArray(payload?.configFiles),
          logFiles: asArray(payload?.logFiles),
          outputFiles: asArray(payload?.outputFiles),
        },
        'bio_runtime'
      );
    }
    try {
      return recordExecution(workspaceRoot(), {
        scriptValidationReceipt: readStoredReceipt(parsed.data.scriptValidationReceiptId, {
          producer: 'bio_reproduction',
          action: 'preflight_execution_scripts',
          status: 'ready',
        }),
        startedAt: parsed.data.startedAt,
        finishedAt: parsed.data.finishedAt,
        exitCode: parsed.data.exitCode,
        scriptFiles: parsed.data.scriptFiles,
        configFiles: parsed.data.configFiles,
        logFiles: parsed.data.logFiles,
        outputFiles: parsed.data.outputFiles,
      });
    } catch (error) {
      return receiptLookupFailure(action, error);
    }
  }
  if (action === 'list_environments') {
    const userId = asString(payload?.userId || payload?.user_id);
    const userEnvironments = userId
      ? readUserEnvironmentIndex(userId).environments.map((environment) => ({
          ...environment,
          pathStatus: pathStatus(environment.path),
          source: 'user',
        }))
      : [];
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'supported',
      runtimeRoot: runtimeRoot(),
      environments: [
        ...BIO_ENVIRONMENTS.map((environment) => ({
          ...environment,
          environmentRef: environment.id,
          path: environmentPath(environment.id),
          pathStatus: pathStatus(environmentPath(environment.id)),
          source: 'official',
        })),
        ...userEnvironments,
      ],
      timestamp: Date.now(),
    };
  }
  if (action === 'probe_environments') {
    const parsed = z
      .object({ environmentRefs: z.array(z.string().min(1)).min(1) })
      .strict()
      .safeParse(payload || {});
    if (!parsed.success) {
      return invalidActionPayload(
        action,
        parsed.error,
        {
          environmentRefs: uniqueStrings([
            ...asArray(payload?.environmentRefs),
            ...(asString(payload?.environmentRef) ? [asString(payload?.environmentRef)] : []),
          ]),
        },
        'bio_runtime'
      );
    }
    const probes = uniqueStrings(parsed.data.environmentRefs).map((environmentRef) => {
      const resolved = resolveEnvironment(environmentRef);
      const probe = probeEnvironment(resolved);
      const blocked = resolved.pathStatus === 'unavailable';
      const probeFailed = probe.status === 'failed';
      const result = {
        schema: RESULT_SCHEMA,
        action: 'probe_environment',
        ...resolved,
        status: blocked ? 'blocked' : resolved.pathStatus === 'missing' || probeFailed ? 'conditional' : 'supported',
        probe,
        timestamp: Date.now(),
      };
      return withControlReceipt('bio_runtime', result, {
        environmentRef,
        path: resolved.path,
        pathStatus: resolved.pathStatus,
        probe,
      });
    });
    const compositeReceipt = makeControlReceipt(
      'bio_runtime',
      action,
      probes.every((item) => item.probe.status === 'passed') ? 'ready' : 'partial',
      {
        probes: probes.map((item) => ({
          environmentRef: item.environmentRef,
          path: item.path,
          pathStatus: item.pathStatus,
          probe: item.probe,
          receiptId: item.receipt.receiptId,
        })),
      }
    );
    return {
      schema: 'openbioscience.bio_mcp.result.v2',
      action,
      status: compositeReceipt.status,
      receiptId: compositeReceipt.receiptId,
      receipt: compositeReceipt,
      probes,
      nextActions: [] as BioNextAction[],
      timestamp: Date.now(),
    };
  }
  if (action === 'resolve_environment' || action === 'probe_environment') {
    const environmentRef = asString(payload?.environmentRef || payload?.environment_ref);
    if (!environmentRef) throw new Error(`${action} requires environmentRef.`);
    const resolved = resolveEnvironment(environmentRef);
    const blocked = resolved.pathStatus === 'unavailable';
    const probe =
      action === 'probe_environment'
        ? probeEnvironment(resolved)
        : {
            mode: 'not_run',
            status: 'not_run',
            importChecksRun: false,
            checks: [] as EnvironmentProbeCheck[],
            reason: 'Use probe_environment to run executable and package import checks.',
          };
    const probeFailed = action === 'probe_environment' && probe.status === 'failed';
    const result = {
      schema: RESULT_SCHEMA,
      action,
      ...resolved,
      status: blocked ? 'blocked' : resolved.pathStatus === 'missing' || probeFailed ? 'conditional' : 'supported',
      probe,
      timestamp: Date.now(),
    };
    return action === 'probe_environment'
      ? withControlReceipt('bio_runtime', result, {
          environmentRef,
          path: resolved.path,
          pathStatus: resolved.pathStatus,
          probe,
        })
      : result;
  }
  if (action === 'list_workflows') {
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'supported',
      workflows: BIO_WORKFLOWS,
      timestamp: Date.now(),
    };
  }
  if (action === 'validate_workflow') {
    const workflowId = asString(payload?.workflowId || payload?.workflow_id);
    const workflow = catalogById(BIO_WORKFLOWS, workflowId);
    if (!workflow) {
      return {
        schema: RESULT_SCHEMA,
        action,
        status: 'blocked',
        workflowId,
        warnings: [`Unknown workflowId "${workflowId || '<missing>'}".`],
        knownWorkflows: BIO_WORKFLOWS.map((item) => item.id),
        timestamp: Date.now(),
      };
    }
    const required = workflow.requiredFields || [];
    const missing = missingFields(isRecord(payload?.config) ? payload.config : payload, required);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: missing.length ? 'conditional' : 'supported',
      workflow,
      missingFields: missing,
      environmentCandidates: workflow.environmentRefs?.map(resolveEnvironment) || [],
      timestamp: Date.now(),
    };
  }
  if (action === 'list_plot_templates') {
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'supported',
      templates: BIO_PLOT_TEMPLATES,
      timestamp: Date.now(),
    };
  }
  if (action === 'validate_plot_inputs') {
    return validatePlotInputs(action, payload);
  }
  if (action === 'summarize_outputs') {
    const outputPaths = uniqueStrings(asArray(payload?.outputPaths || payload?.output_paths));
    return {
      schema: RESULT_SCHEMA,
      action,
      status: outputPaths.length ? 'conditional' : 'blocked',
      outputPaths,
      summaries: outputPaths.map((outputPath) => ({
        path: outputPath,
        status: safeAbsolutePathStatus(outputPath),
      })),
      warnings: outputPaths.length ? [] : ['summarize_outputs requires outputPaths.'],
      timestamp: Date.now(),
    };
  }
  throw new Error(`Unsupported runtime action "${action}".`);
};

const validatePlotInputs = (action: string, payload?: JsonRecord) => {
  const recipeId = asString(payload?.recipe || payload?.recipeId || payload?.recipe_id);
  if (recipeId) {
    const validation = validatePlotSpec(payload || {});
    return {
      schema: RESULT_SCHEMA,
      action,
      status: validation.status,
      recipeId,
      recipe: validation.recipe,
      missingFields: validation.missingFields,
      warnings: validation.warnings,
      timestamp: Date.now(),
    };
  }
  const templateId = asString(payload?.templateId || payload?.template_id);
  const template = catalogById(BIO_PLOT_TEMPLATES, templateId);
  if (!template) {
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'blocked',
      templateId,
      warnings: [`Unknown templateId "${templateId || '<missing>'}".`],
      knownTemplates: BIO_PLOT_TEMPLATES.map((item) => item.id),
      timestamp: Date.now(),
    };
  }
  const required = template.requiredFields || [];
  const missing = missingFields(isRecord(payload?.config) ? payload.config : payload, required);
  return {
    schema: RESULT_SCHEMA,
    action,
    status: missing.length ? 'conditional' : 'supported',
    template,
    missingFields: missing,
    manifestSchema: 'openbioscience.scrna_plot.manifest.v1',
    timestamp: Date.now(),
  };
};

const plotObjectiveForAction = (action: string): BioPlotObjective | undefined => {
  if (action === 'render_embedding') return 'embedding';
  if (action === 'render_expression_matrix') return 'expression';
  if (action === 'render_composition') return 'composition';
  if (action === 'render_differential') return 'differential';
  if (action === 'render_trajectory') return 'trajectory';
  if (action === 'render_communication') return 'communication';
  if (action === 'render_cnv') return 'cnv';
  return undefined;
};

const plotSpecPayload = (action: string, payload?: JsonRecord): JsonRecord => {
  const objective = plotObjectiveForAction(action);
  const base = isRecord(payload?.spec) ? payload.spec : payload || {};
  return objective && !base.objective ? { ...base, objective } : base;
};

const inspectSingleCellObjectPlan = (action: string, payload?: JsonRecord) => {
  const objectPath = asString(payload?.objectPath || payload?.object_path || payload?.path);
  const objectType = asString(payload?.objectType || payload?.object_type);
  const expectedFields = ['objectPath', 'objectType', 'assays', 'reductions', 'metadataColumns'];
  const declaredFields = {
    objectPath,
    objectType,
    assays: uniqueStrings(asArray(payload?.assays)),
    reductions: uniqueStrings(asArray(payload?.reductions)),
    metadataColumns: uniqueStrings(asArray(payload?.metadataColumns || payload?.metadata_columns)),
    features: uniqueStrings(asArray(payload?.features)),
  };
  const missingFields = expectedFields.filter((field) => {
    const value = declaredFields[field as keyof typeof declaredFields];
    return Array.isArray(value) ? value.length === 0 : !value;
  });
  return {
    schema: RESULT_SCHEMA,
    action,
    status: missingFields.length ? 'conditional' : 'ready',
    objectSummary: declaredFields,
    inspectionContract: {
      supportedObjectTypes: ['rds', 'h5seurat', 'h5ad', 'table_bundle'],
      requiredChecks: ['assays_or_layers', 'reductions', 'metadata_columns', 'cell_count', 'feature_count'],
      execution: 'planned_only_in_current_mcp_profile',
    },
    missingFields,
    warnings: missingFields.length
      ? ['Provide object summary fields or run an approved local R/Python object inspector before rendering.']
      : [],
    timestamp: Date.now(),
  };
};

const exportFigureBundlePlan = (action: string, payload?: JsonRecord) => {
  const figureFiles = uniqueStrings(asArray(payload?.figureFiles || payload?.figure_files));
  const configFiles = uniqueStrings(asArray(payload?.configFiles || payload?.config_files));
  const logFiles = uniqueStrings(asArray(payload?.logFiles || payload?.log_files));
  const missingFields = [
    ...(!figureFiles.length ? ['figureFiles'] : []),
    ...(!configFiles.length ? ['configFiles'] : []),
    ...(!logFiles.length ? ['logFiles'] : []),
  ];
  return {
    schema: RESULT_SCHEMA,
    action,
    status: missingFields.length ? 'conditional' : 'ready',
    bundleContract: {
      manifestSchema: 'openbioscience.scrna_plot.manifest.v1',
      requiredFields: [
        'inputObjectSummary',
        'recipe',
        'actualRFunction',
        'parameters',
        'packageVersions',
        'rVersion',
        'seed',
        'warnings',
        'outputFiles',
        'sampling',
        'dataModified',
      ],
      figureFiles,
      configFiles,
      logFiles,
    },
    missingFields,
    warnings: missingFields.length ? ['A figure bundle needs figures, config/code, and logs before Science publication.'] : [],
    timestamp: Date.now(),
  };
};

const userEnvironmentRequiredFields = [
  'userId',
  'environmentName',
  'version',
  'path',
  'build',
  'keyResources',
  'keySupports',
];

const userEnvironmentPlan = (action: string, payload?: JsonRecord) => {
  const userId = asString(payload?.userId || payload?.user_id);
  const environmentName = asString(payload?.environmentName || payload?.environment_name);
  const version = asString(payload?.version, 'v1');
  const environmentRef =
    userId && environmentName && version ? userEnvironmentRef(userId, environmentName, version) : '';
  const parentEnvironmentRef = asString(
    payload?.parentEnvironmentRef ||
      payload?.parent_environment_ref ||
      payload?.baseEnvironmentRef ||
      payload?.base_environment_ref
  );
  const invalidIdentifiers = [
    userId && !isSafeIdentifier(userId) ? 'userId' : '',
    environmentName && !isSafeIdentifier(environmentName) ? 'environmentName' : '',
    version && !isSafeIdentifier(version) ? 'version' : '',
  ].filter(Boolean);
  return {
    schema: RESULT_SCHEMA,
    action,
    status: userId && environmentName && version && !invalidIdentifiers.length ? 'planned_only' : 'blocked',
    planningOnly: true,
    environmentRef,
    parentEnvironmentRef: parentEnvironmentRef || undefined,
    path: userId && environmentName && version ? userEnvironmentSuggestedPath(userId, environmentName, version) : '',
    requiredFields: userEnvironmentRequiredFields,
    agentExecutesBuild: true,
    executesCondaOrMamba: false,
    registerWithAction: 'register_user_environment',
    warnings: invalidIdentifiers.length
      ? [`Invalid identifier fields: ${invalidIdentifiers.join(', ')}.`]
      : [
          'This MCP returns a user environment contract only. The agent/runtime must create, derive, and debug the actual environment outside this MCP.',
        ],
    timestamp: Date.now(),
  };
};

const handleBenchmarkAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') {
    return {
      ...statusPayload('benchmark'),
      benchmarkContract: {
        stateSchema: 'openbioscience.bio_benchmark.state.v1',
        transitionModel: 'blind_freeze_reveal_evaluate',
        controlRoot: '.openbioscience/control/benchmark/v1',
        outputRootPattern: 'benchmarks/<benchmarkId>',
      },
      supportedKinds: ['variant_structure_mapping', 'interface_ddg', 'sequence_recovery', 'generic'],
      requiredBoundary:
        'Truth-bearing fields must be absent from blind predictions and only joined after prediction freeze.',
    };
  }
  const record = payload || {};
  const { state, ...actionPayload } = record;
  const currentState = isRecord(state) ? (state as Parameters<typeof applyBenchmarkAction>[0]) : undefined;
  const nextState = applyBenchmarkAction(currentState, { action, ...actionPayload });
  return {
    schema: RESULT_SCHEMA,
    action,
    status: nextState.status,
    benchmarkId: nextState.benchmarkId,
    revision: nextState.revision,
    controlPath: benchmarkControlRelativePath(nextState.benchmarkId),
    defaultOutputRoot: benchmarkOutputRelativePath(nextState.benchmarkId),
    declaredOutputRoot: nextState.plan.outputRoot,
    state: nextState,
  };
};

const handleEnvironmentManagerAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') {
    return {
      ...statusPayload('environment_manager'),
      userEnvironmentIndex: userEnvironmentIndexDir(),
      officialEnvironmentsImmutable: true,
      agentExecutesBuild: true,
    };
  }

  if (action === 'create_user_environment' || action === 'derive_user_environment') {
    return userEnvironmentPlan(action, payload);
  }

  if (action === 'list_user_environments') {
    const userId = asString(payload?.userId || payload?.user_id);
    if (!userId || !isSafeIdentifier(userId)) {
      return {
        schema: RESULT_SCHEMA,
        action,
        status: 'blocked',
        userId,
        environments: [] as UserEnvironmentRecord[],
        warnings: ['list_user_environments requires a safe userId.'],
        timestamp: Date.now(),
      };
    }
    const index = readUserEnvironmentIndex(userId);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'ready',
      userId,
      indexPath: runtimeRoot() === DEFAULT_RUNTIME_ROOT ? '' : userEnvironmentIndexPath(userId),
      environments: index.environments,
      timestamp: Date.now(),
    };
  }

  if (action === 'register_user_environment') {
    const userId = asString(payload?.userId || payload?.user_id);
    const environmentName = asString(payload?.environmentName || payload?.environment_name);
    const version = asString(payload?.version);
    const environmentPathValue = asString(payload?.path || payload?.environmentPath || payload?.environment_path);
    const build = isRecord(payload?.build) ? payload.build : {};
    const keyResourcesPayload = payload?.keyResources ?? payload?.key_resources;
    const keySupportsPayload = payload?.keySupports ?? payload?.key_supports;
    const keyResources = normalizeUserEnvironmentMetadata(keyResourcesPayload);
    const keySupports = normalizeUserEnvironmentMetadata(keySupportsPayload);
    const hasKeyResources = Array.isArray(keyResourcesPayload) || isRecord(keyResourcesPayload);
    const hasKeySupports = Array.isArray(keySupportsPayload) || isRecord(keySupportsPayload);
    const missing = [
      userId ? '' : 'userId',
      environmentName ? '' : 'environmentName',
      version ? '' : 'version',
      environmentPathValue ? '' : 'path',
      isRecord(payload?.build) ? '' : 'build',
      hasKeyResources ? '' : 'keyResources',
      hasKeySupports ? '' : 'keySupports',
    ].filter(Boolean);
    const invalidIdentifiers = [
      userId && !isSafeIdentifier(userId) ? 'userId' : '',
      environmentName && !isSafeIdentifier(environmentName) ? 'environmentName' : '',
      version && !isSafeIdentifier(version) ? 'version' : '',
    ].filter(Boolean);
    const officialPrefixBlocked = usesOfficialEnvironmentPrefix(environmentPathValue);
    const userPrefixBlocked = Boolean(
      userId &&
      isSafeIdentifier(userId) &&
      environmentPathValue &&
      !usesUserEnvironmentPrefix(userId, environmentPathValue)
    );
    const warnings = [
      ...missing.map((field) => `Missing required field: ${field}.`),
      invalidIdentifiers.length ? `Invalid identifier fields: ${invalidIdentifiers.join(', ')}.` : '',
      officialPrefixBlocked ? 'User environment path must not use official env prefix.' : '',
      userPrefixBlocked ? 'User environment path must live under the owner custom env root.' : '',
    ].filter(Boolean);
    const environmentRef =
      userId && environmentName && version ? userEnvironmentRef(userId, environmentName, version) : '';
    if (warnings.length || !environmentRef) {
      return {
        schema: RESULT_SCHEMA,
        action,
        status: 'blocked',
        environmentRef,
        path: environmentPathValue,
        warnings,
        timestamp: Date.now(),
      };
    }

    const record: UserEnvironmentRecord = {
      environmentRef,
      path: environmentPathValue,
      build,
      keyResources,
      keySupports,
      owner: userId,
      status: pathStatus(environmentPathValue) === 'available' ? 'ready' : 'blocked',
    };
    const index = readUserEnvironmentIndex(userId);
    const nextIndex: UserEnvironmentIndex = {
      schema: USER_ENVIRONMENT_INDEX_SCHEMA,
      userId,
      environments: [
        ...index.environments.filter((environment) => environment.environmentRef !== environmentRef),
        record,
      ].sort((left, right) => left.environmentRef.localeCompare(right.environmentRef)),
      updatedAt: new Date().toISOString(),
    };
    const indexPath = writeUserEnvironmentIndex(nextIndex);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: record.status,
      environmentRef,
      path: environmentPathValue,
      pathStatus: pathStatus(environmentPathValue),
      indexPath,
      environment: record,
      warnings:
        record.status === 'ready'
          ? []
          : ['Registered path is not currently available; runtime resolve/probe will remain conditional.'],
      timestamp: Date.now(),
    };
  }

  throw new Error(`Unsupported environment_manager action "${action}".`);
};

const handleSourceAction = async (action: string, payload?: JsonRecord) => {
  if (action === 'index_paper_sources') return indexPaperSources(workspaceRoot(), payload || {});
  if (action === 'status') return statusPayload('source');
  if (action === 'rank_dataset_candidates') {
    const parsed = rankDatasetCandidatesPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      return invalidActionPayload(
        action,
        parsed.error,
        {
          analysisId: asString(payload?.analysisId),
          query: asString(payload?.query),
          disease: asString(payload?.disease),
          organism: asString(payload?.organism, 'human'),
          modality: asString(payload?.modality, 'scRNA-seq'),
          candidates: asArray(payload?.candidates),
        },
        'bio_source'
      );
    }
    const sourceRoot = explorationSourceRoot(parsed.data.analysisId);
    const ranked = parsed.data.candidates
      .map((candidate) => ({ ...candidate, score: publicDatasetScore(candidate) }))
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
        selected: parsed.data.selectedCandidateId
          ? candidate.id === parsed.data.selectedCandidateId
          : index === 0,
      }));
    const selected = ranked.find((candidate) => candidate.selected);
    const candidatesPath = path.posix.join(sourceRoot, 'dataset_candidates.json');
    const selectionPath = path.posix.join(sourceRoot, 'dataset_selection.tsv');
    const candidatesHash = writeCanonicalJson(candidatesPath, {
      schema: 'openbioscience.public_dataset_candidates.v1',
      query: parsed.data.query,
      disease: parsed.data.disease,
      organism: parsed.data.organism,
      modality: parsed.data.modality,
      candidates: ranked,
      selectedCandidateId: selected?.id,
      timestamp: new Date().toISOString(),
    });
    const selectionHash = writeCanonicalText(selectionPath, datasetSelectionTsv(ranked));
    const canonicalFiles = [sourceFileRef(candidatesPath, candidatesHash), sourceFileRef(selectionPath, selectionHash)];
    const result = {
      schema: RESULT_SCHEMA,
      action,
      status: selected ? 'ready' : 'blocked',
      analysisId: parsed.data.analysisId,
      selectedCandidate: selected,
      rankedCandidates: ranked,
      canonicalFiles,
      nextActions: selected
        ? [
            {
              id: 'prepare-selected-public-download',
              tool: 'bio_source',
              action: 'prepare_public_download',
              reason:
                'Plan processed-object, metadata, supplement, and optional raw-matrix downloads before localizing selected public data.',
              payload: {
                analysisId: parsed.data.analysisId,
                sourceName: selected.sourceName,
                datasetId: selected.datasetId,
                accession: selected.accession || selected.datasetId,
                downloadRoute: selected.downloadRoute,
                rawMatrixDownloadApproved: false,
                autoExtract: true,
                files: [
                  {
                    id: 'selected_public_dataset',
                    kind: 'processed_matrix',
                    accession: selected.accession || selected.datasetId,
                    expectedPath: `${publicDataPrefix(
                      selected.sourceName,
                      selected.accession || selected.datasetId
                    )}/<downloaded-file>`,
                  },
                ],
              },
            },
          ]
        : [],
      timestamp: Date.now(),
    };
    return withControlReceipt('bio_source', result, {
      analysisId: parsed.data.analysisId,
      query: parsed.data.query,
      disease: parsed.data.disease,
      selectedCandidate: selected,
      canonicalFiles,
    });
  }
  if (action === 'prepare_public_download') {
    const parsed = preparePublicDownloadPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      return invalidActionPayload(
        action,
        parsed.error,
        {
          analysisId: asString(payload?.analysisId),
          downloadPlanReceiptId: asString(payload?.downloadPlanReceiptId),
          sourceName: asString(payload?.sourceName),
          datasetId: asString(payload?.datasetId),
          accession: asString(payload?.accession),
          downloadRoute: asString(payload?.downloadRoute),
          files: asArray(payload?.files),
        },
        'bio_source'
      );
    }
    const sourceRoot = explorationSourceRoot(parsed.data.analysisId);
    const destinationRoot = publicDataPrefix(parsed.data.sourceName, parsed.data.accession);
    const plannedFiles = parsed.data.files.map((file) =>
      downloadFilePolicy(file, parsed.data.rawMatrixDownloadApproved, parsed.data.maxBytes)
    );
    const blockedFiles = plannedFiles.filter((file) => file.status === 'blocked');
    const status = blockedFiles.length ? 'blocked' : 'ready';
    const planPath = path.posix.join(sourceRoot, 'download_plan.json');
    const planTablePath = path.posix.join(sourceRoot, 'download_plan.tsv');
    const plan = {
      schema: 'openbioscience.public_download_plan.v1',
      analysisId: parsed.data.analysisId,
      sourceName: parsed.data.sourceName,
      datasetId: parsed.data.datasetId,
      accession: parsed.data.accession,
      downloadRoute: parsed.data.downloadRoute,
      destinationRoot,
      rawMatrixDownloadApproved: parsed.data.rawMatrixDownloadApproved,
      autoExtract: parsed.data.autoExtract,
      maxBytes: parsed.data.maxBytes ?? null,
      files: plannedFiles,
      evidenceIds: parsed.data.evidenceIds || [],
      notes: parsed.data.notes || [],
      timestamp: new Date().toISOString(),
    };
    const planHash = writeCanonicalJson(planPath, { ...plan, status });
    const planTableHash = writeCanonicalText(planTablePath, downloadPlanTsv(plannedFiles, destinationRoot));
    const canonicalFiles = [sourceFileRef(planPath, planHash), sourceFileRef(planTablePath, planTableHash)];
    const result = {
      schema: RESULT_SCHEMA,
      action,
      status,
      analysisId: parsed.data.analysisId,
      plan,
      canonicalFiles,
      warnings: blockedFiles.flatMap((file) => file.blockers.map((blocker) => `${file.id}: ${blocker}`)),
      nextActions: blockedFiles.length
        ? [
            {
              id: 'confirm-raw-or-adjust-download',
              tool: 'user_input',
              action: 'request',
              reason:
                'The selected public dataset plan includes raw matrix files or files above the configured size boundary.',
            },
          ]
        : [
            {
              id: 'run-public-download-and-record',
              tool: 'bio_source',
              action: 'complete_public_download',
              reason: 'After downloading and extracting planned files, record concrete paths and file status.',
              payload: {
                analysisId: parsed.data.analysisId,
                downloadPlanReceiptId: '<receiptId from prepare_public_download>',
                sourceName: parsed.data.sourceName,
                datasetId: parsed.data.datasetId,
                accession: parsed.data.accession,
                downloadRoute: parsed.data.downloadRoute,
                downloadedPaths: [`${destinationRoot}/<downloaded-file>`],
                command: '<download-command>',
                rawMatrixDownloadApproved: parsed.data.rawMatrixDownloadApproved,
              },
            },
          ],
      timestamp: Date.now(),
    };
    return withControlReceipt('bio_source', result, {
      analysisId: parsed.data.analysisId,
      sourceName: parsed.data.sourceName,
      datasetId: parsed.data.datasetId,
      accession: parsed.data.accession,
      downloadRoute: parsed.data.downloadRoute,
      status,
      destinationRoot,
      rawMatrixDownloadApproved: parsed.data.rawMatrixDownloadApproved,
      plannedFiles,
      canonicalFiles,
    });
  }
  if (action === 'resolve_accession') {
    const accession = asString(payload?.accession);
    const sourceHint = asString(payload?.source || payload?.sourceHint || payload?.source_hint, 'auto');
    const result = {
      schema: RESULT_SCHEMA,
      action,
      status: accession ? 'conditional' : 'blocked',
      accession,
      sourceHint,
      candidateSources: accession ? inferAccessionSources(accession) : [],
      nextActions: accession
        ? [
            'Use research_evidence for paper/source context.',
            'Use bio_source plan_download after confirming access rights.',
          ]
        : ['Provide GEO/SRA/ArrayExpress/EGA/BioStudies/Zenodo/Figshare accession or local path.'],
      timestamp: Date.now(),
    };
    return withControlReceipt('bio_source', result, {
      accession,
      sourceHint,
      candidateSources: result.candidateSources,
    });
  }
  if (action === 'verify_local_assets' || action === 'build_data_manifest') {
    const paths = uniqueStrings(asArray(payload?.paths || payload?.inputPaths || payload?.input_paths));
    const assets = paths.map((assetPath) => {
      const resolved = resolveWorkspacePath(assetPath);
      return { path: assetPath, resolvedPath: resolved.path, status: resolved.status };
    });
    const result = {
      schema: RESULT_SCHEMA,
      action,
      status: paths.length ? 'conditional' : 'blocked',
      assets,
      manifestSchema: 'openbioscience.data_manifest.v1',
      warnings: paths.length ? [] : [`${action} requires paths.`],
      timestamp: Date.now(),
    };
    return withControlReceipt('bio_source', result, { assets });
  }
  if (action === 'plan_download') {
    const accession = asString(payload?.accession);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: accession ? 'conditional' : 'blocked',
      accession,
      plan: accession
        ? {
            accessPolicy: 'verify_before_download',
            controlledAccess: inferControlledAccess(accession),
            automaticDownload: false,
          }
        : undefined,
      warnings: accession ? [] : ['plan_download requires accession.'],
      timestamp: Date.now(),
    };
  }
  if (action === 'complete_localization') {
    const parsed = completeLocalizationPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      return invalidActionPayload(
        action,
        parsed.error,
        {
          analysisId: asString(payload?.analysisId),
          sourceName: asString(payload?.sourceName),
          datasetId: asString(payload?.datasetId),
          accession: asString(payload?.accession),
          downloadRoute: asString(payload?.downloadRoute),
          localizedPaths: asArray(payload?.localizedPaths),
        },
        'bio_source'
      );
    }
    const sourceRoot = explorationSourceRoot(parsed.data.analysisId);
    const localized = parsed.data.localizedPaths.map((candidate) =>
      localizePathStatus(candidate, parsed.data.sourceName, parsed.data.accession)
    );
    const missing = localized.filter((item) => item.status !== 'available');
    const outsidePublicPrefix = localized.filter((item) => !item.underPublicPrefix);
    const status = missing.length || outsidePublicPrefix.length ? 'blocked' : 'ready';
    const dataManifestPath = path.posix.join(sourceRoot, 'data_manifest.json');
    const localizationSummaryPath = path.posix.join(sourceRoot, 'localization_summary.json');
    const manifest = {
      schema: 'openbioscience.public_data_manifest.v1',
      analysisId: parsed.data.analysisId,
      sourceName: parsed.data.sourceName,
      datasetId: parsed.data.datasetId,
      accession: parsed.data.accession,
      downloadRoute: parsed.data.downloadRoute,
      publicDataRoot: publicDataPrefix(parsed.data.sourceName, parsed.data.accession),
      localizedPaths: localized.map(({ path: localPath, status: pathStatusValue }) => ({
        path: localPath,
        status: pathStatusValue,
      })),
      evidenceIds: parsed.data.evidenceIds || [],
      notes: parsed.data.notes || [],
      timestamp: new Date().toISOString(),
    };
    const dataManifestHash = writeCanonicalJson(dataManifestPath, manifest);
    const localizationHash = writeCanonicalJson(localizationSummaryPath, {
      ...manifest,
      status,
      pathChecks: localized,
      warnings: [
        ...missing.map((item) => `Localized path is not available: ${item.path}`),
        ...outsidePublicPrefix.map(
          (item) => `Localized public dataset path must live under ${item.allowedPrefix}: ${item.path}`
        ),
      ],
    });
    const canonicalFiles = [
      sourceFileRef(dataManifestPath, dataManifestHash),
      sourceFileRef(localizationSummaryPath, localizationHash),
    ];
    const result = {
      schema: RESULT_SCHEMA,
      action,
      status,
      analysisId: parsed.data.analysisId,
      publicDataRoot: publicDataPrefix(parsed.data.sourceName, parsed.data.accession),
      localizedPaths: localized,
      canonicalFiles,
      warnings: [
        ...missing.map((item) => `Localized path is not available: ${item.path}`),
        ...outsidePublicPrefix.map(
          (item) => `Localized public dataset path must live under ${item.allowedPrefix}: ${item.path}`
        ),
      ],
      timestamp: Date.now(),
    };
    return withControlReceipt('bio_source', result, {
      analysisId: parsed.data.analysisId,
      sourceName: parsed.data.sourceName,
      accession: parsed.data.accession,
      publicDataRoot: publicDataPrefix(parsed.data.sourceName, parsed.data.accession),
      localizedPaths: localized,
      canonicalFiles,
    });
  }
  if (action === 'complete_public_download') {
    const parsed = completePublicDownloadPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      return invalidActionPayload(
        action,
        parsed.error,
        {
          analysisId: asString(payload?.analysisId),
          sourceName: asString(payload?.sourceName),
          datasetId: asString(payload?.datasetId),
          accession: asString(payload?.accession),
          downloadRoute: asString(payload?.downloadRoute),
          downloadedPaths: asArray(payload?.downloadedPaths),
          extractedPaths: asArray(payload?.extractedPaths),
          command: asString(payload?.command),
        },
        'bio_source'
      );
    }
    let downloadPlanReceipt: BioControlReceipt;
    try {
      downloadPlanReceipt = readStoredReceipt(parsed.data.downloadPlanReceiptId, {
        producer: 'bio_source',
        action: 'prepare_public_download',
        status: 'ready',
      });
    } catch (error) {
      return receiptLookupFailure(action, error);
    }
    const planDetails = isRecord(downloadPlanReceipt.details) ? downloadPlanReceipt.details : {};
    const plannedFiles = asArray(planDetails.plannedFiles).filter(isRecord);
    const planMismatches = [
      asString(planDetails.analysisId) === parsed.data.analysisId ? '' : 'analysisId differs from download plan receipt.',
      asString(planDetails.sourceName) === parsed.data.sourceName ? '' : 'sourceName differs from download plan receipt.',
      asString(planDetails.datasetId) === parsed.data.datasetId ? '' : 'datasetId differs from download plan receipt.',
      asString(planDetails.accession) === parsed.data.accession ? '' : 'accession differs from download plan receipt.',
      asString(planDetails.downloadRoute) === parsed.data.downloadRoute
        ? ''
        : 'downloadRoute differs from download plan receipt.',
      asString(planDetails.destinationRoot) === publicDataPrefix(parsed.data.sourceName, parsed.data.accession)
        ? ''
        : 'destinationRoot differs from the normalized public data prefix.',
      asBoolean(planDetails.rawMatrixDownloadApproved) === parsed.data.rawMatrixDownloadApproved
        ? ''
        : 'rawMatrixDownloadApproved differs from download plan receipt.',
    ].filter(Boolean);
    const plannedRawWithoutApproval = plannedFiles.some(
      (file) => asString(file.kind) === 'raw_matrix' && !asBoolean(planDetails.rawMatrixDownloadApproved)
    );
    if (planMismatches.length || plannedRawWithoutApproval) {
      return receiptLookupFailure(
        action,
        new Error(
          [
            ...planMismatches,
            plannedRawWithoutApproval
              ? 'Download plan contains raw_matrix files without explicit rawMatrixDownloadApproved=true.'
              : '',
          ]
            .filter(Boolean)
            .join(' ')
        )
      );
    }
    const sourceRoot = explorationSourceRoot(parsed.data.analysisId);
    const allPaths = [...parsed.data.downloadedPaths, ...(parsed.data.extractedPaths || [])];
    const localized = allPaths.map((candidate) =>
      localizePathStatus(candidate, parsed.data.sourceName, parsed.data.accession)
    );
    const normalizedAllPaths = new Set(allPaths.map(normalizeProjectRelativePath));
    const missingPlannedPaths = concreteExpectedDownloadPaths(plannedFiles).filter(
      (expectedPath) => !normalizedAllPaths.has(expectedPath)
    );
    const unavailable = localized.filter((item) => item.status !== 'available');
    const outsidePublicPrefix = localized.filter((item) => !item.underPublicPrefix);
    const status = unavailable.length || outsidePublicPrefix.length || missingPlannedPaths.length ? 'blocked' : 'ready';
    const manifestPath = path.posix.join(sourceRoot, 'download_manifest.json');
    const summaryPath = path.posix.join(sourceRoot, 'download_summary.tsv');
    const manifest = {
      schema: 'openbioscience.public_download_manifest.v1',
      analysisId: parsed.data.analysisId,
      downloadPlanReceiptId: parsed.data.downloadPlanReceiptId,
      sourceName: parsed.data.sourceName,
      datasetId: parsed.data.datasetId,
      accession: parsed.data.accession,
      downloadRoute: parsed.data.downloadRoute,
      publicDataRoot: publicDataPrefix(parsed.data.sourceName, parsed.data.accession),
      command: parsed.data.command,
      rawMatrixDownloadApproved: parsed.data.rawMatrixDownloadApproved,
      plannedFiles: plannedFiles.map((file) => ({
        id: asString(file.id),
        kind: asString(file.kind),
        status: asString(file.status),
        expectedPath: asString(file.expectedPath),
        expectedBytes: typeof file.expectedBytes === 'number' ? file.expectedBytes : null,
      })),
      downloadedPaths: parsed.data.downloadedPaths,
      extractedPaths: parsed.data.extractedPaths || [],
      pathChecks: localized,
      evidenceIds: parsed.data.evidenceIds || [],
      notes: parsed.data.notes || [],
      timestamp: new Date().toISOString(),
    };
    const manifestHash = writeCanonicalJson(manifestPath, { ...manifest, status });
    const summary = [
      'path\tstatus\tunderPublicPrefix',
      ...localized.map((item) => `${item.path}\t${item.status}\t${item.underPublicPrefix}`),
    ].join('\n');
    const summaryHash = writeCanonicalText(summaryPath, `${summary}\n`);
    const canonicalFiles = [sourceFileRef(manifestPath, manifestHash), sourceFileRef(summaryPath, summaryHash)];
    const result = {
      schema: RESULT_SCHEMA,
      action,
      status,
      analysisId: parsed.data.analysisId,
      manifest: { ...manifest, status },
      canonicalFiles,
      warnings: [
        ...unavailable.map((item) => `Downloaded/localized path is not available: ${item.path}`),
        ...outsidePublicPrefix.map(
          (item) => `Downloaded public dataset path must live under ${item.allowedPrefix}: ${item.path}`
        ),
        ...missingPlannedPaths.map((expectedPath) => `Planned download path was not recorded: ${expectedPath}`),
      ],
      nextActions:
        status === 'ready'
          ? [
              {
                id: 'complete-localization-from-download',
                tool: 'bio_source',
                action: 'complete_localization',
                reason: 'Promote downloaded public files into the canonical source data manifest.',
                payload: {
                  analysisId: parsed.data.analysisId,
                  sourceName: parsed.data.sourceName,
                  datasetId: parsed.data.datasetId,
                  accession: parsed.data.accession,
                  downloadRoute: parsed.data.downloadRoute,
                  localizedPaths: allPaths,
                },
              },
            ]
          : [],
      timestamp: Date.now(),
    };
    return withControlReceipt('bio_source', result, {
      analysisId: parsed.data.analysisId,
      downloadPlanReceiptId: parsed.data.downloadPlanReceiptId,
      accession: parsed.data.accession,
      status,
      publicDataRoot: publicDataPrefix(parsed.data.sourceName, parsed.data.accession),
      downloadedPaths: localized.map((item) => ({
        path: item.path,
        status: item.status,
        underPublicPrefix: item.underPublicPrefix,
      })),
      canonicalFiles,
    });
  }
  if (action === 'inspect_method_sources') {
    const paperTextPaths = uniqueStrings(asArray(payload?.paperTextPaths || payload?.paper_text_paths));
    const supplementPaths = uniqueStrings(asArray(payload?.supplementPaths || payload?.supplement_paths));
    const repositoryUrls = uniqueStrings(asArray(payload?.repositoryUrls || payload?.repository_urls));
    const inspection = await inspectMethodSources({
      projectRoot: workspaceRoot(),
      paperTextPaths,
      supplementPaths,
      repositoryUrls,
    });
    const result = {
      schema: RESULT_SCHEMA,
      action,
      ...inspection,
      nextActions:
        inspection.status === 'blocked'
          ? [
              {
                id: 'provide-method-sources',
                tool: 'bio_source',
                action: 'inspect_method_sources',
                reason:
                  'Provide at least one project-relative paper text, supplement, or public GitHub repository URL.',
                payload: { paperTextPaths, supplementPaths, repositoryUrls },
              },
            ]
          : [],
      warnings: inspection.externalBlockers.map((blocker) => blocker.message),
      timestamp: Date.now(),
    };
    return withControlReceipt('bio_source', result, {
      sources: inspection.sources,
      candidates: inspection.candidates,
      repositories: inspection.repositories,
      externalBlockers: inspection.externalBlockers,
      validationFingerprint: inspection.validationFingerprint,
    });
  }
  throw new Error(`Unsupported source action "${action}".`);
};

const inferAccessionSources = (accession: string): string[] => {
  const upper = accession.toUpperCase();
  if (/^GSE\d+/u.test(upper) || /^GSM\d+/u.test(upper)) return ['GEO'];
  if (/^SR[APRXS]\d+/u.test(upper)) return ['SRA'];
  if (/^E-[A-Z]+-\d+/u.test(upper)) return ['ArrayExpress'];
  if (/^EGAS\d+/u.test(upper) || /^EGAD\d+/u.test(upper)) return ['EGA'];
  if (/^S-BSST\d+/u.test(upper) || /^S-EPMC\d+/u.test(upper)) return ['BioStudies'];
  return ['unknown'];
};

const inferControlledAccess = (accession: string): boolean => /^EGA[SD]\d+/iu.test(accession);

const handleKnowledgeAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') {
    const resources = summarizeKnowledgeResources();
    return {
      ...statusPayload('knowledge'),
      resources,
      localResourceStatus: {
        markers: resources.markerFiles.length > 0 ? 'ready' : 'missing',
        markerPackages: resources.markerPackages.filter((item) => item.availability === 'available').length,
        plannedAtlasPackages: resources.markerPackages.filter((item) => item.availability === 'planned').length,
        msigdb: resources.msigdbFiles.length > 0 ? 'ready' : 'missing',
        compactGeneSets: resources.compactGeneSetFiles.length > 0 ? 'ready' : 'missing',
      },
    };
  }
  const query = asString(payload?.query || payload?.term || payload?.gene || payload?.cellType || payload?.cell_type);
  const species = asString(payload?.species || payload?.organism);
  const canonicalSpeciesValue = canonicalSpecies(species);
  const limit = asPositiveInteger(payload?.limit, 25);
  const resources = summarizeKnowledgeResources();
  const evidenceContract = {
    mustRecordSource: true,
    finalAnnotationDecision: 'skill_owned',
    artifactRegistration: 'science_artifact',
    localResourceRequired: true,
  };
  if (!query && action !== 'list_lr_database' && action !== 'map_orthologs' && action !== 'normalize_gene_symbols') {
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'blocked',
      query,
      resources,
      evidenceContract,
      warnings: [`${action} requires query, gene, term, or cellType.`],
      timestamp: Date.now(),
    };
  }
  if (action === 'search_marker') {
    const hits = searchLocalMarkers(query, { species, limit });
    const resourceFiles = Array.from(new Set(hits.map((hit) => hit.resourcePath)));
    return {
      schema: RESULT_SCHEMA,
      action,
      status: hits.length ? 'ready' : 'blocked',
      query,
      species: species || 'any',
      canonicalSpecies: canonicalSpeciesValue || 'any',
      hits,
      resourceFiles,
      resources,
      evidenceContract,
      warnings: hits.length
        ? []
        : [
            `No local marker or atlas record matched "${query}". Add a localized marker JSONL package under ${resources.markerRoot}.`,
          ],
      timestamp: Date.now(),
    };
  }
  if (action === 'search_atlas') {
    const packageQuery = query.toLowerCase();
    const matchesQuery = (text: string): boolean =>
      packageQuery
        .split(/\s+/u)
        .filter(Boolean)
        .some((token) => text.toLowerCase().includes(token));
    const matchesSpecies = (text: string): boolean => {
      if (!canonicalSpeciesValue) return true;
      const lowered = text.toLowerCase();
      if (canonicalSpeciesValue === 'human') return lowered.includes('homo sapiens') || lowered.includes('human');
      if (canonicalSpeciesValue === 'mouse') return lowered.includes('mus musculus') || lowered.includes('mouse');
      return true;
    };
    const markerPackages = resources.markerPackages.filter((item) => item.availability === 'available');
    const availableMarkerPackages = markerPackages
      .filter((item) => matchesSpecies(item.species))
      .filter((item) => matchesQuery([item.packageId, item.scope, item.disease, item.keywords].join(' ')))
      .slice(0, limit);
    const plannedAtlasPackages = resources.markerPackages
      .filter((item) => item.availability === 'planned')
      .filter((item) => matchesSpecies(item.species))
      .filter((item) => matchesQuery([item.packageId, item.scope, item.disease, item.keywords].join(' ')))
      .slice(0, limit);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: availableMarkerPackages.length || plannedAtlasPackages.length ? 'conditional' : 'blocked',
      query,
      species: species || 'any',
      canonicalSpecies: canonicalSpeciesValue || 'any',
      atlasProviderStatus: 'package_index_only',
      availableMarkerPackages,
      plannedAtlasPackages,
      resources,
      evidenceContract,
      nextActions: [
        {
          id: 'use-marker-evidence-for-major-annotation',
          tool: 'bio_knowledge',
          action: 'search_marker',
          reason:
            'No local atlas backend is implemented yet; use localized marker packages for major annotation evidence.',
              payload: { query, species, limit },
        },
      ],
      warnings: plannedAtlasPackages.length
        ? ['Atlas package rows marked planned require localization before they can support annotation evidence.']
        : [
            'Local atlas backend is not implemented in this MCP profile yet; search_marker remains available for localized marker evidence.',
          ],
      timestamp: Date.now(),
    };
  }
  if (action === 'resolve_gene_set') {
    const geneSets = resolveLocalGeneSets(query, { species, limit });
    const provider = geneSets.some((geneSet) => geneSet.provider === 'msigdb') ? 'msigdb' : 'compact_fallback';
    const resourceFiles = Array.from(new Set(geneSets.map((geneSet) => geneSet.resourcePath)));
    return {
      schema: RESULT_SCHEMA,
      action,
      status: geneSets.length ? 'ready' : 'blocked',
      query,
      species: species || 'any',
      canonicalSpecies: canonicalSpeciesValue || 'any',
      provider: geneSets.length ? provider : 'none',
      geneSets,
      resourceFiles,
      resources,
      evidenceContract,
      warnings: geneSets.length
        ? provider === 'compact_fallback'
          ? [`MSigDB GMT files were not found under ${resources.msigdbRoot}; used compact fallback gene sets.`]
          : []
        : [`No local gene set matched "${query}". Localize MSigDB GMT files under ${resources.msigdbRoot}.`],
      timestamp: Date.now(),
    };
  }
  return {
    schema: RESULT_SCHEMA,
    action,
    status: 'conditional',
    query,
    resources,
    evidenceContract,
    warnings: [`${action} is registered, but local provider-backed execution is not implemented in this MCP profile yet.`],
    timestamp: Date.now(),
  };
};

const handlePlotAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') return statusPayload('plot');
  if (action === 'list_plot_templates') {
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'supported',
      templates: BIO_PLOT_TEMPLATES,
      objectives: BIO_PLOT_OBJECTIVES,
      backends: BIO_PLOT_BACKENDS,
      styleContract: {
        source: 'local_registry',
        plottieRole: 'inspiration_and_taxonomy_only',
        externalLookupRequired: false,
      },
      timestamp: Date.now(),
    };
  }
  if (action === 'list_plot_recipes') {
    const recipes = listPlotRecipes({
      objective: asString(payload?.objective),
      status: asString(payload?.status),
      backend: asString(payload?.backend),
      packageName: asString(payload?.packageName || payload?.package_name),
    });
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'supported',
      objectives: BIO_PLOT_OBJECTIVES,
      backends: BIO_PLOT_BACKENDS,
      recipes,
      warnings: recipes.length ? [] : ['No recipe matched the requested filters.'],
      timestamp: Date.now(),
    };
  }
  if (action === 'select_plot_recipe') {
    const selection = selectPlotRecipe({
      objective: asString(payload?.objective),
      intent: asString(payload?.intent || payload?.question),
      preferredStatus: asString(payload?.preferredStatus || payload?.preferred_status),
      availableInputs: uniqueStrings(asArray(payload?.availableInputs || payload?.available_inputs)),
    });
    return {
      schema: RESULT_SCHEMA,
      action,
      status: selection.selected ? 'ready' : 'blocked',
      selectedRecipe: selection.selected,
      alternatives: selection.alternatives,
      warnings: selection.warnings,
      timestamp: Date.now(),
    };
  }
  if (action === 'inspect_singlecell_object') return inspectSingleCellObjectPlan(action, payload);
  if (action === 'validate_plot_inputs') return validatePlotInputs(action, payload);
  if (action === 'validate_plot_spec') {
    const validation = validatePlotSpec(isRecord(payload?.spec) ? payload.spec : payload || {});
    return {
      schema: RESULT_SCHEMA,
      action,
      status: validation.status,
      recipe: validation.recipe,
      missingFields: validation.missingFields,
      warnings: validation.warnings,
      timestamp: Date.now(),
    };
  }
  if (
    action === 'render_plan' ||
    action === 'render_embedding' ||
    action === 'render_expression_matrix' ||
    action === 'render_composition' ||
    action === 'render_differential' ||
    action === 'render_trajectory' ||
    action === 'render_communication' ||
    action === 'render_cnv'
  ) {
    const spec = plotSpecPayload(action, payload);
    const legacyTemplateId = asString(spec.templateId || spec.template_id);
    if (legacyTemplateId && !findPlotRecipe(legacyTemplateId)) {
      const template = catalogById(BIO_PLOT_TEMPLATES, legacyTemplateId);
      return {
        schema: RESULT_SCHEMA,
        action,
        status: template ? 'conditional' : 'blocked',
        template,
        renderPlan: template
          ? {
              environmentRef: 'sc-r-plot',
              executeNow: false,
              requiredOutputs: template.outputs || [],
              manifestSchema: 'openbioscience.scrna_plot.manifest.v1',
            }
          : undefined,
        warnings: template ? [] : [`Unknown templateId "${legacyTemplateId || '<missing>'}".`],
        timestamp: Date.now(),
      };
    }
    const { validation, renderPlan } = renderPlanForSpec(spec);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: validation.status,
      recipe: validation.recipe,
      missingFields: validation.missingFields,
      renderPlan,
      warnings: validation.warnings,
      timestamp: Date.now(),
    };
  }
  if (action === 'export_figure_bundle') return exportFigureBundlePlan(action, payload);
  if (action === 'summarize_plot_outputs') return handleRuntimeAction('summarize_outputs', payload);
  throw new Error(`Unsupported plot action "${action}".`);
};

const sourceMaterialsFromPayload = (payload?: JsonRecord) => {
  const paper = isRecord(payload?.paper) ? payload.paper : {};
  const supplements = asArray(payload?.supplements || payload?.supplementary || payload?.supplementaryFiles);
  const sanitizedSupplementsResult = sanitizeSourceValue(
    supplements.map((item) => (isRecord(item) ? item : { value: item }))
  );
  const sanitizedSupplements = Array.isArray(sanitizedSupplementsResult.value) ? sanitizedSupplementsResult.value : [];
  const accessionsResult = sanitizeSourceValue(uniqueStrings(asArray(payload?.accessions)));
  const accessions = Array.isArray(accessionsResult.value)
    ? uniqueStrings(accessionsResult.value)
    : uniqueStrings(asArray(payload?.accessions));
  const linksResult = sanitizeSourceValue(uniqueSanitizedStrings(asArray(payload?.links || payload?.urls)));
  const links = Array.isArray(linksResult.value) ? uniqueStrings(linksResult.value) : [];
  const localPaths = uniqueStrings(asArray(payload?.localPaths || payload?.local_paths || payload?.paths));
  const codeLinksResult = sanitizeSourceValue(
    uniqueSanitizedStrings(asArray(payload?.codeLinks || payload?.code_links || payload?.repositories))
  );
  const codeLinks = Array.isArray(codeLinksResult.value) ? uniqueStrings(codeLinksResult.value) : [];
  const referenceResourcesResult = sanitizeSourceValue(
    uniqueStrings(asArray(payload?.referenceResources || payload?.reference_resources || payload?.references))
  );
  const referenceResources = Array.isArray(referenceResourcesResult.value)
    ? uniqueStrings(referenceResourcesResult.value)
    : [];
  const paperUrlResult = sanitizeSourceValue(paper.url || payload?.paperUrl || payload?.paper_url);
  const methodsResult = sanitizeSourceValue(payload?.methods || payload?.methodsSummary || payload?.methods_summary);
  const dataAvailabilityResult = sanitizeSourceValue(
    payload?.dataAvailability || payload?.data_availability || payload?.dataAvailabilityStatement
  );
  const codeAvailabilityResult = sanitizeSourceValue(
    payload?.codeAvailability || payload?.code_availability || payload?.codeAvailabilityStatement
  );
  const credentialFieldsRedacted =
    sanitizedSupplementsResult.redacted ||
    accessionsResult.redacted ||
    linksResult.redacted ||
    codeLinksResult.redacted ||
    referenceResourcesResult.redacted ||
    paperUrlResult.redacted ||
    methodsResult.redacted ||
    dataAvailabilityResult.redacted ||
    codeAvailabilityResult.redacted ||
    containsCredentialField({ paper, supplements, links, codeLinks, referenceResources });

  return {
    paper: {
      title: asString(paper.title || payload?.paperTitle || payload?.paper_title),
      doi: asString(paper.doi || payload?.doi),
      pmid: asString(paper.pmid || payload?.pmid),
      url: asString(paperUrlResult.value),
      localPath: asString(paper.localPath || paper.local_path || payload?.paperPath || payload?.paper_path),
    },
    methods: asString(methodsResult.value),
    dataAvailability: asString(dataAvailabilityResult.value),
    codeAvailability: asString(codeAvailabilityResult.value),
    supplements: sanitizedSupplements,
    credentialFieldsRedacted,
    accessions,
    links,
    localPaths,
    codeLinks,
    referenceResources,
  };
};

const hasSourceMaterial = (sources: ReturnType<typeof sourceMaterialsFromPayload>): boolean =>
  Boolean(
    sources.paper.title ||
    sources.paper.doi ||
    sources.paper.pmid ||
    sources.paper.url ||
    sources.paper.localPath ||
    sources.methods ||
    sources.dataAvailability ||
    sources.codeAvailability ||
    sources.supplements.length ||
    sources.accessions.length ||
    sources.links.length ||
    sources.localPaths.length ||
    sources.codeLinks.length ||
    sources.referenceResources.length
  );

const reproductionPackageLayout = (caseName: string) => ({
  root: caseName || 'case_reproduction',
  planning: {
    plan: 'planning/reproduction_plan.md',
    sourceAudit: 'planning/source_audit.json',
    methodParameterContract: 'planning/method_parameter_contract.json',
    localized: 'planning/localized/',
  },
  execution: {
    scripts: 'execution/scripts/',
    configs: 'execution/configs/',
    results: [
      'execution/results/tables/',
      'execution/results/figures/',
      'execution/results/objects/',
      'execution/results/reports/',
    ],
    logs: ['execution/logs/execution.log', 'execution/logs/review.md'],
  },
});

const containsCredentialField = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some((item) => containsCredentialField(item));
  if (typeof value === 'string') return hasCredentialLikeUrl(value);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => {
    if (isCredentialKey(key)) {
      return Boolean(nested);
    }
    return containsCredentialField(nested);
  });
};

const classifySourceAvailability = (sources: ReturnType<typeof sourceMaterialsFromPayload>) => ({
  paper:
    sources.paper.localPath || sources.paper.url || sources.paper.doi || sources.paper.pmid
      ? 'conditional_continue'
      : 'blocked_for_execution',
  data:
    sources.accessions.length || sources.localPaths.length || sources.dataAvailability
      ? 'conditional_continue'
      : 'blocked_for_execution',
  code: sources.codeLinks.length || sources.codeAvailability ? 'conditional_continue' : 'blocked_for_execution',
  referenceResources: sources.referenceResources.length ? 'conditional_continue' : 'blocked_for_execution',
});

const READY_FOR_SCRIPT_STATUSES = new Set(['ready', 'partial_ready', 'conditional_continue']);
const BLOCKING_MODULE_STATUSES = new Set([
  'blocked_for_localization',
  'blocked_for_execution',
  'fatal_block',
  'planned_only',
  'unresolved',
]);

const moduleReadiness = (modules: unknown[]): ReproductionModuleReadiness[] =>
  modules.map((item, index) => {
    const record = isRecord(item) ? item : { objective: item };
    const environmentRef = asString(record.environmentRef || record.environment_ref);
    const declaredStatus = asString(record.status, environmentRef ? 'conditional_continue' : 'blocked_for_execution');
    const sourceStatus = asString(
      record.sourceStatus ||
        record.source_status ||
        record.inputStatus ||
        record.input_status ||
        record.dataStatus ||
        record.data_status
    );
    const skillRoute = uniqueStrings(asArray(record.skillRoute || record.skill_route));
    const mcpRoute = uniqueStrings(asArray(record.mcpRoute || record.mcp_route));
    const expectedOutputs = uniqueStrings(asArray(record.expectedOutputs || record.expected_outputs));
    const contractReasons = [
      environmentRef ? '' : 'environmentRef is required.',
      skillRoute.length ? '' : 'skillRoute is required.',
      mcpRoute.length ? '' : 'mcpRoute is required.',
      expectedOutputs.length ? '' : 'expectedOutputs is required.',
      sourceStatus ? '' : 'sourceStatus is required.',
    ].filter(Boolean);
    const executionBlocked =
      BLOCKING_MODULE_STATUSES.has(declaredStatus) || !sourceStatus || !READY_FOR_SCRIPT_STATUSES.has(sourceStatus);
    const executionStatus: ReproductionModuleReadiness['executionStatus'] = executionBlocked
      ? 'blocked'
      : declaredStatus === 'ready' && sourceStatus === 'ready'
        ? 'ready'
        : 'conditional';
    const blockingReasons = [
      ...contractReasons,
      BLOCKING_MODULE_STATUSES.has(declaredStatus) ? `Module status "${declaredStatus}" is not script-ready.` : '',
      sourceStatus && !READY_FOR_SCRIPT_STATUSES.has(sourceStatus)
        ? `sourceStatus "${sourceStatus}" is not script-ready.`
        : '',
    ].filter(Boolean);
    return {
      id: asString(record.id, `module-${index + 1}`),
      environmentRef,
      declaredStatus,
      sourceStatus,
      skillRoute,
      mcpRoute,
      expectedOutputs,
      contractStatus: contractReasons.length ? 'incomplete' : 'complete',
      executionStatus,
      status: executionStatus === 'blocked' ? 'blocked_for_execution' : 'ready',
      blockingReasons,
    };
  });

const sourceAuditStatusSchema = z.enum(REPRODUCTION_PLANNING_STATUSES);
const sourceAuditItemSchema = z.object({ status: sourceAuditStatusSchema }).passthrough();
const sourceAuditSchema = z
  .object({
    schema: z.literal(SOURCE_AUDIT_SCHEMA),
    paper: z.object({ status: sourceAuditStatusSchema }).passthrough(),
    data: z.array(sourceAuditItemSchema),
    code: z.array(sourceAuditItemSchema),
    referenceResources: z.array(sourceAuditItemSchema),
    localized: z.array(z.record(z.unknown())),
    plannedOnly: z.array(z.record(z.unknown())),
    warnings: z.array(z.record(z.unknown())),
    timestamp: z.string().min(1),
  })
  .passthrough();

const readValidatedJson = (candidate: string): { value?: unknown; error?: string } => {
  try {
    return { value: JSON.parse(fs.readFileSync(candidate, 'utf8')) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

const formatZodIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);

const validatePlanDocument = (candidate: string): string[] => {
  try {
    const normalized = fs.readFileSync(candidate, 'utf8').toLowerCase();
    return REPRODUCTION_PLAN_SECTION_ALIASES.filter(
      ({ aliases }) => !aliases.some((alias) => normalized.includes(alias))
    ).map(({ section }) => section);
  } catch {
    return [...REPRODUCTION_PLAN_SECTIONS];
  }
};

const validReceiptForProject = (receipt: BioControlReceipt, producer: BioControlReceipt['producer']): boolean =>
  receipt.producer === producer && path.resolve(receipt.projectRoot) === workspaceRoot();

const validMethodParameterReceipt = (value: unknown): value is MethodParameterReceipt => {
  if (!isRecord(value)) return false;
  return (
    value.schema === BIO_RECEIPT_SCHEMA &&
    value.producer === 'bio_reproduction' &&
    value.action === 'extract_method_parameters' &&
    value.status === 'ready' &&
    typeof value.receiptId === 'string' &&
    typeof value.projectRoot === 'string' &&
    isRecord(value.canonicalFile) &&
    typeof value.canonicalFile.path === 'string' &&
    typeof value.canonicalFile.contentHash === 'string' &&
    Array.isArray(value.sourceReceiptIds) &&
    Array.isArray(value.moduleCoverage) &&
    Array.isArray(value.conflicts) &&
    Array.isArray(value.nextActions)
  );
};

const runtimeReceiptFor = (receipts: BioControlReceipt[], environmentRef: string): BioControlReceipt | undefined => {
  const direct = receipts.find(
    (receipt) =>
      validReceiptForProject(receipt, 'bio_runtime') &&
      receipt.action === 'probe_environment' &&
      asString(receipt.details?.environmentRef) === environmentRef
  );
  if (direct) return direct;
  for (const receipt of receipts) {
    if (!validReceiptForProject(receipt, 'bio_runtime') || receipt.action !== 'probe_environments') continue;
    const probe = asArray(receipt.details?.probes).find(
      (candidate) => isRecord(candidate) && asString(candidate.environmentRef) === environmentRef
    );
    if (isRecord(probe)) {
      return {
        ...receipt,
        action: 'probe_environment',
        details: probe,
      };
    }
  }
  return undefined;
};

const runtimeProbePassed = (receipt?: BioControlReceipt): boolean =>
  Boolean(receipt && isRecord(receipt.details?.probe) && receipt.details.probe.status === 'passed');

const localizationItems = (payload?: JsonRecord) => {
  const candidates = asArray(payload?.sources || payload?.items || payload?.urls);
  return candidates.map((item, index) => {
    const record = isRecord(item) ? item : { url: item };
    const url = asString(record.url || record.href || record.sourceUrl || record.source_url);
    const fallbackTargetName = (() => {
      try {
        const basename = path.basename(new URL(url).pathname);
        return basename && basename !== '/' ? basename : `source-${index + 1}`;
      } catch {
        return `source-${index + 1}`;
      }
    })();
    return {
      id: asString(record.id, `source-${index + 1}`),
      url,
      kind: asString(record.kind || record.type, 'source'),
      expectedBytes: firstNumber(record.expectedBytes, record.expected_bytes),
      targetName: asString(record.targetName || record.target_name || record.filename, fallbackTargetName),
      credentialsRequested: containsCredentialField(record),
    };
  });
};

const handleReproductionAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') return statusPayload('reproduction');
  if (action === 'validate_paper_reproduction_map') {
    const parsed = validatePaperMapByIdPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      const legacyReceipts = asArray(payload?.sourceReceipts)
        .map((receipt) => (isRecord(receipt) ? asString(receipt.receiptId) : ''))
        .filter(Boolean);
      return invalidActionPayload(action, parsed.error, {
        mapPath: 'case_reproduction/planning/paper_reproduction_map.json',
        sourceReceiptIds: uniqueStrings([...asArray(payload?.sourceReceiptIds), ...legacyReceipts]),
      });
    }
    try {
      const sourceReceipts = parsed.data.sourceReceiptIds.map((receiptId) =>
        readStoredReceipt(receiptId, {
          producer: 'bio_source',
          action: 'index_paper_sources',
          status: 'ready',
        })
      );
      const result = validatePaperReproductionMap(workspaceRoot(), {
        mapPath: parsed.data.mapPath,
        sourceReceipts,
      });
      const nextActions = asArray(result.nextActions).map((nextAction) => {
        if (!isRecord(nextAction) || !isRecord(nextAction.payload)) return nextAction;
        const nextPayload = { ...nextAction.payload };
        if (isRecord(nextPayload.onSuccess)) {
          nextPayload.onSuccess = {
            ...nextPayload.onSuccess,
            payload: {
              mapPath: parsed.data.mapPath,
              sourceReceiptIds: parsed.data.sourceReceiptIds,
            },
          };
        }
        return { ...nextAction, payload: nextPayload };
      });
      return { ...result, nextActions };
    } catch (error) {
      return receiptLookupFailure(action, error);
    }
  }
  if (action === 'validate_reproduction_scope') {
    const parsed = validateScopeByIdPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      const legacyReceipt = isRecord(payload?.paperMapReceipt) ? asString(payload.paperMapReceipt.receiptId) : '';
      return invalidActionPayload(action, parsed.error, {
        mapPath: 'case_reproduction/planning/paper_reproduction_map.json',
        paperMapReceiptId: asString(payload?.paperMapReceiptId, legacyReceipt),
      });
    }
    try {
      const paperMapReceipt = readStoredReceipt(parsed.data.paperMapReceiptId, {
        producer: 'bio_reproduction',
        action: 'validate_paper_reproduction_map',
        status: 'ready',
      });
      const paperMapReceiptRecord = paperMapReceipt as unknown as JsonRecord;
      const result = validateReproductionScope(workspaceRoot(), {
        mapPath: parsed.data.mapPath,
        paperMapReceipt,
      });
      const nextActions = asArray(result.nextActions).map((nextAction) => {
        if (!isRecord(nextAction)) return nextAction;
        if (nextAction.action !== 'validate_paper_reproduction_map') return nextAction;
        return {
          ...nextAction,
          payload: {
            mapPath: parsed.data.mapPath,
            sourceReceiptIds: asArray(paperMapReceiptRecord.sourceReceiptIds),
          },
        };
      });
      return { ...result, nextActions };
    } catch (error) {
      return receiptLookupFailure(action, error);
    }
  }
  if (action === 'validate_skill_compliance') return validateSkillCompliance(workspaceRoot(), payload || {});
  if (action === 'preflight_execution_scripts') {
    const parsed = scriptPreflightByIdPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      return invalidActionPayload(action, parsed.error, {
        executionContractReceiptId: asString(payload?.executionContractReceiptId),
        methodParameterReceiptId: asString(payload?.methodParameterReceiptId),
        scripts: asArray(payload?.scripts),
        scriptPaths: uniqueStrings(asArray(payload?.scriptPaths)),
        skillComplianceReceiptIds: uniqueStrings(asArray(payload?.skillComplianceReceiptIds)),
        statisticalDesignReceiptIds: uniqueStrings(asArray(payload?.statisticalDesignReceiptIds)),
      });
    }
    try {
      return preflightExecutionScripts(workspaceRoot(), {
        executionContractReceipt: readStoredReceipt(parsed.data.executionContractReceiptId, {
          producer: 'bio_reproduction',
          action: 'prepare_execution_contract',
          status: 'ready',
        }),
        methodParameterReceipt: readStoredReceipt(parsed.data.methodParameterReceiptId, {
          producer: 'bio_reproduction',
          action: 'extract_method_parameters',
          status: 'ready',
        }),
        scripts: parsed.data.scripts,
        scriptPaths: parsed.data.scriptPaths,
        skillComplianceReceipts: parsed.data.skillComplianceReceiptIds.map((receiptId) =>
          readStoredReceipt(receiptId, {
            producer: 'bio_reproduction',
            action: 'validate_skill_compliance',
            status: 'ready',
          })
        ),
        statisticalDesignReceipts: (parsed.data.statisticalDesignReceiptIds || []).map((receiptId) =>
          readStoredReceipt(receiptId, {
            producer: 'bio_statistics',
            action: 'validate_de_design',
            status: 'ready',
          })
        ),
        skillContents: parsed.data.skillContents,
      });
    } catch (error) {
      return receiptLookupFailure(action, error);
    }
  }
  if (action === 'prepare_execution_contract') {
    const parsed = prepareExecutionByIdPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      return invalidActionPayload(action, parsed.error, {
        contractVersion: 2,
        objective: asString(payload?.objective),
        datasetIds: uniqueStrings(asArray(payload?.datasetIds)),
        executionContractPath: asString(
          payload?.executionContractPath,
          'case_reproduction/execution/execution_contract.json'
        ),
        planningReceiptId: asString(payload?.planningReceiptId),
        paperMapReceiptId: asString(payload?.paperMapReceiptId),
        scopeReceiptId: asString(payload?.scopeReceiptId),
      });
    }
    try {
      const executionPayload = {
        contractVersion: 2 as const,
        objective: parsed.data.objective,
        datasetIds: parsed.data.datasetIds,
        executionContractPath: parsed.data.executionContractPath,
        annotationMode: parsed.data.annotationMode,
        annotationPolicy: parsed.data.annotationPolicy,
        planningReceipt: readStoredReceipt(parsed.data.planningReceiptId, {
          producer: 'bio_reproduction',
          action: 'validate_reproduction_plan',
          status: 'ready',
        }),
        paperMapReceipt: readStoredReceipt(parsed.data.paperMapReceiptId, {
          producer: 'bio_reproduction',
          action: 'validate_paper_reproduction_map',
          status: 'ready',
        }),
        scopeReceipt: readStoredReceipt(parsed.data.scopeReceiptId, {
          producer: 'bio_reproduction',
          action: 'validate_reproduction_scope',
          status: 'ready',
        }),
      };
      const first = prepareExecutionContract(workspaceRoot(), executionPayload);
      const firstRecord = first as unknown as JsonRecord;
      if (
        firstRecord.status === 'needs_completion' &&
        isRecord(firstRecord.canonicalContent) &&
        !asArray(firstRecord.issues).length
      ) {
        writeCanonicalJson(
          asString(firstRecord.canonicalPath, 'case_reproduction/execution/execution_contract.json'),
          firstRecord.canonicalContent
        );
        return prepareExecutionContract(workspaceRoot(), executionPayload);
      }
      return first;
    } catch (error) {
      return receiptLookupFailure(action, error);
    }
  }
  if (action === 'complete_execution') {
    const parsed = completeExecutionByIdPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      return invalidActionPayload(action, parsed.error, {
        contractVersion: 2,
        executionContractReceiptId: asString(payload?.executionContractReceiptId),
        planningReceiptId: asString(payload?.planningReceiptId),
        paperMapReceiptId: asString(payload?.paperMapReceiptId),
        scopeReceiptId: asString(payload?.scopeReceiptId),
        methodAlignmentReceiptId: asString(payload?.methodAlignmentReceiptId),
        scriptValidationReceiptId: asString(payload?.scriptValidationReceiptId),
        executionRunReceiptIds: uniqueStrings(asArray(payload?.executionRunReceiptIds)),
        statisticalCompletionReceiptIds: uniqueStrings(asArray(payload?.statisticalCompletionReceiptIds)),
        moduleResults: asArray(payload?.moduleResults),
      });
    }
    try {
      const statisticalReceipts = (parsed.data.statisticalCompletionReceiptIds || []).map((receiptId) =>
        readStoredReceipt(receiptId, {
          producer: 'bio_statistics',
          action: 'validate_de_outputs',
          status: 'ready',
        })
      );
      return completeExecution(workspaceRoot(), {
        executionContractReceipt: readStoredReceipt(parsed.data.executionContractReceiptId, {
          producer: 'bio_reproduction',
          action: 'prepare_execution_contract',
          status: 'ready',
        }),
        planningReceipt: readStoredReceipt(parsed.data.planningReceiptId, {
          producer: 'bio_reproduction',
          action: 'validate_reproduction_plan',
          status: 'ready',
        }),
        paperMapReceipt: readStoredReceipt(parsed.data.paperMapReceiptId, {
          producer: 'bio_reproduction',
          action: 'validate_paper_reproduction_map',
          status: 'ready',
        }),
        scopeReceipt: readStoredReceipt(parsed.data.scopeReceiptId, {
          producer: 'bio_reproduction',
          action: 'validate_reproduction_scope',
          status: 'ready',
        }),
        methodAlignmentReceipt: readStoredReceipt(parsed.data.methodAlignmentReceiptId, {
          producer: 'bio_reproduction',
          action: 'validate_method_alignment',
          status: 'ready',
        }),
        scriptValidationReceipt: readStoredReceipt(parsed.data.scriptValidationReceiptId, {
          producer: 'bio_reproduction',
          action: 'preflight_execution_scripts',
          status: 'ready',
        }),
        executionRunReceipts: parsed.data.executionRunReceiptIds.map((receiptId) =>
          readStoredReceipt(receiptId, { producer: 'bio_runtime', action: 'record_execution' })
        ),
        statisticalCompletionReceipts: statisticalReceipts,
        moduleResults: parsed.data.moduleResults,
        skillUses: parsed.data.skillUses,
        externalBlockers: parsed.data.externalBlockers,
      });
    } catch (error) {
      return receiptLookupFailure(action, error);
    }
  }

  if (action === 'build_source_package') {
    const sources = sourceMaterialsFromPayload(payload);
    const caseName = asString(payload?.caseName || payload?.case_name, 'case_reproduction');
    const hasMaterials = hasSourceMaterial(sources);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: hasMaterials ? 'conditional_continue' : 'blocked_for_execution',
      planningOnly: true,
      packageLayout: reproductionPackageLayout(caseName),
      sourcePackageDraft: {
        paper: sources.paper,
        methods: sources.methods,
        dataAvailability: sources.dataAvailability,
        codeAvailability: sources.codeAvailability,
        supplements: sources.supplements,
        accessions: sources.accessions,
        links: sources.links,
        localPaths: sources.localPaths.map((candidate) => ({
          path: candidate,
          status: safeAbsolutePathStatus(candidate),
        })),
        codeLinks: sources.codeLinks,
        referenceResources: sources.referenceResources,
      },
      requiredArtifacts: [
        'planning/reproduction_plan.md',
        'planning/source_audit.json',
        'planning/method_parameter_contract.json',
        'planning/localized/',
      ],
      warnings: hasMaterials
        ? [
            'Source package is a planning draft. Register concrete localized files and audit outputs through science_artifact.',
            ...(sources.credentialFieldsRedacted
              ? ['Credential-like source fields were redacted and must not be stored in the Planning Package.']
              : []),
          ]
        : [
            'build_source_package requires at least one paper, supplement, method, accession, link, code reference, or local path.',
          ],
      timestamp: Date.now(),
    };
  }

  if (action === 'localize_source_package') {
    const outputDir = asString(payload?.outputDir || payload?.output_dir);
    const outputStatus = safeOutputDirectoryStatus(outputDir);
    const overwrite = asBoolean(payload?.overwrite);
    const defaultLimit = DEFAULT_REPRODUCTION_FILE_LIMIT_BYTES;
    const maxBytes = asPositiveInteger(payload?.maxBytes || payload?.max_bytes, defaultLimit);
    const items = localizationItems(payload);
    const credentialRequest = containsCredentialField(payload);
    const plannedItems = items.map((item) => {
      const urlStatus = publicHttpUrlStatus(item.url);
      const targetPathStatus =
        outputStatus.status === 'allowed'
          ? safeChildPathStatus(outputStatus.resolvedPath || outputDir, item.targetName)
          : undefined;
      const exceedsLimit = typeof item.expectedBytes === 'number' && item.expectedBytes > maxBytes;
      const sizeUnknown = typeof item.expectedBytes !== 'number';
      const blockedReasons = [
        outputStatus.status === 'blocked' ? outputStatus.reason : '',
        urlStatus.status === 'blocked' ? urlStatus.reason : '',
        targetPathStatus?.status === 'blocked' ? targetPathStatus.reason : '',
        targetPathStatus?.exists && !overwrite ? 'Target file already exists and overwrite is false.' : '',
        exceedsLimit ? `Expected file size exceeds limit of ${maxBytes} bytes.` : '',
        overwrite ? 'overwrite=true is not allowed by default for lightweight localization planning.' : '',
        item.credentialsRequested ? 'Credentials, cookies, tokens, and authorization material are not allowed.' : '',
      ].filter(Boolean);
      const requiredBeforeLocalization = sizeUnknown
        ? ['Verify Content-Length or otherwise confirm file size before download.']
        : [];
      return {
        ...item,
        url: urlStatus.url,
        urlStatus,
        outputDirStatus: outputStatus,
        targetPathStatus,
        maxBytes,
        overwrite,
        plannedOnly: true,
        downloadAttempted: false,
        status: blockedReasons.length ? 'blocked_for_localization' : sizeUnknown ? 'conditional_continue' : 'ready',
        blockedReasons,
        requiredBeforeLocalization,
      };
    });
    const blockedCount = plannedItems.filter((item) => item.status === 'blocked_for_localization').length;
    const readyCount = plannedItems.filter((item) => item.status === 'ready').length;
    const conditionalCount = plannedItems.filter((item) => item.status === 'conditional_continue').length;
    const securityBlockedCount = plannedItems.filter(
      (item) => item.urlStatus.status === 'blocked' || item.targetPathStatus?.status === 'blocked'
    ).length;
    return {
      schema: RESULT_SCHEMA,
      action,
      status:
        outputStatus.status === 'blocked' || credentialRequest || overwrite || securityBlockedCount
          ? 'fatal_block'
          : !plannedItems.length
            ? 'blocked_for_localization'
            : blockedCount
              ? blockedCount === plannedItems.length
                ? 'blocked_for_localization'
                : 'partial_ready'
              : conditionalCount && !readyCount
                ? 'conditional_continue'
                : conditionalCount
                  ? 'partial_ready'
                  : 'ready',
      planningOnly: true,
      localizationPolicy: {
        defaultSingleFileLimitBytes: defaultLimit,
        requestedSingleFileLimitBytes: maxBytes,
        publicHttpOnly: true,
        noCredentialsCookiesOrTokens: true,
        overwriteDefault: false,
        allowedResourceTypes: [
          'paper PDF',
          'small supplement table or document',
          'public repository README/LICENSE/environment/script index',
          'public metadata manifest',
        ],
        rejectedResourceTypes: [
          'FASTQ/BAM/CRAM/SRA/fragments',
          'large image data',
          'controlled-access data',
          'login, token, cookie, or institution-gated resources',
        ],
      },
      outputDirStatus: outputStatus,
      plannedItems,
      warnings: plannedItems.length
        ? ['No network request, repository clone, package installation, analysis, or filesystem write was performed.']
        : ['localize_source_package requires sources, items, or urls.'],
      timestamp: Date.now(),
    };
  }

  if (action === 'audit_data_code_availability') {
    const sources = sourceMaterialsFromPayload(payload);
    const availability = classifySourceAvailability(sources);
    const blocked = Object.values(availability).filter((status) => status === 'blocked_for_execution').length;
    const dataAvailabilityItem: SourceAuditDataItem = {
      id: 'data-availability-statement',
      kind: 'unknown',
      modality: 'unknown',
      source: 'paper',
      accession: '',
      url: '',
      localPath: '',
      sizeBytes: null,
      access: 'unknown',
      licenseOrTerms: '',
      status: availability.data,
      supports: [],
      blocks: [],
      notes: sources.dataAvailability,
    };
    const codeAvailabilityItem: SourceAuditCodeItem = {
      id: 'code-availability-statement',
      repository: '',
      commitOrRelease: '',
      license: '',
      environmentFiles: [],
      scriptIndex: [],
      notebooks: [],
      runnableAsIs: false,
      status: availability.code,
      notes: sources.codeAvailability,
    };
    const dataItems: SourceAuditDataItem[] = [
      ...sources.accessions.map(
        (accession): SourceAuditDataItem => ({
          id: accession,
          kind: 'unknown',
          modality: 'unknown',
          source: inferAccessionSources(accession)[0] || 'unknown',
          accession,
          url: '',
          localPath: '',
          sizeBytes: null,
          access: inferControlledAccess(accession) ? 'controlled' : 'unknown',
          licenseOrTerms: '',
          status: availability.data,
          supports: [],
          blocks: [],
          notes: '',
        })
      ),
      ...sources.localPaths.map(
        (candidate, index): SourceAuditDataItem => ({
          id: `local-data-${index + 1}`,
          kind: 'unknown',
          modality: 'unknown',
          source: 'local',
          accession: '',
          url: '',
          localPath: candidate,
          sizeBytes: null,
          access: 'unknown',
          licenseOrTerms: '',
          status: safeAbsolutePathStatus(candidate) === 'available' ? 'ready' : 'unresolved',
          supports: [],
          blocks: [],
          notes: '',
        })
      ),
      ...(sources.dataAvailability && !sources.accessions.length && !sources.localPaths.length
        ? [dataAvailabilityItem]
        : []),
    ];
    const codeItems: SourceAuditCodeItem[] = [
      ...sources.codeLinks.map(
        (repository, index): SourceAuditCodeItem => ({
          id: `code-${index + 1}`,
          repository,
          commitOrRelease: '',
          license: '',
          environmentFiles: [],
          scriptIndex: [],
          notebooks: [],
          runnableAsIs: false,
          status: availability.code,
          notes: '',
        })
      ),
      ...(sources.codeAvailability && !sources.codeLinks.length ? [codeAvailabilityItem] : []),
    ];
    const sourceAudit = {
      schema: SOURCE_AUDIT_SCHEMA,
      caseId: asString(payload?.caseId || payload?.case_id),
      createdAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      paper: {
        ...sources.paper,
        preprint: '',
        sourceUrl: sources.paper.url,
        supplements: sources.supplements,
        methodsLocated: Boolean(sources.methods),
        dataAvailabilityLocated: Boolean(sources.dataAvailability),
        codeAvailabilityLocated: Boolean(sources.codeAvailability),
        status: availability.paper,
      },
      data: dataItems,
      code: codeItems,
      referenceResources: sources.referenceResources.map(
        (resource, index): SourceAuditReferenceResourceItem => ({
          id: `reference-${index + 1}`,
          kind: 'other',
          name: resource,
          version: '',
          source: '',
          url: '',
          localPath: '',
          status: availability.referenceResources,
          requiredBy: [],
          notes: '',
        })
      ),
      localized: [] as JsonRecord[],
      plannedOnly: [] as JsonRecord[],
      warnings: [
        {
          severity: 'warning',
          scope: 'availability',
          message: 'Availability does not imply reproducibility or scientific success.',
          affectedItems: [],
        },
        {
          severity: 'info',
          scope: 'source',
          message: 'Use bio_source for accession and local asset details before execution.',
          affectedItems: [],
        },
        ...(sources.credentialFieldsRedacted
          ? [
              {
                severity: 'warning',
                scope: 'source',
                message: 'Credential-like source fields were redacted and must not be stored in the Planning Package.',
                affectedItems: ['paper', 'supplements'],
              },
            ]
          : []),
      ],
    };
    const sourceAuditPath = asString(payload?.sourceAuditPath, 'case_reproduction/planning/source_audit.json');
    writeCanonicalJson(sourceAuditPath, sourceAudit);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: blocked ? 'partial_ready' : 'conditional_continue',
      planningOnly: true,
      sourceAudit,
      canonicalPath: sourceAuditPath,
      timestamp: Date.now(),
    };
  }

  if (action === 'extract_method_parameters') {
    const parsed = extractMethodParametersByIdPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      const legacyReceipt = isRecord(payload?.methodSourceReceipt)
        ? asString(payload.methodSourceReceipt.receiptId)
        : isRecord(asArray(payload?.sourceReceipts)[0])
          ? asString((asArray(payload?.sourceReceipts)[0] as JsonRecord).receiptId)
          : '';
      return invalidActionPayload(action, parsed.error, {
        methodContractPath: 'case_reproduction/planning/method_parameter_contract.json',
        methodSourceReceiptId: asString(payload?.methodSourceReceiptId, legacyReceipt),
        ...(asString(payload?.paperMapReceiptId) ? { paperMapReceiptId: asString(payload?.paperMapReceiptId) } : {}),
        ...(asString(payload?.scopeReceiptId) ? { scopeReceiptId: asString(payload?.scopeReceiptId) } : {}),
      });
    }
    try {
      const sourceReceipt = readStoredReceipt(parsed.data.methodSourceReceiptId, {
        producer: 'bio_source',
        action: 'inspect_method_sources',
        status: 'ready',
      });
      if (parsed.data.paperMapReceiptId) {
        readStoredReceipt(parsed.data.paperMapReceiptId, {
          producer: 'bio_reproduction',
          action: 'validate_paper_reproduction_map',
          status: 'ready',
        });
      }
      if (parsed.data.scopeReceiptId) {
        readStoredReceipt(parsed.data.scopeReceiptId, {
          producer: 'bio_reproduction',
          action: 'validate_reproduction_scope',
          status: 'ready',
        });
      }
      const contract = buildMethodContract([sourceReceipt]);
      if (!contract.sourceReceiptIds.length) {
        throw new Error('The stored method-source receipt does not contain validated method evidence.');
      }
      const canonicalHash = writeCanonicalJson(parsed.data.methodContractPath, contract);
      const methodParameterReceipt = buildMethodParameterReceipt({
        projectRoot: workspaceRoot(),
        canonicalPath: parsed.data.methodContractPath,
        canonicalHash,
        contract,
      });
      return {
        schema: 'openbioscience.bio_mcp.result.v2',
        action,
        status: 'ready',
        contractSchema: METHOD_CONTRACT_SCHEMA,
        canonicalPath: parsed.data.methodContractPath,
        receiptId: methodParameterReceipt.receiptId,
        moduleCoverage: contract.moduleCoverage,
        conflicts: contract.conflicts,
        eligibleClaims: contract.eligibleClaims,
        nextActions: [] as BioNextAction[],
        methodParameterReceipt,
        validationFingerprint: methodParameterReceipt.validationFingerprint,
        warnings: [] as string[],
        timestamp: Date.now(),
      };
    } catch (error) {
      return receiptLookupFailure(action, error);
    }
  }

  if (action === 'validate_method_alignment') {
    const parsed = validateMethodAlignmentByIdPayloadSchema.safeParse(payload || {});
    if (!parsed.success) {
      return invalidActionPayload(action, parsed.error, {
        methodParameterReceiptId: asString(
          payload?.methodParameterReceiptId,
          isRecord(payload?.methodParameterReceipt) ? asString(payload.methodParameterReceipt.receiptId) : ''
        ),
        executedParameterPath: asString(
          payload?.executedParameterPath,
          'case_reproduction/execution/configs/executed_parameters.json'
        ),
        scriptPaths: uniqueStrings(asArray(payload?.scriptPaths)),
      });
    }
    let methodReceipt: MethodParameterReceipt;
    try {
      methodReceipt = readStoredReceipt(parsed.data.methodParameterReceiptId, {
        producer: 'bio_reproduction',
        action: 'extract_method_parameters',
        status: 'ready',
      }) as MethodParameterReceipt;
    } catch (error) {
      return receiptLookupFailure(action, error);
    }
    if (!validMethodParameterReceipt(methodReceipt)) {
      return receiptLookupFailure(action, new Error('Stored MethodParameterReceipt is malformed.'));
    }
    const executedParameterPath = parsed.data.executedParameterPath;
    const scriptPaths = parsed.data.scriptPaths;
    const contractPath = resolveWorkspacePath(methodReceipt.canonicalFile.path);
    const contractRead = contractPath.status === 'available' ? readValidatedJson(contractPath.path) : {};
    const contractValidation = methodContractSchema.safeParse(contractRead.value);
    const receiptIssues = [
      path.resolve(methodReceipt.projectRoot) === workspaceRoot() ? '' : 'Method receipt belongs to another project.',
      contractPath.status === 'available' ? '' : 'Method contract is unavailable.',
      contractPath.status === 'available' && fs.existsSync(contractPath.path)
        ? contentHash(fs.readFileSync(contractPath.path)) === methodReceipt.canonicalFile.contentHash
          ? ''
          : 'Method contract changed after extraction.'
        : '',
      contractValidation.success ? '' : 'Method contract schema is invalid.',
    ].filter(Boolean);
    if (receiptIssues.length || !contractValidation.success) {
      return {
        schema: RESULT_SCHEMA,
        action,
        status: 'needs_completion',
        nextActions: [
          {
            id: 'refresh-method-parameter-contract',
            tool: 'bio_reproduction',
            action: 'extract_method_parameters',
            reason: receiptIssues.join(' '),
            payload: {
              methodContractPath: methodReceipt.canonicalFile.path,
              methodSourceReceiptId: methodReceipt.sourceReceiptIds[0] || '',
            },
          },
        ],
        warnings: receiptIssues,
        timestamp: Date.now(),
      };
    }
    const alignment = validateMethodAlignment({
      projectRoot: workspaceRoot(),
      methodReceipt,
      methodContract: contractValidation.data,
      executedParameterPath,
      scriptPaths,
    });
    return {
      schema: RESULT_SCHEMA,
      action,
      status: alignment.receipt ? 'ready' : 'needs_completion',
      alignmentLevel: alignment.receipt?.alignmentLevel,
      eligibleClaims: alignment.receipt?.eligibleClaims || [],
      alignedParameters: alignment.receipt?.alignedParameters || [],
      substitutedParameters: alignment.receipt?.substitutedParameters || [],
      conflicts: alignment.receipt?.conflicts || contractValidation.data.conflicts,
      nextActions: alignment.nextActions,
      methodAlignmentReceipt: alignment.receipt,
      warnings: alignment.issues,
      timestamp: Date.now(),
    };
  }

  if (action === 'draft_reproduction_plan') {
    const objective = asString(payload?.objective || payload?.reproductionObjective || payload?.reproduction_objective);
    const moduleInputs = asArray(payload?.modules || payload?.executionModules || payload?.execution_modules);
    const modules = moduleInputs.map((item, index) => {
      const record = isRecord(item) ? item : { objective: item };
      const moduleObjective = asString(record.objective || record.name, `module-${index + 1}`);
      const environmentRef = asString(record.environmentRef || record.environment_ref);
      return {
        id: asString(record.id, `module-${index + 1}`),
        objective: moduleObjective,
        status: environmentRef ? 'conditional_continue' : 'blocked_for_execution',
        environmentRef,
        skillRoute: uniqueStrings(asArray(record.skillRoute || record.skill_route)),
        mcpRoute: uniqueStrings(asArray(record.mcpRoute || record.mcp_route)),
        expectedOutputs: uniqueStrings(asArray(record.expectedOutputs || record.expected_outputs)),
        executeNow: false,
        warnings: environmentRef ? [] : ['Execution module requires an environmentRef before script-stage work.'],
      };
    });
    return {
      schema: RESULT_SCHEMA,
      action,
      status:
        objective && modules.some((module) => module.status !== 'blocked_for_execution')
          ? 'conditional_continue'
          : 'blocked_for_execution',
      planningOnly: true,
      planDraft: {
        schema: 'openbioscience.reproduction.plan.v1',
        objective,
        requiredSections: REPRODUCTION_PLAN_SECTIONS,
        modules,
        scriptBoundary: {
          scriptWritingAllowed: false,
          executionAllowed: false,
          requiredBeforeExecution: [
            'planning/reproduction_plan.md reviewed',
            'planning/source_audit.json reviewed',
            'planning/method_parameter_contract.json reviewed',
            'localized source files or approved existing demo data available',
            'official environmentRef selected',
          ],
        },
      },
      warnings: objective
        ? ['Draft is a planning structure only. Do not treat it as evidence or a successful reproduction result.']
        : ['draft_reproduction_plan requires objective or reproductionObjective.'],
      timestamp: Date.now(),
    };
  }

  if (action === 'validate_reproduction_plan') {
    const parsedPayload = validateReproductionPayloadSchema.safeParse(payload || {});
    if (!parsedPayload.success) {
      const legacySourceReceiptIds = asArray(payload?.sourceReceipts)
        .map((receipt) => (isRecord(receipt) ? asString(receipt.receiptId) : ''))
        .filter(Boolean);
      const legacyRuntimeReceiptIds = asArray(payload?.runtimeReceipts)
        .map((receipt) => (isRecord(receipt) ? asString(receipt.receiptId) : ''))
        .filter(Boolean);
      const suggestedPayload = {
        planPath: asString(payload?.planPath || payload?.plan_path, 'case_reproduction/planning/reproduction_plan.md'),
        sourceAuditPath: asString(
          payload?.sourceAuditPath || payload?.source_audit_path,
          'case_reproduction/planning/source_audit.json'
        ),
        localizedPaths: uniqueStrings(asArray(payload?.localizedPaths || payload?.localized_paths)),
        approvedExistingData: asBoolean(
          payload?.approvedExistingData ||
            payload?.approved_existing_data ||
            payload?.approvedExistingDemoData ||
            payload?.approved_existing_demo_data
        ),
        modules: asArray(payload?.modules || payload?.executionModules || payload?.execution_modules),
        paperMapReceiptId: asString(
          payload?.paperMapReceiptId,
          isRecord(payload?.paperMapReceipt) ? asString(payload.paperMapReceipt.receiptId) : ''
        ),
        scopeReceiptId: asString(
          payload?.scopeReceiptId,
          isRecord(payload?.scopeReceipt) ? asString(payload.scopeReceipt.receiptId) : ''
        ),
        methodParameterReceiptId: asString(
          payload?.methodParameterReceiptId,
          isRecord(payload?.methodParameterReceipt) ? asString(payload.methodParameterReceipt.receiptId) : ''
        ),
        sourceReceiptIds: uniqueStrings([...asArray(payload?.sourceReceiptIds), ...legacySourceReceiptIds]),
        runtimeReceiptIds: uniqueStrings([...asArray(payload?.runtimeReceiptIds), ...legacyRuntimeReceiptIds]),
        skillComplianceReceiptIds: uniqueStrings(asArray(payload?.skillComplianceReceiptIds)),
        methodContractPath: asString(
          payload?.methodContractPath || payload?.method_contract_path,
          'case_reproduction/planning/method_parameter_contract.json'
        ),
      };
      return invalidActionPayload(action, parsedPayload.error, suggestedPayload);
    }

    const {
      planPath: requestedPlanPath,
      sourceAuditPath: requestedAuditPath,
      localizedPaths = [],
      approvedExistingData = false,
      modules,
      paperMapReceiptId,
      scopeReceiptId,
      methodParameterReceiptId,
      sourceReceiptIds,
      runtimeReceiptIds,
      skillComplianceReceiptIds,
      methodContractPath: requestedMethodContractPath,
    } = parsedPayload.data;
    let paperMapReceipt: BioControlReceipt;
    let scopeReceipt: BioControlReceipt;
    let typedMethodReceipt: MethodParameterReceipt;
    let typedSourceReceipts: BioControlReceipt[];
    let typedRuntimeReceipts: BioControlReceipt[];
    let skillComplianceReceipts: BioControlReceipt[];
    try {
      paperMapReceipt = readStoredReceipt(paperMapReceiptId, {
        producer: 'bio_reproduction',
        action: 'validate_paper_reproduction_map',
        status: 'ready',
      });
      scopeReceipt = readStoredReceipt(scopeReceiptId, {
        producer: 'bio_reproduction',
        action: 'validate_reproduction_scope',
        status: 'ready',
      });
      typedMethodReceipt = readStoredReceipt(methodParameterReceiptId, {
        producer: 'bio_reproduction',
        action: 'extract_method_parameters',
        status: 'ready',
      }) as MethodParameterReceipt;
      typedSourceReceipts = sourceReceiptIds.map((receiptId) =>
        readStoredReceipt(receiptId, { producer: 'bio_source' })
      );
      typedRuntimeReceipts = runtimeReceiptIds.map((receiptId) =>
        readStoredReceipt(receiptId, { producer: 'bio_runtime' })
      );
      skillComplianceReceipts = skillComplianceReceiptIds.map((receiptId) =>
        readStoredReceipt(receiptId, {
          producer: 'bio_reproduction',
          action: 'validate_skill_compliance',
          status: 'ready',
        })
      );
    } catch (error) {
      return receiptLookupFailure(action, error);
    }
    const planPath = resolveWorkspacePath(requestedPlanPath);
    const auditPath = resolveWorkspacePath(requestedAuditPath);
    const methodPath = resolveWorkspacePath(requestedMethodContractPath);
    const localizedPathStatuses = localizedPaths.map((localizedPath) => {
      const resolved = resolveWorkspacePath(localizedPath);
      return { path: localizedPath, resolvedPath: resolved.path, status: resolved.status };
    });
    const moduleReadinessItems = moduleReadiness(modules);
    const validSourceReceipts = typedSourceReceipts.filter((receipt) => validReceiptForProject(receipt, 'bio_source'));
    const methodReceiptValid =
      validMethodParameterReceipt(typedMethodReceipt) &&
      path.resolve(typedMethodReceipt.projectRoot) === workspaceRoot() &&
      typedMethodReceipt.canonicalFile.path === requestedMethodContractPath &&
      methodPath.status === 'available' &&
      fs.existsSync(methodPath.path) &&
      contentHash(fs.readFileSync(methodPath.path)) === typedMethodReceipt.canonicalFile.contentHash &&
      methodContractSchema.safeParse(readValidatedJson(methodPath.path).value).success;
    const sourceDocumented =
      localizedPathStatuses.some((item) => item.status === 'available') ||
      approvedExistingData ||
      validSourceReceipts.length > 0;
    const planMissingSections = planPath.status === 'available' ? validatePlanDocument(planPath.path) : [];
    const auditRead = auditPath.status === 'available' ? readValidatedJson(auditPath.path) : {};
    const auditValidation = auditRead.value ? sourceAuditSchema.safeParse(auditRead.value) : undefined;
    const auditIssues = auditRead.error
      ? [auditRead.error]
      : auditValidation && !auditValidation.success
        ? formatZodIssues(auditValidation.error)
        : [];
    const missingRuntimeRefs = Array.from(new Set(moduleReadinessItems.map((item) => item.environmentRef))).filter(
      (environmentRef) => !runtimeReceiptFor(typedRuntimeReceipts, environmentRef)
    );
    const nextActions: BioNextAction[] = [];
    if (planPath.status !== 'available') {
      nextActions.push({
        id: 'create-reproduction-plan',
        tool: 'runtime',
        action: 'write_file',
        reason: 'Create the canonical reproduction plan under the authorized project root.',
        payload: { path: requestedPlanPath, requiredSections: REPRODUCTION_PLAN_SECTIONS },
      });
    } else if (planMissingSections.length) {
      nextActions.push({
        id: 'complete-reproduction-plan-sections',
        tool: 'runtime',
        action: 'patch_file',
        reason: `Add the missing required plan sections: ${planMissingSections.join(', ')}.`,
        payload: { path: requestedPlanPath, missingSections: planMissingSections },
      });
    }
    if (auditPath.status !== 'available' || auditIssues.length) {
      nextActions.push({
        id: 'write-canonical-source-audit',
        tool: 'runtime',
        action: 'write_file',
        reason: auditIssues.length
          ? `Rewrite source_audit.json using the bio_reproduction audit result: ${auditIssues.join('; ')}`
          : 'Write the canonical source audit returned by audit_data_code_availability.',
        payload: { path: requestedAuditPath, schema: SOURCE_AUDIT_SCHEMA },
      });
    }
    if (!sourceDocumented) {
      nextActions.push({
        id: 'verify-reproduction-sources',
        tool: 'bio_source',
        action: 'verify_local_assets',
        reason: 'Resolve or verify at least one source before validating the planning package.',
        payload: { paths: localizedPaths },
      });
    }
    if (!methodReceiptValid) {
      nextActions.push({
        id: 'complete-method-parameter-contract',
        tool: 'bio_reproduction',
        action: 'extract_method_parameters',
        reason:
          'Inspect method sources and write a current canonical method_parameter_contract.json before entering the script stage.',
        payload: {
          methodContractPath: requestedMethodContractPath,
          methodSourceReceiptId:
            validSourceReceipts.find((receipt) => receipt.action === 'inspect_method_sources')?.receiptId || '',
          paperMapReceiptId: paperMapReceipt.receiptId,
          scopeReceiptId: scopeReceipt.receiptId,
        },
      });
    }
    if (missingRuntimeRefs.length) {
      nextActions.push({
        id: 'probe-reproduction-environments',
        tool: 'bio_runtime',
        action: 'probe_environments',
        reason: 'Probe all selected environmentRefs once; a failed probe remains a valid readiness observation.',
        payload: { environmentRefs: missingRuntimeRefs },
      });
    }
    const incompleteModules = moduleReadinessItems.filter((item) => item.contractStatus === 'incomplete');
    if (incompleteModules.length) {
      nextActions.push({
        id: 'complete-execution-module-contracts',
        tool: 'bio_reproduction',
        action: 'draft_reproduction_plan',
        reason: `Complete module contracts for: ${incompleteModules.map((item) => item.id).join(', ')}.`,
        payload: { modules },
      });
    }

    const planningCompletion = nextActions.length ? 'incomplete' : 'complete';
    const executionModules = moduleReadinessItems.map((item) => {
      const runtimeReceipt = runtimeReceiptFor(typedRuntimeReceipts, item.environmentRef);
      if (!runtimeProbePassed(runtimeReceipt)) {
        return {
          ...item,
          executionStatus: 'blocked' as const,
          status: 'blocked_for_execution',
          blockingReasons: [...item.blockingReasons, `Runtime probe for ${item.environmentRef} did not pass.`],
        };
      }
      return item;
    });
    const runnableCount = executionModules.filter((item) => item.executionStatus !== 'blocked').length;
    const readyCount = executionModules.filter((item) => item.executionStatus === 'ready').length;
    const executionReadiness: ReproductionCompletionReceipt['executionReadiness'] = runnableCount
      ? readyCount === executionModules.length
        ? 'ready'
        : 'partial'
      : 'blocked';
    const externalBlockers: BioBlocker[] = executionModules
      .filter((item) => item.executionStatus === 'blocked')
      .map((item) => ({
        id: `blocker-${item.id}`,
        kind: runtimeProbePassed(runtimeReceiptFor(typedRuntimeReceipts, item.environmentRef)) ? 'data' : 'environment',
        message: item.blockingReasons.join(' ') || `Module ${item.id} is not executable with current inputs.`,
        moduleId: item.id,
        external: true,
      }));
    const checks = [
      {
        id: 'reproduction_plan',
        status: planPath.status === 'available' && !planMissingSections.length ? 'available' : 'unverified',
        required: true,
      },
      {
        id: 'source_audit',
        status: auditPath.status === 'available' && auditValidation?.success ? 'available' : 'unverified',
        required: true,
      },
      {
        id: 'method_parameter_contract',
        status: methodReceiptValid ? 'available' : 'unverified',
        required: true,
      },
      {
        id: 'localized_sources_or_demo_data',
        status: sourceDocumented ? 'available' : 'unverified',
        required: true,
      },
      {
        id: 'execution_modules',
        status: incompleteModules.length ? 'unverified' : 'available',
        required: true,
      },
      {
        id: 'runtime_probes',
        status: missingRuntimeRefs.length ? 'unverified' : 'available',
        required: true,
      },
    ];
    const canonicalFiles = [
      ...(isRecord((paperMapReceipt as unknown as JsonRecord).canonicalFile) &&
      typeof ((paperMapReceipt as unknown as JsonRecord).canonicalFile as JsonRecord).path === 'string' &&
      typeof ((paperMapReceipt as unknown as JsonRecord).canonicalFile as JsonRecord).contentHash === 'string'
        ? [
            {
              path: asString(((paperMapReceipt as unknown as JsonRecord).canonicalFile as JsonRecord).path),
              contentHash: asString(
                ((paperMapReceipt as unknown as JsonRecord).canonicalFile as JsonRecord).contentHash
              ),
            },
          ]
        : []),
      ...(planPath.status === 'available'
        ? [
            {
              path: path.relative(workspaceRoot(), planPath.path),
              contentHash: contentHash(fs.readFileSync(planPath.path)),
            },
          ]
        : []),
      ...(auditPath.status === 'available'
        ? [
            {
              path: path.relative(workspaceRoot(), auditPath.path),
              contentHash: contentHash(fs.readFileSync(auditPath.path)),
            },
          ]
        : []),
      ...(methodReceiptValid
        ? [
            {
              path: path.relative(workspaceRoot(), methodPath.path),
              contentHash: contentHash(fs.readFileSync(methodPath.path)),
            },
          ]
        : []),
    ];
    const skillIds = Array.from(
      new Set([
        'bio-omics-reproduction-planning',
        'bio-method-parameter-reconstruction',
        ...modules.flatMap((module) => module.skillRoute),
        ...skillComplianceReceipts
          .map((receipt) => asString((receipt as unknown as JsonRecord).skillId))
          .filter(Boolean),
      ])
    );
    const skillUses = skillIds.map((skillId, index) => ({
      id: `skill_use_${contentHash(skillId).slice(0, 12)}`,
      skillId,
      skillName: skillId,
      source: 'local' as const,
      purpose: index === 0 ? ('replication' as const) : ('pipeline' as const),
      status: 'used' as const,
      triggeredBy: 'bio_reproduction completion receipt',
      createdAt: Date.now(),
    }));
    const receiptDetails = {
      workflowKind: 'omics_reproduction',
      planningCompletion,
      executionReadiness,
      canonicalFiles,
      sourceReceiptIds: validSourceReceipts.map((receipt) => receipt.receiptId),
      runtimeReceiptIds: typedRuntimeReceipts
        .filter((receipt) => validReceiptForProject(receipt, 'bio_runtime'))
        .map((receipt) => receipt.receiptId),
      methodParameterReceiptId: methodReceiptValid ? typedMethodReceipt.receiptId : '',
      methodModuleCoverage: methodReceiptValid ? typedMethodReceipt.moduleCoverage : [],
      eligibleClaims: methodReceiptValid
        ? ['data_layer_reproduction', 'method_structure_reproduction', 'scoped_reimplementation']
        : [],
      moduleReadiness: executionModules,
      nextActions,
      externalBlockers,
    };
    const validationFingerprint = contentHash(JSON.stringify(stableValue(receiptDetails)));
    const baseReceipt = makeControlReceipt(
      'bio_reproduction',
      'validate_reproduction_plan',
      planningCompletion === 'complete' ? 'ready' : 'needs_completion',
      receiptDetails
    );
    const completionReceipt: ReproductionCompletionReceipt = {
      ...baseReceipt,
      producer: 'bio_reproduction',
      action: 'validate_reproduction_plan',
      workflowKind: 'omics_reproduction',
      planningCompletion,
      executionReadiness,
      validationFingerprint,
      canonicalFiles,
      sourceReceiptIds: receiptDetails.sourceReceiptIds,
      runtimeReceiptIds: receiptDetails.runtimeReceiptIds,
      methodParameterReceiptId: receiptDetails.methodParameterReceiptId,
      methodModuleCoverage: receiptDetails.methodModuleCoverage,
      eligibleClaims: receiptDetails.eligibleClaims,
      skillUses,
      moduleReadiness: executionModules,
      nextActions,
      externalBlockers,
    };
    return {
      schema: RESULT_SCHEMA,
      action,
      status: planningCompletion === 'complete' ? 'ready' : 'needs_completion',
      planningOnly: true,
      workflowKind: 'omics_reproduction',
      planningCompletion,
      executionReadiness,
      validationFingerprint,
      checks,
      localizedPaths: localizedPathStatuses,
      moduleReadiness: executionModules,
      nextActions,
      externalBlockers,
      completionReceipt,
      scriptBoundary: {
        mayEnterScriptStage: planningCompletion === 'complete' && runnableCount > 0,
        analysisExecuted: false,
        scientificSuccessClaim: false,
      },
      warnings:
        planningCompletion === 'complete'
          ? [
              'Planning completion is separate from execution readiness and does not validate scientific results.',
              ...(executionReadiness === 'ready'
                ? []
                : ['One or more planned modules remain conditional or externally blocked.']),
            ]
          : ['Follow nextActions to complete the workflow; do not replace required MCP stages with an ad hoc audit.'],
      timestamp: Date.now(),
    };
  }

  throw new Error(`Unsupported reproduction action "${action}".`);
};

async function main() {
  const profile = profileFromEnv();
  const definition = definitionFor(profile);
  const server = new McpServer({
    name: definition.serverName,
    version: '1.0.0',
  });

  server.tool(
    definition.toolName,
    definition.description,
    {
      action: z.enum(definition.actions as [string, ...string[]]),
      payload: z.object({}).passthrough().optional(),
    },
    async ({ action, payload }) => {
      const recordPayload = isRecord(payload) ? payload : {};
      const inputFingerprint = receiptInputFingerprint({ profile, action, payload: recordPayload });
      const producer = receiptProducerForProfile(profile);
      const dynamicProbeAction =
        producer === 'bio_runtime' && (action === 'probe_environment' || action === 'probe_environments');
      if (producer && !dynamicProbeAction) {
        try {
          const cachedReceipt = readCachedReceipt(workspaceRoot(), producer, action, inputFingerprint);
          if (cachedReceipt && cachedReceiptIsCurrent(cachedReceipt)) {
            return jsonText({
              schema: 'openbioscience.bio_mcp.result.v2',
              action,
              status: cachedReceipt.status,
              ...(cachedReceipt.details || {}),
              receiptId: cachedReceipt.receiptId,
              receipt: cachedReceipt,
              details: cachedReceipt.details,
              validationFingerprint: cachedReceipt.validationFingerprint,
              nextActions: asArray((cachedReceipt as unknown as JsonRecord).nextActions),
              cache: { hit: true, inputFingerprint },
              timestamp: Date.now(),
            });
          }
        } catch {
          // A missing or invalid cache entry falls through to normal action handling.
        }
      }
      const result =
        profile === 'runtime'
          ? handleRuntimeAction(action, recordPayload)
          : profile === 'source'
            ? await handleSourceAction(action, recordPayload)
            : profile === 'knowledge'
              ? handleKnowledgeAction(action, recordPayload)
              : profile === 'plot'
                ? handlePlotAction(action, recordPayload)
                : profile === 'benchmark'
                  ? handleBenchmarkAction(action, recordPayload)
                  : profile === 'statistics'
                    ? handleStatisticsAction(action, recordPayload)
                    : profile === 'environment_manager'
                      ? handleEnvironmentManagerAction(action, recordPayload)
                      : profile === 'analysis'
                        ? await handleAnalysisAction(workspaceRoot(), action, recordPayload)
                        : handleReproductionAction(action, recordPayload);
      const receiptIds = persistReceiptsFromResult(workspaceRoot(), result, { inputFingerprint, action });
      return jsonText({
        ...result,
        ...(receiptIds.length ? { receiptIds } : {}),
        cache: isRecord((result as unknown as JsonRecord).cache)
          ? (result as unknown as JsonRecord).cache
          : { hit: false, inputFingerprint },
      });
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[BioMCP] Fatal error:', error);
  process.exit(1);
});
