/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { buildDefaultLabSkillDepositionUserMessage } from '@/common/chat/labSkillDeposition';
import { SCIENCE_SKILL_PACK_COUNTS } from '@/common/chat/scienceSkills.generated';
import { isLeaderAgentBetaEnabled } from '@/common/config/betaTesting';
import { type IMcpServer, type TProviderWithModel } from '@/common/config/storage';
import { resolveLocaleKey } from '@/common/utils';
import type { Assistant, AssistantDetail } from '@/common/types/agent/assistantTypes';

import { useInputFocusRing } from '@/renderer/hooks/chat/useInputFocusRing';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { CUSTOM_AVATAR_IMAGE_MAP } from './constants';
import AgentPillBar from './components/AgentPillBar';
import GuidActionRow from './components/GuidActionRow';
import GuidInputCard from './components/GuidInputCard';
import GuidLarkProjectPanel, { type GuidLarkProjectContext } from './components/GuidLarkProjectPanel';
import GuidModelSelector from './components/GuidModelSelector';
import MentionDropdown from './components/MentionDropdown';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import DeepScientistLogo from '@/renderer/components/icons/DeepScientistLogo';
import DeepScientistWordmark from '@/renderer/components/icons/DeepScientistWordmark';
import CollaborationIcon from '@/renderer/components/icons/CollaborationIcon';
import QuickActionButtons from './components/QuickActionButtons';
import { PreviewPanel, usePreviewContext, type PreviewPanelLayoutMode } from '@/renderer/pages/conversation/Preview';
import { useGuidAgentSelection } from './hooks/useGuidAgentSelection';
import { useGuidInput } from './hooks/useGuidInput';
import { useGuidMention } from './hooks/useGuidMention';
import { useGuidSend } from './hooks/useGuidSend';
import { useTypewriterPlaceholder } from './hooks/useTypewriterPlaceholder';
import { ensureBackendMcpCatalog } from '@/renderer/hooks/mcp/catalog';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { resolveGuidAssistantDefaults } from './utils/assistantDefaults';
import {
  getGuidModeDefaultSkillIds,
  getGuidModeRequiredMcpNames,
  normalizeGuidAgentBackend,
  resolveGuidCapabilityMode,
} from './utils/modeCapabilities';
import SpeechInputButton from '@/renderer/components/chat/SpeechInputButton';
import { APP_DISPLAY_NAME } from '@/renderer/utils/brand';
import { appendSpeechTranscript } from '@/renderer/hooks/system/useSpeechInput';
import { useLiveTranscriptInsertion } from '@/renderer/hooks/system/useLiveTranscriptInsertion';
import LoopGoalBar from '@/renderer/pages/conversation/components/LoopGoalBar';
import type { LoopGoalState } from '@/common/chat/loopGoal';
import SshHostSelector from '@/renderer/components/compute/SshHostSelector';
import { Button, ConfigProvider, Message } from '@arco-design/web-react';
import { Down, Left, Robot } from '@icon-park/react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import useSWR, { mutate as swrMutate } from 'swr';
import styles from './index.module.css';

const RESEARCH_HERO_TASKS_ZH = [
  '跑通科研分析',
  '复现关键结果',
  '追溯证据链路',
  '打磨论文图表',
  '撰写研究手稿',
  '整理实验数据',
  '检查代码来源',
  '生成可信报告',
];

const RESEARCH_HERO_TASKS_EN = [
  'run scientific analysis',
  'reproduce key results',
  'trace evidence chains',
  'refine publication figures',
  'write research manuscripts',
  'organize experimental data',
  'inspect code provenance',
  'generate trusted reports',
];

const splitHeroPhrase = (phrase: string): string[] => {
  if (phrase.includes(' ')) {
    return phrase.split(/(\s+)/).filter(Boolean);
  }
  return Array.from(phrase);
};

const ResearchHeroTitle: React.FC<{ localeKey: string }> = ({ localeKey }) => {
  const isChinese = localeKey === 'zh-CN' || localeKey === 'zh-TW';
  const phrases = isChinese ? RESEARCH_HERO_TASKS_ZH : RESEARCH_HERO_TASKS_EN;
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrase = phrases[phraseIndex] ?? phrases[0];
  const helperText = isChinese ? '帮你' : 'helps you';
  const ariaLabel = `${APP_DISPLAY_NAME} ${helperText} ${phrase}`;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPhraseIndex((current) => (current + 1) % phrases.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [phrases.length]);

  return (
    <div className={styles.researchHeroTitleGroup} aria-label={ariaLabel}>
      <DeepScientistLogo
        wrapperClassName={styles.researchHeroTopLogo}
        className={styles.researchHeroTopLogoImage}
        alt=''
        aria-hidden='true'
      />
      <p
        className={`${styles.researchHeroTitle} ${!isChinese ? styles.researchHeroTitleEnglish : ''} text-2xl font-semibold mb-0 text-0 text-center`}
      >
        <DeepScientistWordmark
          wrapperClassName={styles.researchHeroWordmark}
          className={styles.researchHeroWordmarkImage}
          aria-hidden='true'
        />
        <span className={styles.researchHeroPrefix}>{helperText}</span>
        <span key={phrase} className={styles.researchHeroPhrase} aria-hidden='true'>
          {splitHeroPhrase(phrase).map((part, index) => {
            const isSpace = /^\s+$/.test(part);
            return (
              <span
                key={`${part}-${index}`}
                className={isSpace ? styles.researchHeroSpace : styles.researchHeroUnit}
                style={{ '--split-index': index } as React.CSSProperties}
              >
                {part}
              </span>
            );
          })}
        </span>
      </p>
    </div>
  );
};

const GuidPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const guidContainerRef = useRef<HTMLDivElement>(null);
  const descriptionTextRef = useRef<HTMLDivElement>(null);
  const { activeBorderColor, inactiveBorderColor, activeShadow } = useInputFocusRing();

  const localeKey = resolveLocaleKey(i18n.language);

  // --- Skills state ---
  // All available skills (builtin auto-injected + user-imported custom) merged
  // into one catalog for the action-row menu. Auto-injected skills default to
  // checked; the rest are opt-in per conversation (or pre-checked when the
  // active assistant declares them in `enabled_skills`).
  const [allSkills, setAllSkills] = useState<Array<{ name: string; description: string; isAuto: boolean }>>([]);
  const [guidDisabledBuiltinSkills, setGuidDisabledBuiltinSkills] = useState<string[] | undefined>(undefined);
  const [guidEnabledSkills, setGuidEnabledSkills] = useState<string[] | undefined>(undefined);
  const [availableMcpServers, setAvailableMcpServers] = useState<IMcpServer[]>([]);
  const [guidSelectedMcpServerIds, setGuidSelectedMcpServerIds] = useState<string[] | undefined>(undefined);
  const [guidContextMode, setGuidContextMode] = useState<'workspace' | 'leader-agent' | undefined>(undefined);
  const [larkProjectContext, setLarkProjectContext] = useState<GuidLarkProjectContext | undefined>(undefined);
  const [loopGoal, setLoopGoal] = useState<LoopGoalState | undefined>(undefined);
  const [isLoopGoalMode, setIsLoopGoalMode] = useState(false);
  const [isScienceMode, setIsScienceMode] = useState(true);
  const [isMedicalEvidenceMode, setIsMedicalEvidenceMode] = useState(false);
  const [isSkillDepositionMode, setIsSkillDepositionMode] = useState(false);
  const [selectedComputeHostIds, setSelectedComputeHostIds] = useState<string[]>([]);
  const { isOpen: isGuidPreviewOpen, closePreview } = usePreviewContext();
  const [guidPreviewLayoutMode, setGuidPreviewLayoutMode] = useState<PreviewPanelLayoutMode>('split');
  const [betaTestingConfig] = useConfig('features.betaTesting');
  const leaderAgentBetaEnabled = isLeaderAgentBetaEnabled(betaTestingConfig);
  const isLarkProjectContextLocked = Boolean(larkProjectContext?.locked);
  const activeLarkProjectContext =
    leaderAgentBetaEnabled && (guidContextMode === 'leader-agent' || isLarkProjectContextLocked)
      ? larkProjectContext
      : undefined;
  const isLeaderAgentPanelOpen =
    leaderAgentBetaEnabled && guidContextMode === 'leader-agent' && !isLarkProjectContextLocked;
  useEffect(() => {
    Promise.all([ipcBridge.fs.listBuiltinAutoSkills.invoke(), ipcBridge.fs.listAvailableSkills.invoke()])
      .then(([autoSkills, availableSkills]) => {
        const autoNames = new Set(autoSkills.map((s) => s.name));
        const merged: Array<{ name: string; description: string; isAuto: boolean }> = [
          ...autoSkills.map((s) => ({ name: s.name, description: s.description, isAuto: true })),
          ...availableSkills
            .filter((s) => !autoNames.has(s.name))
            .map((s) => ({ name: s.name, description: s.description, isAuto: false })),
        ];
        setAllSkills(merged);
      })
      .catch(() => setAllSkills([]));
  }, []);

  useEffect(() => {
    void ensureBackendMcpCatalog()
      .then(({ allServers }) => {
        setAvailableMcpServers(allServers);
      })
      .catch((error) => {
        console.error('[GuidPage] Failed to load MCP catalog:', error);
        setAvailableMcpServers([]);
      });
  }, []);

  const handleToggleSkill = useCallback((skillName: string, isAuto: boolean) => {
    if (isAuto) {
      setGuidDisabledBuiltinSkills((prev) => {
        const list = prev ?? [];
        return list.includes(skillName) ? list.filter((s) => s !== skillName) : [...list, skillName];
      });
    } else {
      setGuidEnabledSkills((prev) => {
        const list = prev ?? [];
        return list.includes(skillName) ? list.filter((s) => s !== skillName) : [...list, skillName];
      });
    }
  }, []);

  const handleToggleMcpServer = useCallback((serverId: string) => {
    setGuidSelectedMcpServerIds((prev) => {
      const current = prev ?? [];
      return current.includes(serverId) ? current.filter((id) => id !== serverId) : [...current, serverId];
    });
  }, []);

  // --- Hooks ---
  const navState = location.state as {
    resetAssistant?: boolean;
    selectedAgentKey?: string;
    larkProjectContext?: GuidLarkProjectContext;
  } | null;
  const resetAssistantRequested = navState?.resetAssistant === true;
  const preselectAgentKey = navState?.selectedAgentKey;
  const agentSelection = useGuidAgentSelection({
    modelList: [],
    isGoogleAuth: false,
    localeKey,
    resetAssistant: resetAssistantRequested,
    preselectAgentKey,
    locationKey: location.key,
  });

  const guidInput = useGuidInput({
    locationState: location.state as { workspace?: string; initialInput?: string } | null,
  });

  useEffect(() => {
    const nextProjectContext = navState?.larkProjectContext;
    if (!leaderAgentBetaEnabled) {
      setLarkProjectContext(undefined);
      setGuidContextMode((current) => (current === 'leader-agent' ? undefined : current));
      return;
    }
    if (nextProjectContext) {
      setLarkProjectContext(nextProjectContext);
      setGuidContextMode(nextProjectContext.locked ? undefined : 'leader-agent');
      return;
    }
    setLarkProjectContext(undefined);
    setGuidContextMode((current) => (current === 'leader-agent' ? undefined : current));
  }, [leaderAgentBetaEnabled, location.key, navState?.larkProjectContext]);

  const mention = useGuidMention({
    availableAgents: agentSelection.availableAgents,
    customAgentAvatarMap: agentSelection.customAgentAvatarMap,
    selectedAgentKey: agentSelection.selectedAgentKey,
    setSelectedAgentKey: agentSelection.setSelectedAgentKey,
    setInput: guidInput.setInput,
    selectedAgentInfo: agentSelection.selectedAgentInfo,
  });

  const selectedAssistantId = agentSelection.is_presetAgent ? agentSelection.selectedAgentInfo?.custom_agent_id : null;
  const { data: selectedAssistantDetail } = useSWR(
    selectedAssistantId ? `guid.assistant.detail.${selectedAssistantId}.${localeKey}` : null,
    async (): Promise<AssistantDetail | null> =>
      ipcBridge.assistants.get
        .invoke({ id: selectedAssistantId!, locale: localeKey })
        .catch((_error: unknown): AssistantDetail | null => null)
  );
  const resolvedAssistantDefaults = useMemo(
    () => resolveGuidAssistantDefaults(selectedAssistantDetail),
    [selectedAssistantDetail]
  );
  const activeCapabilityMode = useMemo(
    () => resolveGuidCapabilityMode({ isScienceMode, isMedicalEvidenceMode, isSkillDepositionMode }),
    [isMedicalEvidenceMode, isScienceMode, isSkillDepositionMode]
  );
  const activeModeLabel = useMemo(() => {
    if (activeCapabilityMode === 'medical-evidence') return t('guid.medicalEvidence.menuLabel');
    if (activeCapabilityMode === 'skill-deposition') return t('guid.skillDeposition.menuLabel');
    if (activeCapabilityMode === 'science') return t('guid.scienceProject.menuLabel');
    return '';
  }, [activeCapabilityMode, t]);
  const medicalEvidenceAgentBackend = useMemo(
    () =>
      normalizeGuidAgentBackend(
        agentSelection.is_presetAgent
          ? agentSelection.currentEffectiveAgentInfo.agent_type
          : agentSelection.selectedAgent
      ) || normalizeGuidAgentBackend(agentSelection.selectedAgent),
    [
      agentSelection.currentEffectiveAgentInfo.agent_type,
      agentSelection.is_presetAgent,
      agentSelection.selectedAgent,
    ]
  );
  const lockedModeSkillIds = useMemo(() => getGuidModeDefaultSkillIds(activeCapabilityMode), [activeCapabilityMode]);
  const lockedModeMcpNames = useMemo(
    () => getGuidModeRequiredMcpNames(activeCapabilityMode, { medicalEvidenceAgentBackend }),
    [activeCapabilityMode, medicalEvidenceAgentBackend]
  );
  const lockedModeMcpNameSet = useMemo(() => new Set(lockedModeMcpNames), [lockedModeMcpNames]);
  const visibleMcpServers = useMemo(
    () =>
      availableMcpServers.filter((server) => server.builtin !== true || lockedModeMcpNameSet.has(server.name)),
    [availableMcpServers, lockedModeMcpNameSet]
  );
  const lockedModeMcpServerIds = useMemo(
    () => visibleMcpServers.filter((server) => lockedModeMcpNameSet.has(server.name)).map((server) => server.id),
    [lockedModeMcpNameSet, visibleMcpServers]
  );
  const enabledSkillsForMenu = useMemo(
    () => Array.from(new Set([...(guidEnabledSkills ?? []), ...lockedModeSkillIds])),
    [guidEnabledSkills, lockedModeSkillIds]
  );
  const selectedMcpServerIdsForMenu = useMemo(
    () => Array.from(new Set([...(guidSelectedMcpServerIds ?? []), ...lockedModeMcpServerIds])),
    [guidSelectedMcpServerIds, lockedModeMcpServerIds]
  );
  const modeSkillSummary = useMemo(() => {
    if (!activeModeLabel || lockedModeSkillIds.length === 0) return undefined;
    if (activeCapabilityMode === 'science') {
      return `${activeModeLabel} · ${lockedModeSkillIds.length} default routers · ${SCIENCE_SKILL_PACK_COUNTS.total} discoverable`;
    }
    return `${activeModeLabel} · ${lockedModeSkillIds.length} default skills`;
  }, [activeCapabilityMode, activeModeLabel, lockedModeSkillIds.length]);
  const modeMcpSummary = useMemo(() => {
    if (!activeModeLabel || lockedModeMcpNames.length === 0) return undefined;
    return `${activeModeLabel} · ${lockedModeMcpNames.length} session MCP`;
  }, [activeModeLabel, lockedModeMcpNames.length]);

  const send = useGuidSend({
    // Input state
    input: guidInput.input,
    setInput: guidInput.setInput,
    files: guidInput.files,
    setFiles: guidInput.setFiles,
    dir: guidInput.dir,
    setDir: guidInput.setDir,
    setLoading: guidInput.setLoading,
    loading: guidInput.loading,

    // Agent state
    selectedAgent: agentSelection.selectedAgent,
    selectedAgentKey: agentSelection.selectedAgentKey,
    selectedAgentInfo: agentSelection.selectedAgentInfo,
    is_presetAgent: agentSelection.is_presetAgent,
    selectedMode: agentSelection.selectedMode,
    selectedAcpModel: agentSelection.selectedAcpModel,
    currentAcpCachedModelInfo: agentSelection.currentAcpCachedModelInfo,
    current_model: undefined,

    // Agent helpers
    findAgentByKey: agentSelection.findAgentByKey,
    getEffectiveAgentType: agentSelection.getEffectiveAgentType,
    resolveEnabledSkills: agentSelection.resolveEnabledSkills,
    resolveDisabledBuiltinSkills: agentSelection.resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds: resolvedAssistantDefaults.skillIds,
    assistantDefaultDisabledBuiltinSkillIds: resolvedAssistantDefaults.disabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds: guidSelectedMcpServerIds,
    assistantDefaultMcpIds: resolvedAssistantDefaults.mcpIds,
    currentEffectiveAgentInfo: agentSelection.currentEffectiveAgentInfo,
    isGoogleAuth: false,
    larkProjectContext: activeLarkProjectContext,
    loopGoal,
    isLoopGoalMode,
    isScienceMode,
    isMedicalEvidenceMode,
    isSkillDepositionMode,
    selectedComputeHostIds,
    onLoopGoalSent: () => {
      setLoopGoal(undefined);
      setIsLoopGoalMode(false);
    },
    onMedicalEvidenceModeSent: () => {
      setIsMedicalEvidenceMode(false);
    },
    onSkillDepositionModeSent: () => {
      setIsSkillDepositionMode(false);
    },

    // Mention state reset
    setMentionOpen: mention.setMentionOpen,
    setMentionQuery: mention.setMentionQuery,
    setMentionSelectorOpen: mention.setMentionSelectorOpen,
    setMentionActiveIndex: mention.setMentionActiveIndex,

    // Navigation
    navigate,
    t,
    localeKey,
  });

  // --- Coordinated handlers (depend on multiple hooks) ---
  const handleInputChange = useCallback(
    (value: string) => {
      guidInput.setInput(value);
      const match = value.match(mention.mentionMatchRegex);
      // 首页不根据输入 @ 呼起 mention 列表，占位符里的 @agent 仅为提示，选 agent 用顶部栏或下拉手动选
      if (match) {
        mention.setMentionQuery(match[1]);
        mention.setMentionOpen(false);
      } else {
        mention.setMentionQuery(null);
        mention.setMentionOpen(false);
      }
    },
    [mention.mentionMatchRegex, guidInput.setInput, mention.setMentionQuery, mention.setMentionOpen]
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (
        (mention.mentionOpen || mention.mentionSelectorOpen) &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      ) {
        event.preventDefault();
        if (mention.filteredMentionOptions.length === 0) return;
        mention.setMentionActiveIndex((prev) => {
          if (event.key === 'ArrowDown') {
            return (prev + 1) % mention.filteredMentionOptions.length;
          }
          return (prev - 1 + mention.filteredMentionOptions.length) % mention.filteredMentionOptions.length;
        });
        return;
      }
      if ((mention.mentionOpen || mention.mentionSelectorOpen) && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (mention.filteredMentionOptions.length > 0) {
          const query = mention.mentionQuery?.toLowerCase();
          const exactMatch = query
            ? mention.filteredMentionOptions.find(
                (option) => option.label.toLowerCase() === query || option.tokens.has(query)
              )
            : undefined;
          const selected =
            exactMatch ||
            mention.filteredMentionOptions[mention.mentionActiveIndex] ||
            mention.filteredMentionOptions[0];
          if (selected) {
            mention.selectMentionAgent(selected.key);
            return;
          }
        }
        mention.setMentionOpen(false);
        mention.setMentionQuery(null);
        mention.setMentionSelectorOpen(false);
        mention.setMentionActiveIndex(0);
        return;
      }
      if (mention.mentionOpen && (event.key === 'Backspace' || event.key === 'Delete') && !mention.mentionQuery) {
        mention.setMentionOpen(false);
        mention.setMentionQuery(null);
        mention.setMentionActiveIndex(0);
        return;
      }
      if (
        !mention.mentionOpen &&
        mention.mentionSelectorVisible &&
        !guidInput.input.trim() &&
        (event.key === 'Backspace' || event.key === 'Delete')
      ) {
        event.preventDefault();
        mention.setMentionSelectorVisible(false);
        mention.setMentionSelectorOpen(false);
        mention.setMentionActiveIndex(0);
        return;
      }
      if ((mention.mentionOpen || mention.mentionSelectorOpen) && event.key === 'Escape') {
        event.preventDefault();
        mention.setMentionOpen(false);
        mention.setMentionQuery(null);
        mention.setMentionSelectorOpen(false);
        mention.setMentionActiveIndex(0);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!guidInput.input.trim() && !activeLarkProjectContext?.tasklistGuid && !loopGoal?.goal.trim()) return;
        send.sendMessageHandler();
      }
    },
    [mention, guidInput.input, activeLarkProjectContext?.tasklistGuid, loopGoal?.goal, send.sendMessageHandler]
  );

  const handleSelectAgentFromPillBar = useCallback(
    (key: string) => {
      agentSelection.setSelectedAgentKey(key);
      mention.setMentionOpen(false);
      mention.setMentionQuery(null);
      mention.setMentionSelectorOpen(false);
      mention.setMentionActiveIndex(0);
    },
    [
      agentSelection.setSelectedAgentKey,
      mention.setMentionOpen,
      mention.setMentionQuery,
      mention.setMentionSelectorOpen,
      mention.setMentionActiveIndex,
    ]
  );

  // Typewriter placeholder
  const typewriterPlaceholder = useTypewriterPlaceholder(t('conversation.welcome.placeholder'));
  const selectedAssistantRecord = useMemo(() => {
    if (!agentSelection.is_presetAgent || !agentSelection.selectedAgentInfo?.custom_agent_id) return undefined;
    const selectedId = agentSelection.selectedAgentInfo.custom_agent_id;
    const strippedId = selectedId.replace(/^builtin-/, '');
    const candidates = new Set([selectedId, `builtin-${strippedId}`, strippedId]);
    return agentSelection.assistants.find((item) => candidates.has(item.id));
  }, [agentSelection.assistants, agentSelection.is_presetAgent, agentSelection.selectedAgentInfo?.custom_agent_id]);

  // Sync disabledBuiltinSkills + enabledSkills from preset assistant config
  useEffect(() => {
    if (!agentSelection.is_presetAgent) {
      setGuidDisabledBuiltinSkills(undefined);
      setGuidEnabledSkills(undefined);
      return;
    }

    if (selectedAssistantDetail) {
      const resolvedDefaults = resolveGuidAssistantDefaults(selectedAssistantDetail);
      setGuidDisabledBuiltinSkills(resolvedDefaults.disabledBuiltinSkillIds);
      setGuidEnabledSkills(resolvedDefaults.skillIds);
      return;
    }

    if (selectedAssistantRecord) {
      setGuidDisabledBuiltinSkills(selectedAssistantRecord.disabled_builtin_skills ?? []);
      setGuidEnabledSkills(selectedAssistantRecord.enabled_skills ?? []);
    } else {
      setGuidDisabledBuiltinSkills(undefined);
      setGuidEnabledSkills(undefined);
    }
  }, [agentSelection.is_presetAgent, selectedAssistantDetail, selectedAssistantRecord]);

  const appliedAssistantDefaultsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!agentSelection.is_presetAgent || !selectedAssistantId || !selectedAssistantDetail) {
      appliedAssistantDefaultsKeyRef.current = null;
      return;
    }

    const signature = JSON.stringify({
      assistantId: selectedAssistantId,
      backend: agentSelection.currentEffectiveAgentInfo.agent_type,
      defaults: selectedAssistantDetail.defaults,
      preferences: {
        last_model_id: selectedAssistantDetail.preferences.last_model_id,
        last_permission_value: selectedAssistantDetail.preferences.last_permission_value,
        last_mcp_ids: selectedAssistantDetail.preferences.last_mcp_ids,
      },
    });
    if (appliedAssistantDefaultsKeyRef.current === signature) {
      return;
    }
    appliedAssistantDefaultsKeyRef.current = signature;

    const applyAssistantDefaults = async () => {
      const resolvedDefaults = resolveGuidAssistantDefaults(selectedAssistantDetail);
      if (resolvedDefaults.modelId) {
        agentSelection.setSelectedAcpModel(resolvedDefaults.modelId ?? null, { persistPreference: false });
      } else {
        agentSelection.setSelectedAcpModel(null, { persistPreference: false });
      }

      if (resolvedDefaults.permissionMode) {
        agentSelection.setSelectedMode(resolvedDefaults.permissionMode, { persistPreference: false });
      }
      setGuidSelectedMcpServerIds(resolvedDefaults.mcpIds);
    };

    void applyAssistantDefaults().catch((error) => {
      console.error('[GuidPage] Failed to apply assistant defaults:', error);
    });
  }, [
    agentSelection.currentEffectiveAgentInfo.agent_type,
    agentSelection.setSelectedAcpModel,
    agentSelection.setSelectedMode,
    selectedAssistantId,
    selectedAssistantDetail,
  ]);

  const heroTitle = useMemo(() => {
    if (!agentSelection.is_presetAgent) return t('conversation.welcome.title');
    const i18nName = selectedAssistantRecord?.name_i18n?.[localeKey];
    if (i18nName) return i18nName;
    return mention.selectedAgentLabel || t('conversation.welcome.title');
  }, [agentSelection.is_presetAgent, selectedAssistantRecord, localeKey, mention.selectedAgentLabel, t]);
  const selectedAssistantDescription = useMemo(() => {
    return selectedAssistantRecord?.description_i18n?.[localeKey] || selectedAssistantRecord?.description || '';
  }, [selectedAssistantRecord, localeKey]);
  const selectedAssistantAvatar = useMemo(() => {
    if (!agentSelection.is_presetAgent) return null;
    const selectedId = agentSelection.selectedAgentInfo?.custom_agent_id;
    const strippedId = selectedId?.replace(/^builtin-/, '');
    const candidates = new Set(selectedId && strippedId ? [selectedId, `builtin-${strippedId}`, strippedId] : []);
    const selectedAssistant = agentSelection.assistants.find((item) => candidates.has(item.id));
    const avatarValue = selectedAssistant?.avatar?.trim() || agentSelection.selectedAgentInfo?.avatar?.trim();
    if (!avatarValue) return { kind: 'icon' as const };
    const mappedAvatar = CUSTOM_AVATAR_IMAGE_MAP[avatarValue];
    const resolvedAvatar = resolveExtensionAssetUrl(avatarValue);
    const avatarImage = mappedAvatar || resolvedAvatar;
    const isImageAvatar = Boolean(
      avatarImage &&
      (/\.(svg|png|jpe?g|webp|gif)$/i.test(avatarImage) || /^(https?:|file:\/\/|data:|\/)/i.test(avatarImage))
    );
    if (isImageAvatar && avatarImage) {
      return { kind: 'image' as const, value: avatarImage };
    }
    return { kind: 'emoji' as const, value: avatarValue };
  }, [
    agentSelection.assistants,
    agentSelection.is_presetAgent,
    agentSelection.selectedAgentInfo?.avatar,
    agentSelection.selectedAgentInfo?.custom_agent_id,
  ]);
  const setGuidSelectedMode = useCallback(
    (mode: React.SetStateAction<string>) => {
      agentSelection.setSelectedMode(mode, { persistPreference: !agentSelection.is_presetAgent });
    },
    [agentSelection]
  );
  const setGuidSelectedAcpModel = useCallback(
    (model: React.SetStateAction<string | null>) => {
      agentSelection.setSelectedAcpModel(model, { persistPreference: !agentSelection.is_presetAgent });
    },
    [agentSelection]
  );
  const setGuidCurrentModel = useCallback((model: TProviderWithModel) => {
    void model;
    return Promise.resolve();
  }, []);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [canExpandDescription, setCanExpandDescription] = useState(false);

  // Reset guid-local UI state before paint so same-route navigations do not
  // briefly show the previous draft or preset assistant layout.
  useLayoutEffect(() => {
    guidInput.setInput('');
    guidInput.setFiles([]);
    guidInput.setLoading(false);
    if (!(location.state as { workspace?: string } | null)?.workspace) {
      guidInput.setDir('');
    }
    setIsLoopGoalMode(false);
    setIsScienceMode(true);
    setIsMedicalEvidenceMode(false);
    setIsSkillDepositionMode(false);
    setSelectedComputeHostIds([]);
    setIsDescriptionExpanded(false);
  }, [
    guidInput.setDir,
    guidInput.setFiles,
    guidInput.setInput,
    guidInput.setLoading,
    location.key,
    location.state,
    setIsLoopGoalMode,
    setIsScienceMode,
    setIsMedicalEvidenceMode,
    setIsSkillDepositionMode,
  ]);

  // Clear resetAssistant from location.state after the hook has consumed it,
  // so that re-renders don't re-trigger the reset logic.
  //
  // Must go through React Router's navigate — raw window.history.replaceState
  // with `location.pathname` would write the HashRouter virtual path (e.g.
  // '/guid') into the browser's real URL and strip the leading '#'. On the
  // next hard reload, the browser would then request '/guid' directly from
  // the dev server (which has no SPA fallback) and 404.
  useEffect(() => {
    if (!resetAssistantRequested && !preselectAgentKey) return;
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [resetAssistantRequested, preselectAgentKey, location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    const node = descriptionTextRef.current;
    if (!node || !agentSelection.is_presetAgent || !selectedAssistantDescription) {
      setCanExpandDescription(false);
      return;
    }

    const checkExpandable = () => {
      // In line-clamp mode, scrollWidth/scrollHeight can be unreliable in some engines.
      // Measure the natural multi-line height via an off-screen clone.
      const clone = node.cloneNode(true) as HTMLDivElement;
      const computed = window.getComputedStyle(node);
      clone.style.position = 'absolute';
      clone.style.visibility = 'hidden';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '-1';
      clone.style.left = '-99999px';
      clone.style.top = '0';
      clone.style.width = `${node.clientWidth}px`;
      clone.style.display = 'block';
      clone.style.overflow = 'visible';
      clone.style.whiteSpace = 'normal';
      clone.style.webkitLineClamp = 'unset';
      clone.style.webkitBoxOrient = 'unset';
      clone.style.lineHeight = computed.lineHeight;
      clone.style.fontSize = computed.fontSize;
      clone.style.fontWeight = computed.fontWeight;
      clone.style.letterSpacing = computed.letterSpacing;
      clone.style.fontFamily = computed.fontFamily;
      document.body.appendChild(clone);

      const expandedHeight = clone.scrollHeight;
      document.body.removeChild(clone);
      const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
      const canExpand = expandedHeight > lineHeight + 1;
      setCanExpandDescription(canExpand);
      if (!canExpand) {
        setIsDescriptionExpanded(false);
      }
    };

    checkExpandable();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => checkExpandable());
    observer.observe(node);
    return () => observer.disconnect();
  }, [agentSelection.is_presetAgent, selectedAssistantDescription]);

  const currentPresetAgentType = selectedAssistantRecord?.preset_agent_type || 'gemini';
  // Mirrors the assistant editor's Main Agent options — detected execution
  // engines from the shared agent catalog, so avatars resolve the same way.
  const agentSwitcherItems = useMemo(() => {
    if (!agentSelection.availableAgents) return [];
    return agentSelection.availableAgents
      .filter((a) => !a.is_preset && a.agent_type !== 'remote')
      .map((a) => {
        const key = a.backend || a.agent_type;
        const extensionAvatar = a.isExtension ? resolveExtensionAssetUrl(a.avatar) : undefined;
        const logo =
          extensionAvatar ||
          resolveAgentLogo({
            icon: a.icon,
            backend: a.backend || a.agent_type,
            custom_agent_id: a.custom_agent_id,
            isExtension: a.isExtension,
          });
        return {
          key,
          label: a.name,
          logo,
          isCurrent: key === currentPresetAgentType,
          isExtension: a.isExtension,
        };
      });
  }, [agentSelection.availableAgents, currentPresetAgentType]);

  const effectiveAgentRecord = useMemo(() => {
    return agentSelection.availableAgents?.find(
      (agent) =>
        !agent.is_preset && (agent.backend || agent.agent_type) === agentSelection.currentEffectiveAgentInfo.agent_type
    );
  }, [agentSelection.availableAgents, agentSelection.currentEffectiveAgentInfo.agent_type]);

  const effectiveAgentLogo = useMemo(
    () =>
      resolveAgentLogo({
        icon: effectiveAgentRecord?.icon,
        backend: effectiveAgentRecord?.backend || agentSelection.currentEffectiveAgentInfo.agent_type,
        custom_agent_id: effectiveAgentRecord?.custom_agent_id,
        isExtension: effectiveAgentRecord?.isExtension,
      }),
    [effectiveAgentRecord, agentSelection.currentEffectiveAgentInfo.agent_type]
  );
  const handlePresetAgentTypeSwitch = useCallback(
    async (nextType: string) => {
      // Only preset assistants (is_preset=true) expose `custom_agent_id` here, so this id is
      // always backed by the `/api/assistants` store. ACP custom agents are a separate store
      // (`ipcBridge.acpConversation.updateCustomAgent`) and do not carry `preset_agent_type`.
      // See commit 13858579d on main for the legacy single-store fix that this split already covers.
      const assistantId = agentSelection.selectedAgentInfo?.custom_agent_id;
      if (!assistantId || nextType === currentPresetAgentType) return;
      try {
        // Optimistically patch the shared `assistants.list` SWR cache so the hero
        // avatar/logo reflect the new preset_agent_type on the same frame as the
        // click. Without this, downstream memos (selectedAssistantRecord →
        // currentEffectiveAgentInfo → effectiveAgentLogo) lag a network roundtrip
        // behind the user action.
        await swrMutate(
          'assistants.list',
          (prev: Assistant[] | undefined) =>
            prev?.map((a) => (a.id === assistantId ? { ...a, preset_agent_type: nextType } : a)),
          { revalidate: false }
        );
        await ipcBridge.assistants.update.invoke({ id: assistantId, preset_agent_type: nextType });
        await Promise.all([swrMutate('assistants.list'), agentSelection.refreshCustomAgents()]);
        const agent_name =
          agentSelection.availableAgents?.find((a) => (a.backend || a.agent_type) === nextType)?.name || nextType;
        Message.success(t('guid.switchedToAgent', { agent: agent_name }));
      } catch (error) {
        console.error('[GuidPage] Failed to switch preset agent type:', error);
        Message.error(t('common.failed', { defaultValue: 'Failed' }));
      }
    },
    [agentSelection, currentPresetAgentType, t]
  );

  // Build the mention dropdown node
  const mentionDropdownNode = (
    <MentionDropdown
      menuRef={mention.mentionMenuRef}
      options={mention.filteredMentionOptions}
      selectedKey={mention.mentionMenuSelectedKey}
      onSelect={mention.selectMentionAgent}
    />
  );

  // Build the model selector node
  const modelSelectorNode = (
    <GuidModelSelector
      isGeminiMode={false}
      modelList={[]}
      current_model={undefined}
      setCurrentModel={setGuidCurrentModel}
      currentAcpCachedModelInfo={agentSelection.currentAcpCachedModelInfo}
      selectedAcpModel={agentSelection.selectedAcpModel}
      setSelectedAcpModel={setGuidSelectedAcpModel}
    />
  );

  const handleSpeechTranscript = useCallback(
    (transcript: string) => {
      guidInput.setInput((prev) => appendSpeechTranscript(prev, transcript));
    },
    [guidInput.setInput]
  );
  const { handleLiveTranscript } = useLiveTranscriptInsertion(guidInput.setInput);

  const handleStartSkillDepositionMode = useCallback(() => {
    if (isSkillDepositionMode) {
      setIsSkillDepositionMode(false);
      setIsScienceMode(true);
      return;
    }
    setIsSkillDepositionMode(true);
    setIsScienceMode(false);
    setIsMedicalEvidenceMode(false);
    setIsLoopGoalMode(false);
    setLoopGoal(undefined);
    guidInput.setInput((current) =>
      current.trim()
        ? current
        : buildDefaultLabSkillDepositionUserMessage({ workspaceDir: guidInput.dir, preferredLocale: localeKey })
    );
  }, [guidInput.dir, guidInput.setInput, isSkillDepositionMode, localeKey]);

  const handleOpenCollaborationMode = useCallback(() => {
    closePreview();
    Promise.resolve(navigate('/collaboration/messages')).catch((error) => {
      console.error('[GuidPage] Failed to open collaboration mode:', error);
    });
  }, [closePreview, navigate]);

  const handleOpenLeaderAgentMode = useCallback(() => {
    if (!leaderAgentBetaEnabled) {
      void navigate('/settings/beta');
      return;
    }
    closePreview();
    setIsMedicalEvidenceMode(false);
    setIsSkillDepositionMode(false);
    setIsLoopGoalMode(false);
    setLoopGoal(undefined);
    setGuidContextMode((current) => (current === 'leader-agent' ? undefined : 'leader-agent'));
  }, [closePreview, leaderAgentBetaEnabled, navigate]);

  const computeSelectorNode = (
    <SshHostSelector selectedIds={selectedComputeHostIds} onChange={setSelectedComputeHostIds} variant='contextPill' />
  );

  // Build the action row
  const actionRowNode = (
    <GuidActionRow
      files={guidInput.files}
      onFilesUploaded={guidInput.handleFilesUploaded}
      modelSelectorNode={modelSelectorNode}
      serverConfigNode={leaderAgentBetaEnabled ? computeSelectorNode : undefined}
      selectedAgent={agentSelection.selectedAgent}
      effectiveModeAgent={agentSelection.currentEffectiveAgentInfo.agent_type}
      selectedMode={agentSelection.selectedMode}
      onModeSelect={setGuidSelectedMode}
      is_presetAgent={agentSelection.is_presetAgent}
      selectedAgentInfo={agentSelection.selectedAgentInfo}
      assistants={agentSelection.assistants}
      localeKey={localeKey}
      onClosePresetTag={() => agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey)}
      agentLogo={effectiveAgentLogo}
      agentSwitcherItems={agentSwitcherItems}
      onAgentSwitch={(key) => {
        handlePresetAgentTypeSwitch(key).catch((err) => console.error('Failed to switch agent type:', err));
      }}
      allSkills={allSkills}
      disabledBuiltinSkills={guidDisabledBuiltinSkills ?? []}
      enabledSkills={enabledSkillsForMenu}
      lockedSkillIds={lockedModeSkillIds}
      skillSummary={modeSkillSummary}
      onToggleSkill={handleToggleSkill}
      mcpServers={visibleMcpServers}
      selectedMcpServerIds={selectedMcpServerIdsForMenu}
      lockedMcpServerIds={lockedModeMcpServerIds}
      mcpSummary={modeMcpSummary}
      onToggleMcpServer={handleToggleMcpServer}
      isLoopGoalMode={isLoopGoalMode}
      onToggleLoopGoalMode={() => {
        setIsLoopGoalMode((current) => {
          const next = !current;
          if (next) {
            setIsMedicalEvidenceMode(false);
            setIsSkillDepositionMode(false);
          }
          return next;
        });
      }}
      isScienceMode={isScienceMode}
      onToggleScienceMode={() => {
        setIsScienceMode((current) => {
          const next = !current;
          if (next) {
            setIsMedicalEvidenceMode(false);
            setIsSkillDepositionMode(false);
          }
          return next;
        });
      }}
      isMedicalEvidenceMode={isMedicalEvidenceMode}
      onToggleMedicalEvidenceMode={() => {
        setIsMedicalEvidenceMode((current) => {
          const next = !current;
          if (next) {
            setIsScienceMode(false);
            setIsLoopGoalMode(false);
            setLoopGoal(undefined);
            setIsSkillDepositionMode(false);
          } else {
            setIsScienceMode(true);
          }
          return next;
        });
      }}
      isSkillDepositionMode={isSkillDepositionMode}
      onStartSkillDepositionMode={handleStartSkillDepositionMode}
      onOpenCollaborationMode={handleOpenCollaborationMode}
      onOpenLeaderAgentMode={undefined}
      hidePresetTag
      speechInputNode={
        <SpeechInputButton
          disabled={guidInput.loading}
          onLiveTranscript={handleLiveTranscript}
          onTranscript={handleSpeechTranscript}
        />
      }
      loading={guidInput.loading}
      isButtonDisabled={send.isButtonDisabled}
      onSend={send.sendMessageHandler}
    />
  );

  const scienceWorkspaceLabels = useMemo(
    () => ({
      workInProject: t('guid.scienceProject.workInProject'),
      clearWorkspace: t('guid.scienceProject.clearWorkspace'),
      specifyWorkspace: t('guid.scienceProject.specifyWorkspace'),
      searchPlaceholder: t('guid.scienceProject.searchPlaceholder'),
      noProject: t('guid.scienceProject.noProject'),
    }),
    [t]
  );

  const skillDepositionContextBadge = isSkillDepositionMode ? (
    <span className={styles.skillDepositionContextBadge}>
      <OpenScienceIcon name='modeDeposition' size={15} visualScale={1.12} />
      <span className={styles.skillDepositionContextBadgeHint}>{t('guid.skillDeposition.contextHint')}</span>
      <button
        type='button'
        className={styles.skillDepositionContextBadgeClose}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsSkillDepositionMode(false);
          setIsScienceMode(true);
        }}
        aria-label={t('guid.skillDeposition.closeLabel')}
      >
        ×
      </button>
    </span>
  ) : null;

  const larkProjectContextBadge = activeLarkProjectContext ? (
    <span className={styles.leaderAgentContextBadge}>
      <CollaborationIcon name='project' size={15} visualScale={1.18} />
      <span className={styles.leaderAgentContextBadgeHint}>
        {t('guid.larkProject.contextHint', {
          defaultValue: '负责人 Agent 项目：{{tasklistName}}',
          tasklistName: activeLarkProjectContext.tasklistName,
        })}
      </span>
      {!isLarkProjectContextLocked ? (
        <button
          type='button'
          className={styles.skillDepositionContextBadgeClose}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setLarkProjectContext(undefined);
            setGuidContextMode((current) => (current === 'leader-agent' ? undefined : current));
          }}
          aria-label={t('guid.larkProject.closeLabel', { defaultValue: '关闭负责人 Agent 项目上下文' })}
        >
          ×
        </button>
      ) : null}
    </span>
  ) : null;

  const contextBadge =
    larkProjectContextBadge || skillDepositionContextBadge ? (
      <>
        {larkProjectContextBadge}
        {skillDepositionContextBadge}
      </>
    ) : null;

  return (
    <ConfigProvider getPopupContainer={() => guidContainerRef.current || document.body}>
      <div ref={guidContainerRef} className={styles.guidContainer}>
        <div
          className={`${styles.guidLayout} ${loopGoal && loopGoal.status !== 'deleted' ? styles.guidLayoutLoopGoal : ''} ${isGuidPreviewOpen ? styles.guidLayoutPreviewOpen : ''} ${isLeaderAgentPanelOpen && !isGuidPreviewOpen ? styles.guidLayoutLeaderAgentOpen : ''}`}
        >
          <div className={styles.guidHeroStack}>
            <div className={styles.heroHeader}>
              {agentSelection.is_presetAgent ? (
                <div className={styles.heroHeaderControls}>
                  <div className={styles.heroHeaderLeft}>
                    <Button
                      size='mini'
                      type='text'
                      shape='circle'
                      icon={<Left theme='outline' size={18} fill='currentColor' />}
                      className={styles.heroBackButton}
                      onClick={() => {
                        agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey);
                        guidInput.setInput('');
                        setIsDescriptionExpanded(false);
                      }}
                      aria-label={t('common.back')}
                    />
                    <p className={`${styles.heroTitle} text-2xl font-semibold mb-0 text-0`}>
                      <span className={styles.heroTitleInlineIcon} aria-hidden='true'>
                        {selectedAssistantAvatar?.kind === 'image' ? (
                          <img
                            src={selectedAssistantAvatar.value}
                            alt=''
                            width={28}
                            height={28}
                            style={{ objectFit: 'contain' }}
                          />
                        ) : selectedAssistantAvatar?.kind === 'emoji' ? (
                          <span className={styles.heroTitleEmoji}>{selectedAssistantAvatar.value}</span>
                        ) : (
                          <Robot theme='outline' size={26} fill='currentColor' />
                        )}
                      </span>
                      <span>{heroTitle}</span>
                    </p>
                  </div>
                </div>
              ) : (
                <ResearchHeroTitle localeKey={localeKey} />
              )}
            </div>

            {agentSelection.is_presetAgent ? (
              selectedAssistantDescription ? (
                <div
                  className={`${styles.heroSubtitle} ${isDescriptionExpanded ? styles.heroSubtitleExpanded : ''}`}
                  onClick={() => {
                    if (!canExpandDescription) return;
                    setIsDescriptionExpanded((v) => !v);
                  }}
                >
                  <div
                    ref={descriptionTextRef}
                    className={`${styles.heroSubtitleText} ${isDescriptionExpanded ? styles.heroSubtitleTextExpanded : ''}`}
                  >
                    {selectedAssistantDescription}
                  </div>
                  {canExpandDescription ? (
                    <Button
                      size='mini'
                      type='secondary'
                      shape='circle'
                      icon={<Down theme='outline' size={12} fill='currentColor' />}
                      className={`${styles.heroSubtitleToggle} ${isDescriptionExpanded ? styles.heroSubtitleToggleExpanded : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDescriptionExpanded((v) => !v);
                      }}
                      aria-label={
                        isDescriptionExpanded
                          ? t('common.collapse', { defaultValue: 'Collapse' })
                          : t('common.expand', { defaultValue: 'Expand' })
                      }
                    />
                  ) : null}
                </div>
              ) : null
            ) : agentSelection.availableAgents !== undefined ? (
              <AgentPillBar
                availableAgents={agentSelection.availableAgents}
                selectedAgentKey={agentSelection.selectedAgentKey}
                getAgentKey={agentSelection.getAgentKey}
                onSelectAgent={handleSelectAgentFromPillBar}
                suppressSelectionAnimation={resetAssistantRequested}
              />
            ) : null}
          </div>

          <div
            className={`${styles.guidSpectacleStage} ${isGuidPreviewOpen ? styles.guidSpectacleStagePreviewOpen : ''} ${isGuidPreviewOpen && guidPreviewLayoutMode === 'fullscreen' ? styles.guidSpectacleStagePreviewFull : ''} ${isLeaderAgentPanelOpen && !isGuidPreviewOpen ? styles.guidSpectacleStageLeaderAgentOpen : ''}`}
          >
            {isLeaderAgentPanelOpen && !isGuidPreviewOpen ? (
              <div className={styles.guidSpectacleLeft} aria-hidden={!isLeaderAgentPanelOpen}>
                <GuidLarkProjectPanel
                  expanded={isLeaderAgentPanelOpen}
                  activeContext={larkProjectContext}
                  onContextChange={setLarkProjectContext}
                  onDraftDescriptionReady={(description) => {
                    const trimmed = description.trim();
                    if (!trimmed) return;
                    guidInput.setInput((current) => {
                      const currentValue = current.trimEnd();
                      if (!currentValue) return trimmed;
                      return `${currentValue}\n\n${trimmed}`;
                    });
                  }}
                />
              </div>
            ) : null}
            <div className={styles.guidSpectacleRight}>
              {loopGoal && loopGoal.status !== 'deleted' ? (
                <LoopGoalBar loopGoal={loopGoal} variant='guid' onChange={setLoopGoal} />
              ) : null}
              <GuidInputCard
                input={guidInput.input}
                onInputChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onPaste={guidInput.onPaste}
                onFocus={guidInput.handleTextareaFocus}
                onBlur={guidInput.handleTextareaBlur}
                placeholder={typewriterPlaceholder || t('conversation.welcome.placeholder')}
                isInputActive={guidInput.isInputFocused}
                isFileDragging={guidInput.isFileDragging}
                isRunning={guidInput.loading}
                activeBorderColor={activeBorderColor}
                inactiveBorderColor={inactiveBorderColor}
                activeShadow={activeShadow}
                dragHandlers={guidInput.dragHandlers}
                mentionOpen={mention.mentionOpen}
                mentionSelectorBadge={null}
                mentionDropdown={mentionDropdownNode}
                files={guidInput.files}
                onRemoveFile={guidInput.handleRemoveFile}
                actionRow={actionRowNode}
                workspaceDir={guidInput.dir}
                onSelectWorkspace={(dir) => {
                  guidInput.setDir(dir);
                  setGuidContextMode('workspace');
                }}
                onClearWorkspace={() => {
                  guidInput.setDir('');
                  setGuidContextMode((current) => (current === 'workspace' ? undefined : current));
                }}
                isWorkspaceContextActive={guidContextMode === 'workspace'}
                onActivateWorkspaceContext={() => setGuidContextMode('workspace')}
                onDeactivateWorkspaceContext={() => {
                  setGuidContextMode((current) => (current === 'workspace' ? undefined : current));
                }}
                workspaceLabels={scienceWorkspaceLabels}
                contextBadge={contextBadge}
                contextLeading={leaderAgentBetaEnabled ? undefined : computeSelectorNode}
                collaborationLabel={activeLarkProjectContext?.tasklistName}
                collaborationButtonLabel={t('guid.larkProject.panelTitle')}
                isCollaborationContextActive={Boolean(activeLarkProjectContext || isLeaderAgentPanelOpen)}
                onToggleCollaborationContext={
                  leaderAgentBetaEnabled
                    ? () => {
                        if (isLarkProjectContextLocked) return;
                        handleOpenLeaderAgentMode();
                      }
                    : undefined
                }
              />
            </div>
            {isGuidPreviewOpen ? (
              <div className={styles.guidPreviewPanel}>
                <PreviewPanel
                  previewLayoutMode={guidPreviewLayoutMode}
                  onPreviewLayoutModeChange={setGuidPreviewLayoutMode}
                  onRequestHalfPanel={() => setGuidPreviewLayoutMode('split')}
                />
              </div>
            ) : null}
          </div>
        </div>
        <QuickActionButtons inactiveBorderColor={inactiveBorderColor} activeShadow={activeShadow} />
      </div>
    </ConfigProvider>
  );
};

export default GuidPage;
