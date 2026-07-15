import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type {
  BioControlReceipt,
  BioNextAction,
  PaperEvidenceLocator,
  PaperReproductionMap,
  PaperReproductionMapReceipt,
  ReproductionScopeReceipt,
} from '@/common/chat/science';
import { publicHttpUrlStatus, resolveSafeProjectWritePath } from '../pathSafety';

const BIO_RECEIPT_SCHEMA = 'openbioscience.bio.receipt.v1' as const;
export const PAPER_REPRODUCTION_MAP_SCHEMA = 'openbioscience.paper_reproduction_map.v1' as const;
export const PAPER_REPRODUCTION_MAP_PATH = 'case_reproduction/planning/paper_reproduction_map.json' as const;
export const PAPER_TARGET_INVENTORY_PATH = 'case_reproduction/planning/paper_target_inventory.json' as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

const hash = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');

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
const fingerprint = (value: unknown): string => hash(stableJson(value));

const nonEmptyString = z.string().trim().min(1);
const sha256Schema = z.string().regex(SHA256_PATTERN, 'Expected a lowercase SHA-256 hash.');
const evidenceBasisSchema = z.enum(['explicit', 'cross_source_inference', 'agent_inference', 'unresolved']);
const reproductionModeSchema = z.enum(['exact', 'analogous', 'scoped_reimplementation']);
const scopeStatusSchema = z.enum([
  'required',
  'ready',
  'conditional',
  'external_data_block',
  'capability_block',
  'analogous_only',
  'excluded_by_user',
  'unresolved',
]);

const paperExcerptInputObjectSchema = z
  .object({
    id: nonEmptyString,
    sourceId: nonEmptyString,
    text: z.string().optional(),
    path: nonEmptyString.optional(),
    url: nonEmptyString.optional(),
    page: z.number().int().positive().optional(),
    lineStart: z.number().int().positive().optional(),
    lineEnd: z.number().int().positive().optional(),
    section: nonEmptyString.optional(),
    basis: evidenceBasisSchema.default('explicit'),
  })
  .strict();

const validateExcerptLineRange = (value: { lineStart?: number; lineEnd?: number }, context: z.RefinementCtx): void => {
  if ((value.lineStart === undefined) !== (value.lineEnd === undefined)) {
    context.addIssue({ code: 'custom', message: 'lineStart and lineEnd must be provided together.' });
  }
  if (value.lineStart !== undefined && value.lineEnd !== undefined && value.lineEnd < value.lineStart) {
    context.addIssue({ code: 'custom', message: 'lineEnd must be greater than or equal to lineStart.' });
  }
};

export const paperExcerptInputSchema = paperExcerptInputObjectSchema.superRefine(validateExcerptLineRange);

const nestedPaperExcerptInputSchema = paperExcerptInputObjectSchema
  .omit({ sourceId: true })
  .superRefine(validateExcerptLineRange);

export const paperSourceInputSchema = z
  .object({
    id: nonEmptyString,
    kind: nonEmptyString,
    path: nonEmptyString.optional(),
    url: nonEmptyString.optional(),
    content: z.string().optional(),
    excerpts: z.array(nestedPaperExcerptInputSchema).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Number(Boolean(value.path)) + Number(Boolean(value.url)) !== 1) {
      context.addIssue({ code: 'custom', message: 'Exactly one of path or url is required.' });
    }
    if (value.url && value.content === undefined) {
      context.addIssue({ code: 'custom', message: 'URL sources require content so their hash is reproducible.' });
    }
  });

export const indexPaperSourcesPayloadSchema = z
  .object({
    sources: z.array(paperSourceInputSchema).min(1),
    excerpts: z.array(paperExcerptInputSchema).optional(),
  })
  .strict();

const evidenceLocatorSchema = z
  .object({
    id: nonEmptyString,
    sourceId: nonEmptyString,
    sourceHash: sha256Schema,
    path: nonEmptyString.optional(),
    url: nonEmptyString.optional(),
    page: z.number().int().positive().optional(),
    lineStart: z.number().int().positive().optional(),
    lineEnd: z.number().int().positive().optional(),
    section: nonEmptyString.optional(),
    excerptHash: sha256Schema,
    basis: evidenceBasisSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.lineStart === undefined) !== (value.lineEnd === undefined)) {
      context.addIssue({ code: 'custom', message: 'lineStart and lineEnd must be provided together.' });
    }
    if (value.lineStart !== undefined && value.lineEnd !== undefined && value.lineEnd < value.lineStart) {
      context.addIssue({ code: 'custom', message: 'lineEnd must be greater than or equal to lineStart.' });
    }
  });

const targetBaseSchema = z.object({ id: nonEmptyString, evidenceIds: z.array(nonEmptyString) }).strict();

const figureSchema = targetBaseSchema
  .extend({ label: nonEmptyString, title: nonEmptyString, panelIds: z.array(nonEmptyString) })
  .strict();
const panelSchema = targetBaseSchema
  .extend({
    figureId: nonEmptyString,
    label: nonEmptyString,
    claimIds: z.array(nonEmptyString),
    cohortIds: z.array(nonEmptyString),
    methodUnitIds: z.array(nonEmptyString),
    dependencyIds: z.array(nonEmptyString),
    expectedOutputIds: z.array(nonEmptyString),
  })
  .strict();
const claimSchema = targetBaseSchema
  .extend({
    text: nonEmptyString,
    claimKind: z.enum(['descriptive', 'associational', 'inferential', 'methodological']),
  })
  .strict();
const cohortSchema = targetBaseSchema.extend({ label: nonEmptyString, datasetIds: z.array(nonEmptyString) }).strict();
const methodUnitSchema = targetBaseSchema
  .extend({
    analysisFamily: nonEmptyString,
    lineage: nonEmptyString.optional(),
    reportedMethod: nonEmptyString,
    parameterIds: z.array(nonEmptyString),
  })
  .strict();
const dataDependencySchema = targetBaseSchema
  .extend({
    label: nonEmptyString,
    cohortIds: z.array(nonEmptyString),
    modality: nonEmptyString,
    requiredFields: z.array(nonEmptyString),
    localSupport: z.enum(['available', 'partial', 'missing', 'unresolved']),
  })
  .strict();
const expectedOutputSchema = targetBaseSchema
  .extend({
    label: nonEmptyString,
    artifactKind: z.enum(['object', 'table', 'figure', 'report', 'statistical_result']),
  })
  .strict();

const scopeDecisionSchema = z
  .object({
    id: nonEmptyString,
    targetIds: z.array(nonEmptyString).min(1),
    reproductionMode: reproductionModeSchema,
    status: scopeStatusSchema,
    reason: nonEmptyString,
    userDecisionId: nonEmptyString.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'excluded_by_user' && !value.userDecisionId) {
      context.addIssue({
        code: 'custom',
        path: ['userDecisionId'],
        message: 'excluded_by_user requires userDecisionId.',
      });
    }
  });

export const paperReproductionMapSchema = z
  .object({
    schema: z.literal(PAPER_REPRODUCTION_MAP_SCHEMA),
    createdAt: nonEmptyString,
    sources: z.array(
      z
        .object({
          id: nonEmptyString,
          kind: nonEmptyString,
          path: nonEmptyString.optional(),
          url: nonEmptyString.optional(),
          contentHash: sha256Schema,
        })
        .strict()
        .superRefine((value, context) => {
          if (Number(Boolean(value.path)) + Number(Boolean(value.url)) !== 1) {
            context.addIssue({ code: 'custom', message: 'Exactly one of path or url is required.' });
          }
        })
    ),
    evidence: z.array(evidenceLocatorSchema),
    figures: z.array(figureSchema),
    panels: z.array(panelSchema),
    claims: z.array(claimSchema),
    cohorts: z.array(cohortSchema),
    methodUnits: z.array(methodUnitSchema),
    dataDependencies: z.array(dataDependencySchema),
    expectedOutputs: z.array(expectedOutputSchema),
    scopeDecisions: z.array(scopeDecisionSchema),
    conflicts: z.array(
      z
        .object({
          id: nonEmptyString,
          targetIds: z.array(nonEmptyString),
          evidenceIds: z.array(nonEmptyString),
          message: nonEmptyString,
          material: z.boolean(),
        })
        .strict()
    ),
    unresolvedItems: z.array(
      z
        .object({
          id: nonEmptyString,
          targetIds: z.array(nonEmptyString),
          message: nonEmptyString,
          nextAction: nonEmptyString.optional(),
        })
        .strict()
    ),
  })
  .strict();

const controlReceiptSchema = z
  .object({
    schema: z.literal(BIO_RECEIPT_SCHEMA),
    receiptId: nonEmptyString,
    producer: z.enum(['bio_source', 'bio_runtime', 'bio_reproduction', 'bio_statistics']),
    action: nonEmptyString,
    status: nonEmptyString,
    projectRoot: nonEmptyString,
    createdAt: z.number(),
    validationFingerprint: sha256Schema.optional(),
    details: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const indexedPaperSourceReceiptSchema = controlReceiptSchema
  .extend({
    producer: z.literal('bio_source'),
    action: z.literal('index_paper_sources'),
    status: z.literal('ready'),
    details: z
      .object({
        sources: paperReproductionMapSchema.shape.sources,
        evidence: z.array(evidenceLocatorSchema),
      })
      .passthrough(),
  })
  .passthrough();

export const paperReproductionMapReceiptSchema = controlReceiptSchema
  .extend({
    producer: z.literal('bio_reproduction'),
    action: z.literal('validate_paper_reproduction_map'),
    status: z.literal('ready'),
    canonicalFile: z.object({ path: z.literal(PAPER_REPRODUCTION_MAP_PATH), contentHash: sha256Schema }).strict(),
    sourceReceiptIds: z.array(nonEmptyString),
    targetIds: z.array(nonEmptyString),
    unresolvedTargetIds: z.array(nonEmptyString),
    nextActions: z.array(z.unknown()),
    details: z
      .object({
        sourceReceipts: z.array(indexedPaperSourceReceiptSchema).min(1),
      })
      .passthrough(),
  })
  .passthrough();

export const validatePaperReproductionMapPayloadSchema = z
  .object({
    mapPath: z.literal(PAPER_REPRODUCTION_MAP_PATH),
    sourceReceipts: z.array(indexedPaperSourceReceiptSchema).min(1),
  })
  .strict();

export const validateReproductionScopePayloadSchema = z
  .object({
    mapPath: z.literal(PAPER_REPRODUCTION_MAP_PATH),
    paperMapReceipt: paperReproductionMapReceiptSchema,
  })
  .strict();

type Issue = { id: string; path: string; message: string; targetIds?: string[] };
type IndexedSource = PaperReproductionMap['sources'][number];
type IndexedReceipt = z.infer<typeof indexedPaperSourceReceiptSchema>;
type PaperTargetInventoryItem = {
  id: string;
  evidenceId: string;
  figureLabel: string;
  concepts: string[];
  excerptHash: string;
};

const TARGET_CONCEPTS: Array<{ id: string; source: RegExp; map: RegExp }> = [
  {
    id: 'patient_composition',
    source: /individual samples|each patient|per patient|proportion/iu,
    map: /patient|sample.+composition|proportion/iu,
  },
  { id: 'msi_status', source: /\bMSI(?:-H)?\b|microsatellite instability/iu, map: /\bMSI(?:-H)?\b|microsatellite/iu },
  {
    id: 'anatomical_region',
    source: /anatomical (?:region|location)/iu,
    map: /anatomical (?:region|location)|tumou?r location/iu,
  },
  { id: 'trajectory', source: /trajectory|pseudotime|monocle/iu, map: /trajectory|pseudotime|monocle/iu },
  { id: 'myofibroblast_phenotypes', source: /MF1[\s\S]{0,30}MF2|MF1[–-]4/iu, map: /MF1[\s\S]{0,30}MF2|MF1[–-]4/iu },
  {
    id: 'inflammatory_scores',
    source: /pro.?inflammatory|anti.?inflammatory/iu,
    map: /pro.?inflammatory|anti.?inflammatory|inflammatory score/iu,
  },
  { id: 'survival', source: /kaplan|log.?rank|survival/iu, map: /kaplan|log.?rank|survival/iu },
  {
    id: 'adaptive_subclustering',
    source: /T.?cell sub|B.?cell sub|adaptive immune/iu,
    map: /T.?cell|B.?cell|adaptive immune/iu,
  },
  { id: 'cytotoxicity_exhaustion', source: /cytotoxicity|exhaustion/iu, map: /cytotoxicity|exhaustion/iu },
  {
    id: 'cell_interaction',
    source: /cell(?:ular|–cell|-cell) interaction|receptor.?ligand|CellPhoneDB/iu,
    map: /interaction|receptor.?ligand|CellPhoneDB|CCI/iu,
  },
  { id: 'cms_program', source: /\bCMS[1-4]?\b|CMSclassifier/iu, map: /\bCMS[1-4]?\b|CMSclassifier/iu },
];

const figureLabelFromExcerpt = (id: string, section: string | undefined, text: string): string | undefined => {
  const candidate = `${section || ''}\n${id}\n${text.slice(0, 240)}`;
  const match = candidate.match(/(?:figure|fig(?:ure)?[._-]?)\s*([1-9][0-9]*)/iu);
  return match ? `Figure ${match[1]}` : undefined;
};

const writeTargetInventory = (
  workspaceRoot: string,
  targets: PaperTargetInventoryItem[]
): { path: string; contentHash: string } => {
  const absolutePath = resolveSafeProjectWritePath(workspaceRoot, PAPER_TARGET_INVENTORY_PATH);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const content = `${JSON.stringify(
    {
      schema: 'openbioscience.paper_target_inventory.v1',
      createdAt: new Date().toISOString(),
      targets,
    },
    null,
    2
  )}\n`;
  const temporary = `${absolutePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, absolutePath);
  return { path: PAPER_TARGET_INVENTORY_PATH, contentHash: hash(content) };
};

const formatZodIssues = (error: z.ZodError): Issue[] =>
  error.issues.map((issue, index) => ({
    id: `schema-${index + 1}`,
    path: issue.path.join('.') || 'payload',
    message: issue.message,
  }));

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort();

const projectFile = (
  workspaceRoot: string,
  candidate: string
): { path?: string; relativePath?: string; issue?: string } => {
  if (path.isAbsolute(candidate)) return { issue: `Path must be project-relative: ${candidate}` };
  const root = path.resolve(workspaceRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { issue: `Workspace root is not an available directory: ${root}` };
  }
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { issue: `Path escapes the workspace root: ${candidate}` };
  }
  if (!fs.existsSync(resolved)) return { relativePath: candidate, issue: `Required file is missing: ${candidate}` };
  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(resolved);
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    return { relativePath: candidate, issue: `Path resolves outside the workspace root: ${candidate}` };
  }
  if (!fs.statSync(realFile).isFile()) {
    return { relativePath: candidate, issue: `Required path is not a file: ${candidate}` };
  }
  return { path: realFile, relativePath: candidate };
};

const makeNextAction = (params: {
  id: string;
  tool: BioNextAction['tool'];
  action: string;
  reason: string;
  payload: Record<string, unknown>;
  preconditionHash: string;
  expectedMutation: string[];
}): BioNextAction => {
  const actionFingerprint = fingerprint({
    id: params.id,
    tool: params.tool,
    action: params.action,
    payload: params.payload,
    preconditionHash: params.preconditionHash,
    expectedMutation: params.expectedMutation,
  });
  return {
    id: params.id,
    tool: params.tool,
    action: params.action,
    reason: params.reason,
    payload: params.payload,
    actionFingerprint,
    preconditionHash: params.preconditionHash,
    expectedMutation: params.expectedMutation,
    maxAttempts: 1,
    stopWhenUnchanged: true,
  };
};

const makeReceipt = (
  producer: BioControlReceipt['producer'],
  action: string,
  workspaceRoot: string,
  details: Record<string, unknown>
): BioControlReceipt => {
  const projectRoot = path.resolve(workspaceRoot);
  const validationFingerprint = fingerprint(details);
  return {
    schema: BIO_RECEIPT_SCHEMA,
    receiptId: `bio_receipt_${fingerprint({ producer, action, projectRoot, details }).slice(0, 20)}`,
    producer,
    action,
    status: 'ready',
    projectRoot,
    createdAt: Date.now(),
    validationFingerprint,
    details,
  };
};

const excerptFromLines = (content: Buffer, lineStart: number, lineEnd: number): string | undefined => {
  const lines = content.toString('utf8').split(/\r?\n/u);
  if (lineStart > lines.length || lineEnd > lines.length) return undefined;
  return lines.slice(lineStart - 1, lineEnd).join('\n');
};

export const indexPaperSources = (workspaceRoot: string, payload: unknown) => {
  const parsed = indexPaperSourcesPayloadSchema.safeParse(payload);
  const validationFingerprint = fingerprint(payload);
  if (!parsed.success) {
    const issues = formatZodIssues(parsed.error);
    return {
      action: 'index_paper_sources',
      status: 'needs_completion' as const,
      validationFingerprint,
      issues,
      nextActions: [
        makeNextAction({
          id: 'repair-paper-source-index-payload',
          tool: 'runtime',
          action: 'repair_mcp_payload',
          reason: 'The paper-source index payload does not satisfy the declared schema.',
          payload: {
            targetTool: 'bio_source',
            targetAction: 'index_paper_sources',
            requiredFields: [
              'sources[].id',
              'sources[].kind',
              'sources[].path|url',
              'excerpts[].text|lineStart+lineEnd',
            ],
            issues,
          },
          preconditionHash: validationFingerprint,
          expectedMutation: ['payload.sources', 'payload.excerpts'],
        }),
      ],
    };
  }

  const issues: Issue[] = [];
  const sources: IndexedSource[] = [];
  const sourceContent = new Map<string, Buffer>();
  const sourceInputs = new Map(parsed.data.sources.map((source) => [source.id, source]));
  const duplicateSourceIds = parsed.data.sources
    .map((source) => source.id)
    .filter((id, index, values) => values.indexOf(id) !== index);
  for (const id of uniqueSorted(duplicateSourceIds)) {
    issues.push({ id: `duplicate-source-${id}`, path: 'sources', message: `Duplicate source id: ${id}` });
  }

  for (const source of parsed.data.sources) {
    if (source.path) {
      const resolved = projectFile(workspaceRoot, source.path);
      if (!resolved.path) {
        issues.push({ id: `source-path-${source.id}`, path: `sources.${source.id}.path`, message: resolved.issue! });
        continue;
      }
      const content = fs.readFileSync(resolved.path);
      sourceContent.set(source.id, content);
      sources.push({ id: source.id, kind: source.kind, path: source.path, contentHash: hash(content) });
      continue;
    }
    const urlStatus = publicHttpUrlStatus(source.url!);
    if (urlStatus.status !== 'allowed') {
      issues.push({
        id: `source-url-${source.id}`,
        path: `sources.${source.id}.url`,
        message: urlStatus.reason || 'Source URL is not allowed.',
      });
      continue;
    }
    const content = Buffer.from(source.content!, 'utf8');
    sourceContent.set(source.id, content);
    sources.push({ id: source.id, kind: source.kind, url: source.url, contentHash: hash(content) });
  }

  const excerptInputs = [
    ...(parsed.data.excerpts || []),
    ...parsed.data.sources.flatMap((source) =>
      (source.excerpts || []).map((excerpt) => ({ ...excerpt, sourceId: source.id }))
    ),
  ];
  const duplicateEvidenceIds = excerptInputs
    .map((excerpt) => excerpt.id)
    .filter((id, index, values) => values.indexOf(id) !== index);
  for (const id of uniqueSorted(duplicateEvidenceIds)) {
    issues.push({ id: `duplicate-evidence-${id}`, path: 'excerpts', message: `Duplicate excerpt id: ${id}` });
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const evidence: PaperEvidenceLocator[] = [];
  const evidenceText = new Map<string, string>();
  for (const excerpt of excerptInputs) {
    const source = sourceById.get(excerpt.sourceId);
    const input = sourceInputs.get(excerpt.sourceId);
    const content = sourceContent.get(excerpt.sourceId);
    if (!source || !input || !content) {
      issues.push({
        id: `excerpt-source-${excerpt.id}`,
        path: `excerpts.${excerpt.id}.sourceId`,
        message: `Excerpt references an unavailable source: ${excerpt.sourceId}`,
      });
      continue;
    }
    if (excerpt.path && excerpt.path !== source.path) {
      issues.push({
        id: `excerpt-path-${excerpt.id}`,
        path: `excerpts.${excerpt.id}.path`,
        message: `Excerpt path must match source ${source.id}.`,
      });
      continue;
    }
    if (excerpt.url && excerpt.url !== source.url) {
      issues.push({
        id: `excerpt-url-${excerpt.id}`,
        path: `excerpts.${excerpt.id}.url`,
        message: `Excerpt URL must match source ${source.id}.`,
      });
      continue;
    }
    const lineExcerpt =
      excerpt.lineStart !== undefined && excerpt.lineEnd !== undefined
        ? excerptFromLines(content, excerpt.lineStart, excerpt.lineEnd)
        : undefined;
    if (excerpt.lineStart !== undefined && lineExcerpt === undefined) {
      issues.push({
        id: `excerpt-lines-${excerpt.id}`,
        path: `excerpts.${excerpt.id}`,
        message: `Excerpt line range is outside source ${source.id}.`,
      });
      continue;
    }
    if (excerpt.text !== undefined && lineExcerpt !== undefined && excerpt.text !== lineExcerpt) {
      issues.push({
        id: `excerpt-text-${excerpt.id}`,
        path: `excerpts.${excerpt.id}.text`,
        message: `Excerpt text does not match its declared source line range.`,
      });
      continue;
    }
    const excerptText = excerpt.text ?? lineExcerpt;
    if (excerptText === undefined) {
      issues.push({
        id: `excerpt-content-${excerpt.id}`,
        path: `excerpts.${excerpt.id}.text`,
        message: 'Excerpt text or a valid source line range is required.',
      });
      continue;
    }
    evidence.push({
      id: excerpt.id,
      sourceId: source.id,
      sourceHash: source.contentHash,
      ...(source.path ? { path: source.path } : { url: source.url }),
      ...(excerpt.page !== undefined ? { page: excerpt.page } : {}),
      ...(excerpt.lineStart !== undefined ? { lineStart: excerpt.lineStart, lineEnd: excerpt.lineEnd } : {}),
      ...(excerpt.section ? { section: excerpt.section } : {}),
      excerptHash: hash(excerptText),
      basis: excerpt.basis,
    });
    evidenceText.set(excerpt.id, excerptText);
  }

  if (issues.length) {
    const currentFingerprint = fingerprint({ payload: parsed.data, issues });
    return {
      action: 'index_paper_sources',
      status: 'needs_completion' as const,
      validationFingerprint: currentFingerprint,
      sources,
      evidence,
      issues,
      nextActions: [
        makeNextAction({
          id: 'repair-paper-source-inputs',
          tool: 'runtime',
          action: 'repair_mcp_payload',
          reason: 'Resolve the indexed source or excerpt issues before re-indexing.',
          payload: {
            targetTool: 'bio_source',
            targetAction: 'index_paper_sources',
            originalPayload: parsed.data,
            issues,
          },
          preconditionHash: currentFingerprint,
          expectedMutation: issues.map((issue) => issue.path),
        }),
      ],
    };
  }

  const targetInventory = evidence.flatMap((item): PaperTargetInventoryItem[] => {
    const text = evidenceText.get(item.id) || '';
    const figureLabel = figureLabelFromExcerpt(item.id, item.section, text);
    if (!figureLabel) return [];
    return [
      {
        id: `target-${item.id}`,
        evidenceId: item.id,
        figureLabel,
        concepts: TARGET_CONCEPTS.filter((concept) => concept.source.test(text)).map((concept) => concept.id),
        excerptHash: item.excerptHash,
      },
    ];
  });
  const targetInventoryFile = writeTargetInventory(workspaceRoot, targetInventory);
  const details = { sources, evidence, targetInventory, targetInventoryFile };
  const receipt = makeReceipt('bio_source', 'index_paper_sources', workspaceRoot, details) as IndexedReceipt;
  return {
    action: 'index_paper_sources',
    status: 'ready' as const,
    validationFingerprint: receipt.validationFingerprint!,
    sources,
    evidence,
    targetInventory,
    targetInventoryFile,
    issues: [] as Issue[],
    nextActions: [] as BioNextAction[],
    receipt,
  };
};

const allTargets = (paperMap: PaperReproductionMap) => [
  ...paperMap.figures,
  ...paperMap.panels,
  ...paperMap.claims,
  ...paperMap.cohorts,
  ...paperMap.methodUnits,
  ...paperMap.dataDependencies,
  ...paperMap.expectedOutputs,
];

const duplicateIds = (values: string[]): string[] =>
  uniqueSorted(values.filter((value, index) => values.indexOf(value) !== index));

const validateReferences = (paperMap: PaperReproductionMap): Issue[] => {
  const issues: Issue[] = [];
  const sources = new Map(paperMap.sources.map((source) => [source.id, source]));
  const evidence = new Map(paperMap.evidence.map((item) => [item.id, item]));
  const targets = allTargets(paperMap);
  const targetIds = new Set(targets.map((target) => target.id));
  const figures = new Map(paperMap.figures.map((item) => [item.id, item]));
  const panels = new Map(paperMap.panels.map((item) => [item.id, item]));
  const claims = new Set(paperMap.claims.map((item) => item.id));
  const cohorts = new Set(paperMap.cohorts.map((item) => item.id));
  const methods = new Set(paperMap.methodUnits.map((item) => item.id));
  const dependencies = new Set(paperMap.dataDependencies.map((item) => item.id));
  const outputs = new Set(paperMap.expectedOutputs.map((item) => item.id));

  const collections: Array<[string, string[]]> = [
    ['sources', paperMap.sources.map((item) => item.id)],
    ['evidence', paperMap.evidence.map((item) => item.id)],
    ['targets', targets.map((item) => item.id)],
    ['scopeDecisions', paperMap.scopeDecisions.map((item) => item.id)],
    ['conflicts', paperMap.conflicts.map((item) => item.id)],
    ['unresolvedItems', paperMap.unresolvedItems.map((item) => item.id)],
  ];
  for (const [collection, ids] of collections) {
    for (const id of duplicateIds(ids)) {
      issues.push({
        id: `duplicate-${collection}-${id}`,
        path: collection,
        message: `Duplicate ${collection} id: ${id}`,
      });
    }
  }
  if (!targets.length) {
    issues.push({ id: 'missing-targets', path: 'targets', message: 'The paper map must declare at least one target.' });
  }

  for (const item of paperMap.evidence) {
    const source = sources.get(item.sourceId);
    if (!source) {
      issues.push({
        id: `evidence-source-${item.id}`,
        path: `evidence.${item.id}.sourceId`,
        message: `Unknown source id: ${item.sourceId}`,
      });
      continue;
    }
    if (item.sourceHash !== source.contentHash) {
      issues.push({
        id: `evidence-source-hash-${item.id}`,
        path: `evidence.${item.id}.sourceHash`,
        message: `Evidence sourceHash does not match source ${source.id}.`,
      });
    }
    if ((item.path && item.path !== source.path) || (item.url && item.url !== source.url)) {
      issues.push({
        id: `evidence-locator-${item.id}`,
        path: `evidence.${item.id}`,
        message: `Evidence locator does not match source ${source.id}.`,
      });
    }
  }

  const requireIds = (owner: string, field: string, ids: string[], allowed: Set<string>): void => {
    for (const id of ids) {
      if (!allowed.has(id)) {
        issues.push({
          id: `reference-${owner}-${field}-${id}`,
          path: `${owner}.${field}`,
          message: `Unknown ${field} reference: ${id}`,
        });
      }
    }
  };
  const evidenceIds = new Set(evidence.keys());
  for (const target of targets) requireIds(target.id, 'evidenceIds', target.evidenceIds, evidenceIds);
  for (const figure of paperMap.figures) {
    requireIds(figure.id, 'panelIds', figure.panelIds, new Set(panels.keys()));
    for (const panelId of figure.panelIds) {
      if (panels.get(panelId)?.figureId !== figure.id) {
        issues.push({
          id: `figure-panel-link-${figure.id}-${panelId}`,
          path: `figures.${figure.id}.panelIds`,
          message: `Figure/panel relationship is not reciprocal for ${panelId}.`,
        });
      }
    }
  }
  for (const panel of paperMap.panels) {
    if (!figures.has(panel.figureId) || !figures.get(panel.figureId)!.panelIds.includes(panel.id)) {
      issues.push({
        id: `panel-figure-link-${panel.id}`,
        path: `panels.${panel.id}.figureId`,
        message: `Panel references a missing or non-reciprocal figure: ${panel.figureId}`,
      });
    }
    requireIds(panel.id, 'claimIds', panel.claimIds, claims);
    requireIds(panel.id, 'cohortIds', panel.cohortIds, cohorts);
    requireIds(panel.id, 'methodUnitIds', panel.methodUnitIds, methods);
    requireIds(panel.id, 'dependencyIds', panel.dependencyIds, dependencies);
    requireIds(panel.id, 'expectedOutputIds', panel.expectedOutputIds, outputs);
  }
  for (const dependency of paperMap.dataDependencies) {
    requireIds(dependency.id, 'cohortIds', dependency.cohortIds, cohorts);
  }
  for (const conflict of paperMap.conflicts) {
    requireIds(conflict.id, 'targetIds', conflict.targetIds, targetIds);
    requireIds(conflict.id, 'evidenceIds', conflict.evidenceIds, evidenceIds);
  }
  for (const unresolved of paperMap.unresolvedItems) {
    requireIds(unresolved.id, 'targetIds', unresolved.targetIds, targetIds);
  }

  const decisionByTarget = new Map<string, string[]>();
  for (const decision of paperMap.scopeDecisions) {
    requireIds(decision.id, 'targetIds', decision.targetIds, targetIds);
    for (const targetId of decision.targetIds) {
      decisionByTarget.set(targetId, [...(decisionByTarget.get(targetId) || []), decision.id]);
    }
  }
  for (const targetId of targetIds) {
    const decisions = decisionByTarget.get(targetId) || [];
    if (decisions.length !== 1) {
      issues.push({
        id: `scope-cardinality-${targetId}`,
        path: 'scopeDecisions',
        message: `Target ${targetId} requires exactly one scope decision; found ${decisions.length}.`,
        targetIds: [targetId],
      });
    }
  }

  const decisionRecordByTarget = new Map(
    paperMap.scopeDecisions.flatMap((decision) => decision.targetIds.map((targetId) => [targetId, decision] as const))
  );
  const explicitEvidence = (targetId: string): boolean => {
    const target = targets.find((candidate) => candidate.id === targetId);
    return Boolean(
      target?.evidenceIds.length &&
      target.evidenceIds.every((evidenceId) => evidence.get(evidenceId)?.basis === 'explicit')
    );
  };
  const unresolvedTargets = new Set([
    ...paperMap.unresolvedItems.flatMap((item) => item.targetIds),
    ...paperMap.conflicts.filter((item) => item.material).flatMap((item) => item.targetIds),
  ]);
  const linkedTargets = (targetId: string): string[] => {
    const figure = figures.get(targetId);
    if (figure) return figure.panelIds;
    const panel = panels.get(targetId);
    if (!panel) return [];
    return [
      panel.figureId,
      ...panel.claimIds,
      ...panel.cohortIds,
      ...panel.methodUnitIds,
      ...panel.dependencyIds,
      ...panel.expectedOutputIds,
    ];
  };
  for (const decision of paperMap.scopeDecisions.filter((item) => item.reproductionMode === 'exact')) {
    if (decision.status === 'analogous_only') {
      issues.push({
        id: `unsupported-exact-status-${decision.id}`,
        path: `scopeDecisions.${decision.id}`,
        message: 'An exact reproduction decision cannot have analogous_only status.',
        targetIds: decision.targetIds,
      });
    }
    for (const targetId of decision.targetIds) {
      if (!explicitEvidence(targetId) || unresolvedTargets.has(targetId)) {
        issues.push({
          id: `unsupported-exact-${targetId}`,
          path: `scopeDecisions.${decision.id}`,
          message: `Exact reproduction is unsupported for target ${targetId}; explicit, conflict-free evidence is required.`,
          targetIds: [targetId],
        });
      }
      const nonExactLinks = linkedTargets(targetId).filter(
        (linkedId) => decisionRecordByTarget.get(linkedId)?.reproductionMode !== 'exact'
      );
      if (nonExactLinks.length) {
        issues.push({
          id: `unsupported-exact-links-${targetId}`,
          path: `scopeDecisions.${decision.id}`,
          message: `Exact aggregate target ${targetId} includes non-exact targets: ${nonExactLinks.join(', ')}.`,
          targetIds: [targetId, ...nonExactLinks],
        });
      }
    }
  }
  return issues;
};

const validateIndexedSources = (
  workspaceRoot: string,
  paperMap: PaperReproductionMap,
  receipts: IndexedReceipt[]
): Issue[] => {
  const issues: Issue[] = [];
  const indexedSources = new Map<string, IndexedSource>();
  const indexedEvidence = new Map<string, PaperEvidenceLocator>();
  const targetInventory: PaperTargetInventoryItem[] = [];
  for (const receipt of receipts) {
    if (path.resolve(receipt.projectRoot) !== path.resolve(workspaceRoot)) {
      issues.push({
        id: `source-receipt-project-${receipt.receiptId}`,
        path: 'sourceReceipts',
        message: `Source receipt ${receipt.receiptId} belongs to a different workspace.`,
      });
      continue;
    }
    for (const source of receipt.details.sources as IndexedSource[]) indexedSources.set(source.id, source);
    for (const item of receipt.details.evidence as PaperEvidenceLocator[]) indexedEvidence.set(item.id, item);
    for (const item of Array.isArray(receipt.details.targetInventory) ? receipt.details.targetInventory : []) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as PaperTargetInventoryItem).id === 'string' &&
        typeof (item as PaperTargetInventoryItem).evidenceId === 'string' &&
        typeof (item as PaperTargetInventoryItem).figureLabel === 'string' &&
        Array.isArray((item as PaperTargetInventoryItem).concepts)
      ) {
        targetInventory.push(item as PaperTargetInventoryItem);
      }
    }
  }

  for (const source of paperMap.sources) {
    const indexed = indexedSources.get(source.id);
    if (!indexed || stableJson(indexed) !== stableJson(source)) {
      issues.push({
        id: `source-index-${source.id}`,
        path: `sources.${source.id}`,
        message: `Source ${source.id} does not match a current indexed source receipt.`,
      });
      continue;
    }
    if (source.path) {
      const resolved = projectFile(workspaceRoot, source.path);
      if (!resolved.path) {
        issues.push({ id: `source-file-${source.id}`, path: `sources.${source.id}.path`, message: resolved.issue! });
      } else if (hash(fs.readFileSync(resolved.path)) !== source.contentHash) {
        issues.push({
          id: `source-file-hash-${source.id}`,
          path: `sources.${source.id}.contentHash`,
          message: `Source file changed after indexing: ${source.path}`,
        });
      }
    }
  }
  for (const item of paperMap.evidence) {
    const indexed = indexedEvidence.get(item.id);
    if (!indexed || stableJson(indexed) !== stableJson(item)) {
      issues.push({
        id: `excerpt-index-${item.id}`,
        path: `evidence.${item.id}`,
        message: `Evidence ${item.id} does not match a current indexed excerpt hash and locator.`,
      });
      continue;
    }
    if (item.path && item.lineStart !== undefined && item.lineEnd !== undefined) {
      const resolved = projectFile(workspaceRoot, item.path);
      if (resolved.path) {
        const excerpt = excerptFromLines(fs.readFileSync(resolved.path), item.lineStart, item.lineEnd);
        if (excerpt === undefined || hash(excerpt) !== item.excerptHash) {
          issues.push({
            id: `excerpt-file-hash-${item.id}`,
            path: `evidence.${item.id}.excerptHash`,
            message: `Source excerpt changed after indexing: ${item.id}`,
          });
        }
      }
    }
  }
  for (const target of targetInventory) {
    const figure = paperMap.figures.find(
      (candidate) => candidate.label === target.figureLabel || candidate.evidenceIds.includes(target.evidenceId)
    );
    if (!figure) {
      issues.push({
        id: `coverage-figure-${target.id}`,
        path: 'figures',
        message: `Indexed target ${target.id} is not represented by a paper-map figure.`,
      });
      continue;
    }
    const panels = paperMap.panels.filter((panel) => figure.panelIds.includes(panel.id));
    const panelTargetIds = new Set(
      panels.flatMap((panel) => [
        panel.id,
        ...panel.claimIds,
        ...panel.methodUnitIds,
        ...panel.dependencyIds,
        ...panel.expectedOutputIds,
      ])
    );
    const coverageText = [
      figure.label,
      figure.title,
      ...panels.map((panel) => panel.label),
      ...paperMap.claims.filter((item) => panelTargetIds.has(item.id)).map((item) => item.text),
      ...paperMap.methodUnits.filter((item) => panelTargetIds.has(item.id)).map((item) => item.reportedMethod),
      ...paperMap.dataDependencies.filter((item) => panelTargetIds.has(item.id)).map((item) => item.label),
      ...paperMap.expectedOutputs.filter((item) => panelTargetIds.has(item.id)).map((item) => item.label),
      ...paperMap.scopeDecisions
        .filter((item) => item.targetIds.some((targetId) => panelTargetIds.has(targetId)))
        .map((item) => item.reason),
      ...paperMap.unresolvedItems
        .filter((item) => item.targetIds.some((targetId) => panelTargetIds.has(targetId)))
        .map((item) => item.message),
    ].join('\n');
    for (const conceptId of target.concepts) {
      const concept = TARGET_CONCEPTS.find((candidate) => candidate.id === conceptId);
      if (concept && !concept.map.test(coverageText)) {
        issues.push({
          id: `coverage-concept-${target.id}-${conceptId}`,
          path: `figures.${figure.id}`,
          message: `${target.figureLabel} evidence contains ${conceptId}, but its mapped panel contract omits it.`,
          targetIds: [figure.id, ...figure.panelIds],
        });
      }
    }
  }
  return issues;
};

const readPaperMap = (
  workspaceRoot: string,
  mapPath: string
): { paperMap?: PaperReproductionMap; contentHash?: string; issues: Issue[] } => {
  const resolved = projectFile(workspaceRoot, mapPath);
  if (!resolved.path) {
    return { issues: [{ id: 'canonical-map-path', path: 'mapPath', message: resolved.issue! }] };
  }
  const content = fs.readFileSync(resolved.path);
  let value: unknown;
  try {
    value = JSON.parse(content.toString('utf8'));
  } catch (error) {
    return {
      contentHash: hash(content),
      issues: [
        {
          id: 'canonical-map-json',
          path: mapPath,
          message: `Canonical paper reproduction map is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  const parsed = paperReproductionMapSchema.safeParse(value);
  if (!parsed.success) return { contentHash: hash(content), issues: formatZodIssues(parsed.error) };
  return { paperMap: parsed.data as PaperReproductionMap, contentHash: hash(content), issues: [] };
};

const mapRepairAction = (issues: Issue[], preconditionHash: string, sourceReceipts: IndexedReceipt[]): BioNextAction =>
  makeNextAction({
    id: 'repair-canonical-paper-reproduction-map',
    tool: 'runtime',
    action: 'patch_file',
    reason: 'Repair the canonical paper reproduction map and validate the same file again.',
    payload: {
      path: PAPER_REPRODUCTION_MAP_PATH,
      requiredSchema: PAPER_REPRODUCTION_MAP_SCHEMA,
      issues,
      onSuccess: {
        tool: 'bio_reproduction',
        action: 'validate_paper_reproduction_map',
        payload: { mapPath: PAPER_REPRODUCTION_MAP_PATH, sourceReceipts },
      },
    },
    preconditionHash,
    expectedMutation: [PAPER_REPRODUCTION_MAP_PATH],
  });

export const validatePaperReproductionMap = (workspaceRoot: string, payload: unknown) => {
  const parsed = validatePaperReproductionMapPayloadSchema.safeParse(payload);
  const validationFingerprint = fingerprint(payload);
  if (!parsed.success) {
    const issues = formatZodIssues(parsed.error);
    return {
      action: 'validate_paper_reproduction_map',
      status: 'needs_completion' as const,
      validationFingerprint,
      issues,
      nextActions: [
        makeNextAction({
          id: 'repair-paper-map-validation-payload',
          tool: 'runtime',
          action: 'repair_mcp_payload',
          reason: 'Use the canonical map path and current paper-source receipts.',
          payload: {
            targetTool: 'bio_reproduction',
            targetAction: 'validate_paper_reproduction_map',
            canonicalMapPath: PAPER_REPRODUCTION_MAP_PATH,
            issues,
          },
          preconditionHash: validationFingerprint,
          expectedMutation: ['payload.mapPath', 'payload.sourceReceipts'],
        }),
      ],
    };
  }

  const read = readPaperMap(workspaceRoot, parsed.data.mapPath);
  const mapIssues = read.paperMap
    ? [
        ...validateReferences(read.paperMap),
        ...validateIndexedSources(workspaceRoot, read.paperMap, parsed.data.sourceReceipts),
      ]
    : read.issues;
  const currentFingerprint = fingerprint({
    mapPath: parsed.data.mapPath,
    mapContentHash: read.contentHash || null,
    sourceReceiptIds: parsed.data.sourceReceipts.map((receipt) => receipt.receiptId).sort(),
    issues: mapIssues,
  });
  if (!read.paperMap || !read.contentHash || mapIssues.length) {
    return {
      action: 'validate_paper_reproduction_map',
      status: 'needs_completion' as const,
      validationFingerprint: currentFingerprint,
      issues: mapIssues,
      nextActions: [mapRepairAction(mapIssues, currentFingerprint, parsed.data.sourceReceipts)],
    };
  }

  const targetIds = uniqueSorted(allTargets(read.paperMap).map((target) => target.id));
  const unresolvedTargetIds = uniqueSorted([
    ...read.paperMap.scopeDecisions
      .filter((decision) => ['external_data_block', 'capability_block', 'unresolved'].includes(decision.status))
      .flatMap((decision) => decision.targetIds),
    ...read.paperMap.conflicts.filter((conflict) => conflict.material).flatMap((conflict) => conflict.targetIds),
    ...read.paperMap.unresolvedItems.flatMap((item) => item.targetIds),
  ]);
  const sourceReceiptIds = uniqueSorted(parsed.data.sourceReceipts.map((receipt) => receipt.receiptId));
  const details = {
    canonicalFile: { path: PAPER_REPRODUCTION_MAP_PATH, contentHash: read.contentHash },
    sourceReceiptIds,
    sourceReceipts: parsed.data.sourceReceipts,
    targetIds,
    unresolvedTargetIds,
  };
  const baseReceipt = makeReceipt('bio_reproduction', 'validate_paper_reproduction_map', workspaceRoot, details);
  const receipt: PaperReproductionMapReceipt = {
    ...baseReceipt,
    producer: 'bio_reproduction',
    action: 'validate_paper_reproduction_map',
    canonicalFile: details.canonicalFile,
    sourceReceiptIds,
    targetIds,
    unresolvedTargetIds,
    nextActions: [],
  };
  return {
    action: 'validate_paper_reproduction_map',
    status: 'ready' as const,
    validationFingerprint: receipt.validationFingerprint!,
    targetIds,
    unresolvedTargetIds,
    issues: [] as Issue[],
    nextActions: [] as BioNextAction[],
    receipt,
  };
};

export const validateReproductionScope = (workspaceRoot: string, payload: unknown) => {
  const parsed = validateReproductionScopePayloadSchema.safeParse(payload);
  const validationFingerprint = fingerprint(payload);
  if (!parsed.success) {
    const issues = formatZodIssues(parsed.error);
    return {
      action: 'validate_reproduction_scope',
      status: 'needs_completion' as const,
      validationFingerprint,
      issues,
      nextActions: [
        makeNextAction({
          id: 'repair-reproduction-scope-validation-payload',
          tool: 'runtime',
          action: 'repair_mcp_payload',
          reason: 'Use the canonical map path and its current ready validation receipt.',
          payload: {
            targetTool: 'bio_reproduction',
            targetAction: 'validate_reproduction_scope',
            canonicalMapPath: PAPER_REPRODUCTION_MAP_PATH,
            issues,
          },
          preconditionHash: validationFingerprint,
          expectedMutation: ['payload.mapPath', 'payload.paperMapReceipt'],
        }),
      ],
    };
  }

  const read = readPaperMap(workspaceRoot, parsed.data.mapPath);
  const receipt = parsed.data.paperMapReceipt;
  const issues = [...read.issues];
  if (path.resolve(receipt.projectRoot) !== path.resolve(workspaceRoot)) {
    issues.push({
      id: 'paper-map-receipt-project',
      path: 'paperMapReceipt.projectRoot',
      message: 'The paper map receipt belongs to a different workspace.',
    });
  }
  if (read.contentHash && receipt.canonicalFile.contentHash !== read.contentHash) {
    issues.push({
      id: 'paper-map-receipt-hash',
      path: 'paperMapReceipt.canonicalFile.contentHash',
      message: 'The canonical paper map changed after its validation receipt was issued.',
    });
  }
  if (read.paperMap) {
    issues.push(...validateReferences(read.paperMap));
    const currentTargetIds = uniqueSorted(allTargets(read.paperMap).map((target) => target.id));
    if (stableJson(currentTargetIds) !== stableJson([...receipt.targetIds].sort())) {
      issues.push({
        id: 'paper-map-receipt-targets',
        path: 'paperMapReceipt.targetIds',
        message: 'The paper map target set does not match its validation receipt.',
      });
    }
  }
  const currentFingerprint = fingerprint({
    mapContentHash: read.contentHash || null,
    paperMapReceiptId: receipt.receiptId,
    issues,
  });
  if (!read.paperMap || !read.contentHash || issues.length) {
    const nextAction = makeNextAction({
      id: 'revalidate-paper-reproduction-map',
      tool: 'bio_reproduction',
      action: 'validate_paper_reproduction_map',
      reason: 'The scope requires a current, structurally valid paper reproduction map receipt.',
      payload: {
        mapPath: PAPER_REPRODUCTION_MAP_PATH,
        sourceReceipts: receipt.details.sourceReceipts,
      },
      preconditionHash: currentFingerprint,
      expectedMutation: ['payload.paperMapReceipt', PAPER_REPRODUCTION_MAP_PATH],
    });
    return {
      action: 'validate_reproduction_scope',
      status: 'needs_completion' as const,
      validationFingerprint: currentFingerprint,
      issues,
      nextActions: [nextAction],
    };
  }

  const targetsByStatus = new Map<string, string[]>();
  for (const decision of read.paperMap.scopeDecisions) {
    targetsByStatus.set(decision.status, [...(targetsByStatus.get(decision.status) || []), ...decision.targetIds]);
  }
  const requiredTargetIds = uniqueSorted(
    ['required', 'ready', 'conditional', 'analogous_only'].flatMap((status) => targetsByStatus.get(status) || [])
  );
  const excludedTargetIds = uniqueSorted(targetsByStatus.get('excluded_by_user') || []);
  const blockedTargetIds = uniqueSorted(
    ['external_data_block', 'capability_block', 'unresolved'].flatMap((status) => targetsByStatus.get(status) || [])
  );
  const details = {
    paperMapReceiptId: receipt.receiptId,
    canonicalFile: { path: PAPER_REPRODUCTION_MAP_PATH, contentHash: read.contentHash },
    requiredTargetIds,
    excludedTargetIds,
    blockedTargetIds,
  };
  const baseReceipt = makeReceipt('bio_reproduction', 'validate_reproduction_scope', workspaceRoot, details);
  const scopeReceipt: ReproductionScopeReceipt = {
    ...baseReceipt,
    producer: 'bio_reproduction',
    action: 'validate_reproduction_scope',
    paperMapReceiptId: receipt.receiptId,
    canonicalFile: details.canonicalFile,
    requiredTargetIds,
    excludedTargetIds,
    blockedTargetIds,
    nextActions: [],
  };
  return {
    action: 'validate_reproduction_scope',
    status: 'ready' as const,
    validationFingerprint: scopeReceipt.validationFingerprint!,
    requiredTargetIds,
    excludedTargetIds,
    blockedTargetIds,
    issues: [] as Issue[],
    nextActions: [] as BioNextAction[],
    receipt: scopeReceipt,
  };
};
