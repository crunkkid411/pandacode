// The Hub's Sessions and Projects rules (src/sc-hub/sessions-facts.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionRows, projectRows } from '../src/sc-hub/sessions-facts.ts';

const rules = {
  stateOf: s => (s === 'running' ? 'working' : s === 'waiting' ? 'needs-you' : s === 'failed' ? 'failed' : 'idle'),
  seedFor: s => `mascot|${s.provider}|#000000|0|`,
  nameFor: p => ({ claude: 'Claude Code' }[p] ?? p),
};
const s = (id, extra) => ({ id, title: id, provider: 'claude', model: 'default', status: 'idle', archived: false, projectId: 'p1', updatedAt: 100, lastResponseAt: 100, ...extra });
const projects = [{ id: 'p1', name: 'pandacode', path: 'X:/pandacode' }, { id: 'p2', name: 'becky', path: 'X:/becky' }];
const bots = [{ id: 'b1', name: 'Chief of Staff', seed: 'cos', desktopSession: 'mine', projectId: 'p2' }];

test('sessions: waiting on Jordan first, then working, failed, done; archived and drafts left out; owner and project named', () => {
  const rows = sessionRows([
    s('done', { updatedAt: 900 }), s('run', { status: 'running', updatedAt: 200 }), s('wait', { status: 'waiting', updatedAt: 100 }),
    s('bad', { status: 'failed' }), s('gone', { archived: true }), s('draft', { draft: true }), s('mine', { projectId: 'p2' }),
  ], projects, bots, {}, rules);
  assert.deepEqual(rows.map(r => r.id), ['wait', 'run', 'bad', 'done', 'mine']);
  const mine = rows.find(r => r.id === 'mine');
  assert.equal(mine.agentName, 'Chief of Staff');
  assert.equal(mine.projectName, 'becky');
  assert.equal(rows[0].agentName, 'Claude Code');
});

test('projects: counts per folder and the agents working there; busiest first', () => {
  const rows = sessionRows([s('a', { status: 'running', updatedAt: 50 }), s('b', { status: 'failed', updatedAt: 60 }), s('mine', { projectId: 'p2', updatedAt: 999 })], projects, bots, {}, rules);
  const out = projectRows(projects, rows, bots);
  assert.deepEqual(out.map(p => p.name), ['becky', 'pandacode']);
  assert.deepEqual([out[1].sessions, out[1].working, out[1].failed, out[1].needsYou], [2, 1, 1, 0]);
  assert.deepEqual(out[0].agents.map(a => a.name), ['Chief of Staff']);
});
