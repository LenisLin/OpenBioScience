/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { ITeamChildTurnEvent, ITeamRunEvent, ITeamSlotWork, TTeam, TeamAgent } from '@/common/types/team/teamTypes';
import { buildTeamSendRuntime, buildTeamStopHandler, type TeamRunViewState } from '@/renderer/pages/team/components/teamSendRuntime';
import { useCallback, useEffect, useMemo, useState } from 'react';

type TeamConversationExtra = {
  team_id?: string;
  teamId?: string;
  team_slot_id?: string;
  teamSlotId?: string;
};

type TeamConversationRuntime = {
  team: TTeam;
  agent: TeamAgent;
  isLeaderAgent: boolean;
  allConversationIds: string[];
  teamSendMessage: (payload: { input: string; files: string[] }) => Promise<void>;
  teamRuntime: ReturnType<typeof buildTeamSendRuntime>;
};

function getConversationExtra(conversation: TChatConversation | undefined): TeamConversationExtra {
  return (conversation?.extra ?? {}) as TeamConversationExtra;
}

function findAgentForConversation(team: TTeam | null | undefined, conversationId: string, preferredSlotId?: string): TeamAgent | undefined {
  if (!team) return undefined;
  if (preferredSlotId) {
    const preferred = team.agents.find((agent) => agent.slot_id === preferredSlotId);
    if (preferred) return preferred;
  }
  return team.agents.find((agent) => agent.conversation_id === conversationId);
}

function indexSlotWork(slotWork?: ITeamSlotWork[]): Record<string, ITeamSlotWork | undefined> {
  const indexed: Record<string, ITeamSlotWork | undefined> = {};
  for (const work of slotWork ?? []) {
    indexed[work.slot_id] = work;
  }
  return indexed;
}

export function useTeamConversationRuntime(conversation: TChatConversation | undefined): TeamConversationRuntime | null {
  const [team, setTeam] = useState<TTeam | null>(null);
  const [activeRun, setActiveRun] = useState<ITeamRunEvent | undefined>(undefined);
  const [childTurnsBySlot, setChildTurnsBySlot] = useState<Record<string, ITeamChildTurnEvent | undefined>>({});
  const [slotWorkBySlot, setSlotWorkBySlot] = useState<Record<string, ITeamSlotWork | undefined>>({});

  const extra = getConversationExtra(conversation);
  const teamId = extra.team_id || extra.teamId;
  const preferredSlotId = extra.team_slot_id || extra.teamSlotId;

  useEffect(() => {
    let cancelled = false;
    if (!teamId || !conversation?.id) {
      setTeam(null);
      setActiveRun(undefined);
      setChildTurnsBySlot({});
      setSlotWorkBySlot({});
      return;
    }

    void ipcBridge.team.get
      .invoke({ id: teamId })
      .then((nextTeam) => {
        if (!cancelled) setTeam(nextTeam);
      })
      .catch(() => {
        if (!cancelled) setTeam(null);
      });

    return () => {
      cancelled = true;
    };
  }, [conversation?.id, teamId]);

  useEffect(() => {
    if (!teamId) return undefined;

    const refreshTeam = () => {
      void ipcBridge.team.get
        .invoke({ id: teamId })
        .then(setTeam)
        .catch((): void => undefined);
    };
    const removeListChanged = ipcBridge.team.listChanged.on((event) => {
      if (event.team_id === teamId) refreshTeam();
    });
    const removeAgentStatus = ipcBridge.team.agentStatusChanged.on((event) => {
      if (event.team_id === teamId) refreshTeam();
    });
    const removeRunStarted = ipcBridge.team.runStarted.on((event) => {
      if (event.team_id !== teamId) return;
      setActiveRun(event);
      setSlotWorkBySlot(indexSlotWork(event.slot_work));
    });
    const removeRunUpdated = ipcBridge.team.runUpdated.on((event) => {
      if (event.team_id !== teamId) return;
      setActiveRun(event);
      setSlotWorkBySlot(indexSlotWork(event.slot_work));
    });
    const clearRun = (event: ITeamRunEvent) => {
      if (event.team_id !== teamId) return;
      setActiveRun(undefined);
      setSlotWorkBySlot(indexSlotWork(event.slot_work));
      setChildTurnsBySlot({});
    };
    const removeRunCompleted = ipcBridge.team.runCompleted.on(clearRun);
    const removeRunCancelled = ipcBridge.team.runCancelled.on(clearRun);
    const removeRunFailed = ipcBridge.team.runFailed.on(clearRun);
    const rememberChildTurn = (event: ITeamChildTurnEvent) => {
      if (event.team_id !== teamId) return;
      setChildTurnsBySlot((previous) => ({ ...previous, [event.slot_id]: event }));
    };
    const forgetChildTurn = (event: ITeamChildTurnEvent) => {
      if (event.team_id !== teamId) return;
      setChildTurnsBySlot((previous) => ({ ...previous, [event.slot_id]: undefined }));
    };
    const removeChildStarted = ipcBridge.team.childTurnStarted.on(rememberChildTurn);
    const removeChildCompleted = ipcBridge.team.childTurnCompleted.on(forgetChildTurn);
    const removeChildCancelled = ipcBridge.team.childTurnCancelled.on(forgetChildTurn);

    return () => {
      removeListChanged();
      removeAgentStatus();
      removeRunStarted();
      removeRunUpdated();
      removeRunCompleted();
      removeRunCancelled();
      removeRunFailed();
      removeChildStarted();
      removeChildCompleted();
      removeChildCancelled();
    };
  }, [teamId]);

  const agent = useMemo(
    () => findAgentForConversation(team, conversation?.id ?? '', preferredSlotId),
    [conversation?.id, preferredSlotId, team]
  );

  const runView = useMemo<TeamRunViewState>(
    () => ({
      activeRun,
      childTurnsBySlot,
      slotWorkBySlot,
    }),
    [activeRun, childTurnsBySlot, slotWorkBySlot]
  );

  const onStop = useMemo(() => {
    if (!teamId || !agent?.slot_id) return undefined;
    return buildTeamStopHandler({
      team_id: teamId,
      slot_id: agent.slot_id,
      runView,
      pauseSlotWork: ipcBridge.team.pauseSlotWork.invoke,
    });
  }, [agent?.slot_id, runView, teamId]);

  const teamRuntime = useMemo(() => {
    if (!agent?.slot_id) return undefined;
    return buildTeamSendRuntime({
      slot_id: agent.slot_id,
      runView,
      onStop,
    });
  }, [agent?.slot_id, onStop, runView]);

  const teamSendMessage = useCallback(
    async (payload: { input: string; files: string[] }) => {
      if (!teamId || !agent?.slot_id) return;
      if (agent.role === 'leader') {
        await ipcBridge.team.sendMessage.invoke({
          team_id: teamId,
          input: payload.input,
          files: payload.files,
        });
        return;
      }
      await ipcBridge.team.sendMessageToAgent.invoke({
        team_id: teamId,
        slot_id: agent.slot_id,
        input: payload.input,
        files: payload.files,
      });
    },
    [agent?.role, agent?.slot_id, teamId]
  );

  if (!team || !agent || !teamRuntime) return null;

  return {
    team,
    agent,
    isLeaderAgent: agent.slot_id === team.leader_agent_id || agent.role === 'leader',
    allConversationIds: team.agents.map((item) => item.conversation_id).filter(Boolean),
    teamSendMessage,
    teamRuntime,
  };
}
