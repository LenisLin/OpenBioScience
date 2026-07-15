/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type {
  BioControlReceipt,
  BioNextAction,
  MethodAlignmentLevel,
  MethodAlignmentReceipt,
  MethodModuleCoverage,
  MethodParameterConflict,
  MethodParameterEvidence,
  MethodParameterReceipt,
  MethodSourceKind,
} from '@/common/chat/science';
import { publicHttpUrlStatus } from '../pathSafety';

const BIO_RECEIPT_SCHEMA = 'openbioscience.bio.receipt.v1' as const;
export const METHOD_CONTRACT_SCHEMA = 'openbioscience.omics_reproduction.method_parameter_contract.v1' as const;
export const EXECUTED_PARAMETERS_SCHEMA = 'openbioscience.omics_reproduction.executed_parameters.v1' as const;
const MAX_GITHUB_FILE_BYTES = 512 * 1024;
const MAX_GITHUB_FILES = 200;
const MAX_GITHUB_TOTAL_BYTES = 10 * 1024 * 1024;
const GITHUB_TIMEOUT_MS = 15_000;

const SCRNA_MODULES = [
  'input_reference',
  'cell_qc',
  'normalization',
  'hvg_selection',
  'batch_integration',
  'dimensionality_reduction',
  'clustering',
  'cell_annotation',
  'cluster_markers',
  'condition_de',
  'trajectory',
  'gene_program',
  'cell_cell_interaction',
  'plotting',
] as const;

export const METHOD_MODULE_COVERAGE_STATUSES = [
  'reported',
  'not_reported_after_inspection',
  'not_applicable',
  'conflict',
] as const;

const hasSemanticValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasSemanticValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasSemanticValue);
  return true;
};

const evidenceSchema = z
  .object({
    parameterId: z.string().min(1),
    moduleId: z.string().min(1),
    name: z.string().min(1),
    sourceKind: z.enum(['paper_methods', 'supplement', 'author_code', 'figure_legend']),
    sourceId: z.string().min(1),
    locator: z.string().min(1),
    reportedValue: z.unknown(),
    normalizedValue: z.unknown(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

const sourceCandidateSchema = evidenceSchema.extend({ evidenceId: z.string().min(1) }).strict();

const moduleCoverageSchema = z
  .object({
    moduleId: z.string().min(1),
    required: z.boolean().optional(),
    status: z.enum(METHOD_MODULE_COVERAGE_STATUSES).optional(),
    sourcesInspected: z.array(z.enum(['paper_methods', 'supplement', 'author_code', 'figure_legend'])),
    parameterCount: z.number().int().nonnegative(),
    hasConflict: z.boolean(),
    alignmentLevel: z.enum([
      'parameter_aligned',
      'partially_aligned',
      'scoped_reimplementation',
      'unresolved_conflict',
    ]),
  })
  .strict();

export const methodContractSchema = z
  .object({
    schema: z.literal(METHOD_CONTRACT_SCHEMA),
    createdAt: z.string().min(1),
    sourceReceiptIds: z.array(z.string().min(1)).min(1),
    evidence: z.array(evidenceSchema),
    requiredModules: z.array(z.string().min(1)).optional(),
    moduleCoverage: z.array(moduleCoverageSchema),
    conflicts: z.array(
      z
        .object({
          parameterId: z.string().min(1),
          moduleId: z.string().min(1),
          evidenceIds: z.array(z.string().min(1)).min(2),
          values: z.array(z.unknown()).min(2),
          material: z.boolean(),
        })
        .strict()
    ),
    eligibleClaims: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((contract, context) => {
    const coverageByModule = new Map(contract.moduleCoverage.map((coverage) => [coverage.moduleId, coverage]));
    const requiredModules = new Set([
      ...(contract.requiredModules || []),
      ...contract.moduleCoverage.filter((coverage) => coverage.required === true).map((coverage) => coverage.moduleId),
    ]);

    for (const moduleId of requiredModules) {
      const coverage = coverageByModule.get(moduleId);
      if (!coverage) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['moduleCoverage'],
          message: `Required module ${moduleId} has no coverage record.`,
        });
        continue;
      }

      const moduleEvidence = contract.evidence.filter((item) => item.moduleId === moduleId);
      const hasEvidence = moduleEvidence.some(
        (item) => hasSemanticValue(item.reportedValue) || hasSemanticValue(item.normalizedValue)
      );
      const emptyStatusAllowed =
        coverage.status === 'not_reported_after_inspection' ||
        coverage.status === 'not_applicable' ||
        coverage.status === 'conflict';
      if ((!coverage.parameterCount || !hasEvidence) && !emptyStatusAllowed) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['moduleCoverage', contract.moduleCoverage.indexOf(coverage)],
          message: `Required module ${moduleId} is semantically empty; use not_reported_after_inspection, not_applicable, or conflict when evidence is unavailable.`,
        });
      }
    }
  });

const executedParameterSchema = z
  .object({
    parameterId: z.string().min(1),
    moduleId: z.string().min(1),
    name: z.string().min(1),
    value: z.unknown(),
    origin: z.enum(['reported_parameter', 'analysis_choice']),
  })
  .strict();

export const executedParametersSchema = z
  .object({
    schema: z.literal(EXECUTED_PARAMETERS_SCHEMA),
    createdAt: z.string().min(1),
    parameters: z.array(executedParameterSchema).min(1),
  })
  .strict();

type GithubFile = { path: string; blobSha: string; sizeBytes: number; content: string };
type MethodSourceCandidate = MethodParameterEvidence & { evidenceId: string };

export type MethodSourceInspection = {
  status: 'ready' | 'partial' | 'blocked';
  sources: Array<Record<string, unknown>>;
  candidates: MethodSourceCandidate[];
  repositories: Array<Record<string, unknown>>;
  externalBlockers: Array<{ id: string; kind: 'data'; message: string; external: true }>;
  validationFingerprint: string;
};

const hash = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stable(nested)])
  );
};
const stableJson = (value: unknown): string => JSON.stringify(stable(value));
const groupBy = <T>(values: T[], keyFor: (value: T) => string): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    grouped.set(key, [...(grouped.get(key) || []), value]);
  }
  return grouped;
};

const moduleForLine = (line: string): string => {
  const lower = line.toLowerCase();
  if (/cellranger|reference genome|grch/u.test(lower)) return 'input_reference';
  if (/umi|mitochond|doublet|genes?\s*[<>]|filter/u.test(lower)) return 'cell_qc';
  if (/batch|cca|integration|align/u.test(lower)) return 'batch_integration';
  if (/variable genes?|highly variable|findvariablegenes|dispersion/u.test(lower)) return 'hvg_selection';
  if (/normaliz|tpm|log2|natural log|scale factor/u.test(lower)) return 'normalization';
  if (/pca|principal component|t-sne|tsne|umap|ddrtree/u.test(lower)) return 'dimensionality_reduction';
  if (/cluster|resolution|seurat/u.test(lower)) return 'clustering';
  if (/annotat|canonical marker|rca/u.test(lower)) return 'cell_annotation';
  if (/differential|deg|bonferroni|student.?s t-test/u.test(lower)) return 'cluster_markers';
  if (/edger|deseq|pseudobulk|condition/u.test(lower)) return 'condition_de';
  if (/trajectory|monocle|ordercells/u.test(lower)) return 'trajectory';
  if (/gene set|functionality score|mean expression/u.test(lower)) return 'gene_program';
  if (/cellphonedb|receptor|ligand|interaction|permut/u.test(lower)) return 'cell_cell_interaction';
  if (/heatmap|dot size|centered|plot|visual/u.test(lower)) return 'plotting';
  return 'input_reference';
};

const parameterMatches = (line: string): Array<{ id: string; name: string; value: unknown }> => {
  const matches: Array<{ id: string; name: string; value: unknown }> = [];
  const add = (id: string, name: string, value: unknown) => matches.push({ id, name, value });
  const software = [
    ...line.matchAll(
      /\b(CellRanger|Seurat|Monocle|WGCNA|CellPhoneDB|migest|RCA)\s*(?:v\.?|version\s*)?(\d+(?:\.\d+)+)/giu
    ),
  ];
  for (const match of software) add(`${match[1].toLowerCase()}_version`, `${match[1]} version`, match[2]);
  const umi = /(?:cells? with\s*)?>\s*([\d,]+)\s+(?:unique molecular identifier|UMI)/iu.exec(line);
  if (umi) add('min_umi_counts', 'Minimum UMI counts', Number(umi[1].replaceAll(',', '')));
  const genes = />\s*([\d,]+)\s+genes?\s+and\s+<\s*([\d,]+)\s+genes?/iu.exec(line);
  if (genes) {
    add('min_genes', 'Minimum detected genes', Number(genes[1].replaceAll(',', '')));
    add('max_genes', 'Maximum detected genes', Number(genes[2].replaceAll(',', '')));
  }
  const mito = /<\s*(\d+(?:\.\d+)?)%\s+of mitochondrial/iu.exec(line);
  if (mito) add('max_mito_percent', 'Maximum mitochondrial percentage', Number(mito[1]));
  const hvgCount = /top\s+([\d,]+)\s+highly variable genes/iu.exec(line);
  if (hvgCount) add('hvg_count', 'Highly variable gene count', Number(hvgCount[1].replaceAll(',', '')));
  const hvgFraction = /expressed by more than\s+([\d.]+)%\s+of cells/iu.exec(line);
  if (hvgFraction) add('hvg_min_cell_percent', 'Minimum cells expressing HVG', Number(hvgFraction[1]));
  const meanRange = /mean expression between\s+([\d.]+)\s+and\s+([\d.]+)/iu.exec(line);
  if (meanRange) add('hvg_mean_range', 'HVG mean expression range', [Number(meanRange[1]), Number(meanRange[2])]);
  const dispersion = /dispersion of more than\s+([\d.]+)/iu.exec(line);
  if (dispersion) add('hvg_min_dispersion', 'Minimum HVG dispersion', Number(dispersion[1]));
  const resolution = /resolutions? from\s+([\d.]+)\s+to\s+([\d.]+)/iu.exec(line);
  if (resolution)
    add('cluster_resolution_range', 'Explored clustering resolution', [Number(resolution[1]), Number(resolution[2])]);
  const permutations = /(?:at|for)\s+([\d,]+)\s+times/iu.exec(line);
  if (permutations && /permut/u.test(line))
    add('cci_permutations', 'CCI label permutations', Number(permutations[1].replaceAll(',', '')));
  if (/multiple CCA/iu.test(line)) add('batch_method', 'Batch correction method', 'multiple CCA');
  if (/t-SNE projection/iu.test(line)) add('visualization_method', 'Visualization method', 't-SNE');
  return matches;
};

const moduleForParameter = (parameterId: string, line: string): string => {
  if (parameterId === 'cellranger_version') return 'input_reference';
  if (['min_umi_counts', 'min_genes', 'max_genes', 'max_mito_percent'].includes(parameterId)) return 'cell_qc';
  if (parameterId.startsWith('hvg_') || parameterId === 'seurat_version') return 'hvg_selection';
  if (parameterId === 'batch_method') return 'batch_integration';
  if (parameterId === 'visualization_method') return 'dimensionality_reduction';
  if (parameterId === 'cluster_resolution_range') return 'clustering';
  if (parameterId === 'cci_permutations') return 'cell_cell_interaction';
  return moduleForLine(line);
};

const candidatesFromText = (
  text: string,
  sourceKind: MethodSourceKind,
  sourceId: string,
  locatorPrefix: string
): MethodSourceCandidate[] => {
  const candidates: MethodSourceCandidate[] = [];
  const lines = text.split(/\r?\n/u);
  for (const [index, rawLine] of lines.entries()) {
    const line = lines
      .slice(index, index + 3)
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' ');
    if (!line) continue;
    for (const match of parameterMatches(line)) {
      const moduleId = moduleForParameter(match.id, line);
      const evidenceId = `method_evidence_${hash(`${sourceId}:${index + 1}:${match.id}:${stableJson(match.value)}`).slice(0, 16)}`;
      candidates.push({
        evidenceId,
        parameterId: match.id,
        moduleId,
        name: match.name,
        sourceKind,
        sourceId,
        locator: `${locatorPrefix}:${index + 1}`,
        reportedValue: match.value,
        normalizedValue: match.value,
        contentHash: hash(line),
      });
    }
  }
  return Array.from(
    new Map(
      candidates.map((item) => [`${item.sourceId}:${item.parameterId}:${stableJson(item.normalizedValue)}`, item])
    ).values()
  );
};

const githubRepository = (candidate: string): { owner: string; repo: string; url: string } | undefined => {
  const status = publicHttpUrlStatus(candidate);
  if (status.status !== 'allowed') return undefined;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') return undefined;
  const parts = parsed.pathname
    .replace(/\.git$/u, '')
    .split('/')
    .filter(Boolean);
  if (parts.length !== 2) return undefined;
  return { owner: parts[0], repo: parts[1], url: `https://github.com/${parts[0]}/${parts[1]}` };
};

const githubFetchJson = async (url: string): Promise<Record<string, unknown>> => {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OpenBioScience-method-contract' },
  });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}).`);
  return (await response.json()) as Record<string, unknown>;
};

const inspectGithub = async (
  candidate: string
): Promise<{ repository: Record<string, unknown>; files: GithubFile[] }> => {
  const repository = githubRepository(candidate);
  if (!repository) throw new Error('Only public HTTPS github.com owner/repository URLs are supported.');
  const metadata = await githubFetchJson(`https://api.github.com/repos/${repository.owner}/${repository.repo}`);
  const branch = typeof metadata.default_branch === 'string' ? metadata.default_branch : '';
  if (!branch) throw new Error('GitHub repository has no resolvable default branch.');
  const commit = await githubFetchJson(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/commits/${encodeURIComponent(branch)}`
  );
  const commitSha = typeof commit.sha === 'string' ? commit.sha : '';
  if (!/^[a-f0-9]{40}$/u.test(commitSha)) throw new Error('GitHub did not return a fixed commit SHA.');
  const tree = await githubFetchJson(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/git/trees/${commitSha}?recursive=1`
  );
  const entries = Array.isArray(tree.tree) ? tree.tree : [];
  const textPattern = /\.(?:r|py|ipynb|md|txt|ya?ml|json|toml|sh)$/iu;
  const excludedPattern = /(?:^|\/)(?:node_modules|vendor|dist|build|data|outputs?|results?|\.git)(?:\/|$)/iu;
  const selected = entries
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string' && textPattern.test(entry.path))
    .filter((entry) => !excludedPattern.test(String(entry.path)))
    .filter((entry) => typeof entry.size === 'number' && entry.size <= MAX_GITHUB_FILE_BYTES)
    .slice(0, MAX_GITHUB_FILES);
  const files: GithubFile[] = [];
  let totalBytes = 0;
  for (const entry of selected) {
    const sizeBytes = Number(entry.size);
    if (totalBytes + sizeBytes > MAX_GITHUB_TOTAL_BYTES) break;
    const filePath = String(entry.path);
    const rawUrl = `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${commitSha}/${filePath}`;
    const response = await fetch(rawUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      headers: { 'User-Agent': 'OpenBioScience-method-contract' },
    });
    if (!response.ok) continue;
    const content = await response.text();
    if (Buffer.byteLength(content) > MAX_GITHUB_FILE_BYTES) continue;
    totalBytes += Buffer.byteLength(content);
    files.push({ path: filePath, blobSha: String(entry.sha || ''), sizeBytes, content });
  }
  return {
    repository: {
      url: repository.url,
      defaultBranch: branch,
      commitSha,
      fileCount: files.length,
      totalBytes,
      scope: 'remote_read_only',
    },
    files,
  };
};

const urlsFromText = (text: string): string[] =>
  Array.from(new Set(text.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/gu) || []));

export const inspectMethodSources = async (params: {
  projectRoot: string;
  paperTextPaths: string[];
  supplementPaths: string[];
  repositoryUrls: string[];
}): Promise<MethodSourceInspection> => {
  const sources: Array<Record<string, unknown>> = [];
  const repositories: Array<Record<string, unknown>> = [];
  const candidates: MethodSourceCandidate[] = [];
  const externalBlockers: MethodSourceInspection['externalBlockers'] = [];
  const discoveredUrls = new Set(params.repositoryUrls);
  const localSources = [
    ...params.paperTextPaths.map((sourcePath) => ({ sourcePath, sourceKind: 'paper_methods' as const })),
    ...params.supplementPaths.map((sourcePath) => ({ sourcePath, sourceKind: 'supplement' as const })),
  ];
  for (const source of localSources) {
    const resolved = path.resolve(params.projectRoot, source.sourcePath);
    const relative = path.relative(params.projectRoot, resolved);
    if (path.isAbsolute(source.sourcePath) || relative.startsWith('..') || path.isAbsolute(relative)) continue;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;
    const realRoot = fs.realpathSync(params.projectRoot);
    const realSource = fs.realpathSync(resolved);
    const realRelative = path.relative(realRoot, realSource);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) continue;
    const content = fs.readFileSync(resolved, 'utf8');
    const sourceId = `method_source_${hash(relative).slice(0, 12)}`;
    sources.push({ sourceId, sourceKind: source.sourceKind, path: relative, contentHash: hash(content) });
    candidates.push(...candidatesFromText(content, source.sourceKind, sourceId, relative));
    for (const url of urlsFromText(content)) discoveredUrls.add(url);
  }
  for (const url of discoveredUrls) {
    try {
      const inspected = await inspectGithub(url);
      repositories.push(inspected.repository);
      const commitSha = String(inspected.repository.commitSha);
      for (const file of inspected.files) {
        const sourceId = `github_${hash(`${url}:${commitSha}:${file.path}`).slice(0, 12)}`;
        sources.push({
          sourceId,
          sourceKind: 'author_code',
          url: `${url}/blob/${commitSha}/${file.path}`,
          repositoryUrl: url,
          commitSha,
          blobSha: file.blobSha,
          sizeBytes: file.sizeBytes,
          contentHash: hash(file.content),
        });
        candidates.push(
          ...candidatesFromText(file.content, 'author_code', sourceId, `${url}/blob/${commitSha}/${file.path}`)
        );
      }
    } catch (error) {
      externalBlockers.push({
        id: `github_${hash(url).slice(0, 12)}`,
        kind: 'data',
        message: `${url}: ${error instanceof Error ? error.message : String(error)}`,
        external: true,
      });
    }
  }
  const deduplicated = Array.from(new Map(candidates.map((item) => [item.evidenceId, item])).values());
  const fingerprint = hash(stableJson({ sources, repositories, candidates: deduplicated, externalBlockers }));
  return {
    status: sources.length ? (externalBlockers.length ? 'partial' : 'ready') : 'blocked',
    sources,
    candidates: deduplicated,
    repositories,
    externalBlockers,
    validationFingerprint: fingerprint,
  };
};

const conflictList = (evidence: MethodSourceCandidate[]): MethodParameterConflict[] => {
  const grouped = groupBy(evidence, (item) => `${item.moduleId}:${item.parameterId}`);
  const conflicts: MethodParameterConflict[] = [];
  for (const values of grouped.values()) {
    const uniqueValues = Array.from(
      new Map(values.map((item) => [stableJson(item.normalizedValue), item.normalizedValue])).values()
    );
    if (uniqueValues.length < 2) continue;
    conflicts.push({
      parameterId: values[0].parameterId,
      moduleId: values[0].moduleId,
      evidenceIds: values.map((item) => item.evidenceId),
      values: uniqueValues,
      material: true,
    });
  }
  return conflicts;
};

export const buildMethodContract = (sourceReceipts: BioControlReceipt[]): z.infer<typeof methodContractSchema> => {
  const validReceipts = Array.from(
    new Map(
      sourceReceipts
        .filter(
          (receipt) =>
            receipt.schema === BIO_RECEIPT_SCHEMA &&
            receipt.producer === 'bio_source' &&
            receipt.action === 'inspect_method_sources' &&
            (receipt.status === 'ready' || receipt.status === 'partial')
        )
        .map((receipt) => [receipt.receiptId, receipt])
    ).values()
  ).sort((left, right) => left.receiptId.localeCompare(right.receiptId));
  const candidates = validReceipts.flatMap((receipt) => {
    const raw = receipt.details?.candidates;
    return Array.isArray(raw)
      ? raw.filter((item): item is MethodSourceCandidate => sourceCandidateSchema.safeParse(item).success)
      : [];
  });
  const sourceKindOrder: MethodSourceKind[] = ['paper_methods', 'supplement', 'author_code', 'figure_legend'];
  const evidence = Array.from(new Map(candidates.map((item) => [item.evidenceId, item])).values()).sort(
    (left, right) =>
      sourceKindOrder.indexOf(left.sourceKind) - sourceKindOrder.indexOf(right.sourceKind) ||
      left.evidenceId.localeCompare(right.evidenceId)
  );
  const conflicts = conflictList(evidence);
  const sourceKinds = validReceipts.flatMap((receipt) => {
    const sources = receipt.details?.sources;
    return Array.isArray(sources)
      ? sources
          .map((source) => (source && typeof source === 'object' ? (source as Record<string, unknown>).sourceKind : ''))
          .filter((kind): kind is MethodSourceKind =>
            ['paper_methods', 'supplement', 'author_code', 'figure_legend'].includes(String(kind))
          )
      : [];
  });
  const moduleCoverage = SCRNA_MODULES.map((moduleId) => {
    const moduleEvidence = evidence.filter((item) => item.moduleId === moduleId);
    const hasConflict = conflicts.some((item) => item.moduleId === moduleId);
    return {
      moduleId,
      required: true,
      status: hasConflict
        ? ('conflict' as const)
        : moduleEvidence.length
          ? ('reported' as const)
          : ('not_reported_after_inspection' as const),
      sourcesInspected: Array.from(new Set(sourceKinds)).sort(),
      parameterCount: moduleEvidence.length,
      hasConflict,
      alignmentLevel: hasConflict
        ? 'unresolved_conflict'
        : moduleEvidence.length
          ? 'partially_aligned'
          : 'scoped_reimplementation',
    };
  });
  return {
    schema: METHOD_CONTRACT_SCHEMA,
    createdAt: new Date(Math.max(...validReceipts.map((receipt) => receipt.createdAt), 0)).toISOString(),
    sourceReceiptIds: validReceipts.map((receipt) => receipt.receiptId),
    evidence: evidence.map(({ evidenceId: _evidenceId, ...item }) => item),
    requiredModules: [...SCRNA_MODULES],
    moduleCoverage,
    conflicts,
    eligibleClaims: ['data_layer_reproduction', 'method_structure_reproduction', 'scoped_reimplementation'],
  } as z.infer<typeof methodContractSchema>;
};

const receiptIdentity = (action: string, projectRoot: string, details: unknown) => {
  const identity = stableJson({ producer: 'bio_reproduction', action, status: 'ready', projectRoot, details });
  return `bio_receipt_${hash(identity).slice(0, 20)}`;
};

export const buildMethodParameterReceipt = (params: {
  projectRoot: string;
  canonicalPath: string;
  canonicalHash: string;
  contract: z.infer<typeof methodContractSchema>;
}): MethodParameterReceipt => {
  const details = {
    canonicalFile: { path: params.canonicalPath, contentHash: params.canonicalHash },
    sourceReceiptIds: params.contract.sourceReceiptIds,
    moduleCoverage: params.contract.moduleCoverage as MethodModuleCoverage[],
    conflicts: params.contract.conflicts as MethodParameterConflict[],
  };
  return {
    schema: BIO_RECEIPT_SCHEMA,
    receiptId: receiptIdentity('extract_method_parameters', params.projectRoot, details),
    producer: 'bio_reproduction',
    action: 'extract_method_parameters',
    status: 'ready',
    projectRoot: params.projectRoot,
    createdAt: Date.now(),
    validationFingerprint: hash(stableJson(details)),
    canonicalFile: details.canonicalFile,
    sourceReceiptIds: details.sourceReceiptIds,
    moduleCoverage: details.moduleCoverage,
    conflicts: details.conflicts,
    nextActions: [],
    details,
  };
};

export const validateMethodAlignment = (params: {
  projectRoot: string;
  methodReceipt: MethodParameterReceipt;
  methodContract: z.infer<typeof methodContractSchema>;
  executedParameterPath: string;
  scriptPaths: string[];
}): { receipt?: MethodAlignmentReceipt; nextActions: BioNextAction[]; issues: string[] } => {
  const issues: string[] = [];
  const nextActions: BioNextAction[] = [];
  const executedPath = path.resolve(params.projectRoot, params.executedParameterPath);
  const scriptFiles = params.scriptPaths.map((scriptPath) => {
    const resolved = path.resolve(params.projectRoot, scriptPath);
    return { path: scriptPath, resolved };
  });
  if (!fs.existsSync(executedPath))
    issues.push(`Executed parameter manifest is missing: ${params.executedParameterPath}`);
  let parsedExecuted: ReturnType<typeof executedParametersSchema.safeParse> | undefined;
  if (fs.existsSync(executedPath)) {
    try {
      parsedExecuted = executedParametersSchema.safeParse(JSON.parse(fs.readFileSync(executedPath, 'utf8')));
    } catch (error) {
      issues.push(
        `Executed parameter manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (parsedExecuted && !parsedExecuted.success) issues.push(parsedExecuted.error.message);
  for (const script of scriptFiles) {
    if (!fs.existsSync(script.resolved) || !fs.statSync(script.resolved).isFile()) {
      issues.push(`Script is missing: ${script.path}`);
    }
  }
  if (issues.length) {
    nextActions.push({
      id: 'complete-executed-parameter-contract',
      tool: 'runtime',
      action: 'write_file',
      reason: issues.join(' '),
      payload: {
        path: params.executedParameterPath,
        schema: EXECUTED_PARAMETERS_SCHEMA,
        scripts: params.scriptPaths,
      },
    });
    return { nextActions, issues };
  }
  const executed = parsedExecuted!.data;
  const declaredIds = new Set<string>();
  for (const script of scriptFiles) {
    const content = fs.readFileSync(script.resolved, 'utf8');
    const match = /OpenBioScience-Parameters:\s*([^\r\n]+)/u.exec(content);
    if (!match) {
      issues.push(`Script does not declare OpenBioScience-Parameters: ${script.path}`);
      continue;
    }
    for (const parameterId of match[1]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)) {
      declaredIds.add(parameterId);
    }
  }
  const executedById = new Map(executed.parameters.map((item) => [item.parameterId, item]));
  for (const parameterId of declaredIds) {
    if (!executedById.has(parameterId))
      issues.push(`Declared script parameter is absent from manifest: ${parameterId}`);
  }
  if (issues.length) {
    nextActions.push({
      id: 'synchronize-script-parameter-manifest',
      tool: 'runtime',
      action: 'patch_file',
      reason: issues.join(' '),
      payload: { path: params.executedParameterPath, parameterIds: Array.from(declaredIds).sort() },
    });
    return { nextActions, issues };
  }
  const evidenceById = groupBy(params.methodContract.evidence, (item) => item.parameterId);
  const alignedParameters: string[] = [];
  const substitutedParameters: string[] = [];
  for (const parameter of executed.parameters) {
    const evidence = evidenceById.get(parameter.parameterId) || [];
    if (!evidence.length) {
      substitutedParameters.push(parameter.parameterId);
      continue;
    }
    const aligned = evidence.some((item) => stableJson(item.normalizedValue) === stableJson(parameter.value));
    (aligned ? alignedParameters : substitutedParameters).push(parameter.parameterId);
  }
  const conflicts = params.methodContract.conflicts as MethodParameterConflict[];
  const structuralSubstitutions = new Set([
    'batch_method',
    'hvg_count',
    'embedding_method',
    'visualization_method',
    'clustering_method',
    'de_method',
    'trajectory_method',
    'cci_method',
  ]);
  const hasStructuralSubstitution = substitutedParameters.some((parameterId) =>
    structuralSubstitutions.has(parameterId)
  );
  const alignmentLevel: MethodAlignmentLevel = conflicts.length
    ? 'unresolved_conflict'
    : substitutedParameters.length
      ? hasStructuralSubstitution || !alignedParameters.length
        ? 'scoped_reimplementation'
        : 'partially_aligned'
      : 'parameter_aligned';
  const executedParameterFile = {
    path: params.executedParameterPath,
    contentHash: hash(fs.readFileSync(executedPath)),
  };
  const hashedScripts = scriptFiles.map((script) => ({
    path: script.path,
    contentHash: hash(fs.readFileSync(script.resolved)),
  }));
  const eligibleClaims =
    alignmentLevel === 'parameter_aligned'
      ? ['data_layer_reproduction', 'method_structure_reproduction', 'parameter_aligned_reproduction']
      : ['data_layer_reproduction', 'method_structure_reproduction', 'scoped_reimplementation'];
  const details = {
    methodParameterReceiptId: params.methodReceipt.receiptId,
    alignmentLevel,
    executedParameterFile,
    scriptFiles: hashedScripts,
    alignedParameters: alignedParameters.toSorted(),
    substitutedParameters: substitutedParameters.toSorted(),
    conflicts,
    eligibleClaims,
  };
  const receipt: MethodAlignmentReceipt = {
    schema: BIO_RECEIPT_SCHEMA,
    receiptId: receiptIdentity('validate_method_alignment', params.projectRoot, details),
    producer: 'bio_reproduction',
    action: 'validate_method_alignment',
    status: 'ready',
    projectRoot: params.projectRoot,
    createdAt: Date.now(),
    validationFingerprint: hash(stableJson(details)),
    methodParameterReceiptId: details.methodParameterReceiptId,
    alignmentLevel,
    executedParameterFile,
    scriptFiles: hashedScripts,
    alignedParameters: details.alignedParameters,
    substitutedParameters: details.substitutedParameters,
    conflicts,
    eligibleClaims,
    nextActions: [],
    details,
  };
  return { receipt, nextActions: [], issues: [] };
};
