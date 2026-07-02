/**
 * @license
 * Copyright 2026 OpenScience
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

import logoDark from '@/renderer/assets/logo-dark.svg';
import logoLight from '@/renderer/assets/logo.svg';

type DeepScientistLogoProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  wrapperClassName?: string;
};

const DeepScientistLogo: React.FC<DeepScientistLogoProps> = ({
  wrapperClassName,
  className,
  alt = '',
  draggable = false,
  ...props
}) => (
  <span className={['deepscientist-logo', wrapperClassName].filter(Boolean).join(' ')}>
    <img
      className={['deepscientist-logo__light', className].filter(Boolean).join(' ')}
      src={logoLight}
      alt={alt}
      draggable={draggable}
      {...props}
    />
    <img
      className={['deepscientist-logo__dark', className].filter(Boolean).join(' ')}
      src={logoDark}
      alt={alt}
      draggable={draggable}
      aria-hidden={alt ? undefined : true}
      {...props}
    />
  </span>
);

export default DeepScientistLogo;
