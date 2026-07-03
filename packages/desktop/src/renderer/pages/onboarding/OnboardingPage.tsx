import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Message } from '@arco-design/web-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { applyPaperclipCredentialFallback } from '@/common/config/paperclipConfig';
import type { ResearchEvidenceConfig } from '@/common/config/storage';
import DeepScientistWordmark from '@renderer/components/icons/DeepScientistWordmark';
import { getAgents, refreshAgents } from '@renderer/hooks/agent/useAgents';
import { changeLanguage } from '@renderer/services/i18n';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { fetchManagedAgents, type AgentMetadata } from '@renderer/utils/model/agentTypes';
import { isElectronDesktop } from '@renderer/utils/platform';
import OnboardingStepper, { type OnboardingStepperStep } from './OnboardingStepper';
import {
  FinishStep,
  LanguageStep,
  ModeGuideStep,
  PaperclipBindingStep,
  RuntimeCheckStep,
  TelemetryConsentStep,
  type OnboardingModeId,
  type PaperclipConnectionState,
  type RuntimeCheckItem,
} from './OnboardingSteps';
import { completeOnboarding } from './onboardingState';
import './onboarding.css';

const DEFAULT_PAPERCLIP_BASE_URL = 'https://paperclip.gxl.ai';
const DEFAULT_TIMEOUT_MS = 30000;

const targetRuntimes: RuntimeCheckItem[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    description: 'Anthropic 的本地代码智能体，适合长任务、文件读写和科研 artifact 迭代。',
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code/setup',
    status: 'checking',
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    description: 'OpenAI 的代码智能体，可以用于本地工程、数据分析和可复现任务执行。',
    installUrl: 'https://developers.openai.com/codex/cli',
    status: 'checking',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    description: '开源代码智能体运行器，可作为 Claude Code 或 Codex 之外的本地执行选择。',
    installUrl: 'https://opencode.ai/docs/',
    status: 'checking',
  },
];

const steps: OnboardingStepperStep[] = [
  { id: 'language', title: '语言' },
  { id: 'modes', title: '模式' },
  { id: 'runtime', title: '运行器' },
  { id: 'telemetry', title: '隐私' },
  { id: 'paperclip', title: 'PaperClip' },
  { id: 'finish', title: '完成' },
];

const getSafeNextPath = (value: string | null): string => {
  if (!value || !value.startsWith('/') || value.startsWith('/onboarding')) {
    return '/guid';
  }
  return value;
};

const normalizeOnboardingLanguage = (value?: string): string =>
  value?.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';

const normalizePaperclipConfig = (): Required<Pick<ResearchEvidenceConfig, 'paperclipBaseUrl' | 'timeoutMs'>> &
  Pick<ResearchEvidenceConfig, 'paperclipApiKey'> => {
  const resolved = applyPaperclipCredentialFallback(
    configService.get('tools.researchEvidence'),
    configService.get('tools.medicalEvidence')
  );
  return {
    paperclipApiKey: resolved.paperclipApiKey || '',
    paperclipBaseUrl: resolved.paperclipBaseUrl || DEFAULT_PAPERCLIP_BASE_URL,
    timeoutMs: resolved.timeoutMs || DEFAULT_TIMEOUT_MS,
  };
};

const getAgentIdentityValues = (agent: AgentMetadata): string[] =>
  [
    agent.id,
    agent.backend,
    agent.command,
    agent.agent_source_info?.binary_name,
    agent.agent_source_info?.bridge_binary,
    agent.name,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

const findRuntimeAgent = (agents: AgentMetadata[], item: RuntimeCheckItem): AgentMetadata | undefined => {
  const target = item.id.toLowerCase();
  const targetCommand = item.command.toLowerCase();
  return agents.find((agent) => {
    const values = getAgentIdentityValues(agent);
    return values.some((value) => value === target || value === targetCommand || value.includes(targetCommand));
  });
};

const getAgentSourceLabel = (agent?: AgentMetadata): string | undefined => {
  if (!agent) return undefined;
  const source = [agent.agent_source, agent.agent_type].filter(Boolean).join(' / ');
  const binary = agent.command || agent.agent_source_info?.binary_name;
  return binary ? `${source} · ${binary}` : source;
};

const sanitizeRuntimeDetail = (message: string | undefined, fallback: string): string => {
  if (!message) return fallback;
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (
    /<!doctype|<html|error response|HTTPStatus|Unsupported method|\/api\/agents\/health-check/i.test(normalized)
  ) {
    return fallback;
  }
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
};

const mergeAgentLists = (...lists: AgentMetadata[][]): AgentMetadata[] => {
  const byKey = new Map<string, AgentMetadata>();
  for (const agent of lists.flat()) {
    const key = agent.id || `${agent.backend || ''}:${agent.command || agent.name}`;
    const existing = byKey.get(key);
    if (!existing || (!existing.available && agent.available) || (existing.enabled === false && agent.enabled)) {
      byKey.set(key, agent);
    }
  }
  return [...byKey.values()];
};

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { i18n } = useTranslation();
  const nextPath = useMemo(() => getSafeNextPath(searchParams.get('next')), [searchParams]);

  const [currentStep, setCurrentStep] = useState(1);
  const [language, setLanguage] = useState(() =>
    normalizeOnboardingLanguage(configService.get('language') || i18n.language || 'zh-CN')
  );
  const [selectedMode, setSelectedMode] = useState<OnboardingModeId>('science');
  const [telemetryEnabled, setTelemetryEnabled] = useState(true);
  const [runtimeChecking, setRuntimeChecking] = useState(true);
  const [runtimeItems, setRuntimeItems] = useState<RuntimeCheckItem[]>(() =>
    targetRuntimes.map((item) => ({
      ...item,
      logo: getAgentLogo(item.id),
    }))
  );

  const initialPaperclip = useMemo(() => normalizePaperclipConfig(), []);
  const [paperclipApiKey, setPaperclipApiKey] = useState(initialPaperclip.paperclipApiKey || '');
  const [paperclipBaseUrl, setPaperclipBaseUrl] = useState(initialPaperclip.paperclipBaseUrl);
  const [paperclipSkipped, setPaperclipSkipped] = useState(false);
  const [connectionState, setConnectionState] = useState<PaperclipConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  const runtimeReady = useMemo(() => runtimeItems.some((item) => item.status === 'available'), [runtimeItems]);
  const paperclipConfigured = Boolean(paperclipApiKey.trim()) && !paperclipSkipped;
  const isEnglish = language.toLowerCase().startsWith('en');
  const labels = useMemo(
    () =>
      isEnglish
        ? {
            skipTutorial: 'Skip tutorial',
            back: 'Back',
            next: 'Continue',
            skip: 'Skip',
            complete: 'Start using',
            paperclipSkipped: 'PaperClip skipped. You can bind it later in Scientific Research or Medical Evidence settings.',
            paperclipNeedKey: 'Enter a PaperClip API Key first',
            paperclipFailed: 'PaperClip connection failed',
            paperclipSuccess: (count?: number) =>
              count ? `PaperClip connected, ${count} tools found` : 'PaperClip connected',
          }
        : {
            skipTutorial: '跳过教程',
            back: '上一步',
            next: '继续',
            skip: '跳过',
            complete: '开始使用',
            paperclipSkipped: '已跳过 PaperClip。之后可在设置的科学研究或医学循证页面绑定。',
            paperclipNeedKey: '请先填写 PaperClip API Key',
            paperclipFailed: 'PaperClip 连接失败',
            paperclipSuccess: (count?: number) =>
              count ? `PaperClip 已连接，发现 ${count} 个工具` : 'PaperClip 已连接',
          },
    [isEnglish]
  );

  const detectRuntimes = useCallback(async () => {
    const checkedAt = new Date().toLocaleTimeString(language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setRuntimeChecking(true);
    setRuntimeItems((items) =>
      items.map(
        (item): RuntimeCheckItem => ({
          ...item,
          status: 'checking',
          detail: undefined,
          healthLatencyMs: undefined,
          isRealCheck: false,
          lastCheckedAt: undefined,
        })
      )
    );

    try {
      try {
        await refreshAgents();
      } catch {
        // Health checks below still provide the most important signal.
      }

      const [detectedAgents, managedAgents] = await Promise.all([
        getAgents().catch((): Awaited<ReturnType<typeof getAgents>> => []),
        fetchManagedAgents().catch((): AgentMetadata[] => []),
      ]);
      const allAgents = mergeAgentLists(managedAgents, detectedAgents);
      const nextItems = await Promise.all(
        targetRuntimes.map(async (item): Promise<RuntimeCheckItem> => {
          const detected = findRuntimeAgent(allAgents, item);
          const actualCommand = detected?.command || detected?.agent_source_info?.binary_name || item.command;

          try {
            const result = await ipcBridge.acpConversation.checkAgentHealth.invoke({ backend: item.id });
            const healthAvailable = result.available === true;
            const registryAvailable = detected?.available === true && detected.enabled !== false;
            const disabled = detected?.enabled === false;
            const status: RuntimeCheckItem['status'] =
              healthAvailable || registryAvailable ? 'available' : detected ? 'needs_setup' : 'missing';
            const fallbackDetail = disabled
              ? isEnglish
                ? 'Detected in the registry, but currently disabled'
                : '已在 registry 中发现，但当前被禁用'
              : detected
                ? isEnglish
                  ? 'Command was found, but the health check did not pass'
                  : '已发现命令，但健康检查未通过'
                : isEnglish
                  ? 'Not found in the backend runtime registry'
                  : '后端运行器 registry 未发现';
            const detail = healthAvailable
              ? result.latency
                ? isEnglish
                  ? `Health check passed in ${Math.round(result.latency)} ms`
                  : `健康检查 ${Math.round(result.latency)} ms`
                : isEnglish
                  ? 'Health check passed'
                  : '健康检查通过'
              : disabled
                ? fallbackDetail
                : sanitizeRuntimeDetail(result.error || detected?.description, fallbackDetail);

            return Object.assign({}, item, {
              logo: getAgentLogo(item.id),
              status,
              detail,
              actualCommand,
              agentAvailable: detected?.available,
              agentEnabled: detected?.enabled,
              detectedName: detected?.name,
              detectedSource: getAgentSourceLabel(detected),
              healthLatencyMs: result.latency,
              isRealCheck: true,
              lastCheckedAt: checkedAt,
            });
          } catch (error) {
            const registryAvailable = detected?.available === true && detected.enabled !== false;
            return Object.assign({}, item, {
              logo: getAgentLogo(item.id),
              status: registryAvailable ? 'available' : detected ? 'needs_setup' : 'missing',
              detail: sanitizeRuntimeDetail(
                error instanceof Error ? error.message : undefined,
                detected
                  ? isEnglish
                    ? 'Registry entry found, but health check failed'
                    : '已发现 registry 项，但健康检查失败'
                  : isEnglish
                    ? 'Health-check endpoint is unavailable'
                    : '健康检查接口暂不可用'
              ),
              actualCommand,
              agentAvailable: detected?.available,
              agentEnabled: detected?.enabled,
              detectedName: detected?.name,
              detectedSource: getAgentSourceLabel(detected),
              isRealCheck: true,
              lastCheckedAt: checkedAt,
            });
          }
        })
      );

      setRuntimeItems(nextItems);
    } finally {
      setRuntimeChecking(false);
    }
  }, [isEnglish, language]);

  useEffect(() => {
    void detectRuntimes();
  }, [detectRuntimes]);

  const handleLanguageChange = useCallback((nextLanguage: string) => {
    setLanguage(nextLanguage);
    changeLanguage(nextLanguage).catch((error) => {
      console.error('Failed to change onboarding language:', error);
    });
  }, []);

  const persistTelemetryConsent = useCallback(async () => {
    const partial = {
      usage: telemetryEnabled,
      diagnostics: telemetryEnabled,
      update: telemetryEnabled,
    };

    if (!isElectronDesktop()) {
      await configService.setBatch({
        'telemetry.usageEnabled': telemetryEnabled,
        'telemetry.diagnosticsEnabled': telemetryEnabled,
        'telemetry.updateEnabled': telemetryEnabled,
      });
      return;
    }

    const result = await ipcBridge.telemetry.setConsent.invoke(partial);
    if (result.success && result.data) {
      configService.setLocal('telemetry.usageEnabled', result.data.consent.usage);
      configService.setLocal('telemetry.diagnosticsEnabled', result.data.consent.diagnostics);
      configService.setLocal('telemetry.updateEnabled', result.data.consent.update);
    }
  }, [telemetryEnabled]);

  const savePaperclipIfPresent = useCallback(
    async (options?: { requireKey?: boolean; normalizedBaseUrl?: string }) => {
      const apiKey = paperclipApiKey.trim();
      if (!apiKey) {
        if (options?.requireKey) {
          throw new Error(labels.paperclipNeedKey);
        }
        return;
      }

      const current = configService.get('tools.researchEvidence') || {};
      await configService.set('tools.researchEvidence', {
        ...current,
        enabled: true,
        paperclipApiKey: apiKey,
        paperclipBaseUrl: options?.normalizedBaseUrl || paperclipBaseUrl.trim() || DEFAULT_PAPERCLIP_BASE_URL,
        timeoutMs: current.timeoutMs || DEFAULT_TIMEOUT_MS,
      });
      setPaperclipSkipped(false);
    },
    [labels.paperclipNeedKey, paperclipApiKey, paperclipBaseUrl]
  );

  const handleTestPaperclip = useCallback(async () => {
    setConnectionState('testing');
    setConnectionMessage('');
    try {
      const result = await ipcBridge.medicalEvidenceSettings.testPaperclipConnection.invoke({
        paperclipApiKey: paperclipApiKey.trim(),
        paperclipBaseUrl: paperclipBaseUrl.trim() || DEFAULT_PAPERCLIP_BASE_URL,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
      if (!result.ok) {
        throw new Error(result.message || labels.paperclipFailed);
      }

      if (result.normalizedBaseUrl) {
        setPaperclipBaseUrl(result.normalizedBaseUrl);
      }
      await savePaperclipIfPresent({ requireKey: true, normalizedBaseUrl: result.normalizedBaseUrl });
      const message = labels.paperclipSuccess(result.toolCount);
      setConnectionState('success');
      setConnectionMessage(message);
      Message.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : labels.paperclipFailed;
      setConnectionState('error');
      setConnectionMessage(message);
      Message.error(message);
    }
  }, [labels, paperclipApiKey, paperclipBaseUrl, savePaperclipIfPresent]);

  const finishOnboarding = useCallback(
    (skipped: boolean) => {
      completeOnboarding({ skipped });
      navigate(nextPath, { replace: true });

      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          if (window.location.hash.includes('/onboarding')) {
            window.location.hash = `#${nextPath}`;
          }
        });
      }

      void (async () => {
        try {
          await persistTelemetryConsent();
        } catch (error) {
          console.error('Failed to persist telemetry consent:', error);
        }

        try {
          if (!paperclipSkipped) {
            await savePaperclipIfPresent();
          }
        } catch (error) {
          console.error('Failed to save PaperClip settings:', error);
        }
      })();
    },
    [navigate, nextPath, paperclipSkipped, persistTelemetryConsent, savePaperclipIfPresent]
  );

  const handleNext = useCallback(() => {
    if (currentStep >= steps.length) {
      finishOnboarding(false);
      return;
    }
    setCurrentStep((step) => Math.min(steps.length, step + 1));
  }, [currentStep, finishOnboarding]);

  const handleBack = useCallback(() => {
    setCurrentStep((step) => Math.max(1, step - 1));
  }, []);

  const handleSkip = useCallback(() => {
    finishOnboarding(true);
  }, [finishOnboarding]);

  const handleSkipPaperclip = useCallback(() => {
    setPaperclipSkipped(true);
    setConnectionState('idle');
    setConnectionMessage(labels.paperclipSkipped);
    setCurrentStep((step) => Math.min(steps.length, step + 1));
  }, [labels.paperclipSkipped]);

  const activeStep = useMemo(() => {
    switch (currentStep) {
      case 1:
        return <LanguageStep locale={language} language={language} onLanguageChange={handleLanguageChange} />;
      case 2:
        return <ModeGuideStep locale={language} selectedMode={selectedMode} onSelectMode={setSelectedMode} />;
      case 3:
        return <RuntimeCheckStep locale={language} checking={runtimeChecking} items={runtimeItems} onRefresh={detectRuntimes} />;
      case 4:
        return <TelemetryConsentStep locale={language} enabled={telemetryEnabled} onChange={setTelemetryEnabled} />;
      case 5:
        return (
          <PaperclipBindingStep
            locale={language}
            apiKey={paperclipApiKey}
            baseUrl={paperclipBaseUrl}
            connectionMessage={connectionMessage}
            connectionState={connectionState}
            onApiKeyChange={(value) => {
              setPaperclipApiKey(value);
              setPaperclipSkipped(false);
              setConnectionState('idle');
              setConnectionMessage('');
            }}
            onBaseUrlChange={(value) => {
              setPaperclipBaseUrl(value);
              setConnectionState('idle');
              setConnectionMessage('');
            }}
            onSkip={handleSkipPaperclip}
            onTest={handleTestPaperclip}
          />
        );
      default:
        return (
          <FinishStep
            locale={language}
            selectedMode={selectedMode}
            runtimeReady={runtimeReady}
            telemetryEnabled={telemetryEnabled}
            paperclipConfigured={paperclipConfigured}
          />
        );
    }
  }, [
    connectionMessage,
    connectionState,
    currentStep,
    detectRuntimes,
    handleLanguageChange,
    handleSkipPaperclip,
    handleTestPaperclip,
    language,
    paperclipApiKey,
    paperclipBaseUrl,
    paperclipConfigured,
    runtimeChecking,
    runtimeItems,
    runtimeReady,
    selectedMode,
    telemetryEnabled,
  ]);

  return (
    <main className='onboarding-page'>
      <div className='onboarding-shell'>
        <header className='onboarding-header'>
          <DeepScientistWordmark aria-label='OpenScience' variant='sidebar' className='onboarding-header__logo' />
          <button type='button' className='onboarding-header__skip' onClick={handleSkip}>
            {labels.skipTutorial}
          </button>
        </header>
        <OnboardingStepper
          steps={steps}
          currentStep={currentStep}
          backLabel={labels.back}
          nextLabel={labels.next}
          skipLabel={labels.skip}
          completeLabel={labels.complete}
          nextDisabled={connectionState === 'testing'}
          onBack={handleBack}
          onNext={handleNext}
          onSkip={handleSkip}
        >
          {activeStep}
        </OnboardingStepper>
      </div>
    </main>
  );
};

export default OnboardingPage;
