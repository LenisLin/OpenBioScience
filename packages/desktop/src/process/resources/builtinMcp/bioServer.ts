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
import { safeAbsolutePathStatus } from './bio/pathSafety';

type JsonRecord = Record<string, unknown>;

const RESULT_SCHEMA = 'openbioscience.bio_mcp.result.v1';
const DEFAULT_RUNTIME_ROOT = '${OPENBIOSCIENCE_RUNTIME_ROOT}';

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

const runtimeRoot = (): string =>
  process.env.OPENBIOSCIENCE_RUNTIME_ROOT ||
  process.env.OPENSCIENCE_RUNTIME_ROOT ||
  process.env.DEEPORGANISER_WORK_DIR ||
  DEFAULT_RUNTIME_ROOT;

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
    status: 'supported',
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
      return jsonText(handlePlotAction(action, recordPayload));
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[BioMCP] Fatal error:', error);
  process.exit(1);
});
