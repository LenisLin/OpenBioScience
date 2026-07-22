import { describe, expect, it } from 'vitest';

import {
  BENCHMARK_PLAN_SCHEMA,
  applyBenchmarkAction,
  type BenchmarkState,
} from '@/process/resources/builtinMcp/bio/benchmark';

const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

const createPlan = () =>
  applyBenchmarkAction(undefined, {
    action: 'create_plan',
    plan: {
      schema: BENCHMARK_PLAN_SCHEMA,
      benchmarkId: 'gfp-structure',
      title: 'GFP structure benchmark',
      kind: 'variant_structure_mapping',
      objective: 'Evaluate blind variant predictions.',
      outputRoot: 'benchmarks/gfp-structure',
      blindProtocol: {
        unitIdField: 'variant_id',
        hiddenFields: ['observed_score'],
        revealSourceId: 'protein-gym',
        leakageControls: ['Do not load observed scores before prediction freeze.'],
      },
      expectedMetrics: [{ name: 'spearman', direction: 'higher_is_better' }],
      createdAt: 1,
    },
  });

const freezeInputs = (state = createPlan()) =>
  applyBenchmarkAction(state, {
    action: 'freeze_inputs',
    benchmarkId: state.benchmarkId,
    expectedRevision: state.revision,
    planHash: state.plan.artifactHash,
    frozenAt: 2,
    files: [
      {
        inputId: 'structure',
        role: 'structure',
        path: 'inputs/1ema.cif',
        checksum: HASH,
        sizeBytes: 100,
        provenance: [
          {
            sourceId: 'rcsb-1ema',
            kind: 'structure',
            checksum: HASH,
            uri: 'https://www.rcsb.org/structure/1EMA',
          },
        ],
      },
    ],
  });

const freezePredictions = (state = freezeInputs()) =>
  applyBenchmarkAction(state, {
    action: 'freeze_blind_predictions',
    benchmarkId: state.benchmarkId,
    expectedRevision: state.revision,
    inputFreezeHash: state.inputFreeze?.artifactHash,
    frozenAt: 3,
    model: {
      name: 'structure-baseline',
      version: '1.0.0',
      codeChecksum: HASH,
      environmentChecksum: HASH,
      parameterChecksum: HASH,
    },
    seeds: [7],
    predictions: [
      { unitId: 'A1V', predictedValue: 0.2, rank: 2 },
      { unitId: 'G2D', predictedValue: 0.8, rank: 1 },
    ],
  });

const reveal = (state = freezePredictions()) =>
  applyBenchmarkAction(state, {
    action: 'reveal',
    benchmarkId: state.benchmarkId,
    expectedRevision: state.revision,
    predictionFreezeHash: state.predictionFreeze?.artifactHash,
    revealedAt: 4,
    source: {
      sourceId: 'protein-gym',
      kind: 'dataset',
      checksum: OTHER_HASH,
      uri: 'https://github.com/OATML-Markslab/ProteinGym',
    },
    truth: [
      { unitId: 'A1V', observedValue: 0.1 },
      { unitId: 'G2D', observedValue: 0.9 },
    ],
  });

const recordMetrics = (state = reveal()) =>
  applyBenchmarkAction(state, {
    action: 'record_metrics',
    benchmarkId: state.benchmarkId,
    expectedRevision: state.revision,
    predictionFreezeHash: state.predictionFreeze?.artifactHash,
    revealHash: state.reveal?.artifactHash,
    recordedAt: 5,
    metrics: [{ name: 'spearman', value: 1, direction: 'higher_is_better', sampleSize: 2 }],
  });

describe('bio benchmark state machine', () => {
  it('completes a benchmark through immutable blind and reveal artifacts', () => {
    const evaluated = recordMetrics();
    const completed = applyBenchmarkAction(evaluated, {
      action: 'complete',
      benchmarkId: evaluated.benchmarkId,
      expectedRevision: evaluated.revision,
      metricRecordHash: evaluated.metricRecord?.artifactHash,
      completedAt: 6,
    });

    expect(completed.status).toBe('completed');
    expect(completed.revision).toBe(5);
    expect(completed.completedAt).toBe(6);
  });

  it('rejects reveal before blind predictions are frozen', () => {
    const state = freezeInputs();

    expect(() =>
      applyBenchmarkAction(state, {
        action: 'reveal',
        benchmarkId: state.benchmarkId,
        expectedRevision: state.revision,
        predictionFreezeHash: HASH,
        revealedAt: 4,
        source: { sourceId: 'protein-gym', kind: 'dataset', checksum: HASH, uri: 'https://example.test' },
        truth: [{ unitId: 'A1V', observedValue: 1 }],
      })
    ).toThrow('requires status predictions_frozen');
  });

  it('rejects truth-bearing fields in a blind prediction payload', () => {
    const state = freezeInputs();

    expect(() =>
      applyBenchmarkAction(state, {
        action: 'freeze_blind_predictions',
        benchmarkId: state.benchmarkId,
        expectedRevision: state.revision,
        inputFreezeHash: state.inputFreeze?.artifactHash,
        frozenAt: 3,
        model: {
          name: 'baseline',
          version: '1',
          codeChecksum: HASH,
          environmentChecksum: HASH,
          parameterChecksum: HASH,
        },
        seeds: [1],
        predictions: [{ unitId: 'A1V', predictedValue: 0.2, observedValue: 0.1 }],
      })
    ).toThrow();
  });

  it('rejects stale optimistic-concurrency revisions', () => {
    const state = freezeInputs();

    expect(() =>
      applyBenchmarkAction(state, {
        action: 'freeze_blind_predictions',
        benchmarkId: state.benchmarkId,
        expectedRevision: state.revision - 1,
        inputFreezeHash: state.inputFreeze?.artifactHash,
        frozenAt: 3,
        model: {
          name: 'baseline',
          version: '1',
          codeChecksum: HASH,
          environmentChecksum: HASH,
          parameterChecksum: HASH,
        },
        seeds: [1],
        predictions: [{ unitId: 'A1V', predictedValue: 0.2 }],
      })
    ).toThrow('expectedRevision is stale');
  });

  it('requires reveal truth to cover exactly the frozen units', () => {
    const state = freezePredictions();

    expect(() =>
      applyBenchmarkAction(state, {
        action: 'reveal',
        benchmarkId: state.benchmarkId,
        expectedRevision: state.revision,
        predictionFreezeHash: state.predictionFreeze?.artifactHash,
        revealedAt: 4,
        source: { sourceId: 'protein-gym', kind: 'dataset', checksum: HASH, uri: 'https://example.test' },
        truth: [{ unitId: 'A1V', observedValue: 1 }],
      })
    ).toThrow('must cover exactly');
  });

  it('rejects a metric record that omits a required planned metric', () => {
    const state = reveal();

    expect(() =>
      applyBenchmarkAction(state, {
        action: 'record_metrics',
        benchmarkId: state.benchmarkId,
        expectedRevision: state.revision,
        predictionFreezeHash: state.predictionFreeze?.artifactHash,
        revealHash: state.reveal?.artifactHash,
        recordedAt: 5,
        metrics: [{ name: 'mae', value: 0.1, direction: 'lower_is_better', sampleSize: 2 }],
      })
    ).toThrow('Required metric is missing');
  });

  it('rejects state whose frozen artifact was modified after hashing', () => {
    const state = freezeInputs();
    const tampered = {
      ...state,
      inputFreeze: { ...state.inputFreeze, frozenAt: 999 },
    } as BenchmarkState;

    expect(() =>
      applyBenchmarkAction(tampered, {
        action: 'freeze_blind_predictions',
        benchmarkId: tampered.benchmarkId,
        expectedRevision: tampered.revision,
        inputFreezeHash: tampered.inputFreeze?.artifactHash,
        frozenAt: 3,
        model: {
          name: 'baseline',
          version: '1',
          codeChecksum: HASH,
          environmentChecksum: HASH,
          parameterChecksum: HASH,
        },
        seeds: [1],
        predictions: [{ unitId: 'A1V', predictedValue: 0.2 }],
      })
    ).toThrow('stale artifact hash');
  });
});
