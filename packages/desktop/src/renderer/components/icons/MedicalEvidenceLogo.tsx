/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import logoDark from '@/renderer/assets/icons/generated/medical-evidence-logo-dark.png';
import logoLight from '@/renderer/assets/icons/generated/medical-evidence-logo.png';

type MedicalEvidenceLogoProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> & {
  size?: number | string;
  title?: string;
  visualScale?: number;
  fill?: string;
  strokeWidth?: number;
  theme?: string;
};

const sizeToCss = (size: number | string): string =>
  typeof size === 'number' || /^\d+(\.\d+)?$/.test(size) ? `${size}px` : size;

const MedicalEvidenceLogo: React.FC<MedicalEvidenceLogoProps> = ({
  size = 24,
  title,
  visualScale = 1,
  className,
  style,
  fill: _fill,
  strokeWidth: _strokeWidth,
  theme: _theme,
  ...props
}) => {
  const cssSize = sizeToCss(size);
  const classes = ['medical-evidence-logo', className].filter(Boolean).join(' ');
  const imgStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    pointerEvents: 'none',
    transform: `scale(${visualScale})`,
    transformOrigin: 'center',
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
        overflow: 'visible',
        verticalAlign: '-0.125em',
        ...style,
      }}
      {...props}
    >
      <img className='medical-evidence-logo__light' src={logoLight} alt='' draggable={false} style={imgStyle} />
      <img className='medical-evidence-logo__dark' src={logoDark} alt='' draggable={false} style={imgStyle} />
    </span>
  );
};

export default MedicalEvidenceLogo;
