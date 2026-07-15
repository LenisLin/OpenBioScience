import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { ANALYSIS_OUTPUT_MANIFEST_SCHEMA, stageOutputRelativePath } from './contracts';

const REQUIRED_HEADERS = [
  'workflow-kind',
  'analysis-id',
  'stage-or-episode-id',
  'contract-receipt-id',
  'environmentref',
  'inputs',
  'outputs',
  'run-command',
  'assumptions',
  'annotation-mode',
  'external-egress-policy',
] as const;

export type AnalysisScriptPreflight = {
  path: string;
  contentHash: string;
  environmentRef?: string;
  violations: string[];
};

const sha256 = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');

const headerValues = (content: string): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/u).slice(0, 120)) {
    const match = /^\s*(?:#|\/\/|--|\*)\s*OpenBioScience-([A-Za-z-]+)\s*:\s*(.+?)\s*$/u.exec(line);
    if (match?.[1] && match[2]) values[match[1].toLowerCase()] = match[2].trim();
  }
  return values;
};

const listedPaths = (value?: string): string[] =>
  (value || '')
    .split(/[;,]/u)
    .map((item) => item.trim().replace(/^['"]|['"]$/gu, ''))
    .filter(Boolean);

const projectPathIssue = (candidate: string, outputRoot: string, output: boolean): string | undefined => {
  const normalized = candidate.replaceAll('\\', '/');
  if (!normalized || path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//u.test(normalized)) {
    return `Path must be project-relative: ${candidate}`;
  }
  if (normalized.includes('://') || normalized === '..' || normalized.startsWith('../')) {
    return `Path is not a local project-relative path: ${candidate}`;
  }
  const collapsed = path.posix.normalize(normalized);
  if (collapsed === '..' || collapsed.startsWith('../')) return `Path escapes the project: ${candidate}`;
  if (output && !collapsed.startsWith(`${outputRoot}/`)) {
    return `Output must be under ${outputRoot}: ${candidate}`;
  }
  return undefined;
};

const prohibitedBehavior = (content: string): string[] => {
  const patterns: Array<[string, RegExp]> = [
    ['package installation', /\b(?:pip(?:3)?|conda|mamba|micromamba|apt(?:-get)?|brew)\s+install\b/iu],
    ['R package installation', /\b(?:install\.packages|BiocManager::install|remotes::install_[A-Za-z_]+)\s*\(/u],
    ['network download', /\b(?:curl|wget|requests\.(?:get|post)|urlretrieve|download\.file)\b|https?:\/\//iu],
    ['deployment-specific absolute path', /['"](?:\/(?!\/)[^'"\r\n]+|[A-Za-z]:[\\/][^'"\r\n]+)['"]/u],
  ];
  return patterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([name]) => `Prohibited script behavior: ${name}.`);
};

const environmentPrefix = (projectRoot: string, environmentRef: string): string | undefined => {
  if (!/^[A-Za-z0-9._:-]+$/u.test(environmentRef) || environmentRef.startsWith('user:')) return undefined;
  const candidates = [
    process.env.OPENBIOSCIENCE_ENV_ROOT ? path.join(process.env.OPENBIOSCIENCE_ENV_ROOT, environmentRef) : '',
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT
      ? path.join(process.env.OPENBIOSCIENCE_RUNTIME_ROOT, 'environments', 'official', environmentRef)
      : '',
    path.join('/env', environmentRef),
    path.join(projectRoot, '.openbioscience', 'environments', environmentRef),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
};

const syntaxIssue = (projectRoot: string, relativePath: string, environmentRef: string): string | undefined => {
  const environment = environmentPrefix(projectRoot, environmentRef);
  if (!environment) return `Target environmentRef is unavailable for syntax parsing: ${environmentRef}.`;
  const absolutePath = path.join(projectRoot, relativePath);
  const extension = path.extname(relativePath).toLowerCase();
  const executable =
    extension === '.py'
      ? path.join(environment, 'bin', 'python')
      : extension === '.r' || extension === '.R'
        ? path.join(environment, 'bin', 'Rscript')
        : '';
  if (!executable || !fs.existsSync(executable))
    return `No syntax parser is available for ${relativePath} in ${environmentRef}.`;
  const args =
    extension === '.py'
      ? ['-c', 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text())', absolutePath]
      : ['-e', 'parse(file=commandArgs(trailingOnly=TRUE)[1])', absolutePath];
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      PATH: [path.join(environment, 'bin'), process.env.PATH || ''].filter(Boolean).join(path.delimiter),
    },
  });
  if (result.status === 0) return undefined;
  const reason = String(result.stderr || result.error?.message || 'unknown syntax error')
    .trim()
    .slice(0, 500);
  return `Syntax parsing failed for ${relativePath} in ${environmentRef}: ${reason}`;
};

export const preflightAnalysisScript = (params: {
  projectRoot: string;
  analysisId: string;
  stage: 'intake' | 'qc' | 'baseline' | 'episode';
  episodeId?: string;
  contractReceiptId: string;
  scriptPath: string;
}): AnalysisScriptPreflight => {
  const absolutePath = path.join(params.projectRoot, params.scriptPath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const headers = headerValues(content);
  const outputRoot = stageOutputRelativePath(params.analysisId, params.stage, params.episodeId);
  const violations: string[] = [];
  for (const name of REQUIRED_HEADERS) if (!headers[name]) violations.push(`Missing OpenBioScience-${name} header.`);
  if (headers['workflow-kind'] && headers['workflow-kind'] !== 'omics_analysis') {
    violations.push('Workflow kind must be omics_analysis.');
  }
  if (headers['analysis-id'] && headers['analysis-id'] !== params.analysisId) {
    violations.push('Analysis ID does not match the stage contract.');
  }
  const expectedStageId = params.episodeId || params.stage;
  if (headers['stage-or-episode-id'] && headers['stage-or-episode-id'] !== expectedStageId) {
    violations.push('Stage or episode ID does not match the stage contract.');
  }
  if (headers['contract-receipt-id'] && headers['contract-receipt-id'] !== params.contractReceiptId) {
    violations.push('Contract receipt ID does not match the current stage contract.');
  }
  if (headers['external-egress-policy'] && !/^(?:forbidden|allowlisted)$/iu.test(headers['external-egress-policy'])) {
    violations.push('External egress policy must be forbidden or allowlisted.');
  }
  for (const candidate of listedPaths(headers.inputs)) {
    const issue = projectPathIssue(candidate, outputRoot, false);
    if (issue) violations.push(issue);
  }
  const outputPaths = listedPaths(headers.outputs);
  for (const candidate of outputPaths) {
    const issue = projectPathIssue(candidate, outputRoot, true);
    if (issue) violations.push(issue);
  }
  if (!outputPaths.some((candidate) => candidate.endsWith('results/output_manifest.json'))) {
    violations.push('Outputs must declare results/output_manifest.json.');
  }
  if (!content.includes(ANALYSIS_OUTPUT_MANIFEST_SCHEMA)) {
    violations.push(`Script must write output manifest schema ${ANALYSIS_OUTPUT_MANIFEST_SCHEMA}.`);
  }
  violations.push(...prohibitedBehavior(content));
  if (headers.environmentref) {
    const issue = syntaxIssue(params.projectRoot, params.scriptPath, headers.environmentref);
    if (issue) violations.push(issue);
  }
  return {
    path: params.scriptPath,
    contentHash: sha256(content),
    ...(headers.environmentref ? { environmentRef: headers.environmentref } : {}),
    violations: [...new Set(violations)],
  };
};
