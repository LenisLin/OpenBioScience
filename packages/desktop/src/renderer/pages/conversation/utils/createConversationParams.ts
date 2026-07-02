/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import { LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';
import type { TProviderWithModel } from '@/common/config/storage';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { getFullAutoMode } from '@/common/types/agent/agentModes';
import { DEFAULT_CODEX_MODEL_ID } from '@/common/types/codex/codexModels';
import { CODEX_MODE_NATIVE_FULL_ACCESS, normalizeCodexMode } from '@/common/types/codex/codexModes';
import { resolveLocaleKey } from '@/common/utils';
import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
} from '@/common/utils/buildAgentConversationParams';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { getAgents } from '@/renderer/hooks/agent/useAgents';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { getPreferredThoughtLevel } from '@/renderer/pages/guid/hooks/agentSelectionUtils';

type ModePreference = {
  preferredMode?: string;
  yoloMode?: boolean;
};

const LEGACY_YOLO_MODE_MAP: Partial<Record<string, string>> = {
  claude: 'bypassPermissions',
  codex: CODEX_MODE_NATIVE_FULL_ACCESS,
  qwen: 'yolo',
};

async function resolvePreferredMode(backend: string): Promise<string | undefined> {
  const modeOptions = getAgentModes(backend);
  if (modeOptions.length === 0) {
    return undefined;
  }

  const acpConfig = configService.get('acp.config');
  const preference: ModePreference | undefined = acpConfig?.[backend as string];

  const normalizedPreferredMode =
    backend === 'codex' ? normalizeCodexMode(preference?.preferredMode) : preference?.preferredMode;
  if (normalizedPreferredMode && modeOptions.some((option) => option.value === normalizedPreferredMode)) {
    return normalizedPreferredMode;
  }

  const legacyMode = LEGACY_YOLO_MODE_MAP[backend];
  if (preference?.yoloMode && legacyMode && modeOptions.some((option) => option.value === legacyMode)) {
    return legacyMode;
  }

  const fullAutoMode = getFullAutoMode(backend);
  if (modeOptions.some((option) => option.value === fullAutoMode)) {
    return fullAutoMode;
  }

  return undefined;
}

async function resolvePreferredAcpModelId(backend: string): Promise<string | undefined> {
  const acpConfig = configService.get('acp.config');
  const backendConfig = acpConfig?.[backend as string] as { preferredModelId?: string } | undefined;
  const preferredModelId = backendConfig?.preferredModelId;
  if (typeof preferredModelId === 'string' && preferredModelId.trim().length > 0) {
    return preferredModelId;
  }

  if (backend === 'codex') {
    return DEFAULT_CODEX_MODEL_ID;
  }

  // Fallback: last-seen model info persisted on the backend's agent_metadata row.
  const agents = await getAgents();
  const matched = agents.find((a) => (a.backend ?? a.agent_type) === backend);
  const handshakeModels = matched?.handshake?.available_models as AcpModelInfo | undefined;
  const handshakeModelId = handshakeModels?.current_model_id;
  if (typeof handshakeModelId === 'string' && handshakeModelId.trim().length > 0) {
    return handshakeModelId;
  }

  return undefined;
}

/**
 * Build ICreateConversationParams for a CLI agent.
 * The backend will automatically fill in derived fields (gateway.cli_path, runtimeValidation, etc.).
 */
export async function buildCliAgentParams(agent: AgentMetadata, workspace: string): Promise<ICreateConversationParams> {
  const rawAgentKey = agent.backend || agent.agent_type;
  const agentKey = rawAgentKey === LEGACY_LOCAL_RUNTIME_ID ? 'codex' : rawAgentKey;
  const type = getConversationTypeForBackend(agentKey);
  const preferredMode = await resolvePreferredMode(agentKey);
  const preferredAcpModelId = type === 'acp' ? await resolvePreferredAcpModelId(agentKey) : undefined;
  const preferredThoughtLevel = type === 'acp' ? getPreferredThoughtLevel(agentKey) : undefined;

  const model = {} as TProviderWithModel;

  return buildAgentConversationParams({
    backend: agentKey,
    name: agent.name,
    agent_id: agent.id,
    agent_name: agent.name,
    workspace,
    model,
    session_mode: preferredMode,
    current_model_id: preferredAcpModelId,
    thought_level: preferredThoughtLevel,
  });
}

/**
 * Build ICreateConversationParams for a preset assistant.
 * Applies 4-layer fallback for reading rules and skills (BUG-1 fix).
 * Uses resolveLocaleKey() to convert i18n.language to standard locale format (BUG-2 fix).
 */
export async function buildPresetAssistantParams(
  assistant: Assistant,
  workspace: string,
  language: string
): Promise<ICreateConversationParams> {
  const requestedPresetAgentType = assistant.preset_agent_type || 'codex';
  const preset_agent_type = requestedPresetAgentType === LEGACY_LOCAL_RUNTIME_ID ? 'codex' : requestedPresetAgentType;
  const custom_agent_id = assistant.id;

  const localeKey = resolveLocaleKey(language);

  const preferredMode = await resolvePreferredMode(preset_agent_type);
  const type = getConversationTypeForBackend(preset_agent_type);
  const preferredAcpModelId = type === 'acp' ? await resolvePreferredAcpModelId(preset_agent_type) : undefined;
  const preferredThoughtLevel = type === 'acp' ? getPreferredThoughtLevel(preset_agent_type) : undefined;
  const model = {} as TProviderWithModel;

  return buildAgentConversationParams({
    backend: preset_agent_type,
    name: assistant.name,
    agent_name: assistant.name,
    workspace,
    custom_agent_id,
    is_preset: true,
    preset_agent_type,
    assistant_locale: localeKey,
    assistant_conversation_overrides: {
      model: preferredAcpModelId,
      skill_ids: assistant.enabled_skills.length > 0 ? assistant.enabled_skills : undefined,
      disabled_builtin_skill_ids:
        assistant.disabled_builtin_skills.length > 0 ? assistant.disabled_builtin_skills : undefined,
    },
    model,
    session_mode: preferredMode,
    current_model_id: preferredAcpModelId,
    thought_level: preferredThoughtLevel,
  });
}
