import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { BioNextAction, ScriptValidationReceipt, SkillComplianceReceipt } from '@/common/chat/science';
import {
  FIRST_PARTY_SKILL_REQUIREMENTS,
  resolveFirstPartySkillContent,
  skillComplianceReceiptSchema,
  validateSkillComplianceReceipt,
  type FirstPartySkillId,
} from './skillContract';

const BIO_RECEIPT_SCHEMA = 'openbioscience.bio.receipt.v1' as const;
const OUTPUT_MANIFEST_SCHEMA = 'openbioscience.analysis_script.outputs.v1' as const;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const REQUIRED_HEADER_FIELDS = [
  'moduleId',
  'environmentRef',
  'inputs',
  'outputs',
  'runCommand',
  'assumptions',
] as const;

const canonicalFileSchema = z.object({ path: z.string().min(1), contentHash: z.string().min(1) }).strict();

const executionContractReceiptBaseSchema = z
  .object({
    schema: z.literal(BIO_RECEIPT_SCHEMA),
    receiptId: z.string().min(1),
    producer: z.literal('bio_reproduction'),
    action: z.literal('prepare_execution_contract'),
    status: z.string().min(1),
    projectRoot: z.string().min(1),
    createdAt: z.number(),
    canonicalFile: canonicalFileSchema,
    requiredModules: z.array(z.string().min(1)),
    nextActions: z.array(z.unknown()),
  })
  .passthrough();

const executionContractReceiptSchema = z.union([
  executionContractReceiptBaseSchema.extend({
    annotationMode: z.enum(['independent_annotation', 'reference_review', 'label_transfer']),
  }),
  executionContractReceiptBaseSchema.extend({
    contractVersion: z.literal(2),
    paperMapReceiptId: z.string().min(1),
    scopeReceiptId: z.string().min(1),
  }),
]);

const methodParameterReceiptSchema = z
  .object({
    schema: z.literal(BIO_RECEIPT_SCHEMA),
    receiptId: z.string().min(1),
    producer: z.literal('bio_reproduction'),
    action: z.literal('extract_method_parameters'),
    status: z.string().min(1),
    projectRoot: z.string().min(1),
    createdAt: z.number(),
    canonicalFile: canonicalFileSchema,
    nextActions: z.array(z.unknown()),
  })
  .passthrough();

export const statisticalDesignReceiptSchema = z
  .object({
    schema: z.literal(BIO_RECEIPT_SCHEMA),
    receiptId: z.string().min(1),
    producer: z.literal('bio_statistics'),
    action: z.literal('validate_de_design'),
    status: z.string().min(1),
    projectRoot: z.string().min(1),
    createdAt: z.number(),
    analysisKind: z.literal('pseudobulk_de'),
    replicateUnit: z.string().min(1),
    formula: z.string().min(1),
    minimumReplicates: z.literal(3),
    contrasts: z.array(
      z
        .object({
          id: z.string().min(1),
          target: z.string().min(1),
          reference: z.string().min(1),
          cellType: z.string().min(1),
          targetReplicates: z.number().int().nonnegative(),
          referenceReplicates: z.number().int().nonnegative(),
          completePairs: z.number().int().nonnegative().optional(),
          status: z.enum(['ready', 'blocked']),
          warnings: z.array(z.string()),
        })
        .strict()
    ),
    nextActions: z.array(z.unknown()),
  })
  .passthrough();

const scriptInputSchema = z.union([
  z.string().min(1),
  z
    .object({
      path: z.string().min(1),
      moduleIds: z.array(z.string().min(1)).optional(),
      outputManifestPaths: z.array(z.string().min(1)).optional(),
    })
    .strict(),
]);

export const scriptPreflightPayloadSchema = z
  .object({
    executionContractReceipt: executionContractReceiptSchema,
    methodParameterReceipt: methodParameterReceiptSchema,
    scripts: z.array(scriptInputSchema).min(1).optional(),
    scriptPaths: z.array(z.string().min(1)).min(1).optional(),
    skillComplianceReceipts: z.array(skillComplianceReceiptSchema),
    statisticalDesignReceipts: z.array(statisticalDesignReceiptSchema).optional(),
    skillContents: z.record(z.string()).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.scripts?.length && !value.scriptPaths?.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scripts'],
        message: 'At least one execution script is required.',
      });
    }
  });

type ScriptInput = z.infer<typeof scriptInputSchema>;
type ParsedPayload = z.infer<typeof scriptPreflightPayloadSchema>;
type HeaderField = (typeof REQUIRED_HEADER_FIELDS)[number];
type ParsedHeader = Record<HeaderField, string> & { parameters?: string; labelIsolation?: string };

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

const stableJson = (value: unknown): string => JSON.stringify(stableValue(value));

const resolveProjectFile = (projectRoot: string, candidate: string): { path?: string; issue?: string } => {
  if (path.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/u.test(candidate)) {
    return { issue: `Path must be project-relative: ${candidate}` };
  }
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    return { issue: `Path escapes project root: ${candidate}` };
  if (!fs.existsSync(resolved)) return { issue: `Required file is missing: ${candidate}` };
  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(resolved);
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    return { issue: `Path resolves outside project root: ${candidate}` };
  }
  if (!fs.statSync(realFile).isFile()) return { issue: `Required path is not a file: ${candidate}` };
  return { path: realFile };
};

const currentFileMatches = (
  projectRoot: string,
  file: { path: string; contentHash: string },
  label: string
): string | undefined => {
  const resolved = resolveProjectFile(projectRoot, file.path);
  if (!resolved.path) return `${label}: ${resolved.issue}`;
  if (!HASH_PATTERN.test(file.contentHash) || sha256(fs.readFileSync(resolved.path)) !== file.contentHash) {
    return `${label} content hash is stale: ${file.path}`;
  }
  return undefined;
};

const executionContractMetadata = (
  projectRoot: string,
  file: { path: string; contentHash: string }
): { independentAnnotationModules: Set<string>; analysisFamilies: Set<string> } => {
  const resolved = resolveProjectFile(projectRoot, file.path);
  if (!resolved.path) return { independentAnnotationModules: new Set(), analysisFamilies: new Set() };
  try {
    const value = JSON.parse(fs.readFileSync(resolved.path, 'utf8')) as { modules?: unknown[] };
    const modules = Array.isArray(value.modules) ? value.modules : [];
    const independentAnnotationModules = new Set<string>();
    const analysisFamilies = new Set<string>();
    for (const module of modules) {
      if (!module || typeof module !== 'object' || Array.isArray(module)) continue;
      const record = module as Record<string, unknown>;
      const moduleId = typeof record.id === 'string' ? record.id : '';
      if (moduleId && record.annotationMode === 'independent_annotation') independentAnnotationModules.add(moduleId);
      if (Array.isArray(record.analysisFamilies)) {
        for (const family of record.analysisFamilies) if (typeof family === 'string') analysisFamilies.add(family);
      }
    }
    return { independentAnnotationModules, analysisFamilies };
  } catch {
    return { independentAnnotationModules: new Set(), analysisFamilies: new Set() };
  }
};

const commentPrefix = /^\s*(?:#!|#|\/\/|--|\/\*+|\*+|\*\/)/u;

const headerCommentText = (content: string): string => {
  const lines: string[] = [];
  let inBlock = false;
  for (const rawLine of content.split(/\r?\n/u).slice(0, 120)) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    if (inBlock) {
      lines.push(
        trimmed
          .replace(/^\*\s?/u, '')
          .replace(/\*\/$/u, '')
          .trim()
      );
      if (trimmed.includes('*/')) inBlock = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      inBlock = !trimmed.includes('*/');
      lines.push(
        trimmed
          .replace(/^\/\*+\s?/u, '')
          .replace(/\*\/$/u, '')
          .trim()
      );
      continue;
    }
    if (commentPrefix.test(trimmed)) {
      lines.push(trimmed.replace(/^\s*(?:#!|#|\/\/|--)\s?/u, ''));
      continue;
    }
    break;
  }
  return lines.join('\n');
};

const parseHeader = (content: string): { header: Partial<ParsedHeader>; violations: string[] } => {
  const text = headerCommentText(content);
  const aliases: Record<HeaderField, RegExp> = {
    moduleId: /^Module IDs?:\s*(.+)$/imu,
    environmentRef: /^EnvironmentRef:\s*(.+)$/imu,
    inputs: /^Inputs:\s*(.+)$/imu,
    outputs: /^Outputs:\s*(.+)$/imu,
    runCommand: /^Run command:\s*(.+)$/imu,
    assumptions: /^Assumptions:\s*(.+)$/imu,
  };
  const header: Partial<ParsedHeader> = {};
  const violations: string[] = [];
  for (const field of REQUIRED_HEADER_FIELDS) {
    const value = aliases[field].exec(text)?.[1]?.trim();
    if (!value || /^(?:tbd|todo|unknown|\.\.\.)$/iu.test(value)) {
      violations.push(`Contract header field is missing or unresolved: ${field}.`);
    } else {
      header[field] = value;
    }
  }
  header.parameters = /^OpenBioScience-Parameters:\s*(.+)$/imu.exec(text)?.[1]?.trim();
  header.labelIsolation = /^(?:OpenBioScience-Label-Isolation|Independent annotation labels):\s*(.+)$/imu
    .exec(text)?.[1]
    ?.trim();
  if (!header.parameters) violations.push('Contract header is missing OpenBioScience-Parameters.');
  return { header, violations };
};

const listValues = (value: string | undefined): string[] => {
  if (!value) return [];
  const trimmed = value.trim().replace(/^\[/u, '').replace(/\]$/u, '');
  if (/^(?:none|n\/a|not_applicable)$/iu.test(trimmed)) return [];
  return trimmed
    .split(/[,;]/u)
    .map((item) => item.trim().replace(/^['"]|['"]$/gu, ''))
    .filter(Boolean);
};

const declaredPath = (value: string): string => {
  const assignment = /^[A-Za-z][A-Za-z0-9_-]*\s*=\s*(.+)$/u.exec(value);
  return (assignment?.[1] || value).trim();
};

const projectRelativePathIssue = (candidate: string, output: boolean): string | undefined => {
  const value = declaredPath(candidate).replaceAll('\\', '/');
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return `Network IO is not project-relative: ${candidate}`;
  if (value.startsWith('/') || /^[A-Za-z]:\//u.test(value)) return `IO path must be project-relative: ${candidate}`;
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../')) return `IO path escapes the project: ${candidate}`;
  if (output && !/^execution\/(?:results\/(?:objects|tables|figures)|logs)\//u.test(normalized)) {
    return `Output must be under execution/results/{objects,tables,figures} or execution/logs: ${candidate}`;
  }
  return undefined;
};

const prohibitedBehavior = (content: string): string[] => {
  const patterns: Array<[string, RegExp]> = [
    ['Python package installation', /(?:^|\s)(?:python\s+-m\s+)?pip(?:3)?\s+install\b/imu],
    ['Conda or Mamba package installation', /(?:^|\s)(?:conda|mamba|micromamba)\s+install\b/imu],
    ['R package installation', /\b(?:install\.packages|BiocManager::install|remotes::install_[A-Za-z_]+)\s*\(/u],
    ['system package installation', /(?:^|\s)(?:apt(?:-get)?|yum|dnf|brew)\s+install\b/imu],
    ['repository cloning', /(?:^|\s)git\s+clone\b/imu],
    ['command-line download', /(?:^|\s)(?:curl|wget)\s+[^\n]+/imu],
    ['runtime HTTP download', /\b(?:requests\.(?:get|post)|urlretrieve|download\.file)\s*\(/u],
    ['network URL', /https?:\/\//iu],
  ];
  return patterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([label]) => `Prohibited script behavior: ${label}.`);
};

const absoluteLiteralViolations = (content: string): string[] => {
  const values = [...content.matchAll(/['"](\/(?!\/)[^'"\r\n]+|[A-Za-z]:[\\/][^'"\r\n]+)['"]/gu)].map(
    (match) => match[1]
  );
  return [...new Set(values)].map((value) => `Script contains a deployment-specific absolute path: ${value}`);
};

const annotationIsolationViolations = (
  content: string,
  header: Partial<ParsedHeader>,
  requiresIsolation: boolean
): string[] => {
  if (!requiresIsolation) return [];
  const importedLabelPattern =
    /\b(?:Cell_type|Cell_subtype|cell_type|cell_subtype|author_annotation|original_label|imported_label)\b/iu;
  const unsafeLines = content
    .split(/\r?\n/u)
    .filter((line) => importedLabelPattern.test(line))
    .filter((line) => !/drop|delete|remove|mask|hide|exclude|post.?hoc|concordance|confusion/iu.test(line))
    .filter((line) => !/OpenBioScience-Label-Isolation|Independent annotation labels/iu.test(line));
  const declaredIsolated = Boolean(
    header.labelIsolation && /isolat|hidden|masked|excluded|enforced/iu.test(header.labelIsolation)
  );
  const violations: string[] = [];
  if (!declaredIsolated) {
    violations.push('Independent annotation scripts must declare imported-label isolation in the contract header.');
  }
  if (unsafeLines.length) {
    violations.push(
      'Independent annotation script reads imported labels before a declared post hoc concordance stage.'
    );
  }
  return violations;
};

const requiredSkillIds = (moduleIds: Set<string>, analysisFamilies: Set<string>): FirstPartySkillId[] => {
  const skillIds: FirstPartySkillId[] = ['bio-scrna-reproduction', 'bio-analysis-script-authoring'];
  const familyText = [...analysisFamilies].join(' ').toLowerCase();
  if (
    moduleIds.has('major_annotation') ||
    moduleIds.has('minor_annotation') ||
    /annotation|subclustering|cell.?type|subtype/u.test(familyText)
  ) {
    skillIds.push('bio-cell-annotation');
  }
  if (moduleIds.has('condition_de') || /pseudobulk|condition.?de|differential|edger/u.test(familyText)) {
    skillIds.push('bio-scrna-differential-expression');
  }
  if (moduleIds.has('figures') || /plot|figure|visuali[sz]ation/u.test(familyText)) skillIds.push('bio-scrna-plotting');
  return skillIds;
};

const boundedAction = (
  id: string,
  tool: BioNextAction['tool'],
  action: string,
  reason: string,
  payload: Record<string, unknown>,
  precondition: unknown,
  expectedMutation: string[]
): BioNextAction => ({
  id,
  tool,
  action,
  reason,
  payload,
  actionFingerprint: sha256(stableJson({ id, tool, action, reason, payload })),
  preconditionHash: sha256(stableJson(precondition)),
  expectedMutation,
  maxAttempts: 1,
  stopWhenUnchanged: true,
});

const normalizedScripts = (input: ParsedPayload): ScriptInput[] => input.scripts || input.scriptPaths || [];

export const preflightExecutionScripts = (
  projectRoot: string,
  payload: unknown
): {
  status: 'ready' | 'needs_completion';
  scriptValidationReceipt?: ScriptValidationReceipt;
  violations: string[];
  nextActions: BioNextAction[];
} => {
  const parsed = scriptPreflightPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const violations = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`);
    return {
      status: 'needs_completion',
      violations,
      nextActions: [
        boundedAction(
          'repair-script-preflight-payload',
          'bio_reproduction',
          'preflight_execution_scripts',
          violations.join(' '),
          {
            requiredFields: [
              'executionContractReceipt',
              'methodParameterReceipt',
              'scripts',
              'skillComplianceReceipts',
            ],
          },
          payload,
          ['scriptValidationReceipt']
        ),
      ],
    };
  }

  const input = parsed.data;
  const executionReceipt = input.executionContractReceipt;
  const methodReceipt = input.methodParameterReceipt;
  const contractViolations: string[] = [];
  const scriptViolations: string[] = [];
  const skillViolations: string[] = [];
  const statisticsViolations: string[] = [];
  if (path.resolve(executionReceipt.projectRoot) !== path.resolve(projectRoot)) {
    contractViolations.push('Execution contract receipt belongs to a different project root.');
  }
  if (executionReceipt.status !== 'ready' || executionReceipt.nextActions.length) {
    contractViolations.push('Execution contract receipt is not ready.');
  }
  const executionFileIssue = currentFileMatches(
    projectRoot,
    executionReceipt.canonicalFile as { path: string; contentHash: string },
    'Execution contract'
  );
  if (executionFileIssue) contractViolations.push(executionFileIssue);
  const contractMetadata = executionContractMetadata(
    projectRoot,
    executionReceipt.canonicalFile as { path: string; contentHash: string }
  );
  if ('annotationMode' in executionReceipt && executionReceipt.annotationMode === 'independent_annotation') {
    for (const moduleId of executionReceipt.requiredModules) {
      if (moduleId === 'major_annotation' || moduleId === 'minor_annotation') {
        contractMetadata.independentAnnotationModules.add(moduleId);
      }
    }
  }
  if (path.resolve(methodReceipt.projectRoot) !== path.resolve(projectRoot)) {
    contractViolations.push('Method-parameter receipt belongs to a different project root.');
  }
  if (methodReceipt.status !== 'ready' || methodReceipt.nextActions.length) {
    contractViolations.push('Method-parameter receipt is not ready.');
  }
  const methodFileIssue = currentFileMatches(
    projectRoot,
    methodReceipt.canonicalFile as { path: string; contentHash: string },
    'Method contract'
  );
  if (methodFileIssue) contractViolations.push(methodFileIssue);

  const requiredModules = new Set(executionReceipt.requiredModules);
  const coveredModules = new Set<string>();
  const scripts: ScriptValidationReceipt['scripts'] = [];
  for (const scriptInput of normalizedScripts(input)) {
    const descriptor = typeof scriptInput === 'string' ? { path: scriptInput } : scriptInput;
    const resolved = resolveProjectFile(projectRoot, descriptor.path);
    if (!resolved.path) {
      scriptViolations.push(`${descriptor.path}: ${resolved.issue}`);
      continue;
    }
    const content = fs.readFileSync(resolved.path, 'utf8');
    const parsedHeader = parseHeader(content);
    scriptViolations.push(...parsedHeader.violations.map((violation) => `${descriptor.path}: ${violation}`));
    const headerModuleIds = listValues(parsedHeader.header.moduleId);
    const declaredModuleIds = descriptor.moduleIds?.length ? descriptor.moduleIds : headerModuleIds;
    if (
      descriptor.moduleIds?.length &&
      stableJson(descriptor.moduleIds.toSorted()) !== stableJson(headerModuleIds.toSorted())
    ) {
      scriptViolations.push(`${descriptor.path}: descriptor module IDs do not match the contract header.`);
    }
    for (const moduleId of declaredModuleIds) {
      if (!requiredModules.has(moduleId)) {
        scriptViolations.push(`${descriptor.path}: module ${moduleId} is not required by the execution contract.`);
      } else {
        coveredModules.add(moduleId);
      }
    }
    if (!declaredModuleIds.length) scriptViolations.push(`${descriptor.path}: no module ID is declared.`);

    for (const candidate of listValues(parsedHeader.header.inputs)) {
      const issue = projectRelativePathIssue(candidate, false);
      if (issue) scriptViolations.push(`${descriptor.path}: ${issue}`);
    }
    const outputPaths = listValues(parsedHeader.header.outputs);
    for (const candidate of outputPaths) {
      const issue = projectRelativePathIssue(candidate, true);
      if (issue) scriptViolations.push(`${descriptor.path}: ${issue}`);
    }
    const outputManifestPaths = descriptor.outputManifestPaths?.length
      ? descriptor.outputManifestPaths
      : outputPaths.filter((candidate) => /manifest.*\.json$|\.manifest\.json$/iu.test(declaredPath(candidate)));
    if (!outputManifestPaths.length || !content.includes(OUTPUT_MANIFEST_SCHEMA)) {
      scriptViolations.push(
        `${descriptor.path}: script must declare an output manifest and write schema ${OUTPUT_MANIFEST_SCHEMA}.`
      );
    }
    for (const manifestPath of outputManifestPaths) {
      const issue = projectRelativePathIssue(manifestPath, true);
      if (issue) scriptViolations.push(`${descriptor.path}: ${issue}`);
    }
    const parameterIds = listValues(parsedHeader.header.parameters);
    if (
      parsedHeader.header.parameters &&
      !/^(?:none|n\/a|not_applicable)$/iu.test(parsedHeader.header.parameters) &&
      parameterIds.some((parameterId) => !/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(parameterId))
    ) {
      scriptViolations.push(`${descriptor.path}: OpenBioScience-Parameters contains an invalid parameter ID.`);
    }
    scriptViolations.push(...prohibitedBehavior(content).map((violation) => `${descriptor.path}: ${violation}`));
    scriptViolations.push(...absoluteLiteralViolations(content).map((violation) => `${descriptor.path}: ${violation}`));
    if (declaredModuleIds.some((moduleId) => contractMetadata.independentAnnotationModules.has(moduleId))) {
      scriptViolations.push(
        ...annotationIsolationViolations(content, parsedHeader.header, true).map(
          (violation) => `${descriptor.path}: ${violation}`
        )
      );
    }
    scripts.push({ path: descriptor.path, contentHash: sha256(content), moduleIds: declaredModuleIds.toSorted() });
  }

  const missingModules = [...requiredModules].filter((moduleId) => !coveredModules.has(moduleId)).sort();
  if (missingModules.length) {
    scriptViolations.push(`Required execution modules have no script contract: ${missingModules.join(', ')}.`);
  }

  const receiptsBySkill = new Map(
    input.skillComplianceReceipts.map((receipt) => [receipt.skillId, receipt as SkillComplianceReceipt])
  );
  for (const skillId of requiredSkillIds(requiredModules, contractMetadata.analysisFamilies)) {
    const receipt = receiptsBySkill.get(skillId);
    if (!receipt) {
      skillViolations.push(`Missing Skill compliance receipt: ${skillId}.`);
      continue;
    }
    if (path.resolve(receipt.projectRoot) !== path.resolve(projectRoot)) {
      skillViolations.push(`Skill compliance receipt belongs to a different project root: ${skillId}.`);
      continue;
    }
    const currentContent = input.skillContents?.[skillId] || resolveFirstPartySkillContent(skillId).content;
    if (!currentContent) {
      skillViolations.push(`Current Skill content is unavailable for hash validation: ${skillId}.`);
      continue;
    }
    const validation = validateSkillComplianceReceipt(receipt, currentContent);
    skillViolations.push(...validation.violations);
  }

  const statisticalDesignReceipts = input.statisticalDesignReceipts || [];
  const conditionDeRequired =
    requiredModules.has('condition_de') ||
    /pseudobulk|condition.?de|differential|edger/u.test([...contractMetadata.analysisFamilies].join(' ').toLowerCase());
  if (conditionDeRequired) {
    if (!statisticalDesignReceipts.length) {
      statisticsViolations.push('A current bio_statistics design receipt is required for condition_de.');
    }
    for (const receipt of statisticalDesignReceipts) {
      if (path.resolve(receipt.projectRoot) !== path.resolve(projectRoot)) {
        statisticsViolations.push(
          `Statistical design receipt belongs to a different project root: ${receipt.receiptId}.`
        );
      }
      if (receipt.status !== 'ready' || receipt.nextActions.length) {
        statisticsViolations.push(`Statistical design receipt is not ready: ${receipt.receiptId}.`);
      }
    }
  }

  const violations = [
    ...new Set([...contractViolations, ...scriptViolations, ...skillViolations, ...statisticsViolations]),
  ];
  const nextActions: BioNextAction[] = [];
  if (skillViolations.length) {
    nextActions.push(
      boundedAction(
        'validate-required-skill-compliance',
        'bio_reproduction',
        'validate_skill_compliance',
        [...new Set(skillViolations)].join(' '),
        { skillIds: requiredSkillIds(requiredModules, contractMetadata.analysisFamilies) },
        input.skillComplianceReceipts.map((receipt) => ({ skillId: receipt.skillId, hash: receipt.skillContentHash })),
        ['skillComplianceReceipts']
      )
    );
  }
  if (statisticsViolations.length) {
    nextActions.push(
      boundedAction(
        'validate-condition-de-design',
        'bio_statistics',
        'validate_de_design',
        [...new Set(statisticsViolations)].join(' '),
        { requiredModule: 'condition_de' },
        statisticalDesignReceipts,
        ['statisticalDesignReceipts']
      )
    );
  }
  if (contractViolations.length || scriptViolations.length) {
    nextActions.push(
      boundedAction(
        'repair-execution-script-contracts',
        'runtime',
        'patch_file',
        [...new Set([...contractViolations, ...scriptViolations])].join(' '),
        {
          paths: scripts.map((script) => script.path),
          violations: [...new Set([...contractViolations, ...scriptViolations])],
        },
        scripts,
        ['scripts', 'outputManifests']
      )
    );
  }

  const details = {
    executionContractReceiptId: executionReceipt.receiptId,
    methodParameterReceiptId: methodReceipt.receiptId,
    scripts: scripts.toSorted((left, right) => left.path.localeCompare(right.path)),
    skillComplianceReceiptIds: requiredSkillIds(requiredModules, contractMetadata.analysisFamilies)
      .map((skillId) => receiptsBySkill.get(skillId)?.receiptId)
      .filter((receiptId): receiptId is string => Boolean(receiptId))
      .sort(),
    statisticalDesignReceiptIds: statisticalDesignReceipts.map((receipt) => receipt.receiptId).sort(),
    violations,
  };
  const status = violations.length ? 'needs_completion' : 'ready';
  const scriptValidationReceipt: ScriptValidationReceipt = {
    schema: BIO_RECEIPT_SCHEMA,
    receiptId: `bio_receipt_${sha256(
      stableJson({ producer: 'bio_reproduction', action: 'preflight_execution_scripts', status, projectRoot, details })
    ).slice(0, 20)}`,
    producer: 'bio_reproduction',
    action: 'preflight_execution_scripts',
    status,
    projectRoot,
    createdAt: Date.now(),
    validationFingerprint: sha256(stableJson(details)),
    executionContractReceiptId: details.executionContractReceiptId,
    methodParameterReceiptId: details.methodParameterReceiptId,
    scripts: details.scripts,
    skillComplianceReceiptIds: details.skillComplianceReceiptIds,
    statisticalDesignReceiptIds: details.statisticalDesignReceiptIds,
    violations,
    nextActions,
    details,
  };
  return { status, scriptValidationReceipt, violations, nextActions };
};

export const handlePreflightExecutionScripts = preflightExecutionScripts;
export const preflightExecutionScriptsHandler = preflightExecutionScripts;

export const REQUIRED_FIRST_PARTY_SKILL_REQUIREMENT_IDS = Object.fromEntries(
  Object.entries(FIRST_PARTY_SKILL_REQUIREMENTS).map(([skillId, contract]) => [
    skillId,
    contract.requirements.map((requirement) => requirement.id),
  ])
);
