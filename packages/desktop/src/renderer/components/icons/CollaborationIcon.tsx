/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import agentInboxIcon from '@/renderer/assets/icons/generated/collab-agent-inbox.png';
import agentInboxIconDark from '@/renderer/assets/icons/generated/collab-agent-inbox-dark.png';
import apiBindingIcon from '@/renderer/assets/icons/generated/collab-api-binding.png';
import apiBindingIconDark from '@/renderer/assets/icons/generated/collab-api-binding-dark.png';
import assigneeIcon from '@/renderer/assets/icons/generated/collab-assignee.png';
import assigneeIconDark from '@/renderer/assets/icons/generated/collab-assignee-dark.png';
import attachmentIcon from '@/renderer/assets/icons/generated/collab-attachment.png';
import attachmentIconDark from '@/renderer/assets/icons/generated/collab-attachment-dark.png';
import authIcon from '@/renderer/assets/icons/generated/collab-auth.png';
import authIconDark from '@/renderer/assets/icons/generated/collab-auth-dark.png';
import calendarIcon from '@/renderer/assets/icons/generated/collab-calendar.png';
import calendarIconDark from '@/renderer/assets/icons/generated/collab-calendar-dark.png';
import channelSaveIcon from '@/renderer/assets/icons/generated/collab-channel-save.png';
import channelSaveIconDark from '@/renderer/assets/icons/generated/collab-channel-save-dark.png';
import commentIcon from '@/renderer/assets/icons/generated/collab-comment.png';
import commentIconDark from '@/renderer/assets/icons/generated/collab-comment-dark.png';
import completeIcon from '@/renderer/assets/icons/generated/collab-complete.png';
import completeIconDark from '@/renderer/assets/icons/generated/collab-complete-dark.png';
import connectedIcon from '@/renderer/assets/icons/generated/collab-connected.png';
import connectedIconDark from '@/renderer/assets/icons/generated/collab-connected-dark.png';
import createAppIcon from '@/renderer/assets/icons/generated/collab-create-app.png';
import createAppIconDark from '@/renderer/assets/icons/generated/collab-create-app-dark.png';
import createdTimeIcon from '@/renderer/assets/icons/generated/collab-created-time.png';
import createdTimeIconDark from '@/renderer/assets/icons/generated/collab-created-time-dark.png';
import docsIcon from '@/renderer/assets/icons/generated/collab-docs.png';
import docsIconDark from '@/renderer/assets/icons/generated/collab-docs-dark.png';
import dueTimeIcon from '@/renderer/assets/icons/generated/collab-due-time.png';
import dueTimeIconDark from '@/renderer/assets/icons/generated/collab-due-time-dark.png';
import handoffIcon from '@/renderer/assets/icons/generated/collab-handoff.png';
import handoffIconDark from '@/renderer/assets/icons/generated/collab-handoff-dark.png';
import humanMemberIcon from '@/renderer/assets/icons/generated/collab-human-member.png';
import humanMemberIconDark from '@/renderer/assets/icons/generated/collab-human-member-dark.png';
import imageUploadIcon from '@/renderer/assets/icons/generated/collab-image-upload.png';
import imageUploadIconDark from '@/renderer/assets/icons/generated/collab-image-upload-dark.png';
import leaderAgentIcon from '@/renderer/assets/icons/generated/collab-leader-agent.png';
import leaderAgentIconDark from '@/renderer/assets/icons/generated/collab-leader-agent-dark.png';
import listenerIcon from '@/renderer/assets/icons/generated/collab-listener.png';
import listenerIconDark from '@/renderer/assets/icons/generated/collab-listener-dark.png';
import memoryIcon from '@/renderer/assets/icons/generated/collab-memory.png';
import memoryIconDark from '@/renderer/assets/icons/generated/collab-memory-dark.png';
import messageIcon from '@/renderer/assets/icons/generated/collab-message.png';
import messageIconDark from '@/renderer/assets/icons/generated/collab-message-dark.png';
import notificationIcon from '@/renderer/assets/icons/generated/collab-notification.png';
import notificationIconDark from '@/renderer/assets/icons/generated/collab-notification-dark.png';
import openOriginalIcon from '@/renderer/assets/icons/generated/collab-open-original.png';
import openOriginalIconDark from '@/renderer/assets/icons/generated/collab-open-original-dark.png';
import planGateIcon from '@/renderer/assets/icons/generated/collab-plan-gate.png';
import planGateIconDark from '@/renderer/assets/icons/generated/collab-plan-gate-dark.png';
import profileSelectIcon from '@/renderer/assets/icons/generated/collab-profile-select.png';
import profileSelectIconDark from '@/renderer/assets/icons/generated/collab-profile-select-dark.png';
import projectIcon from '@/renderer/assets/icons/generated/collab-project.png';
import projectIconDark from '@/renderer/assets/icons/generated/collab-project-dark.png';
import promptManagerIcon from '@/renderer/assets/icons/generated/collab-prompt-manager.png';
import promptManagerIconDark from '@/renderer/assets/icons/generated/collab-prompt-manager-dark.png';
import refreshSyncIcon from '@/renderer/assets/icons/generated/collab-refresh-sync.png';
import refreshSyncIconDark from '@/renderer/assets/icons/generated/collab-refresh-sync-dark.png';
import reopenIcon from '@/renderer/assets/icons/generated/collab-reopen.png';
import reopenIconDark from '@/renderer/assets/icons/generated/collab-reopen-dark.png';
import runtimeIcon from '@/renderer/assets/icons/generated/collab-runtime.png';
import runtimeIconDark from '@/renderer/assets/icons/generated/collab-runtime-dark.png';
import secretKeyIcon from '@/renderer/assets/icons/generated/collab-secret-key.png';
import secretKeyIconDark from '@/renderer/assets/icons/generated/collab-secret-key-dark.png';
import sendCommentIcon from '@/renderer/assets/icons/generated/collab-send-comment.png';
import sendCommentIconDark from '@/renderer/assets/icons/generated/collab-send-comment-dark.png';
import sopSkillIcon from '@/renderer/assets/icons/generated/collab-sop-skill.png';
import sopSkillIconDark from '@/renderer/assets/icons/generated/collab-sop-skill-dark.png';
import subAgentIcon from '@/renderer/assets/icons/generated/collab-sub-agent.png';
import subAgentIconDark from '@/renderer/assets/icons/generated/collab-sub-agent-dark.png';
import syncFeedbackIcon from '@/renderer/assets/icons/generated/collab-sync-feedback.png';
import syncFeedbackIconDark from '@/renderer/assets/icons/generated/collab-sync-feedback-dark.png';
import taskAutomationIcon from '@/renderer/assets/icons/generated/collab-task-automation.png';
import taskAutomationIconDark from '@/renderer/assets/icons/generated/collab-task-automation-dark.png';
import taskDetailIcon from '@/renderer/assets/icons/generated/collab-task-detail.png';
import taskDetailIconDark from '@/renderer/assets/icons/generated/collab-task-detail-dark.png';
import taskPageIcon from '@/renderer/assets/icons/generated/collab-task-page.png';
import taskPageIconDark from '@/renderer/assets/icons/generated/collab-task-page-dark.png';
import tasklistIcon from '@/renderer/assets/icons/generated/collab-tasklist.png';
import tasklistIconDark from '@/renderer/assets/icons/generated/collab-tasklist-dark.png';
import webLoginIcon from '@/renderer/assets/icons/generated/collab-web-login.png';
import webLoginIconDark from '@/renderer/assets/icons/generated/collab-web-login-dark.png';

export type CollaborationIconName =
  | 'agentInbox'
  | 'apiBinding'
  | 'assignee'
  | 'attachment'
  | 'auth'
  | 'calendar'
  | 'channelSave'
  | 'comment'
  | 'complete'
  | 'connected'
  | 'createApp'
  | 'createdTime'
  | 'docs'
  | 'dueTime'
  | 'handoff'
  | 'humanMember'
  | 'imageUpload'
  | 'leaderAgent'
  | 'listener'
  | 'memory'
  | 'message'
  | 'notification'
  | 'openOriginal'
  | 'planGate'
  | 'profileSelect'
  | 'project'
  | 'promptManager'
  | 'refreshSync'
  | 'reopen'
  | 'runtime'
  | 'secretKey'
  | 'sendComment'
  | 'sopSkill'
  | 'subAgent'
  | 'syncFeedback'
  | 'taskAutomation'
  | 'taskDetail'
  | 'taskPage'
  | 'tasklist'
  | 'webLogin';

type CollaborationIconProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  name: CollaborationIconName;
  size?: number | string;
  spin?: boolean;
  title?: string;
  visualScale?: number;
};

type IconAsset = {
  light: string;
  dark: string;
};

const ICON_ASSETS: Record<CollaborationIconName, IconAsset> = {
  agentInbox: { light: agentInboxIcon, dark: agentInboxIconDark },
  apiBinding: { light: apiBindingIcon, dark: apiBindingIconDark },
  assignee: { light: assigneeIcon, dark: assigneeIconDark },
  attachment: { light: attachmentIcon, dark: attachmentIconDark },
  auth: { light: authIcon, dark: authIconDark },
  calendar: { light: calendarIcon, dark: calendarIconDark },
  channelSave: { light: channelSaveIcon, dark: channelSaveIconDark },
  comment: { light: commentIcon, dark: commentIconDark },
  complete: { light: completeIcon, dark: completeIconDark },
  connected: { light: connectedIcon, dark: connectedIconDark },
  createApp: { light: createAppIcon, dark: createAppIconDark },
  createdTime: { light: createdTimeIcon, dark: createdTimeIconDark },
  docs: { light: docsIcon, dark: docsIconDark },
  dueTime: { light: dueTimeIcon, dark: dueTimeIconDark },
  handoff: { light: handoffIcon, dark: handoffIconDark },
  humanMember: { light: humanMemberIcon, dark: humanMemberIconDark },
  imageUpload: { light: imageUploadIcon, dark: imageUploadIconDark },
  leaderAgent: { light: leaderAgentIcon, dark: leaderAgentIconDark },
  listener: { light: listenerIcon, dark: listenerIconDark },
  memory: { light: memoryIcon, dark: memoryIconDark },
  message: { light: messageIcon, dark: messageIconDark },
  notification: { light: notificationIcon, dark: notificationIconDark },
  openOriginal: { light: openOriginalIcon, dark: openOriginalIconDark },
  planGate: { light: planGateIcon, dark: planGateIconDark },
  profileSelect: { light: profileSelectIcon, dark: profileSelectIconDark },
  project: { light: projectIcon, dark: projectIconDark },
  promptManager: { light: promptManagerIcon, dark: promptManagerIconDark },
  refreshSync: { light: refreshSyncIcon, dark: refreshSyncIconDark },
  reopen: { light: reopenIcon, dark: reopenIconDark },
  runtime: { light: runtimeIcon, dark: runtimeIconDark },
  secretKey: { light: secretKeyIcon, dark: secretKeyIconDark },
  sendComment: { light: sendCommentIcon, dark: sendCommentIconDark },
  sopSkill: { light: sopSkillIcon, dark: sopSkillIconDark },
  subAgent: { light: subAgentIcon, dark: subAgentIconDark },
  syncFeedback: { light: syncFeedbackIcon, dark: syncFeedbackIconDark },
  taskAutomation: { light: taskAutomationIcon, dark: taskAutomationIconDark },
  taskDetail: { light: taskDetailIcon, dark: taskDetailIconDark },
  taskPage: { light: taskPageIcon, dark: taskPageIconDark },
  tasklist: { light: tasklistIcon, dark: tasklistIconDark },
  webLogin: { light: webLoginIcon, dark: webLoginIconDark },
};

const sizeToCss = (size: number | string): number | string => (typeof size === 'number' ? `${size}px` : size);

const CollaborationIcon: React.FC<CollaborationIconProps> = ({
  name,
  size = 20,
  spin = false,
  title,
  visualScale = 1.39,
  className,
  style,
  ...props
}) => {
  const asset = ICON_ASSETS[name] || ICON_ASSETS.project;
  const cssSize = sizeToCss(size);
  const classes = ['collaboration-icon', spin && 'collaboration-icon--spin', className].filter(Boolean).join(' ');
  const imgStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    pointerEvents: 'none',
    transform: `scale(${visualScale})`,
    transformOrigin: 'center',
  };

  return (
    <span
      className={classes}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      title={title}
      style={{
        display: 'inline-flex',
        width: cssSize,
        height: cssSize,
        minWidth: cssSize,
        minHeight: cssSize,
        lineHeight: 0,
        overflow: 'visible',
        verticalAlign: '-0.125em',
        ...style,
      }}
      {...props}
    >
      <img className='collaboration-icon__light' src={asset.light} alt='' draggable={false} style={imgStyle} />
      <img className='collaboration-icon__dark' src={asset.dark} alt='' draggable={false} style={imgStyle} />
    </span>
  );
};

export default CollaborationIcon;
