/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import {
  getLarkProjectEventListenerStatus,
  startLarkProjectEventListener,
  stopLarkProjectEventListener,
} from './eventListener';
import {
  addTaskComment,
  commentTask,
  configureLarkProjectAgentCli,
  createMarkdownFile,
  createSection,
  createTask,
  createTasklist,
  fetchMarkdownFile,
  getTask,
  getTaskDetail,
  getTasklist,
  getTasklistSourceSnapshot,
  listTaskComments,
  listSections,
  listTasklistTasks,
  listTasklists,
  overwriteMarkdownFile,
  renameTasklist as renameLarkTasklist,
  searchTasklists,
  setTaskCompletion,
  updateTaskDescription,
  updateSectionPlacement,
  updateTask,
  uploadTaskAttachment,
} from './larkCli';
import {
  createPlan,
  getDelegationByTaskGuid,
  getDelegationByTeamRunId,
  getPlan,
  hideTasklist as hideStoredTasklist,
  listCompletedTaskRecords,
  listPromptFiles,
  listSnapshot,
  resetPromptFile,
  getBindingByTasklistGuid,
  getPromptFile,
  getTaskRecord,
  renameLocalTasklist,
  removeLocalConversationLink,
  removeLocalTaskRecord,
  saveBinding,
  saveDelegation,
  savePlan,
  saveTaskRecord,
  updateDelegation,
  updateTasklistLocalState as updateStoredTasklistLocalState,
  updateLocalTaskRecordState,
  updateTaskRecord,
  updatePromptFile,
} from './store';
import {
  createLarkBackedTeam,
  ensureTeamSession,
  getTeam,
  markTeamConversations,
  sendMessageToTeamAgent,
  sendTeamMessage,
  sendTeamMessageWithBusyRetry,
} from './teamClient';
import type {
  LarkProjectDelegateTaskRequest,
  LarkProjectDelegateTaskResult,
  LarkProjectDelegation,
  LarkProjectAgentTaskIntakeRequest,
  LarkProjectAgentTaskIntakeResult,
  LarkProjectAddTaskCommentRequest,
  LarkProjectAddTaskCommentResult,
  LarkProjectAttachConversationRequest,
  LarkProjectAttachConversationResult,
  LarkProjectApprovePlanRequest,
  LarkProjectBindLeaderAgentRequest,
  LarkProjectBindLeaderAgentResult,
  LarkProjectBinding,
  LarkProjectBootstrapRequest,
  LarkProjectBootstrapResult,
  LarkProjectConfigureRequest,
  LarkProjectDocContent,
  LarkProjectDocKind,
  LarkProjectDocRecord,
  LarkProjectDocsBundle,
  LarkProjectEnsureDocsRequest,
  LarkProjectGetDocRequest,
  LarkProjectParticipant,
  LarkProjectPlan,
  LarkProjectPromptRole,
  LarkProjectSaveDocRequest,
  LarkProjectSaveDocResult,
  LarkProjectSetTaskCompletionRequest,
  LarkProjectSetTaskCompletionResult,
  LarkProjectSettingsSnapshot,
  LarkProjectSnapshot,
  LarkProjectTeamChildTurnCompletedRequest,
  LarkProjectTeamChildTurnCompletedResult,
  LarkProjectTaskRecord,
  LarkProjectTemplateSection,
  LarkProjectTickRequest,
  LarkProjectTickResult,
  LarkProjectUpdateTaskRequest,
  LarkProjectUpdateTaskResult,
  LarkProjectUploadTaskAttachmentRequest,
  LarkProjectUploadTaskAttachmentResult,
  LarkTaskDetail,
  LarkTaskSectionSummary,
  LarkTaskSummary,
  LarkTasklistSourceSnapshot,
  LarkTasklistSummary,
} from './types';

function now(): number {
  return Date.now();
}

function assertNonEmpty(value: string | undefined, code: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(code);
  }
  return trimmed;
}

function inferLanguage(text: string | undefined): 'zh' | 'en' {
  return /[\u3400-\u9fff]/.test(text ?? '') ? 'zh' : 'en';
}

function buildAcknowledgementText(input: {
  actorName: string;
  actorKind: 'Agent' | 'Human';
  language?: 'zh' | 'en' | 'auto';
  taskTitle?: string;
}): string {
  const language = input.language === 'auto' || !input.language ? inferLanguage(input.taskTitle) : input.language;
  if (language === 'zh') {
    return `${input.actorName} [${input.actorKind}] 已顺利收到此任务。`;
  }
  return `${input.actorName} [${input.actorKind}] has successfully received this task.`;
}

async function larkInitialCommentSnapshot(taskGuid: string): Promise<{ fingerprint: string; count: number }> {
  const comments = await listTaskComments(taskGuid);
  return {
    fingerprint: comments.map((comment) => `${comment.id}:${comment.updatedAt ?? comment.createdAt ?? 0}`).join('|'),
    count: comments.length,
  };
}

function buildAgentCardDescription(input: LarkProjectDelegateTaskRequest): string {
  const lines = [
    input.target.kind === 'team_agent' ? '[AGENT_TASK]' : undefined,
    `Title: ${input.title}`,
    `Owner: ${input.target.name || (input.target.kind === 'team_agent' ? input.target.slotId : input.target.openId)}`,
    input.tasklistName ? `Project: ${input.tasklistName}` : undefined,
    `Goal: ${input.goal}`,
    input.context ? `Context: ${input.context}` : undefined,
    input.inputs?.length ? ['Inputs:', ...input.inputs.map((item) => `- ${item}`)].join('\n') : undefined,
    input.deliverables?.length
      ? ['Deliverables:', ...input.deliverables.map((item) => `- ${item}`)].join('\n')
      : undefined,
    input.acceptanceCriteria?.length
      ? ['Acceptance Criteria:', ...input.acceptanceCriteria.map((item) => `- ${item}`)].join('\n')
      : undefined,
    input.dueAt ? `Deadline: ${new Date(input.dueAt).toISOString()}` : 'Deadline: none',
    '',
    'Return Format:',
    '- Result',
    '- Evidence / Links / Attachments',
    '- Decisions Made',
    '- Open Questions',
    '- Risks / Blockers',
    '- Suggested Next Step',
  ];
  return lines.filter((line): line is string => typeof line === 'string' && line.length > 0).join('\n');
}

function buildTeamAgentDelegationPrompt(input: {
  request: LarkProjectDelegateTaskRequest;
  taskGuid: string;
  taskUrl?: string;
  delegationId: string;
}): string {
  return [
    '# Delegated Lark Project Task',
    '',
    `Delegation ID: ${input.delegationId}`,
    `Lark Task GUID: ${input.taskGuid}`,
    input.taskUrl ? `Lark Task URL: ${input.taskUrl}` : undefined,
    `Tasklist GUID: ${input.request.tasklistGuid}`,
    input.request.tasklistName ? `Tasklist Name: ${input.request.tasklistName}` : undefined,
    '',
    'You are executing this as a Team Mode teammate slot. The Lark task is the durable task spec and the comment thread is the shared memory.',
    'Acknowledge in the Lark task comments, complete the work, then write the completion packet back to the task comments before returning locally.',
    '',
    '## Task Card',
    buildAgentCardDescription(input.request),
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

async function ensureTeamForBinding(input: {
  binding: LarkProjectBinding;
  tasklistGuid: string;
  tasklistName: string;
  leaderPresetContext?: string;
  agentPresetContext?: string;
}): Promise<LarkProjectBinding> {
  if (input.binding.teamId) {
    const existing = await getTeam(input.binding.teamId);
    if (existing?.id) {
      await ensureTeamSession(existing.id).catch((): undefined => undefined);
      await markTeamConversations({
        team: existing,
        tasklistGuid: input.tasklistGuid,
        tasklistName: input.tasklistName,
        leaderPresetContext: input.leaderPresetContext,
        agentPresetContext: input.agentPresetContext,
      }).catch((): undefined => undefined);
      const leader = existing.agents.find((agent) => agent.slot_id === existing.leader_agent_id) ?? existing.agents.find((agent) => agent.role === 'leader');
      if (
        input.binding.leaderSlotId === leader?.slot_id &&
        input.binding.leaderAgentConversationId === leader?.conversation_id
      ) {
        return input.binding;
      }
      return saveBinding({
        ...input.binding,
        leaderSlotId: leader?.slot_id ?? input.binding.leaderSlotId,
        leaderAgentConversationId: leader?.conversation_id ?? input.binding.leaderAgentConversationId,
      });
    }
  }
  const team = await createLarkBackedTeam({
    name: input.tasklistName,
    tasklistGuid: input.tasklistGuid,
    tasklistName: input.tasklistName,
    leaderName: input.binding.leaderAgentLabel,
  });
  await markTeamConversations({
    team,
    tasklistGuid: input.tasklistGuid,
    tasklistName: input.tasklistName,
    leaderPresetContext: input.leaderPresetContext,
    agentPresetContext: input.agentPresetContext,
  }).catch((): undefined => undefined);
  await ensureTeamSession(team.id).catch((): undefined => undefined);
  const leader = team.agents.find((agent) => agent.slot_id === team.leader_agent_id) ?? team.agents.find((agent) => agent.role === 'leader');
  return saveBinding({
    ...input.binding,
    teamId: team.id,
    leaderSlotId: leader?.slot_id ?? team.leader_agent_id ?? input.binding.leaderSlotId,
    leaderAgentConversationId: leader?.conversation_id ?? input.binding.leaderAgentConversationId,
  });
}

const PROJECT_DETAILS_SECTION_NAME = '项目详情';
const PROJECT_DOC_MARKER_START = '[DEEPSCIENTIST_PROJECT_DOC]';
const PROJECT_DOC_MARKER_END = '[/DEEPSCIENTIST_PROJECT_DOC]';
const PROJECT_DOC_EXTRA_SOURCE = 'deepscientist_lark_project_doc';
const PROJECT_DOC_CONTENT_CACHE_TTL_MS = 5 * 60 * 1000;
const projectDocContentCacheWriteQueues = new Map<string, Promise<void>>();

const PROJECT_DOC_SPECS: Array<{
  kind: LarkProjectDocKind;
  title: string;
  fileName: string;
  purpose: string;
}> = [
  {
    kind: 'metadata',
    title: '项目元信息',
    fileName: 'project-meta.md',
    purpose: '项目目标、范围、任务描述、验收标准和当前状态的事实源。',
  },
  {
    kind: 'staffing',
    title: '人事安排',
    fileName: 'staffing-plan.md',
    purpose: '项目负责人、协作者、下级 Agent、权限边界和汇报关系的事实源。',
  },
  {
    kind: 'timeline',
    title: '时间安排',
    fileName: 'timeline-plan.md',
    purpose: '里程碑、截止日期、检查节奏、日报周报和风险窗口的事实源。',
  },
];

function getProjectDocSpec(kind: LarkProjectDocKind) {
  const spec = PROJECT_DOC_SPECS.find((item) => item.kind === kind);
  if (!spec) {
    throw new Error('LARK_PROJECT_DOC_KIND_UNSUPPORTED');
  }
  return spec;
}

function buildProjectDocTemplate(input: {
  kind: LarkProjectDocKind;
  tasklistName: string;
  createdAt: number;
}): string {
  const date = new Date(input.createdAt).toLocaleString();
  if (input.kind === 'metadata') {
    return [
      `# ${input.tasklistName} 项目元信息`,
      '',
      '> 本文件是项目负责人 Agent 和所有下级 Agent 的项目事实源。请优先维护这里，再创建或调整具体任务。',
      '',
      '## 项目目标',
      '- ',
      '',
      '## 背景与任务描述',
      '- ',
      '',
      '## 范围',
      '- 包含：',
      '- 不包含：',
      '',
      '## 验收标准',
      '- ',
      '',
      '## 关键输入与资料',
      '- ',
      '',
      '## 当前状态',
      '- 计划中',
      '',
      '## 风险与限制',
      '- ',
      '',
      `创建时间：${date}`,
      '',
    ].join('\n');
  }
  if (input.kind === 'staffing') {
    return [
      `# ${input.tasklistName} 人事安排`,
      '',
      '> 本文件记录项目团队结构、职责和审批边界。未写清楚负责人和验收人前，不应指派具体任务。',
      '',
      '## 项目负责人',
      '- 姓名/角色：',
      '- 负责人 Agent：',
      '',
      '## 协作者与下级 Agent',
      '| 成员 | 类型 | 职责 | 汇报对象 | 权限边界 |',
      '| --- | --- | --- | --- | --- |',
      '|  | Human/Agent |  |  |  |',
      '',
      '## 沟通与汇报',
      '- 日报：',
      '- 周报：',
      '- 关键节点回流：',
      '',
      '## 审批规则',
      '- 新增上级或跨部门成员：需负责人确认。',
      '- 创建、指派、关闭高影响任务：需负责人确认。',
      '',
      `创建时间：${date}`,
      '',
    ].join('\n');
  }
  return [
    `# ${input.tasklistName} 时间安排`,
    '',
    '> 本文件记录项目推进节奏。任务截止时间和里程碑应尽量与这里保持一致。',
    '',
    '## 总体周期',
    '- 开始时间：',
    '- 目标完成时间：',
    '',
    '## 里程碑',
    '| 阶段 | 目标 | 截止时间 | 验收方式 | 状态 |',
    '| --- | --- | --- | --- | --- |',
    '| 1 |  |  |  | 计划中 |',
    '',
    '## 检查点',
    '- 每日检查：',
    '- 每周总结：',
    '- 风险复盘：',
    '',
    '## 时间风险',
    '- ',
    '',
    `创建时间：${date}`,
    '',
  ].join('\n');
}

function buildDocTaskDescription(input: {
  doc: LarkProjectDocRecord;
  purpose: string;
  includeLegacyMarker?: boolean;
}): string {
  const legacyMarker = input.includeLegacyMarker
    ? [
        PROJECT_DOC_MARKER_START,
        `kind: ${input.doc.kind}`,
        `file_token: ${input.doc.fileToken}`,
        `file_name: ${input.doc.fileName}`,
        `tasklist_guid: ${input.doc.tasklistGuid}`,
        input.doc.url ? `url: ${input.doc.url}` : undefined,
        `updated_at: ${input.doc.updatedAt}`,
        PROJECT_DOC_MARKER_END,
        '',
      ].filter((line): line is string => typeof line === 'string')
    : [];
  return [
    ...legacyMarker,
    `${input.doc.title} 是本项目的必备 Markdown 源文件。`,
    input.purpose,
    '',
    '请通过 DeepScientist PRO 项目页顶部按钮打开和保存此文件；负责人 Agent 和下级 Agent 应把它作为项目上下文来源。',
  ].join('\n');
}

function buildDocTaskExtra(doc: LarkProjectDocRecord): string {
  return JSON.stringify({
    source: PROJECT_DOC_EXTRA_SOURCE,
    kind: 'project_doc',
    projectDocKind: doc.kind,
    fileToken: doc.fileToken,
    fileName: doc.fileName,
    tasklistGuid: doc.tasklistGuid,
    url: doc.url,
    updatedAt: doc.updatedAt,
  });
}

function parseDocTaskDescription(input: {
  description?: string;
  extra?: string;
  title: string;
  taskGuid: string;
  sectionGuid?: string;
  tasklistGuid: string;
}): LarkProjectDocRecord | undefined {
  if (input.extra) {
    try {
      const parsed = JSON.parse(input.extra) as {
        source?: string;
        projectDocKind?: LarkProjectDocKind;
        fileToken?: string;
        fileName?: string;
        tasklistGuid?: string;
        url?: string;
        updatedAt?: number;
      };
      const kind = parsed.projectDocKind;
      if (parsed.source === PROJECT_DOC_EXTRA_SOURCE && kind && parsed.fileToken) {
        const timestamp = Number(parsed.updatedAt) || now();
        return {
          kind,
          title: getProjectDocSpec(kind).title,
          fileName: parsed.fileName || getProjectDocSpec(kind).fileName,
          fileToken: parsed.fileToken,
          tasklistGuid: input.tasklistGuid,
          sectionGuid: input.sectionGuid,
          taskGuid: input.taskGuid,
          url: parsed.url,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      }
    } catch {
      // Fall through to legacy marker parsing.
    }
  }
  const description = input.description ?? '';
  const start = description.indexOf(PROJECT_DOC_MARKER_START);
  const end = description.indexOf(PROJECT_DOC_MARKER_END);
  if (start < 0 || end <= start) return undefined;
  const body = description.slice(start + PROJECT_DOC_MARKER_START.length, end);
  const fields = new Map<string, string>();
  for (const rawLine of body.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/i);
    if (match) fields.set(match[1].toLowerCase(), match[2]);
  }
  const kind = fields.get('kind') as LarkProjectDocKind | undefined;
  if (!kind || !PROJECT_DOC_SPECS.some((spec) => spec.kind === kind)) return undefined;
  const fileToken = fields.get('file_token');
  const fileName = fields.get('file_name') || getProjectDocSpec(kind).fileName;
  if (!fileToken) return undefined;
  const timestamp = Number(fields.get('updated_at')) || now();
  return {
    kind,
    title: getProjectDocSpec(kind).title,
    fileName,
    fileToken,
    tasklistGuid: input.tasklistGuid,
    sectionGuid: input.sectionGuid,
    taskGuid: input.taskGuid,
    url: fields.get('url'),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function docsContextLines(docs: LarkProjectDocRecord[] | undefined): string[] {
  if (!docs?.length) return [];
  return [
    '## Required Project Source Markdown Files',
    'These three files are the project-level memory and source of truth. Read and update them before making structural project decisions.',
    ...PROJECT_DOC_SPECS.map((spec) => {
      const doc = docs.find((item) => item.kind === spec.kind);
      return doc
        ? `- ${spec.title}: ${doc.fileName} (file token: ${doc.fileToken})`
        : `- ${spec.title}: missing; ensure/create it before execution.`;
    }),
    '',
  ];
}

function buildDefaultTemplate(input: { startAt?: number; dueAt?: number }): LarkProjectTemplateSection[] {
  void input;
  return [];
}

async function buildLeaderAgentStarterPrompt(input: {
  plan: LarkProjectPlan;
  binding?: LarkProjectBinding;
}): Promise<string> {
  const leaderPrompt = await getPromptFile('leader');
  const plan = input.plan;
  return [
    leaderPrompt.content.trim(),
    '',
    '# Project Leader Agent Startup Context',
    '',
    `Project: ${plan.title}`,
    `Plan ID: ${plan.id}`,
    `Plan State: ${plan.state}`,
    input.binding?.tasklistGuid ? `Tasklist GUID: ${input.binding.tasklistGuid}` : undefined,
    `Tasklist Name: ${plan.tasklistName}`,
    '',
    ...docsContextLines(input.binding?.projectDocs),
    '## Current Rule',
    'The project is still in planning unless the owner explicitly approves the plan. Do not create, assign, or modify concrete Lark tasks before approval.',
    '',
    '## Required Skill / SOP',
    '- Follow the bundled lark-project-agent SOP for task descriptions, task comments, attachments, and memory sync.',
    '- Use Lark task descriptions for durable task specs and Lark task comments for chronological memory.',
    '',
    '## First Conversation Goal',
    '- Confirm the project objective, scope, contacts, responsibilities, milestones, and acceptance criteria with the project owner.',
    '- Produce a concrete execution plan and ask the owner for approval before writing anything to Lark.',
    '- After approval, use the bound Lark tasklist as the execution queue.',
    '',
    plan.description ? `## Owner Description\n${plan.description}` : undefined,
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

function normalizeParticipants(participants: LarkProjectParticipant[] | undefined): LarkProjectParticipant[] {
  return (participants ?? []).filter((item) => item.id.trim() && item.name.trim());
}

export function configureProjectAgent(request: LarkProjectConfigureRequest = {}): void {
  configureLarkProjectAgentCli(request.profileName);
}

export async function getSettingsSnapshot(): Promise<LarkProjectSettingsSnapshot> {
  return {
    promptFiles: await listPromptFiles(),
  };
}

export async function updatePrompt(role: LarkProjectPromptRole, content: string): Promise<LarkProjectSettingsSnapshot> {
  await updatePromptFile(role, content);
  return getSettingsSnapshot();
}

export async function resetPrompt(role: LarkProjectPromptRole): Promise<LarkProjectSettingsSnapshot> {
  await resetPromptFile(role);
  return getSettingsSnapshot();
}

export async function searchExistingTasklists(query: string): Promise<LarkTasklistSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return searchTasklists(trimmed);
}

export async function listExistingTasklists(limit?: number): Promise<LarkTasklistSummary[]> {
  return listTasklists(limit);
}

export async function getProjectSnapshot(): Promise<LarkProjectSnapshot> {
  return listSnapshot();
}

export async function hideProjectTasklist(request: { tasklistGuid: string }): Promise<LarkProjectSnapshot> {
  return hideStoredTasklist(assertNonEmpty(request.tasklistGuid, 'LARK_TASKLIST_GUID_REQUIRED'));
}

export async function updateProjectTasklistLocalState(request: {
  tasklistGuid: string;
  visible?: boolean;
  pinned?: boolean;
  pinnedAt?: number;
}): Promise<LarkProjectSnapshot> {
  const tasklistGuid = assertNonEmpty(request.tasklistGuid, 'LARK_TASKLIST_GUID_REQUIRED');
  return updateStoredTasklistLocalState({
    tasklistGuid,
    visible: request.visible,
    pinned: request.pinned,
    pinnedAt: request.pinned ? (request.pinnedAt ?? now()) : undefined,
  });
}

export async function removeProjectConversationLink(request: {
  conversationId: string;
  tasklistGuid?: string;
}): Promise<LarkProjectSnapshot> {
  const conversationId = assertNonEmpty(request.conversationId, 'LARK_CONVERSATION_ID_REQUIRED');
  return removeLocalConversationLink({
    conversationId,
    tasklistGuid: request.tasklistGuid?.trim() || undefined,
  });
}

export async function removeProjectTaskRecord(request: { recordId: string }): Promise<LarkProjectSnapshot> {
  return removeLocalTaskRecord(assertNonEmpty(request.recordId, 'LARK_TASK_RECORD_ID_REQUIRED'));
}

export async function updateProjectTaskRecordLocalState(request: {
  recordId: string;
  localTitle?: string;
  pinned?: boolean;
  pinnedAt?: number;
}): Promise<LarkProjectSnapshot> {
  return updateLocalTaskRecordState({
    recordId: assertNonEmpty(request.recordId, 'LARK_TASK_RECORD_ID_REQUIRED'),
    localTitle: request.localTitle,
    pinned: request.pinned,
    pinnedAt: request.pinnedAt,
  });
}

export async function renameProjectTasklist(request: {
  tasklistGuid: string;
  name: string;
}): Promise<LarkProjectSnapshot> {
  const tasklistGuid = assertNonEmpty(request.tasklistGuid, 'LARK_TASKLIST_GUID_REQUIRED');
  const name = assertNonEmpty(request.name, 'LARK_TASKLIST_NAME_REQUIRED');
  const tasklist = await renameLarkTasklist({ tasklistGuid, name });
  return renameLocalTasklist({
    tasklistGuid,
    name: tasklist.name || name,
    url: tasklist.url,
    updatedAt: tasklist.updatedAt ?? now(),
  });
}

export async function getLarkTasklistSnapshot(tasklistGuid: string): Promise<LarkTasklistSourceSnapshot> {
  return getTasklistSourceSnapshot(assertNonEmpty(tasklistGuid, 'LARK_TASKLIST_GUID_REQUIRED'));
}

export async function getLarkTaskDetail(taskGuid: string): Promise<LarkTaskDetail> {
  return getTaskDetail(assertNonEmpty(taskGuid, 'LARK_TASK_GUID_REQUIRED'));
}

export async function addLarkTaskComment(
  request: LarkProjectAddTaskCommentRequest
): Promise<LarkProjectAddTaskCommentResult> {
  const taskGuid = assertNonEmpty(request.taskGuid, 'LARK_TASK_GUID_REQUIRED');
  const content = assertNonEmpty(request.content, 'LARK_TASK_COMMENT_CONTENT_REQUIRED');
  const comment = await addTaskComment({
    taskGuid,
    content,
    replyToCommentId: request.replyToCommentId?.trim() || undefined,
  });
  return {
    taskGuid,
    comment,
  };
}

export async function uploadLarkTaskAttachment(
  request: LarkProjectUploadTaskAttachmentRequest
): Promise<LarkProjectUploadTaskAttachmentResult> {
  const taskGuid = assertNonEmpty(request.taskGuid, 'LARK_TASK_GUID_REQUIRED');
  const filePath = assertNonEmpty(request.filePath, 'LARK_TASK_ATTACHMENT_FILE_REQUIRED');
  const attachment = await uploadTaskAttachment({ taskGuid, filePath });
  const commentText = request.comment?.trim() || `附件已上传：${attachment.name}`;
  const comment = await addTaskComment({ taskGuid, content: commentText });
  return {
    taskGuid,
    attachment,
    comment,
  };
}

export async function setLarkTaskCompletion(
  request: LarkProjectSetTaskCompletionRequest
): Promise<LarkProjectSetTaskCompletionResult> {
  const taskGuid = assertNonEmpty(request.taskGuid, 'LARK_TASK_GUID_REQUIRED');
  const task = await setTaskCompletion({ taskGuid, completed: request.completed });
  return {
    taskGuid,
    task,
  };
}

export async function updateLarkTask(request: LarkProjectUpdateTaskRequest): Promise<LarkProjectUpdateTaskResult> {
  const taskGuid = assertNonEmpty(request.taskGuid, 'LARK_TASK_GUID_REQUIRED');
  const task = await updateTask({
    taskGuid,
    dueAt: request.dueAt,
  });
  return {
    taskGuid,
    task,
  };
}

function orderedProjectDocs(docs: LarkProjectDocRecord[]): LarkProjectDocRecord[] {
  const byKind = new Map(docs.map((doc) => [doc.kind, doc]));
  return PROJECT_DOC_SPECS.map((spec) => byKind.get(spec.kind)).filter((doc): doc is LarkProjectDocRecord => Boolean(doc));
}

function mergeCachedProjectDoc(
  nextDoc: LarkProjectDocRecord,
  previousDoc: LarkProjectDocRecord | undefined
): LarkProjectDocRecord {
  if (previousDoc?.contentCache === undefined || previousDoc.fileToken !== nextDoc.fileToken) return nextDoc;
  return {
    ...nextDoc,
    contentCache: previousDoc.contentCache,
    contentCachedAt: previousDoc.contentCachedAt,
  };
}

async function saveProjectDocsBinding(input: {
  tasklistGuid: string;
  tasklistName: string;
  sectionGuid?: string;
  docs: LarkProjectDocRecord[];
}): Promise<LarkProjectBinding> {
  const existing = await getBindingByTasklistGuid(input.tasklistGuid);
  const timestamp = now();
  return saveBinding({
    id: existing?.id ?? `lark-binding-${randomUUID()}`,
    projectId: existing?.projectId ?? `lark-project-${input.tasklistGuid}`,
    tasklistGuid: input.tasklistGuid,
    tasklistName: input.tasklistName,
    leaderAgentConversationId: existing?.leaderAgentConversationId,
    leaderAgentPendingPrompt: existing?.leaderAgentPendingPrompt,
    leaderAgentLabel: existing?.leaderAgentLabel ?? '负责人 Agent',
    teamId: existing?.teamId,
    leaderSlotId: existing?.leaderSlotId,
    paused: existing?.paused,
    state: existing?.state ?? 'planning',
    planId: existing?.planId,
    sectionGuidsByName: {
      ...existing?.sectionGuidsByName,
      ...(input.sectionGuid ? { [PROJECT_DETAILS_SECTION_NAME]: input.sectionGuid } : {}),
    },
    metaTaskGuidsByTitle: existing?.metaTaskGuidsByTitle ?? {},
    projectDetailsSectionGuid: input.sectionGuid ?? existing?.projectDetailsSectionGuid,
    projectDocs: orderedProjectDocs(input.docs),
    participantIds: existing?.participantIds ?? [],
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}

async function saveProjectDocContentCache(input: {
  tasklistGuid: string;
  tasklistName?: string;
  sectionGuid?: string;
  docs?: LarkProjectDocRecord[];
  doc: LarkProjectDocRecord;
}): Promise<void> {
  const previousQueue = projectDocContentCacheWriteQueues.get(input.tasklistGuid) ?? Promise.resolve();
  let nextQueue: Promise<void>;
  nextQueue = previousQueue
    .catch((): undefined => undefined)
    .then(async () => {
      const latestBinding = await getBindingByTasklistGuid(input.tasklistGuid).catch((): undefined => undefined);
      const baseDocs =
        latestBinding?.projectDocs?.length ? latestBinding.projectDocs : input.docs?.length ? input.docs : [input.doc];
      const nextDocs = baseDocs.some((doc) => doc.kind === input.doc.kind)
        ? baseDocs.map((doc) => (doc.kind === input.doc.kind ? input.doc : doc))
        : [...baseDocs, input.doc];
      await saveProjectDocsBinding({
        tasklistGuid: input.tasklistGuid,
        tasklistName: latestBinding?.tasklistName || input.tasklistName || '协作项目',
        sectionGuid: latestBinding?.projectDetailsSectionGuid ?? input.sectionGuid ?? input.doc.sectionGuid,
        docs: nextDocs,
      });
    })
    .finally(() => {
      if (projectDocContentCacheWriteQueues.get(input.tasklistGuid) === nextQueue) {
        projectDocContentCacheWriteQueues.delete(input.tasklistGuid);
      }
    });
  projectDocContentCacheWriteQueues.set(input.tasklistGuid, nextQueue);
  await nextQueue;
}

async function ensureProjectDetailsSection(input: {
  tasklistGuid: string;
  preferredGuid?: string;
  sections?: LarkTaskSectionSummary[];
}): Promise<string> {
  const sections = input.sections ?? (await listSections(input.tasklistGuid));
  const existing =
    sections.find((section) => section.guid === input.preferredGuid) ??
    sections.find((section) => section.name === PROJECT_DETAILS_SECTION_NAME);
  const firstCustomSection = sections.find((section) => !section.isDefault);
  if (existing) {
    if (firstCustomSection && firstCustomSection.guid !== existing.guid) {
      await updateSectionPlacement({
        sectionGuid: existing.guid,
        insertBefore: firstCustomSection.guid,
      }).catch((): undefined => undefined);
    }
    return existing.guid;
  }
  return createSection({ tasklistGuid: input.tasklistGuid, name: PROJECT_DETAILS_SECTION_NAME });
}

function findReusableProjectDocTask(input: {
  kind: LarkProjectDocKind;
  tasks: LarkTasklistSourceSnapshot['openTasks'];
  sectionGuid?: string;
}) {
  const spec = getProjectDocSpec(input.kind);
  return (
    input.tasks.find((task) => task.summary === spec.title && (!input.sectionGuid || task.sectionGuid === input.sectionGuid)) ??
    input.tasks.find((task) => task.summary === spec.fileName && (!input.sectionGuid || task.sectionGuid === input.sectionGuid))
  );
}

export async function ensureProjectDocs(
  request: LarkProjectEnsureDocsRequest
): Promise<LarkProjectDocsBundle> {
  const tasklistGuid = assertNonEmpty(request.tasklistGuid, 'LARK_TASKLIST_GUID_REQUIRED');
  const existingBinding = await getBindingByTasklistGuid(tasklistGuid);
  const [tasklist, sections, openTasks, completedTasks] = await Promise.all([
    getTasklist(tasklistGuid),
    listSections(tasklistGuid),
    listTasklistTasks({ tasklistGuid, completed: false }),
    listTasklistTasks({ tasklistGuid, completed: true }).catch((): LarkTaskSummary[] => []),
  ]);
  const tasklistName = request.tasklistName?.trim() || tasklist.name || existingBinding?.tasklistName || '协作项目';
  const sectionGuid = await ensureProjectDetailsSection({
    tasklistGuid,
    preferredGuid: existingBinding?.projectDetailsSectionGuid,
    sections,
  });
  const allTasks = [...openTasks, ...completedTasks];
  const parsedDocs = new Map<LarkProjectDocKind, LarkProjectDocRecord>();
  for (const task of allTasks) {
    const parsed = parseDocTaskDescription({
      description: task.description,
      extra: task.extra,
      title: task.summary,
      taskGuid: task.guid,
      sectionGuid: task.sectionGuid,
      tasklistGuid,
    });
    if (parsed) parsedDocs.set(parsed.kind, parsed);
  }
  for (const doc of existingBinding?.projectDocs ?? []) {
    if (!parsedDocs.has(doc.kind)) parsedDocs.set(doc.kind, doc);
  }

  const docs: LarkProjectDocRecord[] = [];
  const timestamp = now();
  for (const spec of PROJECT_DOC_SPECS) {
    let doc = parsedDocs.get(spec.kind);
    const previouslyBoundDoc = existingBinding?.projectDocs?.find((item) => item.kind === spec.kind);
    const reusableTask = findReusableProjectDocTask({ kind: spec.kind, tasks: allTasks, sectionGuid });
    if (!doc) {
      const file = await createMarkdownFile({
        fileName: spec.fileName,
        content: buildProjectDocTemplate({
          kind: spec.kind,
          tasklistName,
          createdAt: timestamp,
        }),
      });
      doc = {
        kind: spec.kind,
        title: spec.title,
        fileName: file.fileName,
        fileToken: file.fileToken,
        tasklistGuid,
        sectionGuid,
        taskGuid: reusableTask?.guid,
        url: file.url,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }

    const docWithSection: LarkProjectDocRecord = {
      ...doc,
      title: spec.title,
      fileName: doc.fileName || spec.fileName,
      tasklistGuid,
      sectionGuid: doc.sectionGuid ?? reusableTask?.sectionGuid ?? sectionGuid,
      taskGuid: doc.taskGuid ?? reusableTask?.guid,
    };
    const description = buildDocTaskDescription({ doc: docWithSection, purpose: spec.purpose });
    const extra = buildDocTaskExtra(docWithSection);
    if (docWithSection.taskGuid) {
      const task = allTasks.find((item) => item.guid === docWithSection.taskGuid);
      if (task?.description !== description || task?.extra !== extra) {
        await updateTaskDescription({
          taskGuid: docWithSection.taskGuid,
          description,
          extra,
        }).catch(async (): Promise<undefined> => {
          await updateTaskDescription({
            taskGuid: docWithSection.taskGuid as string,
            description: buildDocTaskDescription({
              doc: docWithSection,
              purpose: spec.purpose,
              includeLegacyMarker: true,
            }),
          }).catch((): undefined => undefined);
          return undefined;
        });
      }
      docs.push(mergeCachedProjectDoc(docWithSection, previouslyBoundDoc ?? parsedDocs.get(spec.kind) ?? doc));
      continue;
    }
    const createdTask = await createTask({
      tasklistGuid,
      sectionGuid,
      summary: spec.title,
      description,
      extra,
    });
    docs.push(
      mergeCachedProjectDoc(
        {
          ...docWithSection,
          sectionGuid,
          taskGuid: createdTask.guid,
          updatedAt: now(),
        },
        previouslyBoundDoc ?? parsedDocs.get(spec.kind) ?? doc
      )
    );
  }

  await saveProjectDocsBinding({
    tasklistGuid,
    tasklistName,
    sectionGuid,
    docs,
  });

  return {
    tasklistGuid,
    tasklistName,
    sectionGuid,
    docs: orderedProjectDocs(docs),
    ensuredAt: now(),
  };
}

export async function getProjectDoc(request: LarkProjectGetDocRequest): Promise<LarkProjectDocContent> {
  const tasklistGuid = assertNonEmpty(request.tasklistGuid, 'LARK_TASKLIST_GUID_REQUIRED');
  const existingBinding = await getBindingByTasklistGuid(tasklistGuid);
  const cachedDoc = existingBinding?.projectDocs?.find((item) => item.kind === request.kind && item.fileToken);
  if (
    cachedDoc?.contentCache !== undefined &&
    cachedDoc.contentCachedAt &&
    now() - cachedDoc.contentCachedAt < PROJECT_DOC_CONTENT_CACHE_TTL_MS
  ) {
    return {
      doc: cachedDoc,
      content: cachedDoc.contentCache,
      fetchedAt: cachedDoc.contentCachedAt,
    };
  }
  if (cachedDoc) {
    try {
      const fetched = await fetchMarkdownFile(cachedDoc.fileToken);
      const fetchedAt = now();
      const updatedDoc: LarkProjectDocRecord = {
        ...cachedDoc,
        fileName: fetched.file?.fileName || cachedDoc.fileName,
        url: fetched.file?.url || cachedDoc.url,
        updatedAt: fetchedAt,
        contentCache: fetched.content,
        contentCachedAt: fetchedAt,
      };
      if (existingBinding?.projectDocs?.length) {
        await saveProjectDocContentCache({
          tasklistGuid,
          tasklistName: existingBinding.tasklistName || request.tasklistName,
          sectionGuid: existingBinding.projectDetailsSectionGuid,
          docs: existingBinding.projectDocs,
          doc: updatedDoc,
        }).catch((): undefined => undefined);
      }
      return {
        doc: updatedDoc,
        content: fetched.content,
        fetchedAt,
      };
    } catch {
      // Fall through to the full ensure path when a cached Drive token is stale
      // or the file permission changed outside DeepScientist.
    }
  }
  const bundle = await ensureProjectDocs({
    tasklistGuid,
    tasklistName: request.tasklistName,
  });
  const doc = bundle.docs.find((item) => item.kind === request.kind);
  if (!doc) {
    throw new Error('LARK_PROJECT_DOC_NOT_FOUND');
  }
  const fetched = await fetchMarkdownFile(doc.fileToken);
  const fetchedAt = now();
  const updatedDoc: LarkProjectDocRecord = {
    ...doc,
    fileName: fetched.file?.fileName || doc.fileName,
    url: fetched.file?.url || doc.url,
    updatedAt: fetchedAt,
    contentCache: fetched.content,
    contentCachedAt: fetchedAt,
  };
  await saveProjectDocContentCache({
    tasklistGuid: bundle.tasklistGuid,
    tasklistName: bundle.tasklistName,
    sectionGuid: bundle.sectionGuid,
    docs: bundle.docs,
    doc: updatedDoc,
  }).catch((): undefined => undefined);
  return {
    doc: updatedDoc,
    content: fetched.content,
    fetchedAt,
  };
}

export async function saveProjectDoc(request: LarkProjectSaveDocRequest): Promise<LarkProjectSaveDocResult> {
  const content = request.content ?? '';
  const bundle = await ensureProjectDocs({
    tasklistGuid: request.tasklistGuid,
    tasklistName: request.tasklistName,
  });
  const doc = bundle.docs.find((item) => item.kind === request.kind);
  if (!doc) {
    throw new Error('LARK_PROJECT_DOC_NOT_FOUND');
  }
  const saved = await overwriteMarkdownFile({
    fileToken: doc.fileToken,
    fileName: doc.fileName,
    content,
  });
  const updatedDoc: LarkProjectDocRecord = {
    ...doc,
    fileName: saved.fileName || doc.fileName,
    fileToken: saved.fileToken || doc.fileToken,
    url: saved.url || doc.url,
    updatedAt: now(),
    contentCache: content,
    contentCachedAt: now(),
  };
  const docs = orderedProjectDocs(bundle.docs.map((item) => (item.kind === updatedDoc.kind ? updatedDoc : item)));
  await saveProjectDocsBinding({
    tasklistGuid: bundle.tasklistGuid,
    tasklistName: bundle.tasklistName,
    sectionGuid: bundle.sectionGuid,
    docs,
  });
  if (updatedDoc.taskGuid) {
    const spec = getProjectDocSpec(updatedDoc.kind);
    await updateTaskDescription({
      taskGuid: updatedDoc.taskGuid,
      description: buildDocTaskDescription({ doc: updatedDoc, purpose: spec.purpose }),
      extra: buildDocTaskExtra(updatedDoc),
    }).catch((): undefined => undefined);
  }
  return {
    doc: updatedDoc,
    version: saved.version,
    savedAt: updatedDoc.updatedAt,
  };
}

export function startEventListener() {
  return startLarkProjectEventListener();
}

export function stopEventListener() {
  return stopLarkProjectEventListener();
}

export function getEventListenerStatus() {
  return getLarkProjectEventListenerStatus();
}

async function savePlanningBinding(input: {
  plan: LarkProjectPlan;
  tasklist: LarkTasklistSummary;
  state?: LarkProjectBinding['state'];
  sectionGuidsByName?: Record<string, string>;
  metaTaskGuidsByTitle?: Record<string, string>;
  projectDetailsSectionGuid?: string;
  projectDocs?: LarkProjectDocRecord[];
}): Promise<LarkProjectBinding> {
  const existing = await getBindingByTasklistGuid(input.tasklist.guid);
  const timestamp = now();
  return saveBinding({
    id: existing?.id ?? `lark-binding-${randomUUID()}`,
    projectId: input.plan.projectId || existing?.projectId || `lark-project-${input.tasklist.guid}`,
    tasklistGuid: input.tasklist.guid,
    tasklistName: input.tasklist.name,
    leaderAgentConversationId: existing?.leaderAgentConversationId,
    leaderAgentPendingPrompt: existing?.leaderAgentPendingPrompt,
    leaderAgentLabel: input.plan.leaderAgentLabel,
    teamId: existing?.teamId,
    leaderSlotId: existing?.leaderSlotId,
    paused: existing?.paused,
    state: input.state ?? existing?.state ?? 'planning',
    planId: input.plan.id,
    sectionGuidsByName: input.sectionGuidsByName ?? existing?.sectionGuidsByName ?? {},
    metaTaskGuidsByTitle: input.metaTaskGuidsByTitle ?? existing?.metaTaskGuidsByTitle ?? {},
    projectDetailsSectionGuid: input.projectDetailsSectionGuid ?? existing?.projectDetailsSectionGuid,
    projectDocs: input.projectDocs ?? existing?.projectDocs,
    participantIds: input.plan.participants.map((participant) => participant.id),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}

export async function bindLeaderAgentToTasklist(
  request: LarkProjectBindLeaderAgentRequest
): Promise<LarkProjectBindLeaderAgentResult> {
  const tasklistGuid = assertNonEmpty(request.tasklistGuid, 'LARK_TASKLIST_GUID_REQUIRED');
  const title = assertNonEmpty(request.projectTitle || request.tasklistName || '协作项目', 'LARK_PROJECT_TITLE_REQUIRED');
  const tasklistName = request.tasklistName?.trim() || title;
  const result = await bootstrapProject({
    title,
    description: request.projectDescription?.trim() || undefined,
    tasklistGuid,
    tasklistName,
    leaderAgentLabel: request.leaderAgentLabel?.trim() || '负责人 Agent',
    participants: normalizeParticipants(request.participants),
    createLarkResources: false,
  });
  if (!result.binding) {
    throw new Error('LARK_PROJECT_BINDING_CREATE_FAILED');
  }
  await ensureProjectDocs({ tasklistGuid, tasklistName });
  let bindingWithDocs = (await getBindingByTasklistGuid(tasklistGuid)) ?? result.binding;
  const leaderPrompt = await buildLeaderAgentStarterPrompt({ plan: result.plan, binding: bindingWithDocs });
  const agentPrompt = (await getPromptFile('agent-task')).content.trim();
  bindingWithDocs = await ensureTeamForBinding({
    binding: bindingWithDocs,
    tasklistGuid,
    tasklistName,
    leaderPresetContext: leaderPrompt,
    agentPresetContext: agentPrompt,
  }).catch(
    async (error): Promise<LarkProjectBinding> =>
      saveBinding({
        ...bindingWithDocs,
        state: 'blocked',
        leaderAgentPendingPrompt: `${bindingWithDocs.leaderAgentPendingPrompt ?? ''}\n\nTeam Mode binding failed: ${
          error instanceof Error ? error.message : String(error)
        }`.trim(),
      })
  );
  const binding = bindingWithDocs.leaderAgentConversationId
    ? bindingWithDocs.leaderAgentPendingPrompt
      ? await saveBinding({
          ...bindingWithDocs,
          leaderAgentPendingPrompt: undefined,
        })
      : bindingWithDocs
    : await saveBinding({
        ...bindingWithDocs,
        leaderAgentPendingPrompt: leaderPrompt,
      });
  return {
    plan: result.plan,
    binding,
    leaderPrompt,
  };
}

export async function attachConversationToProject(
  request: LarkProjectAttachConversationRequest
): Promise<LarkProjectAttachConversationResult> {
  const conversationId = assertNonEmpty(request.conversationId, 'LARK_PROJECT_CONVERSATION_ID_REQUIRED');
  const tasklistGuid = assertNonEmpty(request.tasklistGuid, 'LARK_TASKLIST_GUID_REQUIRED');
  if (request.role !== 'leader') {
    return {};
  }

  const existing = await getBindingByTasklistGuid(tasklistGuid);
  if (
    existing?.leaderAgentConversationId &&
    existing.leaderAgentConversationId !== conversationId &&
    !request.replaceExistingLeader
  ) {
    return {
      binding: existing,
    };
  }
  const fallbackName = request.tasklistName?.trim() || existing?.tasklistName || '多人协作项目';
  const binding =
    existing ??
    (
      await bindLeaderAgentToTasklist({
        tasklistGuid,
        tasklistName: fallbackName,
        projectTitle: fallbackName,
        leaderAgentLabel: '负责人 Agent',
      })
    ).binding;

  return {
    binding: await saveBinding({
      ...binding,
      leaderAgentConversationId: conversationId,
      leaderAgentPendingPrompt: undefined,
    }),
  };
}

export async function bootstrapProject(request: LarkProjectBootstrapRequest): Promise<LarkProjectBootstrapResult> {
  const title = assertNonEmpty(request.title, 'LARK_PROJECT_TITLE_REQUIRED');
  const tasklistName = request.tasklistName?.trim() || title;
  const leaderAgentLabel = request.leaderAgentLabel?.trim() || '负责人 Agent';
  const plan = await createPlan({
    title,
    description: request.description?.trim() || undefined,
    projectId: request.projectId?.trim() || undefined,
    tasklistGuid: request.tasklistGuid?.trim() || undefined,
    tasklistName,
    startAt: request.startAt,
    dueAt: request.dueAt,
    leaderAgentLabel,
    participants: normalizeParticipants(request.participants),
    template: buildDefaultTemplate({ startAt: request.startAt, dueAt: request.dueAt }),
    notes: ['计划未批准前不会创建清单、分组、任务或指派成员。', '请先与负责人确认联系人、职责、时间节点和验收标准。'],
  });

  if (!request.createLarkResources) {
    if (request.tasklistGuid?.trim()) {
      const tasklist = {
        guid: request.tasklistGuid.trim(),
        name: tasklistName,
      };
      const binding = await savePlanningBinding({ plan, tasklist });
      return { plan, binding, tasklist };
    }
    return { plan };
  }

  return approveAndMaybeExecutePlan({ planId: plan.id, execute: true });
}

export async function createTasklistProject(request: LarkProjectBootstrapRequest): Promise<LarkProjectBootstrapResult> {
  const title = assertNonEmpty(request.title, 'LARK_PROJECT_TITLE_REQUIRED');
  const tasklist = await createTasklist(request.tasklistName?.trim() || title);
  const result = await bootstrapProject({
    ...request,
    title,
    tasklistGuid: tasklist.guid,
    tasklistName: tasklist.name,
    createLarkResources: false,
  });
  return {
    ...result,
    tasklist,
  };
}

export async function approveAndMaybeExecutePlan(
  request: LarkProjectApprovePlanRequest
): Promise<LarkProjectBootstrapResult> {
  const plan = await getPlan(request.planId);
  if (!plan) {
    throw new Error('LARK_PROJECT_PLAN_NOT_FOUND');
  }
  const approvedPlan: LarkProjectPlan = await savePlan({
    ...plan,
    state: request.execute ? 'executed' : 'approved',
    approvedAt: now(),
  });
  if (!request.execute) {
    return { plan: approvedPlan };
  }

  const tasklist = plan.tasklistGuid
    ? { guid: plan.tasklistGuid, name: plan.tasklistName }
    : await createTasklist(plan.tasklistName);
  const sectionGuidsByName: Record<string, string> = {};
  const metaTaskGuidsByTitle: Record<string, string> = {};

  const docsBundle = await ensureProjectDocs({
    tasklistGuid: tasklist.guid,
    tasklistName: tasklist.name,
  });
  if (docsBundle.sectionGuid) {
    sectionGuidsByName[PROJECT_DETAILS_SECTION_NAME] = docsBundle.sectionGuid;
  }

  await Promise.all(
    plan.template.map(async (section) => {
      const sectionGuid = await createSection({ tasklistGuid: tasklist.guid, name: section.name });
      sectionGuidsByName[section.name] = sectionGuid;
      await Promise.all(
        section.tasks.map(async (task) => {
          const created = await createTask({
            tasklistGuid: tasklist.guid,
            sectionGuid,
            summary: task.title,
            description: task.description,
            startAt: task.startAt,
            dueAt: task.dueAt,
            extra: JSON.stringify({
              source: 'deepscientist_lark_project_agent',
              planId: plan.id,
              kind: task.kind,
            }),
          });
          if (task.kind === 'meta') {
            metaTaskGuidsByTitle[task.title] = created.guid;
          }
        })
      );
    })
  );

  const binding: LarkProjectBinding = await savePlanningBinding({
    plan,
    tasklist,
    state: 'planning',
    sectionGuidsByName,
    metaTaskGuidsByTitle,
    projectDetailsSectionGuid: docsBundle.sectionGuid,
    projectDocs: docsBundle.docs,
  });

  return { plan: approvedPlan, binding, tasklist };
}

export async function delegateTask(request: LarkProjectDelegateTaskRequest): Promise<LarkProjectDelegateTaskResult> {
  const tasklistGuid = assertNonEmpty(request.tasklistGuid, 'LARK_TASKLIST_GUID_REQUIRED');
  const title = assertNonEmpty(request.title, 'LARK_DELEGATE_TASK_TITLE_REQUIRED');
  const goal = assertNonEmpty(request.goal, 'LARK_DELEGATE_TASK_GOAL_REQUIRED');
  const tasklistName =
    request.tasklistName?.trim() || (await getTasklist(tasklistGuid).then((tasklist) => tasklist.name).catch(() => '协作项目'));
  const timestamp = now();

  let binding = await getBindingByTasklistGuid(tasklistGuid);
  if (!binding) {
    const bootstrapped = await bootstrapProject({
      title: tasklistName,
      projectId: request.projectId,
      tasklistGuid,
      tasklistName,
      createLarkResources: false,
    });
    if (!bootstrapped.binding) {
      throw new Error('LARK_PROJECT_BINDING_CREATE_FAILED');
    }
    binding = bootstrapped.binding;
  }
  if (request.teamId && binding.teamId !== request.teamId) {
    binding = await saveBinding({
      ...binding,
      teamId: request.teamId,
      leaderSlotId: request.leaderSlotId || binding.leaderSlotId,
    });
  }
  const [leaderPromptFile, agentPromptFile] = await Promise.all([getPromptFile('leader'), getPromptFile('agent-task')]);
  const leaderPresetContext = [
    leaderPromptFile.content.trim(),
    '',
    '# Current Project Context',
    `Tasklist GUID: ${tasklistGuid}`,
    `Tasklist Name: ${tasklistName}`,
    binding.projectId ? `Project ID: ${binding.projectId}` : undefined,
    '',
    ...docsContextLines(binding.projectDocs),
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
  binding = await ensureTeamForBinding({
    binding,
    tasklistGuid,
    tasklistName,
    leaderPresetContext,
    agentPresetContext: agentPromptFile.content.trim(),
  });
  const sourceConversationId = assertNonEmpty(
    request.sourceConversationId?.trim(),
    'LARK_DELEGATE_TASK_SOURCE_CONVERSATION_REQUIRED'
  );
  const leaderConversationId =
    binding.leaderAgentConversationId ||
    (await getTeam(binding.teamId ?? '')
      .then((team) => team?.agents.find((agent) => agent.role === 'leader')?.conversation_id)
      .catch((): string | undefined => undefined));
  if (!leaderConversationId || sourceConversationId !== leaderConversationId) {
    throw new Error('LARK_DELEGATE_TASK_LEADER_PERMISSION_REQUIRED');
  }

  const description = buildAgentCardDescription({ ...request, tasklistGuid, tasklistName, title, goal });
  const extra = JSON.stringify({
    source: 'deepscientist_lark_delegate_task',
    kind: request.target.kind === 'team_agent' ? 'agent' : 'human',
    tasklistGuid,
    teamId: binding.teamId,
    target: request.target,
    approvalRef: request.approvalRef,
    idempotencyKey: request.idempotencyKey,
  });
  const created = await createTask({
    tasklistGuid,
    summary: request.target.kind === 'team_agent' && !title.startsWith('[AGENT_TASK]') ? `[AGENT_TASK] ${title}` : title,
    description,
    dueAt: request.dueAt,
    assigneeId: request.target.kind === 'lark_user' ? request.target.openId : undefined,
    extra,
  });
  const task = await getTask(created.guid);
  const delegationId = `lark-delegation-${randomUUID()}`;
  const delegationBase: LarkProjectDelegation = {
    id: delegationId,
    tasklistGuid,
    tasklistName,
    projectId: request.projectId ?? binding.projectId,
    larkTaskGuid: created.guid,
    larkTaskUrl: created.url || task.url,
    title,
    target: request.target,
    teamId: binding.teamId,
    leaderSlotId: binding.leaderSlotId,
    state: request.target.kind === 'team_agent' ? 'created' : 'waiting',
    waitFor: request.waitFor ?? 'completion',
    approvalRef: request.approvalRef,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const actorName =
    request.target.kind === 'team_agent' ? request.target.name || request.target.slotId : request.target.name || request.target.openId;
  const acknowledgementText = buildAcknowledgementText({
    actorName,
    actorKind: request.target.kind === 'team_agent' ? 'Agent' : 'Human',
    language: 'auto',
    taskTitle: `${title}\n${goal}`,
  });
  const acknowledgement = await commentTask(created.guid, acknowledgementText).catch((): undefined => undefined);
  const initialComments = await larkInitialCommentSnapshot(created.guid).catch((): { fingerprint: string; count: number } => ({
    fingerprint: '',
    count: 0,
  }));
  delegationBase.lastCommentFingerprint = initialComments.fingerprint;
  delegationBase.lastCommentCount = initialComments.count;

  if (request.target.kind === 'team_agent') {
    if (!binding.teamId) {
      throw new Error('LARK_PROJECT_TEAM_ID_REQUIRED');
    }
    const prompt = buildTeamAgentDelegationPrompt({
      request: { ...request, tasklistGuid, tasklistName, title, goal },
      taskGuid: created.guid,
      taskUrl: created.url || task.url,
      delegationId,
    });
    const run = await sendMessageToTeamAgent({
      teamId: binding.teamId,
      slotId: request.target.slotId,
      content: prompt,
    });
    const delegation = await saveDelegation({
      ...delegationBase,
      state: 'running',
      teamRunId: run.team_run_id,
      teamMessageId: run.message_id,
    });
    await saveTaskRecord({
      id: `lark-task-${randomUUID()}`,
      taskGuid: created.guid,
      tasklistGuid,
      projectId: request.projectId ?? binding.projectId,
      kind: 'agent',
      state: 'running',
      title,
      assigneeId: request.target.slotId,
      ackCommentId: acknowledgement?.commentId,
      metadata: {
        taskGuid: created.guid,
        taskTitle: title,
        taskDescription: description,
        projectId: request.projectId ?? binding.projectId,
        tasklistGuid,
        targetAgent: actorName,
        delegationId,
        requiredResponse: 'context_packet',
        language: 'auto',
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return {
      ok: true,
      delegation,
      task,
      acknowledgement: {
        text: acknowledgementText,
        commentId: acknowledgement?.commentId,
      },
      nextInstructionForLeader:
        'The task has been delegated through Team Mode. Stop this branch now and wait for the child turn or Lark task feedback before continuing.',
    };
  }

  const delegation = await saveDelegation(delegationBase);
  await saveTaskRecord({
    id: `lark-task-${randomUUID()}`,
    taskGuid: created.guid,
    tasklistGuid,
    projectId: request.projectId ?? binding.projectId,
    kind: 'human',
    state: 'planned',
    title,
    assigneeId: request.target.openId,
    ackCommentId: acknowledgement?.commentId,
    metadata: {
      taskGuid: created.guid,
      taskTitle: title,
      taskDescription: description,
      projectId: request.projectId ?? binding.projectId,
      tasklistGuid,
      targetAgent: actorName,
      delegationId,
      requiredResponse: 'context_packet',
      language: 'auto',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return {
    ok: true,
    delegation,
    task,
    acknowledgement: {
      text: acknowledgementText,
      commentId: acknowledgement?.commentId,
    },
    nextInstructionForLeader:
      'The task has been assigned in Lark. Stop this branch now and wait for the human assignee to comment or complete the Lark task.',
  };
}

export async function handleTeamChildTurnCompleted(
  request: LarkProjectTeamChildTurnCompletedRequest
): Promise<LarkProjectTeamChildTurnCompletedResult> {
  const teamRunId = assertNonEmpty(request.team_run_id, 'LARK_PROJECT_TEAM_RUN_ID_REQUIRED');
  const delegation = await getDelegationByTeamRunId(teamRunId);
  if (!delegation) {
    return {
      ok: false,
      error: 'LARK_PROJECT_DELEGATION_NOT_FOUND',
    };
  }

  const timestamp = now();
  const actorName =
    delegation.target.kind === 'team_agent'
      ? delegation.target.name || delegation.target.slotId
      : delegation.target.name || delegation.target.openId;
  const record = await getTaskRecord(delegation.larkTaskGuid);
  const updatedRecord = await updateTaskRecord(delegation.larkTaskGuid, {
    state: 'returned',
    returnContextPacketId: request.turn_id,
    metadata: record?.metadata
      ? {
          ...record.metadata,
          a2aTaskId: request.turn_id,
        }
      : undefined,
  });
  let updatedDelegation =
    (await updateDelegation(delegation.id, {
      state: 'returned',
      lastWakeAt: timestamp,
      lastError: undefined,
    })) ?? delegation;

  const commentText = [
    `DeepScientist return: ${actorName} [Agent] has completed a local Team Mode turn for this task.`,
    '',
    `Conversation: ${request.conversation_id}`,
    `Turn: ${request.turn_id}`,
    `Team run: ${teamRunId}`,
    '',
    'The project lead Agent has been notified and can decide the next step from the Team Mode context.',
  ].join('\n');

  const comment = await commentTask(delegation.larkTaskGuid, commentText).catch(async (error): Promise<undefined> => {
    updatedDelegation =
      (await updateDelegation(delegation.id, {
        state: 'returned',
        lastWakeAt: timestamp,
        lastError: error instanceof Error ? error.message : String(error),
      })) ?? updatedDelegation;
    return undefined;
  });

  if (delegation.teamId) {
    const wakePrompt = [
      '# Delegated Team Mode task returned',
      '',
      `Task: ${delegation.title}`,
      `Lark task: ${delegation.larkTaskGuid}`,
      `Returned by: ${actorName}`,
      `Child conversation: ${request.conversation_id}`,
      `Child turn: ${request.turn_id}`,
      '',
      'Review the child result in Team Mode and the Lark task comments, then either continue planning, assign the next task, or close the Lark task if the work is complete.',
    ].join('\n');
    await sendTeamMessageWithBusyRetry({ teamId: delegation.teamId, content: wakePrompt }).catch(async (error) => {
      updatedDelegation =
        (await updateDelegation(delegation.id, {
          state: 'returned',
          lastWakeAt: timestamp,
          lastError: error instanceof Error ? error.message : String(error),
        })) ?? updatedDelegation;
    });
  }

  return {
    ok: true,
    delegation: updatedDelegation,
    taskRecord: updatedRecord,
    commentId: comment?.commentId,
  };
}

export async function intakeAgentTask(
  request: LarkProjectAgentTaskIntakeRequest
): Promise<LarkProjectAgentTaskIntakeResult> {
  const taskGuid = assertNonEmpty(request.task.taskGuid, 'LARK_AGENT_TASK_GUID_REQUIRED');
  const existing = await getTaskRecord(taskGuid);
  if (existing) {
    if (request.acknowledge !== false && !existing.ackCommentId) {
      const actorName = request.task.targetAgent?.trim() || 'Assigned Agent';
      const acknowledgementText = buildAcknowledgementText({
        actorName,
        actorKind: 'Agent',
        language: request.task.language,
        taskTitle: `${request.task.taskTitle}\n${request.task.taskDescription ?? ''}`,
      });
      const comment = await commentTask(taskGuid, acknowledgementText).catch((): undefined => undefined);
      const updated = await updateTaskRecord(taskGuid, {
        state: comment?.commentId ? 'acknowledged' : existing.state,
        ackCommentId: comment?.commentId,
      });
      return {
        record: updated ?? existing,
        acknowledgement: {
          text: acknowledgementText,
          commentId: comment?.commentId,
        },
      };
    }
    return {
      record: existing,
    };
  }
  const timestamp = now();
  const actorName = request.task.targetAgent?.trim() || 'Assigned Agent';
  const acknowledgementText = buildAcknowledgementText({
    actorName,
    actorKind: 'Agent',
    language: request.task.language,
    taskTitle: `${request.task.taskTitle}\n${request.task.taskDescription ?? ''}`,
  });

  let commentId: string | undefined;
  if (request.acknowledge !== false) {
    const comment = await commentTask(taskGuid, acknowledgementText);
    commentId = comment.commentId;
  }

  const record: LarkProjectTaskRecord = await saveTaskRecord({
    id: `lark-task-${randomUUID()}`,
    taskGuid,
    tasklistGuid: request.task.tasklistGuid,
    projectId: request.task.projectId,
    kind: 'agent',
    state: 'acknowledged',
    title: request.task.taskTitle,
    ackCommentId: commentId,
    metadata: request.task,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return {
    record,
    acknowledgement: {
      text: acknowledgementText,
      commentId,
    },
  };
}

export async function runLeaderTick(request: LarkProjectTickRequest): Promise<LarkProjectTickResult> {
  const consumedCompletedTasks = await listCompletedTaskRecords({
    projectId: request.projectId,
    tasklistGuid: request.tasklistGuid,
  });
  const queuedLeaderPrompts = consumedCompletedTasks.map((task) => {
    const source = task.metadata?.targetAgent || task.assigneeId || '任务执行者';
    return `Lark 任务已回流：${task.title}\n来源：${source}\n请把该任务结果纳入项目上下文，更新状态，并判断下一步是否需要继续拆分、请求确认或关闭。`;
  });
  await Promise.all(
    consumedCompletedTasks.map((task) =>
      updateTaskRecord(task.taskGuid, {
        state: 'leader_consumed',
      })
    )
  );
  return {
    consumedCompletedTasks,
    queuedLeaderPrompts,
    nextAction: queuedLeaderPrompts.length ? 'leader_follow_up_required' : 'none',
  };
}
