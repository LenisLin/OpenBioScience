/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import { legacyEnvName } from '@/common/config/legacyIdentifiers';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { httpRequest, isBackendHttpError } from '@/common/adapter/httpBridge';
import type { IConversationMcpStatus, ISessionMcpServer } from '@/common/config/storage';
import type { ITeamRunAck, TeamAgent, TTeam } from '@/common/types/team/teamTypes';
import { getBuiltinMcpScriptPath } from '@/process/utils/initStorage';
import { BUILTIN_LARK_PROJECT_AGENT_ID, BUILTIN_LARK_PROJECT_AGENT_NAME } from '@/process/resources/builtinMcp/constants';
import { getProjectAgentDataDir } from './store';

type BackendTeamAgentInput = {
  name: string;
  role: 'lead' | 'teammate';
  backend: string;
  model?: string;
  custom_agent_id?: string;
};

const DEFAULT_PROJECT_AGENT_BACKEND = 'codex';

function normalizeTeamAgent(raw: unknown): TeamAgent {
  const value = (raw ?? {}) as Record<string, unknown>;
  const backend =
    (value.backend as string | undefined) ?? (value.agent_type as string | undefined) ?? DEFAULT_PROJECT_AGENT_BACKEND;
  return {
    slot_id: (value.slot_id as string | undefined) ?? '',
    conversation_id: (value.conversation_id as string | undefined) ?? '',
    role: value.role === 'lead' || value.role === 'leader' ? 'leader' : 'teammate',
    agent_type: backend,
    icon: value.icon as string | undefined,
    agent_name: (value.agent_name as string | undefined) ?? (value.name as string | undefined) ?? '',
    conversation_type: 'acp',
    status: 'idle',
    cli_path: value.cli_path as string | undefined,
    custom_agent_id: value.custom_agent_id as string | undefined,
    model: value.model as string | undefined,
    pending_confirmations: (value.pending_confirmations ?? value.pendingConfirmations ?? 0) as number,
  };
}

function normalizeTeam(raw: unknown): TTeam {
  const value = (raw ?? {}) as Record<string, unknown>;
  const agents = Array.isArray(value.agents) ? value.agents.map(normalizeTeamAgent) : [];
  return {
    id: (value.id as string | undefined) ?? '',
    user_id: (value.user_id as string | undefined) ?? 'system_default_user',
    name: (value.name as string | undefined) ?? '',
    workspace: (value.workspace as string | undefined) ?? '',
    workspace_mode: value.workspace_mode === 'isolated' ? 'isolated' : 'shared',
    leader_agent_id:
      (value.leader_agent_id as string | undefined) ??
      (value.lead_agent_id as string | undefined) ??
      agents.find((agent) => agent.role === 'leader')?.slot_id ??
      '',
    agents,
    session_mode: value.session_mode as string | undefined,
    created_at: (value.created_at as number | undefined) ?? 0,
    updated_at: (value.updated_at as number | undefined) ?? 0,
  };
}

function getProjectWorkspace(tasklistGuid: string): string {
  return path.join(getProjectAgentDataDir(), 'workspaces', 'project-team', tasklistGuid.replace(/[^A-Za-z0-9._-]+/g, '_'));
}

async function ensureProjectWorkspace(tasklistGuid: string): Promise<string> {
  const workspace = getProjectWorkspace(tasklistGuid);
  await fs.mkdir(workspace, { recursive: true });
  return workspace;
}

function getProjectAgentMcpServer(): ISessionMcpServer {
  const backendPort = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
  const env: Record<string, string> = {
    DEEPORGANISER_DATA_DIR: app.getPath('userData'),
    DEEPORGANISER_PROJECT_AGENT_DIR: getProjectAgentDataDir(),
    [legacyEnvName('DATA_DIR')]: app.getPath('userData'),
  };
  if (backendPort) {
    env.DEEPORGANISER_BACKEND_PORT = String(backendPort);
    env[legacyEnvName('BACKEND_PORT')] = String(backendPort);
  }
  return {
    id: BUILTIN_LARK_PROJECT_AGENT_ID,
    name: BUILTIN_LARK_PROJECT_AGENT_NAME,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [getBuiltinMcpScriptPath('builtin-mcp-lark-project-agent')],
      env,
    },
  };
}

function getProjectAgentMcpStatuses(): IConversationMcpStatus[] {
  return [
    {
      id: BUILTIN_LARK_PROJECT_AGENT_ID,
      name: BUILTIN_LARK_PROJECT_AGENT_NAME,
      status: 'loaded',
    },
  ];
}

export async function getTeam(teamId: string): Promise<TTeam | null> {
  try {
    return normalizeTeam(
      await httpRequest<unknown>('GET', `/api/teams/${encodeURIComponent(teamId)}`, undefined, { silentStatuses: [404] })
    );
  } catch {
    return null;
  }
}

export async function createLarkBackedTeam(input: {
  name: string;
  tasklistGuid: string;
  tasklistName?: string;
  leaderName?: string;
  leaderBackend?: string;
}): Promise<TTeam> {
  const leaderBackend = input.leaderBackend?.trim() || DEFAULT_PROJECT_AGENT_BACKEND;
  const workspace = await ensureProjectWorkspace(input.tasklistGuid);
  const team = await httpRequest<unknown>('POST', '/api/teams', {
    name: input.name,
    workspace,
    agents: [
      {
        name: input.leaderName?.trim() || '负责人 Agent',
        role: 'lead',
        backend: leaderBackend,
        model: 'default',
      } satisfies BackendTeamAgentInput,
    ],
  });
  const normalized = normalizeTeam(team);
  await markTeamConversations({
    team: normalized,
    tasklistGuid: input.tasklistGuid,
    tasklistName: input.tasklistName,
  });
  return normalized;
}

export async function ensureTeamSession(teamId: string): Promise<void> {
  await httpRequest<void>('POST', `/api/teams/${encodeURIComponent(teamId)}/session`);
}

export async function addTeamAgent(input: {
  teamId: string;
  name: string;
  backend?: string;
  customAgentId?: string;
}): Promise<TeamAgent> {
  const backend = input.backend?.trim() || DEFAULT_PROJECT_AGENT_BACKEND;
  const agent = await httpRequest<unknown>('POST', `/api/teams/${encodeURIComponent(input.teamId)}/agents`, {
    name: input.name,
    role: 'teammate',
    backend,
    model: 'default',
    ...(input.customAgentId ? { custom_agent_id: input.customAgentId } : {}),
  } satisfies BackendTeamAgentInput);
  return normalizeTeamAgent(agent);
}

export async function markTeamConversations(input: {
  team: TTeam;
  tasklistGuid?: string;
  tasklistName?: string;
  leaderPresetContext?: string;
  agentPresetContext?: string;
}): Promise<void> {
  await Promise.all(
    input.team.agents.map(async (agent) => {
      if (!agent.conversation_id) return;
      const roleContext =
        agent.role === 'leader'
          ? [
              '# Delegate Task Runtime Identity',
              `Your sourceConversationId for delegate_task is: ${agent.conversation_id}`,
              'Always include this sourceConversationId when calling delegate_task. The bridge rejects delegate_task calls from non-leader conversations.',
            ].join('\n')
          : [
              '# Delegate Task Runtime Identity',
              `Your conversationId is: ${agent.conversation_id}`,
              'You are a teammate slot, not the project leader. Do not call delegate_task; return delegation requests to the leader Agent.',
            ].join('\n');
      const presetContext = [agent.role === 'leader' ? input.leaderPresetContext : input.agentPresetContext, roleContext]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join('\n\n');
      await httpRequest<boolean>('PATCH', `/api/conversations/${encodeURIComponent(agent.conversation_id)}`, {
        extra: {
          team_id: input.team.id,
          team_slot_id: agent.slot_id,
          team_role: agent.role,
          agent_name: agent.agent_name,
          lark_project_tasklist_guid: input.tasklistGuid,
          lark_project_tasklist_name: input.tasklistName,
          lark_project_role: agent.role === 'leader' ? 'leader' : 'agent',
          session_mcp_servers: [getProjectAgentMcpServer()],
          mcp_servers: [BUILTIN_LARK_PROJECT_AGENT_NAME],
          mcp_statuses: getProjectAgentMcpStatuses(),
          ...(presetContext ? { preset_context: presetContext } : {}),
        },
        merge_extra: true,
      }).catch((): boolean => false);
    })
  );
}

export async function sendTeamMessage(input: { teamId: string; content: string; files?: string[] }): Promise<ITeamRunAck> {
  return httpRequest<ITeamRunAck>('POST', `/api/teams/${encodeURIComponent(input.teamId)}/messages`, {
    content: input.content,
    files: input.files,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTeamSlotBusyError(error: unknown): boolean {
  if (isBackendHttpError(error)) {
    return error.status === 409 && /slot is busy/i.test(error.backendMessage || JSON.stringify(error.body));
  }
  return error instanceof Error && /slot is busy/i.test(error.message);
}

export async function sendTeamMessageWithBusyRetry(
  input: { teamId: string; content: string; files?: string[] },
  options: { attempts?: number; delayMs?: number } = {}
): Promise<ITeamRunAck> {
  const attempts = Math.max(1, options.attempts ?? 8);
  const delayMs = Math.max(0, options.delayMs ?? 3_000);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await sendTeamMessage(input);
    } catch (error) {
      lastError = error;
      if (!isTeamSlotBusyError(error) || attempt === attempts) {
        throw error;
      }
      await sleep(delayMs);
    }
  }

  throw lastError;
}

export async function sendMessageToTeamAgent(input: {
  teamId: string;
  slotId: string;
  content: string;
  files?: string[];
}): Promise<ITeamRunAck> {
  return httpRequest<ITeamRunAck>(
    'POST',
    `/api/teams/${encodeURIComponent(input.teamId)}/agents/${encodeURIComponent(input.slotId)}/messages`,
    {
      content: input.content,
      files: input.files,
    }
  );
}
