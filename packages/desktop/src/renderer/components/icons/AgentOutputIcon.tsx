/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import archiveIcon from '@/renderer/assets/icons/generated/agent-output-archive.png';
import archiveIconDark from '@/renderer/assets/icons/generated/agent-output-archive-dark.png';
import audioIcon from '@/renderer/assets/icons/generated/agent-output-audio.png';
import audioIconDark from '@/renderer/assets/icons/generated/agent-output-audio-dark.png';
import changesIcon from '@/renderer/assets/icons/generated/agent-output-changes.png';
import changesIconDark from '@/renderer/assets/icons/generated/agent-output-changes-dark.png';
import codeIcon from '@/renderer/assets/icons/generated/agent-output-code.png';
import configIcon from '@/renderer/assets/icons/generated/agent-output-config.png';
import configIconDark from '@/renderer/assets/icons/generated/agent-output-config-dark.png';
import codeIconDark from '@/renderer/assets/icons/generated/agent-output-code-dark.png';
import copyIcon from '@/renderer/assets/icons/generated/agent-output-copy.png';
import copyIconDark from '@/renderer/assets/icons/generated/agent-output-copy-dark.png';
import databaseIcon from '@/renderer/assets/icons/generated/agent-output-database.png';
import databaseIconDark from '@/renderer/assets/icons/generated/agent-output-database-dark.png';
import diffIcon from '@/renderer/assets/icons/generated/agent-output-diff.png';
import diffIconDark from '@/renderer/assets/icons/generated/agent-output-diff-dark.png';
import downloadIcon from '@/renderer/assets/icons/generated/agent-output-download.png';
import downloadIconDark from '@/renderer/assets/icons/generated/agent-output-download-dark.png';
import excelIcon from '@/renderer/assets/icons/generated/agent-output-excel.png';
import excelIconDark from '@/renderer/assets/icons/generated/agent-output-excel-dark.png';
import fileIcon from '@/renderer/assets/icons/generated/agent-output-file.png';
import fileIconDark from '@/renderer/assets/icons/generated/agent-output-file-dark.png';
import folderIcon from '@/renderer/assets/icons/generated/agent-output-folder.png';
import folderIconDark from '@/renderer/assets/icons/generated/agent-output-folder-dark.png';
import htmlIcon from '@/renderer/assets/icons/generated/agent-output-html.png';
import htmlIconDark from '@/renderer/assets/icons/generated/agent-output-html-dark.png';
import imageIcon from '@/renderer/assets/icons/generated/agent-output-image.png';
import imageIconDark from '@/renderer/assets/icons/generated/agent-output-image-dark.png';
import markdownIcon from '@/renderer/assets/icons/generated/agent-output-markdown.png';
import markdownIconDark from '@/renderer/assets/icons/generated/agent-output-markdown-dark.png';
import notebookIcon from '@/renderer/assets/icons/generated/agent-output-notebook.png';
import notebookIconDark from '@/renderer/assets/icons/generated/agent-output-notebook-dark.png';
import openSystemIcon from '@/renderer/assets/icons/generated/agent-output-open-system.png';
import openSystemIconDark from '@/renderer/assets/icons/generated/agent-output-open-system-dark.png';
import pdfIcon from '@/renderer/assets/icons/generated/agent-output-pdf.png';
import pdfIconDark from '@/renderer/assets/icons/generated/agent-output-pdf-dark.png';
import pptIcon from '@/renderer/assets/icons/generated/agent-output-ppt.png';
import pptIconDark from '@/renderer/assets/icons/generated/agent-output-ppt-dark.png';
import previewIcon from '@/renderer/assets/icons/generated/agent-output-preview.png';
import previewIconDark from '@/renderer/assets/icons/generated/agent-output-preview-dark.png';
import tableIcon from '@/renderer/assets/icons/generated/agent-output-table.png';
import tableIconDark from '@/renderer/assets/icons/generated/agent-output-table-dark.png';
import textIcon from '@/renderer/assets/icons/generated/agent-output-text.png';
import textIconDark from '@/renderer/assets/icons/generated/agent-output-text-dark.png';
import undoIcon from '@/renderer/assets/icons/generated/agent-output-undo.png';
import undoIconDark from '@/renderer/assets/icons/generated/agent-output-undo-dark.png';
import videoIcon from '@/renderer/assets/icons/generated/agent-output-video.png';
import videoIconDark from '@/renderer/assets/icons/generated/agent-output-video-dark.png';
import wordIcon from '@/renderer/assets/icons/generated/agent-output-word.png';
import wordIconDark from '@/renderer/assets/icons/generated/agent-output-word-dark.png';

export type AgentOutputIconName =
  | 'file'
  | 'markdown'
  | 'code'
  | 'config'
  | 'html'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'table'
  | 'ppt'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'database'
  | 'notebook'
  | 'text'
  | 'changes'
  | 'preview'
  | 'openSystem'
  | 'folder'
  | 'copy'
  | 'download'
  | 'undo'
  | 'diff';

type AgentOutputIconProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  name: AgentOutputIconName;
  size?: number | string;
  title?: string;
};

type IconAsset = {
  light: string;
  dark: string;
};

const ICON_ASSETS: Record<AgentOutputIconName, IconAsset> = {
  file: { light: fileIcon, dark: fileIconDark },
  markdown: { light: markdownIcon, dark: markdownIconDark },
  code: { light: codeIcon, dark: codeIconDark },
  config: { light: configIcon, dark: configIconDark },
  html: { light: htmlIcon, dark: htmlIconDark },
  pdf: { light: pdfIcon, dark: pdfIconDark },
  word: { light: wordIcon, dark: wordIconDark },
  excel: { light: excelIcon, dark: excelIconDark },
  table: { light: tableIcon, dark: tableIconDark },
  ppt: { light: pptIcon, dark: pptIconDark },
  image: { light: imageIcon, dark: imageIconDark },
  audio: { light: audioIcon, dark: audioIconDark },
  video: { light: videoIcon, dark: videoIconDark },
  archive: { light: archiveIcon, dark: archiveIconDark },
  database: { light: databaseIcon, dark: databaseIconDark },
  notebook: { light: notebookIcon, dark: notebookIconDark },
  text: { light: textIcon, dark: textIconDark },
  changes: { light: changesIcon, dark: changesIconDark },
  preview: { light: previewIcon, dark: previewIconDark },
  openSystem: { light: openSystemIcon, dark: openSystemIconDark },
  folder: { light: folderIcon, dark: folderIconDark },
  copy: { light: copyIcon, dark: copyIconDark },
  download: { light: downloadIcon, dark: downloadIconDark },
  undo: { light: undoIcon, dark: undoIconDark },
  diff: { light: diffIcon, dark: diffIconDark },
};

const extensionOf = (value: string): string => {
  const clean = value.split(/[?#]/)[0] || value;
  const name = clean.split(/[\\/]/).pop() || clean;
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
};

export const getAgentOutputFileIconName = (value: string, contentType?: string): AgentOutputIconName => {
  if (contentType === 'markdown') return 'markdown';
  if (contentType === 'pdf') return 'pdf';
  if (contentType === 'ppt') return 'ppt';
  if (contentType === 'word') return 'word';
  if (contentType === 'excel') return 'excel';
  if (contentType === 'image') return 'image';
  if (contentType === 'html') return 'html';
  if (contentType === 'code') return 'code';
  if (contentType === 'diff') return 'diff';
  if (contentType === 'table') return 'table';
  if (contentType === 'audio') return 'audio';
  if (contentType === 'video') return 'video';
  if (contentType === 'archive') return 'archive';
  if (contentType === 'database') return 'database';
  if (contentType === 'notebook') return 'notebook';
  if (contentType === 'text') return 'text';

  const ext = extensionOf(value);
  if (['md', 'markdown', 'mdx', 'mdown', 'mkd'].includes(ext)) return 'markdown';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx', 'docm', 'dot', 'dotx', 'odt', 'pages', 'rtf'].includes(ext)) return 'word';
  if (['csv', 'tsv'].includes(ext)) return 'table';
  if (['numbers', 'ods', 'xls', 'xlsb', 'xlsm', 'xlsx', 'xlt', 'xltx'].includes(ext)) return 'excel';
  if (['key', 'odp', 'pot', 'potx', 'pps', 'ppsx', 'ppt', 'pptm', 'pptx'].includes(ext)) return 'ppt';
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff', 'avif'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'aiff'].includes(ext)) return 'audio';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext)) return 'video';
  if (['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'rar', '7z'].includes(ext)) return 'archive';
  if (['db', 'sqlite', 'sqlite3', 'sql'].includes(ext)) return 'database';
  if (['ipynb'].includes(ext)) return 'notebook';
  if (['txt', 'log', 'text'].includes(ext)) return 'text';
  if (['html', 'htm'].includes(ext)) return 'html';
  if (['diff', 'patch'].includes(ext)) return 'diff';
  if (['json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'env', 'conf', 'config'].includes(ext)) return 'config';
  if (
    [
      'ts',
      'tsx',
      'js',
      'jsx',
      'css',
      'scss',
      'less',
      'py',
      'go',
      'rs',
      'java',
      'kt',
      'swift',
      'cpp',
      'c',
      'h',
      'hpp',
      'sh',
      'xml',
    ].includes(ext)
  ) {
    return 'code';
  }
  return 'file';
};

const sizeToCss = (size: number | string): number | string => (typeof size === 'number' ? `${size}px` : size);

const AgentOutputIcon: React.FC<AgentOutputIconProps> = ({ name, size = 16, title, className, style, ...props }) => {
  const asset = ICON_ASSETS[name] || ICON_ASSETS.file;
  const cssSize = sizeToCss(size);
  const classes = ['agent-output-icon', className].filter(Boolean).join(' ');
  const imgStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    pointerEvents: 'none',
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
        verticalAlign: '-0.125em',
        ...style,
      }}
      {...props}
    >
      <img className='agent-output-icon__light' src={asset.light} alt='' draggable={false} style={imgStyle} />
      <img className='agent-output-icon__dark' src={asset.dark} alt='' draggable={false} style={imgStyle} />
    </span>
  );
};

export default AgentOutputIcon;
