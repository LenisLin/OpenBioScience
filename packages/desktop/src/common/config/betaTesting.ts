/**
 * @license
 * Copyright 2026 OpenScience
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BetaTestingConfig {
  enabled?: boolean;
  leaderAgentEnabled?: boolean;
}

export const DEFAULT_BETA_TESTING_CONFIG: Required<BetaTestingConfig> = {
  enabled: false,
  leaderAgentEnabled: true,
};

export function normalizeBetaTestingConfig(value?: BetaTestingConfig): Required<BetaTestingConfig> {
  return {
    ...DEFAULT_BETA_TESTING_CONFIG,
    ...value,
  };
}

export function isLeaderAgentBetaEnabled(value?: BetaTestingConfig): boolean {
  const config = normalizeBetaTestingConfig(value);
  return config.enabled && config.leaderAgentEnabled !== false;
}
