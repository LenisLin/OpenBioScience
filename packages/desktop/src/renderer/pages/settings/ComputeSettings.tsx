/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ComputeSshHostPublic, ComputeSshHostTestResult } from '@/common/types/compute';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import SshHostModal from '@/renderer/components/compute/SshHostModal';
import styles from '@/renderer/components/compute/compute.module.css';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { Button, Empty, Message, Modal, Popconfirm, Spin, Tag } from '@arco-design/web-react';
import { CheckOne, Delete, Edit, Plus, Refresh, Terminal, Time } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const formatAuth = (host: ComputeSshHostPublic): string => {
  if (host.authType === 'password') return host.hasPassword ? 'Password' : 'Password missing';
  if (host.authType === 'privateKey') return host.privateKeyPath || 'Private key';
  return 'SSH agent';
};

const formatTestTime = (test?: ComputeSshHostTestResult): string => {
  if (!test?.testedAt) return 'Not tested';
  return new Date(test.testedAt).toLocaleString();
};

const statusTone = (host: ComputeSshHostPublic): 'green' | 'red' | 'gray' => {
  if (host.lastTest?.status === 'connected') return 'green';
  if (host.lastTest?.status === 'failed') return 'red';
  return 'gray';
};

const ComputeSettings: React.FC = () => {
  const { t } = useTranslation();
  const [hosts, setHosts] = useState<ComputeSshHostPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [modalHost, setModalHost] = useState<ComputeSshHostPublic | undefined>();
  const [modalOpen, setModalOpen] = useState(false);

  const sortedHosts = useMemo(() => hosts.toSorted((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [hosts]);

  const loadHosts = useCallback(async () => {
    setLoading(true);
    try {
      setHosts(await ipcBridge.computeHosts.list.invoke());
    } catch (error) {
      console.error('Failed to load SSH hosts:', error);
      Message.error(t('settings.compute.loadFailed', { defaultValue: '服务器列表加载失败' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadHosts();
  }, [loadHosts]);

  const handleTest = useCallback(
    async (host: ComputeSshHostPublic) => {
      setTestingId(host.id);
      try {
        const result = await ipcBridge.computeHosts.test.invoke({ id: host.id });
        await loadHosts();
        if (result.ok) {
          Message.success(t('settings.compute.testSuccess', { defaultValue: 'SSH 连接测试通过' }));
        } else {
          Modal.warning({
            title: t('settings.compute.testFailedTitle', { defaultValue: '连接测试未通过' }),
            content: result.message,
            okText: t('common.confirm', { defaultValue: '知道了' }),
          });
        }
      } catch (error) {
        Message.error(
          error instanceof Error ? error.message : t('settings.compute.testFailed', { defaultValue: '测试失败' })
        );
      } finally {
        setTestingId(null);
      }
    },
    [loadHosts, t]
  );

  const handleDelete = useCallback(
    async (host: ComputeSshHostPublic) => {
      await ipcBridge.computeHosts.delete.invoke({ id: host.id });
      Message.success(t('settings.compute.deleted', { defaultValue: '服务器已删除' }));
      await loadHosts();
    },
    [loadHosts, t]
  );

  const openAdd = useCallback(() => {
    setModalHost(undefined);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((host: ComputeSshHostPublic) => {
    setModalHost(host);
    setModalOpen(true);
  }, []);

  return (
    <SettingsPageWrapper contentClassName='max-w-920px'>
      <div className='flex flex-col gap-22px'>
        <div className='flex flex-col gap-7px'>
          <div className='flex flex-wrap items-center justify-between gap-12px'>
            <div className='flex items-center gap-10px'>
              <span className='inline-flex h-30px w-30px items-center justify-center rounded-8px bg-[var(--color-fill-2)] text-t-primary'>
                <OpenScienceIcon name='remoteJob' size={22} visualScale={1.08} />
              </span>
              <h1 className='m-0 text-22px font-650 text-t-primary'>
                {t('settings.compute.title', { defaultValue: '服务器管理' })}
              </h1>
            </div>
            <Button type='primary' icon={<Plus size='16' />} onClick={openAdd}>
              {t('settings.compute.addHost', { defaultValue: '新增 SSH host' })}
            </Button>
          </div>
          <p className='m-0 max-w-760px text-13px leading-20px text-t-secondary'>
            {t('settings.compute.description', {
              defaultValue:
                '保存常用 SSH 服务器，在新会话中按任务选择远程计算环境。保存时会自动测试连接，测试失败也会保留配置以便稍后修正。',
            })}
          </p>
        </div>

        <section className='rounded-14px border border-solid border-2 bg-base p-18px shadow-[0_10px_28px_rgba(15,23,42,0.035)]'>
          <div className='mb-14px flex items-start justify-between gap-12px'>
            <div>
              <div className='text-16px font-700 text-t-primary'>SSH hosts</div>
              <div className='mt-3px text-12px leading-18px text-t-secondary'>
                {t('settings.compute.sshHostsDesc', { defaultValue: '远程服务器、集群登录节点或作业提交节点。' })}
              </div>
            </div>
            <Button size='small' type='secondary' icon={<Refresh size='14' />} onClick={loadHosts} loading={loading}>
              {t('common.refresh', { defaultValue: '刷新' })}
            </Button>
          </div>

          {loading ? (
            <div className='flex items-center justify-center py-36px'>
              <Spin size={28} />
            </div>
          ) : sortedHosts.length === 0 ? (
            <div className='rounded-12px border border-dashed border-[var(--color-border-2)] py-36px'>
              <Empty
                icon={<OpenScienceIcon name='remoteJob' size={34} visualScale={1.08} />}
                description={t('settings.compute.empty', { defaultValue: '还没有 SSH host' })}
              />
              <div className='mt-12px flex justify-center'>
                <Button type='primary' icon={<Plus size='16' />} onClick={openAdd}>
                  {t('settings.compute.emptyAction', { defaultValue: '添加第一台服务器' })}
                </Button>
              </div>
            </div>
          ) : (
            <div className='flex flex-col gap-10px'>
              {sortedHosts.map((host) => (
                <div key={host.id} className={styles.hostCard}>
                  <div className={styles.hostCardHeader}>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-8px'>
                        <div className='truncate text-15px font-700 text-t-primary'>{host.name}</div>
                        <Tag size='small' color={statusTone(host)}>
                          {host.lastTest?.status === 'connected'
                            ? t('settings.compute.connected', { defaultValue: '已连接' })
                            : host.lastTest?.status === 'failed'
                              ? t('settings.compute.failed', { defaultValue: '失败' })
                              : t('settings.compute.untested', { defaultValue: '未测试' })}
                        </Tag>
                      </div>
                      <div className='mt-5px flex items-center gap-6px text-13px text-t-secondary'>
                        <Terminal size='14' />
                        <span className='truncate'>
                          {host.username}@{host.host}:{host.port}
                        </span>
                      </div>
                    </div>
                    <div className='flex shrink-0 items-center gap-6px'>
                      <Button
                        size='small'
                        type='secondary'
                        icon={host.lastTest?.status === 'connected' ? <CheckOne size='14' /> : <Refresh size='14' />}
                        loading={testingId === host.id}
                        onClick={() => handleTest(host)}
                      >
                        {t('settings.compute.testConnection', { defaultValue: '测试' })}
                      </Button>
                      <Button size='small' type='text' icon={<Edit size='14' />} onClick={() => openEdit(host)} />
                      <Popconfirm
                        title={t('settings.compute.deleteConfirm', { defaultValue: '确定删除这台服务器吗？' })}
                        onOk={() => handleDelete(host)}
                      >
                        <Button size='small' type='text' status='danger' icon={<Delete size='14' />} />
                      </Popconfirm>
                    </div>
                  </div>

                  <div className={styles.hostMeta}>
                    <span className={styles.miniBadge}>{formatAuth(host)}</span>
                    {host.remoteWorkdir ? <span className={styles.miniBadge}>{host.remoteWorkdir}</span> : null}
                    {(host.tags || []).map((tag) => (
                      <span key={tag} className={styles.miniBadge}>
                        {tag}
                      </span>
                    ))}
                    <span className={classNames(styles.miniBadge, 'inline-flex items-center gap-4px')}>
                      <Time size='12' />
                      {formatTestTime(host.lastTest)}
                    </span>
                  </div>

                  {host.lastTest?.message ? (
                    <div className='text-12px leading-18px text-t-tertiary'>{host.lastTest.message}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <SshHostModal
        visible={modalOpen}
        host={modalHost}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void loadHosts();
        }}
      />
    </SettingsPageWrapper>
  );
};

export default ComputeSettings;
