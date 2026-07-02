/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetStateMachine } from '@/process/pet/petStateMachine';

describe('PetStateMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forces idle and records a transition when DND is enabled during AI activity', () => {
    const sm = new PetStateMachine();

    expect(sm.requestState('working')).toBe('working');
    expect(sm.getCurrentState()).toBe('working');

    sm.setDnd(true);

    expect(sm.getDnd()).toBe(true);
    expect(sm.getCurrentState()).toBe('idle');
    expect(sm.getTransitionLog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'working',
          to: 'idle',
          reason: 'dnd-idle',
          detail: 'DND enabled',
          dnd: true,
        }),
      ])
    );
  });

  it('rejects AI requests in DND but still allows dragging', () => {
    const sm = new PetStateMachine();

    sm.setDnd(true);

    expect(sm.requestState('thinking')).toBeNull();
    expect(sm.getCurrentState()).toBe('idle');
    expect(sm.requestState('dragging')).toBe('dragging');
    expect(sm.getCurrentState()).toBe('dragging');
    expect(sm.getTransitionLog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requested: 'thinking',
          reason: 'request-rejected',
          detail: 'dnd',
          dnd: true,
        }),
      ])
    );
  });

  it('queues equal-priority states until the minimum display time has elapsed', () => {
    const sm = new PetStateMachine();

    expect(sm.requestState('done')).toBe('done');
    expect(sm.requestState('happy')).toBeNull();
    expect(sm.getCurrentState()).toBe('done');

    vi.advanceTimersByTime(3499);
    expect(sm.getCurrentState()).toBe('done');

    vi.advanceTimersByTime(1);
    expect(sm.getCurrentState()).toBe('happy');
    expect(sm.getTransitionLog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requested: 'happy',
          reason: 'request-pending',
        }),
        expect.objectContaining({
          from: 'done',
          to: 'happy',
          reason: 'pending-applied',
        }),
      ])
    );
  });

  it('cancels pending and auto-return timers when DND is enabled', () => {
    const sm = new PetStateMachine();

    sm.requestState('done');
    sm.requestState('happy');
    sm.setDnd(true);

    expect(sm.getCurrentState()).toBe('idle');

    vi.advanceTimersByTime(10_000);

    expect(sm.getCurrentState()).toBe('idle');
    expect(sm.getTransitionLog()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: 'happy',
          reason: 'pending-applied',
        }),
      ])
    );
  });

  it('auto-returns transient states and records the return', () => {
    const sm = new PetStateMachine();

    sm.requestState('attention');
    expect(sm.getCurrentState()).toBe('attention');

    vi.advanceTimersByTime(3000);

    expect(sm.getCurrentState()).toBe('idle');
    expect(sm.getTransitionLog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'attention',
          to: 'idle',
          reason: 'auto-return',
        }),
      ])
    );
  });

  it('keeps transition logs bounded and cheap under repeated requests', () => {
    const sm = new PetStateMachine();
    const startedAt = performance.now();

    for (let i = 0; i < 5000; i += 1) {
      sm.forceState(i % 2 === 0 ? 'working' : 'idle', 'force', 'perf smoke');
    }

    const elapsedMs = performance.now() - startedAt;

    expect(sm.getTransitionLog()).toHaveLength(120);
    expect(elapsedMs).toBeLessThan(150);
  });
});
