import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TConversationRuntimeSummary } from '@/common/config/storage';
import {
  getConversationRuntimeViewSnapshot,
  hydrateSucceeded,
  resetConversationRuntimeViewStoreForTest,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import { usePostToolSilenceRecovery } from '@/renderer/pages/conversation/runtime/usePostToolSilenceRecovery';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { responseStreamHandlerRef, stopInvokeMock } = vi.hoisted(() => ({
  responseStreamHandlerRef: {
    current: undefined as ((message: IResponseMessage) => void) | undefined,
  },
  stopInvokeMock: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      writeRendererLog: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
    conversation: {
      responseStream: {
        on: vi.fn().mockImplementation((handler: (message: IResponseMessage) => void) => {
          responseStreamHandlerRef.current = handler;
          return () => {
            responseStreamHandlerRef.current = undefined;
          };
        }),
      },
      stop: { invoke: stopInvokeMock },
    },
  },
}));

const runningRuntime = (): TConversationRuntimeSummary => ({
  state: 'running',
  can_send_message: false,
  has_task: true,
  task_status: 'running',
  is_processing: true,
  pending_confirmations: 0,
  turn_id: 'turn-1',
});

const idleRuntime = (): TConversationRuntimeSummary => ({
  state: 'idle',
  can_send_message: true,
  has_task: false,
  task_status: 'finished',
  is_processing: false,
  pending_confirmations: 0,
  turn_id: null,
});

const streamMessage = (type: string, data: unknown): IResponseMessage => ({
  type,
  data,
  msg_id: `${type}-message`,
  turn_id: 'turn-1',
  conversation_id: 'conversation-1',
});

const failedToolMessage = () =>
  streamMessage('acp_tool_call', {
    update: {
      tool_call_id: 'tool-1',
      status: 'failed',
    },
  });

describe('usePostToolSilenceRecovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetConversationRuntimeViewStoreForTest();
    hydrateSucceeded('conversation-1', runningRuntime());
    vi.mocked(getConversationOrNull).mockResolvedValue({ runtime: runningRuntime() } as never);
    stopInvokeMock.mockResolvedValue({ runtime: idleRuntime() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels the same active turn after a failed tool remains silent', async () => {
    const onRecovered = vi.fn();
    const { result } = renderHook(() =>
      usePostToolSilenceRecovery({
        conversationId: 'conversation-1',
        runtimeView: getConversationRuntimeViewSnapshot('conversation-1'),
        onRecovered,
      })
    );

    act(() => responseStreamHandlerRef.current?.(failedToolMessage()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(stopInvokeMock).toHaveBeenCalledWith({ conversation_id: 'conversation-1', turn_id: 'turn-1' });
    expect(onRecovered).toHaveBeenCalledOnce();
    expect(result.current.phase).toBe('recovered');
    expect(getConversationRuntimeViewSnapshot('conversation-1')).toMatchObject({
      isProcessing: false,
      canSendMessage: true,
    });
  });

  it('does not cancel after a permission event proves the turn is waiting for input', async () => {
    renderHook(() =>
      usePostToolSilenceRecovery({
        conversationId: 'conversation-1',
        runtimeView: getConversationRuntimeViewSnapshot('conversation-1'),
      })
    );

    act(() => {
      responseStreamHandlerRef.current?.(failedToolMessage());
      responseStreamHandlerRef.current?.(streamMessage('acp_permission', { call_id: 'permission-1' }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(stopInvokeMock).not.toHaveBeenCalled();
  });
});
