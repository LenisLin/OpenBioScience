/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConfigKeyMap } from './configKeys';
import { resolvePaperclipCredentialFields } from './paperclipConfig';

export const RESEARCH_EVIDENCE_ENV_KEYS = {
  apiKey: 'PAPERCLIP_API_KEY',
  paperclipEnabled: 'PAPERCLIP_ENABLED',
  baseUrl: 'PAPERCLIP_BASE_URL',
  defaultSources: 'PAPERCLIP_DEFAULT_SOURCES',
  timeoutMs: 'PAPERCLIP_TIMEOUT_MS',
  enabledProviders: 'OPENSCIENCE_RESEARCH_EVIDENCE_PROVIDERS',
  bioToolsEnabled: 'OPENSCIENCE_BIO_TOOLS_ENABLED',
  bioToolsPythonPath: 'OPENSCIENCE_BIO_TOOLS_PYTHON',
  bioToolsServerRoot: 'OPENSCIENCE_BIO_TOOLS_SERVER_ROOT',
  bioToolsDefaultDomains: 'OPENSCIENCE_BIO_TOOLS_DOMAINS',
} as const;

const DEFAULT_PAPERCLIP_BASE_URL = 'https://paperclip.gxl.ai';
const DEFAULT_PAPERCLIP_SOURCES = ['pmc', 'abstracts', 'biorxiv', 'medrxiv', 'arxiv'] as const;
const DEFAULT_BIO_TOOLS_DOMAINS = [
  'pubmed',
  'biorxiv',
  'chembl',
  'structures-interactions',
  'omics-archives',
  'genes-ontologies',
  'cancer-singlecell',
] as const;

const resolveBioToolsEnabled = (
  config?: ConfigKeyMap['tools.researchEvidence'],
  existingEnv?: Record<string, string>
): boolean => {
  if (typeof config?.bioToolsEnabled === 'boolean') return config.bioToolsEnabled;
  const envValue = existingEnv?.[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsEnabled]?.trim().toLowerCase();
  if (envValue === 'false' || envValue === '0' || envValue === 'no') return false;
  return true;
};

export type ResearchEvidenceMcpEnvResolveResult =
  | {
      ok: true;
      env: Record<string, string>;
      config: NonNullable<ConfigKeyMap['tools.researchEvidence']>;
    }
  | {
      ok: false;
      reason: 'no_provider';
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
  const paperclipReady = Boolean(apiKey);
  const bioToolsEnabled = resolveBioToolsEnabled(config, existingEnv);
  const bioToolsDefaultDomains = config?.bioToolsDefaultDomains?.length
    ? config.bioToolsDefaultDomains
    : (existingEnv?.[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsDefaultDomains]?.split(',').filter(Boolean) ?? [
        ...DEFAULT_BIO_TOOLS_DOMAINS,
      ]);
  const enabledProviders = [paperclipReady ? 'paperclip' : undefined, bioToolsEnabled ? 'bio_tools' : undefined].filter(
    Boolean
  ) as string[];

  const env: Record<string, string> = {
    [RESEARCH_EVIDENCE_ENV_KEYS.paperclipEnabled]: paperclipReady ? 'true' : 'false',
    [RESEARCH_EVIDENCE_ENV_KEYS.baseUrl]: baseUrl,
    [RESEARCH_EVIDENCE_ENV_KEYS.defaultSources]: defaultSources.join(','),
    [RESEARCH_EVIDENCE_ENV_KEYS.timeoutMs]: String(timeoutMs),
    [RESEARCH_EVIDENCE_ENV_KEYS.enabledProviders]: enabledProviders.join(','),
    [RESEARCH_EVIDENCE_ENV_KEYS.bioToolsEnabled]: bioToolsEnabled ? 'true' : 'false',
    [RESEARCH_EVIDENCE_ENV_KEYS.bioToolsDefaultDomains]: bioToolsDefaultDomains.join(','),
  };

  if (apiKey) {
    env[RESEARCH_EVIDENCE_ENV_KEYS.apiKey] = apiKey;
  }
  if (config?.bioToolsPythonPath?.trim()) {
    env[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsPythonPath] = config.bioToolsPythonPath.trim();
  } else if (existingEnv?.[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsPythonPath]?.trim()) {
    env[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsPythonPath] =
      existingEnv[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsPythonPath].trim();
  }
  if (config?.bioToolsServerRoot?.trim()) {
    env[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsServerRoot] = config.bioToolsServerRoot.trim();
  } else if (existingEnv?.[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsServerRoot]?.trim()) {
    env[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsServerRoot] =
      existingEnv[RESEARCH_EVIDENCE_ENV_KEYS.bioToolsServerRoot].trim();
  }

  if (enabledProviders.length) {
    return {
      ok: true,
      env,
      config: {
        ...config,
        paperclipApiKey: apiKey,
        paperclipBaseUrl: baseUrl,
        defaultSources,
        timeoutMs,
        bioToolsEnabled,
        bioToolsDefaultDomains,
      },
    };
  }

  return {
    ok: false,
    reason: 'no_provider',
    message: 'No research evidence provider is configured.',
    env,
    config,
  };
}
