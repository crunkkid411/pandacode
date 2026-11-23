// The chat box's mode order (src/sc-hub/mode-facts.ts): Shift+Tab follows Claude Code's own order and wraps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, modeLook, nextMode } from '../src/sc-hub/mode-facts.ts';

test('mode: Shift+Tab steps ask -> accept edits -> plan -> auto -> full access -> ask', () => {
  const seen = ['ask'];
  for (let i = 0; i < MODES.length; i++) seen.push(nextMode(seen.at(-1)));
  assert.deepEqual(seen, ['ask', 'auto', 'plan', 'review', 'full', 'ask']);
  assert.equal(nextMode('nonsense'), 'ask');
  assert.equal(modeLook('full').word, 'Full access');
  assert.equal(modeLook('unknown').word, 'Ask first');
});
