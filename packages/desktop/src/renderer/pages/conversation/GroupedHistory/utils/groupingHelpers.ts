/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { getRecentWorkspaces } from '@/renderer/components/workspace';
import { getActivityTime } from '@/renderer/utils/chat/timeline';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';
import { getWorkspaceUpdateTime } from '@/renderer/utils/workspace/workspaceHistory';

import type { GroupedHistoryResult, TimelineItem, TimelineSection } from '../types';
import { getConversationSortOrder } from './sortOrderHelpers';

export const isConversationPinned = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { pinned?: boolean } | undefined;
  return Boolean(extra?.pinned);
};

export const isCronJobConversation = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { cron_job_id?: string } | undefined;
  return Boolean(extra?.cron_job_id);
};

/** Check whether a conversation belongs to a team (should be hidden from sidebar). */
const isTeamConversation = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { team_id?: string; teamId?: string } | undefined;
  return Boolean(extra?.team_id || extra?.teamId);
};

type ProjectGroupingExtra = TChatConversation['extra'] & {
  custom_workspace?: boolean;
  is_temporary_workspace?: boolean;
  lark_project_binding_id?: string;
  lark_project_tasklist_guid?: string;
  lark_im_profile_name?: string;
  lark_im_chat_id?: string;
  lark_im_sender_id?: string;
  lark_im_kind?: string;
};

const isCollaborationConversation = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as ProjectGroupingExtra | undefined;
  return Boolean(
    extra?.lark_project_binding_id ||
      extra?.lark_project_tasklist_guid ||
      extra?.lark_im_profile_name ||
      extra?.lark_im_chat_id ||
      extra?.lark_im_sender_id ||
      extra?.lark_im_kind ||
      (conversation as { source?: string }).source === 'deepscientist_lark_project_agent'
  );
};

export const getLocalProjectWorkspace = (
  conversation: TChatConversation,
  legacyRecentWorkspaceSet?: Set<string>
): string | undefined => {
  const extra = conversation.extra as ProjectGroupingExtra | undefined;
  const workspace = typeof extra?.workspace === 'string' ? extra.workspace.trim() : '';

  if (!workspace) return undefined;
  if (extra?.is_temporary_workspace === true) return undefined;
  if (
    isTeamConversation(conversation) ||
    isCronJobConversation(conversation) ||
    isCollaborationConversation(conversation)
  ) {
    return undefined;
  }

  if (extra?.custom_workspace === true) return workspace;
  if (extra?.custom_workspace === false) return undefined;

  // Backward compatibility for older local-project conversations created
  // before custom_workspace was persisted. Only restore them when the folder is
  // already known from the user's local project selector, instead of inferring
  // every workspace-like path as a local project.
  if (legacyRecentWorkspaceSet?.has(workspace)) return workspace;

  return undefined;
};

export const getLegacyRecentWorkspaceSet = (): Set<string> => new Set(getRecentWorkspaces());

export const isLocalProjectConversation = (conversation: TChatConversation): boolean =>
  Boolean(getLocalProjectWorkspace(conversation, getLegacyRecentWorkspaceSet()));

export const getConversationPinnedAt = (conversation: TChatConversation): number => {
  const extra = conversation.extra as { pinned_at?: number } | undefined;
  if (typeof extra?.pinned_at === 'number') {
    return extra.pinned_at;
  }
  return 0;
};

export const groupConversationsByWorkspace = (
  conversations: TChatConversation[],
  t: (key: string) => string
): TimelineSection[] => {
  const allWorkspaceGroups = new Map<string, TChatConversation[]>();
  const withoutWorkspaceConvs: TChatConversation[] = [];
  const legacyRecentWorkspaceSet = getLegacyRecentWorkspaceSet();

  conversations.forEach((conv) => {
    const workspace = getLocalProjectWorkspace(conv, legacyRecentWorkspaceSet);

    if (workspace) {
      if (!allWorkspaceGroups.has(workspace)) {
        allWorkspaceGroups.set(workspace, []);
      }
      allWorkspaceGroups.get(workspace)!.push(conv);
    } else {
      withoutWorkspaceConvs.push(conv);
    }
  });

  const items: TimelineItem[] = [];

  allWorkspaceGroups.forEach((convList, workspace) => {
    const sortedConvs = [...convList].toSorted((a, b) => getActivityTime(b) - getActivityTime(a));
    const latestConversationTime = getActivityTime(sortedConvs[0]);
    const updateTime = getWorkspaceUpdateTime(workspace);
    const time = Math.max(updateTime, latestConversationTime);
    items.push({
      type: 'workspace',
      time,
      workspaceGroup: {
        workspace,
        // This grouping path only sees custom (user-chosen) workspaces —
        // non-custom conversations end up in `withoutWorkspaceConvs` above
        // and never reach this helper. Passing `false` is therefore correct
        // without consulting `extra.is_temporary_workspace` per-row.
        display_name: getWorkspaceDisplayName(workspace, false, t),
        conversations: sortedConvs,
      },
    });
  });

  withoutWorkspaceConvs.forEach((conv) => {
    items.push({
      type: 'conversation',
      time: getActivityTime(conv),
      conversation: conv,
    });
  });

  items.sort((a, b) => b.time - a.time);

  if (items.length === 0) return [];

  return [
    {
      timeline: t('conversation.history.recents'),
      items,
    },
  ];
};

export const buildGroupedHistory = (
  conversations: TChatConversation[],
  t: (key: string) => string
): GroupedHistoryResult => {
  // Filter out team-owned conversations; they are only visible via the Teams panel
  const visibleConversations = conversations.filter((conv) => !isTeamConversation(conv));

  const pinnedConversations = visibleConversations
    .filter((conversation) => isConversationPinned(conversation))
    .toSorted((a, b) => {
      const orderA = getConversationSortOrder(a);
      const orderB = getConversationSortOrder(b);
      if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
      return getConversationPinnedAt(b) - getConversationPinnedAt(a);
    });

  const normalConversations = visibleConversations.filter(
    (conversation) => !isConversationPinned(conversation) && !isCronJobConversation(conversation)
  );

  return {
    pinnedConversations,
    timelineSections: groupConversationsByWorkspace(normalConversations, t),
  };
};
