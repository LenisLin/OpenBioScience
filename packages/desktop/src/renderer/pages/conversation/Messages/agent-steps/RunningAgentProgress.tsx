/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import type { ToolMessage } from '@/common/chat/agentStep';
import { hasRunningAgentSteps, normalizeAgentSteps } from '@/common/chat/agentStep';
import type { ConversationRuntimeView } from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import React, { useMemo } from 'react';
import { useMessageList } from '../hooks';
import { AgentRuntimeProgressPill } from './AgentSteps';

const isToolMessage = (message: TMessage): message is ToolMessage =>
  message.type === 'tool_group' || message.type === 'acp_tool_call' || message.type === 'tool_call';

const getTurnId = (message: TMessage): string | undefined => (message as TMessage & { turn_id?: string }).turn_id;

export const getRunningToolMessages = (messages: TMessage[]): ToolMessage[] => {
  const visibleMessages = messages.filter((message) => !message.hidden);
  const toolMessages = visibleMessages.filter(isToolMessage);
  if (!toolMessages.length) return [];

  const runningToolMessages = toolMessages.filter((message) => hasRunningAgentSteps(normalizeAgentSteps([message])));
  if (!runningToolMessages.length) return [];

  const latestRunningMessage = runningToolMessages[runningToolMessages.length - 1];
  const activeTurnId = getTurnId(latestRunningMessage);
  if (activeTurnId) {
    return toolMessages.filter((message) => getTurnId(message) === activeTurnId);
  }

  const latestRunningIndex = visibleMessages.lastIndexOf(latestRunningMessage);
  if (latestRunningIndex < 0) return runningToolMessages;

  const currentRun: ToolMessage[] = [];
  for (let index = latestRunningIndex; index >= 0; index--) {
    const message = visibleMessages[index];
    if (!isToolMessage(message)) break;
    currentRun.unshift(message);
  }
  for (let index = latestRunningIndex + 1; index < visibleMessages.length; index++) {
    const message = visibleMessages[index];
    if (!isToolMessage(message)) break;
    currentRun.push(message);
  }

  return currentRun.length ? currentRun : runningToolMessages;
};

type RunningAgentProgressProps = {
  runtimeView: ConversationRuntimeView;
};

const RunningAgentProgress: React.FC<RunningAgentProgressProps> = ({ runtimeView }) => {
  const messages = useMessageList();
  const runningMessages = useMemo(() => {
    if (!runtimeView.isProcessing) {
      return [];
    }

    const candidates = getRunningToolMessages(messages);
    if (!runtimeView.activeTurnId) {
      return candidates;
    }

    return candidates.filter((message) => getTurnId(message) === runtimeView.activeTurnId);
  }, [messages, runtimeView.activeTurnId, runtimeView.isProcessing]);

  if (!runtimeView.isProcessing) return null;

  return <AgentRuntimeProgressPill runtimeView={runtimeView} messages={runningMessages} />;
};

export default RunningAgentProgress;
