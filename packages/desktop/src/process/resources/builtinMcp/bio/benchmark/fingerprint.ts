import crypto from 'node:crypto';

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)])
  );
};

export const stableBenchmarkJson = (value: unknown): string => JSON.stringify(stableValue(value));

export const benchmarkFingerprint = (value: unknown): string =>
  crypto.createHash('sha256').update(stableBenchmarkJson(value)).digest('hex');

export const verifyArtifactHash = <T extends { artifactHash: string }>(artifact: T): boolean => {
  const { artifactHash, ...semantic } = artifact;
  return artifactHash === benchmarkFingerprint(semantic);
};
