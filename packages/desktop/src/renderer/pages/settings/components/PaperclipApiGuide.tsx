/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { BookOpen, LinkOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const DEFAULT_PAPERCLIP_BASE_URL = 'https://paperclip.gxl.ai';

const normalizePaperclipConsoleUrl = (value?: string): string => {
  try {
    const url = new URL(value?.trim() || DEFAULT_PAPERCLIP_BASE_URL);
    const pathname = url.pathname.replace(/\/+$/u, '');
    url.pathname = pathname.endsWith('/mcp') ? pathname.slice(0, -4) || '/' : pathname || '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/u, '');
  } catch {
    return DEFAULT_PAPERCLIP_BASE_URL;
  }
};

interface PaperclipApiGuideProps {
  baseUrl?: string;
  className?: string;
}

const PaperclipApiGuide: React.FC<PaperclipApiGuideProps> = ({ baseUrl, className }) => {
  const { t } = useTranslation();
  const consoleUrl = useMemo(() => normalizePaperclipConsoleUrl(baseUrl), [baseUrl]);

  const openConsole = () => {
    window.open(consoleUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={classNames('rounded-8px border border-solid border-2 bg-base p-14px', className)}>
      <div className='mb-8px flex items-center gap-7px text-13px font-700 text-t-primary'>
        <BookOpen theme='outline' size='16' fill='currentColor' />
        {t('settings.paperclipGuide.title')}
      </div>
      <ol className='m-0 flex list-decimal flex-col gap-6px pl-18px text-12px leading-18px text-t-secondary'>
        <li>{t('settings.paperclipGuide.stepConsole')}</li>
        <li>{t('settings.paperclipGuide.stepCreateKey')}</li>
        <li>{t('settings.paperclipGuide.stepPaste')}</li>
        <li>{t('settings.paperclipGuide.stepBaseUrl')}</li>
      </ol>
      <div className='mt-10px rounded-6px bg-1 px-10px py-8px text-12px leading-18px text-t-tertiary'>
        {t('settings.paperclipGuide.sharedRule')}
      </div>
      <Button
        size='small'
        type='outline'
        className='mt-10px'
        icon={<LinkOne theme='outline' size='14' />}
        onClick={openConsole}
      >
        {t('settings.paperclipGuide.openConsole')}
      </Button>
    </div>
  );
};

export default PaperclipApiGuide;
