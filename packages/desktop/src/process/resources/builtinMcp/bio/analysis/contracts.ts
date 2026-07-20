import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { OmicsAnalysisProjectStatus, OmicsAnalysisStage, OmicsAnalysisStageStatus } from '@/common/chat/science';
import { resolveSafeProjectWritePath } from '../pathSafety';

export const ANALYSIS_STATE_SCHEMA = 'openbioscience.omics_analysis.state.v1' as const;
export const ANALYSIS_OUTPUT_MANIFEST_SCHEMA = 'openbioscience.analysis_script.outputs.v2' as const;
export const ANALYSIS_STATE_ROOT = '.openbioscience/control/analysis/v1';
export const ANALYSIS_OUTPUT_ROOT = 'omics_analysis';

export const ANALYSIS_STAGES: OmicsAnalysisStage[] = ['intake', 'qc', 'baseline', 'exploration', 'episode', 'closing'];
export const EXECUTABLE_STAGES = new Set<OmicsAnalysisStage>(['intake', 'qc', 'baseline', 'exploration', 'episode']);

export type AnalysisFileReference = {
  path: string;
  contentHash: string;
  fingerprintMethod: 'sha256' | 'size_mtime_first_last_sha256';
  sizeBytes: number;
};

export type AnalysisStageState = {
  status: OmicsAnalysisStageStatus;
  receiptId?: string;
  checkpointReceiptId?: string;
  checkpointStatus?: string;
  updatedAt: number;
};

export type AnalysisEpisodeState = {
  episodeId: string;
  parentReceiptId: string;
  scientificQuestion: string;
  requiresStatistics: boolean;
  status: OmicsAnalysisStageStatus;
  receiptId?: string;
  checkpointReceiptId?: string;
  checkpointStatus?: string;
  updatedAt: number;
};

export type OmicsAnalysisState = {
  schema: typeof ANALYSIS_STATE_SCHEMA;
  analysisId: string;
  projectRoot: string;
  inputRoot: string;
  modality: string;
  projectStatus: OmicsAnalysisProjectStatus;
  currentStage: OmicsAnalysisStage;
  activeEpisodeId?: string;
  stages: Record<Exclude<OmicsAnalysisStage, 'episode'>, AnalysisStageState>;
  episodes: Record<string, AnalysisEpisodeState>;
  createdAt: number;
  updatedAt: number;
};

const ANALYSIS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

const isInside = (root: string, candidate: string): boolean => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const nearestExistingPath = (candidate: string): string => {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
};

const assertSafeProjectPath = (projectRoot: string, candidate: string, label: string): string => {
  if (!candidate.trim() || path.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/u.test(candidate)) {
    throw new Error(`${label} must be a non-empty project-relative path.`);
  }
  const resolved = path.resolve(projectRoot, candidate);
  if (!isInside(projectRoot, resolved)) throw new Error(`${label} escapes the project root.`);
  const realRoot = fs.realpathSync(projectRoot);
  const realExisting = fs.realpathSync(nearestExistingPath(resolved));
  if (!isInside(realRoot, realExisting))
    throw new Error(`${label} resolves through a symlink outside the project root.`);
  return resolved;
};

export const assertAnalysisId = (analysisId: string): string => {
  if (!ANALYSIS_ID_PATTERN.test(analysisId)) {
    throw new Error('analysisId must contain only letters, digits, dots, underscores, and hyphens.');
  }
  return analysisId;
};

export const analysisStateRelativePath = (analysisId: string): string => {
  assertAnalysisId(analysisId);
  return path.posix.join(ANALYSIS_STATE_ROOT, analysisId, 'state.json');
};

export const analysisOutputRelativePath = (analysisId: string): string => {
  assertAnalysisId(analysisId);
  return path.posix.join(ANALYSIS_OUTPUT_ROOT, analysisId);
};

export const stageOutputRelativePath = (analysisId: string, stage: OmicsAnalysisStage, episodeId?: string): string => {
  const root = analysisOutputRelativePath(analysisId);
  if (stage === 'episode') {
    if (!episodeId) throw new Error('episodeId is required for an episode output path.');
    assertAnalysisId(episodeId);
    return path.posix.join(root, 'episodes', episodeId);
  }
  return stage === 'closing' ? path.posix.join(root, 'reports') : path.posix.join(root, stage);
};

export const stageControlRelativePath = (analysisId: string, stage: OmicsAnalysisStage, episodeId?: string): string => {
  assertAnalysisId(analysisId);
  if (stage === 'episode') {
    if (!episodeId) throw new Error('episodeId is required for an episode control path.');
    assertAnalysisId(episodeId);
    return path.posix.join(ANALYSIS_STATE_ROOT, analysisId, 'episodes', episodeId, 'contract.json');
  }
  return path.posix.join(ANALYSIS_STATE_ROOT, analysisId, `${stage}.json`);
};

export const stageLayoutDirectories = (analysisId: string, stage: OmicsAnalysisStage, episodeId?: string): string[] => {
  const stageRoot = stageOutputRelativePath(analysisId, stage, episodeId);
  if (!EXECUTABLE_STAGES.has(stage)) return [stageRoot];
  return [
    stageRoot,
    path.posix.join(stageRoot, 'scripts'),
    path.posix.join(stageRoot, 'configs'),
    path.posix.join(stageRoot, 'results'),
    path.posix.join(stageRoot, 'results', 'objects'),
    path.posix.join(stageRoot, 'results', 'tables'),
    path.posix.join(stageRoot, 'results', 'figures'),
    path.posix.join(stageRoot, 'logs'),
  ];
};

export const ensureAnalysisLayout = (
  projectRoot: string,
  analysisId: string,
  stage?: OmicsAnalysisStage,
  episodeId?: string
): void => {
  const roots = stage
    ? stageLayoutDirectories(analysisId, stage, episodeId)
    : [
        analysisOutputRelativePath(analysisId),
        stageOutputRelativePath(analysisId, 'intake'),
        stageOutputRelativePath(analysisId, 'qc'),
        stageOutputRelativePath(analysisId, 'baseline'),
        stageOutputRelativePath(analysisId, 'exploration'),
        path.posix.join(analysisOutputRelativePath(analysisId), 'episodes'),
        stageOutputRelativePath(analysisId, 'closing'),
      ];
  for (const relative of roots) fs.mkdirSync(resolveSafeProjectWritePath(projectRoot, relative), { recursive: true });
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)])
  );
};

export const stableJson = (value: unknown): string => `${JSON.stringify(stableValue(value), null, 2)}\n`;

export const sha256 = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');

const atomicWrite = (target: string, content: string): void => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
  fs.renameSync(temporary, target);
};

export const readAnalysisState = (projectRoot: string, analysisId: string): OmicsAnalysisState => {
  const target = assertSafeProjectPath(projectRoot, analysisStateRelativePath(analysisId), 'analysis state path');
  if (!fs.existsSync(target)) throw new Error(`Unknown analysisId: ${analysisId}`);
  const parsed = JSON.parse(fs.readFileSync(target, 'utf8')) as Partial<OmicsAnalysisState>;
  if (
    parsed.schema !== ANALYSIS_STATE_SCHEMA ||
    parsed.analysisId !== analysisId ||
    parsed.projectRoot !== path.resolve(projectRoot) ||
    !parsed.stages ||
    !parsed.episodes
  ) {
    throw new Error(`Analysis state is malformed: ${analysisId}`);
  }
  return parsed as OmicsAnalysisState;
};

export const writeAnalysisState = (projectRoot: string, state: OmicsAnalysisState): void => {
  assertAnalysisId(state.analysisId);
  if (path.resolve(state.projectRoot) !== path.resolve(projectRoot)) {
    throw new Error('Analysis state belongs to another project.');
  }
  const target = resolveSafeProjectWritePath(projectRoot, analysisStateRelativePath(state.analysisId));
  atomicWrite(target, stableJson(state));
};

export const createAnalysisState = (params: {
  projectRoot: string;
  analysisId: string;
  inputRoot: string;
  modality: string;
  now?: number;
}): OmicsAnalysisState => {
  const now = params.now ?? Date.now();
  assertAnalysisId(params.analysisId);
  const inputAbsolutePath = assertSafeProjectPath(params.projectRoot, params.inputRoot, 'inputRoot');
  if (!fs.existsSync(inputAbsolutePath) || !fs.statSync(inputAbsolutePath).isDirectory()) {
    throw new Error('inputRoot must be an existing directory inside the authorized project workspace.');
  }
  return {
    schema: ANALYSIS_STATE_SCHEMA,
    analysisId: params.analysisId,
    projectRoot: path.resolve(params.projectRoot),
    inputRoot: params.inputRoot.replaceAll('\\', '/'),
    modality: params.modality,
    projectStatus: 'running',
    currentStage: 'intake',
    stages: {
      intake: { status: 'running', updatedAt: now },
      qc: { status: 'blocked', updatedAt: now },
      baseline: { status: 'blocked', updatedAt: now },
      exploration: { status: 'blocked', updatedAt: now },
      closing: { status: 'blocked', updatedAt: now },
    },
    episodes: {},
    createdAt: now,
    updatedAt: now,
  };
};

export const fingerprintFile = (projectRoot: string, candidate: string): AnalysisFileReference => {
  const absolutePath = assertSafeProjectPath(projectRoot, candidate, 'canonical file path');
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`Canonical file does not exist: ${candidate}`);
  }
  const stat = fs.statSync(absolutePath);
  if (stat.size <= 64 * 1024 * 1024) {
    return {
      path: candidate,
      contentHash: sha256(fs.readFileSync(absolutePath)),
      fingerprintMethod: 'sha256',
      sizeBytes: stat.size,
    };
  }
  const blockSize = Math.min(1024 * 1024, stat.size);
  const file = fs.openSync(absolutePath, 'r');
  try {
    const first = Buffer.alloc(blockSize);
    const last = Buffer.alloc(blockSize);
    fs.readSync(file, first, 0, blockSize, 0);
    fs.readSync(file, last, 0, blockSize, Math.max(0, stat.size - blockSize));
    return {
      path: candidate,
      contentHash: sha256(`${stat.size}:${stat.mtimeMs}:${sha256(first)}:${sha256(last)}`),
      fingerprintMethod: 'size_mtime_first_last_sha256',
      sizeBytes: stat.size,
    };
  } finally {
    fs.closeSync(file);
  }
};

export const requireStageFile = (
  projectRoot: string,
  analysisId: string,
  stage: OmicsAnalysisStage,
  candidate: string,
  episodeId?: string
): AnalysisFileReference => {
  const expectedRoot = stageOutputRelativePath(analysisId, stage, episodeId);
  const normalized = candidate.replaceAll('\\', '/');
  if (!normalized.startsWith(`${expectedRoot}/`)) {
    throw new Error(`Canonical file must be under ${expectedRoot}.`);
  }
  return fingerprintFile(projectRoot, normalized);
};

export const stageArtifactRequirements = (stage: OmicsAnalysisStage): string[] => {
  if (stage === 'intake') {
    return [
      'results/tables/input_inventory',
      'results/tables/dataset_units',
      'results/tables/metadata_profile',
      'results/output_manifest.json',
      'logs/',
    ];
  }
  if (stage === 'qc') {
    return [
      'results/objects/',
      'results/tables/qc_metrics',
      'results/figures/',
      'results/output_manifest.json',
      'logs/',
    ];
  }
  if (stage === 'baseline') {
    return [
      'results/objects/',
      'results/tables/cluster_assignments',
      'results/tables/embedding_coordinates',
      'results/tables/cluster_markers',
      'results/tables/major_annotation',
      'results/tables/annotation_evidence',
      'results/tables/descriptive_statistics',
      'results/figures/',
      'results/output_manifest.json',
      'logs/',
    ];
  }
  if (stage === 'exploration') {
    return [
      'scripts/',
      'scripts/script_manifest.json',
      'results/objects/',
      'results/tables/input_inventory',
      'results/tables/qc_metrics',
      'results/tables/cluster_assignments',
      'results/tables/embedding_coordinates',
      'results/tables/cluster_markers',
      'results/tables/major_annotation',
      'results/tables/fraction_by_sample',
      'results/tables/fraction_group_comparison',
      'results/tables/processed_expression_feature_screening',
      'results/tables/pathway_enrichment',
      'results/tables/blocked_or_limited_contrasts',
      'results/figures/embedding',
      'results/figures/markers',
      'results/figures/composition',
      'results/figures/differential_features',
      'results/figures/pathway_enrichment',
      'results/output_manifest.json',
      'reports/analysis_report',
      'logs/',
      'logs/session_info',
      'logs/warnings.tsv',
    ];
  }
  if (stage === 'episode') return ['results/output_manifest.json', 'logs/'];
  return ['final_report', 'coverage_contract'];
};

export const assertStageArtifactCoverage = (files: AnalysisFileReference[], stage: OmicsAnalysisStage): string[] => {
  const paths = files.map((file) => file.path);
  return stageArtifactRequirements(stage).filter(
    (required) => !paths.some((candidate) => candidate.includes(required))
  );
};
