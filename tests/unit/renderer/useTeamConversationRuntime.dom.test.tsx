import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';
import type { TChatConversation } from '@/common/config/storage';
import { useTeamConversationRuntime } from '@/renderer/pages/conversation/hooks/useTeamConversationRuntime';

type Listener<T> = (event: T) => void;

function createEmitter<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    on: (listener: Listener<T>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (event: T) => {
      for (const listener of listeners) listener(event);
    },
  };
}

const bridgeMocks = vi.hoisted(() => {
  const runStartedEmitter = createEmitter<{
    team_id: string;
    team_run_id: string;
    target_slot_id: string;
    target_role: 'lead' | 'teammate';
    status: 'running';
    active_child_count: number;
    pending_wake_count: number;
    starting_child_count: number;
    slot_work?: Array<{
      slot_id: string;
      role: 'lead' | 'teammate';
      pending_wake_count: number;
      starting_child_count: number;
    }>;
  }>();
  const childTurnStartedEmitter = createEmitter<{
    team_id: string;
    team_run_id: string;
    slot_id: string;
    role: 'lead' | 'teammate';
    conversation_id: string;
    turn_id: string;
    status: 'running';
  }>();
  return {
    teamGetMock: vi.fn(),
    teamSendMessageMock: vi.fn(),
    teamSendMessageToAgentMock: vi.fn(),
    teamPauseSlotWorkMock: vi.fn(),
    listChangedEmitter: createEmitter<{ team_id: string }>(),
    agentStatusChangedEmitter: createEmitter<{ team_id: string }>(),
    runStartedEmitter,
    runUpdatedEmitter: createEmitter<Parameters<typeof runStartedEmitter.emit>[0]>(),
    runCompletedEmitter: createEmitter<Parameters<typeof runStartedEmitter.emit>[0]>(),
    runCancelledEmitter: createEmitter<Parameters<typeof runStartedEmitter.emit>[0]>(),
    runFailedEmitter: createEmitter<Parameters<typeof runStartedEmitter.emit>[0]>(),
    childTurnStartedEmitter,
    childTurnCompletedEmitter: createEmitter<Parameters<typeof childTurnStartedEmitter.emit>[0]>(),
    childTurnCancelledEmitter: createEmitter<Parameters<typeof childTurnStartedEmitter.emit>[0]>(),
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      get: { invoke: (...args: unknown[]) => bridgeMocks.teamGetMock(...args) },
      sendMessage: { invoke: (...args: unknown[]) => bridgeMocks.teamSendMessageMock(...args) },
      sendMessageToAgent: { invoke: (...args: unknown[]) => bridgeMocks.teamSendMessageToAgentMock(...args) },
      pauseSlotWork: { invoke: (...args: unknown[]) => bridgeMocks.teamPauseSlotWorkMock(...args) },
      listChanged: bridgeMocks.listChangedEmitter,
      agentStatusChanged: bridgeMocks.agentStatusChangedEmitter,
      runStarted: bridgeMocks.runStartedEmitter,
      runUpdated: bridgeMocks.runUpdatedEmitter,
      runCompleted: bridgeMocks.runCompletedEmitter,
      runCancelled: bridgeMocks.runCancelledEmitter,
      runFailed: bridgeMocks.runFailedEmitter,
      childTurnStarted: bridgeMocks.childTurnStartedEmitter,
      childTurnCompleted: bridgeMocks.childTurnCompletedEmitter,
      childTurnCancelled: bridgeMocks.childTurnCancelledEmitter,
    },
  },
}));

const baseTeam = {
  id: 'team-1',
  user_id: 'system_default_user',
  name: 'Project Team',
  workspace: '/tmp/team',
  workspace_mode: 'shared' as const,
  leader_agent_id: 'leader-slot',
  agents: [
    {
      slot_id: 'leader-slot',
      conversation_id: 'leader-conv',
      role: 'leader' as const,
      agent_type: LEGACY_LOCAL_RUNTIME_ID,
      agent_name: 'Leader',
      conversation_type: LEGACY_LOCAL_RUNTIME_ID,
      status: 'idle' as const,
    },
    {
      slot_id: 'worker-slot',
      conversation_id: 'worker-conv',
      role: 'teammate' as const,
      agent_type: LEGACY_LOCAL_RUNTIME_ID,
      agent_name: 'Worker',
      conversation_type: LEGACY_LOCAL_RUNTIME_ID,
      status: 'idle' as const,
    },
  ],
  created_at: 1,
  updated_at: 1,
};

function conversation(id: string, slotId: string): TChatConversation {
  return {
    id,
    type: LEGACY_LOCAL_RUNTIME_ID,
    name: id,
    created_at: 1,
    modified_at: 1,
    extra: {
      team_id: 'team-1',
      team_slot_id: slotId,
      workspace: '/tmp/team',
    },
  } as unknown as TChatConversation;
}

describe('useTeamConversationRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.teamGetMock.mockResolvedValue(baseTeam);
    bridgeMocks.teamSendMessageMock.mockResolvedValue({});
    bridgeMocks.teamSendMessageToAgentMock.mockResolvedValue({});
    bridgeMocks.teamPauseSlotWorkMock.mockResolvedValue(undefined);
  });

  it('sends leader messages through the team leader endpoint', async () => {
    const { result } = renderHook(() => useTeamConversationRuntime(conversation('leader-conv', 'leader-slot')));

    await waitFor(() => expect(result.current?.agent.slot_id).toBe('leader-slot'));

    await act(async () => {
      await result.current?.teamSendMessage({ input: 'continue the project', files: [] });
    });

    expect(bridgeMocks.teamSendMessageMock).toHaveBeenCalledWith({
      team_id: 'team-1',
      input: 'continue the project',
      files: [],
    });
    expect(bridgeMocks.teamSendMessageToAgentMock).not.toHaveBeenCalled();
  });

  it('sends teammate messages through the targeted teammate endpoint', async () => {
    const { result } = renderHook(() => useTeamConversationRuntime(conversation('worker-conv', 'worker-slot')));

    await waitFor(() => expect(result.current?.agent.slot_id).toBe('worker-slot'));

    await act(async () => {
      await result.current?.teamSendMessage({ input: 'work on your task', files: ['a.txt'] });
    });

    expect(bridgeMocks.teamSendMessageToAgentMock).toHaveBeenCalledWith({
      team_id: 'team-1',
      slot_id: 'worker-slot',
      input: 'work on your task',
      files: ['a.txt'],
    });
    expect(bridgeMocks.teamSendMessageMock).not.toHaveBeenCalled();
  });
});
