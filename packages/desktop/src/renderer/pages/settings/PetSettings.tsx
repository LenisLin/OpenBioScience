/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Modal, Radio, Switch } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { systemSettings } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import { isElectronDesktop } from '@/renderer/utils/platform';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import PreferenceRow from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '@/renderer/components/settings/SettingsModal/settingsViewContext';

type PetStyle = 'deepscientist' | 'classic' | 'paperfold' | 'observatory';
type PetPersonality = 'calm' | 'balanced' | 'lively';
type PetTransitionLogEntry = {
  id: number;
  at: number;
  from: string;
  to?: string;
  requested?: string;
  reason: string;
  detail?: string;
  elapsedMs: number;
  dnd: boolean;
};

const PET_STYLE_OPTIONS: Array<{ value: PetStyle; asset: string; labelKey: string }> = [
  {
    value: 'deepscientist',
    asset: './pet-states/deepscientist/idle.svg',
    labelKey: 'pet.styleDeepScientist',
  },
  {
    value: 'classic',
    asset: './pet-states/classic/idle.svg',
    labelKey: 'pet.styleClassic',
  },
  {
    value: 'paperfold',
    asset: './pet-states/paperfold/idle.svg',
    labelKey: 'pet.stylePaperfold',
  },
  {
    value: 'observatory',
    asset: './pet-states/observatory/idle.svg',
    labelKey: 'pet.styleObservatory',
  },
];

const formatElapsed = (elapsedMs: number) => {
  if (elapsedMs < 1000) return '<1s';
  return `${Math.round(elapsedMs / 1000)}s`;
};

const getLogTarget = (log: PetTransitionLogEntry) => log.to ?? log.requested ?? '-';

const PetSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [size, setSize] = useState(280);
  const [style, setStyle] = useState<PetStyle>('deepscientist');
  const [personality, setPersonality] = useState<PetPersonality>('balanced');
  const [dnd, setDnd] = useState(false);
  const [confirmEnabled, setConfirmEnabled] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [transitionLogs, setTransitionLogs] = useState<PetTransitionLogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<PetTransitionLogEntry | null>(null);
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isDesktop = isElectronDesktop();

  useEffect(() => {
    setEnabled(configService.get('pet.enabled') ?? true);
    setSize(configService.get('pet.size') ?? 280);
    setStyle(configService.get('pet.style') ?? 'deepscientist');
    setPersonality(configService.get('pet.personality') ?? 'balanced');
    setDnd(configService.get('pet.dnd') ?? false);
    setConfirmEnabled(configService.get('pet.confirmEnabled') ?? true);
  }, []);

  const handleEnabledChange = useCallback((checked: boolean) => {
    setEnabled(checked);
    configService.setLocal('pet.enabled', checked);
    systemSettings.setPetEnabled.invoke({ enabled: checked }).catch(() => {
      setEnabled(!checked);
      configService.setLocal('pet.enabled', !checked);
    });
  }, []);

  const handleSizeChange = useCallback(
    (val: number) => {
      const prevSize = size;
      setSize(val);
      configService.setLocal('pet.size', val);
      systemSettings.setPetSize.invoke({ size: val }).catch(() => {
        setSize(prevSize);
        configService.setLocal('pet.size', prevSize);
      });
    },
    [size]
  );

  const handleStyleChange = useCallback(
    (val: PetStyle) => {
      const prevStyle = style;
      setStyle(val);
      configService.setLocal('pet.style', val);
      systemSettings.setPetStyle.invoke({ style: val }).catch(() => {
        setStyle(prevStyle);
        configService.setLocal('pet.style', prevStyle);
      });
    },
    [style]
  );

  const handleDndChange = useCallback((checked: boolean) => {
    setDnd(checked);
    configService.setLocal('pet.dnd', checked);
    systemSettings.setPetDnd.invoke({ dnd: checked }).catch(() => {
      setDnd(!checked);
      configService.setLocal('pet.dnd', !checked);
    });
  }, []);

  const handlePersonalityChange = useCallback(
    (val: PetPersonality) => {
      const prevPersonality = personality;
      setPersonality(val);
      configService.setLocal('pet.personality', val);
      systemSettings.setPetPersonality.invoke({ personality: val }).catch(() => {
        setPersonality(prevPersonality);
        configService.setLocal('pet.personality', prevPersonality);
      });
    },
    [personality]
  );

  const handleConfirmEnabledChange = useCallback((checked: boolean) => {
    setConfirmEnabled(checked);
    configService.setLocal('pet.confirmEnabled', checked);
    systemSettings.setPetConfirmEnabled.invoke({ enabled: checked }).catch(() => {
      setConfirmEnabled(!checked);
      configService.setLocal('pet.confirmEnabled', !checked);
    });
  }, []);

  const refreshDiagnostics = useCallback(() => {
    systemSettings.getPetTransitionLogs
      .invoke()
      .then((logs) => setTransitionLogs(logs.slice().reverse()))
      .catch(() => setTransitionLogs([]));
  }, []);

  const openDiagnostics = useCallback(() => {
    setShowDiagnostics(true);
    refreshDiagnostics();
  }, [refreshDiagnostics]);

  if (!isDesktop) {
    return (
      <SettingsPageWrapper>
        <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
          <div className='space-y-16px'>
            <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
              <p className='m-0 text-13px text-t-secondary'>{t('pet.desktopOnly')}</p>
            </div>
          </div>
        </AionScrollArea>
      </SettingsPageWrapper>
    );
  }

  if (showDiagnostics) {
    return (
      <SettingsPageWrapper>
        <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
          <div className='space-y-16px'>
            <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-14px'>
              <div className='flex items-center justify-between gap-12px'>
                <div>
                  <h3 className='m-0 text-15px font-600 text-1'>{t('pet.diagnosticsTitle')}</h3>
                  <p className='m-0 mt-4px text-12px text-t-secondary'>{t('pet.diagnosticsDescription')}</p>
                </div>
                <div className='flex shrink-0 items-center gap-8px'>
                  <Button size='small' onClick={refreshDiagnostics}>
                    {t('pet.diagnosticsRefresh')}
                  </Button>
                  <Button size='small' onClick={() => setShowDiagnostics(false)}>
                    {t('pet.diagnosticsBack')}
                  </Button>
                </div>
              </div>

              {transitionLogs.length === 0 ? (
                <div className='border border-solid border-border-2 rd-8px bg-bg-1 px-12px py-14px text-12px text-t-secondary'>
                  {t('pet.diagnosticsEmpty')}
                </div>
              ) : (
                <div className='overflow-hidden border border-solid border-border-2 rd-8px bg-bg-1'>
                  {transitionLogs.map((log) => {
                    const target = getLogTarget(log);
                    return (
                      <button
                        key={log.id}
                        type='button'
                        onClick={() => setSelectedLog(log)}
                        className='grid w-full cursor-pointer grid-cols-[112px_minmax(0,1fr)_96px] items-start gap-10px border-0 border-b border-solid border-border-1 bg-transparent px-12px py-9px text-left transition-colors last:border-b-0 hover:bg-fill-1 focus-visible:outline-none focus-visible:bg-fill-1'
                      >
                        <div className='text-11px tabular-nums text-t-tertiary'>
                          {new Date(log.at).toLocaleTimeString()}
                        </div>
                        <div className='min-w-0'>
                          <div className='truncate text-12px font-500 text-1'>
                            {log.from} -&gt; {target}
                          </div>
                          <div className='mt-3px truncate text-11px text-t-secondary'>
                            {log.reason}
                            {log.detail ? ` · ${log.detail}` : ''}
                            {log.dnd ? ` · ${t('pet.dnd')}` : ''}
                          </div>
                        </div>
                        <div className='text-right text-11px tabular-nums text-t-tertiary'>
                          {formatElapsed(log.elapsedMs)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </AionScrollArea>
        <Modal
          visible={selectedLog !== null}
          title={t('pet.diagnosticsDetailTitle')}
          footer={null}
          onCancel={() => setSelectedLog(null)}
        >
          {selectedLog && (
            <div className='space-y-12px text-12px'>
              <div className='grid grid-cols-[96px_minmax(0,1fr)] gap-x-12px gap-y-8px'>
                <div className='text-t-secondary'>{t('pet.diagnosticsAt')}</div>
                <div className='text-1'>{new Date(selectedLog.at).toLocaleString()}</div>
                <div className='text-t-secondary'>{t('pet.diagnosticsFrom')}</div>
                <div className='text-1'>{selectedLog.from}</div>
                <div className='text-t-secondary'>{t('pet.diagnosticsTo')}</div>
                <div className='text-1'>{getLogTarget(selectedLog)}</div>
                <div className='text-t-secondary'>{t('pet.diagnosticsReason')}</div>
                <div className='text-1'>{selectedLog.reason}</div>
                <div className='text-t-secondary'>{t('pet.diagnosticsElapsed')}</div>
                <div className='text-1'>{formatElapsed(selectedLog.elapsedMs)}</div>
                <div className='text-t-secondary'>{t('pet.diagnosticsDnd')}</div>
                <div className='text-1'>{selectedLog.dnd ? t('pet.diagnosticsYes') : t('pet.diagnosticsNo')}</div>
                <div className='text-t-secondary'>{t('pet.diagnosticsDetail')}</div>
                <div className='min-w-0 break-words text-1'>{selectedLog.detail || '-'}</div>
              </div>
              <pre className='m-0 max-h-220px overflow-auto rd-8px bg-fill-1 p-10px text-11px leading-5 text-t-secondary'>
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            </div>
          )}
        </Modal>
      </SettingsPageWrapper>
    );
  }

  const preferenceItems = [
    {
      key: 'enabled',
      label: t('pet.enable'),
      component: <Switch checked={enabled} onChange={handleEnabledChange} />,
    },
    {
      key: 'size',
      label: t('pet.size'),
      component: (
        <Radio.Group value={size} onChange={handleSizeChange} disabled={!enabled}>
          <Radio value={200}>{t('pet.sizeSmall', { px: 200 })}</Radio>
          <Radio value={280}>{t('pet.sizeMedium', { px: 280 })}</Radio>
          <Radio value={360}>{t('pet.sizeLarge', { px: 360 })}</Radio>
        </Radio.Group>
      ),
    },
    {
      key: 'style',
      label: t('pet.style'),
      description: t('pet.styleDescription'),
      component: (
        <div className='flex flex-wrap justify-end gap-8px max-w-300px'>
          {PET_STYLE_OPTIONS.map((option) => {
            const active = style === option.value;
            return (
              <button
                key={option.value}
                type='button'
                disabled={!enabled}
                aria-pressed={active}
                onClick={() => handleStyleChange(option.value)}
                className={[
                  'h-86px w-136px min-w-0 cursor-pointer border border-solid rd-8px bg-bg-2 px-8px py-7px text-left transition-colors',
                  'hover:border-border-3 focus-visible:outline-none focus-visible:border-primary-5',
                  active ? 'border-primary-5 bg-fill-1' : 'border-border-2',
                  !enabled ? 'cursor-not-allowed opacity-55' : '',
                ].join(' ')}
              >
                <span className='flex h-52px w-full items-center justify-center overflow-hidden rd-6px bg-bg-1'>
                  <object
                    type='image/svg+xml'
                    data={option.asset}
                    aria-hidden='true'
                    tabIndex={-1}
                    className='pointer-events-none h-48px w-48px'
                  />
                </span>
                <span className='mt-6px block truncate text-center text-12px font-500 text-2'>
                  {t(option.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      ),
    },
    {
      key: 'dnd',
      label: t('pet.dnd'),
      description: t('pet.dndDescription'),
      component: <Switch checked={dnd} onChange={handleDndChange} disabled={!enabled} />,
    },
    {
      key: 'personality',
      label: t('pet.personality'),
      description: t('pet.personalityDescription'),
      component: (
        <Radio.Group value={personality} onChange={handlePersonalityChange} disabled={!enabled}>
          <Radio value='calm'>{t('pet.personalityCalm')}</Radio>
          <Radio value='balanced'>{t('pet.personalityBalanced')}</Radio>
          <Radio value='lively'>{t('pet.personalityLively')}</Radio>
        </Radio.Group>
      ),
    },
    {
      key: 'confirmBubble',
      label: t('pet.confirmBubble'),
      description: t('pet.confirmBubbleDescription'),
      component: <Switch checked={confirmEnabled} onChange={handleConfirmEnabledChange} disabled={!enabled} />,
    },
    {
      key: 'diagnostics',
      label: t('pet.diagnostics'),
      description: t('pet.diagnosticsDescription'),
      component: (
        <Button size='small' onClick={openDiagnostics}>
          {t('pet.diagnosticsOpen')}
        </Button>
      ),
    },
  ];

  return (
    <SettingsPageWrapper>
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {preferenceItems.map((item) => (
                <PreferenceRow key={item.key} label={item.label} description={item.description}>
                  {item.component}
                </PreferenceRow>
              ))}
            </div>
          </div>
        </div>
      </AionScrollArea>
    </SettingsPageWrapper>
  );
};

export default PetSettings;
