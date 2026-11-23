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
  for (const hollow of ['Archived', 'History']) await expect(page.getByRole('button', { name: hollow, exact: true })).toHaveCount(0);
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

test('chat box: + attaches a picture as a picture and a document by its full path', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hubPick = ['C:\\pics\\shot.png', 'X:\\notes\\plan.md']; });
  await open(page, '/agents/b1');
  await page.getByRole('button', { name: 'Add attachment' }).click();
  await expect(page.getByText('plan.md', { exact: true })).toBeVisible();
  const box = page.locator('textarea').first();
  await box.fill('look at these');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).map(c => [c.args.text, c.args.imageIds])).toEqual([[
    'look at these\n\nAttached files (full paths on this PC):\n- X:\\notes\\plan.md', ['img-C:\\pics\\shot.png']]]);
});

test('chat box: the speaker reads each reply once with becky-tts, and stays on after reload', async ({ page }) => {
  await open(page, '/agents/b1');
  const speaker = page.getByRole('button', { name: 'Read replies aloud' });
  await speaker.click();
  await expect(speaker).toHaveAttribute('aria-pressed', 'true');
  const box = page.locator('textarea').first();
  await box.fill('say **hi**');
  await box.press('Enter');
  await expect(page.getByText('Done: say').first()).toBeVisible();
  await expect.poll(async () => (await calls(page, 'hub_speak')).map(c => c.args.text)).toEqual(['Done: say hi']);
  await page.waitForTimeout(3000);
  expect(await calls(page, 'hub_speak')).toHaveLength(1); // read once, not again on refresh
  await page.reload();
  await expect(page.getByRole('button', { name: 'Read replies aloud' })).toHaveAttribute('aria-pressed', 'true');
});

test("chat box: the model menu lists the agent program's models and switches the agent", async ({ page }) => {
  await open(page, '/agents/b1');
  await page.getByRole('button', { name: 'Change model' }).click();
  await page.getByRole('menuitemradio', { name: 'Sonnet 5.5' }).click();
  await expect.poll(async () => (await calls(page, 'bot_update')).map(c => [c.args.botId, c.args.input.model])).toEqual([['b1', 'claude-sonnet-5-5']]);
  await expect(page.getByRole('button', { name: 'Change model' })).toHaveText(/Sonnet 5\.5/);
});

test('chat box: "/" lists Hub and agent commands; /agent opens another agent; window-only commands are refused', async ({ page }) => {
  await open(page, '/agents/b1');
  const box = page.locator('textarea').first();
  await box.fill('/');
  const list = page.getByRole('listbox', { name: 'Commands' });
  for (const name of ['/agent', '/rename', '/review', '/video-rules']) await expect(list.getByText(new RegExp(`^${name}`))).toBeVisible();
  await expect(list.getByText(/^\/permissions/)).toHaveCount(0); // a PandaCode window control
  await box.fill('/agent cl');
  await list.getByText('Clip Finder', { exact: true }).click();
  await expect(page).toHaveURL(/#\/agents\/b3$/);
  await expect(box).toHaveValue('');
  // A harness command goes to the agent as written.
  await box.fill('/review');
  await box.press('Escape');
  await box.press('Enter');
  await expect.poll(async () => (await calls(page, 'bot_message')).map(c => c.args.text)).toEqual(['/review']);
  await expect(page.getByText('Done: /review').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Stop/ })).toHaveCount(0);
  // A window control typed in full is not sent; the chat says where it works.
  await box.fill('/permissions');
  await box.press('Enter');
  await expect(page.getByText("/permissions works in PandaCode's main window, not in the Hub.")).toBeVisible();
  expect((await calls(page, 'bot_message')).length).toBe(1);
});

test('chat box: /rename and /model run in the Hub', async ({ page }) => {
  await open(page, '/agents/b1');
  const box = page.locator('textarea').first();
  await box.fill('/model sonnet');
  await box.press('Escape');
  await box.press('Enter');
  await expect(page.getByText('Now using Sonnet 5.5.')).toBeVisible();
  await expect.poll(async () => (await calls(page, 'bot_update')).map(c => c.args.input.model)).toEqual(['claude-sonnet-5-5']);
  await box.fill('/rename Morning notes');
  await box.press('Escape');
  await box.press('Enter');
  await expect(page.getByText('Renamed this chat to "Morning notes".')).toBeVisible();
  expect(await calls(page, 'bot_message')).toHaveLength(0);
});

test('chat box: "@" lists agents; a tagged agent gets the message in its own chat', async ({ page }) => {
  await open(page, '/agents/b1');
  const box = page.locator('textarea').first();
  await box.fill('please ask @cl');
  await page.getByRole('listbox', { name: 'Agents to tag' }).getByText('Clip Finder', { exact: true }).click();
  await expect(box).toHaveValue('please ask @Clip Finder ');
  await box.press('Enter');
  await expect(page.getByText('Also sent to Clip Finder')).toBeVisible();
  await expect.poll(async () => (await calls(page, 'bot_message')).map(c => [c.args.botId, c.args.text])).toEqual([
    ['b3', 'Jordan tagged you in his chat with Chief of Staff:\n\nplease ask @Clip Finder'],
    ['b1', 'please ask @Clip Finder'],
  ]);
});

test('look: Agents shows every agent as a card with its harness mascot and logo; a card opens its chat', async ({ page }) => {
  await open(page, '/agents');
  const card = page.getByRole('group', { name: 'All agents' }).getByRole('button', { name: /Chief of Staff/ }).filter({ has: page.getByRole('img', { name: 'Claude Code' }) });
  await expect(card).toBeVisible();
  // Claude Code agents are orange (the mascot carries the color), OpenCode ones are slate.
  const faces = await page.getByRole('group', { name: 'All agents' }).locator('img[src^="data:image/svg+xml"]').evaluateAll(imgs => imgs.map(i => decodeURIComponent((i as HTMLImageElement).src)));
  expect(faces.some(f => /fill="#[cd][0-9a-f]7[0-9a-f]{3}"/.test(f) && f.includes('d="M32.0 6.5L'))).toBe(true); // orange starburst body (Claude's logo)
  await card.click();
  await expect(page).toHaveURL(/#\/agents\/b1$/);
});

test('look: each agent chat wears its agent color; org chart cards show harness logos, not "claude-cli"', async ({ page }) => {
  await open(page, '/agents/b1');
  await expect.poll(() => page.locator('[style*="--agent-color"]').first().getAttribute('style')).toMatch(/--agent-color: #[0-9a-f]{6}/);
  await open(page, '/org-chart');
  await expect(page.getByRole('img', { name: 'Claude Code' }).first()).toBeVisible();
  await expect(page.getByText('claude-cli', { exact: true })).toHaveCount(0);
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
  // Parts that would not be saved on a bot are not shown.
  for (const hollow of ['OpenClaw', 'Can Delegate', 'Dreaming', 'Avatar seed (any text)']) await expect(page.getByText(hollow, { exact: true }).filter({ visible: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Claude Code', exact: true }).click();
  await page.getByRole('button', { name: 'Coordinator', exact: true }).click();
  await page.screenshot({ path: `${process.env.HUB_SHOT_DIR ?? 'test-results'}/sc-agent-form.png`, fullPage: true });
  await page.getByRole('button', { name: /^(Create|Test & Save)$/ }).click();
  await expect.poll(async () => (await calls(page, 'bot_create')).map(c => [c.args.input.name, c.args.input.role, c.args.input.provider, c.args.input.heartbeatMinutes])).toEqual([['Thumbnail Maker', 'Makes thumbnail ideas', 'claude', 0]]);
  await expect.poll(async () => (await calls(page, 'bot_set_org')).map(c => c.args.org.swarmRole)).toEqual(['coordinator']);
  await expect(page.getByText('Thumbnail Maker').first()).toBeVisible();
});

test('agents: Start from a template fills the form; a Hermes bot template makes a Hermes agent', async ({ page }) => {
  await open(page, '/agents/b1');
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await page.getByRole('button', { name: 'Start from a template' }).click();
  await expect(page.getByText('4 agent templates on this PC', { exact: false })).toBeVisible();
  await page.getByPlaceholder(/Search: writer/).fill('scout');
  await expect(page.getByText('Writer', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /scout/ }).click();
  await expect(page.getByPlaceholder('e.g. SEO Researcher')).toHaveValue('scout');
  await expect(page.getByPlaceholder('What does this agent do?')).toHaveValue('You are the Scout');
  await page.screenshot({ path: `${process.env.HUB_SHOT_DIR ?? 'test-results'}/sc-agent-template.png`, fullPage: true });
  await page.getByRole('button', { name: /^(Create|Test & Save)$/ }).click();
  await expect.poll(async () => (await calls(page, 'bot_create')).map(c => [c.args.input.name, c.args.input.provider, c.args.input.model, c.args.input.instructions])).toEqual([['scout', 'hermes', 'profile:scout', 'Prompt of scout']]);
});

test('agents: the Chief of Staff template makes a Claude Code coordinator', async ({ page }) => {
  await open(page, '/agents/b1');
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await page.getByRole('button', { name: 'Start from a template' }).click();
  await page.getByRole('button', { name: /Chief of Staff/ }).click();
  await expect(page.getByPlaceholder('e.g. SEO Researcher')).toHaveValue('Chief of Staff');
  await page.getByRole('button', { name: /^(Create|Test & Save)$/ }).click();
  await expect.poll(async () => (await calls(page, 'bot_create')).map(c => [c.args.input.name, c.args.input.provider])).toEqual([['Chief of Staff', 'claude']]);
  await expect.poll(async () => (await calls(page, 'bot_set_org')).map(c => c.args.org.swarmRole)).toEqual(['coordinator']);
});

test('agents: the skills list shows the ones made for him before anything is typed', async ({ page }) => {
  await open(page, '/agents/b1');
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await page.getByRole('button', { name: /Advanced Settings/ }).click();
  await expect(page.getByRole('button', { name: 'agent-firefox', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'video-rules', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '/deploy', exact: true })).toHaveCount(0);
});

test('agents page with no agents says how to make one instead of spinning', async ({ page }) => {
  await page.addInitScript(() => { (window as any).__hubNoBots = true; });
  await open(page, '/agents');
  await expect(page.getByRole('heading', { name: 'No agents yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Make an agent' }).click();
  await expect(page.getByRole('button', { name: 'Start from a template' })).toBeVisible();
});

test('agents: Config tab edits an agent and saves it to the bot without moving it on the Org Chart', async ({ page }) => {
  await open(page, '/agents/b1');
  await page.getByRole('button', { name: 'config', exact: true }).click();
  await page.getByText('Morning brief', { exact: true }).first().click(); // the agent's card
  const about = page.getByPlaceholder('What does this agent do?');
  await expect(about).toHaveValue('Morning brief');
  await about.fill('Morning brief and weekly plan');
  await page.getByRole('button', { name: /^(Save|Test & Save)$/ }).click();
  await expect.poll(async () => (await calls(page, 'bot_update')).map(c => [c.args.botId, c.args.input.role, c.args.input.heartbeatMinutes])).toEqual([['b1', 'Morning brief and weekly plan', 60]]);
  const org = (await calls(page, 'bot_set_org')).map(c => c.args.org);
  expect(org.every(o => o.onChart && o.parentId === null && o.swarmRole === 'coordinator')).toBe(true);
});

test('org chart: dragging an unplaced agent onto the chart saves its place on the bot', async ({ page }) => {
  await open(page, '/org-chart');
  const chip = page.getByText('Clip Finder', { exact: true }).first();
  await expect(chip).toBeVisible();
  await chip.dragTo(page.locator('body'), { targetPosition: { x: 900, y: 750 } });
  await expect.poll(async () => (await calls(page, 'bot_set_org')).map(c => [c.args.botId, c.args.org.onChart])).toContainEqual(['b3', true]);
});

test('schedules: agent schedules show beside Windows tasks; Run Now, Pause and Delete reach the bot', async ({ page }) => {
  await open(page, '/schedules');
  await expect(page.getByText('Weekday queue sweep').first()).toBeVisible();
  await expect(page.getByText('Becky Stars Refresh').first()).toBeVisible();
  const row = page.locator('div.w-full.text-left').filter({ hasText: 'Weekday queue sweep' });
  await row.getByRole('button', { name: 'Run Now' }).click();
  await expect.poll(async () => (await calls(page, 'bot_run_schedule_now')).map(c => c.args.scheduleId)).toEqual(['k1']);
  await row.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await calls(page, 'bot_schedule_set_enabled')).map(c => c.args)).toEqual([{ scheduleId: 'k1', enabled: false }]);
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(async () => (await calls(page, 'bot_schedule_delete')).map(c => c.args)).toEqual([{ botId: 'b1', scheduleId: 'k1' }]);
  await expect(page.getByText('Weekday queue sweep')).toHaveCount(0);
  // Windows tasks still have no Edit or Delete.
  const task = page.locator('div.w-full.text-left').filter({ hasText: 'Becky Stars Refresh' });
  for (const hollow of ['Edit', 'Delete']) await expect(task.getByRole('button', { name: hollow, exact: true })).toHaveCount(0);
});

test('schedules: + Schedule makes a schedule for the chosen agent', async ({ page }) => {
  await open(page, '/schedules');
  await page.getByRole('button', { name: 'Schedule', exact: true }).first().click();
  await page.getByText('Daily Digest', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Structured session' })).toHaveCount(0);
  await page.getByText('Clip Finder', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.screenshot({ path: `${process.env.HUB_SHOT_DIR ?? 'test-results'}/sc-schedule-when.png` });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /^(Create|Save)/ }).last().click();
  await expect.poll(async () => (await calls(page, 'bot_schedule_create')).map(c => [c.args.botId, c.args.input.title, c.args.input.kind])).toEqual([['b3', 'Daily Digest', 'daily']]);
  await expect(page.getByText('Daily Digest').first()).toBeVisible();
});

test('agents: any installed harness; skills, slash commands, MCP servers and a work project save on the bot', async ({ page }) => {
  await open(page, '/agents/b1');
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await page.getByPlaceholder('e.g. SEO Researcher').fill('Release Helper');
  await expect(page.getByRole('button', { name: 'Gemini CLI', exact: true })).toHaveCount(0); // free sign-in shut by Google
  await page.getByRole('button', { name: 'Qwen Code', exact: true }).click();
  await page.getByRole('button', { name: /Advanced Settings/ }).click();
  const search = page.getByPlaceholder('Search skills and slash commands');
  await search.fill('deploy');
  await page.getByRole('button', { name: '/deploy', exact: true }).click();
  await search.fill('firefox');
  await page.getByRole('button', { name: 'agent-firefox', exact: true }).click();
  await page.getByRole('button', { name: 'github', exact: true }).click();
  const project = page.locator('select').filter({ has: page.locator('option', { hasText: 'No project' }) });
  await expect(project.locator('option')).toHaveText(['No project', 'pandacode']); // a bot's own folder is not offered
  await project.selectOption('p1');
  await page.screenshot({ path: `${process.env.HUB_SHOT_DIR ?? 'test-results'}/sc-agent-skills.png`, fullPage: true });
  await page.getByRole('button', { name: /^(Create|Test & Save)$/ }).click();
  await expect.poll(async () => (await calls(page, 'bot_create')).map(c => c.args.input.provider)).toEqual(['qwen']);
  await expect.poll(async () => (await calls(page, 'skills_import_folder')).map(c => c.args.path)).toEqual(['C:/oc/deploy.md']); // agent-firefox is already in the library
  await expect.poll(async () => (await calls(page, 'bot_set_capabilities')).map(c => [c.args.skills, c.args.mcp])).toEqual([[['deploy', 'agent-firefox'], ['github']]]);
  await expect.poll(async () => (await calls(page, 'bot_set_work_project')).map(c => c.args.projectId)).toEqual(['p1']);
});

test('task board: PandaCode tasks by stage; a new task handed to an agent starts with its brief, then waits for review', async ({ page }) => {
  await open(page, '/tasks');
  await expect(page.getByText('Task Board', { exact: true })).toBeVisible();
  for (const column of ['Backlog', 'Running', 'Review', 'Failed']) await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
  for (const gone of ['Queued', 'Cancelled', 'Blocked', 'Overdue']) await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Import GitHub', { exact: true })).toBeHidden();
  await expect(page.getByText('Fix the playlist scout').first()).toBeVisible(); // answered, so it waits for review
  await expect(page.getByText('Old archived chat')).toHaveCount(0); // settled: behind Show Archived

  await page.getByRole('button', { name: '+ New Task' }).click();
  for (const gone of ['Priority', 'Images', 'Tags', 'Due Date', 'Quality Gate', 'Execution Policy']) await expect(page.getByText(gone, { exact: true })).toBeHidden();
  await page.getByPlaceholder('e.g. Run full site audit').fill('Caption the vlog');
  await page.getByRole('button', { name: /Chief of Staff/ }).first().click();
  await page.getByRole('button', { name: 'pandacode', exact: true }).click();
  await page.screenshot({ path: `${process.env.HUB_SHOT_DIR ?? 'test-results'}/sc-task-new.png`, fullPage: true });
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'create_board_task')).map(c => [c.args.projectId, c.args.provider, c.args.title])).toEqual([['p1', 'claude', 'Caption the vlog']]);
  await expect.poll(async () => (await calls(page, 'bot_assign_task')).map(c => c.args.botId)).toEqual(['b1']);

  const card = page.locator('[draggable]').filter({ hasText: 'Caption the vlog' });
  await card.hover();
  await card.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'send_message')).at(-1)?.args.text).toBe('Caption the vlog\n\nBot brief: you are Chief of Staff.');
  const statusOf = (title: string) => page.evaluate(async t => Object.values(await (await fetch('/api/tasks')).json() as Record<string, any>).find(x => x.title === t)?.status, title);
  await expect.poll(() => statusOf('Caption the vlog')).toBe('completed'); // the Review column
  await page.screenshot({ path: `${process.env.HUB_SHOT_DIR ?? 'test-results'}/sc-task-board.png`, fullPage: true });
});
