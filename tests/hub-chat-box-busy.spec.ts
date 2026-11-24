// Jordan, 2026-11-23: talking to the Video Editor while it worked, the box kept his sent prompt,
// shuffled his words while he typed, and Handy's dictation lost letters mid-word.
import { test, expect, type Page } from '@playwright/test';

const calls = (page: Page, command: string) => page.evaluate((c) => ((window as any).__hubCalls ?? []).filter((x: any) => x.command === c), command);
/** How far the chat's scroll view is from its bottom, in pixels (0 = following the newest text). */
const gapBelow = (page: Page) => page.evaluate(() => {
  const sc = document.querySelector<HTMLElement>('[data-testid="chat-thread"]');
  return sc ? sc.scrollHeight - sc.clientHeight - sc.scrollTop : -1;
});
const LONG = 'I want to start exploring the apps and studios we can use to iteratively work together on video editing, please list all of them';

test('chat box while the agent works: fast typing keeps every letter, and a sent message is delivered and cleared', async ({ page }) => {
  await page.goto('/hub.html#/agents/b1');
  await page.evaluate(() => { (window as any).__hubHoldRunning = true; });
  const box = page.locator('textarea').first();
  await box.fill('first job');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).length).toBe(1);
  await page.waitForTimeout(1500); // the agent is now busy
  await box.click();
  await page.keyboard.type(LONG, { delay: 4 });
  await page.waitForTimeout(2500); // keep watching while the page refreshes
  expect(await box.inputValue()).toBe(LONG);
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).map((c: any) => c.args.text)).toEqual(['first job', LONG]);
  await expect(box).toHaveValue('');
});

test('chat box in a long conversation while the agent works: fast typing keeps every letter', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { (window as any).__hubLongThread = true; });
  await page.goto('/hub.html#/agents/b1');
  await page.evaluate(() => { (window as any).__hubHoldRunning = true; });
  const box = page.locator('textarea').first();
  await box.fill('first job');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).length).toBe(1);
  await page.waitForTimeout(1500);
  await box.click();
  const text = `${LONG}. ${LONG}. ${LONG}.`;
  await expect(page.getByText(/30[0-9] messages/).first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.type(text, { delay: 2 });
  await page.waitForTimeout(2000);
  expect(await box.inputValue()).toBe(text);
});

test('chat follows the reply as it comes in, like Claude Code', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { (window as any).__hubLongThread = true; });
  await page.goto('/hub.html#/agents/b1');
  await page.evaluate(() => { (window as any).__hubHoldRunning = true; });
  await expect(page.getByText(/30[0-9] messages/).first()).toBeVisible({ timeout: 15_000 });
  const box = page.locator('textarea').first();
  await box.fill('go');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).length).toBe(1);
  for (let i = 1; i <= 6; i++) {
    await page.evaluate((i) => (window as any).__hubSay('t-b1', `Part ${i}.\n\n` + 'A long line of the reply that keeps going. '.repeat(30)), i);
    await page.waitForTimeout(1700);
  }
  await expect(page.getByText('Part 6.')).toHaveCount(1);
  await expect.poll(() => gapBelow(page)).toBeLessThan(40);
});

test('a sent message shows the agent working, not "Queued...", while it uses tools before any text', async ({ page }) => {
  await page.goto('/hub.html#/agents/b1');
  await page.evaluate(() => { (window as any).__hubHoldRunning = true; });
  const box = page.locator('textarea').first();
  await box.fill('do a long job');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).length).toBe(1);
  await page.waitForTimeout(2500);
  await expect(page.getByText('Queued...')).toHaveCount(0);
});

test('reopening a chat while its agent works: the chat follows new reply text within seconds', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { (window as any).__hubLongThread = true; });
  await page.goto('/hub.html#/agents/b1');
  await page.evaluate(() => { (window as any).__hubHoldRunning = true; });
  await expect(page.getByText(/30[0-9] messages/).first()).toBeVisible({ timeout: 15_000 });
  const box = page.locator('textarea').first();
  await box.fill('go');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).length).toBe(1);
  await page.goto('/hub.html#/agents/b2'); // leave
  await page.goto('/hub.html#/agents/b1'); // come back: no live stream for this run now
  await page.waitForTimeout(1500);
  for (let i = 1; i <= 3; i++) {
    await page.evaluate((i) => (window as any).__hubSay('t-b1', `Later part ${i}.\n\n` + 'More of the reply. '.repeat(40)), i);
    await expect(page.getByText(`Later part ${i}.`)).toHaveCount(1, { timeout: 6000 });
    await expect.poll(() => gapBelow(page)).toBeLessThan(40);
  }
});

test('chat keeps following the reply while Jordan dictates a long message into the box', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { (window as any).__hubLongThread = true; });
  await page.goto('/hub.html#/agents/b1');
  await page.evaluate(() => { (window as any).__hubHoldRunning = true; });
  await expect(page.getByText(/30[0-9] messages/).first()).toBeVisible({ timeout: 15_000 });
  const box = page.locator('textarea').first();
  await box.fill('go');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).length).toBe(1);
  await page.waitForTimeout(1500);
  await box.click();
  await page.keyboard.type(`${LONG}. ${LONG}.`, { delay: 1 });
  await box.press('Enter'); // queued: it now shows above the box
  await expect(box).toHaveValue('');
  await page.keyboard.type(`${LONG}. `.repeat(4), { delay: 1 }); // the box grows to its full height
  for (let i = 1; i <= 3; i++) {
    await page.evaluate((i) => (window as any).__hubSay('t-b1', `Dictation part ${i}.\n\n` + 'More of the reply. '.repeat(40)), i);
    await expect(page.getByText(`Dictation part ${i}.`)).toHaveCount(1, { timeout: 10000 });
    await expect.poll(() => gapBelow(page)).toBeLessThan(40);
  }
});

test('the chat stays at the bottom when the box grows and the queue appears, before any new reply', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { (window as any).__hubLongThread = true; });
  await page.goto('/hub.html#/agents/b1');
  await page.evaluate(() => { (window as any).__hubHoldRunning = true; });
  await expect(page.getByText(/30[0-9] messages/).first()).toBeVisible({ timeout: 15_000 });
  const box = page.locator('textarea').first();
  await box.fill('go');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).length).toBe(1);
  await expect.poll(() => gapBelow(page)).toBeLessThan(40);
  await box.click();
  await page.keyboard.type(`${LONG}. ${LONG}.`, { delay: 1 });
  await box.press('Enter'); // queued: the queue panel appears above the box
  await page.keyboard.type(`${LONG}. `.repeat(4), { delay: 1 }); // the box grows to its full height
  await page.waitForTimeout(500);
  expect(await gapBelow(page)).toBeLessThan(40);
});
