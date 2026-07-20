import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildOpenBioScienceRuntimeEnv,
  buildOpenBioScienceRuntimePath,
  buildOpenBioScienceSkillRoots,
  resolveOpenBioScienceBioResourceRoot,
  resolveOpenBioScienceRuntimeRoot,
  resolveOpenBioScienceWorkspaceRoot,
} from '@/process/utils/openBioScienceRuntimeEnv';

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
    expect(buildOpenBioScienceRuntimePath('/usr/bin:/bin', {})).toBe('/usr/bin:/bin');
  });

  it('prefers the portable environment root over legacy runtime-root variables', () => {
    expect(
      resolveOpenBioScienceRuntimeRoot({
        OPENBIOSCIENCE_ENV_ROOT: '/portable/runtime',
        OPENBIOSCIENCE_RUNTIME_ROOT: '/legacy/runtime',
      })
    ).toBe('/portable/runtime');
  });

  it('exports all runtime root aliases for child processes', () => {
    expect(
      buildOpenBioScienceRuntimeEnv(
        { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime' },
        {
          OPENBIOSCIENCE_ENV_ROOT: '/portable/runtime',
        },
        '/workspace/openbioscience'
      )
    ).toEqual(
      expect.objectContaining({
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime',
        OPENBIOSCIENCE_ENV_ROOT: '/portable/runtime',
        OPENBIOSCIENCE_RUNTIME_ROOT: '/portable/runtime',
        OPENSCIENCE_RUNTIME_ROOT: '/portable/runtime',
        OPENBIOSCIENCE_WORKSPACE_ROOT: '/workspace/openbioscience',
        OPENSCIENCE_WORKSPACE_ROOT: '/workspace/openbioscience',
        OPENBIOSCIENCE_BIO_RESOURCE_ROOT: path.resolve(process.cwd(), 'resources', 'bio'),
        OPENBIOSCIENCE_GENE_SET_ROOT: path.resolve(process.cwd(), 'resources', 'bio', 'gene_sets'),
        OPENBIOSCIENCE_MARKER_ROOT: path.resolve(process.cwd(), 'resources', 'bio', 'markers'),
        OPENBIOSCIENCE_MSIGDB_ROOT: path.resolve(process.cwd(), 'resources', 'bio', 'gene_sets', 'msigdb'),
        FONTCONFIG_FILE: '/etc/fonts/fonts.conf',
        FONTCONFIG_PATH: '/etc/fonts',
      })
    );
  });

  it('honors explicit bio resource root overrides for localized marker and MSigDB resources', () => {
    expect(
      buildOpenBioScienceRuntimeEnv(
        {},
        {
          OPENBIOSCIENCE_BIO_RESOURCE_ROOT: '/localized/bio',
          OPENBIOSCIENCE_GENE_SET_ROOT: '/localized/gene_sets',
          OPENBIOSCIENCE_MARKER_ROOT: '/localized/markers',
          OPENBIOSCIENCE_MSIGDB_ROOT: '/licensed/msigdb',
        },
        '/workspace/openbioscience'
      )
    ).toEqual(
      expect.objectContaining({
        OPENBIOSCIENCE_BIO_RESOURCE_ROOT: '/localized/bio',
        OPENBIOSCIENCE_GENE_SET_ROOT: '/localized/gene_sets',
        OPENBIOSCIENCE_MARKER_ROOT: '/localized/markers',
        OPENBIOSCIENCE_MSIGDB_ROOT: '/licensed/msigdb',
      })
    );
    expect(resolveOpenBioScienceBioResourceRoot({ OPENBIOSCIENCE_BIO_RESOURCE_ROOT: '/localized/bio' })).toBe(
      '/localized/bio'
    );
  });

  it('resolves workspace roots and exports deterministic skill roots', () => {
    expect(
      resolveOpenBioScienceWorkspaceRoot(
        {
          OPENBIOSCIENCE_WORKSPACE_ROOT: '/workspace/openbioscience',
          OPENSCIENCE_WORKSPACE_ROOT: '/legacy/workspace',
        },
        '/fallback/workspace'
      )
    ).toBe('/workspace/openbioscience');
    const skillRoots = buildOpenBioScienceSkillRoots(
      {
        OPENBIOSCIENCE_ENV_ROOT: '/opt/openbioscience/env',
      },
      '/workspace/openbioscience'
    ).split(path.delimiter);
    expect(skillRoots).toEqual(
      expect.arrayContaining([
        '/workspace/openbioscience/resources/skills',
        '/opt/openbioscience/env/resources/skills',
        '/app/resources/skills',
      ])
    );
  });
});
