/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConfigKeyMap } from './configKeys';

export const MEDICAL_EVIDENCE_ENV_KEYS = {
  apiKey: 'PAPERCLIP_API_KEY',
  baseUrl: 'PAPERCLIP_BASE_URL',
  defaultSources: 'PAPERCLIP_DEFAULT_SOURCES',
  strictAnchors: 'DEEPORGANISER_MEDICAL_EVIDENCE_STRICT_ANCHORS',
  timeoutMs: 'PAPERCLIP_TIMEOUT_MS',
} as const;

const DEFAULT_PAPERCLIP_BASE_URL = 'https://paperclip.gxl.ai';
const DEFAULT_PAPERCLIP_SOURCES = ['pmc', 'abstracts', 'fda', 'clinicaltrials'] as const;

export type MedicalEvidenceMcpEnvResolveResult =
  | {
      ok: true;
      env: Record<string, string>;
      config: NonNullable<ConfigKeyMap['tools.medicalEvidence']>;
    }
  | {
      ok: false;
      reason: 'missing_api_key';
      message: string;
      env: Record<string, string>;
      config?: ConfigKeyMap['tools.medicalEvidence'];
    };

export function removeMedicalEvidenceEnvKeys(env?: Record<string, string>): Record<string, string> {
  const next = { ...(env || {}) };
  for (const key of Object.values(MEDICAL_EVIDENCE_ENV_KEYS)) {
    delete next[key];
  }
  return next;
}

export function resolveMedicalEvidenceMcpEnv(
  config?: ConfigKeyMap['tools.medicalEvidence'],
  existingEnv?: Record<string, string>
): MedicalEvidenceMcpEnvResolveResult {
  const apiKey = config?.paperclipApiKey?.trim() || existingEnv?.[MEDICAL_EVIDENCE_ENV_KEYS.apiKey]?.trim();
  const baseUrl =
    config?.paperclipBaseUrl?.trim() ||
    existingEnv?.[MEDICAL_EVIDENCE_ENV_KEYS.baseUrl]?.trim() ||
    DEFAULT_PAPERCLIP_BASE_URL;
  const defaultSources = config?.defaultSources?.length
    ? config.defaultSources
    : (existingEnv?.[MEDICAL_EVIDENCE_ENV_KEYS.defaultSources]?.split(',').filter(Boolean) ?? DEFAULT_PAPERCLIP_SOURCES);
  const timeoutMs = config?.timeoutMs || Number(existingEnv?.[MEDICAL_EVIDENCE_ENV_KEYS.timeoutMs]) || 30000;
  const strictAnchors = config?.strictAnchors !== false;

  const env: Record<string, string> = {
    [MEDICAL_EVIDENCE_ENV_KEYS.baseUrl]: baseUrl,
    [MEDICAL_EVIDENCE_ENV_KEYS.defaultSources]: defaultSources.join(','),
    [MEDICAL_EVIDENCE_ENV_KEYS.strictAnchors]: strictAnchors ? 'true' : 'false',
    [MEDICAL_EVIDENCE_ENV_KEYS.timeoutMs]: String(timeoutMs),
  };

  if (apiKey) {
    env[MEDICAL_EVIDENCE_ENV_KEYS.apiKey] = apiKey;
    return {
      ok: true,
      env,
      config: {
        ...config,
        paperclipApiKey: apiKey,
        paperclipBaseUrl: baseUrl,
        defaultSources: defaultSources as NonNullable<ConfigKeyMap['tools.medicalEvidence']>['defaultSources'],
        timeoutMs,
        strictAnchors,
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

