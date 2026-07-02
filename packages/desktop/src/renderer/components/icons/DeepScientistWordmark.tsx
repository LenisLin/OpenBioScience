/**
 * @license
 * Copyright 2026 OpenScience
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import wordmarkDark from '@/renderer/assets/openscience-wordmark-dark.png';
import wordmarkLight from '@/renderer/assets/openscience-wordmark.png';

type DeepScientistWordmarkProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  label?: string;
  variant?: 'sidebar' | 'hero';
  wrapperClassName?: string;
};

const DeepScientistWordmark: React.FC<DeepScientistWordmarkProps> = ({
  className,
  label = 'OpenScience',
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
  const sharedImageProps = {
    ...props,
    title,
  };

  return (
    <span className={['deepscientist-wordmark', wrapperClassName].filter(Boolean).join(' ')}>
      <img
        aria-hidden={ariaHidden}
        alt={resolvedAlt}
        className={['deepscientist-wordmark__light', className].filter(Boolean).join(' ')}
        draggable={draggable}
        src={wordmarkLight}
        {...sharedImageProps}
      />
      <img
        aria-hidden='true'
        alt=''
        className={['deepscientist-wordmark__dark', className].filter(Boolean).join(' ')}
        draggable={draggable}
        src={wordmarkDark}
        {...sharedImageProps}
      />
    </span>
  );
};

export default DeepScientistWordmark;
