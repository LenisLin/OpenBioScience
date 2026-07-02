/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  buildLoopGoalContinuationPrompt,
  getLoopGoalFromExtra,
  type LoopGoalState,
} from '@/common/chat/loopGoal';
import type { TChatConversation } from '@/common/config/storage';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const canAutoContinue = (goal: LoopGoalState | undefined): boolean => {
  if (!goal) return false;
  if (goal.status !== 'active') return false;
  if (!goal.goal.trim()) return false;
  if (goal.options?.max_iterations !== undefined && goal.iteration_count >= goal.options.max_iterations) return false;
  return goal.options?.continue_when_idle !== false;
};

const persistLoopGoal = async (conversationId: string, loopGoal: LoopGoalState): Promise<void> => {
  await ipcBridge.conversation.update.invoke({
    id: conversationId,
    updates: { extra: { loop_goal: loopGoal } } as Partial<TChatConversation>,
    merge_extra: true,
  });
  emitter.emit('chat.history.refresh');
};

const getAssistantLocale = (extra: TChatConversation['extra'] | undefined): string | undefined => {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return undefined;
  const locale = (extra as { assistant_locale?: unknown }).assistant_locale;
  return typeof locale === 'string' ? locale : undefined;
};

const sendLoopContinuation = async (
  conversationId: string,
  loopGoal: LoopGoalState,
  sourceTurnId?: string,
  preferredLocale?: string
): Promise<LoopGoalState> => {
  const now = Date.now();
  const nextGoal: LoopGoalState = {
    ...loopGoal,
    updated_at: now,
    iteration_count: loopGoal.iteration_count + 1,
    last_turn_id: sourceTurnId ?? loopGoal.last_turn_id,
    last_triggered_turn_id: sourceTurnId ?? loopGoal.last_triggered_turn_id,
    last_error: undefined,
  };

  await persistLoopGoal(conversationId, nextGoal);
  await ipcBridge.conversation.sendMessage.invoke({
    conversation_id: conversationId,
    input: buildLoopGoalContinuationPrompt(nextGoal, preferredLocale),
    files: [],
  });
  return nextGoal;
};

export const useConversationLoopGoal = (conversation: TChatConversation | undefined) => {
  const initialLoopGoal = useMemo(() => getLoopGoalFromExtra(conversation?.extra), [conversation?.extra]);
  const [loopGoal, setLoopGoal] = useState<LoopGoalState | undefined>(initialLoopGoal);
  const activeConversationId = conversation?.id;
  const triggeringTurnIdsRef = useRef<Set<string>>(new Set());
  const manualContinueRef = useRef(false);

  useEffect(() => {
    triggeringTurnIdsRef.current.clear();
    setLoopGoal(initialLoopGoal);
  }, [activeConversationId, initialLoopGoal?.id, initialLoopGoal?.updated_at, initialLoopGoal?.status]);

  const updateLoopGoal = useCallback(
    async (next: LoopGoalState) => {
      if (!activeConversationId) return;
      setLoopGoal(next.status === 'deleted' ? undefined : next);
      await persistLoopGoal(activeConversationId, next);

      if (next.status === 'active' && loopGoal?.status === 'paused') {
        if (manualContinueRef.current) return;
        manualContinueRef.current = true;
        try {
          const latestConversation = await ipcBridge.conversation.get.invoke({ id: activeConversationId });
          const runtime = latestConversation?.runtime;
          if (runtime?.can_send_message && !runtime.is_processing && runtime.pending_confirmations === 0) {
            const latestGoal = getLoopGoalFromExtra(latestConversation?.extra) ?? next;
            if (canAutoContinue(latestGoal)) {
              const continuedGoal = await sendLoopContinuation(
                activeConversationId,
                latestGoal,
                undefined,
                getAssistantLocale(latestConversation?.extra)
              );
              setLoopGoal(continuedGoal);
            }
          }
        } finally {
          manualContinueRef.current = false;
        }
      }
    },
    [activeConversationId, loopGoal?.status]
  );

  useEffect(() => {
    if (!activeConversationId || !canAutoContinue(loopGoal)) return;

    const dispose = ipcBridge.conversation.turnCompleted.on(async (event) => {
      if (event.session_id !== activeConversationId) return;
      if (event.status !== 'finished') return;
      if (!event.can_send_message || !event.runtime.can_send_message) return;
      if (event.runtime.pending_confirmations > 0) return;
      if (!event.turn_id || triggeringTurnIdsRef.current.has(event.turn_id)) return;

      triggeringTurnIdsRef.current.add(event.turn_id);

      try {
        const latestConversation = await ipcBridge.conversation.get.invoke({ id: activeConversationId });
        const latestGoal = getLoopGoalFromExtra(latestConversation?.extra) ?? loopGoal;
        if (!canAutoContinue(latestGoal)) {
          if (!latestGoal || latestGoal.status === 'deleted') {
            setLoopGoal(undefined);
          } else {
            setLoopGoal(latestGoal);
          }
          return;
        }
        if (latestGoal.last_triggered_turn_id === event.turn_id) {
          setLoopGoal(latestGoal);
          return;
        }

        const nextGoal = await sendLoopContinuation(
          activeConversationId,
          latestGoal,
          event.turn_id,
          getAssistantLocale(latestConversation?.extra)
        );
        setLoopGoal(nextGoal);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failedGoal = loopGoal
          ? {
              ...loopGoal,
              status: 'paused' as const,
              updated_at: Date.now(),
              last_error: message,
            }
          : undefined;
        if (failedGoal) {
          setLoopGoal(failedGoal);
          await persistLoopGoal(activeConversationId, failedGoal).catch((): undefined => undefined);
        }
        console.error('[LoopGoal] Failed to continue loop goal:', error);
      }
    });

    return () => dispose();
  }, [activeConversationId, loopGoal]);

  return {
    loopGoal,
    updateLoopGoal,
  };
};
