#!/usr/bin/env bun
/**
 * Install one official environment from an immutable Hugging Face Dataset release.
 *
 * Inputs: repository/revision/environment options or matching environment variables.
 * Outputs: one verified Conda prefix below OPENBIOSCIENCE_ENV_ROOT.
 * Side effects: downloads into the selected root and replaces only that environment prefix.
 * Assumptions: the release was made by package-official-environments.ts and tar/curl support zstd/proxy transport.
 */

import { createHash } from 'node:crypto';
import fs, { createReadStream } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  findOfficialEnvironmentReleaseArtifact,
  parseOfficialEnvironmentReleaseManifest,
  type OfficialEnvironmentReleaseArtifact,
} from '../packages/desktop/src/process/utils/officialEnvironmentRelease';

const DEFAULT_ROOT = path.join(process.cwd(), '.openbioscience', 'runtime');
const PROXY_ENV_KEYS = ['ALL_PROXY', 'all_proxy', 'HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy'] as const;

const normalizeContainerLoopbackProxies = (): void => {
  for (const key of PROXY_ENV_KEYS) {
    const configured = process.env[key];
    if (!configured) continue;
    process.env[key] = configured.replace(/^(\w+:\/\/)(127\.0\.0\.1|localhost)(?=[:/]|$)/i, '$1host.docker.internal');
  }
};

const optionOrEnv = (options: Map<string, string>, option: string, envName: string, fallback?: string): string =>
  options.get(option) || process.env[envName] || fallback || '';

const safeJoin = (root: string, relativePath: string): string => {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Resolved path escapes environment root: ${relativePath}.`);
  }
  return resolved;
};

const sha256 = async (filePath: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
};

const commandExists = (prefix: string, command: string): boolean => {
  const extension = process.platform === 'win32' ? '.exe' : '';
  return fs.existsSync(path.join(prefix, 'bin', `${command}${extension}`));
};

const assertArchivePathsAreSafe = (archivePath: string): void => {
  const result = spawnSync('tar', ['--zstd', '-tf', archivePath], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`Cannot inspect environment archive ${archivePath}.`);
  for (const entry of result.stdout.split(/\r?\n/).filter(Boolean)) {
    if (entry.startsWith('/') || entry.startsWith('\\') || entry.split(/[\\/]/).includes('..')) {
      throw new Error(`Environment archive contains an unsafe path: ${entry}.`);
    }
  }
  const verbose = spawnSync('tar', ['--zstd', '-tvf', archivePath], { encoding: 'utf8' });
  if (verbose.error || verbose.status !== 0)
    throw new Error(`Cannot inspect environment archive links in ${archivePath}.`);
  for (const entry of verbose.stdout.split(/\r?\n/).filter(Boolean)) {
    const linkTarget = entry.split(' -> ')[1];
    if (
      linkTarget &&
      (linkTarget.startsWith('/') || linkTarget.startsWith('\\') || linkTarget.split(/[\\/]/).includes('..'))
    ) {
      throw new Error(`Environment archive contains an unsafe link target: ${linkTarget}.`);
    }
  }
};

const curlArguments = (url: string, token?: string): string[] => [
  '--fail',
  '--location',
  '--retry',
  '3',
  '--retry-delay',
  '2',
  '--silent',
  '--show-error',
  ...(token ? ['--header', `Authorization: Bearer ${token}`] : []),
  url,
];

const fetchJson = (url: string, token?: string): unknown => {
  const result = spawnSync('curl', curlArguments(url, token), { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`Could not download release manifest: ${url}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Release manifest response is not valid JSON.');
  }
};

const fetchToFile = (url: string, targetPath: string, token?: string): void => {
  const result = spawnSync('curl', [...curlArguments(url, token).slice(0, -1), '--output', targetPath, url], {
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) throw new Error(`Download failed: ${url}`);
};

const extractArtifact = (root: string, artifact: OfficialEnvironmentReleaseArtifact, archivePath: string): void => {
  assertArchivePathsAreSafe(archivePath);
  const stagingRoot = fs.mkdtempSync(path.join(safeJoin(root, '.staging'), `${artifact.name}-`));
  try {
    const extractedPrefix = stagingRoot;
    const extract = spawnSync('tar', [
      '--zstd',
      '-xf',
      archivePath,
      '-C',
      extractedPrefix,
      '--no-same-owner',
      '--no-same-permissions',
    ]);
    if (extract.error || extract.status !== 0) throw new Error(`Could not extract ${artifact.name}.`);

    const targetPrefix = safeJoin(root, artifact.relativePrefix);
    fs.mkdirSync(path.dirname(targetPrefix), { recursive: true });
    fs.rmSync(targetPrefix, { recursive: true, force: true });
    fs.renameSync(extractedPrefix, targetPrefix);

    const condaUnpack = path.join(targetPrefix, 'bin', 'conda-unpack');
    if (fs.existsSync(condaUnpack)) {
      const unpack = spawnSync(condaUnpack, [], { stdio: 'inherit' });
      if (unpack.error || unpack.status !== 0) throw new Error(`conda-unpack failed for ${artifact.name}.`);
    }
    const missing = artifact.requiredCommands.filter((command) => !commandExists(targetPrefix, command));
    if (missing.length > 0)
      throw new Error(`Environment ${artifact.name} is missing required commands: ${missing.join(', ')}.`);
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
};

const main = async (): Promise<void> => {
  normalizeContainerLoopbackProxies();
  const options = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === '--help' || argument === '-h') {
      console.log(
        'Usage: bootstrap-official-environment.ts --repository <owner/repository> --revision <40-character-commit> --environment <name> [--root <runtime-root>]'
      );
      return;
    }
    if (!argument.startsWith('--')) throw new Error(`Unknown positional argument: ${argument}.`);
    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    options.set(argument.slice(2), value);
    index += 1;
  }

  const root = path.resolve(optionOrEnv(options, 'root', 'OPENBIOSCIENCE_ENV_ROOT', DEFAULT_ROOT));
  const environment = optionOrEnv(options, 'environment', 'OPENBIOSCIENCE_ENVIRONMENT');
  const repository = optionOrEnv(options, 'repository', 'OPENBIOSCIENCE_ENV_REPOSITORY');
  const revision = optionOrEnv(options, 'revision', 'OPENBIOSCIENCE_ENV_REVISION');
  if (!environment) throw new Error('Set --environment or OPENBIOSCIENCE_ENVIRONMENT.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(
      'Set OPENBIOSCIENCE_ENV_REPOSITORY to a Hugging Face Dataset repository, for example owner/repository.'
    );
  }
  if (!/^[a-f0-9]{40}$/i.test(revision)) {
    throw new Error('Set OPENBIOSCIENCE_ENV_REVISION to an immutable 40-character commit SHA.');
  }

  fs.mkdirSync(safeJoin(root, '.downloads'), { recursive: true });
  fs.mkdirSync(safeJoin(root, '.staging'), { recursive: true });
  const baseUrl = `https://huggingface.co/datasets/${repository}/resolve/${revision}`;
  const token = process.env.HF_TOKEN;
  const manifest = parseOfficialEnvironmentReleaseManifest(fetchJson(`${baseUrl}/release-manifest.json`, token));
  const artifact = findOfficialEnvironmentReleaseArtifact(manifest, environment);
  if (manifest.platform !== `${process.platform}-${process.arch}`) {
    throw new Error(`Release platform ${manifest.platform} does not match ${process.platform}-${process.arch}.`);
  }

  const archivePath = safeJoin(root, path.join('.downloads', path.basename(artifact.archive)));
  fetchToFile(`${baseUrl}/${artifact.archive}`, archivePath, token);
  const actualHash = await sha256(archivePath);
  if (actualHash !== artifact.sha256)
    throw new Error(`SHA-256 mismatch for ${artifact.name}; archive was not installed.`);
  if (fs.statSync(archivePath).size !== artifact.sizeBytes)
    throw new Error(`Size mismatch for ${artifact.name}; archive was not installed.`);
  extractArtifact(root, artifact, archivePath);
  console.log(`[bootstrap-official-environment] installed ${artifact.name} from ${manifest.release} into ${root}.`);
};

main().catch((error) => {
  console.error(`[bootstrap-official-environment] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
