import { expect, test, type Page } from '@playwright/test';

// The Hub window in the browser preview (src/preview-hub.ts stands in for src-tauri/src/hub.rs).
// Each test checks that a button sends exactly its one backend action (JOBS.md J10 rule 3).
const calls = (page: Page, name: string): Promise<any[]> =>
  page.evaluate(n => ((window as any).__hubCalls ?? []).filter((c: any) => c.command === n), name);
const row = (page: Page, name: string) => page.getByRole('list', { name: 'Scheduled tasks' }).getByRole('listitem').filter({ hasText: name });

test('the Hub shows eight panels, Running now first, and only panels that are built', async ({ page }) => {
  await page.goto('/hub-classic.html');
  const nav = page.getByRole('navigation', { name: 'Panels' });
  await expect(nav.getByRole('button')).toHaveCount(8);
  await expect(nav.getByRole('button', { name: 'Running now' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Running now' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Memory', exact: true })).toContainText('14GB free');
  await expect(page.getByRole('list', { name: 'AI programs' }).getByRole('listitem')).toHaveCount(2);
});

test('run now sends hub_task_run_now with that exact task path', async ({ page }) => {
  await page.goto('/hub-classic.html');
  await row(page, 'Becky Stars Refresh').getByRole('button', { name: 'Run Becky Stars Refresh now' }).click();
  await expect.poll(async () => (await calls(page, 'hub_task_run_now')).map(c => c.args.path)).toEqual(['\\Becky Stars Refresh']);
});

test('the switch sends hub_task_set_enabled and the list re-reads the new state', async ({ page }) => {
  await page.goto('/hub-classic.html');
  const sweep = row(page, 'Agent Branch Sweep').getByRole('switch');
  await expect(sweep).toHaveAttribute('aria-checked', 'false');
  const readsBefore = (await calls(page, 'hub_running_now')).length;
  await sweep.click();
  await expect.poll(async () => (await calls(page, 'hub_task_set_enabled')).map(c => c.args)).toEqual([{ path: '\\Agent Branch Sweep', enabled: true }]);
  await expect.poll(async () => (await calls(page, 'hub_running_now')).length).toBeGreaterThan(readsBefore);
  await expect(sweep).toHaveAttribute('aria-checked', 'true');
});

test('shift-click selects a range and Run all runs each selected task once', async ({ page }) => {
  await page.goto('/hub-classic.html');
  await row(page, 'Agent Branch Sweep').getByText('Agent Branch Sweep').click();
  await row(page, 'Becky Stars Refresh').getByText('Becky Stars Refresh').click({ modifiers: ['Shift'] });
  await expect(page.getByRole('toolbar', { name: 'Selected tasks' })).toContainText('3');
  await page.getByRole('button', { name: 'Run all' }).click();
  await expect.poll(async () => (await calls(page, 'hub_task_run_now')).map(c => c.args.path).sort()).toEqual(
    ['\\Agent Branch Sweep', '\\Becky Playlist Scout (idle)', '\\Becky Stars Refresh'].sort());
});

test('ctrl-click adds and removes one task from the selection', async ({ page }) => {
  await page.goto('/hub-classic.html');
  await row(page, 'Agent Branch Sweep').getByText('Agent Branch Sweep').click();
  await row(page, 'MelancholyMonitor').getByText('MelancholyMonitor').click({ modifiers: ['Control'] });
  await expect(page.getByRole('toolbar', { name: 'Selected tasks' })).toContainText('2');
  await row(page, 'MelancholyMonitor').getByText('MelancholyMonitor').click({ modifiers: ['Control'] });
  await expect(page.getByRole('toolbar', { name: 'Selected tasks' })).toHaveCount(0);
});

test('each task state has its own look: failed, running, worked, switched off', async ({ page }) => {
  await page.goto('/hub-classic.html');
  await expect(row(page, 'Becky Stars Refresh').getByRole('img', { name: 'Last run failed' })).toBeVisible();
  await expect(row(page, 'MelancholyMonitor').getByRole('img', { name: 'Running now' })).toBeVisible();
  await expect(row(page, 'Becky Playlist Scout (idle)').getByRole('img', { name: 'Last run worked' })).toBeVisible();
  await expect(row(page, 'Agent Branch Sweep').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
});

test('a graphics card that does not answer shows a red question mark, not a number', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hubNoGpu = true; });
  await page.goto('/hub-classic.html');
  const gpu = page.getByRole('group', { name: 'Graphics card', exact: true });
  await expect(gpu).toContainText('?');
  await expect(page.getByRole('group', { name: 'Graphics card heat' })).toHaveCount(0);
});

test('other apps\' tasks sit in a closed fold below his own, and still work', async ({ page }) => {
  await page.goto('/hub-classic.html');
  const mine = page.getByRole('list', { name: 'Scheduled tasks' });
  await expect(mine.getByRole('listitem')).toHaveCount(4);
  const others = page.getByRole('list', { name: "Other apps' tasks" });
  await expect(others).toBeHidden();
  await page.getByText('Other apps').click();
  await others.getByRole('button', { name: 'Run AppleSoftwareUpdate now' }).click();
  await expect.poll(async () => (await calls(page, 'hub_task_run_now')).map(c => c.args.path)).toEqual(['\\AppleSoftwareUpdate']);
});

const openChats = async (page: Page) => { await page.goto('/hub-classic.html'); await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Chats' }).click(); };
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

const openAgents = async (page: Page) => { await page.goto('/hub-classic.html'); await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Agents' }).click(); };

test('agents: bots and scheduled chats show with their timing', async ({ page }) => {
  await openAgents(page);
  await expect(page.getByRole('list', { name: 'Bots list' }).getByRole('listitem')).toHaveText([/Chief of Staff/, /Inbox Sorter.*Paused/, /Clip Finder/]);
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

const openTools = async (page: Page) => { await page.goto('/hub-classic.html'); await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Tools' }).click(); };

test('tools: Transcribe sends each picked file as its own job, one at a time', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hubPick = ['C:/Videos/a.mp4', 'C:/Videos/b.mp4']; (window as any).__hubHoldJobs = true; });
  await openTools(page);
  await page.getByRole('button', { name: 'Transcribe' }).click();
  await expect.poll(async () => (await calls(page, 'hub_tool_run')).map(c => c.args)).toEqual([{ tool: 'transcribe', file: 'C:/Videos/a.mp4' }, { tool: 'transcribe', file: 'C:/Videos/b.mp4' }]);
  const rows = page.getByRole('list', { name: 'Jobs list' }).getByRole('listitem');
  await expect(rows.filter({ hasText: 'a.mp4' }).getByRole('img', { name: 'Working' })).toBeVisible();
  await expect(rows.filter({ hasText: 'b.mp4' }).getByRole('img', { name: 'Waiting its turn' })).toBeVisible();
});

test('tools: a finished job opens its result; Stop stops exactly that job', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hubPick = ['C:/Videos/a.mp4']; });
  await openTools(page);
  await page.getByRole('button', { name: 'Transcribe' }).click();
  await page.getByRole('button', { name: 'Open a.transcript.srt' }).click();
  await expect.poll(async () => (await calls(page, 'hub_open_path')).map(c => c.args)).toEqual([{ path: 'C:/Videos/a.transcript.srt', folder: false }]);
  await page.evaluate(() => { (window as any).__hubHoldJobs = true; (window as any).__hubPick = ['C:/Videos/c.mp4']; });
  await page.getByRole('button', { name: 'Transcribe' }).click();
  await page.getByRole('button', { name: 'Stop c.mp4' }).click();
  await expect.poll(async () => (await calls(page, 'hub_tool_stop')).map(c => c.args)).toEqual([{ id: 2 }]);
  await expect(page.getByRole('list', { name: 'Jobs list' }).getByRole('listitem').filter({ hasText: 'c.mp4' }).getByRole('img', { name: 'Stopped' })).toBeVisible();
});

test('tools: picking nothing starts nothing', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hubPick = []; });
  await openTools(page);
  await page.getByRole('button', { name: 'Transcribe' }).click();
  await expect(page.getByText('Nothing yet. Click a tool above and pick a file.')).toBeVisible();
  expect(await calls(page, 'hub_tool_run')).toEqual([]);
});

test('ask: the router picks the agent and model, and the chat starts with the words', async ({ page }) => {
  await page.goto('/hub-classic.html');
  await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Chats' }).click();
  await page.getByRole('textbox', { name: 'What do you want done?' }).fill('Fix the login bug');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByRole('status')).toHaveText('Sonnet 5.5 in Claude Code');
  const route = (await calls(page, 'model_routing_route'))[0].args;
  expect(route.text).toBe('Fix the login bug');
  expect(route.pool).toEqual([{ provider: 'claude', model: 'claude-sonnet-5-5', name: 'Sonnet 5.5' }, { provider: 'opencode', model: 'freellmapi/deepseek-v4-flash', name: 'DeepSeek V4 Flash' }]);
  expect((await calls(page, 'chat_create')).at(-1)!.args).toEqual({ provider: 'claude', model: 'claude-sonnet-5-5', mode: 'full' });
  expect((await calls(page, 'send_message')).at(-1)!.args.text).toBe('Fix the login bug');
  await expect(page.getByRole('textbox', { name: 'What do you want done?' })).toHaveValue('');
});

test('ask: with no rated model it still starts the first agent', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hubNoRoute = true; });
  await page.goto('/hub-classic.html');
  await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Chats' }).click();
  await page.getByRole('textbox', { name: 'What do you want done?' }).fill('Hello');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByRole('status')).toHaveText('Claude Code (no rated model fit)');
  expect((await calls(page, 'chat_create')).at(-1)!.args).toEqual({ provider: 'claude', model: 'default', mode: 'full' });
});

test('chats: an agent error shows in red with its real words; empty system lines are hidden', async ({ page }) => {
  await page.goto('/hub-classic.html');
  await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Chats' }).click();
  await page.getByRole('textbox', { name: 'What do you want done?' }).fill('FAIL');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'This harness cannot run here.' })).toBeVisible();
  await expect(page.getByText('changes', { exact: true })).toHaveCount(0);
});

test('voice: Start turns one voice on, the other waits, Stop turns it off', async ({ page }) => {
  await page.goto('/hub-classic.html');
  await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Voice' }).click();
  await page.getByRole('button', { name: 'Start Talk with Gemini' }).click();
  await expect(page.getByText('On now. Talk in its window.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Talk with Groq' })).toBeDisabled();
  await page.getByRole('button', { name: 'Stop Talk with Gemini' }).click();
  await expect(page.getByRole('button', { name: 'Start Talk with Groq' })).toBeEnabled();
  expect((await calls(page, 'hub_voice_start')).map(c => c.args)).toEqual([{ kind: 'gemini' }]);
  expect(await calls(page, 'hub_voice_stop')).toHaveLength(1);
});

test('providers: each agent shows if it works, why not, and what Ask may use', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hubBroken = true; });
  await page.goto('/hub-classic.html');
  await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Providers' }).click();
  const list = page.getByRole('list', { name: 'Installed agents' });
  await expect(list.getByRole('listitem', { name: 'Claude Code' }).getByRole('img', { name: 'Works' })).toBeVisible();
  await expect(list.getByRole('listitem', { name: 'Claude Code' })).toContainText('Ask uses it (your sign-in)');
  await expect(list.getByRole('listitem', { name: 'OpenCode' })).toContainText('Ask uses its 1 free models');
  await expect(list.getByRole('listitem', { name: 'Broken Agent' }).getByRole('img', { name: 'Not working' })).toBeVisible();
  await expect(list.getByRole('listitem', { name: 'Broken Agent' })).toContainText('Cursor exited before returning models');
  await expect(page.getByRole('region', { name: 'Not installed' })).toContainText('Cursor');
  await list.getByRole('button', { name: 'Check Claude Code again' }).click();
  await expect.poll(async () => (await calls(page, 'list_provider_models')).some(c => c.args.provider === 'claude' && c.args.force === true)).toBe(true);
});

test('usage: a bar per day for two weeks, and which models did the work', async ({ page }) => {
  await page.goto('/hub-classic.html');
  await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Usage' }).click();
  await expect(page.getByRole('region', { name: 'Work per day' }).getByRole('listitem')).toHaveCount(14);
  const models = page.getByRole('region', { name: 'Models this week' });
  await expect(models.getByRole('listitem').first()).toContainText('Claude Opus 5.5');
  await expect(models.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Read again' }).click();
  await expect.poll(async () => (await calls(page, 'usage_ledger')).map(c => c.args.refresh)).toEqual([false, true]);
});

test('providers: says it is looking while the agent scan runs', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hubSlowProviders = true; });
  await page.goto('/hub-classic.html');
  await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Providers' }).click();
  await expect(page.getByRole('status')).toContainText('Looking for your agents');
  await expect(page.getByRole('list', { name: 'Installed agents' }).getByRole('listitem').first()).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('skills: made-for-you first, search, filters, open, and multi-select', async ({ page }) => {
  await page.goto('/hub-classic.html');
  await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: 'Skills' }).click();
  const rows = page.getByRole('list', { name: 'Skills list' }).getByRole('listitem');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toHaveAccessibleName('agent-firefox');
  await page.getByRole('button', { name: /Made for you/ }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: /Made for you/ }).click();
  const filters = page.getByRole('group', { name: 'Filters' });
  await filters.getByRole('button', { name: 'Agents' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('ON');
  await filters.getByRole('button', { name: 'All' }).click();
  await page.getByRole('textbox', { name: 'Search skills' }).fill('editing');
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Open video-rules' }).click();
  await expect.poll(async () => (await calls(page, 'hub_open_path')).map(c => c.args)).toEqual([{ path: 'X:/AI-2/rules/SKILL.md', folder: false }]);
  await page.getByRole('textbox', { name: 'Search skills' }).fill('');
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('toolbar', { name: 'Selected skills' })).toContainText('3');
  await page.getByRole('button', { name: 'Rebuild' }).click();
  await expect.poll(async () => (await calls(page, 'hub_skills_rebuild')).length).toBe(1);
});
