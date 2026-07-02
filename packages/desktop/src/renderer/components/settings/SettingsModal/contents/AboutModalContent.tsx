/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Typography, Button, Switch, Message } from '@arco-design/web-react';
import { BookOpen, Branch, ChartLine, Code, Download, Experiment, Folder, Github, Right, World } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { ipcBridge } from '@/common';
import { getIncludePrerelease, runUpdateCheck } from '@/renderer/components/settings/checkForUpdatesShared';
import { UPDATE_AVAILABLE_EVENT } from '@/renderer/components/settings/useUpdateNotificationController';
import {
  getUpdateReadyState,
  subscribeUpdateReadyState,
  type UpdateReadyState,
} from '@/renderer/components/settings/updateReadyState';
import DeepScientistLogo from '@/renderer/components/icons/DeepScientistLogo';
import DeepScientistWordmark from '@/renderer/components/icons/DeepScientistWordmark';

// __APP_VERSION__ is injected by electron.vite.config.ts `define:` from the
// repo-root package.json. The previous `import packageJson from
// '../../../../../../package.json'` resolved to packages/desktop/package.json
// which is a workspace placeholder permanently pinned at "0.0.0".
declare const __APP_VERSION__: string;

type LinkItem =
  | { title: string; description: string; url: string; icon: React.ReactNode; onClick?: never }
  | { title: string; description: string; onClick: () => void; icon: React.ReactNode; url?: never };

type HighlightItem = {
  title: string;
  description: string;
  icon: React.ReactNode;
};

const DEEPSCIENTIST_REPO_URL = 'https://github.com/ResearAI/DeepOrganiser';
const DEEPSCIENTIST_DOCS_URL = 'https://github.com/ResearAI/DeepOrganiser/tree/main/docs/en';
const DEEPSCIENTIST_QUICK_START_URL = 'https://github.com/ResearAI/DeepOrganiser/blob/main/docs/en/00_QUICK_START.md';
const DEEPSCIENTIST_PAPER_URL = 'https://openreview.net/forum?id=cZFgsLq8Gs';
const DEEPSCIENTIST_WEBSITE_URL = 'https://deepscientist.cc';
const DEEPORGANISER_DOWNLOAD_URL = 'https://deepscientist.cc/DeepOrganiser';

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isElectron = isElectronDesktop();

  const [includePrerelease, setIncludePrerelease] = useState(false);
  const [updateReadyState, setUpdateReadyState] = useState<UpdateReadyState>(() => getUpdateReadyState());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('update.includePrerelease');
    setIncludePrerelease(saved === 'true');
  }, []);

  useEffect(() => subscribeUpdateReadyState(setUpdateReadyState), []);

  const handlePrereleaseChange = (val: boolean) => {
    setIncludePrerelease(val);
    localStorage.setItem('update.includePrerelease', String(val));
  };

  const openLink = async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.log('Failed to open link:', error);
    }
  };

  const checkUpdate = async () => {
    if (updateReadyState.ready) {
      if (updateReadyState.filePath) {
        void ipcBridge.shell.openFile.invoke(updateReadyState.filePath);
        return;
      }
      void ipcBridge.autoUpdate.quitAndInstall.invoke();
      return;
    }

    if (checking) return;
    setChecking(true);
    try {
      const outcome = await runUpdateCheck({
        includePrerelease: getIncludePrerelease(),
        fallbackVersion: __APP_VERSION__,
        checkFailedLabel: t('update.checkFailed'),
      });
      if (outcome.kind === 'available') {
        // Only reveal the bottom-right card once an update is confirmed; hand
        // over the already-fetched outcome so the card skips the checking flash.
        window.dispatchEvent(new CustomEvent(UPDATE_AVAILABLE_EVENT, { detail: outcome }));
      } else if (outcome.kind === 'upToDate') {
        Message.info(t('update.alreadyLatest'));
      } else {
        Message.error(outcome.message || t('update.checkFailed'));
      }
    } finally {
      setChecking(false);
    }
  };

  const highlights: HighlightItem[] = [
    {
      title: t('settings.aboutHighlightLocalFirstTitle'),
      description: t('settings.aboutHighlightLocalFirstDesc'),
      icon: <Folder theme='outline' size='18' />,
    },
    {
      title: t('settings.aboutHighlightResearchLoopTitle'),
      description: t('settings.aboutHighlightResearchLoopDesc'),
      icon: <Experiment theme='outline' size='18' />,
    },
    {
      title: t('settings.aboutHighlightVisibleProgressTitle'),
      description: t('settings.aboutHighlightVisibleProgressDesc'),
      icon: <ChartLine theme='outline' size='18' />,
    },
    {
      title: t('settings.aboutHighlightRunnersTitle'),
      description: t('settings.aboutHighlightRunnersDesc'),
      icon: <Code theme='outline' size='18' />,
    },
  ];

  const linkItems: LinkItem[] = [
    {
      title: t('settings.aboutLinkDocumentation'),
      description: t('settings.aboutLinkDocumentationDesc'),
      url: DEEPSCIENTIST_DOCS_URL,
      icon: <BookOpen theme='outline' size='18' />,
    },
    {
      title: t('settings.aboutLinkQuickStart'),
      description: t('settings.aboutLinkQuickStartDesc'),
      url: DEEPSCIENTIST_QUICK_START_URL,
      icon: <Right theme='outline' size='16' />,
    },
    {
      title: t('settings.aboutLinkGithub'),
      description: t('settings.aboutLinkGithubDesc'),
      url: DEEPSCIENTIST_REPO_URL,
      icon: <Github theme='outline' size='18' />,
    },
    {
      title: t('settings.aboutLinkPaper'),
      description: t('settings.aboutLinkPaperDesc'),
      url: DEEPSCIENTIST_PAPER_URL,
      icon: <Branch theme='outline' size='18' />,
    },
    {
      title: t('settings.aboutLinkWebsite'),
      description: t('settings.aboutLinkWebsiteDesc'),
      url: DEEPSCIENTIST_WEBSITE_URL,
      icon: <World theme='outline' size='18' />,
    },
    {
      title: t('settings.aboutLinkDownloadPortal'),
      description: t('settings.aboutLinkDownloadPortalDesc'),
      url: DEEPORGANISER_DOWNLOAD_URL,
      icon: <Download theme='outline' size='18' />,
    },
  ];

  return (
    <div className='flex flex-col h-full w-full'>
      <div
        className={classNames(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-24px pb-24px',
          isPageMode && 'px-0 overflow-visible'
        )}
      >
        <div className={classNames('flex flex-col mx-auto', isPageMode ? 'max-w-720px' : 'max-w-560px')}>
          <section className='flex flex-col items-center text-center pb-22px'>
            <DeepScientistLogo alt='DeepOrganiser' className='h-84px w-100px object-contain mb-14px' />
            <Typography.Title
              aria-label='DeepOrganiser'
              heading={3}
              className='flex justify-center mb-6px leading-none'
            >
              <DeepScientistWordmark
                aria-hidden='true'
                variant='hero'
                className='h-52px w-300px max-w-full object-contain'
              />
            </Typography.Title>
            <Typography.Text className='max-w-560px text-14px text-t-secondary leading-22px mb-14px'>
              {t('settings.aboutDeepScientistDescription')}
            </Typography.Text>
            <div className='flex flex-wrap items-center justify-center gap-8px mb-18px'>
              <span className='px-10px py-4px rd-8px text-12px bg-fill-2 text-t-primary font-600'>
                {t('settings.aboutVersion', { version: __APP_VERSION__ })}
              </span>
              <span className='px-10px py-4px rd-8px text-12px bg-fill-1 text-t-secondary border border-border-2'>
                {t('settings.aboutBadgeLocalFirst')}
              </span>
              <span className='px-10px py-4px rd-8px text-12px bg-fill-1 text-t-secondary border border-border-2'>
                {t('settings.aboutBadgeOpenSource')}
              </span>
            </div>
          </section>

          <section className='grid grid-cols-1 sm:grid-cols-2 gap-10px mb-18px'>
            {highlights.map((item) => (
              <div key={item.title} className='rounded-10px border border-border-2 bg-fill-1 px-14px py-13px text-left'>
                <div className='flex items-center gap-9px mb-7px'>
                  <span className='h-28px w-28px shrink-0 rounded-8px bg-fill-2 text-t-primary flex items-center justify-center'>
                    {item.icon}
                  </span>
                  <Typography.Text className='text-13px font-semibold text-t-primary leading-18px'>
                    {item.title}
                  </Typography.Text>
                </div>
                <Typography.Text className='block text-12px text-t-secondary leading-18px'>
                  {item.description}
                </Typography.Text>
              </div>
            ))}
          </section>

          {isElectron && (
            <section className='rounded-10px border border-border-2 bg-fill-1 px-16px py-14px mb-16px'>
              <div className='flex flex-col sm:flex-row sm:items-center gap-12px'>
                <div className='min-w-0 flex-1 text-left'>
                  <Typography.Text className='block text-13px font-semibold text-t-primary leading-18px'>
                    {t('settings.aboutUpdateTitle')}
                  </Typography.Text>
                  <Typography.Text className='block text-12px text-t-secondary leading-18px mt-3px'>
                    {t('settings.aboutUpdateDesc')}
                  </Typography.Text>
                </div>
                <Button
                  type={updateReadyState.ready ? 'primary' : 'outline'}
                  loading={checking}
                  onClick={() => void checkUpdate()}
                  className='!rounded-8px sm:!w-auto'
                >
                  {updateReadyState.ready
                    ? t('settings.updateReadyInstall', { version: updateReadyState.version })
                    : checking
                      ? t('settings.checkingForUpdates')
                      : t('settings.checkForUpdates')}
                </Button>
              </div>
              <div className='mt-12px flex items-center justify-between gap-12px'>
                <Typography.Text className='text-12px text-t-secondary'>
                  {t('settings.includePrereleaseUpdates')}
                </Typography.Text>
                <Switch size='small' checked={includePrerelease} onChange={handlePrereleaseChange} />
              </div>
            </section>
          )}

          <section className='flex flex-col gap-6px'>
            {linkItems.map((item, index) => (
              <div
                key={index}
                className='flex items-center justify-between gap-12px px-14px py-12px rd-10px border border-transparent hover:border-border-2 hover:bg-fill-1 transition-all cursor-pointer group'
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if ('url' in item) {
                    openLink(item.url).catch((error) => console.error('Failed to open link:', error));
                  } else {
                    item.onClick();
                  }
                }}
              >
                <div className='min-w-0 flex items-center gap-11px text-left'>
                  <span className='h-30px w-30px shrink-0 rounded-8px bg-fill-2 text-t-secondary flex items-center justify-center group-hover:text-t-primary'>
                    {item.icon}
                  </span>
                  <span className='min-w-0'>
                    <Typography.Text className='block text-13px font-600 text-t-primary leading-18px'>
                      {item.title}
                    </Typography.Text>
                    <Typography.Text className='block text-12px text-t-tertiary leading-17px mt-2px'>
                      {item.description}
                    </Typography.Text>
                  </span>
                </div>
                <Right theme='outline' size='15' className='shrink-0 text-t-tertiary group-hover:text-t-primary' />
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
};

export default AboutModalContent;
