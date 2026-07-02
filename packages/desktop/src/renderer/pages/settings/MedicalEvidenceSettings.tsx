/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import type { MedicalEvidenceConfig } from '@/common/config/storage';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { Alert, Button, Checkbox, Input, Message, Switch, Tag } from '@arco-design/web-react';
import { CheckOne, LinkCloud, Search, Shield, Warning } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DEFAULT_CONFIG: Required<Pick<MedicalEvidenceConfig, 'paperclipBaseUrl' | 'defaultSources' | 'strictAnchors' | 'timeoutMs'>> &
  Pick<MedicalEvidenceConfig, 'enabled' | 'paperclipApiKey'> = {
  enabled: true,
  paperclipApiKey: '',
  paperclipBaseUrl: 'https://paperclip.gxl.ai',
  defaultSources: ['pmc', 'abstracts', 'fda', 'clinicaltrials'],
  strictAnchors: true,
  timeoutMs: 30000,
};

const SOURCE_OPTIONS: Array<{ value: NonNullable<MedicalEvidenceConfig['defaultSources']>[number]; label: string }> = [
  { value: 'pmc', label: 'PMC 全文' },
  { value: 'abstracts', label: '论文摘要' },
  { value: 'fda', label: 'FDA / 药品说明' },
  { value: 'clinicaltrials', label: 'ClinicalTrials' },
];

type ConnectionState = 'idle' | 'testing' | 'success' | 'error';

const normalizeConfig = (value?: MedicalEvidenceConfig): MedicalEvidenceConfig => ({
  ...DEFAULT_CONFIG,
  ...(value || {}),
  defaultSources: value?.defaultSources?.length ? value.defaultSources : DEFAULT_CONFIG.defaultSources,
});

const testPaperclipConnection = async (config: MedicalEvidenceConfig): Promise<void> => {
  const apiKey = config.paperclipApiKey?.trim();
  const baseUrl = (config.paperclipBaseUrl || DEFAULT_CONFIG.paperclipBaseUrl).replace(/\/+$/u, '');
  if (!apiKey) {
    throw new Error('请先填写 PaperClip API Key');
  }

  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `deeporganiser-medical-evidence-test-${Date.now()}`,
      method: 'tools/list',
      params: {},
    }),
  });
  if (!response.ok) {
    throw new Error(`PaperClip 返回 ${response.status}`);
  }
  const payload = (await response.json()) as { result?: { tools?: Array<{ name?: string }> }; error?: { message?: string } };
  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }
  const hasPaperclipTool = payload.result?.tools?.some((tool) => tool.name === 'paperclip');
  if (!hasPaperclipTool) {
    throw new Error('未发现 PaperClip MCP 工具');
  }
};

const MedicalEvidenceSettings: React.FC = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<MedicalEvidenceConfig>(() =>
    normalizeConfig(configService.get('tools.medicalEvidence'))
  );
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  useEffect(() => {
    setConfig(normalizeConfig(configService.get('tools.medicalEvidence')));
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

  const handleTest = useCallback(async () => {
    setConnectionState('testing');
    setConnectionMessage('');
    try {
      await testPaperclipConnection(config);
      setConnectionState('success');
      setConnectionMessage('PaperClip MCP 已连接');
      Message.success('PaperClip MCP 已连接');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PaperClip 连接失败';
      setConnectionState('error');
      setConnectionMessage(message);
      Message.error(message);
    }
  }, [config]);

  const steps = [
    { icon: <Search theme='outline' size='18' />, title: '检索增强', detail: 'PaperClip 医学知识源' },
    { icon: <Shield theme='outline' size='18' />, title: '证据分级', detail: '指南/RCT/说明书权重' },
    { icon: <LinkCloud theme='outline' size='18' />, title: '可追溯输出', detail: '段落锚点与引用面板' },
  ];

  return (
    <SettingsPageWrapper contentClassName='max-w-1120px'>
      <div className='flex flex-col gap-20px'>
        <div className='flex flex-col gap-6px'>
          <div className='flex items-center gap-10px'>
            <span className='inline-flex h-30px w-30px items-center justify-center rounded-8px bg-[var(--color-fill-2)] text-t-primary'>
              <Shield theme='outline' size='18' />
            </span>
            <h1 className='m-0 text-22px font-650 text-t-primary'>医学循证</h1>
            <Tag size='small' color='green'>PaperClip</Tag>
          </div>
          <p className='m-0 text-13px leading-20px text-t-secondary'>
            新会话加号里启用后，会为本次会话注入医学循证 prompt 与内置 MCP，不影响普通问答。
          </p>
        </div>

        <div className='grid grid-cols-[minmax(0,1.04fr)_minmax(300px,0.96fr)] gap-18px max-md:grid-cols-1'>
          <section className='rounded-8px border border-solid border-2 bg-base p-18px'>
            <div className='mb-16px flex items-center justify-between gap-12px'>
              <div>
                <div className='text-15px font-650 text-t-primary'>PaperClip 连接</div>
                <div className='mt-3px text-12px text-t-tertiary'>API Key 只用于医学循证内置 MCP</div>
              </div>
              <Switch
                size='small'
                checked={config.enabled !== false}
                onChange={(checked) => updateConfig((current) => ({ ...current, enabled: checked }))}
              />
            </div>

            <div className='flex flex-col gap-14px'>
              <label className='flex flex-col gap-6px'>
                <span className='text-13px font-600 text-t-primary'>PaperClip API Key</span>
                <Input.Password
                  value={config.paperclipApiKey || ''}
                  placeholder='gxl_...'
                  visibilityToggle
                  onChange={(value) => updateConfig((current) => ({ ...current, paperclipApiKey: value }))}
                />
              </label>
              <label className='flex flex-col gap-6px'>
                <span className='text-13px font-600 text-t-primary'>Base URL</span>
                <Input
                  value={config.paperclipBaseUrl || DEFAULT_CONFIG.paperclipBaseUrl}
                  onChange={(value) => updateConfig((current) => ({ ...current, paperclipBaseUrl: value }))}
                />
              </label>
              <label className='flex flex-col gap-6px'>
                <span className='text-13px font-600 text-t-primary'>超时时间</span>
                <Input
                  value={String(config.timeoutMs || DEFAULT_CONFIG.timeoutMs)}
                  suffix='ms'
                  onChange={(value) => {
                    const next = Number(value.replace(/[^\d]/g, ''));
                    updateConfig((current) => ({ ...current, timeoutMs: Number.isFinite(next) && next > 0 ? next : 30000 }));
                  }}
                />
              </label>
              <div className='flex flex-col gap-8px'>
                <span className='text-13px font-600 text-t-primary'>默认知识源</span>
                <div className='grid grid-cols-2 gap-8px max-sm:grid-cols-1'>
                  {SOURCE_OPTIONS.map((source) => (
                    <button
                      key={source.value}
                      type='button'
                      className={classNames(
                        'flex h-36px items-center justify-between rounded-8px border border-solid px-10px text-left text-13px transition-all',
                        selectedSources.has(source.value)
                          ? 'border-[rgba(45,128,91,0.36)] bg-[rgba(45,128,91,0.08)] text-t-primary'
                          : 'border-2 bg-base text-t-secondary hover:bg-2'
                      )}
                      onClick={() => toggleSource(source.value)}
                    >
                      <span>{source.label}</span>
                      <Checkbox checked={selectedSources.has(source.value)} />
                    </button>
                  ))}
                </div>
              </div>
              <label className='flex items-center justify-between gap-12px rounded-8px bg-1 px-12px py-10px'>
                <span className='text-13px text-t-primary'>要求每个医学结论绑定段落锚点</span>
                <Switch
                  size='small'
                  checked={config.strictAnchors !== false}
                  onChange={(checked) => updateConfig((current) => ({ ...current, strictAnchors: checked }))}
                />
              </label>
              <div className='flex items-center gap-10px'>
                <Button type='primary' loading={connectionState === 'testing'} onClick={handleTest}>
                  测试 PaperClip
                </Button>
                {connectionState === 'success' && (
                  <span className='inline-flex items-center gap-5px text-12px text-[rgb(45,128,91)]'>
                    <CheckOne theme='filled' size='14' />
                    {connectionMessage}
                  </span>
                )}
                {connectionState === 'error' && (
                  <span className='inline-flex items-center gap-5px text-12px text-[rgb(191,88,61)]'>
                    <Warning theme='outline' size='14' />
                    {connectionMessage}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className='overflow-hidden rounded-8px border border-solid border-2 bg-base'>
            <div className='border-0 border-b border-solid border-2 px-18px py-14px'>
              <div className='text-15px font-650 text-t-primary'>启用后的循证流水线</div>
              <div className='mt-3px text-12px text-t-tertiary'>会话内实时收集，最终沉淀为证据面板</div>
            </div>
            <div className='flex flex-col gap-0 p-14px'>
              {steps.map((step, index) => (
                <div key={step.title} className='relative grid grid-cols-[32px_minmax(0,1fr)] gap-10px pb-16px last:pb-0'>
                  {index < steps.length - 1 ? (
                    <span className='absolute left-15px top-34px h-[calc(100%-28px)] w-1px bg-2' aria-hidden='true' />
                  ) : null}
                  <span className='z-1 flex h-32px w-32px items-center justify-center rounded-full border border-solid border-2 bg-base text-t-primary'>
                    {step.icon}
                  </span>
                  <div className='min-w-0 rounded-8px bg-1 px-12px py-10px'>
                    <div className='flex items-center justify-between gap-8px'>
                      <span className='text-13px font-650 text-t-primary'>{step.title}</span>
                      <span className='h-6px w-6px rounded-full bg-[rgb(45,128,91)] shadow-[0_0_0_4px_rgba(45,128,91,0.08)]' />
                    </div>
                    <div className='mt-4px text-12px leading-18px text-t-secondary'>{step.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <Alert
              type='info'
              showIcon={false}
              content='普通会话不会自动使用该服务；只有新会话输入框中出现医学循证标记并点击发送时才会生效。'
              className='mx-14px mb-14px'
            />
          </section>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default MedicalEvidenceSettings;

