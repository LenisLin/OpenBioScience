import { z } from 'zod';

export const BENCHMARK_PLAN_SCHEMA = 'openbioscience.bio_benchmark.plan.v1' as const;
export const BENCHMARK_STATE_SCHEMA = 'openbioscience.bio_benchmark.state.v1' as const;
export const BENCHMARK_INPUT_FREEZE_SCHEMA = 'openbioscience.bio_benchmark.input_freeze.v1' as const;
export const BENCHMARK_PREDICTION_FREEZE_SCHEMA = 'openbioscience.bio_benchmark.prediction_freeze.v1' as const;
export const BENCHMARK_REVEAL_SCHEMA = 'openbioscience.bio_benchmark.reveal.v1' as const;
export const BENCHMARK_METRIC_RECORD_SCHEMA = 'openbioscience.bio_benchmark.metric_record.v1' as const;

export const benchmarkIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u, 'Expected a safe identifier of at most 80 characters.');
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, 'Expected a lowercase SHA-256 hash.');
const timestampSchema = z.number().int().nonnegative();
const scalarSchema = z.union([z.number().finite(), z.string().min(1), z.boolean()]);

const uniqueBy = <T>(items: T[], key: (item: T) => string): boolean => {
  const values = items.map(key);
  return new Set(values).size === values.length;
};

export const benchmarkProvenanceSchema = z
  .object({
    sourceId: benchmarkIdSchema,
    kind: z.enum(['dataset', 'structure', 'model', 'script', 'environment', 'other']),
    checksum: sha256Schema,
    uri: z.string().min(1).optional(),
    citation: z.string().min(1).optional(),
    license: z.string().min(1).optional(),
    retrievedAt: timestampSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.uri || value.citation), 'Provenance requires a URI or citation.');

export const benchmarkMetricSpecSchema = z
  .object({
    name: benchmarkIdSchema,
    direction: z.enum(['higher_is_better', 'lower_is_better', 'descriptive']),
    unit: z.string().min(1).optional(),
    required: z.boolean().default(true),
  })
  .strict();

const benchmarkPlanObjectSchema = z
  .object({
    schema: z.literal(BENCHMARK_PLAN_SCHEMA),
    benchmarkId: benchmarkIdSchema,
    title: z.string().min(1).max(200),
    kind: z.enum(['variant_structure_mapping', 'interface_ddg', 'sequence_recovery', 'generic']),
    objective: z.string().min(1),
    outputRoot: z.string().min(1),
    blindProtocol: z
      .object({
        unitIdField: benchmarkIdSchema,
        hiddenFields: z.array(benchmarkIdSchema).min(1),
        revealSourceId: benchmarkIdSchema,
        leakageControls: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    expectedMetrics: z.array(benchmarkMetricSpecSchema).min(1),
    createdAt: timestampSchema,
  })
  .strict();

const validatePlan = (value: z.infer<typeof benchmarkPlanObjectSchema>, context: z.RefinementCtx): void => {
  if (!uniqueBy(value.expectedMetrics, (metric) => metric.name)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedMetrics'],
      message: 'Metric names must be unique.',
    });
  }
  if (new Set(value.blindProtocol.hiddenFields).size !== value.blindProtocol.hiddenFields.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blindProtocol', 'hiddenFields'],
      message: 'Hidden fields must be unique.',
    });
  }
};

export const benchmarkPlanDraftSchema = benchmarkPlanObjectSchema.superRefine(validatePlan);

export const benchmarkPlanArtifactSchema = benchmarkPlanObjectSchema
  .extend({ artifactHash: sha256Schema })
  .strict()
  .superRefine(validatePlan);

export const frozenInputFileSchema = z
  .object({
    inputId: benchmarkIdSchema,
    role: z.enum(['primary_data', 'structure', 'reference', 'configuration', 'other']),
    path: z.string().min(1),
    checksum: sha256Schema,
    sizeBytes: z.number().int().nonnegative(),
    provenance: z.array(benchmarkProvenanceSchema).min(1),
  })
  .strict();

export const frozenInputSchema = z
  .object({
    schema: z.literal(BENCHMARK_INPUT_FREEZE_SCHEMA),
    benchmarkId: benchmarkIdSchema,
    planHash: sha256Schema,
    frozenAt: timestampSchema,
    files: z.array(frozenInputFileSchema).min(1),
    artifactHash: sha256Schema,
  })
  .strict()
  .refine((value) => uniqueBy(value.files, (file) => file.inputId), {
    path: ['files'],
    message: 'Input IDs must be unique.',
  });

export const benchmarkModelSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    checkpointChecksum: sha256Schema.optional(),
    codeChecksum: sha256Schema,
    environmentChecksum: sha256Schema,
    parameterChecksum: sha256Schema,
  })
  .strict();

export const blindPredictionSchema = z
  .object({
    unitId: z.string().min(1),
    predictedValue: scalarSchema,
    predictedClass: z.string().min(1).optional(),
    rank: z.number().finite().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export const blindPredictionFreezeSchema = z
  .object({
    schema: z.literal(BENCHMARK_PREDICTION_FREEZE_SCHEMA),
    benchmarkId: benchmarkIdSchema,
    inputFreezeHash: sha256Schema,
    frozenAt: timestampSchema,
    model: benchmarkModelSchema,
    seeds: z.array(z.number().int().nonnegative()).min(1),
    predictions: z.array(blindPredictionSchema).min(1),
    artifactHash: sha256Schema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.seeds).size !== value.seeds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['seeds'], message: 'Seeds must be unique.' });
    }
    if (!uniqueBy(value.predictions, (prediction) => prediction.unitId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['predictions'],
        message: 'Prediction unit IDs must be unique.',
      });
    }
  });

export const benchmarkTruthSchema = z
  .object({
    unitId: z.string().min(1),
    observedValue: scalarSchema,
    observedClass: z.string().min(1).optional(),
  })
  .strict();

export const benchmarkRevealSchema = z
  .object({
    schema: z.literal(BENCHMARK_REVEAL_SCHEMA),
    benchmarkId: benchmarkIdSchema,
    predictionFreezeHash: sha256Schema,
    revealedAt: timestampSchema,
    source: benchmarkProvenanceSchema,
    truth: z.array(benchmarkTruthSchema).min(1),
    artifactHash: sha256Schema,
  })
  .strict()
  .refine((value) => uniqueBy(value.truth, (truth) => truth.unitId), {
    path: ['truth'],
    message: 'Truth unit IDs must be unique.',
  });

export const benchmarkMetricValueSchema = z
  .object({
    name: benchmarkIdSchema,
    value: z.number().finite(),
    direction: z.enum(['higher_is_better', 'lower_is_better', 'descriptive']),
    unit: z.string().min(1).optional(),
    sampleSize: z.number().int().positive(),
  })
  .strict();

export const benchmarkMetricRecordSchema = z
  .object({
    schema: z.literal(BENCHMARK_METRIC_RECORD_SCHEMA),
    benchmarkId: benchmarkIdSchema,
    predictionFreezeHash: sha256Schema,
    revealHash: sha256Schema,
    recordedAt: timestampSchema,
    metrics: z.array(benchmarkMetricValueSchema).min(1),
    artifactHash: sha256Schema,
  })
  .strict()
  .refine((value) => uniqueBy(value.metrics, (metric) => metric.name), {
    path: ['metrics'],
    message: 'Metric names must be unique.',
  });

export const benchmarkStatusSchema = z.enum([
  'planned',
  'inputs_frozen',
  'predictions_frozen',
  'revealed',
  'evaluated',
  'completed',
]);

export const benchmarkStateSchema = z
  .object({
    schema: z.literal(BENCHMARK_STATE_SCHEMA),
    benchmarkId: benchmarkIdSchema,
    status: benchmarkStatusSchema,
    revision: z.number().int().nonnegative(),
    plan: benchmarkPlanArtifactSchema,
    inputFreeze: frozenInputSchema.optional(),
    predictionFreeze: blindPredictionFreezeSchema.optional(),
    reveal: benchmarkRevealSchema.optional(),
    metricRecord: benchmarkMetricRecordSchema.optional(),
    completedAt: timestampSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    type OptionalArtifactKey = 'inputFreeze' | 'predictionFreeze' | 'reveal' | 'metricRecord' | 'completedAt';
    const requiredByStatus: Record<z.infer<typeof benchmarkStatusSchema>, OptionalArtifactKey[]> = {
      planned: [],
      inputs_frozen: ['inputFreeze'],
      predictions_frozen: ['inputFreeze', 'predictionFreeze'],
      revealed: ['inputFreeze', 'predictionFreeze', 'reveal'],
      evaluated: ['inputFreeze', 'predictionFreeze', 'reveal', 'metricRecord'],
      completed: ['inputFreeze', 'predictionFreeze', 'reveal', 'metricRecord', 'completedAt'],
    };
    for (const key of requiredByStatus[value.status]) {
      if (value[key] == null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required for status ${value.status}.`,
        });
      }
    }
    const allowed = new Set(requiredByStatus[value.status]);
    const artifactKeys: OptionalArtifactKey[] = [
      'inputFreeze',
      'predictionFreeze',
      'reveal',
      'metricRecord',
      'completedAt',
    ];
    for (const key of artifactKeys) {
      if (!allowed.has(key) && value[key] != null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is not allowed for status ${value.status}.`,
        });
      }
    }
  });

export type BenchmarkPlanDraft = z.infer<typeof benchmarkPlanDraftSchema>;
export type BenchmarkPlanArtifact = z.infer<typeof benchmarkPlanArtifactSchema>;
export type FrozenInput = z.infer<typeof frozenInputSchema>;
export type BlindPredictionFreeze = z.infer<typeof blindPredictionFreezeSchema>;
export type BenchmarkReveal = z.infer<typeof benchmarkRevealSchema>;
export type BenchmarkMetricRecord = z.infer<typeof benchmarkMetricRecordSchema>;
export type BenchmarkState = z.infer<typeof benchmarkStateSchema>;
export type BenchmarkStatus = z.infer<typeof benchmarkStatusSchema>;
