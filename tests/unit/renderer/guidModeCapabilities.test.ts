import { describe, expect, it } from 'vitest';

import {
  getGuidModeRequiredMcpNames,
  resolveGuidCapabilityMode,
} from '@/renderer/pages/guid/utils/modeCapabilities';
import {
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

  it('loads the shared user-input MCP for Medical Evidence Mode', () => {
    expect(getGuidModeRequiredMcpNames('medical-evidence', { medicalEvidenceAgentBackend: 'codex' })).toEqual([
      BUILTIN_MEDICAL_EVIDENCE_NAME,
      BUILTIN_IMAGE_GEN_NAME,
      BUILTIN_USER_INPUT_NAME,
    ]);
  });

  it('loads the shared user-input MCP for Skill Deposition Mode', () => {
    expect(getGuidModeRequiredMcpNames('skill-deposition')).toEqual([
      BUILTIN_LAB_SKILL_NAME,
      BUILTIN_USER_INPUT_NAME,
    ]);
  });
});
