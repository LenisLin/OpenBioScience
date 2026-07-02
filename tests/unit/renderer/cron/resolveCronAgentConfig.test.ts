/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { LEGACY_LOCAL_RUNTIME_ID } from '@/common/config/legacyIdentifiers';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { resolveCronAgentConfig } from '@/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig';

describe('resolveCronAgentConfig', () => {
  it('migrates deprecated local runtime preset assistants to Codex ACP cron jobs', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'preset:assistant-1',
      conversationAgentType: 'acp',
      cliAgents: [],
      presetAssistants: [
        assistant({
          id: 'assistant-1',
          name: '文件规划助手',
          preset_agent_type: LEGACY_LOCAL_RUNTIME_ID,
        }),
      ],
      model_id: 'gemini-3.1-pro-preview',
      workspace: '/tmp/project',
      getMode: (backend) => (backend === 'codex' ? 'full-access' : 'yolo'),
    });

    expect(result).toEqual({
      resolvedAgentType: 'acp',
      agent_config: {
        backend: 'codex',
        name: '文件规划助手',
        is_preset: true,
        custom_agent_id: 'assistant-1',
        preset_agent_type: 'codex',
        mode: 'full-access',
        model_id: 'gemini-3.1-pro-preview',
        config_options: undefined,
        workspace: '/tmp/project',
      },
    });
  });

  it('keeps preset acp assistants on their backend slug', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'preset:assistant-2',
      conversationAgentType: 'acp',
      cliAgents: [],
      presetAssistants: [
        assistant({
          id: 'assistant-2',
          name: 'Codex 助手',
          preset_agent_type: 'codex',
        }),
      ],
      config_options: { reasoning_effort: 'high' },
      getMode: (backend) => (backend === 'codex' ? 'full-access' : 'yolo'),
    });

    expect(result).toEqual({
      resolvedAgentType: 'acp',
      agent_config: {
        backend: 'codex',
        name: 'Codex 助手',
        is_preset: true,
        custom_agent_id: 'assistant-2',
        preset_agent_type: 'codex',
        mode: 'full-access',
        config_options: { reasoning_effort: 'high' },
        model_id: undefined,
        workspace: undefined,
      },
    });
  });
});

function assistant(overrides: Pick<Assistant, 'id' | 'name' | 'preset_agent_type'>): Assistant {
  return {
    id: overrides.id,
    source: 'user',
    name: overrides.name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    preset_agent_type: overrides.preset_agent_type,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
  };
}
