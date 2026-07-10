import { describe, expect, it } from 'vitest';

import { buildStandaloneBioMcpServerSpecs, buildStandaloneBuiltinMcpServers } from '../../../scripts/webui';

describe('standalone WebUI built-in MCP catalog', () => {
  it('registers the OpenBioScience reproduction MCP profile', () => {
    expect(buildStandaloneBioMcpServerSpecs()).toContainEqual({
      name: 'openscience-bio-reproduction',
      description:
        'Built-in OpenBioScience omics reproduction planning control plane for source packaging, availability audit, lightweight localization planning, and script-boundary validation.',
      scriptName: 'builtin-mcp-bio',
      env: {
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'reproduction',
      },
    });
  });

  it('exports the omics reproduction planning skill through standalone science artifact MCP env', () => {
    const scienceArtifact = buildStandaloneBuiltinMcpServers(25809).find(
      (server) => server.name === 'openscience-science-artifact'
    );

    expect(scienceArtifact?.transport.env?.OPENSCIENCE_DEFAULT_SKILL_IDS?.split(',')).toContain(
      'bio-omics-reproduction-planning'
    );
  });
});
