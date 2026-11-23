// The Hub's Connectors rules (src/sc-hub/connectors-facts.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkState } from '../src/sc-hub/connectors-facts.ts';

test('connectors: a connection reads as Connected, Starting, Off or Problem from what PandaCode wrote', () => {
  assert.equal(linkState({ enabled: true, status: 'Connected as @hj_bot' }), 'connected');
  assert.equal(linkState({ enabled: true, status: '' }), 'starting');
  assert.equal(linkState({ enabled: false, status: 'Connected as @hj_bot' }), 'off');
  assert.equal(linkState({ enabled: true, status: 'Off' }), 'off');
  assert.equal(linkState({ enabled: true, status: 'Telegram said: Unauthorized' }), 'problem');
});
