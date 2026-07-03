/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ILarkTaskDetail, ILarkTasklistSourceSnapshot } from '@/common/adapter/ipcBridge';
import CollaborationIcon from '@/renderer/components/icons/CollaborationIcon';
import { Empty, Input, Message, Spin, Tooltip } from '@arco-design/web-react';
import { CheckSmall, LinkOne, Refresh, Search, Send, Success, Time } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './LarkLeaderProjectPanel.module.css';

type LarkLeaderProjectPanelProps = {
  tasklistGuid: string;
  tasklistName?: string;
};

type LarkPanelTask = ILarkTasklistSourceSnapshot['openTasks'][number] & {
  completed?: boolean;
};

type TaskFilter = 'open' | 'all' | 'agent' | 'completed';

type RenderTextWithLinksProps = {
  text?: string;
  emptyText: string;
};

const TASK_FILTERS: Array<{ key: TaskFilter; labelKey: string; defaultLabel: string }> = [
  { key: 'open', labelKey: 'filters.open', defaultLabel: 'Open' },
  { key: 'all', labelKey: 'filters.all', defaultLabel: 'All' },
  { key: 'agent', labelKey: 'filters.agent', defaultLabel: 'Agent' },
  { key: 'completed', labelKey: 'filters.completed', defaultLabel: 'Done' },
];

const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/g;

function formatDate(timestamp: number | undefined, emptyLabel: string): string {
  if (!timestamp) return emptyLabel;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(size?: number): string {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function memberNames(task: LarkPanelTask, fallback: string, separator: string): string {
  const names = (task.members ?? []).map((member) => member.name || member.id).filter(Boolean);
  return names.length ? names.slice(0, 3).join(separator) : fallback;
}

function openUrl(url?: string): void {
  if (!url) return;
  void ipcBridge.larkAutomation.openExternal.invoke({ url });
}

const RenderTextWithLinks: React.FC<RenderTextWithLinksProps> = ({ text, emptyText }) => {
  if (!text?.trim()) return <span className={styles.muted}>{emptyText}</span>;
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, index) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <button key={`${part}-${index}`} type='button' className={styles.link} onClick={() => openUrl(part)}>
              {part}
            </button>
          );
        }
        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
      })}
    </>
  );
};

const LarkLeaderProjectPanel: React.FC<LarkLeaderProjectPanelProps> = ({ tasklistGuid, tasklistName }) => {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<ILarkTasklistSourceSnapshot | null>(null);
  const [selectedTaskGuid, setSelectedTaskGuid] = useState<string | null>(null);
  const [detail, setDetail] = useState<ILarkTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [completionSaving, setCompletionSaving] = useState(false);
  const unassignedLabel = t('conversation.larkLeaderProject.unassigned', { defaultValue: 'Unassigned' });
  const memberSeparator = t('conversation.larkLeaderProject.memberSeparator', { defaultValue: ', ' });
  const noDateLabel = t('conversation.larkLeaderProject.noDate', { defaultValue: 'No date' });
  const noContentLabel = t('conversation.larkLeaderProject.noContent', { defaultValue: 'No content yet' });

  const loadSnapshot = useCallback(async () => {
    if (!tasklistGuid) return;
    setLoading(true);
    try {
      const next = await ipcBridge.larkProjectAgent.getTasklistSnapshot.invoke({ tasklistGuid });
      setSnapshot(next);
      setSelectedTaskGuid((previous) => {
        if (previous && [...next.openTasks, ...next.completedTasks].some((task) => task.guid === previous)) {
          return previous;
        }
        return next.openTasks[0]?.guid || next.completedTasks[0]?.guid || null;
      });
    } catch (error) {
      Message.error(
        error instanceof Error
          ? error.message
          : t('conversation.larkLeaderProject.loadFailed', { defaultValue: 'Failed to load the tasklist' })
      );
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [tasklistGuid, t]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const allTasks = useMemo<LarkPanelTask[]>(() => {
    if (!snapshot) return [];
    return [
      ...snapshot.openTasks.map((task) => ({ ...task, completed: false })),
      ...snapshot.completedTasks.map((task) => ({ ...task, completed: true })),
    ];
  }, [snapshot]);

  const selectedTask = useMemo(
    () => allTasks.find((task) => task.guid === selectedTaskGuid) ?? null,
    [allTasks, selectedTaskGuid]
  );

  useEffect(() => {
    if (!selectedTaskGuid) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    void ipcBridge.larkProjectAgent.getTaskDetail
      .invoke({ taskGuid: selectedTaskGuid })
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedTaskGuid]);

  const filteredTasks = useMemo(() => {
    const source = allTasks.filter((task) => {
      if (filter === 'open') return !task.completed;
      if (filter === 'completed') return task.completed;
      if (filter === 'agent') return task.isAgentTask;
      return true;
    });
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((task) => {
      const text = `${task.summary}\n${task.description ?? ''}\n${memberNames(
        task,
        unassignedLabel,
        memberSeparator
      )}`.toLowerCase();
      return text.includes(needle);
    });
  }, [allTasks, filter, memberSeparator, query, unassignedLabel]);

  const groupedTasks = useMemo(() => {
    const sectionNameByGuid = new Map((snapshot?.sections ?? []).map((section) => [section.guid, section.name]));
    const groups = new Map<string, LarkPanelTask[]>();
    for (const task of filteredTasks) {
      const sectionName = task.sectionGuid ? sectionNameByGuid.get(task.sectionGuid) : undefined;
      const groupName =
        sectionName || t('conversation.larkLeaderProject.ungrouped', { defaultValue: 'Ungrouped' });
      const list = groups.get(groupName) ?? [];
      list.push(task);
      groups.set(groupName, list);
    }
    return [...groups.entries()].map(([name, tasks]) => ({ name, tasks }));
  }, [filteredTasks, snapshot?.sections, t]);

  const openCount = snapshot?.openTasks.length ?? 0;
  const completedCount = snapshot?.completedTasks.length ?? 0;
  const totalCount = openCount + completedCount;
  const agentCount = allTasks.filter((task) => task.isAgentTask).length;
  const completionRatio = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleToggleCompletion = useCallback(async () => {
    if (!selectedTask) return;
    setCompletionSaving(true);
    try {
      await ipcBridge.larkProjectAgent.setTaskCompletion.invoke({
        taskGuid: selectedTask.guid,
        completed: !selectedTask.completed,
      });
      Message.success(
        selectedTask.completed
          ? t('conversation.larkLeaderProject.reopened', { defaultValue: 'Task reopened' })
          : t('conversation.larkLeaderProject.markedComplete', { defaultValue: 'Task marked complete' })
      );
      await loadSnapshot();
    } catch (error) {
      Message.error(
        error instanceof Error
          ? error.message
          : t('conversation.larkLeaderProject.updateFailed', { defaultValue: 'Failed to update task status' })
      );
    } finally {
      setCompletionSaving(false);
    }
  }, [loadSnapshot, selectedTask, t]);

  const handleSendComment = useCallback(async () => {
    if (!selectedTask || !commentDraft.trim()) return;
    setCommentSending(true);
    try {
      await ipcBridge.larkProjectAgent.addTaskComment.invoke({
        taskGuid: selectedTask.guid,
        content: commentDraft.trim(),
      });
      setCommentDraft('');
      const next = await ipcBridge.larkProjectAgent.getTaskDetail.invoke({ taskGuid: selectedTask.guid });
      setDetail(next);
      Message.success(t('conversation.larkLeaderProject.commentWritten', { defaultValue: 'Comment sent to Lark' }));
    } catch (error) {
      Message.error(
        error instanceof Error
          ? error.message
          : t('conversation.larkLeaderProject.commentFailed', { defaultValue: 'Failed to send comment' })
      );
    } finally {
      setCommentSending(false);
    }
  }, [commentDraft, selectedTask, t]);

  const detailTask = detail?.task ?? selectedTask;
  const detailTaskCompleted = Boolean(selectedTask?.completed);

  return (
    <div className={styles.panel}>
      <div className={styles.top}>
        <div className={styles.titleRow}>
          <div className={styles.titleIcon}>
            <CollaborationIcon name='tasklist' size={24} />
          </div>
          <div className={styles.titleText}>
            <div className={styles.eyebrow}>
              {t('conversation.larkLeaderProject.tasklistTitle', { defaultValue: 'Lark tasklist' })}
            </div>
            <div className={styles.tasklistName}>
              {snapshot?.tasklist.name ||
                tasklistName ||
                t('conversation.larkLeaderProject.fallbackTasklistName', { defaultValue: 'Team project' })}
            </div>
          </div>
          <div className={styles.actions}>
            <Tooltip content={t('conversation.larkLeaderProject.refreshTasks', { defaultValue: 'Refresh tasks' })}>
              <button type='button' className={styles.iconButton} onClick={() => void loadSnapshot()} disabled={loading}>
                <Refresh theme='outline' size={16} className={loading ? 'animate-spin' : undefined} />
              </button>
            </Tooltip>
            <Tooltip content={t('conversation.larkLeaderProject.openInLark', { defaultValue: 'Open in Lark' })}>
              <button
                type='button'
                className={styles.iconButton}
                onClick={() => openUrl(snapshot?.tasklist.url)}
                disabled={!snapshot?.tasklist.url}
              >
                <LinkOne theme='outline' size={16} />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className={styles.overview}>
          <div className={styles.overviewTop}>
            <span>{t('conversation.larkLeaderProject.overallProgress', { defaultValue: 'Overall progress' })}</span>
            <strong>{completionRatio}%</strong>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${completionRatio}%` }} />
          </div>
          <div className={styles.overviewMeta}>
            <span>
              <b>{openCount}</b>{' '}
              {t('conversation.larkLeaderProject.openCountLabel', { defaultValue: 'open' })}
            </span>
            <span>
              <b>{completedCount}</b>{' '}
              {t('conversation.larkLeaderProject.completedCountLabel', { defaultValue: 'done' })}
            </span>
            <span>
              <b>{agentCount}</b> Agent
            </span>
          </div>
        </div>

        <div className={styles.toolbar}>
          <Input
            className={styles.search}
            size='small'
            allowClear
            value={query}
            onChange={setQuery}
            prefix={<Search theme='outline' size={14} />}
            placeholder={t('conversation.larkLeaderProject.searchPlaceholder', {
              defaultValue: 'Search this tasklist',
            })}
          />
          <div
            className={styles.filterTabs}
            role='tablist'
            aria-label={t('conversation.larkLeaderProject.filterAria', { defaultValue: 'Task filters' })}
          >
            {TASK_FILTERS.map((item) => (
              <button
                key={item.key}
                type='button'
                className={classNames(styles.filterTab, { [styles.filterTabActive]: filter === item.key })}
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {t(`conversation.larkLeaderProject.${item.labelKey}`, { defaultValue: item.defaultLabel })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <Spin loading={loading} style={{ width: '100%', minHeight: 260 }}>
          {!loading && groupedTasks.length === 0 ? (
            <div className={styles.empty}>
              <Empty
                description={
                  query || filter !== 'all'
                    ? t('conversation.larkLeaderProject.noTasksForFilter', {
                        defaultValue: 'No tasks match this view',
                      })
                    : t('conversation.larkLeaderProject.noTasks', {
                        defaultValue: 'This tasklist has no tasks yet',
                      })
                }
              />
            </div>
          ) : (
            groupedTasks.map((group) => (
              <section key={group.name} className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span>{group.name}</span>
                  <span className={styles.sectionCount}>{group.tasks.length}</span>
                </div>
                <div className={styles.taskList}>
                  {group.tasks.map((task) => (
                    <button
                      key={task.guid}
                      type='button'
                      className={classNames(styles.taskRow, {
                        [styles.taskRowActive]: selectedTaskGuid === task.guid,
                        [styles.taskRowDone]: task.completed,
                      })}
                      onClick={() => setSelectedTaskGuid(task.guid)}
                    >
                      <span className={classNames(styles.statusDot, { [styles.statusDone]: task.completed })}>
                        {task.completed ? <CheckSmall theme='outline' size={13} /> : null}
                      </span>
                      <span className={styles.taskMain}>
                        <span className={styles.taskTitleLine}>
                          <span className={styles.taskTitle}>{task.summary}</span>
                          {task.isAgentTask ? <span className={styles.agentBadge}>AGENT</span> : null}
                        </span>
                        <span className={styles.taskMeta}>
                          <span className={styles.metaItem}>
                            <Time theme='outline' size={12} />
                            {formatDate(task.dueAt, noDateLabel)}
                          </span>
                          <span className={styles.metaItem}>
                            <CollaborationIcon name='assignee' size={13} />
                            {memberNames(task, unassignedLabel, memberSeparator)}
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </Spin>
      </div>

      {detailTask ? (
        <div className={styles.detail}>
          <Spin loading={detailLoading} style={{ width: '100%' }}>
            <div className={styles.detailHeader}>
              <div className={styles.detailTitle}>{detailTask.summary}</div>
              <Tooltip
                content={
                  detailTaskCompleted
                    ? t('conversation.larkLeaderProject.reopenTask', { defaultValue: 'Reopen task' })
                    : t('conversation.larkLeaderProject.markComplete', { defaultValue: 'Mark complete' })
                }
              >
                <button
                  type='button'
                  className={styles.iconButton}
                  disabled={completionSaving}
                  onClick={() => void handleToggleCompletion()}
                >
                  {detailTaskCompleted ? <Refresh theme='outline' size={15} /> : <Success theme='outline' size={15} />}
                </button>
              </Tooltip>
              <Tooltip
                content={t('conversation.larkLeaderProject.openTaskInLark', { defaultValue: 'Open task in Lark' })}
              >
                <button
                  type='button'
                  className={styles.iconButton}
                  disabled={!detailTask.url}
                  onClick={() => openUrl(detailTask.url)}
                >
                  <LinkOne theme='outline' size={15} />
                </button>
              </Tooltip>
            </div>

            <div className={styles.detailMeta}>
              <span className={styles.pill}>
                <Time theme='outline' size={12} />
                {formatDate(detailTask.dueAt, noDateLabel)}
              </span>
              <span className={styles.pill}>
                <CollaborationIcon name='assignee' size={13} />
                {memberNames(detailTask, unassignedLabel, memberSeparator)}
              </span>
              {detailTask.isAgentTask ? <span className={styles.pill}>AGENT_TASK</span> : null}
            </div>

            <div className={styles.detailBlock}>
              <div className={styles.detailBlockTitle}>
                {t('conversation.larkLeaderProject.description', { defaultValue: 'Description' })}
              </div>
              <div className={styles.description}>
                <RenderTextWithLinks text={detailTask.description} emptyText={noContentLabel} />
              </div>
            </div>

            <div className={styles.detailBlock}>
              <div className={styles.detailBlockTitle}>
                {t('conversation.larkLeaderProject.attachments', { defaultValue: 'Attachments' })}
              </div>
              {detail?.attachments.length ? (
                <div className={styles.attachmentList}>
                  {detail.attachments.map((attachment) => (
                    <div key={attachment.guid} className={styles.attachment}>
                      <CollaborationIcon name='attachment' size={18} />
                      <div className={styles.attachmentName}>
                        {attachment.name}
                        {attachment.size ? ` · ${formatBytes(attachment.size)}` : ''}
                      </div>
                      <button
                        type='button'
                        className={styles.iconButton}
                        disabled={!attachment.url && !detailTask.url}
                        onClick={() => openUrl(attachment.url || detailTask.url)}
                      >
                        <LinkOne theme='outline' size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.muted}>
                  {t('conversation.larkLeaderProject.noAttachments', { defaultValue: 'No attachments yet' })}
                </div>
              )}
            </div>

            <div className={styles.detailBlock}>
              <div className={styles.detailBlockTitle}>
                {t('conversation.larkLeaderProject.comments', { defaultValue: 'Comments' })}
              </div>
              {detail?.comments.length ? (
                <div className={styles.commentList}>
                  {detail.comments.slice(-5).map((comment) => (
                    <div key={comment.id} className={styles.comment}>
                      <div className={styles.commentAuthor}>
                        {comment.creator?.name || comment.creator?.id || 'Lark'} · {formatDateTime(comment.createdAt)}
                      </div>
                      <div className={styles.commentText}>
                        <RenderTextWithLinks text={comment.content} emptyText={noContentLabel} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.muted}>
                  {t('conversation.larkLeaderProject.noComments', { defaultValue: 'No comments yet' })}
                </div>
              )}
            </div>

            <div className={styles.detailBlock}>
              <div className={styles.detailBlockTitle}>
                {t('conversation.larkLeaderProject.commentInputTitle', { defaultValue: 'Add a comment' })}
              </div>
              <div className={styles.commentBox}>
                <Input.TextArea
                  value={commentDraft}
                  onChange={setCommentDraft}
                  placeholder={t('conversation.larkLeaderProject.commentPlaceholder', {
                    defaultValue: 'Add a progress note or reminder for this task',
                  })}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
                <div className={styles.commentActions}>
                  <button
                    type='button'
                    className={classNames(styles.textButton, styles.primaryButton)}
                    disabled={!commentDraft.trim() || commentSending}
                    onClick={() => void handleSendComment()}
                  >
                    <Send theme='outline' size={13} />
                    {t('conversation.larkLeaderProject.sendToLark', { defaultValue: 'Send to Lark' })}
                  </button>
                </div>
              </div>
            </div>
          </Spin>
        </div>
      ) : null}
    </div>
  );
};

export default LarkLeaderProjectPanel;
