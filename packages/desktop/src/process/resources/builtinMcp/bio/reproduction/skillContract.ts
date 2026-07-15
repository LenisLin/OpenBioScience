import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { BioNextAction, SkillComplianceReceipt } from '@/common/chat/science';

const BIO_RECEIPT_SCHEMA = 'openbioscience.bio.receipt.v1' as const;
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/u;

export const FIRST_PARTY_SKILL_IDS = [
  'bio-scrna-reproduction',
  'bio-cell-annotation',
  'bio-scrna-differential-expression',
  'bio-scrna-plotting',
  'bio-analysis-script-authoring',
] as const;

export type FirstPartySkillId = (typeof FIRST_PARTY_SKILL_IDS)[number];

type SkillRequirement = { id: string; description: string };
type FirstPartySkillContract = { sourcePath: string; requirements: readonly SkillRequirement[] };

export const FIRST_PARTY_SKILL_REQUIREMENTS = {
  'bio-scrna-reproduction': {
    sourcePath: 'resources/skills/bio-scrna-reproduction/SKILL.md',
    requirements: [
      {
        id: 'reproduction.method_parameter_gate',
        description: 'Use the current method-parameter contract before authoring execution scripts.',
      },
      {
        id: 'reproduction.execution_contract_gate',
        description: 'Use the current execution contract and only its required modules.',
      },
      {
        id: 'reproduction.receipt_boundaries',
        description: 'Keep planning, execution, statistics, and completion receipts distinct and current.',
      },
    ],
  },
  'bio-cell-annotation': {
    sourcePath: 'resources/skills/bio-cell-annotation/SKILL.md',
    requirements: [
      {
        id: 'annotation.mode_declared',
        description: 'Declare independent annotation, reference review, or label transfer.',
      },
      {
        id: 'annotation.independent_label_isolation',
        description: 'Hide imported labels until independent assignments are frozen.',
      },
      {
        id: 'annotation.evidence_and_uncertainty',
        description: 'Emit marker evidence, confidence, ambiguity, and unresolved labels.',
      },
    ],
  },
  'bio-scrna-differential-expression': {
    sourcePath: 'resources/skills/bio-scrna-differential-expression/SKILL.md',
    requirements: [
      {
        id: 'de.raw_pseudobulk_counts',
        description: 'Use raw integer counts aggregated by biological replicate and cell type.',
      },
      {
        id: 'de.design_receipt_before_execution',
        description: 'Require a current bio_statistics design receipt before executable DE code.',
      },
      {
        id: 'de.blocked_contrasts_preserved',
        description: 'Preserve insufficient or invalid contrasts without substitute cell-level inference.',
      },
      {
        id: 'de.edger_ql_output_contract',
        description: 'Emit the declared edgeR quasi-likelihood outputs and completion receipt.',
      },
    ],
  },
  'bio-scrna-plotting': {
    sourcePath: 'resources/skills/bio-scrna-plotting/SKILL.md',
    requirements: [
      {
        id: 'plotting.source_artifact_per_panel',
        description: 'Link every panel to a concrete source artifact and variable.',
      },
      {
        id: 'plotting.layer_and_transformation_declared',
        description: 'Declare the expression layer and transformation for expression panels.',
      },
      {
        id: 'plotting.panel_manifest_and_config',
        description: 'Emit a panel manifest, plotting config or code, figures, and logs.',
      },
    ],
  },
  'bio-analysis-script-authoring': {
    sourcePath: 'resources/skills/bio-analysis-script-authoring/SKILL.md',
    requirements: [
      {
        id: 'script.contract_header',
        description: 'Declare module, environment, inputs, outputs, run command, and assumptions.',
      },
      {
        id: 'script.method_parameters_declared',
        description: 'Declare OpenBioScience parameters and emit the executed-parameter manifest.',
      },
      {
        id: 'script.project_relative_io',
        description: 'Use project-relative inputs and the fixed execution output tree.',
      },
      {
        id: 'script.no_install_or_download',
        description: 'Do not install packages, clone code, or download data at runtime.',
      },
      {
        id: 'script.module_result_and_output_manifest',
        description: 'Emit machine-readable module results and output manifests.',
      },
    ],
  },
} as const satisfies Record<FirstPartySkillId, FirstPartySkillContract>;

export const skillCompliancePayloadSchema = z
  .object({
    skillId: z.enum(FIRST_PARTY_SKILL_IDS),
    skillContent: z.string().min(1),
    skillContentHash: z.string().regex(CONTENT_HASH_PATTERN).optional(),
    sourcePath: z.string().min(1).optional(),
    satisfiedRequirementIds: z.array(z.string().min(1)),
  })
  .strict();

export const skillComplianceReceiptSchema = z
  .object({
    schema: z.literal(BIO_RECEIPT_SCHEMA),
    receiptId: z.string().min(1),
    producer: z.literal('bio_reproduction'),
    action: z.literal('validate_skill_compliance'),
    status: z.string().min(1),
    projectRoot: z.string().min(1),
    createdAt: z.number(),
    skillId: z.enum(FIRST_PARTY_SKILL_IDS),
    skillContentHash: z.string().regex(CONTENT_HASH_PATTERN),
    requirementIds: z.array(z.string().min(1)),
    satisfiedRequirementIds: z.array(z.string().min(1)),
    violations: z.array(z.string()),
    nextActions: z.array(z.unknown()),
  })
  .passthrough();

export const computeSkillContentHash = (content: string | Buffer): string =>
  crypto.createHash('sha256').update(content).digest('hex');

const stableJson = (value: unknown): string => {
  const stable = (nested: unknown): unknown => {
    if (Array.isArray(nested)) return nested.map(stable);
    if (!nested || typeof nested !== 'object') return nested;
    return Object.fromEntries(
      Object.entries(nested as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)])
    );
  };
  return JSON.stringify(stable(value));
};

const boundedAction = (
  skillId: FirstPartySkillId,
  skillContentHash: string,
  requirementIds: string[],
  reason: string
): BioNextAction => ({
  id: `complete-${skillId}-requirements`,
  tool: 'bio_reproduction',
  action: 'validate_skill_compliance',
  reason,
  payload: { skillId, skillContentHash, requirementIds },
  actionFingerprint: computeSkillContentHash(stableJson({ skillId, skillContentHash, requirementIds, reason })),
  preconditionHash: skillContentHash,
  expectedMutation: ['skillComplianceReceipt'],
  maxAttempts: 1,
  stopWhenUnchanged: true,
});

export const validateSkillComplianceReceipt = (
  receipt: unknown,
  currentSkillContent: string | Buffer
): { valid: boolean; violations: string[] } => {
  const parsed = skillComplianceReceiptSchema.safeParse(receipt);
  if (!parsed.success)
    return { valid: false, violations: ['Skill compliance receipt does not match the shared contract.'] };

  const value = parsed.data;
  const contract = FIRST_PARTY_SKILL_REQUIREMENTS[value.skillId];
  const expectedRequirementIds = contract.requirements.map((requirement) => requirement.id);
  const violations: string[] = [];
  if (value.skillContentHash !== computeSkillContentHash(currentSkillContent)) {
    violations.push(`Skill content changed after compliance validation: ${value.skillId}.`);
  }
  if (stableJson(value.requirementIds.toSorted()) !== stableJson(expectedRequirementIds.toSorted())) {
    violations.push(`Skill requirement set is stale or incomplete: ${value.skillId}.`);
  }
  const satisfied = new Set(value.satisfiedRequirementIds);
  const missing = expectedRequirementIds.filter((requirementId) => !satisfied.has(requirementId));
  if (missing.length) violations.push(`Unsatisfied Skill requirements for ${value.skillId}: ${missing.join(', ')}.`);
  if (value.status !== 'ready' || value.violations.length || value.nextActions.length) {
    violations.push(`Skill compliance receipt is not ready: ${value.skillId}.`);
  }
  return { valid: violations.length === 0, violations };
};

export const resolveFirstPartySkillContent = (
  skillId: FirstPartySkillId,
  explicitPath?: string
): { path?: string; content?: string } => {
  const configuredRoot = process.env.OPENBIOSCIENCE_SKILLS_ROOT;
  const candidates = [
    explicitPath,
    configuredRoot ? path.join(configuredRoot, skillId, 'SKILL.md') : undefined,
    path.resolve(process.cwd(), FIRST_PARTY_SKILL_REQUIREMENTS[skillId].sourcePath),
    path.join('/data/builtin-skills', skillId, 'SKILL.md'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    return { path: candidate, content: fs.readFileSync(candidate, 'utf8') };
  }
  return {};
};

export const validateSkillCompliance = (
  projectRoot: string,
  payload: unknown
): {
  status: 'ready' | 'needs_completion';
  skillComplianceReceipt?: SkillComplianceReceipt;
  violations: string[];
  nextActions: BioNextAction[];
} => {
  const parsed = skillCompliancePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`)
      .join(' ');
    return {
      status: 'needs_completion',
      violations: [reason],
      nextActions: [
        boundedAction(
          'bio-analysis-script-authoring',
          computeSkillContentHash('invalid-skill-compliance-payload'),
          FIRST_PARTY_SKILL_REQUIREMENTS['bio-analysis-script-authoring'].requirements.map(
            (requirement) => requirement.id
          ),
          reason
        ),
      ],
    };
  }

  const input = parsed.data;
  const contract = FIRST_PARTY_SKILL_REQUIREMENTS[input.skillId];
  const requirementIds: string[] = contract.requirements.map((requirement) => requirement.id);
  const contentHash = computeSkillContentHash(input.skillContent);
  const declared = new Set(input.satisfiedRequirementIds);
  const violations: string[] = [];
  if (input.skillContentHash && input.skillContentHash !== contentHash) {
    violations.push(`Declared Skill content hash does not match current content: ${input.skillId}.`);
  }
  const unknown = input.satisfiedRequirementIds.filter((requirementId) => !requirementIds.includes(requirementId));
  if (unknown.length) violations.push(`Unknown Skill requirement IDs for ${input.skillId}: ${unknown.join(', ')}.`);
  const missing = requirementIds.filter((requirementId) => !declared.has(requirementId));
  if (missing.length) violations.push(`Unsatisfied Skill requirements for ${input.skillId}: ${missing.join(', ')}.`);

  const satisfiedRequirementIds = requirementIds.filter((requirementId) => declared.has(requirementId));
  const nextActions = violations.length
    ? [boundedAction(input.skillId, contentHash, requirementIds, violations.join(' '))]
    : [];
  const details = {
    skillId: input.skillId,
    skillContentHash: contentHash,
    sourcePath: input.sourcePath || contract.sourcePath,
    requirementIds,
    satisfiedRequirementIds,
    violations,
  };
  const receiptId = `bio_receipt_${computeSkillContentHash(
    stableJson({ producer: 'bio_reproduction', action: 'validate_skill_compliance', projectRoot, details })
  ).slice(0, 20)}`;
  const skillComplianceReceipt: SkillComplianceReceipt = {
    schema: BIO_RECEIPT_SCHEMA,
    receiptId,
    producer: 'bio_reproduction',
    action: 'validate_skill_compliance',
    status: violations.length ? 'needs_completion' : 'ready',
    projectRoot,
    createdAt: Date.now(),
    validationFingerprint: computeSkillContentHash(stableJson(details)),
    skillId: input.skillId,
    skillContentHash: contentHash,
    requirementIds,
    satisfiedRequirementIds,
    violations,
    nextActions,
    details,
  };
  return {
    status: violations.length ? 'needs_completion' : 'ready',
    skillComplianceReceipt,
    violations,
    nextActions,
  };
};
