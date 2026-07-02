/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncLarkProjectFirstCommentFeedback } from '@/deepscientist_lark/project_agent/eventListener';
import type { LarkProjectDelegation } from '@/deepscientist_lark/project_agent/types';

const larkCliMocks = vi.hoisted(() => ({
  commentTask: vi.fn(),
  getLarkProjectAgentCliProfile: vi.fn(),
  getTask: vi.fn(),
  listTaskComments: vi.fn(),
}));

const storeMocks = vi.hoisted(() => ({
  getDelegationByTaskGuid: vi.fn(),
  getTaskRecord: vi.fn(),
  listDelegations: vi.fn(),
  saveTaskRecord: vi.fn(),
  updateDelegation: vi.fn(),
  updateTaskRecord: vi.fn(),
}));

const teamClientMocks = vi.hoisted(() => ({
  sendTeamMessage: vi.fn(),
  sendTeamMessageWithBusyRetry: vi.fn(),
}));

vi.mock('@/deepscientist_lark/project_agent/larkCli', () => larkCliMocks);

vi.mock('@/deepscientist_lark/project_agent/store', () => storeMocks);

vi.mock('@/deepscientist_lark/project_agent/teamClient', () => teamClientMocks);

const baseDelegation: LarkProjectDelegation = {
  id: 'delegation-1',
  tasklistGuid: 'tasklist-1',
  larkTaskGuid: 'task-1',
  title: 'Check the first draft',
  target: { kind: 'lark_user', openId: 'ou-1', name: 'Teammate' },
  teamId: 'team-1',
  state: 'waiting',
  waitFor: 'first_comment',
  createdAt: 1,
  updatedAt: 1,
};

describe('lark project first-comment wake sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.updateDelegation.mockImplementation(async (_id, patch) => ({ ...baseDelegation, ...patch }));
    storeMocks.updateTaskRecord.mockImplementation(async (taskGuid, patch) => ({ taskGuid, ...patch }));
    teamClientMocks.sendTeamMessageWithBusyRetry.mockResolvedValue({
      team_run_id: 'leader-run-1',
      message_id: 'message-1',
    });
  });

  it('records the current comment snapshot without waking the leader on first observation', async () => {
    larkCliMocks.listTaskComments.mockResolvedValue([
      {
        id: 'comment-1',
        content: 'Teammate [Human] has received this task.',
        createdAt: 100,
      },
    ]);

    await syncLarkProjectFirstCommentFeedback(baseDelegation);

    expect(storeMocks.updateDelegation).toHaveBeenCalledWith('delegation-1', {
      lastCommentFingerprint: 'comment-1:100',
      lastCommentCount: 1,
      lastError: undefined,
    });
    expect(storeMocks.updateTaskRecord).not.toHaveBeenCalled();
    expect(teamClientMocks.sendTeamMessageWithBusyRetry).not.toHaveBeenCalled();
  });

  it('wakes the leader when a new Lark task comment appears', async () => {
    larkCliMocks.listTaskComments.mockResolvedValue([
      {
        id: 'comment-1',
        content: 'Teammate [Human] has received this task.',
        createdAt: 100,
      },
      {
        id: 'comment-2',
        content: 'I found the blocker and need a decision.',
        creator: { id: 'ou-1', name: 'Teammate' },
        createdAt: 200,
      },
    ]);

    await syncLarkProjectFirstCommentFeedback({
      ...baseDelegation,
      lastCommentFingerprint: 'comment-1:100',
      lastCommentCount: 1,
    });

    expect(storeMocks.updateTaskRecord).toHaveBeenCalledWith('task-1', {
      state: 'returned',
      returnContextPacketId: 'comment-2',
    });
    expect(storeMocks.updateDelegation).toHaveBeenCalledWith(
      'delegation-1',
      expect.objectContaining({
        state: 'returned',
        lastCommentFingerprint: 'comment-1:100|comment-2:200',
        lastCommentCount: 2,
        lastError: undefined,
      })
    );
    expect(teamClientMocks.sendTeamMessageWithBusyRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        content: expect.stringContaining('I found the blocker and need a decision.'),
      })
    );
  });
});
