/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import FileChangesPanel, {
  type FileChangeItem,
  type FileChangesUndoState,
} from '@/renderer/components/base/FileChangesPanel';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { usePreviewLauncher } from '@/renderer/hooks/file/usePreviewLauncher';
import { extractContentFromDiff, parseDiff, type FileChangeInfo } from '@/renderer/utils/file/diffUtils';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { Message, Modal } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WriteFileResult } from './types';
import {
  canUndoFileChanges,
  inspectUndoFileChanges,
  type UndoFailureReason,
  type UndoFileChangesInspection,
  undoFileChanges,
} from './utils/undoFileChanges';

export { parseDiff, type FileChangeInfo } from '@/renderer/utils/file/diffUtils';

export interface MessageFileChangesProps {
  writeFileChanges?: WriteFileResult[];
  className?: string;
  diffsChanges?: FileChangeInfo[];
}

const EMPTY_WRITE_FILE_CHANGES: WriteFileResult[] = [];
const EMPTY_DIFFS_CHANGES: FileChangeInfo[] = [];

const hashString = (value: string): string => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

const readStoredUndoState = (key: string | null): boolean => {
  if (!key || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === 'undone';
  } catch {
    return false;
  }
};

const writeStoredUndoState = (key: string | null, value: boolean) => {
  if (!key || typeof window === 'undefined') return;
  try {
    if (value) {
      window.localStorage.setItem(key, 'undone');
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Best-effort UI state only.
  }
};

const MessageFileChanges: React.FC<MessageFileChangesProps> = ({
  writeFileChanges = EMPTY_WRITE_FILE_CHANGES,
  diffsChanges = EMPTY_DIFFS_CHANGES,
  className,
}) => {
  const { t } = useTranslation();
  const { launchPreview } = usePreviewLauncher();
  const conversationContext = useConversationContextSafe();
  const [messageApi, messageContext] = Message.useMessage();
  const [undoState, setUndoState] = useState<FileChangesUndoState>('hidden');
  const [undoTitle, setUndoTitle] = useState<string | undefined>(undefined);

  const fileChanges = useMemo(() => {
    return Array.from(new Map(diffsChanges.map((fileInfo) => [fileInfo.fullPath, fileInfo])).values()).concat(
      writeFileChanges.flatMap((change) => {
        if (!change.file_diff) {
          return [];
        }
        return [parseDiff(change.file_diff, change.file_name)];
      })
    );
  }, [diffsChanges, writeFileChanges]);

  const canUndo = useMemo(
    () => Boolean(conversationContext?.workspace) && canUndoFileChanges(fileChanges),
    [conversationContext?.workspace, fileChanges]
  );
  const undoStorageKey = useMemo(() => {
    if (!conversationContext?.workspace || fileChanges.length === 0) return null;
    return `message-file-undo:${hashString(
      JSON.stringify({
        conversation_id: conversationContext.conversation_id,
        workspace: conversationContext.workspace,
        files: fileChanges.map((file) => ({
          path: file.fullPath,
          diff: file.diff,
        })),
      })
    )}`;
  }, [conversationContext?.conversation_id, conversationContext?.workspace, fileChanges]);

  const getUndoReasonLabel = useCallback(
    (reason: UndoFailureReason | undefined): string => {
      switch (reason) {
        case 'outside_workspace':
          return t('messages.undoReasonOutsideWorkspace', { defaultValue: 'File is outside the workspace' });
        case 'invalid_diff':
          return t('messages.undoReasonInvalidDiff', { defaultValue: 'Diff cannot be reversed' });
        case 'read_failed':
          return t('messages.undoReasonReadFailed', { defaultValue: 'File cannot be read' });
        case 'write_failed':
          return t('messages.undoReasonWriteFailed', { defaultValue: 'File cannot be written' });
        case 'remove_failed':
          return t('messages.undoReasonRemoveFailed', { defaultValue: 'File cannot be removed' });
        case 'rollback_failed':
          return t('messages.undoReasonRollbackFailed', { defaultValue: 'Rollback failed' });
        case 'patch_failed':
        default:
          return t('messages.undoReasonPatchFailed', { defaultValue: 'File changed since this diff was created' });
      }
    },
    [t]
  );

  const getBlockedUndoTitle = useCallback(
    (inspection: UndoFileChangesInspection): string => {
      const firstBlocked = inspection.blocked[0];
      if (!firstBlocked) {
        return t('messages.undoUnavailableTitle', { defaultValue: 'These changes cannot be safely undone' });
      }
      return t('messages.undoUnavailableFileTitle', {
        path: firstBlocked.path,
        reason: getUndoReasonLabel(firstBlocked.reason),
        defaultValue: '{{path}}: {{reason}}',
      });
    },
    [getUndoReasonLabel, t]
  );

  useEffect(() => {
    let cancelled = false;
    const workspace = conversationContext?.workspace;

    if (!workspace || fileChanges.length === 0 || !canUndo) {
      setUndoState('hidden');
      setUndoTitle(undefined);
      return () => {
        cancelled = true;
      };
    }

    setUndoState('checking');
    setUndoTitle(t('messages.undoCheckingTitle', { defaultValue: 'Checking whether these changes can be undone' }));

    inspectUndoFileChanges(fileChanges, workspace)
      .then((inspection) => {
        if (cancelled) return;

        if (inspection.state === 'ready') {
          if (readStoredUndoState(undoStorageKey)) {
            writeStoredUndoState(undoStorageKey, false);
          }
          setUndoState('ready');
          setUndoTitle(t('messages.undoReadyTitle', { defaultValue: 'Undo this message’s file changes' }));
          return;
        }

        if (inspection.state === 'already_undone') {
          writeStoredUndoState(undoStorageKey, true);
          setUndoState('undone');
          setUndoTitle(t('messages.undoDoneTitle', { defaultValue: 'These changes have already been undone' }));
          return;
        }

        setUndoState('blocked');
        setUndoTitle(getBlockedUndoTitle(inspection));
      })
      .catch(() => {
        if (cancelled) return;
        setUndoState('blocked');
        setUndoTitle(t('messages.undoUnavailableTitle', { defaultValue: 'These changes cannot be safely undone' }));
      });

    return () => {
      cancelled = true;
    };
  }, [canUndo, conversationContext?.workspace, fileChanges, getBlockedUndoTitle, t, undoStorageKey]);

  const handleFileClick = useCallback(
    (file: FileChangeItem) => {
      const fileInfo = fileChanges.find((candidate) => candidate.fullPath === file.fullPath);
      if (!fileInfo) return;

      const { contentType, editable, language } = getFileTypeInfo(fileInfo.file_name);

      void launchPreview({
        relativePath: fileInfo.fullPath,
        file_name: fileInfo.file_name,
        contentType,
        editable,
        language,
        fallbackContent: editable ? extractContentFromDiff(fileInfo.diff) : undefined,
        diffContent: fileInfo.diff,
      });
    },
    [fileChanges, launchPreview]
  );

  const handleDiffClick = useCallback(
    (file: FileChangeItem) => {
      const fileInfo = fileChanges.find((candidate) => candidate.fullPath === file.fullPath);
      if (!fileInfo) return;

      void launchPreview({
        file_name: fileInfo.file_name,
        contentType: 'diff',
        editable: false,
        language: 'diff',
        diffContent: fileInfo.diff,
      });
    },
    [fileChanges, launchPreview]
  );

  const handleUndo = useCallback(async () => {
    if (!conversationContext?.workspace || fileChanges.length === 0 || undoState !== 'ready') return;

    const workspace = conversationContext.workspace;
    const formatFailureDetails = (failed: Array<{ path: string; reason: UndoFailureReason }>): string => {
      const first = failed[0];
      if (!first) {
        return t('messages.undoUnavailableTitle', { defaultValue: 'These changes cannot be safely undone' });
      }
      return t('messages.undoUnavailableFileTitle', {
        path: first.path,
        reason: getUndoReasonLabel(first.reason),
        defaultValue: '{{path}}: {{reason}}',
      });
    };

    const runUndo = async () => {
      setUndoState('undoing');
      setUndoTitle(t('messages.undoingTitle', { defaultValue: 'Undoing file changes' }));
      try {
        const result = await undoFileChanges(fileChanges, workspace);
        if (result.failed.length === 0) {
          writeStoredUndoState(undoStorageKey, true);
          setUndoState('undone');
          setUndoTitle(t('messages.undoDoneTitle', { defaultValue: 'These changes have already been undone' }));
          messageApi.success(t('messages.undoSuccess', { defaultValue: 'Changes undone' }));
          window.dispatchEvent(new CustomEvent('workspace:file-changes-refresh'));
          return;
        }

        setUndoState('blocked');
        const failureDetails = formatFailureDetails(result.failed);
        setUndoTitle(failureDetails);
        const failureMessage = t(
          result.undone > 0 ? 'messages.undoPartialFailedWithReason' : 'messages.undoFailedWithReason',
          {
            count: result.failed.length,
            details: failureDetails,
            defaultValue:
              result.undone > 0
                ? 'Some changes could not be undone: {{details}}'
                : 'Unable to undo these changes: {{details}}',
          }
        );
        if (result.undone > 0) {
          messageApi.warning(failureMessage);
        } else {
          messageApi.error(failureMessage);
        }
        window.dispatchEvent(new CustomEvent('workspace:file-changes-refresh'));
      } catch {
        setUndoState('blocked');
        setUndoTitle(t('messages.undoUnavailableTitle', { defaultValue: 'These changes cannot be safely undone' }));
        messageApi.error(
          t('messages.undoFailed', {
            defaultValue: 'Unable to undo these changes because the files have changed since the diff was created',
          })
        );
      }
    };

    Modal.confirm({
      title: t('messages.undoConfirmTitle', { defaultValue: 'Undo file changes?' }),
      content: t('messages.undoConfirmContent', {
        count: fileChanges.length,
        defaultValue:
          'This will restore the files changed by this message only. Newer manual edits are checked again before writing.',
      }),
      okText: t('messages.undoConfirmOk', { defaultValue: 'Undo' }),
      cancelText: t('messages.undoConfirmCancel', { defaultValue: 'Cancel' }),
      okButtonProps: { status: 'warning' },
      onOk: runUndo,
      style: { borderRadius: '12px' },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [conversationContext?.workspace, fileChanges, getUndoReasonLabel, messageApi, t, undoState, undoStorageKey]);

  if (fileChanges.length === 0) {
    return null;
  }

  return (
    <>
      {messageContext}
      <FileChangesPanel
        variant='result'
        title={t('messages.fileChangesCount', { count: fileChanges.length })}
        files={fileChanges}
        onFileClick={handleFileClick}
        onDiffClick={handleDiffClick}
        onUndo={canUndo ? handleUndo : undefined}
        undoState={canUndo ? undoState : 'hidden'}
        undoTitle={undoTitle}
        className={className}
      />
    </>
  );
};

export default React.memo(MessageFileChanges);
