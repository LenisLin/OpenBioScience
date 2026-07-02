/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ipcBridge } from '@/common';
import type { INativeWebPanelBounds } from '@/common/adapter/ipcBridge';
import PageLoadingState from '@/renderer/components/layout/PageLoadingState';

export interface NativeWebPanelHostProps {
  id: string;
  url: string;
  partition?: string;
  userAgent?: string;
  loadingLabel?: string;
  className?: string;
  active?: boolean;
  preloadWhenInactive?: boolean;
  keepAliveOnUnmount?: boolean;
  preserveCurrentUrl?: boolean;
  onDidNavigate?: (url: string) => void;
}

function boundsEqual(a: INativeWebPanelBounds | null, b: INativeWebPanelBounds): boolean {
  return Boolean(a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
}

function readHostBounds(element: HTMLElement): INativeWebPanelBounds | null {
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

const NativeWebPanelHost: React.FC<NativeWebPanelHostProps> = ({
  id,
  url,
  partition,
  userAgent,
  loadingLabel = 'Loading...',
  className,
  active = true,
  preloadWhenInactive = false,
  keepAliveOnUnmount = false,
  preserveCurrentUrl = false,
  onDidNavigate,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lastBoundsRef = useRef<INativeWebPanelBounds | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  const clearReadyTimer = useCallback(() => {
    if (readyTimerRef.current === null) return;
    window.clearTimeout(readyTimerRef.current);
    readyTimerRef.current = null;
  }, []);

  const markReadySoon = useCallback(() => {
    clearReadyTimer();
    readyTimerRef.current = window.setTimeout(() => {
      readyTimerRef.current = null;
      setReady(true);
    }, 180);
  }, [clearReadyTimer]);

  const syncPanel = useCallback(async () => {
    if (!active && !preloadWhenInactive) {
      await ipcBridge.nativeWebPanel.park.invoke({ id });
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    const bounds = active ? readHostBounds(host) : { x: -10000, y: -10000, width: 1, height: 1 };
    if (!bounds) return;

    lastBoundsRef.current = bounds;
    const result = await ipcBridge.nativeWebPanel.show.invoke({
      id,
      url,
      bounds,
      partition,
      userAgent,
      bringToFront: active,
      preserveCurrentUrl,
    });

    if (result.ok) {
      markReadySoon();
      if (result.url) {
        onDidNavigate?.(result.url);
      }
    }
  }, [active, id, markReadySoon, onDidNavigate, partition, preloadWhenInactive, preserveCurrentUrl, url, userAgent]);

  const syncBoundsOnly = useCallback(async () => {
    if (!active) return;

    const host = hostRef.current;
    if (!host) return;

    const bounds = readHostBounds(host);
    if (!bounds || boundsEqual(lastBoundsRef.current, bounds)) return;

    lastBoundsRef.current = bounds;
    await ipcBridge.nativeWebPanel.updateBounds.invoke({ id, bounds });
  }, [active, id]);

  useEffect(() => {
    clearReadyTimer();
    setReady(false);
    void syncPanel();
  }, [clearReadyTimer, syncPanel]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new ResizeObserver(() => {
      void syncBoundsOnly();
    });
    observer.observe(host);

    window.addEventListener('resize', syncBoundsOnly);
    window.addEventListener('scroll', syncBoundsOnly, true);

    const frameId = window.requestAnimationFrame(() => {
      void syncPanel();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('resize', syncBoundsOnly);
      window.removeEventListener('scroll', syncBoundsOnly, true);
      clearReadyTimer();
      void (keepAliveOnUnmount
        ? ipcBridge.nativeWebPanel.park.invoke({ id })
        : ipcBridge.nativeWebPanel.hide.invoke({ id }));
    };
  }, [clearReadyTimer, id, keepAliveOnUnmount, syncBoundsOnly, syncPanel]);

  useEffect(() => {
    return ipcBridge.nativeWebPanel.navigated.on((event) => {
      if (event.id === id) {
        onDidNavigate?.(event.url);
      }
    });
  }, [id, onDidNavigate]);

  return (
    <div ref={hostRef} className={`relative size-full min-w-0 min-h-0 overflow-hidden bg-bg-1 ${className ?? ''}`}>
      {active && !ready && (
        <PageLoadingState label={loadingLabel} />
      )}
    </div>
  );
};

export default NativeWebPanelHost;
