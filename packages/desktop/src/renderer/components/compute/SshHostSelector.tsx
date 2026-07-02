/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ComputeSshHostPublic } from '@/common/types/compute';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import { Button, Checkbox, Dropdown, Empty, Message, Spin, Tooltip } from '@arco-design/web-react';
import { CheckOne, Down, Plus, SettingTwo } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import SshHostModal from './SshHostModal';
import styles from './compute.module.css';

const HOST_LIST_TIMEOUT_MS = 1500;

type SshHostSelectorProps = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  variant?: 'pill' | 'contextPill';
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('compute-hosts:list timeout')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

const statusClass = (host: ComputeSshHostPublic): string => {
  if (host.lastTest?.status === 'connected') return styles.statusConnected;
  if (host.lastTest?.status === 'failed') return styles.statusFailed;
  return '';
};

const authLabel = (host: ComputeSshHostPublic): string => {
  if (host.authType === 'password') return host.hasPassword ? 'password' : 'password missing';
  if (host.authType === 'privateKey') return host.privateKeyPath || 'private key';
  return 'ssh-agent';
};

const SshHostSelector: React.FC<SshHostSelectorProps> = ({ selectedIds, onChange, variant = 'pill' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hosts, setHosts] = useState<ComputeSshHostPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedHosts = useMemo(() => hosts.filter((host) => selectedSet.has(host.id)), [hosts, selectedSet]);

  const loadHosts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await withTimeout(ipcBridge.computeHosts.list.invoke(), HOST_LIST_TIMEOUT_MS);
      setHosts(Array.isArray(next) ? next : []);
    } catch (error) {
      console.error('Failed to load SSH hosts:', error);
      setHosts([]);
      setLoadError(
        t('settings.compute.loadTimeout', {
          defaultValue: '服务器列表暂未响应',
        })
      );
      if (!(error instanceof Error && error.message.includes('timeout'))) {
        Message.error(t('settings.compute.loadFailed', { defaultValue: '服务器列表加载失败' }));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadHosts();
  }, [loadHosts]);

  const toggleHost = useCallback(
    (id: string) => {
      const next = selectedSet.has(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id];
      onChange(next);
    },
    [onChange, selectedIds, selectedSet]
  );

  const selectedLabel =
    selectedHosts.length === 0 && selectedIds.length === 0
      ? t('settings.compute.selectorLabel', { defaultValue: '服务器' })
      : selectedHosts.length === 1
        ? selectedHosts[0].name
        : t('settings.compute.selectorCount', {
            defaultValue: '{{count}} 台服务器',
            count: selectedHosts.length || selectedIds.length,
          });
  const isContextPill = variant === 'contextPill';

  const panel = (
    <div className={styles.selectorPanel}>
      <div className={styles.selectorHeader}>
        <div>
          <div className='text-13px font-700 text-t-primary'>
            {t('settings.compute.sshHosts', { defaultValue: 'SSH hosts' })}
          </div>
          <div className='mt-2px text-11px leading-16px text-t-tertiary'>
            {t('settings.compute.selectorDesc', { defaultValue: '选择本轮任务可使用的远程服务器' })}
          </div>
        </div>
        <Button size='mini' type='text' icon={<SettingTwo size='14' />} onClick={() => navigate('/settings/compute')}>
          {t('common.settings', { defaultValue: '设置' })}
        </Button>
      </div>

      {loading ? (
        <div className='flex items-center justify-center py-24px'>
          <Spin size={22} />
        </div>
      ) : loadError ? (
        <div className='py-12px'>
          <Empty
            icon={<OpenScienceIcon name='remoteJob' size={30} visualScale={1.08} />}
            description={loadError}
          />
          <div className='mt-8px flex justify-center'>
            <Button size='mini' type='secondary' onClick={() => void loadHosts()}>
              {t('common.retry', { defaultValue: '重试' })}
            </Button>
          </div>
        </div>
      ) : hosts.length === 0 ? (
        <div className='py-12px'>
          <Empty
            icon={<OpenScienceIcon name='remoteJob' size={30} visualScale={1.08} />}
            description={t('settings.compute.emptySelector', { defaultValue: '还没有 SSH host' })}
          />
        </div>
      ) : (
        <div className={styles.hostList}>
          {hosts.map((host) => (
            <button key={host.id} type='button' className={styles.hostOption} onClick={() => toggleHost(host.id)}>
              <Checkbox
                checked={selectedSet.has(host.id)}
                onChange={() => toggleHost(host.id)}
                onClick={(e) => e.stopPropagation()}
              />
              <span className={classNames(styles.statusDot, statusClass(host))} />
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-13px font-650 text-t-primary'>{host.name}</span>
                <span className='block truncate text-11px text-t-tertiary'>
                  {host.username}@{host.host}:{host.port} · {authLabel(host)}
                </span>
              </span>
              {host.lastTest?.status === 'connected' ? <CheckOne size='15' fill='#287a4b' /> : null}
            </button>
          ))}
        </div>
      )}

      <div className='flex items-center justify-between gap-8px border-0 border-t border-solid border-[var(--color-border-1)] pt-8px'>
        <Button size='small' type='text' icon={<Plus size='14' />} onClick={() => setModalOpen(true)}>
          {t('settings.compute.addHost', { defaultValue: '新增 SSH host' })}
        </Button>
        {selectedIds.length > 0 ? (
          <Button size='small' type='text' onClick={() => onChange([])}>
            {t('common.clear', { defaultValue: '清除' })}
          </Button>
        ) : null}
      </div>
    </div>
  );

  const triggerButton = (
    <button
      type='button'
      className={classNames(
        isContextPill ? styles.selectorContextButton : styles.selectorButton,
        open && (isContextPill ? styles.selectorContextButtonActive : styles.selectorButtonActive),
        isContextPill && selectedIds.length > 0 && styles.selectorContextButtonSelected
      )}
    >
      <OpenScienceIcon name='remoteJob' size={isContextPill ? 14 : 16} visualScale={1.06} />
      <span className={isContextPill ? styles.selectorContextLabel : 'max-w-150px truncate'}>{selectedLabel}</span>
      {isContextPill ? (
        <Down theme='outline' size='12' fill='currentColor' className={styles.selectorContextChevron} />
      ) : null}
    </button>
  );

  return (
    <>
      <Dropdown trigger='click' popupVisible={open} onVisibleChange={setOpen} droplist={panel}>
        {isContextPill ? (
          triggerButton
        ) : (
          <Tooltip content={selectedHosts.map((host) => host.name).join('\n') || selectedLabel}>
            {triggerButton}
          </Tooltip>
        )}
      </Dropdown>
      <SshHostModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(host) => {
          void loadHosts();
          onChange(Array.from(new Set([...selectedIds, host.id])));
        }}
      />
    </>
  );
};

export default SshHostSelector;
