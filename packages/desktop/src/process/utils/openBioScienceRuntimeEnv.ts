/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

type OpenBioScienceEnvManifest = {
  storage_root?: unknown;
};

const OPENBIOSCIENCE_RUNTIME_ENV_KEY = 'OPENBIOSCIENCE_RUNTIME_ROOT';
const OPENSCIENCE_RUNTIME_ENV_KEY = 'OPENSCIENCE_RUNTIME_ROOT';
const ENV_MANIFEST_RELATIVE_PATH = path.join('environments', 'official', 'bootstrap', 'env-manifest.json');
const OFFICIAL_BASE_ENV_BIN_RELATIVE_PATH = path.join('environments', 'official', 'sc-py-singlecell', 'bin');

const readManifestRuntimeRoot = (repoRoot: string): string | undefined => {
  const manifestPath = path.join(repoRoot, ENV_MANIFEST_RELATIVE_PATH);
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as OpenBioScienceEnvManifest;
    return typeof manifest.storage_root === 'string' && path.isAbsolute(manifest.storage_root)
      ? manifest.storage_root
      : undefined;
  } catch {
    return undefined;
  }
};

export const resolveOpenBioScienceRuntimeRoot = (
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = process.cwd()
): string | undefined => {
  const configured = env[OPENBIOSCIENCE_RUNTIME_ENV_KEY]?.trim() || env[OPENSCIENCE_RUNTIME_ENV_KEY]?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  return readManifestRuntimeRoot(repoRoot);
};

export const buildOpenBioScienceRuntimeEnv = (
  baseEnv: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = process.cwd()
): Record<string, string> => {
  const runtimeRoot = resolveOpenBioScienceRuntimeRoot(env, repoRoot);
  return runtimeRoot ? { ...baseEnv, [OPENBIOSCIENCE_RUNTIME_ENV_KEY]: runtimeRoot } : baseEnv;
};

export const buildOpenBioScienceRuntimePath = (
  basePath: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = process.cwd()
): string => {
  const runtimeRoot = resolveOpenBioScienceRuntimeRoot(env, repoRoot);
  if (!runtimeRoot) return basePath || '';
  const officialBin = path.join(runtimeRoot, OFFICIAL_BASE_ENV_BIN_RELATIVE_PATH);
  if (!fs.existsSync(officialBin)) return basePath || '';
  const entries = [officialBin, ...(basePath || '').split(path.delimiter)].filter(Boolean);
  return Array.from(new Set(entries)).join(path.delimiter);
};
