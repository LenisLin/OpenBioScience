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
  removeResearchEvidenceEnvKeys,
  resolveResearchEvidenceMcpEnv,
  type ResearchEvidenceMcpEnvResolveResult,
} from '@/common/config/researchEvidenceMcpEnv';
import {
  removeScienceArtifactEnvKeys,
  resolveScienceArtifactMcpEnv,
  type ScienceArtifactMcpEnvResolveResult,
} from '@/common/config/scienceArtifactMcpEnv';
import {
  BUILTIN_IMAGE_GEN_NAME,
  BUILTIN_IMAGE_GEN_LEGACY_NAMES,
  BUILTIN_LAB_SKILL_NAME,
  BUILTIN_LAB_SKILL_LEGACY_NAMES,
  BUILTIN_LARK_PROJECT_AGENT_NAME,
  BUILTIN_LARK_PROJECT_AGENT_LEGACY_NAMES,
  BUILTIN_MEDICAL_EVIDENCE_NAME,
  BUILTIN_MEDICAL_EVIDENCE_LEGACY_NAMES,
  BUILTIN_RESEARCH_EVIDENCE_NAME,
  BUILTIN_RESEARCH_EVIDENCE_LEGACY_NAMES,
  BUILTIN_SCIENCE_ARTIFACT_NAME,
  BUILTIN_SCIENCE_ARTIFACT_LEGACY_NAMES,
  BUILTIN_USER_INPUT_NAME,
  BUILTIN_USER_INPUT_LEGACY_NAMES,
  type IMcpServer,
  type IProvider,
} from '@/common/config/storage';
import { getPlatformServices } from '@/common/platform';
import { legacyEnvName } from '@/common/config/legacyIdentifiers';
import { getProjectAgentDataDir } from '@/deepscientist_lark/project_agent/store';
import { getBuiltinMcpScriptPath, type ProcessConfig as ProcessConfigType } from './initStorage';
import { migrateAssistantsToBackend } from './migrateAssistants';
import { getUserInputGatewayEnv, startUserInputGateway } from '../bridge/userInputBridge';

type ConfigFile = typeof ProcessConfigType;
type MigrationStepResult = boolean;
type McpImportServer = Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'>;
type BackendClientPreferences = Record<string, unknown>;
const BUILTIN_CHROME_DEVTOOLS_NAME = 'chrome-devtools';

const BUILTIN_SERVER_LEGACY_NAMES = new Map<string, readonly string[]>([
  [BUILTIN_IMAGE_GEN_NAME, BUILTIN_IMAGE_GEN_LEGACY_NAMES],
  [BUILTIN_LARK_PROJECT_AGENT_NAME, BUILTIN_LARK_PROJECT_AGENT_LEGACY_NAMES],
  [BUILTIN_MEDICAL_EVIDENCE_NAME, BUILTIN_MEDICAL_EVIDENCE_LEGACY_NAMES],
  [BUILTIN_RESEARCH_EVIDENCE_NAME, BUILTIN_RESEARCH_EVIDENCE_LEGACY_NAMES],
  [BUILTIN_SCIENCE_ARTIFACT_NAME, BUILTIN_SCIENCE_ARTIFACT_LEGACY_NAMES],
  [BUILTIN_LAB_SKILL_NAME, BUILTIN_LAB_SKILL_LEGACY_NAMES],
  [BUILTIN_USER_INPUT_NAME, BUILTIN_USER_INPUT_LEGACY_NAMES],
]);

function findExistingBuiltinServer(existingByName: Map<string, IMcpServer>, name: string): IMcpServer | undefined {
  return existingByName.get(name) ?? BUILTIN_SERVER_LEGACY_NAMES.get(name)?.map((legacy) => existingByName.get(legacy)).find(Boolean);
}

function hasExistingBuiltinServer(existingByName: Map<string, IMcpServer>, name: string): boolean {
  return !!existingByName.get(name);
}

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

function researchEvidenceConfigFromMedical(
  medicalConfig?: ConfigKeyMap['tools.medicalEvidence']
): ConfigKeyMap['tools.researchEvidence'] | undefined {
  if (!medicalConfig) return undefined;
  return {
    paperclipApiKey: medicalConfig.paperclipApiKey,
    paperclipBaseUrl: medicalConfig.paperclipBaseUrl,
    defaultSources: medicalConfig.defaultSources,
    timeoutMs: medicalConfig.timeoutMs,
  };
}

function resolveResearchEvidenceMigrationConfig(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ConfigKeyMap['tools.researchEvidence'],
  fallbackMedicalConfig?: ConfigKeyMap['tools.medicalEvidence']
): ConfigKeyMap['tools.researchEvidence'] | undefined {
  const backendConfig = backendPrefs['tools.researchEvidence'];
  if (backendConfig && typeof backendConfig === 'object') {
    return backendConfig as ConfigKeyMap['tools.researchEvidence'];
  }
  return fileConfig || researchEvidenceConfigFromMedical(fallbackMedicalConfig);
}

function resolveResearchEvidenceMigrationConfigSource(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ConfigKeyMap['tools.researchEvidence'],
  fallbackMedicalConfig?: ConfigKeyMap['tools.medicalEvidence']
): 'backend' | 'file' | 'medicalEvidence' | 'none' {
  const backendConfig = backendPrefs['tools.researchEvidence'];
  if (backendConfig && typeof backendConfig === 'object') {
    return 'backend';
  }
  if (fileConfig) return 'file';
  return fallbackMedicalConfig ? 'medicalEvidence' : 'none';
}

function resolveScienceArtifactMigrationConfig(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ConfigKeyMap['tools.scienceArtifact']
): ConfigKeyMap['tools.scienceArtifact'] | undefined {
  const backendConfig = backendPrefs['tools.scienceArtifact'];
  if (backendConfig && typeof backendConfig === 'object') {
    return backendConfig as ConfigKeyMap['tools.scienceArtifact'];
  }
  return fileConfig;
}

function resolveScienceArtifactMigrationConfigSource(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ConfigKeyMap['tools.scienceArtifact']
): 'backend' | 'file' | 'none' {
  const backendConfig = backendPrefs['tools.scienceArtifact'];
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

function logResearchEvidenceEnvResolution(
  result: ResearchEvidenceMcpEnvResolveResult,
  context: 'bootstrap' | 'update'
): void {
  if (result.ok === true) {
    const providers = [
      result.config.paperclipApiKey ? 'paperclip' : undefined,
      result.config.bioToolsEnabled ? 'bio_tools' : undefined,
    ]
      .filter(Boolean)
      .join(', ');
    console.info(
      '[Migration] research evidence MCP env resolved during %s, providers: %s, base url: %s, paperclip key present: %s',
      context,
      providers || 'none',
      result.config.paperclipBaseUrl || 'https://paperclip.gxl.ai',
      result.config.paperclipApiKey ? 'yes' : 'no'
    );
    return;
  }

  console.warn(
    '[Migration] research evidence MCP env resolution incomplete during %s, reason: %s, message: %s',
    context,
    result.reason,
    result.message
  );
}

function buildBuiltinResearchEvidenceServer(resolution: ResearchEvidenceMcpEnvResolveResult): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-research-evidence');
  const env = resolution.env || {};
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_RESEARCH_EVIDENCE_NAME,
    description: 'Unified research evidence bridge for PaperClip literature/files and Science database tools.',
    enabled: false,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_RESEARCH_EVIDENCE_NAME]: serverConfig } }, null, 2),
  };
}

function logScienceArtifactEnvResolution(
  result: ScienceArtifactMcpEnvResolveResult,
  context: 'bootstrap' | 'update'
): void {
  console.info(
    '[Migration] science artifact MCP env resolved during %s, strict provenance: %s, manifest writes: %s',
    context,
    result.config.strictProvenance ? 'yes' : 'no',
    result.config.writeProjectManifest ? 'yes' : 'no'
  );
}

function buildBuiltinScienceArtifactServer(resolution: ScienceArtifactMcpEnvResolveResult): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-science-artifact');
  const env = resolution.env || {};
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_SCIENCE_ARTIFACT_NAME,
    description: 'Built-in Science Mode artifact graph, provenance, versioning, and report panel bridge.',
    enabled: false,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_SCIENCE_ARTIFACT_NAME]: serverConfig } }, null, 2),
  };
}

function buildBuiltinLabSkillServer(): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-lab-skill');
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env: {},
  };

  return {
    name: BUILTIN_LAB_SKILL_NAME,
    description: 'Built-in Lab Skill deposition bridge for SOP, protocol, evidence-ledger, and skill draft reports.',
    enabled: false,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env: {},
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_LAB_SKILL_NAME]: serverConfig } }, null, 2),
  };
}

function buildBuiltinUserInputServer(env: Record<string, string>): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-user-input');
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_USER_INPUT_NAME,
    description: 'Built-in structured user input bridge for Agent clarification questions.',
    enabled: true,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_USER_INPUT_NAME]: serverConfig } }, null, 2),
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
  const leftKeys = Object.keys(leftValue).toSorted();
  const rightKeys = Object.keys(rightValue).toSorted();
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
  const [
    backendPrefs,
    fileImageConfig,
    fileMedicalEvidenceConfig,
    fileResearchEvidenceConfig,
    fileScienceArtifactConfig,
    providers,
  ] = await Promise.all([
    fetchBackendClientPreferences(),
    configFile.get('tools.imageGenerationModel').catch((): undefined => undefined),
    configFile.get('tools.medicalEvidence').catch((): undefined => undefined),
    configFile.get('tools.researchEvidence').catch((): undefined => undefined),
    configFile.get('tools.scienceArtifact').catch((): undefined => undefined),
    fetchProviders(),
  ]);
  const imageConfig = resolveImageGenerationMigrationConfig(backendPrefs, fileImageConfig);
  const imageConfigSource = resolveImageGenerationMigrationConfigSource(backendPrefs, fileImageConfig);
  const medicalEvidenceConfig = resolveMedicalEvidenceMigrationConfig(backendPrefs, fileMedicalEvidenceConfig);
  const medicalEvidenceConfigSource = resolveMedicalEvidenceMigrationConfigSource(
    backendPrefs,
    fileMedicalEvidenceConfig
  );
  const researchEvidenceConfig = resolveResearchEvidenceMigrationConfig(
    backendPrefs,
    fileResearchEvidenceConfig,
    medicalEvidenceConfig
  );
  const researchEvidenceConfigSource = resolveResearchEvidenceMigrationConfigSource(
    backendPrefs,
    fileResearchEvidenceConfig,
    medicalEvidenceConfig
  );
  const scienceArtifactConfig = resolveScienceArtifactMigrationConfig(backendPrefs, fileScienceArtifactConfig);
  const scienceArtifactConfigSource = resolveScienceArtifactMigrationConfigSource(
    backendPrefs,
    fileScienceArtifactConfig
  );
  const existing = await mcpService.listServers.invoke();
  const existingByName = new Map((existing ?? []).map((server) => [server.name, server]));
  const existingImageServer = findExistingBuiltinServer(existingByName, BUILTIN_IMAGE_GEN_NAME);
  const existingMedicalEvidenceServer = findExistingBuiltinServer(existingByName, BUILTIN_MEDICAL_EVIDENCE_NAME);
  const existingResearchEvidenceServer = findExistingBuiltinServer(existingByName, BUILTIN_RESEARCH_EVIDENCE_NAME);
  const existingScienceArtifactServer = findExistingBuiltinServer(existingByName, BUILTIN_SCIENCE_ARTIFACT_NAME);
  const existingLabSkillServer = findExistingBuiltinServer(existingByName, BUILTIN_LAB_SKILL_NAME);
  const existingImageEnv =
    existingImageServer?.transport.type === 'stdio' ? existingImageServer.transport.env : undefined;
  const existingMedicalEvidenceEnv =
    existingMedicalEvidenceServer?.transport.type === 'stdio' ? existingMedicalEvidenceServer.transport.env : undefined;
  const existingResearchEvidenceEnv =
    existingResearchEvidenceServer?.transport.type === 'stdio'
      ? existingResearchEvidenceServer.transport.env
      : undefined;
  const existingScienceArtifactEnv =
    existingScienceArtifactServer?.transport.type === 'stdio' ? existingScienceArtifactServer.transport.env : undefined;
  const imageEnvResolution = resolveImageGenerationMcpEnv(imageConfig, providers, existingImageEnv);
  const medicalEvidenceEnvResolution = resolveMedicalEvidenceMcpEnv(
    medicalEvidenceConfig,
    existingMedicalEvidenceEnv,
    researchEvidenceConfig
  );
  const researchEvidenceEnvResolution = resolveResearchEvidenceMcpEnv(
    researchEvidenceConfig,
    existingResearchEvidenceEnv,
    medicalEvidenceConfig
  );
  const scienceArtifactEnvResolution = resolveScienceArtifactMcpEnv(scienceArtifactConfig, existingScienceArtifactEnv);
  logImageGenerationEnvResolution(imageEnvResolution, 'bootstrap');
  logMedicalEvidenceEnvResolution(medicalEvidenceEnvResolution, 'bootstrap');
  logResearchEvidenceEnvResolution(researchEvidenceEnvResolution, 'bootstrap');
  logScienceArtifactEnvResolution(scienceArtifactEnvResolution, 'bootstrap');
  const imageServer = buildBuiltinImageGenerationServer(imageEnvResolution, imageConfig);
  const medicalEvidenceServer = buildBuiltinMedicalEvidenceServer(medicalEvidenceEnvResolution);
  const researchEvidenceServer = buildBuiltinResearchEvidenceServer(researchEvidenceEnvResolution);
  const scienceArtifactServer = buildBuiltinScienceArtifactServer(scienceArtifactEnvResolution);
  const labSkillServer = buildBuiltinLabSkillServer();
  const larkProjectAgentServer = buildBuiltinLarkProjectAgentServer();
  await startUserInputGateway();
  const userInputServer = buildBuiltinUserInputServer(getUserInputGatewayEnv());
  const defaultServers = [...buildDefaultMcpServers(), larkProjectAgentServer];
  const missing = [
    ...defaultServers,
    imageServer,
    medicalEvidenceServer,
    researchEvidenceServer,
    scienceArtifactServer,
    labSkillServer,
    userInputServer,
  ].filter((server) => !hasExistingBuiltinServer(existingByName, server.name));
  let imageServerUpdated = false;
  let medicalEvidenceServerUpdated = false;
  let researchEvidenceServerUpdated = false;
  let scienceArtifactServerUpdated = false;
  let labSkillServerUpdated = false;
  let userInputServerUpdated = false;

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

  if (
    existingImageServer?.name === BUILTIN_IMAGE_GEN_NAME &&
    (existingImageServer.name !== BUILTIN_IMAGE_GEN_NAME ||
      existingImageServer.builtin !== true ||
      !existingImageServer.original_json ||
      existingImageServer.original_json.trim() === '' ||
      existingImageServer.original_json.trim() === '{}')
  ) {
    await mcpService.updateServer.invoke({
      id: existingImageServer.id,
      data: {
        name: BUILTIN_IMAGE_GEN_NAME,
        builtin: true,
        original_json: buildOriginalJsonFromTransport({
          ...existingImageServer,
          name: BUILTIN_IMAGE_GEN_NAME,
        }),
      },
    });
    imageServerUpdated = true;
  }

  const existingLarkProjectAgentServer = findExistingBuiltinServer(existingByName, BUILTIN_LARK_PROJECT_AGENT_NAME);
  if (
    existingLarkProjectAgentServer?.name === BUILTIN_LARK_PROJECT_AGENT_NAME &&
    (existingLarkProjectAgentServer.name !== BUILTIN_LARK_PROJECT_AGENT_NAME ||
      existingLarkProjectAgentServer.builtin !== true ||
      !existingLarkProjectAgentServer.original_json ||
      existingLarkProjectAgentServer.original_json.trim() === '' ||
      existingLarkProjectAgentServer.original_json.trim() === '{}' ||
      existingLarkProjectAgentServer.original_json !== larkProjectAgentServer.original_json ||
      !isSameStdioTransport(existingLarkProjectAgentServer.transport, larkProjectAgentServer.transport))
  ) {
    await mcpService.updateServer.invoke({
      id: existingLarkProjectAgentServer.id,
      data: {
        name: BUILTIN_LARK_PROJECT_AGENT_NAME,
        builtin: true,
        transport: larkProjectAgentServer.transport,
        original_json: larkProjectAgentServer.original_json,
      },
    });
  }

  const existingUserInputServer = findExistingBuiltinServer(existingByName, BUILTIN_USER_INPUT_NAME);
  if (
    existingUserInputServer?.name === BUILTIN_USER_INPUT_NAME &&
    (existingUserInputServer.name !== BUILTIN_USER_INPUT_NAME ||
      existingUserInputServer.builtin !== true ||
      !existingUserInputServer.original_json ||
      existingUserInputServer.original_json.trim() === '' ||
      existingUserInputServer.original_json.trim() === '{}' ||
      existingUserInputServer.original_json !== userInputServer.original_json ||
      !isSameStdioTransport(existingUserInputServer.transport, userInputServer.transport))
  ) {
    await mcpService.updateServer.invoke({
      id: existingUserInputServer.id,
      data: {
        name: BUILTIN_USER_INPUT_NAME,
        builtin: true,
        transport: userInputServer.transport,
        original_json: userInputServer.original_json,
      },
    });
    userInputServerUpdated = true;
  }

  if (
    existingMedicalEvidenceServer?.name === BUILTIN_MEDICAL_EVIDENCE_NAME &&
    (existingMedicalEvidenceServer.name !== BUILTIN_MEDICAL_EVIDENCE_NAME ||
      existingMedicalEvidenceServer.builtin !== true ||
      !existingMedicalEvidenceServer.original_json ||
      existingMedicalEvidenceServer.original_json.trim() === '' ||
      existingMedicalEvidenceServer.original_json.trim() === '{}' ||
      !isSameStdioTransport(existingMedicalEvidenceServer.transport, medicalEvidenceServer.transport))
  ) {
    await mcpService.updateServer.invoke({
      id: existingMedicalEvidenceServer.id,
      data: {
        name: BUILTIN_MEDICAL_EVIDENCE_NAME,
        builtin: true,
        transport: medicalEvidenceServer.transport,
        original_json: medicalEvidenceServer.original_json,
      },
    });
    medicalEvidenceServerUpdated = true;
  }

  if (
    existingResearchEvidenceServer?.name === BUILTIN_RESEARCH_EVIDENCE_NAME &&
    (existingResearchEvidenceServer.name !== BUILTIN_RESEARCH_EVIDENCE_NAME ||
      existingResearchEvidenceServer.builtin !== true ||
      !existingResearchEvidenceServer.original_json ||
      existingResearchEvidenceServer.original_json.trim() === '' ||
      existingResearchEvidenceServer.original_json.trim() === '{}' ||
      !isSameStdioTransport(existingResearchEvidenceServer.transport, researchEvidenceServer.transport))
  ) {
    await mcpService.updateServer.invoke({
      id: existingResearchEvidenceServer.id,
      data: {
        name: BUILTIN_RESEARCH_EVIDENCE_NAME,
        builtin: true,
        transport: researchEvidenceServer.transport,
        original_json: researchEvidenceServer.original_json,
      },
    });
    researchEvidenceServerUpdated = true;
  }

  if (
    existingScienceArtifactServer?.name === BUILTIN_SCIENCE_ARTIFACT_NAME &&
    (existingScienceArtifactServer.name !== BUILTIN_SCIENCE_ARTIFACT_NAME ||
      existingScienceArtifactServer.builtin !== true ||
      !existingScienceArtifactServer.original_json ||
      existingScienceArtifactServer.original_json.trim() === '' ||
      existingScienceArtifactServer.original_json.trim() === '{}' ||
      !isSameStdioTransport(existingScienceArtifactServer.transport, scienceArtifactServer.transport))
  ) {
    await mcpService.updateServer.invoke({
      id: existingScienceArtifactServer.id,
      data: {
        name: BUILTIN_SCIENCE_ARTIFACT_NAME,
        builtin: true,
        transport: scienceArtifactServer.transport,
        original_json: scienceArtifactServer.original_json,
      },
    });
    scienceArtifactServerUpdated = true;
  }

  if (
    existingLabSkillServer?.name === BUILTIN_LAB_SKILL_NAME &&
    (existingLabSkillServer.name !== BUILTIN_LAB_SKILL_NAME ||
      existingLabSkillServer.builtin !== true ||
      !existingLabSkillServer.original_json ||
      existingLabSkillServer.original_json.trim() === '' ||
      existingLabSkillServer.original_json.trim() === '{}' ||
      existingLabSkillServer.original_json !== labSkillServer.original_json ||
      !isSameStdioTransport(existingLabSkillServer.transport, labSkillServer.transport))
  ) {
    await mcpService.updateServer.invoke({
      id: existingLabSkillServer.id,
      data: {
        name: BUILTIN_LAB_SKILL_NAME,
        builtin: true,
        transport: labSkillServer.transport,
        original_json: labSkillServer.original_json,
      },
    });
    labSkillServerUpdated = true;
  }

  const refreshedServers = await mcpService.listServers.invoke();
  const chromeDevtoolsServer = refreshedServers.find((server) => server.name === BUILTIN_CHROME_DEVTOOLS_NAME);
  await ensureBuiltinChromeDevtoolsAvailability(chromeDevtoolsServer);

  if (
    imageEnvResolution.ok === true &&
    existingImageServer?.name === BUILTIN_IMAGE_GEN_NAME &&
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
          name: BUILTIN_IMAGE_GEN_NAME,
          transport: updatedTransport,
          original_json,
        },
      });
      imageServerUpdated = true;
    }
  } else if (existingImageServer?.name === BUILTIN_IMAGE_GEN_NAME && imageEnvResolution.ok === false) {
    console.warn(
      '[Migration] skipped image MCP env update because provider could not be resolved, server id: %s, reason: %s',
      existingImageServer.id,
      imageEnvResolution.reason
    );
  }

  if (
    existingMedicalEvidenceServer?.name === BUILTIN_MEDICAL_EVIDENCE_NAME &&
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
          name: BUILTIN_MEDICAL_EVIDENCE_NAME,
          transport: updatedTransport,
          original_json,
        },
      });
      medicalEvidenceServerUpdated = true;
    }
  }

  if (
    existingResearchEvidenceServer?.name === BUILTIN_RESEARCH_EVIDENCE_NAME &&
    existingResearchEvidenceServer.transport.type === 'stdio' &&
    researchEvidenceServer.transport.type === 'stdio'
  ) {
    const mergedEnv = {
      ...removeResearchEvidenceEnvKeys(existingResearchEvidenceServer.transport.env || {}),
      ...researchEvidenceEnvResolution.env,
    };
    const updatedTransport = {
      ...researchEvidenceServer.transport,
      env: mergedEnv,
    };
    const original_json = JSON.stringify(
      {
        mcpServers: {
          [BUILTIN_RESEARCH_EVIDENCE_NAME]: {
            command: updatedTransport.command,
            args: updatedTransport.args || [],
            env: mergedEnv,
          },
        },
      },
      null,
      2
    );
    const researchTransportChanged = !isSameStdioTransport(existingResearchEvidenceServer.transport, updatedTransport);
    const researchOriginalJsonChanged = existingResearchEvidenceServer.original_json !== original_json;
    const researchServerChanged = researchTransportChanged || researchOriginalJsonChanged;
    console.info(
      '[Migration] research evidence MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      existingResearchEvidenceServer.id,
      researchTransportChanged ? 'yes' : 'no',
      researchOriginalJsonChanged ? 'yes' : 'no',
      researchServerChanged ? 'yes' : 'no'
    );
    if (researchServerChanged) {
      await mcpService.updateServer.invoke({
        id: existingResearchEvidenceServer.id,
        data: {
          name: BUILTIN_RESEARCH_EVIDENCE_NAME,
          transport: updatedTransport,
          original_json,
        },
      });
      researchEvidenceServerUpdated = true;
    }
  }

  if (
    existingScienceArtifactServer?.name === BUILTIN_SCIENCE_ARTIFACT_NAME &&
    existingScienceArtifactServer.transport.type === 'stdio' &&
    scienceArtifactServer.transport.type === 'stdio'
  ) {
    const mergedEnv = {
      ...removeScienceArtifactEnvKeys(existingScienceArtifactServer.transport.env || {}),
      ...scienceArtifactEnvResolution.env,
    };
    const updatedTransport = {
      ...scienceArtifactServer.transport,
      env: mergedEnv,
    };
    const original_json = JSON.stringify(
      {
        mcpServers: {
          [BUILTIN_SCIENCE_ARTIFACT_NAME]: {
            command: updatedTransport.command,
            args: updatedTransport.args || [],
            env: mergedEnv,
          },
        },
      },
      null,
      2
    );
    const scienceTransportChanged = !isSameStdioTransport(existingScienceArtifactServer.transport, updatedTransport);
    const scienceOriginalJsonChanged = existingScienceArtifactServer.original_json !== original_json;
    const scienceServerChanged = scienceTransportChanged || scienceOriginalJsonChanged;
    console.info(
      '[Migration] science artifact MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      existingScienceArtifactServer.id,
      scienceTransportChanged ? 'yes' : 'no',
      scienceOriginalJsonChanged ? 'yes' : 'no',
      scienceServerChanged ? 'yes' : 'no'
    );
    if (scienceServerChanged) {
      await mcpService.updateServer.invoke({
        id: existingScienceArtifactServer.id,
        data: {
          name: BUILTIN_SCIENCE_ARTIFACT_NAME,
          transport: updatedTransport,
          original_json,
        },
      });
      scienceArtifactServerUpdated = true;
    }
  }

  if (imageConfig?.switch === true) {
    const { switch: _switch, ...rest } = imageConfig;
    await configFile.set('tools.imageGenerationModel', rest as ConfigKeyMap['tools.imageGenerationModel']);
  }

  console.info(
    '[Migration] MCP bootstrap completed, imported %d missing defaults, updated image server: %s, updated medical evidence server: %s, updated research evidence server: %s, updated science artifact server: %s, updated lab skill server: %s, updated user input server: %s, image config source: %s, medical evidence config source: %s, research evidence config source: %s, science artifact config source: %s, image enabled: %s',
    missing.length,
    imageServerUpdated ? 'yes' : 'no',
    medicalEvidenceServerUpdated ? 'yes' : 'no',
    researchEvidenceServerUpdated ? 'yes' : 'no',
    scienceArtifactServerUpdated ? 'yes' : 'no',
    labSkillServerUpdated ? 'yes' : 'no',
    userInputServerUpdated ? 'yes' : 'no',
    imageConfigSource,
    medicalEvidenceConfigSource,
    researchEvidenceConfigSource,
    scienceArtifactConfigSource,
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
