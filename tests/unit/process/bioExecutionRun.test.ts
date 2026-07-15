import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recordExecution } from '@/process/resources/builtinMcp/bio/reproduction/executionRun';

const sha256 = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');

describe('bio runtime execution receipts', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-execution-run-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const write = (candidate: string, content: string) => {
    const target = path.join(root, candidate);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
    return { path: candidate, contentHash: sha256(content) };
  };

  const payload = () => {
    const script = write('execution/scripts/analysis.py', 'print("ok")\n');
    const log = write('execution/logs/analysis.log', 'completed\n');
    const output = write('execution/results/tables/result.tsv', 'id\tvalue\na\t1\n');
    const preflightCreatedAt = Date.now() - 1000;
    return {
      scriptValidationReceipt: {
        schema: 'openbioscience.bio.receipt.v1',
        receiptId: 'preflight-ready',
        producer: 'bio_reproduction',
        action: 'preflight_execution_scripts',
        status: 'ready',
        projectRoot: root,
        createdAt: preflightCreatedAt,
        scripts: [{ ...script, moduleIds: ['data_import'] }],
        violations: [],
        nextActions: [],
      },
      startedAt: preflightCreatedAt + 100,
      finishedAt: preflightCreatedAt + 500,
      exitCode: 0,
      scriptFiles: [script],
      configFiles: [],
      logFiles: [log],
      outputFiles: [output],
    };
  };

  it('records a current run after preflight', () => {
    const result = recordExecution(root, payload());

    expect(result.status).toBe('ready');
    expect(result.executionRunReceipt).toMatchObject({
      action: 'record_execution',
      status: 'ready',
      exitCode: 0,
    });
  });

  it('rejects a run that started before preflight', () => {
    const input = payload();
    input.startedAt = input.scriptValidationReceipt.createdAt - 1;

    const result = recordExecution(root, input);

    expect(result.status).toBe('needs_completion');
    expect(result.issues).toContain('Execution started before script preflight completed.');
  });

  it('rejects a script changed after preflight', () => {
    const input = payload();
    fs.appendFileSync(path.join(root, input.scriptFiles[0].path), 'print("changed")\n');

    const result = recordExecution(root, input);

    expect(result.status).toBe('needs_completion');
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining('content hash is stale')]));
  });
});
