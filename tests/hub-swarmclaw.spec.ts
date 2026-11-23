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

test('org chart: only his agents, the coordinator above its worker; no person, no terminal sessions', async ({ page }) => {
  await open(page, '/org-chart');
  await expect(page.getByText('Chief of Staff').first()).toBeVisible();
  await expect(page.getByText('Inbox Sorter').first()).toBeVisible();
  for (const gone of ['Build the Hub', 'Find skill files']) await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Jordan', { exact: true })).toHaveCount(1); // only his profile button, not a chart card
  expect(await calls(page, 'hub_org')).toHaveLength(0);
  expect((await calls(page, 'bots_list')).length).toBeGreaterThan(0);
  await page.screenshot({ path: `${process.env.HUB_SHOT_DIR ?? 'test-results'}/sc-org-chart.png` });
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

test('style guide: a Hub page like the others, showing the guide the app serves', async ({ page }) => {
  await open(page, '/org-chart');
  await page.getByRole('button', { name: 'Style Guide' }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/style-guide');
  await expect(page.locator('iframe[title="Style Guide"]')).toHaveAttribute('src', 'http://hubpage.localhost/style-guide');
  await expect(page.getByRole('button', { name: 'Style Guide' })).toHaveAttribute('aria-current', 'page');
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

test('agents: each agent is a PandaCode bot; talking to one goes through the bot and streams its reply', async ({ page }) => {
  await open(page, '/agents/b1');
  await expect(page.getByText('Clip Finder').first()).toBeVisible();
  const box = page.locator('textarea').first();
  await box.fill('check the logs');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).map(c => [c.args.botId, c.args.text])).toEqual([['b1', 'check the logs']]);
  await expect(page.getByText('Done: check the logs').first()).toBeVisible();
  expect(await calls(page, 'send_message')).toHaveLength(0); // never a plain chat send
  await page.screenshot({ path: `${process.env.HUB_SHOT_DIR ?? 'test-results'}/sc-agents.png` });
});

test('agents: SwarmClaw layout with Chat and Config tabs and + Agent; pin sticks after reload', async ({ page }) => {
  await open(page, '/agents/b1');
  for (const tab of ['chat', 'config']) await expect(page.getByRole('button', { name: tab, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pin agent' }).first().click({ force: true });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Unpin agent' })).toHaveCount(1);
});

test('agents: + Agent opens the SwarmClaw agent form and saves a new PandaCode bot', async ({ page }) => {
  await open(page, '/agents/b1');
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await page.getByPlaceholder('e.g. SEO Researcher').fill('Thumbnail Maker');
  await page.getByPlaceholder('What does this agent do?').fill('Makes thumbnail ideas');
  await page.screenshot({ path: `${process.env.HUB_SHOT_DIR ?? 'test-results'}/sc-agent-form.png`, fullPage: true });
  await page.getByRole('button', { name: /^(Create|Test & Save)$/ }).click();
  await expect.poll(async () => (await calls(page, 'bot_create')).map(c => [c.args.input.name, c.args.input.role])).toEqual([['Thumbnail Maker', 'Makes thumbnail ideas']]);
  await expect(page.getByText('Thumbnail Maker').first()).toBeVisible();
  expect(['claude', 'opencode']).toContain((await calls(page, 'bot_create'))[0].args.input.provider); // a harness installed here
});
