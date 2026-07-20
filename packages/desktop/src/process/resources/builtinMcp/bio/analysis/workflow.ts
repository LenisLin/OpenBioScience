import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import type {
  AnalysisCheckpointReceipt,
  AnalysisCheckpointStatus,
  BioBlocker,
  BioNextAction,
  OmicsAnalysisProjectStatus,
  OmicsAnalysisReceipt,
  OmicsAnalysisStage,
  OmicsAnalysisStageStatus,
} from '@/common/chat/science';
import { resolveSafeProjectWritePath } from '../pathSafety';
import { readReceipt } from '../receipts';
import { FREE_EXPLORATION_MODULE_PLAN } from '../catalog';
import {
  ANALYSIS_OUTPUT_MANIFEST_SCHEMA,
  assertAnalysisId,
  assertStageArtifactCoverage,
  createAnalysisState,
  ensureAnalysisLayout,
  fingerprintFile,
  readAnalysisState,
  requireStageFile,
  sha256,
  stableJson,
  stageControlRelativePath,
  stageOutputRelativePath,
  writeAnalysisState,
  type AnalysisEpisodeState,
  type AnalysisFileReference,
  type OmicsAnalysisState,
} from './contracts';
import { preflightAnalysisScript } from './preflight';

type JsonRecord = Record<string, unknown>;

const BIO_RECEIPT_SCHEMA = 'openbioscience.bio.receipt.v1' as const;
const ANALYSIS_WORKFLOW_KIND = 'omics_analysis' as const;

const asRecord = (value: unknown): JsonRecord | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : undefined;

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const uniqueStrings = (values: unknown[]): string[] =>
  [...new Set(values.map(asString).filter(Boolean))].toSorted((left, right) => left.localeCompare(right));

const stageSchema = z.enum(['intake', 'qc', 'baseline', 'exploration', 'episode', 'closing']);
const analysisIdSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      assertAnalysisId(value);
      return true;
    } catch {
      return false;
    }
  }, 'analysisId is invalid.');
const canonicalPathsSchema = z.array(z.string().min(1)).min(1);

const startPayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    inputRoot: z.string().min(1),
    modality: z.string().min(1).default('scrna_seq'),
  })
  .strict();

const stagePayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    stage: stageSchema,
    episodeId: analysisIdSchema.optional(),
  })
  .strict();

const completeIntakePayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    stagePlanReceiptId: z.string().min(1),
    canonicalFilePaths: canonicalPathsSchema,
    datasetUnits: z
      .array(
        z
          .object({
            id: analysisIdSchema,
            inputPaths: z.array(z.string().min(1)).min(1),
            modality: z.string().min(1),
            mergeWithOtherUnits: z.literal(false).optional(),
          })
          .strict()
      )
      .min(1),
    supportedAnalyses: z.array(z.string().min(1)),
    externalBlockers: z.array(z.string().min(1)).optional(),
  })
  .strict();

const completeQcPayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    stagePlanReceiptId: z.string().min(1),
    datasetUnitId: analysisIdSchema,
    canonicalFilePaths: canonicalPathsSchema,
    summary: z.record(z.unknown()).default({}),
  })
  .strict();

const completeBaselinePayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    stagePlanReceiptId: z.string().min(1),
    datasetUnitId: analysisIdSchema,
    annotationMode: z.literal('assisted_prior'),
    canonicalFilePaths: canonicalPathsSchema,
    candidateEpisodes: z.array(z.string().min(1)).min(3).max(5),
    summary: z.record(z.unknown()).default({}),
  })
  .strict();

const completeExplorationPayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    stagePlanReceiptId: z.string().min(1),
    scriptPreflightReceiptId: z.string().min(1),
    canonicalFilePaths: canonicalPathsSchema,
    datasetUnitId: analysisIdSchema.optional(),
    summary: z.record(z.unknown()).default({}),
    externalBlockers: z.array(z.string().min(1)).optional(),
  })
  .strict();

const prepareEpisodePayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    episodeId: analysisIdSchema,
    parentReceiptId: z.string().min(1),
    scientificQuestion: z.string().min(1),
    datasetUnitId: analysisIdSchema,
    dataSubset: z.string().min(1),
    comparisonGroups: z.array(z.string().min(1)).default([]),
    covariates: z.array(z.string().min(1)).default([]),
    replicateUnit: z.string().min(1),
    method: z.string().min(1),
    expectedOutputs: z.array(z.string().min(1)).min(1),
    stoppingConditions: z.array(z.string().min(1)).min(1),
    requiresStatistics: z.boolean().default(false),
    statisticsReceiptId: z.string().min(1).optional(),
  })
  .strict();

const completeEpisodePayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    episodeId: analysisIdSchema,
    stagePlanReceiptId: z.string().min(1),
    canonicalFilePaths: canonicalPathsSchema,
    statisticsReceiptId: z.string().min(1).optional(),
    summary: z.record(z.unknown()).default({}),
  })
  .strict();

const checkpointPayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    stage: stageSchema,
    episodeId: analysisIdSchema.optional(),
    conversationId: z.string().min(1).optional(),
    timeoutMs: z.number().int().min(15_000).max(600_000).optional(),
  })
  .strict();

const preflightPayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    stage: z.enum(['intake', 'qc', 'baseline', 'exploration', 'episode']),
    episodeId: analysisIdSchema.optional(),
    contractReceiptId: z.string().min(1),
    scriptPaths: z.array(z.string().min(1)).min(1),
  })
  .strict();

const closurePayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    coverage: z.record(z.unknown()).default({}),
  })
  .strict();

const closePayloadSchema = z
  .object({
    analysisId: analysisIdSchema,
    closureReceiptId: z.string().min(1),
    canonicalFilePaths: canonicalPathsSchema,
    summary: z.record(z.unknown()).default({}),
  })
  .strict();

const stageState = (state: OmicsAnalysisState, stage: OmicsAnalysisStage, episodeId?: string) => {
  if (stage === 'episode') {
    if (!episodeId) throw new Error('episodeId is required for an episode action.');
    const episode = state.episodes[episodeId];
    if (!episode) throw new Error(`Unknown episodeId: ${episodeId}`);
    return episode;
  }
  return state.stages[stage];
};

const setStageState = (
  state: OmicsAnalysisState,
  stage: OmicsAnalysisStage,
  next: Partial<{
    status: OmicsAnalysisStageStatus;
    receiptId: string;
    checkpointReceiptId: string;
    checkpointStatus: string;
  }>,
  episodeId?: string
): void => {
  const current = stageState(state, stage, episodeId);
  Object.assign(current, next, { updatedAt: Date.now() });
  state.updatedAt = Date.now();
};

const stageProjectStatus = (status: OmicsAnalysisStageStatus): OmicsAnalysisProjectStatus => {
  if (status === 'awaiting_user') return 'awaiting_user';
  if (status === 'needs_revision') return 'needs_revision';
  if (status === 'blocked') return 'blocked';
  if (status === 'accepted') return 'accepted';
  return 'running';
};

const stageSkillIds = (stage: OmicsAnalysisStage): string[] => {
  const common = ['bio-omics-analysis'];
  if (stage === 'intake') return [...common, 'bio-data-resolution', 'bio-singlecell-import'];
  if (stage === 'qc') return [...common, 'bio-singlecell-baseline', 'bio-qc-preprocess'];
  if (stage === 'baseline') return [...common, 'bio-singlecell-baseline', 'bio-cell-annotation'];
  if (stage === 'exploration') {
    return [
      ...common,
      'bio-singlecell-baseline',
      'bio-analysis-script-authoring',
      'bio-scrna-differential-expression',
      'bio-data-resolution',
      'bio-cell-annotation',
      'kdense-pathway-enrichment',
      'kdense-scanpy',
    ];
  }
  if (stage === 'episode') return [...common, 'bio-result-interpretation'];
  return common;
};

const bindSkills = (projectRoot: string, stage: OmicsAnalysisStage) =>
  stageSkillIds(stage).map((skillId) => {
    const skillRootCandidates = [
      ...(process.env.OPENBIOSCIENCE_SKILL_ROOTS || '').split(path.delimiter),
      projectRoot,
      process.cwd(),
      process.env.OPENBIOSCIENCE_ENV_ROOT,
      process.env.OPENBIOSCIENCE_RUNTIME_ROOT,
      process.env.OPENSCIENCE_RUNTIME_ROOT,
    ]
      .filter((root): root is string => Boolean(root))
      .flatMap((root) => [
        path.join(root, skillId, 'SKILL.md'),
        path.join(root, 'resources', 'skills', skillId, 'SKILL.md'),
      ]);
    const skillPath = [...new Set(skillRootCandidates)].find((candidate) => fs.existsSync(candidate));
    if (!skillPath) throw new Error(`Required workflow Skill is unavailable: ${skillId}`);
    return { skillId, contentHash: sha256(fs.readFileSync(skillPath)) };
  });

const toBlockers = (messages: string[] = []): BioBlocker[] =>
  messages.map((message, index) => ({
    id: `analysis-blocker-${index + 1}`,
    kind: 'data',
    message,
    external: true,
  }));

const nextAction = (
  analysisId: string,
  stage: OmicsAnalysisStage,
  action: string,
  reason: string,
  episodeId?: string
): BioNextAction => ({
  id: `${analysisId}-${stage}-${action}`,
  tool: 'bio_analysis',
  action,
  reason,
  payload: { analysisId, stage, ...(episodeId ? { episodeId } : {}) },
  maxAttempts: 1,
  stopWhenUnchanged: true,
});

const receiptIdFor = (identity: unknown): string => `bio_receipt_${sha256(stableJson(identity)).slice(0, 20)}`;

const makeReceipt = (params: {
  projectRoot: string;
  analysisId: string;
  modality: string;
  action: string;
  status: string;
  stage: OmicsAnalysisStage;
  stageStatus: OmicsAnalysisStageStatus;
  projectStatus: OmicsAnalysisProjectStatus;
  dependencyReceiptIds?: string[];
  canonicalFiles?: AnalysisFileReference[];
  skillUses?: Array<{ skillId: string; contentHash: string }>;
  nextActions?: BioNextAction[];
  externalBlockers?: BioBlocker[];
  summary?: JsonRecord;
  episodeId?: string;
}): OmicsAnalysisReceipt => {
  const details = {
    workflowKind: ANALYSIS_WORKFLOW_KIND,
    analysisId: params.analysisId,
    modality: params.modality,
    stage: params.stage,
    stageStatus: params.stageStatus,
    projectStatus: params.projectStatus,
    dependencyReceiptIds: params.dependencyReceiptIds || [],
    canonicalFiles: params.canonicalFiles || [],
    skillUses: params.skillUses || [],
    nextActions: params.nextActions || [],
    externalBlockers: params.externalBlockers || [],
    summary: params.summary || {},
    ...(params.episodeId ? { episodeId: params.episodeId } : {}),
  };
  return {
    schema: BIO_RECEIPT_SCHEMA,
    receiptId: receiptIdFor({
      producer: 'bio_analysis',
      action: params.action,
      projectRoot: params.projectRoot,
      details,
    }),
    producer: 'bio_analysis',
    action: params.action,
    status: params.status,
    projectRoot: path.resolve(params.projectRoot),
    createdAt: Date.now(),
    workflowKind: ANALYSIS_WORKFLOW_KIND,
    analysisId: params.analysisId,
    modality: params.modality,
    stage: params.stage,
    stageStatus: params.stageStatus,
    projectStatus: params.projectStatus,
    directDependencyReceiptIds: params.dependencyReceiptIds || [],
    canonicalFiles: params.canonicalFiles || [],
    skillUses: params.skillUses || [],
    nextActions: params.nextActions || [],
    externalBlockers: params.externalBlockers || [],
    privacyPolicy: {
      externalEgress: 'allowlisted',
      rawDataExport: 'forbidden',
      sampleIdentifierPolicy: 'local_only',
    },
    summary: params.summary || {},
    ...(params.episodeId ? { episodeId: params.episodeId } : {}),
    details,
  };
};

const writeStageContract = (
  projectRoot: string,
  analysisId: string,
  stage: OmicsAnalysisStage,
  content: JsonRecord,
  episodeId?: string
): AnalysisFileReference => {
  const relativePath = stageControlRelativePath(analysisId, stage, episodeId);
  const target = resolveSafeProjectWritePath(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, stableJson(content), { encoding: 'utf8', mode: 0o644, flag: 'wx' });
  fs.renameSync(temporary, target);
  return fingerprintFile(projectRoot, relativePath);
};

const assertPredecessorAccepted = (state: OmicsAnalysisState, stage: OmicsAnalysisStage): string => {
  const predecessor: Record<OmicsAnalysisStage, 'intake' | 'qc' | 'baseline' | undefined> = {
    intake: undefined,
    qc: 'intake',
    baseline: 'qc',
    exploration: undefined,
    episode: 'baseline',
    closing: 'baseline',
  };
  const previous = predecessor[stage];
  if (!previous) return '';
  const stateForPrevious = state.stages[previous];
  if (stateForPrevious.status !== 'accepted' || !stateForPrevious.receiptId) {
    throw new Error(`${previous} requires an accepted user checkpoint before ${stage} can start.`);
  }
  return stateForPrevious.receiptId;
};

const verifyReceiptId = (projectRoot: string, receiptId: string, analysisId: string): JsonRecord => {
  const receipt = readReceipt(projectRoot, receiptId) as unknown as JsonRecord;
  if (receipt.producer !== 'bio_analysis' || receipt.analysisId !== analysisId) {
    throw new Error(`Receipt ${receiptId} does not belong to analysis ${analysisId}.`);
  }
  return receipt;
};

const verifyScriptPreflightReceipt = (
  projectRoot: string,
  receiptId: string,
  state: OmicsAnalysisState,
  stage: OmicsAnalysisStage,
  stagePlanReceiptId: string
): string => {
  const receipt = verifyReceiptId(projectRoot, receiptId, state.analysisId);
  if (
    receipt.action !== 'preflight_scripts' ||
    receipt.status !== 'ready' ||
    receipt.stage !== stage ||
    receipt.stageStatus !== 'running'
  ) {
    throw new Error(`Receipt ${receiptId} is not a ready script preflight receipt for ${stage}.`);
  }
  const dependencies = Array.isArray(receipt.directDependencyReceiptIds) ? receipt.directDependencyReceiptIds : [];
  if (!dependencies.includes(stagePlanReceiptId)) {
    throw new Error(`Script preflight receipt ${receiptId} does not validate the current stage plan receipt.`);
  }
  return receiptId;
};

const canonicalOutputFiles = (
  projectRoot: string,
  analysisId: string,
  stage: OmicsAnalysisStage,
  paths: string[],
  episodeId?: string
): AnalysisFileReference[] =>
  paths.map((candidate) => requireStageFile(projectRoot, analysisId, stage, candidate, episodeId));

const collectOutputManifestPaths = (value: unknown): string[] => {
  if (typeof value === 'string') return [value.trim()].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(collectOutputManifestPaths);
  const record = asRecord(value);
  if (!record) return [];
  return Object.values(record).flatMap(collectOutputManifestPaths);
};

const outputManifestPathIssue = (candidate: string, outputRoot: string): string | undefined => {
  const normalized = candidate.replaceAll('\\', '/').trim();
  if (!normalized) return undefined;
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//u.test(normalized)) {
    return `Output manifest path must be project-relative and UI-openable: ${candidate}`;
  }
  if (normalized.includes('://') || normalized === '..' || normalized.startsWith('../')) {
    return `Output manifest path is not a local project-relative path: ${candidate}`;
  }
  const collapsed = path.posix.normalize(normalized);
  if (collapsed === '..' || collapsed.startsWith('../')) {
    return `Output manifest path escapes the project root: ${candidate}`;
  }
  if (collapsed.startsWith(`${outputRoot}/`)) return undefined;
  const stageLocalPrefixes = ['scripts/', 'configs/', 'results/', 'reports/', 'logs/'];
  if (stageLocalPrefixes.some((prefix) => collapsed.startsWith(prefix))) return undefined;
  return `Output manifest path must stay under ${outputRoot} or be relative to that stage root: ${candidate}`;
};

const validateOutputManifestPaths = (
  manifestContent: JsonRecord,
  analysisId: string,
  stage: OmicsAnalysisStage,
  episodeId?: string
): string[] => {
  const outputRoot = stageOutputRelativePath(analysisId, stage, episodeId);
  return collectOutputManifestPaths(manifestContent.outputs)
    .map((candidate) => outputManifestPathIssue(candidate, outputRoot))
    .filter((issue): issue is string => Boolean(issue));
};

const requireStringField = (record: JsonRecord, field: string, expected?: string): string[] => {
  const value = asString(record[field]);
  if (!value) return [`output manifest is missing ${field}.`];
  if (expected && value !== expected) return [`output manifest ${field} must be ${expected}.`];
  return [];
};

const manifestOutputsByRole = (manifestContent: JsonRecord): Record<string, string[]> => {
  const outputs = asRecord(manifestContent.outputs);
  if (!outputs) return {};
  return Object.fromEntries(
    Object.entries(outputs).map(([role, value]) => [
      role,
      collectOutputManifestPaths(value).map((item) => item.replaceAll('\\', '/')),
    ])
  );
};

const hasOutputEnding = (outputs: Record<string, string[]>, role: string, suffix: string): boolean =>
  (outputs[role] || []).some((candidate) => candidate.endsWith(suffix));

const validateAnalysisOutputManifest = (
  manifestContent: JsonRecord,
  analysisId: string,
  stage: OmicsAnalysisStage,
  episodeId?: string
): string[] => {
  const issues = validateOutputManifestPaths(manifestContent, analysisId, stage, episodeId);
  if (stage !== 'exploration') return issues;

  issues.push(...requireStringField(manifestContent, 'workflowKind', ANALYSIS_WORKFLOW_KIND));
  issues.push(...requireStringField(manifestContent, 'analysisId', analysisId));
  issues.push(...requireStringField(manifestContent, 'stageOrEpisodeId', episodeId || stage));
  issues.push(...requireStringField(manifestContent, 'environmentRef'));
  if (!Array.isArray(manifestContent.inputs) || manifestContent.inputs.length === 0) {
    issues.push('output manifest must declare non-empty inputs.');
  }
  const outputs = manifestOutputsByRole(manifestContent);
  if (!Object.keys(outputs).length) issues.push('output manifest must declare outputs by role.');
  for (const role of ['objects', 'tables', 'figures', 'reports', 'logs', 'scripts']) {
    if (!outputs[role]?.length) issues.push(`output manifest must declare ${role} outputs.`);
  }
  if (!hasOutputEnding(outputs, 'logs', 'session_info.json') && !hasOutputEnding(outputs, 'logs', 'session_info.txt')) {
    issues.push('exploration output manifest must include logs/session_info.json or logs/session_info.txt.');
  }
  if (!hasOutputEnding(outputs, 'logs', 'warnings.tsv')) {
    issues.push('exploration output manifest must include logs/warnings.tsv.');
  }
  if (!hasOutputEnding(outputs, 'scripts', 'script_manifest.json')) {
    issues.push('exploration output manifest must include scripts/script_manifest.json.');
  }
  return issues;
};

const explorationWorkflowModules = (
  projectRoot: string,
  canonicalFiles: AnalysisFileReference[]
): unknown[] => {
  const manifest = canonicalFiles.find((file) => file.path.endsWith('scripts/script_manifest.json'));
  if (!manifest) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(projectRoot, manifest.path), 'utf8')) as JsonRecord;
    return Array.isArray(parsed.workflowModules) ? parsed.workflowModules : [];
  } catch {
    return [];
  }
};

const assertSingleDatasetUnit = (state: OmicsAnalysisState, datasetUnitId: string): void => {
  const intake = state.stages.intake;
  const receipt = intake.receiptId
    ? (readReceipt(state.projectRoot, intake.receiptId) as unknown as JsonRecord)
    : undefined;
  const summary = asRecord(receipt?.summary);
  const units = Array.isArray(summary?.datasetUnits) ? summary.datasetUnits : [];
  const matching = units.filter((item: unknown) => asRecord(item)?.id === datasetUnitId);
  if (matching.length !== 1) throw new Error(`datasetUnitId ${datasetUnitId} is not part of the accepted intake.`);
};

const stagePlan = (
  projectRoot: string,
  state: OmicsAnalysisState,
  stage: OmicsAnalysisStage,
  summary: JsonRecord,
  dependencies: string[],
  episodeId?: string
) => {
  ensureAnalysisLayout(projectRoot, state.analysisId, stage, episodeId);
  const contract = writeStageContract(
    projectRoot,
    state.analysisId,
    stage,
    {
      schema: 'openbioscience.omics_analysis.stage_contract.v1',
      workflowKind: ANALYSIS_WORKFLOW_KIND,
      analysisId: state.analysisId,
      modality: state.modality,
      stage,
      ...(episodeId ? { episodeId } : {}),
      dependencies,
      outputRoot: stageOutputRelativePath(state.analysisId, stage, episodeId),
      outputManifestSchema: ANALYSIS_OUTPUT_MANIFEST_SCHEMA,
      privacyPolicy: {
        externalEgress: 'allowlisted_species_tissue_gene_symbols_only',
        rawDataExport: 'forbidden',
        sampleIdentifierPolicy: 'local_only',
      },
      summary,
    },
    episodeId
  );
  const receipt = makeReceipt({
    projectRoot,
    analysisId: state.analysisId,
    modality: state.modality,
    action: `prepare_${stage}`,
    status: 'ready',
    stage,
    stageStatus: 'running',
    projectStatus: 'running',
    dependencyReceiptIds: dependencies,
    canonicalFiles: [contract],
    skillUses: bindSkills(projectRoot, stage),
    nextActions: [
      nextAction(
        state.analysisId,
        stage,
        `complete_${stage}`,
        'Run the approved stage and submit its output manifest.',
        episodeId
      ),
    ],
    summary,
    episodeId,
  });
  setStageState(state, stage, { status: 'running', receiptId: receipt.receiptId }, episodeId);
  state.currentStage = stage;
  state.projectStatus = 'running';
  writeAnalysisState(projectRoot, state);
  return { receipt, contract };
};

const completeStage = (params: {
  projectRoot: string;
  state: OmicsAnalysisState;
  stage: OmicsAnalysisStage;
  stagePlanReceiptId: string;
  canonicalFiles: AnalysisFileReference[];
  summary: JsonRecord;
  dependencyReceiptIds?: string[];
  externalBlockers?: BioBlocker[];
  episodeId?: string;
  reviewRequired?: boolean;
}) => {
  const current = stageState(params.state, params.stage, params.episodeId);
  if (current.status !== 'running' || current.receiptId !== params.stagePlanReceiptId) {
    throw new Error(`${params.stage} must be prepared with the current stage plan receipt before completion.`);
  }
  verifyReceiptId(params.projectRoot, params.stagePlanReceiptId, params.state.analysisId);
  const missingArtifacts = assertStageArtifactCoverage(params.canonicalFiles, params.stage);
  if (missingArtifacts.length) {
    throw new Error(`${params.stage} is missing required outputs: ${missingArtifacts.join(', ')}.`);
  }
  if (params.stage !== 'closing') {
    const manifest = params.canonicalFiles.find((file) => file.path.endsWith('results/output_manifest.json'));
    if (!manifest) throw new Error(`${params.stage} is missing its output manifest.`);
    const manifestPath = path.join(params.projectRoot, manifest.path);
    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as JsonRecord & { schema?: unknown };
    if (manifestContent.schema !== ANALYSIS_OUTPUT_MANIFEST_SCHEMA) {
      throw new Error(`${params.stage} output manifest must use ${ANALYSIS_OUTPUT_MANIFEST_SCHEMA}.`);
    }
    const manifestPathIssues = validateAnalysisOutputManifest(
      manifestContent,
      params.state.analysisId,
      params.stage,
      params.episodeId
    );
    if (manifestPathIssues.length) {
      throw new Error(
        `${params.stage} output manifest declares non-canonical outputs: ${manifestPathIssues.join('; ')}`
      );
    }
  }
  const reviewRequired = params.reviewRequired ?? true;
  const nextStageStatus: OmicsAnalysisStageStatus = reviewRequired ? 'awaiting_user' : 'accepted';
  const nextProjectStatus: OmicsAnalysisProjectStatus = reviewRequired ? 'awaiting_user' : 'accepted';
  const receipt = makeReceipt({
    projectRoot: params.projectRoot,
    analysisId: params.state.analysisId,
    modality: params.state.modality,
    action: `complete_${params.stage}`,
    status: reviewRequired ? 'awaiting_user' : 'ready',
    stage: params.stage,
    stageStatus: nextStageStatus,
    projectStatus: nextProjectStatus,
    dependencyReceiptIds: uniqueStrings([params.stagePlanReceiptId, ...(params.dependencyReceiptIds || [])]),
    canonicalFiles: params.canonicalFiles,
    skillUses: bindSkills(params.projectRoot, params.stage),
    nextActions: reviewRequired
      ? [
          nextAction(
            params.state.analysisId,
            params.stage,
            'request_checkpoint',
            'Review the published tables and figures before allowing the next stage.',
            params.episodeId
          ),
        ]
      : [],
    externalBlockers: params.externalBlockers,
    summary: params.summary,
    episodeId: params.episodeId,
  });
  setStageState(
    params.state,
    params.stage,
    { status: nextStageStatus, receiptId: receipt.receiptId },
    params.episodeId
  );
  params.state.projectStatus = nextProjectStatus;
  writeAnalysisState(params.projectRoot, params.state);
  return receipt;
};

const checkpointStatus = (result: JsonRecord): AnalysisCheckpointStatus => {
  const status = asString(result.status);
  if (status === 'cancelled' || status === 'skipped') return 'cancelled';
  if (status !== 'answered') return 'deferred';
  const selected = (Array.isArray(result.answers) ? result.answers : [])
    .map(asRecord)
    .flatMap((answer) => (Array.isArray(answer?.selectedOptionIds) ? answer.selectedOptionIds : []))
    .map(asString);
  if (selected.includes('accept')) return 'accepted';
  if (selected.includes('accept_with_changes')) return 'accepted_with_changes';
  return 'needs_revision';
};

const requestUserCheckpoint = async (payload: JsonRecord): Promise<JsonRecord> => {
  const url = process.env.DEEPORGANISER_USER_INPUT_URL;
  const token = process.env.DEEPORGANISER_USER_INPUT_TOKEN;
  if (!url || !token) {
    return { schema: 'deeporganiser.user_input.result.v1', requestId: 'unavailable', status: 'unavailable' };
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok)
    return { schema: 'deeporganiser.user_input.result.v1', requestId: 'unavailable', status: 'unavailable' };
  const result = await response.json();
  return (
    asRecord(result) || {
      schema: 'deeporganiser.user_input.result.v1',
      requestId: 'unavailable',
      status: 'unavailable',
    }
  );
};

const checkpointQuestion = (state: OmicsAnalysisState, stage: OmicsAnalysisStage, episodeId?: string): JsonRecord => ({
  title: `Review ${stage}`,
  reason: `Confirm the ${stage} results for analysis ${state.analysisId} before the workflow advances.`,
  timeoutMs: 600_000,
  questions: [
    {
      id: 'checkpoint_decision',
      type: 'single_choice',
      title: 'Checkpoint decision',
      required: true,
      options: [
        { id: 'accept', label: 'Accept' },
        { id: 'accept_with_changes', label: 'Accept with changes' },
        { id: 'needs_revision', label: 'Needs revision' },
      ],
    },
  ],
  ...(episodeId ? { episodeId } : {}),
});

export const handleAnalysisAction = async (
  projectRoot: string,
  action: string,
  payload: JsonRecord = {}
): Promise<JsonRecord> => {
  if (action === 'schema') {
    return {
      schema: 'openbioscience.bio_mcp.result.v2',
      action,
      status: 'ready',
      actions: {
        start_analysis: {
          required: ['analysisId', 'inputRoot'],
          optional: ['modality'],
          notes: ['inputRoot must be project-relative and already exist.'],
        },
        prepare_exploration: {
          required: ['analysisId'],
          optional: [],
          outputRoot: 'omics_analysis/<analysisId>/exploration',
          minimumAnalysisPlan: FREE_EXPLORATION_MODULE_PLAN,
        },
        complete_exploration: {
          required: ['analysisId', 'stagePlanReceiptId', 'scriptPreflightReceiptId', 'canonicalFilePaths'],
          optional: ['datasetUnitId', 'summary', 'externalBlockers'],
          outputRoot: 'omics_analysis/<analysisId>/exploration',
          requiredOutputs: [
            'scripts/',
            'results/tables/input_inventory',
            'results/tables/qc_metrics',
            'results/tables/cluster_assignments',
            'results/tables/embedding_coordinates',
            'results/tables/cluster_markers',
            'results/tables/major_annotation',
            'results/tables/fraction_by_sample',
            'results/tables/fraction_group_comparison',
            'results/tables/processed_expression_feature_screening',
            'results/tables/pathway_enrichment',
            'results/tables/blocked_or_limited_contrasts',
            'results/figures/embedding',
            'results/figures/markers',
            'results/figures/composition',
            'results/figures/differential_features',
            'results/figures/pathway_enrichment',
            'results/output_manifest.json',
            'reports/analysis_report',
            'logs/',
          ],
          notes: [
            'Use complete_exploration for private automated exploratory analyses that should not be forced through the baseline/episode checkpoint lifecycle.',
            'For scRNA-seq free exploration, a valid completion is a discovery package, not an intake audit: it must include clustering/embedding, major annotation, marker figures, group-aware composition, exploratory feature ranking, enrichment, report, manifest, script, and logs unless a listed blocker makes a module impossible.',
            'Raw integer counts are required for edgeR/DESeq2/negative-binomial pseudobulk DE, but their absence does not block Scanpy/Seurat-style processed-expression exploratory feature screening; label those outputs as exploratory and non-confirmatory.',
            'canonicalFilePaths must be project-relative paths under omics_analysis/<analysisId>/exploration.',
            'The UI-openable omics_analysis/<analysisId>/exploration tree is the primary deliverable; /output, output/, project_outputs/, and other external mirrors are not valid canonical outputs.',
            'results/output_manifest.json outputs must be under the same canonical stage tree or stage-root-relative paths such as results/, reports/, logs/, scripts/, or configs/.',
          ],
        },
      },
    };
  }

  if (action === 'status') {
    const analysisId = asString(payload.analysisId);
    if (!analysisId) {
      const root = path.join(projectRoot, '.openbioscience', 'control', 'analysis', 'v1');
      const analysisIds = fs.existsSync(root)
        ? fs
            .readdirSync(root, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .toSorted()
        : [];
      return { schema: 'openbioscience.bio_mcp.result.v2', action, status: 'ready', analysisIds };
    }
    const state = readAnalysisState(projectRoot, analysisId);
    return { schema: 'openbioscience.bio_mcp.result.v2', action, status: 'ready', state };
  }

  if (action === 'start_analysis') {
    const input = startPayloadSchema.parse(payload);
    const statePath = path.join(
      projectRoot,
      '.openbioscience',
      'control',
      'analysis',
      'v1',
      input.analysisId,
      'state.json'
    );
    if (fs.existsSync(statePath)) throw new Error(`analysisId already exists: ${input.analysisId}`);
    const state = createAnalysisState({
      projectRoot,
      analysisId: input.analysisId as string,
      inputRoot: input.inputRoot as string,
      modality: input.modality as string,
    });
    ensureAnalysisLayout(projectRoot, state.analysisId);
    writeAnalysisState(projectRoot, state);
    const receipt = makeReceipt({
      projectRoot,
      analysisId: state.analysisId,
      modality: state.modality,
      action,
      status: 'ready',
      stage: 'intake',
      stageStatus: 'running',
      projectStatus: 'running',
      nextActions: [
        nextAction(state.analysisId, 'intake', 'prepare_intake', 'Inspect the user-authorized input root.'),
      ],
      summary: {
        inputRoot: state.inputRoot,
        adapter: state.modality === 'scrna_seq' ? 'scrna_baseline' : 'intake_only',
      },
    });
    return {
      schema: 'openbioscience.bio_mcp.result.v2',
      action,
      status: 'ready',
      analysisId: state.analysisId,
      receipt,
    };
  }

  if (
    action === 'prepare_intake' ||
    action === 'prepare_qc' ||
    action === 'prepare_baseline' ||
    action === 'prepare_exploration'
  ) {
    const input = stagePayloadSchema.parse({ ...payload, stage: action.replace('prepare_', '') });
    const state = readAnalysisState(projectRoot, input.analysisId);
    const stage = input.stage;
    if (stage !== 'intake' && stage !== 'exploration' && state.modality !== 'scrna_seq') {
      throw new Error(`No ${stage} adapter is implemented for modality ${state.modality}; only intake is available.`);
    }
    const dependency = assertPredecessorAccepted(state, stage);
    const stageSummary =
      stage === 'exploration'
        ? {
            inputRoot: state.inputRoot,
            workflowKind: 'omics_analysis/free_exploration',
            minimumAnalysisPlan: FREE_EXPLORATION_MODULE_PLAN,
            resultStrengthLabels: ['descriptive', 'exploratory_processed_expression', 'replicate_aware_inference'],
          }
        : { inputRoot: state.inputRoot };
    const planned = stagePlan(
      projectRoot,
      state,
      stage,
      stageSummary,
      dependency ? [dependency] : []
    );
    return {
      schema: 'openbioscience.bio_mcp.result.v2',
      action,
      status: 'ready',
      analysisId: state.analysisId,
      receipt: planned.receipt,
    };
  }

  if (action === 'complete_intake') {
    const input = completeIntakePayloadSchema.parse(payload);
    const state = readAnalysisState(projectRoot, input.analysisId);
    const inputRootPrefix = `${state.inputRoot.replace(/\/$/u, '')}/`;
    for (const unit of input.datasetUnits) {
      if (unit.mergeWithOtherUnits !== false)
        throw new Error('dataset units must explicitly prohibit automatic merging.');
      if (unit.inputPaths.some((candidate) => !candidate.replaceAll('\\', '/').startsWith(inputRootPrefix))) {
        throw new Error(`Dataset unit ${unit.id} references an input outside the authorized inputRoot.`);
      }
    }
    const receipt = completeStage({
      projectRoot,
      state,
      stage: 'intake',
      stagePlanReceiptId: input.stagePlanReceiptId,
      canonicalFiles: canonicalOutputFiles(projectRoot, input.analysisId, 'intake', input.canonicalFilePaths),
      summary: { datasetUnits: input.datasetUnits, supportedAnalyses: input.supportedAnalyses, automaticMerge: false },
      externalBlockers: toBlockers(input.externalBlockers),
    });
    return { schema: 'openbioscience.bio_mcp.result.v2', action, status: 'awaiting_user', receipt };
  }

  if (action === 'complete_qc') {
    const input = completeQcPayloadSchema.parse(payload);
    const state = readAnalysisState(projectRoot, input.analysisId);
    if (state.modality !== 'scrna_seq') throw new Error('QC completion requires the scRNA-seq adapter.');
    assertSingleDatasetUnit(state, input.datasetUnitId);
    const receipt = completeStage({
      projectRoot,
      state,
      stage: 'qc',
      stagePlanReceiptId: input.stagePlanReceiptId,
      canonicalFiles: canonicalOutputFiles(projectRoot, input.analysisId, 'qc', input.canonicalFilePaths),
      summary: { ...input.summary, datasetUnitId: input.datasetUnitId },
      dependencyReceiptIds: [state.stages.intake.receiptId || ''],
    });
    return { schema: 'openbioscience.bio_mcp.result.v2', action, status: 'awaiting_user', receipt };
  }

  if (action === 'complete_baseline') {
    const input = completeBaselinePayloadSchema.parse(payload);
    const state = readAnalysisState(projectRoot, input.analysisId);
    if (state.modality !== 'scrna_seq') throw new Error('Baseline completion requires the scRNA-seq adapter.');
    assertSingleDatasetUnit(state, input.datasetUnitId);
    const receipt = completeStage({
      projectRoot,
      state,
      stage: 'baseline',
      stagePlanReceiptId: input.stagePlanReceiptId,
      canonicalFiles: canonicalOutputFiles(projectRoot, input.analysisId, 'baseline', input.canonicalFilePaths),
      summary: {
        ...input.summary,
        datasetUnitId: input.datasetUnitId,
        annotationMode: input.annotationMode,
        candidateEpisodes: input.candidateEpisodes,
        autoExecution: false,
      },
      dependencyReceiptIds: [state.stages.qc.receiptId || ''],
    });
    return { schema: 'openbioscience.bio_mcp.result.v2', action, status: 'awaiting_user', receipt };
  }

  if (action === 'complete_exploration') {
    const input = completeExplorationPayloadSchema.parse(payload);
    const state = readAnalysisState(projectRoot, input.analysisId);
    const canonicalFiles = canonicalOutputFiles(projectRoot, input.analysisId, 'exploration', input.canonicalFilePaths);
    const receipt = completeStage({
      projectRoot,
      state,
      stage: 'exploration',
      stagePlanReceiptId: input.stagePlanReceiptId,
      canonicalFiles,
      summary: {
        ...input.summary,
        ...(input.datasetUnitId ? { datasetUnitId: input.datasetUnitId } : {}),
        exploratory: true,
        confirmatoryInference: false,
        workflowModules: explorationWorkflowModules(projectRoot, canonicalFiles),
      },
      dependencyReceiptIds: [
        verifyScriptPreflightReceipt(
          projectRoot,
          input.scriptPreflightReceiptId,
          state,
          'exploration',
          input.stagePlanReceiptId
        ),
      ],
      externalBlockers: toBlockers(input.externalBlockers),
      reviewRequired: false,
    });
    return { schema: 'openbioscience.bio_mcp.result.v2', action, status: 'ready', receipt };
  }

  if (action === 'prepare_episode') {
    const input = prepareEpisodePayloadSchema.parse(payload);
    const state = readAnalysisState(projectRoot, input.analysisId);
    if (state.modality !== 'scrna_seq') throw new Error('Episodes require an implemented modality adapter.');
    const baselineReceiptId = assertPredecessorAccepted(state, 'episode');
    if (state.activeEpisodeId) throw new Error(`Episode ${state.activeEpisodeId} is still active.`);
    if (input.parentReceiptId !== baselineReceiptId && !state.episodes[input.episodeId]) {
      const parent = verifyReceiptId(projectRoot, input.parentReceiptId, input.analysisId);
      if (parent.stage !== 'episode')
        throw new Error('An episode must descend from the accepted baseline or a prior episode.');
    }
    assertSingleDatasetUnit(state, input.datasetUnitId);
    if (input.requiresStatistics && !input.statisticsReceiptId) {
      throw new Error('Inference episodes require a current bio_statistics receipt before planning.');
    }
    if (input.statisticsReceiptId) {
      const statistics = readReceipt(projectRoot, input.statisticsReceiptId) as unknown as JsonRecord;
      if (statistics.producer !== 'bio_statistics')
        throw new Error('statisticsReceiptId must reference a bio_statistics receipt.');
    }
    const episode: AnalysisEpisodeState = {
      episodeId: input.episodeId,
      parentReceiptId: input.parentReceiptId,
      scientificQuestion: input.scientificQuestion,
      requiresStatistics: input.requiresStatistics,
      status: 'running',
      updatedAt: Date.now(),
    };
    state.episodes[input.episodeId] = episode;
    state.activeEpisodeId = input.episodeId;
    const planned = stagePlan(
      projectRoot,
      state,
      'episode',
      {
        scientificQuestion: input.scientificQuestion,
        datasetUnitId: input.datasetUnitId,
        dataSubset: input.dataSubset,
        comparisonGroups: input.comparisonGroups,
        covariates: input.covariates,
        replicateUnit: input.replicateUnit,
        method: input.method,
        expectedOutputs: input.expectedOutputs,
        stoppingConditions: input.stoppingConditions,
        requiresStatistics: input.requiresStatistics,
      },
      uniqueStrings([input.parentReceiptId, input.statisticsReceiptId || '']),
      input.episodeId
    );
    return { schema: 'openbioscience.bio_mcp.result.v2', action, status: 'ready', receipt: planned.receipt };
  }

  if (action === 'complete_episode') {
    const input = completeEpisodePayloadSchema.parse(payload);
    const state = readAnalysisState(projectRoot, input.analysisId);
    const episode = stageState(state, 'episode', input.episodeId) as AnalysisEpisodeState;
    if (episode.requiresStatistics && !input.statisticsReceiptId) {
      throw new Error('This episode requires a bio_statistics receipt before result review.');
    }
    if (input.statisticsReceiptId) {
      const statistics = readReceipt(projectRoot, input.statisticsReceiptId) as unknown as JsonRecord;
      if (statistics.producer !== 'bio_statistics')
        throw new Error('statisticsReceiptId must reference bio_statistics.');
    }
    const receipt = completeStage({
      projectRoot,
      state,
      stage: 'episode',
      episodeId: input.episodeId,
      stagePlanReceiptId: input.stagePlanReceiptId,
      canonicalFiles: canonicalOutputFiles(
        projectRoot,
        input.analysisId,
        'episode',
        input.canonicalFilePaths,
        input.episodeId
      ),
      summary: { ...input.summary, scientificQuestion: episode.scientificQuestion },
      dependencyReceiptIds: uniqueStrings([episode.parentReceiptId, input.statisticsReceiptId || '']),
    });
    return { schema: 'openbioscience.bio_mcp.result.v2', action, status: 'awaiting_user', receipt };
  }

  if (action === 'request_checkpoint') {
    const input = checkpointPayloadSchema.parse(payload);
    const state = readAnalysisState(projectRoot, input.analysisId);
    const current = stageState(state, input.stage, input.episodeId);
    if (current.status !== 'awaiting_user' || !current.receiptId) {
      throw new Error(`${input.stage} has no result awaiting user review.`);
    }
    const result = await requestUserCheckpoint({
      ...checkpointQuestion(state, input.stage, input.episodeId),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    });
    const decision = checkpointStatus(result);
    const nextStatus: OmicsAnalysisStageStatus =
      decision === 'accepted'
        ? 'accepted'
        : decision === 'accepted_with_changes' || decision === 'needs_revision'
          ? 'needs_revision'
          : 'awaiting_user';
    const projectStatus = stageProjectStatus(nextStatus);
    const receiptBase = makeReceipt({
      projectRoot,
      analysisId: state.analysisId,
      modality: state.modality,
      action,
      status: decision === 'accepted' ? 'ready' : 'awaiting_user',
      stage: input.stage,
      stageStatus: nextStatus,
      projectStatus,
      dependencyReceiptIds: [current.receiptId],
      skillUses: bindSkills(projectRoot, input.stage),
      nextActions:
        decision === 'accepted'
          ? []
          : [
              nextAction(
                state.analysisId,
                input.stage,
                'request_checkpoint',
                'The workflow remains paused for user review.',
                input.episodeId
              ),
            ],
      summary: { checkpoint: { gatewayStatus: asString(result.status), requestId: asString(result.requestId) } },
      episodeId: input.episodeId,
    });
    const receipt: AnalysisCheckpointReceipt = {
      ...receiptBase,
      action: 'request_checkpoint',
      checkpointStatus: decision,
      ...(asString(result.requestId) ? { requestId: asString(result.requestId) } : {}),
    };
    setStageState(
      state,
      input.stage,
      { status: nextStatus, checkpointReceiptId: receipt.receiptId, checkpointStatus: decision },
      input.episodeId
    );
    state.projectStatus = projectStatus;
    if (input.stage === 'episode' && decision === 'accepted') state.activeEpisodeId = undefined;
    writeAnalysisState(projectRoot, state);
    return { schema: 'openbioscience.bio_mcp.result.v2', action, status: receipt.status, receipt };
  }

  if (action === 'preflight_scripts') {
    const input = preflightPayloadSchema.parse(payload);
    const state = readAnalysisState(projectRoot, input.analysisId);
    const current = stageState(state, input.stage, input.episodeId);
    if (current.receiptId !== input.contractReceiptId)
      throw new Error('contractReceiptId is not the current stage receipt.');
    const contractReceipt = verifyReceiptId(projectRoot, input.contractReceiptId, input.analysisId);
    const scriptsRoot = `${stageOutputRelativePath(input.analysisId, input.stage, input.episodeId)}/scripts/`;
    if (input.scriptPaths.some((candidate) => !candidate.replaceAll('\\', '/').startsWith(scriptsRoot))) {
      throw new Error(`Analysis scripts must be under ${scriptsRoot}.`);
    }
    const scriptFiles = input.scriptPaths.map((candidate) =>
      requireStageFile(projectRoot, input.analysisId, input.stage, candidate, input.episodeId)
    );
    const checks = input.scriptPaths.map((scriptPath) =>
      preflightAnalysisScript({
        projectRoot,
        analysisId: input.analysisId,
        stage: input.stage,
        episodeId: input.episodeId,
        contractReceiptId: input.contractReceiptId,
        scriptPath,
      })
    );
    const violations = checks.flatMap((check) => check.violations.map((violation) => `${check.path}: ${violation}`));
    const receipt = makeReceipt({
      projectRoot,
      analysisId: state.analysisId,
      modality: state.modality,
      action,
      status: violations.length ? 'needs_revision' : 'ready',
      stage: input.stage,
      stageStatus: violations.length ? 'needs_revision' : 'running',
      projectStatus: violations.length ? 'needs_revision' : 'running',
      dependencyReceiptIds: [input.contractReceiptId],
      canonicalFiles: scriptFiles,
      skillUses: bindSkills(projectRoot, input.stage),
      nextActions: violations.length
        ? [
            nextAction(
              state.analysisId,
              input.stage,
              'preflight_scripts',
              'Correct the analysis script contract violations.',
              input.episodeId
            ),
          ]
        : [],
      summary: { scripts: checks, reusedUnchangedHashes: [] },
      episodeId: input.episodeId,
    });
    return {
      schema: 'openbioscience.bio_mcp.result.v2',
      action,
      status: violations.length ? 'needs_revision' : 'ready',
      analysisId: state.analysisId,
      contractReceiptId: input.contractReceiptId,
      scripts: scriptFiles,
      checks,
      violations,
      receipt,
      workflowKind: contractReceipt.workflowKind,
      requiredHeader: [
        'Workflow-Kind',
        'Analysis-ID',
        'Stage-or-Episode-ID',
        'Contract-Receipt-ID',
        'EnvironmentRef',
        'Inputs',
        'Outputs',
        'Run-Command',
        'Assumptions',
        'Annotation-Mode',
        'External-Egress-Policy',
      ],
    };
  }

  if (action === 'prepare_closure') {
    const input = closurePayloadSchema.parse(payload);
    const state = readAnalysisState(projectRoot, input.analysisId);
    const baselineReceiptId = assertPredecessorAccepted(state, 'closing');
    if (state.activeEpisodeId)
      throw new Error(`Episode ${state.activeEpisodeId} must be reviewed before closing the project.`);
    const unresolved = Object.values(state.episodes).filter((episode) => episode.status !== 'accepted');
    if (unresolved.length)
      throw new Error(
        'All completed episodes must have an accepted or explicitly abandoned review state before closure.'
      );
    const planned = stagePlan(
      projectRoot,
      state,
      'closing',
      {
        ...input.coverage,
        baselineReceiptId,
        episodeReceiptIds: Object.values(state.episodes).map((episode) => episode.receiptId),
      },
      uniqueStrings([baselineReceiptId, ...Object.values(state.episodes).map((episode) => episode.receiptId || '')])
    );
    return { schema: 'openbioscience.bio_mcp.result.v2', action, status: 'ready', receipt: planned.receipt };
  }

  if (action === 'close_analysis') {
    const input = closePayloadSchema.parse(payload);
    const state = readAnalysisState(projectRoot, input.analysisId);
    if (state.stages.closing.status !== 'running' || state.stages.closing.receiptId !== input.closureReceiptId) {
      throw new Error('close_analysis requires the current prepare_closure receipt.');
    }
    const reportsRoot = `${stageOutputRelativePath(input.analysisId, 'closing')}/`;
    if (input.canonicalFilePaths.some((candidate) => !candidate.replaceAll('\\', '/').startsWith(reportsRoot))) {
      throw new Error(`Closing files must be under ${reportsRoot}.`);
    }
    const canonicalFiles = input.canonicalFilePaths.map((candidate) => fingerprintFile(projectRoot, candidate));
    const missingArtifacts = assertStageArtifactCoverage(canonicalFiles, 'closing');
    if (missingArtifacts.length)
      throw new Error(`Closing report is missing required coverage: ${missingArtifacts.join(', ')}.`);
    const receipt = makeReceipt({
      projectRoot,
      analysisId: state.analysisId,
      modality: state.modality,
      action,
      status: 'ready',
      stage: 'closing',
      stageStatus: 'accepted',
      projectStatus: 'closed',
      dependencyReceiptIds: [input.closureReceiptId],
      canonicalFiles,
      skillUses: bindSkills(projectRoot, 'closing'),
      summary: {
        ...input.summary,
        requiredCoverage: [
          'data_design',
          'qc',
          'baseline',
          'accepted_episodes',
          'limitations',
          'reproducibility',
          'failed_or_abandoned_audit',
        ],
      },
    });
    setStageState(state, 'closing', { status: 'accepted', receiptId: receipt.receiptId });
    state.projectStatus = 'closed';
    writeAnalysisState(projectRoot, state);
    return { schema: 'openbioscience.bio_mcp.result.v2', action, status: 'ready', receipt };
  }

  throw new Error(`Unsupported analysis action "${action}".`);
};
