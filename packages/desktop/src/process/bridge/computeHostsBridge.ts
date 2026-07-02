/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildComputePrompt } from '@/common/chat/compute';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type {
  ComputeConfig,
  ComputeSshHostConfig,
  ComputeSshHostContextHost,
  ComputeSshHostContextResult,
  ComputeSshHostInput,
  ComputeSshHostPublic,
  ComputeSshHostSaveResult,
  ComputeSshHostTestRequest,
  ComputeSshHostTestResult,
} from '@/common/types/compute';
import { safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { Client, type ConnectConfig } from 'ssh2';

const DEFAULT_PORT = 22;
const DEFAULT_TIMEOUT_MS = 15000;
const CONFIG_READ_TIMEOUT_MS = 1200;
const SECRET_SAFE_PREFIX = 'safe:v1:';
const SECRET_PLAIN_PREFIX = 'plain:v1:';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

function normalizeHostInput(input: ComputeSshHostInput): Omit<ComputeSshHostInput, 'password' | 'privateKeyPassphrase'> {
  return {
    ...input,
    name: input.name.trim(),
    host: input.host.trim(),
    port: Number.isFinite(input.port) && input.port ? Math.max(1, Math.min(65535, Math.trunc(input.port))) : DEFAULT_PORT,
    username: input.username.trim(),
    privateKeyPath: input.privateKeyPath?.trim(),
    remoteWorkdir: input.remoteWorkdir?.trim(),
    tags: (input.tags || []).map((tag) => tag.trim()).filter(Boolean),
    notes: input.notes?.trim(),
  };
}

function validateHostInput(input: ComputeSshHostInput): void {
  const normalized = normalizeHostInput(input);
  if (!normalized.name) throw new Error('请填写服务器名称');
  if (!normalized.host) throw new Error('请填写 Host/IP');
  if (!normalized.username) throw new Error('请填写用户名');
  if (normalized.authType === 'privateKey' && !normalized.privateKeyPath) {
    throw new Error('请填写 private key 路径');
  }
}

function encryptSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (safeStorage.isEncryptionAvailable()) {
    return `${SECRET_SAFE_PREFIX}${safeStorage.encryptString(trimmed).toString('base64')}`;
  }
  return `${SECRET_PLAIN_PREFIX}${Buffer.from(trimmed, 'utf8').toString('base64')}`;
}

function decryptSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    if (value.startsWith(SECRET_SAFE_PREFIX)) {
      return safeStorage.decryptString(Buffer.from(value.slice(SECRET_SAFE_PREFIX.length), 'base64'));
    }
    if (value.startsWith(SECRET_PLAIN_PREFIX)) {
      return Buffer.from(value.slice(SECRET_PLAIN_PREFIX.length), 'base64').toString('utf8');
    }
    return value;
  } catch {
    return undefined;
  }
}

async function loadConfig(): Promise<ComputeConfig> {
  const value = await withTimeout(
    ConfigStorage.get('tools.compute').catch((): undefined => undefined),
    CONFIG_READ_TIMEOUT_MS,
    undefined
  );
  return {
    sshHosts: Array.isArray(value?.sshHosts) ? value.sshHosts : [],
  };
}

async function saveConfig(config: ComputeConfig): Promise<void> {
  await ConfigStorage.set('tools.compute', {
    ...config,
    sshHosts: config.sshHosts || [],
  });
}

function toPublicHost(host: ComputeSshHostConfig): ComputeSshHostPublic {
  const { passwordSecret, privateKeyPassphraseSecret, ...publicHost } = host;
  return {
    ...publicHost,
    hasPassword: Boolean(passwordSecret),
    hasPrivateKeyPassphrase: Boolean(privateKeyPassphraseSecret),
  };
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function expandLocalPath(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return `${homedir()}${value.slice(1)}`;
  return value;
}

function parseTestOutput(output: string): Pick<ComputeSshHostTestResult, 'username' | 'cwd' | 'system' | 'gpuSummary'> {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const markerIndex = lines.findIndex((line) => line === '__OPENSCIENCE_SSH_TEST__');
  const payload = markerIndex >= 0 ? lines.slice(markerIndex + 1) : lines;
  const [username, cwd, system, ...gpuSummary] = payload;
  return {
    username,
    cwd,
    system,
    gpuSummary: gpuSummary.length ? gpuSummary.slice(0, 6) : undefined,
  };
}

async function buildConnectConfig(host: ComputeSshHostConfig, timeoutMs?: number): Promise<ConnectConfig> {
  const config: ConnectConfig = {
    host: host.host,
    port: host.port || DEFAULT_PORT,
    username: host.username,
    readyTimeout: timeoutMs || DEFAULT_TIMEOUT_MS,
    keepaliveInterval: 10000,
  };

  if (host.authType === 'password') {
    const password = decryptSecret(host.passwordSecret);
    if (!password) throw new Error('该服务器没有保存密码');
    return { ...config, password };
  }

  if (host.authType === 'privateKey') {
    if (!host.privateKeyPath) throw new Error('该服务器没有配置 private key 路径');
    const privateKey = await readFile(expandLocalPath(host.privateKeyPath), 'utf8');
    const passphrase = decryptSecret(host.privateKeyPassphraseSecret);
    return {
      ...config,
      privateKey,
      ...(passphrase ? { passphrase } : {}),
    };
  }

  return {
    ...config,
    agent: process.env.SSH_AUTH_SOCK,
  };
}

async function runSshTest(host: ComputeSshHostConfig, timeoutMs?: number): Promise<ComputeSshHostTestResult> {
  const startedAt = Date.now();
  try {
    const connectConfig = await buildConnectConfig(host, timeoutMs);
    const result = await new Promise<ComputeSshHostTestResult>((resolve) => {
      const client = new Client();
      let settled = false;
      const finish = (testResult: ComputeSshHostTestResult) => {
        if (settled) return;
        settled = true;
        client.end();
        resolve(testResult);
      };

      const remoteWorkdir = host.remoteWorkdir?.trim();
      const workdirPrefix = remoteWorkdir
        ? `mkdir -p ${quoteShell(remoteWorkdir)} && cd ${quoteShell(remoteWorkdir)} && `
        : '';
      const command = `${workdirPrefix}printf "__OPENSCIENCE_SSH_TEST__\\n"; whoami; pwd; uname -srm; if command -v nvidia-smi >/dev/null 2>&1; then nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -n 6; fi`;

      client
        .on('ready', () => {
          client.exec(command, (execError, stream) => {
            if (execError) {
              finish({
                ok: false,
                status: 'failed',
                message: execError.message,
                testedAt: Date.now(),
                latencyMs: Date.now() - startedAt,
              });
              return;
            }
            let stdout = '';
            let stderr = '';
            stream
              .on('close', (code: number | null) => {
                const parsed = parseTestOutput(stdout);
                const ok = code === 0;
                finish({
                  ok,
                  status: ok ? 'connected' : 'failed',
                  message: ok ? 'SSH connection verified' : stderr.trim() || `Remote command exited with ${code}`,
                  testedAt: Date.now(),
                  latencyMs: Date.now() - startedAt,
                  ...parsed,
                });
              })
              .on('data', (chunk: Buffer) => {
                stdout += chunk.toString('utf8');
              })
              .stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString('utf8');
              });
          });
        })
        .on('error', (error) => {
          finish({
            ok: false,
            status: 'failed',
            message: error.message,
            testedAt: Date.now(),
            latencyMs: Date.now() - startedAt,
          });
        })
        .connect(connectConfig);
    });
    return result;
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      message: error instanceof Error ? error.message : 'SSH connection failed',
      testedAt: Date.now(),
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function listHosts(): Promise<ComputeSshHostPublic[]> {
  try {
    const config = await loadConfig();
    return (config.sshHosts || [])
      .filter((host): host is ComputeSshHostConfig => Boolean(host && typeof host === 'object'))
      .map(toPublicHost);
  } catch (error) {
    console.warn('[computeHosts] Failed to list SSH hosts:', error);
    return [];
  }
}

async function saveHost({
  input,
  testOnSave = true,
}: {
  input: ComputeSshHostInput;
  testOnSave?: boolean;
}): Promise<ComputeSshHostSaveResult> {
  validateHostInput(input);
  const normalized = normalizeHostInput(input);
  const config = await loadConfig();
  const now = Date.now();
  const hosts = [...(config.sshHosts || [])];
  const existingIndex = normalized.id ? hosts.findIndex((host) => host.id === normalized.id) : -1;
  const existing = existingIndex >= 0 ? hosts[existingIndex] : undefined;
  const id = existing?.id || normalized.id || randomUUID();

  const passwordSecret =
    normalized.authType === 'password'
      ? input.clearPassword
        ? undefined
        : encryptSecret(input.password) || existing?.passwordSecret
      : undefined;
  const privateKeyPassphraseSecret =
    normalized.authType === 'privateKey'
      ? input.clearPrivateKeyPassphrase
        ? undefined
        : encryptSecret(input.privateKeyPassphrase) || existing?.privateKeyPassphraseSecret
      : undefined;

  const nextHost: ComputeSshHostConfig = {
    id,
    name: normalized.name,
    host: normalized.host,
    port: normalized.port || DEFAULT_PORT,
    username: normalized.username,
    authType: normalized.authType,
    passwordSecret,
    privateKeyPath: normalized.authType === 'privateKey' ? normalized.privateKeyPath : undefined,
    privateKeyPassphraseSecret,
    remoteWorkdir: normalized.remoteWorkdir,
    tags: normalized.tags,
    notes: normalized.notes,
    exposeCredentialsToAgent: normalized.exposeCredentialsToAgent === true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastTest: existing?.lastTest,
  };

  if (existingIndex >= 0) hosts[existingIndex] = nextHost;
  else hosts.push(nextHost);
  await saveConfig({ ...config, sshHosts: hosts });

  const test = testOnSave
    ? await runSshTest(nextHost)
    : {
        ok: false,
        status: 'untested' as const,
        message: 'Not tested',
        testedAt: Date.now(),
      };
  const testedHost = { ...nextHost, lastTest: test, updatedAt: Date.now() };
  const currentConfig = await loadConfig();
  await saveConfig({
    ...currentConfig,
    sshHosts: (currentConfig.sshHosts || []).map((host) => (host.id === id ? testedHost : host)),
  });
  return {
    host: toPublicHost(testedHost),
    test,
  };
}

async function deleteHost({ id }: { id: string }): Promise<{ ok: boolean }> {
  const config = await loadConfig();
  await saveConfig({
    ...config,
    sshHosts: (config.sshHosts || []).filter((host) => host.id !== id),
  });
  return { ok: true };
}

async function testHost(request: ComputeSshHostTestRequest): Promise<ComputeSshHostTestResult> {
  let target: ComputeSshHostConfig | undefined;
  const config = await loadConfig();
  if (request.id) {
    target = (config.sshHosts || []).find((host) => host.id === request.id);
    if (!target) {
      return {
        ok: false,
        status: 'failed',
        message: '服务器不存在',
        testedAt: Date.now(),
      };
    }
  } else if (request.draft) {
    validateHostInput(request.draft);
    const normalized = normalizeHostInput(request.draft);
    target = {
      id: normalized.id || 'draft',
      name: normalized.name,
      host: normalized.host,
      port: normalized.port || DEFAULT_PORT,
      username: normalized.username,
      authType: normalized.authType,
      passwordSecret: encryptSecret(request.draft.password),
      privateKeyPath: normalized.privateKeyPath,
      privateKeyPassphraseSecret: encryptSecret(request.draft.privateKeyPassphrase),
      remoteWorkdir: normalized.remoteWorkdir,
      tags: normalized.tags,
      notes: normalized.notes,
      exposeCredentialsToAgent: normalized.exposeCredentialsToAgent === true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  if (!target) {
    return {
      ok: false,
      status: 'failed',
      message: '缺少服务器配置',
      testedAt: Date.now(),
    };
  }

  const test = await runSshTest(target, request.timeoutMs);
  if (request.id) {
    const latest = await loadConfig();
    await saveConfig({
      ...latest,
      sshHosts: (latest.sshHosts || []).map((host) =>
        host.id === request.id ? { ...host, lastTest: test, updatedAt: Date.now() } : host
      ),
    });
  }
  return test;
}

function toContextHost(host: ComputeSshHostConfig): ComputeSshHostContextHost {
  const expose = host.exposeCredentialsToAgent === true;
  const password = expose && host.authType === 'password' ? decryptSecret(host.passwordSecret) : undefined;
  const privateKeyPassphrase =
    expose && host.authType === 'privateKey' ? decryptSecret(host.privateKeyPassphraseSecret) : undefined;
  const credentialHint =
    host.authType === 'password'
      ? password
        ? 'password included for this conversation'
        : host.passwordSecret
          ? 'password configured in OpenScience settings; redacted from context'
          : 'password is not configured'
      : host.authType === 'privateKey'
        ? `private key path${host.privateKeyPath ? `: ${host.privateKeyPath}` : ' is not configured'}`
        : 'use SSH agent from the local environment';

  return {
    id: host.id,
    name: host.name,
    host: host.host,
    port: host.port || DEFAULT_PORT,
    username: host.username,
    authType: host.authType,
    remoteWorkdir: host.remoteWorkdir,
    tags: host.tags,
    notes: host.notes,
    lastTest: host.lastTest,
    credentialHint,
    password,
    privateKeyPath: host.authType === 'privateKey' ? host.privateKeyPath : undefined,
    privateKeyPassphrase,
  };
}

async function buildContext({ hostIds }: { hostIds: string[] }): Promise<ComputeSshHostContextResult> {
  const ids = new Set(hostIds || []);
  const config = await loadConfig();
  const hosts = (config.sshHosts || []).filter((host) => ids.has(host.id)).map(toContextHost);
  return {
    hosts,
    prompt: buildComputePrompt(hosts),
  };
}

export function initComputeHostsBridge(): void {
  ipcBridge.computeHosts.list.provider(listHosts);
  ipcBridge.computeHosts.save.provider(saveHost);
  ipcBridge.computeHosts.delete.provider(deleteHost);
  ipcBridge.computeHosts.test.provider(testHost);
  ipcBridge.computeHosts.buildContext.provider(buildContext);
}
