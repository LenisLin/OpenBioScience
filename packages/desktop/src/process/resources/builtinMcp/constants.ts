/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { LEGACY_APP_NAMESPACE } from '@/common/config/legacyIdentifiers';

// Keep this constant local to avoid pulling in common/config/storage side effects
// when the built-in MCP server boots in a standalone stdio process.
export const BUILTIN_IMAGE_GEN_ID = 'builtin-image-gen';
export const BUILTIN_IMAGE_GEN_NAME = 'openscience-image-generation';
export const BUILTIN_IMAGE_GEN_LEGACY_NAMES = [
  'DeepOrganiser Image Generation',
  BUILTIN_IMAGE_GEN_ID,
  `${LEGACY_APP_NAMESPACE}-image-generation`,
  'deeporganiser-image-generation',
] as const;
export const BUILTIN_LARK_PROJECT_AGENT_ID = 'builtin-lark-project-agent';
export const BUILTIN_LARK_PROJECT_AGENT_NAME = 'openscience-lark-project-agent';
export const BUILTIN_MEDICAL_EVIDENCE_ID = 'builtin-medical-evidence';
export const BUILTIN_MEDICAL_EVIDENCE_NAME = 'openscience-medical-evidence';
export const BUILTIN_RESEARCH_EVIDENCE_ID = 'builtin-research-evidence';
export const BUILTIN_RESEARCH_EVIDENCE_NAME = 'openscience-research-evidence';
export const BUILTIN_SCIENCE_ARTIFACT_ID = 'builtin-science-artifact';
export const BUILTIN_SCIENCE_ARTIFACT_NAME = 'openscience-science-artifact';
export const BUILTIN_LAB_SKILL_ID = 'builtin-lab-skill';
export const BUILTIN_LAB_SKILL_NAME = 'openscience-lab-skill';
export const BUILTIN_USER_INPUT_ID = 'builtin-user-input';
export const BUILTIN_USER_INPUT_NAME = 'openscience-user-input';
export const BUILTIN_BIO_RUNTIME_ID = 'builtin-bio-runtime';
export const BUILTIN_BIO_RUNTIME_NAME = 'openscience-bio-runtime';
export const BUILTIN_BIO_SOURCE_ID = 'builtin-bio-source';
export const BUILTIN_BIO_SOURCE_NAME = 'openscience-bio-source';
export const BUILTIN_BIO_KNOWLEDGE_ID = 'builtin-bio-knowledge';
export const BUILTIN_BIO_KNOWLEDGE_NAME = 'openscience-bio-knowledge';
export const BUILTIN_BIO_PLOT_ID = 'builtin-bio-plot';
export const BUILTIN_BIO_PLOT_NAME = 'openscience-bio-plot';
export const BUILTIN_BIO_BENCHMARK_ID = 'builtin-bio-benchmark';
export const BUILTIN_BIO_BENCHMARK_NAME = 'openscience-bio-benchmark';
export const BUILTIN_BIO_REPRODUCTION_ID = 'builtin-bio-reproduction';
export const BUILTIN_BIO_REPRODUCTION_NAME = 'openscience-bio-reproduction';
export const BUILTIN_BIO_ANALYSIS_ID = 'builtin-bio-analysis';
export const BUILTIN_BIO_ANALYSIS_NAME = 'openscience-bio-analysis';
export const BUILTIN_BIO_STATISTICS_ID = 'builtin-bio-statistics';
export const BUILTIN_BIO_STATISTICS_NAME = 'openscience-bio-statistics';
export const BUILTIN_PYMOL_ID = 'builtin-pymol';
export const BUILTIN_PYMOL_NAME = 'openscience-pymol';

export function isBuiltinImageGenName(name?: string | null): boolean {
  if (!name) return false;
  return (
    name === BUILTIN_IMAGE_GEN_NAME ||
    BUILTIN_IMAGE_GEN_LEGACY_NAMES.includes(name as (typeof BUILTIN_IMAGE_GEN_LEGACY_NAMES)[number])
  );
}

export function isBuiltinImageGenTransport(transport?: {
  type?: string;
  command?: string;
  args?: string[] | null;
}): boolean {
  if (!transport || transport.type !== 'stdio' || transport.command !== 'node') {
    return false;
  }

  return (transport.args || []).some((arg) => typeof arg === 'string' && arg.includes('builtin-mcp-image-gen.js'));
}
