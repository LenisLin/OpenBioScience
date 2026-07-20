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
const OPENBIOSCIENCE_WORKSPACE_ROOT_ENV_KEY = 'OPENBIOSCIENCE_WORKSPACE_ROOT';
const OPENSCIENCE_WORKSPACE_ROOT_ENV_KEY = 'OPENSCIENCE_WORKSPACE_ROOT';
const OPENBIOSCIENCE_SKILL_ROOTS_ENV_KEY = 'OPENBIOSCIENCE_SKILL_ROOTS';
const OPENBIOSCIENCE_BIO_RESOURCE_ROOT_ENV_KEY = 'OPENBIOSCIENCE_BIO_RESOURCE_ROOT';
const OPENBIOSCIENCE_GENE_SET_ROOT_ENV_KEY = 'OPENBIOSCIENCE_GENE_SET_ROOT';
const OPENBIOSCIENCE_MSIGDB_ROOT_ENV_KEY = 'OPENBIOSCIENCE_MSIGDB_ROOT';
const OPENBIOSCIENCE_MARKER_ROOT_ENV_KEY = 'OPENBIOSCIENCE_MARKER_ROOT';
const OPENBIOSCIENCE_BIO_MCP_SCHEMA_VERSION_ENV_KEY = 'OPENBIOSCIENCE_BIO_MCP_SCHEMA_VERSION';
const FONTCONFIG_FILE_ENV_KEY = 'FONTCONFIG_FILE';
const FONTCONFIG_PATH_ENV_KEY = 'FONTCONFIG_PATH';
const OFFICIAL_BASE_ENV_BIN_RELATIVE_PATH = path.join('environments', 'official', 'sc-py-singlecell', 'bin');

export const OPENBIOSCIENCE_BIO_MCP_SCHEMA_VERSION = '2026-07-19.free-exploration.v1';

const uniqueExistingPaths = (paths: string[]): string[] =>
  Array.from(
    new Set(
      paths
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => path.isAbsolute(item))
    )
  );

const firstExistingAbsolutePath = (paths: string[]): string | undefined =>
  uniqueExistingPaths(paths).find((candidate) => fs.existsSync(candidate));

const electronResourcesPath = (): string | undefined => {
  const maybeProcess = process as NodeJS.Process & { resourcesPath?: string };
  return maybeProcess.resourcesPath && path.isAbsolute(maybeProcess.resourcesPath) ? maybeProcess.resourcesPath : undefined;
};

export const resolveOpenBioScienceRuntimeRoot = (env: NodeJS.ProcessEnv = process.env): string | undefined => {
  const configured =
    env[OPENBIOSCIENCE_ENV_ROOT_ENV_KEY]?.trim() ||
    env[OPENBIOSCIENCE_RUNTIME_ENV_KEY]?.trim() ||
    env[OPENSCIENCE_RUNTIME_ENV_KEY]?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  return undefined;
};

export const resolveOpenBioScienceWorkspaceRoot = (
  env: NodeJS.ProcessEnv = process.env,
  fallbackRoot?: string
): string | undefined => {
  const configured =
    env[OPENBIOSCIENCE_WORKSPACE_ROOT_ENV_KEY]?.trim() || env[OPENSCIENCE_WORKSPACE_ROOT_ENV_KEY]?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  return fallbackRoot && path.isAbsolute(fallbackRoot) ? fallbackRoot : undefined;
};

export const buildOpenBioScienceSkillRoots = (
  env: NodeJS.ProcessEnv = process.env,
  fallbackWorkspaceRoot?: string
): string => {
  const configured = env[OPENBIOSCIENCE_SKILL_ROOTS_ENV_KEY]?.trim();
  if (configured) return configured;

  const runtimeRoot = resolveOpenBioScienceRuntimeRoot(env);
  const workspaceRoot = resolveOpenBioScienceWorkspaceRoot(env, fallbackWorkspaceRoot);
  return uniqueExistingPaths([
    path.resolve(process.cwd(), 'resources', 'skills'),
    workspaceRoot ? path.join(workspaceRoot, 'resources', 'skills') : '',
    runtimeRoot ? path.join(runtimeRoot, 'resources', 'skills') : '',
    '/app/resources/skills',
  ]).join(path.delimiter);
};

export const resolveOpenBioScienceBioResourceRoot = (
  env: NodeJS.ProcessEnv = process.env,
  fallbackWorkspaceRoot?: string
): string => {
  const configured = env[OPENBIOSCIENCE_BIO_RESOURCE_ROOT_ENV_KEY]?.trim();
  if (configured && path.isAbsolute(configured)) return configured;
  const packagedResources = electronResourcesPath();
  const workspaceRoot = resolveOpenBioScienceWorkspaceRoot(env, fallbackWorkspaceRoot);
  return (
    firstExistingAbsolutePath([
      packagedResources ? path.join(packagedResources, 'bio') : '',
      path.resolve(process.cwd(), 'resources', 'bio'),
      workspaceRoot ? path.join(workspaceRoot, 'resources', 'bio') : '',
      '/app/resources/bio',
    ]) || path.resolve(process.cwd(), 'resources', 'bio')
  );
};

export const buildOpenBioScienceRuntimeEnv = (
  baseEnv: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  fallbackWorkspaceRoot?: string
): Record<string, string> => {
  const runtimeRoot = resolveOpenBioScienceRuntimeRoot(env);
  const workspaceRoot = resolveOpenBioScienceWorkspaceRoot(env, fallbackWorkspaceRoot);
  const skillRoots = buildOpenBioScienceSkillRoots(env, workspaceRoot);
  const bioResourceRoot = resolveOpenBioScienceBioResourceRoot(env, workspaceRoot);
  const configuredGeneSetRoot = env[OPENBIOSCIENCE_GENE_SET_ROOT_ENV_KEY]?.trim();
  const geneSetRoot =
    configuredGeneSetRoot && path.isAbsolute(configuredGeneSetRoot)
      ? configuredGeneSetRoot
      : path.join(bioResourceRoot, 'gene_sets');
  const configuredMsigdbRoot = env[OPENBIOSCIENCE_MSIGDB_ROOT_ENV_KEY]?.trim();
  const msigdbRoot =
    configuredMsigdbRoot && path.isAbsolute(configuredMsigdbRoot)
      ? configuredMsigdbRoot
      : path.join(geneSetRoot, 'msigdb');
  const configuredMarkerRoot = env[OPENBIOSCIENCE_MARKER_ROOT_ENV_KEY]?.trim();
  const markerRoot =
    configuredMarkerRoot && path.isAbsolute(configuredMarkerRoot)
      ? configuredMarkerRoot
      : path.join(bioResourceRoot, 'markers');
  return {
    ...baseEnv,
    ...(runtimeRoot
      ? {
          [OPENBIOSCIENCE_ENV_ROOT_ENV_KEY]: runtimeRoot,
          [OPENBIOSCIENCE_RUNTIME_ENV_KEY]: runtimeRoot,
          [OPENSCIENCE_RUNTIME_ENV_KEY]: runtimeRoot,
        }
      : {}),
    ...(workspaceRoot
      ? {
          [OPENBIOSCIENCE_WORKSPACE_ROOT_ENV_KEY]: workspaceRoot,
          [OPENSCIENCE_WORKSPACE_ROOT_ENV_KEY]: workspaceRoot,
        }
      : {}),
    ...(skillRoots ? { [OPENBIOSCIENCE_SKILL_ROOTS_ENV_KEY]: skillRoots } : {}),
    [OPENBIOSCIENCE_BIO_RESOURCE_ROOT_ENV_KEY]: bioResourceRoot,
    [OPENBIOSCIENCE_GENE_SET_ROOT_ENV_KEY]: geneSetRoot,
    [OPENBIOSCIENCE_MSIGDB_ROOT_ENV_KEY]: msigdbRoot,
    [OPENBIOSCIENCE_MARKER_ROOT_ENV_KEY]: markerRoot,
    [OPENBIOSCIENCE_BIO_MCP_SCHEMA_VERSION_ENV_KEY]: OPENBIOSCIENCE_BIO_MCP_SCHEMA_VERSION,
    [FONTCONFIG_FILE_ENV_KEY]: env[FONTCONFIG_FILE_ENV_KEY] || '/etc/fonts/fonts.conf',
    [FONTCONFIG_PATH_ENV_KEY]: env[FONTCONFIG_PATH_ENV_KEY] || '/etc/fonts',
  };
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
