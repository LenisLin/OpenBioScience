/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Message, Modal, Tag } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { ILarkAutomationStatus } from '@/common/adapter/ipcBridge';
import type { ILarkProjectSettingsSnapshot } from '@/common/adapter/ipcBridge';
import CollaborationIcon, { type CollaborationIconName } from '@/renderer/components/icons/CollaborationIcon';
import FeishuConnectionWizardModal from '@/renderer/pages/collaboration/FeishuConnectionWizardModal';
import {
  COLLABORATION_CONNECTED_STORAGE_KEY,
  getCollaborationModule,
} from '@/renderer/pages/collaboration/collaborationConfig';
import SettingsPageWrapper from './components/SettingsPageWrapper';

function isRuntimeReady(status?: ILarkAutomationStatus | null) {
  return Boolean(status?.cliInstalled && status.configReady && status.authenticated);
}

const LarkAutomationSettings: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ILarkAutomationStatus | null>(null);
  const [channelReady, setChannelReady] = useState(false);
  const [webLoginReady, setWebLoginReady] = useState(
    () => localStorage.getItem(COLLABORATION_CONNECTED_STORAGE_KEY) === 'true'
  );
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bindVisible, setBindVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editAppId, setEditAppId] = useState('');
  const [editAppSecret, setEditAppSecret] = useState('');
  const [projectAgentSettings, setProjectAgentSettings] = useState<ILarkProjectSettingsSnapshot | null>(null);
  const [leaderPromptDraft, setLeaderPromptDraft] = useState('');
  const [defaultPromptDraft, setDefaultPromptDraft] = useState('');
  const [collaborationPromptDraft, setCollaborationPromptDraft] = useState('');
  const [agentTaskPromptDraft, setAgentTaskPromptDraft] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);

  const loadProjectAgentSettings = useCallback(async () => {
    try {
      const next = await ipcBridge.larkProjectAgent.getSettings.invoke();
      setProjectAgentSettings(next);
      setLeaderPromptDraft(next.promptFiles.find((file) => file.role === 'leader')?.content ?? '');
      setDefaultPromptDraft(next.promptFiles.find((file) => file.role === 'default')?.content ?? '');
      setCollaborationPromptDraft(next.promptFiles.find((file) => file.role === 'collaboration')?.content ?? '');
      setAgentTaskPromptDraft(next.promptFiles.find((file) => file.role === 'agent-task')?.content ?? '');
    } catch {
      setProjectAgentSettings(null);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const next = await ipcBridge.larkAutomation.getStatus.invoke();
      setStatus(next);
      setWebLoginReady(localStorage.getItem(COLLABORATION_CONNECTED_STORAGE_KEY) === 'true');

      try {
        const plugins = await ipcBridge.channel.getPluginStatus.invoke();
        const larkPlugin = plugins?.find((plugin) => plugin.type === 'lark');
        setChannelReady(Boolean(larkPlugin?.enabled || larkPlugin?.connected || larkPlugin?.hasToken));
      } catch {
        setChannelReady(false);
      }
      return next;
    } catch {
      Message.error(t('settings.larkAutomation.statusFailed'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshStatus();
    void loadProjectAgentSettings();
  }, [loadProjectAgentSettings, refreshStatus]);

  const handleOpenWizard = useCallback(() => {
    setBindVisible(true);
    void refreshStatus();
  }, [refreshStatus]);

  const handleCloseWizard = useCallback(() => {
    setBindVisible(false);
    void refreshStatus();
  }, [refreshStatus]);

  const handleOpenEdit = useCallback(() => {
    setEditAppId(status?.appId || status?.binding?.appId || '');
    setEditAppSecret('');
    setEditVisible(true);
  }, [status?.appId, status?.binding?.appId]);

  const handleCloseEdit = useCallback(() => {
    setEditVisible(false);
    setEditAppSecret('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    const appId = editAppId.trim();
    const appSecret = editAppSecret.trim();
    if (!appId || !appSecret) {
      Message.warning(t('settings.larkAutomation.appCredentialsRequired'));
      return;
    }
    setSyncing(true);
    try {
      const result = await ipcBridge.larkAutomation.syncChannel.invoke({
        profileName: status?.profileName,
        appId,
        appSecret,
      });
      if (result.ok || result.bindingReady) {
        Message.success(result.message || t('settings.larkAutomation.connectionSaved'));
        setEditVisible(false);
        setEditAppSecret('');
      } else if (result.error) {
        Message.error(result.error);
      }
      await refreshStatus();
    } finally {
      setSyncing(false);
    }
  }, [editAppId, editAppSecret, refreshStatus, status?.profileName, t]);

  const handleSavePrompt = useCallback(
    async (role: 'leader' | 'default' | 'collaboration' | 'agent-task') => {
      setPromptSaving(true);
      try {
        const next = await ipcBridge.larkProjectAgent.updatePrompt.invoke({
          role,
          content:
            role === 'leader'
              ? leaderPromptDraft
              : role === 'collaboration'
                ? collaborationPromptDraft
                : role === 'agent-task'
                  ? agentTaskPromptDraft
                  : defaultPromptDraft,
        });
        setProjectAgentSettings(next);
        Message.success(
          role === 'leader'
            ? t('settings.larkAutomation.promptSaved.leader')
            : role === 'collaboration'
              ? t('settings.larkAutomation.promptSaved.collaboration')
              : role === 'agent-task'
                ? t('settings.larkAutomation.promptSaved.agentTask')
              : t('settings.larkAutomation.promptSaved.default')
        );
      } finally {
        setPromptSaving(false);
      }
    },
    [agentTaskPromptDraft, collaborationPromptDraft, defaultPromptDraft, leaderPromptDraft, t]
  );

  const handleResetPrompt = useCallback(async (role: 'leader' | 'default' | 'collaboration' | 'agent-task') => {
    setPromptSaving(true);
    try {
      const next = await ipcBridge.larkProjectAgent.resetPrompt.invoke({ role });
      setProjectAgentSettings(next);
      setLeaderPromptDraft(next.promptFiles.find((file) => file.role === 'leader')?.content ?? '');
      setDefaultPromptDraft(next.promptFiles.find((file) => file.role === 'default')?.content ?? '');
      setCollaborationPromptDraft(next.promptFiles.find((file) => file.role === 'collaboration')?.content ?? '');
      setAgentTaskPromptDraft(next.promptFiles.find((file) => file.role === 'agent-task')?.content ?? '');
      Message.success(t('settings.larkAutomation.promptReset'));
    } finally {
      setPromptSaving(false);
    }
  }, [t]);

  const runtimeReady = isRuntimeReady(status);
  const eventReady = Boolean(status?.eventListener?.ready);
  const taskAutomationReady = Boolean(eventReady && status?.bindingReady);
  const ready = runtimeReady && eventReady && webLoginReady;
  const userName = status?.user?.userName;
  const channelValue = channelReady
    ? t('settings.larkAutomation.status.enabled')
    : t('settings.larkAutomation.status.disabled');
  const listenerValue = eventReady
    ? status?.eventListener?.lastEventAt
      ? t('settings.larkAutomation.status.runningAt', { time: new Date(status.eventListener.lastEventAt).toLocaleTimeString() })
      : t('settings.larkAutomation.status.running')
    : status?.eventListener?.running
      ? t('settings.larkAutomation.status.starting')
      : t('settings.larkAutomation.status.stopped');
  const loginUrl = getCollaborationModule('messages').url;

  return (
    <SettingsPageWrapper contentClassName='max-w-940px'>
      <div className='w-full flex flex-col gap-18px'>
        <div className='flex items-start justify-between gap-16px'>
          <div className='min-w-0'>
            <h1 className='m-0 text-22px font-650 text-t-primary'>
              {t('settings.larkAutomation.title')}
            </h1>
            <p className='m-0 mt-6px text-14px text-t-secondary leading-22px max-w-680px'>
              {t('settings.larkAutomation.description')}
            </p>
          </div>
          <Button
            type='primary'
            className='collaboration-light-primary'
            icon={<CollaborationIcon name='connected' size={21} />}
            onClick={handleOpenWizard}
          >
            {t('settings.larkAutomation.quickBind')}
          </Button>
        </div>

        <div className='border border-border-1 rd-8px bg-bg-2 p-18px flex flex-col gap-14px'>
          <div className='flex items-center justify-between gap-12px'>
            <div className='flex items-center gap-10px min-w-0'>
              <span className='size-38px flex-center text-t-primary shrink-0'>
                <CollaborationIcon name='runtime' size={32} />
              </span>
              <div className='min-w-0'>
                <div className='text-15px font-600 text-t-primary'>
                  {t('settings.larkAutomation.localRuntime')}
                </div>
                <div className='text-12px text-t-tertiary truncate'>
                  {status?.cliVersion
                    ? `lark-cli ${status.cliVersion}`
                    : t('settings.larkAutomation.cliUnknown')}
                </div>
              </div>
            </div>
            <div className='flex items-center gap-8px shrink-0'>
              <Tag color={ready ? 'green' : 'gray'}>
                {ready
                  ? t('settings.larkAutomation.ready')
                  : t('settings.larkAutomation.notReady')}
              </Tag>
              <Button
                size='small'
                icon={<CollaborationIcon name='refreshSync' size={20} spin={loading} />}
                loading={loading}
                onClick={() => void refreshStatus()}
              >
                {t('common.refresh')}
              </Button>
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-6 gap-10px'>
            <StatusCell
              icon='webLogin'
              label={t('settings.larkAutomation.status.webLogin')}
              value={
                webLoginReady
                  ? t('settings.larkAutomation.status.webConnected')
                  : t('settings.larkAutomation.status.webDisconnected')
              }
              ready={webLoginReady}
            />
            <StatusCell
              icon='createApp'
              label={t('settings.larkAutomation.status.botApp')}
              value={
                status?.configReady
                  ? status.appId || t('settings.larkAutomation.status.configured')
                  : t('settings.larkAutomation.status.notConfigured')
              }
              ready={Boolean(status?.configReady)}
            />
            <StatusCell
              icon='auth'
              label={t('settings.larkAutomation.status.userAuth')}
              value={
                status?.authenticated
                  ? userName || t('settings.larkAutomation.status.authorized')
                  : t('settings.larkAutomation.status.unauthorized')
              }
              ready={Boolean(status?.authenticated)}
            />
            <StatusCell
              icon='apiBinding'
              label={t('settings.larkAutomation.status.apiBinding')}
              value={
                status?.bindingReady
                  ? t('settings.larkAutomation.status.verified')
                  : t('settings.larkAutomation.status.pendingVerify')
              }
              ready={Boolean(status?.bindingReady)}
            />
            <StatusCell icon='listener' label={t('settings.larkAutomation.status.listener')} value={listenerValue} ready={eventReady} />
            <StatusCell
              icon='taskAutomation'
              label={t('settings.larkAutomation.status.taskAutomation')}
              value={
                taskAutomationReady
                  ? t('settings.larkAutomation.status.enabledCount', { count: status?.eventListener?.taskCreatedCount ?? 0 })
                  : status?.bindingReady
                    ? t('settings.larkAutomation.status.waitingListener')
                    : t('settings.larkAutomation.status.pendingBinding')
              }
              ready={taskAutomationReady}
            />
          </div>

          {status?.bindingReady && status.binding ? (
            <div className='rd-8px border border-border-1 bg-bg-1 p-12px text-12px text-t-secondary leading-20px'>
              <span className='font-650 text-t-primary'>{t('settings.larkAutomation.status.boundPrefix')}</span>
              {status.binding.appName || 'DeepOrganiser'}
              {status.binding.appId ? ` · App ID: ${status.binding.appId}` : ''}
              {status.binding.profileName ? ` · Profile: ${status.binding.profileName}` : ''}
              {status.binding.userName ? ` · ${t('settings.larkAutomation.status.boundUser', { name: status.binding.userName })}` : ''}
            </div>
          ) : null}

          <div className='rd-8px border border-border-1 bg-bg-1 p-14px flex flex-col gap-12px'>
            <div className='flex items-start justify-between gap-12px'>
              <div className='min-w-0 flex items-start gap-10px'>
                <span className='size-34px flex-center shrink-0'>
                  <CollaborationIcon name='apiBinding' size={29} />
                </span>
                <div className='min-w-0'>
                <div className='text-14px font-650 text-t-primary'>{t('settings.larkAutomation.connectionConfig.title')}</div>
                <div className='mt-4px text-12px text-t-secondary leading-20px'>
                  {t('settings.larkAutomation.connectionConfig.description')}
                </div>
                </div>
              </div>
              <div className='flex items-center gap-8px shrink-0'>
                <Button size='small' icon={<CollaborationIcon name='connected' size={20} />} onClick={handleOpenWizard}>
                  {t('settings.larkAutomation.connectionConfig.rebind')}
                </Button>
                <Button
                  size='small'
                  type='primary'
                  className='collaboration-light-primary'
                  icon={<CollaborationIcon name='secretKey' size={20} />}
                  onClick={handleOpenEdit}
                >
                  {t('settings.larkAutomation.connectionConfig.edit')}
                </Button>
              </div>
            </div>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-10px'>
              <StatusCell
                icon='profileSelect'
                label='Profile'
                value={status?.profileName || t('settings.larkAutomation.status.notSelected')}
                ready={Boolean(status?.profileName)}
              />
              <StatusCell
                icon='createApp'
                label='App ID'
                value={status?.appId || status?.binding?.appId || t('settings.larkAutomation.status.notDetected')}
                ready={Boolean(status?.appId || status?.binding?.appId)}
              />
              <StatusCell
                icon='channelSave'
                label={t('settings.larkAutomation.status.legacyChannel')}
                value={channelValue}
                ready={channelReady}
              />
              <StatusCell
                icon='apiBinding'
                label={t('settings.larkAutomation.status.lastVerified')}
                value={
                  status?.binding?.updatedAt
                    ? new Date(status.binding.updatedAt).toLocaleString()
                    : status?.bindingReady
                      ? t('settings.larkAutomation.status.verified')
                      : t('settings.larkAutomation.status.pendingVerify')
                }
                ready={Boolean(status?.bindingReady)}
              />
            </div>
          </div>

          {status?.error && <div className='text-12px text-[rgb(var(--danger-6))]'>{status.error}</div>}
        </div>

        <div className='border border-border-1 rd-8px bg-bg-2 p-18px flex flex-col gap-16px'>
          <div className='flex items-start justify-between gap-12px'>
            <div className='min-w-0 flex items-start gap-10px'>
              <span className='size-38px flex-center shrink-0'>
                <CollaborationIcon name='promptManager' size={33} />
              </span>
              <div className='min-w-0'>
              <div className='text-16px font-650 text-t-primary'>{t('settings.larkAutomation.prompts.title')}</div>
              <div className='mt-4px text-12px text-t-secondary leading-20px'>
                {t('settings.larkAutomation.prompts.description')}
              </div>
              </div>
            </div>
            <Button
              size='small'
              icon={<CollaborationIcon name='refreshSync' size={20} />}
              onClick={() => void loadProjectAgentSettings()}
            >
              {t('common.refresh')}
            </Button>
          </div>
          <PromptEditor
            icon='leaderAgent'
            title={t('settings.larkAutomation.prompts.leaderTitle')}
            description={t('settings.larkAutomation.prompts.leaderDesc')}
            value={leaderPromptDraft}
            filePath={projectAgentSettings?.promptFiles.find((file) => file.role === 'leader')?.path}
            saving={promptSaving}
            onChange={setLeaderPromptDraft}
            onSave={() => void handleSavePrompt('leader')}
            onReset={() => void handleResetPrompt('leader')}
          />
          <PromptEditor
            icon='message'
            title={t('settings.larkAutomation.prompts.collaborationTitle')}
            description={t('settings.larkAutomation.prompts.collaborationDesc')}
            value={collaborationPromptDraft}
            filePath={projectAgentSettings?.promptFiles.find((file) => file.role === 'collaboration')?.path}
            saving={promptSaving}
            onChange={setCollaborationPromptDraft}
            onSave={() => void handleSavePrompt('collaboration')}
            onReset={() => void handleResetPrompt('collaboration')}
          />
          <PromptEditor
            icon='sopSkill'
            title={t('settings.larkAutomation.prompts.agentTaskTitle')}
            description={t('settings.larkAutomation.prompts.agentTaskDesc')}
            value={agentTaskPromptDraft}
            filePath={projectAgentSettings?.promptFiles.find((file) => file.role === 'agent-task')?.path}
            saving={promptSaving}
            onChange={setAgentTaskPromptDraft}
            onSave={() => void handleSavePrompt('agent-task')}
            onReset={() => void handleResetPrompt('agent-task')}
          />
          <PromptEditor
            icon='subAgent'
            title={t('settings.larkAutomation.prompts.defaultTitle')}
            description={t('settings.larkAutomation.prompts.defaultDesc')}
            value={defaultPromptDraft}
            filePath={projectAgentSettings?.promptFiles.find((file) => file.role === 'default')?.path}
            saving={promptSaving}
            onChange={setDefaultPromptDraft}
            onSave={() => void handleSavePrompt('default')}
            onReset={() => void handleResetPrompt('default')}
          />
        </div>
      </div>

      <FeishuConnectionWizardModal
        visible={bindVisible}
        loginUrl={loginUrl}
        onClose={handleCloseWizard}
        onWebConnected={() => {
          setWebLoginReady(true);
          void refreshStatus();
        }}
        onStatusChanged={() => void refreshStatus()}
      />

      <Modal
        visible={editVisible}
        title={t('settings.larkAutomation.connectionConfig.modalTitle')}
        okText={t('settings.larkAutomation.connectionConfig.saveAndEnable')}
        cancelText={t('common.cancel')}
        confirmLoading={syncing}
        onOk={() => void handleSaveEdit()}
        onCancel={handleCloseEdit}
        maskClosable={false}
        style={{ width: 620 }}
      >
        <div className='pt-8px flex flex-col gap-16px'>
          <div className='text-13px text-t-secondary leading-21px'>
            {t('settings.larkAutomation.connectionConfig.modalDescription')}
          </div>
          <div>
            <div className='mb-6px text-13px font-650 text-t-primary flex items-center gap-6px'>
              <CollaborationIcon name='createApp' size={21} />
              App ID
            </div>
            <Input value={editAppId} onChange={setEditAppId} placeholder='cli_xxxxxxxxxx' />
          </div>
          <div>
            <div className='mb-6px text-13px font-650 text-t-primary flex items-center gap-6px'>
              <CollaborationIcon name='secretKey' size={21} />
              App Secret
            </div>
            <Input.Password
              value={editAppSecret}
              onChange={setEditAppSecret}
              placeholder={t('settings.larkAutomation.connectionConfig.appSecretPlaceholder')}
              visibilityToggle
            />
          </div>
        </div>
      </Modal>
    </SettingsPageWrapper>
  );
};

const StatusCell: React.FC<{ icon: CollaborationIconName; label: string; value: string; ready: boolean }> = ({
  icon,
  label,
  value,
  ready,
}) => (
  <div className='bg-bg-1 rd-6px border border-border-1 p-12px min-w-0'>
    <div className='flex items-center justify-between gap-8px'>
      <div className='text-12px text-t-tertiary flex items-center gap-5px min-w-0'>
        <CollaborationIcon name={icon} size={20} />
        <span className='truncate'>{label}</span>
      </div>
      <span className={`w-7px h-7px rd-50% ${ready ? 'bg-green-500' : 'bg-fill-4'}`} />
    </div>
    <div className='mt-6px text-14px font-600 text-t-primary truncate'>{value}</div>
  </div>
);

const PromptEditor: React.FC<{
  icon: CollaborationIconName;
  title: string;
  description: string;
  value: string;
  filePath?: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
}> = ({ icon, title, description, value, filePath, saving, onChange, onSave, onReset }) => {
  const { t } = useTranslation();
  return (
    <div className='rd-8px border border-border-1 bg-bg-1 p-14px flex flex-col gap-10px'>
      <div className='flex items-start justify-between gap-12px'>
        <div className='min-w-0 flex items-start gap-9px'>
          <span className='size-34px flex-center shrink-0'>
            <CollaborationIcon name={icon} size={29} />
          </span>
          <div className='min-w-0'>
          <div className='text-14px font-650 text-t-primary'>{title}</div>
          <div className='mt-2px text-12px text-t-secondary leading-20px'>{description}</div>
          {filePath ? <div className='mt-2px text-11px text-t-tertiary truncate'>{filePath}</div> : null}
          </div>
        </div>
        <div className='flex items-center gap-8px shrink-0'>
          <Button size='small' loading={saving} onClick={onReset}>
            {t('settings.larkAutomation.prompts.restoreDefault')}
          </Button>
          <Button size='small' type='primary' className='collaboration-light-primary' loading={saving} onClick={onSave}>
            {t('common.save')}
          </Button>
        </div>
      </div>
      <Input.TextArea
        value={value}
        onChange={onChange}
        autoSize={{ minRows: 8, maxRows: 18 }}
        placeholder={t('settings.larkAutomation.prompts.placeholder')}
      />
    </div>
  );
};

export default LarkAutomationSettings;
