/**
 * @license
 * Copyright 2026 OpenScience
 * SPDX-License-Identifier: Apache-2.0
 */

import { Typography, Button, Switch, Message } from '@arco-design/web-react';
import { BookOpen, Branch, ChartLine, Code, Download, Experiment, Folder, Github, Right, World } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
import DeepScientistWordmark from '@/renderer/components/icons/DeepScientistWordmark';
import westlakeUniversityLogo from '@/renderer/assets/logos/institutions/westlake-university.png';
import zhongguancunCollegeLogo from '@/renderer/assets/logos/institutions/zhongguancun-college.png';
import zhongguancunAiInstituteLogo from '@/renderer/assets/logos/institutions/zhongguancun-ai-institute.png';

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

type InstitutionPartner = {
  name: string;
  logo: string;
  imageClassName?: string;
  invertLogo?: boolean;
};

const DEEPSCIENTIST_REPO_URL = 'https://github.com/ResearAI/OpenScience';
const DEEPSCIENTIST_DOCS_URL = 'https://github.com/ResearAI/OpenScience/tree/main/docs/en';
const DEEPSCIENTIST_QUICK_START_URL = 'https://github.com/ResearAI/OpenScience/blob/main/docs/en/00_QUICK_START.md';
const DEEPSCIENTIST_PAPER_URL = 'https://openreview.net/forum?id=cZFgsLq8Gs';
const DEEPSCIENTIST_WEBSITE_URL = 'https://openscience.cc/';
const DEEPSCIENTIST_DOWNLOAD_URL = 'https://openscience.cc/';
const OPENSCIENCE_COMMERCIAL_EMAIL = 'resear.ai@gmail.com';

const institutionPartners: InstitutionPartner[] = [
  {
    name: 'Westlake University',
    logo: westlakeUniversityLogo,
    imageClassName: 'max-h-58px max-w-[92%]',
  },
  {
    name: 'Zhongguancun College',
    logo: zhongguancunCollegeLogo,
    imageClassName: 'max-h-44px max-w-[86%]',
  },
  {
    name: 'Zhongguancun Institute of Artificial Intelligence',
    logo: zhongguancunAiInstituteLogo,
    imageClassName: 'max-h-40px max-w-[94%]',
    invertLogo: true,
  },
];

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  const openOnboarding = () => {
    navigate(`/onboarding?reopen=1&next=${encodeURIComponent('/settings/about')}`);
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
      title: t('settings.aboutLinkOnboarding', { defaultValue: '重新打开教程' }),
      description: t('settings.aboutLinkOnboardingDesc', {
        defaultValue: '重新查看语言、模式、运行器、信息收集和 PaperClip 绑定引导。',
      }),
      onClick: openOnboarding,
      icon: <BookOpen theme='outline' size='18' />,
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
      url: DEEPSCIENTIST_DOWNLOAD_URL,
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
          <section className='flex flex-col items-center text-center pb-22px pt-4px'>
            <Typography.Title
              aria-label='OpenBioScience'
              heading={3}
              className='flex justify-center mb-10px leading-none w-full'
            >
              <DeepScientistWordmark
                aria-hidden='true'
                variant='hero'
                className='h-92px w-430px max-w-full object-contain'
              />
            </Typography.Title>
            <Typography.Text className='max-w-560px text-14px text-t-secondary leading-22px mb-14px'>
              {t('settings.aboutOpenScienceDescription')}
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

          <section className='mt-18px rounded-12px border border-border-2 bg-fill-1 px-16px py-14px text-left'>
            <Typography.Text className='block text-13px font-semibold text-t-primary leading-18px'>
              {t('settings.aboutCommercialTitle')}
            </Typography.Text>
            <Typography.Text className='block text-12px text-t-secondary leading-18px mt-5px'>
              {t('settings.aboutCommercialDesc')}
            </Typography.Text>
            <Button
              type='outline'
              size='small'
              className='!mt-12px !rounded-8px'
              onClick={() => void openLink(`mailto:${OPENSCIENCE_COMMERCIAL_EMAIL}`)}
            >
              {OPENSCIENCE_COMMERCIAL_EMAIL}
            </Button>
          </section>

          <section className='mt-18px'>
            <div className='mb-9px text-left'>
              <Typography.Text className='block text-13px font-semibold text-t-primary leading-18px'>
                {t('settings.aboutPartnerTitle')}
              </Typography.Text>
              <Typography.Text className='block text-12px text-t-tertiary leading-18px mt-3px'>
                {t('settings.aboutPartnerDesc')}
              </Typography.Text>
            </div>
            <div className='flex flex-col gap-10px'>
              <div className='flex justify-center'>
                <div className='w-full sm:w-1/2 h-92px rounded-12px border border-border-2 bg-white px-18px py-14px flex items-center justify-center shadow-[0_8px_28px_rgba(15,23,42,0.06)]'>
                  <img
                    src={institutionPartners[0].logo}
                    alt={institutionPartners[0].name}
                    className={classNames('object-contain', institutionPartners[0].imageClassName)}
                  />
                </div>
              </div>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-10px'>
                {institutionPartners.slice(1).map((partner) => (
                  <div
                    key={partner.name}
                    className='h-82px rounded-12px border border-border-2 bg-white px-16px py-13px flex items-center justify-center shadow-[0_8px_28px_rgba(15,23,42,0.06)]'
                  >
                    <img
                      src={partner.logo}
                      alt={partner.name}
                      className={classNames('object-contain', partner.imageClassName)}
                      style={partner.invertLogo ? { filter: 'invert(1)' } : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AboutModalContent;
