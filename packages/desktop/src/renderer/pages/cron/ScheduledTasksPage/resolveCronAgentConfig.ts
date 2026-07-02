/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CODEX_MODE_NATIVE_FULL_ACCESS } from '@/common/types/codex/codexModes';
import type { ICreateCronJobParams, ICronAgentConfig } from '@/common/adapter/ipcBridge';
import { LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { AgentMetadata } from '@renderer/utils/model/agentTypes';
import { resolveSupportedConversationType } from '@renderer/utils/model/agentTypeSupportPolicy';

type ResolveCronAgentConfigInput = {
  agentValue: string;
  conversationAgentType?: string;
  cliAgents: AgentMetadata[];
  presetAssistants: Assistant[];
  model_id?: string;
  config_options?: Record<string, string>;
  workspace?: string;
  getMode: (backend: string) => string | undefined;
};

type ResolveCronAgentConfigResult = {
  agent_config: ICronAgentConfig | undefined;
  resolvedAgentType: ICreateCronJobParams['agent_type'];
};

export function resolveCronAgentConfig(input: ResolveCronAgentConfigInput): ResolveCronAgentConfigResult {
  const {
    agentValue,
    conversationAgentType,
    cliAgents,
    presetAssistants,
    model_id,
    config_options,
    workspace,
    getMode,
  } = input;

  const colonIdx = agentValue.indexOf(':');
  const agentKind = colonIdx >= 0 ? agentValue.substring(0, colonIdx) : 'cli';
  const agentId = colonIdx >= 0 ? agentValue.substring(colonIdx + 1) : agentValue;

  let agent_config: ICronAgentConfig | undefined;
  let resolvedAgentType: ICreateCronJobParams['agent_type'] = resolveSupportedConversationType(
    conversationAgentType || 'acp'
  );

  if (agentKind === 'cli') {
    const agent = cliAgents.find((item) => item.backend === agentId || item.agent_type === agentId);
    const rawBackend = (agent?.backend || agent?.agent_type || agentId) as string;
    const backend = rawBackend === LEGACY_LOCAL_RUNTIME_ID ? 'codex' : rawBackend;

    if (agent?.agent_type === 'acp' || rawBackend === LEGACY_LOCAL_RUNTIME_ID) {
      const capitalizedBackend = backend.charAt(0).toUpperCase() + backend.slice(1);
      resolvedAgentType = 'acp';
      agent_config = {
        backend,
        name: agent.name || capitalizedBackend,
        mode: getMode(backend) || (backend === 'codex' ? CODEX_MODE_NATIVE_FULL_ACCESS : undefined),
        model_id,
        config_options,
        workspace,
      };
    } else if (agent) {
      resolvedAgentType = resolveSupportedConversationType(backend);
    }
  } else if (agentKind === 'preset') {
    const assistant = presetAssistants.find((item) => item.id === agentId);
    if (assistant) {
      const presetBackend = assistant.preset_agent_type === LEGACY_LOCAL_RUNTIME_ID ? 'codex' : assistant.preset_agent_type;
      resolvedAgentType = resolveSupportedConversationType(presetBackend);

      agent_config = {
        backend: presetBackend as string,
        name: assistant.name,
        is_preset: true,
        custom_agent_id: assistant.id,
        preset_agent_type: presetBackend,
        mode: getMode(presetBackend) || (presetBackend === 'codex' ? CODEX_MODE_NATIVE_FULL_ACCESS : undefined),
        model_id,
        config_options,
        workspace,
      };
    }
  }

  return { agent_config, resolvedAgentType };
}
