/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  deleteLoopGoal,
  formatLoopGoalElapsed,
  getLoopGoalElapsedMs,
  pauseLoopGoal,
  resumeLoopGoal,
  summarizeLoopGoal,
  updateLoopGoalText,
  type LoopGoalState,
} from '@/common/chat/loopGoal';
import { Button, Input, Modal, Tooltip } from '@arco-design/web-react';
import { Delete, Edit, PlayOne, Right, Target, PauseOne, CloseSmall } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './LoopGoalBar.module.css';

type LoopGoalBarProps = {
  loopGoal: LoopGoalState;
  variant?: 'guid' | 'conversation';
  disabled?: boolean;
  onChange: (next: LoopGoalState) => void | Promise<void>;
};

const useNowTick = (enabled: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return now;
};

const LoopGoalBar: React.FC<LoopGoalBarProps> = ({ loopGoal, variant = 'conversation', disabled = false, onChange }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(loopGoal.goal);
  const now = useNowTick(loopGoal.status === 'active');

  useEffect(() => {
    if (!editing) setDraft(loopGoal.goal);
  }, [editing, loopGoal.goal]);

  const statusLabel = useMemo(() => {
    if (loopGoal.status === 'paused') return t('guid.loopGoal.statusPaused');
    if (loopGoal.status === 'deleted') return t('guid.loopGoal.statusDeleted');
    return t('guid.loopGoal.statusActive');
  }, [loopGoal.status, t]);

  const elapsedLabel = formatLoopGoalElapsed(getLoopGoalElapsedMs(loopGoal, now));
  const isPaused = loopGoal.status === 'paused';
  const isDeleted = loopGoal.status === 'deleted';

  const commitChange = useCallback(
    async (next: LoopGoalState) => {
      if (disabled) return;
      await onChange(next);
    },
    [disabled, onChange]
  );

  const handleEditSave = useCallback(async () => {
    const nextGoal = draft.trim();
    if (!nextGoal) return;
    await commitChange(updateLoopGoalText(loopGoal, nextGoal));
    setEditing(false);
  }, [commitChange, draft, loopGoal]);

  return (
    <div
      className={variant === 'guid' ? styles.loopGoalWrapGuid : styles.loopGoalWrap}
      data-testid='loop-goal-wrap'
    >
      <div className={styles.loopGoalBar} data-loop-status={loopGoal.status} data-testid='loop-goal-bar'>
        <span className={styles.goalIcon} aria-hidden='true'>
          <Target theme='outline' size={18} />
        </span>
        <div className={styles.goalText}>
          <span className={styles.goalStatus} data-testid='loop-goal-status'>
            {statusLabel}
          </span>
          <span className={styles.goalSummary} data-testid='loop-goal-summary'>
            {summarizeLoopGoal(loopGoal.goal, variant === 'guid' ? 48 : 64)}
          </span>
        </div>
        <div className={styles.goalMeta}>
          <span className={styles.goalTime} data-testid='loop-goal-elapsed'>
            {elapsedLabel}
          </span>
        </div>
        <div className={styles.goalActions}>
          <Tooltip content={t('guid.loopGoal.edit')}>
            <button
              type='button'
              className={styles.goalActionButton}
              data-testid='loop-goal-edit-btn'
              disabled={disabled || isDeleted}
              onClick={() => setEditing(true)}
              aria-label={t('guid.loopGoal.edit')}
            >
              <Edit theme='outline' size={18} />
            </button>
          </Tooltip>
          <Tooltip content={isPaused ? t('guid.loopGoal.resume') : t('guid.loopGoal.pause')}>
            <button
              type='button'
              className={styles.goalActionButton}
              data-testid='loop-goal-pause-resume-btn'
              disabled={disabled || isDeleted}
              onClick={() => void commitChange(isPaused ? resumeLoopGoal(loopGoal) : pauseLoopGoal(loopGoal))}
              aria-label={isPaused ? t('guid.loopGoal.resume') : t('guid.loopGoal.pause')}
            >
              {isPaused ? <PlayOne theme='outline' size={18} /> : <PauseOne theme='outline' size={18} />}
            </button>
          </Tooltip>
          <Tooltip content={t('guid.loopGoal.delete')}>
            <button
              type='button'
              className={styles.goalActionButton}
              data-testid='loop-goal-delete-btn'
              disabled={disabled || isDeleted}
              onClick={() => void commitChange(deleteLoopGoal(loopGoal))}
              aria-label={t('guid.loopGoal.delete')}
            >
              <Delete theme='outline' size={18} />
            </button>
          </Tooltip>
          <Tooltip content={expanded ? t('common.collapse') : t('common.expand')}>
            <button
              type='button'
              className={styles.goalActionButton}
              data-testid='loop-goal-expand-btn'
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? t('common.collapse') : t('common.expand')}
            >
              <Right
                theme='outline'
                size={18}
                style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.16s ease' }}
              />
            </button>
          </Tooltip>
        </div>
      </div>
      {expanded ? (
        <div className={styles.goalExpanded} data-testid='loop-goal-expanded'>
          {loopGoal.goal}
        </div>
      ) : null}

      <Modal
        visible={editing}
        footer={null}
        title={null}
        closable={false}
        className={styles.editModal}
        style={{ width: 720, maxWidth: 'calc(100vw - 32px)' }}
        onCancel={() => setEditing(false)}
        maskClosable
        alignCenter
      >
        <div className={styles.editModalBody} data-testid='loop-goal-edit-modal'>
          <div className={styles.editModalHeader}>
            <div className='flex items-center gap-14px min-w-0'>
              <span className={styles.editModalIcon} aria-hidden='true'>
                <Target theme='outline' size={26} />
              </span>
              <h3 className={styles.editModalTitle}>{t('guid.loopGoal.editTitle')}</h3>
            </div>
            <Button
              type='text'
              shape='circle'
              icon={<CloseSmall theme='outline' size={22} />}
              onClick={() => setEditing(false)}
              aria-label={t('common.close')}
            />
          </div>
          <Input.TextArea
            autoSize={{ minRows: 7, maxRows: 12 }}
            value={draft}
            onChange={setDraft}
            className={styles.editTextarea}
            placeholder={t('guid.loopGoal.placeholder')}
            data-testid='loop-goal-edit-textarea'
          />
          <div className={styles.editFooter}>
            <Button onClick={() => setEditing(false)} data-testid='loop-goal-edit-cancel'>
              {t('common.cancel')}
            </Button>
            <Button
              type='primary'
              disabled={!draft.trim()}
              onClick={() => void handleEditSave()}
              data-testid='loop-goal-edit-save'
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LoopGoalBar;
