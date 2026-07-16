#!/usr/bin/env bun
/**
 * Package installed official Conda prefixes into portable release artifacts.
 *
 * Inputs: --source-root, --output, --release, --platform, and catalog names.
 * Outputs: one conda-pack tar.zst archive per environment and release-manifest.json.
 * Side effects: writes only to --output; source prefixes are read-only inputs.
 */

import { createHash } from 'node:crypto';
import fs, { createReadStream } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  OFFICIAL_ENVIRONMENT_RELEASE_SCHEMA,
  type OfficialEnvironmentReleaseArtifact,
} from '../packages/desktop/src/process/utils/officialEnvironmentRelease';

type CatalogEnvironment = { name: string; relativePrefix: string; requiredCommands: string[] };
type Catalog = { environments: CatalogEnvironment[] };

const repoRoot = path.resolve(import.meta.dir, '..');
const catalogPath = path.join(repoRoot, 'environments', 'official', 'bootstrap', 'env-manifest.json');

const requiredOption = (options: Map<string, string>, name: string): string => {
  const value = options.get(name);
  if (!value) throw new Error(`Missing required option --${name}.`);
  return value;
};

const sha256 = async (filePath: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
};

const run = (command: string, args: string[]): void => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}.`);
};

const main = async (): Promise<void> => {
  const options = new Map<string, string>();
  const environmentNames: string[] = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === '--help' || argument === '-h') {
      console.log(
        'Usage: package-official-environments.ts --source-root <runtime-root> --output <release-dir> --release <id> --platform <platform> <environment>...'
      );
      return;
    }
    if (argument.startsWith('--')) {
      const value = process.argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      options.set(argument.slice(2), value);
      index += 1;
    } else {
      environmentNames.push(argument);
    }
  }
  if (environmentNames.length === 0) throw new Error('Provide at least one catalog environment name.');

  const sourceRoot = path.resolve(requiredOption(options, 'source-root'));
  const outputRoot = path.resolve(requiredOption(options, 'output'));
  const release = requiredOption(options, 'release');
  const platform = requiredOption(options, 'platform');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as Catalog;
  const archiveRoot = path.join(outputRoot, 'archives');
  fs.mkdirSync(archiveRoot, { recursive: true });

  const artifacts: OfficialEnvironmentReleaseArtifact[] = [];
  for (const name of environmentNames) {
    const environment = catalog.environments.find((candidate) => candidate.name === name);
    if (!environment) throw new Error(`Unknown catalog environment: ${name}.`);
    const sourcePrefix = path.join(sourceRoot, environment.relativePrefix);
    if (!fs.statSync(sourcePrefix).isDirectory()) throw new Error(`Missing source prefix: ${sourcePrefix}.`);
    const missingCommands = environment.requiredCommands.filter(
      (command) => !fs.existsSync(path.join(sourcePrefix, 'bin', command))
    );
    if (missingCommands.length > 0) {
      throw new Error(`Source environment ${name} is missing required commands: ${missingCommands.join(', ')}.`);
    }
    const archive = `archives/${name}-${platform}.tar.zst`;
    const archivePath = path.join(outputRoot, archive);
    run('conda-pack', ['--prefix', sourcePrefix, '--output', archivePath, '--format', 'tar.zst', '--force', '--quiet']);
    const sizeBytes = fs.statSync(archivePath).size;
    artifacts.push({
      name,
      archive,
      sha256: await sha256(archivePath),
      sizeBytes,
      relativePrefix: environment.relativePrefix,
      requiredCommands: environment.requiredCommands,
    });
  }

  fs.writeFileSync(
    path.join(outputRoot, 'release-manifest.json'),
    `${JSON.stringify({ schema: OFFICIAL_ENVIRONMENT_RELEASE_SCHEMA, release, platform, artifacts }, null, 2)}\n`
  );
};

try {
  await main();
} catch (error) {
  console.error(`[package-official-environments] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
