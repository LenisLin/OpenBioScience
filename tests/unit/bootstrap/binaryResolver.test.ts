import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBinaryPath } from '@/process/backend';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
const originalDefaultApp = (process as NodeJS.Process & { defaultApp?: boolean }).defaultApp;
const originalCwd = process.cwd;
const originalBackendBin = process.env.DEEPORGANISER_CORE_BIN;
const originalElectronRendererUrl = process.env.ELECTRON_RENDERER_URL;

function setResourcesPath(resourcesPath: string | undefined): void {
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: resourcesPath,
  });
}

function setDefaultApp(defaultApp: boolean | undefined): void {
  Object.defineProperty(process, 'defaultApp', {
    configurable: true,
    value: defaultApp,
  });
}

function dirEntry(name: string, isDirectory = false): ReturnType<typeof readdirSync>[number] {
  return {
    name,
    isDirectory: () => isDirectory,
  } as unknown as ReturnType<typeof readdirSync>[number];
}

describe('resolveBinaryPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DEEPORGANISER_CORE_BIN;
  });

  afterEach(() => {
    setResourcesPath(originalResourcesPath);
    setDefaultApp(originalDefaultApp);
    process.cwd = originalCwd;
    if (originalBackendBin === undefined) {
      delete process.env.DEEPORGANISER_CORE_BIN;
    } else {
      process.env.DEEPORGANISER_CORE_BIN = originalBackendBin;
    }
    if (originalElectronRendererUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = originalElectronRendererUrl;
    }
  });

  it('uses DEEPORGANISER_CORE_BIN when it points to an existing binary', () => {
    const binaryPath = '/custom/deeporganiser-core';
    process.env.DEEPORGANISER_CORE_BIN = binaryPath;
    vi.mocked(existsSync).mockImplementation((path) => path === binaryPath);

    expect(resolveBinaryPath()).toBe(binaryPath);
    expect(execSync).not.toHaveBeenCalled();
  });

  it('uses repo resources when running through the Electron default app in development', () => {
    const repoRoot = '/repo';
    const runtimeKey = `${process.platform}-${process.arch}`;
    const binaryName = process.platform === 'win32' ? 'deeporganiser-core.exe' : 'deeporganiser-core';
    const binaryPath = join(repoRoot, 'resources', 'bundled-deeporganiser-core', runtimeKey, binaryName);

    setDefaultApp(true);
    setResourcesPath('/electron/resources');
    process.cwd = vi.fn(() => repoRoot) as unknown as typeof process.cwd;
    vi.mocked(existsSync).mockImplementation((path) => path === binaryPath);
    vi.mocked(readdirSync).mockReturnValue([]);

    expect(resolveBinaryPath()).toBe(binaryPath);
  });

  it('uses repo resources when electron-vite launches the development renderer', () => {
    const repoRoot = '/repo';
    const runtimeKey = `${process.platform}-${process.arch}`;
    const binaryName = process.platform === 'win32' ? 'deeporganiser-core.exe' : 'deeporganiser-core';
    const binaryPath = join(repoRoot, 'resources', 'bundled-deeporganiser-core', runtimeKey, binaryName);

    setDefaultApp(false);
    setResourcesPath('/electron/resources');
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';
    process.cwd = vi.fn(() => repoRoot) as unknown as typeof process.cwd;
    vi.mocked(existsSync).mockImplementation((path) => path === binaryPath);
    vi.mocked(readdirSync).mockReturnValue([]);

    expect(resolveBinaryPath()).toBe(binaryPath);
  });

  it('attaches bundled path diagnostics when DeepOrganiser Core cannot be resolved', () => {
    const resourcesPath = '/app/resources';
    const runtimeKey = `${process.platform}-${process.arch}`;
    const binaryName = process.platform === 'win32' ? 'deeporganiser-core.exe' : 'deeporganiser-core';
    const bundledDir = join(resourcesPath, 'bundled-deeporganiser-core');
    const runtimeDir = join(bundledDir, runtimeKey);
    const checkedBundledPath = join(runtimeDir, binaryName);

    setResourcesPath(resourcesPath);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockImplementation((path) => {
      if (path === resourcesPath) return [dirEntry('bundled-deeporganiser-core', true)];
      if (path === runtimeDir) return [dirEntry('manifest.json')];
      return [] as ReturnType<typeof readdirSync>;
    });
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found on PATH');
    });

    expect(() => resolveBinaryPath()).toThrow('Cannot find "deeporganiser-core" binary');

    try {
      resolveBinaryPath();
    } catch (error) {
      expect(error).toMatchObject({
        name: 'BackendBinaryResolveError',
        diagnostics: expect.objectContaining({
          resourcesPath,
          runtimeKey,
          binaryName,
          checkedBundledPath,
          bundledDirExists: false,
          runtimeDirExists: false,
          resourcesDirEntries: ['bundled-deeporganiser-core/'],
          runtimeDirEntries: ['manifest.json'],
          pathLookupCommand: process.platform === 'win32' ? 'where deeporganiser-core' : 'which deeporganiser-core',
          pathLookupError: expect.stringContaining('not found on PATH'),
        }),
      });
    }
  });
});
