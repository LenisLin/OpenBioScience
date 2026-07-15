import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TConversationRuntimeSummary } from '@/common/config/storage';
import type { ConversationRuntimeView } from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import {
  createPostToolSilenceWatchdog,
  shouldStopSilentTurn,
  type PostToolSilenceWatch,
} from '@/renderer/pages/conversation/runtime/postToolSilenceWatchdog';
import { afterEach, describe, expect, it, vi } from 'vitest';

const message = (type: string, data: unknown, turn_id = 'turn-1'): IResponseMessage => ({
  type,
  data,
  msg_id: `${type}-message`,
  turn_id,
  conversation_id: 'conversation-1',
});

const acpTool = (status: string, toolCallId = 'tool-1') =>
  message('acp_tool_call', {
    update: {
      tool_call_id: toolCallId,
      status,
    },
  });

const toolGroup = (items: Array<{ call_id: string; status: string }>) => message('tool_group', items);

describe('postToolSilenceWatchdog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns and times out after a failed tool remains the last active event', () => {
    vi.useFakeTimers();
    const onWarning = vi.fn();
    const onTimeout = vi.fn();
    const watchdog = createPostToolSilenceWatchdog({
      policy: { failed: { warningAfterMs: 10, stopAfterMs: 30 } },
      onWarning,
      onTimeout,
    });

    watchdog.observe(acpTool('failed'), 'turn-1');
    vi.advanceTimersByTime(10);
    expect(onWarning).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(20);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('does not clear for passive usage updates after a terminal tool result', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createPostToolSilenceWatchdog({
      policy: { failed: { warningAfterMs: 10, stopAfterMs: 30 } },
      onWarning: vi.fn(),
      onTimeout,
    });

    watchdog.observe(acpTool('failed'), 'turn-1');
    watchdog.observe(message('acp_context_usage', { used: 100 }), 'turn-1');
    vi.advanceTimersByTime(30);

    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('clears when the agent resumes with text, thinking, permission, or another tool', () => {
    vi.useFakeTimers();
    const activeMessages = [
      message('text', { content: 'retrying' }),
      message('thinking', { status: 'thinking' }),
      message('acp_permission', { call_id: 'permission-1' }),
      acpTool('in_progress', 'tool-2'),
    ];

    for (const activeMessage of activeMessages) {
      const onTimeout = vi.fn();
      const watchdog = createPostToolSilenceWatchdog({
        policy: { failed: { warningAfterMs: 10, stopAfterMs: 30 } },
        onWarning: vi.fn(),
        onTimeout,
      });
      watchdog.observe(acpTool('failed'), 'turn-1');
      watchdog.observe(activeMessage, 'turn-1');
      vi.advanceTimersByTime(30);
      expect(onTimeout).not.toHaveBeenCalled();
      watchdog.dispose();
    }
  });

  it('does not extend the deadline for duplicate terminal updates', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createPostToolSilenceWatchdog({
      policy: { failed: { warningAfterMs: 10, stopAfterMs: 30 } },
      onWarning: vi.fn(),
      onTimeout,
    });

    watchdog.observe(acpTool('failed'), 'turn-1');
    vi.advanceTimersByTime(20);
    watchdog.observe(acpTool('failed'), 'turn-1');
    vi.advanceTimersByTime(10);

    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('uses a longer policy for a successful tool and ignores terminal updates without a turn id', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createPostToolSilenceWatchdog({
      policy: { completed: { warningAfterMs: 20, stopAfterMs: 50 } },
      onWarning: vi.fn(),
      onTimeout,
    });

    watchdog.observe(acpTool('completed'), 'turn-1');
    vi.advanceTimersByTime(49);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();

    const noTurnWatchdog = createPostToolSilenceWatchdog({ onWarning: vi.fn(), onTimeout: vi.fn() });
    noTurnWatchdog.observe({ ...acpTool('failed'), turn_id: undefined }, null);
    expect(noTurnWatchdog.getActiveWatch()).toBeNull();
  });

  it('arms for a fully terminal tool group and gives errors precedence', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createPostToolSilenceWatchdog({
      policy: { failed: { warningAfterMs: 10, stopAfterMs: 30 } },
      onWarning: vi.fn(),
      onTimeout,
    });

    watchdog.observe(
      toolGroup([
        { call_id: 'tool-1', status: 'Success' },
        { call_id: 'tool-2', status: 'Error' },
        { call_id: 'tool-3', status: 'Canceled' },
      ]),
      'turn-1'
    );
    vi.advanceTimersByTime(30);

    expect(onTimeout).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: 'tool_group:tool-1,tool-2,tool-3',
        terminalStatus: 'failed',
      })
    );
  });

  it('does not arm while any tool-group item is still active', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createPostToolSilenceWatchdog({
      policy: { completed: { warningAfterMs: 10, stopAfterMs: 30 } },
      onWarning: vi.fn(),
      onTimeout,
    });

    watchdog.observe(
      toolGroup([
        { call_id: 'tool-1', status: 'Success' },
        { call_id: 'tool-2', status: 'Executing' },
      ]),
      'turn-1'
    );
    vi.advanceTimersByTime(30);

    expect(watchdog.getActiveWatch()).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('stops only when the same backend turn is still active without confirmations', () => {
    const watch: PostToolSilenceWatch = {
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      toolCallId: 'tool-1',
      terminalStatus: 'failed',
      armedAt: 1,
    };
    const view: ConversationRuntimeView = {
      conversation_id: 'conversation-1',
      activeTurnId: 'turn-1',
      activeStartedAt: 1,
      state: 'running',
      isProcessing: true,
      canSendMessage: false,
      pendingConfirmations: 0,
      hasBackendRuntime: true,
      localSubmitting: false,
      hydrated: true,
      localStopping: false,
    };
    const runtime: TConversationRuntimeSummary = {
      state: 'running',
      can_send_message: false,
      has_task: true,
      task_status: 'running',
      is_processing: true,
      pending_confirmations: 0,
      turn_id: 'turn-1',
    };

    expect(shouldStopSilentTurn(watch, view, runtime)).toBe(true);
    expect(shouldStopSilentTurn(watch, { ...view, pendingConfirmations: 1 }, runtime)).toBe(false);
    expect(shouldStopSilentTurn(watch, view, { ...runtime, turn_id: 'turn-2' })).toBe(false);
    expect(shouldStopSilentTurn(watch, { ...view, localStopping: true }, runtime)).toBe(false);
  });
});
