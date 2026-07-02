/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { LEGACY_APP_NAMESPACE } from '@/common/config/legacyIdentifiers';

// Keep this constant local to avoid pulling in common/config/storage side effects
// when the built-in MCP server boots in a standalone stdio process.
export const BUILTIN_IMAGE_GEN_ID = 'builtin-image-gen';
export const BUILTIN_IMAGE_GEN_NAME = 'deeporganiser-image-generation';
export const BUILTIN_IMAGE_GEN_LEGACY_NAMES = [
  'DeepOrganiser Image Generation',
  BUILTIN_IMAGE_GEN_ID,
  `${LEGACY_APP_NAMESPACE}-image-generation`,
] as const;
export const BUILTIN_LARK_PROJECT_AGENT_ID = 'builtin-lark-project-agent';
export const BUILTIN_LARK_PROJECT_AGENT_NAME = 'deeporganiser-lark-project-agent';
export const BUILTIN_MEDICAL_EVIDENCE_ID = 'builtin-medical-evidence';
export const BUILTIN_MEDICAL_EVIDENCE_NAME = 'deeporganiser-medical-evidence';

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
