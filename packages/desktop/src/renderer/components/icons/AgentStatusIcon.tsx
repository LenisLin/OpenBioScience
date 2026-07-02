/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import buildIcon from '@/renderer/assets/icons/generated/agent-status-build.png';
import buildIconDark from '@/renderer/assets/icons/generated/agent-status-build-dark.png';
import checkOneIcon from '@/renderer/assets/icons/generated/agent-status-check-one.png';
import checkOneIconDark from '@/renderer/assets/icons/generated/agent-status-check-one-dark.png';
import closeOneIcon from '@/renderer/assets/icons/generated/agent-status-close-one.png';
import closeOneIconDark from '@/renderer/assets/icons/generated/agent-status-close-one-dark.png';
import commandIcon from '@/renderer/assets/icons/generated/agent-status-command.png';
import commandIconDark from '@/renderer/assets/icons/generated/agent-status-command-dark.png';
import errorIcon from '@/renderer/assets/icons/generated/agent-status-error.png';
import errorIconDark from '@/renderer/assets/icons/generated/agent-status-error-dark.png';
import fileEditingIcon from '@/renderer/assets/icons/generated/agent-status-file-editing.png';
import fileEditingIconDark from '@/renderer/assets/icons/generated/agent-status-file-editing-dark.png';
import fileSearchIcon from '@/renderer/assets/icons/generated/agent-status-file-search.png';
import fileSearchIconDark from '@/renderer/assets/icons/generated/agent-status-file-search-dark.png';
import fileTextIcon from '@/renderer/assets/icons/generated/agent-status-file-text.png';
import fileTextIconDark from '@/renderer/assets/icons/generated/agent-status-file-text-dark.png';
import globeIcon from '@/renderer/assets/icons/generated/agent-status-globe.png';
import globeIconDark from '@/renderer/assets/icons/generated/agent-status-globe-dark.png';
import imageFilesIcon from '@/renderer/assets/icons/generated/agent-status-image-files.png';
import imageFilesIconDark from '@/renderer/assets/icons/generated/agent-status-image-files-dark.png';
import inspectIcon from '@/renderer/assets/icons/generated/agent-status-inspect.png';
import inspectIconDark from '@/renderer/assets/icons/generated/agent-status-inspect-dark.png';
import installIcon from '@/renderer/assets/icons/generated/agent-status-install.png';
import installIconDark from '@/renderer/assets/icons/generated/agent-status-install-dark.png';
import listCheckboxIcon from '@/renderer/assets/icons/generated/agent-status-list-checkbox.png';
import listCheckboxIconDark from '@/renderer/assets/icons/generated/agent-status-list-checkbox-dark.png';
import loadingIcon from '@/renderer/assets/icons/generated/agent-status-loading.png';
import loadingIconDark from '@/renderer/assets/icons/generated/agent-status-loading-dark.png';
import permissionIcon from '@/renderer/assets/icons/generated/agent-status-permission.png';
import permissionIconDark from '@/renderer/assets/icons/generated/agent-status-permission-dark.png';
import serverIcon from '@/renderer/assets/icons/generated/agent-status-server.png';
import serverIconDark from '@/renderer/assets/icons/generated/agent-status-server-dark.png';
import terminalIcon from '@/renderer/assets/icons/generated/agent-status-terminal.png';
import terminalIconDark from '@/renderer/assets/icons/generated/agent-status-terminal-dark.png';
import testIcon from '@/renderer/assets/icons/generated/agent-status-test.png';
import testIconDark from '@/renderer/assets/icons/generated/agent-status-test-dark.png';
import timeIcon from '@/renderer/assets/icons/generated/agent-status-time.png';
import timeIconDark from '@/renderer/assets/icons/generated/agent-status-time-dark.png';
import toolIcon from '@/renderer/assets/icons/generated/agent-status-tool.png';
import toolIconDark from '@/renderer/assets/icons/generated/agent-status-tool-dark.png';
import webPageIcon from '@/renderer/assets/icons/generated/agent-status-web-page.png';
import webPageIconDark from '@/renderer/assets/icons/generated/agent-status-web-page-dark.png';
import writeIcon from '@/renderer/assets/icons/generated/agent-status-write.png';
import writeIconDark from '@/renderer/assets/icons/generated/agent-status-write-dark.png';

export type AgentStatusIconName =
  | 'loading'
  | 'listCheckbox'
  | 'checkOne'
  | 'time'
  | 'fileEditing'
  | 'write'
  | 'fileText'
  | 'fileSearch'
  | 'globe'
  | 'webPage'
  | 'terminal'
  | 'command'
  | 'test'
  | 'build'
  | 'install'
  | 'server'
  | 'permission'
  | 'inspect'
  | 'error'
  | 'closeOne'
  | 'tool'
  | 'imageFiles';

type AgentStatusIconProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  name: AgentStatusIconName;
  size?: number | string;
  spin?: boolean;
  title?: string;
};

type IconAsset = {
  light: string;
  dark: string;
};

const ICON_ASSETS: Record<AgentStatusIconName, IconAsset> = {
  loading: { light: loadingIcon, dark: loadingIconDark },
  listCheckbox: { light: listCheckboxIcon, dark: listCheckboxIconDark },
  checkOne: { light: checkOneIcon, dark: checkOneIconDark },
  time: { light: timeIcon, dark: timeIconDark },
  fileEditing: { light: fileEditingIcon, dark: fileEditingIconDark },
  write: { light: writeIcon, dark: writeIconDark },
  fileText: { light: fileTextIcon, dark: fileTextIconDark },
  fileSearch: { light: fileSearchIcon, dark: fileSearchIconDark },
  globe: { light: globeIcon, dark: globeIconDark },
  webPage: { light: webPageIcon, dark: webPageIconDark },
  terminal: { light: terminalIcon, dark: terminalIconDark },
  command: { light: commandIcon, dark: commandIconDark },
  test: { light: testIcon, dark: testIconDark },
  build: { light: buildIcon, dark: buildIconDark },
  install: { light: installIcon, dark: installIconDark },
  server: { light: serverIcon, dark: serverIconDark },
  permission: { light: permissionIcon, dark: permissionIconDark },
  inspect: { light: inspectIcon, dark: inspectIconDark },
  error: { light: errorIcon, dark: errorIconDark },
  closeOne: { light: closeOneIcon, dark: closeOneIconDark },
  tool: { light: toolIcon, dark: toolIconDark },
  imageFiles: { light: imageFilesIcon, dark: imageFilesIconDark },
};

const sizeToCss = (size: number | string): number | string => (typeof size === 'number' ? `${size}px` : size);

const AgentStatusIcon: React.FC<AgentStatusIconProps> = ({
  name,
  size = 16,
  spin = false,
  title,
  className,
  style,
  ...props
}) => {
  const asset = ICON_ASSETS[name] || ICON_ASSETS.tool;
  const cssSize = sizeToCss(size);
  const classes = ['agent-status-icon', spin && 'agent-status-icon--spin', className].filter(Boolean).join(' ');
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
      <img className='agent-status-icon__light' src={asset.light} alt='' draggable={false} style={imgStyle} />
      <img className='agent-status-icon__dark' src={asset.dark} alt='' draggable={false} style={imgStyle} />
    </span>
  );
};

export default AgentStatusIcon;
