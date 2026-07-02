/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import attachIcon from '@/renderer/assets/icons/generated/sendbox-attach.png';
import attachIconDark from '@/renderer/assets/icons/generated/sendbox-attach-dark.png';
import domSnippetIcon from '@/renderer/assets/icons/generated/sendbox-dom-snippet.png';
import domSnippetIconDark from '@/renderer/assets/icons/generated/sendbox-dom-snippet-dark.png';
import mentionFileIcon from '@/renderer/assets/icons/generated/sendbox-mention-file.png';
import mentionFileIconDark from '@/renderer/assets/icons/generated/sendbox-mention-file-dark.png';
import microphoneIcon from '@/renderer/assets/icons/generated/sendbox-microphone.png';
import microphoneIconDark from '@/renderer/assets/icons/generated/sendbox-microphone-dark.png';
import quoteIcon from '@/renderer/assets/icons/generated/sendbox-quote.png';
import quoteIconDark from '@/renderer/assets/icons/generated/sendbox-quote-dark.png';
import sendIcon from '@/renderer/assets/icons/generated/sendbox-send.png';
import sendIconDark from '@/renderer/assets/icons/generated/sendbox-send-dark.png';
import slashCommandIcon from '@/renderer/assets/icons/generated/sendbox-slash-command.png';
import slashCommandIconDark from '@/renderer/assets/icons/generated/sendbox-slash-command-dark.png';
import stopIcon from '@/renderer/assets/icons/generated/sendbox-stop.png';
import stopIconDark from '@/renderer/assets/icons/generated/sendbox-stop-dark.png';
import voiceTranscribeIcon from '@/renderer/assets/icons/generated/sendbox-voice-transcribe.png';
import voiceTranscribeIconDark from '@/renderer/assets/icons/generated/sendbox-voice-transcribe-dark.png';
import workspaceIcon from '@/renderer/assets/icons/generated/sendbox-workspace.png';
import workspaceIconDark from '@/renderer/assets/icons/generated/sendbox-workspace-dark.png';

export type SendBoxIconName =
  | 'send'
  | 'stop'
  | 'attach'
  | 'slashCommand'
  | 'mentionFile'
  | 'microphone'
  | 'voiceTranscribe'
  | 'workspace'
  | 'quote'
  | 'domSnippet';

type SendBoxIconProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  name: SendBoxIconName;
  size?: number | string;
  title?: string;
};

type IconAsset = {
  light: string;
  dark: string;
};

const ICON_ASSETS: Record<SendBoxIconName, IconAsset> = {
  send: { light: sendIcon, dark: sendIconDark },
  stop: { light: stopIcon, dark: stopIconDark },
  attach: { light: attachIcon, dark: attachIconDark },
  slashCommand: { light: slashCommandIcon, dark: slashCommandIconDark },
  mentionFile: { light: mentionFileIcon, dark: mentionFileIconDark },
  microphone: { light: microphoneIcon, dark: microphoneIconDark },
  voiceTranscribe: { light: voiceTranscribeIcon, dark: voiceTranscribeIconDark },
  workspace: { light: workspaceIcon, dark: workspaceIconDark },
  quote: { light: quoteIcon, dark: quoteIconDark },
  domSnippet: { light: domSnippetIcon, dark: domSnippetIconDark },
};

const sizeToCss = (size: number | string): string =>
  typeof size === 'number' || /^\d+(\.\d+)?$/.test(size) ? `${size}px` : size;

const SendBoxIcon: React.FC<SendBoxIconProps> = ({ name, size = 18, title, className, style, ...props }) => {
  const asset = ICON_ASSETS[name] || ICON_ASSETS.send;
  const cssSize = sizeToCss(size);
  const classes = ['sendbox-icon', className].filter(Boolean).join(' ');
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
      <img className='sendbox-icon__light' src={asset.light} alt='' draggable={false} style={imgStyle} />
      <img className='sendbox-icon__dark' src={asset.dark} alt='' draggable={false} style={imgStyle} />
    </span>
  );
};

export default SendBoxIcon;
