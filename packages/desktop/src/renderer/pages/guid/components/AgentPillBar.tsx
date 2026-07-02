/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import type { AgentSource } from '@/renderer/utils/model/agentTypes';
import type { AvailableAgent } from '../types';
import { Tooltip } from '@arco-design/web-react';
import { Right, Robot } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

type TargetAgent = {
  backend: 'claude' | 'codex' | 'opencode';
  label: string;
};

const TARGET_AGENTS: TargetAgent[] = [
  { backend: 'claude', label: 'Claude Code' },
  { backend: 'codex', label: 'Codex' },
  { backend: 'opencode', label: 'Open Code' },
];

type AgentPillBarProps = {
  availableAgents: AvailableAgent[];
  selectedAgentKey: string;
  getAgentKey: (agent: {
    agent_type: string;
    agent_source?: AgentSource;
    backend?: string;
    id?: string;
    custom_agent_id?: string;
  }) => string;
  onSelectAgent: (key: string) => void;
  suppressSelectionAnimation?: boolean;
};

function getBackend(agent: AvailableAgent): string {
  return agent.backend || agent.agent_type;
}

function isAgentDetected(agent: AvailableAgent): boolean {
  return agent.enabled !== false && agent.available !== false;
}

const AgentPillBar: React.FC<AgentPillBarProps> = ({
  availableAgents,
  selectedAgentKey,
  getAgentKey,
  onSelectAgent,
  suppressSelectionAnimation = false,
}) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const navigate = useNavigate();
  const { t } = useTranslation();

  const detectedByBackend = useMemo(() => {
    const map = new Map<string, AvailableAgent>();
    availableAgents.forEach((agent) => {
      if (agent.is_preset) return;
      if (!isAgentDetected(agent)) return;
      const backend = getBackend(agent);
      if (TARGET_AGENTS.some((target) => target.backend === backend)) {
        map.set(backend, agent);
      }
    });
    return map;
  }, [availableAgents]);

  const missingAgents = TARGET_AGENTS.filter((target) => !detectedByBackend.has(target.backend));

  return (
    <div className={styles.agentPillSection}>
      <div
        className={styles.agentPillBar}
        style={{
          width: isMobile ? 'calc(100% + 28px)' : 'fit-content',
          maxWidth: isMobile ? 'none' : '100%',
          marginLeft: isMobile ? -14 : 0,
          marginRight: isMobile ? -14 : 0,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          overflow: isMobile ? 'visible' : 'hidden',
        }}
      >
        {TARGET_AGENTS.map((target, index) => {
          const agent = detectedByBackend.get(target.backend);
          const isMissing = !agent;
          const key = agent ? getAgentKey(agent) : target.backend;
          const isSelected = !isMissing && selectedAgentKey === key;
          const logoSrc = resolveAgentLogo({
            icon: agent?.icon,
            backend: target.backend,
            custom_agent_id: agent?.custom_agent_id,
            isExtension: agent?.isExtension,
          });
          const label = target.label;

          const pill = (
            <div
              data-testid={`agent-pill-${target.backend}`}
              data-agent-pill='true'
              data-agent-key={key}
              data-agent-type={target.backend}
              data-agent-selected={isSelected ? 'true' : 'false'}
              data-agent-missing={isMissing ? 'true' : 'false'}
              className={`${styles.agentPillItem} ${isSelected ? styles.agentPillItemSelected : ''} ${
                isMissing ? styles.agentPillItemMissing : ''
              }`}
              style={isSelected && !isMobile && !suppressSelectionAnimation ? undefined : { animation: 'none' }}
              onClick={() => {
                if (isMissing) {
                  navigate('/settings/agent?tab=local');
                  return;
                }
                onSelectAgent(key);
              }}
            >
              {logoSrc ? (
                <img src={logoSrc} alt={`${label} logo`} width={20} height={20} className={styles.agentPillLogo} />
              ) : (
                <Robot theme='outline' size={20} fill='currentColor' className={styles.agentPillLogo} />
              )}
              <span className={styles.agentPillLabel}>{label}</span>
            </div>
          );

          return (
            <React.Fragment key={target.backend}>
              {!isMobile && index > 0 && <div className={styles.agentPillDivider}>|</div>}
              {isMissing ? (
                <Tooltip
                  content={t('guid.installMissingAgentsHint', {
                    defaultValue: '{{agents}} is not detected or not enabled. Install or enable it in Agent settings.',
                    agents: target.label,
                  })}
                >
                  {pill}
                </Tooltip>
              ) : (
                pill
              )}
            </React.Fragment>
          );
        })}
      </div>

      {missingAgents.length > 0 ? (
        <button
          type='button'
          className={styles.agentInstallNotice}
          onClick={() => navigate('/settings/agent?tab=local')}
        >
          <span>
            {t('guid.installMissingAgents', {
              defaultValue: '{{agents}} is not detected or not enabled. Install or enable it first.',
              agents: missingAgents.map((agent) => agent.label).join(', '),
            })}
          </span>
          <Right theme='outline' size={12} fill='currentColor' className={styles.agentInstallNoticeAction} />
        </button>
      ) : null}
    </div>
  );
};

export default AgentPillBar;
