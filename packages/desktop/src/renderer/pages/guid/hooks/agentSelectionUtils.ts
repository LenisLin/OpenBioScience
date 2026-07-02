/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import type { AgentSource } from '@/renderer/utils/model/agentTypes';

/** Save preferred mode to the agent's own config key */
export async function savePreferredMode(agentKey: string, mode: string): Promise<void> {
  try {
    if (agentKey !== 'custom') {
      const config = configService.get('acp.config');
      const backendConfig = config?.[agentKey as string] || {};
      await configService.set('acp.config', { ...config, [agentKey]: { ...backendConfig, preferredMode: mode } });
    }
  } catch {
    /* silent */
  }
}

/** Save preferred model ID to the agent's acp.config key */
export async function savePreferredModelId(agentKey: string, model_id: string): Promise<void> {
  try {
    const config = configService.get('acp.config');
    const backendConfig = config?.[agentKey as string] || {};
    await configService.set('acp.config', { ...config, [agentKey]: { ...backendConfig, preferredModelId: model_id } });
  } catch {
    /* silent */
  }
}

export function getPreferredThoughtLevel(agentKey: string | undefined): string | undefined {
  if (!agentKey) return undefined;
  const config = configService.get('acp.config');
  const value = config?.[agentKey as string]?.preferredThoughtLevel;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Save preferred thought level to the agent's acp.config key */
export async function savePreferredThoughtLevel(agentKey: string, thoughtLevel: string): Promise<void> {
  try {
    const value = thoughtLevel.trim();
    if (!agentKey || !value) return;
    const config = configService.get('acp.config');
    const backendConfig = config?.[agentKey as string] || {};
    await configService.set('acp.config', {
      ...config,
      [agentKey]: { ...backendConfig, preferredThoughtLevel: value },
    });
  } catch {
    /* silent */
  }
}

/**
 * Get agent key for selection.
 *
 * Rows that are row-scoped (custom ACP / remote agents) use `agent.id` directly
 * as the key — no namespace prefix. Builtin / internal agents keep `backend` or
 * `agent_type` as the key since there is only one row per type.
 */
export const getAgentKey = (agent: {
  agent_type: string;
  agent_source?: AgentSource;
  backend?: string;
  id?: string;
  is_preset?: boolean;
}): string => {
  const rowScoped = agent.agent_type === 'remote' || agent.agent_source === 'custom';
  if (rowScoped && agent.id) return agent.id;
  return agent.backend || agent.agent_type;
};
