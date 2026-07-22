import { describe, expect, it } from 'vitest';

import {
  benchmarkFingerprint,
  benchmarkMetricRecordSchema,
  benchmarkProvenanceSchema,
  stableBenchmarkJson,
} from '@/process/resources/builtinMcp/bio/benchmark';

const HASH = 'a'.repeat(64);

describe('bio benchmark contracts', () => {
  it('produces the same fingerprint regardless of object key order', () => {
    expect(benchmarkFingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe(benchmarkFingerprint({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it('preserves array order in canonical JSON', () => {
    expect(stableBenchmarkJson({ values: [2, 1] })).not.toBe(stableBenchmarkJson({ values: [1, 2] }));
  });

  it('requires provenance to identify a source location or citation', () => {
    expect(() => benchmarkProvenanceSchema.parse({ sourceId: 'source', kind: 'dataset', checksum: HASH })).toThrow(
      'URI or citation'
    );
  });

  it('rejects non-finite benchmark metrics', () => {
    expect(() =>
      benchmarkMetricRecordSchema.parse({
        schema: 'openbioscience.bio_benchmark.metric_record.v1',
        benchmarkId: 'case',
        predictionFreezeHash: HASH,
        revealHash: HASH,
        recordedAt: 1,
        metrics: [{ name: 'mae', value: Number.NaN, direction: 'lower_is_better', sampleSize: 1 }],
        artifactHash: HASH,
      })
    ).toThrow();
  });

  it('rejects duplicate metric names', () => {
    expect(() =>
      benchmarkMetricRecordSchema.parse({
        schema: 'openbioscience.bio_benchmark.metric_record.v1',
        benchmarkId: 'case',
        predictionFreezeHash: HASH,
        revealHash: HASH,
        recordedAt: 1,
        metrics: [
          { name: 'mae', value: 1, direction: 'lower_is_better', sampleSize: 1 },
          { name: 'mae', value: 2, direction: 'lower_is_better', sampleSize: 1 },
        ],
        artifactHash: HASH,
      })
    ).toThrow('Metric names must be unique');
  });
});
