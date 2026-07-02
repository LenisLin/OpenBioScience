/**
 * @license
 * Copyright 2026 OpenScience
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Message, Modal, Spin } from '@arco-design/web-react';
import { CloseSmall } from '@icon-park/react';
import { ipcBridge } from '@/common';
import CollaborationIcon, { type CollaborationIconName } from '@/renderer/components/icons/CollaborationIcon';
import type {
  ILarkAutomationChannelSyncResult,
  ILarkAutomationProfile,
  ILarkAutomationProfilesResult,
  ILarkAutomationStartAuthResult,
  ILarkAutomationStatus,
} from '@/common/adapter/ipcBridge';
import NativeWebPanelHost from '@/renderer/components/media/NativeWebPanelHost';
import {
  COLLABORATION_CONNECTED_STORAGE_KEY,
  COLLABORATION_PARTITION,
  FEISHU_DESKTOP_USER_AGENT,
  isFeishuLoginUrl,
  isFeishuWorkspaceUrl,
  rememberFeishuWorkspaceOrigin,
} from './collaborationConfig';
import { useTranslation } from 'react-i18next';

type WizardStage = 'web' | 'auth' | 'app';

const STAGE_ORDER: WizardStage[] = ['web', 'app', 'auth'];
const STAGE_ICON_BY_STAGE: Record<WizardStage, CollaborationIconName> = {
  web: 'webLogin',
  app: 'createApp',
  auth: 'auth',
};
const APP_DISPLAY_NAME = 'OpenScience';

interface FeishuConnectionWizardModalProps {
  visible: boolean;
  loginUrl: string;
  onClose: () => void;
  onCancel?: () => void;
  onWebConnected?: () => void;
  onStatusChanged?: () => void;
}

const DEFAULT_AUTH_DOMAIN = [
  'approval',
  'apps',
  'attendance',
  'base',
  'calendar',
  'contact',
  'docs',
  'drive',
  'event',
  'im',
  'mail',
  'markdown',
  'minutes',
  'note',
  'okr',
  'sheets',
  'slides',
  'task',
  'vc',
  'wiki',
].join(',');

function isRuntimeReady(status?: ILarkAutomationStatus | null) {
  return Boolean(status?.cliInstalled && status.configReady && status.authenticated);
}

function useWizardCopy() {
  const { t } = useTranslation();
  const product = t('common.collaboration.wizard.product');

  return {
    product,
    close: t('common.collaboration.wizard.close'),
    confirm: t('common.collaboration.wizard.confirm'),
    openLink: t('common.collaboration.wizard.openLink'),
    waiting: t('common.collaboration.wizard.waiting'),
    connected: t('common.collaboration.wizard.connected'),
    footerHint: t('common.collaboration.wizard.footerHint'),
    floatingHintTitle: t('common.collaboration.wizard.floatingHintTitle'),
    stages: t('common.collaboration.wizard.stages', { returnObjects: true }) as string[],
    web: {
      title: t('common.collaboration.wizard.web.title'),
      subtitle: t('common.collaboration.wizard.web.subtitle', { product }),
      steps: t('common.collaboration.wizard.web.steps', { product, returnObjects: true }) as string[],
      loading: t('common.collaboration.wizard.web.loading'),
    },
    auth: {
      title: t('common.collaboration.wizard.auth.title'),
      subtitle: t('common.collaboration.wizard.auth.subtitle'),
      steps: t('common.collaboration.wizard.auth.steps', { returnObjects: true }) as string[],
      start: t('common.collaboration.wizard.auth.start'),
      needsApp: t('common.collaboration.wizard.auth.needsApp'),
      needsAppDesc: t('common.collaboration.wizard.auth.needsAppDesc'),
      needsWeb: t('common.collaboration.wizard.auth.needsWeb'),
      needsWebDesc: t('common.collaboration.wizard.auth.needsWebDesc'),
      goWeb: t('common.collaboration.wizard.auth.goWeb'),
      goApp: t('common.collaboration.wizard.auth.goApp'),
      cliMissing: t('common.collaboration.wizard.auth.cliMissing'),
      ready: t('common.collaboration.wizard.auth.ready'),
      linkTitle: t('common.collaboration.wizard.auth.linkTitle'),
      targetApp: t('common.collaboration.wizard.auth.targetApp'),
      profile: t('common.collaboration.wizard.auth.profile'),
      chooseProfileTitle: t('common.collaboration.wizard.auth.chooseProfileTitle'),
      chooseProfileDesc: t('common.collaboration.wizard.auth.chooseProfileDesc'),
      noProfiles: t('common.collaboration.wizard.auth.noProfiles'),
      refreshProfiles: t('common.collaboration.wizard.auth.refreshProfiles'),
      authorizeSelected: t('common.collaboration.wizard.auth.authorizeSelected'),
      selectedProfile: t('common.collaboration.wizard.auth.selectedProfile'),
      activeProfile: t('common.collaboration.wizard.auth.activeProfile'),
      profileRequired: t('common.collaboration.wizard.auth.profileRequired'),
      user: t('common.collaboration.wizard.auth.user'),
      tokenStatus: t('common.collaboration.wizard.auth.tokenStatus'),
      opening: t('common.collaboration.wizard.auth.opening'),
      verifying: t('common.collaboration.wizard.auth.verifying'),
      retry: t('common.collaboration.wizard.auth.retry'),
    },
    app: {
      title: t('common.collaboration.wizard.app.title'),
      subtitle: t('common.collaboration.wizard.app.subtitle'),
      steps: t('common.collaboration.wizard.app.steps', { returnObjects: true }) as string[],
      appName: t('common.collaboration.wizard.app.appName'),
      appNameHint: t('common.collaboration.wizard.app.appNameHint'),
      setupHint: t('common.collaboration.wizard.app.setupHint'),
      create: t('common.collaboration.wizard.app.create'),
      currentApp: t('common.collaboration.wizard.app.currentApp'),
      createPanelTitle: t('common.collaboration.wizard.app.createPanelTitle'),
      createPanelDesc: t('common.collaboration.wizard.app.createPanelDesc'),
      sync: t('common.collaboration.wizard.app.sync'),
      refresh: t('common.collaboration.wizard.app.refresh'),
      appId: t('common.collaboration.wizard.app.appId'),
      notReady: t('common.collaboration.wizard.app.notReady'),
      secretTitle: t('common.collaboration.wizard.app.secretTitle'),
      secretDesc: t('common.collaboration.wizard.app.secretDesc'),
      saveSecret: t('common.collaboration.wizard.app.saveSecret'),
      saved: t('common.collaboration.wizard.app.saved'),
      secretNeeded: t('common.collaboration.wizard.app.secretNeeded'),
      linkTitle: t('common.collaboration.wizard.app.linkTitle'),
      webLoading: t('common.collaboration.wizard.app.webLoading'),
      embeddedHint: t('common.collaboration.wizard.app.embeddedHint'),
    },
  };
}

const FeishuConnectionWizardModal: React.FC<FeishuConnectionWizardModalProps> = ({
  visible,
  loginUrl,
  onClose,
  onCancel,
  onWebConnected,
  onStatusChanged,
}) => {
  const copy = useWizardCopy();
  const [activeStage, setActiveStage] = useState<WizardStage>('web');
  const [webLoginReady, setWebLoginReady] = useState(
    () => localStorage.getItem(COLLABORATION_CONNECTED_STORAGE_KEY) === 'true'
  );
  const [status, setStatus] = useState<ILarkAutomationStatus | null>(null);
  const [channelReady, setChannelReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastNavigatedUrl, setLastNavigatedUrl] = useState(loginUrl);
  const [authResult, setAuthResult] = useState<ILarkAutomationStartAuthResult | null>(null);
  const [profilesResult, setProfilesResult] = useState<ILarkAutomationProfilesResult | null>(null);
  const [selectedProfileName, setSelectedProfileName] = useState<string | undefined>();
  const [profileSelectionConfirmed, setProfileSelectionConfirmed] = useState(false);
  const [configResult, setConfigResult] = useState<ILarkAutomationStartAuthResult | null>(null);
  const [channelResult, setChannelResult] = useState<ILarkAutomationChannelSyncResult | null>(null);
  const [manualAppSecret, setManualAppSecret] = useState('');
  const [workingStep, setWorkingStep] = useState<string | null>(null);
  const completingAuthForRef = useRef<string | null>(null);

  const handleClose = useCallback(() => {
    void ipcBridge.nativeWebPanel.hide.invoke({ id: 'collaboration-login' });
    void ipcBridge.nativeWebPanel.hide.invoke({ id: 'collaboration-app-setup' });
    void ipcBridge.nativeWebPanel.hide.invoke({ id: 'collaboration-auth' });
    onClose();
  }, [onClose]);

  const handleCancel = useCallback(() => {
    void ipcBridge.nativeWebPanel.hide.invoke({ id: 'collaboration-login' });
    void ipcBridge.nativeWebPanel.hide.invoke({ id: 'collaboration-app-setup' });
    void ipcBridge.nativeWebPanel.hide.invoke({ id: 'collaboration-auth' });
    (onCancel ?? onClose)();
  }, [onCancel, onClose]);

  const refreshProfiles = useCallback(async () => {
    const result = await ipcBridge.larkAutomation.listProfiles.invoke();
    setProfilesResult(result);
    const resultSelected = result.profiles.find((profile) => profile.name === result.selectedProfile)?.name;
    const activeProfile = result.profiles.find((profile) => profile.active)?.name;
    const nextSelected = resultSelected || activeProfile || result.profiles[0]?.name || result.selectedProfile;
    setSelectedProfileName((current) =>
      current && result.profiles.some((profile) => profile.name === current) ? current : nextSelected
    );
    return result;
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const next = await ipcBridge.larkAutomation.getStatus.invoke();
      setStatus(next);
      setSelectedProfileName(next.profileName);
      setWebLoginReady(localStorage.getItem(COLLABORATION_CONNECTED_STORAGE_KEY) === 'true');

      try {
        const plugins = await ipcBridge.channel.getPluginStatus.invoke();
        const larkPlugin = plugins?.find((plugin) => plugin.type === 'lark');
        setChannelReady(Boolean(larkPlugin?.enabled || larkPlugin?.connected || larkPlugin?.hasToken));
      } catch {
        setChannelReady(false);
      }
      return next;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLastNavigatedUrl(loginUrl);
    setActiveStage('web');
    setAuthResult(null);
    setConfigResult(null);
    setProfileSelectionConfirmed(false);
    completingAuthForRef.current = null;
    void refreshStatus();
    void refreshProfiles();
  }, [loginUrl, refreshProfiles, refreshStatus, visible]);

  useEffect(() => {
    if (!visible || activeStage !== 'auth') return;
    void refreshProfiles();
  }, [activeStage, refreshProfiles, visible]);

  const stageState = useMemo(() => {
    const appReady = Boolean(status?.configReady || profilesResult?.profiles.length);
    const authReady = Boolean(webLoginReady && appReady && status?.authenticated);
    return { webReady: webLoginReady, authReady, appReady };
  }, [profilesResult?.profiles.length, status?.authenticated, status?.configReady, webLoginReady]);

  const handleWebNavigation = useCallback(
    (url: string) => {
      setLastNavigatedUrl(url);
      if (isFeishuWorkspaceUrl(url) && !isFeishuLoginUrl(url)) {
        rememberFeishuWorkspaceOrigin(url);
        localStorage.setItem(COLLABORATION_CONNECTED_STORAGE_KEY, 'true');
        setWebLoginReady(true);
        setActiveStage('app');
        onWebConnected?.();
      }
    },
    [onWebConnected]
  );

  const handleStartAuth = useCallback(async (profileNameOverride?: string) => {
    if (!stageState.webReady) {
      Message.info(copy.auth.needsWeb);
      setActiveStage('web');
      return;
    }
    if (status && !status.cliInstalled) {
      Message.error(copy.auth.cliMissing);
      return;
    }
    const profileName = profileNameOverride || selectedProfileName || status?.profileName;
    if (!profileName) {
      Message.info(copy.auth.profileRequired);
      return;
    }
    const hasKnownProfile =
      status?.configReady || profilesResult?.profiles.some((profile) => profile.name === profileName);
    if (!hasKnownProfile) {
      Message.info(copy.auth.needsApp);
      setActiveStage('app');
      return;
    }
    setWorkingStep('auth');
    try {
      setProfileSelectionConfirmed(true);
      completingAuthForRef.current = null;
      const result = await ipcBridge.larkAutomation.startAuth.invoke({
        profileName,
        domain: DEFAULT_AUTH_DOMAIN,
      });
      setAuthResult(result);
      setSelectedProfileName(result.profileName || profileName);
      if (!result.verificationUrl && result.error) {
        Message.error(result.error);
      }
      const next = await ipcBridge.larkAutomation.selectProfile.invoke({ profileName });
      setStatus(next);
      await refreshProfiles();
    } finally {
      setWorkingStep(null);
    }
  }, [
    copy.auth.cliMissing,
    copy.auth.needsApp,
    copy.auth.needsWeb,
    copy.auth.profileRequired,
    profilesResult?.profiles,
    refreshProfiles,
    selectedProfileName,
    stageState.webReady,
    status,
  ]);

  const handleCompleteAuth = useCallback(
    async (deviceCode = authResult?.deviceCode) => {
      if (!deviceCode) return;
      setWorkingStep('complete-auth');
      try {
        const profileName = authResult?.profileName || selectedProfileName || status?.profileName;
        const result = await ipcBridge.larkAutomation.completeAuth.invoke({ deviceCode, profileName });
        const next = await refreshStatus();
        await refreshProfiles();
        onStatusChanged?.();
        if (result.ok || isRuntimeReady(next)) {
          const synced = await ipcBridge.larkAutomation.syncChannel.invoke({ profileName });
          setChannelResult(synced);
          if (synced.ok || synced.bindingReady) {
            Message.success(synced.message || copy.auth.ready);
          } else if (synced.error) {
            Message.warning(synced.error);
          } else {
            Message.success(copy.auth.ready);
          }
          setProfileSelectionConfirmed(true);
          setActiveStage('auth');
        } else if (result.error) {
          Message.error(result.error);
        }
      } finally {
        setWorkingStep(null);
      }
    },
    [authResult?.deviceCode, authResult?.profileName, copy.auth.ready, onStatusChanged, refreshProfiles, refreshStatus, selectedProfileName, status?.profileName]
  );

  useEffect(() => {
    const deviceCode = authResult?.deviceCode;
    if (!visible || activeStage !== 'auth' || stageState.authReady || !deviceCode) return;
    if (completingAuthForRef.current === deviceCode) return;
    completingAuthForRef.current = deviceCode;
    void handleCompleteAuth(deviceCode);
  }, [activeStage, authResult?.deviceCode, handleCompleteAuth, stageState.authReady, visible]);

  const handleRestartAuth = useCallback(() => {
    completingAuthForRef.current = null;
    setAuthResult(null);
    void handleStartAuth(selectedProfileName);
  }, [handleStartAuth, selectedProfileName]);

  const handleSelectProfile = useCallback(
    async (profileName: string) => {
      setWorkingStep('profile');
      try {
        void ipcBridge.nativeWebPanel.hide.invoke({ id: 'collaboration-auth' });
        completingAuthForRef.current = null;
        setAuthResult(null);
        setProfileSelectionConfirmed(false);
        setSelectedProfileName(profileName);
        const next = await ipcBridge.larkAutomation.selectProfile.invoke({ profileName });
        setStatus(next);
        await refreshProfiles();
        onStatusChanged?.();
      } finally {
        setWorkingStep(null);
      }
    },
    [onStatusChanged, refreshProfiles]
  );

  const handleStartConfig = useCallback(async () => {
    if (status && !status.cliInstalled) {
      Message.error(copy.auth.cliMissing);
      return;
    }
    setWorkingStep('config');
    try {
      const result = await ipcBridge.larkAutomation.startConfig.invoke();
      setConfigResult(result);
      if (result.profileName) {
        setSelectedProfileName(result.profileName);
      }
      if (!result.verificationUrl && result.error) {
        Message.error(result.error);
      }
      await refreshStatus();
      await refreshProfiles();
      onStatusChanged?.();
    } finally {
      setWorkingStep(null);
    }
  }, [copy.auth.cliMissing, onStatusChanged, refreshProfiles, refreshStatus, status]);

  const handleSyncChannel = useCallback(async () => {
    setWorkingStep('channel');
    try {
      const result = await ipcBridge.larkAutomation.syncChannel.invoke({
        profileName: selectedProfileName,
        appSecret: manualAppSecret.trim() || undefined,
      });
      setChannelResult(result);
      if (result.ok) {
        setManualAppSecret('');
        Message.success(copy.app.saved);
      } else if (result.manualSecretRequired) {
        Message.info(copy.app.secretNeeded);
      } else if (result.error && !result.manualSecretRequired) {
        Message.error(result.error);
      }
      const next = await refreshStatus();
      await refreshProfiles();
      if (result.ok || (next?.configReady && next.authenticated)) {
        setActiveStage('auth');
      }
      onStatusChanged?.();
    } finally {
      setWorkingStep(null);
    }
  }, [copy.app.saved, copy.app.secretNeeded, manualAppSecret, onStatusChanged, refreshProfiles, refreshStatus, selectedProfileName]);

  const allStagesReady = stageState.webReady && stageState.authReady && stageState.appReady;
  const statusHint = status?.taskAccessError || channelResult?.taskAccessError || copy.footerHint;
  const statusPanel = (
    <div className='border-t border-border-1 pt-14px flex flex-col gap-12px'>
      <div className='flex items-center gap-10px min-w-0'>
        <span
          className={`w-34px h-34px rd-50% flex-center shrink-0 border text-18px ${
            allStagesReady ? 'bg-green-50 border-green-200 text-green-600' : 'bg-bg-2 border-border-1 text-t-tertiary'
          }`}
        >
          <CollaborationIcon name={allStagesReady ? 'connected' : 'syncFeedback'} size={24} />
        </span>
        <div className='min-w-0'>
          <div className='text-14px font-650 text-t-primary'>{allStagesReady ? copy.connected : copy.waiting}</div>
          <div className='text-12px text-t-tertiary leading-18px'>{statusHint}</div>
        </div>
      </div>
      <Button
        type='primary'
        size='large'
        className='collaboration-light-primary h-42px text-15px font-650'
        disabled={!allStagesReady}
        onClick={handleClose}
      >
        {copy.confirm}
      </Button>
    </div>
  );

  return (
    <Modal
      visible={visible}
      title={null}
      onCancel={handleCancel}
      footer={null}
      className='collaboration-login-modal'
      style={{
        width: 'min(1320px, calc(100vw - 40px))',
        maxWidth: 'calc(100vw - 40px)',
        top: 0,
      }}
      maskClosable={false}
      unmountOnExit
    >
      <style>
        {`
          .collaboration-login-modal.arco-modal-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .collaboration-login-modal .arco-modal {
            top: 0 !important;
            margin: 0 !important;
            max-width: calc(100vw - 40px);
          }
          .collaboration-login-modal .arco-modal-content,
          .collaboration-login-modal .arco-modal-body {
            padding: 0;
            overflow: hidden;
          }
          .collaboration-login-modal .collaboration-wizard-header {
            padding-right: 58px;
          }
          .collaboration-login-modal .collaboration-wizard-tabs {
            min-width: 0;
            max-width: 100%;
            overflow: hidden;
          }
          .collaboration-login-modal .collaboration-wizard-tab {
            min-width: 0;
            max-width: 154px;
            flex: 0 1 auto;
          }
          .collaboration-login-modal .collaboration-wizard-tab-label {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .collaboration-login-modal .collaboration-floating-hint {
            max-width: min(440px, calc(100% - 560px));
          }
          .collaboration-login-modal .collaboration-modal-close {
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
          }
          .collaboration-login-modal .collaboration-floating-hint::before {
            content: '';
            position: absolute;
            inset: -1px;
            border-radius: 999px;
            background: linear-gradient(120deg, rgba(var(--primary-6), 0.18), rgba(22, 163, 74, 0.12), rgba(14, 165, 233, 0.14));
            pointer-events: none;
          }
          @media (max-width: 900px) {
            .collaboration-login-modal .collaboration-wizard-grid {
              grid-template-columns: minmax(0, 1fr) !important;
            }
            .collaboration-login-modal .collaboration-wizard-side {
              display: none;
            }
            .collaboration-login-modal .collaboration-floating-hint {
              display: none;
            }
          }
          @media (max-width: 620px) {
            .collaboration-login-modal .collaboration-wizard-header {
              padding-left: 10px;
              padding-right: 48px;
            }
            .collaboration-login-modal .collaboration-wizard-tab {
              max-width: 42px;
              padding-left: 8px;
              padding-right: 8px;
            }
            .collaboration-login-modal .collaboration-wizard-tab-label {
              display: none;
            }
          }
        `}
      </style>
      <div className='h-[min(780px,calc(100vh-40px))] max-h-[calc(100vh-40px)] overflow-hidden border border-border-1 rd-8px bg-bg-1 relative'>
        <button
          type='button'
          aria-label={copy.close}
          className='collaboration-modal-close absolute right-10px top-10px z-100 h-36px w-36px rd-50% border border-border-1 bg-bg-1/96 text-t-secondary flex-center transition-colors hover:bg-fill-2 hover:text-t-primary'
          onClick={handleCancel}
        >
          <CloseSmall theme='outline' size='22' />
        </button>
        <div className='collaboration-wizard-header absolute left-0 right-0 top-0 z-30 h-54px border-b border-border-1 bg-bg-1/95 backdrop-blur-[2px] pl-18px flex items-center'>
          <div className='collaboration-wizard-tabs flex items-center gap-8px'>
            {copy.stages.map((label, index) => {
              const stage = STAGE_ORDER[index];
              const ready =
                stage === 'web' ? stageState.webReady : stage === 'auth' ? stageState.authReady : stageState.appReady;
              const active = activeStage === stage;
              return (
                <button
                  key={stage}
                  type='button'
                  className={`collaboration-wizard-tab h-34px px-12px rd-8px border text-13px flex items-center gap-8px transition-colors ${
                    active
                      ? 'bg-fill-2 border-border-2 text-t-primary font-650'
                      : 'bg-bg-1 border-transparent text-t-secondary hover:bg-fill-1'
                  }`}
                  onClick={() => setActiveStage(stage)}
                >
                  <span
                    className={`w-26px h-26px rd-50% flex-center text-11px font-700 shrink-0 ${
                      ready ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-fill-2 text-t-secondary'
                    }`}
                  >
                    <CollaborationIcon name={ready ? 'connected' : STAGE_ICON_BY_STAGE[stage]} size={21} />
                  </span>
                  <span className='collaboration-wizard-tab-label'>{label}</span>
                </button>
              );
            })}
          </div>
          <div className='collaboration-floating-hint absolute right-58px top-7px h-40px rd-999px bg-bg-1/92 shadow-sm backdrop-blur-[6px] overflow-hidden'>
            <div className='relative z-1 h-full flex items-center gap-9px px-13px'>
              <span className='size-26px rd-50% flex-center shrink-0 bg-green-50 border border-green-200 text-green-600'>
                <CollaborationIcon name='connected' size={21} />
              </span>
              <div className='min-w-0'>
                <div className='text-16px font-800 text-t-primary leading-22px truncate'>{copy.floatingHintTitle}</div>
              </div>
            </div>
          </div>
        </div>

        <div className='absolute inset-0 min-h-0 flex flex-col'>
          <div className='h-54px shrink-0' />
          <div className='flex-1 min-h-0 relative'>
            {activeStage === 'web' && (
              <div className='collaboration-wizard-grid size-full min-h-0 grid grid-cols-[360px_minmax(0,1fr)]'>
                <WizardSide
                  title={copy.web.title}
                  subtitle={copy.web.subtitle}
                  steps={copy.web.steps}
                  status={statusPanel}
                  icon='webLogin'
                />
                <WebStagePanel
                  loginUrl={loginUrl}
                  lastNavigatedUrl={lastNavigatedUrl}
                  loadingLabel={copy.web.loading}
                  onDidNavigate={handleWebNavigation}
                />
              </div>
            )}

            {activeStage === 'auth' && (
              <div className='collaboration-wizard-grid size-full min-h-0 grid grid-cols-[360px_minmax(0,1fr)]'>
                <WizardSide
                  title={copy.auth.title}
                  subtitle={copy.auth.subtitle}
                  steps={copy.auth.steps}
                  icon='auth'
                />
                <AuthorizationWebPanel
                  url={authResult?.verificationUrl}
                  ready={stageState.authReady}
                  webReady={stageState.webReady}
                  appReady={Boolean(status?.configReady)}
                  profilesResult={profilesResult}
                  selectedProfileName={selectedProfileName}
                  profileSelectionConfirmed={profileSelectionConfirmed}
                  appId={status?.appId}
                  profileName={status?.profileName}
                  opening={workingStep === 'auth'}
                  selecting={workingStep === 'profile'}
                  verifying={workingStep === 'complete-auth'}
                  title={copy.auth.title}
                  body={copy.auth.subtitle}
                  readyText={copy.auth.ready}
                  needsWebTitle={copy.auth.needsWeb}
                  needsWebBody={copy.auth.needsWebDesc}
                  needsAppTitle={copy.auth.needsApp}
                  needsAppBody={copy.auth.needsAppDesc}
                  goWebLabel={copy.auth.goWeb}
                  goAppLabel={copy.auth.goApp}
                  openingText={copy.auth.opening}
                  verifyingText={copy.auth.verifying}
                  retryLabel={copy.auth.retry}
                  targetAppLabel={copy.auth.targetApp}
                  profileLabel={copy.auth.profile}
                  chooseProfileTitle={copy.auth.chooseProfileTitle}
                  chooseProfileDesc={copy.auth.chooseProfileDesc}
                  noProfilesText={copy.auth.noProfiles}
                  refreshProfilesLabel={copy.auth.refreshProfiles}
                  authorizeSelectedLabel={copy.auth.authorizeSelected}
                  selectedProfileLabel={copy.auth.selectedProfile}
                  activeProfileLabel={copy.auth.activeProfile}
                  userLabel={copy.auth.user}
                  tokenStatusLabel={copy.auth.tokenStatus}
                  loadingLabel={copy.auth.opening}
                  onGoWeb={() => setActiveStage('web')}
                  onGoApp={() => setActiveStage('app')}
                  onRestart={handleRestartAuth}
                  onRefreshProfiles={refreshProfiles}
                  onSelectProfile={handleSelectProfile}
                  onAuthorizeProfile={handleStartAuth}
                />
              </div>
            )}

            {activeStage === 'app' && (
              <div className='collaboration-wizard-grid size-full min-h-0 grid grid-cols-[360px_minmax(0,1fr)]'>
                <WizardSide
                  title={copy.app.title}
                  subtitle={copy.app.subtitle}
                  steps={copy.app.steps}
                  icon='createApp'
                />
                <AppSetupPanel
                  copy={copy.app}
                  appName={APP_DISPLAY_NAME}
                  appId={status?.appId}
                  cliMissing={status?.cliInstalled === false}
                  configReady={Boolean(status?.configReady)}
                  channelResult={channelResult}
                  configUrl={configResult?.verificationUrl}
                  manualAppSecret={manualAppSecret}
                  workingStep={workingStep}
                  onManualAppSecretChange={setManualAppSecret}
                  onStartConfig={handleStartConfig}
                  onSyncChannel={handleSyncChannel}
                />
              </div>
            )}
            {loading && activeStage !== 'web' && (
              <div className='absolute inset-0 z-20 bg-bg-1/70 backdrop-blur-[1px] flex-center'>
                <Spin loading />
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

const WizardSide: React.FC<{
  title: string;
  subtitle: string;
  steps: string[];
  icon: CollaborationIconName;
  status?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, subtitle, steps, icon, status, children }) => (
  <div className='collaboration-wizard-side border-r border-border-1 bg-bg-1 p-24px flex flex-col justify-between gap-20px'>
    <div className='flex flex-col gap-22px'>
      <div>
        <div className='mb-12px size-72px flex-center'>
          <CollaborationIcon name={icon} size={60} />
        </div>
        <div className='text-36px font-800 text-t-primary tracking-normal leading-42px'>{title}</div>
        <div className='text-14px text-t-secondary leading-22px mt-8px'>{subtitle}</div>
      </div>
      {steps.map((step, index) => (
        <div key={step} className='flex gap-12px items-center'>
          <span className='w-34px h-34px flex-center shrink-0 text-t-primary'>
            <CollaborationIcon name={index === 0 ? icon : index === 1 ? 'syncFeedback' : 'connected'} size={28} />
          </span>
          <div className='text-16px text-t-primary leading-24px font-600'>{step}</div>
        </div>
      ))}
    </div>
    {children || status ? (
      <div className='flex flex-col gap-14px'>
        {children ? <div className='flex flex-col gap-10px'>{children}</div> : null}
        {status}
      </div>
    ) : null}
  </div>
);

const WebStagePanel: React.FC<{
  loginUrl: string;
  lastNavigatedUrl: string;
  loadingLabel: string;
  onDidNavigate: (url: string) => void;
}> = ({ loginUrl, lastNavigatedUrl, loadingLabel, onDidNavigate }) => (
  <div className='relative min-w-0 min-h-0 bg-bg-1 overflow-hidden'>
    <NativeWebPanelHost
      key={`feishu-login-${loginUrl}`}
      id='collaboration-login'
      url={isFeishuLoginUrl(lastNavigatedUrl) ? lastNavigatedUrl : loginUrl}
      partition={COLLABORATION_PARTITION}
      userAgent={FEISHU_DESKTOP_USER_AGENT}
      loadingLabel={loadingLabel}
      onDidNavigate={onDidNavigate}
    />
  </div>
);

const AuthorizationWebPanel: React.FC<{
  url?: string;
  ready: boolean;
  webReady: boolean;
  appReady: boolean;
  profilesResult: ILarkAutomationProfilesResult | null;
  selectedProfileName?: string;
  profileSelectionConfirmed: boolean;
  appId?: string;
  profileName?: string;
  opening: boolean;
  selecting: boolean;
  verifying: boolean;
  title: string;
  body: string;
  readyText: string;
  needsWebTitle: string;
  needsWebBody: string;
  needsAppTitle: string;
  needsAppBody: string;
  goWebLabel: string;
  goAppLabel: string;
  openingText: string;
  verifyingText: string;
  retryLabel: string;
  targetAppLabel: string;
  profileLabel: string;
  chooseProfileTitle: string;
  chooseProfileDesc: string;
  noProfilesText: string;
  refreshProfilesLabel: string;
  authorizeSelectedLabel: string;
  selectedProfileLabel: string;
  activeProfileLabel: string;
  userLabel: string;
  tokenStatusLabel: string;
  loadingLabel: string;
  onGoWeb: () => void;
  onGoApp: () => void;
  onRestart: () => void;
  onRefreshProfiles: () => Promise<ILarkAutomationProfilesResult>;
  onSelectProfile: (profileName: string) => void;
  onAuthorizeProfile: (profileName: string) => void;
}> = ({
  url,
  ready,
  webReady,
  appReady,
  profilesResult,
  selectedProfileName,
  profileSelectionConfirmed,
  appId,
  profileName,
  opening,
  selecting,
  verifying,
  title,
  body,
  readyText,
  needsWebTitle,
  needsWebBody,
  needsAppTitle,
  needsAppBody,
  goWebLabel,
  goAppLabel,
  openingText,
  verifyingText,
  retryLabel,
  targetAppLabel,
  profileLabel,
  chooseProfileTitle,
  chooseProfileDesc,
  noProfilesText,
  refreshProfilesLabel,
  authorizeSelectedLabel,
  selectedProfileLabel,
  activeProfileLabel,
  userLabel,
  tokenStatusLabel,
  loadingLabel,
  onGoWeb,
  onGoApp,
  onRestart,
  onRefreshProfiles,
  onSelectProfile,
  onAuthorizeProfile,
}) => {
  const selectedProfile = profilesResult?.profiles.find((profile) => profile.name === selectedProfileName);
  const targetAppId = selectedProfile?.appId || appId;
  const targetAppName = selectedProfile?.appName;
  const targetProfileName = selectedProfileName || profileName;

  if (!webReady) {
    return (
      <PrerequisitePanel
        title={needsWebTitle}
        body={needsWebBody}
        actionLabel={goWebLabel}
        loading={false}
        onAction={onGoWeb}
      />
    );
  }

  const hasProfiles = Boolean(profilesResult?.profiles.length);
  if (!appReady && !hasProfiles) {
    return (
      <PrerequisitePanel
        title={needsAppTitle}
        body={needsAppBody}
        actionLabel={goAppLabel}
        loading={false}
        onAction={onGoApp}
      />
    );
  }

  if (ready && profileSelectionConfirmed) {
    return (
      <div className='min-w-0 min-h-0 bg-bg-1 flex-center p-28px'>
        <div className='w-full max-w-520px text-center'>
          <div className='mx-auto size-68px flex-center text-green-600'>
            <CollaborationIcon name='connected' size={58} />
          </div>
          <div className='mt-16px text-22px font-700 text-t-primary'>{title}</div>
          <div className='mt-8px text-14px text-t-secondary leading-22px'>{readyText}</div>
        </div>
      </div>
    );
  }

  if (!url || !profileSelectionConfirmed) {
    return (
      <ProfileSelectionPanel
        title={chooseProfileTitle}
        body={chooseProfileDesc}
        noProfilesText={noProfilesText}
        refreshProfilesLabel={refreshProfilesLabel}
        authorizeSelectedLabel={authorizeSelectedLabel}
        selectedProfileLabel={selectedProfileLabel}
        activeProfileLabel={activeProfileLabel}
        userLabel={userLabel}
        tokenStatusLabel={tokenStatusLabel}
        profileLabel={profileLabel}
        targetAppLabel={targetAppLabel}
        openingText={openingText}
        appId={targetAppId}
        appName={targetAppName}
        profileName={targetProfileName}
        profiles={profilesResult?.profiles ?? []}
        selectedProfileName={selectedProfileName}
        loading={opening || selecting}
        onRefreshProfiles={onRefreshProfiles}
        onSelectProfile={onSelectProfile}
        onAuthorizeProfile={onAuthorizeProfile}
      />
    );
  }

  return (
    <div className='relative min-w-0 min-h-0 bg-bg-1 overflow-hidden'>
      <NativeWebPanelHost
        key={`collaboration-auth-${url}`}
        id='collaboration-auth'
        url={url}
        partition={COLLABORATION_PARTITION}
        userAgent={FEISHU_DESKTOP_USER_AGENT}
        loadingLabel={loadingLabel}
      />
      <div className='absolute left-14px right-14px top-14px z-10 pointer-events-none'>
        <div className='pointer-events-auto inline-flex max-w-full items-center gap-10px rd-8px border border-border-1 bg-bg-1/94 px-12px py-10px shadow-sm'>
          <span
            className={`size-28px rd-50% flex-center shrink-0 border ${
              verifying ? 'bg-green-50 border-green-200 text-green-600' : 'bg-fill-2 border-border-1 text-t-secondary'
            }`}
          >
            <CollaborationIcon name={verifying ? 'connected' : 'auth'} size={21} />
          </span>
          <div className='min-w-0'>
            <div className='text-13px font-650 text-t-primary truncate'>{verifying ? verifyingText : body}</div>
            {targetAppId || targetProfileName || targetAppName ? (
              <div className='mt-2px text-11px text-t-tertiary truncate'>
                {targetAppLabel}: {targetAppName || targetAppId || 'OpenScience'}
                {targetProfileName ? ` · ${profileLabel}: ${targetProfileName}` : ''}
              </div>
            ) : null}
          </div>
          <Button size='small' type='secondary' loading={opening} onClick={onRestart}>
            {retryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

const AuthorizationTargetInfo: React.FC<{
  appId?: string;
  appName?: string;
  profileName?: string;
  targetAppLabel: string;
  profileLabel: string;
}> = ({ appId, appName, profileName, targetAppLabel, profileLabel }) => {
  if (!appId && !appName && !profileName) return null;
  return (
    <div className='mt-16px rd-8px border border-border-1 bg-fill-1 px-14px py-11px text-left'>
      <div className='text-12px text-t-tertiary'>{targetAppLabel}</div>
      <div className='mt-4px text-14px font-650 text-t-primary truncate'>
        {appName || appId || 'OpenScience'}
      </div>
      {appName && appId ? <div className='mt-4px text-12px text-t-tertiary truncate'>App ID: {appId}</div> : null}
      {profileName ? (
        <div className='mt-5px text-12px text-t-secondary truncate'>
          {profileLabel}: {profileName}
        </div>
      ) : null}
    </div>
  );
};

const ProfileSelectionPanel: React.FC<{
  title: string;
  body: string;
  noProfilesText: string;
  refreshProfilesLabel: string;
  authorizeSelectedLabel: string;
  selectedProfileLabel: string;
  activeProfileLabel: string;
  userLabel: string;
  tokenStatusLabel: string;
  profileLabel: string;
  targetAppLabel: string;
  openingText: string;
  appId?: string;
  appName?: string;
  profileName?: string;
  profiles: ILarkAutomationProfile[];
  selectedProfileName?: string;
  loading: boolean;
  onRefreshProfiles: () => Promise<ILarkAutomationProfilesResult>;
  onSelectProfile: (profileName: string) => void;
  onAuthorizeProfile: (profileName: string) => void;
}> = ({
  title,
  body,
  noProfilesText,
  refreshProfilesLabel,
  authorizeSelectedLabel,
  selectedProfileLabel,
  activeProfileLabel,
  userLabel,
  tokenStatusLabel,
  profileLabel,
  targetAppLabel,
  openingText,
  appId,
  appName,
  profileName,
  profiles,
  selectedProfileName,
  loading,
  onRefreshProfiles,
  onSelectProfile,
  onAuthorizeProfile,
}) => {
  const selectedProfile = profiles.find((profile) => profile.name === selectedProfileName);
  const canAuthorize = Boolean(selectedProfileName);

  return (
    <div className='min-w-0 min-h-0 bg-fill-1 p-28px overflow-auto'>
      <div className='mx-auto flex h-full max-w-760px flex-col justify-center'>
        <div className='rd-8px border border-border-1 bg-bg-1 p-24px shadow-sm'>
          <div className='flex items-start justify-between gap-16px'>
            <div className='min-w-0'>
              <div className='text-30px font-800 text-t-primary tracking-normal leading-36px'>{title}</div>
              <div className='mt-8px text-14px text-t-secondary leading-22px'>{body}</div>
            </div>
            <Button
              type='secondary'
              icon={<CollaborationIcon name='refreshSync' size={20} spin={loading} />}
              loading={loading}
              onClick={() => void onRefreshProfiles()}
            >
              {refreshProfilesLabel}
            </Button>
          </div>

          <AuthorizationTargetInfo
            appId={selectedProfile?.appId || appId}
            appName={selectedProfile?.appName || appName}
            profileName={selectedProfileName || profileName}
            targetAppLabel={targetAppLabel}
            profileLabel={profileLabel}
          />

          <div className='mt-18px flex flex-col gap-10px'>
            {profiles.length === 0 ? (
              <div className='rd-8px border border-dashed border-border-2 bg-fill-1 px-16px py-18px text-center text-14px text-t-secondary'>
                {noProfilesText}
              </div>
            ) : (
              profiles.map((profile) => {
                const selected = profile.name === selectedProfileName;
                const title = profile.appName || profile.name;
                const subtitle = profile.appName ? profile.name : undefined;
                return (
                  <button
                    key={profile.name}
                    type='button'
                    className={`w-full rd-8px border p-14px text-left transition-colors ${
                      selected
                        ? 'border-primary-6 bg-primary-1 text-t-primary shadow-sm'
                        : 'border-border-1 bg-bg-2 text-t-primary hover:border-border-2 hover:bg-bg-1'
                    }`}
                    onClick={() => onSelectProfile(profile.name)}
                  >
                    <div className='flex items-center justify-between gap-12px'>
                      <div className='min-w-0 flex items-start gap-12px'>
                        <span className='mt-1px size-42px rd-8px flex-center shrink-0 overflow-hidden border border-border-1 bg-bg-1 text-t-tertiary'>
                          {profile.avatarUrl ? (
                            <img src={profile.avatarUrl} alt='' className='size-full object-cover' />
                          ) : (
                            <CollaborationIcon name='profileSelect' size={30} />
                          )}
                        </span>
                        <div className='min-w-0'>
                        <div className='flex items-center gap-8px min-w-0'>
                          <span className='truncate text-16px font-750'>{title}</span>
                          {selected ? (
                            <span className='shrink-0 rd-999px bg-green-50 px-8px py-2px text-11px font-650 text-green-700'>
                              {selectedProfileLabel}
                            </span>
                          ) : null}
                          {profile.active ? (
                            <span className='shrink-0 rd-999px bg-fill-2 px-8px py-2px text-11px font-650 text-t-secondary'>
                              {activeProfileLabel}
                            </span>
                          ) : null}
                        </div>
                        {subtitle ? <div className='mt-4px text-12px text-t-tertiary truncate'>{subtitle}</div> : null}
                        {profile.description ? (
                          <div className='mt-5px text-12px text-t-secondary leading-18px line-clamp-2'>
                            {profile.description}
                          </div>
                        ) : null}
                        <div className='mt-6px flex flex-wrap gap-x-14px gap-y-4px text-12px text-t-secondary'>
                          {profile.appId ? <span>App ID: {profile.appId}</span> : null}
                          {profile.primaryLanguage ? <span>{profile.primaryLanguage}</span> : null}
                          {profile.ownerName ? <span>Owner: {profile.ownerName}</span> : null}
                          {profile.user ? (
                            <span>
                              {userLabel}: {profile.user}
                            </span>
                          ) : null}
                          {profile.tokenStatus ? (
                            <span>
                              {tokenStatusLabel}: {profile.tokenStatus}
                            </span>
                          ) : null}
                          {profile.appInfoError ? <span>{profile.appInfoError}</span> : null}
                        </div>
                        </div>
                      </div>
                      <span
                        className={`size-26px rd-50% flex-center shrink-0 border ${
                          selected
                            ? 'bg-green-50 border-green-200 text-green-600'
                            : 'bg-bg-1 border-border-1 text-t-tertiary'
                        }`}
                      >
                        <CollaborationIcon name={selected ? 'connected' : 'profileSelect'} size={21} />
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <Button
            className='collaboration-light-primary mt-20px h-54px w-full text-16px font-800'
            size='large'
            type='primary'
            icon={loading ? undefined : <CollaborationIcon name='auth' size={20} />}
            loading={loading}
            disabled={!canAuthorize}
            onClick={() => selectedProfileName && onAuthorizeProfile(selectedProfileName)}
          >
            {loading ? openingText : authorizeSelectedLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

const PrerequisitePanel: React.FC<{
  title: string;
  body: string;
  actionLabel: string;
  loading: boolean;
  onAction: () => void;
}> = ({ title, body, actionLabel, loading, onAction }) => (
  <div className='min-w-0 min-h-0 bg-fill-1 flex-center p-28px'>
    <div className='w-full max-w-560px rd-8px border border-border-1 bg-bg-1 p-28px text-center shadow-sm'>
      <div className='mx-auto size-68px flex-center text-t-secondary'>
        <CollaborationIcon name='planGate' size={58} />
      </div>
      <div className='mt-18px text-24px font-750 text-t-primary tracking-normal'>{title}</div>
      <div className='mt-10px text-14px text-t-secondary leading-22px'>{body}</div>
      <Button
        className='collaboration-light-primary mt-24px w-240px h-52px text-16px font-700'
        size='large'
        type='primary'
        loading={loading}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  </div>
);

interface AppSetupCopy {
  appName: string;
  appNameHint: string;
  setupHint: string;
  create: string;
  sync: string;
  appId: string;
  notReady: string;
  secretTitle: string;
  secretDesc: string;
  saveSecret: string;
  saved: string;
  secretNeeded: string;
  linkTitle: string;
  webLoading: string;
  embeddedHint: string;
  currentApp: string;
  createPanelTitle: string;
  createPanelDesc: string;
}

const AppSetupPanel: React.FC<{
  copy: AppSetupCopy;
  appName: string;
  appId?: string;
  cliMissing: boolean;
  configReady: boolean;
  channelResult: ILarkAutomationChannelSyncResult | null;
  configUrl?: string;
  manualAppSecret: string;
  workingStep: string | null;
  onManualAppSecretChange: (value: string) => void;
  onStartConfig: () => void;
  onSyncChannel: () => void;
}> = ({
  copy,
  appName,
  appId,
  cliMissing,
  configReady,
  channelResult,
  configUrl,
  manualAppSecret,
  workingStep,
  onManualAppSecretChange,
  onStartConfig,
  onSyncChannel,
}) => {
  if (configUrl) {
    return (
      <div className='relative min-w-0 min-h-0 bg-bg-1 overflow-hidden'>
        <NativeWebPanelHost
          key={`collaboration-app-setup-${configUrl}`}
          id='collaboration-app-setup'
          url={configUrl}
          partition={COLLABORATION_PARTITION}
          userAgent={FEISHU_DESKTOP_USER_AGENT}
          loadingLabel={copy.webLoading}
        />
        <div className='absolute left-14px right-14px top-14px z-10 pointer-events-none'>
          <div className='pointer-events-auto inline-flex max-w-full items-center gap-10px rd-8px border border-border-1 bg-bg-1/94 px-12px py-10px shadow-sm'>
            <span className='size-28px rd-50% flex-center shrink-0 bg-fill-2 border border-border-1 text-t-secondary'>
              <CollaborationIcon name='createApp' size={21} />
            </span>
            <div className='min-w-0'>
              <div className='text-13px font-650 text-t-primary truncate'>
                {copy.appName}: {appName}
              </div>
              <div className='mt-2px text-12px text-t-tertiary truncate'>
                {appId ? `${copy.appId}: ${appId}` : copy.setupHint}
              </div>
            </div>
            <Button
              size='small'
              type='secondary'
              icon={<CollaborationIcon name='createApp' size={20} />}
              loading={workingStep === 'config'}
              onClick={onStartConfig}
            >
              {copy.create}
            </Button>
            {configReady && (
              <Button
                size='small'
                icon={<CollaborationIcon name='channelSave' size={20} />}
                loading={workingStep === 'channel'}
                onClick={onSyncChannel}
              >
                {channelResult?.ok ? copy.saved : copy.sync}
              </Button>
            )}
          </div>
        </div>
        {channelResult?.manualSecretRequired && (
          <div className='absolute left-14px right-14px bottom-14px z-10 rd-8px border border-border-1 bg-bg-1/96 p-14px shadow-sm'>
            <div className='text-14px font-650 text-t-primary flex items-center gap-7px'>
              <CollaborationIcon name='secretKey' size={19} />
              {copy.secretTitle}
            </div>
            <div className='mt-6px text-12px text-t-secondary leading-20px'>{copy.secretDesc}</div>
            <div className='mt-10px flex gap-8px'>
              <Input.Password
                value={manualAppSecret}
                onChange={onManualAppSecretChange}
                placeholder='App Secret'
                visibilityToggle
              />
              <Button
                type='primary'
                className='collaboration-light-primary'
                icon={<CollaborationIcon name='channelSave' size={20} />}
                loading={workingStep === 'channel'}
                disabled={!manualAppSecret.trim()}
                onClick={onSyncChannel}
              >
                {copy.saveSecret}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className='min-w-0 min-h-0 bg-fill-1 flex-center p-28px'>
      <div className='w-full max-w-560px rd-8px border border-border-1 bg-bg-1 p-28px text-center shadow-sm'>
        <div className='mx-auto size-74px flex-center text-t-secondary'>
          <CollaborationIcon name='createApp' size={62} />
        </div>
        <div className='mt-18px text-34px font-800 text-t-primary tracking-normal'>{copy.createPanelTitle}</div>
        <div className='mt-10px text-14px text-t-secondary leading-22px'>{copy.createPanelDesc}</div>
        <div className='mt-16px grid grid-cols-2 gap-10px text-left'>
          <div className='rd-8px border border-border-1 bg-bg-2 p-12px'>
            <div className='text-12px text-t-tertiary'>{copy.appName}</div>
            <div className='mt-6px text-14px font-650 text-t-primary truncate'>{appName}</div>
          </div>
          <div className='rd-8px border border-border-1 bg-bg-2 p-12px'>
            <div className='text-12px text-t-tertiary'>{appId ? copy.currentApp : copy.appId}</div>
            <div className='mt-6px text-14px font-650 text-t-primary truncate'>{appId || copy.notReady}</div>
          </div>
        </div>
        <div className='mt-14px text-14px text-t-secondary leading-22px'>{copy.setupHint}</div>

        <Button
          className='collaboration-light-primary mt-24px w-320px max-w-full h-60px text-18px font-800'
          size='large'
          type='primary'
          icon={<CollaborationIcon name='createApp' size={22} />}
          loading={workingStep === 'config'}
          disabled={cliMissing}
          onClick={onStartConfig}
        >
          {copy.create}
        </Button>

        {configReady && (
          <Button
            className='mt-12px w-260px h-48px text-15px font-650'
            size='large'
            icon={<CollaborationIcon name='channelSave' size={20} />}
            loading={workingStep === 'channel'}
            onClick={onSyncChannel}
          >
            {channelResult?.ok ? copy.saved : copy.sync}
          </Button>
        )}

        {channelResult?.manualSecretRequired && (
          <div className='mt-18px border border-border-1 rd-8px bg-bg-2 p-14px text-left'>
            <div className='text-14px font-650 text-t-primary flex items-center gap-7px'>
              <CollaborationIcon name='secretKey' size={19} />
              {copy.secretTitle}
            </div>
            <div className='mt-6px text-12px text-t-secondary leading-20px'>{copy.secretDesc}</div>
            <div className='mt-10px flex gap-8px'>
              <Input.Password
                value={manualAppSecret}
                onChange={onManualAppSecretChange}
                placeholder='App Secret'
                visibilityToggle
              />
              <Button
                type='primary'
                className='collaboration-light-primary'
                icon={<CollaborationIcon name='channelSave' size={20} />}
                loading={workingStep === 'channel'}
                disabled={!manualAppSecret.trim()}
                onClick={onSyncChannel}
              >
                {copy.saveSecret}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeishuConnectionWizardModal;
