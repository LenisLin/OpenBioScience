import { z } from 'zod';

import {
  BENCHMARK_INPUT_FREEZE_SCHEMA,
  BENCHMARK_METRIC_RECORD_SCHEMA,
  BENCHMARK_PREDICTION_FREEZE_SCHEMA,
  BENCHMARK_REVEAL_SCHEMA,
  benchmarkIdSchema,
  benchmarkMetricValueSchema,
  benchmarkModelSchema,
  benchmarkPlanDraftSchema,
  benchmarkProvenanceSchema,
  benchmarkTruthSchema,
  blindPredictionSchema,
  frozenInputFileSchema,
  sha256Schema,
} from './contracts';

const revisionSchema = z.number().int().nonnegative();
const timestampSchema = z.number().int().nonnegative();

const createPlanActionSchema = z.object({ action: z.literal('create_plan'), plan: benchmarkPlanDraftSchema }).strict();

const freezeInputsActionSchema = z
  .object({
    action: z.literal('freeze_inputs'),
    benchmarkId: benchmarkIdSchema,
    expectedRevision: revisionSchema,
    planHash: sha256Schema,
    frozenAt: timestampSchema,
    files: z.array(frozenInputFileSchema).min(1),
  })
  .strict();

const freezePredictionsActionSchema = z
  .object({
    action: z.literal('freeze_blind_predictions'),
    benchmarkId: benchmarkIdSchema,
    expectedRevision: revisionSchema,
    inputFreezeHash: sha256Schema,
    frozenAt: timestampSchema,
    model: benchmarkModelSchema,
    seeds: z.array(z.number().int().nonnegative()).min(1),
    predictions: z.array(blindPredictionSchema).min(1),
  })
  .strict();

const revealActionSchema = z
  .object({
    action: z.literal('reveal'),
    benchmarkId: benchmarkIdSchema,
    expectedRevision: revisionSchema,
    predictionFreezeHash: sha256Schema,
    revealedAt: timestampSchema,
    source: benchmarkProvenanceSchema,
    truth: z.array(benchmarkTruthSchema).min(1),
  })
  .strict();

const recordMetricsActionSchema = z
  .object({
    action: z.literal('record_metrics'),
    benchmarkId: benchmarkIdSchema,
    expectedRevision: revisionSchema,
    predictionFreezeHash: sha256Schema,
    revealHash: sha256Schema,
    recordedAt: timestampSchema,
    metrics: z.array(benchmarkMetricValueSchema).min(1),
  })
  .strict();

const completeActionSchema = z
  .object({
    action: z.literal('complete'),
    benchmarkId: benchmarkIdSchema,
    expectedRevision: revisionSchema,
    metricRecordHash: sha256Schema,
    completedAt: timestampSchema,
  })
  .strict();

export const benchmarkActionSchema = z.discriminatedUnion('action', [
  createPlanActionSchema,
  freezeInputsActionSchema,
  freezePredictionsActionSchema,
  revealActionSchema,
  recordMetricsActionSchema,
  completeActionSchema,
]);

export type BenchmarkAction = z.infer<typeof benchmarkActionSchema>;

export const BENCHMARK_ACTION_CONTRACT = {
  create_plan: { allowedFrom: ['none'], produces: 'planned' },
  freeze_inputs: { allowedFrom: ['planned'], produces: 'inputs_frozen', artifactSchema: BENCHMARK_INPUT_FREEZE_SCHEMA },
  freeze_blind_predictions: {
    allowedFrom: ['inputs_frozen'],
    produces: 'predictions_frozen',
    artifactSchema: BENCHMARK_PREDICTION_FREEZE_SCHEMA,
  },
  reveal: { allowedFrom: ['predictions_frozen'], produces: 'revealed', artifactSchema: BENCHMARK_REVEAL_SCHEMA },
  record_metrics: { allowedFrom: ['revealed'], produces: 'evaluated', artifactSchema: BENCHMARK_METRIC_RECORD_SCHEMA },
  complete: { allowedFrom: ['evaluated'], produces: 'completed' },
} as const;
