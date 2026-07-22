#!/usr/bin/env bun
/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure Bun CLI — launches the WebUI (backend + static server + auth) without
 * starting Electron. Replaces the former `electron-vite dev -- --webui` flow.
 *
 * Env vars:
 *   DEEPORGANISER_PORT         : static server port (default 33000)
 *   DEEPORGANISER_HOST         : listen host; set to 0.0.0.0 to imply --remote
 *   DEEPORGANISER_ALLOW_REMOTE : "1"/"true" to expose to LAN
 *   DEEPORGANISER_DATA_DIR     : override userData path (default Electron-compatible)
 *   DEEPORGANISER_LOG_DIR      : override log dir (default <dataDir>/logs)
 *   DEEPORGANISER_STATIC_DIR   : override static dir (default out/renderer)
 *   DEEPORGANISER_CORE_BIN : absolute path to DeepOrganiser Core binary (else PATH lookup)
 *   DEEPORGANISER_CORE_BUNDLED_DIR : dir containing bundled-deeporganiser-core/<plat-arch>/binary
 *   DEEPORGANISER_OPEN_BROWSER : "1"/"true" to force open, "0"/"false" to disable
 */

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { startWebHost } from '@deeporganiser/web-host';
import { config as loadDotEnvConfig } from 'dotenv';
import {
  buildOpenBioScienceRuntimeEnv,
  buildOpenBioScienceRuntimePath,
  resolveOpenBioScienceRuntimeRoot,
  resolveOpenBioScienceWorkspaceRoot,
} from '../packages/desktop/src/process/utils/openBioScienceRuntimeEnv';
import {
  resolveOpenBioScienceSkillsSourceRoot,
  syncOpenBioScienceSkills as syncOpenBioScienceSkillsToTarget,
} from '../packages/desktop/src/process/utils/openBioScienceSkillsSync';
import { openBrowserUrl, shouldAutoOpenBrowser } from '../packages/web-cli/src/browser.js';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

loadDotEnvConfig({ path: path.join(repoRoot, '.env') });

const openBioScienceWorkspaceRoot = (): string => resolveOpenBioScienceWorkspaceRoot(process.env, repoRoot) || repoRoot;

const buildStandaloneBioRuntimeEnv = (baseEnv: Record<string, string>): Record<string, string> =>
  buildOpenBioScienceRuntimeEnv(baseEnv, process.env, openBioScienceWorkspaceRoot());

const legacyEnvName = (suffix: string): string => `${['AI', 'ON', 'UI'].join('')}_${suffix}`;
const readEnv = (suffix: string): string | undefined =>
  process.env[`DEEPORGANISER_${suffix}`] ?? process.env[legacyEnvName(suffix)];

const OPENBIOSCIENCE_CLI_TOOLS = ['file', 'pdfinfo', 'pdftotext', 'python', 'python3', 'strings', 'git'] as const;

function syncOpenBioScienceCliTools(runtimeRoot: string): void {
  const sourceBin = path.join(runtimeRoot, 'environments', 'official', 'sc-py-singlecell', 'bin');
  const targetBin = path.join(os.homedir(), '.local', 'bin');
  if (!fs.existsSync(sourceBin)) return;
  fs.mkdirSync(targetBin, { recursive: true });
  for (const tool of OPENBIOSCIENCE_CLI_TOOLS) {
    const source = path.join(sourceBin, tool);
    const target = path.join(targetBin, tool);
    if (!fs.existsSync(source)) continue;
    try {
      if (fs.lstatSync(target).isSymbolicLink() && fs.readlinkSync(target) === source) continue;
      continue;
    } catch {
      fs.symlinkSync(source, target);
    }
  }
}

// Aligned with packages/desktop/src/common/config/constants.ts WEBUI_DEFAULT_PORT.
const DEFAULT_PORT = (() => {
  if (process.env.NODE_ENV === 'production') return 25808;
  if (readEnv('MULTI_INSTANCE') === '1') return 25810;
  return 25809;
})();
const BACKEND_BINARY = process.platform === 'win32' ? 'deeporganiser-core.exe' : 'deeporganiser-core';
const DEFAULT_SCIENCE_SKILL_IDS = [
  'openscience-science',
  'openscience-science-artifact',
  'openscience-onboarding',
  'openscience-workflow',
  'openscience-writing',
  'openscience-databases',
  'openscience-biomodels',
  'openscience-singlecell',
  'bio-omics-reproduction-planning',
  'bio-omics-analysis',
  'bio-singlecell-baseline',
  'bio-protein-variant-benchmark',
  'bio-protein-design-benchmark',
  'bio-singlecell-vdj',
  'bio-spatial-transcriptomics',
  'bio-environment-manager',
  'bio-analysis-script-authoring',
  'bio-scrna-differential-expression',
  'kdense-pathway-enrichment',
  'kdense-scanpy',
  'bio-method-parameter-reconstruction',
  'openscience-compute',
];
const DEFAULT_RESEARCH_EVIDENCE_DOMAINS = [
  'pubmed',
  'biorxiv',
  'chembl',
  'structures-interactions',
  'omics-archives',
  'genes-ontologies',
  'cancer-singlecell',
];

type BackendEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
};

type StdioMcpTransport = {
  type: 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type WebuiMcpServerPayload = {
  name: string;
  description: string;
  enabled: boolean;
  builtin: boolean;
  transport: StdioMcpTransport;
  original_json: string;
  tools?: unknown[];
  last_test_status?: 'connected' | 'disconnected' | 'error' | 'testing';
};

type StoredWebuiMcpServer = WebuiMcpServerPayload & {
  id: string;
};

type StdioMcpServerBuildParams = {
  name: string;
  description: string;
  scriptName: string;
  enabled?: boolean;
  env?: Record<string, string>;
};

const args = process.argv.slice(2);
const has = (name: string): boolean => args.includes(name);
const getFlag = (name: string): string | undefined => {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  return next && !next.startsWith('--') ? next : undefined;
};

/**
 * Resolve the directory where DeepOrganiser Core persists its SQLite DB.
 *
 * `bun run webui` runs **independently of the Electron desktop app** — it must
 * work on hosts that never installed DeepOrganiser.app, and its default work dir must
 * NOT collide with Electron's.
 *
 *   --data-dir <path>       CLI override (highest priority)
 *   $DEEPORGANISER_DATA_DIR env override (same effect)
 *   otherwise               ~/.openscience-web         (production)
 *                           ~/.openscience-web-dev     (dev, default)
 *                           ~/.openscience-web-dev-2   (dev + multi instance)
 *
 * Why a dedicated `-web` name, not the same desktop data dir that Electron
 * uses: on macOS, Electron's getDataPath() (packages/desktop/src/process/utils/
 * utils.ts) creates a CLI-safe symlink so CLI tools (claude,
 * gemini, qwen…) don't choke on the literal space in "Application Support".
 * If standalone webui runs first on a clean machine, it would create the
 * symlink location as a **real directory** instead. When Electron is later
 * installed, its `ensureCliSafeSymlink` refuses to overwrite a real dir and
 * falls back to returning the space-containing path — and then every ACP
 * agent inside the desktop app starts failing on CLI commands. Using
 * `.openscience-web` keeps standalone webui's data dir off of the path Electron's
 * symlink needs.
 *
 * If the user wants the two to share data they opt-in explicitly via
 *   --data-dir <desktop-data-dir>
 * which is safe because by that point Electron has created the symlink and
 * `bun run webui` just follows it.
 */
function resolveBackendDataDir(): string {
  const override = getFlag('--data-dir') ?? readEnv('DATA_DIR');
  if (override && override.trim().length > 0) {
    const resolved = path.resolve(override);
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }
  const suffix = process.env.NODE_ENV === 'production' ? '' : readEnv('MULTI_INSTANCE') === '1' ? '-dev-2' : '-dev';
  const dir = path.join(os.homedir(), `.openscience-web${suffix}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function parseBoolean(v: string | undefined): boolean {
  if (!v) return false;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function resolvePort(): number {
  const cli = getFlag('--port');
  if (cli && /^\d+$/.test(cli)) return Number(cli);
  const env = readEnv('PORT') ?? process.env.PORT;
  if (env && /^\d+$/.test(env)) return Number(env);
  return DEFAULT_PORT;
}

function resolveAllowRemote(): boolean {
  if (has('--remote')) return true;
  const host = readEnv('HOST')?.trim();
  if (host && ['0.0.0.0', '::', '::0'].includes(host)) return true;
  return parseBoolean(readEnv('ALLOW_REMOTE') ?? readEnv('REMOTE'));
}

function resolveStaticDir(): string {
  const staticDir = readEnv('STATIC_DIR');
  if (staticDir) return staticDir;
  const candidate = path.join(repoRoot, 'out', 'renderer');
  if (fs.existsSync(path.join(candidate, 'index.html'))) return candidate;
  throw new Error(
    `Renderer assets not found at ${candidate}. Run "bun run package" first, or set DEEPORGANISER_STATIC_DIR.`
  );
}

/**
 * Rebuild renderer/main bundles before launching, so that `bun run webui` always
 * serves the latest source. Skipped when:
 *   --no-build flag           : explicit opt-out (e.g., iterating on this script)
 *   $DEEPORGANISER_NO_BUILD=1 : env-level opt-out
 *   static dir env is set     : caller is pointing us at a prebuilt artifact dir
 */
function runPackageIfNeeded(): void {
  if (has('--no-build')) return;
  if (parseBoolean(readEnv('NO_BUILD'))) return;
  if (readEnv('STATIC_DIR')) return;
  console.log('[webui] running "bun run package" to refresh out/renderer (pass --no-build to skip)...');
  const start = Date.now();
  execSync('bun run package', { cwd: repoRoot, stdio: 'inherit' });
  console.log(`[webui] package finished in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

function resolveBackendBinary(): string {
  if (process.env.DEEPORGANISER_CORE_BIN) return process.env.DEEPORGANISER_CORE_BIN;

  const bundledBase =
    process.env.DEEPORGANISER_CORE_BUNDLED_DIR ?? path.join(repoRoot, 'resources', 'bundled-deeporganiser-core');
  const runtimeKey = `${process.platform}-${process.arch}`;
  const bundled = path.join(bundledBase, runtimeKey, BACKEND_BINARY);
  if (fs.existsSync(bundled)) return bundled;

  try {
    const cmd = process.platform === 'win32' ? `where ${BACKEND_BINARY}` : `which ${BACKEND_BINARY}`;
    const found = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split(/\r?\n/)[0];
    if (found && fs.existsSync(found)) return found;
  } catch {
    // fall through
  }

  throw new Error(
    `Cannot find "${BACKEND_BINARY}". Set DEEPORGANISER_CORE_BIN, put it on PATH, or place it at ${bundled}.`
  );
}

export function syncOpenBioScienceSkills(workDir: string): void {
  syncOpenBioScienceSkillsToTarget({
    sourceRoot: resolveOpenBioScienceSkillsSourceRoot(repoRoot),
    targetRoot: path.join(workDir, 'builtin-skills'),
    repoRoot,
    markerSchema: 'openscience.webui.skill-sync.v1',
    logger: {
      log: (message) => console.log(message.replace('[OpenBioScience]', '[webui] OpenBioScience')),
      warn: (message) => console.warn(message.replace('[OpenBioScience]', '[webui] OpenBioScience')),
    },
  });
}

function builtinMcpScriptPath(scriptName: string): string | undefined {
  const candidate = path.join(repoRoot, 'out', 'main', `${scriptName}.js`);
  return fs.existsSync(candidate) ? candidate : undefined;
}

function buildStdioMcpServer(params: StdioMcpServerBuildParams): WebuiMcpServerPayload | undefined {
  const scriptPath = builtinMcpScriptPath(params.scriptName);
  if (!scriptPath) {
    console.warn(`[webui] built-in MCP script not found: ${params.scriptName}.js`);
    return undefined;
  }
  const env = params.env ?? {};
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };
  return {
    name: params.name,
    description: params.description,
    enabled: params.enabled === true,
    builtin: true,
    transport: {
      type: 'stdio',
      command: serverConfig.command,
      args: serverConfig.args,
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [params.name]: serverConfig } }, null, 2),
  };
}

export function buildStandaloneBioMcpServerSpecs(): StdioMcpServerBuildParams[] {
  return [
    {
      name: 'openscience-bio-runtime',
      description:
        'Built-in OpenBioScience scRNA-seq runtime control plane for environment, workflow, and output contracts.',
      scriptName: 'builtin-mcp-bio',
      enabled: true,
      env: buildStandaloneBioRuntimeEnv({
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime',
      }),
    },
    {
      name: 'openscience-bio-source',
      description: 'Built-in OpenBioScience data-source control plane for accession triage and data manifests.',
      scriptName: 'builtin-mcp-bio',
      enabled: true,
      env: buildStandaloneBioRuntimeEnv({
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'source',
      }),
    },
    {
      name: 'openscience-bio-knowledge',
      description: 'Built-in OpenBioScience marker, atlas, gene-set, and ligand-receptor evidence contracts.',
      scriptName: 'builtin-mcp-bio',
      enabled: true,
      env: buildStandaloneBioRuntimeEnv({
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'knowledge',
      }),
    },
    {
      name: 'openscience-bio-plot',
      description: 'Built-in OpenBioScience scRNA-seq plot template and plot artifact manifest contracts.',
      scriptName: 'builtin-mcp-bio',
      enabled: true,
      env: buildStandaloneBioRuntimeEnv({
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'plot',
      }),
    },
    {
      name: 'openscience-bio-benchmark',
      description:
        'Built-in OpenBioScience benchmark control plane for blind/freeze/reveal/evaluate contracts across protein and non-omics benchmarks.',
      scriptName: 'builtin-mcp-bio',
      enabled: true,
      env: buildStandaloneBioRuntimeEnv({
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'benchmark',
      }),
    },
    {
      name: 'openscience-bio-reproduction',
      description:
        'Built-in OpenBioScience omics reproduction planning control plane for source packaging, availability audit, lightweight localization planning, and script-boundary validation.',
      scriptName: 'builtin-mcp-bio',
      enabled: true,
      env: buildStandaloneBioRuntimeEnv({
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'reproduction',
      }),
    },
    {
      name: 'openscience-bio-analysis',
      description:
        'Built-in OpenBioScience private omics analysis control plane for human checkpoints, scRNA-seq baseline, episodes, and closure.',
      scriptName: 'builtin-mcp-bio',
      enabled: true,
      env: buildStandaloneBioRuntimeEnv({
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'analysis',
      }),
    },
    {
      name: 'openscience-bio-statistics',
      description:
        'Built-in OpenBioScience statistical contract control plane for expression semantics and replicate-aware edgeR differential expression.',
      scriptName: 'builtin-mcp-bio',
      enabled: true,
      env: buildStandaloneBioRuntimeEnv({
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'statistics',
      }),
    },
    {
      name: 'openscience-bio-environment-manager',
      description: 'Built-in OpenBioScience bio environment manager control plane for runtime environments.',
      scriptName: 'builtin-mcp-bio',
      enabled: true,
      env: buildStandaloneBioRuntimeEnv({
        OPENBIOSCIENCE_BIO_MCP_PROFILE: 'environment_manager',
      }),
    },
  ];
}

export function buildStandaloneBuiltinMcpServers(backendPort: number): WebuiMcpServerPayload[] {
  const servers = [
    buildStdioMcpServer({
      name: 'openscience-medical-evidence',
      description: 'Built-in medical evidence bridge for PaperClip search, evidence grading, and citation panels.',
      scriptName: 'builtin-mcp-medical-evidence',
      env: {
        PAPERCLIP_ENABLED: 'false',
        PAPERCLIP_BASE_URL: 'https://paperclip.gxl.ai',
        PAPERCLIP_DEFAULT_SOURCES: 'pmc,abstracts,biorxiv,medrxiv,arxiv',
        PAPERCLIP_TIMEOUT_MS: '30000',
      },
    }),
    buildStdioMcpServer({
      name: 'openscience-research-evidence',
      description: 'Unified research evidence bridge for PaperClip literature/files and Science database tools.',
      scriptName: 'builtin-mcp-research-evidence',
      enabled: true,
      env: {
        PAPERCLIP_ENABLED: 'false',
        PAPERCLIP_BASE_URL: 'https://paperclip.gxl.ai',
        PAPERCLIP_DEFAULT_SOURCES: 'pmc,abstracts,biorxiv,medrxiv,arxiv',
        PAPERCLIP_TIMEOUT_MS: '30000',
        OPENSCIENCE_RESEARCH_EVIDENCE_PROVIDERS: 'bio_tools',
        OPENSCIENCE_BIO_TOOLS_ENABLED: 'true',
        OPENSCIENCE_BIO_TOOLS_PYTHON:
          process.env.OPENSCIENCE_BIO_TOOLS_PYTHON ||
          '/opt/openbioscience/env/environments/official/sc-py-singlecell/bin/python',
        OPENSCIENCE_BIO_TOOLS_DOMAINS: DEFAULT_RESEARCH_EVIDENCE_DOMAINS.join(','),
      },
    }),
    buildStdioMcpServer({
      name: 'openscience-science-artifact',
      description: 'Built-in Science Mode artifact graph, provenance, versioning, and report panel bridge.',
      scriptName: 'builtin-mcp-science-artifact',
      env: {
        OPENSCIENCE_STRICT_PROVENANCE: 'false',
        OPENSCIENCE_WRITE_PROJECT_MANIFEST: 'true',
        OPENSCIENCE_DEFAULT_SKILL_IDS: DEFAULT_SCIENCE_SKILL_IDS.join(','),
        OPENSCIENCE_ALLOWED_DATABASE_HOSTS: '',
        OPENSCIENCE_ARTIFACT_GIT_MAX_COPY_BYTES: String(25 * 1024 * 1024),
      },
    }),
    buildStdioMcpServer({
      name: 'openscience-pymol',
      description: 'Headless PyMOL analysis, structure triage, rendering, and synchronized viewer state.',
      scriptName: 'builtin-mcp-pymol',
      enabled: true,
      env: buildStandaloneBioRuntimeEnv({
        DEEPORGANISER_BACKEND_PORT: String(backendPort),
        OPENBIOSCIENCE_PYMOL_WORKER: path.join(
          repoRoot,
          'packages',
          'desktop',
          'src',
          'process',
          'resources',
          'builtinMcp',
          'bio',
          'pymolWorker.py'
        ),
        ...(process.env.OPENBIOSCIENCE_PYMOL_PYTHON
          ? { OPENBIOSCIENCE_PYMOL_PYTHON: process.env.OPENBIOSCIENCE_PYMOL_PYTHON }
          : {}),
      }),
    }),
    buildStdioMcpServer({
      name: 'openscience-lab-skill',
      description: 'Built-in Lab Skill deposition bridge for SOP, protocol, evidence-ledger, and skill draft reports.',
      scriptName: 'builtin-mcp-lab-skill',
      env: {
        DEEPORGANISER_BACKEND_PORT: String(backendPort),
        DEEPORGANISER_DATA_DIR: resolveBackendDataDir(),
      },
    }),
    buildStdioMcpServer({
      name: 'openscience-user-input',
      description: 'Built-in structured user input bridge for Agent clarification questions.',
      scriptName: 'builtin-mcp-user-input',
      enabled: true,
    }),
    ...buildStandaloneBioMcpServerSpecs().map((params) => buildStdioMcpServer(params)),
    buildStdioMcpServer({
      name: 'openscience-image-generation',
      description: 'Built-in image generation tool powered by AI models. Configure the model in Settings > Tools.',
      scriptName: 'builtin-mcp-image-gen',
    }),
    buildStdioMcpServer({
      name: 'openscience-lark-project-agent',
      description: 'Built-in Lark project-agent bridge.',
      scriptName: 'builtin-mcp-lark-project-agent',
    }),
  ];

  return servers.filter((server): server is WebuiMcpServerPayload => Boolean(server));
}

async function fetchBackendJson<T>(backendPort: number, pathName: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${backendPort}${pathName}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as BackendEnvelope<T> | T) : undefined;
  if (!response.ok) {
    throw new Error(`Backend ${init?.method ?? 'GET'} ${pathName} failed (${response.status}): ${text}`);
  }
  if (
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    (payload as BackendEnvelope<T>).success === false
  ) {
    throw new Error((payload as BackendEnvelope<T>).error || `Backend ${pathName} returned success=false`);
  }
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as BackendEnvelope<T>).data as T;
  }
  return payload as T;
}

async function bootstrapStandaloneMcpCatalog(backendPort: number): Promise<void> {
  try {
    const existing = await fetchBackendJson<StoredWebuiMcpServer[]>(backendPort, '/api/mcp/servers');
    const existingByName = new Map((existing ?? []).map((server) => [server.name, server]));
    const desired = buildStandaloneBuiltinMcpServers(backendPort);
    const toolCacheRefreshNames = new Set<string>();
    const missing = desired.filter((server) => !existingByName.has(server.name));
    const changed = desired.filter((server) => {
      const current = existingByName.get(server.name);
      if (!current?.id) return false;
      return (
        current.enabled !== server.enabled ||
        current.builtin !== server.builtin ||
        current.description !== server.description ||
        current.original_json !== server.original_json ||
        JSON.stringify(current.transport) !== JSON.stringify(server.transport)
      );
    });

    if (missing.length === 0 && changed.length === 0) {
      console.log('[webui] OpenBioScience MCP catalog already present');
      return;
    }

    if (missing.length > 0) {
      await fetchBackendJson(backendPort, '/api/mcp/servers/import', {
        method: 'POST',
        body: JSON.stringify({ servers: missing }),
      });
      for (const server of missing) {
        if (server.enabled) toolCacheRefreshNames.add(server.name);
      }
      console.log(`[webui] OpenBioScience MCP catalog imported: ${missing.map((server) => server.name).join(', ')}`);
    }

    for (const server of changed) {
      const current = existingByName.get(server.name);
      if (!current?.id) continue;
      await fetchBackendJson(backendPort, `/api/mcp/servers/${encodeURIComponent(current.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: server.name,
          description: server.description,
          builtin: server.builtin,
          transport: server.transport,
          original_json: server.original_json,
          tools: [],
          last_test_status: 'disconnected',
        }),
      });
      if (server.enabled) toolCacheRefreshNames.add(server.name);
      if (current.enabled !== server.enabled) {
        await fetchBackendJson(backendPort, `/api/mcp/servers/${encodeURIComponent(current.id)}/toggle`, {
          method: 'POST',
        });
      }
    }
    if (changed.length > 0) {
      console.log(`[webui] OpenBioScience MCP catalog updated: ${changed.map((server) => server.name).join(', ')}`);
    }
    if (toolCacheRefreshNames.size > 0) {
      const refreshed = await fetchBackendJson<StoredWebuiMcpServer[]>(backendPort, '/api/mcp/servers');
      const refreshTargets = (refreshed ?? []).filter(
        (server) =>
          toolCacheRefreshNames.has(server.name) &&
          server.enabled === true &&
          server.builtin === true &&
          server.name.startsWith('openscience-')
      );
      await Promise.all(
        refreshTargets.map(async (server) => {
          try {
            await fetchBackendJson(backendPort, '/api/mcp/test-connection', {
              method: 'POST',
              body: JSON.stringify({ ...server, runtime_scope_id: server.id }),
            });
          } catch (error) {
            console.warn(`[webui] could not refresh MCP tool cache for ${server.name}:`, error);
          }
        })
      );
      if (refreshTargets.length > 0) {
        console.log(`[webui] OpenBioScience MCP tool cache refreshed: ${refreshTargets.map((s) => s.name).join(', ')}`);
      }
    }
  } catch (error) {
    console.warn('[webui] could not bootstrap OpenBioScience MCP catalog:', error);
  }
}

/**
 * Prepend all nvm-managed Node bin dirs to PATH. Electron's main process does
 * this (see packages/desktop/src/index.ts), otherwise CLI tools installed under
 * a specific Node version (e.g. gemini under v25) won't be found by the backend
 * spawned by ACP — the `Superset: X not found in PATH` wrapper bails, so the
 * ACP handshake times out after 30s and the UI sees `502 Bad Gateway`.
 */
function augmentPathWithNvm(): void {
  if (process.platform === 'win32') return;
  const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
  const versionsDir = path.join(nvmDir, 'versions', 'node');
  if (!fs.existsSync(versionsDir)) return;
  try {
    const versions = fs.readdirSync(versionsDir);
    const nvmBins = versions.map((v) => path.join(versionsDir, v, 'bin')).filter((p) => fs.existsSync(p));
    if (nvmBins.length === 0) return;
    const current = process.env.PATH || '';
    const missing = nvmBins.filter((p) => !current.split(path.delimiter).includes(p));
    if (missing.length > 0) {
      process.env.PATH = [...missing, current].join(path.delimiter);
    }
  } catch {
    // best-effort
  }
}

async function main(): Promise<void> {
  const runtimeRoot = resolveOpenBioScienceRuntimeRoot(process.env, repoRoot);
  if (runtimeRoot) {
    process.env.OPENBIOSCIENCE_ENV_ROOT = runtimeRoot;
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT = runtimeRoot;
    process.env.OPENSCIENCE_RUNTIME_ROOT = runtimeRoot;
    process.env.PATH = buildOpenBioScienceRuntimePath(process.env.PATH, process.env, repoRoot);
    syncOpenBioScienceCliTools(runtimeRoot);
  }
  augmentPathWithNvm();
  runPackageIfNeeded();
  const port = resolvePort();
  const allowRemote = resolveAllowRemote();
  const autoOpenBrowser = shouldAutoOpenBrowser({
    allowRemote,
    env: process.env,
    openFlag: has('--open'),
    noOpenFlag: has('--no-open'),
  });
  // One working dir for the whole standalone webui: backend SQLite and chat
  // history live here. Admin credentials live in the backend's users table.
  // This keeps `bun run webui` fully self-contained on hosts without DeepOrganiser.app.
  const workDir = resolveBackendDataDir();
  const staticDir = resolveStaticDir();
  const backendBin = resolveBackendBinary();
  const logDir = readEnv('LOG_DIR') ?? path.join(workDir, 'logs');

  console.log('[webui] work dir   :', workDir);
  console.log('[webui] static dir :', staticDir);
  console.log('[webui] backend bin:', backendBin);
  console.log(`[webui] launching  : port=${port} allowRemote=${allowRemote}`);

  const handle = await startWebHost({
    app: {
      version: '0.0.0',
      isPackaged: false,
      resourcesPath: repoRoot,
      userDataPath: workDir,
    },
    staticDir,
    port,
    allowRemote,
    dataDir: workDir,
    logDir,
    // Surface the same work dir on /api/system/info so the browser UI shows
    // where standalone webui is actually persisting data. Without this the
    // backend inherits process.env and may report the parent shell's cwd.
    dirs: {
      cacheDir: workDir,
      workDir: workDir,
      logDir,
    },
    backend: {
      kind: 'ownBackend',
      resolveBackend: () => backendBin,
    },
  });

  syncOpenBioScienceSkills(workDir);
  await bootstrapStandaloneMcpCatalog(handle.backendPort);

  console.log('');
  console.log('OpenBioScience WebUI is ready');
  console.log(`  Local  : ${handle.localUrl}`);
  if (handle.networkUrl) console.log(`  Network: ${handle.networkUrl}`);

  console.log('');
  console.log('OpenBioScience WebUI uses no app-level login.');
  console.log('Configure models, API keys, and local coding agents from Settings after opening the page.');

  if (autoOpenBrowser) {
    const openResult = openBrowserUrl(handle.localUrl);
    if (openResult.ok) {
      console.log(`[webui] opened ${handle.localUrl} in your browser.`);
    } else {
      console.warn(`[webui] could not open the browser automatically: ${openResult.reason}`);
    }
  }

  console.log('');
  console.log('Press Ctrl+C to stop.');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[webui] received ${signal}, stopping...`);
    try {
      await handle.stop();
    } catch (err) {
      console.error('[webui] stop error:', err);
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

if (path.resolve(process.argv[1] || '') === __filename) {
  main().catch((err) => {
    console.error('[webui] failed to start:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
