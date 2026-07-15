import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { BioNextAction, ExecutionRunReceipt, ScriptValidationReceipt } from '@/common/chat/science';

const BIO_RECEIPT_SCHEMA = 'openbioscience.bio.receipt.v1' as const;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

const fileReferenceSchema = z.object({ path: z.string().min(1), contentHash: z.string().regex(HASH_PATTERN) }).strict();

const scriptValidationReceiptSchema = z
  .object({
    schema: z.literal(BIO_RECEIPT_SCHEMA),
    receiptId: z.string().min(1),
    producer: z.literal('bio_reproduction'),
    action: z.literal('preflight_execution_scripts'),
    status: z.literal('ready'),
    projectRoot: z.string().min(1),
    createdAt: z.number().int().positive(),
    scripts: z.array(
      z.object({ path: z.string().min(1), contentHash: z.string().regex(HASH_PATTERN), moduleIds: z.array(z.string()) })
    ),
    violations: z.array(z.string()).length(0),
    nextActions: z.array(z.unknown()).length(0),
  })
  .passthrough();

export const executionRunPayloadSchema = z
  .object({
    scriptValidationReceipt: scriptValidationReceiptSchema,
    startedAt: z.number().int().positive(),
    finishedAt: z.number().int().positive(),
    exitCode: z.number().int(),
    scriptFiles: z.array(fileReferenceSchema).min(1),
    configFiles: z.array(fileReferenceSchema),
    logFiles: z.array(fileReferenceSchema).min(1),
    outputFiles: z.array(fileReferenceSchema),
  })
  .strict();

const sha256 = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)])
  );
};

const fingerprint = (value: unknown): string => sha256(JSON.stringify(stableValue(value)));

const resolveFile = (projectRoot: string, candidate: string): { absolutePath?: string; issue?: string } => {
  if (!candidate.trim() || path.isAbsolute(candidate)) return { issue: 'Path must be non-empty and project-relative.' };
  const root = path.resolve(projectRoot);
  const absolutePath = path.resolve(root, candidate);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return { issue: 'Path escapes the project root.' };
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return { issue: 'File does not exist.' };
  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(absolutePath);
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    return { issue: 'Path resolves through a symlink outside the project root.' };
  }
  return { absolutePath: realFile };
};

const currentFiles = (
  projectRoot: string,
  label: string,
  files: Array<{ path: string; contentHash: string }>,
  issues: string[]
): Array<{ path: string; contentHash: string }> =>
  files.map((file) => {
    const resolved = resolveFile(projectRoot, file.path);
    if (!resolved.absolutePath) {
      issues.push(`${label} ${file.path}: ${resolved.issue}`);
      return file;
    }
    const contentHash = sha256(fs.readFileSync(resolved.absolutePath));
    if (contentHash !== file.contentHash) issues.push(`${label} ${file.path}: content hash is stale.`);
    return { path: file.path, contentHash };
  });

const repairAction = (issues: string[], inputFingerprint: string): BioNextAction => ({
  id: 'repair-execution-run-record',
  tool: 'runtime',
  action: 'record_execution',
  reason: issues.join(' '),
  payload: { requiredMutation: ['timestamps', 'file hashes', 'execution logs'], issues },
  actionFingerprint: fingerprint({ action: 'record_execution', inputFingerprint, issues }),
  preconditionHash: inputFingerprint,
  expectedMutation: ['payload.startedAt', 'payload.finishedAt', 'payload.scriptFiles', 'payload.logFiles'],
  maxAttempts: 1,
  stopWhenUnchanged: true,
});

export const recordExecution = (projectRoot: string, payload: unknown) => {
  const parsed = executionRunPayloadSchema.safeParse(payload);
  const inputFingerprint = fingerprint(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`);
    return { status: 'needs_completion' as const, issues, nextActions: [repairAction(issues, inputFingerprint)] };
  }

  const input = parsed.data;
  const preflight = input.scriptValidationReceipt as unknown as ScriptValidationReceipt;
  const issues: string[] = [];
  if (path.resolve(preflight.projectRoot) !== path.resolve(projectRoot)) {
    issues.push('Script preflight receipt belongs to another project.');
  }
  if (input.startedAt < preflight.createdAt) issues.push('Execution started before script preflight completed.');
  if (input.finishedAt < input.startedAt) issues.push('Execution finished before it started.');
  if (input.finishedAt > Date.now() + 5 * 60 * 1000) issues.push('Execution finish timestamp is in the future.');

  const fileReferences = (files: Array<{ path?: string; contentHash?: string }>) =>
    files.map((file) => ({ path: file.path!, contentHash: file.contentHash! }));
  const scriptFiles = currentFiles(projectRoot, 'Script', fileReferences(input.scriptFiles), issues);
  const configFiles = currentFiles(projectRoot, 'Config', fileReferences(input.configFiles), issues);
  const logFiles = currentFiles(projectRoot, 'Log', fileReferences(input.logFiles), issues);
  const outputFiles = currentFiles(projectRoot, 'Output', fileReferences(input.outputFiles), issues);
  const expectedScripts = new Map(preflight.scripts.map((file) => [file.path, file.contentHash]));
  if (scriptFiles.length !== expectedScripts.size)
    issues.push('Execution script set differs from the preflight script set.');
  for (const file of scriptFiles) {
    if (expectedScripts.get(file.path) !== file.contentHash) {
      issues.push(`Script ${file.path} does not match the preflight hash.`);
    }
  }
  if (input.exitCode !== 0) issues.push(`Execution exited with code ${input.exitCode}.`);

  const details = {
    scriptValidationReceiptId: preflight.receiptId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    scriptFiles,
    configFiles,
    logFiles,
    outputFiles,
    exitCode: input.exitCode,
  };
  const nextActions = issues.length ? [repairAction(issues, fingerprint(details))] : [];
  const receipt: ExecutionRunReceipt = {
    schema: BIO_RECEIPT_SCHEMA,
    receiptId: `bio_receipt_${fingerprint({ producer: 'bio_runtime', action: 'record_execution', projectRoot, details }).slice(0, 20)}`,
    producer: 'bio_runtime',
    action: 'record_execution',
    status: issues.length ? 'needs_completion' : 'ready',
    projectRoot: path.resolve(projectRoot),
    createdAt: Date.now(),
    validationFingerprint: fingerprint(details),
    ...details,
    details,
  };
  return {
    status: issues.length ? ('needs_completion' as const) : ('ready' as const),
    issues,
    nextActions,
    executionRunReceipt: receipt,
  };
};
