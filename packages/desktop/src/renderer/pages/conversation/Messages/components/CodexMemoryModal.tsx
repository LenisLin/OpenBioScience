/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexMemoryDetail, CodexMemoryRecord } from '@/deepscientist_lark/codex_memory/types';
import MarkdownView from '@renderer/components/Markdown';
import { Button, Modal, Spin, Tag } from '@arco-design/web-react';
import { IconCopy, IconRefresh } from '@arco-design/web-react/icon';
import React from 'react';
import { useTranslation } from 'react-i18next';

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const CodexMemoryModal: React.FC<{
  visible: boolean;
  memory?: CodexMemoryRecord;
  detail?: CodexMemoryDetail;
  loading?: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}> = ({ visible, memory, detail, loading, onClose, onRefresh }) => {
  const { t } = useTranslation();
  const markdown = detail?.markdown || '';

  const handleCopy = async () => {
    if (!markdown) return;
    await navigator.clipboard?.writeText(markdown).catch(() => {});
  };

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      footer={null}
      className='codex-memory-modal'
      title={null}
      escToExit
      maskClosable
    >
      <div className='codex-memory-modal__header'>
        <div className='codex-memory-modal__mark'>M</div>
        <div className='codex-memory-modal__heading'>
          <div className='codex-memory-modal__eyebrow'>{t('messages.codexMemory.title')}</div>
          <div className='codex-memory-modal__title'>{memory?.title || t('messages.codexMemory.fallbackTitle')}</div>
        </div>
      </div>

      <div className='codex-memory-modal__meta'>
        <Tag size='small'>
          {memory?.windowNumber ? t('messages.codexMemory.window', { number: memory.windowNumber }) : '-'}
        </Tag>
        <Tag size='small'>{memory ? formatTime(memory.timestamp) : '-'}</Tag>
        <Tag size='small'>{memory?.line ? t('messages.codexMemory.line', { number: memory.line }) : '-'}</Tag>
        <Tag size='small' color={memory?.status === 'ready' ? 'green' : memory?.status === 'failed' ? 'red' : 'gray'}>
          {memory?.status || 'pending'}
        </Tag>
      </div>

      <div className='codex-memory-modal__body'>
        {loading ? (
          <div className='codex-memory-modal__loading'>
            <Spin />
            <span>{t('messages.codexMemory.loading')}</span>
          </div>
        ) : markdown ? (
          <MarkdownView>{markdown}</MarkdownView>
        ) : (
          <div className='codex-memory-modal__empty'>{t('messages.codexMemory.empty')}</div>
        )}
      </div>

      <div className='codex-memory-modal__footer'>
        <div className='codex-memory-modal__path'>{memory?.rolloutPath || ''}</div>
        <div className='codex-memory-modal__actions'>
          <Button size='small' icon={<IconRefresh />} onClick={onRefresh}>
            {t('messages.codexMemory.refresh')}
          </Button>
          <Button size='small' icon={<IconCopy />} onClick={handleCopy} disabled={!markdown}>
            {t('messages.codexMemory.copy')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CodexMemoryModal;
