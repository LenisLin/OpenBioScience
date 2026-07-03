/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationMcpStatus } from '@/common/config/storage';
import type { LoopGoalState } from '@/common/chat/loopGoal';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { ConversationArtifactProvider } from '@renderer/pages/conversation/Messages/artifacts';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  useMessageLstCache,
} from '@renderer/pages/conversation/Messages/hooks';
import { usePendingConfirmationsRecovery } from '@renderer/pages/conversation/Messages/usePendingConfirmationsRecovery';
import HOC from '@renderer/utils/ui/HOC';
import React from 'react';
import AcpE2EStreamInjector from './AcpE2EStreamInjector';
import AcpSendBox from './AcpSendBox';
import { useAcpMessage } from './useAcpMessage';
import UserInputCard from '../../user-input/UserInputCard';
import { useUserInputRequests } from '../../user-input/userInputStore';

const AGENT_MESSAGE_BACKGROUND_COLOR = 'rgb(254, 254, 254)';

const AcpChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  backend: string;
  session_mode?: string;
  agent_name?: string;
  cron_job_id?: string;
  hideSendBox?: boolean;
  emptySlot?: React.ReactNode;
  loadedSkills?: string[];
  loadedMcpServers?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
  teamSendMessage?: (payload: { input: string; files: string[] }) => Promise<void>;
  teamRuntime?: TeamSendBoxRuntime;
  assistantId?: string;
  loopGoal?: LoopGoalState;
  onLoopGoalChange?: (next: LoopGoalState) => void | Promise<void>;
  isMedicalEvidenceMode?: boolean;
  isScienceMode?: boolean;
  isLabSkillDepositionMode?: boolean;
}> = ({
  conversation_id,
  workspace,
  backend,
  session_mode,
  agent_name,
  cron_job_id,
  hideSendBox,
  emptySlot,
  loadedSkills,
  loadedMcpServers,
  loadedMcpStatuses,
  teamSendMessage,
  teamRuntime,
  assistantId,
  loopGoal,
  onLoopGoalChange,
  isMedicalEvidenceMode = false,
  isScienceMode = false,
  isLabSkillDepositionMode = false,
}) => {
  useMessageLstCache(conversation_id);
  usePendingConfirmationsRecovery(conversation_id);
  const teamPermission = useTeamPermission();
  const messageState = useAcpMessage(conversation_id, { skipWarmup: Boolean(teamPermission) });
  const userInputRequests = useUserInputRequests(conversation_id);
  const activeUserInputRequest = userInputRequests.at(-1);

  return (
    <ConversationProvider
      value={{
        conversation_id: conversation_id,
        workspace,
        type: 'acp',
        backend,
        cron_job_id,
        hideSendBox,
        isScienceMode,
        loadedSkills,
        loadedMcpServers,
        loadedMcpStatuses,
        assistantId,
      }}
    >
      <ConversationArtifactProvider conversation_id={conversation_id}>
        <div
          className='flex-1 flex flex-col px-20px min-h-0 agent-message-surface'
          style={{ backgroundColor: AGENT_MESSAGE_BACKGROUND_COLOR }}
        >
          <FlexFullContainer>
            <MessageList className='flex-1' emptySlot={emptySlot} />
          </FlexFullContainer>
          <AcpE2EStreamInjector conversationId={conversation_id} />
          {!hideSendBox && (
            <>
              {activeUserInputRequest ? (
                <UserInputCard request={activeUserInputRequest} conversationId={conversation_id} />
              ) : null}
              <AcpSendBox
                conversation_id={conversation_id}
                backend={backend}
                session_mode={session_mode}
                agent_name={agent_name}
                workspacePath={workspace}
                messageState={messageState}
                teamSendMessage={teamSendMessage}
                teamRuntime={teamRuntime}
                isMedicalEvidenceMode={isMedicalEvidenceMode}
                isScienceMode={isScienceMode}
                isLabSkillDepositionMode={isLabSkillDepositionMode}
                loopGoal={loopGoal}
                onLoopGoalChange={onLoopGoalChange}
              ></AcpSendBox>
            </>
          )}
        </div>
      </ConversationArtifactProvider>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, MessageListLoadingProvider)(AcpChat);
