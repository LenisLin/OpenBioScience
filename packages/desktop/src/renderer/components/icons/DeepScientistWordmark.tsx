/**
 * @license
 * Copyright 2026 OpenScience
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import { APP_DISPLAY_NAME } from '@/renderer/utils/brand';

type DeepScientistWordmarkProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  label?: string;
  variant?: 'sidebar' | 'hero';
  wrapperClassName?: string;
};

const DeepScientistWordmark: React.FC<DeepScientistWordmarkProps> = ({
  className,
  label = APP_DISPLAY_NAME,
  wrapperClassName,
  variant: _variant,
  'aria-hidden': ariaHidden,
  'aria-label': ariaLabel,
  alt,
  draggable = false,
  title,
  ...props
}) => {
  const isHidden = ariaHidden === true || ariaHidden === 'true';
  const resolvedAlt = isHidden ? '' : (alt ?? ariaLabel ?? label);

  return (
    <span
      {...props}
      aria-hidden={ariaHidden}
      aria-label={isHidden ? undefined : resolvedAlt}
      className={['deepscientist-wordmark', className, wrapperClassName].filter(Boolean).join(' ')}
      draggable={draggable}
      role={isHidden ? undefined : 'img'}
      title={title}
    >
      {label}
    </span>
  );
};

export default DeepScientistWordmark;
