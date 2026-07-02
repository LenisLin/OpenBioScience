/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { Down } from '@icon-park/react';
import AgentOutputIcon from '@/renderer/components/icons/AgentOutputIcon';
import { diffColors, iconColors } from '@/renderer/styles/colors';
import { useTranslation } from 'react-i18next';
import { Button } from '@arco-design/web-react';
import './FileChangesPanel.css';

/**
 * 文件变更项数据 / File change item data
 */
export interface FileChangeItem {
  /** 文件名 / File name */
  file_name: string;
  /** 完整路径 / Full path */
  fullPath: string;
  /** 新增行数 / Number of insertions */
  insertions: number;
  /** 删除行数 / Number of deletions */
  deletions: number;
}

export type FileChangesUndoState = 'hidden' | 'checking' | 'ready' | 'undoing' | 'undone' | 'blocked';

/**
 * 文件变更面板属性 / File changes panel props
 */
export interface FileChangesPanelProps {
  /** 显示样式 / Display style */
  variant?: 'compact' | 'result';
  /** 面板标题 / Panel title */
  title: string;
  /** 文件变更列表 / File changes list */
  files: FileChangeItem[];
  /** 默认是否展开 / Default expanded state */
  defaultExpanded?: boolean;
  /** 点击预览按钮的回调 / Callback when preview button is clicked */
  onFileClick?: (file: FileChangeItem) => void;
  /** 点击变更统计的回调（+8/-3 数字触发，打开 diff 对比）/ Callback when change stats are clicked (opens diff view) */
  onDiffClick?: (file: FileChangeItem) => void;
  /** 点击撤销按钮的回调 / Callback when undo button is clicked */
  onUndo?: () => void;
  /** 撤销操作是否进行中 / Whether undo is in progress */
  undoLoading?: boolean;
  /** 撤销按钮状态 / Undo button state */
  undoState?: FileChangesUndoState;
  /** 撤销按钮提示 / Undo button title */
  undoTitle?: string;
  /** 点击审核按钮的回调 / Callback when review button is clicked */
  onReviewAll?: (files: FileChangeItem[]) => void;
  /** 额外的类名 / Additional class name */
  className?: string;
}

/**
 * 文件变更面板组件
 * File changes panel component
 *
 * 用于显示会话中生成/修改的文件列表，支持展开收起
 * Used to display generated/modified files in conversation, supports expand/collapse
 */
const FileChangesPanel: React.FC<FileChangesPanelProps> = ({
  variant = 'compact',
  title,
  files,
  defaultExpanded = true,
  onFileClick,
  onDiffClick,
  onUndo,
  undoLoading = false,
  undoState,
  undoTitle,
  onReviewAll,
  className,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const totals = useMemo(
    () =>
      files.reduce(
        (summary, file) => ({
          insertions: summary.insertions + file.insertions,
          deletions: summary.deletions + file.deletions,
        }),
        { insertions: 0, deletions: 0 }
      ),
    [files]
  );
  const canReview = Boolean(onReviewAll || onDiffClick);
  const effectiveUndoState: FileChangesUndoState = undoLoading
    ? 'undoing'
    : (undoState ?? (onUndo ? 'ready' : 'hidden'));
  const showUndo = effectiveUndoState !== 'hidden';
  const undoDisabled = effectiveUndoState !== 'ready';
  const undoButtonLoading = effectiveUndoState === 'checking' || effectiveUndoState === 'undoing';
  const undoLabel = (() => {
    if (effectiveUndoState === 'checking') {
      return t('messages.undoChecking', { defaultValue: 'Checking' });
    }
    if (effectiveUndoState === 'undoing') {
      return t('messages.undoing', { defaultValue: 'Undoing' });
    }
    if (effectiveUndoState === 'undone') {
      return t('messages.undoDone', { defaultValue: 'Undone' });
    }
    if (effectiveUndoState === 'blocked') {
      return t('messages.undoUnavailable', { defaultValue: 'Unavailable' });
    }
    return t('messages.undo', { defaultValue: 'Undo' });
  })();
  const handleReview = () => {
    if (onReviewAll) {
      onReviewAll(files);
      return;
    }
    if (files[0]) {
      onDiffClick?.(files[0]);
    }
  };

  if (files.length === 0) {
    return null;
  }

  if (variant === 'compact') {
    return (
      <div
        className={classNames(
          'w-full box-border rounded-8px overflow-hidden border border-solid border-[var(--aou-2)]',
          className
        )}
        style={{ width: '100%' }}
      >
        <div
          className='flex items-center justify-between px-16px py-12px cursor-pointer select-none'
          onClick={() => setExpanded(!expanded)}
        >
          <div className='flex items-center gap-8px'>
            <span className='h-20px w-20px flex shrink-0 items-center justify-center rounded-5px bg-fill-1'>
              <AgentOutputIcon name='changes' size={14} />
            </span>
            <span className='text-14px text-t-primary font-medium'>{title}</span>
          </div>
          <Down
            theme='outline'
            size='16'
            fill={iconColors.secondary}
            className={classNames('transition-transform duration-200', expanded && 'rotate-180')}
          />
        </div>

        {expanded && (
          <div className='w-full bg-2'>
            {files.map((file, index) => (
              <div
                key={`${file.fullPath}-${index}`}
                className={classNames(
                  'group flex items-center justify-between px-16px py-12px hover:bg-3 transition-colors'
                )}
              >
                <div className='flex items-center min-w-0'>
                  <span className='text-14px text-t-primary truncate'>{file.file_name}</span>
                </div>
                <div className='flex items-center gap-8px shrink-0'>
                  {(file.insertions > 0 || file.deletions > 0) && (
                    <span
                      className={classNames(
                        'flex items-center gap-4px rd-4px px-4px py-2px',
                        onDiffClick && 'cursor-pointer hover:bg-4 transition-colors'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDiffClick?.(file);
                      }}
                    >
                      {file.insertions > 0 && (
                        <span className='text-14px font-medium' style={{ color: diffColors.addition }}>
                          +{file.insertions}
                        </span>
                      )}
                      {file.deletions > 0 && (
                        <span className='text-14px font-medium' style={{ color: diffColors.deletion }}>
                          -{file.deletions}
                        </span>
                      )}
                    </span>
                  )}
                  <span
                    className='group-hover:opacity-100 transition-opacity shrink-0 ml-4px flex items-center gap-4px text-12px text-t-secondary cursor-pointer rd-4px px-4px py-2px hover:bg-4'
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileClick?.(file);
                    }}
                  >
                    <AgentOutputIcon className='line-height-8px' name='preview' size={14} />
                    {t('preview.preview')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={classNames(
        'message-file-changes-panel message-file-changes-panel--result w-full box-border overflow-hidden border border-solid bg-bg-0',
        className
      )}
      style={{ width: '100%', borderRadius: 8, boxShadow: 'none' }}
    >
      <div className='message-file-changes-panel__header flex flex-wrap items-center justify-between gap-10px px-12px py-8px sm:py-9px'>
        <div className='flex min-w-0 items-center gap-10px'>
          <div className='message-file-changes-panel__icon h-28px w-28px flex flex-shrink-0 items-center justify-center rounded-6px bg-fill-1'>
            <AgentOutputIcon name='changes' size={17} />
          </div>
          <div className='min-w-0'>
            <div className='truncate text-13px font-medium leading-18px text-t-primary'>
              {t('messages.editedFilesCount', {
                count: files.length,
                defaultValue: title || '{{count}} edited files',
              })}
            </div>
            <div className='mt-1px flex items-center gap-4px font-mono text-12px leading-15px'>
              <span style={{ color: diffColors.addition }}>+{totals.insertions}</span>
              <span style={{ color: diffColors.deletion }}>-{totals.deletions}</span>
            </div>
          </div>
        </div>
        <div className='message-file-changes-panel__actions flex flex-shrink-0 items-center gap-6px'>
          {showUndo && (
            <Button
              type='text'
              size='small'
              loading={undoButtonLoading}
              disabled={undoDisabled}
              title={undoTitle}
              className={classNames(
                '!h-28px !rounded-6px !px-6px !text-12px !font-medium',
                effectiveUndoState === 'undone' && 'opacity-70',
                effectiveUndoState === 'blocked' && 'opacity-60'
              )}
              onClick={(event) => {
                event.stopPropagation();
                if (effectiveUndoState !== 'ready') return;
                onUndo?.();
              }}
            >
              <span className='flex items-center gap-4px'>
                {undoLabel}
                <AgentOutputIcon name='undo' size={13} />
              </span>
            </Button>
          )}
          {canReview && (
            <Button
              size='small'
              className='!h-28px !rounded-6px !px-10px !text-12px !font-medium'
              onClick={(event) => {
                event.stopPropagation();
                handleReview();
              }}
            >
              {t('preview.preview', { defaultValue: 'Preview' })}
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className='message-file-changes-panel__body w-full border-t bg-bg-0'>
          {files.map((file, index) => (
            <div
              key={`${file.fullPath}-${index}`}
              className={classNames(
                'message-file-changes-panel__row group flex min-h-42px items-center justify-between gap-10px py-6px pl-12px pr-14px transition-colors sm:pr-16px',
                onFileClick && 'cursor-pointer hover:bg-fill-1'
              )}
              role={onFileClick ? 'button' : undefined}
              tabIndex={onFileClick ? 0 : undefined}
              onClick={() => onFileClick?.(file)}
              onKeyDown={(event) => {
                if (!onFileClick) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onFileClick(file);
                }
              }}
            >
              <div className='flex min-w-0 items-center'>
                <span className='message-file-changes-panel__path truncate text-13px text-t-primary'>
                  {file.fullPath || file.file_name}
                </span>
              </div>
              <div className='flex flex-shrink-0 items-center gap-10px'>
                <span
                  className={classNames(
                    'message-file-changes-panel__stats flex items-center gap-4px rounded-6px px-5px py-2px font-mono text-12px font-medium',
                    onDiffClick && 'cursor-pointer hover:bg-fill-2'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiffClick?.(file);
                  }}
                  role={onDiffClick ? 'button' : undefined}
                  tabIndex={onDiffClick ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (!onDiffClick) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      onDiffClick(file);
                    }
                  }}
                >
                  <span style={{ color: diffColors.addition }}>+{file.insertions}</span>
                  <span style={{ color: diffColors.deletion }}>-{file.deletions}</span>
                </span>
                {onFileClick && (
                  <AgentOutputIcon
                    name='preview'
                    className='message-file-changes-panel__preview-icon opacity-0 transition-opacity group-hover:opacity-100'
                    size={14}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileChangesPanel;
