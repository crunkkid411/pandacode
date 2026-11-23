// The chat box's mode order (src/sc-hub/mode-facts.ts): Shift+Tab follows Claude Code's own order and wraps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, modeLook, nextMode, startMode } from '../src/sc-hub/mode-facts.ts';

test('mode: a new Claude Code agent or chat starts in Auto; other harnesses keep their default', () => {
  assert.equal(startMode('claude', 'ask'), 'review');
  assert.equal(modeLook(startMode('claude', 'full')).word, 'Auto');
  assert.equal(startMode('codex', 'full'), 'full');
});

test('mode: Shift+Tab steps ask -> accept edits -> plan -> auto -> full access -> ask', () => {
  const seen = ['ask'];
  for (let i = 0; i < MODES.length; i++) seen.push(nextMode(seen.at(-1)));
  assert.deepEqual(seen, ['ask', 'auto', 'plan', 'review', 'full', 'ask']);
  assert.equal(nextMode('nonsense'), 'ask');
  assert.equal(modeLook('full').word, 'Full access');
  assert.equal(modeLook('unknown').word, 'Ask first');
});
