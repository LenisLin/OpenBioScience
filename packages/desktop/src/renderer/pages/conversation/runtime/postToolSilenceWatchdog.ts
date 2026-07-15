import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TConversationRuntimeSummary } from '@/common/config/storage';
import type { ConversationRuntimeView } from './conversationRuntimeViewStore';

export type PostToolTerminalStatus = 'completed' | 'failed' | 'canceled';

export type PostToolSilenceWatch = {
  conversationId: string;
  turnId: string;
  toolCallId: string;
  terminalStatus: PostToolTerminalStatus;
  armedAt: number;
};

export const shouldStopSilentTurn = (
  watch: PostToolSilenceWatch,
  view: ConversationRuntimeView,
  runtime: TConversationRuntimeSummary | null
): boolean =>
  view.isProcessing &&
  !view.localStopping &&
  view.pendingConfirmations === 0 &&
  view.activeTurnId === watch.turnId &&
  runtime?.is_processing === true &&
  runtime.pending_confirmations === 0 &&
  runtime.turn_id === watch.turnId;

type PostToolSilencePolicy = {
  warningAfterMs: number;
  stopAfterMs: number;
};

type PostToolSilenceWatchdogOptions = {
  now?: () => number;
  policy?: Partial<Record<PostToolTerminalStatus, PostToolSilencePolicy>>;
  onWarning: (watch: PostToolSilenceWatch) => void;
  onTimeout: (watch: PostToolSilenceWatch) => void;
  onCleared?: (watch: PostToolSilenceWatch) => void;
};

const DEFAULT_POLICY: Record<PostToolTerminalStatus, PostToolSilencePolicy> = {
  completed: { warningAfterMs: 120_000, stopAfterMs: 300_000 },
  failed: { warningAfterMs: 30_000, stopAfterMs: 120_000 },
  canceled: { warningAfterMs: 30_000, stopAfterMs: 120_000 },
};

const PASSIVE_STREAM_TYPES = new Set([
  'acp_context_usage',
  'acp_model_info',
  'available_commands',
  'codex_model_info',
  'request_trace',
  'slash_commands_updated',
]);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const normalizeTerminalStatus = (status: unknown): PostToolTerminalStatus | undefined => {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'canceled' || status === 'cancelled') return 'canceled';
  return undefined;
};

const terminalToolGroupFromMessage = (
  data: unknown
): { toolCallId: string; terminalStatus: PostToolTerminalStatus } | undefined => {
  if (!Array.isArray(data) || data.length === 0) return undefined;

  const items = data.map(asRecord);
  if (items.some((item) => !item)) return undefined;

  const statuses = items.map((item) => item?.status);
  const allTerminal = statuses.every((status) => status === 'Success' || status === 'Error' || status === 'Canceled');
  if (!allTerminal) return undefined;

  const callIds = items.map((item) => item?.call_id).filter((callId): callId is string => Boolean(callId));
  if (callIds.length !== items.length) return undefined;

  const terminalStatus = statuses.includes('Error')
    ? 'failed'
    : statuses.includes('Canceled')
      ? 'canceled'
      : 'completed';
  return {
    toolCallId: `tool_group:${callIds.join(',')}`,
    terminalStatus,
  };
};

const terminalToolFromMessage = (
  message: IResponseMessage
): { toolCallId: string; terminalStatus: PostToolTerminalStatus } | undefined => {
  if (message.type === 'acp_tool_call') {
    const update = asRecord(asRecord(message.data)?.update);
    const terminalStatus = normalizeTerminalStatus(update?.status);
    const toolCallId = update?.tool_call_id;
    if (terminalStatus && typeof toolCallId === 'string' && toolCallId) return { toolCallId, terminalStatus };
  }

  if (message.type === 'tool_call') {
    const data = asRecord(message.data);
    const terminalStatus = normalizeTerminalStatus(data?.status);
    const toolCallId = data?.call_id;
    if (terminalStatus && typeof toolCallId === 'string' && toolCallId) return { toolCallId, terminalStatus };
  }

  if (message.type === 'tool_group') return terminalToolGroupFromMessage(message.data);

  return undefined;
};

export const createPostToolSilenceWatchdog = (options: PostToolSilenceWatchdogOptions) => {
  const now = options.now ?? Date.now;
  let activeWatch: PostToolSilenceWatch | null = null;
  let warningTimer: ReturnType<typeof setTimeout> | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (warningTimer) clearTimeout(warningTimer);
    if (stopTimer) clearTimeout(stopTimer);
    warningTimer = null;
    stopTimer = null;
  };

  const clear = (notify: boolean) => {
    const previous = activeWatch;
    clearTimers();
    activeWatch = null;
    if (notify && previous) options.onCleared?.(previous);
  };

  const arm = (
    message: IResponseMessage,
    turnId: string,
    terminal: { toolCallId: string; terminalStatus: PostToolTerminalStatus }
  ) => {
    if (
      activeWatch?.turnId === turnId &&
      activeWatch.toolCallId === terminal.toolCallId &&
      activeWatch.terminalStatus === terminal.terminalStatus
    ) {
      return;
    }

    clear(false);
    activeWatch = {
      conversationId: message.conversation_id,
      turnId,
      toolCallId: terminal.toolCallId,
      terminalStatus: terminal.terminalStatus,
      armedAt: now(),
    };
    const policy = options.policy?.[terminal.terminalStatus] ?? DEFAULT_POLICY[terminal.terminalStatus];
    const watch = activeWatch;
    warningTimer = setTimeout(() => {
      if (activeWatch === watch) options.onWarning(watch);
    }, policy.warningAfterMs);
    stopTimer = setTimeout(() => {
      if (activeWatch !== watch) return;
      clearTimers();
      options.onTimeout(watch);
    }, policy.stopAfterMs);
  };

  return {
    observe(message: IResponseMessage, fallbackTurnId: string | null) {
      const terminal = terminalToolFromMessage(message);
      const turnId = message.turn_id || fallbackTurnId;
      if (terminal && turnId) {
        arm(message, turnId, terminal);
        return;
      }

      if (activeWatch && !PASSIVE_STREAM_TYPES.has(message.type)) clear(true);
    },
    clear() {
      clear(true);
    },
    dispose() {
      clear(false);
    },
    getActiveWatch() {
      return activeWatch;
    },
  };
};
