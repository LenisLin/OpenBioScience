/**
 * Portable contract helpers for official OpenBioScience environment releases.
 *
 * A release manifest is immutable data published alongside compressed Conda
 * prefixes. It intentionally contains relative archive and installation paths
 * only; the caller chooses the local runtime root.
 */

export const OFFICIAL_ENVIRONMENT_RELEASE_SCHEMA = 'openbioscience.official_environment_release.v1';

export type OfficialEnvironmentReleaseArtifact = {
  name: string;
  archive: string;
  sha256: string;
  sizeBytes: number;
  relativePrefix: string;
  requiredCommands: string[];
};

export type OfficialEnvironmentReleaseManifest = {
  schema: typeof OFFICIAL_ENVIRONMENT_RELEASE_SCHEMA;
  release: string;
  platform: string;
  artifacts: OfficialEnvironmentReleaseArtifact[];
};

const isSafeRelativePath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.startsWith('/') &&
  !value.startsWith('\\') &&
  value.split(/[\\/]/).every((segment) => segment !== '..' && segment.length > 0);

const isSha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

/** Parse and validate untrusted release-manifest JSON before any filesystem operation. */
export const parseOfficialEnvironmentReleaseManifest = (value: unknown): OfficialEnvironmentReleaseManifest => {
  if (!value || typeof value !== 'object') throw new Error('Release manifest must be a JSON object.');
  const candidate = value as Partial<OfficialEnvironmentReleaseManifest>;
  if (candidate.schema !== OFFICIAL_ENVIRONMENT_RELEASE_SCHEMA) {
    throw new Error(`Unsupported environment release schema: ${String(candidate.schema)}.`);
  }
  if (typeof candidate.release !== 'string' || !candidate.release.trim()) {
    throw new Error('Release manifest is missing a release identifier.');
  }
  if (typeof candidate.platform !== 'string' || !candidate.platform.trim()) {
    throw new Error('Release manifest is missing a platform identifier.');
  }
  if (!Array.isArray(candidate.artifacts) || candidate.artifacts.length === 0) {
    throw new Error('Release manifest must declare at least one environment artifact.');
  }

  const names = new Set<string>();
  const artifacts = candidate.artifacts.map((artifact) => {
    if (!artifact || typeof artifact !== 'object') throw new Error('Release artifact must be an object.');
    const entry = artifact as Partial<OfficialEnvironmentReleaseArtifact>;
    if (typeof entry.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) {
      throw new Error(`Invalid environment artifact name: ${String(entry.name)}.`);
    }
    if (names.has(entry.name)) throw new Error(`Duplicate environment artifact: ${entry.name}.`);
    names.add(entry.name);
    if (!isSafeRelativePath(entry.archive) || !isSafeRelativePath(entry.relativePrefix)) {
      throw new Error(`Environment artifact ${entry.name} contains an unsafe relative path.`);
    }
    if (!isSha256(entry.sha256)) throw new Error(`Environment artifact ${entry.name} has an invalid SHA-256.`);
    if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes <= 0) {
      throw new Error(`Environment artifact ${entry.name} has an invalid size.`);
    }
    if (
      !Array.isArray(entry.requiredCommands) ||
      entry.requiredCommands.some((command) => !/^[A-Za-z0-9_.+-]+$/.test(command))
    ) {
      throw new Error(`Environment artifact ${entry.name} has invalid required commands.`);
    }
    return {
      name: entry.name,
      archive: entry.archive,
      sha256: entry.sha256.toLowerCase(),
      sizeBytes: entry.sizeBytes,
      relativePrefix: entry.relativePrefix,
      requiredCommands: entry.requiredCommands,
    };
  });

  return {
    schema: OFFICIAL_ENVIRONMENT_RELEASE_SCHEMA,
    release: candidate.release,
    platform: candidate.platform,
    artifacts,
  };
};

export const findOfficialEnvironmentReleaseArtifact = (
  manifest: OfficialEnvironmentReleaseManifest,
  environmentName: string
): OfficialEnvironmentReleaseArtifact => {
  const artifact = manifest.artifacts.find((candidate) => candidate.name === environmentName);
  if (!artifact) throw new Error(`Release ${manifest.release} does not contain environment ${environmentName}.`);
  return artifact;
};
