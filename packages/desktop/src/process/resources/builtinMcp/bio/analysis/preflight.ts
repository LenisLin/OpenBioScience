import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { ANALYSIS_OUTPUT_MANIFEST_SCHEMA, stageOutputRelativePath } from './contracts';
import { BIO_ENVIRONMENTS, FREE_EXPLORATION_MODULE_PLAN } from '../catalog';
import { readMarkerResourceIndex, resolveKnowledgeResourceRoots } from '../knowledgeResources';
import { readReceipt } from '../receipts';

const REQUIRED_HEADERS = [
  'OpenBioScience-Workflow-Kind',
  'OpenBioScience-Analysis-ID',
  'OpenBioScience-Stage-Or-Episode-ID',
  'OpenBioScience-Contract-Receipt-ID',
  'OpenBioScience-Annotation-Mode',
  'OpenBioScience-External-Egress-Policy',
  'OpenBioScience-EnvironmentRef',
  'OpenBioScience-Inputs',
  'OpenBioScience-Outputs',
  'OpenBioScience-Run-Command',
  'OpenBioScience-Assumptions',
] as const;

const HEADER_KEYS = {
  workflowKind: 'OpenBioScience-Workflow-Kind',
  analysisId: 'OpenBioScience-Analysis-ID',
  stageOrEpisodeId: 'OpenBioScience-Stage-Or-Episode-ID',
  contractReceiptId: 'OpenBioScience-Contract-Receipt-ID',
  annotationMode: 'OpenBioScience-Annotation-Mode',
  externalEgressPolicy: 'OpenBioScience-External-Egress-Policy',
  environmentRef: 'OpenBioScience-EnvironmentRef',
  inputs: 'OpenBioScience-Inputs',
  outputs: 'OpenBioScience-Outputs',
  runCommand: 'OpenBioScience-Run-Command',
  assumptions: 'OpenBioScience-Assumptions',
} as const;

const ANALYSIS_SCRIPT_PACKAGE_SCHEMA = 'openbioscience.analysis_script.package.v1' as const;

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
    if (match?.[1] && match[2]) values[`OpenBioScience-${match[1]}`] = match[2].trim();
  }
  return values;
};

const normalizedHeaderLookup = (headers: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

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

const scriptPathIssue = (candidate: string, outputRoot: string): string | undefined => {
  const issue = projectPathIssue(candidate, outputRoot, false);
  if (issue) return issue;
  const collapsed = path.posix.normalize(candidate.replaceAll('\\', '/'));
  const expectedRoot = `${outputRoot}/scripts/`;
  if (!collapsed.startsWith(expectedRoot)) {
    return `Analysis script must be under ${expectedRoot}: ${candidate}`;
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

const walkFiles = (root: string): string[] => {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(next);
      } else if (entry.isFile()) {
        files.push(next);
      }
    }
  };
  visit(root);
  return files;
};

const hasHumanReadableModuleComment = (content: string): boolean =>
  /^\s*(?:"""[\s\S]{40,}?"""|'''[\s\S]{40,}?'''|#\s*\S.{30,})/u.test(content);

const publicPythonFunctions = (content: string): Array<{ name: string; lineIndex: number; indent: number }> =>
  content
    .split(/\r?\n/u)
    .map((line, index) => {
      const match = /^(\s*)def\s+([A-Za-z]\w*)\s*\(/u.exec(line);
      if (!match?.[2] || match[2].startsWith('_')) return undefined;
      return { name: match[2], lineIndex: index, indent: match[1]?.length || 0 };
    })
    .filter((value): value is { name: string; lineIndex: number; indent: number } => Boolean(value));

const extractFunctionDocstring = (lines: string[], fn: { lineIndex: number; indent: number }): string => {
  for (let index = fn.lineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] || '';
    if (!line.trim()) continue;
    const indent = /^\s*/u.exec(line)?.[0].length || 0;
    if (indent <= fn.indent) return '';
    const open = /^\s*("""|''')([\s\S]*)$/u.exec(line);
    if (!open?.[1]) return '';
    const quote = open[1];
    const firstLine = open[2] || '';
    const parts = [firstLine.replace(new RegExp(`${quote}\\s*$`, 'u'), '').trim()];
    if (firstLine.includes(quote)) return parts.join('\n').trim();
    for (let docIndex = index + 1; docIndex < lines.length; docIndex += 1) {
      const docLine = lines[docIndex] || '';
      const closeIndex = docLine.indexOf(quote);
      if (closeIndex >= 0) {
        parts.push(docLine.slice(0, closeIndex).trim());
        return parts.join('\n').trim();
      }
      parts.push(docLine.trim());
    }
    return parts.join('\n').trim();
  }
  return '';
};

const extractPrecedingFunctionComment = (lines: string[], fn: { lineIndex: number }): string => {
  const comments: string[] = [];
  for (let index = fn.lineIndex - 1; index >= 0 && index >= fn.lineIndex - 8; index -= 1) {
    const trimmed = (lines[index] || '').trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('#')) break;
    comments.unshift(trimmed.replace(/^#+\s*/u, ''));
  }
  return comments.join(' ').trim();
};

const FUNCTION_DESCRIPTION_REQUIREMENTS: Array<[string, RegExp]> = [
  ['inputs', /\b(?:inputs?|args?|arguments?|parameters?|receives?|consumes?)\b|输入|参数/iu],
  ['outputs', /\b(?:outputs?|returns?|writes?|emits?|produces?)\b|输出|返回|产出/iu],
  ['assumptions', /\b(?:assumptions?|assumes?|requires?|preconditions?|limitations?|boundary|boundaries)\b|假设|前提|限制|边界/iu],
  [
    'scientific/reproducibility decision',
    /\b(?:scientific|reproducibility|decision|rationale|method|why|gate|gates|interpretation)\b|科学|复现|决策|依据|方法|解释/iu,
  ],
];

const functionDocumentationMissingParts = (description: string): string[] => {
  if (description.trim().length < 120) return FUNCTION_DESCRIPTION_REQUIREMENTS.map(([label]) => label);
  return FUNCTION_DESCRIPTION_REQUIREMENTS.filter(([, pattern]) => !pattern.test(description)).map(([label]) => label);
};

const functionDocumentationIssues = (modulePath: string, content: string): string[] => {
  const functions = publicPythonFunctions(content);
  if (!functions.length) return [`Script module must expose at least one public helper function: ${modulePath}.`];
  const lines = content.split(/\r?\n/u);
  const issues: string[] = [];
  for (const fn of functions) {
    const description = extractFunctionDocstring(lines, fn) || extractPrecedingFunctionComment(lines, fn);
    const missingParts = functionDocumentationMissingParts(description);
    if (missingParts.length) {
      issues.push(
        `Public helper function documentation must describe inputs, outputs, assumptions, and scientific/reproducibility decision: ${modulePath}:${fn.name} (missing ${missingParts.join(', ')}).`
      );
    }
  }
  return issues;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const meaningfulText = (value: unknown, minLength = 24): boolean =>
  typeof value === 'string' && value.trim().length >= minLength;

const validateScientificDecisions = (
  manifest: Record<string, unknown>,
  validImplementationPaths: Set<string>
): string[] => {
  const decisions = Array.isArray(manifest.scientificDecisions)
    ? manifest.scientificDecisions.map(asRecord).filter(Boolean)
    : [];
  if (decisions.length < 4) {
    return ['script_manifest.json must include at least four scientificDecisions documenting key analysis choices.'];
  }
  const issues: string[] = [];
  decisions.forEach((decision, index) => {
    const label =
      typeof decision?.decisionId === 'string' && decision.decisionId.trim()
        ? decision.decisionId.trim()
        : `scientificDecisions[${index}]`;
    if (!meaningfulText(decision?.topic, 8)) issues.push(`${label} must declare a concrete decision topic.`);
    if (!meaningfulText(decision?.rationale, 40)) {
      issues.push(`${label} must include a substantive rationale, not a label-only note.`);
    }
    if (!meaningfulText(decision?.limitation, 24)) issues.push(`${label} must document the limitation or boundary.`);
    const implementedIn = asStringArray(decision?.implementedIn);
    if (!implementedIn.length) {
      issues.push(`${label} must list implementedIn script/module paths.`);
    } else {
      for (const implementationPath of implementedIn) {
        if (!validImplementationPaths.has(implementationPath.replaceAll('\\', '/'))) {
          issues.push(`${label} implementedIn path is not declared in script_manifest.json: ${implementationPath}.`);
        }
      }
    }
    if (!asStringArray(decision?.outputsAffected).length) {
      issues.push(`${label} must list outputsAffected for traceability.`);
    }
  });
  return issues;
};

const readJsonFile = (candidate: string): unknown => JSON.parse(fs.readFileSync(candidate, 'utf8'));

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const REQUIRED_EXPLORATION_MODULE_IDS = FREE_EXPLORATION_MODULE_PLAN.filter((module) => module.required).map(
  (module) => module.moduleId
);

const ALL_EXPLORATION_MODULE_IDS = FREE_EXPLORATION_MODULE_PLAN.map((module) => module.moduleId);

const WORKFLOW_MODULE_BY_ID = new Map(FREE_EXPLORATION_MODULE_PLAN.map((module) => [module.moduleId, module]));

const KNOWN_ENVIRONMENT_REFS = new Set(BIO_ENVIRONMENTS.map((environment) => environment.id));

const moduleOutputPathIssue = (candidate: string, outputRoot: string): string | undefined => {
  const normalized = candidate.replaceAll('\\', '/').trim();
  if (!normalized || path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//u.test(normalized)) {
    return `Workflow module output must be project-relative or stage-root-relative: ${candidate}`;
  }
  if (normalized.includes('://') || normalized === '..' || normalized.startsWith('../')) {
    return `Workflow module output is not a local project-relative path: ${candidate}`;
  }
  const collapsed = path.posix.normalize(normalized);
  if (collapsed === '..' || collapsed.startsWith('../')) return `Workflow module output escapes the project: ${candidate}`;
  if (collapsed.startsWith(`${outputRoot}/`)) return undefined;
  if (/^(?:source|scripts|configs|results|reports|logs)\//u.test(collapsed)) return undefined;
  return `Workflow module output must stay under ${outputRoot} or be relative to the exploration stage root: ${candidate}`;
};

const implementationPathIssue = (
  implementationPath: string,
  entrypoint: string,
  modulePaths: Set<string>
): string | undefined => {
  const normalized = implementationPath.replaceAll('\\', '/').trim();
  if (normalized === entrypoint || modulePaths.has(normalized)) return undefined;
  return `Workflow module implementation path is not declared in script_manifest.json: ${implementationPath}`;
};

const runtimeProbeReceiptPassed = (
  projectRoot: string,
  receiptId: string,
  environmentRef: string
): string | undefined => {
  if (!receiptId.trim()) return `Workflow module ${environmentRef} is missing environmentProbeReceiptId.`;
  try {
    const receipt = readReceipt(projectRoot, receiptId);
    if (receipt.producer !== 'bio_runtime') return `Environment probe receipt ${receiptId} is not from bio_runtime.`;
    if (!['probe_environment', 'probe_environments'].includes(receipt.action)) {
      return `Environment probe receipt ${receiptId} is not a probe action.`;
    }
    if (receipt.action === 'probe_environment') {
      const details = receipt.details || {};
      if (details.environmentRef !== environmentRef) {
        return `Environment probe receipt ${receiptId} does not match ${environmentRef}.`;
      }
      if (asRecord(details.probe)?.status !== 'passed') {
        return `Environment probe receipt ${receiptId} did not pass for ${environmentRef}.`;
      }
      return undefined;
    }
    const probes = asRecord(receipt.details)?.probes;
    const matching = Array.isArray(probes)
      ? probes.map(asRecord).find((probe) => probe?.environmentRef === environmentRef)
      : undefined;
    if (!matching) return `Composite probe receipt ${receiptId} has no entry for ${environmentRef}.`;
    if (asRecord(matching.probe)?.status !== 'passed') {
      return `Composite probe receipt ${receiptId} did not pass for ${environmentRef}.`;
    }
    return undefined;
  } catch (error) {
    return `Environment probe receipt ${receiptId} cannot be read: ${error instanceof Error ? error.message : 'unknown error'}`;
  }
};

const validateWorkflowModules = (params: {
  manifest: Record<string, unknown>;
  projectRoot: string;
  outputRoot: string;
  entrypoint: string;
  modulePaths: Set<string>;
}): string[] => {
  const issues: string[] = [];
  const modules = Array.isArray(params.manifest.workflowModules)
    ? params.manifest.workflowModules.map(asRecord).filter(Boolean)
    : [];
  if (!modules.length) {
    return ['script_manifest.json must include workflowModules mapped to the OpenBioScience exploration module plan.'];
  }
  const moduleIds = new Set(modules.map((module) => (typeof module?.moduleId === 'string' ? module.moduleId : '')));
  for (const moduleId of ALL_EXPLORATION_MODULE_IDS) {
    if (!moduleIds.has(moduleId)) {
      issues.push(`workflowModules must declare moduleId: ${moduleId}.`);
    }
  }
  for (const requiredId of REQUIRED_EXPLORATION_MODULE_IDS) {
    if (!moduleIds.has(requiredId)) issues.push(`workflowModules is missing required moduleId: ${requiredId}.`);
  }
  const blockedModuleIds = new Set<string>();
  for (const module of modules) {
    const moduleId = typeof module?.moduleId === 'string' ? module.moduleId.trim() : '';
    const label = moduleId || 'workflowModules entry';
    const plan = WORKFLOW_MODULE_BY_ID.get(moduleId);
    if (!moduleId) {
      issues.push('workflowModules entry must include moduleId.');
      continue;
    }
    if (!plan) issues.push(`Unknown workflow moduleId: ${moduleId}.`);
    const status = typeof module.status === 'string' ? module.status.trim() : '';
    if (!['completed', 'blocked', 'not_applicable'].includes(status)) {
      issues.push(`${label} status must be completed, blocked, or not_applicable.`);
    }
    const skillIds = asStringArray(module.skillIds);
    const mcpTools = asStringArray(module.mcpTools);
    const environmentRef = typeof module.environmentRef === 'string' ? module.environmentRef.trim() : '';
    const implementation = asStringArray(module.implementation);
    const outputs = asStringArray(module.outputs);
    if (!skillIds.length) issues.push(`${label} must list skillIds.`);
    if (!mcpTools.length) issues.push(`${label} must list mcpTools.`);
    if (status === 'completed') {
      if (!implementation.length) issues.push(`${label} completed module must list implementation paths.`);
      if (!outputs.length) issues.push(`${label} completed module must list outputs.`);
    }
    if (
      status === 'not_applicable' &&
      !meaningfulText(module.reason, 24) &&
      !meaningfulText(module.notApplicableReason, 24)
    ) {
      issues.push(`${label} not_applicable module must include reason or notApplicableReason.`);
    }
    for (const implementationPath of implementation) {
      const issue = implementationPathIssue(implementationPath, params.entrypoint, params.modulePaths);
      if (issue) issues.push(`${label}: ${issue}.`);
    }
    for (const output of outputs) {
      const issue = moduleOutputPathIssue(output, params.outputRoot);
      if (issue) issues.push(`${label}: ${issue}.`);
    }
    if (environmentRef) {
      if (!KNOWN_ENVIRONMENT_REFS.has(environmentRef) && !environmentRef.startsWith('user:')) {
        issues.push(`${label} declares unknown environmentRef: ${environmentRef}.`);
      }
      const allowedEnvironmentRefs = new Set(plan?.environmentRefs || []);
      if (plan && allowedEnvironmentRefs.size && !allowedEnvironmentRefs.has(environmentRef)) {
        issues.push(`${label} environmentRef ${environmentRef} is not listed for ${moduleId}.`);
      }
      if (status === 'completed') {
        const probeIssue = runtimeProbeReceiptPassed(
          params.projectRoot,
          typeof module.environmentProbeReceiptId === 'string' ? module.environmentProbeReceiptId : '',
          environmentRef
        );
        if (probeIssue) issues.push(`${label}: ${probeIssue}`);
      }
    } else if (plan?.environmentRefs.length && status === 'completed') {
      issues.push(`${label} completed module must declare environmentRef.`);
    }
    if (status === 'blocked') {
      blockedModuleIds.add(moduleId);
      if (!meaningfulText(module.blockerReason, 24)) {
        issues.push(`${label} blocked module must include blockerReason.`);
      }
      if (!outputs.some((output) => output.endsWith('blocked_or_limited_contrasts.tsv'))) {
        issues.push(`${label} blocked module must reference results/tables/blocked_or_limited_contrasts.tsv.`);
      }
    }
  }
  if (blockedModuleIds.size && !modules.some((module) => asStringArray(module.outputs).some((output) => output.endsWith('blocked_or_limited_contrasts.tsv')))) {
    issues.push('workflowModules with blocked status must map to blocked_or_limited_contrasts output.');
  }
  return issues;
};

const completedWorkflowModuleIds = (manifest: Record<string, unknown>): Set<string> => {
  const modules = Array.isArray(manifest.workflowModules) ? manifest.workflowModules.map(asRecord).filter(Boolean) : [];
  return new Set(
    modules
      .filter((module) => module.status === 'completed')
      .map((module) => (typeof module.moduleId === 'string' ? module.moduleId.trim() : ''))
      .filter(Boolean)
  );
};

const resourceField = (record: Record<string, unknown>, names: string[]): string =>
  names.map((name) => record[name]).find((value): value is string => typeof value === 'string' && value.trim().length > 0) ||
  '';

const localMarkerResourceIssues = (projectRoot: string, resource: Record<string, unknown>, label: string): string[] => {
  const roots = resolveKnowledgeResourceRoots();
  const markerPackages = readMarkerResourceIndex(roots.markerRoot).filter((item) => item.availability === 'available');
  const resourceId = resourceField(resource, ['resourceId', 'id']);
  const resourcePath = resourceField(resource, ['resourcePath', 'path', 'sourcePath']).replaceAll('\\', '/');
  const matchingPackage = markerPackages.find(
    (item) => item.resourceId === resourceId || item.packageId === resourceId
  );
  const issues: string[] = [];
  if (!matchingPackage) {
    issues.push(`${label} must reference an available local marker package from bio_knowledge.search_atlas.`);
  }
  if (resourcePath) {
    const normalized = path.posix.normalize(resourcePath);
    if (normalized.includes('://') || normalized === '..' || normalized.startsWith('../')) {
      issues.push(`${label} resourcePath must be a local marker resource path.`);
    }
    const candidatePaths = [
      path.resolve(projectRoot, resourcePath),
      path.resolve(process.cwd(), resourcePath),
      path.resolve(roots.markerRoot, resourcePath),
    ];
    if (!candidatePaths.some((candidate) => fs.existsSync(candidate))) {
      issues.push(`${label} resourcePath does not resolve to a readable local marker file: ${resourcePath}.`);
    }
    if (matchingPackage) {
      const expected = matchingPackage.recordsFile.replaceAll('\\', '/');
      const expectedFromRoot = `resources/bio/markers/${expected}`;
      if (expected && resourcePath !== expected && !resourcePath.endsWith(`/${expected}`) && resourcePath !== expectedFromRoot) {
        issues.push(`${label} resourcePath must match the indexed records_file for ${matchingPackage.resourceId}.`);
      }
    }
  }
  return issues;
};

const validateResourceProvenance = (manifest: Record<string, unknown>, projectRoot: string): string[] => {
  const issues: string[] = [];
  const completedModules = completedWorkflowModuleIds(manifest);
  const provenance = asRecord(manifest.resourceProvenance);
  const markerResources = Array.isArray(provenance?.markerResources)
    ? provenance.markerResources.map(asRecord).filter(Boolean)
    : [];
  const geneSetResources = Array.isArray(provenance?.geneSetResources)
    ? provenance.geneSetResources.map(asRecord).filter(Boolean)
    : [];
  if (completedModules.has('cell_annotation_review')) {
    if (!markerResources.length) {
      issues.push(
        'script_manifest.json resourceProvenance.markerResources is required when cell_annotation_review is completed.'
      );
    }
    markerResources.forEach((resource, index) => {
      const label = `resourceProvenance.markerResources[${index}]`;
      if (!resourceField(resource, ['resourceId', 'id'])) issues.push(`${label} must include resourceId.`);
      if (!resourceField(resource, ['version', 'status'])) issues.push(`${label} must include version or status.`);
      if (!resourceField(resource, ['resourcePath', 'path', 'sourcePath'])) issues.push(`${label} must include resourcePath.`);
      if (!asStringArray(resource.sourcePapers).length && !asStringArray(resource.source_paper).length) {
        issues.push(`${label} must include sourcePapers from the marker evidence used for annotation.`);
      }
      if (!resourceField(resource, ['evidenceType', 'evidence_type'])) issues.push(`${label} must include evidenceType.`);
      if (!resourceField(resource, ['confidence'])) issues.push(`${label} must include confidence.`);
      issues.push(...localMarkerResourceIssues(projectRoot, resource, label));
    });
  }
  if (completedModules.has('scrna_pathway_enrichment')) {
    if (!geneSetResources.length) {
      issues.push(
        'script_manifest.json resourceProvenance.geneSetResources is required when scrna_pathway_enrichment is completed.'
      );
    }
    geneSetResources.forEach((resource, index) => {
      const label = `resourceProvenance.geneSetResources[${index}]`;
      if (!resourceField(resource, ['provider'])) issues.push(`${label} must include provider.`);
      if (!resourceField(resource, ['collection', 'resourceId', 'id'])) issues.push(`${label} must include collection or resourceId.`);
      if (!resourceField(resource, ['species'])) issues.push(`${label} must include species.`);
      if (!resourceField(resource, ['resourcePath', 'path', 'sourcePath'])) issues.push(`${label} must include resourcePath.`);
    });
  }
  return issues;
};

const relativeToScriptsRoot = (outputRoot: string, scriptPath: string): string =>
  path.posix.relative(`${outputRoot}/scripts`, path.posix.normalize(scriptPath.replaceAll('\\', '/')));

const validateExplorationScriptPackage = (params: {
  projectRoot: string;
  outputRoot: string;
  scriptPath: string;
  content: string;
  environmentRef?: string;
}): string[] => {
  const violations: string[] = [];
  const scriptsRootRelative = `${params.outputRoot}/scripts`;
  const scriptsRootAbsolute = path.join(params.projectRoot, scriptsRootRelative);
  const manifestRelative = `${scriptsRootRelative}/script_manifest.json`;
  const manifestAbsolute = path.join(params.projectRoot, manifestRelative);
  const allFiles = walkFiles(scriptsRootAbsolute);
  if (allFiles.some((file) => file.split(path.sep).includes('__pycache__'))) {
    violations.push('Canonical scripts directory must not contain __pycache__ files.');
  }
  if (!fs.existsSync(manifestAbsolute)) {
    violations.push(`Exploration scripts must include ${manifestRelative}.`);
    return violations;
  }

  let manifest: Record<string, unknown> | undefined;
  try {
    manifest = asRecord(readJsonFile(manifestAbsolute));
  } catch (error) {
    violations.push(
      `script_manifest.json is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`
    );
    return violations;
  }
  if (!manifest) {
    violations.push('script_manifest.json must be a JSON object.');
    return violations;
  }
  if (manifest.schema !== ANALYSIS_SCRIPT_PACKAGE_SCHEMA) {
    violations.push(`script_manifest.json must use schema ${ANALYSIS_SCRIPT_PACKAGE_SCHEMA}.`);
  }
  const entrypoint = typeof manifest.entrypoint === 'string' ? manifest.entrypoint.trim() : '';
  const expectedEntrypoint = relativeToScriptsRoot(params.outputRoot, params.scriptPath);
  if (entrypoint !== expectedEntrypoint) {
    violations.push(`script_manifest.json entrypoint must be ${expectedEntrypoint}.`);
  }
  const modules = Array.isArray(manifest.modules) ? manifest.modules.map(asRecord).filter(Boolean) : [];
  if (modules.length < 2) {
    violations.push('Exploration script package must declare at least two functional module files.');
  }
  const modulePaths = modules
    .map((module) => (typeof module?.path === 'string' ? module.path.trim().replaceAll('\\', '/') : ''))
    .filter(Boolean);
  if (modulePaths.some((modulePath) => !modulePath.startsWith('modules/') || !modulePath.endsWith('.py'))) {
    violations.push('Exploration module files must be Python files under scripts/modules/.');
  }
  const validImplementationPaths = new Set([entrypoint, ...modulePaths]);
  violations.push(...validateScientificDecisions(manifest, validImplementationPaths));
  violations.push(...validateResourceProvenance(manifest, params.projectRoot));
  violations.push(
    ...validateWorkflowModules({
      manifest,
      projectRoot: params.projectRoot,
      outputRoot: params.outputRoot,
      entrypoint,
      modulePaths: new Set(modulePaths),
    })
  );
  for (const modulePath of modulePaths) {
    const moduleAbsolute = path.join(scriptsRootAbsolute, modulePath);
    if (!fs.existsSync(moduleAbsolute) || !fs.statSync(moduleAbsolute).isFile()) {
      violations.push(`Declared script module does not exist: ${path.posix.join(scriptsRootRelative, modulePath)}.`);
      continue;
    }
    const moduleContent = fs.readFileSync(moduleAbsolute, 'utf8');
    if (!hasHumanReadableModuleComment(moduleContent)) {
      violations.push(`Script module lacks a human-readable module docstring/comment: ${modulePath}.`);
    }
    violations.push(...functionDocumentationIssues(modulePath, moduleContent));
    if (params.environmentRef) {
      const moduleSyntaxIssue = syntaxIssue(
        params.projectRoot,
        path.posix.join(scriptsRootRelative, modulePath),
        params.environmentRef
      );
      if (moduleSyntaxIssue) violations.push(moduleSyntaxIssue);
    }
  }
  const lineCount = params.content.split(/\r?\n/u).length;
  if (lineCount > 240) {
    violations.push(
      'Exploration entrypoint must stay short and orchestrate module steps; move analysis logic into scripts/modules/.'
    );
  }
  const stepComments = params.content.match(/^\s*#\s*(?:Step|Stage|Phase)\s+\d+/gimu) || [];
  if (stepComments.length < 3) {
    violations.push('Exploration entrypoint must include human-readable Step comments for the staged workflow.');
  }
  return violations;
};

const environmentPrefix = (projectRoot: string, environmentRef: string): string | undefined => {
  if (!/^[A-Za-z0-9._:-]+$/u.test(environmentRef) || environmentRef.startsWith('user:')) return undefined;
  const candidates = [
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT
      ? path.join(process.env.OPENBIOSCIENCE_RUNTIME_ROOT, 'environments', 'official', environmentRef)
      : '',
    process.env.OPENBIOSCIENCE_ENV_ROOT
      ? path.join(process.env.OPENBIOSCIENCE_ENV_ROOT, 'environments', 'official', environmentRef)
      : '',
    process.env.OPENSCIENCE_RUNTIME_ROOT
      ? path.join(process.env.OPENSCIENCE_RUNTIME_ROOT, 'environments', 'official', environmentRef)
      : '',
    process.env.OPENBIOSCIENCE_ENV_ROOT ? path.join(process.env.OPENBIOSCIENCE_ENV_ROOT, environmentRef) : '',
    path.join('/env', environmentRef),
    path.join(projectRoot, '.openbioscience', 'environments', environmentRef),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
};

const writableCacheEnv = (): Record<string, string> => {
  const cacheRoot = path.join(process.env.DEEPORGANISER_WORK_DIR || os.tmpdir(), 'openbioscience-cache');
  const env = {
    XDG_CACHE_HOME: path.join(cacheRoot, 'xdg'),
    MPLCONFIGDIR: path.join(cacheRoot, 'matplotlib'),
    NUMBA_CACHE_DIR: path.join(cacheRoot, 'numba'),
  };
  for (const dir of Object.values(env)) fs.mkdirSync(dir, { recursive: true });
  return env;
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
      ...writableCacheEnv(),
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
  stage: 'intake' | 'qc' | 'baseline' | 'exploration' | 'episode';
  episodeId?: string;
  contractReceiptId: string;
  scriptPath: string;
}): AnalysisScriptPreflight => {
  const outputRoot = stageOutputRelativePath(params.analysisId, params.stage, params.episodeId);
  const pathIssue = scriptPathIssue(params.scriptPath, outputRoot);
  if (pathIssue) {
    return {
      path: params.scriptPath,
      contentHash: sha256(''),
      violations: [pathIssue],
    };
  }
  const normalizedScriptPath = path.posix.normalize(params.scriptPath.replaceAll('\\', '/'));
  const absolutePath = path.join(params.projectRoot, normalizedScriptPath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return {
      path: normalizedScriptPath,
      contentHash: sha256(''),
      violations: [`Analysis script does not exist: ${normalizedScriptPath}`],
    };
  }
  const content = fs.readFileSync(absolutePath, 'utf8');
  const headers = headerValues(content);
  const normalizedHeaders = normalizedHeaderLookup(headers);
  const violations: string[] = [];
  for (const name of REQUIRED_HEADERS) if (!headers[name]) violations.push(`Missing ${name} header.`);
  if (
    normalizedHeaders[HEADER_KEYS.workflowKind.toLowerCase()] &&
    normalizedHeaders[HEADER_KEYS.workflowKind.toLowerCase()] !== 'omics_analysis'
  ) {
    violations.push('Workflow kind must be omics_analysis.');
  }
  if (
    normalizedHeaders[HEADER_KEYS.analysisId.toLowerCase()] &&
    normalizedHeaders[HEADER_KEYS.analysisId.toLowerCase()] !== params.analysisId
  ) {
    violations.push('Analysis ID does not match the stage contract.');
  }
  const expectedStageId = params.episodeId || params.stage;
  if (
    normalizedHeaders[HEADER_KEYS.stageOrEpisodeId.toLowerCase()] &&
    normalizedHeaders[HEADER_KEYS.stageOrEpisodeId.toLowerCase()] !== expectedStageId
  ) {
    violations.push('Stage or episode ID does not match the stage contract.');
  }
  if (
    normalizedHeaders[HEADER_KEYS.contractReceiptId.toLowerCase()] &&
    normalizedHeaders[HEADER_KEYS.contractReceiptId.toLowerCase()] !== params.contractReceiptId
  ) {
    violations.push('Contract receipt ID does not match the current stage contract.');
  }
  if (
    normalizedHeaders[HEADER_KEYS.externalEgressPolicy.toLowerCase()] &&
    !/^(?:forbidden|allowlisted)$/iu.test(normalizedHeaders[HEADER_KEYS.externalEgressPolicy.toLowerCase()])
  ) {
    violations.push('External egress policy must be forbidden or allowlisted.');
  }
  for (const candidate of listedPaths(normalizedHeaders[HEADER_KEYS.inputs.toLowerCase()])) {
    const issue = projectPathIssue(candidate, outputRoot, false);
    if (issue) violations.push(issue);
  }
  const outputPaths = listedPaths(normalizedHeaders[HEADER_KEYS.outputs.toLowerCase()]);
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
  const environmentRef = normalizedHeaders[HEADER_KEYS.environmentRef.toLowerCase()];
  if (environmentRef) {
    const issue = syntaxIssue(params.projectRoot, params.scriptPath, environmentRef);
    if (issue) violations.push(issue);
  }
  if (params.stage === 'exploration') {
    violations.push(
      ...validateExplorationScriptPackage({
        projectRoot: params.projectRoot,
        outputRoot,
        scriptPath: params.scriptPath,
        content,
        environmentRef,
      })
    );
  }
  return {
    path: params.scriptPath,
    contentHash: sha256(content),
    ...(environmentRef ? { environmentRef } : {}),
    violations: [...new Set(violations)],
  };
};
