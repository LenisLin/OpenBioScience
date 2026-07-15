/**
 * @license
 * Copyright 2026 OpenScience contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface ManagedCodexMcpServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SyncCodexOpenScienceMcpConfigOptions {
  configPath?: string;
  codexHome?: string;
  createIfMissing?: boolean;
}

const MANAGED_BLOCK_START = '# >>> OpenScience managed MCP servers';
const MANAGED_BLOCK_END = '# <<< OpenScience managed MCP servers';
const SENSITIVE_ENV_KEY_PATTERN =
  /(?:api[_-]?key|authorization|auth[_-]?token|access[_-]?token|refresh[_-]?token|secret|password|credential|cookie|session|user_input_(?:token|url))/iu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlArray(values: string[]): string {
  return `[${values.map(tomlString).join(', ')}]`;
}

function stripManagedBlock(input: string): string {
  const pattern = new RegExp(
    `(?:\\n?${escapeRegExp(MANAGED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MANAGED_BLOCK_END)}\\n?)`,
    'g'
  );
  return input.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n');
}

function hasMcpServerSection(input: string, serverName: string): boolean {
  const escaped = escapeRegExp(serverName);
  return new RegExp(`^\\[mcp_servers\\.(?:"${escaped}"|${escaped})\\]\\s*$`, 'm').test(input);
}

export function resolveCodexConfigPath(options: SyncCodexOpenScienceMcpConfigOptions = {}): string {
  if (options.configPath) return options.configPath;
  const codexHome = options.codexHome?.trim() || process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
  return path.join(codexHome, 'config.toml');
}

export function buildCodexOpenScienceMcpBlock(servers: ManagedCodexMcpServer[], existingConfigText = ''): string {
  const existingWithoutManagedBlock = stripManagedBlock(existingConfigText);
  const missingServers = servers.filter((server) => !hasMcpServerSection(existingWithoutManagedBlock, server.name));

  if (missingServers.length === 0) {
    return '';
  }

  const lines = [
    MANAGED_BLOCK_START,
    '# Safe OpenScience entries are written without API keys or per-session tokens.',
    '# They let Codex remember always-allow decisions for session-injected OpenScience MCP tools.',
  ];

  for (const server of missingServers) {
    lines.push('', `[mcp_servers.${server.name}]`, `command = ${tomlString(server.command)}`);
    lines.push(`args = ${tomlArray(server.args || [])}`);

    const envEntries = Object.entries(server.env || {}).filter(
      ([key, value]) => typeof value === 'string' && value.length > 0 && !SENSITIVE_ENV_KEY_PATTERN.test(key)
    );
    if (envEntries.length > 0) {
      lines.push('', `[mcp_servers.${server.name}.env]`);
      for (const [key, value] of envEntries.toSorted(([left], [right]) => left.localeCompare(right))) {
        lines.push(`${key} = ${tomlString(value)}`);
      }
    }
  }

  lines.push(MANAGED_BLOCK_END);
  return lines.join('\n');
}

export async function syncCodexOpenScienceMcpConfig(
  servers: ManagedCodexMcpServer[],
  options: SyncCodexOpenScienceMcpConfigOptions = {}
): Promise<boolean> {
  if (process.env.OPENSCIENCE_DISABLE_CODEX_MCP_CONFIG_SYNC === '1') {
    return false;
  }

  const configPath = resolveCodexConfigPath(options);
  let existing = '';
  try {
    existing = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
    if (options.createIfMissing === false) {
      return false;
    }
  }

  const stripped = stripManagedBlock(existing).trimEnd();
  const block = buildCodexOpenScienceMcpBlock(servers, existing);
  const next = [stripped, block].filter(Boolean).join('\n\n') + '\n';

  if (next === existing) {
    return false;
  }

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const tempPath = path.join(path.dirname(configPath), `.config.toml.openscience-${process.pid}.tmp`);
  await fs.writeFile(tempPath, next, 'utf8');
  await fs.rename(tempPath, configPath);
  return true;
}
