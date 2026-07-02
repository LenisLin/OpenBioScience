/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { UserInputRequest, UserInputResult } from '@/common/chat/userInput';
import { useEffect, useSyncExternalStore } from 'react';

type Listener = () => void;

type State = {
  pendingById: Map<string, UserInputRequest>;
  latestResolvedById: Map<string, UserInputResult>;
};

const state: State = {
  pendingById: new Map(),
  latestResolvedById: new Map(),
};

const listeners = new Set<Listener>();
let initialized = false;

const emit = () => {
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): State => state;

const upsertPending = (request: UserInputRequest) => {
  state.pendingById.set(request.requestId, request);
  emit();
};

const resolvePending = (result: UserInputResult) => {
  state.pendingById.delete(result.requestId);
  state.latestResolvedById.set(result.requestId, result);
  emit();
};

export const initializeUserInputStore = (): void => {
  if (initialized) return;
  initialized = true;

  ipcBridge.conversation.userInput.requested.on((request) => {
    upsertPending(request);
  });
  ipcBridge.conversation.userInput.resolved.on((result) => {
    resolvePending(result);
  });
};

export const useUserInputRequests = (conversationId?: string): UserInputRequest[] => {
  initializeUserInputStore();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    const params = conversationId ? { conversation_id: conversationId } : undefined;
    void ipcBridge.conversation.userInput.listPending.invoke(params).then((requests) => {
      requests.forEach(upsertPending);
    });
  }, [conversationId]);

  return [...snapshot.pendingById.values()].filter(
    (request) => !conversationId || !request.conversationId || request.conversationId === conversationId
  );
};

export const useHasPendingUserInput = (conversationId: string): boolean => {
  initializeUserInputStore();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return [...snapshot.pendingById.values()].some(
    (request) => !request.conversationId || request.conversationId === conversationId
  );
};
