import { expect, test, type Page } from '@playwright/test';

// The Hub window in the browser preview (src/preview-hub.ts stands in for src-tauri/src/hub.rs).
// Each test checks that a button sends exactly its one backend action (JOBS.md J10 rule 3).
const calls = (page: Page, name: string): Promise<any[]> =>
  page.evaluate(n => ((window as any).__hubCalls ?? []).filter((c: any) => c.command === n), name);
const row = (page: Page, name: string) => page.getByRole('list', { name: 'Scheduled tasks' }).getByRole('listitem').filter({ hasText: name });

test('the Hub shows three panels, Running now first, and only panels that are built', async ({ page }) => {
  await page.goto('/hub.html');
  const nav = page.getByRole('navigation', { name: 'Panels' });
  await expect(nav.getByRole('button')).toHaveCount(3);
  await expect(nav.getByRole('button', { name: 'Running now' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Running now' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Memory', exact: true })).toContainText('14GB free');
  await expect(page.getByRole('list', { name: 'AI programs' }).getByRole('listitem')).toHaveCount(2);
});

test('run now sends hub_task_run_now with that exact task path', async ({ page }) => {
  await page.goto('/hub.html');
  await row(page, 'Becky Stars Refresh').getByRole('button', { name: 'Run Becky Stars Refresh now' }).click();
  await expect.poll(async () => (await calls(page, 'hub_task_run_now')).map(c => c.args.path)).toEqual(['\\Becky Stars Refresh']);
});

test('the switch sends hub_task_set_enabled and the list re-reads the new state', async ({ page }) => {
  await page.goto('/hub.html');
  const sweep = row(page, 'Agent Branch Sweep').getByRole('switch');
  await expect(sweep).toHaveAttribute('aria-checked', 'false');
  const readsBefore = (await calls(page, 'hub_running_now')).length;
  await sweep.click();
  await expect.poll(async () => (await calls(page, 'hub_task_set_enabled')).map(c => c.args)).toEqual([{ path: '\\Agent Branch Sweep', enabled: true }]);
  await expect.poll(async () => (await calls(page, 'hub_running_now')).length).toBeGreaterThan(readsBefore);
  await expect(sweep).toHaveAttribute('aria-checked', 'true');
});

test('shift-click selects a range and Run all runs each selected task once', async ({ page }) => {
  await page.goto('/hub.html');
  await row(page, 'Agent Branch Sweep').getByText('Agent Branch Sweep').click();
  await row(page, 'Becky Stars Refresh').getByText('Becky Stars Refresh').click({ modifiers: ['Shift'] });
  await expect(page.getByRole('toolbar', { name: 'Selected tasks' })).toContainText('3');
  await page.getByRole('button', { name: 'Run all' }).click();
  await expect.poll(async () => (await calls(page, 'hub_task_run_now')).map(c => c.args.path).sort()).toEqual(
    ['\\Agent Branch Sweep', '\\Becky Playlist Scout (idle)', '\\Becky Stars Refresh'].sort());
});

test('ctrl-click adds and removes one task from the selection', async ({ page }) => {
  await page.goto('/hub.html');
  await row(page, 'Agent Branch Sweep').getByText('Agent Branch Sweep').click();
  await row(page, 'MelancholyMonitor').getByText('MelancholyMonitor').click({ modifiers: ['Control'] });
  await expect(page.getByRole('toolbar', { name: 'Selected tasks' })).toContainText('2');
  await row(page, 'MelancholyMonitor').getByText('MelancholyMonitor').click({ modifiers: ['Control'] });
  await expect(page.getByRole('toolbar', { name: 'Selected tasks' })).toHaveCount(0);
});

test('each task state has its own look: failed, running, worked, switched off', async ({ page }) => {
  await page.goto('/hub.html');
  await expect(row(page, 'Becky Stars Refresh').getByRole('img', { name: 'Last run failed' })).toBeVisible();
  await expect(row(page, 'MelancholyMonitor').getByRole('img', { name: 'Running now' })).toBeVisible();
  await expect(row(page, 'Becky Playlist Scout (idle)').getByRole('img', { name: 'Last run worked' })).toBeVisible();
  await expect(row(page, 'Agent Branch Sweep').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
});

test('a graphics card that does not answer shows a red question mark, not a number', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hubNoGpu = true; });
  await page.goto('/hub.html');
  const gpu = page.getByRole('group', { name: 'Graphics card', exact: true });
  await expect(gpu).toContainText('?');
  await expect(page.getByRole('group', { name: 'Graphics card heat' })).toHaveCount(0);
});

test('other apps\' tasks sit in a closed fold below his own, and still work', async ({ page }) => {
  await page.goto('/hub.html');
  const mine = page.getByRole('list', { name: 'Scheduled tasks' });
  await expect(mine.getByRole('listitem')).toHaveCount(4);
  const others = page.getByRole('list', { name: "Other apps' tasks" });
  await expect(others).toBeHidden();
  await page.getByText('Other apps').click();
  await others.getByRole('button', { name: 'Run AppleSoftwareUpdate now' }).click();
  await expect.poll(async () => (await calls(page, 'hub_task_run_now')).map(c => c.args.path)).toEqual(['\\AppleSoftwareUpdate']);
});

const openChats = async (page: Page) => { await page.goto('/hub.html'); await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Chats' }).click(); };
const chatRow = (page: Page, name: string) => page.getByRole('list', { name: 'Chats' }).getByRole('listitem').filter({ hasText: name });

test('chats: archived chats are hidden, newest first, one button per installed agent', async ({ page }) => {
  await openChats(page);
  await expect(page.getByRole('list', { name: 'Chats' }).getByRole('listitem')).toHaveText([/Write the shorts captions/, /Fix the playlist scout/]);
  await expect(page.getByRole('button', { name: 'Claude Code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'OpenCode' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cursor' })).toHaveCount(0);
});

test('chats: Send sends the exact text to that chat, and the answer shows', async ({ page }) => {
  await openChats(page);
  await chatRow(page, 'Fix the playlist scout').click();
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText('It ran Qwen3.5-4B');
  await page.getByRole('textbox', { name: 'Message' }).fill('Use LFM3 instead');
  await page.getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect.poll(async () => (await calls(page, 'send_message')).map(c => c.args)).toEqual([{ sessionId: 'c1', text: 'Use LFM3 instead' }]);
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText('Done: Use LFM3 instead');
});

test('chats: a new chat button creates a chat for that agent and opens it', async ({ page }) => {
  await openChats(page);
  await page.getByRole('button', { name: 'OpenCode' }).click();
  await expect.poll(async () => (await calls(page, 'chat_create')).map(c => c.args)).toEqual([{ provider: 'opencode', model: 'default', mode: 'full' }]);
  await expect(page.getByRole('heading', { name: 'New chat' })).toBeVisible();
});

test('chats: Stop on a working chat sends stop_session for that chat', async ({ page }) => {
  await openChats(page);
  await chatRow(page, 'Write the shorts captions').click();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(async () => (await calls(page, 'stop_session')).map(c => c.args)).toEqual([{ sessionId: 'c2' }]);
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
});

test('chats: ctrl and shift select several; Stop all stops only the working ones', async ({ page }) => {
  await openChats(page);
  await chatRow(page, 'Write the shorts captions').click();
  await chatRow(page, 'Fix the playlist scout').click({ modifiers: ['Shift'] });
  await expect(page.getByRole('toolbar', { name: 'Selected chats' })).toContainText('2');
  await chatRow(page, 'Fix the playlist scout').click({ modifiers: ['Control'] });
  await expect(page.getByRole('toolbar', { name: 'Selected chats' })).toHaveCount(0);
  await chatRow(page, 'Fix the playlist scout').click({ modifiers: ['Control'] });
  await page.getByRole('button', { name: 'Stop all' }).click();
  await expect.poll(async () => (await calls(page, 'stop_session')).map(c => c.args)).toEqual([{ sessionId: 'c2' }]);
});

const openAgents = async (page: Page) => { await page.goto('/hub.html'); await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Agents' }).click(); };

test('agents: bots and scheduled chats show with their timing', async ({ page }) => {
  await openAgents(page);
  await expect(page.getByRole('list', { name: 'Bots list' }).getByRole('listitem')).toHaveText([/Chief of Staff/, /Inbox Sorter.*Paused/]);
  await expect(page.getByRole('list', { name: 'Scheduled chats list' }).getByRole('listitem')).toHaveText([/Morning news digest.*Every day at 07:30/, /Check the build.*Every 30 min/]);
});

test('agents: the switch pauses that bot and turns that scheduled chat on', async ({ page }) => {
  await openAgents(page);
  await page.getByRole('switch', { name: 'Chief of Staff working or paused' }).click();
  await expect.poll(async () => (await calls(page, 'bot_set_paused')).map(c => c.args)).toEqual([{ botId: 'b1', paused: true }]);
  await expect(page.getByRole('switch', { name: 'Chief of Staff working or paused' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: 'Check the build on or off' }).click();
  await expect.poll(async () => (await calls(page, 'schedule_set_enabled')).map(c => c.args)).toEqual([{ scheduleId: 's2', enabled: true }]);
  await expect(page.getByRole('switch', { name: 'Check the build on or off' })).toHaveAttribute('aria-checked', 'true');
});

test('agents: run now runs exactly that scheduled chat', async ({ page }) => {
  await openAgents(page);
  await page.getByRole('button', { name: 'Run Morning news digest now' }).click();
  await expect.poll(async () => (await calls(page, 'schedule_run_now')).map(c => c.args)).toEqual([{ scheduleId: 's1' }]);
});

test('agents: shift selects both bots, Resume all resumes each one', async ({ page }) => {
  await openAgents(page);
  const rows = page.getByRole('list', { name: 'Bots list' }).getByRole('listitem');
  await rows.filter({ hasText: 'Chief of Staff' }).click();
  await rows.filter({ hasText: 'Inbox Sorter' }).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('toolbar', { name: 'Selected bots' })).toContainText('2');
  await page.getByRole('button', { name: 'Resume all' }).click();
  await expect.poll(async () => (await calls(page, 'bot_set_paused')).map(c => c.args)).toEqual([{ botId: 'b1', paused: false }, { botId: 'b2', paused: false }]);
});

test('agents: ctrl selects two scheduled chats; Switch off turns off each', async ({ page }) => {
  await openAgents(page);
  const rows = page.getByRole('list', { name: 'Scheduled chats list' }).getByRole('listitem');
  await rows.filter({ hasText: 'Morning news digest' }).click();
  await rows.filter({ hasText: 'Check the build' }).click({ modifiers: ['Control'] });
  await page.getByRole('button', { name: 'Switch off' }).click();
  await expect.poll(async () => (await calls(page, 'schedule_set_enabled')).map(c => c.args)).toEqual([{ scheduleId: 's1', enabled: false }, { scheduleId: 's2', enabled: false }]);
});
