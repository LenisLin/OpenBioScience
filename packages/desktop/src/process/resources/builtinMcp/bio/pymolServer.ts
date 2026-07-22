/**
 * @license
 * Copyright 2026 OpenBioScience
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { PyMolSessionResult, PyMolViewerState } from '@/common/types/platform/pymolTypes';
import { shouldReplayPyMolCommand } from '@/common/types/platform/pymolState';
import { safeAbsolutePathStatus } from './pathSafety';

type JsonRecord = Record<string, unknown>;
type WorkerReply = PyMolSessionResult & {
  id: string;
  ok: boolean;
  error?: string;
  traceback?: string;
};

const SERVER_NAME = 'openscience-pymol';
const DEFAULT_WINDOWS_PYTHON = path.join(
  process.env.LOCALAPPDATA || '',
  'Schrodinger',
  'PyMOL2',
  'python.exe'
);
const WINDOWS_PYTHON_CANDIDATES = [
  DEFAULT_WINDOWS_PYTHON,
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Schrodinger', 'PyMOL2', 'python.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PyMOL', 'python.exe'),
];

const safeSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9_.-]+/gu, '_').replace(/^[_\.]+|[_\.]+$/gu, '') || 'default';

const existingFile = (candidates: Array<string | undefined>): string | undefined =>
  candidates.find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));

const resolvePython = (): string => {
  const configured = process.env.OPENBIOSCIENCE_PYMOL_PYTHON?.trim();
  const resolved = existingFile([
    configured,
    ...(process.platform === 'win32' ? WINDOWS_PYTHON_CANDIDATES : []),
    process.platform === 'darwin' ? '/Applications/PyMOL.app/Contents/bin/python' : undefined,
    process.platform === 'darwin' ? '/opt/homebrew/bin/python3' : undefined,
    process.platform === 'linux' ? '/opt/pymol/bin/python' : undefined,
    process.platform === 'linux' ? '/usr/bin/python3' : undefined,
  ]);
  if (!resolved) {
    throw new Error(
      'PyMOL Python was not found. Set OPENBIOSCIENCE_PYMOL_PYTHON to an interpreter that can import pymol.'
    );
  }
  return resolved;
};

const resolveWorkerScript = (): string => {
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : undefined;
  const configured = process.env.OPENBIOSCIENCE_PYMOL_WORKER?.trim();
  const resolved = existingFile([
    configured,
    resourcesPath ? path.join(resourcesPath, 'pymol', 'pymolWorker.py') : undefined,
    path.resolve(process.cwd(), 'packages/desktop/src/process/resources/builtinMcp/bio/pymolWorker.py'),
    path.resolve(__dirname, 'pymolWorker.py'),
  ]);
  if (!resolved) {
    throw new Error('The bundled PyMOL worker script is missing. Rebuild or reinstall OpenBioScience.');
  }
  return resolved;
};

const workspaceRoot = (): string =>
  path.resolve(process.env.OPENBIOSCIENCE_WORKSPACE_ROOT || process.env.DEEPORGANISER_WORK_DIR || process.cwd());

const assertReadablePath = (candidate: string): string => {
  const resolved = path.resolve(candidate);
  if (process.env.OPENBIOSCIENCE_PYMOL_ALLOW_EXTERNAL_PATHS === 'true') return resolved;
  if (safeAbsolutePathStatus(resolved) !== 'available') {
    throw new Error(`Path is outside the authorized workspace: ${candidate}`);
  }
  return resolved;
};

class PyMolWorkerClient {
  private child?: ChildProcessWithoutNullStreams;
  private lineReader?: readline.Interface;
  private readonly pending = new Map<
    string,
    { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private conversationId?: string;
  private sessionId?: string;
  private workDir?: string;
  private idleTimer?: NodeJS.Timeout;

  async call(action: string, payload: JsonRecord, requestedConversationId?: string): Promise<WorkerReply> {
    const conversationId = requestedConversationId?.trim() || process.env.OPENSCIENCE_CONVERSATION_ID || 'default';
    if (this.conversationId && this.conversationId !== conversationId) {
      throw new Error('This MVP PyMOL MCP process supports one active conversation. Start a new MCP session first.');
    }
    if (!this.child) this.start(conversationId);
    if (this.idleTimer) clearTimeout(this.idleTimer);

    const id = crypto.randomUUID();
    const child = this.child;
    if (!child?.stdin.writable) throw new Error('PyMOL worker is not writable');

    const reply = await new Promise<WorkerReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`PyMOL ${action} timed out`));
      }, action === 'render' ? 120_000 : 30_000);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, action, payload })}\n`);
    });
    this.scheduleIdleTimeout();
    return reply;
  }

  close(reason = 'shutdown'): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (this.workDir) {
      try {
        fs.appendFileSync(
          path.join(this.workDir, 'pymol-session-lifecycle.jsonl'),
          `${JSON.stringify({ timestamp: Date.now(), reason, sessionId: this.sessionId, conversationId: this.conversationId })}\n`
        );
      } catch (error) {
        process.stderr.write(`[pymol-worker] failed to write lifecycle audit: ${String(error)}\n`);
      }
    }
    this.lineReader?.close();
    this.child?.kill();
    this.child = undefined;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('PyMOL worker stopped'));
    }
    this.pending.clear();
    this.conversationId = undefined;
    this.sessionId = undefined;
    this.workDir = undefined;
  }

  private start(conversationId: string): void {
    const python = resolvePython();
    const worker = resolveWorkerScript();
    const sessionId = `pymol-${safeSegment(conversationId)}-${crypto.randomBytes(4).toString('hex')}`;
    const workDir = path.join(workspaceRoot(), '.openscience', 'pymol', safeSegment(conversationId), sessionId);
    fs.mkdirSync(workDir, { recursive: true });
    this.conversationId = conversationId;
    this.sessionId = sessionId;
    this.workDir = workDir;
    this.child = spawn(python, ['-u', worker], {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        OPENSCIENCE_CONVERSATION_ID: conversationId,
        OPENBIOSCIENCE_PYMOL_SESSION_ID: sessionId,
        OPENBIOSCIENCE_PYMOL_WORK_DIR: workDir,
        PYTHONUNBUFFERED: '1',
      },
    });
    this.child.stderr.on('data', (chunk) => process.stderr.write(`[pymol-worker] ${String(chunk)}`));
    this.child.once('exit', (code, signal) => {
      const error = new Error(`PyMOL worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
      this.child = undefined;
      for (const item of this.pending.values()) {
        clearTimeout(item.timer);
        item.reject(error);
      }
      this.pending.clear();
      this.conversationId = undefined;
      this.sessionId = undefined;
      this.workDir = undefined;
    });
    this.lineReader = readline.createInterface({ input: this.child.stdout });
    this.lineReader.on('line', (line) => this.handleLine(line));
    this.scheduleIdleTimeout();
  }

  private scheduleIdleTimeout(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const configured = Number(process.env.OPENBIOSCIENCE_PYMOL_IDLE_TIMEOUT_MS || 30 * 60 * 1000);
    if (!Number.isFinite(configured) || configured <= 0) return;
    this.idleTimer = setTimeout(() => this.close('idle-timeout'), configured);
    this.idleTimer.unref();
  }

  private handleLine(line: string): void {
    let reply: WorkerReply;
    try {
      reply = JSON.parse(line) as WorkerReply;
    } catch {
      process.stderr.write(`[pymol-worker] ignored non-JSON output: ${line}\n`);
      return;
    }
    const item = this.pending.get(reply.id);
    if (!item) return;
    this.pending.delete(reply.id);
    clearTimeout(item.timer);
    if (!reply.ok) {
      item.reject(new Error(reply.traceback || reply.error || 'PyMOL worker failed'));
      return;
    }
    item.resolve(reply);
  }
}

const workerClient = new PyMolWorkerClient();

class PyMolCoreClient {
  private unavailable = false;
  private readonly revisions = new Map<string, number>();

  async call(
    action: string,
    payload: JsonRecord,
    requestedConversationId?: string
  ): Promise<PyMolSessionResult | undefined> {
    const baseUrl = this.baseUrl();
    if (!baseUrl || this.unavailable) return undefined;
    const conversationId = requestedConversationId?.trim() || process.env.OPENSCIENCE_CONVERSATION_ID || 'default';
    try {
      if (action === 'session' && payload.operation === 'close') {
        const snapshot = await this.request<PyMolSessionResult | PyMolViewerState>(
          baseUrl,
          `/api/pymol/sessions/${encodeURIComponent(conversationId)}`
        );
        const state = this.viewerState(snapshot);
        await this.request(baseUrl, `/api/pymol/sessions/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
        this.revisions.delete(conversationId);
        const stoppedState: PyMolViewerState = {
          ...state,
          revision: state.revision + 1,
          status: 'stopped',
          updatedAt: Date.now(),
        };
        return {
          sessionId: stoppedState.sessionId,
          revision: stoppedState.revision,
          state: stoppedState,
          artifacts: [],
          warnings: [],
          result: { closing: true },
        };
      }
      if (!this.revisions.has(conversationId)) {
        const ensured = await this.request<PyMolSessionResult>(baseUrl, '/api/pymol/sessions/ensure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId }),
        });
        this.revisions.set(conversationId, ensured.revision);
        if (action === 'session' && payload.operation === 'status') return ensured;
      }
      return await this.command(baseUrl, conversationId, action, payload, true);
    } catch (error) {
      if (error instanceof CoreApiError && (error.status === 404 || error.status === 501)) {
        this.unavailable = true;
        return undefined;
      }
      throw error;
    }
  }

  private baseUrl(): string | undefined {
    const explicit = process.env.OPENBIOSCIENCE_CORE_BASE_URL?.trim();
    if (explicit) return explicit.replace(/\/$/u, '');
    const port = process.env.DEEPORGANISER_BACKEND_PORT || process.env.BACKEND_PORT;
    return port ? `http://127.0.0.1:${port}` : undefined;
  }

  private async command(
    baseUrl: string,
    conversationId: string,
    action: string,
    payload: JsonRecord,
    retry: boolean
  ): Promise<PyMolSessionResult> {
    try {
      const result = await this.request<PyMolSessionResult>(
        baseUrl,
        `/api/pymol/sessions/${encodeURIComponent(conversationId)}/commands`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            baseRevision: this.revisions.get(conversationId) || 0,
            source: 'agent',
            action,
            payload,
          }),
        }
      );
      this.revisions.set(conversationId, result.revision);
      return result;
    } catch (error) {
      if (error instanceof CoreApiError && shouldReplayPyMolCommand(error.status, retry)) {
        const latest = await this.request<PyMolSessionResult | PyMolViewerState>(
          baseUrl,
          `/api/pymol/sessions/${encodeURIComponent(conversationId)}`
        );
        const state = this.viewerState(latest);
        this.revisions.set(conversationId, state.revision);
        return await this.command(baseUrl, conversationId, action, payload, false);
      }
      throw error;
    }
  }

  private async request<T = unknown>(baseUrl: string, route: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${route}`, init);
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    if (!response.ok) throw new CoreApiError(response.status, body);
    return body as T;
  }

  private viewerState(value: PyMolSessionResult | PyMolViewerState): PyMolViewerState {
    return 'state' in value ? value.state : value;
  }
}

class CoreApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    super(`PyMOL core API returned ${status}`);
  }
}

const coreClient = new PyMolCoreClient();

const toolResult = (reply: PyMolSessionResult) => {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  > = [{ type: 'text', text: JSON.stringify(reply, null, 2) }];
  const image = reply.artifacts?.find((artifact) => artifact.mimeType === 'image/png' && fs.existsSync(artifact.path));
  if (image) {
    content.push({ type: 'image', data: fs.readFileSync(image.path).toString('base64'), mimeType: 'image/png' });
  }
  return { content };
};

const runTool = async (action: string, payload: JsonRecord, conversationId?: string) => {
  const coreReply = await coreClient.call(action, payload, conversationId);
  if (coreReply) return toolResult(coreReply);
  const workerReply = await workerClient.call(action, payload, conversationId);
  workerReply.warnings.unshift(
    'The installed deeporganiser-core does not expose the PyMOL session API; this fallback session is not synchronized with WebUI.'
  );
  return toolResult(workerReply);
};

async function main() {
  const server = new McpServer({ name: SERVER_NAME, version: '1.0.0' });
  const conversationField = { conversationId: z.string().min(1).optional() };

  server.tool(
    'pymol_session',
    'Start, inspect, reset, or close the headless PyMOL session for one OpenBioScience conversation.',
    { ...conversationField, operation: z.enum(['status', 'reset', 'close']).default('status') },
    async ({ conversationId, operation }) => {
      const result = await runTool('session', { operation }, conversationId);
      if (operation === 'close') workerClient.close('explicit-close');
      return result;
    }
  );

  server.tool(
    'pymol_load',
    'Load one or more PDB/mmCIF files into the authoritative PyMOL session.',
    { ...conversationField, paths: z.array(z.string().min(1)).min(1), names: z.array(z.string().min(1)).optional() },
    async ({ conversationId, paths, names }) =>
      runTool('load', { paths: paths.map(assertReadablePath), ...(names ? { names } : {}) }, conversationId)
  );

  server.tool(
    'pymol_display',
    'Change representation, visibility, color, pLDDT coloring, background, or camera.',
    {
      ...conversationField,
      selection: z.string().default('all'),
      representation: z.enum(['cartoon', 'stick', 'sphere', 'line', 'surface']).optional(),
      visible: z.boolean().optional(),
      color: z.string().optional(),
      colorBy: z.enum(['plddt']).optional(),
      background: z.enum(['light', 'dark', 'transparent']).optional(),
      camera: z.object({ pymolView: z.array(z.number()).length(18), viewerView: z.array(z.number()).optional() }).optional(),
    },
    async ({ conversationId, ...payload }) => runTool('display', payload, conversationId)
  );

  server.tool(
    'pymol_select',
    'Create or replace a named PyMOL selection.',
    { ...conversationField, name: z.string().min(1), expression: z.string().min(1) },
    async ({ conversationId, ...payload }) => runTool('select', payload, conversationId)
  );

  server.tool(
    'pymol_align',
    'Align a mobile selection onto a target selection and return RMSD.',
    { ...conversationField, mobile: z.string().min(1), target: z.string().min(1) },
    async ({ conversationId, ...payload }) => runTool('align', payload, conversationId)
  );

  server.tool(
    'pymol_measure',
    'Measure a distance between two PyMOL selections.',
    {
      ...conversationField,
      name: z.string().default('distance'),
      selection1: z.string().min(1),
      selection2: z.string().min(1),
    },
    async ({ conversationId, ...payload }) => runTool('measure', payload, conversationId)
  );

  server.tool(
    'pymol_metrics',
    'Read per-residue pLDDT with real chain/residue identifiers plus sibling pTM, ipTM, and PAE summaries.',
    {
      ...conversationField,
      selection: z.string().default('all'),
      path: z.string().optional(),
      threshold: z.number().min(0).max(100).default(70),
    },
    async ({ conversationId, path: inputPath, ...payload }) =>
      runTool('metrics', { ...payload, ...(inputPath ? { path: assertReadablePath(inputPath) } : {}) }, conversationId)
  );

  server.tool(
    'pymol_apply_residue_table',
    'Apply typed residue-level scores or colors to a PyMOL structure without arbitrary Python.',
    {
      ...conversationField,
      rows: z
        .array(
          z
            .object({
              chain: z.string().optional(),
              residueId: z.string().min(1).optional(),
              residueNumber: z.number().int().optional(),
              insertionCode: z.string().optional(),
              score: z.number().optional(),
              color: z.string().optional(),
              label: z.string().optional(),
            })
            .passthrough()
        )
        .optional(),
      tablePath: z.string().optional(),
      selectionName: z.string().default('residue_table'),
      colorMap: z.enum(['blue_white_red', 'red_white_blue', 'plddt']).default('blue_white_red'),
      minScore: z.number().optional(),
      maxScore: z.number().optional(),
    },
    async ({ conversationId, tablePath, ...payload }) =>
      runTool(
        'apply_residue_table',
        { ...payload, ...(tablePath ? { tablePath: assertReadablePath(tablePath) } : {}) },
        conversationId
      )
  );

  server.tool(
    'pymol_triage',
    'Load and rank all PDB/mmCIF structures in a directory by mean pLDDT.',
    { ...conversationField, path: z.string().min(1) },
    async ({ conversationId, path: inputPath }) =>
      runTool('triage', { path: assertReadablePath(inputPath) }, conversationId)
  );

  server.tool(
    'pymol_render',
    'Render the authoritative PyMOL view as a PNG artifact and inline MCP image.',
    {
      ...conversationField,
      width: z.number().int().min(64).max(4096).default(800),
      height: z.number().int().min(64).max(4096).default(600),
      ray: z.boolean().default(true),
      outputPath: z.string().optional(),
    },
    async ({ conversationId, ...payload }) => runTool('render', payload, conversationId)
  );

  server.tool(
    'pymol_export',
    'Export the current PyMOL session or a coordinate selection as an artifact.',
    {
      ...conversationField,
      format: z.enum(['pse', 'pdb', 'cif']).default('pse'),
      selection: z.string().default('all'),
      outputPath: z.string().optional(),
    },
    async ({ conversationId, ...payload }) => runTool('export', payload, conversationId)
  );

  server.tool(
    'pymol_run',
    'Execute arbitrary Python with pymol.cmd bound as cmd. This is full server code execution and is audited.',
    { ...conversationField, code: z.string().min(1) },
    async ({ conversationId, ...payload }) => runTool('run', payload, conversationId)
  );

  const shutdown = () => workerClient.close();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('exit', shutdown);
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error('[OpenBioScience PyMOL MCP] Fatal error:', error);
  workerClient.close();
  process.exit(1);
});
