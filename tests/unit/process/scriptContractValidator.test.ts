import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { preflightExecutionScripts } from '@/process/resources/builtinMcp/bio/reproduction/scriptPreflight';
import {
  FIRST_PARTY_SKILL_REQUIREMENTS,
  validateSkillCompliance,
  type FirstPartySkillId,
} from '@/process/resources/builtinMcp/bio/reproduction/skillContract';

const sha256 = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');

describe('analysis script preflight', () => {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-script-preflight-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const write = (candidate: string, content: string) => {
    const target = path.join(root, candidate);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
    return { path: candidate, contentHash: sha256(content) };
  };

  const skillReceipt = (skillId: FirstPartySkillId) => {
    const sourcePath = path.resolve(FIRST_PARTY_SKILL_REQUIREMENTS[skillId].sourcePath);
    const skillContent = fs.readFileSync(sourcePath, 'utf8');
    const result = validateSkillCompliance(root, {
      skillId,
      skillContent,
      sourcePath,
      satisfiedRequirementIds: FIRST_PARTY_SKILL_REQUIREMENTS[skillId].requirements.map(
        (requirement) => requirement.id
      ),
    });
    if (!result.skillComplianceReceipt) throw new Error(`Missing Skill receipt for ${skillId}`);
    return { receipt: result.skillComplianceReceipt, content: skillContent };
  };

  const payload = (scriptContent: string) => {
    const contract = write(
      'execution/execution_contract.json',
      `${JSON.stringify({
        schema: 'openbioscience.scrna_reproduction.execution_contract.v1',
        annotationMode: 'independent_annotation',
        modules: [{ id: 'major_annotation', required: true, expectedOutputs: [] }],
      })}\n`
    );
    const method = write('planning/method_parameter_contract.json', '{"schema":"method"}\n');
    const script = write('execution/scripts/annotation.py', scriptContent);
    const skillIds: FirstPartySkillId[] = [
      'bio-scrna-reproduction',
      'bio-analysis-script-authoring',
      'bio-cell-annotation',
    ];
    const skillEntries = skillIds.map(skillReceipt);
    return {
      executionContractReceipt: {
        schema: 'openbioscience.bio.receipt.v1',
        receiptId: 'execution-contract',
        producer: 'bio_reproduction',
        action: 'prepare_execution_contract',
        status: 'ready',
        projectRoot: root,
        createdAt: Date.now(),
        canonicalFile: contract,
        annotationMode: 'independent_annotation',
        requiredModules: ['major_annotation'],
        nextActions: [],
      },
      methodParameterReceipt: {
        schema: 'openbioscience.bio.receipt.v1',
        receiptId: 'method-contract',
        producer: 'bio_reproduction',
        action: 'extract_method_parameters',
        status: 'ready',
        projectRoot: root,
        createdAt: Date.now(),
        canonicalFile: method,
        nextActions: [],
      },
      scripts: [{ path: script.path, moduleIds: ['major_annotation'] }],
      skillComplianceReceipts: skillEntries.map((entry) => entry.receipt),
      skillContents: Object.fromEntries(skillIds.map((skillId, index) => [skillId, skillEntries[index].content])),
    };
  };

  const validScript = `# Module ID: major_annotation
# EnvironmentRef: sc-py-singlecell
# Inputs: data/counts.tsv
# Outputs: execution/results/tables/annotation.manifest.json
# Run command: python execution/scripts/annotation.py
# Assumptions: human CRC raw counts and frozen de novo clusters
# OpenBioScience-Parameters: none
# OpenBioScience-Label-Isolation: imported labels hidden until assignments are frozen

OUTPUT_SCHEMA = 'openbioscience.analysis_script.outputs.v1'
print(OUTPUT_SCHEMA)
`;

  it('accepts a contract-complete independent annotation script', () => {
    const result = preflightExecutionScripts(root, payload(validScript));

    expect(result.status).toBe('ready');
    expect(result.violations).toEqual([]);
  });

  it('rejects imported-label leakage before independent annotation freeze', () => {
    const result = preflightExecutionScripts(root, payload(`${validScript}\nlabels = adata.obs['Cell_type']\n`));

    expect(result.status).toBe('needs_completion');
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('reads imported labels before a declared post hoc concordance stage'),
      ])
    );
  });

  it('rejects a monolithic script without the required contract header', () => {
    const result = preflightExecutionScripts(
      root,
      payload("import scanpy as sc\nadata = sc.read_h5ad('input.h5ad')\nprint(adata)\n")
    );

    expect(result.status).toBe('needs_completion');
    expect(result.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('Contract header field is missing or unresolved')])
    );
  });
});
