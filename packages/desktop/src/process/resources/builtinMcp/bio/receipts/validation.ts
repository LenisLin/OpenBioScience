import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RECEIPT_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type ReceiptIdentity = {
  receiptId: string;
  producer: string;
  action: string;
  status: string;
  projectRoot: string;
  createdAt: number;
};

export type CanonicalFileReference = {
  path: string;
  contentHash: string;
};

export type StrictReceiptExpectation = {
  label: string;
  projectRoot: string;
  producer?: string;
  action?: string;
  status?: string;
  now?: number;
  maxAgeMs?: number;
  futureSkewMs?: number;
};

export type FileReferenceValidation = {
  file?: CanonicalFileReference;
  absolutePath?: string;
  issues: string[];
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

const hashFile = (candidate: string): string =>
  crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');

const nearestExistingPath = (candidate: string): string => {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
};

const resolveInsideProject = (projectRoot: string, candidate: string): { absolutePath?: string; issue?: string } => {
  if (!candidate.trim()) return { issue: 'path is required.' };
  if (path.isAbsolute(candidate)) return { issue: 'path must be project-relative.' };

  const root = path.resolve(projectRoot);
  const absolutePath = path.resolve(root, candidate);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { issue: 'path escapes the project root.' };

  try {
    const realRoot = fs.realpathSync(root);
    const realExisting = fs.realpathSync(nearestExistingPath(absolutePath));
    const realRelative = path.relative(realRoot, realExisting);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      return { issue: 'path resolves through a symlink outside the project root.' };
    }
  } catch {
    return { issue: 'path safety could not be verified.' };
  }

  return { absolutePath };
};

export const validateReceiptProject = (receipt: ReceiptIdentity, projectRoot: string, label: string): string[] => {
  if (!receipt.projectRoot.trim()) return [`${label}.projectRoot is required.`];
  return path.resolve(receipt.projectRoot) === path.resolve(projectRoot)
    ? []
    : [`${label} belongs to another project.`];
};

export const validateReceiptTimestamp = (
  receipt: ReceiptIdentity,
  label: string,
  options: { now?: number; maxAgeMs?: number; futureSkewMs?: number } = {}
): string[] => {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_RECEIPT_MAX_AGE_MS;
  const futureSkewMs = options.futureSkewMs ?? DEFAULT_RECEIPT_FUTURE_SKEW_MS;
  if (!Number.isSafeInteger(receipt.createdAt) || receipt.createdAt <= 0) {
    return [`${label}.createdAt must be a positive integer timestamp.`];
  }
  const issues: string[] = [];
  if (receipt.createdAt > now + futureSkewMs) issues.push(`${label} has a future timestamp.`);
  if (receipt.createdAt < now - maxAgeMs) issues.push(`${label} is stale.`);
  return issues;
};

export const validateStrictReceipt = (receipt: ReceiptIdentity, expectation: StrictReceiptExpectation): string[] => {
  const issues = [
    ...validateReceiptProject(receipt, expectation.projectRoot, expectation.label),
    ...validateReceiptTimestamp(receipt, expectation.label, expectation),
  ];
  if (!receipt.receiptId.trim()) issues.push(`${expectation.label}.receiptId is required.`);
  if (expectation.producer && receipt.producer !== expectation.producer) {
    issues.push(`${expectation.label}.producer must be ${expectation.producer}.`);
  }
  if (expectation.action && receipt.action !== expectation.action) {
    issues.push(`${expectation.label}.action must be ${expectation.action}.`);
  }
  if (expectation.status && receipt.status !== expectation.status) {
    issues.push(`${expectation.label}.status must be ${expectation.status}.`);
  }
  return issues;
};

export const validateReceiptFileReference = (
  projectRoot: string,
  file: CanonicalFileReference,
  label: string
): FileReferenceValidation => {
  const issues: string[] = [];
  if (!SHA256_PATTERN.test(file.contentHash)) issues.push(`${label}.contentHash must be a lowercase SHA-256 hash.`);
  const resolved = resolveInsideProject(projectRoot, file.path);
  if (!resolved.absolutePath) return { issues: [...issues, `${label}: ${resolved.issue}`] };
  if (!fs.existsSync(resolved.absolutePath) || !fs.statSync(resolved.absolutePath).isFile()) {
    return { issues: [...issues, `${label}: file does not exist.`] };
  }
  const currentHash = hashFile(resolved.absolutePath);
  if (currentHash !== file.contentHash) issues.push(`${label}: content hash is stale.`);
  return {
    ...(issues.length ? {} : { file: { path: file.path, contentHash: currentHash } }),
    absolutePath: resolved.absolutePath,
    issues,
  };
};

export const validateReceiptChain = (
  upstream: ReceiptIdentity,
  downstream: ReceiptIdentity,
  label: string
): string[] => {
  if (downstream.createdAt < upstream.createdAt) {
    return [`${label} is stale because it predates receipt ${upstream.receiptId}.`];
  }
  return [];
};
