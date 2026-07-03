/**
 * @license
 * Copyright 2026 OpenScience
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  DEFAULT_BETA_TESTING_CONFIG,
  normalizeBetaTestingConfig,
  type BetaTestingConfig,
} from '@/common/config/betaTesting';
import { configService } from '@/common/config/configService';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import CollaborationIcon from '@/renderer/components/icons/CollaborationIcon';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { Alert, Button, Message, Switch, Tag } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type StatusState = 'idle' | 'ready' | 'warning' | 'error';

const BetaTestingSettings: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [config, setConfig] = useState<Required<BetaTestingConfig>>(() =>
    normalizeBetaTestingConfig(configService.get('features.betaTesting'))
  );
  const [automationStatus, setAutomationStatus] = useState<StatusState>('idle');
  const [projectAgentStatus, setProjectAgentStatus] = useState<StatusState>('idle');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setConfig(normalizeBetaTestingConfig(configService.get('features.betaTesting')));
  }, []);

  const updateConfig = useCallback((updater: (current: Required<BetaTestingConfig>) => Required<BetaTestingConfig>) => {
    setConfig((current) => {
      const next = normalizeBetaTestingConfig(updater(current));
      configService.set('features.betaTesting', next).catch((error) => {
        console.error('Failed to save beta testing config:', error);
        Message.error('Failed to save settings');
      });
      return next;
    });
  }, []);

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    try {
      const [automation, projectAgent] = await Promise.all([
        ipcBridge.larkAutomation.getStatus.invoke().catch((): null => null),
        ipcBridge.larkProjectAgent.getSettings.invoke().catch((): null => null),
      ]);
      setAutomationStatus(
        automation?.cliInstalled && automation.configReady && automation.authenticated ? 'ready' : 'warning'
      );
      setProjectAgentStatus(projectAgent?.promptFiles?.length ? 'ready' : 'warning');
    } catch {
      setAutomationStatus('error');
      setProjectAgentStatus('error');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const betaEnabled = config.enabled;
  const leaderAgentEnabled = betaEnabled && config.leaderAgentEnabled !== false;

  return (
    <SettingsPageWrapper contentClassName='max-w-940px'>
      <div className='w-full flex flex-col gap-18px'>
        <div className='flex items-start justify-between gap-16px'>
          <div className='min-w-0'>
            <div className='flex items-center gap-10px'>
              <span className='size-34px flex-center rounded-10px bg-fill-2 text-t-primary'>
                <OpenScienceIcon name='settingsMotion' size={22} visualScale={1.05} />
              </span>
              <h1 className='m-0 text-22px font-650 text-t-primary'>{t('settings.betaTesting.title')}</h1>
            </div>
            <p className='m-0 mt-8px text-14px text-t-secondary leading-22px max-w-720px'>
              {t('settings.betaTesting.description')}
            </p>
          </div>
          <Switch
            checked={betaEnabled}
            onChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                enabled: checked,
                leaderAgentEnabled: current.leaderAgentEnabled ?? DEFAULT_BETA_TESTING_CONFIG.leaderAgentEnabled,
              }))
            }
          />
        </div>

        <Alert
          type={betaEnabled ? 'success' : 'info'}
          content={
            betaEnabled ? t('settings.betaTesting.enabledHint') : t('settings.betaTesting.disabledHint')
          }
        />

        <section className='border border-border-1 rd-10px bg-bg-2 p-18px flex flex-col gap-16px'>
          <div className='flex items-start justify-between gap-14px'>
            <div className='flex items-start gap-12px min-w-0'>
              <span className='size-40px flex-center rounded-12px bg-bg-1 border border-border-1 shrink-0'>
                <CollaborationIcon name='humanMember' size={26} />
              </span>
              <div className='min-w-0'>
                <div className='flex items-center gap-8px flex-wrap'>
                  <h2 className='m-0 text-17px font-700 text-t-primary'>
                    {t('settings.betaTesting.leaderAgentTitle')}
                  </h2>
                  <Tag size='small'>{t('settings.betaTesting.experimental')}</Tag>
                </div>
                <p className='m-0 mt-6px text-13px text-t-secondary leading-21px max-w-720px'>
                  {t('settings.betaTesting.leaderAgentDesc')}
                </p>
              </div>
            </div>
            <Switch
              checked={leaderAgentEnabled}
              disabled={!betaEnabled}
              onChange={(checked) => updateConfig((current) => ({ ...current, leaderAgentEnabled: checked }))}
            />
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-10px'>
            <StatusCard
              label={t('settings.betaTesting.projectAgentRuntime')}
              value={statusText(projectAgentStatus, t)}
              state={projectAgentStatus}
            />
            <StatusCard
              label={t('settings.betaTesting.larkAutomationRuntime')}
              value={statusText(automationStatus, t)}
              state={automationStatus}
            />
          </div>

          <div className='flex items-center gap-10px flex-wrap'>
            <Button
              type='primary'
              disabled={!leaderAgentEnabled}
              icon={<CollaborationIcon name='message' size={18} />}
              onClick={() => void navigate('/lark-projects/agent')}
            >
              {t('settings.betaTesting.openProjects')}
            </Button>
            <Button onClick={() => void navigate('/settings/lark-automation')}>
              {t('settings.betaTesting.openAutomationSettings')}
            </Button>
            <Button loading={checking} onClick={() => void refreshStatus()}>
              {t('common.refresh')}
            </Button>
          </div>
        </section>
      </div>
    </SettingsPageWrapper>
  );
};

const statusText = (state: StatusState, t: ReturnType<typeof useTranslation>['t']) => {
  if (state === 'ready') return t('settings.betaTesting.statusReady');
  if (state === 'warning') return t('settings.betaTesting.statusNeedsSetup');
  if (state === 'error') return t('settings.betaTesting.statusError');
  return t('settings.betaTesting.statusChecking');
};

const StatusCard: React.FC<{ label: string; value: string; state: StatusState }> = ({ label, value, state }) => (
  <div className='rounded-9px border border-border-1 bg-bg-1 px-14px py-12px flex items-center justify-between gap-12px'>
    <span className='text-12px font-600 text-t-secondary'>{label}</span>
    <Tag color={state === 'ready' ? 'green' : state === 'error' ? 'red' : 'gray'}>{value}</Tag>
  </div>
);

export default BetaTestingSettings;
