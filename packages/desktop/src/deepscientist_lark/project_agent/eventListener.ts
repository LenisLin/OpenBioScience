/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { commentTask, getLarkProjectAgentCliProfile, getTask, listTaskComments } from './larkCli';
import {
  getDelegationByTaskGuid,
  getTaskRecord,
  listDelegations,
  saveTaskRecord,
  updateDelegation,
  updateTaskRecord,
} from './store';
import { sendTeamMessageWithBusyRetry } from './teamClient';
import type { LarkProjectDelegation, LarkProjectEventListenerStatus, LarkTaskComment, LarkTaskSummary } from './types';

const EVENT_KEY: LarkProjectEventListenerStatus['eventKey'] = 'task.task.update_user_access_v2';

let child: ChildProcess | null = null;
let commentPollTimer: NodeJS.Timeout | null = null;
let buffer = '';
let status: LarkProjectEventListenerStatus = {
  running: false,
  eventKey: EVENT_KEY,
  processedEvents: 0,
  updatedTaskGuids: [],
};

function rememberTaskGuid(taskGuid: string): void {
  status.updatedTaskGuids = [taskGuid, ...status.updatedTaskGuids.filter((item) => item !== taskGuid)].slice(0, 20);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getEventTaskGuid(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const event = isRecord(payload.event) ? payload.event : undefined;
  return typeof event?.task_guid === 'string' ? event.task_guid : undefined;
}

function getEventTypes(payload: unknown): string[] {
  if (!isRecord(payload)) return [];
  const event = isRecord(payload.event) ? payload.event : undefined;
  return Array.isArray(event?.event_types)
    ? event.event_types.filter((item): item is string => typeof item === 'string')
    : [];
}

function inferLanguage(text: string | undefined): 'zh' | 'en' {
  return /[\u3400-\u9fff]/.test(text ?? '') ? 'zh' : 'en';
}

function buildAcknowledgementText(input: { actorName: string; taskTitle?: string }): string {
  return inferLanguage(input.taskTitle) === 'zh'
    ? `${input.actorName} [Agent] 已顺利收到此任务。`
    : `${input.actorName} [Agent] has successfully received this task.`;
}

function commentFingerprint(comments: LarkTaskComment[]): string {
  return comments.map((comment) => `${comment.id}:${comment.updatedAt ?? comment.createdAt ?? 0}`).join('|');
}

function commentAuthor(comment: LarkTaskComment | undefined): string {
  return comment?.creator?.name || comment?.creator?.id || 'Lark assignee';
}

async function wakeLeaderForFirstComment(input: {
  delegation: LarkProjectDelegation;
  comments: LarkTaskComment[];
}): Promise<void> {
  const latest = input.comments.at(-1);
  const fingerprint = commentFingerprint(input.comments);
  const timestamp = Date.now();
  await updateTaskRecord(input.delegation.larkTaskGuid, {
    state: 'returned',
    returnContextPacketId: latest?.id,
  }).catch((): undefined => undefined);
  await updateDelegation(input.delegation.id, {
    state: 'returned',
    lastWakeAt: timestamp,
    lastCommentFingerprint: fingerprint,
    lastCommentCount: input.comments.length,
    lastError: undefined,
  }).catch((): undefined => undefined);
  if (!input.delegation.teamId) return;
  await sendTeamMessageWithBusyRetry({
    teamId: input.delegation.teamId,
    content: [
      '# Lark task comment received',
      '',
      `Task: ${input.delegation.title}`,
      `Task GUID: ${input.delegation.larkTaskGuid}`,
      `Comment author: ${commentAuthor(latest)}`,
      latest?.content ? `Latest comment: ${latest.content}` : undefined,
      '',
      'Please read the Lark task description, comments, attachments, and current status before deciding the next step.',
    ]
      .filter((line): line is string => typeof line === 'string')
      .join('\n'),
  }).catch(async (error) => {
    await updateDelegation(input.delegation.id, {
      state: 'returned',
      lastWakeAt: timestamp,
      lastCommentFingerprint: fingerprint,
      lastCommentCount: input.comments.length,
      lastError: error instanceof Error ? error.message : String(error),
    }).catch((): undefined => undefined);
  });
}

export async function syncLarkProjectFirstCommentFeedback(delegation: LarkProjectDelegation): Promise<void> {
  if (delegation.waitFor !== 'first_comment') return;
  if (delegation.state === 'returned' || delegation.state === 'leader_consumed') return;
  const comments = await listTaskComments(delegation.larkTaskGuid);
  const fingerprint = commentFingerprint(comments);
  if (!delegation.lastCommentFingerprint) {
    await updateDelegation(delegation.id, {
      lastCommentFingerprint: fingerprint,
      lastCommentCount: comments.length,
      lastError: undefined,
    }).catch((): undefined => undefined);
    return;
  }
  if (fingerprint !== delegation.lastCommentFingerprint && comments.length > (delegation.lastCommentCount ?? 0)) {
    await wakeLeaderForFirstComment({ delegation, comments });
  }
}

async function pollFirstCommentDelegations(): Promise<void> {
  const delegations = await listDelegations().catch((): LarkProjectDelegation[] => []);
  await Promise.all(
    delegations
      .filter((delegation) => delegation.waitFor === 'first_comment')
      .map((delegation) =>
        syncLarkProjectFirstCommentFeedback(delegation).catch((error) => {
          status.lastError = error instanceof Error ? error.message : String(error);
        })
      )
  );
}

async function recordNewAgentTask(task: LarkTaskSummary): Promise<void> {
  const existing = await getTaskRecord(task.guid);
  if (existing || !task.isAgentTask) return;

  const actorName =
    task.members.find((member) => member.type === 'app')?.name || task.members[0]?.name || 'Assigned Agent';
  const acknowledgementText = buildAcknowledgementText({
    actorName,
    taskTitle: `${task.summary}\n${task.description ?? ''}`,
  });
  let commentId: string | undefined;
  let state: 'acknowledged' | 'discovered' = 'acknowledged';
  try {
    const comment = await commentTask(task.guid, acknowledgementText);
    commentId = comment.commentId;
  } catch (error) {
    state = 'discovered';
    status.lastError = error instanceof Error ? error.message : String(error);
  }

  const timestamp = Date.now();
  await saveTaskRecord({
    id: `lark-task-${randomUUID()}`,
    taskGuid: task.guid,
    tasklistGuid: task.tasklistGuid,
    kind: 'agent',
    state,
    title: task.summary,
    assigneeId: task.members[0]?.id,
    ackCommentId: commentId,
    metadata: {
      taskGuid: task.guid,
      taskTitle: task.summary,
      taskDescription: task.description,
      tasklistGuid: task.tasklistGuid,
      targetAgent: actorName,
      requiredResponse: 'context_packet',
      language: 'auto',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function handleEventLine(line: string): Promise<void> {
  if (!line.trim()) return;
  const payload = JSON.parse(line) as unknown;
  const taskGuid = getEventTaskGuid(payload);
  if (!taskGuid) return;
  const eventTypes = getEventTypes(payload);
  status.processedEvents += 1;
  status.lastEventAt = Date.now();
  rememberTaskGuid(taskGuid);

  let record = await getTaskRecord(taskGuid);
  let task: LarkTaskSummary | undefined;

  if (!record && eventTypes.some((type) => type !== 'task_deleted')) {
    task = await getTask(taskGuid).catch((): undefined => undefined);
    if (task?.isAgentTask) {
      await recordNewAgentTask(task);
      record = await getTaskRecord(taskGuid);
    }
  }
  if (!record) return;

  const delegation = await getDelegationByTaskGuid(taskGuid).catch((): undefined => undefined);
  if (delegation?.waitFor === 'first_comment') {
    await syncLarkProjectFirstCommentFeedback(delegation).catch((error) => {
      status.lastError = error instanceof Error ? error.message : String(error);
    });
  }

  if (eventTypes.includes('task_completed_update')) {
    task = task ?? (await getTask(taskGuid).catch((): undefined => undefined));
    await updateTaskRecord(taskGuid, {
      state: 'completed',
      title: task?.summary ?? record.title,
      tasklistGuid: task?.tasklistGuid ?? record.tasklistGuid,
      metadata: record.metadata
        ? {
            ...record.metadata,
            taskDescription: task?.description ?? record.metadata.taskDescription,
          }
        : record.metadata,
    });
    if (delegation) {
      await updateDelegation(delegation.id, {
        state: 'returned',
        lastWakeAt: Date.now(),
      }).catch((): undefined => undefined);
      if (delegation.teamId) {
        await sendTeamMessageWithBusyRetry({
          teamId: delegation.teamId,
          content: [
            '# Lark task returned',
            '',
            `Task: ${task?.summary ?? record.title}`,
            `Task GUID: ${taskGuid}`,
            delegation.target.kind === 'team_agent'
              ? `Returned by Agent slot: ${delegation.target.slotId}`
              : `Returned by human: ${delegation.target.name || delegation.target.openId}`,
            task?.url ? `URL: ${task.url}` : undefined,
            '',
            'Please read the Lark task description, comments, attachments, and current status, then decide whether to close, split, revise, or ask the owner.',
          ]
            .filter((line): line is string => typeof line === 'string')
            .join('\n'),
        }).catch((error) => {
          status.lastError = error instanceof Error ? error.message : String(error);
        });
      }
    }
  }
}

function consumeChunk(chunk: Buffer): void {
  buffer += chunk.toString('utf8');
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    void handleEventLine(line).catch((error) => {
      status.lastError = error instanceof Error ? error.message : String(error);
    });
  }
}

export function startLarkProjectEventListener(): LarkProjectEventListenerStatus {
  if (child) return getLarkProjectEventListenerStatus();

  const activeProfileName = getLarkProjectAgentCliProfile();
  const args = activeProfileName
    ? ['--profile', activeProfileName, 'event', 'consume', EVENT_KEY, '--as', 'user']
    : ['event', 'consume', EVENT_KEY, '--as', 'user'];
  child = spawn('lark-cli', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  buffer = '';
  status = {
    running: true,
    eventKey: EVENT_KEY,
    startedAt: Date.now(),
    lastEventAt: status.lastEventAt,
    lastError: undefined,
    processedEvents: status.processedEvents,
    updatedTaskGuids: status.updatedTaskGuids,
  };

  child.stdout?.on('data', consumeChunk);
  child.stderr?.on('data', (chunk: Buffer) => {
    const lines = chunk
      .toString('utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (line.includes('[event] ready')) {
        status.lastError = undefined;
        continue;
      }
      if (line.includes('[event] exited')) {
        continue;
      }
      status.lastError = line;
    }
  });
  child.on('exit', (code, signal) => {
    status.running = false;
    if (code && code !== 0) {
      status.lastError = `lark-cli event listener exited with code ${code}${signal ? ` (${signal})` : ''}`;
    }
    child = null;
  });
  child.on('error', (error) => {
    status.running = false;
    status.lastError = error.message;
    child = null;
  });
  commentPollTimer = setInterval(() => {
    void pollFirstCommentDelegations();
  }, 30_000);
  void pollFirstCommentDelegations();

  return getLarkProjectEventListenerStatus();
}

export function stopLarkProjectEventListener(): LarkProjectEventListenerStatus {
  if (child) {
    child.stdin?.end();
    child.kill('SIGTERM');
    child = null;
  }
  if (commentPollTimer) {
    clearInterval(commentPollTimer);
    commentPollTimer = null;
  }
  status.running = false;
  return getLarkProjectEventListenerStatus();
}

export function getLarkProjectEventListenerStatus(): LarkProjectEventListenerStatus {
  return {
    ...status,
    running: Boolean(child) && status.running,
    updatedTaskGuids: [...status.updatedTaskGuids],
  };
}
