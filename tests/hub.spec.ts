import { expect, test, type Page } from '@playwright/test';

// The Hub window in the browser preview (src/preview-hub.ts stands in for src-tauri/src/hub.rs).
// Each test checks that a button sends exactly its one backend action (JOBS.md J10 rule 3).
const calls = (page: Page, name: string): Promise<any[]> =>
  page.evaluate(n => ((window as any).__hubCalls ?? []).filter((c: any) => c.command === n), name);
const row = (page: Page, name: string) => page.getByRole('list', { name: 'Scheduled tasks' }).getByRole('listitem').filter({ hasText: name });

test('the Hub shows one panel, Running now, and only panels that are built', async ({ page }) => {
  await page.goto('/hub.html');
  const nav = page.getByRole('navigation', { name: 'Panels' });
  await expect(nav.getByRole('button')).toHaveCount(1);
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
