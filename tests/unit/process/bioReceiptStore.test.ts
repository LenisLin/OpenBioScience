import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BioControlReceipt } from '@/common/chat/science';
import {
  readCachedReceipt,
  readReceipt,
  receiptInputFingerprint,
  writeReceipt,
} from '@/process/resources/builtinMcp/bio/receipts';

describe('bio receipt store', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-receipts-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const receipt = (overrides: Partial<BioControlReceipt> = {}): BioControlReceipt => ({
    schema: 'openbioscience.bio.receipt.v1',
    receiptId: 'bio_receipt_0123456789abcdefabcd',
    producer: 'bio_source',
    action: 'inspect_method_sources',
    status: 'ready',
    projectRoot: root,
    createdAt: Date.now(),
    details: { candidates: [] },
    ...overrides,
  });

  it('resolves an immutable receipt by id and input fingerprint', () => {
    const inputFingerprint = receiptInputFingerprint({ action: 'inspect_method_sources', paths: ['paper.txt'] });
    writeReceipt(root, receipt(), { inputFingerprint });

    expect(readReceipt(root, receipt().receiptId)).toMatchObject({ action: 'inspect_method_sources', status: 'ready' });
    expect(readCachedReceipt(root, 'bio_source', 'inspect_method_sources', inputFingerprint)?.receiptId).toBe(
      receipt().receiptId
    );
  });

  it('rejects a receipt from another project', () => {
    expect(() => writeReceipt(root, receipt({ projectRoot: path.join(root, 'other') }))).toThrow(
      'belongs to another project'
    );
  });

  it('rejects an immutable id collision', () => {
    writeReceipt(root, receipt());

    expect(() => writeReceipt(root, receipt({ status: 'partial' }))).toThrow('Receipt collision');
  });

  it.runIf(process.platform !== 'win32')('rejects a control directory symlink that escapes the project', () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-external-'));
    fs.mkdirSync(path.join(root, '.openbioscience'), { recursive: true });
    fs.symlinkSync(external, path.join(root, '.openbioscience', 'control'));

    try {
      expect(() => writeReceipt(root, receipt())).toThrow('symlink outside the project root');
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });
});
