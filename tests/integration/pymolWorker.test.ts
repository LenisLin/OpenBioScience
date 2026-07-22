import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { afterEach, describe, expect, it } from 'vitest';

const configuredPython = process.env.OPENBIOSCIENCE_PYMOL_PYTHON;
const defaultWindowsPython = path.join(
  process.env.LOCALAPPDATA || '',
  'Schrodinger',
  'PyMOL2',
  'python.exe'
);
const python = configuredPython || (fs.existsSync(defaultWindowsPython) ? defaultWindowsPython : undefined);
const workerPath = path.resolve('packages/desktop/src/process/resources/builtinMcp/bio/pymolWorker.py');
const fixturePath = path.resolve('tests/fixtures/pymol-confidence.pdb');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(!python)('PyMOL JSONL worker', () => {
  it('preserves chain IDs, residue IDs, insertion codes, renders, audits run(), and closes', async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openscience-pymol-test-'));
    temporaryDirectories.push(workDir);
    const child = spawn(python!, ['-u', workerPath], {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        OPENSCIENCE_CONVERSATION_ID: 'integration-test',
        OPENBIOSCIENCE_PYMOL_SESSION_ID: 'integration-test',
        OPENBIOSCIENCE_PYMOL_WORK_DIR: workDir,
      },
    });
    const lines = readline.createInterface({ input: child.stdout });
    const replies: Array<Record<string, unknown>> = [];
    lines.on('line', (line) => {
      try {
        replies.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // PyMOL may emit interpreter shutdown noise on stdout; protocol replies are JSON lines.
      }
    });

    const call = async (id: string, action: string, payload: Record<string, unknown>) => {
      child.stdin.write(`${JSON.stringify({ id, action, payload })}\n`);
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const reply = replies.find((item) => item.id === id);
        if (reply) return reply;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Timed out waiting for PyMOL ${action}`);
    };

    expect((await call('load', 'load', { paths: [fixturePath] })).ok).toBe(true);
    const metricsReply = await call('metrics', 'metrics', { selection: 'pymol-confidence', threshold: 70 });
    const result = metricsReply.result as {
      residues: Array<{ chain: string; residueId: string; insertionCode: string }>;
    };
    expect(result.residues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chain: 'A', residueId: '10A', insertionCode: 'A' }),
        expect.objectContaining({ chain: 'B', residueId: '5', insertionCode: '' }),
      ])
    );

    const tableReply = await call('table', 'apply_residue_table', {
      selectionName: 'score_table',
      rows: [
        { chain: 'A', residueId: '10A', score: 0.1, label: 'A10A-low' },
        { chain: 'B', residueId: '5', score: 0.9, label: 'B5-high' },
      ],
    });
    const tableResult = tableReply.result as { appliedRows: number; selectionName: string };
    expect(tableResult).toMatchObject({ appliedRows: 2, selectionName: 'score_table' });

    const runReply = await call('run', 'run', { code: "print(cmd.count_atoms('all'))" });
    expect(runReply.ok).toBe(true);
    expect((runReply.state as { serverOnly: boolean }).serverOnly).toBe(true);
    expect(fs.existsSync(path.join(workDir, 'pymol-run-audit.jsonl'))).toBe(true);

    const renderReply = await call('render', 'render', { width: 128, height: 128, ray: false });
    const renderResult = renderReply.result as { path: string };
    expect(fs.statSync(renderResult.path).size).toBeGreaterThan(0);

    expect((await call('close', 'session', { operation: 'close' })).ok).toBe(true);
    await new Promise<void>((resolve, reject) => {
      child.once('exit', () => resolve());
      child.once('error', reject);
    });
  }, 180_000);
});
