import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isApprovedAbsolutePath, safeAbsolutePathStatus } from '@/process/resources/builtinMcp/bio/pathSafety';

const ENV_KEYS = [
  'OPENBIOSCIENCE_WORKSPACE_ROOT',
  'OPENBIOSCIENCE_RUNTIME_ROOT',
  'OPENSCIENCE_RUNTIME_ROOT',
  'DEEPORGANISER_WORK_DIR',
] as const;

const previousEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
let root = '';

describe('OpenBioScience bio MCP server path checks', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-bio-mcp-'));
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const previous = previousEnv[key];
      if (previous == null) delete process.env[key];
      else process.env[key] = previous;
    }
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports available only for paths under an approved analysis root', () => {
    const allowedFile = path.join(root, 'outputs', 'summary.tsv');
    fs.mkdirSync(path.dirname(allowedFile), { recursive: true });
    fs.writeFileSync(allowedFile, 'ok\n', 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    expect(isApprovedAbsolutePath(allowedFile)).toBe(true);
    expect(safeAbsolutePathStatus(allowedFile)).toBe('available');
  });

  it('does not reveal existence for absolute paths outside approved roots', () => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-outside-'));
    const outsideFile = path.join(outsideRoot, 'secret.txt');
    fs.writeFileSync(outsideFile, 'secret\n', 'utf8');
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;

    try {
      expect(isApprovedAbsolutePath(outsideFile)).toBe(false);
      expect(safeAbsolutePathStatus(outsideFile)).toBe('unverified');
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});
