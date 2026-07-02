import { describe, expect, it } from 'vitest';

const {
  getActionsArtifactName,
  getActionsArtifactMissingMessage,
} = require('../../../packages/shared-scripts/src/prepare-deeporganiser-core');

describe('prepare-deeporganiser-core GitHub Actions artifact resolver', () => {
  it.each([
    ['win32', 'x64', 'aioncore-manual-windows-x64'],
    ['win32', 'arm64', 'aioncore-manual-windows-arm64'],
    ['darwin', 'x64', 'aioncore-manual-macos-x64'],
    ['darwin', 'arm64', 'aioncore-manual-macos-arm64'],
    ['linux', 'x64', 'aioncore-manual-linux-x64'],
    ['linux', 'arm64', 'aioncore-manual-linux-arm64'],
  ])('maps %s-%s to %s', (platform, arch, artifactName) => {
    expect(getActionsArtifactName(platform, arch)).toBe(artifactName);
  });

  it('explains which DeepOrganiser Core manual artifact is missing for the requested platform', () => {
    expect(
      getActionsArtifactMissingMessage({
        runId: '27319522909',
        platform: 'win32',
        arch: 'x64',
        expectedArtifactName: 'aioncore-manual-windows-x64',
        availableArtifactNames: ['aioncore-manual-macos-arm64', 'aioncore-manual-linux-x64'],
      })
    ).toBe(
      [
        'DeepOrganiser Core upstream run 27319522909 does not contain artifact [ aioncore-manual-windows-x64 ] required for [ win32-x64 ].',
        'Available artifacts: aioncore-manual-macos-arm64, aioncore-manual-linux-x64.',
        'Re-run the upstream core manual build with platform [ windows-x64 ] or all.',
      ].join(' ')
    );
  });
});
