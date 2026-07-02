/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

export type LarkProjectAgentRole = 'leader' | 'agent' | 'human';

export type LarkProjectPlanState = 'draft' | 'approved' | 'rejected' | 'executed';

export type LarkProjectBindingState = 'planning' | 'ready' | 'listening' | 'blocked' | 'archived';

export type LarkProjectTaskKind = 'meta' | 'human' | 'agent';

export type LarkProjectTaskState =
  | 'discovered'
  | 'acknowledged'
  | 'planned'
  | 'running'
  | 'returned'
  | 'completed'
  | 'leader_consumed'
  | 'blocked';

export type LarkProjectDelegationState =
  | 'created'
  | 'running'
  | 'waiting'
  | 'returned'
  | 'leader_consumed'
  | 'paused'
  | 'failed';

export type LarkProjectAckActorKind = 'Agent' | 'Human';

export type LarkProjectPromptRole = 'default' | 'leader' | 'collaboration' | 'agent-task';

export type LarkProjectDocKind = 'metadata' | 'staffing' | 'timeline';

export type LarkProjectLocalConversationRole = 'leader' | 'agent' | 'task' | 'im';

export type LarkProjectLocalConversationLink = {
  id: string;
  role: LarkProjectLocalConversationRole;
  label?: string;
  slotId?: string;
  teamId?: string;
  taskGuid?: string;
  backend?: string;
  updatedAt?: number;
};

export type LarkProjectLocalTasklistConfig = {
  guid: string;
  name: string;
  source: 'lark';
  visible: boolean;
  order: number;
  pinned?: boolean;
  pinnedAt?: number;
  url?: string;
  ownerName?: string;
  teamId?: string;
  leaderSlotId?: string;
  leaderConversationId?: string;
  leaderAgentLabel?: string;
  workspace?: string;
  lastSyncedAt?: number;
  conversations: LarkProjectLocalConversationLink[];
};

export type LarkProjectLocalImChatConfig = {
  chatId: string;
  profileName?: string;
  displayName: string;
  visible: boolean;
  conversationId?: string;
  workspace?: string;
  lastSyncedAt?: number;
};

export type LarkProjectLocalConfig = {
  version: 1;
  updatedAt: number;
  sidebar: {
    autoSyncLark: boolean;
    showLarkIm: boolean;
  };
  tasklists: LarkProjectLocalTasklistConfig[];
  imChats: LarkProjectLocalImChatConfig[];
};

export type LarkTasklistSummary = {
  guid: string;
  name: string;
  url?: string;
  ownerId?: string;
  updatedAt?: number;
};

export type LarkTaskSectionSummary = {
  guid: string;
  name: string;
  isDefault?: boolean;
  updatedAt?: number;
};

export type LarkTaskMemberSummary = {
  id: string;
  name?: string;
  role?: string;
  type?: string;
};

export type LarkTaskSummary = {
  guid: string;
  taskId?: string;
  summary: string;
  description?: string;
  status?: string;
  completedAt?: number;
  startAt?: number;
  dueAt?: number;
  sectionGuid?: string;
  tasklistGuid?: string;
  members: LarkTaskMemberSummary[];
  url?: string;
  extra?: string;
  isAgentTask: boolean;
};

export type LarkTaskComment = {
  id: string;
  content: string;
  creator?: LarkTaskMemberSummary;
  replyToCommentId?: string;
  createdAt?: number;
  updatedAt?: number;
  resourceType?: string;
  resourceId?: string;
};

export type LarkTaskAttachment = {
  guid: string;
  fileToken?: string;
  name: string;
  size?: number;
  url?: string;
  isCover?: boolean;
  uploadedAt?: number;
  uploader?: LarkTaskMemberSummary;
  resource?: {
    type?: string;
    id?: string;
  };
};

export type LarkTaskDetail = {
  task: LarkTaskSummary;
  comments: LarkTaskComment[];
  attachments: LarkTaskAttachment[];
  fetchedAt: number;
};

export type LarkTasklistSourceSnapshot = {
  source: 'lark';
  tasklist: LarkTasklistSummary;
  sections: LarkTaskSectionSummary[];
  openTasks: LarkTaskSummary[];
  completedTasks: LarkTaskSummary[];
  fetchedAt: number;
};

export type LarkMarkdownFile = {
  fileToken: string;
  fileName: string;
  url?: string;
  version?: string;
  sizeBytes?: number;
};

export type LarkProjectDocRecord = {
  kind: LarkProjectDocKind;
  title: string;
  fileName: string;
  fileToken: string;
  tasklistGuid: string;
  sectionGuid?: string;
  taskGuid?: string;
  url?: string;
  createdAt: number;
  updatedAt: number;
  contentCache?: string;
  contentCachedAt?: number;
};

export type LarkProjectDocsBundle = {
  tasklistGuid: string;
  tasklistName: string;
  sectionGuid?: string;
  docs: LarkProjectDocRecord[];
  ensuredAt: number;
  ok?: boolean;
  error?: string;
};

export type LarkProjectEnsureDocsRequest = {
  tasklistGuid: string;
  tasklistName?: string;
};

export type LarkProjectGetDocRequest = {
  tasklistGuid: string;
  tasklistName?: string;
  kind: LarkProjectDocKind;
};

export type LarkProjectDocContent = {
  doc: LarkProjectDocRecord;
  content: string;
  fetchedAt: number;
  ok?: boolean;
  error?: string;
};

export type LarkProjectSaveDocRequest = {
  tasklistGuid: string;
  tasklistName?: string;
  kind: LarkProjectDocKind;
  content: string;
};

export type LarkProjectSaveDocResult = {
  doc: LarkProjectDocRecord;
  version?: string;
  savedAt: number;
  ok?: boolean;
  error?: string;
};

export type LarkProjectParticipant = {
  id: string;
  name: string;
  kind: LarkProjectAgentRole;
  role?: string;
  language?: 'zh' | 'en' | 'auto';
  agentProfileId?: string;
};

export type LarkProjectTemplateTask = {
  title: string;
  kind: LarkProjectTaskKind;
  description: string;
  startAt?: number;
  dueAt?: number;
};

export type LarkProjectTemplateSection = {
  name: string;
  tasks: LarkProjectTemplateTask[];
};

export type LarkProjectPlan = {
  id: string;
  state: LarkProjectPlanState;
  title: string;
  description?: string;
  projectId?: string;
  tasklistGuid?: string;
  tasklistName: string;
  startAt?: number;
  dueAt?: number;
  leaderAgentLabel: string;
  participants: LarkProjectParticipant[];
  template: LarkProjectTemplateSection[];
  notes: string[];
  requiresApprovalBeforeWrite: true;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
};

export type LarkProjectBinding = {
  id: string;
  projectId: string;
  tasklistGuid: string;
  tasklistName: string;
  leaderAgentConversationId?: string;
  leaderAgentPendingPrompt?: string;
  leaderAgentLabel: string;
  teamId?: string;
  leaderSlotId?: string;
  paused?: boolean;
  state: LarkProjectBindingState;
  planId?: string;
  sectionGuidsByName: Record<string, string>;
  metaTaskGuidsByTitle: Record<string, string>;
  projectDetailsSectionGuid?: string;
  projectDocs?: LarkProjectDocRecord[];
  participantIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type LarkProjectDelegationTarget =
  | {
      kind: 'team_agent';
      slotId: string;
      name?: string;
    }
  | {
      kind: 'lark_user';
      openId: string;
      name?: string;
    };

export type LarkProjectDelegation = {
  id: string;
  tasklistGuid: string;
  tasklistName?: string;
  projectId?: string;
  larkTaskGuid: string;
  larkTaskUrl?: string;
  title: string;
  target: LarkProjectDelegationTarget;
  teamId?: string;
  leaderSlotId?: string;
  teamRunId?: string;
  teamMessageId?: string;
  state: LarkProjectDelegationState;
  waitFor: 'completion' | 'first_comment' | 'none';
  approvalRef?: string;
  lastWakeAt?: number;
  lastCommentFingerprint?: string;
  lastCommentCount?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

export type LarkProjectConversationBindingRole = 'leader' | 'agent';

export type LarkProjectAttachConversationRequest = {
  conversationId: string;
  role: LarkProjectConversationBindingRole;
  tasklistGuid: string;
  tasklistName?: string;
  bindingId?: string;
  replaceExistingLeader?: boolean;
};

export type LarkProjectAttachConversationResult = {
  binding?: LarkProjectBinding;
};

export type LarkAgentTaskMetadata = {
  taskGuid: string;
  taskTitle: string;
  taskDescription?: string;
  projectId?: string;
  tasklistGuid?: string;
  targetAgent?: string;
  a2aTaskId?: string;
  delegationId?: string;
  requiredResponse?: 'context_packet' | 'status_summary' | 'clarification';
  language?: 'zh' | 'en' | 'auto';
};

export type LarkProjectTaskRecord = {
  id: string;
  taskGuid: string;
  tasklistGuid?: string;
  projectId?: string;
  kind: LarkProjectTaskKind;
  state: LarkProjectTaskState;
  title: string;
  assigneeId?: string;
  agentConversationId?: string;
  pendingAgentConversationPrompt?: string;
  ackCommentId?: string;
  returnContextPacketId?: string;
  metadata?: LarkAgentTaskMetadata;
  localTitle?: string;
  pinned?: boolean;
  pinnedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type LarkProjectPromptFile = {
  role: LarkProjectPromptRole;
  path: string;
  content: string;
  defaultContent: string;
  updatedAt?: number;
};

export type LarkProjectSettingsSnapshot = {
  promptFiles: LarkProjectPromptFile[];
};

export type LarkProjectEventListenerStatus = {
  running: boolean;
  eventKey: 'task.task.update_user_access_v2';
  startedAt?: number;
  lastEventAt?: number;
  lastError?: string;
  processedEvents: number;
  updatedTaskGuids: string[];
};

export type LarkProjectBootstrapRequest = {
  title: string;
  description?: string;
  projectId?: string;
  tasklistGuid?: string;
  tasklistName?: string;
  startAt?: number;
  dueAt?: number;
  leaderAgentLabel?: string;
  participants?: LarkProjectParticipant[];
  createLarkResources?: boolean;
};

export type LarkProjectBootstrapResult = {
  plan: LarkProjectPlan;
  binding?: LarkProjectBinding;
  tasklist?: LarkTasklistSummary;
};

export type LarkProjectApprovePlanRequest = {
  planId: string;
  execute?: boolean;
};

export type LarkProjectAgentTaskIntakeRequest = {
  task: LarkAgentTaskMetadata;
  autoCreateAgentConversation?: boolean;
  acknowledge?: boolean;
};

export type LarkProjectAgentTaskIntakeResult = {
  record: LarkProjectTaskRecord;
  acknowledgement?: {
    text: string;
    commentId?: string;
  };
  createdAgentConversationId?: string;
};

export type LarkProjectDelegateTaskRequest = {
  tasklistGuid: string;
  tasklistName?: string;
  projectId?: string;
  teamId?: string;
  leaderSlotId?: string;
  sourceConversationId?: string;
  target: LarkProjectDelegationTarget;
  title: string;
  goal: string;
  context?: string;
  inputs?: string[];
  deliverables?: string[];
  acceptanceCriteria?: string[];
  dueAt?: number;
  priority?: 'low' | 'normal' | 'high';
  waitFor?: 'completion' | 'first_comment' | 'none';
  approvalRef?: string;
  idempotencyKey?: string;
};

export type LarkProjectDelegateTaskResult = {
  ok: boolean;
  delegation: LarkProjectDelegation;
  task: LarkTaskSummary;
  acknowledgement?: {
    text: string;
    commentId?: string;
  };
  nextInstructionForLeader: string;
  error?: string;
};

export type LarkProjectTeamChildTurnCompletedRequest = {
  team_id: string;
  team_run_id: string;
  slot_id: string;
  role?: string;
  conversation_id: string;
  turn_id: string;
  status?: string;
};

export type LarkProjectTeamChildTurnCompletedResult = {
  ok: boolean;
  delegation?: LarkProjectDelegation;
  taskRecord?: LarkProjectTaskRecord;
  commentId?: string;
  error?: string;
};

export type LarkProjectTickRequest = {
  projectId?: string;
  tasklistGuid?: string;
  reason?: 'manual' | 'task_completed' | 'event' | 'agent_return';
};

export type LarkProjectTickResult = {
  consumedCompletedTasks: LarkProjectTaskRecord[];
  queuedLeaderPrompts: string[];
  nextAction: 'none' | 'leader_follow_up_required';
};

export type LarkProjectAddTaskCommentRequest = {
  taskGuid: string;
  content: string;
  replyToCommentId?: string;
};

export type LarkProjectAddTaskCommentResult = {
  taskGuid: string;
  comment: LarkTaskComment;
};

export type LarkProjectUploadTaskAttachmentRequest = {
  taskGuid: string;
  filePath: string;
  comment?: string;
};

export type LarkProjectUploadTaskAttachmentResult = {
  taskGuid: string;
  attachment: LarkTaskAttachment;
  comment?: LarkTaskComment;
};

export type LarkProjectSetTaskCompletionRequest = {
  taskGuid: string;
  completed: boolean;
};

export type LarkProjectSetTaskCompletionResult = {
  taskGuid: string;
  task: LarkTaskSummary;
};

export type LarkProjectUpdateTaskRequest = {
  taskGuid: string;
  dueAt?: number | null;
};

export type LarkProjectUpdateTaskResult = {
  taskGuid: string;
  task: LarkTaskSummary;
};

export type LarkProjectSnapshot = {
  plans: LarkProjectPlan[];
  bindings: LarkProjectBinding[];
  taskRecords: LarkProjectTaskRecord[];
  delegations: LarkProjectDelegation[];
  hiddenTasklistGuids: string[];
  localConfig: LarkProjectLocalConfig;
};

export type LarkProjectConfigureRequest = {
  profileName?: string;
};

export type LarkProjectBindLeaderAgentRequest = {
  tasklistGuid: string;
  tasklistName?: string;
  projectTitle?: string;
  projectDescription?: string;
  leaderAgentLabel?: string;
  participants?: LarkProjectParticipant[];
};

export type LarkProjectBindLeaderAgentResult = {
  plan: LarkProjectPlan;
  binding: LarkProjectBinding;
  leaderPrompt: string;
};
