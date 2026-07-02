/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PetStateMachine } from './petStateMachine';
import type { PetIdleTicker } from './petIdleTicker';

const STREAM_CHANNELS = new Set(['chat.response.stream', 'openclaw.response.stream']);
const AI_WATCHDOG_MS = 120_000;

type StreamMessage = {
  type?: string;
};

export class PetEventBridge {
  private disposed = false;
  private aiWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private sm: PetStateMachine,
    private ticker: PetIdleTicker
  ) {}

  handleBridgeMessage(channelName: string, data: unknown): void {
    if (this.disposed) return;

    // Permission request → notification state
    if (channelName === 'confirmation.add') {
      this.ticker.resetIdle();
      this.sm.requestState('notification');
      return;
    }

    if (!STREAM_CHANNELS.has(channelName)) return;

    const msg = data as StreamMessage | undefined;
    if (!msg?.type) return;

    let targetState: Parameters<PetStateMachine['requestState']>[0] | null = null;

    switch (msg.type) {
      case 'thinking':
      case 'thought':
        targetState = 'thinking';
        break;
      case 'text':
      case 'content':
        targetState = 'working';
        break;
      case 'finish':
        // `done` is the functional completion signal (bubble + check).
        // `happy` is reserved for user-initiated affection (right-click
        // "pat") so the two animations carry distinct meanings instead
        // of happy being both "AI finished" and "user petted me".
        targetState = 'done';
        this.clearAiWatchdog();
        break;
      case 'error':
        targetState = 'error';
        this.clearAiWatchdog();
        break;
    }

    if (targetState) {
      this.ticker.resetIdle();
      this.sm.requestState(targetState);
      if (!this.sm.getDnd() && (targetState === 'thinking' || targetState === 'working')) {
        this.armAiWatchdog(targetState);
      }
    }
  }

  handleUserSendMessage(): void {
    if (this.disposed) return;
    this.ticker.resetIdle();
    this.sm.requestState('thinking');
    if (!this.sm.getDnd()) {
      this.armAiWatchdog('user-send');
    }
  }

  handleTurnCompleted(): void {
    if (this.disposed) return;
    this.clearAiWatchdog();
    this.ticker.resetIdle();
    this.sm.requestState('done');
  }

  handleConfirmationAdd(): void {
    if (this.disposed) return;
    this.ticker.resetIdle();
    this.sm.requestState('notification');
  }

  dispose(): void {
    this.disposed = true;
    this.clearAiWatchdog();
  }

  private armAiWatchdog(source: string): void {
    this.clearAiWatchdog();
    this.aiWatchdogTimer = setTimeout(() => {
      this.aiWatchdogTimer = null;
      if (this.disposed) return;
      if (this.sm.getDnd()) return;
      this.ticker.resetIdle();
      this.sm.forceState('attention', 'watchdog', `AI activity timed out after ${AI_WATCHDOG_MS}ms from ${source}`);
    }, AI_WATCHDOG_MS);
  }

  private clearAiWatchdog(): void {
    if (this.aiWatchdogTimer) {
      clearTimeout(this.aiWatchdogTimer);
      this.aiWatchdogTimer = null;
    }
  }
}
