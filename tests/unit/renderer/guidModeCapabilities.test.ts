import { describe, expect, it } from 'vitest';

import {
  getGuidModeSelectableBuiltinMcpNames,
  getGuidModeRequiredMcpNames,
  isGuidMcpServerVisible,
  resolveSkillRequiredMcpSources,
  resolveSkillRequiredMcpNames,
  resolveGuidCapabilityMode,
} from '@/renderer/pages/guid/utils/modeCapabilities';
import {
  BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME,
  BUILTIN_BIO_KNOWLEDGE_NAME,
  BUILTIN_BIO_PLOT_NAME,
  BUILTIN_BIO_REPRODUCTION_NAME,
  BUILTIN_BIO_RUNTIME_NAME,
  BUILTIN_BIO_SOURCE_NAME,
  BUILTIN_BIO_STATISTICS_NAME,
  BUILTIN_IMAGE_GEN_NAME,
  BUILTIN_LAB_SKILL_NAME,
  BUILTIN_MEDICAL_EVIDENCE_NAME,
  BUILTIN_RESEARCH_EVIDENCE_NAME,
  BUILTIN_SCIENCE_ARTIFACT_NAME,
  BUILTIN_USER_INPUT_NAME,
} from '@/common/config/storage';

describe('guid capability mode MCP requirements', () => {
  it('defaults new conversations to Science Mode', () => {
    expect(resolveGuidCapabilityMode({})).toBe('science');
  });

  it('loads the shared user-input MCP for Science Mode', () => {
    expect(getGuidModeRequiredMcpNames('science')).toEqual([
      BUILTIN_RESEARCH_EVIDENCE_NAME,
      BUILTIN_SCIENCE_ARTIFACT_NAME,
      BUILTIN_USER_INPUT_NAME,
    ]);
  });

  it('keeps OpenBioScience bio MCPs selectable but not required for Science Mode', () => {
    expect(getGuidModeSelectableBuiltinMcpNames('science')).toEqual([
      BUILTIN_BIO_RUNTIME_NAME,
      BUILTIN_BIO_SOURCE_NAME,
      BUILTIN_BIO_KNOWLEDGE_NAME,
      BUILTIN_BIO_PLOT_NAME,
      BUILTIN_BIO_REPRODUCTION_NAME,
      BUILTIN_BIO_STATISTICS_NAME,
      BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME,
    ]);
    expect(getGuidModeRequiredMcpNames('science')).not.toEqual(
      expect.arrayContaining([
        BUILTIN_BIO_RUNTIME_NAME,
        BUILTIN_BIO_SOURCE_NAME,
        BUILTIN_BIO_KNOWLEDGE_NAME,
        BUILTIN_BIO_PLOT_NAME,
        BUILTIN_BIO_REPRODUCTION_NAME,
        BUILTIN_BIO_STATISTICS_NAME,
        BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME,
      ])
    );
  });

  it('shows OpenBioScience bio builtins as optional Science MCPs', () => {
    expect(isGuidMcpServerVisible({ builtin: true, name: BUILTIN_BIO_RUNTIME_NAME }, 'science')).toBe(true);
    expect(isGuidMcpServerVisible({ builtin: true, name: 'unrelated-builtin' }, 'science')).toBe(false);
    expect(isGuidMcpServerVisible({ builtin: false, name: 'user-mcp' }, 'science')).toBe(true);
  });

  it('loads Bio MCP dependencies from enabled reproduction skills', () => {
    expect(resolveSkillRequiredMcpNames(['bio-omics-reproduction-planning'])).toEqual([
      BUILTIN_BIO_RUNTIME_NAME,
      BUILTIN_BIO_SOURCE_NAME,
      BUILTIN_BIO_REPRODUCTION_NAME,
      BUILTIN_BIO_STATISTICS_NAME,
    ]);
    expect(resolveSkillRequiredMcpNames(['bio-scrna-differential-expression'])).toEqual([
      BUILTIN_BIO_RUNTIME_NAME,
      BUILTIN_BIO_STATISTICS_NAME,
    ]);
    expect(resolveSkillRequiredMcpNames(['bio-data-resolution', 'bio-environment-routing'])).toEqual([
      BUILTIN_BIO_RUNTIME_NAME,
      BUILTIN_BIO_SOURCE_NAME,
    ]);
    expect(resolveSkillRequiredMcpNames(['bio-environment-manager', 'bio-analysis-script-authoring'])).toEqual([
      BUILTIN_BIO_RUNTIME_NAME,
      BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME,
    ]);
    expect(resolveSkillRequiredMcpNames(['bio-scrna-reproduction'])).toEqual([
      BUILTIN_BIO_RUNTIME_NAME,
      BUILTIN_BIO_SOURCE_NAME,
      BUILTIN_BIO_KNOWLEDGE_NAME,
      BUILTIN_BIO_PLOT_NAME,
      BUILTIN_BIO_REPRODUCTION_NAME,
      BUILTIN_BIO_STATISTICS_NAME,
    ]);
  });

  it('does not add Bio MCPs for unrelated skills and removes duplicates', () => {
    expect(resolveSkillRequiredMcpNames(['openscience-writing'])).toEqual([]);
    expect(resolveSkillRequiredMcpNames(['bio-data-resolution', 'bio-data-resolution'])).toEqual([
      BUILTIN_BIO_SOURCE_NAME,
    ]);
  });

  it('records which skills caused each automatic Bio MCP dependency', () => {
    expect(
      resolveSkillRequiredMcpSources(['bio-data-resolution', 'bio-scrna-reproduction', 'bio-data-resolution'])
    ).toEqual({
      [BUILTIN_BIO_RUNTIME_NAME]: ['bio-scrna-reproduction'],
      [BUILTIN_BIO_SOURCE_NAME]: ['bio-data-resolution', 'bio-scrna-reproduction'],
      [BUILTIN_BIO_KNOWLEDGE_NAME]: ['bio-scrna-reproduction'],
      [BUILTIN_BIO_PLOT_NAME]: ['bio-scrna-reproduction'],
      [BUILTIN_BIO_REPRODUCTION_NAME]: ['bio-scrna-reproduction'],
      [BUILTIN_BIO_STATISTICS_NAME]: ['bio-scrna-reproduction'],
    });
  });

  it('loads the shared user-input MCP for Medical Evidence Mode', () => {
    expect(getGuidModeRequiredMcpNames('medical-evidence', { medicalEvidenceAgentBackend: 'codex' })).toEqual([
      BUILTIN_MEDICAL_EVIDENCE_NAME,
      BUILTIN_IMAGE_GEN_NAME,
      BUILTIN_USER_INPUT_NAME,
    ]);
  });

  it('loads the shared user-input MCP for Skill Deposition Mode', () => {
    expect(getGuidModeRequiredMcpNames('skill-deposition')).toEqual([BUILTIN_LAB_SKILL_NAME, BUILTIN_USER_INPUT_NAME]);
  });
});
