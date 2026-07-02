/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { applyPaperclipCredentialFallback } from '@/common/config/paperclipConfig';
import type { MedicalEvidenceConfig, ResearchEvidenceConfig } from '@/common/config/storage';
import {
  MEDICAL_EVIDENCE_DEFAULT_PAPERCLIP_SOURCES,
  MEDICAL_EVIDENCE_EVIDENCE_HIERARCHY,
  MEDICAL_EVIDENCE_PAPERCLIP_SOURCE_GROUPS,
  MEDICAL_EVIDENCE_SOURCE_TIER_RULES,
} from '@/common/chat/medicalEvidenceDefaults';
import MedicalEvidenceIcon from '@/renderer/components/icons/MedicalEvidenceIcon';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import PaperclipApiGuide from './components/PaperclipApiGuide';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { Alert, Button, Checkbox, Input, Message, Switch, Tag } from '@arco-design/web-react';
import { Attention, CheckOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DEFAULT_CONFIG: Required<
  Pick<MedicalEvidenceConfig, 'paperclipBaseUrl' | 'defaultSources' | 'strictAnchors' | 'timeoutMs'>
> &
  Pick<MedicalEvidenceConfig, 'enabled' | 'paperclipApiKey'> = {
  enabled: true,
  paperclipApiKey: '',
  paperclipBaseUrl: 'https://paperclip.gxl.ai',
  defaultSources: MEDICAL_EVIDENCE_DEFAULT_PAPERCLIP_SOURCES,
  strictAnchors: true,
  timeoutMs: 30000,
};

const SOURCE_OPTIONS: Array<{
  value: NonNullable<MedicalEvidenceConfig['defaultSources']>[number];
  labelKey: string;
  fallbackLabel: string;
}> = [
  { value: 'pmc', labelKey: 'pmc', fallbackLabel: 'PMC Full Text' },
  { value: 'abstracts', labelKey: 'abstracts', fallbackLabel: 'Paper Abstracts' },
  { value: 'abstracts_only', labelKey: 'abstractsOnly', fallbackLabel: 'Abstracts Only' },
  { value: 'biorxiv', labelKey: 'biorxiv', fallbackLabel: 'bioRxiv' },
  { value: 'medrxiv', labelKey: 'medrxiv', fallbackLabel: 'medRxiv' },
  { value: 'arxiv', labelKey: 'arxiv', fallbackLabel: 'arXiv' },
  { value: 'fda', labelKey: 'fda', fallbackLabel: 'FDA / Drug Labels' },
  { value: 'fda/eu', labelKey: 'ema', fallbackLabel: 'EMA / EU Medicines' },
  { value: 'fda/jp', labelKey: 'pmda', fallbackLabel: 'PMDA / Japan Medicines' },
  { value: 'trials', labelKey: 'trials', fallbackLabel: 'Clinical Trial Registry' },
  { value: 'trials/us', labelKey: 'trialsUs', fallbackLabel: 'US Clinical Trials' },
  { value: 'clinicaltrials', labelKey: 'clinicaltrials', fallbackLabel: 'ClinicalTrials' },
  { value: 'trials/cn', labelKey: 'trialsCn', fallbackLabel: 'China Clinical Trials' },
  { value: 'trials/eu', labelKey: 'trialsEu', fallbackLabel: 'EU Clinical Trials' },
  { value: 'trials/jp', labelKey: 'trialsJp', fallbackLabel: 'Japan Clinical Trials' },
];

type ConnectionState = 'idle' | 'testing' | 'success' | 'error';

const normalizeConfig = (value?: MedicalEvidenceConfig, fallback?: ResearchEvidenceConfig): MedicalEvidenceConfig => {
  const paperclipConfig = applyPaperclipCredentialFallback(value, fallback);
  return {
    ...DEFAULT_CONFIG,
    ...value,
    paperclipApiKey: paperclipConfig.paperclipApiKey,
    paperclipBaseUrl: paperclipConfig.paperclipBaseUrl,
    timeoutMs: paperclipConfig.timeoutMs,
    defaultSources: value?.defaultSources?.length ? value.defaultSources : DEFAULT_CONFIG.defaultSources,
  };
};

const normalizeBaseUrlForCompare = (value?: string): string =>
  (value || DEFAULT_CONFIG.paperclipBaseUrl).trim().replace(/\/+$/u, '');

const testPaperclipConnection = async (config: MedicalEvidenceConfig): Promise<string | undefined> => {
  const result = await ipcBridge.medicalEvidenceSettings.testPaperclipConnection.invoke({
    paperclipApiKey: config.paperclipApiKey,
    paperclipBaseUrl: config.paperclipBaseUrl || DEFAULT_CONFIG.paperclipBaseUrl,
    timeoutMs: config.timeoutMs || DEFAULT_CONFIG.timeoutMs,
  });
  if (!result.ok) {
    throw new Error(result.message || 'PaperClip connection failed');
  }
  return result.normalizedBaseUrl;
};

const MedicalEvidenceSettings: React.FC = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<MedicalEvidenceConfig>(() =>
    normalizeConfig(configService.get('tools.medicalEvidence'), configService.get('tools.researchEvidence'))
  );
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  useEffect(() => {
    setConfig(normalizeConfig(configService.get('tools.medicalEvidence'), configService.get('tools.researchEvidence')));
  }, []);

  const updateConfig = useCallback((updater: (current: MedicalEvidenceConfig) => MedicalEvidenceConfig) => {
    setConfig((current) => {
      const next = normalizeConfig(updater(current));
      configService.set('tools.medicalEvidence', next).catch((error) => {
        console.error('Failed to save medical evidence config:', error);
      });
      return next;
    });
  }, []);

  const selectedSources = useMemo(() => new Set(config.defaultSources || []), [config.defaultSources]);
  const allSourcesSelected = useMemo(
    () => MEDICAL_EVIDENCE_DEFAULT_PAPERCLIP_SOURCES.every((source) => selectedSources.has(source)),
    [selectedSources]
  );

  const toggleSource = useCallback(
    (source: NonNullable<MedicalEvidenceConfig['defaultSources']>[number]) => {
      updateConfig((current) => {
        const currentSources = current.defaultSources?.length ? current.defaultSources : DEFAULT_CONFIG.defaultSources;
        const nextSources = currentSources.includes(source)
          ? currentSources.filter((item) => item !== source)
          : [...currentSources, source];
        return { ...current, defaultSources: nextSources.length ? nextSources : [source] };
      });
    },
    [updateConfig]
  );

  const toggleAllSources = useCallback(() => {
    updateConfig((current) => ({
      ...current,
      defaultSources: allSourcesSelected ? ['pmc'] : MEDICAL_EVIDENCE_DEFAULT_PAPERCLIP_SOURCES,
    }));
  }, [allSourcesSelected, updateConfig]);

  const handleTest = useCallback(async () => {
    setConnectionState('testing');
    setConnectionMessage('');
    try {
      const normalizedBaseUrl = await testPaperclipConnection(config);
      if (normalizedBaseUrl && normalizedBaseUrl !== normalizeBaseUrlForCompare(config.paperclipBaseUrl)) {
        updateConfig((current) => ({
          ...current,
          paperclipBaseUrl: normalizedBaseUrl,
        }));
      }
      setConnectionState('success');
      const readyMessage = t('settings.medicalEvidence.connectionReady');
      setConnectionMessage(readyMessage);
      Message.success(readyMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.medicalEvidence.connectionFailed');
      setConnectionState('error');
      setConnectionMessage(message);
      Message.error(message);
    }
  }, [config, t, updateConfig]);

  const steps: Array<{ icon: React.ReactNode; title: string; detail: string }> = [
    {
      icon: <MedicalEvidenceIcon name='search' size={20} visualScale={1.16} />,
      title: t('settings.medicalEvidence.pipeline.searchTitle'),
      detail: t('settings.medicalEvidence.pipeline.searchDetail'),
    },
    {
      icon: <MedicalEvidenceIcon name='gradeHigh' size={20} visualScale={1.16} />,
      title: t('settings.medicalEvidence.pipeline.gradeTitle'),
      detail: t('settings.medicalEvidence.pipeline.gradeDetail'),
    },
    {
      icon: <MedicalEvidenceIcon name='citation' size={20} visualScale={1.16} />,
      title: t('settings.medicalEvidence.pipeline.citationTitle'),
      detail: t('settings.medicalEvidence.pipeline.citationDetail'),
    },
  ];

  return (
    <SettingsPageWrapper contentClassName='max-w-900px'>
      <div className='flex flex-col gap-20px'>
        <div className='flex flex-col gap-6px'>
          <div className='flex items-center gap-10px'>
            <span className='inline-flex h-30px w-30px items-center justify-center rounded-8px bg-[var(--color-fill-2)] text-t-primary'>
              <OpenScienceIcon name='modeMedicalEvidence' size={24} visualScale={1.14} />
            </span>
            <h1 className='m-0 text-22px font-650 text-t-primary'>{t('settings.medicalEvidence.title')}</h1>
            <Tag size='small'>PaperClip</Tag>
          </div>
          <p className='m-0 text-13px leading-20px text-t-secondary'>{t('settings.medicalEvidence.description')}</p>
        </div>

        <div className='flex flex-col gap-16px'>
          <section className='rounded-10px border border-solid border-2 bg-base p-18px shadow-[0_10px_28px_rgba(15,23,42,0.045)]'>
            <div className='mb-16px flex items-start justify-between gap-12px'>
              <div>
                <div className='text-16px font-700 text-t-primary'>{t('settings.medicalEvidence.connectionTitle')}</div>
                <div className='mt-4px max-w-620px text-12px leading-18px text-t-secondary'>
                  {t('settings.medicalEvidence.connectionDesc')}
                </div>
              </div>
              <div className='flex shrink-0 items-center gap-8px text-12px text-t-secondary'>
                <span>{t('settings.medicalEvidence.enabled')}</span>
                <Switch
                  size='small'
                  checked={config.enabled !== false}
                  onChange={(checked) => updateConfig((current) => ({ ...current, enabled: checked }))}
                />
              </div>
            </div>

            <div className='rounded-8px border border-solid border-[rgba(20,20,20,0.16)] bg-1 p-14px'>
              <label className='flex flex-col gap-6px'>
                <span className='text-13px font-700 text-t-primary'>PaperClip API Key</span>
                <Input.Password
                  size='large'
                  value={config.paperclipApiKey || ''}
                  placeholder='gxl_...'
                  visibilityToggle
                  onChange={(value) => updateConfig((current) => ({ ...current, paperclipApiKey: value }))}
                />
              </label>
              <div className='mt-12px flex flex-wrap items-center gap-10px'>
                <Button type='primary' loading={connectionState === 'testing'} onClick={handleTest}>
                  {t('settings.medicalEvidence.testConnection')}
                </Button>
                {connectionState === 'success' && (
                  <span className='inline-flex items-center gap-5px text-12px font-600 text-[rgb(45,128,91)]'>
                    <CheckOne theme='filled' size='14' />
                    {connectionMessage}
                  </span>
                )}
                {connectionState === 'error' && (
                  <span className='inline-flex items-center gap-5px text-12px font-600 text-[rgb(191,88,61)]'>
                    <Attention theme='outline' size='14' />
                    {connectionMessage}
                  </span>
                )}
              </div>
            </div>

            <PaperclipApiGuide
              baseUrl={config.paperclipBaseUrl || DEFAULT_CONFIG.paperclipBaseUrl}
              className='mt-12px'
            />

            <div className='mt-14px flex flex-col gap-12px'>
              <label className='flex flex-col gap-6px'>
                <span className='text-13px font-600 text-t-primary'>Base URL</span>
                <Input
                  value={config.paperclipBaseUrl || DEFAULT_CONFIG.paperclipBaseUrl}
                  onChange={(value) => updateConfig((current) => ({ ...current, paperclipBaseUrl: value }))}
                />
              </label>
              <label className='flex flex-col gap-6px'>
                <span className='text-13px font-600 text-t-primary'>{t('settings.medicalEvidence.timeoutMs')}</span>
                <Input
                  value={String(config.timeoutMs || DEFAULT_CONFIG.timeoutMs)}
                  suffix='ms'
                  onChange={(value) => {
                    const next = Number(value.replace(/[^\d]/g, ''));
                    updateConfig((current) => ({
                      ...current,
                      timeoutMs: Number.isFinite(next) && next > 0 ? next : 30000,
                    }));
                  }}
                />
              </label>
              <label className='flex items-center justify-between gap-12px rounded-8px bg-base px-12px py-10px'>
                <span className='text-13px text-t-primary'>{t('settings.medicalEvidence.strictAnchors')}</span>
                <Switch
                  size='small'
                  checked={config.strictAnchors !== false}
                  onChange={(checked) => updateConfig((current) => ({ ...current, strictAnchors: checked }))}
                />
              </label>
            </div>
          </section>

          <section className='rounded-8px border border-solid border-2 bg-base p-18px'>
            <div className='mb-12px flex items-center justify-between gap-10px'>
              <div>
                <div className='text-15px font-650 text-t-primary'>{t('settings.medicalEvidence.defaultSources')}</div>
                <div className='mt-3px text-12px text-t-tertiary'>
                  {t('settings.medicalEvidence.defaultSourcesDesc')}
                </div>
              </div>
              <Button size='mini' type='text' onClick={toggleAllSources}>
                {allSourcesSelected ? t('settings.medicalEvidence.keepPmc') : t('settings.medicalEvidence.selectAll')}
              </Button>
            </div>
            <div className='grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-8px'>
              {SOURCE_OPTIONS.map((source) => (
                <button
                  key={source.value}
                  type='button'
                  className={classNames(
                    'flex min-h-38px items-center justify-between rounded-8px border border-solid px-12px py-8px text-left text-13px transition-all',
                    selectedSources.has(source.value)
                      ? 'border-[rgba(20,20,20,0.30)] bg-1 text-t-primary shadow-[inset_0_0_0_1px_rgba(20,20,20,0.06)]'
                      : 'border-2 bg-base text-t-secondary hover:bg-2'
                  )}
                  onClick={() => toggleSource(source.value)}
                >
                  <span>
                    {t(`settings.medicalEvidence.sources.${source.labelKey}`, {
                      defaultValue: source.fallbackLabel,
                    })}
                  </span>
                  <Checkbox checked={selectedSources.has(source.value)} />
                </button>
              ))}
            </div>
          </section>

          <section className='overflow-hidden rounded-8px border border-solid border-2 bg-base'>
            <div className='border-0 border-b border-solid border-2 px-18px py-14px'>
              <div className='text-15px font-650 text-t-primary'>{t('settings.medicalEvidence.pipelineTitle')}</div>
              <div className='mt-3px text-12px text-t-tertiary'>{t('settings.medicalEvidence.pipelineDesc')}</div>
            </div>
            <div className='flex flex-col gap-0 p-14px'>
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  className='relative grid grid-cols-[32px_minmax(0,1fr)] gap-10px pb-16px last:pb-0'
                >
                  {index < steps.length - 1 ? (
                    <span className='absolute left-15px top-34px h-[calc(100%-28px)] w-1px bg-2' aria-hidden='true' />
                  ) : null}
                  <span className='z-1 flex h-32px w-32px items-center justify-center rounded-full border border-solid border-2 bg-base text-t-primary'>
                    {step.icon}
                  </span>
                  <div className='min-w-0 rounded-8px bg-1 px-12px py-10px'>
                    <div className='flex items-center justify-between gap-8px'>
                      <span className='text-13px font-650 text-t-primary'>{step.title}</span>
                      <span className='h-6px w-6px rounded-full bg-[rgba(20,20,20,0.62)] shadow-[0_0_0_4px_rgba(20,20,20,0.06)]' />
                    </div>
                    <div className='mt-4px text-12px leading-18px text-t-secondary'>{step.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <Alert
              type='info'
              showIcon={false}
              content={t('settings.medicalEvidence.activationNote')}
              className='mx-14px mb-14px'
            />
          </section>

          <section className='rounded-8px border border-solid border-2 bg-base p-18px'>
            <div className='mb-8px text-15px font-650 text-t-primary'>
              {t('settings.medicalEvidence.evidencePresetTitle')}
            </div>
            <div className='flex flex-col gap-12px'>
              <div className='rounded-8px bg-1 px-12px py-10px'>
                <div className='mb-7px text-12px font-650 text-t-primary'>
                  {t('settings.medicalEvidence.sourceTierTitle')}
                </div>
                <div className='flex flex-col gap-6px'>
                  {MEDICAL_EVIDENCE_PAPERCLIP_SOURCE_GROUPS.map((group) => (
                    <div key={group.id} className='text-12px leading-18px text-t-secondary'>
                      <span className='font-650 text-t-primary'>
                        {t(`settings.medicalEvidence.sourceGroups.${group.id}.label`, {
                          defaultValue: group.label,
                        })}
                      </span>
                      <span className='text-t-tertiary'>
                        {' · '}
                        {t(`settings.medicalEvidence.sourceGroups.${group.id}.intent`, {
                          defaultValue: group.intent,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className='rounded-8px bg-1 px-12px py-10px'>
                <div className='mb-7px text-12px font-650 text-t-primary'>
                  {t('settings.medicalEvidence.evidenceHierarchyTitle')}
                </div>
                <div className='flex flex-col gap-7px'>
                  {MEDICAL_EVIDENCE_EVIDENCE_HIERARCHY.slice(0, 4).map((tier) => (
                    <div key={tier.rank} className='grid grid-cols-[22px_minmax(0,1fr)] gap-8px text-12px leading-18px'>
                      <span className='text-t-tertiary'>E{tier.rank}</span>
                      <span className='text-t-secondary'>
                        <span className='font-650 text-t-primary'>
                          {t(`settings.medicalEvidence.evidenceHierarchy.e${tier.rank}.label`, {
                            defaultValue: tier.label,
                          })}
                        </span>
                        <span className='text-t-tertiary'>
                          {' · '}
                          {t(`settings.medicalEvidence.evidenceHierarchy.e${tier.rank}.rule`, {
                            defaultValue: tier.rule,
                          })}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className='mt-10px text-12px leading-18px text-t-tertiary'>
                {t('settings.medicalEvidence.sourceTierRuleA', {
                  defaultValue: MEDICAL_EVIDENCE_SOURCE_TIER_RULES[0],
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default MedicalEvidenceSettings;
