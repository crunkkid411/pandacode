// The Hub's Inbox rules (src/sc-hub/inbox-facts.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inboxItems } from '../src/sc-hub/inbox-facts.ts';

const rules = {
  stateOf: s => (s === 'running' ? 'working' : s === 'waiting' ? 'needs-you' : s === 'failed' ? 'failed' : 'idle'),
  seedFor: s => `mascot|${s.provider}|#000000|0|`,
  nameFor: p => ({ claude: 'Claude Code' }[p] ?? p),
};
const s = (id, extra) => ({ id, title: id, provider: 'claude', model: 'default', status: 'idle', archived: false, projectId: 'p', updatedAt: 100, lastResponseAt: 100, ...extra });

test('in the Inbox: waiting for you, failed, new replies; newest first within each', () => {
  const items = inboxItems([
    s('old', { updatedAt: 50, lastResponseAt: 50 }), // before the Inbox's first day
    s('reply', { updatedAt: 300, lastResponseAt: 300 }),
    s('reply2', { updatedAt: 400, lastResponseAt: 400 }),
    s('busy', { status: 'running', updatedAt: 500 }),
    s('stuck', { status: 'waiting', updatedAt: 200 }),
    s('broke', { status: 'failed', updatedAt: 250, lastResponseAt: null }),
    s('gone', { archived: true, updatedAt: 900 }),
    s('draft', { draft: true, updatedAt: 900 }),
    s('asked', { updatedAt: 300, lastResponseAt: null }), // he wrote, no answer yet
  ], [], {}, { since: 80, seen: {} }, rules);
  assert.deepEqual(items.map(i => [i.id, i.state]), [['stuck', 'needs-you'], ['broke', 'failed'], ['reply2', 'new'], ['reply', 'new']]);
  assert.equal(items[0].agentName, 'Claude Code');
});

test('read conversations leave until something new happens', () => {
  const sessions = [s('a', { updatedAt: 300, lastResponseAt: 300 })];
  assert.equal(inboxItems(sessions, [], {}, { since: 0, seen: { a: 300 } }, rules).length, 0);
  assert.equal(inboxItems(sessions, [], {}, { since: 0, seen: { a: 299 } }, rules).length, 1);
});

test('a conversation shows the agent that owns it: its thread, a task handed to it, or its folder', () => {
  const bots = [
    { id: 'b1', name: 'Chief of Staff', seed: 'mascot|claude|#e2774a|0|clipboard', desktopSession: 't1', projectId: 'bf1' },
    { id: 'b2', name: 'Clip Finder', seed: null, desktopSession: null, projectId: 'bf2' },
  ];
  const items = inboxItems([s('t1', { updatedAt: 300 }), s('task', { updatedAt: 290 }), s('run', { projectId: 'bf2', updatedAt: 280 }), s('mine', { updatedAt: 270 })],
    bots, { task: 'b1' }, { since: 0, seen: {} }, rules);
  assert.deepEqual(items.map(i => [i.id, i.agentId, i.agentName]), [['t1', 'b1', 'Chief of Staff'], ['task', 'b1', 'Chief of Staff'], ['run', 'b2', 'Clip Finder'], ['mine', null, 'Claude Code']]);
  assert.equal(items[3].seed, 'mascot|claude|#000000|0|');
});
