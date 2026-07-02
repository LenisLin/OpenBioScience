/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  delegateTask,
  getProjectDoc,
  handleTeamChildTurnCompleted,
  hideProjectTasklist,
} from '@/deepscientist_lark/project_agent/service';
import type { LarkProjectBinding, LarkProjectDocRecord } from '@/deepscientist_lark/project_agent/types';

const larkCliMocks = vi.hoisted(() => ({
  addTaskComment: vi.fn(),
  commentTask: vi.fn(),
  configureLarkProjectAgentCli: vi.fn(),
  createMarkdownFile: vi.fn(),
  createSection: vi.fn(),
  createTask: vi.fn(),
  createTasklist: vi.fn(),
  fetchMarkdownFile: vi.fn(),
  getTask: vi.fn(),
  getTaskDetail: vi.fn(),
  getTasklist: vi.fn(),
  getTasklistSourceSnapshot: vi.fn(),
  listTaskComments: vi.fn(),
  listSections: vi.fn(),
  listTasklistTasks: vi.fn(),
  listTasklists: vi.fn(),
  overwriteMarkdownFile: vi.fn(),
  searchTasklists: vi.fn(),
  setTaskCompletion: vi.fn(),
  updateSectionPlacement: vi.fn(),
  updateTask: vi.fn(),
  updateTaskDescription: vi.fn(),
  uploadTaskAttachment: vi.fn(),
}));

const storeMocks = vi.hoisted(() => ({
  createPlan: vi.fn(),
  getBindingByTasklistGuid: vi.fn(),
  getDelegationByTaskGuid: vi.fn(),
  getDelegationByTeamRunId: vi.fn(),
  hideTasklist: vi.fn(),
  getPlan: vi.fn(),
  getPromptFile: vi.fn(),
  getTaskRecord: vi.fn(),
  listCompletedTaskRecords: vi.fn(),
  listPromptFiles: vi.fn(),
  listSnapshot: vi.fn(),
  resetPromptFile: vi.fn(),
  saveBinding: vi.fn(),
  saveDelegation: vi.fn(),
  savePlan: vi.fn(),
  saveTaskRecord: vi.fn(),
  updateDelegation: vi.fn(),
  updatePromptFile: vi.fn(),
  updateTaskRecord: vi.fn(),
}));

const teamClientMocks = vi.hoisted(() => ({
  createLarkBackedTeam: vi.fn(),
  ensureTeamSession: vi.fn(),
  getTeam: vi.fn(),
  markTeamConversations: vi.fn(),
  sendMessageToTeamAgent: vi.fn(),
  sendTeamMessage: vi.fn(),
  sendTeamMessageWithBusyRetry: vi.fn(),
}));

vi.mock('@/deepscientist_lark/project_agent/larkCli', () => larkCliMocks);

vi.mock('@/deepscientist_lark/project_agent/store', () => storeMocks);

vi.mock('@/deepscientist_lark/project_agent/teamClient', () => teamClientMocks);

vi.mock('@/deepscientist_lark/project_agent/eventListener', () => ({
  getLarkProjectEventListenerStatus: vi.fn(),
  startLarkProjectEventListener: vi.fn(),
  stopLarkProjectEventListener: vi.fn(),
}));

const cachedDoc: LarkProjectDocRecord = {
  kind: 'metadata',
  title: '项目元信息',
  fileName: 'project-meta.md',
  fileToken: 'file-token-1',
  tasklistGuid: 'tasklist-1',
  sectionGuid: 'section-1',
  taskGuid: 'task-1',
  url: 'https://example.test/file-token-1',
  createdAt: 1,
  updatedAt: 2,
};

const binding: LarkProjectBinding = {
  id: 'binding-1',
  projectId: 'project-1',
  tasklistGuid: 'tasklist-1',
  tasklistName: '测试项目',
  leaderAgentLabel: '负责人 Agent',
  state: 'planning',
  sectionGuidsByName: {},
  metaTaskGuidsByTitle: {},
  projectDetailsSectionGuid: 'section-1',
  projectDocs: [cachedDoc],
  participantIds: [],
  createdAt: 1,
  updatedAt: 2,
};

const teamBinding: LarkProjectBinding = {
  ...binding,
  teamId: 'team-1',
  leaderSlotId: 'leader-slot',
};

describe('lark project agent document loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.getBindingByTasklistGuid.mockResolvedValue(binding);
    storeMocks.saveBinding.mockImplementation(async (value) => value);
    storeMocks.saveDelegation.mockImplementation(async (value) => value);
    storeMocks.getPromptFile.mockImplementation(async (role: string) => ({
      role,
      path: `/mock/${role}.md`,
      content:
        role === 'leader'
          ? 'Project leader SOP. Use delegate_task after approval.'
          : role === 'agent-task'
            ? 'Agent task SOP. Read Lark task and return a context packet.'
            : '',
      defaultContent: '',
      updatedAt: 1,
    }));
    storeMocks.updateDelegation.mockImplementation(async (_id, patch) => ({
      id: _id,
      tasklistGuid: 'tasklist-1',
      larkTaskGuid: 'task-1',
      title: 'Draft analysis',
      target: { kind: 'team_agent', slotId: 'agent-slot', name: 'Analysis Agent' },
      teamId: 'team-1',
      leaderSlotId: 'leader-slot',
      teamRunId: 'run-1',
      state: patch.state ?? 'returned',
      waitFor: 'completion',
      createdAt: 1,
      updatedAt: 2,
      ...patch,
    }));
    storeMocks.saveTaskRecord.mockImplementation(async (value) => value);
    storeMocks.updateTaskRecord.mockImplementation(async (taskGuid, patch) => ({
      id: 'record-1',
      taskGuid,
      tasklistGuid: 'tasklist-1',
      kind: 'agent',
      state: patch.state ?? 'returned',
      title: 'Draft analysis',
      createdAt: 1,
      updatedAt: 2,
      ...patch,
    }));
    larkCliMocks.fetchMarkdownFile.mockResolvedValue({
      content: '# cached project metadata',
      file: {
        fileToken: 'file-token-1',
        fileName: 'project-meta.md',
        url: 'https://example.test/file-token-1-fresh',
      },
    });
    larkCliMocks.getTasklist.mockResolvedValue({ guid: 'tasklist-1', name: '测试项目' });
    larkCliMocks.createTask.mockResolvedValue({ guid: 'task-1', url: 'https://example.test/task-1' });
    larkCliMocks.getTask.mockResolvedValue({
      guid: 'task-1',
      summary: '[AGENT_TASK] Draft analysis',
      url: 'https://example.test/task-1',
    });
    larkCliMocks.commentTask.mockResolvedValue({ commentId: 'comment-1' });
    larkCliMocks.listTaskComments.mockResolvedValue([
      {
        id: 'comment-1',
        content: 'Analysis Agent [Agent] has successfully received this task.',
        createdAt: 100,
      },
    ]);
    teamClientMocks.sendTeamMessageWithBusyRetry.mockResolvedValue({
      team_run_id: 'leader-run-1',
      message_id: 'message-1',
    });
    teamClientMocks.getTeam.mockResolvedValue({
      id: 'team-1',
      leader_agent_id: 'leader-slot',
      agents: [
        { slot_id: 'leader-slot', role: 'leader', conversation_id: 'leader-conv', agent_name: 'Leader' },
        { slot_id: 'agent-slot', role: 'teammate', conversation_id: 'agent-conv', agent_name: 'Analysis Agent' },
      ],
    });
    teamClientMocks.ensureTeamSession.mockResolvedValue(undefined);
    teamClientMocks.markTeamConversations.mockResolvedValue(undefined);
    teamClientMocks.sendMessageToTeamAgent.mockResolvedValue({
      team_run_id: 'run-1',
      team_id: 'team-1',
      target_slot_id: 'agent-slot',
      target_role: 'teammate',
      accepted_slot_id: 'agent-slot',
      accepted_role: 'teammate',
      status: 'accepted',
      message_id: 'message-1',
    });
    teamClientMocks.sendTeamMessage.mockResolvedValue({
      team_run_id: 'leader-run-1',
      team_id: 'team-1',
      target_slot_id: 'leader-slot',
      target_role: 'lead',
      accepted_slot_id: 'leader-slot',
      accepted_role: 'lead',
      status: 'accepted',
      message_id: 'leader-message-1',
    });
  });

  it('uses the cached Drive file token without re-ensuring the whole tasklist', async () => {
    const result = await getProjectDoc({
      tasklistGuid: 'tasklist-1',
      tasklistName: '测试项目',
      kind: 'metadata',
    });

    expect(result.content).toBe('# cached project metadata');
    expect(result.doc.fileToken).toBe('file-token-1');
    expect(result.doc.url).toBe('https://example.test/file-token-1-fresh');
    expect(larkCliMocks.fetchMarkdownFile).toHaveBeenCalledWith('file-token-1');
    expect(larkCliMocks.getTasklist).not.toHaveBeenCalled();
    expect(larkCliMocks.listSections).not.toHaveBeenCalled();
    expect(larkCliMocks.listTasklistTasks).not.toHaveBeenCalled();
    expect(larkCliMocks.createMarkdownFile).not.toHaveBeenCalled();
    expect(larkCliMocks.createTask).not.toHaveBeenCalled();
  });

  it('delegates local Agent work through Team Mode and records the Lark task', async () => {
    storeMocks.getBindingByTasklistGuid.mockResolvedValue(teamBinding);

    const result = await delegateTask({
      tasklistGuid: 'tasklist-1',
      tasklistName: '测试项目',
      target: { kind: 'team_agent', slotId: 'agent-slot', name: 'Analysis Agent' },
      title: 'Draft analysis',
      goal: 'Summarize the current evidence and propose the next step.',
      deliverables: ['Short result packet'],
      acceptanceCriteria: ['The leader can decide the next step from the packet.'],
      sourceConversationId: 'leader-conv',
    });

    expect(result.ok).toBe(true);
    expect(larkCliMocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        tasklistGuid: 'tasklist-1',
        summary: '[AGENT_TASK] Draft analysis',
        description: expect.stringContaining('[AGENT_TASK]'),
      })
    );
    expect(teamClientMocks.sendMessageToTeamAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        slotId: 'agent-slot',
        content: expect.stringContaining('Delegated Lark Project Task'),
      })
    );
    expect(teamClientMocks.markTeamConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        tasklistGuid: 'tasklist-1',
        tasklistName: '测试项目',
        leaderPresetContext: expect.stringContaining('Project leader'),
        agentPresetContext: expect.stringContaining('Agent task'),
      })
    );
    expect(storeMocks.saveDelegation).toHaveBeenCalledWith(
      expect.objectContaining({
        larkTaskGuid: 'task-1',
        teamId: 'team-1',
        teamRunId: 'run-1',
        state: 'running',
        lastCommentFingerprint: 'comment-1:100',
        lastCommentCount: 1,
      })
    );
    expect(storeMocks.saveTaskRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        taskGuid: 'task-1',
        kind: 'agent',
        state: 'running',
        assigneeId: 'agent-slot',
      })
    );
  });

  it('rejects delegate_task when the source conversation is not the project leader', async () => {
    storeMocks.getBindingByTasklistGuid.mockResolvedValue(teamBinding);

    await expect(
      delegateTask({
        tasklistGuid: 'tasklist-1',
        tasklistName: '测试项目',
        sourceConversationId: 'agent-conv',
        target: { kind: 'team_agent', slotId: 'agent-slot', name: 'Analysis Agent' },
        title: 'Draft analysis',
        goal: 'Summarize the current evidence.',
      })
    ).rejects.toThrow('LARK_DELEGATE_TASK_LEADER_PERMISSION_REQUIRED');

    expect(larkCliMocks.createTask).not.toHaveBeenCalled();
    expect(teamClientMocks.sendMessageToTeamAgent).not.toHaveBeenCalled();
  });

  it('requires a source conversation before delegating work', async () => {
    storeMocks.getBindingByTasklistGuid.mockResolvedValue(teamBinding);

    await expect(
      delegateTask({
        tasklistGuid: 'tasklist-1',
        tasklistName: '测试项目',
        target: { kind: 'team_agent', slotId: 'agent-slot', name: 'Analysis Agent' },
        title: 'Draft analysis',
        goal: 'Summarize the current evidence.',
      })
    ).rejects.toThrow('LARK_DELEGATE_TASK_SOURCE_CONVERSATION_REQUIRED');

    expect(larkCliMocks.createTask).not.toHaveBeenCalled();
    expect(teamClientMocks.sendMessageToTeamAgent).not.toHaveBeenCalled();
  });

  it('marks a Team child turn as returned, comments on the Lark task, and wakes the leader', async () => {
    storeMocks.getDelegationByTeamRunId.mockResolvedValue({
      id: 'delegation-1',
      tasklistGuid: 'tasklist-1',
      tasklistName: '测试项目',
      larkTaskGuid: 'task-1',
      title: 'Draft analysis',
      target: { kind: 'team_agent', slotId: 'agent-slot', name: 'Analysis Agent' },
      teamId: 'team-1',
      leaderSlotId: 'leader-slot',
      teamRunId: 'run-1',
      state: 'running',
      waitFor: 'completion',
      createdAt: 1,
      updatedAt: 2,
    });
    storeMocks.getTaskRecord.mockResolvedValue({
      id: 'record-1',
      taskGuid: 'task-1',
      tasklistGuid: 'tasklist-1',
      kind: 'agent',
      state: 'running',
      title: 'Draft analysis',
      metadata: {
        taskGuid: 'task-1',
        taskTitle: 'Draft analysis',
      },
      createdAt: 1,
      updatedAt: 2,
    });

    const result = await handleTeamChildTurnCompleted({
      team_id: 'team-1',
      team_run_id: 'run-1',
      slot_id: 'agent-slot',
      role: 'teammate',
      conversation_id: 'agent-conv',
      turn_id: 'turn-1',
      status: 'completed',
    });

    expect(result.ok).toBe(true);
    expect(storeMocks.updateTaskRecord).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        state: 'returned',
        returnContextPacketId: 'turn-1',
      })
    );
    expect(larkCliMocks.commentTask).toHaveBeenCalledWith('task-1', expect.stringContaining('Team Mode turn'));
    expect(teamClientMocks.sendTeamMessageWithBusyRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        content: expect.stringContaining('Delegated Team Mode task returned'),
      })
    );
  });
});

describe('lark project local tasklist visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.hideTasklist.mockResolvedValue({
      plans: [],
      bindings: [],
      taskRecords: [],
      delegations: [],
      hiddenTasklistGuids: ['tasklist-1'],
    });
  });

  it('hides a project tasklist locally without deleting the remote Lark tasklist', async () => {
    const result = await hideProjectTasklist({ tasklistGuid: ' tasklist-1 ' });

    expect(storeMocks.hideTasklist).toHaveBeenCalledWith('tasklist-1');
    expect(larkCliMocks.createTasklist).not.toHaveBeenCalled();
    expect(larkCliMocks.createTask).not.toHaveBeenCalled();
    expect(result.hiddenTasklistGuids).toContain('tasklist-1');
  });
});
