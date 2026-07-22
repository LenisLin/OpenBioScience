/**
 * @license
 * Copyright 2026 OpenScience contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildCodexOpenScienceMcpBlock,
  syncCodexOpenScienceMcpConfig,
} from '@/process/utils/syncCodexOpenScienceMcpConfig';

let tempDir = '';

describe('syncCodexOpenScienceMcpConfig', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openscience-codex-mcp-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('adds a managed block without rewriting unrelated config', async () => {
    const configPath = path.join(tempDir, 'config.toml');
    const original = [
      'model = "gpt-5.5"',
      '',
      '[mcp_servers.node_repl]',
      'command = "/bin/node_repl"',
      'args = []',
      '',
      '[projects."/tmp/work"]',
      'trust_level = "trusted"',
      '',
    ].join('\n');
    await fs.writeFile(configPath, original, 'utf8');

    const changed = await syncCodexOpenScienceMcpConfig(
      [
        {
          name: 'openscience-science-artifact',
          command: 'node',
          args: ['/Applications/OpenScience.app/builtin-mcp-science-artifact.js'],
          env: { OPENSCIENCE_STRICT_PROVENANCE: 'false' },
        },
      ],
      { configPath }
    );

    const result = await fs.readFile(configPath, 'utf8');
    expect(changed).toBe(true);
    expect(result).toContain(original.trimEnd());
    expect(result).toContain('# >>> OpenScience managed MCP servers');
    expect(result).toContain('[mcp_servers.openscience-science-artifact]');
    expect(result).toContain('OPENSCIENCE_STRICT_PROVENANCE = "false"');
  });

  it('does not include servers that the user already configured explicitly', () => {
    const block = buildCodexOpenScienceMcpBlock(
      [
        { name: 'openscience-science-artifact', command: 'node', args: ['/managed.js'] },
        { name: 'openscience-research-evidence', command: 'node', args: ['/research.js'] },
      ],
      ['[mcp_servers.openscience-science-artifact]', 'command = "/custom/node"', 'args = ["/custom.js"]'].join('\n')
    );

    expect(block).not.toContain('[mcp_servers.openscience-science-artifact]');
    expect(block).toContain('[mcp_servers.openscience-research-evidence]');
  });

  it('writes OpenBioScience bio MCP profile entries without secrets', () => {
    const block = buildCodexOpenScienceMcpBlock([
      {
        name: 'openscience-bio-runtime',
        command: 'node',
        args: ['/managed/builtin-mcp-bio.js'],
        env: {
          OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime',
          OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
        },
      },
      {
        name: 'openscience-bio-source',
        command: 'node',
        args: ['/managed/builtin-mcp-bio.js'],
        env: {
          OPENBIOSCIENCE_BIO_MCP_PROFILE: 'source',
          OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
        },
      },
      {
        name: 'openscience-bio-reproduction',
        command: 'node',
        args: ['/managed/builtin-mcp-bio.js'],
        env: {
          OPENBIOSCIENCE_BIO_MCP_PROFILE: 'reproduction',
          OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
        },
      },
      {
        name: 'openscience-bio-benchmark',
        command: 'node',
        args: ['/managed/builtin-mcp-bio.js'],
        env: {
          OPENBIOSCIENCE_BIO_MCP_PROFILE: 'benchmark',
          OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
        },
      },
      {
        name: 'openscience-bio-statistics',
        command: 'node',
        args: ['/managed/builtin-mcp-bio.js'],
        env: {
          OPENBIOSCIENCE_BIO_MCP_PROFILE: 'statistics',
          OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
        },
      },
      {
        name: 'openscience-bio-environment-manager',
        command: 'node',
        args: ['/managed/builtin-mcp-bio.js'],
        env: {
          OPENBIOSCIENCE_BIO_MCP_PROFILE: 'environment_manager',
          OPENBIOSCIENCE_RUNTIME_ROOT: '/mnt/NAS_21T/ProjectData/OpenBioScience',
        },
      },
    ]);

    expect(block).toContain('[mcp_servers.openscience-bio-runtime]');
    expect(block).toContain('[mcp_servers.openscience-bio-source]');
    expect(block).toContain('[mcp_servers.openscience-bio-reproduction]');
    expect(block).toContain('[mcp_servers.openscience-bio-benchmark]');
    expect(block).toContain('[mcp_servers.openscience-bio-statistics]');
    expect(block).toContain('[mcp_servers.openscience-bio-environment-manager]');
    expect(block).toContain('OPENBIOSCIENCE_BIO_MCP_PROFILE = "runtime"');
    expect(block).toContain('OPENBIOSCIENCE_BIO_MCP_PROFILE = "source"');
    expect(block).toContain('OPENBIOSCIENCE_BIO_MCP_PROFILE = "reproduction"');
    expect(block).toContain('OPENBIOSCIENCE_BIO_MCP_PROFILE = "benchmark"');
    expect(block).toContain('OPENBIOSCIENCE_BIO_MCP_PROFILE = "statistics"');
    expect(block).toContain('OPENBIOSCIENCE_BIO_MCP_PROFILE = "environment_manager"');
    expect(block).toContain('OPENBIOSCIENCE_RUNTIME_ROOT = "/mnt/NAS_21T/ProjectData/OpenBioScience"');
    expect(block).not.toContain('API_KEY');
    expect(block).not.toContain('TOKEN');
  });

  it('never writes per-session gateway credentials into the Codex config', () => {
    const block = buildCodexOpenScienceMcpBlock([
      {
        name: 'openscience-science-artifact',
        command: 'node',
        args: ['/managed/builtin-mcp-science-artifact.js'],
        env: {
          OPENSCIENCE_STRICT_PROVENANCE: 'true',
          DEEPORGANISER_USER_INPUT_URL: 'http://127.0.0.1:12345/user-input/request',
          DEEPORGANISER_USER_INPUT_TOKEN: 'session-secret',
        },
      },
    ]);

    expect(block).toContain('OPENSCIENCE_STRICT_PROVENANCE');
    expect(block).not.toContain('DEEPORGANISER_USER_INPUT_URL');
    expect(block).not.toContain('DEEPORGANISER_USER_INPUT_TOKEN');
    expect(block).not.toContain('session-secret');
  });

  it('replaces an old managed block and keeps secrets out of the written text', async () => {
    const configPath = path.join(tempDir, 'config.toml');
    await fs.writeFile(
      configPath,
      [
        'model = "gpt-5.5"',
        '',
        '# >>> OpenScience managed MCP servers',
        '[mcp_servers.openscience-research-evidence]',
        'command = "node"',
        'args = ["/old.js"]',
        '# <<< OpenScience managed MCP servers',
        '',
      ].join('\n'),
      'utf8'
    );

    await syncCodexOpenScienceMcpConfig(
      [
        {
          name: 'openscience-research-evidence',
          command: 'node',
          args: ['/new.js'],
          env: {
            PAPERCLIP_ENABLED: 'false',
            OPENSCIENCE_RESEARCH_EVIDENCE_PROVIDERS: '',
          },
        },
      ],
      { configPath }
    );

    const result = await fs.readFile(configPath, 'utf8');
    expect(result).not.toContain('/old.js');
    expect(result).toContain('/new.js');
    expect(result).not.toContain('PAPERCLIP_API_KEY');
  });
});
