/**
 * @license
 * Copyright 2026 OpenScience contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_MEDICAL_EVIDENCE_SKILL_IDS } from '@/common/chat/medicalEvidence';
import { DEFAULT_SCIENCE_SKILL_IDS } from '@/common/chat/science';
import { LAB_SKILL_DEPOSITION_SKILL_NAME } from '@/common/chat/labSkillDeposition';
import {
  BUILTIN_IMAGE_GEN_NAME,
  BUILTIN_LAB_SKILL_NAME,
  BUILTIN_MEDICAL_EVIDENCE_NAME,
  BUILTIN_RESEARCH_EVIDENCE_NAME,
  BUILTIN_SCIENCE_ARTIFACT_NAME,
  BUILTIN_USER_INPUT_NAME,
} from '@/common/config/storage';
import { LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';

export type GuidCapabilityMode = 'science' | 'medical-evidence' | 'skill-deposition' | 'standard';

export function resolveGuidCapabilityMode(options: {
  isScienceMode?: boolean;
  isMedicalEvidenceMode?: boolean;
  isSkillDepositionMode?: boolean;
}): GuidCapabilityMode {
  if (options.isMedicalEvidenceMode) return 'medical-evidence';
  if (options.isSkillDepositionMode) return 'skill-deposition';
  if (options.isScienceMode !== false) return 'science';
  return 'standard';
}

export function normalizeGuidAgentBackend(backend: string | undefined): string | undefined {
  return backend === LEGACY_LOCAL_RUNTIME_ID ? 'codex' : backend;
}

export function getGuidModeDefaultSkillIds(mode: GuidCapabilityMode): string[] {
  if (mode === 'science') return [...DEFAULT_SCIENCE_SKILL_IDS];
  if (mode === 'medical-evidence') return [...DEFAULT_MEDICAL_EVIDENCE_SKILL_IDS];
  if (mode === 'skill-deposition') return [LAB_SKILL_DEPOSITION_SKILL_NAME];
  return [];
}

export function getGuidModeRequiredMcpNames(
  mode: GuidCapabilityMode,
  options: { medicalEvidenceAgentBackend?: string } = {}
): string[] {
  if (mode === 'science') {
    return [BUILTIN_RESEARCH_EVIDENCE_NAME, BUILTIN_SCIENCE_ARTIFACT_NAME, BUILTIN_USER_INPUT_NAME];
  }
  if (mode === 'medical-evidence') {
    return [
      BUILTIN_MEDICAL_EVIDENCE_NAME,
      ...(normalizeGuidAgentBackend(options.medicalEvidenceAgentBackend) === 'codex' ? [BUILTIN_IMAGE_GEN_NAME] : []),
      BUILTIN_USER_INPUT_NAME,
    ];
  }
  if (mode === 'skill-deposition') {
    return [BUILTIN_LAB_SKILL_NAME, BUILTIN_USER_INPUT_NAME];
  }
  return [];
}
