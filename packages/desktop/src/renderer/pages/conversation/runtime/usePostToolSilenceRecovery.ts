import { ipcBridge } from '@/common';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { useEffect, useRef, useState } from 'react';
import {
  getConversationRuntimeViewSnapshot,
  localStopAcknowledged,
  localStopRequested,
  type ConversationRuntimeView,
} from './conversationRuntimeViewStore';
import {
  createPostToolSilenceWatchdog,
  shouldStopSilentTurn,
  type PostToolSilenceWatch,
} from './postToolSilenceWatchdog';

export type PostToolSilenceRecoveryPhase = 'idle' | 'warning' | 'stopping' | 'recovered' | 'failed';

type PostToolSilenceRecoveryState = {
  phase: PostToolSilenceRecoveryPhase;
  terminalStatus?: PostToolSilenceWatch['terminalStatus'];
  turnId?: string;
  toolCallId?: string;
};

type UsePostToolSilenceRecoveryOptions = {
  conversationId: string;
  runtimeView: ConversationRuntimeView;
  enabled?: boolean;
  onRecovered?: () => void;
};

const IDLE_STATE: PostToolSilenceRecoveryState = { phase: 'idle' };

const logRecovery = (message: string, data: Record<string, unknown>) => {
  void ipcBridge.application?.writeRendererLog
    ?.invoke({
      level: message === 'post_tool_silence_stop_failed' ? 'warn' : 'info',
      tag: 'postToolSilenceWatchdog',
      message,
      data,
    })
    .catch(() => {});
};

export const usePostToolSilenceRecovery = ({
  conversationId,
  runtimeView,
  enabled = true,
  onRecovered,
}: UsePostToolSilenceRecoveryOptions): PostToolSilenceRecoveryState => {
  const [state, setState] = useState<PostToolSilenceRecoveryState>(IDLE_STATE);
  const runtimeViewRef = useRef(runtimeView);
  const onRecoveredRef = useRef(onRecovered);

  runtimeViewRef.current = runtimeView;
  onRecoveredRef.current = onRecovered;

  useEffect(() => {
    if (!enabled || !conversationId) {
      setState(IDLE_STATE);
      return;
    }

    let disposed = false;
    let watchdog: ReturnType<typeof createPostToolSilenceWatchdog>;

    const recover = async (watch: PostToolSilenceWatch) => {
      try {
        const conversation = await getConversationOrNull(conversationId);
        if (disposed || watchdog.getActiveWatch() !== watch) return;
        const currentView = getConversationRuntimeViewSnapshot(conversationId);
        const runtime = conversation?.runtime ?? null;
        if (!shouldStopSilentTurn(watch, currentView, runtime)) {
          watchdog.clear();
          setState(IDLE_STATE);
          return;
        }

        setState({
          phase: 'stopping',
          terminalStatus: watch.terminalStatus,
          turnId: watch.turnId,
          toolCallId: watch.toolCallId,
        });
        localStopRequested(conversationId, watch.turnId);
        const result = await ipcBridge.conversation.stop.invoke({
          conversation_id: conversationId,
          turn_id: watch.turnId,
        });
        if (disposed) return;
        localStopAcknowledged(conversationId, watch.turnId, result.runtime);
        watchdog.clear();
        setState({
          phase: 'recovered',
          terminalStatus: watch.terminalStatus,
          turnId: watch.turnId,
          toolCallId: watch.toolCallId,
        });
        onRecoveredRef.current?.();
        logRecovery('post_tool_silence_stopped', {
          conversation_id: conversationId,
          turn_id: watch.turnId,
          tool_call_id: watch.toolCallId,
          terminal_status: watch.terminalStatus,
        });
      } catch (error) {
        if (disposed) return;
        const reason = error instanceof Error ? error.message : String(error);
        setState({
          phase: 'failed',
          terminalStatus: watch.terminalStatus,
          turnId: watch.turnId,
          toolCallId: watch.toolCallId,
        });
        logRecovery('post_tool_silence_stop_failed', {
          conversation_id: conversationId,
          turn_id: watch.turnId,
          tool_call_id: watch.toolCallId,
          reason: reason.slice(0, 300),
        });
      }
    };

    watchdog = createPostToolSilenceWatchdog({
      onWarning: (watch) => {
        if (disposed) return;
        setState({
          phase: 'warning',
          terminalStatus: watch.terminalStatus,
          turnId: watch.turnId,
          toolCallId: watch.toolCallId,
        });
        logRecovery('post_tool_silence_warning', {
          conversation_id: conversationId,
          turn_id: watch.turnId,
          tool_call_id: watch.toolCallId,
          terminal_status: watch.terminalStatus,
        });
      },
      onTimeout: (watch) => {
        if (!disposed) void recover(watch);
      },
      onCleared: () => {
        if (!disposed) setState(IDLE_STATE);
      },
    });

    const disposeStream = ipcBridge.conversation.responseStream.on((message) => {
      if (message.conversation_id !== conversationId) return;
      watchdog.observe(message, runtimeViewRef.current.activeTurnId);
    });

    return () => {
      disposed = true;
      disposeStream();
      watchdog.dispose();
    };
  }, [conversationId, enabled]);

  return state;
};
