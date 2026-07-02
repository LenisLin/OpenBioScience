/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Empty, Input, Message, Modal, Spin, Tag } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { TeamAgent, TTeam } from '@/common/types/team/teamTypes';
import AgentStatusIcon from '@/renderer/components/icons/AgentStatusIcon';
import CollaborationIcon, { type CollaborationIconName } from '@/renderer/components/icons/CollaborationIcon';
import type {
  ILarkAutomationProjectBucket,
  ILarkAutomationProjectTask,
  ILarkProjectBinding,
  ILarkProjectDocContent,
  ILarkProjectDocKind,
  ILarkProjectDocRecord,
  ILarkProjectDocsBundle,
  ILarkProjectSnapshot,
  IFileMetadata,
  ILarkTaskAttachment,
  ILarkTaskComment,
  ILarkTaskDetail,
} from '@/common/adapter/ipcBridge';
import styles from './LarkProjectsPage.module.css';

type LarkProjectConversationExtra = {
  lark_project_tasklist_guid?: string;
  lark_project_role?: 'leader' | 'agent';
};

const PROJECT_DOCS: Array<{
  kind: ILarkProjectDocKind;
  titleKey: string;
  shortTitleKey: string;
  descriptionKey: string;
  icon: CollaborationIconName;
  shortcut: string;
}> = [
  {
    kind: 'metadata',
    titleKey: 'common.collaboration.projects.docs.metadataTitle',
    shortTitleKey: 'common.collaboration.projects.docs.metadataShort',
    descriptionKey: 'common.collaboration.projects.docs.metadataDesc',
    icon: 'memory',
    shortcut: '⌘1',
  },
  {
    kind: 'staffing',
    titleKey: 'common.collaboration.projects.docs.staffingTitle',
    shortTitleKey: 'common.collaboration.projects.docs.staffingShort',
    descriptionKey: 'common.collaboration.projects.docs.staffingDesc',
    icon: 'humanMember',
    shortcut: '⌘2',
  },
  {
    kind: 'timeline',
    titleKey: 'common.collaboration.projects.docs.timelineTitle',
    shortTitleKey: 'common.collaboration.projects.docs.timelineShort',
    descriptionKey: 'common.collaboration.projects.docs.timelineDesc',
    icon: 'dueTime',
    shortcut: '⌘3',
  },
];

const PROJECT_DOC_CONTENT_CACHE_TTL_MS = 5 * 60 * 1000;

function hasFreshProjectDocContentCache(doc: ILarkProjectDocRecord | undefined): doc is ILarkProjectDocRecord {
  return (
    doc?.contentCache !== undefined &&
    Boolean(doc.contentCachedAt) &&
    Date.now() - (doc.contentCachedAt ?? 0) < PROJECT_DOC_CONTENT_CACHE_TTL_MS
  );
}

function getProjectConversationExtra(conversation: TChatConversation): LarkProjectConversationExtra {
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

function findTeamAgent(team: TTeam | null | undefined, slotId?: string): TeamAgent | undefined {
  if (!team) return undefined;
  if (slotId) {
    const agent = team.agents.find((item) => item.slot_id === slotId);
    if (agent) return agent;
  }
  return team.agents.find((agent) => agent.slot_id === team.leader_agent_id) ?? team.agents.find((agent) => agent.role === 'leader');
}

const ModalCloseButton: React.FC<{
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}> = ({ disabled, onClick, className }) => {
  const { t } = useTranslation();
  const closeLabel = t('common.close', { defaultValue: 'Close' });
  return (
    <button
      type='button'
      className={[styles.modalIconClose, className].filter(Boolean).join(' ')}
      aria-label={closeLabel}
      title={closeLabel}
      disabled={disabled}
      onClick={onClick}
    >
      <AgentStatusIcon name='closeOne' size={24} />
    </button>
  );
};

function encodeBucketId(bucketId: string): string {
  return encodeURIComponent(bucketId);
}

function decodeBucketId(bucketId?: string): string {
  if (!bucketId) return 'agent';
  try {
    return decodeURIComponent(bucketId);
  } catch {
    return 'agent';
  }
}

function formatDate(value?: string): string {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString();
}

function formatTimestamp(value?: number): string {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

function padDatePart(part: number): string {
  return String(part).padStart(2, '0');
}

function formatDateTimeInput(value?: number | string): string {
  if (!value) return '';
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function parseDateTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = new Date(trimmed).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatBytes(value?: number): string {
  if (!value || !Number.isFinite(value)) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabel(task: ILarkAutomationProjectTask, t: ReturnType<typeof useTranslation>['t']): string {
  if (task.completed) return t('common.collaboration.projects.task.statusCompleted');
  if (task.status === 'todo') return t('common.collaboration.projects.task.statusTodo');
  return task.status || t('common.collaboration.projects.task.statusFallback');
}

function isLikelyId(value?: string): boolean {
  return Boolean(value && /^(ou_|oc_|om_|cli_|[0-9a-f-]{18,})/i.test(value));
}

function displayName(value?: string, fallback = 'Collaborator'): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return isLikelyId(trimmed) ? fallback : trimmed;
}

function displayMemberName(member?: { id?: string; name?: string }, fallback = 'Collaborator'): string {
  return displayName(member?.name, fallback);
}

function isImagePath(pathOrName: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(pathOrName);
}

function fileBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function attachmentKindLabel(attachment: ILarkTaskAttachment, t: ReturnType<typeof useTranslation>['t']): string {
  if (isImagePath(attachment.name)) return t('common.collaboration.projects.task.image');
  return attachment.resource?.type ? t('common.collaboration.projects.task.attachment') : t('common.collaboration.projects.task.file');
}

function attachmentMetaText(attachment: ILarkTaskAttachment, t: ReturnType<typeof useTranslation>['t']): string {
  const parts = [
    attachmentKindLabel(attachment, t),
    formatBytes(attachment.size),
    attachment.uploader
      ? t('common.collaboration.projects.task.uploader', {
          name: displayMemberName(attachment.uploader, t('common.collaboration.projects.task.collaborator')),
        })
      : undefined,
    formatTimestamp(attachment.uploadedAt),
  ].filter(Boolean);
  return parts.join(' · ') || t('common.collaboration.projects.task.attachment');
}

const LarkProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { bucketId } = useParams<{ bucketId?: string }>();
  const activeBucketId = decodeBucketId(bucketId);
  const [buckets, setBuckets] = useState<ILarkAutomationProjectBucket[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [projectAgentSnapshot, setProjectAgentSnapshot] = useState<ILarkProjectSnapshot | null>(null);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ILarkAutomationProjectTask | null>(null);
  const [projectDocsBundle, setProjectDocsBundle] = useState<ILarkProjectDocsBundle | null>(null);
  const [projectDocsLoading, setProjectDocsLoading] = useState(false);
  const [projectDocsError, setProjectDocsError] = useState<string | undefined>();
  const [editingDocKind, setEditingDocKind] = useState<ILarkProjectDocKind | null>(null);

  const loadProjects = useCallback(async (force = false) => {
    if (force) {
      setSyncing(true);
    } else {
      setLoading(true);
    }
    try {
      const [result, snapshot] = await Promise.all([
        force ? ipcBridge.larkAutomation.syncProjects.invoke(undefined) : ipcBridge.larkAutomation.getProjects.invoke(),
        ipcBridge.larkProjectAgent.getSnapshot.invoke().catch((): null => null),
      ]);
      const nextBuckets = result.buckets ?? [];
      setBuckets(nextBuckets);
      setProjectAgentSnapshot(snapshot);
      setSyncedAt(result.syncedAt);
      setError(result.ok ? undefined : result.error);
      if (!result.ok && result.error) {
        Message.warning(result.fromCache ? t('common.collaboration.projects.cacheWarning', { error: result.error }) : result.error);
      }
      if (!force && nextBuckets.length === 0) {
        void ipcBridge.larkAutomation.syncProjects
          .invoke(undefined)
          .then((fresh) => {
            setBuckets(fresh.buckets ?? []);
            setSyncedAt(fresh.syncedAt);
            setError(fresh.ok ? undefined : fresh.error);
          })
          .catch((rawError: unknown) => {
            setError(rawError instanceof Error ? rawError.message : String(rawError));
          });
      }
    } catch (rawError) {
      const message = rawError instanceof Error ? rawError.message : String(rawError);
      setError(message);
      Message.error(message);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [t]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const activeBucket = useMemo(() => {
    const hiddenTasklistGuids = new Set(projectAgentSnapshot?.hiddenTasklistGuids ?? []);
    const visibleBuckets = buckets.filter((bucket) => !hiddenTasklistGuids.has(bucket.tasklistGuid || ''));
    return visibleBuckets.find((bucket) => bucket.id === activeBucketId) ?? visibleBuckets[0];
  }, [activeBucketId, buckets, projectAgentSnapshot?.hiddenTasklistGuids]);

  const activeBinding: ILarkProjectBinding | undefined = useMemo(() => {
    if (!activeBucket?.tasklistGuid) return undefined;
    return projectAgentSnapshot?.bindings.find((binding) => binding.tasklistGuid === activeBucket.tasklistGuid);
  }, [activeBucket?.tasklistGuid, projectAgentSnapshot?.bindings]);

  const ensureProjectDocsForActiveBucket = useCallback(
    async (forceMessage = false) => {
      if (!activeBucket?.tasklistGuid || activeBucket.kind !== 'tasklist') {
        setProjectDocsBundle(null);
        setProjectDocsError(undefined);
        return null;
      }
      setProjectDocsLoading(true);
      setProjectDocsError(undefined);
      try {
        const bundle = await ipcBridge.larkProjectAgent.ensureProjectDocs.invoke({
          tasklistGuid: activeBucket.tasklistGuid,
          tasklistName: activeBucket.name,
        });
        if (bundle.ok === false) {
          throw new Error(bundle.error || t('common.collaboration.projects.docs.syncFailed'));
        }
        setProjectDocsBundle(bundle);
        if (forceMessage) Message.success(t('common.collaboration.projects.docs.ready'));
        const snapshot = await ipcBridge.larkProjectAgent.getSnapshot.invoke().catch((): null => null);
        if (snapshot) setProjectAgentSnapshot(snapshot);
        return bundle;
      } catch (rawError) {
        const message = rawError instanceof Error ? rawError.message : String(rawError);
        setProjectDocsError(message);
        if (forceMessage) Message.error(message);
        return null;
      } finally {
        setProjectDocsLoading(false);
      }
    },
    [activeBucket?.kind, activeBucket?.name, activeBucket?.tasklistGuid, t]
  );

  useEffect(() => {
    setProjectDocsBundle(null);
    setProjectDocsError(undefined);
    if (!activeBucket?.tasklistGuid || activeBucket.kind !== 'tasklist') return;
    void ensureProjectDocsForActiveBucket(false);
  }, [activeBucket?.id, activeBucket?.kind, activeBucket?.tasklistGuid, ensureProjectDocsForActiveBucket]);

  useEffect(() => {
    if (!activeBucket?.tasklistGuid || activeBucket.kind !== 'tasklist' || !projectDocsBundle?.docs.length) return;
    const cancelled = { value: false };
    void Promise.all(
      PROJECT_DOCS.map((spec) =>
        ipcBridge.larkProjectAgent.getProjectDoc
          .invoke({
            tasklistGuid: activeBucket.tasklistGuid as string,
            tasklistName: activeBucket.name,
            kind: spec.kind,
          })
          .then((content) => {
            if (cancelled.value || content.ok === false) return;
            setProjectDocsBundle((previous) => {
              if (!previous || previous.tasklistGuid !== activeBucket.tasklistGuid) return previous;
              return {
                ...previous,
                docs: previous.docs.map((doc) => (doc.kind === content.doc.kind ? content.doc : doc)),
                ensuredAt: Date.now(),
              };
            });
          })
          .catch((): undefined => undefined)
      )
    );
    return () => {
      cancelled.value = true;
    };
  }, [activeBucket?.kind, activeBucket?.name, activeBucket?.tasklistGuid, projectDocsBundle?.docs.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeBucket?.tasklistGuid || activeBucket.kind !== 'tasklist') return;
      if (!event.metaKey && !event.ctrlKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || target.isContentEditable) return;
      }
      const index = Number(event.key) - 1;
      const spec = PROJECT_DOCS[index];
      if (!spec) return;
      event.preventDefault();
      setEditingDocKind(spec.kind);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeBucket?.kind, activeBucket?.tasklistGuid]);

  useEffect(() => {
    if (!buckets.length || !activeBucket) return;
    if (activeBucket.id !== activeBucketId) {
      navigate(`/lark-projects/${encodeBucketId(activeBucket.id)}`, { replace: true });
    }
  }, [activeBucket, activeBucketId, buckets.length, navigate]);

  const taskGroups = useMemo(() => {
    const tasks = activeBucket?.tasks ?? [];
    return {
      todo: tasks.filter((task) => !task.completed),
      done: tasks.filter((task) => task.completed),
    };
  }, [activeBucket?.tasks]);

  const openTeamConversation = useCallback(
    async (teamId?: string, slotId?: string): Promise<boolean> => {
      if (!teamId) return false;
      const team = await ipcBridge.team.get.invoke({ id: teamId }).catch((): TTeam | null => null);
      const agent = findTeamAgent(team, slotId);
      if (!agent?.conversation_id) return false;
      navigate(`/conversation/${agent.conversation_id}`);
      return true;
    },
    [navigate]
  );

  const findLeaderConversationForActiveProject = useCallback(
    async (binding: ILarkProjectBinding | undefined): Promise<TChatConversation | null> => {
      const tasklistGuid = activeBucket?.tasklistGuid;
      if (!tasklistGuid) return null;
      let staleLeaderConversationId: string | undefined;
      if (binding?.leaderAgentConversationId) {
        const existingConversation = await ipcBridge.conversation.get
          .invoke({ id: binding.leaderAgentConversationId })
          .catch((): TChatConversation | null => null);
        if (existingConversation?.id) return existingConversation;
        staleLeaderConversationId = binding.leaderAgentConversationId;
      }
      const conversations = await ipcBridge.database.getUserConversations
        .invoke({ limit: 10000 })
        .catch((): { items: TChatConversation[] } => ({ items: [] }));
      const leaderConversation = (conversations.items ?? [])
        .filter((conversation) => {
          const extra = getProjectConversationExtra(conversation);
          return extra.lark_project_tasklist_guid === tasklistGuid && extra.lark_project_role === 'leader';
        })
        .toSorted((a, b) => getConversationModifiedAt(b) - getConversationModifiedAt(a))[0];
      if (leaderConversation?.id && (!binding || binding.leaderAgentConversationId !== leaderConversation.id)) {
        const attachResult = await ipcBridge.larkProjectAgent.attachConversation
          .invoke({
            conversationId: leaderConversation.id,
            role: 'leader',
            bindingId: binding?.id,
            tasklistGuid,
            tasklistName: binding?.tasklistName || activeBucket?.name,
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
        const snapshot = await ipcBridge.larkProjectAgent.getSnapshot.invoke().catch((): null => null);
        if (snapshot) setProjectAgentSnapshot(snapshot);
      }
      return leaderConversation ?? null;
    },
    [activeBucket?.name, activeBucket?.tasklistGuid]
  );

  const openLeaderAgentForActiveProject = useCallback(
    async (binding: ILarkProjectBinding | undefined) => {
      if (!activeBucket?.tasklistGuid) {
        Message.warning(t('common.collaboration.projects.agentInboxWarning'));
        return;
      }
      setBindingLoading(true);
      try {
        if (await openTeamConversation(binding?.teamId, binding?.leaderSlotId)) {
          return;
        }

        const result = binding
          ? {
              binding,
              leaderPrompt:
                binding.leaderAgentPendingPrompt ||
                t('guid.larkProject.leaderInitialPrompt', { tasklistName: binding.tasklistName || activeBucket.name }),
            }
          : await ipcBridge.larkProjectAgent.bindLeaderAgent.invoke({
              tasklistGuid: activeBucket.tasklistGuid,
              tasklistName: activeBucket.name,
              projectTitle: activeBucket.name,
              leaderAgentLabel: t('common.collaboration.leaderAgent'),
            });
        const refreshedBinding = result.binding;
        if (await openTeamConversation(refreshedBinding.teamId, refreshedBinding.leaderSlotId)) {
          return;
        }

        const conversationAfterBind = await findLeaderConversationForActiveProject(refreshedBinding);
        if (conversationAfterBind?.id) {
          navigate(`/conversation/${conversationAfterBind.id}`);
          return;
        }
        if (refreshedBinding.leaderAgentConversationId) {
          navigate(`/conversation/${refreshedBinding.leaderAgentConversationId}`);
          return;
        }
        if (!binding) {
          Message.success(t('common.collaboration.projects.planDraftCreated'));
          setProjectAgentSnapshot(await ipcBridge.larkProjectAgent.getSnapshot.invoke());
        }
        navigate('/guid', {
          state: {
            larkProjectContext: {
              role: 'leader',
              bindingId: refreshedBinding.id,
              tasklistGuid: refreshedBinding.tasklistGuid,
              tasklistName: refreshedBinding.tasklistName,
              leaderPrompt: result.leaderPrompt,
            },
          },
        });
      } catch (rawError) {
        const message = rawError instanceof Error ? rawError.message : String(rawError);
        Message.error(message);
      } finally {
        setBindingLoading(false);
      }
    },
    [activeBucket?.name, activeBucket?.tasklistGuid, findLeaderConversationForActiveProject, navigate, openTeamConversation, t]
  );

  const handleBindLeaderAgent = useCallback(async () => {
    await openLeaderAgentForActiveProject(activeBinding);
  }, [activeBinding, openLeaderAgentForActiveProject]);

  const handleCreateProjectConversation = useCallback(() => {
    if (!activeBucket?.tasklistGuid || activeBucket.kind !== 'tasklist') {
      Message.warning(t('common.collaboration.projects.chooseTasklistWarning'));
      return;
    }
    navigate('/guid', {
      state: {
        larkProjectContext: {
          role: 'agent',
          tasklistGuid: activeBucket.tasklistGuid,
          tasklistName: activeBucket.name,
          locked: true,
        },
      },
    });
  }, [activeBucket?.kind, activeBucket?.name, activeBucket?.tasklistGuid, navigate, t]);

  return (
    <div className='size-full min-w-0 min-h-0 bg-bg-1 flex flex-col'>
      <div className='shrink-0 px-28px py-18px border-0 border-b border-solid border-border-1 flex items-center justify-between gap-16px'>
        <div className='min-w-0'>
          <h1 className='m-0 text-22px font-650 text-t-primary'>{t('common.collaboration.projects.pageTitle')}</h1>
          <div className='mt-4px text-13px text-t-secondary truncate'>
            {activeBucket
              ? `${activeBucket.name} · ${t('common.collaboration.projects.todoCount', { count: activeBucket.todoCount })}`
              : t('common.collaboration.projects.empty')}
            {syncedAt ? ` · ${new Date(syncedAt).toLocaleTimeString()} ${t('common.collaboration.projects.synced')}` : ''}
          </div>
        </div>
        <Button
          icon={<CollaborationIcon name='refreshSync' size={20} spin={syncing} />}
          loading={syncing}
          onClick={() => void loadProjects(true)}
        >
          {t('common.collaboration.projects.refresh')}
        </Button>
      </div>

      {loading ? (
        <div className='flex-1 flex-center'>
          <Spin tip={t('common.collaboration.projects.loading')} />
        </div>
      ) : !activeBucket ? (
        <div className='flex-1 flex-center px-28px'>
          <Empty description={error || t('common.collaboration.projects.empty')} />
        </div>
      ) : (
        <div className='flex-1 min-h-0 overflow-y-auto px-28px py-22px'>
          <div className='max-w-1180px mx-auto flex flex-col gap-18px'>
            <section className='border border-border-1 bg-bg-2 rd-8px p-18px'>
              <div className='flex items-start justify-between gap-16px'>
                <div className='min-w-0 flex items-start gap-12px'>
                  <span className='size-44px flex-center text-t-primary shrink-0'>
                    <CollaborationIcon name={activeBucket.kind === 'agent' ? 'agentInbox' : 'tasklist'} size={36} />
                  </span>
                  <div className='min-w-0'>
                    <div className='text-18px font-650 text-t-primary truncate'>{activeBucket.name}</div>
                    <div className='mt-4px text-13px text-t-secondary leading-20px'>
                      {activeBucket.kind === 'agent'
                        ? t('common.collaboration.projects.agentBucketHint')
                        : t('common.collaboration.projects.syncedTasklistsHint')}
                    </div>
                  </div>
                </div>
                {activeBucket.kind === 'tasklist' && activeBucket.tasklistGuid ? (
                  <Button
                    size='small'
                    icon={<CollaborationIcon name='message' size={20} />}
                    onClick={handleCreateProjectConversation}
                  >
                    {t('common.collaboration.projects.conversationButton')}
                  </Button>
                ) : null}
              </div>
              <div className='mt-16px grid grid-cols-3 gap-10px'>
                <Metric icon='tasklist' label={t('common.collaboration.projects.all')} value={activeBucket.taskCount} />
                <Metric icon='taskAutomation' label={t('common.collaboration.projects.todo')} value={activeBucket.todoCount} />
                <Metric icon='complete' label={t('common.collaboration.projects.done')} value={activeBucket.doneCount} />
              </div>
              {activeBucket.kind === 'tasklist' ? (
                <ProjectDocsStrip
                  docs={projectDocsBundle?.docs ?? activeBinding?.projectDocs ?? []}
                  loading={projectDocsLoading}
                  error={projectDocsError}
                  onEnsure={() => void ensureProjectDocsForActiveBucket(true)}
                  onOpen={(kind) => setEditingDocKind(kind)}
                />
              ) : null}
            </section>

            {activeBucket.kind === 'tasklist' ? (
              <section className='border border-border-1 bg-bg-2 rd-8px p-18px flex items-start justify-between gap-16px'>
                <div className='min-w-0'>
                  <div className='flex items-center gap-8px flex-wrap'>
                    <div className='text-16px font-650 text-t-primary'>{t('common.collaboration.projects.leaderAgent')}</div>
                    <Tag size='small' color={activeBinding ? 'green' : 'gray'}>
                      {activeBinding
                        ? activeBinding.state === 'planning'
                          ? t('common.collaboration.projects.planning')
                          : activeBinding.state
                        : t('common.collaboration.projects.unbound')}
                    </Tag>
                  </div>
                  <div className='mt-6px text-13px text-t-secondary leading-21px'>
                    {activeBinding
                      ? t('common.collaboration.projects.leaderBoundDesc')
                      : t('common.collaboration.projects.leaderUnboundDesc')}
                  </div>
                </div>
                {activeBinding ? (
                  <Button
                    type='primary'
                    className='collaboration-light-primary'
                    icon={<CollaborationIcon name='leaderAgent' size={21} />}
                    loading={bindingLoading}
                    onClick={() => void openLeaderAgentForActiveProject(activeBinding)}
                  >
                    {t('common.collaboration.projects.openLeaderAgent')}
                  </Button>
                ) : (
                  <Button
                    type='primary'
                    className='collaboration-light-primary'
                    loading={bindingLoading}
                    icon={<CollaborationIcon name='leaderAgent' size={21} />}
                    onClick={handleBindLeaderAgent}
                  >
                    {t('common.collaboration.projects.bindLeaderAgent')}
                  </Button>
                )}
              </section>
            ) : null}

            <TaskSection title={t('common.collaboration.projects.sections.todo')} tasks={taskGroups.todo} onOpenTask={setSelectedTask} />
            <TaskSection title={t('common.collaboration.projects.sections.done')} tasks={taskGroups.done} muted onOpenTask={setSelectedTask} />
          </div>
        </div>
      )}
      <LarkTaskDetailModal
        task={selectedTask}
        visible={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
      />
      <ProjectDocEditorModal
        visible={Boolean(editingDocKind)}
        kind={editingDocKind}
        bucket={activeBucket}
        cachedDoc={projectDocsBundle?.docs.find((doc) => doc.kind === editingDocKind) ?? activeBinding?.projectDocs?.find((doc) => doc.kind === editingDocKind)}
        onClose={() => setEditingDocKind(null)}
        onSaved={(doc) => {
          setProjectDocsBundle((previous) => {
            if (!previous) return previous;
            return {
              ...previous,
              docs: previous.docs.map((item) => (item.kind === doc.kind ? doc : item)),
              ensuredAt: Date.now(),
            };
          });
        }}
      />
    </div>
  );
};

const Metric: React.FC<{ icon: CollaborationIconName; label: string; value: number }> = ({ icon, label, value }) => (
  <div className='rd-8px bg-bg-1 border border-border-1 p-12px'>
    <div className='text-12px text-t-tertiary flex items-center gap-6px'>
      <CollaborationIcon name={icon} size={21} />
      <span>{label}</span>
    </div>
    <div className='mt-4px text-22px font-650 text-t-primary'>{value}</div>
  </div>
);

const ProjectDocsStrip: React.FC<{
  docs: ILarkProjectDocRecord[];
  loading: boolean;
  error?: string;
  onEnsure: () => void;
  onOpen: (kind: ILarkProjectDocKind) => void;
}> = ({ docs, loading, error, onEnsure, onOpen }) => {
  const { t } = useTranslation();
  const docsByKind = new Map(docs.map((doc) => [doc.kind, doc]));
  return (
    <div className={styles.projectDocsStrip}>
      <div className={styles.projectDocsHeader}>
        <span>
          <CollaborationIcon name='docs' size={23} />
          {t('common.collaboration.projects.docs.stripTitle')}
        </span>
        <button className={styles.projectDocsEnsure} type='button' onClick={onEnsure} disabled={loading}>
          {loading ? t('common.collaboration.projects.docs.syncing') : t('common.collaboration.projects.docs.ensure')}
        </button>
      </div>
      <div className={styles.projectDocButtons}>
        {PROJECT_DOCS.map((spec) => {
          const doc = docsByKind.get(spec.kind);
          return (
            <button
              className={styles.projectDocButton}
              data-ready={Boolean(doc)}
              key={spec.kind}
              type='button'
              onClick={() => onOpen(spec.kind)}
            >
              <span className={styles.projectDocIcon}>
                <CollaborationIcon name={spec.icon} size={28} />
              </span>
              <span className={styles.projectDocText}>
                <strong>{t(spec.titleKey)}</strong>
                <small>{doc ? t(spec.descriptionKey) : t('common.collaboration.projects.docs.notCreated')}</small>
              </span>
              <kbd>{spec.shortcut}</kbd>
            </button>
          );
        })}
      </div>
      {error ? (
        <div className={styles.projectDocsError}>
          <CollaborationIcon name='notification' size={20} />
          {t('common.collaboration.projects.docs.errorPrefix', { error })}
        </div>
      ) : null}
    </div>
  );
};

const ProjectDocEditorModal: React.FC<{
  visible: boolean;
  kind: ILarkProjectDocKind | null;
  bucket?: ILarkAutomationProjectBucket;
  cachedDoc?: ILarkProjectDocRecord;
  onClose: () => void;
  onSaved: (doc: ILarkProjectDocRecord) => void;
}> = ({ visible, kind, bucket, cachedDoc, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [docContent, setDocContent] = useState<ILarkProjectDocContent | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const openedDocKeyRef = useRef<string | null>(null);
  const spec = PROJECT_DOCS.find((item) => item.kind === kind);
  const canUse = Boolean(kind && bucket?.tasklistGuid);
  const docKey = kind && bucket?.tasklistGuid ? `${bucket.tasklistGuid}:${kind}` : null;
  const dirty = docContent ? draft !== docContent.content : false;

  const loadDoc = useCallback(async () => {
    if (!kind || !bucket?.tasklistGuid) return;
    if (hasFreshProjectDocContentCache(cachedDoc)) {
      setDocContent({
        doc: cachedDoc,
        content: cachedDoc.contentCache,
        fetchedAt: cachedDoc.contentCachedAt,
      });
      setDraft(cachedDoc.contentCache);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const content = await ipcBridge.larkProjectAgent.getProjectDoc.invoke({
        tasklistGuid: bucket.tasklistGuid,
        tasklistName: bucket.name,
        kind,
      });
      if (content.ok === false) {
        throw new Error(content.error || t('common.collaboration.projects.docs.readFailed'));
      }
      setDocContent(content);
      setDraft(content.content);
    } catch (rawError) {
      const message = rawError instanceof Error ? rawError.message : String(rawError);
      Message.error(message);
      setDocContent(null);
      setDraft('');
    } finally {
      setLoading(false);
    }
  }, [bucket?.name, bucket?.tasklistGuid, cachedDoc, kind, t]);

  useEffect(() => {
    if (!visible) {
      openedDocKeyRef.current = null;
      setDocContent(null);
      setDraft('');
      setLoading(false);
      setSaving(false);
      return;
    }
    if (!docKey || openedDocKeyRef.current === docKey) return;
    openedDocKeyRef.current = docKey;
    void loadDoc();
  }, [docKey, loadDoc, visible]);

  const handleSave = useCallback(async () => {
    if (!kind || !bucket?.tasklistGuid) return;
    setSaving(true);
    try {
      const result = await ipcBridge.larkProjectAgent.saveProjectDoc.invoke({
        tasklistGuid: bucket.tasklistGuid,
        tasklistName: bucket.name,
        kind,
        content: draft,
      });
      if (result.ok === false) {
        throw new Error(result.error || t('common.collaboration.projects.docs.saveFailed'));
      }
      setDocContent({
        doc: result.doc,
        content: draft,
        fetchedAt: result.savedAt,
      });
      onSaved(result.doc);
      Message.success(t('common.collaboration.projects.docs.saved'));
    } catch (rawError) {
      const message = rawError instanceof Error ? rawError.message : String(rawError);
      Message.error(message);
    } finally {
      setSaving(false);
    }
  }, [bucket?.name, bucket?.tasklistGuid, draft, kind, onSaved, t]);

  const activeDoc = docContent?.doc ?? cachedDoc;

  return (
    <Modal
      visible={visible}
      footer={null}
      title={null}
      className={styles.projectDocModal}
      maskClosable={!saving}
      escToExit={!saving}
      closable={false}
      unmountOnExit
      onCancel={() => {
        if (!saving) onClose();
      }}
      style={{ width: 'min(1120px, calc(100vw - 36px))' }}
    >
      <div className={styles.projectDocShell}>
        <ModalCloseButton disabled={saving} onClick={onClose} />
        <header className={styles.projectDocHeader}>
          <div className={styles.projectDocTitleBlock}>
            <span className={styles.projectDocTitleIcon}>
              <CollaborationIcon name={spec?.icon ?? 'docs'} size={38} />
            </span>
            <div>
              <h2>{spec ? t(spec.titleKey) : t('common.collaboration.projects.docs.detailTitle')}</h2>
              <p>{spec ? t(spec.descriptionKey) : t('common.collaboration.projects.docs.detailDesc')}</p>
            </div>
          </div>
          <div className={styles.projectDocHeaderActions}>
            {activeDoc?.url ? (
              <Button
                icon={<CollaborationIcon name='openOriginal' size={20} />}
                onClick={() => void ipcBridge.larkAutomation.openExternal.invoke({ url: activeDoc.url as string })}
              >
                {t('common.collaboration.projects.docs.original')}
              </Button>
            ) : null}
            <Button loading={loading} icon={<CollaborationIcon name='refreshSync' size={20} spin={loading} />} onClick={() => void loadDoc()}>
              {t('common.collaboration.projects.docs.reread')}
            </Button>
            <Button
              type='primary'
              className='collaboration-light-primary'
              loading={saving}
              disabled={!canUse || loading || !dirty}
              icon={<CollaborationIcon name='channelSave' size={20} />}
              onClick={() => void handleSave()}
            >
              {t('common.collaboration.projects.docs.save')}
            </Button>
          </div>
        </header>
        <div className={styles.projectDocMeta}>
          <span>{bucket?.name || t('common.collaboration.projects.docs.collaborationProject')}</span>
          <span>{activeDoc?.fileName || (spec ? t(spec.titleKey) : 'Markdown')}</span>
          <span>
            {activeDoc?.updatedAt
              ? `${new Date(activeDoc.updatedAt).toLocaleTimeString()} ${t('common.collaboration.projects.synced')}`
              : t('common.collaboration.projects.docs.waitingSync')}
          </span>
        </div>
        <div className={styles.projectDocEditorWrap}>
          {loading ? (
            <div className={styles.projectDocLoading}>
              <Spin tip={t('common.collaboration.projects.docs.reading')} />
            </div>
          ) : (
            <Input.TextArea
              className={styles.projectDocTextarea}
              value={draft}
              onChange={setDraft}
              placeholder={t('common.collaboration.projects.docs.placeholder')}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

const TaskSection: React.FC<{
  title: string;
  tasks: ILarkAutomationProjectTask[];
  muted?: boolean;
  onOpenTask: (task: ILarkAutomationProjectTask) => void;
}> = ({
  title,
  tasks,
  muted,
  onOpenTask,
}) => {
  if (!tasks.length) return null;
  return (
    <section className='flex flex-col gap-10px'>
      <div className='text-14px font-650 text-t-secondary'>{title}</div>
      {tasks.map((task) => (
        <TaskCard key={task.guid} task={task} muted={muted} onOpenTask={onOpenTask} />
      ))}
    </section>
  );
};

export const TaskCard: React.FC<{
  task: ILarkAutomationProjectTask;
  muted?: boolean;
  onOpenTask: (task: ILarkAutomationProjectTask) => void;
}> = ({ task, muted, onOpenTask }) => {
  const { t } = useTranslation();
  return (
    <article
      className='rd-8px border border-border-1 bg-bg-2 p-14px flex items-start justify-between gap-14px cursor-pointer transition-colors hover:bg-fill-1'
      onClick={() => onOpenTask(task)}
    >
      <div className='min-w-0'>
        <div className='flex items-center gap-8px flex-wrap'>
          <span className={`text-15px font-650 inline-flex items-center gap-7px min-w-0 ${muted ? 'text-t-secondary' : 'text-t-primary'}`}>
            <CollaborationIcon name={task.isAgentTask ? 'agentInbox' : 'taskDetail'} size={21} />
            <span className='truncate'>{task.summary}</span>
          </span>
          <Tag size='small' color={task.completed ? 'green' : 'arcoblue'}>
            {statusLabel(task, t)}
          </Tag>
          {task.isAgentTask ? (
            <Tag size='small' color='purple'>
              Agent
            </Tag>
          ) : null}
          {task.autoCreated ? (
            <Tag size='small' color='orange'>
              {t('common.collaboration.projects.task.autoCreated')}
            </Tag>
          ) : null}
        </div>
        <div className='mt-6px text-12px text-t-tertiary leading-20px'>
          {task.tasklistNames.length
            ? t('common.collaboration.projects.task.listLabel', { name: task.tasklistNames.join(' / ') })
            : t('common.collaboration.projects.task.listLabel', { name: t('common.collaboration.projects.task.listAgent') })}
          {task.createdAt ? ` · ${t('common.collaboration.projects.task.createdLabel', { date: formatDate(task.createdAt) })}` : ''}
          {task.dueAt ? ` · ${t('common.collaboration.projects.task.dueLabel', { date: formatDate(task.dueAt) })}` : ''}
        </div>
        {task.description ? (
          <div className='mt-8px text-13px text-t-secondary leading-21px line-clamp-2 whitespace-pre-wrap'>
            {task.description}
          </div>
        ) : null}
      </div>
      {task.url ? (
        <Button
          size='small'
          type='secondary'
          icon={<CollaborationIcon name='openOriginal' size={20} />}
          onClick={(event) => {
            event.stopPropagation();
            onOpenTask(task);
          }}
        >
          {t('common.collaboration.projects.task.open')}
        </Button>
      ) : null}
    </article>
  );
};

function mergeSubmittedTaskDetail(
  detail: ILarkTaskDetail,
  submitted?: {
    comments?: ILarkTaskComment[];
    attachments?: ILarkTaskAttachment[];
  }
): ILarkTaskDetail {
  if (!submitted?.comments?.length && !submitted?.attachments?.length) return detail;

  const existingCommentIds = new Set(detail.comments.map((comment) => comment.id));
  const appendedComments = (submitted.comments ?? []).filter((comment) => !existingCommentIds.has(comment.id));
  const existingAttachmentGuids = new Set(detail.attachments.map((attachment) => attachment.guid));
  const prependedAttachments = (submitted.attachments ?? []).filter(
    (attachment) => !existingAttachmentGuids.has(attachment.guid)
  );

  return {
    ...detail,
    comments: [...detail.comments, ...appendedComments],
    attachments: [...prependedAttachments, ...detail.attachments],
  };
}

export const LarkTaskDetailModal: React.FC<{
  task: ILarkAutomationProjectTask | null;
  visible: boolean;
  onClose: () => void;
}> = ({ task, visible, onClose }) => {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ILarkTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [attachmentComment, setAttachmentComment] = useState('');
  const [pendingFiles, setPendingFiles] = useState<IFileMetadata[]>([]);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [updatingCompletion, setUpdatingCompletion] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [dueDraft, setDueDraft] = useState('');
  const [dueSavedAt, setDueSavedAt] = useState<number | null>(null);
  const isMutating = submittingComment || uploadingAttachment || updatingCompletion || savingTask;

  const loadDetail = useCallback(async () => {
    if (!task?.guid) return;
    setLoading(true);
    try {
      const nextDetail = await ipcBridge.larkProjectAgent.getTaskDetail.invoke({ taskGuid: task.guid });
      setDetail(nextDetail);
    } catch (rawError) {
      const message = rawError instanceof Error ? rawError.message : String(rawError);
      Message.error(message);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [task?.guid]);

  const refreshDetailAfterMutation = useCallback(
    async (submitted: { comments?: ILarkTaskComment[]; attachments?: ILarkTaskAttachment[] }) => {
      if (!task?.guid) return;
      try {
        const nextDetail = await ipcBridge.larkProjectAgent.getTaskDetail.invoke({ taskGuid: task.guid });
        setDetail(mergeSubmittedTaskDetail(nextDetail, submitted));
      } catch {
        // The mutation already succeeded. Keep the optimistic row visible if the
        // immediate readback is delayed or temporarily unavailable.
      }
    },
    [task?.guid]
  );

  useEffect(() => {
    if (!visible) {
      setDetail(null);
      setCommentText('');
      setAttachmentComment('');
      setPendingFiles([]);
      setDueDraft('');
      setDueSavedAt(null);
      return;
    }
    void loadDetail();
  }, [loadDetail, visible]);

  const mergedTask = detail?.task;
  const comments = detail?.comments ?? [];
  const attachments = detail?.attachments ?? [];
  const membersText =
    (mergedTask?.members ?? task?.members ?? [])
      .map((item) => displayMemberName(item, t('common.collaboration.projects.task.member')))
      .join(', ') || t('common.collaboration.projects.task.unsynced');
  const taskTitle = mergedTask?.summary || task?.summary || t('common.collaboration.projects.task.detailTitle');
  const taskDescription = mergedTask?.description || task?.description || t('common.collaboration.projects.task.noDescription');
  const isCompleted = mergedTask ? Boolean(mergedTask.completedAt) : Boolean(task?.completed);
  const currentDueInput = formatDateTimeInput(mergedTask?.dueAt ?? task?.dueAt);
  const dueDirty = dueDraft !== currentDueInput;

  useEffect(() => {
    if (!visible) return;
    setDueDraft(currentDueInput);
  }, [currentDueInput, visible]);

  const handleCommentSubmit = useCallback(async () => {
    const content = commentText.trim();
    if (!task?.guid || (!content && pendingFiles.length === 0)) return;
    setSubmittingComment(true);
    try {
      const nextComments: ILarkTaskComment[] = [];
      const nextAttachments: ILarkTaskAttachment[] = [];
      if (content) {
        const result = await ipcBridge.larkProjectAgent.addTaskComment.invoke({
          taskGuid: task.guid,
          content,
        });
        nextComments.push(result.comment);
      }
      const uploadResults = await Promise.all(
        pendingFiles.slice(0, 5).map((file) =>
          ipcBridge.larkProjectAgent.uploadTaskAttachment.invoke({
            taskGuid: task.guid,
            filePath: file.path,
            comment: attachmentComment.trim() || t('common.collaboration.projects.task.attachmentUploaded', { name: file.name }),
          })
        )
      );
      for (const result of uploadResults) {
        nextAttachments.push(result.attachment);
        if (result.comment) nextComments.push(result.comment);
      }
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              comments: [...prev.comments, ...nextComments],
              attachments: [...nextAttachments, ...prev.attachments],
            }
          : prev
      );
      setCommentText('');
      setAttachmentComment('');
      setPendingFiles([]);
      await refreshDetailAfterMutation({ comments: nextComments, attachments: nextAttachments });
      Message.success(
        pendingFiles.length
          ? t('common.collaboration.projects.task.commentsSynced')
          : t('common.collaboration.projects.task.commentSent')
      );
    } catch (rawError) {
      const message = rawError instanceof Error ? rawError.message : String(rawError);
      Message.error(message);
    } finally {
      setSubmittingComment(false);
    }
  }, [attachmentComment, commentText, pendingFiles, refreshDetailAfterMutation, task?.guid, t]);

  const handlePickFiles = useCallback(async (imagesOnly = false) => {
    const filePaths = await ipcBridge.dialog.showOpen.invoke({
      properties: ['openFile', 'multiSelections'],
      filters: imagesOnly
        ? [{ name: t('common.collaboration.projects.task.image'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif'] }]
        : [
            { name: t('common.collaboration.projects.task.image'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif'] },
            { name: t('common.allFiles', { defaultValue: 'All files' }), extensions: ['*'] },
          ],
    });
    if (!filePaths?.length) return;
    const files = await Promise.all(
      filePaths.slice(0, 5).map(async (filePath) => {
        try {
          return await ipcBridge.fs.getFileMetadata.invoke({ path: filePath });
        } catch {
          return {
            name: fileBaseName(filePath),
            path: filePath,
            size: 0,
            type: isImagePath(filePath) ? 'image/*' : '',
            lastModified: Date.now(),
          } satisfies IFileMetadata;
        }
      })
    );
    setPendingFiles((prev) => {
      const map = new Map(prev.map((file) => [file.path, file]));
      files.forEach((file) => map.set(file.path, file));
      return [...map.values()].slice(0, 5);
    });
  }, [t]);

  const handleUploadAttachment = useCallback(async () => {
    if (!task?.guid) return;
    if (!pendingFiles.length) {
      await handlePickFiles(false);
      return;
    }
    setUploadingAttachment(true);
    try {
      const uploaded: ILarkTaskAttachment[] = [];
      const uploadedComments: ILarkTaskComment[] = [];
      const uploadResults = await Promise.all(
        pendingFiles.slice(0, 5).map((file) =>
          ipcBridge.larkProjectAgent.uploadTaskAttachment.invoke({
            taskGuid: task.guid,
            filePath: file.path,
            comment: attachmentComment.trim() || t('common.collaboration.projects.task.attachmentUploaded', { name: file.name }),
          })
        )
      );
      for (const result of uploadResults) {
        uploaded.push(result.attachment);
        if (result.comment) uploadedComments.push(result.comment);
      }
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              attachments: [...uploaded, ...prev.attachments],
              comments: [...prev.comments, ...uploadedComments],
            }
          : prev
      );
      setAttachmentComment('');
      setPendingFiles([]);
      await refreshDetailAfterMutation({ comments: uploadedComments, attachments: uploaded });
      Message.success(
        uploaded.length > 1
          ? t('common.collaboration.projects.task.attachmentsUploaded', { count: uploaded.length })
          : t('common.collaboration.projects.task.attachmentUploadedToast')
      );
    } catch (rawError) {
      const message = rawError instanceof Error ? rawError.message : String(rawError);
      Message.error(message);
    } finally {
      setUploadingAttachment(false);
    }
  }, [attachmentComment, handlePickFiles, pendingFiles, refreshDetailAfterMutation, task?.guid, t]);

  const handleToggleCompletion = useCallback(async () => {
    if (!task?.guid) return;
    const nextCompleted = !isCompleted;
    setUpdatingCompletion(true);
    try {
      const result = await ipcBridge.larkProjectAgent.setTaskCompletion.invoke({
        taskGuid: task.guid,
        completed: nextCompleted,
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              task: result.task,
            }
          : {
              task: result.task,
              comments: [],
              attachments: [],
              fetchedAt: Date.now(),
            }
      );
      Message.success(
        nextCompleted
          ? t('common.collaboration.projects.task.completed')
          : t('common.collaboration.projects.task.reopened')
      );
    } catch (rawError) {
      const message = rawError instanceof Error ? rawError.message : String(rawError);
      Message.error(message);
    } finally {
      setUpdatingCompletion(false);
    }
  }, [isCompleted, task?.guid, t]);

  const handleSaveDue = useCallback(async () => {
    if (!task?.guid || !dueDirty) return;
    const dueAt = parseDateTimeInput(dueDraft);
    if (dueDraft.trim() && !dueAt) {
      Message.warning(t('common.collaboration.projects.task.invalidDue'));
      return;
    }
    setSavingTask(true);
    try {
      const result = await ipcBridge.larkProjectAgent.updateTask.invoke({
        taskGuid: task.guid,
        dueAt,
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              task: result.task,
            }
          : {
              task: result.task,
              comments: [],
              attachments: [],
              fetchedAt: Date.now(),
            }
      );
      setDueDraft(formatDateTimeInput(result.task.dueAt));
      setDueSavedAt(Date.now());
      Message.success(
        dueAt
          ? t('common.collaboration.projects.task.dueSynced')
          : t('common.collaboration.projects.task.dueCleared')
      );
    } catch (rawError) {
      const message = rawError instanceof Error ? rawError.message : String(rawError);
      Message.error(message);
    } finally {
      setSavingTask(false);
    }
  }, [dueDirty, dueDraft, task?.guid, t]);

  return (
    <Modal
      visible={visible}
      footer={null}
      title={null}
      closable={false}
      className={styles.taskDetailModal}
      maskClosable={!isMutating}
      escToExit={!isMutating}
      unmountOnExit
      onCancel={() => {
        if (isMutating) return;
        onClose();
      }}
      style={{ width: 'min(1380px, calc(100vw - 32px))' }}
    >
      <div className={styles.detailShell}>
        <ModalCloseButton disabled={isMutating} onClick={onClose} />
        <header className={styles.detailHeader}>
          <div className={styles.headerMain}>
            <h2 className={styles.detailTitle}>{taskTitle}</h2>
            <div className={styles.headerMeta}>
              {task?.tasklistNames?.length ? <span>{task.tasklistNames.join(' / ')}</span> : <span>{t('common.collaboration.projects.task.listAgent')}</span>}
              {comments.length
                ? <span>{t('common.collaboration.projects.task.commentsCount', { count: comments.length })}</span>
                : <span>{t('common.collaboration.projects.task.noComments')}</span>}
              {attachments.length
                ? <span>{t('common.collaboration.projects.task.attachmentsCount', { count: attachments.length })}</span>
                : <span>{t('common.collaboration.projects.task.noAttachments')}</span>}
              {loading
                ? <span>{t('common.collaboration.projects.task.loadingStatus')}</span>
                : detail?.fetchedAt
                  ? <span>{t('common.collaboration.projects.task.readAt', { time: new Date(detail.fetchedAt).toLocaleTimeString() })}</span>
                  : null}
              {task?.url ? (
                <button
                  className={styles.inlineLink}
                  onClick={() => void ipcBridge.larkAutomation.openExternal.invoke({ url: task.url as string })}
                  type='button'
                >
                  <CollaborationIcon name='openOriginal' size={18} />
                  {t('common.collaboration.projects.task.originalTask')}
                </button>
              ) : null}
            </div>
            <div className={styles.propertyBar}>
              <PropertyItem icon='assignee' label={t('common.collaboration.projects.task.ownerLabel')} value={membersText} />
              <PropertyItem
                icon='createdTime'
                label={t('common.collaboration.projects.task.createdTime')}
                value={task?.createdAt ? formatDate(task.createdAt) : t('common.collaboration.projects.task.unsynced')}
              />
              <label className={styles.propertyItem}>
                <span className={styles.propertyLabel}>
                  <CollaborationIcon name='dueTime' size={20} />
                  {t('common.collaboration.projects.task.dueTime')}
                </span>
                <input
                  className={styles.dateInput}
                  type='datetime-local'
                  value={dueDraft}
                  onChange={(event) => {
                    setDueDraft(event.target.value);
                    setDueSavedAt(null);
                  }}
                />
                <small className={styles.dueStatus} data-dirty={dueDirty}>
                  {savingTask
                    ? t('common.collaboration.projects.task.syncingDue')
                    : dueDirty
                      ? t('common.collaboration.projects.task.dueDirty')
                      : dueSavedAt
                        ? t('common.collaboration.projects.task.dueSaved', { time: new Date(dueSavedAt).toLocaleTimeString() })
                        : t('common.collaboration.projects.task.dueClean')}
                </small>
              </label>
              <button
                className={styles.saveTimeButton}
                data-dirty={dueDirty}
                disabled={!dueDirty || savingTask}
                onClick={() => void handleSaveDue()}
                type='button'
              >
                {savingTask ? t('common.collaboration.projects.task.saving') : t('common.collaboration.projects.task.saveTime')}
              </button>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.completeButton}
              data-done={isCompleted}
              onClick={() => void handleToggleCompletion()}
              type='button'
              aria-label={
                isCompleted
                  ? t('common.collaboration.projects.task.reopen')
                  : t('common.collaboration.projects.task.complete')
              }
              title={
                isCompleted
                  ? t('common.collaboration.projects.task.reopen')
                  : t('common.collaboration.projects.task.complete')
              }
              disabled={updatingCompletion}
            >
              <CollaborationIcon name={isCompleted ? 'complete' : 'reopen'} size={22} />
            </button>
          </div>
        </header>

        {loading ? (
          <div className={styles.syncBar}>
            <Spin size={18} />
            {t('common.collaboration.projects.task.loadingDetail')}
          </div>
        ) : null}
        <div className={styles.detailBody}>
          <main className={styles.centerPane}>
            <section className={styles.contentPanel}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionIcon}>
                  <CollaborationIcon name='taskDetail' size={22} />
                </span>
                <span>{t('common.collaboration.projects.task.description')}</span>
              </div>
              <div className={styles.descriptionBox}>{taskDescription}</div>
            </section>

            <section className={styles.contentPanel}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionIcon}>
                  <CollaborationIcon name='attachment' size={22} />
                </span>
                <span>{t('common.collaboration.projects.task.attachments')}</span>
                <span className={styles.countBadge}>{attachments.length}</span>
              </div>
              <div className={styles.attachmentList}>
                {attachments.length ? (
                  attachments.map((attachment) => <AttachmentRow key={attachment.guid} attachment={attachment} />)
                ) : (
                  <div className={styles.emptyAttachment}>
                    <CollaborationIcon name='attachment' size={34} />
                    <span>{t('common.collaboration.projects.task.noAttachments')}</span>
                  </div>
                )}
              </div>
            </section>
          </main>

          <aside className={styles.activityPane}>
            <div className={styles.activityHeader}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionIcon}>
                  <CollaborationIcon name='comment' size={22} />
                </span>
                <span>{t('common.collaboration.projects.task.commentsAndFeedback')}</span>
                <span className={styles.countBadge}>{comments.length}</span>
              </div>
              <div className={styles.activityHint}>{t('common.collaboration.projects.task.commentHint')}</div>
            </div>

            <div className={styles.commentList}>
              {comments.length ? (
                comments.map((comment) => <CommentBubble key={comment.id} comment={comment} />)
              ) : (
                <div className={styles.emptyComment}>
                  <CollaborationIcon name='comment' size={34} />
                  <span>{t('common.collaboration.projects.task.noComments')}</span>
                </div>
              )}
            </div>

            <div className={styles.composer}>
              <div className={styles.composerHeader}>
                <span>
                  <CollaborationIcon name='syncFeedback' size={20} />
                  {t('common.collaboration.projects.task.syncFeedback')}
                </span>
                <small>
                  {pendingFiles.length
                    ? t('common.collaboration.projects.task.pendingUploads', { count: pendingFiles.length })
                    : t('common.collaboration.projects.task.supportsFiles')}
                </small>
              </div>
              {pendingFiles.length ? (
                <div className={styles.pendingFileList}>
                  {pendingFiles.map((file) => (
                    <div className={styles.pendingFile} key={file.path}>
                      <span className={styles.pendingFileIcon}>
                        <CollaborationIcon name={isImagePath(file.name || file.path) ? 'imageUpload' : 'attachment'} size={22} />
                      </span>
                      <div className={styles.pendingFileText}>
                        <div className={styles.pendingFileName}>{file.name}</div>
                        <div className={styles.pendingFileMeta}>
                          {isImagePath(file.name || file.path)
                            ? t('common.collaboration.projects.task.image')
                            : t('common.collaboration.projects.task.attachment')}
                          {file.size ? ` · ${formatBytes(file.size)}` : ''}
                        </div>
                      </div>
                      <button
                        className={styles.pendingFileRemove}
                        onClick={() => setPendingFiles((prev) => prev.filter((item) => item.path !== file.path))}
                        type='button'
                        aria-label={t('common.collaboration.projects.task.removeFile', { name: file.name })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <Input.TextArea
                autoSize={{ minRows: 2, maxRows: 4 }}
                value={commentText}
                placeholder={t('common.collaboration.projects.task.commentPlaceholder')}
                onChange={setCommentText}
              />
              {pendingFiles.length ? (
                <Input
                  className={styles.attachmentNote}
                  value={attachmentComment}
                  placeholder={t('common.collaboration.projects.task.attachmentNotePlaceholder')}
                  onChange={setAttachmentComment}
                />
              ) : null}
              <div className={styles.composerActions}>
                <div className={styles.composerTools}>
                  <Button icon={<CollaborationIcon name='attachment' size={20} />} onClick={() => void handlePickFiles(false)}>
                    {t('common.collaboration.projects.task.pickAttachment')}
                  </Button>
                  <Button icon={<CollaborationIcon name='imageUpload' size={20} />} onClick={() => void handlePickFiles(true)}>
                    {t('common.collaboration.projects.task.pickImage')}
                  </Button>
                </div>
                <div className={styles.composerSubmit}>
                  <Button
                    icon={<CollaborationIcon name='imageUpload' size={20} />}
                    loading={uploadingAttachment}
                    disabled={!pendingFiles.length}
                    onClick={handleUploadAttachment}
                  >
                    {t('common.collaboration.projects.task.uploadOnly')}
                  </Button>
                  <Button
                    type='primary'
                    className='collaboration-light-primary'
                    icon={<CollaborationIcon name='sendComment' size={20} />}
                    loading={submittingComment}
                    disabled={!commentText.trim() && !pendingFiles.length}
                    onClick={handleCommentSubmit}
                  >
                    {t('common.collaboration.projects.task.sendComment')}
                  </Button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Modal>
  );
};

const PropertyItem: React.FC<{ icon: CollaborationIconName; label: string; value: string }> = ({ icon, label, value }) => (
  <div className={styles.propertyItem}>
    <span className={styles.propertyLabel}>
      <CollaborationIcon name={icon} size={20} />
      {label}
    </span>
    <strong>{value}</strong>
  </div>
);

const CommentBubble: React.FC<{ comment: ILarkTaskComment }> = ({ comment }) => {
  const { t } = useTranslation();
  const authorName = displayMemberName(comment.creator, t('common.collaboration.projects.task.collaborator'));
  return (
    <div className={styles.commentBubble}>
      <div className={styles.commentTop}>
        <span className={styles.commentAvatar}>{authorName.slice(0, 1)}</span>
        <div className={styles.commentAuthor}>{authorName}</div>
        <div className={styles.commentTime}>{formatTimestamp(comment.createdAt)}</div>
      </div>
      <div className={styles.commentContent}>{comment.content}</div>
    </div>
  );
};

const AttachmentRow: React.FC<{ attachment: ILarkTaskAttachment }> = ({ attachment }) => {
  const { t } = useTranslation();
  return (
    <div className={styles.attachmentRow}>
      <div className={styles.attachmentMain}>
        <span className={styles.attachmentIcon}>
          <CollaborationIcon name={isImagePath(attachment.name) ? 'imageUpload' : 'attachment'} size={28} />
        </span>
        <div className={styles.attachmentText}>
          <div className={styles.attachmentName}>{attachment.name}</div>
          <div className={styles.attachmentMeta}>{attachmentMetaText(attachment, t)}</div>
        </div>
      </div>
      {attachment.url ? (
        <Button
          size='mini'
          type='secondary'
          icon={<CollaborationIcon name='openOriginal' size={19} />}
          onClick={() => void ipcBridge.larkAutomation.openExternal.invoke({ url: attachment.url as string })}
        >
          {t('common.collaboration.projects.task.view')}
        </Button>
      ) : null}
    </div>
  );
};

export default LarkProjectsPage;
