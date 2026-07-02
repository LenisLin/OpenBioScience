/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  buildMedicalEvidenceConversationExtra,
  buildMedicalEvidenceModePrompt,
} from '@/common/chat/medicalEvidence';
import { configService } from '@/common/config/configService';
import { LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';
import {
  BUILTIN_MEDICAL_EVIDENCE_NAME,
  type IMcpServer,
  type ISessionMcpServer,
  type TProviderWithModel,
} from '@/common/config/storage';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';
import { toSessionMcpServer } from '@/renderer/hooks/mcp/catalog';
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
import type { GuidLarkProjectContext } from '../components/GuidLarkProjectPanel';
import {
  createLoopGoalState,
  buildLoopGoalKickoffPrompt,
  summarizeLoopGoal,
  type LoopGoalState,
} from '@/common/chat/loopGoal';

function buildLarkProjectContextPrompt(context: GuidLarkProjectContext): string {
  const focusedTask = context.focusedTask;
  const basePrompt =
    context.role === 'leader'
      ? context.leaderPrompt?.trim() ||
        [
          '# Lark Project Leader Context',
          '',
          `Project tasklist: ${context.tasklistName}`,
          `Tasklist GUID: ${context.tasklistGuid}`,
          '',
          'You are the leader Agent for this Lark project tasklist. Treat the whole tasklist as the project scope and help move it forward in an organized way.',
          'First align with the project owner on goals, participants, responsibilities, milestones, and approval boundaries.',
          'Before explicit approval, do not create, assign, modify, close, or delete Lark tasks. Keep the work in planning and coordination mode.',
        ].join('\n')
      : [
          '# Lark Project Context',
          '',
          `Project tasklist: ${context.tasklistName}`,
          `Tasklist GUID: ${context.tasklistGuid}`,
          '',
          'You are entering this Lark project as a regular project Agent, not as the leader Agent. Use the project tasklist as shared context. Do not take over project orchestration unless the user explicitly asks you to become the leader Agent.',
        ].join('\n');
  if (!focusedTask) return basePrompt;
  return [
    basePrompt,
    '',
    '# Focused Lark Task',
    '',
    context.role === 'leader'
      ? 'The leader Agent remains responsible for the whole Lark tasklist. The following task is only a user-selected focus item and should be treated as additional context, not as a narrowed assignment.'
      : 'The following task is a user-selected focus item inside the project tasklist. Treat it as additional context, not as an automatic assignment unless the user asks you to work on it.',
    '',
    `Task: ${focusedTask.summary}`,
    `Task GUID: ${focusedTask.guid}`,
    focusedTask.dueAt ? `Due: ${focusedTask.dueAt}` : undefined,
    focusedTask.url ? `URL: ${focusedTask.url}` : undefined,
    focusedTask.completed !== undefined ? `Completed: ${focusedTask.completed ? 'yes' : 'no'}` : undefined,
    focusedTask.isAgentTask !== undefined ? `Agent Task: ${focusedTask.isAgentTask ? 'yes' : 'no'}` : undefined,
    '',
    '## Task Description',
    focusedTask.description?.trim() || '(No description provided.)',
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

async function attachLarkProjectConversation(
  context: GuidLarkProjectContext | undefined,
  conversationId: string
): Promise<void> {
  if (!context?.tasklistGuid) return;
  await ipcBridge.larkProjectAgent.attachConversation.invoke({
    conversationId,
    role: context.role,
    tasklistGuid: context.tasklistGuid,
    tasklistName: context.tasklistName,
    bindingId: context.bindingId,
    replaceExistingLeader: false,
  });
}

const normalizeLegacyBackend = (backend: string | undefined): string | undefined =>
  backend === LEGACY_LOCAL_RUNTIME_ID ? 'codex' : backend;

const normalizeMedicalEvidenceSources = (sources?: string[]): string[] =>
  (sources?.length ? sources : ['pmc', 'abstracts', 'fda', 'clinicaltrials']).map((source) =>
    source === 'clinicaltrials' ? 'trials/us' : source
  );

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
        ...(sessionServer.transport.env || {}),
        ...(apiKey ? { PAPERCLIP_API_KEY: apiKey } : {}),
        ...(baseUrl ? { PAPERCLIP_BASE_URL: baseUrl } : {}),
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
  larkProjectContext?: GuidLarkProjectContext;
  loopGoal?: LoopGoalState;
  isLoopGoalMode?: boolean;
  onLoopGoalSent?: () => void;
  isMedicalEvidenceMode?: boolean;
  onMedicalEvidenceModeSent?: () => void;

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
    larkProjectContext,
    loopGoal,
    isLoopGoalMode,
    onLoopGoalSent,
    isMedicalEvidenceMode,
    onMedicalEvidenceModeSent,
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
    const hasLarkProjectContext = Boolean(larkProjectContext?.tasklistGuid);
    const hasLoopGoal = Boolean(loopGoal?.goal.trim() && loopGoal.status !== 'deleted');
    const hasMedicalEvidenceMode = Boolean(isMedicalEvidenceMode);
    const shouldCreateLoopGoalFromInput = !hasLoopGoal && Boolean(isLoopGoalMode && trimmedInput);
    const loopGoalForCreate = hasLoopGoal
      ? { ...loopGoal!, status: 'active' as const, updated_at: Date.now() }
      : shouldCreateLoopGoalFromInput
        ? createLoopGoalState(trimmedInput)
        : undefined;
    const conversationName =
      (loopGoalForCreate ? summarizeLoopGoal(loopGoalForCreate.goal) : undefined) ||
      trimmedInput ||
      larkProjectContext?.tasklistName ||
      t('guid.larkProject.defaultConversationName');
    const initialUserInput =
      loopGoalForCreate
        ? buildLoopGoalKickoffPrompt(loopGoalForCreate, hasLoopGoal ? trimmedInput : undefined)
        : trimmedInput ||
          (hasLarkProjectContext
            ? larkProjectContext?.role === 'leader'
              ? t('guid.larkProject.leaderInitialPrompt', { tasklistName: larkProjectContext!.tasklistName })
              : t('guid.larkProject.agentInitialPrompt', { tasklistName: larkProjectContext!.tasklistName })
            : input);
    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';

    const agentInfo = selectedAgentInfo;
    const is_preset = is_presetAgent;
    const preset_assistant_id = is_preset ? agentInfo?.custom_agent_id : undefined;

    const { agent_type: effectiveAgentType } = getEffectiveAgentType(agentInfo);

    // Guid page's per-conversation skill overrides take precedence over the
    // assistant's saved defaults. The combined skills menu lets the user pick
    // any custom skill — not just preset-declared ones — so for non-preset
    // agents we still forward the user's selection (the backend accepts
    // `preset_enabled_skills` regardless of `is_preset`).
    const presetEnabledSkillsDefault = resolveEnabledSkills(agentInfo);
    const enabled_skills =
      guidEnabledSkills ?? (is_presetAgent ? assistantDefaultSkillIds : presetEnabledSkillsDefault);
    const enabled_skills_to_send = is_presetAgent
      ? enabled_skills
      : guidEnabledSkills?.length
        ? guidEnabledSkills
        : undefined;
    const excludeBuiltinSkills =
      guidDisabledBuiltinSkills ??
      (is_presetAgent ? assistantDefaultDisabledBuiltinSkillIds : resolveDisabledBuiltinSkills(agentInfo));
    const selectedAllMcpServerIds = selectedMcpServerIds ?? [];
    const selectedMcpServerIdSet = new Set(selectedAllMcpServerIds);
    const selectedUserMcpServerIds = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const selectedAllSessionMcpServers = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id))
      .map((server) => toSessionMcpServer(server));
    const selectedSessionMcpServers = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin === true)
      .map((server) => toSessionMcpServer(server));
    const defaultSelectedMcpServerIds = assistantDefaultMcpIds;
    const defaultSelectedUserMcpServerIds = availableMcpServers
      .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const assistantOverrideMcpIds =
      selectedMcpServerIds !== undefined ? selectedAllMcpServerIds : defaultSelectedMcpServerIds;
    const selectedUserMcpServerIdsToSend =
      selectedMcpServerIds !== undefined ? selectedUserMcpServerIds : defaultSelectedUserMcpServerIds;
    const selectedSessionMcpServersToSend =
      selectedMcpServerIds !== undefined
        ? selectedAllSessionMcpServers
        : availableMcpServers
            .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id))
            .map((server) => toSessionMcpServer(server));

    const medicalEvidenceConfig = hasMedicalEvidenceMode ? configService.get('tools.medicalEvidence') : undefined;
    const medicalEvidenceSources = normalizeMedicalEvidenceSources(medicalEvidenceConfig?.defaultSources);
    const medicalEvidenceStrictAnchors = medicalEvidenceConfig?.strictAnchors !== false;
    const medicalEvidencePrompt = hasMedicalEvidenceMode
      ? buildMedicalEvidenceModePrompt(medicalEvidenceSources, medicalEvidenceStrictAnchors)
      : undefined;
    const medicalEvidenceSessionMcpServer = hasMedicalEvidenceMode
      ? resolveMedicalEvidenceSessionMcpServer(
          availableMcpServers,
          medicalEvidenceConfig?.paperclipApiKey,
          medicalEvidenceConfig?.paperclipBaseUrl
        )
      : undefined;
    const baseSelectedSessionMcpServersForExtra =
      selectedMcpServerIds !== undefined ? selectedSessionMcpServers : selectedSessionMcpServersToSend;
    const selectedSessionMcpServersWithMedicalEvidence = mergeSessionMcpServers([
      ...baseSelectedSessionMcpServersForExtra,
      ...(medicalEvidenceSessionMcpServer ? [medicalEvidenceSessionMcpServer] : []),
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
    const larkProjectPrompt = hasLarkProjectContext ? buildLarkProjectContextPrompt(larkProjectContext!) : undefined;
    const combinedPresetContext = appendPrompt(larkProjectPrompt, medicalEvidencePrompt);
    const larkProjectExtra = hasLarkProjectContext && larkProjectPrompt
      ? {
          context: larkProjectPrompt,
          context_file_name:
            larkProjectContext!.role === 'leader' ? 'lark-project-leader.md' : 'lark-project-context.md',
          lark_project_binding_id: larkProjectContext!.bindingId,
          lark_project_tasklist_guid: larkProjectContext!.tasklistGuid,
          lark_project_tasklist_name: larkProjectContext!.tasklistName,
          lark_project_role: larkProjectContext!.role,
          lark_project_focused_task_guid: larkProjectContext!.focusedTask?.guid,
          lark_project_focused_task_title: larkProjectContext!.focusedTask?.summary,
        }
      : {};
    const medicalEvidenceExtra = hasMedicalEvidenceMode
      ? {
          medical_evidence: buildMedicalEvidenceConversationExtra(
            medicalEvidenceSources,
            medicalEvidenceStrictAnchors
          ),
        }
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
          ...larkProjectExtra,
          ...medicalEvidenceExtra,
          ...(combinedPresetContext ? { preset_context: combinedPresetContext, preset_rules: combinedPresetContext } : {}),
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(agentConversationParams);
        if (!conversation || !conversation.id) {
          console.error('Failed to create ACP conversation - conversation object is null or missing id');
          return;
        }

        await attachLarkProjectConversation(larkProjectContext, conversation.id).catch((error) => {
          console.warn('[Guid] Failed to attach Lark project conversation:', error);
        });

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

        if (trimmedInput || hasLarkProjectContext || hasLoopGoal || shouldCreateLoopGoalFromInput || files.length > 0) {
          const initialMessage = {
            input: initialUserInput,
            files: files.length > 0 ? files : undefined,
          };
          sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify(initialMessage));
        }

        onLoopGoalSent?.();
        onMedicalEvidenceModeSent?.();
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
    larkProjectContext,
    loopGoal,
    isLoopGoalMode,
    onLoopGoalSent,
    isMedicalEvidenceMode,
    onMedicalEvidenceModeSent,
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
  const isButtonDisabled = loading || (!input.trim() && !larkProjectContext?.tasklistGuid && !loopGoal?.goal.trim());

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
  };
};
