import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  benchmarkControlRelativePath,
  normalizeBenchmarkRelativePath,
  resolveBenchmarkProjectPath,
} from '@/process/resources/builtinMcp/bio/benchmark';

describe('bio benchmark path safety', () => {
  it('normalizes project-relative Windows separators', () => {
    expect(normalizeBenchmarkRelativePath('inputs\\structures\\1ema.cif')).toBe('inputs/structures/1ema.cif');
  });

  it.each(['../secret.csv', 'inputs/../../secret.csv', '/tmp/secret.csv', 'C:\\secret.csv', '\\\\server\\share'])(
    'rejects unsafe path %s',
    (candidate) => {
      expect(() => normalizeBenchmarkRelativePath(candidate)).toThrow();
    }
  );

  it('resolves a normalized path beneath an absolute project root', () => {
    const root = path.resolve('benchmark-project');
    const result = resolveBenchmarkProjectPath(root, 'inputs/data.csv');

    expect(result.relativePath).toBe('inputs/data.csv');
    expect(result.absolutePath.startsWith(root)).toBe(true);
  });

  it('rejects unsafe benchmark identifiers in control paths', () => {
    expect(() => benchmarkControlRelativePath('../case')).toThrow('not a safe identifier');
  });
});
