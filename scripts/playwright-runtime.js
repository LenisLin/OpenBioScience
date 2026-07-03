#!/usr/bin/env node
/**
 * Central Playwright runtime helper for OpenScience.
 *
 * The desktop app and Electron e2e tests can usually use the host Chrome via
 * Playwright's `channel: chrome`, so browser downloads should be explicit and
 * diagnosable instead of silently blocking every install.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PLAYWRIGHT_BROWSERS = ['chromium', 'chromium-headless-shell'];
const DEFAULT_INSTALL_TIMEOUT_MS = 300000;

function envFlag(name) {
  return process.env[name] === '1' || process.env[name] === 'true';
}

function shouldSkipPlaywrightInstall() {
  return (
    envFlag('OPENSCIENCE_SKIP_PLAYWRIGHT_INSTALL') ||
    envFlag('OPENSIENCE_SKIP_PLAYWRIGHT_INSTALL') ||
    envFlag('DEEPORGANISER_SKIP_PLAYWRIGHT_INSTALL')
  );
}

function shouldInstallPlaywrightBrowsers() {
  return (
    envFlag('OPENSCIENCE_INSTALL_PLAYWRIGHT') ||
    envFlag('OPENSIENCE_INSTALL_PLAYWRIGHT') ||
    envFlag('DEEPORGANISER_INSTALL_PLAYWRIGHT')
  );
}

function getInstallTimeoutMs() {
  const raw = Number(process.env.OPENSCIENCE_PLAYWRIGHT_INSTALL_TIMEOUT_MS || '');
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INSTALL_TIMEOUT_MS;
}

function existingPath(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function findSystemChrome() {
  if (process.env.PLAYWRIGHT_CHROME_EXECUTABLE && fs.existsSync(process.env.PLAYWRIGHT_CHROME_EXECUTABLE)) {
    return process.env.PLAYWRIGHT_CHROME_EXECUTABLE;
  }

  if (process.platform === 'darwin') {
    return existingPath([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]);
  }

  if (process.platform === 'win32') {
    return existingPath([
      path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    ]);
  }

  return existingPath([
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ]);
}

function getPlaywrightVersion() {
  try {
    return require('../node_modules/playwright/package.json').version;
  } catch {
    return 'not installed';
  }
}

function getBundledChromiumPath() {
  try {
    return require('playwright').chromium.executablePath();
  } catch {
    return undefined;
  }
}

function getRuntimeStatus() {
  const bundledChromiumPath = getBundledChromiumPath();
  const bundledChromiumExists = Boolean(bundledChromiumPath && fs.existsSync(bundledChromiumPath));
  const systemChromePath = findSystemChrome();
  return {
    playwrightVersion: getPlaywrightVersion(),
    bundledChromiumPath,
    bundledChromiumExists,
    systemChromePath,
    hasUsableBrowser: bundledChromiumExists || Boolean(systemChromePath),
  };
}

function printRuntimeStatus() {
  const status = getRuntimeStatus();
  console.log(`Playwright: ${status.playwrightVersion}`);
  console.log(`Bundled Chromium: ${status.bundledChromiumExists ? status.bundledChromiumPath : 'not ready'}`);
  console.log(`System Chrome/Edge: ${status.systemChromePath || 'not found'}`);
  if (status.systemChromePath) {
    console.log('Default local e2e/browser automation can use Playwright channel "chrome".');
  } else if (!status.bundledChromiumExists) {
    console.log('Run `bun run playwright:install` before browser-based screenshots or Playwright page tests.');
  }
  return status;
}

function installPlaywrightBrowsers({ optional = false } = {}) {
  const playwrightCli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
  const result = spawnSync(process.execPath, [playwrightCli, 'install', ...PLAYWRIGHT_BROWSERS], {
    stdio: 'inherit',
    timeout: getInstallTimeoutMs(),
  });

  if (result.error || result.status !== 0) {
    const reason =
      result.error?.code === 'ETIMEDOUT'
        ? `timed out after ${getInstallTimeoutMs()}ms`
        : result.error?.message || `exit code ${result.status ?? 'unknown'}`;
    const message = `Playwright browser install failed: ${reason}`;
    if (optional) {
      console.warn(message);
      printRuntimeStatus();
      return false;
    }
    throw new Error(message);
  }

  printRuntimeStatus();
  return true;
}

function installPlaywrightBrowsersIfRequested({ isCI = false } = {}) {
  if (isCI) {
    console.log('CI environment detected, skipping Playwright browser install');
    return false;
  }

  if (shouldSkipPlaywrightInstall()) {
    console.log('Skipping Playwright browser install because OPENSCIENCE_SKIP_PLAYWRIGHT_INSTALL=1');
    return false;
  }

  if (!shouldInstallPlaywrightBrowsers()) {
    console.log(
      'Skipping Playwright browser install. Run `bun run playwright:install` if you need e2e screenshots or browser automation.'
    );
    return false;
  }

  console.log('Ensuring Playwright Chromium browsers are installed');
  return installPlaywrightBrowsers({ optional: true });
}

if (require.main === module) {
  const [command] = process.argv.slice(2);

  try {
    if (!command || command === 'check') {
      const status = printRuntimeStatus();
      process.exitCode = status.hasUsableBrowser ? 0 : 1;
    } else if (command === 'install') {
      installPlaywrightBrowsers();
    } else {
      console.error(`Unknown command: ${command}`);
      console.error('Usage: node scripts/playwright-runtime.js [check|install]');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  findSystemChrome,
  getRuntimeStatus,
  installPlaywrightBrowsers,
  installPlaywrightBrowsersIfRequested,
  printRuntimeStatus,
};
