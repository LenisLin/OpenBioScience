import React, { Suspense, useEffect, useRef } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { isLeaderAgentBetaEnabled } from '@/common/config/betaTesting';
import { Button, Notification, Result } from '@arco-design/web-react';
import AppLoader from '@renderer/components/layout/AppLoader';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useConfig } from '@renderer/hooks/config/useConfig';
import ScheduledTasksErrorBoundary from '@renderer/pages/cron/ScheduledTasksPage/ScheduledTasksErrorBoundary';
import { shouldShowOnboarding } from '@renderer/pages/onboarding/onboardingState';
import { APP_DISPLAY_NAME } from '@/renderer/utils/brand';
import i18n from '@/renderer/services/i18n';
import { fetchManagedAgents } from '@/renderer/utils/model/agentTypes';
import { isElectronDesktop } from '@/renderer/utils/platform';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const Onboarding = React.lazy(() => import('@renderer/pages/onboarding'));
const CapabilitiesSettings = React.lazy(() => import('@renderer/pages/settings/CapabilitiesSettings'));
const SkillsSettings = React.lazy(() => import('@renderer/pages/settings/SkillsSettings'));
const ScienceSettings = React.lazy(() => import('@renderer/pages/settings/ScienceSettings'));
const MedicalEvidenceSettings = React.lazy(() => import('@renderer/pages/settings/MedicalEvidenceSettings'));
const ComputeSettings = React.lazy(() => import('@renderer/pages/settings/ComputeSettings'));
const AppearanceSettings = React.lazy(() => import('@renderer/pages/settings/AppearanceSettings'));
const ModeSettings = React.lazy(() => import('@renderer/pages/settings/ModeSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const WebuiSettings = React.lazy(() => import('@renderer/pages/settings/WebuiSettings'));
const LarkAutomationSettings = React.lazy(() => import('@renderer/pages/settings/LarkAutomationSettings'));
const PetSettings = React.lazy(() => import('@renderer/pages/settings/PetSettings'));
const BetaTestingSettings = React.lazy(() => import('@renderer/pages/settings/BetaTestingSettings'));
const DiagnosticsSettings = React.lazy(() => import('@renderer/pages/settings/DiagnosticsSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const CollaborationWorkspacePage = React.lazy(() => import('@renderer/pages/collaboration'));
const LarkProjectsPage = React.lazy(() => import('@renderer/pages/collaboration/LarkProjectsPage'));

const CODEX_STARTUP_CHECK_KEY = 'openbioscience.codexStartupCheck.v1';

const CodexStartupCheck: React.FC = () => {
  const navigate = useNavigate();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current || sessionStorage.getItem(CODEX_STARTUP_CHECK_KEY) === 'done') return;
    checkedRef.current = true;

    void fetchManagedAgents().then((agents) => {
      sessionStorage.setItem(CODEX_STARTUP_CHECK_KEY, 'done');
      const codexAvailable = agents.some(
        (agent) => agent.available && (agent.backend === 'codex' || agent.name.toLowerCase() === 'codex cli')
      );
      if (codexAvailable) return;

      const environmentKey = isElectronDesktop()
        ? 'settings.agentManagement.codexStartupCheckDesktop'
        : 'settings.agentManagement.codexStartupCheckWebui';
      Notification.warning({
        title: i18n.t('settings.agentManagement.codexStartupCheckTitle'),
        content: i18n.t(environmentKey),
        duration: 0,
        btn: (
          <Button type='primary' size='mini' onClick={() => void navigate('/settings/model')}>
            {i18n.t('settings.agentManagement.codexStartupCheckAction')}
          </Button>
        ),
      });
    });
  }, [navigate]);

  return null;
};

type RouteErrorBoundaryProps = React.PropsWithChildren<{
  routePath: string;
}>;

type RouteErrorBoundaryState = {
  error: Error | null;
};

class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[RouteErrorBoundary] Route failed to render:', {
      routePath: this.props.routePath,
      error,
      info,
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleBack = (): void => {
    window.location.hash = '#/guid';
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className='flex min-h-full w-full items-center justify-center px-16px py-32px'>
        <Result
          status='error'
          title={i18n.t('common.error', { defaultValue: 'Error' })}
          subTitle={this.state.error.message || i18n.t('common.unknownError', { defaultValue: 'Unknown error' })}
          extra={
            <div className='flex items-center justify-center gap-8px'>
              <Button type='primary' onClick={this.handleReload}>
                {i18n.t('common.reload', { defaultValue: 'Reload' })}
              </Button>
              <Button onClick={this.handleBack}>{i18n.t('common.back', { defaultValue: 'Back' })}</Button>
            </div>
          }
        />
      </div>
    );
  }
}

const RouteErrorBoundaryWithLocation: React.FC<React.PropsWithChildren> = ({ children }) => {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.key} routePath={location.pathname}>
      {children}
    </RouteErrorBoundary>
  );
};

const withRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <RouteErrorBoundaryWithLocation>
    <Suspense fallback={<AppLoader />}>
      <Component />
    </Suspense>
  </RouteErrorBoundaryWithLocation>
);

const withScheduledRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <ScheduledTasksErrorBoundary>{withRouteFallback(Component)}</ScheduledTasksErrorBoundary>
);

const TitleSync: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    document.title = APP_DISPLAY_NAME;
  }, [location.pathname]);

  return null;
};

const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  if (status === 'checking') {
    return <AppLoader />;
  }

  return (
    <>
      <TitleSync />
      {React.cloneElement(layout)}
    </>
  );
};

const ProtectedBareRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { status } = useAuth();

  if (status === 'checking') {
    return <AppLoader />;
  }

  return (
    <>
      <TitleSync />
      {children}
    </>
  );
};

const onboardingRedirect = (nextPath: string) => `/onboarding?next=${encodeURIComponent(nextPath)}`;

const DefaultEntry: React.FC = () => (
  <Navigate to={shouldShowOnboarding() ? onboardingRedirect('/guid') : '/guid'} replace />
);

const GuidEntry: React.FC = () => {
  if (shouldShowOnboarding()) {
    return <Navigate to={onboardingRedirect('/guid')} replace />;
  }

  return withRouteFallback(Guid);
};

const LeaderAgentBetaRoute: React.FC = () => {
  const [betaTestingConfig] = useConfig('features.betaTesting');
  if (!isLeaderAgentBetaEnabled(betaTestingConfig)) {
    return <Navigate to='/settings/beta' replace />;
  }
  return withRouteFallback(LarkProjectsPage);
};

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  return (
    <HashRouter>
      <CodexStartupCheck />
      <Routes>
        <Route path='/login' element={<Navigate to='/guid' replace />} />
        <Route path='/register' element={<Navigate to='/guid' replace />} />
        <Route
          path='/onboarding'
          element={<ProtectedBareRoute>{withRouteFallback(Onboarding)}</ProtectedBareRoute>}
        />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route index element={<DefaultEntry />} />
          <Route path='/guid' element={<GuidEntry />} />
          <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />
          <Route path='/settings/model' element={withRouteFallback(ModeSettings)} />
          <Route path='/settings/agent' element={<Navigate to='/settings/model' replace />} />
          <Route path='/settings/skills' element={withRouteFallback(SkillsSettings)} />
          <Route path='/settings/capabilities' element={withRouteFallback(CapabilitiesSettings)} />
          <Route path='/settings/science' element={withRouteFallback(ScienceSettings)} />
          <Route path='/settings/medical-evidence' element={withRouteFallback(MedicalEvidenceSettings)} />
          <Route path='/settings/compute' element={withRouteFallback(ComputeSettings)} />
          {/* Legacy routes — redirect to the merged /settings/capabilities page */}
          <Route path='/settings/skills-hub' element={<Navigate to='/settings/skills' replace />} />
          <Route path='/settings/tools' element={<Navigate to='/settings/capabilities?tab=tools' replace />} />
          <Route path='/settings/appearance' element={withRouteFallback(AppearanceSettings)} />
          <Route path='/settings/display' element={<Navigate to='/settings/appearance' replace />} />
          <Route path='/settings/webui' element={withRouteFallback(WebuiSettings)} />
          <Route path='/settings/lark-automation' element={withRouteFallback(LarkAutomationSettings)} />
          <Route path='/settings/pet' element={withRouteFallback(PetSettings)} />
          <Route path='/settings/beta' element={withRouteFallback(BetaTestingSettings)} />
          <Route path='/settings/diagnostics' element={withRouteFallback(DiagnosticsSettings)} />
          <Route path='/settings/system' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/about' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          <Route path='/settings' element={<Navigate to='/settings/model' replace />} />
          <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
          <Route path='/scheduled' element={withScheduledRouteFallback(ScheduledTasksPage)} />
          <Route path='/scheduled/:job_id' element={withScheduledRouteFallback(TaskDetailPage)} />
          <Route path='/lark-projects' element={<Navigate to='/lark-projects/agent' replace />} />
          <Route path='/lark-projects/:bucketId' element={<LeaderAgentBetaRoute />} />
          <Route path='/collaboration/:moduleId/*' element={withRouteFallback(CollaborationWorkspacePage)} />
          <Route path='/collaboration' element={<Navigate to='/collaboration/messages' replace />} />
        </Route>
        <Route path='*' element={<Navigate to='/guid' replace />} />
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
