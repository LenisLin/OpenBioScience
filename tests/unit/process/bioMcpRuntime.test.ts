import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ENV_KEYS = [
  'OPENBIOSCIENCE_SKIP_MCP_MAIN',
  'OPENBIOSCIENCE_RUNTIME_ROOT',
  'OPENBIOSCIENCE_WORKSPACE_ROOT',
  'OPENBIOSCIENCE_REPO_ROOT',
] as const;

const previousEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
let root = '';

const runRuntimeAction = async (action: string, payload: Record<string, unknown>) => {
  process.env.OPENBIOSCIENCE_SKIP_MCP_MAIN = '1';
  const module = await import('@/process/resources/builtinMcp/bioServer');
  return (await module.handleRuntimeAction(action, payload)) as Record<string, unknown>;
};

describe('OpenBioScience bio runtime MCP actions', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-runtime-mcp-'));
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.OPENBIOSCIENCE_SKIP_MCP_MAIN = '1';
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = root;
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT = root;
    process.env.OPENBIOSCIENCE_REPO_ROOT = process.cwd();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const previous = previousEnv[key];
      if (previous == null) delete process.env[key];
      else process.env[key] = previous;
    }
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('blocks unknown workflow ids before planning a runner command', async () => {
    const result = await runRuntimeAction('run_workflow', {
      workflowId: 'not_a_workflow',
      outputDir: path.join(root, 'results', 'unknown'),
      dryRun: true,
    });

    expect(result.status).toBe('blocked');
    expect(result.knownWorkflows).toEqual(expect.arrayContaining(['run_scanpy_core']));
  });

  it('rejects output paths outside approved OpenBioScience roots', async () => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-outside-output-'));
    try {
      const result = await runRuntimeAction('run_workflow', {
        workflowId: 'run_scanpy_core',
        outputDir: path.join(outsideRoot, 'result'),
        dryRun: true,
        config: {
          counts_path: 'packages/desktop/src/process/resources/builtinMcp/bio/runners/fixtures/counts.csv',
          metadata_path: 'packages/desktop/src/process/resources/builtinMcp/bio/runners/fixtures/metadata.csv',
        },
      });

      expect(result.status).toBe('blocked');
      expect(JSON.stringify(result.warnings)).toContain('outputDir must be an absolute path');
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('plans allowlisted workflow commands in dry-run mode without requiring installed envs', async () => {
    const result = await runRuntimeAction('run_workflow', {
      workflowId: 'run_scanpy_core',
      outputDir: path.join(root, 'results', 'scanpy'),
      dryRun: true,
      config: {
        counts_path: 'packages/desktop/src/process/resources/builtinMcp/bio/runners/fixtures/counts.csv',
        metadata_path: 'packages/desktop/src/process/resources/builtinMcp/bio/runners/fixtures/metadata.csv',
      },
    });

    expect(result.status).toBe('conditional');
    expect(result.command).toBe('mamba');
    expect(result.args).toEqual(expect.arrayContaining(['python']));
  });

  it('returns the official probe command in probe dry-run mode', async () => {
    const result = await runRuntimeAction('probe_environment', {
      environmentRef: 'sc-py-singlecell',
      dryRun: true,
    });

    expect(result.status).toBe('supported');
    expect(JSON.stringify(result.probe)).toContain('probe-official-envs.sh');
  });
});
