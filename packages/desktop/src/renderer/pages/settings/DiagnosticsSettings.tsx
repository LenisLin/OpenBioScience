/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IAppDiagnosticsPathCheck, IAppDiagnosticsReport } from '@/common/adapter/ipcBridge';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import { Alert, Button, Empty, Message, Spin, Tag } from '@arco-design/web-react';
import { Copy, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const formatDate = (value?: string): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatBytes = (value?: number): string => {
  if (value === undefined) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

const getPathStatusTone = (check: IAppDiagnosticsPathCheck): 'green' | 'gray' | 'red' =>
  check.exists ? 'green' : check.required ? 'red' : 'gray';

const DiagnosticsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [report, setReport] = useState<IAppDiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await ipcBridge.application.getDiagnostics.invoke();
      if (!result.success || !result.data) {
        throw new Error(result.msg || t('settings.diagnostics.loadFailed', { defaultValue: '诊断信息读取失败' }));
      }
      setReport(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      Message.error(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const requiredMissing = useMemo(
    () => report?.resources.filter((item) => item.required && !item.exists) ?? [],
    [report]
  );
  const optionalMissing = useMemo(
    () => report?.resources.filter((item) => !item.required && !item.exists) ?? [],
    [report]
  );
  const reportText = useMemo(() => (report ? JSON.stringify(report, null, 2) : ''), [report]);

  const copyReport = useCallback(async () => {
    if (!reportText) return;
    await navigator.clipboard.writeText(reportText);
    Message.success(t('settings.diagnostics.copied', { defaultValue: '诊断信息已复制' }));
  }, [reportText, t]);

  const lastUpdateEvent = report?.autoUpdate?.lastEvent;

  return (
    <SettingsPageWrapper contentClassName='max-w-980px'>
      <div className='flex flex-col gap-18px' data-testid='diagnostics-settings-page'>
        <div className='flex flex-wrap items-start justify-between gap-14px'>
          <div className='flex min-w-0 items-start gap-12px'>
            <span className='inline-flex h-34px w-34px shrink-0 items-center justify-center rounded-8px bg-[rgba(20,20,20,0.06)] text-t-primary'>
              <OpenScienceIcon name='settingsPermission' size={25} visualScale={1.08} />
            </span>
            <div className='min-w-0'>
              <h1 className='m-0 text-22px font-650 text-t-primary'>
                {t('settings.diagnostics.title', { defaultValue: '诊断' })}
              </h1>
              <p className='mt-6px mb-0 max-w-760px text-13px leading-20px text-t-secondary'>
                {t('settings.diagnostics.description', {
                  defaultValue: '自动检查 OpenScience 本机安装、运行资源、更新记录和关键路径；信息只显示给当前用户，不会自动发送。',
                })}
              </p>
            </div>
          </div>
          <div className='flex shrink-0 flex-wrap gap-8px'>
            <Button icon={<Refresh theme='outline' size='15' />} loading={loading} onClick={() => void loadReport()}>
              {t('common.refresh', { defaultValue: '刷新' })}
            </Button>
            <Button icon={<Copy theme='outline' size='15' />} disabled={!reportText} onClick={() => void copyReport()}>
              {t('common.copy', { defaultValue: '复制' })}
            </Button>
          </div>
        </div>

        <Alert
          type={requiredMissing.length > 0 ? 'warning' : 'success'}
          content={
            requiredMissing.length > 0
              ? t('settings.diagnostics.requiredMissing', {
                  defaultValue: '发现必要资源缺失，建议下载并重新安装最新版 OpenScience。',
                })
              : t('settings.diagnostics.ready', { defaultValue: '必要资源检查通过。' })
          }
        />

        <Spin loading={loading} className='w-full'>
          {error && !report ? (
            <div className='rounded-10px border border-solid border-[rgba(20,20,20,0.12)] bg-base p-24px'>
              <Empty description={error} />
            </div>
          ) : report ? (
            <>
              <section className='grid gap-10px md:grid-cols-4'>
                <SummaryCard
                  label={t('settings.diagnostics.version', { defaultValue: '版本' })}
                  value={report.app.version}
                  detail={`${report.app.platform} / ${report.app.arch}`}
                />
                <SummaryCard
                  label={t('settings.diagnostics.package', { defaultValue: '安装状态' })}
                  value={
                    requiredMissing.length > 0
                      ? t('settings.diagnostics.needsRepair', { defaultValue: '需修复' })
                      : t('settings.diagnostics.ok', { defaultValue: '正常' })
                  }
                  detail={report.app.isPackaged ? 'Packaged' : 'Development'}
                />
                <SummaryCard
                  label={t('settings.diagnostics.generatedAt', { defaultValue: '检查时间' })}
                  value={formatDate(report.generatedAt)}
                  detail={report.app.locale || '-'}
                />
                <SummaryCard
                  label={t('settings.diagnostics.update', { defaultValue: '更新记录' })}
                  value={String(lastUpdateEvent?.status ?? t('settings.diagnostics.noRecord', { defaultValue: '暂无' }))}
                  detail={formatDate(String(lastUpdateEvent?.at ?? ''))}
                />
              </section>

              <section className='rounded-10px border border-solid border-[rgba(20,20,20,0.12)] bg-base p-16px'>
                <div className='mb-12px flex flex-wrap items-center justify-between gap-10px'>
                  <div>
                    <div className='text-16px font-700 text-t-primary'>
                      {t('settings.diagnostics.resources', { defaultValue: '资源完整性' })}
                    </div>
                    <div className='mt-3px text-12px text-t-secondary'>
                      {requiredMissing.length > 0
                        ? t('settings.diagnostics.missingCount', {
                            count: requiredMissing.length,
                            defaultValue: '缺失 {{count}} 个必要资源',
                          })
                        : t('settings.diagnostics.allRequiredPresent', { defaultValue: '必要资源均存在' })}
                      {optionalMissing.length > 0 ? ` · ${optionalMissing.length} optional missing` : ''}
                    </div>
                  </div>
                  <Button type='text' onClick={() => window.open(report.downloadUrl, '_blank', 'noopener,noreferrer')}>
                    {t('common.backendStartup.incompleteInstallation.downloadLatest')}
                  </Button>
                </div>
                <div className='flex flex-col divide-y divide-[rgba(20,20,20,0.08)]'>
                  {report.resources.map((item) => (
                    <div key={`${item.label}:${item.path}`} className='grid gap-8px py-10px md:grid-cols-[180px_90px_1fr_130px]'>
                      <div className='text-13px font-600 text-t-primary'>{item.label}</div>
                      <div>
                        <Tag size='small' color={getPathStatusTone(item)}>
                          {item.exists ? item.kind : item.required ? 'missing' : 'optional'}
                        </Tag>
                      </div>
                      <div className='min-w-0 break-all rounded-6px bg-1 px-8px py-5px font-mono text-12px text-t-secondary'>
                        {item.path}
                      </div>
                      <div className='text-12px text-t-tertiary md:text-right'>
                        {item.exists ? formatBytes(item.size) : formatDate(item.modifiedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className='grid gap-12px md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]'>
                <InfoPanel title={t('settings.diagnostics.paths', { defaultValue: '关键路径' })}>
                  <KeyValueRows
                    rows={[
                      ['resourcesPath', report.paths.resourcesPath],
                      ['userDataPath', report.paths.userDataPath],
                      ['configDir', report.paths.configDir || '-'],
                      ['workDir', report.paths.workDir || '-'],
                      ['logsDir', report.paths.logsDir || '-'],
                      ['appPath', report.paths.appPath],
                    ]}
                  />
                </InfoPanel>
                <InfoPanel title={t('settings.diagnostics.runtime', { defaultValue: '运行环境' })}>
                  <KeyValueRows
                    rows={[
                      ['Electron', report.versions.electron || '-'],
                      ['Chrome', report.versions.chrome || '-'],
                      ['Node.js', report.versions.node || '-'],
                      ['V8', report.versions.v8 || '-'],
                      ['Executable', report.app.execPath],
                    ]}
                  />
                </InfoPanel>
              </section>

              <section className='grid gap-12px md:grid-cols-2'>
                <InfoPanel title={t('settings.diagnostics.env', { defaultValue: '安全环境标记' })}>
                  <div className='flex flex-col gap-7px'>
                    {report.env.map((item) => (
                      <div key={item.name} className='flex items-center justify-between gap-10px text-12px'>
                        <span className='font-mono text-t-secondary'>{item.name}</span>
                        <Tag size='small' color={item.present ? 'green' : 'gray'}>
                          {item.value || (item.present ? 'set' : 'unset')}
                        </Tag>
                      </div>
                    ))}
                  </div>
                </InfoPanel>
                <InfoPanel title={t('settings.diagnostics.startupFailure', { defaultValue: '启动失败记录' })}>
                  {report.backendStartupFailure ? (
                    <pre className='m-0 max-h-220px overflow-auto whitespace-pre-wrap break-all rounded-8px bg-1 p-10px text-12px leading-18px text-t-secondary'>
                      {JSON.stringify(report.backendStartupFailure, null, 2)}
                    </pre>
                  ) : (
                    <div className='text-13px text-t-secondary'>
                      {t('settings.diagnostics.noStartupFailure', { defaultValue: '当前会话没有启动失败记录。' })}
                    </div>
                  )}
                </InfoPanel>
              </section>

              <InfoPanel title={t('settings.diagnostics.raw', { defaultValue: '原始诊断信息' })}>
                <pre className='m-0 max-h-360px overflow-auto whitespace-pre-wrap break-all rounded-8px bg-1 p-12px text-12px leading-18px text-t-secondary'>
                  {reportText}
                </pre>
              </InfoPanel>
            </>
          ) : null}
        </Spin>
      </div>
    </SettingsPageWrapper>
  );
};

const SummaryCard: React.FC<{ detail?: string; label: string; value: string }> = ({ detail, label, value }) => (
  <div className='rounded-10px border border-solid border-[rgba(20,20,20,0.12)] bg-base p-14px'>
    <div className='text-12px text-t-secondary'>{label}</div>
    <div className='mt-6px truncate text-18px font-700 text-t-primary'>{value}</div>
    <div className='mt-4px truncate text-12px text-t-tertiary'>{detail || '-'}</div>
  </div>
);

const InfoPanel: React.FC<{ children: React.ReactNode; title: string }> = ({ children, title }) => (
  <section className='rounded-10px border border-solid border-[rgba(20,20,20,0.12)] bg-base p-16px'>
    <div className='mb-12px text-16px font-700 text-t-primary'>{title}</div>
    {children}
  </section>
);

const KeyValueRows: React.FC<{ rows: Array<[string, string]> }> = ({ rows }) => (
  <div className='flex flex-col gap-8px'>
    {rows.map(([key, value]) => (
      <div key={key} className='grid gap-6px text-12px md:grid-cols-[110px_1fr]'>
        <div className='font-mono text-t-tertiary'>{key}</div>
        <div className='min-w-0 break-all rounded-6px bg-1 px-8px py-5px font-mono text-t-secondary'>{value}</div>
      </div>
    ))}
  </div>
);

export default DiagnosticsSettings;
