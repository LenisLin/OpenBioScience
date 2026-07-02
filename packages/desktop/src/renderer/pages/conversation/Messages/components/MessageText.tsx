/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chat/chatLib';
import { APP_FILES_MARKER, LEGACY_FILES_MARKER } from '@/common/config/constants';
import type { FileChangeInfo } from '../MessageFileChanges';
import MessageFileChanges from '../MessageFileChanges';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useLocalFilePreview } from '@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { iconColors } from '@/renderer/styles/colors';
import { Alert, Message, Tooltip } from '@arco-design/web-react';
import { Copy } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyText } from '@/renderer/utils/ui/clipboard';
import CollapsibleContent from '@renderer/components/chat/CollapsibleContent';
import FilePreview from '@renderer/components/media/FilePreview';
import HorizontalFileList from '@renderer/components/media/HorizontalFileList';
import MarkdownView from '@renderer/components/Markdown';
import { stripThinkTags, hasThinkTags } from '@renderer/utils/chat/thinkTagFilter';
import { stripSkillSuggest, hasSkillSuggest } from '@renderer/utils/chat/skillSuggestParser';
import MessageOutputFiles from './MessageOutputFiles';
import CollaborationIcon from '@/renderer/components/icons/CollaborationIcon';

/**
 * Format a timestamp for message display.
 * Today: "HH:mm", older: "MM-DD HH:mm".
 */
export const formatMessageTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  if (
    date.getFullYear() !== now.getFullYear() ||
    date.getMonth() !== now.getMonth() ||
    date.getDate() !== now.getDate()
  ) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${month}-${day} ${time}`;
  }
  return time;
};
import MessageCronBadge from './MessageCronBadge';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import TeammateMessageAvatar from './TeammateMessageAvatar';

const CODE_STYLE = { marginTop: 4, marginBlock: 4 };

const parseFileMarker = (content: string) => {
  const activeMarker = content.includes(APP_FILES_MARKER) ? APP_FILES_MARKER : LEGACY_FILES_MARKER;
  const markerIndex = content.indexOf(activeMarker);
  if (markerIndex === -1) {
    return { text: content, files: [] as string[] };
  }
  const text = content.slice(0, markerIndex).trimEnd();
  const afterMarker = content.slice(markerIndex + activeMarker.length).trim();
  const files = afterMarker
    ? afterMarker
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  return { text, files };
};

const isAbsoluteMessageFilePath = (file_path: string): boolean =>
  file_path.startsWith('/') || /^[A-Za-z]:/.test(file_path);

const isContextCompactedMarkerText = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return (
    value
      .trim()
      .replace(/[.!。]+$/g, '')
      .toLowerCase() === 'context compacted'
  );
};

export const resolveMessageFilePath = (file_path: string, workspace?: string): string => {
  if (!file_path || isAbsoluteMessageFilePath(file_path) || !workspace) {
    return file_path;
  }

  const normalizedWorkspace = workspace.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const normalizedFilePath = file_path.replace(/^\.?[\\/]+/, '').replace(/\\/g, '/');
  return `${normalizedWorkspace}/${normalizedFilePath}`.replace(/\/+/g, '/');
};

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      const isJson = typeof json === 'object';
      return {
        json: isJson,
        data: isJson ? json : content,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

type LarkIncomingMessageDisplay = {
  message: string;
  chatType?: string;
  taskIntent?: boolean;
  agentTaskIntent?: boolean;
};

const LEGACY_LARK_PROMPT_PREFIX = 'Please reply to this incoming Feishu/Lark message.';

function pickPayloadString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function parseLegacyLarkIncomingPrompt(value: string): LarkIncomingMessageDisplay | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith(LEGACY_LARK_PROMPT_PREFIX)) return null;

  const messageMarker = trimmed.match(/(?:^|\n)Message:\s*/u);
  if (!messageMarker || typeof messageMarker.index !== 'number') return null;

  const rest = trimmed.slice(messageMarker.index + messageMarker[0].length);
  const stopMarkers = ['\n\nSender Open ID:', '\n\nMessage ID:', '\n\nReturn only'];
  const stopIndex = stopMarkers.reduce((current, marker) => {
    const index = rest.indexOf(marker);
    return index >= 0 ? Math.min(current, index) : current;
  }, rest.length);
  const message = rest.slice(0, stopIndex).trim();
  return message ? { message, chatType: 'direct_chat' } : null;
}

function parseLarkIncomingMessage(value: string): LarkIncomingMessageDisplay | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const payload = JSON.parse(trimmed) as unknown;
    if (
      payload &&
      typeof payload === 'object' &&
      (payload as Record<string, unknown>).__aion_lark_incoming_message === true
    ) {
      const record = payload as Record<string, unknown>;
      const message = pickPayloadString(record, ['message', 'content', 'displayMessage']);
      if (!message) return null;
      return {
        message,
        chatType: pickPayloadString(record, ['chatType', 'larkChatType']),
        taskIntent: record.taskIntent === true,
        agentTaskIntent: record.agentTaskIntent === true,
      };
    }
  } catch {
    // Fall through to the legacy plain-text parser.
  }

  return parseLegacyLarkIncomingPrompt(trimmed);
}

const LarkIncomingMessageCard: React.FC<{ incoming: LarkIncomingMessageDisplay }> = ({ incoming }) => {
  const chatTypeLabel = incoming.chatType === 'group' || incoming.chatType === 'group_chat' ? '群聊' : '私聊';
  return (
    <div
      className='relative max-w-[calc(100vw-48px)] overflow-hidden rounded-14px border border-solid border-[rgba(49,98,126,0.18)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(242,248,255,0.96))] px-16px py-14px shadow-[0_12px_34px_rgba(32,61,76,0.11)] md:max-w-680px'
      data-testid='lark-incoming-message-card'
    >
      <div className='absolute right-12px top-10px h-34px w-34px rounded-full bg-[rgba(198,167,77,0.14)] blur-6px' />
      <div className='relative flex items-center gap-10px'>
        <span className='flex h-32px w-32px shrink-0 items-center justify-center rounded-10px bg-[rgba(255,255,255,0.74)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.82)]'>
          <CollaborationIcon name='message' size={25} />
        </span>
        <div className='min-w-0'>
          <div className='text-13px font-700 leading-18px text-t-primary'>飞书来信</div>
          <div className='text-11px leading-16px text-t-tertiary'>协作入口 · {chatTypeLabel}</div>
        </div>
      </div>
      <div className='relative mt-12px whitespace-pre-wrap break-words text-15px leading-24px text-t-primary'>
        {incoming.message}
      </div>
    </div>
  );
};

const MessageText: React.FC<{ message: IMessageText; showCopyRow?: boolean; resultFileChanges?: FileChangeInfo[] }> = ({
  message,
  showCopyRow = true,
  resultFileChanges = [],
}) => {
  // Filter think tags from content before rendering
  // 在渲染前过滤 think 标签
  const contentToRender = useMemo(() => {
    let content = message.content.content;
    if (typeof content === 'string') {
      if (hasThinkTags(content)) {
        content = stripThinkTags(content);
      }
      // Strip any inline [SKILL_SUGGEST] blocks (now handled via separate skill_suggest message type)
      if (hasSkillSuggest(content)) {
        content = stripSkillSuggest(content);
      }
      return content;
    }
    return content;
  }, [message.content.content]);

  const { text, files } = parseFileMarker(contentToRender);
  const { data, json } = useFormatContent(text);
  const { t } = useTranslation();
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const isUserMessage = message.position === 'right';
  const isTeammateMessage = message.position === 'left' && message.content.teammateMessage === true;
  const shouldRenderPlainText = isUserMessage;
  const conversationContext = useConversationContextSafe();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const handleLocalFileLink = useLocalFilePreview(conversationContext?.workspace);
  const { openPreview } = usePreviewContext();
  const handleLinkPreview = React.useCallback(
    (href: string, label?: string) => {
      openPreview(href, 'url', { title: label || href });
    },
    [openPreview]
  );
  const resolvedFiles = useMemo(
    () => files.map((file_path) => resolveMessageFilePath(file_path, conversationContext?.workspace)),
    [conversationContext?.workspace, files]
  );
  const shouldRenderContextCompactedDivider =
    !isUserMessage && files.length === 0 && isContextCompactedMarkerText(text);
  const larkIncomingMessage = useMemo(
    () => (isUserMessage && typeof text === 'string' ? parseLarkIncomingMessage(text) : null),
    [isUserMessage, text]
  );

  // 过滤空内容，避免渲染空DOM
  if (!message.content.content || (typeof message.content.content === 'string' && !message.content.content.trim())) {
    return null;
  }

  if (shouldRenderContextCompactedDivider) {
    return (
      <div
        className='context-compacted-divider'
        role='separator'
        aria-label='Context Compacted'
        data-testid='context-compacted-divider'
      >
        <span className='context-compacted-divider__line' />
        <span className='context-compacted-divider__label'>Context Compacted</span>
        <span className='context-compacted-divider__line' />
      </div>
    );
  }

  const handleCopy = () => {
    const baseText = larkIncomingMessage?.message ?? (shouldRenderPlainText ? text : json ? JSON.stringify(data, null, 2) : text);
    const fileList = files.length ? `Files:\n${files.map((path) => `- ${path}`).join('\n')}\n\n` : '';
    const textToCopy = fileList + baseText;
    copyText(textToCopy)
      .then(() => {
        setShowCopyAlert(true);
        setTimeout(() => setShowCopyAlert(false), 2000);
      })
      .catch(() => {
        Message.error(t('common.copyFailed'));
      });
  };

  const copyButton = (
    <Tooltip content={t('common.copy', { defaultValue: 'Copy' })}>
      <div
        className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
        onClick={handleCopy}
        style={{ lineHeight: 0 }}
      >
        <Copy theme='outline' size='16' fill={iconColors.secondary} />
      </div>
    </Tooltip>
  );

  const cronMeta = message.content.cronMeta;
  const senderName = message.content.senderName;
  const senderAgentType = message.content.senderAgentType;
  const senderConversationId = message.content.senderConversationId;
  const fallbackBackendLogo = senderAgentType ? getAgentLogo(senderAgentType) : null;

  return (
    <>
      <div className={classNames('min-w-0 flex flex-col group', isUserMessage ? 'items-end' : 'items-start')}>
        {cronMeta && <MessageCronBadge meta={cronMeta} />}
        {isTeammateMessage && senderName && (
          <div className='flex items-center gap-6px mb-4px'>
            <TeammateMessageAvatar
              senderName={senderName}
              senderConversationId={senderConversationId}
              backendLogo={fallbackBackendLogo}
            />
            <span className='text-12px text-t-secondary'>{senderName}</span>
          </div>
        )}
        {isUserMessage && files.length > 0 && (
          <div className='mt-6px self-end'>
            {resolvedFiles.length === 1 ? (
              <div className='flex items-center'>
                <FilePreview path={resolvedFiles[0]} onRemove={() => undefined} readonly />
              </div>
            ) : (
              <HorizontalFileList>
                {resolvedFiles.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => undefined} readonly />
                ))}
              </HorizontalFileList>
            )}
          </div>
        )}
        {larkIncomingMessage ? (
          <LarkIncomingMessageCard incoming={larkIncomingMessage} />
        ) : (
          <div
            className={classNames('min-w-0 [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px md:max-w-780px', {
              'bg-aou-2 p-6px md:p-8px': isUserMessage || cronMeta,
              'bg-3 p-6px md:p-8px': isTeammateMessage,
              'w-full': !(isUserMessage || cronMeta || isTeammateMessage),
            })}
            style={{
              ...(isUserMessage || cronMeta
                ? { borderRadius: '8px 0 8px 8px', color: 'var(--text-primary)' }
                : isTeammateMessage
                  ? { borderRadius: '0 8px 8px 8px' }
                  : undefined),
            }}
          >
            {/* JSON 内容使用折叠组件 Use CollapsibleContent for JSON content */}
            {shouldRenderPlainText ? (
              <div className='whitespace-pre-wrap break-words' data-testid='message-text-content'>
                {text}
              </div>
            ) : json ? (
              <CollapsibleContent maxHeight={200} defaultCollapsed={true}>
                <div data-testid='message-text-content'>
                  <MarkdownView
                    codeStyle={CODE_STYLE}
                    onLocalFileLink={handleLocalFileLink}
                    onLinkPreview={handleLinkPreview}
                  >{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
                </div>
              </CollapsibleContent>
            ) : (
              <div data-testid='message-text-content'>
                <MarkdownView
                  codeStyle={CODE_STYLE}
                  onLocalFileLink={handleLocalFileLink}
                  onLinkPreview={handleLinkPreview}
                >
                  {data}
                </MarkdownView>
              </div>
            )}
            {!isUserMessage && typeof data === 'string' && (
              <MessageOutputFiles files={resolvedFiles} workspace={conversationContext?.workspace} content={data} />
            )}
            {!isUserMessage && resultFileChanges.length > 0 && (
              <div className='mt-14px'>
                <MessageFileChanges diffsChanges={resultFileChanges} />
              </div>
            )}
          </div>
        )}
        {/* Hover-revealed copy + timestamp row. Mobile has no hover affordance,
            so we drop the row entirely — system-level long-press still copies.
            For AI replies split across several text messages, only the last text
            of the turn shows this row (showCopyRow); user messages always do. */}
        {!isMobile && showCopyRow && (
          <div
            className={classNames('h-32px flex items-center mt-4px gap-8px', {
              'flex-row-reverse': isUserMessage,
            })}
          >
            {copyButton}
            {message.created_at && (
              <span className='text-12px text-t-secondary opacity-0 group-hover:opacity-100 transition-opacity select-none'>
                {formatMessageTime(message.created_at)}
              </span>
            )}
          </div>
        )}
      </div>
      {showCopyAlert && (
        <Alert
          type='success'
          content={t('messages.copySuccess')}
          showIcon
          className='fixed top-20px left-50% transform -translate-x-50% z-9999 w-max max-w-[80%]'
          style={{ boxShadow: '0px 2px 12px rgba(0,0,0,0.12)' }}
          closable={false}
        />
      )}
    </>
  );
};

export default MessageText;
