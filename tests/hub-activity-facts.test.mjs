// The Hub's Activity feed rules (src/sc-hub/activity-facts.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedRows } from '../src/sc-hub/activity-facts.ts';

test('activity: agent log and chats in one feed, newest first, each with a word and a color; unknown kinds say Note', () => {
  const bots = [{ id: 'b1', name: 'Chief of Staff', seed: 'x' }];
  const activity = { b1: [{ id: 1, kind: 'reply', summary: 'Hi Jordan', at: 300 }, { id: 2, kind: 'weird', summary: 'odd', at: 100 }] };
  const sessions = [{ id: 'c1', title: 'Fix build', agentName: 'Claude Code', seed: null, state: 'failed', at: 200 }];
  const rows = feedRows(bots, activity, sessions);
  assert.deepEqual(rows.map(r => [r.who, r.word, r.text]), [['Chief of Staff', 'Answered', 'Hi Jordan'], ['Claude Code', 'Failed', 'Fix build'], ['Chief of Staff', 'Note', 'odd']]);
  assert.equal(rows[1].sessionId, 'c1');
  assert.equal(rows[1].color, '#f87171');
  assert.equal(feedRows(bots, activity, sessions, 1).length, 1);
});
