/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type {
  BioBlocker,
  BioNextAction,
  BioStatisticsCompletionReceipt,
  ExecutionContractReceipt,
  ExecutionContractReceiptV2,
  ExecutionModuleResult,
  ExecutionModuleResultV2,
  ExecutionRunReceipt,
  MethodAlignmentReceipt,
  PaperReproductionMap,
  PaperReproductionMapReceipt,
  ReproductionCompletionReceipt,
  ReproductionExecutionReceipt,
  ReproductionExecutionReceiptV2,
  ReproductionScopeReceipt,
  ScienceSkillUse,
  ScienceCoverageItem,
  ScriptValidationReceipt,
  ScrnaAnnotationMode,
  ScrnaExecutionContract,
  ScrnaExecutionContractModule,
  ScrnaExecutionContractModuleV2,
  ScrnaExecutionContractV2,
  ScrnaExecutionModuleId,
} from '@/common/chat/science';
import { validateReceiptChain, validateReceiptFileReference, validateStrictReceipt } from '../receipts';

const BIO_RECEIPT_SCHEMA = 'openbioscience.bio.receipt.v1' as const;
const EXECUTION_CONTRACT_SCHEMA = 'openbioscience.scrna_reproduction.execution_contract.v1' as const;
const EXECUTION_CONTRACT_V2_SCHEMA = 'openbioscience.scrna_reproduction.execution_contract.v2' as const;

const moduleIds = [
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
] as const;

const annotationModes = ['independent_annotation', 'reference_review', 'label_transfer'] as const;
const moduleStatuses = [
  'validated',
  'generated_unvalidated',
  'scientifically_limited',
  'externally_blocked',
  'incomplete',
  'not_requested',
] as const;

const receiptSchema = z
  .object({
    schema: z.literal(BIO_RECEIPT_SCHEMA),
    receiptId: z.string().min(1),
    producer: z.enum(['bio_source', 'bio_runtime', 'bio_reproduction', 'bio_statistics']),
    action: z.string().min(1),
    status: z.string().min(1),
    projectRoot: z.string().min(1),
    createdAt: z.number(),
  })
  .passthrough();

const canonicalFileSchema = z.object({
  path: z.string().min(1),
  contentHash: z.string().min(1),
});

const skillUseSchema = z
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

const planningReceiptSchema = receiptSchema.extend({
  producer: z.literal('bio_reproduction'),
  action: z.literal('validate_reproduction_plan'),
  methodParameterReceiptId: z.string().min(1),
  skillUses: z.array(skillUseSchema),
});

const executionContractReceiptSchema = receiptSchema.extend({
  producer: z.literal('bio_reproduction'),
  action: z.literal('prepare_execution_contract'),
  workflowKind: z.literal('omics_reproduction'),
  workflowPhase: z.literal('execution'),
  modality: z.literal('scrna_seq'),
  planningReceiptId: z.string().min(1),
  canonicalFile: canonicalFileSchema,
  annotationMode: z.enum(annotationModes),
  requiredModules: z.array(z.enum(moduleIds)),
  nextActions: z.array(z.record(z.unknown())),
});

const methodAlignmentReceiptSchema = receiptSchema.extend({
  producer: z.literal('bio_reproduction'),
  action: z.literal('validate_method_alignment'),
  methodParameterReceiptId: z.string().min(1),
  executedParameterFile: canonicalFileSchema,
  scriptFiles: z.array(canonicalFileSchema),
});

const statisticalCompletionReceiptSchema = receiptSchema.extend({
  producer: z.literal('bio_statistics'),
  action: z.literal('validate_de_outputs'),
  workflowKind: z.literal('omics_reproduction'),
  workflowPhase: z.literal('execution'),
  planningReceiptId: z.string().min(1),
  contrasts: z.array(
    z
      .object({
        id: z.string().min(1),
        status: z.enum(['tested', 'blocked_insufficient_replicates', 'blocked_invalid_design', 'failed']),
      })
      .passthrough()
  ),
  canonicalFiles: z.array(canonicalFileSchema),
  skillUses: z.array(skillUseSchema),
});

const executionContractModuleSchema = z.object({
  id: z.enum(moduleIds),
  required: z.boolean(),
  expectedOutputs: z.array(z.string().min(1)).min(1),
});

export const executionContractSchema = z.object({
  schema: z.literal(EXECUTION_CONTRACT_SCHEMA),
  createdAt: z.string().datetime(),
  objective: z.string().min(1),
  datasetIds: z.array(z.string().min(1)).min(1),
  modality: z.literal('scrna_seq'),
  annotationMode: z.enum(annotationModes),
  modules: z.array(executionContractModuleSchema).min(1),
});

export const prepareExecutionPayloadSchema = z
  .object({
    objective: z.string().min(1),
    datasetIds: z.array(z.string().min(1)).min(1),
    requestedModules: z.array(z.enum(moduleIds)).optional(),
    annotationMode: z.enum(annotationModes).optional(),
    executionContractPath: z.string().min(1).optional(),
    planningReceipt: planningReceiptSchema,
  })
  .strict();

const moduleResultInputSchema = z.object({
  id: z.enum(moduleIds),
  status: z.enum(moduleStatuses),
  outputPaths: z.array(z.string().min(1)).default([]),
  validationReceiptIds: z.array(z.string().min(1)).default([]),
  qcOutcome: z.enum(['filtered', 'passed_no_removal', 'failed']).optional(),
  annotationMode: z.enum(annotationModes).optional(),
  limitations: z.array(z.string().min(1)).default([]),
});

const blockerSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['credentials', 'permissions', 'data', 'environment', 'contract']),
  message: z.string().min(1),
  moduleId: z.string().optional(),
  external: z.boolean(),
});

export const completeExecutionPayloadSchema = z
  .object({
    executionContractReceipt: executionContractReceiptSchema,
    planningReceipt: planningReceiptSchema,
    methodAlignmentReceipt: methodAlignmentReceiptSchema,
    statisticalCompletionReceipt: statisticalCompletionReceiptSchema.optional(),
    moduleResults: z.array(moduleResultInputSchema),
    skillUses: z.array(skillUseSchema).optional(),
    externalBlockers: z.array(blockerSchema).optional(),
  })
  .strict();

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const strictCanonicalFileSchema = z.object({ path: z.string().min(1), contentHash: sha256Schema }).strict();
const paperScopeStatuses = [
  'required',
  'ready',
  'conditional',
  'external_data_block',
  'capability_block',
  'analogous_only',
  'excluded_by_user',
  'unresolved',
] as const;
const reproductionModes = ['exact', 'analogous', 'scoped_reimplementation'] as const;

const targetBaseSchema = z.object({ id: z.string().min(1), evidenceIds: z.array(z.string().min(1)) });
const scopeDecisionSchema = z
  .object({
    id: z.string().min(1),
    targetIds: z.array(z.string().min(1)).min(1),
    reproductionMode: z.enum(reproductionModes),
    status: z.enum(paperScopeStatuses),
    reason: z.string().min(1),
    userDecisionId: z.string().min(1).optional(),
  })
  .strict();

export const paperReproductionMapSchema = z
  .object({
    schema: z.literal('openbioscience.paper_reproduction_map.v1'),
    createdAt: z.string().datetime(),
    sources: z.array(
      z
        .object({
          id: z.string().min(1),
          kind: z.string().min(1),
          path: z.string().min(1).optional(),
          url: z.string().min(1).optional(),
          contentHash: sha256Schema,
        })
        .strict()
    ),
    evidence: z.array(
      z
        .object({
          id: z.string().min(1),
          sourceId: z.string().min(1),
          sourceHash: sha256Schema,
          path: z.string().min(1).optional(),
          url: z.string().min(1).optional(),
          page: z.number().int().positive().optional(),
          lineStart: z.number().int().positive().optional(),
          lineEnd: z.number().int().positive().optional(),
          section: z.string().min(1).optional(),
          excerptHash: sha256Schema,
          basis: z.enum(['explicit', 'cross_source_inference', 'agent_inference', 'unresolved']),
        })
        .strict()
    ),
    figures: z.array(
      targetBaseSchema
        .extend({
          label: z.string().min(1),
          title: z.string().min(1),
          panelIds: z.array(z.string().min(1)),
        })
        .strict()
    ),
    panels: z.array(
      targetBaseSchema
        .extend({
          figureId: z.string().min(1),
          label: z.string().min(1),
          claimIds: z.array(z.string().min(1)),
          cohortIds: z.array(z.string().min(1)),
          methodUnitIds: z.array(z.string().min(1)),
          dependencyIds: z.array(z.string().min(1)),
          expectedOutputIds: z.array(z.string().min(1)),
        })
        .strict()
    ),
    claims: z.array(
      targetBaseSchema
        .extend({
          text: z.string().min(1),
          claimKind: z.enum(['descriptive', 'associational', 'inferential', 'methodological']),
        })
        .strict()
    ),
    cohorts: z.array(
      z
        .object({
          id: z.string().min(1),
          label: z.string().min(1),
          datasetIds: z.array(z.string().min(1)),
          evidenceIds: z.array(z.string().min(1)),
        })
        .strict()
    ),
    methodUnits: z.array(
      targetBaseSchema
        .extend({
          analysisFamily: z.string().min(1),
          lineage: z.string().min(1).optional(),
          reportedMethod: z.string().min(1),
          parameterIds: z.array(z.string().min(1)),
        })
        .strict()
    ),
    dataDependencies: z.array(
      targetBaseSchema
        .extend({
          label: z.string().min(1),
          cohortIds: z.array(z.string().min(1)),
          modality: z.string().min(1),
          requiredFields: z.array(z.string().min(1)),
          localSupport: z.enum(['available', 'partial', 'missing', 'unresolved']),
        })
        .strict()
    ),
    expectedOutputs: z.array(
      targetBaseSchema
        .extend({
          label: z.string().min(1),
          artifactKind: z.enum(['object', 'table', 'figure', 'report', 'statistical_result']),
        })
        .strict()
    ),
    scopeDecisions: z.array(scopeDecisionSchema),
    conflicts: z.array(
      z
        .object({
          id: z.string().min(1),
          targetIds: z.array(z.string().min(1)),
          evidenceIds: z.array(z.string().min(1)),
          message: z.string().min(1),
          material: z.boolean(),
        })
        .strict()
    ),
    unresolvedItems: z.array(
      z
        .object({
          id: z.string().min(1),
          targetIds: z.array(z.string().min(1)),
          message: z.string().min(1),
          nextAction: z.string().min(1).optional(),
        })
        .strict()
    ),
  })
  .strict();

const paperMapReceiptSchema = receiptSchema.extend({
  producer: z.literal('bio_reproduction'),
  action: z.literal('validate_paper_reproduction_map'),
  canonicalFile: strictCanonicalFileSchema,
  sourceReceiptIds: z.array(z.string().min(1)),
  targetIds: z.array(z.string().min(1)),
  unresolvedTargetIds: z.array(z.string().min(1)),
  nextActions: z.array(z.record(z.unknown())),
});

const scopeReceiptSchema = receiptSchema.extend({
  producer: z.literal('bio_reproduction'),
  action: z.literal('validate_reproduction_scope'),
  paperMapReceiptId: z.string().min(1),
  canonicalFile: strictCanonicalFileSchema,
  requiredTargetIds: z.array(z.string().min(1)),
  excludedTargetIds: z.array(z.string().min(1)),
  blockedTargetIds: z.array(z.string().min(1)),
  nextActions: z.array(z.record(z.unknown())),
});

const annotationPolicySchema = z
  .object({
    majorMode: z.enum(annotationModes).optional(),
    minorMode: z.enum(annotationModes).optional(),
    relationship: z.enum(['independent', 'minor_requires_major']).default('independent'),
    minorDependsOnMajor: z.boolean().optional(),
  })
  .strict();

const executionContractModuleV2Schema = z
  .object({
    id: z.string().min(1),
    parentId: z.string().min(1).optional(),
    required: z.boolean(),
    panelIds: z.array(z.string().min(1)),
    claimIds: z.array(z.string().min(1)),
    cohortIds: z.array(z.string().min(1)),
    lineage: z.string().min(1).optional(),
    analysisFamilies: z.array(z.string().min(1)).min(1),
    dependencyModuleIds: z.array(z.string().min(1)),
    scopeDecisionId: z.string().min(1),
    annotationMode: z.enum(annotationModes).optional(),
    requiredInputs: z.array(z.string().min(1)),
    expectedOutputs: z.array(z.string().min(1)),
    validationRequirements: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const executionContractV2Schema = z
  .object({
    schema: z.literal(EXECUTION_CONTRACT_V2_SCHEMA),
    createdAt: z.string().datetime(),
    objective: z.string().min(1),
    datasetIds: z.array(z.string().min(1)).min(1),
    modality: z.literal('scrna_seq'),
    paperMapReceiptId: z.string().min(1),
    scopeReceiptId: z.string().min(1),
    modules: z.array(executionContractModuleV2Schema).min(1),
  })
  .strict();

export const prepareExecutionV2PayloadSchema = z
  .object({
    contractVersion: z.literal(2).optional(),
    objective: z.string().min(1),
    datasetIds: z.array(z.string().min(1)).min(1),
    executionContractPath: z.string().min(1).optional(),
    annotationMode: z.enum(annotationModes).optional(),
    annotationPolicy: annotationPolicySchema.optional(),
    planningReceipt: planningReceiptSchema,
    paperMapReceipt: paperMapReceiptSchema,
    scopeReceipt: scopeReceiptSchema,
  })
  .strict();

const executionContractReceiptV2Schema = receiptSchema.extend({
  producer: z.literal('bio_reproduction'),
  action: z.literal('prepare_execution_contract'),
  workflowKind: z.literal('omics_reproduction'),
  workflowPhase: z.literal('execution'),
  modality: z.literal('scrna_seq'),
  contractVersion: z.literal(2),
  planningReceiptId: z.string().min(1),
  paperMapReceiptId: z.string().min(1),
  scopeReceiptId: z.string().min(1),
  canonicalFile: strictCanonicalFileSchema,
  requiredModules: z.array(z.string().min(1)),
  nextActions: z.array(z.record(z.unknown())),
});

const scriptValidationReceiptSchema = receiptSchema.extend({
  producer: z.literal('bio_reproduction'),
  action: z.literal('preflight_execution_scripts'),
  executionContractReceiptId: z.string().min(1),
  methodParameterReceiptId: z.string().min(1),
  scripts: z.array(
    z
      .object({ path: z.string().min(1), contentHash: sha256Schema, moduleIds: z.array(z.string().min(1)).min(1) })
      .strict()
  ),
  skillComplianceReceiptIds: z.array(z.string().min(1)),
  statisticalDesignReceiptIds: z.array(z.string().min(1)),
  violations: z.array(z.string()),
  nextActions: z.array(z.record(z.unknown())),
});

const executionRunReceiptSchema = receiptSchema.extend({
  producer: z.literal('bio_runtime'),
  action: z.literal('record_execution'),
  scriptValidationReceiptId: z.string().min(1),
  startedAt: z.number().int().positive(),
  finishedAt: z.number().int().positive(),
  scriptFiles: z.array(strictCanonicalFileSchema),
  configFiles: z.array(strictCanonicalFileSchema),
  logFiles: z.array(strictCanonicalFileSchema),
  outputFiles: z.array(strictCanonicalFileSchema),
  exitCode: z.number().int(),
});

const moduleResultV2InputSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(moduleStatuses),
    targetIds: z.array(z.string().min(1)).default([]),
    outputPaths: z.array(z.string().min(1)).default([]),
    validationReceiptIds: z.array(z.string().min(1)).default([]),
    limitations: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const completeExecutionV2PayloadSchema = z
  .object({
    executionContractReceipt: executionContractReceiptV2Schema,
    planningReceipt: planningReceiptSchema,
    paperMapReceipt: paperMapReceiptSchema,
    scopeReceipt: scopeReceiptSchema,
    methodAlignmentReceipt: methodAlignmentReceiptSchema,
    scriptValidationReceipt: scriptValidationReceiptSchema,
    executionRunReceipts: z.array(executionRunReceiptSchema).min(1),
    statisticalCompletionReceipt: statisticalCompletionReceiptSchema.optional(),
    statisticalCompletionReceipts: z.array(statisticalCompletionReceiptSchema).optional(),
    moduleResults: z.array(moduleResultV2InputSchema),
    skillUses: z.array(skillUseSchema).optional(),
    externalBlockers: z.array(blockerSchema).optional(),
  })
  .strict();

export const prepareExecutionPayloadV2Schema = prepareExecutionV2PayloadSchema;
export const completeExecutionPayloadV2Schema = completeExecutionV2PayloadSchema;

const expectedOutputs: Record<ScrnaExecutionModuleId, string[]> = {
  data_import: ['reusable single-cell object', 'import summary'],
  quality_control: ['QC metrics', 'QC outcome summary'],
  normalization: ['normalized expression layer', 'normalization parameters'],
  clustering: ['cluster assignments', 'embedding coordinates'],
  major_annotation: ['cluster_annotation.tsv with major labels and evidence'],
  minor_annotation: ['cluster_annotation.tsv with minor labels and evidence'],
  cluster_markers: ['log-normalized cluster marker table'],
  composition: ['patient/sample composition table'],
  condition_de: ['contrast status table', 'validated edgeR result tables'],
  descriptive_statistics: ['dataset and group descriptive summaries'],
  figures: ['requested QC, embedding, annotation, composition, and DE figures'],
  disease_program: ['disease-program score table and figure'],
};

const prerequisites: Partial<Record<ScrnaExecutionModuleId, ScrnaExecutionModuleId[]>> = {
  quality_control: ['data_import'],
  normalization: ['quality_control'],
  clustering: ['normalization'],
  cluster_markers: ['clustering'],
  major_annotation: ['cluster_markers'],
  minor_annotation: ['major_annotation'],
  composition: ['major_annotation'],
  condition_de: ['major_annotation'],
  descriptive_statistics: ['data_import'],
  figures: ['data_import'],
  disease_program: ['normalization', 'major_annotation'],
};

const hashContent = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');
const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, stableValue((value as Record<string, unknown>)[key])])
  );
};

const receiptId = (action: string, projectRoot: string, details: unknown): string =>
  `bio_receipt_${hashContent(JSON.stringify(stableValue({ action, projectRoot, details }))).slice(0, 20)}`;

const semanticContract = (contract: ScrnaExecutionContract): unknown => {
  const { createdAt: _createdAt, ...semantic } = contract;
  return stableValue(semantic);
};

const nearestExistingPath = (candidate: string): string => {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
};

const resolveProjectPath = (
  projectRoot: string,
  candidate: string,
  requireFile: boolean
): { path?: string; reason?: string } => {
  if (!candidate.trim()) return { reason: 'Path is required.' };
  if (path.isAbsolute(candidate)) return { reason: 'Path must be project-relative.' };
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { reason: 'Path escapes the project root.' };
  try {
    const realRoot = fs.realpathSync(root);
    const realExisting = fs.realpathSync(nearestExistingPath(resolved));
    const realRelative = path.relative(realRoot, realExisting);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      return { reason: 'Path resolves through a symlink outside the project root.' };
    }
  } catch {
    return { reason: 'Path safety could not be verified.' };
  }
  if (requireFile && (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())) {
    return { reason: 'File does not exist.' };
  }
  return { path: resolved };
};

const requestedModulesFromObjective = (objective: string): Set<ScrnaExecutionModuleId> => {
  const normalized = objective.toLowerCase();
  const requested = new Set<ScrnaExecutionModuleId>();
  const add = (pattern: RegExp, ...ids: ScrnaExecutionModuleId[]) => {
    if (pattern.test(normalized)) ids.forEach((id) => requested.add(id));
  };
  add(/导入|import/u, 'data_import');
  add(/质控|quality control|\bqc\b/u, 'quality_control');
  add(/归一化|normaliz/u, 'normalization');
  add(/聚类|分群|cluster/u, 'clustering');
  add(/细胞类型|大类|major (?:cell )?type|cell type/u, 'major_annotation', 'cluster_markers');
  add(/亚群|小类|subtype|minor (?:cell )?type/u, 'minor_annotation', 'major_annotation', 'cluster_markers');
  add(/组成|比例|composition/u, 'composition');
  add(/差异基因|差异表达|differential|\bde\b/u, 'condition_de');
  add(/统计描述|描述统计|descriptive stat/u, 'descriptive_statistics');
  add(/结果图|必要.*图|figure|plot/u, 'figures');
  add(/program|signature|score|基因程序|疾病程序/u, 'disease_program');
  return requested;
};

const addPrerequisites = (requested: Set<ScrnaExecutionModuleId>): void => {
  let changed = true;
  while (changed) {
    changed = false;
    for (const moduleId of [...requested]) {
      for (const prerequisite of prerequisites[moduleId] || []) {
        if (!requested.has(prerequisite)) {
          requested.add(prerequisite);
          changed = true;
        }
      }
    }
  }
};

const buildContract = (input: z.infer<typeof prepareExecutionPayloadSchema>): ScrnaExecutionContract => {
  const requested = input.requestedModules?.length
    ? new Set<ScrnaExecutionModuleId>(input.requestedModules)
    : requestedModulesFromObjective(input.objective);
  if (!requested.size) requested.add('data_import');
  addPrerequisites(requested);
  const modules: ScrnaExecutionContractModule[] = moduleIds.map((id) => ({
    id,
    required: requested.has(id),
    expectedOutputs: expectedOutputs[id],
  }));
  return {
    schema: EXECUTION_CONTRACT_SCHEMA,
    createdAt: new Date().toISOString(),
    objective: input.objective,
    datasetIds: [...new Set(input.datasetIds)].sort(),
    modality: 'scrna_seq',
    annotationMode: input.annotationMode || 'independent_annotation',
    modules,
  };
};

const prepareExecutionContractV1 = (projectRoot: string, payload: unknown) => {
  const parsed = prepareExecutionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: 'needs_completion',
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`),
      nextActions: [
        {
          id: 'repair-execution-contract-call',
          tool: 'bio_reproduction',
          action: 'prepare_execution_contract',
          reason: 'Use the declared execution-contract fields.',
          payload: {
            objective: 'Describe the requested scRNA-seq execution.',
            datasetIds: ['GSE_ACCESSION'],
            requestedModules: ['data_import'],
            annotationMode: 'independent_annotation',
            executionContractPath: 'case_reproduction/execution/execution_contract.json',
            planningReceipt: {
              schema: BIO_RECEIPT_SCHEMA,
              receiptId: 'CURRENT_PLANNING_RECEIPT_ID',
              producer: 'bio_reproduction',
              action: 'validate_reproduction_plan',
              status: 'ready',
              projectRoot: 'CURRENT_PROJECT_ROOT',
              createdAt: 0,
              methodParameterReceiptId: 'CURRENT_METHOD_PARAMETER_RECEIPT_ID',
              skillUses: [] as Array<Record<string, unknown>>,
            },
          },
        } satisfies BioNextAction,
      ],
    };
  }

  const input = parsed.data;
  const planningReceipt = input.planningReceipt as unknown as ReproductionCompletionReceipt;
  const contract = buildContract(input);
  const requestedPath = input.executionContractPath || 'case_reproduction/execution/execution_contract.json';
  const resolved = resolveProjectPath(projectRoot, requestedPath, false);
  const current = resolved.path && fs.existsSync(resolved.path) ? fs.readFileSync(resolved.path, 'utf8') : '';
  let currentContract: ScrnaExecutionContract | undefined;
  try {
    const validation = executionContractSchema.safeParse(current ? JSON.parse(current) : undefined);
    if (validation.success) currentContract = validation.data as ScrnaExecutionContract;
  } catch {
    currentContract = undefined;
  }
  const currentMatches =
    currentContract && JSON.stringify(semanticContract(currentContract)) === JSON.stringify(semanticContract(contract));
  const nextActions: BioNextAction[] = [];
  if (!resolved.path || !currentMatches) {
    const repairPayload = {
      objective: input.objective,
      datasetIds: input.datasetIds,
      requestedModules: input.requestedModules,
      annotationMode: input.annotationMode,
      executionContractPath: requestedPath,
      planningReceipt: input.planningReceipt,
    };
    nextActions.push({
      id: 'write-execution-contract',
      tool: 'runtime',
      action: 'write_file',
      reason: resolved.reason || 'Write the canonical scRNA-seq execution contract.',
      payload: {
        path: requestedPath,
        canonicalContent: contract,
        onSuccess: {
          tool: 'bio_reproduction',
          action: 'prepare_execution_contract',
          payload: repairPayload,
        },
      },
    });
  }

  const status = planningReceipt.status === 'ready' && !nextActions.length ? 'ready' : 'needs_completion';
  const details = {
    planningReceiptId: planningReceipt.receiptId,
    canonicalFile: {
      path: requestedPath,
      contentHash: currentMatches ? hashContent(current) : '',
    },
    annotationMode: contract.annotationMode,
    requiredModules: contract.modules.filter((module) => module.required).map((module) => module.id),
  };
  const receipt: ExecutionContractReceipt | undefined =
    status === 'ready'
      ? {
          schema: BIO_RECEIPT_SCHEMA,
          receiptId: receiptId('prepare_execution_contract', projectRoot, details),
          producer: 'bio_reproduction',
          action: 'prepare_execution_contract',
          status: 'ready',
          projectRoot,
          createdAt: Date.now(),
          workflowKind: 'omics_reproduction',
          workflowPhase: 'execution',
          modality: 'scrna_seq',
          planningReceiptId: planningReceipt.receiptId,
          canonicalFile: details.canonicalFile,
          annotationMode: contract.annotationMode,
          requiredModules: details.requiredModules,
          nextActions: [],
          details,
        }
      : undefined;

  return {
    status,
    canonicalPath: requestedPath,
    canonicalContent: currentMatches ? currentContract : contract,
    requiredModules: details.requiredModules,
    annotationMode: contract.annotationMode,
    nextActions,
    executionContractReceipt: receipt,
  };
};

const validateFileReference = (
  projectRoot: string,
  file: { path: string; contentHash?: string }
): { file?: { path: string; contentHash: string }; issue?: string } => {
  const resolved = resolveProjectPath(projectRoot, file.path, true);
  if (!resolved.path) return { issue: `${file.path}: ${resolved.reason}` };
  const contentHash = hashContent(fs.readFileSync(resolved.path));
  if (file.contentHash && file.contentHash !== contentHash) return { issue: `${file.path}: content hash is stale.` };
  return { file: { path: file.path, contentHash } };
};

const uniqueFiles = (files: Array<{ path: string; contentHash: string }>) =>
  [...new Map(files.map((file) => [file.path, file])).values()].sort((left, right) =>
    left.path.localeCompare(right.path)
  );

const fileSnapshots = (
  projectRoot: string,
  files: Array<{ path: string; contentHash: string }>
): Array<{ path: string; contentHash: string; sizeBytes?: number; mtimeMs?: number }> =>
  uniqueFiles(files).map((file) => {
    const absolutePath = path.resolve(projectRoot, file.path);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return file;
    const stat = fs.statSync(absolutePath);
    return { ...file, sizeBytes: stat.size, mtimeMs: stat.mtimeMs };
  });

const uniqueSkillUses = (skillUses: Array<Omit<ScienceSkillUse, 'runId' | 'revision'>>) => [
  ...new Map(skillUses.map((skillUse) => [skillUse.skillId, skillUse])).values(),
];

const completeExecutionV1 = (projectRoot: string, payload: unknown) => {
  const parsed = completeExecutionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: 'needs_completion',
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`),
      nextActions: [
        {
          id: 'repair-complete-execution-call',
          tool: 'bio_reproduction',
          action: 'complete_execution',
          reason: 'Use the declared execution completion fields and receipt objects.',
          payload: {
            executionContractReceipt: {
              schema: BIO_RECEIPT_SCHEMA,
              receiptId: 'CURRENT_EXECUTION_CONTRACT_RECEIPT_ID',
              producer: 'bio_reproduction',
              action: 'prepare_execution_contract',
              status: 'ready',
              projectRoot: 'CURRENT_PROJECT_ROOT',
              createdAt: 0,
              workflowKind: 'omics_reproduction',
              workflowPhase: 'execution',
              modality: 'scrna_seq',
              planningReceiptId: 'CURRENT_PLANNING_RECEIPT_ID',
              canonicalFile: {
                path: 'case_reproduction/execution/execution_contract.json',
                contentHash: 'CURRENT_CONTENT_HASH',
              },
              annotationMode: 'independent_annotation',
              requiredModules: ['data_import'],
              nextActions: [] as BioNextAction[],
            },
            planningReceipt: {
              schema: BIO_RECEIPT_SCHEMA,
              receiptId: 'CURRENT_PLANNING_RECEIPT_ID',
              producer: 'bio_reproduction',
              action: 'validate_reproduction_plan',
              status: 'ready',
              projectRoot: 'CURRENT_PROJECT_ROOT',
              createdAt: 0,
              methodParameterReceiptId: 'CURRENT_METHOD_PARAMETER_RECEIPT_ID',
              skillUses: [] as Array<Record<string, unknown>>,
            },
            methodAlignmentReceipt: {
              schema: BIO_RECEIPT_SCHEMA,
              receiptId: 'CURRENT_METHOD_ALIGNMENT_RECEIPT_ID',
              producer: 'bio_reproduction',
              action: 'validate_method_alignment',
              status: 'ready',
              projectRoot: 'CURRENT_PROJECT_ROOT',
              createdAt: 0,
              methodParameterReceiptId: 'CURRENT_METHOD_PARAMETER_RECEIPT_ID',
              executedParameterFile: { path: 'execution/configs/executed_parameters.json', contentHash: 'HASH' },
              scriptFiles: [] as Array<{ path: string; contentHash: string }>,
            },
            moduleResults: [
              {
                id: 'data_import',
                status: 'validated',
                outputPaths: ['execution/results/objects/imported.h5ad'],
                validationReceiptIds: [] as string[],
                limitations: [] as string[],
              },
            ],
          },
        } satisfies BioNextAction,
      ],
    };
  }

  const input = parsed.data;
  const contractReceipt = input.executionContractReceipt as unknown as ExecutionContractReceipt;
  const planningReceipt = input.planningReceipt as unknown as ReproductionCompletionReceipt;
  const methodReceipt = input.methodAlignmentReceipt as unknown as MethodAlignmentReceipt;
  const statisticalReceipt = input.statisticalCompletionReceipt as unknown as
    | BioStatisticsCompletionReceipt
    | undefined;
  const issues: string[] = [];
  if (
    contractReceipt.producer !== 'bio_reproduction' ||
    contractReceipt.action !== 'prepare_execution_contract' ||
    contractReceipt.status !== 'ready'
  ) {
    issues.push('executionContractReceipt is not a ready bio_reproduction receipt.');
  }
  if (path.resolve(contractReceipt.projectRoot) !== path.resolve(projectRoot)) {
    issues.push('executionContractReceipt belongs to another project.');
  }
  if (planningReceipt.receiptId !== contractReceipt.planningReceiptId || planningReceipt.status !== 'ready') {
    issues.push('planningReceipt does not match the execution contract.');
  }
  if (
    methodReceipt.producer !== 'bio_reproduction' ||
    methodReceipt.action !== 'validate_method_alignment' ||
    methodReceipt.status !== 'ready' ||
    methodReceipt.methodParameterReceiptId !== planningReceipt.methodParameterReceiptId
  ) {
    issues.push('methodAlignmentReceipt does not match the current planning receipt.');
  }

  const contractFile = validateFileReference(projectRoot, contractReceipt.canonicalFile);
  if (contractFile.issue) issues.push(contractFile.issue);
  let contract: ScrnaExecutionContract | undefined;
  if (contractFile.file) {
    const resolved = resolveProjectPath(projectRoot, contractFile.file.path, true);
    try {
      const validation = executionContractSchema.safeParse(JSON.parse(fs.readFileSync(resolved.path!, 'utf8')));
      if (validation.success) contract = validation.data as ScrnaExecutionContract;
      else issues.push('The execution contract file is malformed.');
    } catch {
      issues.push('The execution contract file is not valid JSON.');
    }
  }

  const resultById = new Map(input.moduleResults.map((result) => [result.id, result]));
  const nextActions: BioNextAction[] = [];
  const externalBlockers = (input.externalBlockers || []) as BioBlocker[];
  for (const blocker of externalBlockers) {
    if (!blocker.external || blocker.kind === 'contract') {
      issues.push(`Blocker ${blocker.id} is correctable and cannot be classified as an external blocker.`);
    }
  }
  const canonicalFiles: Array<{ path: string; contentHash: string }> = contractFile.file ? [contractFile.file] : [];
  const modules: ExecutionModuleResult[] = [];
  const requiredModules = contract?.modules.filter((module) => module.required) || [];
  const conditionDeRequired = requiredModules.some((module) => module.id === 'condition_de');
  const conditionDeExternallyBlocked = externalBlockers.some(
    (blocker) => blocker.external && blocker.kind !== 'contract' && blocker.moduleId === 'condition_de'
  );
  if (conditionDeRequired && !conditionDeExternallyBlocked) {
    if (
      !statisticalReceipt ||
      statisticalReceipt.producer !== 'bio_statistics' ||
      statisticalReceipt.action !== 'validate_de_outputs' ||
      statisticalReceipt.status !== 'ready' ||
      statisticalReceipt.planningReceiptId !== planningReceipt.receiptId
    ) {
      issues.push('condition_de requires a current bio_statistics completion receipt.');
      nextActions.push({
        id: 'validate-condition-de-outputs',
        tool: 'bio_statistics',
        action: 'validate_de_outputs',
        reason: 'Validate replicate-aware edgeR outputs before completing condition_de.',
      });
    }
  }

  for (const module of contract?.modules || []) {
    const supplied = resultById.get(module.id);
    if (!module.required) {
      modules.push({
        id: module.id,
        required: false,
        status: 'not_requested',
        outputFiles: [],
        validationReceiptIds: [],
        limitations: [],
      });
      continue;
    }
    if (!supplied) {
      modules.push({
        id: module.id,
        required: true,
        status: 'incomplete',
        outputFiles: [],
        validationReceiptIds: [],
        limitations: ['No module result was supplied.'],
      });
      nextActions.push({
        id: `complete-${module.id}`,
        tool: 'runtime',
        action: 'execute_module',
        reason: `Complete the required ${module.id} module and record its declared outputs.`,
        payload: { moduleId: module.id, expectedOutputs: module.expectedOutputs },
      });
      continue;
    }

    const outputFiles: Array<{ path: string; contentHash: string }> = [];
    for (const outputPath of supplied.outputPaths) {
      const validated = validateFileReference(projectRoot, { path: outputPath });
      if (validated.file) {
        outputFiles.push(validated.file);
        canonicalFiles.push(validated.file);
      } else if (validated.issue) {
        issues.push(validated.issue);
      }
    }
    let status = supplied.status;
    const limitations = [...supplied.limitations];
    if (status === 'not_requested') {
      status = 'incomplete';
      limitations.push('A required module cannot be marked not_requested.');
    }
    if (['validated', 'scientifically_limited'].includes(status) && !outputFiles.length) {
      status = 'incomplete';
      limitations.push('Validated modules must declare at least one host-readable output file.');
    }
    if (status === 'scientifically_limited' && !limitations.length) {
      status = 'incomplete';
      limitations.push('A scientifically limited module must describe its limitation.');
    }
    if (
      status !== 'externally_blocked' &&
      module.id === 'quality_control' &&
      (!supplied.qcOutcome || supplied.qcOutcome === 'failed')
    ) {
      status = 'incomplete';
      limitations.push('quality_control requires qcOutcome=filtered or passed_no_removal.');
    }
    if (
      status !== 'externally_blocked' &&
      (module.id === 'major_annotation' || module.id === 'minor_annotation') &&
      (supplied.annotationMode !== contract.annotationMode ||
        !outputFiles.some((file) => path.basename(file.path) === 'cluster_annotation.tsv'))
    ) {
      status = 'incomplete';
      limitations.push('Annotation requires cluster_annotation.tsv and the contract annotation mode.');
    }
    if (
      module.id === 'condition_de' &&
      statisticalReceipt &&
      !supplied.validationReceiptIds.includes(statisticalReceipt.receiptId)
    ) {
      status = 'generated_unvalidated';
      limitations.push('condition_de does not reference the current bio_statistics completion receipt.');
    }
    if (
      status === 'externally_blocked' &&
      !externalBlockers.some(
        (blocker) => blocker.external && blocker.kind !== 'contract' && blocker.moduleId === module.id
      )
    ) {
      status = 'incomplete';
      limitations.push('An externally blocked module requires a matching genuine external blocker.');
    }
    if (status === 'generated_unvalidated' || status === 'incomplete') {
      nextActions.push({
        id: `validate-${module.id}`,
        tool: module.id === 'condition_de' ? 'bio_statistics' : 'bio_reproduction',
        action: module.id === 'condition_de' ? 'validate_de_outputs' : 'complete_execution',
        reason: `The required ${module.id} module is generated but not validated.`,
      });
    }
    modules.push({
      id: module.id,
      required: true,
      status,
      outputFiles,
      validationReceiptIds: supplied.validationReceiptIds,
      ...(supplied.qcOutcome ? { qcOutcome: supplied.qcOutcome } : {}),
      ...(supplied.annotationMode ? { annotationMode: supplied.annotationMode } : {}),
      limitations,
    });
  }

  for (const file of [methodReceipt.executedParameterFile, ...methodReceipt.scriptFiles]) {
    const validated = validateFileReference(projectRoot, file);
    if (validated.file) canonicalFiles.push(validated.file);
    else if (validated.issue) issues.push(validated.issue);
  }
  for (const file of statisticalReceipt?.canonicalFiles || []) {
    const validated = validateFileReference(projectRoot, file);
    if (validated.file) canonicalFiles.push(validated.file);
    else if (validated.issue) issues.push(validated.issue);
  }

  const hasExternalBlock = modules.some((module) => module.required && module.status === 'externally_blocked');
  const hasIncomplete = modules.some((module) =>
    module.required ? ['generated_unvalidated', 'incomplete'].includes(module.status) : false
  );
  const hasScientificLimit =
    modules.some((module) => module.required && module.status === 'scientifically_limited') ||
    Boolean(statisticalReceipt?.contrasts.some((contrast) => contrast.status !== 'tested'));
  const executionCompletion = !issues.length && !hasIncomplete && !hasExternalBlock ? 'complete' : 'incomplete';
  const scientificOutcome = hasExternalBlock
    ? 'externally_blocked'
    : hasScientificLimit
      ? 'validated_with_limits'
      : 'validated';
  const skillUses = uniqueSkillUses([
    ...(planningReceipt.skillUses || []),
    ...(statisticalReceipt?.skillUses || []),
    ...((input.skillUses || []) as Array<Omit<ScienceSkillUse, 'runId' | 'revision'>>),
  ]);
  const status =
    executionCompletion === 'complete'
      ? 'ready'
      : hasExternalBlock && !nextActions.length
        ? 'blocked'
        : 'needs_completion';
  const canonicalFileSnapshots = fileSnapshots(projectRoot, canonicalFiles);
  const receiptDetails = {
    executionContractReceiptId: contractReceipt.receiptId,
    planningReceiptId: planningReceipt.receiptId,
    methodAlignmentReceiptId: methodReceipt.receiptId,
    statisticalReceiptIds: statisticalReceipt ? [statisticalReceipt.receiptId] : [],
    modules,
    canonicalFiles: canonicalFileSnapshots,
    executionCompletion,
    scientificOutcome,
  };
  const completionReceipt: ReproductionExecutionReceipt = {
    schema: BIO_RECEIPT_SCHEMA,
    receiptId: receiptId('complete_execution', projectRoot, receiptDetails),
    producer: 'bio_reproduction',
    action: 'complete_execution',
    status,
    projectRoot,
    createdAt: Date.now(),
    workflowKind: 'omics_reproduction',
    workflowPhase: 'execution',
    modality: 'scrna_seq',
    executionCompletion,
    scientificOutcome,
    executionContractFile: contractFile.file || contractReceipt.canonicalFile,
    executionContractReceiptId: contractReceipt.receiptId,
    planningReceiptId: planningReceipt.receiptId,
    methodAlignmentReceiptId: methodReceipt.receiptId,
    statisticalReceiptIds: statisticalReceipt ? [statisticalReceipt.receiptId] : [],
    modules,
    canonicalFiles: canonicalFileSnapshots,
    skillUses,
    nextActions,
    externalBlockers,
    validationFingerprint: hashContent(JSON.stringify(stableValue(receiptDetails))),
    details: receiptDetails,
  };

  return {
    status,
    executionCompletion,
    scientificOutcome,
    issues,
    nextActions,
    externalBlockers,
    completionReceipt,
  };
};

type PrepareExecutionV2Input = z.infer<typeof prepareExecutionV2PayloadSchema>;

const uniqueSorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const fingerprint = (value: unknown): string => hashContent(JSON.stringify(stableValue(value)));

const boundedNextAction = (
  action: Omit<
    BioNextAction,
    'actionFingerprint' | 'preconditionHash' | 'expectedMutation' | 'maxAttempts' | 'stopWhenUnchanged'
  >,
  precondition: unknown,
  expectedMutation: string[]
): BioNextAction => {
  const preconditionHash = fingerprint(precondition);
  return {
    ...action,
    actionFingerprint: fingerprint({ ...action, preconditionHash, expectedMutation }),
    preconditionHash,
    expectedMutation: uniqueSorted(expectedMutation),
    maxAttempts: 3,
    stopWhenUnchanged: true,
  };
};

const uniqueNextActions = (actions: BioNextAction[]): BioNextAction[] => [
  ...new Map(actions.map((action) => [action.actionFingerprint || action.id, action])).values(),
];

const formatZodIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`);

const readJsonFile = (candidate: string): { value?: unknown; issue?: string } => {
  try {
    return { value: JSON.parse(fs.readFileSync(candidate, 'utf8')) };
  } catch {
    return { issue: `${candidate}: file is not valid JSON.` };
  }
};

const mapTargetCollections = (map: PaperReproductionMap) => [
  map.figures,
  map.panels,
  map.claims,
  map.cohorts,
  map.methodUnits,
  map.dataDependencies,
  map.expectedOutputs,
];

const mapTargetIds = (map: PaperReproductionMap): string[] =>
  uniqueSorted(mapTargetCollections(map).flatMap((collection) => collection.map((target) => target.id)));

const targetEvidenceIds = (map: PaperReproductionMap, targetIds: Iterable<string>): string[] => {
  const requested = new Set(targetIds);
  return uniqueSorted(
    mapTargetCollections(map).flatMap((collection) =>
      collection.filter((target) => requested.has(target.id)).flatMap((target) => target.evidenceIds)
    )
  );
};

const panelsForTargets = (map: PaperReproductionMap, targetIds: Iterable<string>) => {
  const requested = new Set(targetIds);
  const figurePanelIds = new Set(
    map.figures.filter((figure) => requested.has(figure.id)).flatMap((figure) => figure.panelIds)
  );
  return map.panels.filter(
    (panel) =>
      requested.has(panel.id) ||
      figurePanelIds.has(panel.id) ||
      panel.claimIds.some((id) => requested.has(id)) ||
      panel.cohortIds.some((id) => requested.has(id)) ||
      panel.methodUnitIds.some((id) => requested.has(id)) ||
      panel.dependencyIds.some((id) => requested.has(id)) ||
      panel.expectedOutputIds.some((id) => requested.has(id))
  );
};

const annotationKind = (
  map: PaperReproductionMap,
  panels: PaperReproductionMap['panels'],
  targetIds: Iterable<string>
): 'major' | 'minor' | undefined => {
  const requested = new Set(targetIds);
  const methodIds = new Set([...panels.flatMap((panel) => panel.methodUnitIds), ...requested]);
  const methodText = map.methodUnits
    .filter((method) => methodIds.has(method.id))
    .map((method) => `${method.id} ${method.analysisFamily} ${method.lineage || ''} ${method.reportedMethod}`)
    .join(' ')
    .toLowerCase();
  const targetText = [...requested].join(' ').toLowerCase();
  if (/minor|subtype|sub-type|亚群|小类/u.test(`${targetText} ${methodText}`)) return 'minor';
  if (/major|cell[ _-]?type|大类/u.test(`${targetText} ${methodText}`)) return 'major';
  return undefined;
};

const validateMapStructure = (
  map: PaperReproductionMap,
  paperMapReceipt: PaperReproductionMapReceipt,
  scopeReceipt: ReproductionScopeReceipt
): string[] => {
  const issues: string[] = [];
  const targetIds = mapTargetIds(map);
  const duplicateTargetIds = mapTargetCollections(map)
    .flatMap((collection) => collection.map((target) => target.id))
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateTargetIds.length)
    issues.push(`Paper map target IDs are duplicated: ${uniqueSorted(duplicateTargetIds).join(', ')}.`);
  const targetSet = new Set(targetIds);
  const receiptTargetSet = new Set(paperMapReceipt.targetIds);
  const missingReceiptTargets = targetIds.filter((id) => !receiptTargetSet.has(id));
  const unknownReceiptTargets = paperMapReceipt.targetIds.filter((id) => !targetSet.has(id));
  if (missingReceiptTargets.length) {
    issues.push(`paperMapReceipt.targetIds omits map targets: ${missingReceiptTargets.join(', ')}.`);
  }
  if (unknownReceiptTargets.length) {
    issues.push(
      `paperMapReceipt.targetIds contains unknown targets: ${uniqueSorted(unknownReceiptTargets).join(', ')}.`
    );
  }

  const scopeGroups = [scopeReceipt.requiredTargetIds, scopeReceipt.excludedTargetIds, scopeReceipt.blockedTargetIds];
  const scopedTargets = scopeGroups.flat();
  const duplicates = scopedTargets.filter((id, index) => scopedTargets.indexOf(id) !== index);
  if (duplicates.length) issues.push(`Scope target sets overlap: ${uniqueSorted(duplicates).join(', ')}.`);
  const unknownScopeTargets = scopedTargets.filter((id) => !targetSet.has(id));
  if (unknownScopeTargets.length)
    issues.push(`Scope contains unknown targets: ${uniqueSorted(unknownScopeTargets).join(', ')}.`);
  const decisionsByTarget = new Map(
    map.scopeDecisions.flatMap((decision) => decision.targetIds.map((targetId) => [targetId, decision] as const))
  );
  const unresolvedRequired = scopeReceipt.requiredTargetIds.filter((id) => {
    if (!paperMapReceipt.unresolvedTargetIds.includes(id)) return false;
    const decision = decisionsByTarget.get(id);
    return !decision || !['conditional', 'analogous_only'].includes(decision.status);
  });
  if (unresolvedRequired.length) {
    issues.push(`Required targets remain unresolved in the paper map: ${uniqueSorted(unresolvedRequired).join(', ')}.`);
  }
  const uncoveredTargets = scopeReceipt.requiredTargetIds.filter(
    (id) => !map.scopeDecisions.some((decision) => decision.targetIds.includes(id))
  );
  if (uncoveredTargets.length) {
    issues.push(`Required targets lack scope decisions: ${uniqueSorted(uncoveredTargets).join(', ')}.`);
  }
  return issues;
};

const buildContractV2 = (
  input: PrepareExecutionV2Input,
  map: PaperReproductionMap
): { contract: ScrnaExecutionContractV2; issues: string[] } => {
  const requiredTargetSet = new Set(input.scopeReceipt.requiredTargetIds);
  const decisions = map.scopeDecisions.filter((decision) =>
    decision.targetIds.some((targetId) => requiredTargetSet.has(targetId))
  );
  const issues: string[] = [];
  const duplicateDecisionIds = decisions
    .map((decision) => decision.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateDecisionIds.length) {
    issues.push(`Required scope decision IDs are duplicated: ${uniqueSorted(duplicateDecisionIds).join(', ')}.`);
  }

  const decisionForTarget = new Map<string, string>();
  for (const decision of decisions) {
    for (const targetId of decision.targetIds) {
      if (requiredTargetSet.has(targetId) && !decisionForTarget.has(targetId))
        decisionForTarget.set(targetId, decision.id);
    }
  }
  const policy = input.annotationPolicy;
  const relationship = policy?.minorDependsOnMajor ? 'minor_requires_major' : policy?.relationship || 'independent';
  const baseMode = input.annotationMode || 'independent_annotation';
  const moduleKinds = new Map<string, 'major' | 'minor' | undefined>();

  const modules: ScrnaExecutionContractModuleV2[] = decisions.map((decision) => {
    const directTargetIds = decision.targetIds.filter((id) => requiredTargetSet.has(id));
    const panels = panelsForTargets(map, directTargetIds);
    const panelIds = uniqueSorted(panels.map((panel) => panel.id));
    const claimIds = uniqueSorted([
      ...directTargetIds.filter((id) => map.claims.some((claim) => claim.id === id)),
      ...panels.flatMap((panel) => panel.claimIds),
    ]);
    const cohortIds = uniqueSorted([
      ...directTargetIds.filter((id) => map.cohorts.some((cohort) => cohort.id === id)),
      ...panels.flatMap((panel) => panel.cohortIds),
    ]);
    const methodIds = uniqueSorted([
      ...directTargetIds.filter((id) => map.methodUnits.some((method) => method.id === id)),
      ...panels.flatMap((panel) => panel.methodUnitIds),
    ]);
    const methods = map.methodUnits.filter((method) => methodIds.includes(method.id));
    const requiredInputs = uniqueSorted([
      ...directTargetIds.filter((id) => map.dataDependencies.some((dependency) => dependency.id === id)),
      ...panels.flatMap((panel) => panel.dependencyIds),
    ]);
    const expectedOutputIds = uniqueSorted([
      ...directTargetIds.filter((id) => map.expectedOutputs.some((output) => output.id === id)),
      ...panels.flatMap((panel) => panel.expectedOutputIds),
    ]);
    const relatedTargetIds = uniqueSorted([
      ...directTargetIds,
      ...panelIds,
      ...claimIds,
      ...cohortIds,
      ...methodIds,
      ...requiredInputs,
      ...expectedOutputIds,
    ]);
    const evidenceIds = targetEvidenceIds(map, relatedTargetIds);
    const kind = annotationKind(map, panels, directTargetIds);
    moduleKinds.set(decision.id, kind);
    const figureIds = uniqueSorted(panels.map((panel) => panel.figureId));
    const parentId =
      figureIds.length === 1
        ? decisions.find(
            (candidate) => candidate.id !== decision.id && candidate.targetIds.includes(figureIds[0] || '')
          )?.id
        : undefined;
    return {
      id: decision.id,
      ...(parentId ? { parentId } : {}),
      required: true,
      panelIds,
      claimIds,
      cohortIds,
      ...(methods.map((method) => method.lineage).filter(Boolean).length === 1
        ? { lineage: methods.map((method) => method.lineage).find(Boolean) }
        : {}),
      analysisFamilies: uniqueSorted(methods.map((method) => method.analysisFamily)),
      dependencyModuleIds: uniqueSorted(
        requiredInputs.map((targetId) => decisionForTarget.get(targetId)).filter((id): id is string => Boolean(id))
      ).filter((id) => id !== decision.id),
      scopeDecisionId: decision.id,
      ...(kind === 'major'
        ? { annotationMode: policy?.majorMode || baseMode }
        : kind === 'minor'
          ? { annotationMode: policy?.minorMode || baseMode }
          : {}),
      requiredInputs,
      expectedOutputs: expectedOutputIds.length ? expectedOutputIds : [`result:${decision.id}`],
      validationRequirements: uniqueSorted([
        'host_readable_outputs',
        'scope_target_coverage',
        ...evidenceIds.map((id) => `evidence:${id}`),
      ]),
    };
  });

  if (relationship === 'minor_requires_major') {
    const majorModules = modules.filter((module) => moduleKinds.get(module.id) === 'major');
    for (const module of modules.filter((candidate) => moduleKinds.get(candidate.id) === 'minor')) {
      const relatedMajorModules = majorModules.filter(
        (major) =>
          major.panelIds.some((id) => module.panelIds.includes(id)) ||
          major.cohortIds.some((id) => module.cohortIds.includes(id))
      );
      module.dependencyModuleIds = uniqueSorted([
        ...module.dependencyModuleIds,
        ...(relatedMajorModules.length ? relatedMajorModules : majorModules).map((major) => major.id),
      ]);
    }
  }

  if (!modules.length) issues.push('The current scope does not produce any required execution modules.');
  return {
    contract: {
      schema: EXECUTION_CONTRACT_V2_SCHEMA,
      createdAt: new Date().toISOString(),
      objective: input.objective,
      datasetIds: uniqueSorted(input.datasetIds),
      modality: 'scrna_seq',
      paperMapReceiptId: input.paperMapReceipt.receiptId,
      scopeReceiptId: input.scopeReceipt.receiptId,
      modules,
    },
    issues,
  };
};

const semanticContractV2 = (contract: ScrnaExecutionContractV2): unknown => {
  const { createdAt: _createdAt, ...semantic } = contract;
  return stableValue(semantic);
};

const validateV2ReceiptInputs = (
  projectRoot: string,
  input: Pick<PrepareExecutionV2Input, 'planningReceipt' | 'paperMapReceipt' | 'scopeReceipt'>
): { issues: string[]; map?: PaperReproductionMap } => {
  const planningReceipt = input.planningReceipt as unknown as ReproductionCompletionReceipt;
  const paperMapReceipt = input.paperMapReceipt as unknown as PaperReproductionMapReceipt;
  const scopeReceipt = input.scopeReceipt as unknown as ReproductionScopeReceipt;
  const issues = [
    ...validateStrictReceipt(planningReceipt, {
      label: 'planningReceipt',
      projectRoot,
      producer: 'bio_reproduction',
      action: 'validate_reproduction_plan',
      status: 'ready',
    }),
    ...validateStrictReceipt(paperMapReceipt, {
      label: 'paperMapReceipt',
      projectRoot,
      producer: 'bio_reproduction',
      action: 'validate_paper_reproduction_map',
      status: 'ready',
    }),
    ...validateStrictReceipt(scopeReceipt, {
      label: 'scopeReceipt',
      projectRoot,
      producer: 'bio_reproduction',
      action: 'validate_reproduction_scope',
      status: 'ready',
    }),
    ...validateReceiptChain(paperMapReceipt, scopeReceipt, 'scopeReceipt'),
  ];
  if (scopeReceipt.paperMapReceiptId !== paperMapReceipt.receiptId) {
    issues.push('scopeReceipt does not reference the current paperMapReceipt.');
  }
  if (paperMapReceipt.nextActions.length) issues.push('paperMapReceipt still has pending next actions.');
  if (scopeReceipt.nextActions.length) issues.push('scopeReceipt still has pending next actions.');

  const mapFile = validateReceiptFileReference(
    projectRoot,
    paperMapReceipt.canonicalFile,
    'paperMapReceipt.canonicalFile'
  );
  const scopeFile = validateReceiptFileReference(projectRoot, scopeReceipt.canonicalFile, 'scopeReceipt.canonicalFile');
  issues.push(...mapFile.issues, ...scopeFile.issues);
  if (!mapFile.absolutePath || mapFile.issues.length) return { issues };
  const decoded = readJsonFile(mapFile.absolutePath);
  if (decoded.issue) return { issues: [...issues, decoded.issue] };
  const parsedMap = paperReproductionMapSchema.safeParse(decoded.value);
  if (!parsedMap.success) return { issues: [...issues, ...formatZodIssues(parsedMap.error)] };
  const map = parsedMap.data as PaperReproductionMap;
  const mapCreatedAt = Date.parse(map.createdAt);
  if (!Number.isFinite(mapCreatedAt) || mapCreatedAt > paperMapReceipt.createdAt) {
    issues.push('paperMapReceipt predates the canonical paper map content.');
  }
  issues.push(...validateMapStructure(map, paperMapReceipt, scopeReceipt));
  return { issues, map };
};

const invalidV2PrepareResult = (issues: string[], payload: unknown) => ({
  status: 'needs_completion' as const,
  contractVersion: 2 as const,
  issues,
  nextActions: [
    boundedNextAction(
      {
        id: 'repair-hierarchical-execution-contract-call',
        tool: 'bio_reproduction',
        action: 'prepare_execution_contract',
        reason: 'Provide current planning, paper-map, and scope receipts using the v2 execution-contract fields.',
      },
      { issues, payload },
      ['payload', 'paperMapReceipt', 'scopeReceipt']
    ),
  ],
});

const prepareExecutionContractV2 = (projectRoot: string, payload: unknown) => {
  const parsed = prepareExecutionV2PayloadSchema.safeParse(payload);
  if (!parsed.success) return invalidV2PrepareResult(formatZodIssues(parsed.error), payload);

  const input = parsed.data;
  const receiptValidation = validateV2ReceiptInputs(projectRoot, input);
  if (!receiptValidation.map) return invalidV2PrepareResult(receiptValidation.issues, payload);
  const built = buildContractV2(input, receiptValidation.map);
  const issues = [...receiptValidation.issues, ...built.issues];
  const requestedPath = input.executionContractPath || 'case_reproduction/execution/execution_contract.json';
  const resolved = resolveProjectPath(projectRoot, requestedPath, false);
  let currentContract: ScrnaExecutionContractV2 | undefined;
  let current = '';
  if (resolved.path && fs.existsSync(resolved.path)) {
    current = fs.readFileSync(resolved.path, 'utf8');
    try {
      const validation = executionContractV2Schema.safeParse(JSON.parse(current));
      if (validation.success) currentContract = validation.data as ScrnaExecutionContractV2;
    } catch {
      currentContract = undefined;
    }
  }
  const currentMatches =
    currentContract &&
    JSON.stringify(semanticContractV2(currentContract)) === JSON.stringify(semanticContractV2(built.contract));
  const nextActions: BioNextAction[] = [];
  if (!resolved.path || !currentMatches) {
    nextActions.push(
      boundedNextAction(
        {
          id: 'write-hierarchical-execution-contract',
          tool: 'runtime',
          action: 'write_file',
          reason: resolved.reason || 'Write the canonical hierarchical scRNA-seq execution contract.',
          payload: {
            path: requestedPath,
            canonicalContent: built.contract,
            onSuccess: {
              tool: 'bio_reproduction',
              action: 'prepare_execution_contract',
              payload: input,
            },
          },
        },
        {
          path: requestedPath,
          currentHash: current ? hashContent(current) : '',
          desiredContract: semanticContractV2(built.contract),
        },
        [requestedPath]
      )
    );
  }
  if (issues.length) {
    nextActions.push(
      boundedNextAction(
        {
          id: 'refresh-hierarchical-execution-inputs',
          tool: 'bio_reproduction',
          action: 'validate_reproduction_scope',
          reason: 'Refresh stale or incomplete paper-map and scope receipts before preparing execution.',
        },
        { issues, paperMapReceiptId: input.paperMapReceipt.receiptId, scopeReceiptId: input.scopeReceipt.receiptId },
        ['paperMapReceipt', 'scopeReceipt']
      )
    );
  }

  const requiredModules = built.contract.modules.filter((module) => module.required).map((module) => module.id);
  const status = !issues.length && currentMatches ? 'ready' : 'needs_completion';
  const canonicalFile = { path: requestedPath, contentHash: currentMatches ? hashContent(current) : '' };
  const details = {
    contractVersion: 2,
    planningReceiptId: input.planningReceipt.receiptId,
    paperMapReceiptId: input.paperMapReceipt.receiptId,
    scopeReceiptId: input.scopeReceipt.receiptId,
    upstreamHashes: {
      paperMap: input.paperMapReceipt.canonicalFile.contentHash,
      scope: input.scopeReceipt.canonicalFile.contentHash,
    },
    canonicalFile,
    requiredModules,
  };
  const executionContractReceipt: ExecutionContractReceiptV2 | undefined =
    status === 'ready'
      ? {
          schema: BIO_RECEIPT_SCHEMA,
          receiptId: receiptId('prepare_execution_contract.v2', projectRoot, details),
          producer: 'bio_reproduction',
          action: 'prepare_execution_contract',
          status: 'ready',
          projectRoot,
          createdAt: Date.now(),
          workflowKind: 'omics_reproduction',
          workflowPhase: 'execution',
          modality: 'scrna_seq',
          contractVersion: 2,
          planningReceiptId: input.planningReceipt.receiptId,
          paperMapReceiptId: input.paperMapReceipt.receiptId,
          scopeReceiptId: input.scopeReceipt.receiptId,
          canonicalFile,
          requiredModules,
          nextActions: [],
          validationFingerprint: fingerprint(details),
          details,
        }
      : undefined;

  return {
    status,
    contractVersion: 2,
    canonicalPath: requestedPath,
    canonicalContent: currentMatches ? currentContract : built.contract,
    requiredModules,
    issues,
    nextActions: uniqueNextActions(nextActions),
    executionContractReceipt,
  };
};

const requiredTargetsForModule = (
  map: PaperReproductionMap,
  scopeReceipt: ReproductionScopeReceipt,
  module: ScrnaExecutionContractModuleV2
): string[] => {
  const required = new Set(scopeReceipt.requiredTargetIds);
  const decision = map.scopeDecisions.find((candidate) => candidate.id === module.scopeDecisionId);
  return uniqueSorted((decision?.targetIds || []).filter((id) => required.has(id)));
};

const validateContractGraph = (contract: ScrnaExecutionContractV2): string[] => {
  const issues: string[] = [];
  const moduleIds = contract.modules.map((module) => module.id);
  const duplicateIds = moduleIds.filter((id, index) => moduleIds.indexOf(id) !== index);
  if (duplicateIds.length)
    issues.push(`Execution contract module IDs are duplicated: ${uniqueSorted(duplicateIds).join(', ')}.`);
  const moduleSet = new Set(moduleIds);
  for (const module of contract.modules) {
    if (module.parentId && !moduleSet.has(module.parentId)) {
      issues.push(`Module ${module.id} references missing parent ${module.parentId}.`);
    }
    const missingDependencies = module.dependencyModuleIds.filter((id) => !moduleSet.has(id));
    if (missingDependencies.length) {
      issues.push(
        `Module ${module.id} references missing dependencies: ${uniqueSorted(missingDependencies).join(', ')}.`
      );
    }
    if (module.dependencyModuleIds.includes(module.id)) issues.push(`Module ${module.id} depends on itself.`);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(contract.modules.map((module) => [module.id, module]));
  const visit = (moduleId: string): boolean => {
    if (visiting.has(moduleId)) return true;
    if (visited.has(moduleId)) return false;
    visiting.add(moduleId);
    const cyclic = (byId.get(moduleId)?.dependencyModuleIds || []).some((dependencyId) => visit(dependencyId));
    visiting.delete(moduleId);
    visited.add(moduleId);
    return cyclic;
  };
  if (moduleIds.some((moduleId) => visit(moduleId))) issues.push('Execution contract dependencies contain a cycle.');
  return issues;
};

const moduleIsStatistical = (map: PaperReproductionMap, module: ScrnaExecutionContractModuleV2): boolean => {
  const panels = map.panels.filter((panel) => module.panelIds.includes(panel.id));
  const methodIds = new Set(panels.flatMap((panel) => panel.methodUnitIds));
  const text = [
    module.id,
    ...map.methodUnits
      .filter((method) => methodIds.has(method.id))
      .flatMap((method) => [method.id, method.analysisFamily, method.reportedMethod]),
  ]
    .join(' ')
    .toLowerCase();
  return /condition[_ -]?de|differential|pseudobulk|edger|deseq/u.test(text);
};

const coverageItemsFor = (params: {
  map: PaperReproductionMap;
  scopeReceipt: ReproductionScopeReceipt;
  contract: ScrnaExecutionContractV2;
  modules: ExecutionModuleResultV2[];
  executionRunReceiptIds: string[];
}): ScienceCoverageItem[] => {
  const { map, scopeReceipt, contract, modules, executionRunReceiptIds } = params;
  const resultById = new Map(modules.map((module) => [module.id, module]));
  const targetCollections: Array<{
    targetType: ScienceCoverageItem['targetType'];
    targets: Array<{ id: string; evidenceIds: string[] }>;
  }> = [
    { targetType: 'paper_figure', targets: map.figures },
    { targetType: 'paper_panel', targets: map.panels },
    { targetType: 'paper_claim', targets: map.claims },
  ];
  const scoped = new Set([
    ...scopeReceipt.requiredTargetIds,
    ...scopeReceipt.excludedTargetIds,
    ...scopeReceipt.blockedTargetIds,
  ]);
  const items = targetCollections.flatMap(({ targetType, targets }) =>
    targets
      .filter((target) => scoped.has(target.id))
      .map((target): ScienceCoverageItem => {
        const decision = map.scopeDecisions.find((candidate) => candidate.targetIds.includes(target.id));
        const contractModules = contract.modules.filter((module) =>
          requiredTargetsForModule(map, scopeReceipt, module).includes(target.id)
        );
        const results = contractModules
          .map((module) => resultById.get(module.id))
          .filter(Boolean) as ExecutionModuleResultV2[];
        const completed = results.some((result) => ['validated', 'scientifically_limited'].includes(result.status));
        const externallyBlocked = results.some((result) => result.status === 'externally_blocked');
        const excluded = scopeReceipt.excludedTargetIds.includes(target.id);
        const blocked = scopeReceipt.blockedTargetIds.includes(target.id);
        const status: ScienceCoverageItem['status'] = excluded
          ? 'excluded_by_user'
          : blocked || externallyBlocked
            ? 'scientifically_blocked'
            : completed
              ? 'completed'
              : decision?.status || 'unresolved';
        return {
          id: `coverage:${target.id}`,
          targetType,
          targetId: target.id,
          moduleIds: contractModules.map((module) => module.id),
          cohortIds: uniqueSorted(contractModules.flatMap((module) => module.cohortIds)),
          reproductionMode: decision?.reproductionMode || 'scoped_reimplementation',
          status,
          reason: decision?.reason || 'No current scope decision covers this target.',
          artifactIds: uniqueSorted(results.flatMap((result) => result.outputFiles.map((file) => file.path))),
          evidenceIds: target.evidenceIds,
          receiptIds: uniqueSorted([
            ...executionRunReceiptIds,
            ...results.flatMap((result) => result.validationReceiptIds),
          ]),
        };
      })
  );
  const requiredItems = items.filter((item) => scopeReceipt.requiredTargetIds.includes(item.targetId));
  items.unshift({
    id: 'coverage:user-objective',
    targetType: 'user_objective',
    targetId: 'user-objective',
    moduleIds: contract.modules.filter((module) => module.required).map((module) => module.id),
    cohortIds: uniqueSorted(contract.modules.flatMap((module) => module.cohortIds)),
    reproductionMode: 'scoped_reimplementation',
    status: requiredItems.every((item) => item.status === 'completed') ? 'completed' : 'required',
    reason: contract.objective,
    artifactIds: uniqueSorted(modules.flatMap((module) => module.outputFiles.map((file) => file.path))),
    evidenceIds: [],
    receiptIds: executionRunReceiptIds,
  });
  return items;
};

const invalidV2CompleteResult = (issues: string[], payload: unknown) => ({
  status: 'needs_completion' as const,
  contractVersion: 2 as const,
  executionCompletion: 'incomplete' as const,
  issues,
  nextActions: [
    boundedNextAction(
      {
        id: 'repair-hierarchical-complete-execution-call',
        tool: 'bio_reproduction',
        action: 'complete_execution',
        reason: 'Provide the current v2 contract, scope, script-validation, execution-run, and module-result receipts.',
      },
      { issues, payload },
      ['payload', 'receiptChain', 'moduleResults']
    ),
  ],
});

const completeExecutionV2 = (projectRoot: string, payload: unknown) => {
  const parsed = completeExecutionV2PayloadSchema.safeParse(payload);
  if (!parsed.success) return invalidV2CompleteResult(formatZodIssues(parsed.error), payload);

  const input = parsed.data;
  const contractReceipt = input.executionContractReceipt as unknown as ExecutionContractReceiptV2;
  const planningReceipt = input.planningReceipt as unknown as ReproductionCompletionReceipt;
  const paperMapReceipt = input.paperMapReceipt as unknown as PaperReproductionMapReceipt;
  const scopeReceipt = input.scopeReceipt as unknown as ReproductionScopeReceipt;
  const methodReceipt = input.methodAlignmentReceipt as unknown as MethodAlignmentReceipt;
  const scriptReceipt = input.scriptValidationReceipt as unknown as ScriptValidationReceipt;
  const runReceipts = input.executionRunReceipts as unknown as ExecutionRunReceipt[];
  const statisticalReceipts = [
    ...(input.statisticalCompletionReceipt ? [input.statisticalCompletionReceipt] : []),
    ...(input.statisticalCompletionReceipts || []),
  ] as unknown as BioStatisticsCompletionReceipt[];
  const uniqueStatisticalReceipts = [
    ...new Map(statisticalReceipts.map((receipt) => [receipt.receiptId, receipt])).values(),
  ];
  const issues: string[] = [];
  const nextActions: BioNextAction[] = [];
  const canonicalFiles: Array<{ path: string; contentHash: string }> = [];

  const upstream = validateV2ReceiptInputs(projectRoot, input);
  issues.push(...upstream.issues);
  const map = upstream.map;
  issues.push(
    ...validateStrictReceipt(contractReceipt, {
      label: 'executionContractReceipt',
      projectRoot,
      producer: 'bio_reproduction',
      action: 'prepare_execution_contract',
      status: 'ready',
    }),
    ...validateStrictReceipt(methodReceipt, {
      label: 'methodAlignmentReceipt',
      projectRoot,
      producer: 'bio_reproduction',
      action: 'validate_method_alignment',
      status: 'ready',
    }),
    ...validateStrictReceipt(scriptReceipt, {
      label: 'scriptValidationReceipt',
      projectRoot,
      producer: 'bio_reproduction',
      action: 'preflight_execution_scripts',
      status: 'ready',
    }),
    ...validateReceiptChain(scopeReceipt, contractReceipt, 'executionContractReceipt'),
    ...validateReceiptChain(contractReceipt, scriptReceipt, 'scriptValidationReceipt')
  );
  if (contractReceipt.planningReceiptId !== planningReceipt.receiptId) {
    issues.push('executionContractReceipt does not reference the current planningReceipt.');
  }
  if (contractReceipt.paperMapReceiptId !== paperMapReceipt.receiptId) {
    issues.push('executionContractReceipt does not reference the current paperMapReceipt.');
  }
  if (contractReceipt.scopeReceiptId !== scopeReceipt.receiptId) {
    issues.push('executionContractReceipt does not reference the current scopeReceipt.');
  }
  const contractReceiptDetails = contractReceipt.details;
  if (!contractReceiptDetails) {
    issues.push('executionContractReceipt is missing its v2 hash-chain details.');
  } else {
    const upstreamHashes = contractReceiptDetails.upstreamHashes;
    const upstreamHashRecord =
      upstreamHashes && typeof upstreamHashes === 'object' && !Array.isArray(upstreamHashes)
        ? (upstreamHashes as Record<string, unknown>)
        : undefined;
    if (
      !upstreamHashRecord ||
      upstreamHashRecord.paperMap !== paperMapReceipt.canonicalFile.contentHash ||
      upstreamHashRecord.scope !== scopeReceipt.canonicalFile.contentHash
    ) {
      issues.push('executionContractReceipt upstream hash chain is stale.');
    }
    if (contractReceipt.validationFingerprint !== fingerprint(contractReceiptDetails)) {
      issues.push('executionContractReceipt validation fingerprint is stale.');
    }
    if (contractReceipt.receiptId !== receiptId('prepare_execution_contract.v2', projectRoot, contractReceiptDetails)) {
      issues.push('executionContractReceipt identity does not match its hash-chain details.');
    }
  }
  if (scriptReceipt.executionContractReceiptId !== contractReceipt.receiptId) {
    issues.push('scriptValidationReceipt does not reference the current executionContractReceipt.');
  }
  if (scriptReceipt.methodParameterReceiptId !== planningReceipt.methodParameterReceiptId) {
    issues.push('scriptValidationReceipt does not reference the current method-parameter receipt.');
  }
  if (methodReceipt.methodParameterReceiptId !== planningReceipt.methodParameterReceiptId) {
    issues.push('methodAlignmentReceipt does not reference the current method-parameter receipt.');
  }
  if (scriptReceipt.violations.length) issues.push('scriptValidationReceipt contains unresolved violations.');

  const addStrictFile = (file: { path: string; contentHash: string }, label: string) => {
    const validation = validateReceiptFileReference(projectRoot, file, label);
    issues.push(...validation.issues);
    if (validation.file) canonicalFiles.push(validation.file);
    return validation.file;
  };
  const contractFile = addStrictFile(contractReceipt.canonicalFile, 'executionContractReceipt.canonicalFile');
  addStrictFile(paperMapReceipt.canonicalFile, 'paperMapReceipt.canonicalFile');
  addStrictFile(scopeReceipt.canonicalFile, 'scopeReceipt.canonicalFile');
  addStrictFile(methodReceipt.executedParameterFile, 'methodAlignmentReceipt.executedParameterFile');
  methodReceipt.scriptFiles.forEach((file, index) =>
    addStrictFile(file, `methodAlignmentReceipt.scriptFiles.${index}`)
  );
  scriptReceipt.scripts.forEach((file, index) => addStrictFile(file, `scriptValidationReceipt.scripts.${index}`));

  let contract: ScrnaExecutionContractV2 | undefined;
  if (contractFile) {
    const resolved = resolveProjectPath(projectRoot, contractFile.path, true);
    const decoded = resolved.path ? readJsonFile(resolved.path) : { issue: resolved.reason };
    if (decoded.issue) issues.push(decoded.issue);
    else {
      const validation = executionContractV2Schema.safeParse(decoded.value);
      if (validation.success) contract = validation.data as ScrnaExecutionContractV2;
      else issues.push(...formatZodIssues(validation.error));
    }
  }
  if (contract) {
    issues.push(...validateContractGraph(contract));
    if (
      contract.paperMapReceiptId !== paperMapReceipt.receiptId ||
      contract.scopeReceiptId !== scopeReceipt.receiptId
    ) {
      issues.push('The execution contract file is not chained to the current paper-map and scope receipts.');
    }
    const requiredModules = contract.modules.filter((module) => module.required).map((module) => module.id);
    if (
      JSON.stringify(uniqueSorted(requiredModules)) !== JSON.stringify(uniqueSorted(contractReceipt.requiredModules))
    ) {
      issues.push('executionContractReceipt.requiredModules is stale relative to the contract file.');
    }
  }

  const runOutputHashes = new Map<string, string>();
  const runScriptHashes = new Map<string, string>();
  for (const [runIndex, runReceipt] of runReceipts.entries()) {
    issues.push(
      ...validateStrictReceipt(runReceipt, {
        label: `executionRunReceipts.${runIndex}`,
        projectRoot,
        producer: 'bio_runtime',
        action: 'record_execution',
        status: 'ready',
      }),
      ...validateReceiptChain(scriptReceipt, runReceipt, `executionRunReceipts.${runIndex}`)
    );
    if (runReceipt.scriptValidationReceiptId !== scriptReceipt.receiptId) {
      issues.push(`executionRunReceipts.${runIndex} does not reference the current scriptValidationReceipt.`);
    }
    if (runReceipt.finishedAt < runReceipt.startedAt) {
      issues.push(`executionRunReceipts.${runIndex}.finishedAt predates startedAt.`);
    }
    if (runReceipt.exitCode !== 0) issues.push(`executionRunReceipts.${runIndex} did not exit successfully.`);
    const groups = [
      ['scriptFiles', runReceipt.scriptFiles] as const,
      ['configFiles', runReceipt.configFiles] as const,
      ['logFiles', runReceipt.logFiles] as const,
      ['outputFiles', runReceipt.outputFiles] as const,
    ];
    for (const [group, files] of groups) {
      files.forEach((file, fileIndex) => {
        const validated = addStrictFile(file, `executionRunReceipts.${runIndex}.${group}.${fileIndex}`);
        if (validated && group === 'scriptFiles') runScriptHashes.set(validated.path, validated.contentHash);
        if (validated && group === 'outputFiles') runOutputHashes.set(validated.path, validated.contentHash);
      });
    }
  }
  for (const script of scriptReceipt.scripts) {
    if (runScriptHashes.get(script.path) !== script.contentHash) {
      issues.push(`${script.path}: no execution-run receipt records the validated script hash.`);
    }
  }

  for (const [index, receipt] of uniqueStatisticalReceipts.entries()) {
    issues.push(
      ...validateStrictReceipt(receipt, {
        label: `statisticalCompletionReceipts.${index}`,
        projectRoot,
        producer: 'bio_statistics',
        action: 'validate_de_outputs',
        status: 'ready',
      })
    );
    if (receipt.planningReceiptId !== planningReceipt.receiptId) {
      issues.push(`statisticalCompletionReceipts.${index} does not reference the current planningReceipt.`);
    }
    receipt.canonicalFiles.forEach((file, fileIndex) =>
      addStrictFile(file, `statisticalCompletionReceipts.${index}.canonicalFiles.${fileIndex}`)
    );
  }

  const externalBlockers = (input.externalBlockers || []) as BioBlocker[];
  for (const blocker of externalBlockers) {
    if (!blocker.external || blocker.kind === 'contract') {
      issues.push(`Blocker ${blocker.id} is correctable and cannot be classified as an external blocker.`);
    }
  }

  const resultById = new Map(input.moduleResults.map((result) => [result.id, result]));
  const modules: ExecutionModuleResultV2[] = [];
  const mapTargets = new Set(map ? mapTargetIds(map) : []);
  const requiredModuleIds = new Set(
    contract?.modules.filter((module) => module.required).map((module) => module.id) || []
  );
  const unknownResults = input.moduleResults.filter((result) => !requiredModuleIds.has(result.id));
  if (unknownResults.length)
    issues.push(
      `Module results contain unknown or unrequested IDs: ${uniqueSorted(unknownResults.map((result) => result.id)).join(', ')}.`
    );

  for (const module of contract?.modules || []) {
    if (!module.required) {
      modules.push({
        id: module.id,
        required: false,
        status: 'not_requested',
        targetIds: [],
        outputFiles: [],
        validationReceiptIds: [],
        limitations: [],
      });
      continue;
    }
    const supplied = resultById.get(module.id);
    const requiredTargets = map ? requiredTargetsForModule(map, scopeReceipt, module) : [];
    if (!supplied) {
      modules.push({
        id: module.id,
        required: true,
        status: 'incomplete',
        targetIds: [],
        outputFiles: [],
        validationReceiptIds: [],
        limitations: ['No module result was supplied.'],
      });
      nextActions.push(
        boundedNextAction(
          {
            id: `execute-${module.id}`,
            tool: 'runtime',
            action: 'execute_module',
            reason: `Complete required module ${module.id} and record its scoped outputs.`,
            payload: {
              moduleId: module.id,
              targetIds: requiredTargets,
              requiredInputs: module.requiredInputs,
              expectedOutputs: module.expectedOutputs,
            },
          },
          { module, result: null, scriptValidationReceiptId: scriptReceipt.receiptId },
          [`moduleResults:${module.id}`, ...module.expectedOutputs]
        )
      );
      continue;
    }

    const outputFiles: Array<{ path: string; contentHash: string }> = [];
    for (const outputPath of supplied.outputPaths) {
      const validation = validateFileReference(projectRoot, { path: outputPath });
      if (validation.issue) issues.push(validation.issue);
      if (validation.file) {
        outputFiles.push(validation.file);
        canonicalFiles.push(validation.file);
        if (runOutputHashes.get(validation.file.path) !== validation.file.contentHash) {
          issues.push(`${validation.file.path}: output is not chained to a current execution-run receipt.`);
        }
      }
    }
    let status = supplied.status;
    const limitations = [...supplied.limitations];
    const unknownTargets = supplied.targetIds.filter((id) => !mapTargets.has(id));
    if (unknownTargets.length) {
      status = 'incomplete';
      limitations.push(`Unknown target IDs: ${uniqueSorted(unknownTargets).join(', ')}.`);
    }
    const missingTargets = requiredTargets.filter((id) => !supplied.targetIds.includes(id));
    if (missingTargets.length) {
      status = 'incomplete';
      limitations.push(`Required target coverage is missing: ${missingTargets.join(', ')}.`);
    }
    if (status === 'not_requested') {
      status = 'incomplete';
      limitations.push('A required module cannot be marked not_requested.');
    }
    if (['validated', 'scientifically_limited'].includes(status) && !outputFiles.length) {
      status = 'incomplete';
      limitations.push('Validated modules must declare at least one host-readable output file.');
    }
    if (status === 'scientifically_limited' && !limitations.length) {
      status = 'incomplete';
      limitations.push('A scientifically limited module must describe its limitation.');
    }
    const coveredByScript = scriptReceipt.scripts.some((script) => script.moduleIds.includes(module.id));
    if (!coveredByScript) {
      status = 'incomplete';
      limitations.push('No validated execution script covers this module.');
    }
    if (map && moduleIsStatistical(map, module)) {
      const receiptIds = new Set(uniqueStatisticalReceipts.map((receipt) => receipt.receiptId));
      if (!uniqueStatisticalReceipts.length || !supplied.validationReceiptIds.some((id) => receiptIds.has(id))) {
        status = 'generated_unvalidated';
        limitations.push('The statistical module does not reference a current statistical completion receipt.');
      }
    }
    if (
      status === 'externally_blocked' &&
      !externalBlockers.some(
        (blocker) => blocker.external && blocker.kind !== 'contract' && blocker.moduleId === module.id
      )
    ) {
      status = 'incomplete';
      limitations.push('An externally blocked module requires a matching genuine external blocker.');
    }
    modules.push({
      id: module.id,
      required: true,
      status,
      targetIds: uniqueSorted(supplied.targetIds),
      outputFiles: uniqueFiles(outputFiles),
      validationReceiptIds: uniqueSorted(supplied.validationReceiptIds),
      limitations: uniqueSorted(limitations),
    });
  }

  const completedStatuses = new Set(['validated', 'scientifically_limited']);
  const moduleResultById = new Map(modules.map((module) => [module.id, module]));
  for (const module of contract?.modules.filter((candidate) => candidate.required) || []) {
    const result = moduleResultById.get(module.id);
    if (!result || !completedStatuses.has(result.status)) continue;
    const incompleteDependencies = module.dependencyModuleIds.filter(
      (dependencyId) => !completedStatuses.has(moduleResultById.get(dependencyId)?.status || '')
    );
    if (incompleteDependencies.length) {
      result.status = 'incomplete';
      result.limitations = uniqueSorted([
        ...result.limitations,
        `Dependencies are incomplete: ${incompleteDependencies.join(', ')}.`,
      ]);
    }
  }

  const coveredTargets = new Set(
    modules
      .filter((module) => completedStatuses.has(module.status) || module.status === 'externally_blocked')
      .flatMap((module) => module.targetIds)
  );
  const missingCoverage = scopeReceipt.requiredTargetIds.filter((id) => !coveredTargets.has(id));
  if (missingCoverage.length) {
    issues.push(`Required scope targets are not completed: ${uniqueSorted(missingCoverage).join(', ')}.`);
  }
  for (const module of modules.filter((candidate) =>
    ['generated_unvalidated', 'incomplete'].includes(candidate.status)
  )) {
    nextActions.push(
      boundedNextAction(
        {
          id: `validate-${module.id}`,
          tool: 'bio_reproduction',
          action: 'complete_execution',
          reason: `Module ${module.id} is incomplete or generated without current validation.`,
          payload: { moduleId: module.id },
        },
        {
          module,
          contractReceiptId: contractReceipt.receiptId,
          runReceiptIds: runReceipts.map((receipt) => receipt.receiptId),
        },
        [`moduleResults:${module.id}`, `coverage:${module.id}`]
      )
    );
  }

  const hasExternalBlock = modules.some((module) => module.required && module.status === 'externally_blocked');
  const hasIncomplete = modules.some(
    (module) => module.required && ['generated_unvalidated', 'incomplete'].includes(module.status)
  );
  const hasScientificLimit =
    modules.some((module) => module.required && module.status === 'scientifically_limited') ||
    uniqueStatisticalReceipts.some((receipt) => receipt.contrasts.some((contrast) => contrast.status !== 'tested'));
  if (issues.length && !hasExternalBlock && !nextActions.length) {
    nextActions.push(
      boundedNextAction(
        {
          id: 'refresh-execution-receipt-chain',
          tool: 'bio_reproduction',
          action: 'prepare_execution_contract',
          reason: 'Refresh stale contract, script-validation, execution-run, or output receipt links.',
        },
        {
          issues,
          executionContractReceiptId: contractReceipt.receiptId,
          scriptValidationReceiptId: scriptReceipt.receiptId,
          executionRunReceiptIds: runReceipts.map((receipt) => receipt.receiptId),
        },
        ['executionContractReceipt', 'scriptValidationReceipt', 'executionRunReceipts']
      )
    );
  }
  const executionCompletion = !issues.length && !hasIncomplete && !hasExternalBlock ? 'complete' : 'incomplete';
  const scientificOutcome = hasExternalBlock
    ? 'externally_blocked'
    : hasScientificLimit
      ? 'validated_with_limits'
      : 'validated';
  const status =
    executionCompletion === 'complete'
      ? 'ready'
      : hasExternalBlock && !nextActions.length
        ? 'blocked'
        : 'needs_completion';
  const executionRunReceiptIds = runReceipts.map((receipt) => receipt.receiptId);
  const coverageItems =
    map && contract ? coverageItemsFor({ map, scopeReceipt, contract, modules, executionRunReceiptIds }) : [];
  const skillUses = uniqueSkillUses([
    ...(planningReceipt.skillUses || []),
    ...uniqueStatisticalReceipts.flatMap((receipt) => receipt.skillUses || []),
    ...((input.skillUses || []) as Array<Omit<ScienceSkillUse, 'runId' | 'revision'>>),
  ]);
  const boundedActions = uniqueNextActions(nextActions);
  const canonicalFileSnapshots = fileSnapshots(projectRoot, canonicalFiles);
  const receiptDetails = {
    contractVersion: 2,
    executionContractReceiptId: contractReceipt.receiptId,
    planningReceiptId: planningReceipt.receiptId,
    paperMapReceiptId: paperMapReceipt.receiptId,
    scopeReceiptId: scopeReceipt.receiptId,
    methodAlignmentReceiptId: methodReceipt.receiptId,
    scriptValidationReceiptId: scriptReceipt.receiptId,
    executionRunReceiptIds,
    statisticalReceiptIds: uniqueStatisticalReceipts.map((receipt) => receipt.receiptId),
    modules,
    coverageItems,
    canonicalFiles: canonicalFileSnapshots,
    executionCompletion,
    scientificOutcome,
  };
  const completionReceipt: ReproductionExecutionReceiptV2 = {
    schema: BIO_RECEIPT_SCHEMA,
    receiptId: receiptId('complete_execution.v2', projectRoot, receiptDetails),
    producer: 'bio_reproduction',
    action: 'complete_execution',
    status,
    projectRoot,
    createdAt: Date.now(),
    workflowKind: 'omics_reproduction',
    workflowPhase: 'execution',
    modality: 'scrna_seq',
    contractVersion: 2,
    executionCompletion,
    scientificOutcome,
    executionContractFile: contractFile || contractReceipt.canonicalFile,
    executionContractReceiptId: contractReceipt.receiptId,
    planningReceiptId: planningReceipt.receiptId,
    paperMapReceiptId: paperMapReceipt.receiptId,
    scopeReceiptId: scopeReceipt.receiptId,
    methodAlignmentReceiptId: methodReceipt.receiptId,
    scriptValidationReceiptId: scriptReceipt.receiptId,
    executionRunReceiptIds,
    statisticalReceiptIds: uniqueStatisticalReceipts.map((receipt) => receipt.receiptId),
    modules,
    coverageItems,
    canonicalFiles: canonicalFileSnapshots,
    skillUses,
    nextActions: boundedActions,
    externalBlockers,
    validationFingerprint: fingerprint(receiptDetails),
    details: receiptDetails,
  };

  return {
    status,
    contractVersion: 2,
    executionCompletion,
    scientificOutcome,
    issues,
    coverageItems,
    nextActions: boundedActions,
    externalBlockers,
    completionReceipt,
  };
};

const isV2PreparePayload = (payload: unknown): boolean =>
  Boolean(
    payload &&
    typeof payload === 'object' &&
    ('paperMapReceipt' in payload ||
      'scopeReceipt' in payload ||
      (payload as { contractVersion?: unknown }).contractVersion === 2)
  );

const isV2CompletePayload = (payload: unknown): boolean =>
  Boolean(
    payload &&
    typeof payload === 'object' &&
    ((payload as { executionContractReceipt?: { contractVersion?: unknown } }).executionContractReceipt
      ?.contractVersion === 2 ||
      (payload as { contractVersion?: unknown }).contractVersion === 2)
  );

export const prepareExecutionContract = (projectRoot: string, payload: unknown) =>
  isV2PreparePayload(payload)
    ? prepareExecutionContractV2(projectRoot, payload)
    : prepareExecutionContractV1(projectRoot, payload);

export const completeExecution = (projectRoot: string, payload: unknown) =>
  isV2CompletePayload(payload) ? completeExecutionV2(projectRoot, payload) : completeExecutionV1(projectRoot, payload);
