/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { LEGACY_LOCAL_RUNTIME_ID, isLegacyLocalRuntimeAgent } from '@/common/config/legacyIdentifiers';

type BackendAgentRow = {
  id?: string;
  name?: string;
  agent_type?: string;
  backend?: string;
  enabled?: boolean;
};

type AgentListResponse = {
  success?: boolean;
  data?: BackendAgentRow[];
};

type BackendAssistantRow = {
  id?: string;
  preset_agent_type?: string;
};

type AssistantListResponse = {
  success?: boolean;
  data?: BackendAssistantRow[];
};

async function disableDeprecatedAgentRows(backendPort: number): Promise<void> {
  try {
    const listResponse = await fetch(`http://127.0.0.1:${backendPort}/api/agents?include_disabled=true`);
    if (!listResponse.ok) {
      console.warn(`[DeepOrganiser] Deprecated local runtime check skipped: /api/agents returned ${listResponse.status}`);
      return;
    }

    const payload = (await listResponse.json()) as AgentListResponse | BackendAgentRow[];
    const agents = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(agents)) {
      return;
    }

    const staleAgents = agents.filter((agent) => isLegacyLocalRuntimeAgent(agent) && agent.enabled !== false && agent.id);
    await Promise.all(
      staleAgents.map(async (agent) => {
        const response = await fetch(`http://127.0.0.1:${backendPort}/api/agents/${encodeURIComponent(agent.id!)}/enabled`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          console.warn(`[DeepOrganiser] Failed to disable deprecated local runtime ${agent.id}: ${response.status} ${text}`);
          return;
        }
        console.info(`[DeepOrganiser] Disabled deprecated local runtime ${agent.id}; Codex remains the default local agent.`);
      })
    );
  } catch (error) {
    console.warn('[DeepOrganiser] Deprecated local runtime check failed:', error);
  }
}

async function migrateDeprecatedAssistantBackends(backendPort: number): Promise<void> {
  try {
    const listResponse = await fetch(`http://127.0.0.1:${backendPort}/api/assistants`);
    if (!listResponse.ok) {
      console.warn(`[DeepOrganiser] Deprecated assistant backend check skipped: /api/assistants returned ${listResponse.status}`);
      return;
    }

    const payload = (await listResponse.json()) as AssistantListResponse | BackendAssistantRow[];
    const assistants = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(assistants)) {
      return;
    }

    const staleAssistants = assistants.filter(
      (assistant) =>
        assistant.preset_agent_type === LEGACY_LOCAL_RUNTIME_ID && typeof assistant.id === 'string' && assistant.id.length > 0
    );
    await Promise.all(
      staleAssistants.map(async (assistant) => {
        const response = await fetch(`http://127.0.0.1:${backendPort}/api/assistants/${encodeURIComponent(assistant.id!)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset_agent_type: 'codex' }),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          console.warn(
            `[DeepOrganiser] Failed to migrate deprecated assistant backend ${assistant.id}: ${response.status} ${text}`
          );
          return;
        }
        console.info(`[DeepOrganiser] Migrated assistant ${assistant.id} from deprecated local runtime to Codex.`);
      })
    );
  } catch (error) {
    console.warn('[DeepOrganiser] Deprecated assistant backend check failed:', error);
  }
}

export async function disableDeprecatedLocalRuntime(backendPort: number): Promise<void> {
  await disableDeprecatedAgentRows(backendPort);
  await migrateDeprecatedAssistantBackends(backendPort);
}
