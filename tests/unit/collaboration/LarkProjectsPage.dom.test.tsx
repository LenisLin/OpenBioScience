/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  IFileMetadata,
  ILarkAutomationProjectTask,
  ILarkTaskAttachment,
  ILarkTaskComment,
  ILarkTaskDetail,
} from '@/common/adapter/ipcBridge';
import { ipcBridge } from '@/common';
import { LarkTaskDetailModal, TaskCard } from '@/renderer/pages/collaboration/LarkProjectsPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'common.collaboration.projects.task.open': '打开',
        'common.collaboration.projects.task.statusFallback': '进行中',
        'common.collaboration.projects.task.listLabel': '任务清单',
        'common.collaboration.projects.task.noComments': '暂无评论',
        'common.collaboration.projects.task.noAttachments': '暂无附件',
        'common.collaboration.projects.task.originalTask': '原始任务',
        'common.collaboration.projects.task.ownerLabel': '负责人',
        'common.collaboration.projects.task.createdTime': '创建时间',
        'common.collaboration.projects.task.unsynced': '未同步',
        'common.collaboration.projects.task.dueTime': '截止时间',
        'common.collaboration.projects.task.dueClean': '已同步',
        'common.collaboration.projects.task.saveTime': '保存时间',
        'common.collaboration.projects.task.complete': '完成任务',
        'common.collaboration.projects.task.description': '任务描述',
        'common.collaboration.projects.task.attachments': '附件',
        'common.collaboration.projects.task.image': '图片',
        'common.collaboration.projects.task.commentsAndFeedback': '评论与反馈',
        'common.collaboration.projects.task.commentHint': '评论会同步到协作任务。',
        'common.collaboration.projects.task.syncFeedback': '同步反馈',
        'common.collaboration.projects.task.supportsFiles': '支持附件和图片',
        'common.collaboration.projects.task.commentPlaceholder': '写一条评论，发送后会同步到协作任务评论区',
        'common.collaboration.projects.task.pickAttachment': '选附件',
        'common.collaboration.projects.task.pickImage': '选图片',
        'common.collaboration.projects.task.uploadOnly': '上传附件',
        'common.collaboration.projects.task.sendComment': '发送评论',
      };
      if (key === 'common.collaboration.projects.task.commentsCount') {
        return `${Number(options?.count ?? 0)} 条评论`;
      }
      if (key === 'common.collaboration.projects.task.attachmentsCount') {
        return `${Number(options?.count ?? 0)} 个附件`;
      }
      if (key === 'common.collaboration.projects.task.attachmentUploaded') {
        return `附件已上传：${String(options?.name ?? '')}`;
      }
      if (key === 'common.collaboration.projects.task.readAt') {
        return '刚刚读取';
      }
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    larkProjectAgent: {
      getTaskDetail: { invoke: vi.fn() },
      addTaskComment: { invoke: vi.fn() },
      uploadTaskAttachment: { invoke: vi.fn() },
      setTaskCompletion: { invoke: vi.fn() },
      updateTask: { invoke: vi.fn() },
    },
    larkAutomation: {
      openExternal: { invoke: vi.fn() },
    },
    dialog: {
      showOpen: { invoke: vi.fn() },
    },
    fs: {
      getFileMetadata: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/components/icons/CollaborationIcon', () => ({
  default: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('@arco-design/web-react', () => ({
    Button: ({
      children,
      onClick,
      disabled,
      loading,
      type: _type,
      icon,
    }: React.PropsWithChildren<{
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
      disabled?: boolean;
      loading?: boolean;
      type?: string;
      icon?: React.ReactNode;
    }>) => (
      <button type='button' onClick={onClick} disabled={disabled || loading}>
        {icon}
        {children}
      </button>
    ),
    Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
    Input: Object.assign(
      ({
        value,
        onChange,
        placeholder,
        className,
      }: {
        value?: string;
        onChange?: (value: string) => void;
        placeholder?: string;
        className?: string;
      }) => (
        <input
          className={className}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.currentTarget.value)}
        />
      ),
      {
        TextArea: ({
          value,
          onChange,
          placeholder,
        }: {
          value?: string;
          onChange?: (value: string) => void;
          placeholder?: string;
        }) => (
          <textarea
            value={value ?? ''}
            placeholder={placeholder}
            onChange={(event) => onChange?.(event.currentTarget.value)}
          />
        ),
      }
    ),
    Message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    Modal: ({
      visible,
      children,
      onCancel,
      closable = true,
      maskClosable = true,
    }: ReactModule.PropsWithChildren<{
      visible?: boolean;
      onCancel?: () => void;
      closable?: boolean;
      maskClosable?: boolean;
    }>) =>
      visible ? (
        <div role='dialog' aria-modal='true'>
          <button type='button' aria-label='mask' disabled={!maskClosable} onClick={() => onCancel?.()}>
            mask
          </button>
          {closable ? (
            <button type='button' aria-label='close' onClick={() => onCancel?.()}>
              close
            </button>
          ) : null}
          {children}
        </div>
      ) : null,
    Spin: ({ children }: React.PropsWithChildren<{ loading?: boolean; size?: number; tip?: string }>) => (
      <div>{children}</div>
    ),
    Tag: ({ children }: React.PropsWithChildren<{ size?: string; color?: string }>) => <span>{children}</span>,
}));

const task: ILarkAutomationProjectTask = {
  guid: 'task-1',
  summary: '测试任务',
  description: '任务描述',
  url: 'https://example.test/task',
  completed: false,
  tasklistGuids: ['list-1'],
  tasklistNames: ['测试清单'],
  isAgentTask: false,
  autoCreated: false,
  members: [{ id: 'u-1', name: '负责人' }],
};

const baseDetail = (overrides?: Partial<ILarkTaskDetail>): ILarkTaskDetail => ({
  task: {
    guid: 'task-1',
    summary: '测试任务',
    description: '任务描述',
    members: [{ id: 'u-1', name: '负责人' }],
    url: 'https://example.test/task',
    isAgentTask: false,
  },
  comments: [],
  attachments: [],
  fetchedAt: Date.now(),
  ...overrides,
});

const comment = (id: string, content: string): ILarkTaskComment => ({
  id,
  content,
  creator: { id: 'me', name: '我' },
  createdAt: Date.now(),
});

const attachment = (guid: string, name: string): ILarkTaskAttachment => ({
  guid,
  name,
  size: 128,
});

const file: IFileMetadata = {
  name: 'figure.png',
  path: '/tmp/figure.png',
  size: 128,
  type: 'image/png',
  lastModified: Date.now(),
};

describe('LarkProjectsPage task detail interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipcBridge.larkProjectAgent.getTaskDetail.invoke).mockResolvedValue(baseDetail());
  });

  it('opens the local detail modal from the task card button instead of external navigation', () => {
    const onOpenTask = vi.fn();

    render(<TaskCard task={task} onOpenTask={onOpenTask} />);

    fireEvent.click(screen.getByRole('button', { name: /打开/ }));

    expect(onOpenTask).toHaveBeenCalledWith(task);
    expect(ipcBridge.larkAutomation.openExternal.invoke).not.toHaveBeenCalled();
  });

  it('keeps the modal open and appends text comments after submit', async () => {
    const onClose = vi.fn();
    const created = comment('comment-1', '已经完成第一轮核对');
    vi.mocked(ipcBridge.larkProjectAgent.addTaskComment.invoke).mockResolvedValue({
      taskGuid: 'task-1',
      comment: created,
    });
    vi.mocked(ipcBridge.larkProjectAgent.getTaskDetail.invoke)
      .mockResolvedValueOnce(baseDetail())
      .mockResolvedValueOnce(baseDetail({ comments: [created] }));

    render(<LarkTaskDetailModal task={task} visible onClose={onClose} />);

    await screen.findByRole('heading', { name: '测试任务' });
    fireEvent.change(screen.getByPlaceholderText('写一条评论，发送后会同步到协作任务评论区'), {
      target: { value: created.content },
    });
    fireEvent.click(screen.getByRole('button', { name: /发送评论/ }));

    await screen.findByText(created.content);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(ipcBridge.larkProjectAgent.addTaskComment.invoke).toHaveBeenCalledWith({
      taskGuid: 'task-1',
      content: created.content,
    });
    expect(ipcBridge.larkProjectAgent.getTaskDetail.invoke).toHaveBeenCalledTimes(2);
  });

  it('uploads selected images, writes a default attachment comment, and keeps the modal open', async () => {
    const onClose = vi.fn();
    const uploadedAttachment = attachment('attachment-1', 'figure.png');
    const uploadedComment = comment('comment-attachment', '附件已上传：figure.png');
    vi.mocked(ipcBridge.dialog.showOpen.invoke).mockResolvedValue(['/tmp/figure.png']);
    vi.mocked(ipcBridge.fs.getFileMetadata.invoke).mockResolvedValue(file);
    vi.mocked(ipcBridge.larkProjectAgent.uploadTaskAttachment.invoke).mockResolvedValue({
      taskGuid: 'task-1',
      attachment: uploadedAttachment,
      comment: uploadedComment,
    });
    vi.mocked(ipcBridge.larkProjectAgent.getTaskDetail.invoke)
      .mockResolvedValueOnce(baseDetail())
      .mockResolvedValueOnce(baseDetail({ comments: [uploadedComment], attachments: [uploadedAttachment] }));

    render(<LarkTaskDetailModal task={task} visible onClose={onClose} />);

    await screen.findByRole('heading', { name: '测试任务' });
    fireEvent.click(screen.getByRole('button', { name: /选图片/ }));
    await screen.findByText('figure.png');
    fireEvent.click(screen.getByRole('button', { name: /发送评论/ }));

    await waitFor(() =>
      expect(ipcBridge.larkProjectAgent.uploadTaskAttachment.invoke).toHaveBeenCalledWith({
        taskGuid: 'task-1',
        filePath: '/tmp/figure.png',
        comment: '附件已上传：figure.png',
      })
    );
    await screen.findByText(uploadedComment.content);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
