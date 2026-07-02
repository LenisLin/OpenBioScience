/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewContentType } from '@/common/types/office/preview';
import AgentOutputIcon, { getAgentOutputFileIconName } from '@/renderer/components/icons/AgentOutputIcon';
import { getContentTypeByExtension, getFileExtension } from '@/renderer/pages/conversation/Preview/fileUtils';
import { useLocalFilePreview } from '@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview';
import { copyText } from '@/renderer/utils/ui/clipboard';
import { Button, Dropdown, Menu, Message } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import './MessageOutputFiles.css';

type OutputArtifactInfo = {
  id: string;
  kind: 'file';
  path: string;
  name: string;
  extension: string;
  typeLabel: string;
  contentType: PreviewContentType;
};

const getFileName = (path: string): string => path.replace(/\\/g, '/').split('/').pop() || path;

const getTypeLabel = (contentType: PreviewContentType, extension: string): string => {
  const extLabel = extension ? extension.toUpperCase() : 'FILE';
  switch (contentType) {
    case 'markdown':
      return extension ? extLabel : 'MD';
    case 'pdf':
      return 'PDF';
    case 'ppt':
      return extension ? extLabel : 'PPT';
    case 'word':
      return extension ? extLabel : 'DOC';
    case 'excel':
      return extension ? extLabel : 'XLS';
    case 'image':
      return extLabel;
    case 'html':
      return 'HTML';
    case 'diff':
      return extension ? extLabel : 'DIFF';
    case 'molecular_structure':
      return extension ? extLabel : 'STRUCT';
    case 'code':
    default:
      return extLabel;
  }
};

const stripWrapping = (value: string): string =>
  value
    .trim()
    .replace(/^<(.+)>$/, '$1')
    .replace(/[),.;!?]+$/g, '');

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const isAbsolutePath = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^file:/i.test(value);

const resolveFileHref = (href: string, workspace?: string): string | null => {
  const cleanHref = stripWrapping(href);
  if (!cleanHref || isHttpUrl(cleanHref) || (/^[a-z][a-z0-9+.-]*:/i.test(cleanHref) && !/^file:/i.test(cleanHref))) {
    return null;
  }

  if (/^file:/i.test(cleanHref)) {
    try {
      return decodeURIComponent(new URL(cleanHref).pathname);
    } catch {
      return cleanHref.replace(/^file:(?:\/\/)?/i, '');
    }
  }

  if (isAbsolutePath(cleanHref)) {
    return cleanHref;
  }

  if (!workspace || cleanHref.startsWith('#')) {
    return null;
  }

  if (!/\.[A-Za-z0-9]{1,12}(?:[#?].*)?$/.test(cleanHref)) {
    return null;
  }

  const normalizedWorkspace = workspace.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const normalizedHref = cleanHref.replace(/^\.?[\\/]+/, '').replace(/\\/g, '/');
  return `${normalizedWorkspace}/${normalizedHref}`.replace(/\/+/g, '/');
};

const FileKindIcon: React.FC<{ name: string; contentType: PreviewContentType; size?: number }> = ({
  name,
  contentType,
  size = 19,
}) => (
  <AgentOutputIcon
    name={getAgentOutputFileIconName(name, contentType === 'code' ? undefined : contentType)}
    size={size}
  />
);

const buildOutputFileInfo = (path: string): OutputArtifactInfo => {
  const name = getFileName(path);
  const extension = getFileExtension(name);
  const contentType = getContentTypeByExtension(name);
  return {
    id: `file:${path}`,
    kind: 'file',
    path,
    name,
    extension,
    contentType,
    typeLabel: getTypeLabel(contentType, extension),
  };
};

const extractArtifactsFromContent = (content: string, workspace?: string): OutputArtifactInfo[] => {
  if (!content.trim()) return [];
  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, ' ');
  const artifacts: OutputArtifactInfo[] = [];
  const markdownLinkRegex = /!?\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = markdownLinkRegex.exec(withoutCodeBlocks))) {
    const [, , href] = match;
    const cleanHref = stripWrapping(href);
    if (isHttpUrl(cleanHref)) continue;
    const path = resolveFileHref(cleanHref, workspace);
    if (path) artifacts.push(buildOutputFileInfo(path));
  }

  const pathRegex =
    /(?:^|[\s`])((?:\/(?:Users|home|tmp|private|var|mnt|Volumes)\/|[A-Za-z]:[\\/])[^`<>\n\r\t ]+\.[A-Za-z0-9]{1,12})(?=$|[\s`),.;!?])/g;
  while ((match = pathRegex.exec(withoutCodeBlocks))) {
    const path = resolveFileHref(stripWrapping(match[1]), workspace);
    if (path) artifacts.push(buildOutputFileInfo(path));
  }

  return artifacts;
};

const MessageOutputFiles: React.FC<{
  files: string[];
  workspace?: string;
  content?: string;
  className?: string;
}> = ({ files, workspace, content = '', className }) => {
  const { t } = useTranslation();
  const openLocalFilePreview = useLocalFilePreview(workspace);
  const fileItems = useMemo(() => {
    const artifacts = [
      ...Array.from(new Set(files)).map(buildOutputFileInfo),
      ...extractArtifactsFromContent(content, workspace),
    ];
    return Array.from(new Map(artifacts.map((artifact) => [artifact.id, artifact])).values());
  }, [content, files, workspace]);

  const openPreview = useCallback(
    (file: OutputArtifactInfo) => {
      void openLocalFilePreview(file.path);
    },
    [openLocalFilePreview]
  );

  const handleOpenSystem = useCallback(
    async (file: OutputArtifactInfo) => {
      try {
        await ipcBridge.shell.openFile.invoke(file.path);
        Message.success(t('preview.openInSystemSuccess'));
      } catch (error) {
        console.error('[MessageOutputFiles] Failed to open artifact in system app:', error);
        Message.error(t('preview.openInSystemFailed'));
      }
    },
    [t]
  );

  const handleShowInFolder = useCallback(
    async (file: OutputArtifactInfo) => {
      try {
        await ipcBridge.shell.showItemInFolder.invoke(file.path);
      } catch (error) {
        console.error('[MessageOutputFiles] Failed to show file in folder:', error);
        Message.error(t('preview.openInSystemFailed'));
      }
    },
    [t]
  );

  const handleCopyPath = useCallback(
    async (file: OutputArtifactInfo) => {
      try {
        await copyText(file.path);
        Message.success(t('common.copySuccess'));
      } catch {
        Message.error(t('common.copyFailed'));
      }
    },
    [t]
  );

  if (fileItems.length === 0) {
    return null;
  }

  return (
    <div
      className={classNames(
        'message-output-files mt-10px w-full overflow-hidden border border-solid bg-bg-0',
        className
      )}
      style={{ borderRadius: 8, boxShadow: 'none' }}
    >
      <div className='message-output-files__header flex items-center justify-between gap-10px border-b px-12px py-8px'>
        <div className='flex min-w-0 items-center gap-8px'>
          <span className='message-output-files__icon-box flex h-24px w-24px flex-shrink-0 items-center justify-center rounded-6px bg-fill-1'>
            <AgentOutputIcon name='file' size={15} />
          </span>
          <span className='truncate text-12px font-medium leading-16px text-t-primary'>
            {t('common.file')} · {fileItems.length}
          </span>
        </div>
      </div>

      <div className='flex w-full flex-col bg-bg-0'>
        {fileItems.map((file, index) => (
          <div
            key={file.id}
            className={classNames(
              'message-output-files__row group flex min-h-42px w-full items-center justify-between gap-10px py-6px pl-12px pr-14px transition-colors hover:bg-fill-1 sm:pr-16px',
              index > 0 && 'message-output-files__row--divided border-t'
            )}
            role='button'
            tabIndex={0}
            title={file.path}
            onClick={() => openPreview(file)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openPreview(file);
              }
            }}
          >
            <div className='flex min-w-0 flex-1 items-center gap-8px'>
              <div className='message-output-files__icon-box message-output-files__icon-box--file flex h-28px w-28px flex-shrink-0 items-center justify-center rounded-6px bg-fill-1'>
                <FileKindIcon name={file.name} contentType={file.contentType} size={18} />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='truncate text-13px font-medium leading-17px text-t-primary'>{file.name}</div>
                <div className='mt-1px text-11px leading-14px text-t-secondary'>
                  {t('common.file')} · {file.typeLabel}
                </div>
              </div>
            </div>
            <div className='message-output-files__actions flex flex-shrink-0 items-center justify-end pl-8px'>
              <Dropdown
                trigger='click'
                position='br'
                droplist={
                  <Menu
                    onClickMenuItem={(key) => {
                      if (key === 'preview') openPreview(file);
                      if (key === 'system') void handleOpenSystem(file);
                      if (key === 'folder') void handleShowInFolder(file);
                      if (key === 'copy') void handleCopyPath(file);
                    }}
                  >
                    <Menu.Item key='preview'>
                      <span className='flex items-center gap-8px'>
                        <AgentOutputIcon name='preview' size={15} />
                        {t('preview.openInPanelTooltip')}
                      </span>
                    </Menu.Item>
                    <Menu.Item key='system'>
                      <span className='flex items-center gap-8px'>
                        <AgentOutputIcon name='openSystem' size={15} />
                        {t('preview.openInSystemApp')}
                      </span>
                    </Menu.Item>
                    <Menu.Item key='folder'>
                      <span className='flex items-center gap-8px'>
                        <AgentOutputIcon name='folder' size={15} />
                        {t('update.showInFolder')}
                      </span>
                    </Menu.Item>
                    <Menu.Item key='copy'>
                      <span className='flex items-center gap-8px'>
                        <AgentOutputIcon name='copy' size={15} />
                        {t('messages.copyPath', { defaultValue: 'Copy path' })}
                      </span>
                    </Menu.Item>
                  </Menu>
                }
              >
                <Button
                  size='small'
                  className='message-output-files__button !h-26px !flex-shrink-0 !rounded-6px !px-9px !text-12px !font-medium'
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className='flex items-center gap-4px'>
                    {t('messages.openWith', { defaultValue: 'Open with' })}
                    <Down theme='outline' size='12' />
                  </span>
                </Button>
              </Dropdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(MessageOutputFiles);
