/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlatformServices } from '@/common/platform';
import { legacyEnvName } from '@/common/config/legacyIdentifiers';

/**
 * Returns baseName unchanged in release builds, or baseName + '-dev' in dev builds.
 * When the multi-instance env flag is enabled, appends '-2' to isolate the second dev instance.
 * Used to isolate symlink and directory names between environments.
 */
export function getEnvAwareName(baseName: string): string {
  if (getPlatformServices().paths.isPackaged() === true) return baseName;
  const multiInstance =
    process.env.DEEPORGANISER_MULTI_INSTANCE === '1' || process.env[legacyEnvName('MULTI_INSTANCE')] === '1';
  const suffix = multiInstance ? '-dev-2' : '-dev';
  return `${baseName}${suffix}`;
}
