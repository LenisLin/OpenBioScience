/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ipcBridge } from '@/common';
import { getSystemDir, ProcessConfig } from '@process/utils/initStorage';
import { getZoomFactor, setZoomFactor } from '@process/utils/zoom';
import { getCdpStatus, updateCdpConfig } from '@process/utils/configureChromium';
import { getGpuStatus, setGpuUserOverride } from '@process/utils/gpuRecovery';
import { getConfigPath } from '@process/utils';
import { initApplicationBridgeCore } from './applicationBridgeCore';
import type { IAppDiagnosticsPathCheck, IAppDiagnosticsReport, IStartOnBootStatus } from '@/common/adapter/ipcBridge';
import { restartApplication } from './restartApplication';
import { readAutoUpdateDiagnostics } from '../services/autoUpdateDiagnostics';

let mainWindowRef: BrowserWindow | null = null;

const START_ON_BOOT_UNSUPPORTED_MESSAGE = 'Start on boot is only available in packaged macOS and Windows apps.';
export const START_ON_BOOT_WINDOWS_ARG = '--start-on-boot';
const OPENSCIENCE_DOWNLOAD_URL = 'https://openscience.cc';

const SAFE_ENV_KEYS = [
  'NODE_ENV',
  'DEEPORGANISER_DEBUG_BACKEND_STARTUP_FAILURE',
  'DEEPORGANISER_DISABLE_AUTO_UPDATE',
  'DEEPORGANISER_DISABLE_DEVTOOLS',
  'DEEPORGANISER_E2E_TEST',
  'DEEPORGANISER_CDP_PORT',
] as const;

const isStartOnBootSupported = (): boolean => {
  return app.isPackaged && (process.platform === 'darwin' || process.platform === 'win32');
};

const getStartOnBootWindowsArgs = (): string[] => [START_ON_BOOT_WINDOWS_ARG];

const getLoginItemSettings = () => {
  return process.platform === 'win32'
    ? app.getLoginItemSettings({ args: getStartOnBootWindowsArgs() })
    : app.getLoginItemSettings();
};

export function wasLaunchedAtLogin(): boolean {
  if (!app.isPackaged) {
    return false;
  }

  if (process.platform === 'darwin') {
    return Boolean(getLoginItemSettings().wasOpenedAtLogin);
  }

  if (process.platform === 'win32') {
    return process.argv.includes(START_ON_BOOT_WINDOWS_ARG);
  }

  return false;
}

export function getStartOnBootStatus(): IStartOnBootStatus {
  if (!isStartOnBootSupported()) {
    return {
      supported: false,
      enabled: false,
      isPackaged: app.isPackaged,
      platform: process.platform,
    };
  }

  const settings = getLoginItemSettings();
  const enabled =
    process.platform === 'win32'
      ? Boolean(settings.openAtLogin || settings.executableWillLaunchAtLogin)
      : Boolean(settings.openAtLogin);

  return {
    supported: true,
    enabled,
    isPackaged: app.isPackaged,
    platform: process.platform,
  };
}

export function setStartOnBootEnabled(enabled: boolean): IStartOnBootStatus {
  const currentStatus = getStartOnBootStatus();
  if (!currentStatus.supported) {
    return currentStatus;
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    ...(process.platform === 'win32'
      ? {
          args: getStartOnBootWindowsArgs(),
          enabled: true,
        }
      : {}),
  });

  return getStartOnBootStatus();
}

function getPackagedResourcesPath(): string {
  const processWithResourcesPath = process as NodeJS.Process & { resourcesPath?: string };
  return app.isPackaged && processWithResourcesPath.resourcesPath
    ? processWithResourcesPath.resourcesPath
    : path.resolve(process.cwd(), 'resources');
}

function checkPath(label: string, filePath: string, required = true): IAppDiagnosticsPathCheck {
  try {
    const stat = fs.statSync(filePath);
    const kind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
    return {
      exists: true,
      kind,
      label,
      modifiedAt: stat.mtime.toISOString(),
      path: filePath,
      required,
      size: stat.size,
    };
  } catch {
    return {
      exists: false,
      kind: 'missing',
      label,
      path: filePath,
      required,
    };
  }
}

function collectSafeEnvironment(): IAppDiagnosticsReport['env'] {
  return SAFE_ENV_KEYS.map((name) => {
    const value = process.env[name];
    return {
      name,
      present: value !== undefined && value !== '',
      value:
        name === 'NODE_ENV' || name === 'DEEPORGANISER_DEBUG_BACKEND_STARTUP_FAILURE' || name === 'DEEPORGANISER_CDP_PORT'
          ? value
          : value
            ? '<set>'
            : undefined,
    };
  });
}

function collectAppDiagnostics(): IAppDiagnosticsReport {
  const resourcesPath = getPackagedResourcesPath();
  const systemDir = getSystemDir();
  const userDataPath = app.getPath('userData');
  const backendStartupFailure =
    (globalThis as typeof globalThis & { __backendStartupFailure?: Record<string, unknown> | null })
      .__backendStartupFailure ?? null;
  const isPackagedResourceRequired = app.isPackaged;

  return {
    app: {
      arch: process.arch,
      execPath: process.execPath,
      isPackaged: app.isPackaged,
      locale: app.getLocale(),
      name: app.getName(),
      platform: process.platform,
      version: app.getVersion(),
    },
    autoUpdate: readAutoUpdateDiagnostics(userDataPath),
    backendStartupFailure,
    downloadUrl: OPENSCIENCE_DOWNLOAD_URL,
    env: collectSafeEnvironment(),
    generatedAt: new Date().toISOString(),
    paths: {
      appPath: app.getAppPath(),
      cacheDir: systemDir.cacheDir,
      configDir: getConfigPath(),
      logsDir: systemDir.logDir,
      resourcesPath,
      userDataPath,
      workDir: systemDir.workDir,
    },
    resources: [
      checkPath('Resources directory', resourcesPath, true),
      checkPath(
        'Bundled runtime directory',
        path.join(resourcesPath, 'bundled-deeporganiser-core'),
        isPackagedResourceRequired
      ),
      checkPath('Application archive', path.join(resourcesPath, 'app.asar'), isPackagedResourceRequired),
      checkPath(
        'Unpacked application resources',
        path.join(resourcesPath, 'app.asar.unpacked'),
        isPackagedResourceRequired
      ),
      checkPath('OpenBioScience app icon', path.join(resourcesPath, 'app.png'), isPackagedResourceRequired),
      checkPath('OpenBioScience logo', path.join(resourcesPath, 'openbioscience-logo.svg'), isPackagedResourceRequired),
      checkPath('PWA assets', path.join(resourcesPath, 'pwa'), false),
      checkPath('Assistant hub assets', path.join(resourcesPath, 'hub'), false),
      checkPath('User data directory', userDataPath, true),
      checkPath('Config directory', getConfigPath(), true),
      checkPath('Work directory', systemDir.workDir, true),
      checkPath('Logs directory', systemDir.logDir, true),
    ],
    versions: {
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
      v8: process.versions.v8,
    },
  };
}

export function setApplicationMainWindow(win: BrowserWindow): void {
  mainWindowRef = win;
}

export function initApplicationBridge(): void {
  // Platform-agnostic handlers: systemInfo, updateSystemInfo, getPath
  initApplicationBridgeCore();

  ipcBridge.application.restart.provider(async () => {
    // Backend subprocess shutdown is handled by backendManager.stop() in the
    // main window's before-quit hook; agent children are killed transitively
    // when backend exits.
    return restartApplication(app);
  });

  ipcBridge.application.isDevToolsOpened.provider(() => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      return Promise.resolve(mainWindowRef.webContents.isDevToolsOpened());
    }
    return Promise.resolve(false);
  });

  ipcBridge.application.openDevTools.provider(() => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      const win = mainWindowRef;
      const wasOpen = win.webContents.isDevToolsOpened();

      if (wasOpen) {
        win.webContents.closeDevTools();
        return Promise.resolve(false);
      } else {
        return new Promise((resolve) => {
          const onOpened = () => {
            win.webContents.off('devtools-opened', onOpened);
            resolve(true);
          };

          win.webContents.once('devtools-opened', onOpened);
          win.webContents.openDevTools();

          setTimeout(() => {
            win.webContents.off('devtools-opened', onOpened);
            if (win.isDestroyed()) {
              resolve(false);
              return;
            }
            resolve(win.webContents.isDevToolsOpened());
          }, 500);
        });
      }
    }
    return Promise.resolve(false);
  });

  ipcBridge.application.getZoomFactor.provider(() => Promise.resolve(getZoomFactor()));

  ipcBridge.application.setZoomFactor.provider(async ({ factor }) => {
    const updatedFactor = setZoomFactor(factor);
    try {
      await ProcessConfig.set('ui.zoomFactor', updatedFactor);
    } catch (error) {
      console.error('[ApplicationBridge] Failed to persist zoom factor:', error);
    }
    return updatedFactor;
  });

  ipcBridge.application.writeRendererLog.provider(async ({ level, tag, message, data }) => {
    const prefix = `[Renderer:${tag}] ${message}`;
    const args = data === undefined ? [prefix] : [prefix, data];
    if (level === 'error') {
      console.error(...args);
    } else if (level === 'warn') {
      console.warn(...args);
    } else if (level === 'debug') {
      console.debug(...args);
    } else {
      console.info(...args);
    }
  });

  // CDP status and configuration
  ipcBridge.application.getCdpStatus.provider(async () => {
    try {
      const status = getCdpStatus();
      // If port is set, CDP is considered enabled (verification is optional)
      return { success: true, data: status };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  ipcBridge.application.updateCdpConfig.provider(async (config) => {
    try {
      const updatedConfig = updateCdpConfig(config);
      return { success: true, data: updatedConfig };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  ipcBridge.application.getStartOnBootStatus.provider(async () => {
    try {
      return { success: true, data: getStartOnBootStatus() };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  ipcBridge.application.setStartOnBoot.provider(async ({ enabled }) => {
    try {
      const status = setStartOnBootEnabled(enabled);
      if (!status.supported) {
        return { success: false, msg: START_ON_BOOT_UNSUPPORTED_MESSAGE, data: status };
      }
      return { success: true, data: status };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  ipcBridge.application.getGpuStatus.provider(async () => {
    try {
      return { success: true, data: getGpuStatus() };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  ipcBridge.application.setGpuOverride.provider(async ({ override }) => {
    try {
      return { success: true, data: setGpuUserOverride(override) };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });

  ipcBridge.application.getDiagnostics.provider(async () => {
    try {
      return { success: true, data: collectAppDiagnostics() };
    } catch (e) {
      return { success: false, msg: e.message || e.toString() };
    }
  });
}
