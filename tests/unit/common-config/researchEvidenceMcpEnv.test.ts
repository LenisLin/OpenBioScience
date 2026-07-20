import { describe, expect, it } from 'vitest';

import { RESEARCH_EVIDENCE_ENV_KEYS, resolveResearchEvidenceMcpEnv } from '@/common/config/researchEvidenceMcpEnv';

describe('research evidence MCP environment resolution', () => {
  it('enables the local bio_tools provider by default', () => {
    const result = resolveResearchEvidenceMcpEnv(undefined, {
      [RESEARCH_EVIDENCE_ENV_KEYS.bioToolsPythonPath]:
        '/opt/openbioscience/env/environments/official/sc-py-singlecell/bin/python',
    });

    expect(result.ok).toBe(true);
    expect(result.env).toMatchObject({
      [RESEARCH_EVIDENCE_ENV_KEYS.enabledProviders]: 'bio_tools',
      [RESEARCH_EVIDENCE_ENV_KEYS.bioToolsEnabled]: 'true',
      [RESEARCH_EVIDENCE_ENV_KEYS.bioToolsPythonPath]:
        '/opt/openbioscience/env/environments/official/sc-py-singlecell/bin/python',
    });
    expect(result.env[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsDefaultDomains]).toContain('cancer-singlecell');
  });

  it('keeps an explicit bio_tools opt-out disabled', () => {
    const result = resolveResearchEvidenceMcpEnv({ enabled: true, bioToolsEnabled: false });

    expect(result.ok).toBe(false);
    expect(result.env[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsEnabled]).toBe('false');
  });
});
