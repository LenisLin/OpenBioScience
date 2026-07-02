/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  ILarkProjectDocKind,
  ILarkProjectDocRecord,
  ILarkProjectDocsBundle,
  ILarkProjectDocContent,
  ILarkProjectSaveDocResult,
} from '@/common/adapter/ipcBridge';
import {
  addLarkTaskComment,
  attachConversationToProject,
  bindLeaderAgentToTasklist,
  configureProjectAgent,
  delegateTask,
  getEventListenerStatus,
  getProjectDoc,
  getLarkTasklistSnapshot,
  getLarkTaskDetail,
  getProjectSnapshot,
  getSettingsSnapshot,
  hideProjectTasklist,
  handleTeamChildTurnCompleted,
  ensureProjectDocs,
  renameProjectTasklist,
  removeProjectConversationLink,
  removeProjectTaskRecord,
  resetPrompt,
  runLeaderTick,
  saveProjectDoc,
  setLarkTaskCompletion,
  startEventListener,
  stopEventListener,
  updateLarkTask,
  updateProjectTaskRecordLocalState,
  updateProjectTasklistLocalState,
  updatePrompt,
  uploadLarkTaskAttachment,
} from '@/deepscientist_lark/project_agent/service';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyDocRecord(input: {
  kind: ILarkProjectDocKind;
  tasklistGuid?: string;
  tasklistName?: string;
}): ILarkProjectDocRecord {
  const timestamp = Date.now();
  const names: Record<ILarkProjectDocKind, { title: string; fileName: string }> = {
    metadata: { title: '项目元信息', fileName: 'project-meta.md' },
    staffing: { title: '人事安排', fileName: 'staffing-plan.md' },
    timeline: { title: '时间安排', fileName: 'timeline-plan.md' },
  };
  const spec = names[input.kind];
  return {
    kind: input.kind,
    title: spec.title,
    fileName: spec.fileName,
    fileToken: '',
    tasklistGuid: input.tasklistGuid ?? '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function initLarkProjectAgentBridge(): void {
  ipcBridge.larkProjectAgent.configure.provider(async (request) => {
    configureProjectAgent(request ?? {});
  });
  ipcBridge.larkProjectAgent.getSettings.provider(getSettingsSnapshot);
  ipcBridge.larkProjectAgent.updatePrompt.provider(({ role, content }) => updatePrompt(role, content));
  ipcBridge.larkProjectAgent.resetPrompt.provider(({ role }) => resetPrompt(role));
  ipcBridge.larkProjectAgent.getSnapshot.provider(getProjectSnapshot);
  ipcBridge.larkProjectAgent.hideTasklist.provider(hideProjectTasklist);
  ipcBridge.larkProjectAgent.updateTasklistLocalState.provider(updateProjectTasklistLocalState);
  ipcBridge.larkProjectAgent.removeConversationLink.provider(removeProjectConversationLink);
  ipcBridge.larkProjectAgent.removeTaskRecord.provider(removeProjectTaskRecord);
  ipcBridge.larkProjectAgent.updateTaskRecordLocalState.provider(updateProjectTaskRecordLocalState);
  ipcBridge.larkProjectAgent.renameTasklist.provider(renameProjectTasklist);
  ipcBridge.larkProjectAgent.getTasklistSnapshot.provider(({ tasklistGuid }) => getLarkTasklistSnapshot(tasklistGuid));
  ipcBridge.larkProjectAgent.getTaskDetail.provider(({ taskGuid }) => getLarkTaskDetail(taskGuid));
  ipcBridge.larkProjectAgent.ensureProjectDocs.provider(async (request): Promise<ILarkProjectDocsBundle> => {
    try {
      return { ...(await ensureProjectDocs(request)), ok: true };
    } catch (error) {
      const message = errorMessage(error);
      console.error('[lark-project-agent] ensureProjectDocs failed:', message);
      return {
        ok: false,
        error: message,
        tasklistGuid: request.tasklistGuid,
        tasklistName: request.tasklistName || '协作项目',
        docs: [],
        ensuredAt: Date.now(),
      };
    }
  });
  ipcBridge.larkProjectAgent.getProjectDoc.provider(async (request): Promise<ILarkProjectDocContent> => {
    try {
      return { ...(await getProjectDoc(request)), ok: true };
    } catch (error) {
      const message = errorMessage(error);
      console.error('[lark-project-agent] getProjectDoc failed:', message);
      return {
        ok: false,
        error: message,
        doc: emptyDocRecord(request),
        content: '',
        fetchedAt: Date.now(),
      };
    }
  });
  ipcBridge.larkProjectAgent.saveProjectDoc.provider(async (request): Promise<ILarkProjectSaveDocResult> => {
    try {
      return { ...(await saveProjectDoc(request)), ok: true };
    } catch (error) {
      const message = errorMessage(error);
      console.error('[lark-project-agent] saveProjectDoc failed:', message);
      return {
        ok: false,
        error: message,
        doc: emptyDocRecord(request),
        savedAt: Date.now(),
      };
    }
  });
  ipcBridge.larkProjectAgent.addTaskComment.provider(addLarkTaskComment);
  ipcBridge.larkProjectAgent.uploadTaskAttachment.provider(uploadLarkTaskAttachment);
  ipcBridge.larkProjectAgent.setTaskCompletion.provider(setLarkTaskCompletion);
  ipcBridge.larkProjectAgent.updateTask.provider(updateLarkTask);
  ipcBridge.larkProjectAgent.delegateTask.provider(delegateTask);
  ipcBridge.larkProjectAgent.handleTeamChildTurnCompleted.provider(handleTeamChildTurnCompleted);
  ipcBridge.larkProjectAgent.bindLeaderAgent.provider(bindLeaderAgentToTasklist);
  ipcBridge.larkProjectAgent.attachConversation.provider(attachConversationToProject);
  ipcBridge.larkProjectAgent.runLeaderTick.provider(runLeaderTick);
  ipcBridge.larkProjectAgent.startEventListener.provider(async () => startEventListener());
  ipcBridge.larkProjectAgent.stopEventListener.provider(async () => stopEventListener());
  ipcBridge.larkProjectAgent.getEventListenerStatus.provider(async () => getEventListenerStatus());
}
