/**
 * @license
 * Copyright 2026 OpenScience (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CdnGenericProvider } from './cdnGenericProvider';
import type { CdnGenericProviderConfiguration } from './cdnGenericProvider';
import { legacyEnvName } from '@/common/config/legacyIdentifiers';

export const DEFAULT_UPDATE_BASE_URL = 'https://deepscientist.cc/openscience';

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export function getUpdateBaseUrl(): string {
  return trimTrailingSlash(
    process.env.DEEPORGANISER_UPDATE_BASE_URL?.trim() ||
      process.env[legacyEnvName('UPDATE_BASE_URL')]?.trim() ||
      DEFAULT_UPDATE_BASE_URL
  );
}

export const CDN_UPDATE_BASE_URL = getUpdateBaseUrl();

export type CdnFeedOptions = CdnGenericProviderConfiguration & {
  updateProvider: typeof CdnGenericProvider;
};

export function buildCdnFeedOptions(): CdnFeedOptions {
  return {
    provider: 'custom',
    url: CDN_UPDATE_BASE_URL,
    updateProvider: CdnGenericProvider,
  };
}
