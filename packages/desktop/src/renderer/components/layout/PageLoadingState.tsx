/**
 * @license
 * Copyright 2025 OpenScience
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import DeepScientistLogo from '@/renderer/components/icons/DeepScientistLogo';
import OrbitRunningLogo from '@/renderer/pages/conversation/GroupedHistory/OrbitRunningLogo';
import { useTranslation } from 'react-i18next';

interface PageLoadingStateProps {
  brand?: boolean;
  label?: string;
  size?: number;
  className?: string;
}

const PageLoadingState: React.FC<PageLoadingStateProps> = ({ brand = false, label, size = 132, className }) => {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t('common.loading');

  return (
    <div
      className={[
        'absolute inset-0 z-0 flex items-center justify-center bg-bg-1 text-t-secondary pointer-events-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className='flex flex-col items-center justify-center gap-18px'>
        {brand ? (
          <DeepScientistLogo aria-hidden='true' className='h-128px w-148px max-w-[min(148px,42vw)] object-contain' />
        ) : (
          <OrbitRunningLogo size={size} ariaLabel={resolvedLabel} />
        )}
        <div className='text-15px font-500 tracking-normal text-t-secondary animate-pulse'>{resolvedLabel}</div>
      </div>
    </div>
  );
};

export default PageLoadingState;
