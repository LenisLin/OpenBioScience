/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_LOCAL_RUNTIME_ID, LEGACY_LOCAL_RUNTIME_NAME } from '@/common/config/legacyIdentifiers';
import { LOOP_GOAL_SKILL_NAME } from '@/common/chat/loopGoal';
import { DEFAULT_SCIENCE_SKILL_IDS } from '@/common/chat/science';
import {
  BUILTIN_BIO_ANALYSIS_NAME,
  BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME,
  BUILTIN_BIO_REPRODUCTION_NAME,
  BUILTIN_BIO_RUNTIME_NAME,
  BUILTIN_BIO_SOURCE_NAME,
  BUILTIN_BIO_STATISTICS_NAME,
  BUILTIN_RESEARCH_EVIDENCE_NAME,
  BUILTIN_SCIENCE_ARTIFACT_NAME,
  BUILTIN_USER_INPUT_NAME,
  type IMcpServer,
} from '@/common/config/storage';
import { useGuidSend, type GuidSendDeps } from '@/renderer/pages/guid/hooks/useGuidSend';

const createConversationInvokeMock = vi.fn();
const swrMutateMock = vi.fn();
const ensureBackendMcpCatalogMock = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: {
        invoke: (...args: unknown[]) => createConversationInvokeMock(...args),
      },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('swr', () => ({
  mutate: (...args: unknown[]) => swrMutateMock(...args),
}));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({
  updateWorkspaceTime: vi.fn(),
}));

vi.mock('@/renderer/hooks/mcp/catalog', () => ({
  ensureBackendMcpCatalog: (...args: unknown[]) => ensureBackendMcpCatalogMock(...args),
  toSessionMcpServer: (server: IMcpServer) => ({
    id: server.id,
    name: server.name,
    transport: server.transport ?? { type: 'stdio', command: 'node', args: [] },
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const createDeps = (): GuidSendDeps => ({
  input: 'hello',
  setInput: vi.fn(),
  files: [],
  setFiles: vi.fn(),
  dir: '/workspace/project',
  setDir: vi.fn(),
  setLoading: vi.fn(),
  loading: false,
  selectedAgent: 'claude',
  selectedAgentKey: 'preset-claude',
  selectedAgentInfo: {
    id: 'meta-1',
    key: 'preset-claude',
    name: 'Claude',
    agent_type: 'claude',
    backend: 'claude',
    custom_agent_id: 'assistant-1',
    is_preset: true,
    isExtension: false,
  } as never,
  is_presetAgent: true,
  selectedMode: 'bypassPermissions',
  selectedAcpModel: 'claude-opus',
  currentAcpCachedModelInfo: null,
  current_model: undefined,
  findAgentByKey: vi.fn(),
  getEffectiveAgentType: vi.fn(() => ({
    agent_type: 'claude',
    isAvailable: true,
  })),
  resolveEnabledSkills: vi.fn(() => ['skill-a']),
  resolveDisabledBuiltinSkills: vi.fn(() => ['skill-b']),
  guidDisabledBuiltinSkills: undefined,
  guidEnabledSkills: undefined,
  assistantDefaultSkillIds: undefined,
  assistantDefaultDisabledBuiltinSkillIds: undefined,
  availableMcpServers: [
    { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer,
    {
      id: 'mcp-research',
      name: BUILTIN_RESEARCH_EVIDENCE_NAME,
      enabled: false,
      builtin: true,
      transport: { type: 'stdio', command: 'node', args: ['research.js'] },
    } as IMcpServer,
    {
      id: 'mcp-science',
      name: BUILTIN_SCIENCE_ARTIFACT_NAME,
      enabled: false,
      builtin: true,
      transport: { type: 'stdio', command: 'node', args: ['science.js'] },
    } as IMcpServer,
    {
      id: 'mcp-user-input',
      name: BUILTIN_USER_INPUT_NAME,
      enabled: false,
      builtin: true,
      transport: { type: 'stdio', command: 'node', args: ['user-input.js'] },
    } as IMcpServer,
    {
      id: 'mcp-bio-runtime',
      name: BUILTIN_BIO_RUNTIME_NAME,
      enabled: false,
      builtin: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['builtin-mcp-bio.js'],
        env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime' },
      },
    } as IMcpServer,
    {
      id: 'mcp-bio-source',
      name: BUILTIN_BIO_SOURCE_NAME,
      enabled: false,
      builtin: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['builtin-mcp-bio.js'],
        env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'source' },
      },
    } as IMcpServer,
    {
      id: 'mcp-bio-reproduction',
      name: BUILTIN_BIO_REPRODUCTION_NAME,
      enabled: false,
      builtin: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['builtin-mcp-bio.js'],
        env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'reproduction' },
      },
    } as IMcpServer,
    {
      id: 'mcp-bio-statistics',
      name: BUILTIN_BIO_STATISTICS_NAME,
      enabled: false,
      builtin: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['builtin-mcp-bio.js'],
        env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'statistics' },
      },
    } as IMcpServer,
    {
      id: 'mcp-bio-analysis',
      name: BUILTIN_BIO_ANALYSIS_NAME,
      enabled: false,
      builtin: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['builtin-mcp-bio.js'],
        env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'analysis' },
      },
    } as IMcpServer,
    {
      id: 'mcp-bio-environment-manager',
      name: BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME,
      enabled: false,
      builtin: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['builtin-mcp-bio.js'],
        env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'environment_manager' },
      },
    } as IMcpServer,
  ],
  selectedMcpServerIds: ['mcp-user'],
  assistantDefaultMcpIds: undefined,
  currentEffectiveAgentInfo: {
    agent_type: 'claude',
    isAvailable: true,
  } as never,
  isGoogleAuth: false,
  setMentionOpen: vi.fn(),
  setMentionQuery: vi.fn(),
  setMentionSelectorOpen: vi.fn(),
  setMentionActiveIndex: vi.fn(),
  navigate: vi.fn(() => Promise.resolve()) as never,
  t: vi.fn((key: string, options?: { defaultValue?: string }) => options?.defaultValue || key) as never,
  localeKey: 'zh-CN',
});

describe('useGuidSend', () => {
  beforeEach(() => {
    createConversationInvokeMock.mockReset();
    createConversationInvokeMock.mockResolvedValue({ id: 'conv-1' });
    swrMutateMock.mockReset();
    swrMutateMock.mockResolvedValue(undefined);
    ensureBackendMcpCatalogMock.mockReset();
    ensureBackendMcpCatalogMock.mockResolvedValue({ allServers: [] });
    sessionStorage.clear();
  });

  it('passes selected mode into assistant conversation overrides when creating a preset ACP conversation', async () => {
    const { result } = renderHook(() => useGuidSend(createDeps()));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.permission).toBe('bypassPermissions');
    expect(payload.assistant?.conversation_overrides?.model).toBe('claude-opus');
    expect(payload.extra.selected_session_mcp_servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: BUILTIN_BIO_RUNTIME_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_SOURCE_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_REPRODUCTION_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_ANALYSIS_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_STATISTICS_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME }),
      ])
    );
    expect(payload.extra.auto_mcp_sources).toEqual(
      expect.objectContaining({
        [BUILTIN_BIO_RUNTIME_NAME]: expect.arrayContaining([
          'bio-omics-reproduction-planning',
          'bio-omics-analysis',
          'bio-environment-manager',
          'bio-analysis-script-authoring',
          'bio-scrna-differential-expression',
        ]),
        [BUILTIN_BIO_ANALYSIS_NAME]: ['bio-omics-analysis'],
        [BUILTIN_BIO_REPRODUCTION_NAME]: ['bio-omics-reproduction-planning'],
        [BUILTIN_BIO_STATISTICS_NAME]: expect.arrayContaining([
          'bio-omics-reproduction-planning',
          'bio-scrna-differential-expression',
        ]),
        [BUILTIN_BIO_SOURCE_NAME]: ['bio-omics-analysis', 'bio-omics-reproduction-planning'],
        [BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME]: ['bio-environment-manager'],
      })
    );
    expect(payload.extra.auto_mcp_sources[BUILTIN_BIO_RUNTIME_NAME]).toHaveLength(5);
    expect(payload.extra.auto_mcp_sources[BUILTIN_BIO_RUNTIME_NAME]).toEqual(
      expect.arrayContaining([
        'bio-omics-reproduction-planning',
        'bio-omics-analysis',
        'bio-environment-manager',
        'bio-analysis-script-authoring',
        'bio-scrna-differential-expression',
      ])
    );
    const scienceArtifactServer = payload.extra.selected_session_mcp_servers.find(
      (server: { name?: string }) => server.name === BUILTIN_SCIENCE_ARTIFACT_NAME
    );
    expect(scienceArtifactServer.transport.env).toEqual(
      expect.objectContaining({
        OPENSCIENCE_WORKSPACE_ROOT: '/workspace/project',
        OPENSCIENCE_SESSION_ID: expect.stringMatching(/^science_/u),
      })
    );
    const bioRuntimeServer = payload.extra.selected_session_mcp_servers.find(
      (server: { name?: string }) => server.name === BUILTIN_BIO_RUNTIME_NAME
    );
    expect(bioRuntimeServer.transport.env).toEqual(
      expect.objectContaining({
        OPENBIOSCIENCE_WORKSPACE_ROOT: '/workspace/project',
        OPENSCIENCE_WORKSPACE_ROOT: '/workspace/project',
      })
    );
    expect(swrMutateMock).toHaveBeenCalledWith('guid.assistant.detail.assistant-1.zh-CN');
    expect(swrMutateMock).toHaveBeenCalledWith('assistants.list');
  });

  it('blocks Science conversation creation until a workspace is selected', async () => {
    const deps = createDeps();
    deps.dir = '';
    const { result } = renderHook(() => useGuidSend(deps));

    await expect(result.current.handleSend()).rejects.toThrow('Science Mode requires an OpenScience workspace.');
    expect(createConversationInvokeMock).not.toHaveBeenCalled();
  });

  it('falls back to assistant default skill and MCP ids for preset conversations before local Guid overrides exist', async () => {
    const deps = createDeps();
    deps.guidEnabledSkills = undefined;
    deps.guidDisabledBuiltinSkills = undefined;
    deps.assistantDefaultSkillIds = ['assistant-skill'];
    deps.assistantDefaultDisabledBuiltinSkillIds = ['builtin-skill'];
    deps.selectedMcpServerIds = undefined;
    deps.assistantDefaultMcpIds = ['mcp-user'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.skill_ids).toEqual([
      'assistant-skill',
      ...DEFAULT_SCIENCE_SKILL_IDS,
    ]);
    expect(payload.assistant?.conversation_overrides?.disabled_builtin_skill_ids).toEqual(['builtin-skill']);
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user']);
    expect(payload.extra.selected_mcp_server_ids).toEqual(['mcp-user']);
  });

  it('preserves builtin MCP ids in assistant overrides while only sending user MCP ids to runtime selection', async () => {
    const deps = createDeps();
    deps.availableMcpServers = [
      { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer,
      { id: 'builtin-mcp', name: 'Builtin MCP', enabled: true, builtin: true } as IMcpServer,
      ...createDeps().availableMcpServers.filter((server) => server.id !== 'mcp-user'),
    ];
    deps.selectedMcpServerIds = ['mcp-user', 'builtin-mcp'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user', 'builtin-mcp']);
    expect(payload.extra.selected_mcp_server_ids).toEqual(['mcp-user']);
    expect(payload.extra.selected_session_mcp_servers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'builtin-mcp' })])
    );
    expect(payload.extra.mcp_server_ids).toEqual(['mcp-user']);
    expect(payload.extra.session_mcp_servers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'builtin-mcp' })])
    );
    expect(payload.extra.mcp_statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mcp-user', name: 'User MCP', status: 'loaded' }),
        expect.objectContaining({ id: 'builtin-mcp', name: 'Builtin MCP', status: 'loaded' }),
      ])
    );
  });

  it('forwards local skill overrides for non-preset CLI agents through conversation extra', async () => {
    const deps = createDeps();
    deps.selectedAgent = 'claude';
    deps.selectedAgentKey = 'claude';
    deps.selectedAgentInfo = {
      id: 'meta-claude',
      key: 'claude',
      name: 'Claude',
      agent_type: 'claude',
      backend: 'claude',
      is_preset: false,
      isExtension: false,
      cli_path: '/usr/local/bin/claude',
    } as never;
    deps.is_presetAgent = false;
    deps.current_model = { provider_id: 'anthropic', model: 'claude-sonnet', use_model: 'claude-sonnet' } as never;
    deps.guidEnabledSkills = ['pdf-reader'];
    deps.guidDisabledBuiltinSkills = ['todo-tracker'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant).toBeUndefined();
    expect(payload.extra.enabled_skills).toEqual(['pdf-reader', ...DEFAULT_SCIENCE_SKILL_IDS]);
    expect(payload.extra.exclude_builtin_skills).toEqual(['todo-tracker']);
  });

  it('coerces deprecated local runtime selections to Codex ACP while preserving local skill overrides', async () => {
    const deps = createDeps();
    deps.selectedAgent = LEGACY_LOCAL_RUNTIME_ID;
    deps.selectedAgentKey = LEGACY_LOCAL_RUNTIME_ID;
    deps.selectedAgentInfo = {
      id: 'meta-local-runtime',
      key: LEGACY_LOCAL_RUNTIME_ID,
      name: LEGACY_LOCAL_RUNTIME_NAME,
      agent_type: LEGACY_LOCAL_RUNTIME_ID,
      backend: LEGACY_LOCAL_RUNTIME_ID,
      is_preset: false,
      isExtension: false,
    } as never;
    deps.is_presetAgent = false;
    deps.current_model = { provider_id: 'openai', model: 'gemini-2.5-pro', use_model: 'gemini-2.5-pro' } as never;
    deps.guidEnabledSkills = ['pdf-reader'];
    deps.guidDisabledBuiltinSkills = ['todo-tracker'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.type).toBe('acp');
    expect(payload.assistant).toBeUndefined();
    expect(payload.extra.backend).toBe('codex');
    expect(payload.extra.enabled_skills).toEqual(['pdf-reader', ...DEFAULT_SCIENCE_SKILL_IDS]);
    expect(payload.extra.exclude_builtin_skills).toEqual(['todo-tracker']);
  });

  it('creates a loop goal conversation and stores the kickoff message', async () => {
    const deps = createDeps();
    deps.input = 'please prioritize verification';
    deps.loopGoal = {
      id: 'loop-1',
      goal: 'Keep improving the test suite until the risky edge cases are covered.',
      status: 'active',
      created_at: 1,
      updated_at: 1,
      started_at: 1,
      last_resumed_at: 1,
      accumulated_active_ms: 0,
      iteration_count: 0,
      options: { continue_when_idle: true },
    };

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.name).toContain('Keep improving the test suite');
    expect(payload.extra.loop_goal).toEqual(expect.objectContaining({ id: 'loop-1', status: 'active' }));

    const storedInitialMessage = sessionStorage.getItem('acp_initial_message_conv-1');
    expect(storedInitialMessage).toBeTruthy();
    const initialMessage = JSON.parse(storedInitialMessage || '{}');
    expect(initialMessage.input).toContain('# Loop Goal Mode');
    expect(initialMessage.input).toContain('Additional user instruction for this first iteration');
    expect(initialMessage.input).toContain('please prioritize verification');
    expect(result.current.isButtonDisabled).toBe(false);
  });

  it('creates a loop goal from the first input when goal mode is enabled', async () => {
    const deps = createDeps();
    deps.input = 'Iterate on the onboarding flow until it feels smooth and verified.';
    deps.loopGoal = undefined;
    deps.isLoopGoalMode = true;

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.name).toContain('Iterate on the onboarding flow');
    expect(payload.extra.loop_goal).toEqual(
      expect.objectContaining({
        goal: 'Iterate on the onboarding flow until it feels smooth and verified.',
        status: 'active',
      })
    );

    const storedInitialMessage = sessionStorage.getItem('acp_initial_message_conv-1');
    expect(storedInitialMessage).toBeTruthy();
    const initialMessage = JSON.parse(storedInitialMessage || '{}');
    expect(initialMessage.input).toContain('# Loop Goal Mode');
    expect(initialMessage.input).toContain('User goal:');
    expect(initialMessage.input).toContain('Iterate on the onboarding flow until it feels smooth and verified.');
    expect(initialMessage.input).not.toContain('Additional user instruction for this first iteration');
    expect(result.current.isButtonDisabled).toBe(false);
  });

  it('loads Loop Goal by default for loop goal mode even when Science mode is off', async () => {
    const deps = createDeps();
    deps.input = 'Keep iterating until the refactor has tests and no regressions.';
    deps.isLoopGoalMode = true;
    deps.isScienceMode = false;
    deps.assistantDefaultSkillIds = ['assistant-skill'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.skill_ids).toEqual(['assistant-skill', LOOP_GOAL_SKILL_NAME]);
    expect(payload.extra.loop_goal).toEqual(expect.objectContaining({ status: 'active' }));
  });

  it('sends a manually selected OpenBioScience bio builtin MCP as a session server', async () => {
    const deps = createDeps();
    deps.availableMcpServers = [
      { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer,
      {
        id: 'mcp-bio-runtime-manual',
        name: BUILTIN_BIO_RUNTIME_NAME,
        enabled: false,
        builtin: true,
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['builtin-mcp-bio.js'],
          env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime' },
        },
      } as IMcpServer,
      ...createDeps().availableMcpServers.filter((server) => server.id !== 'mcp-user'),
    ];
    deps.selectedMcpServerIds = ['mcp-user', 'mcp-bio-runtime-manual'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.extra.selected_mcp_server_ids).toEqual(['mcp-user']);
    expect(payload.extra.selected_session_mcp_servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mcp-bio-runtime-manual', name: BUILTIN_BIO_RUNTIME_NAME }),
      ])
    );
    expect(payload.extra.session_mcp_servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mcp-bio-runtime-manual', name: BUILTIN_BIO_RUNTIME_NAME }),
      ])
    );
  });

  it('refreshes builtin MCP catalog before creating a Science conversation', async () => {
    const deps = createDeps();
    deps.availableMcpServers = [];
    deps.selectedMcpServerIds = undefined;
    ensureBackendMcpCatalogMock.mockResolvedValueOnce({
      allServers: [
        {
          id: 'mcp-research',
          name: BUILTIN_RESEARCH_EVIDENCE_NAME,
          enabled: false,
          builtin: true,
          transport: { type: 'stdio', command: 'node', args: ['research.js'] },
        },
        {
          id: 'mcp-science',
          name: BUILTIN_SCIENCE_ARTIFACT_NAME,
          enabled: false,
          builtin: true,
          transport: { type: 'stdio', command: 'node', args: ['science.js'] },
        },
        {
          id: 'mcp-user-input',
          name: BUILTIN_USER_INPUT_NAME,
          enabled: true,
          builtin: true,
          transport: { type: 'stdio', command: 'node', args: ['user-input.js'] },
        },
        {
          id: 'mcp-bio-runtime',
          name: BUILTIN_BIO_RUNTIME_NAME,
          enabled: false,
          builtin: true,
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['builtin-mcp-bio.js'],
            env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'runtime' },
          },
        },
        {
          id: 'mcp-bio-source',
          name: BUILTIN_BIO_SOURCE_NAME,
          enabled: false,
          builtin: true,
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['builtin-mcp-bio.js'],
            env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'source' },
          },
        },
        {
          id: 'mcp-bio-reproduction',
          name: BUILTIN_BIO_REPRODUCTION_NAME,
          enabled: false,
          builtin: true,
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['builtin-mcp-bio.js'],
            env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'reproduction' },
          },
        },
        {
          id: 'mcp-bio-statistics',
          name: BUILTIN_BIO_STATISTICS_NAME,
          enabled: false,
          builtin: true,
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['builtin-mcp-bio.js'],
            env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'statistics' },
          },
        },
        {
          id: 'mcp-bio-analysis',
          name: BUILTIN_BIO_ANALYSIS_NAME,
          enabled: false,
          builtin: true,
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['builtin-mcp-bio.js'],
            env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'analysis' },
          },
        },
        {
          id: 'mcp-bio-environment-manager',
          name: BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME,
          enabled: false,
          builtin: true,
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['builtin-mcp-bio.js'],
            env: { OPENBIOSCIENCE_BIO_MCP_PROFILE: 'environment_manager' },
          },
        },
      ],
    });

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(ensureBackendMcpCatalogMock).toHaveBeenCalledTimes(1);
    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.extra.selected_session_mcp_servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: BUILTIN_RESEARCH_EVIDENCE_NAME }),
        expect.objectContaining({ name: BUILTIN_SCIENCE_ARTIFACT_NAME }),
        expect.objectContaining({ name: BUILTIN_USER_INPUT_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_RUNTIME_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_SOURCE_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_REPRODUCTION_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_ANALYSIS_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_STATISTICS_NAME }),
        expect.objectContaining({ name: BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME }),
      ])
    );
    expect(payload.extra.session_mcp_servers).toEqual(payload.extra.selected_session_mcp_servers);
    expect(payload.extra.mcp_servers).toEqual(
      expect.arrayContaining([
        BUILTIN_RESEARCH_EVIDENCE_NAME,
        BUILTIN_SCIENCE_ARTIFACT_NAME,
        BUILTIN_USER_INPUT_NAME,
        BUILTIN_BIO_RUNTIME_NAME,
        BUILTIN_BIO_SOURCE_NAME,
        BUILTIN_BIO_REPRODUCTION_NAME,
        BUILTIN_BIO_ANALYSIS_NAME,
        BUILTIN_BIO_ENVIRONMENT_MANAGER_NAME,
      ])
    );
    expect(payload.extra.mcp_statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mcp-research', name: BUILTIN_RESEARCH_EVIDENCE_NAME, status: 'loaded' }),
        expect.objectContaining({ id: 'mcp-science', name: BUILTIN_SCIENCE_ARTIFACT_NAME, status: 'loaded' }),
        expect.objectContaining({ id: 'mcp-user-input', name: BUILTIN_USER_INPUT_NAME, status: 'loaded' }),
      ])
    );
    const researchSession = payload.extra.selected_session_mcp_servers.find(
      (server: { name?: string }) => server.name === BUILTIN_RESEARCH_EVIDENCE_NAME
    );
    expect(researchSession?.transport?.env).toEqual(
      expect.objectContaining({
        PAPERCLIP_ENABLED: 'false',
        OPENSCIENCE_RESEARCH_EVIDENCE_PROVIDERS: 'bio_tools',
        OPENSCIENCE_BIO_TOOLS_ENABLED: 'true',
      })
    );
  });
});
