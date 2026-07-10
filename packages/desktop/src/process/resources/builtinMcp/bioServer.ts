/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  BIO_ENVIRONMENTS,
  BIO_MCP_PROFILES,
  BIO_PLOT_TEMPLATES,
  BIO_WORKFLOWS,
  resolveBioProfile,
  type BioMcpCatalogItem,
  type BioMcpProfile,
} from './bio/catalog';
import {
  hasCredentialLikeUrl,
  publicHttpUrlStatus,
  redactCredentialText,
  redactCredentialUrl,
  safeAbsolutePathStatus,
  safeChildPathStatus,
  safeOutputDirectoryStatus,
} from './bio/pathSafety';

type JsonRecord = Record<string, unknown>;
type SourceAuditDataItem = {
  id: string;
  kind: string;
  modality: string;
  source: string;
  accession: string;
  url: string;
  localPath: string;
  sizeBytes: number | null;
  access: string;
  licenseOrTerms: string;
  status: string;
  supports: string[];
  blocks: string[];
  notes: string;
};
type SourceAuditCodeItem = {
  id: string;
  repository: string;
  commitOrRelease: string;
  license: string;
  environmentFiles: string[];
  scriptIndex: string[];
  notebooks: string[];
  runnableAsIs: boolean;
  status: string;
  notes: string;
};
type SourceAuditReferenceResourceItem = {
  id: string;
  kind: string;
  name: string;
  version: string;
  source: string;
  url: string;
  localPath: string;
  status: string;
  requiredBy: string[];
  notes: string;
};

const RESULT_SCHEMA = 'openbioscience.bio_mcp.result.v1';
const DEFAULT_RUNTIME_ROOT = '${OPENBIOSCIENCE_RUNTIME_ROOT}';
const DEFAULT_REPRODUCTION_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
const REPRODUCTION_PLANNING_STATUSES = [
  'ready',
  'partial_ready',
  'conditional_continue',
  'planned_only',
  'blocked_for_localization',
  'blocked_for_execution',
  'unresolved',
  'fatal_block',
] as const;
const REPRODUCTION_PLAN_SECTIONS = [
  'reproduction objective',
  'paper and source summary',
  'data, code, and reference availability',
  'ready, conditional, and blocked scope',
  'planned execution modules',
  'expected outputs',
  'environmentRef candidates',
  'skill and MCP route',
  'execution boundary',
] as const;

const jsonText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const uniqueStrings = (values: unknown[]): string[] =>
  Array.from(new Set(values.map((value) => asString(value)).filter(Boolean))).sort();

const asBoolean = (value: unknown): boolean => value === true;

const firstNumber = (...values: unknown[]): number | undefined => {
  const found = values.find((value) => typeof value === 'number' && Number.isFinite(value));
  return typeof found === 'number' ? found : undefined;
};

const asPositiveInteger = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
};

const runtimeRoot = (): string =>
  process.env.OPENBIOSCIENCE_RUNTIME_ROOT ||
  process.env.OPENSCIENCE_RUNTIME_ROOT ||
  process.env.DEEPORGANISER_WORK_DIR ||
  DEFAULT_RUNTIME_ROOT;

const isCredentialKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('token') ||
    normalized.includes('cookie') ||
    normalized.includes('credential') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('apikey') ||
    normalized.includes('api_key') ||
    normalized === 'key' ||
    normalized === 'authorization' ||
    normalized === 'auth' ||
    normalized === 'signature' ||
    normalized === 'sig' ||
    normalized.startsWith('x-amz-')
  );
};

const sanitizeSourceValue = (value: unknown): { value: unknown; redacted: boolean } => {
  if (Array.isArray(value)) {
    let redacted = false;
    const sanitized = value.map((item) => {
      const result = sanitizeSourceValue(item);
      redacted ||= result.redacted;
      return result.value;
    });
    return { value: sanitized, redacted };
  }
  if (typeof value === 'string') return redactCredentialText(value);
  if (!isRecord(value)) return { value, redacted: false };

  let redacted = false;
  const sanitized = Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      if (isCredentialKey(key) && nested) {
        redacted = true;
        return [key, '[redacted]'];
      }
      const result = sanitizeSourceValue(nested);
      redacted ||= result.redacted;
      return [key, result.value];
    })
  );
  return { value: sanitized, redacted };
};

const uniqueSanitizedStrings = (values: unknown[]): string[] =>
  Array.from(new Set(values.map((value) => asString(sanitizeSourceValue(value).value)).filter(Boolean))).sort();

const environmentPath = (environmentRef: string): string =>
  runtimeRoot() === DEFAULT_RUNTIME_ROOT
    ? `${DEFAULT_RUNTIME_ROOT}/environments/official/${environmentRef}`
    : path.join(runtimeRoot(), 'environments', 'official', environmentRef);

const pathStatus = (candidate: string): 'configured' | 'available' | 'missing' =>
  candidate.includes('${') ? 'configured' : fs.existsSync(candidate) ? 'available' : 'missing';

const profileFromEnv = (): BioMcpProfile => resolveBioProfile(process.env.OPENBIOSCIENCE_BIO_MCP_PROFILE);

const definitionFor = (profile: BioMcpProfile) => BIO_MCP_PROFILES[profile];

const missingFields = (payload: JsonRecord | undefined, fields: string[]): string[] =>
  fields.filter((field) => !asString(payload?.[field]));

const catalogById = (items: BioMcpCatalogItem[], id?: string): BioMcpCatalogItem | undefined =>
  id ? items.find((item) => item.id === id) : undefined;

const resolveEnvironment = (environmentRef: string) => {
  const catalog = catalogById(BIO_ENVIRONMENTS, environmentRef);
  const resolvedPath = environmentPath(environmentRef);
  return {
    environmentRef,
    status: pathStatus(resolvedPath),
    path: resolvedPath,
    catalog,
    warnings: catalog ? [] : [`Unknown environmentRef "${environmentRef}".`],
  };
};

const statusPayload = (profile: BioMcpProfile) => {
  const definition = definitionFor(profile);
  return {
    schema: RESULT_SCHEMA,
    action: 'status',
    status: profile === 'reproduction' ? 'ready' : 'supported',
    profile,
    serverName: definition.serverName,
    toolName: definition.toolName,
    runtimeRoot: runtimeRoot(),
    actions: definition.actions,
    environmentIndex: `${runtimeRoot()}/environments/official/README.md`,
    notes: [
      'This MCP exposes OpenBioScience control-plane contracts only.',
      'Use science_artifact to record concrete evidence, outputs, warnings, and blocked claims.',
      'Official environment paths are resolved from OPENBIOSCIENCE_RUNTIME_ROOT when configured.',
    ],
    ...(profile === 'reproduction'
      ? {
          planningOnly: true,
          planningStatuses: REPRODUCTION_PLANNING_STATUSES,
          localizationPolicy: {
            defaultSingleFileLimitBytes: DEFAULT_REPRODUCTION_FILE_LIMIT_BYTES,
            publicHttpOnly: true,
            noCredentialsCookiesOrTokens: true,
            overwriteDefault: false,
            executesAnalysis: false,
            installsPackages: false,
            clonesRepositories: false,
            performsHeavyDownloads: false,
          },
        }
      : {}),
    timestamp: Date.now(),
  };
};

const handleRuntimeAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') return statusPayload('runtime');
  if (action === 'list_environments') {
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'supported',
      runtimeRoot: runtimeRoot(),
      environments: BIO_ENVIRONMENTS.map((environment) => ({
        ...environment,
        path: environmentPath(environment.id),
        pathStatus: pathStatus(environmentPath(environment.id)),
      })),
      timestamp: Date.now(),
    };
  }
  if (action === 'resolve_environment' || action === 'probe_environment') {
    const environmentRef = asString(payload?.environmentRef || payload?.environment_ref);
    if (!environmentRef) throw new Error(`${action} requires environmentRef.`);
    const resolved = resolveEnvironment(environmentRef);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: resolved.status === 'missing' ? 'conditional' : 'supported',
      ...resolved,
      probe: {
        mode: 'path_only',
        importChecksRun: false,
        reason: 'This first-pass MCP skeleton records environment resolution without running package imports.',
      },
      timestamp: Date.now(),
    };
  }
  if (action === 'list_workflows') {
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'supported',
      workflows: BIO_WORKFLOWS,
      timestamp: Date.now(),
    };
  }
  if (action === 'validate_workflow') {
    const workflowId = asString(payload?.workflowId || payload?.workflow_id);
    const workflow = catalogById(BIO_WORKFLOWS, workflowId);
    if (!workflow) {
      return {
        schema: RESULT_SCHEMA,
        action,
        status: 'blocked',
        workflowId,
        warnings: [`Unknown workflowId "${workflowId || '<missing>'}".`],
        knownWorkflows: BIO_WORKFLOWS.map((item) => item.id),
        timestamp: Date.now(),
      };
    }
    const required = workflow.requiredFields || [];
    const missing = missingFields(isRecord(payload?.config) ? payload.config : payload, required);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: missing.length ? 'conditional' : 'supported',
      workflow,
      missingFields: missing,
      environmentCandidates: workflow.environmentRefs?.map(resolveEnvironment) || [],
      timestamp: Date.now(),
    };
  }
  if (action === 'list_plot_templates') {
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'supported',
      templates: BIO_PLOT_TEMPLATES,
      timestamp: Date.now(),
    };
  }
  if (action === 'validate_plot_inputs') {
    return validatePlotInputs(action, payload);
  }
  if (action === 'summarize_outputs') {
    const outputPaths = uniqueStrings(asArray(payload?.outputPaths || payload?.output_paths));
    return {
      schema: RESULT_SCHEMA,
      action,
      status: outputPaths.length ? 'conditional' : 'blocked',
      outputPaths,
      summaries: outputPaths.map((outputPath) => ({
        path: outputPath,
        status: safeAbsolutePathStatus(outputPath),
      })),
      warnings: outputPaths.length ? [] : ['summarize_outputs requires outputPaths.'],
      timestamp: Date.now(),
    };
  }
  throw new Error(`Unsupported runtime action "${action}".`);
};

const validatePlotInputs = (action: string, payload?: JsonRecord) => {
  const templateId = asString(payload?.templateId || payload?.template_id);
  const template = catalogById(BIO_PLOT_TEMPLATES, templateId);
  if (!template) {
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'blocked',
      templateId,
      warnings: [`Unknown templateId "${templateId || '<missing>'}".`],
      knownTemplates: BIO_PLOT_TEMPLATES.map((item) => item.id),
      timestamp: Date.now(),
    };
  }
  const required = template.requiredFields || [];
  const missing = missingFields(isRecord(payload?.config) ? payload.config : payload, required);
  return {
    schema: RESULT_SCHEMA,
    action,
    status: missing.length ? 'conditional' : 'supported',
    template,
    missingFields: missing,
    manifestSchema: 'openbioscience.scrna_plot.manifest.v1',
    timestamp: Date.now(),
  };
};

const handleSourceAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') return statusPayload('source');
  if (action === 'resolve_accession') {
    const accession = asString(payload?.accession);
    const sourceHint = asString(payload?.source || payload?.sourceHint || payload?.source_hint, 'auto');
    return {
      schema: RESULT_SCHEMA,
      action,
      status: accession ? 'conditional' : 'blocked',
      accession,
      sourceHint,
      candidateSources: accession ? inferAccessionSources(accession) : [],
      nextActions: accession
        ? [
            'Use research_evidence for paper/source context.',
            'Use bio_source plan_download after confirming access rights.',
          ]
        : ['Provide GEO/SRA/ArrayExpress/EGA/BioStudies/Zenodo/Figshare accession or local path.'],
      timestamp: Date.now(),
    };
  }
  if (action === 'verify_local_assets' || action === 'build_data_manifest') {
    const paths = uniqueStrings(asArray(payload?.paths || payload?.inputPaths || payload?.input_paths));
    return {
      schema: RESULT_SCHEMA,
      action,
      status: paths.length ? 'conditional' : 'blocked',
      assets: paths.map((assetPath) => ({
        path: assetPath,
        status: safeAbsolutePathStatus(assetPath),
      })),
      manifestSchema: 'openbioscience.data_manifest.v1',
      warnings: paths.length ? [] : [`${action} requires paths.`],
      timestamp: Date.now(),
    };
  }
  if (action === 'plan_download') {
    const accession = asString(payload?.accession);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: accession ? 'conditional' : 'blocked',
      accession,
      plan: accession
        ? {
            accessPolicy: 'verify_before_download',
            controlledAccess: inferControlledAccess(accession),
            automaticDownload: false,
          }
        : undefined,
      warnings: accession ? [] : ['plan_download requires accession.'],
      timestamp: Date.now(),
    };
  }
  throw new Error(`Unsupported source action "${action}".`);
};

const inferAccessionSources = (accession: string): string[] => {
  const upper = accession.toUpperCase();
  if (/^GSE\d+/u.test(upper) || /^GSM\d+/u.test(upper)) return ['GEO'];
  if (/^SR[APRXS]\d+/u.test(upper)) return ['SRA'];
  if (/^E-[A-Z]+-\d+/u.test(upper)) return ['ArrayExpress'];
  if (/^EGAS\d+/u.test(upper) || /^EGAD\d+/u.test(upper)) return ['EGA'];
  if (/^S-BSST\d+/u.test(upper) || /^S-EPMC\d+/u.test(upper)) return ['BioStudies'];
  return ['unknown'];
};

const inferControlledAccess = (accession: string): boolean => /^EGA[SD]\d+/iu.test(accession);

const handleKnowledgeAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') return statusPayload('knowledge');
  const query = asString(payload?.query || payload?.term || payload?.gene || payload?.cellType || payload?.cell_type);
  return {
    schema: RESULT_SCHEMA,
    action,
    status: query ? 'conditional' : 'blocked',
    query,
    evidenceContract: {
      mustRecordSource: true,
      finalAnnotationDecision: 'skill_owned',
      artifactRegistration: 'science_artifact',
    },
    warnings: query
      ? [
          'This first-pass MCP records lookup intent and evidence contract; configure concrete marker/atlas providers before production lookup.',
        ]
      : [`${action} requires query, gene, or cellType.`],
    timestamp: Date.now(),
  };
};

const handlePlotAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') return statusPayload('plot');
  if (action === 'list_plot_templates') {
    return {
      schema: RESULT_SCHEMA,
      action,
      status: 'supported',
      templates: BIO_PLOT_TEMPLATES,
      styleContract: {
        source: 'local_registry',
        plottieRole: 'inspiration_and_taxonomy_only',
        externalLookupRequired: false,
      },
      timestamp: Date.now(),
    };
  }
  if (action === 'validate_plot_inputs') return validatePlotInputs(action, payload);
  if (action === 'render_plan') {
    const templateId = asString(payload?.templateId || payload?.template_id);
    const template = catalogById(BIO_PLOT_TEMPLATES, templateId);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: template ? 'conditional' : 'blocked',
      template,
      renderPlan: template
        ? {
            environmentRef: 'sc-r-plot',
            executeNow: false,
            requiredOutputs: template.outputs || [],
            manifestSchema: 'openbioscience.scrna_plot.manifest.v1',
          }
        : undefined,
      warnings: template ? [] : [`Unknown templateId "${templateId || '<missing>'}".`],
      timestamp: Date.now(),
    };
  }
  if (action === 'summarize_plot_outputs') return handleRuntimeAction('summarize_outputs', payload);
  throw new Error(`Unsupported plot action "${action}".`);
};

const sourceMaterialsFromPayload = (payload?: JsonRecord) => {
  const paper = isRecord(payload?.paper) ? payload.paper : {};
  const supplements = asArray(payload?.supplements || payload?.supplementary || payload?.supplementaryFiles);
  const sanitizedSupplementsResult = sanitizeSourceValue(
    supplements.map((item) => (isRecord(item) ? item : { value: item }))
  );
  const sanitizedSupplements = Array.isArray(sanitizedSupplementsResult.value) ? sanitizedSupplementsResult.value : [];
  const accessionsResult = sanitizeSourceValue(uniqueStrings(asArray(payload?.accessions)));
  const accessions = Array.isArray(accessionsResult.value)
    ? uniqueStrings(accessionsResult.value)
    : uniqueStrings(asArray(payload?.accessions));
  const linksResult = sanitizeSourceValue(uniqueSanitizedStrings(asArray(payload?.links || payload?.urls)));
  const links = Array.isArray(linksResult.value) ? uniqueStrings(linksResult.value) : [];
  const localPaths = uniqueStrings(asArray(payload?.localPaths || payload?.local_paths || payload?.paths));
  const codeLinksResult = sanitizeSourceValue(
    uniqueSanitizedStrings(asArray(payload?.codeLinks || payload?.code_links || payload?.repositories))
  );
  const codeLinks = Array.isArray(codeLinksResult.value) ? uniqueStrings(codeLinksResult.value) : [];
  const referenceResourcesResult = sanitizeSourceValue(
    uniqueStrings(asArray(payload?.referenceResources || payload?.reference_resources || payload?.references))
  );
  const referenceResources = Array.isArray(referenceResourcesResult.value)
    ? uniqueStrings(referenceResourcesResult.value)
    : [];
  const paperUrlResult = sanitizeSourceValue(paper.url || payload?.paperUrl || payload?.paper_url);
  const methodsResult = sanitizeSourceValue(payload?.methods || payload?.methodsSummary || payload?.methods_summary);
  const dataAvailabilityResult = sanitizeSourceValue(
    payload?.dataAvailability || payload?.data_availability || payload?.dataAvailabilityStatement
  );
  const codeAvailabilityResult = sanitizeSourceValue(
    payload?.codeAvailability || payload?.code_availability || payload?.codeAvailabilityStatement
  );
  const credentialFieldsRedacted =
    sanitizedSupplementsResult.redacted ||
    accessionsResult.redacted ||
    linksResult.redacted ||
    codeLinksResult.redacted ||
    referenceResourcesResult.redacted ||
    paperUrlResult.redacted ||
    methodsResult.redacted ||
    dataAvailabilityResult.redacted ||
    codeAvailabilityResult.redacted ||
    containsCredentialField({ paper, supplements, links, codeLinks, referenceResources });

  return {
    paper: {
      title: asString(paper.title || payload?.paperTitle || payload?.paper_title),
      doi: asString(paper.doi || payload?.doi),
      pmid: asString(paper.pmid || payload?.pmid),
      url: asString(paperUrlResult.value),
      localPath: asString(paper.localPath || paper.local_path || payload?.paperPath || payload?.paper_path),
    },
    methods: asString(methodsResult.value),
    dataAvailability: asString(dataAvailabilityResult.value),
    codeAvailability: asString(codeAvailabilityResult.value),
    supplements: sanitizedSupplements,
    credentialFieldsRedacted,
    accessions,
    links,
    localPaths,
    codeLinks,
    referenceResources,
  };
};

const hasSourceMaterial = (sources: ReturnType<typeof sourceMaterialsFromPayload>): boolean =>
  Boolean(
    sources.paper.title ||
    sources.paper.doi ||
    sources.paper.pmid ||
    sources.paper.url ||
    sources.paper.localPath ||
    sources.methods ||
    sources.dataAvailability ||
    sources.codeAvailability ||
    sources.supplements.length ||
    sources.accessions.length ||
    sources.links.length ||
    sources.localPaths.length ||
    sources.codeLinks.length ||
    sources.referenceResources.length
  );

const reproductionPackageLayout = (caseName: string) => ({
  root: caseName || 'case_reproduction',
  planning: {
    plan: 'planning/reproduction_plan.md',
    sourceAudit: 'planning/source_audit.json',
    localized: 'planning/localized/',
  },
  execution: {
    scripts: 'execution/scripts/',
    configs: 'execution/configs/',
    results: [
      'execution/results/tables/',
      'execution/results/figures/',
      'execution/results/objects/',
      'execution/results/reports/',
    ],
    logs: ['execution/logs/execution.log', 'execution/logs/review.md'],
  },
});

const containsCredentialField = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some((item) => containsCredentialField(item));
  if (typeof value === 'string') return hasCredentialLikeUrl(value);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => {
    if (isCredentialKey(key)) {
      return Boolean(nested);
    }
    return containsCredentialField(nested);
  });
};

const classifySourceAvailability = (sources: ReturnType<typeof sourceMaterialsFromPayload>) => ({
  paper:
    sources.paper.localPath || sources.paper.url || sources.paper.doi || sources.paper.pmid
      ? 'conditional_continue'
      : 'blocked_for_execution',
  data:
    sources.accessions.length || sources.localPaths.length || sources.dataAvailability
      ? 'conditional_continue'
      : 'blocked_for_execution',
  code: sources.codeLinks.length || sources.codeAvailability ? 'conditional_continue' : 'blocked_for_execution',
  referenceResources: sources.referenceResources.length ? 'conditional_continue' : 'blocked_for_execution',
});

const READY_FOR_SCRIPT_STATUSES = new Set(['ready', 'partial_ready', 'conditional_continue']);
const BLOCKING_MODULE_STATUSES = new Set([
  'blocked_for_localization',
  'blocked_for_execution',
  'fatal_block',
  'planned_only',
  'unresolved',
]);

const moduleReadiness = (modules: unknown[]) =>
  modules.map((item, index) => {
    const record = isRecord(item) ? item : { objective: item };
    const environmentRef = asString(record.environmentRef || record.environment_ref);
    const declaredStatus = asString(record.status, environmentRef ? 'conditional_continue' : 'blocked_for_execution');
    const sourceStatus = asString(
      record.sourceStatus ||
        record.source_status ||
        record.inputStatus ||
        record.input_status ||
        record.dataStatus ||
        record.data_status
    );
    const skillRoute = uniqueStrings(asArray(record.skillRoute || record.skill_route));
    const mcpRoute = uniqueStrings(asArray(record.mcpRoute || record.mcp_route));
    const expectedOutputs = uniqueStrings(asArray(record.expectedOutputs || record.expected_outputs));
    const blockingReasons = [
      environmentRef ? '' : 'environmentRef is required.',
      BLOCKING_MODULE_STATUSES.has(declaredStatus) ? `Module status "${declaredStatus}" is not script-ready.` : '',
      skillRoute.length ? '' : 'skillRoute is required.',
      mcpRoute.length ? '' : 'mcpRoute is required.',
      expectedOutputs.length ? '' : 'expectedOutputs is required.',
      sourceStatus ? '' : 'sourceStatus is required.',
      sourceStatus && !READY_FOR_SCRIPT_STATUSES.has(sourceStatus)
        ? `sourceStatus "${sourceStatus}" is not script-ready.`
        : '',
    ].filter(Boolean);
    return {
      id: asString(record.id, `module-${index + 1}`),
      environmentRef,
      declaredStatus,
      sourceStatus,
      skillRoute,
      mcpRoute,
      expectedOutputs,
      status: blockingReasons.length ? 'blocked_for_execution' : 'ready',
      blockingReasons,
    };
  });

const localizationItems = (payload?: JsonRecord) => {
  const candidates = asArray(payload?.sources || payload?.items || payload?.urls);
  return candidates.map((item, index) => {
    const record = isRecord(item) ? item : { url: item };
    const url = asString(record.url || record.href || record.sourceUrl || record.source_url);
    const fallbackTargetName = (() => {
      try {
        const basename = path.basename(new URL(url).pathname);
        return basename && basename !== '/' ? basename : `source-${index + 1}`;
      } catch {
        return `source-${index + 1}`;
      }
    })();
    return {
      id: asString(record.id, `source-${index + 1}`),
      url,
      kind: asString(record.kind || record.type, 'source'),
      expectedBytes: firstNumber(record.expectedBytes, record.expected_bytes),
      targetName: asString(record.targetName || record.target_name || record.filename, fallbackTargetName),
      credentialsRequested: containsCredentialField(record),
    };
  });
};

const handleReproductionAction = (action: string, payload?: JsonRecord) => {
  if (action === 'status') return statusPayload('reproduction');

  if (action === 'build_source_package') {
    const sources = sourceMaterialsFromPayload(payload);
    const caseName = asString(payload?.caseName || payload?.case_name, 'case_reproduction');
    const hasMaterials = hasSourceMaterial(sources);
    return {
      schema: RESULT_SCHEMA,
      action,
      status: hasMaterials ? 'conditional_continue' : 'blocked_for_execution',
      planningOnly: true,
      packageLayout: reproductionPackageLayout(caseName),
      sourcePackageDraft: {
        paper: sources.paper,
        methods: sources.methods,
        dataAvailability: sources.dataAvailability,
        codeAvailability: sources.codeAvailability,
        supplements: sources.supplements,
        accessions: sources.accessions,
        links: sources.links,
        localPaths: sources.localPaths.map((candidate) => ({
          path: candidate,
          status: safeAbsolutePathStatus(candidate),
        })),
        codeLinks: sources.codeLinks,
        referenceResources: sources.referenceResources,
      },
      requiredArtifacts: ['planning/reproduction_plan.md', 'planning/source_audit.json', 'planning/localized/'],
      warnings: hasMaterials
        ? [
            'Source package is a planning draft. Register concrete localized files and audit outputs through science_artifact.',
            ...(sources.credentialFieldsRedacted
              ? ['Credential-like source fields were redacted and must not be stored in the Planning Package.']
              : []),
          ]
        : [
            'build_source_package requires at least one paper, supplement, method, accession, link, code reference, or local path.',
          ],
      timestamp: Date.now(),
    };
  }

  if (action === 'localize_source_package') {
    const outputDir = asString(payload?.outputDir || payload?.output_dir);
    const outputStatus = safeOutputDirectoryStatus(outputDir);
    const overwrite = asBoolean(payload?.overwrite);
    const defaultLimit = DEFAULT_REPRODUCTION_FILE_LIMIT_BYTES;
    const maxBytes = asPositiveInteger(payload?.maxBytes || payload?.max_bytes, defaultLimit);
    const items = localizationItems(payload);
    const credentialRequest = containsCredentialField(payload);
    const plannedItems = items.map((item) => {
      const urlStatus = publicHttpUrlStatus(item.url);
      const targetPathStatus =
        outputStatus.status === 'allowed'
          ? safeChildPathStatus(outputStatus.resolvedPath || outputDir, item.targetName)
          : undefined;
      const exceedsLimit = typeof item.expectedBytes === 'number' && item.expectedBytes > maxBytes;
      const sizeUnknown = typeof item.expectedBytes !== 'number';
      const blockedReasons = [
        outputStatus.status === 'blocked' ? outputStatus.reason : '',
        urlStatus.status === 'blocked' ? urlStatus.reason : '',
        targetPathStatus?.status === 'blocked' ? targetPathStatus.reason : '',
        targetPathStatus?.exists && !overwrite ? 'Target file already exists and overwrite is false.' : '',
        exceedsLimit ? `Expected file size exceeds limit of ${maxBytes} bytes.` : '',
        overwrite ? 'overwrite=true is not allowed by default for lightweight localization planning.' : '',
        item.credentialsRequested ? 'Credentials, cookies, tokens, and authorization material are not allowed.' : '',
      ].filter(Boolean);
      const requiredBeforeLocalization = sizeUnknown
        ? ['Verify Content-Length or otherwise confirm file size before download.']
        : [];
      return {
        ...item,
        url: urlStatus.url,
        urlStatus,
        outputDirStatus: outputStatus,
        targetPathStatus,
        maxBytes,
        overwrite,
        plannedOnly: true,
        downloadAttempted: false,
        status: blockedReasons.length ? 'blocked_for_localization' : sizeUnknown ? 'conditional_continue' : 'ready',
        blockedReasons,
        requiredBeforeLocalization,
      };
    });
    const blockedCount = plannedItems.filter((item) => item.status === 'blocked_for_localization').length;
    const readyCount = plannedItems.filter((item) => item.status === 'ready').length;
    const conditionalCount = plannedItems.filter((item) => item.status === 'conditional_continue').length;
    const securityBlockedCount = plannedItems.filter(
      (item) => item.urlStatus.status === 'blocked' || item.targetPathStatus?.status === 'blocked'
    ).length;
    return {
      schema: RESULT_SCHEMA,
      action,
      status:
        outputStatus.status === 'blocked' || credentialRequest || overwrite || securityBlockedCount
          ? 'fatal_block'
          : !plannedItems.length
            ? 'blocked_for_localization'
            : blockedCount
              ? blockedCount === plannedItems.length
                ? 'blocked_for_localization'
                : 'partial_ready'
              : conditionalCount && !readyCount
                ? 'conditional_continue'
                : conditionalCount
                  ? 'partial_ready'
                  : 'ready',
      planningOnly: true,
      localizationPolicy: {
        defaultSingleFileLimitBytes: defaultLimit,
        requestedSingleFileLimitBytes: maxBytes,
        publicHttpOnly: true,
        noCredentialsCookiesOrTokens: true,
        overwriteDefault: false,
        allowedResourceTypes: [
          'paper PDF',
          'small supplement table or document',
          'public repository README/LICENSE/environment/script index',
          'public metadata manifest',
        ],
        rejectedResourceTypes: [
          'FASTQ/BAM/CRAM/SRA/fragments',
          'large image data',
          'controlled-access data',
          'login, token, cookie, or institution-gated resources',
        ],
      },
      outputDirStatus: outputStatus,
      plannedItems,
      warnings: plannedItems.length
        ? ['No network request, repository clone, package installation, analysis, or filesystem write was performed.']
        : ['localize_source_package requires sources, items, or urls.'],
      timestamp: Date.now(),
    };
  }

  if (action === 'audit_data_code_availability') {
    const sources = sourceMaterialsFromPayload(payload);
    const availability = classifySourceAvailability(sources);
    const blocked = Object.values(availability).filter((status) => status === 'blocked_for_execution').length;
    const dataAvailabilityItem: SourceAuditDataItem = {
      id: 'data-availability-statement',
      kind: 'unknown',
      modality: 'unknown',
      source: 'paper',
      accession: '',
      url: '',
      localPath: '',
      sizeBytes: null,
      access: 'unknown',
      licenseOrTerms: '',
      status: availability.data,
      supports: [],
      blocks: [],
      notes: sources.dataAvailability,
    };
    const codeAvailabilityItem: SourceAuditCodeItem = {
      id: 'code-availability-statement',
      repository: '',
      commitOrRelease: '',
      license: '',
      environmentFiles: [],
      scriptIndex: [],
      notebooks: [],
      runnableAsIs: false,
      status: availability.code,
      notes: sources.codeAvailability,
    };
    const dataItems: SourceAuditDataItem[] = [
      ...sources.accessions.map(
        (accession): SourceAuditDataItem => ({
          id: accession,
          kind: 'unknown',
          modality: 'unknown',
          source: inferAccessionSources(accession)[0] || 'unknown',
          accession,
          url: '',
          localPath: '',
          sizeBytes: null,
          access: inferControlledAccess(accession) ? 'controlled' : 'unknown',
          licenseOrTerms: '',
          status: availability.data,
          supports: [],
          blocks: [],
          notes: '',
        })
      ),
      ...sources.localPaths.map(
        (candidate, index): SourceAuditDataItem => ({
          id: `local-data-${index + 1}`,
          kind: 'unknown',
          modality: 'unknown',
          source: 'local',
          accession: '',
          url: '',
          localPath: candidate,
          sizeBytes: null,
          access: 'unknown',
          licenseOrTerms: '',
          status: safeAbsolutePathStatus(candidate) === 'available' ? 'ready' : 'unresolved',
          supports: [],
          blocks: [],
          notes: '',
        })
      ),
      ...(sources.dataAvailability && !sources.accessions.length && !sources.localPaths.length
        ? [dataAvailabilityItem]
        : []),
    ];
    const codeItems: SourceAuditCodeItem[] = [
      ...sources.codeLinks.map(
        (repository, index): SourceAuditCodeItem => ({
          id: `code-${index + 1}`,
          repository,
          commitOrRelease: '',
          license: '',
          environmentFiles: [],
          scriptIndex: [],
          notebooks: [],
          runnableAsIs: false,
          status: availability.code,
          notes: '',
        })
      ),
      ...(sources.codeAvailability && !sources.codeLinks.length ? [codeAvailabilityItem] : []),
    ];
    return {
      schema: RESULT_SCHEMA,
      action,
      status: blocked ? 'partial_ready' : 'conditional_continue',
      planningOnly: true,
      sourceAudit: {
        schema: 'openbioscience.omics_reproduction.source_audit.v1',
        caseId: asString(payload?.caseId || payload?.case_id),
        createdAt: new Date().toISOString(),
        paper: {
          ...sources.paper,
          preprint: '',
          sourceUrl: sources.paper.url,
          supplements: sources.supplements,
          methodsLocated: Boolean(sources.methods),
          dataAvailabilityLocated: Boolean(sources.dataAvailability),
          codeAvailabilityLocated: Boolean(sources.codeAvailability),
          status: availability.paper,
        },
        data: dataItems,
        code: codeItems,
        referenceResources: sources.referenceResources.map(
          (resource, index): SourceAuditReferenceResourceItem => ({
            id: `reference-${index + 1}`,
            kind: 'other',
            name: resource,
            version: '',
            source: '',
            url: '',
            localPath: '',
            status: availability.referenceResources,
            requiredBy: [],
            notes: '',
          })
        ),
        localized: [] as JsonRecord[],
        plannedOnly: [] as JsonRecord[],
        warnings: [
          {
            severity: 'warning',
            scope: 'availability',
            message: 'Availability does not imply reproducibility or scientific success.',
            affectedItems: [],
          },
          {
            severity: 'info',
            scope: 'source',
            message: 'Use bio_source for accession and local asset details before execution.',
            affectedItems: [],
          },
          ...(sources.credentialFieldsRedacted
            ? [
                {
                  severity: 'warning',
                  scope: 'source',
                  message:
                    'Credential-like source fields were redacted and must not be stored in the Planning Package.',
                  affectedItems: ['paper', 'supplements'],
                },
              ]
            : []),
        ],
      },
      timestamp: Date.now(),
    };
  }

  if (action === 'draft_reproduction_plan') {
    const objective = asString(payload?.objective || payload?.reproductionObjective || payload?.reproduction_objective);
    const moduleInputs = asArray(payload?.modules || payload?.executionModules || payload?.execution_modules);
    const modules = moduleInputs.map((item, index) => {
      const record = isRecord(item) ? item : { objective: item };
      const moduleObjective = asString(record.objective || record.name, `module-${index + 1}`);
      const environmentRef = asString(record.environmentRef || record.environment_ref);
      return {
        id: asString(record.id, `module-${index + 1}`),
        objective: moduleObjective,
        status: environmentRef ? 'conditional_continue' : 'blocked_for_execution',
        environmentRef,
        skillRoute: uniqueStrings(asArray(record.skillRoute || record.skill_route)),
        mcpRoute: uniqueStrings(asArray(record.mcpRoute || record.mcp_route)),
        expectedOutputs: uniqueStrings(asArray(record.expectedOutputs || record.expected_outputs)),
        executeNow: false,
        warnings: environmentRef ? [] : ['Execution module requires an environmentRef before script-stage work.'],
      };
    });
    return {
      schema: RESULT_SCHEMA,
      action,
      status:
        objective && modules.some((module) => module.status !== 'blocked_for_execution')
          ? 'conditional_continue'
          : 'blocked_for_execution',
      planningOnly: true,
      planDraft: {
        schema: 'openbioscience.reproduction.plan.v1',
        objective,
        requiredSections: REPRODUCTION_PLAN_SECTIONS,
        modules,
        scriptBoundary: {
          scriptWritingAllowed: false,
          executionAllowed: false,
          requiredBeforeExecution: [
            'planning/reproduction_plan.md reviewed',
            'planning/source_audit.json reviewed',
            'localized source files or approved existing demo data available',
            'official environmentRef selected',
          ],
        },
      },
      warnings: objective
        ? ['Draft is a planning structure only. Do not treat it as evidence or a successful reproduction result.']
        : ['draft_reproduction_plan requires objective or reproductionObjective.'],
      timestamp: Date.now(),
    };
  }

  if (action === 'validate_reproduction_plan') {
    const planPath = asString(payload?.planPath || payload?.plan_path);
    const auditPath = asString(payload?.sourceAuditPath || payload?.source_audit_path);
    const localizedPaths = uniqueStrings(asArray(payload?.localizedPaths || payload?.localized_paths));
    const modules = asArray(payload?.modules || payload?.executionModules || payload?.execution_modules);
    const existingDataApproved = asBoolean(
      payload?.approvedExistingData ||
        payload?.approved_existing_data ||
        payload?.approvedExistingDemoData ||
        payload?.approved_existing_demo_data
    );
    const localizedPathStatuses = localizedPaths.map((localizedPath) => ({
      path: localizedPath,
      status: safeAbsolutePathStatus(localizedPath),
    }));
    const moduleReadinessItems = moduleReadiness(modules);
    const sourceReady =
      localizedPathStatuses.some((item) => item.status === 'available') || existingDataApproved === true;
    const modulesReady = modules.length > 0 && moduleReadinessItems.every((item) => item.status === 'ready');
    const checks = [
      {
        id: 'reproduction_plan',
        status: planPath ? safeAbsolutePathStatus(planPath) : 'unverified',
        required: true,
      },
      {
        id: 'source_audit',
        status: auditPath ? safeAbsolutePathStatus(auditPath) : 'unverified',
        required: true,
      },
      {
        id: 'localized_sources_or_demo_data',
        status: sourceReady ? 'available' : 'unverified',
        required: true,
      },
      {
        id: 'execution_modules',
        status: modulesReady ? 'available' : 'unverified',
        required: true,
      },
    ];
    const requiredMissing = checks.filter((check) => check.required && check.status !== 'available');
    return {
      schema: RESULT_SCHEMA,
      action,
      status: requiredMissing.length ? 'blocked_for_execution' : 'ready',
      planningOnly: true,
      checks,
      localizedPaths: localizedPathStatuses,
      moduleReadiness: moduleReadinessItems,
      scriptBoundary: {
        mayEnterScriptStage: requiredMissing.length === 0,
        analysisExecuted: false,
        scientificSuccessClaim: false,
      },
      warnings: requiredMissing.length
        ? ['Required planning package elements are unavailable or outside allowed roots.']
        : ['Validation only checks planning package readiness; it does not validate scientific results.'],
      timestamp: Date.now(),
    };
  }

  throw new Error(`Unsupported reproduction action "${action}".`);
};

async function main() {
  const profile = profileFromEnv();
  const definition = definitionFor(profile);
  const server = new McpServer({
    name: definition.serverName,
    version: '1.0.0',
  });

  server.tool(
    definition.toolName,
    definition.description,
    {
      action: z.enum(definition.actions as [string, ...string[]]),
      payload: z.record(z.unknown()).optional(),
    },
    async ({ action, payload }) => {
      const recordPayload = isRecord(payload) ? payload : {};
      if (profile === 'runtime') return jsonText(handleRuntimeAction(action, recordPayload));
      if (profile === 'source') return jsonText(handleSourceAction(action, recordPayload));
      if (profile === 'knowledge') return jsonText(handleKnowledgeAction(action, recordPayload));
      if (profile === 'plot') return jsonText(handlePlotAction(action, recordPayload));
      return jsonText(handleReproductionAction(action, recordPayload));
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[BioMCP] Fatal error:', error);
  process.exit(1);
});
