/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { DEFAULT_SCIENCE_SKILL_IDS, normalizeScienceDefaultSkillIds } from '@/common/chat/science';
import { SCIENCE_SKILL_PACK_COUNTS, SCIENCE_SKILL_PACK_MANIFEST_PATH } from '@/common/chat/scienceSkills.generated';
import { configService } from '@/common/config/configService';
import { applyPaperclipCredentialFallback } from '@/common/config/paperclipConfig';
import type { MedicalEvidenceConfig, ResearchEvidenceConfig, ScienceArtifactConfig } from '@/common/config/storage';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import PaperclipApiGuide from './components/PaperclipApiGuide';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { Alert, Button, Input, Message, Switch, Tag } from '@arco-design/web-react';
import { Attention, CheckOne } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DEFAULT_RESEARCH_CONFIG: Required<
  Pick<
    ResearchEvidenceConfig,
    | 'enabled'
    | 'paperclipBaseUrl'
    | 'defaultSources'
    | 'timeoutMs'
    | 'bioToolsEnabled'
    | 'bioToolsPythonPath'
    | 'bioToolsServerRoot'
    | 'bioToolsDefaultDomains'
  >
> &
  Pick<ResearchEvidenceConfig, 'paperclipApiKey'> = {
  enabled: true,
  paperclipApiKey: '',
  paperclipBaseUrl: 'https://paperclip.gxl.ai',
  defaultSources: ['pmc', 'abstracts', 'biorxiv', 'medrxiv', 'arxiv'],
  timeoutMs: 30000,
  bioToolsEnabled: false,
  bioToolsPythonPath: 'python3',
  bioToolsServerRoot: '',
  bioToolsDefaultDomains: ['pubmed', 'chembl', 'omics-archives', 'structures-interactions'],
};

const DEFAULT_ARTIFACT_CONFIG: Required<
  Pick<
    ScienceArtifactConfig,
    'enabled' | 'strictProvenance' | 'writeProjectManifest' | 'defaultSkillIds' | 'allowedDatabaseHosts'
  >
> = {
  enabled: true,
  strictProvenance: false,
  writeProjectManifest: true,
  defaultSkillIds: [...DEFAULT_SCIENCE_SKILL_IDS],
  allowedDatabaseHosts: [],
};

type ConnectionState = 'idle' | 'testing' | 'success' | 'error';

const normalizeResearchConfig = (
  value?: ResearchEvidenceConfig,
  fallback?: MedicalEvidenceConfig
): ResearchEvidenceConfig => {
  const paperclipConfig = applyPaperclipCredentialFallback(value, fallback);
  return {
    ...DEFAULT_RESEARCH_CONFIG,
    ...value,
    paperclipApiKey: paperclipConfig.paperclipApiKey,
    paperclipBaseUrl: paperclipConfig.paperclipBaseUrl,
    timeoutMs: paperclipConfig.timeoutMs,
    defaultSources: value?.defaultSources?.length ? value.defaultSources : DEFAULT_RESEARCH_CONFIG.defaultSources,
    bioToolsDefaultDomains: value?.bioToolsDefaultDomains?.length
      ? value.bioToolsDefaultDomains
      : DEFAULT_RESEARCH_CONFIG.bioToolsDefaultDomains,
  };
};

const normalizeArtifactConfig = (value?: ScienceArtifactConfig): ScienceArtifactConfig => ({
  ...DEFAULT_ARTIFACT_CONFIG,
  ...value,
  defaultSkillIds: normalizeScienceDefaultSkillIds(value?.defaultSkillIds),
  allowedDatabaseHosts: value?.allowedDatabaseHosts?.length
    ? value.allowedDatabaseHosts
    : DEFAULT_ARTIFACT_CONFIG.allowedDatabaseHosts,
});

const hasSameItems = (left?: readonly string[], right?: readonly string[]): boolean => {
  if (!left || !right || left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
};

const parseDelimitedList = (value: string): string[] =>
  value
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean);

const formatDelimitedList = (value?: string[]): string => (value || []).join('\n');

const ScienceSettings: React.FC = () => {
  const { t } = useTranslation();
  const [researchConfig, setResearchConfig] = useState<ResearchEvidenceConfig>(() =>
    normalizeResearchConfig(configService.get('tools.researchEvidence'), configService.get('tools.medicalEvidence'))
  );
  const [artifactConfig, setArtifactConfig] = useState<ScienceArtifactConfig>(() =>
    normalizeArtifactConfig(configService.get('tools.scienceArtifact'))
  );
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  useEffect(() => {
    setResearchConfig(
      normalizeResearchConfig(configService.get('tools.researchEvidence'), configService.get('tools.medicalEvidence'))
    );
    setArtifactConfig(normalizeArtifactConfig(configService.get('tools.scienceArtifact')));
  }, []);

  const updateResearchConfig = useCallback((updater: (current: ResearchEvidenceConfig) => ResearchEvidenceConfig) => {
    setResearchConfig((current) => {
      const next = normalizeResearchConfig(updater(current));
      configService.set('tools.researchEvidence', next).catch((error) => {
        console.error('Failed to save research evidence config:', error);
      });
      return next;
    });
  }, []);

  const updateArtifactConfig = useCallback((updater: (current: ScienceArtifactConfig) => ScienceArtifactConfig) => {
    setArtifactConfig((current) => {
      const next = normalizeArtifactConfig(updater(current));
      configService.set('tools.scienceArtifact', next).catch((error) => {
        console.error('Failed to save science artifact config:', error);
      });
      return next;
    });
  }, []);

  const handleTestResearch = useCallback(async () => {
    setConnectionState('testing');
    setConnectionMessage('');
    try {
      const result = await ipcBridge.medicalEvidenceSettings.testPaperclipConnection.invoke({
        paperclipApiKey: researchConfig.paperclipApiKey,
        paperclipBaseUrl: researchConfig.paperclipBaseUrl || DEFAULT_RESEARCH_CONFIG.paperclipBaseUrl,
        timeoutMs: researchConfig.timeoutMs || DEFAULT_RESEARCH_CONFIG.timeoutMs,
      });
      if (!result.ok) {
        throw new Error(result.message || t('settings.science.connectionFailed'));
      }
      if (result.normalizedBaseUrl) {
        updateResearchConfig((current) => ({ ...current, paperclipBaseUrl: result.normalizedBaseUrl }));
      }
      const message = t('settings.science.connectionReady');
      setConnectionState('success');
      setConnectionMessage(message);
      Message.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.science.connectionFailed');
      setConnectionState('error');
      setConnectionMessage(message);
      Message.error(message);
    }
  }, [researchConfig, t, updateResearchConfig]);

  const workflowSteps = useMemo(
    () => [
      {
        icon: <OpenScienceIcon name='researchProject' size={20} visualScale={1.08} />,
        title: t('settings.science.workflowProject'),
        detail: t('settings.science.workflowProjectDetail'),
      },
      {
        icon: <OpenScienceIcon name='settingsDatasource' size={20} visualScale={1.08} />,
        title: t('settings.science.workflowEvidence'),
        detail: t('settings.science.workflowEvidenceDetail'),
      },
      {
        icon: <OpenScienceIcon name='settingsArtifact' size={20} visualScale={1.08} />,
        title: t('settings.science.workflowArtifact'),
        detail: t('settings.science.workflowArtifactDetail'),
      },
      {
        icon: <OpenScienceIcon name='artifactProvenance' size={20} visualScale={1.08} />,
        title: t('settings.science.workflowGraph'),
        detail: t('settings.science.workflowGraphDetail'),
      },
    ],
    [t]
  );

  const isUsingGeneratedDefaultSkills = useMemo(
    () => hasSameItems(artifactConfig.defaultSkillIds, DEFAULT_SCIENCE_SKILL_IDS),
    [artifactConfig.defaultSkillIds]
  );

  const skillPackCards = useMemo(
    () => [
      {
        label: 'OpenScience Core',
        value: 2,
        detail: t('settings.science.skillPackCoreDesc'),
      },
      {
        label: 'Workflow',
        value: 1,
        detail: t('settings.science.skillPackWorkflowDesc'),
      },
      {
        label: 'DeepScientist',
        value: SCIENCE_SKILL_PACK_COUNTS.deepscientist,
        detail: t('settings.science.vendorDeepScientistDesc'),
      },
      {
        label: 'K-Dense',
        value: SCIENCE_SKILL_PACK_COUNTS.kdense,
        detail: t('settings.science.vendorKDenseDesc'),
      },
      {
        label: 'Auto-Empirical',
        value: SCIENCE_SKILL_PACK_COUNTS.autoEmpirical,
        detail: t('settings.science.vendorAutoEmpiricalDesc'),
      },
      {
        label: 'Nature Skills',
        value: SCIENCE_SKILL_PACK_COUNTS.natureSkills,
        detail: t('settings.science.vendorNatureSkillsDesc'),
      },
    ],
    [t]
  );

  return (
    <SettingsPageWrapper contentClassName='max-w-940px'>
      <div className='flex flex-col gap-20px'>
        <div className='flex flex-col gap-6px'>
          <div className='flex items-center gap-10px'>
            <span className='inline-flex h-30px w-30px items-center justify-center rounded-8px bg-[rgba(83,112,103,0.12)] text-[rgb(71,96,89)]'>
              <OpenScienceIcon name='settingsScience' size={24} visualScale={1.1} />
            </span>
            <h1 className='m-0 text-22px font-650 text-t-primary'>{t('settings.science.title')}</h1>
            <Tag size='small'>{t('settings.science.defaultModeTag')}</Tag>
          </div>
          <p className='m-0 max-w-760px text-13px leading-20px text-t-secondary'>{t('settings.science.description')}</p>
        </div>

        <section className='rounded-10px border border-solid border-2 bg-base p-18px shadow-[0_10px_28px_rgba(15,23,42,0.045)]'>
          <div className='mb-16px flex items-start justify-between gap-12px'>
            <div>
              <div className='text-16px font-700 text-t-primary'>{t('settings.science.researchEvidenceTitle')}</div>
              <div className='mt-4px max-w-650px text-12px leading-18px text-t-secondary'>
                {t('settings.science.researchEvidenceDesc')}
              </div>
            </div>
            <div className='flex shrink-0 items-center gap-8px text-12px text-t-secondary'>
              <span>{t('common.enabled', { defaultValue: 'Enabled' })}</span>
              <Switch
                size='small'
                checked={researchConfig.enabled !== false}
                onChange={(checked) => updateResearchConfig((current) => ({ ...current, enabled: checked }))}
              />
            </div>
          </div>

          <div className='grid grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)] gap-12px md:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)]'>
            <div className='rounded-8px border border-solid border-[rgba(20,20,20,0.16)] bg-1 p-14px'>
              <label className='flex flex-col gap-6px'>
                <span className='text-13px font-700 text-t-primary'>PaperClip API Key</span>
                <Input.Password
                  size='large'
                  value={researchConfig.paperclipApiKey || ''}
                  placeholder='gxl_...'
                  visibilityToggle
                  onChange={(value) => updateResearchConfig((current) => ({ ...current, paperclipApiKey: value }))}
                />
              </label>
              <div className='mt-12px flex flex-wrap items-center gap-10px'>
                <Button type='primary' loading={connectionState === 'testing'} onClick={handleTestResearch}>
                  {t('settings.science.testConnection')}
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

            <div className='rounded-8px bg-[rgba(83,112,103,0.08)] p-14px text-12px leading-18px text-t-secondary'>
              <div className='mb-6px flex items-center gap-6px text-13px font-700 text-t-primary'>
                <OpenScienceIcon name='settingsPaperclipApi' size={16} visualScale={1.08} />
                {t('settings.science.sharedSearchTitle')}
              </div>
              {t('settings.science.sharedSearchDesc')}
            </div>
          </div>

          <PaperclipApiGuide
            baseUrl={researchConfig.paperclipBaseUrl || DEFAULT_RESEARCH_CONFIG.paperclipBaseUrl}
            className='mt-12px'
          />

          <div className='mt-14px grid grid-cols-1 gap-12px md:grid-cols-2'>
            <label className='flex flex-col gap-6px'>
              <span className='text-13px font-600 text-t-primary'>Base URL</span>
              <Input
                value={researchConfig.paperclipBaseUrl || DEFAULT_RESEARCH_CONFIG.paperclipBaseUrl}
                onChange={(value) => updateResearchConfig((current) => ({ ...current, paperclipBaseUrl: value }))}
              />
            </label>
            <label className='flex flex-col gap-6px'>
              <span className='text-13px font-600 text-t-primary'>{t('settings.science.timeoutMs')}</span>
              <Input
                value={String(researchConfig.timeoutMs || DEFAULT_RESEARCH_CONFIG.timeoutMs)}
                suffix='ms'
                onChange={(value) => {
                  const next = Number(value.replace(/[^\d]/g, ''));
                  updateResearchConfig((current) => ({
                    ...current,
                    timeoutMs: Number.isFinite(next) && next > 0 ? next : DEFAULT_RESEARCH_CONFIG.timeoutMs,
                  }));
                }}
              />
            </label>
          </div>

          <label className='mt-12px flex flex-col gap-6px'>
            <span className='text-13px font-600 text-t-primary'>{t('settings.science.defaultSources')}</span>
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 5 }}
              value={formatDelimitedList(researchConfig.defaultSources)}
              placeholder={'pmc\nabstracts\nbiorxiv'}
              onChange={(value) =>
                updateResearchConfig((current) => ({
                  ...current,
                  defaultSources: parseDelimitedList(value).length
                    ? parseDelimitedList(value)
                    : DEFAULT_RESEARCH_CONFIG.defaultSources,
                }))
              }
            />
          </label>

          <div className='mt-14px rounded-8px bg-1 p-14px'>
            <div className='mb-12px flex items-start justify-between gap-12px'>
              <div>
                <div className='text-13px font-700 text-t-primary'>
                  {t('settings.science.bioToolsTitle', { defaultValue: 'Bio tools databases' })}
                </div>
                <div className='mt-3px max-w-650px text-12px leading-18px text-t-secondary'>
                  {t('settings.science.bioToolsDesc', {
                    defaultValue:
                      'Route PubMed, ChEMBL, GEO, AlphaFold and other JimLiu science-skills database tools through the same research_evidence MCP.',
                  })}
                </div>
              </div>
              <Switch
                size='small'
                checked={researchConfig.bioToolsEnabled === true}
                onChange={(checked) => updateResearchConfig((current) => ({ ...current, bioToolsEnabled: checked }))}
              />
            </div>
            <div className='grid grid-cols-1 gap-12px md:grid-cols-2'>
              <label className='flex flex-col gap-6px'>
                <span className='text-13px font-600 text-t-primary'>
                  {t('settings.science.bioToolsPythonPath', { defaultValue: 'Python executable' })}
                </span>
                <Input
                  value={researchConfig.bioToolsPythonPath || DEFAULT_RESEARCH_CONFIG.bioToolsPythonPath}
                  placeholder='python3'
                  onChange={(value) => updateResearchConfig((current) => ({ ...current, bioToolsPythonPath: value }))}
                />
              </label>
              <label className='flex flex-col gap-6px'>
                <span className='text-13px font-600 text-t-primary'>
                  {t('settings.science.bioToolsServerRoot', { defaultValue: 'bio-tools server root' })}
                </span>
                <Input
                  value={researchConfig.bioToolsServerRoot || ''}
                  placeholder='/path/to/science-skills/mcp-servers/bio-tools'
                  onChange={(value) => updateResearchConfig((current) => ({ ...current, bioToolsServerRoot: value }))}
                />
              </label>
            </div>
            <label className='mt-12px flex flex-col gap-6px'>
              <span className='text-13px font-600 text-t-primary'>
                {t('settings.science.bioToolsDomains', { defaultValue: 'Default domains' })}
              </span>
              <Input.TextArea
                autoSize={{ minRows: 2, maxRows: 5 }}
                value={formatDelimitedList(researchConfig.bioToolsDefaultDomains)}
                placeholder={'pubmed\nchembl\nomics-archives\nstructures-interactions'}
                onChange={(value) =>
                  updateResearchConfig((current) => ({
                    ...current,
                    bioToolsDefaultDomains: parseDelimitedList(value).length
                      ? parseDelimitedList(value)
                      : DEFAULT_RESEARCH_CONFIG.bioToolsDefaultDomains,
                  }))
                }
              />
              <span className='text-11px leading-16px text-t-tertiary'>
                {t('settings.science.bioToolsHint', {
                  defaultValue:
                    'PaperClip stays off until an API key is present. Bio tools starts lazily only when the agent lists or calls database tools.',
                })}
              </span>
            </label>
          </div>
        </section>

        <section className='rounded-10px border border-solid border-2 bg-base p-18px'>
          <div className='mb-16px flex items-start justify-between gap-12px'>
            <div>
              <div className='text-16px font-700 text-t-primary'>{t('settings.science.artifactTitle')}</div>
              <div className='mt-4px max-w-650px text-12px leading-18px text-t-secondary'>
                {t('settings.science.artifactDesc')}
              </div>
            </div>
            <div className='flex shrink-0 items-center gap-8px text-12px text-t-secondary'>
              <span>{t('common.enabled', { defaultValue: 'Enabled' })}</span>
              <Switch
                size='small'
                checked={artifactConfig.enabled !== false}
                onChange={(checked) => updateArtifactConfig((current) => ({ ...current, enabled: checked }))}
              />
            </div>
          </div>

          <div className='grid grid-cols-1 gap-12px md:grid-cols-2'>
            <label className='flex items-center justify-between gap-12px rounded-8px bg-1 px-12px py-10px'>
              <span>
                <span className='block text-13px font-650 text-t-primary'>
                  {t('settings.science.strictProvenance')}
                </span>
                <span className='block text-12px leading-18px text-t-tertiary'>
                  {t('settings.science.strictProvenanceDesc')}
                </span>
              </span>
              <Switch
                size='small'
                checked={artifactConfig.strictProvenance === true}
                onChange={(checked) => updateArtifactConfig((current) => ({ ...current, strictProvenance: checked }))}
              />
            </label>
            <label className='flex items-center justify-between gap-12px rounded-8px bg-1 px-12px py-10px'>
              <span>
                <span className='block text-13px font-650 text-t-primary'>{t('settings.science.writeManifest')}</span>
                <span className='block text-12px leading-18px text-t-tertiary'>
                  {t('settings.science.writeManifestDesc')}
                </span>
              </span>
              <Switch
                size='small'
                checked={artifactConfig.writeProjectManifest !== false}
                onChange={(checked) =>
                  updateArtifactConfig((current) => ({ ...current, writeProjectManifest: checked }))
                }
              />
            </label>
          </div>

          <div className='mt-12px grid grid-cols-1 gap-12px md:grid-cols-2'>
            <div className='flex flex-col gap-10px rounded-8px bg-1 p-12px'>
              <div className='flex flex-wrap items-start justify-between gap-8px'>
                <span>
                  <span className='block text-13px font-650 text-t-primary'>
                    {t('settings.science.defaultSkillPack')}
                  </span>
                  <span className='mt-2px block text-12px leading-18px text-t-secondary'>
                    {t('settings.science.defaultSkillPackDesc', {
                      total: DEFAULT_SCIENCE_SKILL_IDS.length,
                      external: SCIENCE_SKILL_PACK_COUNTS.total,
                    })}
                  </span>
                </span>
                <Tag size='small' color={isUsingGeneratedDefaultSkills ? 'green' : 'orange'}>
                  {isUsingGeneratedDefaultSkills
                    ? t('settings.science.skillPackOfficialDefault')
                    : t('settings.science.skillPackCustomized')}
                </Tag>
              </div>

              <div className='grid grid-cols-1 gap-8px sm:grid-cols-2 lg:grid-cols-5'>
                {skillPackCards.map((card) => (
                  <div
                    key={card.label}
                    className='rounded-8px border border-solid border-[rgba(20,20,20,0.10)] bg-base px-10px py-9px'
                  >
                    <div className='flex items-center justify-between gap-8px'>
                      <span className='text-12px font-650 text-t-primary'>{card.label}</span>
                      <span className='font-mono text-12px font-700 text-[rgb(71,96,89)]'>{card.value}</span>
                    </div>
                    <div className='mt-5px text-11px leading-16px text-t-tertiary'>{card.detail}</div>
                  </div>
                ))}
              </div>

              <div className='grid grid-cols-1 gap-8px sm:grid-cols-3'>
                <div className='rounded-8px bg-[rgba(83,112,103,0.08)] px-10px py-8px'>
                  <div className='text-11px font-650 text-t-primary'>{t('settings.science.policyQuarantined')}</div>
                  <div className='mt-3px text-18px font-750 text-[rgb(71,96,89)]'>
                    {SCIENCE_SKILL_PACK_COUNTS.quarantinedScripts}
                  </div>
                </div>
                <div className='rounded-8px bg-[rgba(191,122,61,0.10)] px-10px py-8px'>
                  <div className='text-11px font-650 text-t-primary'>{t('settings.science.policyRestricted')}</div>
                  <div className='mt-3px text-18px font-750 text-[rgb(150,92,44)]'>
                    {SCIENCE_SKILL_PACK_COUNTS.restrictedDefault}
                  </div>
                </div>
                <div className='rounded-8px bg-[rgba(61,100,191,0.08)] px-10px py-8px'>
                  <div className='text-11px font-650 text-t-primary'>{t('settings.science.policyClinical')}</div>
                  <div className='mt-3px text-18px font-750 text-[rgb(59,87,157)]'>
                    {SCIENCE_SKILL_PACK_COUNTS.clinicalBoundary}
                  </div>
                </div>
              </div>

              <div className='text-11px leading-16px text-t-tertiary'>
                {t('settings.science.skillPackManifest', { path: SCIENCE_SKILL_PACK_MANIFEST_PATH })}
              </div>

              <details className='rounded-8px border border-solid border-[rgba(20,20,20,0.12)] bg-base px-10px py-8px'>
                <summary className='cursor-pointer text-12px font-650 text-t-primary'>
                  {t('settings.science.advancedSkillIds')}
                </summary>
                <Input.TextArea
                  className='mt-8px'
                  autoSize={{ minRows: 5, maxRows: 8 }}
                  value={formatDelimitedList(artifactConfig.defaultSkillIds)}
                  onChange={(value) =>
                    updateArtifactConfig((current) => ({
                      ...current,
                      defaultSkillIds: parseDelimitedList(value).length
                        ? parseDelimitedList(value)
                        : [...DEFAULT_SCIENCE_SKILL_IDS],
                    }))
                  }
                />
                <div className='mt-8px flex flex-wrap items-center gap-8px'>
                  <Button
                    size='mini'
                    onClick={() => updateArtifactConfig((current) => ({ ...current, defaultSkillIds: [] }))}
                  >
                    {t('settings.science.resetSkillPack')}
                  </Button>
                  <span className='text-11px leading-16px text-t-tertiary'>
                    {t('settings.science.advancedSkillIdsHint')}
                  </span>
                </div>
              </details>
            </div>
            <label className='flex flex-col gap-6px'>
              <span className='text-13px font-600 text-t-primary'>{t('settings.science.allowedHosts')}</span>
              <Input.TextArea
                autoSize={{ minRows: 4, maxRows: 7 }}
                value={formatDelimitedList(artifactConfig.allowedDatabaseHosts)}
                placeholder={'uniprot.org\nebi.ac.uk\nrcsb.org'}
                onChange={(value) =>
                  updateArtifactConfig((current) => ({ ...current, allowedDatabaseHosts: parseDelimitedList(value) }))
                }
              />
              <span className='text-11px leading-16px text-t-tertiary'>{t('settings.science.allowedHostsHint')}</span>
            </label>
          </div>
        </section>

        <section className='overflow-hidden rounded-8px border border-solid border-2 bg-base'>
          <div className='border-0 border-b border-solid border-2 px-18px py-14px'>
            <div className='text-15px font-650 text-t-primary'>{t('settings.science.workflowTitle')}</div>
            <div className='mt-3px text-12px text-t-tertiary'>{t('settings.science.workflowDesc')}</div>
          </div>
          <div className='grid grid-cols-1 gap-0 p-14px md:grid-cols-2'>
            {workflowSteps.map((step) => (
              <div
                key={step.title}
                className='flex min-h-74px gap-10px border-0 border-b border-solid border-2 p-12px md:border-r odd:md:border-r even:md:border-r-0'
              >
                <span className='mt-1px flex h-32px w-32px shrink-0 items-center justify-center rounded-full border border-solid border-[rgba(83,112,103,0.24)] bg-[rgba(83,112,103,0.08)] text-[rgb(71,96,89)]'>
                  {step.icon}
                </span>
                <span>
                  <span className='block text-13px font-650 text-t-primary'>{step.title}</span>
                  <span className='mt-4px block text-12px leading-18px text-t-secondary'>{step.detail}</span>
                </span>
              </div>
            ))}
          </div>
          <Alert
            type='info'
            showIcon={false}
            content={t('settings.science.workflowNote')}
            className='mx-14px mb-14px'
          />
        </section>

        <section className='rounded-8px border border-solid border-2 bg-base p-18px'>
          <div className='mb-10px text-15px font-650 text-t-primary'>{t('settings.science.vendorSkillsTitle')}</div>
          <div className='grid grid-cols-1 gap-10px md:grid-cols-2 xl:grid-cols-4'>
            <div className='rounded-8px bg-1 px-12px py-10px'>
              <div className='text-13px font-650 text-t-primary'>ResearAI/DeepScientist v1.6.0</div>
              <div className='mt-4px text-12px leading-18px text-t-secondary'>
                {t('settings.science.vendorDeepScientistDesc')}
              </div>
              <Tag size='small' className='mt-8px'>
                {SCIENCE_SKILL_PACK_COUNTS.deepscientist} skills
              </Tag>
            </div>
            <div className='rounded-8px bg-1 px-12px py-10px'>
              <div className='text-13px font-650 text-t-primary'>K-Dense-AI/scientific-agent-skills</div>
              <div className='mt-4px text-12px leading-18px text-t-secondary'>
                {t('settings.science.vendorKDenseDesc')}
              </div>
              <Tag size='small' className='mt-8px'>
                {SCIENCE_SKILL_PACK_COUNTS.kdense} skills
              </Tag>
            </div>
            <div className='rounded-8px bg-1 px-12px py-10px'>
              <div className='text-13px font-650 text-t-primary'>Auto-Empirical Research Skills</div>
              <div className='mt-4px text-12px leading-18px text-t-secondary'>
                {t('settings.science.vendorAutoEmpiricalDesc')}
              </div>
              <div className='mt-8px flex flex-wrap gap-6px'>
                <Tag size='small'>
                  {SCIENCE_SKILL_PACK_COUNTS.autoEmpirical} selected /{' '}
                  {SCIENCE_SKILL_PACK_COUNTS.autoEmpiricalAvailable} cataloged
                </Tag>
                <Tag size='small' color='orange'>
                  CC BY-SA 4.0
                </Tag>
              </div>
            </div>
            <div className='rounded-8px bg-1 px-12px py-10px'>
              <div className='text-13px font-650 text-t-primary'>Yuan1z0825/nature-skills</div>
              <div className='mt-4px text-12px leading-18px text-t-secondary'>
                {t('settings.science.vendorNatureSkillsDesc')}
              </div>
              <div className='mt-8px flex flex-wrap gap-6px'>
                <Tag size='small'>{SCIENCE_SKILL_PACK_COUNTS.natureSkills} skills</Tag>
                <Tag size='small' color='blue'>
                  Apache 2.0
                </Tag>
              </div>
            </div>
          </div>
        </section>
      </div>
    </SettingsPageWrapper>
  );
};

export default ScienceSettings;
