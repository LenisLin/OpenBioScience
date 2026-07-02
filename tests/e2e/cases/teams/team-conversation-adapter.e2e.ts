import { test, expect } from '../../fixtures';
import { invokeBridge, navigateTo } from '../../helpers';

test.describe('Team-backed conversation adapter', () => {
  test('opens a Team leader conversation through /conversation with Team metadata', async ({ page }) => {
    const teamName = `E2E Team Conversation Adapter-${Date.now()}`;
    const created = await invokeBridge<{
      id: string;
      leader_agent_id?: string;
      agents?: Array<{ slot_id: string; role: string; conversation_id: string }>;
    }>(page, 'team.create', {
      name: teamName,
      agents: [
        {
          name: 'Leader',
          role: 'lead',
          backend: 'codex',
          model: 'default',
        },
      ],
    });

    try {
      const team = await invokeBridge<{
        id: string;
        leader_agent_id?: string;
        agents: Array<{ slot_id: string; role: string; conversation_id: string }>;
      }>(page, 'team.get', { id: created.id });
      const leader =
        team.agents.find((agent) => agent.slot_id === team.leader_agent_id) ??
        team.agents.find((agent) => agent.role === 'leader' || agent.role === 'lead') ??
        team.agents[0];

      expect(leader?.conversation_id).toBeTruthy();

      await invokeBridge(page, 'conversation.update', {
        id: leader.conversation_id,
        updates: {
          extra: {
            team_id: team.id,
            team_slot_id: leader.slot_id,
            team_role: 'leader',
          },
        },
        merge_extra: true,
      });

      await navigateTo(page, `#/conversation/${leader.conversation_id}`);
      await page.waitForURL(new RegExp(`/conversation/${leader.conversation_id}`), { timeout: 10_000 });

      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('body')).toContainText('Leader', { timeout: 15_000 });
    } finally {
      if (created?.id) {
        await invokeBridge(page, 'team.remove', { id: created.id }).catch(() => undefined);
      }
    }
  });
});
