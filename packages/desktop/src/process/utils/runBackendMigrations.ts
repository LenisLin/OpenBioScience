/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import { migrateConfigStorage, migrateLegacyMcpConfigToDb, migrateProviders } from '@/common/config/configMigration';
import { httpRequest } from '@/common/adapter/httpBridge';
import { mcpService } from '@/common/adapter/ipcBridge';
import type { ConfigKeyMap } from '@/common/config/configKeys';
import {
  removeImageGenerationEnvKeys,
  resolveImageGenerationMcpEnv,
  type ImageGenerationMcpEnvResolveResult,
} from '@/common/config/imageGenerationMcpEnv';
import {
  removeMedicalEvidenceEnvKeys,
  resolveMedicalEvidenceMcpEnv,
  type MedicalEvidenceMcpEnvResolveResult,
} from '@/common/config/medicalEvidenceMcpEnv';
import {
  BUILTIN_IMAGE_GEN_NAME,
  BUILTIN_LARK_PROJECT_AGENT_NAME,
  BUILTIN_MEDICAL_EVIDENCE_NAME,
  type IMcpServer,
  type IProvider,
} from '@/common/config/storage';
import { getPlatformServices } from '@/common/platform';
import { legacyEnvName } from '@/common/config/legacyIdentifiers';
import { getProjectAgentDataDir } from '@/deepscientist_lark/project_agent/store';
import { getBuiltinMcpScriptPath, type ProcessConfig as ProcessConfigType } from './initStorage';
import { migrateAssistantsToBackend } from './migrateAssistants';

type ConfigFile = typeof ProcessConfigType;
type MigrationStepResult = boolean;
type McpImportServer = Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'>;
type BackendClientPreferences = Record<string, unknown>;
const BUILTIN_CHROME_DEVTOOLS_NAME = 'chrome-devtools';

const LEGACY_BACKEND_CLIENT_PREFERENCE_KEYS = [
  'assistants',
  'migration.assistantEnabledFixed',
  'migration.coworkDefaultSkillsAdded',
  'migration.builtinDefaultSkillsAdded_v2',
  'migration.promptsI18nAdded',
  'migration.assistantsSplitCustom',
] as const;

async function cleanupLegacyClientPreferences(): Promise<void> {
  const payloadEntries = LEGACY_BACKEND_CLIENT_PREFERENCE_KEYS.map((key): [string, null] => [key, null]);
  const payload = Object.fromEntries(payloadEntries);
  await httpRequest<void>('PUT', '/api/settings/client', payload);
}

const CLEANUP_STEPS: Array<{
  name: string;
  run: () => Promise<void>;
}> = [{ name: 'cleanupLegacyClientPreferences', run: async () => cleanupLegacyClientPreferences() }];

async function fetchBackendClientPreferences(): Promise<BackendClientPreferences> {
  try {
    return (await httpRequest<BackendClientPreferences>('GET', '/api/settings/client')) || {};
  } catch {
    return {};
  }
}

async function fetchProviders(): Promise<IProvider[]> {
  try {
    return (await httpRequest<IProvider[]>('GET', '/api/providers')) || [];
  } catch (error) {
    console.warn('[Migration] MCP bootstrap could not load providers for image generation env resolution', error);
    return [];
  }
}

export function resolveImageGenerationMigrationConfig(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ConfigKeyMap['tools.imageGenerationModel']
): ConfigKeyMap['tools.imageGenerationModel'] | undefined {
  const backendConfig = backendPrefs['tools.imageGenerationModel'];
  if (backendConfig && typeof backendConfig === 'object') {
    return backendConfig as ConfigKeyMap['tools.imageGenerationModel'];
  }
  return fileConfig;
}

function resolveImageGenerationMigrationConfigSource(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ConfigKeyMap['tools.imageGenerationModel']
): 'backend' | 'file' | 'none' {
  const backendConfig = backendPrefs['tools.imageGenerationModel'];
  if (backendConfig && typeof backendConfig === 'object') {
    return 'backend';
  }
  return fileConfig ? 'file' : 'none';
}

function resolveMedicalEvidenceMigrationConfig(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ConfigKeyMap['tools.medicalEvidence']
): ConfigKeyMap['tools.medicalEvidence'] | undefined {
  const backendConfig = backendPrefs['tools.medicalEvidence'];
  if (backendConfig && typeof backendConfig === 'object') {
    return backendConfig as ConfigKeyMap['tools.medicalEvidence'];
  }
  return fileConfig;
}

function resolveMedicalEvidenceMigrationConfigSource(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ConfigKeyMap['tools.medicalEvidence']
): 'backend' | 'file' | 'none' {
  const backendConfig = backendPrefs['tools.medicalEvidence'];
  if (backendConfig && typeof backendConfig === 'object') {
    return 'backend';
  }
  return fileConfig ? 'file' : 'none';
}

function logImageGenerationEnvResolution(
  result: ImageGenerationMcpEnvResolveResult,
  context: 'bootstrap' | 'update'
): void {
  if (result.ok === true) {
    console.info(
      '[Migration] image MCP env resolved via %s during %s, provider id: %s, platform: %s, model: %s, api key present: %s',
      result.source,
      context,
      result.provider.id,
      result.provider.platform,
      result.model,
      result.provider.api_key ? 'yes' : 'no'
    );
    return;
  }

  console.warn(
    '[Migration] image MCP env resolution failed during %s, reason: %s, message: %s, candidates: %s',
    context,
    result.reason,
    result.message,
    result.candidates?.join(',') || 'none'
  );
}

function buildBuiltinImageGenerationServer(
  resolution: ImageGenerationMcpEnvResolveResult,
  config?: ConfigKeyMap['tools.imageGenerationModel']
): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-image-gen');
  const env = resolution.ok ? resolution.env : {};
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_IMAGE_GEN_NAME,
    description: 'Built-in image generation tool powered by AI models. Configure the model in Settings > Tools.',
    enabled: config?.switch === true && resolution.ok,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_IMAGE_GEN_NAME]: serverConfig } }, null, 2),
  };
}

function buildBuiltinLarkProjectAgentServer(): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-lark-project-agent');
  const backendPort = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
  const env: Record<string, string> = {
    DEEPORGANISER_DATA_DIR: getPlatformServices().paths.getDataDir(),
    DEEPORGANISER_PROJECT_AGENT_DIR: getProjectAgentDataDir(),
    [legacyEnvName('DATA_DIR')]: getPlatformServices().paths.getDataDir(),
  };
  if (backendPort) {
    env.DEEPORGANISER_BACKEND_PORT = String(backendPort);
    env[legacyEnvName('BACKEND_PORT')] = String(backendPort);
  }
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_LARK_PROJECT_AGENT_NAME,
    description: 'Built-in Lark project delegation bridge for Team Mode leader Agents.',
    enabled: false,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_LARK_PROJECT_AGENT_NAME]: serverConfig } }, null, 2),
  };
}

function logMedicalEvidenceEnvResolution(
  result: MedicalEvidenceMcpEnvResolveResult,
  context: 'bootstrap' | 'update'
): void {
  if (result.ok === true) {
    console.info(
      '[Migration] medical evidence MCP env resolved during %s, base url: %s, api key present: yes',
      context,
      result.config.paperclipBaseUrl || 'https://paperclip.gxl.ai'
    );
    return;
  }

  console.warn(
    '[Migration] medical evidence MCP env resolution incomplete during %s, reason: %s, message: %s',
    context,
    result.reason,
    result.message
  );
}

function buildBuiltinMedicalEvidenceServer(resolution: MedicalEvidenceMcpEnvResolveResult): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-medical-evidence');
  const env = resolution.env || {};
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_MEDICAL_EVIDENCE_NAME,
    description: 'Built-in medical evidence bridge for PaperClip search, evidence grading, and citation panels.',
    enabled: false,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_MEDICAL_EVIDENCE_NAME]: serverConfig } }, null, 2),
  };
}

function areStringArraysEqual(left?: string[], right?: string[]): boolean {
  const leftValue = left || [];
  const rightValue = right || [];
  return leftValue.length === rightValue.length && leftValue.every((item, index) => item === rightValue[index]);
}

function areStringRecordsEqual(left?: Record<string, string>, right?: Record<string, string>): boolean {
  const leftValue = left || {};
  const rightValue = right || {};
  const leftKeys = Object.keys(leftValue).sort();
  const rightKeys = Object.keys(rightValue).sort();
  return areStringArraysEqual(leftKeys, rightKeys) && leftKeys.every((key) => leftValue[key] === rightValue[key]);
}

function isSameStdioTransport(left: IMcpServer['transport'], right: IMcpServer['transport']): boolean {
  return (
    left.type === 'stdio' &&
    right.type === 'stdio' &&
    left.command === right.command &&
    areStringArraysEqual(left.args, right.args) &&
    areStringRecordsEqual(left.env, right.env)
  );
}

function buildDefaultMcpServers(): McpImportServer[] {
  const chromeConfig = {
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest'],
  };

  return [
    {
      name: BUILTIN_CHROME_DEVTOOLS_NAME,
      description: 'Default MCP server: chrome-devtools',
      enabled: false,
      builtin: true,
      transport: {
        type: 'stdio',
        command: chromeConfig.command,
        args: chromeConfig.args,
      },
      original_json: JSON.stringify({ mcpServers: { [BUILTIN_CHROME_DEVTOOLS_NAME]: chromeConfig } }, null, 2),
    },
  ];
}

async function isCommandAvailable(command: string): Promise<boolean> {
  return await new Promise((resolve) => {
    execFile(command, ['--version'], { timeout: 3000 }, (error) => {
      if (!error) {
        resolve(true);
        return;
      }

      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        resolve(false);
        return;
      }

      resolve(true);
    });
  });
}

async function ensureBuiltinChromeDevtoolsAvailability(server?: IMcpServer): Promise<void> {
  if (
    !server ||
    server.name !== BUILTIN_CHROME_DEVTOOLS_NAME ||
    server.transport.type !== 'stdio' ||
    server.transport.command !== 'npx'
  ) {
    return;
  }

  const hasNpx = await isCommandAvailable(server.transport.command);
  if (hasNpx) {
    return;
  }

  try {
    await mcpService.testMcpConnection.invoke(server);
  } catch (error) {
    console.warn('[Migration] chrome-devtools MCP preflight failed', error);
  }
}

function buildOriginalJsonFromTransport(server: Pick<IMcpServer, 'name' | 'description' | 'transport'>): string {
  const transport_config =
    server.transport.type === 'stdio'
      ? {
          command: server.transport.command,
          args: server.transport.args || [],
          env: server.transport.env || {},
        }
      : {
          type: server.transport.type,
          url: server.transport.url,
          ...(server.transport.headers ? { headers: server.transport.headers } : {}),
        };

  return JSON.stringify(
    {
      mcpServers: {
        [server.name]: {
          ...(server.description ? { description: server.description } : {}),
          ...transport_config,
        },
      },
    },
    null,
    2
  );
}

async function ensureBootstrapMcpServersInDb(configFile: ConfigFile): Promise<void> {
  const [backendPrefs, fileImageConfig, fileMedicalEvidenceConfig, providers] = await Promise.all([
    fetchBackendClientPreferences(),
    configFile.get('tools.imageGenerationModel').catch((): undefined => undefined),
    configFile.get('tools.medicalEvidence').catch((): undefined => undefined),
    fetchProviders(),
  ]);
  const imageConfig = resolveImageGenerationMigrationConfig(backendPrefs, fileImageConfig);
  const imageConfigSource = resolveImageGenerationMigrationConfigSource(backendPrefs, fileImageConfig);
  const medicalEvidenceConfig = resolveMedicalEvidenceMigrationConfig(backendPrefs, fileMedicalEvidenceConfig);
  const medicalEvidenceConfigSource = resolveMedicalEvidenceMigrationConfigSource(
    backendPrefs,
    fileMedicalEvidenceConfig
  );
  const existing = await mcpService.listServers.invoke();
  const existingByName = new Map((existing ?? []).map((server) => [server.name, server]));
  const existingImageServer = existingByName.get(BUILTIN_IMAGE_GEN_NAME);
  const existingMedicalEvidenceServer = existingByName.get(BUILTIN_MEDICAL_EVIDENCE_NAME);
  const existingImageEnv =
    existingImageServer?.transport.type === 'stdio' ? existingImageServer.transport.env : undefined;
  const existingMedicalEvidenceEnv =
    existingMedicalEvidenceServer?.transport.type === 'stdio' ? existingMedicalEvidenceServer.transport.env : undefined;
  const imageEnvResolution = resolveImageGenerationMcpEnv(imageConfig, providers, existingImageEnv);
  const medicalEvidenceEnvResolution = resolveMedicalEvidenceMcpEnv(medicalEvidenceConfig, existingMedicalEvidenceEnv);
  logImageGenerationEnvResolution(imageEnvResolution, 'bootstrap');
  logMedicalEvidenceEnvResolution(medicalEvidenceEnvResolution, 'bootstrap');
  const imageServer = buildBuiltinImageGenerationServer(imageEnvResolution, imageConfig);
  const medicalEvidenceServer = buildBuiltinMedicalEvidenceServer(medicalEvidenceEnvResolution);
  const larkProjectAgentServer = buildBuiltinLarkProjectAgentServer();
  const defaultServers = [...buildDefaultMcpServers(), larkProjectAgentServer];
  const missing = [...defaultServers, imageServer, medicalEvidenceServer].filter((server) => !existingByName.has(server.name));
  let imageServerUpdated = false;
  let medicalEvidenceServerUpdated = false;

  if (missing.length > 0) {
    await mcpService.batchImportServers.invoke({ servers: missing });
  }

  const existingChromeDevtools = existingByName.get(BUILTIN_CHROME_DEVTOOLS_NAME);
  if (
    existingChromeDevtools &&
    (existingChromeDevtools.builtin !== true ||
      !existingChromeDevtools.original_json ||
      existingChromeDevtools.original_json.trim() === '' ||
      existingChromeDevtools.original_json.trim() === '{}')
  ) {
    await mcpService.updateServer.invoke({
      id: existingChromeDevtools.id,
      data: {
        builtin: true,
        original_json: buildOriginalJsonFromTransport(existingChromeDevtools),
      },
    });
  }

  const existingLarkProjectAgentServer = existingByName.get(BUILTIN_LARK_PROJECT_AGENT_NAME);
  if (
    existingLarkProjectAgentServer &&
    (existingLarkProjectAgentServer.builtin !== true ||
      !existingLarkProjectAgentServer.original_json ||
      existingLarkProjectAgentServer.original_json.trim() === '' ||
      existingLarkProjectAgentServer.original_json.trim() === '{}' ||
      !isSameStdioTransport(existingLarkProjectAgentServer.transport, larkProjectAgentServer.transport))
  ) {
    await mcpService.updateServer.invoke({
      id: existingLarkProjectAgentServer.id,
      data: {
        builtin: true,
        transport: larkProjectAgentServer.transport,
        original_json: larkProjectAgentServer.original_json,
      },
    });
  }

  if (
    existingMedicalEvidenceServer &&
    (existingMedicalEvidenceServer.builtin !== true ||
      !existingMedicalEvidenceServer.original_json ||
      existingMedicalEvidenceServer.original_json.trim() === '' ||
      existingMedicalEvidenceServer.original_json.trim() === '{}' ||
      !isSameStdioTransport(existingMedicalEvidenceServer.transport, medicalEvidenceServer.transport))
  ) {
    await mcpService.updateServer.invoke({
      id: existingMedicalEvidenceServer.id,
      data: {
        builtin: true,
        transport: medicalEvidenceServer.transport,
        original_json: medicalEvidenceServer.original_json,
      },
    });
    medicalEvidenceServerUpdated = true;
  }

  const refreshedServers = await mcpService.listServers.invoke();
  const chromeDevtoolsServer = refreshedServers.find((server) => server.name === BUILTIN_CHROME_DEVTOOLS_NAME);
  await ensureBuiltinChromeDevtoolsAvailability(chromeDevtoolsServer);

  if (
    imageEnvResolution.ok === true &&
    existingImageServer &&
    existingImageServer.transport.type === 'stdio' &&
    imageServer.transport.type === 'stdio'
  ) {
    const mergedEnv = {
      ...removeImageGenerationEnvKeys(existingImageServer.transport.env || {}),
      ...imageEnvResolution.env,
    };
    const updatedTransport = {
      ...imageServer.transport,
      env: mergedEnv,
    };
    const original_json = JSON.stringify(
      {
        mcpServers: {
          [BUILTIN_IMAGE_GEN_NAME]: {
            command: updatedTransport.command,
            args: updatedTransport.args || [],
            env: mergedEnv,
          },
        },
      },
      null,
      2
    );
    const imageTransportChanged = !isSameStdioTransport(existingImageServer.transport, updatedTransport);
    const imageOriginalJsonChanged = existingImageServer.original_json !== original_json;
    const imageServerChanged = imageTransportChanged || imageOriginalJsonChanged;
    console.info(
      '[Migration] image MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      existingImageServer.id,
      imageTransportChanged ? 'yes' : 'no',
      imageOriginalJsonChanged ? 'yes' : 'no',
      imageServerChanged ? 'yes' : 'no'
    );
    if (imageServerChanged) {
      await mcpService.updateServer.invoke({
        id: existingImageServer.id,
        data: {
          transport: updatedTransport,
          original_json,
        },
      });
      imageServerUpdated = true;
    }
  } else if (existingImageServer && imageEnvResolution.ok === false) {
    console.warn(
      '[Migration] skipped image MCP env update because provider could not be resolved, server id: %s, reason: %s',
      existingImageServer.id,
      imageEnvResolution.reason
    );
  }

  if (
    existingMedicalEvidenceServer &&
    existingMedicalEvidenceServer.transport.type === 'stdio' &&
    medicalEvidenceServer.transport.type === 'stdio'
  ) {
    const mergedEnv = {
      ...removeMedicalEvidenceEnvKeys(existingMedicalEvidenceServer.transport.env || {}),
      ...medicalEvidenceEnvResolution.env,
    };
    const updatedTransport = {
      ...medicalEvidenceServer.transport,
      env: mergedEnv,
    };
    const original_json = JSON.stringify(
      {
        mcpServers: {
          [BUILTIN_MEDICAL_EVIDENCE_NAME]: {
            command: updatedTransport.command,
            args: updatedTransport.args || [],
            env: mergedEnv,
          },
        },
      },
      null,
      2
    );
    const medicalTransportChanged = !isSameStdioTransport(existingMedicalEvidenceServer.transport, updatedTransport);
    const medicalOriginalJsonChanged = existingMedicalEvidenceServer.original_json !== original_json;
    const medicalServerChanged = medicalTransportChanged || medicalOriginalJsonChanged;
    console.info(
      '[Migration] medical evidence MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      existingMedicalEvidenceServer.id,
      medicalTransportChanged ? 'yes' : 'no',
      medicalOriginalJsonChanged ? 'yes' : 'no',
      medicalServerChanged ? 'yes' : 'no'
    );
    if (medicalServerChanged) {
      await mcpService.updateServer.invoke({
        id: existingMedicalEvidenceServer.id,
        data: {
          transport: updatedTransport,
          original_json,
        },
      });
      medicalEvidenceServerUpdated = true;
    }
  }

  if (imageConfig?.switch === true) {
    const { switch: _switch, ...rest } = imageConfig;
    await configFile.set('tools.imageGenerationModel', rest as ConfigKeyMap['tools.imageGenerationModel']);
  }

  console.info(
    '[Migration] MCP bootstrap completed, imported %d missing defaults, updated image server: %s, updated medical evidence server: %s, image config source: %s, medical evidence config source: %s, image enabled: %s',
    missing.length,
    imageServerUpdated ? 'yes' : 'no',
    medicalEvidenceServerUpdated ? 'yes' : 'no',
    imageConfigSource,
    medicalEvidenceConfigSource,
    imageConfig?.switch === true ? 'yes' : 'no'
  );
}

const MIGRATION_STEPS: Array<{
  name: string;
  run: (configFile: ConfigFile) => Promise<MigrationStepResult>;
}> = [
  {
    name: 'migrateLegacyMcpConfigToDb',
    run: async (configFile) => (await migrateLegacyMcpConfigToDb(configFile), true),
  },
  { name: 'migrateConfigStorage', run: async (configFile) => (await migrateConfigStorage(configFile), true) },
  { name: 'migrateProviders', run: async (configFile) => (await migrateProviders(configFile), true) },
  {
    name: 'ensureBootstrapMcpServersInDb',
    run: async (configFile) => (await ensureBootstrapMcpServersInDb(configFile), true),
  },
  { name: 'migrateAssistantsToBackend', run: async (configFile) => migrateAssistantsToBackend(configFile) },
];

async function syncBuiltinMcpConfig(configFile: ConfigFile): Promise<void> {
  const localMcpConfig = ((await configFile.get('mcp.config').catch((): IMcpServer[] => [])) || []) as IMcpServer[];
  const localBuiltinServers = localMcpConfig.filter((server) => server?.builtin === true);

  if (localBuiltinServers.length === 0) {
    return;
  }

  const backendSettings = (await httpRequest<Record<string, unknown>>('GET', '/api/settings/client')) || {};
  const backendMcpConfig = Array.isArray(backendSettings['mcp.config'])
    ? (backendSettings['mcp.config'] as IMcpServer[])
    : [];

  const mergedMcpConfig = [...backendMcpConfig.filter((server) => server?.builtin !== true), ...localBuiltinServers];

  if (JSON.stringify(backendMcpConfig) === JSON.stringify(mergedMcpConfig)) {
    return;
  }

  await httpRequest<void>('PUT', '/api/settings/client', { 'mcp.config': mergedMcpConfig });
  console.info(
    '[DeepOrganiser] Synced builtin MCP config to backend settings (%d builtin servers)',
    localBuiltinServers.length
  );
}

export async function runBackendMigrations(configFile: ConfigFile): Promise<void> {
  await CLEANUP_STEPS.reduce<Promise<void>>(async (previous, step) => {
    await previous;
    const start = Date.now();
    try {
      await step.run();
      console.info(`[DeepOrganiser] Backend migration step completed: ${step.name} (${Date.now() - start}ms)`);
    } catch (error) {
      console.error(`[DeepOrganiser] Backend migration step failed: ${step.name} (${Date.now() - start}ms)`, error);
    }
  }, Promise.resolve());

  await MIGRATION_STEPS.reduce<Promise<void>>(async (previous, step) => {
    await previous;
    const start = Date.now();
    try {
      const completed = await step.run(configFile);
      const elapsed = Date.now() - start;
      if (!completed) {
        console.warn(`[DeepOrganiser] Backend migration step incomplete: ${step.name} (${elapsed}ms)`);
        return;
      }
      console.info(`[DeepOrganiser] Backend migration step completed: ${step.name} (${elapsed}ms)`);
    } catch (error) {
      const elapsed = Date.now() - start;
      console.error(`[DeepOrganiser] Backend migration step failed: ${step.name} (${elapsed}ms)`, error);
    }
  }, Promise.resolve());

  const syncStart = Date.now();
  try {
    await syncBuiltinMcpConfig(configFile);
    console.info(
      `[DeepOrganiser] Backend migration step completed: syncBuiltinMcpConfig (${Date.now() - syncStart}ms)`
    );
  } catch (error) {
    console.error(
      `[DeepOrganiser] Backend migration step failed: syncBuiltinMcpConfig (${Date.now() - syncStart}ms)`,
      error
    );
  }
}
