/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, Message, Modal } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { TeamAgent, TTeam } from '@/common/types/team/teamTypes';
import CollaborationIcon from '@/renderer/components/icons/CollaborationIcon';
import { Delete, DeleteOne, EditOne, Plus, Pushpin, Refresh } from '@icon-park/react';
import { addEventListener, emitter } from '@/renderer/utils/emitter';
import { useTranslation } from 'react-i18next';
import { getConversationPinnedAt, isConversationPinned } from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';
import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import type {
  ILarkAutomationStatus,
  ILarkAutomationProjectBucket,
  ILarkProjectBinding,
  ILarkProjectDelegation,
  ILarkProjectSnapshot,
  ILarkProjectTaskRecord,
} from '@/common/adapter/ipcBridge';
import SiderItem, { type SiderMenuItem } from './SiderItem';
import type { NavigateOptions } from 'react-router-dom';

interface LarkProjectTaskSiderSectionProps {
  pathname: string;
  onNavigate: (path: string, options?: NavigateOptions) => void;
}

type LarkProjectConversationExtra = {
  lark_project_tasklist_guid?: string;
  lark_project_role?: 'leader' | 'agent';
  team_id?: string;
  team_slot_id?: string;
  teamSlotId?: string;
  lark_im_profile_name?: string;
  lark_im_chat_id?: string;
  lark_im_sender_id?: string;
  lark_im_display_group?: string;
  lark_im_kind?: 'direct_chat' | 'group_chat';
  agent_name?: string;
};

type RenameTarget =
  | {
      kind: 'tasklist';
      bucket: ILarkAutomationProjectBucket;
    }
  | {
      kind: 'conversation';
      conversation: TChatConversation;
    }
  | {
      kind: 'taskRecord';
      record: ILarkProjectTaskRecord;
      fallbackName: string;
    };

type ManagedTasklist = {
  guid: string;
  name: string;
  url?: string;
  visible: boolean;
  pinned?: boolean;
  pinnedAt?: number;
  order: number;
};

type DeleteConversationTarget = {
  conversationId: string;
  name: string;
  tasklistGuid?: string;
  teamId?: string;
  slotId?: string;
  role?: 'leader' | 'agent' | 'im';
};

function encodeBucketId(bucketId: string): string {
  return encodeURIComponent(bucketId);
}

function getProjectExtra(conversation: TChatConversation): LarkProjectConversationExtra {
  const extra = conversation.extra as unknown;
  if (typeof extra === 'string') {
    try {
      return JSON.parse(extra) as LarkProjectConversationExtra;
    } catch {
      return {};
    }
  }
  return (extra ?? {}) as LarkProjectConversationExtra;
}

function getConversationModifiedAt(conversation: TChatConversation): number {
  const record = conversation as TChatConversation & { modified_at?: number; updated_at?: number };
  return record.modified_at ?? record.updated_at ?? record.created_at ?? 0;
}

function isProjectConversation(conversation: TChatConversation): boolean {
  return Boolean(getProjectExtra(conversation).lark_project_tasklist_guid);
}

function isLarkImConversation(conversation: TChatConversation): boolean {
  const extra = getProjectExtra(conversation);
  return Boolean(extra.lark_im_chat_id && !extra.lark_project_tasklist_guid);
}

function getTaskRecordDisplayName(record: ILarkProjectTaskRecord, fallbackName?: string): string {
  return record.localTitle?.trim() || fallbackName?.trim() || record.metadata?.targetAgent || record.title;
}

function cleanLarkAccountName(value?: string): string | undefined {
  const name = value
    ?.trim()
    .replace(/\s*·\s*(飞书)?私聊\s*$/u, '')
    .replace(/\s*·\s*(飞书)?群聊\s*$/u, '');
  if (!name || name === '飞书通用智能体') return undefined;
  return name;
}

function getLarkImAccountName(
  status: ILarkAutomationStatus | null,
  conversations: TChatConversation[],
  fallback: string
): string {
  const bindingName = cleanLarkAccountName(status?.binding?.appName);
  if (bindingName) return bindingName;

  for (const conversation of conversations) {
    const extra = getProjectExtra(conversation);
    const inferredName =
      cleanLarkAccountName(extra.lark_im_display_group) ||
      cleanLarkAccountName(extra.agent_name) ||
      cleanLarkAccountName(conversation.name);
    if (inferredName) return inferredName;
  }

  return fallback;
}

function bucketFromLocalTasklist(
  tasklist: NonNullable<ILarkProjectSnapshot['localConfig']>['tasklists'][number]
): ILarkAutomationProjectBucket {
  return {
    id: `tasklist:${tasklist.guid}`,
    kind: 'tasklist',
    name: tasklist.name || tasklist.guid,
    tasklistGuid: tasklist.guid,
    url: tasklist.url,
    ownerName: tasklist.ownerName,
    taskCount: 0,
    todoCount: 0,
    doneCount: 0,
    tasks: [],
  };
}

function findTeamAgent(team: TTeam | null | undefined, slotId?: string): TeamAgent | undefined {
  if (!team) return undefined;
  if (slotId) {
    return team.agents.find((agent) => agent.slot_id === slotId);
  }
  return team.agents.find((agent) => agent.slot_id === team.leader_agent_id) ?? team.agents.find((agent) => agent.role === 'leader');
}

const LarkProjectTaskSiderSection: React.FC<LarkProjectTaskSiderSectionProps> = ({ pathname, onNavigate }) => {
  const { t } = useTranslation();
  const [buckets, setBuckets] = useState<ILarkAutomationProjectBucket[]>([]);
  const [snapshot, setSnapshot] = useState<ILarkProjectSnapshot | null>(null);
  const [projectConversations, setProjectConversations] = useState<TChatConversation[]>([]);
  const [larkImConversations, setLarkImConversations] = useState<TChatConversation[]>([]);
  const [automationStatus, setAutomationStatus] = useState<ILarkAutomationStatus | null>(null);
  const [bindingTasklistGuids, setBindingTasklistGuids] = useState<Set<string>>(() => new Set());
  const [hideTasklistTarget, setHideTasklistTarget] = useState<ILarkAutomationProjectBucket | null>(null);
  const [hideTasklistLoading, setHideTasklistLoading] = useState(false);
  const [deleteTaskRecordTarget, setDeleteTaskRecordTarget] = useState<ILarkProjectTaskRecord | null>(null);
  const [deleteTaskRecordLoading, setDeleteTaskRecordLoading] = useState(false);
  const [manageProjectsVisible, setManageProjectsVisible] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [manageProjectsLoading, setManageProjectsLoading] = useState(false);
  const [syncProjectsLoading, setSyncProjectsLoading] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const autoBindingAttemptedRef = useRef<Set<string>>(new Set());

  const loadBuckets = useCallback(async () => {
    try {
      const [projects, projectAgent, conversations, status] = await Promise.all([
        ipcBridge.larkAutomation.getProjects.invoke(),
        ipcBridge.larkProjectAgent.getSnapshot.invoke().catch((): null => null),
        ipcBridge.database.getUserConversations.invoke({ limit: 10000 }).catch((): { items: TChatConversation[] } => ({
          items: [],
        })),
        ipcBridge.larkAutomation.getStatus.invoke().catch((): null => null),
      ]);
      setBuckets(projects.buckets ?? []);
      setSnapshot(projectAgent);
      setAutomationStatus(status);
      const conversationItems = conversations.items ?? [];
      setProjectConversations(conversationItems.filter(isProjectConversation));
      setLarkImConversations(
        conversationItems.filter(isLarkImConversation).toSorted((a, b) => getConversationModifiedAt(b) - getConversationModifiedAt(a))
      );
    } catch {
      setBuckets([]);
      setSnapshot(null);
      setProjectConversations([]);
      setLarkImConversations([]);
      setAutomationStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadBuckets();
    void ipcBridge.larkAutomation.syncProjects
      .invoke(undefined)
      .then((projects) => {
        setBuckets(projects.buckets ?? []);
      })
      .catch((): void => undefined);
  }, [loadBuckets]);

  useEffect(() => {
    const removeHistoryListener = addEventListener('chat.history.refresh', () => {
      void loadBuckets();
    });
    const removeConversationListener = ipcBridge.conversation.listChanged.on(() => {
      void loadBuckets();
    });
    return () => {
      removeHistoryListener();
      removeConversationListener();
    };
  }, [loadBuckets]);

  const firstLarkImConversationId = larkImConversations[0]?.id;
  const isLarkImGroupSelected = useMemo(
    () => larkImConversations.some((conversation) => pathname === `/conversation/${conversation.id}`),
    [larkImConversations, pathname]
  );
  const larkImAccountName = useMemo(
    () => getLarkImAccountName(automationStatus, larkImConversations, t('common.collaboration.accountFallback')),
    [automationStatus, larkImConversations, t]
  );
  const hiddenTasklistGuids = useMemo(() => new Set(snapshot?.hiddenTasklistGuids ?? []), [snapshot?.hiddenTasklistGuids]);
  const tasklistConfigByGuid = useMemo(() => {
    const map = new Map<string, NonNullable<ILarkProjectSnapshot['localConfig']>['tasklists'][number]>();
    for (const tasklist of snapshot?.localConfig.tasklists ?? []) {
      map.set(tasklist.guid, tasklist);
    }
    return map;
  }, [snapshot?.localConfig.tasklists]);
  const tasklistBuckets = useMemo(
    () => {
      const byGuid = new Map<string, ILarkAutomationProjectBucket>();
      for (const bucket of buckets) {
        if (bucket.kind !== 'tasklist' || !bucket.tasklistGuid || hiddenTasklistGuids.has(bucket.tasklistGuid)) continue;
        byGuid.set(bucket.tasklistGuid, bucket);
      }
      for (const tasklist of snapshot?.localConfig.tasklists ?? []) {
        if (!tasklist.visible || hiddenTasklistGuids.has(tasklist.guid)) continue;
        const existing = byGuid.get(tasklist.guid);
        if (existing) {
          byGuid.set(tasklist.guid, {
            ...existing,
            name: tasklist.name || existing.name,
            url: tasklist.url ?? existing.url,
            ownerName: tasklist.ownerName ?? existing.ownerName,
          });
          continue;
        }
        byGuid.set(tasklist.guid, bucketFromLocalTasklist(tasklist));
      }
      return Array.from(byGuid.values()).toSorted((a, b) => {
        const aConfig = a.tasklistGuid ? tasklistConfigByGuid.get(a.tasklistGuid) : undefined;
        const bConfig = b.tasklistGuid ? tasklistConfigByGuid.get(b.tasklistGuid) : undefined;
        const pinnedDiff = Number(Boolean(bConfig?.pinned)) - Number(Boolean(aConfig?.pinned));
        if (pinnedDiff !== 0) return pinnedDiff;
        if (aConfig?.pinned || bConfig?.pinned) {
          const pinnedAtDiff = (bConfig?.pinnedAt ?? 0) - (aConfig?.pinnedAt ?? 0);
          if (pinnedAtDiff !== 0) return pinnedAtDiff;
        }
        return (aConfig?.order ?? 9999) - (bConfig?.order ?? 9999) || a.name.localeCompare(b.name);
      });
    },
    [buckets, hiddenTasklistGuids, snapshot?.localConfig.tasklists, tasklistConfigByGuid]
  );

  const managedTasklists = useMemo<ManagedTasklist[]>(() => {
    const map = new Map<string, ManagedTasklist>();
    for (const tasklist of snapshot?.localConfig.tasklists ?? []) {
      map.set(tasklist.guid, {
        guid: tasklist.guid,
        name: tasklist.name || tasklist.guid,
        url: tasklist.url,
        visible: tasklist.visible && !hiddenTasklistGuids.has(tasklist.guid),
        pinned: tasklist.pinned,
        pinnedAt: tasklist.pinnedAt,
        order: tasklist.order,
      });
    }
    for (const bucket of buckets) {
      if (!bucket.tasklistGuid) continue;
      const previous = map.get(bucket.tasklistGuid);
      map.set(bucket.tasklistGuid, {
        guid: bucket.tasklistGuid,
        name: bucket.name || previous?.name || bucket.tasklistGuid,
        url: bucket.url || previous?.url,
        visible: !hiddenTasklistGuids.has(bucket.tasklistGuid) && (previous?.visible ?? true),
        pinned: previous?.pinned,
        pinnedAt: previous?.pinnedAt,
        order: previous?.order ?? map.size,
      });
    }
    return Array.from(map.values()).toSorted((a, b) => {
      const visibleDiff = Number(b.visible) - Number(a.visible);
      if (visibleDiff !== 0) return visibleDiff;
      const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinnedDiff !== 0) return pinnedDiff;
      return a.order - b.order || a.name.localeCompare(b.name);
    });
  }, [buckets, hiddenTasklistGuids, snapshot?.localConfig.tasklists]);

  const bindingsByTasklist = useMemo(() => {
    const map = new Map<string, ILarkProjectBinding>();
    for (const binding of snapshot?.bindings ?? []) {
      map.set(binding.tasklistGuid, binding);
    }
    return map;
  }, [snapshot?.bindings]);

  const agentRecordsByTasklist = useMemo(() => {
    const map = new Map<string, ILarkProjectTaskRecord[]>();
    for (const record of snapshot?.taskRecords ?? []) {
      const key = record.tasklistGuid || '';
      const list = map.get(key) ?? [];
      list.push(record);
      map.set(key, list);
    }
    for (const [key, records] of map) {
      map.set(
        key,
        records.toSorted((a, b) => {
          const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
          if (pinnedDiff !== 0) return pinnedDiff;
          if (a.pinned || b.pinned) {
            const pinnedAtDiff = (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
            if (pinnedAtDiff !== 0) return pinnedAtDiff;
          }
          return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
        })
      );
    }
    return map;
  }, [snapshot?.taskRecords]);

  const delegationsByTaskGuid = useMemo(() => {
    const map = new Map<string, ILarkProjectDelegation>();
    for (const delegation of snapshot?.delegations ?? []) {
      map.set(delegation.larkTaskGuid, delegation);
    }
    return map;
  }, [snapshot?.delegations]);

  const conversationsByTasklist = useMemo(() => {
    const map = new Map<string, TChatConversation[]>();
    for (const conversation of projectConversations) {
      const tasklistGuid = getProjectExtra(conversation).lark_project_tasklist_guid;
      if (!tasklistGuid) continue;
      const list = map.get(tasklistGuid) ?? [];
      list.push(conversation);
      map.set(tasklistGuid, list);
    }
    for (const [tasklistGuid, conversations] of map) {
      map.set(
        tasklistGuid,
        conversations.toSorted((a, b) => {
          const pinnedDiff = Number(isConversationPinned(b)) - Number(isConversationPinned(a));
          if (pinnedDiff !== 0) return pinnedDiff;
          if (isConversationPinned(a) || isConversationPinned(b)) {
            const pinnedAtDiff = getConversationPinnedAt(b) - getConversationPinnedAt(a);
            if (pinnedAtDiff !== 0) return pinnedAtDiff;
          }
          return getConversationModifiedAt(b) - getConversationModifiedAt(a);
        })
      );
    }
    return map;
  }, [projectConversations]);

  const projectConversationsById = useMemo(() => {
    const map = new Map<string, TChatConversation>();
    for (const conversation of projectConversations) {
      map.set(conversation.id, conversation);
    }
    return map;
  }, [projectConversations]);

  const markBinding = useCallback((tasklistGuid: string, active: boolean) => {
    setBindingTasklistGuids((previous) => {
      const next = new Set(previous);
      if (active) {
        next.add(tasklistGuid);
      } else {
        next.delete(tasklistGuid);
      }
      return next;
    });
  }, []);

  const openTeamConversation = useCallback(
    async (teamId?: string, slotId?: string): Promise<boolean> => {
      if (!teamId) return false;
      const team = await ipcBridge.team.get.invoke({ id: teamId }).catch((): TTeam | null => null);
      const agent = findTeamAgent(team, slotId);
      if (!agent?.conversation_id) return false;
      onNavigate(`/conversation/${agent.conversation_id}`);
      return true;
    },
    [onNavigate]
  );

  const findLeaderConversation = useCallback(
    async (
      bucket: ILarkAutomationProjectBucket,
      binding: ILarkProjectBinding | undefined
    ): Promise<TChatConversation | null> => {
      if (!bucket.tasklistGuid) return null;

      let staleLeaderConversationId: string | undefined;
      if (binding?.leaderAgentConversationId) {
        const existingConversation = await ipcBridge.conversation.get
          .invoke({ id: binding.leaderAgentConversationId })
          .catch((): TChatConversation | null => null);
        if (existingConversation?.id) return existingConversation;
        staleLeaderConversationId = binding.leaderAgentConversationId;
      }

      const loadedLeaderConversation = conversationsByTasklist
        .get(bucket.tasklistGuid)
        ?.find((conversation) => getProjectExtra(conversation).lark_project_role === 'leader');
      const leaderConversation =
        loadedLeaderConversation ??
        (await ipcBridge.database.getUserConversations
          .invoke({ limit: 10000 })
          .then((result) =>
            (result.items ?? [])
              .filter((conversation) => {
                const extra = getProjectExtra(conversation);
                return extra.lark_project_tasklist_guid === bucket.tasklistGuid && extra.lark_project_role === 'leader';
              })
              .toSorted((a, b) => getConversationModifiedAt(b) - getConversationModifiedAt(a))[0]
          )
          .catch((): TChatConversation | undefined => undefined));

      if (leaderConversation?.id && (!binding || binding.leaderAgentConversationId !== leaderConversation.id)) {
        const attachResult = await ipcBridge.larkProjectAgent.attachConversation
          .invoke({
            conversationId: leaderConversation.id,
            role: 'leader',
            bindingId: binding?.id,
            tasklistGuid: bucket.tasklistGuid,
            tasklistName: binding?.tasklistName || bucket.name,
            replaceExistingLeader: Boolean(staleLeaderConversationId),
          })
          .catch((): { binding?: ILarkProjectBinding } | undefined => undefined);
        const boundConversationId = attachResult?.binding?.leaderAgentConversationId;
        if (boundConversationId && boundConversationId !== leaderConversation.id) {
          const boundConversation = await ipcBridge.conversation.get
            .invoke({ id: boundConversationId })
            .catch((): TChatConversation | null => null);
          if (boundConversation?.id) return boundConversation;
        }
        const nextSnapshot = await ipcBridge.larkProjectAgent.getSnapshot.invoke().catch((): null => null);
        setSnapshot(nextSnapshot);
      }

      return leaderConversation ?? null;
    },
    [conversationsByTasklist]
  );

  const openLeaderAgent = useCallback(
    async (bucket: ILarkAutomationProjectBucket) => {
      if (!bucket.tasklistGuid) return;
      markBinding(bucket.tasklistGuid, true);
      try {
        const existingBinding = bindingsByTasklist.get(bucket.tasklistGuid);
        if (await openTeamConversation(existingBinding?.teamId, existingBinding?.leaderSlotId)) {
          return;
        }

        const existingConversation = await findLeaderConversation(bucket, existingBinding);
        if (existingConversation?.id) {
          onNavigate(`/conversation/${existingConversation.id}`);
          return;
        }

        const result =
          existingBinding?.leaderAgentPendingPrompt || existingBinding
            ? {
                binding: existingBinding,
                leaderPrompt:
                  existingBinding.leaderAgentPendingPrompt ||
                  t('guid.larkProject.leaderInitialPrompt', { tasklistName: bucket.name }),
              }
            : await ipcBridge.larkProjectAgent.bindLeaderAgent.invoke({
                tasklistGuid: bucket.tasklistGuid,
                tasklistName: bucket.name,
                projectTitle: bucket.name,
                leaderAgentLabel: t('common.collaboration.leaderAgent'),
              });

        if (!existingBinding) {
          const nextSnapshot = await ipcBridge.larkProjectAgent.getSnapshot.invoke().catch((): null => null);
          setSnapshot(nextSnapshot);
        }

        if (!result.binding) {
          throw new Error('LARK_PROJECT_BINDING_CREATE_FAILED');
        }

        if (await openTeamConversation(result.binding.teamId, result.binding.leaderSlotId)) {
          return;
        }

        const conversationAfterBind = await findLeaderConversation(bucket, result.binding);
        if (conversationAfterBind?.id) {
          onNavigate(`/conversation/${conversationAfterBind.id}`);
          return;
        }

        if (result.binding.leaderAgentConversationId) {
          onNavigate(`/conversation/${result.binding.leaderAgentConversationId}`);
          return;
        }

        onNavigate('/guid', {
          state: {
            larkProjectContext: {
              role: 'leader',
              bindingId: result.binding.id,
              tasklistGuid: bucket.tasklistGuid,
              tasklistName: result.binding.tasklistName || bucket.name,
              leaderPrompt: result.leaderPrompt,
            },
          },
        });
      } catch (error) {
        Message.error(error instanceof Error ? error.message : String(error));
      } finally {
        markBinding(bucket.tasklistGuid, false);
      }
    },
    [bindingsByTasklist, findLeaderConversation, markBinding, onNavigate, openTeamConversation, t]
  );

  const hideTasklistFromLocalSidebar = useCallback(
    (bucket: ILarkAutomationProjectBucket) => {
      if (!bucket.tasklistGuid) return;
      setHideTasklistTarget(bucket);
    },
    []
  );

  const closeHideTasklistModal = useCallback(() => {
    if (hideTasklistLoading) return;
    setHideTasklistTarget(null);
  }, [hideTasklistLoading]);

  const confirmHideTasklistFromLocalSidebar = useCallback(
    async () => {
      const bucket = hideTasklistTarget;
      if (!bucket?.tasklistGuid) return;

      setHideTasklistLoading(true);
      try {
        const nextSnapshot = await ipcBridge.larkProjectAgent.hideTasklist.invoke({ tasklistGuid: bucket.tasklistGuid });
        setSnapshot(nextSnapshot);
        setBuckets((previous) => previous.filter((item) => item.tasklistGuid !== bucket.tasklistGuid));
        autoBindingAttemptedRef.current.add(bucket.tasklistGuid);
        emitter.emit('chat.history.refresh');
        if (pathname === `/lark-projects/${encodeBucketId(bucket.id)}`) {
          onNavigate('/guid', { replace: true });
        }
        setHideTasklistTarget(null);
        Message.success(t('common.collaboration.projects.hideTasklistSuccess'));
      } catch (error) {
        Message.error(error instanceof Error ? error.message : String(error));
      } finally {
        setHideTasklistLoading(false);
      }
    },
    [hideTasklistTarget, onNavigate, pathname, t]
  );

  const closeDeleteTaskRecordModal = useCallback(() => {
    if (deleteTaskRecordLoading) return;
    setDeleteTaskRecordTarget(null);
  }, [deleteTaskRecordLoading]);

  const confirmDeleteTaskRecord = useCallback(async () => {
    const record = deleteTaskRecordTarget;
    if (!record) return;

    setDeleteTaskRecordLoading(true);
    try {
      if (record.agentConversationId) {
        await ipcBridge.conversation.remove.invoke({ id: record.agentConversationId }).catch((): boolean => false);
      }
      const nextSnapshot = await ipcBridge.larkProjectAgent.removeTaskRecord.invoke({ recordId: record.id });
      setSnapshot(nextSnapshot);
      setDeleteTaskRecordTarget(null);
      emitter.emit('chat.history.refresh');
      await loadBuckets();
      Message.success(t('common.deleteSuccess'));
      if (record.agentConversationId && pathname === `/conversation/${record.agentConversationId}`) {
        onNavigate('/guid', { replace: true });
      }
    } catch (error) {
      console.error('Failed to delete project task record:', error);
      Message.error(t('common.deleteFailed'));
    } finally {
      setDeleteTaskRecordLoading(false);
    }
  }, [deleteTaskRecordTarget, loadBuckets, onNavigate, pathname, t]);

  const syncProjectTasklists = useCallback(async () => {
    setSyncProjectsLoading(true);
    try {
      const projects = await ipcBridge.larkAutomation.syncProjects.invoke(undefined);
      setBuckets(projects.buckets ?? []);
      const nextSnapshot = await ipcBridge.larkProjectAgent.getSnapshot.invoke().catch((): null => null);
      setSnapshot(nextSnapshot);
      Message.success(t('common.refreshSuccess'));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncProjectsLoading(false);
    }
  }, [t]);

  const restoreTasklistToSidebar = useCallback(
    async (tasklist: ManagedTasklist) => {
      setManageProjectsLoading(true);
      try {
        const nextSnapshot = await ipcBridge.larkProjectAgent.updateTasklistLocalState.invoke({
          tasklistGuid: tasklist.guid,
          visible: true,
        });
        setSnapshot(nextSnapshot);
        await loadBuckets();
        Message.success(t('common.collaboration.projects.restoreTasklistSuccess'));
        onNavigate(`/lark-projects/${encodeBucketId(`tasklist:${tasklist.guid}`)}`);
      } catch (error) {
        Message.error(error instanceof Error ? error.message : String(error));
      } finally {
        setManageProjectsLoading(false);
      }
    },
    [loadBuckets, onNavigate, t]
  );

  const createManagedProject = useCallback(async () => {
    const name = projectName.trim();
    if (!name) {
      Message.warning(t('common.collaboration.projects.createNameRequired'));
      return;
    }
    setManageProjectsLoading(true);
    try {
      const result = await ipcBridge.larkAutomation.createTasklist.invoke({ name });
      if (!result.ok || !result.tasklistGuid) {
        Message.error(result.error || t('common.collaboration.projects.createFailed'));
        return;
      }
      const tasklistName = result.name || name;
      await ipcBridge.larkProjectAgent.bindLeaderAgent.invoke({
        tasklistGuid: result.tasklistGuid,
        tasklistName,
        projectTitle: tasklistName,
        leaderAgentLabel: t('common.collaboration.leaderAgent'),
      });
      const nextSnapshot = await ipcBridge.larkProjectAgent.updateTasklistLocalState.invoke({
        tasklistGuid: result.tasklistGuid,
        visible: true,
      });
      setSnapshot(nextSnapshot);
      await loadBuckets();
      setProjectName('');
      setManageProjectsVisible(false);
      Message.success(t('common.collaboration.projects.createSuccess'));
      onNavigate(`/lark-projects/${encodeBucketId(`tasklist:${result.tasklistGuid}`)}`);
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setManageProjectsLoading(false);
    }
  }, [loadBuckets, onNavigate, projectName, t]);

  const isTasklistPinned = useCallback(
    (bucket: ILarkAutomationProjectBucket): boolean =>
      Boolean(bucket.tasklistGuid && tasklistConfigByGuid.get(bucket.tasklistGuid)?.pinned),
    [tasklistConfigByGuid]
  );

  const getTasklistMenuItems = useCallback(
    (bucket: ILarkAutomationProjectBucket): SiderMenuItem[] => {
      const pinned = isTasklistPinned(bucket);
      return [
        {
          key: 'pin',
          icon: <Pushpin theme='outline' size={14} />,
          label: t(pinned ? 'conversation.history.unpin' : 'conversation.history.pin'),
        },
        {
          key: 'rename',
          icon: <EditOne theme='outline' size={14} />,
          label: t('conversation.history.rename'),
        },
        {
          key: 'delete',
          icon: <DeleteOne theme='outline' size={14} />,
          label: t('common.collaboration.projects.hideTasklistAction'),
          danger: true,
        },
      ];
    },
    [isTasklistPinned, t]
  );

  const getConversationMenuItems = useCallback(
    (conversation: TChatConversation): SiderMenuItem[] => {
      const pinned = isConversationPinned(conversation);
      return [
        {
          key: 'pin',
          icon: <Pushpin theme='outline' size={14} />,
          label: t(pinned ? 'conversation.history.unpin' : 'conversation.history.pin'),
        },
        {
          key: 'rename',
          icon: <EditOne theme='outline' size={14} />,
          label: t('conversation.history.rename'),
        },
        {
          key: 'delete',
          icon: <DeleteOne theme='outline' size={14} />,
          label: t('conversation.history.deleteTitle'),
          danger: true,
        },
      ];
    },
    [t]
  );

  const getTaskRecordMenuItems = useCallback(
    (record: ILarkProjectTaskRecord): SiderMenuItem[] => [
      {
        key: 'pin',
        icon: <Pushpin theme='outline' size={14} />,
        label: t(record.pinned ? 'conversation.history.unpin' : 'conversation.history.pin'),
      },
      {
        key: 'rename',
        icon: <EditOne theme='outline' size={14} />,
        label: t('conversation.history.rename'),
      },
      {
        key: 'delete',
        icon: <DeleteOne theme='outline' size={14} />,
        label: t('conversation.history.deleteTitle'),
        danger: true,
      },
    ],
    [t]
  );

  const toggleTasklistPinned = useCallback(
    async (bucket: ILarkAutomationProjectBucket) => {
      if (!bucket.tasklistGuid) return;
      const nextPinned = !isTasklistPinned(bucket);
      try {
        const nextSnapshot = await ipcBridge.larkProjectAgent.updateTasklistLocalState.invoke({
          tasklistGuid: bucket.tasklistGuid,
          pinned: nextPinned,
          pinnedAt: nextPinned ? Date.now() : undefined,
        });
        setSnapshot(nextSnapshot);
      } catch (error) {
        console.error('Failed to pin collaboration tasklist:', error);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [isTasklistPinned, t]
  );

  const toggleConversationPinned = useCallback(
    async (conversation: TChatConversation) => {
      const pinned = isConversationPinned(conversation);
      try {
        const success = await ipcBridge.conversation.update.invoke({
          id: conversation.id,
          updates: {
            extra: {
              pinned: !pinned,
              pinned_at: pinned ? undefined : Date.now(),
            } as Partial<TChatConversation['extra']>,
          } as Partial<TChatConversation>,
          merge_extra: true,
        });
        if (!success) {
          Message.error(t('conversation.history.pinFailed'));
          return;
        }
        emitter.emit('chat.history.refresh');
        await loadBuckets();
      } catch (error) {
        console.error('Failed to pin project conversation:', error);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [loadBuckets, t]
  );

  const toggleTaskRecordPinned = useCallback(
    async (record: ILarkProjectTaskRecord) => {
      const nextPinned = !record.pinned;
      try {
        const nextSnapshot = await ipcBridge.larkProjectAgent.updateTaskRecordLocalState.invoke({
          recordId: record.id,
          pinned: nextPinned,
          pinnedAt: nextPinned ? Date.now() : undefined,
        });
        setSnapshot(nextSnapshot);
      } catch (error) {
        console.error('Failed to pin project task record:', error);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [t]
  );

  const openRenameModal = useCallback((target: RenameTarget) => {
    setRenameTarget(target);
    setRenameName(
      target.kind === 'tasklist'
        ? target.bucket.name
        : target.kind === 'conversation'
          ? target.conversation.name
          : getTaskRecordDisplayName(target.record, target.fallbackName)
    );
  }, []);

  const closeRenameModal = useCallback(() => {
    if (renameLoading) return;
    setRenameTarget(null);
    setRenameName('');
  }, [renameLoading]);

  const confirmRename = useCallback(async () => {
    const target = renameTarget;
    const nextName = renameName.trim();
    if (!target || !nextName) return;

    setRenameLoading(true);
    try {
      if (target.kind === 'tasklist') {
        const tasklistGuid = target.bucket.tasklistGuid;
        if (!tasklistGuid) return;
        const nextSnapshot = await ipcBridge.larkProjectAgent.renameTasklist.invoke({
          tasklistGuid,
          name: nextName,
        });
        setSnapshot(nextSnapshot);
        setBuckets((previous) =>
          previous.map((bucket) => (bucket.tasklistGuid === tasklistGuid ? { ...bucket, name: nextName } : bucket))
        );
        Message.success(t('common.collaboration.projects.renameTasklistSuccess'));
      } else if (target.kind === 'conversation') {
        const success = await ipcBridge.conversation.update.invoke({
          id: target.conversation.id,
          updates: { name: nextName },
        });
        if (!success) {
          Message.error(t('conversation.history.renameFailed'));
          return;
        }
        await refreshConversationCache(target.conversation.id);
        Message.success(t('conversation.history.renameSuccess'));
      } else {
        const nextSnapshot = await ipcBridge.larkProjectAgent.updateTaskRecordLocalState.invoke({
          recordId: target.record.id,
          localTitle: nextName,
        });
        setSnapshot(nextSnapshot);
        Message.success(t('conversation.history.renameSuccess'));
      }

      emitter.emit('chat.history.refresh');
      await loadBuckets();
      setRenameTarget(null);
      setRenameName('');
    } catch (error) {
      console.error('Failed to rename collaboration sidebar item:', error);
      Message.error(
        target.kind === 'tasklist'
          ? t('common.collaboration.projects.renameTasklistFailed')
          : target.kind === 'taskRecord'
            ? t('conversation.history.renameFailed')
          : t('conversation.history.renameFailed')
      );
    } finally {
      setRenameLoading(false);
    }
  }, [loadBuckets, renameName, renameTarget, t]);

  const deleteProjectConversation = useCallback(
    (target: DeleteConversationTarget) => {
      Modal.confirm({
        title: t('conversation.history.deleteTitle'),
        content: t('common.collaboration.projects.deleteConversationConfirm', {
          name: target.name || t('common.collaboration.projectAgent'),
        }),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        okButtonProps: { status: 'warning' },
        alignCenter: true,
        style: { borderRadius: '12px' },
        getPopupContainer: () => document.body,
        onOk: async () => {
          try {
            if (target.role === 'leader' && target.teamId) {
              await ipcBridge.team.remove.invoke({ id: target.teamId }).catch((): void => undefined);
            } else if (target.role === 'agent' && target.teamId && target.slotId) {
              await ipcBridge.team.removeAgent
                .invoke({ team_id: target.teamId, slot_id: target.slotId })
                .catch((): void => undefined);
            }
            const success = await ipcBridge.conversation.remove.invoke({ id: target.conversationId }).catch((): boolean => false);
            const stillExists = success
              ? false
              : Boolean(
                  await ipcBridge.conversation.get
                    .invoke({ id: target.conversationId })
                    .catch((): TChatConversation | null => null)
                );
            if (!success && stillExists) {
              Message.error(t('conversation.history.deleteFailed'));
              return;
            }
            const nextSnapshot = await ipcBridge.larkProjectAgent.removeConversationLink
              .invoke({
                conversationId: target.conversationId,
                tasklistGuid: target.tasklistGuid,
              })
              .catch((): ILarkProjectSnapshot | null => null);
            if (nextSnapshot) {
              setSnapshot(nextSnapshot);
            }
            emitter.emit('conversation.deleted', target.conversationId);
            emitter.emit('chat.history.refresh');
            await loadBuckets();
            Message.success(t('conversation.history.deleteSuccess'));
            if (pathname === `/conversation/${target.conversationId}`) {
              onNavigate('/guid', { replace: true });
            }
          } catch (error) {
            console.error('Failed to delete project conversation:', error);
            Message.error(t('conversation.history.deleteFailed'));
          }
        },
      });
    },
    [loadBuckets, onNavigate, pathname, t]
  );

  const deleteTaskRecord = useCallback(
    (record: ILarkProjectTaskRecord) => {
      setDeleteTaskRecordTarget(record);
    },
    []
  );

  const handleTasklistMenuAction = useCallback(
    (key: string, bucket: ILarkAutomationProjectBucket) => {
      if (key === 'pin') {
        void toggleTasklistPinned(bucket);
        return;
      }
      if (key === 'rename') {
        openRenameModal({ kind: 'tasklist', bucket });
        return;
      }
      if (key === 'delete') {
        hideTasklistFromLocalSidebar(bucket);
      }
    },
    [hideTasklistFromLocalSidebar, openRenameModal, toggleTasklistPinned]
  );

  const handleConversationMenuAction = useCallback(
    (key: string, conversation: TChatConversation) => {
      if (key === 'pin') {
        void toggleConversationPinned(conversation);
        return;
      }
      if (key === 'rename') {
        openRenameModal({ kind: 'conversation', conversation });
        return;
      }
      if (key === 'delete') {
        const extra = getProjectExtra(conversation);
        deleteProjectConversation({
          conversationId: conversation.id,
          name: conversation.name || t('common.collaboration.projectAgent'),
          tasklistGuid: extra.lark_project_tasklist_guid,
          teamId: extra.team_id,
          slotId: extra.team_slot_id || extra.teamSlotId,
          role: extra.lark_project_role,
        });
      }
    },
    [deleteProjectConversation, openRenameModal, t, toggleConversationPinned]
  );

  const handleLarkImMenuAction = useCallback(
    (key: string) => {
      const firstConversation = larkImConversations[0];
      if (!firstConversation) return;
      if (key === 'pin') {
        void toggleConversationPinned(firstConversation);
        return;
      }
      if (key === 'rename') {
        openRenameModal({ kind: 'conversation', conversation: firstConversation });
        return;
      }
      if (key === 'delete') {
        deleteProjectConversation({
          conversationId: firstConversation.id,
          name: larkImAccountName,
          role: 'im',
        });
      }
    },
    [deleteProjectConversation, larkImAccountName, larkImConversations, openRenameModal, toggleConversationPinned]
  );

  const handleTaskRecordMenuAction = useCallback(
    (key: string, record: ILarkProjectTaskRecord, fallbackName: string, recordConversation?: TChatConversation) => {
      if (recordConversation) {
        handleConversationMenuAction(key, recordConversation);
        return;
      }
      if (key === 'pin') {
        void toggleTaskRecordPinned(record);
        return;
      }
      if (key === 'rename') {
        openRenameModal({ kind: 'taskRecord', record, fallbackName });
        return;
      }
      if (key === 'delete') {
        deleteTaskRecord(record);
      }
    },
    [deleteTaskRecord, handleConversationMenuAction, openRenameModal, toggleTaskRecordPinned]
  );

  const openTaskRecord = useCallback(
    async (record: ILarkProjectTaskRecord): Promise<void> => {
      const delegation = delegationsByTaskGuid.get(record.taskGuid);
      if (delegation?.target.kind === 'team_agent') {
        if (await openTeamConversation(delegation.teamId, delegation.target.slotId)) {
          return;
        }
      }

      if (record.agentConversationId) {
        onNavigate(`/conversation/${record.agentConversationId}`);
        return;
      }

      const bucket = buckets.find((item) => item.tasklistGuid === record.tasklistGuid);
      if (bucket) {
        onNavigate(`/lark-projects/${encodeBucketId(bucket.id)}`, {
          state: {
            taskGuid: record.taskGuid,
          },
        });
        return;
      }

      Message.info(record.title);
    },
    [buckets, delegationsByTaskGuid, onNavigate, openTeamConversation]
  );

  useEffect(() => {
    const removeChildTurnListener = ipcBridge.team.childTurnCompleted.on(() => {
      void loadBuckets();
    });
    return () => {
      removeChildTurnListener();
    };
  }, [loadBuckets]);

  useEffect(() => {
    if (tasklistBuckets.length === 0) return;
    const missingBuckets = tasklistBuckets.filter((bucket) => {
      const tasklistGuid = bucket.tasklistGuid;
      return Boolean(
        tasklistGuid && !bindingsByTasklist.has(tasklistGuid) && !autoBindingAttemptedRef.current.has(tasklistGuid)
      );
    });
    if (missingBuckets.length === 0) return;

    let cancelled = false;
    const run = async () => {
      await missingBuckets.reduce(
        (chain, bucket) =>
          chain.then(async () => {
            const tasklistGuid = bucket.tasklistGuid;
            if (!tasklistGuid || cancelled) return;
            autoBindingAttemptedRef.current.add(tasklistGuid);
            markBinding(tasklistGuid, true);
            try {
              await ipcBridge.larkProjectAgent.bindLeaderAgent.invoke({
                tasklistGuid,
                tasklistName: bucket.name,
                projectTitle: bucket.name,
                leaderAgentLabel: t('common.collaboration.leaderAgent'),
              });
            } catch {
              // The user can still click the Agent row to retry a single binding.
            } finally {
              markBinding(tasklistGuid, false);
            }
          }),
        Promise.resolve()
      );
      if (!cancelled) {
        const nextSnapshot = await ipcBridge.larkProjectAgent.getSnapshot.invoke().catch((): null => null);
        setSnapshot(nextSnapshot);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [bindingsByTasklist, markBinding, tasklistBuckets, t]);

  return (
    <div className='min-w-0'>
      <Modal
        visible={Boolean(renameTarget)}
        title={
          renameTarget?.kind === 'tasklist'
            ? t('common.collaboration.projects.renameTasklistTitle')
            : renameTarget?.kind === 'taskRecord'
              ? t('common.collaboration.projects.renameRecordTitle')
              : t('conversation.history.renameTitle')
        }
        okText={renameLoading ? t('common.processing') : t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={renameLoading}
        onOk={() => void confirmRename()}
        onCancel={closeRenameModal}
        alignCenter
        maskClosable={!renameLoading}
        getPopupContainer={() => document.body}
        style={{ width: 420, borderRadius: 12, overflow: 'hidden' }}
      >
        <Input
          value={renameName}
          autoFocus
          maxLength={80}
          placeholder={
            renameTarget?.kind === 'tasklist'
              ? t('common.collaboration.projects.renameTasklistPlaceholder')
              : renameTarget?.kind === 'taskRecord'
                ? t('common.collaboration.projects.renameRecordPlaceholder')
              : t('conversation.history.renamePlaceholder')
          }
          onChange={setRenameName}
          onPressEnter={() => void confirmRename()}
        />
        {renameTarget?.kind === 'tasklist' ? (
          <div className='mt-10px text-12px leading-18px text-t-tertiary'>
            {t('common.collaboration.projects.renameTasklistHint')}
          </div>
        ) : null}
      </Modal>
      <Modal
        visible={Boolean(hideTasklistTarget)}
        title={null}
        footer={null}
        closable={false}
        alignCenter
        maskClosable={!hideTasklistLoading}
        onCancel={closeHideTasklistModal}
        getPopupContainer={() => document.body}
        className='collaboration-local-remove-modal'
        style={{ width: 440, borderRadius: 12, overflow: 'hidden' }}
      >
        <div className='bg-bg-2 px-24px py-22px text-t-primary'>
          <div className='mb-12px flex items-center gap-10px'>
            <div className='size-30px rd-full border border-border-2 bg-bg-1 flex-center shrink-0 text-t-secondary'>
              <Delete theme='outline' size={15} />
            </div>
            <div className='min-w-0 text-18px font-700 leading-26px'>
              {t('common.collaboration.projects.hideTasklistTitle')}
            </div>
          </div>
          <div className='rd-8px border border-border-1 bg-bg-1 px-14px py-13px text-14px leading-22px text-t-secondary'>
            {t('common.collaboration.projects.hideTasklistConfirm', { name: hideTasklistTarget?.name || '' })}
          </div>
          <div className='mt-18px flex justify-end gap-10px'>
            <button
              type='button'
              disabled={hideTasklistLoading}
              onClick={closeHideTasklistModal}
              className='h-36px min-w-88px rd-8px border border-border-2 bg-bg-1 px-16px text-14px font-600 text-t-primary transition-colors hover:bg-fill-1 disabled:cursor-not-allowed disabled:opacity-60'
            >
              {t('common.cancel')}
            </button>
            <button
              type='button'
              disabled={hideTasklistLoading}
              onClick={() => void confirmHideTasklistFromLocalSidebar()}
              className='h-36px min-w-96px rd-8px border border-[#18181b] bg-[#18181b] px-16px text-14px font-700 text-white transition-colors hover:bg-[#2f2f33] disabled:cursor-not-allowed disabled:opacity-60'
            >
              {hideTasklistLoading ? t('common.processing') : t('common.collaboration.projects.hideTasklistOk')}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        visible={Boolean(deleteTaskRecordTarget)}
        title={null}
        footer={null}
        closable={false}
        alignCenter
        maskClosable={!deleteTaskRecordLoading}
        onCancel={closeDeleteTaskRecordModal}
        getPopupContainer={() => document.body}
        className='collaboration-local-remove-modal'
        style={{ width: 440, borderRadius: 12, overflow: 'hidden' }}
      >
        <div className='bg-bg-2 px-24px py-22px text-t-primary'>
          <div className='mb-12px flex items-center gap-10px'>
            <div className='size-30px rd-full border border-border-2 bg-bg-1 flex-center shrink-0 text-t-secondary'>
              <DeleteOne theme='outline' size={15} />
            </div>
            <div className='min-w-0 text-18px font-700 leading-26px'>
              {t('common.collaboration.projects.deleteRecordTitle')}
            </div>
          </div>
          <div className='rd-8px border border-border-1 bg-bg-1 px-14px py-13px text-14px leading-22px text-t-secondary'>
            {t('common.collaboration.projects.deleteRecordConfirm', { name: deleteTaskRecordTarget?.title || '' })}
          </div>
          <div className='mt-18px flex justify-end gap-10px'>
            <button
              type='button'
              disabled={deleteTaskRecordLoading}
              onClick={closeDeleteTaskRecordModal}
              className='h-36px min-w-88px rd-8px border border-border-2 bg-bg-1 px-16px text-14px font-600 text-t-primary transition-colors hover:bg-fill-1 disabled:cursor-not-allowed disabled:opacity-60'
            >
              {t('common.cancel')}
            </button>
            <button
              type='button'
              disabled={deleteTaskRecordLoading}
              onClick={() => void confirmDeleteTaskRecord()}
              className='h-36px min-w-96px rd-8px border border-[#18181b] bg-[#18181b] px-16px text-14px font-700 text-white transition-colors hover:bg-[#2f2f33] disabled:cursor-not-allowed disabled:opacity-60'
            >
              {deleteTaskRecordLoading ? t('common.processing') : t('conversation.history.confirmDelete')}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        visible={manageProjectsVisible}
        title={t('common.collaboration.projects.manageTitle')}
        footer={null}
        alignCenter
        maskClosable={!manageProjectsLoading}
        onCancel={() => {
          if (!manageProjectsLoading) setManageProjectsVisible(false);
        }}
        getPopupContainer={() => document.body}
        style={{ width: 520, borderRadius: 12, overflow: 'hidden' }}
      >
        <div className='flex flex-col gap-14px text-t-primary'>
          <div className='text-13px leading-20px text-t-secondary'>
            {t('common.collaboration.projects.manageDescription')}
          </div>
          <div className='rd-10px border border-border-1 bg-bg-1 p-12px'>
            <div className='mb-8px text-13px font-700'>{t('common.collaboration.projects.createProject')}</div>
            <div className='flex gap-8px'>
              <Input
                value={projectName}
                maxLength={80}
                placeholder={t('common.collaboration.projects.createNamePlaceholder')}
                disabled={manageProjectsLoading}
                onChange={setProjectName}
                onPressEnter={() => void createManagedProject()}
              />
              <button
                type='button'
                disabled={manageProjectsLoading || !projectName.trim()}
                onClick={() => void createManagedProject()}
                className='h-32px min-w-82px rd-8px bg-[#18181b] px-12px text-13px font-700 text-white transition-colors hover:bg-[#2f2f33] disabled:cursor-not-allowed disabled:opacity-45'
              >
                {manageProjectsLoading ? t('common.processing') : t('common.collaboration.projects.createProject')}
              </button>
            </div>
          </div>
          <div className='rd-10px border border-border-1 bg-bg-1 p-12px'>
            <div className='mb-8px flex items-center justify-between gap-8px'>
              <div className='text-13px font-700'>{t('common.collaboration.projects.existingProjects')}</div>
              <button
                type='button'
                disabled={syncProjectsLoading}
                onClick={() => void syncProjectTasklists()}
                className='h-28px rd-7px border border-border-2 bg-bg-2 px-9px text-12px font-600 text-t-secondary transition-colors hover:bg-fill-1 hover:text-t-primary disabled:cursor-not-allowed disabled:opacity-50'
              >
                <span className='inline-flex items-center gap-5px'>
                  <Refresh theme='outline' size={13} />
                  {syncProjectsLoading ? t('common.processing') : t('common.refresh')}
                </span>
              </button>
            </div>
            <div className='max-h-260px overflow-y-auto pr-2px'>
              {managedTasklists.length === 0 ? (
                <div className='py-16px text-center text-12px text-t-tertiary'>
                  {t('common.collaboration.projects.noExistingProjects')}
                </div>
              ) : (
                managedTasklists.map((tasklist) => (
                  <div
                    key={tasklist.guid}
                    className='flex items-center gap-10px border-b border-border-1/70 py-9px last:border-b-0'
                  >
                    <CollaborationIcon name='tasklist' size={22} />
                    <div className='min-w-0 flex-1'>
                      <div className='truncate text-13px font-650 text-t-primary'>{tasklist.name}</div>
                      <div className='mt-1px text-11px text-t-tertiary'>
                        {tasklist.visible
                          ? t('common.collaboration.projects.projectVisible')
                          : t('common.collaboration.projects.projectHidden')}
                      </div>
                    </div>
                    <button
                      type='button'
                      disabled={manageProjectsLoading}
                      onClick={() => {
                        if (tasklist.visible) {
                          setManageProjectsVisible(false);
                          onNavigate(`/lark-projects/${encodeBucketId(`tasklist:${tasklist.guid}`)}`);
                        } else {
                          void restoreTasklistToSidebar(tasklist);
                        }
                      }}
                      className='h-28px min-w-62px rd-7px border border-border-2 bg-bg-2 px-10px text-12px font-650 text-t-primary transition-colors hover:bg-fill-1 disabled:cursor-not-allowed disabled:opacity-50'
                    >
                      {tasklist.visible
                        ? t('common.collaboration.projects.openProject')
                        : t('common.collaboration.projects.restoreProject')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>
      <div className='group/label sider-section-label flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-8px'>
        <span className='text-14px text-t-tertiary sider-section-title group-hover/label:text-t-primary transition-colors font-[500] leading-none'>
          {t('common.collaboration.projectTitle')}
        </span>
        <button
          type='button'
          aria-label={t('common.collaboration.projects.addProject')}
          title={t('common.collaboration.projects.addProject')}
          className='ml-auto hidden size-22px flex-center rd-6px text-t-tertiary transition-colors hover:bg-fill-2 hover:text-t-primary group-hover/label:flex'
          onClick={() => setManageProjectsVisible(true)}
        >
          <Plus theme='outline' size={15} />
        </button>
      </div>
      <div className='px-8px flex flex-col gap-2px'>
        {tasklistBuckets.length === 0 && larkImConversations.length === 0 ? (
          <div className='px-10px py-6px text-12px text-t-tertiary'>{t('common.collaboration.emptyProjects')}</div>
        ) : null}
        {larkImConversations.length > 0 ? (
          <div className='min-w-0'>
            <SiderItem
              icon={<CollaborationIcon name='message' size={21} />}
              name={larkImAccountName}
              selected={isLarkImGroupSelected}
              pinned={larkImConversations.some(isConversationPinned)}
              menuItems={larkImConversations[0] ? getConversationMenuItems(larkImConversations[0]) : undefined}
              onMenuAction={handleLarkImMenuAction}
              onClick={() => {
                if (firstLarkImConversationId) {
                  onNavigate(`/conversation/${firstLarkImConversationId}`);
                }
              }}
            />
          </div>
        ) : null}
        {tasklistBuckets.map((bucket) => {
          const binding = bucket.tasklistGuid ? bindingsByTasklist.get(bucket.tasklistGuid) : undefined;
          const records = agentRecordsByTasklist.get(bucket.tasklistGuid || '') ?? [];
          const conversations = bucket.tasklistGuid ? (conversationsByTasklist.get(bucket.tasklistGuid) ?? []) : [];
          const leaderConversation =
            conversations.find((conversation) => getProjectExtra(conversation).lark_project_role === 'leader') ??
            (binding?.leaderAgentConversationId
              ? conversations.find((conversation) => conversation.id === binding.leaderAgentConversationId)
              : undefined);
          const leaderConversationId = binding?.leaderAgentConversationId || leaderConversation?.id;
          const leaderExtra = leaderConversation ? getProjectExtra(leaderConversation) : undefined;
          const childConversations = conversations.filter((conversation) => {
            if (conversation.id === leaderConversationId) return false;
            return getProjectExtra(conversation).lark_project_role !== 'leader';
          });
          const childConversationIds = new Set(childConversations.map((conversation) => conversation.id));

          return (
            <div key={bucket.id} className='min-w-0'>
              <SiderItem
                icon={<CollaborationIcon name='tasklist' size={21} />}
                name={bucket.todoCount > 0 ? `${bucket.name} · ${bucket.todoCount}` : bucket.name}
                selected={pathname === `/lark-projects/${encodeBucketId(bucket.id)}`}
                pinned={isTasklistPinned(bucket)}
                menuItems={bucket.tasklistGuid ? getTasklistMenuItems(bucket) : undefined}
                onMenuAction={(key) => handleTasklistMenuAction(key, bucket)}
                onClick={() => onNavigate(`/lark-projects/${encodeBucketId(bucket.id)}`)}
              />
              {bucket.tasklistGuid ? (
                <div className='pl-14px'>
                  <SiderItem
                    icon={<CollaborationIcon name='leaderAgent' size={21} />}
                    name={
                      bindingTasklistGuids.has(bucket.tasklistGuid)
                        ? t('common.collaboration.bindingLeader')
                        : binding?.leaderAgentLabel || t('common.collaboration.leaderAgent')
                    }
                    selected={Boolean(leaderConversationId && pathname === `/conversation/${leaderConversationId}`)}
                    pinned={leaderConversation ? isConversationPinned(leaderConversation) : false}
                    menuItems={leaderConversation ? getConversationMenuItems(leaderConversation) : undefined}
                    onMenuAction={(key) => {
                      if (leaderConversation) handleConversationMenuAction(key, leaderConversation);
                    }}
                    onClick={() => void openLeaderAgent(bucket)}
                  />
                </div>
              ) : null}
              {childConversations.map((conversation) => (
                <div key={conversation.id} className='pl-14px'>
                  <SiderItem
                    icon={<CollaborationIcon name='agentInbox' size={21} />}
                    name={conversation.name || t('common.collaboration.projectAgent')}
                    selected={pathname === `/conversation/${conversation.id}`}
                    pinned={isConversationPinned(conversation)}
                    menuItems={getConversationMenuItems(conversation)}
                    onMenuAction={(key) => handleConversationMenuAction(key, conversation)}
                    onClick={() => onNavigate(`/conversation/${conversation.id}`)}
                  />
                </div>
              ))}
              {records.map((record) => {
                const delegation = delegationsByTaskGuid.get(record.taskGuid);
                const targetName =
                  delegation?.target.name || record.metadata?.targetAgent || t('common.collaboration.projectAgent');
                const recordConversation = record.agentConversationId
                  ? projectConversationsById.get(record.agentConversationId)
                  : undefined;
                const recordName = getTaskRecordDisplayName(record, `${targetName} · ${record.title}`);
                return childConversationIds.has(record.agentConversationId || '') ? null : (
                  <div key={record.id} className='pl-14px'>
                    <SiderItem
                      icon={<CollaborationIcon name='agentInbox' size={21} />}
                      name={recordConversation?.name || recordName}
                      selected={Boolean(record.agentConversationId && pathname === `/conversation/${record.agentConversationId}`)}
                      pinned={recordConversation ? isConversationPinned(recordConversation) : Boolean(record.pinned)}
                      menuItems={recordConversation ? getConversationMenuItems(recordConversation) : getTaskRecordMenuItems(record)}
                      onMenuAction={(key) => handleTaskRecordMenuAction(key, record, recordName, recordConversation)}
                      onClick={() => void openTaskRecord(record)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LarkProjectTaskSiderSection;
