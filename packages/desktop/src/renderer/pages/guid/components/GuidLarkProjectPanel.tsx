/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  ILarkAutomationContact,
  ILarkAutomationProjectBucket,
  ILarkAutomationProjectTask,
  ILarkProjectBinding,
  ILarkProjectSnapshot,
} from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import type { TeamAgent, TTeam } from '@/common/types/team/teamTypes';
import CollaborationIcon from '@/renderer/components/icons/CollaborationIcon';
import { Button, Checkbox, Empty, Input, Message, Modal, Spin, Tag } from '@arco-design/web-react';
import { Check, Close, Plus, Right, Search } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from './GuidLarkProjectPanel.module.css';

function getContactInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '@';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function contactSubtitle(contact: ILarkAutomationContact): string {
  return contact.department || contact.enterpriseEmail || contact.email || contact.openId;
}

function renderDescriptionHtml(text: string, contacts: ILarkAutomationContact[]): string {
  const mentions = contacts
    .map((contact) => contact.name.trim())
    .filter(Boolean)
    .toSorted((a, b) => b.length - a.length);
  if (mentions.length === 0) return escapeHtml(text);
  const pattern = new RegExp(`@(${mentions.map(escapeRegExp).join('|')})(?=\\s|$)`, 'g');
  let cursor = 0;
  let html = '';
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(cursor, index));
    html += `<span class="${styles.mentionToken}" contenteditable="false">@${escapeHtml(match[1])}</span>`;
    cursor = index + match[0].length;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

type MentionRange = {
  query: string;
  start: number;
  end: number;
};

function getCaretTextOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(root);
  try {
    prefix.setEnd(range.startContainer, range.startOffset);
  } catch {
    return null;
  }
  return prefix.toString().length;
}

function setCaretTextOffset(root: HTMLElement, targetOffset: number): void {
  const range = document.createRange();
  const selection = window.getSelection();
  let remaining = Math.max(0, targetOffset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textLength = node.textContent?.length ?? 0;
    if (remaining <= textLength) {
      const parent = node.parentElement;
      if (parent?.classList.contains(styles.mentionToken) && remaining >= textLength) {
        range.setStartAfter(parent);
      } else {
        range.setStart(node, remaining);
      }
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= textLength;
    node = walker.nextNode();
  }
  range.selectNodeContents(root);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function findMentionAtCaret(text: string, caretOffset: number): MentionRange | null {
  const beforeCaret = text.slice(0, caretOffset);
  const atIndex = beforeCaret.lastIndexOf('@');
  if (atIndex < 0) return null;
  const query = text.slice(atIndex + 1, caretOffset);
  if (/[\s@]/.test(query)) return null;
  const tail = text.slice(caretOffset);
  const tokenTail = tail.match(/^[^\s@]*/)?.[0] ?? '';
  return {
    query,
    start: atIndex,
    end: caretOffset + tokenTail.length,
  };
}

function findMentionedOpenIds(text: string, contacts: ILarkAutomationContact[]): string[] {
  return contacts
    .filter((contact) => {
      const name = contact.name.trim();
      if (!name) return false;
      return new RegExp(`@${escapeRegExp(name)}(?=\\s|$)`).test(text);
    })
    .map((contact) => contact.openId);
}

const ContactAvatar: React.FC<{ contact: ILarkAutomationContact }> = ({ contact }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = contact.avatarUrl?.trim();
  if (avatarUrl && !imageFailed) {
    return <img className={styles.avatar} src={avatarUrl} alt='' onError={() => setImageFailed(true)} />;
  }
  return <span className={styles.avatarFallback}>{getContactInitial(contact.name)}</span>;
};

const ContactLine: React.FC<{ contact: ILarkAutomationContact; strong?: boolean }> = ({ contact, strong = false }) => (
  <>
    <ContactAvatar contact={contact} />
    <span className='min-w-0 flex flex-col'>
      <span className={`${styles.contactName} ${strong ? styles.contactNameStrong : ''} text-13px text-t-primary truncate`}>
        {contact.name}
      </span>
      <span className='text-11px text-t-tertiary truncate'>{contactSubtitle(contact)}</span>
    </span>
  </>
);

const taskStatusColor = (task: ILarkAutomationProjectTask) => {
  if (task.completed) return 'green';
  if (task.isAgentTask) return 'purple';
  return 'arcoblue';
};

const taskStatusLabel = (
  task: ILarkAutomationProjectTask,
  labels: { done: string; agent: string; todo: string }
) => {
  if (task.completed) return labels.done;
  if (task.isAgentTask) return labels.agent;
  return labels.todo;
};

type GuidLarkProjectPanelProps = {
  expanded: boolean;
  activeContext?: GuidLarkProjectContext;
  onContextChange?: (context: GuidLarkProjectContext | undefined) => void;
};

type LarkProjectConversationExtra = {
  lark_project_tasklist_guid?: string;
  lark_project_role?: 'leader' | 'agent';
};

export type GuidLarkProjectContext = {
  role: 'leader' | 'agent';
  bindingId?: string;
  tasklistGuid: string;
  tasklistName: string;
  locked?: boolean;
  leaderPrompt?: string;
  focusedTask?: {
    guid: string;
    summary: string;
    description?: string;
    dueAt?: string;
    url?: string;
    completed?: boolean;
    isAgentTask?: boolean;
  };
};

function getProjectConversationExtra(conversation: TChatConversation): LarkProjectConversationExtra {
  return (conversation.extra ?? {}) as LarkProjectConversationExtra;
}

function findTeamAgent(team: TTeam | null | undefined, slotId?: string): TeamAgent | undefined {
  if (!team) return undefined;
  if (slotId) {
    const agent = team.agents.find((item) => item.slot_id === slotId);
    if (agent) return agent;
  }
  return team.agents.find((agent) => agent.slot_id === team.leader_agent_id) ?? team.agents.find((agent) => agent.role === 'leader');
}

function toFocusedTask(task: ILarkAutomationProjectTask | undefined): GuidLarkProjectContext['focusedTask'] {
  if (!task) return undefined;
  return {
    guid: task.guid,
    summary: task.summary,
    description: task.description,
    dueAt: task.dueAt,
    url: task.url,
    completed: task.completed,
    isAgentTask: task.isAgentTask,
  };
}

const GuidLarkProjectPanel: React.FC<GuidLarkProjectPanelProps> = ({
  expanded,
  activeContext,
  onContextChange,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [buckets, setBuckets] = useState<ILarkAutomationProjectBucket[]>([]);
  const [projectAgentSnapshot, setProjectAgentSnapshot] = useState<ILarkProjectSnapshot | null>(null);
  const [activeBucketId, setActiveBucketId] = useState<string | undefined>();
  const [selectedTaskGuid, setSelectedTaskGuid] = useState<string | undefined>();
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [contacts, setContacts] = useState<ILarkAutomationContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [tasklistName, setTasklistName] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [contactQuery, setContactQuery] = useState('');
  const [selectedOpenIds, setSelectedOpenIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<number | null>(null);
  const leaderBindRequestRef = useRef(0);

  const hiddenTasklistGuids = useMemo(
    () => new Set(projectAgentSnapshot?.hiddenTasklistGuids ?? []),
    [projectAgentSnapshot?.hiddenTasklistGuids]
  );
  const visibleBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.kind === 'tasklist' && !hiddenTasklistGuids.has(bucket.tasklistGuid || '')),
    [buckets, hiddenTasklistGuids]
  );
  const activeBucket = useMemo(() => {
    if (activeBucketId) return visibleBuckets.find((bucket) => bucket.id === activeBucketId);
    if (activeContext?.tasklistGuid) {
      return visibleBuckets.find((bucket) => bucket.tasklistGuid === activeContext.tasklistGuid);
    }
    return undefined;
  }, [activeBucketId, activeContext?.tasklistGuid, visibleBuckets]);
  const bucketTasks = activeBucket?.tasks ?? [];
  const isLeaderActive = Boolean(
    activeBucket?.tasklistGuid && activeContext?.tasklistGuid === activeBucket.tasklistGuid && activeContext.role === 'leader'
  );
  const projectBindingsByTasklist = useMemo(() => {
    const map = new Map<string, ILarkProjectBinding>();
    for (const binding of projectAgentSnapshot?.bindings ?? []) {
      map.set(binding.tasklistGuid, binding);
    }
    return map;
  }, [projectAgentSnapshot?.bindings]);
  const activeTask = useMemo(() => {
    return bucketTasks.find((task) => task.guid === selectedTaskGuid);
  }, [bucketTasks, selectedTaskGuid]);
  const filteredBuckets = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return visibleBuckets;
    return visibleBuckets.filter((bucket) => {
      const taskText = bucket.tasks
        .slice(0, 12)
        .map((task) => task.summary)
        .join('\n');
      return `${bucket.name}\n${taskText}`.toLowerCase().includes(query);
    });
  }, [projectQuery, visibleBuckets]);
  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedOpenIds.includes(contact.openId)),
    [contacts, selectedOpenIds]
  );
  const filteredContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => {
      const haystack = [
        contact.name,
        contact.enName,
        contact.department,
        contact.email,
        contact.enterpriseEmail,
        contact.openId,
      ]
        .filter(Boolean)
        .join('\n')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [contactQuery, contacts]);
  const mentionOptions = useMemo(() => {
    const query = (mentionQuery ?? '').trim().toLowerCase();
    return contacts
      .filter((contact) => {
        if (!query) return true;
        return [contact.name, contact.enName, contact.department, contact.email, contact.enterpriseEmail]
          .filter(Boolean)
          .join('\n')
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 8);
  }, [contacts, mentionQuery]);
  const statusLabels = useMemo(
    () => ({
      done: t('guid.larkProject.taskStatusDone'),
      agent: t('guid.larkProject.taskStatusAgent'),
      todo: t('guid.larkProject.taskStatusTodo'),
    }),
    [t]
  );

  const buildAgentContext = useCallback(
    (bucket: ILarkAutomationProjectBucket | undefined, task?: ILarkAutomationProjectTask): GuidLarkProjectContext | undefined => {
      if (!bucket?.tasklistGuid) return undefined;
      return {
        role: 'agent',
        tasklistGuid: bucket.tasklistGuid,
        tasklistName: bucket.name,
        focusedTask: toFocusedTask(task),
      };
    },
    []
  );

  const buildLeaderContext = useCallback(
    (bucket: ILarkAutomationProjectBucket | undefined): GuidLarkProjectContext | undefined => {
      if (!bucket?.tasklistGuid) return undefined;
      return {
        role: 'leader',
        tasklistGuid: bucket.tasklistGuid,
        tasklistName: bucket.name,
        focusedTask: undefined,
      };
    },
    []
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
      const conversations = await ipcBridge.database.getUserConversations
        .invoke({ limit: 10000 })
        .catch((): { items: TChatConversation[] } => ({ items: [] }));
      const leaderConversation = (conversations.items ?? [])
        .filter((conversation) => {
          const extra = getProjectConversationExtra(conversation);
          return extra.lark_project_tasklist_guid === bucket.tasklistGuid && extra.lark_project_role === 'leader';
        })
        .toSorted((a, b) => b.modified_at - a.modified_at)[0];
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
        const snapshot = await ipcBridge.larkProjectAgent.getSnapshot.invoke().catch((): null => null);
        if (snapshot) setProjectAgentSnapshot(snapshot);
      }
      return leaderConversation ?? null;
    },
    []
  );

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

  const loadProjects = useCallback(async (force = false) => {
    setProjectsLoading(true);
    try {
      const [result, snapshot] = await Promise.all([
        force ? ipcBridge.larkAutomation.syncProjects.invoke(undefined) : ipcBridge.larkAutomation.getProjects.invoke(),
        ipcBridge.larkProjectAgent.getSnapshot.invoke().catch((): null => null),
      ]);
      const nextBuckets = result.buckets ?? [];
      setBuckets(nextBuckets);
      setProjectAgentSnapshot(snapshot);
      setActiveBucketId((current) => (current && nextBuckets.some((bucket) => bucket.id === current) ? current : undefined));
      if (!result.ok && result.error) {
        Message.warning(result.fromCache ? t('guid.larkProject.projectCacheWarning', { error: result.error }) : result.error);
      }
    } catch (rawError) {
      Message.error(rawError instanceof Error ? rawError.message : String(rawError));
      setProjectAgentSnapshot(null);
    } finally {
      setProjectsLoading(false);
    }
  }, [t]);

  const loadContacts = useCallback(async (force = false) => {
    setContactsLoading(true);
    try {
      const result = force
        ? await ipcBridge.larkAutomation.syncContacts.invoke(undefined)
        : await ipcBridge.larkAutomation.getContacts.invoke();
      setContacts(result.contacts ?? []);
      if (!result.ok && result.error) {
        Message.warning(result.fromCache ? t('guid.larkProject.contactCacheWarning', { error: result.error }) : result.error);
      }
    } catch (rawError) {
      const message = rawError instanceof Error ? rawError.message : String(rawError);
      Message.error(message);
    } finally {
      setContactsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadProjects();
    void loadContacts();
  }, [loadContacts, loadProjects]);

  useEffect(() => {
    if (activeContext?.tasklistGuid) {
      const contextBucket = visibleBuckets.find((bucket) => bucket.tasklistGuid === activeContext.tasklistGuid);
      if (contextBucket) {
        setActiveBucketId((current) => current ?? contextBucket.id);
      }
    }
  }, [activeContext?.tasklistGuid, visibleBuckets]);

  useEffect(() => {
    if (!activeBucket) {
      setSelectedTaskGuid(undefined);
      return;
    }
    setSelectedTaskGuid((current) => (activeBucket.tasks.some((task) => task.guid === current) ? current : undefined));
  }, [activeBucket?.id, activeBucket?.tasks]);

  const updateFocusedTaskContext = useCallback(
    (task: ILarkAutomationProjectTask | undefined) => {
      const focusedTask = toFocusedTask(task);
      if (activeContext?.tasklistGuid === activeBucket?.tasklistGuid) {
        onContextChange?.({
          ...activeContext,
          focusedTask,
        });
        return;
      }
      const nextContext = buildAgentContext(activeBucket, task);
      if (nextContext) onContextChange?.(nextContext);
    },
    [activeBucket, activeContext, buildAgentContext, onContextChange]
  );

  const handleToggleFocusedTask = useCallback(
    (task: ILarkAutomationProjectTask) => {
      const nextTask = selectedTaskGuid === task.guid ? undefined : task;
      setSelectedTaskGuid(nextTask?.guid);
      updateFocusedTaskContext(nextTask);
    },
    [selectedTaskGuid, updateFocusedTaskContext]
  );

  const handleSelectBucket = useCallback(
    (bucket: ILarkAutomationProjectBucket) => {
      leaderBindRequestRef.current += 1;
      setActiveBucketId(bucket.id);
      setSelectedTaskGuid(undefined);
      if (!bucket.tasklistGuid) {
        onContextChange?.(undefined);
        return;
      }
      if (activeContext?.tasklistGuid === bucket.tasklistGuid && activeContext.role === 'leader') {
        onContextChange?.({
          ...activeContext,
          focusedTask: undefined,
        });
        return;
      }
      const nextContext = buildAgentContext(bucket);
      if (nextContext) onContextChange?.(nextContext);
    },
    [activeContext, buildAgentContext, onContextChange]
  );

  const handleClearProject = useCallback(() => {
    leaderBindRequestRef.current += 1;
    setActiveBucketId(undefined);
    setSelectedTaskGuid(undefined);
    onContextChange?.(undefined);
  }, [onContextChange]);

  const mergeContacts = useCallback((nextContacts: ILarkAutomationContact[]) => {
    setContacts((previous) => {
      const byOpenId = new Map<string, ILarkAutomationContact>();
      for (const contact of previous) byOpenId.set(contact.openId, contact);
      for (const contact of nextContacts) byOpenId.set(contact.openId, { ...byOpenId.get(contact.openId), ...contact });
      return Array.from(byOpenId.values()).toSorted((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  const searchLarkContacts = useCallback(
    (query: string) => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
      const trimmed = query.trim();
      if (!trimmed) return;
      searchTimerRef.current = window.setTimeout(() => {
        void ipcBridge.larkAutomation.searchContacts
          .invoke({ query: trimmed })
          .then((result) => {
            if (result.contacts?.length) mergeContacts(result.contacts);
          })
          .catch((): void => undefined);
      }, 260);
    },
    [mergeContacts]
  );

  useEffect(() => {
    searchLarkContacts(contactQuery);
  }, [contactQuery, searchLarkContacts]);

  useEffect(() => {
    searchLarkContacts(mentionQuery ?? '');
  }, [mentionQuery, searchLarkContacts]);

  useEffect(() => {
    setMentionActiveIndex(0);
  }, [mentionQuery]);

  useEffect(() => {
    setMentionActiveIndex((current) => {
      if (mentionOptions.length === 0) return 0;
      return Math.min(current, mentionOptions.length - 1);
    });
  }, [mentionOptions.length]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || contacts.length === 0) return;
    const mentionedOpenIds = findMentionedOpenIds(editor.innerText ?? '', contacts);
    if (mentionedOpenIds.length > 0) {
      setSelectedOpenIds((previous) => Array.from(new Set([...previous, ...mentionedOpenIds])));
    }
  }, [contacts]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const toggleContact = useCallback((openId: string) => {
    setSelectedOpenIds((previous) => (previous.includes(openId) ? previous.filter((id) => id !== openId) : [...previous, openId]));
  }, []);

  const syncEditorMentions = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      setMentionQuery(null);
      setMentionRange(null);
      return;
    }
    const text = editor.innerText ?? '';
    const caretOffset = getCaretTextOffset(editor);
    const range = caretOffset === null ? null : findMentionAtCaret(text, caretOffset);
    setMentionQuery(range ? range.query : null);
    setMentionRange(range);

    const mentionedOpenIds = findMentionedOpenIds(text, contacts);
    if (mentionedOpenIds.length > 0) {
      setSelectedOpenIds((previous) => Array.from(new Set([...previous, ...mentionedOpenIds])));
    }
  }, [contacts]);

  const insertMention = useCallback(
    (contact: ILarkAutomationContact) => {
      setSelectedOpenIds((previous) => (previous.includes(contact.openId) ? previous : [...previous, contact.openId]));
      const editor = editorRef.current;
      if (!editor) return;
      const currentText = editor.innerText ?? '';
      const fallbackEnd = getCaretTextOffset(editor) ?? currentText.length;
      const range = mentionRange ?? findMentionAtCaret(currentText, fallbackEnd);
      const start = range?.start ?? fallbackEnd;
      const end = range?.end ?? fallbackEnd;
      const prefix = currentText.slice(0, start);
      const suffix = currentText.slice(end);
      const needsSpaceAfter = suffix.length > 0 && !/^\s/.test(suffix);
      const mentionText = `@${contact.name}${needsSpaceAfter || suffix.length === 0 ? ' ' : ''}`;
      const nextText = `${prefix}${mentionText}${suffix}`;
      const nextCaretOffset = prefix.length + mentionText.length;
      const nextContacts = contacts.some((item) => item.openId === contact.openId) ? contacts : [...contacts, contact];
      editor.innerHTML = renderDescriptionHtml(nextText, nextContacts.filter((item) => selectedOpenIds.includes(item.openId) || item.openId === contact.openId));
      setMentionQuery(null);
      setMentionRange(null);
      setMentionActiveIndex(0);
      setCaretTextOffset(editor, nextCaretOffset);
    },
    [contacts, mentionRange, selectedOpenIds]
  );

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing || mentionQuery === null) return;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (mentionOptions.length === 0) return;
        setMentionActiveIndex((current) => {
          if (event.key === 'ArrowDown') return (current + 1) % mentionOptions.length;
          return (current - 1 + mentionOptions.length) % mentionOptions.length;
        });
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        if (mentionOptions.length > 0) {
          event.preventDefault();
          insertMention(mentionOptions[mentionActiveIndex] ?? mentionOptions[0]);
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionQuery(null);
        setMentionRange(null);
        setMentionActiveIndex(0);
      }
    },
    [insertMention, mentionActiveIndex, mentionOptions, mentionQuery]
  );

  const resetModal = useCallback(() => {
    setTasklistName('');
    setContactQuery('');
    setSelectedOpenIds([]);
    setMentionQuery(null);
    setMentionRange(null);
    setMentionActiveIndex(0);
    if (editorRef.current) {
      editorRef.current.textContent = '';
    }
  }, []);

  const handleCreateTasklist = useCallback(async () => {
    if (!tasklistName.trim()) {
      Message.warning(t('guid.larkProject.projectNameRequired'));
      return;
    }
    setCreating(true);
    try {
      const result = await ipcBridge.larkAutomation.createTasklist.invoke({
        name: tasklistName.trim(),
      });
      if (!result.ok) {
        Message.error(result.error || t('guid.larkProject.createFailed'));
        return;
      }
      if (result.tasklistGuid) {
        const bind = await ipcBridge.larkProjectAgent.bindLeaderAgent.invoke({
          tasklistGuid: result.tasklistGuid,
          tasklistName: result.name || tasklistName.trim(),
          projectTitle: tasklistName.trim(),
          leaderAgentLabel: t('guid.larkProject.leaderTitle'),
          projectDescription: editorRef.current?.innerText?.trim() || undefined,
          participants: selectedContacts.map((contact) => ({
            id: contact.openId,
            name: contact.name,
            kind: 'human',
            role: t('guid.larkProject.participantRolePending'),
            language: 'auto',
          })),
        });
        onContextChange?.({
          role: 'leader',
          bindingId: bind.binding.id,
          tasklistGuid: bind.binding.tasklistGuid,
          tasklistName: bind.binding.tasklistName,
          leaderPrompt: bind.leaderPrompt,
          focusedTask: undefined,
        });
      }
      Message.success(t('guid.larkProject.draftCreated'));
      setModalVisible(false);
      resetModal();
      await loadProjects(true);
    } catch (rawError) {
      Message.error(rawError instanceof Error ? rawError.message : String(rawError));
    } finally {
      setCreating(false);
    }
  }, [loadProjects, onContextChange, resetModal, selectedContacts, tasklistName, t]);

  const handleBindActiveTasklist = useCallback(async () => {
    if (!activeBucket?.tasklistGuid) {
      Message.warning(t('guid.larkProject.chooseTasklist'));
      return;
    }
    if (activeContext?.tasklistGuid === activeBucket.tasklistGuid && activeContext.role === 'leader') {
      leaderBindRequestRef.current += 1;
      onContextChange?.(buildAgentContext(activeBucket));
      setSelectedTaskGuid(undefined);
      return;
    }

    const bucket = activeBucket;
    const existingBinding = projectBindingsByTasklist.get(bucket.tasklistGuid);
    if (await openTeamConversation(existingBinding?.teamId, existingBinding?.leaderSlotId)) {
      return;
    }
    const requestId = leaderBindRequestRef.current + 1;
    leaderBindRequestRef.current = requestId;
    setSelectedTaskGuid(undefined);
    onContextChange?.(buildLeaderContext(bucket));

    try {
      const result = existingBinding
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
            leaderAgentLabel: t('guid.larkProject.leaderTitle'),
          });
      if (leaderBindRequestRef.current !== requestId) return;
      if (await openTeamConversation(result.binding.teamId, result.binding.leaderSlotId)) {
        return;
      }
      const conversationAfterBind = await findLeaderConversation(bucket, result.binding);
      if (conversationAfterBind?.id) {
        navigate(`/conversation/${conversationAfterBind.id}`);
        return;
      }
      onContextChange?.({
        role: 'leader',
        bindingId: result.binding.id,
        tasklistGuid: result.binding.tasklistGuid,
        tasklistName: result.binding.tasklistName,
        leaderPrompt: result.leaderPrompt,
        focusedTask: undefined,
      });
    } catch (rawError) {
      if (leaderBindRequestRef.current === requestId) {
        Message.warning(rawError instanceof Error ? rawError.message : String(rawError));
      }
    }
  }, [
    activeBucket,
    activeContext?.role,
    activeContext?.tasklistGuid,
    buildAgentContext,
    buildLeaderContext,
    findLeaderConversation,
    navigate,
    onContextChange,
    openTeamConversation,
    projectBindingsByTasklist,
    t,
  ]);

  const browserNode = (
    <div className={styles.projectPicker}>
      <button
        type='button'
        className={`${styles.leaderSwitch} ${isLeaderActive ? styles.leaderSwitchActive : ''}`}
        disabled={!activeBucket?.tasklistGuid}
        onClick={() => void handleBindActiveTasklist()}
      >
        <span className={styles.projectMenuIcon}>
          <CollaborationIcon name='leaderAgent' size={20} />
        </span>
        <span className={styles.leaderSwitchText}>
          <span>{t('guid.larkProject.leaderTitle')}</span>
          <small>
            {isLeaderActive
              ? t('guid.larkProject.leaderActive')
              : activeBucket
                ? t('guid.larkProject.leaderInactive')
                : t('guid.larkProject.chooseTasklistHint')}
          </small>
        </span>
        {isLeaderActive ? <Check theme='outline' size={18} /> : null}
      </button>

      <div className={styles.searchLine}>
        <Search theme='outline' size={18} />
        <input
          value={projectQuery}
          onChange={(event) => setProjectQuery(event.target.value)}
          placeholder={t('guid.larkProject.searchProjects')}
          aria-label={t('guid.larkProject.searchProjects')}
        />
      </div>

      {projectsLoading && buckets.length === 0 ? (
        <div className={styles.emptyState}>
          <Spin size={18} />
        </div>
      ) : visibleBuckets.length === 0 ? (
        <div className={styles.emptyState}>{t('guid.larkProject.noSyncedTasklists')}</div>
      ) : (
        <div className={styles.projectMenuList}>
          {filteredBuckets.length > 0 ? (
            filteredBuckets.map((bucket) => (
              <button
                key={bucket.id}
                type='button'
                className={`${styles.projectMenuItem} ${bucket.id === activeBucket?.id ? styles.projectMenuItemActive : ''}`}
                onClick={() => handleSelectBucket(bucket)}
              >
                <span className={styles.projectMenuIcon}>
                  <CollaborationIcon name='tasklist' size={20} />
                </span>
                <span className={styles.projectMenuName}>{bucket.name}</span>
                <span className={styles.projectMenuStats}>{bucket.todoCount}/{bucket.taskCount}</span>
                {bucket.id === activeBucket?.id ? <Check theme='outline' size={18} /> : null}
              </button>
            ))
          ) : (
            <Empty description={t('guid.larkProject.noTasklistsFound')} />
          )}
        </div>
      )}

      <div className={styles.projectMenuDivider} />

      <button type='button' className={styles.projectMenuItem} onClick={() => setModalVisible(true)}>
        <span className={styles.projectMenuIconPlain}>
          <Plus theme='outline' size={19} />
        </span>
        <span className={styles.projectMenuName}>{t('guid.larkProject.createTasklist')}</span>
        <Right theme='outline' size={16} className={styles.projectMenuArrow} />
      </button>

      <button type='button' className={styles.projectMenuItem} onClick={handleClearProject}>
        <span className={styles.projectMenuIconPlain}>
          <Close theme='outline' size={18} />
        </span>
        <span className={styles.projectMenuName}>{t('guid.larkProject.noProject')}</span>
      </button>

      <div className={`${styles.taskDrawer} ${activeBucket ? styles.taskDrawerOpen : ''}`} aria-hidden={!activeBucket}>
        {activeBucket ? (
          <>
            <div className={styles.taskDrawerHeader}>
              <div className={styles.taskDrawerTitle}>
                <span>{activeBucket.name}</span>
                <small>
                  {t('guid.larkProject.progressText', {
                    done: activeBucket.doneCount ?? 0,
                    todo: activeBucket.todoCount ?? 0,
                  })}
                </small>
              </div>
              {activeBucket.url ? (
                <Button
                  size='mini'
                  type='text'
                  icon={<CollaborationIcon name='openOriginal' size={19} />}
                  onClick={() => void ipcBridge.larkAutomation.openExternal.invoke({ url: activeBucket.url as string })}
                />
              ) : null}
            </div>

            {isLeaderActive ? (
              <div className={styles.taskDrawerHint}>{t('guid.larkProject.leaderContextHint')}</div>
            ) : bucketTasks.length > 0 ? (
              <div className={styles.taskList}>
                {bucketTasks.map((task) => (
                  <button
                    key={task.guid}
                    type='button'
                    className={`${styles.taskRow} ${selectedTaskGuid === task.guid ? styles.taskRowActive : ''}`}
                    onClick={() => handleToggleFocusedTask(task)}
                    onDoubleClick={() => {
                      if (task.url) void ipcBridge.larkAutomation.openExternal.invoke({ url: task.url });
                    }}
                  >
                    <span className={styles.taskRowMain}>
                      <span className={styles.taskText}>
                        <CollaborationIcon name={task.isAgentTask ? 'agentInbox' : 'taskDetail'} size={19} />
                        <span>{task.summary}</span>
                      </span>
                      <span className={styles.taskMeta}>
                        {task.dueAt
                          ? t('guid.larkProject.duePrefix', { date: task.dueAt })
                          : task.members?.[0]?.name ?? t('guid.larkProject.noDue')}
                      </span>
                    </span>
                    <Tag size='small' color={taskStatusColor(task)}>
                      {taskStatusLabel(task, statusLabels)}
                    </Tag>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.taskDrawerHint}>{t('guid.larkProject.noFocusedTasks')}</div>
            )}

            {activeTask && !isLeaderActive ? (
              <div className={styles.taskDetail}>
                <div className={styles.taskDetailTitle}>
                  <CollaborationIcon name={activeTask.isAgentTask ? 'agentInbox' : 'taskDetail'} size={20} />
                  <span>{activeTask.summary}</span>
                </div>
                <div className={styles.taskDetailHint}>
                  <span>{t('guid.larkProject.focusedTaskHint')}</span>
                </div>
                <div className={styles.taskDetailText}>
                  {activeTask.description?.trim() || t('guid.larkProject.noTaskDescription')}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className={`${styles.panel} ${expanded ? styles.panelExpanded : ''}`}>
      <div className={styles.projectPanelHeader}>
        <div className={styles.projectPanelTitleGroup}>
          <div className={styles.projectPanelTitle}>
            <CollaborationIcon name='project' size={19} />
            <span>{t('guid.larkProject.panelTitle')}</span>
          </div>
          <div className={styles.projectPanelSubtitle}>
            {visibleBuckets.length > 0
              ? t('guid.larkProject.tasklistCount', { count: visibleBuckets.length })
              : t('guid.larkProject.tasklists')}
          </div>
        </div>
        <Button
          size='mini'
          type='text'
          icon={<CollaborationIcon name='refreshSync' size={20} spin={projectsLoading} />}
          loading={projectsLoading}
          onClick={() => void loadProjects(true)}
        />
      </div>

      <div
        className={`${styles.projectBrowserShell} ${expanded ? styles.projectBrowserShellOpen : ''}`}
        aria-hidden={!expanded}
      >
        {browserNode}
      </div>

      <Modal
        visible={modalVisible}
        title={t('guid.larkProject.createModalTitle')}
        className={styles.createModal}
        style={{ width: 'min(1080px, calc(100vw - 36px))' }}
        getPopupContainer={() => document.body}
        wrapStyle={{ zIndex: 2200 }}
        okText={t('guid.larkProject.createDraft')}
        cancelText={t('common.cancel')}
        confirmLoading={creating}
        onOk={() => void handleCreateTasklist()}
        onCancel={() => {
          setModalVisible(false);
          resetModal();
        }}
        unmountOnExit
      >
        <div className='flex flex-col gap-14px'>
          <Input
            value={tasklistName}
            onChange={setTasklistName}
            placeholder={t('guid.larkProject.projectNameRequired')}
            maxLength={80}
            showWordLimit
          />
          <div className='text-13px text-t-secondary'>
            {t('guid.larkProject.descriptionHelp')}
          </div>
          <div className='relative'>
            <div
              ref={editorRef}
              className={styles.editor}
              contentEditable
              suppressContentEditableWarning
              data-placeholder={t('guid.larkProject.descriptionPlaceholder')}
              onInput={syncEditorMentions}
              onKeyUp={syncEditorMentions}
              onClick={syncEditorMentions}
              onMouseUp={syncEditorMentions}
              onKeyDown={handleEditorKeyDown}
            />
            {mentionQuery !== null ? (
              <div className={styles.mentionMenu}>
                {mentionOptions.length > 0 ? (
                  mentionOptions.map((contact, index) => (
                    <button
                      key={contact.openId}
                      type='button'
                      className={`${styles.mentionItem} ${index === mentionActiveIndex ? styles.mentionItemActive : ''}`}
                      onMouseEnter={() => setMentionActiveIndex(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(contact);
                      }}
                    >
                      <ContactLine contact={contact} strong={index === mentionActiveIndex} />
                    </button>
                  ))
                ) : (
                  <div className='px-12px py-12px text-12px text-t-tertiary'>{t('guid.larkProject.keepTypingContacts')}</div>
                )}
              </div>
            ) : null}
          </div>

          <div className='flex flex-wrap items-center gap-6px min-h-28px'>
            {selectedContacts.length > 0 ? (
              selectedContacts.map((contact) => (
                <Tag key={contact.openId} color='arcoblue' closable onClose={() => toggleContact(contact.openId)}>
                  @{contact.name}
                </Tag>
              ))
            ) : (
              <span className='text-12px text-t-tertiary'>{t('guid.larkProject.noParticipants')}</span>
            )}
          </div>

          <div className={styles.contactGrid}>
            <div>
              <Input
                value={contactQuery}
                onChange={setContactQuery}
                prefix={<Search theme='outline' size={18} />}
                placeholder={t('guid.larkProject.searchContacts')}
                allowClear
              />
              <div className='mt-8px text-12px text-t-tertiary'>
                {contactsLoading ? t('guid.larkProject.contactsSyncing') : t('guid.larkProject.contactsHelp')}
              </div>
              <div className={`${styles.contactList} mt-8px`}>
                {contactsLoading && contacts.length === 0 ? (
                  <div className='h-120px flex-center'>
                    <Spin tip={t('guid.larkProject.contactsLoading')} />
                  </div>
                ) : filteredContacts.length > 0 ? (
                  filteredContacts.map((contact) => (
                    <label key={contact.openId} className={styles.contactRow}>
                      <Checkbox checked={selectedOpenIds.includes(contact.openId)} onChange={() => toggleContact(contact.openId)} />
                      <ContactLine contact={contact} />
                    </label>
                  ))
                ) : (
                  <Empty description={t('guid.larkProject.noContactsFound')} />
                )}
              </div>
            </div>
            <div className='rd-8px border border-border-1 p-12px bg-bg-1'>
              <div className='flex items-center gap-7px text-13px font-650 text-t-primary'>
                <CollaborationIcon name='humanMember' size={21} />
                {t('guid.larkProject.participants')}
              </div>
              <div className='mt-10px flex flex-col gap-8px max-h-360px overflow-y-auto'>
                {selectedContacts.length > 0 ? (
                  selectedContacts.map((contact) => (
                    <button key={contact.openId} type='button' className='w-full border-0 bg-transparent p-0 text-left flex items-center gap-8px cursor-pointer' onClick={() => toggleContact(contact.openId)}>
                      <ContactLine contact={contact} />
                    </button>
                  ))
                ) : (
                  <span className='text-12px text-t-tertiary'>{t('guid.larkProject.addParticipantsHint')}</span>
                )}
              </div>
            </div>
          </div>

          {activeBucket?.url ? (
            <Button
              size='small'
              type='text'
              icon={<CollaborationIcon name='openOriginal' size={19} />}
              onClick={() => void ipcBridge.larkAutomation.openExternal.invoke({ url: activeBucket.url as string })}
            >
              {t('guid.larkProject.openCurrentTasklist')}
            </Button>
          ) : null}
        </div>
      </Modal>
    </div>
  );
};

export default GuidLarkProjectPanel;
