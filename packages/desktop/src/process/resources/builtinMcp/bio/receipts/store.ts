import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BioControlReceipt } from '@/common/chat/science';

const RECEIPT_ID_PATTERN = /^bio_receipt_[a-f0-9]{20}$/u;
const STORE_RELATIVE_ROOT = '.openbioscience/control/receipts/v1';
const CACHE_RELATIVE_ROOT = '.openbioscience/control/cache/v1';

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableValue(record[key])])
  );
};

const stableJson = (value: unknown): string => `${JSON.stringify(stableValue(value), null, 2)}\n`;

const receiptIdentityJson = (receipt: BioControlReceipt): string => {
  const { createdAt: _createdAt, ...identity } = receipt;
  return stableJson(identity);
};

export const receiptInputFingerprint = (value: unknown): string =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');

const nearestExistingPath = (candidate: string): string => {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
};

const ensureInsideRoot = (projectRoot: string, candidate: string): string => {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Receipt path escapes the project root.');
  const realRoot = fs.realpathSync(root);
  const realExisting = fs.realpathSync(nearestExistingPath(resolved));
  const realRelative = path.relative(realRoot, realExisting);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error('Receipt path resolves through a symlink outside the project root.');
  }
  return resolved;
};

const atomicWrite = (target: string, content: string): void => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
  fs.renameSync(temporary, target);
};

const receiptPath = (projectRoot: string, receiptId: string): string => {
  if (!RECEIPT_ID_PATTERN.test(receiptId)) throw new Error(`Invalid receiptId: ${receiptId}`);
  return ensureInsideRoot(
    projectRoot,
    path.join(projectRoot, STORE_RELATIVE_ROOT, receiptId.slice(-2), `${receiptId}.json`)
  );
};

const cachePath = (projectRoot: string, producer: string, action: string, inputFingerprint: string): string => {
  const safeSegment = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/gu, '_');
  if (!/^[a-f0-9]{64}$/u.test(inputFingerprint)) throw new Error('Invalid receipt input fingerprint.');
  return ensureInsideRoot(
    projectRoot,
    path.join(projectRoot, CACHE_RELATIVE_ROOT, safeSegment(producer), safeSegment(action), `${inputFingerprint}.json`)
  );
};

const isReceipt = (value: unknown): value is BioControlReceipt => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Partial<BioControlReceipt>;
  return (
    receipt.schema === 'openbioscience.bio.receipt.v1' &&
    typeof receipt.receiptId === 'string' &&
    typeof receipt.producer === 'string' &&
    typeof receipt.action === 'string' &&
    typeof receipt.status === 'string' &&
    typeof receipt.projectRoot === 'string' &&
    typeof receipt.createdAt === 'number'
  );
};

export const writeReceipt = (
  projectRoot: string,
  receipt: BioControlReceipt,
  options: { inputFingerprint?: string } = {}
): void => {
  if (path.resolve(receipt.projectRoot) !== path.resolve(projectRoot)) {
    throw new Error(`Receipt ${receipt.receiptId} belongs to another project.`);
  }
  const target = receiptPath(projectRoot, receipt.receiptId);
  const content = stableJson(receipt);
  if (fs.existsSync(target)) {
    const existing = JSON.parse(fs.readFileSync(target, 'utf8')) as BioControlReceipt;
    if (receiptIdentityJson(existing) !== receiptIdentityJson(receipt)) {
      throw new Error(`Receipt collision: ${receipt.receiptId}`);
    }
  } else {
    atomicWrite(target, content);
  }
  if (options.inputFingerprint) {
    const pointer = cachePath(projectRoot, receipt.producer, receipt.action, options.inputFingerprint);
    const pointerContent = stableJson({ receiptId: receipt.receiptId, inputFingerprint: options.inputFingerprint });
    if (fs.existsSync(pointer)) {
      if (fs.readFileSync(pointer, 'utf8') !== pointerContent) {
        atomicWrite(pointer, pointerContent);
      }
    } else {
      atomicWrite(pointer, pointerContent);
    }
  }
};

export const readReceipt = (projectRoot: string, receiptId: string): BioControlReceipt => {
  const target = receiptPath(projectRoot, receiptId);
  if (!fs.existsSync(target)) throw new Error(`Unknown receiptId: ${receiptId}`);
  const parsed: unknown = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (!isReceipt(parsed)) throw new Error(`Stored receipt is malformed: ${receiptId}`);
  if (path.resolve(parsed.projectRoot) !== path.resolve(projectRoot)) {
    throw new Error(`Receipt ${receiptId} belongs to another project.`);
  }
  return parsed;
};

export const readCachedReceipt = (
  projectRoot: string,
  producer: string,
  action: string,
  inputFingerprint: string
): BioControlReceipt | undefined => {
  const pointer = cachePath(projectRoot, producer, action, inputFingerprint);
  if (!fs.existsSync(pointer)) return undefined;
  const parsed = JSON.parse(fs.readFileSync(pointer, 'utf8')) as { receiptId?: unknown; inputFingerprint?: unknown };
  if (parsed.inputFingerprint !== inputFingerprint || typeof parsed.receiptId !== 'string') return undefined;
  return readReceipt(projectRoot, parsed.receiptId);
};

export const persistReceiptsFromResult = (
  projectRoot: string,
  result: unknown,
  options: { inputFingerprint?: string; action?: string } = {}
): string[] => {
  const receiptIds = new Set<string>();
  const visited = new Set<object>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);
    if (isReceipt(value)) {
      if (!RECEIPT_ID_PATTERN.test(value.receiptId) || path.resolve(value.projectRoot) !== path.resolve(projectRoot)) {
        return;
      }
      writeReceipt(projectRoot, value, {
        inputFingerprint: value.action === options.action ? options.inputFingerprint : undefined,
      });
      receiptIds.add(value.receiptId);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(result);
  return [...receiptIds].sort();
};
