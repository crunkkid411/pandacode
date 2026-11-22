import assert from 'node:assert/strict';
import test from 'node:test';
import { gb, heatTone, shortWhen, taskState, usedTone } from '../src/hub/facts.ts';

const task = over => ({ path: '\\T', name: 'T', enabled: true, state: 'Ready', lastRun: '11/22/2026 6:30:01 AM', lastResult: 0, nextRun: 'N/A', action: 'x', ...over });

test('each task shows one of five states, from Windows codes', () => {
  assert.equal(taskState(task({})), 'ok');
  assert.equal(taskState(task({ lastResult: 1 })), 'failed');
  assert.equal(taskState(task({ lastResult: -2147943467 })), 'failed');
  assert.equal(taskState(task({ state: 'Running' })), 'running');
  assert.equal(taskState(task({ lastResult: 0x41301 })), 'running');
  assert.equal(taskState(task({ lastResult: 0x41303 })), 'never');
  assert.equal(taskState(task({ lastRun: '11/30/1999 12:00:00 AM' })), 'never');
  assert.equal(taskState(task({ enabled: false, lastResult: 1 })), 'off');
});

test('colours: memory by share used, heat by the card limit', () => {
  assert.equal(usedTone(14000, 32000), 'ok');
  assert.equal(usedTone(6000, 32000), 'warn');
  assert.equal(usedTone(1000, 32000), 'bad');
  assert.equal(usedTone(0, 0), 'bad');
  assert.equal(heatTone(58), 'ok');
  assert.equal(heatTone(80), 'warn');
  assert.equal(heatTone(86), 'bad');
});

test('short dates: time today, weekday this week, month/day later', () => {
  const now = new Date(2026, 10, 22, 5, 0); // Sunday 22 November 2026
  assert.equal(shortWhen('11/22/2026 7:10:00 AM', now), '7:10 AM');
  assert.equal(shortWhen('11/23/2026 6:30:00 AM', now), 'Mon 6:30 AM');
  assert.equal(shortWhen('12/31/2099 11:59:00 PM', now), '12/31');
  assert.equal(shortWhen('N/A', now), '');
});

test('gigabytes: one decimal under 10, whole above', () => {
  assert.equal(gb(6011), '5.9');
  assert.equal(gb(14210), '14');
});

import { chatState, speaker, visibleChats } from '../src/hub/chats-facts.ts';

test('chat states: working, needs you, failed, idle', () => {
  assert.equal(chatState('running'), 'working');
  assert.equal(chatState('waiting_approval'), 'needs-you');
  assert.equal(chatState('limited'), 'needs-you');
  assert.equal(chatState('failed'), 'failed');
  assert.equal(chatState('interrupted'), 'failed');
  assert.equal(chatState('idle'), 'idle');
  assert.equal(chatState('completed'), 'idle');
});

test('chats: newest activity first, no drafts or archived', () => {
  const c = (id, at, extra = {}) => ({ id, title: id, provider: 'claude', model: 'default', status: 'idle', archived: false, createdAt: 1, updatedAt: 1, lastResponseAt: at, ...extra });
  assert.deepEqual(visibleChats([c('old', 10), c('new', 30), c('mid', 20), c('gone', 99, { archived: true }), c('draft', 98, { draft: true })]).map(x => x.id), ['new', 'mid', 'old']);
  assert.equal(speaker('user'), 'me');
  assert.equal(speaker('assistant'), 'agent');
  assert.equal(speaker('error'), 'error');
  assert.equal(speaker('changes'), 'note');
  assert.equal(speaker('changes'), 'note');
});

import { scheduleWhen, untilText } from '../src/hub/agents-facts.ts';

const sched = over => ({ id: 's', title: 'T', sessionTitle: 'C', projectName: 'P', prompt: '', kind: 'interval', intervalMinutes: 30, timeOfDay: null, days: [], watchSessionTitle: null, nextRunAt: null, lastRunAt: null, enabled: true, runCount: 0, ...over });

test('scheduled chats say how often they run, in plain words', () => {
  assert.equal(scheduleWhen(sched({})), 'Every 30 min');
  assert.equal(scheduleWhen(sched({ intervalMinutes: 120 })), 'Every 2 h');
  assert.equal(scheduleWhen(sched({ kind: 'daily', timeOfDay: '07:30' })), 'Every day at 07:30');
  assert.equal(scheduleWhen(sched({ kind: 'weekdays', timeOfDay: '09:00' })), 'Weekdays at 09:00');
  assert.equal(scheduleWhen(sched({ kind: 'weekly', days: [1, 3], timeOfDay: '18:00' })), 'Mon, Wed at 18:00');
  assert.equal(scheduleWhen(sched({ kind: 'after', watchSessionTitle: 'Build' })), 'After "Build"');
  assert.equal(scheduleWhen(sched({ kind: 'once' })), 'Once');
});

test('next run reads as a short countdown', () => {
  const now = 1_000_000_000_000;
  assert.equal(untilText(null, now), '');
  assert.equal(untilText(now - 5, now), 'now');
  assert.equal(untilText(now + 5 * 60_000, now), 'in 5 min');
  assert.equal(untilText(now + 3 * 3_600_000, now), 'in 3 h');
  assert.equal(untilText(now + 3 * 86_400_000, now), 'in 3 d');
});

import { routePool } from '../src/hub/chats-facts.ts';

test('the router chooses from real models only, a fair share per agent', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `freellmapi/m${i}`, name: `M${i}` }));
  const pool = routePool([{ provider: 'claude', models: [{ id: 'default', name: 'Default' }, { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5' }] }, { provider: 'opencode', models: many }], 12);
  assert.deepEqual(pool[0], { provider: 'claude', model: 'claude-sonnet-5-5', name: 'Sonnet 5.5' });
  assert.equal(pool.filter(p => p.provider === 'claude').length, 1);
  assert.equal(pool.filter(p => p.provider === 'opencode').length, 12);
  assert.deepEqual(routePool([]), []);
});

test('the router never gets a paid model: only sign-in agents or free models', () => {
  const pool = routePool([
    { provider: 'hermes', models: [{ id: 'openrouter:anthropic/claude-opus-5.5', name: 'Opus' }, { id: 'openrouter:dots/x:free', name: 'Dots free' }] },
    { provider: 'kilo', models: [{ id: 'openrouter/anthropic/claude-fable-5', name: 'Fable' }] },
    { provider: 'antigravity', models: [{ id: 'gemini-3.8-flash', name: 'Gemini Flash' }] },
    { provider: 'codex', models: [{ id: 'gpt-6-luna', name: 'GPT-6 Luna' }] },
  ]);
  assert.deepEqual(pool.map(p => p.model), ['openrouter:dots/x:free', 'gpt-6-luna']);
});

import { askUse } from '../src/hub/chats-facts.ts';

test('the Providers page says what Ask may use from each agent', () => {
  assert.deepEqual(askUse('claude', []), { kind: 'sign-in', free: 0 });
  assert.deepEqual(askUse('hermes', [{ id: 'openrouter:x:free', name: 'x' }, { id: 'openrouter:paid', name: 'p' }]), { kind: 'free', free: 1 });
  assert.deepEqual(askUse('kilo', [{ id: 'openrouter/paid', name: 'p' }]), { kind: 'skipped', free: 0 });
  assert.deepEqual(askUse('antigravity', [{ id: 'gemini', name: 'g' }]), { kind: 'fails', free: 0 });
});

import { dailyWork, modelShare, short } from '../src/hub/usage-facts.ts';

test('usage: work per day per agent, cache reads left out, old days dropped', () => {
  const now = new Date(2026, 10, 22, 15).getTime();
  const hour = (d, h) => new Date(2026, 10, d, h).getTime() / 3600_000;
  const ledger = { scannedAt: now, models: [{ provider: 'claude', name: 'Opus' }, { provider: 'codex', name: 'GPT' }], rows: [
    [hour(22, 9), 0, 100, 999999, 10, 5, 0, 0],
    [hour(22, 10), 1, 50, 0, 0, 50, 0, 0],
    [hour(21, 23), 0, 7, 0, 0, 0, 0, 0],
    [hour(1, 9), 0, 1000, 0, 0, 0, 0, 0],
  ] };
  const days = dailyWork(ledger, 3, now);
  assert.equal(days.length, 3);
  assert.deepEqual(days.map(d => [d.claude, d.codex]), [[0, 0], [7, 0], [115, 100]]);
  const share = modelShare(ledger, 7, now);
  assert.equal(share[0].name, 'Opus');
  assert.ok(Math.abs(share[0].share - 122 / 222) < 1e-9);
  assert.deepEqual(modelShare({ ...ledger, rows: [] }, 7, now), []);
  assert.equal(short(1234567), '1.2M');
});
