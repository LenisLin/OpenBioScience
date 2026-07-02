/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_LOCAL_RUNTIME_ID, LEGACY_LOCAL_RUNTIME_NAME } from '@/common/config/legacyIdentifiers';
import { DEFAULT_SCIENCE_SKILL_IDS } from '@/common/chat/science';
import type { IMcpServer } from '@/common/config/storage';
import { useGuidSend, type GuidSendDeps } from '@/renderer/pages/guid/hooks/useGuidSend';

const createConversationInvokeMock = vi.fn();
const swrMutateMock = vi.fn();

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
  dir: '',
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
  availableMcpServers: [{ id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer],
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
    expect(swrMutateMock).toHaveBeenCalledWith('guid.assistant.detail.assistant-1.zh-CN');
    expect(swrMutateMock).toHaveBeenCalledWith('assistants.list');
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
    ];
    deps.selectedMcpServerIds = ['mcp-user', 'builtin-mcp'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user', 'builtin-mcp']);
    expect(payload.extra.selected_mcp_server_ids).toEqual(['mcp-user']);
    expect(payload.extra.selected_session_mcp_servers).toEqual([expect.objectContaining({ id: 'builtin-mcp' })]);
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
});
