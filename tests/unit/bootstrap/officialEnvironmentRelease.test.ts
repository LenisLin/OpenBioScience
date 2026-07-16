import { describe, expect, it } from 'vitest';

import {
  OFFICIAL_ENVIRONMENT_RELEASE_SCHEMA,
  findOfficialEnvironmentReleaseArtifact,
  parseOfficialEnvironmentReleaseManifest,
} from '@/process/utils/officialEnvironmentRelease';

const validManifest = {
  schema: OFFICIAL_ENVIRONMENT_RELEASE_SCHEMA,
  release: '2026.07.0',
  platform: 'linux-x64',
  artifacts: [
    {
      name: 'sc-py-singlecell',
      archive: 'archives/sc-py-singlecell-linux-x64.tar.zst',
      sha256: 'a'.repeat(64),
      sizeBytes: 42,
      relativePrefix: 'environments/official/sc-py-singlecell',
      requiredCommands: ['python', 'python3'],
    },
  ],
};

describe('official environment release manifest', () => {
  it('accepts a portable artifact and resolves it by environment name', () => {
    const manifest = parseOfficialEnvironmentReleaseManifest(validManifest);
    expect(findOfficialEnvironmentReleaseArtifact(manifest, 'sc-py-singlecell').relativePrefix).toBe(
      'environments/official/sc-py-singlecell'
    );
  });

  it('rejects archive paths that escape the configured environment root', () => {
    expect(() =>
      parseOfficialEnvironmentReleaseManifest({
        ...validManifest,
        artifacts: [{ ...validManifest.artifacts[0], archive: '../private-data.tar.zst' }],
      })
    ).toThrow('unsafe relative path');
  });

  it('rejects artifacts without an immutable-content hash', () => {
    expect(() =>
      parseOfficialEnvironmentReleaseManifest({
        ...validManifest,
        artifacts: [{ ...validManifest.artifacts[0], sha256: 'not-a-hash' }],
      })
    ).toThrow('invalid SHA-256');
  });
});
