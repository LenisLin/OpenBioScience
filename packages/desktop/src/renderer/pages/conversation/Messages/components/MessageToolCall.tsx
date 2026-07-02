/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolCall } from '@/common/chat/chatLib';
import { normalizeToolCall } from '@/common/chat/normalizeToolCall';
import type { NormalizedToolStatus } from '@/common/chat/normalizeToolCall';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import AgentStatusIcon, { type AgentStatusIconName } from '@/renderer/components/icons/AgentStatusIcon';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import { createTwoFilesPatch } from 'diff';
import React, { useMemo, useState } from 'react';
import './MessageToolGroupSummary.css';

type ToolIconSpec = {
  name: AgentStatusIconName;
  spin?: boolean;
};

const normalizeToolText = (value?: string): string => (value || '').toLowerCase().replace(/[\s_-]+/g, '');

const statusIconForTool = (status: NormalizedToolStatus): ToolIconSpec => {
  switch (status) {
    case 'completed':
      return { name: 'checkOne' };
    case 'error':
      return { name: 'error' };
    case 'canceled':
      return { name: 'closeOne' };
    case 'running':
      return { name: 'loading', spin: true };
    case 'pending':
    default:
      return { name: 'time' };
  }
};

const iconForTool = (name?: string, kind?: string, status?: NormalizedToolStatus): ToolIconSpec => {
  if (status === 'error' || status === 'canceled') return statusIconForTool(status);
  const text = normalizeToolText(`${kind || ''} ${name || ''}`);
  if (/(websearch|searchweb)/.test(text)) return { name: 'globe' };
  if (/(webfetch|fetchurl|fetch)/.test(text)) return { name: 'webPage' };
  if (/(grep|ripgrep|search|glob|findfiles|listfiles|rg)/.test(text)) return { name: 'fileSearch' };
  if (/(read|readfile|viewfile|openfile)/.test(text)) return { name: 'fileText' };
  if (/(write|writefile|createfile)/.test(text)) return { name: 'write' };
  if (/(edit|replace|strreplace|updatefile)/.test(text)) return { name: 'fileEditing' };
  if (/(bash|shell|exec|execute|run|command|terminal)/.test(text)) return { name: 'terminal' };
  return statusIconForTool(status || 'pending');
};

const ReplacePreview: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const file_path = message.content.args?.file_path || message.content.input?.file_path || '';
  const old_string = message.content.args?.old_string ?? message.content.input?.old_string ?? '';
  const new_string = message.content.args?.new_string ?? message.content.input?.new_string ?? '';

  const diffText = useMemo(() => {
    return createTwoFilesPatch(file_path, file_path, old_string, new_string, '', '', { context: 3 });
  }, [file_path, old_string, new_string]);

  const fileInfo = useMemo(() => parseDiff(diffText, file_path), [diffText, file_path]);
  const display_name = file_path.split(/[/\\]/).pop() || file_path;
  const { handleDiffClick } = useDiffPreviewHandlers({ diffText, display_name, file_path });

  return (
    <FileChangesPanel
      title={fileInfo.file_name}
      files={[fileInfo]}
      onFileClick={handleDiffClick}
      onDiffClick={handleDiffClick}
      defaultExpanded={true}
    />
  );
};

const MessageToolCall: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const { name } = message.content;
  const [expanded, setExpanded] = useState(false);

  if (name === 'replace' || name === 'Edit') {
    return <ReplacePreview message={message} />;
  }

  const normalized = normalizeToolCall(message);
  if (!normalized) {
    return <div className='text-t-primary'>{name}</div>;
  }

  const hasDetail = normalized.input || normalized.output;
  const icon = iconForTool(normalized.name, normalized.kind, normalized.status);

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <AgentStatusIcon className='tool-status-icon' name={icon.name} size={15} spin={icon.spin} />
        <span
          className={
            'flex-1 min-w-0' +
            (expanded ? ' break-all' : ' truncate') +
            (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')
          }
          onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
        >
          <span className='font-medium text-13px'>{normalized.name}</span>
          {normalized.description && <span className='m-l-4px opacity-80 text-13px'>{normalized.description}</span>}
        </span>
        {hasDetail && (
          <span
            className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors'
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div className='tool-detail-panel m-l-20px m-t-4px'>
          {normalized.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Input</div>
              <pre className='tool-detail-content'>{normalized.input}</pre>
            </div>
          )}
          {normalized.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Output</div>
              <pre className='tool-detail-content'>{normalized.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageToolCall;
