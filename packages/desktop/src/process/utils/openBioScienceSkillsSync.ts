/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

export const OPENSCIENCE_SKILL_SYNC_MARKER = '.openscience-skills.json';

const DEFAULT_SUPPORT_DIRECTORIES = ['_shared'];
const SKILL_MANIFEST_FILE = 'SKILL.md';

type SyncLogger = Pick<Console, 'log' | 'warn'>;

export type OpenBioScienceSkillSyncResult =
  | {
      synced: true;
      sourceRoot: string;
      targetRoot: string;
      skillNames: string[];
      supportDirectoryNames: string[];
    }
  | {
      synced: false;
      sourceRoot: string;
      targetRoot: string;
      reason: 'missing-source';
    };

export type OpenBioScienceSkillSyncOptions = {
  sourceRoot: string;
  targetRoot: string;
  repoRoot?: string;
  markerSchema?: string;
  logger?: SyncLogger;
  now?: () => Date;
  supportDirectoryNames?: string[];
};

const isSafeChildName = (name: string): boolean =>
  Boolean(name) && name !== '.' && name !== '..' && !path.isAbsolute(name) && !name.includes('/') && !name.includes('\\');

const copyDirectory = (source: string, target: string): void => {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, {
    recursive: true,
    force: true,
    dereference: false,
    filter: (sourcePath) => {
      const base = path.basename(sourcePath);
      return base !== '.git' && base !== 'node_modules' && base !== '__pycache__';
    },
  });
};

const readJsonFile = <T>(filePath: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const listSkillNames = (sourceRoot: string): string[] =>
  fs
    .readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(sourceRoot, entry.name, SKILL_MANIFEST_FILE)))
    .map((entry) => entry.name)
    .filter(isSafeChildName)
    .sort();

const listSupportDirectoryNames = (sourceRoot: string, supportDirectoryNames: string[]): string[] =>
  supportDirectoryNames
    .filter(isSafeChildName)
    .filter((name) => {
      try {
        return fs.statSync(path.join(sourceRoot, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();

export const resolveOpenBioScienceSkillsSourceRoot = (
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | undefined =
    typeof (process as typeof process & { resourcesPath?: string }).resourcesPath === 'string'
      ? (process as typeof process & { resourcesPath?: string }).resourcesPath
      : undefined
): string => {
  const candidates = [
    env.OPENBIOSCIENCE_SKILLS_SOURCE_DIR,
    path.join(repoRoot, 'resources', 'skills'),
    resourcesPath ? path.join(resourcesPath, 'skills') : undefined,
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate) && fs.existsSync(candidate)) ?? candidates[1]!;
};

export const syncOpenBioScienceSkills = (options: OpenBioScienceSkillSyncOptions): OpenBioScienceSkillSyncResult => {
  const {
    sourceRoot,
    targetRoot,
    repoRoot,
    markerSchema = 'openscience.skill-sync.v1',
    logger = console,
    now = () => new Date(),
    supportDirectoryNames = DEFAULT_SUPPORT_DIRECTORIES,
  } = options;

  if (!fs.existsSync(sourceRoot)) {
    logger.warn(`[OpenBioScience] skills source not found: ${sourceRoot}`);
    return { synced: false, sourceRoot, targetRoot, reason: 'missing-source' };
  }

  fs.mkdirSync(targetRoot, { recursive: true });

  const skillNames = listSkillNames(sourceRoot);
  const supportNames = listSupportDirectoryNames(sourceRoot, supportDirectoryNames);
  const markerPath = path.join(targetRoot, OPENSCIENCE_SKILL_SYNC_MARKER);
  const previous = readJsonFile<{ skills?: string[]; supportDirectories?: string[] }>(markerPath, {});
  const nextNames = new Set([...skillNames, ...supportNames]);

  for (const staleName of [...(previous.skills ?? []), ...(previous.supportDirectories ?? [])]) {
    if (isSafeChildName(staleName) && !nextNames.has(staleName)) {
      fs.rmSync(path.join(targetRoot, staleName), { recursive: true, force: true });
    }
  }

  for (const entryName of [...skillNames, ...supportNames]) {
    copyDirectory(path.join(sourceRoot, entryName), path.join(targetRoot, entryName));
  }

  fs.writeFileSync(
    markerPath,
    `${JSON.stringify(
      {
        schema: markerSchema,
        sourceRoot: repoRoot ? path.relative(repoRoot, sourceRoot) : sourceRoot,
        syncedAt: now().toISOString(),
        skills: skillNames,
        supportDirectories: supportNames,
      },
      null,
      2
    )}\n`
  );
  logger.log(`[OpenBioScience] skills synced: ${skillNames.length} skills, ${supportNames.length} support dirs`);

  return {
    synced: true,
    sourceRoot,
    targetRoot,
    skillNames,
    supportDirectoryNames: supportNames,
  };
};
