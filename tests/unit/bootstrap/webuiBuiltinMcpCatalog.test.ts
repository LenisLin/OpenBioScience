import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPENBIOSCIENCE_BIO_MCP_SCHEMA_VERSION } from '@/process/utils/openBioScienceRuntimeEnv';
import {
  buildStandaloneBioMcpServerSpecs,
  buildStandaloneBuiltinMcpServers,
  syncOpenBioScienceSkills,
} from '../../../scripts/webui';

describe('standalone WebUI built-in MCP catalog', () => {
  beforeEach(() => {
    vi.stubEnv('OPENBIOSCIENCE_ENV_ROOT', '/mnt/NAS_21T/ProjectData/OpenBioScience');
    vi.stubEnv('OPENBIOSCIENCE_RUNTIME_ROOT', undefined);
    vi.stubEnv('OPENSCIENCE_RUNTIME_ROOT', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('registers the OpenBioScience reproduction MCP profile', () => {
    expect(buildStandaloneBioMcpServerSpecs()).toContainEqual(
      expect.objectContaining({
        name: 'openscience-bio-reproduction',
        description:
          'Built-in OpenBioScience omics reproduction planning control plane for source packaging, availability audit, lightweight localization planning, and script-boundary validation.',
        scriptName: 'builtin-mcp-bio',
        env: expect.objectContaining({
          OPENBIOSCIENCE_BIO_MCP_PROFILE: 'reproduction',
        }),
      })
    );
  });

  it('registers the OpenBioScience analysis MCP profile', () => {
    expect(buildStandaloneBioMcpServerSpecs()).toContainEqual(
      expect.objectContaining({
        name: 'openscience-bio-analysis',
        description:
          'Built-in OpenBioScience private omics analysis control plane for human checkpoints, scRNA-seq baseline, episodes, and closure.',
        scriptName: 'builtin-mcp-bio',
        enabled: true,
        env: expect.objectContaining({
          OPENBIOSCIENCE_BIO_MCP_PROFILE: 'analysis',
        }),
      })
    );
  });

  it('registers the OpenBioScience environment manager MCP profile', () => {
    expect(buildStandaloneBioMcpServerSpecs()).toContainEqual(
      expect.objectContaining({
        name: 'openscience-bio-environment-manager',
        description: 'Built-in OpenBioScience bio environment manager control plane for runtime environments.',
        scriptName: 'builtin-mcp-bio',
        env: expect.objectContaining({
          OPENBIOSCIENCE_BIO_MCP_PROFILE: 'environment_manager',
        }),
      })
    );
  });

  it('registers the OpenBioScience statistics MCP profile', () => {
    expect(buildStandaloneBioMcpServerSpecs()).toContainEqual(
      expect.objectContaining({
        name: 'openscience-bio-statistics',
        scriptName: 'builtin-mcp-bio',
        enabled: true,
        env: expect.objectContaining({
          OPENBIOSCIENCE_BIO_MCP_PROFILE: 'statistics',
        }),
      })
    );
  });

  it('enables all first-party Bio MCP control planes', () => {
    expect(buildStandaloneBioMcpServerSpecs().every((server) => server.enabled === true)).toBe(true);
  });

  it('syncs OpenBioScience skills into the standalone WebUI work directory', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openscience-webui-skills-'));
    syncOpenBioScienceSkills(workDir);

    for (const dir of ['databases', 'singlecell', 'bio-omics-analysis', 'bio-analysis-script-authoring']) {
      const sourcePath = path.join(process.cwd(), 'resources/skills', dir, 'SKILL.md');
      const targetPath = path.join(workDir, 'builtin-skills', dir, 'SKILL.md');
      expect(fs.existsSync(targetPath)).toBe(true);
      expect(fs.readFileSync(targetPath, 'utf8')).toBe(fs.readFileSync(sourcePath, 'utf8'));
    }
  });

  it('passes the official OpenBioScience runtime root to standalone bio MCP servers', () => {
    expect(buildStandaloneBioMcpServerSpecs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'openscience-bio-runtime',
          env: expect.objectContaining({
            OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
          }),
        }),
        expect.objectContaining({
          name: 'openscience-bio-reproduction',
          env: expect.objectContaining({
            OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
          }),
        }),
        expect.objectContaining({
          name: 'openscience-bio-analysis',
          env: expect.objectContaining({
            OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
          }),
        }),
        expect.objectContaining({
          name: 'openscience-bio-statistics',
          env: expect.objectContaining({
            OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
          }),
        }),
        expect.objectContaining({
          name: 'openscience-bio-environment-manager',
          env: expect.objectContaining({
            OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
          }),
        }),
      ])
    );
  });

  it('versions built-in bio MCP schemas so stored tool caches refresh', () => {
    expect(buildStandaloneBioMcpServerSpecs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'openscience-bio-analysis',
          env: expect.objectContaining({
            OPENBIOSCIENCE_BIO_MCP_SCHEMA_VERSION,
          }),
        }),
      ])
    );
  });

  it('exports the default OpenBioScience skills through standalone science artifact MCP env', () => {
    const scienceArtifact = buildStandaloneBuiltinMcpServers(25809).find(
      (server) => server.name === 'openscience-science-artifact'
    );
    const defaultSkillIds = scienceArtifact?.transport.env?.OPENSCIENCE_DEFAULT_SKILL_IDS?.split(',');

    expect(defaultSkillIds).toContain('bio-omics-reproduction-planning');
    expect(defaultSkillIds).toContain('bio-omics-analysis');
    expect(defaultSkillIds).toContain('bio-singlecell-baseline');
    expect(defaultSkillIds).toContain('bio-environment-manager');
    expect(defaultSkillIds).toContain('bio-analysis-script-authoring');
    expect(defaultSkillIds).toContain('bio-scrna-differential-expression');
    expect(defaultSkillIds).toContain('kdense-pathway-enrichment');
    expect(defaultSkillIds).toContain('kdense-scanpy');
  });

  it('enables built-in bio_tools provider for standalone research evidence by default', () => {
    const researchEvidence = buildStandaloneBuiltinMcpServers(25809).find(
      (server) => server.name === 'openscience-research-evidence'
    );

    expect(researchEvidence?.enabled).toBe(true);
    expect(researchEvidence?.transport.env).toMatchObject({
      OPENSCIENCE_RESEARCH_EVIDENCE_PROVIDERS: 'bio_tools',
      OPENSCIENCE_BIO_TOOLS_ENABLED: 'true',
    });
  });
});
