/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserView, BrowserWindow } from 'electron';
import { ipcBridge } from '@/common';
import type {
  INativeWebPanelBounds,
  INativeWebPanelResult,
  INativeWebPanelShowRequest,
} from '@/common/adapter/ipcBridge';

interface NativeWebPanel {
  id: string;
  view: BrowserView;
  owner: BrowserWindow;
  url: string;
}

const panels = new Map<string, NativeWebPanel>();
const ownersWithCleanup = new WeakSet<BrowserWindow>();

function normalizeBounds(bounds: INativeWebPanelBounds): Electron.Rectangle {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
}

function findOwnerWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) ?? null;
}

function removePanel(panel: NativeWebPanel): void {
  detachPanel(panel);

  if (!panel.view.webContents.isDestroyed()) {
    panel.view.webContents.close({ waitForBeforeUnload: false });
  }
}

function disposePanel(id: string): void {
  const panel = panels.get(id);
  if (!panel) return;
  panels.delete(id);
  removePanel(panel);
}

function ensureOwnerCleanup(owner: BrowserWindow): void {
  if (ownersWithCleanup.has(owner)) return;
  ownersWithCleanup.add(owner);

  owner.once('closed', () => {
    for (const [id, panel] of panels.entries()) {
      if (panel.owner !== owner) continue;
      panels.delete(id);
      removePanel(panel);
    }
  });
}

function isPanelAttached(panel: NativeWebPanel): boolean {
  return !panel.owner.isDestroyed() && panel.owner.getBrowserViews().includes(panel.view);
}

function detachPanel(panel: NativeWebPanel): void {
  if (!isPanelAttached(panel)) return;
  try {
    panel.owner.removeBrowserView(panel.view);
  } catch {
    // BrowserView may already have been detached.
  }
}

function attachPanel(panel: NativeWebPanel, bounds: Electron.Rectangle): void {
  if (panel.owner.isDestroyed()) return;
  if (isPanelAttached(panel)) {
    panel.owner.removeBrowserView(panel.view);
  }
  panel.owner.addBrowserView(panel.view);
  panel.view.setBounds(bounds);
  if (!panel.view.webContents.isDestroyed()) {
    panel.view.webContents.invalidate();
    setTimeout(() => {
      if (panel.owner.isDestroyed() || panel.view.webContents.isDestroyed() || !isPanelAttached(panel)) return;
      panel.view.setBounds(bounds);
      panel.view.webContents.invalidate();
    }, 80);
  }
}

function createPanel(request: INativeWebPanelShowRequest, owner: BrowserWindow): NativeWebPanel {
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: request.partition,
      backgroundThrottling: false,
    },
  });

  const panel: NativeWebPanel = {
    id: request.id,
    view,
    owner,
    url: '',
  };

  view.setAutoResize({ width: false, height: false, horizontal: false, vertical: false });

  if (request.userAgent) {
    view.webContents.setUserAgent(request.userAgent);
  }

  view.webContents.setWindowOpenHandler(({ url }) => {
    void view.webContents.loadURL(url);
    return { action: 'deny' };
  });

  view.webContents.on('did-navigate', (_event, url) => {
    panel.url = url;
    ipcBridge.nativeWebPanel.navigated.emit({ id: panel.id, url });
  });
  view.webContents.on('did-navigate-in-page', (_event, url) => {
    panel.url = url;
    ipcBridge.nativeWebPanel.navigated.emit({ id: panel.id, url });
  });

  ensureOwnerCleanup(owner);

  return panel;
}

async function showPanel(request: INativeWebPanelShowRequest): Promise<INativeWebPanelResult> {
  const owner = findOwnerWindow();
  if (!owner) {
    return { ok: false, error: 'No active application window.' };
  }

  try {
    const existing = panels.get(request.id);
    if (existing && existing.owner !== owner) {
      disposePanel(request.id);
    }

    const panel = panels.get(request.id) ?? createPanel(request, owner);
    panels.set(request.id, panel);
    const normalizedBounds = normalizeBounds(request.bounds);
    const shouldBringToFront = request.bringToFront !== false;
    const shouldLoadUrl = Boolean(request.url && panel.url !== request.url && !(request.preserveCurrentUrl && panel.url));

    if (request.userAgent) {
      panel.view.webContents.setUserAgent(request.userAgent);
    }

    if (!shouldBringToFront) {
      if (shouldLoadUrl && request.url) {
        panel.url = request.url;
        await panel.view.webContents.loadURL(request.url);
      }
      detachPanel(panel);
      return { ok: true, url: panel.url };
    }

    if (shouldLoadUrl && request.url) {
      detachPanel(panel);
      panel.url = request.url;
      await panel.view.webContents.loadURL(request.url);
    }

    attachPanel(panel, normalizedBounds);

    return { ok: true, url: panel.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function updateBounds(id: string, bounds: INativeWebPanelBounds): Promise<INativeWebPanelResult> {
  const panel = panels.get(id);
  if (!panel) return { ok: false, error: 'Panel is not active.' };

  try {
    panel.view.setBounds(normalizeBounds(bounds));
    return { ok: true, url: panel.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function hidePanel(id: string): Promise<INativeWebPanelResult> {
  try {
    disposePanel(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function parkPanel(id: string): Promise<INativeWebPanelResult> {
  const panel = panels.get(id);
  if (!panel) return { ok: true };

  try {
    detachPanel(panel);
    return { ok: true, url: panel.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function initNativeWebPanelBridge(): void {
  ipcBridge.nativeWebPanel.show.provider(showPanel);
  ipcBridge.nativeWebPanel.updateBounds.provider(({ id, bounds }) => updateBounds(id, bounds));
  ipcBridge.nativeWebPanel.park.provider(({ id }) => parkPanel(id));
  ipcBridge.nativeWebPanel.hide.provider(({ id }) => hidePanel(id));
}
