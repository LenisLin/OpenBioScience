/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

const OPENBIOSCIENCE_ENV_ROOT_ENV_KEY = 'OPENBIOSCIENCE_ENV_ROOT';
const OPENBIOSCIENCE_RUNTIME_ENV_KEY = 'OPENBIOSCIENCE_RUNTIME_ROOT';
const OPENSCIENCE_RUNTIME_ENV_KEY = 'OPENSCIENCE_RUNTIME_ROOT';
const OFFICIAL_BASE_ENV_BIN_RELATIVE_PATH = path.join('environments', 'official', 'sc-py-singlecell', 'bin');

export const resolveOpenBioScienceRuntimeRoot = (env: NodeJS.ProcessEnv = process.env): string | undefined => {
  const configured =
    env[OPENBIOSCIENCE_ENV_ROOT_ENV_KEY]?.trim() ||
    env[OPENBIOSCIENCE_RUNTIME_ENV_KEY]?.trim() ||
    env[OPENSCIENCE_RUNTIME_ENV_KEY]?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  return undefined;
};

export const buildOpenBioScienceRuntimeEnv = (
  baseEnv: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> => {
  const runtimeRoot = resolveOpenBioScienceRuntimeRoot(env);
  return runtimeRoot ? { ...baseEnv, [OPENBIOSCIENCE_ENV_ROOT_ENV_KEY]: runtimeRoot } : baseEnv;
};

export const buildOpenBioScienceRuntimePath = (
  basePath: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string => {
  const runtimeRoot = resolveOpenBioScienceRuntimeRoot(env);
  if (!runtimeRoot) return basePath || '';
  const officialBin = path.join(runtimeRoot, OFFICIAL_BASE_ENV_BIN_RELATIVE_PATH);
  if (!fs.existsSync(officialBin)) return basePath || '';
  const entries = [officialBin, ...(basePath || '').split(path.delimiter)].filter(Boolean);
  return Array.from(new Set(entries)).join(path.delimiter);
};
