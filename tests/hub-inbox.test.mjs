// inbox.txt on the Hub's Inbox page (src/sc-hub/inbox.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseInbox } from '../src/sc-hub/inbox.ts';

test('waiting links with notes, comments skipped, done newest first', () => {
  const inbox = parseInbox([
    '# Double-click "Install Inbox" on the desktop', '# EXAMPLE | https://x - y', '',
    'https://github.com/a/b', 'https://github.com/c/d - for thumbnails', '', '=== DONE ===',
    '2026-11-11 | https://github.com/e/f | INSTALLED as skill "f" | use: make shorts',
    '2026-11-12 | https://github.com/g/h | INSTALLED as CLI "h" | use: h open <url> | prefer llms.txt',
  ].join('\r\n'));
  assert.deepEqual(inbox.waiting, [{ link: 'https://github.com/a/b', note: '' }, { link: 'https://github.com/c/d', note: 'for thumbnails' }]);
  assert.deepEqual(inbox.done.map(d => d.link), ['https://github.com/g/h', 'https://github.com/e/f']);
  assert.equal(inbox.done[0].what, 'INSTALLED as CLI "h"');
  assert.equal(inbox.done[0].use, 'h open <url> | prefer llms.txt');
});

test('an empty or missing inbox is empty', () => {
  assert.deepEqual(parseInbox(''), { waiting: [], done: [] });
});

test("Jordan's real inbox.txt parses", { skip: !existsSync('X:/AI-2/inbox.txt') }, () => {
  const inbox = parseInbox(readFileSync('X:/AI-2/inbox.txt', 'utf8'));
  assert.ok(inbox.waiting.every(w => /^https?:\/\//.test(w.link)), JSON.stringify(inbox.waiting));
  assert.ok(inbox.done.every(d => /^\d{4}-\d\d-\d\d$/.test(d.date) && d.link.startsWith('http')));
});
