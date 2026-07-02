/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import fontSizeIcon from '@/renderer/assets/icons/generated/settings-font-size.png';
import fontSizeIconDark from '@/renderer/assets/icons/generated/settings-font-size-dark.png';
import motionIcon from '@/renderer/assets/icons/generated/settings-motion.png';
import motionIconDark from '@/renderer/assets/icons/generated/settings-motion-dark.png';
import scaleIcon from '@/renderer/assets/icons/generated/settings-scale.png';
import scaleIconDark from '@/renderer/assets/icons/generated/settings-scale-dark.png';
import themeIcon from '@/renderer/assets/icons/generated/settings-theme.png';
import themeIconDark from '@/renderer/assets/icons/generated/settings-theme-dark.png';

export type SettingsIconName = 'theme' | 'fontSize' | 'scale' | 'motion';

type SettingsIconProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  name: SettingsIconName;
  size?: number | string;
  title?: string;
};

type IconAsset = {
  light: string;
  dark: string;
};

const ICON_ASSETS: Record<SettingsIconName, IconAsset> = {
  theme: { light: themeIcon, dark: themeIconDark },
  fontSize: { light: fontSizeIcon, dark: fontSizeIconDark },
  scale: { light: scaleIcon, dark: scaleIconDark },
  motion: { light: motionIcon, dark: motionIconDark },
};

const sizeToCss = (size: number | string): string => (typeof size === 'number' ? `${size}px` : size);

const SettingsIcon: React.FC<SettingsIconProps> = ({ name, size = 22, title, className, style, ...props }) => {
  const asset = ICON_ASSETS[name] || ICON_ASSETS.theme;
  const cssSize = sizeToCss(size);
  const classes = ['settings-icon', className].filter(Boolean).join(' ');
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
      <img className='settings-icon__light' src={asset.light} alt='' draggable={false} style={imgStyle} />
      <img className='settings-icon__dark' src={asset.dark} alt='' draggable={false} style={imgStyle} />
    </span>
  );
};

export default SettingsIcon;
