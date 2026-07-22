import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OPENSCIENCE_SKILL_SYNC_MARKER,
  resolveOpenBioScienceSkillsSourceRoot,
  syncOpenBioScienceSkills,
} from '@/process/utils/openBioScienceSkillsSync';

const tempRoots: string[] = [];
const fixedNow = new Date('2026-07-21T00:00:00.000Z');

const makeTempRoot = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openscience-skills-sync-'));
  tempRoots.push(dir);
  return dir;
};

const writeFile = (filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

describe('OpenBioScience built-in skill sync', () => {
  afterEach(() => {
    for (const dir of tempRoots.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  it('copies skill directories and shared support directories into the backend target', () => {
    const root = makeTempRoot();
    const sourceRoot = path.join(root, 'resources', 'skills');
    const targetRoot = path.join(root, 'work', 'builtin-skills');
    writeFile(path.join(sourceRoot, 'alpha-skill', 'SKILL.md'), 'alpha');
    writeFile(path.join(sourceRoot, 'alpha-skill', 'node_modules', 'ignored.txt'), 'ignored');
    writeFile(path.join(sourceRoot, '_shared', 'core', 'guide.md'), 'shared');
    writeFile(path.join(sourceRoot, 'not-a-skill', 'README.md'), 'ignored');

    const result = syncOpenBioScienceSkills({
      sourceRoot,
      targetRoot,
      repoRoot: root,
      markerSchema: 'test.schema',
      now: () => fixedNow,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    expect(result).toMatchObject({ synced: true, skillNames: ['alpha-skill'], supportDirectoryNames: ['_shared'] });
    expect(fs.readFileSync(path.join(targetRoot, 'alpha-skill', 'SKILL.md'), 'utf8')).toBe('alpha');
    expect(fs.readFileSync(path.join(targetRoot, '_shared', 'core', 'guide.md'), 'utf8')).toBe('shared');
    expect(fs.existsSync(path.join(targetRoot, 'alpha-skill', 'node_modules'))).toBe(false);
  });

  it('removes only stale directories previously owned by the sync marker', () => {
    const root = makeTempRoot();
    const sourceRoot = path.join(root, 'resources', 'skills');
    const targetRoot = path.join(root, 'work', 'builtin-skills');
    writeFile(path.join(sourceRoot, 'current-skill', 'SKILL.md'), 'current');
    writeFile(path.join(targetRoot, 'stale-skill', 'SKILL.md'), 'stale');
    writeFile(path.join(targetRoot, 'user-skill', 'SKILL.md'), 'user');
    writeFile(
      path.join(targetRoot, OPENSCIENCE_SKILL_SYNC_MARKER),
      JSON.stringify({ skills: ['stale-skill'], supportDirectories: ['stale-support', '../unsafe'] })
    );

    syncOpenBioScienceSkills({
      sourceRoot,
      targetRoot,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    expect(fs.existsSync(path.join(targetRoot, 'current-skill', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetRoot, 'stale-skill'))).toBe(false);
    expect(fs.existsSync(path.join(targetRoot, 'user-skill', 'SKILL.md'))).toBe(true);
  });

  it('reports a skipped sync when the source directory is missing', () => {
    const warn = vi.fn();
    const result = syncOpenBioScienceSkills({
      sourceRoot: path.join(makeTempRoot(), 'missing'),
      targetRoot: path.join(makeTempRoot(), 'target'),
      logger: { log: vi.fn(), warn },
    });

    expect(result).toMatchObject({ synced: false, reason: 'missing-source' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skills source not found'));
  });

  it('resolves source roots from explicit env, repo resources, then packaged resources', () => {
    const root = makeTempRoot();
    const envRoot = path.join(root, 'env-skills');
    const repoRoot = path.join(root, 'repo');
    const packagedRoot = path.join(root, 'packaged');
    fs.mkdirSync(envRoot, { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'resources', 'skills'), { recursive: true });
    fs.mkdirSync(path.join(packagedRoot, 'skills'), { recursive: true });

    vi.stubEnv('OPENBIOSCIENCE_SKILLS_SOURCE_DIR', envRoot);

    expect(resolveOpenBioScienceSkillsSourceRoot(repoRoot, process.env, packagedRoot)).toBe(envRoot);
    vi.stubEnv('OPENBIOSCIENCE_SKILLS_SOURCE_DIR', undefined);
    expect(resolveOpenBioScienceSkillsSourceRoot(repoRoot, process.env, packagedRoot)).toBe(
      path.join(repoRoot, 'resources', 'skills')
    );
  });
});
