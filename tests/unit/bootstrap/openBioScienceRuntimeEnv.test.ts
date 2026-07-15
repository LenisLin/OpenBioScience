import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildOpenBioScienceRuntimePath } from '@/process/utils/openBioScienceRuntimeEnv';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('buildOpenBioScienceRuntimePath', () => {
  it('prepends the official base environment bin when available', () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openscience-runtime-'));
    tempDirs.push(runtimeRoot);
    const binDir = path.join(runtimeRoot, 'environments', 'official', 'sc-py-singlecell', 'bin');
    fs.mkdirSync(binDir, { recursive: true });

    expect(buildOpenBioScienceRuntimePath('/usr/bin:/bin', { OPENBIOSCIENCE_RUNTIME_ROOT: runtimeRoot })).toBe(
      `${binDir}:/usr/bin:/bin`
    );
  });

  it('preserves the original PATH when the official base environment is absent', () => {
    expect(buildOpenBioScienceRuntimePath('/usr/bin:/bin', {}, '/missing/repository')).toBe('/usr/bin:/bin');
  });
});
