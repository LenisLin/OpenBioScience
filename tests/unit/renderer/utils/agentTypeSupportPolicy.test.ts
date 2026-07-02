import { describe, expect, it } from 'vitest';

import { LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';
import {
  isDeprecatedRuntimeAgentType,
  isSupportedNewConversationAgent,
  normalizeSupportedAgentSelection,
  resolveSupportedConversationType,
} from '@/renderer/utils/model/agentTypeSupportPolicy';

describe('Guid agent support policy', () => {
  it('allows only ACP for new conversations', () => {
    expect(isSupportedNewConversationAgent({ agent_type: 'acp' })).toBe(true);
    expect(isSupportedNewConversationAgent({ agent_type: LEGACY_LOCAL_RUNTIME_ID })).toBe(false);
    expect(isSupportedNewConversationAgent({ agent_type: 'openclaw-gateway' })).toBe(false);
    expect(isSupportedNewConversationAgent({ agent_type: 'nanobot' })).toBe(false);
    expect(isSupportedNewConversationAgent({ agent_type: 'remote' })).toBe(false);
    expect(isSupportedNewConversationAgent({ agent_type: 'gemini' })).toBe(false);
  });

  it('marks retired top-level runtime agent types as deprecated', () => {
    expect(isDeprecatedRuntimeAgentType('acp')).toBe(false);
    expect(isDeprecatedRuntimeAgentType(LEGACY_LOCAL_RUNTIME_ID)).toBe(true);
    expect(isDeprecatedRuntimeAgentType('openclaw-gateway')).toBe(true);
    expect(isDeprecatedRuntimeAgentType('nanobot')).toBe(true);
    expect(isDeprecatedRuntimeAgentType('remote')).toBe(true);
    expect(isDeprecatedRuntimeAgentType('gemini')).toBe(true);
  });

  it('resolves supported top-level conversation type from backend labels', () => {
    expect(resolveSupportedConversationType(LEGACY_LOCAL_RUNTIME_ID)).toBe('acp');
    expect(resolveSupportedConversationType('claude')).toBe('acp');
    expect(resolveSupportedConversationType('gemini')).toBe('acp');
    expect(resolveSupportedConversationType('openclaw-gateway')).toBe('acp');
  });

  it('allows OpenClaw when represented as an ACP backend', () => {
    const openclaw = { agent_type: 'acp', backend: 'openclaw' };

    expect(isSupportedNewConversationAgent(openclaw)).toBe(true);
    expect(normalizeSupportedAgentSelection('acp', 'openclaw')).toEqual({
      agent_type: 'acp',
      backend: 'openclaw',
    });
    expect(resolveSupportedConversationType('openclaw')).toBe('acp');
  });

  it('normalizes saved channel selections away from retired runtimes', () => {
    expect(normalizeSupportedAgentSelection(LEGACY_LOCAL_RUNTIME_ID)).toEqual({ agent_type: 'acp', backend: 'codex' });
    expect(normalizeSupportedAgentSelection('acp', 'claude')).toEqual({ agent_type: 'acp', backend: 'claude' });
    expect(normalizeSupportedAgentSelection(undefined, 'claude')).toEqual({ agent_type: 'acp', backend: 'claude' });
    expect(normalizeSupportedAgentSelection('remote', 'remote')).toBeUndefined();
    expect(normalizeSupportedAgentSelection('openclaw-gateway')).toBeUndefined();
    expect(normalizeSupportedAgentSelection('gemini')).toBeUndefined();
  });
});
