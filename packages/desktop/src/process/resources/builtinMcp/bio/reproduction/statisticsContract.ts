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
  BioControlReceipt,
  BioNextAction,
  BioStatisticsCompletionReceipt,
  BioStatisticsContrastStatus,
  BioStatisticsDesignContrast,
  BioStatisticsDesignReceipt,
} from '@/common/chat/science';

const MINIMUM_REPLICATES = 3 as const;
const BIO_RECEIPT_SCHEMA = 'openbioscience.bio.receipt.v1' as const;
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/u;

const bioNextActionSchema = z
  .object({
    id: z.string().min(1),
    tool: z.enum(['bio_source', 'bio_runtime', 'bio_reproduction', 'bio_statistics', 'science_artifact', 'runtime']),
    action: z.string().min(1),
    reason: z.string().min(1),
    payload: z.record(z.unknown()).optional(),
    actionFingerprint: z.string().min(1).optional(),
    preconditionHash: z.string().min(1).optional(),
    expectedMutation: z.array(z.string().min(1)).optional(),
    maxAttempts: z.number().int().positive().optional(),
    stopWhenUnchanged: z.boolean().optional(),
  })
  .strict();

const blockerSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['credentials', 'permissions', 'data', 'environment', 'contract']),
    message: z.string().min(1),
    moduleId: z.string().min(1).optional(),
    external: z.boolean(),
  })
  .strict();

const skillUseSchema = z
  .object({
    id: z.string().min(1),
    skillId: z.string().min(1),
    skillName: z.string().min(1),
    source: z.enum(['deepscientist', 'k-dense', 'auto-empirical', 'nature-skills', 'sciagent', 'local', 'custom']),
    purpose: z.enum([
      'routing',
      'database_lookup',
      'package_workflow',
      'pipeline',
      'visualization',
      'writing',
      'review',
      'empirical_design',
      'causal_inference',
      'replication',
      'citation_audit',
      'paper_reading',
      'data_availability',
      'proposal',
      'patent_drafting',
      'presentation',
      'experiment_log',
      'codebook',
      'qualitative_analysis',
    ]),
    status: z.enum(['selected', 'used', 'blocked', 'unavailable']),
    triggeredBy: z.string().min(1),
    createdAt: z.number(),
  })
  .passthrough();

const sampleSchema = z
  .object({
    id: z.string().min(1),
    biologicalReplicate: z.string().min(1),
    condition: z.string().min(1),
    cellType: z.string().min(1),
    pairId: z.string().min(1).optional(),
    eligible: z.boolean().optional(),
    exclusionReason: z.string().min(1).optional(),
  })
  .strict();

const contrastSchema = z
  .object({
    id: z.string().min(1),
    target: z.string().min(1),
    reference: z.string().min(1),
    cellType: z.string().min(1),
  })
  .strict();

export const deDesignPayloadSchema = z
  .object({
    replicateUnit: z.string().min(1),
    conditionColumn: z.string().min(1),
    cellTypeColumn: z.string().min(1),
    pairedBy: z.string().min(1).optional(),
    formula: z.string().min(1),
    executedFormula: z.string().min(1),
    countMatrix: z
      .object({
        path: z.string().min(1),
        aggregationUnit: z.literal('biological_replicate'),
        integerCounts: z.boolean(),
      })
      .strict(),
    designMatrix: z
      .object({
        columns: z.array(z.string().min(1)).min(1),
        rank: z.number().int().nonnegative(),
        confounded: z.boolean().optional(),
      })
      .strict(),
    samples: z.array(sampleSchema).min(1),
    contrasts: z.array(contrastSchema).min(1),
  })
  .strict();

export const expressionContractPayloadSchema = z
  .object({
    counts: z
      .object({
        location: z.string().min(1),
        semantics: z.literal('raw_integer_counts'),
        integerValues: z.boolean(),
      })
      .strict(),
    logNormalized: z.object({ location: z.string().min(1), transformation: z.string().min(1) }).strict(),
    analysisMatrix: z
      .object({
        location: z.string().min(1),
        semantics: z.enum(['log_normalized', 'scaled', 'raw_counts']),
      })
      .strict(),
    scaled: z
      .object({ location: z.string().min(1), genes: z.enum(['hvg_only', 'all_genes']) })
      .strict()
      .optional(),
    raw: z
      .object({
        location: z.literal('raw'),
        semantics: z.enum(['log_normalized', 'raw_counts']),
        documented: z.boolean(),
      })
      .strict()
      .optional(),
    markerTable: z
      .object({
        path: z.string().min(1),
        sourceLayer: z.string().min(1),
        method: z.string().min(1),
        purpose: z.literal('cluster_annotation'),
        effectSizeColumn: z.string().min(1),
        adjustedPValueColumn: z.string().min(1),
        detectionFractionColumns: z.array(z.string().min(1)).min(1),
      })
      .strict()
      .optional(),
    plots: z
      .array(
        z
          .object({
            id: z.string().min(1),
            plotType: z.string().min(1),
            sourceLayer: z.string().min(1),
            transformation: z.string().min(1),
          })
          .strict()
      )
      .optional(),
  })
  .strict();

const designContrastSchema = z
  .object({
    id: z.string().min(1),
    target: z.string().min(1),
    reference: z.string().min(1),
    cellType: z.string().min(1),
    targetReplicates: z.number().int().nonnegative(),
    referenceReplicates: z.number().int().nonnegative(),
    completePairs: z.number().int().nonnegative().optional(),
    status: z.enum(['ready', 'blocked']),
    warnings: z.array(z.string()),
  })
  .strict();

export const statisticsDesignReceiptSchema = z
  .object({
    schema: z.literal(BIO_RECEIPT_SCHEMA),
    receiptId: z.string().min(1),
    producer: z.literal('bio_statistics'),
    action: z.literal('validate_de_design'),
    status: z.string().min(1),
    projectRoot: z.string().min(1),
    createdAt: z.number(),
    analysisKind: z.literal('pseudobulk_de'),
    replicateUnit: z.string().min(1),
    pairedBy: z.string().min(1).optional(),
    formula: z.string().min(1),
    minimumReplicates: z.literal(MINIMUM_REPLICATES),
    contrasts: z.array(designContrastSchema),
    nextActions: z.array(bioNextActionSchema),
  })
  .passthrough();

const outputContrastSchema = z
  .object({
    id: z.string().min(1),
    target: z.string().min(1),
    reference: z.string().min(1),
    coefficient: z.string().min(1),
    status: z.enum(['tested', 'blocked_insufficient_replicates', 'blocked_invalid_design', 'failed']),
    effectiveReplicates: z.record(z.number().int().nonnegative()),
    warnings: z.array(z.string()),
  })
  .strict();

const canonicalFileSchema = z
  .object({
    path: z.string().min(1),
    contentHash: z.string().regex(CONTENT_HASH_PATTERN),
  })
  .strict();

export const statisticsCompletionReceiptSchema = z
  .object({
    schema: z.literal(BIO_RECEIPT_SCHEMA),
    receiptId: z.string().min(1),
    producer: z.literal('bio_statistics'),
    action: z.literal('validate_de_outputs'),
    status: z.string().min(1),
    projectRoot: z.string().min(1),
    createdAt: z.number(),
    validationFingerprint: z.string().min(1).optional(),
    workflowKind: z.literal('omics_reproduction'),
    workflowPhase: z.literal('execution'),
    planningReceiptId: z.string().min(1),
    designReceiptId: z.string().min(1),
    package: z.literal('edgeR'),
    packageVersion: z.string().min(1),
    contrasts: z.array(outputContrastSchema).min(1),
    canonicalFiles: z.array(canonicalFileSchema).min(1),
    skillUses: z.array(skillUseSchema).min(1),
    mcpActions: z.array(z.string().min(1)).min(1),
    nextActions: z.array(bioNextActionSchema),
    externalBlockers: z.array(blockerSchema),
  })
  .passthrough();

export const deOutputsPayloadSchema = z
  .object({
    planningReceiptId: z.string().min(1),
    designReceipt: statisticsDesignReceiptSchema,
    package: z.object({ name: z.literal('edgeR'), version: z.string().min(1) }).strict(),
    methods: z
      .object({
        normalization: z.literal('TMM'),
        filterByExprWithDesign: z.literal(true),
        dispersionEstimated: z.literal(true),
        glmQLFitRobust: z.literal(true),
        glmQLFTest: z.literal(true),
        multipleTesting: z.literal('BH_within_cell_type_contrast'),
      })
      .strict(),
    executedFormula: z.string().min(1),
    contrasts: z.array(outputContrastSchema).min(1),
    files: z
      .object({
        sampleInclusion: z.string().min(1),
        designMatrix: z.string().min(1),
        librarySizes: z.string().min(1),
        normalizationFactors: z.string().min(1),
        dispersionDiagnostics: z.string().min(1),
        deTables: z.array(z.string().min(1)).min(1),
        executionLog: z.string().min(1),
      })
      .strict(),
    skillUses: z.array(skillUseSchema).min(1),
    mcpActions: z.array(z.string().min(1)).min(1),
    externalBlockers: z.array(blockerSchema).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const requiredAction of ['validate_de_design', 'validate_de_outputs']) {
      if (!value.mcpActions.includes(requiredAction)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mcpActions'],
          message: `mcpActions must include ${requiredAction}.`,
        });
      }
    }
  });

type ParsedDesign = z.infer<typeof deDesignPayloadSchema>;
type ParsedExpressionContract = z.infer<typeof expressionContractPayloadSchema>;
type ParsedOutputs = z.infer<typeof deOutputsPayloadSchema>;

type ContractResult<T> = {
  status: 'ready' | 'needs_completion';
  validationFingerprint: string;
  checks: Array<{ id: string; status: 'passed' | 'failed'; message: string }>;
  nextActions: BioNextAction[];
  value?: T;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)])
  );
};

const fingerprint = (value: unknown): string =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');

const resolveProjectFile = (projectRoot: string, candidate: string): { path?: string; issue?: string } => {
  if (path.isAbsolute(candidate)) return { issue: `Path must be project-relative: ${candidate}` };
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    return { issue: `Path escapes project root: ${candidate}` };
  if (!fs.existsSync(resolved)) return { issue: `Required file is missing: ${candidate}` };
  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(resolved);
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    return { issue: `Path resolves outside project root: ${candidate}` };
  }
  if (!fs.statSync(realFile).isFile()) return { issue: `Required path is not a file: ${candidate}` };
  return { path: realFile };
};

const schemaNextAction = (action: string, reason: string, payload: Record<string, unknown>): BioNextAction => ({
  id: `correct-${action}-payload`,
  tool: 'bio_statistics',
  action,
  reason,
  payload,
});

const finiteJson = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteJson);
  if (!value || typeof value !== 'object') return true;
  return Object.values(value as Record<string, unknown>).every(finiteJson);
};

const inspectMarkerTable = (
  projectRoot: string,
  marker: ParsedExpressionContract['markerTable']
): { totalRows: number; finiteEffectRows: number; issue?: string } => {
  if (!marker) return { totalRows: 0, finiteEffectRows: 0 };
  const resolved = resolveProjectFile(projectRoot, marker.path);
  if (!resolved.path) return { totalRows: 0, finiteEffectRows: 0, issue: resolved.issue };
  const lines = fs.readFileSync(resolved.path, 'utf8').split(/\r?\n/u).filter(Boolean);
  if (lines.length < 2) return { totalRows: 0, finiteEffectRows: 0, issue: 'Marker table has no data rows.' };
  const header = lines[0].split('\t');
  const requiredColumns = [marker.effectSizeColumn, marker.adjustedPValueColumn, ...marker.detectionFractionColumns];
  const missing = requiredColumns.filter((column) => !header.includes(column));
  if (missing.length) {
    return {
      totalRows: lines.length - 1,
      finiteEffectRows: 0,
      issue: `Marker table is missing columns: ${missing.join(', ')}`,
    };
  }
  const effectIndex = header.indexOf(marker.effectSizeColumn);
  const requiredIndexes = requiredColumns.map((column) => header.indexOf(column));
  let finiteEffectRows = 0;
  for (const line of lines.slice(1)) {
    const fields = line.split('\t');
    const effectValue = fields[effectIndex]?.trim();
    const requiredValuesAreFinite = requiredIndexes.every((index) => {
      const raw = fields[index]?.trim();
      return Boolean(raw) && Number.isFinite(Number(raw));
    });
    if (effectValue && requiredValuesAreFinite) finiteEffectRows += 1;
  }
  return { totalRows: lines.length - 1, finiteEffectRows };
};

export const validateExpressionContract = (
  projectRoot: string,
  payload: unknown
): ContractResult<ParsedExpressionContract> => {
  const parsed = expressionContractPayloadSchema.safeParse(payload);
  const validationFingerprint = fingerprint(payload);
  if (!parsed.success) {
    return {
      status: 'needs_completion',
      validationFingerprint,
      checks: [{ id: 'schema', status: 'failed', message: parsed.error.message }],
      nextActions: [
        schemaNextAction('validate_expression_contract', parsed.error.message, {
          counts: { location: 'layers[counts]', semantics: 'raw_integer_counts', integerValues: true },
          logNormalized: { location: 'layers[lognorm]', transformation: 'library_size_normalize_then_log1p' },
          analysisMatrix: { location: 'X', semantics: 'log_normalized' },
        }),
      ],
    };
  }

  const value = parsed.data;
  const checks: ContractResult<ParsedExpressionContract>['checks'] = [];
  const issues: string[] = [];
  const check = (id: string, passed: boolean, message: string): void => {
    checks.push({ id, status: passed ? 'passed' : 'failed', message });
    if (!passed) issues.push(message);
  };
  check('integer-counts', value.counts.integerValues, 'The counts layer must contain raw integer counts.');
  check(
    'analysis-matrix',
    value.analysisMatrix.semantics !== 'raw_counts',
    'The analysis matrix cannot expose raw counts as normalized expression.'
  );
  check(
    'scaled-separation',
    value.analysisMatrix.semantics !== 'scaled' ||
      (value.scaled?.location === value.analysisMatrix.location && value.scaled.genes === 'hvg_only'),
    'Scaled expression must be an explicitly declared HVG-only representation.'
  );
  check('raw-documented', !value.raw || value.raw.documented, 'adata.raw semantics must be documented.');

  if (value.markerTable) {
    check(
      'marker-layer',
      value.markerTable.sourceLayer === value.logNormalized.location,
      'Cluster markers must use the declared log-normalized expression layer.'
    );
    const markerInspection = inspectMarkerTable(projectRoot, value.markerTable);
    const finiteFraction = markerInspection.totalRows
      ? markerInspection.finiteEffectRows / markerInspection.totalRows
      : 0;
    check(
      'marker-table',
      !markerInspection.issue && finiteFraction >= 0.95,
      markerInspection.issue ||
        `Marker effect sizes, adjusted p-values, and detection fractions must be finite for at least 95% of rows; observed ${(finiteFraction * 100).toFixed(1)}%.`
    );
  }

  for (const plot of value.plots || []) {
    check(
      `plot-${plot.id}`,
      plot.sourceLayer !== value.counts.location && plot.transformation !== 'raw_counts',
      `Plot ${plot.id} must not present raw counts as normalized expression.`
    );
  }

  return {
    status: issues.length ? 'needs_completion' : 'ready',
    validationFingerprint,
    checks,
    nextActions: issues.length ? [schemaNextAction('validate_expression_contract', issues.join(' '), value)] : [],
    value,
  };
};

const effectiveContrast = (
  design: ParsedDesign,
  contrast: ParsedDesign['contrasts'][number]
): BioStatisticsDesignContrast => {
  const warnings: string[] = [];
  const eligible = design.samples.filter(
    (sample) => sample.eligible !== false && sample.cellType === contrast.cellType
  );
  const targetAll = new Set(
    eligible.filter((sample) => sample.condition === contrast.target).map((sample) => sample.biologicalReplicate)
  );
  const referenceAll = new Set(
    eligible.filter((sample) => sample.condition === contrast.reference).map((sample) => sample.biologicalReplicate)
  );
  let targetReplicates = targetAll.size;
  let referenceReplicates = referenceAll.size;
  let completePairs: number | undefined;

  if (design.pairedBy) {
    const pairs = new Map<string, Set<string>>();
    for (const sample of eligible) {
      if (!sample.pairId) continue;
      const conditions = pairs.get(sample.pairId) || new Set<string>();
      conditions.add(sample.condition);
      pairs.set(sample.pairId, conditions);
    }
    completePairs = [...pairs.values()].filter(
      (conditions) => conditions.has(contrast.target) && conditions.has(contrast.reference)
    ).length;
    targetReplicates = completePairs;
    referenceReplicates = completePairs;
  }

  const sufficient = targetReplicates >= MINIMUM_REPLICATES && referenceReplicates >= MINIMUM_REPLICATES;
  if (targetReplicates === MINIMUM_REPLICATES || referenceReplicates === MINIMUM_REPLICATES) {
    warnings.push(
      'Exactly three effective biological replicates are available; interpret power and dispersion estimates cautiously.'
    );
  }
  if (!sufficient) {
    warnings.push(
      design.pairedBy
        ? `At least ${MINIMUM_REPLICATES} complete pairs are required.`
        : `At least ${MINIMUM_REPLICATES} independent biological replicates per group are required.`
    );
  }
  return {
    id: contrast.id,
    target: contrast.target,
    reference: contrast.reference,
    cellType: contrast.cellType,
    targetReplicates,
    referenceReplicates,
    ...(completePairs == null ? {} : { completePairs }),
    status: sufficient ? 'ready' : 'blocked',
    warnings,
  };
};

export const validateDeDesign = (
  projectRoot: string,
  payload: unknown
): ContractResult<ParsedDesign> & {
  contrasts?: BioStatisticsDesignContrast[];
} => {
  const parsed = deDesignPayloadSchema.safeParse(payload);
  const validationFingerprint = fingerprint(payload);
  if (!parsed.success) {
    return {
      status: 'needs_completion',
      validationFingerprint,
      checks: [{ id: 'schema', status: 'failed', message: parsed.error.message }],
      nextActions: [schemaNextAction('validate_de_design', parsed.error.message, {})],
    };
  }

  const value = parsed.data;
  const checks: ContractResult<ParsedDesign>['checks'] = [];
  const issues: string[] = [];
  const check = (id: string, passed: boolean, message: string): void => {
    checks.push({ id, status: passed ? 'passed' : 'failed', message });
    if (!passed) issues.push(message);
  };
  const countPath = resolveProjectFile(projectRoot, value.countMatrix.path);
  check('count-matrix-path', Boolean(countPath.path), countPath.issue || 'Pseudobulk count matrix is project-local.');
  check('integer-counts', value.countMatrix.integerCounts, 'edgeR requires raw integer pseudobulk counts.');
  check(
    'formula-match',
    value.formula === value.executedFormula,
    'Declared and executed model formulas must match exactly.'
  );
  check(
    'condition-term',
    value.formula.includes(value.conditionColumn),
    `Model formula must include the condition column ${value.conditionColumn}.`
  );
  check(
    'full-rank',
    value.designMatrix.rank === value.designMatrix.columns.length && value.designMatrix.confounded !== true,
    'The model matrix must be full rank and not confounded.'
  );
  if (value.pairedBy) {
    check('pair-term', value.formula.includes(value.pairedBy), `Paired design formula must include ${value.pairedBy}.`);
  }

  const replicateConditions = new Map<string, Set<string>>();
  for (const sample of value.samples.filter((item) => item.eligible !== false)) {
    const conditions = replicateConditions.get(sample.biologicalReplicate) || new Set<string>();
    conditions.add(sample.condition);
    replicateConditions.set(sample.biologicalReplicate, conditions);
  }
  const reusedAcrossConditions = [...replicateConditions.entries()]
    .filter(([, conditions]) => conditions.size > 1 && !value.pairedBy)
    .map(([replicate]) => replicate);
  check(
    'replicate-independence',
    reusedAcrossConditions.length === 0,
    reusedAcrossConditions.length
      ? `Unpaired replicate IDs occur in multiple conditions: ${reusedAcrossConditions.join(', ')}`
      : 'Unpaired biological replicate IDs are condition-specific.'
  );

  const contrasts = value.contrasts.map((contrast) => effectiveContrast(value, contrast));
  return {
    status: issues.length ? 'needs_completion' : 'ready',
    validationFingerprint,
    checks,
    nextActions: issues.length ? [schemaNextAction('validate_de_design', issues.join(' '), value)] : [],
    value,
    contrasts,
  };
};

const requiredOutputPaths = (files: ParsedOutputs['files']): string[] => [
  files.sampleInclusion,
  files.designMatrix,
  files.librarySizes,
  files.normalizationFactors,
  files.dispersionDiagnostics,
  ...files.deTables,
  files.executionLog,
];

export const validateDeOutputs = (
  projectRoot: string,
  payload: unknown
): ContractResult<ParsedOutputs> & {
  canonicalFiles?: Array<{ path: string; contentHash: string }>;
} => {
  const parsed = deOutputsPayloadSchema.safeParse(payload);
  const validationFingerprint = fingerprint(payload);
  if (!parsed.success) {
    return {
      status: 'needs_completion',
      validationFingerprint,
      checks: [{ id: 'schema', status: 'failed', message: parsed.error.message }],
      nextActions: [schemaNextAction('validate_de_outputs', parsed.error.message, {})],
    };
  }

  const value = parsed.data;
  const checks: ContractResult<ParsedOutputs>['checks'] = [];
  const issues: string[] = [];
  const canonicalFiles: Array<{ path: string; contentHash: string }> = [];
  const check = (id: string, passed: boolean, message: string): void => {
    checks.push({ id, status: passed ? 'passed' : 'failed', message });
    if (!passed) issues.push(message);
  };
  check(
    'formula-match',
    value.executedFormula === value.designReceipt.formula,
    'The output formula must match the validated design receipt.'
  );
  check(
    'design-receipt-ready',
    value.designReceipt.status === 'ready' && value.designReceipt.nextActions.length === 0,
    'The differential-expression design receipt must be ready with no remaining nextActions.'
  );

  const designContrasts = new Map(
    (value.designReceipt.contrasts as BioStatisticsDesignContrast[]).map((contrast) => [contrast.id, contrast])
  );
  const outputContrastIds = new Set(value.contrasts.map((contrast) => contrast.id));
  check(
    'contrast-coverage',
    [...designContrasts.keys()].every((id) => outputContrastIds.has(id)),
    'Every validated design contrast must have an explicit tested, blocked, or failed output status.'
  );
  for (const contrast of value.contrasts) {
    const design = designContrasts.get(contrast.id);
    const effective = Object.values(contrast.effectiveReplicates);
    const minimum = effective.length ? Math.min(...effective) : 0;
    const validStatus = contrast.status !== 'tested' || (design?.status === 'ready' && minimum >= MINIMUM_REPLICATES);
    check(
      `contrast-${contrast.id}`,
      validStatus,
      `Contrast ${contrast.id} cannot be tested without a ready design and at least ${MINIMUM_REPLICATES} effective replicates.`
    );
  }

  for (const candidate of requiredOutputPaths(value.files)) {
    const resolved = resolveProjectFile(projectRoot, candidate);
    if (!resolved.path) {
      check(`file-${candidate}`, false, resolved.issue || `Missing output ${candidate}.`);
      continue;
    }
    const stat = fs.statSync(resolved.path);
    check(`readable-${candidate}`, (stat.mode & 0o444) !== 0, `Output must be host-readable: ${candidate}`);
    if (candidate.toLowerCase().endsWith('.json')) {
      try {
        const json = JSON.parse(fs.readFileSync(resolved.path, 'utf8')) as unknown;
        check(`json-${candidate}`, finiteJson(json), `JSON output contains a non-finite numeric value: ${candidate}`);
      } catch {
        check(`json-${candidate}`, false, `JSON output is malformed: ${candidate}`);
      }
    }
    canonicalFiles.push({
      path: candidate,
      contentHash: crypto.createHash('sha256').update(fs.readFileSync(resolved.path)).digest('hex'),
    });
  }

  return {
    status: issues.length ? 'needs_completion' : 'ready',
    validationFingerprint,
    checks,
    nextActions: issues.length ? [schemaNextAction('validate_de_outputs', issues.join(' '), value)] : [],
    value,
    canonicalFiles,
  };
};

export const buildDesignReceipt = (
  base: BioControlReceipt,
  design: ParsedDesign,
  contrasts: BioStatisticsDesignContrast[],
  nextActions: BioNextAction[]
): BioStatisticsDesignReceipt => ({
  ...base,
  producer: 'bio_statistics',
  action: 'validate_de_design',
  analysisKind: 'pseudobulk_de',
  replicateUnit: design.replicateUnit,
  ...(design.pairedBy ? { pairedBy: design.pairedBy } : {}),
  formula: design.formula,
  minimumReplicates: MINIMUM_REPLICATES,
  contrasts,
  nextActions,
});

export const buildCompletionReceipt = (
  base: BioControlReceipt,
  output: ParsedOutputs,
  canonicalFiles: Array<{ path: string; contentHash: string }>,
  nextActions: BioNextAction[]
): BioStatisticsCompletionReceipt => {
  const receipt = {
    ...base,
    producer: 'bio_statistics' as const,
    action: 'validate_de_outputs' as const,
    workflowKind: 'omics_reproduction' as const,
    workflowPhase: 'execution' as const,
    planningReceiptId: output.planningReceiptId,
    designReceiptId: output.designReceipt.receiptId,
    package: 'edgeR' as const,
    packageVersion: output.package.version,
    contrasts: output.contrasts as Array<{
      id: string;
      target: string;
      reference: string;
      coefficient: string;
      status: BioStatisticsContrastStatus;
      effectiveReplicates: Record<string, number>;
      warnings: string[];
    }>,
    canonicalFiles,
    skillUses: output.skillUses as unknown as BioStatisticsCompletionReceipt['skillUses'],
    mcpActions: output.mcpActions,
    nextActions,
    externalBlockers: (output.externalBlockers || []) as BioBlocker[],
  };
  return statisticsCompletionReceiptSchema.parse(receipt) as BioStatisticsCompletionReceipt;
};
