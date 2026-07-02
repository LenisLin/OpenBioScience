import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { fromApiConversation } from '@/common/adapter/apiModelMapper';
import {
  getLocalProjectWorkspace,
  groupConversationsByWorkspace,
  isLocalProjectConversation,
} from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

const conversation = (id: string, extra: Partial<TChatConversation['extra']>): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    model: { id: 'codex', use_model: 'gpt-5.3-codex' },
    extra: {
      backend: 'codex',
      ...extra,
    },
  }) as TChatConversation;

const t = (key: string) => {
  const labels: Record<string, string> = {
    'conversation.history.recents': 'Recents',
  };
  return labels[key] ?? key;
};

describe('GroupedHistory local project grouping', () => {
  it('groups only conversations created from an explicit local folder', () => {
    const localProject = conversation('local-project-chat', {
      workspace: '/Users/yixuan/Projects/PaperReview',
      custom_workspace: true,
    });
    const plainConversation = conversation('plain-chat', {
      custom_workspace: false,
    });

    const sections = groupConversationsByWorkspace([localProject, plainConversation], t);
    const items = sections[0]?.items ?? [];

    expect(items.find((item) => item.type === 'workspace')?.workspaceGroup).toMatchObject({
      workspace: '/Users/yixuan/Projects/PaperReview',
      display_name: 'PaperReview',
    });
    expect(items.find((item) => item.type === 'conversation')?.conversation?.id).toBe('plain-chat');
  });

  it('keeps temporary and Lark-backed conversations out of local projects', () => {
    const temporaryChat = conversation('temporary-chat', {
      workspace: '/Users/yixuan/Library/Application Support/DeepOrganiser-Dev/lark-im-workspaces/app/chat',
      custom_workspace: true,
      is_temporary_workspace: true,
    });
    const larkTaskChat = conversation('lark-task-chat', {
      workspace: '/Users/yixuan/Library/Application Support/DeepOrganiser-Dev/deepscientist_lark/project_agent/workspaces/project-team/tasklist-1',
      custom_workspace: true,
      lark_project_tasklist_guid: 'tasklist-1',
    });

    expect(isLocalProjectConversation(temporaryChat)).toBe(false);
    expect(isLocalProjectConversation(larkTaskChat)).toBe(false);

    const items = groupConversationsByWorkspace([temporaryChat, larkTaskChat], t)[0]?.items ?? [];

    expect(items.every((item) => item.type === 'conversation')).toBe(true);
  });

  it('does not infer local-project state from a bare workspace path', () => {
    const oldConversation = fromApiConversation(
      conversation('legacy-chat', {
        workspace: '/tmp/generated-runtime-workspace',
      })
    );

    expect(oldConversation.extra?.custom_workspace).toBeUndefined();
    expect(getLocalProjectWorkspace(oldConversation)).toBeUndefined();
  });
});
