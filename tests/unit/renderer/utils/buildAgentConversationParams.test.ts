import { describe, expect, it } from 'vitest';

import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
} from '@/common/utils/buildAgentConversationParams';
import { LEGACY_APP_NAMESPACE, LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';

const model = {
  provider: 'openai',
  use_model: 'gpt-4.1',
  model: 'gpt-4.1',
};

describe('buildAgentConversationParams agent type policy', () => {
  it('maps deprecated local runtime to ACP', () => {
    expect(getConversationTypeForBackend(LEGACY_LOCAL_RUNTIME_ID)).toBe('acp');
  });

  it('maps ACP vendors and deprecated runtime labels to acp', () => {
    for (const backend of [
      'claude',
      'codex',
      'gemini',
      'openclaw',
      'openclaw-gateway',
      'nanobot',
      'remote',
      LEGACY_LOCAL_RUNTIME_ID,
    ]) {
      expect(getConversationTypeForBackend(backend)).toBe('acp');
    }
  });

  it('builds OpenClaw as an ACP backend instead of openclaw-gateway', () => {
    const params = buildAgentConversationParams({
      backend: 'openclaw',
      name: 'OpenClaw',
      workspace: `/tmp/${LEGACY_APP_NAMESPACE}-openclaw`,
      model,
    });

    expect(params.type).toBe('acp');
    expect(params.extra.backend).toBe('openclaw');
    expect(params.extra.agent_name).toBe('OpenClaw');
    expect(params.extra.gateway).toBeUndefined();
  });

  it('creates Codex conversations as ACP backend conversations', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'Codex CLI',
      agent_name: 'Codex CLI',
      workspace: '/tmp/deeporganiser-codex',
      model,
    });

    expect(params.type).toBe('acp');
    expect(params.extra.backend).toBe('codex');
  });

  it('writes thought_level into ACP conversation extra when provided', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'Codex CLI',
      workspace: '/tmp/deeporganiser-codex',
      model,
      thought_level: 'high',
    });

    expect(params.type).toBe('acp');
    expect(params.extra.backend).toBe('codex');
    expect(params.extra.thought_level).toBe('high');
  });

  it('omits thought_level from ACP conversation extra when no preference exists', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'Codex CLI',
      workspace: '/tmp/deeporganiser-codex',
      model,
    });

    expect(params.extra.thought_level).toBeUndefined();
  });

  it('does not produce remote or nanobot top-level conversation types', () => {
    for (const backend of ['remote', 'nanobot']) {
      const params = buildAgentConversationParams({
        backend,
        name: backend,
        workspace: `/tmp/deeporganiser-${backend}`,
        model,
      });

      expect(params.type).toBe('acp');
      expect(params.extra.backend).toBe(backend);
      expect(params.extra.remote_agent_id).toBeUndefined();
    }
  });
});
