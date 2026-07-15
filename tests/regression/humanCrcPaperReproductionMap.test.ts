import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  indexPaperSources,
  PAPER_REPRODUCTION_MAP_PATH,
  paperReproductionMapSchema,
  validatePaperReproductionMap,
  validateReproductionScope,
} from '@/process/resources/builtinMcp/bio/reproduction/paperReproductionMap';
import { prepareExecutionContract } from '@/process/resources/builtinMcp/bio/reproduction/executionContract';

const FIXTURE_ROOT = path.resolve('tests/fixtures/reproduction/human-crc');
const EXCERPT_PATH = 'tests/fixtures/reproduction/human-crc/paper-excerpts.txt';

describe('human CRC paper reproduction map', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-human-crc-map-'));
    const excerptTarget = path.join(root, EXCERPT_PATH);
    const mapTarget = path.join(root, PAPER_REPRODUCTION_MAP_PATH);
    fs.mkdirSync(path.dirname(excerptTarget), { recursive: true });
    fs.mkdirSync(path.dirname(mapTarget), { recursive: true });
    fs.copyFileSync(path.join(FIXTURE_ROOT, 'paper-excerpts.txt'), excerptTarget);
    fs.copyFileSync(path.join(FIXTURE_ROOT, 'expected-paper-reproduction-map.json'), mapTarget);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const readMap = () =>
    paperReproductionMapSchema.parse(JSON.parse(fs.readFileSync(path.join(root, PAPER_REPRODUCTION_MAP_PATH), 'utf8')));

  const indexFixtureSource = () => {
    const result = indexPaperSources(root, {
      sources: [{ id: 'source-lee-2020-excerpts', kind: 'paper_excerpt_fixture', path: EXCERPT_PATH }],
      excerpts: [
        {
          id: 'evidence-figure-1c',
          sourceId: 'source-lee-2020-excerpts',
          lineStart: 4,
          lineEnd: 4,
          section: 'Figure 1c legend',
        },
        {
          id: 'evidence-figure-2',
          sourceId: 'source-lee-2020-excerpts',
          lineStart: 7,
          lineEnd: 7,
          section: 'Figure 2 legend and methods',
        },
        {
          id: 'evidence-figure-3',
          sourceId: 'source-lee-2020-excerpts',
          lineStart: 10,
          lineEnd: 10,
          section: 'Figure 3 legend',
        },
        {
          id: 'evidence-figure-4bc',
          sourceId: 'source-lee-2020-excerpts',
          lineStart: 13,
          lineEnd: 13,
          section: 'Figure 4b/c legend',
        },
        {
          id: 'evidence-figure-4d',
          sourceId: 'source-lee-2020-excerpts',
          lineStart: 16,
          lineEnd: 16,
          section: 'Figure 4d legend and methods',
        },
        {
          id: 'evidence-figure-5',
          sourceId: 'source-lee-2020-excerpts',
          lineStart: 19,
          lineEnd: 19,
          section: 'Figure 5 legend',
        },
        {
          id: 'evidence-scrna-methods',
          sourceId: 'source-lee-2020-excerpts',
          lineStart: 22,
          lineEnd: 22,
          section: 'scRNA-seq methods',
        },
        {
          id: 'evidence-data-availability',
          sourceId: 'source-lee-2020-excerpts',
          lineStart: 25,
          lineEnd: 25,
          section: 'Data availability',
        },
      ],
    });
    if (result.status !== 'ready' || !result.receipt) {
      throw new Error(`Fixture source indexing failed: ${JSON.stringify(result.issues)}`);
    }
    return result.receipt;
  };

  const validateFixtureMap = () =>
    validatePaperReproductionMap(root, {
      mapPath: PAPER_REPRODUCTION_MAP_PATH,
      sourceReceipts: [indexFixtureSource()],
    });

  it('validates the compact map and retains every requested figure target', () => {
    const result = validateFixtureMap();
    const map = readMap();

    expect(result.status).toBe('ready');
    expect(map.figures.map((figure) => figure.label)).toEqual([
      'Figure 1',
      'Figure 2',
      'Figure 3',
      'Figure 4',
      'Figure 5',
    ]);
    expect(map.panels.map((panel) => panel.label)).toEqual([
      'Figure 1c',
      'Figure 2a-f',
      'Figure 3a-e',
      'Figure 4b/c',
      'Figure 4d',
      'Figure 5a-c/e',
      'Figure 5d',
    ]);
    expect(fs.existsSync(path.join(root, 'case_reproduction/planning/paper_target_inventory.json'))).toBe(true);
    const inventory = JSON.parse(
      fs.readFileSync(path.join(root, 'case_reproduction/planning/paper_target_inventory.json'), 'utf8')
    ) as { targets: Array<{ evidenceId: string; concepts: string[] }> };
    expect(inventory.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evidenceId: 'evidence-figure-4d', concepts: expect.arrayContaining(['survival']) }),
      ])
    );
  });

  it('rejects a mapped figure that silently drops an indexed survival analysis', () => {
    const map = readMap();
    map.claims.find((claim) => claim.id === 'claim-4d-survival')!.text =
      'SPP1 and CD68 expression patterns were summarized in a bulk cohort.';
    map.methodUnits.find((method) => method.id === 'method-tcga-survival-cms')!.reportedMethod =
      'Bulk expression groups and CMS association summary.';
    map.expectedOutputs.find((output) => output.id === 'output-4d-survival')!.label =
      'TCGA SPP1/CD68 expression and CMS comparison';
    map.dataDependencies.find((dependency) => dependency.id === 'dependency-tcga-expression-clinical')!.label =
      'TCGA COAD/READ expression, CMS, stage, and follow-up';
    for (const decision of map.scopeDecisions) {
      decision.reason = decision.reason.replace(/survival|kaplan.?meier|log.?rank/giu, 'clinical outcome');
    }
    fs.writeFileSync(path.join(root, PAPER_REPRODUCTION_MAP_PATH), `${JSON.stringify(map, null, 2)}\n`);

    const result = validateFixtureMap();

    expect(result.status).toBe('needs_completion');
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'coverage-concept-target-evidence-figure-4d-survival' })])
    );
  });

  it('classifies paper cohorts by their actual dataset dependencies', () => {
    const map = readMap();
    const cohorts = new Map(map.cohorts.map((cohort) => [cohort.id, cohort.datasetIds]));

    expect(cohorts.get('cohort-smc')).toEqual(['GSE132465', 'GSE132257']);
    expect(cohorts.get('cohort-kul3')).toContain('GSE144735');
    expect(cohorts.get('cohort-tcga-crc')).toEqual(['TCGA-COAD', 'TCGA-READ', 'Broad-GDAC-Firehose']);
  });

  it('distinguishes available, partial, and missing dependencies', () => {
    const map = readMap();
    const support = new Map(map.dataDependencies.map((dependency) => [dependency.id, dependency.localSupport]));

    expect(support.get('dependency-smc-scrna')).toBe('available');
    expect(support.get('dependency-multicancer-cd8')).toBe('partial');
    expect(support.get('dependency-tcga-expression-clinical')).toBe('missing');
  });

  it('keeps exact, analogous, and scoped classifications separate', () => {
    const map = readMap();
    const decisionFor = (targetId: string) =>
      map.scopeDecisions.find((decision) => decision.targetIds.includes(targetId));

    expect(decisionFor('panel-4d')).toMatchObject({
      reproductionMode: 'exact',
      status: 'external_data_block',
    });
    expect(decisionFor('panel-5d')).toMatchObject({ reproductionMode: 'analogous', status: 'conditional' });
    expect(decisionFor('panel-3-all')).toMatchObject({
      reproductionMode: 'scoped_reimplementation',
      status: 'ready',
    });
  });

  it('treats MF1 through MF4 as myofibroblast phenotypes rather than NMF', () => {
    const map = readMap();
    const stromalMethod = map.methodUnits.find((method) => method.id === 'method-stromal-subclustering-deg');
    const methodText = map.methodUnits.map((method) => `${method.analysisFamily} ${method.reportedMethod}`).join('\n');

    expect(stromalMethod?.reportedMethod).toContain('MF1, MF2, MF3, and MF4 phenotypes');
    expect(methodText).not.toMatch(/\bNMF\b|non-negative matrix factorization/iu);
  });

  it('rejects a map that silently drops one expected output from scope', () => {
    const map = readMap();
    map.scopeDecisions = map.scopeDecisions.filter((decision) => !decision.targetIds.includes('output-5d-cd8-scores'));
    fs.writeFileSync(path.join(root, PAPER_REPRODUCTION_MAP_PATH), `${JSON.stringify(map, null, 2)}\n`);

    const result = validateFixtureMap();

    expect(result.status).toBe('needs_completion');
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'scope-cardinality-output-5d-cd8-scores' })])
    );
  });

  it('derives a hierarchical execution contract in one bounded repair loop', () => {
    const mapResult = validateFixtureMap();
    if (mapResult.status !== 'ready' || !mapResult.receipt) throw new Error('Expected a ready paper map receipt.');
    const scopeResult = validateReproductionScope(root, {
      mapPath: PAPER_REPRODUCTION_MAP_PATH,
      paperMapReceipt: mapResult.receipt,
    });
    if (scopeResult.status !== 'ready' || !scopeResult.receipt) throw new Error('Expected a ready scope receipt.');
    const planningReceipt = {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: 'planning-ready',
      producer: 'bio_reproduction',
      action: 'validate_reproduction_plan',
      status: 'ready',
      projectRoot: root,
      createdAt: Date.now(),
      methodParameterReceiptId: 'method-ready',
      skillUses: [],
    };
    const payload = {
      contractVersion: 2,
      objective: 'Reproduce the mapped human CRC panels with explicit cohort and lineage boundaries.',
      datasetIds: ['GSE132465', 'GSE144735'],
      planningReceipt,
      paperMapReceipt: mapResult.receipt,
      scopeReceipt: scopeResult.receipt,
    };

    const first = prepareExecutionContract(root, payload) as Record<string, unknown>;
    expect(first.status).toBe('needs_completion');
    const canonicalContent = (first.nextActions as Array<{ payload?: { canonicalContent?: unknown } }>)[0]?.payload
      ?.canonicalContent;
    expect(canonicalContent).toBeDefined();
    const contractPath = path.join(root, 'case_reproduction/execution/execution_contract.json');
    fs.mkdirSync(path.dirname(contractPath), { recursive: true });
    fs.writeFileSync(contractPath, `${JSON.stringify(canonicalContent, null, 2)}\n`, 'utf8');

    const completed = prepareExecutionContract(root, payload) as Record<string, unknown>;
    expect(completed.status).toBe('ready');
    expect(completed.nextActions).toEqual([]);
    const contract = completed.canonicalContent as {
      schema: string;
      modules: Array<{ panelIds: string[]; cohortIds: string[]; analysisFamilies: string[] }>;
    };
    expect(contract.schema).toBe('openbioscience.scrna_reproduction.execution_contract.v2');
    expect(contract.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ panelIds: expect.arrayContaining(['panel-4bc']) }),
        expect.objectContaining({ cohortIds: expect.arrayContaining(['cohort-tcga-crc']) }),
      ])
    );
    expect(contract.modules.every((module) => module.analysisFamilies.length > 0)).toBe(true);
  });
});
