/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CollaborationModuleId } from './collaborationConfig';

export interface CollaborationWebPanelState {
  moduleId: CollaborationModuleId;
  url: string;
  loading: boolean;
  ready: boolean;
  error?: string;
}

type Listener = (state: CollaborationWebPanelState) => void;
type ModalListener = (visible: boolean) => void;

const panelState = new Map<CollaborationModuleId, CollaborationWebPanelState>();
const listeners = new Set<Listener>();
const modalListeners = new Set<ModalListener>();
let loginModalVisible = false;

export function getCollaborationWebState(moduleId: CollaborationModuleId): CollaborationWebPanelState | undefined {
  return panelState.get(moduleId);
}

export function updateCollaborationWebState(
  moduleId: CollaborationModuleId,
  patch: Partial<Omit<CollaborationWebPanelState, 'moduleId'>>
): CollaborationWebPanelState {
  const previous = panelState.get(moduleId);
  const next: CollaborationWebPanelState = {
    moduleId,
    url: patch.url ?? previous?.url ?? '',
    loading: patch.loading ?? previous?.loading ?? false,
    ready: patch.ready ?? previous?.ready ?? false,
    error: patch.error ?? previous?.error,
  };
  panelState.set(moduleId, next);
  listeners.forEach((listener) => listener(next));
  return next;
}

export function subscribeCollaborationWebState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCollaborationLoginModalVisible(): boolean {
  return loginModalVisible;
}

export function setCollaborationLoginModalVisible(visible: boolean): void {
  if (loginModalVisible === visible) return;
  loginModalVisible = visible;
  modalListeners.forEach((listener) => listener(visible));
}

export function subscribeCollaborationLoginModalVisible(listener: ModalListener): () => void {
  modalListeners.add(listener);
  return () => modalListeners.delete(listener);
}
