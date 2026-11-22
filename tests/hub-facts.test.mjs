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
