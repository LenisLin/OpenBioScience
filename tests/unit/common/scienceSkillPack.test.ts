import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCIENCE_SKILL_IDS,
  LEGACY_SCIENCE_DEFAULT_SKILL_IDS,
  SCIENCE_ARTIFACT_SKILL_NAME,
  SCIENCE_BIOMODELS_SKILL_NAME,
  SCIENCE_COMPUTE_SKILL_NAME,
  SCIENCE_CORE_SKILL_NAME,
  SCIENCE_DATABASES_SKILL_NAME,
  SCIENCE_ONBOARDING_SKILL_NAME,
  SCIENCE_SINGLECELL_SKILL_NAME,
  SCIENCE_VENDOR_CATALOG_SKILL_NAME,
  SCIENCE_WRITING_SKILL_NAME,
  SCIENCE_WORKFLOW_SKILL_PATH,
  SCIENCE_WORKFLOW_SKILL_NAME,
  normalizeScienceDefaultSkillIds,
} from '@/common/chat/science';
import {
  SCIENCE_MATERIALIZED_SKILL_IDS,
  SCIENCE_SKILL_PACK_COUNTS,
  SCIENCE_SKILL_PACK_MANIFEST_PATH,
} from '@/common/chat/scienceSkills.generated';

type ScienceSkillManifest = {
  schema: string;
  counts: {
    total: number;
    byPack: Record<string, number>;
    byPackAvailable?: Record<string, number>;
    quarantinedScripts: number;
    restrictedDefault: number;
    clinicalBoundary: number;
  };
  skills: Array<{
    id: string;
    materializedPath: string;
    sourceUrl: string;
    license: string;
    executionPolicy: string;
    risk: string;
    clinicalBoundary: string;
    packId: string;
  }>;
};

const repoRoot = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, SCIENCE_SKILL_PACK_MANIFEST_PATH), 'utf8')
) as ScienceSkillManifest;

describe('OpenScience materialized Science skill pack', () => {
  it('keeps the generated manifest and generated constants in sync', () => {
    expect(manifest.schema).toBe('openscience.skill-pack.v1');
    expect(manifest.counts.total).toBe(SCIENCE_MATERIALIZED_SKILL_IDS.length);
    expect(manifest.counts.total).toBe(SCIENCE_SKILL_PACK_COUNTS.total);
    expect(manifest.counts.byPack.deepscientist).toBe(SCIENCE_SKILL_PACK_COUNTS.deepscientist);
    expect(manifest.counts.byPack.kdense).toBe(SCIENCE_SKILL_PACK_COUNTS.kdense);
    expect(manifest.counts.byPack.natureSkills).toBe(SCIENCE_SKILL_PACK_COUNTS.natureSkills);
    expect(manifest.counts.byPack.academicforge).toBe(SCIENCE_SKILL_PACK_COUNTS.academicforge);
    expect(manifest.counts.byPack.autoEmpirical).toBeUndefined();
    expect(manifest.counts.byPackAvailable?.autoEmpirical).toBeUndefined();
    expect(manifest.counts.byPackAvailable?.academicforge).toBe(SCIENCE_SKILL_PACK_COUNTS.academicforge);
    expect(manifest.counts.quarantinedScripts).toBe(SCIENCE_SKILL_PACK_COUNTS.quarantinedScripts);
    expect(manifest.counts.restrictedDefault).toBe(SCIENCE_SKILL_PACK_COUNTS.restrictedDefault);
    expect(manifest.counts.clinicalBoundary).toBe(SCIENCE_SKILL_PACK_COUNTS.clinicalBoundary);
  });

  it('loads compact OpenScience router skills by default without relying on the migration catalog', () => {
    expect(DEFAULT_SCIENCE_SKILL_IDS[0]).toBe(SCIENCE_CORE_SKILL_NAME);
    expect(DEFAULT_SCIENCE_SKILL_IDS[1]).toBe(SCIENCE_ARTIFACT_SKILL_NAME);
    expect(DEFAULT_SCIENCE_SKILL_IDS[2]).toBe(SCIENCE_ONBOARDING_SKILL_NAME);
    expect(DEFAULT_SCIENCE_SKILL_IDS[3]).toBe(SCIENCE_WORKFLOW_SKILL_NAME);
    expect(DEFAULT_SCIENCE_SKILL_IDS).not.toContain(SCIENCE_VENDOR_CATALOG_SKILL_NAME);
    expect(DEFAULT_SCIENCE_SKILL_IDS).toContain('openscience-workflow');
    expect(DEFAULT_SCIENCE_SKILL_IDS).toContain(SCIENCE_WRITING_SKILL_NAME);
    expect(DEFAULT_SCIENCE_SKILL_IDS).toContain(SCIENCE_DATABASES_SKILL_NAME);
    expect(DEFAULT_SCIENCE_SKILL_IDS).toContain(SCIENCE_BIOMODELS_SKILL_NAME);
    expect(DEFAULT_SCIENCE_SKILL_IDS).toContain(SCIENCE_SINGLECELL_SKILL_NAME);
    expect(DEFAULT_SCIENCE_SKILL_IDS).toContain(SCIENCE_COMPUTE_SKILL_NAME);
    expect(DEFAULT_SCIENCE_SKILL_IDS).not.toContain('openscience-empirical');
    expect(DEFAULT_SCIENCE_SKILL_IDS).not.toContain('ds-review');
    expect(DEFAULT_SCIENCE_SKILL_IDS).not.toContain('kdense-database-lookup');
    expect(DEFAULT_SCIENCE_SKILL_IDS).not.toContain('aer-statspai-skill');
  });

  it('prunes non-biomedical generated and handwritten skill packs', () => {
    const ids = manifest.skills.map((skill) => skill.id);
    expect(ids.some((id) => id.startsWith('aer-'))).toBe(false);
    expect(ids).not.toContain('nature-paper-to-patent');
    expect(manifest.skills.some((skill) => skill.packId === 'autoEmpirical')).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'resources/skills/empirical'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'resources/skills/science-vendor-catalog'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'resources/skills/vendor/auto-empirical-research-skills'))).toBe(false);
  });

  it('ships Workflow as an independent built-in stage router', () => {
    const workflowPath = path.join(repoRoot, SCIENCE_WORKFLOW_SKILL_PATH);
    const workflowDir = path.dirname(workflowPath);
    expect(fs.existsSync(workflowPath)).toBe(true);
    expect(fs.existsSync(path.join(workflowDir, 'references', 'deepscientist-workflow-map.md'))).toBe(true);
    expect(fs.existsSync(path.join(workflowDir, 'references', 'git-worktree-minimum.md'))).toBe(true);

    const body = fs.readFileSync(workflowPath, 'utf8');
    expect(body).toContain('name: openscience-workflow');
    expect(body).toContain('Research workflow main chain');
    expect(body).toContain('Minimal Git and Filesystem SOP');
  });

  it('ships compact OpenScience domain routers that merge leaf skill packs', () => {
    const routerDirs = ['onboarding', 'writing', 'databases', 'biomodels', 'singlecell', 'compute'];
    for (const dir of routerDirs) {
      const skillPath = path.join(repoRoot, 'resources', 'skills', dir, 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);
      const body = fs.readFileSync(skillPath, 'utf8');
      expect(body).toContain('name: openscience-');
    }

    expect(fs.readFileSync(path.join(repoRoot, 'resources/skills/writing/SKILL.md'), 'utf8')).toContain('Merge Map');
    expect(fs.readFileSync(path.join(repoRoot, 'resources/skills/databases/SKILL.md'), 'utf8')).toContain(
      'research_evidence'
    );
    expect(fs.readFileSync(path.join(repoRoot, 'resources/skills/onboarding/SKILL.md'), 'utf8')).toContain(
      'First-time'
    );
  });

  it('materializes every manifest skill as a first-class SKILL.md with provenance fields', () => {
    const ids = new Set<string>();
    for (const skill of manifest.skills) {
      expect(ids.has(skill.id)).toBe(false);
      ids.add(skill.id);
      expect(skill.sourceUrl).toMatch(/^https:\/\//u);
      expect(skill.license.length).toBeGreaterThan(0);
      expect(skill.executionPolicy).toMatch(
        /^(active_default|available_default|restricted_default|quarantined_script)$/u
      );
      expect(skill.risk).toMatch(/^(low|network|write|credential|external_compute)$/u);
      expect(skill.clinicalBoundary).toMatch(/^(none|medical_evidence_required)$/u);

      const skillPath = path.join(repoRoot, skill.materializedPath, 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);
      const body = fs.readFileSync(skillPath, 'utf8');
      expect(body).toContain('Generated by OpenScience science skill materializer');
      expect(body).toContain('OpenScience Adapter');
      expect(body).toContain('How to Read This SKILL.md');
      expect(body).toContain('OpenScience SOP');
    }
    expect(ids.size).toBe(manifest.counts.total);
  });

  it('keeps biomedical materialized skills available', () => {
    expect(SCIENCE_MATERIALIZED_SKILL_IDS).toContain('kdense-scanpy');
    expect(SCIENCE_MATERIALIZED_SKILL_IDS).toContain('kdense-rdkit');
    expect(SCIENCE_MATERIALIZED_SKILL_IDS).toContain('kdense-pyhealth');
    expect(SCIENCE_MATERIALIZED_SKILL_IDS).toContain('kdense-clinical-decision-support');
    expect(SCIENCE_MATERIALIZED_SKILL_IDS).toContain('nature-literature-pipeline');
    expect(SCIENCE_MATERIALIZED_SKILL_IDS).toContain('cs-alphafold2');
    expect(SCIENCE_MATERIALIZED_SKILL_IDS).toContain('cs-remote-compute-modal');
    expect(SCIENCE_MATERIALIZED_SKILL_IDS).toContain('cs-scgpt');
  });

  it('keeps the AcademicForge vendor subset aligned with the generated manifest', () => {
    const academicForgeSkills = manifest.skills.filter((skill) => skill.packId === 'academicforge');
    expect(academicForgeSkills).toHaveLength(SCIENCE_SKILL_PACK_COUNTS.academicforge);
    expect(academicForgeSkills.every((skill) => skill.id.startsWith('cs-'))).toBe(true);
    expect(academicForgeSkills.some((skill) => skill.id === 'cs-remote-compute-ssh')).toBe(true);
    expect(academicForgeSkills.some((skill) => skill.id === 'cs-paper-narrative')).toBe(true);
  });

  it('upgrades legacy catalog-only defaults to the materialized pack', () => {
    const normalized = normalizeScienceDefaultSkillIds(LEGACY_SCIENCE_DEFAULT_SKILL_IDS);
    expect(normalized).toEqual([...DEFAULT_SCIENCE_SKILL_IDS]);
    expect(normalized).toContain('openscience-writing');
    expect(normalized).toContain('openscience-databases');
    expect(normalized).not.toContain('openscience-empirical');
  });

  it('upgrades the previous materialized-leaf default to compact routers', () => {
    const previousDefault = [
      SCIENCE_CORE_SKILL_NAME,
      SCIENCE_ARTIFACT_SKILL_NAME,
      SCIENCE_WORKFLOW_SKILL_NAME,
      ...SCIENCE_MATERIALIZED_SKILL_IDS,
    ];

    const normalized = normalizeScienceDefaultSkillIds(previousDefault);

    expect(normalized).toEqual([...DEFAULT_SCIENCE_SKILL_IDS]);
    expect(normalized).toContain('openscience-onboarding');
    expect(normalized).not.toContain('ds-review');
    expect(normalized).not.toContain('kdense-database-lookup');
  });
});
