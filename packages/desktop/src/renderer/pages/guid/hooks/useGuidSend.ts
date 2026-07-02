/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  buildMedicalEvidenceConversationExtra,
  buildMedicalEvidenceModePrompt,
  DEFAULT_MEDICAL_EVIDENCE_SKILL_IDS,
} from '@/common/chat/medicalEvidence';
import { normalizeMedicalEvidenceSources } from '@/common/chat/medicalEvidenceDefaults';
import {
  buildLabSkillDepositionConversationExtra,
  buildLabSkillDepositionModePrompt,
} from '@/common/chat/labSkillDeposition';
import {
  buildScienceConversationExtra,
  buildScienceModePrompt,
  DEFAULT_SCIENCE_SKILL_IDS,
  SCIENCE_WORKFLOW_SKILL_NAME,
} from '@/common/chat/science';
import { buildComputeConversationExtra } from '@/common/chat/compute';
import { configService } from '@/common/config/configService';
import { LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';
import { applyPaperclipCredentialFallback } from '@/common/config/paperclipConfig';
import {
  BUILTIN_MEDICAL_EVIDENCE_NAME,
  BUILTIN_IMAGE_GEN_NAME,
  BUILTIN_LAB_SKILL_NAME,
  BUILTIN_RESEARCH_EVIDENCE_NAME,
  BUILTIN_SCIENCE_ARTIFACT_NAME,
  BUILTIN_USER_INPUT_NAME,
  type IMcpServer,
  type ISessionMcpServer,
  type TProviderWithModel,
} from '@/common/config/storage';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';
import { ensureBackendMcpCatalog, toSessionMcpServer } from '@/renderer/hooks/mcp/catalog';
import { emitter } from '@/renderer/utils/emitter';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { type TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { mutate as swrMutate } from 'swr';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import type { AcpModelInfo, AvailableAgent, EffectiveAgentInfo } from '../types';
import { getPreferredThoughtLevel } from './agentSelectionUtils';
import {
  createLoopGoalState,
  buildLoopGoalKickoffPrompt,
  summarizeLoopGoal,
  type LoopGoalState,
} from '@/common/chat/loopGoal';

const normalizeLegacyBackend = (backend: string | undefined): string | undefined =>
  backend === LEGACY_LOCAL_RUNTIME_ID ? 'codex' : backend;

const appendPrompt = (...parts: Array<string | undefined>): string | undefined => {
  const value = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
  return value || undefined;
};

const mergeSessionMcpServers = (servers: ISessionMcpServer[]): ISessionMcpServer[] => {
  const byId = new Map<string, ISessionMcpServer>();
  for (const server of servers) {
    byId.set(server.id || server.name, server);
  }
  return [...byId.values()];
};

const mergeSkillIds = (...groups: Array<readonly string[] | undefined>): string[] | undefined => {
  const values = groups.flatMap((group) => group || []);
  if (!values.length) return undefined;
  return Array.from(new Set(values));
};

const resolveBuiltinSessionMcpServer = (
  availableMcpServers: IMcpServer[],
  name: string
): ISessionMcpServer | undefined => {
  const server = availableMcpServers.find((item) => item.name === name);
  return server ? toSessionMcpServer(server) : undefined;
};

const hasBuiltinMcpServer = (servers: IMcpServer[], name: string): boolean =>
  servers.some((server) => server.name === name && server.builtin === true);

const resolveModeMcpCatalog = async (
  availableMcpServers: IMcpServer[],
  requiredBuiltinNames: string[]
): Promise<IMcpServer[]> => {
  if (!requiredBuiltinNames.length) return availableMcpServers;
  if (requiredBuiltinNames.every((name) => hasBuiltinMcpServer(availableMcpServers, name))) {
    return availableMcpServers;
  }

  try {
    const { allServers } = await ensureBackendMcpCatalog();
    return requiredBuiltinNames.every((name) => hasBuiltinMcpServer(allServers, name)) ? allServers : availableMcpServers;
  } catch (error) {
    console.warn('[useGuidSend] Failed to refresh MCP catalog before mode send:', error);
    return availableMcpServers;
  }
};

const resolveMedicalEvidenceSessionMcpServer = (
  availableMcpServers: IMcpServer[],
  apiKey?: string,
  baseUrl?: string
): ISessionMcpServer | undefined => {
  const server = availableMcpServers.find((item) => item.name === BUILTIN_MEDICAL_EVIDENCE_NAME);
  if (!server) return undefined;
  const sessionServer = toSessionMcpServer(server);
  if (sessionServer.transport.type !== 'stdio') return sessionServer;
  return {
    ...sessionServer,
    transport: {
      ...sessionServer.transport,
      env: {
        ...sessionServer.transport.env,
        ...(apiKey ? { PAPERCLIP_API_KEY: apiKey } : {}),
        ...(baseUrl ? { PAPERCLIP_BASE_URL: baseUrl } : {}),
      },
    },
  };
};

const resolveResearchEvidenceSessionMcpServer = (
  availableMcpServers: IMcpServer[],
  apiKey?: string,
  baseUrl?: string
): ISessionMcpServer | undefined => {
  const server = availableMcpServers.find((item) => item.name === BUILTIN_RESEARCH_EVIDENCE_NAME);
  if (!server) return undefined;
  const sessionServer = toSessionMcpServer(server);
  if (sessionServer.transport.type !== 'stdio') return sessionServer;
  return {
    ...sessionServer,
    transport: {
      ...sessionServer.transport,
      env: {
        ...sessionServer.transport.env,
        ...(apiKey ? { PAPERCLIP_API_KEY: apiKey } : {}),
        ...(baseUrl ? { PAPERCLIP_BASE_URL: baseUrl } : {}),
      },
    },
  };
};

const resolveScienceArtifactSessionMcpServer = (
  availableMcpServers: IMcpServer[],
  config?: { strictProvenance?: boolean; writeProjectManifest?: boolean; defaultSkillIds?: string[] }
): ISessionMcpServer | undefined => {
  const server = availableMcpServers.find((item) => item.name === BUILTIN_SCIENCE_ARTIFACT_NAME);
  if (!server) return undefined;
  const sessionServer = toSessionMcpServer(server);
  if (sessionServer.transport.type !== 'stdio') return sessionServer;
  return {
    ...sessionServer,
    transport: {
      ...sessionServer.transport,
      env: {
        ...sessionServer.transport.env,
        OPENSCIENCE_STRICT_PROVENANCE: config?.strictProvenance ? 'true' : 'false',
        OPENSCIENCE_WRITE_PROJECT_MANIFEST: config?.writeProjectManifest === false ? 'false' : 'true',
        OPENSCIENCE_DEFAULT_SKILL_IDS: (config?.defaultSkillIds?.length
          ? config.defaultSkillIds
          : [...DEFAULT_SCIENCE_SKILL_IDS]
        ).join(','),
      },
    },
  };
};

export type GuidSendDeps = {
  // Input state
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  files: string[];
  setFiles: React.Dispatch<React.SetStateAction<string[]>>;
  dir: string;
  setDir: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;

  // Agent state
  selectedAgent: string;
  selectedAgentKey: string;
  selectedAgentInfo: AvailableAgent | undefined;
  is_presetAgent: boolean;
  selectedMode: string;
  selectedAcpModel: string | null;
  currentAcpCachedModelInfo: AcpModelInfo | null;
  current_model: TProviderWithModel | undefined;

  // Agent helpers
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  getEffectiveAgentType: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => EffectiveAgentInfo;
  resolveEnabledSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  guidDisabledBuiltinSkills: string[] | undefined;
  guidEnabledSkills: string[] | undefined;
  assistantDefaultSkillIds?: string[];
  assistantDefaultDisabledBuiltinSkillIds?: string[];
  availableMcpServers: IMcpServer[];
  selectedMcpServerIds: string[] | undefined;
  assistantDefaultMcpIds?: string[];
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  isGoogleAuth: boolean;
  loopGoal?: LoopGoalState;
  isLoopGoalMode?: boolean;
  onLoopGoalSent?: () => void;
  isScienceMode?: boolean;
  isMedicalEvidenceMode?: boolean;
  onMedicalEvidenceModeSent?: () => void;
  isSkillDepositionMode?: boolean;
  onSkillDepositionModeSent?: () => void;
  selectedComputeHostIds?: string[];

  // Mention state reset
  setMentionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setMentionSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionActiveIndex: React.Dispatch<React.SetStateAction<number>>;

  // Navigation
  navigate: NavigateFunction;
  t: TFunction;
  localeKey: string;
};

export type GuidSendResult = {
  handleSend: () => Promise<void>;
  sendMessageHandler: () => void;
  isButtonDisabled: boolean;
};

/**
 * Hook that manages the send logic for ACP conversations.
 */
export const useGuidSend = (deps: GuidSendDeps): GuidSendResult => {
  const {
    input,
    setInput,
    files,
    setFiles,
    dir,
    setDir,
    setLoading,
    loading,
    selectedAgent,
    selectedAgentKey,
    selectedAgentInfo,
    is_presetAgent,
    selectedMode,
    selectedAcpModel,
    currentAcpCachedModelInfo,
    current_model,
    findAgentByKey,
    getEffectiveAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds,
    assistantDefaultDisabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds,
    assistantDefaultMcpIds,
    currentEffectiveAgentInfo: _currentEffectiveAgentInfo,
    loopGoal,
    isLoopGoalMode,
    onLoopGoalSent,
    isScienceMode = true,
    isMedicalEvidenceMode,
    onMedicalEvidenceModeSent,
    isSkillDepositionMode,
    onSkillDepositionModeSent,
    selectedComputeHostIds,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    navigate,
    t,
    localeKey,
  } = deps;
  const sendingRef = useRef(false);

  const handleSend = useCallback(async () => {
    const trimmedInput = input.trim();
    const hasMedicalEvidenceMode = Boolean(isMedicalEvidenceMode);
    const hasSkillDepositionMode = Boolean(isSkillDepositionMode);
    const hasScienceMode = Boolean(isScienceMode) && !hasMedicalEvidenceMode && !hasSkillDepositionMode;
    const hasLoopGoal =
      !hasMedicalEvidenceMode &&
      !hasSkillDepositionMode &&
      Boolean(loopGoal?.goal.trim() && loopGoal.status !== 'deleted');
    const shouldCreateLoopGoalFromInput =
      !hasLoopGoal && !hasMedicalEvidenceMode && !hasSkillDepositionMode && Boolean(isLoopGoalMode && trimmedInput);
    const loopGoalForCreate = hasLoopGoal
      ? { ...loopGoal!, status: 'active' as const, updated_at: Date.now() }
      : shouldCreateLoopGoalFromInput
        ? createLoopGoalState(trimmedInput)
        : undefined;
    const conversationName =
      (loopGoalForCreate ? summarizeLoopGoal(loopGoalForCreate.goal) : undefined) ||
      trimmedInput ||
      t('conversation.newConversation', { defaultValue: 'New conversation' });
    const initialUserInput = loopGoalForCreate
      ? buildLoopGoalKickoffPrompt(loopGoalForCreate, hasLoopGoal ? trimmedInput : undefined, localeKey)
      : trimmedInput || input;
    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';

    const agentInfo = selectedAgentInfo;
    const is_preset = is_presetAgent;
    const preset_assistant_id = is_preset ? agentInfo?.custom_agent_id : undefined;

    const { agent_type: effectiveAgentType } = getEffectiveAgentType(agentInfo);
    const medicalEvidenceAgentBackend =
      normalizeLegacyBackend(is_preset ? effectiveAgentType : selectedAgent) || normalizeLegacyBackend(selectedAgent);
    const requiredBuiltinMcpNames = [
      ...(hasMedicalEvidenceMode ? [BUILTIN_MEDICAL_EVIDENCE_NAME] : []),
      ...(hasMedicalEvidenceMode && medicalEvidenceAgentBackend === 'codex' ? [BUILTIN_IMAGE_GEN_NAME] : []),
      ...(hasScienceMode ? [BUILTIN_RESEARCH_EVIDENCE_NAME, BUILTIN_SCIENCE_ARTIFACT_NAME] : []),
      ...(hasSkillDepositionMode ? [BUILTIN_LAB_SKILL_NAME] : []),
      ...(hasMedicalEvidenceMode || hasScienceMode || hasSkillDepositionMode ? [BUILTIN_USER_INPUT_NAME] : []),
    ];
    const availableMcpServersForSend = await resolveModeMcpCatalog(availableMcpServers, requiredBuiltinMcpNames);

    // Guid page's per-conversation skill overrides take precedence over the
    // assistant's saved defaults. The combined skills menu lets the user pick
    // any custom skill — not just preset-declared ones — so for non-preset
    // agents we still forward the user's selection (the backend accepts
    // `preset_enabled_skills` regardless of `is_preset`).
    const presetEnabledSkillsDefault = resolveEnabledSkills(agentInfo);
    const enabled_skills =
      guidEnabledSkills ?? (is_presetAgent ? assistantDefaultSkillIds : presetEnabledSkillsDefault);
    const base_enabled_skills_to_send = is_presetAgent
      ? enabled_skills
      : guidEnabledSkills?.length
        ? guidEnabledSkills
        : undefined;
    const loopGoalSkillIds = loopGoalForCreate ? [SCIENCE_WORKFLOW_SKILL_NAME] : undefined;
    const enabled_skills_to_send = hasMedicalEvidenceMode
      ? mergeSkillIds(base_enabled_skills_to_send, DEFAULT_MEDICAL_EVIDENCE_SKILL_IDS, loopGoalSkillIds)
      : hasScienceMode
        ? mergeSkillIds(base_enabled_skills_to_send, DEFAULT_SCIENCE_SKILL_IDS, loopGoalSkillIds)
        : mergeSkillIds(base_enabled_skills_to_send, loopGoalSkillIds);
    const excludeBuiltinSkills =
      guidDisabledBuiltinSkills ??
      (is_presetAgent ? assistantDefaultDisabledBuiltinSkillIds : resolveDisabledBuiltinSkills(agentInfo));
    const selectedAllMcpServerIds = selectedMcpServerIds ?? [];
    const selectedMcpServerIdSet = new Set(selectedAllMcpServerIds);
    const selectedUserMcpServerIds = availableMcpServersForSend
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const selectedAllSessionMcpServers = availableMcpServersForSend
      .filter((server) => selectedMcpServerIdSet.has(server.id))
      .map((server) => toSessionMcpServer(server));
    const selectedSessionMcpServers = availableMcpServersForSend
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin === true)
      .map((server) => toSessionMcpServer(server));
    const defaultSelectedMcpServerIds = assistantDefaultMcpIds;
    const defaultSelectedUserMcpServerIds = availableMcpServersForSend
      .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const assistantOverrideMcpIds =
      selectedMcpServerIds !== undefined ? selectedAllMcpServerIds : defaultSelectedMcpServerIds;
    const selectedUserMcpServerIdsToSend =
      selectedMcpServerIds !== undefined ? selectedUserMcpServerIds : defaultSelectedUserMcpServerIds;
    const selectedSessionMcpServersToSend =
      selectedMcpServerIds !== undefined
        ? selectedAllSessionMcpServers
        : availableMcpServersForSend
            .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id))
            .map((server) => toSessionMcpServer(server));

    const rawMedicalEvidenceConfig = configService.get('tools.medicalEvidence');
    const rawResearchEvidenceConfig = configService.get('tools.researchEvidence');
    const medicalEvidenceConfig = hasMedicalEvidenceMode
      ? applyPaperclipCredentialFallback(rawMedicalEvidenceConfig, rawResearchEvidenceConfig)
      : undefined;
    const medicalEvidenceSources = normalizeMedicalEvidenceSources(medicalEvidenceConfig?.defaultSources);
    const medicalEvidenceStrictAnchors = medicalEvidenceConfig?.strictAnchors !== false;
    const medicalEvidencePrompt = hasMedicalEvidenceMode
      ? buildMedicalEvidenceModePrompt(
          medicalEvidenceSources,
          medicalEvidenceStrictAnchors,
          localeKey,
          medicalEvidenceAgentBackend
        )
      : undefined;
    const sciencePrompt = hasScienceMode ? buildScienceModePrompt(finalWorkspace, localeKey) : undefined;
    const labSkillDepositionPrompt = hasSkillDepositionMode
      ? buildLabSkillDepositionModePrompt(finalWorkspace, localeKey)
      : undefined;
    const computeContext =
      selectedComputeHostIds && selectedComputeHostIds.length > 0
        ? await ipcBridge.computeHosts.buildContext.invoke({ hostIds: selectedComputeHostIds })
        : undefined;
    const medicalEvidenceSessionMcpServer = hasMedicalEvidenceMode
      ? resolveMedicalEvidenceSessionMcpServer(
          availableMcpServersForSend,
          medicalEvidenceConfig?.paperclipApiKey,
          medicalEvidenceConfig?.paperclipBaseUrl
        )
      : undefined;
    const researchEvidenceConfig = hasScienceMode
      ? applyPaperclipCredentialFallback(rawResearchEvidenceConfig, rawMedicalEvidenceConfig)
      : undefined;
    const scienceArtifactConfig = hasScienceMode ? configService.get('tools.scienceArtifact') : undefined;
    const researchEvidenceSessionMcpServer = hasScienceMode
      ? resolveResearchEvidenceSessionMcpServer(
          availableMcpServersForSend,
          researchEvidenceConfig?.paperclipApiKey,
          researchEvidenceConfig?.paperclipBaseUrl
        )
      : undefined;
    const scienceArtifactSessionMcpServer = hasScienceMode
      ? resolveScienceArtifactSessionMcpServer(availableMcpServersForSend, scienceArtifactConfig)
      : undefined;
    const labSkillSessionMcpServer = hasSkillDepositionMode
      ? resolveBuiltinSessionMcpServer(availableMcpServersForSend, BUILTIN_LAB_SKILL_NAME)
      : undefined;
    const userInputSessionMcpServer =
      hasMedicalEvidenceMode || hasScienceMode || hasSkillDepositionMode
        ? resolveBuiltinSessionMcpServer(availableMcpServersForSend, BUILTIN_USER_INPUT_NAME)
        : undefined;
    const imageGenerationSessionMcpServer =
      hasMedicalEvidenceMode && medicalEvidenceAgentBackend === 'codex'
        ? resolveBuiltinSessionMcpServer(availableMcpServersForSend, BUILTIN_IMAGE_GEN_NAME)
        : undefined;
    const baseSelectedSessionMcpServersForExtra =
      selectedMcpServerIds !== undefined ? selectedSessionMcpServers : selectedSessionMcpServersToSend;
    const selectedSessionMcpServersWithMedicalEvidence = mergeSessionMcpServers([
      ...baseSelectedSessionMcpServersForExtra,
      ...(medicalEvidenceSessionMcpServer ? [medicalEvidenceSessionMcpServer] : []),
      ...(imageGenerationSessionMcpServer ? [imageGenerationSessionMcpServer] : []),
      ...(researchEvidenceSessionMcpServer ? [researchEvidenceSessionMcpServer] : []),
      ...(scienceArtifactSessionMcpServer ? [scienceArtifactSessionMcpServer] : []),
      ...(labSkillSessionMcpServer ? [labSkillSessionMcpServer] : []),
      ...(userInputSessionMcpServer ? [userInputSessionMcpServer] : []),
    ]);

    const finalEffectiveAgentType = effectiveAgentType;
    const assistantOverrideModel =
      selectedAcpModel || currentAcpCachedModelInfo?.current_model_id || current_model?.use_model || undefined;
    const assistantOverrides = {
      model: assistantOverrideModel,
      permission: selectedMode || undefined,
      skill_ids: enabled_skills_to_send,
      disabled_builtin_skill_ids: excludeBuiltinSkills,
      mcp_ids: assistantOverrideMcpIds,
    };
    const combinedPresetContext = appendPrompt(
      sciencePrompt,
      medicalEvidencePrompt,
      labSkillDepositionPrompt,
      computeContext?.prompt
    );
    const medicalEvidenceExtra = hasMedicalEvidenceMode
      ? {
          medical_evidence: buildMedicalEvidenceConversationExtra(medicalEvidenceSources, medicalEvidenceStrictAnchors),
        }
      : {};
    const scienceExtra = hasScienceMode ? { science: buildScienceConversationExtra(finalWorkspace) } : {};
    const labSkillDepositionExtra = hasSkillDepositionMode
      ? { lab_skill_deposition: buildLabSkillDepositionConversationExtra(finalWorkspace) }
      : {};
    const computeExtra = computeContext?.hosts?.length
      ? { compute: buildComputeConversationExtra(computeContext.hosts) }
      : {};

    // Remaining agent path (ACP/remote/custom, including preset fallbacks)
    {
      // Agent-type fallback only applies to preset assistants whose primary agent
      // was unavailable and got switched. For non-preset
      // agents (including extension-contributed ACP adapters with backend='custom'),
      // we must keep the original selectedAgent so the correct backend/cli_path is used.
      const agent_typeChanged = is_preset && selectedAgent !== finalEffectiveAgentType;
      const acpBackend: string | undefined = agent_typeChanged
        ? normalizeLegacyBackend(finalEffectiveAgentType)
        : is_preset
          ? normalizeLegacyBackend(finalEffectiveAgentType)
          : normalizeLegacyBackend(selectedAgent);

      const acpAgentInfo = agent_typeChanged
        ? findAgentByKey(acpBackend as string)
        : agentInfo || findAgentByKey(selectedAgentKey);

      if (!acpAgentInfo && !is_preset) {
        console.warn(`${acpBackend} CLI not found, but proceeding to let conversation panel handle it.`);
      }
      const agentBackend = acpBackend || selectedAgent;
      const preferredThoughtLevel = getPreferredThoughtLevel(agentBackend);
      const agentConversationParams = buildAgentConversationParams({
        backend: agentBackend,
        name: conversationName,
        // For row-scoped rows (custom ACP / remote) the backend factory
        // needs the actual catalog id — `backend` collapses to the `custom`
        // slot so it cannot discriminate between rows on its own.
        agent_id: acpAgentInfo?.id,
        agent_name: acpAgentInfo?.name,
        preset_assistant_id,
        workspace: finalWorkspace,
        model: current_model!,
        cli_path: acpAgentInfo?.cli_path,
        custom_agent_id: acpAgentInfo?.custom_agent_id,
        custom_workspace: isCustomWorkspace,
        is_preset,
        preset_agent_type: finalEffectiveAgentType,
        session_mode: selectedMode,
        current_model_id: selectedAcpModel || currentAcpCachedModelInfo?.current_model_id || undefined,
        thought_level: preferredThoughtLevel,
        assistant_locale: localeKey,
        assistant_conversation_overrides: assistantOverrides,
        extra: {
          default_files: files,
          ...(!is_preset && enabled_skills_to_send?.length ? { enabled_skills: enabled_skills_to_send } : {}),
          ...(!is_preset && excludeBuiltinSkills?.length ? { exclude_builtin_skills: excludeBuiltinSkills } : {}),
          selected_mcp_server_ids: selectedUserMcpServerIdsToSend,
          selected_session_mcp_servers: selectedSessionMcpServersWithMedicalEvidence,
          ...(loopGoalForCreate ? { loop_goal: loopGoalForCreate } : {}),
          ...medicalEvidenceExtra,
          ...scienceExtra,
          ...labSkillDepositionExtra,
          ...computeExtra,
          ...(combinedPresetContext
            ? { preset_context: combinedPresetContext, preset_rules: combinedPresetContext }
            : {}),
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(agentConversationParams);
        if (!conversation || !conversation.id) {
          console.error('Failed to create ACP conversation - conversation object is null or missing id');
          return;
        }

        if (isCustomWorkspace) {
          updateWorkspaceTime(finalWorkspace);
        }

        if (preset_assistant_id) {
          await Promise.all([
            swrMutate(`guid.assistant.detail.${preset_assistant_id}.${localeKey}`),
            swrMutate('assistants.list'),
          ]);
        }

        emitter.emit('chat.history.refresh');

        if (trimmedInput || hasLoopGoal || shouldCreateLoopGoalFromInput || files.length > 0) {
          const initialMessage = {
            input: initialUserInput,
            files: files.length > 0 ? files : undefined,
          };
          sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify(initialMessage));
        }

        onLoopGoalSent?.();
        onMedicalEvidenceModeSent?.();
        onSkillDepositionModeSent?.();
        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create ACP conversation:', error);
        throw error;
      }
    }
  }, [
    input,
    files,
    dir,
    selectedAgent,
    selectedAgentKey,
    selectedAgentInfo,
    is_presetAgent,
    selectedMode,
    selectedAcpModel,
    currentAcpCachedModelInfo,
    current_model,
    loopGoal,
    isLoopGoalMode,
    onLoopGoalSent,
    isScienceMode,
    isMedicalEvidenceMode,
    onMedicalEvidenceModeSent,
    isSkillDepositionMode,
    onSkillDepositionModeSent,
    selectedComputeHostIds,
    findAgentByKey,
    getEffectiveAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds,
    assistantDefaultDisabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds,
    assistantDefaultMcpIds,
    navigate,
    t,
    localeKey,
  ]);

  const sendMessageHandler = useCallback(() => {
    if (loading || sendingRef.current) return;
    sendingRef.current = true;
    setLoading(true);
    handleSend()
      .then(() => {
        setInput('');
        setMentionOpen(false);
        setMentionQuery(null);
        setMentionSelectorOpen(false);
        setMentionActiveIndex(0);
        setFiles([]);
        setDir('');
      })
      .catch((error) => {
        console.error('Failed to send message:', error);
        Message.error(getConversationCreateErrorMessage(error, t));
      })
      .finally(() => {
        sendingRef.current = false;
        setLoading(false);
      });
  }, [
    loading,
    handleSend,
    setLoading,
    setInput,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    setFiles,
    setDir,
    t,
  ]);

  // Calculate button disabled state
  const hasSendableLoopGoal = !isMedicalEvidenceMode && Boolean(loopGoal?.goal.trim());
  const isButtonDisabled = loading || (!input.trim() && !hasSendableLoopGoal);

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
  };
};
