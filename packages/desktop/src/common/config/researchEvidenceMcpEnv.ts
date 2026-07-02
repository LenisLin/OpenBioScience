/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConfigKeyMap } from './configKeys';
import { resolvePaperclipCredentialFields } from './paperclipConfig';

export const RESEARCH_EVIDENCE_ENV_KEYS = {
  apiKey: 'PAPERCLIP_API_KEY',
  baseUrl: 'PAPERCLIP_BASE_URL',
  defaultSources: 'PAPERCLIP_DEFAULT_SOURCES',
  timeoutMs: 'PAPERCLIP_TIMEOUT_MS',
} as const;

const DEFAULT_PAPERCLIP_BASE_URL = 'https://paperclip.gxl.ai';
const DEFAULT_PAPERCLIP_SOURCES = ['pmc', 'abstracts', 'biorxiv', 'medrxiv', 'arxiv'] as const;

export type ResearchEvidenceMcpEnvResolveResult =
  | {
      ok: true;
      env: Record<string, string>;
      config: NonNullable<ConfigKeyMap['tools.researchEvidence']>;
    }
  | {
      ok: false;
      reason: 'missing_api_key';
      message: string;
      env: Record<string, string>;
      config?: ConfigKeyMap['tools.researchEvidence'];
    };

export function removeResearchEvidenceEnvKeys(env?: Record<string, string>): Record<string, string> {
  const next = { ...env };
  for (const key of Object.values(RESEARCH_EVIDENCE_ENV_KEYS)) {
    delete next[key];
  }
  return next;
}

export function resolveResearchEvidenceMcpEnv(
  config?: ConfigKeyMap['tools.researchEvidence'],
  existingEnv?: Record<string, string>,
  fallbackMedicalConfig?: ConfigKeyMap['tools.medicalEvidence']
): ResearchEvidenceMcpEnvResolveResult {
  const shared = resolvePaperclipCredentialFields(
    config,
    fallbackMedicalConfig,
    existingEnv,
    RESEARCH_EVIDENCE_ENV_KEYS,
    {
      paperclipBaseUrl: DEFAULT_PAPERCLIP_BASE_URL,
      timeoutMs: 30000,
    }
  );
  const apiKey = shared.paperclipApiKey;
  const baseUrl = shared.paperclipBaseUrl;
  const defaultSources = config?.defaultSources?.length
    ? config.defaultSources
    : (existingEnv?.[RESEARCH_EVIDENCE_ENV_KEYS.defaultSources]?.split(',').filter(Boolean) ?? [
        ...DEFAULT_PAPERCLIP_SOURCES,
      ]);
  const timeoutMs = shared.timeoutMs;

  const env: Record<string, string> = {
    [RESEARCH_EVIDENCE_ENV_KEYS.baseUrl]: baseUrl,
    [RESEARCH_EVIDENCE_ENV_KEYS.defaultSources]: defaultSources.join(','),
    [RESEARCH_EVIDENCE_ENV_KEYS.timeoutMs]: String(timeoutMs),
  };

  if (apiKey) {
    env[RESEARCH_EVIDENCE_ENV_KEYS.apiKey] = apiKey;
    return {
      ok: true,
      env,
      config: {
        ...config,
        paperclipApiKey: apiKey,
        paperclipBaseUrl: baseUrl,
        defaultSources,
        timeoutMs,
      },
    };
  }

  return {
    ok: false,
    reason: 'missing_api_key',
    message: 'PaperClip API key is not configured.',
    env,
    config,
  };
}
