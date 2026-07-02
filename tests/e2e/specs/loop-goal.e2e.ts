/**
 * Loop goal mode – creates and manages a continuously-running goal from Guid.
 */
import { expect, test } from '../fixtures';
import { goToGuid, takeScreenshot } from '../helpers';

async function openLoopGoalMenu(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('file-upload-btn').waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="file-upload-btn"]');
    const trigger = button?.parentElement;
    if (!trigger) {
      throw new Error('Guid plus dropdown trigger not found');
    }
    ['mouseenter', 'mouseover', 'mousemove'].forEach((type) => {
      trigger.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
  });
  await page.getByTestId('loop-goal-menu-item').first().waitFor({ state: 'visible', timeout: 10_000 });
}

test.describe('Loop Goal Mode', () => {
  test('enables goal mode from the plus menu without opening a create modal', async ({ page }) => {
    await goToGuid(page);

    await openLoopGoalMenu(page);
    await takeScreenshot(page, 'loop-goal-plus-menu');
    await page.getByTestId('loop-goal-menu-item').first().click();

    await expect(page.getByTestId('loop-goal-mode-pill')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('loop-goal-create-modal')).toHaveCount(0);
    await expect(page.getByTestId('loop-goal-bar')).toHaveCount(0);

    const textarea = page.locator('textarea').first();
    await textarea.fill('Continuously polish this product UX until the next useful improvement is obvious.');
    await expect(page.getByTestId('guid-send-btn')).toBeEnabled();
    await takeScreenshot(page, 'loop-goal-guid-mode-active');
  });
});
