import { describe, expect, it } from 'vitest';

import { buildStandaloneBioMcpServerSpecs, buildStandaloneBuiltinMcpServers } from '../../../scripts/webui';

describe('standalone WebUI built-in MCP catalog', () => {
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
  });
});
