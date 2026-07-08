import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IMAGE_GEN_ENV_KEYS } from '@/common/config/imageGenerationMcpEnv';
import {
  BUILTIN_BIO_KNOWLEDGE_NAME,
  BUILTIN_BIO_PLOT_NAME,
  BUILTIN_BIO_RUNTIME_NAME,
  BUILTIN_BIO_RUNTIME_LEGACY_NAMES,
  BUILTIN_BIO_SOURCE_NAME,
  BUILTIN_IMAGE_GEN_NAME,
  type IMcpServer,
  type IProvider,
} from '@/common/config/storage';
import { resolveImageGenerationMigrationConfig, runBackendMigrations } from '@/process/utils/runBackendMigrations';

const {
  batchImportServersMock,
  configFileGetMock,
  configFileSetMock,
  httpRequestMock,
  listServersMock,
  testMcpConnectionMock,
  updateServerMock,
  syncCodexOpenScienceMcpConfigMock,
} = vi.hoisted(() => ({
  batchImportServersMock: vi.fn(),
  configFileGetMock: vi.fn(),
  configFileSetMock: vi.fn(),
  httpRequestMock: vi.fn(),
  listServersMock: vi.fn(),
  testMcpConnectionMock: vi.fn(),
  updateServerMock: vi.fn(),
  syncCodexOpenScienceMcpConfigMock: vi.fn(),
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: httpRequestMock,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    listServers: { invoke: listServersMock },
    batchImportServers: { invoke: batchImportServersMock },
    updateServer: { invoke: updateServerMock },
    testMcpConnection: { invoke: testMcpConnectionMock },
  },
}));

vi.mock('@/common/config/configMigration', () => ({
  migrateConfigStorage: vi.fn().mockResolvedValue(undefined),
  migrateLegacyMcpConfigToDb: vi.fn().mockResolvedValue(undefined),
  migrateProviders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/process/utils/initStorage', () => ({
  getBuiltinMcpScriptPath: (name: string) => `/mock/${name}.js`,
}));

vi.mock('@/process/utils/migrateAssistants', () => ({
  migrateAssistantsToBackend: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/process/bridge/userInputBridge', () => ({
  getUserInputGatewayEnv: () => ({ OPENSCIENCE_USER_INPUT_GATEWAY: 'mock' }),
  startUserInputGateway: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/process/utils/syncCodexOpenScienceMcpConfig', () => ({
  syncCodexOpenScienceMcpConfig: syncCodexOpenScienceMcpConfigMock,
}));

const provider: IProvider = {
  id: 'provider-1',
  platform: 'gemini',
  name: 'Gemini',
  base_url: 'https://generativelanguage.googleapis.com',
  api_key: 'provider-key',
  models: ['gemini-image'],
  enabled: true,
};

const imageEnv = {
  [IMAGE_GEN_ENV_KEYS.providerId]: 'provider-1',
  [IMAGE_GEN_ENV_KEYS.platform]: 'gemini',
  [IMAGE_GEN_ENV_KEYS.baseUrl]: 'https://generativelanguage.googleapis.com',
  [IMAGE_GEN_ENV_KEYS.apiKey]: 'provider-key',
  [IMAGE_GEN_ENV_KEYS.model]: 'gemini-image',
};

const imageServer = (): IMcpServer => ({
  id: 'image-server-id',
  name: BUILTIN_IMAGE_GEN_NAME,
  description: 'Built-in image generation tool powered by AI models. Configure the model in Settings > Tools.',
  enabled: true,
  builtin: true,
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['/mock/builtin-mcp-image-gen.js'],
    env: imageEnv,
  },
  created_at: 1,
  updated_at: 1,
  original_json: JSON.stringify(
    {
      mcpServers: {
        [BUILTIN_IMAGE_GEN_NAME]: {
          command: 'node',
          args: ['/mock/builtin-mcp-image-gen.js'],
          env: imageEnv,
        },
      },
    },
    null,
    2
  ),
});

const configFile = {
  get: configFileGetMock,
  set: configFileSetMock,
};

beforeEach(() => {
  vi.clearAllMocks();
  configFileGetMock.mockResolvedValue(undefined);
  configFileSetMock.mockResolvedValue(undefined);
  batchImportServersMock.mockResolvedValue([]);
  updateServerMock.mockImplementation(async ({ id, data }) => ({
    ...imageServer(),
    id,
    ...data,
  }));
  syncCodexOpenScienceMcpConfigMock.mockResolvedValue(false);
  testMcpConnectionMock.mockResolvedValue({ success: false, error: 'Command not found: npx' });
  httpRequestMock.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/api/settings/client') {
      return {
        'tools.imageGenerationModel': {
          id: 'provider-1',
          name: 'Gemini',
          platform: 'gemini',
          use_model: 'gemini-image',
        },
      };
    }
    if (method === 'GET' && path === '/api/providers') {
      return [provider];
    }
    return undefined;
  });
});

describe('resolveImageGenerationMigrationConfig', () => {
  it('uses backend client preference when local config file no longer has the image model', () => {
    const backendConfig = {
      id: 'gemini',
      name: 'Gemini',
      platform: 'gemini',
      base_url: 'https://example.test',
      api_key: 'backend-key',
      use_model: 'gemini-image',
    };

    expect(resolveImageGenerationMigrationConfig({ 'tools.imageGenerationModel': backendConfig }, undefined)).toEqual(
      backendConfig
    );
  });
});

describe('runBackendMigrations', () => {
  it('does not sync the built-in image MCP server when bootstrap makes no effective change', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    listServersMock.mockResolvedValue([imageServer()]);

    await runBackendMigrations(configFile as never);

    expect(updateServerMock).not.toHaveBeenCalled();
    expect(testMcpConnectionMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      '[Migration] image MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      'image-server-id',
      'no',
      'no',
      'no'
    );
  });

  it('does not sync agents when only the stored image MCP JSON representation differs', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    listServersMock.mockResolvedValue([
      {
        ...imageServer(),
        original_json: '{"legacy":true}',
      },
    ]);

    await runBackendMigrations(configFile as never);

    expect(updateServerMock).toHaveBeenCalledOnce();
    expect(testMcpConnectionMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      '[Migration] image MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      'image-server-id',
      'no',
      'yes',
      'yes'
    );
  });

  it('imports OpenBioScience bio MCP control-plane servers when they are missing', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    listServersMock.mockResolvedValue([imageServer()]);

    await runBackendMigrations(configFile as never);

    const importedServers = batchImportServersMock.mock.calls.flatMap((call) => call[0]?.servers ?? []);
    expect(importedServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: BUILTIN_BIO_RUNTIME_NAME,
          transport: expect.objectContaining({
            args: ['/mock/builtin-mcp-bio.js'],
            env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime' },
          }),
        }),
        expect.objectContaining({
          name: BUILTIN_BIO_SOURCE_NAME,
          transport: expect.objectContaining({
            args: ['/mock/builtin-mcp-bio.js'],
            env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'source' },
          }),
        }),
        expect.objectContaining({
          name: BUILTIN_BIO_KNOWLEDGE_NAME,
          transport: expect.objectContaining({
            args: ['/mock/builtin-mcp-bio.js'],
            env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'knowledge' },
          }),
        }),
        expect.objectContaining({
          name: BUILTIN_BIO_PLOT_NAME,
          transport: expect.objectContaining({
            args: ['/mock/builtin-mcp-bio.js'],
            env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'plot' },
          }),
        }),
      ])
    );
  });

  it('syncs OpenBioScience bio MCP control-plane servers into the Codex managed config', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    listServersMock.mockResolvedValue([imageServer()]);

    await runBackendMigrations(configFile as never);

    expect(syncCodexOpenScienceMcpConfigMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: BUILTIN_BIO_RUNTIME_NAME,
          command: 'node',
          args: ['/mock/builtin-mcp-bio.js'],
          env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime' },
        }),
        expect.objectContaining({
          name: BUILTIN_BIO_SOURCE_NAME,
          command: 'node',
          args: ['/mock/builtin-mcp-bio.js'],
          env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'source' },
        }),
        expect.objectContaining({
          name: BUILTIN_BIO_KNOWLEDGE_NAME,
          command: 'node',
          args: ['/mock/builtin-mcp-bio.js'],
          env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'knowledge' },
        }),
        expect.objectContaining({
          name: BUILTIN_BIO_PLOT_NAME,
          command: 'node',
          args: ['/mock/builtin-mcp-bio.js'],
          env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'plot' },
        }),
      ])
    );
  });

  it('updates an existing legacy-name bio MCP server instead of importing a duplicate', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const legacyRuntimeServer: IMcpServer = {
      id: 'legacy-bio-runtime-id',
      name: BUILTIN_BIO_RUNTIME_LEGACY_NAMES[0],
      description: 'Legacy bio runtime MCP server.',
      enabled: false,
      builtin: false,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['/mock/old-bio.js'],
        env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime' },
      },
      created_at: 1,
      updated_at: 1,
      original_json: '{}',
    };
    listServersMock.mockResolvedValue([imageServer(), legacyRuntimeServer]);

    await runBackendMigrations(configFile as never);

    const importedServers = batchImportServersMock.mock.calls.flatMap((call) => call[0]?.servers ?? []);
    expect(importedServers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: BUILTIN_BIO_RUNTIME_NAME })])
    );
    expect(updateServerMock).toHaveBeenCalledWith({
      id: 'legacy-bio-runtime-id',
      data: expect.objectContaining({
        name: BUILTIN_BIO_RUNTIME_NAME,
        builtin: true,
        transport: expect.objectContaining({
          args: ['/mock/builtin-mcp-bio.js'],
          env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime' },
        }),
      }),
    });
  });
});
