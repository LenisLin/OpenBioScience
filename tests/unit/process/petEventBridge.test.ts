/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetEventBridge } from '@/process/pet/petEventBridge';
import { PetStateMachine } from '@/process/pet/petStateMachine';

type TickerStub = {
  resetIdle: ReturnType<typeof vi.fn>;
};

const makeBridge = () => {
  const sm = new PetStateMachine();
  const ticker: TickerStub = {
    resetIdle: vi.fn(),
  };
  const bridge = new PetEventBridge(sm, ticker as never);
  return { bridge, sm, ticker };
};

describe('PetEventBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps stream events into pet states and arms the AI watchdog', () => {
    const { bridge, sm, ticker } = makeBridge();

    bridge.handleBridgeMessage('chat.response.stream', { type: 'thinking' });
    expect(sm.getCurrentState()).toBe('thinking');

    bridge.handleBridgeMessage('chat.response.stream', { type: 'content' });
    expect(sm.getCurrentState()).toBe('working');

    vi.advanceTimersByTime(120_000);

    expect(sm.getCurrentState()).toBe('attention');
    expect(ticker.resetIdle).toHaveBeenCalled();
    expect(sm.getTransitionLog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'working',
          to: 'attention',
          reason: 'watchdog',
        }),
      ])
    );
  });

  it('clears the AI watchdog when the stream finishes', () => {
    const { bridge, sm } = makeBridge();

    bridge.handleBridgeMessage('chat.response.stream', { type: 'thinking' });
    bridge.handleBridgeMessage('chat.response.stream', { type: 'finish' });

    expect(sm.getCurrentState()).toBe('done');

    vi.advanceTimersByTime(120_000);

    expect(sm.getCurrentState()).toBe('idle');
    expect(sm.getTransitionLog()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'watchdog',
        }),
      ])
    );
  });

  it('does not arm or fire the AI watchdog in DND mode', () => {
    const { bridge, sm } = makeBridge();

    sm.setDnd(true);
    bridge.handleUserSendMessage();

    expect(sm.getCurrentState()).toBe('idle');

    vi.advanceTimersByTime(120_000);

    expect(sm.getCurrentState()).toBe('idle');
    expect(sm.getTransitionLog()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'watchdog',
        }),
      ])
    );
  });

  it('disposes pending watchdog timers without later state changes', () => {
    const { bridge, sm } = makeBridge();

    bridge.handleBridgeMessage('chat.response.stream', { type: 'thinking' });
    expect(sm.getCurrentState()).toBe('thinking');

    bridge.dispose();
    vi.advanceTimersByTime(120_000);

    expect(sm.getCurrentState()).toBe('thinking');
  });
});
