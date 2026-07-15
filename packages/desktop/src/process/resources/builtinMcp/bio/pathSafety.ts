/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const uniqueStrings = (values: Array<string | undefined>): string[] =>
  Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort();

const configuredPathRoots = (): string[] =>
  uniqueStrings([
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT,
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT,
    process.env.OPENSCIENCE_RUNTIME_ROOT,
    process.env.DEEPORGANISER_WORK_DIR,
  ]).filter((root) => path.isAbsolute(root));

const exactRealpathIfExists = (candidate: string): string | undefined => {
  try {
    return fs.existsSync(candidate) ? fs.realpathSync(candidate) : undefined;
  } catch {
    return undefined;
  }
};

const allowedPathRoots = (): string[] => {
  const roots = configuredPathRoots();
  return uniqueStrings([...roots, ...roots.map(exactRealpathIfExists)]);
};

const isPathUnderRoot = (candidate: string, root: string): boolean => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const nearestExistingPath = (candidate: string): string | undefined => {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return current;
};

const realpathIfExists = (candidate: string): string | undefined => {
  const existingPath = nearestExistingPath(candidate);
  if (!existingPath) return undefined;
  try {
    return fs.realpathSync(existingPath);
  } catch {
    return undefined;
  }
};

export const resolveSafeProjectWritePath = (projectRoot: string, relativePath: string): string => {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Project write path must be relative: ${relativePath}`);
  }
  const root = path.resolve(projectRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Project root is not an available directory: ${root}`);
  }
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Project write path escapes the project root: ${relativePath}`);
  }
  const existingPath = nearestExistingPath(resolved);
  if (!existingPath) throw new Error(`Cannot resolve project write path: ${relativePath}`);
  const realRoot = fs.realpathSync(root);
  const realExisting = fs.realpathSync(existingPath);
  const realRelative = path.relative(realRoot, realExisting);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`Project write path resolves through a symlink outside the project root: ${relativePath}`);
  }
  return resolved;
};

export type SafeOutputDirectoryStatus = {
  status: 'allowed' | 'blocked';
  outputDir: string;
  resolvedPath?: string;
  allowedRoots: string[];
  reason?: string;
};

export type PublicHttpUrlStatus = {
  status: 'allowed' | 'blocked';
  url: string;
  hostname?: string;
  reason?: string;
  credentialLikeQueryKeys?: string[];
  redacted?: boolean;
  networkChecked?: boolean;
};

export type SafeChildPathStatus = {
  status: 'allowed' | 'blocked';
  targetName: string;
  resolvedPath?: string;
  exists?: boolean;
  reason?: string;
};

const normalizeHostname = (hostname: string): string =>
  hostname
    .trim()
    .replace(/^\[|\]$/gu, '')
    .replace(/\.$/u, '')
    .toLowerCase();

const ipv4Parts = (hostname: string): number[] | undefined => {
  const parts = hostname.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return undefined;
  }
  return parts;
};

const isNonPublicIpv4 = (hostname: string): boolean => {
  const parts = ipv4Parts(hostname);
  if (!parts) return false;
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const isBlockedIpv6 = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  const mappedIpv4 = /^(?:0:0:0:0:0:ffff:|::ffff:)(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized);
  return (
    normalized.includes(':ffff:') ||
    Boolean(mappedIpv4 && isNonPublicIpv4(mappedIpv4[1])) ||
    normalized === '::1' ||
    normalized === '::' ||
    /^0(?::0){7}$/u.test(normalized) ||
    normalized.startsWith('2001:db8') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  );
};

const isInternalHostname = (hostname: string): boolean => {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === 'local' ||
    normalized.endsWith('.local') ||
    normalized === 'internal' ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.lan') ||
    normalized.endsWith('.home') ||
    !normalized.includes('.')
  );
};

const isCredentialLikeQueryKey = (key: string): boolean => {
  const normalized = key.trim().toLowerCase();
  return (
    normalized.includes('token') ||
    normalized.includes('cookie') ||
    normalized.includes('credential') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('apikey') ||
    normalized.includes('api_key') ||
    normalized === 'key' ||
    normalized === 'authorization' ||
    normalized === 'auth' ||
    normalized === 'signature' ||
    normalized === 'sig' ||
    normalized.startsWith('x-amz-')
  );
};

const credentialLikeQueryKeys = (parsed: URL): string[] =>
  Array.from(new Set([...parsed.searchParams.keys()].filter(isCredentialLikeQueryKey))).sort();

const credentialPairPattern =
  /\b(token|cookie|credential|password|secret|apikey|api_key|key|authorization|auth|signature|sig|x-amz-[a-z0-9_-]+)=([^\s"'&?#,)>\]]+)/giu;
const urlCandidatePattern = /[A-Za-z][A-Za-z\d+.-]*:\/\/[^\s"'<>]+/gu;

const redactedUrl = (parsed: URL, queryKeys: string[] = credentialLikeQueryKeys(parsed)): string => {
  const clone = new URL(parsed.toString());
  if (clone.username) clone.username = '[redacted]';
  if (clone.password) clone.password = '[redacted]';
  for (const key of queryKeys) {
    clone.searchParams.set(key, '[redacted]');
  }
  return clone.toString();
};

export type RedactedTextResult = {
  value: string;
  redacted: boolean;
};

export const redactCredentialText = (candidate: string): RedactedTextResult => {
  let redacted = false;
  const redactPairValues = (value: string): string =>
    value.replace(credentialPairPattern, (_match, key: string) => {
      redacted = true;
      return `${key}=[redacted]`;
    });

  const value = redactPairValues(
    candidate.replace(urlCandidatePattern, (match) => {
      const replaced = redactCredentialUrl(match);
      if (replaced !== match) redacted = true;
      return redactPairValues(replaced);
    })
  );

  return { value, redacted };
};

export const redactCredentialUrl = (candidate: string): string => {
  try {
    const parsed = new URL(candidate);
    const queryKeys = credentialLikeQueryKeys(parsed);
    if (!parsed.username && !parsed.password && queryKeys.length === 0) return candidate;
    return redactedUrl(parsed, queryKeys);
  } catch {
    return candidate;
  }
};

export const hasCredentialLikeUrl = (candidate: string): boolean => {
  try {
    const parsed = new URL(candidate);
    return Boolean(parsed.username || parsed.password || credentialLikeQueryKeys(parsed).length);
  } catch {
    return redactCredentialText(candidate).redacted;
  }
};

export const safeAbsolutePathStatus = (candidate: string): 'available' | 'unverified' => {
  if (!path.isAbsolute(candidate)) return 'unverified';
  const roots = allowedPathRoots();
  if (!roots.some((root) => isPathUnderRoot(candidate, root))) return 'unverified';
  const realpath = realpathIfExists(candidate);
  if (realpath && !roots.some((root) => isPathUnderRoot(realpath, root))) return 'unverified';
  return fs.existsSync(candidate) ? 'available' : 'unverified';
};

export const safeOutputDirectoryStatus = (outputDir: string): SafeOutputDirectoryStatus => {
  const roots = allowedPathRoots();
  if (!outputDir.trim()) {
    return { status: 'blocked', outputDir, allowedRoots: roots, reason: 'outputDir is required.' };
  }
  if (!path.isAbsolute(outputDir)) {
    return { status: 'blocked', outputDir, allowedRoots: roots, reason: 'outputDir must be an absolute path.' };
  }
  if (!roots.length) {
    return {
      status: 'blocked',
      outputDir,
      allowedRoots: roots,
      reason: 'No allowed OpenBioScience roots are configured.',
    };
  }
  const resolvedPath = path.resolve(outputDir);
  if (!roots.some((root) => isPathUnderRoot(resolvedPath, root))) {
    return {
      status: 'blocked',
      outputDir,
      resolvedPath,
      allowedRoots: roots,
      reason: 'outputDir is outside allowed roots.',
    };
  }
  const realpath = realpathIfExists(resolvedPath);
  if (realpath && !roots.some((root) => isPathUnderRoot(realpath, root))) {
    return {
      status: 'blocked',
      outputDir,
      resolvedPath,
      allowedRoots: roots,
      reason: 'outputDir resolves through a symlink outside allowed roots.',
    };
  }
  return { status: 'allowed', outputDir, resolvedPath, allowedRoots: roots };
};

export const safeChildPathStatus = (parentDir: string, targetName: string): SafeChildPathStatus => {
  if (!targetName.trim()) {
    return { status: 'blocked', targetName, reason: 'targetName is required before filesystem writes.' };
  }
  if (path.isAbsolute(targetName)) {
    return { status: 'blocked', targetName, reason: 'targetName must be relative to outputDir.' };
  }
  const resolvedPath = path.resolve(parentDir, targetName);
  if (!isPathUnderRoot(resolvedPath, parentDir)) {
    return { status: 'blocked', targetName, resolvedPath, reason: 'targetName escapes outputDir.' };
  }
  const parentRoots = uniqueStrings([path.resolve(parentDir), realpathIfExists(parentDir)]);
  const realpath = realpathIfExists(resolvedPath);
  if (realpath && !parentRoots.some((root) => isPathUnderRoot(realpath, root))) {
    return { status: 'blocked', targetName, resolvedPath, reason: 'targetName resolves outside outputDir.' };
  }
  return { status: 'allowed', targetName, resolvedPath, exists: fs.existsSync(resolvedPath) };
};

export const publicHttpUrlStatus = (candidate: string): PublicHttpUrlStatus => {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    const redacted = redactCredentialText(candidate);
    return {
      status: 'blocked',
      url: redacted.value,
      reason: 'URL is invalid.',
      redacted: redacted.redacted || undefined,
      networkChecked: false,
    };
  }

  const credentialQueryKeys = credentialLikeQueryKeys(parsed);
  if (parsed.username || parsed.password) {
    return {
      status: 'blocked',
      url: redactedUrl(parsed, credentialQueryKeys),
      hostname: parsed.hostname,
      reason: 'URL credentials are not allowed.',
      credentialLikeQueryKeys: credentialQueryKeys,
      redacted: true,
      networkChecked: false,
    };
  }
  if (credentialQueryKeys.length > 0) {
    return {
      status: 'blocked',
      url: redactedUrl(parsed, credentialQueryKeys),
      hostname: parsed.hostname,
      reason: 'Credential-like URL query parameters are not allowed.',
      credentialLikeQueryKeys: credentialQueryKeys,
      redacted: true,
      networkChecked: false,
    };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      status: 'blocked',
      url: candidate,
      hostname: parsed.hostname,
      reason: 'Only HTTP/HTTPS URLs are allowed.',
      networkChecked: false,
    };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname)
    return { status: 'blocked', url: candidate, reason: 'URL hostname is required.', networkChecked: false };
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4 && isNonPublicIpv4(hostname)) {
    return {
      status: 'blocked',
      url: candidate,
      hostname,
      reason: 'Non-public IPv4 URLs are not allowed.',
      networkChecked: false,
    };
  }
  if (ipVersion === 6 && isBlockedIpv6(hostname)) {
    return {
      status: 'blocked',
      url: candidate,
      hostname,
      reason: 'Non-public IPv6 URLs are not allowed.',
      networkChecked: false,
    };
  }
  if (ipVersion === 0 && isInternalHostname(hostname)) {
    return {
      status: 'blocked',
      url: candidate,
      hostname,
      reason: 'Local or internal hostnames are not allowed.',
      networkChecked: false,
    };
  }

  return { status: 'allowed', url: candidate, hostname, networkChecked: false };
};
