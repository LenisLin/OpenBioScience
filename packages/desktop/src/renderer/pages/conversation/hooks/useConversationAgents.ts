/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import useSWR from 'swr';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents } from '@/renderer/utils/model/agentTypes';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { isSupportedNewConversationAgent } from '@/renderer/utils/model/agentTypeSupportPolicy';

export type UseConversationAgentsResult = {
  /** Detected execution engines (ACP adapters, extensions, remote agents, etc.) */
  cliAgents: AgentMetadata[];
  /** Preset assistants from `/api/assistants` — kept as-is, not re-shaped into agent form */
  presetAssistants: Assistant[];
  /** Loading state */
  isLoading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
};

/** Hook to fetch available CLI agents for the conversation tab dropdown. */
export const useConversationAgents = (): UseConversationAgentsResult => {
  // Execution engines from AgentRegistry (shared cache with useGuidAgentSelection)
  const {
    data: cliAgents,
    isLoading: isLoadingAgents,
    mutate,
  } = useSWR<AgentMetadata[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  const refresh = async () => {
    await mutate();
  };

  return {
    cliAgents: (cliAgents || []).filter(isSupportedNewConversationAgent),
    presetAssistants: [],
    isLoading: isLoadingAgents,
    refresh,
  };
};
