import { expect, test, type Page } from '@playwright/test';

// The Hub window = SwarmClaw's own pages (src/sc) fed by our data through src/sc-hub/adapter.ts.
// Preview data comes from src/preview-hub.ts.

const calls = (page: Page, name: string): Promise<any[]> =>
  page.evaluate(n => ((window as any).__hubCalls ?? []).filter((c: any) => c.command === n), name);
const open = (page: Page, path: string) => page.goto(`/hub.html#${path}`);

test('sidebar shows only SwarmClaw pages that have real data, with SwarmClaw names', async ({ page }) => {
  await open(page, '/org-chart');
  for (const name of ['Org Chart', 'Skills', 'Providers', 'Usage', 'Style Guide']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  for (const hidden of ['Inbox', 'Wallets', 'Secrets', 'Marketplace', 'Star on GitHub', 'Join Discord']) await expect(page.getByText(hidden, { exact: true })).toHaveCount(0);
});

test('an unwired page address goes back to the Org Chart', async ({ page }) => {
  await open(page, '/wallets');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/org-chart');
});

test('org chart: Jordan on top, each live session under him, its helpers under it', async ({ page }) => {
  await open(page, '/org-chart');
  await expect(page.getByText('Build the Hub').first()).toBeVisible();
  await expect(page.getByText('Find skill files').first()).toBeVisible();
  await expect(page.getByText('Copying SwarmClaw pages').first()).toBeVisible();
  expect((await calls(page, 'hub_org')).length).toBeGreaterThan(0);
});

test('skills: SwarmClaw skills page lists the catalog with made-for-you tags', async ({ page }) => {
  await open(page, '/skills');
  await expect(page.getByText('agent-firefox').first()).toBeVisible();
  await expect(page.getByText('video-rules').first()).toBeVisible();
  await expect(page.getByText('made for you').first()).toBeVisible();
});

test('providers: installed agents only, and no SwarmClaw gateway or add buttons', async ({ page }) => {
  await open(page, '/providers');
  await expect(page.getByText('Claude Code').first()).toBeVisible();
  await expect(page.getByText('Cursor')).toHaveCount(0);
  for (const hollow of ['OpenClaw Gateways', '+ Gateway', 'Deploy on This Host']) await expect(page.getByText(hollow)).toHaveCount(0);
});

test('usage: SwarmClaw usage page reads the usage ledger', async ({ page }) => {
  await open(page, '/usage');
  await expect(page.getByText('Total Tokens', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  expect((await calls(page, 'usage_ledger')).length).toBeGreaterThan(0);
});

test('style guide: the sidebar button opens it with one command', async ({ page }) => {
  await open(page, '/org-chart');
  await page.getByRole('button', { name: 'Style Guide' }).click();
  await expect.poll(async () => (await calls(page, 'hub_open_style_guide')).length).toBe(1);
});

test('schedules: Windows tasks show, his own first; Run Now and Pause send the real task action', async ({ page }) => {
  await open(page, '/schedules');
  await expect(page.getByText('Becky Stars Refresh').first()).toBeVisible();
  await expect(page.getByText('delivery error').first()).toBeVisible(); // Stars Refresh last result 1
  for (const hollow of ['Archived', 'History', 'Edit', 'Archive']) await expect(page.getByRole('button', { name: hollow, exact: true })).toHaveCount(0);
  const row = page.locator('div.w-full.text-left').filter({ hasText: 'Becky Stars Refresh' });
  await row.getByRole('button', { name: 'Run Now' }).click();
  await expect.poll(async () => (await calls(page, 'hub_task_run_now')).map(c => c.args.path)).toEqual(['\\Becky Stars Refresh']);
  await row.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await calls(page, 'hub_task_set_enabled')).map(c => c.args)).toEqual([{ path: '\\Becky Stars Refresh', enabled: false }]);
  await page.screenshot({ path: process.env.HUB_SHOT_DIR ? `${process.env.HUB_SHOT_DIR}/sc-schedules.png` : 'test-results/sc-schedules.png' });
});

test('agents: SwarmClaw chat lists his PandaCode chats; sending streams the real reply', async ({ page }) => {
  await open(page, '/agents');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/agents/chat-c2'); // newest chat opens
  await expect(page.getByText('Fix the playlist scout').first()).toBeVisible();
  await expect(page.getByText('Old archived chat')).toHaveCount(0);
  await page.getByText('Fix the playlist scout').first().click();
  await expect(page.getByText('It ran Qwen3.5-4B on the graphics card.').first()).toBeVisible();
  const box = page.locator('textarea').first();
  await box.fill('check the logs');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'send_message')).map(c => [c.args.sessionId, c.args.text])).toEqual([['c1', 'check the logs']]);
  await expect(page.getByText('Done: check the logs').first()).toBeVisible();
  await page.screenshot({ path: `${process.env.HUB_SHOT_DIR ?? 'test-results'}/sc-agents.png` });
});

test('org chart: a working PandaCode chat shows under Jordan; idle chats do not', async ({ page }) => {
  await open(page, '/org-chart');
  await expect(page.getByText('Write the shorts captions').first()).toBeVisible();
  await expect(page.getByText('Fix the playlist scout')).toHaveCount(0);
});

test('agents: New chat makes a PandaCode chat with the same agent; pin sticks after reload; hollow buttons hidden', async ({ page }) => {
  await open(page, '/agents/chat-c1');
  await expect(page.getByText('It ran Qwen3.5-4B on the graphics card.').first()).toBeVisible();
  for (const hollow of ['Toggle voice', 'Toggle inspector', 'Add attachment', 'Select chats']) await expect(page.getByRole('button', { name: hollow })).toHaveCount(0);
  await page.getByRole('button', { name: 'Chat menu' }).click();
  await expect(page.getByText('Delete Chat')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Start a new chat session' }).click();
  await expect.poll(async () => (await calls(page, 'chat_create')).map(c => [c.args.provider, c.args.model])).toEqual([['claude', 'default']]);
  await page.getByRole('button', { name: 'Pin agent' }).first().click({ force: true });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Unpin agent' })).toHaveCount(1);
});
