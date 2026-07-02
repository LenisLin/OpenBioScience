import { LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';

const SUPPORTED_NEW_CONVERSATION_AGENT_TYPES = new Set(['acp']);
const DEPRECATED_RUNTIME_AGENT_TYPES = new Set(['openclaw-gateway', 'nanobot', 'remote', 'gemini', LEGACY_LOCAL_RUNTIME_ID]);

export const DEFAULT_NEW_CONVERSATION_AGENT = {
  agent_type: 'acp',
  backend: 'codex',
  name: 'Codex',
} as const;

export function isSupportedNewConversationAgent(agent: { agent_type: string }): boolean {
  return SUPPORTED_NEW_CONVERSATION_AGENT_TYPES.has(agent.agent_type);
}

export function isDeprecatedRuntimeAgentType(agentType?: string | null): boolean {
  return Boolean(agentType && DEPRECATED_RUNTIME_AGENT_TYPES.has(agentType));
}

export function resolveSupportedConversationType(_backend?: string | null): 'acp' {
  return 'acp';
}

export function normalizeSupportedAgentSelection(
  agentType?: string,
  backend?: string
): { agent_type: 'acp'; backend?: string } | undefined {
  if (agentType === LEGACY_LOCAL_RUNTIME_ID || backend === LEGACY_LOCAL_RUNTIME_ID) {
    return { agent_type: 'acp', backend: 'codex' };
  }

  if (agentType === 'acp') {
    return { agent_type: 'acp', backend };
  }

  if (agentType && !isDeprecatedRuntimeAgentType(agentType)) {
    return { agent_type: resolveSupportedConversationType(agentType), backend: agentType };
  }

  if (backend && !isDeprecatedRuntimeAgentType(backend)) {
    return { agent_type: resolveSupportedConversationType(backend), backend };
  }

  return undefined;
}
