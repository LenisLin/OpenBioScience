/**
 * Codex Chat E2E Tests - Mid-Conversation Switch (P1)
 *
 * Test Cases Covered:
 * - TC-A-08: Continuous switch (model → permission → model)
 * - TC-A-09: Multi-round after switch
 *
 * Prerequisites:
 * - codex binary available
 * - User logged in
 * - At least 2 ACP models available
 *
 * Data-testid references:
 * - CodexModelSelector: data-testid="codex-model-selector"
 * - AgentModeSelector: data-testid="agent-mode-selector-codex"
 */

import { test, expect } from '../../../fixtures';
import {
  resolveCodexPreconditions,
  cleanupE2ECodexConversations,
  createCodexConversationViaBridge,
  sendCodexMessage,
  waitForCodexReply,
  getCodexConversationDB,
  getCodexMessages,
  createTempWorkspace,
  type CodexTestModels,
} from '../../../helpers';
import { takeScreenshot } from '../../../helpers/screenshots';

test.describe('Codex Chat - Mid-Conversation Switch (P1)', () => {
  test.setTimeout(180000); // 3 minutes (longer for multi-round tests)

  let preconditions: { binary: string | null; models: CodexTestModels | null };

  test.beforeAll(async ({ page }) => {
    preconditions = await resolveCodexPreconditions(page);
    if (!preconditions.binary || !preconditions.models) {
      test.skip(true, 'No codex-compatible provider found, skipping E2E tests');
    }
  });

  test.afterEach(async ({ page }) => {
    // Cleanup order: ESC × 5 → DB → sessionStorage
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
    }

    await cleanupE2ECodexConversations(page);

    await page.evaluate(() => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.startsWith('codex_initial_message_') || key.startsWith('codex_initial_processed_'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    });
  });

  // ============================================================================
  // TC-A-08: Continuous switch (model → permission → model)
  // ============================================================================

  test.skip('TC-A-08: should handle continuous switch (model → permission → model)', async ({ page }) => {
    // SKIP: Pending codex binary investigation - runtime provider+mode switch causes silent hang on subsequent messages
    // See tests/e2e/docs/chat-codex/implementation-mapping.zh.md "Known Issues" section
    // Symptom: After model+permission switches, 2nd message stuck at conv.status=running/pending, no AI reply (2.7min timeout)
    // DB evidence: msg count=3 (user1, ai1, user2), missing 2nd AI reply
    // Next: Product team investigation of codex binary runtime state handling

    if (!preconditions.models!.modelB) {
      test.skip(true, 'Need 2nd codex-compatible model for mid-conversation switch');
    }

    const timestamp = Date.now();
    const conversationName = `E2E-codex-${timestamp}-continuous-switch`;
    const tempWorkspace = createTempWorkspace(`tc-a-08-${timestamp}`);

    try {
      // Step 1: Create conversation via bridge with modelA
      const conversationId = await createCodexConversationViaBridge(page, {
        name: conversationName,
        workspace: tempWorkspace.path,
        provider: preconditions.models!.modelA,
        sessionMode: 'default',
      });

      // Screenshot 01: conversation created
      await takeScreenshot(page, `chat-codex/tc-a-08/01-created.png`);

      // Step 2: Send initial message
      await sendCodexMessage(page, conversationId, 'Hello, initial message.');
      await waitForCodexReply(page, conversationId);

      // Screenshot 02: initial reply
      await takeScreenshot(page, `chat-codex/tc-a-08/02-initial-reply.png`);

      // Step 3: Navigate to conversation page
      await page.goto(`${page.url().split('#')[0]}#/conversation/${conversationId}`);
      await page.waitForLoadState('networkidle');

      // Step 4: Switch to modelB (model switch #1)
      const modelSelector = page.locator('[data-testid="codex-model-selector"]');
      await expect(modelSelector).toBeVisible({ timeout: 10000 });
      await modelSelector.click();
      await page.waitForTimeout(500);

      const secondModel = page.locator(`[data-testid="codex-model-option-${preconditions.models!.modelB.useModel}"]`);
      await secondModel.waitFor({ state: 'visible', timeout: 5000 });
      await secondModel.click();
      await page.waitForTimeout(1000);

      // Screenshot 03: model switched
      await takeScreenshot(page, `chat-codex/tc-a-08/03-model-switched.png`);

      // Step 5: Switch permission (mode switch)
      const modeSelector = page.locator('[data-testid="agent-mode-selector-codex"]');
      await expect(modeSelector).toBeVisible({ timeout: 10000 });
      await modeSelector.click();
      await page.waitForTimeout(500);

      const yoloOption = page.locator('[data-testid="codex-mode-option-yolo"]');
      await expect(yoloOption).toBeVisible();
      await yoloOption.click();
      await page.waitForTimeout(1000);

      // Screenshot 04: permission switched
      await takeScreenshot(page, `chat-codex/tc-a-08/04-permission-switched.png`);

      // Step 6: Switch back to modelA (model switch #2)
      await modelSelector.click();
      await page.waitForTimeout(500);

      const firstModel = page.locator(`[data-testid="codex-model-option-${preconditions.models!.modelA.useModel}"]`);
      await firstModel.waitFor({ state: 'visible', timeout: 5000 });
      await firstModel.click();
      await page.waitForTimeout(1000);

      // Screenshot 05: model switched again
      await takeScreenshot(page, `chat-codex/tc-a-08/05-model-switched-again.png`);

      // Step 7: Send message after all switches
      await sendCodexMessage(page, conversationId, 'After all switches.');
      await waitForCodexReply(page, conversationId);

      // Screenshot 06: final reply
      await takeScreenshot(page, `chat-codex/tc-a-08/06-final-reply.png`);

      // ============================================================================
      // DB Assertions
      // ============================================================================

      // 1. Verify final mode is yolo
      const conversation = await getCodexConversationDB(page, conversationId);
      const extra =
        typeof conversation.extra === 'string' ? JSON.parse(conversation.extra || '{}') : conversation.extra || {};
      expect(extra.sessionMode).toBe('yolo');

      // 2. Verify message count (at least 4: initial user/ai + final user/ai)
      const messages = await getCodexMessages(page, conversationId);
      expect(messages.length).toBeGreaterThanOrEqual(4);

      // 3. Verify all AI replies exist (message.status check not applicable for codex)
      const aiMessages = messages.filter((m) => m.position === 'left');
      expect(aiMessages.length).toBeGreaterThanOrEqual(2);
    } finally {
      await tempWorkspace.cleanup();
    }
  });

  // ============================================================================
  // TC-A-09: Multi-round after switch
  // ============================================================================

  test.skip('TC-A-09: should handle 3 rounds of conversation after model/permission switch', async ({ page }) => {
    // SKIP: Same root cause as TC-A-08 - codex binary runtime state handling issue after model+permission switches
    // See tests/e2e/docs/chat-codex/implementation-mapping.zh.md "Known Issues" section

    if (!preconditions.models!.modelB) {
      test.skip(true, 'Need 2nd codex-compatible model for mid-conversation switch');
    }

    const timestamp = Date.now();
    const conversationName = `E2E-codex-${timestamp}-multi-round`;
    const tempWorkspace = createTempWorkspace(`tc-a-09-${timestamp}`);

    try {
      // Step 1: Create conversation via bridge with modelA
      const conversationId = await createCodexConversationViaBridge(page, {
        name: conversationName,
        workspace: tempWorkspace.path,
        provider: preconditions.models!.modelA,
        sessionMode: 'default',
      });

      // Step 2: Send initial message
      await sendCodexMessage(page, conversationId, 'Round 1: Initial message.');
      await waitForCodexReply(page, conversationId);

      // Screenshot 01: after round 1
      await takeScreenshot(page, `chat-codex/tc-a-09/01-round1.png`);

      // Step 3: Navigate to conversation page
      await page.goto(`${page.url().split('#')[0]}#/conversation/${conversationId}`);
      await page.waitForLoadState('networkidle');

      // Step 4: Switch to modelB
      const modelSelector = page.locator('[data-testid="codex-model-selector"]');
      await expect(modelSelector).toBeVisible({ timeout: 10000 });
      await modelSelector.click();
      await page.waitForTimeout(500);

      const secondModel = page.locator(`[data-testid="codex-model-option-${preconditions.models!.modelB.useModel}"]`);
      await secondModel.waitFor({ state: 'visible', timeout: 5000 });
      await secondModel.click();
      await page.waitForTimeout(1000);

      // Step 5: Switch permission
      const modeSelector = page.locator('[data-testid="agent-mode-selector-codex"]');
      await expect(modeSelector).toBeVisible({ timeout: 10000 });
      await modeSelector.click();
      await page.waitForTimeout(500);

      const yoloOption = page.locator('[data-testid="codex-mode-option-yolo"]');
      await expect(yoloOption).toBeVisible();
      await yoloOption.click();
      await page.waitForTimeout(1000);

      // Screenshot 02: after switches
      await takeScreenshot(page, `chat-codex/tc-a-09/02-after-switches.png`);

      // Step 6: Round 2 - send and wait
      await sendCodexMessage(page, conversationId, 'Round 2: After model and permission switch.');
      await waitForCodexReply(page, conversationId);

      // Screenshot 03: after round 2
      await takeScreenshot(page, `chat-codex/tc-a-09/03-round2.png`);

      // Step 7: Round 3 - send and wait
      await sendCodexMessage(page, conversationId, 'Round 3: Continue with switched config.');
      await waitForCodexReply(page, conversationId);

      // Screenshot 04: after round 3
      await takeScreenshot(page, `chat-codex/tc-a-09/04-round3.png`);

      // Step 8: Round 4 (bonus) - send and wait
      await sendCodexMessage(page, conversationId, 'Round 4: Final message.');
      await waitForCodexReply(page, conversationId);

      // Screenshot 05: after round 4
      await takeScreenshot(page, `chat-codex/tc-a-09/05-round4.png`);

      // ============================================================================
      // DB Assertions
      // ============================================================================

      // 1. Verify message count (at least 8: 4 user + 4 ai)
      const messages = await getCodexMessages(page, conversationId);
      expect(messages.length).toBeGreaterThanOrEqual(8);

      // 2. Verify all rounds have replies
      const userMessages = messages.filter((m) => m.position === 'right');
      const aiMessages = messages.filter((m) => m.position === 'left');

      expect(userMessages.length).toBeGreaterThanOrEqual(4);
      expect(aiMessages.length).toBeGreaterThanOrEqual(4);

      // 3. Verify all AI replies exist (message.status check not applicable for codex)
      expect(aiMessages.length).toBeGreaterThanOrEqual(4);

      // 4. Verify chronological order
      for (let i = 1; i < messages.length; i++) {
        expect(messages[i].createdAt).toBeGreaterThanOrEqual(messages[i - 1].createdAt);
      }
    } finally {
      await tempWorkspace.cleanup();
    }
  });
});
