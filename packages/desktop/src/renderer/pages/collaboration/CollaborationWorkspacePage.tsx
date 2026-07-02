/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLoadingState from '@/renderer/components/layout/PageLoadingState';
import { useTranslation } from 'react-i18next';
import {
  COLLABORATION_CONNECTED_STORAGE_KEY,
  COLLABORATION_MODULES,
  getCollaborationModule,
} from './collaborationConfig';
import FeishuConnectionWizardModal from './FeishuConnectionWizardModal';
import {
  getCollaborationLoginModalVisible,
  getCollaborationWebState,
  setCollaborationLoginModalVisible,
  subscribeCollaborationLoginModalVisible,
  subscribeCollaborationWebState,
} from './collaborationWebState';

const CollaborationWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const { moduleId } = useParams<{ moduleId: string }>();
  const { t } = useTranslation();
  const activeModule = useMemo(() => getCollaborationModule(moduleId), [moduleId]);
  const [loginVisible, setLoginVisible] = useState(getCollaborationLoginModalVisible);
  const [activeState, setActiveState] = useState(() => getCollaborationWebState(activeModule.id));

  useEffect(() => {
    if (moduleId && !COLLABORATION_MODULES.some((module) => module.id === moduleId)) {
      navigate('/collaboration/messages', { replace: true });
    }
  }, [moduleId, navigate]);

  useEffect(() => {
    setActiveState(getCollaborationWebState(activeModule.id));
    return subscribeCollaborationWebState((state) => {
      if (state.moduleId === activeModule.id) {
        setActiveState(state);
      }
    });
  }, [activeModule.id]);

  useEffect(() => subscribeCollaborationLoginModalVisible(setLoginVisible), []);

  const markConnected = useCallback(() => {
    localStorage.setItem(COLLABORATION_CONNECTED_STORAGE_KEY, 'true');
    setCollaborationLoginModalVisible(false);
  }, []);

  const handleCloseLogin = () => {
    setCollaborationLoginModalVisible(false);
  };

  const handleCancelLogin = () => {
    setCollaborationLoginModalVisible(false);
    void navigate('/guid', { replace: true });
  };

  const showLoading = !activeState?.ready;

  return (
    <div className='pointer-events-none relative size-full min-w-0 min-h-0 bg-transparent'>
      {showLoading ? <PageLoadingState label={t('common.collaboration.loadingPage')} className='z-3' /> : null}
      {loginVisible ? <div className='pointer-events-auto absolute inset-0 z-4 bg-bg-1' /> : null}
      <FeishuConnectionWizardModal
        visible={loginVisible}
        loginUrl={activeModule.url}
        onClose={handleCloseLogin}
        onCancel={handleCancelLogin}
        onWebConnected={markConnected}
      />
    </div>
  );
};

export default CollaborationWorkspacePage;
