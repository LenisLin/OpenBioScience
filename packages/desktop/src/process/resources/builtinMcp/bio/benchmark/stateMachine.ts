import {
  BENCHMARK_INPUT_FREEZE_SCHEMA,
  BENCHMARK_METRIC_RECORD_SCHEMA,
  BENCHMARK_PREDICTION_FREEZE_SCHEMA,
  BENCHMARK_REVEAL_SCHEMA,
  BENCHMARK_STATE_SCHEMA,
  benchmarkMetricRecordSchema,
  benchmarkPlanArtifactSchema,
  benchmarkRevealSchema,
  benchmarkStateSchema,
  blindPredictionFreezeSchema,
  frozenInputSchema,
  type BenchmarkState,
  type BenchmarkStatus,
} from './contracts';
import { benchmarkActionSchema, type BenchmarkAction } from './actions';
import { benchmarkFingerprint, verifyArtifactHash } from './fingerprint';
import { normalizeBenchmarkRelativePath } from './pathSafety';

type BenchmarkArtifact = { artifactHash: string; benchmarkId: string };
type StatefulBenchmarkAction = { action?: string; benchmarkId?: string; expectedRevision?: number };

const isBenchmarkArtifact = (artifact: unknown): artifact is BenchmarkArtifact =>
  Boolean(
    artifact &&
      typeof artifact === 'object' &&
      typeof (artifact as Partial<BenchmarkArtifact>).artifactHash === 'string' &&
      typeof (artifact as Partial<BenchmarkArtifact>).benchmarkId === 'string'
  );

const assertStateIntegrity = (state: BenchmarkState): void => {
  benchmarkStateSchema.parse(state);
  const artifacts = [state.plan, state.inputFreeze, state.predictionFreeze, state.reveal, state.metricRecord].filter(
    isBenchmarkArtifact
  );
  if (artifacts.some((artifact) => !verifyArtifactHash(artifact))) {
    throw new Error('Benchmark state contains a stale artifact hash.');
  }
  if (artifacts.some((artifact) => artifact.benchmarkId !== state.benchmarkId)) {
    throw new Error('Benchmark state contains an artifact from another benchmark.');
  }
  if (state.inputFreeze && state.inputFreeze.planHash !== state.plan.artifactHash) {
    throw new Error('Benchmark input freeze does not reference the current plan.');
  }
  if (state.predictionFreeze && state.predictionFreeze.inputFreezeHash !== state.inputFreeze?.artifactHash) {
    throw new Error('Benchmark prediction freeze does not reference the current input freeze.');
  }
  if (state.reveal && state.reveal.predictionFreezeHash !== state.predictionFreeze?.artifactHash) {
    throw new Error('Benchmark reveal does not reference the current prediction freeze.');
  }
  if (
    state.metricRecord &&
    (state.metricRecord.predictionFreezeHash !== state.predictionFreeze?.artifactHash ||
      state.metricRecord.revealHash !== state.reveal?.artifactHash)
  ) {
    throw new Error('Benchmark metric record does not reference the current prediction freeze and reveal.');
  }
};

const assertTransition = (
  state: BenchmarkState,
  action: StatefulBenchmarkAction,
  expected: BenchmarkStatus
): void => {
  if (state.status !== expected) {
    throw new Error(`Action ${action.action} requires status ${expected}; received ${state.status}.`);
  }
  if (action.benchmarkId !== state.benchmarkId) throw new Error('Action belongs to another benchmark.');
  if (action.expectedRevision !== state.revision) throw new Error('Action expectedRevision is stale.');
};

const withArtifactHash = <T extends object>(artifact: T): T & { artifactHash: string } => ({
  ...artifact,
  artifactHash: benchmarkFingerprint(artifact),
});

const sameUnitIds = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
};

const applyParsedAction = (state: BenchmarkState | undefined, action: BenchmarkAction): BenchmarkState => {
  if (action.action === 'create_plan') {
    if (state) throw new Error('create_plan requires no existing benchmark state.');
    normalizeBenchmarkRelativePath(action.plan.outputRoot);
    const plan = benchmarkPlanArtifactSchema.parse(withArtifactHash(action.plan));
    return {
      schema: BENCHMARK_STATE_SCHEMA,
      benchmarkId: plan.benchmarkId,
      status: 'planned',
      revision: 0,
      plan,
    };
  }
  if (!state) throw new Error(`Action ${action.action} requires an existing benchmark state.`);
  assertStateIntegrity(state);

  if (action.action === 'freeze_inputs') {
    assertTransition(state, action, 'planned');
    if (action.planHash !== state.plan.artifactHash) {
      throw new Error('planHash does not match the frozen benchmark plan.');
    }
    if (action.frozenAt < state.plan.createdAt) throw new Error('Inputs cannot be frozen before the benchmark plan.');
    action.files.forEach((file) => normalizeBenchmarkRelativePath(file.path));
    const inputFreeze = frozenInputSchema.parse(
      withArtifactHash({
        schema: BENCHMARK_INPUT_FREEZE_SCHEMA,
        benchmarkId: state.benchmarkId,
        planHash: action.planHash,
        frozenAt: action.frozenAt,
        files: action.files,
      })
    );
    return { ...state, status: 'inputs_frozen', revision: state.revision + 1, inputFreeze };
  }

  if (action.action === 'freeze_blind_predictions') {
    assertTransition(state, action, 'inputs_frozen');
    const inputFreeze = state.inputFreeze;
    if (!inputFreeze || action.inputFreezeHash !== inputFreeze.artifactHash) {
      throw new Error('inputFreezeHash does not match the frozen benchmark inputs.');
    }
    if (action.frozenAt < inputFreeze.frozenAt) {
      throw new Error('Predictions cannot be frozen before benchmark inputs.');
    }
    const predictionFreeze = blindPredictionFreezeSchema.parse(
      withArtifactHash({
        schema: BENCHMARK_PREDICTION_FREEZE_SCHEMA,
        benchmarkId: state.benchmarkId,
        inputFreezeHash: action.inputFreezeHash,
        frozenAt: action.frozenAt,
        model: action.model,
        seeds: action.seeds,
        predictions: action.predictions,
      })
    );
    return { ...state, status: 'predictions_frozen', revision: state.revision + 1, predictionFreeze };
  }

  if (action.action === 'reveal') {
    assertTransition(state, action, 'predictions_frozen');
    const predictionFreeze = state.predictionFreeze;
    if (!predictionFreeze || action.predictionFreezeHash !== predictionFreeze.artifactHash) {
      throw new Error('predictionFreezeHash does not match the blind prediction freeze.');
    }
    if (action.revealedAt < predictionFreeze.frozenAt) {
      throw new Error('Truth cannot be revealed before predictions freeze.');
    }
    if (action.source.sourceId !== state.plan.blindProtocol.revealSourceId) {
      throw new Error('Reveal source does not match the benchmark plan.');
    }
    const predictionIds = predictionFreeze.predictions.map((prediction) => prediction.unitId);
    const truthIds = action.truth.map((truth) => truth.unitId);
    if (!sameUnitIds(predictionIds, truthIds)) {
      throw new Error('Reveal truth must cover exactly the frozen prediction unit IDs.');
    }
    const reveal = benchmarkRevealSchema.parse(
      withArtifactHash({
        schema: BENCHMARK_REVEAL_SCHEMA,
        benchmarkId: state.benchmarkId,
        predictionFreezeHash: action.predictionFreezeHash,
        revealedAt: action.revealedAt,
        source: action.source,
        truth: action.truth,
      })
    );
    return { ...state, status: 'revealed', revision: state.revision + 1, reveal };
  }

  if (action.action === 'record_metrics') {
    assertTransition(state, action, 'revealed');
    const predictionFreeze = state.predictionFreeze;
    const reveal = state.reveal;
    if (!predictionFreeze || action.predictionFreezeHash !== predictionFreeze.artifactHash) {
      throw new Error('predictionFreezeHash does not match the blind prediction freeze.');
    }
    if (!reveal || action.revealHash !== reveal.artifactHash) {
      throw new Error('revealHash does not match the frozen reveal.');
    }
    if (action.recordedAt < reveal.revealedAt) throw new Error('Metrics cannot be recorded before truth reveal.');
    if (action.metrics.some((metric) => metric.sampleSize > reveal.truth.length)) {
      throw new Error('Metric sampleSize cannot exceed the revealed truth set.');
    }
    const metrics = new Map(action.metrics.map((metric) => [metric.name, metric]));
    for (const expected of state.plan.expectedMetrics.filter((metric) => metric.required)) {
      const actual = metrics.get(expected.name);
      if (!actual) throw new Error(`Required metric is missing: ${expected.name}.`);
      if (actual.direction !== expected.direction || actual.unit !== expected.unit) {
        throw new Error(`Metric contract does not match the plan: ${expected.name}.`);
      }
    }
    const metricRecord = benchmarkMetricRecordSchema.parse(
      withArtifactHash({
        schema: BENCHMARK_METRIC_RECORD_SCHEMA,
        benchmarkId: state.benchmarkId,
        predictionFreezeHash: action.predictionFreezeHash,
        revealHash: action.revealHash,
        recordedAt: action.recordedAt,
        metrics: action.metrics,
      })
    );
    return { ...state, status: 'evaluated', revision: state.revision + 1, metricRecord };
  }

  assertTransition(state, action, 'evaluated');
  const metricRecord = state.metricRecord;
  if (!metricRecord || action.metricRecordHash !== metricRecord.artifactHash) {
    throw new Error('metricRecordHash does not match the frozen metric record.');
  }
  if (action.completedAt < metricRecord.recordedAt) {
    throw new Error('Benchmark cannot complete before metrics are recorded.');
  }
  return { ...state, status: 'completed', revision: state.revision + 1, completedAt: action.completedAt };
};

export const applyBenchmarkAction = (state: BenchmarkState | undefined, action: unknown): BenchmarkState =>
  benchmarkStateSchema.parse(applyParsedAction(state, benchmarkActionSchema.parse(action)));
