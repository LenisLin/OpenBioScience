/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PageLoadingState from '@/renderer/components/layout/PageLoadingState';
import { useTranslation } from 'react-i18next';
import {
  COLLABORATION_CONNECTED_STORAGE_KEY,
  COLLABORATION_MODULES,
  COLLABORATION_PARTITION,
  FEISHU_DESKTOP_USER_AGENT,
  getCollaborationModule,
  getStoredFeishuWorkspaceOrigin,
  isFeishuLoginUrl,
  isFeishuWorkspaceUrl,
  rememberFeishuWorkspaceOrigin,
  type CollaborationModuleId,
} from './collaborationConfig';
import {
  type CollaborationWebPanelState,
  setCollaborationLoginModalVisible,
  updateCollaborationWebState,
} from './collaborationWebState';

interface WebviewFailLoadEvent extends Event {
  errorCode?: number;
  errorDescription?: string;
  isMainFrame?: boolean;
  validatedURL?: string;
}

const modulePathById = new Map(COLLABORATION_MODULES.map((module) => [module.id, module.path]));
function getActiveModuleId(pathname: string): CollaborationModuleId | null {
  const matched = COLLABORATION_MODULES.find((module) => pathname.startsWith(module.path));
  return matched?.id ?? null;
}

function applyWebviewSize(webview: Electron.WebviewTag, width: number, height: number): void {
  const normalizedWidth = Math.max(1, Math.round(width));
  const normalizedHeight = Math.max(1, Math.round(height));

  webview.setAttribute('autosize', 'on');
  webview.setAttribute('minwidth', String(normalizedWidth));
  webview.setAttribute('maxwidth', String(normalizedWidth));
  webview.setAttribute('minheight', String(normalizedHeight));
  webview.setAttribute('maxheight', String(normalizedHeight));
  webview.style.width = `${normalizedWidth}px`;
  webview.style.height = `${normalizedHeight}px`;
  webview.style.minWidth = `${normalizedWidth}px`;
  webview.style.minHeight = `${normalizedHeight}px`;
  webview.style.maxWidth = `${normalizedWidth}px`;
  webview.style.maxHeight = `${normalizedHeight}px`;
}

function isIgnorableFailLoad(event: WebviewFailLoadEvent): boolean {
  return event.isMainFrame === false || event.errorCode === -3;
}

interface CollaborationWebviewPoolProps {
  activeRoute?: boolean;
}

const CollaborationWebviewPool: React.FC<CollaborationWebviewPoolProps> = ({ activeRoute = false }) => {
  const location = useLocation();
  const activeModuleId = getActiveModuleId(location.pathname);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const webviewRefs = useRef(new Map<CollaborationModuleId, Electron.WebviewTag>());
  const webLoginStartedRef = useRef(false);
  const [moduleRevision, setModuleRevision] = useState(0);
  const modules = useMemo(
    () => COLLABORATION_MODULES.map((module) => getCollaborationModule(module.id)),
    [moduleRevision],
  );
  const [states, setStates] = useState<Record<string, CollaborationWebPanelState>>({});
  const { t } = useTranslation();

  const patchState = useCallback((moduleId: CollaborationModuleId, patch: Partial<Omit<CollaborationWebPanelState, 'moduleId'>>) => {
    const next = updateCollaborationWebState(moduleId, patch);
    setStates((previous) => ({ ...previous, [moduleId]: next }));
  }, []);

  const handleUrl = useCallback((url: string) => {
    if (isFeishuLoginUrl(url)) {
      webLoginStartedRef.current = true;
      localStorage.removeItem(COLLABORATION_CONNECTED_STORAGE_KEY);
      setCollaborationLoginModalVisible(true);
      return;
    }

    if (isFeishuWorkspaceUrl(url)) {
      const previousOrigin = getStoredFeishuWorkspaceOrigin();
      rememberFeishuWorkspaceOrigin(url);
      if (getStoredFeishuWorkspaceOrigin() !== previousOrigin) {
        setModuleRevision((revision) => revision + 1);
      }
      if (webLoginStartedRef.current) {
        webLoginStartedRef.current = false;
        localStorage.setItem(COLLABORATION_CONNECTED_STORAGE_KEY, 'true');
        setCollaborationLoginModalVisible(false);
      }
    }
  }, []);

  useEffect(() => {
    modules.forEach((module) => {
      patchState(module.id, {
        url: module.url,
        loading: true,
        ready: false,
        error: undefined,
      });
    });
  }, [modules, patchState]);

  useEffect(() => {
    const cleanups = modules
      .map((module) => {
        const webview = webviewRefs.current.get(module.id);
        if (!webview) return null;

        const handleStart = () => {
          patchState(module.id, { loading: true, error: undefined });
        };
        const handleStop = () => {
          patchState(module.id, { loading: false });
        };
        const handleFinish = () => {
          patchState(module.id, { loading: false, ready: true, error: undefined });
        };
        const handleFail = (event: WebviewFailLoadEvent) => {
          if (isIgnorableFailLoad(event)) {
            patchState(module.id, { loading: false });
            return;
          }
          patchState(module.id, {
            loading: false,
            ready: false,
            error: event.errorDescription || String(event.errorCode ?? ''),
          });
        };
        const handleNavigate = (event: Event & { url?: string }) => {
          const url = event.url;
          if (!url) return;
          patchState(module.id, { url });
          handleUrl(url);
        };
        const handleDomReady = () => {
          try {
            webview.setZoomFactor(1);
          } catch {
            // Ignore timing errors while Electron initializes the guest contents.
          }
          patchState(module.id, { loading: false, ready: true, error: undefined });
        };

        webview.addEventListener('did-start-loading', handleStart);
        webview.addEventListener('did-stop-loading', handleStop);
        webview.addEventListener('did-finish-load', handleFinish);
        webview.addEventListener('did-fail-load', handleFail as EventListener);
        webview.addEventListener('did-navigate', handleNavigate as EventListener);
        webview.addEventListener('did-navigate-in-page', handleNavigate as EventListener);
        webview.addEventListener('dom-ready', handleDomReady);

        return () => {
          webview.removeEventListener('did-start-loading', handleStart);
          webview.removeEventListener('did-stop-loading', handleStop);
          webview.removeEventListener('did-finish-load', handleFinish);
          webview.removeEventListener('did-fail-load', handleFail as EventListener);
          webview.removeEventListener('did-navigate', handleNavigate as EventListener);
          webview.removeEventListener('did-navigate-in-page', handleNavigate as EventListener);
          webview.removeEventListener('dom-ready', handleDomReady);
        };
      })
      .filter(Boolean) as Array<() => void>;

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [handleUrl, modules, patchState]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let rafId = 0;
    const syncWebviewSize = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const rect = host.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        webviewRefs.current.forEach((webview) => {
          applyWebviewSize(webview, width, height);
        });
      });
    };

    syncWebviewSize();
    const observer = new ResizeObserver(syncWebviewSize);
    observer.observe(host);
    window.addEventListener('resize', syncWebviewSize);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', syncWebviewSize);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    webviewRefs.current.forEach((webview) => {
      applyWebviewSize(webview, width, height);
    });
  }, [activeModuleId, activeRoute]);

  const activeState = activeModuleId ? states[activeModuleId] : undefined;
  const showLoading = Boolean(activeModuleId && !activeState?.ready);

  return (
    <div
      ref={hostRef}
      className='absolute inset-0 pointer-events-none'
      aria-hidden={!activeModuleId}
      style={{ zIndex: activeRoute && activeModuleId ? 2 : 0 }}
    >
      {modules.map((module) => {
        const active = activeModuleId === module.id;
        return (
          <webview
            key={module.id}
            ref={(element) => {
              if (element) {
                webviewRefs.current.set(module.id, element as unknown as Electron.WebviewTag);
              } else {
                webviewRefs.current.delete(module.id);
              }
            }}
            src={module.url}
            partition={COLLABORATION_PARTITION}
            useragent={FEISHU_DESKTOP_USER_AGENT}
            allowpopups={false}
            autosize={true}
            webpreferences='contextIsolation=no, nodeIntegration=no, nativeWindowOpen=no, backgroundThrottling=no'
            className='absolute inset-0 h-full w-full border-0 bg-bg-1'
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              opacity: active ? 1 : 0.001,
              pointerEvents: active ? 'auto' : 'none',
              zIndex: active ? 2 : 1,
            }}
          />
        );
      })}
      {showLoading ? <PageLoadingState label={t('common.collaboration.loadingPage')} className='z-5' /> : null}
    </div>
  );
};

export default CollaborationWebviewPool;
